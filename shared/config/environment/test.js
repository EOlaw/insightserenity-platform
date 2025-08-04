'use strict';

/**
 * @fileoverview Test environment configuration overrides using class-based architecture
 * @module shared/config/environment/test
 */

/**
 * Test environment configuration class
 * @class TestConfig
 */
class TestConfig {
  constructor() {
    // Environment metadata
    this.environment = {
      name: 'test',
      isDevelopment: false,
      isStaging: false,
      isProduction: false,
      isTest: true,
      debug: false,
      verbose: false,
      urls: {
        api: 'http://localhost:3100',
        admin: 'http://localhost:3101',
        services: 'http://localhost:3102',
        client: 'http://localhost:4200'
      },
      features: {
        hotReload: false,
        sourceMap: true, // Enable for better error traces
        errorStack: true,
        detailedErrors: true,
        mockData: true,
        seedData: true
      },
      testing: {
        parallel: true,
        coverage: true,
        timeout: 30000, // 30 seconds default timeout
        retries: 0,
        bail: false,
        verbose: false,
        silent: true,
        randomize: true,
        seed: process.env.TEST_SEED || Date.now(),
        cleanup: {
          afterEach: true,
          afterAll: true,
          databases: true,
          files: true,
          redis: true
        }
      },
      thirdParty: {
        googleAnalytics: {
          enabled: false
        },
        sentry: {
          enabled: false
        },
        intercom: {
          enabled: false
        }
      },
      mocks: {
        externalApis: true,
        fileSystem: true,
        dateTime: true,
        randomData: true
      },
      fixtures: {
        users: 10,
        organizations: 5,
        tenants: 3,
        projects: 20,
        jobs: 15,
        candidates: 50
      }
    };

    // Base configuration overrides
    this.base = {
      app: {
        environment: 'test',
        debug: false,
        timezone: 'UTC',
        locale: 'en-US'
      },
      server: {
        adminPort: 3101,
        servicesPort: 3102,
        gatewayPort: 3100,
        host: 'localhost',
        protocol: 'http',
        trustProxy: false,
        requestTimeout: 5000, // Shorter timeout for tests
        shutdownTimeout: 1000
      },
      api: {
        rateLimiting: {
          enabled: false // Disable rate limiting in tests
        },
        responseTimeout: 5000,
        pagination: {
          defaultLimit: 10,
          maxLimit: 50
        }
      },
      cors: {
        enabled: false // Disable CORS for tests
      },
      logging: {
        level: 'error', // Only log errors during tests
        format: 'json',
        colorize: false,
        prettyPrint: false,
        logRequests: false,
        logResponses: false
      },
      features: {
        authentication: {
          localAuth: true,
          oauth: false,
          passkeys: false,
          twoFactor: false,
          sso: false
        },
        modules: {
          consulting: true,
          recruitment: true,
          whiteLabel: true,
          analytics: true,
          api: true
        },
        experimental: {
          aiAssistant: false,
          advancedAnalytics: false,
          blockchain: false
        }
      },
      performance: {
        enableClustering: false, // Single process for tests
        workers: 1,
        enableGracefulShutdown: false
      },
      uploads: {
        enabled: true,
        provider: 'local',
        localPath: './test-uploads',
        maxFileSize: 1048576 // 1MB for tests
      }
    };

    // Database configuration overrides
    this.database = {
      uri: process.env.TEST_MONGODB_URI || 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/Insightserenity_dev?retryWrites=true&w=majority',
      options: {
        maxPoolSize: 5,
        minPoolSize: 1,
        socketTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        retryWrites: false, // Disable for faster tests
        w: 1,
        wtimeoutMS: 1000,
        journal: false // Disable journaling for speed
      },
      databases: {
        admin: 'insightserenity_test_admin',
        shared: 'insightserenity_test_shared',
        tenantPrefix: 'test_tenant_',
        audit: 'insightserenity_test_audit',
        analytics: 'insightserenity_test_analytics'
      },
      multiTenant: {
        strategy: 'collection', // Use collection separation for easier cleanup
        connectionPoolPerTenant: false,
        maxConnectionsPerTenant: 2
      },
      validation: {
        enabled: true,
        level: 'moderate',
        action: 'warn'
      },
      indexes: {
        autoCreate: true,
        background: false // Foreground for immediate availability
      },
      migrations: {
        enabled: false, // Disable migrations in tests
        autoRun: false
      },
      backup: {
        enabled: false // No backups needed for tests
      },
      performance: {
        enableProfiling: false,
        enableQueryCache: false,
        enableAggregationCache: false
      },
      monitoring: {
        enabled: false
      },
      security: {
        authEnabled: false, // No auth for test MongoDB
        tls: false
      },
      transactions: {
        enabled: true, // Enable for testing transactional logic
        maxCommitTime: 1000,
        retryLimit: 1,
        timeout: 5000
      }
    };

    // Security configuration overrides
    this.security = {
      jwt: {
        secret: 'test_jwt_secret_not_for_production',
        refreshSecret: 'test_refresh_secret_not_for_production',
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '1d',
        clockTolerance: 300 // 5 minutes for test timing issues
      },
      encryption: {
        key: 'test_encryption_key_32_chars_ok!',
        saltRounds: 4, // Fast hashing for tests
        passwordMinLength: 6, // Relaxed for test accounts
        passwordRequireUppercase: false,
        passwordRequireLowercase: false,
        passwordRequireNumbers: false,
        passwordRequireSpecial: false,
        passwordHistory: 0,
        passwordExpiryDays: 0
      },
      session: {
        secret: 'test_session_secret_not_for_production',
        name: 'test_session',
        cookie: {
          secure: false,
          httpOnly: true,
          maxAge: 3600000, // 1 hour
          sameSite: 'lax'
        },
        store: {
          type: 'memory' // Use memory store for tests
        }
      },
      authentication: {
        maxLoginAttempts: 100, // High limit for tests
        lockoutDuration: 1, // 1 minute
        requireEmailVerification: false,
        multiFactorRequired: false
      },
      twoFactor: {
        enabled: false
      },
      csrf: {
        enabled: false // Disable CSRF for easier testing
      },
      headers: {
        contentSecurityPolicy: {
          enabled: false
        },
        strictTransportSecurity: {
          enabled: false
        }
      },
      ipSecurity: {
        enableWhitelist: false,
        enableBlacklist: false
      },
      rateLimit: {
        global: {
          enabled: false
        },
        login: {
          enabled: false
        },
        api: {
          enabled: false
        }
      },
      audit: {
        enabled: false, // Disable audit logging in tests
        encryptLogs: false
      },
      features: {
        preventBruteForce: false,
        detectAnomalies: false,
        enforcePasswordPolicy: false,
        requireSecureContext: false,
        enableSecurityMonitoring: false,
        blockSuspiciousIPs: false,
        enableHoneypot: false
      }
    };

    // Redis configuration overrides
    this.redis = {
      enabled: true,
      host: process.env.TEST_REDIS_HOST || 'localhost',
      port: process.env.TEST_REDIS_PORT || 6380, // Different port for test Redis
      password: '',
      database: 15, // Use highest DB index for tests
      connectionName: 'InsightSerenity-Test',
      pool: {
        min: 1,
        max: 3
      },
      retry: {
        attempts: 3,
        delay: 100
      },
      tls: {
        enabled: false
      },
      cache: {
        prefix: 'test:cache:',
        ttl: 60, // 1 minute TTL for tests
        maxKeys: 1000
      },
      session: {
        prefix: 'test:sess:',
        ttl: 3600 // 1 hour
      },
      queue: {
        prefix: 'test:queue:',
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
          attempts: 1
        }
      },
      monitoring: {
        enabled: false
      },
      persistence: {
        aof: {
          enabled: false
        },
        rdb: {
          enabled: false
        }
      },
      security: {
        requirePass: false
      }
    };

