'use strict';

/**
 * @fileoverview Enterprise user management service with comprehensive lifecycle management and multi-tenant support
 * @module shared/lib/services/user-management/user-service
 * @requires mongoose
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
const logger = require('../../utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../utils/app-error');
const { asyncHandler } = require('../../utils/async-handler');
const CacheService = require('../cache-service');
const EmailService = require('../email-service');
const NotificationService = require('../notification-service');
const AuditService = require('../../security/audit/audit-service');
const UserModel = require('../../database/models/users/user-model');
const UserProfileModel = require('../../database/models/users/user-profile-model');
const UserSettingsModel = require('../../database/models/users/user-settings-model');
const UserPreferencesModel = require('../../database/models/users/user-preferences-model');
const UserSessionModel = require('../../database/models/users/user-session-model');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/sync');
const crypto = require('crypto');
const path = require('path');

/**
 * Enterprise user service for comprehensive user lifecycle management
 * @class UserService
 * @description Manages all user-related operations with multi-tenant support, caching, and audit trails
 */
class UserService {
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
     * @type {Object}
     */
    #subscriptionLimits = {
        free: { users: 5, storage: 1000, projects: 3 },
        basic: { users: 25, storage: 10000, projects: 10 },
        professional: { users: 100, storage: 50000, projects: 50 },
        enterprise: { users: 1000, storage: 200000, projects: 200 },
        unlimited: { users: -1, storage: -1, projects: -1 }
    };

    /**
     * @private
     * @type {Set}
     */
    #activeSearchQueries = new Set();

    /**
     * @private
     * @type {Map}
     */
    #userMetricsCache = new Map();

    /**
     * @private
     * @type {Object}
     */
    #roleHierarchy = {
        'super_admin': 100,
        'admin': 80,
        'manager': 60,
        'team_lead': 40,
        'member': 20,
        'guest': 10
    };

    /**
     * Creates an instance of UserService
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
        logger.info('Initializing UserService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });

        // Set up cleanup intervals
        this.#setupCleanupIntervals();
    }

    // ==================== PUBLIC METHODS ====================

    /**
     * Create a new user with comprehensive validation and setup
     * @param {Object} userData - User data to create
     * @param {string} createdBy - ID of user creating this user
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created user object
     * @throws {ValidationError} If validation fails
     * @throws {ConflictError} If user already exists
     */
    async createUser(userData, createdBy, options = {}) {
        const session = options.session || null;

        try {
            // Validate input data
            await this.#validateUserCreationData(userData);

            // Check subscription limits
            await this.#checkSubscriptionLimits(userData.organizationId);

            // Check for duplicate users
            await this.#checkDuplicateUser(userData);

            // Enrich user data
            const enrichedData = await this.#enrichUserData(userData, createdBy);

            // Generate username if not provided
            if (!enrichedData.username) {
                enrichedData.username = await UserModel.generateUniqueUsername(enrichedData.email);
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

            // Create user
            const user = await UserModel.create([enrichedData], { session });
            const createdUser = user[0];

            // Create associated records
            await this.#createUserAssociatedRecords(createdUser._id, userData, createdBy, session);

            // Send notifications
            await this.#sendUserCreationNotifications(createdUser, createdBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_CREATED',
                entityType: 'user',
                entityId: createdUser._id,
                userId: createdBy,
                details: {
                    email: createdUser.email,
                    username: createdUser.username,
                    organizationId: createdUser.organizations[0]?.organizationId
                }
            });

            // Clear relevant caches
            await this.#clearUserCaches(userData.organizationId);

            logger.info('User created successfully', {
                userId: createdUser._id,
                email: createdUser.email,
                createdBy
            });

            return await this.#sanitizeUserOutput(createdUser);
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
     * Get user by ID with optional population
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User object
     * @throws {NotFoundError} If user not found
     */
    async getUserById(userId, options = {}) {
        const {
            populate = [],
            includeDeleted = false,
            checkPermissions = true,
            requesterId,
            organizationId
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('user', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
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

            // Enrich with calculated fields
            const enrichedUser = await this.#enrichUserWithMetrics(user.toObject());

            // Cache result
            await this.#cacheService.set(cacheKey, enrichedUser, this.#defaultCacheTTL);

            return this.#sanitizeUserOutput(enrichedUser);
        } catch (error) {
            logger.error('Error fetching user', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Update user information
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

            // Prepare update data
            const processedUpdate = await this.#processUpdateData(updateData, existingUser, updatedBy);

            // Update user
            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                processedUpdate,
                { new: true, runValidators: true, session }
            );

            // Update related records if needed
            await this.#updateRelatedRecords(userId, updateData, updatedBy, session);

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
     * Delete or deactivate user
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

            // Handle related data
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

    /**
     * Search users with advanced filtering and pagination
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results with pagination
     */
    async searchUsers(searchParams, options = {}) {
        const {
            limit = 20,
            offset = 0,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            includeDeleted = false,
            requesterId,
            organizationId
        } = options;

        try {
            // Generate search ID for tracking
            const searchId = crypto.randomUUID();
            this.#activeSearchQueries.add(searchId);

            // Build search query
            const query = await this.#buildSearchQuery(searchParams, {
                includeDeleted,
                organizationId,
                requesterId
            });

            // Add text search if provided
            if (searchParams.textSearch) {
                query.$text = { $search: searchParams.textSearch };
            }

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
                                    statusBreakdown: {
                                        $push: '$accountStatus.status'
                                    },
                                    roleBreakdown: {
                                        $push: '$organizations.roles.roleName'
                                    }
                                }
                            }
                        ]
                    }
                }
            ];

            const results = await UserModel.aggregate(pipeline);
            const searchResult = results[0];

            // Process results
            const users = searchResult.users.map(user => this.#sanitizeUserOutput(user));
            const totalCount = searchResult.totalCount[0]?.count || 0;
            const aggregations = this.#processSearchAggregations(searchResult.aggregations[0]);

            // Calculate pagination info
            const hasMore = offset + limit < totalCount;
            const totalPages = Math.ceil(totalCount / limit);
            const currentPage = Math.floor(offset / limit) + 1;

            // Clean up search tracking
            this.#activeSearchQueries.delete(searchId);

            // Log search activity
            logger.info('User search completed', {
                searchId,
                query: searchParams,
                totalResults: totalCount,
                requesterId
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
                searchId
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
     * Bulk create users from data source
     * @param {Array} usersData - Array of user data objects
     * @param {string} createdBy - ID of user performing bulk creation
     * @param {Object} options - Bulk creation options
     * @returns {Promise<Object>} Bulk creation results
     */
    async bulkCreateUsers(usersData, createdBy, options = {}) {
        const { validateOnly = false, skipValidation = false, batchSize = 100 } = options;

        try {
            // Validate input
            if (!Array.isArray(usersData) || usersData.length === 0) {
                throw new ValidationError('No user data provided', 'INVALID_INPUT');
            }

            if (usersData.length > this.#maxBulkOperationSize) {
                throw new ValidationError(
                    `Bulk operation size exceeds maximum of ${this.#maxBulkOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            const results = {
                successful: [],
                failed: [],
                skipped: [],
                summary: {
                    total: usersData.length,
                    processed: 0,
                    errors: 0
                }
            };

            // Process in batches
            for (let i = 0; i < usersData.length; i += batchSize) {
                const batch = usersData.slice(i, i + batchSize);
                const batchResults = await this.#processBulkUserBatch(
                    batch,
                    createdBy,
                    { validateOnly, skipValidation }
                );

                results.successful.push(...batchResults.successful);
                results.failed.push(...batchResults.failed);
                results.skipped.push(...batchResults.skipped);
            }

            // Update summary
            results.summary.processed = results.successful.length + results.failed.length;
            results.summary.errors = results.failed.length;

            // Log bulk operation
            await this.#auditService.log({
                action: 'BULK_USER_CREATION',
                entityType: 'user',
                userId: createdBy,
                details: {
                    totalUsers: usersData.length,
                    successful: results.successful.length,
                    failed: results.failed.length,
                    validateOnly
                }
            });

            logger.info('Bulk user creation completed', {
                total: usersData.length,
                successful: results.successful.length,
                failed: results.failed.length,
                createdBy
            });

            return results;
        } catch (error) {
            logger.error('Error in bulk user creation', {
                error: error.message,
                userCount: usersData.length,
                createdBy
            });
            throw error;
        }
    }

    /**
     * Import users from file (CSV/Excel)
     * @param {Buffer} fileBuffer - File buffer
     * @param {string} fileType - File type (csv/xlsx)
     * @param {string} importedBy - ID of user performing import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importUsersFromFile(fileBuffer, fileType, importedBy, options = {}) {
        const { fieldMapping = {}, validateOnly = false, skipValidation = false } = options;

        try {
            let userData = [];

            // Parse file based on type
            if (fileType === 'csv') {
                userData = await this.#parseCsvFile(fileBuffer, fieldMapping);
            } else if (fileType === 'xlsx') {
                userData = await this.#parseExcelFile(fileBuffer, fieldMapping);
            } else {
                throw new ValidationError('Unsupported file type', 'UNSUPPORTED_FILE_TYPE');
            }

            // Validate parsed data
            const validationResults = await this.#validateImportData(userData);
            if (validationResults.hasErrors && !skipValidation) {
                return {
                    success: false,
                    errors: validationResults.errors,
                    validUsers: validationResults.validUsers,
                    invalidUsers: validationResults.invalidUsers
                };
            }

            // Process import
            const importResults = await this.bulkCreateUsers(
                validationResults.validUsers,
                importedBy,
                { validateOnly, skipValidation: true }
            );

            // Log import activity
            await this.#auditService.log({
                action: 'USER_FILE_IMPORT',
                entityType: 'user',
                userId: importedBy,
                details: {
                    fileType,
                    totalRows: userData.length,
                    validRows: validationResults.validUsers.length,
                    invalidRows: validationResults.invalidUsers.length,
                    importedUsers: importResults.successful.length
                }
            });

            return {
                success: true,
                importResults,
                validation: validationResults
            };
        } catch (error) {
            logger.error('Error importing users from file', {
                error: error.message,
                fileType,
                importedBy
            });
            throw error;
        }
    }

    /**
     * Export users to file format
     * @param {Object} exportParams - Export parameters
     * @param {string} exportedBy - ID of user performing export
     * @param {Object} options - Export options
     * @returns {Promise<Buffer>} File buffer
     */
    async exportUsers(exportParams, exportedBy, options = {}) {
        const { format = 'xlsx', includeMetadata = true, customFields = [] } = options;

        try {
            // Build export query
            const query = await this.#buildExportQuery(exportParams);

            // Fetch users with required fields
            const users = await UserModel.find(query)
                .populate('organizations.organizationId', 'name')
                .lean();

            // Process user data for export
            const exportData = await this.#prepareExportData(users, {
                includeMetadata,
                customFields
            });

            let fileBuffer;

            // Generate file based on format
            if (format === 'xlsx') {
                fileBuffer = await this.#generateExcelExport(exportData);
            } else if (format === 'csv') {
                fileBuffer = await this.#generateCsvExport(exportData);
            } else {
                throw new ValidationError('Unsupported export format', 'UNSUPPORTED_FORMAT');
            }

            // Log export activity
            await this.#auditService.log({
                action: 'USER_EXPORT',
                entityType: 'user',
                userId: exportedBy,
                details: {
                    format,
                    userCount: users.length,
                    includeMetadata,
                    customFields: customFields.length
                }
            });

            logger.info('User export completed', {
                format,
                userCount: users.length,
                exportedBy
            });

            return fileBuffer;
        } catch (error) {
            logger.error('Error exporting users', {
                error: error.message,
                format: options.format,
                exportedBy
            });
            throw error;
        }
    }

    /**
     * Get user statistics and analytics
     * @param {Object} params - Analytics parameters
     * @param {string} requesterId - ID of user requesting analytics
     * @returns {Promise<Object>} User analytics data
     */
    async getUserAnalytics(params = {}, requesterId) {
        const { organizationId, timeRange, includeInactive = false } = params;

        try {
            // Check cache for analytics
            const cacheKey = this.#generateCacheKey('analytics', 'users', params);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build aggregation pipeline
            const pipeline = await this.#buildAnalyticsPipeline({
                organizationId,
                timeRange,
                includeInactive
            });

            // Execute analytics query
            const analyticsData = await UserModel.aggregate(pipeline);

            // Process analytics results
            const processedAnalytics = this.#processAnalyticsData(analyticsData[0]);

            // Add calculated metrics
            processedAnalytics.metrics = await this.#calculateUserMetrics(params);

            // Cache results
            await this.#cacheService.set(cacheKey, processedAnalytics, 1800); // 30 minutes

            // Log analytics request
            logger.info('User analytics generated', {
                organizationId,
                timeRange,
                requesterId
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
        const { invitedBy, startDate, permissions = [] } = options;
        const session = options.session || null;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Validate organization and roles
            await this.#validateOrganizationRoles(organizationId, roles, assignedBy);

            // Check subscription limits
            await this.#checkOrganizationUserLimits(organizationId);

            // Add user to organization
            await user.addToOrganization(organizationId, roles);

            // Set additional organization data
            const orgMembership = user.organizations.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (invitedBy) orgMembership.invitedBy = invitedBy;
            if (startDate) orgMembership.startDate = startDate;
            if (permissions.length > 0) {
                orgMembership.permissions = permissions.map(permission => ({
                    permissionId: permission.id,
                    resource: permission.resource,
                    actions: permission.actions,
                    grantedAt: new Date(),
                    grantedBy: assignedBy
                }));
            }

            await user.save({ session });

            // Send notifications
            await this.#sendOrganizationAdditionNotifications(user, organizationId, assignedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_ADDED_TO_ORGANIZATION',
                entityType: 'user',
                entityId: userId,
                userId: assignedBy,
                details: {
                    organizationId,
                    roles,
                    permissions: permissions.length
                }
            });

            // Clear caches
            await this.#clearUserCaches(organizationId, userId);

            logger.info('User added to organization', {
                userId,
                organizationId,
                roles,
                assignedBy
            });

            return orgMembership;
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
     * Remove user from organization
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {string} removedBy - ID of user performing removal
     * @param {Object} options - Removal options
     * @returns {Promise<boolean>} Success status
     */
    async removeUserFromOrganization(userId, organizationId, removedBy, options = {}) {
        const { transferOwnership, reason } = options;
        const session = options.session || null;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Validate removal permissions
            await this.#validateOrganizationRemoval(userId, organizationId, removedBy);

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

            // Remove user from organization
            await user.removeFromOrganization(organizationId);

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
                    transferOwnership
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

    /**
     * Update user roles in organization
     * @param {string} userId - User ID
     * @param {string} organizationId - Organization ID
     * @param {Array} newRoles - New roles to assign
     * @param {string} updatedBy - ID of user performing update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated organization membership
     */
    async updateUserOrganizationRoles(userId, organizationId, newRoles, updatedBy, options = {}) {
        const { reason, effectiveDate } = options;
        const session = options.session || null;

        try {
            // Get user
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Find organization membership
            const orgMembership = user.organizations.find(
                org => org.organizationId.toString() === organizationId.toString()
            );

            if (!orgMembership) {
                throw new NotFoundError('User not member of organization', 'NOT_ORGANIZATION_MEMBER');
            }

            // Validate role changes
            await this.#validateRoleChanges(userId, organizationId, newRoles, updatedBy);

            // Store old roles for audit
            const oldRoles = orgMembership.roles.map(r => r.roleName);

            // Update roles
            orgMembership.roles = newRoles.map(roleName => ({
                roleId: null, // Would be populated with actual role ID
                roleName,
                scope: 'organization',
                assignedAt: effectiveDate || new Date(),
                assignedBy: updatedBy,
                reason
            }));

            await user.save({ session });

            // Send notifications
            await this.#sendRoleUpdateNotifications(user, organizationId, oldRoles, newRoles, updatedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'USER_ROLES_UPDATED',
                entityType: 'user',
                entityId: userId,
                userId: updatedBy,
                details: {
                    organizationId,
                    oldRoles,
                    newRoles,
                    reason
                }
            });

            // Clear caches
            await this.#clearUserCaches(organizationId, userId);

            logger.info('User roles updated', {
                userId,
                organizationId,
                oldRoles,
                newRoles,
                updatedBy
            });

            return orgMembership;
        } catch (error) {
            logger.error('Error updating user roles', {
                error: error.message,
                userId,
                organizationId,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Get user activity timeline
     * @param {string} userId - User ID
     * @param {Object} options - Timeline options
     * @returns {Promise<Array>} Activity timeline
     */
    async getUserActivityTimeline(userId, options = {}) {
        const { limit = 50, startDate, endDate, activityTypes } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('timeline', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build timeline query
            const timelineData = await this.#buildUserTimeline(userId, {
                limit,
                startDate,
                endDate,
                activityTypes
            });

            // Process timeline events
            const processedTimeline = await this.#processTimelineEvents(timelineData);

            // Cache result
            await this.#cacheService.set(cacheKey, processedTimeline, 1800); // 30 minutes

            return processedTimeline;
        } catch (error) {
            logger.error('Error fetching user activity timeline', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Merge duplicate users
     * @param {string} primaryUserId - Primary user ID to keep
     * @param {string} duplicateUserId - Duplicate user ID to merge
     * @param {string} mergedBy - ID of user performing merge
     * @param {Object} options - Merge options
     * @returns {Promise<Object>} Merge results
     */
    async mergeUsers(primaryUserId, duplicateUserId, mergedBy, options = {}) {
        const { mergeStrategy = 'preserve_primary', preserveHistory = true } = options;
        const session = options.session || null;

        try {
            // Get both users
            const [primaryUser, duplicateUser] = await Promise.all([
                UserModel.findById(primaryUserId),
                UserModel.findById(duplicateUserId)
            ]);

            if (!primaryUser || !duplicateUser) {
                throw new NotFoundError('One or both users not found', 'USER_NOT_FOUND');
            }

            // Validate merge operation
            await this.#validateUserMerge(primaryUser, duplicateUser, mergedBy);

            // Perform merge
            const mergeResults = await this.#performUserMerge(
                primaryUser,
                duplicateUser,
                mergedBy,
                { mergeStrategy, preserveHistory, session }
            );

            // Log audit trail
            await this.#auditService.log({
                action: 'USERS_MERGED',
                entityType: 'user',
                entityId: primaryUserId,
                userId: mergedBy,
                details: {
                    duplicateUserId,
                    mergeStrategy,
                    preserveHistory,
                    mergedData: mergeResults.summary
                }
            });

            // Clear caches
            await this.#clearUserCaches(primaryUser.organizations[0]?.organizationId);

            logger.info('Users merged successfully', {
                primaryUserId,
                duplicateUserId,
                mergedBy,
                mergeStrategy
            });

            return mergeResults;
        } catch (error) {
            logger.error('Error merging users', {
                error: error.message,
                primaryUserId,
                duplicateUserId,
                mergedBy
            });
            throw error;
        }
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Setup cleanup intervals for maintenance tasks
     * @private
     */
    #setupCleanupIntervals() {
        // Clean expired cache entries every hour
        setInterval(() => {
            this.#userMetricsCache.clear();
        }, 3600000);

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
     * Validate user creation data
     * @private
     * @param {Object} userData - User data to validate
     * @throws {ValidationError} If validation fails
     */
    async #validateUserCreationData(userData) {
        if (!userData.email) {
            throw new ValidationError('Email is required', 'EMAIL_REQUIRED');
        }

        if (!userData.profile?.firstName) {
            throw new ValidationError('First name is required', 'FIRSTNAME_REQUIRED');
        }

        if (!userData.profile?.lastName) {
            throw new ValidationError('Last name is required', 'LASTNAME_REQUIRED');
        }

        if (userData.password && userData.password.length < 8) {
            throw new ValidationError('Password must be at least 8 characters', 'PASSWORD_TOO_SHORT');
        }

        if (!userData.organizations || userData.organizations.length === 0) {
            throw new ValidationError('User must belong to at least one organization', 'ORGANIZATION_REQUIRED');
        }
    }

    /**
     * Check subscription limits for organization
     * @private
     * @param {string} organizationId - Organization ID to check
     * @throws {ForbiddenError} If limits exceeded
     */
    async #checkSubscriptionLimits(organizationId) {
        // This would integrate with subscription service
        // For now, just check basic user count
        const userCount = await UserModel.countDocuments({
            'organizations.organizationId': organizationId,
            'accountStatus.status': { $in: ['active', 'pending'] }
        });

        // Get organization subscription level (mock implementation)
        const subscriptionLevel = 'professional'; // Would come from organization service
        const limits = this.#subscriptionLimits[subscriptionLevel];

        if (limits.users !== -1 && userCount >= limits.users) {
            throw new ForbiddenError(
                `User limit of ${limits.users} exceeded for ${subscriptionLevel} subscription`,
                'USER_LIMIT_EXCEEDED'
            );
        }
    }

    /**
     * Check for duplicate users
     * @private
     * @param {Object} userData - User data to check
     * @throws {ConflictError} If duplicate found
     */
    async #checkDuplicateUser(userData) {
        const existingUser = await UserModel.findByEmail(userData.email);
        if (existingUser) {
            throw new ConflictError('User with this email already exists', 'USER_EXISTS');
        }

        if (userData.username) {
            const existingUsername = await UserModel.findByUsername(userData.username);
            if (existingUsername) {
                throw new ConflictError('Username already taken', 'USERNAME_TAKEN');
            }
        }
    }

    /**
     * Enrich user data with defaults and computed values
     * @private
     * @param {Object} userData - Original user data
     * @param {string} createdBy - ID of user creating this user
     * @returns {Promise<Object>} Enriched user data
     */
    async #enrichUserData(userData, createdBy) {
        const enriched = { ...userData };

        // Set metadata
        enriched.metadata = {
            source: 'manual',
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
                threatLevel: 'none'
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

        return enriched;
    }

    /**
     * Create associated user records (profile, settings, preferences)
     * @private
     * @param {string} userId - User ID
     * @param {Object} userData - Original user data
     * @param {string} createdBy - ID of user creating this user
     * @param {Object} session - Database session
     */
    async #createUserAssociatedRecords(userId, userData, createdBy, session) {
        const promises = [];

        // Create user profile if data provided
        if (userData.profileData) {
            promises.push(
                UserProfileModel.createProfile(userId, userData.profileData).catch(error => {
                    logger.warn('Failed to create user profile', { userId, error: error.message });
                })
            );
        }

        // Create user settings
        promises.push(
            UserSettingsModel.createDefaultSettings(userId, userData.organizationId).catch(error => {
                logger.warn('Failed to create user settings', { userId, error: error.message });
            })
        );

        // Create user preferences
        promises.push(
            UserPreferencesModel.createDefaultPreferences(userId, userData.organizationId).catch(error => {
                logger.warn('Failed to create user preferences', { userId, error: error.message });
            })
        );

        await Promise.all(promises);
    }

    /**
     * Send user creation notifications
     * @private
     * @param {Object} user - Created user object
     * @param {string} createdBy - ID of user who created this user
     */
    async #sendUserCreationNotifications(user, createdBy) {
        try {
            // Send welcome email to user
            await this.#emailService.sendWelcomeEmail(user.email, {
                firstName: user.profile.firstName,
                verificationToken: await user.generateEmailVerificationToken()
            });

            // Send notification to administrators
            await this.#notificationService.sendNotification({
                type: 'USER_CREATED',
                recipients: [createdBy],
                data: {
                    userId: user._id,
                    userEmail: user.email,
                    userName: `${user.profile.firstName} ${user.profile.lastName}`
                }
            });
        } catch (error) {
            logger.warn('Failed to send user creation notifications', {
                userId: user._id,
                error: error.message
            });
        }
    }

    /**
     * Generate cache key for user-related data
     * @private
     * @param {string} type - Cache type
     * @param {string} identifier - Unique identifier
     * @param {Object} options - Additional options for key generation
     * @returns {string} Cache key
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
     * @param {string} organizationId - Organization ID
     * @param {string} userId - Optional specific user ID
     */
    async #clearUserCaches(organizationId, userId = null) {
        const patterns = [
            'user:analytics:*',
            `user:org:${organizationId}:*`
        ];

        if (userId) {
            patterns.push(`user:user:${userId}:*`);
            patterns.push(`user:timeline:${userId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Check user access permissions
     * @private
     * @param {Object} user - User object to check access for
     * @param {string} requesterId - ID of user requesting access
     * @param {string} operation - Operation type (read, update, delete)
     * @throws {ForbiddenError} If access denied
     */
    async #checkUserAccess(user, requesterId, operation) {
        // Self-access is always allowed
        if (user._id.toString() === requesterId) {
            return;
        }

        // Get requester's roles and permissions
        const requester = await UserModel.findById(requesterId);
        if (!requester) {
            throw new ForbiddenError('Requester not found', 'REQUESTER_NOT_FOUND');
        }

        // Check if requester has admin role in any shared organization
        const sharedOrgs = user.organizations.filter(userOrg =>
            requester.organizations.some(reqOrg =>
                reqOrg.organizationId.toString() === userOrg.organizationId.toString()
            )
        );

        if (sharedOrgs.length === 0) {
            throw new ForbiddenError('No shared organization access', 'NO_SHARED_ACCESS');
        }

        // Check role hierarchy
        const hasPermission = sharedOrgs.some(org => {
            const requesterOrgMembership = requester.organizations.find(
                reqOrg => reqOrg.organizationId.toString() === org.organizationId.toString()
            );

            if (!requesterOrgMembership) return false;

            const requesterRoles = requesterOrgMembership.roles.map(r => r.roleName);
            const hasAdminRole = requesterRoles.some(role => 
                ['super_admin', 'admin', 'manager'].includes(role)
            );

            return hasAdminRole;
        });

        if (!hasPermission) {
            throw new ForbiddenError(
                `Insufficient permissions for ${operation} operation`,
                'INSUFFICIENT_PERMISSIONS'
            );
        }
    }

    /**
     * Apply population to user query
     * @private
     * @param {Query} query - Mongoose query object
     * @param {Array} populate - Population options
     * @returns {Query} Modified query
     */
    #applyPopulation(query, populate) {
        if (populate.includes('organizations')) {
            query = query.populate('organizations.organizationId', 'name description');
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

        return query;
    }

    /**
     * Enrich user with calculated metrics
     * @private
     * @param {Object} user - User object
     * @returns {Promise<Object>} Enriched user object
     */
    async #enrichUserWithMetrics(user) {
        // Check cache first
        const cacheKey = `metrics:${user._id}`;
        let metrics = this.#userMetricsCache.get(cacheKey);

        if (!metrics) {
            metrics = {
                loginCount: user.activity?.loginCount || 0,
                lastLoginDaysAgo: user.activity?.lastLoginAt ? 
                    Math.floor((Date.now() - user.activity.lastLoginAt) / (1000 * 60 * 60 * 24)) : null,
                organizationCount: user.organizations?.length || 0,
                isEmailVerified: user.verification?.email?.verified || false,
                isPhoneVerified: user.verification?.phone?.verified || false,
                isMfaEnabled: user.mfa?.enabled || false,
                riskScore: user.security?.riskScore || 0,
                completenessScore: this.#calculateProfileCompleteness(user),
                accountAge: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))
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
     * @param {Object} user - User object
     * @returns {number} Completeness score (0-100)
     */
    #calculateProfileCompleteness(user) {
        let score = 0;
        const maxScore = 100;

        // Basic profile information (40 points)
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
     * Sanitize user output by removing sensitive fields
     * @private
     * @param {Object} user - User object to sanitize
     * @returns {Object} Sanitized user object
     */
    #sanitizeUserOutput(user) {
        const sanitized = { ...user };

        // Remove sensitive fields
        delete sanitized.password;
        delete sanitized.passwordHistory;
        delete sanitized.security?.passwordReset;
        delete sanitized.security?.securityQuestions;
        delete sanitized.mfa?.methods?.forEach?.(method => delete method.secret);
        delete sanitized.apiAccess?.keys?.forEach?.(key => delete key.key);

        return sanitized;
    }

    /**
     * Validate user update data
     * @private
     * @param {Object} updateData - Data to validate
     * @param {Object} existingUser - Existing user object
     * @throws {ValidationError} If validation fails
     */
    async #validateUserUpdateData(updateData, existingUser) {
        // Validate email change
        if (updateData.email && updateData.email !== existingUser.email) {
            const existingEmailUser = await UserModel.findByEmail(updateData.email);
            if (existingEmailUser && existingEmailUser._id.toString() !== existingUser._id.toString()) {
                throw new ValidationError('Email already in use', 'EMAIL_IN_USE');
            }
        }

        // Validate username change
        if (updateData.username && updateData.username !== existingUser.username) {
            const existingUsernameUser = await UserModel.findByUsername(updateData.username);
            if (existingUsernameUser && existingUsernameUser._id.toString() !== existingUser._id.toString()) {
                throw new ValidationError('Username already taken', 'USERNAME_TAKEN');
            }
        }

        // Validate password requirements
        if (updateData.password) {
            await existingUser.validatePasswordPolicy(updateData.password);
        }
    }

    /**
     * Check for update conflicts
     * @private
     * @param {string} userId - User ID being updated
     * @param {Object} updateData - Update data
     * @throws {ConflictError} If conflicts found
     */
    async #checkUpdateConflicts(userId, updateData) {
        // Check if user is currently being updated by another process
        const transactionKey = `update:${userId}`;
        if (this.#pendingTransactions.has(transactionKey)) {
            throw new ConflictError('User is currently being updated', 'UPDATE_IN_PROGRESS');
        }

        // Register this update
        this.#pendingTransactions.set(transactionKey, {
            startTime: Date.now(),
            operation: 'update'
        });

        // Clean up after operation
        setTimeout(() => {
            this.#pendingTransactions.delete(transactionKey);
        }, 60000); // 1 minute timeout
    }

    /**
     * Process update data with business logic
     * @private
     * @param {Object} updateData - Raw update data
     * @param {Object} existingUser - Existing user object
     * @param {string} updatedBy - ID of user making update
     * @returns {Promise<Object>} Processed update data
     */
    async #processUpdateData(updateData, existingUser, updatedBy) {
        const processed = { ...updateData };

        // Handle email change
        if (processed.email && processed.email !== existingUser.email) {
            processed.verification = {
                ...existingUser.verification,
                email: {
                    verified: false,
                    attempts: 0
                }
            };
        }

        // Handle account status changes
        if (processed.accountStatus?.status && 
            processed.accountStatus.status !== existingUser.accountStatus.status) {
            
            if (!processed.accountStatus.statusHistory) {
                processed.accountStatus.statusHistory = [...existingUser.accountStatus.statusHistory];
            }

            processed.accountStatus.statusHistory.push({
                status: processed.accountStatus.status,
                reason: processed.accountStatus.reason || 'Admin update',
                changedAt: new Date(),
                changedBy: updatedBy
            });
        }

        // Update last modified metadata
        processed.lastModifiedAt = new Date();
        processed.lastModifiedBy = updatedBy;

        return processed;
    }

    /**
     * Update related records when user is updated
     * @private
     * @param {string} userId - User ID
     * @param {Object} updateData - Update data
     * @param {string} updatedBy - ID of user making update
     * @param {Object} session - Database session
     */
    async #updateRelatedRecords(userId, updateData, updatedBy, session) {
        const promises = [];

        // Update profile if profile-related data changed
        if (updateData.profile) {
            promises.push(
                UserProfileModel.findOneAndUpdate(
                    { userId },
                    { 
                        'personal.fullName': updateData.profile.firstName && updateData.profile.lastName ?
                            `${updateData.profile.firstName} ${updateData.profile.lastName}` : undefined,
                        'metadata.lastUpdatedBy': updatedBy
                    },
                    { session }
                ).catch(error => {
                    logger.warn('Failed to update user profile', { userId, error: error.message });
                })
            );
        }

        // Update settings if settings-related data changed
        if (updateData.preferences || updateData.security) {
            const settingsUpdate = {};
            if (updateData.security) {
                settingsUpdate['security.twoFactor.required'] = updateData.mfa?.enabled;
            }
            if (Object.keys(settingsUpdate).length > 0) {
                promises.push(
                    UserSettingsModel.findOneAndUpdate(
                        { userId },
                        { 
                            ...settingsUpdate,
                            'metadata.lastUpdatedBy': updatedBy
                        },
                        { session }
                    ).catch(error => {
                        logger.warn('Failed to update user settings', { userId, error: error.message });
                    })
                );
            }
        }

        await Promise.all(promises);
    }

    /**
     * Send update notifications for significant changes
     * @private
     * @param {Object} oldUser - User before update
     * @param {Object} newUser - User after update
     * @param {string} updatedBy - ID of user who made update
     */
    async #sendUpdateNotifications(oldUser, newUser, updatedBy) {
        try {
            const significantChanges = [];

            // Check for email change
            if (oldUser.email !== newUser.email) {
                significantChanges.push('email');
                
                // Send verification email for new email
                await this.#emailService.sendEmailVerification(newUser.email, {
                    firstName: newUser.profile.firstName,
                    verificationToken: await newUser.generateEmailVerificationToken()
                });
            }

            // Check for role changes
            if (JSON.stringify(oldUser.organizations) !== JSON.stringify(newUser.organizations)) {
                significantChanges.push('roles');
            }

            // Check for account status change
            if (oldUser.accountStatus.status !== newUser.accountStatus.status) {
                significantChanges.push('account_status');
            }

            // Send notifications if there were significant changes
            if (significantChanges.length > 0) {
                await this.#notificationService.sendNotification({
                    type: 'USER_UPDATED',
                    recipients: [newUser._id.toString(), updatedBy],
                    data: {
                        userId: newUser._id,
                        changes: significantChanges
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
     * @param {Object} oldUser - User before update
     * @param {Object} newUser - User after update
     * @returns {Object} Changes summary
     */
    #calculateChanges(oldUser, newUser) {
        const changes = {};

        // Compare key fields
        const fieldsToCompare = [
            'email', 'username', 'accountStatus.status',
            'profile.firstName', 'profile.lastName'
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
     * @param {Object} obj - Object to get value from
     * @param {string} path - Dot-separated path
     * @returns {*} Value at path
     */
    #getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Build search query from parameters
     * @private
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} MongoDB query object
     */
    async #buildSearchQuery(searchParams, options = {}) {
        const query = {};

        // Base filters
        if (!options.includeDeleted) {
            query['accountStatus.status'] = { $ne: 'deleted' };
        }

        if (options.organizationId) {
            query['organizations.organizationId'] = options.organizationId;
        }

        // Email filter
        if (searchParams.email) {
            query.email = new RegExp(searchParams.email, 'i');
        }

        // Name filter
        if (searchParams.name) {
            query.$or = [
                { 'profile.firstName': new RegExp(searchParams.name, 'i') },
                { 'profile.lastName': new RegExp(searchParams.name, 'i') },
                { 'profile.displayName': new RegExp(searchParams.name, 'i') }
            ];
        }

        // Status filter
        if (searchParams.status && Array.isArray(searchParams.status)) {
            query['accountStatus.status'] = { $in: searchParams.status };
        }

        // Role filter
        if (searchParams.roles && Array.isArray(searchParams.roles)) {
            query['organizations.roles.roleName'] = { $in: searchParams.roles };
        }

        // Date range filters
        if (searchParams.createdAfter || searchParams.createdBefore) {
            query.createdAt = {};
            if (searchParams.createdAfter) {
                query.createdAt.$gte = new Date(searchParams.createdAfter);
            }
            if (searchParams.createdBefore) {
                query.createdAt.$lte = new Date(searchParams.createdBefore);
            }
        }

        // Last login filter
        if (searchParams.lastLoginAfter || searchParams.lastLoginBefore) {
            query['activity.lastLoginAt'] = {};
            if (searchParams.lastLoginAfter) {
                query['activity.lastLoginAt'].$gte = new Date(searchParams.lastLoginAfter);
            }
            if (searchParams.lastLoginBefore) {
                query['activity.lastLoginAt'].$lte = new Date(searchParams.lastLoginBefore);
            }
        }

        // Verification status filters
        if (searchParams.emailVerified !== undefined) {
            query['verification.email.verified'] = searchParams.emailVerified;
        }

        if (searchParams.mfaEnabled !== undefined) {
            query['mfa.enabled'] = searchParams.mfaEnabled;
        }

        return query;
    }

    /**
     * Process search aggregations
     * @private
     * @param {Object} aggregationData - Raw aggregation data
     * @returns {Object} Processed aggregations
     */
    #processSearchAggregations(aggregationData) {
        if (!aggregationData) {
            return {};
        }

        const processed = {};

        // Process status breakdown
        if (aggregationData.statusBreakdown) {
            processed.statusBreakdown = aggregationData.statusBreakdown.reduce((acc, status) => {
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {});
        }

        // Process role breakdown
        if (aggregationData.roleBreakdown) {
            processed.roleBreakdown = aggregationData.roleBreakdown.flat().reduce((acc, role) => {
                if (role) {
                    acc[role] = (acc[role] || 0) + 1;
                }
                return acc;
            }, {});
        }

        return processed;
    }

    /**
     * Process bulk user batch
     * @private
     * @param {Array} batch - Batch of user data
     * @param {string} createdBy - ID of user creating users
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Batch results
     */
    async #processBulkUserBatch(batch, createdBy, options = {}) {
        const results = {
            successful: [],
            failed: [],
            skipped: []
        };

        for (const userData of batch) {
            try {
                if (options.validateOnly) {
                    await this.#validateUserCreationData(userData);
                    results.successful.push({ email: userData.email, status: 'valid' });
                } else {
                    const user = await this.createUser(userData, createdBy, {
                        autoActivate: true,
                        skipNotifications: true
                    });
                    results.successful.push({
                        userId: user._id,
                        email: user.email,
                        username: user.username
                    });
                }
            } catch (error) {
                if (error.code === 'USER_EXISTS') {
                    results.skipped.push({
                        email: userData.email,
                        reason: 'User already exists'
                    });
                } else {
                    results.failed.push({
                        email: userData.email,
                        error: error.message,
                        code: error.code
                    });
                }
            }
        }

        return results;
    }
}

module.exports = UserService;