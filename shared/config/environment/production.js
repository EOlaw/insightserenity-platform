'use strict';

/**
 * @fileoverview Production environment configuration overrides using class-based architecture
 * @module shared/config/environment/production
 */

/**
 * Production environment configuration class
 * @class ProductionConfig
 */
class ProductionConfig {
  constructor() {
    // Environment metadata
    this.environment = {
      name: 'production',
      isDevelopment: false,
      isStaging: false,
      isProduction: true,
      isTest: false,
      debug: false,
      verbose: false,
      urls: {
        api: 'https://api.insightserenity.com',
        admin: 'https://admin.insightserenity.com',
        services: 'https://services.insightserenity.com',
        client: 'https://app.insightserenity.com'
      },
      features: {
        hotReload: false,
        sourceMap: false,
        errorStack: false,
        detailedErrors: false,
        mockData: false,
        seedData: false
      },
      thirdParty: {
        googleAnalytics: {
          enabled: true,
          trackingId: process.env.GA_TRACKING_ID,
          anonymizeIp: true,
          enhancedEcommerce: true
        },
        sentry: {
          enabled: true,
          dsn: process.env.SENTRY_DSN,
          environment: 'production',
          tracesSampleRate: 0.01,
          profilesSampleRate: 0.01,
          attachStacktrace: true,
          autoSessionTracking: true
        },
        intercom: {
          enabled: true,
          appId: process.env.INTERCOM_APP_ID,
          apiKey: process.env.INTERCOM_API_KEY
        },
        datadog: {
          enabled: true,
          apiKey: process.env.DATADOG_API_KEY,
          appKey: process.env.DATADOG_APP_KEY,
          site: 'datadoghq.com'
        }
      },
      monitoring: {
        prometheus: {
          enabled: true,
          port: 9090,
          path: '/metrics'
        },
        grafana: {
          enabled: true,
          url: 'https://grafana.insightserenity.com'
        },
        jaeger: {
          enabled: true,
          endpoint: 'https://jaeger.insightserenity.com',
          serviceName: 'insightserenity-production'
        },
        newRelic: {
          enabled: true,
          appName: 'InsightSerenity Production',
          licenseKey: process.env.NEW_RELIC_LICENSE_KEY
        }
      },
      cdn: {
        enabled: true,
        url: 'https://cdn.insightserenity.com',
        assets: 'https://assets.insightserenity.com',
        images: 'https://images.insightserenity.com'
      },
      security: {
        waf: {
          enabled: true,
          provider: 'cloudflare'
        },
        ddos: {
          enabled: true,
          provider: 'cloudflare'
        },
        ssl: {
          enforced: true,
          hsts: true,
          ocsp: true
        }
      }
    };

    // Base configuration overrides
    this.base = {
      app: {
        environment: 'production',
        debug: false
      },
      server: {
        protocol: 'https',
        trustProxy: true,
        compression: true,
        requestTimeout: 30000,
        shutdownTimeout: 30000
      },
      api: {
        rateLimiting: {
          enabled: true,
          windowMs: 900000, // 15 minutes
          maxRequests: 100
        },
        responseTimeout: 25000
      },
      cors: {
        origins: [
          'https://insightserenity.com',
          'https://www.insightserenity.com',
          'https://app.insightserenity.com',
          'https://admin.insightserenity.com',
          'https://api.insightserenity.com'
        ],
        credentials: true,
        maxAge: 86400
      },
      logging: {
        level: 'warn',
        format: 'json',
        colorize: false,
        prettyPrint: false,
        logRequests: true,
        logResponses: false,
        excludePaths: ['/health', '/metrics', '/ping'],
        sensitiveFields: [
          'password',
          'token',
          'secret',
          'authorization',
          'cookie',
          'creditCard',
          'ssn',
          'apiKey',
          'privateKey',
          'passphrase'
        ]
      },
      features: {
        experimental: {
          aiAssistant: false,
          advancedAnalytics: false,
          blockchain: false
        }
      },
      performance: {
        enableClustering: true,
        workers: 0, // Use all CPU cores
        enableGracefulShutdown: true,
        memoryLimit: 1024, // 1GB
        cpuThreshold: 85,
        restartOnMemoryLimit: true
      },
      maintenance: {
        enabled: false,
        message: 'We are currently performing scheduled maintenance. Please check back in a few minutes.',
        allowedIPs: [] // Add admin IPs if needed
      }
    };

    // Authentication configuration for production
    this.auth = {
      // Core authentication settings optimized for production security
      core: {
        sessionDuration: 28800000, // 8 hours for security
        refreshTokenDuration: 604800000, // 7 days
        allowMultipleSessions: true,
        maxConcurrentSessions: 3, // Restrict concurrent sessions
        maxLoginAttempts: 5, // Strict limit
        lockoutDuration: 1800000, // 30 minutes lockout
        requireEmailVerification: true, // Always required in production
        passwordResetTokenDuration: 3600000, // 1 hour only
        verificationTokenDuration: 86400000, // 24 hours
        appUrl: 'https://app.insightserenity.com',
        apiUrl: 'https://api.insightserenity.com'
      },

      // All enterprise features enabled in production
      enterprise: {
        enableRiskAssessment: true,
        enableAdvancedMFA: true,
        enableDeviceManagement: true,
        enableSecurityAlerts: true,
        enableAdvancedAudit: true,
        enableSSO: true,
        enableSAML: true,
        enableOIDC: true,
        enableOAuth: true,
        oauthProviders: ['google', 'github', 'linkedin', 'microsoft'],
        enableSessionAnalytics: true,
        enableGeolocationTracking: true,
        enableDeviceFingerprinting: true
      },

      // All production features enabled
      features: {
        registration: true,
        passwordReset: true,
        emailVerification: true,
        basicMFA: true,
        riskAssessment: true,
        advancedMFA: true,
        oauth: true,
        sso: true,
        deviceTrust: true,
        securityAnalytics: true,
        complianceReporting: true,
        biometric: true,
        webauthn: true,
        faceId: true,
        touchId: true
      },

      // Strong password policy for production
      passwordPolicy: {
        minLength: 12, // Strong minimum length
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecial: true,
        preventReuse: 10, // Prevent reuse of last 10 passwords
        expiryDays: 90, // Password expires after 90 days
        complexityChecking: true,
        dictionaryCheck: true,
        compromisedCheck: true
      },

      // Production MFA configuration
      mfa: {
        require2FA: true, // Mandatory in production
        defaultMethod: 'totp',
        codeExpiry: 300000, // 5 minutes only
        maxAttempts: 3, // Strict limit
        availableMethods: {
          totp: true,
          sms: true,
          email: true,
          push: true,
          webauthn: true,
          backup_codes: true
        },
        totp: {
          issuer: 'InsightSerenity Platform',
          algorithm: 'SHA256', // Stronger algorithm
          digits: 6,
          period: 30,
          window: 1 // Strict window
        },
        backupCodes: {
          count: 10,
          length: 8,
          regenerateThreshold: 3
        },
        deviceTrust: {
          enabled: true,
          duration: 2592000000, // 30 days
          maxDevices: 5 // Limited trusted devices
        }
      },

      // OAuth providers for production
      oauth: {
        google: {
          enabled: true,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectUri: 'https://app.insightserenity.com/auth/google/callback',
          scope: 'openid email profile',
          allowRegistration: true,
          allowLinking: true
        },
        github: {
          enabled: true,
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          redirectUri: 'https://app.insightserenity.com/auth/github/callback',
          scope: 'user:email',
          allowRegistration: true,
          allowLinking: true
        },
        linkedin: {
          enabled: true,
          clientId: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          redirectUri: 'https://app.insightserenity.com/auth/linkedin/callback',
          scope: 'r_liteprofile r_emailaddress',
          allowRegistration: true,
          allowLinking: true
        },
        microsoft: {
          enabled: true,
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          redirectUri: 'https://app.insightserenity.com/auth/microsoft/callback',
          scope: 'openid email profile',
          allowRegistration: true,
          allowLinking: true
        }
      },

      // SSO configuration for production
      sso: {
        saml: {
          enabled: true,
          entityId: process.env.SAML_ENTITY_ID || 'https://api.insightserenity.com',
          ssoUrl: process.env.SAML_SSO_URL,
          sloUrl: process.env.SAML_SLO_URL,
          certificate: process.env.SAML_CERTIFICATE,
          privateKey: process.env.SAML_PRIVATE_KEY,
          allowProvisioning: true,
          roleMapping: true,
          attributeMapping: {
            email: process.env.SAML_ATTR_EMAIL || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
            firstName: process.env.SAML_ATTR_FIRST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
            lastName: process.env.SAML_ATTR_LAST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
            groups: process.env.SAML_ATTR_GROUPS || 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
            roles: process.env.SAML_ATTR_ROLES || 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
            department: process.env.SAML_ATTR_DEPARTMENT || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department',
            employeeId: process.env.SAML_ATTR_EMPLOYEE_ID || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/employeeid'
          }
        },
        oidc: {
          enabled: true,
          issuer: process.env.OIDC_ISSUER,
          clientId: process.env.OIDC_CLIENT_ID,
          clientSecret: process.env.OIDC_CLIENT_SECRET,
          redirectUri: 'https://app.insightserenity.com/auth/oidc/callback',
          allowProvisioning: true,
          roleMapping: true
        }
      },

      // Registration settings for production
      registration: {
        enabled: true,
        requireInvitation: false, // Allow public registration
        allowPublicRegistration: true,
        defaultRole: 'user',
        autoActivate: false, // Require email verification
        domainWhitelist: [], // Allow all domains or configure as needed
        domainBlacklist: [
          '10minutemail.com',
          'tempmail.org',
          'guerrillamail.com',
          'mailinator.com'
        ], // Block disposable email providers
        requireOrganization: false
      },

      // Strict security settings for production
      security: {
        ipWhitelist: [], // Configure if needed for admin access
        ipBlacklist: [], // Managed by security team
        enableRateLimiting: true,
        rateLimitWindow: 900000, // 15 minutes
        rateLimitMaxAttempts: 100,
        enableAuditLog: true,
        auditRetentionDays: 2555, // 7 years for compliance
        riskThresholds: {
          low: 15, // Lower thresholds for production
          medium: 30,
          high: 50,
          critical: 70
        },
        enableSecurityHeaders: true,
        enableCSRF: true,
        enableCORS: true,
        encryptionAlgorithm: 'aes-256-gcm',
        hashingAlgorithm: 'argon2id', // Strongest hashing
        saltRounds: 14 // High cost for production
      },

      // Biometric configuration for production
      biometric: {
        enabled: true,
        timeout: 60000,
        allowFallback: true,
        requireLiveness: true, // Enable liveness detection
        webauthn: {
          enabled: true,
          rpName: 'InsightSerenity Platform',
          rpId: 'insightserenity.com',
          timeout: 60000,
          attestation: 'direct', // Strong attestation
          userVerification: 'required', // Always require user verification
          authenticatorAttachment: 'cross-platform'
        }
      },

      // Production notification settings
      notifications: {
        email: {
          welcomeEmail: true,
          verificationEmail: true,
          passwordResetEmail: true,
          securityAlerts: true,
          mfaAlerts: true,
          loginAlerts: true
        },
        push: {
          enabled: true,
          securityAlerts: true,
          mfaRequests: true
        },
        sms: {
          enabled: true,
          provider: process.env.SMS_PROVIDER || 'twilio',
          mfaCodes: true,
          securityAlerts: true
        }
      },

      // Full compliance enabled for production
      compliance: {
        gdpr: {
          enabled: true,
          dataRetentionDays: 2555, // 7 years
          rightToErasure: true,
          dataPortability: true,
          consentTracking: true
        },
        hipaa: {
          enabled: true,
          auditLogging: true,
          accessControls: true,
          dataEncryption: true
        },
        sox: {
          enabled: true,
          auditTrails: true,
          accessReviews: true,
          controlTesting: true
        }
      },

      // Production API integrations
      integrations: {
        threatIntelligence: {
          enabled: true,
          provider: process.env.THREAT_INTELLIGENCE_PROVIDER || 'crowdstrike',
          apiKey: process.env.THREAT_INTELLIGENCE_API_KEY,
          checkInterval: 3600000 // Check hourly in production
        },
        geoip: {
          enabled: true,
          provider: process.env.GEOIP_PROVIDER || 'maxmind',
          apiKey: process.env.GEOIP_API_KEY,
          databasePath: process.env.GEOIP_DATABASE_PATH || '/data/geoip/GeoLite2-City.mmdb'
        },
        ldap: {
          enabled: process.env.LDAP_ENABLED === 'true',
          server: process.env.LDAP_SERVER,
          bindDN: process.env.LDAP_BIND_DN,
          bindPassword: process.env.LDAP_BIND_PASSWORD,
          baseDN: process.env.LDAP_BASE_DN,
          userFilter: process.env.LDAP_USER_FILTER || '(uid={{username}})',
          allowProvisioning: process.env.LDAP_ALLOW_PROVISIONING === 'true'
        }
      }
    };

    // Database configuration overrides
    this.database = {
      uri: process.env.DB_URI,
      options: {
        maxPoolSize: 100,
        minPoolSize: 10,
        maxIdleTimeMS: 60000,
        waitQueueTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        wtimeoutMS: 5000,
        journal: true,
        readPreference: 'primaryPreferred',
        readConcernLevel: 'majority',
        compressors: ['snappy', 'zlib'],
        zlibCompressionLevel: 6
      },
      databases: {
        admin: 'insightserenity_admin',
        shared: 'insightserenity_shared',
        tenantPrefix: 'tenant_',
        audit: 'insightserenity_audit',
        analytics: 'insightserenity_analytics'
      },
      multiTenant: {
        connectionPoolPerTenant: true,
        maxConnectionsPerTenant: 20
      },
      validation: {
        enabled: true,
        level: 'strict',
        action: 'error'
      },
      indexes: {
        autoCreate: false, // Manual index creation in production
        background: true
      },
      migrations: {
        autoRun: false,
        validateChecksums: true
      },
      backup: {
        enabled: true,
        schedule: '0 2 * * *', // Daily at 2 AM
        retention: 30, // 30 days
        provider: 's3',
        path: 's3://insightserenity-production-backups',
        compress: true,
        encrypt: true
      },
      performance: {
        enableProfiling: false,
        slowQueryThreshold: 200,
        enableQueryCache: true,
        cacheSize: 512,
        enableAggregationCache: true
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000,
        logSlowQueries: true,
        logQueryPlans: false,
        trackCollectionStats: true,
        trackIndexUsage: true
      },
      replication: {
        enabled: true,
        replicaSet: process.env.MONGODB_REPLICA_SET || 'rs0',
        readFromSecondaries: true,
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: 5000
        }
      },
      security: {
        authEnabled: true,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        authSource: 'admin',
        authMechanism: 'SCRAM-SHA-256',
        tls: true,
        tlsCAFile: process.env.DB_TLS_CA_FILE,
        tlsCertificateKeyFile: process.env.DB_TLS_CERT_KEY_FILE,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false
      }
    };

