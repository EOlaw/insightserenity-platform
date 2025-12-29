/**
 * @fileoverview MFA Service - Multi-Factor Authentication
 * @module servers/admin-server/services/mfa/mfa-service
 * @description Class-based service for managing multi-factor authentication including
 *              TOTP, SMS, Email verification, and backup codes.
 * @version 1.0.0
 * @requires speakeasy
 * @requires qrcode
 */

'use strict';

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminMFA = require('../../../../../../shared/lib/database/models/admin-server/admin-mfa');

const logger = getLogger({ serviceName: 'mfa-service' });

/**
 * MFA Service Class
 * @class MFAService
 * @description Handles all multi-factor authentication operations
 */
class MFAService {
  /**
   * @private
   * @static
   * @constant {string} MFA_ISSUER - TOTP issuer name
   */
  static #MFA_ISSUER = 'InsightSerenity Admin';

  /**
   * @private
   * @static
   * @constant {number} TOTP_WINDOW - Time window for TOTP verification (±1 period)
   */
  static #TOTP_WINDOW = 1;

  /**
   * Enable TOTP MFA for admin user
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} email - Admin email (for QR code label)
   * @returns {Promise<Object>} TOTP setup data { secret, qrCode, backupCodes }
   * @throws {AppError} If setup fails
   * @static
   * @public
   */
  static async setupTOTP(adminUserId, email) {
    try {
      logger.info('Setting up TOTP MFA', { adminUserId: adminUserId.toString(), email });

      // Find or create MFA record
      let mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId });

