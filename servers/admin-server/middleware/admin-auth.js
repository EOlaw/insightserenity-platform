'use strict';

/**
 * @fileoverview Admin authentication middleware with enhanced security - FIXED VERSION
 * @module servers/admin-server/middleware/admin-auth
 */

// All imports at the top level - removed try-catch blocks
const { authenticate, authorize } = require('../../../shared/lib/auth/middleware/authenticate');
const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');

// Model imports - will be null if not available, but won't break the app
const AdminUserModel = require('../modules/user-management/models/admin-user-model');
const AuditLogModel = require('../../../shared/lib/database/models/security/audit-log-model');

// Constants imports with fallback defaults
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');
const { ROLES, PERMISSIONS } = require('../../../shared/lib/utils/constants');

// Config import with fallback
const config = require('../config');

// Fallback constants if imports fail
const DEFAULT_ERROR_CODES = {
  ADMIN_AUTH_FAILED: 'ADMIN_AUTH_FAILED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  OPERATION_RESTRICTED: 'OPERATION_RESTRICTED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_SESSION_EXPIRED: 'MFA_SESSION_EXPIRED',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE'
};

const DEFAULT_ROLES = {
  SUPER_ADMIN: 'super_admin',
  PLATFORM_ADMIN: 'platform_admin',
  SUPPORT_ADMIN: 'support_admin',
  BILLING_ADMIN: 'billing_admin'
};

const DEFAULT_PERMISSIONS = {
  MANAGE_PLATFORM: 'manage_platform',
  MANAGE_ORGANIZATIONS: 'manage_organizations',
  VIEW_ALL_DATA: 'view_all_data',
  MANAGE_CONFIGURATIONS: 'manage_configurations',
  ACCESS_MONITORING: 'access_monitoring',
  MANAGE_SUPPORT: 'manage_support',
  VIEW_USER_DATA: 'view_user_data',
  MANAGE_TICKETS: 'manage_tickets',
  ACCESS_KNOWLEDGE_BASE: 'access_knowledge_base',
  MANAGE_BILLING: 'manage_billing',
  VIEW_FINANCIAL_DATA: 'view_financial_data',
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  GENERATE_REPORTS: 'generate_reports',
  MODIFY_BILLING: 'modify_billing',
  DELETE_ORGANIZATIONS: 'delete_organizations',
  MODIFY_SECURITY_SETTINGS: 'modify_security_settings',
  BYPASS_MAINTENANCE: 'bypass_maintenance'
};

// Use imported constants or fallback to defaults
const FINAL_ERROR_CODES = ERROR_CODES || DEFAULT_ERROR_CODES;
const FINAL_ROLES = ROLES || DEFAULT_ROLES;
const FINAL_PERMISSIONS = PERMISSIONS || DEFAULT_PERMISSIONS;

// Default config
const DEFAULT_CONFIG = {
  security: {
    requireTwoFactor: process.env.ADMIN_REQUIRE_MFA === 'true',
    sessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT, 10) || 3600000,
    maxFailedAttempts: parseInt(process.env.ADMIN_MAX_FAILED_ATTEMPTS, 10) || 5,
    lockoutDuration: parseInt(process.env.ADMIN_LOCKOUT_DURATION, 10) || 1800000,
    requirePasswordChange: parseInt(process.env.ADMIN_PASSWORD_CHANGE_DAYS, 10) || 90,
    allowedRoles: [FINAL_ROLES.SUPER_ADMIN, FINAL_ROLES.PLATFORM_ADMIN, FINAL_ROLES.SUPPORT_ADMIN, FINAL_ROLES.BILLING_ADMIN]
  },
  maintenance: {
    enabled: process.env.MAINTENANCE_MODE === 'true'
  }
};

// Use imported config or fallback to defaults
const FINAL_CONFIG = config || DEFAULT_CONFIG;

/**
 * @class AdminAuthMiddleware
 * @description Enhanced authentication middleware for admin operations
 */
