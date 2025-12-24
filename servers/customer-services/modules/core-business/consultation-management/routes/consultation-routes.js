/**
 * @fileoverview Consultation Routes
 * @module servers/customer-services/modules/core-business/consultation-management/routes/consultation-routes
 * @description Express routes for consultation management operations
 */

const express = require('express');
const router = express.Router();
const consultationController = require('../controllers/consultation-controller');
const { authenticate, authorize } = require('../../../../middleware/auth-middleware');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// ============================================================================
// PUBLIC ROUTES (if any)
// ============================================================================
// None - all consultation routes require authentication

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Apply authentication middleware to all routes
router.use(authenticate);

// ============================================================================
// CONSULTATION CRUD OPERATIONS
// ============================================================================

/**
 * Create new consultation
 * POST /api/consultations
 * @access Private - Consultants, Admins
 */
router.post(
    '/',
    consultationController.constructor.createValidation(),
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }), // 50 requests per 15 minutes
    authorize(['consultant', 'admin', 'manager']),
    consultationController.createConsultation
);

/**
 * Get current user's consultations
 * GET /api/consultations/me
 * @access Private - Consultants
 */
router.get(
    '/me',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 100 }), // 100 requests per minute
    authorize(['consultant', 'admin']),
    consultationController.getMyConsultations
);

/**
 * Get upcoming consultations
 * GET /api/consultations/upcoming
 * @access Private - Consultants, Admins
 */
router.get(
    '/upcoming',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 100 }),
    authorize(['consultant', 'admin', 'manager']),
    consultationController.getUpcomingConsultations
);

/**
 * Get consultation metrics
 * GET /api/consultations/metrics
 * @access Private - Consultants, Admins, Managers
 */
router.get(
    '/metrics',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 60 }),
    authorize(['consultant', 'admin', 'manager']),
    consultationController.getConsultationMetrics
);

/**
 * Get consultation by ID
 * GET /api/consultations/:consultationId
 * @access Private - Consultants, Clients, Admins
 */
router.get(
    '/:consultationId',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 100 }),
    authorize(['consultant', 'client', 'admin', 'manager']),
    consultationController.getConsultationById
);

/**
 * Update consultation
 * PUT /api/consultations/:consultationId
 * @access Private - Consultants, Admins
 */
router.put(
    '/:consultationId',
    consultationController.constructor.updateValidation(),
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
    authorize(['consultant', 'admin', 'manager']),
    consultationController.updateConsultation
);

/**
 * Delete consultation
 * DELETE /api/consultations/:consultationId
 * @access Private - Consultants, Admins
 */
router.delete(
    '/:consultationId',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
    authorize(['consultant', 'admin']),
    consultationController.deleteConsultation
);

// ============================================================================
// CONSULTATION LIFECYCLE OPERATIONS
// ============================================================================

/**
 * Start consultation
 * POST /api/consultations/:consultationId/start
 * @access Private - Consultants
 */
router.post(
    '/:consultationId/start',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
    authorize(['consultant', 'admin']),
    consultationController.startConsultation
);

/**
 * Complete consultation
 * POST /api/consultations/:consultationId/complete
 * @access Private - Consultants
 */
router.post(
    '/:consultationId/complete',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
    authorize(['consultant', 'admin']),
    consultationController.completeConsultation
);

/**
 * Cancel consultation
 * POST /api/consultations/:consultationId/cancel
 * @access Private - Consultants, Clients, Admins
 */
router.post(
    '/:consultationId/cancel',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
    authorize(['consultant', 'client', 'admin']),
    consultationController.cancelConsultation
);

/**
 * Reschedule consultation
 * POST /api/consultations/:consultationId/reschedule
 * @access Private - Consultants, Clients, Admins
 */
router.post(
    '/:consultationId/reschedule',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
    authorize(['consultant', 'client', 'admin']),
    consultationController.rescheduleConsultation
);

// ============================================================================
// ACTION ITEMS
// ============================================================================

/**
 * Add action item to consultation
 * POST /api/consultations/:consultationId/action-items
 * @access Private - Consultants
 */
router.post(
    '/:consultationId/action-items',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
    authorize(['consultant', 'admin']),
    consultationController.addActionItem
);

/**
 * Update action item
 * PUT /api/consultations/:consultationId/action-items/:actionItemId
 * @access Private - Consultants, Action Item Assignee
 */
router.put(
    '/:consultationId/action-items/:actionItemId',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
    authorize(['consultant', 'admin', 'client']),
    consultationController.updateActionItem
);

// ============================================================================
// DELIVERABLES
// ============================================================================

/**
 * Add deliverable to consultation
 * POST /api/consultations/:consultationId/deliverables
 * @access Private - Consultants
 */
router.post(
    '/:consultationId/deliverables',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
    authorize(['consultant', 'admin']),
    consultationController.addDeliverable
);

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Submit client feedback
 * POST /api/consultations/:consultationId/feedback/client
 * @access Private - Clients
 */
router.post(
    '/:consultationId/feedback/client',
    consultationController.constructor.feedbackValidation(),
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
    authorize(['client', 'admin']),
    consultationController.submitClientFeedback
);

/**
 * Submit consultant feedback
 * POST /api/consultations/:consultationId/feedback/consultant
 * @access Private - Consultants
 */
router.post(
    '/:consultationId/feedback/consultant',
    rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
    authorize(['consultant', 'admin']),
    consultationController.submitConsultantFeedback
);

// ============================================================================
// QUERY ROUTES
// ============================================================================

/**
 * Get consultations by consultant
 * GET /api/consultations/consultant/:consultantId
 * @access Private - Consultants, Admins, Managers
 */
router.get(
    '/consultant/:consultantId',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 100 }),
    authorize(['consultant', 'admin', 'manager']),
    consultationController.getConsultationsByConsultant
);

/**
 * Get consultations by client
 * GET /api/consultations/client/:clientId
 * @access Private - Clients, Consultants, Admins
 */
router.get(
    '/client/:clientId',
    rateLimiter({ windowMs: 1 * 60 * 1000, max: 100 }),
    authorize(['client', 'consultant', 'admin', 'manager']),
    consultationController.getConsultationsByClient
);

module.exports = router;
