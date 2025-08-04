'use strict';

/**
 * @fileoverview Encryption Helper for secure data encryption and decryption
 * @module shared/lib/utils/helpers/encryption-helper
 * @requires crypto
 * @requires module:shared/lib/utils/logger
 */

const crypto = require('crypto');
const logger = require('../logger');

/**
 * Encryption Helper class for handling symmetric encryption using AES-256-GCM
 * Provides secure encryption and decryption of sensitive data with proper key derivation
 */
class EncryptionHelper {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'aes-256-gcm';
    this.keyDerivation = options.keyDerivation || 'pbkdf2';
    this.keyLength = 32; // 256 bits for AES-256
    this.ivLength = 16; // 128 bits for GCM mode
    this.tagLength = 16; // 128 bits for authentication tag
    this.saltLength = 32; // 256 bits for key derivation salt
    this.iterations = options.iterations || 100000; // PBKDF2 iterations
    
    // Get encryption key from environment or use development default
    this.masterKey = process.env.ENCRYPTION_KEY || 'dev-key-not-secure-change-in-production';
    
    if (this.masterKey === 'dev-key-not-secure-change-in-production' && process.env.NODE_ENV === 'production') {
      logger.warn('Using development encryption key in production - THIS IS NOT SECURE', {
        service: 'encryption-helper',
        environment: process.env.NODE_ENV
      });
    }
    
    logger.debug('EncryptionHelper initialized', {
      algorithm: this.algorithm,
      keyDerivation: this.keyDerivation,
      keyLength: this.keyLength,
      iterations: this.iterations
    });
  }

  /**
   * Derives an encryption key from the master key using PBKDF2
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Buffer} Derived encryption key
   * @private
   */
  _deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keyLength, 'sha256');
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM
   * @param {string} plaintext - The data to encrypt
   * @returns {Promise<string>} Base64 encoded encrypted data with salt, IV, and auth tag
   * @throws {Error} If encryption fails
   */
  async encrypt(plaintext) {
    try {
      if (typeof plaintext !== 'string') {
        throw new Error('Plaintext must be a string');
      }

      if (plaintext.length === 0) {
        throw new Error('Cannot encrypt empty string');
      }

      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive encryption key
      const key = this._deriveKey(salt);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setIV(iv);
      
      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine salt, IV, tag, and encrypted data
      const combined = Buffer.concat([salt, iv, tag, encrypted]);
      
      // Return as base64 string
      const result = combined.toString('base64');
      
      logger.debug('Data encrypted successfully', {
        plaintextLength: plaintext.length,
        encryptedLength: result.length
      });
      
      return result;
      
    } catch (error) {
      logger.error('Encryption failed', {
        error: error.message,
        algorithm: this.algorithm
      });
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts a base64 encoded encrypted string
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {Promise<string>} Decrypted plaintext
   * @throws {Error} If decryption fails
   */
  async decrypt(encryptedData) {
    try {
      if (typeof encryptedData !== 'string') {
        throw new Error('Encrypted data must be a string');
      }

      if (encryptedData.length === 0) {
        throw new Error('Cannot decrypt empty string');
      }

      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Verify minimum length
      const minLength = this.saltLength + this.ivLength + this.tagLength;
      if (combined.length < minLength) {
        throw new Error('Invalid encrypted data format');
      }
      
      // Extract components
      const salt = combined.subarray(0, this.saltLength);
      const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.subarray(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.saltLength + this.ivLength + this.tagLength);
      
      // Derive decryption key
      const key = this._deriveKey(salt);
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setIV(iv);
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      const result = decrypted.toString('utf8');
      
      logger.debug('Data decrypted successfully', {
        encryptedLength: encryptedData.length,
        decryptedLength: result.length
      });
      
      return result;
      
    } catch (error) {
      logger.error('Decryption failed', {
        error: error.message,
        algorithm: this.algorithm
      });
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypts an object by encrypting specified fields
   * @param {Object} obj - Object to encrypt
   * @param {string[]} fields - Array of field names to encrypt
   * @returns {Promise<Object>} Object with encrypted fields
   */
  async encryptObject(obj, fields) {
    try {
      const result = { ...obj };
      
      for (const field of fields) {
        if (result[field] && typeof result[field] === 'string') {
          result[field] = await this.encrypt(result[field]);
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Object encryption failed', {
        error: error.message,
        fields
      });
      throw error;
    }
  }

  /**
   * Decrypts an object by decrypting specified fields
   * @param {Object} obj - Object to decrypt
   * @param {string[]} fields - Array of field names to decrypt
   * @returns {Promise<Object>} Object with decrypted fields
   */
  async decryptObject(obj, fields) {
    try {
      const result = { ...obj };
      
      for (const field of fields) {
        if (result[field] && typeof result[field] === 'string') {
          result[field] = await this.decrypt(result[field]);
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Object decryption failed', {
        error: error.message,
        fields
      });
      throw error;
    }
  }

  /**
   * Generates a secure random key for encryption
   * @param {number} length - Key length in bytes (default: 32)
   * @returns {string} Base64 encoded random key
   */
  generateKey(length = 32) {
    const key = crypto.randomBytes(length);
    return key.toString('base64');
  }

  /**
   * Hashes a string using SHA-256
   * @param {string} data - Data to hash
   * @returns {string} Hex encoded hash
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifies if encrypted data is valid format
   * @param {string} encryptedData - Encrypted data to verify
   * @returns {boolean} True if valid format
   */
  isValidEncryptedFormat(encryptedData) {
    try {
      if (typeof encryptedData !== 'string' || encryptedData.length === 0) {
        return false;
      }
      
      const combined = Buffer.from(encryptedData, 'base64');
      const minLength = this.saltLength + this.ivLength + this.tagLength;
      
      return combined.length >= minLength;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets encryption statistics for monitoring
   * @returns {Object} Encryption configuration details
   */
  getStats() {
    return {
      algorithm: this.algorithm,
      keyDerivation: this.keyDerivation,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      saltLength: this.saltLength,
      iterations: this.iterations,
      isProductionKey: this.masterKey !== 'dev-key-not-secure-change-in-production'
    };
  }
}

// Create singleton instance
const encryptionHelper = new EncryptionHelper();

module.exports = {
  EncryptionHelper,
  encryptionHelper
};