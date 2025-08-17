'use strict';

/**
 * @fileoverview Enterprise organization administration routes with comprehensive API endpoints
 * @module servers/admin-server/modules/organization-management/routes/organization-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/controllers/organization-admin-controller
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
const OrganizationAdminController = require('../controllers/organization-admin-controller');
const authenticate = require('../../../../../shared/lib/auth/middleware/authenticate');
const authorize = require('../../../../../shared/lib/auth/middleware/authorize');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/security/rate-limit');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');

// Initialize controller
const organizationController = new OrganizationAdminController();

// Initialize controller on module load
(async () => {
  try {
    await organizationController.initialize();
  } catch (error) {
    console.error('Failed to initialize OrganizationAdminController:', error);
    process.exit(1);
  }
})();

/**
 * Apply global middleware to all organization routes
 */
router.use(corsMiddleware());
router.use(authenticate);
router.use(auditLogger('organization-admin'));

/**
 * @route GET /api/admin/organizations
 * @description List all organizations with filtering and pagination
 * @access Platform Admin, Super Admin
 * @queryParams {Number} page - Page number for pagination
 * @queryParams {Number} limit - Number of items per page
 * @queryParams {String} status - Filter by organization status
 * @queryParams {String} tier - Filter by subscription tier
 * @queryParams {String} businessType - Filter by business type
 * @queryParams {String} sortBy - Field to sort by
 * @queryParams {String} sortOrder - Sort order (asc/desc)
 */
router.get(
  '/',
  authorize(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'ORGANIZATION_VIEWER']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateQuery({
    page: { type: 'number', min: 1 },
    limit: { type: 'number', min: 1, max: 100 },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'TERMINATED', 'PENDING'] },
    tier: { type: 'string' },
    businessType: { type: 'string' },
    sortBy: { type: 'string' },
    sortOrder: { type: 'string', enum: ['asc', 'desc'] }
  }),
  asyncErrorHandler(organizationController.listOrganizations)
);

/**
 * @route GET /api/admin/organizations/:organizationId
 * @description Get detailed information about a specific organization
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 */
router.get(
  '/:organizationId',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'ORGANIZATION_VIEWER']),
  rateLimit({ windowMs: 60000, max: 200 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.getOrganizationDetails)
);

/**
 * @route GET /api/admin/organizations/:organizationId/dashboard
 * @description Get comprehensive dashboard data for an organization
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @queryParams {String} period - Time period for metrics (DAY, WEEK, MONTH, YEAR)
 */
router.get(
  '/:organizationId/dashboard',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    period: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH', 'YEAR'] }
  }),
  asyncErrorHandler(organizationController.getOrganizationDashboard)
);

/**
 * @route POST /api/admin/organizations/batch
 * @description Execute batch operations on multiple organizations
 * @access Platform Admin only
 * @body {Array} operations - Array of operations to perform
 */
router.post(
  '/batch',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    operations: { type: 'array', required: true, minLength: 1, maxLength: 50 }
  }),
  asyncErrorHandler(organizationController.handleBatchOperations)
);

/**
 * @route POST /api/admin/organizations/workflow/:workflowType
 * @description Execute organization workflow
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
  asyncErrorHandler(organizationController.executeOrganizationWorkflow)
);

/**
 * @route POST /api/admin/organizations/:organizationId/analytics/:analysisType
 * @description Analyze organization metrics
 * @access Platform Admin, Organization Admin
 * @params {String} organizationId - Organization identifier
 * @params {String} analysisType - Type of analysis to perform
 */
router.post(
  '/:organizationId/analytics/:analysisType',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN', 'ANALYTICS_VIEWER']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true },
    analysisType: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.analyzeOrganizationMetrics)
);

// ==================== Organization Provisioning Routes ====================

/**
 * @route POST /api/admin/organizations/action/create
 * @description Create a new organization
 * @access Platform Admin
 */