      if (!mfaRecord) {
        mfaRecord = new AdminMFA({
          adminUser: adminUserId,
          isEnabled: false,
          enabledMethods: []
        });
      }

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `${this.#MFA_ISSUER} (${email})`,
        issuer: this.#MFA_ISSUER,
        length: 32
      });

      // Update MFA record with TOTP secret
      mfaRecord.totp = {
        secret: secret.base32,
        isVerified: false,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        issuer: this.#MFA_ISSUER
      };

      // Generate backup codes
      const plainBackupCodes = mfaRecord.generateBackupCodes();

      await mfaRecord.save();

      // Generate QR code
      const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

      logger.info('TOTP MFA setup completed', {
        adminUserId: adminUserId.toString()
      });

      return {
        secret: secret.base32,
        qrCode: qrCodeDataURL,
        backupCodes: plainBackupCodes,
        otpauthUrl: secret.otpauth_url
      };
    } catch (error) {
      logger.error('TOTP setup failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('TOTP setup failed', 500, 'TOTP_SETUP_FAILED');
    }
  }

  /**
   * Verify TOTP code and enable MFA
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} totpCode - 6-digit TOTP code
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<boolean>} True if verification successful
   * @throws {AppError} If verification fails
   * @static
   * @public
   */
  static async verifyAndEnableTOTP(adminUserId, totpCode, ipAddress, userAgent) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId }).select('+totp.secret');

      if (!mfaRecord || !mfaRecord.totp?.secret) {
        throw new AppError('TOTP not set up', 400, 'TOTP_NOT_SETUP');
      }

      // Verify TOTP code
      const isValid = speakeasy.totp.verify({
        secret: mfaRecord.totp.secret,
        encoding: 'base32',
        token: totpCode,
        window: this.#TOTP_WINDOW
      });

      // Record verification attempt
      await mfaRecord.recordVerification('totp', isValid, ipAddress, userAgent, isValid ? null : 'invalid_code');

      if (!isValid) {
        throw new AppError('Invalid TOTP code', 401, 'INVALID_TOTP_CODE');
      }

      // Enable TOTP MFA
      mfaRecord.totp.isVerified = true;
      mfaRecord.totp.verifiedAt = new Date();
      mfaRecord.isEnabled = true;
      mfaRecord.primaryMethod = 'totp';
      mfaRecord.enabledMethods = ['totp'];
      mfaRecord.enabledAt = new Date();

      await mfaRecord.save();

      logger.info('TOTP MFA enabled', { adminUserId: adminUserId.toString() });

      return true;
    } catch (error) {
      logger.error('TOTP verification failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('TOTP verification failed', 401, 'TOTP_VERIFICATION_FAILED');
    }
  }

  /**
   * Verify TOTP code during login
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} totpCode - 6-digit TOTP code
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<boolean>} True if verification successful
   * @throws {AppError} If verification fails
   * @static
   * @public
   */
  static async verifyTOTP(adminUserId, totpCode, ipAddress, userAgent) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId }).select('+totp.secret');

      if (!mfaRecord || !mfaRecord.isEnabled || !mfaRecord.totp?.isVerified) {
        throw new AppError('TOTP MFA not enabled', 400, 'TOTP_NOT_ENABLED');
      }

      // Check if MFA is locked
      if (mfaRecord.isCurrentlyLocked) {
        const lockMinutes = Math.ceil((mfaRecord.lockedUntil - Date.now()) / (1000 * 60));
        throw new AppError(
          `MFA is locked. Try again in ${lockMinutes} minutes`,
          403,
          'MFA_LOCKED'
        );
      }

      // Verify TOTP code
      const isValid = speakeasy.totp.verify({
        secret: mfaRecord.totp.secret,
        encoding: 'base32',
        token: totpCode,
        window: this.#TOTP_WINDOW
      });

      // Record verification attempt
      await mfaRecord.recordVerification('totp', isValid, ipAddress, userAgent, isValid ? null : 'invalid_code');

      if (!isValid) {
        throw new AppError('Invalid TOTP code', 401, 'INVALID_TOTP_CODE');
      }

      // Update last used timestamp
      mfaRecord.totp.lastUsed = new Date();
      await mfaRecord.save();

      return true;
    } catch (error) {
      logger.warn('TOTP verification failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('TOTP verification failed', 401, 'TOTP_VERIFICATION_FAILED');
    }
  }

  /**
   * Verify backup code
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @param {string} backupCode - Backup code
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<boolean>} True if verification successful
   * @throws {AppError} If verification fails
   * @static
   * @public
   */
  static async verifyBackupCode(adminUserId, backupCode, ipAddress, userAgent) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId }).select('+backupCodes');

      if (!mfaRecord || !mfaRecord.isEnabled) {
        throw new AppError('MFA not enabled', 400, 'MFA_NOT_ENABLED');
      }

      // Check if MFA is locked
      if (mfaRecord.isCurrentlyLocked) {
        throw new AppError('MFA is locked', 403, 'MFA_LOCKED');
      }

      // Verify backup code
      const isValid = await mfaRecord.verifyBackupCode(backupCode);

      // Record verification attempt
      await mfaRecord.recordVerification(
        'backup_code',
        isValid,
        ipAddress,
        userAgent,
        isValid ? null : 'invalid_backup_code'
      );

      if (!isValid) {
        throw new AppError('Invalid or used backup code', 401, 'INVALID_BACKUP_CODE');
      }

      logger.info('Backup code used successfully', {
        adminUserId: adminUserId.toString(),
        remainingCodes: mfaRecord.unusedBackupCodesCount
      });

      return true;
    } catch (error) {
      logger.warn('Backup code verification failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Backup code verification failed', 401, 'BACKUP_CODE_VERIFICATION_FAILED');
    }
  }

  /**
   * Regenerate backup codes
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @returns {Promise<Array<string>>} New backup codes
   * @throws {AppError} If regeneration fails
   * @static
   * @public
   */
  static async regenerateBackupCodes(adminUserId) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId });

      if (!mfaRecord) {
        throw new AppError('MFA not set up', 400, 'MFA_NOT_SETUP');
      }

      // Generate new backup codes
      const plainBackupCodes = mfaRecord.generateBackupCodes();
      await mfaRecord.save();

      logger.info('Backup codes regenerated', {
        adminUserId: adminUserId.toString()
      });

      return plainBackupCodes;
    } catch (error) {
      logger.error('Backup code regeneration failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Backup code regeneration failed', 500, 'BACKUP_CODE_REGENERATION_FAILED');
    }
  }

  /**
   * Disable MFA for admin user
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @returns {Promise<void>}
   * @throws {AppError} If disable fails
   * @static
   * @public
   */
  static async disableMFA(adminUserId) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId });

      if (!mfaRecord) {
        throw new AppError('MFA not set up', 400, 'MFA_NOT_SETUP');
      }

      // Disable MFA
      mfaRecord.isEnabled = false;
      mfaRecord.primaryMethod = null;
      mfaRecord.enabledMethods = [];

      await mfaRecord.save();

      logger.info('MFA disabled', { adminUserId: adminUserId.toString() });
    } catch (error) {
      logger.error('MFA disable failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('MFA disable failed', 500, 'MFA_DISABLE_FAILED');
    }
  }

  /**
   * Get MFA status for admin user
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @returns {Promise<Object>} MFA status
   * @static
   * @public
   */
  static async getMFAStatus(adminUserId) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId });

      if (!mfaRecord) {
        return {
          isEnabled: false,
          primaryMethod: null,
          enabledMethods: [],
          unusedBackupCodesCount: 0
        };
      }

      return {
        isEnabled: mfaRecord.isEnabled,
        primaryMethod: mfaRecord.primaryMethod,
        enabledMethods: mfaRecord.enabledMethods,
        totpIsVerified: mfaRecord.totp?.isVerified || false,
        unusedBackupCodesCount: mfaRecord.unusedBackupCodesCount,
        enabledAt: mfaRecord.enabledAt
      };
    } catch (error) {
      logger.error('Failed to get MFA status', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      throw new AppError('Failed to get MFA status', 500, 'MFA_STATUS_FAILED');
    }
  }

  /**
   * Check if MFA is required for admin user
   * @param {Object} adminUser - Admin user document
   * @returns {Promise<boolean>} True if MFA is required
   * @static
   * @public
   */
  static async isMFARequired(adminUser) {
    // MFA is required for superadmin and admin roles by default
    const requiredRoles = ['superadmin', 'admin'];

    if (requiredRoles.includes(adminUser.role)) {
      return true;
    }

    // Check if user has MFA enabled
    return adminUser.mfaEnabled;
  }

  /**
   * Unlock MFA for admin user (after lockout)
   * @param {mongoose.Types.ObjectId} adminUserId - Admin user ID
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async unlockMFA(adminUserId) {
    try {
      const mfaRecord = await AdminMFA.findOne({ adminUser: adminUserId });

      if (!mfaRecord) {
        throw new AppError('MFA not set up', 400, 'MFA_NOT_SETUP');
      }

      await mfaRecord.unlock();

      logger.info('MFA unlocked', { adminUserId: adminUserId.toString() });
    } catch (error) {
      logger.error('MFA unlock failed', {
        error: error.message,
        adminUserId: adminUserId.toString()
      });

      if (error instanceof AppError) throw error;
      throw new AppError('MFA unlock failed', 500, 'MFA_UNLOCK_FAILED');
    }
  }
}

module.exports = MFAService;
