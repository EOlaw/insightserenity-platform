const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { EventEmitter } = require('events');
const CryptoUtils = require('./crypto-utils');

/**
 * HashService - Comprehensive hashing service for data integrity and security
 * Provides multiple hashing algorithms, HMAC, and integrity verification
 */
class HashService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            defaultAlgorithm: config.defaultAlgorithm || 'sha256',
            defaultEncoding: config.defaultEncoding || 'hex',
            saltLength: config.saltLength || 32,
            iterations: config.iterations || 100000,
            enableCaching: config.enableCaching !== false,
            cacheSize: config.cacheSize || 1000,
            cacheTTL: config.cacheTTL || 3600000, // 1 hour
            enableStreaming: config.enableStreaming !== false,
            chunkSize: config.chunkSize || 65536, // 64KB
            enableParallel: config.enableParallel || false,
            workerThreads: config.workerThreads || 4,
            enableProgressiveHashing: config.enableProgressiveHashing || false,
            enableTreeHashing: config.enableTreeHashing || false,
            enableBloomFilter: config.enableBloomFilter || false,
            bloomFilterSize: config.bloomFilterSize || 10000,
            bloomFilterHashes: config.bloomFilterHashes || 3
        };

        this.cryptoUtils = new CryptoUtils();

        this.algorithms = {
            MD5: 'md5',
            SHA1: 'sha1',
            SHA224: 'sha224',
            SHA256: 'sha256',
            SHA384: 'sha384',
            SHA512: 'sha512',
            SHA3_224: 'sha3-224',
            SHA3_256: 'sha3-256',
            SHA3_384: 'sha3-384',
            SHA3_512: 'sha3-512',
            BLAKE2B512: 'blake2b512',
            BLAKE2S256: 'blake2s256',
            SHAKE128: 'shake128',
            SHAKE256: 'shake256',
            RIPEMD160: 'ripemd160',
            WHIRLPOOL: 'whirlpool'
        };

        this.encodings = {
            HEX: 'hex',
            BASE64: 'base64',
            BASE64URL: 'base64url',
            BINARY: 'binary',
            UTF8: 'utf8',
            ASCII: 'ascii',
            LATIN1: 'latin1'
        };

        this.hashCache = new Map();
        this.hmacCache = new Map();
        this.progressiveHashes = new Map();
        this.bloomFilter = null;

        this.statistics = {
            totalHashes: 0,
            totalHMACs: 0,
            totalVerifications: 0,
            cacheHits: 0,
            cacheMisses: 0,
            bytesHashed: 0,
            averageHashTime: 0,
            errors: 0,
            algorithmUsage: {},
            peakMemoryUsage: 0
        };

        this.hashModes = {
            STANDARD: 'standard',
            SALTED: 'salted',
            ITERATIVE: 'iterative',
            PROGRESSIVE: 'progressive',
            PARALLEL: 'parallel',
            STREAMING: 'streaming',
            TREE: 'tree',
            CASCADE: 'cascade',
            COMPOSITE: 'composite'
        };

        this.integrityModes = {
            BASIC: 'basic',
            HMAC: 'hmac',
            DOUBLE: 'double',
            KEYED: 'keyed',
            MERKLE: 'merkle'
        };

        this.initialize();
    }

    /**
     * Initialize the hash service
     */
    initialize() {
        try {
            // Initialize algorithm usage statistics
            for (const algo of Object.values(this.algorithms)) {
                this.statistics.algorithmUsage[algo] = 0;
            }

            // Initialize bloom filter if enabled
            if (this.config.enableBloomFilter) {
                this.initializeBloomFilter();
            }

            // Set up cache cleanup
            this.setupCacheCleanup();

            // Initialize worker threads if parallel hashing is enabled
            if (this.config.enableParallel) {
                this.initializeWorkers();
            }

            this.emit('initialized');

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Hash service initialization failed: ${error.message}`);
        }
    }

    /**
     * Create hash with multiple options
     * @param {string|Buffer} data - Data to hash
     * @param {object} options - Hashing options
     * @returns {Promise<object>} Hash result
     */
    async createHash(data, options = {}) {
        const startTime = Date.now();

        try {
            // Validate input
            this.validateInput(data, options);

            // Check cache if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(data, options);
                if (this.hashCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.hashCache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            // Select hashing mode
            const mode = options.mode || this.hashModes.STANDARD;
            let result;

            switch (mode) {
                case this.hashModes.STANDARD:
                    result = await this.standardHash(data, options);
                    break;
                case this.hashModes.SALTED:
                    result = await this.saltedHash(data, options);
                    break;
                case this.hashModes.ITERATIVE:
                    result = await this.iterativeHash(data, options);
                    break;
                case this.hashModes.PROGRESSIVE:
                    result = await this.progressiveHash(data, options);
                    break;
                case this.hashModes.PARALLEL:
                    result = await this.parallelHash(data, options);
                    break;
                case this.hashModes.STREAMING:
                    result = await this.streamingHash(data, options);
                    break;
                case this.hashModes.TREE:
                    result = await this.treeHash(data, options);
                    break;
                case this.hashModes.CASCADE:
                    result = await this.cascadeHash(data, options);
                    break;
                case this.hashModes.COMPOSITE:
                    result = await this.compositeHash(data, options);
                    break;
                default:
                    throw new Error(`Unknown hash mode: ${mode}`);
            }

            // Add metadata
            result.metadata = {
                ...result.metadata,
                mode,
                timestamp: Date.now(),
                processingTime: Date.now() - startTime,
                dataSize: Buffer.byteLength(data)
            };

            // Cache result if enabled
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateCacheKey(data, options);
                this.hashCache.set(cacheKey, result);
                this.scheduleCacheExpiry(cacheKey, this.hashCache);
            }

            // Update bloom filter if enabled
            if (this.config.enableBloomFilter) {
                this.bloomFilter.add(result.hash);
            }

            // Update statistics
            this.updateStatistics(result.algorithm, {
                bytes: result.metadata.dataSize,
                time: result.metadata.processingTime
            });

            this.emit('hashCreated', result);

            return result;

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Hash creation failed: ${error.message}`);
        }
    }

    /**
     * Hash password using bcrypt
     * @param {string} password - Plain text password
     * @param {number} saltRounds - Cost factor (default: 10)
     * @returns {Promise<string>} Hashed password
     */
    static async hashPassword(password, saltRounds = 10) {
        return await bcrypt.hash(password, saltRounds);
    }

    /**
     * Compare password with hash
     * @param {string} candidatePassword - Plain text password to check
     * @param {string} hashedPassword - Hashed password to compare against
     * @returns {Promise<boolean>} True if password matches
     */
    static async comparePassword(candidatePassword, hashedPassword) {
        return await bcrypt.compare(candidatePassword, hashedPassword);
    }

    /**
     * Hash token using SHA256
     * @param {string} token - Token to hash
     * @returns {Promise<string>} Hashed token
     */
    static async hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Standard hash creation
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async standardHash(data, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        const hash = crypto.createHash(algorithm);
        hash.update(data);

        const digest = hash.digest(encoding);

        return {
            hash: digest,
            algorithm,
            encoding,
            metadata: {}
        };
    }

    /**
     * Salted hash creation
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async saltedHash(data, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;
        const salt = options.salt || this.cryptoUtils.generateRandomBytes(this.config.saltLength);

        const hash = crypto.createHash(algorithm);
        hash.update(salt);
        hash.update(data);

        const digest = hash.digest(encoding);

        return {
            hash: digest,
            salt: salt.toString(encoding),
            algorithm,
            encoding,
            metadata: {
                saltLength: salt.length
            }
        };
    }

    /**
     * Iterative hash creation (key stretching)
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async iterativeHash(data, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;
        const iterations = options.iterations || this.config.iterations;
        const salt = options.salt || this.cryptoUtils.generateRandomBytes(this.config.saltLength);

        let hash = Buffer.from(data);

        for (let i = 0; i < iterations; i++) {
            const hasher = crypto.createHash(algorithm);
            hasher.update(salt);
            hasher.update(hash);
            hash = hasher.digest();
        }

        return {
            hash: hash.toString(encoding),
            salt: salt.toString(encoding),
            iterations,
            algorithm,
            encoding,
            metadata: {
                method: 'iterative'
            }
        };
    }

    /**
     * Progressive hash that can be updated incrementally
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async progressiveHash(data, options = {}) {
        const sessionId = options.sessionId || this.cryptoUtils.generateUUID().uuid;
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        let hasher;

        if (this.progressiveHashes.has(sessionId)) {
            hasher = this.progressiveHashes.get(sessionId);
        } else {
            hasher = crypto.createHash(algorithm);
            this.progressiveHashes.set(sessionId, hasher);
        }

        hasher.update(data);

        let result = {
            sessionId,
            algorithm,
            encoding,
            metadata: {
                progressive: true,
                finalized: false
            }
        };

        if (options.finalize) {
            result.hash = hasher.digest(encoding);
            result.metadata.finalized = true;
            this.progressiveHashes.delete(sessionId);
        }

        return result;
    }

    /**
     * Parallel hash using multiple algorithms
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash results
     */
    async parallelHash(data, options = {}) {
        const algorithms = options.algorithms || [
            this.algorithms.SHA256,
            this.algorithms.SHA512,
            this.algorithms.SHA3_256
        ];
        const encoding = options.encoding || this.config.defaultEncoding;

        const hashPromises = algorithms.map(algo =>
            this.standardHash(data, { algorithm: algo, encoding })
        );

        const results = await Promise.all(hashPromises);

        const hashes = {};
        results.forEach(result => {
            hashes[result.algorithm] = result.hash;
        });

        return {
            hashes,
            primary: hashes[algorithms[0]],
            algorithms,
            encoding,
            metadata: {
                parallel: true,
                algorithmCount: algorithms.length
            }
        };
    }

    /**
     * Streaming hash for large data
     * @param {stream.Readable|string} input - Input stream or file path
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async streamingHash(input, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        return new Promise((resolve, reject) => {
            const hash = crypto.createHash(algorithm);
            let totalBytes = 0;
            let stream;

            if (typeof input === 'string') {
                const fs = require('fs');
                stream = fs.createReadStream(input);
            } else {
                stream = input;
            }

            stream.on('data', (chunk) => {
                hash.update(chunk);
                totalBytes += chunk.length;

                if (options.progressCallback) {
                    options.progressCallback({
                        bytes: totalBytes,
                        chunk: chunk.length
                    });
                }
            });

            stream.on('end', () => {
                const digest = hash.digest(encoding);
                resolve({
                    hash: digest,
                    algorithm,
                    encoding,
                    metadata: {
                        streaming: true,
                        totalBytes
                    }
                });
            });

            stream.on('error', (error) => {
                this.statistics.errors++;
                reject(error);
            });
        });
    }

    /**
     * Tree hash (Merkle tree) for data verification
     * @param {array} dataArray - Array of data items
     * @param {object} options - Options
     * @returns {Promise<object>} Tree hash result
     */
    async treeHash(dataArray, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        if (!Array.isArray(dataArray)) {
            dataArray = [dataArray];
        }

        // Create leaf hashes
        const leafHashes = await Promise.all(
            dataArray.map(data => this.standardHash(data, { algorithm, encoding }))
        );

        // Build tree
        let level = leafHashes.map(h => h.hash);
        const tree = [level];

        while (level.length > 1) {
            const nextLevel = [];

            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = level[i + 1] || level[i];

                const combined = crypto.createHash(algorithm);
                combined.update(left);
                combined.update(right);
                nextLevel.push(combined.digest(encoding));
            }

            tree.push(nextLevel);
            level = nextLevel;
        }

        return {
            root: level[0],
            tree,
            leaves: leafHashes.map(h => h.hash),
            algorithm,
            encoding,
            metadata: {
                treeHeight: tree.length,
                leafCount: dataArray.length
            }
        };
    }

    /**
     * Cascade hash using multiple algorithms in sequence
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async cascadeHash(data, options = {}) {
        const algorithms = options.algorithms || [
            this.algorithms.SHA256,
            this.algorithms.SHA512,
            this.algorithms.SHA3_256
        ];
        const encoding = options.encoding || this.config.defaultEncoding;

        let result = data;
        const cascade = [];

        for (const algorithm of algorithms) {
            const hash = crypto.createHash(algorithm);
            hash.update(result);
            result = hash.digest();

            cascade.push({
                algorithm,
                hash: result.toString(encoding)
            });
        }

        return {
            hash: result.toString(encoding),
            cascade,
            algorithms,
            encoding,
            metadata: {
                cascadeLength: algorithms.length
            }
        };
    }

    /**
     * Composite hash combining multiple techniques
     * @param {any} data - Data to hash
     * @param {object} options - Options
     * @returns {Promise<object>} Hash result
     */
    async compositeHash(data, options = {}) {
        const encoding = options.encoding || this.config.defaultEncoding;

        // Standard hash
        const standard = await this.standardHash(data, options);

        // Salted hash
        const salted = await this.saltedHash(data, options);

        // HMAC
        const hmacKey = options.hmacKey || this.cryptoUtils.generateRandomBytes(32);
        const hmac = await this.createHMAC(data, hmacKey, options);

        // Combine all hashes
        const combined = crypto.createHash(this.config.defaultAlgorithm);
        combined.update(standard.hash);
        combined.update(salted.hash);
        combined.update(hmac.hmac);

        const composite = combined.digest(encoding);

        return {
            hash: composite,
            components: {
                standard: standard.hash,
                salted: salted.hash,
                hmac: hmac.hmac
            },
            salt: salted.salt,
            encoding,
            metadata: {
                composite: true,
                componentCount: 3
            }
        };
    }

    /**
     * Create HMAC for data authentication
     * @param {string|Buffer} data - Data to authenticate
     * @param {string|Buffer} key - Secret key
     * @param {object} options - HMAC options
     * @returns {Promise<object>} HMAC result
     */
    async createHMAC(data, key, options = {}) {
        const startTime = Date.now();

        try {
            const algorithm = options.algorithm || this.config.defaultAlgorithm;
            const encoding = options.encoding || this.config.defaultEncoding;

            // Check cache
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateHMACCacheKey(data, key, options);
                if (this.hmacCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.hmacCache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            const hmac = crypto.createHmac(algorithm, key);
            hmac.update(data);
            const digest = hmac.digest(encoding);

            const result = {
                hmac: digest,
                algorithm,
                encoding,
                keyLength: key.length,
                metadata: {
                    timestamp: Date.now(),
                    processingTime: Date.now() - startTime
                }
            };

            // Cache result
            if (this.config.enableCaching && !options.skipCache) {
                const cacheKey = this.generateHMACCacheKey(data, key, options);
                this.hmacCache.set(cacheKey, result);
                this.scheduleCacheExpiry(cacheKey, this.hmacCache);
            }

            this.statistics.totalHMACs++;
            this.emit('hmacCreated', result);

            return result;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`HMAC creation failed: ${error.message}`);
        }
    }

    /**
     * Verify data integrity using hash
     * @param {any} data - Data to verify
     * @param {string} expectedHash - Expected hash value
     * @param {object} options - Verification options
     * @returns {Promise<object>} Verification result
     */
    async verifyIntegrity(data, expectedHash, options = {}) {
        const startTime = Date.now();

        try {
            const mode = options.mode || this.integrityModes.BASIC;
            let result;

            switch (mode) {
                case this.integrityModes.BASIC:
                    result = await this.basicVerification(data, expectedHash, options);
                    break;
                case this.integrityModes.HMAC:
                    result = await this.hmacVerification(data, expectedHash, options);
                    break;
                case this.integrityModes.DOUBLE:
                    result = await this.doubleHashVerification(data, expectedHash, options);
                    break;
                case this.integrityModes.KEYED:
                    result = await this.keyedHashVerification(data, expectedHash, options);
                    break;
                case this.integrityModes.MERKLE:
                    result = await this.merkleVerification(data, expectedHash, options);
                    break;
                default:
                    throw new Error(`Unknown integrity mode: ${mode}`);
            }

            result.metadata = {
                ...result.metadata,
                mode,
                verificationTime: Date.now() - startTime
            };

            this.statistics.totalVerifications++;
            this.emit('integrityVerified', result);

            return result;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Integrity verification failed: ${error.message}`);
        }
    }

    /**
     * Basic hash verification
     * @param {any} data - Data to verify
     * @param {string} expectedHash - Expected hash
     * @param {object} options - Options
     * @returns {Promise<object>} Verification result
     */
    async basicVerification(data, expectedHash, options = {}) {
        const hashResult = await this.createHash(data, options);
        const isValid = this.constantTimeCompare(hashResult.hash, expectedHash);

        return {
            isValid,
            actualHash: hashResult.hash,
            expectedHash,
            algorithm: hashResult.algorithm,
            metadata: {}
        };
    }

    /**
     * HMAC verification
     * @param {any} data - Data to verify
     * @param {string} expectedHMAC - Expected HMAC
     * @param {object} options - Options with key
     * @returns {Promise<object>} Verification result
     */
    async hmacVerification(data, expectedHMAC, options = {}) {
        if (!options.key) {
            throw new Error('HMAC verification requires a key');
        }

        const hmacResult = await this.createHMAC(data, options.key, options);
        const isValid = this.constantTimeCompare(hmacResult.hmac, expectedHMAC);

        return {
            isValid,
            actualHMAC: hmacResult.hmac,
            expectedHMAC,
            algorithm: hmacResult.algorithm,
            metadata: {
                keyLength: options.key.length
            }
        };
    }

    /**
     * Double hash verification for extra security
     * @param {any} data - Data to verify
     * @param {string} expectedHash - Expected double hash
     * @param {object} options - Options
     * @returns {Promise<object>} Verification result
     */
    async doubleHashVerification(data, expectedHash, options = {}) {
        const firstHash = await this.createHash(data, options);
        const secondHash = await this.createHash(firstHash.hash, options);
        const isValid = this.constantTimeCompare(secondHash.hash, expectedHash);

        return {
            isValid,
            actualHash: secondHash.hash,
            expectedHash,
            algorithm: secondHash.algorithm,
            metadata: {
                doubleHashed: true
            }
        };
    }

    /**
     * Keyed hash verification
     * @param {any} data - Data to verify
     * @param {string} expectedHash - Expected keyed hash
     * @param {object} options - Options with key
     * @returns {Promise<object>} Verification result
     */
    async keyedHashVerification(data, expectedHash, options = {}) {
        if (!options.key) {
            throw new Error('Keyed hash verification requires a key');
        }

        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        const hash = crypto.createHash(algorithm);
        hash.update(options.key);
        hash.update(data);
        const digest = hash.digest(encoding);

        const isValid = this.constantTimeCompare(digest, expectedHash);

        return {
            isValid,
            actualHash: digest,
            expectedHash,
            algorithm,
            metadata: {
                keyed: true
            }
        };
    }

    /**
     * Merkle tree verification
     * @param {any} data - Data to verify
     * @param {object} proof - Merkle proof
     * @param {object} options - Options
     * @returns {Promise<object>} Verification result
     */
    async merkleVerification(data, proof, options = {}) {
        const algorithm = options.algorithm || this.config.defaultAlgorithm;
        const encoding = options.encoding || this.config.defaultEncoding;

        // Hash the data
        const dataHash = await this.createHash(data, { algorithm, encoding });

        // Verify using Merkle proof
        let currentHash = dataHash.hash;

        for (const proofElement of proof.path) {
            const combined = crypto.createHash(algorithm);

            if (proofElement.position === 'left') {
                combined.update(proofElement.hash);
                combined.update(currentHash);
            } else {
                combined.update(currentHash);
                combined.update(proofElement.hash);
            }

            currentHash = combined.digest(encoding);
        }

        const isValid = this.constantTimeCompare(currentHash, proof.root);

        return {
            isValid,
            computedRoot: currentHash,
            expectedRoot: proof.root,
            algorithm,
            metadata: {
                pathLength: proof.path.length
            }
        };
    }

    /**
     * Generate file fingerprint
     * @param {string} filePath - File path
     * @param {object} options - Options
     * @returns {Promise<object>} Fingerprint
     */
    async generateFileFingerprint(filePath, options = {}) {
        const fs = require('fs').promises;
        const stats = await fs.stat(filePath);

        // Generate hash of file content
        const contentHash = await this.streamingHash(filePath, options);

        // Combine multiple attributes for fingerprint
        const fingerprintData = {
            contentHash: contentHash.hash,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            algorithm: contentHash.algorithm
        };

        const fingerprint = await this.createHash(
            JSON.stringify(fingerprintData),
            { algorithm: this.algorithms.SHA256 }
        );

        return {
            fingerprint: fingerprint.hash,
            attributes: fingerprintData,
            metadata: {
                filePath,
                generated: new Date().toISOString()
            }
        };
    }

    /**
     * Check if hash exists in bloom filter
     * @param {string} hash - Hash to check
     * @returns {boolean} Possibly exists
     */
    checkBloomFilter(hash) {
        if (!this.bloomFilter) {
            return false;
        }

        return this.bloomFilter.contains(hash);
    }

    /**
     * Helper methods
     */

    validateInput(data, options) {
        if (data === null || data === undefined) {
            throw new Error('Data cannot be null or undefined');
        }

        if (options.algorithm && !Object.values(this.algorithms).includes(options.algorithm)) {
            throw new Error(`Unsupported algorithm: ${options.algorithm}`);
        }

        if (options.encoding && !Object.values(this.encodings).includes(options.encoding)) {
            throw new Error(`Unsupported encoding: ${options.encoding}`);
        }
    }

    generateCacheKey(data, options) {
        const input = JSON.stringify({
            data: data.toString().substring(0, 100),
            algorithm: options.algorithm || this.config.defaultAlgorithm,
            encoding: options.encoding || this.config.defaultEncoding,
            mode: options.mode
        });

        return crypto.createHash('md5').update(input).digest('hex');
    }

    generateHMACCacheKey(data, key, options) {
        const input = JSON.stringify({
            data: data.toString().substring(0, 100),
            key: key.toString().substring(0, 20),
            algorithm: options.algorithm || this.config.defaultAlgorithm,
            encoding: options.encoding || this.config.defaultEncoding
        });

        return crypto.createHash('md5').update(input).digest('hex');
    }

    scheduleCacheExpiry(key, cache) {
        setTimeout(() => {
            cache.delete(key);
        }, this.config.cacheTTL);
    }

    constantTimeCompare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        if (a.length !== b.length) {
            return false;
        }

        const bufferA = Buffer.from(a);
        const bufferB = Buffer.from(b);

        return crypto.timingSafeEqual(bufferA, bufferB);
    }

    setupCacheCleanup() {
        setInterval(() => {
            // Clean old cache entries
            const maxSize = this.config.cacheSize;

            if (this.hashCache.size > maxSize) {
                const toDelete = this.hashCache.size - maxSize;
                const keys = Array.from(this.hashCache.keys());

                for (let i = 0; i < toDelete; i++) {
                    this.hashCache.delete(keys[i]);
                }
            }

            if (this.hmacCache.size > maxSize) {
                const toDelete = this.hmacCache.size - maxSize;
                const keys = Array.from(this.hmacCache.keys());

                for (let i = 0; i < toDelete; i++) {
                    this.hmacCache.delete(keys[i]);
                }
            }

            // Clear progressive hashes older than cache TTL
            const now = Date.now();
            for (const [sessionId, hasher] of this.progressiveHashes.entries()) {
                if (!hasher._lastUpdate || now - hasher._lastUpdate > this.config.cacheTTL) {
                    this.progressiveHashes.delete(sessionId);
                }
            }

            this.emit('cacheCleanup', {
                hashCacheSize: this.hashCache.size,
                hmacCacheSize: this.hmacCache.size,
                progressiveHashesSize: this.progressiveHashes.size
            });
        }, this.config.cacheTTL);
    }

    initializeBloomFilter() {
        // Simple bloom filter implementation
        this.bloomFilter = {
            bits: new Uint8Array(this.config.bloomFilterSize),
            hashCount: this.config.bloomFilterHashes,

            add(item) {
                for (let i = 0; i < this.hashCount; i++) {
                    const hash = crypto.createHash('md5')
                        .update(item + i)
                        .digest();
                    const index = hash.readUInt32BE(0) % this.bits.length;
                    this.bits[index] = 1;
                }
            },

            contains(item) {
                for (let i = 0; i < this.hashCount; i++) {
                    const hash = crypto.createHash('md5')
                        .update(item + i)
                        .digest();
                    const index = hash.readUInt32BE(0) % this.bits.length;
                    if (this.bits[index] === 0) {
                        return false;
                    }
                }
                return true;
            },

            clear() {
                this.bits.fill(0);
            }
        };
    }

    initializeWorkers() {
        // Worker thread initialization would go here
        this.emit('workersInitialized');
    }

    updateStatistics(algorithm, metrics) {
        this.statistics.totalHashes++;
        this.statistics.bytesHashed += metrics.bytes || 0;
        this.statistics.algorithmUsage[algorithm] =
            (this.statistics.algorithmUsage[algorithm] || 0) + 1;

        this.statistics.averageHashTime =
            (this.statistics.averageHashTime * (this.statistics.totalHashes - 1) + metrics.time) /
            this.statistics.totalHashes;

        const memUsage = process.memoryUsage().heapUsed;
        if (memUsage > this.statistics.peakMemoryUsage) {
            this.statistics.peakMemoryUsage = memUsage;
        }
    }

    /**
     * Get service statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheStats: {
                hashCacheSize: this.hashCache.size,
                hmacCacheSize: this.hmacCache.size,
                progressiveHashesSize: this.progressiveHashes.size
            },
            supportedAlgorithms: Object.keys(this.algorithms),
            config: {
                defaultAlgorithm: this.config.defaultAlgorithm,
                cacheEnabled: this.config.enableCaching,
                streamingEnabled: this.config.enableStreaming,
                bloomFilterEnabled: this.config.enableBloomFilter
            }
        };
    }

    /**
     * Reset service state
     */
    reset() {
        this.hashCache.clear();
        this.hmacCache.clear();
        this.progressiveHashes.clear();

        if (this.bloomFilter) {
            this.bloomFilter.clear();
        }

        this.statistics = {
            totalHashes: 0,
            totalHMACs: 0,
            totalVerifications: 0,
            cacheHits: 0,
            cacheMisses: 0,
            bytesHashed: 0,
            averageHashTime: 0,
            errors: 0,
            algorithmUsage: {},
            peakMemoryUsage: 0
        };

        // Reinitialize algorithm usage
        for (const algo of Object.values(this.algorithms)) {
            this.statistics.algorithmUsage[algo] = 0;
        }

        this.emit('reset');
    }
}

module.exports = HashService;
