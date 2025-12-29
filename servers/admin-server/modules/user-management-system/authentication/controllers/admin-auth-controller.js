/**
 * @fileoverview Admin Authentication Controller
 * @module servers/admin-server/controllers/auth/admin-auth-controller
 * @description Class-based controller handling all authentication endpoints including
 *              login, logout, MFA verification, and password management.
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AuthenticationService = require('../services/authentication-service');
const MFAService = require('../services/mfa-service');
const SessionService = require('../../sessions/services/session-service');

const logger = getLogger({ serviceName: 'admin-auth-controller' });

/**
 * Admin Authentication Controller Class
 * @class AdminAuthController
 * @description Handles HTTP requests for authentication operations
 */
class AdminAuthController {
  /**
   * Login endpoint
   * @route POST /api/admin/auth/login
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        throw new AppError('Email and password are required', 400, 'MISSING_CREDENTIALS');
      }

      // Get client info
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Attempt login
      const result = await AuthenticationService.login({
        email,
        password,
        ipAddress,
        userAgent,
        location: req.geoLocation // Set by geo-location middleware (if any)
      });

      // If MFA is required, return temp token
      if (result.requiresMFA) {
        return res.status(200).json({
          success: true,
          requiresMFA: true,
          tempToken: result.tempToken,
          message: result.message
        });
      }

      // Set refresh token in HTTP-only cookie
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Return user data and access token
      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          session: result.session,
          accessToken: result.tokens.accessToken,
          tokenType: result.tokens.tokenType,
          expiresIn: result.tokens.expiresIn
        }
      });
    } catch (error) {
      logger.error('Login controller error', {
        error: error.message,
        email: req.body.email
      });
      next(error);
    }
  }

  /**
   * Verify MFA and complete login
   * @route POST /api/admin/auth/mfa/verify
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async verifyMFA(req, res, next) {
    try {
      const { tempToken, mfaCode } = req.body;

      // Validate input
      if (!tempToken || !mfaCode) {
        throw new AppError('Temp token and MFA code are required', 400, 'MISSING_MFA_DATA');
      }

      // Get client info
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Verify MFA and complete login
      const result = await AuthenticationService.verifyMFAAndLogin({
        tempToken,
        mfaCode,
        ipAddress,
        userAgent,
        location: req.geoLocation
      });

      // Set refresh token in HTTP-only cookie
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      // Return user data and access token
      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          session: result.session,
          accessToken: result.tokens.accessToken,
          tokenType: result.tokens.tokenType,
          expiresIn: result.tokens.expiresIn
        }
      });
    } catch (error) {
      logger.error('MFA verification controller error', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * Logout endpoint
   * @route POST /api/admin/auth/logout
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async logout(req, res, next) {
    try {
      const { user, session } = req; // Set by auth middleware

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Logout
      await AuthenticationService.logout(
        session.sessionId,
        user.id,
        ipAddress,
        userAgent
      );

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Logout from all devices
   * @route POST /api/admin/auth/logout-all
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async logoutAllDevices(req, res, next) {
    try {
      const { user, session } = req;

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Logout from all devices except current
      const count = await AuthenticationService.logoutAllDevices(
        user.id,
        session.sessionId,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: `Logged out from ${count} devices`,
        data: { devicesLoggedOut: count }
      });
    } catch (error) {
      logger.error('Logout all devices controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Refresh access token
   * @route POST /api/admin/auth/refresh
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async refreshToken(req, res, next) {
    try {
      // Get refresh token from cookie or body
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        throw new AppError('Refresh token required', 401, 'NO_REFRESH_TOKEN');
      }

      // Refresh access token
      const result = await SessionService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          tokenType: result.tokenType,
          expiresIn: result.expiresIn
        }
      });
    } catch (error) {
      logger.error('Token refresh controller error', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * Request password reset
   * @route POST /api/admin/auth/password/reset-request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async requestPasswordReset(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new AppError('Email is required', 400, 'MISSING_EMAIL');
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Request password reset
      const resetToken = await AuthenticationService.requestPasswordReset(
        email,
        ipAddress,
        userAgent
      );

      // In production, send email with reset link
      // For now, return token (DO NOT DO THIS IN PRODUCTION)
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({
          success: true,
          message: 'Password reset email sent',
          resetToken // Only for development
        });
      }

      res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    } catch (error) {
      logger.error('Password reset request controller error', {
        error: error.message,
        email: req.body.email
      });
      next(error);
    }
  }

  /**
   * Reset password with token
   * @route POST /api/admin/auth/password/reset
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async resetPassword(req, res, next) {
    try {
      const { resetToken, newPassword } = req.body;

      if (!resetToken || !newPassword) {
        throw new AppError('Reset token and new password are required', 400, 'MISSING_RESET_DATA');
      }

      // Validate password strength
      if (newPassword.length < 12) {
        throw new AppError('Password must be at least 12 characters', 400, 'WEAK_PASSWORD');
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Reset password
      await AuthenticationService.resetPassword(
        resetToken,
        newPassword,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.'
      });
    } catch (error) {
      logger.error('Password reset controller error', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * Change password (authenticated)
   * @route POST /api/admin/auth/password/change
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const { user } = req;

      if (!currentPassword || !newPassword) {
        throw new AppError('Current and new passwords are required', 400, 'MISSING_PASSWORD_DATA');
      }

      // Validate password strength
      if (newPassword.length < 12) {
        throw new AppError('Password must be at least 12 characters', 400, 'WEAK_PASSWORD');
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      // Change password
      await AuthenticationService.changePassword(
        user.id,
        currentPassword,
        newPassword,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. You have been logged out from all devices.'
      });
    } catch (error) {
      logger.error('Password change controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Get current user info
   * @route GET /api/admin/auth/me
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getCurrentUser(req, res, next) {
    try {
      const { user, session } = req;

      res.status(200).json({
        success: true,
        data: {
          user,
          session: {
            id: session._id,
            sessionId: session.sessionId,
            expiresAt: session.expiresAt,
            lastActivity: session.lastActivity,
            isMfaVerified: session.isMfaVerified,
            deviceInfo: session.deviceInfo
          }
        }
      });
    } catch (error) {
      logger.error('Get current user controller error', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * Get active sessions
   * @route GET /api/admin/auth/sessions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getActiveSessions(req, res, next) {
    try {
      const { user } = req;

      const sessions = await SessionService.getUserActiveSessions(user.id);

      res.status(200).json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        }
      });
    } catch (error) {
      logger.error('Get active sessions controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Revoke specific session
   * @route DELETE /api/admin/auth/sessions/:sessionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async revokeSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const { user } = req;

      await SessionService.revokeSession(sessionId, 'user_revoked', user.id);

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      logger.error('Revoke session controller error', {
        error: error.message,
        sessionId: req.params.sessionId
      });
      next(error);
    }
  }

  /**
   * Setup TOTP MFA
   * @route POST /api/admin/auth/mfa/totp/setup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async setupTOTP(req, res, next) {
    try {
      const { user } = req;

      const result = await MFAService.setupTOTP(user.id, user.email);

      res.status(200).json({
        success: true,
        message: 'TOTP MFA setup initiated. Scan the QR code and verify.',
        data: {
          qrCode: result.qrCode,
          secret: result.secret,
          backupCodes: result.backupCodes
        }
      });
    } catch (error) {
      logger.error('TOTP setup controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Verify TOTP and enable MFA
   * @route POST /api/admin/auth/mfa/totp/verify-enable
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async verifyAndEnableTOTP(req, res, next) {
    try {
      const { totpCode } = req.body;
      const { user } = req;

      if (!totpCode) {
        throw new AppError('TOTP code is required', 400, 'MISSING_TOTP_CODE');
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      await MFAService.verifyAndEnableTOTP(
        user.id,
        totpCode,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: 'TOTP MFA enabled successfully'
      });
    } catch (error) {
      logger.error('TOTP enable controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Disable MFA
   * @route POST /api/admin/auth/mfa/disable
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async disableMFA(req, res, next) {
    try {
      const { user } = req;

      await MFAService.disableMFA(user.id);

      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully'
      });
    } catch (error) {
      logger.error('MFA disable controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Regenerate backup codes
   * @route POST /api/admin/auth/mfa/backup-codes/regenerate
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async regenerateBackupCodes(req, res, next) {
    try {
      const { user } = req;

      const backupCodes = await MFAService.regenerateBackupCodes(user.id);

      res.status(200).json({
        success: true,
        message: 'Backup codes regenerated. Please save them securely.',
        data: { backupCodes }
      });
    } catch (error) {
      logger.error('Backup codes regeneration controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Get MFA status
   * @route GET /api/admin/auth/mfa/status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getMFAStatus(req, res, next) {
    try {
      const { user } = req;

      const status = await MFAService.getMFAStatus(user.id);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Get MFA status controller error', {
        error: error.message,
        user: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = AdminAuthController;
