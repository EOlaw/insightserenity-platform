/**
 * @fileoverview Shared Configuration Module
 * @module shared/config
 */

const authConfig = require('./auth.config');
const databaseConfig = require('./database.config');
const servicesConfig = require('./services.config');
const securityConfig = require('./security.config');
const integrationsConfig = require('./integrations.config');

// Environment
const env = process.env.NODE_ENV || 'development';
const isDevelopment = env === 'development';
const isProduction = env === 'production';
const isTest = env === 'test';

module.exports = {
    // Environment
    env,
    isDevelopment,
    isProduction,
    isTest,

    // Configurations
    auth: authConfig,
    database: databaseConfig,
    services: servicesConfig,
    security: securityConfig,
    integrations: integrationsConfig,

    // Common settings
    common: {
        apiVersion: process.env.API_VERSION || 'v1',
        defaultPageSize: 20,
        maxPageSize: 100,
        uploadMaxSize: 10 * 1024 * 1024, // 10MB
        corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        timezone: process.env.TZ || 'UTC',
        locale: process.env.DEFAULT_LOCALE || 'en',
        currency: process.env.DEFAULT_CURRENCY || 'USD'
    },

    // Feature flags
    features: {
        multiTenancy: process.env.ENABLE_MULTI_TENANCY === 'true',
        notifications: process.env.ENABLE_NOTIFICATIONS === 'true',
        webhooks: process.env.ENABLE_WEBHOOKS === 'true',
        analytics: process.env.ENABLE_ANALYTICS === 'true',
        audit: process.env.ENABLE_AUDIT_LOGS === 'true',
        twoFactor: process.env.ENABLE_TWO_FACTOR === 'true',
        passkeys: process.env.ENABLE_PASSKEYS === 'true',
        oauth: process.env.ENABLE_OAUTH === 'true'
    }
};
