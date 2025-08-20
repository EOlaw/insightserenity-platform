'use strict';

/**
 * @fileoverview Enterprise ticket management routes for comprehensive ticket lifecycle operations
 * @module servers/admin-server/modules/support-administration/routes/ticket-management-routes
 * @requires express
 * @requires module:servers/admin-server/modules/support-administration/controllers/ticket-management-controller
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
const TicketManagementController = require('../controllers/ticket-management-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const auditLogger = require('../../../../../shared/lib/middleware/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const compression = require('../../../../../shared/lib/middleware/compression-config');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const logger = require('../../../../../shared/lib/utils/logger');

const router = express.Router();
const ticketManagementController = new TicketManagementController();

// ==================== Global Route Middleware Configuration ====================

// Apply security headers to all routes
router.use(securityHeaders);

// Apply CORS configuration
router.use(corsMiddleware);

// Apply compression for performance optimization
router.use(compression);

// Apply authentication to all ticket management routes
router.use(authenticate);

// Apply audit logging to all operations
router.use(auditLogger);

// ==================== Ticket CRUD Operations Routes ====================

/**
 * @route GET /api/admin/tickets
 * @description Retrieve support tickets with advanced filtering and pagination
 * @access Admin
 * @permissions ticket.read, admin.tickets
 */
