/**
 * @fileoverview Admin Authentication Routes
 * @module servers/admin-server/modules/user-management-system/authentication/routes
 * @description Class-based route definitions for admin authentication endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const { AdminAuthController } = require('../controllers');
const { authenticate } = require('../../../../middleware/auth-middleware');

/**
 * Authentication Routes Class
 * @class AuthRoutes
 * @description Manages all authentication-related routes
 */
class AuthRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all authentication routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    // ============================================================
    // PUBLIC ROUTES (No authentication required)
    // ============================================================

    /**
     * @route POST /api/admin/auth/login
     * @description Admin login with email and password
     * @access Public
     */
    this.#router.post('/login', AdminAuthController.login);

    /**
     * @route POST /api/admin/auth/mfa/verify
     * @description Verify MFA code and complete login
     * @access Public (requires temp token)
     */
    this.#router.post('/mfa/verify', AdminAuthController.verifyMFA);

    /**
     * @route POST /api/admin/auth/password/reset-request
     * @description Request password reset link
     * @access Public
     */
    this.#router.post('/password/reset-request', AdminAuthController.requestPasswordReset);

    /**
     * @route POST /api/admin/auth/password/reset
     * @description Reset password using reset token
     * @access Public (requires reset token)
     */
    this.#router.post('/password/reset', AdminAuthController.resetPassword);

    /**
     * @route POST /api/admin/auth/refresh
     * @description Refresh access token using refresh token
     * @access Public (requires refresh token)
     */
    this.#router.post('/refresh', AdminAuthController.refreshToken);

    // /**
    //  * @route POST /api/admin/auth/email/verify
    //  * @description Verify email address
    //  * @access Public (requires verification token)
    //  */
    // this.#router.post('/email/verify', AdminAuthController.verifyEmail);

    // ============================================================
    // PROTECTED ROUTES (Authentication required)
    // ============================================================

    /**
     * @route GET /api/admin/auth/me
     * @description Get current authenticated admin user info
     * @access Protected
     */
    this.#router.get('/me', authenticate, AdminAuthController.getCurrentUser);

    /**
     * @route POST /api/admin/auth/logout
     * @description Logout current session
     * @access Protected
     */
    this.#router.post('/logout', authenticate, AdminAuthController.logout);

    /**
     * @route POST /api/admin/auth/logout-all
     * @description Logout from all devices (revoke all sessions)
     * @access Protected
     */
    this.#router.post('/logout-all', authenticate, AdminAuthController.logoutAllDevices);

    /**
     * @route POST /api/admin/auth/password/change
     * @description Change password (requires current password)
     * @access Protected
     */
    this.#router.post('/password/change', authenticate, AdminAuthController.changePassword);

    /**
     * @route GET /api/admin/auth/sessions
     * @description Get all active sessions for current user
     * @access Protected
     */
    this.#router.get('/sessions', authenticate, AdminAuthController.getActiveSessions);

    /**
     * @route DELETE /api/admin/auth/sessions/:sessionId
     * @description Revoke a specific session
     * @access Protected
     */
    this.#router.delete('/sessions/:sessionId', authenticate, AdminAuthController.revokeSession);

    // ============================================================
    // MFA ROUTES (Protected)
    // ============================================================

    /**
     * @route GET /api/admin/auth/mfa/status
     * @description Get MFA configuration status
     * @access Protected
     */
    this.#router.get('/mfa/status', authenticate, AdminAuthController.getMFAStatus);

    /**
     * @route POST /api/admin/auth/mfa/totp/setup
     * @description Initiate TOTP MFA setup (get QR code)
     * @access Protected
     */
    this.#router.post('/mfa/totp/setup', authenticate, AdminAuthController.setupTOTP);

    /**
     * @route POST /api/admin/auth/mfa/totp/verify-enable
     * @description Verify TOTP code and enable MFA
     * @access Protected
     */
    this.#router.post('/mfa/totp/verify-enable', authenticate, AdminAuthController.verifyAndEnableTOTP);

    // /**
    //  * @route POST /api/admin/auth/mfa/sms/setup
    //  * @description Setup SMS MFA
    //  * @access Protected
    //  */
    // this.#router.post('/mfa/sms/setup', authenticate, AdminAuthController.setupSMS);

    // /**
    //  * @route POST /api/admin/auth/mfa/sms/verify-enable
    //  * @description Verify SMS code and enable SMS MFA
    //  * @access Protected
    //  */
    // this.#router.post('/mfa/sms/verify-enable', authenticate, AdminAuthController.verifyAndEnableSMS);

    // /**
    //  * @route POST /api/admin/auth/mfa/email/setup
    //  * @description Setup Email MFA
    //  * @access Protected
    //  */
    // this.#router.post('/mfa/email/setup', authenticate, AdminAuthController.setupEmailMFA);

    // /**
    //  * @route POST /api/admin/auth/mfa/email/verify-enable
    //  * @description Verify Email code and enable Email MFA
    //  * @access Protected
    //  */
    // this.#router.post('/mfa/email/verify-enable', authenticate, AdminAuthController.verifyAndEnableEmailMFA);

    /**
     * @route POST /api/admin/auth/mfa/disable
     * @description Disable MFA (requires password confirmation)
     * @access Protected
     */
    this.#router.post('/mfa/disable', authenticate, AdminAuthController.disableMFA);

    /**
     * @route POST /api/admin/auth/mfa/backup-codes/regenerate
     * @description Regenerate MFA backup codes
     * @access Protected
     */
    this.#router.post('/mfa/backup-codes/regenerate', authenticate, AdminAuthController.regenerateBackupCodes);

    // /**
    //  * @route GET /api/admin/auth/mfa/backup-codes
    //  * @description Get remaining backup codes count
    //  * @access Protected
    //  */
    // this.#router.get('/mfa/backup-codes', authenticate, AdminAuthController.getBackupCodesStatus);

    return this.#router;
  }

  /**
   * Get the configured router instance
   * @returns {express.Router} Express router
   * @static
   * @public
   */
  static getRouter() {
    return this.configure();
  }
}

module.exports = AuthRoutes;
