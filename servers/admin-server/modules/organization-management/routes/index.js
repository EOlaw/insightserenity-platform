'use strict';

/**
 * @fileoverview Organization Management Routes Index - Central export and configuration for all organization management routes
 * @module servers/admin-server/modules/organization-management/routes
 * @requires express
 * @requires module:servers/admin-server/modules/organization-management/routes/organization-admin-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/subscription-management-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/organization-settings-routes
 * @requires module:servers/admin-server/modules/organization-management/routes/tenant-management-routes
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/middleware/error-handlers/error-handler
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/security/security-headers
 */

const express = require('express');
const organizationAdminRoutes = require('./organization-admin-routes');
const subscriptionManagementRoutes = require('./subscription-management-routes');
const organizationSettingsRoutes = require('./organization-settings-routes');
const tenantManagementRoutes = require('./tenant-management-routes');
const logger = require('../../../../../shared/lib/utils/logger');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const errorHandler = require('../../../../../shared/lib/middleware/error-handlers/error-handler');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');

/**
 * OrganizationManagementRoutesManager class handles the configuration, initialization,
 * and management of all organization management related routes. It provides a centralized
 * interface for registering routes with the Express application while maintaining
 * proper middleware ordering, error handling, and monitoring capabilities.
 * 
 * @class OrganizationManagementRoutesManager
 */
class OrganizationManagementRoutesManager {
  /**
   * Private fields for internal state management
   */
  #router;
  #config;
  #responseFormatter;
  #routeRegistry;
  #metricsCollector;
  #healthChecks;
  #routeDocumentation;
  #securityConfig;
  #middlewareStack;
  #initialized;
  #performanceMetrics;
  #auditLog;
  #circuitBreaker;
  #rateLimiters;
  #cacheManager;
  #alertManager;
  #multiTenantManager;
  #subscriptionEngine;
  #billingIntegration;
  #complianceTracker;
  #resourceQuotaManager;

  /**
   * Constructor initializes the routes manager with default configurations
   * and prepares the internal state for route registration and management.
   */
  constructor() {
    this.#router = express.Router();
    this.#responseFormatter = new ResponseFormatter();
    this.#routeRegistry = new Map();
    this.#metricsCollector = new Map();
    this.#healthChecks = new Map();
    this.#routeDocumentation = [];
    this.#middlewareStack = [];
    this.#initialized = false;

    this.#initializeConfiguration();
    this.#initializeSecurityConfig();
    this.#initializePerformanceTracking();
    this.#initializeAuditSystem();
    this.#initializeCircuitBreakers();
    this.#initializeRateLimiters();
    this.#initializeCacheManager();
    this.#initializeAlertManager();
    this.#initializeMultiTenantManager();
    this.#initializeSubscriptionEngine();
    this.#initializeBillingIntegration();
    this.#initializeComplianceTracker();
    this.#initializeResourceQuotaManager();
    this.#setupBaseMiddleware();
    this.#registerRouteModules();
    this.#setupHealthChecks();
    this.#setupMetricsCollection();
    this.#generateRouteDocumentation();

    logger.info('OrganizationManagementRoutesManager initialized successfully', {
      module: 'organization-management',
      version: this.#config.apiVersion,
      capabilities: this.#config.featureFlags
    });
  }

  /**
   * Initialize default configuration for the routes manager.
   * This includes API versioning, route prefixes, feature flags,
   * and operational parameters.
   * 
   * @private
   */
  #initializeConfiguration() {
    this.#config = {
      apiVersion: process.env.API_VERSION || 'v1',
      basePrefix: process.env.ORGANIZATION_MANAGEMENT_BASE_PATH || '/api/v1/organization-management',
      enableMetrics: process.env.ENABLE_ROUTE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      enableDocumentation: process.env.ENABLE_ROUTE_DOCS !== 'false',
      enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false',
      enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
      enableCaching: process.env.ENABLE_ROUTE_CACHING !== 'false',
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 60000,
      maxRequestSize: process.env.MAX_REQUEST_SIZE || '25mb',
      corsEnabled: process.env.ENABLE_CORS !== 'false',
      compressionEnabled: process.env.ENABLE_COMPRESSION !== 'false',

      routePrefixes: {
        organizations: '/organizations',
        subscriptions: '/subscriptions',
        settings: '/settings',
        tenants: '/tenants'
      },

      featureFlags: {
        enableOrganizationAdmin: process.env.FEATURE_ORG_ADMIN !== 'false',
        enableSubscriptionMgmt: process.env.FEATURE_SUBSCRIPTION_MGMT !== 'false',
        enableSettingsManagement: process.env.FEATURE_SETTINGS_MGMT !== 'false',
        enableTenantManagement: process.env.FEATURE_TENANT_MGMT !== 'false',
        enableMultiTenancy: process.env.FEATURE_MULTI_TENANCY !== 'false',
        enableBillingIntegration: process.env.FEATURE_BILLING_INTEGRATION !== 'false',
        enableComplianceTracking: process.env.FEATURE_COMPLIANCE_TRACKING !== 'false',
        enableResourceQuotas: process.env.FEATURE_RESOURCE_QUOTAS !== 'false',
        enableOrganizationHierarchy: process.env.FEATURE_ORG_HIERARCHY !== 'false',
        enableCrossOrgCollaboration: process.env.FEATURE_CROSS_ORG_COLLAB !== 'false'
      },

