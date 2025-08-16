'use strict';

/**
 * @fileoverview Enterprise access control routes for comprehensive authorization management
 * @module servers/admin-server/modules/security-administration/routes/access-control-routes
 * @requires express
 * @requires module:servers/admin-server/modules/security-administration/controllers/access-control-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/csrf-protection
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/utils/validators/auth-validators
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const express = require('express');
const router = express.Router();
const AccessControlController = require('../controllers/access-control-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const csrfProtection = require('../../../../../shared/lib/middleware/security/csrf-protection');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');
const AuthValidator = require('../../../../../shared/lib/utils/validators/auth-validators');
const logger = require('../../../../../shared/lib/utils/logger');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

// Initialize controller
const accessControlController = new AccessControlController();

// Initialize controller asynchronously
(async () => {
  try {
    await accessControlController.initialize();
    logger.info('Access Control Controller initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Access Control Controller:', error);
  }
})();

// ==================== Middleware Configuration ====================

/**
 * Apply global middleware to all access control routes
 */
router.use(securityHeaders());
router.use(auditLogger({ module: 'access-control-routes' }));
router.use(authenticate());

/**
 * Rate limiting configurations for different operation types
 */
const rateLimitConfigs = {
  authentication: rateLimit({
    windowMs: 60000, // 1 minute
    max: 10,
    message: 'Too many authentication attempts',
    skipSuccessfulRequests: false
  }),
  authorization: rateLimit({
    windowMs: 60000,
    max: 100,
    message: 'Rate limit exceeded for authorization checks'
  }),
  privileged: rateLimit({
    windowMs: 300000, // 5 minutes
    max: 5,
    message: 'Rate limit exceeded for privileged operations'
  }),
  session: rateLimit({
    windowMs: 60000,
    max: 50,
    message: 'Rate limit exceeded for session operations'
  })
};

// ==================== Validation Schemas ====================

const validationSchemas = {
  // Authentication Schemas
  authentication: {
    body: {
      username: { type: 'string', required: true, min: 3, max: 50 },
      password: { type: 'string', required: true, min: 8, max: 128 },
      mfaToken: { type: 'string', pattern: /^\d{6}$/ },
      rememberMe: { type: 'boolean' },
      deviceId: { type: 'string' }
    }
  },
  
  // Authorization Schemas
  authorization: {
    body: {
      principalId: { type: 'string', required: true },
      resource: { type: 'string', required: true },
      action: { type: 'string', required: true },
      context: { type: 'object' },
      attributes: { type: 'object' }
    }
  },
  
  // Role Management Schemas
  roleManagement: {
    body: {
      roleName: { type: 'string', required: true, min: 3, max: 50 },
      description: { type: 'string', max: 200 },
      permissions: { type: 'array', required: true },
      scope: { type: 'string', enum: ['global', 'organization', 'tenant'] },
      inherits: { type: 'array' },
      constraints: { type: 'object' }
    }
  },
  
  // Session Management Schemas
  sessionManagement: {
    body: {
      sessionId: { type: 'string' },
      userId: { type: 'string' },
      action: { type: 'string', enum: ['create', 'refresh', 'terminate', 'validate'] },
      metadata: { type: 'object' },
      ttl: { type: 'number', min: 60, max: 86400 }
    }
  },
  
  // Privileged Access Schemas
  privilegedAccess: {
    body: {
      resource: { type: 'string', required: true },
      justification: { type: 'string', required: true, min: 50, max: 500 },
      duration: { type: 'number', required: true, min: 300, max: 14400 },
      approvers: { type: 'array' },
      emergency: { type: 'boolean' },
      recordSession: { type: 'boolean' }
    }
  },
  
  // Access Review Schemas
  accessReview: {
    body: {
      reviewType: { type: 'string', enum: ['user', 'role', 'permission', 'resource'] },
      scope: { type: 'string', required: true },
      reviewers: { type: 'array', required: true },
      deadline: { type: 'date', required: true },
      autoRemediate: { type: 'boolean' },
      notificationSchedule: { type: 'object' }
    }
  }
};

// ==================== Authentication Routes ====================

/**
 * @route POST /api/admin/security/access-control/auth/:operation
 * @description Handle authentication operations
 * @access Public/Authenticated based on operation
 */
