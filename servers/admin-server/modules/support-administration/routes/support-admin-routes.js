'use strict';

/**
 * @fileoverview Enterprise support administration routes for comprehensive support management operations
 * @module servers/admin-server/modules/support-administration/routes/support-admin-routes
 * @requires express
 * @requires module:servers/admin-server/modules/support-administration/controllers/support-admin-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/audit-logger
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/compression-config
 * @requires module:shared/lib/middleware/cors-middleware
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const SupportAdminController = require('../controllers/support-admin-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const auditLogger = require('../../../../../shared/lib/middleware/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const compression = require('../../../../../shared/lib/middleware/compression-config');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const logger = require('../../../../../shared/lib/utils/logger');

const router = express.Router();
const supportAdminController = new SupportAdminController();

// ==================== Global Route Middleware Configuration ====================

// Apply security headers to all routes
router.use(securityHeaders);

// Apply CORS configuration
router.use(corsMiddleware);

// Apply compression for performance optimization
router.use(compression);

// Apply authentication to all support admin routes
router.use(authenticate);

// Apply audit logging to all operations
router.use(auditLogger);

// ==================== Support Team Management Routes ====================

/**
 * @route GET /api/admin/support/teams
 * @description Retrieve support teams with filtering and pagination
 * @access Admin
 * @permissions support.teams.read, admin.support
 */