      monitoring: {
        logLevel: process.env.ROUTE_LOG_LEVEL || 'info',
        metricsInterval: parseInt(process.env.METRICS_INTERVAL) || 60000,
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        slowRouteThreshold: parseInt(process.env.SLOW_ROUTE_THRESHOLD) || 3000,
        errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD) || 0.05,
        organizationMetrics: {
          trackActiveUsers: true,
          trackResourceUsage: true,
          trackBillingMetrics: true,
          trackComplianceStatus: true
        }
      },

      multiTenant: {
        enabled: process.env.MULTI_TENANT_ENABLED === 'true',
        tenantIsolation: process.env.TENANT_ISOLATION || 'strict',
        maxTenantsPerOrg: parseInt(process.env.MAX_TENANTS_PER_ORG) || 100,
        defaultTenantQuota: {
          users: parseInt(process.env.DEFAULT_USER_QUOTA) || 1000,
          storage: parseInt(process.env.DEFAULT_STORAGE_QUOTA) || 107374182400, // 100GB
          apiCalls: parseInt(process.env.DEFAULT_API_QUOTA) || 1000000,
          projects: parseInt(process.env.DEFAULT_PROJECT_QUOTA) || 50
        }
      },

      billing: {
        enabled: process.env.BILLING_ENABLED === 'true',
        currency: process.env.DEFAULT_CURRENCY || 'USD',
        billingCycle: process.env.DEFAULT_BILLING_CYCLE || 'monthly',
        taxCalculation: process.env.TAX_CALCULATION_ENABLED === 'true',
        paymentGateways: (process.env.PAYMENT_GATEWAYS || 'stripe,paypal').split(',')
      },

      compliance: {
        gdprEnabled: process.env.GDPR_ENABLED === 'true',
        ccpaEnabled: process.env.CCPA_ENABLED === 'true',
        hipaaEnabled: process.env.HIPAA_ENABLED === 'true',
        dataRetentionPeriod: parseInt(process.env.DATA_RETENTION_PERIOD) || 2555200000, // 1 month
        auditRetentionPeriod: parseInt(process.env.AUDIT_RETENTION_PERIOD) || 31557600000 // 1 year
      }
    };
  }

  /**
   * Initialize security configuration for route protection.
   * This includes authentication requirements, authorization levels,
   * and security headers configuration.
   * 
   * @private
   */
  #initializeSecurityConfig() {
    this.#securityConfig = {
      authentication: {
        required: true,
        excludePaths: [
          '/health',
          '/metrics',
          '/docs',
          '/organizations/public'
        ],
        tokenValidation: {
          algorithm: 'HS256',
          issuer: process.env.JWT_ISSUER || 'insightserenity',
          audience: process.env.JWT_AUDIENCE || 'org-api',
          maxAge: process.env.JWT_MAX_AGE || '24h'
        }
      },

      authorization: {
        defaultRequiredRoles: ['ORGANIZATION_ADMIN'],
        roleHierarchy: {
          'SUPER_ADMIN': 10,
          'PLATFORM_ADMIN': 9,
          'ORGANIZATION_ADMIN': 8,
          'BILLING_ADMIN': 7,
          'TENANT_ADMIN': 6,
          'DEPARTMENT_ADMIN': 5,
          'PROJECT_MANAGER': 4,
          'COMPLIANCE_OFFICER': 4,
          'USER_MANAGER': 3,
          'READ_ONLY_ADMIN': 1
        },
        resourcePermissions: {
          'organizations': ['create', 'read', 'update', 'delete', 'manage'],
          'subscriptions': ['create', 'read', 'update', 'cancel', 'billing'],
          'tenants': ['create', 'read', 'update', 'delete', 'configure'],
          'settings': ['read', 'update', 'manage']
        },
        permissionCache: {
          enabled: true,
          ttl: 300,
          maxSize: 5000
        }
      },

      headers: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        },
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
          }
        },
        referrerPolicy: 'strict-origin-when-cross-origin',
        xContentTypeOptions: 'nosniff',
        xFrameOptions: 'DENY',
        xXssProtection: '1; mode=block'
      },

      rateLimiting: {
        windowMs: 60000,
        max: 150,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        keyGenerator: (req) => `${req.user?.organizationId || req.ip}_org`,
        message: 'Too many organization management requests'
      },

      encryption: {
        algorithm: 'aes-256-gcm',
        keyRotationInterval: 86400000,
        sensitiveFields: [
          'password',
          'apiKey',
          'billingInfo',
          'taxId',
          'bankAccount',
          'creditCard',
          'personalData'
        ]
      },

      tenantSeparation: {
        enforceStrictSeparation: true,
        allowCrossOrgOperations: false,
        validateTenantAccess: true,
        logCrossOrgAttempts: true
      }
    };
  }

  /**
   * Initialize performance tracking system
   * @private
   */
  #initializePerformanceTracking() {
    this.#performanceMetrics = {
      routes: new Map(),
      organizations: new Map(),
      tenants: new Map(),
      subscriptions: new Map(),
      system: {
        startTime: Date.now(),
        requestCount: 0,
        organizationOperations: 0,
        tenantOperations: 0,
        subscriptionOperations: 0,
        billingOperations: 0,
        errorCount: 0,
        totalResponseTime: 0,
        averageResponseTime: 0
      },
      thresholds: {
        slowRoute: 3000,
        highMemory: 1024 * 1024 * 1024, // 1GB
        highOrgOperations: 1000,
        errorRate: 0.05
      },
      businessMetrics: {
        organizationsCreated: 0,
        organizationsActive: new Set(),
        tenantsProvisioned: 0,
        subscriptionsActivated: 0,
        revenue: {
          monthly: 0,
          quarterly: 0,
          yearly: 0
        }
      }
    };
  }

  /**
   * Initialize audit logging system
   * @private
   */
  #initializeAuditSystem() {
    this.#auditLog = {
      enabled: this.#config.enableAuditLogging,
      entries: [],
      maxEntries: 100000,
      retention: this.#config.compliance.auditRetentionPeriod,
      sensitiveOperations: new Set([
        'organization_create',
        'organization_delete',
        'tenant_provision',
        'tenant_delete',
        'subscription_create',
        'subscription_cancel',
        'billing_change',
        'compliance_update',
        'quota_change',
        'settings_update'
      ]),
      complianceEvents: new Map(),
      securityEvents: new Map(),
      businessEvents: new Map(),
      gdprEvents: new Map(),
      categories: {
        ORGANIZATION: 'organization_management',
        TENANT: 'tenant_management',
        SUBSCRIPTION: 'subscription_management',
        BILLING: 'billing_operations',
        COMPLIANCE: 'compliance_tracking',
        SECURITY: 'security_operations'
      }
    };
  }

  /**
   * Initialize circuit breakers for external dependencies
   * @private
   */
  #initializeCircuitBreakers() {
    this.#circuitBreaker = {
      database: {
        state: 'closed',
        failures: 0,
        threshold: 5,
        timeout: 60000,
        lastFailure: null
      },
      billingService: {
        state: 'closed',
        failures: 0,
        threshold: 3,
        timeout: 30000,
        lastFailure: null
      },
      notificationService: {
        state: 'closed',
        failures: 0,
        threshold: 4,
        timeout: 45000,
        lastFailure: null
      },
      complianceService: {
        state: 'closed',
        failures: 0,
        threshold: 2,
        timeout: 90000,
        lastFailure: null
      },
      tenantProvisioning: {
        state: 'closed',
        failures: 0,
        threshold: 3,
        timeout: 120000,
        lastFailure: null
      }
    };
  }

  /**
   * Initialize rate limiting configurations
   * @private
   */
  #initializeRateLimiters() {
    this.#rateLimiters = {
      standard: { windowMs: 60000, max: 150 },
      strict: { windowMs: 60000, max: 50 },
      organizations: { windowMs: 60000, max: 100 },
      subscriptions: { windowMs: 60000, max: 75 },
      tenants: { windowMs: 60000, max: 50 },
      settings: { windowMs: 60000, max: 200 },
      billing: { windowMs: 60000, max: 30 },
      compliance: { windowMs: 300000, max: 20 },
      bulk: { windowMs: 300000, max: 5 },
      reporting: { windowMs: 300000, max: 50 }
    };
  }

  /**
   * Initialize cache management system
   * @private
   */
  #initializeCacheManager() {
    this.#cacheManager = {
      enabled: this.#config.enableCaching,
      ttl: 300000, // 5 minutes
      organizationTtl: 600000, // 10 minutes for organization data
      tenantTtl: 300000, // 5 minutes for tenant data
      settingsTtl: 900000, // 15 minutes for settings
      subscriptionTtl: 180000, // 3 minutes for subscription data
      maxSize: 10000,
      cache: new Map(),
      organizationCache: new Map(),
      tenantCache: new Map(),
      settingsCache: new Map(),
      subscriptionCache: new Map(),
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      cacheStrategies: {
        organizations: 'write-through',
        tenants: 'write-behind',
        subscriptions: 'write-through',
        settings: 'write-through'
      }
    };
  }

  /**
   * Initialize alert management system
   * @private
   */
  #initializeAlertManager() {
    this.#alertManager = {
      enabled: true,
      activeAlerts: new Map(),
      suppressedAlerts: new Set(),
      alertHistory: [],
      thresholds: {
        organizationCreationRate: 100, // per hour
        tenantProvisioningFailures: 5,
        subscriptionCancellationRate: 0.1,
        billingFailureRate: 0.05,
        complianceViolations: 1,
        quotaExceededCount: 10
      },
      channels: ['email', 'slack', 'webhook', 'dashboard'],
      escalationRules: {
        critical: { timeout: 300000, escalateAfter: 2 },
        high: { timeout: 900000, escalateAfter: 5 },
        medium: { timeout: 1800000, escalateAfter: 10 },
        low: { timeout: 3600000, escalateAfter: 20 }
      },
      categories: {
        ORGANIZATION: 'organization_alerts',
        TENANT: 'tenant_alerts',
        BILLING: 'billing_alerts',
        COMPLIANCE: 'compliance_alerts',
        QUOTA: 'quota_alerts',
        SECURITY: 'security_alerts'
      }
    };
  }

  /**
   * Initialize multi-tenant management system
   * @private
   */
  #initializeMultiTenantManager() {
    this.#multiTenantManager = {
      enabled: this.#config.multiTenant.enabled,
      isolation: this.#config.multiTenant.tenantIsolation,
      tenants: new Map(),
      organizationTenants: new Map(),
      quotas: new Map(),
      defaultQuota: this.#config.multiTenant.defaultTenantQuota,
      provisioningQueue: [],
      deprovisioningQueue: [],
      migrationTasks: new Map(),
      tenantHealth: new Map(),
      resourceUsage: new Map(),
      billingAssociations: new Map()
    };
  }

  /**
   * Initialize subscription management engine
   * @private
   */
  #initializeSubscriptionEngine() {
    this.#subscriptionEngine = {
      enabled: this.#config.featureFlags.enableSubscriptionMgmt,
      subscriptions: new Map(),
      plans: new Map(),
      billingCycles: ['monthly', 'quarterly', 'yearly'],
      renewalQueue: [],
      cancellationQueue: [],
      upgradeQueue: [],
      downgradeQueue: [],
      trialManagement: {
        enabled: true,
        defaultTrialPeriod: 30,
        activeTrials: new Map(),
        trialExpirations: new Map()
      },
      discountEngine: {
        enabled: true,
        activeCoupons: new Map(),
        promotions: new Map(),
        loyaltyPrograms: new Map()
      }
    };
  }

  /**
   * Initialize billing integration system
   * @private
   */
  #initializeBillingIntegration() {
    this.#billingIntegration = {
      enabled: this.#config.billing.enabled,
      currency: this.#config.billing.currency,
      gateways: new Map(),
      invoices: new Map(),
      paymentMethods: new Map(),
      billingProfiles: new Map(),
      taxCalculation: {
        enabled: this.#config.billing.taxCalculation,
        rules: new Map(),
        exemptions: new Map()
      },
      dunningManagement: {
        enabled: true,
        retryAttempts: 3,
        dunningCycles: new Map(),
        gracePeriod: 864000000 // 10 days
      },
      revenueRecognition: {
        enabled: true,
        rules: new Map(),
        deferredRevenue: new Map()
      }
    };
  }

  /**
   * Initialize compliance tracking system
   * @private
   */
  #initializeComplianceTracker() {
    this.#complianceTracker = {
      enabled: this.#config.featureFlags.enableComplianceTracking,
      frameworks: {
        gdpr: {
          enabled: this.#config.compliance.gdprEnabled,
          dataProcessingRecords: new Map(),
          consentManagement: new Map(),
          dataSubjectRequests: []
        },
        ccpa: {
          enabled: this.#config.compliance.ccpaEnabled,
          privacyNotices: new Map(),
          optOutRequests: []
        },
        hipaa: {
          enabled: this.#config.compliance.hipaaEnabled,
          businessAssociateAgreements: new Map(),
          auditTrail: []
        }
      },
      violations: new Map(),
      assessments: new Map(),
      remediation: new Map(),
      certifications: new Map(),
      dataRetention: {
        policies: new Map(),
        schedules: new Map(),
        deletionTasks: []
      }
    };
  }

  /**
   * Initialize resource quota management system
   * @private
   */
  #initializeResourceQuotaManager() {
    this.#resourceQuotaManager = {
      enabled: this.#config.featureFlags.enableResourceQuotas,
      quotas: new Map(),
      usage: new Map(),
      limits: {
        organizations: new Map(),
        tenants: new Map(),
        users: new Map(),
        storage: new Map(),
        apiCalls: new Map()
      },
      enforcement: {
        enabled: true,
        gracePeriod: 3600000, // 1 hour
        suspensionThreshold: 1.1, // 110% of quota
        alertThreshold: 0.8 // 80% of quota
      },
      billing: {
        overageCharging: true,
        overageRates: new Map(),
        billingIntegration: true
      }
    };
  }

  /**
   * Setup base middleware that applies to all routes.
   * This includes logging, security headers, and error handling.
   * 
   * @private
   */
  #setupBaseMiddleware() {
    // Request logging middleware with organization context
    this.#router.use(requestLogger({
      module: 'OrganizationManagementRoutes',
      logLevel: this.#config.monitoring.logLevel,
      includeHeaders: process.env.NODE_ENV === 'development',
      includeBody: process.env.NODE_ENV === 'development',
      sensitiveFields: this.#securityConfig.encryption.sensitiveFields,
      organizationFields: ['organizationId', 'tenantId', 'subscriptionId']
    }));

    // Security headers middleware
    this.#router.use(securityHeaders(this.#securityConfig.headers));

    // Multi-tenant context middleware
    this.#router.use((req, res, next) => {
      req.requestId = req.headers['x-request-id'] || this.#generateRequestId();
      req.correlationId = req.headers['x-correlation-id'] || this.#generateCorrelationId();
      req.organizationId = req.headers['x-organization-id'] || req.user?.organizationId;
      req.tenantId = req.headers['x-tenant-id'] || req.user?.tenantId;

      req.organizationContext = {
        module: 'organization-management',
        organizationId: req.organizationId,
        tenantId: req.tenantId,
        timestamp: new Date().toISOString(),
        multiTenant: this.#config.multiTenant.enabled
      };

      res.setHeader('X-Request-ID', req.requestId);
      res.setHeader('X-Correlation-ID', req.correlationId);
      res.setHeader('X-Organization-Module', 'organization-management');

      if (req.organizationId) {
        res.setHeader('X-Organization-ID', req.organizationId);
      }

      next();
    });

    // Tenant isolation middleware
    if (this.#multiTenantManager.enabled) {
      this.#router.use(this.#createTenantIsolationMiddleware());
    }

    // Performance monitoring middleware
    if (this.#config.enableMetrics) {
      this.#router.use(this.#createPerformanceMiddleware());
    }

    // Audit logging middleware
    if (this.#config.enableAuditLogging) {
      this.#router.use(this.#createAuditMiddleware());
    }

    // Resource quota middleware
    if (this.#resourceQuotaManager.enabled) {
      this.#router.use(this.#createQuotaMiddleware());
    }

    // Compliance tracking middleware
    if (this.#complianceTracker.enabled) {
      this.#router.use(this.#createComplianceMiddleware());
    }

    logger.debug('Base middleware configured for organization management routes');
  }

  /**
   * Register all route modules with their respective prefixes.
   * This method conditionally registers routes based on feature flags.
   * 
   * @private
   */
  #registerRouteModules() {
    const modules = [
      {
        name: 'organizations',
        routes: organizationAdminRoutes,
        prefix: this.#config.routePrefixes.organizations,
        enabled: this.#config.featureFlags.enableOrganizationAdmin,
        description: 'Organization administration and management endpoints',
        capabilities: [
          'organization-creation',
          'organization-management',
          'hierarchy-management',
          'organization-analytics'
        ]
      },
      {
        name: 'subscriptions',
        routes: subscriptionManagementRoutes,
        prefix: this.#config.routePrefixes.subscriptions,
        enabled: this.#config.featureFlags.enableSubscriptionMgmt,
        description: 'Subscription lifecycle and billing management endpoints',
        capabilities: [
          'subscription-management',
          'billing-integration',
          'plan-management',
          'payment-processing'
        ]
      },
      {
        name: 'settings',
        routes: organizationSettingsRoutes,
        prefix: this.#config.routePrefixes.settings,
        enabled: this.#config.featureFlags.enableSettingsManagement,
        description: 'Organization settings and configuration endpoints',
        capabilities: [
          'settings-management',
          'configuration-control',
          'preference-management',
          'policy-enforcement'
        ]
      },
      {
        name: 'tenants',
        routes: tenantManagementRoutes,
        prefix: this.#config.routePrefixes.tenants,
        enabled: this.#config.featureFlags.enableTenantManagement,
        description: 'Tenant provisioning and management endpoints',
        capabilities: [
          'tenant-provisioning',
          'tenant-management',
          'resource-isolation',
          'tenant-billing'
        ]
      }
    ];

    modules.forEach(module => {
      if (module.enabled) {
        this.#registerModule(module);
        logger.info(`Registered ${module.name} routes at prefix: ${module.prefix}`, {
          capabilities: module.capabilities
        });
      } else {
        logger.warn(`${module.name} routes are disabled by feature flag`);
      }
    });
  }

  /**
   * Register an individual route module with the router.
   * 
   * @private
   * @param {Object} module - Module configuration object
   */
  #registerModule(module) {
    // Create module-specific router
    const moduleRouter = express.Router();

    // Apply module-specific middleware
    moduleRouter.use(this.#createModuleMiddleware(module.name));

    // Mount the module routes
    moduleRouter.use(module.routes);

    // Register with main router
    this.#router.use(module.prefix, moduleRouter);

    // Store in registry with enhanced metadata
    this.#routeRegistry.set(module.name, {
      prefix: module.prefix,
      router: moduleRouter,
      description: module.description,
      capabilities: module.capabilities,
      registeredAt: new Date(),
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      lastAccessed: null,
      organizationOperations: 0,
      tenantOperations: 0,
      subscriptionOperations: 0,
      billingOperations: 0
    });
  }

  /**
   * Create module-specific middleware for enhanced monitoring and control.
   * 
   * @private
   * @param {string} moduleName - Name of the module
   * @returns {Function} Express middleware function
   */
  #createModuleMiddleware(moduleName) {
    return (req, res, next) => {
      const startTime = Date.now();

      req.moduleContext = {
        module: moduleName,
        startTime,
        requestId: req.requestId,
        correlationId: req.correlationId,
        organizationId: req.organizationId,
        tenantId: req.tenantId
      };

      // Track module request
      const moduleData = this.#routeRegistry.get(moduleName);
      if (moduleData) {
        moduleData.requestCount++;
        moduleData.lastAccessed = new Date();

        // Track operation type
        if (req.path.includes('organization')) {
          moduleData.organizationOperations++;
        } else if (req.path.includes('tenant')) {
          moduleData.tenantOperations++;
        } else if (req.path.includes('subscription')) {
          moduleData.subscriptionOperations++;
        } else if (req.path.includes('billing')) {
          moduleData.billingOperations++;
        }
      }

      // Monitor response
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;

        // Update metrics
        if (moduleData) {
          const currentAvg = moduleData.averageResponseTime;
          const count = moduleData.requestCount;
          moduleData.averageResponseTime = (currentAvg * (count - 1) + responseTime) / count;

          if (res.statusCode >= 400) {
            moduleData.errorCount++;
          }
        }

        // Log slow requests
        if (responseTime > this.#config.monitoring.slowRouteThreshold) {
          logger.warn(`Slow request detected in ${moduleName}`, {
            path: req.path,
            method: req.method,
            responseTime,
            requestId: req.requestId,
            organizationId: req.organizationId
          });

          this.#triggerAlert('slow_route', {
            module: moduleName,
            path: req.path,
            responseTime,
            organizationId: req.organizationId
          });
        }

        // Update performance metrics
        this.#updatePerformanceMetrics(moduleName, responseTime, res.statusCode, req);
      });

      next();
    };
  }

  /**
   * Create tenant isolation middleware
   * @private
   * @returns {Function} Express middleware function
   */
  #createTenantIsolationMiddleware() {
    return (req, res, next) => {
      if (!req.organizationId && req.path !== '/health' && req.path !== '/metrics') {
        return res.status(400).json(this.#responseFormatter.formatError(
          'Organization ID required for multi-tenant operations',
          400
        ));
      }

      // Validate tenant access
      if (req.tenantId && !this.#validateTenantAccess(req.organizationId, req.tenantId, req.user)) {
        this.#logAuditEvent('UNAUTHORIZED_TENANT_ACCESS', req, {
          attemptedTenantId: req.tenantId,
          userOrganizationId: req.user?.organizationId
        });

        return res.status(403).json(this.#responseFormatter.formatError(
          'Access denied to tenant resources',
          403
        ));
      }

      next();
    };
  }

  /**
    * Log an audit event for security, compliance, or business operations tracking.
    * This method creates structured audit entries that are stored in appropriate
    * audit event maps based on the event type and category.
    * 
    * @private
    * @param {string} eventType - Type of audit event (e.g., 'UNAUTHORIZED_ACCESS', 'ORGANIZATION_CREATE')
    * @param {Object} req - Express request object containing request context
    * @param {Object} additionalDetails - Additional event-specific details to log
    * @param {string} [severity='medium'] - Event severity level (low, medium, high, critical)
    */
  #logAuditEvent(eventType, req, additionalDetails = {}, severity = 'medium') {
    if (!this.#auditLog.enabled) {
      return;
    }

    // Create comprehensive audit entry
    const auditEntry = {
      eventId: this.#generateAuditEventId(),
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      requestId: req.requestId || this.#generateRequestId(),
      correlationId: req.correlationId || this.#generateCorrelationId(),

      // Request context
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      forwarded: req.headers['x-forwarded-for'],

      // User context
      user: {
        id: req.user?.id || 'anonymous',
        role: req.user?.role || 'none',
        organizationId: req.user?.organizationId,
        tenantId: req.user?.tenantId,
        permissions: req.user?.permissions || []
      },

      // Organization context
      organizationContext: {
        organizationId: req.organizationId,
        tenantId: req.tenantId,
        module: req.moduleContext?.module || 'organization-management'
      },

      // Additional details
      details: {
        ...additionalDetails,
        multiTenant: this.#multiTenantManager.enabled,
        complianceFrameworks: this.#getActiveComplianceFrameworks()
      },

      // Classification
      category: this.#classifyAuditEvent(eventType),
      tags: this.#generateAuditTags(eventType, req, additionalDetails),

      // Compliance flags
      complianceRelevant: this.#isComplianceRelevant(eventType),
      securityRelevant: this.#isSecurityRelevant(eventType),
      businessCritical: this.#isBusinessCritical(eventType),

      // Metadata
      source: 'organization-management-routes',
      version: this.#config.apiVersion,
      environment: process.env.NODE_ENV || 'development'
    };

    try {
      // Store in main audit log
      this.#auditLog.entries.push(auditEntry);

      // Store in category-specific maps for faster retrieval
      const category = auditEntry.category;
      switch (category) {
        case this.#auditLog.categories.ORGANIZATION:
          this.#auditLog.businessEvents.set(auditEntry.eventId, auditEntry);
          break;
        case this.#auditLog.categories.TENANT:
          this.#auditLog.businessEvents.set(auditEntry.eventId, auditEntry);
          break;
        case this.#auditLog.categories.SUBSCRIPTION:
          this.#auditLog.businessEvents.set(auditEntry.eventId, auditEntry);
          break;
        case this.#auditLog.categories.BILLING:
          this.#auditLog.businessEvents.set(auditEntry.eventId, auditEntry);
          break;
        case this.#auditLog.categories.COMPLIANCE:
          this.#auditLog.complianceEvents.set(auditEntry.eventId, auditEntry);
          break;
        case this.#auditLog.categories.SECURITY:
          this.#auditLog.securityEvents.set(auditEntry.eventId, auditEntry);
          break;
      }

      // Handle GDPR-specific events
      if (this.#complianceTracker.frameworks.gdpr.enabled && auditEntry.complianceRelevant) {
        this.#auditLog.gdprEvents.set(auditEntry.eventId, auditEntry);
      }

      // Log based on severity
      this.#logAuditEntryBySeverity(auditEntry);

      // Trigger alerts for critical events
      if (severity === 'critical' || this.#shouldTriggerAuditAlert(eventType)) {
        this.#triggerAuditAlert(auditEntry);
      }

      // Update performance metrics
      this.#updateAuditMetrics(eventType, category);

      // Check for log rotation
      if (this.#auditLog.entries.length > this.#auditLog.maxEntries) {
        this.#rotateAuditLog();
      }

    } catch (error) {
      logger.error('Failed to log audit event', {
        error: error.message,
        eventType,
        requestId: req.requestId,
        organizationId: req.organizationId
      });
    }
  }

  /**
   * Generate unique audit event ID
   * @private
   * @returns {string} Unique event ID
   */
  #generateAuditEventId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 12);
    return `audit-${timestamp}-${randomPart}`;
  }

  /**
   * Classify audit event into appropriate category
   * @private
   * @param {string} eventType - Type of audit event
   * @returns {string} Event category
   */
  #classifyAuditEvent(eventType) {
    const eventLower = eventType.toLowerCase();

    if (eventLower.includes('organization')) {
      return this.#auditLog.categories.ORGANIZATION;
    } else if (eventLower.includes('tenant')) {
      return this.#auditLog.categories.TENANT;
    } else if (eventLower.includes('subscription') || eventLower.includes('billing')) {
      return this.#auditLog.categories.BILLING;
    } else if (eventLower.includes('compliance') || eventLower.includes('gdpr') || eventLower.includes('ccpa')) {
      return this.#auditLog.categories.COMPLIANCE;
    } else if (eventLower.includes('unauthorized') || eventLower.includes('security') || eventLower.includes('access')) {
      return this.#auditLog.categories.SECURITY;
    }

    return 'general';
  }

  /**
   * Generate audit tags for categorization and search
   * @private
   * @param {string} eventType - Type of audit event
   * @param {Object} req - Request object
   * @param {Object} additionalDetails - Additional details
   * @returns {Array} Array of tags
   */
  #generateAuditTags(eventType, req, additionalDetails) {
    const tags = [eventType.toLowerCase()];

    if (req.organizationId) tags.push(`org:${req.organizationId}`);
    if (req.tenantId) tags.push(`tenant:${req.tenantId}`);
    if (req.user?.role) tags.push(`role:${req.user.role}`);
    if (req.method) tags.push(`method:${req.method.toLowerCase()}`);
    if (this.#multiTenantManager.enabled) tags.push('multitenant');

    // Add module-specific tags
    if (req.path.includes('/organizations')) tags.push('organizations');
    if (req.path.includes('/tenants')) tags.push('tenants');
    if (req.path.includes('/subscriptions')) tags.push('subscriptions');
    if (req.path.includes('/billing')) tags.push('billing');

    // Add additional detail tags
    Object.keys(additionalDetails).forEach(key => {
      if (typeof additionalDetails[key] === 'string') {
        tags.push(`${key}:${additionalDetails[key]}`);
      }
    });

    return tags;
  }

  /**
   * Check if event is compliance relevant
   * @private
   * @param {string} eventType - Type of audit event
   * @returns {boolean} True if compliance relevant
   */
  #isComplianceRelevant(eventType) {
    const complianceEvents = [
      'DATA_PROCESSING',
      'DATA_EXPORT',
      'DATA_DELETION',
      'CONSENT_UPDATE',
      'PRIVACY_SETTING_CHANGE',
      'CROSS_BORDER_TRANSFER',
      'RETENTION_POLICY_UPDATE'
    ];

    return complianceEvents.some(event => eventType.includes(event));
  }

  /**
   * Check if event is security relevant
   * @private
   * @param {string} eventType - Type of audit event
   * @returns {boolean} True if security relevant
   */
  #isSecurityRelevant(eventType) {
    const securityEvents = [
      'UNAUTHORIZED',
      'ACCESS_DENIED',
      'AUTHENTICATION_FAILED',
      'PERMISSION_ESCALATION',
      'SUSPICIOUS_ACTIVITY',
      'BRUTE_FORCE',
      'DATA_BREACH'
    ];

    return securityEvents.some(event => eventType.includes(event));
  }

  /**
   * Check if event is business critical
   * @private
   * @param {string} eventType - Type of audit event
   * @returns {boolean} True if business critical
   */
  #isBusinessCritical(eventType) {
    const criticalEvents = [
      'ORGANIZATION_DELETE',
      'TENANT_DELETE',
      'SUBSCRIPTION_CANCEL',
      'BILLING_FAILURE',
      'QUOTA_EXCEEDED',
      'SERVICE_OUTAGE'
    ];

    return criticalEvents.some(event => eventType.includes(event));
  }

  /**
   * Get active compliance frameworks
   * @private
   * @returns {Array} Array of active compliance frameworks
   */
  #getActiveComplianceFrameworks() {
    const frameworks = [];

    if (this.#complianceTracker.frameworks.gdpr.enabled) frameworks.push('GDPR');
    if (this.#complianceTracker.frameworks.ccpa.enabled) frameworks.push('CCPA');
    if (this.#complianceTracker.frameworks.hipaa.enabled) frameworks.push('HIPAA');

    return frameworks;
  }

  /**
   * Log audit entry based on severity level
   * @private
   * @param {Object} auditEntry - Audit entry object
   */
  #logAuditEntryBySeverity(auditEntry) {
    const logData = {
      eventId: auditEntry.eventId,
      eventType: auditEntry.eventType,
      organizationId: auditEntry.organizationContext.organizationId,
      userId: auditEntry.user.id,
      severity: auditEntry.severity,
      category: auditEntry.category
    };

    switch (auditEntry.severity) {
      case 'critical':
        logger.error(`CRITICAL AUDIT EVENT: ${auditEntry.eventType}`, auditEntry);
        break;
      case 'high':
        logger.warn(`HIGH SEVERITY AUDIT: ${auditEntry.eventType}`, logData);
        break;
      case 'medium':
        logger.info(`AUDIT EVENT: ${auditEntry.eventType}`, logData);
        break;
      case 'low':
        logger.debug(`AUDIT EVENT: ${auditEntry.eventType}`, logData);
        break;
      default:
        logger.info(`AUDIT EVENT: ${auditEntry.eventType}`, logData);
    }
  }

  /**
   * Check if audit event should trigger an alert
   * @private
   * @param {string} eventType - Type of audit event
   * @returns {boolean} True if should trigger alert
   */
  #shouldTriggerAuditAlert(eventType) {
    const alertTriggerEvents = [
      'UNAUTHORIZED_TENANT_ACCESS',
      'ORGANIZATION_DELETE',
      'MULTIPLE_FAILED_LOGINS',
      'QUOTA_EXCEEDED',
      'COMPLIANCE_VIOLATION',
      'SUSPICIOUS_ACTIVITY'
    ];

    return alertTriggerEvents.includes(eventType);
  }

  /**
   * Trigger audit-related alert
   * @private
   * @param {Object} auditEntry - Audit entry object
   */
  #triggerAuditAlert(auditEntry) {
    this.#triggerAlert('audit_event', {
      eventType: auditEntry.eventType,
      severity: auditEntry.severity,
      organizationId: auditEntry.organizationContext.organizationId,
      userId: auditEntry.user.id,
      category: auditEntry.category,
      timestamp: auditEntry.timestamp
    });
  }

  /**
   * Update audit metrics
   * @private
   * @param {string} eventType - Type of audit event
   * @param {string} category - Event category
   */
  #updateAuditMetrics(eventType, category) {
    // Update counters (this would typically integrate with your metrics system)
    if (!this.#performanceMetrics.auditEvents) {
      this.#performanceMetrics.auditEvents = new Map();
    }

    const currentCount = this.#performanceMetrics.auditEvents.get(eventType) || 0;
    this.#performanceMetrics.auditEvents.set(eventType, currentCount + 1);
  }

  /**
   * Create performance monitoring middleware
   * @private
   * @returns {Function} Express middleware function
   */
  #createPerformanceMiddleware() {
    return (req, res, next) => {
      const startTime = process.hrtime();
      const startMemory = process.memoryUsage();

      res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds * 1e-6;
        const endMemory = process.memoryUsage();
        const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

        // Update system metrics
        this.#performanceMetrics.system.requestCount++;
        this.#performanceMetrics.system.totalResponseTime += duration;
        this.#performanceMetrics.system.averageResponseTime =
          this.#performanceMetrics.system.totalResponseTime / this.#performanceMetrics.system.requestCount;

        if (res.statusCode >= 400) {
          this.#performanceMetrics.system.errorCount++;
        }

        // Track organization-specific metrics
        if (req.organizationId) {
          this.#performanceMetrics.organizations.set(req.organizationId,
            (this.#performanceMetrics.organizations.get(req.organizationId) || 0) + 1
          );
        }

        // Check for performance alerts
        if (duration > this.#performanceMetrics.thresholds.slowRoute) {
          this.#triggerAlert('performance', {
            type: 'slow_route',
            duration,
            path: req.path,
            method: req.method,
            organizationId: req.organizationId
          });
        }
      });

      next();
    };
  }

  /**
   * Create audit logging middleware
   * @private
   * @returns {Function} Express middleware function
   */
  #createAuditMiddleware() {
    return (req, res, next) => {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        correlationId: req.correlationId,
        method: req.method,
        path: req.path,
        user: req.user?.id || 'anonymous',
        userRole: req.user?.role || 'none',
        organizationId: req.organizationId,
        tenantId: req.tenantId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        moduleContext: req.moduleContext?.module || 'unknown'
      };

      // Determine operation category and sensitivity
      const operation = this.#identifyOperation(req.path, req.method);
      const category = this.#determineAuditCategory(req.path);

      if (this.#auditLog.sensitiveOperations.has(operation)) {
        auditEntry.sensitive = true;
        auditEntry.operation = operation;
        auditEntry.category = category;

        // Store in appropriate event map
        switch (category) {
          case 'organization_management':
            this.#auditLog.businessEvents.set(req.requestId, auditEntry);
            break;
          case 'compliance_tracking':
            this.#auditLog.complianceEvents.set(req.requestId, auditEntry);
            break;
          case 'security_operations':
            this.#auditLog.securityEvents.set(req.requestId, auditEntry);
            break;
        }
      }

      res.on('finish', () => {
        auditEntry.statusCode = res.statusCode;
        auditEntry.responseTime = Date.now() - Date.parse(auditEntry.timestamp);

        // Add to audit log
        this.#auditLog.entries.push(auditEntry);

        // Rotate log if necessary
        if (this.#auditLog.entries.length > this.#auditLog.maxEntries) {
          this.#rotateAuditLog();
        }

        // Log critical events
        if (res.statusCode >= 400 || auditEntry.sensitive) {
          logger.audit('Organization Management Audit', auditEntry);
        }
      });

      next();
    };
  }

  /**
   * Create resource quota middleware
   * @private
   * @returns {Function} Express middleware function
   */
  #createQuotaMiddleware() {
    return async (req, res, next) => {
      if (!req.organizationId) {
        return next();
      }

      try {
        const quotaCheck = await this.#checkResourceQuota(req.organizationId, req.path, req.method);

        if (!quotaCheck.allowed) {
          this.#triggerAlert('quota_exceeded', {
            organizationId: req.organizationId,
            resource: quotaCheck.resource,
            usage: quotaCheck.usage,
            limit: quotaCheck.limit
          });

          return res.status(429).json(this.#responseFormatter.formatError(
            `Resource quota exceeded for ${quotaCheck.resource}`,
            429,
            {
              resource: quotaCheck.resource,
              usage: quotaCheck.usage,
              limit: quotaCheck.limit,
              resetTime: quotaCheck.resetTime
            }
          ));
        }

        req.quotaInfo = quotaCheck;
        next();
      } catch (error) {
        logger.error('Quota check failed', { error: error.message, organizationId: req.organizationId });
        next(); // Continue on quota check failure
      }
    };
  }

  /**
   * Create compliance middleware
   * @private
   * @returns {Function} Express middleware function
   */
  #createComplianceMiddleware() {
    return (req, res, next) => {
      // GDPR compliance checks
      if (this.#complianceTracker.frameworks.gdpr.enabled) {
        req.gdprContext = {
          dataProcessing: this.#identifyDataProcessing(req.path, req.body),
          lawfulBasis: this.#determineLawfulBasis(req.path),
          dataSubject: req.organizationId
        };
      }

      // CCPA compliance checks
      if (this.#complianceTracker.frameworks.ccpa.enabled) {
        req.ccpaContext = {
          personalInfoProcessing: this.#identifyPersonalInfo(req.body),
          optOutRights: true
        };
      }

      next();
    };
  }

  /**
   * Setup health check endpoints for monitoring service health.
   * 
   * @private
   */
  #setupHealthChecks() {
    // Main health check endpoint
    this.#router.get('/health', async (req, res) => {
      const health = await this.#performHealthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json(this.#responseFormatter.formatSuccess(
        health,
        `Organization management service is ${health.status}`
      ));
    });

    // Detailed health check endpoint
    this.#router.get('/health/detailed', async (req, res) => {
      const detailedHealth = await this.#performDetailedHealthCheck();
      const statusCode = detailedHealth.overallStatus === 'healthy' ? 200 : 503;

      res.status(statusCode).json(this.#responseFormatter.formatSuccess(
        detailedHealth,
        'Detailed health check completed'
      ));
    });

    // Organization-specific health
    this.#router.get('/health/organizations', async (req, res) => {
      const orgHealth = await this.#checkOrganizationHealth();
      res.json(this.#responseFormatter.formatSuccess(
        orgHealth,
        'Organization health check completed'
      ));
    });

    // Tenant health check
    this.#router.get('/health/tenants', async (req, res) => {
      const tenantHealth = await this.#checkTenantHealth();
      res.json(this.#responseFormatter.formatSuccess(
        tenantHealth,
        'Tenant health check completed'
      ));
    });

    // Subscription health check
    this.#router.get('/health/subscriptions', async (req, res) => {
      const subscriptionHealth = await this.#checkSubscriptionHealth();
      res.json(this.#responseFormatter.formatSuccess(
        subscriptionHealth,
        'Subscription health check completed'
      ));
    });

    // Liveness probe
    this.#router.get('/health/live', (req, res) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        multiTenant: this.#multiTenantManager.enabled
      });
    });

    // Readiness probe
    this.#router.get('/health/ready', async (req, res) => {
      const isReady = await this.#checkReadiness();
      const statusCode = isReady ? 200 : 503;

      res.status(statusCode).json({
        ready: isReady,
        timestamp: new Date().toISOString(),
        checks: await this.#getReadinessChecks()
      });
    });

    logger.debug('Health check endpoints configured for organization management');
  }

  /**
   * Setup metrics collection for monitoring and observability.
   * 
   * @private
   */
  #setupMetricsCollection() {
    if (!this.#config.enableMetrics) return;

    // General metrics endpoint
    this.#router.get('/metrics', (req, res) => {
      const metrics = this.#collectMetrics();
      res.json(this.#responseFormatter.formatSuccess(
        metrics,
        'Metrics collected successfully'
      ));
    });

    // Organization metrics
    this.#router.get('/metrics/organizations', (req, res) => {
      const orgMetrics = this.#collectOrganizationMetrics();
      res.json(this.#responseFormatter.formatSuccess(
        orgMetrics,
        'Organization metrics collected'
      ));
    });

    // Tenant metrics
    this.#router.get('/metrics/tenants', (req, res) => {
      const tenantMetrics = this.#collectTenantMetrics();
      res.json(this.#responseFormatter.formatSuccess(
        tenantMetrics,
        'Tenant metrics collected'
      ));
    });

    // Subscription metrics
    this.#router.get('/metrics/subscriptions', (req, res) => {
      const subscriptionMetrics = this.#collectSubscriptionMetrics();
      res.json(this.#responseFormatter.formatSuccess(
        subscriptionMetrics,
        'Subscription metrics collected'
      ));
    });

    // Business metrics
    this.#router.get('/metrics/business', (req, res) => {
      const businessMetrics = this.#collectBusinessMetrics();
      res.json(this.#responseFormatter.formatSuccess(
        businessMetrics,
        'Business metrics collected'
      ));
    });

    // Prometheus endpoint
    this.#router.get('/metrics/prometheus', (req, res) => {
      const prometheusMetrics = this.#formatMetricsForPrometheus();
      res.set('Content-Type', 'text/plain');
      res.send(prometheusMetrics);
    });

    logger.debug('Metrics collection endpoints configured');
  }

  /**
   * Generate comprehensive route documentation.
   * 
   * @private
   */
  #generateRouteDocumentation() {
    if (!this.#config.enableDocumentation) return;

    this.#router.get('/docs', (req, res) => {
      const documentation = this.#buildDocumentation();
      res.json(this.#responseFormatter.formatSuccess(
        documentation,
        'Route documentation generated successfully'
      ));
    });

    this.#router.get('/docs/openapi', (req, res) => {
      const openApiSpec = this.#generateOpenApiSpec();
      res.json(openApiSpec);
    });

    logger.debug('Route documentation endpoints configured');
  }

  // Additional helper methods and utilities

  /**
   * Generate unique request ID
   * @private
   * @returns {string} Generated request ID
   */
  #generateRequestId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `org-${timestamp}-${randomPart}`;
  }

  /**
   * Generate unique correlation ID
   * @private
   * @returns {string} Generated correlation ID
   */
  #generateCorrelationId() {
    return require('crypto').randomBytes(16).toString('hex');
  }

  /**
   * Validate tenant access permissions
   * @private
   * @param {string} organizationId - Organization ID
   * @param {string} tenantId - Tenant ID  
   * @param {Object} user - User object
   * @returns {boolean} Access granted
   */
  #validateTenantAccess(organizationId, tenantId, user) {
    if (!user || !organizationId || !tenantId) return false;

    // Super admin can access all tenants
    if (user.role === 'SUPER_ADMIN') return true;

    // Check if user belongs to the organization
    if (user.organizationId !== organizationId) return false;

    // Check if user has access to the specific tenant
    if (user.tenantIds && Array.isArray(user.tenantIds)) {
      return user.tenantIds.includes(tenantId);
    }

    // Default to organization-level access
    return user.organizationId === organizationId;
  }

  /**
   * Check resource quota for an organization
   * @private
   * @param {string} organizationId - Organization ID
   * @param {string} path - Request path
   * @param {string} method - HTTP method
   * @returns {Promise<Object>} Quota check result
   */
  async #checkResourceQuota(organizationId, path, method) {
    const quota = this.#resourceQuotaManager.quotas.get(organizationId) ||
      this.#multiTenantManager.defaultQuota;

    const usage = this.#resourceQuotaManager.usage.get(organizationId) || {};

    // Determine resource type from path
    let resourceType = 'requests';
    if (path.includes('/users')) resourceType = 'users';
    else if (path.includes('/storage')) resourceType = 'storage';
    else if (path.includes('/api')) resourceType = 'apiCalls';
    else if (path.includes('/projects')) resourceType = 'projects';

    const currentUsage = usage[resourceType] || 0;
    const limit = quota[resourceType] || Infinity;
    const allowed = currentUsage < limit;

    return {
      allowed,
      resource: resourceType,
      usage: currentUsage,
      limit,
      resetTime: this.#getQuotaResetTime()
    };
  }

  /**
   * Get quota reset time
   * @private
   * @returns {Date} Reset time
   */
  #getQuotaResetTime() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  /**
   * Identify data processing type for GDPR compliance
   * @private
   * @param {string} path - Request path
   * @param {Object} body - Request body
   * @returns {Array} Data processing activities
   */
  #identifyDataProcessing(path, body) {
    const activities = [];

    if (path.includes('/create') || path.includes('/register')) {
      activities.push('collection');
    }
    if (path.includes('/update') || path.includes('/modify')) {
      activities.push('update');
    }
    if (path.includes('/delete') || path.includes('/remove')) {
      activities.push('erasure');
    }
    if (path.includes('/export') || path.includes('/download')) {
      activities.push('transfer');
    }

    return activities;
  }

  /**
   * Determine lawful basis for data processing
   * @private
   * @param {string} path - Request path
   * @returns {string} Lawful basis
   */
  #determineLawfulBasis(path) {
    if (path.includes('/contract') || path.includes('/subscription')) {
      return 'contract';
    }
    if (path.includes('/compliance') || path.includes('/audit')) {
      return 'legal_obligation';
    }
    if (path.includes('/security') || path.includes('/fraud')) {
      return 'legitimate_interest';
    }
    return 'consent';
  }

  /**
   * Identify personal information in request
   * @private
   * @param {Object} body - Request body
   * @returns {Array} Personal info fields
   */
  #identifyPersonalInfo(body) {
    if (!body) return [];

    const personalFields = ['email', 'phone', 'name', 'address', 'ssn', 'dob'];
    return personalFields.filter(field => body[field]);
  }

  /**
   * Get the configured router instance with all routes mounted.
   * This is the main export method for integration with Express app.
   * 
   * @returns {express.Router} Configured Express router
   */
  getRouter() {
    if (!this.#initialized) {
      this.#finalize();
    }
    return this.#router;
  }

  /**
   * Finalize router configuration with error handling and cleanup.
   * 
   * @private
   */
  #finalize() {
    // Add 404 handler for unmatched routes
    this.#router.use((req, res) => {
      res.status(404).json(this.#responseFormatter.formatError(
        'Organization management route not found',
        404,
        {
          path: req.path,
          method: req.method,
          availableRoutes: Array.from(this.#routeRegistry.keys())
        }
      ));
    });

    // Add global error handler
    this.#router.use(errorHandler());

    this.#initialized = true;
    logger.info('Organization management routes finalized and ready');
  }

  /**
   * Get current route statistics for monitoring.
   * 
   * @returns {Object} Route statistics
   */
  getStatistics() {
    return this.#collectMetrics();
  }

  /**
   * Reset all metrics and statistics.
   */
  resetMetrics() {
    this.#routeRegistry.forEach(data => {
      data.requestCount = 0;
      data.errorCount = 0;
      data.averageResponseTime = 0;
      data.organizationOperations = 0;
      data.tenantOperations = 0;
      data.subscriptionOperations = 0;
      data.billingOperations = 0;
    });

    this.#metricsCollector.clear();
    logger.info('Organization management metrics reset successfully');
  }

  /**
   * Get current configuration for debugging or monitoring.
   * 
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return {
      ...this.#config,
      security: {
        authenticationRequired: this.#securityConfig.authentication.required,
        rateLimitingEnabled: this.#config.enableRateLimiting,
        multiTenant: this.#multiTenantManager.enabled
      }
    };
  }

  // Stub methods for comprehensive functionality
  #triggerAlert(type, details) {
    logger.warn(`Organization management alert: ${type}`, details);
  }

  #updatePerformanceMetrics(module, responseTime, statusCode, req) {
    // Implementation for performance tracking
  }

  #identifyOperation(path, method) {
    if (path.includes('/organizations') && method === 'POST') return 'organization_create';
    if (path.includes('/organizations') && method === 'DELETE') return 'organization_delete';
    if (path.includes('/tenants') && method === 'POST') return 'tenant_provision';
    if (path.includes('/subscriptions') && method === 'POST') return 'subscription_create';
    return 'general_operation';
  }

  #determineAuditCategory(path) {
    if (path.includes('/organizations')) return 'organization_management';
    if (path.includes('/tenants')) return 'tenant_management';
    if (path.includes('/subscriptions')) return 'subscription_management';
    if (path.includes('/billing')) return 'billing_operations';
    if (path.includes('/compliance')) return 'compliance_tracking';
    return 'general_operations';
  }

  #rotateAuditLog() {
    const entriesToArchive = this.#auditLog.entries.splice(0, 25000);
    logger.info('Audit log rotated', { archivedEntries: entriesToArchive.length });
  }

  #performHealthCheck() {
    return Promise.resolve({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      modules: Array.from(this.#routeRegistry.keys())
    });
  }

  #performDetailedHealthCheck() {
    return Promise.resolve({
      overallStatus: 'healthy',
      modules: Array.from(this.#routeRegistry.keys()),
      multiTenant: this.#multiTenantManager.enabled
    });
  }

  #checkOrganizationHealth() { return Promise.resolve({ healthy: true }); }
  #checkTenantHealth() { return Promise.resolve({ healthy: true }); }
  #checkSubscriptionHealth() { return Promise.resolve({ healthy: true }); }
  #checkReadiness() { return Promise.resolve(true); }
  #getReadinessChecks() { return Promise.resolve({}); }
  #collectMetrics() { return { routes: Array.from(this.#routeRegistry.keys()) }; }
  #collectOrganizationMetrics() { return { totalOrganizations: this.#performanceMetrics.organizations.size }; }
  #collectTenantMetrics() { return { totalTenants: this.#multiTenantManager.tenants.size }; }
  #collectSubscriptionMetrics() { return { totalSubscriptions: this.#subscriptionEngine.subscriptions.size }; }
  #collectBusinessMetrics() { return this.#performanceMetrics.businessMetrics; }
  #formatMetricsForPrometheus() { return '# Organization management metrics\n'; }
  #buildDocumentation() { return { routes: Array.from(this.#routeRegistry.keys()) }; }
  #generateOpenApiSpec() { return { openapi: '3.0.0', info: { title: 'Organization Management API' } }; }
}

/**
 * Create and export singleton instance of the routes manager
 */
