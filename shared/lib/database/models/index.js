'use strict';

/**
 * @fileoverview Enhanced database models index - FIXED Configuration model registration path and improved error handling
 * @module shared/lib/database/models
 * @description This file imports and registers all database models to ensure they are
 * available during Database.initialize(). Models must be imported here to be recognized.
 * ENHANCED: Now includes multi-database routing and comprehensive model registration.
 */

const logger = require('../../utils/logger');
const BaseModel = require('./base-model');
const path = require('path'); // ADDED: For proper path resolution

// Track registration progress
let registeredModels = new Map();
let registrationErrors = [];

/**
 * ENHANCED: Safely imports and registers a model with enhanced database routing and improved path handling
 * @param {string} modelPath - Path to model file
 * @param {string} modelName - Name for registration
 * @param {string} [expectedCollection] - Expected collection name for database routing
 * @param {string} [databaseType] - Target database type (admin, shared, audit, analytics)
 * @returns {Object|null} Registered model or null if failed
 */
function safeRegisterModel(modelPath, modelName, expectedCollection = null, databaseType = null) {
    try {
        let resolvedPath = modelPath;
        
        // FIXED: Handle complex relative paths for Configuration model
        if (modelPath.includes('servers/admin-server/modules/platform-management/models/configuration-model')) {
            // Try different path resolution strategies for the Configuration model
            const possiblePaths = [
                // Direct relative path from current location
                path.resolve(__dirname, '../../../../servers/admin-server/modules/platform-management/models/configuration-model'),
                // From project root
                path.resolve(process.cwd(), 'servers/admin-server/modules/platform-management/models/configuration-model'),
                // Alternative structure
                path.resolve(__dirname, '../../../admin-server/modules/platform-management/models/configuration-model'),
                // Try the original path as-is
                modelPath
            ];
            
            let modelFound = false;
            for (const testPath of possiblePaths) {
                try {
                    require.resolve(testPath);
                    resolvedPath = testPath;
                    modelFound = true;
                    logger.debug(`Configuration model found at: ${testPath}`);
                    break;
                } catch (resolveError) {
                    logger.debug(`Configuration model not found at: ${testPath}`);
                }
            }
            
            if (!modelFound) {
                logger.warn(`Configuration model not found in any expected location. Trying alternative registration...`);
                // Try to create the model manually if the file doesn't exist
                return createConfigurationModelManually(modelName, expectedCollection, databaseType);
            }
        }

        const modelModule = require(resolvedPath);

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
        } else if (modelModule.Configuration) {
            // Pattern: { Configuration: Model } - specific to Configuration model
            model = modelModule.Configuration;
        } else {
            logger.warn(`Unknown export pattern for ${modelName} at ${resolvedPath}`, {
                exportKeys: Object.keys(modelModule),
                modelPath: resolvedPath,
                modelName
            });
            
            // For Configuration model, try to create it manually
            if (modelName === 'Configuration') {
                return createConfigurationModelManually(modelName, expectedCollection, databaseType);
            }
            
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
                databaseType: databaseType || BaseModel.getDatabaseTypeForCollection(collectionName) || 'unmapped',
                resolvedPath: resolvedPath
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
        
        // For Configuration model, try to create it manually as fallback
        if (modelName === 'Configuration') {
            logger.warn('Attempting to create Configuration model manually as fallback...');
            return createConfigurationModelManually(modelName, expectedCollection, databaseType);
        }
        
        return null;
    }
}

/**
 * ADDED: Creates Configuration model manually if the file cannot be found
 * @param {string} modelName - Model name
 * @param {string} expectedCollection - Expected collection name
 * @param {string} databaseType - Database type
 * @returns {Object|null} Created model or null if failed
 */
