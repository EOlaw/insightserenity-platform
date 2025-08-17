'use strict';

/**
 * @fileoverview Enterprise tenant management routes with comprehensive multi-tenant API endpoints
 * @module servers/admin-server/modules/organization-management/routes/tenant-management-routes
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/controllers/tenant-management-controller
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
const TenantManagementController = require('../controllers/tenant-management-controller');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/security/rate-limit');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');

// Initialize controller
const tenantController = new TenantManagementController();

// Initialize controller on module load
(async () => {
  try {
    await tenantController.initialize();
  } catch (error) {
    console.error('Failed to initialize TenantManagementController:', error);
    process.exit(1);
  }
})();

/**
 * Apply global middleware to all tenant routes
 */
router.use(corsMiddleware());
router.use(authenticate);
router.use(auditLogger('tenant-management'));

/**
 * @route GET /api/admin/organizations/:organizationId/tenants
 * @description List all tenants for an organization
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @queryParams {Number} page - Page number for pagination
 * @queryParams {Number} limit - Number of items per page
 * @queryParams {String} status - Filter by tenant status
 * @queryParams {String} type - Filter by tenant type
 */
router.get(
  '/organizations/:organizationId/tenants',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TENANT_VIEWER']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    page: { type: 'number', min: 1 },
    limit: { type: 'number', min: 1, max: 100 },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PROVISIONING', 'TERMINATED'] },
    type: { type: 'string' }
  }),
  asyncErrorHandler(tenantController.listTenants)
);

/**
 * @route GET /api/admin/tenants/:tenantId
 * @description Get detailed information about a specific tenant
 * @access Platform Admin, Organization Admin, Tenant Admin
 * @params {String} tenantId - Tenant identifier
 */
router.get(
  '/tenants/:tenantId',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.getTenantDetails)
);

/**
 * @route POST /api/admin/tenants/batch
 * @description Execute batch operations on multiple tenants
 * @access Platform Admin only
 * @body {Array} operations - Array of operations to perform
 */
router.post(
  '/tenants/batch',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    operations: { type: 'array', required: true, minLength: 1, maxLength: 50 }
  }),
  asyncErrorHandler(tenantController.handleBatchOperations)
);

/**
 * @route POST /api/admin/tenants/workflow/:workflowType
 * @description Execute tenant workflow
 * @access Platform Admin
 * @params {String} workflowType - Type of workflow to execute
 */
router.post(
  '/tenants/workflow/:workflowType',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    workflowType: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.executeTenantWorkflow)
);

// ==================== Provisioning Routes ====================

/**
 * @route POST /api/admin/tenants/action/provision
 * @description Provision a new tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/action/provision',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    organizationId: { type: 'string', required: true },
    tenantName: { type: 'string', required: true },
    tenantType: { type: 'string', enum: ['PRIMARY', 'SUBSIDIARY', 'DEPARTMENT'] },
    configuration: { type: 'object' },
    resources: { type: 'object' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/validate-provisioning
 * @description Validate tenant provisioning
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/validate-provisioning',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/allocate-resources
 * @description Allocate resources to tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/allocate-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    resources: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/setup-database
 * @description Setup tenant database
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/setup-database',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    databaseConfig: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/configure-isolation
 * @description Configure tenant isolation
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/configure-isolation',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    isolationType: { type: 'string', enum: ['COMPLETE', 'SHARED_APP', 'SHARED_DATABASE'], required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/initialize-features
 * @description Initialize tenant features
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/initialize-features',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    features: { type: 'array', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Lifecycle Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/activate
 * @description Activate a tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/activate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/suspend
 * @description Suspend a tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/suspend',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    suspensionType: { type: 'string', enum: ['TEMPORARY', 'INDEFINITE'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/resume
 * @description Resume a suspended tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/resume',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/terminate
 * @description Terminate a tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/terminate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    immediateTermination: { type: 'boolean' },
    retainData: { type: 'boolean' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/archive
 * @description Archive a tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/archive',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    retentionPeriod: { type: 'number' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/restore
 * @description Restore an archived tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/restore',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Configuration Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/update-config
 * @description Update tenant configuration
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/update-config',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    configuration: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/change-isolation
 * @description Change tenant isolation level
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/change-isolation',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    newIsolationType: { type: 'string', enum: ['COMPLETE', 'SHARED_APP', 'SHARED_DATABASE'], required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/update-limits
 * @description Update tenant resource limits
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/update-limits',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    limits: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/configure-features
 * @description Configure tenant features
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/configure-features',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    features: { type: 'array', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/enable-integration
 * @description Enable integration for tenant
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/enable-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true },
    configuration: { type: 'object' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/disable-integration
 * @description Disable integration for tenant
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/disable-integration',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    integrationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Resource Management Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/scale-resources
 * @description Scale tenant resources
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/scale-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    scalingConfig: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/optimize-resources
 * @description Optimize tenant resource allocation
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/optimize-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/monitor-usage
 * @description Monitor tenant resource usage
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/tenants/:tenantId/action/monitor-usage',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TENANT_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/check-quotas
 * @description Check tenant quotas
 * @access Platform Admin, Organization Admin, Tenant Admin
 */