    // Security configuration overrides
    this.security = {
      jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        rememberMeExpiry: '30d',
        algorithm: 'RS256',
        issuer: 'insightserenity.com',
        audience: 'insightserenity-platform'
      },
      encryption: {
        key: process.env.ENCRYPTION_KEY,
        saltRounds: 14,
        passwordMinLength: 10,
        passwordRequireUppercase: true,
        passwordRequireLowercase: true,
        passwordRequireNumbers: true,
        passwordRequireSpecial: true,
        passwordHistory: 5,
        passwordExpiryDays: 90
      },
      session: {
        secret: process.env.SESSION_SECRET,
        name: '__Host-session',
        cookie: {
          secure: true,
          httpOnly: true,
          sameSite: 'strict',
          domain: '.insightserenity.com',
          path: '/',
          maxAge: 86400000 // 24 hours
        },
        store: {
          type: 'redis',
          ttl: 86400
        }
      },
      authentication: {
        maxLoginAttempts: 5,
        lockoutDuration: 30,
        requireEmailVerification: true,
        multiFactorRequired: true
      },
      twoFactor: {
        enabled: true,
        methods: ['totp', 'sms']
      },
      csrf: {
        enabled: true
      },
      headers: {
        contentSecurityPolicy: {
          enabled: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.insightserenity.com'],
            styleSrc: ["'self'", 'https://cdn.insightserenity.com'],
            imgSrc: ["'self'", 'data:', 'https://cdn.insightserenity.com', 'https://secure.gravatar.com'],
            connectSrc: ["'self'", 'https://api.insightserenity.com', 'wss://ws.insightserenity.com'],
            fontSrc: ["'self'", 'https://cdn.insightserenity.com'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: true
          }
        },
        strictTransportSecurity: {
          enabled: true,
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true
        },
        xFrameOptions: 'DENY',
        xContentTypeOptions: 'nosniff',
        referrerPolicy: 'strict-origin-when-cross-origin',
        permissionsPolicy: 'geolocation=(), microphone=(), camera=(), payment=()'
      },
      ipSecurity: {
        enableWhitelist: false,
        enableBlacklist: true,
        blacklist: [],
        trustProxy: true,
        proxyDepth: 2
      },
      rateLimit: {
        global: {
          enabled: true,
          windowMs: 900000,
          max: 100,
          standardHeaders: true,
          legacyHeaders: false
        },
        login: {
          windowMs: 900000,
          max: 5,
          skipSuccessfulRequests: true
        },
        api: {
          windowMs: 60000,
          max: 60
        }
      },
      audit: {
        enabled: true,
        logLevel: 'info',
        retentionDays: 365,
        encryptLogs: true
      },
      features: {
        preventBruteForce: true,
        detectAnomalies: true,
        enforcePasswordPolicy: true,
        requireSecureContext: true,
        enableSecurityMonitoring: true,
        blockSuspiciousIPs: true,
        enableHoneypot: true
      }
    };

    // Redis configuration overrides
    this.redis = {
      enabled: true,
      host: process.env.REDIS_HOST,
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      database: 0,
      connectionName: 'InsightSerenity-Production',
      pool: {
        min: 10,
        max: 100
      },
      retry: {
        attempts: 10,
        delay: 500,
        backoff: 'exponential',
        maxDelay: 3000
      },
      tls: {
        enabled: true,
        ca: process.env.REDIS_TLS_CA,
        cert: process.env.REDIS_TLS_CERT,
        key: process.env.REDIS_TLS_KEY,
        rejectUnauthorized: true
      },
      cluster: {
        enabled: true,
        nodes: process.env.REDIS_CLUSTER_NODES ? process.env.REDIS_CLUSTER_NODES.split(',') : [],
        options: {
          enableReadyCheck: true,
          maxRedirections: 16,
          retryDelayOnFailover: 100,
          retryDelayOnClusterDown: 300
        }
      },
      cache: {
        ttl: 3600,
        maxKeys: 100000,
        enableLocking: true
      },
      monitoring: {
        enabled: true,
        commandStats: true,
        latencyMonitor: true,
        slowlogThreshold: 10000,
        memoryAnalysis: true,
        metricsInterval: 60000
      },
      persistence: {
        aof: {
          enabled: true,
          fsync: 'everysec'
        },
        rdb: {
          enabled: true,
          checksum: true,
          compression: true
        }
      },
      memory: {
        policy: 'allkeys-lru',
        maxMemory: '2gb',
        evictionPolicy: 'allkeys-lru'
      },
      security: {
        requirePass: true,
        disableCommands: ['FLUSHDB', 'FLUSHALL', 'CONFIG', 'SHUTDOWN'],
        aclEnabled: true
      }
    };

    // Email configuration overrides
    this.email = {
      enabled: true,
      provider: 'sendgrid',
      from: {
        name: 'InsightSerenity',
        address: 'noreply@insightserenity.com',
        replyTo: 'support@insightserenity.com'
      },
      providers: {
        sendgrid: {
          apiKey: process.env.SENDGRID_API_KEY,
          sandboxMode: false,
          ipPoolName: 'production',
          categories: ['production', 'transactional'],
          webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
        }
      },
      queue: {
        enabled: true,
        concurrency: 10,
        defaultRetries: 3
      },
      rateLimit: {
        enabled: true,
        perSecond: 20,
        perMinute: 500,
        perHour: 5000,
        perDay: 50000
      },
      bounceHandling: {
        enabled: true,
        webhookEndpoint: '/webhooks/email/bounce',
        maxBounceRate: 5,
        hardBounceAction: 'blacklist',
        softBounceThreshold: 3,
        complaintAction: 'unsubscribe'
      },
      tracking: {
        enabled: true,
        opens: true,
        clicks: true,
        unsubscribes: true,
        customDomain: 'track.insightserenity.com'
      },
      development: {
        preview: false,
        interceptAll: false,
        logToConsole: false,
        saveToFile: false
      },
      compliance: {
        includeUnsubscribeLink: true,
        includePhysicalAddress: true,
        physicalAddress: process.env.COMPANY_ADDRESS,
        gdprCompliant: true,
        canSpamCompliant: true,
        doubleOptIn: true
      }
    };

    // Payment configuration overrides
    this.payment = {
      enabled: true,
      provider: 'stripe',
      currency: 'USD',
      providers: {
        stripe: {
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
          secretKey: process.env.STRIPE_SECRET_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          apiVersion: '2023-10-16',
          captureMethod: 'automatic',
          statementDescriptor: 'INSIGHTSERENITY'
        },
        paypal: {
          mode: 'live',
          clientId: process.env.PAYPAL_CLIENT_ID,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET,
          apiUrl: 'https://api.paypal.com',
          brandName: 'InsightSerenity'
        },
        square: {
          environment: 'production',
          accessToken: process.env.SQUARE_ACCESS_TOKEN,
          applicationId: process.env.SQUARE_APPLICATION_ID,
          locationId: process.env.SQUARE_LOCATION_ID
        }
      },
      subscriptions: {
        enabled: true,
        trialPeriodDays: 14,
        gracePeriodDays: 7,
        autoCharge: true,
        prorateUpgrades: true,
        cancelAtPeriodEnd: true
      },
      security: {
        pciCompliant: true,
        tokenization: true,
        encryption: true,
        fraudDetection: true,
        threeDSecure: true,
        requireBillingAddress: true,
        testCardsAllowed: false
      },
      webhooks: {
        enabled: true,
        endpoint: '/webhooks/payment',
        timeout: 30000,
        retries: 3
      },
      refunds: {
        enabled: true,
        autoApprove: false,
        maxDays: 30,
        requireReason: true,
        partialAllowed: true
      },
      retry: {
        enabled: true,
        maxAttempts: 4,
        intervals: [1, 3, 5, 7],
        smartRetry: true,
        notifyCustomer: true
      },
      reporting: {
        enabled: true,
        realtimeMetrics: true,
        exportEnabled: true,
        retentionDays: 2555 // 7 years
      }
    };

    // Swagger configuration overrides
    this.swagger = {
      enabled: true,
      servers: {
        production: {
          url: 'https://api.insightserenity.com',
          description: 'Production API server'
        }
      },
      ui: {
        tryItOut: false,
        persistAuthorization: true
      },
      options: {
        enableMocking: false,
        hideProduction: false
      },
      access: {
        requireAuth: true,
        allowedRoles: ['admin', 'developer'],
        username: process.env.SWAGGER_USERNAME,
        password: process.env.SWAGGER_PASSWORD
      }
    };

    // Initialize configuration
    this._initialized = false;
    this._configCache = new Map();
  }

  /**
   * Initialize the configuration
   * @returns {ProductionConfig} The configuration instance
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
   * Get SSO provider configuration
   * @param {string} provider - The SSO provider name (saml, oidc)
   * @returns {Object} SSO provider configuration
   */
  getSSOConfig(provider) {
    return this.auth.sso[provider] || null;
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
          ca: this.redis.tls.ca,
          cert: this.redis.tls.cert,
          key: this.redis.tls.key,
          rejectUnauthorized: this.redis.tls.rejectUnauthorized
        }
      })
    };

    // Add cluster configuration if enabled
    if (this.redis.cluster.enabled && this.redis.cluster.nodes.length > 0) {
      return {
        clusters: this.redis.cluster.nodes.map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port) || 6379 };
        }),
        clusterRetryStrategy: this.redis.cluster.options.clusterRetryStrategy,
        ...this.redis.cluster.options
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
      queue: this.email.queue,
      rateLimit: this.email.rateLimit,
      bounceHandling: this.email.bounceHandling,
      tracking: this.email.tracking,
      compliance: this.email.compliance
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
      currency: this.payment.currency,
      ...this.payment.providers[provider],
      subscriptions: this.payment.subscriptions,
      security: this.payment.security,
      webhooks: this.payment.webhooks,
      refunds: this.payment.refunds,
      retry: this.payment.retry,
      reporting: this.payment.reporting
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
        enabled: this.database.monitoring.enabled,
        metricsInterval: this.database.monitoring.metricsInterval
      },
      redis: {
        enabled: this.redis.monitoring.enabled,
        metricsInterval: this.redis.monitoring.metricsInterval
      }
    };
  }

  /**
   * Get security headers configuration
   * @returns {Object} Security headers configuration
   */
  getSecurityHeaders() {
    return {
      ...this.security.headers,
      'X-Frame-Options': this.security.headers.xFrameOptions,
      'X-Content-Type-Options': this.security.headers.xContentTypeOptions,
      'Referrer-Policy': this.security.headers.referrerPolicy,
      'Permissions-Policy': this.security.headers.permissionsPolicy,
      ...(this.security.headers.strictTransportSecurity.enabled && {
        'Strict-Transport-Security': `max-age=${this.security.headers.strictTransportSecurity.maxAge}; includeSubDomains; preload`
      })
    };
  }

  /**
   * Get CDN URLs
   * @param {string} type - The CDN type (assets, images, etc.)
   * @returns {string} The CDN URL
   */
  getCdnUrl(type = 'assets') {
    return this.environment.cdn[type] || this.environment.cdn.url;
  }

  /**
   * Get compliance configuration
   * @returns {Object} Compliance configuration summary
   */
  getComplianceConfig() {
    return {
      gdpr: this.auth.compliance.gdpr,
      hipaa: this.auth.compliance.hipaa,
      sox: this.auth.compliance.sox,
      auditRetention: this.auth.security.auditRetentionDays,
      dataRetention: this.auth.compliance.gdpr.dataRetentionDays
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
        security: Object.entries(this.security.features)
          .filter(([_, v]) => v === true)
          .map(([k]) => k),
        auth: Object.entries(this.auth.features)
          .filter(([_, v]) => v === true)
          .map(([k]) => k)
      },
      auth: {
        requireEmailVerification: this.auth.core.requireEmailVerification,
        require2FA: this.auth.mfa.require2FA,
        enabledOAuthProviders: Object.keys(this.auth.oauth)
          .filter(provider => this.auth.oauth[provider].enabled),
        enabledSSOProviders: Object.keys(this.auth.sso)
          .filter(provider => this.auth.sso[provider].enabled),
        enterpriseFeatures: Object.keys(this.auth.enterprise)
          .filter(feature => this.auth.enterprise[feature]),
        compliance: Object.keys(this.auth.compliance)
          .filter(standard => this.auth.compliance[standard].enabled)
      },
      database: {
        uri: this.database.uri ? '***HIDDEN***' : 'Not configured',
        replication: this.database.replication.enabled,
        backup: this.database.backup.enabled
      },
      redis: {
        host: this.redis.host ? '***HIDDEN***' : 'Not configured',
        cluster: this.redis.cluster.enabled,
        persistence: this.redis.persistence.aof.enabled || this.redis.persistence.rdb.enabled
      },
      email: {
        provider: this.email.provider,
        queue: this.email.queue.enabled,
        compliance: this.email.compliance.gdprCompliant
      },
      payment: {
        provider: this.payment.provider,
        pciCompliant: this.payment.security.pciCompliant,
        testMode: false
      },
      monitoring: {
        prometheus: this.environment.monitoring.prometheus.enabled,
        sentry: this.environment.thirdParty.sentry.enabled,
        datadog: this.environment.thirdParty.datadog.enabled
      },
      security: {
        waf: this.environment.security.waf.enabled,
        ssl: this.environment.security.ssl.enforced,
        twoFactor: this.security.twoFactor.enabled,
        biometric: this.auth.biometric.enabled,
        riskAssessment: this.auth.enterprise.enableRiskAssessment
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
    
    // Check critical production environment variables
    const requiredEnvVars = [
      'DB_URI',
      'DB_USERNAME',
      'DB_PASSWORD',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'SESSION_SECRET',
      'REDIS_HOST',
      'REDIS_PASSWORD',
      'SENDGRID_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET'
    ];
    
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate OAuth configuration if enabled
    if (this.auth.features.oauth) {
      const enabledProviders = Object.keys(this.auth.oauth)
        .filter(provider => this.auth.oauth[provider].enabled);
      
      enabledProviders.forEach(provider => {
        const config = this.auth.oauth[provider];
        if (!config.clientId) {
          errors.push(`OAuth ${provider}: clientId is required`);
        }
        if (!config.clientSecret) {
          errors.push(`OAuth ${provider}: clientSecret is required`);
        }
      });
    }

    // Validate SSO configuration if enabled
    if (this.auth.features.sso) {
      if (this.auth.sso.saml.enabled) {
        if (!this.auth.sso.saml.certificate) {
          errors.push('SAML SSO: certificate is required');
        }
        if (!this.auth.sso.saml.entityId) {
          errors.push('SAML SSO: entityId is required');
        }
      }
      if (this.auth.sso.oidc.enabled) {
        if (!this.auth.sso.oidc.issuer) {
          errors.push('OIDC SSO: issuer is required');
        }
        if (!this.auth.sso.oidc.clientId) {
          errors.push('OIDC SSO: clientId is required');
        }
      }
    }

    // Validate URLs
    Object.entries(this.environment.urls).forEach(([service, url]) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
          errors.push(`Production ${service} URL must use HTTPS: ${url}`);
        }
      } catch (error) {
        errors.push(`Invalid ${service} URL: ${url}`);
      }
    });

    // Validate database URI
    if (this.database.uri && (this.database.uri.includes('localhost') || this.database.uri.includes('127.0.0.1'))) {
      errors.push('Production database should not use localhost');
    }

    // Validate encryption key
    if (!this.security.encryption.key || this.security.encryption.key.length !== 32) {
      errors.push('Encryption key must be exactly 32 characters');
    }

    // Validate auth configuration
    if (!this.auth.core.requireEmailVerification) {
      errors.push('Email verification must be required in production');
    }

    if (!this.auth.mfa.require2FA) {
      console.warn('Warning: 2FA is not required in production. Consider enabling for enhanced security.');
    }

    if (this.auth.passwordPolicy.minLength < 8) {
      errors.push('Minimum password length should be at least 8 characters in production');
    }

    // Validate secrets are not defaults
    const invalidSecrets = [];
    if (this.security.jwt.secret?.includes('dev_') || this.security.jwt.secret?.includes('change_')) {
      invalidSecrets.push('JWT secret');
    }
    if (this.security.session.secret?.includes('dev_') || this.security.session.secret?.includes('change_')) {
      invalidSecrets.push('Session secret');
    }
    if (this.security.encryption.key?.includes('dev_') || this.security.encryption.key?.includes('change_')) {
      invalidSecrets.push('Encryption key');
    }
    
    if (invalidSecrets.length > 0) {
      errors.push(`Production secrets must not use default values: ${invalidSecrets.join(', ')}`);
    }

    // Validate security settings
    if (!this.security.csrf.enabled) {
      errors.push('CSRF protection must be enabled in production');
    }
    if (!this.security.headers.contentSecurityPolicy.enabled) {
      errors.push('Content Security Policy must be enabled in production');
    }
    if (!this.security.headers.strictTransportSecurity.enabled) {
      errors.push('HSTS must be enabled in production');
    }
    if (!this.database.security.tls) {
      errors.push('Database TLS must be enabled in production');
    }
    if (!this.redis.tls.enabled) {
      errors.push('Redis TLS must be enabled in production');
    }
    if (this.payment.security.testCardsAllowed) {
      errors.push('Test cards must be disabled in production');
    }

    // Validate backup configuration
    if (!this.database.backup.enabled) {
      errors.push('Database backups must be enabled in production');
    }

    // Validate compliance settings
    if (!this.auth.compliance.gdpr.enabled) {
      console.warn('Warning: GDPR compliance should be enabled in production');
    }

    // Validate monitoring
    if (!this.environment.monitoring.prometheus.enabled) {
      console.warn('Warning: Prometheus monitoring should be enabled in production');
    }
    if (!this.environment.thirdParty.sentry.enabled) {
      console.warn('Warning: Sentry error tracking should be enabled in production');
    }

    if (errors.length > 0) {
      throw new Error('Production configuration validation failed:\n' + errors.join('\n'));
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
module.exports = new ProductionConfig();