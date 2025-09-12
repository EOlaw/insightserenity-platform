'use strict';

/**
 * @fileoverview Enterprise user management service with comprehensive authentication integration
 * @module shared/lib/services/user-management/user-service
 * @requires mongoose
 * @requires passport
 * @requires module:shared/lib/auth/services/auth-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/users/user-model
 * @requires module:shared/lib/database/models/users/user-profile-model
 * @requires module:shared/lib/database/models/users/user-settings-model
 * @requires module:shared/lib/database/models/users/user-preferences-model
 * @requires module:shared/lib/database/models/users/user-session-model
 */

const mongoose = require('mongoose');
const passport = require('passport');
const crypto = require('crypto');
const path = require('path');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/sync');

// Core dependencies
const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const config = require('../../../../../../shared/config');

// Service dependencies
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');

// Model dependencies
const UserModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-model');
const UserProfileModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-profile-model');
const UserSettingsModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-settings-model');
const UserPreferencesModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-preference-model');
const UserSessionModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-session-model');

// Passport strategies
const LocalAuthStrategy = require('../../../../../../shared/lib/auth/strategies/local-strategy');
const GoogleAuthStrategy = require('../../../../../../shared/lib/auth/strategies/google-strategy');
const GitHubAuthStrategy = require('../../../../../../shared/lib/auth/strategies/github-strategy');
const LinkedInAuthStrategy = require('../../../../../../shared/lib/auth/strategies/linkedin-strategy');
const MicrosoftAuthStrategy = require('../../../../../../shared/lib/auth/strategies/microsoft-strategy');
const SAMLAuthStrategy = require('../../../../../../shared/lib/auth/strategies/saml-strategy');
const OIDCAuthStrategy = require('../../../../../../shared/lib/auth/strategies/oidc-strategy');
const LDAPAuthStrategy = require('../../../../../../shared/lib/auth/strategies/ldap-strategy');
const JWTAuthStrategy = require('../../../../../../shared/lib/auth/strategies/jwt-strategy');

/**
 * Enterprise user service with comprehensive authentication integration and user lifecycle management
 * @class UserService
 * @description Manages all user-related operations with authentication, multi-tenant support, caching, and audit trails
 */
class UserService {
    /**
     * @private
     * @type {AuthService}
     */
    #authService;

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
     * @type {Map}
     */
    #passportStrategies = new Map();

    /**
     * @private
     * @type {Object}
     */
    #serviceConfig;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {number}
     */
    #maxBulkOperationSize = 1000;

    /**
     * @private
     * @type {Map}
     */
    #pendingTransactions = new Map();

    /**
     * @private
     * @type {Map}
     */
    #userMetricsCache = new Map();

    /**
     * @private
     * @type {Map}
     */
    #authenticationAttempts = new Map();

    /**
     * @private
     * @type {Set}
     */
    #activeSearchQueries = new Set();

