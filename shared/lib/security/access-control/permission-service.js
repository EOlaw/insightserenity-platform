'use strict';

/**
 * @fileoverview Permission management service for CRUD operations and permission checks
 * @module shared/lib/security/access-control/permission-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/permission-model
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class PermissionService
 * @description Manages permissions including creation, retrieval, updates, and validation
 */
class PermissionService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #PERMISSION_EFFECTS = {
    ALLOW: 'allow',
    DENY: 'deny'
  };

  static #PERMISSION_TYPES = {
    RESOURCE: 'resource',
    OPERATION: 'operation',
    DATA: 'data',
    FIELD: 'field'
  };

  static #RESERVED_ACTIONS = [
    'create', 'read', 'update', 'delete', 'list',
    'execute', 'approve', 'publish', 'archive'
  ];

  static #WILDCARD = '*';
  static #SEPARATOR = ':';
  static #MAX_PERMISSION_DEPTH = 5;

  /**
   * Creates an instance of PermissionService
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {boolean} [options.cacheEnabled=true] - Enable permission caching
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [options.validateOnCreate=true] - Validate permissions on creation
   * @param {Array<string>} [options.customActions=[]] - Additional allowed actions
   */
  constructor(options = {}) {
    const {
      database,
      cacheEnabled = true,
      cacheTTL = 300000,
      validateOnCreate = true,
      customActions = []
    } = options;

    this.database = database;
    this.cacheEnabled = cacheEnabled;
    this.cacheTTL = cacheTTL;
    this.validateOnCreate = validateOnCreate;
    
    // Combine reserved and custom actions
    this.allowedActions = [
      ...PermissionService.#RESERVED_ACTIONS,
      ...customActions
    ];

    // Initialize cache
    this.permissionCache = new Map();
    this.rolePermissionCache = new Map();

    // Initialize in-memory store for non-database mode
    this.inMemoryPermissions = new Map();
    this.inMemoryRolePermissions = new Map();
    this.inMemoryUserPermissions = new Map();

    logger.info('PermissionService initialized', {
      cacheEnabled,
      validateOnCreate,
      customActionsCount: customActions.length
    });
  }

  /**
   * Creates a new permission
   * @param {Object} permissionData - Permission data
   * @param {string} permissionData.name - Permission name
   * @param {string} permissionData.resource - Resource identifier
   * @param {string} permissionData.action - Action identifier
   * @param {string} [permissionData.effect='allow'] - Permission effect
   * @param {Object} [permissionData.conditions] - Permission conditions
   * @param {Object} [permissionData.metadata] - Additional metadata
   * @returns {Promise<Object>} Created permission
   * @throws {AppError} If creation fails
   */
  async createPermission(permissionData) {
    try {
      // Validate required fields
      if (!permissionData.name || !permissionData.resource || !permissionData.action) {
        throw new AppError(
          'Name, resource, and action are required',
          400,
          'INVALID_PERMISSION_DATA'
        );
      }

      // Set defaults
      const permission = {
        id: this.#generatePermissionId(),
        name: permissionData.name,
        resource: permissionData.resource,
        action: permissionData.action,
        effect: permissionData.effect || PermissionService.#PERMISSION_EFFECTS.ALLOW,
        type: permissionData.type || PermissionService.#PERMISSION_TYPES.RESOURCE,
        conditions: permissionData.conditions || {},
        metadata: {
          ...permissionData.metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        },
        active: true
      };

      // Validate permission
      if (this.validateOnCreate) {
        this.#validatePermission(permission);
      }

      // Check for duplicates
      const existingKey = this.#getPermissionKey(permission);
      if (await this.#permissionExists(existingKey)) {
        throw new AppError(
          'Permission already exists',
          409,
          'PERMISSION_EXISTS',
          { key: existingKey }
        );
      }

      // Store permission
      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        await PermissionModel.create(permission);
      } else {
        this.inMemoryPermissions.set(permission.id, permission);
      }

      // Clear cache
      this.#clearCache();

      logger.info('Permission created', {
        permissionId: permission.id,
        resource: permission.resource,
        action: permission.action
      });

      return permission;

    } catch (error) {
      logger.error('Permission creation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create permission',
        500,
        'PERMISSION_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets a permission by ID
   * @param {string} permissionId - Permission identifier
   * @returns {Promise<Object|null>} Permission object or null
   * @throws {AppError} If retrieval fails
   */
  async getPermission(permissionId) {
    try {
      if (!permissionId) {
        throw new AppError('Permission ID is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      if (this.cacheEnabled && this.permissionCache.has(permissionId)) {
        const cached = this.permissionCache.get(permissionId);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      let permission;

      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        permission = await PermissionModel.findOne({ id: permissionId });
      } else {
        permission = this.inMemoryPermissions.get(permissionId);
      }

      // Cache result
      if (this.cacheEnabled && permission) {
        this.permissionCache.set(permissionId, {
          data: permission,
          timestamp: Date.now()
        });
      }

      return permission || null;

    } catch (error) {
      logger.error('Permission retrieval failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get permission',
        500,
        'PERMISSION_GET_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates a permission
   * @param {string} permissionId - Permission identifier
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated permission
   * @throws {AppError} If update fails
   */
  async updatePermission(permissionId, updates) {
    try {
      if (!permissionId) {
        throw new AppError('Permission ID is required', 400, 'INVALID_INPUT');
      }

      const permission = await this.getPermission(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Prepare updated permission
      const updatedPermission = {
        ...permission,
        ...updates,
        id: permission.id, // Prevent ID change
        metadata: {
          ...permission.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
          version: (permission.metadata.version || 0) + 1
        }
      };

      // Validate if needed
      if (this.validateOnCreate && (updates.resource || updates.action)) {
        this.#validatePermission(updatedPermission);
      }

      // Update storage
      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        await PermissionModel.updateOne(
          { id: permissionId },
          updatedPermission
        );
      } else {
        this.inMemoryPermissions.set(permissionId, updatedPermission);
      }

      // Clear cache
      this.#clearCache();

      logger.info('Permission updated', {
        permissionId,
        version: updatedPermission.metadata.version
      });

      return updatedPermission;

    } catch (error) {
      logger.error('Permission update failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to update permission',
        500,
        'PERMISSION_UPDATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Deletes a permission
   * @param {string} permissionId - Permission identifier
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deletePermission(permissionId) {
    try {
      if (!permissionId) {
        throw new AppError('Permission ID is required', 400, 'INVALID_INPUT');
      }

      const permission = await this.getPermission(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Check if permission is in use
      const usage = await this.#checkPermissionUsage(permissionId);
      if (usage.inUse) {
        throw new AppError(
          'Cannot delete permission in use',
          409,
          'PERMISSION_IN_USE',
          { usage }
        );
      }

      // Delete permission
      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        await PermissionModel.deleteOne({ id: permissionId });
      } else {
        this.inMemoryPermissions.delete(permissionId);
      }

      // Clear cache
      this.#clearCache();

      logger.info('Permission deleted', { permissionId });

      return {
        success: true,
        deletedPermission: permission
      };

    } catch (error) {
      logger.error('Permission deletion failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to delete permission',
        500,
        'PERMISSION_DELETE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists permissions with optional filtering
   * @param {Object} [options={}] - List options
   * @param {string} [options.resource] - Filter by resource
   * @param {string} [options.action] - Filter by action
   * @param {string} [options.effect] - Filter by effect
   * @param {boolean} [options.active=true] - Include only active permissions
   * @param {number} [options.limit=100] - Maximum results
   * @param {number} [options.offset=0] - Skip results
   * @returns {Promise<Object>} List results
   */
  async listPermissions(options = {}) {
    try {
      const {
        resource,
        action,
        effect,
        active = true,
        limit = 100,
        offset = 0
      } = options;

      let permissions;
      let total;

      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        const query = {};

        if (resource) query.resource = resource;
        if (action) query.action = action;
        if (effect) query.effect = effect;
        if (active !== undefined) query.active = active;

        total = await PermissionModel.countDocuments(query);
        permissions = await PermissionModel.find(query)
          .skip(offset)
          .limit(limit)
          .sort({ 'metadata.createdAt': -1 });

      } else {
        permissions = Array.from(this.inMemoryPermissions.values())
          .filter(p => {
            if (resource && p.resource !== resource) return false;
            if (action && p.action !== action) return false;
            if (effect && p.effect !== effect) return false;
            if (active !== undefined && p.active !== active) return false;
            return true;
          });

        total = permissions.length;
        permissions = permissions.slice(offset, offset + limit);
      }

      return {
        permissions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + permissions.length < total
        }
      };

    } catch (error) {
      logger.error('Permission listing failed', error);

      throw new AppError(
        'Failed to list permissions',
        500,
        'PERMISSION_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Assigns a permission to a role
   * @param {string} roleId - Role identifier
   * @param {string} permissionId - Permission identifier
   * @param {Object} [options={}] - Assignment options
   * @returns {Promise<Object>} Assignment result
   */
  async assignPermissionToRole(roleId, permissionId, options = {}) {
    try {
      if (!roleId || !permissionId) {
        throw new AppError(
          'Role ID and permission ID are required',
          400,
          'INVALID_INPUT'
        );
      }

      // Verify permission exists
      const permission = await this.getPermission(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Check if already assigned
      const key = `${roleId}:${permissionId}`;
      if (this.database) {
        const RolePermissionModel = require('../../database/models/role-permission-model');
        const existing = await RolePermissionModel.findOne({ roleId, permissionId });
        
        if (existing) {
          throw new AppError(
            'Permission already assigned to role',
            409,
            'PERMISSION_ALREADY_ASSIGNED'
          );
        }

        // Create assignment
        await RolePermissionModel.create({
          roleId,
          permissionId,
          assignedAt: new Date(),
          assignedBy: options.assignedBy || 'system',
          metadata: options.metadata || {}
        });

      } else {
        if (!this.inMemoryRolePermissions.has(roleId)) {
          this.inMemoryRolePermissions.set(roleId, new Set());
        }
        
        const rolePermissions = this.inMemoryRolePermissions.get(roleId);
        if (rolePermissions.has(permissionId)) {
          throw new AppError(
            'Permission already assigned to role',
            409,
            'PERMISSION_ALREADY_ASSIGNED'
          );
        }
        
        rolePermissions.add(permissionId);
      }

      // Clear cache
      this.#clearRoleCache(roleId);

      logger.info('Permission assigned to role', { roleId, permissionId });

      return {
        success: true,
        roleId,
        permissionId,
        permission
      };

    } catch (error) {
      logger.error('Permission assignment failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to assign permission',
        500,
        'PERMISSION_ASSIGN_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Removes a permission from a role
   * @param {string} roleId - Role identifier
   * @param {string} permissionId - Permission identifier
   * @returns {Promise<Object>} Removal result
   */
  async removePermissionFromRole(roleId, permissionId) {
    try {
      if (!roleId || !permissionId) {
        throw new AppError(
          'Role ID and permission ID are required',
          400,
          'INVALID_INPUT'
        );
      }

      if (this.database) {
        const RolePermissionModel = require('../../database/models/role-permission-model');
        const result = await RolePermissionModel.deleteOne({ roleId, permissionId });
        
        if (result.deletedCount === 0) {
          throw new AppError(
            'Permission not assigned to role',
            404,
            'ASSIGNMENT_NOT_FOUND'
          );
        }

      } else {
        const rolePermissions = this.inMemoryRolePermissions.get(roleId);
        if (!rolePermissions || !rolePermissions.has(permissionId)) {
          throw new AppError(
            'Permission not assigned to role',
            404,
            'ASSIGNMENT_NOT_FOUND'
          );
        }
        
        rolePermissions.delete(permissionId);
      }

      // Clear cache
      this.#clearRoleCache(roleId);

      logger.info('Permission removed from role', { roleId, permissionId });

      return {
        success: true,
        roleId,
        permissionId
      };

    } catch (error) {
      logger.error('Permission removal failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to remove permission',
        500,
        'PERMISSION_REMOVE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets all permissions for a role
   * @param {string} roleId - Role identifier
   * @returns {Promise<Array>} Role permissions
   */
  async getRolePermissions(roleId) {
    try {
      if (!roleId) {
        throw new AppError('Role ID is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      if (this.cacheEnabled && this.rolePermissionCache.has(roleId)) {
        const cached = this.rolePermissionCache.get(roleId);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      let permissions = [];

      if (this.database) {
        const RolePermissionModel = require('../../database/models/role-permission-model');
        const assignments = await RolePermissionModel.find({ roleId });
        
        // Fetch full permission details
        for (const assignment of assignments) {
          const permission = await this.getPermission(assignment.permissionId);
          if (permission) {
            permissions.push(permission);
          }
        }

      } else {
        const permissionIds = this.inMemoryRolePermissions.get(roleId) || new Set();
        for (const permissionId of permissionIds) {
          const permission = this.inMemoryPermissions.get(permissionId);
          if (permission) {
            permissions.push(permission);
          }
        }
      }

      // Cache result
      if (this.cacheEnabled) {
        this.rolePermissionCache.set(roleId, {
          data: permissions,
          timestamp: Date.now()
        });
      }

      return permissions;

    } catch (error) {
      logger.error('Failed to get role permissions', error);

      throw new AppError(
        'Failed to get role permissions',
        500,
        'ROLE_PERMISSIONS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Assigns a permission directly to a user
   * @param {string} userId - User identifier
   * @param {string} permissionId - Permission identifier
   * @param {Object} [options={}] - Assignment options
   * @returns {Promise<Object>} Assignment result
   */
  async assignPermissionToUser(userId, permissionId, options = {}) {
    try {
      if (!userId || !permissionId) {
        throw new AppError(
          'User ID and permission ID are required',
          400,
          'INVALID_INPUT'
        );
      }

      // Verify permission exists
      const permission = await this.getPermission(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      if (this.database) {
        const UserPermissionModel = require('..\..\..\..\servers\admin-server\modules\user-management\models\user-permission-model');
        const existing = await UserPermissionModel.findOne({ userId, permissionId });
        
        if (existing) {
          throw new AppError(
            'Permission already assigned to user',
            409,
            'PERMISSION_ALREADY_ASSIGNED'
          );
        }

        await UserPermissionModel.create({
          userId,
          permissionId,
          assignedAt: new Date(),
          assignedBy: options.assignedBy || 'system',
          expiresAt: options.expiresAt,
          metadata: options.metadata || {}
        });

      } else {
        if (!this.inMemoryUserPermissions.has(userId)) {
          this.inMemoryUserPermissions.set(userId, new Set());
        }
        
        const userPermissions = this.inMemoryUserPermissions.get(userId);
        userPermissions.add(permissionId);
      }

      logger.info('Permission assigned to user', { userId, permissionId });

      return {
        success: true,
        userId,
        permissionId,
        permission
      };

    } catch (error) {
      logger.error('User permission assignment failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to assign permission to user',
        500,
        'USER_PERMISSION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets direct permissions for a user
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} User permissions
   */
  async getUserPermissions(userId) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_INPUT');
      }

      let permissions = [];

      if (this.database) {
        const UserPermissionModel = require('..\..\..\..\servers\admin-server\modules\user-management\models\user-permission-model');
        const assignments = await UserPermissionModel.find({ 
          userId,
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        });
        
        for (const assignment of assignments) {
          const permission = await this.getPermission(assignment.permissionId);
          if (permission) {
            permissions.push({
              ...permission,
              assignedAt: assignment.assignedAt,
              expiresAt: assignment.expiresAt
            });
          }
        }

      } else {
        const permissionIds = this.inMemoryUserPermissions.get(userId) || new Set();
        for (const permissionId of permissionIds) {
          const permission = this.inMemoryPermissions.get(permissionId);
          if (permission) {
            permissions.push(permission);
          }
        }
      }

      return permissions;

    } catch (error) {
      logger.error('Failed to get user permissions', error);

      throw new AppError(
        'Failed to get user permissions',
        500,
        'USER_PERMISSIONS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates permissions configuration
   * @returns {Promise<Object>} Validation results
   */
  async validatePermissions() {
    try {
      const results = {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          total: 0,
          active: 0,
          inactive: 0,
          byEffect: {},
          byResource: {}
        }
      };

      // Get all permissions
      const { permissions } = await this.listPermissions({ active: undefined });
      results.stats.total = permissions.length;

      for (const permission of permissions) {
        // Count statistics
        if (permission.active) {
          results.stats.active++;
        } else {
          results.stats.inactive++;
        }

        results.stats.byEffect[permission.effect] = 
          (results.stats.byEffect[permission.effect] || 0) + 1;

        results.stats.byResource[permission.resource] = 
          (results.stats.byResource[permission.resource] || 0) + 1;

        // Validate permission structure
        try {
          this.#validatePermission(permission);
        } catch (error) {
          results.valid = false;
          results.errors.push({
            permissionId: permission.id,
            error: error.message
          });
        }

        // Check for conflicts
        const conflicts = await this.#checkPermissionConflicts(permission);
        if (conflicts.length > 0) {
          results.warnings.push({
            permissionId: permission.id,
            warning: 'Permission conflicts detected',
            conflicts
          });
        }
      }

      // Check for orphaned assignments
      const orphaned = await this.#checkOrphanedAssignments();
      if (orphaned.length > 0) {
        results.warnings.push({
          type: 'orphaned-assignments',
          count: orphaned.length,
          details: orphaned
        });
      }

      logger.info('Permission validation completed', {
        valid: results.valid,
        errorCount: results.errors.length,
        warningCount: results.warnings.length
      });

      return results;

    } catch (error) {
      logger.error('Permission validation failed', error);

      throw new AppError(
        'Failed to validate permissions',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if a specific permission exists
   * @param {string} permissionIdOrKey - Permission ID or key
   * @returns {Promise<boolean>} True if exists
   */
  async permissionExists(permissionIdOrKey) {
    try {
      if (this.database) {
        const PermissionModel = require('..\..\database\models\users\permission-model');
        const exists = await PermissionModel.exists({
          $or: [
            { id: permissionIdOrKey },
            { key: permissionIdOrKey }
          ]
        });
        return !!exists;
      } else {
        // Check by ID
        if (this.inMemoryPermissions.has(permissionIdOrKey)) {
          return true;
        }
        
        // Check by key
        for (const permission of this.inMemoryPermissions.values()) {
          if (this.#getPermissionKey(permission) === permissionIdOrKey) {
            return true;
          }
        }
        
        return false;
      }
    } catch (error) {
      logger.error('Permission existence check failed', error);
      return false;
    }
  }

  /**
   * Creates a permission key from components
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @param {string} [effect='allow'] - Permission effect
   * @returns {string} Permission key
   */
  createPermissionKey(resource, action, effect = 'allow') {
    return `${resource}${PermissionService.#SEPARATOR}${action}${PermissionService.#SEPARATOR}${effect}`;
  }

  /**
   * Parses a permission key
   * @param {string} key - Permission key
   * @returns {Object} Parsed components
   */
  parsePermissionKey(key) {
    const parts = key.split(PermissionService.#SEPARATOR);
    
    if (parts.length < 2) {
      throw new AppError('Invalid permission key format', 400, 'INVALID_KEY');
    }

    return {
      resource: parts[0],
      action: parts[1],
      effect: parts[2] || 'allow'
    };
  }

  /**
   * Validates permission structure
   * @private
   * @param {Object} permission - Permission to validate
   * @throws {AppError} If validation fails
   */
  #validatePermission(permission) {
    // Validate effect
    if (!Object.values(PermissionService.#PERMISSION_EFFECTS).includes(permission.effect)) {
      throw new AppError(
        'Invalid permission effect',
        400,
        'INVALID_EFFECT',
        { effect: permission.effect }
      );
    }

    // Validate type
    if (permission.type && 
        !Object.values(PermissionService.#PERMISSION_TYPES).includes(permission.type)) {
      throw new AppError(
        'Invalid permission type',
        400,
        'INVALID_TYPE',
        { type: permission.type }
      );
    }

    // Validate resource format
    if (!permission.resource || permission.resource.length === 0) {
      throw new AppError('Resource cannot be empty', 400, 'INVALID_RESOURCE');
    }

    // Validate action
    if (!permission.action || permission.action.length === 0) {
      throw new AppError('Action cannot be empty', 400, 'INVALID_ACTION');
    }

    // Validate resource depth
    const resourceDepth = permission.resource.split(PermissionService.#SEPARATOR).length;
    if (resourceDepth > PermissionService.#MAX_PERMISSION_DEPTH) {
      throw new AppError(
        'Resource depth exceeds maximum',
        400,
        'RESOURCE_TOO_DEEP',
        { depth: resourceDepth, max: PermissionService.#MAX_PERMISSION_DEPTH }
      );
    }

    // Validate conditions if present
    if (permission.conditions && typeof permission.conditions !== 'object') {
      throw new AppError('Conditions must be an object', 400, 'INVALID_CONDITIONS');
    }
  }

  /**
   * Checks if permission exists
   * @private
   * @param {string} key - Permission key
   * @returns {Promise<boolean>} True if exists
   */
  async #permissionExists(key) {
    return this.permissionExists(key);
  }

  /**
   * Gets permission key
   * @private
   * @param {Object} permission - Permission object
   * @returns {string} Permission key
   */
  #getPermissionKey(permission) {
    return this.createPermissionKey(
      permission.resource,
      permission.action,
      permission.effect
    );
  }

  /**
   * Checks permission usage
   * @private
   * @param {string} permissionId - Permission identifier
   * @returns {Promise<Object>} Usage information
   */
  async #checkPermissionUsage(permissionId) {
    const usage = {
      inUse: false,
      roles: [],
      users: []
    };

    if (this.database) {
      const RolePermissionModel = require('../../database/models/role-permission-model');
      const UserPermissionModel = require('..\..\..\..\servers\admin-server\modules\user-management\models\user-permission-model');

      const roleAssignments = await RolePermissionModel.find({ permissionId });
      const userAssignments = await UserPermissionModel.find({ permissionId });

      usage.roles = roleAssignments.map(a => a.roleId);
      usage.users = userAssignments.map(a => a.userId);
      usage.inUse = roleAssignments.length > 0 || userAssignments.length > 0;

    } else {
      // Check in-memory assignments
      for (const [roleId, permissions] of this.inMemoryRolePermissions) {
        if (permissions.has(permissionId)) {
          usage.roles.push(roleId);
        }
      }

      for (const [userId, permissions] of this.inMemoryUserPermissions) {
        if (permissions.has(permissionId)) {
          usage.users.push(userId);
        }
      }

      usage.inUse = usage.roles.length > 0 || usage.users.length > 0;
    }

    return usage;
  }

  /**
   * Checks for permission conflicts
   * @private
   * @param {Object} permission - Permission to check
   * @returns {Promise<Array>} Conflicting permissions
   */
  async #checkPermissionConflicts(permission) {
    const conflicts = [];
    const { permissions } = await this.listPermissions({
      resource: permission.resource,
      action: permission.action
    });

    for (const other of permissions) {
      if (other.id !== permission.id && other.effect !== permission.effect) {
        conflicts.push({
          permissionId: other.id,
          reason: 'Conflicting effect on same resource/action',
          details: {
            thisEffect: permission.effect,
            otherEffect: other.effect
          }
        });
      }
    }

    return conflicts;
  }

  /**
   * Checks for orphaned assignments
   * @private
   * @returns {Promise<Array>} Orphaned assignments
   */
  async #checkOrphanedAssignments() {
    const orphaned = [];

    if (this.database) {
      const RolePermissionModel = require('../../database/models/role-permission-model');
      const assignments = await RolePermissionModel.find({});

      for (const assignment of assignments) {
        const permissionExists = await this.permissionExists(assignment.permissionId);
        if (!permissionExists) {
          orphaned.push({
            type: 'role-permission',
            roleId: assignment.roleId,
            permissionId: assignment.permissionId
          });
        }
      }
    }

    return orphaned;
  }

  /**
   * Generates permission ID
   * @private
   * @returns {string} Permission identifier
   */
  #generatePermissionId() {
    return `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clears all caches
   * @private
   */
  #clearCache() {
    this.permissionCache.clear();
    this.rolePermissionCache.clear();
  }

  /**
   * Clears role-specific cache
   * @private
   * @param {string} roleId - Role identifier
   */
  #clearRoleCache(roleId) {
    this.rolePermissionCache.delete(roleId);
  }

  /**
   * Exports permissions configuration
   * @returns {Promise<Array>} Exported permissions
   */
  async exportPermissions() {
    const { permissions } = await this.listPermissions({ 
      active: undefined,
      limit: Number.MAX_SAFE_INTEGER 
    });

    return permissions.map(p => ({
      name: p.name,
      resource: p.resource,
      action: p.action,
      effect: p.effect,
      type: p.type,
      conditions: p.conditions,
      metadata: p.metadata,
      active: p.active
    }));
  }

  /**
   * Imports permissions configuration
   * @param {Array} permissions - Permissions to import
   * @param {Object} [options={}] - Import options
   * @returns {Promise<Object>} Import results
   */
  async importPermissions(permissions, options = {}) {
    const { merge = false } = options;
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const permission of permissions) {
      try {
        await this.createPermission(permission);
        results.imported++;
      } catch (error) {
        if (error.code === 'PERMISSION_EXISTS' && merge) {
          results.skipped++;
        } else {
          results.errors.push({
            permission: permission.name,
            error: error.message
          });
        }
      }
    }

    logger.info('Permissions imported', results);

    return results;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.#clearCache();
    logger.info('PermissionService cleanup completed');
  }
}

module.exports = PermissionService;