/**
 * @fileoverview Enterprise Token Blacklist Service
 * @module shared/lib/auth/services/blacklist-service
 * @description Comprehensive token revocation and blacklisting with Redis and database support
 * @version 2.0.0
 */

const crypto = require('crypto');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');
const database = require('../../database');

/**
 * Blacklist Entry Status Enum
 * @enum {string}
 */
const BLACKLIST_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REMOVED: 'removed'
};

/**
 * Blacklist Reason Enum
 * @enum {string}
 */
const BLACKLIST_REASON = {
    LOGOUT: 'logout',
    LOGOUT_ALL: 'logout_all',
    PASSWORD_CHANGE: 'password_change',
    ACCOUNT_LOCKED: 'account_locked',
    ACCOUNT_DELETED: 'account_deleted',
    SECURITY_BREACH: 'security_breach',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    TOKEN_COMPROMISED: 'token_compromised',
    ADMIN_ACTION: 'admin_action',
    USER_REQUEST: 'user_request',
    POLICY_VIOLATION: 'policy_violation',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    MANUAL: 'manual'
};

/**
 * Token Type for Blacklisting
 * @enum {string}
 */
const TOKEN_TYPE = {
    ACCESS: 'access',
    REFRESH: 'refresh',
    API: 'api',
    TEMP: 'temp',
    RESET: 'reset',
    VERIFICATION: 'verification',
    MAGIC_LINK: 'magic_link',
    ALL: 'all'
};

/**
 * Enterprise Token Blacklist Service
 * Handles token revocation, blacklisting, and validation
 * @class BlacklistService
 */
