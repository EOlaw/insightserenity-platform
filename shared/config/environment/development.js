'use strict';

/**
 * @fileoverview Development environment configuration overrides using class-based architecture
 * @module shared/config/environment/development
 */

/**
 * Development environment configuration class
 * @class DevelopmentConfig
 */
class DevelopmentConfig {
  constructor() {
    // Environment metadata
    this.environment = {
      name: 'development',
      isDevelopment: true,
      isStaging: false,
      isProduction: false,
      isTest: false,
      debug: true,
      verbose: true,
      urls: {
        api: 'http://localhost:3000',
        admin: 'http://localhost:3001',
        services: 'http://localhost:3002',
        client: 'http://localhost:4200'
      },
      features: {
        hotReload: true,
        sourceMap: true,
        errorStack: true,
        detailedErrors: true,
        mockData: true,
        seedData: true
      },
      thirdParty: {
        googleAnalytics: { enabled: false },
        sentry: { enabled: false },
        intercom: { enabled: false }
      }
    };

    // Base configuration overrides
    this.base = {
      app: {
        environment: 'development',
        debug: true
      },
      server: {
        protocol: 'http',
        trustProxy: false
      },
      api: {
        rateLimiting: {
          enabled: false, // Disable rate limiting in development
          windowMs: 900000,
          maxRequests: 1000 // Higher limit for development
        }
      },
      cors: {
        origins: [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:4200',
          'http://localhost:4201',
          'http://localhost:8080',
          'http://localhost:8081',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:4200'
        ]
      },
      logging: {
        level: 'debug',
        format: 'pretty',
        colorize: true,
        prettyPrint: true,
        logRequests: true,
        logResponses: true
      },
      features: {
        experimental: {
          aiAssistant: true,
          advancedAnalytics: true,
          blockchain: false
        }
      },
      performance: {
        enableClustering: false, // Disable clustering for easier debugging
        workers: 1
      }
    };

    // Authentication configuration overrides for development
    this.auth = {
      // Core authentication settings optimized for development
      core: {
        sessionDuration: 3600000, // 1 hour for easier testing
        refreshTokenDuration: 86400000, // 24 hours 
        allowMultipleSessions: true,
        maxConcurrentSessions: 10, // Higher for testing multiple browsers
        maxLoginAttempts: 10, // More lenient for development
        lockoutDuration: 300000, // 5 minutes instead of 15
        requireEmailVerification: false, // Skip for faster development
        passwordResetTokenDuration: 7200000, // 2 hours for testing
        verificationTokenDuration: 172800000, // 48 hours for testing
        appUrl: 'http://localhost:4200',
        apiUrl: 'http://localhost:3000'
      },

      // Enterprise features disabled for simpler development
      enterprise: {
        enableRiskAssessment: false,
        enableAdvancedMFA: false,
        enableDeviceManagement: false,
        enableSecurityAlerts: false,
        enableAdvancedAudit: false,
        enableSSO: false,
        enableSAML: false,
        enableOIDC: false,
        enableOAuth: true, // Keep OAuth for testing
        oauthProviders: ['google'], // Limit to one provider for simplicity
        enableSessionAnalytics: false,
        enableGeolocationTracking: false,
        enableDeviceFingerprinting: false
      },

      // Feature flags for development
      features: {
        registration: true,
        passwordReset: true,
        emailVerification: false, // Disabled for faster development
        basicMFA: true,
        riskAssessment: false,
        advancedMFA: false,
        oauth: true,
        sso: false,
        deviceTrust: false,
        securityAnalytics: false,
        complianceReporting: false,
        biometric: false,
        webauthn: false,
        faceId: false,
        touchId: false
      },

      // Relaxed password policy for development
      passwordPolicy: {
        minLength: 6, // Shorter for easier testing
        maxLength: 128,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecial: false,
        preventReuse: 2, // Fewer restrictions
        expiryDays: 0, // Never expires in development
        complexityChecking: false,
        dictionaryCheck: false,
        compromisedCheck: false
      },

      // MFA configuration for development
      mfa: {
        require2FA: false, // Optional in development
        defaultMethod: 'totp',
        codeExpiry: 600000, // 10 minutes for easier testing
        maxAttempts: 5,
        availableMethods: {
          totp: true,
          sms: false, // Disable to avoid SMS costs
          email: true,
          push: false,
          webauthn: false,
          backup_codes: true
        },
        totp: {
          issuer: 'InsightSerenity Dev',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          window: 3 // More lenient window
        },
        backupCodes: {
          count: 5, // Fewer codes for testing
          length: 6, // Shorter codes
          regenerateThreshold: 2
        },
        deviceTrust: {
          enabled: false,
          duration: 86400000, // 1 day
          maxDevices: 5
        }
      },

      // OAuth providers for development
      oauth: {
        google: {
          enabled: true,
          clientId: process.env.GOOGLE_CLIENT_ID || 'dev_google_client_id',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dev_google_client_secret',
          redirectUri: 'http://localhost:4200/auth/google/callback',
          scope: 'openid email profile',
          allowRegistration: true,
          allowLinking: true
        },
        github: {
          enabled: false, // Disabled to simplify development
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          redirectUri: 'http://localhost:4200/auth/github/callback',
          scope: 'user:email',
          allowRegistration: true,
          allowLinking: true
        },
        linkedin: {
          enabled: false,
          clientId: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          redirectUri: 'http://localhost:4200/auth/linkedin/callback',
          scope: 'r_liteprofile r_emailaddress',
          allowRegistration: true,
          allowLinking: true
        },
        microsoft: {
          enabled: false,
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          redirectUri: 'http://localhost:4200/auth/microsoft/callback',
          scope: 'openid email profile',
          allowRegistration: true,
          allowLinking: true
        }
      },

      // SSO configuration (disabled for development)
      sso: {
        saml: {
          enabled: false,
          entityId: '',
          ssoUrl: '',
          sloUrl: '',
          certificate: '',
          privateKey: '',
          allowProvisioning: false,
          roleMapping: false,
          attributeMapping: {}
        },
        oidc: {
          enabled: false,
          issuer: '',
          clientId: '',
          clientSecret: '',
          redirectUri: '',
          allowProvisioning: false,
          roleMapping: false
        }
      },

      // Registration settings for development
      registration: {
        enabled: true,
        requireInvitation: false,
        allowPublicRegistration: true,
        defaultRole: 'user',
        autoActivate: true, // Skip activation step
        domainWhitelist: [],
        domainBlacklist: [],
        requireOrganization: false
      },

      // Security settings for development
      security: {
        ipWhitelist: [],
        ipBlacklist: [],
        enableRateLimiting: false, // Disabled for development
        rateLimitWindow: 900000,
        rateLimitMaxAttempts: 1000, // Very high limit
        enableAuditLog: true, // Keep for debugging
        auditRetentionDays: 30, // Shorter retention
        riskThresholds: {
          low: 30, // Higher thresholds for development
          medium: 50,
          high: 70,
          critical: 90
        },
        enableSecurityHeaders: false, // Disabled for easier development
        enableCSRF: false, // Disabled for API testing
        enableCORS: true,
        encryptionAlgorithm: 'aes-256-gcm',
        hashingAlgorithm: 'bcrypt', // Faster than argon2id
        saltRounds: 10 // Lower for faster hashing
      },

      // Biometric configuration (disabled for development)
      biometric: {
        enabled: false,
        timeout: 60000,
        allowFallback: true,
        requireLiveness: false,
        webauthn: {
          enabled: false,
          rpName: 'InsightSerenity Dev',
          rpId: 'localhost',
          timeout: 60000,
          attestation: 'none', // Simplified for development
          userVerification: 'discouraged',
          authenticatorAttachment: 'cross-platform'
        }
      },

      // Notification settings for development
      notifications: {
        email: {
          welcomeEmail: true,
          verificationEmail: false, // Disabled since verification is off
          passwordResetEmail: true,
          securityAlerts: false,
          mfaAlerts: false,
          loginAlerts: false
        },
        push: {
          enabled: false,
          securityAlerts: false,
          mfaRequests: false
        },
        sms: {
          enabled: false,
          provider: 'console', // Log to console instead
          mfaCodes: false,
          securityAlerts: false
        }
      },

      // Compliance settings (disabled for development)
      compliance: {
        gdpr: {
          enabled: false,
          dataRetentionDays: 30,
          rightToErasure: false,
          dataPortability: false,
          consentTracking: false
        },
        hipaa: {
          enabled: false,
          auditLogging: false,
          accessControls: false,
          dataEncryption: false
        },
        sox: {
          enabled: false,
          auditTrails: false,
          accessReviews: false,
          controlTesting: false
        }
      },

      // API integration settings for development
      integrations: {
        threatIntelligence: {
          enabled: false,
          provider: 'mock',
          apiKey: '',
          checkInterval: 86400000
        },
        geoip: {
          enabled: false,
          provider: 'mock',
          apiKey: '',
          databasePath: ''
        },
        ldap: {
          enabled: false,
          server: '',
          bindDN: '',
          bindPassword: '',
          baseDN: '',
          userFilter: '(uid={{username}})',
          allowProvisioning: false
        }
      }
    };

    // Database configuration overrides
    this.database = {
      uri: process.env.DB_URI || process.env.MONGODB_URI || 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net?retryWrites=true&w=majority',
      options: {
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        w: 1, // Faster writes in development
        wtimeoutMS: 1000,
        journal: true
      },
      databases: {
        admin: 'insightserenity_dev_admin',
        shared: 'insightserenity_dev_shared',
        tenantPrefix: 'dev_tenant_',
        audit: 'insightserenity_dev_audit',
        analytics: 'insightserenity_dev_analytics'
      },
      migrations: {
        autoRun: true // Auto-run migrations in development
      },
      backup: {
        enabled: false // Disable backups in development
      },
      performance: {
        enableProfiling: true,
        profilingLevel: 2, // Profile all operations
        slowQueryThreshold: 50 // Lower threshold for development
      },
      monitoring: {
        logSlowQueries: true,
        logQueryPlans: true
      },
      security: {
        authEnabled: false, // No auth for local MongoDB
        tls: false
      }
    };

    // Security configuration overrides
    this.security = {
      jwt: {
        secret: 'dev_jwt_secret_change_in_production',
        refreshSecret: 'dev_refresh_secret_change_in_production',
        accessTokenExpiry: '1h', // Longer tokens in development
        refreshTokenExpiry: '30d'
      },
      encryption: {
        key: 'dev_encryption_key_32_characters!',
        saltRounds: 10 // Faster hashing in development
      },
      session: {
        secret: 'dev_session_secret_change_in_production',
        cookie: {
          secure: false, // Allow non-HTTPS in development
          sameSite: 'lax' // Less strict for development
        }
      },
      authentication: {
        requireEmailVerification: false, // Skip email verification
        multiFactorRequired: false
      },
      csrf: {
        enabled: false // Disable CSRF for easier API testing
      },
      headers: {
        contentSecurityPolicy: {
          enabled: false // Disable CSP for development flexibility
        },
        strictTransportSecurity: {
          enabled: false // No HSTS in development
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
          max: 20 // Higher limit for testing
        }
      },
      audit: {
        encryptLogs: false // Plain text logs for debugging
      }
    };

    // Redis configuration overrides
    this.redis = {
      host: 'localhost',
      port: 6379,
      password: '',
      database: 0,
      tls: {
        enabled: false
      },
      monitoring: {
        logSlowQueries: true,
        slowlogThreshold: 1000 // 1ms for development
      },
      security: {
        requirePass: false
      }
    };

    // Email configuration overrides
    this.email = {
      provider: 'smtp',
      providers: {
        smtp: {
          host: 'localhost',
          port: 1025, // Mailhog default port
          secure: false,
          auth: {
            user: '',
            pass: ''
          }
        }
      },
      development: {
        preview: true,
        interceptAll: true,
        interceptAddress: 'dev@localhost',
        logToConsole: true,
        saveToFile: true,
        fileDirectory: './email-logs/development'
      },
      bounceHandling: {
        enabled: false
      },
      tracking: {
        enabled: false
      }
    };

    // Payment configuration overrides
    this.payment = {
      provider: 'stripe',
      providers: {
        stripe: {
          publishableKey: 'pk_test_development',
          secretKey: 'sk_test_development',
          webhookSecret: 'whsec_development'
        },
        paypal: {
          mode: 'sandbox',
          clientId: 'development_client_id',
          clientSecret: 'development_client_secret'
        },
        square: {
          environment: 'sandbox',
          accessToken: 'development_access_token',
          applicationId: 'sandbox-application-id'
        }
      },
      security: {
        testCardsAllowed: true,
        fraudDetection: false
      },
      webhooks: {
        enabled: false // Disable webhooks in development
      }
    };

    // Swagger configuration overrides
    this.swagger = {
      enabled: true,
      servers: {
        development: {
          url: 'http://localhost:3000',
          description: 'Local development server'
        }
      },
      ui: {
        tryItOut: true
      },
      options: {
        enableMocking: true
      },
      access: {
        requireAuth: false,
        username: 'dev',
        password: 'dev'
      }
    };

    // Initialize configuration
    this._initialized = false;
    this._configCache = new Map();
  }

