'use strict';

/**
 * @fileoverview Advanced encryption and security utilities
 * @module shared/lib/utils/helpers/encryption-helper
 */

const crypto = require('crypto');
const CryptoHelper = require('./crypto-helper');

/**
 * @class EncryptionHelper
 * @description Advanced encryption utilities extending CryptoHelper
 */
class EncryptionHelper {
  /**
   * Initialize encryption helper with configuration
   * @static
   * @param {Object} [config={}] - Configuration options
   */
  static initialize(config = {}) {
    this.config = {
      algorithm: config.algorithm || 'aes-256-gcm',
      keyDerivationIterations: config.keyDerivationIterations || 100000,
      saltLength: config.saltLength || 32,
      ivLength: config.ivLength || 16,
      tagLength: config.tagLength || 16,
      defaultKeyLength: config.defaultKeyLength || 32,
      ...config
    };

    // Master key for key derivation (should be from secure storage)
    this.masterKey = config.masterKey || process.env.MASTER_ENCRYPTION_KEY;
  }

  /**
   * Encrypt data with key derivation
   * @static
   * @param {string|Buffer} data - Data to encrypt
   * @param {string} password - Password for encryption
   * @param {Object} [options={}] - Encryption options
   * @returns {Object} Encrypted data with metadata
   */
  static encryptWithPassword(data, password, options = {}) {
    const {
      algorithm = this.config.algorithm,
      iterations = this.config.keyDerivationIterations
    } = options;

    // Generate salt and IV
    const salt = crypto.randomBytes(this.config.saltLength);
    const iv = crypto.randomBytes(this.config.ivLength);

    // Derive key from password
    const key = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      this.config.defaultKeyLength,
      'sha256'
    );

