'use strict';

/**
 * @fileoverview Enterprise user settings service for comprehensive account management, security, and system configuration
 * @module shared/lib/services/user-management/user-settings-service
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/users/user-settings-model
 * @requires module:shared/lib/database/models/users/user-model
 */

const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../utils/app-error');
const { asyncHandler } = require('../../utils/async-handler');
const CacheService = require('../cache-service');
const EmailService = require('../email-service');
const NotificationService = require('../notification-service');
const AuditService = require('../../security/audit/audit-service');
const UserSettingsModel = require('../../database/models/users/user-settings-model');
const UserModel = require('../../database/models/users/user-model');
const crypto = require('crypto');
const validator = require('validator');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * Enterprise user settings service for comprehensive settings management
 * @class UserSettingsService
 * @description Manages security settings, integrations, billing preferences, compliance, and system configurations
 */
class UserSettingsService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {EmailService}
     */
    #emailService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 1800; // 30 minutes

    /**
     * @private
     * @type {Object}
     */
    #securityPolicies = {
        password: {
            minLength: 8,
            maxLength: 128,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            preventReuse: 5,
            maxAge: 90 // days
        },
        session: {
            maxConcurrent: 5,
            maxDuration: 8, // hours
            idleTimeout: 30, // minutes
            requireReauth: 24 // hours
        },
        twoFactor: {
            gracePeriod: 7, // days
            backupCodesCount: 10,
            allowedMethods: ['totp', 'sms', 'email', 'hardware_key']
        }
    };

    /**
     * @private
     * @type {Map}
     */
    #pendingSettings = new Map();

    /**
     * @private
     * @type {Set}
     */
    #sensitiveFields = new Set([
        'account.recovery.backupCodes',
        'account.recovery.recoveryQuestions',
        'security.passwordReset.token',
        'api.access.keys',
        'integrations.oauth.tokens',
        'custom.userDefinedSettings'
    ]);

    /**
     * @private
     * @type {Object}
     */
    #complianceRequirements = {
        gdpr: {
            dataRetentionMax: 2555, // 7 years in days
            consentRequired: true,
            rightToErasure: true,
            rightToPortability: true
        },
        ccpa: {
            optOutRequired: true,
            dataSaleDisclosure: true,
            deleteRights: true
        },
        hipaa: {
            encryptionRequired: true,
            accessLogging: true,
            minimumNecessary: true
        }
    };

    /**
     * @private
     * @type {Map}
     */
    #configurationProfiles = new Map();

    /**
     * @private
     * @type {Object}
     */
    #integrationValidators = {
        oauth: this.#validateOAuthConfig.bind(this),
        sso: this.#validateSSOConfig.bind(this),
        ldap: this.#validateLDAPConfig.bind(this),
        api: this.#validateAPIConfig.bind(this),
        webhook: this.#validateWebhookConfig.bind(this)
    };

    /**
     * Creates an instance of UserSettingsService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing UserSettingsService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });

        this.#loadConfigurationProfiles();
        this.#setupCleanupIntervals();
    }

    // ==================== PUBLIC METHODS ====================

    /**
     * Create default user settings
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created settings
     */
    async createDefaultSettings(userId, organizationId, options = {}) {
        const { template = 'standard', inheritFromOrg = true } = options;
        const session = options.session || null;

        try {
            // Check if settings already exist
            const existingSettings = await UserSettingsModel.findOne({ userId });
            if (existingSettings) {
                throw new ConflictError('Settings already exist for user', 'SETTINGS_EXIST');
            }

            // Get base settings from template
            const baseSettings = await this.#getSettingsTemplate(template);

            // Apply organization defaults if enabled
            if (inheritFromOrg && organizationId) {
                const orgDefaults = await this.#getOrganizationDefaults(organizationId);
                if (orgDefaults) {
                    Object.assign(baseSettings, orgDefaults);
                }
            }

            // Create settings
            const settings = new UserSettingsModel({
                userId,
                organizationId,
                ...baseSettings,
                metadata: {
                    version: 1,
                    isDefault: true,
                    inheritFromOrganization: inheritFromOrg,
                    configurationProfile: template,
                    lastSyncedAt: new Date()
                }
            });

            await settings.save({ session });

            // Initialize security features
            await this.#initializeSecurityFeatures(settings);

            // Send welcome notification
            await this.#sendSettingsCreationNotifications(settings);

            // Log audit trail
            await this.#auditService.log({
                action: 'SETTINGS_CREATED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId,
                details: {
                    template,
                    organizationId,
                    inheritFromOrg
                }
            });

            logger.info('User settings created', {
                settingsId: settings._id,
                userId,
                template,
                organizationId
            });

            return this.#sanitizeSettingsOutput(settings.toObject());
        } catch (error) {
            logger.error('Error creating user settings', {
                error: error.message,
                userId,
                organizationId
            });
            throw error;
        }
    }

    /**
     * Get user settings with inheritance and population
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User settings
     */
    async getSettings(userId, options = {}) {
        const {
            includeDefaults = true,
            includeSecrets = false,
            category = null,
            requesterId,
            checkPermissions = true
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('settings', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get settings
            let settings = await UserSettingsModel.findByUserId(userId, {
                createIfNotExists: includeDefaults
            });

            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && requesterId && requesterId !== userId) {
                await this.#checkSettingsAccess(settings, requesterId, 'read');
            }

            // Get effective settings with inheritance
            let settingsData = await settings.getEffectiveSettings();

            // Filter by category if specified
            if (category) {
                settingsData = { [category]: settingsData[category] };
            }

            // Sanitize output
            if (!includeSecrets || requesterId !== userId) {
                settingsData = this.#sanitizeSettingsOutput(settingsData);
            }

            // Add computed fields
            settingsData.computed = await this.#calculateSettingsMetrics(settings);

            // Cache result
            await this.#cacheService.set(cacheKey, settingsData, this.#defaultCacheTTL);

            return settingsData;
        } catch (error) {
            logger.error('Error fetching settings', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Update user settings with validation and audit
     * @param {string} userId - User ID
     * @param {Object} updateData - Settings to update
     * @param {string} updatedBy - ID of user making update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated settings
     */
    async updateSettings(userId, updateData, updatedBy, options = {}) {
        const { category = null, requireApproval = false, reason } = options;
        const session = options.session || null;

        try {
            // Get existing settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            await this.#checkSettingsAccess(settings, updatedBy, 'update');

            // Validate update data
            await this.#validateSettingsUpdate(updateData, settings);

            // Check for conflicts
            await this.#checkUpdateConflicts(userId, updateData);

            // Process updates by category
            const processedUpdates = await this.#processSettingsUpdate(
                updateData,
                settings,
                updatedBy,
                { category, requireApproval, reason }
            );

            // Apply updates
            for (const [path, value] of Object.entries(processedUpdates.changes)) {
                await settings.updateSetting(path, value, {
                    reason,
                    requireApproval,
                    approvedBy: requireApproval ? null : updatedBy
                });
            }

            // Handle special configurations
            await this.#handleSpecialConfigurations(settings, updateData, updatedBy);

            // Send notifications for significant changes
            await this.#sendSettingsUpdateNotifications(settings, processedUpdates, updatedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'SETTINGS_UPDATED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: updatedBy,
                details: {
                    targetUserId: userId,
                    updatedPaths: Object.keys(processedUpdates.changes),
                    requireApproval,
                    reason
                }
            });

            // Clear caches
            await this.#clearSettingsCaches(userId);

            logger.info('Settings updated', {
                settingsId: settings._id,
                userId,
                updatedPaths: Object.keys(processedUpdates.changes),
                updatedBy
            });

            return this.#sanitizeSettingsOutput(settings.toObject());
        } catch (error) {
            logger.error('Error updating settings', {
                error: error.message,
                userId,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Configure security settings with advanced options
     * @param {string} userId - User ID
     * @param {Object} securityConfig - Security configuration
     * @param {string} configuredBy - ID of user configuring security
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Updated security settings
     */
    async configureSecuritySettings(userId, securityConfig, configuredBy, options = {}) {
        const { enforcePolicy = true, notifyUser = true } = options;
        const session = options.session || null;

        try {
            // Get settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            await this.#checkSettingsAccess(settings, configuredBy, 'update');

            // Validate security configuration
            await this.#validateSecurityConfiguration(securityConfig, enforcePolicy);

            // Apply security settings
            const securityUpdates = await this.#processSecurityConfiguration(
                securityConfig,
                settings,
                configuredBy
            );

            // Update settings
            Object.assign(settings.security, securityUpdates);
            settings.metadata.lastUpdatedBy = configuredBy;
            await settings.save({ session });

            // Configure MFA if requested
            if (securityConfig.twoFactor?.enabled) {
                await this.#configureMFA(userId, securityConfig.twoFactor, configuredBy);
            }

            // Setup API access if requested
            if (securityConfig.apiAccess?.enabled) {
                await this.#configureAPIAccess(userId, securityConfig.apiAccess, configuredBy);
            }

            // Send notifications
            if (notifyUser) {
                await this.#sendSecurityConfigNotifications(settings, securityUpdates, configuredBy);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'SECURITY_CONFIGURED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    configurations: Object.keys(securityUpdates),
                    enforcePolicy
                }
            });

            // Clear caches
            await this.#clearSettingsCaches(userId);

            logger.info('Security settings configured', {
                settingsId: settings._id,
                userId,
                configurations: Object.keys(securityUpdates),
                configuredBy
            });

            return {
                success: true,
                updatedSettings: securityUpdates,
                warnings: []
            };
        } catch (error) {
            logger.error('Error configuring security settings', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Setup and configure integrations
     * @param {string} userId - User ID
     * @param {string} integrationType - Integration type (oauth, sso, ldap, etc.)
     * @param {Object} integrationConfig - Integration configuration
     * @param {string} configuredBy - ID of user configuring integration
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Integration setup results
     */
    async setupIntegration(userId, integrationType, integrationConfig, configuredBy, options = {}) {
        const { validateConfig = true, testConnection = false } = options;
        const session = options.session || null;

        try {
            // Get settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            await this.#checkSettingsAccess(settings, configuredBy, 'update');

            // Validate integration type
            if (!this.#integrationValidators[integrationType]) {
                throw new ValidationError('Unsupported integration type', 'UNSUPPORTED_INTEGRATION');
            }

            // Validate configuration
            if (validateConfig) {
                await this.#integrationValidators[integrationType](integrationConfig);
            }

            // Test connection if requested
            let connectionTest = null;
            if (testConnection) {
                connectionTest = await this.#testIntegrationConnection(integrationType, integrationConfig);
            }

            // Apply integration configuration
            const integrationResult = await this.#applyIntegrationConfig(
                settings,
                integrationType,
                integrationConfig,
                configuredBy
            );

            await settings.save({ session });

            // Send notifications
            await this.#sendIntegrationNotifications(settings, integrationType, integrationResult, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'INTEGRATION_CONFIGURED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    integrationType,
                    testConnection: !!connectionTest,
                    connectionSuccess: connectionTest?.success
                }
            });

            // Clear caches
            await this.#clearSettingsCaches(userId);

            logger.info('Integration configured', {
                settingsId: settings._id,
                userId,
                integrationType,
                configuredBy
            });

            return {
                success: true,
                integration: integrationResult,
                connectionTest,
                warnings: []
            };
        } catch (error) {
            logger.error('Error setting up integration', {
                error: error.message,
                userId,
                integrationType,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Configure compliance settings (GDPR, CCPA, HIPAA)
     * @param {string} userId - User ID
     * @param {Object} complianceConfig - Compliance configuration
     * @param {string} configuredBy - ID of user configuring compliance
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Compliance configuration results
     */
    async configureCompliance(userId, complianceConfig, configuredBy, options = {}) {
        const { regulatory = [], ipAddress, userAgent } = options;
        const session = options.session || null;

        try {
            // Get settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            await this.#checkSettingsAccess(settings, configuredBy, 'update');

            // Validate compliance configuration
            await this.#validateComplianceConfiguration(complianceConfig, regulatory);

            // Process compliance settings
            const complianceResults = {};

            // Handle GDPR compliance
            if (complianceConfig.gdpr) {
                complianceResults.gdpr = await this.#processGDPRConfiguration(
                    settings,
                    complianceConfig.gdpr,
                    configuredBy,
                    { ipAddress, userAgent }
                );
            }

            // Handle CCPA compliance
            if (complianceConfig.ccpa) {
                complianceResults.ccpa = await this.#processCCPAConfiguration(
                    settings,
                    complianceConfig.ccpa,
                    configuredBy,
                    { ipAddress }
                );
            }

            // Handle HIPAA compliance
            if (complianceConfig.hipaa) {
                complianceResults.hipaa = await this.#processHIPAAConfiguration(
                    settings,
                    complianceConfig.hipaa,
                    configuredBy
                );
            }

            // Handle marketing consent
            if (complianceConfig.marketing) {
                complianceResults.marketing = await this.#processMarketingConsent(
                    settings,
                    complianceConfig.marketing,
                    configuredBy
                );
            }

            await settings.save({ session });

            // Send compliance notifications
            await this.#sendComplianceNotifications(settings, complianceResults, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'COMPLIANCE_CONFIGURED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    regulations: Object.keys(complianceResults),
                    ipAddress,
                    userAgent
                }
            });

            // Clear caches
            await this.#clearSettingsCaches(userId);

            logger.info('Compliance configured', {
                settingsId: settings._id,
                userId,
                regulations: Object.keys(complianceResults),
                configuredBy
            });

            return {
                success: true,
                compliance: complianceResults,
                effectiveDate: new Date(),
                warnings: []
            };
        } catch (error) {
            logger.error('Error configuring compliance', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Export user settings for backup or migration
     * @param {string} userId - User ID
     * @param {Object} options - Export options
     * @returns {Promise<Object>} Exported settings
     */
    async exportSettings(userId, options = {}) {
        const {
            format = 'json',
            includeSecrets = false,
            categories = null,
            requesterId,
            encryptSecrets = true
        } = options;

        try {
            // Get settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            if (requesterId !== userId) {
                await this.#checkSettingsAccess(settings, requesterId, 'read');
            }

            // Export settings
            const exportData = settings.exportSettings(format, includeSecrets);

            // Filter categories if specified
            let processedData = typeof exportData === 'string' ? JSON.parse(exportData) : exportData;

            if (categories && Array.isArray(categories)) {
                const filteredData = {};
                categories.forEach(category => {
                    if (processedData[category]) {
                        filteredData[category] = processedData[category];
                    }
                });
                processedData = filteredData;
            }

            // Encrypt secrets if requested
            if (includeSecrets && encryptSecrets) {
                processedData = await this.#encryptSensitiveFields(processedData);
            }

            // Add export metadata
            const exportResult = {
                userId,
                exportedAt: new Date(),
                version: settings.metadata.version,
                format,
                categories: categories || Object.keys(processedData),
                data: processedData
            };

            // Log export activity
            await this.#auditService.log({
                action: 'SETTINGS_EXPORTED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: requesterId || userId,
                details: {
                    format,
                    includeSecrets,
                    categories: exportResult.categories
                }
            });

            logger.info('Settings exported', {
                settingsId: settings._id,
                userId,
                format,
                requesterId
            });

            return exportResult;
        } catch (error) {
            logger.error('Error exporting settings', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Import settings from backup or migration
     * @param {string} userId - User ID
     * @param {Object} importData - Settings data to import
     * @param {string} importedBy - ID of user performing import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importSettings(userId, importData, importedBy, options = {}) {
        const {
            mergeStrategy = 'merge',
            validateData = true,
            decryptSecrets = true,
            categories = null
        } = options;
        const session = options.session || null;

        try {
            // Get settings
            let settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                settings = await this.createDefaultSettings(userId, null, { session });
            }

            // Check permissions
            await this.#checkSettingsAccess(settings, importedBy, 'update');

            // Validate import data
            if (validateData) {
                await this.#validateImportData(importData);
            }

            // Decrypt secrets if needed
            let processedData = importData.data || importData;
            if (decryptSecrets && importData.encrypted) {
                processedData = await this.#decryptSensitiveFields(processedData);
            }

            // Import settings
            const importResults = await settings.importSettings(processedData, {
                overwrite: mergeStrategy === 'replace',
                categories,
                validateOnly: false
            });

            await settings.save({ session });

            // Validate imported configurations
            const validationResults = await this.#validateImportedConfigurations(settings);

            // Send notifications
            await this.#sendImportNotifications(settings, importResults, importedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'SETTINGS_IMPORTED',
                entityType: 'user_settings',
                entityId: settings._id,
                userId: importedBy,
                details: {
                    targetUserId: userId,
                    mergeStrategy,
                    categories: categories || Object.keys(processedData),
                    version: importData.version
                }
            });

            // Clear caches
            await this.#clearSettingsCaches(userId);

            logger.info('Settings imported', {
                settingsId: settings._id,
                userId,
                mergeStrategy,
                importedBy
            });

            return {
                success: true,
                importResults,
                validationResults,
                warnings: []
            };
        } catch (error) {
            logger.error('Error importing settings', {
                error: error.message,
                userId,
                importedBy
            });
            throw error;
        }
    }

    /**
     * Get settings analytics and compliance reports
     * @param {string} userId - User ID
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Settings analytics
     */
    async getSettingsAnalytics(userId, options = {}) {
        const { includeCompliance = true, includeUsage = true, requesterId } = options;

        try {
            // Get settings
            const settings = await UserSettingsModel.findByUserId(userId);
            if (!settings) {
                throw new NotFoundError('Settings not found', 'SETTINGS_NOT_FOUND');
            }

            // Check permissions
            if (requesterId !== userId) {
                await this.#checkSettingsAccess(settings, requesterId, 'read');
            }

            // Check cache
            const cacheKey = this.#generateCacheKey('analytics', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            const analytics = {};

            // Security analytics
            analytics.security = {
                securityScore: this.#calculateSecurityScore(settings),
                mfaEnabled: settings.security.twoFactor.required,
                passwordAge: this.#calculatePasswordAge(settings),
                sessionSecurity: this.#analyzeSessionSecurity(settings),
                apiSecurity: this.#analyzeAPISecurity(settings)
            };

            // Compliance analytics
            if (includeCompliance) {
                analytics.compliance = {
                    gdprCompliance: this.#assessGDPRCompliance(settings),
                    ccpaCompliance: this.#assessCCPACompliance(settings),
                    dataRetention: this.#analyzeDataRetention(settings),
                    consentStatus: this.#analyzeConsentStatus(settings)
                };
            }

            // Usage analytics
            if (includeUsage) {
                analytics.usage = {
                    integrations: this.#analyzeIntegrationUsage(settings),
                    apiUsage: this.#analyzeAPIUsage(settings),
                    featureAdoption: this.#analyzeFeatureAdoption(settings),
                    configurationChanges: this.#analyzeConfigurationHistory(settings)
                };
            }

            // Cache results
            await this.#cacheService.set(cacheKey, analytics, 1800); // 30 minutes

            return analytics;
        } catch (error) {
            logger.error('Error getting settings analytics', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Bulk update settings for multiple users
     * @param {Array} updates - Array of user settings updates
     * @param {string} updatedBy - ID of user performing bulk update
     * @param {Object} options - Bulk update options
     * @returns {Promise<Object>} Bulk update results
     */
    async bulkUpdateSettings(updates, updatedBy, options = {}) {
        const { validateAll = true, continueOnError = true, notifyUsers = false } = options;

        try {
            // Validate bulk operation size
            if (updates.length > 1000) {
                throw new ValidationError('Bulk operation too large', 'BULK_SIZE_EXCEEDED');
            }

            const results = {
                successful: [],
                failed: [],
                warnings: []
            };

            // Validate all updates first if requested
            if (validateAll) {
                for (const update of updates) {
                    try {
                        await this.#validateBulkUpdateItem(update);
                    } catch (error) {
                        if (!continueOnError) {
                            throw error;
                        }
                        results.failed.push({
                            userId: update.userId,
                            error: error.message
                        });
                    }
                }
            }

            // Process updates in batches
            const batchSize = 50;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                const batchResults = await this.#processBulkUpdateBatch(batch, updatedBy, options);

                results.successful.push(...batchResults.successful);
                results.failed.push(...batchResults.failed);
                results.warnings.push(...batchResults.warnings);
            }

            // Send summary notifications
            if (notifyUsers && results.successful.length > 0) {
                await this.#sendBulkUpdateNotifications(results, updatedBy);
            }

            // Log bulk operation
            await this.#auditService.log({
                action: 'SETTINGS_BULK_UPDATE',
                entityType: 'user_settings',
                userId: updatedBy,
                details: {
                    totalUpdates: updates.length,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            logger.info('Bulk settings update completed', {
                totalUpdates: updates.length,
                successful: results.successful.length,
                failed: results.failed.length,
                updatedBy
            });

            return results;
        } catch (error) {
            logger.error('Error in bulk settings update', {
                error: error.message,
                updateCount: updates.length,
                updatedBy
            });
            throw error;
        }
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Load configuration profiles
     * @private
     */
    #loadConfigurationProfiles() {
        // Standard profile for regular users
        this.#configurationProfiles.set('standard', {
            security: { ...this.#securityPolicies },
            features: {
                beta: { participateInBeta: false },
                experimental: { enableExperimentalFeatures: false }
            },
            data: {
                retention: { autoDelete: false },
                backup: { enableAutoBackup: true }
            }
        });

        // Enterprise profile for business users
        this.#configurationProfiles.set('enterprise', {
            security: {
                ...this.#securityPolicies,
                twoFactor: { required: true },
                session: { maxConcurrent: 3, requireReauth: 12 }
            },
            api: { access: { enabled: true } },
            data: {
                retention: { autoDelete: true },
                backup: { enableAutoBackup: true, frequency: 'daily' }
            }
        });

        // Developer profile with API access
        this.#configurationProfiles.set('developer', {
            security: { ...this.#securityPolicies },
            api: {
                access: { enabled: true, maxKeys: 10 },
                rateLimit: { requestsPerMinute: 120 }
            },
            features: {
                beta: { participateInBeta: true },
                experimental: { enableExperimentalFeatures: true }
            }
        });
    }

    /**
     * Setup cleanup intervals
     * @private
     */
    #setupCleanupIntervals() {
        // Clean pending settings every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.#pendingSettings) {
                if (now - timestamp > 300000) { // 5 minutes
                    this.#pendingSettings.delete(key);
                }
            }
        }, 300000);
    }

    /**
     * Get settings template by name
     * @private
     * @param {string} templateName - Template name
     * @returns {Promise<Object>} Template settings
     */
    async #getSettingsTemplate(templateName) {
        const template = this.#configurationProfiles.get(templateName);
        if (!template) {
            logger.warn('Unknown template, using standard', { templateName });
            return this.#configurationProfiles.get('standard');
        }
        return { ...template };
    }

    /**
     * Get organization default settings
     * @private
     * @param {string} organizationId - Organization ID
     * @returns {Promise<Object>} Organization defaults
     */
    async #getOrganizationDefaults(organizationId) {
        // This would typically fetch from organization service
        // For now, return enterprise defaults for demo
        return this.#configurationProfiles.get('enterprise');
    }

    /**
     * Initialize security features for new settings
     * @private
     * @param {Object} settings - Settings object
     */
    async #initializeSecurityFeatures(settings) {
        // Generate backup codes if MFA is enabled
        if (settings.security.twoFactor.required) {
            await settings.generateBackupCodes();
        }

        // Set up default security monitoring
        settings.security.monitoring = {
            enableActivityMonitoring: true,
            logSuspiciousActivity: true,
            alertOnMultipleFailedLogins: true
        };
    }

    /**
     * Sanitize settings output by removing sensitive fields
     * @private
     * @param {Object} settings - Settings object
     * @returns {Object} Sanitized settings
     */
    #sanitizeSettingsOutput(settings) {
        const sanitized = { ...settings };

        // Remove sensitive fields
        for (const field of this.#sensitiveFields) {
            this.#deleteNestedProperty(sanitized, field);
        }

        return sanitized;
    }

    /**
     * Delete nested property by path
     * @private
     * @param {Object} obj - Object to modify
     * @param {string} path - Dot-separated path
     */
    #deleteNestedProperty(obj, path) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) return;
            current = current[keys[i]];
        }

        delete current[keys[keys.length - 1]];
    }

    /**
     * Generate cache key for settings data
     * @private
     * @param {string} type - Cache type
     * @param {string} identifier - Unique identifier
     * @param {Object} options - Options for key generation
     * @returns {string} Cache key
     */
    #generateCacheKey(type, identifier, options = {}) {
        const baseKey = `settings:${type}:${identifier}`;

        if (Object.keys(options).length === 0) {
            return baseKey;
        }

        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex')
            .substring(0, 8);

        return `${baseKey}:${optionsHash}`;
    }

    /**
     * Clear settings-related caches
     * @private
     * @param {string} userId - User ID
     */
    async #clearSettingsCaches(userId) {
        const patterns = [
            `settings:*:${userId}:*`,
            `settings:analytics:${userId}:*`,
            'settings:bulk:*'
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Check settings access permissions
     * @private
     * @param {Object} settings - Settings object
     * @param {string} requesterId - ID of user requesting access
     * @param {string} operation - Operation type
     */
    async #checkSettingsAccess(settings, requesterId, operation) {
        // Owner always has access
        if (settings.userId.toString() === requesterId) {
            return;
        }

        // Get requester's permissions
        const user = await UserModel.findById(settings.userId);
        const requester = await UserModel.findById(requesterId);

        if (!user || !requester) {
            throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
        }

        // Check organization admin permissions
        const hasAdminAccess = requester.organizations.some(org => {
            const userOrgMembership = user.organizations.find(
                userOrg => userOrg.organizationId.toString() === org.organizationId.toString()
            );

            if (!userOrgMembership) return false;

            const requesterRoles = org.roles.map(r => r.roleName);
            return requesterRoles.some(role => ['admin', 'super_admin'].includes(role));
        });

        if (!hasAdminAccess) {
            throw new ForbiddenError(
                `Insufficient permissions for ${operation} operation`,
                'INSUFFICIENT_PERMISSIONS'
            );
        }
    }

    /**
     * Calculate security score based on settings
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Security score (0-100)
     */
    #calculateSecurityScore(settings) {
        let score = 0;

        // Password policy (20 points)
        if (settings.security.password.requireComplexPassword) score += 10;
        if (settings.security.password.changeFrequency <= 90) score += 10;

        // MFA (25 points)
        if (settings.security.twoFactor.required) score += 25;

        // Session security (20 points)
        if (settings.security.sessions.maxConcurrentSessions <= 3) score += 10;
        if (settings.security.sessions.requireReauth.enabled) score += 10;

        // Access controls (20 points)
        if (settings.security.access.ipWhitelist.enabled) score += 10;
        if (settings.security.access.locationRestrictions.enabled) score += 10;

        // Monitoring (15 points)
        if (settings.security.monitoring.enableActivityMonitoring) score += 8;
        if (settings.security.monitoring.alertOnNewDevice) score += 7;

        return Math.min(score, 100);
    }

    /**
     * Validate OAuth configuration
     * @private
     * @param {Object} config - OAuth configuration
     */
    async #validateOAuthConfig(config) {
        if (!config.provider) {
            throw new ValidationError('OAuth provider is required', 'OAUTH_PROVIDER_REQUIRED');
        }

        const validProviders = ['google', 'microsoft', 'github', 'linkedin', 'slack'];
        if (!validProviders.includes(config.provider)) {
            throw new ValidationError('Invalid OAuth provider', 'INVALID_OAUTH_PROVIDER');
        }

        if (config.clientId && config.clientId.length < 10) {
            throw new ValidationError('Invalid client ID', 'INVALID_CLIENT_ID');
        }
    }

    /**
     * Validate SSO configuration
     * @private
     * @param {Object} config - SSO configuration
     */
    async #validateSSOConfig(config) {
        if (!config.provider) {
            throw new ValidationError('SSO provider is required', 'SSO_PROVIDER_REQUIRED');
        }

        if (config.ssoUrl && !validator.isURL(config.ssoUrl)) {
            throw new ValidationError('Invalid SSO URL', 'INVALID_SSO_URL');
        }

        if (config.entityId && config.entityId.length < 5) {
            throw new ValidationError('Invalid entity ID', 'INVALID_ENTITY_ID');
        }
    }

    /**
     * Validate LDAP configuration
     * @private
     * @param {Object} config - LDAP configuration
     */
    async #validateLDAPConfig(config) {
        if (!config.server) {
            throw new ValidationError('LDAP server is required', 'LDAP_SERVER_REQUIRED');
        }

        if (!config.baseDN) {
            throw new ValidationError('Base DN is required', 'LDAP_BASE_DN_REQUIRED');
        }

        if (config.port && (config.port < 1 || config.port > 65535)) {
            throw new ValidationError('Invalid LDAP port', 'INVALID_LDAP_PORT');
        }
    }

    /**
     * Validate API configuration
     * @private
     * @param {Object} config - API configuration
     */
    async #validateAPIConfig(config) {
        if (config.maxKeys && (config.maxKeys < 1 || config.maxKeys > 50)) {
            throw new ValidationError('Invalid max keys limit', 'INVALID_MAX_KEYS');
        }

        if (config.rateLimit) {
            if (config.rateLimit.requestsPerMinute < 1 || config.rateLimit.requestsPerMinute > 10000) {
                throw new ValidationError('Invalid rate limit', 'INVALID_RATE_LIMIT');
            }
        }
    }

    /**
     * Validate webhook configuration
     * @private
     * @param {Object} config - Webhook configuration
     */
    async #validateWebhookConfig(config) {
        if (!config.url || !validator.isURL(config.url)) {
            throw new ValidationError('Valid webhook URL is required', 'INVALID_WEBHOOK_URL');
        }

        if (config.events && !Array.isArray(config.events)) {
            throw new ValidationError('Events must be an array', 'INVALID_WEBHOOK_EVENTS');
        }

        if (config.timeout && (config.timeout < 1000 || config.timeout > 30000)) {
            throw new ValidationError('Invalid webhook timeout', 'INVALID_WEBHOOK_TIMEOUT');
        }
    }

    /**
     * Send settings creation notifications
     * @private
     * @param {Object} settings - Created settings object
     */
    async #sendSettingsCreationNotifications(settings) {
        try {
            await this.#notificationService.sendNotification({
                type: 'SETTINGS_CREATED',
                recipients: [settings.userId.toString()],
                data: {
                    settingsId: settings._id,
                    configurationProfile: settings.metadata.configurationProfile
                }
            });
        } catch (error) {
            logger.warn('Failed to send settings creation notifications', {
                settingsId: settings._id,
                error: error.message
            });
        }
    }

    /**
     * Calculate settings metrics and computed fields
     * @private
     * @param {Object} settings - Settings object
     * @returns {Promise<Object>} Calculated metrics
     */
    async #calculateSettingsMetrics(settings) {
        return {
            securityScore: this.#calculateSecurityScore(settings),
            completenessScore: this.#calculateCompleteness(settings),
            complianceScore: this.#calculateComplianceScore(settings),
            lastUpdated: settings.updatedAt,
            version: settings.metadata.version,
            activeIntegrations: this.#countActiveIntegrations(settings),
            pendingApprovals: this.#countPendingApprovals(settings)
        };
    }

    /**
     * Calculate settings completeness score
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Completeness score (0-100)
     */
    #calculateCompleteness(settings) {
        let score = 0;
        const maxScore = 100;

        // Security configuration (30 points)
        if (settings.security.password.requireComplexPassword) score += 10;
        if (settings.security.twoFactor.required) score += 20;

        // Privacy settings (20 points)
        if (settings.privacy.profile.visibility !== 'public') score += 10;
        if (settings.privacy.dataSharing.analytics === false) score += 10;

        // Notification settings (20 points)
        if (settings.notifications.email.enabled !== undefined) score += 10;
        if (settings.notifications.push.enabled !== undefined) score += 10;

        // Integration settings (15 points)
        if (Object.keys(settings.integrations || {}).length > 0) score += 15;

        // Compliance settings (15 points)
        if (settings.compliance?.gdpr?.consentGiven) score += 8;
        if (settings.compliance?.marketing?.preferences) score += 7;

        return Math.min(score, maxScore);
    }

    /**
     * Calculate compliance score
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Compliance score (0-100)
     */
    #calculateComplianceScore(settings) {
        let score = 0;

        // GDPR compliance
        if (settings.compliance?.gdpr?.consentGiven) score += 40;
        if (settings.compliance?.gdpr?.dataProcessingAgreement) score += 20;

        // Data retention compliance
        if (settings.data?.retention?.autoDelete) score += 20;

        // Marketing consent compliance
        if (settings.compliance?.marketing?.explicitConsent) score += 20;

        return Math.min(score, 100);
    }

    /**
     * Count active integrations
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Number of active integrations
     */
    #countActiveIntegrations(settings) {
        if (!settings.integrations) return 0;

        let count = 0;
        for (const [type, config] of Object.entries(settings.integrations)) {
            if (config.enabled) count++;
        }
        return count;
    }

    /**
     * Count pending approvals
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Number of pending approvals
     */
    #countPendingApprovals(settings) {
        return settings.metadata?.overrides?.filter(override => !override.approved).length || 0;
    }

    /**
     * Validate settings update data
     * @private
     * @param {Object} updateData - Data to validate
     * @param {Object} existingSettings - Existing settings
     */
    async #validateSettingsUpdate(updateData, existingSettings) {
        // Validate notification preferences
        if (updateData.notifications) {
            this.#validateNotificationSettings(updateData.notifications);
        }

        // Validate privacy settings
        if (updateData.privacy) {
            this.#validatePrivacySettings(updateData.privacy);
        }

        // Validate security settings
        if (updateData.security) {
            await this.#validateSecuritySettings(updateData.security);
        }

        // Validate billing settings
        if (updateData.billing) {
            this.#validateBillingSettings(updateData.billing);
        }

        // Validate API settings
        if (updateData.api) {
            this.#validateAPISettings(updateData.api);
        }
    }

    /**
     * Validate notification settings
     * @private
     * @param {Object} notifications - Notification settings
     */
    #validateNotificationSettings(notifications) {
        if (notifications.email?.address && !validator.isEmail(notifications.email.address)) {
            throw new ValidationError('Invalid notification email address', 'INVALID_NOTIFICATION_EMAIL');
        }

        if (notifications.sms?.phoneNumber) {
            const cleanPhone = notifications.sms.phoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!/^[\+]?[1-9][\d]{0,15}$/.test(cleanPhone)) {
                throw new ValidationError('Invalid SMS phone number', 'INVALID_SMS_PHONE');
            }
        }

        // Validate frequency settings
        const validFrequencies = ['instant', 'hourly', 'daily', 'weekly', 'never'];
        if (notifications.email?.frequency && !validFrequencies.includes(notifications.email.frequency)) {
            throw new ValidationError('Invalid email notification frequency', 'INVALID_EMAIL_FREQUENCY');
        }
    }

    /**
     * Validate privacy settings
     * @private
     * @param {Object} privacy - Privacy settings
     */
    #validatePrivacySettings(privacy) {
        // Validate visibility options
        const validVisibility = ['public', 'organization', 'connections', 'private'];
        if (privacy.profile?.visibility && !validVisibility.includes(privacy.profile.visibility)) {
            throw new ValidationError('Invalid profile visibility setting', 'INVALID_VISIBILITY');
        }

        // Validate data sharing preferences
        if (privacy.dataSharing) {
            if (typeof privacy.dataSharing.analytics !== 'boolean') {
                throw new ValidationError('Analytics sharing must be boolean', 'INVALID_ANALYTICS_SHARING');
            }
            if (typeof privacy.dataSharing.thirdParty !== 'boolean') {
                throw new ValidationError('Third party sharing must be boolean', 'INVALID_THIRD_PARTY_SHARING');
            }
        }
    }

    /**
     * Validate security settings
     * @private
     * @param {Object} security - Security settings
     */
    async #validateSecuritySettings(security) {
        // Validate password settings
        if (security.password) {
            if (security.password.changeFrequency && (security.password.changeFrequency < 30 || security.password.changeFrequency > 365)) {
                throw new ValidationError('Password change frequency must be between 30-365 days', 'INVALID_PASSWORD_FREQUENCY');
            }
        }

        // Validate session settings
        if (security.sessions) {
            if (security.sessions.maxConcurrentSessions && (security.sessions.maxConcurrentSessions < 1 || security.sessions.maxConcurrentSessions > 20)) {
                throw new ValidationError('Max concurrent sessions must be between 1-20', 'INVALID_MAX_SESSIONS');
            }
        }

        // Validate IP whitelist
        if (security.access?.ipWhitelist?.addresses) {
            for (const entry of security.access.ipWhitelist.addresses) {
                if (!validator.isIP(entry.ip)) {
                    throw new ValidationError(`Invalid IP address: ${entry.ip}`, 'INVALID_IP_ADDRESS');
                }
            }
        }
    }

    /**
     * Validate billing settings
     * @private
     * @param {Object} billing - Billing settings
     */
    #validateBillingSettings(billing) {
        if (billing.preferences?.invoiceEmail && !validator.isEmail(billing.preferences.invoiceEmail)) {
            throw new ValidationError('Invalid invoice email address', 'INVALID_INVOICE_EMAIL');
        }

        if (billing.preferences?.currency) {
            const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
            if (!validCurrencies.includes(billing.preferences.currency)) {
                throw new ValidationError('Invalid currency code', 'INVALID_CURRENCY');
            }
        }
    }

    /**
     * Validate API settings
     * @private
     * @param {Object} api - API settings
     */
    #validateAPISettings(api) {
        if (api.rateLimit) {
            if (api.rateLimit.requestsPerMinute < 1 || api.rateLimit.requestsPerMinute > 10000) {
                throw new ValidationError('Rate limit must be between 1-10000 requests per minute', 'INVALID_RATE_LIMIT');
            }
        }

        if (api.access?.maxKeys && (api.access.maxKeys < 1 || api.access.maxKeys > 50)) {
            throw new ValidationError('Max API keys must be between 1-50', 'INVALID_MAX_API_KEYS');
        }
    }

    /**
     * Check for update conflicts
     * @private
     * @param {string} userId - User ID
     * @param {Object} updateData - Update data
     */
    async #checkUpdateConflicts(userId, updateData) {
        const pendingKey = `settings_update:${userId}`;
        if (this.#pendingSettings.has(pendingKey)) {
            throw new ConflictError('Settings update already in progress', 'UPDATE_IN_PROGRESS');
        }

        this.#pendingSettings.set(pendingKey, Date.now());

        setTimeout(() => {
            this.#pendingSettings.delete(pendingKey);
        }, 300000); // 5 minutes
    }

    /**
     * Process settings update with business logic
     * @private
     * @param {Object} updateData - Raw update data
     * @param {Object} existingSettings - Existing settings
     * @param {string} updatedBy - ID of user making update
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processed update results
     */
    async #processSettingsUpdate(updateData, existingSettings, updatedBy, options) {
        const { category, requireApproval, reason } = options;
        const changes = {};
        const warnings = [];

        // Process each category of updates
        for (const [key, value] of Object.entries(updateData)) {
            if (category && key !== category) continue;

            // Security settings require special handling
            if (key === 'security') {
                const securityChanges = await this.#processSecurityUpdates(value, existingSettings.security, updatedBy);
                if (Object.keys(securityChanges).length > 0) {
                    changes[`security`] = securityChanges;
                }
            }
            // Privacy settings
            else if (key === 'privacy') {
                const privacyChanges = this.#processPrivacyUpdates(value, existingSettings.privacy);
                if (Object.keys(privacyChanges).length > 0) {
                    changes[`privacy`] = privacyChanges;
                }
            }
            // Notification settings
            else if (key === 'notifications') {
                const notificationChanges = this.#processNotificationUpdates(value, existingSettings.notifications);
                if (Object.keys(notificationChanges).length > 0) {
                    changes[`notifications`] = notificationChanges;
                }
            }
            // Other settings
            else {
                changes[key] = value;
            }
        }

        return {
            changes,
            warnings,
            requiresApproval: requireApproval,
            reason
        };
    }

    /**
     * Process security updates
     * @private
     * @param {Object} securityUpdates - Security updates
     * @param {Object} existingSecurity - Existing security settings
     * @param {string} updatedBy - User making update
     * @returns {Promise<Object>} Processed security changes
     */
    async #processSecurityUpdates(securityUpdates, existingSecurity, updatedBy) {
        const changes = {};

        // Password policy changes
        if (securityUpdates.password) {
            changes.password = { ...existingSecurity.password, ...securityUpdates.password };
        }

        // Two-factor authentication changes
        if (securityUpdates.twoFactor) {
            changes.twoFactor = { ...existingSecurity.twoFactor, ...securityUpdates.twoFactor };

            // If disabling MFA, require additional verification
            if (existingSecurity.twoFactor.required && !securityUpdates.twoFactor.required) {
                changes.twoFactor.disabledAt = new Date();
                changes.twoFactor.disabledBy = updatedBy;
            }
        }

        // Session security changes
        if (securityUpdates.sessions) {
            changes.sessions = { ...existingSecurity.sessions, ...securityUpdates.sessions };
        }

        // Access control changes
        if (securityUpdates.access) {
            changes.access = { ...existingSecurity.access, ...securityUpdates.access };
        }

        return changes;
    }

    /**
     * Process privacy updates
     * @private
     * @param {Object} privacyUpdates - Privacy updates
     * @param {Object} existingPrivacy - Existing privacy settings
     * @returns {Object} Processed privacy changes
     */
    #processPrivacyUpdates(privacyUpdates, existingPrivacy) {
        const changes = {};

        if (privacyUpdates.profile) {
            changes.profile = { ...existingPrivacy.profile, ...privacyUpdates.profile };
        }

        if (privacyUpdates.dataSharing) {
            changes.dataSharing = { ...existingPrivacy.dataSharing, ...privacyUpdates.dataSharing };
            changes.dataSharing.lastUpdated = new Date();
        }

        if (privacyUpdates.communications) {
            changes.communications = { ...existingPrivacy.communications, ...privacyUpdates.communications };
        }

        return changes;
    }

    /**
     * Process notification updates
     * @private
     * @param {Object} notificationUpdates - Notification updates
     * @param {Object} existingNotifications - Existing notification settings
     * @returns {Object} Processed notification changes
     */
    #processNotificationUpdates(notificationUpdates, existingNotifications) {
        const changes = {};

        ['email', 'sms', 'push', 'inApp'].forEach(channel => {
            if (notificationUpdates[channel]) {
                changes[channel] = {
                    ...existingNotifications[channel],
                    ...notificationUpdates[channel],
                    lastUpdated: new Date()
                };
            }
        });

        return changes;
    }

    /**
     * Handle special configurations that need additional processing
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} updateData - Update data
     * @param {string} updatedBy - User making update
     */
    async #handleSpecialConfigurations(settings, updateData, updatedBy) {
        // Handle MFA configuration changes
        if (updateData.security?.twoFactor?.enabled !== undefined) {
            if (updateData.security.twoFactor.enabled && !settings.security.twoFactor.enabled) {
                await this.#initializeMFA(settings, updatedBy);
            } else if (!updateData.security.twoFactor.enabled && settings.security.twoFactor.enabled) {
                await this.#disableMFA(settings, updatedBy);
            }
        }

        // Handle API access changes
        if (updateData.api?.access?.enabled !== undefined) {
            if (updateData.api.access.enabled && !settings.api?.access?.enabled) {
                await this.#enableAPIAccess(settings, updatedBy);
            } else if (!updateData.api.access.enabled && settings.api?.access?.enabled) {
                await this.#disableAPIAccess(settings, updatedBy);
            }
        }

        // Handle notification email verification
        if (updateData.notifications?.email?.address &&
            updateData.notifications.email.address !== settings.notifications?.email?.address) {
            await this.#initiateEmailVerification(settings, updateData.notifications.email.address, updatedBy);
        }
    }

    /**
     * Send settings update notifications
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} updateResults - Update results
     * @param {string} updatedBy - User who made update
     */
    async #sendSettingsUpdateNotifications(settings, updateResults, updatedBy) {
        try {
            const significantChanges = this.#identifySignificantChanges(updateResults.changes);

            if (significantChanges.length > 0) {
                // Notify user if updated by someone else
                if (updatedBy !== settings.userId.toString()) {
                    await this.#notificationService.sendNotification({
                        type: 'SETTINGS_UPDATED_BY_ADMIN',
                        recipients: [settings.userId.toString()],
                        data: {
                            updatedBy,
                            changes: significantChanges,
                            reason: updateResults.reason
                        }
                    });
                }

                // Send security alert for security changes
                if (significantChanges.some(change => change.startsWith('security'))) {
                    await this.#emailService.sendSecurityAlert(settings.userId, {
                        changes: significantChanges.filter(change => change.startsWith('security')),
                        timestamp: new Date(),
                        ipAddress: null // Would be available in request context
                    });
                }
            }
        } catch (error) {
            logger.warn('Failed to send settings update notifications', {
                settingsId: settings._id,
                error: error.message
            });
        }
    }

    /**
     * Identify significant changes that require notification
     * @private
     * @param {Object} changes - Changes made
     * @returns {Array} List of significant changes
     */
    #identifySignificantChanges(changes) {
        const significant = [];
        const significantPaths = [
            'security.password',
            'security.twoFactor',
            'security.sessions',
            'privacy.profile.visibility',
            'privacy.dataSharing',
            'notifications.email.address',
            'billing.preferences'
        ];

        for (const path of significantPaths) {
            if (this.#hasNestedChange(changes, path)) {
                significant.push(path);
            }
        }

        return significant;
    }

    /**
     * Check if nested path has changes
     * @private
     * @param {Object} changes - Changes object
     * @param {string} path - Dot-separated path
     * @returns {boolean} Whether path has changes
     */
    #hasNestedChange(changes, path) {
        const parts = path.split('.');
        let current = changes;

        for (const part of parts) {
            if (!current || typeof current !== 'object') return false;
            current = current[part];
        }

        return current !== undefined;
    }

    /**
     * Validate security configuration
     * @private
     * @param {Object} securityConfig - Security configuration
     * @param {boolean} enforcePolicy - Whether to enforce security policies
     */
    async #validateSecurityConfiguration(securityConfig, enforcePolicy) {
        if (enforcePolicy) {
            // Validate against security policies
            if (securityConfig.password) {
                const policy = this.#securityPolicies.password;
                if (securityConfig.password.minLength < policy.minLength) {
                    throw new ValidationError(`Password minimum length must be at least ${policy.minLength}`, 'PASSWORD_TOO_SHORT');
                }
            }

            if (securityConfig.sessions) {
                const policy = this.#securityPolicies.session;
                if (securityConfig.sessions.maxConcurrent > policy.maxConcurrent) {
                    throw new ValidationError(`Max concurrent sessions cannot exceed ${policy.maxConcurrent}`, 'TOO_MANY_SESSIONS');
                }
            }
        }

        // Validate MFA configuration
        if (securityConfig.twoFactor) {
            const allowedMethods = this.#securityPolicies.twoFactor.allowedMethods;
            if (securityConfig.twoFactor.methods) {
                for (const method of securityConfig.twoFactor.methods) {
                    if (!allowedMethods.includes(method)) {
                        throw new ValidationError(`MFA method '${method}' is not allowed`, 'INVALID_MFA_METHOD');
                    }
                }
            }
        }
    }

    /**
     * Process security configuration
     * @private
     * @param {Object} securityConfig - Security configuration
     * @param {Object} settings - Settings object
     * @param {string} configuredBy - User configuring security
     * @returns {Promise<Object>} Processed security configuration
     */
    async #processSecurityConfiguration(securityConfig, settings, configuredBy) {
        const securityUpdates = {};

        // Process password policy
        if (securityConfig.password) {
            securityUpdates.password = {
                ...settings.security.password,
                ...securityConfig.password,
                lastUpdated: new Date(),
                updatedBy: configuredBy
            };
        }

        // Process MFA configuration
        if (securityConfig.twoFactor) {
            securityUpdates.twoFactor = {
                ...settings.security.twoFactor,
                ...securityConfig.twoFactor,
                lastUpdated: new Date(),
                configuredBy
            };
        }

        // Process session security
        if (securityConfig.sessions) {
            securityUpdates.sessions = {
                ...settings.security.sessions,
                ...securityConfig.sessions,
                lastUpdated: new Date()
            };
        }

        // Process access controls
        if (securityConfig.access) {
            securityUpdates.access = {
                ...settings.security.access,
                ...securityConfig.access,
                lastUpdated: new Date()
            };
        }

        return securityUpdates;
    }

    /**
     * Configure MFA for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} mfaConfig - MFA configuration
     * @param {string} configuredBy - User configuring MFA
     */
    async #configureMFA(userId, mfaConfig, configuredBy) {
        // Generate TOTP secret if needed
        if (mfaConfig.methods?.includes('totp')) {
            const secret = speakeasy.generateSecret({
                name: `InsightSerenity (${userId})`,
                issuer: 'InsightSerenity'
            });

            // Generate QR code
            const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

            // Store secret securely (would be encrypted in real implementation)
            await UserSettingsModel.findOneAndUpdate(
                { userId },
                {
                    'security.twoFactor.totp.secret': secret.base32,
                    'security.twoFactor.totp.qrCode': qrCodeUrl,
                    'security.twoFactor.enabled': true,
                    'security.twoFactor.configuredAt': new Date(),
                    'security.twoFactor.configuredBy': configuredBy
                }
            );
        }

        // Generate backup codes
        if (mfaConfig.generateBackupCodes) {
            const backupCodes = [];
            for (let i = 0; i < 10; i++) {
                backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
            }

            await UserSettingsModel.findOneAndUpdate(
                { userId },
                { 'security.twoFactor.backupCodes': backupCodes }
            );
        }
    }

    /**
     * Configure API access for user
     * @private
     * @param {string} userId - User ID
     * @param {Object} apiConfig - API configuration
     * @param {string} configuredBy - User configuring API access
     */
    async #configureAPIAccess(userId, apiConfig, configuredBy) {
        const apiSettings = {
            enabled: true,
            maxKeys: apiConfig.maxKeys || 5,
            rateLimit: apiConfig.rateLimit || { requestsPerMinute: 60 },
            configuredAt: new Date(),
            configuredBy
        };

        await UserSettingsModel.findOneAndUpdate(
            { userId },
            { 'api.access': apiSettings }
        );

        // Generate initial API key if requested
        if (apiConfig.generateInitialKey) {
            const apiKey = crypto.randomBytes(32).toString('hex');
            await UserSettingsModel.findOneAndUpdate(
                { userId },
                {
                    $push: {
                        'api.access.keys': {
                            id: crypto.randomUUID(),
                            key: apiKey,
                            name: 'Default API Key',
                            createdAt: new Date(),
                            lastUsed: null,
                            permissions: ['read']
                        }
                    }
                }
            );
        }
    }

    /**
     * Send security configuration notifications
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} securityUpdates - Security updates made
     * @param {string} configuredBy - User who configured security
     */
    async #sendSecurityConfigNotifications(settings, securityUpdates, configuredBy) {
        try {
            // Send security configuration confirmation
            await this.#emailService.sendSecurityConfigurationNotification(settings.userId, {
                changes: Object.keys(securityUpdates),
                configuredBy,
                timestamp: new Date()
            });

            // Send in-app notification
            await this.#notificationService.sendNotification({
                type: 'SECURITY_CONFIGURED',
                recipients: [settings.userId.toString()],
                data: {
                    changes: Object.keys(securityUpdates),
                    configuredBy
                }
            });
        } catch (error) {
            logger.warn('Failed to send security configuration notifications', {
                settingsId: settings._id,
                error: error.message
            });
        }
    }

    /**
     * Test integration connection
     * @private
     * @param {string} integrationType - Integration type
     * @param {Object} config - Integration configuration
     * @returns {Promise<Object>} Connection test results
     */
    async #testIntegrationConnection(integrationType, config) {
        const testResult = {
            success: false,
            message: '',
            details: {},
            testedAt: new Date()
        };

        try {
            switch (integrationType) {
                case 'oauth':
                    testResult.success = await this.#testOAuthConnection(config);
                    testResult.message = testResult.success ? 'OAuth connection successful' : 'OAuth connection failed';
                    break;

                case 'sso':
                    testResult.success = await this.#testSSOConnection(config);
                    testResult.message = testResult.success ? 'SSO connection successful' : 'SSO connection failed';
                    break;

                case 'ldap':
                    testResult.success = await this.#testLDAPConnection(config);
                    testResult.message = testResult.success ? 'LDAP connection successful' : 'LDAP connection failed';
                    break;

                case 'webhook':
                    testResult.success = await this.#testWebhookConnection(config);
                    testResult.message = testResult.success ? 'Webhook test successful' : 'Webhook test failed';
                    break;

                default:
                    testResult.message = 'Connection test not supported for this integration type';
            }
        } catch (error) {
            testResult.success = false;
            testResult.message = error.message;
            testResult.details.error = error.stack;
        }

        return testResult;
    }

    /**
     * Apply integration configuration
     * @private
     * @param {Object} settings - Settings object
     * @param {string} integrationType - Integration type
     * @param {Object} integrationConfig - Integration configuration
     * @param {string} configuredBy - User configuring integration
     * @returns {Promise<Object>} Applied integration configuration
     */
    async #applyIntegrationConfig(settings, integrationType, integrationConfig, configuredBy) {
        if (!settings.integrations) {
            settings.integrations = {};
        }

        const integrationData = {
            ...integrationConfig,
            enabled: true,
            configuredAt: new Date(),
            configuredBy,
            lastUsed: null
        };

        // Encrypt sensitive data
        if (integrationData.clientSecret) {
            integrationData.clientSecret = await this.#encryptValue(integrationData.clientSecret);
        }
        if (integrationData.accessToken) {
            integrationData.accessToken = await this.#encryptValue(integrationData.accessToken);
        }

        settings.integrations[integrationType] = integrationData;
        return integrationData;
    }

    /**
     * Send integration notifications
     * @private
     * @param {Object} settings - Settings object
     * @param {string} integrationType - Integration type
     * @param {Object} integrationResult - Integration configuration result
     * @param {string} configuredBy - User who configured integration
     */
    async #sendIntegrationNotifications(settings, integrationType, integrationResult, configuredBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'INTEGRATION_CONFIGURED',
                recipients: [settings.userId.toString()],
                data: {
                    integrationType,
                    configuredBy,
                    status: 'enabled'
                }
            });
        } catch (error) {
            logger.warn('Failed to send integration notifications', {
                settingsId: settings._id,
                integrationType,
                error: error.message
            });
        }
    }

    /**
     * Validate compliance configuration
     * @private
     * @param {Object} complianceConfig - Compliance configuration
     * @param {Array} regulatory - Regulatory requirements
     */
    async #validateComplianceConfiguration(complianceConfig, regulatory) {
        // Validate GDPR configuration
        if (complianceConfig.gdpr) {
            if (typeof complianceConfig.gdpr.consentGiven !== 'boolean') {
                throw new ValidationError('GDPR consent must be explicitly given or denied', 'INVALID_GDPR_CONSENT');
            }

            if (complianceConfig.gdpr.dataRetentionPeriod) {
                const maxRetention = this.#complianceRequirements.gdpr.dataRetentionMax;
                if (complianceConfig.gdpr.dataRetentionPeriod > maxRetention) {
                    throw new ValidationError(`Data retention period cannot exceed ${maxRetention} days`, 'RETENTION_TOO_LONG');
                }
            }
        }

        // Validate CCPA configuration
        if (complianceConfig.ccpa) {
            if (complianceConfig.ccpa.optOut !== undefined && typeof complianceConfig.ccpa.optOut !== 'boolean') {
                throw new ValidationError('CCPA opt-out must be boolean', 'INVALID_CCPA_OPTOUT');
            }
        }

        // Validate marketing consent
        if (complianceConfig.marketing) {
            if (!complianceConfig.marketing.consentMethod ||
                !['explicit', 'implicit', 'opt_in', 'opt_out'].includes(complianceConfig.marketing.consentMethod)) {
                throw new ValidationError('Invalid marketing consent method', 'INVALID_CONSENT_METHOD');
            }
        }
    }

    /**
     * Process GDPR configuration
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} gdprConfig - GDPR configuration
     * @param {string} configuredBy - User configuring GDPR
     * @param {Object} context - Request context
     * @returns {Promise<Object>} GDPR configuration result
     */
    async #processGDPRConfiguration(settings, gdprConfig, configuredBy, context) {
        const gdprData = {
            consentGiven: gdprConfig.consentGiven,
            consentDate: new Date(),
            consentMethod: gdprConfig.consentMethod || 'explicit',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            dataProcessingPurposes: gdprConfig.dataProcessingPurposes || [],
            dataRetentionPeriod: gdprConfig.dataRetentionPeriod || this.#complianceRequirements.gdpr.dataRetentionMax,
            rightToErasure: gdprConfig.rightToErasure !== false,
            rightToPortability: gdprConfig.rightToPortability !== false,
            configuredBy
        };

        if (!settings.compliance) settings.compliance = {};
        settings.compliance.gdpr = gdprData;

        // Log consent for audit trail
        await this.#auditService.log({
            action: 'GDPR_CONSENT_GIVEN',
            entityType: 'user_settings',
            entityId: settings._id,
            userId: configuredBy,
            details: {
                consentGiven: gdprData.consentGiven,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            }
        });

        return gdprData;
    }

    /**
     * Process CCPA configuration
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} ccpaConfig - CCPA configuration
     * @param {string} configuredBy - User configuring CCPA
     * @param {Object} context - Request context
     * @returns {Promise<Object>} CCPA configuration result
     */
    async #processCCPAConfiguration(settings, ccpaConfig, configuredBy, context) {
        const ccpaData = {
            optOut: ccpaConfig.optOut || false,
            optOutDate: new Date(),
            ipAddress: context.ipAddress,
            doNotSell: ccpaConfig.doNotSell !== false,
            deleteDataRequest: ccpaConfig.deleteDataRequest || false,
            configuredBy
        };

        if (!settings.compliance) settings.compliance = {};
        settings.compliance.ccpa = ccpaData;

        return ccpaData;
    }

    /**
     * Process HIPAA configuration
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} hipaaConfig - HIPAA configuration
     * @param {string} configuredBy - User configuring HIPAA
     * @returns {Promise<Object>} HIPAA configuration result
     */
    async #processHIPAAConfiguration(settings, hipaaConfig, configuredBy) {
        const hipaaData = {
            agreement: hipaaConfig.agreement || false,
            agreementDate: new Date(),
            minimumNecessary: hipaaConfig.minimumNecessary !== false,
            accessLogging: hipaaConfig.accessLogging !== false,
            encryptionRequired: hipaaConfig.encryptionRequired !== false,
            configuredBy
        };

        if (!settings.compliance) settings.compliance = {};
        settings.compliance.hipaa = hipaaData;

        return hipaaData;
    }

    /**
     * Process marketing consent
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} marketingConfig - Marketing configuration
     * @param {string} configuredBy - User configuring marketing
     * @returns {Promise<Object>} Marketing configuration result
     */
    async #processMarketingConsent(settings, marketingConfig, configuredBy) {
        const marketingData = {
            emailMarketing: marketingConfig.emailMarketing !== false,
            smsMarketing: marketingConfig.smsMarketing || false,
            thirdPartySharing: marketingConfig.thirdPartySharing || false,
            consentMethod: marketingConfig.consentMethod || 'explicit',
            consentDate: new Date(),
            preferences: marketingConfig.preferences || {},
            configuredBy
        };

        if (!settings.compliance) settings.compliance = {};
        settings.compliance.marketing = marketingData;

        return marketingData;
    }

    /**
     * Send compliance notifications
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} complianceResults - Compliance configuration results
     * @param {string} configuredBy - User who configured compliance
     */
    async #sendComplianceNotifications(settings, complianceResults, configuredBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'COMPLIANCE_CONFIGURED',
                recipients: [settings.userId.toString()],
                data: {
                    regulations: Object.keys(complianceResults),
                    configuredBy
                }
            });

            // Send compliance confirmation email
            await this.#emailService.sendComplianceConfirmation(settings.userId, {
                regulations: Object.keys(complianceResults),
                effectiveDate: new Date()
            });
        } catch (error) {
            logger.warn('Failed to send compliance notifications', {
                settingsId: settings._id,
                error: error.message
            });
        }
    }

    /**
     * Encrypt sensitive fields
     * @private
     * @param {Object} data - Data to encrypt
     * @returns {Promise<Object>} Data with encrypted fields
     */
    async #encryptSensitiveFields(data) {
        // This would use proper encryption in production
        const encrypted = { ...data };
        encrypted._encrypted = true;
        return encrypted;
    }

    /**
     * Decrypt sensitive fields
     * @private
     * @param {Object} data - Data to decrypt
     * @returns {Promise<Object>} Data with decrypted fields
     */
    async #decryptSensitiveFields(data) {
        // This would use proper decryption in production
        if (data._encrypted) {
            delete data._encrypted;
        }
        return data;
    }

    /**
     * Encrypt a single value
     * @private
     * @param {string} value - Value to encrypt
     * @returns {Promise<string>} Encrypted value
     */
    async #encryptValue(value) {
        // This would use proper encryption in production
        return Buffer.from(value).toString('base64');
    }

    /**
     * Validate import data
     * @private
     * @param {Object} importData - Data to validate
     */
    async #validateImportData(importData) {
        if (!importData || typeof importData !== 'object') {
            throw new ValidationError('Invalid import data format', 'INVALID_IMPORT_DATA');
        }

        // Validate version compatibility
        if (importData.version && importData.version > 2) {
            throw new ValidationError('Import data version not supported', 'UNSUPPORTED_VERSION');
        }

        // Validate required structure
        if (!importData.data && !importData.security && !importData.privacy) {
            throw new ValidationError('No valid settings found in import data', 'NO_SETTINGS_FOUND');
        }
    }

    /**
     * Validate imported configurations
     * @private
     * @param {Object} settings - Settings object with imported data
     * @returns {Promise<Object>} Validation results
     */
    async #validateImportedConfigurations(settings) {
        const results = {
            valid: true,
            warnings: [],
            errors: []
        };

        try {
            // Validate security settings
            if (settings.security) {
                await this.#validateSecuritySettings(settings.security);
            }

            // Validate notification settings
            if (settings.notifications) {
                this.#validateNotificationSettings(settings.notifications);
            }

            // Validate privacy settings
            if (settings.privacy) {
                this.#validatePrivacySettings(settings.privacy);
            }
        } catch (error) {
            results.valid = false;
            results.errors.push(error.message);
        }

        return results;
    }

    /**
     * Send import notifications
     * @private
     * @param {Object} settings - Settings object
     * @param {Object} importResults - Import results
     * @param {string} importedBy - User who imported settings
     */
    async #sendImportNotifications(settings, importResults, importedBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'SETTINGS_IMPORTED',
                recipients: [settings.userId.toString()],
                data: {
                    importedBy,
                    categoriesImported: importResults.categoriesImported || [],
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.warn('Failed to send import notifications', {
                settingsId: settings._id,
                error: error.message
            });
        }
    }

    /**
     * Calculate password age in days
     * @private
     * @param {Object} settings - Settings object
     * @returns {number} Password age in days
     */
    #calculatePasswordAge(settings) {
        const lastChanged = settings.security?.password?.lastChanged;
        if (!lastChanged) return 0;

        return Math.floor((Date.now() - new Date(lastChanged)) / (1000 * 60 * 60 * 24));
    }

    /**
     * Analyze session security configuration
     * @private
     * @param {Object} settings - Settings object
     * @returns {Object} Session security analysis
     */
    #analyzeSessionSecurity(settings) {
        const sessionConfig = settings.security?.sessions || {};

        return {
            maxConcurrent: sessionConfig.maxConcurrentSessions || 'unlimited',
            requireReauth: sessionConfig.requireReauth?.enabled || false,
            reauthInterval: sessionConfig.requireReauth?.interval || 'never',
            idleTimeout: sessionConfig.idleTimeout || 'disabled',
            secureOnly: sessionConfig.secureOnly !== false,
            score: this.#calculateSessionSecurityScore(sessionConfig)
        };
    }

    /**
     * Calculate session security score
     * @private
     * @param {Object} sessionConfig - Session configuration
     * @returns {number} Security score (0-100)
     */
    #calculateSessionSecurityScore(sessionConfig) {
        let score = 0;

        if (sessionConfig.maxConcurrentSessions && sessionConfig.maxConcurrentSessions <= 5) score += 25;
        if (sessionConfig.requireReauth?.enabled) score += 25;
        if (sessionConfig.idleTimeout && sessionConfig.idleTimeout <= 30) score += 25;
        if (sessionConfig.secureOnly !== false) score += 25;

        return score;
    }

    /**
     * Analyze API security configuration
     * @private
     * @param {Object} settings - Settings object
     * @returns {Object} API security analysis
     */
    #analyzeAPISecurity(settings) {
        const apiConfig = settings.api || {};

        return {
            enabled: apiConfig.access?.enabled || false,
            keyCount: apiConfig.access?.keys?.length || 0,
            maxKeys: apiConfig.access?.maxKeys || 0,
            rateLimit: apiConfig.rateLimit?.requestsPerMinute || 'unlimited',
            lastKeyUsed: apiConfig.access?.keys?.[0]?.lastUsed || null,
            score: this.#calculateAPISecurityScore(apiConfig)
        };
    }

    /**
     * Calculate API security score
     * @private
     * @param {Object} apiConfig - API configuration
     * @returns {number} Security score (0-100)
     */
    #calculateAPISecurityScore(apiConfig) {
        let score = 100; // Start with full score

        if (!apiConfig.access?.enabled) return score; // No API access = secure

        if (!apiConfig.rateLimit || apiConfig.rateLimit.requestsPerMinute > 1000) score -= 30;
        if (apiConfig.access.keys?.length > 10) score -= 20;
        if (!apiConfig.access.keys?.some(key => key.lastUsed)) score -= 10; // Unused keys

        return Math.max(score, 0);
    }

    /**
     * Helper methods for analytics assessments
     * @private
     */
    #assessGDPRCompliance(settings) {
        const gdpr = settings.compliance?.gdpr || {};
        return {
            consentGiven: gdpr.consentGiven || false,
            consentDate: gdpr.consentDate,
            rightToErasure: gdpr.rightToErasure !== false,
            rightToPortability: gdpr.rightToPortability !== false,
            compliant: !!gdpr.consentGiven
        };
    }

    #assessCCPACompliance(settings) {
        const ccpa = settings.compliance?.ccpa || {};
        return {
            optOutProvided: ccpa.optOut !== undefined,
            doNotSell: ccpa.doNotSell !== false,
            compliant: ccpa.optOut !== undefined
        };
    }

    #analyzeDataRetention(settings) {
        const retention = settings.data?.retention || {};
        return {
            autoDelete: retention.autoDelete || false,
            retentionPeriod: retention.period || 'unlimited',
            lastCleanup: retention.lastCleanup
        };
    }

    #analyzeConsentStatus(settings) {
        const compliance = settings.compliance || {};
        return {
            gdprConsent: compliance.gdpr?.consentGiven || false,
            marketingConsent: compliance.marketing?.emailMarketing || false,
            analyticsConsent: settings.privacy?.dataSharing?.analytics !== false,
            totalConsents: Object.keys(compliance).length
        };
    }

    #analyzeIntegrationUsage(settings) {
        const integrations = settings.integrations || {};
        const enabled = Object.values(integrations).filter(i => i.enabled);

        return {
            total: Object.keys(integrations).length,
            enabled: enabled.length,
            types: Object.keys(integrations),
            lastUsed: Math.max(...enabled.map(i => new Date(i.lastUsed || 0)))
        };
    }

    #analyzeAPIUsage(settings) {
        const api = settings.api || {};
        return {
            enabled: api.access?.enabled || false,
            totalKeys: api.access?.keys?.length || 0,
            activeKeys: api.access?.keys?.filter(k => k.lastUsed).length || 0,
            totalRequests: api.usage?.totalRequests || 0,
            lastRequest: api.usage?.lastRequest
        };
    }

    #analyzeFeatureAdoption(settings) {
        const features = {};

        features.mfa = settings.security?.twoFactor?.enabled || false;
        features.apiAccess = settings.api?.access?.enabled || false;
        features.privacyControls = !!settings.privacy?.profile;
        features.notifications = !!settings.notifications?.email;

        return {
            ...features,
            adoptionRate: Object.values(features).filter(Boolean).length / Object.keys(features).length
        };
    }

    #analyzeConfigurationHistory(settings) {
        const overrides = settings.metadata?.overrides || [];
        return {
            totalChanges: overrides.length,
            recentChanges: overrides.filter(o =>
                new Date(o.overriddenAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            ).length,
            lastChange: overrides[overrides.length - 1]?.overriddenAt
        };
    }

    /**
     * Validate bulk update item
     * @private
     * @param {Object} updateItem - Update item to validate
     */
    async #validateBulkUpdateItem(updateItem) {
        if (!updateItem.userId) {
            throw new ValidationError('User ID is required for bulk update', 'MISSING_USER_ID');
        }

        if (!updateItem.updates || typeof updateItem.updates !== 'object') {
            throw new ValidationError('Updates object is required', 'MISSING_UPDATES');
        }

        // Validate individual update
        await this.#validateSettingsUpdate(updateItem.updates, {});
    }

    /**
     * Process bulk update batch
     * @private
     * @param {Array} batch - Batch of updates
     * @param {string} updatedBy - User performing bulk update
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Batch results
     */
    async #processBulkUpdateBatch(batch, updatedBy, options) {
        const results = {
            successful: [],
            failed: [],
            warnings: []
        };

        for (const updateItem of batch) {
            try {
                await this.updateSettings(updateItem.userId, updateItem.updates, updatedBy, {
                    ...options,
                    skipNotifications: true // Handle notifications at bulk level
                });

                results.successful.push({
                    userId: updateItem.userId,
                    updatedFields: Object.keys(updateItem.updates)
                });
            } catch (error) {
                results.failed.push({
                    userId: updateItem.userId,
                    error: error.message,
                    code: error.code
                });
            }
        }

        return results;
    }

    /**
     * Send bulk update notifications
     * @private
     * @param {Object} results - Bulk update results
     * @param {string} updatedBy - User who performed bulk update
     */
    async #sendBulkUpdateNotifications(results, updatedBy) {
        try {
            // Notify affected users
            const userIds = results.successful.map(result => result.userId);

            if (userIds.length > 0) {
                await this.#notificationService.sendBulkNotification({
                    type: 'BULK_SETTINGS_UPDATE',
                    recipients: userIds,
                    data: {
                        updatedBy,
                        timestamp: new Date(),
                        affectedUsers: userIds.length
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send bulk update notifications', {
                affectedUsers: results.successful.length,
                error: error.message
            });
        }
    }

    /**
     * Helper methods for testing integrations
     * @private
     */
    async #testOAuthConnection(config) {
        // Mock OAuth test - in production would make actual OAuth validation call
        return !!(config.clientId && config.provider);
    }

    async #testSSOConnection(config) {
        // Mock SSO test - in production would validate SSO endpoint
        return !!(config.ssoUrl && config.entityId);
    }

    async #testLDAPConnection(config) {
        // Mock LDAP test - in production would attempt LDAP bind
        return !!(config.server && config.baseDN);
    }

    async #testWebhookConnection(config) {
        // Mock webhook test - in production would send test payload
        return !!config.url;
    }

    /**
     * Helper methods for MFA management
     * @private
     */
    async #initializeMFA(settings, userId) {
        await this.#configureMFA(userId, {
            methods: ['totp'],
            generateBackupCodes: true
        }, userId);
    }

    async #disableMFA(settings, userId) {
        settings.security.twoFactor.enabled = false;
        settings.security.twoFactor.disabledAt = new Date();
        settings.security.twoFactor.disabledBy = userId;
    }

    async #enableAPIAccess(settings, userId) {
        await this.#configureAPIAccess(userId, {
            maxKeys: 5,
            generateInitialKey: true
        }, userId);
    }

    async #disableAPIAccess(settings, userId) {
        if (settings.api) {
            settings.api.access.enabled = false;
            settings.api.access.disabledAt = new Date();
        }
    }

    async #initiateEmailVerification(settings, newEmail, userId) {
        const verificationToken = crypto.randomBytes(32).toString('hex');

        settings.notifications.email.address = newEmail;
        settings.notifications.email.verified = false;
        settings.notifications.email.verificationToken = verificationToken;

        // Send verification email
        await this.#emailService.sendEmailVerification(newEmail, {
            token: verificationToken,
            userId
        });
    }
}

module.exports = UserSettingsService;