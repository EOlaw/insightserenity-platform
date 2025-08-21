'use strict';

/**
 * @fileoverview Enhanced database models index - Registers all models with BaseModel and multi-database routing
 * @module shared/lib/database/models
 * @description This file imports and registers all database models to ensure they are
 * available during Database.initialize(). Models must be imported here to be recognized.
 * ENHANCED: Now includes multi-database routing and comprehensive model registration.
 */

const logger = require('../../utils/logger');
const BaseModel = require('./base-model');

// Track registration progress
let registeredModels = new Map();
let registrationErrors = [];

/**
 * ENHANCED: Safely imports and registers a model with enhanced database routing
 * @param {string} modelPath - Path to model file
 * @param {string} modelName - Name for registration
 * @param {string} [expectedCollection] - Expected collection name for database routing
 * @param {string} [databaseType] - Target database type (admin, shared, audit, analytics)
 * @returns {Object|null} Registered model or null if failed
 */
function safeRegisterModel(modelPath, modelName, expectedCollection = null, databaseType = null) {
    try {
        const modelModule = require(modelPath);

        // Handle different export patterns
        let model = null;
        let schema = null;
        let collectionName = expectedCollection;

        if (modelModule.model) {
            // Pattern: { model: Model, schema: Schema }
            model = modelModule.model;
            schema = modelModule.schema;
        } else if (modelModule.default) {
            // Pattern: { default: Model }
            model = modelModule.default;
        } else if (typeof modelModule === 'function') {
            // Pattern: module.exports = Model
            model = modelModule;
        } else {
            logger.warn(`Unknown export pattern for ${modelName} at ${modelPath}`, {
                exportKeys: Object.keys(modelModule),
                modelPath,
                modelName
            });
            return null;
        }

        if (model) {
            // Extract collection name if not provided
            if (!collectionName) {
                if (model.collection && model.collection.name) {
                    collectionName = model.collection.name;
                } else if (schema && schema.options && schema.options.collection) {
                    collectionName = schema.options.collection;
                } else {
                    // Generate collection name from model name
                    collectionName = BaseModel.pluralize ? BaseModel.pluralize(modelName.toLowerCase()) : modelName.toLowerCase() + 's';
                }
            }

            // Register with BaseModel if not already registered
            if (BaseModel.modelRegistry && !BaseModel.modelRegistry.has(modelName)) {
                BaseModel.modelRegistry.set(modelName, model);

                if (schema && BaseModel.schemaCache) {
                    BaseModel.schemaCache.set(modelName, schema);
                }

                // ENHANCED: Add collection mapping for database routing
                if (collectionName && BaseModel.addCollectionMapping) {
                    // Use provided database type or determine from collection name
                    const targetDatabaseType = databaseType || BaseModel.getDatabaseTypeForCollection(collectionName);
                    if (targetDatabaseType && targetDatabaseType !== 'unknown') {
                        BaseModel.addCollectionMapping(collectionName, targetDatabaseType);
                        logger.debug(`Collection routing configured: ${collectionName} -> ${targetDatabaseType} database`);
                    } else if (databaseType) {
                        // Force the mapping if database type was explicitly provided
                        BaseModel.addCollectionMapping(collectionName, databaseType);
                        logger.debug(`Collection routing forced: ${collectionName} -> ${databaseType} database`);
                    }
                }
            }

            registeredModels.set(modelName, model);
            logger.debug(`Registered model: ${modelName}`, {
                collection: collectionName,
                databaseType: databaseType || BaseModel.getDatabaseTypeForCollection(collectionName) || 'unmapped'
            });
            return model;
        }

        return null;

    } catch (error) {
        const errorMsg = `Failed to register ${modelName}: ${error.message}`;
        logger.error(errorMsg, {
            modelPath,
            modelName,
            expectedCollection,
            databaseType,
            error: error.message,
            stack: error.stack
        });
        registrationErrors.push({ 
            modelName, 
            path: modelPath, 
            expectedCollection,
            databaseType,
            error: error.message 
        });
        return null;
    }
}

// ============================================================================
// INITIALIZE BASE MODEL REGISTRIES
// ============================================================================
logger.info('BaseModel loading...', typeof BaseModel);

if (!BaseModel.modelRegistry) {
    BaseModel.modelRegistry = new Map();
}
if (!BaseModel.schemaCache) {
    BaseModel.schemaCache = new Map();
}

logger.info('Starting model registration process...');

// ============================================================================
// CORE/BASE MODELS - Register these first
// ============================================================================
logger.debug('Registering core models...');

