'use strict';

/**
 * @fileoverview Enterprise organization settings routes with comprehensive configuration API endpoints
 * @module servers/admin-server/modules/organization-management/routes/organization-settings-routes
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/controllers/organization-settings-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/security/rate-limit
 * @requires module:shared/lib/middleware/cors-middleware
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 */

const express = require('express');
const router = express.Router();
const OrganizationSettingsController = require('../controllers/organization-settings-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/security/rate-limit');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');

// Initialize controller
const settingsController = new OrganizationSettingsController();

// Initialize controller on module load
(async () => {
  try {
    await settingsController.initialize();
  } catch (error) {
    console.error('Failed to initialize OrganizationSettingsController:', error);
    process.exit(1);
  }
})();

/**
 * Apply global middleware to all settings routes
 */
router.use(corsMiddleware());
router.use(authenticate);
router.use(auditLogger('organization-settings'));

/**
 * @route GET /api/admin/organizations/:organizationId/settings
 * @description Get all organization settings
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 */
router.get(
  '/:organizationId/settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'SETTINGS_VIEWER']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.getAllSettings)
);

/**
 * @route GET /api/admin/organizations/:organizationId/settings/:category
 * @description Get settings by category
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @params {String} category - Settings category
 */
router.get(
  '/:organizationId/settings/:category',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'SETTINGS_VIEWER']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true },
    category: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.getSettingsByCategory)
);

/**
 * @route GET /api/admin/organizations/:organizationId/settings/history
 * @description Get settings change history
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @queryParams {Date} startDate - Start date for history
 * @queryParams {Date} endDate - End date for history
 * @queryParams {Number} limit - Maximum number of history items
 */
router.get(
  '/:organizationId/settings/history',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    startDate: { type: 'date' },
    endDate: { type: 'date' },
    limit: { type: 'number', min: 1, max: 500 }
  }),
  asyncErrorHandler(settingsController.getSettingsHistory)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/validate
 * @description Validate settings configuration
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 */
router.post(
  '/:organizationId/settings/validate',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    settings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.validateSettings)
);

/**
 * @route POST /api/admin/settings/workflow/:workflowType
 * @description Execute settings workflow
 * @access Platform Admin
 * @params {String} workflowType - Type of workflow to execute
 */
router.post(
  '/workflow/:workflowType',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    workflowType: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.executeSettingsWorkflow)
);

// ==================== General Settings Routes ====================

/**
 * @route GET /api/admin/organizations/:organizationId/settings/action/get
 * @description Get organization settings
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/settings/action/get',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/update
 * @description Update organization settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/update',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    settings: { type: 'object', required: true },
    reason: { type: 'string' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/reset
 * @description Reset settings to default
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/reset',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    categories: { type: 'array' },
    confirmation: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/export
 * @description Export settings configuration
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/export',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    format: { type: 'string', enum: ['JSON', 'YAML', 'XML'] },
    categories: { type: 'array' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/import
 * @description Import settings configuration
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/import',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    configuration: { type: 'object', required: true },
    overwrite: { type: 'boolean' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/validate
 * @description Validate settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/validate',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    settings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/backup
 * @description Backup settings
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/backup',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/restore
 * @description Restore settings from backup
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/restore',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    backupId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Security Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/update-security
 * @description Update security settings
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/update-security',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    securitySettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-mfa
 * @description Configure multi-factor authentication
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/configure-mfa',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    mfaEnabled: { type: 'boolean', required: true },
    mfaMethods: { type: 'array' },
    enforcement: { type: 'string', enum: ['OPTIONAL', 'REQUIRED', 'CONDITIONAL'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/password-policy
 * @description Configure password policy
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/password-policy',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    minLength: { type: 'number', min: 8 },
    requireUppercase: { type: 'boolean' },
    requireLowercase: { type: 'boolean' },
    requireNumbers: { type: 'boolean' },
    requireSpecialChars: { type: 'boolean' },
    expirationDays: { type: 'number' },
    preventReuse: { type: 'number' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-sso
 * @description Configure single sign-on
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/configure-sso',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    ssoConfig: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/session-policy
 * @description Configure session policy
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/session-policy',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    sessionTimeout: { type: 'number', min: 5 },
    idleTimeout: { type: 'number', min: 5 },
    maxConcurrentSessions: { type: 'number', min: 1 },
    rememberMeDuration: { type: 'number' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/ip-whitelist
 * @description Configure IP whitelist
 * @access Platform Admin, Security Admin
 */
