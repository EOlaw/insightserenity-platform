'use strict';

/**
 * @fileoverview Password management service for hashing, validation, and policy enforcement
 * @module shared/lib/auth/services/password-service
 * @requires module:bcrypt
 * @requires module:crypto
 * @requires module:zxcvbn
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/user-model
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const zxcvbn = require('zxcvbn');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

// Lazy load dependencies to avoid circular dependency issues
let EncryptionService;
let CacheService;
let UserModel;

function getEncryptionService() {
  if (!EncryptionService) {
    EncryptionService = require('../../security/encryption/encryption-service');
  }
  return EncryptionService;
}

function getCacheService() {
  if (!CacheService) {
    CacheService = require('../../services/cache-service');
  }
  return CacheService;
}

function getUserModel() {
  if (!UserModel) {
    UserModel = require('../../database/models/customer-services/core-business/user-management/user-model');
  }
  return UserModel;
}

/**
 * @class PasswordService
 * @description Manages password operations including hashing, verification,
 * policy enforcement, and security features with enterprise-grade standards
 */
class PasswordService {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Object}
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   */
  #cacheService;

  /**
   * @private
   * @type {Set}
   */
  #commonPasswords;

  /**
   * @private
   * @type {Map}
   */
  #passwordMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    bcryptRounds: 12,
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecial: true,
    specialCharacters: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    preventCommonPasswords: true,
    preventUserInfo: true,
    preventRepeatingCharacters: true,
    maxRepeatingCharacters: 3,
    preventSequentialCharacters: true,
    maxSequentialCharacters: 3,
    preventDictionaryWords: true,
    minStrengthScore: 3, // zxcvbn score (0-4)
    passwordHistoryLimit: 5,
    temporaryPasswordExpiry: 3600000, // 1 hour
    passwordExpiryDays: 90,
    passwordExpiryWarningDays: 14,
    enablePasswordComplexityCheck: true,
    enableCompromisedPasswordCheck: true,
    cacheTTL: {
      passwordStrength: 300, // 5 minutes
      compromisedCheck: 3600 // 1 hour
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Array<string>}
   */
  static #COMMON_PASSWORDS = [
    'password', '12345678', 'qwerty', 'abc123', 'password123',
    'admin', 'letmein', 'welcome', 'monkey', '1234567890',
    'qwertyuiop', 'password1', 'welcome123', 'admin123', 'root123',
    'P@ssw0rd', 'Password1', 'Welcome1', 'Admin123', 'Qwerty123'
  ];

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #PASSWORD_PATTERNS = {
    uppercase: /[A-Z]/,
    lowercase: /[a-z]/,
    numbers: /[0-9]/,
    special: /[^A-Za-z0-9]/,
    repeating: /(.)\1{2,}/,
    sequential: /(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i,
    keyboard: /(qwerty|asdfgh|zxcvbn|qazwsx|qwertyuiop|asdfghjkl|zxcvbnm)/i
  };

  /**
   * Creates a new PasswordService instance
   * @param {Object} [config] - Service configuration
   * @param {Object} [encryptionService] - Encryption service instance
   * @param {Object} [cacheService] - Cache service instance
   */
  constructor(config = {}, encryptionService, cacheService) {
    this.#config = { ...PasswordService.#DEFAULT_CONFIG, ...config };
    
    if (encryptionService) {
      this.#encryptionService = encryptionService;
    } else {
      const EncryptionServiceClass = getEncryptionService();
      this.#encryptionService = new EncryptionServiceClass();
    }
    
    if (cacheService) {
      this.#cacheService = cacheService;
    } else {
      const CacheServiceClass = getCacheService();
      this.#cacheService = new CacheServiceClass();
    }
    
    this.#commonPasswords = new Set(PasswordService.#COMMON_PASSWORDS);
    this.#passwordMetrics = new Map();

    // Load additional common passwords if configured
    if (config.commonPasswordsList) {
      this.loadCommonPasswords(config.commonPasswordsList);
    }

    logger.info('PasswordService initialized', {
      bcryptRounds: this.#config.bcryptRounds,
      minLength: this.#config.minLength,
      minStrengthScore: this.#config.minStrengthScore
    });
  }

  /**
   * Hashes a password
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   * @throws {AppError} If hashing fails
   */
  async hashPassword(password) {
    const correlationId = this.generateCorrelationId();

    try {
      logger.debug('Hashing password', { correlationId });

      // Validate password before hashing
      if (!password || typeof password !== 'string') {
        throw new AppError(
          'Invalid password provided',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Generate salt and hash
      const salt = await bcrypt.genSalt(this.#config.bcryptRounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Track metrics
      this.trackPasswordOperation('hash', true);

      logger.debug('Password hashed successfully', { correlationId });

      return hashedPassword;

    } catch (error) {
      this.trackPasswordOperation('hash', false);

      logger.error('Password hashing failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to hash password',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Verifies a password against a hash
   * @param {string} password - Plain text password
   * @param {string} hash - Password hash
   * @returns {Promise<boolean>} True if password matches
   * @throws {AppError} If verification fails
   */
  async verifyPassword(password, hash) {
    const correlationId = this.generateCorrelationId();

    try {
      logger.debug('Verifying password', { correlationId });

      if (!password || !hash) {
        return false;
      }

      const isValid = await bcrypt.compare(password, hash);

      // Track metrics
      this.trackPasswordOperation('verify', true);

      return isValid;

    } catch (error) {
      this.trackPasswordOperation('verify', false);

      logger.error('Password verification failed', {
        correlationId,
        error: error.message
      });

      // Don't throw error for verification, just return false
      return false;
    }
  }

  /**
   * Validates password against policy
   * @param {string} password - Password to validate
   * @param {Object} [policy] - Override policy
   * @param {Object} [context] - Additional context (user info)
   * @returns {Promise<Object>} Validation result
   * @throws {AppError} If validation fails
   */
  async validatePasswordPolicy(password, policy = {}, context = {}) {
    const correlationId = context.correlationId || this.generateCorrelationId();

    try {
      logger.debug('Validating password policy', { correlationId });

      const effectivePolicy = { ...this.#config, ...policy };
      const errors = [];
      const warnings = [];

      // Basic validation
      if (!password || typeof password !== 'string') {
        errors.push('Password is required');
        return { valid: false, errors, warnings };
      }

      // Length validation
      if (password.length < effectivePolicy.minLength) {
        errors.push(`Password must be at least ${effectivePolicy.minLength} characters long`);
      }

      if (password.length > effectivePolicy.maxLength) {
        errors.push(`Password must not exceed ${effectivePolicy.maxLength} characters`);
      }

      // Character requirements
      if (effectivePolicy.requireUppercase && !PasswordService.#PASSWORD_PATTERNS.uppercase.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }

      if (effectivePolicy.requireLowercase && !PasswordService.#PASSWORD_PATTERNS.lowercase.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }

      if (effectivePolicy.requireNumbers && !PasswordService.#PASSWORD_PATTERNS.numbers.test(password)) {
        errors.push('Password must contain at least one number');
      }

      if (effectivePolicy.requireSpecial && !PasswordService.#PASSWORD_PATTERNS.special.test(password)) {
        errors.push('Password must contain at least one special character');
      }

      // Pattern checks
      if (effectivePolicy.preventRepeatingCharacters) {
        const repeatingMatch = password.match(PasswordService.#PASSWORD_PATTERNS.repeating);
        if (repeatingMatch && repeatingMatch[0].length > effectivePolicy.maxRepeatingCharacters) {
          errors.push(`Password must not contain more than ${effectivePolicy.maxRepeatingCharacters} repeating characters`);
        }
      }

      if (effectivePolicy.preventSequentialCharacters && PasswordService.#PASSWORD_PATTERNS.sequential.test(password)) {
        errors.push('Password must not contain sequential characters');
      }

      // Keyboard pattern check
      if (PasswordService.#PASSWORD_PATTERNS.keyboard.test(password.toLowerCase())) {
        errors.push('Password must not contain common keyboard patterns');
      }

      // Common password check
      if (effectivePolicy.preventCommonPasswords && this.isCommonPassword(password)) {
        errors.push('Password is too common');
      }

      // User info check
      if (effectivePolicy.preventUserInfo && context.user) {
        if (this.containsUserInfo(password, context.user)) {
          errors.push('Password must not contain personal information');
        }
      }

      // Strength check
      if (effectivePolicy.enablePasswordComplexityCheck) {
        const strength = await this.checkPasswordStrength(password);
        if (strength.score < effectivePolicy.minStrengthScore) {
          errors.push(`Password is too weak (strength: ${strength.score}/${4})`);
          if (strength.feedback) {
            warnings.push(...strength.feedback);
          }
        }
      }

      // Compromised password check
      if (effectivePolicy.enableCompromisedPasswordCheck) {
        const isCompromised = await this.checkCompromisedPassword(password);
        if (isCompromised) {
          errors.push('Password has been found in data breaches');
        }
      }

      const valid = errors.length === 0;

      // Track metrics
      this.trackPasswordOperation('validate', valid);

      logger.debug('Password validation completed', {
        correlationId,
        valid,
        errorCount: errors.length,
        warningCount: warnings.length
      });

      return {
        valid,
        errors,
        warnings,
        strength: effectivePolicy.enablePasswordComplexityCheck ? 
          await this.checkPasswordStrength(password) : null
      };

    } catch (error) {
      logger.error('Password validation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Password validation failed',
        500,
        ERROR_CODES.VALIDATION_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Generates a strong random password
   * @param {Object} [options] - Generation options
   * @param {number} [options.length=16] - Password length
   * @param {boolean} [options.includeUppercase=true] - Include uppercase letters
   * @param {boolean} [options.includeLowercase=true] - Include lowercase letters
   * @param {boolean} [options.includeNumbers=true] - Include numbers
   * @param {boolean} [options.includeSpecial=true] - Include special characters
   * @param {string} [options.excludeCharacters] - Characters to exclude
   * @returns {Promise<string>} Generated password
   */
  async generatePassword(options = {}) {
    try {
      const config = {
        length: options.length || 16,
        includeUppercase: options.includeUppercase !== false,
        includeLowercase: options.includeLowercase !== false,
        includeNumbers: options.includeNumbers !== false,
        includeSpecial: options.includeSpecial !== false,
        excludeCharacters: options.excludeCharacters || ''
      };

      let charset = '';
      let requiredChars = [];

      if (config.includeUppercase) {
        charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        requiredChars.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      }

      if (config.includeLowercase) {
        charset += 'abcdefghijklmnopqrstuvwxyz';
        requiredChars.push('abcdefghijklmnopqrstuvwxyz');
      }

      if (config.includeNumbers) {
        charset += '0123456789';
        requiredChars.push('0123456789');
      }

      if (config.includeSpecial) {
        charset += this.#config.specialCharacters;
        requiredChars.push(this.#config.specialCharacters);
      }

      // Remove excluded characters
      if (config.excludeCharacters) {
        for (const char of config.excludeCharacters) {
          charset = charset.replace(new RegExp(char, 'g'), '');
        }
      }

      if (charset.length === 0) {
        throw new AppError(
          'No characters available for password generation',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Generate password
      let password = '';
      
      // Ensure at least one character from each required set
      for (const chars of requiredChars) {
        const filteredChars = chars.split('').filter(c => !config.excludeCharacters.includes(c)).join('');
        if (filteredChars.length > 0) {
          password += filteredChars[crypto.randomInt(0, filteredChars.length)];
        }
      }

      // Fill remaining length
      while (password.length < config.length) {
        password += charset[crypto.randomInt(0, charset.length)];
      }

      // Shuffle password
      password = password.split('').sort(() => crypto.randomInt(0, 2) - 1).join('');

      logger.debug('Password generated', {
        length: password.length,
        options: config
      });

      return password;

    } catch (error) {
      logger.error('Password generation failed', {
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to generate password',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a temporary password
   * @param {Object} [options] - Generation options
   * @returns {Promise<Object>} Temporary password and expiry
   */
  async generateTemporaryPassword(options = {}) {
    try {
      const password = await this.generatePassword({
        length: 12,
        ...options
      });

      const expiresAt = new Date(Date.now() + this.#config.temporaryPasswordExpiry);

      return {
        password,
        expiresAt,
        mustChangeOnFirstLogin: true
      };

    } catch (error) {
      throw new AppError(
        'Failed to generate temporary password',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks password strength
   * @param {string} password - Password to check
   * @param {Object} [userInputs] - User-specific inputs for context
   * @returns {Promise<Object>} Strength assessment
   */
  async checkPasswordStrength(password, userInputs = []) {
    try {
      // Check cache first
      const cacheKey = `pwd_strength:${this.hashForCache(password)}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Use zxcvbn for strength assessment
      const result = zxcvbn(password, userInputs);

      const strength = {
        score: result.score, // 0-4
        guesses: result.guesses,
        guessesLog10: result.guesses_log10,
        crackTime: {
          onlineThrottling: result.crack_times_display.online_throttling_100_per_hour,
          onlineNoThrottling: result.crack_times_display.online_no_throttling_10_per_second,
          offlineSlow: result.crack_times_display.offline_slow_hashing_1e4_per_second,
          offlineFast: result.crack_times_display.offline_fast_hashing_1e10_per_second
        },
        feedback: result.feedback.suggestions || [],
        warning: result.feedback.warning || null,
        sequence: result.sequence
      };

      // Cache result
      await this.#cacheService.set(cacheKey, strength, this.#config.cacheTTL.passwordStrength);

      return strength;

    } catch (error) {
      logger.error('Password strength check failed', {
        error: error.message
      });

      // Return basic assessment on error
      return {
        score: 0,
        feedback: ['Unable to assess password strength'],
        warning: null
      };
    }
  }

  /**
   * Checks password history
   * @param {string} password - New password
   * @param {Array<Object>} passwordHistory - User's password history
   * @param {number} [limit] - History limit to check
   * @returns {Promise<boolean>} True if password was previously used
   */
  async checkPasswordHistory(password, passwordHistory = [], limit) {
    try {
      const historyLimit = limit || this.#config.passwordHistoryLimit;
      const recentPasswords = passwordHistory.slice(0, historyLimit);

      for (const historyEntry of recentPasswords) {
        const isMatch = await this.verifyPassword(password, historyEntry.password);
        if (isMatch) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Password history check failed', {
        error: error.message
      });

      throw new AppError(
        'Failed to check password history',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Hashes a token (for password reset tokens)
   * @param {string} token - Token to hash
   * @returns {Promise<string>} Hashed token
   */
  async hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Checks if password needs to be changed
   * @param {Object} user - User object
   * @returns {Object} Password change requirement info
   */
  checkPasswordExpiry(user) {
    const info = {
      requiresChange: false,
      isExpired: false,
      daysUntilExpiry: null,
      showWarning: false,
      lastChanged: user.passwordChangedAt
    };

    // Check if temporary password
    if (user.mustChangePassword) {
      info.requiresChange = true;
      info.reason = 'Temporary password must be changed';
      return info;
    }

    // Check password age
    if (this.#config.passwordExpiryDays && user.passwordChangedAt) {
      const daysSinceChange = Math.floor(
        (Date.now() - new Date(user.passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      info.daysUntilExpiry = this.#config.passwordExpiryDays - daysSinceChange;

      if (info.daysUntilExpiry <= 0) {
        info.requiresChange = true;
        info.isExpired = true;
        info.reason = 'Password has expired';
      } else if (info.daysUntilExpiry <= this.#config.passwordExpiryWarningDays) {
        info.showWarning = true;
        info.warningMessage = `Password will expire in ${info.daysUntilExpiry} days`;
      }
    }

    return info;
  }

  /**
   * Loads common passwords list
   */
  async loadCommonPasswords(source) {
    try {
      // This would load from file or external source
      logger.info('Loading common passwords list', { source });
    } catch (error) {
      logger.error('Failed to load common passwords', { error: error.message });
    }
  }

  /**
   * Checks if password is common
   */
  isCommonPassword(password) {
    const lowerPassword = password.toLowerCase();
    
    // Check exact match
    if (this.#commonPasswords.has(lowerPassword)) {
      return true;
    }

    // Check variations
    const variations = [
      password,
      lowerPassword,
      password.charAt(0).toUpperCase() + password.slice(1).toLowerCase()
    ];

    for (const variation of variations) {
      if (this.#commonPasswords.has(variation)) {
        return true;
      }
    }

    // Check if it contains common passwords
    for (const common of this.#commonPasswords) {
      if (lowerPassword.includes(common) && common.length > 4) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if password contains user info
   */
  containsUserInfo(password, user) {
    const lowerPassword = password.toLowerCase();
    const userFields = [
      user.email?.split('@')[0],
      user.firstName,
      user.lastName,
      user.username,
      user.organizationName
    ].filter(Boolean).map(field => field.toLowerCase());

    for (const field of userFields) {
      if (field.length > 2 && lowerPassword.includes(field)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if password is compromised
   */
  async checkCompromisedPassword(password) {
    try {
      // Check cache first
      const cacheKey = `pwd_compromised:${this.hashForCache(password)}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached !== null) {
        return cached;
      }

      // In production, integrate with HaveIBeenPwned API or similar
      // For now, just check against extended common passwords
      const isCompromised = this.isCommonPassword(password);

      // Cache result
      await this.#cacheService.set(cacheKey, isCompromised, this.#config.cacheTTL.compromisedCheck);

      return isCompromised;

    } catch (error) {
      logger.error('Compromised password check failed', {
        error: error.message
      });

      // On error, don't block but log
      return false;
    }
  }

  /**
   * Creates hash for cache key
   */
  hashForCache(password) {
    return crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Tracks password operation
   */
  trackPasswordOperation(operation, success) {
    const key = `${operation}:${success ? 'success' : 'failure'}`;
    const current = this.#passwordMetrics.get(key) || 0;
    this.#passwordMetrics.set(key, current + 1);
  }

  /**
   * Generates correlation ID
   */
  generateCorrelationId() {
    return `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const metrics = {};
    this.#passwordMetrics.forEach((value, key) => {
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
      // Test basic operations
      const testPassword = 'TestP@ssw0rd123!';
      const hash = await this.hashPassword(testPassword);
      const verified = await this.verifyPassword(testPassword, hash);

      return {
        healthy: verified,
        service: 'PasswordService',
        metrics: this.getMetrics(),
        config: {
          bcryptRounds: this.#config.bcryptRounds,
          minLength: this.#config.minLength
        }
      };
    } catch (error) {
      logger.error('Password service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'PasswordService',
        error: error.message
      };
    }
  }
}

module.exports = PasswordService;