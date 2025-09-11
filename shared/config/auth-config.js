'use strict';

/**
 * @fileoverview Unified authentication service configuration
 * @module shared/config/auth-config
 * @description Comprehensive authentication configuration supporting both core and enterprise features
 * through feature flags and environment-based overrides
 */

const { loadEnvironmentConfig } = require('./base-config');

/**
 * Base authentication configuration with core and enterprise feature support
 */
const baseAuthConfig = {
  // ==================== CORE AUTHENTICATION SETTINGS ====================
  
  core: {
    // Session Management
    sessionDuration: parseInt(process.env.AUTH_SESSION_DURATION) || 86400000, // 24 hours
    refreshTokenDuration: parseInt(process.env.AUTH_REFRESH_TOKEN_DURATION) || 604800000, // 7 days
    allowMultipleSessions: process.env.AUTH_ALLOW_MULTIPLE_SESSIONS !== 'false',
    maxConcurrentSessions: parseInt(process.env.AUTH_MAX_CONCURRENT_SESSIONS) || 5,
    
    // Account Security
    maxLoginAttempts: parseInt(process.env.AUTH_MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.AUTH_LOCKOUT_DURATION) || 900000, // 15 minutes
    requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== 'false',
    
    // Token Configuration
    passwordResetTokenDuration: parseInt(process.env.AUTH_PASSWORD_RESET_DURATION) || 3600000, // 1 hour
    verificationTokenDuration: parseInt(process.env.AUTH_VERIFICATION_TOKEN_DURATION) || 86400000, // 24 hours
    
    // Application URLs
    appUrl: process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:3001'
  },

  // ==================== ENTERPRISE FEATURES ====================
  
  enterprise: {
    // Risk Assessment & Adaptive Security
    enableRiskAssessment: process.env.ENABLE_RISK_ASSESSMENT === 'true',
    enableAdvancedMFA: process.env.ENABLE_ADVANCED_MFA === 'true',
    enableDeviceManagement: process.env.ENABLE_DEVICE_MANAGEMENT === 'true',
    enableSecurityAlerts: process.env.ENABLE_SECURITY_ALERTS === 'true',
    enableAdvancedAudit: process.env.ENABLE_ADVANCED_AUDIT === 'true',
    
    // Single Sign-On
    enableSSO: process.env.ENABLE_SSO === 'true',
    enableSAML: process.env.ENABLE_SAML === 'true',
    enableOIDC: process.env.ENABLE_OIDC === 'true',
    
    // OAuth Providers
    enableOAuth: process.env.ENABLE_OAUTH === 'true',
    oauthProviders: (process.env.OAUTH_PROVIDERS || 'google,github').split(',').filter(Boolean),
    
    // Advanced Session Management
    enableSessionAnalytics: process.env.ENABLE_SESSION_ANALYTICS === 'true',
    enableGeolocationTracking: process.env.ENABLE_GEOLOCATION_TRACKING === 'true',
    enableDeviceFingerprinting: process.env.ENABLE_DEVICE_FINGERPRINTING === 'true'
  },

  // ==================== FEATURE FLAGS ====================
  
  features: {
    // Core Features
    registration: process.env.FEATURE_REGISTRATION !== 'false',
    passwordReset: process.env.FEATURE_PASSWORD_RESET !== 'false',
    emailVerification: process.env.FEATURE_EMAIL_VERIFICATION !== 'false',
    basicMFA: process.env.FEATURE_BASIC_MFA !== 'false',
    
    // Enterprise Features
    riskAssessment: process.env.FEATURE_RISK_ASSESSMENT === 'true',
    advancedMFA: process.env.FEATURE_ADVANCED_MFA === 'true',
    oauth: process.env.FEATURE_OAUTH === 'true',
    sso: process.env.FEATURE_SSO === 'true',
    deviceTrust: process.env.FEATURE_DEVICE_TRUST === 'true',
    securityAnalytics: process.env.FEATURE_SECURITY_ANALYTICS === 'true',
    complianceReporting: process.env.FEATURE_COMPLIANCE_REPORTING === 'true',
    
    // Biometric Authentication
    biometric: process.env.FEATURE_BIOMETRIC === 'true',
    webauthn: process.env.FEATURE_WEBAUTHN === 'true',
    faceId: process.env.FEATURE_FACE_ID === 'true',
    touchId: process.env.FEATURE_TOUCH_ID === 'true'
  },

  // ==================== PASSWORD POLICY ====================
  
  passwordPolicy: {
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 12,
    maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
    requireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
    preventReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE) || 5,
    expiryDays: parseInt(process.env.PASSWORD_EXPIRY_DAYS) || 0, // 0 = never expires
    complexityChecking: process.env.PASSWORD_COMPLEXITY_CHECKING !== 'false',
    dictionaryCheck: process.env.PASSWORD_DICTIONARY_CHECK === 'true',
    compromisedCheck: process.env.PASSWORD_COMPROMISED_CHECK === 'true'
  },

  // ==================== MFA CONFIGURATION ====================
  
  mfa: {
    // Core MFA Settings
    require2FA: process.env.MFA_REQUIRE_2FA === 'true',
    defaultMethod: process.env.MFA_DEFAULT_METHOD || 'totp',
    codeExpiry: parseInt(process.env.MFA_CODE_EXPIRY) || 300000, // 5 minutes
    maxAttempts: parseInt(process.env.MFA_MAX_ATTEMPTS) || 3,
    
    // Available Methods
    availableMethods: {
      totp: process.env.MFA_ENABLE_TOTP !== 'false',
      sms: process.env.MFA_ENABLE_SMS === 'true',
      email: process.env.MFA_ENABLE_EMAIL === 'true',
      push: process.env.MFA_ENABLE_PUSH === 'true',
      webauthn: process.env.MFA_ENABLE_WEBAUTHN === 'true',
      backup_codes: process.env.MFA_ENABLE_BACKUP_CODES !== 'false'
    },
    
    // TOTP Configuration
    totp: {
      issuer: process.env.MFA_TOTP_ISSUER || 'InsightSerenity Platform',
      algorithm: process.env.MFA_TOTP_ALGORITHM || 'SHA1',
      digits: parseInt(process.env.MFA_TOTP_DIGITS) || 6,
      period: parseInt(process.env.MFA_TOTP_PERIOD) || 30,
      window: parseInt(process.env.MFA_TOTP_WINDOW) || 2
    },
    
    // Backup Codes
    backupCodes: {
      count: parseInt(process.env.MFA_BACKUP_CODES_COUNT) || 10,
      length: parseInt(process.env.MFA_BACKUP_CODES_LENGTH) || 8,
      regenerateThreshold: parseInt(process.env.MFA_BACKUP_CODES_REGEN_THRESHOLD) || 3
    },
    
    // Device Trust
    deviceTrust: {
      enabled: process.env.MFA_DEVICE_TRUST_ENABLED === 'true',
      duration: parseInt(process.env.MFA_DEVICE_TRUST_DURATION) || 2592000000, // 30 days
      maxDevices: parseInt(process.env.MFA_MAX_TRUSTED_DEVICES) || 10
    }
  },

  // ==================== OAUTH PROVIDERS ====================
  
  oauth: {
    // Google OAuth
    google: {
      enabled: process.env.OAUTH_GOOGLE_ENABLED === 'true',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
      scope: process.env.GOOGLE_SCOPE || 'openid email profile',
      allowRegistration: process.env.GOOGLE_ALLOW_REGISTRATION !== 'false',
      allowLinking: process.env.GOOGLE_ALLOW_LINKING !== 'false'
    },
    
    // GitHub OAuth
    github: {
      enabled: process.env.OAUTH_GITHUB_ENABLED === 'true',
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: process.env.GITHUB_REDIRECT_URI,
      scope: process.env.GITHUB_SCOPE || 'user:email',
      allowRegistration: process.env.GITHUB_ALLOW_REGISTRATION !== 'false',
      allowLinking: process.env.GITHUB_ALLOW_LINKING !== 'false'
    },
    
    // LinkedIn OAuth
    linkedin: {
      enabled: process.env.OAUTH_LINKEDIN_ENABLED === 'true',
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      redirectUri: process.env.LINKEDIN_REDIRECT_URI,
      scope: process.env.LINKEDIN_SCOPE || 'r_liteprofile r_emailaddress',
      allowRegistration: process.env.LINKEDIN_ALLOW_REGISTRATION !== 'false',
      allowLinking: process.env.LINKEDIN_ALLOW_LINKING !== 'false'
    },
    
    // Microsoft OAuth
    microsoft: {
      enabled: process.env.OAUTH_MICROSOFT_ENABLED === 'true',
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI,
      scope: process.env.MICROSOFT_SCOPE || 'openid email profile',
      allowRegistration: process.env.MICROSOFT_ALLOW_REGISTRATION !== 'false',
      allowLinking: process.env.MICROSOFT_ALLOW_LINKING !== 'false'
    }
  },

  // ==================== SSO CONFIGURATION ====================
  
  sso: {
    // SAML Configuration
    saml: {
      enabled: process.env.SSO_SAML_ENABLED === 'true',
      entityId: process.env.SAML_ENTITY_ID,
      ssoUrl: process.env.SAML_SSO_URL,
      sloUrl: process.env.SAML_SLO_URL,
      certificate: process.env.SAML_CERTIFICATE,
      privateKey: process.env.SAML_PRIVATE_KEY,
      allowProvisioning: process.env.SAML_ALLOW_PROVISIONING === 'true',
      roleMapping: process.env.SAML_ROLE_MAPPING === 'true',
      attributeMapping: {
        email: process.env.SAML_ATTR_EMAIL || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        firstName: process.env.SAML_ATTR_FIRST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        lastName: process.env.SAML_ATTR_LAST_NAME || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
        groups: process.env.SAML_ATTR_GROUPS || 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
        roles: process.env.SAML_ATTR_ROLES || 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
      }
    },
    
    // OIDC Configuration
    oidc: {
      enabled: process.env.SSO_OIDC_ENABLED === 'true',
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      redirectUri: process.env.OIDC_REDIRECT_URI,
      allowProvisioning: process.env.OIDC_ALLOW_PROVISIONING === 'true',
      roleMapping: process.env.OIDC_ROLE_MAPPING === 'true'
    }
  },

  // ==================== REGISTRATION SETTINGS ====================
  
  registration: {
    enabled: process.env.REGISTRATION_ENABLED !== 'false',
    requireInvitation: process.env.REGISTRATION_REQUIRE_INVITATION === 'true',
    allowPublicRegistration: process.env.REGISTRATION_ALLOW_PUBLIC !== 'false',
    defaultRole: process.env.REGISTRATION_DEFAULT_ROLE || 'user',
    autoActivate: process.env.REGISTRATION_AUTO_ACTIVATE !== 'false',
    domainWhitelist: process.env.REGISTRATION_DOMAIN_WHITELIST ? 
      process.env.REGISTRATION_DOMAIN_WHITELIST.split(',') : [],
    domainBlacklist: process.env.REGISTRATION_DOMAIN_BLACKLIST ? 
      process.env.REGISTRATION_DOMAIN_BLACKLIST.split(',') : [],
    requireOrganization: process.env.REGISTRATION_REQUIRE_ORGANIZATION === 'true'
  },

  // ==================== SECURITY SETTINGS ====================
  
  security: {
    // IP Restrictions
    ipWhitelist: process.env.AUTH_IP_WHITELIST ? 
      process.env.AUTH_IP_WHITELIST.split(',') : [],
    ipBlacklist: process.env.AUTH_IP_BLACKLIST ? 
      process.env.AUTH_IP_BLACKLIST.split(',') : [],
    
    // Rate Limiting
    enableRateLimiting: process.env.AUTH_ENABLE_RATE_LIMITING !== 'false',
    rateLimitWindow: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
    rateLimitMaxAttempts: parseInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS) || 100,
    
    // Audit Logging
    enableAuditLog: process.env.AUTH_ENABLE_AUDIT_LOG !== 'false',
    auditRetentionDays: parseInt(process.env.AUTH_AUDIT_RETENTION_DAYS) || 90,
    
    // Risk Assessment Thresholds
    riskThresholds: {
      low: parseInt(process.env.RISK_THRESHOLD_LOW) || 20,
      medium: parseInt(process.env.RISK_THRESHOLD_MEDIUM) || 40,
      high: parseInt(process.env.RISK_THRESHOLD_HIGH) || 60,
      critical: parseInt(process.env.RISK_THRESHOLD_CRITICAL) || 80
    },
    
    // Security Headers
    enableSecurityHeaders: process.env.AUTH_ENABLE_SECURITY_HEADERS !== 'false',
    enableCSRF: process.env.AUTH_ENABLE_CSRF !== 'false',
    enableCORS: process.env.AUTH_ENABLE_CORS !== 'false',
    
    // Encryption
    encryptionAlgorithm: process.env.AUTH_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    hashingAlgorithm: process.env.AUTH_HASHING_ALGORITHM || 'argon2id',
    saltRounds: parseInt(process.env.AUTH_SALT_ROUNDS) || 12
  },

  // ==================== BIOMETRIC CONFIGURATION ====================
  
  biometric: {
    enabled: process.env.BIOMETRIC_ENABLED === 'true',
    timeout: parseInt(process.env.BIOMETRIC_TIMEOUT) || 60000, // 1 minute
    allowFallback: process.env.BIOMETRIC_ALLOW_FALLBACK !== 'false',
    requireLiveness: process.env.BIOMETRIC_REQUIRE_LIVENESS === 'true',
    
    // WebAuthn Settings
    webauthn: {
      enabled: process.env.WEBAUTHN_ENABLED === 'true',
      rpName: process.env.WEBAUTHN_RP_NAME || 'InsightSerenity Platform',
      rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
      timeout: parseInt(process.env.WEBAUTHN_TIMEOUT) || 60000,
      attestation: process.env.WEBAUTHN_ATTESTATION || 'direct',
      userVerification: process.env.WEBAUTHN_USER_VERIFICATION || 'preferred',
      authenticatorAttachment: process.env.WEBAUTHN_AUTHENTICATOR_ATTACHMENT || 'cross-platform'
    }
  },

  // ==================== NOTIFICATION SETTINGS ====================
  
  notifications: {
    // Email Notifications
    email: {
      welcomeEmail: process.env.EMAIL_WELCOME_ENABLED !== 'false',
      verificationEmail: process.env.EMAIL_VERIFICATION_ENABLED !== 'false',
      passwordResetEmail: process.env.EMAIL_PASSWORD_RESET_ENABLED !== 'false',
      securityAlerts: process.env.EMAIL_SECURITY_ALERTS_ENABLED === 'true',
      mfaAlerts: process.env.EMAIL_MFA_ALERTS_ENABLED === 'true',
      loginAlerts: process.env.EMAIL_LOGIN_ALERTS_ENABLED === 'true'
    },
    
    // Push Notifications
    push: {
      enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
      securityAlerts: process.env.PUSH_SECURITY_ALERTS_ENABLED === 'true',
      mfaRequests: process.env.PUSH_MFA_REQUESTS_ENABLED === 'true'
    },
    
    // SMS Notifications
    sms: {
      enabled: process.env.SMS_NOTIFICATIONS_ENABLED === 'true',
      provider: process.env.SMS_PROVIDER || 'twilio',
      mfaCodes: process.env.SMS_MFA_CODES_ENABLED === 'true',
      securityAlerts: process.env.SMS_SECURITY_ALERTS_ENABLED === 'true'
    }
  },

  // ==================== COMPLIANCE SETTINGS ====================
  
  compliance: {
    // GDPR Compliance
    gdpr: {
      enabled: process.env.COMPLIANCE_GDPR_ENABLED === 'true',
      dataRetentionDays: parseInt(process.env.GDPR_DATA_RETENTION_DAYS) || 2555, // 7 years
      rightToErasure: process.env.GDPR_RIGHT_TO_ERASURE === 'true',
      dataPortability: process.env.GDPR_DATA_PORTABILITY === 'true',
      consentTracking: process.env.GDPR_CONSENT_TRACKING === 'true'
    },
    
    // HIPAA Compliance
    hipaa: {
      enabled: process.env.COMPLIANCE_HIPAA_ENABLED === 'true',
      auditLogging: process.env.HIPAA_AUDIT_LOGGING === 'true',
      accessControls: process.env.HIPAA_ACCESS_CONTROLS === 'true',
      dataEncryption: process.env.HIPAA_DATA_ENCRYPTION === 'true'
    },
    
    // SOX Compliance
    sox: {
      enabled: process.env.COMPLIANCE_SOX_ENABLED === 'true',
      auditTrails: process.env.SOX_AUDIT_TRAILS === 'true',
      accessReviews: process.env.SOX_ACCESS_REVIEWS === 'true',
      controlTesting: process.env.SOX_CONTROL_TESTING === 'true'
    }
  },

  // ==================== API INTEGRATION SETTINGS ====================
  
  integrations: {
    // Threat Intelligence
    threatIntelligence: {
      enabled: process.env.THREAT_INTELLIGENCE_ENABLED === 'true',
      provider: process.env.THREAT_INTELLIGENCE_PROVIDER || 'internal',
      apiKey: process.env.THREAT_INTELLIGENCE_API_KEY,
      checkInterval: parseInt(process.env.THREAT_INTELLIGENCE_CHECK_INTERVAL) || 86400000 // 24 hours
    },
    
    // GeoIP Services
    geoip: {
      enabled: process.env.GEOIP_ENABLED === 'true',
      provider: process.env.GEOIP_PROVIDER || 'maxmind',
      apiKey: process.env.GEOIP_API_KEY,
      databasePath: process.env.GEOIP_DATABASE_PATH
    },
    
    // External Directory Services
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

/**
 * Environment-specific configuration overrides
 */
const environmentOverrides = {
  development: {
    core: {
      sessionDuration: 3600000, // 1 hour for development
      requireEmailVerification: false
    },
    security: {
      enableRateLimiting: false,
      riskThresholds: {
        low: 30,
        medium: 50,
        high: 70,
        critical: 90
      }
    },
    passwordPolicy: {
      minLength: 8,
      requireUppercase: false,
      requireSpecial: false
    }
  },
  
  testing: {
    core: {
      sessionDuration: 300000, // 5 minutes for testing
      requireEmailVerification: false,
      maxLoginAttempts: 10
    },
    security: {
      enableRateLimiting: false,
      enableAuditLog: false
    },
    mfa: {
      require2FA: false,
      codeExpiry: 600000 // 10 minutes for testing
    }
  },
  
  staging: {
    enterprise: {
      enableRiskAssessment: true,
      enableAdvancedMFA: true,
      enableSecurityAlerts: true
    },
    features: {
      riskAssessment: true,
      advancedMFA: true,
      securityAnalytics: true
    }
  },
  
  production: {
    core: {
      requireEmailVerification: true
    },
    enterprise: {
      enableRiskAssessment: true,
      enableAdvancedMFA: true,
      enableDeviceManagement: true,
      enableSecurityAlerts: true,
      enableAdvancedAudit: true
    },
    features: {
      riskAssessment: true,
      advancedMFA: true,
      oauth: true,
      sso: true,
      deviceTrust: true,
      securityAnalytics: true,
      complianceReporting: true,
      biometric: true,
      webauthn: true
    },
    mfa: {
      require2FA: true
    },
    security: {
      enableAuditLog: true,
      enableSecurityHeaders: true,
      enableCSRF: true
    },
    compliance: {
      gdpr: { enabled: true },
      hipaa: { enabled: true },
      sox: { enabled: true }
    }
  }
};

/**
 * Load and merge configuration based on environment
 */
function loadAuthConfig() {
  const environment = process.env.NODE_ENV || 'development';
  const envOverrides = environmentOverrides[environment] || {};
  
  // Deep merge base configuration with environment overrides
  return mergeDeep(baseAuthConfig, envOverrides);
}

/**
 * Deep merge utility function
 */
function mergeDeep(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Configuration validation
 */
function validateAuthConfig(config) {
  const errors = [];
  
  // Validate required OAuth settings if enabled
  if (config.features.oauth) {
    Object.keys(config.oauth).forEach(provider => {
      const providerConfig = config.oauth[provider];
      if (providerConfig.enabled) {
        if (!providerConfig.clientId) {
          errors.push(`OAuth ${provider}: clientId is required`);
        }
        if (!providerConfig.clientSecret) {
          errors.push(`OAuth ${provider}: clientSecret is required`);
        }
      }
    });
  }
  
  // Validate SSO settings if enabled
  if (config.features.sso) {
    if (config.sso.saml.enabled && !config.sso.saml.certificate) {
      errors.push('SAML SSO: certificate is required');
    }
    if (config.sso.oidc.enabled && !config.sso.oidc.issuer) {
      errors.push('OIDC SSO: issuer is required');
    }
  }
  
  // Validate password policy
  if (config.passwordPolicy.minLength < 8) {
    errors.push('Password policy: minimum length should be at least 8 characters');
  }
  
  if (errors.length > 0) {
    throw new Error(`Authentication configuration validation failed:\n${errors.join('\n')}`);
  }
  
  return true;
}

// Load configuration
const authConfig = loadAuthConfig();

// Validate configuration in non-test environments
if (process.env.NODE_ENV !== 'testing') {
  validateAuthConfig(authConfig);
}

module.exports = authConfig;