router.get(
  '/tenants/:tenantId/action/check-quotas',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TENANT_ADMIN']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/update-quotas
 * @description Update tenant quotas
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/update-quotas',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    quotas: { type: 'object', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/forecast-usage
 * @description Forecast tenant resource usage
 * @access Platform Admin
 */
router.get(
  '/tenants/:tenantId/action/forecast-usage',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    period: { type: 'string', enum: ['WEEK', 'MONTH', 'QUARTER', 'YEAR'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Data Management Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/backup
 * @description Create tenant backup
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/backup',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    backupType: { type: 'string', enum: ['FULL', 'INCREMENTAL', 'DIFFERENTIAL'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/restore-backup
 * @description Restore tenant from backup
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/restore-backup',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    backupId: { type: 'string', required: true },
    restorePoint: { type: 'date' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/export-data
 * @description Export tenant data
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/export-data',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    format: { type: 'string', enum: ['JSON', 'CSV', 'SQL'], required: true },
    dataTypes: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/import-data
 * @description Import data to tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/import-data',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    sourceUrl: { type: 'string' },
    format: { type: 'string', enum: ['JSON', 'CSV', 'SQL'] },
    overwrite: { type: 'boolean' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/migrate-data
 * @description Migrate tenant data
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/migrate-data',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetTenantId: { type: 'string', required: true },
    dataTypes: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/clone
 * @description Clone tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/clone',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    newTenantName: { type: 'string', required: true },
    includeData: { type: 'boolean' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Migration Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/migrate
 * @description Migrate tenant to different infrastructure
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/migrate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetInfrastructure: { type: 'string', required: true },
    migrationStrategy: { type: 'string', enum: ['LIVE', 'STAGED', 'OFFLINE'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/upgrade
 * @description Upgrade tenant version
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/upgrade',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetVersion: { type: 'string', required: true },
    upgradeStrategy: { type: 'string', enum: ['IMMEDIATE', 'SCHEDULED', 'GRADUAL'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/downgrade
 * @description Downgrade tenant version
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/downgrade',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetVersion: { type: 'string', required: true },
    reason: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/change-region
 * @description Change tenant region
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/change-region',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetRegion: { type: 'string', required: true },
    migrationWindow: { type: 'object' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/action/merge
 * @description Merge multiple tenants
 * @access Platform Admin
 */
router.post(
  '/tenants/action/merge',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateBody({
    sourceTenantIds: { type: 'array', required: true, minLength: 2 },
    targetTenantId: { type: 'string', required: true },
    mergeStrategy: { type: 'object' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/split
 * @description Split tenant into multiple tenants
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/split',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    splitConfiguration: { type: 'array', required: true },
    splitStrategy: { type: 'string', enum: ['BY_DEPARTMENT', 'BY_REGION', 'CUSTOM'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Monitoring Routes ====================

/**
 * @route GET /api/admin/tenants/:tenantId/action/health-check
 * @description Perform tenant health check
 * @access Platform Admin, Organization Admin, Tenant Admin
 */
router.get(
  '/tenants/:tenantId/action/health-check',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'TENANT_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/performance-metrics
 * @description Get tenant performance metrics
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/tenants/:tenantId/action/performance-metrics',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    period: { type: 'string', enum: ['HOUR', 'DAY', 'WEEK', 'MONTH'] },
    metrics: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/usage-analytics
 * @description Get tenant usage analytics
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/tenants/:tenantId/action/usage-analytics',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    startDate: { type: 'date' },
    endDate: { type: 'date' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/generate-report
 * @description Generate tenant report
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/tenants/:tenantId/action/generate-report',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reportType: { type: 'string', required: true },
    format: { type: 'string', enum: ['PDF', 'EXCEL', 'JSON'] }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/audit-activity
 * @description Get tenant audit activity
 * @access Platform Admin
 */
router.get(
  '/tenants/:tenantId/action/audit-activity',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    startDate: { type: 'date' },
    endDate: { type: 'date' },
    eventTypes: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route GET /api/admin/tenants/:tenantId/action/validate-sla
 * @description Validate tenant SLA compliance
 * @access Platform Admin
 */
router.get(
  '/tenants/:tenantId/action/validate-sla',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

// ==================== Maintenance Routes ====================

/**
 * @route POST /api/admin/tenants/:tenantId/action/schedule-maintenance
 * @description Schedule maintenance for tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/schedule-maintenance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    startTime: { type: 'date', required: true },
    endTime: { type: 'date', required: true },
    maintenanceType: { type: 'string', required: true },
    notifyUsers: { type: 'boolean' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/perform-maintenance
 * @description Perform maintenance on tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/perform-maintenance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    maintenanceId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/optimize-database
 * @description Optimize tenant database
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/optimize-database',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/clean-cache
 * @description Clean tenant cache
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/clean-cache',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    cacheTypes: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/update-software
 * @description Update tenant software
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/update-software',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    version: { type: 'string', required: true },
    components: { type: 'array' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

/**
 * @route POST /api/admin/tenants/:tenantId/action/apply-patches
 * @description Apply security patches to tenant
 * @access Platform Admin
 */
router.post(
  '/tenants/:tenantId/action/apply-patches',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    tenantId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    patches: { type: 'array', required: true },
    applyImmediately: { type: 'boolean' }
  }),
  asyncErrorHandler(tenantController.handleTenantRequest)
);

module.exports = router;