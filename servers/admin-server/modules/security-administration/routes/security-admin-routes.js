'use strict';

/**
 * @fileoverview Enterprise security administration routes for comprehensive platform security management
 * @module servers/admin-server/modules/security-administration/routes/security-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/security-administration/controllers/security-admin-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const express = require('express');
const router = express.Router();
const SecurityAdminController = require('../controllers/security-admin-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const logger = require('../../../../../shared/lib/utils/logger');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

// Initialize controller
const securityAdminController = new SecurityAdminController();

// Initialize controller asynchronously
(async () => {
  try {
    await securityAdminController.initialize();
    logger.info('Security Admin Controller initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Security Admin Controller:', error);
  }
})();

// ==================== Middleware Configuration ====================

/**
 * Apply global middleware to all security admin routes
 */
router.use(securityHeaders());
router.use(requestLogger({ module: 'security-admin-routes' }));
router.use(authenticate());

/**
 * Rate limiting configurations for different operation types
 */
const rateLimitConfigs = {
  standard: rateLimit({
    windowMs: 60000, // 1 minute
    max: 100,
    message: 'Too many requests from this IP'
  }),
  sensitive: rateLimit({
    windowMs: 60000,
    max: 20,
    message: 'Rate limit exceeded for sensitive operations'
  }),
  critical: rateLimit({
    windowMs: 60000,
    max: 5,
    message: 'Rate limit exceeded for critical operations'
  }),
  export: rateLimit({
    windowMs: 300000, // 5 minutes
    max: 10,
    message: 'Export rate limit exceeded'
  })
};

// ==================== Validation Schemas ====================

const validationSchemas = {
  // Platform Configuration Schemas
  platformConfiguration: {
    body: {
      name: { type: 'string', required: true, min: 3, max: 100 },
      description: { type: 'string', max: 500 },
      settings: { type: 'object', required: true },
      environment: { type: 'string', enum: ['development', 'staging', 'production'] },
      active: { type: 'boolean' }
    }
  },
  
  // Security Policy Schemas
  securityPolicy: {
    body: {
      policyName: { type: 'string', required: true, min: 3, max: 100 },
      policyType: { type: 'string', required: true, enum: ['access', 'data', 'network', 'compliance'] },
      rules: { type: 'array', required: true },
      enforcement: { type: 'string', enum: ['mandatory', 'advisory', 'audit'] },
      scope: { type: 'string', enum: ['global', 'organization', 'tenant', 'user'] },
      effectiveDate: { type: 'date' },
      expiryDate: { type: 'date' }
    }
  },
  
  // User Management Schemas
  userManagement: {
    body: {
      userId: { type: 'string', pattern: /^[a-zA-Z0-9-_]+$/ },
      action: { type: 'string', required: true, enum: ['create', 'update', 'delete', 'suspend', 'activate'] },
      userData: { type: 'object' },
      reason: { type: 'string', min: 10, max: 500 }
    }
  },
  
  // Organization Management Schemas
  organizationManagement: {
    body: {
      organizationId: { type: 'string', pattern: /^[a-zA-Z0-9-_]+$/ },
      organizationName: { type: 'string', min: 3, max: 100 },
      organizationType: { type: 'string', enum: ['enterprise', 'standard', 'trial'] },
      settings: { type: 'object' },
      limits: { type: 'object' },
      features: { type: 'array' }
    }
  },
  
  // Incident Management Schemas
  incidentManagement: {
    body: {
      incidentType: { type: 'string', required: true, enum: ['security', 'compliance', 'operational', 'data'] },
      severity: { type: 'string', required: true, enum: ['critical', 'high', 'medium', 'low'] },
      description: { type: 'string', required: true, min: 10, max: 2000 },
      affectedSystems: { type: 'array' },
      impactAssessment: { type: 'object' },
      responseActions: { type: 'array' }
    }
  },
  
  // Monitoring Configuration Schemas
  monitoringConfiguration: {
    body: {
      monitorType: { type: 'string', required: true, enum: ['performance', 'security', 'availability', 'compliance'] },
      metrics: { type: 'array', required: true },
      thresholds: { type: 'object', required: true },
      alerting: { type: 'object' },
      frequency: { type: 'number', min: 60, max: 86400 }
    }
  }
};

// ==================== Platform Configuration Routes ====================

/**
 * @route GET /api/admin/security/platform/status
 * @description Get platform security status
 * @access Security Administrator
 */
