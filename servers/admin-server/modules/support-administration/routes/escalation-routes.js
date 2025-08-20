'use strict';

/**
 * @fileoverview Enterprise escalation routes for comprehensive escalation management operations
 * @module servers/admin-server/modules/support-administration/routes/escalation-routes
 * @requires express
 * @requires module:servers/admin-server/modules/support-administration/controllers/escalation-controller
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
const EscalationController = require('../controllers/escalation-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const auditLogger = require('../../../../../shared/lib/middleware/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const compression = require('../../../../../shared/lib/middleware/compression-config');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const logger = require('../../../../../shared/lib/utils/logger');

const router = express.Router();
const escalationController = new EscalationController();

// ==================== Global Route Middleware Configuration ====================

// Apply security headers to all routes
router.use(securityHeaders);

// Apply CORS configuration
router.use(corsMiddleware);

// Apply compression for performance optimization
router.use(compression);

// Apply authentication to all escalation routes
router.use(authenticate);

// Apply audit logging to all operations
router.use(auditLogger);

// ==================== Escalation Rule Management Routes ====================

/**
 * @route GET /api/admin/escalation/rules
 * @description Retrieve escalation rules with filtering and pagination
 * @access Admin
 * @permissions escalation.read, admin.escalation
 */
router.get('/rules', 
  authorize(['escalation.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.getEscalationRules
);

/**
 * @route POST /api/admin/escalation/rules
 * @description Create new escalation rule with comprehensive configuration
 * @access Admin
 * @permissions escalation.create, admin.escalation
 */
router.post('/rules',
  authorize(['escalation.create', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 20 }),
  escalationController.createEscalationRule
);

/**
 * @route GET /api/admin/escalation/rules/:ruleId
 * @description Retrieve specific escalation rule with complete details
 * @access Admin
 * @permissions escalation.read, admin.escalation
 */
router.get('/rules/:ruleId',
  authorize(['escalation.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 300 }),
  escalationController.getEscalationRuleDetails
);

/**
 * @route PUT /api/admin/escalation/rules/:ruleId
 * @description Update escalation rule configuration and settings
 * @access Admin
 * @permissions escalation.update, admin.escalation
 */
router.put('/rules/:ruleId',
  authorize(['escalation.update', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 40 }),
  escalationController.updateEscalationRule
);

/**
 * @route DELETE /api/admin/escalation/rules/:ruleId
 * @description Delete escalation rule with proper cleanup
 * @access Admin
 * @permissions escalation.delete, admin.escalation
 */
router.delete('/rules/:ruleId',
  authorize(['escalation.delete', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 15 }),
  escalationController.deleteEscalationRule
);

// ==================== Escalation Rule Operations Routes ====================

/**
 * @route POST /api/admin/escalation/rules/:ruleId/:operation
 * @description Handle escalation rule operations (activate, deactivate, test, etc.)
 * @access Admin
 * @permissions escalation.manage, admin.escalation
 */
router.post('/rules/:ruleId/:operation',
  authorize(['escalation.manage', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 60 }),
  escalationController.manageEscalationRule
);

/**
 * @route GET /api/admin/escalation/rules/active
 * @description Retrieve all active escalation rules
 * @access Admin
 * @permissions escalation.read, admin.escalation
 */
router.get('/rules/active',
  authorize(['escalation.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.getActiveEscalationRules
);

/**
 * @route GET /api/admin/escalation/rules/inactive
 * @description Retrieve all inactive escalation rules
 * @access Admin
 * @permissions escalation.read, admin.escalation
 */
router.get('/rules/inactive',
  authorize(['escalation.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getInactiveEscalationRules
);

/**
 * @route GET /api/admin/escalation/rules/testing
 * @description Retrieve escalation rules in testing mode
 * @access Admin
 * @permissions escalation.test, admin.escalation
 */
router.get('/rules/testing',
  authorize(['escalation.test', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getTestingEscalationRules
);

/**
 * @route POST /api/admin/escalation/rules/:ruleId/validate
 * @description Validate escalation rule configuration
 * @access Admin
 * @permissions escalation.validate, admin.escalation
 */
router.post('/rules/:ruleId/validate',
  authorize(['escalation.validate', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 80 }),
  escalationController.validateEscalationRule
);

/**
 * @route POST /api/admin/escalation/rules/:ruleId/simulate
 * @description Simulate escalation rule execution
 * @access Admin
 * @permissions escalation.simulate, admin.escalation
 */
router.post('/rules/:ruleId/simulate',
  authorize(['escalation.simulate', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 50 }),
  escalationController.simulateEscalationRule
);

// ==================== Ticket Escalation Routes ====================

/**
 * @route POST /api/admin/escalation/tickets/:ticketId/:operation
 * @description Handle ticket escalation operations
 * @access Admin
 * @permissions escalation.execute, admin.escalation
 */
router.post('/tickets/:ticketId/:operation',
  authorize(['escalation.execute', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.escalateTicket
);

/**
 * @route GET /api/admin/escalation/tickets/escalated
 * @description Retrieve all currently escalated tickets
 * @access Admin
 * @permissions escalation.read, admin.escalation
 */
router.get('/tickets/escalated',
  authorize(['escalation.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.getEscalatedTickets
);

/**
 * @route GET /api/admin/escalation/tickets/queue
 * @description Retrieve escalation queue with prioritization
 * @access Admin
 * @permissions escalation.queue.read, admin.escalation
 */
router.get('/tickets/queue',
  authorize(['escalation.queue.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getEscalationQueue
);

/**
 * @route GET /api/admin/escalation/tickets/pending
 * @description Retrieve tickets pending escalation
 * @access Admin
 * @permissions escalation.pending.read, admin.escalation
 */
router.get('/tickets/pending',
  authorize(['escalation.pending.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getPendingEscalationTickets
);

/**
 * @route GET /api/admin/escalation/tickets/:ticketId/history
 * @description Get escalation history for specific ticket
 * @access Admin
 * @permissions escalation.history.read, admin.escalation
 */
router.get('/tickets/:ticketId/history',
  authorize(['escalation.history.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 250 }),
  escalationController.getTicketEscalationHistory
);

/**
 * @route GET /api/admin/escalation/tickets/:ticketId/eligibility
 * @description Check ticket escalation eligibility
 * @access Admin
 * @permissions escalation.check, admin.escalation
 */
router.get('/tickets/:ticketId/eligibility',
  authorize(['escalation.check', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.checkEscalationEligibility
);

/**
 * @route POST /api/admin/escalation/tickets/:ticketId/force-escalate
 * @description Force escalate ticket bypassing normal rules
 * @access Admin
 * @permissions escalation.force, admin.escalation
 */
router.post('/tickets/:ticketId/force-escalate',
  authorize(['escalation.force', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 30 }),
  escalationController.forceEscalateTicket
);

/**
 * @route POST /api/admin/escalation/tickets/:ticketId/override
 * @description Override automatic escalation for ticket
 * @access Admin
 * @permissions escalation.override, admin.escalation
 */
router.post('/tickets/:ticketId/override',
  authorize(['escalation.override', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 40 }),
  escalationController.overrideEscalation
);

// ==================== SLA Management Routes ====================

/**
 * @route GET /api/admin/escalation/sla/:operation
 * @description Handle SLA monitoring and management operations
 * @access Admin
 * @permissions sla.read, admin.sla
 */
router.get('/sla/:operation',
  authorize(['sla.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.manageSla
);

/**
 * @route POST /api/admin/escalation/sla/:operation
 * @description Handle SLA configuration and update operations
 * @access Admin
 * @permissions sla.manage, admin.sla
 */
router.post('/sla/:operation',
  authorize(['sla.manage', 'admin.sla']),
  rateLimit({ windowMs: 300000, max: 50 }),
  escalationController.manageSla
);

/**
 * @route GET /api/admin/escalation/sla/violations
 * @description Retrieve SLA violations and breach reports
 * @access Admin
 * @permissions sla.violations.read, admin.sla
 */
router.get('/sla/violations',
  authorize(['sla.violations.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getSlaViolations
);

/**
 * @route GET /api/admin/escalation/sla/at-risk
 * @description Retrieve tickets at risk of SLA violation
 * @access Admin
 * @permissions sla.risk.read, admin.sla
 */
router.get('/sla/at-risk',
  authorize(['sla.risk.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getTicketsAtSlaRisk
);

/**
 * @route GET /api/admin/escalation/sla/performance
 * @description Get SLA performance metrics and statistics
 * @access Admin
 * @permissions sla.performance.read, admin.sla
 */
router.get('/sla/performance',
  authorize(['sla.performance.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getSlaPerformanceMetrics
);

/**
 * @route PUT /api/admin/escalation/sla/thresholds
 * @description Update SLA thresholds and warning levels
 * @access Admin
 * @permissions sla.configure, admin.sla
 */
router.put('/sla/thresholds',
  authorize(['sla.configure', 'admin.sla']),
  rateLimit({ windowMs: 300000, max: 30 }),
  escalationController.updateSlaThresholds
);

/**
 * @route POST /api/admin/escalation/sla/alerts/configure
 * @description Configure SLA alert settings
 * @access Admin
 * @permissions sla.alerts.configure, admin.sla
 */
router.post('/sla/alerts/configure',
  authorize(['sla.alerts.configure', 'admin.sla']),
  rateLimit({ windowMs: 300000, max: 40 }),
  escalationController.configureSlaAlerts
);

/**
 * @route GET /api/admin/escalation/sla/dashboard
 * @description Get comprehensive SLA monitoring dashboard
 * @access Admin
 * @permissions sla.dashboard.read, admin.sla
 */
router.get('/sla/dashboard',
  authorize(['sla.dashboard.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 80 }),
  escalationController.getSlaDashboard
);

// ==================== Escalation Analytics Routes ====================

/**
 * @route GET /api/admin/escalation/analytics/:analysisType
 * @description Retrieve escalation analytics and metrics
 * @access Admin
 * @permissions escalation.analytics, admin.analytics
 */
router.get('/analytics/:analysisType',
  authorize(['escalation.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  escalationController.getEscalationAnalytics
);

/**
 * @route GET /api/admin/escalation/analytics/dashboard/overview
 * @description Get escalation analytics dashboard overview
 * @access Admin
 * @permissions escalation.analytics, admin.analytics
 */
router.get('/analytics/dashboard/overview',
  authorize(['escalation.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 60 }),
  escalationController.getEscalationAnalyticsDashboard
);

/**
 * @route GET /api/admin/escalation/analytics/patterns
 * @description Analyze escalation patterns and trends
 * @access Admin
 * @permissions escalation.analytics.patterns, admin.analytics
 */
router.get('/analytics/patterns',
  authorize(['escalation.analytics.patterns', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  escalationController.getEscalationPatterns
);

/**
 * @route GET /api/admin/escalation/analytics/performance
 * @description Get escalation team performance analytics
 * @access Admin
 * @permissions escalation.analytics.performance, admin.analytics
 */
router.get('/analytics/performance',
  authorize(['escalation.analytics.performance', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  escalationController.getEscalationPerformanceAnalytics
);

/**
 * @route GET /api/admin/escalation/analytics/effectiveness
 * @description Analyze escalation rule effectiveness
 * @access Admin
 * @permissions escalation.analytics.effectiveness, admin.analytics
 */
router.get('/analytics/effectiveness',
  authorize(['escalation.analytics.effectiveness', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  escalationController.getEscalationEffectivenessAnalytics
);

/**
 * @route GET /api/admin/escalation/analytics/trends
 * @description Get escalation volume and trend analysis
 * @access Admin
 * @permissions escalation.analytics.trends, admin.analytics
 */
router.get('/analytics/trends',
  authorize(['escalation.analytics.trends', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  escalationController.getEscalationTrendAnalytics
);

/**
 * @route POST /api/admin/escalation/analytics/reports/custom
 * @description Generate custom escalation analytics reports
 * @access Admin
 * @permissions escalation.analytics.custom, admin.analytics
 */
router.post('/analytics/reports/custom',
  authorize(['escalation.analytics.custom', 'admin.analytics']),
  rateLimit({ windowMs: 300000, max: 20 }),
  escalationController.generateCustomEscalationReport
);

// ==================== Escalation Workflow Routes ====================

/**
 * @route POST /api/admin/escalation/workflows/:workflowType/execute
 * @description Execute escalation workflows
 * @access Admin
 * @permissions escalation.workflow, admin.workflows
 */
router.post('/workflows/:workflowType/execute',
  authorize(['escalation.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 30 }),
  escalationController.executeEscalationWorkflow
);

/**
 * @route GET /api/admin/escalation/workflows
 * @description Retrieve available escalation workflows
 * @access Admin
 * @permissions escalation.workflow, admin.workflows
 */
router.get('/workflows',
  authorize(['escalation.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getAvailableEscalationWorkflows
);

/**
 * @route GET /api/admin/escalation/workflows/active
 * @description Retrieve active escalation workflow instances
 * @access Admin
 * @permissions escalation.workflow, admin.workflows
 */
router.get('/workflows/active',
  authorize(['escalation.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getActiveEscalationWorkflows
);

/**
 * @route GET /api/admin/escalation/workflows/:workflowId/status
 * @description Get escalation workflow execution status
 * @access Admin
 * @permissions escalation.workflow, admin.workflows
 */
router.get('/workflows/:workflowId/status',
  authorize(['escalation.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.getEscalationWorkflowStatus
);

/**
 * @route POST /api/admin/escalation/workflows/:workflowId/cancel
 * @description Cancel running escalation workflow
 * @access Admin
 * @permissions escalation.workflow.cancel, admin.workflows
 */
router.post('/workflows/:workflowId/cancel',
  authorize(['escalation.workflow.cancel', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 50 }),
  escalationController.cancelEscalationWorkflow
);

// ==================== Escalation Team Management Routes ====================

/**
 * @route GET /api/admin/escalation/teams
 * @description Retrieve escalation teams and assignments
 * @access Admin
 * @permissions escalation.teams.read, admin.escalation
 */
router.get('/teams',
  authorize(['escalation.teams.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getEscalationTeams
);

/**
 * @route POST /api/admin/escalation/teams
 * @description Create new escalation team
 * @access Admin
 * @permissions escalation.teams.create, admin.escalation
 */
router.post('/teams',
  authorize(['escalation.teams.create', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 20 }),
  escalationController.createEscalationTeam
);

/**
 * @route GET /api/admin/escalation/teams/:teamId
 * @description Retrieve specific escalation team details
 * @access Admin
 * @permissions escalation.teams.read, admin.escalation
 */
router.get('/teams/:teamId',
  authorize(['escalation.teams.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.getEscalationTeamDetails
);

/**
 * @route PUT /api/admin/escalation/teams/:teamId
 * @description Update escalation team configuration
 * @access Admin
 * @permissions escalation.teams.update, admin.escalation
 */
router.put('/teams/:teamId',
  authorize(['escalation.teams.update', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 40 }),
  escalationController.updateEscalationTeam
);

/**
 * @route GET /api/admin/escalation/teams/:teamId/workload
 * @description Get escalation team workload distribution
 * @access Admin
 * @permissions escalation.teams.workload, admin.escalation
 */
router.get('/teams/:teamId/workload',
  authorize(['escalation.teams.workload', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getEscalationTeamWorkload
);

/**
 * @route GET /api/admin/escalation/teams/:teamId/performance
 * @description Get escalation team performance metrics
 * @access Admin
 * @permissions escalation.teams.performance, admin.escalation
 */
router.get('/teams/:teamId/performance',
  authorize(['escalation.teams.performance', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationTeamPerformance
);

// ==================== Escalation Assignment Routes ====================

/**
 * @route GET /api/admin/escalation/assignments
 * @description Retrieve escalation assignments and routing
 * @access Admin
 * @permissions escalation.assignments.read, admin.escalation
 */
router.get('/assignments',
  authorize(['escalation.assignments.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getEscalationAssignments
);

/**
 * @route POST /api/admin/escalation/assignments/auto-assign
 * @description Trigger automatic escalation assignment
 * @access Admin
 * @permissions escalation.assignments.auto, admin.escalation
 */
router.post('/assignments/auto-assign',
  authorize(['escalation.assignments.auto', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 40 }),
  escalationController.autoAssignEscalations
);

/**
 * @route POST /api/admin/escalation/assignments/manual-assign
 * @description Manually assign escalation to team or agent
 * @access Admin
 * @permissions escalation.assignments.manual, admin.escalation
 */
router.post('/assignments/manual-assign',
  authorize(['escalation.assignments.manual', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 60 }),
  escalationController.manualAssignEscalation
);

/**
 * @route PUT /api/admin/escalation/assignments/:assignmentId/reassign
 * @description Reassign escalation to different team or agent
 * @access Admin
 * @permissions escalation.assignments.reassign, admin.escalation
 */
router.put('/assignments/:assignmentId/reassign',
  authorize(['escalation.assignments.reassign', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 80 }),
  escalationController.reassignEscalation
);

/**
 * @route GET /api/admin/escalation/assignments/load-balancing
 * @description Get escalation load balancing metrics
 * @access Admin
 * @permissions escalation.assignments.balance, admin.escalation
 */
router.get('/assignments/load-balancing',
  authorize(['escalation.assignments.balance', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationLoadBalancing
);

// ==================== Escalation Configuration Routes ====================

/**
 * @route GET /api/admin/escalation/configuration
 * @description Retrieve escalation system configuration
 * @access Admin
 * @permissions escalation.config.read, admin.escalation
 */
router.get('/configuration',
  authorize(['escalation.config.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationConfiguration
);

/**
 * @route PUT /api/admin/escalation/configuration
 * @description Update escalation system configuration
 * @access Admin
 * @permissions escalation.config.update, admin.escalation
 */
router.put('/configuration',
  authorize(['escalation.config.update', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 20 }),
  escalationController.updateEscalationConfiguration
);

/**
 * @route GET /api/admin/escalation/configuration/matrix
 * @description Retrieve escalation matrix configuration
 * @access Admin
 * @permissions escalation.matrix.read, admin.escalation
 */
router.get('/configuration/matrix',
  authorize(['escalation.matrix.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationMatrix
);

/**
 * @route PUT /api/admin/escalation/configuration/matrix
 * @description Update escalation matrix configuration
 * @access Admin
 * @permissions escalation.matrix.update, admin.escalation
 */
router.put('/configuration/matrix',
  authorize(['escalation.matrix.update', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 25 }),
  escalationController.updateEscalationMatrix
);

/**
 * @route GET /api/admin/escalation/configuration/levels
 * @description Retrieve escalation levels configuration
 * @access Admin
 * @permissions escalation.levels.read, admin.escalation
 */
router.get('/configuration/levels',
  authorize(['escalation.levels.read', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationLevels
);

/**
 * @route PUT /api/admin/escalation/configuration/levels
 * @description Update escalation levels configuration
 * @access Admin
 * @permissions escalation.levels.update, admin.escalation
 */
router.put('/configuration/levels',
  authorize(['escalation.levels.update', 'admin.escalation']),
  rateLimit({ windowMs: 300000, max: 25 }),
  escalationController.updateEscalationLevels
);

// ==================== Escalation Bulk Operations Routes ====================

/**
 * @route POST /api/admin/escalation/bulk/:operation
 * @description Handle bulk escalation operations
 * @access Admin
 * @permissions escalation.bulk, admin.escalation
 */
router.post('/bulk/:operation',
  authorize(['escalation.bulk', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 10 }),
  escalationController.bulkEscalationOperations
);

/**
 * @route POST /api/admin/escalation/bulk/rules/activate
 * @description Bulk activate escalation rules
 * @access Admin
 * @permissions escalation.bulk.activate, admin.escalation
 */
router.post('/bulk/rules/activate',
  authorize(['escalation.bulk.activate', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 15 }),
  escalationController.bulkActivateEscalationRules
);

/**
 * @route POST /api/admin/escalation/bulk/rules/deactivate
 * @description Bulk deactivate escalation rules
 * @access Admin
 * @permissions escalation.bulk.deactivate, admin.escalation
 */
router.post('/bulk/rules/deactivate',
  authorize(['escalation.bulk.deactivate', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 15 }),
  escalationController.bulkDeactivateEscalationRules
);

/**
 * @route POST /api/admin/escalation/bulk/tickets/escalate
 * @description Bulk escalate multiple tickets
 * @access Admin
 * @permissions escalation.bulk.escalate, admin.escalation
 */
router.post('/bulk/tickets/escalate',
  authorize(['escalation.bulk.escalate', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 12 }),
  escalationController.bulkEscalateTickets
);

/**
 * @route POST /api/admin/escalation/bulk/tickets/de-escalate
 * @description Bulk de-escalate multiple tickets
 * @access Admin
 * @permissions escalation.bulk.deescalate, admin.escalation
 */
router.post('/bulk/tickets/de-escalate',
  authorize(['escalation.bulk.deescalate', 'admin.escalation']),
  rateLimit({ windowMs: 600000, max: 12 }),
  escalationController.bulkDeEscalateTickets
);

/**
 * @route POST /api/admin/escalation/bulk/export
 * @description Bulk export escalation data
 * @access Admin
 * @permissions escalation.bulk.export, admin.export
 */
router.post('/bulk/export',
  authorize(['escalation.bulk.export', 'admin.export']),
  rateLimit({ windowMs: 600000, max: 8 }),
  escalationController.bulkExportEscalationData
);

// ==================== Escalation Dashboard Routes ====================

/**
 * @route GET /api/admin/escalation/dashboard/:dashboardType
 * @description Retrieve escalation dashboards
 * @access Admin
 * @permissions escalation.dashboard, admin.dashboard
 */
router.get('/dashboard/:dashboardType',
  authorize(['escalation.dashboard', 'admin.dashboard']),
  rateLimit({ windowMs: 60000, max: 80 }),
  escalationController.getEscalationDashboard
);

/**
 * @route GET /api/admin/escalation/dashboard/real-time/metrics
 * @description Get real-time escalation metrics
 * @access Admin
 * @permissions escalation.realtime, admin.monitoring
 */
router.get('/dashboard/real-time/metrics',
  authorize(['escalation.realtime', 'admin.monitoring']),
  rateLimit({ windowMs: 10000, max: 300 }),
  escalationController.getRealTimeEscalationMetrics
);

/**
 * @route GET /api/admin/escalation/dashboard/overview/summary
 * @description Get escalation overview summary
 * @access Admin
 * @permissions escalation.overview, admin.escalation
 */
router.get('/dashboard/overview/summary',
  authorize(['escalation.overview', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationOverviewSummary
);

/**
 * @route GET /api/admin/escalation/dashboard/performance/kpis
 * @description Get escalation performance KPIs
 * @access Admin
 * @permissions escalation.kpis, admin.escalation
 */
router.get('/dashboard/performance/kpis',
  authorize(['escalation.kpis', 'admin.escalation']),
  rateLimit({ windowMs: 60000, max: 80 }),
  escalationController.getEscalationPerformanceKPIs
);

// ==================== Escalation Notification Routes ====================

/**
 * @route GET /api/admin/escalation/notifications
 * @description Retrieve escalation notifications and alerts
 * @access Admin
 * @permissions escalation.notifications.read, admin.notifications
 */
router.get('/notifications',
  authorize(['escalation.notifications.read', 'admin.notifications']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getEscalationNotifications
);

/**
 * @route POST /api/admin/escalation/notifications/configure
 * @description Configure escalation notification settings
 * @access Admin
 * @permissions escalation.notifications.configure, admin.notifications
 */
router.post('/notifications/configure',
  authorize(['escalation.notifications.configure', 'admin.notifications']),
  rateLimit({ windowMs: 300000, max: 30 }),
  escalationController.configureEscalationNotifications
);

/**
 * @route PUT /api/admin/escalation/notifications/:notificationId/acknowledge
 * @description Acknowledge escalation notification
 * @access Admin
 * @permissions escalation.notifications.acknowledge, admin.notifications
 */
router.put('/notifications/:notificationId/acknowledge',
  authorize(['escalation.notifications.acknowledge', 'admin.notifications']),
  rateLimit({ windowMs: 60000, max: 200 }),
  escalationController.acknowledgeEscalationNotification
);

/**
 * @route GET /api/admin/escalation/notifications/pending
 * @description Get pending escalation notifications
 * @access Admin
 * @permissions escalation.notifications.pending, admin.notifications
 */
router.get('/notifications/pending',
  authorize(['escalation.notifications.pending', 'admin.notifications']),
  rateLimit({ windowMs: 60000, max: 150 }),
  escalationController.getPendingEscalationNotifications
);

// ==================== Escalation Integration Routes ====================

/**
 * @route GET /api/admin/escalation/integrations
 * @description Retrieve escalation system integrations
 * @access Admin
 * @permissions escalation.integrations.read, admin.integrations
 */
router.get('/integrations',
  authorize(['escalation.integrations.read', 'admin.integrations']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationIntegrations
);

/**
 * @route POST /api/admin/escalation/integrations/test
 * @description Test escalation system integrations
 * @access Admin
 * @permissions escalation.integrations.test, admin.integrations
 */
router.post('/integrations/test',
  authorize(['escalation.integrations.test', 'admin.integrations']),
  rateLimit({ windowMs: 300000, max: 30 }),
  escalationController.testEscalationIntegrations
);

/**
 * @route POST /api/admin/escalation/integrations/sync
 * @description Synchronize escalation data with external systems
 * @access Admin
 * @permissions escalation.integrations.sync, admin.integrations
 */
router.post('/integrations/sync',
  authorize(['escalation.integrations.sync', 'admin.integrations']),
  rateLimit({ windowMs: 600000, max: 10 }),
  escalationController.syncEscalationIntegrations
);

// ==================== Escalation Health and Monitoring Routes ====================

/**
 * @route GET /api/admin/escalation/health
 * @description Get escalation system health status
 * @access Admin
 * @permissions escalation.health.read, admin.monitoring
 */
router.get('/health',
  authorize(['escalation.health.read', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationSystemHealth
);

/**
 * @route GET /api/admin/escalation/health/detailed
 * @description Get detailed escalation system health information
 * @access Admin
 * @permissions escalation.health.detailed, admin.monitoring
 */
router.get('/health/detailed',
  authorize(['escalation.health.detailed', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 60 }),
  escalationController.getDetailedEscalationHealth
);

/**
 * @route GET /api/admin/escalation/metrics/performance
 * @description Get escalation performance metrics
 * @access Admin
 * @permissions escalation.metrics.performance, admin.monitoring
 */
router.get('/metrics/performance',
  authorize(['escalation.metrics.performance', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 80 }),
  escalationController.getEscalationPerformanceMetrics
);

/**
 * @route GET /api/admin/escalation/alerts
 * @description Get escalation system alerts
 * @access Admin
 * @permissions escalation.alerts.read, admin.alerts
 */
router.get('/alerts',
  authorize(['escalation.alerts.read', 'admin.alerts']),
  rateLimit({ windowMs: 60000, max: 100 }),
  escalationController.getEscalationAlerts
);

/**
 * @route POST /api/admin/escalation/alerts/:alertId/acknowledge
 * @description Acknowledge escalation system alert
 * @access Admin
 * @permissions escalation.alerts.acknowledge, admin.alerts
 */
router.post('/alerts/:alertId/acknowledge',
  authorize(['escalation.alerts.acknowledge', 'admin.alerts']),
  rateLimit({ windowMs: 60000, max: 120 }),
  escalationController.acknowledgeEscalationAlert
);

// ==================== Error Handling Middleware ====================

/**
 * @description Handle route-specific errors
 */
router.use((error, req, res, next) => {
  logger.error('Escalation route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip,
    ruleId: req.params.ruleId,
    ticketId: req.params.ticketId
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error in escalation management';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: error.code || 'ESCALATION_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      ruleId: req.params.ruleId,
      ticketId: req.params.ticketId,
      requestId: req.headers['x-request-id']
    }
  });
});

/**
 * @description Handle 404 errors for undefined routes
 */
router.use('*', (req, res) => {
  logger.warn('Escalation route not found:', {
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Escalation endpoint not found',
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    }
  });
});

logger.info('Escalation routes initialized successfully');

module.exports = router;