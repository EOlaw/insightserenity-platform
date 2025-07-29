'use strict';

/**
 * @fileoverview Admin authentication middleware with enhanced security
 * @module servers/admin-server/middleware/admin-auth
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/admin-user-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:servers/admin-server/config
 */

const { authenticate, authorize } = require('../../../shared/lib/auth/middleware');
const logger = require('../../../shared/lib/utils/logger');
const AppError = require('../../../shared/lib/utils/app-error');
const AdminUserModel = require('../../../shared/lib/database/models/admin-user-model');
const AuditLogModel = require('../../../shared/lib/database/models/audit-log-model');
const config = require('../config');
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');
const { ROLES, PERMISSIONS } = require('../../../shared/lib/utils/constants');

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
    requireTwoFactor: config.security?.requireTwoFactor !== false,
    sessionTimeout: config.security?.sessionTimeout || 3600000, // 1 hour
    maxFailedAttempts: config.security?.maxFailedAttempts || 5,
    lockoutDuration: config.security?.lockoutDuration || 1800000, // 30 minutes
    requirePasswordChange: config.security?.requirePasswordChange || 90, // days
    allowedRoles: config.security?.allowedRoles || [
      ROLES.SUPER_ADMIN,
      ROLES.PLATFORM_ADMIN,
      ROLES.SUPPORT_ADMIN,
      ROLES.BILLING_ADMIN
    ]
  };

  /**
   * Main authentication middleware for admin routes
   * @static
   * @returns {Function} Express middleware
   */
  static authenticate() {
    return async (req, res, next) => {
      try {
        // Use shared authentication first
        await authenticate()(req, res, async (error) => {
          if (error) {
            return next(error);
          }

          // Additional admin-specific checks
          const adminValidation = await this.#validateAdminUser(req.user);
          
          if (!adminValidation.isValid) {
            throw new AppError(
              adminValidation.reason || 'Admin authentication failed',
              401,
              ERROR_CODES.ADMIN_AUTH_FAILED,
              { userId: req.user?._id }
            );
          }

          // Enhance request with admin context
          req.admin = {
            ...req.user,
            permissions: adminValidation.permissions,
            restrictions: adminValidation.restrictions,
            lastActivity: new Date()
          };

          // Update last activity
          await this.#updateLastActivity(req.admin._id);

          next();
        });
      } catch (error) {
        logger.error('Admin authentication error', {
          error: error.message,
          userId: req.user?._id,
          ip: req.ip
        });
        next(error);
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
      try {
        // Ensure admin is authenticated
        if (!req.admin) {
          throw new AppError(
            'Admin authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED
          );
        }

        // Check for system maintenance mode
        if (config.maintenance?.enabled && !req.admin.permissions.includes(PERMISSIONS.BYPASS_MAINTENANCE)) {
          throw new AppError(
            'System is under maintenance',
            503,
            ERROR_CODES.MAINTENANCE_MODE
          );
        }

        // Normalize permissions
        const permissions = Array.isArray(requiredPermissions) 
          ? requiredPermissions 
          : [requiredPermissions];

        // Super admin bypasses all permission checks
        if (req.admin.role === ROLES.SUPER_ADMIN) {
          return next();
        }

        // Check permissions
        const hasPermission = permissions.some(permission => 
          req.admin.permissions.includes(permission)
        );

        if (!hasPermission) {
          await this.#logUnauthorizedAccess(req);
          
          throw new AppError(
            'Insufficient permissions',
            403,
            ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            { 
              required: permissions,
              actual: req.admin.permissions 
            }
          );
        }

        // Check for restricted operations
        if (req.admin.restrictions?.length > 0) {
          const restricted = req.admin.restrictions.some(restriction =>
            permissions.includes(restriction)
          );

          if (restricted) {
            throw new AppError(
              'Access to this operation is restricted',
              403,
              ERROR_CODES.OPERATION_RESTRICTED
            );
          }
        }

        next();
      } catch (error) {
        next(error);
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
      try {
        if (!req.admin) {
          throw new AppError(
            'Admin authentication required',
            401,
            ERROR_CODES.AUTHENTICATION_REQUIRED
          );
        }

        // Check if MFA is verified for this session
        if (!req.admin.mfaVerified || !req.session?.mfaVerifiedAt) {
          throw new AppError(
            'Multi-factor authentication required',
            401,
            ERROR_CODES.MFA_REQUIRED
          );
        }

        // Check MFA session timeout (15 minutes)
        const mfaTimeout = 900000;
        const mfaAge = Date.now() - new Date(req.session.mfaVerifiedAt).getTime();
        
        if (mfaAge > mfaTimeout) {
          throw new AppError(
            'MFA session expired',
            401,
            ERROR_CODES.MFA_SESSION_EXPIRED
          );
        }

        next();
      } catch (error) {
        next(error);
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
      [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
      [ROLES.PLATFORM_ADMIN]: [
        PERMISSIONS.MANAGE_PLATFORM,
        PERMISSIONS.MANAGE_ORGANIZATIONS,
        PERMISSIONS.VIEW_ALL_DATA,
        PERMISSIONS.MANAGE_CONFIGURATIONS,
        PERMISSIONS.ACCESS_MONITORING
      ],
      [ROLES.SUPPORT_ADMIN]: [
        PERMISSIONS.MANAGE_SUPPORT,
        PERMISSIONS.VIEW_USER_DATA,
        PERMISSIONS.MANAGE_TICKETS,
        PERMISSIONS.ACCESS_KNOWLEDGE_BASE
      ],
      [ROLES.BILLING_ADMIN]: [
        PERMISSIONS.MANAGE_BILLING,
        PERMISSIONS.VIEW_FINANCIAL_DATA,
        PERMISSIONS.MANAGE_SUBSCRIPTIONS,
        PERMISSIONS.GENERATE_REPORTS
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
    if (adminUser.role === ROLES.SUPPORT_ADMIN) {
      restrictions.push(
        PERMISSIONS.MODIFY_BILLING,
        PERMISSIONS.DELETE_ORGANIZATIONS,
        PERMISSIONS.MODIFY_SECURITY_SETTINGS
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
  static async #logUnauthorizedAccess(req) {
    try {
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
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to log unauthorized access', {
        error: error.message
      });
    }
  }
}

// Export middleware functions
module.exports = {
  authenticate: AdminAuthMiddleware.authenticate.bind(AdminAuthMiddleware),
  authorize: AdminAuthMiddleware.authorize.bind(AdminAuthMiddleware),
  requireMFA: AdminAuthMiddleware.requireMFA.bind(AdminAuthMiddleware)
};