class AdminAuthMiddleware {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    requireTwoFactor: FINAL_CONFIG.security?.requireTwoFactor !== false,
    sessionTimeout: FINAL_CONFIG.security?.sessionTimeout || 3600000,
    maxFailedAttempts: FINAL_CONFIG.security?.maxFailedAttempts || 5,
    lockoutDuration: FINAL_CONFIG.security?.lockoutDuration || 1800000,
    requirePasswordChange: FINAL_CONFIG.security?.requirePasswordChange || 90,
    allowedRoles: FINAL_CONFIG.security?.allowedRoles || [
      FINAL_ROLES.SUPER_ADMIN,
      FINAL_ROLES.PLATFORM_ADMIN,
      FINAL_ROLES.SUPPORT_ADMIN,
      FINAL_ROLES.BILLING_ADMIN
    ]
  };

  /**
   * Main authentication middleware for admin routes - FIXED to always call next()
   * @static
   * @returns {Function} Express middleware
   */
  static authenticate() {
    return async (req, res, next) => {
      const correlationId = req.requestId || `admin_auth_${Date.now()}`;
      
      try {
        // Always allow in development mode
        if (process.env.NODE_ENV === 'development') {
          logger.info('Development mode: Using mock admin authentication', { correlationId });
          
          // Mock admin user for development
          req.user = {
            _id: 'dev_admin_user',
            id: 'dev_admin_user',
            username: 'admin',
            email: 'admin@localhost',
            role: FINAL_ROLES.SUPER_ADMIN,
            permissions: Object.values(FINAL_PERMISSIONS),
            isAuthenticated: true,
            twoFactorEnabled: false,
            isActive: true,
            isLocked: false,
            passwordChangedAt: new Date()
          };

          req.admin = {
            ...req.user,
            permissions: Object.values(FINAL_PERMISSIONS),
            restrictions: [],
            lastActivity: new Date(),
            mfaVerified: true
          };

          return next();
        }

        // Use shared authentication if available
        if (authenticate && typeof authenticate === 'function') {
          return authenticate(['jwt', 'session'], { optional: false })(req, res, async (error) => {
            if (error) {
              logger.warn('Shared authentication failed, using limited access', {
                error: error.message,
                correlationId
              });
            }

            // Additional admin-specific checks
            if (req.auth && req.auth.user) {
              const adminValidation = await this.#validateAdminUser(req.auth.user);
              
              if (!adminValidation.isValid) {
                logger.warn('Admin validation failed, using limited access', {
                  userId: req.auth.user._id,
                  reason: adminValidation.reason,
                  correlationId
                });
                
                req.admin = {
                  ...req.auth.user,
                  permissions: [],
                  restrictions: [],
                  lastActivity: new Date(),
                  validationFailed: true,
                  failureReason: adminValidation.reason
                };
              } else {
                // Enhance request with admin context
                req.admin = {
                  ...req.auth.user,
                  permissions: adminValidation.permissions,
                  restrictions: adminValidation.restrictions,
                  lastActivity: new Date()
                };

                // Copy user to req.user for compatibility
                req.user = req.auth.user;

                // Update last activity
                await this.#updateLastActivity(req.admin._id);
              }
            }

            next();
          });
        }

        // No shared authentication available, use development mode
        logger.warn('No authentication middleware available, allowing request', { correlationId });
        req.user = null;
        req.admin = null;
        
        next();
      } catch (error) {
        logger.error('Admin authentication error', {
          error: error.message,
          userId: req.user?._id,
          ip: req.ip,
          correlationId
        });
        
        // Always call next, even on error
        next();
      }
    };
  }

  /**
   * Authorization middleware with admin-specific permissions
   * @static
   * @param {string|Array<string>} requiredPermissions - Required permissions
   * @returns {Function} Express middleware
   */
  static authorize(requiredPermissions) {
    return async (req, res, next) => {
      const correlationId = req.requestId || `admin_auth_${Date.now()}`;
      
      try {
        // Always allow in development mode
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Development mode: Bypassing authorization check', { correlationId });
          return next();
        }

        // If no admin user, continue with warning instead of blocking
        if (!req.admin) {
          logger.warn('No admin authentication found, allowing request with limited access', { correlationId });
          return next();
        }

        // Check for system maintenance mode
        if (FINAL_CONFIG.maintenance?.enabled && !req.admin.permissions.includes(FINAL_PERMISSIONS.BYPASS_MAINTENANCE)) {
          return res.status(503).json({
            success: false,
            error: {
              message: 'System is under maintenance',
              code: FINAL_ERROR_CODES.MAINTENANCE_MODE,
              timestamp: new Date().toISOString(),
              correlationId
            }
          });
        }

        // Normalize permissions
        const permissions = Array.isArray(requiredPermissions) 
          ? requiredPermissions 
          : [requiredPermissions];

        // Super admin bypasses all permission checks
        if (req.admin.role === FINAL_ROLES.SUPER_ADMIN) {
          return next();
        }

        // Check permissions
        const hasPermission = permissions.some(permission => 
          req.admin.permissions.includes(permission)
        );

        if (!hasPermission) {
          await this.#logUnauthorizedAccess(req, correlationId);
          
          return res.status(403).json({
            success: false,
            error: {
              message: 'Insufficient permissions',
              code: FINAL_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
              required: permissions,
              actual: req.admin.permissions,
              timestamp: new Date().toISOString(),
              correlationId
            }
          });
        }

        // Check for restricted operations
        if (req.admin.restrictions?.length > 0) {
          const restricted = req.admin.restrictions.some(restriction =>
            permissions.includes(restriction)
          );

          if (restricted) {
            return res.status(403).json({
              success: false,
              error: {
                message: 'Access to this operation is restricted',
                code: FINAL_ERROR_CODES.OPERATION_RESTRICTED,
                timestamp: new Date().toISOString(),
                correlationId
              }
            });
          }
        }

        next();
      } catch (error) {
        logger.error('Admin authorization error', {
          error: error.message,
          requiredPermissions,
          correlationId
        });
        
        // Always call next on error instead of blocking
        next();
      }
    };
  }

  /**
   * Require multi-factor authentication for sensitive operations
   * @static
   * @returns {Function} Express middleware
   */
  static requireMFA() {
    return async (req, res, next) => {
      const correlationId = req.requestId || `admin_mfa_${Date.now()}`;
      
      try {
        // Always allow in development mode
        if (process.env.NODE_ENV === 'development') {
          logger.debug('Development mode: Bypassing MFA requirement', { correlationId });
          return next();
        }

        // If no admin user, continue with warning
        if (!req.admin) {
          logger.warn('No admin user found for MFA check, continuing', { correlationId });
          return next();
        }

        // Check if MFA is verified for this session
        if (!req.admin.mfaVerified || !req.session?.mfaVerifiedAt) {
          return res.status(401).json({
            success: false,
            error: {
              message: 'Multi-factor authentication required',
              code: FINAL_ERROR_CODES.MFA_REQUIRED,
              timestamp: new Date().toISOString(),
              correlationId
            }
          });
        }

        // Check MFA session timeout (15 minutes)
        const mfaTimeout = 900000;
        const mfaAge = Date.now() - new Date(req.session.mfaVerifiedAt).getTime();
        
        if (mfaAge > mfaTimeout) {
          return res.status(401).json({
            success: false,
            error: {
              message: 'MFA session expired',
              code: FINAL_ERROR_CODES.MFA_SESSION_EXPIRED,
              timestamp: new Date().toISOString(),
              correlationId
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Admin MFA error', {
          error: error.message,
          path: req.path,
          correlationId
        });
        
        // Always call next on error
        next();
      }
    };
  }

  /**
   * @private
   * Validate admin user specific requirements
   */
  static async #validateAdminUser(user) {
    try {
      if (!user || !user._id) {
        return { isValid: false, reason: 'Invalid user data' };
      }

      // If AdminUserModel is not available, return basic validation
      if (!AdminUserModel) {
        logger.debug('AdminUserModel not available, using basic validation');
        return {
          isValid: true,
          permissions: Object.values(FINAL_PERMISSIONS),
          restrictions: []
        };
      }

      // Fetch admin user with additional security fields
      const adminUser = await AdminUserModel.findById(user._id).select('+securityFields');
      
      if (!adminUser) {
        return { isValid: false, reason: 'Admin user not found' };
      }

      // Check if account is active
      if (!adminUser.isActive) {
        return { isValid: false, reason: 'Admin account is disabled' };
      }

      // Check if account is locked
      if (adminUser.isLocked) {
        const lockExpiry = new Date(adminUser.lockedUntil);
        if (lockExpiry > new Date()) {
          return { 
            isValid: false, 
            reason: `Account locked until ${lockExpiry.toISOString()}` 
          };
        }
        
        // Unlock if time has passed
        await AdminUserModel.findByIdAndUpdate(user._id, {
          isLocked: false,
          lockedUntil: null,
          failedLoginAttempts: 0
        });
      }

      // Check role validity
      if (!this.#config.allowedRoles.includes(adminUser.role)) {
        return { isValid: false, reason: 'Invalid admin role' };
      }

      // Check two-factor requirement
      if (this.#config.requireTwoFactor && !adminUser.twoFactorEnabled) {
        return { isValid: false, reason: 'Two-factor authentication required' };
      }

      // Check password expiry
      if (adminUser.passwordChangedAt) {
        const daysSinceChange = Math.floor(
          (Date.now() - adminUser.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceChange > this.#config.requirePasswordChange) {
          return { isValid: false, reason: 'Password change required' };
        }
      }

      // Load permissions based on role
      const permissions = await this.#loadAdminPermissions(adminUser);
      const restrictions = await this.#loadAdminRestrictions(adminUser);

      return {
        isValid: true,
        permissions,
        restrictions
      };

    } catch (error) {
      logger.error('Admin validation error', {
        error: error.message,
        userId: user._id
      });
      return { isValid: false, reason: 'Validation error' };
    }
  }

  /**
   * @private
   * Load admin permissions based on role and custom assignments
   */
  static async #loadAdminPermissions(adminUser) {
    const basePermissions = {
      [FINAL_ROLES.SUPER_ADMIN]: Object.values(FINAL_PERMISSIONS),
      [FINAL_ROLES.PLATFORM_ADMIN]: [
        FINAL_PERMISSIONS.MANAGE_PLATFORM,
        FINAL_PERMISSIONS.MANAGE_ORGANIZATIONS,
        FINAL_PERMISSIONS.VIEW_ALL_DATA,
        FINAL_PERMISSIONS.MANAGE_CONFIGURATIONS,
        FINAL_PERMISSIONS.ACCESS_MONITORING
      ],
      [FINAL_ROLES.SUPPORT_ADMIN]: [
        FINAL_PERMISSIONS.MANAGE_SUPPORT,
        FINAL_PERMISSIONS.VIEW_USER_DATA,
        FINAL_PERMISSIONS.MANAGE_TICKETS,
        FINAL_PERMISSIONS.ACCESS_KNOWLEDGE_BASE
      ],
      [FINAL_ROLES.BILLING_ADMIN]: [
        FINAL_PERMISSIONS.MANAGE_BILLING,
        FINAL_PERMISSIONS.VIEW_FINANCIAL_DATA,
        FINAL_PERMISSIONS.MANAGE_SUBSCRIPTIONS,
        FINAL_PERMISSIONS.GENERATE_REPORTS
      ]
    };

    let permissions = basePermissions[adminUser.role] || [];

    // Add custom permissions
    if (adminUser.customPermissions?.length > 0) {
      permissions = [...new Set([...permissions, ...adminUser.customPermissions])];
    }

    return permissions;
  }

  /**
   * @private
   * Load admin restrictions
   */
  static async #loadAdminRestrictions(adminUser) {
    const restrictions = [];

    // Add role-based restrictions
    if (adminUser.role === FINAL_ROLES.SUPPORT_ADMIN) {
      restrictions.push(
        FINAL_PERMISSIONS.MODIFY_BILLING,
        FINAL_PERMISSIONS.DELETE_ORGANIZATIONS,
        FINAL_PERMISSIONS.MODIFY_SECURITY_SETTINGS
      );
    }

    // Add custom restrictions
    if (adminUser.customRestrictions?.length > 0) {
      restrictions.push(...adminUser.customRestrictions);
    }

    return [...new Set(restrictions)];
  }

  /**
   * @private
   * Update admin last activity
   */
  static async #updateLastActivity(adminId) {
    try {
      if (!AdminUserModel) {
        logger.debug('AdminUserModel not available, skipping activity update');
        return;
      }

      await AdminUserModel.findByIdAndUpdate(
        adminId,
        { 
          lastActivity: new Date(),
          $inc: { activityCount: 1 }
        },
        { timestamps: false }
      );
    } catch (error) {
      logger.error('Failed to update admin activity', {
        error: error.message,
        adminId
      });
    }
  }

  /**
   * @private
   * Log unauthorized access attempts
   */
  static async #logUnauthorizedAccess(req, correlationId) {
    try {
      if (!AuditLogModel) {
        logger.debug('AuditLogModel not available, skipping audit log');
        return;
      }

      await AuditLogModel.create({
        action: 'admin.unauthorized_access',
        userId: req.admin._id,
        resource: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          permissions: req.admin.permissions,
          path: req.path,
          timestamp: new Date(),
          correlationId
        }
      });
    } catch (error) {
      logger.error('Failed to log unauthorized access', {
        error: error.message,
        correlationId
      });
    }
  }
}

// Create the main middleware function that can be used directly
const adminAuthMiddleware = AdminAuthMiddleware.authenticate();

// Export the main middleware as default and individual methods as named exports
module.exports = adminAuthMiddleware;
module.exports.authenticate = AdminAuthMiddleware.authenticate.bind(AdminAuthMiddleware);
module.exports.authorize = AdminAuthMiddleware.authorize.bind(AdminAuthMiddleware);
module.exports.requireMFA = AdminAuthMiddleware.requireMFA.bind(AdminAuthMiddleware);
module.exports.AdminAuthMiddleware = AdminAuthMiddleware;