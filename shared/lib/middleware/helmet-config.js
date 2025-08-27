'use strict';

/**
 * @fileoverview Helmet security headers configuration with environment-based settings
 * @module shared/lib/middleware/helmet-config
 * @requires module:helmet
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/security-policy-model
 * @requires module:shared/lib/config
 */

const helmet = require('helmet');
const logger = require('../utils/logger');
const CacheService = require('../services/cache-service');
const SecurityPolicyModel = require('../database/models/admin-server/security-administration/models/security-policy-model');
// const config = require('./helmet-config');

/**
 * @class HelmetConfig
 * @description Comprehensive security headers configuration with dynamic policies
 */
class HelmetConfig {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #policyCache;

  /**
   * @private
   * @type {Map<string, Function>}
   */
  #middlewareCache;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    // Content Security Policy
    contentSecurityPolicy: {
      enabled: process.env.CSP_ENABLED !== 'false',
      reportOnly: process.env.CSP_REPORT_ONLY === 'true',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Consider removing in production
          "'unsafe-eval'", // Consider removing in production
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          ...(process.env.CSP_SCRIPT_SRC ? process.env.CSP_SCRIPT_SRC.split(',') : [])
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          ...(process.env.CSP_STYLE_SRC ? process.env.CSP_STYLE_SRC.split(',') : [])
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'data:',
          ...(process.env.CSP_FONT_SRC ? process.env.CSP_FONT_SRC.split(',') : [])
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:',
          ...(process.env.CSP_IMG_SRC ? process.env.CSP_IMG_SRC.split(',') : [])
        ],
        connectSrc: [
          "'self'",
          'wss:',
          'https:',
          ...(process.env.CSP_CONNECT_SRC ? process.env.CSP_CONNECT_SRC.split(',') : [])
        ],
        mediaSrc: ["'self'", 'https:', 'blob:'],
        objectSrc: ["'none'"],
        childSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", ...(process.env.CSP_FRAME_SRC ? process.env.CSP_FRAME_SRC.split(',') : [])],
        workerSrc: ["'self'", 'blob:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        manifestSrc: ["'self'"],
        reportUri: process.env.CSP_REPORT_URI || '/api/security/csp-report',
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },

    // DNS Prefetch Control
    dnsPrefetchControl: {
      allow: process.env.DNS_PREFETCH_ALLOW === 'true'
    },

    // Expect-CT
    expectCt: {
      enabled: process.env.EXPECT_CT_ENABLED === 'true',
      maxAge: parseInt(process.env.EXPECT_CT_MAX_AGE || '86400', 10),
      enforce: process.env.EXPECT_CT_ENFORCE === 'true',
      reportUri: process.env.EXPECT_CT_REPORT_URI
    },

    // Frameguard (X-Frame-Options)
    frameguard: {
      action: process.env.FRAMEGUARD_ACTION || 'deny' // 'deny', 'sameorigin', or specific origin
    },

    // Hide Powered By
    hidePoweredBy: {
      enabled: process.env.HIDE_POWERED_BY !== 'false'
    },