router.get('/', 
  authorize(['ticket.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTickets
);

/**
 * @route POST /api/admin/tickets
 * @description Create new support ticket with comprehensive data
 * @access Admin
 * @permissions ticket.create, admin.tickets
 */
router.post('/',
  authorize(['ticket.create', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.createTicket
);

/**
 * @route GET /api/admin/tickets/:ticketId
 * @description Retrieve specific ticket with complete details and history
 * @access Admin
 * @permissions ticket.read, admin.tickets
 */
router.get('/:ticketId',
  authorize(['ticket.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 300 }),
  ticketManagementController.getTicketDetails
);

/**
 * @route PUT /api/admin/tickets/:ticketId
 * @description Update ticket information and metadata
 * @access Admin
 * @permissions ticket.update, admin.tickets
 */
router.put('/:ticketId',
  authorize(['ticket.update', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.updateTicket
);

/**
 * @route DELETE /api/admin/tickets/:ticketId
 * @description Soft delete ticket with proper archiving
 * @access Admin
 * @permissions ticket.delete, admin.tickets
 */
router.delete('/:ticketId',
  authorize(['ticket.delete', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 20 }),
  ticketManagementController.deleteTicket
);

// ==================== Ticket Assignment Routes ====================

/**
 * @route POST /api/admin/tickets/:ticketId/assign
 * @description Assign ticket to specific agent or team
 * @access Admin
 * @permissions ticket.assign, admin.tickets
 */
router.post('/:ticketId/assign',
  authorize(['ticket.assign', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.assignTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/reassign
 * @description Reassign ticket to different agent or team
 * @access Admin
 * @permissions ticket.reassign, admin.tickets
 */
router.post('/:ticketId/reassign',
  authorize(['ticket.reassign', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.reassignTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/unassign
 * @description Remove assignment from ticket
 * @access Admin
 * @permissions ticket.unassign, admin.tickets
 */
router.post('/:ticketId/unassign',
  authorize(['ticket.unassign', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 60 }),
  ticketManagementController.unassignTicket
);

/**
 * @route GET /api/admin/tickets/assignment/queue
 * @description Retrieve ticket assignment queue with prioritization
 * @access Admin
 * @permissions ticket.assignment.read, admin.tickets
 */
router.get('/assignment/queue',
  authorize(['ticket.assignment.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 100 }),
  ticketManagementController.getAssignmentQueue
);

/**
 * @route POST /api/admin/tickets/assignment/auto-assign
 * @description Trigger automatic ticket assignment based on rules
 * @access Admin
 * @permissions ticket.assignment.auto, admin.tickets
 */
router.post('/assignment/auto-assign',
  authorize(['ticket.assignment.auto', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 30 }),
  ticketManagementController.autoAssignTickets
);

// ==================== Ticket Status Management Routes ====================

/**
 * @route PUT /api/admin/tickets/:ticketId/status
 * @description Update ticket status with proper workflow validation
 * @access Admin
 * @permissions ticket.status.update, admin.tickets
 */
router.put('/:ticketId/status',
  authorize(['ticket.status.update', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 150 }),
  ticketManagementController.updateTicketStatus
);

/**
 * @route POST /api/admin/tickets/:ticketId/close
 * @description Close ticket with resolution details
 * @access Admin
 * @permissions ticket.close, admin.tickets
 */
router.post('/:ticketId/close',
  authorize(['ticket.close', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.closeTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/reopen
 * @description Reopen closed ticket with justification
 * @access Admin
 * @permissions ticket.reopen, admin.tickets
 */
router.post('/:ticketId/reopen',
  authorize(['ticket.reopen', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.reopenTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/resolve
 * @description Mark ticket as resolved with solution details
 * @access Admin
 * @permissions ticket.resolve, admin.tickets
 */
router.post('/:ticketId/resolve',
  authorize(['ticket.resolve', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.resolveTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/hold
 * @description Put ticket on hold with reason
 * @access Admin
 * @permissions ticket.hold, admin.tickets
 */
router.post('/:ticketId/hold',
  authorize(['ticket.hold', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.holdTicket
);

/**
 * @route POST /api/admin/tickets/:ticketId/release-hold
 * @description Release ticket from hold status
 * @access Admin
 * @permissions ticket.hold.release, admin.tickets
 */
router.post('/:ticketId/release-hold',
  authorize(['ticket.hold.release', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.releaseTicketHold
);

// ==================== Ticket Priority Management Routes ====================

/**
 * @route PUT /api/admin/tickets/:ticketId/priority
 * @description Update ticket priority with authorization checks
 * @access Admin
 * @permissions ticket.priority.update, admin.tickets
 */
router.put('/:ticketId/priority',
  authorize(['ticket.priority.update', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.updateTicketPriority
);

/**
 * @route POST /api/admin/tickets/:ticketId/escalate-priority
 * @description Escalate ticket priority with approval workflow
 * @access Admin
 * @permissions ticket.priority.escalate, admin.tickets
 */
router.post('/:ticketId/escalate-priority',
  authorize(['ticket.priority.escalate', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.escalateTicketPriority
);

/**
 * @route GET /api/admin/tickets/priority/high
 * @description Retrieve high priority tickets for monitoring
 * @access Admin
 * @permissions ticket.priority.read, admin.tickets
 */
router.get('/priority/high',
  authorize(['ticket.priority.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getHighPriorityTickets
);

/**
 * @route GET /api/admin/tickets/priority/critical
 * @description Retrieve critical priority tickets requiring immediate attention
 * @access Admin
 * @permissions ticket.priority.critical, admin.tickets
 */
router.get('/priority/critical',
  authorize(['ticket.priority.critical', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getCriticalPriorityTickets
);

// ==================== Ticket Category and Classification Routes ====================

/**
 * @route PUT /api/admin/tickets/:ticketId/category
 * @description Update ticket category and subcategory
 * @access Admin
 * @permissions ticket.category.update, admin.tickets
 */
router.put('/:ticketId/category',
  authorize(['ticket.category.update', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.updateTicketCategory
);

/**
 * @route POST /api/admin/tickets/:ticketId/tags
 * @description Add tags to ticket for better organization
 * @access Admin
 * @permissions ticket.tags.add, admin.tickets
 */
router.post('/:ticketId/tags',
  authorize(['ticket.tags.add', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 150 }),
  ticketManagementController.addTicketTags
);

/**
 * @route DELETE /api/admin/tickets/:ticketId/tags
 * @description Remove tags from ticket
 * @access Admin
 * @permissions ticket.tags.remove, admin.tickets
 */
router.delete('/:ticketId/tags',
  authorize(['ticket.tags.remove', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 150 }),
  ticketManagementController.removeTicketTags
);

/**
 * @route POST /api/admin/tickets/:ticketId/auto-classify
 * @description Automatically classify ticket using AI/ML algorithms
 * @access Admin
 * @permissions ticket.classify.auto, admin.tickets
 */
router.post('/:ticketId/auto-classify',
  authorize(['ticket.classify.auto', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.autoClassifyTicket
);

// ==================== Ticket Communication Routes ====================

/**
 * @route GET /api/admin/tickets/:ticketId/communications
 * @description Retrieve all communications for specific ticket
 * @access Admin
 * @permissions ticket.communications.read, admin.tickets
 */
router.get('/:ticketId/communications',
  authorize(['ticket.communications.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketCommunications
);

/**
 * @route POST /api/admin/tickets/:ticketId/communications
 * @description Add communication entry to ticket
 * @access Admin
 * @permissions ticket.communications.add, admin.tickets
 */
router.post('/:ticketId/communications',
  authorize(['ticket.communications.add', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.addTicketCommunication
);

/**
 * @route POST /api/admin/tickets/:ticketId/internal-note
 * @description Add internal note visible only to support staff
 * @access Admin
 * @permissions ticket.notes.internal, admin.tickets
 */
router.post('/:ticketId/internal-note',
  authorize(['ticket.notes.internal', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 150 }),
  ticketManagementController.addInternalNote
);

/**
 * @route POST /api/admin/tickets/:ticketId/customer-update
 * @description Send update to customer with notification
 * @access Admin
 * @permissions ticket.customer.update, admin.tickets
 */
router.post('/:ticketId/customer-update',
  authorize(['ticket.customer.update', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.sendCustomerUpdate
);

/**
 * @route POST /api/admin/tickets/:ticketId/follow-up
 * @description Schedule follow-up for ticket
 * @access Admin
 * @permissions ticket.followup.schedule, admin.tickets
 */
router.post('/:ticketId/follow-up',
  authorize(['ticket.followup.schedule', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.scheduleFollowUp
);

// ==================== Ticket Attachment and Media Routes ====================

/**
 * @route GET /api/admin/tickets/:ticketId/attachments
 * @description Retrieve all attachments for specific ticket
 * @access Admin
 * @permissions ticket.attachments.read, admin.tickets
 */
router.get('/:ticketId/attachments',
  authorize(['ticket.attachments.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketAttachments
);

/**
 * @route POST /api/admin/tickets/:ticketId/attachments
 * @description Upload attachments to ticket
 * @access Admin
 * @permissions ticket.attachments.upload, admin.tickets
 */
router.post('/:ticketId/attachments',
  authorize(['ticket.attachments.upload', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.uploadTicketAttachment
);

/**
 * @route DELETE /api/admin/tickets/:ticketId/attachments/:attachmentId
 * @description Remove attachment from ticket
 * @access Admin
 * @permissions ticket.attachments.delete, admin.tickets
 */
router.delete('/:ticketId/attachments/:attachmentId',
  authorize(['ticket.attachments.delete', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.removeTicketAttachment
);

/**
 * @route GET /api/admin/tickets/:ticketId/attachments/:attachmentId/download
 * @description Download specific ticket attachment
 * @access Admin
 * @permissions ticket.attachments.download, admin.tickets
 */
router.get('/:ticketId/attachments/:attachmentId/download',
  authorize(['ticket.attachments.download', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 100 }),
  ticketManagementController.downloadTicketAttachment
);

// ==================== Ticket Analytics and Reporting Routes ====================

/**
 * @route GET /api/admin/tickets/analytics/summary
 * @description Get comprehensive ticket analytics summary
 * @access Admin
 * @permissions ticket.analytics.read, admin.analytics
 */
router.get('/analytics/summary',
  authorize(['ticket.analytics.read', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  ticketManagementController.getTicketAnalyticsSummary
);

/**
 * @route GET /api/admin/tickets/analytics/trends
 * @description Analyze ticket trends and patterns
 * @access Admin
 * @permissions ticket.analytics.trends, admin.analytics
 */
router.get('/analytics/trends',
  authorize(['ticket.analytics.trends', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  ticketManagementController.getTicketTrends
);

/**
 * @route GET /api/admin/tickets/analytics/performance
 * @description Get ticket handling performance metrics
 * @access Admin
 * @permissions ticket.analytics.performance, admin.analytics
 */
router.get('/analytics/performance',
  authorize(['ticket.analytics.performance', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  ticketManagementController.getTicketPerformanceMetrics
);

/**
 * @route GET /api/admin/tickets/analytics/resolution-times
 * @description Analyze ticket resolution time statistics
 * @access Admin
 * @permissions ticket.analytics.resolution, admin.analytics
 */
router.get('/analytics/resolution-times',
  authorize(['ticket.analytics.resolution', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  ticketManagementController.getResolutionTimeAnalytics
);

/**
 * @route GET /api/admin/tickets/analytics/category-distribution
 * @description Analyze ticket distribution across categories
 * @access Admin
 * @permissions ticket.analytics.distribution, admin.analytics
 */
router.get('/analytics/category-distribution',
  authorize(['ticket.analytics.distribution', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  ticketManagementController.getCategoryDistributionAnalytics
);

/**
 * @route GET /api/admin/tickets/analytics/agent-workload
 * @description Analyze agent workload distribution
 * @access Admin
 * @permissions ticket.analytics.workload, admin.analytics
 */
router.get('/analytics/agent-workload',
  authorize(['ticket.analytics.workload', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  ticketManagementController.getAgentWorkloadAnalytics
);

/**
 * @route POST /api/admin/tickets/analytics/custom-report
 * @description Generate custom ticket analytics report
 * @access Admin
 * @permissions ticket.analytics.custom, admin.analytics
 */
router.post('/analytics/custom-report',
  authorize(['ticket.analytics.custom', 'admin.analytics']),
  rateLimit({ windowMs: 300000, max: 20 }),
  ticketManagementController.generateCustomTicketReport
);

// ==================== Ticket Workflow and Automation Routes ====================

/**
 * @route GET /api/admin/tickets/:ticketId/workflow
 * @description Get ticket workflow status and next actions
 * @access Admin
 * @permissions ticket.workflow.read, admin.tickets
 */
router.get('/:ticketId/workflow',
  authorize(['ticket.workflow.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketWorkflow
);

/**
 * @route POST /api/admin/tickets/:ticketId/workflow/advance
 * @description Advance ticket through workflow steps
 * @access Admin
 * @permissions ticket.workflow.advance, admin.tickets
 */
router.post('/:ticketId/workflow/advance',
  authorize(['ticket.workflow.advance', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.advanceTicketWorkflow
);

/**
 * @route POST /api/admin/tickets/:ticketId/automation/trigger
 * @description Manually trigger automation rules for ticket
 * @access Admin
 * @permissions ticket.automation.trigger, admin.tickets
 */
router.post('/:ticketId/automation/trigger',
  authorize(['ticket.automation.trigger', 'admin.tickets']),
  rateLimit({ windowMs: 300000, max: 80 }),
  ticketManagementController.triggerTicketAutomation
);

/**
 * @route GET /api/admin/tickets/automation/pending
 * @description Get tickets with pending automation actions
 * @access Admin
 * @permissions ticket.automation.read, admin.tickets
 */
router.get('/automation/pending',
  authorize(['ticket.automation.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 100 }),
  ticketManagementController.getPendingAutomationTickets
);

// ==================== Ticket Search and Filter Routes ====================

/**
 * @route GET /api/admin/tickets/search
 * @description Advanced ticket search with multiple criteria
 * @access Admin
 * @permissions ticket.search, admin.tickets
 */
router.get('/search',
  authorize(['ticket.search', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.searchTickets
);

/**
 * @route POST /api/admin/tickets/search/advanced
 * @description Advanced ticket search with complex criteria
 * @access Admin
 * @permissions ticket.search.advanced, admin.tickets
 */
router.post('/search/advanced',
  authorize(['ticket.search.advanced', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 100 }),
  ticketManagementController.advancedTicketSearch
);

/**
 * @route GET /api/admin/tickets/filter/unassigned
 * @description Get all unassigned tickets
 * @access Admin
 * @permissions ticket.filter.unassigned, admin.tickets
 */
router.get('/filter/unassigned',
  authorize(['ticket.filter.unassigned', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getUnassignedTickets
);

/**
 * @route GET /api/admin/tickets/filter/overdue
 * @description Get overdue tickets requiring attention
 * @access Admin
 * @permissions ticket.filter.overdue, admin.tickets
 */
router.get('/filter/overdue',
  authorize(['ticket.filter.overdue', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getOverdueTickets
);

/**
 * @route GET /api/admin/tickets/filter/escalated
 * @description Get escalated tickets
 * @access Admin
 * @permissions ticket.filter.escalated, admin.tickets
 */
router.get('/filter/escalated',
  authorize(['ticket.filter.escalated', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getEscalatedTickets
);

/**
 * @route GET /api/admin/tickets/filter/agent/:agentId
 * @description Get tickets assigned to specific agent
 * @access Admin
 * @permissions ticket.filter.agent, admin.tickets
 */
router.get('/filter/agent/:agentId',
  authorize(['ticket.filter.agent', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketsByAgent
);

/**
 * @route GET /api/admin/tickets/filter/team/:teamId
 * @description Get tickets assigned to specific team
 * @access Admin
 * @permissions ticket.filter.team, admin.tickets
 */
router.get('/filter/team/:teamId',
  authorize(['ticket.filter.team', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketsByTeam
);

// ==================== Ticket Bulk Operations Routes ====================

/**
 * @route POST /api/admin/tickets/bulk/assign
 * @description Bulk assign multiple tickets to agent or team
 * @access Admin
 * @permissions ticket.bulk.assign, admin.tickets
 */
router.post('/bulk/assign',
  authorize(['ticket.bulk.assign', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 20 }),
  ticketManagementController.bulkAssignTickets
);

/**
 * @route POST /api/admin/tickets/bulk/update-status
 * @description Bulk update status for multiple tickets
 * @access Admin
 * @permissions ticket.bulk.status, admin.tickets
 */
router.post('/bulk/update-status',
  authorize(['ticket.bulk.status', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 20 }),
  ticketManagementController.bulkUpdateTicketStatus
);

/**
 * @route POST /api/admin/tickets/bulk/update-priority
 * @description Bulk update priority for multiple tickets
 * @access Admin
 * @permissions ticket.bulk.priority, admin.tickets
 */
router.post('/bulk/update-priority',
  authorize(['ticket.bulk.priority', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 20 }),
  ticketManagementController.bulkUpdateTicketPriority
);

/**
 * @route POST /api/admin/tickets/bulk/update-category
 * @description Bulk update category for multiple tickets
 * @access Admin
 * @permissions ticket.bulk.category, admin.tickets
 */
router.post('/bulk/update-category',
  authorize(['ticket.bulk.category', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 20 }),
  ticketManagementController.bulkUpdateTicketCategory
);

/**
 * @route POST /api/admin/tickets/bulk/add-tags
 * @description Bulk add tags to multiple tickets
 * @access Admin
 * @permissions ticket.bulk.tags, admin.tickets
 */
router.post('/bulk/add-tags',
  authorize(['ticket.bulk.tags', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 25 }),
  ticketManagementController.bulkAddTicketTags
);

/**
 * @route POST /api/admin/tickets/bulk/remove-tags
 * @description Bulk remove tags from multiple tickets
 * @access Admin
 * @permissions ticket.bulk.tags, admin.tickets
 */
router.post('/bulk/remove-tags',
  authorize(['ticket.bulk.tags', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 25 }),
  ticketManagementController.bulkRemoveTicketTags
);

/**
 * @route POST /api/admin/tickets/bulk/close
 * @description Bulk close multiple tickets with resolution
 * @access Admin
 * @permissions ticket.bulk.close, admin.tickets
 */
router.post('/bulk/close',
  authorize(['ticket.bulk.close', 'admin.tickets']),
  rateLimit({ windowMs: 600000, max: 15 }),
  ticketManagementController.bulkCloseTickets
);

/**
 * @route POST /api/admin/tickets/bulk/export
 * @description Bulk export ticket data
 * @access Admin
 * @permissions ticket.bulk.export, admin.export
 */
router.post('/bulk/export',
  authorize(['ticket.bulk.export', 'admin.export']),
  rateLimit({ windowMs: 600000, max: 10 }),
  ticketManagementController.bulkExportTickets
);

// ==================== Ticket History and Audit Routes ====================

/**
 * @route GET /api/admin/tickets/:ticketId/history
 * @description Get complete ticket history and audit trail
 * @access Admin
 * @permissions ticket.history.read, admin.tickets
 */
router.get('/:ticketId/history',
  authorize(['ticket.history.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketHistory
);

/**
 * @route GET /api/admin/tickets/:ticketId/timeline
 * @description Get ticket timeline with all events
 * @access Admin
 * @permissions ticket.timeline.read, admin.tickets
 */
router.get('/:ticketId/timeline',
  authorize(['ticket.timeline.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketTimeline
);

/**
 * @route GET /api/admin/tickets/:ticketId/audit-log
 * @description Get detailed audit log for ticket
 * @access Admin
 * @permissions ticket.audit.read, admin.audit
 */
router.get('/:ticketId/audit-log',
  authorize(['ticket.audit.read', 'admin.audit']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getTicketAuditLog
);

/**
 * @route GET /api/admin/tickets/:ticketId/changes
 * @description Get all changes made to ticket
 * @access Admin
 * @permissions ticket.changes.read, admin.tickets
 */
router.get('/:ticketId/changes',
  authorize(['ticket.changes.read', 'admin.tickets']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketChanges
);

// ==================== Ticket SLA and Performance Routes ====================

/**
 * @route GET /api/admin/tickets/:ticketId/sla
 * @description Get SLA status and metrics for ticket
 * @access Admin
 * @permissions ticket.sla.read, admin.sla
 */
router.get('/:ticketId/sla',
  authorize(['ticket.sla.read', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketSLA
);

/**
 * @route PUT /api/admin/tickets/:ticketId/sla
 * @description Update SLA settings for ticket
 * @access Admin
 * @permissions ticket.sla.update, admin.sla
 */
router.put('/:ticketId/sla',
  authorize(['ticket.sla.update', 'admin.sla']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.updateTicketSLA
);

/**
 * @route GET /api/admin/tickets/sla/violations
 * @description Get tickets with SLA violations
 * @access Admin
 * @permissions ticket.sla.violations, admin.sla
 */
router.get('/sla/violations',
  authorize(['ticket.sla.violations', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 100 }),
  ticketManagementController.getSLAViolations
);

/**
 * @route GET /api/admin/tickets/sla/at-risk
 * @description Get tickets at risk of SLA violation
 * @access Admin
 * @permissions ticket.sla.risk, admin.sla
 */
router.get('/sla/at-risk',
  authorize(['ticket.sla.risk', 'admin.sla']),
  rateLimit({ windowMs: 60000, max: 150 }),
  ticketManagementController.getTicketsAtSLARisk
);

// ==================== Ticket Integration Routes ====================

/**
 * @route POST /api/admin/tickets/:ticketId/sync-external
 * @description Synchronize ticket with external systems
 * @access Admin
 * @permissions ticket.integration.sync, admin.integrations
 */
router.post('/:ticketId/sync-external',
  authorize(['ticket.integration.sync', 'admin.integrations']),
  rateLimit({ windowMs: 300000, max: 50 }),
  ticketManagementController.syncTicketWithExternal
);

/**
 * @route GET /api/admin/tickets/:ticketId/external-links
 * @description Get external system links for ticket
 * @access Admin
 * @permissions ticket.integration.read, admin.integrations
 */
router.get('/:ticketId/external-links',
  authorize(['ticket.integration.read', 'admin.integrations']),
  rateLimit({ windowMs: 60000, max: 200 }),
  ticketManagementController.getTicketExternalLinks
);

/**
 * @route POST /api/admin/tickets/:ticketId/webhook
 * @description Trigger webhook for ticket event
 * @access Admin
 * @permissions ticket.webhook.trigger, admin.webhooks
 */
router.post('/:ticketId/webhook',
  authorize(['ticket.webhook.trigger', 'admin.webhooks']),
  rateLimit({ windowMs: 300000, max: 100 }),
  ticketManagementController.triggerTicketWebhook
);

// ==================== Error Handling Middleware ====================

/**
 * @description Handle route-specific errors
 */
router.use((error, req, res, next) => {
  logger.error('Ticket management route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip,
    ticketId: req.params.ticketId
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error in ticket management';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: error.code || 'TICKET_MANAGEMENT_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      ticketId: req.params.ticketId,
      requestId: req.headers['x-request-id']
    }
  });
});

/**
 * @description Handle 404 errors for undefined routes
 */
router.use('*', (req, res) => {
  logger.warn('Ticket management route not found:', {
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Ticket management endpoint not found',
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    }
  });
});

logger.info('Ticket management routes initialized successfully');

module.exports = router;