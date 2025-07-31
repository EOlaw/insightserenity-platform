'use strict';

/**
 * @fileoverview Authentication strategies module exports
 * @module shared/lib/auth/strategies
 * @description Exports all authentication strategies for the platform
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

// Main exports
module.exports = {
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