router.post(
  '/auth/:operation',
  rateLimitConfigs.authentication,
  csrfProtection(),
  requestValidator(validationSchemas.authentication),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/login
 * @description User login with credentials
 * @access Public
 */
router.post(
  '/auth/login',
  rateLimitConfigs.authentication,
  csrfProtection(),
  requestValidator(validationSchemas.authentication),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/logout
 * @description User logout
 * @access Authenticated
 */
router.post(
  '/auth/logout',
  authenticate(),
  csrfProtection(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/refresh
 * @description Refresh authentication token
 * @access Authenticated
 */
router.post(
  '/auth/refresh',
  authenticate(),
  csrfProtection(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/mfa-setup
 * @description Setup multi-factor authentication
 * @access Authenticated
 */
router.post(
  '/auth/mfa-setup',
  authenticate(),
  csrfProtection(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/mfa-verify
 * @description Verify MFA token
 * @access Authenticated
 */
router.post(
  '/auth/mfa-verify',
  authenticate(),
  rateLimitConfigs.authentication,
  csrfProtection(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/auth/password/:operation
 * @description Password management operations
 * @access Authenticated
 */
router.post(
  '/auth/password/:operation',
  authenticate(),
  rateLimitConfigs.authentication,
  csrfProtection(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== Authorization Routes ====================

/**
 * @route POST /api/admin/security/access-control/authz/:operation
 * @description Handle authorization operations
 * @access Security Administrator
 */
router.post(
  '/authz/:operation',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ACCESS_CONTROL_ADMIN]),
  requestValidator(validationSchemas.authorization),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

/**
 * @route POST /api/admin/security/access-control/authz/evaluate-access
 * @description Evaluate access request
 * @access Authenticated
 */
router.post(
  '/authz/evaluate-access',
  rateLimitConfigs.authorization,
  authenticate(),
  requestValidator(validationSchemas.authorization),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

/**
 * @route POST /api/admin/security/access-control/authz/check-permission
 * @description Check permission for resource
 * @access Authenticated
 */
router.post(
  '/authz/check-permission',
  rateLimitConfigs.authorization,
  authenticate(),
  requestValidator(validationSchemas.authorization),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

/**
 * @route POST /api/admin/security/access-control/authz/grant-permission
 * @description Grant permission to principal
 * @access Access Control Administrator
 */
router.post(
  '/authz/grant-permission',
  rateLimitConfigs.authorization,
  authorize([ROLES.ACCESS_CONTROL_ADMIN]),
  requestValidator(validationSchemas.authorization),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

/**
 * @route POST /api/admin/security/access-control/authz/revoke-permission
 * @description Revoke permission from principal
 * @access Access Control Administrator
 */
router.post(
  '/authz/revoke-permission',
  rateLimitConfigs.authorization,
  authorize([ROLES.ACCESS_CONTROL_ADMIN]),
  requestValidator(validationSchemas.authorization),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

/**
 * @route POST /api/admin/security/access-control/authz/policy/:operation
 * @description Policy-based access control operations
 * @access Security Administrator
 */
router.post(
  '/authz/policy/:operation',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthorization)
);

// ==================== Role Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/roles
 * @description List all roles
 * @access Security Administrator
 */
router.get(
  '/roles',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route GET /api/admin/security/access-control/roles/:roleId
 * @description Get role details
 * @access Security Administrator
 */
router.get(
  '/roles/:roleId',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route POST /api/admin/security/access-control/roles/:operation
 * @description Role management operations
 * @access Role Administrator
 */
router.post(
  '/roles/:operation',
  rateLimitConfigs.authorization,
  authorize([ROLES.ROLE_ADMIN]),
  requestValidator(validationSchemas.roleManagement),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route PUT /api/admin/security/access-control/roles/:roleId
 * @description Update role configuration
 * @access Role Administrator
 */
router.put(
  '/roles/:roleId',
  rateLimitConfigs.authorization,
  authorize([ROLES.ROLE_ADMIN]),
  requestValidator(validationSchemas.roleManagement),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route DELETE /api/admin/security/access-control/roles/:roleId
 * @description Delete role
 * @access Security Administrator
 */
router.delete(
  '/roles/:roleId',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route POST /api/admin/security/access-control/roles/:roleId/assign
 * @description Assign role to user
 * @access Role Administrator
 */
router.post(
  '/roles/:roleId/assign',
  rateLimitConfigs.authorization,
  authorize([ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route POST /api/admin/security/access-control/roles/:roleId/unassign
 * @description Unassign role from user
 * @access Role Administrator
 */
router.post(
  '/roles/:roleId/unassign',
  rateLimitConfigs.authorization,
  authorize([ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route GET /api/admin/security/access-control/roles/:roleId/permissions
 * @description Get role permissions
 * @access Security Administrator
 */
router.get(
  '/roles/:roleId/permissions',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

/**
 * @route PUT /api/admin/security/access-control/roles/:roleId/permissions
 * @description Update role permissions
 * @access Role Administrator
 */
router.put(
  '/roles/:roleId/permissions',
  rateLimitConfigs.authorization,
  authorize([ROLES.ROLE_ADMIN]),
  asyncErrorHandler(accessControlController.handleRoleManagement)
);

// ==================== Session Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/sessions
 * @description List active sessions
 * @access Security Administrator
 */
router.get(
  '/sessions',
  rateLimitConfigs.session,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SESSION_ADMIN]),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

/**
 * @route GET /api/admin/security/access-control/sessions/:sessionId
 * @description Get session details
 * @access Security Administrator
 */
router.get(
  '/sessions/:sessionId',
  rateLimitConfigs.session,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SESSION_ADMIN]),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

/**
 * @route POST /api/admin/security/access-control/sessions/:operation
 * @description Session management operations
 * @access Session Administrator
 */
router.post(
  '/sessions/:operation',
  rateLimitConfigs.session,
  authorize([ROLES.SESSION_ADMIN]),
  requestValidator(validationSchemas.sessionManagement),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

/**
 * @route POST /api/admin/security/access-control/sessions/:sessionId/terminate
 * @description Terminate specific session
 * @access Security Administrator
 */
router.post(
  '/sessions/:sessionId/terminate',
  rateLimitConfigs.session,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

/**
 * @route POST /api/admin/security/access-control/sessions/:sessionId/extend
 * @description Extend session timeout
 * @access Authenticated
 */
router.post(
  '/sessions/:sessionId/extend',
  rateLimitConfigs.session,
  authenticate(),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

/**
 * @route POST /api/admin/security/access-control/sessions/terminate-all
 * @description Terminate all sessions for user
 * @access Security Administrator
 */
router.post(
  '/sessions/terminate-all',
  rateLimitConfigs.session,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleSessionManagement)
);

// ==================== Privileged Access Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/privileged
 * @description List privileged access requests
 * @access Security Administrator
 */
router.get(
  '/privileged',
  rateLimitConfigs.privileged,
  authorize([ROLES.SECURITY_ADMIN, ROLES.PRIVILEGED_ACCESS_MANAGER]),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/:operation
 * @description Privileged access operations
 * @access Privileged Access Manager
 */
router.post(
  '/privileged/:operation',
  rateLimitConfigs.privileged,
  authorize([ROLES.PRIVILEGED_ACCESS_MANAGER]),
  requestValidator(validationSchemas.privilegedAccess),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/request-access
 * @description Request privileged access
 * @access Authenticated
 */
router.post(
  '/privileged/request-access',
  rateLimitConfigs.privileged,
  authenticate(),
  requestValidator(validationSchemas.privilegedAccess),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/:requestId/approve
 * @description Approve privileged access request
 * @access Privileged Access Manager
 */
router.post(
  '/privileged/:requestId/approve',
  rateLimitConfigs.privileged,
  authorize([ROLES.PRIVILEGED_ACCESS_MANAGER]),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/:requestId/deny
 * @description Deny privileged access request
 * @access Privileged Access Manager
 */
router.post(
  '/privileged/:requestId/deny',
  rateLimitConfigs.privileged,
  authorize([ROLES.PRIVILEGED_ACCESS_MANAGER]),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/jit/:operation
 * @description Just-In-Time access operations
 * @access Security Administrator
 */
router.post(
  '/privileged/jit/:operation',
  rateLimitConfigs.privileged,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

/**
 * @route POST /api/admin/security/access-control/privileged/break-glass/:operation
 * @description Break-glass emergency access
 * @access Platform Administrator
 */
router.post(
  '/privileged/break-glass/:operation',
  rateLimitConfigs.privileged,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(accessControlController.handlePrivilegedAccess)
);

// ==================== Access Review Routes ====================

/**
 * @route GET /api/admin/security/access-control/reviews
 * @description List access review campaigns
 * @access Security Administrator
 */
router.get(
  '/reviews',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

/**
 * @route POST /api/admin/security/access-control/reviews/:operation
 * @description Access review operations
 * @access Compliance Officer
 */
router.post(
  '/reviews/:operation',
  rateLimitConfigs.authorization,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.accessReview),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

/**
 * @route POST /api/admin/security/access-control/reviews/create-campaign
 * @description Create access review campaign
 * @access Compliance Officer
 */
router.post(
  '/reviews/create-campaign',
  rateLimitConfigs.authorization,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.accessReview),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

/**
 * @route POST /api/admin/security/access-control/reviews/:campaignId/start
 * @description Start access review campaign
 * @access Compliance Officer
 */
router.post(
  '/reviews/:campaignId/start',
  rateLimitConfigs.authorization,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

/**
 * @route POST /api/admin/security/access-control/reviews/:reviewId/certify
 * @description Certify access review
 * @access Reviewer
 */
router.post(
  '/reviews/:reviewId/certify',
  rateLimitConfigs.authorization,
  authenticate(),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

/**
 * @route POST /api/admin/security/access-control/reviews/:reviewId/remediate
 * @description Remediate access based on review
 * @access Security Administrator
 */
router.post(
  '/reviews/:reviewId/remediate',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAccessReview)
);

// ==================== Federation and SSO Routes ====================

/**
 * @route GET /api/admin/security/access-control/sso/providers
 * @description List SSO providers
 * @access Security Administrator
 */
router.get(
  '/sso/providers',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.IDENTITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/sso/:operation
 * @description SSO operations
 * @access Identity Administrator
 */
router.post(
  '/sso/:operation',
  rateLimitConfigs.authentication,
  authorize([ROLES.IDENTITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/federated/:operation
 * @description Federated authentication operations
 * @access Identity Administrator
 */
router.post(
  '/federated/:operation',
  rateLimitConfigs.authentication,
  authorize([ROLES.IDENTITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== API Key Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/api-keys
 * @description List API keys
 * @access Security Administrator
 */
router.get(
  '/api-keys',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.API_KEY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/api-keys/generate
 * @description Generate new API key
 * @access API Key Administrator
 */
router.post(
  '/api-keys/generate',
  rateLimitConfigs.authorization,
  authorize([ROLES.API_KEY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/api-keys/:keyId/revoke
 * @description Revoke API key
 * @access API Key Administrator
 */
router.post(
  '/api-keys/:keyId/revoke',
  rateLimitConfigs.authorization,
  authorize([ROLES.API_KEY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/api-keys/:keyId/rotate
 * @description Rotate API key
 * @access API Key Administrator
 */
router.post(
  '/api-keys/:keyId/rotate',
  rateLimitConfigs.authorization,
  authorize([ROLES.API_KEY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== OAuth Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/oauth/clients
 * @description List OAuth clients
 * @access Security Administrator
 */
router.get(
  '/oauth/clients',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.OAUTH_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/oauth/clients
 * @description Register OAuth client
 * @access OAuth Administrator
 */
router.post(
  '/oauth/clients',
  rateLimitConfigs.authorization,
  authorize([ROLES.OAUTH_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route PUT /api/admin/security/access-control/oauth/clients/:clientId
 * @description Update OAuth client
 * @access OAuth Administrator
 */
router.put(
  '/oauth/clients/:clientId',
  rateLimitConfigs.authorization,
  authorize([ROLES.OAUTH_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route DELETE /api/admin/security/access-control/oauth/clients/:clientId
 * @description Delete OAuth client
 * @access Security Administrator
 */
router.delete(
  '/oauth/clients/:clientId',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== Device Management Routes ====================

/**
 * @route GET /api/admin/security/access-control/devices
 * @description List registered devices
 * @access Security Administrator
 */
router.get(
  '/devices',
  rateLimitConfigs.authorization,
  authorize([ROLES.SECURITY_ADMIN, ROLES.DEVICE_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/devices/:operation
 * @description Device management operations
 * @access Device Administrator
 */
router.post(
  '/devices/:operation',
  rateLimitConfigs.authorization,
  authorize([ROLES.DEVICE_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/devices/:deviceId/trust
 * @description Trust device
 * @access Device Administrator
 */
router.post(
  '/devices/:deviceId/trust',
  rateLimitConfigs.authorization,
  authorize([ROLES.DEVICE_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/devices/:deviceId/revoke
 * @description Revoke device trust
 * @access Device Administrator
 */
router.post(
  '/devices/:deviceId/revoke',
  rateLimitConfigs.authorization,
  authorize([ROLES.DEVICE_ADMIN]),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== Biometric Authentication Routes ====================

/**
 * @route POST /api/admin/security/access-control/biometric/:operation
 * @description Biometric authentication operations
 * @access Authenticated
 */
router.post(
  '/biometric/:operation',
  rateLimitConfigs.authentication,
  authenticate(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/biometric/enroll
 * @description Enroll biometric authentication
 * @access Authenticated
 */
router.post(
  '/biometric/enroll',
  rateLimitConfigs.authentication,
  authenticate(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

/**
 * @route POST /api/admin/security/access-control/biometric/verify
 * @description Verify biometric authentication
 * @access Authenticated
 */
router.post(
  '/biometric/verify',
  rateLimitConfigs.authentication,
  authenticate(),
  asyncErrorHandler(accessControlController.handleAuthentication)
);

// ==================== Health Check Route ====================

/**
 * @route GET /api/admin/security/access-control/health
 * @description Access control service health check
 * @access Public (Internal only)
 */
router.get(
  '/health',
  asyncErrorHandler(async (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'access-control',
      timestamp: new Date().toISOString()
    });
  })
);

// ==================== Error Handling Middleware ====================

/**
 * Handle 404 errors for unmatched routes
 */
router.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Access control route not found',
    path: req.originalUrl,
    method: req.method
  });
});

/**
 * Global error handler for access control routes
 */
router.use((error, req, res, next) => {
  logger.error('Access control route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

module.exports = router;