const routesManager = new OrganizationManagementRoutesManager();

/**
 * Main export function that returns the configured router
 * This can be directly used in app.js
 * 
 * @returns {express.Router} Configured router with all organization management routes
 */
module.exports = routesManager.getRouter();

/**
 * Export the manager class for advanced usage and testing
 */
module.exports.OrganizationManagementRoutesManager = OrganizationManagementRoutesManager;

/**
 * Export the manager instance for access to utilities and configuration
 */
module.exports.routesManager = routesManager;

/**
 * Convenience exports for specific functionalities
 */
module.exports.getStatistics = () => routesManager.getStatistics();
module.exports.resetMetrics = () => routesManager.resetMetrics();
module.exports.getConfiguration = () => routesManager.getConfiguration();

/**
 * Export individual route modules for direct access if needed
 */
module.exports.routes = {
  organizations: organizationAdminRoutes,
  subscriptions: subscriptionManagementRoutes,
  settings: organizationSettingsRoutes,
  tenants: tenantManagementRoutes
};

/**
 * Module initialization logging
 */
logger.info('Organization Management Routes module initialized', {
  modules: Object.keys(module.exports.routes),
  featuresEnabled: Object.entries(routesManager.getConfiguration().featureFlags || {})
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature),
  multiTenant: routesManager.getConfiguration().multiTenant?.enabled
});