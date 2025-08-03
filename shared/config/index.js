'use strict';

/**
 * @fileoverview Main configuration module - SIMPLIFIED VERSION
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

// Load environment-specific overrides
let environmentConfig = {};
try {
    environmentConfig = require(`./environment/${environment}`);
} catch (error) {
    console.log(`No environment config found for ${environment}, using base config defaults`);
    environmentConfig = {};
}

// Configuration validation for production
const validateConfig = (config) => {
    const warnings = [];

    if (environment === 'production') {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'development_jwt_secret_change_in_production') {
            warnings.push('Production requires a secure JWT secret');
        }
        
        if (!process.env.DB_URI || process.env.DB_URI.includes('localhost')) {
            warnings.push('Production should use a proper database URI');
        }
        
        if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
            warnings.push('Production requires a secure encryption key');
        }
    }

    if (warnings.length > 0) {
        console.warn('Configuration warnings:', warnings);
    }

    return true;
};

// Merge all configurations
const mergeConfigs = () => {
    const merged = {
        // Base configuration
        base: { ...baseConfig.app, ...environmentConfig.base },
        app: { ...baseConfig.app, ...environmentConfig.app },
        
        // Database configuration
        database: {
            uri: process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_dev',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT, 10) || 27017,
            name: process.env.DB_NAME || 'insightserenity_dev',
            multiTenant: baseConfig.multiTenant,
            ...databaseConfig,
            ...environmentConfig.database
        },
        
        // Security configuration
        security: {
            jwtSecret: process.env.JWT_SECRET || 'development_jwt_secret_change_in_production',
            encryptionKey: process.env.ENCRYPTION_KEY || 'development_encryption_key_32_chars',
            sessionSecret: process.env.SESSION_SECRET || 'development_session_secret',
            helmet: { enabled: process.env.HELMET_ENABLED !== 'false' },
            cors: baseConfig.cors,
            session: {
                enabled: process.env.SESSION_ENABLED !== 'false',
                secret: process.env.SESSION_SECRET || 'development_session_secret',
                cookie: {
                    secure: process.env.SESSION_SECURE === 'true',
                    httpOnly: true,
                    sameSite: 'strict',
                    maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000
                }
            },
            ssl: { enabled: process.env.SSL_ENABLED === 'true' },
            ...securityConfig,
            ...environmentConfig.security
        },
        
        // Redis configuration
        redis: {
            enabled: process.env.REDIS_ENABLED === 'true',
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT, 10) || 6379,
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB, 10) || 0,
            prefix: process.env.REDIS_PREFIX || 'insightserenity:',
            maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS, 10) || 5,
            fallbackToMemory: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
            ...redisConfig,
            ...environmentConfig.redis
        },
        
        // Email configuration
        email: {
            provider: process.env.EMAIL_PROVIDER || 'console',
            from: process.env.EMAIL_FROM || 'noreply@insightserenity.com',
            smtp: {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT, 10) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            },
            ...emailConfig,
            ...environmentConfig.email
        },
        
        // Payment configuration
        payment: {
            provider: process.env.PAYMENT_PROVIDER || 'stripe',
            stripe: {
                publicKey: process.env.STRIPE_PUBLIC_KEY,
                secretKey: process.env.STRIPE_SECRET_KEY,
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
            },
            ...paymentConfig,
            ...environmentConfig.payment
        },
        
        // Swagger configuration
        swagger: {
            enabled: process.env.SWAGGER_ENABLED !== 'false',
            title: process.env.SWAGGER_TITLE || 'InsightSerenity API',
            description: process.env.SWAGGER_DESCRIPTION || 'InsightSerenity Platform API Documentation',
            version: process.env.API_VERSION || '1.0.0',
            path: process.env.SWAGGER_PATH || '/api-docs',
            ...swaggerConfig,
            ...environmentConfig.swagger
        },
        
        // Constants
        constants: {
            VERSION: constants.VERSION || baseConfig.app.version,
            ENVIRONMENTS: validEnvironments,
            DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'UTC',
            DEFAULT_LOCALE: process.env.DEFAULT_LOCALE || 'en-US',
            API_VERSION: process.env.API_VERSION || 'v1',
            ...constants
        },
        
        // Logging configuration
        logging: {
            ...baseConfig.logging,
            ...environmentConfig.logging
        },
        
        // Environment information
        environment: {
            name: environment,
            isDevelopment: environment === 'development',
            isStaging: environment === 'staging',
            isProduction: environment === 'production',
            isTest: environment === 'test',
            ...environmentConfig.environment
        }
    };

    // Add computed properties from baseConfig
    merged.isMultiTenant = baseConfig.multiTenant.enabled;
    merged.apiUrl = baseConfig.apiUrl;
    merged.clientUrl = baseConfig.clientUrl;

    return merged;
};

// Create the final configuration object
const config = mergeConfigs();

// Validate the configuration
validateConfig(config);

// Deep freeze helper function
const deepFreeze = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
        if (obj[prop] !== null && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return obj;
};

// Create the complete export object
const exportObject = {
    // Main configuration
    ...config,
    
    // Individual configs for specific imports
    base: config.base,
    app: config.app,
    database: config.database,
    security: config.security,
    redis: config.redis,
    email: config.email,
    payment: config.payment,
    constants: config.constants,
    swagger: config.swagger,
    environment: config.environment,
    logging: config.logging,

    // Utility function for getting config values with dot notation
    get: (path, defaultValue = undefined) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], config) || defaultValue;
    },

    // Environment check helpers
    isDevelopment: () => environment === 'development',
    isStaging: () => environment === 'staging',
    isProduction: () => environment === 'production',
    isTest: () => environment === 'test',

    // Export helper functions from base-config
    helpers: baseConfig.helpers
};

// Only freeze in production to allow runtime modifications in development
if (environment === 'production') {
    deepFreeze(exportObject);
}

// Export the configuration object
module.exports = exportObject;

// Log configuration summary
if (environment !== 'test') {
    console.log('Configuration loaded successfully:', {
        environment,
        multiTenant: config.isMultiTenant,
        database: config.database.uri ? 'Configured' : 'Default',
        redis: config.redis.enabled ? 'Enabled' : 'Disabled',
        logging: config.logging.level
    });
}






// 'use strict';

// /**
//  * @fileoverview Main configuration module - FIXED VERSION
//  * @module shared/config
//  */

