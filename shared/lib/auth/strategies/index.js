'use strict';

/**
 * @fileoverview Authentication strategies module exports with AuthStrategiesManager class
 * @module shared/lib/auth/strategies/index
 * @description Exports all authentication strategies for the platform with class-based manager
 */

const jwtStrategy = require('./jwt-strategy');
const localStrategy = require('./local-strategy');
const oauthStrategy = require('./oauth-strategy');
const githubStrategy = require('./github-strategy');
const googleStrategy = require('./google-strategy');
const linkedinStrategy = require('./linkedin-strategy');
const passkeyStrategy = require('./passkey-strategy');
const organizationStrategy = require('./organization-strategy');

// Import strategy classes for advanced usage
const { JWTAuthStrategy } = require('./jwt-strategy');
const { LocalAuthStrategy } = require('./local-strategy');
const BaseOAuthStrategy = require('./oauth-strategy');
const { GitHubAuthStrategy } = require('./github-strategy');
const { GoogleAuthStrategy } = require('./google-strategy');
const { LinkedInAuthStrategy } = require('./linkedin-strategy');
const { PasskeyAuthStrategy } = require('./passkey-strategy');
const { OrganizationAuthStrategy } = require('./organization-strategy');

/**
 * Strategy factory functions
 * These return configured Passport strategies ready for use
 */
const strategies = {
  /**
   * Creates JWT authentication strategy
   * @param {Object} [config] - JWT strategy configuration
   * @returns {JwtStrategy} Configured JWT strategy
   */
  jwt: jwtStrategy,

  /**
   * Creates local authentication strategy
   * @param {Object} [config] - Local strategy configuration
   * @returns {LocalStrategy} Configured local strategy
   */
  local: localStrategy,

  /**
   * Creates GitHub OAuth strategy
   * @param {Object} [config] - GitHub strategy configuration
   * @returns {GitHubStrategy} Configured GitHub strategy
   */
  github: githubStrategy,

  /**
   * Creates Google OAuth strategy
   * @param {Object} [config] - Google strategy configuration
   * @returns {GoogleStrategy} Configured Google strategy
   */
  google: googleStrategy,

  /**
   * Creates LinkedIn OAuth strategy
   * @param {Object} [config] - LinkedIn strategy configuration
   * @returns {LinkedInStrategy} Configured LinkedIn strategy
   */
  linkedin: linkedinStrategy,

  /**
   * Creates Passkey (WebAuthn) strategy
   * @param {Object} [config] - Passkey strategy configuration
   * @returns {PasskeyStrategy} Configured passkey strategy
   */
  passkey: passkeyStrategy,

  /**
   * Creates organization-based authentication strategy
   * @param {Object} [config] - Organization strategy configuration
   * @returns {OrganizationStrategy} Configured organization strategy
   */
  organization: organizationStrategy
};

/**
 * Strategy classes for advanced usage and extension
 */
const StrategyClasses = {
  JWTAuthStrategy,
  LocalAuthStrategy,
  BaseOAuthStrategy,
  GitHubAuthStrategy,
  GoogleAuthStrategy,
  LinkedInAuthStrategy,
  PasskeyAuthStrategy,
  OrganizationAuthStrategy
};

/**
 * Registers all strategies with Passport
 * @param {Object} passport - Passport instance
 * @param {Object} [config] - Configuration for all strategies
 * @param {Object} [strategyConfig] - Individual strategy configurations
 */
