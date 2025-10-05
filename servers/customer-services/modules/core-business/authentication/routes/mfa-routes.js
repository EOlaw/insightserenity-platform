/**
 * @fileoverview Multi-Factor Authentication Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/mfa-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const MFAController = require('../controllers/mfa-controller');

/**
 * MFA routes
 * Base path: /api/v1/auth/mfa
 */

// Public routes
router.post('/verify', MFAController.verifyMFA.bind(MFAController));

// Protected routes (require authentication middleware)
router.post('/setup', MFAController.setupMFA.bind(MFAController));
router.post('/verify-setup', MFAController.verifyMFASetup.bind(MFAController));
router.post('/disable', MFAController.disableMFA.bind(MFAController));
router.get('/status', MFAController.getMFAStatus.bind(MFAController));
router.post('/backup-codes', MFAController.generateBackupCodes.bind(MFAController));

module.exports = router;