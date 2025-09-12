'use strict';

/**
 * @fileoverview Enterprise user preferences controller for UI/UX customization, notifications, localization, and accessibility
 * @module servers/api/modules/user-management/controllers/user-preferences-controller
 * @requires module:servers/api/modules/user-management/services/user-preferences-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const UserPreferencesService = require('../services/user-preferences-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class UserPreferencesController
 * @description Handles HTTP requests for user preferences management including themes, notifications, accessibility, and localization
 */
class UserPreferencesController {
    /**
     * @private
     * @static
     * @type {UserPreferencesService}
     */
    static #userPreferencesService = new UserPreferencesService();

    /**
     * Create default user preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async createDefaultPreferences(req, res, next) {
        try {
            const { organizationId, template, locale, inheritFromOrg } = req.body;
            const userId = req.user.id;
            const requesterId = req.user.id;

            logger.info('Creating default user preferences', {
                userId,
                organizationId,
                template,
                locale,
                requesterId
            });

            // Validate required fields
            const requiredFields = ['organizationId'];
            const missingFields = requiredFields.filter(field => !req.body[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate template if provided
            if (template && !['standard', 'enterprise', 'accessibility', 'minimal'].includes(template)) {
                throw new ValidationError('Invalid template. Must be one of: standard, enterprise, accessibility, minimal');
            }

            // Validate locale if provided
            if (locale && !this.#isValidLocale(locale)) {
                throw new ValidationError('Invalid locale format. Must be a valid locale code (e.g., en, es, fr)');
            }

            const options = {
                template: template || 'standard',
                locale: locale || 'en',
                inheritFromOrg: inheritFromOrg !== false,
                session: req.transaction
            };

            const preferences = await this.#userPreferencesService.createDefaultPreferences(
                userId,
                organizationId,
                options
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    preferences,
                    'Default preferences created successfully',
                    {
                        userId,
                        template: options.template,
                        locale: options.locale,
                        inheritFromOrg: options.inheritFromOrg,
                        createdAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error creating default preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                organizationId: req.body?.organizationId,
                template: req.body?.template
            });
            next(error);
        }
    }

    /**
     * Get user preferences with optional filtering
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getPreferences(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const {
                category,
                includeDefaults,
                includeMetadata,
                checkPermissions
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Fetching user preferences', {
                userId,
                requesterId,
                category,
                includeDefaults,
                includeMetadata
            });

            // Parse query parameters
            const options = {
                category: category || null,
                includeDefaults: includeDefaults !== 'false',
                includeMetadata: includeMetadata === 'true',
                requesterId,
                checkPermissions: checkPermissions !== 'false'
            };

            const preferences = await this.#userPreferencesService.getPreferences(userId, options);

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    preferences,
                    'Preferences retrieved successfully',
                    {
                        userId,
                        category: options.category,
                        hasMetadata: !!preferences.metadata,
                        lastModified: preferences.lastModifiedAt || null,
                        retrievedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error fetching preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                requesterId: req.user?.id,
                category: req.query?.category
            });
            next(error);
        }
    }

    /**
     * Update user preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async updatePreferences(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const updateData = req.body;
            const updatedBy = req.user.id;
            const { category, syncRealtime, validateChanges, reason } = req.query;

            logger.info('Updating user preferences', {
                userId,
                updatedBy,
                category,
                updateFields: Object.keys(updateData),
                syncRealtime,
                reason
            });

            // Validate that there's data to update
            if (!updateData || Object.keys(updateData).length === 0) {
                throw new ValidationError('No preference data provided for update');
            }

            // Validate category if provided
            if (category && !this.#isValidPreferenceCategory(category)) {
                throw new ValidationError('Invalid preference category');
            }

            const options = {
                category: category || null,
                syncRealtime: syncRealtime !== 'false',
                validateChanges: validateChanges !== 'false',
                reason: reason || 'user_update',
                session: req.transaction
            };

            const updatedPreferences = await this.#userPreferencesService.updatePreferences(
                userId,
                updateData,
                updatedBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    updatedPreferences,
                    'Preferences updated successfully',
                    {
                        userId,
                        updatedBy,
                        category: options.category,
                        fieldsUpdated: Object.keys(updateData),
                        syncedRealtime: options.syncRealtime,
                        updatedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error updating preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                updatedBy: req.user?.id,
                updateFields: req.body ? Object.keys(req.body) : []
            });
            next(error);
        }
    }

    /**
     * Configure theme preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureTheme(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const themeConfig = req.body;
            const configuredBy = req.user.id;
            const { saveAsCustom, customThemeName, applyImmediately } = req.query;

            logger.info('Configuring theme preferences', {
                userId,
                configuredBy,
                themeMode: themeConfig.mode,
                saveAsCustom,
                customThemeName,
                applyImmediately
            });

            // Validate required theme configuration
            const requiredFields = ['mode'];
            const missingFields = requiredFields.filter(field => !themeConfig[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required theme fields: ${missingFields.join(', ')}`);
            }

            // Validate theme mode
            const validModes = ['light', 'dark', 'auto', 'high_contrast', 'custom'];
            if (!validModes.includes(themeConfig.mode)) {
                throw new ValidationError(`Invalid theme mode. Must be one of: ${validModes.join(', ')}`);
            }

            // Validate color scheme if provided
            if (themeConfig.colorScheme) {
                this.#validateColorScheme(themeConfig.colorScheme);
            }

            // Validate custom theme name if saving as custom
            if (saveAsCustom === 'true' && customThemeName) {
                if (customThemeName.length < 3 || customThemeName.length > 50) {
                    throw new ValidationError('Custom theme name must be between 3 and 50 characters');
                }
            }

            const options = {
                saveAsCustom: saveAsCustom === 'true',
                customThemeName: customThemeName || null,
                applyImmediately: applyImmediately !== 'false'
            };

            const themeResult = await this.#userPreferencesService.configureTheme(
                userId,
                themeConfig,
                configuredBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    themeResult,
                    'Theme configured successfully',
                    {
                        userId,
                        configuredBy,
                        themeMode: themeConfig.mode,
                        customThemeCreated: themeResult.customThemeCreated,
                        appliedImmediately: options.applyImmediately,
                        configuredAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring theme', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                configuredBy: req.user?.id,
                themeMode: req.body?.mode
            });
            next(error);
        }
    }

    /**
     * Configure notification preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureNotifications(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const notificationConfig = req.body;
            const configuredBy = req.user.id;
            const { validateDevices, testNotifications } = req.query;

            logger.info('Configuring notification preferences', {
                userId,
                configuredBy,
                channels: Object.keys(notificationConfig),
                validateDevices,
                testNotifications
            });

            // Validate notification configuration structure
            if (!notificationConfig || Object.keys(notificationConfig).length === 0) {
                throw new ValidationError('No notification configuration provided');
            }

            // Validate supported channels
            const supportedChannels = ['email', 'push', 'sms', 'inApp', 'webhook'];
            const invalidChannels = Object.keys(notificationConfig).filter(
                channel => !supportedChannels.includes(channel)
            );

            if (invalidChannels.length > 0) {
                throw new ValidationError(`Invalid notification channels: ${invalidChannels.join(', ')}`);
            }

            // Validate email configuration if provided
            if (notificationConfig.email) {
                this.#validateEmailNotificationConfig(notificationConfig.email);
            }

            // Validate push configuration if provided
            if (notificationConfig.push) {
                this.#validatePushNotificationConfig(notificationConfig.push);
            }

            // Validate SMS configuration if provided
            if (notificationConfig.sms) {
                this.#validateSMSNotificationConfig(notificationConfig.sms);
            }

            const options = {
                validateDevices: validateDevices !== 'false',
                testNotifications: testNotifications === 'true'
            };

            const notificationResult = await this.#userPreferencesService.configureNotifications(
                userId,
                notificationConfig,
                configuredBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    notificationResult,
                    'Notifications configured successfully',
                    {
                        userId,
                        configuredBy,
                        channelsConfigured: Object.keys(notificationResult.notifications),
                        testResults: notificationResult.testResults,
                        configuredAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring notifications', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                configuredBy: req.user?.id,
                channels: req.body ? Object.keys(req.body) : []
            });
            next(error);
        }
    }

    /**
     * Configure accessibility preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureAccessibility(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const accessibilityConfig = req.body;
            const configuredBy = req.user.id;
            const { validateCompatibility, generateReport } = req.query;

            logger.info('Configuring accessibility preferences', {
                userId,
                configuredBy,
                features: Object.keys(accessibilityConfig),
                validateCompatibility,
                generateReport
            });

            // Validate accessibility configuration structure
            if (!accessibilityConfig || Object.keys(accessibilityConfig).length === 0) {
                throw new ValidationError('No accessibility configuration provided');
            }

            // Validate supported accessibility features
            const supportedFeatures = ['screenReader', 'visual', 'motor', 'cognitive', 'keyboard'];
            const invalidFeatures = Object.keys(accessibilityConfig).filter(
                feature => !supportedFeatures.includes(feature)
            );

            if (invalidFeatures.length > 0) {
                throw new ValidationError(`Invalid accessibility features: ${invalidFeatures.join(', ')}`);
            }

            // Validate visual accessibility settings
            if (accessibilityConfig.visual) {
                this.#validateVisualAccessibilityConfig(accessibilityConfig.visual);
            }

            // Validate motor accessibility settings
            if (accessibilityConfig.motor) {
                this.#validateMotorAccessibilityConfig(accessibilityConfig.motor);
            }

            // Validate cognitive accessibility settings
            if (accessibilityConfig.cognitive) {
                this.#validateCognitiveAccessibilityConfig(accessibilityConfig.cognitive);
            }

            const options = {
                validateCompatibility: validateCompatibility !== 'false',
                generateReport: generateReport === 'true'
            };

            const accessibilityResult = await this.#userPreferencesService.configureAccessibility(
                userId,
                accessibilityConfig,
                configuredBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    accessibilityResult,
                    'Accessibility preferences configured successfully',
                    {
                        userId,
                        configuredBy,
                        featuresConfigured: Object.keys(accessibilityResult.accessibility),
                        reportGenerated: !!accessibilityResult.report,
                        configuredAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring accessibility', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                configuredBy: req.user?.id,
                features: req.body ? Object.keys(req.body) : []
            });
            next(error);
        }
    }

    /**
     * Configure localization preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async configureLocalization(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const localizationConfig = req.body;
            const configuredBy = req.user.id;
            const { validateTimezone, updateUserProfile } = req.query;

            logger.info('Configuring localization preferences', {
                userId,
                configuredBy,
                language: localizationConfig.language,
                timezone: localizationConfig.regional?.timezone,
                validateTimezone,
                updateUserProfile
            });

            // Validate localization configuration structure
            if (!localizationConfig || Object.keys(localizationConfig).length === 0) {
                throw new ValidationError('No localization configuration provided');
            }

            // Validate language if provided
            if (localizationConfig.language && !this.#isValidLocale(localizationConfig.language)) {
                throw new ValidationError('Invalid language code');
            }

            // Validate regional settings if provided
            if (localizationConfig.regional) {
                this.#validateRegionalConfig(localizationConfig.regional);
            }

            // Validate format preferences if provided
            if (localizationConfig.formats) {
                this.#validateFormatConfig(localizationConfig.formats);
            }

            // Validate currency preferences if provided
            if (localizationConfig.currency) {
                this.#validateCurrencyConfig(localizationConfig.currency);
            }

            const options = {
                validateTimezone: validateTimezone !== 'false',
                updateUserProfile: updateUserProfile === 'true'
            };

            const localizationResult = await this.#userPreferencesService.configureLocalization(
                userId,
                localizationConfig,
                configuredBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    localizationResult,
                    'Localization preferences configured successfully',
                    {
                        userId,
                        configuredBy,
                        language: localizationResult.localization?.language?.code,
                        timezone: localizationResult.localization?.regional?.timezone,
                        profileUpdated: localizationResult.profileUpdated,
                        configuredAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error configuring localization', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                configuredBy: req.user?.id,
                language: req.body?.language
            });
            next(error);
        }
    }

    /**
     * Export user preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async exportPreferences(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const requesterId = req.user.id;
            const {
                format,
                categories,
                includeMetadata,
                encryptSensitive
            } = req.query;

            logger.info('Exporting user preferences', {
                userId,
                requesterId,
                format,
                categories,
                includeMetadata,
                encryptSensitive
            });

            // Validate export format
            const validFormats = ['json', 'xml', 'yaml'];
            const exportFormat = format || 'json';
            if (!validFormats.includes(exportFormat)) {
                throw new ValidationError(`Invalid export format. Must be one of: ${validFormats.join(', ')}`);
            }

            // Parse categories if provided
            let categoriesArray = null;
            if (categories) {
                categoriesArray = categories.split(',').map(cat => cat.trim());
                const validCategories = ['interface', 'notifications', 'localization', 'accessibility'];
                const invalidCategories = categoriesArray.filter(cat => !validCategories.includes(cat));
                if (invalidCategories.length > 0) {
                    throw new ValidationError(`Invalid categories: ${invalidCategories.join(', ')}`);
                }
            }

            const options = {
                format: exportFormat,
                categories: categoriesArray,
                includeMetadata: includeMetadata === 'true',
                requesterId,
                encryptSensitive: encryptSensitive !== 'false'
            };

            const exportResult = await this.#userPreferencesService.exportPreferences(userId, options);

            // Set appropriate content type based on format
            let contentType;
            switch (exportFormat) {
                case 'json':
                    contentType = 'application/json';
                    break;
                case 'xml':
                    contentType = 'application/xml';
                    break;
                case 'yaml':
                    contentType = 'application/x-yaml';
                    break;
                default:
                    contentType = 'application/json';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="preferences-${userId}-${dateHelper.formatDate(new Date(), 'YYYY-MM-DD')}.${exportFormat}"`);

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    exportResult,
                    'Preferences exported successfully',
                    {
                        userId,
                        requesterId,
                        format: exportFormat,
                        categories: exportResult.categories,
                        exportedAt: exportResult.exportedAt
                    }
                )
            );
        } catch (error) {
            logger.error('Error exporting preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                requesterId: req.user?.id,
                format: req.query?.format
            });
            next(error);
        }
    }

    /**
     * Import user preferences
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async importPreferences(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const importData = req.body;
            const importedBy = req.user.id;
            const {
                mergeStrategy,
                validateData,
                decryptSensitive,
                categories,
                migrateVersion
            } = req.query;

            logger.info('Importing user preferences', {
                userId,
                importedBy,
                mergeStrategy,
                validateData,
                categories,
                migrateVersion,
                hasData: !!importData.data
            });

            // Validate import data structure
            if (!importData || (!importData.data && !importData.preferences)) {
                throw new ValidationError('Invalid import data structure. Must contain data or preferences field');
            }

            // Validate merge strategy
            const validStrategies = ['merge', 'replace', 'append'];
            const strategy = mergeStrategy || 'merge';
            if (!validStrategies.includes(strategy)) {
                throw new ValidationError(`Invalid merge strategy. Must be one of: ${validStrategies.join(', ')}`);
            }

            // Parse categories if provided
            let categoriesArray = null;
            if (categories) {
                categoriesArray = categories.split(',').map(cat => cat.trim());
            }

            const options = {
                mergeStrategy: strategy,
                validateData: validateData !== 'false',
                decryptSensitive: decryptSensitive !== 'false',
                categories: categoriesArray,
                migrateVersion: migrateVersion !== 'false',
                session: req.transaction
            };

            const importResult = await this.#userPreferencesService.importPreferences(
                userId,
                importData,
                importedBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    importResult,
                    'Preferences imported successfully',
                    {
                        userId,
                        importedBy,
                        mergeStrategy: strategy,
                        categoriesImported: importResult.importResults?.categoriesImported || [],
                        migrated: importResult.migrated,
                        importedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error importing preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                importedBy: req.user?.id,
                mergeStrategy: req.query?.mergeStrategy
            });
            next(error);
        }
    }

    /**
     * Sync preferences across devices
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async syncPreferencesAcrossDevices(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const preferences = req.body;
            const {
                excludeDeviceId,
                prioritySync,
                conflictResolution
            } = req.query;

            logger.info('Syncing preferences across devices', {
                userId,
                excludeDeviceId,
                prioritySync,
                conflictResolution,
                hasPreferences: !!preferences
            });

            // Validate sync preferences data
            if (!preferences || Object.keys(preferences).length === 0) {
                throw new ValidationError('No preferences data provided for sync');
            }

            // Validate conflict resolution strategy
            const validResolutions = ['server_wins', 'client_wins', 'merge', 'prompt'];
            const resolution = conflictResolution || 'server_wins';
            if (!validResolutions.includes(resolution)) {
                throw new ValidationError(`Invalid conflict resolution. Must be one of: ${validResolutions.join(', ')}`);
            }

            const options = {
                excludeDeviceId: excludeDeviceId || null,
                prioritySync: prioritySync === 'true',
                conflictResolution: resolution
            };

            const syncResult = await this.#userPreferencesService.syncPreferencesAcrossDevices(
                userId,
                preferences,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    syncResult,
                    'Preferences synced across devices successfully',
                    {
                        userId,
                        devicesNotified: syncResult.devicesNotified,
                        prioritySync: options.prioritySync,
                        conflictResolution: resolution,
                        syncedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error syncing preferences across devices', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                excludeDeviceId: req.query?.excludeDeviceId
            });
            next(error);
        }
    }

    /**
     * Get preference analytics
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getPreferenceAnalytics(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const requesterId = req.user.id;
            const {
                timeRange,
                includeUsagePatterns,
                includeRecommendations
            } = req.query;

            logger.info('Fetching preference analytics', {
                userId,
                requesterId,
                timeRange,
                includeUsagePatterns,
                includeRecommendations
            });

            // Validate time range if provided
            if (timeRange && !this.#isValidTimeRange(timeRange)) {
                throw new ValidationError('Invalid time range format. Use formats like 30d, 1w, 6m, 1y');
            }

            const options = {
                timeRange: timeRange || '30d',
                includeUsagePatterns: includeUsagePatterns !== 'false',
                includeRecommendations: includeRecommendations !== 'false',
                requesterId
            };

            const analytics = await this.#userPreferencesService.getPreferenceAnalytics(userId, options);

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    analytics,
                    'Preference analytics retrieved successfully',
                    {
                        userId,
                        requesterId,
                        timeRange: options.timeRange,
                        dataPoints: Object.keys(analytics).length,
                        generatedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error fetching preference analytics', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                requesterId: req.user?.id,
                timeRange: req.query?.timeRange
            });
            next(error);
        }
    }

    /**
     * Bulk update preferences for multiple users
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async bulkUpdatePreferences(req, res, next) {
        try {
            const updates = req.body.updates || req.body;
            const updatedBy = req.user.id;
            const {
                validateAll,
                continueOnError,
                syncRealtime,
                notifyUsers
            } = req.query;

            logger.info('Bulk updating preferences', {
                updatedBy,
                updateCount: Array.isArray(updates) ? updates.length : 0,
                validateAll,
                continueOnError,
                syncRealtime,
                notifyUsers
            });

            // Validate bulk update structure
            if (!Array.isArray(updates) || updates.length === 0) {
                throw new ValidationError('Updates must be a non-empty array');
            }

            // Validate bulk operation size
            if (updates.length > 500) {
                throw new ValidationError('Bulk operation too large. Maximum 500 updates allowed');
            }

            // Validate each update item structure
            for (let i = 0; i < updates.length; i++) {
                const update = updates[i];
                if (!update.userId) {
                    throw new ValidationError(`Update item at index ${i} missing userId`);
                }
                if (!update.preferences || Object.keys(update.preferences).length === 0) {
                    throw new ValidationError(`Update item at index ${i} missing preferences data`);
                }
            }

            const options = {
                validateAll: validateAll !== 'false',
                continueOnError: continueOnError !== 'false',
                syncRealtime: syncRealtime === 'true',
                notifyUsers: notifyUsers === 'true'
            };

            const bulkResult = await this.#userPreferencesService.bulkUpdatePreferences(
                updates,
                updatedBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    bulkResult,
                    'Bulk preferences update completed',
                    {
                        updatedBy,
                        totalUpdates: updates.length,
                        successful: bulkResult.successful.length,
                        failed: bulkResult.failed.length,
                        warnings: bulkResult.warnings.length,
                        processedAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error in bulk preferences update', {
                error: error.message,
                stack: error.stack,
                updatedBy: req.user?.id,
                updateCount: Array.isArray(req.body?.updates || req.body) ? (req.body?.updates || req.body).length : 0
            });
            next(error);
        }
    }

    /**
     * Reset preferences to defaults
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async resetPreferences(req, res, next) {
        try {
            const userId = req.params.userId || req.user.id;
            const resetBy = req.user.id;
            const { categories, keepCustomThemes, reason } = req.query;

            logger.info('Resetting user preferences', {
                userId,
                resetBy,
                categories,
                keepCustomThemes,
                reason
            });

            // Parse categories if provided
            let categoriesArray = null;
            if (categories) {
                categoriesArray = categories.split(',').map(cat => cat.trim());
                const validCategories = ['interface', 'notifications', 'localization', 'accessibility'];
                const invalidCategories = categoriesArray.filter(cat => !validCategories.includes(cat));
                if (invalidCategories.length > 0) {
                    throw new ValidationError(`Invalid categories: ${invalidCategories.join(', ')}`);
                }
            }

            // Get current preferences to backup critical settings
            const currentPreferences = await this.#userPreferencesService.getPreferences(userId, {
                requesterId: resetBy
            });

            // Prepare reset data based on categories
            const resetData = this.#prepareResetData(categoriesArray, keepCustomThemes === 'true', currentPreferences);

            const options = {
                categories: categoriesArray,
                reason: reason || 'user_reset',
                session: req.transaction
            };

            const updatedPreferences = await this.#userPreferencesService.updatePreferences(
                userId,
                resetData,
                resetBy,
                options
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    updatedPreferences,
                    'Preferences reset successfully',
                    {
                        userId,
                        resetBy,
                        categoriesReset: categoriesArray || ['all'],
                        customThemesKept: keepCustomThemes === 'true',
                        resetAt: dateHelper.getCurrentTimestamp()
                    }
                )
            );
        } catch (error) {
            logger.error('Error resetting preferences', {
                error: error.message,
                stack: error.stack,
                userId: req.params?.userId || req.user?.id,
                resetBy: req.user?.id,
                categories: req.query?.categories
            });
            next(error);
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Validate if locale code is valid
     * @private
     * @static
     * @param {string} locale - Locale code to validate
     * @returns {boolean} Whether the locale is valid
     */
    static #isValidLocale(locale) {
        const validLocales = [
            'en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi'
        ];
        return validLocales.includes(locale);
    }

    /**
     * Validate if preference category is valid
     * @private
     * @static
     * @param {string} category - Category to validate
     * @returns {boolean} Whether the category is valid
     */
    static #isValidPreferenceCategory(category) {
        const validCategories = ['interface', 'notifications', 'localization', 'accessibility'];
        return validCategories.includes(category);
    }

    /**
     * Validate color scheme object
     * @private
     * @static
     * @param {Object} colorScheme - Color scheme to validate
     * @throws {ValidationError} If color scheme is invalid
     */
    static #validateColorScheme(colorScheme) {
        const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        
        for (const [colorName, colorValue] of Object.entries(colorScheme)) {
            if (colorValue && !colorRegex.test(colorValue)) {
                throw new ValidationError(`Invalid color value for ${colorName}: ${colorValue}`);
            }
        }
    }

    /**
     * Validate email notification configuration
     * @private
     * @static
     * @param {Object} emailConfig - Email configuration to validate
     * @throws {ValidationError} If email configuration is invalid
     */
    static #validateEmailNotificationConfig(emailConfig) {
        if (emailConfig.address && !stringHelper.isValidEmail(emailConfig.address)) {
            throw new ValidationError('Invalid email address for notifications');
        }

        const validFrequencies = ['immediate', 'hourly', 'daily', 'weekly', 'never'];
        if (emailConfig.frequency && !validFrequencies.includes(emailConfig.frequency)) {
            throw new ValidationError(`Invalid email frequency. Must be one of: ${validFrequencies.join(', ')}`);
        }

        if (emailConfig.quietHours) {
            this.#validateQuietHours(emailConfig.quietHours);
        }
    }

    /**
     * Validate push notification configuration
     * @private
     * @static
     * @param {Object} pushConfig - Push configuration to validate
     * @throws {ValidationError} If push configuration is invalid
     */
    static #validatePushNotificationConfig(pushConfig) {
        if (pushConfig.devices && Array.isArray(pushConfig.devices)) {
            for (const device of pushConfig.devices) {
                if (!device.token || !device.platform) {
                    throw new ValidationError('Push device must have token and platform');
                }

                const validPlatforms = ['ios', 'android', 'web', 'macos', 'windows'];
                if (!validPlatforms.includes(device.platform)) {
                    throw new ValidationError(`Invalid device platform: ${device.platform}`);
                }
            }
        }
    }

    /**
     * Validate SMS notification configuration
     * @private
     * @static
     * @param {Object} smsConfig - SMS configuration to validate
     * @throws {ValidationError} If SMS configuration is invalid
     */
    static #validateSMSNotificationConfig(smsConfig) {
        if (smsConfig.phoneNumber) {
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            const cleanPhone = smsConfig.phoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!phoneRegex.test(cleanPhone)) {
                throw new ValidationError('Invalid phone number format for SMS notifications');
            }
        }
    }

    /**
     * Validate quiet hours configuration
     * @private
     * @static
     * @param {Object} quietHours - Quiet hours configuration to validate
     * @throws {ValidationError} If quiet hours configuration is invalid
     */
    static #validateQuietHours(quietHours) {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        
        if (quietHours.startTime && !timeRegex.test(quietHours.startTime)) {
            throw new ValidationError('Invalid quiet hours start time format (use HH:MM)');
        }

        if (quietHours.endTime && !timeRegex.test(quietHours.endTime)) {
            throw new ValidationError('Invalid quiet hours end time format (use HH:MM)');
        }
    }

    /**
     * Validate visual accessibility configuration
     * @private
     * @static
     * @param {Object} visualConfig - Visual accessibility configuration to validate
     * @throws {ValidationError} If visual configuration is invalid
     */
    static #validateVisualAccessibilityConfig(visualConfig) {
        if (visualConfig.textScaling?.factor) {
            const factor = parseFloat(visualConfig.textScaling.factor);
            if (isNaN(factor) || factor < 0.8 || factor > 2.0) {
                throw new ValidationError('Text scaling factor must be between 0.8 and 2.0');
            }
        }

        if (visualConfig.colorBlindness?.type) {
            const validTypes = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
            if (!validTypes.includes(visualConfig.colorBlindness.type)) {
                throw new ValidationError(`Invalid color blindness type. Must be one of: ${validTypes.join(', ')}`);
            }
        }
    }

    /**
     * Validate motor accessibility configuration
     * @private
     * @static
     * @param {Object} motorConfig - Motor accessibility configuration to validate
     * @throws {ValidationError} If motor configuration is invalid
     */
    static #validateMotorAccessibilityConfig(motorConfig) {
        if (motorConfig.clickDelay !== undefined) {
            const delay = parseInt(motorConfig.clickDelay);
            if (isNaN(delay) || delay < 0 || delay > 1000) {
                throw new ValidationError('Click delay must be between 0 and 1000 milliseconds');
            }
        }

        if (motorConfig.targetSize) {
            const validSizes = ['normal', 'large', 'extra-large'];
            if (!validSizes.includes(motorConfig.targetSize)) {
                throw new ValidationError(`Invalid target size. Must be one of: ${validSizes.join(', ')}`);
            }
        }
    }

    /**
     * Validate cognitive accessibility configuration
     * @private
     * @static
     * @param {Object} cognitiveConfig - Cognitive accessibility configuration to validate
     * @throws {ValidationError} If cognitive configuration is invalid
     */
    static #validateCognitiveAccessibilityConfig(cognitiveConfig) {
        if (cognitiveConfig.timeoutMultiplier !== undefined) {
            const validMultipliers = [1.5, 2.0, 3.0, 5.0];
            const multiplier = parseFloat(cognitiveConfig.timeoutMultiplier);
            if (!validMultipliers.includes(multiplier)) {
                throw new ValidationError(`Invalid timeout multiplier. Must be one of: ${validMultipliers.join(', ')}`);
            }
        }

        if (cognitiveConfig.simplificationLevel) {
            const validLevels = ['none', 'moderate', 'high'];
            if (!validLevels.includes(cognitiveConfig.simplificationLevel)) {
                throw new ValidationError(`Invalid simplification level. Must be one of: ${validLevels.join(', ')}`);
            }
        }
    }

    /**
     * Validate regional configuration
     * @private
     * @static
     * @param {Object} regionalConfig - Regional configuration to validate
     * @throws {ValidationError} If regional configuration is invalid
     */
    static #validateRegionalConfig(regionalConfig) {
        if (regionalConfig.timezone) {
            const timezoneRegex = /^[A-Za-z]+\/[A-Za-z_]+$/;
            if (!timezoneRegex.test(regionalConfig.timezone)) {
                throw new ValidationError('Invalid timezone format');
            }
        }

        if (regionalConfig.country) {
            if (regionalConfig.country.length !== 2) {
                throw new ValidationError('Country code must be 2 characters (ISO 3166-1 alpha-2)');
            }
        }
    }

    /**
     * Validate format configuration
     * @private
     * @static
     * @param {Object} formatConfig - Format configuration to validate
     * @throws {ValidationError} If format configuration is invalid
     */
    static #validateFormatConfig(formatConfig) {
        if (formatConfig.dateFormat) {
            const validDateFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'];
            if (!validDateFormats.includes(formatConfig.dateFormat)) {
                throw new ValidationError(`Invalid date format. Must be one of: ${validDateFormats.join(', ')}`);
            }
        }

        if (formatConfig.timeFormat) {
            const validTimeFormats = ['12h', '24h'];
            if (!validTimeFormats.includes(formatConfig.timeFormat)) {
                throw new ValidationError(`Invalid time format. Must be one of: ${validTimeFormats.join(', ')}`);
            }
        }

        if (formatConfig.numberFormat) {
            const validNumberFormats = ['1,234.56', '1.234,56', '1 234,56', '1234.56'];
            if (!validNumberFormats.includes(formatConfig.numberFormat)) {
                throw new ValidationError(`Invalid number format. Must be one of: ${validNumberFormats.join(', ')}`);
            }
        }
    }

    /**
     * Validate currency configuration
     * @private
     * @static
     * @param {Object} currencyConfig - Currency configuration to validate
     * @throws {ValidationError} If currency configuration is invalid
     */
    static #validateCurrencyConfig(currencyConfig) {
        if (currencyConfig.code) {
            const currencyRegex = /^[A-Z]{3}$/;
            if (!currencyRegex.test(currencyConfig.code)) {
                throw new ValidationError('Invalid currency code. Must be 3 uppercase letters (ISO 4217)');
            }
        }

        if (currencyConfig.position) {
            const validPositions = ['before', 'after'];
            if (!validPositions.includes(currencyConfig.position)) {
                throw new ValidationError(`Invalid currency position. Must be one of: ${validPositions.join(', ')}`);
            }
        }
    }

    /**
     * Validate time range format
     * @private
     * @static
     * @param {string} timeRange - Time range to validate
     * @returns {boolean} Whether the time range is valid
     */
    static #isValidTimeRange(timeRange) {
        const timeRangeRegex = /^(\d+)([dwmy])$/;
        return timeRangeRegex.test(timeRange);
    }

    /**
     * Prepare reset data for preferences
     * @private
     * @static
     * @param {Array|null} categories - Categories to reset
     * @param {boolean} keepCustomThemes - Whether to keep custom themes
     * @param {Object} currentPreferences - Current user preferences
     * @returns {Object} Reset data object
     */
    static #prepareResetData(categories, keepCustomThemes, currentPreferences) {
        const resetData = {};

        // Determine which categories to reset
        const categoriesToReset = categories || ['interface', 'notifications', 'localization', 'accessibility'];

        for (const category of categoriesToReset) {
            switch (category) {
                case 'interface':
                    resetData.interface = {
                        theme: {
                            mode: 'auto',
                            colorScheme: {},
                            customThemes: keepCustomThemes ? (currentPreferences.interface?.theme?.customThemes || []) : []
                        },
                        layout: {
                            density: 'comfortable',
                            sidebarPosition: 'left',
                            sidebarCollapsed: false,
                            headerFixed: true,
                            footerVisible: true,
                            breadcrumbVisible: true,
                            fullWidth: false,
                            cardShadows: true
                        },
                        typography: {
                            fontFamily: 'system',
                            fontSize: 'base',
                            fontWeight: 'normal',
                            lineHeight: 'normal',
                            letterSpacing: 'normal'
                        }
                    };
                    break;

                case 'notifications':
                    resetData.notifications = {
                        email: {
                            enabled: true,
                            frequency: 'immediate',
                            quietHours: { enabled: false },
                            categories: {
                                security: { enabled: true, priority: 'high' },
                                system: { enabled: true, priority: 'medium' },
                                social: { enabled: true, priority: 'low' },
                                marketing: { enabled: false, priority: 'low' }
                            }
                        },
                        push: {
                            enabled: true,
                            devices: [],
                            categories: {
                                security: true,
                                mentions: true,
                                messages: true
                            }
                        },
                        inApp: {
                            enabled: true,
                            position: 'top-right',
                            duration: 5000,
                            playSound: true
                        }
                    };
                    break;

                case 'localization':
                    resetData.localization = {
                        language: 'en',
                        region: 'US',
                        timezone: 'UTC',
                        dateFormat: 'MM/DD/YYYY',
                        timeFormat: '12h',
                        numberFormat: '1,234.56',
                        currency: { code: 'USD', symbol: '$', position: 'before' },
                        firstDayOfWeek: 0
                    };
                    break;

                case 'accessibility':
                    resetData.accessibility = {
                        screenReader: { enabled: false },
                        visual: {
                            highContrast: { enabled: false },
                            colorBlindness: { type: 'none' },
                            textScaling: { factor: 1.0 }
                        },
                        motor: {
                            reducedMotion: false,
                            largerClickTargets: false
                        },
                        cognitive: {
                            simplifiedInterface: false,
                            confirmationDialogs: false
                        }
                    };
                    break;

                default:
                    logger.warn('Unknown category for reset', { category });
            }
        }

        return resetData;
    }
}

module.exports = UserPreferencesController;