function registerAllStrategies(passport, config = {}, strategyConfig = {}) {
  // Register JWT strategy
  if (config.jwt !== false) {
    passport.use('jwt', strategies.jwt(strategyConfig.jwt || config.jwt));
  }

  // Register local strategy
  if (config.local !== false) {
    passport.use('local', strategies.local(strategyConfig.local || config.local));
  }

  // Register OAuth strategies
  if (config.oauth !== false) {
    // GitHub
    if (config.github !== false && (process.env.GITHUB_CLIENT_ID || strategyConfig.github?.clientID)) {
      passport.use('github', strategies.github(strategyConfig.github || config.github));
    }

    // Google
    if (config.google !== false && (process.env.GOOGLE_CLIENT_ID || strategyConfig.google?.clientID)) {
      passport.use('google', strategies.google(strategyConfig.google || config.google));
    }

    // LinkedIn
    if (config.linkedin !== false && (process.env.LINKEDIN_CLIENT_ID || strategyConfig.linkedin?.clientID)) {
      passport.use('linkedin', strategies.linkedin(strategyConfig.linkedin || config.linkedin));
    }
  }

  // Register passkey strategy
  if (config.passkey !== false) {
    passport.use('passkey', strategies.passkey(strategyConfig.passkey || config.passkey));
  }

  // Register organization strategy
  if (config.organization !== false) {
    passport.use('organization', strategies.organization(strategyConfig.organization || config.organization));
  }

  return passport;
}

/**
 * Creates a custom OAuth strategy
 * @param {string} provider - OAuth provider name
 * @param {Object} config - OAuth configuration
 * @returns {BaseOAuthStrategy} Configured OAuth strategy
 */
function createCustomOAuthStrategy(provider, config) {
  const customConfig = {
    ...config,
    provider
  };

  const strategy = new BaseOAuthStrategy(customConfig);
  return strategy.getStrategy(config.oauth);
}

/**
 * Strategy configuration helpers
 */
