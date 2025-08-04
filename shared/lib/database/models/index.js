'use strict';

/**
 * @fileoverview Database models index - Registers all models with BaseModel
 * @module shared/lib/database/models
 * @description This file imports and registers all database models to ensure they are
 * available during Database.initialize(). Models must be imported here to be recognized.
 */

const logger = require('../../utils/logger');
const BaseModel = require('./base-model');

// Track registration progress
let registeredModels = new Map();
let registrationErrors = [];

/**
 * Safely imports and registers a model
 * @param {string} modelPath - Path to model file
 * @param {string} modelName - Name for registration
 * @returns {Object|null} Registered model or null if failed
 */
function safeRegisterModel(modelPath, modelName) {
    try {
        const modelModule = require(modelPath);

        // Handle different export patterns
        let model = null;
        let schema = null;

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
            logger.warn(`Unknown export pattern for ${modelName} at ${modelPath}`);
            return null;
        }

        if (model) {
            // Register with BaseModel if not already registered
            if (BaseModel.modelRegistry && !BaseModel.modelRegistry.has(modelName)) {
                BaseModel.modelRegistry.set(modelName, model);

                if (schema && BaseModel.schemaCache) {
                    BaseModel.schemaCache.set(modelName, schema);
                }
            }

            registeredModels.set(modelName, model);
            logger.debug(`Registered model: ${modelName}`);
            return model;
        }

        return null;

    } catch (error) {
        const errorMsg = `Failed to register ${modelName}: ${error.message}`;
        logger.error(errorMsg);
        registrationErrors.push({ modelName, path: modelPath, error: error.message });
        return null;
    }
}

// ============================================================================
// INITIALIZE BASE MODEL REGISTRIES
// ============================================================================
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

// Base model (already imported above, but ensure it's initialized)
logger.debug('Registering core models...');

// ============================================================================
// USER MODELS
// ============================================================================
logger.debug('Registering user models...');

const User = safeRegisterModel('./users/user-model', 'User');
const UserProfile = safeRegisterModel('./users/user-profile-model', 'UserProfile');
const UserSession = safeRegisterModel('./users/session-model', 'UserSession');
const UserActivity = safeRegisterModel('./users/user-activity-model', 'UserActivity');
const LoginHistory = safeRegisterModel('./users/login-history-model', 'LoginHistory');
const Permission = safeRegisterModel('./users/permission-model', 'Permission');
const AnonymizedUser = safeRegisterModel('./users/anonymized-user-model', 'AnonymizedUser');

// ============================================================================
// ORGANIZATION MODELS
// ============================================================================
logger.debug('Registering organization models...');

const Organization = safeRegisterModel('./organizations/organization-model', 'Organization');
const OrganizationMember = safeRegisterModel('./organizations/organization-member-model', 'OrganizationMember');
const OrganizationInvitation = safeRegisterModel('./organizations/organization-invitation-model', 'OrganizationInvitation');
const Tenant = safeRegisterModel('./organizations/tenant-model', 'Tenant');

// ============================================================================
// SECURITY & PERMISSIONS MODELS
// ============================================================================
logger.debug('Registering security models...');

const Role = safeRegisterModel('./users/role-model', 'Role');
const SecurityIncident = safeRegisterModel('./security/security-incident-model', 'SecurityIncident');
const AuditLog = safeRegisterModel('./security/audit-log-model', 'AuditLog');
const AuditAlert = safeRegisterModel('./security/audit-alert-model', 'AuditAlert');
const AuditExport = safeRegisterModel('./security/audit-export-model', 'AuditExport');
const AuditRetentionPolicy = safeRegisterModel('./security/audit-retention-policy-model', 'AuditRetentionPolicy');
const ComplianceMapping = safeRegisterModel('./security/compliance-mapping-model', 'ComplianceMapping');

// ============================================================================
// AUTHENTICATION MODELS
// ============================================================================
logger.debug('Registering authentication models...');

const Passkey = safeRegisterModel('./users/passkey-model', 'Passkey');
const OAuthProvider = safeRegisterModel('./users/oauth-provider-model', 'OAuthProvider');
const SessionData = safeRegisterModel('./users/session-model', 'SessionData');

// ============================================================================
// PRIVACY & COMPLIANCE MODELS
// ============================================================================
logger.debug('Registering privacy models...');

const Consent = safeRegisterModel('./users/consent-model', 'Consent');
const DataBreach = safeRegisterModel('./security/data-breach-model', 'DataBreach');
const ErasureLog = safeRegisterModel('./security/erasure-log-model', 'ErasureLog');
const ProcessingActivity = safeRegisterModel('./security/processing-activity-model', 'ProcessingActivity');

// ============================================================================
// BILLING & SUBSCRIPTION MODELS
// ============================================================================
logger.debug('Registering billing models...');

const PaymentMethod = safeRegisterModel('./billing/payment-method-model', 'PaymentMethod');
const Subscription = safeRegisterModel('./billing/subscription-model', 'Subscription');
const SubscriptionPlan = safeRegisterModel('./billing/subscription-plan-model', 'SubscriptionPlan');
const UsageTracking = safeRegisterModel('./billing/usage-record-model', 'UsageTracking');

// ============================================================================
// PLATFORM MODELS
// ============================================================================
logger.debug('Registering platform models...');

const ApiIntegration = safeRegisterModel('./platform/api-integration-model', 'ApiIntegration');
const ApiUsage = safeRegisterModel('./platform/api-usage-model', 'ApiUsage');
const Notification = safeRegisterModel('./platform/notification-model', 'Notification');
const SystemConfiguration = safeRegisterModel('./platform/system-configuration-model', 'SystemConfiguration');
const Webhook = safeRegisterModel('./platform/webhook-model', 'Webhook');
const CorsWhitelist = safeRegisterModel('./security/cors-whitelist-model', 'CorsWhitelist');

// ============================================================================
// REGISTRATION SUMMARY
// ============================================================================

const totalAttempted = registeredModels.size + registrationErrors.length;
const successCount = registeredModels.size;
const errorCount = registrationErrors.length;

logger.info('Model registration completed', {
    attempted: totalAttempted,
    successful: successCount,
    failed: errorCount,
    registeredModels: Array.from(registeredModels.keys()),
    errors: registrationErrors.length > 0 ? registrationErrors : undefined
});

// Log errors if any
if (registrationErrors.length > 0) {
    logger.warn('Some models failed to register:', {
        errors: registrationErrors.map(e => `${e.modelName}: ${e.error}`)
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export all successfully registered models
module.exports = {
    // Core
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
    UsageTracking,

    // Platform
    ApiIntegration,
    ApiUsage,
    Notification,
    SystemConfiguration,
    Webhook,
    CorsWhitelist,

    // Utility functions
    getRegisteredModels: () => new Map(registeredModels),
    getRegistrationErrors: () => [...registrationErrors],
    getRegistrationSummary: () => ({
        total: totalAttempted,
        successful: successCount,
        failed: errorCount,
        models: Array.from(registeredModels.keys())
    })
};

// Also export individual models for convenient access
module.exports.models = Object.fromEntries(registeredModels);

logger.info('Models index module loaded successfully', {
    exportedModels: Object.keys(module.exports).filter(key =>
        !['getRegisteredModels', 'getRegistrationErrors', 'getRegistrationSummary', 'models'].includes(key)
    ).length
});