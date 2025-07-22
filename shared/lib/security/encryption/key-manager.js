'use strict';

/**
 * @fileoverview Secure key management service for encryption key lifecycle
 * @module shared/lib/security/encryption/key-manager
 * @requires crypto
 * @requires fs/promises
 * @requires path
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/encryption-key-model
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class KeyManager
 * @description Manages encryption keys including generation, storage, rotation, and retrieval
 */
class KeyManager {
  /**
   * @private
   * @static
   * @readonly
   */
  static #KEY_PURPOSES = {
    ENCRYPTION: 'encryption',
    SIGNING: 'signing',
    AUTHENTICATION: 'authentication',
    KEY_WRAPPING: 'key-wrapping'
  };

  static #KEY_ALGORITHMS = {
    AES_256: { type: 'symmetric', length: 32 },
    AES_192: { type: 'symmetric', length: 24 },
    AES_128: { type: 'symmetric', length: 16 },
    RSA_2048: { type: 'asymmetric', length: 2048 },
    RSA_4096: { type: 'asymmetric', length: 4096 },
    ED25519: { type: 'asymmetric', length: 32 }
  };

  static #STORAGE_BACKENDS = {
    MEMORY: 'memory',
    FILESYSTEM: 'filesystem',
    DATABASE: 'database',
    HSM: 'hsm',
    KMS: 'kms'
  };

  static #KEY_METADATA_VERSION = '1.0';
  static #MAX_KEY_AGE_DAYS = 90;
  static #KEY_ROTATION_GRACE_PERIOD_DAYS = 7;

  /**
   * Creates an instance of KeyManager
   * @constructor
   * @param {Object} options - Configuration options
   * @param {string} [options.storageBackend='memory'] - Storage backend type
   * @param {string} [options.keyPath] - Path for filesystem storage
   * @param {Object} [options.database] - Database connection for DB storage
   * @param {string} [options.masterKey] - Master key for key encryption
   * @param {boolean} [options.autoRotation=false] - Enable automatic key rotation
   * @param {number} [options.maxKeyAgeDays=90] - Maximum key age before rotation
   * @param {Object} [options.kmsConfig] - Configuration for external KMS
   */
  constructor(options = {}) {
    const {
      storageBackend = KeyManager.#STORAGE_BACKENDS.MEMORY,
      keyPath,
      database,
      masterKey,
      autoRotation = false,
      maxKeyAgeDays = KeyManager.#MAX_KEY_AGE_DAYS,
      kmsConfig
    } = options;

    this.storageBackend = storageBackend;
    this.keyPath = keyPath;
    this.database = database;
    this.autoRotation = autoRotation;
    this.maxKeyAgeDays = maxKeyAgeDays;
    this.kmsConfig = kmsConfig;

    // Initialize storage
    this.keyStore = new Map();
    this.keyMetadata = new Map();
    this.rotationSchedule = new Map();

    // Set up master key for key encryption
    if (masterKey) {
      this.masterKey = typeof masterKey === 'string' 
        ? Buffer.from(masterKey, 'hex') 
        : masterKey;
    } else if (storageBackend !== KeyManager.#STORAGE_BACKENDS.MEMORY) {
      // Generate master key for non-memory storage
      this.masterKey = this.#generateMasterKey();
    }

    // Initialize storage backend
    this.#initializeStorage();

    logger.info('KeyManager initialized', { 
      storageBackend,
      autoRotation,
      maxKeyAgeDays 
    });
  }

  /**
   * Generates a new encryption key
   * @param {Object} options - Key generation options
   * @param {string} options.keyId - Unique key identifier
   * @param {string} [options.algorithm='AES_256'] - Key algorithm
   * @param {string} [options.purpose='encryption'] - Key purpose
   * @param {Object} [options.metadata={}] - Additional metadata
   * @returns {Promise<Object>} Generated key information
   * @throws {AppError} If key generation fails
   */
  async generateKey(options) {
    try {
      const {
        keyId,
        algorithm = 'AES_256',
        purpose = KeyManager.#KEY_PURPOSES.ENCRYPTION,
        metadata = {}
      } = options;

      if (!keyId) {
        throw new AppError('Key ID is required', 400, 'KEY_ID_REQUIRED');
      }

      // Check if key already exists
      if (await this.keyExists(keyId)) {
        throw new AppError('Key already exists', 409, 'KEY_EXISTS');
      }

      const algorithmConfig = KeyManager.#KEY_ALGORITHMS[algorithm];
      if (!algorithmConfig) {
        throw new AppError('Invalid key algorithm', 400, 'INVALID_ALGORITHM');
      }

      let keyMaterial;
      let publicKey = null;

      // Generate key based on type
      if (algorithmConfig.type === 'symmetric') {
        keyMaterial = crypto.randomBytes(algorithmConfig.length);
      } else {
        // Generate asymmetric key pair
        const { privateKey, publicKey: pubKey } = await this.#generateKeyPair(algorithm);
        keyMaterial = privateKey;
        publicKey = pubKey;
      }

      // Create key metadata
      const keyData = {
        keyId,
        algorithm,
        purpose,
        type: algorithmConfig.type,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        rotatedAt: null,
        expiresAt: this.#calculateExpiration(),
        version: 1,
        status: 'active',
        metadata: {
          ...metadata,
          createdBy: metadata.createdBy || 'system',
          environment: process.env.NODE_ENV || 'development'
        }
      };

      // Store key
      await this.#storeKey(keyId, keyMaterial, keyData, publicKey);

      // Schedule rotation if enabled
      if (this.autoRotation) {
        this.#scheduleRotation(keyId, keyData.expiresAt);
      }

      logger.info('Key generated successfully', { 
        keyId, 
        algorithm, 
        purpose 
      });

      return {
        keyId,
        algorithm,
        purpose,
        type: algorithmConfig.type,
        publicKey: publicKey ? publicKey.toString('base64') : null,
        createdAt: keyData.createdAt,
        expiresAt: keyData.expiresAt
      };

    } catch (error) {
      logger.error('Key generation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to generate key',
        500,
        'KEY_GENERATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Retrieves a key by ID
   * @param {string} keyId - Key identifier
   * @param {Object} [options={}] - Retrieval options
   * @param {boolean} [options.includeMetadata=false] - Include key metadata
   * @returns {Promise<Object>} Key material and optional metadata
   * @throws {AppError} If key not found or retrieval fails
   */
  async getKey(keyId, options = {}) {
    try {
      const { includeMetadata = false } = options;

      const keyData = await this.#loadKey(keyId);
      
      if (!keyData) {
        throw new AppError('Key not found', 404, 'KEY_NOT_FOUND');
      }

      // Check key status
      if (keyData.metadata.status === 'revoked') {
        throw new AppError('Key has been revoked', 403, 'KEY_REVOKED');
      }

      // Check expiration
      if (new Date(keyData.metadata.expiresAt) < new Date()) {
        throw new AppError('Key has expired', 403, 'KEY_EXPIRED');
      }

      // Update last used timestamp
      await this.#updateKeyUsage(keyId);

      const result = {
        keyId,
        key: keyData.key,
        algorithm: keyData.metadata.algorithm,
        type: keyData.metadata.type
      };

      if (keyData.publicKey) {
        result.publicKey = keyData.publicKey;
      }

      if (includeMetadata) {
        result.metadata = {
          ...keyData.metadata,
          key: undefined // Remove key from metadata
        };
      }

      return result;

    } catch (error) {
      logger.error('Key retrieval failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to retrieve key',
        500,
        'KEY_RETRIEVAL_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rotates an existing key
   * @param {string} keyId - Key to rotate
   * @param {Object} [options={}] - Rotation options
   * @param {boolean} [options.keepOldVersion=true] - Keep old key version
   * @returns {Promise<Object>} New key information
   * @throws {AppError} If rotation fails
   */
  async rotateKey(keyId, options = {}) {
    try {
      const { keepOldVersion = true } = options;

      const existingKey = await this.#loadKey(keyId);
      if (!existingKey) {
        throw new AppError('Key not found', 404, 'KEY_NOT_FOUND');
      }

      const metadata = existingKey.metadata;

      // Generate new key material
      const algorithmConfig = KeyManager.#KEY_ALGORITHMS[metadata.algorithm];
      let newKeyMaterial;
      let newPublicKey = null;

      if (algorithmConfig.type === 'symmetric') {
        newKeyMaterial = crypto.randomBytes(algorithmConfig.length);
      } else {
        const { privateKey, publicKey } = await this.#generateKeyPair(metadata.algorithm);
        newKeyMaterial = privateKey;
        newPublicKey = publicKey;
      }

      // Archive old key if requested
      if (keepOldVersion) {
        const archivedId = `${keyId}_v${metadata.version}_${Date.now()}`;
        await this.#archiveKey(keyId, archivedId);
      }

      // Update key with new material
      const updatedMetadata = {
        ...metadata,
        version: metadata.version + 1,
        rotatedAt: new Date().toISOString(),
        expiresAt: this.#calculateExpiration(),
        previousVersion: keepOldVersion ? `${keyId}_v${metadata.version}` : null
      };

      await this.#storeKey(keyId, newKeyMaterial, updatedMetadata, newPublicKey);

      // Reschedule rotation
      if (this.autoRotation) {
        this.#scheduleRotation(keyId, updatedMetadata.expiresAt);
      }

      logger.info('Key rotated successfully', { 
        keyId, 
        version: updatedMetadata.version 
      });

      return {
        keyId,
        version: updatedMetadata.version,
        rotatedAt: updatedMetadata.rotatedAt,
        expiresAt: updatedMetadata.expiresAt,
        publicKey: newPublicKey ? newPublicKey.toString('base64') : null
      };

    } catch (error) {
      logger.error('Key rotation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to rotate key',
        500,
        'KEY_ROTATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Revokes a key
   * @param {string} keyId - Key to revoke
   * @param {string} [reason='Manual revocation'] - Revocation reason
   * @returns {Promise<void>}
   * @throws {AppError} If revocation fails
   */
  async revokeKey(keyId, reason = 'Manual revocation') {
    try {
      const keyData = await this.#loadKey(keyId);
      
      if (!keyData) {
        throw new AppError('Key not found', 404, 'KEY_NOT_FOUND');
      }

      // Update key status
      keyData.metadata.status = 'revoked';
      keyData.metadata.revokedAt = new Date().toISOString();
      keyData.metadata.revocationReason = reason;

      // Store updated metadata
      await this.#updateKeyMetadata(keyId, keyData.metadata);

      // Cancel scheduled rotation
      if (this.rotationSchedule.has(keyId)) {
        clearTimeout(this.rotationSchedule.get(keyId));
        this.rotationSchedule.delete(keyId);
      }

      logger.info('Key revoked', { keyId, reason });

    } catch (error) {
      logger.error('Key revocation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to revoke key',
        500,
        'KEY_REVOCATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists all keys with optional filtering
   * @param {Object} [options={}] - List options
   * @param {string} [options.purpose] - Filter by purpose
   * @param {string} [options.status] - Filter by status
   * @param {boolean} [options.includeExpired=false] - Include expired keys
   * @returns {Promise<Array>} List of keys
   */
  async listKeys(options = {}) {
    try {
      const {
        purpose,
        status,
        includeExpired = false
      } = options;

      const keys = await this.#getAllKeys();
      const now = new Date();

      return keys
        .filter(key => {
          // Filter by purpose
          if (purpose && key.purpose !== purpose) {
            return false;
          }

          // Filter by status
          if (status && key.status !== status) {
            return false;
          }

          // Filter expired
          if (!includeExpired && new Date(key.expiresAt) < now) {
            return false;
          }

          return true;
        })
        .map(key => ({
          keyId: key.keyId,
          algorithm: key.algorithm,
          purpose: key.purpose,
          type: key.type,
          status: key.status,
          version: key.version,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          lastUsed: key.lastUsed
        }));

    } catch (error) {
      logger.error('Failed to list keys', error);
      throw new AppError(
        'Failed to list keys',
        500,
        'KEY_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Exports a key for backup or migration
   * @param {string} keyId - Key to export
   * @param {Object} [options={}] - Export options
   * @param {string} [options.format='pem'] - Export format
   * @param {string} [options.password] - Password for encrypted export
   * @returns {Promise<Object>} Exported key data
   * @throws {AppError} If export fails
   */
  async exportKey(keyId, options = {}) {
    try {
      const {
        format = 'pem',
        password
      } = options;

      const keyData = await this.#loadKey(keyId);
      
      if (!keyData) {
        throw new AppError('Key not found', 404, 'KEY_NOT_FOUND');
      }

      // Check if key can be exported
      if (keyData.metadata.exportable === false) {
        throw new AppError('Key is not exportable', 403, 'KEY_NOT_EXPORTABLE');
      }

      let exportedData = {
        keyId,
        algorithm: keyData.metadata.algorithm,
        purpose: keyData.metadata.purpose,
        type: keyData.metadata.type,
        version: keyData.metadata.version,
        exportedAt: new Date().toISOString()
      };

      // Export based on format
      if (format === 'raw') {
        exportedData.key = keyData.key.toString('base64');
        if (keyData.publicKey) {
          exportedData.publicKey = keyData.publicKey.toString('base64');
        }
      } else if (format === 'pem') {
        exportedData.key = this.#toPEM(keyData.key, 'PRIVATE KEY');
        if (keyData.publicKey) {
          exportedData.publicKey = this.#toPEM(keyData.publicKey, 'PUBLIC KEY');
        }
      }

      // Encrypt export if password provided
      if (password) {
        const cipher = crypto.createCipher('aes-256-cbc', password);
        const encrypted = Buffer.concat([
          cipher.update(JSON.stringify(exportedData), 'utf8'),
          cipher.final()
        ]);
        
        return {
          encrypted: true,
          data: encrypted.toString('base64')
        };
      }

      logger.info('Key exported', { keyId, format });

      return exportedData;

    } catch (error) {
      logger.error('Key export failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to export key',
        500,
        'KEY_EXPORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Imports a key from backup
   * @param {Object} keyData - Key data to import
   * @param {Object} [options={}] - Import options
   * @param {string} [options.password] - Password for encrypted import
   * @param {boolean} [options.overwrite=false] - Overwrite existing key
   * @returns {Promise<Object>} Import result
   * @throws {AppError} If import fails
   */
  async importKey(keyData, options = {}) {
    try {
      const {
        password,
        overwrite = false
      } = options;

      let importData = keyData;

      // Decrypt if encrypted
      if (keyData.encrypted && password) {
        const decipher = crypto.createDecipher('aes-256-cbc', password);
        const decrypted = Buffer.concat([
          decipher.update(keyData.data, 'base64'),
          decipher.final()
        ]);
        
        importData = JSON.parse(decrypted.toString('utf8'));
      }

      // Validate import data
      if (!importData.keyId || !importData.key) {
        throw new AppError('Invalid import data', 400, 'INVALID_IMPORT_DATA');
      }

      // Check if key exists
      if (!overwrite && await this.keyExists(importData.keyId)) {
        throw new AppError('Key already exists', 409, 'KEY_EXISTS');
      }

      // Convert key material
      const keyMaterial = Buffer.from(importData.key, 
        importData.key.includes('BEGIN') ? 'utf8' : 'base64'
      );
      
      const publicKey = importData.publicKey 
        ? Buffer.from(importData.publicKey, 
            importData.publicKey.includes('BEGIN') ? 'utf8' : 'base64')
        : null;

      // Create metadata
      const metadata = {
        keyId: importData.keyId,
        algorithm: importData.algorithm,
        purpose: importData.purpose,
        type: importData.type,
        version: importData.version || 1,
        createdAt: importData.createdAt || new Date().toISOString(),
        importedAt: new Date().toISOString(),
        expiresAt: this.#calculateExpiration(),
        status: 'active'
      };

      // Store imported key
      await this.#storeKey(importData.keyId, keyMaterial, metadata, publicKey);

      logger.info('Key imported successfully', { keyId: importData.keyId });

      return {
        keyId: importData.keyId,
        imported: true,
        importedAt: metadata.importedAt
      };

    } catch (error) {
      logger.error('Key import failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to import key',
        500,
        'KEY_IMPORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks if a key exists
   * @param {string} keyId - Key identifier
   * @returns {Promise<boolean>} True if key exists
   */
  async keyExists(keyId) {
    try {
      switch (this.storageBackend) {
        case KeyManager.#STORAGE_BACKENDS.MEMORY:
          return this.keyStore.has(keyId);

        case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
          return this.#fileExists(this.#getKeyPath(keyId));

        case KeyManager.#STORAGE_BACKENDS.DATABASE:
          // Implement database check
          const EncryptionKeyModel = require('../../database/models/encryption-key-model');
          const key = await EncryptionKeyModel.findOne({ keyId });
          return !!key;

        default:
          return false;
      }
    } catch (error) {
      logger.error('Key existence check failed', error);
      return false;
    }
  }

  /**
   * Performs key maintenance tasks
   * @returns {Promise<Object>} Maintenance results
   */
  async performMaintenance() {
    try {
      const results = {
        expired: 0,
        rotated: 0,
        archived: 0,
        errors: []
      };

      const keys = await this.#getAllKeys();
      const now = new Date();

      for (const key of keys) {
        try {
          // Check for expired keys
          if (new Date(key.expiresAt) < now && key.status === 'active') {
            if (this.autoRotation) {
              await this.rotateKey(key.keyId);
              results.rotated++;
            } else {
              key.status = 'expired';
              await this.#updateKeyMetadata(key.keyId, key);
              results.expired++;
            }
          }

          // Archive old revoked keys
          if (key.status === 'revoked' && key.revokedAt) {
            const revokedDate = new Date(key.revokedAt);
            const daysSinceRevoked = (now - revokedDate) / (1000 * 60 * 60 * 24);
            
            if (daysSinceRevoked > 30) {
              await this.#archiveKey(key.keyId);
              results.archived++;
            }
          }

        } catch (error) {
          results.errors.push({
            keyId: key.keyId,
            error: error.message
          });
        }
      }

      logger.info('Key maintenance completed', results);

      return results;

    } catch (error) {
      logger.error('Key maintenance failed', error);
      throw new AppError(
        'Failed to perform key maintenance',
        500,
        'KEY_MAINTENANCE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Initializes storage backend
   * @private
   */
  async #initializeStorage() {
    switch (this.storageBackend) {
      case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
        if (!this.keyPath) {
          throw new AppError('Key path required for filesystem storage', 400);
        }
        await this.#ensureDirectory(this.keyPath);
        break;

      case KeyManager.#STORAGE_BACKENDS.DATABASE:
        if (!this.database) {
          throw new AppError('Database connection required', 400);
        }
        break;

      case KeyManager.#STORAGE_BACKENDS.KMS:
        if (!this.kmsConfig) {
          throw new AppError('KMS configuration required', 400);
        }
        // Initialize KMS client
        break;
    }
  }

  /**
   * Stores a key
   * @private
   * @param {string} keyId - Key identifier
   * @param {Buffer} keyMaterial - Key material
   * @param {Object} metadata - Key metadata
   * @param {Buffer} [publicKey] - Public key for asymmetric keys
   */
  async #storeKey(keyId, keyMaterial, metadata, publicKey) {
    const keyData = {
      key: keyMaterial,
      publicKey,
      metadata
    };

    // Encrypt key if master key is available
    if (this.masterKey) {
      keyData.key = this.#encryptKey(keyMaterial);
      if (publicKey) {
        keyData.publicKey = this.#encryptKey(publicKey);
      }
    }

    switch (this.storageBackend) {
      case KeyManager.#STORAGE_BACKENDS.MEMORY:
        this.keyStore.set(keyId, keyData);
        this.keyMetadata.set(keyId, metadata);
        break;

      case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
        await this.#saveKeyToFile(keyId, keyData);
        break;

      case KeyManager.#STORAGE_BACKENDS.DATABASE:
        await this.#saveKeyToDatabase(keyId, keyData);
        break;
    }
  }

  /**
   * Loads a key
   * @private
   * @param {string} keyId - Key identifier
   * @returns {Promise<Object>} Key data
   */
  async #loadKey(keyId) {
    let keyData;

    switch (this.storageBackend) {
      case KeyManager.#STORAGE_BACKENDS.MEMORY:
        keyData = this.keyStore.get(keyId);
        break;

      case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
        keyData = await this.#loadKeyFromFile(keyId);
        break;

      case KeyManager.#STORAGE_BACKENDS.DATABASE:
        keyData = await this.#loadKeyFromDatabase(keyId);
        break;
    }

    if (!keyData) {
      return null;
    }

    // Decrypt key if encrypted
    if (this.masterKey && keyData.key) {
      keyData.key = this.#decryptKey(keyData.key);
      if (keyData.publicKey) {
        keyData.publicKey = this.#decryptKey(keyData.publicKey);
      }
    }

    return keyData;
  }

  /**
   * Generates asymmetric key pair
   * @private
   * @param {string} algorithm - Key algorithm
   * @returns {Promise<Object>} Key pair
   */
  async #generateKeyPair(algorithm) {
    return new Promise((resolve, reject) => {
      const options = {
        modulusLength: algorithm === 'RSA_4096' ? 4096 : 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'der' }
      };

      if (algorithm.startsWith('RSA')) {
        crypto.generateKeyPair('rsa', options, (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
          } else {
            resolve({ publicKey, privateKey });
          }
        });
      } else if (algorithm === 'ED25519') {
        crypto.generateKeyPair('ed25519', {
          publicKeyEncoding: options.publicKeyEncoding,
          privateKeyEncoding: options.privateKeyEncoding
        }, (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
          } else {
            resolve({ publicKey, privateKey });
          }
        });
      }
    });
  }

  /**
   * Encrypts key material with master key
   * @private
   * @param {Buffer} keyMaterial - Key to encrypt
   * @returns {Buffer} Encrypted key
   */
  #encryptKey(keyMaterial) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(keyMaterial),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypts key material with master key
   * @private
   * @param {Buffer} encryptedKey - Encrypted key
   * @returns {Buffer} Decrypted key
   */
  #decryptKey(encryptedKey) {
    const iv = encryptedKey.slice(0, 16);
    const authTag = encryptedKey.slice(16, 32);
    const encrypted = encryptedKey.slice(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Generates master key
   * @private
   * @returns {Buffer} Master key
   */
  #generateMasterKey() {
    // In production, this should be derived from secure storage or HSM
    const envKey = process.env.MASTER_KEY_SEED;
    if (envKey) {
      return crypto.scryptSync(envKey, 'keymanager-salt', 32);
    }
    return crypto.randomBytes(32);
  }

  /**
   * Saves key to filesystem
   * @private
   * @param {string} keyId - Key identifier
   * @param {Object} keyData - Key data
   */
  async #saveKeyToFile(keyId, keyData) {
    const filePath = this.#getKeyPath(keyId);
    const content = JSON.stringify({
      version: KeyManager.#KEY_METADATA_VERSION,
      keyId,
      key: keyData.key.toString('base64'),
      publicKey: keyData.publicKey ? keyData.publicKey.toString('base64') : null,
      metadata: keyData.metadata
    });
    
    await fs.writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
  }

  /**
   * Loads key from filesystem
   * @private
   * @param {string} keyId - Key identifier
   * @returns {Promise<Object>} Key data
   */
  async #loadKeyFromFile(keyId) {
    try {
      const filePath = this.#getKeyPath(keyId);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      return {
        key: Buffer.from(data.key, 'base64'),
        publicKey: data.publicKey ? Buffer.from(data.publicKey, 'base64') : null,
        metadata: data.metadata
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Saves key to database
   * @private
   * @param {string} keyId - Key identifier
   * @param {Object} keyData - Key data
   */
  async #saveKeyToDatabase(keyId, keyData) {
    const EncryptionKeyModel = require('../../database/models/encryption-key-model');
    
    await EncryptionKeyModel.updateOne(
      { keyId },
      {
        keyId,
        encryptedKey: keyData.key.toString('base64'),
        publicKey: keyData.publicKey ? keyData.publicKey.toString('base64') : null,
        metadata: keyData.metadata,
        updatedAt: new Date()
      },
      { upsert: true }
    );
  }

  /**
   * Loads key from database
   * @private
   * @param {string} keyId - Key identifier
   * @returns {Promise<Object>} Key data
   */
  async #loadKeyFromDatabase(keyId) {
    const EncryptionKeyModel = require('../../database/models/encryption-key-model');
    
    const record = await EncryptionKeyModel.findOne({ keyId });
    if (!record) {
      return null;
    }
    
    return {
      key: Buffer.from(record.encryptedKey, 'base64'),
      publicKey: record.publicKey ? Buffer.from(record.publicKey, 'base64') : null,
      metadata: record.metadata
    };
  }

  /**
   * Updates key metadata
   * @private
   * @param {string} keyId - Key identifier
   * @param {Object} metadata - Updated metadata
   */
  async #updateKeyMetadata(keyId, metadata) {
    const keyData = await this.#loadKey(keyId);
    if (keyData) {
      keyData.metadata = metadata;
      await this.#storeKey(keyId, keyData.key, metadata, keyData.publicKey);
    }
  }

  /**
   * Updates key usage timestamp
   * @private
   * @param {string} keyId - Key identifier
   */
  async #updateKeyUsage(keyId) {
    const keyData = await this.#loadKey(keyId);
    if (keyData) {
      keyData.metadata.lastUsed = new Date().toISOString();
      await this.#updateKeyMetadata(keyId, keyData.metadata);
    }
  }

  /**
   * Archives a key
   * @private
   * @param {string} keyId - Key to archive
   * @param {string} [archiveId] - Archive identifier
   */
  async #archiveKey(keyId, archiveId) {
    const keyData = await this.#loadKey(keyId);
    if (keyData) {
      const archiveKeyId = archiveId || `${keyId}_archived_${Date.now()}`;
      keyData.metadata.status = 'archived';
      keyData.metadata.archivedAt = new Date().toISOString();
      
      await this.#storeKey(archiveKeyId, keyData.key, keyData.metadata, keyData.publicKey);
      
      if (!archiveId) {
        // Remove original if archiving without keeping version
        await this.#deleteKey(keyId);
      }
    }
  }

  /**
   * Deletes a key
   * @private
   * @param {string} keyId - Key to delete
   */
  async #deleteKey(keyId) {
    switch (this.storageBackend) {
      case KeyManager.#STORAGE_BACKENDS.MEMORY:
        this.keyStore.delete(keyId);
        this.keyMetadata.delete(keyId);
        break;

      case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
        await fs.unlink(this.#getKeyPath(keyId));
        break;

      case KeyManager.#STORAGE_BACKENDS.DATABASE:
        const EncryptionKeyModel = require('../../database/models/encryption-key-model');
        await EncryptionKeyModel.deleteOne({ keyId });
        break;
    }
  }

  /**
   * Gets all keys
   * @private
   * @returns {Promise<Array>} All keys metadata
   */
  async #getAllKeys() {
    switch (this.storageBackend) {
      case KeyManager.#STORAGE_BACKENDS.MEMORY:
        return Array.from(this.keyMetadata.values());

      case KeyManager.#STORAGE_BACKENDS.FILESYSTEM:
        const files = await fs.readdir(this.keyPath);
        const keys = [];
        
        for (const file of files) {
          if (file.endsWith('.key')) {
            const keyId = file.replace('.key', '');
            const keyData = await this.#loadKey(keyId);
            if (keyData) {
              keys.push(keyData.metadata);
            }
          }
        }
        
        return keys;

      case KeyManager.#STORAGE_BACKENDS.DATABASE:
        const EncryptionKeyModel = require('../../database/models/encryption-key-model');
        const records = await EncryptionKeyModel.find({});
        return records.map(r => r.metadata);

      default:
        return [];
    }
  }

  /**
   * Calculates key expiration date
   * @private
   * @returns {string} Expiration date
   */
  #calculateExpiration() {
    const date = new Date();
    date.setDate(date.getDate() + this.maxKeyAgeDays);
    return date.toISOString();
  }

  /**
   * Schedules key rotation
   * @private
   * @param {string} keyId - Key to rotate
   * @param {string} expiresAt - Expiration date
   */
  #scheduleRotation(keyId, expiresAt) {
    const expirationDate = new Date(expiresAt);
    const rotationDate = new Date(expirationDate);
    rotationDate.setDate(rotationDate.getDate() - KeyManager.#KEY_ROTATION_GRACE_PERIOD_DAYS);
    
    const timeout = rotationDate.getTime() - Date.now();
    
    if (timeout > 0) {
      const timeoutId = setTimeout(() => {
        this.rotateKey(keyId).catch(error => {
          logger.error('Scheduled key rotation failed', { keyId, error });
        });
      }, timeout);
      
      this.rotationSchedule.set(keyId, timeoutId);
    }
  }

  /**
   * Gets key file path
   * @private
   * @param {string} keyId - Key identifier
   * @returns {string} File path
   */
  #getKeyPath(keyId) {
    return path.join(this.keyPath, `${keyId}.key`);
  }

  /**
   * Ensures directory exists
   * @private
   * @param {string} dirPath - Directory path
   */
  async #ensureDirectory(dirPath) {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Checks if file exists
   * @private
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if exists
   */
  async #fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts key to PEM format
   * @private
   * @param {Buffer} key - Key buffer
   * @param {string} type - Key type
   * @returns {string} PEM formatted key
   */
  #toPEM(key, type) {
    const b64 = key.toString('base64');
    const lines = [];
    
    lines.push(`-----BEGIN ${type}-----`);
    
    for (let i = 0; i < b64.length; i += 64) {
      lines.push(b64.slice(i, i + 64));
    }
    
    lines.push(`-----END ${type}-----`);
    
    return lines.join('\n');
  }

  /**
   * Cleans up resources
   */
  async cleanup() {
    // Clear rotation schedules
    for (const timeoutId of this.rotationSchedule.values()) {
      clearTimeout(timeoutId);
    }
    this.rotationSchedule.clear();

    // Clear in-memory stores
    this.keyStore.clear();
    this.keyMetadata.clear();

    logger.info('KeyManager cleanup completed');
  }
}

module.exports = KeyManager;