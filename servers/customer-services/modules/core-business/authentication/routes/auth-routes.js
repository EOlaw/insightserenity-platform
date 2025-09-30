/**
 * @fileoverview Main Authentication Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/auth-routes
 * @description Handles main authentication routes (register, login, logout, etc.)
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const AuthController = require('../controllers/auth-controller');

// Import middleware
const { authenticate } = require('../middlewares/authenticate');
const { validateTenant } = require('../middlewares/validate-tenant');
const { rateLimit } = require('../middlewares/rate-limit');

// Import validators
const {
    validateRegistration,
    validateLogin,
    validateRefreshToken
} = require('../validators/auth-validators');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new customer
 * @access  Public
 */
router.post(
    '/register',
    validateTenant,
    rateLimit.registration,
    validateRegistration,
    AuthController.registerUser
);

/**
 * @route   POST /api/auth/login
 * @desc    Login with credentials
 * @access  Public
 */
router.post(
    '/login',
    validateTenant,
    rateLimit.login,
    validateLogin,
    AuthController.loginUser
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout current session
 * @access  Protected
 */
router.post(
    '/logout',
    authenticate(),
    AuthController.logoutUser
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout all sessions
 * @access  Protected
 */
router.post(
    '/logout-all',
    authenticate(),
    AuthController.logoutAllSessions
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public (requires refresh token)
 */
router.post(
    '/refresh',
    rateLimit.api,
    validateRefreshToken,
    AuthController.refreshAccessToken
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user
 * @access  Protected
 */
router.get(
    '/me',
    authenticate(),
    AuthController.getCurrentUser
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post(
    '/verify-email',
    rateLimit.api,
    AuthController.verifyEmail
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification
 * @access  Public
 */
router.post(
    '/resend-verification',
    rateLimit.emailVerification,
    AuthController.resendEmailVerification
);

module.exports = router;