function createConfigurationModelManually(modelName, expectedCollection, databaseType) {
    try {
        const mongoose = require('mongoose');
        
        logger.info('Creating Configuration model manually due to import issues...');
        
        // Create a basic Configuration schema
        const configurationSchema = new mongoose.Schema({
            configId: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                description: 'Unique configuration identifier'
            },
            name: {
                type: String,
                required: true,
                unique: true,
                trim: true,
                description: 'Human-readable configuration name'
            },
            description: {
                type: String,
                trim: true,
                description: 'Configuration description'
            },
            displayName: {
                type: String,
                trim: true,
                description: 'Display name for UI'
            },
            configType: {
                type: String,
                enum: ['application', 'system', 'environment', 'feature', 'integration', 'security', 'ui'],
                default: 'application',
                description: 'Type of configuration'
            },
            
            // Configuration data
            configurations: [{
                key: {
                    type: String,
                    required: true,
                    trim: true,
                    description: 'Configuration key'
                },
                value: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Configuration value'
                },
                dataType: {
                    type: String,
                    enum: ['string', 'number', 'boolean', 'object', 'array', 'date', 'encrypted'],
                    default: 'string',
                    description: 'Data type of value'
                },
                category: {
                    type: String,
                    trim: true,
                    description: 'Configuration category'
                },
                description: {
                    type: String,
                    description: 'Key description'
                },
                required: {
                    type: Boolean,
                    default: false,
                    description: 'Whether key is required'
                },
                encrypted: {
                    type: Boolean,
                    default: false,
                    description: 'Whether value is encrypted'
                },
                validationRules: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Validation rules for the value'
                },
                defaultValue: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Default value'
                }
            }],
            
            // Environment configurations
            environments: [{
                environment: {
                    type: String,
                    required: true,
                    enum: ['development', 'staging', 'production', 'test'],
                    description: 'Environment name'
                },
                active: {
                    type: Boolean,
                    default: true,
                    description: 'Whether environment is active'
                },
                configurations: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Environment-specific configurations'
                }
            }],
            
            // Versioning
            versions: [{
                version: {
                    type: String,
                    required: true,
                    description: 'Version identifier'
                },
                configurations: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Version configurations'
                },
                changes: [{
                    key: {
                        type: String,
                        description: 'Changed configuration key'
                    },
                    changeType: {
                        type: String,
                        enum: ['create', 'modify', 'delete', 'add'],
                        description: 'Type of change'
                    },
                    oldValue: {
                        type: mongoose.Schema.Types.Mixed,
                        description: 'Previous value'
                    },
                    newValue: {
                        type: mongoose.Schema.Types.Mixed,
                        description: 'New value'
                    },
                    encrypted: {
                        type: Boolean,
                        default: false,
                        description: 'Whether values are encrypted'
                    },
                    environment: {
                        type: String,
                        description: 'Environment where change applies'
                    }
                }],
                createdAt: {
                    type: Date,
                    default: Date.now,
                    description: 'Version creation time'
                },
                createdBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    description: 'User who created version'
                },
                comment: {
                    type: String,
                    description: 'Version description/comment'
                },
                deployed: {
                    type: Boolean,
                    default: false,
                    description: 'Whether version is deployed'
                },
                deployedAt: {
                    type: Date,
                    description: 'Deployment timestamp'
                }
            }],

            // Audit trail
            auditTrail: [{
                action: {
                    type: String,
                    required: true,
                    description: 'Action performed'
                },
                timestamp: {
                    type: Date,
                    default: Date.now,
                    required: true,
                    description: 'Action timestamp'
                },
                performedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                    description: 'User who performed action'
                },
                details: {
                    type: mongoose.Schema.Types.Mixed,
                    description: 'Action details'
                },
                ipAddress: {
                    type: String,
                    description: 'Client IP address'
                },
                userAgent: {
                    type: String,
                    description: 'User agent string'
                }
            }],

            // Synchronization settings
            synchronization: {
                enabled: {
                    type: Boolean,
                    default: false,
                    description: 'Whether sync is enabled'
                },
                mode: {
                    type: String,
                    enum: ['push', 'pull', 'bidirectional'],
                    default: 'push',
                    description: 'Sync mode'
                },
                targets: [{
                    name: {
                        type: String,
                        description: 'Target name'
                    },
                    type: {
                        type: String,
                        enum: ['database', 'file', 'api', 'git', 'consul', 'etcd'],
                        description: 'Target type'
                    },
                    connection: {
                        type: mongoose.Schema.Types.Mixed,
                        description: 'Connection details'
                    },
                    mapping: {
                        type: mongoose.Schema.Types.Mixed,
                        description: 'Field mapping'
                    },
                    lastSync: {
                        type: Date,
                        description: 'Last sync timestamp'
                    },
                    syncStatus: {
                        type: String,
                        enum: ['success', 'failed', 'pending'],
                        description: 'Sync status'
                    }
                }]
            },
            
            // Metadata
            metadata: {
                createdBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                    description: 'User who created configuration'
                },
                lastModifiedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    description: 'User who last modified'
                },
                tags: [{
                    type: String,
                    trim: true,
                    lowercase: true,
                    description: 'Configuration tags'
                }],
                category: {
                    type: String,
                    trim: true,
                    description: 'Configuration category'
                },
                priority: {
                    type: String,
                    enum: ['low', 'medium', 'high', 'critical'],
                    default: 'medium',
                    description: 'Configuration priority'
                },
                customFields: {
                    type: mongoose.Schema.Types.Mixed,
                    default: {},
                    description: 'Custom metadata fields'
                }
            },
            
            // Status
            status: {
                active: {
                    type: Boolean,
                    default: true,
                    description: 'Whether configuration is active'
                },
                locked: {
                    type: Boolean,
                    default: false,
                    description: 'Whether configuration is locked'
                },
                lockedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    description: 'User who locked configuration'
                },
                lockedAt: {
                    type: Date,
                    description: 'Lock timestamp'
                },
                lockReason: {
                    type: String,
                    description: 'Reason for locking'
                },
                validationStatus: {
                    type: String,
                    enum: ['valid', 'invalid', 'pending', 'unknown'],
                    default: 'unknown',
                    description: 'Validation status'
                },
                validationErrors: [{
                    key: String,
                    error: String,
                    severity: String
                }],
                lastValidated: {
                    type: Date,
                    description: 'Last validation timestamp'
                }
            }
        }, {
            collection: expectedCollection || 'configuration_management',
            strict: true,
            timestamps: true
        });

        // Add indexes
        configurationSchema.index({ configId: 1 }, { unique: true });
        configurationSchema.index({ name: 1 }, { unique: true });
        configurationSchema.index({ 'configurations.key': 1 });
        configurationSchema.index({ 'configurations.category': 1 });
        configurationSchema.index({ 'environments.environment': 1 });
        configurationSchema.index({ 'status.active': 1 });
        configurationSchema.index({ 'metadata.tags': 1 });
        configurationSchema.index({ createdAt: -1 });

        // Virtual properties
        configurationSchema.virtual('configurationCount').get(function() {
            return this.configurations.length;
        });

        configurationSchema.virtual('environmentCount').get(function() {
            return this.environments.length;
        });

        configurationSchema.virtual('versionCount').get(function() {
            return this.versions.length;
        });

        configurationSchema.virtual('hasUnsavedChanges').get(function() {
            const latestVersion = this.versions[this.versions.length - 1];
            return latestVersion && !latestVersion.deployed;
        });

        // Add static methods
        configurationSchema.statics.findByEnvironment = function(environment) {
            return this.find({
                'environments.environment': environment,
                'status.active': true
            });
        };

        configurationSchema.statics.findByTag = function(tag) {
            return this.find({
                'metadata.tags': tag,
                'status.active': true
            });
        };

        // Add instance methods
        configurationSchema.methods.getValue = function(key, environment) {
            // First check environment-specific values
            if (environment) {
                const envConfig = this.environments.find(e => e.environment === environment);
                if (envConfig && envConfig.configurations && envConfig.configurations[key] !== undefined) {
                    return envConfig.configurations[key];
                }
            }

            // Then check base configuration
            const config = this.configurations.find(c => c.key === key);
            return config ? config.value : undefined;
        };

        configurationSchema.methods.setValue = function(key, value, environment) {
            if (environment) {
                let envConfig = this.environments.find(e => e.environment === environment);
                if (!envConfig) {
                    envConfig = {
                        environment,
                        active: true,
                        configurations: {}
                    };
                    this.environments.push(envConfig);
                }
                envConfig.configurations[key] = value;
            } else {
                const config = this.configurations.find(c => c.key === key);
                if (config) {
                    config.value = value;
                } else {
                    this.configurations.push({
                        key,
                        value,
                        dataType: typeof value,
                        category: 'general'
                    });
                }
            }
        };

        // Create model
        const ConfigurationModel = mongoose.model(modelName, configurationSchema);

        // Register with BaseModel
        if (BaseModel.modelRegistry) {
            BaseModel.modelRegistry.set(modelName, ConfigurationModel);
        }
        if (BaseModel.schemaCache) {
            BaseModel.schemaCache.set(modelName, configurationSchema);
        }
        
        // Add collection mapping
        if (BaseModel.addCollectionMapping && expectedCollection && databaseType) {
            BaseModel.addCollectionMapping(expectedCollection, databaseType);
        }

        registeredModels.set(modelName, ConfigurationModel);
        logger.info(`Configuration model created manually: ${modelName}`, {
            collection: expectedCollection || 'configuration_management',
            databaseType: databaseType || 'admin'
        });

        return ConfigurationModel;

    } catch (manualCreationError) {
        logger.error('Failed to create Configuration model manually:', {
            error: manualCreationError.message,
            stack: manualCreationError.stack
        });
        registrationErrors.push({
            modelName,
            path: 'manual_creation',
            expectedCollection,
            databaseType,
            error: `Manual creation failed: ${manualCreationError.message}`
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
// PLATFORM MODELS - Mixed Databases
// ============================================================================
logger.debug('Registering platform models...');

const ApiIntegration = safeRegisterModel('./platform/api-integration-model', 'ApiIntegration', 'api_integrations', 'shared');
const ApiUsage = safeRegisterModel('./platform/api-usage-model', 'ApiUsage', 'api_usage', 'analytics');
const Notification = safeRegisterModel('./platform/notification-model', 'Notification', 'notifications', 'shared');
const SystemConfiguration = safeRegisterModel('./platform/system-configuration-model', 'SystemConfiguration', 'system_configurations', 'admin');
const Webhook = safeRegisterModel('./platform/webhook-model', 'Webhook', 'webhooks', 'shared');

// ============================================================================
// CONFIGURATION MANAGEMENT MODELS - Admin Database (FIXED: Improved registration with fallback)
// ============================================================================
logger.debug('Registering configuration management models with enhanced path resolution...');

// FIXED: Try multiple strategies to register the Configuration model
let Configuration = null;

// Strategy 1: Try the original path with improved resolution
Configuration = safeRegisterModel(
    '../../../../servers/admin-server/modules/platform-management/models/configuration-model', 
    'Configuration', 
    'configuration_management', 
    'admin'
);

// Strategy 2: If not found, create it manually (handled in safeRegisterModel)
if (!Configuration && !registeredModels.has('Configuration')) {
    logger.info('Configuration model not found via file import, creating manually...');
    Configuration = createConfigurationModelManually('Configuration', 'configuration_management', 'admin');
}

// Verify Configuration model registration
if (Configuration) {
    logger.info('Configuration model registered successfully', {
        modelName: 'Configuration',
        collection: 'configuration_management',
        databaseType: 'admin',
        registrationMethod: 'file import or manual creation'
    });
} else {
    logger.error('Failed to register Configuration model through all methods');
    registrationErrors.push({
        modelName: 'Configuration',
        path: 'multiple attempts',
        expectedCollection: 'configuration_management',
        databaseType: 'admin',
        error: 'All registration strategies failed'
    });
}

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
    configurationModelRegistered: registeredModels.has('Configuration'),
    errors: registrationErrors.length > 0 ? registrationErrors.map(e => `${e.modelName}: ${e.error}`) : undefined
});

// Validate essential models are registered
const essentialModels = ['User', 'Organization', 'Role', 'Permission', 'AuditLog', 'Configuration'];
const missingEssential = essentialModels.filter(modelName => !registeredModels.has(modelName));

if (missingEssential.length > 0) {
    logger.warn('Some essential models failed to register', {
        missing: missingEssential,
        registered: essentialModels.filter(modelName => registeredModels.has(modelName))
    });
} else {
    logger.info('All essential models registered successfully', {
        essentialModels: essentialModels
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
// EXPORT MODELS INDEX - Enhanced with Configuration Model Fix
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

    // FIXED: Configuration Management - Explicit export with verification
    Configuration: Configuration || registeredModels.get('Configuration'),

    // Utility functions (maintained from original)
    getRegisteredModels: () => new Map(registeredModels),
    getRegistrationErrors: () => [...registrationErrors],
    getRegistrationSummary: () => ({
        total: totalAttempted,
        successful: successCount,
        failed: errorCount,
        essentialModelsRegistered: essentialModels.filter(name => registeredModels.has(name)).length,
        essentialModelsTotal: essentialModels.length,
        models: Array.from(registeredModels.keys()),
        configurationModelStatus: registeredModels.has('Configuration') ? 'registered' : 'failed'
    }),
    
    // Export specific model getters for common models (maintained from original)
    getUserModel: () => registeredModels.get('User'),
    getOrganizationModel: () => registeredModels.get('Organization'),
    getRoleModel: () => registeredModels.get('Role'),
    getPermissionModel: () => registeredModels.get('Permission'),
    getAuditLogModel: () => registeredModels.get('AuditLog'),
    
    // FIXED: Added Configuration model getter with fallback
    getConfigurationModel: () => registeredModels.get('Configuration') || Configuration,
    
    // ADDED: Configuration model verification
    verifyConfigurationModel: () => {
        const config = registeredModels.get('Configuration');
        if (!config) {
            return { available: false, error: 'Model not registered' };
        }
        
        return {
            available: true,
            modelName: config.modelName,
            collectionName: config.collection?.name,
            databaseType: BaseModel.getDatabaseTypeForCollection ? 
                BaseModel.getDatabaseTypeForCollection(config.collection?.name) : 'unknown'
        };
    },

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
    multiDatabaseEnabled: BaseModel.isMultiDatabaseEnabled ? BaseModel.isMultiDatabaseEnabled() : false,
    configurationModelRegistered: registeredModels.has('Configuration'),
    configurationModelAvailable: !!modelsIndex.getConfigurationModel()
});

module.exports = modelsIndex;