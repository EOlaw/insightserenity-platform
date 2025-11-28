/**
 * @fileoverview Authentication Routes (Production-Ready)
 * @module servers/customer-services/modules/core-business/authentication/routes/auth-routes
 * @description Routes with database-backed token blacklist checking
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton)
const AuthController = require('../controllers/auth-controller');

// Import production-ready authentication middleware
const {
    authenticate,
    optionalAuthenticate,
    requireRole,
    requireEmailVerification,
    rateLimitByUser
} = require('../../../../middleware/auth-middleware');

/**
 * Authentication routes
 * Base path: /api/v1/auth
 * 
 * All routes implement production-ready token blacklist checking
 * to ensure logged-out tokens cannot be reused, even across
 * multiple server instances.
 */

// ========== PUBLIC ROUTES ========== 
// These routes do not require authentication

/**
 * POST /api/v1/auth/register
 * Register a new user account
 * 
 * Request body:
 * - email: User's email address (required)
 * - password: User's password (required)
 * - profile: User profile information (required)
 * - userType: Type of user (client, consultant, candidate, partner)
 */
router.post('/register', AuthController.registerUser.bind(AuthController));

/**
 * POST /api/v1/auth/login
 * Authenticate user and receive tokens
 * 
 * Request body:
 * - email: User's email address (required)
 * - password: User's password (required)
 * 
 * Response includes:
 * - accessToken: Short-lived JWT for API access
 * - refreshToken: Long-lived token for obtaining new access tokens
 */
router.post('/login', AuthController.loginUser.bind(AuthController));

/**
 * POST /api/v1/auth/verify-email
 * Verify email address with token from email
 * 
 * Request body:
 * - token: Verification token from email
 * - email: User's email address
 */
router.post('/verify-email', AuthController.verifyEmail.bind(AuthController));

/**
 * POST /api/v1/auth/resend-verification
 * Resend email verification link
 * 
 * Request body:
 * - email: User's email address
 */
router.post('/resend-verification', AuthController.resendVerification.bind(AuthController));

/**
 * GET /api/v1/auth/verification-status
 * Check if a user's email has been verified
 * 
 * Query parameters:
 * - email: User's email address (required)
 */
router.get('/verification-status', AuthController.checkVerificationStatus.bind(AuthController));

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset link
 * 
 * Request body:
 * - email: User's email address
 */
router.post('/forgot-password', AuthController.forgotPassword.bind(AuthController));

/**
 * POST /api/v1/auth/reset-password
 * Reset password with token from email
 * 
 * Request body:
 * - token: Reset token from email
 * - newPassword: New password
 * - confirmPassword: Password confirmation
 */
router.post('/reset-password', AuthController.resetPassword.bind(AuthController));

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 * 
 * Implements token rotation: old refresh token is blacklisted
 * and a new one is issued for enhanced security.
 * 
 * Request body or cookie:
 * - refreshToken: Valid refresh token
 */
router.post('/refresh', AuthController.refreshToken.bind(AuthController));


// ========== PROTECTED ROUTES ========== 
// These routes require authentication with JWT token
// Format: Authorization: Bearer <access_token>

/**
 * GET /api/v1/auth/me
 * Get current authenticated user's information
 * 
 * Headers required:
 * - Authorization: Bearer <access_token>
 * 
 * This endpoint checks both JWT validity AND token blacklist
 * to ensure the token has not been logged out.
 */
router.get(
    '/me',
    authenticate,
    AuthController.getCurrentUser.bind(AuthController)
);

/**
 * POST /api/v1/auth/logout
 * Logout current user and invalidate tokens
 * 
 * Headers required:
 * - Authorization: Bearer <access_token>
 * 
 * Both access and refresh tokens are added to the database blacklist,
 * making them unusable even if still within their expiration period.
 * 
 * This works across multiple server instances by using MongoDB
 * as the single source of truth for token invalidation.
 */
router.post(
    '/logout',
    authenticate,
    AuthController.logoutUser.bind(AuthController)
);

/**
 * POST /api/v1/auth/logout-all
 * Logout from all devices/sessions
 * 
 * Headers required:
 * - Authorization: Bearer <access_token>
 * 
 * Invalidates all tokens for the user across all devices.
 * Useful when account is compromised or user wants to
 * force logout everywhere.
 */
router.post(
    '/logout-all',
    authenticate,
    AuthController.logoutAllDevices.bind(AuthController)
);


// ========== ADMIN ROUTES (EXAMPLE) ========== 
// These routes require both authentication and admin role

/**
 * Example: Admin-only endpoint with role check
 * Uncomment to use in production
 */
// router.get(
//     '/admin/users',
//     authenticate,
//     requireRole(['admin', 'superadmin']),
//     AdminController.listUsers.bind(AdminController)
// );


// ========== OPTIONAL AUTHENTICATION ROUTES (EXAMPLE) ========== 
// These routes work with or without authentication

/**
 * Example: Public content that shows different data for logged-in users
 * Uncomment to use in production
 */
// router.get(
//     '/public/content',
//     optionalAuthenticate,
//     ContentController.getPublicContent.bind(ContentController)
// );


module.exports = router;