router.get('/teams', 
  authorize(['support.teams.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportTeams
);

/**
 * @route POST /api/admin/support/teams
 * @description Create new support team with configuration
 * @access Admin
 * @permissions support.teams.create, admin.support
 */
router.post('/teams',
  authorize(['support.teams.create', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.createSupportTeam
);

/**
 * @route GET /api/admin/support/teams/:teamId
 * @description Retrieve specific support team details
 * @access Admin
 * @permissions support.teams.read, admin.support
 */
router.get('/teams/:teamId',
  authorize(['support.teams.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getSupportTeamDetails
);

/**
 * @route PUT /api/admin/support/teams/:teamId
 * @description Update support team configuration and settings
 * @access Admin
 * @permissions support.teams.update, admin.support
 */
router.put('/teams/:teamId',
  authorize(['support.teams.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.updateSupportTeam
);

/**
 * @route DELETE /api/admin/support/teams/:teamId
 * @description Delete support team and handle member reassignment
 * @access Admin
 * @permissions support.teams.delete, admin.support
 */
router.delete('/teams/:teamId',
  authorize(['support.teams.delete', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.deleteSupportTeam
);

/**
 * @route POST /api/admin/support/teams/:teamId/members
 * @description Add members to support team
 * @access Admin
 * @permissions support.teams.manage, admin.support
 */
router.post('/teams/:teamId/members',
  authorize(['support.teams.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.addTeamMembers
);

/**
 * @route DELETE /api/admin/support/teams/:teamId/members/:memberId
 * @description Remove member from support team
 * @access Admin
 * @permissions support.teams.manage, admin.support
 */
router.delete('/teams/:teamId/members/:memberId',
  authorize(['support.teams.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.removeTeamMember
);

/**
 * @route PUT /api/admin/support/teams/:teamId/members/:memberId
 * @description Update team member role and permissions
 * @access Admin
 * @permissions support.teams.manage, admin.support
 */
router.put('/teams/:teamId/members/:memberId',
  authorize(['support.teams.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.updateTeamMember
);

// ==================== Support Agent Management Routes ====================

/**
 * @route GET /api/admin/support/agents
 * @description Retrieve support agents with performance metrics
 * @access Admin
 * @permissions support.agents.read, admin.support
 */
router.get('/agents',
  authorize(['support.agents.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportAgents
);

/**
 * @route POST /api/admin/support/agents
 * @description Create new support agent profile
 * @access Admin
 * @permissions support.agents.create, admin.support
 */
router.post('/agents',
  authorize(['support.agents.create', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 15 }),
  supportAdminController.createSupportAgent
);

/**
 * @route GET /api/admin/support/agents/:agentId
 * @description Retrieve specific support agent details and metrics
 * @access Admin
 * @permissions support.agents.read, admin.support
 */
router.get('/agents/:agentId',
  authorize(['support.agents.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getSupportAgentDetails
);

/**
 * @route PUT /api/admin/support/agents/:agentId
 * @description Update support agent profile and settings
 * @access Admin
 * @permissions support.agents.update, admin.support
 */
router.put('/agents/:agentId',
  authorize(['support.agents.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.updateSupportAgent
);

/**
 * @route DELETE /api/admin/support/agents/:agentId
 * @description Deactivate support agent and reassign tickets
 * @access Admin
 * @permissions support.agents.delete, admin.support
 */
router.delete('/agents/:agentId',
  authorize(['support.agents.delete', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.deactivateSupportAgent
);

/**
 * @route POST /api/admin/support/agents/:agentId/activate
 * @description Activate support agent account
 * @access Admin
 * @permissions support.agents.manage, admin.support
 */
router.post('/agents/:agentId/activate',
  authorize(['support.agents.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.activateSupportAgent
);

/**
 * @route POST /api/admin/support/agents/:agentId/suspend
 * @description Suspend support agent temporarily
 * @access Admin
 * @permissions support.agents.manage, admin.support
 */
router.post('/agents/:agentId/suspend',
  authorize(['support.agents.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.suspendSupportAgent
);

/**
 * @route GET /api/admin/support/agents/:agentId/performance
 * @description Get agent performance metrics and analytics
 * @access Admin
 * @permissions support.agents.analytics, admin.analytics
 */
router.get('/agents/:agentId/performance',
  authorize(['support.agents.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getAgentPerformance
);

/**
 * @route GET /api/admin/support/agents/:agentId/workload
 * @description Get agent current workload and capacity
 * @access Admin
 * @permissions support.agents.read, admin.support
 */
router.get('/agents/:agentId/workload',
  authorize(['support.agents.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getAgentWorkload
);

// ==================== Support Configuration Routes ====================

/**
 * @route GET /api/admin/support/configuration
 * @description Retrieve support system configuration
 * @access Admin
 * @permissions support.config.read, admin.support
 */
router.get('/configuration',
  authorize(['support.config.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getSupportConfiguration
);

/**
 * @route PUT /api/admin/support/configuration
 * @description Update support system configuration
 * @access Admin
 * @permissions support.config.update, admin.support
 */
router.put('/configuration',
  authorize(['support.config.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.updateSupportConfiguration
);

/**
 * @route GET /api/admin/support/configuration/categories
 * @description Retrieve support ticket categories configuration
 * @access Admin
 * @permissions support.config.read, admin.support
 */
router.get('/configuration/categories',
  authorize(['support.config.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getTicketCategories
);

/**
 * @route POST /api/admin/support/configuration/categories
 * @description Create new ticket category
 * @access Admin
 * @permissions support.config.update, admin.support
 */
router.post('/configuration/categories',
  authorize(['support.config.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.createTicketCategory
);

/**
 * @route PUT /api/admin/support/configuration/categories/:categoryId
 * @description Update ticket category configuration
 * @access Admin
 * @permissions support.config.update, admin.support
 */
router.put('/configuration/categories/:categoryId',
  authorize(['support.config.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.updateTicketCategory
);

/**
 * @route DELETE /api/admin/support/configuration/categories/:categoryId
 * @description Delete ticket category
 * @access Admin
 * @permissions support.config.delete, admin.support
 */
router.delete('/configuration/categories/:categoryId',
  authorize(['support.config.delete', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.deleteTicketCategory
);

/**
 * @route GET /api/admin/support/configuration/priorities
 * @description Retrieve support priority levels configuration
 * @access Admin
 * @permissions support.config.read, admin.support
 */
router.get('/configuration/priorities',
  authorize(['support.config.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getPriorityLevels
);

/**
 * @route PUT /api/admin/support/configuration/priorities
 * @description Update priority levels configuration
 * @access Admin
 * @permissions support.config.update, admin.support
 */
router.put('/configuration/priorities',
  authorize(['support.config.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.updatePriorityLevels
);

/**
 * @route GET /api/admin/support/configuration/statuses
 * @description Retrieve ticket status configuration
 * @access Admin
 * @permissions support.config.read, admin.support
 */
router.get('/configuration/statuses',
  authorize(['support.config.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getTicketStatuses
);

/**
 * @route PUT /api/admin/support/configuration/statuses
 * @description Update ticket status configuration
 * @access Admin
 * @permissions support.config.update, admin.support
 */
router.put('/configuration/statuses',
  authorize(['support.config.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.updateTicketStatuses
);

// ==================== Support Automation Routes ====================

/**
 * @route GET /api/admin/support/automation/rules
 * @description Retrieve automation rules configuration
 * @access Admin
 * @permissions support.automation.read, admin.support
 */
router.get('/automation/rules',
  authorize(['support.automation.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getAutomationRules
);

/**
 * @route POST /api/admin/support/automation/rules
 * @description Create new automation rule
 * @access Admin
 * @permissions support.automation.create, admin.support
 */
router.post('/automation/rules',
  authorize(['support.automation.create', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.createAutomationRule
);

/**
 * @route GET /api/admin/support/automation/rules/:ruleId
 * @description Retrieve specific automation rule details
 * @access Admin
 * @permissions support.automation.read, admin.support
 */
router.get('/automation/rules/:ruleId',
  authorize(['support.automation.read', 'admin.support']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getAutomationRuleDetails
);

/**
 * @route PUT /api/admin/support/automation/rules/:ruleId
 * @description Update automation rule configuration
 * @access Admin
 * @permissions support.automation.update, admin.support
 */
router.put('/automation/rules/:ruleId',
  authorize(['support.automation.update', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.updateAutomationRule
);

/**
 * @route DELETE /api/admin/support/automation/rules/:ruleId
 * @description Delete automation rule
 * @access Admin
 * @permissions support.automation.delete, admin.support
 */
router.delete('/automation/rules/:ruleId',
  authorize(['support.automation.delete', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.deleteAutomationRule
);

/**
 * @route POST /api/admin/support/automation/rules/:ruleId/activate
 * @description Activate automation rule
 * @access Admin
 * @permissions support.automation.manage, admin.support
 */
router.post('/automation/rules/:ruleId/activate',
  authorize(['support.automation.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.activateAutomationRule
);

/**
 * @route POST /api/admin/support/automation/rules/:ruleId/deactivate
 * @description Deactivate automation rule
 * @access Admin
 * @permissions support.automation.manage, admin.support
 */
router.post('/automation/rules/:ruleId/deactivate',
  authorize(['support.automation.manage', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.deactivateAutomationRule
);

/**
 * @route POST /api/admin/support/automation/rules/:ruleId/test
 * @description Test automation rule execution
 * @access Admin
 * @permissions support.automation.test, admin.support
 */
router.post('/automation/rules/:ruleId/test',
  authorize(['support.automation.test', 'admin.support']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.testAutomationRule
);

// ==================== Support Performance Analytics Routes ====================

/**
 * @route GET /api/admin/support/analytics/dashboard
 * @description Retrieve comprehensive support analytics dashboard
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/dashboard',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getSupportAnalyticsDashboard
);

/**
 * @route GET /api/admin/support/analytics/performance
 * @description Get support team performance analytics
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/performance',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  supportAdminController.getPerformanceAnalytics
);

/**
 * @route GET /api/admin/support/analytics/tickets
 * @description Get ticket analytics and trends
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/tickets',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getTicketAnalytics
);

/**
 * @route GET /api/admin/support/analytics/satisfaction
 * @description Get customer satisfaction analytics
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/satisfaction',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  supportAdminController.getSatisfactionAnalytics
);

/**
 * @route GET /api/admin/support/analytics/response-times
 * @description Get response time analytics
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/response-times',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getResponseTimeAnalytics
);

/**
 * @route GET /api/admin/support/analytics/resolution-rates
 * @description Get resolution rate analytics
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/resolution-rates',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getResolutionRateAnalytics
);

/**
 * @route GET /api/admin/support/analytics/workload
 * @description Get workload distribution analytics
 * @access Admin
 * @permissions support.analytics.read, admin.analytics
 */
router.get('/analytics/workload',
  authorize(['support.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getWorkloadAnalytics
);

/**
 * @route POST /api/admin/support/analytics/reports
 * @description Generate custom support analytics reports
 * @access Admin
 * @permissions support.analytics.report, admin.analytics
 */
router.post('/analytics/reports',
  authorize(['support.analytics.report', 'admin.analytics']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.generateAnalyticsReport
);

// ==================== Support Quality Management Routes ====================

/**
 * @route GET /api/admin/support/quality/assessments
 * @description Retrieve quality assessments
 * @access Admin
 * @permissions support.quality.read, admin.quality
 */
router.get('/quality/assessments',
  authorize(['support.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getQualityAssessments
);

/**
 * @route POST /api/admin/support/quality/assessments
 * @description Create new quality assessment
 * @access Admin
 * @permissions support.quality.create, admin.quality
 */
router.post('/quality/assessments',
  authorize(['support.quality.create', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.createQualityAssessment
);

/**
 * @route GET /api/admin/support/quality/assessments/:assessmentId
 * @description Retrieve specific quality assessment details
 * @access Admin
 * @permissions support.quality.read, admin.quality
 */
router.get('/quality/assessments/:assessmentId',
  authorize(['support.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getQualityAssessmentDetails
);

/**
 * @route PUT /api/admin/support/quality/assessments/:assessmentId
 * @description Update quality assessment
 * @access Admin
 * @permissions support.quality.update, admin.quality
 */
router.put('/quality/assessments/:assessmentId',
  authorize(['support.quality.update', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.updateQualityAssessment
);

/**
 * @route POST /api/admin/support/quality/assessments/:assessmentId/approve
 * @description Approve quality assessment
 * @access Admin
 * @permissions support.quality.approve, admin.quality
 */
router.post('/quality/assessments/:assessmentId/approve',
  authorize(['support.quality.approve', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.approveQualityAssessment
);

/**
 * @route GET /api/admin/support/quality/metrics
 * @description Get quality metrics and KPIs
 * @access Admin
 * @permissions support.quality.read, admin.quality
 */
router.get('/quality/metrics',
  authorize(['support.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getQualityMetrics
);

/**
 * @route GET /api/admin/support/quality/standards
 * @description Retrieve quality standards configuration
 * @access Admin
 * @permissions support.quality.read, admin.quality
 */
router.get('/quality/standards',
  authorize(['support.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getQualityStandards
);

/**
 * @route PUT /api/admin/support/quality/standards
 * @description Update quality standards configuration
 * @access Admin
 * @permissions support.quality.configure, admin.quality
 */
router.put('/quality/standards',
  authorize(['support.quality.configure', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.updateQualityStandards
);

// ==================== Support Workflow Management Routes ====================

/**
 * @route GET /api/admin/support/workflows
 * @description Retrieve support workflows
 * @access Admin
 * @permissions support.workflows.read, admin.workflows
 */
router.get('/workflows',
  authorize(['support.workflows.read', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportWorkflows
);

/**
 * @route POST /api/admin/support/workflows
 * @description Create new support workflow
 * @access Admin
 * @permissions support.workflows.create, admin.workflows
 */
router.post('/workflows',
  authorize(['support.workflows.create', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 20 }),
  supportAdminController.createSupportWorkflow
);

/**
 * @route GET /api/admin/support/workflows/:workflowId
 * @description Retrieve specific workflow details
 * @access Admin
 * @permissions support.workflows.read, admin.workflows
 */
router.get('/workflows/:workflowId',
  authorize(['support.workflows.read', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getSupportWorkflowDetails
);

/**
 * @route PUT /api/admin/support/workflows/:workflowId
 * @description Update support workflow configuration
 * @access Admin
 * @permissions support.workflows.update, admin.workflows
 */
router.put('/workflows/:workflowId',
  authorize(['support.workflows.update', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.updateSupportWorkflow
);

/**
 * @route POST /api/admin/support/workflows/:workflowId/execute
 * @description Execute support workflow
 * @access Admin
 * @permissions support.workflows.execute, admin.workflows
 */
router.post('/workflows/:workflowId/execute',
  authorize(['support.workflows.execute', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 50 }),
  supportAdminController.executeSupportWorkflow
);

/**
 * @route POST /api/admin/support/workflows/:workflowId/activate
 * @description Activate support workflow
 * @access Admin
 * @permissions support.workflows.manage, admin.workflows
 */
router.post('/workflows/:workflowId/activate',
  authorize(['support.workflows.manage', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.activateSupportWorkflow
);

/**
 * @route POST /api/admin/support/workflows/:workflowId/deactivate
 * @description Deactivate support workflow
 * @access Admin
 * @permissions support.workflows.manage, admin.workflows
 */
router.post('/workflows/:workflowId/deactivate',
  authorize(['support.workflows.manage', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 40 }),
  supportAdminController.deactivateSupportWorkflow
);

// ==================== Support Integration Management Routes ====================

/**
 * @route GET /api/admin/support/integrations
 * @description Retrieve support system integrations
 * @access Admin
 * @permissions support.integrations.read, admin.integrations
 */
router.get('/integrations',
  authorize(['support.integrations.read', 'admin.integrations']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportIntegrations
);

/**
 * @route POST /api/admin/support/integrations
 * @description Create new support integration
 * @access Admin
 * @permissions support.integrations.create, admin.integrations
 */
router.post('/integrations',
  authorize(['support.integrations.create', 'admin.integrations']),
  rateLimit({ windowMs: 300000, max: 15 }),
  supportAdminController.createSupportIntegration
);

/**
 * @route GET /api/admin/support/integrations/:integrationId
 * @description Retrieve specific integration details
 * @access Admin
 * @permissions support.integrations.read, admin.integrations
 */
router.get('/integrations/:integrationId',
  authorize(['support.integrations.read', 'admin.integrations']),
  rateLimit({ windowMs: 60000, max: 200 }),
  supportAdminController.getSupportIntegrationDetails
);

/**
 * @route PUT /api/admin/support/integrations/:integrationId
 * @description Update support integration configuration
 * @access Admin
 * @permissions support.integrations.update, admin.integrations
 */
router.put('/integrations/:integrationId',
  authorize(['support.integrations.update', 'admin.integrations']),
  rateLimit({ windowMs: 300000, max: 25 }),
  supportAdminController.updateSupportIntegration
);

/**
 * @route POST /api/admin/support/integrations/:integrationId/test
 * @description Test support integration connectivity
 * @access Admin
 * @permissions support.integrations.test, admin.integrations
 */
router.post('/integrations/:integrationId/test',
  authorize(['support.integrations.test', 'admin.integrations']),
  rateLimit({ windowMs: 300000, max: 30 }),
  supportAdminController.testSupportIntegration
);

/**
 * @route POST /api/admin/support/integrations/:integrationId/sync
 * @description Synchronize data with external support system
 * @access Admin
 * @permissions support.integrations.sync, admin.integrations
 */
router.post('/integrations/:integrationId/sync',
  authorize(['support.integrations.sync', 'admin.integrations']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.syncSupportIntegration
);

// ==================== Support Bulk Operations Routes ====================

/**
 * @route POST /api/admin/support/bulk/tickets/assign
 * @description Bulk assign tickets to agents
 * @access Admin
 * @permissions support.bulk.assign, admin.support
 */
router.post('/bulk/tickets/assign',
  authorize(['support.bulk.assign', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.bulkAssignTickets
);

/**
 * @route POST /api/admin/support/bulk/tickets/update-status
 * @description Bulk update ticket statuses
 * @access Admin
 * @permissions support.bulk.update, admin.support
 */
router.post('/bulk/tickets/update-status',
  authorize(['support.bulk.update', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.bulkUpdateTicketStatus
);

/**
 * @route POST /api/admin/support/bulk/tickets/update-priority
 * @description Bulk update ticket priorities
 * @access Admin
 * @permissions support.bulk.update, admin.support
 */
router.post('/bulk/tickets/update-priority',
  authorize(['support.bulk.update', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.bulkUpdateTicketPriority
);

/**
 * @route POST /api/admin/support/bulk/tickets/add-tags
 * @description Bulk add tags to tickets
 * @access Admin
 * @permissions support.bulk.tag, admin.support
 */
router.post('/bulk/tickets/add-tags',
  authorize(['support.bulk.tag', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 15 }),
  supportAdminController.bulkAddTicketTags
);

/**
 * @route POST /api/admin/support/bulk/tickets/remove-tags
 * @description Bulk remove tags from tickets
 * @access Admin
 * @permissions support.bulk.tag, admin.support
 */
router.post('/bulk/tickets/remove-tags',
  authorize(['support.bulk.tag', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 15 }),
  supportAdminController.bulkRemoveTicketTags
);

/**
 * @route POST /api/admin/support/bulk/agents/update-teams
 * @description Bulk update agent team assignments
 * @access Admin
 * @permissions support.bulk.agents, admin.support
 */
router.post('/bulk/agents/update-teams',
  authorize(['support.bulk.agents', 'admin.support']),
  rateLimit({ windowMs: 600000, max: 10 }),
  supportAdminController.bulkUpdateAgentTeams
);

/**
 * @route POST /api/admin/support/bulk/export
 * @description Bulk export support data
 * @access Admin
 * @permissions support.bulk.export, admin.export
 */
router.post('/bulk/export',
  authorize(['support.bulk.export', 'admin.export']),
  rateLimit({ windowMs: 600000, max: 5 }),
  supportAdminController.bulkExportSupportData
);

// ==================== Support System Health Routes ====================

/**
 * @route GET /api/admin/support/health
 * @description Get support system health status
 * @access Admin
 * @permissions support.health.read, admin.monitoring
 */
router.get('/health',
  authorize(['support.health.read', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportSystemHealth
);

/**
 * @route GET /api/admin/support/health/detailed
 * @description Get detailed support system health information
 * @access Admin
 * @permissions support.health.detailed, admin.monitoring
 */
router.get('/health/detailed',
  authorize(['support.health.detailed', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 50 }),
  supportAdminController.getDetailedSystemHealth
);

/**
 * @route GET /api/admin/support/metrics/real-time
 * @description Get real-time support metrics
 * @access Admin
 * @permissions support.metrics.realtime, admin.monitoring
 */
router.get('/metrics/real-time',
  authorize(['support.metrics.realtime', 'admin.monitoring']),
  rateLimit({ windowMs: 10000, max: 200 }),
  supportAdminController.getRealTimeMetrics
);

/**
 * @route GET /api/admin/support/alerts
 * @description Get support system alerts
 * @access Admin
 * @permissions support.alerts.read, admin.alerts
 */
router.get('/alerts',
  authorize(['support.alerts.read', 'admin.alerts']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.getSupportAlerts
);

/**
 * @route POST /api/admin/support/alerts/:alertId/acknowledge
 * @description Acknowledge support system alert
 * @access Admin
 * @permissions support.alerts.manage, admin.alerts
 */
router.post('/alerts/:alertId/acknowledge',
  authorize(['support.alerts.manage', 'admin.alerts']),
  rateLimit({ windowMs: 60000, max: 100 }),
  supportAdminController.acknowledgeSupportAlert
);

// ==================== Error Handling Middleware ====================

/**
 * @description Handle route-specific errors
 */
router.use((error, req, res, next) => {
  logger.error('Support admin route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error in support administration';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: error.code || 'SUPPORT_ADMIN_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    }
  });
});

/**
 * @description Handle 404 errors for undefined routes
 */
router.use('*', (req, res) => {
  logger.warn('Support admin route not found:', {
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Support administration endpoint not found',
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    }
  });
});

logger.info('Support administration routes initialized successfully');

module.exports = router;