class BlacklistService {
    constructor() {
        // Configuration
        this.config = {
            defaultTTL: config.auth?.blacklistTTL || 24 * 60 * 60 * 1000, // 24 hours
            maxBlacklistSize: config.auth?.maxBlacklistSize || 100000,
            enableAutoCleanup: config.auth?.enableBlacklistCleanup !== false,
            cleanupInterval: config.auth?.blacklistCleanupInterval || 60 * 60 * 1000, // 1 hour
            enablePersistence: config.auth?.enableBlacklistPersistence !== false,
            useRedis: config.redis?.enabled || false,
            useDatabase: true,
            cacheExpiry: 5 * 60 * 1000 // 5 minutes
        };

        // In-memory storage (fallback and cache)
        this.accessTokenBlacklist = new Map(); // tokenHash -> entry
        this.refreshTokenBlacklist = new Map(); // tokenId -> entry
        this.userBlacklist = new Map(); // userId -> Set of tokenIds
        this.revokedRefreshTokens = new Map(); // tokenId -> revocation info
        
        // Statistics
        this.stats = {
            tokensBlacklisted: 0,
            tokensChecked: 0,
            cacheHits: 0,
            cacheMisses: 0,
            entriesExpired: 0,
            entriesRemoved: 0,
            refreshTokensRevoked: 0,
            userTokensBlacklisted: 0
        };

        // Initialize services
        this._initializeDatabase();
        if (this.config.enableAutoCleanup) {
            this._startCleanupScheduler();
        }
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.db = database;
            if (!this.db.isInitialized) {
                await this.db.initialize();
            }
            logger.info('BlacklistService: Database initialized successfully');
        } catch (error) {
            logger.error('BlacklistService: Database initialization failed', { error: error.message });
        }
    }

    // ============= TOKEN BLACKLISTING METHODS =============

    /**
     * Add token to blacklist
     * @param {string} token - Token to blacklist (can be full token or tokenId)
     * @param {string} [reason] - Reason for blacklisting
     * @param {Date|number} [expiresAt] - Expiry time (Date object or milliseconds)
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Blacklist entry
     */
    async addToken(token, reason = BLACKLIST_REASON.MANUAL, expiresAt = null, options = {}) {
        try {
            // Validate input
            if (!token) {
                throw new AppError('Token is required', 400, 'MISSING_TOKEN');
            }

            // Generate token hash for storage
            const tokenHash = this._hashToken(token);
            const tokenId = options.tokenId || this._extractTokenId(token) || tokenHash;

            // Calculate expiry
            const now = new Date();
            const expiry = this._calculateExpiry(expiresAt);

            // Create blacklist entry
            const entry = {
                tokenHash: tokenHash,
                tokenId: tokenId,
                tokenType: options.tokenType || TOKEN_TYPE.ACCESS,
                userId: options.userId,
                tenantId: options.tenantId,
                reason: reason,
                status: BLACKLIST_STATUS.ACTIVE,
                addedAt: now,
                expiresAt: expiry,
                addedBy: options.addedBy,
                metadata: {
                    ip: options.ip,
                    userAgent: options.userAgent,
                    sessionId: options.sessionId,
                    ...options.metadata
                }
            };

            // Store in appropriate map based on token type
            switch (entry.tokenType) {
                case TOKEN_TYPE.ACCESS:
                case TOKEN_TYPE.API:
                case TOKEN_TYPE.TEMP:
                    this.accessTokenBlacklist.set(tokenHash, entry);
                    break;
                
                case TOKEN_TYPE.REFRESH:
                    this.refreshTokenBlacklist.set(tokenId, entry);
                    break;
                
                default:
                    this.accessTokenBlacklist.set(tokenHash, entry);
            }

            // Index by user if userId provided
            if (entry.userId) {
                if (!this.userBlacklist.has(entry.userId)) {
                    this.userBlacklist.set(entry.userId, new Set());
                }
                this.userBlacklist.get(entry.userId).add(tokenHash);
            }

            // Persist to database
            if (this.config.enablePersistence) {
                await this._persistBlacklistEntry(entry);
            }

            // Store in Redis if available
            if (this.config.useRedis) {
                await this._storeInRedis(tokenHash, entry);
            }

            // Check blacklist size limit
            await this._enforceBlacklistSizeLimit();

            this.stats.tokensBlacklisted++;
            logger.info('Token blacklisted', {
                tokenId: tokenId,
                tokenType: entry.tokenType,
                reason: reason,
                userId: entry.userId
            });

            return entry;

        } catch (error) {
            logger.error('Failed to add token to blacklist', {
                error: error.message,
                reason
            });
            throw error;
        }
    }

    /**
     * Add multiple tokens to blacklist
     * @param {Array<string>} tokens - Tokens to blacklist
     * @param {string} [reason] - Reason for blacklisting
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Results object
     */
    async addTokens(tokens, reason = BLACKLIST_REASON.MANUAL, options = {}) {
        try {
            const results = {
                successful: [],
                failed: [],
                total: tokens.length
            };

            for (const token of tokens) {
                try {
                    const entry = await this.addToken(token, reason, null, options);
                    results.successful.push({
                        tokenId: entry.tokenId,
                        tokenHash: entry.tokenHash
                    });
                } catch (error) {
                    results.failed.push({
                        token: token.substring(0, 10) + '...',
                        error: error.message
                    });
                }
            }

            logger.info('Bulk token blacklist operation completed', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length
            });

            return results;

        } catch (error) {
            logger.error('Bulk blacklist operation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if token is blacklisted
     * @param {string} token - Token to check
     * @param {Object} [options] - Check options
     * @returns {Promise<boolean>} True if blacklisted
     */
    async isTokenBlacklisted(token, options = {}) {
        try {
            this.stats.tokensChecked++;

            if (!token) {
                return false;
            }

            const tokenHash = this._hashToken(token);
            const tokenType = options.tokenType || TOKEN_TYPE.ACCESS;

            // Check cache first
            let entry = null;
            
            switch (tokenType) {
                case TOKEN_TYPE.ACCESS:
                case TOKEN_TYPE.API:
                case TOKEN_TYPE.TEMP:
                    entry = this.accessTokenBlacklist.get(tokenHash);
                    break;
                
                case TOKEN_TYPE.REFRESH:
                    const tokenId = options.tokenId || this._extractTokenId(token);
                    entry = this.refreshTokenBlacklist.get(tokenId);
                    break;
                
                default:
                    entry = this.accessTokenBlacklist.get(tokenHash);
            }

            // Cache hit
            if (entry) {
                this.stats.cacheHits++;
                
                // Check if entry is still valid
                if (this._isEntryValid(entry)) {
                    return true;
                }
                
                // Entry expired, remove it
                await this._removeExpiredEntry(entry);
                return false;
            }

            // Cache miss - check Redis if available
            if (this.config.useRedis) {
                const redisEntry = await this._checkRedis(tokenHash);
                if (redisEntry) {
                    this.stats.cacheMisses++;
                    // Store in local cache for future checks
                    this.accessTokenBlacklist.set(tokenHash, redisEntry);
                    return this._isEntryValid(redisEntry);
                }
            }

            // Check database if available
            if (this.config.useDatabase) {
                const dbEntry = await this._checkDatabase(tokenHash);
                if (dbEntry) {
                    this.stats.cacheMisses++;
                    // Store in local cache
                    this.accessTokenBlacklist.set(tokenHash, dbEntry);
                    return this._isEntryValid(dbEntry);
                }
            }

            // Token not blacklisted
            return false;

        } catch (error) {
            logger.error('Token blacklist check failed', {
                error: error.message
            });
            // Fail open in case of errors
            return false;
        }
    }

    /**
     * Remove token from blacklist
     * @param {string} token - Token to remove
     * @param {Object} [options] - Remove options
     * @returns {Promise<boolean>} Success status
     */
    async removeToken(token, options = {}) {
        try {
            if (!token) {
                return false;
            }

            const tokenHash = this._hashToken(token);
            const tokenType = options.tokenType || TOKEN_TYPE.ACCESS;

            let removed = false;

            // Remove from appropriate map
            switch (tokenType) {
                case TOKEN_TYPE.ACCESS:
                case TOKEN_TYPE.API:
                case TOKEN_TYPE.TEMP:
                    removed = this.accessTokenBlacklist.delete(tokenHash);
                    break;
                
                case TOKEN_TYPE.REFRESH:
                    const tokenId = options.tokenId || this._extractTokenId(token);
                    removed = this.refreshTokenBlacklist.delete(tokenId);
                    break;
                
                default:
                    removed = this.accessTokenBlacklist.delete(tokenHash);
            }

            // Remove from user index if userId provided
            if (options.userId && this.userBlacklist.has(options.userId)) {
                this.userBlacklist.get(options.userId).delete(tokenHash);
            }

            // Remove from database
            if (this.config.enablePersistence) {
                await this._removeFromDatabase(tokenHash);
            }

            // Remove from Redis
            if (this.config.useRedis) {
                await this._removeFromRedis(tokenHash);
            }

            if (removed) {
                this.stats.entriesRemoved++;
                logger.debug('Token removed from blacklist', { tokenHash });
            }

            return removed;

        } catch (error) {
            logger.error('Failed to remove token from blacklist', {
                error: error.message
            });
            return false;
        }
    }

    // ============= REFRESH TOKEN METHODS =============

    /**
     * Revoke refresh token
     * @param {string} tokenId - Refresh token ID
     * @param {string} [reason] - Revocation reason
     * @param {Object} [options] - Additional options
     * @returns {Promise<boolean>} Success status
     */
    async revokeRefreshToken(tokenId, reason = BLACKLIST_REASON.REVOKED, options = {}) {
        try {
            if (!tokenId) {
                throw new AppError('Token ID is required', 400, 'MISSING_TOKEN_ID');
            }

            const revocationInfo = {
                tokenId: tokenId,
                reason: reason,
                revokedAt: new Date(),
                revokedBy: options.revokedBy,
                userId: options.userId,
                metadata: options.metadata || {}
            };

            // Store in revoked tokens map
            this.revokedRefreshTokens.set(tokenId, revocationInfo);

            // Also add to blacklist
            await this.addToken(tokenId, reason, null, {
                ...options,
                tokenType: TOKEN_TYPE.REFRESH,
                tokenId: tokenId
            });

            // Persist to database
            if (this.config.enablePersistence) {
                await this._persistRevocation(revocationInfo);
            }

            this.stats.refreshTokensRevoked++;
            logger.info('Refresh token revoked', {
                tokenId,
                reason,
                userId: options.userId
            });

            return true;

        } catch (error) {
            logger.error('Failed to revoke refresh token', {
                error: error.message,
                tokenId
            });
            throw error;
        }
    }

    /**
     * Check if refresh token is revoked
     * @param {string} tokenId - Refresh token ID
     * @returns {Promise<boolean>} True if revoked
     */
    async isRefreshTokenRevoked(tokenId) {
        try {
            if (!tokenId) {
                return false;
            }

            // Check cache
            if (this.revokedRefreshTokens.has(tokenId)) {
                return true;
            }

            // Check blacklist
            const blacklisted = await this.isTokenBlacklisted(tokenId, {
                tokenType: TOKEN_TYPE.REFRESH,
                tokenId: tokenId
            });

            return blacklisted;

        } catch (error) {
            logger.error('Refresh token revocation check failed', {
                error: error.message,
                tokenId
            });
            return false;
        }
    }

    /**
     * Get refresh token revocation info
     * @param {string} tokenId - Refresh token ID
     * @returns {Promise<Object|null>} Revocation info or null
     */
    async getRefreshTokenRevocationInfo(tokenId) {
        try {
            // Check cache first
            const cached = this.revokedRefreshTokens.get(tokenId);
            if (cached) {
                return cached;
            }

            // Check database
            if (this.config.useDatabase) {
                const dbInfo = await this._getRevocationFromDatabase(tokenId);
                if (dbInfo) {
                    this.revokedRefreshTokens.set(tokenId, dbInfo);
                    return dbInfo;
                }
            }

            return null;

        } catch (error) {
            logger.error('Failed to get revocation info', {
                error: error.message,
                tokenId
            });
            return null;
        }
    }

    // ============= USER-LEVEL BLACKLISTING =============

    /**
     * Blacklist all user tokens
     * @param {string} userId - User ID
     * @param {string} [reason] - Blacklist reason
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Results object
     */
    async blacklistAllUserTokens(userId, reason = BLACKLIST_REASON.LOGOUT_ALL, options = {}) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            const results = {
                userId: userId,
                reason: reason,
                blacklistedCount: 0,
                tokens: []
            };

            // Get all user tokens from database
            if (this.config.useDatabase) {
                const userTokens = await this._getUserTokensFromDatabase(userId);
                
                for (const tokenInfo of userTokens) {
                    try {
                        await this.addToken(tokenInfo.token || tokenInfo.tokenId, reason, null, {
                            ...options,
                            userId: userId,
                            tokenType: tokenInfo.type
                        });
                        
                        results.blacklistedCount++;
                        results.tokens.push({
                            tokenId: tokenInfo.tokenId,
                            type: tokenInfo.type
                        });
                    } catch (error) {
                        logger.warn('Failed to blacklist user token', {
                            userId,
                            tokenId: tokenInfo.tokenId,
                            error: error.message
                        });
                    }
                }
            }

            // Mark user for token invalidation
            const userBlacklistEntry = {
                userId: userId,
                reason: reason,
                blacklistedAt: new Date(),
                blacklistedBy: options.blacklistedBy,
                expiresAt: new Date(Date.now() + this.config.defaultTTL)
            };

            // Store user blacklist marker
            await this._storeUserBlacklistMarker(userBlacklistEntry);

            this.stats.userTokensBlacklisted++;
            logger.info('All user tokens blacklisted', {
                userId,
                count: results.blacklistedCount,
                reason
            });

            return results;

        } catch (error) {
            logger.error('Failed to blacklist all user tokens', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get blacklisted tokens for a user
     * @param {string} userId - User ID
     * @param {Object} [options] - Query options
     * @returns {Promise<Array>} Array of blacklisted token entries
     */
    async getUserBlacklistedTokens(userId, options = {}) {
        try {
            const tokens = [];

            // Get from user index
            const userTokens = this.userBlacklist.get(userId);
            if (userTokens) {
                for (const tokenHash of userTokens) {
                    const entry = this.accessTokenBlacklist.get(tokenHash) ||
                                 this.refreshTokenBlacklist.get(tokenHash);
                    if (entry && this._isEntryValid(entry)) {
                        tokens.push(this._sanitizeBlacklistEntry(entry));
                    }
                }
            }

            // Also check database
            if (this.config.useDatabase) {
                const dbTokens = await this._getUserBlacklistedTokensFromDatabase(userId, options);
                for (const dbToken of dbTokens) {
                    if (!tokens.find(t => t.tokenHash === dbToken.tokenHash)) {
                        tokens.push(this._sanitizeBlacklistEntry(dbToken));
                    }
                }
            }

            return tokens;

        } catch (error) {
            logger.error('Failed to get user blacklisted tokens', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Check if user has any blacklisted tokens
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} True if user has blacklisted tokens
     */
    async userHasBlacklistedTokens(userId) {
        try {
            const userTokens = this.userBlacklist.get(userId);
            if (userTokens && userTokens.size > 0) {
                return true;
            }

            if (this.config.useDatabase) {
                const dbTokens = await this._getUserBlacklistedTokensFromDatabase(userId, { limit: 1 });
                return dbTokens.length > 0;
            }

            return false;

        } catch (error) {
            logger.error('Failed to check user blacklisted tokens', {
                error: error.message,
                userId
            });
            return false;
        }
    }

    // ============= CLEANUP AND MAINTENANCE =============

    /**
     * Clean up expired blacklist entries
     * @returns {Promise<number>} Number of entries cleaned
     */
    async cleanup() {
        try {
            let cleanedCount = 0;
            const now = new Date();

            // Clean access token blacklist
            for (const [tokenHash, entry] of this.accessTokenBlacklist.entries()) {
                if (!this._isEntryValid(entry, now)) {
                    await this._removeExpiredEntry(entry);
                    this.accessTokenBlacklist.delete(tokenHash);
                    cleanedCount++;
                }
            }

            // Clean refresh token blacklist
            for (const [tokenId, entry] of this.refreshTokenBlacklist.entries()) {
                if (!this._isEntryValid(entry, now)) {
                    await this._removeExpiredEntry(entry);
                    this.refreshTokenBlacklist.delete(tokenId);
                    cleanedCount++;
                }
            }

            // Clean revoked refresh tokens
            for (const [tokenId, info] of this.revokedRefreshTokens.entries()) {
                // Remove revocations older than 30 days
                const age = now - info.revokedAt;
                if (age > 30 * 24 * 60 * 60 * 1000) {
                    this.revokedRefreshTokens.delete(tokenId);
                    cleanedCount++;
                }
            }

            // Clean user blacklist index
            for (const [userId, tokenHashes] of this.userBlacklist.entries()) {
                const validHashes = new Set();
                for (const tokenHash of tokenHashes) {
                    const entry = this.accessTokenBlacklist.get(tokenHash);
                    if (entry && this._isEntryValid(entry, now)) {
                        validHashes.add(tokenHash);
                    }
                }
                
                if (validHashes.size === 0) {
                    this.userBlacklist.delete(userId);
                } else {
                    this.userBlacklist.set(userId, validHashes);
                }
            }

            // Clean database if enabled
            if (this.config.useDatabase) {
                const dbCleaned = await this._cleanupDatabase(now);
                cleanedCount += dbCleaned;
            }

            this.stats.entriesExpired += cleanedCount;

            if (cleanedCount > 0) {
                logger.info('Blacklist cleanup completed', {
                    entriesRemoved: cleanedCount,
                    remainingAccess: this.accessTokenBlacklist.size,
                    remainingRefresh: this.refreshTokenBlacklist.size
                });
            }

            return cleanedCount;

        } catch (error) {
            logger.error('Blacklist cleanup failed', { error: error.message });
            return 0;
        }
    }

    /**
     * Start automatic cleanup scheduler
     * @private
     */
    _startCleanupScheduler() {
        setInterval(async () => {
            await this.cleanup();
        }, this.config.cleanupInterval);

        logger.info('Blacklist cleanup scheduler started', {
            interval: this.config.cleanupInterval
        });
    }

    /**
     * Clear all blacklist entries (use with caution)
     * @param {Object} [options] - Clear options
     * @returns {Promise<number>} Number of entries cleared
     */
    async clearAll(options = {}) {
        try {
            const totalCleared = 
                this.accessTokenBlacklist.size +
                this.refreshTokenBlacklist.size +
                this.revokedRefreshTokens.size;

            this.accessTokenBlacklist.clear();
            this.refreshTokenBlacklist.clear();
            this.revokedRefreshTokens.clear();
            this.userBlacklist.clear();

            if (this.config.useDatabase && !options.keepDatabase) {
                await this._clearDatabase();
            }

            if (this.config.useRedis && !options.keepRedis) {
                await this._clearRedis();
            }

            logger.warn('All blacklist entries cleared', {
                count: totalCleared,
                keepDatabase: options.keepDatabase,
                keepRedis: options.keepRedis
            });

            return totalCleared;

        } catch (error) {
            logger.error('Failed to clear blacklist', { error: error.message });
            throw error;
        }
    }

    // ============= STATISTICS AND MONITORING =============

    /**
     * Get blacklist statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            ...this.stats,
            accessTokenCount: this.accessTokenBlacklist.size,
            refreshTokenCount: this.refreshTokenBlacklist.size,
            revokedRefreshTokenCount: this.revokedRefreshTokens.size,
            userIndexSize: this.userBlacklist.size,
            cacheHitRate: this.stats.tokensChecked > 0
                ? ((this.stats.cacheHits / this.stats.tokensChecked) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Get blacklist health status
     * @returns {Object} Health status
     */
    async getHealthStatus() {
        const stats = this.getStatistics();
        const now = new Date();

        // Check if size is approaching limit
        const totalSize = stats.accessTokenCount + stats.refreshTokenCount;
        const sizeWarning = totalSize > (this.config.maxBlacklistSize * 0.8);

        // Count expired entries that need cleanup
        let expiredCount = 0;
        for (const entry of this.accessTokenBlacklist.values()) {
            if (!this._isEntryValid(entry, now)) {
                expiredCount++;
            }
        }

        return {
            healthy: !sizeWarning,
            totalEntries: totalSize,
            maxSize: this.config.maxBlacklistSize,
            utilizationPercent: ((totalSize / this.config.maxBlacklistSize) * 100).toFixed(2),
            expiredEntriesPendingCleanup: expiredCount,
            warnings: sizeWarning ? ['Blacklist size approaching limit'] : [],
            lastCleanup: this._lastCleanupTime || null
        };
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Hash token for storage
     * @private
     */
    _hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Extract token ID from token (if JWT)
     * @private
     */
    _extractTokenId(token) {
        try {
            // Try to decode as JWT
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                return payload.tokenId || payload.jti;
            }
        } catch (error) {
            // Not a JWT or invalid format
        }
        return null;
    }

    /**
     * Calculate expiry time
     * @private
     */
    _calculateExpiry(expiresAt) {
        if (!expiresAt) {
            return new Date(Date.now() + this.config.defaultTTL);
        }

        if (typeof expiresAt === 'number') {
            return new Date(expiresAt);
        }

        if (expiresAt instanceof Date) {
            return expiresAt;
        }

        return new Date(Date.now() + this.config.defaultTTL);
    }

    /**
     * Check if blacklist entry is valid (not expired)
     * @private
     */
    _isEntryValid(entry, now = new Date()) {
        if (entry.status !== BLACKLIST_STATUS.ACTIVE) {
            return false;
        }

        if (entry.expiresAt && now > entry.expiresAt) {
            return false;
        }

        return true;
    }

    /**
     * Remove expired entry
     * @private
     */
    async _removeExpiredEntry(entry) {
        try {
            // Update status
            entry.status = BLACKLIST_STATUS.EXPIRED;

            // Remove from maps
            this.accessTokenBlacklist.delete(entry.tokenHash);
            this.refreshTokenBlacklist.delete(entry.tokenId);

            // Remove from user index
            if (entry.userId && this.userBlacklist.has(entry.userId)) {
                this.userBlacklist.get(entry.userId).delete(entry.tokenHash);
            }

            this.stats.entriesExpired++;

        } catch (error) {
            logger.error('Failed to remove expired entry', {
                error: error.message,
                tokenId: entry.tokenId
            });
        }
    }

    /**
     * Enforce blacklist size limit
     * @private
     */
    async _enforceBlacklistSizeLimit() {
        const totalSize = this.accessTokenBlacklist.size + this.refreshTokenBlacklist.size;
        
        if (totalSize > this.config.maxBlacklistSize) {
            logger.warn('Blacklist size limit exceeded, removing oldest entries', {
                currentSize: totalSize,
                maxSize: this.config.maxBlacklistSize
            });

            // Sort by addedAt and remove oldest 10%
            const entriesToRemove = Math.ceil(this.config.maxBlacklistSize * 0.1);
            const allEntries = [
                ...Array.from(this.accessTokenBlacklist.values()),
                ...Array.from(this.refreshTokenBlacklist.values())
            ].sort((a, b) => a.addedAt - b.addedAt);

            for (let i = 0; i < entriesToRemove && i < allEntries.length; i++) {
                await this._removeExpiredEntry(allEntries[i]);
            }
        }
    }

    /**
     * Sanitize blacklist entry for output
     * @private
     */
    _sanitizeBlacklistEntry(entry) {
        return {
            tokenId: entry.tokenId,
            tokenType: entry.tokenType,
            reason: entry.reason,
            status: entry.status,
            addedAt: entry.addedAt,
            expiresAt: entry.expiresAt,
            userId: entry.userId
        };
    }

    /**
     * Persist blacklist entry to database
     * @private
     */
    async _persistBlacklistEntry(entry) {
        try {
            // TODO: Implement database persistence
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // await BlacklistModel.create(entry);
        } catch (error) {
            logger.error('Failed to persist blacklist entry', {
                error: error.message,
                tokenId: entry.tokenId
            });
        }
    }

    /**
     * Check database for blacklisted token
     * @private
     */
    async _checkDatabase(tokenHash) {
        try {
            // TODO: Implement database check
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // return await BlacklistModel.findOne({ tokenHash, status: BLACKLIST_STATUS.ACTIVE });
            return null;
        } catch (error) {
            logger.error('Database blacklist check failed', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Store blacklist entry in Redis
     * @private
     */
    async _storeInRedis(tokenHash, entry) {
        try {
            // TODO: Implement Redis storage
            // const redis = this.redis;
            // const ttl = Math.floor((entry.expiresAt - Date.now()) / 1000);
            // await redis.setex(`blacklist:${tokenHash}`, ttl, JSON.stringify(entry));
        } catch (error) {
            logger.error('Failed to store in Redis', {
                error: error.message
            });
        }
    }

    /**
     * Check Redis for blacklisted token
     * @private
     */
    async _checkRedis(tokenHash) {
        try {
            // TODO: Implement Redis check
            // const redis = this.redis;
            // const data = await redis.get(`blacklist:${tokenHash}`);
            // return data ? JSON.parse(data) : null;
            return null;
        } catch (error) {
            logger.error('Redis blacklist check failed', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Remove from database
     * @private
     */
    async _removeFromDatabase(tokenHash) {
        try {
            // TODO: Implement database removal
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // await BlacklistModel.deleteOne({ tokenHash });
        } catch (error) {
            logger.error('Failed to remove from database', {
                error: error.message
            });
        }
    }

    /**
     * Remove from Redis
     * @private
     */
    async _removeFromRedis(tokenHash) {
        try {
            // TODO: Implement Redis removal
            // const redis = this.redis;
            // await redis.del(`blacklist:${tokenHash}`);
        } catch (error) {
            logger.error('Failed to remove from Redis', {
                error: error.message
            });
        }
    }

    /**
     * Persist revocation info
     * @private
     */
    async _persistRevocation(revocationInfo) {
        try {
            // TODO: Implement database persistence
            // const RevocationModel = this.db.getModel('TokenRevocation');
            // await RevocationModel.create(revocationInfo);
        } catch (error) {
            logger.error('Failed to persist revocation', {
                error: error.message
            });
        }
    }

    /**
     * Get revocation from database
     * @private
     */
    async _getRevocationFromDatabase(tokenId) {
        try {
            // TODO: Implement database retrieval
            // const RevocationModel = this.db.getModel('TokenRevocation');
            // return await RevocationModel.findOne({ tokenId });
            return null;
        } catch (error) {
            logger.error('Failed to get revocation from database', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get user tokens from database
     * @private
     */
    async _getUserTokensFromDatabase(userId) {
        try {
            // TODO: Implement database retrieval
            // const TokenModel = this.db.getModel('Token');
            // return await TokenModel.find({ userId, status: 'active' });
            return [];
        } catch (error) {
            logger.error('Failed to get user tokens from database', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Store user blacklist marker
     * @private
     */
    async _storeUserBlacklistMarker(entry) {
        try {
            // TODO: Implement database storage
            // const UserBlacklistModel = this.db.getModel('UserBlacklist');
            // await UserBlacklistModel.create(entry);
        } catch (error) {
            logger.error('Failed to store user blacklist marker', {
                error: error.message
            });
        }
    }

    /**
     * Get user blacklisted tokens from database
     * @private
     */
    async _getUserBlacklistedTokensFromDatabase(userId, options = {}) {
        try {
            // TODO: Implement database retrieval
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // return await BlacklistModel.find({ userId, status: BLACKLIST_STATUS.ACTIVE }).limit(options.limit || 100);
            return [];
        } catch (error) {
            logger.error('Failed to get user blacklisted tokens from database', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Clean up database
     * @private
     */
    async _cleanupDatabase(now) {
        try {
            // TODO: Implement database cleanup
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // const result = await BlacklistModel.deleteMany({ expiresAt: { $lt: now } });
            // return result.deletedCount;
            return 0;
        } catch (error) {
            logger.error('Database cleanup failed', {
                error: error.message
            });
            return 0;
        }
    }

    /**
     * Clear database
     * @private
     */
    async _clearDatabase() {
        try {
            // TODO: Implement database clear
            // const BlacklistModel = this.db.getModel('TokenBlacklist');
            // await BlacklistModel.deleteMany({});
        } catch (error) {
            logger.error('Failed to clear database', {
                error: error.message
            });
        }
    }

    /**
     * Clear Redis
     * @private
     */
    async _clearRedis() {
        try {
            // TODO: Implement Redis clear
            // const redis = this.redis;
            // await redis.flushall();
        } catch (error) {
            logger.error('Failed to clear Redis', {
                error: error.message
            });
        }
    }
}

// Export singleton instance
module.exports = new BlacklistService();