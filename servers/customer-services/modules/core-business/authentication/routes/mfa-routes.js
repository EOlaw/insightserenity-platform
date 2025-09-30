/**
 * @fileoverview MFA Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/mfa-routes
 * @description Handles multi-factor authentication routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const MfaController = require('../controllers/mfa-controller');

// Import middleware
const { authenticate } = require('../middlewares/authenticate');
const { rateLimit } = require('../middlewares/rate-limit');

// Import validators
const {
    validateMfaSetup,
    validateMfaVerification,
    validateMfaDisable
} = require('../validators/mfa-validators');

/**
 * @route   POST /api/auth/mfa/setup/totp
 * @desc    Setup TOTP/Authenticator MFA
 * @access  Protected
 */
router.post(
    '/setup/totp',
    authenticate(),
    validateMfaSetup,
    MfaController.setupTotpMfa
);

/**
 * @route   POST /api/auth/mfa/setup/sms
 * @desc    Setup SMS MFA
 * @access  Protected
 */
router.post(
    '/setup/sms',
    authenticate(),
    validateMfaSetup,
    MfaController.setupSmsMfa
);

/**
 * @route   POST /api/auth/mfa/setup/email
 * @desc    Setup Email MFA
 * @access  Protected
 */
router.post(
    '/setup/email',
    authenticate(),
    validateMfaSetup,
    MfaController.setupEmailMfa
);

/**
 * @route   POST /api/auth/mfa/verify
 * @desc    Verify MFA code during setup
 * @access  Protected
 */
router.post(
    '/verify',
    authenticate(),
    rateLimit.mfaVerification,
    validateMfaVerification,
    MfaController.verifyMfaSetup
);

/**
 * @route   POST /api/auth/mfa/challenge
 * @desc    Challenge MFA during login
 * @access  Public (with challenge ID)
 */
router.post(
    '/challenge',
    rateLimit.mfaVerification,
    validateMfaVerification,
    MfaController.challengeMfa
);

/**
 * @route   POST /api/auth/mfa/disable
 * @desc    Disable MFA method
 * @access  Protected
 */
router.post(
    '/disable',
    authenticate(),
    validateMfaDisable,
    MfaController.disableMfa
);

/**
 * @route   GET /api/auth/mfa/methods
 * @desc    Get enabled MFA methods
 * @access  Protected
 */
router.get(
    '/methods',
    authenticate(),
    MfaController.getMfaMethods
);

/**
 * @route   GET /api/auth/mfa/backup-codes
 * @desc    Get backup codes
 * @access  Protected
 */
router.get(
    '/backup-codes',
    authenticate(),
    MfaController.getBackupCodes
);

/**
 * @route   POST /api/auth/mfa/regenerate-codes
 * @desc    Regenerate backup codes
 * @access  Protected
 */
router.post(
    '/regenerate-codes',
    authenticate(),
    MfaController.regenerateBackupCodes
);

module.exports = router;