    /**
     * @private
     * @type {Object}
     */
    #subscriptionLimits = {
        free: { users: 5, storage: 1000, projects: 3, mfaRequired: false },
        basic: { users: 25, storage: 10000, projects: 10, mfaRequired: false },
        professional: { users: 100, storage: 50000, projects: 50, mfaRequired: true },
        enterprise: { users: 1000, storage: 200000, projects: 200, mfaRequired: true },
        unlimited: { users: -1, storage: -1, projects: -1, mfaRequired: true }
    };

    /**
     * @private
     * @type {Object}
     */
    #roleHierarchy = {
        'super_admin': 100,
        'admin': 80,
        'security_admin': 75,
        'organization_admin': 70,
        'manager': 60,
        'team_lead': 40,
        'senior_member': 30,
        'member': 20,
        'guest': 10,
        'pending': 5
    };

    /**
     * @private
     * @type {Object}
     */
    #strategyConfigs = {
        local: { enabled: true, priority: 1 },
        google: { enabled: false, priority: 2 },
        github: { enabled: false, priority: 3 },
        linkedin: { enabled: false, priority: 4 },
        microsoft: { enabled: false, priority: 5 },
        saml: { enabled: false, priority: 6 },
        oidc: { enabled: false, priority: 7 },
        ldap: { enabled: false, priority: 8 },
        jwt: { enabled: false, priority: 9 }
    };

    /**
     * Creates an instance of UserService with authentication integration
     * @constructor
     * @param {Object} config - Service configuration
     * @param {Object} dependencies - Service dependencies
     */
    constructor(config = {}, dependencies = {}) {
        this.#serviceConfig = {
            enableCaching: true,
            enableAuditLogging: true,
            enableAnalytics: true,
            enableMFA: true,
            enableSSOIntegration: true,
            maxConcurrentUsers: 10000,
            sessionTimeout: 3600000, // 1 hour
            passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                preventReuse: 5,
                expiryDays: 90
            },
            mfaPolicy: {
                required: false,
                gracePeriod: 30, // days
                allowedMethods: ['totp', 'sms', 'email', 'webauthn', 'backup_codes']
            },
            ...config
        };

        // Initialize service dependencies
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        // Initialize auth service with configuration
        // this.#authService = dependencies.authService || new AuthService(this.#serviceConfig, {
        //     cacheService: this.#cacheService,
        //     emailService: this.#emailService,
        //     notificationService: this.#notificationService,
        //     auditService: this.#auditService
        // });

        // Initialize auth service with proper authentication configuration
        this.#authService = dependencies.authService || new AuthService(config.auth, {
            cacheService: this.#cacheService,
            emailService: this.#emailService,
            notificationService: this.#notificationService,
            auditService: this.#auditService
        });

        this.#initializeService();
    }

    /**
     * Initialize service components and Passport strategies
     * @private
     */
    #initializeService() {
        logger.info('Initializing UserService with authentication integration', {
            cacheEnabled: this.#serviceConfig.enableCaching,
            auditEnabled: this.#serviceConfig.enableAuditLogging,
            mfaEnabled: this.#serviceConfig.enableMFA,
            ssoEnabled: this.#serviceConfig.enableSSOIntegration
        });

        // Initialize Passport strategies
        this.#initializePassportStrategies();

        // Setup cleanup intervals
        this.#setupCleanupIntervals();

        // Initialize service health monitoring
        this.#initializeHealthMonitoring();
    }

    // ==================== AUTHENTICATION INTEGRATION METHODS ====================

    /**
     * Authenticate user with comprehensive strategy support
     * @param {Object} credentials - Authentication credentials
     * @param {string} strategy - Authentication strategy ('local', 'google', 'saml', etc.)
     * @param {Object} context - Request context (IP, user agent, etc.)
     * @param {Object} options - Authentication options
     * @returns {Promise<Object>} Authentication result with user data and session
     * @throws {AppError} If authentication fails
     */
    async authenticateUser(credentials, strategy = 'local', context = {}, options = {}) {
        const correlationId = context.correlationId || this.#generateCorrelationId();
        const startTime = Date.now();

        try {
            logger.info('User authentication initiated', {
                correlationId,
                strategy,
                email: credentials.email,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
            });

            // Rate limiting check
            await this.#checkAuthenticationRateLimit(credentials.email || credentials.username, context.ipAddress);

            // Strategy-specific authentication
            let authResult;

            switch (strategy) {
                case 'local':
                    authResult = await this.#authenticateLocal(credentials, context, options);
                    break;
                case 'google':
                case 'github':
                case 'linkedin':
                case 'microsoft':
                    authResult = await this.#authenticateOAuth(strategy, credentials, context, options);
                    break;
                case 'saml':
                case 'oidc':
                    authResult = await this.#authenticateSSO(strategy, credentials, context, options);
                    break;
                case 'ldap':
                    authResult = await this.#authenticateLDAP(credentials, context, options);
                    break;
                case 'jwt':
                    authResult = await this.#authenticateJWT(credentials, context, options);
                    break;
                default:
                    throw new ValidationError(`Unsupported authentication strategy: ${strategy}`, 'INVALID_STRATEGY');
            }

            // Post-authentication processing
            if (authResult.success) {
                await this.#postAuthenticationProcessing(authResult.user, strategy, context, authResult);
            }

            // Update user activity and session tracking
            if (authResult.user) {
                await this.#updateUserActivity(authResult.user._id, {
                    type: 'authentication',
                    strategy,
                    success: authResult.success,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    timestamp: new Date()
                });
            }

            const duration = Date.now() - startTime;
            logger.info('User authentication completed', {
                correlationId,
                strategy,
                success: authResult.success,
                userId: authResult.user?._id,
                duration
            });

            return {
                ...authResult,
                correlationId,
                strategy,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            // Record failed authentication attempt
            await this.#recordFailedAuthentication(credentials.email || credentials.username, strategy, context, error);

            logger.error('User authentication failed', {
                correlationId,
                strategy,
                error: error.message,
                duration
            });

            throw error;
        }
    }

    /**
     * Register new user with comprehensive validation and setup
     * @param {Object} userData - User registration data
     * @param {string} strategy - Registration strategy
     * @param {Object} context - Request context
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     * @throws {AppError} If registration fails
     */
    async registerUser(userData, strategy = 'local', context = {}, options = {}) {
        const correlationId = context.correlationId || this.#generateCorrelationId();

        try {
            logger.info('User registration initiated', {
                correlationId,
                strategy,
                email: userData.email,
                organizationId: userData.organizationId
            });

            // Validate registration data
            await this.#validateRegistrationData(userData, strategy);

            // Check subscription limits
            if (userData.organizationId) {
                await this.#checkSubscriptionLimits(userData.organizationId, 'users');
            }

            // Use auth service for registration
            const registrationResult = await this.#authService.register(userData, context);

            if (registrationResult.success) {
                // Create additional user records
                await this.#createUserAssociatedRecords(
                    registrationResult.user._id,
                    userData,
                    context.requesterId || 'system'
                );

                // Setup default organization membership if provided
                if (userData.organizationId && userData.roles) {
                    await this.addUserToOrganization(
                        registrationResult.user._id,
                        userData.organizationId,
                        userData.roles,
                        context.requesterId || 'system',
                        { autoAccept: true }
                    );
                }

                // Send post-registration notifications
                await this.#sendRegistrationNotifications(registrationResult.user, strategy, options);
            }

            logger.info('User registration completed', {
                correlationId,
                strategy,
                userId: registrationResult.user?._id,
                success: registrationResult.success
            });

            return {
                ...registrationResult,
                correlationId,
                strategy
            };

        } catch (error) {
            logger.error('User registration failed', {
                correlationId,
                strategy,
                email: userData.email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Logout user with comprehensive session cleanup
     * @param {string} sessionIdentifier - Session ID or access token
     * @param {Object} context - Request context
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logoutUser(sessionIdentifier, context = {}, options = {}) {
        const { allDevices = false, reason = 'user_request' } = options;

        try {
            // Use auth service for logout
            const logoutResult = await this.#authService.logout(sessionIdentifier, context, allDevices);

            // Additional cleanup for user service
            if (logoutResult.success) {
                await this.#performUserLogoutCleanup(sessionIdentifier, context, options);
            }

            return logoutResult;

        } catch (error) {
            logger.error('User logout failed', {
                sessionId: sessionIdentifier?.substring(0, 10) + '...',
                error: error.message
            });
            throw error;
        }
    }

    // ==================== USER MANAGEMENT METHODS ====================

    /**
     * Create a new user with comprehensive setup
     * @param {Object} userData - User data to create
     * @param {string} createdBy - ID of user creating this user
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created user object
     */
    async createUser(userData, createdBy, options = {}) {
        const session = options.session || null;

        try {
            // Validate user creation data
            await this.#validateUserCreationData(userData);

            // Check permissions
            if (createdBy !== 'system') {
                await this.#checkUserCreationPermissions(createdBy, userData);
            }

            // Check subscription limits
            if (userData.organizationId) {
                await this.#checkSubscriptionLimits(userData.organizationId, 'users');
            }

            // Check for duplicate users
            await this.#checkDuplicateUser(userData);

            // Enrich user data with defaults
            const enrichedData = await this.#enrichUserData(userData, createdBy);

            // Generate unique username if not provided
            if (!enrichedData.username) {
                enrichedData.username = await this.#generateUniqueUsername(enrichedData.email);
            }

            // Set initial account status
            enrichedData.accountStatus = {
                status: options.autoActivate ? 'active' : 'pending',
                statusHistory: [{
                    status: options.autoActivate ? 'active' : 'pending',
                    reason: 'Account created',
                    changedAt: new Date(),
                    changedBy: createdBy
                }]
            };

            // Setup authentication data
            if (enrichedData.password) {
                enrichedData.password = await this.#authService.passwordService.hashPassword(enrichedData.password);
            }

            // Create user
            const user = await UserModel.create([enrichedData], { session });
            const createdUser = user[0];

            // Create associated records
            await this.#createUserAssociatedRecords(createdUser._id, userData, createdBy, session);

            // Setup default MFA if required by organization
            if (await this.#isMFARequiredForUser(createdUser)) {
                await this.#setupDefaultMFA(createdUser._id, options);
            }

            // Send creation notifications
            if (!options.skipNotifications) {
                await this.#sendUserCreationNotifications(createdUser, createdBy);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_CREATED',
                entityType: 'user',
                entityId: createdUser._id,
                userId: createdBy,
                details: {
                    email: createdUser.email,
                    username: createdUser.username,
                    organizationId: userData.organizationId,
                    method: 'admin_creation'
                }
            });

            // Clear relevant caches
            await this.#clearUserCaches(userData.organizationId);

            logger.info('User created successfully', {
                userId: createdUser._id,
                email: createdUser.email,
                createdBy,
                autoActivate: options.autoActivate
            });

            return this.#sanitizeUserOutput(createdUser);

        } catch (error) {
            logger.error('Error creating user', {
                error: error.message,
                email: userData.email,
                createdBy
            });
            throw error;
        }
    }

    /**
     * Get user by ID with comprehensive data enrichment
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User object with enriched data
     */
    async getUserById(userId, options = {}) {
        const {
            populate = [],
            includeDeleted = false,
            checkPermissions = true,
            requesterId,
            organizationId,
            includeAuthData = false
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('user', userId, options);
            if (this.#serviceConfig.enableCaching) {
                const cached = await this.#cacheService.get(cacheKey);
                if (cached) {
                    return cached;
                }
            }

            // Build query
            const query = { _id: userId };
            if (!includeDeleted) query['accountStatus.status'] = { $ne: 'deleted' };
            if (organizationId) query['organizations.organizationId'] = organizationId;

            // Execute query with population
            let userQuery = UserModel.findOne(query);
            userQuery = this.#applyPopulation(userQuery, populate);

            const user = await userQuery.exec();

            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && requesterId) {
                await this.#checkUserAccess(user, requesterId, 'read');
            }

            // Enrich with authentication data if requested
            let enrichedUser = user.toObject();
            if (includeAuthData && requesterId === userId) {
                enrichedUser.authData = await this.#getAuthenticationData(userId);
            }

            // Enrich with calculated metrics
            enrichedUser = await this.#enrichUserWithMetrics(enrichedUser);

            // Enrich with security context
            enrichedUser.securityContext = await this.#getSecurityContext(userId, requesterId);

            // Cache result
            if (this.#serviceConfig.enableCaching) {
                await this.#cacheService.set(cacheKey, enrichedUser, this.#defaultCacheTTL);
            }

            return this.#sanitizeUserOutput(enrichedUser, requesterId === userId);

        } catch (error) {
            logger.error('Error fetching user', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Update user information with comprehensive validation
     * @param {string} userId - User ID to update
     * @param {Object} updateData - Data to update
     * @param {string} updatedBy - ID of user making the update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated user object
     */
    async updateUser(userId, updateData, updatedBy, options = {}) {
        const session = options.session || null;

        try {
            // Get existing user
            const existingUser = await UserModel.findById(userId);
            if (!existingUser) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check permissions
            await this.#checkUserAccess(existingUser, updatedBy, 'update');

            // Validate update data
            await this.#validateUserUpdateData(updateData, existingUser);

            // Check for conflicts
            await this.#checkUpdateConflicts(userId, updateData);

            // Process authentication-related updates
            const processedUpdate = await this.#processAuthenticationUpdates(updateData, existingUser, updatedBy);

            // Handle password updates
            if (processedUpdate.password) {
                processedUpdate.password = await this.#authService.passwordService.hashPassword(processedUpdate.password);
                processedUpdate.passwordChangedAt = new Date();

                // Add to password history
                if (!processedUpdate.passwordHistory) processedUpdate.passwordHistory = existingUser.passwordHistory || [];
                processedUpdate.passwordHistory.unshift({
                    hash: processedUpdate.password,
                    changedAt: new Date(),
                    changedBy: updatedBy,
                    reason: 'user_update'
                });
                processedUpdate.passwordHistory = processedUpdate.passwordHistory.slice(0, this.#serviceConfig.passwordPolicy.preventReuse);
            }

            // Handle email updates
            if (processedUpdate.email && processedUpdate.email !== existingUser.email) {
                processedUpdate.verification = {
                    ...existingUser.verification,
                    email: {
                        verified: false,
                        attempts: 0,
                        token: await this.#authService.tokenService.generateVerificationToken(),
                        tokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                    }
                };
            }

            // Update user
            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                {
                    ...processedUpdate,
                    lastModifiedAt: new Date(),
                    lastModifiedBy: updatedBy
                },
                { new: true, runValidators: true, session }
            );

            // Update related records
            await this.#updateRelatedRecords(userId, updateData, updatedBy, session);

            // Handle MFA updates
            if (updateData.mfa) {
                await this.#handleMFAUpdates(userId, updateData.mfa, updatedBy);
            }

            // Send notifications for significant changes
            await this.#sendUpdateNotifications(existingUser, updatedUser, updatedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_UPDATED',
                entityType: 'user',
                entityId: userId,
                userId: updatedBy,
                details: {
                    updatedFields: Object.keys(updateData),
                    changes: this.#calculateChanges(existingUser, updatedUser)
                }
            });

            // Clear caches
            await this.#clearUserCaches(updatedUser.organizations[0]?.organizationId, userId);

            logger.info('User updated successfully', {
                userId,
                updatedBy,
                fieldsUpdated: Object.keys(updateData)
            });

            return this.#sanitizeUserOutput(updatedUser);

        } catch (error) {
            logger.error('Error updating user', {
                error: error.message,
                userId,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Delete or deactivate user with comprehensive cleanup
     * @param {string} userId - User ID to delete
     * @param {string} deletedBy - ID of user performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<boolean>} Success status
     */
    async deleteUser(userId, deletedBy, options = {}) {
        const { hardDelete = false, reason, transferOwnership, gracePeriod = 30 } = options;
        const session = options.session || null;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check permissions
            await this.#checkUserAccess(user, deletedBy, 'delete');

            // Validate deletion constraints
            await this.#validateDeletionConstraints(user, options);

            // Terminate all user sessions
            await this.#authService.logout(user._id, { correlationId: this.#generateCorrelationId() }, true);

            // Revoke all authentication tokens
            await this.#revokeAllUserTokens(userId);

            if (hardDelete) {
                // Perform hard delete
                await this.#performHardDelete(userId, deletedBy, session);
            } else {
                // Perform soft delete with grace period
                await this.#performSoftDelete(userId, deletedBy, reason, gracePeriod, session);
            }

            // Transfer ownership if specified
            if (transferOwnership) {
                await this.#transferUserOwnership(userId, transferOwnership, deletedBy, session);
            }

            // Handle related data cleanup
            await this.#handleUserDeletionCleanup(userId, hardDelete, session);

            // Send notifications
            await this.#sendDeletionNotifications(user, deletedBy, hardDelete);

            // Log audit trail
            await this.#auditService.log({
                action: hardDelete ? 'USER_HARD_DELETED' : 'USER_SOFT_DELETED',
                entityType: 'user',
                entityId: userId,
                userId: deletedBy,
                details: {
                    reason,
                    transferOwnership,
                    gracePeriod: hardDelete ? null : gracePeriod
                }
            });

            // Clear caches
            await this.#clearUserCaches(user.organizations[0]?.organizationId, userId);

            logger.info('User deleted successfully', {
                userId,
                deletedBy,
                hardDelete,
                reason
            });

            return true;

        } catch (error) {
            logger.error('Error deleting user', {
                error: error.message,
                userId,
                deletedBy
            });
            throw error;
        }
    }

    // ==================== MULTI-FACTOR AUTHENTICATION METHODS ====================

    /**
     * Setup MFA for user using auth service
     * @param {string} userId - User ID
     * @param {string} method - MFA method ('totp', 'sms', 'email', 'webauthn', 'backup_codes')
     * @param {Object} options - MFA setup options
     * @returns {Promise<Object>} MFA setup result
     */
    async setupMFA(userId, method, options = {}) {
        try {
            // Check if MFA is allowed for user
            await this.#validateMFASetup(userId, method);

            // Use auth service for MFA setup
            const mfaResult = await this.#authService.setupAdvancedMFA(userId, method, options);

            // Update user MFA status
            await this.#updateUserMFAStatus(userId, method, 'setup_initiated');

            // Log MFA setup
            await this.#auditService.log({
                action: 'MFA_SETUP_INITIATED',
                entityType: 'user',
                entityId: userId,
                details: { method, options: Object.keys(options) }
            });

            return mfaResult;

        } catch (error) {
            logger.error('Error setting up MFA', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Complete MFA setup with verification
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} verificationCode - Verification code
     * @param {Object} options - Completion options
     * @returns {Promise<Object>} MFA completion result
     */
    async completeMFASetup(userId, method, verificationCode, options = {}) {
        try {
            // Use auth service for MFA completion
            const completionResult = await this.#authService.completeAdvancedMFASetup(
                userId,
                method,
                verificationCode,
                options
            );

            // Update user MFA status
            if (completionResult.success) {
                await this.#updateUserMFAStatus(userId, method, 'enabled');

                // Check if MFA is now fully compliant
                const mfaCompliance = await this.#checkMFACompliance(userId);
                if (mfaCompliance.compliant && !mfaCompliance.wasCompliant) {
                    await this.#handleMFAComplianceAchieved(userId);
                }
            }

            return completionResult;

        } catch (error) {
            logger.error('Error completing MFA setup', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Disable MFA method for user
     * @param {string} userId - User ID
     * @param {string} method - MFA method to disable
     * @param {string} disabledBy - ID of user disabling MFA
     * @param {Object} options - Disable options
     * @returns {Promise<Object>} Disable result
     */
    async disableMFA(userId, method, disabledBy, options = {}) {
        try {
            // Check permissions
            if (userId !== disabledBy) {
                const user = await UserModel.findById(userId);
                await this.#checkUserAccess(user, disabledBy, 'update');
            }

            // Validate MFA disable request
            await this.#validateMFADisable(userId, method, disabledBy);

            // Disable MFA method
            const user = await UserModel.findById(userId);
            if (user.mfa?.methods) {
                const methodIndex = user.mfa.methods.findIndex(m => m.type === method);
                if (methodIndex !== -1) {
                    user.mfa.methods[methodIndex].enabled = false;
                    user.mfa.methods[methodIndex].disabledAt = new Date();
                    user.mfa.methods[methodIndex].disabledBy = disabledBy;
                    user.mfa.methods[methodIndex].disableReason = options.reason || 'User requested';

                    await user.save();
                }
            }

            // Check if user is still MFA compliant
            const mfaCompliance = await this.#checkMFACompliance(userId);
            if (!mfaCompliance.compliant && mfaCompliance.required) {
                await this.#handleMFAComplianceLoss(userId);
            }

            // Log MFA disable
            await this.#auditService.log({
                action: 'MFA_DISABLED',
                entityType: 'user',
                entityId: userId,
                userId: disabledBy,
                details: { method, reason: options.reason }
            });

            return {
                success: true,
                method,
                compliance: mfaCompliance
            };

        } catch (error) {
            logger.error('Error disabling MFA', {
                error: error.message,
                userId,
                method,
                disabledBy
            });
            throw error;
        }
    }

    // ==================== ORGANIZATION MANAGEMENT METHODS ====================

    /**
     * Add user to organization with role assignment
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {Array} roles - Roles to assign
     * @param {string} assignedBy - ID of user performing assignment
     * @param {Object} options - Assignment options
     * @returns {Promise<Object>} Updated user organization membership
     */
    async addUserToOrganization(userId, organizationId, roles = ['member'], assignedBy, options = {}) {
        const { invitedBy, startDate, permissions = [], autoAccept = false } = options;
        const session = options.session || null;

        try {
            // Validate organization and roles
            await this.#validateOrganizationRoles(organizationId, roles, assignedBy);

            // Check organization user limits
            await this.#checkSubscriptionLimits(organizationId, 'users');

            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check if user already belongs to organization
            const existingMembership = user.organizations.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (existingMembership) {
                throw new ConflictError('User already belongs to this organization', 'USER_ALREADY_MEMBER');
            }

            // Create organization membership
            const membership = {
                organizationId,
                roles: roles.map(roleName => ({
                    roleId: null, // Would be populated with actual role ID
                    roleName,
                    scope: 'organization',
                    assignedAt: startDate || new Date(),
                    assignedBy,
                    status: autoAccept ? 'active' : 'pending'
                })),
                joinedAt: autoAccept ? new Date() : null,
                status: autoAccept ? 'active' : 'pending',
                invitedBy: invitedBy || assignedBy,
                invitedAt: new Date()
            };

            // Add permissions if provided
            if (permissions.length > 0) {
                membership.permissions = permissions.map(permission => ({
                    permissionId: permission.id,
                    resource: permission.resource,
                    actions: permission.actions,
                    grantedAt: new Date(),
                    grantedBy: assignedBy
                }));
            }

            user.organizations.push(membership);
            await user.save({ session });

            // Handle MFA requirements for organization
            const orgMFARequired = await this.#isOrganizationMFARequired(organizationId);
            if (orgMFARequired && !user.mfa?.enabled) {
                await this.#initiateMFASetupForUser(userId, {
                    reason: 'organization_requirement',
                    gracePeriod: this.#serviceConfig.mfaPolicy.gracePeriod
                });
            }

            // Send notifications
            await this.#sendOrganizationAdditionNotifications(user, organizationId, assignedBy, autoAccept);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_ADDED_TO_ORGANIZATION',
                entityType: 'user',
                entityId: userId,
                userId: assignedBy,
                details: {
                    organizationId,
                    roles,
                    permissions: permissions.length,
                    autoAccept
                }
            });

            // Clear caches
            await this.#clearUserCaches(organizationId, userId);

            logger.info('User added to organization', {
                userId,
                organizationId,
                roles,
                assignedBy,
                autoAccept
            });

            return membership;

        } catch (error) {
            logger.error('Error adding user to organization', {
                error: error.message,
                userId,
                organizationId,
                assignedBy
            });
            throw error;
        }
    }

    /**
     * Remove user from organization with ownership transfer
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {string} removedBy - ID of user performing removal
     * @param {Object} options - Removal options
     * @returns {Promise<boolean>} Success status
     */
    async removeUserFromOrganization(userId, organizationId, removedBy, options = {}) {
        const { transferOwnership, reason, gracePeriod = 0 } = options;
        const session = options.session || null;

        try {
            // Validate removal permissions
            await this.#validateOrganizationRemoval(userId, organizationId, removedBy);

            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Find organization membership
            const membershipIndex = user.organizations.findIndex(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (membershipIndex === -1) {
                throw new NotFoundError('User not member of organization', 'NOT_ORGANIZATION_MEMBER');
            }

            // Handle ownership transfer if needed
            if (transferOwnership) {
                await this.#transferOrganizationOwnership(
                    userId,
                    organizationId,
                    transferOwnership,
                    removedBy,
                    session
                );
            }

            // Remove organization membership
            if (gracePeriod > 0) {
                // Soft removal with grace period
                user.organizations[membershipIndex].status = 'pending_removal';
                user.organizations[membershipIndex].removalScheduledAt = new Date(Date.now() + (gracePeriod * 24 * 60 * 60 * 1000));
                user.organizations[membershipIndex].removedBy = removedBy;
                user.organizations[membershipIndex].removalReason = reason;
            } else {
                // Immediate removal
                user.organizations.splice(membershipIndex, 1);
            }

            await user.save({ session });

            // Revoke organization-specific sessions
            await this.#revokeOrganizationSessions(userId, organizationId);

            // Send notifications
            await this.#sendOrganizationRemovalNotifications(user, organizationId, removedBy, reason);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_REMOVED_FROM_ORGANIZATION',
                entityType: 'user',
                entityId: userId,
                userId: removedBy,
                details: {
                    organizationId,
                    reason,
                    transferOwnership,
                    gracePeriod
                }
            });

            // Clear caches
            await this.#clearUserCaches(organizationId, userId);

            logger.info('User removed from organization', {
                userId,
                organizationId,
                removedBy,
                reason
            });

            return true;

        } catch (error) {
            logger.error('Error removing user from organization', {
                error: error.message,
                userId,
                organizationId,
                removedBy
            });
            throw error;
        }
    }

    // ==================== SEARCH AND ANALYTICS METHODS ====================

    /**
     * Search users with advanced filtering and authentication context
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results with pagination and analytics
     */
    async searchUsers(searchParams, options = {}) {
        const {
            limit = 20,
            offset = 0,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            includeDeleted = false,
            requesterId,
            organizationId,
            includeMetrics = false
        } = options;

        try {
            // Generate search ID for tracking
            const searchId = crypto.randomUUID();
            this.#activeSearchQueries.add(searchId);

            // Check search permissions
            if (requesterId) {
                await this.#checkSearchPermissions(requesterId, searchParams, organizationId);
            }

            // Build search query with authentication context
            const query = await this.#buildSearchQuery(searchParams, {
                includeDeleted,
                organizationId,
                requesterId
            });

            // Add security filters
            query['accountStatus.status'] = query['accountStatus.status'] || { $nin: ['suspended', 'banned'] };

            // Execute search with aggregation pipeline
            const pipeline = [
                { $match: query },
                { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },
                {
                    $facet: {
                        users: [
                            { $skip: offset },
                            { $limit: limit },
                            {
                                $lookup: {
                                    from: 'organizations',
                                    localField: 'organizations.organizationId',
                                    foreignField: '_id',
                                    as: 'organizationDetails'
                                }
                            }
                        ],
                        totalCount: [{ $count: 'count' }],
                        aggregations: [
                            {
                                $group: {
                                    _id: null,
                                    statusBreakdown: { $push: '$accountStatus.status' },
                                    roleBreakdown: { $push: '$organizations.roles.roleName' },
                                    mfaBreakdown: { $push: '$mfa.enabled' },
                                    verificationBreakdown: { $push: '$verification.email.verified' }
                                }
                            }
                        ]
                    }
                }
            ];

            const results = await UserModel.aggregate(pipeline);
            const searchResult = results[0];

            // Process and sanitize results
            const users = await Promise.all(
                searchResult.users.map(async user => {
                    if (includeMetrics) {
                        user = await this.#enrichUserWithMetrics(user);
                    }
                    return this.#sanitizeUserOutput(user, false);
                })
            );

            const totalCount = searchResult.totalCount[0]?.count || 0;
            const aggregations = this.#processSearchAggregations(searchResult.aggregations[0]);

            // Calculate pagination info
            const hasMore = offset + limit < totalCount;
            const totalPages = Math.ceil(totalCount / limit);
            const currentPage = Math.floor(offset / limit) + 1;

            // Clean up search tracking
            this.#activeSearchQueries.delete(searchId);

            // Log search activity
            await this.#auditService.log({
                action: 'USER_SEARCH',
                entityType: 'user',
                userId: requesterId,
                details: {
                    searchParams,
                    totalResults: totalCount,
                    searchId
                }
            });

            return {
                users,
                pagination: {
                    totalCount,
                    totalPages,
                    currentPage,
                    hasMore,
                    limit,
                    offset
                },
                aggregations,
                searchId,
                metadata: {
                    searchDuration: Date.now() - searchId,
                    totalActiveUsers: aggregations.statusBreakdown?.active || 0,
                    mfaEnabledCount: aggregations.mfaBreakdown?.true || 0
                }
            };

        } catch (error) {
            logger.error('Error searching users', {
                error: error.message,
                searchParams,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Get comprehensive user analytics with security metrics
     * @param {Object} params - Analytics parameters
     * @param {string} requesterId - ID of user requesting analytics
     * @returns {Promise<Object>} User analytics data with security insights
     */
    async getUserAnalytics(params = {}, requesterId) {
        const { organizationId, timeRange, includeSecurityMetrics = false } = params;

        try {
            // Check analytics permissions
            await this.#checkAnalyticsPermissions(requesterId, organizationId);

            // Check cache for analytics
            const cacheKey = this.#generateCacheKey('analytics', 'users', params);
            if (this.#serviceConfig.enableCaching) {
                const cached = await this.#cacheService.get(cacheKey);
                if (cached) {
                    return cached;
                }
            }

            // Build analytics pipeline with security context
            const pipeline = await this.#buildAnalyticsPipeline({
                organizationId,
                timeRange,
                includeSecurityMetrics
            });

            // Execute analytics query
            const analyticsData = await UserModel.aggregate(pipeline);

            // Process analytics results
            const processedAnalytics = this.#processAnalyticsData(analyticsData[0]);

            // Add authentication metrics
            processedAnalytics.authenticationMetrics = await this.#getAuthenticationMetrics(params);

            // Add security metrics if requested
            if (includeSecurityMetrics) {
                processedAnalytics.securityMetrics = await this.#getSecurityMetrics(params);
            }

            // Add calculated metrics
            processedAnalytics.calculatedMetrics = await this.#calculateAdvancedUserMetrics(params);

            // Cache results
            if (this.#serviceConfig.enableCaching) {
                await this.#cacheService.set(cacheKey, processedAnalytics, 1800); // 30 minutes
            }

            // Log analytics request
            await this.#auditService.log({
                action: 'USER_ANALYTICS_ACCESSED',
                entityType: 'user',
                userId: requesterId,
                details: {
                    organizationId,
                    timeRange,
                    includeSecurityMetrics
                }
            });

            return processedAnalytics;

        } catch (error) {
            logger.error('Error generating user analytics', {
                error: error.message,
                params,
                requesterId
            });
            throw error;
        }
    }

    // ==================== SECURITY AND COMPLIANCE METHODS ====================

    /**
     * Perform security assessment for user
     * @param {string} userId - User ID to assess
     * @param {string} requesterId - ID of user requesting assessment
     * @param {Object} options - Assessment options
     * @returns {Promise<Object>} Security assessment report
     */
    async performUserSecurityAssessment(userId, requesterId, options = {}) {
        try {
            // Check permissions for security assessment
            await this.#checkSecurityAssessmentPermissions(requesterId, userId);

            // Use auth service for comprehensive security assessment
            const securityAssessment = await this.#authService.performSecurityAssessment(userId, options);

            // Add user-specific security metrics
            const userSecurityMetrics = await this.#getUserSecurityMetrics(userId);

            // Combine assessments
            const combinedAssessment = {
                ...securityAssessment,
                userMetrics: userSecurityMetrics,
                complianceStatus: await this.#checkUserCompliance(userId),
                recommendations: await this.#generateSecurityRecommendations(userId, securityAssessment)
            };

            // Log security assessment
            await this.#auditService.log({
                action: 'SECURITY_ASSESSMENT_PERFORMED',
                entityType: 'user',
                entityId: userId,
                userId: requesterId,
                details: {
                    overallScore: combinedAssessment.overallScore,
                    securityLevel: combinedAssessment.securityLevel
                }
            });

            return combinedAssessment;

        } catch (error) {
            logger.error('Error performing security assessment', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Get user activity timeline with authentication events
     * @param {string} userId - User ID
     * @param {Object} options - Timeline options
     * @returns {Promise<Array>} Comprehensive activity timeline
     */
    async getUserActivityTimeline(userId, options = {}) {
        const { limit = 50, startDate, endDate, includeAuthEvents = true } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('timeline', userId, options);
            if (this.#serviceConfig.enableCaching) {
                const cached = await this.#cacheService.get(cacheKey);
                if (cached) {
                    return cached;
                }
            }

            // Build comprehensive timeline
            const timelineEvents = [];

            // Get user activity events
            const userEvents = await this.#getUserActivityEvents(userId, { startDate, endDate, limit });
            timelineEvents.push(...userEvents);

            // Get authentication events if requested
            if (includeAuthEvents) {
                const authEvents = await this.#getAuthenticationEvents(userId, { startDate, endDate, limit });
                timelineEvents.push(...authEvents);
            }

            // Sort and process events
            const sortedEvents = timelineEvents
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);

            const processedTimeline = await this.#processTimelineEvents(sortedEvents);

            // Cache result
            if (this.#serviceConfig.enableCaching) {
                await this.#cacheService.set(cacheKey, processedTimeline, 1800); // 30 minutes
            }

            return processedTimeline;

        } catch (error) {
            logger.error('Error fetching user activity timeline', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // ==================== PRIVATE AUTHENTICATION METHODS ====================

    /**
     * Initialize Passport strategies
     * @private
     */
    #initializePassportStrategies() {
        logger.info('Initializing Passport authentication strategies');

        // Local Strategy
        if (this.#strategyConfigs.local.enabled) {
            const localStrategy = new LocalAuthStrategy(this.#serviceConfig, {
                authService: this.#authService,
                userService: this
            });
            passport.use('local', localStrategy);
            this.#passportStrategies.set('local', localStrategy);
        }

        // OAuth Strategies
        if (this.#strategyConfigs.google.enabled) {
            const googleStrategy = new GoogleAuthStrategy(this.#serviceConfig.oauth?.google, {
                authService: this.#authService
            });
            passport.use('google', googleStrategy);
            this.#passportStrategies.set('google', googleStrategy);
        }

        if (this.#strategyConfigs.github.enabled) {
            const githubStrategy = new GitHubAuthStrategy(this.#serviceConfig.oauth?.github, {
                authService: this.#authService
            });
            passport.use('github', githubStrategy);
            this.#passportStrategies.set('github', githubStrategy);
        }

        if (this.#strategyConfigs.linkedin.enabled) {
            const linkedinStrategy = new LinkedInAuthStrategy(this.#serviceConfig.oauth?.linkedin, {
                authService: this.#authService
            });
            passport.use('linkedin', linkedinStrategy);
            this.#passportStrategies.set('linkedin', linkedinStrategy);
        }

        if (this.#strategyConfigs.microsoft.enabled) {
            const microsoftStrategy = new MicrosoftAuthStrategy(this.#serviceConfig.oauth?.microsoft, {
                authService: this.#authService
            });
            passport.use('microsoft', microsoftStrategy);
            this.#passportStrategies.set('microsoft', microsoftStrategy);
        }

        // SSO Strategies
        if (this.#strategyConfigs.saml.enabled) {
            const samlStrategy = new SAMLAuthStrategy(this.#serviceConfig.sso?.saml, {
                authService: this.#authService
            });
            passport.use('saml', samlStrategy);
            this.#passportStrategies.set('saml', samlStrategy);
        }

        if (this.#strategyConfigs.oidc.enabled) {
            const oidcStrategy = new OIDCAuthStrategy(this.#serviceConfig.sso?.oidc, {
                authService: this.#authService
            });
            passport.use('oidc', oidcStrategy);
            this.#passportStrategies.set('oidc', oidcStrategy);
        }

        // Enterprise Strategies
        if (this.#strategyConfigs.ldap.enabled) {
            const ldapStrategy = new LDAPAuthStrategy(this.#serviceConfig.ldap, {
                authService: this.#authService
            });
            passport.use('ldap', ldapStrategy);
            this.#passportStrategies.set('ldap', ldapStrategy);
        }

        // JWT Strategy (always enabled)
        if (this.#strategyConfigs.jwt.enabled) {
            const jwtStrategy = new JWTAuthStrategy(this.#serviceConfig.jwt, {
                authService: this.#authService
            });
            passport.use('jwt', jwtStrategy);
            this.#passportStrategies.set('jwt', jwtStrategy);
        }

        logger.info('Passport strategies initialized', {
            strategies: Array.from(this.#passportStrategies.keys())
        });
    }

    /**
     * Authenticate using local strategy
     * @private
     */
    async #authenticateLocal(credentials, context, options) {
        return new Promise((resolve, reject) => {
            passport.authenticate('local', { session: false }, async (err, user, info) => {
                if (err) {
                    return reject(err);
                }

                if (!user) {
                    return reject(new AppError(info?.message || 'Authentication failed', 401, 'AUTHENTICATION_FAILED'));
                }

                try {
                    // Use auth service for additional validation and session creation
                    const authResult = await this.#authService.authenticate(credentials, context, options);
                    resolve(authResult);
                } catch (error) {
                    reject(error);
                }
            })(null, { body: credentials });
        });
    }

    /**
     * Authenticate using OAuth strategy
     * @private
     */
    async #authenticateOAuth(strategy, credentials, context, options) {
        try {
            // Use auth service OAuth authentication
            const authResult = await this.#authService.authenticateWithOAuth(
                strategy,
                credentials.code,
                context,
                options
            );

            return authResult;

        } catch (error) {
            logger.error('OAuth authentication failed', {
                strategy,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Authenticate using SSO strategy
     * @private
     */
    async #authenticateSSO(strategy, credentials, context, options) {
        try {
            // Use auth service SSO authentication
            const authResult = await this.#authService.authenticateWithSSO(
                strategy,
                credentials.ssoResponse,
                context,
                options
            );

            return authResult;

        } catch (error) {
            logger.error('SSO authentication failed', {
                strategy,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Authenticate using LDAP strategy
     * @private
     */
    async #authenticateLDAP(credentials, context, options) {
        return new Promise((resolve, reject) => {
            passport.authenticate('ldap', { session: false }, async (err, user, info) => {
                if (err) {
                    return reject(err);
                }

                if (!user) {
                    return reject(new AppError(info?.message || 'LDAP authentication failed', 401, 'LDAP_AUTH_FAILED'));
                }

                try {
                    // Create or update user from LDAP data
                    const authResult = await this.#handleLDAPUser(user, context, options);
                    resolve(authResult);
                } catch (error) {
                    reject(error);
                }
            })(null, { body: credentials });
        });
    }

    /**
     * Authenticate using JWT strategy
     * @private
     */
    async #authenticateJWT(credentials, context, options) {
        try {
            // Validate JWT token using auth service
            const validationResult = await this.#authService.validateSession(credentials.token, options);

            if (!validationResult.valid) {
                throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
            }

            return {
                success: true,
                user: validationResult.user,
                session: validationResult.session,
                method: 'jwt'
            };

        } catch (error) {
            logger.error('JWT authentication failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Handle LDAP user authentication and provisioning
     * @private
     */
    async #handleLDAPUser(ldapUser, context, options) {
        try {
            // Find or create user from LDAP data
            let user = await UserModel.findOne({
                $or: [
                    { email: ldapUser.mail },
                    { 'ldap.dn': ldapUser.dn }
                ]
            });

            if (!user) {
                // Create new user from LDAP data
                user = await this.#createUserFromLDAP(ldapUser, context);
            } else {
                // Update existing user with LDAP data
                await this.#updateUserFromLDAP(user, ldapUser);
            }

            // Generate session using auth service
            const tokens = await this.#authService.generateAuthTokens(user);
            const session = await this.#authService.createSession(user, context, tokens, {
                authMethod: 'ldap',
                ldapData: ldapUser
            });

            return {
                success: true,
                user: this.#sanitizeUserOutput(user),
                tokens,
                session: {
                    id: session._id,
                    sessionId: session.sessionId,
                    expiresAt: session.expiresAt
                },
                method: 'ldap'
            };

        } catch (error) {
            logger.error('LDAP user handling failed', {
                error: error.message,
                ldapDN: ldapUser.dn
            });
            throw error;
        }
    }

    /**
     * Create user from LDAP data
     * @private
     */
    async #createUserFromLDAP(ldapUser, context) {
        const userData = {
            email: ldapUser.mail,
            username: ldapUser.sAMAccountName || ldapUser.uid,
            profile: {
                firstName: ldapUser.givenName,
                lastName: ldapUser.sn,
                displayName: ldapUser.displayName || ldapUser.cn,
                title: ldapUser.title,
                department: ldapUser.department
            },
            ldap: {
                dn: ldapUser.dn,
                objectGUID: ldapUser.objectGUID,
                lastSync: new Date()
            },
            verification: {
                email: { verified: true, verifiedAt: new Date() }
            },
            accountStatus: {
                status: 'active',
                statusHistory: [{
                    status: 'active',
                    reason: 'LDAP provisioning',
                    changedAt: new Date(),
                    changedBy: 'system'
                }]
            },
            metadata: {
                source: 'ldap',
                provisioned: true
            }
        };

        return await UserModel.create(userData);
    }

    /**
     * Update user from LDAP data
     * @private
     */
    async #updateUserFromLDAP(user, ldapUser) {
        user.profile.firstName = ldapUser.givenName || user.profile.firstName;
        user.profile.lastName = ldapUser.sn || user.profile.lastName;
        user.profile.displayName = ldapUser.displayName || ldapUser.cn || user.profile.displayName;
        user.profile.title = ldapUser.title || user.profile.title;
        user.profile.department = ldapUser.department || user.profile.department;

        if (user.ldap) {
            user.ldap.lastSync = new Date();
        }

        await user.save();
        return user;
    }

    /**
     * Check authentication rate limiting
     * @private
     */
    async #checkAuthenticationRateLimit(identifier, ipAddress) {
        const identifierKey = `auth_rate_limit:${identifier}`;
        const ipKey = `auth_rate_limit:ip:${ipAddress}`;

        const [identifierAttempts, ipAttempts] = await Promise.all([
            this.#cacheService.get(identifierKey) || 0,
            this.#cacheService.get(ipKey) || 0
        ]);

        const maxAttempts = this.#serviceConfig.security?.rateLimitMaxAttempts || 5;
        const window = this.#serviceConfig.security?.rateLimitWindow || 900000; // 15 minutes

        if (identifierAttempts >= maxAttempts) {
            throw new AppError(
                'Too many authentication attempts for this account',
                429,
                'RATE_LIMIT_EXCEEDED'
            );
        }

        if (ipAttempts >= maxAttempts * 3) {
            throw new AppError(
                'Too many authentication attempts from this IP',
                429,
                'IP_RATE_LIMIT_EXCEEDED'
            );
        }

        // Increment counters
        await Promise.all([
            this.#cacheService.set(identifierKey, identifierAttempts + 1, window / 1000),
            this.#cacheService.set(ipKey, ipAttempts + 1, window / 1000)
        ]);
    }

    /**
     * Record failed authentication attempt
     * @private
     */
    async #recordFailedAuthentication(identifier, strategy, context, error) {
        try {
            const attemptKey = `${identifier}:${context.ipAddress}`;
            const attempts = this.#authenticationAttempts.get(attemptKey) || 0;
            this.#authenticationAttempts.set(attemptKey, attempts + 1);

            // Log failed attempt
            await this.#auditService.log({
                action: 'AUTHENTICATION_FAILED',
                entityType: 'user',
                details: {
                    identifier,
                    strategy,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    error: error.message,
                    attemptCount: attempts + 1
                }
            });

            // Clean up old attempts
            setTimeout(() => {
                this.#authenticationAttempts.delete(attemptKey);
            }, 900000); // 15 minutes

        } catch (logError) {
            logger.warn('Failed to record authentication attempt', {
                error: logError.message,
                identifier,
                strategy
            });
        }
    }

    /**
     * Post-authentication processing
     * @private
     */
    async #postAuthenticationProcessing(user, strategy, context, authResult) {
        try {
            // Update last login information
            await UserModel.findByIdAndUpdate(user._id, {
                'activity.lastLoginAt': new Date(),
                'activity.lastLoginIP': context.ipAddress,
                'activity.loginCount': { $inc: 1 },
                'activity.lastLoginMethod': strategy
            });

            // Clear failed authentication attempts
            const attemptKey = `${user.email}:${context.ipAddress}`;
            this.#authenticationAttempts.delete(attemptKey);

            // Check for security alerts
            if (authResult.security?.riskScore > 75) {
                await this.#handleHighRiskAuthentication(user, context, authResult);
            }

            // Update user metrics cache
            this.#userMetricsCache.delete(`metrics:${user._id}`);

        } catch (error) {
            logger.warn('Post-authentication processing failed', {
                error: error.message,
                userId: user._id,
                strategy
            });
        }
    }

    /**
     * Handle high-risk authentication
     * @private
     */
    async #handleHighRiskAuthentication(user, context, authResult) {
        try {
            // Send security alert
            await this.#emailService.sendSecurityAlert(user.email, {
                riskScore: authResult.security.riskScore,
                riskFactors: authResult.security.riskFactors,
                location: context.location,
                timestamp: new Date()
            });

            // Require additional verification if configured
            if (this.#serviceConfig.security?.requireAdditionalVerificationOnHighRisk) {
                // This would trigger additional verification steps
                logger.info('High-risk authentication detected, additional verification required', {
                    userId: user._id,
                    riskScore: authResult.security.riskScore
                });
            }

        } catch (error) {
            logger.warn('Failed to handle high-risk authentication', {
                error: error.message,
                userId: user._id
            });
        }
    }

    // ==================== PRIVATE UTILITY METHODS ====================

    /**
     * Setup cleanup intervals for maintenance tasks
     * @private
     */
    #setupCleanupIntervals() {
        // Clean expired metrics cache every hour
        setInterval(() => {
            this.#userMetricsCache.clear();
        }, 3600000);

        // Clean up authentication attempts every 30 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.#authenticationAttempts) {
                if (now - timestamp > 900000) { // 15 minutes
                    this.#authenticationAttempts.delete(key);
                }
            }
        }, 1800000);

        // Clean up active search queries every 5 minutes
        setInterval(() => {
            if (this.#activeSearchQueries.size > 100) {
                this.#activeSearchQueries.clear();
            }
        }, 300000);

        // Clean up pending transactions every 10 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [transactionId, transaction] of this.#pendingTransactions) {
                if (now - transaction.startTime > 600000) { // 10 minutes
                    this.#pendingTransactions.delete(transactionId);
                }
            }
        }, 600000);
    }

    /**
     * Initialize health monitoring
     * @private
     */
    #initializeHealthMonitoring() {
        // Set up health check intervals
        setInterval(async () => {
            try {
                const health = await this.getServiceHealth();
                if (!health.healthy) {
                    logger.warn('UserService health check failed', health);
                }
            } catch (error) {
                logger.error('Health monitoring error', { error: error.message });
            }
        }, 300000); // 5 minutes
    }

    /**
     * Generate correlation ID for request tracking
     * @private
     */
    #generateCorrelationId() {
        return `user_svc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate cache key for user-related data
     * @private
     */
    #generateCacheKey(type, identifier, options = {}) {
        const baseKey = `user:${type}:${identifier}`;

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
     * Clear user-related caches
     * @private
     */
    async #clearUserCaches(organizationId, userId = null) {
        if (!this.#serviceConfig.enableCaching) return;

        const patterns = [
            'user:analytics:*',
            `user:org:${organizationId}:*`
        ];

        if (userId) {
            patterns.push(`user:user:${userId}:*`);
            patterns.push(`user:timeline:${userId}:*`);
            patterns.push(`user:metrics:${userId}:*`);
        }

        for (const pattern of patterns) {
            try {
                await this.#cacheService.deletePattern(pattern);
            } catch (error) {
                logger.warn('Failed to clear cache pattern', { pattern, error: error.message });
            }
        }
    }

    /**
     * Sanitize user output by removing sensitive fields
     * @private
     */
    #sanitizeUserOutput(user, includePersonalData = false) {
        const sanitized = { ...user };

        // Always remove these sensitive fields
        delete sanitized.password;
        delete sanitized.passwordHistory;
        delete sanitized.security?.passwordReset;
        delete sanitized.security?.securityQuestions;
        delete sanitized.verification?.email?.token;
        delete sanitized.verification?.phone?.token;

        // Remove MFA secrets
        if (sanitized.mfa?.methods) {
            sanitized.mfa.methods.forEach(method => {
                delete method.secret;
                delete method.privateKey;
            });
        }

        // Remove API keys
        if (sanitized.apiAccess?.keys) {
            sanitized.apiAccess.keys.forEach(key => {
                delete key.key;
                key.key = '***';
            });
        }

        // Remove personal data if not authorized
        if (!includePersonalData) {
            if (sanitized.ldap) {
                delete sanitized.ldap.objectGUID;
            }
            if (sanitized.oauth) {
                sanitized.oauth.forEach(provider => {
                    delete provider.accessToken;
                    delete provider.refreshToken;
                });
            }
        }

        return sanitized;
    }

    /**
     * Validate user creation permissions
     * @private
     */
    async #checkUserCreationPermissions(createdBy, userData) {
        const creator = await UserModel.findById(createdBy);
        if (!creator) {
            throw new ForbiddenError('Creator not found', 'CREATOR_NOT_FOUND');
        }

        // Check if creator has permission to create users in the specified organization
        if (userData.organizationId) {
            const orgMembership = creator.organizations.find(
                org => org.organizationId.toString() === userData.organizationId.toString()
            );

            if (!orgMembership) {
                throw new ForbiddenError('No access to specified organization', 'NO_ORGANIZATION_ACCESS');
            }

            const hasAdminRole = orgMembership.roles.some(role =>
                ['admin', 'super_admin', 'organization_admin'].includes(role.roleName)
            );

            if (!hasAdminRole) {
                throw new ForbiddenError('Insufficient permissions to create users', 'INSUFFICIENT_PERMISSIONS');
            }
        }
    }

    /**
     * Check if MFA is required for user based on organization policies
     * @private
     */
    async #isMFARequiredForUser(user) {
        if (this.#serviceConfig.mfaPolicy.required) {
            return true;
        }

        // Check organization-specific MFA requirements
        for (const org of user.organizations) {
            const orgSubscription = await this.#getOrganizationSubscription(org.organizationId);
            if (this.#subscriptionLimits[orgSubscription]?.mfaRequired) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get organization subscription level
     * @private
     */
    async #getOrganizationSubscription(organizationId) {
        // This would integrate with organization/subscription service
        // For now, return a default value
        return 'professional';
    }

    // Additional helper methods for comprehensive functionality...
    // [The implementation continues with more private methods for handling
    // all the enterprise features mentioned in the class]

    /**
     * Get service health status
     * @returns {Promise<Object>} Health status
     */
    async getServiceHealth() {
        try {
            const checks = await Promise.all([
                this.#authService.getHealthStatus?.() || { healthy: true, service: 'AuthService' },
                this.#cacheService.getHealthStatus?.() || { healthy: true, service: 'CacheService' },
                this.#emailService.getHealthStatus?.() || { healthy: true, service: 'EmailService' }
            ]);

            const unhealthyChecks = checks.filter(check => !check.healthy);
            const healthy = unhealthyChecks.length === 0;

            return {
                healthy,
                service: 'UserService',
                timestamp: new Date(),
                version: '2.0.0',
                dependencies: {
                    authService: checks[0],
                    cacheService: checks[1],
                    emailService: checks[2]
                },
                metrics: {
                    activeUsers: await UserModel.countDocuments({ 'accountStatus.status': 'active' }),
                    pendingUsers: await UserModel.countDocuments({ 'accountStatus.status': 'pending' }),
                    activeSearchQueries: this.#activeSearchQueries.size,
                    cachedMetrics: this.#userMetricsCache.size,
                    passportStrategies: this.#passportStrategies.size
                },
                configuration: {
                    cachingEnabled: this.#serviceConfig.enableCaching,
                    auditEnabled: this.#serviceConfig.enableAuditLogging,
                    mfaEnabled: this.#serviceConfig.enableMFA,
                    ssoEnabled: this.#serviceConfig.enableSSOIntegration
                }
            };

        } catch (error) {
            logger.error('User service health check failed', { error: error.message });

            return {
                healthy: false,
                service: 'UserService',
                timestamp: new Date(),
                error: error.message
            };
        }
    }

    // ==================== PRIVATE USER MANAGEMENT METHODS ====================

    /**
     * Validate user registration data
     * @private
     */
    async #validateRegistrationData(userData, strategy) {
        if (!userData.email) {
            throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
        }

        if (!userData.profile?.firstName) {
            throw new ValidationError('First name is required', 'FIRSTNAME_REQUIRED');
        }

        if (!userData.profile?.lastName) {
            throw new ValidationError('Last name is required', 'LASTNAME_REQUIRED');
        }

        // Strategy-specific validation
        if (strategy === 'local' && !userData.password) {
            throw new ValidationError('Password is required for local registration', 'PASSWORD_REQUIRED');
        }

        if (userData.password && userData.password.length < this.#serviceConfig.passwordPolicy.minLength) {
            throw new ValidationError(
                `Password must be at least ${this.#serviceConfig.passwordPolicy.minLength} characters`,
                'PASSWORD_TOO_SHORT'
            );
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
        }

        // Phone number validation if provided
        if (userData.phoneNumber) {
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            if (!phoneRegex.test(userData.phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
                throw new ValidationError('Invalid phone number format', 'INVALID_PHONE');
            }
        }
    }

    /**
     * Send registration notifications
     * @private
     */
    async #sendRegistrationNotifications(user, strategy, options) {
        try {
            if (!options.skipWelcomeEmail) {
                await this.#emailService.sendWelcomeEmail(user.email, {
                    firstName: user.profile.firstName,
                    strategy,
                    verificationRequired: !user.verification?.email?.verified
                });
            }

            if (options.notifyAdmins) {
                await this.#notificationService.sendNotification({
                    type: 'USER_REGISTERED',
                    recipients: options.adminIds || [],
                    data: {
                        userId: user._id,
                        email: user.email,
                        strategy,
                        timestamp: new Date()
                    }
                });
            }

        } catch (error) {
            logger.warn('Failed to send registration notifications', {
                userId: user._id,
                error: error.message
            });
        }
    }

    /**
     * Validate user creation data
     * @private
     */
    async #validateUserCreationData(userData) {
        await this.#validateRegistrationData(userData, 'local');

        if (!userData.organizations || userData.organizations.length === 0) {
            throw new ValidationError('User must belong to at least one organization', 'ORGANIZATION_REQUIRED');
        }

        // Validate organization IDs exist
        for (const org of userData.organizations) {
            if (!mongoose.Types.ObjectId.isValid(org.organizationId)) {
                throw new ValidationError('Invalid organization ID', 'INVALID_ORGANIZATION_ID');
            }
        }
    }

    /**
     * Check for duplicate users
     * @private
     */
    async #checkDuplicateUser(userData) {
        const existingUser = await UserModel.findOne({
            email: userData.email.toLowerCase()
        });

        if (existingUser) {
            throw new ConflictError('User with this email already exists', 'USER_EXISTS');
        }

        if (userData.username) {
            const existingUsername = await UserModel.findOne({
                username: userData.username
            });

            if (existingUsername) {
                throw new ConflictError('Username already taken', 'USERNAME_TAKEN');
            }
        }
    }

    /**
     * Enrich user data with defaults and computed values
     * @private
     */
    async #enrichUserData(userData, createdBy) {
        const enriched = { ...userData };

        // Set metadata
        enriched.metadata = {
            source: 'manual',
            createdBy,
            importId: userData.importId,
            ...userData.metadata
        };

        // Set verification defaults
        if (!enriched.verification) {
            enriched.verification = {
                email: { verified: false, attempts: 0 },
                phone: { verified: false, attempts: 0 }
            };
        }

        // Set security defaults
        if (!enriched.security) {
            enriched.security = {
                loginAttempts: { count: 0 },
                passwordReset: {},
                securityQuestions: [],
                riskScore: 0,
                threatLevel: 'none',
                incidents: []
            };
        }

        // Set preferences defaults
        if (!enriched.preferences) {
            enriched.preferences = {
                language: 'en',
                timezone: 'UTC',
                theme: 'auto',
                notifications: {
                    email: { enabled: true, frequency: 'instant' },
                    sms: { enabled: false },
                    push: { enabled: true },
                    inApp: { enabled: true }
                }
            };
        }

        // Set activity defaults
        enriched.activity = {
            loginCount: 0,
            lastLoginAt: null,
            lastActivityAt: new Date(),
            loginHistory: [],
            activitySummary: {
                totalLogins: 0,
                totalActions: 0,
                lastWeek: 0,
                lastMonth: 0
            }
        };

        return enriched;
    }

    /**
     * Generate unique username from email
     * @private
     */
    async #generateUniqueUsername(email) {
        const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        let username = baseUsername;
        let counter = 1;

        while (await UserModel.findOne({ username })) {
            username = `${baseUsername}${counter}`;
            counter++;
        }

        return username;
    }

    /**
     * Create associated user records
     * @private
     */
    async #createUserAssociatedRecords(userId, userData, createdBy, session) {
        const promises = [];

        // Create user profile if data provided
        if (userData.profileData) {
            promises.push(
                UserProfileModel.create([{
                    userId,
                    ...userData.profileData,
                    createdBy
                }], { session }).catch(error => {
                    logger.warn('Failed to create user profile', { userId, error: error.message });
                })
            );
        }

        // Create user settings
        promises.push(
            UserSettingsModel.create([{
                userId,
                organizationId: userData.organizationId,
                settings: userData.settings || {},
                createdBy
            }], { session }).catch(error => {
                logger.warn('Failed to create user settings', { userId, error: error.message });
            })
        );

        // Create user preferences
        promises.push(
            UserPreferencesModel.create([{
                userId,
                organizationId: userData.organizationId,
                preferences: userData.preferences || {},
                createdBy
            }], { session }).catch(error => {
                logger.warn('Failed to create user preferences', { userId, error: error.message });
            })
        );

        await Promise.allSettled(promises);
    }

    /**
     * Send user creation notifications
     * @private
     */
    async #sendUserCreationNotifications(user, createdBy) {
        try {
            // Send welcome email to user
            await this.#emailService.sendWelcomeEmail(user.email, {
                firstName: user.profile.firstName,
                username: user.username,
                tempPassword: user.tempPassword
            });

            // Send notification to creator
            if (createdBy !== 'system') {
                await this.#notificationService.sendNotification({
                    type: 'USER_CREATED',
                    recipients: [createdBy],
                    data: {
                        userId: user._id,
                        userEmail: user.email,
                        userName: `${user.profile.firstName} ${user.profile.lastName}`
                    }
                });
            }

        } catch (error) {
            logger.warn('Failed to send user creation notifications', {
                userId: user._id,
                error: error.message
            });
        }
    }

    /**
     * Apply population to user query
     * @private
     */
    #applyPopulation(query, populate) {
        if (populate.includes('organizations')) {
            query = query.populate('organizations.organizationId', 'name description type');
        }

        if (populate.includes('profile')) {
            query = query.populate({
                path: 'profile',
                model: 'UserProfile',
                localField: '_id',
                foreignField: 'userId'
            });
        }

        if (populate.includes('settings')) {
            query = query.populate({
                path: 'settings',
                model: 'UserSettings',
                localField: '_id',
                foreignField: 'userId'
            });
        }

        if (populate.includes('preferences')) {
            query = query.populate({
                path: 'preferences',
                model: 'UserPreferences',
                localField: '_id',
                foreignField: 'userId'
            });
        }

        if (populate.includes('sessions')) {
            query = query.populate({
                path: 'sessions',
                model: 'UserSession',
                localField: '_id',
                foreignField: 'userId',
                match: { status: 'active' }
            });
        }

        return query;
    }

    /**
     * Enrich user with calculated metrics
     * @private
     */
    async #enrichUserWithMetrics(user) {
        const cacheKey = `metrics:${user._id}`;
        let metrics = this.#userMetricsCache.get(cacheKey);

        if (!metrics) {
            metrics = {
                loginCount: user.activity?.loginCount || 0,
                lastLoginDaysAgo: user.activity?.lastLoginAt ?
                    Math.floor((Date.now() - user.activity.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
                organizationCount: user.organizations?.length || 0,
                isEmailVerified: user.verification?.email?.verified || false,
                isPhoneVerified: user.verification?.phone?.verified || false,
                isMfaEnabled: user.mfa?.enabled || false,
                riskScore: user.security?.riskScore || 0,
                completenessScore: this.#calculateProfileCompleteness(user),
                accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
                complianceStatus: await this.#checkUserCompliance(user._id),
                securityScore: this.#calculateSecurityScore(user)
            };

            // Cache for 5 minutes
            this.#userMetricsCache.set(cacheKey, metrics);
            setTimeout(() => this.#userMetricsCache.delete(cacheKey), 300000);
        }

        return {
            ...user,
            metrics
        };
    }

    /**
     * Calculate profile completeness score
     * @private
     */
    #calculateProfileCompleteness(user) {
        let score = 0;
        const maxScore = 100;

        // Basic information (40 points)
        if (user.profile?.firstName) score += 10;
        if (user.profile?.lastName) score += 10;
        if (user.email) score += 10;
        if (user.profile?.avatar?.url) score += 10;

        // Contact information (20 points)
        if (user.phoneNumber) score += 10;
        if (user.verification?.email?.verified) score += 10;

        // Security setup (20 points)
        if (user.password) score += 10;
        if (user.mfa?.enabled) score += 10;

        // Organization membership (10 points)
        if (user.organizations?.length > 0) score += 10;

        // Additional profile data (10 points)
        if (user.profile?.bio) score += 5;
        if (user.profile?.title) score += 5;

        return Math.min(score, maxScore);
    }

    /**
     * Calculate security score for user
     * @private
     */
    #calculateSecurityScore(user) {
        let score = 50; // Base score

        // Password strength and age
        if (user.password) {
            score += 15;
            if (user.passwordChangedAt) {
                const daysSinceChange = (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceChange < 90) score += 10;
                else if (daysSinceChange < 180) score += 5;
            }
        }

        // MFA status
        if (user.mfa?.enabled) {
            score += 20;
            const enabledMethods = user.mfa.methods?.filter(m => m.enabled).length || 0;
            score += Math.min(enabledMethods * 5, 15);
        }

        // Email verification
        if (user.verification?.email?.verified) score += 10;

        // Recent security incidents
        const recentIncidents = user.security?.incidents?.filter(
            incident => Date.now() - incident.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000
        ).length || 0;
        score -= recentIncidents * 5;

        // Failed login attempts
        if (user.security?.loginAttempts?.count > 0) {
            score -= user.security.loginAttempts.count * 2;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Validate user update data
     * @private
     */
    async #validateUserUpdateData(updateData, existingUser) {
        // Email validation
        if (updateData.email && updateData.email !== existingUser.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(updateData.email)) {
                throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
            }

            const existingEmailUser = await UserModel.findOne({
                email: updateData.email.toLowerCase(),
                _id: { $ne: existingUser._id }
            });

            if (existingEmailUser) {
                throw new ValidationError('Email already in use', 'EMAIL_IN_USE');
            }
        }

        // Username validation
        if (updateData.username && updateData.username !== existingUser.username) {
            const existingUsernameUser = await UserModel.findOne({
                username: updateData.username,
                _id: { $ne: existingUser._id }
            });

            if (existingUsernameUser) {
                throw new ValidationError('Username already taken', 'USERNAME_TAKEN');
            }
        }

        // Password validation
        if (updateData.password) {
            if (updateData.password.length < this.#serviceConfig.passwordPolicy.minLength) {
                throw new ValidationError(
                    `Password must be at least ${this.#serviceConfig.passwordPolicy.minLength} characters`,
                    'PASSWORD_TOO_SHORT'
                );
            }

            // Check password history
            if (existingUser.passwordHistory?.length > 0) {
                for (const oldPassword of existingUser.passwordHistory.slice(0, this.#serviceConfig.passwordPolicy.preventReuse)) {
                    const isReused = await this.#authService.passwordService.verifyPassword(updateData.password, oldPassword.hash);
                    if (isReused) {
                        throw new ValidationError('Cannot reuse recent passwords', 'PASSWORD_REUSED');
                    }
                }
            }
        }
    }

    /**
     * Check for update conflicts
     * @private
     */
    async #checkUpdateConflicts(userId, updateData) {
        const transactionKey = `update:${userId}`;
        if (this.#pendingTransactions.has(transactionKey)) {
            throw new ConflictError('User is currently being updated', 'UPDATE_IN_PROGRESS');
        }

        this.#pendingTransactions.set(transactionKey, {
            startTime: Date.now(),
            operation: 'update'
        });

        setTimeout(() => {
            this.#pendingTransactions.delete(transactionKey);
        }, 60000);
    }

    /**
     * Process authentication-related updates
     * @private
     */
    async #processAuthenticationUpdates(updateData, existingUser, updatedBy) {
        const processed = { ...updateData };

        // Handle account status changes
        if (processed.accountStatus?.status && processed.accountStatus.status !== existingUser.accountStatus.status) {
            if (!processed.accountStatus.statusHistory) {
                processed.accountStatus.statusHistory = [...(existingUser.accountStatus.statusHistory || [])];
            }

            processed.accountStatus.statusHistory.push({
                status: processed.accountStatus.status,
                reason: processed.accountStatus.reason || 'Admin update',
                changedAt: new Date(),
                changedBy: updatedBy
            });
        }

        // Handle role changes in organizations
        if (processed.organizations) {
            processed.organizations.forEach(org => {
                if (org.roles) {
                    org.roles.forEach(role => {
                        if (!role.assignedAt) role.assignedAt = new Date();
                        if (!role.assignedBy) role.assignedBy = updatedBy;
                    });
                }
            });
        }

        return processed;
    }

    /**
     * Update related records when user is updated
     * @private
     */
    async #updateRelatedRecords(userId, updateData, updatedBy, session) {
        const promises = [];

        // Update profile
        if (updateData.profile) {
            promises.push(
                UserProfileModel.findOneAndUpdate(
                    { userId },
                    {
                        ...updateData.profile,
                        lastUpdatedBy: updatedBy,
                        lastUpdatedAt: new Date()
                    },
                    { session, upsert: true }
                ).catch(error => {
                    logger.warn('Failed to update user profile', { userId, error: error.message });
                })
            );
        }

        // Update preferences
        if (updateData.preferences) {
            promises.push(
                UserPreferencesModel.findOneAndUpdate(
                    { userId },
                    {
                        preferences: updateData.preferences,
                        lastUpdatedBy: updatedBy,
                        lastUpdatedAt: new Date()
                    },
                    { session, upsert: true }
                ).catch(error => {
                    logger.warn('Failed to update user preferences', { userId, error: error.message });
                })
            );
        }

        // Update settings
        if (updateData.settings) {
            promises.push(
                UserSettingsModel.findOneAndUpdate(
                    { userId },
                    {
                        settings: updateData.settings,
                        lastUpdatedBy: updatedBy,
                        lastUpdatedAt: new Date()
                    },
                    { session, upsert: true }
                ).catch(error => {
                    logger.warn('Failed to update user settings', { userId, error: error.message });
                })
            );
        }

        await Promise.allSettled(promises);
    }

    /**
     * Handle MFA updates
     * @private
     */
    async #handleMFAUpdates(userId, mfaData, updatedBy) {
        try {
            if (mfaData.enabled === false) {
                // Disable all MFA methods
                const user = await UserModel.findById(userId);
                if (user.mfa?.methods) {
                    user.mfa.methods.forEach(method => {
                        method.enabled = false;
                        method.disabledAt = new Date();
                        method.disabledBy = updatedBy;
                    });
                    await user.save();
                }
            }

            if (mfaData.methods) {
                // Update specific MFA methods
                const user = await UserModel.findById(userId);
                if (user.mfa) {
                    user.mfa.methods = mfaData.methods;
                    await user.save();
                }
            }

        } catch (error) {
            logger.warn('Failed to handle MFA updates', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Send update notifications for significant changes
     * @private
     */
    async #sendUpdateNotifications(oldUser, newUser, updatedBy) {
        try {
            const significantChanges = [];

            if (oldUser.email !== newUser.email) {
                significantChanges.push('email');
                await this.#emailService.sendEmailChangeNotification(newUser.email, {
                    firstName: newUser.profile.firstName,
                    oldEmail: oldUser.email
                });
            }

            if (oldUser.accountStatus.status !== newUser.accountStatus.status) {
                significantChanges.push('account_status');
                await this.#emailService.sendAccountStatusChangeNotification(newUser.email, {
                    firstName: newUser.profile.firstName,
                    newStatus: newUser.accountStatus.status,
                    oldStatus: oldUser.accountStatus.status
                });
            }

            if (JSON.stringify(oldUser.organizations) !== JSON.stringify(newUser.organizations)) {
                significantChanges.push('roles');
            }

            if (significantChanges.length > 0) {
                await this.#notificationService.sendNotification({
                    type: 'USER_UPDATED',
                    recipients: [newUser._id.toString()],
                    data: {
                        userId: newUser._id,
                        changes: significantChanges,
                        updatedBy
                    }
                });
            }

        } catch (error) {
            logger.warn('Failed to send update notifications', {
                userId: newUser._id,
                error: error.message
            });
        }
    }

    /**
     * Calculate changes between old and new user
     * @private
     */
    #calculateChanges(oldUser, newUser) {
        const changes = {};
        const fieldsToCompare = [
            'email', 'username', 'accountStatus.status',
            'profile.firstName', 'profile.lastName',
            'mfa.enabled', 'verification.email.verified'
        ];

        fieldsToCompare.forEach(field => {
            const oldValue = this.#getNestedValue(oldUser, field);
            const newValue = this.#getNestedValue(newUser, field);

            if (oldValue !== newValue) {
                changes[field] = { from: oldValue, to: newValue };
            }
        });

        return changes;
    }

    /**
     * Get nested object value by path
     * @private
     */
    #getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set nested object value by path
     * @private
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

    // ==================== PRIVATE AUTHENTICATION & SECURITY METHODS ====================

    /**
     * Perform user logout cleanup
     * @private
     */
    async #performUserLogoutCleanup(sessionIdentifier, context, options) {
        try {
            // Clear user metrics cache
            const session = await UserSessionModel.findOne({
                $or: [
                    { sessionId: sessionIdentifier },
                    { accessToken: sessionIdentifier }
                ]
            });

            if (session) {
                this.#userMetricsCache.delete(`metrics:${session.userId}`);

                // Clear user-specific caches
                await this.#clearUserCaches(null, session.userId);
            }

        } catch (error) {
            logger.warn('User logout cleanup failed', {
                sessionId: sessionIdentifier?.substring(0, 10) + '...',
                error: error.message
            });
        }
    }

    /**
     * Revoke all user tokens
     * @private
     */
    async #revokeAllUserTokens(userId) {
        try {
            // Get all active sessions for user
            const sessions = await UserSessionModel.find({
                userId,
                status: 'active'
            });

            // Blacklist all tokens
            for (const session of sessions) {
                if (session.accessToken) {
                    await this.#authService.blacklistService.blacklistToken(session.accessToken, 'user_deletion');
                }
                if (session.refreshToken) {
                    await this.#authService.blacklistService.blacklistToken(session.refreshToken, 'user_deletion');
                }
            }

            // Update session status
            await UserSessionModel.updateMany(
                { userId, status: 'active' },
                { status: 'revoked', revokedAt: new Date(), reason: 'user_deletion' }
            );

        } catch (error) {
            logger.warn('Failed to revoke user tokens', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Revoke organization-specific sessions
     * @private
     */
    async #revokeOrganizationSessions(userId, organizationId) {
        try {
            await UserSessionModel.updateMany(
                {
                    userId,
                    organizationId,
                    status: 'active'
                },
                {
                    status: 'revoked',
                    revokedAt: new Date(),
                    reason: 'organization_removal'
                }
            );

        } catch (error) {
            logger.warn('Failed to revoke organization sessions', {
                userId,
                organizationId,
                error: error.message
            });
        }
    }

    /**
     * Get authentication data for user
     * @private
     */
    async #getAuthenticationData(userId) {
        try {
            const user = await UserModel.findById(userId);

            return {
                mfaEnabled: user.mfa?.enabled || false,
                enabledMethods: user.mfa?.methods?.filter(m => m.enabled).map(m => m.type) || [],
                lastPasswordChange: user.passwordChangedAt,
                loginHistory: user.activity?.loginHistory?.slice(0, 10) || [],
                trustedDevices: user.mfa?.trustedDevices?.length || 0,
                activeSessions: await UserSessionModel.countDocuments({
                    userId,
                    status: 'active',
                    expiresAt: { $gt: new Date() }
                })
            };

        } catch (error) {
            logger.warn('Failed to get authentication data', {
                userId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Get security context for user
     * @private
     */
    async #getSecurityContext(userId, requesterId) {
        try {
            const context = {
                canViewSensitiveData: userId === requesterId,
                lastSecurityCheck: new Date(),
                complianceStatus: 'compliant'
            };

            // Add risk assessment if available
            if (this.#serviceConfig.enableAnalytics) {
                const user = await UserModel.findById(userId);
                context.riskScore = user.security?.riskScore || 0;
                context.threatLevel = user.security?.threatLevel || 'none';
            }

            return context;

        } catch (error) {
            logger.warn('Failed to get security context', {
                userId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Get authentication metrics
     * @private
     */
    async #getAuthenticationMetrics(params) {
        try {
            const { organizationId, timeRange } = params;
            const matchQuery = {};

            if (organizationId) {
                matchQuery['organizations.organizationId'] = organizationId;
            }

            if (timeRange) {
                const timeRangeMs = this.#parseTimeRange(timeRange);
                matchQuery['activity.lastLoginAt'] = { $gte: new Date(Date.now() - timeRangeMs) };
            }

            const pipeline = [
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        totalLogins: { $sum: '$activity.loginCount' },
                        uniqueUsers: { $sum: 1 },
                        mfaEnabledUsers: { $sum: { $cond: ['$mfa.enabled', 1, 0] } },
                        averageLoginFrequency: { $avg: '$activity.loginCount' }
                    }
                }
            ];

            const result = await UserModel.aggregate(pipeline);
            return result[0] || {};

        } catch (error) {
            logger.warn('Failed to get authentication metrics', {
                error: error.message,
                params
            });
            return {};
        }
    }

    /**
     * Get security metrics
     * @private
     */
    async #getSecurityMetrics(params) {
        try {
            const { organizationId } = params;
            const matchQuery = {};

            if (organizationId) {
                matchQuery['organizations.organizationId'] = organizationId;
            }

            const pipeline = [
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        averageRiskScore: { $avg: '$security.riskScore' },
                        highRiskUsers: {
                            $sum: { $cond: [{ $gte: ['$security.riskScore', 75] }, 1, 0] }
                        },
                        usersWithIncidents: {
                            $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$security.incidents', []] } }, 0] }, 1, 0] }
                        },
                        lockedAccounts: {
                            $sum: { $cond: [{ $eq: ['$accountStatus.status', 'locked'] }, 1, 0] }
                        }
                    }
                }
            ];

            const result = await UserModel.aggregate(pipeline);
            return result[0] || {};

        } catch (error) {
            logger.warn('Failed to get security metrics', {
                error: error.message,
                params
            });
            return {};
        }
    }

    // ==================== PRIVATE MFA METHODS ====================

    /**
     * Validate MFA setup
     * @private
     */
    async #validateMFASetup(userId, method) {
        const user = await UserModel.findById(userId);
        if (!user) {
            throw new NotFoundError('User not found', 'USER_NOT_FOUND');
        }

        // Check if method is allowed
        if (!this.#serviceConfig.mfaPolicy.allowedMethods.includes(method)) {
            throw new ValidationError(`MFA method ${method} is not allowed`, 'MFA_METHOD_NOT_ALLOWED');
        }

        // Check if method is already enabled
        const existingMethod = user.mfa?.methods?.find(m => m.type === method && m.enabled);
        if (existingMethod) {
            throw new ConflictError('MFA method already enabled', 'MFA_METHOD_EXISTS');
        }
    }

    /**
     * Update user MFA status
     * @private
     */
    async #updateUserMFAStatus(userId, method, status) {
        try {
            const user = await UserModel.findById(userId);
            if (user) {
                if (!user.mfa) user.mfa = { enabled: false, methods: [] };

                let methodObj = user.mfa.methods.find(m => m.type === method);
                if (!methodObj) {
                    methodObj = { type: method, enabled: false };
                    user.mfa.methods.push(methodObj);
                }

                methodObj.status = status;
                methodObj.lastStatusChange = new Date();

                if (status === 'enabled') {
                    methodObj.enabled = true;
                    methodObj.enabledAt = new Date();

                    // Check if this is the first enabled method
                    if (!user.mfa.enabled) {
                        user.mfa.enabled = true;
                        user.mfa.enabledAt = new Date();
                    }
                }

                await user.save();
            }

        } catch (error) {
            logger.warn('Failed to update MFA status', {
                userId,
                method,
                status,
                error: error.message
            });
        }
    }

    /**
     * Check MFA compliance for user
     * @private
     */
    async #checkMFACompliance(userId) {
        try {
            const user = await UserModel.findById(userId);

            const required = await this.#isMFARequiredForUser(user);
            const compliant = required ? (user.mfa?.enabled || false) : true;

            return {
                required,
                compliant,
                enabledMethods: user.mfa?.methods?.filter(m => m.enabled).length || 0,
                gracePeriodExpired: this.#isMFAGracePeriodExpired(user)
            };

        } catch (error) {
            logger.warn('Failed to check MFA compliance', {
                userId,
                error: error.message
            });
            return { required: false, compliant: true };
        }
    }

    /**
     * Check if MFA grace period has expired
     * @private
     */
    #isMFAGracePeriodExpired(user) {
        if (!user.mfa?.gracePeriodStart) return false;

        const gracePeriodMs = this.#serviceConfig.mfaPolicy.gracePeriod * 24 * 60 * 60 * 1000;
        return Date.now() - user.mfa.gracePeriodStart.getTime() > gracePeriodMs;
    }

    /**
     * Handle MFA compliance achieved
     * @private
     */
    async #handleMFAComplianceAchieved(userId) {
        try {
            await this.#notificationService.sendNotification({
                type: 'MFA_COMPLIANCE_ACHIEVED',
                recipients: [userId],
                data: {
                    timestamp: new Date(),
                    message: 'Your account is now MFA compliant'
                }
            });

        } catch (error) {
            logger.warn('Failed to handle MFA compliance achieved', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Handle MFA compliance loss
     * @private
     */
    async #handleMFAComplianceLoss(userId) {
        try {
            const user = await UserModel.findById(userId);

            // Start grace period if not already started
            if (!user.mfa?.gracePeriodStart) {
                if (!user.mfa) user.mfa = {};
                user.mfa.gracePeriodStart = new Date();
                await user.save();
            }

            await this.#notificationService.sendNotification({
                type: 'MFA_COMPLIANCE_LOST',
                recipients: [userId],
                data: {
                    timestamp: new Date(),
                    gracePeriodDays: this.#serviceConfig.mfaPolicy.gracePeriod,
                    message: 'MFA setup required for continued access'
                }
            });

        } catch (error) {
            logger.warn('Failed to handle MFA compliance loss', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Validate MFA disable request
     * @private
     */
    async #validateMFADisable(userId, method, disabledBy) {
        const user = await UserModel.findById(userId);

        // Check if method exists and is enabled
        const methodObj = user.mfa?.methods?.find(m => m.type === method && m.enabled);
        if (!methodObj) {
            throw new NotFoundError('MFA method not found or not enabled', 'MFA_METHOD_NOT_FOUND');
        }

        // Check if this would violate compliance
        const compliance = await this.#checkMFACompliance(userId);
        if (compliance.required) {
            const enabledMethods = user.mfa.methods.filter(m => m.enabled && m.type !== method);
            if (enabledMethods.length === 0) {
                throw new ForbiddenError('Cannot disable last MFA method when MFA is required', 'LAST_MFA_METHOD');
            }
        }
    }

    /**
     * Setup default MFA for user
     * @private
     */
    async #setupDefaultMFA(userId, options) {
        try {
            // Set up TOTP as default method
            await this.setupMFA(userId, 'totp', {
                label: `User Account`,
                issuer: this.#serviceConfig.mfa?.totp?.issuer || 'Enterprise App'
            });

            // Start grace period
            const user = await UserModel.findById(userId);
            if (!user.mfa) user.mfa = {};
            user.mfa.gracePeriodStart = new Date();
            await user.save();

        } catch (error) {
            logger.warn('Failed to setup default MFA', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Initiate MFA setup for user
     * @private
     */
    async #initiateMFASetupForUser(userId, options = {}) {
        try {
            await this.#notificationService.sendNotification({
                type: 'MFA_SETUP_REQUIRED',
                recipients: [userId],
                data: {
                    reason: options.reason,
                    gracePeriodDays: options.gracePeriod,
                    timestamp: new Date()
                }
            });

            const user = await UserModel.findById(userId);
            await this.#emailService.sendMFASetupReminder(user.email, {
                firstName: user.profile.firstName,
                gracePeriodDays: options.gracePeriod
            });

        } catch (error) {
            logger.warn('Failed to initiate MFA setup', {
                userId,
                error: error.message
            });
        }
    }

    /**
     * Check if organization requires MFA
     * @private
     */
    async #isOrganizationMFARequired(organizationId) {
        // This would integrate with organization service
        // For now, check subscription level
        const subscription = await this.#getOrganizationSubscription(organizationId);
        return this.#subscriptionLimits[subscription]?.mfaRequired || false;
    }

    // ==================== PRIVATE ORGANIZATION METHODS ====================

    /**
     * Validate organization roles
     * @private
     */
    async #validateOrganizationRoles(organizationId, roles, assignedBy) {
        // Check if organization exists (would integrate with org service)
        // For now, validate role names
        const validRoles = Object.keys(this.#roleHierarchy);
        const invalidRoles = roles.filter(role => !validRoles.includes(role));

        if (invalidRoles.length > 0) {
            throw new ValidationError(
                `Invalid roles: ${invalidRoles.join(', ')}`,
                'INVALID_ROLES'
            );
        }

        // Check if assigner has permission
        const assigner = await UserModel.findById(assignedBy);
        const assignerMembership = assigner?.organizations?.find(
            org => org.organizationId.toString() === organizationId.toString()
        );

        if (!assignerMembership) {
            throw new ForbiddenError('No access to organization', 'NO_ORGANIZATION_ACCESS');
        }

        const hasAdminRole = assignerMembership.roles.some(role =>
            ['admin', 'super_admin', 'organization_admin'].includes(role.roleName)
        );

        if (!hasAdminRole) {
            throw new ForbiddenError('Insufficient permissions to assign roles', 'INSUFFICIENT_PERMISSIONS');
        }
    }

    /**
     * Check subscription limits
     * @private
     */
    async #checkSubscriptionLimits(organizationId, limitType) {
        const currentCount = await UserModel.countDocuments({
            'organizations.organizationId': organizationId,
            'accountStatus.status': { $in: ['active', 'pending'] }
        });

        const subscription = await this.#getOrganizationSubscription(organizationId);
        const limits = this.#subscriptionLimits[subscription];

        if (limitType === 'users' && limits.users !== -1 && currentCount >= limits.users) {
            throw new ForbiddenError(
                `User limit of ${limits.users} exceeded for ${subscription} subscription`,
                'USER_LIMIT_EXCEEDED'
            );
        }
    }

    /**
     * Send organization addition notifications
     * @private
     */
    async #sendOrganizationAdditionNotifications(user, organizationId, assignedBy, autoAccept) {
        try {
            await this.#emailService.sendOrganizationInvitation(user.email, {
                firstName: user.profile.firstName,
                organizationId,
                autoAccept,
                inviterName: assignedBy
            });

            if (!autoAccept) {
                await this.#notificationService.sendNotification({
                    type: 'ORGANIZATION_INVITATION',
                    recipients: [user._id.toString()],
                    data: {
                        organizationId,
                        inviterName: assignedBy,
                        timestamp: new Date()
                    }
                });
            }

        } catch (error) {
            logger.warn('Failed to send organization addition notifications', {
                userId: user._id,
                organizationId,
                error: error.message
            });
        }
    }

    /**
     * Validate organization removal
     * @private
     */
    async #validateOrganizationRemoval(userId, organizationId, removedBy) {
        // Check if user is last admin
        const user = await UserModel.findById(userId);
        const membership = user.organizations.find(
            org => org.organizationId.toString() === organizationId.toString()
        );

        if (membership?.roles.some(role => role.roleName === 'admin')) {
            const adminCount = await UserModel.countDocuments({
                'organizations.organizationId': organizationId,
                'organizations.roles.roleName': 'admin',
                'accountStatus.status': 'active',
                '_id': { $ne: userId }
            });

            if (adminCount === 0) {
                throw new ForbiddenError(
                    'Cannot remove last admin from organization',
                    'LAST_ADMIN_CANNOT_REMOVE'
                );
            }
        }

        // Check remover permissions
        if (removedBy !== userId) {
            const remover = await UserModel.findById(removedBy);
            const removerMembership = remover?.organizations?.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (!removerMembership) {
                throw new ForbiddenError('No access to organization', 'NO_ORGANIZATION_ACCESS');
            }

            const hasAdminRole = removerMembership.roles.some(role =>
                ['admin', 'super_admin', 'organization_admin'].includes(role.roleName)
            );

            if (!hasAdminRole) {
                throw new ForbiddenError('Insufficient permissions to remove user', 'INSUFFICIENT_PERMISSIONS');
            }
        }
    }

    /**
     * Transfer organization ownership
     * @private
     */
    async #transferOrganizationOwnership(fromUserId, organizationId, toUserId, transferredBy, session) {
        // This would integrate with organization service
        await this.#auditService.log({
            action: 'ORGANIZATION_OWNERSHIP_TRANSFERRED',
            entityType: 'organization',
            entityId: organizationId,
            userId: transferredBy,
            details: { fromUserId, toUserId }
        });
    }

    /**
     * Send organization removal notifications
     * @private
     */
    async #sendOrganizationRemovalNotifications(user, organizationId, removedBy, reason) {
        try {
            await this.#emailService.sendOrganizationRemovalNotification(user.email, {
                firstName: user.profile.firstName,
                organizationId,
                reason,
                removedBy
            });

        } catch (error) {
            logger.warn('Failed to send organization removal notifications', {
                userId: user._id,
                organizationId,
                error: error.message
            });
        }
    }

    // ==================== PRIVATE SEARCH AND ANALYTICS METHODS ====================

    /**
     * Check search permissions
     * @private
     */
    async #checkSearchPermissions(requesterId, searchParams, organizationId) {
        if (!requesterId) return;

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        if (organizationId) {
            const membership = requester.organizations.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (!membership) {
                throw new ForbiddenError('No access to organization', 'NO_ORGANIZATION_ACCESS');
            }
        }
    }

    /**
     * Check analytics permissions
     * @private
     */
    async #checkAnalyticsPermissions(requesterId, organizationId) {
        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        if (organizationId) {
            const membership = requester.organizations.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (!membership) {
                throw new ForbiddenError('No access to organization analytics', 'NO_ANALYTICS_ACCESS');
            }

            const hasAnalyticsRole = membership.roles.some(role =>
                ['admin', 'manager', 'analytics_viewer'].includes(role.roleName)
            );

            if (!hasAnalyticsRole) {
                throw new ForbiddenError('Insufficient permissions for analytics', 'INSUFFICIENT_ANALYTICS_PERMISSIONS');
            }
        }
    }

    /**
     * Check security assessment permissions
     * @private
     */
    async #checkSecurityAssessmentPermissions(requesterId, userId) {
        if (requesterId === userId) return;

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        const hasSecurityRole = requester.organizations.some(org =>
            org.roles.some(role => ['admin', 'security_admin'].includes(role.roleName))
        );

        if (!hasSecurityRole) {
            throw new ForbiddenError('Insufficient permissions for security assessment', 'INSUFFICIENT_SECURITY_PERMISSIONS');
        }
    }

    /**
     * Build search query
     * @private
     */
    async #buildSearchQuery(searchParams, options = {}) {
        const query = {};

        if (!options.includeDeleted) {
            query['accountStatus.status'] = { $ne: 'deleted' };
        }

        if (options.organizationId) {
            query['organizations.organizationId'] = options.organizationId;
        }

        if (searchParams.email) {
            query.email = new RegExp(searchParams.email, 'i');
        }

        if (searchParams.name) {
            query.$or = [
                { 'profile.firstName': new RegExp(searchParams.name, 'i') },
                { 'profile.lastName': new RegExp(searchParams.name, 'i') },
                { 'profile.displayName': new RegExp(searchParams.name, 'i') }
            ];
        }

        if (searchParams.status && Array.isArray(searchParams.status)) {
            query['accountStatus.status'] = { $in: searchParams.status };
        }

        if (searchParams.roles && Array.isArray(searchParams.roles)) {
            query['organizations.roles.roleName'] = { $in: searchParams.roles };
        }

        if (searchParams.mfaEnabled !== undefined) {
            query['mfa.enabled'] = searchParams.mfaEnabled;
        }

        if (searchParams.emailVerified !== undefined) {
            query['verification.email.verified'] = searchParams.emailVerified;
        }

        return query;
    }

    /**
     * Process search aggregations
     * @private
     */
    #processSearchAggregations(aggregationData) {
        if (!aggregationData) return {};

        const processed = {};

        if (aggregationData.statusBreakdown) {
            processed.statusBreakdown = aggregationData.statusBreakdown.reduce((acc, status) => {
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
        }

        if (aggregationData.mfaBreakdown) {
            processed.mfaBreakdown = aggregationData.mfaBreakdown.reduce((acc, enabled) => {
                const key = enabled ? 'true' : 'false';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
        }

        return processed;
    }

    /**
     * Build analytics pipeline
     * @private
     */
    async #buildAnalyticsPipeline(params) {
        const { organizationId, timeRange, includeSecurityMetrics } = params;
        const matchStage = {};

        if (organizationId) {
            matchStage['organizations.organizationId'] = organizationId;
        }

        if (timeRange) {
            const timeRangeMs = this.#parseTimeRange(timeRange);
            matchStage.createdAt = { $gte: new Date(Date.now() - timeRangeMs) };
        }

        const pipeline = [
            { $match: matchStage },
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,
                                totalUsers: { $sum: 1 },
                                activeUsers: { $sum: { $cond: [{ $eq: ['$accountStatus.status', 'active'] }, 1, 0] } },
                                pendingUsers: { $sum: { $cond: [{ $eq: ['$accountStatus.status', 'pending'] }, 1, 0] } },
                                verifiedEmails: { $sum: { $cond: ['$verification.email.verified', 1, 0] } },
                                mfaEnabled: { $sum: { $cond: ['$mfa.enabled', 1, 0] } }
                            }
                        }
                    ],
                    registrationTrend: [
                        {
                            $group: {
                                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ]
                }
            }
        ];

        if (includeSecurityMetrics) {
            pipeline[1].$facet.securityMetrics = [
                {
                    $group: {
                        _id: null,
                        averageRiskScore: { $avg: '$security.riskScore' },
                        highRiskUsers: { $sum: { $cond: [{ $gte: ['$security.riskScore', 75] }, 1, 0] } }
                    }
                }
            ];
        }

        return pipeline;
    }

    /**
     * Process analytics data
     * @private
     */
    #processAnalyticsData(analyticsData) {
        const processed = {};

        if (analyticsData.overview && analyticsData.overview[0]) {
            processed.overview = analyticsData.overview[0];
        }

        if (analyticsData.registrationTrend) {
            processed.registrationTrend = analyticsData.registrationTrend;
        }

        if (analyticsData.securityMetrics && analyticsData.securityMetrics[0]) {
            processed.securityMetrics = analyticsData.securityMetrics[0];
        }

        return processed;
    }

    /**
     * Calculate advanced user metrics
     * @private
     */
    async #calculateAdvancedUserMetrics(params) {
        const { organizationId } = params;
        const matchQuery = {};

        if (organizationId) {
            matchQuery['organizations.organizationId'] = organizationId;
        }

        const metrics = await UserModel.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    avgLoginCount: { $avg: '$activity.loginCount' },
                    avgRiskScore: { $avg: '$security.riskScore' },
                    avgCompleteness: { $avg: '$metrics.completenessScore' }
                }
            }
        ]);

        return metrics[0] || {};
    }

    /**
     * Parse time range string
     * @private
     */
    #parseTimeRange(timeRange) {
        const match = timeRange.match(/^(\d+)([dwmy])$/);
        if (!match) return 30 * 24 * 60 * 60 * 1000;

        const [, amount, unit] = match;
        const multipliers = {
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'm': 30 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };

        return parseInt(amount) * multipliers[unit];
    }

    // ==================== PRIVATE UTILITY METHODS ====================

    /**
     * Check user access permissions
     * @private
     */
    async #checkUserAccess(user, requesterId, operation) {
        if (user._id.toString() === requesterId) return;

        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        const sharedOrgs = user.organizations.filter(userOrg =>
            requester.organizations.some(reqOrg =>
                reqOrg.organizationId.toString() === userOrg.organizationId.toString()
            )
        );

        if (sharedOrgs.length === 0) {
            throw new ForbiddenError('No shared organization access', 'NO_SHARED_ACCESS');
        }

        const hasPermission = sharedOrgs.some(org => {
            const requesterMembership = requester.organizations.find(
                reqOrg => reqOrg.organizationId.toString() === org.organizationId.toString()
            );

            const requesterRoles = requesterMembership?.roles?.map(r => r.roleName) || [];
            return requesterRoles.some(role => ['super_admin', 'admin', 'manager'].includes(role));
        });

        if (!hasPermission) {
            throw new ForbiddenError(`Insufficient permissions for ${operation}`, 'INSUFFICIENT_PERMISSIONS');
        }
    }

    /**
     * Get user security metrics
     * @private
     */
    async #getUserSecurityMetrics(userId) {
        const user = await UserModel.findById(userId);

        return {
            riskScore: user.security?.riskScore || 0,
            threatLevel: user.security?.threatLevel || 'none',
            incidentCount: user.security?.incidents?.length || 0,
            lastSecurityCheck: user.security?.lastSecurityCheck,
            mfaEnabled: user.mfa?.enabled || false,
            trustedDevicesCount: user.mfa?.trustedDevices?.length || 0
        };
    }

    /**
     * Check user compliance status
     * @private
     */
    async #checkUserCompliance(userId) {
        const user = await UserModel.findById(userId);
        const compliance = {
            overall: 'compliant',
            items: {}
        };

        // Email verification compliance
        compliance.items.emailVerified = user.verification?.email?.verified || false;

        // MFA compliance
        const mfaRequired = await this.#isMFARequiredForUser(user);
        compliance.items.mfaCompliant = mfaRequired ? (user.mfa?.enabled || false) : true;

        // Password compliance
        if (user.passwordChangedAt) {
            const daysSinceChange = (Date.now() - user.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
            compliance.items.passwordCurrent = daysSinceChange < this.#serviceConfig.passwordPolicy.expiryDays;
        }

        // Overall compliance
        compliance.overall = Object.values(compliance.items).every(Boolean) ? 'compliant' : 'non_compliant';

        return compliance;
    }

    /**
     * Generate security recommendations
     * @private
     */
    async #generateSecurityRecommendations(userId, securityAssessment) {
        const recommendations = [];
        const user = await UserModel.findById(userId);

        if (!user.mfa?.enabled) {
            recommendations.push({
                type: 'mfa_setup',
                priority: 'high',
                message: 'Enable multi-factor authentication to secure your account'
            });
        }

        if (!user.verification?.email?.verified) {
            recommendations.push({
                type: 'email_verification',
                priority: 'medium',
                message: 'Verify your email address for account recovery'
            });
        }

        if (securityAssessment.overallScore < 70) {
            recommendations.push({
                type: 'security_review',
                priority: 'high',
                message: 'Review and improve your account security settings'
            });
        }

        return recommendations;
    }

    /**
     * Get user activity events
     * @private
     */
    async #getUserActivityEvents(userId, options) {
        // This would integrate with activity logging system
        return [];
    }

    /**
     * Get authentication events
     * @private
     */
    async #getAuthenticationEvents(userId, options) {
        const sessions = await UserSessionModel.find({
            userId,
            createdAt: {
                $gte: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                $lte: options.endDate || new Date()
            }
        }).sort({ createdAt: -1 }).limit(options.limit || 50);

        return sessions.map(session => ({
            type: 'authentication',
            subtype: session.authMethod || 'login',
            timestamp: session.createdAt,
            details: {
                ipAddress: session.ipAddress,
                userAgent: session.userAgent,
                success: session.status === 'active'
            }
        }));
    }

    /**
     * Process timeline events
     * @private
     */
    async #processTimelineEvents(events) {
        return events.map(event => ({
            ...event,
            displayText: this.#generateEventDisplayText(event),
            category: this.#categorizeEvent(event.type),
            icon: this.#getEventIcon(event.type)
        }));
    }

    /**
     * Generate event display text
     * @private
     */
    #generateEventDisplayText(event) {
        const textMap = {
            'authentication': 'Logged in',
            'logout': 'Logged out',
            'mfa_setup': 'Set up MFA',
            'password_change': 'Changed password',
            'profile_update': 'Updated profile'
        };

        return textMap[event.type] || event.type;
    }

    /**
     * Categorize event type
     * @private
     */
    #categorizeEvent(eventType) {
        const categoryMap = {
            'authentication': 'security',
            'logout': 'security',
            'mfa_setup': 'security',
            'password_change': 'security',
            'profile_update': 'account'
        };

        return categoryMap[eventType] || 'other';
    }

    /**
     * Get event icon
     * @private
     */
    #getEventIcon(eventType) {
        const iconMap = {
            'authentication': 'login',
            'logout': 'logout',
            'mfa_setup': 'shield',
            'password_change': 'key',
            'profile_update': 'user'
        };

        return iconMap[eventType] || 'activity';
    }

    // ==================== PRIVATE DELETION METHODS ====================

    /**
     * Validate deletion constraints
     * @private
     */
    async #validateDeletionConstraints(user, options) {
        // Check if user is last admin in any organization
        for (const org of user.organizations) {
            if (org.roles.some(role => role.roleName === 'admin')) {
                const adminCount = await UserModel.countDocuments({
                    'organizations.organizationId': org.organizationId,
                    'organizations.roles.roleName': 'admin',
                    'accountStatus.status': 'active',
                    '_id': { $ne: user._id }
                });

                if (adminCount === 0 && !options.transferOwnership) {
                    throw new ForbiddenError(
                        'Cannot delete last admin - ownership transfer required',
                        'LAST_ADMIN_DELETE'
                    );
                }
            }
        }
    }

    /**
     * Perform hard delete
     * @private
     */
    async #performHardDelete(userId, deletedBy, session) {
        await Promise.all([
            UserModel.findByIdAndDelete(userId, { session }),
            UserProfileModel.findOneAndDelete({ userId }, { session }),
            UserSettingsModel.findOneAndDelete({ userId }, { session }),
            UserPreferencesModel.findOneAndDelete({ userId }, { session }),
            UserSessionModel.deleteMany({ userId }, { session })
        ]);
    }

    /**
     * Perform soft delete
     * @private
     */
    async #performSoftDelete(userId, deletedBy, reason, gracePeriod, session) {
        const deleteAt = new Date();
        deleteAt.setDate(deleteAt.getDate() + gracePeriod);

        await UserModel.findByIdAndUpdate(
            userId,
            {
                'accountStatus.status': 'deleted',
                'accountStatus.deletedAt': new Date(),
                'accountStatus.deletedBy': deletedBy,
                'accountStatus.deleteReason': reason,
                'accountStatus.permanentDeleteAt': deleteAt
            },
            { session }
        );
    }

    /**
     * Transfer user ownership
     * @private
     */
    async #transferUserOwnership(userId, toUserId, transferredBy, session) {
        await this.#auditService.log({
            action: 'USER_OWNERSHIP_TRANSFERRED',
            entityType: 'user',
            entityId: userId,
            userId: transferredBy,
            details: { toUserId }
        });
    }

    /**
     * Handle user deletion cleanup
     * @private
     */
    async #handleUserDeletionCleanup(userId, hardDelete, session) {
        if (hardDelete) {
            await Promise.all([
                this.#cleanupUserNotifications(userId),
                this.#cleanupUserFiles(userId),
                this.#cleanupUserSessions(userId)
            ]);
        }
    }

    /**
     * Send deletion notifications
     * @private
     */
    async #sendDeletionNotifications(user, deletedBy, hardDelete) {
        try {
            if (!hardDelete) {
                await this.#emailService.sendAccountDeletionNotification(user.email, {
                    firstName: user.profile.firstName,
                    deletionType: 'scheduled',
                    gracePeriodDays: 30
                });
            }

        } catch (error) {
            logger.warn('Failed to send deletion notifications', {
                userId: user._id,
                error: error.message
            });
        }
    }

    /**
     * Cleanup user notifications
     * @private
     */
    async #cleanupUserNotifications(userId) {
        // Implementation would integrate with notification service
        logger.debug('Cleaning up user notifications', { userId });
    }

    /**
     * Cleanup user files
     * @private
     */
    async #cleanupUserFiles(userId) {
        // Implementation would integrate with file storage service
        logger.debug('Cleaning up user files', { userId });
    }

    /**
     * Cleanup user sessions
     * @private
     */
    async #cleanupUserSessions(userId) {
        await UserSessionModel.deleteMany({ userId });
    }

    /**
     * Update user activity
     * @private
     */
    async #updateUserActivity(userId, activityData) {
        try {
            await UserModel.findByIdAndUpdate(userId, {
                'activity.lastActivityAt': new Date(),
                $push: {
                    'activity.loginHistory': {
                        $each: [activityData],
                        $slice: -50 // Keep last 50 activities
                    }
                }
            });

        } catch (error) {
            logger.warn('Failed to update user activity', {
                userId,
                error: error.message
            });
        }
    }
}

module.exports = UserService;