// ============================================================================
// USER MODELS - Admin Database
// ============================================================================
logger.debug('Registering user models...');

const User = safeRegisterModel('./users/user-model', 'User', 'users', 'admin');
const UserProfile = safeRegisterModel('./users/user-profile-model', 'UserProfile', 'user_profiles', 'admin');
const UserSession = safeRegisterModel('./users/session-model', 'UserSession', 'sessions', 'admin');
const UserActivity = safeRegisterModel('./users/user-activity-model', 'UserActivity', 'user_activities', 'admin');
const LoginHistory = safeRegisterModel('./users/login-history-model', 'LoginHistory', 'login_history', 'admin');
const Permission = safeRegisterModel('./users/permission-model', 'Permission', 'permissions', 'admin');
const AnonymizedUser = safeRegisterModel('./users/anonymized-user-model', 'AnonymizedUser', 'anonymized_users', 'admin');

// ============================================================================
// ORGANIZATION MODELS - Admin Database
// ============================================================================
logger.debug('Registering organization models...');

const Organization = safeRegisterModel('./organizations/organization-model', 'Organization', 'organizations', 'admin');
const OrganizationMember = safeRegisterModel('./organizations/organization-member-model', 'OrganizationMember', 'organization_members', 'admin');
const OrganizationInvitation = safeRegisterModel('./organizations/organization-invitation-model', 'OrganizationInvitation', 'organization_invitations', 'admin');
const Tenant = safeRegisterModel('./organizations/tenant-model', 'Tenant', 'tenants', 'admin');

// ============================================================================
// SECURITY & PERMISSIONS MODELS - Mixed Databases
// ============================================================================
logger.debug('Registering security models...');

const Role = safeRegisterModel('./users/role-model', 'Role', 'roles', 'admin');
const SecurityIncident = safeRegisterModel('./security/security-incident-model', 'SecurityIncident', 'security_incidents', 'admin');
const AuditLog = safeRegisterModel('./security/audit-log-model', 'AuditLog', 'audit_logs', 'audit');
const AuditAlert = safeRegisterModel('./security/audit-alert-model', 'AuditAlert', 'audit_alerts', 'audit');
const AuditExport = safeRegisterModel('./security/audit-export-model', 'AuditExport', 'audit_exports', 'audit');
const AuditRetentionPolicy = safeRegisterModel('./security/audit-retention-policy-model', 'AuditRetentionPolicy', 'audit_retention_policies', 'audit');
const ComplianceMapping = safeRegisterModel('./security/compliance-mapping-model', 'ComplianceMapping', 'compliance_mappings', 'audit');

// ============================================================================
// AUTHENTICATION MODELS - Shared Database
// ============================================================================
logger.debug('Registering authentication models...');

const Passkey = safeRegisterModel('./users/passkey-model', 'Passkey', 'passkeys', 'shared');
const OAuthProvider = safeRegisterModel('./users/oauth-provider-model', 'OAuthProvider', 'oauth_providers', 'shared');
const SessionData = safeRegisterModel('./users/session-model', 'SessionData', 'sessions', 'admin');

// ============================================================================
// PRIVACY & COMPLIANCE MODELS - Audit Database
// ============================================================================
logger.debug('Registering privacy models...');

const Consent = safeRegisterModel('./users/consent-model', 'Consent', 'consents', 'audit');
const DataBreach = safeRegisterModel('./security/data-breach-model', 'DataBreach', 'data_breaches', 'audit');
const ErasureLog = safeRegisterModel('./security/erasure-log-model', 'ErasureLog', 'erasure_logs', 'audit');
const ProcessingActivity = safeRegisterModel('./security/processing-activity-model', 'ProcessingActivity', 'processing_activities', 'audit');

// ============================================================================
// BILLING & SUBSCRIPTION MODELS - Shared Database
// ============================================================================
logger.debug('Registering billing models...');

const PaymentMethod = safeRegisterModel('./billing/payment-method-model', 'PaymentMethod', 'payment_methods', 'shared');
const Subscription = safeRegisterModel('./billing/subscription-model', 'Subscription', 'subscriptions', 'shared');
const SubscriptionPlan = safeRegisterModel('./billing/subscription-plan-model', 'SubscriptionPlan', 'subscription_plans', 'shared');
const UsageRecord = safeRegisterModel('./billing/usage-record-model', 'UsageRecord', 'usage_records', 'analytics');

// ============================================================================
// PLATFORM MODELS - Shared Database
// ============================================================================
logger.debug('Registering platform models...');

