'use strict';

/**
 * @fileoverview Role management service for creation, hierarchy, and inheritance
 * @module shared/lib/security/access-control/role-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/role-model
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');

/**
 * @class RoleService
 * @description Manages roles including creation, hierarchy, inheritance, and validation
 */
class RoleService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #ROLE_TYPES = {
    SYSTEM: 'system',
    ORGANIZATION: 'organization',
    CUSTOM: 'custom',
    TEMPORARY: 'temporary'
  };

  static #SYSTEM_ROLES = {
    SUPER_ADMIN: 'super-admin',
    ADMIN: 'admin',
    USER: 'user',
    GUEST: 'guest'
  };

  static #RESERVED_ROLE_NAMES = [
    'super-admin', 'admin', 'user', 'guest', 'root', 'system',
    'administrator', 'moderator', 'owner', 'member'
  ];

  static #MAX_INHERITANCE_DEPTH = 10;
  static #MAX_ROLE_NAME_LENGTH = 50;
  static #ROLE_NAME_PATTERN = /^[a-zA-Z0-9-_]+$/;
  static #CACHE_TTL = 300000; // 5 minutes

  /**
   * Creates an instance of RoleService
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {boolean} [options.enableCache=true] - Enable role caching
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [options.allowCustomRoles=true] - Allow custom role creation
   * @param {boolean} [options.enforceHierarchy=true] - Enforce role hierarchy rules
   * @param {Array<Object>} [options.predefinedRoles=[]] - Predefined roles to initialize
   */
  constructor(options = {}) {
    const {
      database,
      enableCache = true,
      cacheTTL = RoleService.#CACHE_TTL,
      allowCustomRoles = true,
      enforceHierarchy = true,
      predefinedRoles = []
    } = options;

    this.database = database;
    this.enableCache = enableCache;
    this.cacheTTL = cacheTTL;
    this.allowCustomRoles = allowCustomRoles;
    this.enforceHierarchy = enforceHierarchy;

    // Initialize caches
    this.roleCache = new Map();
    this.hierarchyCache = new Map();
    this.inheritanceCache = new Map();

    // Initialize in-memory storage
    this.inMemoryRoles = new Map();
    this.inMemoryHierarchy = new Map();

    // Initialize system roles
    this.#initializeSystemRoles();

    // Load predefined roles
    if (predefinedRoles.length > 0) {
      this.#loadPredefinedRoles(predefinedRoles);
    }

    logger.info('RoleService initialized', {
      enableCache,
      allowCustomRoles,
      enforceHierarchy,
      predefinedRolesCount: predefinedRoles.length
    });
  }

  /**
   * Creates a new role
   * @param {Object} roleData - Role data
   * @param {string} roleData.name - Role name
   * @param {string} [roleData.displayName] - Display name
   * @param {string} [roleData.description] - Role description
   * @param {string} [roleData.type='custom'] - Role type
   * @param {Array<string>} [roleData.inherits=[]] - Roles to inherit from
   * @param {number} [roleData.priority=100] - Role priority
   * @param {Object} [roleData.metadata={}] - Additional metadata
   * @returns {Promise<Object>} Created role
   * @throws {AppError} If creation fails
   */
  async createRole(roleData) {
    try {
      // Validate required fields
      if (!roleData.name) {
        throw new AppError('Role name is required', 400, 'INVALID_ROLE_DATA');
      }

      // Normalize and validate name
      const normalizedName = roleData.name.toLowerCase().trim();
      this.#validateRoleName(normalizedName);

      // Check if role already exists
      if (await this.roleExists(normalizedName)) {
        throw new AppError(
          'Role already exists',
          409,
          'ROLE_EXISTS',
          { roleName: normalizedName }
        );
      }

      // Check if custom roles are allowed
      const roleType = roleData.type || RoleService.#ROLE_TYPES.CUSTOM;
      if (roleType === RoleService.#ROLE_TYPES.CUSTOM && !this.allowCustomRoles) {
        throw new AppError(
          'Custom role creation is not allowed',
          403,
          'CUSTOM_ROLES_DISABLED'
        );
      }

      // Validate inheritance
      if (roleData.inherits && roleData.inherits.length > 0) {
        await this.#validateInheritance(normalizedName, roleData.inherits);
      }

      // Create role object
      const role = {
        id: this.#generateRoleId(),
        name: normalizedName,
        displayName: roleData.displayName || this.#formatDisplayName(normalizedName),
        description: roleData.description || '',
        type: roleType,
        inherits: roleData.inherits || [],
        priority: roleData.priority || 100,
        active: true,
        metadata: {
          ...roleData.metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: roleData.metadata?.createdBy || 'system',
          version: 1
        }
      };

      // Store role
      if (this.database) {
        const RoleModel = require('../../database/models/users/role-model');
        await RoleModel.create(role);
      } else {
        this.inMemoryRoles.set(role.id, role);
        this.inMemoryRoles.set(role.name, role); // Also index by name
      }

      // Update hierarchy if needed
      if (role.inherits.length > 0) {
        await this.#updateHierarchy(role);
      }

      // Clear caches
      this.#clearCache();

      logger.info('Role created', {
        roleId: role.id,
        roleName: role.name,
        type: role.type
      });

      return role;

    } catch (error) {
      logger.error('Role creation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create role',
        500,
        'ROLE_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets a role by ID or name
   * @param {string} roleIdentifier - Role ID or name
   * @returns {Promise<Object|null>} Role object or null
   * @throws {AppError} If retrieval fails
   */
  async getRole(roleIdentifier) {
    try {
      if (!roleIdentifier) {
        throw new AppError('Role identifier is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      if (this.enableCache && this.roleCache.has(roleIdentifier)) {
        const cached = this.roleCache.get(roleIdentifier);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      let role;

      if (this.database) {
        const RoleModel = require('../../database/models/users/role-model');
        role = await RoleModel.findOne({
          $or: [
            { id: roleIdentifier },
            { name: roleIdentifier.toLowerCase() }
          ]
        });
      } else {
        role = this.inMemoryRoles.get(roleIdentifier) || 
               this.inMemoryRoles.get(roleIdentifier.toLowerCase());
      }

      // Cache result
      if (this.enableCache && role) {
        this.roleCache.set(roleIdentifier, {
          data: role,
          timestamp: Date.now()
        });
        // Also cache by the other identifier
        this.roleCache.set(role.id === roleIdentifier ? role.name : role.id, {
          data: role,
          timestamp: Date.now()
        });
      }

      return role || null;

    } catch (error) {
      logger.error('Role retrieval failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get role',
        500,
        'ROLE_GET_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates a role
   * @param {string} roleIdentifier - Role ID or name
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated role
   * @throws {AppError} If update fails
   */
  async updateRole(roleIdentifier, updates) {
    try {
      if (!roleIdentifier) {
        throw new AppError('Role identifier is required', 400, 'INVALID_INPUT');
      }

      const role = await this.getRole(roleIdentifier);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Prevent updating system roles
      if (role.type === RoleService.#ROLE_TYPES.SYSTEM) {
        throw new AppError(
          'System roles cannot be updated',
          403,
          'SYSTEM_ROLE_IMMUTABLE'
        );
      }

      // Validate name if being updated
      if (updates.name && updates.name !== role.name) {
        const normalizedName = updates.name.toLowerCase().trim();
        this.#validateRoleName(normalizedName);
        
        if (await this.roleExists(normalizedName)) {
          throw new AppError(
            'Role name already exists',
            409,
            'ROLE_NAME_EXISTS'
          );
        }
        updates.name = normalizedName;
      }

      // Validate inheritance if being updated
      if (updates.inherits) {
        await this.#validateInheritance(
          updates.name || role.name,
          updates.inherits
        );
      }

      // Prepare updated role
      const updatedRole = {
        ...role,
        ...updates,
        id: role.id, // Prevent ID change
        type: role.type, // Prevent type change
        metadata: {
          ...role.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
          version: (role.metadata.version || 0) + 1
        }
      };

      // Update storage
      if (this.database) {
        const RoleModel = require('../../database/models/users/role-model');
        await RoleModel.updateOne({ id: role.id }, updatedRole);
      } else {
        // Update both ID and name indexes
        if (role.name !== updatedRole.name) {
          this.inMemoryRoles.delete(role.name);
          this.inMemoryRoles.set(updatedRole.name, updatedRole);
        }
        this.inMemoryRoles.set(updatedRole.id, updatedRole);
      }

      // Update hierarchy if inheritance changed
      if (updates.inherits) {
        await this.#updateHierarchy(updatedRole);
      }

      // Clear caches
      this.#clearCache();

      logger.info('Role updated', {
        roleId: role.id,
        version: updatedRole.metadata.version
      });

      return updatedRole;

    } catch (error) {
      logger.error('Role update failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to update role',
        500,
        'ROLE_UPDATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Deletes a role
   * @param {string} roleIdentifier - Role ID or name
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deleteRole(roleIdentifier) {
    try {
      if (!roleIdentifier) {
        throw new AppError('Role identifier is required', 400, 'INVALID_INPUT');
      }

      const role = await this.getRole(roleIdentifier);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Prevent deleting system roles
      if (role.type === RoleService.#ROLE_TYPES.SYSTEM) {
        throw new AppError(
          'System roles cannot be deleted',
          403,
          'SYSTEM_ROLE_PROTECTED'
        );
      }

      // Check if role is in use
      const usage = await this.#checkRoleUsage(role.id);
      if (usage.inUse) {
        throw new AppError(
          'Cannot delete role in use',
          409,
          'ROLE_IN_USE',
          { usage }
        );
      }

      // Check if role is inherited by others
      const dependents = await this.#checkRoleDependents(role.id);
      if (dependents.length > 0) {
        throw new AppError(
          'Cannot delete role with dependents',
          409,
          'ROLE_HAS_DEPENDENTS',
          { dependents }
        );
      }

      // Delete role
      if (this.database) {
        const RoleModel = require('../../database/models/users/role-model');
        await RoleModel.deleteOne({ id: role.id });
      } else {
        this.inMemoryRoles.delete(role.id);
        this.inMemoryRoles.delete(role.name);
      }

      // Clear caches
      this.#clearCache();

      logger.info('Role deleted', { roleId: role.id, roleName: role.name });

      return {
        success: true,
        deletedRole: role
      };

    } catch (error) {
      logger.error('Role deletion failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to delete role',
        500,
        'ROLE_DELETE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists roles with optional filtering
   * @param {Object} [options={}] - List options
   * @param {string} [options.type] - Filter by role type
   * @param {boolean} [options.active=true] - Include only active roles
   * @param {boolean} [options.includePermissions=false] - Include permissions
   * @param {number} [options.limit=100] - Maximum results
   * @param {number} [options.offset=0] - Skip results
   * @returns {Promise<Object>} List results
   */
  async listRoles(options = {}) {
    try {
      const {
        type,
        active = true,
        includePermissions = false,
        limit = 100,
        offset = 0
      } = options;

      let roles;
      let total;

      if (this.database) {
        const RoleModel = require('../../database/models/users/role-model');
        const query = {};

        if (type) query.type = type;
        if (active !== undefined) query.active = active;

        total = await RoleModel.countDocuments(query);
        roles = await RoleModel.find(query)
          .skip(offset)
          .limit(limit)
          .sort({ priority: -1, name: 1 });

      } else {
        roles = Array.from(this.inMemoryRoles.values())
          .filter(role => {
            // Deduplicate (stored by both ID and name)
            if (role.id !== role.name && this.inMemoryRoles.has(role.name)) {
              return false;
            }
            if (type && role.type !== type) return false;
            if (active !== undefined && role.active !== active) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.priority !== b.priority) {
              return b.priority - a.priority;
            }
            return a.name.localeCompare(b.name);
          });

        total = roles.length;
        roles = roles.slice(offset, offset + limit);
      }

      // Include permissions if requested
      if (includePermissions) {
        const PermissionService = require('./permission-service');
        const permissionService = new PermissionService({ database: this.database });

        for (const role of roles) {
          role.permissions = await permissionService.getRolePermissions(role.id);
        }
      }

      return {
        roles,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + roles.length < total
        }
      };

    } catch (error) {
      logger.error('Role listing failed', error);

      throw new AppError(
        'Failed to list roles',
        500,
        'ROLE_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets role hierarchy
   * @param {string} roleIdentifier - Role ID or name
   * @returns {Promise<Object>} Role hierarchy
   */
  async getRoleHierarchy(roleIdentifier) {
    try {
      if (!roleIdentifier) {
        throw new AppError('Role identifier is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      const cacheKey = `hierarchy:${roleIdentifier}`;
      if (this.enableCache && this.hierarchyCache.has(cacheKey)) {
        const cached = this.hierarchyCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      const role = await this.getRole(roleIdentifier);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Build hierarchy
      const hierarchy = {
        role: {
          id: role.id,
          name: role.name,
          displayName: role.displayName,
          type: role.type,
          priority: role.priority
        },
        parents: [],
        children: [],
        ancestors: [],
        descendants: []
      };

      // Get direct parents (inherited roles)
      if (role.inherits && role.inherits.length > 0) {
        for (const parentId of role.inherits) {
          const parent = await this.getRole(parentId);
          if (parent) {
            hierarchy.parents.push({
              id: parent.id,
              name: parent.name,
              displayName: parent.displayName,
              priority: parent.priority
            });
          }
        }
      }

      // Get all ancestors
      hierarchy.ancestors = await this.#getAllAncestors(role.id);

      // Get direct children
      const children = await this.#getDirectChildren(role.id);
      hierarchy.children = children.map(child => ({
        id: child.id,
        name: child.name,
        displayName: child.displayName,
        priority: child.priority
      }));

      // Get all descendants
      hierarchy.descendants = await this.#getAllDescendants(role.id);

      // Cache result
      if (this.enableCache) {
        this.hierarchyCache.set(cacheKey, {
          data: hierarchy,
          timestamp: Date.now()
        });
      }

      return hierarchy;

    } catch (error) {
      logger.error('Failed to get role hierarchy', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get role hierarchy',
        500,
        'HIERARCHY_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if a role has a specific permission
   * @param {string} roleIdentifier - Role ID or name
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @returns {Promise<boolean>} True if role has permission
   */
  async roleHasPermission(roleIdentifier, resource, action) {
    try {
      const role = await this.getRole(roleIdentifier);
      if (!role) {
        return false;
      }

      // Get all inherited roles
      const roleIds = [role.id];
      const ancestors = await this.#getAllAncestors(role.id);
      roleIds.push(...ancestors.map(a => a.id));

      // Check permissions for all roles
      const PermissionService = require('./permission-service');
      const permissionService = new PermissionService({ database: this.database });

      for (const roleId of roleIds) {
        const permissions = await permissionService.getRolePermissions(roleId);
        
        const hasPermission = permissions.some(p => 
          (p.resource === resource || p.resource === '*') &&
          (p.action === action || p.action === '*') &&
          p.effect === 'allow'
        );

        if (hasPermission) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Permission check failed', error);
      return false;
    }
  }

  /**
   * Validates role configuration
   * @returns {Promise<Object>} Validation results
   */
  async validateRoles() {
    try {
      const results = {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          total: 0,
          active: 0,
          inactive: 0,
          byType: {},
          circularDependencies: [],
          orphanedInheritance: []
        }
      };

      // Get all roles
      const { roles } = await this.listRoles({ active: undefined });
      results.stats.total = roles.length;

      for (const role of roles) {
        // Count statistics
        if (role.active) {
          results.stats.active++;
        } else {
          results.stats.inactive++;
        }

        results.stats.byType[role.type] = 
          (results.stats.byType[role.type] || 0) + 1;

        // Validate role structure
        try {
          this.#validateRoleName(role.name);
        } catch (error) {
          results.valid = false;
          results.errors.push({
            roleId: role.id,
            error: error.message
          });
        }

        // Check for circular dependencies
        if (role.inherits && role.inherits.length > 0) {
          const circular = await this.#checkCircularInheritance(role.id, role.inherits);
          if (circular) {
            results.stats.circularDependencies.push({
              roleId: role.id,
              cycle: circular
            });
            results.valid = false;
            results.errors.push({
              roleId: role.id,
              error: 'Circular inheritance detected'
            });
          }
        }

        // Check for orphaned inheritance
        for (const inheritedId of role.inherits || []) {
          const exists = await this.roleExists(inheritedId);
          if (!exists) {
            results.stats.orphanedInheritance.push({
              roleId: role.id,
              missingRole: inheritedId
            });
            results.warnings.push({
              roleId: role.id,
              warning: `Inherited role not found: ${inheritedId}`
            });
          }
        }
      }

      logger.info('Role validation completed', {
        valid: results.valid,
        errorCount: results.errors.length,
        warningCount: results.warnings.length
      });

      return results;

    } catch (error) {
      logger.error('Role validation failed', error);

      throw new AppError(
        'Failed to validate roles',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if a role exists
   * @param {string} roleIdentifier - Role ID or name
   * @returns {Promise<boolean>} True if exists
   */
  async roleExists(roleIdentifier) {
    try {
      const role = await this.getRole(roleIdentifier);
      return !!role;
    } catch (error) {
      logger.error('Role existence check failed', error);
      return false;
    }
  }

  /**
   * Initializes system roles
   * @private
   */
  #initializeSystemRoles() {
    const systemRoles = [
      {
        id: 'role_system_super_admin',
        name: RoleService.#SYSTEM_ROLES.SUPER_ADMIN,
        displayName: 'Super Administrator',
        description: 'Full system access with all permissions',
        type: RoleService.#ROLE_TYPES.SYSTEM,
        priority: 1000,
        inherits: [],
        active: true,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          version: 1
        }
      },
      {
        id: 'role_system_admin',
        name: RoleService.#SYSTEM_ROLES.ADMIN,
        displayName: 'Administrator',
        description: 'Administrative access',
        type: RoleService.#ROLE_TYPES.SYSTEM,
        priority: 900,
        inherits: [],
        active: true,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          version: 1
        }
      },
      {
        id: 'role_system_user',
        name: RoleService.#SYSTEM_ROLES.USER,
        displayName: 'User',
        description: 'Standard user access',
        type: RoleService.#ROLE_TYPES.SYSTEM,
        priority: 100,
        inherits: [],
        active: true,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          version: 1
        }
      },
      {
        id: 'role_system_guest',
        name: RoleService.#SYSTEM_ROLES.GUEST,
        displayName: 'Guest',
        description: 'Limited guest access',
        type: RoleService.#ROLE_TYPES.SYSTEM,
        priority: 10,
        inherits: [],
        active: true,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'system',
          version: 1
        }
      }
    ];

    // Store system roles in memory
    for (const role of systemRoles) {
      this.inMemoryRoles.set(role.id, role);
      this.inMemoryRoles.set(role.name, role);
    }

    logger.info('System roles initialized', {
      count: systemRoles.length
    });
  }

  /**
   * Loads predefined roles
   * @private
   * @param {Array} roles - Roles to load
   */
  async #loadPredefinedRoles(roles) {
    let loaded = 0;
    let errors = 0;

    for (const roleData of roles) {
      try {
        await this.createRole(roleData);
        loaded++;
      } catch (error) {
        if (error.code !== 'ROLE_EXISTS') {
          logger.error('Failed to load predefined role', {
            role: roleData.name,
            error: error.message
          });
          errors++;
        }
      }
    }

    logger.info('Predefined roles loaded', { loaded, errors });
  }

  /**
   * Validates role name
   * @private
   * @param {string} name - Role name to validate
   * @throws {AppError} If validation fails
   */
  #validateRoleName(name) {
    if (!name || name.length === 0) {
      throw new AppError('Role name cannot be empty', 400, 'INVALID_ROLE_NAME');
    }

    if (name.length > RoleService.#MAX_ROLE_NAME_LENGTH) {
      throw new AppError(
        `Role name exceeds maximum length of ${RoleService.#MAX_ROLE_NAME_LENGTH}`,
        400,
        'ROLE_NAME_TOO_LONG'
      );
    }

    if (!RoleService.#ROLE_NAME_PATTERN.test(name)) {
      throw new AppError(
        'Role name contains invalid characters',
        400,
        'INVALID_ROLE_NAME_FORMAT'
      );
    }

    if (RoleService.#RESERVED_ROLE_NAMES.includes(name) && 
        !Object.values(RoleService.#SYSTEM_ROLES).includes(name)) {
      throw new AppError(
        'Role name is reserved',
        400,
        'RESERVED_ROLE_NAME'
      );
    }
  }

  /**
   * Validates role inheritance
   * @private
   * @param {string} roleName - Role being created/updated
   * @param {Array<string>} inherits - Roles to inherit from
   * @throws {AppError} If validation fails
   */
  async #validateInheritance(roleName, inherits) {
    if (!Array.isArray(inherits)) {
      throw new AppError('Inherits must be an array', 400, 'INVALID_INHERITANCE');
    }

    // Check each inherited role exists
    for (const inheritedRole of inherits) {
      const exists = await this.roleExists(inheritedRole);
      if (!exists) {
        throw new AppError(
          `Inherited role not found: ${inheritedRole}`,
          404,
          'INHERITED_ROLE_NOT_FOUND'
        );
      }
    }

    // Check for self-inheritance
    if (inherits.includes(roleName)) {
      throw new AppError(
        'Role cannot inherit from itself',
        400,
        'SELF_INHERITANCE'
      );
    }

    // Check for circular inheritance
    const circular = await this.#checkCircularInheritance(roleName, inherits);
    if (circular) {
      throw new AppError(
        'Circular inheritance detected',
        400,
        'CIRCULAR_INHERITANCE',
        { cycle: circular }
      );
    }

    // Check inheritance depth
    const maxDepth = await this.#calculateMaxInheritanceDepth(inherits);
    if (maxDepth >= RoleService.#MAX_INHERITANCE_DEPTH) {
      throw new AppError(
        `Inheritance depth exceeds maximum of ${RoleService.#MAX_INHERITANCE_DEPTH}`,
        400,
        'INHERITANCE_TOO_DEEP'
      );
    }
  }

  /**
   * Checks for circular inheritance
   * @private
   * @param {string} roleName - Role being checked
   * @param {Array<string>} inherits - Roles to inherit from
   * @returns {Promise<Array|null>} Circular path or null
   */
  async #checkCircularInheritance(roleName, inherits) {
    const visited = new Set();
    const path = [];

    const checkCycle = async (currentRole) => {
      if (visited.has(currentRole)) {
        const cycleStart = path.indexOf(currentRole);
        return path.slice(cycleStart);
      }

      visited.add(currentRole);
      path.push(currentRole);

      const role = await this.getRole(currentRole);
      if (role && role.inherits) {
        for (const inherited of role.inherits) {
          if (inherited === roleName) {
            return [...path, roleName];
          }
          
          const cycle = await checkCycle(inherited);
          if (cycle) {
            return cycle;
          }
        }
      }

      path.pop();
      return null;
    };

    for (const inherited of inherits) {
      const cycle = await checkCycle(inherited);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }

  /**
   * Calculates maximum inheritance depth
   * @private
   * @param {Array<string>} roleIds - Role IDs to check
   * @returns {Promise<number>} Maximum depth
   */
  async #calculateMaxInheritanceDepth(roleIds) {
    let maxDepth = 0;

    const calculateDepth = async (roleId, currentDepth = 0) => {
      if (currentDepth > RoleService.#MAX_INHERITANCE_DEPTH) {
        return currentDepth;
      }

      const role = await this.getRole(roleId);
      if (!role || !role.inherits || role.inherits.length === 0) {
        return currentDepth;
      }

      let deepest = currentDepth;
      for (const inherited of role.inherits) {
        const depth = await calculateDepth(inherited, currentDepth + 1);
        deepest = Math.max(deepest, depth);
      }

      return deepest;
    };

    for (const roleId of roleIds) {
      const depth = await calculateDepth(roleId);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * Updates role hierarchy
   * @private
   * @param {Object} role - Role to update hierarchy for
   */
  async #updateHierarchy(role) {
    // Clear hierarchy cache for affected roles
    this.hierarchyCache.delete(`hierarchy:${role.id}`);
    this.hierarchyCache.delete(`hierarchy:${role.name}`);

    // Clear inheritance cache
    this.inheritanceCache.clear();

    logger.debug('Role hierarchy updated', { roleId: role.id });
  }

  /**
   * Gets all ancestors of a role
   * @private
   * @param {string} roleId - Role ID
   * @returns {Promise<Array>} Ancestor roles
   */
  async #getAllAncestors(roleId) {
    const cacheKey = `ancestors:${roleId}`;
    if (this.inheritanceCache.has(cacheKey)) {
      return this.inheritanceCache.get(cacheKey);
    }

    const ancestors = [];
    const visited = new Set();
    const queue = [roleId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);

      const role = await this.getRole(currentId);
      if (role && role.inherits) {
        for (const inheritedId of role.inherits) {
          const inherited = await this.getRole(inheritedId);
          if (inherited && !visited.has(inherited.id)) {
            ancestors.push({
              id: inherited.id,
              name: inherited.name,
              displayName: inherited.displayName,
              priority: inherited.priority,
              distance: ancestors.filter(a => a.id === currentId).length + 1
            });
            queue.push(inherited.id);
          }
        }
      }
    }

    this.inheritanceCache.set(cacheKey, ancestors);
    return ancestors;
  }

  /**
   * Gets direct children of a role
   * @private
   * @param {string} roleId - Role ID
   * @returns {Promise<Array>} Child roles
   */
  async #getDirectChildren(roleId) {
    const children = [];
    const { roles } = await this.listRoles({ active: undefined });

    for (const role of roles) {
      if (role.inherits && role.inherits.includes(roleId)) {
        children.push(role);
      }
    }

    return children;
  }

  /**
   * Gets all descendants of a role
   * @private
   * @param {string} roleId - Role ID
   * @returns {Promise<Array>} Descendant roles
   */
  async #getAllDescendants(roleId) {
    const descendants = [];
    const visited = new Set();
    const queue = [roleId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      
      if (visited.has(currentId)) {
        continue;
      }
      
      visited.add(currentId);

      const children = await this.#getDirectChildren(currentId);
      for (const child of children) {
        if (!visited.has(child.id)) {
          descendants.push({
            id: child.id,
            name: child.name,
            displayName: child.displayName,
            priority: child.priority,
            distance: descendants.filter(d => d.id === currentId).length + 1
          });
          queue.push(child.id);
        }
      }
    }

    return descendants;
  }

  /**
   * Checks role usage
   * @private
   * @param {string} roleId - Role ID
   * @returns {Promise<Object>} Usage information
   */
  async #checkRoleUsage(roleId) {
    const usage = {
      inUse: false,
      users: [],
      count: 0
    };

    if (this.database) {
      const UserRoleModel = require('../../database/models/user-role-model');
      const assignments = await UserRoleModel.find({ roleId });
      
      usage.users = [...new Set(assignments.map(a => a.userId))];
      usage.count = usage.users.length;
      usage.inUse = usage.count > 0;
    }

    return usage;
  }

  /**
   * Checks role dependents
   * @private
   * @param {string} roleId - Role ID
   * @returns {Promise<Array>} Dependent roles
   */
  async #checkRoleDependents(roleId) {
    const dependents = [];
    const { roles } = await this.listRoles({ active: undefined });

    for (const role of roles) {
      if (role.inherits && role.inherits.includes(roleId)) {
        dependents.push({
          id: role.id,
          name: role.name,
          displayName: role.displayName
        });
      }
    }

    return dependents;
  }

  /**
   * Formats display name from role name
   * @private
   * @param {string} name - Role name
   * @returns {string} Formatted display name
   */
  #formatDisplayName(name) {
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generates role ID
   * @private
   * @returns {string} Role identifier
   */
  #generateRoleId() {
    return `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clears all caches
   * @private
   */
  #clearCache() {
    this.roleCache.clear();
    this.hierarchyCache.clear();
    this.inheritanceCache.clear();
  }

  /**
   * Exports role configuration
   * @returns {Promise<Array>} Exported roles
   */
  async exportRoles() {
    const { roles } = await this.listRoles({ 
      active: undefined,
      limit: Number.MAX_SAFE_INTEGER 
    });

    return roles
      .filter(role => role.type !== RoleService.#ROLE_TYPES.SYSTEM)
      .map(role => ({
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        type: role.type,
        inherits: role.inherits,
        priority: role.priority,
        metadata: role.metadata,
        active: role.active
      }));
  }

  /**
   * Imports role configuration
   * @param {Array} roles - Roles to import
   * @param {Object} [options={}] - Import options
   * @returns {Promise<Object>} Import results
   */
  async importRoles(roles, options = {}) {
    const { merge = false } = options;
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    // Sort by inheritance to import in correct order
    const sorted = this.#topologicalSort(roles);

    for (const role of sorted) {
      try {
        await this.createRole(role);
        results.imported++;
      } catch (error) {
        if (error.code === 'ROLE_EXISTS' && merge) {
          results.skipped++;
        } else {
          results.errors.push({
            role: role.name,
            error: error.message
          });
        }
      }
    }

    logger.info('Roles imported', results);

    return results;
  }

  /**
   * Sorts roles topologically by inheritance
   * @private
   * @param {Array} roles - Roles to sort
   * @returns {Array} Sorted roles
   */
  #topologicalSort(roles) {
    const sorted = [];
    const visited = new Set();
    const roleMap = new Map(roles.map(r => [r.name, r]));

    const visit = (role) => {
      if (visited.has(role.name)) {
        return;
      }

      visited.add(role.name);

      if (role.inherits) {
        for (const inherited of role.inherits) {
          const inheritedRole = roleMap.get(inherited);
          if (inheritedRole) {
            visit(inheritedRole);
          }
        }
      }

      sorted.push(role);
    };

    for (const role of roles) {
      visit(role);
    }

    return sorted;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.#clearCache();
    logger.info('RoleService cleanup completed');
  }
}

module.exports = RoleService;