  /**
   * Initialize the configuration
   * @returns {DevelopmentConfig} The configuration instance
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
   * Check if auth feature is enabled
   * @param {string} feature - The auth feature name
   * @returns {boolean} Whether the auth feature is enabled
   */
  isAuthFeatureEnabled(feature) {
    return this.getSetting(`auth.features.${feature}`, false);
  }

  /**
   * Get auth configuration section
   * @param {string} section - The auth section (core, mfa, oauth, etc.)
   * @returns {Object} Auth section configuration
   */
  getAuthConfig(section = null) {
    if (section) {
      return this.auth[section] || {};
    }
    return this.auth;
  }

  /**
   * Get OAuth provider configuration
   * @param {string} provider - The OAuth provider name
   * @returns {Object} OAuth provider configuration
   */
  getOAuthConfig(provider) {
    return this.auth.oauth[provider] || null;
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
      connectionName: this.redis.connectionName || 'InsightSerenity-Dev',
      ...(this.redis.tls.enabled && { tls: this.redis.tls })
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
      development: this.email.development
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
      security: this.payment.security
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
      features: Object.entries(this.environment.features)
        .filter(([_, v]) => v === true)
        .map(([k]) => k),
      auth: {
        requireEmailVerification: this.auth.core.requireEmailVerification,
        require2FA: this.auth.mfa.require2FA,
        enabledOAuthProviders: Object.keys(this.auth.oauth)
          .filter(provider => this.auth.oauth[provider].enabled),
        enabledFeatures: Object.keys(this.auth.features)
          .filter(feature => this.auth.features[feature])
      },
      database: {
        uri: this.database.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
        databases: Object.keys(this.database.databases)
      },
      redis: {
        host: this.redis.host,
        port: this.redis.port,
        enabled: true
      },
      email: {
        provider: this.email.provider,
        interceptAll: this.email.development.interceptAll
      },
      payment: {
        provider: this.payment.provider,
        testMode: true
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
    
    // Check required environment variables (minimal for development)
    const requiredEnvVars = [];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate URLs
    Object.entries(this.environment.urls).forEach(([service, url]) => {
      try {
        new URL(url);
      } catch (error) {
        errors.push(`Invalid ${service} URL: ${url}`);
      }
    });

    // Validate database URI
    if (!this.database.uri) {
      errors.push('Database URI is required');
    }

    // Validate auth configuration
    if (this.auth.core.sessionDuration < 60000) {
      errors.push('Session duration should be at least 1 minute');
    }

    if (this.auth.passwordPolicy.minLength < 4) {
      errors.push('Minimum password length should be at least 4 characters');
    }

    // Check OAuth configuration if enabled
    if (this.auth.features.oauth) {
      const enabledProviders = Object.keys(this.auth.oauth)
        .filter(provider => this.auth.oauth[provider].enabled);
      
      enabledProviders.forEach(provider => {
        const config = this.auth.oauth[provider];
        if (!config.clientId && !config.clientId.includes('dev_')) {
          console.warn(`Warning: OAuth ${provider} clientId appears to be a placeholder`);
        }
      });
    }

    // Check for default secrets (warning only in development)
    const defaultSecrets = [
      'dev_jwt_secret_change_in_production',
      'dev_session_secret_change_in_production',
      'dev_encryption_key_32_characters!'
    ];
    
    const foundDefaults = [
      this.security.jwt.secret,
      this.security.session.secret,
      this.security.encryption.key
    ].filter(secret => defaultSecrets.includes(secret));

    if (foundDefaults.length > 0) {
      console.warn('Warning: Using default development secrets. Change these in production!');
    }

    if (errors.length > 0) {
      throw new Error('Configuration validation failed:\n' + errors.join('\n'));
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
      auth: this.auth,
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
module.exports = new DevelopmentConfig();