const ApiIntegration = safeRegisterModel('./platform/api-integration-model', 'ApiIntegration', 'api_integrations', 'shared');
const ApiUsage = safeRegisterModel('./platform/api-usage-model', 'ApiUsage', 'api_usage', 'analytics');
const Notification = safeRegisterModel('./platform/notification-model', 'Notification', 'notifications', 'shared');
const SystemConfiguration = safeRegisterModel('./platform/system-configuration-model', 'SystemConfiguration', 'system_configurations', 'admin');
const Webhook = safeRegisterModel('./platform/webhook-model', 'Webhook', 'webhooks', 'shared');

// ============================================================================
// ADDITIONAL MODEL CATEGORIES - Enhanced Discovery
// ============================================================================

// Try to load additional models from other potential directories
const additionalModelCategories = [
    { folder: 'analytics', database: 'analytics' },
    { folder: 'communication', database: 'shared' },
    { folder: 'content', database: 'shared' },
    { folder: 'workflow', database: 'shared' },
    { folder: 'reporting', database: 'analytics' },
    { folder: 'integration', database: 'shared' },
    { folder: 'monitoring', database: 'analytics' }
];

for (const { folder, database } of additionalModelCategories) {
    try {
        logger.debug(`Attempting to register ${folder} models...`);
        
        // Try to require the category index file
        const categoryModels = require(`./${folder}`);
        
        if (categoryModels && typeof categoryModels === 'object') {
            for (const [modelName, model] of Object.entries(categoryModels)) {
                if (model && typeof model === 'function') {
                    try {
                        // Generate collection name from model name
                        const collectionName = BaseModel.pluralize ? BaseModel.pluralize(modelName.toLowerCase()) : modelName.toLowerCase() + 's';
                        
                        // Register with BaseModel
                        BaseModel.modelRegistry.set(modelName, model);
                        registeredModels.set(modelName, model);
                        
                        // Add database routing
                        if (BaseModel.addCollectionMapping) {
                            BaseModel.addCollectionMapping(collectionName, database);
                        }
                        
                        logger.debug(`Registered ${folder} model: ${modelName}`, {
                            collection: collectionName,
                            database: database
                        });
                    } catch (regError) {
                        logger.warn(`Failed to register ${folder} model ${modelName}`, {
                            error: regError.message
                        });
                        registrationErrors.push({
                            modelName: `${folder}.${modelName}`,
                            path: `./${folder}`,
                            error: regError.message
                        });
                    }
                }
            }
        }
    } catch (categoryError) {
        // Category doesn't exist or has issues - this is expected for some
        logger.debug(`${folder} models not available or had issues`, {
            error: categoryError.message
        });
    }
}

// ============================================================================
// SPECIALIZED MODEL LOADING - Enhanced with Database Routing
// ============================================================================

/**
 * ENHANCED: Load models from subdirectories dynamically with database routing
 * @param {string} subdirectory - Subdirectory name
 * @param {string} databaseType - Target database type
 */
function loadModelsFromSubdirectory(subdirectory, databaseType) {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const subdirPath = path.join(__dirname, subdirectory);
        
        if (fs.existsSync(subdirPath)) {
            const files = fs.readdirSync(subdirPath);
            
            for (const file of files) {
                if (file.endsWith('-model.js')) {
                    const modelName = file
                        .replace('-model.js', '')
                        .split('-')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join('');
                    
                    const modelPath = `./${subdirectory}/${file}`;
                    const collectionName = file.replace('-model.js', '').replace('-', '_') + 's';
                    
                    // Add collection mapping for the target database
                    if (BaseModel.addCollectionMapping) {
                        BaseModel.addCollectionMapping(collectionName, databaseType);
                    }
                    
                    safeRegisterModel(modelPath, modelName, collectionName, databaseType);
                }
            }
        }
    } catch (error) {
        logger.debug(`Could not load models from ${subdirectory}`, {
            error: error.message
        });
    }
}

// Load models from known subdirectories with their target databases
loadModelsFromSubdirectory('admin', 'admin');
loadModelsFromSubdirectory('shared', 'shared');
loadModelsFromSubdirectory('audit', 'audit');
loadModelsFromSubdirectory('analytics', 'analytics');

// ============================================================================
// SPECIAL MODELS - Handle edge cases
// ============================================================================

