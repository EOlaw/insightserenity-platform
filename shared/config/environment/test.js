// shared/config/environment/test.js
/**
 * @file Test Environment Configuration
 * @description Test-specific settings and feature flags
 * @version 3.0.0
 */

/**
 * Test Environment Configuration Class
 * @class TestConfig
 */
class TestConfig {
  constructor() {
    this.current = 'test';
    this.isDevelopment = false;
    this.isProduction = false;
    this.isStaging = false;
    this.isTest = true;
    
    // Test environment settings
    this.settings = {
      name: 'Test',
      debug: false,
      logLevel: 'error',
      errorStack: true,
      apiDocs: false,
      seedData: true,
      mockServices: true,
      hotReload: false,
      sourceMap: true,
      cors: {
        origin: true,
        credentials: true
      },
      cache: {
        enabled: false,
        duration: 0
      },
      email: {
        sandbox: true,
        interceptAddress: 'test@insightserenity.com'
      },
      payment: {
        sandbox: true,
        testMode: true
      },
      features: {
        debugPanel: false,
        apiExplorer: false,
        performanceMonitoring: false,
        errorTracking: false
      }
    };
    
    // Deployment information
    this.deployment = {
      version: process.env.APP_VERSION || '1.0.0-test',
      commit: process.env.GIT_COMMIT || 'test-commit',
      branch: process.env.GIT_BRANCH || 'test',
      buildNumber: process.env.BUILD_NUMBER || 'test-build',
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      deployedAt: process.env.DEPLOYED_AT || new Date().toISOString(),
      deployedBy: process.env.DEPLOYED_BY || 'test-runner'
    };
    
    // Test service URLs
    this.services = {
      api: this.getServiceUrl('API_URL', '/api'),
      web: this.getServiceUrl('WEB_URL', ''),
      cdn: this.getServiceUrl('CDN_URL', '/static'),
      websocket: this.getServiceUrl('WEBSOCKET_URL', '/ws'),
      recruitment: this.getServiceUrl('RECRUITMENT_URL', '/recruitment'),
      analytics: this.getServiceUrl('ANALYTICS_URL', '/analytics')
    };
    
    // External service endpoints (test - all disabled or mocked)
    this.external = {
      sentry: {
        dsn: process.env.SENTRY_DSN,
        environment: this.current,
        enabled: false
      },
      cloudinary: {
        cloudName: 'test-cloud',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret'
      },
      googleAnalytics: {
        trackingId: 'UA-TEST-1',
        enabled: false
      },
      intercom: {
        appId: 'test-app-id',
        enabled: false
      },
      mixpanel: {
        token: 'test-token',
        enabled: false
      }
    };
    
    // Test feature flags (all enabled for comprehensive testing)
    this.features = {
      // Authentication features
      socialLogin: this.getFeatureFlag('FEATURE_SOCIAL_LOGIN', true),
      twoFactorAuth: this.getFeatureFlag('FEATURE_2FA', true),
      passwordlessLogin: this.getFeatureFlag('FEATURE_PASSWORDLESS', true),
      biometricAuth: this.getFeatureFlag('FEATURE_BIOMETRIC', true),
      
      // Platform features
      multiTenancy: this.getFeatureFlag('FEATURE_MULTI_TENANCY', true),
      customDomains: this.getFeatureFlag('FEATURE_CUSTOM_DOMAINS', true),
      whiteLabeling: this.getFeatureFlag('FEATURE_WHITE_LABEL', true),
      apiAccess: this.getFeatureFlag('FEATURE_API_ACCESS', true),
      
      // Recruitment features
      recruitmentModule: this.getFeatureFlag('FEATURE_RECRUITMENT', true),
      candidateMatching: this.getFeatureFlag('FEATURE_CANDIDATE_MATCHING', true),
      aiScreening: this.getFeatureFlag('FEATURE_AI_SCREENING', true),
      videoInterviews: this.getFeatureFlag('FEATURE_VIDEO_INTERVIEWS', true),
      
      // Billing features
      subscriptions: this.getFeatureFlag('FEATURE_SUBSCRIPTIONS', true),
      usageBasedBilling: this.getFeatureFlag('FEATURE_USAGE_BILLING', true),
      multiCurrency: this.getFeatureFlag('FEATURE_MULTI_CURRENCY', true),
      invoicing: this.getFeatureFlag('FEATURE_INVOICING', true),
      
      // Communication features
      inAppMessaging: this.getFeatureFlag('FEATURE_IN_APP_MESSAGING', true),
      emailNotifications: this.getFeatureFlag('FEATURE_EMAIL_NOTIFICATIONS', true),
      smsNotifications: this.getFeatureFlag('FEATURE_SMS_NOTIFICATIONS', true),
      pushNotifications: this.getFeatureFlag('FEATURE_PUSH_NOTIFICATIONS', true),
      
      // Analytics features
      advancedAnalytics: this.getFeatureFlag('FEATURE_ADVANCED_ANALYTICS', true),
      customReports: this.getFeatureFlag('FEATURE_CUSTOM_REPORTS', true),
      dataExport: this.getFeatureFlag('FEATURE_DATA_EXPORT', true),
      realTimeMetrics: this.getFeatureFlag('FEATURE_REAL_TIME_METRICS', true),
      
      // Beta features (enabled for testing)
      betaFeatures: this.getFeatureFlag('FEATURE_BETA', true),
      experimentalApi: this.getFeatureFlag('FEATURE_EXPERIMENTAL_API', true)
    };
    
    // Maintenance mode (always disabled in test)
    this.maintenance = {
      enabled: false,
      message: 'Test environment maintenance',
      allowedIPs: ['127.0.0.1', '::1'],
      estimatedEndTime: null
    };
  }
  