// const baseConfig = require('./base-config');

// // Load environment-specific configuration safely
// const loadEnvironmentConfig = (environment) => {
//     try {
//         // Try to load environment-specific config if it exists
//         return require(`./environment/${environment}`);
//     } catch (error) {
//         // Return empty object if environment config doesn't exist
//         console.log(`No environment config found for ${environment}, using base config defaults`);
//         return {};
//     }
// };

// // Safely load other config modules
// const loadConfigModule = (moduleName) => {
//     try {
//         return require(`./${moduleName}`);
//     } catch (error) {
//         console.log(`Config module ${moduleName} not found, using defaults`);
//         return {};
//     }
// };

// // Get the current environment
// const environment = process.env.NODE_ENV || 'development';
// const validEnvironments = ['development', 'staging', 'production', 'test'];

// if (!validEnvironments.includes(environment)) {
//     throw new Error(`Invalid NODE_ENV: ${environment}. Must be one of: ${validEnvironments.join(', ')}`);
// }

// // Load additional config modules safely
// const databaseConfig = loadConfigModule('database-config');
// const securityConfig = loadConfigModule('security-config');
// const redisConfig = loadConfigModule('redis-config');
// const emailConfig = loadConfigModule('email-config');
// const paymentConfig = loadConfigModule('payment-config');
// const constants = loadConfigModule('constants');
// const swaggerConfig = loadConfigModule('swagger-config');

