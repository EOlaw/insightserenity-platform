/**
 * @fileoverview Verification Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/verification-routes
 * @description Handles email and phone verification routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const VerificationController = require('../controllers/verification-controller');

// Import middleware
const { authenticate } = require('../middlewares/authenticate');
const { rateLimit } = require('../middlewares/rate-limit');

// Import validators
const {
    validateEmailVerification,
    validatePhoneVerification,
    validateDocumentVerification
} = require('../validators/verification-validators');

/**
 * @route   POST /api/auth/verify/email
 * @desc    Verify email with token
 * @access  Public
 */
router.post(
    '/email',
    rateLimit.api,
    validateEmailVerification,
    VerificationController.verifyEmail
);

/**
 * @route   POST /api/auth/verify/email/code
 * @desc    Verify email with code
 * @access  Public
 */
router.post(
    '/email/code',
    rateLimit.api,
    validateEmailVerification,
    VerificationController.verifyEmailWithCode
);

/**
 * @route   POST /api/auth/verify/email/resend
 * @desc    Resend email verification
 * @access  Public
 */
router.post(
    '/email/resend',
    rateLimit.emailVerification,
    VerificationController.resendEmailVerification
);

/**
 * @route   GET /api/auth/verify/email/status
 * @desc    Check email verification status
 * @access  Public
 */
router.get(
    '/email/status',
    rateLimit.api,
    VerificationController.checkEmailVerificationStatus
);

/**
 * @route   POST /api/auth/verify/phone/send
 * @desc    Send phone verification code
 * @access  Protected
 */
router.post(
    '/phone/send',
    authenticate(),
    rateLimit.api,
    validatePhoneVerification,
    VerificationController.sendPhoneVerificationCode
);

/**
 * @route   POST /api/auth/verify/phone
 * @desc    Verify phone with code
 * @access  Protected
 */
router.post(
    '/phone',
    authenticate(),
    rateLimit.api,
    validatePhoneVerification,
    VerificationController.verifyPhone
);

/**
 * @route   GET /api/auth/verify/phone/status
 * @desc    Check phone verification status
 * @access  Protected
 */
router.get(
    '/phone/status',
    authenticate(),
    rateLimit.api,
    VerificationController.checkPhoneVerificationStatus
);

/**
 * @route   POST /api/auth/verify/phone/resend
 * @desc    Resend phone verification code
 * @access  Protected
 */
router.post(
    '/phone/resend',
    authenticate(),
    rateLimit.api,
    VerificationController.resendPhoneVerificationCode
);

/**
 * @route   POST /api/auth/verify/document
 * @desc    Verify document (KYC)
 * @access  Protected
 */
router.post(
    '/document',
    authenticate(),
    validateDocumentVerification,
    VerificationController.verifyDocument
);

/**
 * @route   GET /api/auth/verify/status
 * @desc    Get verification status for all methods
 * @access  Protected
 */
router.get(
    '/status',
    authenticate(),
    VerificationController.getVerificationStatus
);

module.exports = router;