router.post(
  '/action/create',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateBody({
    displayName: { type: 'string', required: true },
    legalName: { type: 'string', required: true },
    businessType: { type: 'string', required: true },
    industry: { type: 'string', required: true },
    contactEmail: { type: 'email', required: true },
    contactPhone: { type: 'string' },
    address: { type: 'object' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/provision
 * @description Provision organization resources
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/provision',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    provisioningConfig: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/configure
 * @description Configure organization settings
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/configure',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/activate
 * @description Activate an organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/activate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/suspend
 * @description Suspend an organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/suspend',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    suspensionType: { type: 'string', enum: ['TEMPORARY', 'INDEFINITE'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/terminate
 * @description Terminate an organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/terminate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    reason: { type: 'string', required: true },
    immediateTermination: { type: 'boolean' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/archive
 * @description Archive an organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/archive',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/migrate
 * @description Migrate organization to different infrastructure
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/migrate',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    targetInfrastructure: { type: 'string', required: true },
    migrationStrategy: { type: 'string', enum: ['LIVE', 'STAGED', 'OFFLINE'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

// ==================== Member Management Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/action/add-member
 * @description Add a member to organization
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/add-member',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    email: { type: 'email', required: true },
    role: { type: 'string', enum: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST'] },
    permissions: { type: 'array' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/remove-member
 * @description Remove a member from organization
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/remove-member',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    memberId: { type: 'string', required: true },
    reason: { type: 'string' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/update-member
 * @description Update member details
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/update-member',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    memberId: { type: 'string', required: true },
    updates: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/invite-member
 * @description Invite a new member
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/invite-member',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    email: { type: 'email', required: true },
    role: { type: 'string' },
    message: { type: 'string' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/revoke-invitation
 * @description Revoke a pending invitation
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/revoke-invitation',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    invitationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/assign-role
 * @description Assign or update member role
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/assign-role',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    memberId: { type: 'string', required: true },
    role: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/bulk-import
 * @description Bulk import organization members
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/bulk-import',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    members: { type: 'array', required: true, maxLength: 1000 }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/export-members
 * @description Export organization members
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/export-members',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    format: { type: 'string', enum: ['CSV', 'JSON', 'EXCEL'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

// ==================== Resource Management Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/action/allocate-resources
 * @description Allocate resources to organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/allocate-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    resources: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/deallocate-resources
 * @description Deallocate resources from organization
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/deallocate-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    resources: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/scale-resources
 * @description Scale organization resources
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/scale-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    scalingFactor: { type: 'number', min: 0.5, max: 10 },
    resourceTypes: { type: 'array' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/optimize-resources
 * @description Optimize resource allocation
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/optimize-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/monitor-resources
 * @description Monitor resource usage
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/monitor-resources',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/set-limits
 * @description Set resource limits
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/set-limits',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    limits: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/check-usage
 * @description Check resource usage
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/check-usage',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 100 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/forecast-resources
 * @description Forecast resource needs
 * @access Platform Admin
 */
router.get(
  '/:organizationId/action/forecast-resources',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

// ==================== Analytics Routes ====================

/**
 * @route GET /api/admin/organizations/:organizationId/action/usage-report
 * @description Generate usage report
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/usage-report',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    period: { type: 'string', enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] },
    startDate: { type: 'date' },
    endDate: { type: 'date' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/billing-report
 * @description Generate billing report
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/billing-report',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/performance-report
 * @description Generate performance report
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/performance-report',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/health-analysis
 * @description Analyze organization health
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/health-analysis',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/calculate-metrics
 * @description Calculate organization metrics
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/calculate-metrics',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    period: { type: 'string' },
    metrics: { type: 'array' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/export-data
 * @description Export organization data
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/export-data',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    dataTypes: { type: 'array', required: true },
    format: { type: 'string', enum: ['JSON', 'CSV', 'XML', 'SQL'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/generate-insights
 * @description Generate analytical insights
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/generate-insights',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/track-kpi
 * @description Track key performance indicators
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/track-kpi',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    kpiType: { type: 'string', required: true },
    value: { type: 'number' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

// ==================== Compliance Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/action/compliance-check
 * @description Run compliance check
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/compliance-check',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    frameworks: { type: 'array' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/audit-log
 * @description Generate audit log
 * @access Platform Admin
 */
router.get(
  '/:organizationId/action/audit-log',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 30 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateQuery({
    startDate: { type: 'date' },
    endDate: { type: 'date' },
    eventTypes: { type: 'array' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/update-compliance
 * @description Update compliance settings
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/update-compliance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    complianceSettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/export-compliance
 * @description Export compliance report
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/export-compliance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/data-retention
 * @description Configure data retention
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/data-retention',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    retentionPolicy: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/data-request
 * @description Handle data request (GDPR, etc.)
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/data-request',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    requestType: { type: 'string', enum: ['ACCESS', 'DELETE', 'PORTABILITY'] },
    subject: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/privacy-settings
 * @description Update privacy settings
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/privacy-settings',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    privacySettings: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/certify-compliance
 * @description Certify compliance status
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/certify-compliance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    framework: { type: 'string', required: true },
    certificationData: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

// ==================== Support Routes ====================

/**
 * @route POST /api/admin/organizations/:organizationId/action/support-ticket
 * @description Create support ticket
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/support-ticket',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    subject: { type: 'string', required: true },
    description: { type: 'string', required: true },
    priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/escalate-issue
 * @description Escalate support issue
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/escalate-issue',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    issueId: { type: 'string', required: true },
    escalationLevel: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/schedule-maintenance
 * @description Schedule maintenance window
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/schedule-maintenance',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    startTime: { type: 'date', required: true },
    endTime: { type: 'date', required: true },
    maintenanceType: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/request-backup
 * @description Request organization backup
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/request-backup',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 5 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    backupType: { type: 'string', enum: ['FULL', 'INCREMENTAL', 'DIFFERENTIAL'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/restore-backup
 * @description Restore from backup
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/restore-backup',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 2 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    backupId: { type: 'string', required: true },
    restorePoint: { type: 'date' }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route GET /api/admin/organizations/:organizationId/action/support-history
 * @description Get support history
 * @access Platform Admin, Organization Admin
 */
router.get(
  '/:organizationId/action/support-history',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 50 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/update-sla
 * @description Update SLA terms
 * @access Platform Admin
 */
router.post(
  '/:organizationId/action/update-sla',
  authorize(['PLATFORM_ADMIN']),
  rateLimit({ windowMs: 60000, max: 10 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    slaTerms: { type: 'object', required: true }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

/**
 * @route POST /api/admin/organizations/:organizationId/action/technical-assistance
 * @description Request technical assistance
 * @access Platform Admin, Organization Admin
 */
router.post(
  '/:organizationId/action/technical-assistance',
  authorize(['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  rateLimit({ windowMs: 60000, max: 20 }),
  requestValidator.validateParams({
    organizationId: { type: 'string', required: true }
  }),
  requestValidator.validateBody({
    issueDescription: { type: 'string', required: true },
    urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }
  }),
  asyncErrorHandler(organizationController.handleOrganizationRequest)
);

module.exports = router;