/**
 * @fileoverview Account Verification Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/verification-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const VerificationController = require('../controllers/verification-controller');

/**
 * Verification routes
 * Base path: /api/v1/auth/verify
 */

// Public routes
router.post('/email', VerificationController.verifyEmail.bind(VerificationController));
router.post('/email/resend', VerificationController.resendEmailVerification.bind(VerificationController));
router.get('/email/check/:email', VerificationController.checkEmailVerification.bind(VerificationController));

// Protected routes (require authentication middleware)
router.post('/phone/send', VerificationController.sendPhoneVerification.bind(VerificationController));
router.post('/phone', VerificationController.verifyPhone.bind(VerificationController));
router.get('/status', VerificationController.getVerificationStatus.bind(VerificationController));
router.post('/identity', VerificationController.requestIdentityVerification.bind(VerificationController));
router.post('/identity/upload', VerificationController.uploadIdentityDocument.bind(VerificationController));
router.post('/email/alternate', VerificationController.addAlternateEmail.bind(VerificationController));

module.exports = router;