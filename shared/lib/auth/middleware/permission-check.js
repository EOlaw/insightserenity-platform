'use strict';

/**
 * @fileoverview Permission checking middleware for fine-grained access control
 * @module shared/lib/auth/middleware/permission-check
 * @requires module:shared/lib/security/access-control/permission-service
 * @requires module:shared/lib/security/access-control/rbac-service
 * @requires module:shared/lib/security/access-control/policy-engine
 * @requires module:shared/lib/database/models/permission-model
 * @requires module:shared/lib/database/models/role-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/resource-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const PermissionService = require('../../security/access-control/permission-service');
const RBACService = require('../../security/access-control/rbac-service');
const PolicyEngine = require('../../security/access-control/policy-engine');
const PermissionModel = require('../../database/models/users/permission-model');
const RoleModel = require('../../database/models/users/role-model');
const UserModel = require('../../database/models/users/user-model');
const ResourceModel = require('../../../../servers/customer-services/modules/hosted-organizations/tenants/models/tenant-resource-model');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class PermissionCheckMiddleware
 * @description Advanced permission checking with policy-based access control
 */
class PermissionCheckMiddleware {
  /**
   * @private
   * @type {PermissionService}
   */
  #permissionService;

  /**
   * @private
   * @type {RBACService}
   */
  #rbacService;

  /**
   * @private
   * @type {PolicyEngine}
   */
  #policyEngine;

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
  #permissionMetrics;