    // Email configuration overrides
    this.email = {
      enabled: true,
      provider: 'test', // Special test provider
      from: {
        name: 'Test InsightSerenity',
        address: 'test@localhost',
        replyTo: 'test-reply@localhost'
      },
      providers: {
        test: {
          // Mock email provider for tests
          captureEmails: true,
          failureRate: 0 // Set > 0 to simulate failures
        },
        smtp: {
          host: 'localhost',
          port: 1025,
          secure: false,
          auth: {
            user: '',
            pass: ''
          }
        }
      },
      templates: {
        cache: false // Disable template caching for tests
      },
      queue: {
        enabled: false // Process emails synchronously in tests
      },
      rateLimit: {
        enabled: false
      },
      bounceHandling: {
        enabled: false
      },
      tracking: {
        enabled: false
      },
      validation: {
        enabled: true,
        checkMx: false,
        checkDisposable: false,
        validateOnSignup: true
      },
      development: {
        interceptAll: true,
        interceptAddress: 'test@localhost',
        logToConsole: false,
        saveToFile: true,
        fileDirectory: './test-email-logs'
      }
    };

    // Payment configuration overrides
    this.payment = {
      enabled: true,
      provider: 'test', // Special test provider
      currency: 'USD',
      providers: {
        test: {
          // Mock payment provider for tests
          alwaysSucceed: true,
          simulateWebhooks: true,
          delayMs: 0
        },
        stripe: {
          publishableKey: 'pk_test_mock',
          secretKey: 'sk_test_mock',
          webhookSecret: 'whsec_test_mock'
        }
      },
      subscriptions: {
        enabled: true,
        trialPeriodDays: 1,
        gracePeriodDays: 1
      },
      security: {
        testCardsAllowed: true,
        fraudDetection: false,
        threeDSecure: false,
        requireBillingAddress: false
      },
      webhooks: {
        enabled: false // Handle webhooks synchronously in tests
      },
      refunds: {
        enabled: true,
        autoApprove: true, // Auto-approve refunds in tests
        maxDays: 365
      },
      retry: {
        enabled: false // No retries in tests
      }
    };