    // HTTP Strict Transport Security
    hsts: {
      enabled: process.env.HSTS_ENABLED !== 'false',
      maxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10), // 1 year
      includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
      preload: process.env.HSTS_PRELOAD === 'true'
    },

    // IE No Open
    ieNoOpen: {
      enabled: process.env.IE_NO_OPEN !== 'false'
    },

    // No Sniff
    noSniff: {
      enabled: process.env.NO_SNIFF !== 'false'
    },

    // Origin Agent Cluster
    originAgentCluster: {
      enabled: process.env.ORIGIN_AGENT_CLUSTER === 'true'
    },

    // Permitted Cross-Domain Policies
    permittedCrossDomainPolicies: {
      permittedPolicies: process.env.CROSS_DOMAIN_POLICIES || 'none'
    },

    // Referrer Policy
    referrerPolicy: {
      policy: process.env.REFERRER_POLICY || 'strict-origin-when-cross-origin'
    },

    // X-XSS-Protection (deprecated but still used by some browsers)
    xssFilter: {
      enabled: process.env.XSS_FILTER !== 'false',
      mode: 'block',
      reportUri: process.env.XSS_REPORT_URI
    },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: {
      enabled: process.env.COEP_ENABLED === 'true',
      policy: process.env.COEP_POLICY || 'require-corp'
    },

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: {
      enabled: process.env.COOP_ENABLED === 'true',
      policy: process.env.COOP_POLICY || 'same-origin'
    },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: {
      enabled: process.env.CORP_ENABLED === 'true',
      policy: process.env.CORP_POLICY || 'same-origin'
    },

    // Custom policies
    customPolicies: {
      enabled: process.env.HELMET_CUSTOM_POLICIES === 'true',
      dynamicPolicies: process.env.HELMET_DYNAMIC_POLICIES === 'true'
    },

    // Multi-tenant configuration
    multiTenant: {
      enabled: process.env.HELMET_MULTI_TENANT === 'true',
      inheritGlobalPolicies: true,
      allowOverrides: true
    },

    // Nonce generation for CSP
    nonce: {
      enabled: process.env.CSP_NONCE_ENABLED === 'true',
      length: parseInt(process.env.CSP_NONCE_LENGTH || '16', 10)
    },

    // Cache configuration
    cache: {
      enabled: process.env.HELMET_CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.HELMET_CACHE_TTL || '3600', 10)
    }
  };

  /**
   * Creates HelmetConfig instance
   * @param {Object} [options] - Configuration options
   * @param {CacheService} [cacheService] - Cache service instance
   */
  constructor(options = {}, cacheService) {
    this.#config = this.#mergeConfig(options);
    this.#cacheService = cacheService || new CacheService();
    this.#policyCache = new Map();
    this.#middlewareCache = new Map();

    logger.info('HelmetConfig initialized', {
      cspEnabled: this.#config.contentSecurityPolicy.enabled,
      hstsEnabled: this.#config.hsts.enabled,
      multiTenantEnabled: this.#config.multiTenant.enabled
    });
  }

  /**
   * Gets Helmet configuration
   * @param {Object} [context] - Request context
   * @returns {Promise<Object>} Helmet configuration object
   */
  async getHelmetConfig(context = {}) {
    try {
      // Get base configuration
      let helmetConfig = await this.#buildBaseConfig();

      // Apply tenant-specific policies if enabled
      if (this.#config.multiTenant.enabled && context.tenantId) {
        helmetConfig = await this.#applyTenantPolicies(helmetConfig, context.tenantId);
      }

      // Apply dynamic policies if enabled
      if (this.#config.customPolicies.dynamicPolicies) {
        helmetConfig = await this.#applyDynamicPolicies(helmetConfig, context);
      }

      // Generate nonce if enabled
      if (this.#config.nonce.enabled && helmetConfig.contentSecurityPolicy) {
        helmetConfig.contentSecurityPolicy.directives.scriptSrc.push(
          `'nonce-${context.nonce}'`
        );
        helmetConfig.contentSecurityPolicy.directives.styleSrc.push(
          `'nonce-${context.nonce}'`
        );
      }

      return helmetConfig;

    } catch (error) {
      logger.error('Failed to get Helmet configuration', {
        error: error.message,
        context
      });

      // Return safe defaults on error
      return this.#getSafeDefaults();
    }
  }

  /**
   * Creates Helmet middleware
   * @param {Object} [options] - Middleware options
   * @returns {Function} Express middleware function
   */
  middleware(options = {}) {
    return async (req, res, next) => {
      try {
        const context = {
          tenantId: req.tenantId || req.headers['x-tenant-id'],
          userId: req.auth?.user?._id,
          path: req.path,
          method: req.method
        };

        // Generate nonce if enabled
        if (this.#config.nonce.enabled) {
          context.nonce = this.#generateNonce();
          res.locals.nonce = context.nonce;
        }

        // Get cached middleware or create new one
        const middlewareKey = this.#getMiddlewareKey(context, options);
        let helmetMiddleware = this.#middlewareCache.get(middlewareKey);

        if (!helmetMiddleware) {
          const helmetConfig = await this.getHelmetConfig(context);
          const finalConfig = { ...helmetConfig, ...options };
          helmetMiddleware = helmet(finalConfig);

          // Cache middleware instance
          if (this.#config.cache.enabled) {
            this.#cacheMiddleware(middlewareKey, helmetMiddleware);
          }
        }

        // Apply Helmet middleware
        helmetMiddleware(req, res, next);

      } catch (error) {
        logger.error('Helmet middleware error', {
          error: error.message,
          path: req.path
        });

        // Apply safe defaults on error
        helmet(this.#getSafeDefaults())(req, res, next);
      }
    };
  }

  /**
   * Gets specific security policy
   * @param {string} policyName - Policy name
   * @param {Object} [context] - Request context
   * @returns {Promise<Object>} Policy configuration
   */
  async getPolicy(policyName, context = {}) {
    const cacheKey = `policy:${policyName}:${context.tenantId || 'global'}`;

    // Check cache
    if (this.#config.cache.enabled) {
      const cached = this.#policyCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Get base policy
      let policy = this.#config[policyName];

      // Apply tenant overrides
      if (context.tenantId && this.#config.multiTenant.enabled) {
        const tenantPolicy = await this.#getTenantPolicy(policyName, context.tenantId);
        if (tenantPolicy) {
          policy = this.#mergePolicy(policy, tenantPolicy);
        }
      }

      // Cache policy
      if (this.#config.cache.enabled && policy) {
        this.#policyCache.set(cacheKey, policy);
      }

      return policy;

    } catch (error) {
      logger.error('Failed to get policy', {
        policyName,
        error: error.message
      });

      return this.#config[policyName];
    }
  }

  /**
   * Updates security policy
   * @param {string} policyName - Policy name
   * @param {Object} policyConfig - New policy configuration
   * @param {Object} [options] - Update options
   * @returns {Promise<void>}
   */
  async updatePolicy(policyName, policyConfig, options = {}) {
    try {
      if (options.tenantId && this.#config.multiTenant.enabled) {
        // Update tenant policy
        await SecurityPolicyModel.findOneAndUpdate(
          {
            name: policyName,
            tenantId: options.tenantId
          },
          {
            configuration: policyConfig,
            updatedAt: new Date()
          },
          { upsert: true }
        );
      } else {
        // Update global policy
        this.#config[policyName] = this.#mergePolicy(
          this.#config[policyName],
          policyConfig
        );
      }

      // Clear caches
      this.#clearPolicyCaches(policyName);

      logger.info('Security policy updated', {
        policyName,
        tenantId: options.tenantId
      });

    } catch (error) {
      logger.error('Failed to update policy', {
        policyName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validates CSP directive
   * @param {Object} directive - CSP directive to validate
   * @returns {Object} Validation result
   */
  validateCSPDirective(directive) {
    const errors = [];
    const warnings = [];

    // Check for unsafe-inline in production
    if (process.env.NODE_ENV === 'production') {
      if (directive.scriptSrc?.includes("'unsafe-inline'")) {
        warnings.push("'unsafe-inline' in script-src is not recommended in production");
      }
      if (directive.styleSrc?.includes("'unsafe-inline'")) {
        warnings.push("'unsafe-inline' in style-src should be avoided if possible");
      }
      if (directive.scriptSrc?.includes("'unsafe-eval'")) {
        errors.push("'unsafe-eval' in script-src is dangerous in production");
      }
    }

    // Check for wildcards
    Object.entries(directive).forEach(([key, values]) => {
      if (Array.isArray(values) && values.includes('*')) {
        warnings.push(`Wildcard (*) in ${key} is too permissive`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * @private
   * Merges configuration with defaults
   */
  #mergeConfig(options) {
    const merged = { ...HelmetConfig.#DEFAULT_CONFIG };

    Object.keys(HelmetConfig.#DEFAULT_CONFIG).forEach(key => {
      if (typeof HelmetConfig.#DEFAULT_CONFIG[key] === 'object' && 
          !Array.isArray(HelmetConfig.#DEFAULT_CONFIG[key])) {
        merged[key] = {
          ...HelmetConfig.#DEFAULT_CONFIG[key],
          ...(options[key] || {})
        };
      } else if (options[key] !== undefined) {
        merged[key] = options[key];
      }
    });

    return merged;
  }

  /**
   * @private
   * Builds base Helmet configuration
   */
  async #buildBaseConfig() {
    const helmetConfig = {};

    // Content Security Policy
    if (this.#config.contentSecurityPolicy.enabled) {
      helmetConfig.contentSecurityPolicy = {
        reportOnly: this.#config.contentSecurityPolicy.reportOnly,
        directives: { ...this.#config.contentSecurityPolicy.directives }
      };
    } else {
      helmetConfig.contentSecurityPolicy = false;
    }

    // DNS Prefetch Control
    helmetConfig.dnsPrefetchControl = {
      allow: this.#config.dnsPrefetchControl.allow
    };

    // Expect-CT
    if (this.#config.expectCt.enabled) {
      helmetConfig.expectCt = {
        maxAge: this.#config.expectCt.maxAge,
        enforce: this.#config.expectCt.enforce,
        reportUri: this.#config.expectCt.reportUri
      };
    } else {
      helmetConfig.expectCt = false;
    }

    // Frameguard
    helmetConfig.frameguard = {
      action: this.#config.frameguard.action
    };

    // Hide Powered By
    helmetConfig.hidePoweredBy = this.#config.hidePoweredBy.enabled;

    // HSTS
    if (this.#config.hsts.enabled) {
      helmetConfig.hsts = {
        maxAge: this.#config.hsts.maxAge,
        includeSubDomains: this.#config.hsts.includeSubDomains,
        preload: this.#config.hsts.preload
      };
    } else {
      helmetConfig.hsts = false;
    }

    // IE No Open
    helmetConfig.ieNoOpen = this.#config.ieNoOpen.enabled;

    // No Sniff
    helmetConfig.noSniff = this.#config.noSniff.enabled;

    // Origin Agent Cluster
    helmetConfig.originAgentCluster = this.#config.originAgentCluster.enabled;

    // Permitted Cross-Domain Policies
    helmetConfig.permittedCrossDomainPolicies = {
      permittedPolicies: this.#config.permittedCrossDomainPolicies.permittedPolicies
    };

    // Referrer Policy
    helmetConfig.referrerPolicy = {
      policy: this.#config.referrerPolicy.policy
    };

    // XSS Filter
    helmetConfig.xssFilter = this.#config.xssFilter.enabled;

    // Cross-Origin Policies
    if (this.#config.crossOriginEmbedderPolicy.enabled) {
      helmetConfig.crossOriginEmbedderPolicy = {
        policy: this.#config.crossOriginEmbedderPolicy.policy
      };
    }

    if (this.#config.crossOriginOpenerPolicy.enabled) {
      helmetConfig.crossOriginOpenerPolicy = {
        policy: this.#config.crossOriginOpenerPolicy.policy
      };
    }

    if (this.#config.crossOriginResourcePolicy.enabled) {
      helmetConfig.crossOriginResourcePolicy = {
        policy: this.#config.crossOriginResourcePolicy.policy
      };
    }

    return helmetConfig;
  }

  /**
   * @private
   * Applies tenant-specific policies
   */
  async #applyTenantPolicies(baseConfig, tenantId) {
    try {
      const tenantPolicies = await SecurityPolicyModel.find({
        tenantId,
        isActive: true
      });

      let config = { ...baseConfig };

      tenantPolicies.forEach(policy => {
        if (policy.name && policy.configuration) {
          config[policy.name] = this.#mergePolicy(
            config[policy.name],
            policy.configuration
          );
        }
      });

      return config;

    } catch (error) {
      logger.error('Failed to apply tenant policies', {
        tenantId,
        error: error.message
      });

      return baseConfig;
    }
  }

  /**
   * @private
   * Applies dynamic policies based on context
   */
  async #applyDynamicPolicies(baseConfig, context) {
    // This could apply policies based on:
    // - User roles/permissions
    // - Request path patterns
    // - Time-based rules
    // - Geographic location
    // etc.

    return baseConfig;
  }

  /**
   * @private
   * Gets safe default configuration
   */
  #getSafeDefaults() {
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      ieNoOpen: true,
      noSniff: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true
    };
  }

  /**
   * @private
   * Gets tenant-specific policy
   */
  async #getTenantPolicy(policyName, tenantId) {
    try {
      const policy = await SecurityPolicyModel.findOne({
        name: policyName,
        tenantId,
        isActive: true
      });

      return policy?.configuration;

    } catch (error) {
      logger.error('Failed to get tenant policy', {
        policyName,
        tenantId,
        error: error.message
      });

      return null;
    }
  }

  /**
   * @private
   * Merges policies
   */
  #mergePolicy(basePolicy, overridePolicy) {
    if (!overridePolicy) return basePolicy;
    if (!basePolicy) return overridePolicy;

    // Deep merge for objects
    if (typeof basePolicy === 'object' && typeof overridePolicy === 'object') {
      const merged = { ...basePolicy };

      Object.entries(overridePolicy).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // For arrays, replace entirely
          merged[key] = value;
        } else if (typeof value === 'object' && value !== null) {
          // Recursive merge for nested objects
          merged[key] = this.#mergePolicy(basePolicy[key], value);
        } else {
          merged[key] = value;
        }
      });

      return merged;
    }

    return overridePolicy;
  }

  /**
   * @private
   * Generates CSP nonce
   */
  #generateNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    
    for (let i = 0; i < this.#config.nonce.length; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return nonce;
  }

  /**
   * @private
   * Gets middleware cache key
   */
  #getMiddlewareKey(context, options) {
    const parts = [
      context.tenantId || 'global',
      context.path || 'default',
      JSON.stringify(options)
    ];
    return parts.join(':');
  }

  /**
   * @private
   * Caches middleware instance
   */
  #cacheMiddleware(key, middleware) {
    this.#middlewareCache.set(key, middleware);

    // Limit cache size
    if (this.#middlewareCache.size > 100) {
      const firstKey = this.#middlewareCache.keys().next().value;
      this.#middlewareCache.delete(firstKey);
    }
  }

  /**
   * @private
   * Clears policy caches
   */
  #clearPolicyCaches(policyName) {
    // Clear policy cache entries
    this.#policyCache.forEach((value, key) => {
      if (key.includes(policyName)) {
        this.#policyCache.delete(key);
      }
    });

    // Clear middleware cache
    this.#middlewareCache.clear();
  }

  /**
   * Gets configuration summary
   * @returns {Object} Configuration summary
   */
  getConfigSummary() {
    return {
      csp: {
        enabled: this.#config.contentSecurityPolicy.enabled,
        reportOnly: this.#config.contentSecurityPolicy.reportOnly,
        hasNonce: this.#config.nonce.enabled
      },
      hsts: {
        enabled: this.#config.hsts.enabled,
        maxAge: this.#config.hsts.maxAge,
        preload: this.#config.hsts.preload
      },
      crossOriginPolicies: {
        coep: this.#config.crossOriginEmbedderPolicy.enabled,
        coop: this.#config.crossOriginOpenerPolicy.enabled,
        corp: this.#config.crossOriginResourcePolicy.enabled
      },
      multiTenant: this.#config.multiTenant.enabled,
      cacheEnabled: this.#config.cache.enabled
    };
  }

  /**
   * Exports configuration for documentation
   * @returns {Object} Exportable configuration
   */
  exportConfig() {
    const config = { ...this.#config };
    
    // Remove sensitive information
    delete config.cache;
    
    return config;
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates HelmetConfig instance
 * @param {Object} [options] - Configuration options
 * @returns {HelmetConfig} HelmetConfig instance
 */
const getHelmetConfig = (options) => {
  if (!instance) {
    instance = new HelmetConfig(options);
  }
  return instance;
};

module.exports = {
  HelmetConfig,
  getHelmetConfig,
  // Export convenience methods
  getConfig: (context) => getHelmetConfig().getHelmetConfig(context),
  helmet: (options) => getHelmetConfig().middleware(options),
  getPolicy: (name, context) => getHelmetConfig().getPolicy(name, context),
  updatePolicy: (name, config, options) => getHelmetConfig().updatePolicy(name, config, options),
  validateCSP: (directive) => getHelmetConfig().validateCSPDirective(directive)
};