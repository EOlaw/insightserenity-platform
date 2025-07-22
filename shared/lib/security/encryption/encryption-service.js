'use strict';

/**
 * @fileoverview Advanced encryption service with multiple algorithm support
 * @module shared/lib/security/encryption/encryption-service
 * @requires crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class EncryptionService
 * @description Provides comprehensive encryption and decryption capabilities with support for multiple algorithms
 */
class EncryptionService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #ALGORITHMS = {
    AES_256_GCM: 'aes-256-gcm',
    AES_256_CBC: 'aes-256-cbc',
    AES_192_GCM: 'aes-192-gcm',
    AES_128_GCM: 'aes-128-gcm',
    CHACHA20_POLY1305: 'chacha20-poly1305'
  };

  static #KEY_LENGTHS = {
    'aes-256-gcm': 32,
    'aes-256-cbc': 32,
    'aes-192-gcm': 24,
    'aes-128-gcm': 16,
    'chacha20-poly1305': 32
  };

  static #IV_LENGTHS = {
    'aes-256-gcm': 16,
    'aes-256-cbc': 16,
    'aes-192-gcm': 16,
    'aes-128-gcm': 16,
    'chacha20-poly1305': 12
  };

  static #TAG_LENGTH = 16;
  static #SALT_LENGTH = 32;
  static #ITERATIONS = 100000;

  /**
   * Creates an instance of EncryptionService
   * @constructor
   * @param {Object} options - Configuration options
   * @param {string} [options.algorithm='aes-256-gcm'] - Encryption algorithm
   * @param {Buffer|string} [options.key] - Encryption key
   * @param {string} [options.keyDerivation='pbkdf2'] - Key derivation method
   * @param {number} [options.iterations=100000] - PBKDF2 iterations
   * @param {boolean} [options.rotateKeys=false] - Enable key rotation
   * @throws {AppError} If invalid configuration provided
   */
  constructor(options = {}) {
    const {
      algorithm = EncryptionService.#ALGORITHMS.AES_256_GCM,
      key,
      keyDerivation = 'pbkdf2',
      iterations = EncryptionService.#ITERATIONS,
      rotateKeys = false
    } = options;

    this.algorithm = algorithm;
    this.keyDerivation = keyDerivation;
    this.iterations = iterations;
    this.rotateKeys = rotateKeys;
    
    // Validate algorithm
    if (!Object.values(EncryptionService.#ALGORITHMS).includes(algorithm)) {
      throw new AppError('Invalid encryption algorithm', 400, 'INVALID_ALGORITHM');
    }

    // Set or generate key
    if (key) {
      this.key = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
      this.#validateKey();
    } else {
      this.key = this.generateKey();
    }

    // Initialize key rotation if enabled
    if (rotateKeys) {
      this.keyRotationInterval = null;
      this.keyHistory = new Map();
      this.currentKeyId = crypto.randomBytes(16).toString('hex');
      this.keyHistory.set(this.currentKeyId, this.key);
    }

    logger.info('EncryptionService initialized', { 
      algorithm, 
      keyDerivation,
      rotateKeys 
    });
  }

  /**
   * Encrypts data using configured algorithm
   * @param {string|Buffer|Object} data - Data to encrypt
   * @param {Object} [options={}] - Encryption options
   * @param {Buffer} [options.aad] - Additional authenticated data
   * @param {string} [options.encoding='utf8'] - Input encoding
   * @param {boolean} [options.compress=false] - Compress before encryption
   * @returns {Object} Encrypted data object
   * @throws {AppError} If encryption fails
   */
  encrypt(data, options = {}) {
    try {
      const { 
        aad, 
        encoding = 'utf8',
        compress = false 
      } = options;

      // Convert data to buffer
      let inputBuffer;
      if (Buffer.isBuffer(data)) {
        inputBuffer = data;
      } else if (typeof data === 'object') {
        inputBuffer = Buffer.from(JSON.stringify(data), encoding);
      } else {
        inputBuffer = Buffer.from(String(data), encoding);
      }

      // Compress if requested
      if (compress) {
        const zlib = require('zlib');
        inputBuffer = zlib.deflateSync(inputBuffer);
      }

      // Generate IV
      const ivLength = EncryptionService.#IV_LENGTHS[this.algorithm];
      const iv = crypto.randomBytes(ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Add AAD if provided and supported
      if (aad && this.#supportsAAD()) {
        cipher.setAAD(aad);
      }

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(inputBuffer),
        cipher.final()
      ]);

      // Build result object
      const result = {
        algorithm: this.algorithm,
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
        compressed: compress
      };

      // Add auth tag for authenticated encryption modes
      if (this.#supportsAuthTag()) {
        result.tag = cipher.getAuthTag().toString('hex');
      }

      // Add key ID if key rotation is enabled
      if (this.rotateKeys) {
        result.keyId = this.currentKeyId;
      }

      // Add timestamp for audit
      result.timestamp = new Date().toISOString();

      logger.debug('Data encrypted successfully', { 
        algorithm: this.algorithm,
        dataSize: inputBuffer.length,
        compressed: compress
      });

      return result;

    } catch (error) {
      logger.error('Encryption failed', error);
      throw new AppError(
        'Failed to encrypt data',
        500,
        'ENCRYPTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Decrypts data encrypted by this service
   * @param {Object} encryptedObject - Encrypted data object
   * @param {Object} [options={}] - Decryption options
   * @param {Buffer} [options.aad] - Additional authenticated data
   * @param {string} [options.outputEncoding='utf8'] - Output encoding
   * @returns {string|Buffer|Object} Decrypted data
   * @throws {AppError} If decryption fails
   */
  decrypt(encryptedObject, options = {}) {
    try {
      const { 
        aad, 
        outputEncoding = 'utf8' 
      } = options;

      // Validate encrypted object
      this.#validateEncryptedObject(encryptedObject);

      const { 
        algorithm, 
        iv, 
        data, 
        tag, 
        compressed, 
        keyId 
      } = encryptedObject;

      // Check algorithm compatibility
      if (algorithm !== this.algorithm) {
        throw new AppError(
          'Algorithm mismatch',
          400,
          'ALGORITHM_MISMATCH',
          { expected: this.algorithm, received: algorithm }
        );
      }

      // Get decryption key
      let decryptionKey = this.key;
      if (keyId && this.rotateKeys) {
        decryptionKey = this.keyHistory.get(keyId);
        if (!decryptionKey) {
          throw new AppError('Key not found', 404, 'KEY_NOT_FOUND');
        }
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(
        algorithm,
        decryptionKey,
        Buffer.from(iv, 'hex')
      );

      // Set auth tag if supported
      if (tag && this.#supportsAuthTag()) {
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
      }

      // Add AAD if provided and supported
      if (aad && this.#supportsAAD()) {
        decipher.setAAD(aad);
      }

      // Decrypt data
      let decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'hex')),
        decipher.final()
      ]);

      // Decompress if needed
      if (compressed) {
        const zlib = require('zlib');
        decrypted = zlib.inflateSync(decrypted);
      }

      // Convert to appropriate output format
      const output = outputEncoding === 'buffer' 
        ? decrypted 
        : decrypted.toString(outputEncoding);

      // Try to parse JSON if possible
      if (outputEncoding !== 'buffer') {
        try {
          return JSON.parse(output);
        } catch {
          return output;
        }
      }

      logger.debug('Data decrypted successfully', { algorithm });

      return output;

    } catch (error) {
      logger.error('Decryption failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to decrypt data',
        500,
        'DECRYPTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Encrypts a field for database storage
   * @param {*} value - Value to encrypt
   * @param {string} [fieldName] - Field name for context
   * @returns {Object} Encrypted field object
   */
  encryptField(value, fieldName) {
    if (value === null || value === undefined) {
      return null;
    }

    const encrypted = this.encrypt(value, { compress: false });
    
    return {
      _encrypted: true,
      _algorithm: encrypted.algorithm,
      _field: fieldName,
      value: encrypted.data,
      iv: encrypted.iv,
      tag: encrypted.tag,
      keyId: encrypted.keyId
    };
  }

  /**
   * Decrypts a field from database storage
   * @param {Object} encryptedField - Encrypted field object
   * @returns {*} Decrypted value
   */
  decryptField(encryptedField) {
    if (!encryptedField || !encryptedField._encrypted) {
      return encryptedField;
    }

    return this.decrypt({
      algorithm: encryptedField._algorithm || this.algorithm,
      data: encryptedField.value,
      iv: encryptedField.iv,
      tag: encryptedField.tag,
      keyId: encryptedField.keyId
    });
  }

  /**
   * Generates a new encryption key
   * @param {string} [algorithm] - Algorithm to generate key for
   * @returns {Buffer} Generated key
   */
  generateKey(algorithm) {
    const algo = algorithm || this.algorithm;
    const keyLength = EncryptionService.#KEY_LENGTHS[algo];
    
    if (!keyLength) {
      throw new AppError('Unknown algorithm', 400, 'UNKNOWN_ALGORITHM');
    }

    return crypto.randomBytes(keyLength);
  }

  /**
   * Derives a key from password using PBKDF2
   * @param {string} password - Password to derive from
   * @param {Buffer|string} [salt] - Salt for derivation
   * @param {Object} [options={}] - Derivation options
   * @returns {Object} Derived key and salt
   */
  deriveKey(password, salt, options = {}) {
    const {
      iterations = this.iterations,
      keyLength = EncryptionService.#KEY_LENGTHS[this.algorithm],
      digest = 'sha256'
    } = options;

    const saltBuffer = salt 
      ? (typeof salt === 'string' ? Buffer.from(salt, 'hex') : salt)
      : crypto.randomBytes(EncryptionService.#SALT_LENGTH);

    const derivedKey = crypto.pbkdf2Sync(
      password,
      saltBuffer,
      iterations,
      keyLength,
      digest
    );

    return {
      key: derivedKey,
      salt: saltBuffer.toString('hex'),
      iterations,
      digest
    };
  }

  /**
   * Rotates encryption key
   * @returns {Object} New key information
   */
  rotateKey() {
    if (!this.rotateKeys) {
      throw new AppError('Key rotation not enabled', 400, 'ROTATION_DISABLED');
    }

    const newKey = this.generateKey();
    const newKeyId = crypto.randomBytes(16).toString('hex');

    // Store old key in history
    this.keyHistory.set(this.currentKeyId, this.key);

    // Update current key
    this.key = newKey;
    this.currentKeyId = newKeyId;
    this.keyHistory.set(newKeyId, newKey);

    // Limit key history size
    if (this.keyHistory.size > 10) {
      const oldestKey = this.keyHistory.keys().next().value;
      this.keyHistory.delete(oldestKey);
    }

    logger.info('Encryption key rotated', { 
      newKeyId,
      historySize: this.keyHistory.size 
    });

    return {
      keyId: newKeyId,
      rotatedAt: new Date().toISOString()
    };
  }

  /**
   * Encrypts data for URL-safe transmission
   * @param {*} data - Data to encrypt
   * @returns {string} URL-safe encrypted string
   */
  encryptForUrl(data) {
    const encrypted = this.encrypt(data, { compress: true });
    const combined = JSON.stringify(encrypted);
    return Buffer.from(combined).toString('base64url');
  }

  /**
   * Decrypts URL-safe encrypted data
   * @param {string} urlSafeData - URL-safe encrypted string
   * @returns {*} Decrypted data
   */
  decryptFromUrl(urlSafeData) {
    const combined = Buffer.from(urlSafeData, 'base64url').toString();
    const encrypted = JSON.parse(combined);
    return this.decrypt(encrypted);
  }

  /**
   * Creates a secure token
   * @param {Object} payload - Token payload
   * @param {number} [expiresIn] - Expiration time in seconds
   * @returns {Object} Secure token
   */
  createSecureToken(payload, expiresIn) {
    const tokenData = {
      payload,
      issued: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    if (expiresIn) {
      tokenData.expires = Date.now() + (expiresIn * 1000);
    }

    const encrypted = this.encrypt(tokenData);
    const token = Buffer.from(JSON.stringify(encrypted)).toString('base64url');

    return {
      token,
      expires: tokenData.expires,
      tokenId: tokenData.nonce
    };
  }

  /**
   * Verifies and decrypts a secure token
   * @param {string} token - Token to verify
   * @returns {Object} Token payload
   * @throws {AppError} If token is invalid or expired
   */
  verifySecureToken(token) {
    try {
      const encrypted = JSON.parse(Buffer.from(token, 'base64url').toString());
      const tokenData = this.decrypt(encrypted);

      // Check expiration
      if (tokenData.expires && Date.now() > tokenData.expires) {
        throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
      }

      return {
        payload: tokenData.payload,
        issued: tokenData.issued,
        expires: tokenData.expires,
        tokenId: tokenData.nonce
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
  }

  /**
   * Validates encryption key
   * @private
   * @throws {AppError} If key is invalid
   */
  #validateKey() {
    const expectedLength = EncryptionService.#KEY_LENGTHS[this.algorithm];
    
    if (!this.key || this.key.length !== expectedLength) {
      throw new AppError(
        'Invalid key length',
        400,
        'INVALID_KEY_LENGTH',
        { expected: expectedLength, received: this.key?.length }
      );
    }
  }

  /**
   * Validates encrypted object structure
   * @private
   * @param {Object} obj - Object to validate
   * @throws {AppError} If object is invalid
   */
  #validateEncryptedObject(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new AppError('Invalid encrypted object', 400, 'INVALID_ENCRYPTED_OBJECT');
    }

    const required = ['algorithm', 'iv', 'data'];
    for (const field of required) {
      if (!obj[field]) {
        throw new AppError(
          `Missing required field: ${field}`,
          400,
          'MISSING_FIELD'
        );
      }
    }
  }

  /**
   * Checks if algorithm supports authenticated encryption
   * @private
   * @returns {boolean} True if supports auth tag
   */
  #supportsAuthTag() {
    return this.algorithm.includes('gcm') || 
           this.algorithm.includes('chacha20-poly1305');
  }

  /**
   * Checks if algorithm supports AAD
   * @private
   * @returns {boolean} True if supports AAD
   */
  #supportsAAD() {
    return this.#supportsAuthTag();
  }

  /**
   * Gets algorithm information
   * @returns {Object} Algorithm details
   */
  getAlgorithmInfo() {
    return {
      algorithm: this.algorithm,
      keyLength: EncryptionService.#KEY_LENGTHS[this.algorithm],
      ivLength: EncryptionService.#IV_LENGTHS[this.algorithm],
      supportsAuthTag: this.#supportsAuthTag(),
      supportsAAD: this.#supportsAAD()
    };
  }

  /**
   * Starts automatic key rotation
   * @param {number} intervalHours - Rotation interval in hours
   */
  startKeyRotation(intervalHours = 24) {
    if (!this.rotateKeys) {
      throw new AppError('Key rotation not enabled', 400, 'ROTATION_DISABLED');
    }

    this.stopKeyRotation();
    
    this.keyRotationInterval = setInterval(() => {
      this.rotateKey();
    }, intervalHours * 60 * 60 * 1000);

    logger.info('Key rotation started', { intervalHours });
  }

  /**
   * Stops automatic key rotation
   */
  stopKeyRotation() {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
      this.keyRotationInterval = null;
      logger.info('Key rotation stopped');
    }
  }

  /**
   * Exports encryption configuration
   * @returns {Object} Safe configuration export
   */
  exportConfig() {
    return {
      algorithm: this.algorithm,
      keyDerivation: this.keyDerivation,
      iterations: this.iterations,
      rotateKeys: this.rotateKeys,
      currentKeyId: this.currentKeyId,
      keyHistorySize: this.keyHistory?.size || 0
    };
  }
}

module.exports = EncryptionService;