    // Swagger configuration overrides
    this.swagger = {
      enabled: false, // Disable Swagger in tests
      access: {
        requireAuth: false
      }
    };

    // Initialize configuration
    this._initialized = false;
    this._configCache = new Map();
    this._emailCapture = [];
    this._paymentCapture = [];
  }

  /**
   * Initialize the configuration
   * @returns {TestConfig} The configuration instance
   */
  initialize() {
    if (this._initialized) {
      return this;
    }

    // Clear any previous test data
    this.clearTestData();
    
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
    const envKey = `TEST_FEATURE_${flag.toUpperCase().replace(/\./g, '_')}`;
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
    const baseUri = this.database.uri.replace(/\/[^/]*$/, '');
    const database = this.database.databases[dbName] || dbName;
    return `${baseUri}/${database}`;
  }

  /**
   * Get Redis connection options
   * @returns {Object} Redis connection options
   */
  getRedisOptions() {
    return {
      host: this.redis.host,
      port: this.redis.port,
      password: this.redis.password,
      db: this.redis.database,
      connectionName: this.redis.connectionName,
      keyPrefix: 'test:',
      lazyConnect: true // For better test control
    };
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
      captureEmails: true // Always capture in tests
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
      capturePayments: true // Always capture in tests
    };
  }

  /**
   * Get test-specific configuration
   * @returns {Object} Test configuration
   */
  getTestConfig() {
    return {
      ...this.environment.testing,
      databases: Object.keys(this.database.databases),
      redisDatabase: this.redis.database,
      fixtures: this.environment.fixtures,
      mocks: this.environment.mocks
    };
  }

  /**
   * Get fixture configuration
   * @param {string} type - The fixture type
   * @returns {number} The number of fixtures to create
   */
  getFixtureCount(type) {
    return this.environment.fixtures[type] || 10;
  }

  /**
   * Check if mocking is enabled for a specific type
   * @param {string} type - The mock type
   * @returns {boolean} Whether mocking is enabled
   */
  isMockEnabled(type) {
    return this.environment.mocks[type] === true;
  }

  /**
   * Get cleanup configuration
   * @returns {Object} Cleanup configuration
   */
  getCleanupConfig() {
    return this.environment.testing.cleanup;
  }

  /**
   * Clear test data and caches
   * @returns {void}
   */
  clearTestData() {
    this._configCache.clear();
    this._emailCapture = [];
    this._paymentCapture = [];
  }

  /**
   * Capture an email (for test assertions)
   * @param {Object} email - The email object
   * @returns {void}
   */
  captureEmail(email) {
    this._emailCapture.push({
      ...email,
      timestamp: new Date()
    });
  }

  /**
   * Get captured emails
   * @param {Object} filter - Optional filter criteria
   * @returns {Array} Captured emails
   */
  getCapturedEmails(filter = {}) {
    if (Object.keys(filter).length === 0) {
      return this._emailCapture;
    }
    
    return this._emailCapture.filter(email => {
      return Object.entries(filter).every(([key, value]) => {
        if (key === 'to') {
          return email.to === value || (Array.isArray(email.to) && email.to.includes(value));
        }
        return email[key] === value;
      });
    });
  }

  /**
   * Capture a payment (for test assertions)
   * @param {Object} payment - The payment object
   * @returns {void}
   */
  capturePayment(payment) {
    this._paymentCapture.push({
      ...payment,
      timestamp: new Date()
    });
  }

  /**
   * Get captured payments
   * @param {Object} filter - Optional filter criteria
   * @returns {Array} Captured payments
   */
  getCapturedPayments(filter = {}) {
    if (Object.keys(filter).length === 0) {
      return this._paymentCapture;
    }
    
    return this._paymentCapture.filter(payment => {
      return Object.entries(filter).every(([key, value]) => payment[key] === value);
    });
  }

  /**
   * Set a temporary configuration override (for specific tests)
   * @param {string} key - The configuration key
   * @param {*} value - The value to set
   * @returns {void}
   */
  setOverride(key, value) {
    const keys = key.split('.');
    let obj = this;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    
    obj[keys[keys.length - 1]] = value;
    
    // Clear cache for this key
    this._configCache.delete(key);
  }

  /**
   * Reset all overrides
   * @returns {void}
   */
  resetOverrides() {
    // Re-initialize the configuration
    Object.assign(this, new TestConfig());
    this._initialized = true;
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
        testing: Object.entries(this.environment.testing)
          .filter(([k, v]) => v === true && typeof v === 'boolean')
          .map(([k]) => k),
        mocks: Object.entries(this.environment.mocks)
          .filter(([_, v]) => v === true)
          .map(([k]) => k)
      },
      database: {
        uri: this.database.uri,
        databases: Object.keys(this.database.databases),
        strategy: this.database.multiTenant.strategy
      },
      redis: {
        host: this.redis.host,
        port: this.redis.port,
        database: this.redis.database
      },
      email: {
        provider: this.email.provider,
        interceptAll: this.email.development.interceptAll,
        captureEnabled: true
      },
      payment: {
        provider: this.payment.provider,
        testMode: true,
        captureEnabled: true
      },
      fixtures: this.environment.fixtures,
      cleanup: this.environment.testing.cleanup
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
    
    // Validate test environment specifics
    if (this.base.server.adminPort === this.base.server.servicesPort ||
        this.base.server.adminPort === this.base.server.gatewayPort ||
        this.base.server.servicesPort === this.base.server.gatewayPort) {
      errors.push('Test server ports must be different');
    }

    // Validate database configuration
    if (!this.database.uri) {
      errors.push('Test database URI is required');
    } else if (this.database.uri.includes('production') || 
               this.database.uri.includes('staging')) {
      errors.push('Test database should not reference production or staging');
    }

    // Ensure test databases have proper naming
    Object.entries(this.database.databases).forEach(([key, dbName]) => {
      if (!dbName.includes('test')) {
        warnings.push(`Test database "${key}" should include "test" in the name: ${dbName}`);
      }
    });

    // Validate Redis configuration
    if (this.redis.database !== 15) {
      warnings.push('Test Redis should use database 15 to avoid conflicts');
    }

    // Validate security settings for tests
    if (this.security.csrf.enabled) {
      warnings.push('CSRF should be disabled for easier testing');
    }
    if (this.security.rateLimit.global.enabled) {
      warnings.push('Rate limiting should be disabled for tests');
    }

    // Validate email configuration
    if (this.email.provider !== 'test' && this.email.provider !== 'smtp') {
      warnings.push('Test environment should use "test" or local SMTP provider');
    }
    if (!this.email.development.interceptAll) {
      errors.push('Email interception must be enabled in tests');
    }

    // Validate payment configuration
    if (this.payment.provider !== 'test') {
      warnings.push('Test environment should use "test" payment provider');
    }
    if (!this.payment.security.testCardsAllowed) {
      errors.push('Test cards must be allowed in test environment');
    }

    // Ensure external services are disabled
    if (this.environment.thirdParty.googleAnalytics.enabled ||
        this.environment.thirdParty.sentry.enabled ||
        this.environment.thirdParty.intercom.enabled) {
      errors.push('External third-party services must be disabled in tests');
    }

    // Validate test-specific settings
    if (!this.environment.mocks.externalApis) {
      warnings.push('External API mocking should be enabled for reliable tests');
    }

    // Validate encryption key (even for tests)
    if (this.security.encryption.key.length !== 32) {
      errors.push('Encryption key must be exactly 32 characters even in tests');
    }

    // Check for production secrets in test
    if (this.security.jwt.secret.includes('prod') ||
        this.security.session.secret.includes('prod')) {
      errors.push('Test environment should not use production secrets');
    }

    // Log warnings
    warnings.forEach(warning => {
      if (!this.environment.testing.silent) {
        console.warn(`Test configuration warning: ${warning}`);
      }
    });

    if (errors.length > 0) {
      throw new Error('Test configuration validation failed:\n' + errors.join('\n'));
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
module.exports = new TestConfig();