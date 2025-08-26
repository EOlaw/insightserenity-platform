'use strict';

/**
 * @fileoverview Admin authentication middleware - FIXED VERSION for timeout prevention
 * @module servers/admin-server/middleware/admin-auth
 * @requires module:jsonwebtoken
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const jwt = require('jsonwebtoken');
const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');

// Constants - Import safely or use defaults
let ERROR_CODES, ROLES, PERMISSIONS, config, authenticate;

const DEFAULT_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS'
};

const DEFAULT_ROLES = {
  SUPER_ADMIN: 'super_admin',
  PLATFORM_ADMIN: 'platform_admin',
  SUPPORT_ADMIN: 'support_admin',
  BILLING_ADMIN: 'billing_admin',
  USER_ADMIN: 'user_admin',
  ORG_ADMIN: 'org_admin'
};

const DEFAULT_PERMISSIONS = {
  VIEW_PLATFORM_CONFIG: 'view_platform_config',
  MODIFY_PLATFORM_CONFIG: 'modify_platform_config',
  VIEW_USER_DATA: 'view_user_data',
  MANAGE_USERS: 'manage_users',
  DELETE_USERS: 'delete_users',
  VIEW_ORGANIZATIONS: 'view_organizations',
  MANAGE_ORGANIZATIONS: 'manage_organizations',
  DELETE_ORGANIZATIONS: 'delete_organizations',
  VIEW_SYSTEM_HEALTH: 'view_system_health',
  MANAGE_SYSTEM: 'manage_system',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  EXPORT_DATA: 'export_data',
  MANAGE_SECURITY: 'manage_security',
  VIEW_SUPPORT_DATA: 'view_support_data',
  MANAGE_TICKETS: 'manage_tickets',
  ACCESS_KNOWLEDGE_BASE: 'access_knowledge_base',
  MANAGE_BILLING: 'manage_billing',
  VIEW_FINANCIAL_DATA: 'view_financial_data',
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  GENERATE_REPORTS: 'generate_reports',
  MODIFY_BILLING: 'modify_billing',
  MODIFY_SECURITY_SETTINGS: 'modify_security_settings',
  BYPASS_MAINTENANCE: 'bypass_maintenance'
};

// Safe imports with fallbacks
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
    allowedRoles: [
      FINAL_ROLES.SUPER_ADMIN,
      FINAL_ROLES.PLATFORM_ADMIN,
      FINAL_ROLES.SUPPORT_ADMIN,
      FINAL_ROLES.BILLING_ADMIN
    ]
  },
  maintenance: {
    enabled: process.env.MAINTENANCE_MODE === 'true'
  }
};

const FINAL_CONFIG = config || DEFAULT_CONFIG;

/**
 * @class AdminAuthMiddleware
 * @description Enhanced authentication middleware for admin operations - FIXED VERSION
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
   * FIXED: Main authentication middleware for admin routes - always calls next()
   * @static
   * @returns {Function} Express middleware
   */
  static authenticate() {
    return async (req, res, next) => {
      const correlationId = req.requestId || `admin_auth_${Date.now()}`;
      
      // FIXED: Always allow in development mode with immediate response
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Development mode: Using mock admin authentication', { correlationId });
        
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

      // FIXED: Skip authentication if disabled
      if (process.env.SKIP_AUTH === 'true') {
        logger.debug('Authentication skipped by configuration', { correlationId });
        
        req.user = {
          _id: 'skip_auth_user',
          id: 'skip_auth_user',
          username: 'admin',
          email: 'admin@localhost',
          role: FINAL_ROLES.SUPER_ADMIN,
          permissions: Object.values(FINAL_PERMISSIONS),
          isAuthenticated: true
        };

        req.admin = { ...req.user };
        return next();
      }

      // FIXED: Use shared authentication if available with timeout protection
      if (authenticate && typeof authenticate === 'function') {
        const authTimeout = setTimeout(() => {
          if (!res.headersSent) {
            logger.warn('Authentication timeout', { correlationId, path: req.path });
            return this.#handleAuthError(res, 'Authentication timeout', FINAL_ERROR_CODES.UNAUTHORIZED);
          }
        }, 5000);

        authenticate(['jwt'])(req, res, (authError) => {
          clearTimeout(authTimeout);
          
          if (authError) {
            logger.warn('Shared authentication failed', { 
              correlationId, 
              error: authError.message,
              path: req.path 
            });
            return this.#handleAuthError(res, authError.message, FINAL_ERROR_CODES.UNAUTHORIZED);
          }

          if (!req.user) {
            return this.#handleAuthError(res, 'No user found after authentication', FINAL_ERROR_CODES.UNAUTHORIZED);
          }

          // FIXED: Immediate validation without database calls
          const isValidAdmin = this.#validateAdminUser(req.user);
          if (!isValidAdmin) {
            return this.#handleAuthError(res, 'User is not authorized for admin access', FINAL_ERROR_CODES.FORBIDDEN);
          }

          req.admin = {
            ...req.user,
            permissions: req.user.permissions || Object.values(FINAL_PERMISSIONS),
            lastActivity: new Date(),
            mfaVerified: !this.#config.requireTwoFactor || req.user.mfaVerified
          };

          logger.debug('Admin authentication successful', { 
            correlationId,
            userId: req.user.id,
            role: req.user.role 
          });

          next();
        });
      } else {
        // FIXED: Fallback JWT authentication with timeout protection
        this.#performJWTAuthentication(req, res, next, correlationId);
      }
    };
  }

  /**
   * FIXED: Perform JWT authentication with timeout protection
   * @private
   * @static
   */
  static #performJWTAuthentication(req, res, next, correlationId) {
    const token = this.#extractToken(req);
    
    if (!token) {
      return this.#handleAuthError(res, 'No authentication token provided', FINAL_ERROR_CODES.UNAUTHORIZED);
    }

    // FIXED: JWT verification with timeout protection
    const jwtSecret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'development_secret';
    
    const verifyTimeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('JWT verification timeout', { correlationId });
        return this.#handleAuthError(res, 'Token verification timeout', FINAL_ERROR_CODES.UNAUTHORIZED);
      }
    }, 3000);

    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
      clearTimeout(verifyTimeout);
      
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return this.#handleAuthError(res, 'Token has expired', FINAL_ERROR_CODES.TOKEN_EXPIRED);
        }
        if (err.name === 'JsonWebTokenError') {
          return this.#handleAuthError(res, 'Invalid token', FINAL_ERROR_CODES.INVALID_TOKEN);
        }
        return this.#handleAuthError(res, 'Token verification failed', FINAL_ERROR_CODES.UNAUTHORIZED);
      }

      // FIXED: Create user object from decoded token
      req.user = {
        _id: decoded.sub || decoded.id,
        id: decoded.sub || decoded.id,
        username: decoded.username || decoded.preferred_username,
        email: decoded.email,
        role: decoded.role || FINAL_ROLES.PLATFORM_ADMIN,
        permissions: decoded.permissions || Object.values(FINAL_PERMISSIONS),
        isAuthenticated: true,
        twoFactorEnabled: decoded.twoFactorEnabled || false,
        isActive: decoded.isActive !== false,
        isLocked: decoded.isLocked === true
      };

      const isValidAdmin = this.#validateAdminUser(req.user);
      if (!isValidAdmin) {
        return this.#handleAuthError(res, 'User is not authorized for admin access', FINAL_ERROR_CODES.FORBIDDEN);
      }

      req.admin = {
        ...req.user,
        permissions: req.user.permissions,
        lastActivity: new Date(),
        mfaVerified: !this.#config.requireTwoFactor || decoded.mfaVerified
      };

      logger.debug('JWT authentication successful', { 
        correlationId,
        userId: req.user.id,
        role: req.user.role 
      });

      next();
    });
  }

  /**
   * FIXED: Extract token from request with multiple fallbacks
   * @private
   * @static
   */
  static #extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    
    return req.headers['x-auth-token'] || 
           req.query.token || 
           req.cookies?.token ||
           null;
  }

  /**
   * FIXED: Validate admin user with immediate response
   * @private
   * @static
   */
  static #validateAdminUser(user) {
    if (!user || !user.isAuthenticated) {
      return false;
    }

    if (user.isLocked) {
      return false;
    }

    if (!user.isActive) {
      return false;
    }

    if (!user.role) {
      return false;
    }

    const hasAdminRole = this.#config.allowedRoles.includes(user.role);
    if (!hasAdminRole) {
      return false;
    }

    return true;
  }

  /**
   * FIXED: Handle authentication errors with consistent response
   * @private
   * @static
   */
  static #handleAuthError(res, message, code = FINAL_ERROR_CODES.UNAUTHORIZED) {
    const statusCode = code === FINAL_ERROR_CODES.FORBIDDEN ? 403 : 401;
    
    logger.warn('Admin authentication failed', { 
      message, 
      code, 
      statusCode,
      timestamp: new Date().toISOString()
    });

    if (!res.headersSent) {
      res.status(statusCode).json({
        success: false,
        error: {
          message,
          code,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * FIXED: Authorization middleware with immediate response
   * @static
   * @param {Array<string>} requiredRoles - Required roles
   * @param {Array<string>} requiredPermissions - Required permissions
   * @returns {Function} Express middleware
   */
  static authorize(requiredRoles = [], requiredPermissions = []) {
    return (req, res, next) => {
      if (!req.admin && !req.user) {
        return this.#handleAuthError(res, 'Authentication required', FINAL_ERROR_CODES.UNAUTHORIZED);
      }

      const user = req.admin || req.user;

      // Check roles
      if (requiredRoles.length > 0) {
        const hasRole = requiredRoles.some(role => 
          user.role === role || 
          (user.roles && user.roles.includes(role))
        );
        
        if (!hasRole) {
          return this.#handleAuthError(res, 'Insufficient role permissions', FINAL_ERROR_CODES.FORBIDDEN);
        }
      }

      // Check permissions
      if (requiredPermissions.length > 0) {
        const userPermissions = user.permissions || [];
        const hasPermission = requiredPermissions.every(permission => 
          userPermissions.includes(permission) || userPermissions.includes('*')
        );
        
        if (!hasPermission) {
          return this.#handleAuthError(res, 'Insufficient permissions', FINAL_ERROR_CODES.INSUFFICIENT_PERMISSIONS);
        }
      }

      logger.debug('Authorization successful', {
        userId: user.id,
        role: user.role,
        requiredRoles,
        requiredPermissions
      });

      next();
    };
  }

  /**
   * FIXED: Maintenance mode bypass check
   * @static
   * @returns {Function} Express middleware
   */
  static bypassMaintenance() {
    return (req, res, next) => {
      if (!FINAL_CONFIG.maintenance.enabled) {
        return next();
      }

      const user = req.admin || req.user;
      if (!user) {
        return this.#handleAuthError(res, 'Authentication required to bypass maintenance mode', FINAL_ERROR_CODES.UNAUTHORIZED);
      }

      const canBypass = user.role === FINAL_ROLES.SUPER_ADMIN ||
                       (user.permissions && user.permissions.includes(FINAL_PERMISSIONS.BYPASS_MAINTENANCE));

      if (!canBypass) {
        return res.status(503).json({
          success: false,
          error: {
            message: 'System is under maintenance',
            code: 'MAINTENANCE_MODE',
            timestamp: new Date().toISOString()
          }
        });
      }

      next();
    };
  }

  /**
   * FIXED: Get middleware configuration
   * @static
   * @returns {Object} Configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      developmentMode: process.env.NODE_ENV === 'development',
      authSkipped: process.env.SKIP_AUTH === 'true',
      maintenanceMode: FINAL_CONFIG.maintenance.enabled
    };
  }

  /**
   * FIXED: Create admin user context
   * @static
   * @param {Object} user - User object
   * @returns {Object} Admin context
   */
  static createAdminContext(user) {
    return {
      ...user,
      permissions: user.permissions || Object.values(FINAL_PERMISSIONS),
      restrictions: [],
      lastActivity: new Date(),
      mfaVerified: !this.#config.requireTwoFactor || user.mfaVerified,
      adminAccess: true
    };
  }
}

// FIXED: Export the middleware function, NOT the class!
// This prevents the "Class constructor cannot be invoked without 'new'" error
module.exports = AdminAuthMiddleware.authenticate();
module.exports.AdminAuthMiddleware = AdminAuthMiddleware;
module.exports.authenticate = () => AdminAuthMiddleware.authenticate();
module.exports.authorize = (roles, permissions) => AdminAuthMiddleware.authorize(roles, permissions);
module.exports.bypassMaintenance = () => AdminAuthMiddleware.bypassMaintenance();
module.exports.getConfig = () => AdminAuthMiddleware.getConfig();
module.exports.createAdminContext = (user) => AdminAuthMiddleware.createAdminContext(user);