const helpers = {
  /**
   * Gets default configuration for a strategy
   * @param {string} strategyName - Strategy name
   * @returns {Object} Default configuration
   */
  getDefaultConfig(strategyName) {
    switch (strategyName) {
      case 'jwt':
        return JWTAuthStrategy.DEFAULT_CONFIG;
      case 'local':
        return LocalAuthStrategy.DEFAULT_CONFIG;
      case 'github':
        return GitHubAuthStrategy.GITHUB_CONFIG;
      case 'google':
        return GoogleAuthStrategy.GOOGLE_CONFIG;
      case 'linkedin':
        return LinkedInAuthStrategy.LINKEDIN_CONFIG;
      case 'passkey':
        return PasskeyAuthStrategy.DEFAULT_CONFIG;
      case 'organization':
        return OrganizationAuthStrategy.DEFAULT_CONFIG;
      default:
        return {};
    }
  },

  /**
   * Validates strategy configuration
   * @param {string} strategyName - Strategy name
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validation result
   */
  validateConfig(strategyName, config) {
    const errors = [];
    const warnings = [];

    switch (strategyName) {
      case 'jwt':
        if (!config.secretOrKey && !process.env.JWT_SECRET) {
          errors.push('JWT secret is required');
        }
        break;

      case 'github':
      case 'google':
      case 'linkedin':
        if (!config.clientID || !config.clientSecret) {
          errors.push(`${strategyName} client ID and secret are required`);
        }
        if (!config.callbackURL) {
          warnings.push(`${strategyName} callback URL not specified, using default`);
        }
        break;

      case 'passkey':
        if (!config.rpID || !config.rpName) {
          errors.push('Relying party ID and name are required for passkey');
        }
        break;

      case 'organization':
        if (!config.multiTenant?.strategy) {
          warnings.push('Multi-tenant strategy not specified, using subdomain');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
};

/**
 * Utility to check if a strategy is available
 * @param {string} strategyName - Strategy name
 * @returns {boolean} Whether strategy is available
 */
function isStrategyAvailable(strategyName) {
  switch (strategyName) {
    case 'jwt':
    case 'local':
    case 'passkey':
    case 'organization':
      return true;
    
    case 'github':
      return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    
    case 'google':
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    
    case 'linkedin':
      return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
    
    default:
      return false;
  }
}

/**
 * Gets list of available strategies
 * @returns {string[]} Available strategy names
 */
function getAvailableStrategies() {
  return Object.keys(strategies).filter(isStrategyAvailable);
}

/**
 * AuthStrategiesManager Class
 * Provides a class-based interface for managing authentication strategies
 */
class AuthStrategiesManager {
  /**
   * Creates an instance of AuthStrategiesManager
   * @param {Object} [config] - Initial configuration
   */
  constructor(config = {}) {
    this.config = {
      enableSessions: true,
      adminMode: false,
      requireMFA: false,
      sessionTimeout: 3600000, // 1 hour default
      ...config
    };
    
    this.passport = null;
    this.initialized = false;
    this.enabledStrategies = [];
    this.registeredStrategies = new Map();
  }

  /**
   * Initialize the authentication strategies manager
   * @param {Object} app - Express application instance
   * @param {Object} [config] - Configuration overrides
   * @returns {Object} Configured passport instance
   * @throws {Error} If initialization fails
   */
  async initialize(app, config = {}) {
    try {
      // Merge configuration
      this.config = {
        ...this.config,
        ...config
      };

      // Get passport instance
      const passport = require('passport');
      this.passport = passport;

      // Validate configuration for enabled strategies
      await this.validateConfiguration();

      // Register strategies based on configuration
      this.passport = registerAllStrategies(this.passport, this.config, this.config.strategies || {});

      // Track enabled strategies
      this.enabledStrategies = getAvailableStrategies();

      // Configure passport serialization
      this.configurePassportSerialization();

      this.initialized = true;
      
      return this.passport;
    } catch (error) {
      throw new Error(`Failed to initialize AuthStrategiesManager: ${error.message}`);
    }
  }

  /**
   * Configure passport user serialization/deserialization
   * @private
   */
  configurePassportSerialization() {
    if (!this.passport) {
      throw new Error('Passport not initialized');
    }

    this.passport.serializeUser((user, done) => {
      done(null, {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
        permissions: user.permissions
      });
    });

    this.passport.deserializeUser(async (serializedUser, done) => {
      try {
        // In a real implementation, you would fetch the user from database
        // For now, return the serialized user data
        done(null, serializedUser);
      } catch (error) {
        done(error, null);
      }
    });
  }

  /**
   * Validate the current configuration
   * @private
   * @returns {Promise<void>}
   */
  async validateConfiguration() {
    const availableStrategies = getAvailableStrategies();
    const validationResults = [];

    for (const strategyName of availableStrategies) {
      const strategyConfig = this.config.strategies?.[strategyName] || this.config[strategyName] || {};
      const validation = helpers.validateConfig(strategyName, strategyConfig);
      
      if (!validation.valid) {
        validationResults.push({
          strategy: strategyName,
          errors: validation.errors,
          warnings: validation.warnings
        });
      }
    }

    // Log warnings but don't fail initialization
    validationResults.forEach(result => {
      if (result.warnings.length > 0) {
        console.warn(`AuthStrategiesManager: Warnings for ${result.strategy}:`, result.warnings);
      }
    });

    // Only fail if there are critical errors
    const criticalErrors = validationResults.filter(result => result.errors.length > 0);
    if (criticalErrors.length > 0) {
      const errorMessage = criticalErrors.map(result => 
        `${result.strategy}: ${result.errors.join(', ')}`
      ).join('; ');
      throw new Error(`Strategy validation failed: ${errorMessage}`);
    }
  }

  /**
   * Get list of enabled strategies
   * @returns {string[]} Array of enabled strategy names
   */
  getEnabledStrategies() {
    return this.enabledStrategies;
  }

  /**
   * Check if a strategy is enabled
   * @param {string} strategyName - Strategy name to check
   * @returns {boolean} Whether the strategy is enabled
   */
  isStrategyEnabled(strategyName) {
    return this.enabledStrategies.includes(strategyName);
  }

  /**
   * Get strategy configuration
   * @param {string} strategyName - Strategy name
   * @returns {Object} Strategy configuration
   */
  getStrategyConfig(strategyName) {
    return this.config.strategies?.[strategyName] || this.config[strategyName] || {};
  }

  /**
   * Verify MFA token for a user
   * @param {string} userId - User ID
   * @param {string} token - MFA token to verify
   * @param {Object} [options] - Additional verification options
   * @returns {Promise<boolean>} Whether the MFA token is valid
   */
  async verifyMFA(userId, token, options = {}) {
    try {
      // This is a placeholder implementation
      // In a real system, you would:
      // 1. Fetch user's MFA settings from database
      // 2. Verify the token against the user's MFA device/app
      // 3. Check for replay attacks, time windows, etc.
      
      if (!userId || !token) {
        return false;
      }

      // For admin mode, require stricter MFA validation
      if (this.config.adminMode) {
        // Implement admin-specific MFA validation
        return this.verifyAdminMFA(userId, token, options);
      }

      // Basic MFA validation (implement based on your MFA provider)
      // This could integrate with TOTP, SMS, email, or hardware tokens
      return this.validateMFAToken(userId, token, options);
    } catch (error) {
      console.error('MFA verification failed:', error);
      return false;
    }
  }

  /**
   * Verify admin-specific MFA
   * @private
   * @param {string} userId - User ID
   * @param {string} token - MFA token
   * @param {Object} options - Verification options
   * @returns {Promise<boolean>} Whether admin MFA is valid
   */
  async verifyAdminMFA(userId, token, options) {
    // Implement stricter admin MFA verification
    // This might require hardware tokens, longer codes, etc.
    return this.validateMFAToken(userId, token, { ...options, adminMode: true });
  }

  /**
   * Validate MFA token implementation
   * @private
   * @param {string} userId - User ID
   * @param {string} token - MFA token
   * @param {Object} options - Validation options
   * @returns {Promise<boolean>} Whether token is valid
   */
  async validateMFAToken(userId, token, options) {
    // Placeholder for actual MFA validation logic
    // Integrate with your chosen MFA provider (Google Authenticator, Authy, etc.)
    
    // For development/testing, accept any 6-digit numeric token
    if (process.env.NODE_ENV === 'development') {
      return /^\d{6}$/.test(token);
    }

    // Production implementation would validate against actual MFA service
    return false;
  }

  /**
   * Register a custom strategy
   * @param {string} name - Strategy name
   * @param {Object} strategy - Passport strategy instance
   * @param {Object} [config] - Strategy configuration
   */
  registerCustomStrategy(name, strategy, config = {}) {
    if (!this.passport) {
      throw new Error('AuthStrategiesManager not initialized');
    }

    this.passport.use(name, strategy);
    this.registeredStrategies.set(name, { strategy, config });
    
    if (!this.enabledStrategies.includes(name)) {
      this.enabledStrategies.push(name);
    }
  }

  /**
   * Create a custom OAuth strategy
   * @param {string} provider - OAuth provider name
   * @param {Object} config - OAuth configuration
   * @returns {Object} Configured OAuth strategy
   */
  createCustomOAuthStrategy(provider, config) {
    return createCustomOAuthStrategy(provider, config);
  }

  /**
   * Get manager status and configuration
   * @returns {Object} Manager status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      enabledStrategies: this.enabledStrategies,
      config: {
        adminMode: this.config.adminMode,
        requireMFA: this.config.requireMFA,
        enableSessions: this.config.enableSessions,
        sessionTimeout: this.config.sessionTimeout
      },
      registeredStrategies: Array.from(this.registeredStrategies.keys())
    };
  }

  /**
   * Reset and reinitialize the manager
   * @param {Object} [newConfig] - New configuration
   * @returns {Promise<void>}
   */
  async reset(newConfig = {}) {
    this.initialized = false;
    this.enabledStrategies = [];
    this.registeredStrategies.clear();
    this.passport = null;
    
    if (Object.keys(newConfig).length > 0) {
      this.config = { ...this.config, ...newConfig };
    }
  }
}

// Main exports
module.exports = {
  // Class-based manager (primary export)
  AuthStrategiesManager,
  
  // Individual strategy factories
  ...strategies,
  
  // Strategy classes for extension
  StrategyClasses,
  
  // Base OAuth strategy for custom providers
  BaseOAuthStrategy,
  
  // Utility functions
  registerAllStrategies,
  createCustomOAuthStrategy,
  isStrategyAvailable,
  getAvailableStrategies,
  
  // Configuration helpers
  helpers,
  
  // Re-export individual strategies for backward compatibility
  jwtStrategy,
  localStrategy,
  oauthStrategy,
  githubStrategy,
  googleStrategy,
  linkedinStrategy,
  passkeyStrategy,
  organizationStrategy
};