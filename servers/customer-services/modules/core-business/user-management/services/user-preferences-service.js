'use strict';

/**
 * @fileoverview Enterprise user preferences service for UI/UX customization, notifications, localization, and accessibility
 * @module shared/lib/services/user-management/user-preferences-service
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/users/user-preferences-model
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
const UserPreferencesModel = require('../../database/models/users/user-preferences-model');
const UserModel = require('../../database/models/users/user-model');
const WebSocket = require('ws');
const crypto = require('crypto');
const validator = require('validator');

/**
 * Enterprise user preferences service for comprehensive preference management
 * @class UserPreferencesService
 * @description Manages UI/UX preferences, notifications, localization, accessibility, and real-time synchronization
 */
class UserPreferencesService {
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
     * @type {Map}
     */
    #activeConnections = new Map();

    /**
     * @private
     * @type {Map}
     */
    #preferenceSyncQueue = new Map();

    /**
     * @private
     * @type {Object}
     */
    #supportedThemes = {
        light: {
            name: 'Light',
            colors: {
                primary: '#007bff',
                secondary: '#6c757d',
                background: '#ffffff',
                text: '#212529'
            }
        },
        dark: {
            name: 'Dark',
            colors: {
                primary: '#0d6efd',
                secondary: '#6c757d',
                background: '#212529',
                text: '#ffffff'
            }
        },
        high_contrast: {
            name: 'High Contrast',
            colors: {
                primary: '#000000',
                secondary: '#555555',
                background: '#ffffff',
                text: '#000000'
            }
        },
        custom: {
            name: 'Custom',
            colors: {}
        }
    };

    /**
     * @private
     * @type {Array}
     */
    #supportedLanguages = [
        { code: 'en', name: 'English', rtl: false },
        { code: 'es', name: 'Español', rtl: false },
        { code: 'fr', name: 'Français', rtl: false },
        { code: 'de', name: 'Deutsch', rtl: false },
        { code: 'it', name: 'Italiano', rtl: false },
        { code: 'pt', name: 'Português', rtl: false },
        { code: 'zh', name: '中文', rtl: false },
        { code: 'ja', name: '日本語', rtl: false },
        { code: 'ko', name: '한국어', rtl: false },
        { code: 'ar', name: 'العربية', rtl: true },
        { code: 'ru', name: 'Русский', rtl: false },
        { code: 'hi', name: 'हिन्दी', rtl: false }
    ];

    /**
     * @private
     * @type {Object}
     */
    #accessibilityFeatures = {
        screenReader: {
            announcements: ['navigation', 'notifications', 'errors', 'success'],
            verbosity: ['minimal', 'normal', 'verbose']
        },
        visual: {
            contrastLevels: ['AA', 'AAA'],
            colorBlindness: ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'],
            textScaling: { min: 0.8, max: 2.0 },
            focusIndicatorThickness: { min: 1, max: 5 }
        },
        motor: {
            clickDelay: { min: 0, max: 1000 },
            targetSizes: ['normal', 'large', 'extra-large']
        },
        cognitive: {
            timeoutExtensions: [1.5, 2.0, 3.0, 5.0],
            simplificationLevels: ['none', 'moderate', 'high']
        }
    };

    /**
     * @private
     * @type {Map}
     */
    #notificationChannels = new Map([
        ['email', { enabled: true, realtime: false, batchable: true }],
        ['sms', { enabled: true, realtime: true, batchable: false }],
        ['push', { enabled: true, realtime: true, batchable: true }],
        ['inApp', { enabled: true, realtime: true, batchable: false }],
        ['webhook', { enabled: true, realtime: true, batchable: false }]
    ]);

    /**
     * @private
     * @type {Object}
     */
    #defaultLayoutSettings = {
        density: 'comfortable',
        sidebarPosition: 'left',
        sidebarCollapsed: false,
        headerFixed: true,
        footerVisible: true,
        breadcrumbVisible: true,
        fullWidth: false,
        cardShadows: true
    };

    /**
     * @private
     * @type {Set}
     */
    #realtimePreferences = new Set([
        'interface.theme.mode',
        'interface.layout.density',
        'interface.layout.sidebarCollapsed',
        'localization.language',
        'notifications.inApp.enabled',
        'accessibility.visual.highContrast.enabled',
        'accessibility.motor.reducedMotion'
    ]);

    /**
     * @private
     * @type {Map}
     */
    #preferenceMigrations = new Map();

    /**
     * @private
     * @type {Object}
     */
    #validationRules = {
        colorHex: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
        timezone: /^[A-Za-z]+\/[A-Za-z_]+$/,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phoneNumber: /^\+?[\d\s\-\(\)]+$/
    };

    /**
     * Creates an instance of UserPreferencesService
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
        logger.info('Initializing UserPreferencesService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });

        this.#initializePreferenceMigrations();
        this.#setupRealtimeSync();
        this.#setupCleanupIntervals();
    }

    // ==================== PUBLIC METHODS ====================

    /**
     * Create default user preferences
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created preferences
     */
    async createDefaultPreferences(userId, organizationId, options = {}) {
        const { template = 'standard', locale = 'en', inheritFromOrg = true } = options;
        const session = options.session || null;

        try {
            // Check if preferences already exist
            const existingPreferences = await UserPreferencesModel.findOne({ userId });
            if (existingPreferences) {
                throw new ConflictError('Preferences already exist for user', 'PREFERENCES_EXIST');
            }

            // Get user information for context
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Build default preferences
            const defaultPreferences = await this.#buildDefaultPreferences(template, locale, user);

            // Apply organization defaults if enabled
            if (inheritFromOrg && organizationId) {
                const orgDefaults = await this.#getOrganizationPreferenceDefaults(organizationId);
                if (orgDefaults) {
                    Object.assign(defaultPreferences, this.#mergePreferences(defaultPreferences, orgDefaults));
                }
            }

            // Create preferences
            const preferences = new UserPreferencesModel({
                userId,
                organizationId,
                ...defaultPreferences,
                metadata: {
                    version: 1,
                    isDefault: true,
                    inheritFromOrganization: inheritFromOrg,
                    lastSyncedAt: new Date(),
                    presetName: template
                }
            });

            await preferences.save({ session });

            // Initialize real-time connection
            await this.#initializeRealtimeConnection(userId);

            // Send welcome notifications
            await this.#sendPreferencesCreationNotifications(preferences, user);

            // Log audit trail
            await this.#auditService.log({
                action: 'PREFERENCES_CREATED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId,
                details: {
                    template,
                    locale,
                    organizationId,
                    inheritFromOrg
                }
            });

            logger.info('User preferences created', {
                preferencesId: preferences._id,
                userId,
                template,
                locale,
                organizationId
            });

            return this.#sanitizePreferencesOutput(preferences.toObject());
        } catch (error) {
            logger.error('Error creating user preferences', {
                error: error.message,
                userId,
                organizationId
            });
            throw error;
        }
    }

    /**
     * Get user preferences with inheritance and real-time sync
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User preferences
     */
    async getPreferences(userId, options = {}) {
        const {
            category = null,
            includeDefaults = true,
            includeMetadata = false,
            requesterId,
            checkPermissions = true
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('preferences', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get preferences
            let preferences = await UserPreferencesModel.findByUserId(userId, {
                createIfNotExists: includeDefaults
            });

            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && requesterId && requesterId !== userId) {
                await this.#checkPreferencesAccess(preferences, requesterId, 'read');
            }

            // Get effective preferences with inheritance
            let preferencesData = await preferences.getEffectivePreferences();

            // Filter by category if specified
            if (category) {
                if (!preferencesData[category]) {
                    throw new NotFoundError(`Category '${category}' not found`, 'CATEGORY_NOT_FOUND');
                }
                preferencesData = { [category]: preferencesData[category] };
            }

            // Add computed fields
            preferencesData.computed = await this.#calculatePreferenceMetrics(preferences);

            // Include metadata if requested
            if (includeMetadata) {
                preferencesData.metadata = preferences.metadata;
            }

            // Cache result
            await this.#cacheService.set(cacheKey, preferencesData, this.#defaultCacheTTL);

            return preferencesData;
        } catch (error) {
            logger.error('Error fetching preferences', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Update user preferences with real-time sync
     * @param {string} userId - User ID
     * @param {Object} updateData - Preferences to update
     * @param {string} updatedBy - ID of user making update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated preferences
     */
    async updatePreferences(userId, updateData, updatedBy, options = {}) {
        const {
            category = null,
            syncRealtime = true,
            validateChanges = true,
            reason = 'user_update'
        } = options;
        const session = options.session || null;

        try {
            // Get existing preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, updatedBy, 'update');

            // Validate update data
            if (validateChanges) {
                await this.#validatePreferenceUpdates(updateData, preferences);
            }

            // Process updates
            const processedUpdates = await this.#processPreferenceUpdates(
                updateData,
                preferences,
                updatedBy,
                { category, reason }
            );

            // Apply updates
            for (const [path, value] of Object.entries(processedUpdates.changes)) {
                await preferences.updatePreference(path, value, reason);
            }

            // Handle special preference types
            await this.#handleSpecialPreferences(preferences, processedUpdates.changes, updatedBy);

            // Sync in real-time if requested
            if (syncRealtime) {
                await this.#syncPreferencesRealtime(userId, processedUpdates.changes);
            }

            // Send notifications for significant changes
            await this.#sendPreferenceUpdateNotifications(preferences, processedUpdates, updatedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'PREFERENCES_UPDATED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: updatedBy,
                details: {
                    targetUserId: userId,
                    updatedPaths: Object.keys(processedUpdates.changes),
                    category,
                    reason
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Preferences updated', {
                preferencesId: preferences._id,
                userId,
                updatedPaths: Object.keys(processedUpdates.changes),
                updatedBy
            });

            return this.#sanitizePreferencesOutput(preferences.toObject());
        } catch (error) {
            logger.error('Error updating preferences', {
                error: error.message,
                userId,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Configure theme and visual preferences
     * @param {string} userId - User ID
     * @param {Object} themeConfig - Theme configuration
     * @param {string} configuredBy - ID of user configuring theme
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Theme configuration result
     */
    async configureTheme(userId, themeConfig, configuredBy, options = {}) {
        const {
            saveAsCustom = false,
            customThemeName = null,
            applyImmediately = true
        } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, configuredBy, 'update');

            // Validate theme configuration
            await this.#validateThemeConfiguration(themeConfig);

            // Process theme configuration
            const themeResult = await this.#processThemeConfiguration(
                preferences,
                themeConfig,
                { saveAsCustom, customThemeName }
            );

            // Apply theme immediately if requested
            if (applyImmediately) {
                preferences.interface.theme.mode = themeResult.mode;
                if (themeResult.colorScheme) {
                    Object.assign(preferences.interface.theme.colorScheme, themeResult.colorScheme);
                }
            }

            await preferences.save();

            // Sync theme changes in real-time
            await this.#syncThemeChangesRealtime(userId, themeResult);

            // Send theme update notifications
            await this.#sendThemeUpdateNotifications(preferences, themeResult, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'THEME_CONFIGURED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    themeMode: themeResult.mode,
                    saveAsCustom,
                    customThemeName,
                    applyImmediately
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Theme configured', {
                preferencesId: preferences._id,
                userId,
                themeMode: themeResult.mode,
                configuredBy
            });

            return {
                success: true,
                theme: themeResult,
                applied: applyImmediately,
                customThemeCreated: saveAsCustom
            };
        } catch (error) {
            logger.error('Error configuring theme', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Configure notification preferences across channels
     * @param {string} userId - User ID
     * @param {Object} notificationConfig - Notification configuration
     * @param {string} configuredBy - ID of user configuring notifications
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Notification configuration result
     */
    async configureNotifications(userId, notificationConfig, configuredBy, options = {}) {
        const { validateDevices = true, testNotifications = false } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, configuredBy, 'update');

            // Validate notification configuration
            await this.#validateNotificationConfiguration(notificationConfig, validateDevices);

            // Process notification settings
            const notificationResults = {};

            // Configure email notifications
            if (notificationConfig.email) {
                notificationResults.email = await this.#configureEmailNotifications(
                    preferences,
                    notificationConfig.email,
                    configuredBy
                );
            }

            // Configure push notifications
            if (notificationConfig.push) {
                notificationResults.push = await this.#configurePushNotifications(
                    preferences,
                    notificationConfig.push,
                    configuredBy
                );
            }

            // Configure SMS notifications
            if (notificationConfig.sms) {
                notificationResults.sms = await this.#configureSMSNotifications(
                    preferences,
                    notificationConfig.sms,
                    configuredBy
                );
            }

            // Configure in-app notifications
            if (notificationConfig.inApp) {
                notificationResults.inApp = await this.#configureInAppNotifications(
                    preferences,
                    notificationConfig.inApp,
                    configuredBy
                );
            }

            await preferences.save();

            // Test notifications if requested
            let testResults = null;
            if (testNotifications) {
                testResults = await this.#testNotificationChannels(userId, notificationResults);
            }

            // Send configuration confirmation
            await this.#sendNotificationConfigConfirmation(preferences, notificationResults, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'NOTIFICATIONS_CONFIGURED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    channels: Object.keys(notificationResults),
                    testNotifications,
                    testResults: testResults?.summary
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Notifications configured', {
                preferencesId: preferences._id,
                userId,
                channels: Object.keys(notificationResults),
                configuredBy
            });

            return {
                success: true,
                notifications: notificationResults,
                testResults,
                warnings: []
            };
        } catch (error) {
            logger.error('Error configuring notifications', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Configure accessibility settings for enhanced usability
     * @param {string} userId - User ID
     * @param {Object} accessibilityConfig - Accessibility configuration
     * @param {string} configuredBy - ID of user configuring accessibility
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Accessibility configuration result
     */
    async configureAccessibility(userId, accessibilityConfig, configuredBy, options = {}) {
        const { validateCompatibility = true, generateReport = false } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, configuredBy, 'update');

            // Validate accessibility configuration
            await this.#validateAccessibilityConfiguration(accessibilityConfig, validateCompatibility);

            // Process accessibility settings
            const accessibilityResults = {};

            // Configure screen reader settings
            if (accessibilityConfig.screenReader) {
                accessibilityResults.screenReader = await this.#configureScreenReaderSettings(
                    preferences,
                    accessibilityConfig.screenReader
                );
            }

            // Configure visual accessibility
            if (accessibilityConfig.visual) {
                accessibilityResults.visual = await this.#configureVisualAccessibility(
                    preferences,
                    accessibilityConfig.visual
                );
            }

            // Configure motor accessibility
            if (accessibilityConfig.motor) {
                accessibilityResults.motor = await this.#configureMotorAccessibility(
                    preferences,
                    accessibilityConfig.motor
                );
            }

            // Configure cognitive accessibility
            if (accessibilityConfig.cognitive) {
                accessibilityResults.cognitive = await this.#configureCognitiveAccessibility(
                    preferences,
                    accessibilityConfig.cognitive
                );
            }

            // Configure keyboard navigation
            if (accessibilityConfig.keyboard) {
                accessibilityResults.keyboard = await this.#configureKeyboardNavigation(
                    preferences,
                    accessibilityConfig.keyboard
                );
            }

            await preferences.save();

            // Generate accessibility report if requested
            let accessibilityReport = null;
            if (generateReport) {
                accessibilityReport = await this.#generateAccessibilityReport(preferences);
            }

            // Sync accessibility changes in real-time
            await this.#syncAccessibilityChangesRealtime(userId, accessibilityResults);

            // Send accessibility configuration notifications
            await this.#sendAccessibilityConfigNotifications(preferences, accessibilityResults, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'ACCESSIBILITY_CONFIGURED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    features: Object.keys(accessibilityResults),
                    generateReport,
                    reportGenerated: !!accessibilityReport
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Accessibility configured', {
                preferencesId: preferences._id,
                userId,
                features: Object.keys(accessibilityResults),
                configuredBy
            });

            return {
                success: true,
                accessibility: accessibilityResults,
                report: accessibilityReport,
                recommendations: this.#generateAccessibilityRecommendations(accessibilityResults)
            };
        } catch (error) {
            logger.error('Error configuring accessibility', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Configure localization preferences (language, timezone, formats)
     * @param {string} userId - User ID
     * @param {Object} localizationConfig - Localization configuration
     * @param {string} configuredBy - ID of user configuring localization
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Localization configuration result
     */
    async configureLocalization(userId, localizationConfig, configuredBy, options = {}) {
        const { validateTimezone = true, updateUserProfile = false } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, configuredBy, 'update');

            // Validate localization configuration
            await this.#validateLocalizationConfiguration(localizationConfig, validateTimezone);

            // Process localization settings
            const localizationResults = {};

            // Configure language settings
            if (localizationConfig.language) {
                localizationResults.language = await this.#configureLanguageSettings(
                    preferences,
                    localizationConfig.language
                );
            }

            // Configure timezone and regional settings
            if (localizationConfig.regional) {
                localizationResults.regional = await this.#configureRegionalSettings(
                    preferences,
                    localizationConfig.regional
                );
            }

            // Configure format preferences
            if (localizationConfig.formats) {
                localizationResults.formats = await this.#configureFormatPreferences(
                    preferences,
                    localizationConfig.formats
                );
            }

            // Configure currency preferences
            if (localizationConfig.currency) {
                localizationResults.currency = await this.#configureCurrencyPreferences(
                    preferences,
                    localizationConfig.currency
                );
            }

            await preferences.save();

            // Update user profile if requested
            if (updateUserProfile && configuredBy === userId) {
                await this.#updateUserProfileLocalization(userId, localizationResults);
            }

            // Sync localization changes in real-time
            await this.#syncLocalizationChangesRealtime(userId, localizationResults);

            // Send localization update notifications
            await this.#sendLocalizationUpdateNotifications(preferences, localizationResults, configuredBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'LOCALIZATION_CONFIGURED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: configuredBy,
                details: {
                    targetUserId: userId,
                    language: localizationResults.language?.code,
                    timezone: localizationResults.regional?.timezone,
                    updateUserProfile
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Localization configured', {
                preferencesId: preferences._id,
                userId,
                language: localizationResults.language?.code,
                configuredBy
            });

            return {
                success: true,
                localization: localizationResults,
                supportedLanguages: this.#supportedLanguages,
                profileUpdated: updateUserProfile
            };
        } catch (error) {
            logger.error('Error configuring localization', {
                error: error.message,
                userId,
                configuredBy
            });
            throw error;
        }
    }

    /**
     * Export user preferences for backup or migration
     * @param {string} userId - User ID
     * @param {Object} options - Export options
     * @returns {Promise<Object>} Exported preferences
     */
    async exportPreferences(userId, options = {}) {
        const {
            format = 'json',
            categories = null,
            includeMetadata = true,
            requesterId,
            encryptSensitive = false
        } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            if (requesterId !== userId) {
                await this.#checkPreferencesAccess(preferences, requesterId, 'read');
            }

            // Export preferences
            const exportData = preferences.exportPreferences(format);

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

            // Encrypt sensitive data if requested
            if (encryptSensitive) {
                processedData = await this.#encryptSensitivePreferences(processedData);
            }

            // Build export result
            const exportResult = {
                userId,
                exportedAt: new Date(),
                version: preferences.metadata.version,
                format,
                categories: categories || Object.keys(processedData),
                data: processedData
            };

            // Include metadata if requested
            if (includeMetadata) {
                exportResult.metadata = preferences.metadata;
                exportResult.computed = await this.#calculatePreferenceMetrics(preferences);
            }

            // Log export activity
            await this.#auditService.log({
                action: 'PREFERENCES_EXPORTED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: requesterId || userId,
                details: {
                    format,
                    categories: exportResult.categories,
                    includeMetadata,
                    encryptSensitive
                }
            });

            logger.info('Preferences exported', {
                preferencesId: preferences._id,
                userId,
                format,
                requesterId
            });

            return exportResult;
        } catch (error) {
            logger.error('Error exporting preferences', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Import preferences from backup or migration
     * @param {string} userId - User ID
     * @param {Object} importData - Preferences data to import
     * @param {string} importedBy - ID of user performing import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importPreferences(userId, importData, importedBy, options = {}) {
        const {
            mergeStrategy = 'merge',
            validateData = true,
            decryptSensitive = false,
            categories = null,
            migrateVersion = true
        } = options;

        try {
            // Get preferences
            let preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                preferences = await this.createDefaultPreferences(userId, null);
            }

            // Check permissions
            await this.#checkPreferencesAccess(preferences, importedBy, 'update');

            // Validate import data
            if (validateData) {
                await this.#validateImportData(importData);
            }

            // Decrypt sensitive data if needed
            let processedData = importData.data || importData;
            if (decryptSensitive && importData.encrypted) {
                processedData = await this.#decryptSensitivePreferences(processedData);
            }

            // Migrate version if needed
            if (migrateVersion && importData.version && importData.version < preferences.metadata.version) {
                processedData = await this.#migratePreferencesVersion(processedData, importData.version);
            }

            // Import preferences
            const importResults = await preferences.importPreferences(processedData, {
                overwrite: mergeStrategy === 'replace',
                categories,
                validateOnly: false
            });

            await preferences.save();

            // Sync imported preferences in real-time
            await this.#syncImportedPreferencesRealtime(userId, importResults);

            // Validate imported configurations
            const validationResults = await this.#validateImportedConfigurations(preferences);

            // Send import notifications
            await this.#sendImportNotifications(preferences, importResults, importedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'PREFERENCES_IMPORTED',
                entityType: 'user_preferences',
                entityId: preferences._id,
                userId: importedBy,
                details: {
                    targetUserId: userId,
                    mergeStrategy,
                    categories: categories || Object.keys(processedData),
                    sourceVersion: importData.version,
                    migrateVersion
                }
            });

            // Clear caches
            await this.#clearPreferencesCaches(userId);

            logger.info('Preferences imported', {
                preferencesId: preferences._id,
                userId,
                mergeStrategy,
                importedBy
            });

            return {
                success: true,
                importResults,
                validationResults,
                migrated: migrateVersion,
                warnings: []
            };
        } catch (error) {
            logger.error('Error importing preferences', {
                error: error.message,
                userId,
                importedBy
            });
            throw error;
        }
    }

    /**
     * Sync preferences across multiple devices in real-time
     * @param {string} userId - User ID
     * @param {Object} preferences - Preferences to sync
     * @param {Object} options - Sync options
     * @returns {Promise<Object>} Sync results
     */
    async syncPreferencesAcrossDevices(userId, preferences, options = {}) {
        const {
            excludeDeviceId = null,
            prioritySync = false,
            conflictResolution = 'server_wins'
        } = options;

        try {
            // Get user's active connections
            const activeConnections = this.#getActiveConnections(userId);

            if (activeConnections.length === 0) {
                return { success: true, devicesNotified: 0, message: 'No active devices to sync' };
            }

            // Prepare sync payload
            const syncPayload = {
                type: 'preferences_sync',
                userId,
                timestamp: Date.now(),
                preferences: this.#filterRealtimePreferences(preferences),
                priority: prioritySync,
                conflictResolution
            };

            // Track sync results
            const syncResults = {
                successful: [],
                failed: [],
                conflicts: []
            };

            // Send to each active connection
            for (const connection of activeConnections) {
                if (excludeDeviceId && connection.deviceId === excludeDeviceId) {
                    continue;
                }

                try {
                    await this.#sendRealtimeUpdate(connection, syncPayload);
                    syncResults.successful.push({
                        deviceId: connection.deviceId,
                        deviceName: connection.deviceName,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    syncResults.failed.push({
                        deviceId: connection.deviceId,
                        error: error.message
                    });
                }
            }

            // Queue sync for offline devices
            await this.#queueSyncForOfflineDevices(userId, syncPayload, excludeDeviceId);

            // Log sync activity
            await this.#auditService.log({
                action: 'PREFERENCES_SYNCED',
                entityType: 'user_preferences',
                entityId: userId,
                userId,
                details: {
                    devicesNotified: syncResults.successful.length,
                    devicesFailed: syncResults.failed.length,
                    prioritySync,
                    excludeDeviceId
                }
            });

            logger.info('Preferences synced across devices', {
                userId,
                devicesNotified: syncResults.successful.length,
                devicesFailed: syncResults.failed.length
            });

            return {
                success: true,
                devicesNotified: syncResults.successful.length,
                syncResults,
                queuedForOffline: true
            };
        } catch (error) {
            logger.error('Error syncing preferences across devices', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get preference analytics and usage insights
     * @param {string} userId - User ID
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Preference analytics
     */
    async getPreferenceAnalytics(userId, options = {}) {
        const {
            timeRange = '30d',
            includeUsagePatterns = true,
            includeRecommendations = true,
            requesterId
        } = options;

        try {
            // Get preferences
            const preferences = await UserPreferencesModel.findByUserId(userId);
            if (!preferences) {
                throw new NotFoundError('Preferences not found', 'PREFERENCES_NOT_FOUND');
            }

            // Check permissions
            if (requesterId !== userId) {
                await this.#checkPreferencesAccess(preferences, requesterId, 'read');
            }

            // Check cache
            const cacheKey = this.#generateCacheKey('analytics', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            const analytics = {};

            // Basic preference metrics
            analytics.overview = {
                customizationLevel: this.#calculateCustomizationLevel(preferences),
                accessibilityScore: this.#calculateAccessibilityScore(preferences),
                notificationEfficiency: this.#calculateNotificationEfficiency(preferences),
                themeUsage: this.#analyzeThemeUsage(preferences),
                languageSettings: this.#analyzeLanguageSettings(preferences)
            };

            // Usage patterns if requested
            if (includeUsagePatterns) {
                analytics.usagePatterns = await this.#analyzeUsagePatterns(userId, timeRange);
            }

            // Personalization recommendations
            if (includeRecommendations) {
                analytics.recommendations = await this.#generatePersonalizationRecommendations(preferences);
            }

            // Device sync analytics
            analytics.deviceSync = await this.#analyzeDeviceSyncPatterns(userId, timeRange);

            // Performance impact analysis
            analytics.performance = this.#analyzePerformanceImpact(preferences);

            // Cache results
            await this.#cacheService.set(cacheKey, analytics, 1800); // 30 minutes

            return analytics;
        } catch (error) {
            logger.error('Error getting preference analytics', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Bulk update preferences for multiple users
     * @param {Array} updates - Array of preference updates
     * @param {string} updatedBy - ID of user performing bulk update
     * @param {Object} options - Bulk update options
     * @returns {Promise<Object>} Bulk update results
     */
    async bulkUpdatePreferences(updates, updatedBy, options = {}) {
        const {
            validateAll = true,
            continueOnError = true,
            syncRealtime = false,
            notifyUsers = false
        } = options;

        try {
            // Validate bulk operation size
            if (updates.length > 500) {
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
                        await this.#validateBulkPreferenceUpdate(update);
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
            const batchSize = 25;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                const batchResults = await this.#processBulkPreferenceBatch(
                    batch,
                    updatedBy,
                    { syncRealtime, notifyUsers }
                );

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
                action: 'PREFERENCES_BULK_UPDATE',
                entityType: 'user_preferences',
                userId: updatedBy,
                details: {
                    totalUpdates: updates.length,
                    successful: results.successful.length,
                    failed: results.failed.length,
                    syncRealtime,
                    notifyUsers
                }
            });

            logger.info('Bulk preferences update completed', {
                totalUpdates: updates.length,
                successful: results.successful.length,
                failed: results.failed.length,
                updatedBy
            });

            return results;
        } catch (error) {
            logger.error('Error in bulk preferences update', {
                error: error.message,
                updateCount: updates.length,
                updatedBy
            });
            throw error;
        }
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Initialize preference migrations
     * @private
     */
    #initializePreferenceMigrations() {
        // Version 1 to 2: Add new accessibility features
        this.#preferenceMigrations.set('1_to_2', (preferences) => {
            if (!preferences.accessibility.cognitive) {
                preferences.accessibility.cognitive = {
                    simplifiedInterface: false,
                    reducedAnimations: false,
                    extendedTimeouts: false,
                    confirmationDialogs: false
                };
            }
            return preferences;
        });

        // Version 2 to 3: Add new notification channels
        this.#preferenceMigrations.set('2_to_3', (preferences) => {
            if (!preferences.notifications.webhook) {
                preferences.notifications.webhook = {
                    enabled: false,
                    endpoints: [],
                    events: []
                };
            }
            return preferences;
        });
    }

    /**
     * Setup real-time synchronization
     * @private
     */
    #setupRealtimeSync() {
        // WebSocket server setup would go here in a real implementation
        // For now, we'll simulate with event handling
        logger.info('Real-time sync initialized');
    }

    /**
     * Setup cleanup intervals
     * @private
     */
    #setupCleanupIntervals() {
        // Clean sync queue every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, syncData] of this.#preferenceSyncQueue) {
                if (now - syncData.timestamp > 300000) { // 5 minutes
                    this.#preferenceSyncQueue.delete(key);
                }
            }
        }, 300000);

        // Clean inactive connections every 10 minutes
        setInterval(() => {
            for (const [userId, connections] of this.#activeConnections) {
                const activeConnections = connections.filter(conn =>
                    conn.lastActivity > Date.now() - 600000 // 10 minutes
                );
                if (activeConnections.length === 0) {
                    this.#activeConnections.delete(userId);
                } else {
                    this.#activeConnections.set(userId, activeConnections);
                }
            }
        }, 600000);
    }

    /**
     * Build default preferences based on template and user context
     * @private
     * @param {string} template - Template name
     * @param {string} locale - User locale
     * @param {Object} user - User object
     * @returns {Promise<Object>} Default preferences
     */
    async #buildDefaultPreferences(template, locale, user) {
        const languageInfo = this.#supportedLanguages.find(lang => lang.code === locale) ||
            this.#supportedLanguages[0];

        return {
            interface: {
                theme: {
                    mode: 'auto',
                    colorScheme: { ...this.#supportedThemes.light.colors },
                    customThemes: []
                },
                layout: { ...this.#defaultLayoutSettings },
                typography: {
                    fontFamily: 'system',
                    fontSize: 'base',
                    fontWeight: 'normal',
                    lineHeight: 'normal',
                    letterSpacing: 'normal'
                },
                dashboard: {
                    defaultView: 'overview',
                    widgetLayout: [],
                    refreshInterval: 300,
                    autoRefresh: true
                }
            },
            notifications: {
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
            },
            localization: {
                language: locale,
                region: 'US',
                timezone: 'UTC',
                dateFormat: 'MM/DD/YYYY',
                timeFormat: '12h',
                numberFormat: '1,234.56',
                currency: { code: 'USD', symbol: '$', position: 'before' },
                firstDayOfWeek: 0
            },
            accessibility: {
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
            }
        };
    }

    /**
     * Merge preferences with organization defaults
     * @private
     * @param {Object} basePrefs - Base preferences
     * @param {Object} orgPrefs - Organization preferences
     * @returns {Object} Merged preferences
     */
    #mergePreferences(basePrefs, orgPrefs) {
        const merge = (base, org) => {
            if (!org || typeof org !== 'object') return base;
            if (!base || typeof base !== 'object') return org;

            const result = { ...base };

            for (const key in org) {
                if (org[key] !== null && org[key] !== undefined) {
                    if (typeof org[key] === 'object' && !Array.isArray(org[key])) {
                        result[key] = merge(base[key], org[key]);
                    } else {
                        result[key] = org[key];
                    }
                }
            }

            return result;
        };

        return merge(basePrefs, orgPrefs);
    }

    /**
     * Sanitize preferences output by removing sensitive fields
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {Object} Sanitized preferences
     */
    #sanitizePreferencesOutput(preferences) {
        const sanitized = { ...preferences };

        // Remove sensitive notification data
        if (sanitized.notifications?.push?.devices) {
            sanitized.notifications.push.devices = sanitized.notifications.push.devices.map(device => ({
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                platform: device.platform,
                enabled: device.enabled,
                lastUsed: device.lastUsed
                // Remove token
            }));
        }

        return sanitized;
    }

    /**
     * Generate cache key for preferences data
     * @private
     * @param {string} type - Cache type
     * @param {string} identifier - Unique identifier
     * @param {Object} options - Options for key generation
     * @returns {string} Cache key
     */
    #generateCacheKey(type, identifier, options = {}) {
        const baseKey = `preferences:${type}:${identifier}`;

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
     * Clear preference-related caches
     * @private
     * @param {string} userId - User ID
     */
    async #clearPreferencesCaches(userId) {
        const patterns = [
            `preferences:*:${userId}:*`,
            `preferences:analytics:${userId}:*`,
            'preferences:bulk:*'
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Check preferences access permissions
     * @private
     * @param {Object} preferences - Preferences object
     * @param {string} requesterId - ID of user requesting access
     * @param {string} operation - Operation type
     */
    async #checkPreferencesAccess(preferences, requesterId, operation) {
        // Owner always has access
        if (preferences.userId.toString() === requesterId) {
            return;
        }

        // Get requester's permissions (simplified for demo)
        const user = await UserModel.findById(preferences.userId);
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
     * Calculate preference metrics and insights
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {Promise<Object>} Calculated metrics
     */
    async #calculatePreferenceMetrics(preferences) {
        return {
            customizationLevel: this.#calculateCustomizationLevel(preferences),
            accessibilityScore: this.#calculateAccessibilityScore(preferences),
            notificationChannels: this.#countActiveNotificationChannels(preferences),
            themeComplexity: this.#calculateThemeComplexity(preferences),
            lastModified: preferences.updatedAt,
            syncStatus: 'synced' // Would be calculated based on actual sync state
        };
    }

    /**
     * Calculate customization level
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {number} Customization level (0-100)
     */
    #calculateCustomizationLevel(preferences) {
        let score = 0;
        let maxScore = 100;

        // Theme customization (20 points)
        if (preferences.interface?.theme?.mode !== 'auto') score += 10;
        if (preferences.interface?.theme?.customThemes?.length > 0) score += 10;

        // Layout customization (20 points)
        const defaultLayout = this.#defaultLayoutSettings;
        const currentLayout = preferences.interface?.layout || {};
        let layoutChanges = 0;
        for (const [key, defaultValue] of Object.entries(defaultLayout)) {
            if (currentLayout[key] !== defaultValue) layoutChanges++;
        }
        score += Math.min(20, layoutChanges * 3);

        // Notification customization (20 points)
        const notificationCategories = Object.keys(preferences.notifications?.email?.categories || {});
        const customizedCategories = notificationCategories.filter(cat =>
            preferences.notifications.email.categories[cat].enabled !== true
        );
        score += Math.min(20, customizedCategories.length * 4);

        // Accessibility customization (20 points)
        if (preferences.accessibility?.screenReader?.enabled) score += 5;
        if (preferences.accessibility?.visual?.highContrast?.enabled) score += 5;
        if (preferences.accessibility?.motor?.reducedMotion) score += 5;
        if (preferences.accessibility?.cognitive?.simplifiedInterface) score += 5;

        // Localization customization (20 points)
        if (preferences.localization?.language !== 'en') score += 5;
        if (preferences.localization?.timezone !== 'UTC') score += 5;
        if (preferences.localization?.dateFormat !== 'MM/DD/YYYY') score += 5;
        if (preferences.localization?.currency?.code !== 'USD') score += 5;

        return Math.min(score, maxScore);
    }

    /**
     * Calculate accessibility score
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {number} Accessibility score (0-100)
     */
    #calculateAccessibilityScore(preferences) {
        let score = 0;

        const accessibility = preferences.accessibility || {};

        // Screen reader support
        if (accessibility.screenReader?.enabled) score += 25;

        // Visual accessibility
        if (accessibility.visual?.highContrast?.enabled) score += 20;
        if (accessibility.visual?.textScaling?.factor > 1.0) score += 15;

        // Motor accessibility
        if (accessibility.motor?.reducedMotion) score += 15;
        if (accessibility.motor?.largerClickTargets) score += 10;

        // Cognitive accessibility
        if (accessibility.cognitive?.simplifiedInterface) score += 10;
        if (accessibility.cognitive?.extendedTimeouts) score += 5;

        return Math.min(score, 100);
    }

    /**
     * Count active notification channels
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {number} Number of active channels
     */
    #countActiveNotificationChannels(preferences) {
        let count = 0;

        if (preferences.notifications?.email?.enabled) count++;
        if (preferences.notifications?.push?.enabled) count++;
        if (preferences.notifications?.sms?.enabled) count++;
        if (preferences.notifications?.inApp?.enabled) count++;

        return count;
    }

    /**
     * Initialize real-time connection for user
     * @private
     * @param {string} userId - User ID
     */
    async #initializeRealtimeConnection(userId) {
        // In a real implementation, this would set up WebSocket connections
        if (!this.#activeConnections.has(userId)) {
            this.#activeConnections.set(userId, []);
        }

        logger.debug('Real-time connection initialized for user', { userId });
    }

    /**
     * Send preferences creation notifications
     * @private
     * @param {Object} preferences - Created preferences
     * @param {Object} user - User object
     */
    async #sendPreferencesCreationNotifications(preferences, user) {
        try {
            await this.#notificationService.sendNotification({
                type: 'PREFERENCES_CREATED',
                recipients: [user._id.toString()],
                data: {
                    preferencesId: preferences._id,
                    customizationLevel: await this.#calculateCustomizationLevel(preferences)
                }
            });
        } catch (error) {
            logger.warn('Failed to send preferences creation notifications', {
                preferencesId: preferences._id,
                error: error.message
            });
        }
    }

    /**
     * Filter preferences for real-time sync
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {Object} Filtered preferences
     */
    #filterRealtimePreferences(preferences) {
        const filtered = {};

        for (const path of this.#realtimePreferences) {
            const value = this.#getNestedValue(preferences, path);
            if (value !== undefined) {
                this.#setNestedValue(filtered, path, value);
            }
        }

        return filtered;
    }

    /**
     * Get nested object value by path
     * @private
     * @param {Object} obj - Object to get value from
     * @param {string} path - Dot-separated path
     * @returns {*} Value at path
     */
    #getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set nested object value by path
     * @private
     * @param {Object} obj - Object to set value in
     * @param {string} path - Dot-separated path
     * @param {*} value - Value to set
     */
    #setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get organization preference defaults
     * @private
     * @param {string} organizationId - Organization ID
     * @returns {Promise<Object>} Organization preference defaults
     */
    async #getOrganizationPreferenceDefaults(organizationId) {
        try {
            // In production, this would fetch from organization service
            // For now, return enterprise-focused defaults
            return {
                interface: {
                    theme: { mode: 'light' },
                    layout: {
                        density: 'compact',
                        sidebarPosition: 'left',
                        headerFixed: true
                    }
                },
                notifications: {
                    email: {
                        categories: {
                            security: { enabled: true, priority: 'high' },
                            system: { enabled: true, priority: 'medium' }
                        }
                    }
                },
                accessibility: {
                    visual: { highContrast: { enabled: false } }
                }
            };
        } catch (error) {
            logger.warn('Failed to get organization preference defaults', {
                organizationId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Validate preference updates
     * @private
     * @param {Object} updateData - Update data to validate
     * @param {Object} existingPreferences - Existing preferences
     */
    async #validatePreferenceUpdates(updateData, existingPreferences) {
        // Validate theme updates
        if (updateData.interface?.theme) {
            await this.#validateThemeData(updateData.interface.theme);
        }

        // Validate notification updates
        if (updateData.notifications) {
            await this.#validateNotificationData(updateData.notifications);
        }

        // Validate localization updates
        if (updateData.localization) {
            await this.#validateLocalizationData(updateData.localization);
        }

        // Validate accessibility updates
        if (updateData.accessibility) {
            await this.#validateAccessibilityData(updateData.accessibility);
        }

        // Validate layout updates
        if (updateData.interface?.layout) {
            await this.#validateLayoutData(updateData.interface.layout);
        }
    }

    /**
     * Validate theme data
     * @private
     * @param {Object} themeData - Theme data to validate
     */
    async #validateThemeData(themeData) {
        if (themeData.mode && !['light', 'dark', 'auto', 'high_contrast', 'custom'].includes(themeData.mode)) {
            throw new ValidationError('Invalid theme mode', 'INVALID_THEME_MODE');
        }

        if (themeData.colorScheme) {
            for (const [colorName, colorValue] of Object.entries(themeData.colorScheme)) {
                if (colorValue && !this.#validationRules.colorHex.test(colorValue)) {
                    throw new ValidationError(`Invalid color value for ${colorName}`, 'INVALID_COLOR_VALUE');
                }
            }
        }
    }

    /**
     * Validate notification data
     * @private
     * @param {Object} notificationData - Notification data to validate
     */
    async #validateNotificationData(notificationData) {
        // Validate email settings
        if (notificationData.email?.address && !this.#validationRules.email.test(notificationData.email.address)) {
            throw new ValidationError('Invalid email address', 'INVALID_EMAIL_ADDRESS');
        }

        // Validate frequency settings
        const validFrequencies = ['immediate', 'hourly', 'daily', 'weekly', 'never'];
        if (notificationData.email?.frequency && !validFrequencies.includes(notificationData.email.frequency)) {
            throw new ValidationError('Invalid notification frequency', 'INVALID_NOTIFICATION_FREQUENCY');
        }

        // Validate quiet hours
        if (notificationData.email?.quietHours?.enabled) {
            const { startTime, endTime } = notificationData.email.quietHours;
            if (startTime && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime)) {
                throw new ValidationError('Invalid quiet hours start time', 'INVALID_QUIET_HOURS_TIME');
            }
            if (endTime && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)) {
                throw new ValidationError('Invalid quiet hours end time', 'INVALID_QUIET_HOURS_TIME');
            }
        }
    }

    /**
     * Validate localization data
     * @private
     * @param {Object} localizationData - Localization data to validate
     */
    async #validateLocalizationData(localizationData) {
        // Validate language code
        if (localizationData.language) {
            const isSupported = this.#supportedLanguages.some(lang => lang.code === localizationData.language);
            if (!isSupported) {
                throw new ValidationError('Unsupported language code', 'UNSUPPORTED_LANGUAGE');
            }
        }

        // Validate timezone
        if (localizationData.timezone && !this.#validationRules.timezone.test(localizationData.timezone)) {
            throw new ValidationError('Invalid timezone format', 'INVALID_TIMEZONE');
        }

        // Validate currency code
        if (localizationData.currency?.code && !/^[A-Z]{3}$/.test(localizationData.currency.code)) {
            throw new ValidationError('Invalid currency code', 'INVALID_CURRENCY_CODE');
        }

        // Validate date format
        const validDateFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'];
        if (localizationData.dateFormat && !validDateFormats.includes(localizationData.dateFormat)) {
            throw new ValidationError('Invalid date format', 'INVALID_DATE_FORMAT');
        }
    }

    /**
     * Validate accessibility data
     * @private
     * @param {Object} accessibilityData - Accessibility data to validate
     */
    async #validateAccessibilityData(accessibilityData) {
        // Validate screen reader settings
        if (accessibilityData.screenReader) {
            const validVerbosity = this.#accessibilityFeatures.screenReader.verbosity;
            if (accessibilityData.screenReader.verbosity && !validVerbosity.includes(accessibilityData.screenReader.verbosity)) {
                throw new ValidationError('Invalid screen reader verbosity level', 'INVALID_SCREEN_READER_VERBOSITY');
            }
        }

        // Validate visual accessibility
        if (accessibilityData.visual) {
            if (accessibilityData.visual.textScaling?.factor) {
                const factor = accessibilityData.visual.textScaling.factor;
                const { min, max } = this.#accessibilityFeatures.visual.textScaling;
                if (factor < min || factor > max) {
                    throw new ValidationError(`Text scaling factor must be between ${min} and ${max}`, 'INVALID_TEXT_SCALING');
                }
            }

            const validColorBlindness = this.#accessibilityFeatures.visual.colorBlindness;
            if (accessibilityData.visual.colorBlindness?.type && !validColorBlindness.includes(accessibilityData.visual.colorBlindness.type)) {
                throw new ValidationError('Invalid color blindness type', 'INVALID_COLOR_BLINDNESS_TYPE');
            }
        }

        // Validate motor accessibility
        if (accessibilityData.motor) {
            if (accessibilityData.motor.clickDelay !== undefined) {
                const { min, max } = this.#accessibilityFeatures.motor.clickDelay;
                if (accessibilityData.motor.clickDelay < min || accessibilityData.motor.clickDelay > max) {
                    throw new ValidationError(`Click delay must be between ${min}ms and ${max}ms`, 'INVALID_CLICK_DELAY');
                }
            }
        }
    }

    /**
     * Validate layout data
     * @private
     * @param {Object} layoutData - Layout data to validate
     */
    async #validateLayoutData(layoutData) {
        const validDensities = ['compact', 'comfortable', 'spacious'];
        if (layoutData.density && !validDensities.includes(layoutData.density)) {
            throw new ValidationError('Invalid layout density', 'INVALID_LAYOUT_DENSITY');
        }

        const validSidebarPositions = ['left', 'right', 'hidden'];
        if (layoutData.sidebarPosition && !validSidebarPositions.includes(layoutData.sidebarPosition)) {
            throw new ValidationError('Invalid sidebar position', 'INVALID_SIDEBAR_POSITION');
        }
    }

    /**
     * Process preference updates with business logic
     * @private
     * @param {Object} updateData - Raw update data
     * @param {Object} existingPreferences - Existing preferences
     * @param {string} updatedBy - User making update
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processed update results
     */
    async #processPreferenceUpdates(updateData, existingPreferences, updatedBy, options) {
        const { category, reason } = options;
        const changes = {};
        const warnings = [];

        // Process each category of updates
        for (const [key, value] of Object.entries(updateData)) {
            if (category && key !== category) continue;

            // Interface updates
            if (key === 'interface') {
                const interfaceChanges = this.#processInterfaceUpdates(value, existingPreferences.interface);
                if (Object.keys(interfaceChanges).length > 0) {
                    changes['interface'] = interfaceChanges;
                }
            }
            // Notification updates
            else if (key === 'notifications') {
                const notificationChanges = await this.#processNotificationUpdates(value, existingPreferences.notifications);
                if (Object.keys(notificationChanges).length > 0) {
                    changes['notifications'] = notificationChanges;
                }
            }
            // Localization updates
            else if (key === 'localization') {
                const localizationChanges = this.#processLocalizationUpdates(value, existingPreferences.localization);
                if (Object.keys(localizationChanges).length > 0) {
                    changes['localization'] = localizationChanges;
                }
            }
            // Accessibility updates
            else if (key === 'accessibility') {
                const accessibilityChanges = this.#processAccessibilityUpdates(value, existingPreferences.accessibility);
                if (Object.keys(accessibilityChanges).length > 0) {
                    changes['accessibility'] = accessibilityChanges;
                }
            }
            // Other preference categories
            else {
                changes[key] = value;
            }
        }

        return {
            changes,
            warnings,
            reason
        };
    }

    /**
     * Process interface updates
     * @private
     * @param {Object} interfaceUpdates - Interface updates
     * @param {Object} existingInterface - Existing interface preferences
     * @returns {Object} Processed interface changes
     */
    #processInterfaceUpdates(interfaceUpdates, existingInterface) {
        const changes = {};

        if (interfaceUpdates.theme) {
            changes.theme = { ...existingInterface.theme, ...interfaceUpdates.theme };
            changes.theme.lastUpdated = new Date();
        }

        if (interfaceUpdates.layout) {
            changes.layout = { ...existingInterface.layout, ...interfaceUpdates.layout };
            changes.layout.lastUpdated = new Date();
        }

        if (interfaceUpdates.typography) {
            changes.typography = { ...existingInterface.typography, ...interfaceUpdates.typography };
            changes.typography.lastUpdated = new Date();
        }

        if (interfaceUpdates.dashboard) {
            changes.dashboard = { ...existingInterface.dashboard, ...interfaceUpdates.dashboard };
            changes.dashboard.lastUpdated = new Date();
        }

        return changes;
    }

    /**
     * Process notification updates
     * @private
     * @param {Object} notificationUpdates - Notification updates
     * @param {Object} existingNotifications - Existing notification preferences
     * @returns {Promise<Object>} Processed notification changes
     */
    async #processNotificationUpdates(notificationUpdates, existingNotifications) {
        const changes = {};

        ['email', 'push', 'sms', 'inApp', 'webhook'].forEach(channel => {
            if (notificationUpdates[channel]) {
                changes[channel] = {
                    ...existingNotifications[channel],
                    ...notificationUpdates[channel],
                    lastUpdated: new Date()
                };

                // Validate device registrations for push notifications
                if (channel === 'push' && notificationUpdates[channel].devices) {
                    changes[channel].devices = this.#validatePushDevices(notificationUpdates[channel].devices);
                }
            }
        });

        return changes;
    }

    /**
     * Process localization updates
     * @private
     * @param {Object} localizationUpdates - Localization updates
     * @param {Object} existingLocalization - Existing localization preferences
     * @returns {Object} Processed localization changes
     */
    #processLocalizationUpdates(localizationUpdates, existingLocalization) {
        const changes = { ...existingLocalization, ...localizationUpdates };

        // Add RTL detection if language changed
        if (localizationUpdates.language) {
            const languageInfo = this.#supportedLanguages.find(lang => lang.code === localizationUpdates.language);
            if (languageInfo) {
                changes.rtl = languageInfo.rtl;
                changes.languageName = languageInfo.name;
            }
        }

        changes.lastUpdated = new Date();
        return changes;
    }

    /**
     * Process accessibility updates
     * @private
     * @param {Object} accessibilityUpdates - Accessibility updates
     * @param {Object} existingAccessibility - Existing accessibility preferences
     * @returns {Object} Processed accessibility changes
     */
    #processAccessibilityUpdates(accessibilityUpdates, existingAccessibility) {
        const changes = {};

        ['screenReader', 'visual', 'motor', 'cognitive', 'keyboard'].forEach(category => {
            if (accessibilityUpdates[category]) {
                changes[category] = {
                    ...existingAccessibility[category],
                    ...accessibilityUpdates[category],
                    lastUpdated: new Date()
                };
            }
        });

        return changes;
    }

    /**
     * Handle special preferences that need additional processing
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} changes - Changes made
     * @param {string} updatedBy - User making update
     */
    async #handleSpecialPreferences(preferences, changes, updatedBy) {
        // Handle theme mode changes
        if (changes.interface?.theme?.mode) {
            await this.#handleThemeModeChange(preferences, changes.interface.theme.mode, updatedBy);
        }

        // Handle language changes
        if (changes.localization?.language) {
            await this.#handleLanguageChange(preferences, changes.localization.language, updatedBy);
        }

        // Handle accessibility changes
        if (changes.accessibility) {
            await this.#handleAccessibilityChanges(preferences, changes.accessibility, updatedBy);
        }

        // Handle notification device registration
        if (changes.notifications?.push?.devices) {
            await this.#handlePushDeviceRegistration(preferences, changes.notifications.push.devices, updatedBy);
        }
    }

    /**
     * Sync preferences in real-time
     * @private
     * @param {string} userId - User ID
     * @param {Object} changes - Changes to sync
     */
    async #syncPreferencesRealtime(userId, changes) {
        try {
            // Filter changes to only include real-time preferences
            const realtimeChanges = this.#filterRealtimeChanges(changes);

            if (Object.keys(realtimeChanges).length === 0) {
                return;
            }

            // Get active connections for user
            const connections = this.#getActiveConnections(userId);

            if (connections.length === 0) {
                // Queue for later delivery
                await this.#queueRealtimeSync(userId, realtimeChanges);
                return;
            }

            // Send to all active connections
            const syncPayload = {
                type: 'preference_update',
                userId,
                timestamp: Date.now(),
                changes: realtimeChanges
            };

            for (const connection of connections) {
                await this.#sendRealtimeUpdate(connection, syncPayload);
            }

            logger.debug('Preferences synced in real-time', {
                userId,
                changesCount: Object.keys(realtimeChanges).length,
                connectionsNotified: connections.length
            });
        } catch (error) {
            logger.error('Failed to sync preferences in real-time', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Filter changes for real-time sync
     * @private
     * @param {Object} changes - All changes
     * @returns {Object} Filtered real-time changes
     */
    #filterRealtimeChanges(changes) {
        const realtimeChanges = {};

        for (const path of this.#realtimePreferences) {
            const value = this.#getNestedValue(changes, path);
            if (value !== undefined) {
                this.#setNestedValue(realtimeChanges, path, value);
            }
        }

        return realtimeChanges;
    }

    /**
     * Send preference update notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} updateResults - Update results
     * @param {string} updatedBy - User who made update
     */
    async #sendPreferenceUpdateNotifications(preferences, updateResults, updatedBy) {
        try {
            const significantChanges = this.#identifySignificantPreferenceChanges(updateResults.changes);

            if (significantChanges.length > 0) {
                // Notify user if updated by someone else
                if (updatedBy !== preferences.userId.toString()) {
                    await this.#notificationService.sendNotification({
                        type: 'PREFERENCES_UPDATED_BY_ADMIN',
                        recipients: [preferences.userId.toString()],
                        data: {
                            updatedBy,
                            changes: significantChanges,
                            reason: updateResults.reason
                        }
                    });
                }

                // Send accessibility alerts if relevant
                if (significantChanges.some(change => change.startsWith('accessibility'))) {
                    await this.#sendAccessibilityChangeAlert(preferences, significantChanges, updatedBy);
                }
            }
        } catch (error) {
            logger.warn('Failed to send preference update notifications', {
                preferencesId: preferences._id,
                error: error.message
            });
        }
    }

    /**
     * Identify significant preference changes
     * @private
     * @param {Object} changes - Changes made
     * @returns {Array} List of significant changes
     */
    #identifySignificantPreferenceChanges(changes) {
        const significant = [];
        const significantPaths = [
            'interface.theme.mode',
            'localization.language',
            'accessibility.screenReader.enabled',
            'accessibility.visual.highContrast.enabled',
            'notifications.email.enabled',
            'notifications.push.enabled'
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
     * Validate theme configuration
     * @private
     * @param {Object} themeConfig - Theme configuration
     */
    async #validateThemeConfiguration(themeConfig) {
        if (!themeConfig.mode) {
            throw new ValidationError('Theme mode is required', 'THEME_MODE_REQUIRED');
        }

        const validModes = Object.keys(this.#supportedThemes);
        if (!validModes.includes(themeConfig.mode)) {
            throw new ValidationError('Invalid theme mode', 'INVALID_THEME_MODE');
        }

        // Validate custom theme colors if provided
        if (themeConfig.colorScheme) {
            for (const [colorName, colorValue] of Object.entries(themeConfig.colorScheme)) {
                if (colorValue && !this.#validationRules.colorHex.test(colorValue)) {
                    throw new ValidationError(`Invalid color value for ${colorName}: ${colorValue}`, 'INVALID_COLOR_VALUE');
                }
            }
        }

        // Validate custom theme name if saving as custom
        if (themeConfig.saveAsCustom && themeConfig.customThemeName) {
            if (themeConfig.customThemeName.length < 3 || themeConfig.customThemeName.length > 50) {
                throw new ValidationError('Custom theme name must be 3-50 characters', 'INVALID_THEME_NAME_LENGTH');
            }
        }
    }

    /**
     * Process theme configuration
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} themeConfig - Theme configuration
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processed theme result
     */
    async #processThemeConfiguration(preferences, themeConfig, options) {
        const { saveAsCustom, customThemeName } = options;

        const themeResult = {
            mode: themeConfig.mode,
            colorScheme: themeConfig.colorScheme,
            customThemeCreated: false
        };

        // Save as custom theme if requested
        if (saveAsCustom && customThemeName) {
            const customTheme = {
                name: customThemeName,
                mode: 'custom',
                colors: themeConfig.colorScheme || {},
                createdAt: new Date(),
                isDefault: false
            };

            if (!preferences.interface.theme.customThemes) {
                preferences.interface.theme.customThemes = [];
            }

            preferences.interface.theme.customThemes.push(customTheme);
            themeResult.customThemeCreated = true;
            themeResult.customTheme = customTheme;
        }

        // Apply base theme colors if not custom
        if (themeConfig.mode !== 'custom' && this.#supportedThemes[themeConfig.mode]) {
            themeResult.colorScheme = {
                ...this.#supportedThemes[themeConfig.mode].colors,
                ...themeConfig.colorScheme
            };
        }

        return themeResult;
    }

    /**
     * Sync theme changes in real-time
     * @private
     * @param {string} userId - User ID
     * @param {Object} themeResult - Theme result
     */
    async #syncThemeChangesRealtime(userId, themeResult) {
        const themeChanges = {
            'interface.theme.mode': themeResult.mode,
            'interface.theme.colorScheme': themeResult.colorScheme
        };

        await this.#syncPreferencesRealtime(userId, themeChanges);
    }

    /**
     * Send theme update notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} themeResult - Theme result
     * @param {string} configuredBy - User who configured theme
     */
    async #sendThemeUpdateNotifications(preferences, themeResult, configuredBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'THEME_UPDATED',
                recipients: [preferences.userId.toString()],
                data: {
                    themeMode: themeResult.mode,
                    customThemeCreated: themeResult.customThemeCreated,
                    configuredBy
                }
            });
        } catch (error) {
            logger.warn('Failed to send theme update notifications', {
                preferencesId: preferences._id,
                error: error.message
            });
        }
    }

    /**
     * Validate notification configuration
     * @private
     * @param {Object} notificationConfig - Notification configuration
     * @param {boolean} validateDevices - Whether to validate devices
     */
    async #validateNotificationConfiguration(notificationConfig, validateDevices) {
        // Validate email configuration
        if (notificationConfig.email) {
            if (notificationConfig.email.address && !validator.isEmail(notificationConfig.email.address)) {
                throw new ValidationError('Invalid email address', 'INVALID_EMAIL_ADDRESS');
            }
        }

        // Validate push notification configuration
        if (notificationConfig.push && validateDevices) {
            if (notificationConfig.push.devices && Array.isArray(notificationConfig.push.devices)) {
                for (const device of notificationConfig.push.devices) {
                    if (!device.token || !device.platform) {
                        throw new ValidationError('Push device must have token and platform', 'INVALID_PUSH_DEVICE');
                    }

                    const validPlatforms = ['ios', 'android', 'web', 'macos', 'windows'];
                    if (!validPlatforms.includes(device.platform)) {
                        throw new ValidationError('Invalid device platform', 'INVALID_DEVICE_PLATFORM');
                    }
                }
            }
        }

        // Validate SMS configuration
        if (notificationConfig.sms) {
            if (notificationConfig.sms.phoneNumber && !this.#validationRules.phoneNumber.test(notificationConfig.sms.phoneNumber)) {
                throw new ValidationError('Invalid phone number format', 'INVALID_PHONE_NUMBER');
            }
        }
    }

    /**
     * Configure email notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} emailConfig - Email configuration
     * @param {string} configuredBy - User configuring notifications
     * @returns {Promise<Object>} Email configuration result
     */
    async #configureEmailNotifications(preferences, emailConfig, configuredBy) {
        const emailResult = {
            enabled: emailConfig.enabled !== false,
            address: emailConfig.address || preferences.notifications.email?.address,
            frequency: emailConfig.frequency || 'immediate',
            categories: {
                ...preferences.notifications.email?.categories,
                ...emailConfig.categories
            },
            quietHours: emailConfig.quietHours || preferences.notifications.email?.quietHours
        };

        // Verify email address if changed
        if (emailConfig.address && emailConfig.address !== preferences.notifications.email?.address) {
            emailResult.verificationRequired = true;
            emailResult.verificationSent = true;

            // Send verification email
            await this.#emailService.sendEmailVerification(emailConfig.address, {
                verificationToken: crypto.randomBytes(32).toString('hex'),
                expiresIn: 24 // hours
            });
        }

        preferences.notifications.email = emailResult;
        return emailResult;
    }

    /**
     * Configure push notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} pushConfig - Push configuration
     * @param {string} configuredBy - User configuring notifications
     * @returns {Promise<Object>} Push configuration result
     */
    async #configurePushNotifications(preferences, pushConfig, configuredBy) {
        const pushResult = {
            enabled: pushConfig.enabled !== false,
            devices: pushConfig.devices || preferences.notifications.push?.devices || [],
            categories: {
                ...preferences.notifications.push?.categories,
                ...pushConfig.categories
            },
            badge: pushConfig.badge !== false,
            sound: pushConfig.sound !== false
        };

        // Validate and process device tokens
        if (pushConfig.devices) {
            pushResult.devices = await this.#processPushDevices(pushConfig.devices);
        }

        preferences.notifications.push = pushResult;
        return pushResult;
    }

    /**
     * Configure SMS notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} smsConfig - SMS configuration
     * @param {string} configuredBy - User configuring notifications
     * @returns {Promise<Object>} SMS configuration result
     */
    async #configureSMSNotifications(preferences, smsConfig, configuredBy) {
        const smsResult = {
            enabled: smsConfig.enabled !== false,
            phoneNumber: smsConfig.phoneNumber || preferences.notifications.sms?.phoneNumber,
            categories: {
                ...preferences.notifications.sms?.categories,
                ...smsConfig.categories
            },
            verified: false
        };

        // Verify phone number if changed
        if (smsConfig.phoneNumber && smsConfig.phoneNumber !== preferences.notifications.sms?.phoneNumber) {
            smsResult.verificationRequired = true;
            smsResult.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Send verification SMS (mock implementation)
            logger.info('SMS verification code sent', {
                phoneNumber: this.#maskPhoneNumber(smsConfig.phoneNumber),
                code: smsResult.verificationCode
            });
        }

        preferences.notifications.sms = smsResult;
        return smsResult;
    }

    /**
     * Configure in-app notifications
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} inAppConfig - In-app configuration
     * @param {string} configuredBy - User configuring notifications
     * @returns {Promise<Object>} In-app configuration result
     */
    async #configureInAppNotifications(preferences, inAppConfig, configuredBy) {
        const inAppResult = {
            enabled: inAppConfig.enabled !== false,
            position: inAppConfig.position || 'top-right',
            duration: inAppConfig.duration || 5000,
            playSound: inAppConfig.playSound !== false,
            categories: {
                ...preferences.notifications.inApp?.categories,
                ...inAppConfig.categories
            },
            maxVisible: inAppConfig.maxVisible || 5
        };

        preferences.notifications.inApp = inAppResult;
        return inAppResult;
    }

    /**
     * Test notification channels
     * @private
     * @param {string} userId - User ID
     * @param {Object} notificationResults - Notification configuration results
     * @returns {Promise<Object>} Test results
     */
    async #testNotificationChannels(userId, notificationResults) {
        const testResults = {
            summary: { total: 0, successful: 0, failed: 0 },
            channels: {}
        };

        // Test email notifications
        if (notificationResults.email?.enabled) {
            testResults.summary.total++;
            try {
                await this.#emailService.sendTestNotification(notificationResults.email.address, {
                    subject: 'Test Email Notification',
                    message: 'This is a test email to verify your notification settings.'
                });
                testResults.channels.email = { success: true, message: 'Test email sent successfully' };
                testResults.summary.successful++;
            } catch (error) {
                testResults.channels.email = { success: false, error: error.message };
                testResults.summary.failed++;
            }
        }

        // Test push notifications
        if (notificationResults.push?.enabled && notificationResults.push.devices?.length > 0) {
            testResults.summary.total++;
            try {
                // Mock push notification test
                testResults.channels.push = {
                    success: true,
                    message: `Test notification sent to ${notificationResults.push.devices.length} device(s)`
                };
                testResults.summary.successful++;
            } catch (error) {
                testResults.channels.push = { success: false, error: error.message };
                testResults.summary.failed++;
            }
        }

        // Test SMS notifications
        if (notificationResults.sms?.enabled && notificationResults.sms.phoneNumber) {
            testResults.summary.total++;
            try {
                // Mock SMS test
                testResults.channels.sms = { success: true, message: 'Test SMS sent successfully' };
                testResults.summary.successful++;
            } catch (error) {
                testResults.channels.sms = { success: false, error: error.message };
                testResults.summary.failed++;
            }
        }

        return testResults;
    }

    /**
     * Send notification configuration confirmation
     * @private
     * @param {Object} preferences - Preferences object
     * @param {Object} notificationResults - Notification results
     * @param {string} configuredBy - User who configured notifications
     */
    async #sendNotificationConfigConfirmation(preferences, notificationResults, configuredBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'NOTIFICATIONS_CONFIGURED',
                recipients: [preferences.userId.toString()],
                data: {
                    channels: Object.keys(notificationResults),
                    configuredBy
                }
            });
        } catch (error) {
            logger.warn('Failed to send notification configuration confirmation', {
                preferencesId: preferences._id,
                error: error.message
            });
        }
    }

    /**
     * Validate accessibility configuration
     * @private
     * @param {Object} accessibilityConfig - Accessibility configuration
     * @param {boolean} validateCompatibility - Whether to validate feature compatibility
     */
    async #validateAccessibilityConfiguration(accessibilityConfig, validateCompatibility) {
        // Validate screen reader configuration
        if (accessibilityConfig.screenReader) {
            const validVerbosity = this.#accessibilityFeatures.screenReader.verbosity;
            if (accessibilityConfig.screenReader.verbosity &&
                !validVerbosity.includes(accessibilityConfig.screenReader.verbosity)) {
                throw new ValidationError('Invalid screen reader verbosity level', 'INVALID_SCREEN_READER_VERBOSITY');
            }
        }

        // Validate visual accessibility
        if (accessibilityConfig.visual) {
            const visual = accessibilityConfig.visual;

            if (visual.textScaling?.factor) {
                const { min, max } = this.#accessibilityFeatures.visual.textScaling;
                if (visual.textScaling.factor < min || visual.textScaling.factor > max) {
                    throw new ValidationError(`Text scaling must be between ${min} and ${max}`, 'INVALID_TEXT_SCALING');
                }
            }

            if (visual.colorBlindness?.type) {
                const validTypes = this.#accessibilityFeatures.visual.colorBlindness;
                if (!validTypes.includes(visual.colorBlindness.type)) {
                    throw new ValidationError('Invalid color blindness type', 'INVALID_COLOR_BLINDNESS_TYPE');
                }
            }
        }

        // Validate motor accessibility
        if (accessibilityConfig.motor) {
            const motor = accessibilityConfig.motor;

            if (motor.clickDelay !== undefined) {
                const { min, max } = this.#accessibilityFeatures.motor.clickDelay;
                if (motor.clickDelay < min || motor.clickDelay > max) {
                    throw new ValidationError(`Click delay must be between ${min}ms and ${max}ms`, 'INVALID_CLICK_DELAY');
                }
            }

            if (motor.targetSize) {
                const validSizes = this.#accessibilityFeatures.motor.targetSizes;
                if (!validSizes.includes(motor.targetSize)) {
                    throw new ValidationError('Invalid target size', 'INVALID_TARGET_SIZE');
                }
            }
        }

        // Validate cognitive accessibility
        if (accessibilityConfig.cognitive) {
            const cognitive = accessibilityConfig.cognitive;

            if (cognitive.timeoutMultiplier !== undefined) {
                const validMultipliers = this.#accessibilityFeatures.cognitive.timeoutExtensions;
                if (!validMultipliers.includes(cognitive.timeoutMultiplier)) {
                    throw new ValidationError('Invalid timeout multiplier', 'INVALID_TIMEOUT_MULTIPLIER');
                }
            }

            if (cognitive.simplificationLevel) {
                const validLevels = this.#accessibilityFeatures.cognitive.simplificationLevels;
                if (!validLevels.includes(cognitive.simplificationLevel)) {
                    throw new ValidationError('Invalid simplification level', 'INVALID_SIMPLIFICATION_LEVEL');
                }
            }
        }

        // Check feature compatibility if requested
        if (validateCompatibility) {
            await this.#validateAccessibilityCompatibility(accessibilityConfig);
        }
    }

    /**
     * Validate accessibility feature compatibility
     * @private
     * @param {Object} accessibilityConfig - Accessibility configuration
     */
    async #validateAccessibilityCompatibility(accessibilityConfig) {
        const warnings = [];

        // Check for conflicting settings
        if (accessibilityConfig.visual?.highContrast?.enabled &&
            accessibilityConfig.visual?.colorBlindness?.type !== 'none') {
            warnings.push('High contrast mode may conflict with color blindness accommodations');
        }

        if (accessibilityConfig.motor?.reducedMotion &&
            accessibilityConfig.interface?.animations?.enabled) {
            warnings.push('Reduced motion setting conflicts with enabled animations');
        }

        if (warnings.length > 0) {
            logger.warn('Accessibility compatibility warnings', { warnings });
        }
    }

    /**
     * Calculate theme complexity
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {number} Theme complexity score
     */
    #calculateThemeComplexity(preferences) {
        let complexity = 0;

        const theme = preferences.interface?.theme;
        if (!theme) return 0;

        // Base complexity for non-default themes
        if (theme.mode !== 'auto') complexity += 20;

        // Custom color scheme adds complexity
        if (theme.colorScheme && Object.keys(theme.colorScheme).length > 0) {
            complexity += 30;
        }

        // Custom themes add significant complexity
        if (theme.customThemes && theme.customThemes.length > 0) {
            complexity += 50;
        }

        return Math.min(complexity, 100);
    }

    /**
     * Calculate notification efficiency
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {number} Notification efficiency score
     */
    #calculateNotificationEfficiency(preferences) {
        let efficiency = 100;

        const notifications = preferences.notifications;
        if (!notifications) return 50;

        // Reduce score for excessive notifications
        const enabledChannels = [
            notifications.email?.enabled,
            notifications.push?.enabled,
            notifications.sms?.enabled,
            notifications.inApp?.enabled
        ].filter(Boolean).length;

        if (enabledChannels > 3) efficiency -= 20;

        // Check for appropriate quiet hours
        if (notifications.email?.enabled && !notifications.email?.quietHours?.enabled) {
            efficiency -= 15;
        }

        // Check for category customization
        const emailCategories = notifications.email?.categories || {};
        const customizedCategories = Object.values(emailCategories).filter(cat => !cat.enabled).length;
        if (customizedCategories === 0) efficiency -= 10; // No categories disabled

        return Math.max(efficiency, 0);
    }

    /**
     * Analyze theme usage
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {Object} Theme usage analysis
     */
    #analyzeThemeUsage(preferences) {
        const theme = preferences.interface?.theme;

        return {
            currentMode: theme?.mode || 'auto',
            hasCustomColors: !!(theme?.colorScheme && Object.keys(theme.colorScheme).length > 0),
            customThemesCount: theme?.customThemes?.length || 0,
            lastThemeChange: theme?.lastUpdated,
            complexity: this.#calculateThemeComplexity(preferences)
        };
    }

    /**
     * Analyze language settings
     * @private
     * @param {Object} preferences - Preferences object
     * @returns {Object} Language settings analysis
     */
    #analyzeLanguageSettings(preferences) {
        const localization = preferences.localization;
        const languageInfo = this.#supportedLanguages.find(lang => lang.code === localization?.language) ||
            this.#supportedLanguages[0];

        return {
            currentLanguage: languageInfo.name,
            languageCode: languageInfo.code,
            isRTL: languageInfo.rtl,
            timezone: localization?.timezone || 'UTC',
            dateFormat: localization?.dateFormat || 'MM/DD/YYYY',
            currency: localization?.currency?.code || 'USD',
            regionCustomized: !!(localization?.region && localization.region !== 'US')
        };
    }

    /**
     * Helper methods for device and data processing
     * @private
     */
    #validatePushDevices(devices) {
        return devices.filter(device => {
            return device.token && device.platform &&
                ['ios', 'android', 'web', 'macos', 'windows'].includes(device.platform);
        });
    }

    async #processPushDevices(devices) {
        const processedDevices = [];

        for (const device of devices) {
            if (device.token && device.platform) {
                processedDevices.push({
                    deviceId: device.deviceId || crypto.randomUUID(),
                    token: device.token,
                    platform: device.platform,
                    deviceName: device.deviceName || `${device.platform} Device`,
                    enabled: device.enabled !== false,
                    registeredAt: new Date(),
                    lastUsed: null
                });
            }
        }

        return processedDevices;
    }

    #maskPhoneNumber(phoneNumber) {
        if (phoneNumber.length <= 4) return phoneNumber;
        const visible = phoneNumber.slice(-4);
        const masked = '*'.repeat(phoneNumber.length - 4);
        return masked + visible;
    }

    /**
     * Get active connections for user
     * @private
     * @param {string} userId - User ID
     * @returns {Array} Active connections
     */
    #getActiveConnections(userId) {
        const connections = this.#activeConnections.get(userId) || [];
        const now = Date.now();

        // Filter active connections (last activity within 10 minutes)
        return connections.filter(conn => now - conn.lastActivity < 600000);
    }

    /**
     * Send real-time update to connection
     * @private
     * @param {Object} connection - Connection object
     * @param {Object} payload - Update payload
     */
    async #sendRealtimeUpdate(connection, payload) {
        try {
            // In a real implementation, this would use WebSocket
            logger.debug('Sending real-time update', {
                deviceId: connection.deviceId,
                type: payload.type
            });

            // Mock successful delivery
            connection.lastActivity = Date.now();
        } catch (error) {
            logger.error('Failed to send real-time update', {
                deviceId: connection.deviceId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Queue sync for offline devices
     * @private
     * @param {string} userId - User ID
     * @param {Object} syncPayload - Sync payload
     * @param {string} excludeDeviceId - Device ID to exclude
     */
    async #queueSyncForOfflineDevices(userId, syncPayload, excludeDeviceId) {
        const queueKey = `${userId}:${Date.now()}`;

        this.#preferenceSyncQueue.set(queueKey, {
            userId,
            payload: syncPayload,
            excludeDeviceId,
            timestamp: Date.now(),
            attempts: 0
        });
    }

    /**
     * Queue real-time sync for later delivery
     * @private
     * @param {string} userId - User ID
     * @param {Object} changes - Changes to queue
     */
    async #queueRealtimeSync(userId, changes) {
        const queueKey = `realtime:${userId}:${Date.now()}`;

        this.#preferenceSyncQueue.set(queueKey, {
            type: 'realtime_sync',
            userId,
            changes,
            timestamp: Date.now()
        });
    }

    /**
     * Validate bulk preference update item
     * @private
     * @param {Object} updateItem - Update item to validate
     */
    async #validateBulkPreferenceUpdate(updateItem) {
        if (!updateItem.userId) {
            throw new ValidationError('User ID is required for bulk update', 'MISSING_USER_ID');
        }

        if (!updateItem.preferences || typeof updateItem.preferences !== 'object') {
            throw new ValidationError('Preferences object is required', 'MISSING_PREFERENCES');
        }

        // Validate individual preference update
        await this.#validatePreferenceUpdates(updateItem.preferences, {});
    }

    /**
     * Process bulk preference batch
     * @private
     * @param {Array} batch - Batch of preference updates
     * @param {string} updatedBy - User performing bulk update
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Batch results
     */
    async #processBulkPreferenceBatch(batch, updatedBy, options) {
        const results = {
            successful: [],
            failed: [],
            warnings: []
        };

        for (const updateItem of batch) {
            try {
                await this.updatePreferences(updateItem.userId, updateItem.preferences, updatedBy, {
                    ...options,
                    syncRealtime: options.syncRealtime || false,
                    skipNotifications: true // Handle notifications at bulk level
                });

                results.successful.push({
                    userId: updateItem.userId,
                    updatedCategories: Object.keys(updateItem.preferences)
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
            const userIds = results.successful.map(result => result.userId);

            if (userIds.length > 0) {
                await this.#notificationService.sendBulkNotification({
                    type: 'BULK_PREFERENCES_UPDATE',
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
     * Additional helper methods for comprehensive functionality
     * @private
     */
    async #handleThemeModeChange(preferences, mode, updatedBy) {
        // Apply theme-specific optimizations
        if (mode === 'high_contrast') {
            // Ensure accessibility features are compatible
            if (!preferences.accessibility.visual.highContrast) {
                preferences.accessibility.visual.highContrast = { enabled: true };
            }
        }
    }

    async #handleLanguageChange(preferences, language, updatedBy) {
        // Update RTL setting based on language
        const languageInfo = this.#supportedLanguages.find(lang => lang.code === language);
        if (languageInfo) {
            preferences.localization.rtl = languageInfo.rtl;
        }
    }

    async #handleAccessibilityChanges(preferences, accessibilityChanges, updatedBy) {
        // Apply cross-feature optimizations
        if (accessibilityChanges.screenReader?.enabled) {
            // Optimize for screen readers
            preferences.interface.layout.density = 'spacious';
            preferences.interface.animations = { enabled: false };
        }
    }

    async #handlePushDeviceRegistration(preferences, devices, updatedBy) {
        // Validate and register push notification devices
        for (const device of devices) {
            if (device.token && device.platform) {
                // In production, register with push notification service
                logger.debug('Registering push device', {
                    deviceId: device.deviceId,
                    platform: device.platform
                });
            }
        }
    }

    async #sendAccessibilityChangeAlert(preferences, changes, updatedBy) {
        try {
            await this.#emailService.sendAccessibilityUpdateNotification(preferences.userId, {
                changes,
                timestamp: new Date(),
                updatedBy
            });
        } catch (error) {
            logger.warn('Failed to send accessibility change alert', {
                preferencesId: preferences._id,
                error: error.message
            });
        }
    }

    // Placeholder methods for complex features that would require extensive implementation
    async #configureScreenReaderSettings(preferences, config) { return config; }
    async #configureVisualAccessibility(preferences, config) { return config; }
    async #configureMotorAccessibility(preferences, config) { return config; }
    async #configureCognitiveAccessibility(preferences, config) { return config; }
    async #configureKeyboardNavigation(preferences, config) { return config; }
    async #generateAccessibilityReport(preferences) { return { score: 85, recommendations: [] }; }
    async #syncAccessibilityChangesRealtime(userId, changes) { }
    async #sendAccessibilityConfigNotifications(preferences, results, configuredBy) { }
    #generateAccessibilityRecommendations(results) { return []; }

    async #validateLocalizationConfiguration(config, validateTimezone) { }
    async #configureLanguageSettings(preferences, config) { return config; }
    async #configureRegionalSettings(preferences, config) { return config; }
    async #configureFormatPreferences(preferences, config) { return config; }
    async #configureCurrencyPreferences(preferences, config) { return config; }
    async #updateUserProfileLocalization(userId, results) { }
    async #syncLocalizationChangesRealtime(userId, results) { }
    async #sendLocalizationUpdateNotifications(preferences, results, configuredBy) { }

    async #encryptSensitivePreferences(data) { return { ...data, _encrypted: true }; }
    async #decryptSensitivePreferences(data) { delete data._encrypted; return data; }
    async #validateImportData(importData) { }
    async #migratePreferencesVersion(data, fromVersion) { return data; }
    async #syncImportedPreferencesRealtime(userId, results) { }
    async #validateImportedConfigurations(preferences) { return { valid: true, warnings: [] }; }
    async #sendImportNotifications(preferences, results, importedBy) { }

    async #analyzeUsagePatterns(userId, timeRange) { return {}; }
    async #generatePersonalizationRecommendations(preferences) { return []; }
    async #analyzeDeviceSyncPatterns(userId, timeRange) { return {}; }
    #analyzePerformanceImpact(preferences) { return { score: 95, recommendations: [] }; }
}

module.exports = UserPreferencesService;