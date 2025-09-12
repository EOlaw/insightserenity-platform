'use strict';

/**
 * @fileoverview Enterprise user settings controller for comprehensive account management, security, and system configuration
 * @module servers/enterprise/modules/user-management/controllers/user-settings-controller
 * @requires module:servers/enterprise/modules/user-management/services/user-settings-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/validation-helper
 * @requires module:shared/lib/utils/helpers/sanitization-helper
 */

const UserSettingsService = require('../services/user-settings-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const validationHelper = require('../../../../../shared/lib/utils/helpers/validation-helper');
const sanitizationHelper = require('../../../../../shared/lib/utils/helpers/sanitization-helper');

/**
 * Enterprise user settings controller for comprehensive settings management
 * @class UserSettingsController
 * @description Handles HTTP requests for user settings operations including security, integrations, compliance, and system configurations
 */
class UserSettingsController {
    /**
     * Create default user settings
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async createDefaultSettings(req, res, next) {
        try {
            const { template, organizationId, inheritFromOrg } = req.body;
            const userId = req.params.userId || req.user.id;
            const createdBy = req.user.id;

            logger.info('Creating default user settings', {
                userId,
                createdBy,
                template,
                organizationId,
                inheritFromOrg
            });

            // Validate required fields
            if (!userId) {
                throw new ValidationError('User ID is required', 'USER_ID_REQUIRED');
            }

            // Validate template if provided
            if (template && !['standard', 'enterprise', 'developer'].includes(template)) {
                throw new ValidationError('Invalid template type', 'INVALID_TEMPLATE');
            }

            // Validate organization ID format if provided
            if (organizationId && !validationHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Create settings with service
            const settings = await UserSettingsService.createDefaultSettings(
                userId,
                organizationId,
                {
                    template: template || 'standard',
                    inheritFromOrg: inheritFromOrg !== false,
                    session: req.dbSession
                }
            );

            logger.info('Default settings created successfully', {
                settingsId: settings._id,
                userId,
                template: template || 'standard'
            });

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    settings,
                    'Default settings created successfully',
                    {
                        settingsId: settings._id,
                        template: template || 'standard',
                        inheritFromOrganization: inheritFromOrg !== false
                    }
                )
            );
        } catch (error) {
            logger.error('Error creating default settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                createdBy: req.user?.id,
                requestBody: req.body
            });
            next(error);
        }
    }

    /**
     * Get user settings with optional filtering and population
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const {
                category,
                includeDefaults = true,
                includeSecrets = false,
                checkPermissions = true
            } = req.query;

            logger.info('Retrieving user settings', {
                userId,
                requesterId: req.user.id,
                category,
                includeDefaults,
                includeSecrets
            });

            // Validate category if provided
            if (category) {
                const validCategories = [
                    'security', 'privacy', 'notifications', 'integrations', 
                    'billing', 'api', 'compliance', 'data', 'features'
                ];
                if (!validCategories.includes(category)) {
                    throw new ValidationError('Invalid settings category', 'INVALID_CATEGORY');
                }
            }

            // Get settings from service
            const settings = await UserSettingsService.getSettings(userId, {
                category,
                includeDefaults: stringHelper.parseBoolean(includeDefaults),
                includeSecrets: stringHelper.parseBoolean(includeSecrets),
                requesterId: req.user.id,
                checkPermissions: stringHelper.parseBoolean(checkPermissions)
            });

            logger.info('Settings retrieved successfully', {
                userId,
                requesterId: req.user.id,
                hasData: !!settings,
                category
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    settings,
                    'Settings retrieved successfully',
                    {
                        userId,
                        category: category || 'all',
                        lastUpdated: settings.computed?.lastUpdated,
                        version: settings.computed?.version
                    }
                )
            );
        } catch (error) {
            logger.error('Error retrieving settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                requesterId: req.user?.id,
                category: req.query.category
            });
            next(error);
        }
    }

    /**
     * Update user settings with comprehensive validation
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async updateSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const updateData = req.body;
            const updatedBy = req.user.id;
            const {
                category,
                requireApproval = false,
                reason,
                validateChanges = true
            } = req.query;

            logger.info('Updating user settings', {
                userId,
                updatedBy,
                category,
                requireApproval,
                updateFields: Object.keys(updateData)
            });

            // Validate that there's data to update
            if (!updateData || Object.keys(updateData).length === 0) {
                throw new ValidationError('No update data provided', 'NO_UPDATE_DATA');
            }

            // Validate update data structure
            this.#validateUpdateDataStructure(updateData);

            // Sanitize input data
            const sanitizedData = sanitizationHelper.sanitizeObject(updateData, {
                allowHtml: false,
                trimStrings: true,
                removeEmpty: false
            });

            // Update settings using service
            const updatedSettings = await UserSettingsService.updateSettings(
                userId,
                sanitizedData,
                updatedBy,
                {
                    category,
                    requireApproval: stringHelper.parseBoolean(requireApproval),
                    reason,
                    validateChanges: stringHelper.parseBoolean(validateChanges),
                    session: req.dbSession
                }
            );

            logger.info('Settings updated successfully', {
                settingsId: updatedSettings._id,
                userId,
                updatedBy,
                updateFields: Object.keys(updateData)
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    updatedSettings,
                    'Settings updated successfully',
                    {
                        settingsId: updatedSettings._id,
                        updatedFields: Object.keys(updateData),
                        requiresApproval: stringHelper.parseBoolean(requireApproval),
                        lastUpdated: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error updating settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                updatedBy: req.user?.id,
                updateFields: Object.keys(req.body || {})
            });
            next(error);
        }
    }

    /**
     * Configure security settings with advanced validation
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureSecuritySettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const securityConfig = req.body;
            const configuredBy = req.user.id;
            const {
                enforcePolicy = true,
                notifyUser = true,
                validateStrength = true
            } = req.query;

            logger.info('Configuring security settings', {
                userId,
                configuredBy,
                enforcePolicy,
                configurationTypes: Object.keys(securityConfig)
            });

            // Validate security configuration structure
            this.#validateSecurityConfiguration(securityConfig);

            // Validate specific security components
            if (securityConfig.password) {
                this.#validatePasswordPolicy(securityConfig.password, stringHelper.parseBoolean(validateStrength));
            }

            if (securityConfig.twoFactor) {
                this.#validateMFAConfiguration(securityConfig.twoFactor);
            }

            if (securityConfig.sessions) {
                this.#validateSessionConfiguration(securityConfig.sessions);
            }

            if (securityConfig.access) {
                this.#validateAccessConfiguration(securityConfig.access);
            }

            // Configure security settings using service
            const securityResult = await UserSettingsService.configureSecuritySettings(
                userId,
                securityConfig,
                configuredBy,
                {
                    enforcePolicy: stringHelper.parseBoolean(enforcePolicy),
                    notifyUser: stringHelper.parseBoolean(notifyUser),
                    session: req.dbSession
                }
            );

            logger.info('Security settings configured successfully', {
                userId,
                configuredBy,
                configurationsApplied: Object.keys(securityResult.updatedSettings)
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    securityResult,
                    'Security settings configured successfully',
                    {
                        userId,
                        configurationsApplied: Object.keys(securityResult.updatedSettings),
                        enforcePolicy: stringHelper.parseBoolean(enforcePolicy),
                        configuredAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring security settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                configuredBy: req.user?.id,
                securityConfig: Object.keys(req.body || {})
            });
            next(error);
        }
    }

    /**
     * Setup and configure integrations with external services
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async setupIntegration(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const { integrationType } = req.params;
            const integrationConfig = req.body;
            const configuredBy = req.user.id;
            const {
                validateConfig = true,
                testConnection = false,
                skipValidation = false
            } = req.query;

            logger.info('Setting up integration', {
                userId,
                integrationType,
                configuredBy,
                validateConfig,
                testConnection
            });

            // Validate integration type
            const validIntegrationTypes = ['oauth', 'sso', 'ldap', 'api', 'webhook', 'smtp'];
            if (!validIntegrationTypes.includes(integrationType)) {
                throw new ValidationError('Invalid integration type', 'INVALID_INTEGRATION_TYPE');
            }

            // Validate integration configuration based on type
            if (!stringHelper.parseBoolean(skipValidation)) {
                this.#validateIntegrationConfig(integrationType, integrationConfig);
            }

            // Setup integration using service
            const integrationResult = await UserSettingsService.setupIntegration(
                userId,
                integrationType,
                integrationConfig,
                configuredBy,
                {
                    validateConfig: stringHelper.parseBoolean(validateConfig),
                    testConnection: stringHelper.parseBoolean(testConnection),
                    session: req.dbSession
                }
            );

            logger.info('Integration setup completed', {
                userId,
                integrationType,
                configuredBy,
                success: integrationResult.success,
                connectionTested: !!integrationResult.connectionTest
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    integrationResult,
                    'Integration configured successfully',
                    {
                        userId,
                        integrationType,
                        connectionTested: stringHelper.parseBoolean(testConnection),
                        configuredAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error setting up integration', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                integrationType: req.params.integrationType,
                configuredBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Configure compliance settings for regulatory requirements
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureCompliance(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const complianceConfig = req.body;
            const configuredBy = req.user.id;
            const {
                regulatory = [],
                ipAddress = req.ip,
                userAgent = req.get('User-Agent')
            } = req.query;

            logger.info('Configuring compliance settings', {
                userId,
                configuredBy,
                regulatory,
                complianceTypes: Object.keys(complianceConfig),
                ipAddress
            });

            // Validate compliance configuration
            this.#validateComplianceConfiguration(complianceConfig);

            // Validate regulatory requirements if specified
            if (regulatory.length > 0) {
                const validRegulatory = ['gdpr', 'ccpa', 'hipaa', 'sox', 'pci'];
                const invalidRegulatory = regulatory.filter(reg => !validRegulatory.includes(reg));
                if (invalidRegulatory.length > 0) {
                    throw new ValidationError(
                        `Invalid regulatory requirements: ${invalidRegulatory.join(', ')}`,
                        'INVALID_REGULATORY'
                    );
                }
            }

            // Configure compliance using service
            const complianceResult = await UserSettingsService.configureCompliance(
                userId,
                complianceConfig,
                configuredBy,
                {
                    regulatory: Array.isArray(regulatory) ? regulatory : [regulatory].filter(Boolean),
                    ipAddress,
                    userAgent,
                    session: req.dbSession
                }
            );

            logger.info('Compliance settings configured successfully', {
                userId,
                configuredBy,
                regulationsConfigured: Object.keys(complianceResult.compliance)
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    complianceResult,
                    'Compliance settings configured successfully',
                    {
                        userId,
                        regulationsConfigured: Object.keys(complianceResult.compliance),
                        effectiveDate: complianceResult.effectiveDate,
                        ipAddress,
                        configuredAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring compliance settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                configuredBy: req.user?.id,
                complianceTypes: Object.keys(req.body || {})
            });
            next(error);
        }
    }

    /**
     * Export user settings for backup or migration
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async exportSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const requesterId = req.user.id;
            const {
                format = 'json',
                includeSecrets = false,
                categories,
                encryptSecrets = true
            } = req.query;

            logger.info('Exporting user settings', {
                userId,
                requesterId,
                format,
                includeSecrets,
                categories
            });

            // Validate export format
            const validFormats = ['json', 'yaml', 'xml', 'csv'];
            if (!validFormats.includes(format)) {
                throw new ValidationError('Invalid export format', 'INVALID_EXPORT_FORMAT');
            }

            // Parse categories if provided
            let parsedCategories = null;
            if (categories) {
                parsedCategories = typeof categories === 'string' 
                    ? categories.split(',').map(cat => cat.trim())
                    : categories;
            }

            // Export settings using service
            const exportResult = await UserSettingsService.exportSettings(userId, {
                format,
                includeSecrets: stringHelper.parseBoolean(includeSecrets),
                categories: parsedCategories,
                requesterId,
                encryptSecrets: stringHelper.parseBoolean(encryptSecrets)
            });

            logger.info('Settings exported successfully', {
                userId,
                requesterId,
                format,
                categoriesExported: exportResult.categories,
                exportSize: JSON.stringify(exportResult.data).length
            });

            // Set appropriate content-type header
            const contentType = this.#getContentTypeForFormat(format);
            res.set('Content-Type', contentType);

            // Set download filename
            const timestamp = dateHelper.formatDate(new Date(), 'YYYYMMDD_HHmmss');
            const filename = `user_settings_${userId}_${timestamp}.${format}`;
            res.set('Content-Disposition', `attachment; filename="${filename}"`);

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    exportResult,
                    'Settings exported successfully',
                    {
                        userId,
                        format,
                        categoriesExported: exportResult.categories,
                        exportedAt: exportResult.exportedAt,
                        filename
                    }
                )
            );
        } catch (error) {
            logger.error('Error exporting settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                requesterId: req.user?.id,
                format: req.query.format
            });
            next(error);
        }
    }

    /**
     * Import settings from backup or migration data
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async importSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const importData = req.body;
            const importedBy = req.user.id;
            const {
                mergeStrategy = 'merge',
                validateData = true,
                decryptSecrets = true,
                categories,
                dryRun = false
            } = req.query;

            logger.info('Importing user settings', {
                userId,
                importedBy,
                mergeStrategy,
                validateData,
                dryRun,
                hasImportData: !!importData
            });

            // Validate import data structure
            if (!importData || typeof importData !== 'object') {
                throw new ValidationError('Invalid import data format', 'INVALID_IMPORT_DATA');
            }

            // Validate merge strategy
            const validStrategies = ['merge', 'replace', 'append'];
            if (!validStrategies.includes(mergeStrategy)) {
                throw new ValidationError('Invalid merge strategy', 'INVALID_MERGE_STRATEGY');
            }

            // Parse categories if provided
            let parsedCategories = null;
            if (categories) {
                parsedCategories = typeof categories === 'string' 
                    ? categories.split(',').map(cat => cat.trim())
                    : categories;
            }

            // Import settings using service
            const importResult = await UserSettingsService.importSettings(
                userId,
                importData,
                importedBy,
                {
                    mergeStrategy,
                    validateData: stringHelper.parseBoolean(validateData),
                    decryptSecrets: stringHelper.parseBoolean(decryptSecrets),
                    categories: parsedCategories,
                    dryRun: stringHelper.parseBoolean(dryRun),
                    session: req.dbSession
                }
            );

            logger.info('Settings import completed', {
                userId,
                importedBy,
                success: importResult.success,
                mergeStrategy,
                dryRun: stringHelper.parseBoolean(dryRun)
            });

            const statusCode = stringHelper.parseBoolean(dryRun) ? StatusCodes.OK : StatusCodes.OK;
            const message = stringHelper.parseBoolean(dryRun) 
                ? 'Settings import validated successfully (dry run)' 
                : 'Settings imported successfully';

            return res.status(statusCode).json(
                responseFormatter.success(
                    importResult,
                    message,
                    {
                        userId,
                        mergeStrategy,
                        dryRun: stringHelper.parseBoolean(dryRun),
                        importedAt: new Date(),
                        validationResults: importResult.validationResults
                    }
                )
            );
        } catch (error) {
            logger.error('Error importing settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                importedBy: req.user?.id,
                mergeStrategy: req.query.mergeStrategy
            });
            next(error);
        }
    }

    /**
     * Get comprehensive settings analytics and reports
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getSettingsAnalytics(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const requesterId = req.user.id;
            const {
                includeCompliance = true,
                includeUsage = true,
                includeSecurityMetrics = true,
                timeRange = '30d'
            } = req.query;

            logger.info('Retrieving settings analytics', {
                userId,
                requesterId,
                includeCompliance,
                includeUsage,
                includeSecurityMetrics,
                timeRange
            });

            // Validate time range format
            if (!this.#isValidTimeRange(timeRange)) {
                throw new ValidationError('Invalid time range format', 'INVALID_TIME_RANGE');
            }

            // Get analytics using service
            const analytics = await UserSettingsService.getSettingsAnalytics(userId, {
                includeCompliance: stringHelper.parseBoolean(includeCompliance),
                includeUsage: stringHelper.parseBoolean(includeUsage),
                includeSecurityMetrics: stringHelper.parseBoolean(includeSecurityMetrics),
                timeRange,
                requesterId
            });

            logger.info('Settings analytics retrieved successfully', {
                userId,
                requesterId,
                analyticsGenerated: !!analytics,
                securityScore: analytics.security?.securityScore
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    analytics,
                    'Settings analytics retrieved successfully',
                    {
                        userId,
                        timeRange,
                        generatedAt: new Date(),
                        includeCompliance: stringHelper.parseBoolean(includeCompliance),
                        includeUsage: stringHelper.parseBoolean(includeUsage)
                    }
                )
            );
        } catch (error) {
            logger.error('Error retrieving settings analytics', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                requesterId: req.user?.id,
                timeRange: req.query.timeRange
            });
            next(error);
        }
    }

    /**
     * Perform bulk settings updates across multiple users
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async bulkUpdateSettings(req, res, next) {
        try {
            const { updates } = req.body;
            const updatedBy = req.user.id;
            const {
                validateAll = true,
                continueOnError = true,
                notifyUsers = false,
                batchSize = 50
            } = req.query;

            logger.info('Performing bulk settings update', {
                updatedBy,
                updateCount: updates?.length || 0,
                validateAll,
                continueOnError,
                notifyUsers
            });

            // Validate bulk update structure
            if (!Array.isArray(updates) || updates.length === 0) {
                throw new ValidationError('Updates array is required and must not be empty', 'INVALID_UPDATES_ARRAY');
            }

            // Validate batch size
            if (updates.length > 1000) {
                throw new ValidationError('Bulk update size exceeds maximum limit of 1000', 'BULK_SIZE_EXCEEDED');
            }

            // Validate each update item structure
            for (let i = 0; i < Math.min(updates.length, 10); i++) {
                const update = updates[i];
                if (!update.userId || !update.updates) {
                    throw new ValidationError(
                        `Invalid update structure at index ${i}: userId and updates are required`,
                        'INVALID_UPDATE_STRUCTURE'
                    );
                }
            }

            // Perform bulk update using service
            const bulkResult = await UserSettingsService.bulkUpdateSettings(
                updates,
                updatedBy,
                {
                    validateAll: stringHelper.parseBoolean(validateAll),
                    continueOnError: stringHelper.parseBoolean(continueOnError),
                    notifyUsers: stringHelper.parseBoolean(notifyUsers),
                    batchSize: parseInt(batchSize, 10) || 50
                }
            );

            logger.info('Bulk settings update completed', {
                updatedBy,
                totalUpdates: updates.length,
                successful: bulkResult.successful.length,
                failed: bulkResult.failed.length
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    bulkResult,
                    'Bulk settings update completed',
                    {
                        totalUpdates: updates.length,
                        successful: bulkResult.successful.length,
                        failed: bulkResult.failed.length,
                        warnings: bulkResult.warnings.length,
                        completedAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error performing bulk settings update', {
                error: error.message,
                stack: error.stack,
                updatedBy: req.user?.id,
                updateCount: req.body?.updates?.length || 0
            });
            next(error);
        }
    }

    /**
     * Reset user settings to default values
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async resetSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const resetBy = req.user.id;
            const {
                categories,
                preservePersonal = true,
                preserveSecurity = true,
                reason
            } = req.query;

            logger.info('Resetting user settings', {
                userId,
                resetBy,
                categories,
                preservePersonal,
                preserveSecurity,
                reason
            });

            // Parse categories if provided
            let parsedCategories = null;
            if (categories) {
                parsedCategories = typeof categories === 'string' 
                    ? categories.split(',').map(cat => cat.trim())
                    : categories;
            }

            // Validate categories
            if (parsedCategories) {
                const validCategories = [
                    'security', 'privacy', 'notifications', 'integrations', 
                    'billing', 'api', 'compliance', 'data', 'features'
                ];
                const invalidCategories = parsedCategories.filter(cat => !validCategories.includes(cat));
                if (invalidCategories.length > 0) {
                    throw new ValidationError(
                        `Invalid categories: ${invalidCategories.join(', ')}`,
                        'INVALID_CATEGORIES'
                    );
                }
            }

            // Get current settings first
            const currentSettings = await UserSettingsService.getSettings(userId, {
                requesterId: resetBy,
                includeSecrets: false
            });

            // Build reset data
            const resetData = this.#buildResetData(
                currentSettings,
                parsedCategories,
                {
                    preservePersonal: stringHelper.parseBoolean(preservePersonal),
                    preserveSecurity: stringHelper.parseBoolean(preserveSecurity)
                }
            );

            // Perform update with reset data
            const resetSettings = await UserSettingsService.updateSettings(
                userId,
                resetData,
                resetBy,
                {
                    reason: reason || 'Settings reset to defaults',
                    session: req.dbSession
                }
            );

            logger.info('Settings reset completed successfully', {
                userId,
                resetBy,
                categoriesReset: parsedCategories || 'all'
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    resetSettings,
                    'Settings reset to defaults successfully',
                    {
                        userId,
                        categoriesReset: parsedCategories || 'all',
                        preservePersonal: stringHelper.parseBoolean(preservePersonal),
                        preserveSecurity: stringHelper.parseBoolean(preserveSecurity),
                        resetAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error resetting settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                resetBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Validate settings configuration and compliance
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async validateSettings(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const validatedBy = req.user.id;
            const {
                categories,
                checkCompliance = true,
                checkSecurity = true,
                generateReport = false
            } = req.query;

            logger.info('Validating user settings', {
                userId,
                validatedBy,
                categories,
                checkCompliance,
                checkSecurity,
                generateReport
            });

            // Get current settings
            const settings = await UserSettingsService.getSettings(userId, {
                requesterId: validatedBy,
                includeSecrets: false
            });

            // Parse categories if provided
            let parsedCategories = null;
            if (categories) {
                parsedCategories = typeof categories === 'string' 
                    ? categories.split(',').map(cat => cat.trim())
                    : categories;
            }

            // Perform validation
            const validationResult = await this.#performSettingsValidation(
                settings,
                {
                    categories: parsedCategories,
                    checkCompliance: stringHelper.parseBoolean(checkCompliance),
                    checkSecurity: stringHelper.parseBoolean(checkSecurity),
                    generateReport: stringHelper.parseBoolean(generateReport)
                }
            );

            logger.info('Settings validation completed', {
                userId,
                validatedBy,
                isValid: validationResult.isValid,
                issuesFound: validationResult.issues.length
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    validationResult,
                    'Settings validation completed',
                    {
                        userId,
                        categoriesValidated: parsedCategories || 'all',
                        validatedAt: new Date(),
                        isValid: validationResult.isValid,
                        issuesCount: validationResult.issues.length
                    }
                )
            );
        } catch (error) {
            logger.error('Error validating settings', {
                error: error.message,
                stack: error.stack,
                userId: req.params.userId || req.user?.id,
                validatedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Clone settings from one user to another
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async cloneSettings(req, res, next) {
        try {
            const { sourceUserId, targetUserId } = req.params;
            const clonedBy = req.user.id;
            const {
                categories,
                excludePersonal = true,
                excludeSecrets = true,
                mergeStrategy = 'merge'
            } = req.query;

            logger.info('Cloning user settings', {
                sourceUserId,
                targetUserId,
                clonedBy,
                categories,
                excludePersonal,
                excludeSecrets
            });

            // Validate user IDs
            if (!validationHelper.isValidObjectId(sourceUserId) || !validationHelper.isValidObjectId(targetUserId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            if (sourceUserId === targetUserId) {
                throw new ValidationError('Source and target users cannot be the same', 'SAME_USER_CLONE');
            }

            // Parse categories if provided
            let parsedCategories = null;
            if (categories) {
                parsedCategories = typeof categories === 'string' 
                    ? categories.split(',').map(cat => cat.trim())
                    : categories;
            }

            // Get source settings
            const sourceSettings = await UserSettingsService.exportSettings(sourceUserId, {
                includeSecrets: !stringHelper.parseBoolean(excludeSecrets),
                categories: parsedCategories,
                requesterId: clonedBy
            });

            // Filter out personal data if requested
            let cloneData = sourceSettings.data;
            if (stringHelper.parseBoolean(excludePersonal)) {
                cloneData = this.#filterPersonalData(cloneData);
            }

            // Import settings to target user
            const cloneResult = await UserSettingsService.importSettings(
                targetUserId,
                { data: cloneData },
                clonedBy,
                {
                    mergeStrategy,
                    validateData: true,
                    session: req.dbSession
                }
            );

            logger.info('Settings cloning completed', {
                sourceUserId,
                targetUserId,
                clonedBy,
                success: cloneResult.success
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    cloneResult,
                    'Settings cloned successfully',
                    {
                        sourceUserId,
                        targetUserId,
                        categoriesCloned: parsedCategories || 'all',
                        excludePersonal: stringHelper.parseBoolean(excludePersonal),
                        excludeSecrets: stringHelper.parseBoolean(excludeSecrets),
                        clonedAt: new Date()
                    }
                )
            );
        } catch (error) {
            logger.error('Error cloning settings', {
                error: error.message,
                stack: error.stack,
                sourceUserId: req.params.sourceUserId,
                targetUserId: req.params.targetUserId,
                clonedBy: req.user?.id
            });
            next(error);
        }
    }

    // ==================== PRIVATE VALIDATION METHODS ====================

    /**
     * Validate update data structure
     * @static
     * @private
     * @param {Object} updateData - Data to validate
     */
    static #validateUpdateDataStructure(updateData) {
        // Check for valid update structure
        const validCategories = [
            'security', 'privacy', 'notifications', 'integrations', 
            'billing', 'api', 'compliance', 'data', 'features'
        ];

        for (const [key, value] of Object.entries(updateData)) {
            if (!validCategories.includes(key)) {
                throw new ValidationError(`Invalid settings category: ${key}`, 'INVALID_SETTINGS_CATEGORY');
            }

            if (value && typeof value !== 'object') {
                throw new ValidationError(`Settings category ${key} must be an object`, 'INVALID_CATEGORY_TYPE');
            }
        }
    }

    /**
     * Validate security configuration structure
     * @static
     * @private
     * @param {Object} securityConfig - Security configuration to validate
     */
    static #validateSecurityConfiguration(securityConfig) {
        if (!securityConfig || typeof securityConfig !== 'object') {
            throw new ValidationError('Security configuration must be an object', 'INVALID_SECURITY_CONFIG');
        }

        const validSecurityCategories = ['password', 'twoFactor', 'sessions', 'access', 'monitoring'];
        const invalidCategories = Object.keys(securityConfig).filter(cat => !validSecurityCategories.includes(cat));

        if (invalidCategories.length > 0) {
            throw new ValidationError(
                `Invalid security categories: ${invalidCategories.join(', ')}`,
                'INVALID_SECURITY_CATEGORIES'
            );
        }
    }

    /**
     * Validate password policy configuration
     * @static
     * @private
     * @param {Object} passwordConfig - Password configuration
     * @param {boolean} validateStrength - Whether to validate strength requirements
     */
    static #validatePasswordPolicy(passwordConfig, validateStrength = true) {
        if (passwordConfig.minLength && (passwordConfig.minLength < 6 || passwordConfig.minLength > 128)) {
            throw new ValidationError('Password minimum length must be between 6 and 128 characters', 'INVALID_PASSWORD_LENGTH');
        }

        if (passwordConfig.maxLength && (passwordConfig.maxLength < 8 || passwordConfig.maxLength > 256)) {
            throw new ValidationError('Password maximum length must be between 8 and 256 characters', 'INVALID_PASSWORD_MAX_LENGTH');
        }

        if (passwordConfig.changeFrequency && (passwordConfig.changeFrequency < 30 || passwordConfig.changeFrequency > 365)) {
            throw new ValidationError('Password change frequency must be between 30 and 365 days', 'INVALID_PASSWORD_FREQUENCY');
        }

        if (validateStrength) {
            const requiredComplexity = ['requireUppercase', 'requireLowercase', 'requireNumbers', 'requireSpecialChars'];
            const providedComplexity = requiredComplexity.filter(req => passwordConfig[req] === true);

            if (providedComplexity.length < 2) {
                throw new ValidationError('Password policy must require at least 2 complexity requirements', 'INSUFFICIENT_PASSWORD_COMPLEXITY');
            }
        }
    }

    /**
     * Validate MFA configuration
     * @static
     * @private
     * @param {Object} mfaConfig - MFA configuration
     */
    static #validateMFAConfiguration(mfaConfig) {
        const validMfaMethods = ['totp', 'sms', 'email', 'hardware_key', 'backup_codes'];

        if (mfaConfig.methods && Array.isArray(mfaConfig.methods)) {
            const invalidMethods = mfaConfig.methods.filter(method => !validMfaMethods.includes(method));
            if (invalidMethods.length > 0) {
                throw new ValidationError(
                    `Invalid MFA methods: ${invalidMethods.join(', ')}`,
                    'INVALID_MFA_METHODS'
                );
            }
        }

        if (mfaConfig.gracePeriod && (mfaConfig.gracePeriod < 0 || mfaConfig.gracePeriod > 30)) {
            throw new ValidationError('MFA grace period must be between 0 and 30 days', 'INVALID_MFA_GRACE_PERIOD');
        }

        if (mfaConfig.backupCodesCount && (mfaConfig.backupCodesCount < 5 || mfaConfig.backupCodesCount > 20)) {
            throw new ValidationError('Backup codes count must be between 5 and 20', 'INVALID_BACKUP_CODES_COUNT');
        }
    }

    /**
     * Validate session configuration
     * @static
     * @private
     * @param {Object} sessionConfig - Session configuration
     */
    static #validateSessionConfiguration(sessionConfig) {
        if (sessionConfig.maxConcurrentSessions && (sessionConfig.maxConcurrentSessions < 1 || sessionConfig.maxConcurrentSessions > 20)) {
            throw new ValidationError('Max concurrent sessions must be between 1 and 20', 'INVALID_MAX_SESSIONS');
        }

        if (sessionConfig.maxDuration && (sessionConfig.maxDuration < 1 || sessionConfig.maxDuration > 24)) {
            throw new ValidationError('Session max duration must be between 1 and 24 hours', 'INVALID_SESSION_DURATION');
        }

        if (sessionConfig.idleTimeout && (sessionConfig.idleTimeout < 5 || sessionConfig.idleTimeout > 120)) {
            throw new ValidationError('Session idle timeout must be between 5 and 120 minutes', 'INVALID_IDLE_TIMEOUT');
        }
    }

    /**
     * Validate access configuration
     * @static
     * @private
     * @param {Object} accessConfig - Access configuration
     */
    static #validateAccessConfiguration(accessConfig) {
        if (accessConfig.ipWhitelist && accessConfig.ipWhitelist.addresses) {
            for (const entry of accessConfig.ipWhitelist.addresses) {
                if (!validationHelper.isValidIP(entry.ip)) {
                    throw new ValidationError(`Invalid IP address: ${entry.ip}`, 'INVALID_IP_ADDRESS');
                }
            }
        }

        if (accessConfig.locationRestrictions && accessConfig.locationRestrictions.countries) {
            const validCountryCodes = /^[A-Z]{2}$/;
            const invalidCountries = accessConfig.locationRestrictions.countries.filter(
                code => !validCountryCodes.test(code)
            );

            if (invalidCountries.length > 0) {
                throw new ValidationError(
                    `Invalid country codes: ${invalidCountries.join(', ')}`,
                    'INVALID_COUNTRY_CODES'
                );
            }
        }
    }

    /**
     * Validate integration configuration based on type
     * @static
     * @private
     * @param {string} integrationType - Integration type
     * @param {Object} config - Integration configuration
     */
    static #validateIntegrationConfig(integrationType, config) {
        switch (integrationType) {
            case 'oauth':
                this.#validateOAuthConfig(config);
                break;
            case 'sso':
                this.#validateSSOConfig(config);
                break;
            case 'ldap':
                this.#validateLDAPConfig(config);
                break;
            case 'api':
                this.#validateAPIConfig(config);
                break;
            case 'webhook':
                this.#validateWebhookConfig(config);
                break;
            case 'smtp':
                this.#validateSMTPConfig(config);
                break;
            default:
                throw new ValidationError(`Unsupported integration type: ${integrationType}`, 'UNSUPPORTED_INTEGRATION');
        }
    }

    /**
     * Validate OAuth integration configuration
     * @static
     * @private
     * @param {Object} config - OAuth configuration
     */
    static #validateOAuthConfig(config) {
        const requiredFields = ['provider', 'clientId'];
        const missingFields = requiredFields.filter(field => !config[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing OAuth fields: ${missingFields.join(', ')}`, 'MISSING_OAUTH_FIELDS');
        }

        const validProviders = ['google', 'microsoft', 'github', 'linkedin', 'slack', 'salesforce'];
        if (!validProviders.includes(config.provider)) {
            throw new ValidationError('Invalid OAuth provider', 'INVALID_OAUTH_PROVIDER');
        }

        if (config.redirectUri && !validationHelper.isValidURL(config.redirectUri)) {
            throw new ValidationError('Invalid OAuth redirect URI', 'INVALID_OAUTH_REDIRECT_URI');
        }
    }

    /**
     * Validate SSO integration configuration
     * @static
     * @private
     * @param {Object} config - SSO configuration
     */
    static #validateSSOConfig(config) {
        const requiredFields = ['provider', 'ssoUrl', 'entityId'];
        const missingFields = requiredFields.filter(field => !config[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing SSO fields: ${missingFields.join(', ')}`, 'MISSING_SSO_FIELDS');
        }

        if (!validationHelper.isValidURL(config.ssoUrl)) {
            throw new ValidationError('Invalid SSO URL', 'INVALID_SSO_URL');
        }

        if (config.certificate && config.certificate.length < 100) {
            throw new ValidationError('Invalid SSO certificate', 'INVALID_SSO_CERTIFICATE');
        }
    }

    /**
     * Validate LDAP integration configuration
     * @static
     * @private
     * @param {Object} config - LDAP configuration
     */
    static #validateLDAPConfig(config) {
        const requiredFields = ['server', 'baseDN'];
        const missingFields = requiredFields.filter(field => !config[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing LDAP fields: ${missingFields.join(', ')}`, 'MISSING_LDAP_FIELDS');
        }

        if (config.port && (config.port < 1 || config.port > 65535)) {
            throw new ValidationError('Invalid LDAP port', 'INVALID_LDAP_PORT');
        }

        if (config.searchTimeout && (config.searchTimeout < 1000 || config.searchTimeout > 60000)) {
            throw new ValidationError('LDAP search timeout must be between 1000ms and 60000ms', 'INVALID_LDAP_TIMEOUT');
        }
    }

    /**
     * Validate API integration configuration
     * @static
     * @private
     * @param {Object} config - API configuration
     */
    static #validateAPIConfig(config) {
        if (config.maxKeys && (config.maxKeys < 1 || config.maxKeys > 50)) {
            throw new ValidationError('API max keys must be between 1 and 50', 'INVALID_API_MAX_KEYS');
        }

        if (config.rateLimit) {
            if (config.rateLimit.requestsPerMinute < 1 || config.rateLimit.requestsPerMinute > 10000) {
                throw new ValidationError('API rate limit must be between 1 and 10000 requests per minute', 'INVALID_API_RATE_LIMIT');
            }
        }

        if (config.allowedIPs && Array.isArray(config.allowedIPs)) {
            const invalidIPs = config.allowedIPs.filter(ip => !validationHelper.isValidIP(ip));
            if (invalidIPs.length > 0) {
                throw new ValidationError(`Invalid API allowed IPs: ${invalidIPs.join(', ')}`, 'INVALID_API_IPS');
            }
        }
    }

    /**
     * Validate webhook integration configuration
     * @static
     * @private
     * @param {Object} config - Webhook configuration
     */
    static #validateWebhookConfig(config) {
        if (!config.url || !validationHelper.isValidURL(config.url)) {
            throw new ValidationError('Valid webhook URL is required', 'INVALID_WEBHOOK_URL');
        }

        if (config.events && !Array.isArray(config.events)) {
            throw new ValidationError('Webhook events must be an array', 'INVALID_WEBHOOK_EVENTS');
        }

        if (config.timeout && (config.timeout < 1000 || config.timeout > 30000)) {
            throw new ValidationError('Webhook timeout must be between 1000ms and 30000ms', 'INVALID_WEBHOOK_TIMEOUT');
        }

        if (config.retryAttempts && (config.retryAttempts < 0 || config.retryAttempts > 5)) {
            throw new ValidationError('Webhook retry attempts must be between 0 and 5', 'INVALID_WEBHOOK_RETRIES');
        }
    }

    /**
     * Validate SMTP integration configuration
     * @static
     * @private
     * @param {Object} config - SMTP configuration
     */
    static #validateSMTPConfig(config) {
        const requiredFields = ['host', 'port', 'username'];
        const missingFields = requiredFields.filter(field => !config[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing SMTP fields: ${missingFields.join(', ')}`, 'MISSING_SMTP_FIELDS');
        }

        if (config.port < 1 || config.port > 65535) {
            throw new ValidationError('Invalid SMTP port', 'INVALID_SMTP_PORT');
        }

        if (config.fromEmail && !validationHelper.isValidEmail(config.fromEmail)) {
            throw new ValidationError('Invalid SMTP from email', 'INVALID_SMTP_FROM_EMAIL');
        }
    }

    /**
     * Validate compliance configuration
     * @static
     * @private
     * @param {Object} complianceConfig - Compliance configuration
     */
    static #validateComplianceConfiguration(complianceConfig) {
        if (!complianceConfig || typeof complianceConfig !== 'object') {
            throw new ValidationError('Compliance configuration must be an object', 'INVALID_COMPLIANCE_CONFIG');
        }

        const validComplianceTypes = ['gdpr', 'ccpa', 'hipaa', 'sox', 'pci', 'marketing'];
        const invalidTypes = Object.keys(complianceConfig).filter(type => !validComplianceTypes.includes(type));

        if (invalidTypes.length > 0) {
            throw new ValidationError(
                `Invalid compliance types: ${invalidTypes.join(', ')}`,
                'INVALID_COMPLIANCE_TYPES'
            );
        }

        // Validate GDPR configuration
        if (complianceConfig.gdpr) {
            if (typeof complianceConfig.gdpr.consentGiven !== 'boolean') {
                throw new ValidationError('GDPR consent must be explicitly boolean', 'INVALID_GDPR_CONSENT');
            }

            if (complianceConfig.gdpr.dataRetentionPeriod) {
                const retention = parseInt(complianceConfig.gdpr.dataRetentionPeriod, 10);
                if (isNaN(retention) || retention < 1 || retention > 2555) {
                    throw new ValidationError('GDPR data retention period must be between 1 and 2555 days', 'INVALID_GDPR_RETENTION');
                }
            }
        }

        // Validate CCPA configuration
        if (complianceConfig.ccpa && typeof complianceConfig.ccpa.optOut !== 'boolean') {
            throw new ValidationError('CCPA opt-out must be boolean', 'INVALID_CCPA_OPTOUT');
        }

        // Validate marketing configuration
        if (complianceConfig.marketing) {
            const validConsentMethods = ['explicit', 'implicit', 'opt_in', 'opt_out'];
            if (complianceConfig.marketing.consentMethod && 
                !validConsentMethods.includes(complianceConfig.marketing.consentMethod)) {
                throw new ValidationError('Invalid marketing consent method', 'INVALID_MARKETING_CONSENT');
            }
        }
    }

    // ==================== PRIVATE UTILITY METHODS ====================

    /**
     * Get content type for export format
     * @static
     * @private
     * @param {string} format - Export format
     * @returns {string} Content type
     */
    static #getContentTypeForFormat(format) {
        const contentTypes = {
            json: 'application/json',
            yaml: 'application/x-yaml',
            xml: 'application/xml',
            csv: 'text/csv'
        };

        return contentTypes[format] || 'application/octet-stream';
    }

    /**
     * Check if time range format is valid
     * @static
     * @private
     * @param {string} timeRange - Time range string
     * @returns {boolean} Whether format is valid
     */
    static #isValidTimeRange(timeRange) {
        const timeRangePattern = /^(\d+)([dwmy])$/;
        return timeRangePattern.test(timeRange);
    }

    /**
     * Build reset data based on current settings and preservation options
     * @static
     * @private
     * @param {Object} currentSettings - Current settings
     * @param {Array} categories - Categories to reset
     * @param {Object} options - Preservation options
     * @returns {Object} Reset data
     */
    static #buildResetData(currentSettings, categories, options) {
        const { preservePersonal, preserveSecurity } = options;
        const resetData = {};

        // Define default values for each category
        const defaults = {
            privacy: {
                profile: { visibility: 'organization' },
                dataSharing: { analytics: false, thirdParty: false },
                communications: { allowMarketing: false }
            },
            notifications: {
                email: { enabled: true, frequency: 'instant' },
                sms: { enabled: false },
                push: { enabled: true },
                inApp: { enabled: true }
            },
            integrations: {},
            billing: {
                preferences: { currency: 'USD', invoiceEmail: null }
            },
            data: {
                retention: { autoDelete: false },
                backup: { enableAutoBackup: true }
            },
            features: {
                beta: { participateInBeta: false },
                experimental: { enableExperimentalFeatures: false }
            }
        };

        // Reset specified categories or all if none specified
        const categoriesToReset = categories || Object.keys(defaults);

        for (const category of categoriesToReset) {
            if (category === 'security' && preserveSecurity) {
                continue; // Skip security reset if preservation is enabled
            }

            if (defaults[category]) {
                resetData[category] = defaults[category];
            }
        }

        // Preserve personal data if requested
        if (preservePersonal && currentSettings.privacy) {
            if (resetData.privacy) {
                resetData.privacy = {
                    ...resetData.privacy,
                    profile: {
                        ...resetData.privacy.profile,
                        ...this.#extractPersonalData(currentSettings.privacy.profile)
                    }
                };
            }
        }

        return resetData;
    }

    /**
     * Extract personal data that should be preserved
     * @static
     * @private
     * @param {Object} profileData - Profile data
     * @returns {Object} Personal data to preserve
     */
    static #extractPersonalData(profileData) {
        if (!profileData) return {};

        const personalFields = ['displayName', 'bio', 'avatar', 'timezone', 'language'];
        const personalData = {};

        for (const field of personalFields) {
            if (profileData[field] !== undefined) {
                personalData[field] = profileData[field];
            }
        }

        return personalData;
    }

    /**
     * Filter out personal data from settings
     * @static
     * @private
     * @param {Object} settingsData - Settings data
     * @returns {Object} Filtered settings data
     */
    static #filterPersonalData(settingsData) {
        const filtered = { ...settingsData };

        // Remove personal information from various categories
        if (filtered.privacy?.profile) {
            delete filtered.privacy.profile.displayName;
            delete filtered.privacy.profile.bio;
            delete filtered.privacy.profile.avatar;
        }

        if (filtered.notifications?.email) {
            delete filtered.notifications.email.address;
        }

        if (filtered.notifications?.sms) {
            delete filtered.notifications.sms.phoneNumber;
        }

        if (filtered.billing?.preferences) {
            delete filtered.billing.preferences.invoiceEmail;
            delete filtered.billing.preferences.billingAddress;
        }

        return filtered;
    }

    /**
     * Perform comprehensive settings validation
     * @static
     * @private
     * @param {Object} settings - Settings to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation results
     */
    static async #performSettingsValidation(settings, options) {
        const {
            categories,
            checkCompliance,
            checkSecurity,
            generateReport
        } = options;

        const validationResult = {
            isValid: true,
            issues: [],
            warnings: [],
            recommendations: [],
            complianceStatus: {},
            securityScore: 0,
            report: null
        };

        try {
            // Validate specified categories or all
            const categoriesToValidate = categories || Object.keys(settings);

            for (const category of categoriesToValidate) {
                if (!settings[category]) continue;

                const categoryIssues = await this.#validateSettingsCategory(category, settings[category]);
                validationResult.issues.push(...categoryIssues);
            }

            // Check compliance if requested
            if (checkCompliance && settings.compliance) {
                validationResult.complianceStatus = this.#validateComplianceStatus(settings.compliance);
            }

            // Check security if requested
            if (checkSecurity && settings.security) {
                const securityValidation = this.#validateSecurityStatus(settings.security);
                validationResult.securityScore = securityValidation.score;
                validationResult.issues.push(...securityValidation.issues);
                validationResult.recommendations.push(...securityValidation.recommendations);
            }

            // Generate report if requested
            if (generateReport) {
                validationResult.report = this.#generateValidationReport(validationResult);
            }

            // Determine overall validity
            validationResult.isValid = validationResult.issues.length === 0;

        } catch (error) {
            validationResult.isValid = false;
            validationResult.issues.push({
                category: 'validation',
                type: 'error',
                message: `Validation failed: ${error.message}`,
                severity: 'high'
            });
        }

        return validationResult;
    }

    /**
     * Validate a specific settings category
     * @static
     * @private
     * @param {string} category - Category name
     * @param {Object} categoryData - Category data
     * @returns {Promise<Array>} Validation issues
     */
    static async #validateSettingsCategory(category, categoryData) {
        const issues = [];

        switch (category) {
            case 'security':
                issues.push(...this.#validateSecurityCategory(categoryData));
                break;
            case 'privacy':
                issues.push(...this.#validatePrivacyCategory(categoryData));
                break;
            case 'notifications':
                issues.push(...this.#validateNotificationsCategory(categoryData));
                break;
            case 'integrations':
                issues.push(...this.#validateIntegrationsCategory(categoryData));
                break;
            case 'compliance':
                issues.push(...this.#validateComplianceCategory(categoryData));
                break;
            default:
                // Generic validation for other categories
                break;
        }

        return issues;
    }

    /**
     * Validate security category settings
     * @static
     * @private
     * @param {Object} securityData - Security data
     * @returns {Array} Validation issues
     */
    static #validateSecurityCategory(securityData) {
        const issues = [];

        if (securityData.password) {
            if (!securityData.password.requireComplexPassword) {
                issues.push({
                    category: 'security',
                    type: 'warning',
                    message: 'Complex password requirements are disabled',
                    severity: 'medium',
                    field: 'password.requireComplexPassword'
                });
            }

            if (securityData.password.changeFrequency > 180) {
                issues.push({
                    category: 'security',
                    type: 'warning',
                    message: 'Password change frequency exceeds recommended 180 days',
                    severity: 'low',
                    field: 'password.changeFrequency'
                });
            }
        }

        if (securityData.twoFactor && !securityData.twoFactor.required) {
            issues.push({
                category: 'security',
                type: 'warning',
                message: 'Two-factor authentication is not required',
                severity: 'high',
                field: 'twoFactor.required'
            });
        }

        if (securityData.sessions) {
            if (securityData.sessions.maxConcurrentSessions > 10) {
                issues.push({
                    category: 'security',
                    type: 'warning',
                    message: 'High number of concurrent sessions allowed',
                    severity: 'medium',
                    field: 'sessions.maxConcurrentSessions'
                });
            }
        }

        return issues;
    }

    /**
     * Validate privacy category settings
     * @static
     * @private
     * @param {Object} privacyData - Privacy data
     * @returns {Array} Validation issues
     */
    static #validatePrivacyCategory(privacyData) {
        const issues = [];

        if (privacyData.profile?.visibility === 'public') {
            issues.push({
                category: 'privacy',
                type: 'info',
                message: 'Profile is set to public visibility',
                severity: 'low',
                field: 'profile.visibility'
            });
        }

        if (privacyData.dataSharing?.thirdParty === true) {
            issues.push({
                category: 'privacy',
                type: 'warning',
                message: 'Third-party data sharing is enabled',
                severity: 'medium',
                field: 'dataSharing.thirdParty'
            });
        }

        return issues;
    }

    /**
     * Validate notifications category settings
     * @static
     * @private
     * @param {Object} notificationsData - Notifications data
     * @returns {Array} Validation issues
     */
    static #validateNotificationsCategory(notificationsData) {
        const issues = [];

        if (notificationsData.email?.address && !validationHelper.isValidEmail(notificationsData.email.address)) {
            issues.push({
                category: 'notifications',
                type: 'error',
                message: 'Invalid email address format',
                severity: 'high',
                field: 'email.address'
            });
        }

        if (notificationsData.sms?.phoneNumber && !validationHelper.isValidPhone(notificationsData.sms.phoneNumber)) {
            issues.push({
                category: 'notifications',
                type: 'error',
                message: 'Invalid phone number format',
                severity: 'high',
                field: 'sms.phoneNumber'
            });
        }

        return issues;
    }

    /**
     * Validate integrations category settings
     * @static
     * @private
     * @param {Object} integrationsData - Integrations data
     * @returns {Array} Validation issues
     */
    static #validateIntegrationsCategory(integrationsData) {
        const issues = [];

        Object.entries(integrationsData).forEach(([integrationType, config]) => {
            if (config.enabled && !config.lastUsed) {
                issues.push({
                    category: 'integrations',
                    type: 'info',
                    message: `${integrationType} integration is enabled but never used`,
                    severity: 'low',
                    field: `${integrationType}.lastUsed`
                });
            }

            if (config.enabled && config.configuredAt) {
                const daysSinceConfig = Math.floor((Date.now() - new Date(config.configuredAt)) / (1000 * 60 * 60 * 24));
                if (daysSinceConfig > 365) {
                    issues.push({
                        category: 'integrations',
                        type: 'warning',
                        message: `${integrationType} integration configuration is over 1 year old`,
                        severity: 'medium',
                        field: `${integrationType}.configuredAt`
                    });
                }
            }
        });

        return issues;
    }

    /**
     * Validate compliance category settings
     * @static
     * @private
     * @param {Object} complianceData - Compliance data
     * @returns {Array} Validation issues
     */
    static #validateComplianceCategory(complianceData) {
        const issues = [];

        if (complianceData.gdpr && !complianceData.gdpr.consentGiven) {
            issues.push({
                category: 'compliance',
                type: 'error',
                message: 'GDPR consent has not been given',
                severity: 'high',
                field: 'gdpr.consentGiven'
            });
        }

        if (complianceData.marketing && !complianceData.marketing.explicitConsent) {
            issues.push({
                category: 'compliance',
                type: 'warning',
                message: 'Marketing consent is not explicit',
                severity: 'medium',
                field: 'marketing.explicitConsent'
            });
        }

        return issues;
    }

    /**
     * Validate compliance status
     * @static
     * @private
     * @param {Object} complianceData - Compliance data
     * @returns {Object} Compliance status
     */
    static #validateComplianceStatus(complianceData) {
        const status = {
            gdpr: complianceData.gdpr?.consentGiven === true,
            ccpa: complianceData.ccpa?.optOut !== undefined,
            hipaa: complianceData.hipaa?.agreement === true,
            marketing: complianceData.marketing?.explicitConsent === true,
            overall: false
        };

        // Calculate overall compliance
        const requiredCompliance = ['gdpr', 'marketing'];
        status.overall = requiredCompliance.every(req => status[req]);

        return status;
    }

    /**
     * Validate security status and calculate score
     * @static
     * @private
     * @param {Object} securityData - Security data
     * @returns {Object} Security validation results
     */
    static #validateSecurityStatus(securityData) {
        const result = {
            score: 0,
            issues: [],
            recommendations: []
        };

        let score = 0;

        // Password security (25 points)
        if (securityData.password?.requireComplexPassword) {
            score += 15;
        } else {
            result.recommendations.push('Enable complex password requirements');
        }

        if (securityData.password?.changeFrequency && securityData.password.changeFrequency <= 90) {
            score += 10;
        }

        // MFA security (30 points)
        if (securityData.twoFactor?.required) {
            score += 30;
        } else {
            result.recommendations.push('Enable two-factor authentication requirement');
        }

        // Session security (25 points)
        if (securityData.sessions?.maxConcurrentSessions && securityData.sessions.maxConcurrentSessions <= 5) {
            score += 15;
        }

        if (securityData.sessions?.requireReauth?.enabled) {
            score += 10;
        } else {
            result.recommendations.push('Enable periodic re-authentication');
        }

        // Access controls (20 points)
        if (securityData.access?.ipWhitelist?.enabled) {
            score += 10;
        } else if (securityData.access?.ipWhitelist?.addresses?.length === 0) {
            result.recommendations.push('Consider enabling IP whitelisting for additional security');
        }

        if (securityData.access?.locationRestrictions?.enabled) {
            score += 10;
        }

        result.score = Math.min(score, 100);

        // Add issues based on score
        if (result.score < 70) {
            result.issues.push({
                category: 'security',
                type: 'warning',
                message: 'Security score is below recommended threshold',
                severity: 'high',
                field: 'overall'
            });
        }

        return result;
    }

    /**
     * Generate validation report
     * @static
     * @private
     * @param {Object} validationResult - Validation results
     * @returns {Object} Validation report
     */
    static #generateValidationReport(validationResult) {
        const report = {
            summary: {
                isValid: validationResult.isValid,
                totalIssues: validationResult.issues.length,
                totalWarnings: validationResult.warnings.length,
                securityScore: validationResult.securityScore,
                complianceStatus: validationResult.complianceStatus
            },
            details: {
                issues: validationResult.issues,
                warnings: validationResult.warnings,
                recommendations: validationResult.recommendations
            },
            generatedAt: new Date(),
            version: '1.0'
        };

        // Add severity breakdown
        report.summary.severityBreakdown = {
            high: validationResult.issues.filter(i => i.severity === 'high').length,
            medium: validationResult.issues.filter(i => i.severity === 'medium').length,
            low: validationResult.issues.filter(i => i.severity === 'low').length
        };

        // Add category breakdown
        report.summary.categoryBreakdown = validationResult.issues.reduce((acc, issue) => {
            acc[issue.category] = (acc[issue.category] || 0) + 1;
            return acc;
        }, {});

        return report;
    }
}

module.exports = UserSettingsController;