// Try to register additional models that might have different patterns
try {
    // Handle potential variations in model exports
    const specialModels = [
        { path: './security/cors-whitelist-model', name: 'CorsWhitelist', collection: 'cors_whitelist', database: 'shared' },
        { path: './billing/payment-model', name: 'Payment', collection: 'payments', database: 'shared' },
        { path: './users/session-model', name: 'Session', collection: 'sessions', database: 'admin' }
    ];

    for (const { path, name, collection, database } of specialModels) {
        try {
            safeRegisterModel(path, name, collection, database);
        } catch (specialError) {
            logger.debug(`Special model ${name} not available`, {
                error: specialError.message
            });
        }
    }
} catch (specialHandlingError) {
    logger.debug('Special model handling had issues', {
        error: specialHandlingError.message
    });
}

// ============================================================================
// CORS WHITELIST MODEL - Special handling (maintained from original)
// ============================================================================
try {
    const CorsWhitelist = safeRegisterModel('./security/cors-whitelist-model', 'CorsWhitelist', 'cors_whitelist', 'shared');
    if (!CorsWhitelist) {
        logger.warn('Unknown export pattern for CorsWhitelist at ./security/cors-whitelist-model');
    }
} catch (corsError) {
    logger.warn('CorsWhitelist model handling had issues', {
        error: corsError.message
    });
}

// ============================================================================
// REGISTRATION SUMMARY AND VALIDATION
// ============================================================================

// Calculate registration statistics
const totalAttempted = registeredModels.size + registrationErrors.length;
const successCount = registeredModels.size;
const errorCount = registrationErrors.length;

// Log registration completion
logger.info('Model registration completed', {
    attempted: totalAttempted,
    successful: successCount,
    failed: errorCount,
    registeredModels: Array.from(registeredModels.keys()),
    errors: registrationErrors.length > 0 ? registrationErrors.map(e => `${e.modelName}: ${e.error}`) : undefined
});

// Validate essential models are registered
const essentialModels = ['User', 'Organization', 'Role', 'Permission', 'AuditLog'];
const missingEssential = essentialModels.filter(modelName => !registeredModels.has(modelName));

if (missingEssential.length > 0) {
    logger.warn('Some essential models failed to register', {
        missing: missingEssential,
        registered: essentialModels.filter(modelName => registeredModels.has(modelName))
    });
}

// ============================================================================
// DATABASE ROUTING VALIDATION - Enhanced
// ============================================================================

if (BaseModel.isMultiDatabaseEnabled && BaseModel.isMultiDatabaseEnabled()) {
    logger.info('Validating database routing for registered models...');
    
    const routingValidation = {
        admin: [],
        shared: [],
        audit: [],
        analytics: [],
        unmapped: []
    };

    for (const [modelName, model] of registeredModels) {
        try {
            const collectionName = model.collection?.name || 
                                 (BaseModel.pluralize ? BaseModel.pluralize(modelName.toLowerCase()) : modelName.toLowerCase() + 's');
            const databaseType = BaseModel.getDatabaseTypeForCollection ? BaseModel.getDatabaseTypeForCollection(collectionName) : null;
            
            if (databaseType && routingValidation[databaseType]) {
                routingValidation[databaseType].push({
                    model: modelName,
                    collection: collectionName
                });
            } else {
                routingValidation.unmapped.push({
                    model: modelName,
                    collection: collectionName
                });
            }
        } catch (routingError) {
            logger.warn(`Database routing validation failed for ${modelName}`, {
                error: routingError.message
            });
            routingValidation.unmapped.push({
                model: modelName,
                collection: 'unknown',
                error: routingError.message
            });
        }
    }

    logger.info('Database routing validation completed', {
        admin: routingValidation.admin.length,
        shared: routingValidation.shared.length,
        audit: routingValidation.audit.length,
        analytics: routingValidation.analytics.length,
        unmapped: routingValidation.unmapped.length,
        details: routingValidation
    });

    // Log potential issues
    if (routingValidation.unmapped.length > 0) {
        logger.warn('Some models are not mapped to specific databases', {
            unmappedModels: routingValidation.unmapped.map(item => item.model)
        });
    }
}

// ============================================================================
// EXPORT MODELS INDEX - Enhanced
// ============================================================================

