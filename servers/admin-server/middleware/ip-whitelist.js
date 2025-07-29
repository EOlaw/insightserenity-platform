'use strict';

/**
 * @fileoverview IP whitelist middleware for restricting admin access
 * @module servers/admin-server/middleware/ip-whitelist
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/ip-whitelist-model
 * @requires module:servers/admin-server/config
 */

const logger = require('../../../shared/lib/utils/logger');
const AppError = require('../../../shared/lib/utils/app-error');
const { CacheService } = require('../../../shared/lib/services/cache-service');
const IpWhitelistModel = require('../../../shared/lib/database/models/ip-whitelist-model');
const config = require('../config');
const { ERROR_CODES } = require('../../../shared/lib/utils/constants/error-codes');
const ipaddr = require('ipaddr.js');
const crypto = require('crypto');

/**
 * @class IpWhitelistMiddleware
 * @description IP-based access control for admin panel
 */
class IpWhitelistMiddleware {
  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService = new CacheService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    enabled: config.security?.ipWhitelist?.enabled !== false,
    allowPrivateNetworks: config.security?.ipWhitelist?.allowPrivateNetworks || false,
    allowedIPs: config.security?.ipWhitelist?.allowedIPs || [],
    allowedRanges: config.security?.ipWhitelist?.allowedRanges || [],
    bypassForSuperAdmin: config.security?.ipWhitelist?.bypassForSuperAdmin || false,
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      prefix: 'ip_whitelist:'
    },
    geoBlocking: {
      enabled: config.security?.geoBlocking?.enabled || false,
      allowedCountries: config.security?.geoBlocking?.allowedCountries || [],
      blockedCountries: config.security?.geoBlocking?.blockedCountries || []
    },
    temporaryAccess: {
      enabled: true,
      defaultDuration: 3600000 // 1 hour
    }
  };

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #whitelistedIPs = new Set();

  /**
   * @private
   * @static
   * @type {Array<Object>}
   */
  static #whitelistedRanges = [];

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #temporaryAccess = new Map();

  /**
   * Initialize IP whitelist
   * @static
   */
  static async initialize() {
    try {
      // Load static IPs
      this.#config.allowedIPs.forEach(ip => {
        if (this.#isValidIP(ip)) {
          this.#whitelistedIPs.add(ip);
        }
      });

      // Load IP ranges
      this.#config.allowedRanges.forEach(range => {
        const parsed = this.#parseIPRange(range);
        if (parsed) {
          this.#whitelistedRanges.push(parsed);
        }
      });

      // Load from database
      if (this.#config.enabled) {
        await this.#loadDatabaseWhitelist();
      }

      logger.info('IP whitelist initialized', {
        staticIPs: this.#whitelistedIPs.size,
        ranges: this.#whitelistedRanges.length,
        enabled: this.#config.enabled
      });
    } catch (error) {
      logger.error('Failed to initialize IP whitelist', { error: error.message });
      throw error;
    }
  }

  /**
   * Main IP whitelist middleware
   * @static
   * @returns {Function} Express middleware
   */
  static middleware() {
    return async (req, res, next) => {
      // Skip if disabled
      if (!this.#config.enabled) {
        return next();
      }

      try {
        const clientIP = this.#getClientIP(req);
        const isAllowed = await this.#checkIPAccess(clientIP, req);

        if (!isAllowed) {
          logger.warn('IP access denied', {
            ip: clientIP,
            path: req.path,
            user: req.admin?._id
          });

          throw new AppError(
            'Access denied from this IP address',
            403,
            ERROR_CODES.IP_NOT_WHITELISTED,
            { ip: clientIP }
          );
        }

        // Add IP info to request
        req.clientIP = {
          address: clientIP,
          whitelisted: true,
          temporary: this.#temporaryAccess.has(clientIP)
        };

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Add IP to whitelist
   * @static
   * @param {string} ip - IP address
   * @param {Object} [options] - Options
   * @returns {Promise<void>}
   */
  static async addIP(ip, options = {}) {
    try {
      if (!this.#isValidIP(ip)) {
        throw new AppError(
          'Invalid IP address format',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const {
        description,
        expiresAt,
        userId,
        organizationId,
        temporary = false
      } = options;

      if (temporary || expiresAt) {
        // Add temporary access
        const accessId = this.#generateAccessId();
        const expiry = expiresAt || new Date(Date.now() + this.#config.temporaryAccess.defaultDuration);

        this.#temporaryAccess.set(ip, {
          id: accessId,
          ip,
          expiresAt: expiry,
          addedAt: new Date(),
          addedBy: userId,
          description
        });

        // Set expiry timer
        const timeout = expiry.getTime() - Date.now();
        if (timeout > 0) {
          setTimeout(() => this.#temporaryAccess.delete(ip), timeout);
        }

        logger.info('Temporary IP access granted', {
          ip,
          expiresAt: expiry,
          addedBy: userId
        });
      } else {
        // Add permanent access
        this.#whitelistedIPs.add(ip);

        // Persist to database
        await IpWhitelistModel.create({
          ip,
          type: 'single',
          description,
          isActive: true,
          addedBy: userId,
          organizationId
        });

        logger.info('IP added to whitelist', {
          ip,
          addedBy: userId
        });
      }

      // Clear cache
      await this.#clearIPCache(ip);

    } catch (error) {
      logger.error('Failed to add IP to whitelist', {
        ip,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove IP from whitelist
   * @static
   * @param {string} ip - IP address
   * @returns {Promise<void>}
   */
  static async removeIP(ip) {
    try {
      // Remove from memory
      this.#whitelistedIPs.delete(ip);
      this.#temporaryAccess.delete(ip);

      // Remove from database
      await IpWhitelistModel.deleteOne({ ip });

      // Clear cache
      await this.#clearIPCache(ip);

      logger.info('IP removed from whitelist', { ip });

    } catch (error) {
      logger.error('Failed to remove IP from whitelist', {
        ip,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add IP range to whitelist
   * @static
   * @param {string} range - CIDR range
   * @param {Object} [options] - Options
   * @returns {Promise<void>}
   */
  static async addIPRange(range, options = {}) {
    try {
      const parsed = this.#parseIPRange(range);
      if (!parsed) {
        throw new AppError(
          'Invalid IP range format',
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      this.#whitelistedRanges.push(parsed);

      // Persist to database
      await IpWhitelistModel.create({
        ip: range,
        type: 'range',
        description: options.description,
        isActive: true,
        addedBy: options.userId,
        organizationId: options.organizationId
      });

      logger.info('IP range added to whitelist', {
        range,
        addedBy: options.userId
      });

    } catch (error) {
      logger.error('Failed to add IP range', {
        range,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List all whitelisted IPs and ranges
   * @static
   * @returns {Promise<Object>} Whitelist data
   */
  static async listWhitelist() {
    const list = {
      ips: Array.from(this.#whitelistedIPs),
      ranges: this.#whitelistedRanges.map(r => r.original),
      temporary: Array.from(this.#temporaryAccess.values()),
      database: []
    };

    // Get database entries
    const dbEntries = await IpWhitelistModel.find({ isActive: true });
    list.database = dbEntries.map(entry => ({
      ip: entry.ip,
      type: entry.type,
      description: entry.description,
      addedAt: entry.createdAt,
      addedBy: entry.addedBy
    }));

    return list;
  }

  /**
   * Check if IP has access
   * @static
   * @param {string} ip - IP address
   * @returns {Promise<boolean>} Access allowed
   */
  static async checkAccess(ip) {
    return this.#checkIPAccess(ip);
  }

  /**
   * @private
   * Check if IP is allowed
   */
  static async #checkIPAccess(ip, req = null) {
    // Check cache first
    const cacheKey = `${this.#config.cache.prefix}${ip}`;
    const cached = await this.#cacheService.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    let allowed = false;

    // Check super admin bypass
    if (this.#config.bypassForSuperAdmin && req?.admin?.role === 'SUPER_ADMIN') {
      allowed = true;
    }

    // Check private networks
    if (!allowed && this.#config.allowPrivateNetworks && this.#isPrivateIP(ip)) {
      allowed = true;
    }

    // Check static whitelist
    if (!allowed && this.#whitelistedIPs.has(ip)) {
      allowed = true;
    }

    // Check temporary access
    if (!allowed && this.#temporaryAccess.has(ip)) {
      const access = this.#temporaryAccess.get(ip);
      if (new Date() < access.expiresAt) {
        allowed = true;
      } else {
        // Remove expired access
        this.#temporaryAccess.delete(ip);
      }
    }

    // Check IP ranges
    if (!allowed) {
      allowed = this.#checkIPInRanges(ip);
    }

    // Check database whitelist
    if (!allowed) {
      const dbEntry = await IpWhitelistModel.findOne({
        ip,
        isActive: true
      });
      allowed = !!dbEntry;
    }

    // Check geo-blocking
    if (allowed && this.#config.geoBlocking.enabled) {
      allowed = await this.#checkGeoLocation(ip);
    }

    // Cache result
    await this.#cacheService.set(cacheKey, allowed, this.#config.cache.ttl);

    return allowed;
  }

  /**
   * @private
   * Load whitelist from database
   */
  static async #loadDatabaseWhitelist() {
    try {
      const entries = await IpWhitelistModel.find({ isActive: true });

      entries.forEach(entry => {
        if (entry.type === 'single') {
          this.#whitelistedIPs.add(entry.ip);
        } else if (entry.type === 'range') {
          const parsed = this.#parseIPRange(entry.ip);
          if (parsed) {
            this.#whitelistedRanges.push(parsed);
          }
        }
      });

      logger.info('Database whitelist loaded', { count: entries.length });

    } catch (error) {
      logger.error('Failed to load database whitelist', {
        error: error.message
      });
    }
  }

  /**
   * @private
   * Get client IP from request
   */
  static #getClientIP(req) {
    // Check various headers for real IP
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }

    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }

    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * @private
   * Check if IP is valid
   */
  static #isValidIP(ip) {
    return ipaddr.isValid(ip);
  }

  /**
   * @private
   * Check if IP is private
   */
  static #isPrivateIP(ip) {
    try {
      const addr = ipaddr.process(ip);
      
      if (addr.kind() === 'ipv4') {
        return addr.range() === 'private' || 
               addr.range() === 'loopback' ||
               addr.range() === 'linkLocal';
      } else if (addr.kind() === 'ipv6') {
        return addr.range() === 'uniqueLocal' ||
               addr.range() === 'loopback' ||
               addr.range() === 'linkLocal';
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * @private
   * Parse IP range (CIDR notation)
   */
  static #parseIPRange(range) {
    try {
      const [ip, prefixLength] = range.split('/');
      
      if (!this.#isValidIP(ip)) {
        return null;
      }

      const addr = ipaddr.process(ip);
      
      return {
        original: range,
        type: addr.kind(),
        address: addr,
        prefixLength: parseInt(prefixLength) || (addr.kind() === 'ipv4' ? 32 : 128)
      };
    } catch {
      return null;
    }
  }

  /**
   * @private
   * Check if IP is in any whitelisted range
   */
  static #checkIPInRanges(ip) {
    try {
      const addr = ipaddr.process(ip);
      
      return this.#whitelistedRanges.some(range => {
        if (range.type !== addr.kind()) {
          return false;
        }
        
        return addr.match(range.address, range.prefixLength);
      });
    } catch {
      return false;
    }
  }

  /**
   * @private
   * Check geo-location restrictions
   */
  static async #checkGeoLocation(ip) {
    try {
      // This would integrate with a geo-IP service
      // For now, returning true
      return true;
    } catch (error) {
      logger.error('Geo-location check failed', {
        ip,
        error: error.message
      });
      // Fail open - allow access if geo check fails
      return true;
    }
  }

  /**
   * @private
   * Clear IP from cache
   */
  static async #clearIPCache(ip) {
    const cacheKey = `${this.#config.cache.prefix}${ip}`;
    await this.#cacheService.delete(cacheKey);
  }

  /**
   * @private
   * Generate unique access ID
   */
  static #generateAccessId() {
    return `access_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      whitelistedIPs: this.#whitelistedIPs.size,
      whitelistedRanges: this.#whitelistedRanges.length,
      temporaryAccess: this.#temporaryAccess.size
    };
  }
}

// Initialize on module load
IpWhitelistMiddleware.initialize().catch(err => 
  logger.error('IP whitelist initialization failed', { error: err.message })
);

// Export middleware and management functions
module.exports = {
  middleware: IpWhitelistMiddleware.middleware.bind(IpWhitelistMiddleware),
  addIP: IpWhitelistMiddleware.addIP.bind(IpWhitelistMiddleware),
  removeIP: IpWhitelistMiddleware.removeIP.bind(IpWhitelistMiddleware),
  addIPRange: IpWhitelistMiddleware.addIPRange.bind(IpWhitelistMiddleware),
  listWhitelist: IpWhitelistMiddleware.listWhitelist.bind(IpWhitelistMiddleware),
  checkAccess: IpWhitelistMiddleware.checkAccess.bind(IpWhitelistMiddleware),
  getConfig: IpWhitelistMiddleware.getConfig.bind(IpWhitelistMiddleware)
};