// // Load environment-specific overrides
// const environmentConfig = loadEnvironmentConfig(environment);

// // Configuration validation helper - FIXED to not throw errors for missing configs
// const validateConfig = (config) => {
//     const warnings = [];

//     // Only validate critical settings for production
//     if (environment === 'production') {
//         if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'development_jwt_secret_change_in_production') {
//             warnings.push('Production requires a secure JWT secret');
//         }
        
//         if (!process.env.DB_URI || process.env.DB_URI.includes('localhost')) {
//             warnings.push('Production should use a proper database URI');
//         }
        
//         if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
//             warnings.push('Production requires a secure encryption key');
//         }
//     }

//     // Log warnings instead of throwing errors
//     if (warnings.length > 0) {
//         console.warn('Configuration warnings:', warnings);
//     }

//     return true;
// };

// // Merge configurations with environment-specific overrides - FIXED to use baseConfig
// const mergeConfigs = () => {
//     const merged = {
//         // Start with base configuration
//         base: { ...baseConfig.app, ...environmentConfig.base },
//         app: { ...baseConfig.app, ...environmentConfig.app },
        
//         // Database configuration with safe defaults
//         database: {
//             uri: process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/insightserenity_dev',
//             host: process.env.DB_HOST || 'localhost',
//             port: parseInt(process.env.DB_PORT, 10) || 27017,
//             name: process.env.DB_NAME || 'insightserenity_dev',
//             multiTenant: baseConfig.multiTenant,
//             ...databaseConfig,
//             ...environmentConfig.database
//         },
        
//         // Security configuration with safe defaults
//         security: {
//             jwtSecret: process.env.JWT_SECRET || 'development_jwt_secret_change_in_production',
//             encryptionKey: process.env.ENCRYPTION_KEY || 'development_encryption_key_32_chars',
//             sessionSecret: process.env.SESSION_SECRET || 'development_session_secret',
//             helmet: { enabled: process.env.HELMET_ENABLED !== 'false' },
//             cors: baseConfig.cors,
//             session: {
//                 enabled: process.env.SESSION_ENABLED !== 'false',
//                 secret: process.env.SESSION_SECRET || 'development_session_secret',
//                 cookie: {
//                     secure: process.env.SESSION_SECURE === 'true',
//                     httpOnly: true,
//                     sameSite: 'strict',
//                     maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000
//                 }
//             },
//             ssl: { enabled: process.env.SSL_ENABLED === 'true' },
//             ...securityConfig,
//             ...environmentConfig.security
//         },
        
//         // Redis configuration with safe defaults
//         redis: {
//             enabled: process.env.REDIS_ENABLED === 'true',
//             host: process.env.REDIS_HOST || 'localhost',
//             port: parseInt(process.env.REDIS_PORT, 10) || 6379,
//             password: process.env.REDIS_PASSWORD,
//             db: parseInt(process.env.REDIS_DB, 10) || 0,
//             prefix: process.env.REDIS_PREFIX || 'insightserenity:',
//             maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS, 10) || 5,
//             fallbackToMemory: process.env.CACHE_FALLBACK_TO_MEMORY === 'true',
//             ...redisConfig,
//             ...environmentConfig.redis
//         },
        
//         // Email configuration with safe defaults
//         email: {
//             provider: process.env.EMAIL_PROVIDER || 'console',
//             from: process.env.EMAIL_FROM || 'noreply@insightserenity.com',
//             smtp: {
//                 host: process.env.SMTP_HOST,
//                 port: parseInt(process.env.SMTP_PORT, 10) || 587,
//                 secure: process.env.SMTP_SECURE === 'true',
//                 auth: {
//                     user: process.env.SMTP_USER,
//                     pass: process.env.SMTP_PASS
//                 }
//             },
//             ...emailConfig,
//             ...environmentConfig.email
//         },
        
