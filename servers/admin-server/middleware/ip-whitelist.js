'use strict';

/**
 * @fileoverview IP Whitelist middleware - FIXED VERSION
 * @module servers/admin-server/middleware/ip-whitelist
 */

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');

// FIXED: Safe import for IP whitelist model
let IpWhitelistModel = null;
try {
  IpWhitelistModel = require('../../../shared/lib/database/models/ip-whitelist-model');
} catch (error) {
  console.log('IpWhitelistModel not available, using environment configuration');
}

/**
 * IP whitelist middleware with enhanced security - FIXED VERSION
 * @module servers/admin-server/middleware/ip-whitelist
 */
class IpWhitelistMiddleware {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    enabled: process.env.ADMIN_IP_WHITELIST_ENABLED === 'true',
    addresses: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',').map(ip => ip.trim()) : [],
    allowDevelopment: process.env.NODE_ENV === 'development',
    allowLocalhost: process.env.ADMIN_ALLOW_LOCALHOST !== 'false',
    logBlocked: process.env.ADMIN_LOG_BLOCKED_IPS !== 'false'
  };

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #blockedIPs = new Set();

  /**
   * Main IP whitelist middleware - FIXED to always call next()
   * @static
   * @returns {Function} Express middleware
   */
  static middleware() {
    return async (req, res, next) => {
      try {
        // FIXED: Always allow in development mode
        if (this.#config.allowDevelopment) {
          logger.debug('Development mode: Bypassing IP whitelist check');
          return next();
        }

        // If whitelist is disabled, allow all requests
        if (!this.#config.enabled) {
          logger.debug('IP whitelist disabled, allowing request');
          return next();
        }

        // Get client IP
        const clientIP = this.#getClientIP(req);
        
        // Check if IP is whitelisted
        const isWhitelisted = await this.#isIPWhitelisted(clientIP, req);
        
        if (!isWhitelisted) {
          // Log blocked attempt
          if (this.#config.logBlocked) {
            logger.warn('IP not whitelisted, blocking request', {
              clientIP,
              path: req.path,
              method: req.method,
              userAgent: req.get('user-agent'),
              timestamp: new Date().toISOString()
            });
          }

          // Track blocked IP
          this.#blockedIPs.add(clientIP);
          
          return res.status(403).json({
            success: false,
            error: {
              message: 'Access denied: IP address not authorized',
              code: 'IP_NOT_WHITELISTED',
              timestamp: new Date().toISOString()
            }
          });
        }

        // Remove from blocked set if previously blocked
        this.#blockedIPs.delete(clientIP);
        
        logger.debug('IP whitelisted, allowing request', { 
          clientIP,
          path: req.path 
        });
        
        next();
      } catch (error) {
        logger.error('IP whitelist middleware error', {
          error: error.message,
          path: req.path,
          stack: error.stack
        });
        
        // FIXED: In case of error, allow request to continue in development, block in production
        if (process.env.NODE_ENV === 'development') {
          logger.warn('IP whitelist error in development, allowing request to continue');
          next();
        } else {
          logger.error('IP whitelist error in production, blocking request for security');
          res.status(500).json({
            success: false,
            error: {
              message: 'Security system error',
              code: 'SECURITY_ERROR',
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    };
  }

  /**
   * @private
   * Get client IP address with enhanced detection
   */
  static #getClientIP(req) {
    // Try multiple headers for IP detection
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      // Return the first non-private IP or the first IP
      for (const ip of ips) {
        if (!this.#isPrivateIP(ip)) {
          return ip;
        }
      }
      return ips[0];
    }

    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           req.headers['x-real-ip'] ||
           req.headers['x-client-ip'] ||
           req.headers['cf-connecting-ip'] ||
           '127.0.0.1';
  }

  /**
   * @private
   * Check if IP is in whitelist (both database and environment)
   */
  static async #isIPWhitelisted(ip, req) {
    try {
      // Always allow localhost in development or if configured
      if (this.#config.allowLocalhost && this.#isLocalhostIP(ip)) {
        logger.debug('Allowing localhost IP', { ip });
        return true;
      }

      // Check environment-based whitelist first
      if (this.#isIPInEnvironmentWhitelist(ip)) {
        logger.debug('IP found in environment whitelist', { ip });
        return true;
      }

      // Check database whitelist if model is available
      if (IpWhitelistModel) {
        const dbWhitelisted = await this.#isIPInDatabaseWhitelist(ip, req);
        if (dbWhitelisted) {
          logger.debug('IP found in database whitelist', { ip });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking IP whitelist', {
        ip,
        error: error.message
      });
      
      // FIXED: On error, allow in development, deny in production
      return process.env.NODE_ENV === 'development';
    }
  }

  /**
   * @private
   * Check environment-based whitelist
   */
  static #isIPInEnvironmentWhitelist(ip) {
    return this.#config.addresses.some(whitelistedIP => {
      // Handle CIDR ranges
      if (whitelistedIP.includes('/')) {
        return this.#isIPInCIDR(ip, whitelistedIP);
      }
      
      // Handle wildcards
      if (whitelistedIP.includes('*')) {
        return this.#matchWildcard(ip, whitelistedIP);
      }
      
      // Exact match
      return ip === whitelistedIP;
    });
  }

  /**
   * @private
   * Check database whitelist
   */
  static async #isIPInDatabaseWhitelist(ip, req) {
    try {
      // Get tenant/organization context if available
      const options = {};
      if (req.user?.organizationId) {
        options.organizationId = req.user.organizationId;
      }
      if (req.tenant?.id) {
        options.tenantId = req.tenant.id;
      }

      // Find active whitelist entries for this IP
      const entries = await IpWhitelistModel.findActiveByIP(ip, options);
      
      if (entries.length > 0) {
        // Record usage for the first matching entry
        await entries[0].recordUsage();
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Database whitelist check failed', {
        ip,
        error: error.message
      });
      return false;
    }
  }

  /**
   * @private
   * Check if IP is localhost
   */
  static #isLocalhostIP(ip) {
    const localhostIPs = [
      '127.0.0.1',
      '::1',
      'localhost',
      '0.0.0.0',
      '::',
      '127.0.0.0/8'
    ];
    
    return localhostIPs.some(localhost => {
      if (localhost.includes('/')) {
        return this.#isIPInCIDR(ip, localhost);
      }
      return ip === localhost;
    });
  }

  /**
   * @private
   * Check if IP is private/internal
   */
  static #isPrivateIP(ip) {
    const privateRanges = [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '127.0.0.0/8',
      'fc00::/7',
      'fe80::/10',
      '::1/128'
    ];
    
    return privateRanges.some(range => this.#isIPInCIDR(ip, range));
  }

  /**
   * @private
   * Basic CIDR matching (enhanced implementation)
   */
  static #isIPInCIDR(ip, cidr) {
    try {
      const [network, prefixLength] = cidr.split('/');
      
      if (!prefixLength) {
        return ip === network;
      }

      // Handle IPv4
      if (network.includes('.')) {
        return this.#isIPv4InCIDR(ip, network, parseInt(prefixLength, 10));
      }
      
      // Handle IPv6 (basic implementation)
      if (network.includes(':')) {
        return this.#isIPv6InCIDR(ip, network, parseInt(prefixLength, 10));
      }

      return false;
    } catch (error) {
      logger.error('CIDR matching error', { ip, cidr, error: error.message });
      return false;
    }
  }

  /**
   * @private
   * IPv4 CIDR matching
   */
  static #isIPv4InCIDR(ip, network, prefixLength) {
    try {
      const ipParts = ip.split('.').map(part => parseInt(part, 10));
      const networkParts = network.split('.').map(part => parseInt(part, 10));
      
      if (ipParts.length !== 4 || networkParts.length !== 4) {
        return false;
      }

      // Convert to 32-bit integers
      const ipInt = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
      const networkInt = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
      
      // Create subnet mask
      const mask = (-1 << (32 - prefixLength)) >>> 0;
      
      return (ipInt & mask) === (networkInt & mask);
    } catch (error) {
      logger.error('IPv4 CIDR matching error', { ip, network, prefixLength, error: error.message });
      return false;
    }
  }

  /**
   * @private
   * IPv6 CIDR matching (basic implementation)
   */
  static #isIPv6InCIDR(ip, network, prefixLength) {
    try {
      // Simplified IPv6 matching - exact match for now
      // For production, consider using a proper IPv6 library
      if (prefixLength >= 128) {
        return ip === network;
      }
      
      // Basic prefix matching
      const ipExpanded = this.#expandIPv6(ip);
      const networkExpanded = this.#expandIPv6(network);
      
      const prefixChars = Math.floor(prefixLength / 4);
      return ipExpanded.substring(0, prefixChars) === networkExpanded.substring(0, prefixChars);
    } catch (error) {
      logger.error('IPv6 CIDR matching error', { ip, network, prefixLength, error: error.message });
      return false;
    }
  }

  /**
   * @private
   * Expand IPv6 address (basic implementation)
   */
  static #expandIPv6(ip) {
    // Basic IPv6 expansion - for production, use proper library
    return ip.replace(/::/, ':0000:0000:0000:0000:0000:0000:0000:')
             .split(':')
             .map(part => part.padStart(4, '0'))
             .join('');
  }

  /**
   * @private
   * Wildcard matching
   */
  static #matchWildcard(ip, pattern) {
    try {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return regex.test(ip);
    } catch (error) {
      logger.error('Wildcard matching error', { ip, pattern, error: error.message });
      return false;
    }
  }

  /**
   * Get whitelist status for an IP
   * @static
   * @param {string} ip - IP address to check
   * @returns {Promise<Object>} Whitelist status
   */
  static async getStatus(ip) {
    try {
      const isWhitelisted = await this.#isIPWhitelisted(ip, {});
      const isBlocked = this.#blockedIPs.has(ip);
      
      return {
        ip,
        whitelisted: isWhitelisted,
        blocked: isBlocked,
        environment: this.#isIPInEnvironmentWhitelist(ip),
        database: IpWhitelistModel ? await this.#isIPInDatabaseWhitelist(ip, {}) : false,
        localhost: this.#isLocalhostIP(ip),
        private: this.#isPrivateIP(ip),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get IP status', { ip, error: error.message });
      return {
        ip,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get current configuration
   * @static
   * @returns {Object} Current configuration
   */
  static getConfig() {
    return {
      ...this.#config,
      blockedIPsCount: this.#blockedIPs.size,
      modelAvailable: !!IpWhitelistModel
    };
  }

  /**
   * Update whitelist addresses
   * @static
   * @param {Array<string>} addresses - New whitelist addresses
   */
  static updateWhitelist(addresses) {
    this.#config.addresses = Array.isArray(addresses) ? addresses.map(ip => ip.trim()) : [];
    logger.info('IP whitelist updated', { addresses: this.#config.addresses });
  }

  /**
   * Clear blocked IPs cache
   * @static
   */
  static clearBlocked() {
    const count = this.#blockedIPs.size;
    this.#blockedIPs.clear();
    logger.info('Cleared blocked IPs cache', { count });
  }

  /**
   * Get blocked IPs
   * @static
   * @returns {Array<string>} List of blocked IPs
   */
  static getBlockedIPs() {
    return Array.from(this.#blockedIPs);
  }
}

// Export the middleware function
module.exports = IpWhitelistMiddleware.middleware.bind(IpWhitelistMiddleware);

// Also export the class and utility functions
module.exports.IpWhitelistMiddleware = IpWhitelistMiddleware;
module.exports.getStatus = IpWhitelistMiddleware.getStatus.bind(IpWhitelistMiddleware);
module.exports.getConfig = IpWhitelistMiddleware.getConfig.bind(IpWhitelistMiddleware);
module.exports.updateWhitelist = IpWhitelistMiddleware.updateWhitelist.bind(IpWhitelistMiddleware);
module.exports.clearBlocked = IpWhitelistMiddleware.clearBlocked.bind(IpWhitelistMiddleware);
module.exports.getBlockedIPs = IpWhitelistMiddleware.getBlockedIPs.bind(IpWhitelistMiddleware);