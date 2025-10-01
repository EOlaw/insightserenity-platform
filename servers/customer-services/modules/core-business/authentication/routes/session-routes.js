/**
 * @fileoverview Session Management Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/session-routes
 * @description Handles session management routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const SessionController = require('../controllers/session-controller');

// Import middleware
const { authenticate } = require('../../../../../../shared/lib/auth/middleware/authenticate');
const rateLimit = require('../../../../../../shared/lib/auth/middleware/rate-limit');

/**
 * @route   GET /api/auth/sessions
 * @desc    List active sessions
 * @access  Protected
 */
router.get(
    '/',
    authenticate(),
    SessionController.listActiveSessions
);

/**
 * @route   GET /api/auth/sessions/stats
 * @desc    Get session statistics
 * @access  Protected
 */
router.get(
    '/stats',
    authenticate(),
    SessionController.getSessionStatistics
);

/**
 * @route   GET /api/auth/sessions/:sessionId
 * @desc    Get specific session details
 * @access  Protected
 */
router.get(
    '/:sessionId',
    authenticate(),
    SessionController.getSessionDetails
);

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Terminate specific session
 * @access  Protected
 */
router.delete(
    '/:sessionId',
    authenticate(),
    SessionController.terminateSession
);

/**
 * @route   DELETE /api/auth/sessions
 * @desc    Terminate all sessions
 * @access  Protected
 */
router.delete(
    '/',
    authenticate(),
    SessionController.terminateAllSessions
);

/**
 * @route   POST /api/auth/sessions/refresh-activity
 * @desc    Refresh session activity
 * @access  Protected
 */
router.post(
    '/refresh-activity',
    authenticate(),
    rateLimit.api,
    SessionController.refreshSessionActivity
);

/**
 * @route   POST /api/auth/sessions/:sessionId/report
 * @desc    Report suspicious session
 * @access  Protected
 */
router.post(
    '/:sessionId/report',
    authenticate(),
    SessionController.reportSuspiciousSession
);

module.exports = router;