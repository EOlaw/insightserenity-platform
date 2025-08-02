'use strict';

/**
 * @fileoverview Staging environment configuration overrides using class-based architecture
 * @module shared/config/environment/staging
 */

/**
 * Staging environment configuration class
 * @class StagingConfig
 */
class StagingConfig {
  constructor() {
    // Environment metadata
    this.environment = {
      name: 'staging',
      isDevelopment: false,
      isStaging: true,
      isProduction: false,
      isTest: false,
      debug: false,
      verbose: false,
      urls: {
        api: 'https://staging-api.insightserenity.com',
        admin: 'https://staging-admin.insightserenity.com',
        services: 'https://staging-services.insightserenity.com',
        client: 'https://staging-app.insightserenity.com'
      },
      features: {
        hotReload: false,
        sourceMap: false,
        errorStack: true,
        detailedErrors: true,
        mockData: false,
        seedData: false
      },
      thirdParty: {
        googleAnalytics: {
          enabled: true,
          trackingId: process.env.GA_TRACKING_ID_STAGING,
          anonymizeIp: true
        },
        sentry: {
          enabled: true,
          dsn: process.env.SENTRY_DSN_STAGING,
          environment: 'staging',
          tracesSampleRate: 0.1
        },
        intercom: {
          enabled: false
        }
      },
      monitoring: {
        prometheus: {
          enabled: true,
          port: 9090
        },
        grafana: {
          enabled: true,
          url: 'https://staging-grafana.insightserenity.com'
        },
        jaeger: {
          enabled: true,
          endpoint: 'https://staging-jaeger.insightserenity.com'
        }
      }
    };

    // Base configuration overrides
    this.base = {
      app: {
        environment: 'staging',
        debug: false
      },
      server: {
        protocol: 'https',
        trustProxy: true
      },
      api: {
        rateLimiting: {
          enabled: true,
          windowMs: 900000,
          maxRequests: 200 // Higher than production for testing
        }
      },
      cors: {
        origins: [
          'https://staging.insightserenity.com',
          'https://staging-app.insightserenity.com',
          'https://staging-admin.insightserenity.com',
          'https://staging-api.insightserenity.com'
        ],
        credentials: true
      },
      logging: {
        level: 'info',
        format: 'json',
        colorize: false,
        prettyPrint: false,
        logRequests: true,
        logResponses: false
      },
      features: {
        experimental: {
          aiAssistant: true,
          advancedAnalytics: true,
          blockchain: false
        }
      },
      performance: {
        enableClustering: true,
        workers: 2 // Limited workers in staging
      }
    };

    // Database configuration overrides
    this.database = {
      uri: process.env.DB_URI || 'mongodb+srv://staging-cluster.mongodb.net/insightserenity_staging',
      options: {
        maxPoolSize: 50,
        minPoolSize: 5,
        retryWrites: true,
        w: 'majority',
        wtimeoutMS: 5000,
        journal: true,
        readPreference: 'primaryPreferred'
      },
      databases: {
        admin: 'insightserenity_staging_admin',
        shared: 'insightserenity_staging_shared',
        tenantPrefix: 'staging_tenant_',
        audit: 'insightserenity_staging_audit',
        analytics: 'insightserenity_staging_analytics'
      },
      migrations: {
        autoRun: false,
        validateChecksums: true
      },
      backup: {
        enabled: true,
        schedule: '0 3 * * *', // Daily at 3 AM
        retention: 7, // Keep for 7 days
        provider: 's3',
        path: 's3://insightserenity-staging-backups'
      },
      performance: {
        enableProfiling: true,
        profilingLevel: 1, // Only slow operations
        slowQueryThreshold: 100
      },
      monitoring: {
        logSlowQueries: true,
        logQueryPlans: false
      },
      security: {
        authEnabled: true,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        authSource: 'admin',
        tls: true,
        tlsAllowInvalidCertificates: false
      }
    };

    // Security configuration overrides
    this.security = {
      jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessTokenExpiry: '30m',
        refreshTokenExpiry: '7d'
      },
      encryption: {
        key: process.env.ENCRYPTION_KEY,
        saltRounds: 12
      },
      session: {
        secret: process.env.SESSION_SECRET,
        cookie: {
          secure: true,
          sameSite: 'strict',
          domain: '.staging.insightserenity.com'
        }
      },
      authentication: {
        requireEmailVerification: true,
        multiFactorRequired: false // Optional in staging
      },
      csrf: {
        enabled: true
      },
      headers: {
        contentSecurityPolicy: {
          enabled: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://staging-cdn.insightserenity.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://staging-cdn.insightserenity.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://staging-api.insightserenity.com']
          }
        },
        strictTransportSecurity: {
          enabled: true,
          maxAge: 86400, // 24 hours for staging
          includeSubDomains: true,
          preload: false
        }
      },
      ipSecurity: {
        enableWhitelist: true,
        whitelist: [
          // Add staging environment IPs
          '10.0.0.0/8',
          '172.16.0.0/12',
          '192.168.0.0/16'
        ]
      },
      rateLimit: {
        global: {
          enabled: true,
          max: 200
        },
        login: {
          max: 10
        }
      },
      audit: {
        enabled: true,
        encryptLogs: true,
        retentionDays: 30
      }
    };

    // Redis configuration overrides
    this.redis = {
      host: process.env.REDIS_HOST || 'staging-redis.insightserenity.com',
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      database: 0,
      connectionName: 'InsightSerenity-Staging',
      tls: {
        enabled: true,
        rejectUnauthorized: true
      },
      sentinel: {
        enabled: true,
        sentinels: [
          { host: 'staging-sentinel-1.insightserenity.com', port: 26379 },
          { host: 'staging-sentinel-2.insightserenity.com', port: 26379 }
        ],
        name: 'staging-master',
        password: process.env.REDIS_SENTINEL_PASSWORD
      },
      monitoring: {
        enabled: true,
        metricsInterval: 300000 // 5 minutes
      },
      security: {
        requirePass: true
      }
    };

    // Email configuration overrides
    this.email = {
      provider: 'sendgrid',
      from: {
        name: 'InsightSerenity Staging',
        address: 'noreply-staging@insightserenity.com',
        replyTo: 'support-staging@insightserenity.com'
      },
      providers: {
        sendgrid: {
          apiKey: process.env.SENDGRID_API_KEY,
          sandboxMode: true, // Enable sandbox mode in staging
          categories: ['staging', 'transactional']
        }
      },
      development: {
        preview: false,
        interceptAll: true,
        interceptAddress: 'staging-emails@insightserenity.com',
        logToConsole: false,
        saveToFile: false
      },
      bounceHandling: {
        enabled: true,
        webhookEndpoint: '/webhooks/staging/email/bounce'
      },
      tracking: {
        enabled: true,
        customDomain: 'staging-track.insightserenity.com'
      },
      emailTypes: {
        welcome: {
          subject: '[STAGING] Welcome to InsightSerenity'
        },
        verification: {
          subject: '[STAGING] Verify your email address'
        },
        passwordReset: {
          subject: '[STAGING] Reset your password'
        }
      }
    };

    // Payment configuration overrides
    this.payment = {
      provider: 'stripe',
      providers: {
        stripe: {
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY_TEST,
          secretKey: process.env.STRIPE_SECRET_KEY_TEST,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_TEST,
          statementDescriptor: 'INSIGHT-STG'
        },
        paypal: {
          mode: 'sandbox',
          clientId: process.env.PAYPAL_CLIENT_ID_SANDBOX,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET_SANDBOX,
          apiUrl: 'https://api.sandbox.paypal.com'
        },
        square: {
          environment: 'sandbox',
          accessToken: process.env.SQUARE_ACCESS_TOKEN_SANDBOX,
          applicationId: process.env.SQUARE_APPLICATION_ID_SANDBOX
        }
      },
      security: {
        testCardsAllowed: true,
        fraudDetection: true,
        threeDSecure: true
      },
      webhooks: {
        enabled: true,
        endpoint: '/webhooks/staging/payment'
      },
      subscriptions: {
        trialPeriodDays: 7 // Shorter trial in staging
      }
    };

    // Swagger configuration overrides
    this.swagger = {
      enabled: true,
      servers: {
        staging: {
          url: 'https://staging-api.insightserenity.com',
          description: 'Staging API server'
        }
      },
      ui: {
        tryItOut: true
      },
      options: {
        enableMocking: false
      },
      access: {
        requireAuth: true,
        username: process.env.SWAGGER_USERNAME || 'staging',
        password: process.env.SWAGGER_PASSWORD
      }
    };

    // Initialize configuration
    this._initialized = false;
    this._configCache = new Map();
  }

  /**
   * Initialize the configuration
   * @returns {StagingConfig} The configuration instance
   */
  initialize() {
    if (this._initialized) {
      return this;
    }

    // Perform any async initialization here if needed
    this.validate();
    this._initialized = true;
    return this;
  }

  /**
   * Get a configuration setting using dot notation
   * @param {string} key - The configuration key (e.g., 'database.uri')
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} The configuration value
   */
  getSetting(key, defaultValue = undefined) {
    // Check cache first
    if (this._configCache.has(key)) {
      return this._configCache.get(key);
    }

    const value = key.split('.').reduce((obj, k) => obj?.[k], this);
    
    // Cache the result
    if (value !== undefined) {
      this._configCache.set(key, value);
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get a service URL with optional path
   * @param {string} service - The service name (api, admin, services, client)
   * @param {string} path - Optional path to append
   * @returns {string} The complete service URL
   */
  getServiceUrl(service, path = '') {
    const baseUrl = this.environment.urls[service];
    if (!baseUrl) {
      throw new Error(`Unknown service: ${service}`);
    }
    return path ? `${baseUrl}${path.startsWith('/') ? path : '/' + path}` : baseUrl;
  }

  /**
   * Get a feature flag value
   * @param {string} flag - The feature flag name
   * @param {boolean} defaultValue - Default value if flag not found
   * @returns {boolean} The feature flag value
   */
  getFeatureFlag(flag, defaultValue = false) {
    const envKey = `FEATURE_${flag.toUpperCase().replace(/\./g, '_')}`;
    const envValue = process.env[envKey];
    
    if (envValue !== undefined) {
      return envValue === 'true' || envValue === '1';
    }

    // Check in configuration
    const configValue = this.getSetting(`features.${flag}`);
    return configValue !== undefined ? configValue : defaultValue;
  }

  /**
   * Check if a feature is enabled
   * @param {string} path - The feature path (e.g., 'experimental.aiAssistant')
   * @returns {boolean} Whether the feature is enabled
   */
  isFeatureEnabled(path) {
    const value = path.split('.').reduce((obj, k) => {
      // Check both base.features and environment.features
      return obj?.features?.[k] || obj?.[k];
    }, { features: { ...this.base.features, ...this.environment.features } });
    
    return value === true;
  }

  /**
   * Get database connection string for a specific database
   * @param {string} dbName - The database name (admin, shared, tenant)
   * @returns {string} The database connection string
   */
  getDatabaseUri(dbName = 'shared') {
    const baseUri = this.database.uri?.replace(/\/[^/]*$/, '');
    const database = this.database.databases[dbName] || dbName;
    return `${baseUri}/${database}`;
  }

  /**
   * Get Redis connection options
   * @returns {Object} Redis connection options
   */
  getRedisOptions() {
    const options = {
      host: this.redis.host,
      port: this.redis.port,
      password: this.redis.password,
      db: this.redis.database,
      connectionName: this.redis.connectionName,
      ...(this.redis.tls.enabled && { 
        tls: {
          rejectUnauthorized: this.redis.tls.rejectUnauthorized
        }
      })
    };

    // Add sentinel configuration if enabled
    if (this.redis.sentinel.enabled) {
      return {
        sentinels: this.redis.sentinel.sentinels,
        name: this.redis.sentinel.name,
        password: this.redis.password,
        sentinelPassword: this.redis.sentinel.password,
        ...options
      };
    }

    return options;
  }

  /**
   * Get email provider configuration
   * @returns {Object} Email provider configuration
   */
  getEmailConfig() {
    const provider = this.email.provider;
    return {
      provider,
      ...this.email.providers[provider],
      from: this.email.from,
      development: this.email.development,
      bounceHandling: this.email.bounceHandling,
      tracking: this.email.tracking,
      emailTypes: this.email.emailTypes
    };
  }

  /**
   * Get payment provider configuration
   * @returns {Object} Payment provider configuration
   */
  getPaymentConfig() {
    const provider = this.payment.provider;
    return {
      provider,
      ...this.payment.providers[provider],
      security: this.payment.security,
      webhooks: this.payment.webhooks,
      subscriptions: this.payment.subscriptions
    };
  }

  /**
   * Get monitoring configuration
   * @returns {Object} Monitoring configuration
   */
  getMonitoringConfig() {
    return {
      ...this.environment.monitoring,
      database: {
        logSlowQueries: this.database.monitoring.logSlowQueries,
        slowQueryThreshold: this.database.performance.slowQueryThreshold
      },
      redis: {
        enabled: this.redis.monitoring.enabled,
        metricsInterval: this.redis.monitoring.metricsInterval
      }
    };
  }

  /**
   * Get whitelist IPs for staging environment
   * @returns {Array<string>} Array of whitelisted IP addresses/ranges
   */
  getWhitelistedIPs() {
    const envIPs = process.env.STAGING_WHITELIST_IPS?.split(',').map(ip => ip.trim()) || [];
    return [...this.security.ipSecurity.whitelist, ...envIPs];
  }

  /**
   * Check if experimental features are enabled
   * @returns {Object} Experimental features status
   */
  getExperimentalFeatures() {
    return {
      ...this.base.features.experimental,
      enabled: Object.values(this.base.features.experimental).some(v => v === true)
    };
  }

  /**
   * Get environment information
   * @returns {Object} Environment information summary
   */
  getInfo() {
    return {
      name: this.environment.name,
      environment: this.environment.name,
      urls: this.environment.urls,
      debug: this.environment.debug,
      features: {
        experimental: Object.entries(this.base.features.experimental)
          .filter(([_, v]) => v === true)
          .map(([k]) => k),
        enabled: Object.entries(this.environment.features)
          .filter(([_, v]) => v === true)
          .map(([k]) => k)
      },
      database: {
        uri: this.database.uri ? '***HIDDEN***' : 'Not configured',
        databases: Object.keys(this.database.databases),
        backup: this.database.backup.enabled
      },
      redis: {
        host: this.redis.host ? '***HIDDEN***' : 'Not configured',
        sentinel: this.redis.sentinel.enabled,
        tls: this.redis.tls.enabled
      },
      email: {
        provider: this.email.provider,
        sandboxMode: this.email.providers[this.email.provider]?.sandboxMode,
        interceptAll: this.email.development.interceptAll
      },
      payment: {
        provider: this.payment.provider,
        testMode: true,
        testCardsAllowed: this.payment.security.testCardsAllowed
      },
      monitoring: {
        prometheus: this.environment.monitoring.prometheus.enabled,
        grafana: this.environment.monitoring.grafana.enabled,
        sentry: this.environment.thirdParty.sentry.enabled
      },
      security: {
        ipWhitelist: this.security.ipSecurity.enableWhitelist,
        csrf: this.security.csrf.enabled,
        tls: true
      }
    };
  }

  /**
   * Validate the configuration
   * @throws {Error} If configuration is invalid
   * @returns {boolean} True if valid
   */
  validate() {
    const errors = [];
    const warnings = [];
    
    // Check required staging environment variables
    const requiredEnvVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'SESSION_SECRET',
      'SENDGRID_API_KEY',
      'STRIPE_SECRET_KEY_TEST',
      'STRIPE_PUBLISHABLE_KEY_TEST'
    ];
    
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate URLs
    Object.entries(this.environment.urls).forEach(([service, url]) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          errors.push(`Staging ${service} URL must use HTTPS: ${url}`);
        }
        if (!url.includes('staging')) {
          warnings.push(`Staging ${service} URL should include 'staging' in the domain: ${url}`);
        }
      } catch (error) {
        errors.push(`Invalid ${service} URL: ${url}`);
      }
    });

    // Validate database configuration
    if (this.database.uri) {
      if (this.database.uri.includes('production')) {
        errors.push('Staging database URI should not reference production');
      }
      if (!this.database.uri.includes('staging')) {
        warnings.push('Staging database URI should include "staging" identifier');
      }
    }

    // Validate encryption key
    if (!this.security.encryption.key || this.security.encryption.key.length !== 32) {
      errors.push('Encryption key must be exactly 32 characters');
    }

    // Validate secrets are not defaults
    const invalidSecrets = [];
    if (this.security.jwt.secret?.includes('dev_') || this.security.jwt.secret?.includes('change_')) {
      invalidSecrets.push('JWT secret');
    }
    if (this.security.session.secret?.includes('dev_') || this.security.session.secret?.includes('change_')) {
      invalidSecrets.push('Session secret');
    }
    
    if (invalidSecrets.length > 0) {
      errors.push(`Staging secrets must not use development defaults: ${invalidSecrets.join(', ')}`);
    }

    // Validate security settings
    if (!this.security.csrf.enabled) {
      warnings.push('CSRF protection should be enabled in staging');
    }
    if (!this.security.headers.contentSecurityPolicy.enabled) {
      warnings.push('Content Security Policy should be enabled in staging');
    }
    if (!this.database.security.tls) {
      warnings.push('Database TLS should be enabled in staging');
    }

    // Validate email configuration
    if (this.email.provider === 'sendgrid' && !this.email.providers.sendgrid.sandboxMode) {
      warnings.push('SendGrid sandbox mode should be enabled in staging');
    }
    if (!this.email.development.interceptAll) {
      warnings.push('Email interception should be enabled in staging to prevent accidental sends');
    }

    // Validate payment configuration
    if (this.payment.providers.stripe?.secretKey?.includes('sk_live')) {
      errors.push('Staging should not use live Stripe keys');
    }
    if (this.payment.providers.paypal?.mode !== 'sandbox') {
      errors.push('PayPal must be in sandbox mode for staging');
    }

    // Validate monitoring
    if (!this.environment.monitoring.prometheus.enabled) {
      warnings.push('Prometheus monitoring should be enabled in staging');
    }

    // Log warnings
    warnings.forEach(warning => {
      console.warn(`Staging configuration warning: ${warning}`);
    });

    if (errors.length > 0) {
      throw new Error('Staging configuration validation failed:\n' + errors.join('\n'));
    }

    return true;
  }

  /**
   * Export configuration as plain object (for compatibility)
   * @returns {Object} Configuration object
   */
  toObject() {
    return {
      environment: this.environment,
      base: this.base,
      database: this.database,
      security: this.security,
      redis: this.redis,
      email: this.email,
      payment: this.payment,
      swagger: this.swagger
    };
  }
}

// Export singleton instance
module.exports = new StagingConfig();