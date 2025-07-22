'use strict';

/**
 * @fileoverview Secure password hashing service with multiple algorithm support
 * @module shared/lib/security/encryption/hash-service
 * @requires crypto
 * @requires bcrypt
 * @requires argon2
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const argon2 = require('argon2');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class HashService
 * @description Provides secure password hashing with bcrypt, argon2, and PBKDF2 support
 */
class HashService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #ALGORITHMS = {
    BCRYPT: 'bcrypt',
    ARGON2: 'argon2',
    PBKDF2: 'pbkdf2',
    SCRYPT: 'scrypt'
  };

  static #DEFAULT_OPTIONS = {
    bcrypt: {
      rounds: 12
    },
    argon2: {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      hashLength: 32
    },
    pbkdf2: {
      iterations: 100000,
      keyLength: 64,
      digest: 'sha256'
    },
    scrypt: {
      N: 16384,
      r: 8,
      p: 1,
      keyLength: 64
    }
  };

  static #HASH_FORMATS = {
    bcrypt: /^\$2[aby]\$\d{2}\$/,
    argon2: /^\$argon2(i|d|id)\$/,
    pbkdf2: /^pbkdf2\$/,
    scrypt: /^scrypt\$/
  };

  static #MIN_PASSWORD_LENGTH = 8;
  static #MAX_PASSWORD_LENGTH = 128;

  /**
   * Creates an instance of HashService
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.defaultAlgorithm='argon2'] - Default hashing algorithm
   * @param {Object} [options.bcryptOptions] - Bcrypt-specific options
   * @param {Object} [options.argon2Options] - Argon2-specific options
   * @param {Object} [options.pbkdf2Options] - PBKDF2-specific options
   * @param {Object} [options.scryptOptions] - Scrypt-specific options
   * @param {boolean} [options.enforceStrength=true] - Enforce password strength
   */
  constructor(options = {}) {
    const {
      defaultAlgorithm = HashService.#ALGORITHMS.ARGON2,
      bcryptOptions = {},
      argon2Options = {},
      pbkdf2Options = {},
      scryptOptions = {},
      enforceStrength = true
    } = options;

    this.defaultAlgorithm = defaultAlgorithm;
    this.enforceStrength = enforceStrength;

    // Merge options with defaults
    this.options = {
      bcrypt: { ...HashService.#DEFAULT_OPTIONS.bcrypt, ...bcryptOptions },
      argon2: { ...HashService.#DEFAULT_OPTIONS.argon2, ...argon2Options },
      pbkdf2: { ...HashService.#DEFAULT_OPTIONS.pbkdf2, ...pbkdf2Options },
      scrypt: { ...HashService.#DEFAULT_OPTIONS.scrypt, ...scryptOptions }
    };

    // Validate default algorithm
    if (!Object.values(HashService.#ALGORITHMS).includes(defaultAlgorithm)) {
      throw new AppError('Invalid hashing algorithm', 400, 'INVALID_ALGORITHM');
    }

    logger.info('HashService initialized', { 
      defaultAlgorithm,
      enforceStrength 
    });
  }

  /**
   * Hashes a password using the configured algorithm
   * @param {string} password - Password to hash
   * @param {Object} [options={}] - Hashing options
   * @param {string} [options.algorithm] - Override default algorithm
   * @param {Object} [options.algorithmOptions] - Algorithm-specific options
   * @returns {Promise<string>} Hashed password
   * @throws {AppError} If hashing fails
   */
  async hash(password, options = {}) {
    try {
      // Validate password
      this.#validatePassword(password);

      const algorithm = options.algorithm || this.defaultAlgorithm;
      const algorithmOptions = {
        ...this.options[algorithm],
        ...options.algorithmOptions
      };

      let hashedPassword;

      switch (algorithm) {
        case HashService.#ALGORITHMS.BCRYPT:
          hashedPassword = await this.#hashWithBcrypt(password, algorithmOptions);
          break;

        case HashService.#ALGORITHMS.ARGON2:
          hashedPassword = await this.#hashWithArgon2(password, algorithmOptions);
          break;

        case HashService.#ALGORITHMS.PBKDF2:
          hashedPassword = await this.#hashWithPBKDF2(password, algorithmOptions);
          break;

        case HashService.#ALGORITHMS.SCRYPT:
          hashedPassword = await this.#hashWithScrypt(password, algorithmOptions);
          break;

        default:
          throw new AppError('Unsupported algorithm', 400, 'UNSUPPORTED_ALGORITHM');
      }

      logger.debug('Password hashed successfully', { algorithm });

      return hashedPassword;

    } catch (error) {
      logger.error('Password hashing failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to hash password',
        500,
        'HASHING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifies a password against a hash
   * @param {string} password - Password to verify
   * @param {string} hash - Hash to verify against
   * @returns {Promise<boolean>} True if password matches
   * @throws {AppError} If verification fails
   */
  async verify(password, hash) {
    try {
      // Validate inputs
      if (!password || typeof password !== 'string') {
        throw new AppError('Invalid password', 400, 'INVALID_PASSWORD');
      }

      if (!hash || typeof hash !== 'string') {
        throw new AppError('Invalid hash', 400, 'INVALID_HASH');
      }

      // Detect hash algorithm
      const algorithm = this.#detectAlgorithm(hash);

      let isValid;

      switch (algorithm) {
        case HashService.#ALGORITHMS.BCRYPT:
          isValid = await bcrypt.compare(password, hash);
          break;

        case HashService.#ALGORITHMS.ARGON2:
          isValid = await argon2.verify(hash, password);
          break;

        case HashService.#ALGORITHMS.PBKDF2:
          isValid = await this.#verifyPBKDF2(password, hash);
          break;

        case HashService.#ALGORITHMS.SCRYPT:
          isValid = await this.#verifyScrypt(password, hash);
          break;

        default:
          throw new AppError('Unknown hash format', 400, 'UNKNOWN_HASH_FORMAT');
      }

      logger.debug('Password verification completed', { algorithm, isValid });

      return isValid;

    } catch (error) {
      logger.error('Password verification failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to verify password',
        500,
        'VERIFICATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if a hash needs rehashing (algorithm or parameters changed)
   * @param {string} hash - Hash to check
   * @param {Object} [options={}] - Current hashing options
   * @returns {boolean} True if rehashing needed
   */
  needsRehash(hash, options = {}) {
    try {
      const algorithm = options.algorithm || this.defaultAlgorithm;
      const currentAlgorithm = this.#detectAlgorithm(hash);

      // Different algorithm
      if (currentAlgorithm !== algorithm) {
        return true;
      }

      // Check algorithm-specific parameters
      switch (currentAlgorithm) {
        case HashService.#ALGORITHMS.BCRYPT:
          return this.#needsRehashBcrypt(hash, this.options.bcrypt);

        case HashService.#ALGORITHMS.ARGON2:
          return argon2.needsRehash(hash, this.options.argon2);

        case HashService.#ALGORITHMS.PBKDF2:
          return this.#needsRehashPBKDF2(hash, this.options.pbkdf2);

        case HashService.#ALGORITHMS.SCRYPT:
          return this.#needsRehashScrypt(hash, this.options.scrypt);

        default:
          return true;
      }

    } catch (error) {
      logger.error('Rehash check failed', error);
      return true; // Safer to rehash on error
    }
  }

  /**
   * Generates a secure random salt
   * @param {number} [length=32] - Salt length in bytes
   * @returns {string} Hex-encoded salt
   */
  generateSalt(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validates password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with strength score
   */
  validatePasswordStrength(password) {
    const result = {
      isValid: true,
      score: 0,
      issues: [],
      suggestions: []
    };

    // Length check
    if (password.length < HashService.#MIN_PASSWORD_LENGTH) {
      result.isValid = false;
      result.issues.push(`Password must be at least ${HashService.#MIN_PASSWORD_LENGTH} characters`);
    } else if (password.length < 12) {
      result.score += 1;
    } else if (password.length < 16) {
      result.score += 2;
    } else {
      result.score += 3;
    }

    // Character variety checks
    const checks = {
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      numbers: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };

    const varietyCount = Object.values(checks).filter(Boolean).length;
    result.score += varietyCount;

    // Provide feedback
    if (!checks.lowercase) {
      result.suggestions.push('Add lowercase letters');
    }
    if (!checks.uppercase) {
      result.suggestions.push('Add uppercase letters');
    }
    if (!checks.numbers) {
      result.suggestions.push('Add numbers');
    }
    if (!checks.special) {
      result.suggestions.push('Add special characters');
    }

    // Common patterns check
    const commonPatterns = [
      /^(.)\1+$/,           // All same character
      /^(01|12|23|34|45|56|67|78|89)+$/,  // Sequential numbers
      /^(abc|qwerty|asdf)/i,  // Keyboard patterns
      /password/i,          // Contains "password"
      /^[0-9]+$/,          // Numbers only
      /^[a-zA-Z]+$/        // Letters only
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        result.score -= 2;
        result.issues.push('Password contains common patterns');
        break;
      }
    }

    // Calculate strength level
    if (result.score < 3) {
      result.strength = 'weak';
    } else if (result.score < 5) {
      result.strength = 'fair';
    } else if (result.score < 7) {
      result.strength = 'good';
    } else {
      result.strength = 'strong';
    }

    // Enforce minimum strength if configured
    if (this.enforceStrength && result.strength === 'weak') {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Creates a password policy validator
   * @param {Object} policy - Password policy rules
   * @returns {Function} Validator function
   */
  createPasswordPolicy(policy) {
    const {
      minLength = 8,
      maxLength = 128,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecial = true,
      prohibitedWords = [],
      maxRepeating = 3,
      minStrength = 'fair'
    } = policy;

    return (password) => {
      const errors = [];

      // Length
      if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters`);
      }
      if (password.length > maxLength) {
        errors.push(`Password must not exceed ${maxLength} characters`);
      }

      // Required character types
      if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain uppercase letters');
      }
      if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain lowercase letters');
      }
      if (requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain numbers');
      }
      if (requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
        errors.push('Password must contain special characters');
      }

      // Prohibited words
      const lowerPassword = password.toLowerCase();
      for (const word of prohibitedWords) {
        if (lowerPassword.includes(word.toLowerCase())) {
          errors.push(`Password cannot contain "${word}"`);
        }
      }

      // Repeating characters
      const repeatingRegex = new RegExp(`(.)\\1{${maxRepeating},}`);
      if (repeatingRegex.test(password)) {
        errors.push(`Password cannot have more than ${maxRepeating} repeating characters`);
      }

      // Strength check
      const strength = this.validatePasswordStrength(password);
      const strengthLevels = ['weak', 'fair', 'good', 'strong'];
      const requiredLevel = strengthLevels.indexOf(minStrength);
      const actualLevel = strengthLevels.indexOf(strength.strength);

      if (actualLevel < requiredLevel) {
        errors.push(`Password strength must be at least ${minStrength}`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        strength: strength.strength
      };
    };
  }

  /**
   * Hashes with bcrypt
   * @private
   * @param {string} password - Password to hash
   * @param {Object} options - Bcrypt options
   * @returns {Promise<string>} Hashed password
   */
  async #hashWithBcrypt(password, options) {
    const salt = await bcrypt.genSalt(options.rounds);
    return bcrypt.hash(password, salt);
  }

  /**
   * Hashes with Argon2
   * @private
   * @param {string} password - Password to hash
   * @param {Object} options - Argon2 options
   * @returns {Promise<string>} Hashed password
   */
  async #hashWithArgon2(password, options) {
    return argon2.hash(password, options);
  }

  /**
   * Hashes with PBKDF2
   * @private
   * @param {string} password - Password to hash
   * @param {Object} options - PBKDF2 options
   * @returns {Promise<string>} Hashed password
   */
  async #hashWithPBKDF2(password, options) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(32);
      
      crypto.pbkdf2(
        password,
        salt,
        options.iterations,
        options.keyLength,
        options.digest,
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }

          const hash = [
            'pbkdf2',
            options.digest,
            options.iterations,
            salt.toString('base64'),
            derivedKey.toString('base64')
          ].join('$');

          resolve(hash);
        }
      );
    });
  }

  /**
   * Hashes with scrypt
   * @private
   * @param {string} password - Password to hash
   * @param {Object} options - Scrypt options
   * @returns {Promise<string>} Hashed password
   */
  async #hashWithScrypt(password, options) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(32);
      
      crypto.scrypt(
        password,
        salt,
        options.keyLength,
        {
          N: options.N,
          r: options.r,
          p: options.p
        },
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }

          const hash = [
            'scrypt',
            options.N,
            options.r,
            options.p,
            salt.toString('base64'),
            derivedKey.toString('base64')
          ].join('$');

          resolve(hash);
        }
      );
    });
  }

  /**
   * Verifies PBKDF2 hash
   * @private
   * @param {string} password - Password to verify
   * @param {string} hash - Hash to verify against
   * @returns {Promise<boolean>} Verification result
   */
  async #verifyPBKDF2(password, hash) {
    return new Promise((resolve, reject) => {
      const [, digest, iterations, salt, key] = hash.split('$');
      
      crypto.pbkdf2(
        password,
        Buffer.from(salt, 'base64'),
        parseInt(iterations),
        Buffer.from(key, 'base64').length,
        digest,
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(
            crypto.timingSafeEqual(
              Buffer.from(key, 'base64'),
              derivedKey
            )
          );
        }
      );
    });
  }

  /**
   * Verifies scrypt hash
   * @private
   * @param {string} password - Password to verify
   * @param {string} hash - Hash to verify against
   * @returns {Promise<boolean>} Verification result
   */
  async #verifyScrypt(password, hash) {
    return new Promise((resolve, reject) => {
      const [, N, r, p, salt, key] = hash.split('$');
      
      crypto.scrypt(
        password,
        Buffer.from(salt, 'base64'),
        Buffer.from(key, 'base64').length,
        {
          N: parseInt(N),
          r: parseInt(r),
          p: parseInt(p)
        },
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(
            crypto.timingSafeEqual(
              Buffer.from(key, 'base64'),
              derivedKey
            )
          );
        }
      );
    });
  }

  /**
   * Detects hash algorithm from hash format
   * @private
   * @param {string} hash - Hash to analyze
   * @returns {string} Detected algorithm
   */
  #detectAlgorithm(hash) {
    if (HashService.#HASH_FORMATS.bcrypt.test(hash)) {
      return HashService.#ALGORITHMS.BCRYPT;
    }
    if (HashService.#HASH_FORMATS.argon2.test(hash)) {
      return HashService.#ALGORITHMS.ARGON2;
    }
    if (hash.startsWith('pbkdf2$')) {
      return HashService.#ALGORITHMS.PBKDF2;
    }
    if (hash.startsWith('scrypt$')) {
      return HashService.#ALGORITHMS.SCRYPT;
    }
    return null;
  }

  /**
   * Checks if bcrypt hash needs rehashing
   * @private
   * @param {string} hash - Hash to check
   * @param {Object} options - Current bcrypt options
   * @returns {boolean} True if needs rehash
   */
  #needsRehashBcrypt(hash, options) {
    const rounds = parseInt(hash.split('$')[2]);
    return rounds < options.rounds;
  }

  /**
   * Checks if PBKDF2 hash needs rehashing
   * @private
   * @param {string} hash - Hash to check
   * @param {Object} options - Current PBKDF2 options
   * @returns {boolean} True if needs rehash
   */
  #needsRehashPBKDF2(hash, options) {
    const [, digest, iterations] = hash.split('$');
    return digest !== options.digest || parseInt(iterations) < options.iterations;
  }

  /**
   * Checks if scrypt hash needs rehashing
   * @private
   * @param {string} hash - Hash to check
   * @param {Object} options - Current scrypt options
   * @returns {boolean} True if needs rehash
   */
  #needsRehashScrypt(hash, options) {
    const [, N, r, p] = hash.split('$');
    return parseInt(N) < options.N || 
           parseInt(r) < options.r || 
           parseInt(p) < options.p;
  }

  /**
   * Validates password
   * @private
   * @param {string} password - Password to validate
   * @throws {AppError} If password is invalid
   */
  #validatePassword(password) {
    if (!password || typeof password !== 'string') {
      throw new AppError('Invalid password', 400, 'INVALID_PASSWORD');
    }

    if (password.length < HashService.#MIN_PASSWORD_LENGTH) {
      throw new AppError(
        `Password too short (minimum ${HashService.#MIN_PASSWORD_LENGTH} characters)`,
        400,
        'PASSWORD_TOO_SHORT'
      );
    }

    if (password.length > HashService.#MAX_PASSWORD_LENGTH) {
      throw new AppError(
        `Password too long (maximum ${HashService.#MAX_PASSWORD_LENGTH} characters)`,
        400,
        'PASSWORD_TOO_LONG'
      );
    }

    if (this.enforceStrength) {
      const strength = this.validatePasswordStrength(password);
      if (!strength.isValid) {
        throw new AppError(
          'Password does not meet strength requirements',
          400,
          'WEAK_PASSWORD',
          { issues: strength.issues }
        );
      }
    }
  }
}

module.exports = HashService;