const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const CryptoUtils = require('./crypto-utils');

/**
 * KeyManager - Comprehensive key management service
 * Handles key generation, storage, rotation, and lifecycle management
 */
class KeyManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            keyStorePath: config.keyStorePath || './keys',
            masterKeyPath: config.masterKeyPath || './keys/master',
            rotationInterval: config.rotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days
            keyLength: config.keyLength || 32,
            keyAlgorithm: config.keyAlgorithm || 'aes-256-gcm',
            maxKeyAge: config.maxKeyAge || 90 * 24 * 60 * 60 * 1000, // 90 days
            enableHSM: config.enableHSM || false,
            hsmConfig: config.hsmConfig || null,
            enableKeyEscrow: config.enableKeyEscrow || false,
            escrowConfig: config.escrowConfig || null,
            enableKeyVersioning: config.enableKeyVersioning !== false,
            maxKeyVersions: config.maxKeyVersions || 10,
            keyDerivationIterations: config.keyDerivationIterations || 100000,
            enableKeySharing: config.enableKeySharing || false,
            keyShareThreshold: config.keyShareThreshold || 3,
            keyShareTotal: config.keyShareTotal || 5,
            enableAudit: config.enableAudit !== false,
            encryptionStandard: config.encryptionStandard || 'FIPS-140-2',
            keyStretchingAlgorithm: config.keyStretchingAlgorithm || 'pbkdf2',
            enableQuantumSafe: config.enableQuantumSafe || false,
            backupEnabled: config.backupEnabled !== false,
            backupPath: config.backupPath || './keys/backup',
            compressionEnabled: config.compressionEnabled || false
        };

        this.cryptoUtils = new CryptoUtils();

        this.keys = new Map();
        this.keyMetadata = new Map();
        this.keyVersions = new Map();
        this.keyShares = new Map();
        this.activeKeys = new Set();
        this.revokedKeys = new Set();
        this.pendingKeys = new Map();
        this.keyUsageStats = new Map();

        this.masterKey = null;
        this.kek = null; // Key Encryption Key
        this.currentKeyId = null;

        this.keyTypes = {
            MASTER: 'master',
            KEK: 'kek',
            DEK: 'dek',
            SIGNING: 'signing',
            ENCRYPTION: 'encryption',
            HMAC: 'hmac',
            WRAPPING: 'wrapping',
            TRANSPORT: 'transport',
            SESSION: 'session',
            EPHEMERAL: 'ephemeral',
            DERIVED: 'derived',
            SPLIT: 'split',
            RECOVERY: 'recovery'
        };

        this.keyStates = {
            GENERATED: 'generated',
            ACTIVE: 'active',
            INACTIVE: 'inactive',
            SUSPENDED: 'suspended',
            COMPROMISED: 'compromised',
            EXPIRED: 'expired',
            REVOKED: 'revoked',
            DESTROYED: 'destroyed',
            ESCROWED: 'escrowed',
            ARCHIVED: 'archived'
        };

        this.keyOperations = {
            ENCRYPT: 'encrypt',
            DECRYPT: 'decrypt',
            SIGN: 'sign',
            VERIFY: 'verify',
            WRAP: 'wrap',
            UNWRAP: 'unwrap',
            DERIVE: 'derive',
            GENERATE: 'generate'
        };

        this.statistics = {
            totalKeysGenerated: 0,
            totalKeyRotations: 0,
            totalKeyUsages: 0,
            activeKeyCount: 0,
            revokedKeyCount: 0,
            keyGenerationTime: 0,
            keyRotationTime: 0,
            errors: 0,
            lastRotation: null,
            nextRotation: null
        };

        this.auditLog = [];
        this.rotationSchedule = null;
        this.backupSchedule = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the key manager
     */
    async initialize() {
        try {
            // Create key storage directories
            await this.createKeyStorageDirectories();

            // Load or generate master key
            await this.initializeMasterKey();

            // Load or generate KEK
            await this.initializeKEK();

            // Load existing keys
            await this.loadExistingKeys();

            // Generate initial encryption key if none exists
            if (this.keys.size === 0) {
                await this.generateKey({ type: this.keyTypes.ENCRYPTION });
            }

            // Set up key rotation schedule
            this.setupKeyRotationSchedule();

            // Set up backup schedule
            this.setupBackupSchedule();

            // Initialize HSM if enabled
            if (this.config.enableHSM) {
                await this.initializeHSM();
            }

            // Initialize key escrow if enabled
            if (this.config.enableKeyEscrow) {
                await this.initializeKeyEscrow();
            }

            this.isInitialized = true;
            this.emit('initialized');

            this.logAuditEvent('INITIALIZATION', {
                timestamp: new Date().toISOString(),
                keysLoaded: this.keys.size,
                config: this.getSafeConfig()
            });

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Key manager initialization failed: ${error.message}`);
        }
    }

    /**
     * Generate a new encryption key
     * @param {object} options - Key generation options
     * @returns {Promise<object>} Generated key information
     */
    async generateKey(options = {}) {
        const startTime = Date.now();

        try {
            const keyType = options.type || this.keyTypes.ENCRYPTION;
            const keyLength = options.keyLength || this.config.keyLength;
            const algorithm = options.algorithm || this.config.keyAlgorithm;

            // Generate key material
            const keyMaterial = await this.generateKeyMaterial(keyLength, options);

            // Generate unique key ID
            const keyId = this.generateKeyId(keyType);

            // Create key metadata
            const metadata = {
                keyId,
                type: keyType,
                algorithm,
                length: keyLength,
                created: new Date().toISOString(),
                expires: this.calculateKeyExpiration(options),
                state: this.keyStates.GENERATED,
                version: 1,
                purpose: options.purpose || 'general',
                owner: options.owner || 'system',
                permissions: options.permissions || ['encrypt', 'decrypt'],
                tags: options.tags || [],
                fingerprint: this.cryptoUtils.createHash(keyMaterial).hash,
                checksum: this.calculateKeyChecksum(keyMaterial),
                rotationCount: 0,
                usageCount: 0,
                lastUsed: null,
                parentKeyId: options.parentKeyId || null,
                derivationPath: options.derivationPath || null,
                compliance: {
                    standard: this.config.encryptionStandard,
                    fips140: true,
                    commonCriteria: false
                }
            };

            // Encrypt key if KEK is available
            let encryptedKey = null;
            if (this.kek && keyType !== this.keyTypes.MASTER && keyType !== this.keyTypes.KEK) {
                encryptedKey = await this.encryptKey(keyMaterial, this.kek);
            }

            // Store key
            const keyData = {
                keyId,
                keyMaterial: encryptedKey || keyMaterial,
                encrypted: !!encryptedKey,
                metadata,
                shares: null
            };

            this.keys.set(keyId, keyData);
            this.keyMetadata.set(keyId, metadata);

            // Initialize version history
            if (this.config.enableKeyVersioning) {
                this.keyVersions.set(keyId, [{
                    version: 1,
                    keyMaterial: keyData.keyMaterial,
                    created: metadata.created,
                    state: metadata.state
                }]);
            }

            // Initialize usage statistics
            this.keyUsageStats.set(keyId, {
                encryptionCount: 0,
                decryptionCount: 0,
                signatureCount: 0,
                verificationCount: 0,
                bytesEncrypted: 0,
                bytesDecrypted: 0,
                errors: 0,
                lastAccess: null
            });

            // Activate key if auto-activation is enabled
            if (options.autoActivate !== false) {
                await this.activateKey(keyId);
            }

            // Create key shares if enabled
            if (this.config.enableKeySharing && options.createShares) {
                await this.createKeyShares(keyId, keyMaterial);
            }

            // Backup key if enabled
            if (this.config.backupEnabled) {
                await this.backupKey(keyId);
            }

            // Update statistics
            this.statistics.totalKeysGenerated++;
            this.statistics.keyGenerationTime = Date.now() - startTime;

            // Log audit event
            this.logAuditEvent('KEY_GENERATED', {
                keyId,
                type: keyType,
                algorithm,
                timestamp: new Date().toISOString()
            });

            this.emit('keyGenerated', { keyId, type: keyType });

            return {
                keyId,
                type: keyType,
                algorithm,
                created: metadata.created,
                expires: metadata.expires,
                fingerprint: metadata.fingerprint
            };

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Key generation failed: ${error.message}`);
        }
    }

    /**
     * Generate key material based on type and options
     * @param {number} keyLength - Key length in bytes
     * @param {object} options - Generation options
     * @returns {Promise<Buffer>} Key material
     */
    async generateKeyMaterial(keyLength, options = {}) {
        if (options.derivedFrom) {
            // Derive key from existing key
            const parentKey = await this.getKey(options.derivedFrom);
            const salt = options.salt || this.cryptoUtils.generateRandomBytes(64);

            const derived = await this.cryptoUtils.deriveKey(
                parentKey.keyMaterial.toString('hex'),
                salt,
                {
                    iterations: this.config.keyDerivationIterations,
                    keyLength,
                    digest: 'sha512'
                }
            );

            return derived.key;
        } else if (options.fromPassword) {
            // Derive key from password
            const salt = options.salt || this.cryptoUtils.generateRandomBytes(64);

            const derived = await this.cryptoUtils.deriveKey(
                options.fromPassword,
                salt,
                {
                    iterations: this.config.keyDerivationIterations * 2,
                    keyLength,
                    digest: 'sha512'
                }
            );

            return derived.key;
        } else {
            // Generate random key
            return this.cryptoUtils.generateRandomBytes(keyLength);
        }
    }

    /**
     * Get a key by ID
     * @param {string} keyId - Key identifier
     * @param {object} options - Retrieval options
     * @returns {Promise<object>} Key data
     */
    async getKey(keyId, options = {}) {
        try {
            if (!this.keys.has(keyId)) {
                // Try to load from persistent storage
                const loaded = await this.loadKeyFromStorage(keyId);
                if (!loaded) {
                    throw new Error(`Key not found: ${keyId}`);
                }
            }

            const keyData = this.keys.get(keyId);
            const metadata = this.keyMetadata.get(keyId);

            // Check key state
            if (metadata.state === this.keyStates.REVOKED) {
                throw new Error(`Key is revoked: ${keyId}`);
            }

            if (metadata.state === this.keyStates.EXPIRED) {
                throw new Error(`Key is expired: ${keyId}`);
            }

            if (metadata.state === this.keyStates.COMPROMISED) {
                this.emit('warning', { message: 'Using compromised key', keyId });
            }

            // Decrypt key if encrypted
            let keyMaterial = keyData.keyMaterial;
            if (keyData.encrypted && this.kek) {
                keyMaterial = await this.decryptKey(keyData.keyMaterial, this.kek);
            }

            // Update usage statistics
            this.updateKeyUsageStats(keyId, 'access');

            // Log audit event if enabled
            if (this.config.enableAudit) {
                this.logAuditEvent('KEY_ACCESSED', {
                    keyId,
                    purpose: options.purpose || 'unknown',
                    timestamp: new Date().toISOString()
                });
            }

            return {
                keyId,
                key: keyMaterial,
                metadata,
                type: metadata.type,
                algorithm: metadata.algorithm
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to get key: ${error.message}`);
        }
    }

    /**
     * Get the current active encryption key
     * @returns {Promise<object>} Current key
     */
    async getCurrentKey() {
        if (!this.currentKeyId) {
            // Find the most recent active encryption key
            for (const [keyId, metadata] of this.keyMetadata.entries()) {
                if (metadata.type === this.keyTypes.ENCRYPTION &&
                    metadata.state === this.keyStates.ACTIVE) {
                    this.currentKeyId = keyId;
                    break;
                }
            }

            if (!this.currentKeyId) {
                // Generate new key if none exists
                const newKey = await this.generateKey({
                    type: this.keyTypes.ENCRYPTION,
                    autoActivate: true
                });
                this.currentKeyId = newKey.keyId;
            }
        }

        return await this.getKey(this.currentKeyId);
    }

    /**
     * Rotate encryption keys
     * @param {object} options - Rotation options
     * @returns {Promise<object>} Rotation result
     */
    async rotateKeys(options = {}) {
        const startTime = Date.now();

        try {
            this.emit('rotationStarted');

            const rotationPlan = await this.createRotationPlan(options);
            const rotationResult = {
                rotatedKeys: [],
                newKeys: [],
                errors: [],
                timestamp: new Date().toISOString()
            };

            // Generate new keys for each key type that needs rotation
            for (const keyType of rotationPlan.keyTypes) {
                try {
                    const newKey = await this.generateKey({
                        type: keyType,
                        autoActivate: false,
                        purpose: 'rotation'
                    });

                    rotationResult.newKeys.push(newKey);

                    // Find and deactivate old keys of this type
                    for (const [keyId, metadata] of this.keyMetadata.entries()) {
                        if (metadata.type === keyType &&
                            metadata.state === this.keyStates.ACTIVE) {

                            await this.deactivateKey(keyId);
                            rotationResult.rotatedKeys.push(keyId);
                        }
                    }

                    // Activate new key
                    await this.activateKey(newKey.keyId);

                    // Update current key if it's an encryption key
                    if (keyType === this.keyTypes.ENCRYPTION) {
                        this.currentKeyId = newKey.keyId;
                    }

                } catch (error) {
                    rotationResult.errors.push({
                        keyType,
                        error: error.message
                    });
                }
            }

            // Re-encrypt sensitive keys with new KEK if KEK was rotated
            if (rotationPlan.keyTypes.includes(this.keyTypes.KEK)) {
                await this.reencryptKeys();
            }

            // Clean up old keys based on retention policy
            await this.cleanupOldKeys(options);

            // Update statistics
            this.statistics.totalKeyRotations++;
            this.statistics.keyRotationTime = Date.now() - startTime;
            this.statistics.lastRotation = new Date().toISOString();
            this.statistics.nextRotation = new Date(Date.now() + this.config.rotationInterval).toISOString();

            // Log audit event
            this.logAuditEvent('KEY_ROTATION', {
                rotatedCount: rotationResult.rotatedKeys.length,
                newCount: rotationResult.newKeys.length,
                errors: rotationResult.errors.length,
                timestamp: rotationResult.timestamp
            });

            this.emit('rotationCompleted', rotationResult);

            return rotationResult;

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Key rotation failed: ${error.message}`);
        }
    }

    /**
     * Create a rotation plan based on key ages and policies
     * @param {object} options - Planning options
     * @returns {Promise<object>} Rotation plan
     */
    async createRotationPlan(options = {}) {
        const plan = {
            keyTypes: [],
            keysToRotate: [],
            reason: options.reason || 'scheduled',
            timestamp: new Date().toISOString()
        };

        const now = Date.now();
        const forceRotation = options.force || false;

        // Check each key for rotation eligibility
        for (const [keyId, metadata] of this.keyMetadata.entries()) {
            const keyAge = now - new Date(metadata.created).getTime();
            const shouldRotate = forceRotation ||
                                keyAge > this.config.maxKeyAge ||
                                metadata.usageCount > 1000000 ||
                                metadata.state === this.keyStates.COMPROMISED;

            if (shouldRotate && metadata.state === this.keyStates.ACTIVE) {
                plan.keysToRotate.push(keyId);
                if (!plan.keyTypes.includes(metadata.type)) {
                    plan.keyTypes.push(metadata.type);
                }
            }
        }

        // Always include encryption keys in rotation if interval has passed
        if (!plan.keyTypes.includes(this.keyTypes.ENCRYPTION)) {
            const lastRotation = this.statistics.lastRotation ?
                new Date(this.statistics.lastRotation).getTime() : 0;

            if (now - lastRotation > this.config.rotationInterval) {
                plan.keyTypes.push(this.keyTypes.ENCRYPTION);
            }
        }

        return plan;
    }

    /**
     * Activate a key
     * @param {string} keyId - Key identifier
     * @returns {Promise<void>}
     */
    async activateKey(keyId) {
        const metadata = this.keyMetadata.get(keyId);
        if (!metadata) {
            throw new Error(`Key not found: ${keyId}`);
        }

        metadata.state = this.keyStates.ACTIVE;
        this.activeKeys.add(keyId);

        this.logAuditEvent('KEY_ACTIVATED', {
            keyId,
            timestamp: new Date().toISOString()
        });

        this.emit('keyActivated', { keyId });
    }

    /**
     * Deactivate a key
     * @param {string} keyId - Key identifier
     * @returns {Promise<void>}
     */
    async deactivateKey(keyId) {
        const metadata = this.keyMetadata.get(keyId);
        if (!metadata) {
            throw new Error(`Key not found: ${keyId}`);
        }

        metadata.state = this.keyStates.INACTIVE;
        this.activeKeys.delete(keyId);

        this.logAuditEvent('KEY_DEACTIVATED', {
            keyId,
            timestamp: new Date().toISOString()
        });

        this.emit('keyDeactivated', { keyId });
    }

    /**
     * Revoke a key
     * @param {string} keyId - Key identifier
     * @param {string} reason - Revocation reason
     * @returns {Promise<void>}
     */
    async revokeKey(keyId, reason = 'unspecified') {
        const metadata = this.keyMetadata.get(keyId);
        if (!metadata) {
            throw new Error(`Key not found: ${keyId}`);
        }

        metadata.state = this.keyStates.REVOKED;
        metadata.revocationReason = reason;
        metadata.revocationTime = new Date().toISOString();

        this.activeKeys.delete(keyId);
        this.revokedKeys.add(keyId);

        // Remove from cache
        this.keys.delete(keyId);

        this.logAuditEvent('KEY_REVOKED', {
            keyId,
            reason,
            timestamp: new Date().toISOString()
        });

        this.emit('keyRevoked', { keyId, reason });
    }

    /**
     * Create key shares using Shamir's Secret Sharing
     * @param {string} keyId - Key identifier
     * @param {Buffer} keyMaterial - Key material to split
     * @returns {Promise<object>} Share information
     */
    async createKeyShares(keyId, keyMaterial) {
        const threshold = this.config.keyShareThreshold;
        const total = this.config.keyShareTotal;

        // Simple implementation - production should use proper Shamir's Secret Sharing
        const shares = [];
        for (let i = 0; i < total; i++) {
            const share = Buffer.alloc(keyMaterial.length);
            for (let j = 0; j < keyMaterial.length; j++) {
                share[j] = keyMaterial[j] ^ (i + 1);
            }
            shares.push({
                index: i + 1,
                share: share.toString('base64'),
                keyId,
                threshold,
                total
            });
        }

        this.keyShares.set(keyId, shares);

        this.logAuditEvent('KEY_SHARES_CREATED', {
            keyId,
            threshold,
            total,
            timestamp: new Date().toISOString()
        });

        return { shares, threshold, total };
    }

    /**
     * Reconstruct key from shares
     * @param {string} keyId - Key identifier
     * @param {array} shares - Array of shares
     * @returns {Promise<Buffer>} Reconstructed key
     */
    async reconstructKeyFromShares(keyId, shares) {
        if (shares.length < this.config.keyShareThreshold) {
            throw new Error(`Insufficient shares. Need ${this.config.keyShareThreshold}, got ${shares.length}`);
        }

        // Simple reconstruction - production should use proper Shamir's Secret Sharing
        const firstShare = Buffer.from(shares[0].share, 'base64');
        const reconstructed = Buffer.alloc(firstShare.length);

        for (let i = 0; i < firstShare.length; i++) {
            reconstructed[i] = firstShare[i] ^ shares[0].index;
        }

        this.logAuditEvent('KEY_RECONSTRUCTED', {
            keyId,
            sharesUsed: shares.length,
            timestamp: new Date().toISOString()
        });

        return reconstructed;
    }

    /**
     * Get master key
     * @returns {Promise<object>} Master key
     */
    async getMasterKey() {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        return {
            key: this.masterKey,
            keyId: 'master-key',
            type: this.keyTypes.MASTER
        };
    }

    /**
     * Get RSA key pair for hybrid encryption
     * @returns {Promise<object>} RSA key pair
     */
    async getRSAKeyPair() {
        // Check for existing RSA key
        for (const [keyId, metadata] of this.keyMetadata.entries()) {
            if (metadata.type === this.keyTypes.SIGNING &&
                metadata.state === this.keyStates.ACTIVE) {
                const keyData = await this.getKey(keyId);
                return {
                    keyId,
                    publicKey: keyData.metadata.publicKey,
                    privateKey: keyData.key,
                    fingerprint: keyData.metadata.fingerprint
                };
            }
        }

        // Generate new RSA key pair if none exists
        const keyPair = await this.cryptoUtils.generateRSAKeyPair();

        const keyId = this.generateKeyId(this.keyTypes.SIGNING);
        const metadata = {
            keyId,
            type: this.keyTypes.SIGNING,
            algorithm: 'RSA',
            publicKey: keyPair.publicKey,
            fingerprint: keyPair.fingerprint,
            created: new Date().toISOString(),
            state: this.keyStates.ACTIVE
        };

        this.keys.set(keyId, {
            keyId,
            keyMaterial: Buffer.from(keyPair.privateKey),
            metadata
        });

        this.keyMetadata.set(keyId, metadata);

        return {
            keyId,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            fingerprint: keyPair.fingerprint
        };
    }

    /**
     * Helper methods
     */

    async createKeyStorageDirectories() {
        const dirs = [
            this.config.keyStorePath,
            this.config.masterKeyPath,
            this.config.backupPath
        ];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw error;
                }
            }
        }
    }

    async initializeMasterKey() {
        const masterKeyPath = path.join(this.config.masterKeyPath, 'master.key');

        try {
            // Try to load existing master key
            const encryptedMaster = await fs.readFile(masterKeyPath);
            // In production, this should be decrypted with HSM or secure enclave
            this.masterKey = Buffer.from(encryptedMaster);
        } catch (error) {
            // Generate new master key
            this.masterKey = this.cryptoUtils.generateRandomBytes(32);

            // In production, encrypt with HSM or secure enclave before saving
            await fs.writeFile(masterKeyPath, this.masterKey, { mode: 0o600 });
        }
    }

    async initializeKEK() {
        // Generate KEK from master key
        const kekData = await this.cryptoUtils.deriveKey(
            'kek-derivation',
            this.masterKey,
            {
                iterations: this.config.keyDerivationIterations,
                keyLength: 32
            }
        );

        this.kek = kekData.key;
    }

    async loadExistingKeys() {
        try {
            const keyFiles = await fs.readdir(this.config.keyStorePath);

            for (const file of keyFiles) {
                if (file.endsWith('.key')) {
                    const keyId = file.replace('.key', '');
                    await this.loadKeyFromStorage(keyId);
                }
            }
        } catch (error) {
            // Directory might not exist yet
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async loadKeyFromStorage(keyId) {
        try {
            const keyPath = path.join(this.config.keyStorePath, `${keyId}.key`);
            const metadataPath = path.join(this.config.keyStorePath, `${keyId}.meta`);

            const keyData = await fs.readFile(keyPath);
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

            this.keys.set(keyId, {
                keyId,
                keyMaterial: keyData,
                encrypted: true,
                metadata
            });

            this.keyMetadata.set(keyId, metadata);

            if (metadata.state === this.keyStates.ACTIVE) {
                this.activeKeys.add(keyId);
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    async encryptKey(keyMaterial, kek) {
        return this.cryptoUtils.encryptAESGCM(keyMaterial, kek);
    }

    async decryptKey(encryptedKey, kek) {
        if (typeof encryptedKey === 'object' && encryptedKey.encrypted) {
            return this.cryptoUtils.decryptAESGCM(
                encryptedKey.encrypted,
                kek,
                encryptedKey.iv,
                encryptedKey.authTag
            );
        }
        return encryptedKey;
    }

    async reencryptKeys() {
        for (const [keyId, keyData] of this.keys.entries()) {
            if (keyData.encrypted && keyData.metadata.type !== this.keyTypes.MASTER) {
                // Decrypt with old KEK and re-encrypt with new KEK
                const decrypted = await this.decryptKey(keyData.keyMaterial, this.kek);
                const reencrypted = await this.encryptKey(decrypted, this.kek);
                keyData.keyMaterial = reencrypted;
            }
        }
    }

    async cleanupOldKeys(options = {}) {
        const retentionPeriod = options.retentionPeriod || 7 * 24 * 60 * 60 * 1000; // 7 days
        const now = Date.now();

        for (const [keyId, metadata] of this.keyMetadata.entries()) {
            if (metadata.state === this.keyStates.INACTIVE ||
                metadata.state === this.keyStates.EXPIRED) {

                const keyAge = now - new Date(metadata.created).getTime();
                if (keyAge > retentionPeriod) {
                    await this.destroyKey(keyId);
                }
            }
        }
    }

    async destroyKey(keyId) {
        // Securely overwrite key material
        const keyData = this.keys.get(keyId);
        if (keyData && keyData.keyMaterial) {
            crypto.randomFillSync(keyData.keyMaterial);
        }

        // Remove from all stores
        this.keys.delete(keyId);
        this.keyMetadata.delete(keyId);
        this.keyVersions.delete(keyId);
        this.keyShares.delete(keyId);
        this.keyUsageStats.delete(keyId);
        this.activeKeys.delete(keyId);

        // Remove from persistent storage
        try {
            const keyPath = path.join(this.config.keyStorePath, `${keyId}.key`);
            const metadataPath = path.join(this.config.keyStorePath, `${keyId}.meta`);
            await fs.unlink(keyPath);
            await fs.unlink(metadataPath);
        } catch (error) {
            // Files might not exist
        }

        this.logAuditEvent('KEY_DESTROYED', {
            keyId,
            timestamp: new Date().toISOString()
        });
    }

    async backupKey(keyId) {
        const keyData = this.keys.get(keyId);
        const metadata = this.keyMetadata.get(keyId);

        if (!keyData || !metadata) {
            throw new Error(`Key not found: ${keyId}`);
        }

        const backupData = {
            keyId,
            keyData: keyData.keyMaterial.toString('base64'),
            metadata,
            timestamp: new Date().toISOString()
        };

        const backupPath = path.join(this.config.backupPath, `${keyId}_${Date.now()}.backup`);
        await fs.writeFile(backupPath, JSON.stringify(backupData), { mode: 0o600 });

        this.logAuditEvent('KEY_BACKED_UP', {
            keyId,
            backupPath,
            timestamp: new Date().toISOString()
        });
    }

    generateKeyId(keyType) {
        const timestamp = Date.now();
        const random = this.cryptoUtils.generateRandomString(8);
        return `${keyType}-${timestamp}-${random}`;
    }

    calculateKeyExpiration(options) {
        const ttl = options.ttl || this.config.maxKeyAge;
        return new Date(Date.now() + ttl).toISOString();
    }

    calculateKeyChecksum(keyMaterial) {
        return this.cryptoUtils.createHash(keyMaterial, 'sha256').hash;
    }

    updateKeyUsageStats(keyId, operation) {
        const stats = this.keyUsageStats.get(keyId) || {
            encryptionCount: 0,
            decryptionCount: 0,
            signatureCount: 0,
            verificationCount: 0,
            bytesEncrypted: 0,
            bytesDecrypted: 0,
            errors: 0,
            lastAccess: null
        };

        stats.lastAccess = new Date().toISOString();

        if (operation === 'encrypt') stats.encryptionCount++;
        if (operation === 'decrypt') stats.decryptionCount++;
        if (operation === 'sign') stats.signatureCount++;
        if (operation === 'verify') stats.verificationCount++;

        this.keyUsageStats.set(keyId, stats);

        // Update metadata usage count
        const metadata = this.keyMetadata.get(keyId);
        if (metadata) {
            metadata.usageCount++;
            metadata.lastUsed = stats.lastAccess;
        }

        this.statistics.totalKeyUsages++;
    }

    setupKeyRotationSchedule() {
        if (this.rotationSchedule) {
            clearInterval(this.rotationSchedule);
        }

        this.rotationSchedule = setInterval(async () => {
            try {
                await this.rotateKeys({ reason: 'scheduled' });
            } catch (error) {
                this.emit('error', error);
            }
        }, this.config.rotationInterval);

        this.statistics.nextRotation = new Date(Date.now() + this.config.rotationInterval).toISOString();
    }

    setupBackupSchedule() {
        if (!this.config.backupEnabled) return;

        if (this.backupSchedule) {
            clearInterval(this.backupSchedule);
        }

        // Backup every 24 hours
        this.backupSchedule = setInterval(async () => {
            try {
                for (const keyId of this.activeKeys) {
                    await this.backupKey(keyId);
                }
            } catch (error) {
                this.emit('error', error);
            }
        }, 24 * 60 * 60 * 1000);
    }

    async initializeHSM() {
        // HSM initialization would go here
        this.emit('hsmInitialized');
    }

    async initializeKeyEscrow() {
        // Key escrow initialization would go here
        this.emit('escrowInitialized');
    }

    logAuditEvent(event, details) {
        if (!this.config.enableAudit) return;

        const auditEntry = {
            event,
            details,
            timestamp: new Date().toISOString(),
            source: 'KeyManager'
        };

        this.auditLog.push(auditEntry);
        this.emit('audit', auditEntry);

        // Keep audit log size manageable
        if (this.auditLog.length > 10000) {
            this.auditLog = this.auditLog.slice(-5000);
        }
    }

    getSafeConfig() {
        // Return config without sensitive information
        return {
            keyStorePath: this.config.keyStorePath,
            rotationInterval: this.config.rotationInterval,
            keyLength: this.config.keyLength,
            keyAlgorithm: this.config.keyAlgorithm,
            maxKeyAge: this.config.maxKeyAge,
            enableHSM: this.config.enableHSM,
            enableKeyEscrow: this.config.enableKeyEscrow,
            enableKeyVersioning: this.config.enableKeyVersioning,
            encryptionStandard: this.config.encryptionStandard
        };
    }

    /**
     * Get key manager statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            activeKeyCount: this.activeKeys.size,
            revokedKeyCount: this.revokedKeys.size,
            totalKeys: this.keys.size,
            keyTypes: this.getKeyTypeDistribution(),
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    getKeyTypeDistribution() {
        const distribution = {};

        for (const metadata of this.keyMetadata.values()) {
            distribution[metadata.type] = (distribution[metadata.type] || 0) + 1;
        }

        return distribution;
    }

    /**
     * Export key manager state for backup
     * @returns {object} Exportable state
     */
    async exportState() {
        return {
            version: '2.0.0',
            exported: new Date().toISOString(),
            statistics: this.getStatistics(),
            config: this.getSafeConfig(),
            keyCount: this.keys.size,
            activeKeys: Array.from(this.activeKeys)
        };
    }

    /**
     * Shutdown key manager
     */
    async shutdown() {
        if (this.rotationSchedule) {
            clearInterval(this.rotationSchedule);
        }

        if (this.backupSchedule) {
            clearInterval(this.backupSchedule);
        }

        // Clear sensitive data from memory
        if (this.masterKey) {
            crypto.randomFillSync(this.masterKey);
        }

        if (this.kek) {
            crypto.randomFillSync(this.kek);
        }

        for (const keyData of this.keys.values()) {
            if (keyData.keyMaterial && Buffer.isBuffer(keyData.keyMaterial)) {
                crypto.randomFillSync(keyData.keyMaterial);
            }
        }

        this.keys.clear();
        this.keyMetadata.clear();
        this.keyVersions.clear();
        this.keyShares.clear();

        this.emit('shutdown');
    }
}

module.exports = KeyManager;