//         // Payment configuration with safe defaults
//         payment: {
//             provider: process.env.PAYMENT_PROVIDER || 'stripe',
//             stripe: {
//                 publicKey: process.env.STRIPE_PUBLIC_KEY,
//                 secretKey: process.env.STRIPE_SECRET_KEY,
//                 webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
//             },
//             ...paymentConfig,
//             ...environmentConfig.payment
//         },
        
//         // Swagger configuration
//         swagger: {
//             enabled: process.env.SWAGGER_ENABLED !== 'false',
//             title: process.env.SWAGGER_TITLE || 'InsightSerenity API',
//             description: process.env.SWAGGER_DESCRIPTION || 'InsightSerenity Platform API Documentation',
//             version: process.env.API_VERSION || '1.0.0',
//             path: process.env.SWAGGER_PATH || '/api-docs',
//             ...swaggerConfig,
//             ...environmentConfig.swagger
//         },
        
//         // Constants - use from baseConfig or constants module
//         constants: constants.VERSION ? constants : {
//             VERSION: baseConfig.app.version,
//             ENVIRONMENTS: validEnvironments,
//             DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'UTC',
//             DEFAULT_LOCALE: process.env.DEFAULT_LOCALE || 'en-US',
//             API_VERSION: process.env.API_VERSION || 'v1'
//         },
        
//         // Logging configuration from baseConfig
//         logging: {
//             ...baseConfig.logging,
//             ...environmentConfig.logging
//         },
        
//         // Environment information
//         environment: {
//             name: environment,
//             isDevelopment: environment === 'development',
//             isStaging: environment === 'staging',
//             isProduction: environment === 'production',
//             isTest: environment === 'test',
//             ...environmentConfig.environment
//         }
//     };

//     // Add computed properties from baseConfig
//     merged.isMultiTenant = baseConfig.multiTenant.enabled;
//     merged.apiUrl = baseConfig.apiUrl;
//     merged.clientUrl = baseConfig.clientUrl;

//     return merged;
// };

// // Create the final configuration object
// const config = mergeConfigs();

// // Validate the configuration
// validateConfig(config);

// // Deep freeze helper function
// const deepFreeze = (obj) => {
//     if (typeof obj !== 'object' || obj === null) return obj;
    
//     Object.freeze(obj);
//     Object.getOwnPropertyNames(obj).forEach((prop) => {
//         if (obj[prop] !== null && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
//             deepFreeze(obj[prop]);
//         }
//     });
//     return obj;
// };

// // Create the complete export object with all properties BEFORE freezing
// const exportObject = {
//     // Main configuration
//     ...config,
    
//     // Individual configs for specific imports
//     base: config.base,
//     app: config.app,
//     database: config.database,
//     security: config.security,
//     redis: config.redis,
//     email: config.email,
//     payment: config.payment,
//     constants: config.constants,
//     swagger: config.swagger,
//     environment: config.environment,
//     logging: config.logging,

//     // Utility function for getting config values with dot notation
//     get: (path, defaultValue = undefined) => {
//         return path.split('.').reduce((acc, part) => acc && acc[part], config) || defaultValue;
//     },

//     // Environment check helpers
//     isDevelopment: () => environment === 'development',
//     isStaging: () => environment === 'staging',
//     isProduction: () => environment === 'production',
//     isTest: () => environment === 'test',

//     // Export helper functions from base-config
//     helpers: baseConfig.helpers
// };

// // Only freeze in production to allow runtime modifications in development
// if (environment === 'production') {
//     deepFreeze(exportObject);
// }

// // Export the configuration object
// module.exports = exportObject;

// // Log configuration summary (excluding sensitive data)
// if (environment !== 'test') {
//     console.log('Configuration loaded successfully:', {
//         environment,
//         multiTenant: config.isMultiTenant,
//         database: config.database.uri ? 'Configured' : 'Default',
//         redis: config.redis.enabled ? 'Enabled' : 'Disabled',
//         logging: config.logging.level
//     });
// }