router.get(
  '/platform/status',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route POST /api/admin/security/platform/configure
 * @description Configure platform security settings
 * @access Platform Administrator
 */
router.post(
  '/platform/configure',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  requestValidator(validationSchemas.platformConfiguration),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route PUT /api/admin/security/platform/update/:configId
 * @description Update platform configuration
 * @access Platform Administrator
 */
router.put(
  '/platform/update/:configId',
  rateLimitConfigs.sensitive,
  authorize([ROLES.PLATFORM_ADMIN]),
  requestValidator(validationSchemas.platformConfiguration),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route POST /api/admin/security/platform/backup
 * @description Create platform configuration backup
 * @access Platform Administrator
 */
router.post(
  '/platform/backup',
  rateLimitConfigs.sensitive,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route POST /api/admin/security/platform/restore
 * @description Restore platform configuration from backup
 * @access Platform Administrator
 */
router.post(
  '/platform/restore',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

// ==================== User Management Routes ====================

/**
 * @route GET /api/admin/security/users
 * @description List all platform users with security context
 * @access Security Administrator
 */
router.get(
  '/users',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.USER_ADMIN]),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route GET /api/admin/security/users/:userId
 * @description Get detailed user security information
 * @access Security Administrator
 */
router.get(
  '/users/:userId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.USER_ADMIN]),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route POST /api/admin/security/users/:operation
 * @description Perform user management operations
 * @access User Administrator
 */
router.post(
  '/users/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.USER_ADMIN]),
  requestValidator(validationSchemas.userManagement),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route PUT /api/admin/security/users/:userId/permissions
 * @description Update user permissions
 * @access Security Administrator
 */
router.put(
  '/users/:userId/permissions',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route POST /api/admin/security/users/:userId/suspend
 * @description Suspend user account
 * @access Security Administrator
 */
router.post(
  '/users/:userId/suspend',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.userManagement),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route POST /api/admin/security/users/:userId/activate
 * @description Activate user account
 * @access Security Administrator
 */
router.post(
  '/users/:userId/activate',
  rateLimitConfigs.sensitive,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

/**
 * @route DELETE /api/admin/security/users/:userId
 * @description Delete user account
 * @access Platform Administrator
 */
router.delete(
  '/users/:userId',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleUserManagement)
);

// ==================== Organization Management Routes ====================

/**
 * @route GET /api/admin/security/organizations
 * @description List all organizations
 * @access Security Administrator
 */
router.get(
  '/organizations',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ORGANIZATION_ADMIN]),
  asyncErrorHandler(securityAdminController.handleOrganizationManagement)
);

/**
 * @route GET /api/admin/security/organizations/:orgId
 * @description Get organization security details
 * @access Security Administrator
 */
router.get(
  '/organizations/:orgId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ORGANIZATION_ADMIN]),
  asyncErrorHandler(securityAdminController.handleOrganizationManagement)
);

/**
 * @route POST /api/admin/security/organizations/:operation
 * @description Perform organization management operations
 * @access Organization Administrator
 */
router.post(
  '/organizations/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.ORGANIZATION_ADMIN]),
  requestValidator(validationSchemas.organizationManagement),
  asyncErrorHandler(securityAdminController.handleOrganizationManagement)
);

/**
 * @route PUT /api/admin/security/organizations/:orgId/settings
 * @description Update organization security settings
 * @access Organization Administrator
 */
router.put(
  '/organizations/:orgId/settings',
  rateLimitConfigs.sensitive,
  authorize([ROLES.ORGANIZATION_ADMIN]),
  requestValidator(validationSchemas.organizationManagement),
  asyncErrorHandler(securityAdminController.handleOrganizationManagement)
);

/**
 * @route POST /api/admin/security/organizations/:orgId/suspend
 * @description Suspend organization
 * @access Platform Administrator
 */
router.post(
  '/organizations/:orgId/suspend',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleOrganizationManagement)
);

// ==================== Security Policy Routes ====================

/**
 * @route GET /api/admin/security/policies
 * @description List all security policies
 * @access Security Administrator
 */
router.get(
  '/policies',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route GET /api/admin/security/policies/:policyId
 * @description Get security policy details
 * @access Security Administrator
 */
router.get(
  '/policies/:policyId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/policies/:operation
 * @description Perform security policy operations
 * @access Security Administrator
 */
router.post(
  '/policies/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.securityPolicy),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route PUT /api/admin/security/policies/:policyId
 * @description Update security policy
 * @access Security Administrator
 */
router.put(
  '/policies/:policyId',
  rateLimitConfigs.sensitive,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.securityPolicy),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route DELETE /api/admin/security/policies/:policyId
 * @description Delete security policy
 * @access Platform Administrator
 */
router.delete(
  '/policies/:policyId',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Incident Management Routes ====================

/**
 * @route GET /api/admin/security/incidents
 * @description List security incidents
 * @access Security Administrator
 */
router.get(
  '/incidents',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.INCIDENT_MANAGER]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route GET /api/admin/security/incidents/:incidentId
 * @description Get incident details
 * @access Security Administrator
 */
router.get(
  '/incidents/:incidentId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.INCIDENT_MANAGER]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route POST /api/admin/security/incidents/:operation
 * @description Perform incident management operations
 * @access Incident Manager
 */
router.post(
  '/incidents/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.INCIDENT_MANAGER]),
  requestValidator(validationSchemas.incidentManagement),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route PUT /api/admin/security/incidents/:incidentId/status
 * @description Update incident status
 * @access Incident Manager
 */
router.put(
  '/incidents/:incidentId/status',
  rateLimitConfigs.sensitive,
  authorize([ROLES.INCIDENT_MANAGER]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route POST /api/admin/security/incidents/:incidentId/escalate
 * @description Escalate security incident
 * @access Security Administrator
 */
router.post(
  '/incidents/:incidentId/escalate',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

// ==================== System Monitoring Routes ====================

/**
 * @route GET /api/admin/security/monitoring/status
 * @description Get system monitoring status
 * @access Security Administrator
 */
router.get(
  '/monitoring/status',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SYSTEM_MONITOR]),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

/**
 * @route GET /api/admin/security/monitoring/metrics
 * @description Get security metrics
 * @access Security Administrator
 */
router.get(
  '/monitoring/metrics',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SYSTEM_MONITOR]),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

/**
 * @route POST /api/admin/security/monitoring/:operation
 * @description Perform monitoring operations
 * @access System Monitor
 */
router.post(
  '/monitoring/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.SYSTEM_MONITOR]),
  requestValidator(validationSchemas.monitoringConfiguration),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

/**
 * @route PUT /api/admin/security/monitoring/config
 * @description Update monitoring configuration
 * @access Security Administrator
 */
router.put(
  '/monitoring/config',
  rateLimitConfigs.sensitive,
  authorize([ROLES.SECURITY_ADMIN]),
  requestValidator(validationSchemas.monitoringConfiguration),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

/**
 * @route GET /api/admin/security/monitoring/alerts
 * @description Get monitoring alerts
 * @access Security Administrator
 */
router.get(
  '/monitoring/alerts',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.SYSTEM_MONITOR]),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

// ==================== Analytics and Reporting Routes ====================

/**
 * @route GET /api/admin/security/analytics/dashboard
 * @description Get security analytics dashboard
 * @access Security Administrator
 */
router.get(
  '/analytics/dashboard',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ANALYST]),
  asyncErrorHandler(securityAdminController.handleAnalytics)
);

/**
 * @route GET /api/admin/security/analytics/reports
 * @description List security reports
 * @access Security Administrator
 */
router.get(
  '/analytics/reports',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ANALYST]),
  asyncErrorHandler(securityAdminController.handleAnalytics)
);

/**
 * @route POST /api/admin/security/analytics/reports/:operation
 * @description Generate security reports
 * @access Analyst
 */
router.post(
  '/analytics/reports/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.ANALYST]),
  asyncErrorHandler(securityAdminController.handleAnalytics)
);

/**
 * @route GET /api/admin/security/analytics/trends
 * @description Get security trends analysis
 * @access Security Administrator
 */
router.get(
  '/analytics/trends',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.ANALYST]),
  asyncErrorHandler(securityAdminController.handleAnalytics)
);

/**
 * @route POST /api/admin/security/analytics/export
 * @description Export security analytics data
 * @access Security Administrator
 */
router.post(
  '/analytics/export',
  rateLimitConfigs.export,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleAnalytics)
);

// ==================== Threat Intelligence Routes ====================

/**
 * @route GET /api/admin/security/threats
 * @description Get threat intelligence feed
 * @access Security Administrator
 */
router.get(
  '/threats',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.THREAT_ANALYST]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route GET /api/admin/security/threats/:threatId
 * @description Get threat details
 * @access Security Administrator
 */
router.get(
  '/threats/:threatId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.THREAT_ANALYST]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/threats/:operation
 * @description Perform threat analysis operations
 * @access Threat Analyst
 */
router.post(
  '/threats/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.THREAT_ANALYST]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/threats/:threatId/mitigate
 * @description Initiate threat mitigation
 * @access Security Administrator
 */
router.post(
  '/threats/:threatId/mitigate',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Vulnerability Management Routes ====================

/**
 * @route GET /api/admin/security/vulnerabilities
 * @description List system vulnerabilities
 * @access Security Administrator
 */
router.get(
  '/vulnerabilities',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.VULNERABILITY_MANAGER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route GET /api/admin/security/vulnerabilities/:vulnId
 * @description Get vulnerability details
 * @access Security Administrator
 */
router.get(
  '/vulnerabilities/:vulnId',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.VULNERABILITY_MANAGER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/vulnerabilities/:operation
 * @description Perform vulnerability management operations
 * @access Vulnerability Manager
 */
router.post(
  '/vulnerabilities/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.VULNERABILITY_MANAGER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/vulnerabilities/:vulnId/patch
 * @description Apply vulnerability patch
 * @access Security Administrator
 */
router.post(
  '/vulnerabilities/:vulnId/patch',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Backup and Recovery Routes ====================

/**
 * @route GET /api/admin/security/backups
 * @description List system backups
 * @access Platform Administrator
 */
router.get(
  '/backups',
  rateLimitConfigs.standard,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route POST /api/admin/security/backups/create
 * @description Create system backup
 * @access Platform Administrator
 */
router.post(
  '/backups/create',
  rateLimitConfigs.sensitive,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route POST /api/admin/security/backups/:backupId/restore
 * @description Restore from backup
 * @access Platform Administrator
 */
router.post(
  '/backups/:backupId/restore',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

/**
 * @route DELETE /api/admin/security/backups/:backupId
 * @description Delete backup
 * @access Platform Administrator
 */
router.delete(
  '/backups/:backupId',
  rateLimitConfigs.sensitive,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handlePlatformConfiguration)
);

// ==================== Encryption Management Routes ====================

/**
 * @route GET /api/admin/security/encryption/status
 * @description Get encryption status
 * @access Security Administrator
 */
router.get(
  '/encryption/status',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.CRYPTO_OFFICER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/encryption/keys/:operation
 * @description Manage encryption keys
 * @access Crypto Officer
 */
router.post(
  '/encryption/keys/:operation',
  rateLimitConfigs.critical,
  authorize([ROLES.CRYPTO_OFFICER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/encryption/rotate
 * @description Rotate encryption keys
 * @access Crypto Officer
 */
router.post(
  '/encryption/rotate',
  rateLimitConfigs.critical,
  authorize([ROLES.CRYPTO_OFFICER]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Network Security Routes ====================

/**
 * @route GET /api/admin/security/network/firewall
 * @description Get firewall configuration
 * @access Security Administrator
 */
router.get(
  '/network/firewall',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.NETWORK_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route PUT /api/admin/security/network/firewall
 * @description Update firewall rules
 * @access Network Administrator
 */
router.put(
  '/network/firewall',
  rateLimitConfigs.critical,
  authorize([ROLES.NETWORK_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route GET /api/admin/security/network/intrusion
 * @description Get intrusion detection status
 * @access Security Administrator
 */
router.get(
  '/network/intrusion',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.NETWORK_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/network/block
 * @description Block IP address or range
 * @access Security Administrator
 */
router.post(
  '/network/block',
  rateLimitConfigs.critical,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Integration Security Routes ====================

/**
 * @route GET /api/admin/security/integrations
 * @description List security integrations
 * @access Security Administrator
 */
router.get(
  '/integrations',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN, ROLES.INTEGRATION_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route POST /api/admin/security/integrations/:operation
 * @description Manage security integrations
 * @access Integration Administrator
 */
router.post(
  '/integrations/:operation',
  rateLimitConfigs.sensitive,
  authorize([ROLES.INTEGRATION_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

/**
 * @route PUT /api/admin/security/integrations/:integrationId
 * @description Update integration configuration
 * @access Integration Administrator
 */
router.put(
  '/integrations/:integrationId',
  rateLimitConfigs.sensitive,
  authorize([ROLES.INTEGRATION_ADMIN]),
  asyncErrorHandler(securityAdminController.handleSecurityOperations)
);

// ==================== Emergency Response Routes ====================

/**
 * @route POST /api/admin/security/emergency/lockdown
 * @description Initiate emergency lockdown
 * @access Platform Administrator
 */
router.post(
  '/emergency/lockdown',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route POST /api/admin/security/emergency/unlock
 * @description Release emergency lockdown
 * @access Platform Administrator
 */
router.post(
  '/emergency/unlock',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

/**
 * @route POST /api/admin/security/emergency/evacuate
 * @description Evacuate all sessions
 * @access Platform Administrator
 */
router.post(
  '/emergency/evacuate',
  rateLimitConfigs.critical,
  authorize([ROLES.PLATFORM_ADMIN]),
  asyncErrorHandler(securityAdminController.handleIncidentManagement)
);

// ==================== Health Check Routes ====================

/**
 * @route GET /api/admin/security/health
 * @description Security system health check
 * @access Public (Internal only)
 */
router.get(
  '/health',
  asyncErrorHandler(async (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'security-admin',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route GET /api/admin/security/health/detailed
 * @description Detailed security system health check
 * @access Security Administrator
 */
router.get(
  '/health/detailed',
  rateLimitConfigs.standard,
  authorize([ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(securityAdminController.handleMonitoring)
);

// ==================== Error Handling Middleware ====================

/**
 * Handle 404 errors for unmatched routes
 */
router.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

/**
 * Global error handler for security admin routes
 */
router.use((error, req, res, next) => {
  logger.error('Security admin route error:', {
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