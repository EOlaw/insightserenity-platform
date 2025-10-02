/**
 * @fileoverview Session Management Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/session-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const SessionController = require('../controllers/session-controller');

/**
 * Session routes
 * Base path: /api/v1/auth/session
 */

// Public routes
router.post('/refresh', SessionController.refreshToken.bind(SessionController));

// Protected routes (require authentication middleware)
router.get('/', SessionController.getCurrentSession.bind(SessionController));
router.get('/all', SessionController.getAllSessions.bind(SessionController));
router.post('/logout', SessionController.logout.bind(SessionController));
router.delete('/:sessionId', SessionController.terminateSession.bind(SessionController));
router.post('/terminate-all', SessionController.terminateAllSessions.bind(SessionController));
router.get('/activity', SessionController.getSessionActivity.bind(SessionController));
router.post('/trust-device', SessionController.trustDevice.bind(SessionController));
router.delete('/trust-device/:deviceId', SessionController.removeTrustedDevice.bind(SessionController));
router.get('/trusted-devices', SessionController.getTrustedDevices.bind(SessionController));

module.exports = router;