    // Encrypt data
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)),
      cipher.final()
    ]);

    const tag = algorithm.includes('gcm') ? cipher.getAuthTag() : null;

    return {
      encrypted: encrypted.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag ? tag.toString('base64') : null,
      algorithm,
      iterations
    };
  }

  /**
   * Decrypt data with key derivation
   * @static
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} password - Password for decryption
   * @returns {Buffer} Decrypted data
   */
  static decryptWithPassword(encryptedData, password) {
    const {
      encrypted,
      salt,
      iv,
      tag,
      algorithm = this.config.algorithm,
      iterations = this.config.keyDerivationIterations
    } = encryptedData;

    // Derive key from password
    const key = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, 'base64'),
      iterations,
      this.config.defaultKeyLength,
      'sha256'
    );

    // Decrypt data
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(iv, 'base64')
    );

    if (tag && algorithm.includes('gcm')) {
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
    }

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final()
    ]);

    return decrypted;
  }

  /**
   * Encrypt field-level data
   * @static
   * @param {Object} object - Object with fields to encrypt
   * @param {Array<string>} fields - Fields to encrypt
   * @param {string} key - Encryption key
   * @returns {Object} Object with encrypted fields
   */
  static encryptFields(object, fields, key) {
    const encrypted = { ...object };
    const metadata = {};

    for (const field of fields) {
      if (object[field] !== undefined && object[field] !== null) {
        const encryptedField = CryptoHelper.encrypt(
          JSON.stringify(object[field]),
          key
        );

        encrypted[field] = encryptedField.data;
        metadata[`${field}_encryption`] = {
          iv: encryptedField.iv,
          tag: encryptedField.tag
        };
      }
    }

    encrypted._encryptionMetadata = metadata;
    return encrypted;
  }

  /**
   * Decrypt field-level data
   * @static
   * @param {Object} object - Object with encrypted fields
   * @param {Array<string>} fields - Fields to decrypt
   * @param {string} key - Decryption key
   * @returns {Object} Object with decrypted fields
   */
  static decryptFields(object, fields, key) {
    const decrypted = { ...object };
    const metadata = object._encryptionMetadata || {};

    for (const field of fields) {
      if (object[field] && metadata[`${field}_encryption`]) {
        const encryptionData = {
          data: object[field],
          iv: metadata[`${field}_encryption`].iv,
          tag: metadata[`${field}_encryption`].tag
        };

        const decryptedValue = CryptoHelper.decrypt(encryptionData, key);
        decrypted[field] = JSON.parse(decryptedValue.toString());
      }
    }

    delete decrypted._encryptionMetadata;
    return decrypted;
  }

  /**
   * Create envelope encryption
   * @static
   * @param {string|Buffer} data - Data to encrypt
   * @returns {Object} Envelope encrypted data
   */
  static envelopeEncrypt(data) {
    // Generate data encryption key (DEK)
    const dek = crypto.randomBytes(32);

    // Encrypt data with DEK
    const encryptedData = CryptoHelper.encrypt(data, dek);

    // Encrypt DEK with master key (KEK)
    const encryptedDek = CryptoHelper.encrypt(dek, this.masterKey);

    return {
      data: encryptedData,
      encryptedKey: encryptedDek,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Decrypt envelope encryption
   * @static
   * @param {Object} envelopeData - Envelope encrypted data
   * @returns {Buffer} Decrypted data
   */
  static envelopeDecrypt(envelopeData) {
    // Decrypt DEK with master key
    const dek = CryptoHelper.decrypt(envelopeData.encryptedKey, this.masterKey);

    // Decrypt data with DEK
    return CryptoHelper.decrypt(envelopeData.data, dek);
  }

  /**
   * Generate encryption key from multiple sources
   * @static
   * @param {Array<string>} sources - Key sources
   * @param {number} [length=32] - Key length
   * @returns {Buffer} Derived key
   */
  static deriveKeyFromSources(sources, length = 32) {
    const combined = sources.join(':');
    return crypto.pbkdf2Sync(
      combined,
      'static-salt', // Use proper salt in production
      this.config.keyDerivationIterations,
      length,
      'sha256'
    );
  }

  /**
   * Encrypt with key rotation support
   * @static
   * @param {string|Buffer} data - Data to encrypt
   * @param {string} keyId - Key identifier
   * @returns {Object} Encrypted data with key ID
   */
  static encryptWithKeyRotation(data, keyId) {
    const key = this.getKeyById(keyId);
    const encrypted = CryptoHelper.encrypt(data, key);

    return {
      ...encrypted,
      keyId,
      version: '1.0',
      rotationDate: new Date().toISOString()
    };
  }

  /**
   * Decrypt with key rotation support
   * @static
   * @param {Object} encryptedData - Encrypted data with key ID
   * @returns {Buffer} Decrypted data
   */
  static decryptWithKeyRotation(encryptedData) {
    const key = this.getKeyById(encryptedData.keyId);
    return CryptoHelper.decrypt(encryptedData, key);
  }

  /**
   * Get encryption key by ID (mock implementation)
   * @static
   * @private
   * @param {string} keyId - Key identifier
   * @returns {Buffer} Encryption key
   */
  static getKeyById(keyId) {
    // In production, retrieve from secure key management service
    const keys = {
      'key-2024-01': Buffer.from('0123456789abcdef0123456789abcdef'),
      'key-2024-02': Buffer.from('fedcba9876543210fedcba9876543210')
    };

    return keys[keyId] || Buffer.from('defaultkey0123456789abcdefdefault');
  }

  /**
   * Create secure token
   * @static
   * @param {Object} payload - Token payload
   * @param {string} secret - Secret key
   * @param {Object} [options={}] - Token options
   * @returns {string} Secure token
   */
  static createSecureToken(payload, secret, options = {}) {
    const {
      expiresIn = 3600, // seconds
      algorithm = 'HS256'
    } = options;

    const header = {
      alg: algorithm,
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomBytes(16).toString('hex')
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify secure token
   * @static
   * @param {string} token - Token to verify
   * @param {string} secret - Secret key
   * @returns {Object} Verification result
   */
  static verifySecureToken(token, secret) {
    try {
      const [encodedHeader, encodedPayload, signature] = token.split('.');

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Decode payload
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString()
      );

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Encrypt for multiple recipients
   * @static
   * @param {string|Buffer} data - Data to encrypt
   * @param {Array<Object>} recipients - Recipient public keys
   * @returns {Object} Multi-recipient encrypted data
   */
  static encryptForMultipleRecipients(data, recipients) {
    // Generate random symmetric key
    const symmetricKey = crypto.randomBytes(32);

    // Encrypt data with symmetric key
    const encryptedData = CryptoHelper.encrypt(data, symmetricKey);

    // Encrypt symmetric key for each recipient
    const encryptedKeys = recipients.map(recipient => ({
      recipientId: recipient.id,
      encryptedKey: crypto.publicEncrypt(
        recipient.publicKey,
        symmetricKey
      ).toString('base64')
    }));

    return {
      data: encryptedData,
      recipients: encryptedKeys
    };
  }

  /**
   * Create data integrity hash
   * @static
   * @param {any} data - Data to hash
   * @param {string} [secret] - Optional secret for HMAC
   * @returns {string} Integrity hash
   */
  static createIntegrityHash(data, secret) {
    const serialized = JSON.stringify(data, Object.keys(data).sort());

    if (secret) {
      return crypto
        .createHmac('sha256', secret)
        .update(serialized)
        .digest('hex');
    }

    return crypto
      .createHash('sha256')
      .update(serialized)
      .digest('hex');
  }

  /**
   * Verify data integrity
   * @static
   * @param {any} data - Data to verify
   * @param {string} hash - Expected hash
   * @param {string} [secret] - Optional secret for HMAC
   * @returns {boolean} True if integrity verified
   */
  static verifyIntegrity(data, hash, secret) {
    const computedHash = this.createIntegrityHash(data, secret);
    return CryptoHelper.timingSafeEqual(computedHash, hash);
  }

  /**
   * Secure erase data from memory
   * @static
   * @param {Buffer} buffer - Buffer to erase
   */
  static secureErase(buffer) {
    if (Buffer.isBuffer(buffer)) {
      crypto.randomFillSync(buffer);
      buffer.fill(0);
    }
  }

  /**
   * Generate encrypted backup
   * @static
   * @param {Object} data - Data to backup
   * @param {string} password - Backup password
   * @returns {Object} Encrypted backup
   */
  static createEncryptedBackup(data, password) {
    const timestamp = new Date().toISOString();
    const backup = {
      version: '1.0',
      timestamp,
      data
    };

    const encrypted = this.encryptWithPassword(
      JSON.stringify(backup),
      password,
      { iterations: 200000 } // Higher iterations for backups
    );

    return {
      ...encrypted,
      timestamp,
      checksum: this.createIntegrityHash(backup)
    };
  }

  /**
   * Restore encrypted backup
   * @static
   * @param {Object} backup - Encrypted backup
   * @param {string} password - Backup password
   * @returns {Object} Restored data
   */
  static restoreEncryptedBackup(backup, password) {
    const decrypted = this.decryptWithPassword(backup, password);
    const restored = JSON.parse(decrypted.toString());

    // Verify integrity
    const expectedChecksum = this.createIntegrityHash(restored);
    if (backup.checksum !== expectedChecksum) {
      throw new Error('Backup integrity check failed');
    }

    return restored.data;
  }
}

// Initialize with default config
EncryptionHelper.initialize({});

module.exports = EncryptionHelper;
