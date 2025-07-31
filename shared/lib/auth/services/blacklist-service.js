'use strict';

/**
 * @fileoverview Token blacklist service for managing revoked tokens
 * @module shared/lib/auth/services/blacklist-service
 * @requires module:crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/config
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const AuditLogModel = require('../../database/models/security/audit-log-model');
const config = require('../../../config');

/**
 * @class BlacklistService
 * @description Manages token blacklisting for revoked tokens, implements
 * efficient storage and lookup mechanisms with enterprise security features
 */
class BlacklistService {
  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Map}
   */
  #localBlacklist;

  /**
   * @private
   * @type {Map}
   */
  #blacklistMetrics;

  /**
   * @private
   * @type {Set}
   */
  #permanentBlacklist;
  #bloomFilter;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    storage: 'redis', // 'redis', 'memory', 'hybrid'
    tokenTTL: 86400, // 24 hours in seconds
    cleanupInterval: 3600000, // 1 hour
    maxMemoryItems: 10000,
    enableCompression: true,
    enableHashing: true,
    hashAlgorithm: 'sha256',
    enableAuditLog: true,
    enableMetrics: true,
    syncInterval: 60000, // 1 minute for hybrid mode
    batchSize: 100,
    bloomFilter: {
      enabled: true,
      errorRate: 0.01,
      capacity: 1000000
    },
    reasons: {
      LOGOUT: 'logout',
      REVOKED: 'revoked',
      EXPIRED: 'expired',
      SUSPICIOUS: 'suspicious',
      PASSWORD_RESET: 'password_reset',
      PRIVILEGE_CHANGE: 'privilege_change',
      SESSION_TERMINATED: 'session_terminated',
      SECURITY_BREACH: 'security_breach'
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #BLACKLIST_EVENTS = {
    TOKEN_BLACKLISTED: 'blacklist.token.added',
    TOKEN_CHECKED: 'blacklist.token.checked',
    TOKEN_EXPIRED: 'blacklist.token.expired',
    CLEANUP_RUN: 'blacklist.cleanup.run',
    SYNC_COMPLETED: 'blacklist.sync.completed'
  };

  /**
   * Creates a new BlacklistService instance
   * @param {Object} [config] - Service configuration
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(config = {}, cacheService) {
    this.#config = { ...BlacklistService.#DEFAULT_CONFIG, ...config };
    this.#cacheService = cacheService || new CacheService();
    this.#localBlacklist = new Map();
    this.#blacklistMetrics = new Map();
    this.#permanentBlacklist = new Set();

    // Initialize bloom filter if enabled
    if (this.#config.bloomFilter.enabled) {
      this.#initializeBloomFilter();
    }

    // Start cleanup interval
    if (this.#config.cleanupInterval) {
      this.#startCleanupInterval();
    }

    // Start sync interval for hybrid mode
    if (this.#config.storage === 'hybrid' && this.#config.syncInterval) {
      this.#startSyncInterval();
    }

    logger.info('BlacklistService initialized', {
      storage: this.#config.storage,
      enableHashing: this.#config.enableHashing,
      bloomFilterEnabled: this.#config.bloomFilter.enabled
    });
  }

  /**
   * Blacklists a token
   * @param {string} token - Token to blacklist
   * @param {string} [reason='revoked'] - Blacklist reason
   * @param {Object} [metadata] - Additional metadata
   * @returns {Promise<Object>} Blacklist result
   * @throws {AppError} If blacklisting fails
   */
  async blacklistToken(token, reason = this.#config.reasons.REVOKED, metadata = {}) {
    const correlationId = metadata.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Blacklisting token', {
        correlationId,
        reason,
        tokenLength: token.length
      });

      // Validate token
      if (!token || typeof token !== 'string') {
        throw new AppError(
          'Invalid token provided',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Extract token metadata
      const tokenInfo = this.#extractTokenInfo(token);
      const tokenKey = this.#generateTokenKey(token);

      // Prepare blacklist entry
      const blacklistEntry = {
        tokenKey,
        reason,
        blacklistedAt: new Date(),
        expiresAt: tokenInfo.exp ? new Date(tokenInfo.exp * 1000) : null,
        tokenType: tokenInfo.type || 'unknown',
        userId: tokenInfo.sub || metadata.userId,
        jti: tokenInfo.jti,
        metadata: {
          ...metadata,
          correlationId
        }
      };

      // Store in appropriate storage
      await this.#storeBlacklistEntry(tokenKey, blacklistEntry);

      // Update bloom filter if enabled
      if (this.#config.bloomFilter.enabled) {
        this.#addToBloomFilter(tokenKey);
      }

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditBlacklistEvent(blacklistEntry);
      }

      // Track metrics
      this.#trackBlacklistEvent(BlacklistService.#BLACKLIST_EVENTS.TOKEN_BLACKLISTED, reason);

      logger.info('Token blacklisted successfully', {
        correlationId,
        reason,
        tokenType: blacklistEntry.tokenType
      });

      return {
        success: true,
        tokenKey,
        reason,
        expiresAt: blacklistEntry.expiresAt
      };

    } catch (error) {
      logger.error('Token blacklist failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to blacklist token',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Checks if a token is blacklisted
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} True if blacklisted
   * @throws {AppError} If check fails
   */
  async isTokenBlacklisted(token) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.debug('Checking token blacklist status', { correlationId });

      if (!token || typeof token !== 'string') {
        return false;
      }

      const tokenKey = this.#generateTokenKey(token);

      // Check bloom filter first (fast negative check)
      if (this.#config.bloomFilter.enabled && !this.#checkBloomFilter(tokenKey)) {
        this.#trackBlacklistEvent(BlacklistService.#BLACKLIST_EVENTS.TOKEN_CHECKED, 'bloom_negative');
        return false;
      }

      // Check actual blacklist
      const isBlacklisted = await this.#checkBlacklist(tokenKey);

      // Track metrics
      this.#trackBlacklistEvent(
        BlacklistService.#BLACKLIST_EVENTS.TOKEN_CHECKED,
        isBlacklisted ? 'found' : 'not_found'
      );

      return isBlacklisted;

    } catch (error) {
      logger.error('Token blacklist check failed', {
        correlationId,
        error: error.message
      });

      // On error, fail open (don't block)
      return false;
    }
  }

  /**
   * Removes a token from blacklist
   * @param {string} token - Token to remove
   * @param {Object} [options] - Remove options
   * @returns {Promise<boolean>} True if removed
   * @throws {AppError} If removal fails
   */
  async removeFromBlacklist(token, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Removing token from blacklist', { correlationId });

      const tokenKey = this.#generateTokenKey(token);

      // Remove from storage
      const removed = await this.#removeBlacklistEntry(tokenKey);

      if (removed) {
        logger.info('Token removed from blacklist', { correlationId });
      } else {
        logger.warn('Token not found in blacklist', { correlationId });
      }

      return removed;

    } catch (error) {
      logger.error('Token removal from blacklist failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to remove token from blacklist',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Blacklists all tokens for a user
   * @param {string} userId - User ID
   * @param {string} [reason] - Blacklist reason
   * @param {Object} [options] - Blacklist options
   * @returns {Promise<Object>} Blacklist result
   * @throws {AppError} If blacklisting fails
   */
  async blacklistUserTokens(userId, reason = this.#config.reasons.REVOKED, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Blacklisting all user tokens', {
        correlationId,
        userId,
        reason
      });

      // Create user blacklist entry
      const blacklistKey = `user_blacklist:${userId}`;
      const blacklistEntry = {
        userId,
        reason,
        blacklistedAt: new Date(),
        expiresAt: options.expiresAt || new Date(Date.now() + this.#config.tokenTTL * 1000),
        metadata: {
          ...options,
          correlationId
        }
      };

      // Store user blacklist
      await this.#storeUserBlacklist(blacklistKey, blacklistEntry);

      // Audit log
      if (this.#config.enableAuditLog) {
        await this.#auditUserBlacklistEvent(userId, reason, options);
      }

      logger.info('User tokens blacklisted', {
        correlationId,
        userId
      });

      return {
        success: true,
        userId,
        reason,
        expiresAt: blacklistEntry.expiresAt
      };

    } catch (error) {
      logger.error('User token blacklist failed', {
        correlationId,
        userId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to blacklist user tokens',
        500,
        ERROR_CODES.OPERATION_FAILED,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Checks if user's tokens are blacklisted
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user tokens are blacklisted
   */
  async areUserTokensBlacklisted(userId) {
    try {
      const blacklistKey = `user_blacklist:${userId}`;
      const entry = await this.#cacheService.get(blacklistKey);

      if (!entry) {
        return false;
      }

      // Check if still valid
      if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
        await this.#cacheService.delete(blacklistKey);
        return false;
      }

      return true;

    } catch (error) {
      logger.error('User blacklist check failed', {
        userId,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Gets blacklist statistics
   * @returns {Promise<Object>} Blacklist statistics
   */
  async getStatistics() {
    try {
      const stats = {
        storage: this.#config.storage,
        localBlacklistSize: this.#localBlacklist.size,
        permanentBlacklistSize: this.#permanentBlacklist.size,
        metrics: {}
      };

      // Add metrics
      this.#blacklistMetrics.forEach((value, key) => {
        stats.metrics[key] = value;
      });

      // Get cache statistics if using Redis
      if (this.#config.storage !== 'memory') {
        const cacheStats = await this.#cacheService.getStatistics('blacklist:*');
        stats.cacheEntries = cacheStats.keyCount;
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get blacklist statistics', {
        error: error.message
      });

      return {
        error: 'Failed to retrieve statistics'
      };
    }
  }

  /**
   * Clears expired entries
   * @returns {Promise<number>} Number of cleared entries
   */
  async clearExpiredEntries() {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Clearing expired blacklist entries', { correlationId });

      let clearedCount = 0;

      // Clear from local blacklist
      if (this.#config.storage === 'memory' || this.#config.storage === 'hybrid') {
        const now = Date.now();
        for (const [key, entry] of this.#localBlacklist) {
          if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
            this.#localBlacklist.delete(key);
            clearedCount++;
          }
        }
      }

      // Track metrics
      this.#trackBlacklistEvent(BlacklistService.#BLACKLIST_EVENTS.CLEANUP_RUN, `cleared:${clearedCount}`);

      logger.info('Expired entries cleared', {
        correlationId,
        clearedCount
      });

      return clearedCount;

    } catch (error) {
      logger.error('Failed to clear expired entries', {
        correlationId,
        error: error.message
      });

      return 0;
    }
  }

  /**
   * @private
   * Stores blacklist entry
   */
  async #storeBlacklistEntry(tokenKey, entry) {
    const ttl = entry.expiresAt 
      ? Math.floor((new Date(entry.expiresAt).getTime() - Date.now()) / 1000)
      : this.#config.tokenTTL;

    switch (this.#config.storage) {
      case 'memory':
        this.#localBlacklist.set(tokenKey, entry);
        break;

      case 'redis':
        await this.#cacheService.set(
          `blacklist:${tokenKey}`,
          entry,
          ttl
        );
        break;

      case 'hybrid':
        // Store in both memory and Redis
        this.#localBlacklist.set(tokenKey, entry);
        await this.#cacheService.set(
          `blacklist:${tokenKey}`,
          entry,
          ttl
        );
        break;

      default:
        throw new AppError(
          `Unsupported storage type: ${this.#config.storage}`,
          500,
          ERROR_CODES.CONFIGURATION_ERROR
        );
    }

    // Manage memory size
    if (this.#localBlacklist.size > this.#config.maxMemoryItems) {
      this.#evictOldestEntries();
    }
  }

  /**
   * @private
   * Checks blacklist
   */
  async #checkBlacklist(tokenKey) {
    switch (this.#config.storage) {
      case 'memory':
        const memEntry = this.#localBlacklist.get(tokenKey);
        return this.#isEntryValid(memEntry);

      case 'redis':
        const redisEntry = await this.#cacheService.get(`blacklist:${tokenKey}`);
        return this.#isEntryValid(redisEntry);

      case 'hybrid':
        // Check memory first
        const hybridMemEntry = this.#localBlacklist.get(tokenKey);
        if (hybridMemEntry) {
          return this.#isEntryValid(hybridMemEntry);
        }
        // Fall back to Redis
        const hybridRedisEntry = await this.#cacheService.get(`blacklist:${tokenKey}`);
        return this.#isEntryValid(hybridRedisEntry);

      default:
        return false;
    }
  }

  /**
   * @private
   * Removes blacklist entry
   */
  async #removeBlacklistEntry(tokenKey) {
    let removed = false;

    switch (this.#config.storage) {
      case 'memory':
        removed = this.#localBlacklist.delete(tokenKey);
        break;

      case 'redis':
        removed = await this.#cacheService.delete(`blacklist:${tokenKey}`);
        break;

      case 'hybrid':
        const memRemoved = this.#localBlacklist.delete(tokenKey);
        const redisRemoved = await this.#cacheService.delete(`blacklist:${tokenKey}`);
        removed = memRemoved || redisRemoved;
        break;
    }

    return removed;
  }

  /**
   * @private
   * Stores user blacklist
   */
  async #storeUserBlacklist(key, entry) {
    const ttl = entry.expiresAt 
      ? Math.floor((new Date(entry.expiresAt).getTime() - Date.now()) / 1000)
      : this.#config.tokenTTL;

    await this.#cacheService.set(key, entry, ttl);
  }

  /**
   * @private
   * Checks if entry is valid
   */
  #isEntryValid(entry) {
    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
      return false;
    }

    return true;
  }

  /**
   * @private
   * Generates token key
   */
  #generateTokenKey(token) {
    if (!this.#config.enableHashing) {
      return token;
    }

    return crypto
      .createHash(this.#config.hashAlgorithm)
      .update(token)
      .digest('hex');
  }

  /**
   * @private
   * Extracts token info
   */
  #extractTokenInfo(token) {
    try {
      // Try to decode JWT without verification
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64').toString('utf8')
        );
        return payload;
      }
    } catch (error) {
      // Not a valid JWT or decoding failed
    }

    return {};
  }

  /**
   * @private
   * Evicts oldest entries from memory
   */
  #evictOldestEntries() {
    const entriesToRemove = this.#localBlacklist.size - this.#config.maxMemoryItems + 1000;
    const entries = Array.from(this.#localBlacklist.entries());
    
    // Sort by blacklistedAt date
    entries.sort((a, b) => 
      new Date(a[1].blacklistedAt) - new Date(b[1].blacklistedAt)
    );

    // Remove oldest entries
    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      this.#localBlacklist.delete(entries[i][0]);
    }

    logger.debug('Evicted old blacklist entries', {
      evictedCount: entriesToRemove
    });
  }

  /**
   * @private
   * Initializes bloom filter
   */
  #initializeBloomFilter() {
    // Simplified bloom filter implementation
    // In production, use a proper bloom filter library
    this.#bloomFilter = {
      bits: new Set(),
      add: (key) => {
        const hashes = this.#getBloomHashes(key);
        hashes.forEach(hash => this.#bloomFilter.bits.add(hash));
      },
      contains: (key) => {
        const hashes = this.#getBloomHashes(key);
        return hashes.every(hash => this.#bloomFilter.bits.has(hash));
      }
    };
  }

  /**
   * @private
   * Gets bloom filter hashes
   */
  #getBloomHashes(key) {
    const hashes = [];
    for (let i = 0; i < 3; i++) {
      const hash = crypto
        .createHash('md5')
        .update(`${key}:${i}`)
        .digest('hex');
      hashes.push(hash);
    }
    return hashes;
  }

  /**
   * @private
   * Adds to bloom filter
   */
  #addToBloomFilter(key) {
    if (this.#bloomFilter) {
      this.#bloomFilter.add(key);
    }
  }

  /**
   * @private
   * Checks bloom filter
   */
  #checkBloomFilter(key) {
    if (this.#bloomFilter) {
      return this.#bloomFilter.contains(key);
    }
    return true; // If no bloom filter, continue with regular check
  }

  /**
   * @private
   * Audits blacklist event
   */
  async #auditBlacklistEvent(entry) {
    try {
      await AuditLogModel.create({
        userId: entry.userId,
        event: BlacklistService.#BLACKLIST_EVENTS.TOKEN_BLACKLISTED,
        category: 'token_blacklist',
        metadata: {
          reason: entry.reason,
          tokenType: entry.tokenType,
          jti: entry.jti,
          expiresAt: entry.expiresAt,
          correlationId: entry.metadata.correlationId
        },
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to audit blacklist event', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Audits user blacklist event
   */
  async #auditUserBlacklistEvent(userId, reason, metadata) {
    try {
      await AuditLogModel.create({
        userId,
        event: 'blacklist.user.tokens',
        category: 'token_blacklist',
        metadata: {
          reason,
          ...metadata
        },
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to audit user blacklist event', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Tracks blacklist event
   */
  #trackBlacklistEvent(event, detail) {
    if (!this.#config.enableMetrics) return;

    const key = detail ? `${event}:${detail}` : event;
    const current = this.#blacklistMetrics.get(key) || 0;
    this.#blacklistMetrics.set(key, current + 1);
  }

  /**
   * @private
   * Starts cleanup interval
   */
  #startCleanupInterval() {
    setInterval(async () => {
      try {
        await this.clearExpiredEntries();
      } catch (error) {
        logger.error('Blacklist cleanup failed', { error: error.message });
      }
    }, this.#config.cleanupInterval);
  }

  /**
   * @private
   * Starts sync interval for hybrid mode
   */
  #startSyncInterval() {
    setInterval(async () => {
      try {
        await this.#syncBlacklist();
      } catch (error) {
        logger.error('Blacklist sync failed', { error: error.message });
      }
    }, this.#config.syncInterval);
  }

  /**
   * @private
   * Syncs blacklist between memory and Redis
   */
  async #syncBlacklist() {
    logger.debug('Syncing blacklist');

    // This would implement synchronization logic
    // between memory and Redis storage

    this.#trackBlacklistEvent(BlacklistService.#BLACKLIST_EVENTS.SYNC_COMPLETED);
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `blacklist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    const metrics = {};
    this.#blacklistMetrics.forEach((value, key) => {
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
      const testToken = 'health-check-token';
      await this.blacklistToken(testToken, 'health-check');
      const isBlacklisted = await this.isTokenBlacklisted(testToken);
      await this.removeFromBlacklist(testToken);

      const stats = await this.getStatistics();

      return {
        healthy: true,
        service: 'BlacklistService',
        storage: this.#config.storage,
        metrics: this.getMetrics(),
        statistics: stats
      };
    } catch (error) {
      logger.error('Blacklist service health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'BlacklistService',
        error: error.message
      };
    }
  }
}

module.exports = BlacklistService;