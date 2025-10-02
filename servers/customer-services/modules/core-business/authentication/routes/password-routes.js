/**
 * @fileoverview Password Management Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/password-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const PasswordController = require('../controllers/password-controller');

/**
 * Password routes
 * Base path: /api/v1/auth/password
 */

// Public routes
router.post('/forgot', PasswordController.forgotPassword.bind(PasswordController));
router.get('/reset/verify/:token', PasswordController.verifyResetToken.bind(PasswordController));
router.post('/reset', PasswordController.resetPassword.bind(PasswordController));
router.post('/validate', PasswordController.validatePassword.bind(PasswordController));
router.get('/policy', PasswordController.getPasswordPolicy.bind(PasswordController));

// Protected routes (require authentication middleware)
router.post('/change', PasswordController.changePassword.bind(PasswordController));
router.post('/set', PasswordController.setPassword.bind(PasswordController));

module.exports = router;