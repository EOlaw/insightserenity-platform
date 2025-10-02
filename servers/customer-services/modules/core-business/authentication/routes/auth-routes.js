/**
 * @fileoverview Authentication Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/auth-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const AuthController = require('../controllers/auth-controller');

/**
 * Authentication routes
 * Base path: /api/auth
 */

// Public routes
router.post('/register', AuthController.registerUser.bind(AuthController));
router.post('/login', AuthController.loginUser.bind(AuthController));
router.post('/logout', AuthController.logoutUser.bind(AuthController));
router.post('/verify-email', AuthController.verifyEmail.bind(AuthController));
router.post('/resend-verification', AuthController.resendVerification.bind(AuthController));
router.post('/forgot-password', AuthController.forgotPassword.bind(AuthController));
router.post('/reset-password', AuthController.resetPassword.bind(AuthController));
router.post('/refresh', AuthController.refreshToken.bind(AuthController));

// Protected routes (require authentication middleware)
router.get('/me', AuthController.getCurrentUser.bind(AuthController));
router.post('/change-password', AuthController.changePassword.bind(AuthController));

module.exports = router;