const modelsIndex = {
    // Export all registered models
    ...Object.fromEntries(registeredModels),
    
    // Core model exports (maintained from original)
    BaseModel,

    // Users
    User,
    UserProfile,
    UserSession,
    UserActivity,
    LoginHistory,
    Permission,
    AnonymizedUser,

    // Organizations
    Organization,
    OrganizationMember,
    OrganizationInvitation,
    Tenant,

    // Security & Permissions
    Role,
    SecurityIncident,
    AuditLog,
    AuditAlert,
    AuditExport,
    AuditRetentionPolicy,
    ComplianceMapping,

    // Authentication
    Passkey,
    OAuthProvider,
    SessionData,

    // Privacy & Compliance
    Consent,
    DataBreach,
    ErasureLog,
    ProcessingActivity,

    // Billing
    PaymentMethod,
    Subscription,
    SubscriptionPlan,
    UsageRecord,

    // Platform
    ApiIntegration,
    ApiUsage,
    Notification,
    SystemConfiguration,
    Webhook,

    // Utility functions (maintained from original)
    getRegisteredModels: () => new Map(registeredModels),
    getRegistrationErrors: () => [...registrationErrors],
    getRegistrationSummary: () => ({
        total: totalAttempted,
        successful: successCount,
        failed: errorCount,
        essentialModelsRegistered: essentialModels.filter(name => registeredModels.has(name)).length,
        essentialModelsTotal: essentialModels.length,
        models: Array.from(registeredModels.keys())
    }),
    
    // Export specific model getters for common models (maintained from original)
    getUserModel: () => registeredModels.get('User'),
    getOrganizationModel: () => registeredModels.get('Organization'),
    getRoleModel: () => registeredModels.get('Role'),
    getPermissionModel: () => registeredModels.get('Permission'),
    getAuditLogModel: () => registeredModels.get('AuditLog'),
    
    // ENHANCED: Export database type utilities
    getModelsForDatabase: (databaseType) => {
        const models = [];
        for (const [modelName, model] of registeredModels) {
            try {
                const collectionName = model.collection?.name || 
                                     (BaseModel.pluralize ? BaseModel.pluralize(modelName.toLowerCase()) : modelName.toLowerCase() + 's');
                if (BaseModel.getDatabaseTypeForCollection && BaseModel.getDatabaseTypeForCollection(collectionName) === databaseType) {
                    models.push({ modelName, model, collectionName });
                }
            } catch (error) {
                // Skip models that can't be processed
            }
        }
        return models;
    },

    // ENHANCED: Database routing utilities
    getDatabaseRouting: () => {
        const routing = {
            admin: [],
            shared: [],
            audit: [],
            analytics: [],
            unmapped: []
        };

        for (const [modelName, model] of registeredModels) {
            try {
                const collectionName = model.collection?.name || 
                                     (BaseModel.pluralize ? BaseModel.pluralize(modelName.toLowerCase()) : modelName.toLowerCase() + 's');
                const databaseType = BaseModel.getDatabaseTypeForCollection ? BaseModel.getDatabaseTypeForCollection(collectionName) : null;
                
                if (databaseType && routing[databaseType]) {
                    routing[databaseType].push({ modelName, collectionName });
                } else {
                    routing.unmapped.push({ modelName, collectionName });
                }
            } catch (error) {
                routing.unmapped.push({ modelName, collectionName: 'unknown' });
            }
        }

        return routing;
    },

    // ENHANCED: Collection mapping utilities
    getCollectionDatabaseMapping: () => {
        if (BaseModel.getAllCollectionMappings) {
            return BaseModel.getAllCollectionMappings();
        }
        return new Map();
    },

    // ENHANCED: Validation utilities
    validateRegistration: () => {
        const validation = {
            isValid: true,
            issues: [],
            statistics: {
                total: totalAttempted,
                successful: successCount,
                failed: errorCount,
                essentialComplete: missingEssential.length === 0
            }
        };

        if (errorCount > 0) {
            validation.isValid = false;
            validation.issues.push(`${errorCount} models failed to register`);
        }

        if (missingEssential.length > 0) {
            validation.isValid = false;
            validation.issues.push(`Missing essential models: ${missingEssential.join(', ')}`);
        }

        if (BaseModel.isMultiDatabaseEnabled && BaseModel.isMultiDatabaseEnabled()) {
            const routing = modelsIndex.getDatabaseRouting();
            if (routing.unmapped.length > 0) {
                validation.issues.push(`${routing.unmapped.length} models have no database routing`);
            }
        }

        return validation;
    }
};

// Also export individual models for convenient access (maintained from original)
modelsIndex.models = Object.fromEntries(registeredModels);

logger.info('Models index module loaded successfully', {
    exportedModels: Object.keys(modelsIndex).length - 10, // Subtract utility functions
    totalRegistered: registeredModels.size,
    hasErrors: registrationErrors.length > 0,
    multiDatabaseEnabled: BaseModel.isMultiDatabaseEnabled ? BaseModel.isMultiDatabaseEnabled() : false
});

module.exports = modelsIndex;