'use strict';

/**
 * @fileoverview Main configuration module that aggregates and exports all configuration settings
 * @module shared/config
 */

const baseConfig = require('./base-config');
const databaseConfig = require('./database-config');
const securityConfig = require('./security-config');
const redisConfig = require('./redis-config');
const emailConfig = require('./email-config');
const paymentConfig = require('./payment-config');
const constants = require('./constants');
const swaggerConfig = require('./swagger-config');

// Load environment-specific configuration
const environment = process.env.NODE_ENV || 'development';
const validEnvironments = ['development', 'staging', 'production', 'test'];

if (!validEnvironments.includes(environment)) {
  throw new Error(`Invalid NODE_ENV: ${environment}. Must be one of: ${validEnvironments.join(', ')}`);
}

const environmentConfig = require(`./environment/${environment}`);

// Configuration validation helper
const validateConfig = (config) => {
  const requiredConfigs = [
    'base',
    'database',
    'security',
    'redis',
    'email',
    'payment',
    'constants',
    'swagger',
    'environment'
  ];

  for (const configName of requiredConfigs) {
    if (!config[configName]) {
      throw new Error(`Missing required configuration: ${configName}`);
    }
  }

  // Validate critical settings for production
  if (environment === 'production') {
    if (!config.security.jwtSecret || config.security.jwtSecret === 'change_this_secret') {
      throw new Error('Production requires a secure JWT secret');
    }
    if (!config.database.uri || config.database.uri.includes('localhost')) {
      throw new Error('Production requires a proper database URI');
    }
    if (!config.security.encryptionKey || config.security.encryptionKey.length < 32) {
      throw new Error('Production requires a secure encryption key (min 32 characters)');
    }
  }

  return true;
};

// Merge configurations with environment-specific overrides
const mergeConfigs = () => {
  const merged = {
    base: { ...baseConfig, ...environmentConfig.base },
    database: { ...databaseConfig, ...environmentConfig.database },
    security: { ...securityConfig, ...environmentConfig.security },
    redis: { ...redisConfig, ...environmentConfig.redis },
    email: { ...emailConfig, ...environmentConfig.email },
    payment: { ...paymentConfig, ...environmentConfig.payment },
    swagger: { ...swaggerConfig, ...environmentConfig.swagger },
    constants,
    environment: {
      name: environment,
      isDevelopment: environment === 'development',
      isStaging: environment === 'staging',
      isProduction: environment === 'production',
      isTest: environment === 'test',
      ...environmentConfig.environment
    }
  };

  // Add computed properties
  merged.isMultiTenant = merged.base.multiTenant.enabled;
  merged.apiUrl = merged.base.apiUrl;
  merged.clientUrl = merged.base.clientUrl;

  return merged;
};

// Create the final configuration object
const config = mergeConfigs();

// Validate the configuration
validateConfig(config);

// Deep freeze the configuration to ensure immutability
const deepFreeze = (obj) => {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    if (obj[prop] !== null
      && (typeof obj[prop] === 'object' || typeof obj[prop] === 'function')
      && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });
  return obj;
};

// Export the frozen configuration
module.exports = deepFreeze(config);

// Export individual configs for specific imports
module.exports.base = config.base;
module.exports.database = config.database;
module.exports.security = config.security;
module.exports.redis = config.redis;
module.exports.email = config.email;
module.exports.payment = config.payment;
module.exports.constants = config.constants;
module.exports.swagger = config.swagger;
module.exports.environment = config.environment;

// Export utility function for getting config values with dot notation
module.exports.get = (path, defaultValue = undefined) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], config) || defaultValue;
};

// Export environment check helpers
module.exports.isDevelopment = () => environment === 'development';
module.exports.isStaging = () => environment === 'staging';
module.exports.isProduction = () => environment === 'production';
module.exports.isTest = () => environment === 'test';

// Log configuration summary (excluding sensitive data)
if (environment !== 'test') {
  console.log('Configuration loaded:', {
    environment,
    multiTenant: config.isMultiTenant,
    apiUrl: config.apiUrl,
    databaseHost: config.database.uri ? new URL(config.database.uri).hostname : 'not configured',
    redisEnabled: config.redis.enabled,
    emailProvider: config.email.provider
  });
}