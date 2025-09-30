/**
 * @fileoverview Password Management Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/password-routes
 * @description Handles password-related routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const PasswordController = require('../controllers/password-controller');

// Import middleware
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { rateLimit } = require('../middlewares/rate-limit');

// Import validators
const {
    validatePasswordReset,
    validatePasswordChange,
    validatePasswordValidation
} = require('../validators/password-validators');

/**
 * @route   POST /api/auth/password/forgot
 * @desc    Request password reset
 * @access  Public
 */
router.post(
    '/forgot',
    rateLimit.passwordReset,
    PasswordController.requestPasswordReset
);

/**
 * @route   POST /api/auth/password/reset
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
    '/reset',
    rateLimit.api,
    validatePasswordReset,
    PasswordController.resetPassword
);

/**
 * @route   POST /api/auth/password/change
 * @desc    Change password (authenticated)
 * @access  Protected
 */
router.post(
    '/change',
    authenticate(),
    validatePasswordChange,
    PasswordController.changePassword
);

/**
 * @route   POST /api/auth/password/validate
 * @desc    Validate password strength
 * @access  Public
 */
router.post(
    '/validate',
    rateLimit.api,
    validatePasswordValidation,
    PasswordController.validatePassword
);

/**
 * @route   GET /api/auth/password/requirements
 * @desc    Get password requirements
 * @access  Public
 */
router.get(
    '/requirements',
    PasswordController.getPasswordRequirements
);

/**
 * @route   POST /api/auth/password/expiry
 * @desc    Update password expiry settings (admin only)
 * @access  Protected (Admin)
 */
router.post(
    '/expiry',
    authenticate(),
    authorize('admin'),
    PasswordController.updatePasswordExpiry
);

/**
 * @route   POST /api/auth/password/force-reset/:userId
 * @desc    Force password reset for user (admin only)
 * @access  Protected (Admin)
 */
router.post(
    '/force-reset/:userId',
    authenticate(),
    authorize('admin'),
    PasswordController.forcePasswordReset
);

module.exports = router;