  /**
   * @private
   * @type {Map}
   */
  #compiledPolicies;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    permissions: {
      enableWildcards: true,
      enableInheritance: true,
      enableDelegation: true,
      enableTimeBasedPermissions: true,
      enableConditionalPermissions: true,
      enableResourcePermissions: true,
      defaultDeny: true
    },
    evaluation: {
      cacheResults: true,
      cacheTTL: 300, // 5 minutes
      parallelEvaluation: true,
      maxEvaluationDepth: 10,
      evaluationTimeout: 5000 // 5 seconds
    },
    policies: {
      enableCustomPolicies: true,
      enablePolicyInheritance: true,
      policyPriority: ['explicit', 'resource', 'role', 'default'],
      conflictResolution: 'deny' // 'deny', 'allow', 'priority'
    },
    resources: {
      enableResourceHierarchy: true,
      enableResourceTags: true,
      enableResourceOwnership: true,
      ownershipOverride: true
    },
    audit: {
      logPermissionChecks: true,
      logDetailedEvaluation: false,
      includeRequestContext: true,
      sensitivePermissions: ['admin.*', '*.delete', '*.sensitive']
    },
    performance: {
      enableBatchChecking: true,
      batchSize: 100,
      enableLazyLoading: true,
      preloadCommonPermissions: true
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #PERMISSION_TYPES = {
    EXPLICIT: 'explicit',
    WILDCARD: 'wildcard',
    INHERITED: 'inherited',
    DELEGATED: 'delegated',
    CONDITIONAL: 'conditional',
    TIME_BASED: 'time_based',
    RESOURCE_BASED: 'resource_based'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #EVALUATION_RESULTS = {
    ALLOW: 'allow',
    DENY: 'deny',
    ABSTAIN: 'abstain',
    NOT_APPLICABLE: 'not_applicable'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #PERMISSION_EFFECTS = {
    ALLOW: 'allow',
    DENY: 'deny',
    CONDITIONAL_ALLOW: 'conditional_allow',
    CONDITIONAL_DENY: 'conditional_deny'
  };

  /**
   * Creates permission check middleware instance
   * @param {Object} [config] - Middleware configuration
   * @param {PermissionService} [permissionService] - Permission service instance
   * @param {RBACService} [rbacService] - RBAC service instance
   * @param {PolicyEngine} [policyEngine] - Policy engine instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   */
  constructor(
    config = {},
    permissionService,
    rbacService,
    policyEngine,
    cacheService,
    auditService
  ) {
    this.#config = this.#mergeConfig(config);
    this.#permissionService = permissionService || new PermissionService();
    this.#rbacService = rbacService || new RBACService();
    this.#policyEngine = policyEngine || new PolicyEngine();
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#permissionMetrics = new Map();
    this.#compiledPolicies = new Map();

    // Preload common permissions if enabled
    if (this.#config.performance.preloadCommonPermissions) {
      this.#preloadCommonPermissions();
    }

    logger.info('PermissionCheckMiddleware initialized', {
      wildcards: this.#config.permissions.enableWildcards,
      inheritance: this.#config.permissions.enableInheritance,
      defaultDeny: this.#config.permissions.defaultDeny,
      policyPriority: this.#config.policies.policyPriority
    });
  }

  /**
   * Checks single permission
   * @param {string} permission - Permission to check
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkPermission(permission, options = {}) {
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
        const context = this.#buildEvaluationContext(req, options);

        // Check permission
        const result = await this.#evaluatePermission(
          user,
          permission,
          context,
          correlationId
        );

        if (!result.allowed) {
          const duration = Date.now() - startTime;
          
          // Audit permission denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditPermissionDenial(
              req,
              permission,
              result,
              correlationId
            );
          }

          throw new AppError(
            `Permission denied: ${permission}`,
            403,
            ERROR_CODES.PERMISSION_DENIED,
            {
              correlationId,
              permission,
              reason: result.reason,
              evaluationType: result.type
            }
          );
        }

        // Track metrics
        this.#trackPermissionMetric(permission, true, Date.now() - startTime);

        // Enhance request with permission data
        req.permissions = {
          ...(req.permissions || {}),
          checked: [...(req.permissions?.checked || []), permission],
          granted: [...(req.permissions?.granted || []), permission],
          context: result.context,
          timestamp: new Date()
        };

        logger.debug('Permission check passed', {
          correlationId,
          userId: user._id,
          permission,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackPermissionMetric(permission, false, duration);

        logger.error('Permission check failed', {
          correlationId,
          permission,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Permission check error',
          500,
          ERROR_CODES.PERMISSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Checks multiple permissions
   * @param {Array<string>} permissions - Permissions to check
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkPermissions(permissions, options = {}) {
    const operator = options.operator || 'AND'; // AND, OR, EXACT

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
        const context = this.#buildEvaluationContext(req, options);

        // Batch evaluate permissions
        const results = await this.#batchEvaluatePermissions(
          user,
          permissions,
          context,
          correlationId
        );

        // Apply operator logic
        let allowed = false;
        let deniedPermissions = [];
        let grantedPermissions = [];

        switch (operator) {
          case 'AND':
            allowed = results.every(r => r.allowed);
            deniedPermissions = results.filter(r => !r.allowed).map(r => r.permission);
            grantedPermissions = results.filter(r => r.allowed).map(r => r.permission);
            break;

          case 'OR':
            allowed = results.some(r => r.allowed);
            deniedPermissions = results.filter(r => !r.allowed).map(r => r.permission);
            grantedPermissions = results.filter(r => r.allowed).map(r => r.permission);
            break;

          case 'EXACT':
            allowed = results.length === permissions.length && 
                     results.every(r => r.allowed);
            deniedPermissions = results.filter(r => !r.allowed).map(r => r.permission);
            grantedPermissions = results.filter(r => r.allowed).map(r => r.permission);
            break;
        }

        if (!allowed) {
          const duration = Date.now() - startTime;
          
          // Audit permission denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditBatchPermissionDenial(
              req,
              permissions,
              results,
              operator,
              correlationId
            );
          }

          throw new AppError(
            `Permissions denied: ${deniedPermissions.join(', ')}`,
            403,
            ERROR_CODES.PERMISSIONS_DENIED,
            {
              correlationId,
              required: permissions,
              denied: deniedPermissions,
              granted: grantedPermissions,
              operator
            }
          );
        }

        // Track metrics
        permissions.forEach(permission => {
          this.#trackPermissionMetric(permission, true, Date.now() - startTime);
        });

        // Enhance request with permission data
        req.permissions = {
          ...(req.permissions || {}),
          checked: [...(req.permissions?.checked || []), ...permissions],
          granted: [...(req.permissions?.granted || []), ...grantedPermissions],
          timestamp: new Date()
        };

        logger.debug('Batch permission check passed', {
          correlationId,
          userId: user._id,
          permissions,
          operator,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        permissions.forEach(permission => {
          this.#trackPermissionMetric(permission, false, duration);
        });

        logger.error('Batch permission check failed', {
          correlationId,
          permissions,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Permission check error',
          500,
          ERROR_CODES.PERMISSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Checks resource-based permissions
   * @param {string} resourceType - Resource type
   * @param {string} action - Action on resource
   * @param {Function} [resourceGetter] - Function to get resource
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkResourcePermission(resourceType, action, resourceGetter, options = {}) {
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
        const resource = resourceGetter ? await resourceGetter(req) : null;
        
        // Build resource permission
        const permission = this.#buildResourcePermission(
          resourceType,
          action,
          resource
        );

        const context = {
          ...this.#buildEvaluationContext(req, options),
          resource: {
            type: resourceType,
            id: resource?._id || resource?.id,
            data: resource,
            tags: resource?.tags || [],
            owner: resource?.ownerId || resource?.owner
          }
        };

        // Check ownership if enabled
        if (this.#config.resources.enableResourceOwnership && 
            this.#config.resources.ownershipOverride &&
            context.resource.owner) {
          const isOwner = this.#checkResourceOwnership(user, context.resource);
          if (isOwner) {
            logger.debug('Resource access granted by ownership', {
              correlationId,
              userId: user._id,
              resourceType,
              resourceId: context.resource.id
            });
            return next();
          }
        }

        // Evaluate permission
        const result = await this.#evaluatePermission(
          user,
          permission,
          context,
          correlationId
        );

        if (!result.allowed) {
          const duration = Date.now() - startTime;
          
          // Audit resource permission denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditResourcePermissionDenial(
              req,
              resourceType,
              action,
              resource,
              result,
              correlationId
            );
          }

          throw new AppError(
            `Resource permission denied: ${resourceType}:${action}`,
            403,
            ERROR_CODES.RESOURCE_PERMISSION_DENIED,
            {
              correlationId,
              resourceType,
              action,
              resourceId: context.resource.id,
              reason: result.reason
            }
          );
        }

        // Track metrics
        this.#trackPermissionMetric(permission, true, Date.now() - startTime);

        // Enhance request with permission data
        req.permissions = {
          ...(req.permissions || {}),
          resource: {
            type: resourceType,
            action,
            id: context.resource.id,
            granted: true
          },
          timestamp: new Date()
        };

        logger.debug('Resource permission check passed', {
          correlationId,
          userId: user._id,
          resourceType,
          action,
          resourceId: context.resource.id,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackPermissionMetric(`${resourceType}:${action}`, false, duration);

        logger.error('Resource permission check failed', {
          correlationId,
          resourceType,
          action,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Permission check error',
          500,
          ERROR_CODES.PERMISSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Policy-based permission check
   * @param {string|Object} policy - Policy name or object
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkPolicy(policy, options = {}) {
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
        const context = this.#buildEvaluationContext(req, options);

        // Get or compile policy
        const compiledPolicy = await this.#getCompiledPolicy(policy);

        // Evaluate policy
        const result = await this.#evaluatePolicy(
          user,
          compiledPolicy,
          context,
          correlationId
        );

        if (!result.allowed) {
          const duration = Date.now() - startTime;
          
          // Audit policy denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditPolicyDenial(
              req,
              policy,
              result,
              correlationId
            );
          }

          throw new AppError(
            `Policy denied: ${typeof policy === 'string' ? policy : 'custom'}`,
            403,
            ERROR_CODES.POLICY_DENIED,
            {
              correlationId,
              policy: typeof policy === 'string' ? policy : 'custom',
              reason: result.reason,
              obligations: result.obligations
            }
          );
        }

        // Apply obligations if any
        if (result.obligations && result.obligations.length > 0) {
          await this.#applyObligations(req, res, result.obligations);
        }

        // Track metrics
        this.#trackPermissionMetric(
          `policy:${typeof policy === 'string' ? policy : 'custom'}`,
          true,
          Date.now() - startTime
        );

        // Enhance request with policy data
        req.permissions = {
          ...(req.permissions || {}),
          policy: {
            name: typeof policy === 'string' ? policy : 'custom',
            result: result.effect,
            obligations: result.obligations,
            advice: result.advice
          },
          timestamp: new Date()
        };

        logger.debug('Policy check passed', {
          correlationId,
          userId: user._id,
          policy: typeof policy === 'string' ? policy : 'custom',
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackPermissionMetric(
          `policy:${typeof policy === 'string' ? policy : 'custom'}`,
          false,
          duration
        );

        logger.error('Policy check failed', {
          correlationId,
          policy: typeof policy === 'string' ? policy : 'custom',
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Policy check error',
          500,
          ERROR_CODES.POLICY_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Dynamic permission check with custom evaluator
   * @param {Function} evaluator - Permission evaluator function
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkDynamicPermission(evaluator, options = {}) {
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
        const context = this.#buildEvaluationContext(req, options);

        // Build evaluation helpers
        const helpers = {
          hasPermission: (permission) => this.#evaluatePermission(user, permission, context, correlationId),
          hasRole: (role) => this.#userHasRole(user, role),
          checkPolicy: (policy) => this.#evaluatePolicy(user, policy, context, correlationId),
          getResourceOwner: (resource) => resource?.ownerId || resource?.owner,
          isResourceOwner: (resource) => this.#checkResourceOwnership(user, { owner: resource?.ownerId || resource?.owner })
        };

        // Execute evaluator
        const result = await evaluator(req, user, context, helpers);

        const allowed = result === true || result?.allowed === true;

        if (!allowed) {
          const duration = Date.now() - startTime;
          
          // Audit dynamic permission denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditDynamicPermissionDenial(
              req,
              result,
              correlationId
            );
          }

          throw new AppError(
            result?.message || 'Dynamic permission denied',
            403,
            ERROR_CODES.DYNAMIC_PERMISSION_DENIED,
            {
              correlationId,
              reason: result?.reason || 'Dynamic check failed'
            }
          );
        }

        // Track metrics
        this.#trackPermissionMetric('dynamic', true, Date.now() - startTime);

        // Enhance request with permission data
        req.permissions = {
          ...(req.permissions || {}),
          dynamic: {
            result: allowed,
            metadata: result?.metadata
          },
          timestamp: new Date()
        };

        logger.debug('Dynamic permission check passed', {
          correlationId,
          userId: user._id,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackPermissionMetric('dynamic', false, duration);

        logger.error('Dynamic permission check failed', {
          correlationId,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Permission check error',
          500,
          ERROR_CODES.PERMISSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Conditional permission check
   * @param {string} permission - Base permission
   * @param {Object} conditions - Permission conditions
   * @param {Object} [options] - Check options
   * @returns {Function} Express middleware function
   */
  checkConditionalPermission(permission, conditions, options = {}) {
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
        const context = this.#buildEvaluationContext(req, options);

        // Check base permission first
        const baseResult = await this.#evaluatePermission(
          user,
          permission,
          context,
          correlationId
        );

        if (!baseResult.allowed) {
          throw new AppError(
            `Base permission denied: ${permission}`,
            403,
            ERROR_CODES.PERMISSION_DENIED,
            { correlationId, permission }
          );
        }

        // Evaluate conditions
        const conditionResults = await this.#evaluateConditions(
          conditions,
          req,
          user,
          context
        );

        if (!conditionResults.passed) {
          const duration = Date.now() - startTime;
          
          // Audit conditional permission denial
          if (this.#config.audit.logPermissionChecks) {
            await this.#auditConditionalPermissionDenial(
              req,
              permission,
              conditions,
              conditionResults,
              correlationId
            );
          }

          throw new AppError(
            `Conditional permission denied: ${permission}`,
            403,
            ERROR_CODES.CONDITIONAL_PERMISSION_DENIED,
            {
              correlationId,
              permission,
              failedConditions: conditionResults.failed
            }
          );
        }

        // Track metrics
        this.#trackPermissionMetric(`conditional:${permission}`, true, Date.now() - startTime);

        // Enhance request with permission data
        req.permissions = {
          ...(req.permissions || {}),
          conditional: {
            permission,
            conditions: conditionResults.evaluated,
            passed: conditionResults.passed
          },
          timestamp: new Date()
        };

        logger.debug('Conditional permission check passed', {
          correlationId,
          userId: user._id,
          permission,
          conditions: Object.keys(conditions),
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        this.#trackPermissionMetric(`conditional:${permission}`, false, duration);

        logger.error('Conditional permission check failed', {
          correlationId,
          permission,
          error: error.message,
          duration
        });

        next(error instanceof AppError ? error : new AppError(
          'Permission check error',
          500,
          ERROR_CODES.PERMISSION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * @private
   * Merges configuration
   */
  #mergeConfig(config) {
    const merged = JSON.parse(JSON.stringify(PermissionCheckMiddleware.#DEFAULT_CONFIG));

    // Deep merge configuration
    Object.keys(config).forEach(key => {
      if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
        merged[key] = { ...merged[key], ...config[key] };
      } else {
        merged[key] = config[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Builds evaluation context
   */
  #buildEvaluationContext(req, options) {
    return {
      request: {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        headers: this.#sanitizeHeaders(req.headers),
        ip: req.ip || req.connection.remoteAddress,
        timestamp: new Date()
      },
      user: {
        id: req.auth.user._id,
        roles: req.auth.user.roles?.map(r => r.name || r) || [],
        organizationId: req.auth.user.organizationId,
        attributes: req.auth.user.attributes || {}
      },
      session: req.session ? {
        id: req.session.id,
        createdAt: req.session.createdAt
      } : null,
      environment: {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        environment: process.env.NODE_ENV
      },
      custom: options.context || {}
    };
  }

  /**
   * @private
   * Evaluates single permission
   */
  async #evaluatePermission(user, permission, context, correlationId) {
    const cacheKey = `perm:${user._id}:${permission}:${JSON.stringify(context)}`;

    // Check cache
    if (this.#config.evaluation.cacheResults) {
      const cached = await this.#cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();
    let result = {
      allowed: false,
      permission,
      type: null,
      reason: null,
      context: {}
    };

    try {
      // Check explicit permissions
      const hasExplicit = await this.#checkExplicitPermission(user, permission);
      if (hasExplicit) {
        result = {
          allowed: true,
          permission,
          type: PermissionCheckMiddleware.#PERMISSION_TYPES.EXPLICIT,
          reason: 'Explicit permission granted'
        };
      }

      // Check wildcard permissions if enabled
      if (!result.allowed && this.#config.permissions.enableWildcards) {
        const hasWildcard = await this.#checkWildcardPermission(user, permission);
        if (hasWildcard) {
          result = {
            allowed: true,
            permission,
            type: PermissionCheckMiddleware.#PERMISSION_TYPES.WILDCARD,
            reason: 'Wildcard permission matched'
          };
        }
      }

      // Check inherited permissions if enabled
      if (!result.allowed && this.#config.permissions.enableInheritance) {
        const hasInherited = await this.#checkInheritedPermission(user, permission, context);
        if (hasInherited) {
          result = {
            allowed: true,
            permission,
            type: PermissionCheckMiddleware.#PERMISSION_TYPES.INHERITED,
            reason: 'Permission inherited from parent'
          };
        }
      }

      // Check role-based permissions
      if (!result.allowed) {
        const hasRolePermission = await this.#checkRolePermissions(user, permission);
        if (hasRolePermission) {
          result = {
            allowed: true,
            permission,
            type: 'role',
            reason: 'Permission granted through role'
          };
        }
      }

      // Check conditional permissions if enabled
      if (!result.allowed && this.#config.permissions.enableConditionalPermissions) {
        const conditionalResult = await this.#checkConditionalPermissions(user, permission, context);
        if (conditionalResult.allowed) {
          result = {
            allowed: true,
            permission,
            type: PermissionCheckMiddleware.#PERMISSION_TYPES.CONDITIONAL,
            reason: 'Conditional permission granted',
            context: conditionalResult.context
          };
        }
      }

      // Check time-based permissions if enabled
      if (!result.allowed && this.#config.permissions.enableTimeBasedPermissions) {
        const hasTimeBased = await this.#checkTimeBasedPermission(user, permission, context);
        if (hasTimeBased) {
          result = {
            allowed: true,
            permission,
            type: PermissionCheckMiddleware.#PERMISSION_TYPES.TIME_BASED,
            reason: 'Time-based permission granted'
          };
        }
      }

      // Apply default deny if configured
      if (!result.allowed && this.#config.permissions.defaultDeny) {
        result.reason = 'Default deny policy';
      }

    } catch (error) {
      logger.error('Permission evaluation error', {
        correlationId,
        permission,
        error: error.message
      });
      result.reason = 'Evaluation error';
    }

    // Cache result
    if (this.#config.evaluation.cacheResults) {
      await this.#cacheService.set(cacheKey, result, this.#config.evaluation.cacheTTL);
    }

    // Log detailed evaluation if enabled
    if (this.#config.audit.logDetailedEvaluation) {
      logger.debug('Permission evaluation completed', {
        correlationId,
        userId: user._id,
        permission,
        result,
        duration: Date.now() - startTime
      });
    }

    return result;
  }

  /**
   * @private
   * Batch evaluates permissions
   */
  async #batchEvaluatePermissions(user, permissions, context, correlationId) {
    if (!this.#config.performance.enableBatchChecking) {
      // Evaluate sequentially
      const results = [];
      for (const permission of permissions) {
        const result = await this.#evaluatePermission(user, permission, context, correlationId);
        results.push({ permission, ...result });
      }
      return results;
    }

    // Evaluate in parallel batches
    const results = [];
    const batchSize = this.#config.performance.batchSize;

    for (let i = 0; i < permissions.length; i += batchSize) {
      const batch = permissions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(permission => 
          this.#evaluatePermission(user, permission, context, correlationId)
            .then(result => ({ permission, ...result }))
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * @private
   * Evaluates policy
   */
  async #evaluatePolicy(user, policy, context, correlationId) {
    try {
      const result = await this.#policyEngine.evaluate(policy, {
        subject: user,
        context,
        correlationId
      });

      return {
        allowed: result.effect === PermissionCheckMiddleware.#EVALUATION_RESULTS.ALLOW,
        effect: result.effect,
        reason: result.reason,
        obligations: result.obligations || [],
        advice: result.advice || []
      };

    } catch (error) {
      logger.error('Policy evaluation error', {
        correlationId,
        policy: policy.name || 'custom',
        error: error.message
      });

      return {
        allowed: false,
        effect: PermissionCheckMiddleware.#EVALUATION_RESULTS.DENY,
        reason: 'Policy evaluation error'
      };
    }
  }

  /**
   * @private
   * Evaluates conditions
   */
  async #evaluateConditions(conditions, req, user, context) {
    const results = {
      passed: true,
      evaluated: {},
      failed: []
    };

    for (const [key, condition] of Object.entries(conditions)) {
      let conditionPassed = false;

      switch (key) {
        case 'timeWindow':
          conditionPassed = this.#evaluateTimeWindow(condition);
          break;

        case 'ipRange':
          conditionPassed = this.#evaluateIPRange(
            req.ip || req.connection.remoteAddress,
            condition
          );
          break;

        case 'organization':
          conditionPassed = user.organizationId === condition ||
                           (Array.isArray(condition) && condition.includes(user.organizationId));
          break;

        case 'attributes':
          conditionPassed = this.#evaluateAttributes(user.attributes || {}, condition);
          break;

        case 'custom':
          if (typeof condition === 'function') {
            conditionPassed = await condition(req, user, context);
          }
          break;

        default:
          // Check if it's a context path
          const contextValue = this.#getNestedValue(context, key);
          if (typeof condition === 'function') {
            conditionPassed = await condition(contextValue, context);
          } else {
            conditionPassed = contextValue === condition;
          }
      }

      results.evaluated[key] = conditionPassed;
      if (!conditionPassed) {
        results.passed = false;
        results.failed.push(key);
      }
    }

    return results;
  }

  /**
   * @private
   * Checks explicit permission
   */
  async #checkExplicitPermission(user, permission) {
    // Check direct user permissions
    const userPermissions = user.permissions?.map(p => p.code || p) || [];
    return userPermissions.includes(permission);
  }

  /**
   * @private
   * Checks wildcard permission
   */
  async #checkWildcardPermission(user, permission) {
    const userPermissions = await this.#getAllUserPermissions(user);
    
    // Check for wildcard matches
    const permParts = permission.split(':');
    
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
   * Checks inherited permission
   */
  async #checkInheritedPermission(user, permission, context) {
    // Check if permission can be inherited from parent permissions
    const permParts = permission.split(':');
    if (permParts.length <= 1) return false;

    // Build parent permissions
    const parentPermissions = [];
    for (let i = permParts.length - 1; i > 0; i--) {
      const parentPerm = permParts.slice(0, i).join(':') + ':*';
      parentPermissions.push(parentPerm);
    }

    // Check if user has any parent permission
    const userPermissions = await this.#getAllUserPermissions(user);
    return parentPermissions.some(parent => userPermissions.includes(parent));
  }

  /**
   * @private
   * Checks role permissions
   */
  async #checkRolePermissions(user, permission) {
    const roles = user.roles || [];
    
    for (const role of roles) {
      const roleDoc = typeof role === 'object' ? role : await RoleModel.findById(role);
      if (roleDoc?.permissions) {
        const rolePermissions = roleDoc.permissions.map(p => p.code || p);
        if (rolePermissions.includes(permission)) {
          return true;
        }
        
        // Check wildcard in role permissions
        if (this.#config.permissions.enableWildcards) {
          for (const rolePerm of rolePermissions) {
            if (this.#matchWildcardPermission(rolePerm, permission)) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  /**
   * @private
   * Checks conditional permissions
   */
  async #checkConditionalPermissions(user, permission, context) {
    // Get conditional permission rules
    const conditionalRules = await this.#getConditionalPermissionRules(permission);
    
    for (const rule of conditionalRules) {
      const conditions = rule.conditions || {};
      const conditionResults = await this.#evaluateConditions(conditions, null, user, context);
      
      if (conditionResults.passed) {
        return {
          allowed: true,
          context: {
            rule: rule.name,
            conditions: conditionResults.evaluated
          }
        };
      }
    }
    
    return { allowed: false };
  }

  /**
   * @private
   * Checks time-based permission
   */
  async #checkTimeBasedPermission(user, permission, context) {
    // Get time-based permission rules
    const timeRules = await this.#getTimeBasedPermissionRules(user, permission);
    
    const now = new Date();
    
    for (const rule of timeRules) {
      if (rule.startTime && new Date(rule.startTime) > now) continue;
      if (rule.endTime && new Date(rule.endTime) < now) continue;
      
      // Check recurring schedule
      if (rule.schedule) {
        const isInSchedule = this.#checkSchedule(now, rule.schedule);
        if (isInSchedule) return true;
      } else {
        return true; // Time range valid, no schedule restrictions
      }
    }
    
    return false;
  }

  /**
   * @private
   * Gets all user permissions
   */
  async #getAllUserPermissions(user) {
    const permissions = new Set();
    
    // Direct permissions
    if (user.permissions) {
      user.permissions.forEach(p => permissions.add(p.code || p));
    }
    
    // Role permissions
    if (user.roles) {
      for (const role of user.roles) {
        const roleDoc = typeof role === 'object' ? role : await RoleModel.findById(role);
        if (roleDoc?.permissions) {
          roleDoc.permissions.forEach(p => permissions.add(p.code || p));
        }
      }
    }
    
    return Array.from(permissions);
  }

  /**
   * @private
   * Matches wildcard permission
   */
  #matchWildcardPermission(pattern, permission) {
    const patternParts = pattern.split(':');
    const permParts = permission.split(':');
    
    if (patternParts.length > permParts.length) return false;
    
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== '*' && patternParts[i] !== permParts[i]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * @private
   * Builds resource permission
   */
  #buildResourcePermission(resourceType, action, resource) {
    if (resource?._id || resource?.id) {
      return `${resourceType}:${action}:${resource._id || resource.id}`;
    }
    return `${resourceType}:${action}`;
  }

  /**
   * @private
   * Checks resource ownership
   */
  #checkResourceOwnership(user, resource) {
    const userId = user._id?.toString() || user.id?.toString();
    const ownerId = resource.owner?.toString() || resource.ownerId?.toString();
    
    return userId === ownerId;
  }

  /**
   * @private
   * Gets compiled policy
   */
  async #getCompiledPolicy(policy) {
    if (typeof policy === 'string') {
      // Check cache
      if (this.#compiledPolicies.has(policy)) {
        return this.#compiledPolicies.get(policy);
      }
      
      // Load and compile policy
      const policyDoc = await this.#policyEngine.loadPolicy(policy);
      const compiled = await this.#policyEngine.compilePolicy(policyDoc);
      
      // Cache compiled policy
      this.#compiledPolicies.set(policy, compiled);
      
      return compiled;
    }
    
    // Compile inline policy
    return this.#policyEngine.compilePolicy(policy);
  }

  /**
   * @private
   * Gets conditional permission rules
   */
  async #getConditionalPermissionRules(permission) {
    // This would load from database
    return [];
  }

  /**
   * @private
   * Gets time-based permission rules
   */
  async #getTimeBasedPermissionRules(user, permission) {
    // This would load from database
    return [];
  }

  /**
   * @private
   * Checks schedule
   */
  #checkSchedule(date, schedule) {
    // Simple schedule check - would be more complex in production
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(date.getDay())) {
      return false;
    }
    
    if (schedule.hoursOfDay) {
      const hour = date.getHours();
      if (schedule.hoursOfDay.start !== undefined && hour < schedule.hoursOfDay.start) {
        return false;
      }
      if (schedule.hoursOfDay.end !== undefined && hour > schedule.hoursOfDay.end) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * @private
   * Evaluates time window
   */
  #evaluateTimeWindow(window) {
    const now = new Date();
    
    if (window.start && new Date(window.start) > now) return false;
    if (window.end && new Date(window.end) < now) return false;
    
    return true;
  }

  /**
   * @private
   * Evaluates IP range
   */
  #evaluateIPRange(ip, range) {
    // Simple IP check - would use proper IP range library in production
    if (Array.isArray(range)) {
      return range.includes(ip);
    }
    
    if (typeof range === 'string') {
      return ip === range || ip.startsWith(range);
    }
    
    return false;
  }

  /**
   * @private
   * Evaluates attributes
   */
  #evaluateAttributes(userAttributes, requiredAttributes) {
    for (const [key, value] of Object.entries(requiredAttributes)) {
      const userValue = userAttributes[key];
      
      if (typeof value === 'function') {
        if (!value(userValue)) return false;
      } else if (Array.isArray(value)) {
        if (!value.includes(userValue)) return false;
      } else {
        if (userValue !== value) return false;
      }
    }
    
    return true;
  }

  /**
   * @private
   * Gets nested value
   */
  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * @private
   * Sanitizes headers
   */
  #sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }

  /**
   * @private
   * Checks if user has role
   */
  #userHasRole(user, role) {
    const userRoles = user.roles?.map(r => r.name || r) || [];
    return userRoles.includes(role);
  }

  /**
   * @private
   * Applies obligations
   */
  async #applyObligations(req, res, obligations) {
    for (const obligation of obligations) {
      switch (obligation.type) {
        case 'log':
          logger.info('Policy obligation', {
            obligation: obligation.action,
            data: obligation.data
          });
          break;
          
        case 'header':
          res.setHeader(obligation.name, obligation.value);
          break;
          
        case 'audit':
          await this.#auditService.logEvent({
            event: 'policy.obligation',
            userId: req.auth?.user?._id,
            metadata: obligation
          });
          break;
      }
    }
  }

  /**
   * @private
   * Audits permission denial
   */
  async #auditPermissionDenial(req, permission, result, correlationId) {
    const isSensitive = this.#config.audit.sensitivePermissions.some(pattern => 
      this.#matchWildcardPermission(pattern, permission)
    );

    try {
      await this.#auditService.logEvent({
        event: 'permission.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        severity: isSensitive ? 'high' : 'medium',
        metadata: {
          permission,
          evaluationType: result.type,
          reason: result.reason,
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit permission denial', { error: error.message });
    }
  }

  /**
   * @private
   * Audits batch permission denial
   */
  async #auditBatchPermissionDenial(req, permissions, results, operator, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'permissions.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          permissions,
          operator,
          results: results.map(r => ({
            permission: r.permission,
            allowed: r.allowed,
            reason: r.reason
          })),
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit batch permission denial', { error: error.message });
    }
  }

  /**
   * @private
   * Audits resource permission denial
   */
  async #auditResourcePermissionDenial(req, resourceType, action, resource, result, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'resource.permission.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        severity: 'high',
        metadata: {
          resourceType,
          action,
          resourceId: resource?._id || resource?.id,
          reason: result.reason,
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit resource permission denial', { error: error.message });
    }
  }

  /**
   * @private
   * Audits policy denial
   */
  async #auditPolicyDenial(req, policy, result, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'policy.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          policy: typeof policy === 'string' ? policy : 'custom',
          effect: result.effect,
          reason: result.reason,
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit policy denial', { error: error.message });
    }
  }

  /**
   * @private
   * Audits dynamic permission denial
   */
  async #auditDynamicPermissionDenial(req, result, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'dynamic.permission.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          reason: result?.reason || 'Dynamic check failed',
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit dynamic permission denial', { error: error.message });
    }
  }

  /**
   * @private
   * Audits conditional permission denial
   */
  async #auditConditionalPermissionDenial(req, permission, conditions, results, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: 'conditional.permission.denied',
        userId: req.auth?.user?._id,
        organizationId: req.auth?.user?.organizationId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          permission,
          conditions: Object.keys(conditions),
          failedConditions: results.failed,
          evaluatedConditions: results.evaluated,
          ...(this.#config.audit.includeRequestContext ? {
            method: req.method,
            path: req.path
          } : {})
        }
      });
    } catch (error) {
      logger.error('Failed to audit conditional permission denial', { error: error.message });
    }
  }

  /**
   * @private
   * Tracks permission metric
   */
  #trackPermissionMetric(permission, allowed, duration) {
    const key = `${permission}:${allowed ? 'allowed' : 'denied'}`;
    const current = this.#permissionMetrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.#permissionMetrics.set(key, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * @private
   * Preloads common permissions
   */
  async #preloadCommonPermissions() {
    try {
      // Load commonly used permissions
      const commonPermissions = await PermissionModel.find({
        isCommon: true
      }).lean();

      // Precompile patterns
      for (const perm of commonPermissions) {
        if (perm.pattern) {
          this.#compiledPolicies.set(perm.code, {
            pattern: new RegExp(perm.pattern),
            effect: perm.effect
          });
        }
      }

      logger.info('Preloaded common permissions', {
        count: commonPermissions.length
      });

    } catch (error) {
      logger.error('Failed to preload common permissions', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets permission metrics
   * @returns {Object} Permission metrics
   */
  getMetrics() {
    const metrics = {};
    this.#permissionMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }

  /**
   * Clears permission cache
   * @param {string} [userId] - User ID to clear cache for
   * @returns {Promise<void>}
   */
  async clearCache(userId) {
    if (userId) {
      const pattern = `perm:${userId}:*`;
      await this.#cacheService.deletePattern(pattern);
      logger.info('Cleared permission cache for user', { userId });
    } else {
      await this.#cacheService.deletePattern('perm:*');
      logger.info('Cleared all permission cache');
    }
  }

  /**
   * Reloads permission policies
   * @returns {Promise<void>}
   */
  async reloadPolicies() {
    this.#compiledPolicies.clear();
    await this.#preloadCommonPermissions();
    logger.info('Reloaded permission policies');
  }
}

// Export singleton instance with factory function
let instance;

/**
 * Gets or creates permission check middleware instance
 * @param {Object} [config] - Middleware configuration
 * @returns {PermissionCheckMiddleware} Middleware instance
 */
const getPermissionCheckMiddleware = (config) => {
  if (!instance) {
    instance = new PermissionCheckMiddleware(config);
  }
  return instance;
};

module.exports = {
  PermissionCheckMiddleware,
  getPermissionCheckMiddleware,
  // Export convenience methods
  checkPermission: (permission, options) => getPermissionCheckMiddleware().checkPermission(permission, options),
  checkPermissions: (permissions, options) => getPermissionCheckMiddleware().checkPermissions(permissions, options),
  checkResourcePermission: (resourceType, action, resourceGetter, options) => 
    getPermissionCheckMiddleware().checkResourcePermission(resourceType, action, resourceGetter, options),
  checkPolicy: (policy, options) => getPermissionCheckMiddleware().checkPolicy(policy, options),
  checkDynamicPermission: (evaluator, options) => getPermissionCheckMiddleware().checkDynamicPermission(evaluator, options),
  checkConditionalPermission: (permission, conditions, options) => 
    getPermissionCheckMiddleware().checkConditionalPermission(permission, conditions, options)
};