  /**
   * Get current environment settings
   * @returns {Object} Environment settings
   */
  get() {
    return this.settings;
  }
  
  /**
   * Get specific setting for current environment
   * @param {string} key - Setting key
   * @returns {any} Setting value
   */
  getSetting(key) {
    const settings = this.get();
    return key.split('.').reduce((obj, k) => obj?.[k], settings);
  }
  
  /**
   * Get service URL based on environment
   * @param {string} envVar - Environment variable name
   * @param {string} defaultPath - Default path
   * @returns {string} Service URL
   */
  getServiceUrl(envVar, defaultPath) {
    const baseUrl = process.env[envVar] || process.env.APP_URL || 'http://localhost:3000';
    return `${baseUrl}${defaultPath}`;
  }
  
  /**
   * Get feature flag value
   * @param {string} flag - Feature flag name
   * @param {boolean} defaultValue - Default value
   * @returns {boolean} Feature flag value
   */
  getFeatureFlag(flag, defaultValue = false) {
    // In test environment, check for test-specific overrides first
    const testOverride = process.env[`TEST_${flag}`];
    if (testOverride !== undefined) {
      return testOverride === 'true';
    }
    
    const value = process.env[flag];
    if (value === undefined) return defaultValue;
    return value === 'true';
  }
  
  /**
   * Check if feature is enabled
   * @param {string} feature - Feature name
   * @returns {boolean} Whether feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.features[feature] === true;
  }
  
  /**
   * Check if in maintenance mode
   * @param {string} ip - Client IP address
   * @returns {boolean} Whether in maintenance mode
   */
  isInMaintenance(ip = null) {
    return false; // Always false in test environment
  }
  
  /**
   * Get environment info for health checks
   * @returns {Object} Environment information
   */
  getInfo() {
    return {
      environment: this.current,
      name: this.settings.name,
      version: this.deployment.version,
      commit: this.deployment.commit,
      branch: this.deployment.branch,
      buildNumber: this.deployment.buildNumber,
      buildDate: this.deployment.buildDate,
      features: Object.keys(this.features).filter(f => this.features[f]),
      maintenance: this.maintenance.enabled
    };
  }
  
  /**
   * Validate environment configuration
   * @throws {Error} If configuration is invalid
   */
  validate() {
    // Test environment has minimal validation requirements
    const requiredEnvVars = [];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for test: ${missing.join(', ')}`);
    }
    
    return true;
  }
  
  /**
   * Reset configuration for test isolation
   * @description Resets configuration state between tests
   */
  reset() {
    // Reset feature flags to defaults
    Object.keys(this.features).forEach(feature => {
      this.features[feature] = this.getFeatureFlag(`FEATURE_${feature.toUpperCase()}`, true);
    });
    
    // Reset maintenance mode
    this.maintenance.enabled = false;
    
    return this;
  }
  
  /**
   * Override feature flag for testing
   * @param {string} feature - Feature name
   * @param {boolean} enabled - Whether feature is enabled
   */
  setFeature(feature, enabled) {
    if (this.features.hasOwnProperty(feature)) {
      this.features[feature] = enabled;
    }
    return this;
  }
  
  /**
   * Enable maintenance mode for testing
   * @param {Object} options - Maintenance options
   */
  enableMaintenance(options = {}) {
    this.maintenance = {
      enabled: true,
      message: options.message || 'Test maintenance mode',
      allowedIPs: options.allowedIPs || ['127.0.0.1', '::1'],
      estimatedEndTime: options.estimatedEndTime || null
    };
    return this;
  }
  
  /**
   * Disable maintenance mode for testing
   */
  disableMaintenance() {
    this.maintenance.enabled = false;
    return this;
  }
}

// Create and export singleton instance
module.exports = new TestConfig();