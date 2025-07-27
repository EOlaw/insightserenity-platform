'use strict';

/**
 * @fileoverview Authorization middleware for role-based access control and permissions
 * @module shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/database/models/role-model
 * @requires module:shared/lib/database/models/permission-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/access-control/rbac-service
 * @requires module:shared/lib/security/access-control/permission-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const RoleModel = require('../../database/models/role-model');
const PermissionModel = require('../../database/models/permission-model');
const UserModel = require('../../database/models/user-model');
const OrganizationModel = require('../../database/models/organization-model');
const CacheService = require('../../services/cache-service');
const RBACService = require('../../security/access-control/rbac-service');
const PermissionService = require('../../security/access-control/permission-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class AuthorizationMiddleware
 * @description Handles role-based access control and permission verification
 */
class AuthorizationMiddleware {
  /**
   * @private
   * @type {RBACService}
   */
  #rbacService;

  /**
   * @private
   * @type {PermissionService}
   */
  #permissionService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #authorizationMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    cache: {
      roleCacheTTL: 3600, // 1 hour
      permissionCacheTTL: 1800, // 30 minutes
      policyEvaluationCacheTTL: 300 // 5 minutes
    },
    rbac: {
      enableHierarchicalRoles: true,
      enableDynamicPermissions: true,
      enableResourceBasedAccess: true,
      enableConditionalAccess: true,
      defaultDenyPolicy: true
    },
    audit: {
      logAuthorizationChecks: true,
      logAccessDenials: true,
      logPolicyEvaluations: true,
      includeSensitiveData: false
    },
    performance: {
      enableCaching: true,
      parallelPermissionChecks: true,
      maxConcurrentChecks: 10
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #AUTHORIZATION_TYPES = {
    ROLE: 'role',
    PERMISSION: 'permission',
    RESOURCE: 'resource',
    ATTRIBUTE: 'attribute',
    POLICY: 'policy',
    DYNAMIC: 'dynamic'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #AUTHORIZATION_OPERATORS = {
    AND: 'and',
    OR: 'or',
    NOT: 'not',
    XOR: 'xor',
    ANY: 'any',
    ALL: 'all',
    NONE: 'none'
  };

  /**
   * Creates authorization middleware instance
   * @param {Object} [config] - Middleware configuration
   * @param {RBACService} [rbacService] - RBAC service instance
   * @param {PermissionService} [permissionService] - Permission service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    rbacService,
    permissionService,
    cacheService,
    auditService
  ) {
    this.#config = { ...AuthorizationMiddleware.#DEFAULT_CONFIG, ...config };
    this.#rbacService = rbacService || new RBACService();
    this.#permissionService = permissionService || new PermissionService();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#authorizationMetrics = new Map();

    logger.info('AuthorizationMiddleware initialized', {
      hierarchicalRoles: this.#config.rbac.enableHierarchicalRoles,
      dynamicPermissions: this.#config.rbac.enableDynamicPermissions,
      defaultDenyPolicy: this.#config.rbac.defaultDenyPolicy
    });
  }

  /**
   * Requires specific roles for access
   * @param {string|Array<string>} roles - Required roles
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requireRoles(roles, options = {}) {
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        const user = req.auth.user;
        const operator = options.operator || AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.OR;

        // Check role authorization
        const hasAccess = await this.#checkRoleAuthorization(
          user,
          requiredRoles,
          operator,
          options
        );

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.ROLE,
              requiredRoles,
              correlationId
            );
          }

          throw new AppError(
            `Insufficient role privileges. Required: ${requiredRoles.join(', ')}`,
            403,
            ERROR_CODES.INSUFFICIENT_PRIVILEGES,
            { 
              correlationId,
              required: requiredRoles,
              userRoles: user.roles?.map(r => r.name || r)
            }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.ROLE,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          checkedRoles: requiredRoles,
          grantedBy: 'role',
          timestamp: new Date()
        };

        logger.debug('Role authorization successful', {
          correlationId,
          userId: user._id,
          requiredRoles,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.ROLE,
          false,
          duration
        );

        logger.error('Role authorization failed', {
          correlationId,
          error: error.message,
          requiredRoles,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Requires specific permissions for access
   * @param {string|Array<string>} permissions - Required permissions
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requirePermissions(permissions, options = {}) {
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        const user = req.auth.user;
        const operator = options.operator || AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.AND;

        // Check permission authorization
        const hasAccess = await this.#checkPermissionAuthorization(
          user,
          requiredPermissions,
          operator,
          options
        );

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.PERMISSION,
              requiredPermissions,
              correlationId
            );
          }

          throw new AppError(
            `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
            403,
            ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            { 
              correlationId,
              required: requiredPermissions,
              userPermissions: await this.#getUserPermissions(user)
            }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.PERMISSION,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          checkedPermissions: requiredPermissions,
          grantedBy: 'permission',
          timestamp: new Date()
        };

        logger.debug('Permission authorization successful', {
          correlationId,
          userId: user._id,
          requiredPermissions,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.PERMISSION,
          false,
          duration
        );

        logger.error('Permission authorization failed', {
          correlationId,
          error: error.message,
          requiredPermissions,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Requires resource-based access control
   * @param {string} resourceType - Resource type
   * @param {string} action - Action to perform
   * @param {Function} [resourceGetter] - Function to get resource from request
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requireResourceAccess(resourceType, action, resourceGetter, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        const user = req.auth.user;
        
        // Get resource
        const resource = resourceGetter ? await resourceGetter(req) : null;
        if (!resource && options.requireResource !== false) {
          throw new AppError(
            'Resource not found',
            404,
            ERROR_CODES.RESOURCE_NOT_FOUND,
            { correlationId, resourceType }
          );
        }

        // Check resource access
        const hasAccess = await this.#checkResourceAccess(
          user,
          resourceType,
          action,
          resource,
          options
        );

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.RESOURCE,
              { resourceType, action, resourceId: resource?._id },
              correlationId
            );
          }

          throw new AppError(
            `Access denied to ${resourceType}:${action}`,
            403,
            ERROR_CODES.RESOURCE_ACCESS_DENIED,
            { 
              correlationId,
              resourceType,
              action,
              resourceId: resource?._id
            }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.RESOURCE,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          resourceType,
          action,
          resource,
          grantedBy: 'resource',
          timestamp: new Date()
        };

        logger.debug('Resource authorization successful', {
          correlationId,
          userId: user._id,
          resourceType,
          action,
          resourceId: resource?._id,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.RESOURCE,
          false,
          duration
        );

        logger.error('Resource authorization failed', {
          correlationId,
          error: error.message,
          resourceType,
          action,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Requires attribute-based access control (ABAC)
   * @param {Object} attributes - Required attributes
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requireAttributes(attributes, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        const user = req.auth.user;

        // Build attribute context
        const context = {
          user: {
            id: user._id,
            roles: user.roles,
            permissions: await this.#getUserPermissions(user),
            attributes: user.attributes || {},
            organizationId: user.organizationId
          },
          request: {
            method: req.method,
            path: req.path,
            ip: req.ip,
            timestamp: new Date()
          },
          environment: {
            timeOfDay: new Date().getHours(),
            dayOfWeek: new Date().getDay()
          },
          ...options.additionalContext
        };

        // Check attribute authorization
        const hasAccess = await this.#checkAttributeAuthorization(
          context,
          attributes,
          options
        );

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.ATTRIBUTE,
              attributes,
              correlationId
            );
          }

          throw new AppError(
            'Attribute-based access denied',
            403,
            ERROR_CODES.ATTRIBUTE_ACCESS_DENIED,
            { correlationId, requiredAttributes: attributes }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.ATTRIBUTE,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          attributes,
          context,
          grantedBy: 'attribute',
          timestamp: new Date()
        };

        logger.debug('Attribute authorization successful', {
          correlationId,
          userId: user._id,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.ATTRIBUTE,
          false,
          duration
        );

        logger.error('Attribute authorization failed', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Custom authorization policy evaluation
   * @param {Function|Object} policy - Authorization policy
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requirePolicy(policy, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        // Build policy context
        const context = {
          user: req.auth.user,
          request: req,
          response: res,
          ...options.additionalContext
        };

        // Evaluate policy
        const hasAccess = await this.#evaluatePolicy(policy, context, options);

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.POLICY,
              { policyName: options.policyName || 'custom' },
              correlationId
            );
          }

          throw new AppError(
            'Policy authorization denied',
            403,
            ERROR_CODES.POLICY_DENIED,
            { 
              correlationId,
              policyName: options.policyName
            }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.POLICY,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          policy: options.policyName || 'custom',
          grantedBy: 'policy',
          timestamp: new Date()
        };

        logger.debug('Policy authorization successful', {
          correlationId,
          userId: req.auth.user._id,
          policyName: options.policyName,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.POLICY,
          false,
          duration
        );

        logger.error('Policy authorization failed', {
          correlationId,
          error: error.message,
          policyName: options.policyName,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Dynamic authorization based on runtime conditions
   * @param {Function} authorizationFunction - Dynamic authorization function
   * @param {Object} [options] - Authorization options
   * @returns {Function} Express middleware function
   */
  requireDynamic(authorizationFunction, options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        // Ensure user is authenticated
        if (!req.auth?.user) {
          throw new AppError(
            'Authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED,
            { correlationId }
          );
        }

        // Execute dynamic authorization
        const result = await authorizationFunction(req, res, {
          user: req.auth.user,
          rbacService: this.#rbacService,
          permissionService: this.#permissionService,
          ...options.helpers
        });

        const hasAccess = result === true || result?.authorized === true;

        if (!hasAccess) {
          const duration = Date.now() - startTime;
          
          // Audit access denial
          if (this.#config.audit.logAccessDenials) {
            await this.#auditAuthorizationDenial(
              req,
              AuthorizationMiddleware.#AUTHORIZATION_TYPES.DYNAMIC,
              { reason: result?.reason || 'Dynamic check failed' },
              correlationId
            );
          }

          throw new AppError(
            result?.message || 'Dynamic authorization denied',
            403,
            ERROR_CODES.DYNAMIC_AUTH_DENIED,
            { 
              correlationId,
              reason: result?.reason
            }
          );
        }

        // Track metrics
        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.DYNAMIC,
          true,
          Date.now() - startTime
        );

        // Enhance request with authorization data
        req.authorization = {
          ...(req.authorization || {}),
          dynamic: true,
          grantedBy: 'dynamic',
          metadata: result?.metadata,
          timestamp: new Date()
        };

        logger.debug('Dynamic authorization successful', {
          correlationId,
          userId: req.auth.user._id,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackAuthorizationMetric(
          AuthorizationMiddleware.#AUTHORIZATION_TYPES.DYNAMIC,
          false,
          duration
        );

        logger.error('Dynamic authorization failed', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Authorization failed',
          403,
          ERROR_CODES.AUTHORIZATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * @private
   * Checks role authorization
   */
  async #checkRoleAuthorization(user, requiredRoles, operator, options) {
    const cacheKey = `role_auth:${user._id}:${requiredRoles.join('_')}:${operator}`;

    // Check cache
    if (this.#config.performance.enableCaching) {
      const cached = await this.#cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    // Get user roles with hierarchy
    const userRoles = await this.#getUserRoles(user, {
      includeHierarchy: this.#config.rbac.enableHierarchicalRoles
    });

    let hasAccess;

    switch (operator) {
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.AND:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.ALL:
        hasAccess = requiredRoles.every(role => userRoles.includes(role));
        break;

      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.OR:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.ANY:
        hasAccess = requiredRoles.some(role => userRoles.includes(role));
        break;

      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.NOT:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.NONE:
        hasAccess = !requiredRoles.some(role => userRoles.includes(role));
        break;

      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.XOR:
        const matchCount = requiredRoles.filter(role => userRoles.includes(role)).length;
        hasAccess = matchCount === 1;
        break;

      default:
        hasAccess = requiredRoles.some(role => userRoles.includes(role));
    }

    // Apply additional checks
    if (hasAccess && options.additionalCheck) {
      hasAccess = await options.additionalCheck(user, userRoles);
    }

    // Cache result
    if (this.#config.performance.enableCaching) {
      await this.#cacheService.set(cacheKey, hasAccess, this.#config.cache.roleCacheTTL);
    }

    return hasAccess;
  }

  /**
   * @private
   * Checks permission authorization
   */
  async #checkPermissionAuthorization(user, requiredPermissions, operator, options) {
    const cacheKey = `perm_auth:${user._id}:${requiredPermissions.join('_')}:${operator}`;

    // Check cache
    if (this.#config.performance.enableCaching) {
      const cached = await this.#cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    // Get user permissions
    const userPermissions = await this.#getUserPermissions(user, {
      includeDynamic: this.#config.rbac.enableDynamicPermissions
    });

    let hasAccess;

    switch (operator) {
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.AND:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.ALL:
        hasAccess = requiredPermissions.every(perm => 
          this.#hasPermission(userPermissions, perm)
        );
        break;

      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.OR:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.ANY:
        hasAccess = requiredPermissions.some(perm => 
          this.#hasPermission(userPermissions, perm)
        );
        break;

      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.NOT:
      case AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.NONE:
        hasAccess = !requiredPermissions.some(perm => 
          this.#hasPermission(userPermissions, perm)
        );
        break;

      default:
        hasAccess = requiredPermissions.every(perm => 
          this.#hasPermission(userPermissions, perm)
        );
    }

    // Cache result
    if (this.#config.performance.enableCaching) {
      await this.#cacheService.set(cacheKey, hasAccess, this.#config.cache.permissionCacheTTL);
    }

    return hasAccess;
  }

  /**
   * @private
   * Checks resource access
   */
  async #checkResourceAccess(user, resourceType, action, resource, options) {
    // Check ownership
    if (resource?.ownerId && resource.ownerId.toString() === user._id.toString()) {
      return true;
    }

    // Check organization membership
    if (resource?.organizationId && resource.organizationId === user.organizationId) {
      // Check organization-level permissions
      const permission = `${resourceType}:${action}:organization`;
      const hasOrgPermission = await this.#checkPermissionAuthorization(
        user,
        [permission],
        AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.OR,
        options
      );
      if (hasOrgPermission) return true;
    }

    // Check specific resource permission
    const resourcePermission = `${resourceType}:${action}${resource?._id ? `:${resource._id}` : ''}`;
    return this.#checkPermissionAuthorization(
      user,
      [resourcePermission],
      AuthorizationMiddleware.#AUTHORIZATION_OPERATORS.OR,
      options
    );
  }

  /**
   * @private
   * Checks attribute authorization
   */
  async #checkAttributeAuthorization(context, requiredAttributes, options) {
    for (const [key, value] of Object.entries(requiredAttributes)) {
      const contextValue = this.#getNestedValue(context, key);
      
      if (typeof value === 'function') {
        if (!await value(contextValue, context)) {
          return false;
        }
      } else if (Array.isArray(value)) {
        if (!value.includes(contextValue)) {
          return false;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Handle complex conditions
        if (!this.#evaluateAttributeCondition(contextValue, value)) {
          return false;
        }
      } else {
        if (contextValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * @private
   * Evaluates authorization policy
   */
  async #evaluatePolicy(policy, context, options) {
    if (typeof policy === 'function') {
      return policy(context);
    }

    if (typeof policy === 'object' && policy.evaluate) {
      return policy.evaluate(context);
    }

    throw new AppError(
      'Invalid policy format',
      500,
      ERROR_CODES.INVALID_POLICY
    );
  }

  /**
   * @private
   * Gets user roles with hierarchy
   */
  async #getUserRoles(user, options = {}) {
    const roles = user.roles?.map(r => r.name || r) || [];

    if (options.includeHierarchy && this.#rbacService) {
      const hierarchicalRoles = await this.#rbacService.getHierarchicalRoles(roles);
      return [...new Set([...roles, ...hierarchicalRoles])];
    }

    return roles;
  }

  /**
   * @private
   * Gets user permissions
   */
  async #getUserPermissions(user, options = {}) {
    const directPermissions = user.permissions?.map(p => p.code || p) || [];
    const rolePermissions = await this.#getRolePermissions(user.roles);
    
    let allPermissions = [...new Set([...directPermissions, ...rolePermissions])];

    if (options.includeDynamic && this.#permissionService) {
      const dynamicPermissions = await this.#permissionService.getDynamicPermissions(user);
      allPermissions = [...new Set([...allPermissions, ...dynamicPermissions])];
    }

    return allPermissions;
  }

  /**
   * @private
   * Gets permissions from roles
   */
  async #getRolePermissions(roles) {
    if (!roles || roles.length === 0) return [];

    const permissions = [];
    for (const role of roles) {
      const roleDoc = typeof role === 'object' ? role : await RoleModel.findById(role);
      if (roleDoc?.permissions) {
        permissions.push(...roleDoc.permissions.map(p => p.code || p));
      }
    }

    return permissions;
  }

  /**
   * @private
   * Checks if user has permission
   */
  #hasPermission(userPermissions, requiredPermission) {
    // Exact match
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // Wildcard match (e.g., 'users:*' matches 'users:read')
    const permParts = requiredPermission.split(':');
    for (const userPerm of userPermissions) {
      const userParts = userPerm.split(':');
      
      let matches = true;
      for (let i = 0; i < permParts.length; i++) {
        if (userParts[i] !== '*' && userParts[i] !== permParts[i]) {
          matches = false;
          break;
        }
      }
      
      if (matches) return true;
    }

    return false;
  }

  /**
   * @private
   * Gets nested value from object
   */
  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * @private
   * Evaluates attribute condition
   */
  #evaluateAttributeCondition(value, condition) {
    if (condition.$eq !== undefined) return value === condition.$eq;
    if (condition.$ne !== undefined) return value !== condition.$ne;
    if (condition.$gt !== undefined) return value > condition.$gt;
    if (condition.$gte !== undefined) return value >= condition.$gte;
    if (condition.$lt !== undefined) return value < condition.$lt;
    if (condition.$lte !== undefined) return value <= condition.$lte;
    if (condition.$in !== undefined) return condition.$in.includes(value);
    if (condition.$nin !== undefined) return !condition.$nin.includes(value);
    if (condition.$regex !== undefined) return new RegExp(condition.$regex).test(value);
    
    return false;
  }

  /**
   * @private
   * Audits authorization denial
   */
  async #auditAuthorizationDenial(req, type, requirements, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'authorization.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          type,
          requirements,
          method: req.method,
          path: req.path,
          userRoles: req.auth?.user?.roles?.map(r => r.name || r),
          userPermissions: await this.#getUserPermissions(req.auth?.user || {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit authorization denial', { error: error.message });
    }
  }

  /**
   * @private
   * Tracks authorization metrics
   */
  #trackAuthorizationMetric(type, success, duration) {
    const key = `${type}:${success ? 'success' : 'failure'}`;
    const current = this.#authorizationMetrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.#authorizationMetrics.set(key, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `authz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets authorization metrics
   * @returns {Object} Authorization metrics
   */
  getMetrics() {
    const metrics = {};
    this.#authorizationMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates authorization middleware instance
 * @param {Object} [config] - Middleware configuration
 * @returns {AuthorizationMiddleware} Middleware instance
 */
const getAuthorizationMiddleware = (config) => {
  if (!instance) {
    instance = new AuthorizationMiddleware(config);
  }
  return instance;
};

module.exports = {
  AuthorizationMiddleware,
  getAuthorizationMiddleware,
  // Export convenience methods
  requireRoles: (roles, options) => getAuthorizationMiddleware().requireRoles(roles, options),
  requirePermissions: (permissions, options) => getAuthorizationMiddleware().requirePermissions(permissions, options),
  requireResourceAccess: (resourceType, action, resourceGetter, options) => 
    getAuthorizationMiddleware().requireResourceAccess(resourceType, action, resourceGetter, options),
  requireAttributes: (attributes, options) => getAuthorizationMiddleware().requireAttributes(attributes, options),
  requirePolicy: (policy, options) => getAuthorizationMiddleware().requirePolicy(policy, options),
  requireDynamic: (authFunction, options) => getAuthorizationMiddleware().requireDynamic(authFunction, options)
};