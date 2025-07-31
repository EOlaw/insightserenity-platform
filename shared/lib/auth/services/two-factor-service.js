'use strict';

/**
 * @fileoverview Two-factor authentication service for TOTP, SMS, and email-based 2FA
 * @module shared/lib/auth/services/two-factor-service
 * @requires module:speakeasy
 * @requires module:qrcode
 * @requires module:crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/sms-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/audit-log-model
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const EncryptionService = require('../../security/encryption/encryption-service');
const CacheService = require('../../services/cache-service');
const EmailService = require('../../services/email-service');
const SMSService = require('../../services/sms-service');
const UserModel = require('../../database/models/users/user-model');
const AuditLogModel = require('../../database/models/security/audit-log-model').model;

/**
 * @class TwoFactorService
 * @description Manages two-factor authentication including TOTP generation,
 * verification, backup codes, and multiple delivery methods
 */
class TwoFactorService {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {EmailService}
   */
  #emailService;

  /**
   * @private
   * @type {SMSService}
   */
  #smsService;

  /**
   * @private
   * @type {Map}
   */
  #twoFactorMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    issuer: 'InsightSerenity',
    algorithm: 'sha256',
    digits: 6,
    period: 30,
    window: 2,
    qrCodeSize: 200,
    backupCodeCount: 10,
    backupCodeLength: 8,
    backupCodeFormat: 'alphanumeric', // 'numeric', 'alphanumeric', 'hex'
    emailCodeLength: 6,
    emailCodeExpiry: 600000, // 10 minutes
    smsCodeLength: 6,
    smsCodeExpiry: 300000, // 5 minutes
    maxVerificationAttempts: 5,
    verificationLockoutDuration: 900000, // 15 minutes
    enableRateLimiting: true,
    rateLimitWindow: 300000, // 5 minutes
    rateLimitMaxAttempts: 10,
    cacheTTL: {
      verificationCode: 600, // 10 minutes
      setupSession: 300, // 5 minutes
      rateLimiting: 300 // 5 minutes
    },
    supportedMethods: ['totp', 'email', 'sms', 'backup'],
    preferredMethod: 'totp'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #TWO_FACTOR_METHODS = {
    TOTP: 'totp',
    EMAIL: 'email',
    SMS: 'sms',
    BACKUP: 'backup',
    PUSH: 'push', // Future enhancement
    BIOMETRIC: 'biometric' // Future enhancement
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #TWO_FACTOR_EVENTS = {
    SETUP_INITIATED: '2fa.setup.initiated',
    SETUP_COMPLETED: '2fa.setup.completed',
    VERIFIED: '2fa.verified',
    FAILED: '2fa.failed',
    DISABLED: '2fa.disabled',
    BACKUP_USED: '2fa.backup.used',
    METHOD_CHANGED: '2fa.method.changed',
    RECOVERY_INITIATED: '2fa.recovery.initiated'
  };

  /**
   * Creates a new TwoFactorService instance
   * @param {Object} [config] - Service configuration
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EmailService} [emailService] - Email service instance
   * @param {SMSService} [smsService] - SMS service instance
   */
  constructor(config = {}, encryptionService, cacheService, emailService, smsService) {
    this.#config = { ...TwoFactorService.#DEFAULT_CONFIG, ...config };
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#cacheService = cacheService || new CacheService();
    this.#emailService = emailService || new EmailService();
    this.#smsService = smsService || new SMSService();
    this.#twoFactorMetrics = new Map();

    logger.info('TwoFactorService initialized', {
      issuer: this.#config.issuer,
      supportedMethods: this.#config.supportedMethods,
      preferredMethod: this.#config.preferredMethod
    });
  }

  /**
   * Generates TOTP secret and QR code
   * @param {string} userIdentifier - User email or username
   * @param {string} [label] - Optional label for the account
   * @returns {Promise<Object>} Secret, QR code, and backup codes
   * @throws {AppError} If generation fails
   */
  async generateSecret(userIdentifier, label) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Generating 2FA secret', {
        correlationId,
        userIdentifier
      });

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        length: 32,
        name: label || userIdentifier,
        issuer: this.#config.issuer,
        algorithm: this.#config.algorithm
      });

      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url, {
        width: this.#config.qrCodeSize,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Generate backup codes
      const backupCodes = await this.#generateBackupCodes();

      // Track metrics
      this.#trackTwoFactorEvent(TwoFactorService.#TWO_FACTOR_EVENTS.SETUP_INITIATED);

      logger.info('2FA secret generated successfully', {
        correlationId,
        method: TwoFactorService.#TWO_FACTOR_METHODS.TOTP
      });

      return {
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        manualEntryKey: secret.base32,
        backupCodes,
        algorithm: this.#config.algorithm,
        digits: this.#config.digits,
        period: this.#config.period
      };

    } catch (error) {
      logger.error('2FA secret generation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to generate 2FA secret',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies TOTP code
   * @param {string} secret - TOTP secret
   * @param {string} token - User-provided token
   * @param {Object} [options] - Verification options
   * @returns {Promise<boolean>} True if valid
   * @throws {AppError} If verification fails
   */
  async verifyTOTP(secret, token, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Verifying TOTP code', { correlationId });

      // Check rate limiting
      await this.#checkRateLimit(options.userId || 'anonymous', 'totp');

      // Decrypt secret if encrypted
      const decryptedSecret = await this.#decryptSecret(secret);

      // Verify token
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token: token,
        window: options.window || this.#config.window,
        algorithm: this.#config.algorithm,
        digits: this.#config.digits,
        period: this.#config.period
      });

      // Track metrics
      this.#trackTwoFactorEvent(
        verified ? TwoFactorService.#TWO_FACTOR_EVENTS.VERIFIED : TwoFactorService.#TWO_FACTOR_EVENTS.FAILED,
        { method: TwoFactorService.#TWO_FACTOR_METHODS.TOTP }
      );

      if (verified) {
        logger.info('TOTP verification successful', { correlationId });
      } else {
        logger.warn('TOTP verification failed', { correlationId });
      }

      return verified;

    } catch (error) {
      logger.error('TOTP verification error', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'TOTP verification failed',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Sends 2FA code via email
   * @param {string} email - User email
   * @param {Object} [options] - Send options
   * @returns {Promise<Object>} Send result with masked code
   * @throws {AppError} If sending fails
   */
  async sendEmailCode(email, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Sending 2FA code via email', {
        correlationId,
        email: this.#maskEmail(email)
      });

      // Check rate limiting
      await this.#checkRateLimit(email, 'email');

      // Generate code
      const code = this.#generateVerificationCode(this.#config.emailCodeLength);
      const expiresAt = new Date(Date.now() + this.#config.emailCodeExpiry);

      // Store code in cache
      const cacheKey = `2fa_email:${email}`;
      await this.#cacheService.set(cacheKey, {
        code,
        attempts: 0,
        expiresAt
      }, this.#config.cacheTTL.verificationCode);

      // Send email
      await this.#emailService.sendEmail({
        to: email,
        subject: 'Your verification code',
        template: '2fa-code',
        data: {
          code,
          expiryMinutes: Math.floor(this.#config.emailCodeExpiry / 60000)
        }
      });

      // Track metrics
      this.#trackTwoFactorEvent(TwoFactorService.#TWO_FACTOR_EVENTS.SETUP_INITIATED, {
        method: TwoFactorService.#TWO_FACTOR_METHODS.EMAIL
      });

      logger.info('2FA email code sent', { correlationId });

      return {
        success: true,
        method: TwoFactorService.#TWO_FACTOR_METHODS.EMAIL,
        maskedEmail: this.#maskEmail(email),
        expiresAt
      };

    } catch (error) {
      logger.error('2FA email send failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to send 2FA email',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Sends 2FA code via SMS
   * @param {string} phoneNumber - User phone number
   * @param {Object} [options] - Send options
   * @returns {Promise<Object>} Send result with masked number
   * @throws {AppError} If sending fails
   */
  async sendSMSCode(phoneNumber, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Sending 2FA code via SMS', {
        correlationId,
        phoneNumber: this.#maskPhoneNumber(phoneNumber)
      });

      // Check rate limiting
      await this.#checkRateLimit(phoneNumber, 'sms');

      // Generate code
      const code = this.#generateVerificationCode(this.#config.smsCodeLength);
      const expiresAt = new Date(Date.now() + this.#config.smsCodeExpiry);

      // Store code in cache
      const cacheKey = `2fa_sms:${phoneNumber}`;
      await this.#cacheService.set(cacheKey, {
        code,
        attempts: 0,
        expiresAt
      }, this.#config.cacheTTL.verificationCode);

      // Send SMS
      await this.#smsService.sendSMS({
        to: phoneNumber,
        message: `Your verification code is: ${code}. Valid for ${Math.floor(this.#config.smsCodeExpiry / 60000)} minutes.`
      });

      // Track metrics
      this.#trackTwoFactorEvent(TwoFactorService.#TWO_FACTOR_EVENTS.SETUP_INITIATED, {
        method: TwoFactorService.#TWO_FACTOR_METHODS.SMS
      });

      logger.info('2FA SMS code sent', { correlationId });

      return {
        success: true,
        method: TwoFactorService.#TWO_FACTOR_METHODS.SMS,
        maskedPhoneNumber: this.#maskPhoneNumber(phoneNumber),
        expiresAt
      };

    } catch (error) {
      logger.error('2FA SMS send failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to send 2FA SMS',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies email or SMS code
   * @param {string} identifier - Email or phone number
   * @param {string} code - Verification code
   * @param {string} method - Verification method ('email' or 'sms')
   * @param {Object} [options] - Verification options
   * @returns {Promise<boolean>} True if valid
   * @throws {AppError} If verification fails
   */
  async verifyCode(identifier, code, method, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.debug('Verifying 2FA code', {
        correlationId,
        method
      });

      const cacheKey = `2fa_${method}:${identifier}`;
      const storedData = await this.#cacheService.get(cacheKey);

      if (!storedData) {
        logger.warn('No verification code found', { correlationId });
        return false;
      }

      // Check expiry
      if (new Date() > new Date(storedData.expiresAt)) {
        logger.warn('Verification code expired', { correlationId });
        await this.#cacheService.delete(cacheKey);
        return false;
      }

      // Check attempts
      if (storedData.attempts >= this.#config.maxVerificationAttempts) {
        logger.warn('Max verification attempts exceeded', { correlationId });
        await this.#cacheService.delete(cacheKey);
        throw new AppError(
          'Maximum verification attempts exceeded',
          429,
          ERROR_CODES.TOO_MANY_ATTEMPTS,
          { correlationId }
        );
      }

      // Increment attempts
      storedData.attempts++;
      await this.#cacheService.set(cacheKey, storedData, this.#config.cacheTTL.verificationCode);

      // Verify code
      const isValid = storedData.code === code;

      if (isValid) {
        // Delete code after successful verification
        await this.#cacheService.delete(cacheKey);
        logger.info('2FA code verified successfully', { correlationId, method });
      } else {
        logger.warn('2FA code verification failed', { correlationId, method });
      }

      // Track metrics
      this.#trackTwoFactorEvent(
        isValid ? TwoFactorService.#TWO_FACTOR_EVENTS.VERIFIED : TwoFactorService.#TWO_FACTOR_EVENTS.FAILED,
        { method }
      );

      return isValid;

    } catch (error) {
      logger.error('Code verification error', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Code verification failed',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies backup code
   * @param {string} userId - User ID
   * @param {string} code - Backup code
   * @param {Array<Object>} backupCodes - User's backup codes
   * @returns {Promise<Object>} Verification result
   * @throws {AppError} If verification fails
   */
  async verifyBackupCode(userId, code, backupCodes) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.debug('Verifying backup code', { correlationId, userId });

      let codeIndex = -1;
      let isValid = false;

      // Check each backup code
      for (let i = 0; i < backupCodes.length; i++) {
        const backupCode = backupCodes[i];
        
        // Skip already used codes
        if (backupCode.usedAt) {
          continue;
        }

        // Verify code
        const codeValid = await this.#encryptionService.compareHash(
          code,
          backupCode.code
        );

        if (codeValid) {
          isValid = true;
          codeIndex = i;
          break;
        }
      }

      if (isValid && codeIndex !== -1) {
        // Mark code as used
        backupCodes[codeIndex].usedAt = new Date();
        
        // Track metrics
        this.#trackTwoFactorEvent(TwoFactorService.#TWO_FACTOR_EVENTS.BACKUP_USED);

        logger.info('Backup code verified successfully', { correlationId, userId });

        // Check remaining codes
        const remainingCodes = backupCodes.filter(bc => !bc.usedAt).length;
        
        return {
          valid: true,
          remainingCodes,
          shouldRegenerateBackupCodes: remainingCodes < 3
        };
      }

      logger.warn('Backup code verification failed', { correlationId, userId });

      return {
        valid: false
      };

    } catch (error) {
      logger.error('Backup code verification error', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Backup code verification failed',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Regenerates backup codes
   * @param {string} userId - User ID
   * @returns {Promise<Array>} New backup codes
   * @throws {AppError} If generation fails
   */
  async regenerateBackupCodes(userId) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Regenerating backup codes', { correlationId, userId });

      const backupCodes = await this.#generateBackupCodes();

      logger.info('Backup codes regenerated', {
        correlationId,
        userId,
        count: backupCodes.length
      });

      return backupCodes;

    } catch (error) {
      logger.error('Backup code regeneration failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to regenerate backup codes',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Disables two-factor authentication
   * @param {string} userId - User ID
   * @param {Object} [options] - Disable options
   * @returns {Promise<Object>} Disable result
   * @throws {AppError} If disable fails
   */
  async disableTwoFactor(userId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Disabling 2FA', { correlationId, userId });

      // Update user
      await UserModel.findByIdAndUpdate(userId, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
        twoFactorMethod: null,
        twoFactorDisabledAt: new Date()
      });

      // Clear any cached data
      await this.#clearUserTwoFactorCache(userId);

      // Track metrics
      this.#trackTwoFactorEvent(TwoFactorService.#TWO_FACTOR_EVENTS.DISABLED);

      // Audit log
      await this.#auditTwoFactorEvent(userId, TwoFactorService.#TWO_FACTOR_EVENTS.DISABLED, {
        reason: options.reason,
        correlationId
      });

      logger.info('2FA disabled successfully', { correlationId, userId });

      return {
        success: true,
        message: 'Two-factor authentication has been disabled'
      };

    } catch (error) {
      logger.error('2FA disable failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to disable 2FA',
        500,
        ERROR_CODES.TWO_FACTOR_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Gets available 2FA methods for user
   * @param {Object} user - User object
   * @returns {Array<Object>} Available methods
   */
  getAvailableMethods(user) {
    const methods = [];

    // TOTP is always available
    if (this.#config.supportedMethods.includes(TwoFactorService.#TWO_FACTOR_METHODS.TOTP)) {
      methods.push({
        method: TwoFactorService.#TWO_FACTOR_METHODS.TOTP,
        enabled: user.twoFactorEnabled && user.twoFactorMethod === TwoFactorService.#TWO_FACTOR_METHODS.TOTP,
        configured: !!user.twoFactorSecret
      });
    }

    // Email if verified
    if (this.#config.supportedMethods.includes(TwoFactorService.#TWO_FACTOR_METHODS.EMAIL)) {
      methods.push({
        method: TwoFactorService.#TWO_FACTOR_METHODS.EMAIL,
        enabled: user.twoFactorEnabled && user.twoFactorMethod === TwoFactorService.#TWO_FACTOR_METHODS.EMAIL,
        configured: user.isEmailVerified,
        identifier: this.#maskEmail(user.email)
      });
    }

    // SMS if phone number exists
    if (this.#config.supportedMethods.includes(TwoFactorService.#TWO_FACTOR_METHODS.SMS) && user.phoneNumber) {
      methods.push({
        method: TwoFactorService.#TWO_FACTOR_METHODS.SMS,
        enabled: user.twoFactorEnabled && user.twoFactorMethod === TwoFactorService.#TWO_FACTOR_METHODS.SMS,
        configured: user.isPhoneVerified,
        identifier: this.#maskPhoneNumber(user.phoneNumber)
      });
    }

    // Backup codes if 2FA is enabled
    if (user.twoFactorEnabled && user.twoFactorBackupCodes?.length > 0) {
      const unusedCodes = user.twoFactorBackupCodes.filter(bc => !bc.usedAt);
      methods.push({
        method: TwoFactorService.#TWO_FACTOR_METHODS.BACKUP,
        enabled: true,
        configured: true,
        remainingCodes: unusedCodes.length
      });
    }

    return methods;
  }

  /**
   * Encrypts TOTP secret
   * @param {string} secret - Plain text secret
   * @returns {Promise<string>} Encrypted secret
   */
  async encryptSecret(secret) {
    return this.#encryptionService.encryptData(secret);
  }

  /**
   * Decrypts TOTP secret
   * @param {string} encryptedSecret - Encrypted secret
   * @returns {Promise<string>} Decrypted secret
   */
  async decryptSecret(encryptedSecret) {
    return this.#decryptSecret(encryptedSecret);
  }

  /**
   * @private
   * Generates backup codes
   */
  async #generateBackupCodes() {
    const codes = [];
    const plainCodes = [];

    for (let i = 0; i < this.#config.backupCodeCount; i++) {
      const code = this.#generateBackupCode();
      const hashedCode = await this.#encryptionService.hashData(code);
      
      codes.push({
        code: hashedCode,
        createdAt: new Date(),
        usedAt: null
      });
      
      plainCodes.push(code);
    }

    return plainCodes;
  }

  /**
   * @private
   * Generates single backup code
   */
  #generateBackupCode() {
    const length = this.#config.backupCodeLength;
    const format = this.#config.backupCodeFormat;
    
    let charset = '';
    
    switch (format) {
      case 'numeric':
        charset = '0123456789';
        break;
      case 'alphanumeric':
        charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        break;
      case 'hex':
        return crypto.randomBytes(length / 2).toString('hex').toUpperCase();
      default:
        charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }

    let code = '';
    for (let i = 0; i < length; i++) {
      code += charset[crypto.randomInt(0, charset.length)];
    }

    // Format with dashes for readability (e.g., XXXX-XXXX)
    if (length === 8) {
      return `${code.slice(0, 4)}-${code.slice(4)}`;
    }

    return code;
  }

  /**
   * @private
   * Generates verification code
   */
  #generateVerificationCode(length) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += crypto.randomInt(0, 10);
    }
    return code;
  }

  /**
   * @private
   * Decrypts secret
   */
  async #decryptSecret(encryptedSecret) {
    try {
      return await this.#encryptionService.decryptData(encryptedSecret);
    } catch (error) {
      // If decryption fails, assume it's not encrypted
      return encryptedSecret;
    }
  }

  /**
   * @private
   * Checks rate limiting
   */
  async #checkRateLimit(identifier, method) {
    if (!this.#config.enableRateLimiting) return;

    const key = `2fa_rate:${method}:${identifier}`;
    const attempts = await this.#cacheService.get(key) || 0;

    if (attempts >= this.#config.rateLimitMaxAttempts) {
      throw new AppError(
        'Too many 2FA attempts',
        429,
        ERROR_CODES.RATE_LIMIT_ERROR
      );
    }

    await this.#cacheService.set(
      key,
      attempts + 1,
      this.#config.cacheTTL.rateLimiting
    );
  }

  /**
   * @private
   * Masks email address
   */
  #maskEmail(email) {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.substring(0, 2) + '***';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * @private
   * Masks phone number
   */
  #maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    const cleaned = phoneNumber.replace(/\D/g, '');
    const lastFour = cleaned.slice(-4);
    return `***-***-${lastFour}`;
  }

  /**
   * @private
   * Clears user 2FA cache
   */
  async #clearUserTwoFactorCache(userId) {
    const patterns = [
      `2fa_*:${userId}`,
      `2fa_setup:${userId}`
    ];

    for (const pattern of patterns) {
      await this.#cacheService.deletePattern(pattern);
    }
  }

  /**
   * @private
   * Tracks 2FA event
   */
  #trackTwoFactorEvent(event, metadata = {}) {
    const key = `${event}:${metadata.method || 'unknown'}`;
    const current = this.#twoFactorMetrics.get(key) || 0;
    this.#twoFactorMetrics.set(key, current + 1);
  }

  /**
   * @private
   * Audits 2FA event
   */
  async #auditTwoFactorEvent(userId, event, metadata) {
    try {
      await AuditLogModel.create({
        userId,
        event,
        category: 'two_factor',
        metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to audit 2FA event', {
        userId,
        event,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `2fa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const metrics = {};
    this.#twoFactorMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Test TOTP generation
      const testSecret = speakeasy.generateSecret();
      const testToken = speakeasy.totp({
        secret: testSecret.base32,
        encoding: 'base32'
      });

      const verified = speakeasy.totp.verify({
        secret: testSecret.base32,
        encoding: 'base32',
        token: testToken,
        window: 0
      });

      return {
        healthy: verified,
        service: 'TwoFactorService',
        metrics: this.getMetrics(),
        supportedMethods: this.#config.supportedMethods
      };
    } catch (error) {
      logger.error('Two-factor service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'TwoFactorService',
        error: error.message
      };
    }
  }
}

module.exports = TwoFactorService;