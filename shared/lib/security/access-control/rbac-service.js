'use strict';

/**
 * @fileoverview Role-Based Access Control (RBAC) central management service
 * @module shared/lib/security/access-control/rbac-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/access-control/role-service
 * @requires module:shared/lib/security/access-control/permission-service
 * @requires module:shared/lib/security/access-control/policy-engine
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const RoleService = require('./role-service');
const PermissionService = require('./permission-service');
const PolicyEngine = require('./policy-engine');

/**
 * @class RBACService
 * @description Central Role-Based Access Control manager that orchestrates roles, permissions, and policies
 */
class RBACService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #ACCESS_DECISION = {
    ALLOW: 'allow',
    DENY: 'deny',
    ABSTAIN: 'abstain'
  };

  static #EVALUATION_STRATEGY = {
    FIRST_MATCH: 'first-match',
    DENY_OVERRIDES: 'deny-overrides',
    ALLOW_OVERRIDES: 'allow-overrides',
    UNANIMOUS: 'unanimous',
    MAJORITY: 'majority'
  };

  static #CACHE_TTL = 300000; // 5 minutes
  static #MAX_ROLE_DEPTH = 10; // Maximum role hierarchy depth
  static #WILDCARD_CHAR = '*';

  /**
   * Creates an instance of RBACService
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {string} [options.evaluationStrategy='deny-overrides'] - Permission evaluation strategy
   * @param {boolean} [options.enableCache=true] - Enable permission cache
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [options.enableAudit=true] - Enable access audit logging
   * @param {Object} [options.roleServiceOptions] - Options for RoleService
   * @param {Object} [options.permissionServiceOptions] - Options for PermissionService
   * @param {Object} [options.policyEngineOptions] - Options for PolicyEngine
   */
  constructor(options = {}) {
    const {
      database,
      evaluationStrategy = RBACService.#EVALUATION_STRATEGY.DENY_OVERRIDES,
      enableCache = true,
      cacheTTL = RBACService.#CACHE_TTL,
      enableAudit = true,
      roleServiceOptions = {},
      permissionServiceOptions = {},
      policyEngineOptions = {}
    } = options;

    this.database = database;
    this.evaluationStrategy = evaluationStrategy;
    this.enableCache = enableCache;
    this.cacheTTL = cacheTTL;
    this.enableAudit = enableAudit;

    // Initialize sub-services
    this.roleService = new RoleService({ database, ...roleServiceOptions });
    this.permissionService = new PermissionService({ database, ...permissionServiceOptions });
    this.policyEngine = new PolicyEngine({ database, ...policyEngineOptions });

    // Initialize cache
    this.permissionCache = new Map();
    this.roleCache = new Map();
    this.effectivePermissionsCache = new Map();

    // Start cache cleanup interval
    if (this.enableCache) {
      this.cacheCleanupInterval = setInterval(() => {
        this.#cleanupCache();
      }, this.cacheTTL);
    }

    logger.info('RBACService initialized', {
      evaluationStrategy,
      enableCache,
      enableAudit
    });
  }

  /**
   * Checks if a user has permission to perform an action on a resource
   * @param {Object} subject - Subject requesting access
   * @param {string} subject.userId - User identifier
   * @param {Array<string>} [subject.roles] - User's roles
   * @param {Object} [subject.attributes] - Additional subject attributes
   * @param {string} resource - Resource identifier
   * @param {string} action - Action to perform
   * @param {Object} [context={}] - Additional context for evaluation
   * @returns {Promise<Object>} Access decision with details
   */
  async checkPermission(subject, resource, action, context = {}) {
    try {
      const startTime = Date.now();
      const requestId = this.#generateRequestId();

      if (!subject || !subject.userId) {
        throw new AppError('Subject with userId is required', 400, 'INVALID_SUBJECT');
      }

      if (!resource || !action) {
        throw new AppError('Resource and action are required', 400, 'INVALID_REQUEST');
      }

      // Check cache first
      const cacheKey = this.#generateCacheKey(subject.userId, resource, action);
      if (this.enableCache && this.permissionCache.has(cacheKey)) {
        const cached = this.permissionCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          logger.debug('Permission check from cache', { requestId, cacheKey });
          return cached.result;
        }
      }

      // Build evaluation context
      const evaluationContext = {
        subject: {
          id: subject.userId,
          roles: subject.roles || [],
          attributes: subject.attributes || {}
        },
        resource,
        action,
        environment: {
          timestamp: new Date().toISOString(),
          ip: context.ip,
          ...context.environment
        },
        requestId
      };

      // Get user's effective roles
      const effectiveRoles = await this.#getEffectiveRoles(subject.userId, subject.roles);
      evaluationContext.subject.effectiveRoles = effectiveRoles;

      // Get permissions for all roles
      const rolePermissions = await this.#getRolePermissions(effectiveRoles);

      // Evaluate direct permissions
      const permissionDecision = this.#evaluatePermissions(
        rolePermissions,
        resource,
        action
      );

      // If permission check is not definitive, evaluate policies
      let policyDecision = { decision: RBACService.#ACCESS_DECISION.ABSTAIN };
      if (permissionDecision.decision !== RBACService.#ACCESS_DECISION.ALLOW) {
        policyDecision = await this.policyEngine.evaluate(evaluationContext);
      }

      // Combine decisions based on strategy
      const finalDecision = this.#combineDecisions(
        permissionDecision,
        policyDecision
      );

      // Build result
      const result = {
        allowed: finalDecision.decision === RBACService.#ACCESS_DECISION.ALLOW,
        decision: finalDecision.decision,
        reason: finalDecision.reason,
        subject: subject.userId,
        resource,
        action,
        requestId,
        evaluationTime: Date.now() - startTime,
        appliedPermissions: finalDecision.appliedPermissions || [],
        appliedPolicies: finalDecision.appliedPolicies || [],
        effectiveRoles
      };

      // Cache result
      if (this.enableCache) {
        this.permissionCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      // Audit log
      if (this.enableAudit) {
        this.#auditAccessDecision(result, evaluationContext);
      }

      logger.debug('Permission check completed', {
        requestId,
        allowed: result.allowed,
        evaluationTime: result.evaluationTime
      });

      return result;

    } catch (error) {
      logger.error('Permission check failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to check permission',
        500,
        'PERMISSION_CHECK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Assigns a role to a user
   * @param {string} userId - User identifier
   * @param {string} roleId - Role identifier
   * @param {Object} [options={}] - Assignment options
   * @param {Date} [options.expiresAt] - Role expiration
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {Promise<Object>} Assignment result
   */
  async assignRole(userId, roleId, options = {}) {
    try {
      if (!userId || !roleId) {
        throw new AppError('User ID and role ID are required', 400, 'INVALID_INPUT');
      }

      // Verify role exists
      const role = await this.roleService.getRole(roleId);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Check for circular dependencies
      await this.#checkCircularDependency(userId, roleId);

      // Create assignment
      const assignment = {
        userId,
        roleId,
        assignedAt: new Date(),
        assignedBy: options.assignedBy || 'system',
        expiresAt: options.expiresAt,
        metadata: options.metadata || {}
      };

      // Store assignment
      if (this.database) {
        const UserRoleModel = require('../../database/models/user-role-model');
        await UserRoleModel.create(assignment);
      }

      // Clear caches
      this.#clearUserCaches(userId);

      logger.info('Role assigned to user', { userId, roleId });

      return {
        success: true,
        assignment
      };

    } catch (error) {
      logger.error('Role assignment failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to assign role',
        500,
        'ROLE_ASSIGNMENT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Removes a role from a user
   * @param {string} userId - User identifier
   * @param {string} roleId - Role identifier
   * @returns {Promise<Object>} Removal result
   */
  async removeRole(userId, roleId) {
    try {
      if (!userId || !roleId) {
        throw new AppError('User ID and role ID are required', 400, 'INVALID_INPUT');
      }

      // Remove assignment
      if (this.database) {
        const UserRoleModel = require('../../database/models/user-role-model');
        await UserRoleModel.deleteOne({ userId, roleId });
      }

      // Clear caches
      this.#clearUserCaches(userId);

      logger.info('Role removed from user', { userId, roleId });

      return {
        success: true,
        userId,
        roleId
      };

    } catch (error) {
      logger.error('Role removal failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to remove role',
        500,
        'ROLE_REMOVAL_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets all permissions for a user
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} User permissions
   */
  async getUserPermissions(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      const cacheKey = `user-permissions:${userId}`;
      if (this.enableCache && this.effectivePermissionsCache.has(cacheKey)) {
        const cached = this.effectivePermissionsCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.permissions;
        }
      }

      // Get user's roles
      const roles = await this.getUserRoles(userId);
      const effectiveRoles = await this.#getEffectiveRoles(userId, roles.map(r => r.id));

      // Get all permissions
      const permissions = new Map();
      const permissionSources = new Map();

      for (const roleId of effectiveRoles) {
        const rolePermissions = await this.permissionService.getRolePermissions(roleId);
        
        for (const permission of rolePermissions) {
          const key = `${permission.resource}:${permission.action}`;
          
          if (!permissions.has(key) || permission.effect === 'deny') {
            permissions.set(key, permission);
            
            if (!permissionSources.has(key)) {
              permissionSources.set(key, []);
            }
            permissionSources.set(key, [...permissionSources.get(key), roleId]);
          }
        }
      }

      // Get direct user permissions if any
      const directPermissions = await this.permissionService.getUserPermissions(userId);
      for (const permission of directPermissions) {
        const key = `${permission.resource}:${permission.action}`;
        permissions.set(key, permission);
        permissionSources.set(key, ['direct']);
      }

      const result = {
        userId,
        permissions: Array.from(permissions.values()),
        permissionCount: permissions.size,
        sources: Object.fromEntries(permissionSources),
        effectiveRoles,
        evaluatedAt: new Date().toISOString()
      };

      // Cache result
      if (this.enableCache) {
        this.effectivePermissionsCache.set(cacheKey, {
          permissions: result,
          timestamp: Date.now()
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to get user permissions', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get user permissions',
        500,
        'USER_PERMISSIONS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets all roles assigned to a user
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Array>} User's roles
   */
  async getUserRoles(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_INPUT');
      }

      const { includeInherited = true, includeExpired = false } = options;

      // Get direct role assignments
      let assignments = [];
      
      if (this.database) {
        const UserRoleModel = require('../../database/models/user-role-model');
        const query = { userId };
        
        if (!includeExpired) {
          query.$or = [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ];
        }
        
        assignments = await UserRoleModel.find(query);
      }

      // Get role details
      const roles = [];
      const processedRoles = new Set();

      for (const assignment of assignments) {
        const role = await this.roleService.getRole(assignment.roleId);
        if (role && !processedRoles.has(role.id)) {
          roles.push({
            ...role,
            assignedAt: assignment.assignedAt,
            expiresAt: assignment.expiresAt,
            source: 'direct'
          });
          processedRoles.add(role.id);
        }
      }

      // Get inherited roles if requested
      if (includeInherited) {
        for (const role of [...roles]) {
          const inheritedRoles = await this.#getInheritedRoles(role.id);
          
          for (const inheritedRole of inheritedRoles) {
            if (!processedRoles.has(inheritedRole.id)) {
              roles.push({
                ...inheritedRole,
                source: 'inherited',
                inheritedFrom: role.id
              });
              processedRoles.add(inheritedRole.id);
            }
          }
        }
      }

      return roles;

    } catch (error) {
      logger.error('Failed to get user roles', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get user roles',
        500,
        'USER_ROLES_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks multiple permissions at once
   * @param {Object} subject - Subject requesting access
   * @param {Array<Object>} requests - Permission check requests
   * @returns {Promise<Array>} Results for each request
   */
  async checkMultiplePermissions(subject, requests) {
    try {
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new AppError('Requests array is required', 400, 'INVALID_INPUT');
      }

      const results = await Promise.all(
        requests.map(async (request) => {
          try {
            const result = await this.checkPermission(
              subject,
              request.resource,
              request.action,
              request.context
            );
            
            return {
              ...result,
              request
            };
          } catch (error) {
            return {
              allowed: false,
              error: error.message,
              request
            };
          }
        })
      );

      return {
        subject: subject.userId,
        results,
        summary: {
          total: results.length,
          allowed: results.filter(r => r.allowed).length,
          denied: results.filter(r => !r.allowed).length
        }
      };

    } catch (error) {
      logger.error('Multiple permission check failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to check multiple permissions',
        500,
        'MULTI_PERMISSION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a permission delegation
   * @param {Object} delegation - Delegation details
   * @returns {Promise<Object>} Delegation result
   */
  async createDelegation(delegation) {
    try {
      const {
        fromUserId,
        toUserId,
        permissions,
        expiresAt,
        constraints
      } = delegation;

      if (!fromUserId || !toUserId || !permissions) {
        throw new AppError('Required delegation fields missing', 400, 'INVALID_INPUT');
      }

      // Verify delegator has the permissions
      for (const permission of permissions) {
        const canDelegate = await this.checkPermission(
          { userId: fromUserId },
          permission.resource,
          permission.action
        );

        if (!canDelegate.allowed) {
          throw new AppError(
            'Cannot delegate permissions you do not have',
            403,
            'INSUFFICIENT_PERMISSIONS'
          );
        }
      }

      // Create delegation record
      const delegationRecord = {
        id: this.#generateRequestId(),
        fromUserId,
        toUserId,
        permissions,
        constraints,
        createdAt: new Date(),
        expiresAt,
        status: 'active'
      };

      if (this.database) {
        const DelegationModel = require('../../database/models/delegation-model');
        await DelegationModel.create(delegationRecord);
      }

      // Clear caches
      this.#clearUserCaches(toUserId);

      logger.info('Permission delegation created', {
        delegationId: delegationRecord.id,
        fromUserId,
        toUserId
      });

      return delegationRecord;

    } catch (error) {
      logger.error('Delegation creation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create delegation',
        500,
        'DELEGATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates access control configuration
   * @returns {Promise<Object>} Validation results
   */
  async validateConfiguration() {
    try {
      const results = {
        valid: true,
        errors: [],
        warnings: [],
        stats: {}
      };

      // Validate roles
      const roleValidation = await this.roleService.validateRoles();
      if (!roleValidation.valid) {
        results.valid = false;
        results.errors.push(...roleValidation.errors);
      }
      results.warnings.push(...roleValidation.warnings);
      results.stats.roles = roleValidation.stats;

      // Validate permissions
      const permissionValidation = await this.permissionService.validatePermissions();
      if (!permissionValidation.valid) {
        results.valid = false;
        results.errors.push(...permissionValidation.errors);
      }
      results.warnings.push(...permissionValidation.warnings);
      results.stats.permissions = permissionValidation.stats;

      // Validate policies
      const policyValidation = await this.policyEngine.validatePolicies();
      if (!policyValidation.valid) {
        results.valid = false;
        results.errors.push(...policyValidation.errors);
      }
      results.warnings.push(...policyValidation.warnings);
      results.stats.policies = policyValidation.stats;

      // Check for orphaned assignments
      const orphanedAssignments = await this.#checkOrphanedAssignments();
      if (orphanedAssignments.length > 0) {
        results.warnings.push({
          type: 'orphaned-assignments',
          message: `Found ${orphanedAssignments.length} orphaned role assignments`,
          details: orphanedAssignments
        });
      }

      logger.info('Access control validation completed', results);

      return results;

    } catch (error) {
      logger.error('Configuration validation failed', error);

      throw new AppError(
        'Failed to validate configuration',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets effective roles including inherited ones
   * @private
   * @param {string} userId - User identifier
   * @param {Array<string>} directRoles - Direct role IDs
   * @returns {Promise<Array>} All effective role IDs
   */
  async #getEffectiveRoles(userId, directRoles = []) {
    const cacheKey = `effective-roles:${userId}:${directRoles.join(',')}`;
    
    if (this.enableCache && this.roleCache.has(cacheKey)) {
      const cached = this.roleCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.roles;
      }
    }

    const effectiveRoles = new Set(directRoles);
    const processed = new Set();
    const queue = [...directRoles];

    while (queue.length > 0 && processed.size < RBACService.#MAX_ROLE_DEPTH) {
      const roleId = queue.shift();
      
      if (processed.has(roleId)) {
        continue;
      }
      
      processed.add(roleId);

      const role = await this.roleService.getRole(roleId);
      if (role && role.inherits) {
        for (const inheritedRole of role.inherits) {
          effectiveRoles.add(inheritedRole);
          queue.push(inheritedRole);
        }
      }
    }

    const result = Array.from(effectiveRoles);

    if (this.enableCache) {
      this.roleCache.set(cacheKey, {
        roles: result,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Gets permissions for multiple roles
   * @private
   * @param {Array<string>} roleIds - Role identifiers
   * @returns {Promise<Array>} All permissions
   */
  async #getRolePermissions(roleIds) {
    const permissions = [];
    
    for (const roleId of roleIds) {
      const rolePermissions = await this.permissionService.getRolePermissions(roleId);
      permissions.push(...rolePermissions);
    }

    return permissions;
  }

  /**
   * Evaluates permissions against resource and action
   * @private
   * @param {Array} permissions - Available permissions
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @returns {Object} Evaluation result
   */
  #evaluatePermissions(permissions, resource, action) {
    const matches = [];
    let hasExplicitDeny = false;
    let hasExplicitAllow = false;

    for (const permission of permissions) {
      if (this.#matchesPermission(permission, resource, action)) {
        matches.push(permission);
        
        if (permission.effect === 'deny') {
          hasExplicitDeny = true;
        } else if (permission.effect === 'allow') {
          hasExplicitAllow = true;
        }
      }
    }

    // Apply evaluation strategy
    let decision = RBACService.#ACCESS_DECISION.ABSTAIN;
    let reason = 'No matching permissions';

    if (hasExplicitDeny && this.evaluationStrategy !== RBACService.#EVALUATION_STRATEGY.ALLOW_OVERRIDES) {
      decision = RBACService.#ACCESS_DECISION.DENY;
      reason = 'Explicit deny permission found';
    } else if (hasExplicitAllow) {
      decision = RBACService.#ACCESS_DECISION.ALLOW;
      reason = 'Explicit allow permission found';
    }

    return {
      decision,
      reason,
      matchedPermissions: matches
    };
  }

  /**
   * Checks if permission matches resource and action
   * @private
   * @param {Object} permission - Permission to check
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @returns {boolean} True if matches
   */
  #matchesPermission(permission, resource, action) {
    const resourceMatch = this.#matchesPattern(permission.resource, resource);
    const actionMatch = this.#matchesPattern(permission.action, action);
    
    return resourceMatch && actionMatch;
  }

  /**
   * Matches pattern with wildcard support
   * @private
   * @param {string} pattern - Pattern to match
   * @param {string} value - Value to check
   * @returns {boolean} True if matches
   */
  #matchesPattern(pattern, value) {
    if (pattern === value || pattern === RBACService.#WILDCARD_CHAR) {
      return true;
    }

    if (pattern.includes(RBACService.#WILDCARD_CHAR)) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(value);
    }

    return false;
  }

  /**
   * Combines permission and policy decisions
   * @private
   * @param {Object} permissionDecision - Permission evaluation result
   * @param {Object} policyDecision - Policy evaluation result
   * @returns {Object} Combined decision
   */
  #combineDecisions(permissionDecision, policyDecision) {
    const strategy = this.evaluationStrategy;

    // If permission explicitly allows and no policy denies
    if (permissionDecision.decision === RBACService.#ACCESS_DECISION.ALLOW &&
        policyDecision.decision !== RBACService.#ACCESS_DECISION.DENY) {
      return {
        decision: RBACService.#ACCESS_DECISION.ALLOW,
        reason: permissionDecision.reason,
        appliedPermissions: permissionDecision.matchedPermissions,
        appliedPolicies: policyDecision.appliedPolicies || []
      };
    }

    // If either explicitly denies
    if (permissionDecision.decision === RBACService.#ACCESS_DECISION.DENY ||
        policyDecision.decision === RBACService.#ACCESS_DECISION.DENY) {
      return {
        decision: RBACService.#ACCESS_DECISION.DENY,
        reason: permissionDecision.decision === RBACService.#ACCESS_DECISION.DENY
          ? permissionDecision.reason
          : policyDecision.reason,
        appliedPermissions: permissionDecision.matchedPermissions,
        appliedPolicies: policyDecision.appliedPolicies || []
      };
    }

    // If policy allows when permission abstains
    if (policyDecision.decision === RBACService.#ACCESS_DECISION.ALLOW) {
      return {
        decision: RBACService.#ACCESS_DECISION.ALLOW,
        reason: policyDecision.reason,
        appliedPermissions: permissionDecision.matchedPermissions,
        appliedPolicies: policyDecision.appliedPolicies || []
      };
    }

    // Default deny
    return {
      decision: RBACService.#ACCESS_DECISION.DENY,
      reason: 'No explicit allow permission or policy',
      appliedPermissions: permissionDecision.matchedPermissions,
      appliedPolicies: policyDecision.appliedPolicies || []
    };
  }

  /**
   * Gets inherited roles
   * @private
   * @param {string} roleId - Role identifier
   * @returns {Promise<Array>} Inherited roles
   */
  async #getInheritedRoles(roleId) {
    const role = await this.roleService.getRole(roleId);
    const inherited = [];

    if (role && role.inherits && Array.isArray(role.inherits)) {
      for (const inheritedRoleId of role.inherits) {
        const inheritedRole = await this.roleService.getRole(inheritedRoleId);
        if (inheritedRole) {
          inherited.push(inheritedRole);
        }
      }
    }

    return inherited;
  }

  /**
   * Checks for circular role dependencies
   * @private
   * @param {string} userId - User identifier
   * @param {string} roleId - Role to assign
   * @returns {Promise<void>}
   * @throws {AppError} If circular dependency detected
   */
  async #checkCircularDependency(userId, roleId) {
    const visited = new Set();
    const queue = [roleId];

    while (queue.length > 0) {
      const currentRole = queue.shift();
      
      if (visited.has(currentRole)) {
        throw new AppError(
          'Circular role dependency detected',
          400,
          'CIRCULAR_DEPENDENCY'
        );
      }
      
      visited.add(currentRole);

      const role = await this.roleService.getRole(currentRole);
      if (role && role.inherits) {
        queue.push(...role.inherits);
      }
    }
  }

  /**
   * Checks for orphaned role assignments
   * @private
   * @returns {Promise<Array>} Orphaned assignments
   */
  async #checkOrphanedAssignments() {
    const orphaned = [];

    if (this.database) {
      const UserRoleModel = require('../../database/models/user-role-model');
      const assignments = await UserRoleModel.find({});

      for (const assignment of assignments) {
        const roleExists = await this.roleService.roleExists(assignment.roleId);
        if (!roleExists) {
          orphaned.push({
            userId: assignment.userId,
            roleId: assignment.roleId,
            assignedAt: assignment.assignedAt
          });
        }
      }
    }

    return orphaned;
  }

  /**
   * Generates cache key
   * @private
   * @param {string} userId - User identifier
   * @param {string} resource - Resource identifier
   * @param {string} action - Action identifier
   * @returns {string} Cache key
   */
  #generateCacheKey(userId, resource, action) {
    return `${userId}:${resource}:${action}`;
  }

  /**
   * Generates request ID
   * @private
   * @returns {string} Request identifier
   */
  #generateRequestId() {
    return `rbac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clears user-specific caches
   * @private
   * @param {string} userId - User identifier
   */
  #clearUserCaches(userId) {
    // Clear permission cache entries for user
    for (const [key] of this.permissionCache) {
      if (key.startsWith(`${userId}:`)) {
        this.permissionCache.delete(key);
      }
    }

    // Clear role cache entries
    for (const [key] of this.roleCache) {
      if (key.includes(userId)) {
        this.roleCache.delete(key);
      }
    }

    // Clear effective permissions cache
    this.effectivePermissionsCache.delete(`user-permissions:${userId}`);
  }

  /**
   * Cleans up expired cache entries
   * @private
   */
  #cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.permissionCache) {
      if (now - value.timestamp > this.cacheTTL) {
        this.permissionCache.delete(key);
        cleaned++;
      }
    }

    for (const [key, value] of this.roleCache) {
      if (now - value.timestamp > this.cacheTTL) {
        this.roleCache.delete(key);
        cleaned++;
      }
    }

    for (const [key, value] of this.effectivePermissionsCache) {
      if (now - value.timestamp > this.cacheTTL) {
        this.effectivePermissionsCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesCleaned: cleaned });
    }
  }

  /**
   * Audits access decision
   * @private
   * @param {Object} decision - Access decision
   * @param {Object} context - Evaluation context
   */
  #auditAccessDecision(decision, context) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      requestId: decision.requestId,
      subject: context.subject,
      resource: decision.resource,
      action: decision.action,
      decision: decision.decision,
      allowed: decision.allowed,
      reason: decision.reason,
      environment: context.environment,
      evaluationTime: decision.evaluationTime
    };

    if (this.database) {
      // Store in database
      const AccessAuditModel = require('../../database/models/access-audit-model');
      AccessAuditModel.create(auditEntry).catch(error => {
        logger.error('Failed to store audit entry', error);
      });
    }

    logger.info('Access decision audited', {
      requestId: decision.requestId,
      allowed: decision.allowed
    });
  }

  /**
   * Clears all caches
   */
  clearCache() {
    this.permissionCache.clear();
    this.roleCache.clear();
    this.effectivePermissionsCache.clear();
    
    logger.info('RBAC caches cleared');
  }

  /**
   * Exports RBAC configuration
   * @returns {Promise<Object>} Exported configuration
   */
  async exportConfiguration() {
    const roles = await this.roleService.listRoles();
    const permissions = await this.permissionService.listPermissions();
    const policies = await this.policyEngine.listPolicies();

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      configuration: {
        evaluationStrategy: this.evaluationStrategy,
        enableCache: this.enableCache,
        cacheTTL: this.cacheTTL,
        enableAudit: this.enableAudit
      },
      roles,
      permissions,
      policies
    };
  }

  /**
   * Imports RBAC configuration
   * @param {Object} config - Configuration to import
   * @param {Object} [options={}] - Import options
   * @returns {Promise<Object>} Import result
   */
  async importConfiguration(config, options = {}) {
    const { merge = false, validate = true } = options;

    if (validate) {
      // Validate configuration structure
      if (!config.version || !config.roles || !config.permissions) {
        throw new AppError('Invalid configuration format', 400, 'INVALID_CONFIG');
      }
    }

    const results = {
      roles: { imported: 0, skipped: 0, errors: [] },
      permissions: { imported: 0, skipped: 0, errors: [] },
      policies: { imported: 0, skipped: 0, errors: [] }
    };

    // Import roles
    for (const role of config.roles || []) {
      try {
        await this.roleService.createRole(role);
        results.roles.imported++;
      } catch (error) {
        if (error.code === 'ROLE_EXISTS' && merge) {
          results.roles.skipped++;
        } else {
          results.roles.errors.push({ role: role.id, error: error.message });
        }
      }
    }

    // Import permissions
    for (const permission of config.permissions || []) {
      try {
        await this.permissionService.createPermission(permission);
        results.permissions.imported++;
      } catch (error) {
        if (error.code === 'PERMISSION_EXISTS' && merge) {
          results.permissions.skipped++;
        } else {
          results.permissions.errors.push({ 
            permission: permission.id, 
            error: error.message 
          });
        }
      }
    }

    // Import policies
    for (const policy of config.policies || []) {
      try {
        await this.policyEngine.createPolicy(policy);
        results.policies.imported++;
      } catch (error) {
        if (error.code === 'POLICY_EXISTS' && merge) {
          results.policies.skipped++;
        } else {
          results.policies.errors.push({ policy: policy.id, error: error.message });
        }
      }
    }

    logger.info('RBAC configuration imported', results);

    return results;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }

    this.clearCache();
    
    logger.info('RBACService cleanup completed');
  }
}

module.exports = RBACService;