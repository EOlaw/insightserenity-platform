/**
 * @fileoverview Authentication Service - Main Authentication Logic
 * @module servers/admin-server/services/auth/authentication-service
 * @description Class-based service coordinating all authentication operations including
 *              login, logout, password management, and MFA verification.
 * @version 1.0.0
 * @requires bcryptjs
 */

'use strict';

const bcrypt = require('bcryptjs');
const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const database = require('../../../../../../shared/lib/database');
const TokenService = require('./token-service');
const SessionService = require('../../sessions/services/session-service');
const MFAService = require('./mfa-service');

const logger = getLogger({ serviceName: 'authentication-service' });

/**
 * Get database service instance
 * @private
 */
function _getDatabaseService() {
  return database.getInstance();
}

/**
 * Get AdminUser model from connected database
 * @private
 */
function _getAdminUserModel() {
  const dbService = _getDatabaseService();
  return dbService.getModel('admin-user', 'admin');
}

/**
 * Get AdminAuditLog model from connected database
 * @private
 */
function _getAdminAuditLogModel() {
  const dbService = _getDatabaseService();
  return dbService.getModel('admin-audit-log', 'admin');
}

/**
 * Authentication Service Class
 * @class AuthenticationService
 * @description Main service for handling all authentication flows
 */
class AuthenticationService {
  /**
   * Admin login with email and password
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - Admin email
   * @param {string} credentials.password - Admin password
   * @param {string} credentials.ipAddress - Client IP address
   * @param {string} credentials.userAgent - Client user agent
   * @param {Object} credentials.location - Geographic location (optional)
   * @returns {Promise<Object>} Login result with tokens or MFA requirement
   * @throws {AppError} If login fails
   * @static
   * @public
   */
  static async login(credentials) {
    const { email, password, ipAddress, userAgent, location = {} } = credentials;

    try {
      logger.info('Login attempt', { email, ipAddress });

      // Get AdminUser model from connected database
      const AdminUser = _getAdminUserModel();

      // Find admin user by email (include password hash)
      const adminUser = await AdminUser.findOne({ email: email.toLowerCase() })
        .select('+passwordHash +mfaSecret');

      if (!adminUser) {
        // Log failed attempt (email not found)
        await this.#logFailedLogin(null, email, ipAddress, userAgent, 'user_not_found', location);
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Check if user is active
      if (!adminUser.isActive) {
        await adminUser.recordFailedLogin(ipAddress, userAgent, 'account_inactive', location);
        throw new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE');
      }

      // Check if account is deleted
      if (adminUser.deletedAt) {
        throw new AppError('Account has been deleted', 403, 'ACCOUNT_DELETED');
      }

      // Check if account is locked
      if (adminUser.isLocked) {
        const lockMinutes = Math.ceil((adminUser.lockedUntil - Date.now()) / (1000 * 60));
        throw new AppError(
          `Account is locked. Try again in ${lockMinutes} minutes`,
          403,
          'ACCOUNT_LOCKED'
        );
      }

      // Check IP whitelist
      if (!adminUser.isIpWhitelisted(ipAddress)) {
        await adminUser.recordFailedLogin(ipAddress, userAgent, 'ip_not_whitelisted', location);
        throw new AppError('Access denied from this IP address', 403, 'IP_NOT_WHITELISTED');
      }

      // Verify password
      const isPasswordValid = await adminUser.comparePassword(password);

      if (!isPasswordValid) {
        await adminUser.incLoginAttempts();
        await adminUser.recordFailedLogin(ipAddress, userAgent, 'invalid_password', location);
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Check if password is expired
      if (adminUser.isPasswordExpired) {
        throw new AppError('Password has expired. Please reset your password', 403, 'PASSWORD_EXPIRED');
      }

      // Check if password change is required
      if (adminUser.mustChangePassword) {
        throw new AppError('Password change required', 403, 'PASSWORD_CHANGE_REQUIRED');
      }

      // Check if MFA is required
      const mfaRequired = await MFAService.isMFARequired(adminUser);

      if (mfaRequired && adminUser.mfaEnabled) {
        // Generate temporary session token for MFA step
        const tempSessionToken = TokenService.generateAccessToken({
          adminUserId: adminUser._id.toString(),
          email: adminUser.email,
          role: adminUser.role,
          permissions: adminUser.permissions,
          sessionId: 'mfa-pending',
          department: adminUser.department
        }, { expiresIn: '10m' }); // Short-lived token for MFA step

        logger.info('MFA required for login', {
          adminUser: adminUser._id.toString(),
          email: adminUser.email
        });

        return {
          requiresMFA: true,
          tempToken: tempSessionToken,
          message: 'MFA verification required'
        };
      }

      // Create session and generate tokens
      const sessionResult = await SessionService.createSession({
        adminUser: adminUser._id,
        email: adminUser.email,
        role: adminUser.role,
        permissions: adminUser.permissions,
        department: adminUser.department,
        ipAddress,
        userAgent,
        isMfaVerified: false,
        location
      });

      // Reset failed login attempts
      await adminUser.resetLoginAttempts(ipAddress, userAgent, location);

      // Log successful login
      await this.#logSuccessfulLogin(adminUser._id, ipAddress, userAgent, location, false);

      logger.info('Login successful', {
        adminUser: adminUser._id.toString(),
        email: adminUser.email,
        sessionId: sessionResult.session.sessionId
      });

      return {
        requiresMFA: false,
        user: {
          id: adminUser._id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          fullName: adminUser.fullName,
          role: adminUser.role,
          permissions: adminUser.permissions,
          department: adminUser.department
        },
        session: sessionResult.session,
        tokens: sessionResult.tokens
      };
    } catch (error) {
      logger.error('Login failed', {
        error: error.message,
        email,
        ipAddress
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Login failed', 500, 'LOGIN_FAILED');
    }
  }

  /**
   * Verify MFA and complete login
   * @param {Object} params - MFA verification parameters
   * @param {string} params.tempToken - Temporary session token from initial login
   * @param {string} params.mfaCode - MFA code (TOTP or backup code)
   * @param {string} params.ipAddress - Client IP address
   * @param {string} params.userAgent - Client user agent
   * @param {Object} params.location - Geographic location (optional)
   * @returns {Promise<Object>} Login result with tokens
   * @throws {AppError} If MFA verification fails
   * @static
   * @public
   */
  static async verifyMFAAndLogin(params) {
    const { tempToken, mfaCode, ipAddress, userAgent, location = {} } = params;

    try {
      // Verify temp token
      const decoded = TokenService.verifyAccessToken(tempToken);

      if (decoded.sessionId !== 'mfa-pending') {
        throw new AppError('Invalid MFA token', 401, 'INVALID_MFA_TOKEN');
      }

      // Get models from connected database
      const AdminUser = _getAdminUserModel();

      // Find admin user
      const adminUser = await AdminUser.findById(decoded.sub);

      if (!adminUser || !adminUser.isActive) {
        throw new AppError('User not found or inactive', 401, 'USER_NOT_FOUND');
      }

      // Verify MFA code (try TOTP first, then backup code)
      let mfaVerified = false;
      let mfaMethod = null;

      try {
        // Try TOTP verification
        mfaVerified = await MFAService.verifyTOTP(
          adminUser._id,
          mfaCode,
          ipAddress,
          userAgent
        );
        mfaMethod = 'totp';
      } catch (totpError) {
        // If TOTP fails, try backup code
        try {
          mfaVerified = await MFAService.verifyBackupCode(
            adminUser._id,
            mfaCode,
            ipAddress,
            userAgent
          );
          mfaMethod = 'backup_code';
        } catch (backupError) {
          throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
        }
      }

      if (!mfaVerified) {
        throw new AppError('MFA verification failed', 401, 'MFA_VERIFICATION_FAILED');
      }

      // Create session with MFA verified
      const sessionResult = await SessionService.createSession({
        adminUser: adminUser._id,
        email: adminUser.email,
        role: adminUser.role,
        permissions: adminUser.permissions,
        department: adminUser.department,
        ipAddress,
        userAgent,
        isMfaVerified: true,
        location
      });

      // Reset failed login attempts
      await adminUser.resetLoginAttempts(ipAddress, userAgent, location);

      // Log successful login with MFA
      await this.#logSuccessfulLogin(adminUser._id, ipAddress, userAgent, location, true, mfaMethod);

      logger.info('MFA verification successful', {
        adminUser: adminUser._id.toString(),
        mfaMethod,
        sessionId: sessionResult.session.sessionId
      });

      return {
        user: {
          id: adminUser._id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          fullName: adminUser.fullName,
          role: adminUser.role,
          permissions: adminUser.permissions,
          department: adminUser.department
        },
        session: sessionResult.session,
        tokens: sessionResult.tokens
      };
    } catch (error) {
      logger.error('MFA verification failed', {
        error: error.message,
        ipAddress
      });

      if (error instanceof AppError) throw error;
      throw new AppError('MFA verification failed', 401, 'MFA_VERIFICATION_FAILED');
    }
  }

  /**
   * Logout admin user
   * @param {string} sessionId - Session ID
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<void>}
   * @throws {AppError} If logout fails
   * @static
   * @public
   */
  static async logout(sessionId, adminUserId, ipAddress, userAgent) {
    try {
      // Revoke session
      await SessionService.revokeSession(sessionId, 'logout');

      // Get models from connected database
      const AdminAuditLog = _getAdminAuditLogModel();

      // Log logout
      await AdminAuditLog.create({
        actor: adminUserId,
        action: 'auth.logout',
        category: 'authentication',
        severity: 'low',
        description: 'Admin user logged out',
        ipAddress,
        userAgent,
        sessionId,
        status: 'success'
      });

      logger.info('Logout successful', {
        adminUser: adminUserId.toString(),
        sessionId
      });
    } catch (error) {
      logger.error('Logout failed', {
        error: error.message,
        adminUser: adminUserId.toString(),
        sessionId
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Logout failed', 500, 'LOGOUT_FAILED');
    }
  }

  /**
   * Logout from all devices
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} currentSessionId - Current session ID (to exclude)
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<number>} Number of sessions revoked
   * @static
   * @public
   */
  static async logoutAllDevices(adminUserId, currentSessionId, ipAddress, userAgent) {
    try {
      const count = await SessionService.revokeAllUserSessions(
        adminUserId,
        'logout_all',
        currentSessionId
      );

      // Get models from connected database
      const AdminAuditLog = _getAdminAuditLogModel();

      // Log action
      await AdminAuditLog.create({
        actor: adminUserId,
        action: 'auth.logout_all_devices',
        category: 'authentication',
        severity: 'medium',
        description: `Logged out from ${count} devices`,
        ipAddress,
        userAgent,
        sessionId: currentSessionId,
        status: 'success',
        metadata: { sessionsRevoked: count }
      });

      logger.info('Logged out from all devices', {
        adminUser: adminUserId.toString(),
        count
      });

      return count;
    } catch (error) {
      logger.error('Logout all devices failed', {
        error: error.message,
        adminUser: adminUserId.toString()
      });

      throw new AppError('Logout all devices failed', 500, 'LOGOUT_ALL_FAILED');
    }
  }

  /**
   * Request password reset
   * @param {string} email - Admin email
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<string>} Password reset token
   * @throws {AppError} If request fails
   * @static
   * @public
   */
  static async requestPasswordReset(email, ipAddress, userAgent) {
    try {
      // Get models from connected database
      const AdminUser = _getAdminUserModel();
      const AdminAuditLog = _getAdminAuditLogModel();

      const adminUser = await AdminUser.findOne({ email: email.toLowerCase() });

      if (!adminUser) {
        // Don't reveal if email exists (return success anyway)
        logger.info('Password reset requested for non-existent email', { email });
        return null;
      }

      // Generate password reset token
      const resetToken = adminUser.createPasswordResetToken();
      await adminUser.save();

      // Log password reset request
      await AdminAuditLog.create({
        actor: adminUser._id,
        action: 'auth.password_reset_request',
        category: 'authentication',
        severity: 'medium',
        description: 'Password reset requested',
        ipAddress,
        userAgent,
        status: 'success'
      });

      logger.info('Password reset requested', {
        adminUser: adminUser._id.toString(),
        email
      });

      // Return token (to be sent via email)
      return resetToken;
    } catch (error) {
      logger.error('Password reset request failed', {
        error: error.message,
        email
      });

      throw new AppError('Password reset request failed', 500, 'PASSWORD_RESET_REQUEST_FAILED');
    }
  }

  /**
   * Reset password using reset token
   * @param {string} resetToken - Password reset token
   * @param {string} newPassword - New password
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<void>}
   * @throws {AppError} If reset fails
   * @static
   * @public
   */
  static async resetPassword(resetToken, newPassword, ipAddress, userAgent) {
    try {
      // Get models from connected database
      const AdminUser = _getAdminUserModel();
      const AdminAuditLog = _getAdminAuditLogModel();

      // Find user by reset token
      const adminUser = await AdminUser.findByPasswordResetToken(resetToken)
        .select('+passwordHash +passwordHistory');

      if (!adminUser) {
        throw new AppError('Invalid or expired reset token', 401, 'INVALID_RESET_TOKEN');
      }

      // Check if password was used before
      const wasUsedBefore = await adminUser.isPasswordInHistory(newPassword);

      if (wasUsedBefore) {
        throw new AppError(
          'Cannot reuse previous passwords',
          400,
          'PASSWORD_REUSED'
        );
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Add current password to history
      adminUser.passwordHistory.push(adminUser.passwordHash);
      adminUser.passwordHash = hashedPassword;
      adminUser.lastPasswordChange = new Date();
      adminUser.passwordResetToken = undefined;
      adminUser.passwordResetExpires = undefined;
      adminUser.mustChangePassword = false;

      await adminUser.save();

      // Revoke all existing sessions
      await SessionService.revokeAllUserSessions(adminUser._id, 'password_reset');

      // Log password reset
      await AdminAuditLog.create({
        actor: adminUser._id,
        action: 'auth.password_reset',
        category: 'authentication',
        severity: 'high',
        description: 'Password reset completed',
        ipAddress,
        userAgent,
        status: 'success'
      });

      logger.info('Password reset successful', {
        adminUser: adminUser._id.toString()
      });
    } catch (error) {
      logger.error('Password reset failed', {
        error: error.message
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Password reset failed', 500, 'PASSWORD_RESET_FAILED');
    }
  }

  /**
   * Change password (authenticated user)
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<void>}
   * @throws {AppError} If change fails
   * @static
   * @public
   */
  static async changePassword(adminUserId, currentPassword, newPassword, ipAddress, userAgent) {
    try {
      // Get models from connected database
      const AdminUser = _getAdminUserModel();
      const AdminAuditLog = _getAdminAuditLogModel();

      const adminUser = await AdminUser.findById(adminUserId)
        .select('+passwordHash +passwordHistory');

      if (!adminUser) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      // Verify current password
      const isValid = await adminUser.comparePassword(currentPassword);

      if (!isValid) {
        throw new AppError('Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
      }

      // Check if new password was used before
      const wasUsedBefore = await adminUser.isPasswordInHistory(newPassword);

      if (wasUsedBefore) {
        throw new AppError(
          'Cannot reuse previous passwords',
          400,
          'PASSWORD_REUSED'
        );
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      adminUser.passwordHistory.push(adminUser.passwordHash);
      adminUser.passwordHash = hashedPassword;
      adminUser.lastPasswordChange = new Date();
      adminUser.mustChangePassword = false;

      await adminUser.save();

      // Revoke all other sessions
      await SessionService.revokeAllUserSessions(adminUser._id, 'password_change');

      // Log password change
      await AdminAuditLog.create({
        actor: adminUserId,
        action: 'auth.password_change',
        category: 'authentication',
        severity: 'high',
        description: 'Password changed',
        ipAddress,
        userAgent,
        status: 'success'
      });

      logger.info('Password changed successfully', {
        adminUser: adminUserId.toString()
      });
    } catch (error) {
      logger.error('Password change failed', {
        error: error.message,
        adminUser: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Password change failed', 500, 'PASSWORD_CHANGE_FAILED');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Log successful login
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @param {Object} location - Location data
   * @param {boolean} mfaUsed - Whether MFA was used
   * @param {string} mfaMethod - MFA method used (optional)
   * @private
   * @static
   */
  static async #logSuccessfulLogin(adminUserId, ipAddress, userAgent, location, mfaUsed, mfaMethod = null) {
    try {
      const AdminAuditLog = _getAdminAuditLogModel();

      await AdminAuditLog.create({
        actor: adminUserId,
        action: 'auth.login',
        category: 'authentication',
        severity: 'low',
        description: `Admin user logged in${mfaUsed ? ` with MFA (${mfaMethod})` : ''}`,
        ipAddress,
        userAgent,
        location,
        status: 'success',
        metadata: {
          mfaUsed,
          mfaMethod
        }
      });
    } catch (error) {
      logger.error('Failed to log successful login', { error: error.message });
    }
  }

  /**
   * Log failed login attempt
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID (can be null)
   * @param {string} email - Email attempted
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @param {string} reason - Failure reason
   * @param {Object} location - Location data
   * @private
   * @static
   */
  static async #logFailedLogin(adminUserId, email, ipAddress, userAgent, reason, location) {
    try {
      const AdminAuditLog = _getAdminAuditLogModel();

      await AdminAuditLog.create({
        actor: adminUserId,
        action: 'auth.login',
        category: 'authentication',
        severity: 'medium',
        description: `Failed login attempt for ${email}`,
        ipAddress,
        userAgent,
        location,
        status: 'failure',
        errorMessage: reason,
        metadata: {
          email,
          failureReason: reason
        },
        isSuspicious: true,
        suspiciousReasons: ['failed_login_attempt']
      });
    } catch (error) {
      logger.error('Failed to log failed login', { error: error.message });
    }
  }
}

module.exports = AuthenticationService;
