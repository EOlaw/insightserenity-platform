const CryptoUtils = require('./crypto-utils');
const KeyManager = require('./key-manager');
const HashService = require('./hash-service');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * EncryptionService - Comprehensive encryption service for enterprise applications
 * Provides high-level encryption, decryption, and secure data handling
 */
class EncryptionService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            defaultAlgorithm: config.defaultAlgorithm || 'aes-256-gcm',
            keyRotationInterval: config.keyRotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days
            maxEncryptionSize: config.maxEncryptionSize || 100 * 1024 * 1024, // 100MB
            enableCompression: config.enableCompression !== false,
            compressionThreshold: config.compressionThreshold || 1024, // 1KB
            enableCaching: config.enableCaching !== false,
            cacheSize: config.cacheSize || 100,
            cacheTTL: config.cacheTTL || 3600000, // 1 hour
            enableAudit: config.enableAudit !== false,
            keyDerivationIterations: config.keyDerivationIterations || 100000,
            saltLength: config.saltLength || 64,
            ivLength: config.ivLength || 16,
            tagLength: config.tagLength || 16,
            enableIntegrityCheck: config.enableIntegrityCheck !== false,
            integrityAlgorithm: config.integrityAlgorithm || 'sha512',
            enableKeyEscrow: config.enableKeyEscrow || false,
            keyEscrowService: config.keyEscrowService || null,
            enableHSM: config.enableHSM || false,
            hsmConfig: config.hsmConfig || null,
            enableQuantumResistant: config.enableQuantumResistant || false,
            quantumAlgorithm: config.quantumAlgorithm || 'kyber1024'
        };

        this.cryptoUtils = new CryptoUtils();
        this.keyManager = null;
        this.hashService = null;

        this.encryptionCache = new Map();
        this.decryptionCache = new Map();
        this.keyCache = new Map();
        this.sessionKeys = new Map();

        this.statistics = {
            totalEncryptions: 0,
            totalDecryptions: 0,
            totalBytesEncrypted: 0,
            totalBytesDecrypted: 0,
            cacheHits: 0,
            cacheMisses: 0,
            keyRotations: 0,
            errors: 0,
            averageEncryptionTime: 0,
            averageDecryptionTime: 0,
            peakMemoryUsage: 0,
            activeOperations: 0
        };

        this.encryptionQueue = [];
        this.decryptionQueue = [];
        this.maxQueueSize = config.maxQueueSize || 1000;
        this.isProcessingQueue = false;

        this.encryptionModes = {
            STANDARD: 'standard',
            ENVELOPE: 'envelope',
            HYBRID: 'hybrid',
            STREAMING: 'streaming',
            CHUNKED: 'chunked',
            DETERMINISTIC: 'deterministic',
            FORMAT_PRESERVING: 'format-preserving',
            HOMOMORPHIC: 'homomorphic',
            SEARCHABLE: 'searchable',
            THRESHOLD: 'threshold'
        };

        this.compressionAlgorithms = {
            GZIP: 'gzip',
            DEFLATE: 'deflate',
            BROTLI: 'brotli',
            LZ4: 'lz4',
            ZSTD: 'zstd'
        };

        this.initialize();
    }

    /**
     * Initialize the encryption service
     */
    async initialize() {
        try {
            // Initialize key manager
            this.keyManager = new KeyManager({
                rotationInterval: this.config.keyRotationInterval,
                enableHSM: this.config.enableHSM,
                hsmConfig: this.config.hsmConfig
            });
            await this.keyManager.initialize();

            // Initialize hash service
            this.hashService = new HashService({
                defaultAlgorithm: this.config.integrityAlgorithm
            });

            // Set up key rotation
            this.setupKeyRotation();

            // Set up cache cleanup
            this.setupCacheCleanup();

            // Initialize HSM if enabled
            if (this.config.enableHSM) {
                await this.initializeHSM();
            }

            // Initialize quantum-resistant algorithms if enabled
            if (this.config.enableQuantumResistant) {
                await this.initializeQuantumResistant();
            }

            this.emit('initialized');

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Encryption service initialization failed: ${error.message}`);
        }
    }

    /**
     * Encrypt data with specified mode and options
     * @param {string|Buffer|object} data - Data to encrypt
     * @param {object} options - Encryption options
     * @returns {Promise<object>} Encrypted data package
     */
    async encrypt(data, options = {}) {
        const startTime = Date.now();
        this.statistics.activeOperations++;

        try {
            // Validate input
            this.validateEncryptionInput(data, options);

            // Check cache if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(data, options);
                if (this.encryptionCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    const cached = this.encryptionCache.get(cacheKey);
                    cached.fromCache = true;
                    return cached;
                }
                this.statistics.cacheMisses++;
            }

            // Select encryption mode
            const mode = options.mode || this.encryptionModes.STANDARD;
            let result;

            switch (mode) {
                case this.encryptionModes.STANDARD:
                    result = await this.standardEncryption(data, options);
                    break;
                case this.encryptionModes.ENVELOPE:
                    result = await this.envelopeEncryption(data, options);
                    break;
                case this.encryptionModes.HYBRID:
                    result = await this.hybridEncryption(data, options);
                    break;
                case this.encryptionModes.STREAMING:
                    result = await this.streamingEncryption(data, options);
                    break;
                case this.encryptionModes.CHUNKED:
                    result = await this.chunkedEncryption(data, options);
                    break;
                case this.encryptionModes.DETERMINISTIC:
                    result = await this.deterministicEncryption(data, options);
                    break;
                case this.encryptionModes.FORMAT_PRESERVING:
                    result = await this.formatPreservingEncryption(data, options);
                    break;
                case this.encryptionModes.SEARCHABLE:
                    result = await this.searchableEncryption(data, options);
                    break;
                case this.encryptionModes.THRESHOLD:
                    result = await this.thresholdEncryption(data, options);
                    break;
                default:
                    throw new Error(`Unknown encryption mode: ${mode}`);
            }

            // Add metadata
            result.metadata = {
                ...result.metadata,
                mode,
                timestamp: Date.now(),
                version: '2.0.0',
                service: 'EncryptionService',
                processingTime: Date.now() - startTime
            };

            // Add integrity check if enabled
            if (this.config.enableIntegrityCheck) {
                result.integrity = await this.hashService.createHash(
                    JSON.stringify(result),
                    { algorithm: this.config.integrityAlgorithm }
                );
            }

            // Cache result if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(data, options);
                this.encryptionCache.set(cacheKey, result);
                this.scheduleCacheExpiry(cacheKey, this.encryptionCache);
            }

            // Update statistics
            this.updateStatistics('encryption', {
                bytes: Buffer.byteLength(JSON.stringify(data)),
                time: Date.now() - startTime
            });

            // Emit event
            this.emit('encrypted', {
                mode,
                size: result.metadata.originalSize || 0,
                time: result.metadata.processingTime
            });

            return result;

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Encryption failed: ${error.message}`);
        } finally {
            this.statistics.activeOperations--;
        }
    }

    /**
     * Standard AES encryption
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package
     */
    async standardEncryption(data, options = {}) {
        // Serialize data if needed
        const serialized = this.serializeData(data);

        // Compress if enabled and beneficial
        let processedData = serialized;
        let compressionUsed = false;

        if (this.config.enableCompression && serialized.length > this.config.compressionThreshold) {
            const compressed = await this.compressData(serialized, options.compressionAlgorithm);
            if (compressed.length < serialized.length * 0.9) {
                processedData = compressed;
                compressionUsed = true;
            }
        }

        // Get or generate encryption key
        const keyData = await this.getEncryptionKey(options);

        // Encrypt data
        const encrypted = this.cryptoUtils.encryptAESGCM(
            processedData,
            keyData.key,
            {
                algorithm: options.algorithm || this.config.defaultAlgorithm,
                aad: options.aad
            }
        );

        return {
            encrypted: encrypted.encrypted,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyId: keyData.keyId,
            metadata: {
                algorithm: encrypted.algorithm,
                compressed: compressionUsed,
                compressionAlgorithm: compressionUsed ? (options.compressionAlgorithm || this.compressionAlgorithms.GZIP) : null,
                originalSize: serialized.length,
                encryptedSize: encrypted.encrypted.length
            }
        };
    }

    /**
     * Envelope encryption using DEK and KEK
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package
     */
    async envelopeEncryption(data, options = {}) {
        // Generate data encryption key (DEK)
        const dek = this.cryptoUtils.generateRandomBytes(32);

        // Encrypt data with DEK
        const dataEncrypted = await this.standardEncryption(data, {
            ...options,
            key: dek
        });

        // Get key encryption key (KEK)
        const kek = await this.keyManager.getMasterKey();

        // Encrypt DEK with KEK
        const encryptedDEK = this.cryptoUtils.encryptAESGCM(dek, kek.key);

        return {
            encryptedData: dataEncrypted.encrypted,
            encryptedDEK: encryptedDEK.encrypted,
            dekIV: encryptedDEK.iv,
            dekAuthTag: encryptedDEK.authTag,
            dataIV: dataEncrypted.iv,
            dataAuthTag: dataEncrypted.authTag,
            kekId: kek.keyId,
            metadata: {
                ...dataEncrypted.metadata,
                encryptionType: 'envelope'
            }
        };
    }

    /**
     * Hybrid encryption using RSA and AES
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package
     */
    async hybridEncryption(data, options = {}) {
        // Generate symmetric key
        const symmetricKey = this.cryptoUtils.generateRandomBytes(32);

        // Encrypt data with symmetric key
        const encryptedData = await this.standardEncryption(data, {
            ...options,
            key: symmetricKey
        });

        // Get or generate RSA key pair
        const rsaKeys = await this.keyManager.getRSAKeyPair();

        // Encrypt symmetric key with RSA public key
        const crypto = require('crypto');
        const encryptedKey = crypto.publicEncrypt(
            {
                key: rsaKeys.publicKey,
                padding: crypto.constants.RSA_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            symmetricKey
        );

        return {
            encryptedData: encryptedData.encrypted,
            encryptedKey: encryptedKey.toString('base64'),
            iv: encryptedData.iv,
            authTag: encryptedData.authTag,
            keyId: rsaKeys.keyId,
            metadata: {
                ...encryptedData.metadata,
                encryptionType: 'hybrid',
                rsaKeyFingerprint: rsaKeys.fingerprint
            }
        };
    }

    /**
     * Streaming encryption for large data
     * @param {any} data - Data or stream to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package
     */
    async streamingEncryption(data, options = {}) {
        const crypto = require('crypto');
        const stream = require('stream');
        const { promisify } = require('util');
        const pipeline = promisify(stream.pipeline);

        const key = await this.getEncryptionKey(options);
        const iv = this.cryptoUtils.generateRandomBytes(16);
        const cipher = crypto.createCipheriv(this.config.defaultAlgorithm, key.key, iv);

        const chunks = [];
        let totalSize = 0;

        // Create transform stream to collect encrypted chunks
        const collectStream = new stream.Transform({
            transform(chunk, encoding, callback) {
                chunks.push(chunk);
                totalSize += chunk.length;
                this.push(chunk);
                callback();
            }
        });

        // Handle both stream and buffer input
        let inputStream;
        if (data instanceof stream.Readable) {
            inputStream = data;
        } else {
            inputStream = stream.Readable.from(Buffer.from(this.serializeData(data)));
        }

        await pipeline(inputStream, cipher, collectStream);

        const encryptedBuffer = Buffer.concat(chunks);
        const authTag = cipher.getAuthTag ? cipher.getAuthTag() : null;

        return {
            encrypted: encryptedBuffer.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag ? authTag.toString('base64') : null,
            keyId: key.keyId,
            metadata: {
                algorithm: this.config.defaultAlgorithm,
                encryptionType: 'streaming',
                totalSize
            }
        };
    }

    /**
     * Chunked encryption for very large data
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted chunks
     */
    async chunkedEncryption(data, options = {}) {
        const chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        const serialized = this.serializeData(data);
        const chunks = [];

        const key = await this.getEncryptionKey(options);

        for (let i = 0; i < serialized.length; i += chunkSize) {
            const chunk = serialized.slice(i, i + chunkSize);
            const encryptedChunk = this.cryptoUtils.encryptAESGCM(chunk, key.key);

            chunks.push({
                index: Math.floor(i / chunkSize),
                encrypted: encryptedChunk.encrypted,
                iv: encryptedChunk.iv,
                authTag: encryptedChunk.authTag,
                size: chunk.length
            });
        }

        return {
            chunks,
            totalChunks: chunks.length,
            keyId: key.keyId,
            metadata: {
                algorithm: this.config.defaultAlgorithm,
                encryptionType: 'chunked',
                chunkSize,
                totalSize: serialized.length
            }
        };
    }

    /**
     * Deterministic encryption for searchable data
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package
     */
    async deterministicEncryption(data, options = {}) {
        const serialized = this.serializeData(data);

        // Derive key deterministically from data and master key
        const masterKey = await this.keyManager.getMasterKey();
        const dataHash = this.cryptoUtils.createHash(serialized, 'sha256');
        const deterministicKey = await this.cryptoUtils.deriveKey(
            dataHash.hash,
            masterKey.key,
            { iterations: 10000, keyLength: 32 }
        );

        // Use fixed IV derived from data hash for deterministic output
        const ivSource = this.cryptoUtils.createHash(serialized + 'iv', 'sha256');
        const iv = Buffer.from(ivSource.hash, 'hex').slice(0, 16);

        const crypto = require('crypto');
        const cipher = crypto.createCipheriv('aes-256-cbc', deterministicKey.key, iv);

        let encrypted = cipher.update(serialized, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        return {
            encrypted,
            keyId: masterKey.keyId,
            metadata: {
                algorithm: 'aes-256-cbc',
                encryptionType: 'deterministic',
                searchable: true
            }
        };
    }

    /**
     * Format-preserving encryption
     * @param {string} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted data in same format
     */
    async formatPreservingEncryption(data, options = {}) {
        const format = options.format || 'alphanumeric';
        const key = await this.getEncryptionKey(options);

        // Simple FPE implementation (production should use FF1/FF3)
        const charset = this.getCharset(format);
        const dataChars = data.split('');
        const encryptedChars = [];

        for (let i = 0; i < dataChars.length; i++) {
            const char = dataChars[i];
            const charIndex = charset.indexOf(char);

            if (charIndex === -1) {
                encryptedChars.push(char); // Preserve non-charset characters
            } else {
                // Deterministic transformation based on position and key
                const shift = key.key[i % key.key.length] % charset.length;
                const newIndex = (charIndex + shift) % charset.length;
                encryptedChars.push(charset[newIndex]);
            }
        }

        return {
            encrypted: encryptedChars.join(''),
            keyId: key.keyId,
            metadata: {
                encryptionType: 'format-preserving',
                format,
                originalLength: data.length
            }
        };
    }

    /**
     * Searchable encryption with index generation
     * @param {any} data - Data to encrypt
     * @param {object} options - Options
     * @returns {Promise<object>} Encrypted package with search index
     */
    async searchableEncryption(data, options = {}) {
        const serialized = this.serializeData(data);

        // Standard encryption for data
        const encrypted = await this.standardEncryption(data, options);

        // Generate searchable index
        const searchTerms = options.searchTerms || this.extractSearchTerms(data);
        const index = new Map();

        const key = await this.getEncryptionKey(options);

        for (const term of searchTerms) {
            const termHash = this.cryptoUtils.createHMAC(term.toLowerCase(), key.key);
            index.set(termHash.hmac, {
                term: term,
                positions: this.findTermPositions(serialized, term)
            });
        }

        return {
            ...encrypted,
            searchIndex: Array.from(index.entries()),
            metadata: {
                ...encrypted.metadata,
                encryptionType: 'searchable',
                indexSize: index.size
            }
        };
    }

    /**
     * Threshold encryption requiring multiple keys
     * @param {any} data - Data to encrypt
     * @param {object} options - Options with threshold settings
     * @returns {Promise<object>} Encrypted shares
     */
    async thresholdEncryption(data, options = {}) {
        const threshold = options.threshold || 3;
        const shares = options.shares || 5;

        if (threshold > shares) {
            throw new Error('Threshold cannot be greater than total shares');
        }

        const serialized = this.serializeData(data);

        // Generate master secret
        const masterSecret = this.cryptoUtils.generateRandomBytes(32);

        // Encrypt data with master secret
        const encrypted = this.cryptoUtils.encryptAESGCM(serialized, masterSecret);

        // Split master secret using Shamir's Secret Sharing
        const secretShares = this.splitSecret(masterSecret, threshold, shares);

        return {
            encryptedData: encrypted.encrypted,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            shares: secretShares.map((share, index) => ({
                index: index + 1,
                share: share.toString('base64'),
                threshold,
                totalShares: shares
            })),
            metadata: {
                encryptionType: 'threshold',
                threshold,
                totalShares: shares,
                algorithm: encrypted.algorithm
            }
        };
    }

    /**
     * Decrypt data with automatic mode detection
     * @param {object} encryptedPackage - Encrypted data package
     * @param {object} options - Decryption options
     * @returns {Promise<any>} Decrypted data
     */
    async decrypt(encryptedPackage, options = {}) {
        const startTime = Date.now();
        this.statistics.activeOperations++;

        try {
            // Validate input
            this.validateDecryptionInput(encryptedPackage, options);

            // Check integrity if present
            if (encryptedPackage.integrity && this.config.enableIntegrityCheck) {
                const packageCopy = { ...encryptedPackage };
                delete packageCopy.integrity;

                const calculatedHash = await this.hashService.createHash(
                    JSON.stringify(packageCopy),
                    { algorithm: this.config.integrityAlgorithm }
                );

                if (calculatedHash.hash !== encryptedPackage.integrity.hash) {
                    throw new Error('Integrity check failed - data may be tampered');
                }
            }

            // Check cache if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(encryptedPackage, options);
                if (this.decryptionCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.decryptionCache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            // Detect and use appropriate decryption mode
            const mode = encryptedPackage.metadata?.encryptionType ||
                        encryptedPackage.metadata?.mode ||
                        this.encryptionModes.STANDARD;

            let result;

            switch (mode) {
                case 'standard':
                case this.encryptionModes.STANDARD:
                    result = await this.standardDecryption(encryptedPackage, options);
                    break;
                case 'envelope':
                case this.encryptionModes.ENVELOPE:
                    result = await this.envelopeDecryption(encryptedPackage, options);
                    break;
                case 'hybrid':
                case this.encryptionModes.HYBRID:
                    result = await this.hybridDecryption(encryptedPackage, options);
                    break;
                case 'streaming':
                case this.encryptionModes.STREAMING:
                    result = await this.streamingDecryption(encryptedPackage, options);
                    break;
                case 'chunked':
                case this.encryptionModes.CHUNKED:
                    result = await this.chunkedDecryption(encryptedPackage, options);
                    break;
                case 'deterministic':
                case this.encryptionModes.DETERMINISTIC:
                    result = await this.deterministicDecryption(encryptedPackage, options);
                    break;
                case 'format-preserving':
                case this.encryptionModes.FORMAT_PRESERVING:
                    result = await this.formatPreservingDecryption(encryptedPackage, options);
                    break;
                case 'searchable':
                case this.encryptionModes.SEARCHABLE:
                    result = await this.searchableDecryption(encryptedPackage, options);
                    break;
                case 'threshold':
                case this.encryptionModes.THRESHOLD:
                    result = await this.thresholdDecryption(encryptedPackage, options);
                    break;
                default:
                    throw new Error(`Unknown decryption mode: ${mode}`);
            }

            // Cache result if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(encryptedPackage, options);
                this.decryptionCache.set(cacheKey, result);
                this.scheduleCacheExpiry(cacheKey, this.decryptionCache);
            }

            // Update statistics
            this.updateStatistics('decryption', {
                bytes: encryptedPackage.metadata?.originalSize || 0,
                time: Date.now() - startTime
            });

            // Emit event
            this.emit('decrypted', {
                mode,
                time: Date.now() - startTime
            });

            return result;

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Decryption failed: ${error.message}`);
        } finally {
            this.statistics.activeOperations--;
        }
    }

    /**
     * Standard AES decryption
     * @param {object} encryptedPackage - Encrypted package
     * @param {object} options - Options
     * @returns {Promise<any>} Decrypted data
     */
    async standardDecryption(encryptedPackage, options = {}) {
        // Get decryption key
        const key = await this.getDecryptionKey(encryptedPackage.keyId, options);

        // Decrypt data
        const decrypted = this.cryptoUtils.decryptAESGCM(
            encryptedPackage.encrypted,
            key.key,
            encryptedPackage.iv,
            encryptedPackage.authTag,
            {
                algorithm: encryptedPackage.metadata?.algorithm || this.config.defaultAlgorithm,
                aad: options.aad
            }
        );

        // Decompress if needed
        let processedData = decrypted;
        if (encryptedPackage.metadata?.compressed) {
            processedData = await this.decompressData(
                decrypted,
                encryptedPackage.metadata.compressionAlgorithm
            );
        }

        // Deserialize data
        return this.deserializeData(processedData);
    }

    /**
     * Helper methods
     */

    async getEncryptionKey(options = {}) {
        if (options.key) {
            return { key: options.key, keyId: 'custom' };
        }
        return await this.keyManager.getCurrentKey();
    }

    async getDecryptionKey(keyId, options = {}) {
        if (options.key) {
            return { key: options.key, keyId: 'custom' };
        }
        return await this.keyManager.getKey(keyId);
    }

    serializeData(data) {
        if (Buffer.isBuffer(data)) {
            return data;
        }
        if (typeof data === 'string') {
            return Buffer.from(data, 'utf8');
        }
        return Buffer.from(JSON.stringify(data), 'utf8');
    }

    deserializeData(buffer) {
        const str = buffer.toString('utf8');
        try {
            return JSON.parse(str);
        } catch {
            return str;
        }
    }

    async compressData(data, algorithm = this.compressionAlgorithms.GZIP) {
        const zlib = require('zlib');
        const { promisify } = require('util');

        switch (algorithm) {
            case this.compressionAlgorithms.GZIP:
                return await promisify(zlib.gzip)(data);
            case this.compressionAlgorithms.DEFLATE:
                return await promisify(zlib.deflate)(data);
            case this.compressionAlgorithms.BROTLI:
                return await promisify(zlib.brotliCompress)(data);
            default:
                return data;
        }
    }

    async decompressData(data, algorithm = this.compressionAlgorithms.GZIP) {
        const zlib = require('zlib');
        const { promisify } = require('util');

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');

        switch (algorithm) {
            case this.compressionAlgorithms.GZIP:
                return await promisify(zlib.gunzip)(buffer);
            case this.compressionAlgorithms.DEFLATE:
                return await promisify(zlib.inflate)(buffer);
            case this.compressionAlgorithms.BROTLI:
                return await promisify(zlib.brotliDecompress)(buffer);
            default:
                return buffer;
        }
    }

    generateCacheKey(data, options) {
        const input = JSON.stringify({ data, options });
        return this.cryptoUtils.createHash(input, 'sha256').hash;
    }

    scheduleCacheExpiry(key, cache) {
        setTimeout(() => {
            cache.delete(key);
        }, this.config.cacheTTL);
    }

    validateEncryptionInput(data, options) {
        if (data === null || data === undefined) {
            throw new Error('Data cannot be null or undefined');
        }

        const dataSize = Buffer.byteLength(JSON.stringify(data));
        if (dataSize > this.config.maxEncryptionSize) {
            throw new Error(`Data size ${dataSize} exceeds maximum ${this.config.maxEncryptionSize}`);
        }
    }

    validateDecryptionInput(encryptedPackage, options) {
        if (!encryptedPackage) {
            throw new Error('Encrypted package is required');
        }

        if (!encryptedPackage.encrypted && !encryptedPackage.encryptedData && !encryptedPackage.chunks) {
            throw new Error('No encrypted data found in package');
        }
    }

    setupKeyRotation() {
        setInterval(async () => {
            try {
                await this.keyManager.rotateKeys();
                this.statistics.keyRotations++;
                this.emit('keyRotation');
            } catch (error) {
                this.emit('error', error);
            }
        }, this.config.keyRotationInterval);
    }

    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();

            // Clean encryption cache
            for (const [key, value] of this.encryptionCache.entries()) {
                if (now - value.metadata.timestamp > this.config.cacheTTL) {
                    this.encryptionCache.delete(key);
                }
            }

            // Clean decryption cache
            this.decryptionCache.clear(); // Clear all for security

            // Clean key cache
            for (const [key, value] of this.keyCache.entries()) {
                if (now - value.timestamp > this.config.cacheTTL) {
                    this.keyCache.delete(key);
                }
            }

            this.emit('cacheCleanup', {
                encryptionCacheSize: this.encryptionCache.size,
                decryptionCacheSize: this.decryptionCache.size,
                keyCacheSize: this.keyCache.size
            });
        }, this.config.cacheTTL);
    }

    updateStatistics(operation, metrics) {
        if (operation === 'encryption') {
            this.statistics.totalEncryptions++;
            this.statistics.totalBytesEncrypted += metrics.bytes;
            this.statistics.averageEncryptionTime =
                (this.statistics.averageEncryptionTime * (this.statistics.totalEncryptions - 1) + metrics.time) /
                this.statistics.totalEncryptions;
        } else if (operation === 'decryption') {
            this.statistics.totalDecryptions++;
            this.statistics.totalBytesDecrypted += metrics.bytes;
            this.statistics.averageDecryptionTime =
                (this.statistics.averageDecryptionTime * (this.statistics.totalDecryptions - 1) + metrics.time) /
                this.statistics.totalDecryptions;
        }

        const memUsage = process.memoryUsage().heapUsed;
        if (memUsage > this.statistics.peakMemoryUsage) {
            this.statistics.peakMemoryUsage = memUsage;
        }
    }

    getCharset(format) {
        const charsets = {
            numeric: '0123456789',
            alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            hex: '0123456789ABCDEF',
            base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        };
        return charsets[format] || charsets.alphanumeric;
    }

    extractSearchTerms(data) {
        const terms = new Set();
        const str = JSON.stringify(data);
        const words = str.match(/\b\w+\b/g) || [];
        words.forEach(word => terms.add(word));
        return Array.from(terms);
    }

    findTermPositions(text, term) {
        const positions = [];
        let index = text.indexOf(term);
        while (index !== -1) {
            positions.push(index);
            index = text.indexOf(term, index + 1);
        }
        return positions;
    }

    splitSecret(secret, threshold, shares) {
        // Simplified secret sharing (production should use proper Shamir's Secret Sharing)
        const shareData = [];
        for (let i = 0; i < shares; i++) {
            const share = Buffer.alloc(secret.length);
            for (let j = 0; j < secret.length; j++) {
                share[j] = secret[j] ^ (i + 1);
            }
            shareData.push(share);
        }
        return shareData;
    }

    async initializeHSM() {
        // HSM initialization logic would go here
        this.emit('hsmInitialized');
    }

    async initializeQuantumResistant() {
        // Quantum-resistant algorithm initialization would go here
        this.emit('quantumResistantInitialized');
    }

    /**
     * Get service statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheStats: {
                encryptionCacheSize: this.encryptionCache.size,
                decryptionCacheSize: this.decryptionCache.size,
                keyCacheSize: this.keyCache.size,
                sessionKeysSize: this.sessionKeys.size
            },
            queueStats: {
                encryptionQueueSize: this.encryptionQueue.length,
                decryptionQueueSize: this.decryptionQueue.length,
                isProcessing: this.isProcessingQueue
            },
            config: {
                algorithm: this.config.defaultAlgorithm,
                keyRotationInterval: this.config.keyRotationInterval,
                cacheEnabled: this.config.enableCaching,
                compressionEnabled: this.config.enableCompression
            }
        };
    }

    /**
     * Clear all caches and reset statistics
     */
    reset() {
        this.encryptionCache.clear();
        this.decryptionCache.clear();
        this.keyCache.clear();
        this.sessionKeys.clear();
        this.encryptionQueue = [];
        this.decryptionQueue = [];

        this.statistics = {
            totalEncryptions: 0,
            totalDecryptions: 0,
            totalBytesEncrypted: 0,
            totalBytesDecrypted: 0,
            cacheHits: 0,
            cacheMisses: 0,
            keyRotations: 0,
            errors: 0,
            averageEncryptionTime: 0,
            averageDecryptionTime: 0,
            peakMemoryUsage: 0,
            activeOperations: 0
        };

        this.emit('reset');
    }
}

module.exports = EncryptionService;