router.post(
  '/:organizationId/settings/action/ip-whitelist',
  authorize(['PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    enabled: { type: 'boolean', required: true },
    whitelist: { type: 'array' },
    enforcement: { type: 'string', enum: ['STRICT', 'RELAXED'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/encryption-settings
 * @description Configure encryption settings
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/encryption-settings',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    encryptionAlgorithm: { type: 'string' },
    keyRotationPeriod: { type: 'number' },
    encryptAtRest: { type: 'boolean' },
    encryptInTransit: { type: 'boolean' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/rotate-keys
 * @description Rotate encryption keys
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/rotate-keys',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    keyType: { type: 'string', enum: ['ALL', 'API', 'ENCRYPTION', 'SIGNING'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Feature Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/enable-feature
 * @description Enable a feature
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/enable-feature',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    featureId: { type: 'string', required: true },
    configuration: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/disable-feature
 * @description Disable a feature
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/disable-feature',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    featureId: { type: 'string', required: true },
    reason: { type: 'string' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-feature
 * @description Configure feature settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-feature',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    featureId: { type: 'string', required: true },
    configuration: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/feature-flags
 * @description Update feature flags
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/feature-flags',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    flags: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/manage-modules
 * @description Manage enabled modules
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/manage-modules',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    modules: { type: 'array', required: true },
    action: { type: 'string', enum: ['ENABLE', 'DISABLE', 'CONFIGURE'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/feature-limits
 * @description Set feature limits
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/feature-limits',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    limits: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-addons
 * @description Configure addons
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-addons',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    addons: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/update-capabilities
 * @description Update organization capabilities
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/update-capabilities',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    capabilities: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Integration Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/add-integration
 * @description Add new integration
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/add-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    name: { type: 'string', required: true },
    type: { type: 'string', required: true },
    configuration: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/remove-integration
 * @description Remove integration
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/remove-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/update-integration
 * @description Update integration configuration
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/update-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true },
    configuration: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/test-integration
 * @description Test integration connection
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/test-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/sync-integration
 * @description Sync integration data
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/sync-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true },
    syncType: { type: 'string', enum: ['FULL', 'INCREMENTAL'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-webhooks
 * @description Configure webhooks
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-webhooks',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    webhooks: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/api-settings
 * @description Configure API settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/api-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    rateLimit: { type: 'number' },
    allowedOrigins: { type: 'array' },
    apiVersion: { type: 'string' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/oauth-apps
 * @description Manage OAuth applications
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/oauth-apps',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    apps: { type: 'array', required: true },
    action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Notification Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/notification-settings
 * @description Configure notification settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/notification-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    notificationSettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/email-settings
 * @description Configure email settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/email-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    emailProvider: { type: 'string' },
    fromAddress: { type: 'email' },
    replyToAddress: { type: 'email' },
    smtpSettings: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/sms-settings
 * @description Configure SMS settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/sms-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    smsProvider: { type: 'string' },
    fromNumber: { type: 'string' },
    apiCredentials: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/alert-preferences
 * @description Configure alert preferences
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/alert-preferences',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    alertTypes: { type: 'array', required: true },
    channels: { type: 'array' },
    thresholds: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/notification-templates
 * @description Configure notification templates
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/notification-templates',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    templates: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/notification-rules
 * @description Configure notification rules
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/notification-rules',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    rules: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/digest-settings
 * @description Configure digest settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/digest-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    frequency: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
    time: { type: 'string' },
    includedEvents: { type: 'array' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/communication-channels
 * @description Configure communication channels
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/communication-channels',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    channels: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Branding Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/update-branding
 * @description Update branding settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/update-branding',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    branding: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/upload-logo
 * @description Upload organization logo
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/upload-logo',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/color-scheme
 * @description Configure color scheme
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/color-scheme',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    primaryColor: { type: 'string' },
    secondaryColor: { type: 'string' },
    accentColor: { type: 'string' },
    textColor: { type: 'string' },
    backgroundColor: { type: 'string' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/custom-domain
 * @description Configure custom domain
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/custom-domain',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    domain: { type: 'string', required: true },
    sslCertificate: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/email-templates
 * @description Configure email templates
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/email-templates',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    templates: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/custom-css
 * @description Update custom CSS
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/custom-css',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    css: { type: 'string', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/white-label
 * @description Configure white label settings
 * @access Platform Admin
 */
router.post(
  '/:organizationId/settings/action/white-label',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    enabled: { type: 'boolean', required: true },
    configuration: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/landing-page
 * @description Configure landing page
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/landing-page',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    content: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Compliance Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/compliance-settings
 * @description Configure compliance settings
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/compliance-settings',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    complianceSettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/data-retention
 * @description Configure data retention policy
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/data-retention',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    retentionPeriod: { type: 'number', required: true },
    dataTypes: { type: 'array' },
    autoDelete: { type: 'boolean' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/privacy-settings
 * @description Configure privacy settings
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/privacy-settings',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    privacySettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/audit-settings
 * @description Configure audit settings
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/audit-settings',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    auditLevel: { type: 'string', enum: ['BASIC', 'DETAILED', 'COMPREHENSIVE'] },
    auditEvents: { type: 'array' },
    retentionDays: { type: 'number' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/compliance-framework
 * @description Configure compliance framework
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/compliance-framework',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    frameworks: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/gdpr-settings
 * @description Configure GDPR settings
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/gdpr-settings',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    gdprCompliant: { type: 'boolean', required: true },
    dataProcessingAgreement: { type: 'object' },
    consentManagement: { type: 'object' }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/data-classification
 * @description Configure data classification
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/data-classification',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    classifications: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/regulatory-settings
 * @description Configure regulatory settings
 * @access Platform Admin, Compliance Officer
 */
router.post(
  '/:organizationId/settings/action/regulatory-settings',
  authorize(['PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    regulations: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

// ==================== Workflow Settings Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-workflows
 * @description Configure workflows
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-workflows',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    workflows: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/approval-chains
 * @description Configure approval chains
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/approval-chains',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    chains: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/automation-rules
 * @description Configure automation rules
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/automation-rules',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    rules: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-triggers
 * @description Configure workflow triggers
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-triggers',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    triggers: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/business-rules
 * @description Configure business rules
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/business-rules',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    rules: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/custom-fields
 * @description Configure custom fields
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/custom-fields',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    fields: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/configure-escalations
 * @description Configure escalation rules
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/configure-escalations',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    escalations: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/settings/action/sla-settings
 * @description Configure SLA settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/settings/action/sla-settings',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    slaRules: { type: 'array', required: true }
  }),
  asyncErrorHandler(settingsController.handleSettingsRequest)
);

module.exports = router;