/**
 * @fileoverview Password Management Routes (Production-Ready)
 * @module servers/customer-services/modules/core-business/authentication/routes/password-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton)
const PasswordController = require('../controllers/password-controller');

// Import authentication middleware - THIS WAS MISSING
const { authenticate } = require('../../../../middleware/auth-middleware');

/**
 * Password routes
 * Base path: /api/v1/auth/password
 */

// ========== PUBLIC ROUTES ==========
// These routes do not require authentication

/**
 * POST /api/v1/auth/password/forgot
 * Request password reset link
 */
router.post('/forgot', PasswordController.forgotPassword.bind(PasswordController));

/**
 * GET /api/v1/auth/password/reset/verify/:token
 * Verify password reset token validity
 */
router.get('/reset/verify/:token', PasswordController.verifyResetToken.bind(PasswordController));

/**
 * POST /api/v1/auth/password/reset
 * Reset password with token
 */
router.post('/reset', PasswordController.resetPassword.bind(PasswordController));

/**
 * POST /api/v1/auth/password/validate
 * Validate password strength (public utility)
 */
router.post('/validate', PasswordController.validatePassword.bind(PasswordController));

/**
 * GET /api/v1/auth/password/policy
 * Get password policy requirements
 */
router.get('/policy', PasswordController.getPasswordPolicy.bind(PasswordController));


// ========== PROTECTED ROUTES ==========
// These routes require authentication

/**
 * POST /api/v1/auth/password/change
 * Change password for authenticated user
 * 
 * Headers required:
 * - Authorization: Bearer <access_token>
 * 
 * Request body:
 * - currentPassword: Current password for verification
 * - newPassword: New password
 * - confirmPassword: Password confirmation
 */
router.post(
    '/change',
    authenticate,  // Authentication middleware now properly applied
    PasswordController.changePassword.bind(PasswordController)
);

/**
 * POST /api/v1/auth/password/set
 * Set password for users without password (OAuth users)
 * 
 * Headers required:
 * - Authorization: Bearer <access_token>
 */
router.post(
    '/set',
    authenticate,  // Authentication middleware now properly applied
    PasswordController.setPassword.bind(PasswordController)
);

module.exports = router;