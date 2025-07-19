// shared/config/environment/development.js
/**
 * @file Development Environment Configuration
 * @description Development-specific settings and feature flags
 * @version 3.0.0
 */

/**
 * Development Environment Configuration Class
 * @class DevelopmentConfig
 */
class DevelopmentConfig {
  constructor() {
    this.current = 'development';
    this.isDevelopment = true;
    this.isProduction = false;
    this.isStaging = false;
    this.isTest = false;
    
    // Development environment settings
    this.settings = {
      name: 'Development',
      debug: true,
      logLevel: 'debug',
      errorStack: true,
      apiDocs: true,
      seedData: true,
      mockServices: true,
      hotReload: true,
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
        interceptAddress: 'dev@insightserenity.com'
      },
      payment: {
        sandbox: true,
        testMode: true
      },
      features: {
        debugPanel: true,
        apiExplorer: true,
        performanceMonitoring: false,
        errorTracking: false
      }
    };
    
    // Deployment information
    this.deployment = {
      version: process.env.APP_VERSION || '1.0.0-dev',
      commit: process.env.GIT_COMMIT || 'unknown',
      branch: process.env.GIT_BRANCH || 'development',
      buildNumber: process.env.BUILD_NUMBER || 'local',
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      deployedAt: process.env.DEPLOYED_AT || new Date().toISOString(),
      deployedBy: process.env.DEPLOYED_BY || 'developer'
    };
    
    // Development service URLs
    this.services = {
      api: this.getServiceUrl('API_URL', '/api'),
      web: this.getServiceUrl('WEB_URL', ''),
      cdn: this.getServiceUrl('CDN_URL', '/static'),
      websocket: this.getServiceUrl('WEBSOCKET_URL', '/ws'),
      recruitment: this.getServiceUrl('RECRUITMENT_URL', '/recruitment'),
      analytics: this.getServiceUrl('ANALYTICS_URL', '/analytics')
    };
    
    // External service endpoints (development)
    this.external = {
      sentry: {
        dsn: process.env.SENTRY_DSN,
        environment: this.current,
        enabled: false
      },
      cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'dev-cloud',
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET
      },
      googleAnalytics: {
        trackingId: process.env.GA_TRACKING_ID,
        enabled: false
      },
      intercom: {
        appId: process.env.INTERCOM_APP_ID,
        enabled: false
      },
      mixpanel: {
        token: process.env.MIXPANEL_TOKEN,
        enabled: false
      }
    };
    
    // Development feature flags
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
      
      // Beta features
      betaFeatures: this.getFeatureFlag('FEATURE_BETA', true),
      experimentalApi: this.getFeatureFlag('FEATURE_EXPERIMENTAL_API', true)
    };
    
    // Maintenance mode (disabled in development)
    this.maintenance = {
      enabled: false,
      message: process.env.MAINTENANCE_MESSAGE || 'Development environment under maintenance',
      allowedIPs: process.env.MAINTENANCE_ALLOWED_IPS?.split(',') || ['127.0.0.1', '::1'],
      estimatedEndTime: process.env.MAINTENANCE_END_TIME
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
    return false; // Always false in development
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
    // Development environment has minimal validation requirements
    const requiredEnvVars = [];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for development: ${missing.join(', ')}`);
    }
    
    return true;
  }
}

// Create and export singleton instance
module.exports = new DevelopmentConfig();