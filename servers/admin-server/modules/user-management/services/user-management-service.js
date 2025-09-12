'use strict';

/**
 * @fileoverview User management service for comprehensive platform user operations
 * @module servers/admin-server/modules/user-management/services/user-management-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:servers/admin-server/modules/user-management/models/admin-user-model
 * @requires module:servers/admin-server/modules/user-management/models/user-permission-model
 * @requires module:servers/admin-server/modules/user-management/models/admin-session-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/webhook-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const User = require('../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-model');
const Organization = require('../../../../../shared/lib/database/models/customer-services/hosted-organizations/organizations/organization-model');
const AdminUser = require('../models/admin-user-model');
const UserPermission = require('../models/user-permission-model');
const AdminSession = require('../models/admin-session-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const HashService = require('../../../../../shared/lib/security/encryption/hash-service');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const EmailService = require('../../../../../shared/lib/services/email-service');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const WebhookService = require('../../../../../shared/lib/services/webhook-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * User management service for platform-wide user operations
 * @class UserManagementService
 */
class UserManagementService {
    /**
     * Private fields
     */
    #cachePrefix = 'platform:users:';
    #cacheTTL = 600; // 10 minutes
    #batchSize = 100;
    #maxExportRecords = 10000;
    #searchLimit = 50;
    #passwordPolicy = {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAge: 90, // days
        historyCount: 5,
        preventCommon: true
    };
    #accountLockPolicy = {
        maxFailedAttempts: 5,
        lockoutDuration: 1800000, // 30 minutes
        permanentLockThreshold: 10
    };
    #sessionPolicy = {
        maxConcurrentSessions: 5,
        sessionTimeout: 3600000, // 1 hour
        idleTimeout: 900000, // 15 minutes
        requireMFA: false
    };
    #dataRetentionPolicy = {
        activeUserRetention: null, // indefinite
        inactiveUserRetention: 365, // days
        deletedUserRetention: 90, // days
        auditLogRetention: 2555 // 7 years
    };

    #emailService;
    #cacheService;
    #notificationService;
    #webhookService;
    #encryptionService;

    /**
     * Constructor
     */
    constructor() {
        this.#emailService = new EmailService();
        this.#cacheService = new CacheService();
        this.#notificationService = new NotificationService();
        this.#webhookService = new WebhookService();
        this.#encryptionService = new EncryptionService();

        logger.info('UserManagementService initialized');
    }

    /**
     * Create a new platform user
     * @param {Object} userData - User creation data
     * @param {Object} options - Creation options
     * @param {string} createdBy - Admin user ID creating the user
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData, options = {}, createdBy) {
        try {
            logger.info(`Creating new platform user: ${userData.email}`);

            // Validate user data
            await this.#validateUserCreation(userData);

            // Check for existing user
            const existingUser = await this.#checkExistingUser(userData);
            if (existingUser) {
                throw new AppError('User already exists with this email or username', 409);
            }

            // Prepare user data
            const preparedData = await this.#prepareUserData(userData, options);

            // Handle user creation based on type
            let createdUser;

            switch (options.userType) {
                case 'CUSTOMER':
                    createdUser = await this.#createCustomerUser(preparedData, options);
                    break;

                case 'PARTNER':
                    createdUser = await this.#createPartnerUser(preparedData, options);
                    break;

                case 'EMPLOYEE':
                    createdUser = await this.#createEmployeeUser(preparedData, options);
                    break;

                case 'CONTRACTOR':
                    createdUser = await this.#createContractorUser(preparedData, options);
                    break;

                case 'API_USER':
                    createdUser = await this.#createAPIUser(preparedData, options);
                    break;

                case 'SERVICE_ACCOUNT':
                    createdUser = await this.#createServiceAccount(preparedData, options);
                    break;

                default:
                    createdUser = await this.#createStandardUser(preparedData, options);
            }

            // Assign to organization if specified
            if (options.organizationId) {
                await this.#assignToOrganization(createdUser._id, options.organizationId, options.role);
            }

            // Set up initial permissions
            await this.#setupInitialPermissions(createdUser, options);

            // Send welcome communications
            await this.#sendWelcomeCommunications(createdUser, options);

            // Trigger webhooks
            await this.#triggerUserCreationWebhooks(createdUser, createdBy);

            // Log audit event
            await this.#logUserManagementAudit('USER_CREATED', {
                userId: createdUser._id,
                userType: options.userType,
                createdBy,
                metadata: options.metadata
            });

            // Cache the new user
            await this.#cacheUser(createdUser);

            logger.info(`User created successfully: ${createdUser._id}`);

            return this.#sanitizeUserResponse(createdUser);

        } catch (error) {
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Get user by ID or identifier
     * @param {string} identifier - User ID, email, or username
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User data
     */
    async getUser(identifier, options = {}) {
        try {
            logger.debug(`Fetching user: ${identifier}`);

            // Check cache first
            const cacheKey = `${this.#cachePrefix}${identifier}`;
            const cachedUser = await this.#cacheService.get(cacheKey);

            if (cachedUser && !options.skipCache) {
                logger.debug('Returning cached user');
                return cachedUser;
            }

            // Build query
            const query = this.#buildUserQuery(identifier);

            // Fetch user with relationships
            let user = await User.findOne(query)
                .populate(options.populate || 'organization')
                .lean();

            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Enrich with additional data based on options
            if (options.includePermissions) {
                user.permissions = await this.#getUserPermissions(user._id);
            }

            if (options.includeActivity) {
                user.activity = await this.#getUserActivity(user._id);
            }

            if (options.includeOrganizations) {
                user.organizations = await this.#getUserOrganizations(user._id);
            }

            if (options.includeMetrics) {
                user.metrics = await this.#getUserMetrics(user._id);
            }

            if (options.includeSecurityInfo) {
                user.security = await this.#getUserSecurityInfo(user._id);
            }

            // Cache the result
            await this.#cacheService.set(cacheKey, user, this.#cacheTTL);

            return this.#sanitizeUserResponse(user);

        } catch (error) {
            logger.error('Error fetching user:', error);
            throw error;
        }
    }

    /**
     * Update user information
     * @param {string} userId - User ID
     * @param {Object} updateData - Update data
     * @param {string} updatedBy - Admin performing update
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(userId, updateData, updatedBy) {
        try {
            logger.info(`Updating user: ${userId}`);

            // Fetch current user
            const user = await User.findById(userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Validate update permissions
            await this.#validateUpdatePermissions(user, updateData, updatedBy);

            // Process different update types
            const updateType = this.#determineUpdateType(updateData);
            let updateResult;

            switch (updateType) {
                case 'PROFILE':
                    updateResult = await this.#updateUserProfile(user, updateData);
                    break;

                case 'CONTACT':
                    updateResult = await this.#updateUserContact(user, updateData);
                    break;

                case 'SECURITY':
                    updateResult = await this.#updateUserSecurity(user, updateData, updatedBy);
                    break;

                case 'PREFERENCES':
                    updateResult = await this.#updateUserPreferences(user, updateData);
                    break;

                case 'STATUS':
                    updateResult = await this.#updateUserStatus(user, updateData, updatedBy);
                    break;

                case 'ORGANIZATION':
                    updateResult = await this.#updateUserOrganization(user, updateData, updatedBy);
                    break;

                case 'METADATA':
                    updateResult = await this.#updateUserMetadata(user, updateData);
                    break;

                case 'CUSTOM_FIELDS':
                    updateResult = await this.#updateUserCustomFields(user, updateData);
                    break;

                case 'BULK':
                    updateResult = await this.#processBulkUpdate(user, updateData, updatedBy);
                    break;

                default:
                    updateResult = await this.#processGeneralUpdate(user, updateData);
            }

            // Save changes
            await user.save();

            // Handle post-update actions
            await this.#handlePostUpdateActions(user, updateType, updateData, updatedBy);

            // Invalidate cache
            await this.#invalidateUserCache(userId);

            // Trigger webhooks
            await this.#triggerUserUpdateWebhooks(user, updateData, updatedBy);

            // Log audit
            await this.#logUserManagementAudit('USER_UPDATED', {
                userId,
                updateType,
                changes: updateData,
                updatedBy
            });

            logger.info(`User ${userId} updated successfully`);

            return this.#sanitizeUserResponse(user);

        } catch (error) {
            logger.error('Error updating user:', error);
            throw error;
        }
    }

    /**
     * Delete or deactivate user
     * @param {string} userId - User ID
     * @param {Object} options - Deletion options
     * @param {string} deletedBy - Admin performing deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteUser(userId, options = {}, deletedBy) {
        try {
            logger.info(`Deleting user: ${userId}`);

            const user = await User.findById(userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Check deletion eligibility
            await this.#checkDeletionEligibility(user, deletedBy);

            let result;

            if (options.hardDelete) {
                // Perform hard delete
                result = await this.#performHardDelete(user, options, deletedBy);
            } else {
                // Perform soft delete (deactivation)
                result = await this.#performSoftDelete(user, options, deletedBy);
            }

            // Handle related data
            await this.#handleUserDeletionRelatedData(user, options);

            // Invalidate all caches
            await this.#invalidateUserCache(userId);

            // Trigger webhooks
            await this.#triggerUserDeletionWebhooks(user, options, deletedBy);

            // Log audit
            await this.#logUserManagementAudit('USER_DELETED', {
                userId,
                deletionType: options.hardDelete ? 'HARD' : 'SOFT',
                deletedBy,
                reason: options.reason
            });

            logger.info(`User ${userId} deleted successfully`);

            return result;

        } catch (error) {
            logger.error('Error deleting user:', error);
            throw error;
        }
    }

    /**
     * List users with advanced filtering
     * @param {Object} filters - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated user list
     */
    async listUsers(filters = {}, options = {}) {
        try {
            logger.debug('Listing users with filters:', filters);

            // Build aggregation pipeline
            const pipeline = this.#buildUserAggregationPipeline(filters, options);

            // Add pagination
            const page = parseInt(options.page) || 1;
            const limit = Math.min(parseInt(options.limit) || 20, 100);
            const skip = (page - 1) * limit;

            // Execute aggregation
            const result = await User.aggregate([
                ...pipeline,
                {
                    $facet: {
                        metadata: [{ $count: 'total' }],
                        users: [
                            { $skip: skip },
                            { $limit: limit }
                        ]
                    }
                }
            ]);

            const totalCount = result[0]?.metadata[0]?.total || 0;
            const users = result[0]?.users || [];

            // Enrich users with additional data if requested
            const enrichedUsers = await this.#enrichUserList(users, options);

            return {
                users: enrichedUsers.map(u => this.#sanitizeUserResponse(u)),
                pagination: {
                    page,
                    limit,
                    totalPages: Math.ceil(totalCount / limit),
                    totalCount,
                    hasNext: page * limit < totalCount,
                    hasPrev: page > 1
                },
                filters: filters,
                sort: options.sortBy || 'createdAt'
            };

        } catch (error) {
            logger.error('Error listing users:', error);
            throw error;
        }
    }

    /**
     * Search users across multiple fields
     * @param {string} searchQuery - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async searchUsers(searchQuery, options = {}) {
        try {
            logger.debug(`Searching users: ${searchQuery}`);

            // Build search query
            const searchConditions = this.#buildSearchConditions(searchQuery, options);

            // Add additional filters
            if (options.filters) {
                Object.assign(searchConditions, this.#buildFilterConditions(options.filters));
            }

            // Execute search
            const users = await User.find(searchConditions)
                .populate(options.populate || '')
                .limit(options.limit || this.#searchLimit)
                .sort(options.sortBy || '-score')
                .lean();

            // Calculate relevance scores
            const scoredUsers = this.#calculateSearchRelevance(users, searchQuery);

            // Sort by relevance
            scoredUsers.sort((a, b) => b.relevanceScore - a.relevanceScore);

            return scoredUsers.map(u => this.#sanitizeUserResponse(u));

        } catch (error) {
            logger.error('Error searching users:', error);
            throw error;
        }
    }

    /**
     * Bulk create users
     * @param {Array} usersData - Array of user data
     * @param {Object} options - Bulk creation options
     * @param {string} createdBy - Admin creating users
     * @returns {Promise<Object>} Bulk creation result
     */
    async bulkCreateUsers(usersData, options = {}, createdBy) {
        try {
            logger.info(`Bulk creating ${usersData.length} users`);

            const results = {
                created: [],
                failed: [],
                skipped: [],
                totalProcessed: 0
            };

            // Validate bulk data
            await this.#validateBulkUserData(usersData);

            // Process in batches
            const batches = this.#createBatches(usersData, this.#batchSize);

            for (const batch of batches) {
                const batchResults = await this.#processBulkCreateBatch(batch, options, createdBy);

                results.created.push(...batchResults.created);
                results.failed.push(...batchResults.failed);
                results.skipped.push(...batchResults.skipped);
                results.totalProcessed += batch.length;

                // Progress callback
                if (options.onProgress) {
                    options.onProgress({
                        processed: results.totalProcessed,
                        total: usersData.length,
                        percentage: Math.round((results.totalProcessed / usersData.length) * 100)
                    });
                }
            }

            // Send summary notification
            await this.#sendBulkOperationSummary('CREATE', results, createdBy);

            // Log audit
            await this.#logUserManagementAudit('BULK_USER_CREATE', {
                results,
                createdBy,
                options
            });

            logger.info(`Bulk creation completed: ${results.created.length} created, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk user creation:', error);
            throw error;
        }
    }

    /**
     * Bulk update users
     * @param {Array} userIds - User IDs to update
     * @param {Object} updateData - Update data
     * @param {Object} options - Update options
     * @param {string} updatedBy - Admin performing update
     * @returns {Promise<Object>} Bulk update result
     */
    async bulkUpdateUsers(userIds, updateData, options = {}, updatedBy) {
        try {
            logger.info(`Bulk updating ${userIds.length} users`);

            const results = {
                updated: [],
                failed: [],
                skipped: [],
                totalProcessed: 0
            };

            // Validate bulk update
            await this.#validateBulkUpdate(userIds, updateData, updatedBy);

            // Process in batches
            const batches = this.#createBatches(userIds, this.#batchSize);

            for (const batch of batches) {
                const batchResults = await this.#processBulkUpdateBatch(batch, updateData, options, updatedBy);

                results.updated.push(...batchResults.updated);
                results.failed.push(...batchResults.failed);
                results.skipped.push(...batchResults.skipped);
                results.totalProcessed += batch.length;

                // Progress callback
                if (options.onProgress) {
                    options.onProgress({
                        processed: results.totalProcessed,
                        total: userIds.length,
                        percentage: Math.round((results.totalProcessed / userIds.length) * 100)
                    });
                }
            }

            // Invalidate caches
            await this.#invalidateBulkUserCaches(results.updated);

            // Send summary
            await this.#sendBulkOperationSummary('UPDATE', results, updatedBy);

            // Log audit
            await this.#logUserManagementAudit('BULK_USER_UPDATE', {
                results,
                updateData,
                updatedBy,
                options
            });

            logger.info(`Bulk update completed: ${results.updated.length} updated, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk user update:', error);
            throw error;
        }
    }

    /**
     * Bulk delete users
     * @param {Array} userIds - User IDs to delete
     * @param {Object} options - Deletion options
     * @param {string} deletedBy - Admin performing deletion
     * @returns {Promise<Object>} Bulk deletion result
     */
    async bulkDeleteUsers(userIds, options = {}, deletedBy) {
        try {
            logger.info(`Bulk deleting ${userIds.length} users`);

            const results = {
                deleted: [],
                failed: [],
                skipped: [],
                totalProcessed: 0
            };

            // Validate bulk deletion
            await this.#validateBulkDeletion(userIds, deletedBy);

            // Process in batches
            const batches = this.#createBatches(userIds, this.#batchSize);

            for (const batch of batches) {
                const batchResults = await this.#processBulkDeleteBatch(batch, options, deletedBy);

                results.deleted.push(...batchResults.deleted);
                results.failed.push(...batchResults.failed);
                results.skipped.push(...batchResults.skipped);
                results.totalProcessed += batch.length;

                // Progress callback
                if (options.onProgress) {
                    options.onProgress({
                        processed: results.totalProcessed,
                        total: userIds.length,
                        percentage: Math.round((results.totalProcessed / userIds.length) * 100)
                    });
                }
            }

            // Invalidate caches
            await this.#invalidateBulkUserCaches(results.deleted);

            // Send summary
            await this.#sendBulkOperationSummary('DELETE', results, deletedBy);

            // Log audit
            await this.#logUserManagementAudit('BULK_USER_DELETE', {
                results,
                deletedBy,
                options
            });

            logger.info(`Bulk deletion completed: ${results.deleted.length} deleted, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk user deletion:', error);
            throw error;
        }
    }

    /**
     * Import users from external source
     * @param {Object} importData - Import data
     * @param {Object} options - Import options
     * @param {string} importedBy - Admin performing import
     * @returns {Promise<Object>} Import result
     */
    async importUsers(importData, options = {}, importedBy) {
        try {
            logger.info('Importing users from external source');

            // Parse import data based on format
            let parsedUsers;

            switch (options.format) {
                case 'CSV':
                    parsedUsers = await this.#parseCSVImport(importData);
                    break;

                case 'JSON':
                    parsedUsers = await this.#parseJSONImport(importData);
                    break;

                case 'EXCEL':
                    parsedUsers = await this.#parseExcelImport(importData);
                    break;

                case 'XML':
                    parsedUsers = await this.#parseXMLImport(importData);
                    break;

                default:
                    throw new AppError('Unsupported import format', 400);
            }

            // Validate imported data
            const validationResult = await this.#validateImportedUsers(parsedUsers);

            if (validationResult.errors.length > 0 && !options.skipInvalid) {
                throw new AppError('Import validation failed', 400, validationResult.errors);
            }

            // Map fields if mapping provided
            if (options.fieldMapping) {
                parsedUsers = this.#applyFieldMapping(parsedUsers, options.fieldMapping);
            }

            // Process import
            const importResult = await this.#processUserImport(
                validationResult.valid,
                options,
                importedBy
            );

            // Generate import report
            const report = await this.#generateImportReport(importResult);

            // Send import summary
            await this.#sendImportSummary(report, importedBy);

            // Log audit
            await this.#logUserManagementAudit('USER_IMPORT', {
                format: options.format,
                totalRecords: parsedUsers.length,
                results: importResult,
                importedBy
            });

            logger.info(`Import completed: ${importResult.imported} imported, ${importResult.failed} failed`);

            return report;

        } catch (error) {
            logger.error('Error importing users:', error);
            throw error;
        }
    }

    /**
     * Export users to specified format
     * @param {Object} filters - Export filters
     * @param {Object} options - Export options
     * @param {string} exportedBy - Admin performing export
     * @returns {Promise<Object>} Export result
     */
    async exportUsers(filters = {}, options = {}, exportedBy) {
        try {
            logger.info('Exporting users');

            // Check export permissions
            await this.#checkExportPermissions(exportedBy, options);

            // Build query
            const query = this.#buildExportQuery(filters);

            // Get total count
            const totalCount = await User.countDocuments(query);

            if (totalCount > this.#maxExportRecords && !options.allowLarge) {
                throw new AppError(`Export exceeds maximum records (${this.#maxExportRecords})`, 400);
            }

            // Fetch users with selected fields
            const users = await User.find(query)
                .select(options.fields || '-password -__v')
                .populate(options.populate || '')
                .lean();

            // Apply data transformations
            const transformedUsers = await this.#transformExportData(users, options);

            // Format data based on export format
            let exportData;

            switch (options.format) {
                case 'CSV':
                    exportData = await this.#formatAsCSV(transformedUsers, options);
                    break;

                case 'JSON':
                    exportData = await this.#formatAsJSON(transformedUsers, options);
                    break;

                case 'EXCEL':
                    exportData = await this.#formatAsExcel(transformedUsers, options);
                    break;

                case 'PDF':
                    exportData = await this.#formatAsPDF(transformedUsers, options);
                    break;

                case 'XML':
                    exportData = await this.#formatAsXML(transformedUsers, options);
                    break;

                default:
                    throw new AppError('Unsupported export format', 400);
            }

            // Encrypt if required
            if (options.encrypt) {
                exportData = await this.#encryptExportData(exportData, options.encryptionKey);
            }

            // Log audit
            await this.#logUserManagementAudit('USER_EXPORT', {
                filters,
                format: options.format,
                recordCount: users.length,
                exportedBy,
                encrypted: options.encrypt || false
            });

            logger.info(`Exported ${users.length} users in ${options.format} format`);

            return {
                data: exportData,
                metadata: {
                    format: options.format,
                    recordCount: users.length,
                    exportedAt: new Date(),
                    exportedBy,
                    filters: filters,
                    encrypted: options.encrypt || false
                }
            };

        } catch (error) {
            logger.error('Error exporting users:', error);
            throw error;
        }
    }

    /**
     * Merge duplicate user accounts
     * @param {string} primaryUserId - Primary user ID to keep
     * @param {Array} duplicateUserIds - Duplicate user IDs to merge
     * @param {Object} options - Merge options
     * @param {string} mergedBy - Admin performing merge
     * @returns {Promise<Object>} Merge result
     */
    async mergeUsers(primaryUserId, duplicateUserIds, options = {}, mergedBy) {
        try {
            logger.info(`Merging ${duplicateUserIds.length} users into ${primaryUserId}`);

            // Validate merge operation
            await this.#validateMergeOperation(primaryUserId, duplicateUserIds);

            // Fetch all users
            const primaryUser = await User.findById(primaryUserId);
            const duplicateUsers = await User.find({ _id: { $in: duplicateUserIds } });

            if (!primaryUser) {
                throw new AppError('Primary user not found', 404);
            }

            if (duplicateUsers.length !== duplicateUserIds.length) {
                throw new AppError('Some duplicate users not found', 404);
            }

            // Merge user data
            const mergeResult = await this.#performUserMerge(
                primaryUser,
                duplicateUsers,
                options
            );

            // Handle related data migration
            await this.#migrateRelatedData(primaryUser, duplicateUsers, options);

            // Deactivate or delete duplicate accounts
            await this.#handleDuplicateAccounts(duplicateUsers, options, mergedBy);

            // Update primary user
            await primaryUser.save();

            // Send notifications
            await this.#sendMergeNotifications(primaryUser, duplicateUsers, mergedBy);

            // Log audit
            await this.#logUserManagementAudit('USER_MERGE', {
                primaryUserId,
                duplicateUserIds,
                mergeResult,
                mergedBy
            });

            logger.info(`User merge completed successfully`);

            return {
                primaryUser: this.#sanitizeUserResponse(primaryUser),
                mergedData: mergeResult,
                duplicatesHandled: duplicateUserIds.length
            };

        } catch (error) {
            logger.error('Error merging users:', error);
            throw error;
        }
    }

    /**
     * Get user statistics and analytics
     * @param {Object} filters - Statistics filters
     * @param {Object} options - Statistics options
     * @returns {Promise<Object>} User statistics
     */
    async getUserStatistics(filters = {}, options = {}) {
        try {
            logger.debug('Generating user statistics');

            // Check cache for stats
            const cacheKey = `stats:users:${JSON.stringify(filters)}`;
            const cachedStats = await this.#cacheService.get(cacheKey);

            if (cachedStats && !options.skipCache) {
                return cachedStats;
            }

            // Calculate statistics
            const [
                totalStats,
                statusStats,
                registrationStats,
                activityStats,
                demographicStats,
                organizationStats,
                securityStats,
                growthStats
            ] = await Promise.all([
                this.#calculateTotalStatistics(filters),
                this.#calculateStatusStatistics(filters),
                this.#calculateRegistrationStatistics(filters, options),
                this.#calculateActivityStatistics(filters, options),
                this.#calculateDemographicStatistics(filters),
                this.#calculateOrganizationStatistics(filters),
                this.#calculateSecurityStatistics(filters),
                this.#calculateGrowthStatistics(filters, options)
            ]);

            const statistics = {
                summary: totalStats,
                status: statusStats,
                registration: registrationStats,
                activity: activityStats,
                demographics: demographicStats,
                organizations: organizationStats,
                security: securityStats,
                growth: growthStats,
                generatedAt: new Date(),
                filters: filters
            };

            // Cache statistics
            await this.#cacheService.set(cacheKey, statistics, 300); // 5 minutes

            return statistics;

        } catch (error) {
            logger.error('Error generating user statistics:', error);
            throw error;
        }
    }

    /**
     * Verify user email
     * @param {string} userId - User ID
     * @param {string} verificationToken - Verification token
     * @returns {Promise<Object>} Verification result
     */
    async verifyUserEmail(userId, verificationToken) {
        try {
            logger.info(`Verifying email for user: ${userId}`);

            const user = await User.findById(userId);
            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Verify token
            const isValid = await this.#verifyEmailToken(user, verificationToken);
            if (!isValid) {
                throw new AppError('Invalid or expired verification token', 400);
            }

            // Update user
            user.emailVerified = true;
            user.emailVerifiedAt = new Date();
            user.verificationToken = null;
            user.verificationTokenExpires = null;

            await user.save();

            // Send confirmation
            await this.#sendEmailVerificationConfirmation(user);

            // Trigger webhooks
            await this.#triggerEmailVerificationWebhooks(user);

            // Log audit
            await this.#logUserManagementAudit('EMAIL_VERIFIED', {
                userId,
                email: user.email
            });

            logger.info(`Email verified for user: ${userId}`);

            return {
                success: true,
                message: 'Email verified successfully',
                user: this.#sanitizeUserResponse(user)
            };

        } catch (error) {
            logger.error('Error verifying email:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */

    async #calculateActivityStatistics(filters, options) {
        // Example: Calculate user activity statistics (logins, actions, last active)
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: null,
                    lastActiveDates: { $push: "$lastActiveAt" },
                    loginCounts: { $push: "$loginCount" },
                    actionCounts: { $push: "$actionCount" },
                    total: { $sum: 1 }
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        const result = stats[0] || { lastActiveDates: [], loginCounts: [], actionCounts: [], total: 0 };

        // Calculate last active distribution
        const now = new Date();
        let activeToday = 0, activeWeek = 0, activeMonth = 0;
        result.lastActiveDates.forEach(date => {
            if (date) {
                const diff = (now - new Date(date)) / (1000 * 60 * 60 * 24);
                if (diff < 1) activeToday++;
                if (diff < 7) activeWeek++;
                if (diff < 30) activeMonth++;
            }
        });

        // Calculate average logins and actions
        const avgLogins = result.loginCounts.length > 0
            ? result.loginCounts.reduce((a, b) => a + (b || 0), 0) / result.loginCounts.length
            : 0;
        const avgActions = result.actionCounts.length > 0
            ? result.actionCounts.reduce((a, b) => a + (b || 0), 0) / result.actionCounts.length
            : 0;

        return {
            activeToday,
            activeWeek,
            activeMonth,
            avgLogins,
            avgActions,
            total: result.total
        };
    }

    async #calculateDemographicStatistics(filters) {
        // Example: Calculate demographic statistics (gender, age groups, location)
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: null,
                    genderStats: {
                        $push: "$gender"
                    },
                    ageStats: {
                        $push: "$dateOfBirth"
                    },
                    locationStats: {
                        $push: "$location"
                    },
                    total: { $sum: 1 }
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        const result = stats[0] || { genderStats: [], ageStats: [], locationStats: [], total: 0 };

        // Calculate gender distribution
        const genderDistribution = {};
        result.genderStats.forEach(gender => {
            if (gender) {
                genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
            }
        });

        // Calculate age groups
        const ageGroups = { '0-17': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55-64': 0, '65+': 0 };
        const now = new Date();
        result.ageStats.forEach(dob => {
            if (dob) {
                const age = now.getFullYear() - new Date(dob).getFullYear();
                if (age < 18) ageGroups['0-17']++;
                else if (age < 25) ageGroups['18-24']++;
                else if (age < 35) ageGroups['25-34']++;
                else if (age < 45) ageGroups['35-44']++;
                else if (age < 55) ageGroups['45-54']++;
                else if (age < 65) ageGroups['55-64']++;
                else ageGroups['65+']++;
            }
        });

        // Calculate location distribution
        const locationDistribution = {};
        result.locationStats.forEach(location => {
            if (location) {
                locationDistribution[location] = (locationDistribution[location] || 0) + 1;
            }
        });

        return {
            genderDistribution,
            ageGroups,
            locationDistribution,
            total: result.total
        };
    }

    async #calculateSecurityStatistics(filters) {
        // Example: Calculate security-related statistics for users
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: null,
                    twoFactorEnabled: { $sum: { $cond: ["$twoFactorEnabled", 1, 0] } },
                    passwordExpired: { $sum: { $cond: ["$passwordExpired", 1, 0] } },
                    lockedAccounts: { $sum: { $cond: ["$isLocked", 1, 0] } },
                    total: { $sum: 1 }
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        return stats[0] || {
            twoFactorEnabled: 0,
            passwordExpired: 0,
            lockedAccounts: 0,
            total: 0
        };
    }

    async #calculateOrganizationStatistics(filters) {
        // Example: Calculate statistics of users per organization
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: "$organization",
                    userCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "_id",
                    foreignField: "_id",
                    as: "organizationInfo"
                }
            },
            {
                $unwind: {
                    path: "$organizationInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    organizationId: "$_id",
                    organizationName: "$organizationInfo.name",
                    userCount: 1
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        return stats;
    }

    async #calculateGrowthStatistics(filters, options) {
        // Example: Calculate user growth over time (monthly registrations)
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const growthStats = await User.aggregate(pipeline);
        return growthStats.map(stat => ({
            year: stat._id.year,
            month: stat._id.month,
            count: stat.count
        }));
    }

    async #verifyEmailToken(user, verificationToken) {
        // Check if token matches and is not expired
        if (
            !user.verificationToken ||
            !user.verificationTokenExpires ||
            user.verificationToken !== verificationToken
        ) {
            return false;
        }
        if (user.verificationTokenExpires < new Date()) {
            return false;
        }
        return true;
    }

    async #sendEmailVerificationConfirmation(user) {
        try {
            await this.#emailService.send({
                to: user.email,
                subject: 'Your email has been verified',
                template: 'email-verification-confirmation',
                context: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    verifiedAt: user.emailVerifiedAt
                }
            });
            logger.info(`Email verification confirmation sent to ${user.email}`);
        } catch (error) {
            logger.error('Error sending email verification confirmation:', error);
        }
    }

    async #triggerEmailVerificationWebhooks(user) {
        // Example webhook trigger implementation
        try {
            await this.#webhookService.trigger('EMAIL_VERIFIED', {
                userId: user._id,
                email: user.email,
                verifiedAt: user.emailVerifiedAt
            });
        } catch (error) {
            logger.error('Error triggering email verification webhook:', error);
        }
    }

    async #validateUserCreation(userData) {
        // Email validation
        if (!CommonValidator.isValidEmail(userData.email)) {
            throw new AppError('Invalid email format', 400);
        }

        // Username validation
        if (!userData.username || userData.username.length < 3 || userData.username.length > 30) {
            throw new AppError('Username must be between 3 and 30 characters', 400);
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
            throw new AppError('Username can only contain letters, numbers, underscores, and hyphens', 400);
        }

        // Password validation
        if (userData.password && !this.#validatePassword(userData.password)) {
            throw new AppError('Password does not meet security requirements', 400);
        }

        // Required fields
        const requiredFields = ['firstName', 'lastName'];
        for (const field of requiredFields) {
            if (!userData[field]) {
                throw new AppError(`${field} is required`, 400);
            }
        }

        return true;
    }

    #validatePassword(password) {
        if (password.length < this.#passwordPolicy.minLength) {
            return false;
        }

        if (this.#passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
            return false;
        }

        if (this.#passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
            return false;
        }

        if (this.#passwordPolicy.requireNumbers && !/[0-9]/.test(password)) {
            return false;
        }

        if (this.#passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return false;
        }

        return true;
    }

    async #checkExistingUser(userData) {
        return await User.findOne({
            $or: [
                { email: userData.email.toLowerCase() },
                { username: userData.username.toLowerCase() }
            ]
        });
    }

    async #prepareUserData(userData, options) {
        const prepared = {
            ...userData,
            email: userData.email.toLowerCase(),
            username: userData.username.toLowerCase(),
            isActive: options.autoActivate || false,
            emailVerified: options.skipEmailVerification || false,
            createdAt: new Date(),
            metadata: {
                ...userData.metadata,
                creationMethod: options.method || 'ADMIN',
                creationOptions: options
            }
        };

        // Generate secure password if not provided
        if (!prepared.password) {
            prepared.password = stringHelper.generateSecurePassword(16);
            prepared.passwordAutoGenerated = true;
        }

        // Hash password
        prepared.password = await HashService.hash(prepared.password);

        return prepared;
    }

    async #createStandardUser(userData, options) {
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createCustomerUser(userData, options) {
        userData.userType = 'CUSTOMER';
        userData.customerProfile = options.customerProfile || {};
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createPartnerUser(userData, options) {
        userData.userType = 'PARTNER';
        userData.partnerProfile = options.partnerProfile || {};
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createEmployeeUser(userData, options) {
        userData.userType = 'EMPLOYEE';
        userData.employeeProfile = options.employeeProfile || {};
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createContractorUser(userData, options) {
        userData.userType = 'CONTRACTOR';
        userData.contractorProfile = options.contractorProfile || {};
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createAPIUser(userData, options) {
        userData.userType = 'API_USER';
        userData.apiAccess = {
            enabled: true,
            apiKey: stringHelper.generateAPIKey(),
            apiSecret: await HashService.hash(stringHelper.generateAPISecret()),
            rateLimits: options.rateLimits || {}
        };
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #createServiceAccount(userData, options) {
        userData.userType = 'SERVICE_ACCOUNT';
        userData.serviceAccount = {
            serviceName: options.serviceName,
            serviceType: options.serviceType,
            credentials: await this.#generateServiceCredentials()
        };
        const user = new User(userData);
        await user.save();
        return user;
    }

    async #generateServiceCredentials() {
        return {
            clientId: stringHelper.generateRandomString(32),
            clientSecret: await HashService.hash(stringHelper.generateRandomString(64)),
            certificateFingerprint: stringHelper.generateRandomString(40)
        };
    }

    #buildUserQuery(identifier) {
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            return { _id: identifier };
        }

        if (CommonValidator.isValidEmail(identifier)) {
            return { email: identifier.toLowerCase() };
        }

        return { username: identifier.toLowerCase() };
    }

    #sanitizeUserResponse(user) {
        const sanitized = user.toObject ? user.toObject() : { ...user };

        // Remove sensitive fields
        delete sanitized.password;
        delete sanitized.passwordHistory;
        delete sanitized.twoFactorSecret;
        delete sanitized.securityQuestions;
        delete sanitized.verificationToken;
        delete sanitized.resetPasswordToken;
        delete sanitized.__v;

        return sanitized;
    }

    async #cacheUser(user) {
        const cacheKey = `${this.#cachePrefix}${user._id}`;
        await this.#cacheService.set(cacheKey, this.#sanitizeUserResponse(user), this.#cacheTTL);
    }

    async #invalidateUserCache(userId) {
        const patterns = [
            `${this.#cachePrefix}${userId}`,
            `${this.#cachePrefix}*:${userId}`,
            'platform:users:list:*',
            'stats:users:*'
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    async #logUserManagementAudit(action, data) {
        try {
            logger.audit({
                category: 'USER_MANAGEMENT',
                action,
                timestamp: new Date(),
                data
            });
        } catch (error) {
            logger.error('Error logging audit event:', error);
        }
    }

    #createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Assign user to organization
     * @private
     */
    async #assignToOrganization(userId, organizationId, role = 'member') {
        try {
            const organization = await Organization.findById(organizationId);
            if (!organization) {
                throw new AppError('Organization not found', 404);
            }

            const user = await User.findById(userId);
            await user.addToOrganization(organizationId, {
                role,
                joinedAt: new Date(),
                status: 'active'
            });

            logger.info(`User ${userId} assigned to organization ${organizationId}`);
        } catch (error) {
            logger.error('Error assigning user to organization:', error);
            throw error;
        }
    }

    /**
     * Setup initial permissions for user
     * @private
     */
    async #setupInitialPermissions(user, options) {
        try {
            const defaultPermissions = options.permissions || this.#getDefaultPermissions(user.userType);

            for (const permission of defaultPermissions) {
                await UserPermission.create({
                    userId: user._id,
                    permissionId: permission.id,
                    scope: permission.scope || 'global',
                    assignedAt: new Date(),
                    assignedBy: 'system'
                });
            }

            logger.info(`Initial permissions set for user ${user._id}`);
        } catch (error) {
            logger.error('Error setting up initial permissions:', error);
            throw error;
        }
    }

    /**
     * Send welcome communications
     * @private
     */
    async #sendWelcomeCommunications(user, options) {
        try {
            if (options.skipWelcomeEmail) return;

            await this.#emailService.send({
                to: user.email,
                subject: 'Welcome to our platform',
                template: 'user-welcome',
                context: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    loginUrl: `${process.env.APP_URL}/login`,
                    temporaryPassword: user.passwordAutoGenerated
                }
            });

            logger.info(`Welcome email sent to ${user.email}`);
        } catch (error) {
            logger.error('Error sending welcome communications:', error);
        }
    }

    /**
     * Trigger user creation webhooks
     * @private
     */
    async #triggerUserCreationWebhooks(user, createdBy) {
        try {
            await this.#webhookService.trigger('USER_CREATED', {
                userId: user._id,
                email: user.email,
                userType: user.userType,
                createdAt: user.createdAt,
                createdBy
            });
        } catch (error) {
            logger.error('Error triggering user creation webhooks:', error);
        }
    }

    /**
     * Get user permissions
     * @private
     */
    async #getUserPermissions(userId) {
        try {
            const permissions = await UserPermission.find({ userId })
                .populate('permissionId')
                .lean();

            return permissions.map(p => ({
                id: p.permissionId._id,
                name: p.permissionId.name,
                scope: p.scope,
                assignedAt: p.assignedAt
            }));
        } catch (error) {
            logger.error('Error getting user permissions:', error);
            return [];
        }
    }

    /**
     * Get user activity
     * @private
     */
    async #getUserActivity(userId) {
        try {
            return {
                lastLogin: new Date(),
                loginCount: 0,
                lastActiveAt: new Date(),
                sessionCount: 0
            };
        } catch (error) {
            logger.error('Error getting user activity:', error);
            return {};
        }
    }

    /**
     * Get user organizations
     * @private
     */
    async #getUserOrganizations(userId) {
        try {
            const user = await User.findById(userId).populate('organizations.organizationId');
            return user.organizations || [];
        } catch (error) {
            logger.error('Error getting user organizations:', error);
            return [];
        }
    }

    /**
     * Get user metrics
     * @private
     */
    async #getUserMetrics(userId) {
        try {
            return {
                profileCompletion: 75,
                engagementScore: 85,
                lastActivityScore: 90
            };
        } catch (error) {
            logger.error('Error getting user metrics:', error);
            return {};
        }
    }

    /**
     * Get user security info
     * @private
     */
    async #getUserSecurityInfo(userId) {
        try {
            const user = await User.findById(userId).select('security twoFactorEnabled');
            return {
                twoFactorEnabled: user.twoFactorEnabled || false,
                lastPasswordChange: user.security?.lastPasswordChange,
                loginAttempts: user.security?.loginAttempts?.count || 0,
                isLocked: user.security?.isLocked || false
            };
        } catch (error) {
            logger.error('Error getting user security info:', error);
            return {};
        }
    }

    /**
     * Validate update permissions
     * @private
     */
    async #validateUpdatePermissions(user, updateData, updatedBy) {
        // Implementation for permission validation
        if (!updatedBy) {
            throw new AppError('Update must be performed by an authenticated admin', 401);
        }

        // Check if trying to update sensitive fields
        const sensitiveFields = ['role', 'status', 'permissions'];
        const hasSensitiveUpdates = sensitiveFields.some(field => updateData.hasOwnProperty(field));

        if (hasSensitiveUpdates) {
            // Verify admin has appropriate permissions
            const adminUser = await AdminUser.findById(updatedBy);
            if (!adminUser || !adminUser.hasPermission('MANAGE_USERS')) {
                throw new AppError('Insufficient permissions for this update', 403);
            }
        }
    }

    /**
     * Determine update type
     * @private
     */
    #determineUpdateType(updateData) {
        const updateKeys = Object.keys(updateData);

        if (updateKeys.some(key => ['firstName', 'lastName', 'displayName'].includes(key))) {
            return 'PROFILE';
        }
        if (updateKeys.some(key => ['email', 'phone', 'address'].includes(key))) {
            return 'CONTACT';
        }
        if (updateKeys.some(key => ['password', 'twoFactorEnabled', 'securityQuestions'].includes(key))) {
            return 'SECURITY';
        }
        if (updateKeys.some(key => ['preferences', 'settings', 'theme'].includes(key))) {
            return 'PREFERENCES';
        }
        if (updateKeys.some(key => ['status', 'isActive', 'isLocked'].includes(key))) {
            return 'STATUS';
        }
        if (updateKeys.some(key => ['organizationId', 'role', 'department'].includes(key))) {
            return 'ORGANIZATION';
        }
        if (updateKeys.some(key => ['metadata', 'tags', 'notes'].includes(key))) {
            return 'METADATA';
        }
        if (updateKeys.some(key => key.startsWith('custom_'))) {
            return 'CUSTOM_FIELDS';
        }
        if (Array.isArray(updateData) || updateKeys.length > 5) {
            return 'BULK';
        }

        return 'GENERAL';
    }

    /**
     * Update user profile
     * @private
     */
    async #updateUserProfile(user, updateData) {
        const profileFields = ['firstName', 'lastName', 'displayName', 'bio', 'avatar'];

        profileFields.forEach(field => {
            if (updateData.hasOwnProperty(field)) {
                user[field] = updateData[field];
            }
        });

        user.updatedAt = new Date();
        return { updated: profileFields.filter(f => updateData.hasOwnProperty(f)) };
    }

    /**
     * Update user contact
     * @private
     */
    async #updateUserContact(user, updateData) {
        const contactFields = ['email', 'phone', 'address'];
        const previousEmail = user.email;

        contactFields.forEach(field => {
            if (updateData.hasOwnProperty(field)) {
                user[field] = updateData[field];
            }
        });

        // If email changed, mark as unverified
        if (updateData.email && updateData.email !== previousEmail) {
            user.emailVerified = false;
            user.emailVerifiedAt = null;
        }

        user.updatedAt = new Date();
        return { updated: contactFields.filter(f => updateData.hasOwnProperty(f)) };
    }

    /**
     * Update user security
     * @private
     */
    async #updateUserSecurity(user, updateData, updatedBy) {
        const securityUpdates = [];

        if (updateData.password) {
            const hashedPassword = await HashService.hash(updateData.password);
            user.password = hashedPassword;
            user.security.lastPasswordChange = new Date();
            securityUpdates.push('password');
        }

        if (updateData.hasOwnProperty('twoFactorEnabled')) {
            user.twoFactorEnabled = updateData.twoFactorEnabled;
            securityUpdates.push('twoFactorEnabled');
        }

        if (updateData.securityQuestions) {
            user.securityQuestions = updateData.securityQuestions;
            securityUpdates.push('securityQuestions');
        }

        user.updatedAt = new Date();
        return { updated: securityUpdates };
    }

    /**
     * Update user preferences
     * @private
     */
    async #updateUserPreferences(user, updateData) {
        const preferenceFields = ['preferences', 'settings', 'theme', 'language', 'timezone'];

        preferenceFields.forEach(field => {
            if (updateData.hasOwnProperty(field)) {
                if (typeof updateData[field] === 'object' && user[field]) {
                    user[field] = { ...user[field], ...updateData[field] };
                } else {
                    user[field] = updateData[field];
                }
            }
        });

        user.updatedAt = new Date();
        return { updated: preferenceFields.filter(f => updateData.hasOwnProperty(f)) };
    }

    /**
     * Update user status
     * @private
     */
    async #updateUserStatus(user, updateData, updatedBy) {
        const statusUpdates = [];

        if (updateData.hasOwnProperty('status')) {
            user.status = updateData.status;
            statusUpdates.push('status');
        }

        if (updateData.hasOwnProperty('isActive')) {
            user.isActive = updateData.isActive;
            statusUpdates.push('isActive');
        }

        if (updateData.hasOwnProperty('isLocked')) {
            user.security.isLocked = updateData.isLocked;
            statusUpdates.push('isLocked');
        }

        user.updatedAt = new Date();
        return { updated: statusUpdates };
    }

    /**
     * Update user organization
     * @private
     */
    async #updateUserOrganization(user, updateData, updatedBy) {
        if (updateData.organizationId) {
            await this.#assignToOrganization(user._id, updateData.organizationId, updateData.role);
        }

        user.updatedAt = new Date();
        return { updated: ['organization'] };
    }

    /**
     * Update user metadata
     * @private
     */
    async #updateUserMetadata(user, updateData) {
        if (updateData.metadata) {
            user.metadata = { ...user.metadata, ...updateData.metadata };
        }

        if (updateData.tags) {
            user.tags = updateData.tags;
        }

        if (updateData.notes) {
            user.notes = updateData.notes;
        }

        user.updatedAt = new Date();
        return { updated: ['metadata'] };
    }

    /**
     * Update user custom fields
     * @private
     */
    async #updateUserCustomFields(user, updateData) {
        const customUpdates = [];

        Object.keys(updateData).forEach(key => {
            if (key.startsWith('custom_')) {
                if (!user.customFields) {
                    user.customFields = {};
                }
                user.customFields[key] = updateData[key];
                customUpdates.push(key);
            }
        });

        user.updatedAt = new Date();
        return { updated: customUpdates };
    }

    /**
     * Process bulk update
     * @private
     */
    async #processBulkUpdate(user, updateData, updatedBy) {
        const results = [];

        for (const [field, value] of Object.entries(updateData)) {
            try {
                user[field] = value;
                results.push({ field, success: true });
            } catch (error) {
                results.push({ field, success: false, error: error.message });
            }
        }

        user.updatedAt = new Date();
        return { updated: results.filter(r => r.success).map(r => r.field) };
    }

    /**
     * Process general update
     * @private
     */
    async #processGeneralUpdate(user, updateData) {
        const updated = [];

        Object.keys(updateData).forEach(key => {
            if (user.schema.paths.hasOwnProperty(key)) {
                user[key] = updateData[key];
                updated.push(key);
            }
        });

        user.updatedAt = new Date();
        return { updated };
    }

    /**
     * Handle post-update actions
     * @private
     */
    async #handlePostUpdateActions(user, updateType, updateData, updatedBy) {
        // Send notifications for specific update types
        if (updateType === 'SECURITY') {
            await this.#notificationService.send({
                userId: user._id,
                type: 'SECURITY_UPDATE',
                message: 'Your security settings have been updated'
            });
        }

        if (updateType === 'CONTACT' && updateData.email) {
            await this.#sendEmailVerificationIfNeeded(user);
        }
    }

    /**
     * Send email verification if needed
     * @private
     */
    async #sendEmailVerificationIfNeeded(user) {
        if (!user.emailVerified) {
            const verificationToken = stringHelper.generateRandomString(32);
            user.verificationToken = verificationToken;
            user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await this.#emailService.send({
                to: user.email,
                subject: 'Verify your email address',
                template: 'email-verification',
                context: {
                    firstName: user.firstName,
                    verificationUrl: `${process.env.APP_URL}/verify-email?token=${verificationToken}&userId=${user._id}`
                }
            });
        }
    }

    /**
     * Trigger user update webhooks
     * @private
     */
    async #triggerUserUpdateWebhooks(user, updateData, updatedBy) {
        try {
            await this.#webhookService.trigger('USER_UPDATED', {
                userId: user._id,
                changes: updateData,
                updatedBy,
                updatedAt: new Date()
            });
        } catch (error) {
            logger.error('Error triggering user update webhooks:', error);
        }
    }

    /**
     * Check deletion eligibility
     * @private
     */
    async #checkDeletionEligibility(user, deletedBy) {
        // Check if user has active subscriptions, orders, etc.
        if (user.status === 'active' && user.lastActiveAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
            throw new AppError('Cannot delete recently active user without deactivation period', 400);
        }

        // Check admin permissions
        const adminUser = await AdminUser.findById(deletedBy);
        if (!adminUser || !adminUser.hasPermission('DELETE_USERS')) {
            throw new AppError('Insufficient permissions to delete users', 403);
        }
    }

    /**
     * Perform hard delete
     * @private
     */
    async #performHardDelete(user, options, deletedBy) {
        // Archive user data before deletion
        await this.#archiveUserData(user);

        // Delete user record
        await User.findByIdAndDelete(user._id);

        return {
            success: true,
            deletionType: 'HARD',
            deletedAt: new Date(),
            deletedBy
        };
    }

    /**
     * Perform soft delete
     * @private
     */
    async #performSoftDelete(user, options, deletedBy) {
        user.status = 'deleted';
        user.isActive = false;
        user.deletedAt = new Date();
        user.deletedBy = deletedBy;
        user.deletionReason = options.reason || 'Admin deletion';

        await user.save();

        return {
            success: true,
            deletionType: 'SOFT',
            deletedAt: user.deletedAt,
            deletedBy
        };
    }

    /**
     * Archive user data
     * @private
     */
    async #archiveUserData(user) {
        // Implementation for archiving user data
        logger.info(`Archiving data for user ${user._id}`);
    }

    /**
     * Handle user deletion related data
     * @private
     */
    async #handleUserDeletionRelatedData(user, options) {
        // Clean up related data: sessions, permissions, etc.
        await UserPermission.deleteMany({ userId: user._id });
        await AdminSession.deleteMany({ userId: user._id });
    }

    /**
     * Trigger user deletion webhooks
     * @private
     */
    async #triggerUserDeletionWebhooks(user, options, deletedBy) {
        try {
            await this.#webhookService.trigger('USER_DELETED', {
                userId: user._id,
                deletionType: options.hardDelete ? 'HARD' : 'SOFT',
                deletedBy,
                deletedAt: new Date()
            });
        } catch (error) {
            logger.error('Error triggering user deletion webhooks:', error);
        }
    }

    /**
     * Build user aggregation pipeline
     * @private
     */
    #buildUserAggregationPipeline(filters, options) {
        const pipeline = [];

        // Match stage
        if (filters && Object.keys(filters).length > 0) {
            pipeline.push({ $match: this.#buildFilterConditions(filters) });
        }

        // Lookup organizations
        if (options.includeOrganizations) {
            pipeline.push({
                $lookup: {
                    from: 'organizations',
                    localField: 'organizations.organizationId',
                    foreignField: '_id',
                    as: 'organizationDetails'
                }
            });
        }

        // Sort
        const sortField = options.sortBy || 'createdAt';
        const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
        pipeline.push({ $sort: { [sortField]: sortOrder } });

        return pipeline;
    }

    /**
     * Enrich user list with additional data
     * @private
     */
    async #enrichUserList(users, options) {
        if (!options.includePermissions && !options.includeActivity) {
            return users;
        }

        return Promise.all(users.map(async (user) => {
            if (options.includePermissions) {
                user.permissions = await this.#getUserPermissions(user._id);
            }

            if (options.includeActivity) {
                user.activity = await this.#getUserActivity(user._id);
            }

            return user;
        }));
    }

    /**
     * Build search conditions
     * @private
     */
    #buildSearchConditions(searchQuery, options) {
        const searchRegex = new RegExp(searchQuery, 'i');

        return {
            $or: [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { email: searchRegex },
                { username: searchRegex },
                { displayName: searchRegex }
            ]
        };
    }

    /**
     * Build filter conditions
     * @private
     */
    #buildFilterConditions(filters) {
        const conditions = {};

        Object.keys(filters).forEach(key => {
            const value = filters[key];

            switch (key) {
                case 'status':
                    conditions.status = value;
                    break;
                case 'userType':
                    conditions.userType = value;
                    break;
                case 'isActive':
                    conditions.isActive = value;
                    break;
                case 'organizationId':
                    conditions['organizations.organizationId'] = value;
                    break;
                case 'createdAfter':
                    conditions.createdAt = { $gte: new Date(value) };
                    break;
                case 'createdBefore':
                    if (conditions.createdAt) {
                        conditions.createdAt.$lte = new Date(value);
                    } else {
                        conditions.createdAt = { $lte: new Date(value) };
                    }
                    break;
                default:
                    conditions[key] = value;
            }
        });

        return conditions;
    }

    /**
     * Calculate search relevance
     * @private
     */
    #calculateSearchRelevance(users, searchQuery) {
        return users.map(user => {
            let score = 0;
            const query = searchQuery.toLowerCase();

            // Exact matches get higher scores
            if (user.email?.toLowerCase() === query) score += 100;
            if (user.username?.toLowerCase() === query) score += 90;
            if (user.firstName?.toLowerCase() === query) score += 80;
            if (user.lastName?.toLowerCase() === query) score += 80;

            // Partial matches get lower scores
            if (user.email?.toLowerCase().includes(query)) score += 50;
            if (user.username?.toLowerCase().includes(query)) score += 40;
            if (user.firstName?.toLowerCase().includes(query)) score += 30;
            if (user.lastName?.toLowerCase().includes(query)) score += 30;

            user.relevanceScore = score;
            return user;
        });
    }

    /**
     * Get default permissions for user type
     * @private
     */
    #getDefaultPermissions(userType) {
        const defaultPermissions = {
            'CUSTOMER': [
                { id: 'view_profile', scope: 'self' },
                { id: 'update_profile', scope: 'self' }
            ],
            'EMPLOYEE': [
                { id: 'view_profile', scope: 'self' },
                { id: 'update_profile', scope: 'self' },
                { id: 'view_organization', scope: 'organization' }
            ],
            'ADMIN': [
                { id: 'manage_users', scope: 'global' },
                { id: 'view_all_profiles', scope: 'global' }
            ]
        };

        return defaultPermissions[userType] || defaultPermissions['CUSTOMER'];
    }

    /**
     * Calculate total statistics
     * @private
     */
    async #calculateTotalStatistics(filters) {
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: ["$isActive", 1, 0] } },
                    inactive: { $sum: { $cond: ["$isActive", 0, 1] } }
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        return stats[0] || { total: 0, active: 0, inactive: 0 };
    }

    /**
     * Calculate status statistics
     * @private
     */
    async #calculateStatusStatistics(filters) {
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        return stats.reduce((acc, stat) => {
            acc[stat._id || 'unknown'] = stat.count;
            return acc;
        }, {});
    }

    /**
     * Calculate registration statistics
     * @private
     */
    async #calculateRegistrationStatistics(filters, options) {
        const matchStage = filters && Object.keys(filters).length > 0 ? { $match: filters } : {};
        const pipeline = [
            matchStage,
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 }
            },
            {
                $limit: 30
            }
        ].filter(stage => Object.keys(stage).length > 0);

        const stats = await User.aggregate(pipeline);
        return stats.map(stat => ({
            date: `${stat._id.year}-${String(stat._id.month).padStart(2, '0')}-${String(stat._id.day).padStart(2, '0')}`,
            count: stat.count
        }));
    }

    /**
     * Validate bulk user data
     * @private
     */
    async #validateBulkUserData(usersData) {
        const errors = [];

        usersData.forEach((userData, index) => {
            try {
                if (!userData.email || !CommonValidator.isValidEmail(userData.email)) {
                    errors.push(`Row ${index + 1}: Invalid email`);
                }

                if (!userData.firstName || !userData.lastName) {
                    errors.push(`Row ${index + 1}: First name and last name are required`);
                }
            } catch (error) {
                errors.push(`Row ${index + 1}: ${error.message}`);
            }
        });

        if (errors.length > 0) {
            throw new AppError('Bulk validation failed', 400, errors);
        }
    }

    /**
     * Process bulk create batch
     * @private
     */
    async #processBulkCreateBatch(batch, options, createdBy) {
        const results = {
            created: [],
            failed: [],
            skipped: []
        };

        for (const userData of batch) {
            try {
                const user = await this.createUser(userData, options, createdBy);
                results.created.push(user);
            } catch (error) {
                results.failed.push({
                    userData,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Send bulk operation summary
     * @private
     */
    async #sendBulkOperationSummary(operation, results, performedBy) {
        try {
            await this.#emailService.send({
                to: 'admin@platform.com', // or get admin email
                subject: `Bulk ${operation} Operation Complete`,
                template: 'bulk-operation-summary',
                context: {
                    operation,
                    results,
                    performedBy,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending bulk operation summary:', error);
        }
    }

    /**
     * Validate bulk update
     * @private
     */
    async #validateBulkUpdate(userIds, updateData, updatedBy) {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new AppError('User IDs array is required', 400);
        }

        if (!updateData || Object.keys(updateData).length === 0) {
            throw new AppError('Update data is required', 400);
        }

        const adminUser = await AdminUser.findById(updatedBy);
        if (!adminUser || !adminUser.hasPermission('BULK_UPDATE_USERS')) {
            throw new AppError('Insufficient permissions for bulk update', 403);
        }
    }

    /**
     * Process bulk update batch
     * @private
     */
    async #processBulkUpdateBatch(batch, updateData, options, updatedBy) {
        const results = {
            updated: [],
            failed: [],
            skipped: []
        };

        for (const userId of batch) {
            try {
                const user = await this.updateUser(userId, updateData, updatedBy);
                results.updated.push(user);
            } catch (error) {
                results.failed.push({
                    userId,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Invalidate bulk user caches
     * @private
     */
    async #invalidateBulkUserCaches(userIds) {
        const promises = userIds.map(userId => this.#invalidateUserCache(userId));
        await Promise.all(promises);
    }

    /**
     * Validate bulk deletion
     * @private
     */
    async #validateBulkDeletion(userIds, deletedBy) {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new AppError('User IDs array is required', 400);
        }

        const adminUser = await AdminUser.findById(deletedBy);
        if (!adminUser || !adminUser.hasPermission('BULK_DELETE_USERS')) {
            throw new AppError('Insufficient permissions for bulk deletion', 403);
        }
    }

    /**
     * Process bulk delete batch
     * @private
     */
    async #processBulkDeleteBatch(batch, options, deletedBy) {
        const results = {
            deleted: [],
            failed: [],
            skipped: []
        };

        for (const userId of batch) {
            try {
                const result = await this.deleteUser(userId, options, deletedBy);
                results.deleted.push({ userId, result });
            } catch (error) {
                results.failed.push({
                    userId,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Parse CSV import
     * @private
     */
    async #parseCSVImport(importData) {
        // Implementation for CSV parsing
        const csv = require('csv-parser');
        const results = [];

        return new Promise((resolve, reject) => {
            // Parse CSV data and return array of user objects
            resolve(results);
        });
    }

    /**
     * Parse JSON import
     * @private
     */
    async #parseJSONImport(importData) {
        try {
            return JSON.parse(importData);
        } catch (error) {
            throw new AppError('Invalid JSON format', 400);
        }
    }

    /**
     * Parse Excel import
     * @private
     */
    async #parseExcelImport(importData) {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(importData);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(worksheet);
    }

    /**
     * Parse XML import
     * @private
     */
    async #parseXMLImport(importData) {
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser();

        return new Promise((resolve, reject) => {
            parser.parseString(importData, (err, result) => {
                if (err) reject(err);
                else resolve(result.users?.user || []);
            });
        });
    }

    /**
     * Validate imported users
     * @private
     */
    async #validateImportedUsers(users) {
        const valid = [];
        const errors = [];

        users.forEach((user, index) => {
            try {
                if (!user.email || !CommonValidator.isValidEmail(user.email)) {
                    errors.push(`Row ${index + 1}: Invalid email`);
                    return;
                }

                if (!user.firstName || !user.lastName) {
                    errors.push(`Row ${index + 1}: Name fields required`);
                    return;
                }

                valid.push(user);
            } catch (error) {
                errors.push(`Row ${index + 1}: ${error.message}`);
            }
        });

        return { valid, errors };
    }

    /**
     * Apply field mapping
     * @private
     */
    #applyFieldMapping(users, fieldMapping) {
        return users.map(user => {
            const mappedUser = {};

            Object.keys(fieldMapping).forEach(targetField => {
                const sourceField = fieldMapping[targetField];
                if (user[sourceField] !== undefined) {
                    mappedUser[targetField] = user[sourceField];
                }
            });

            return { ...user, ...mappedUser };
        });
    }

    /**
     * Process user import
     * @private
     */
    async #processUserImport(users, options, importedBy) {
        const results = {
            imported: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const userData of users) {
            try {
                await this.createUser(userData, options, importedBy);
                results.imported++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    user: userData.email || userData.username,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Generate import report
     * @private
     */
    async #generateImportReport(importResult) {
        return {
            summary: {
                total: importResult.imported + importResult.failed + importResult.skipped,
                imported: importResult.imported,
                failed: importResult.failed,
                skipped: importResult.skipped
            },
            errors: importResult.errors,
            importedAt: new Date()
        };
    }

    /**
     * Send import summary
     * @private
     */
    async #sendImportSummary(report, importedBy) {
        try {
            await this.#emailService.send({
                to: 'admin@platform.com',
                subject: 'User Import Complete',
                template: 'import-summary',
                context: {
                    report,
                    importedBy,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending import summary:', error);
        }
    }

    /**
     * Check export permissions
     * @private
     */
    async #checkExportPermissions(exportedBy, options) {
        const adminUser = await AdminUser.findById(exportedBy);
        if (!adminUser || !adminUser.hasPermission('EXPORT_USERS')) {
            throw new AppError('Insufficient permissions to export users', 403);
        }
    }

    /**
     * Build export query
     * @private
     */
    #buildExportQuery(filters) {
        return this.#buildFilterConditions(filters);
    }

    /**
     * Transform export data
     * @private
     */
    async #transformExportData(users, options) {
        return users.map(user => {
            const transformed = { ...user };

            // Remove sensitive fields for export
            delete transformed.password;
            delete transformed.twoFactorSecret;
            delete transformed.securityQuestions;

            // Format dates
            if (transformed.createdAt) {
                transformed.createdAt = transformed.createdAt.toISOString();
            }

            return transformed;
        });
    }

    /**
     * Format as CSV
     * @private
     */
    async #formatAsCSV(users, options) {
        if (users.length === 0) return '';

        const headers = Object.keys(users[0]);
        const csvContent = [
            headers.join(','),
            ...users.map(user =>
                headers.map(header =>
                    typeof user[header] === 'string' ? `"${user[header]}"` : user[header]
                ).join(',')
            )
        ].join('\n');

        return csvContent;
    }

    /**
     * Format as JSON
     * @private
     */
    async #formatAsJSON(users, options) {
        return JSON.stringify(users, null, 2);
    }

    /**
     * Format as Excel
     * @private
     */
    async #formatAsExcel(users, options) {
        const XLSX = require('xlsx');
        const worksheet = XLSX.utils.json_to_sheet(users);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }

    /**
     * Format as PDF
     * @private
     */
    async #formatAsPDF(users, options) {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument();

        doc.fontSize(16).text('User Export Report', 50, 50);
        doc.fontSize(12);

        users.forEach((user, index) => {
            const y = 100 + (index * 60);
            doc.text(`${user.firstName} ${user.lastName}`, 50, y);
            doc.text(`Email: ${user.email}`, 50, y + 15);
            doc.text(`Created: ${user.createdAt}`, 50, y + 30);
        });

        return doc;
    }

    /**
     * Format as XML
     * @private
     */
    async #formatAsXML(users, options) {
        const js2xml = require('js2xml');
        return js2xml.parse('users', { user: users }, { prettyPrint: true });
    }

    /**
     * Encrypt export data
     * @private
     */
    async #encryptExportData(data, encryptionKey) {
        return await this.#encryptionService.encrypt(data, encryptionKey);
    }

    /**
     * Validate merge operation
     * @private
     */
    async #validateMergeOperation(primaryUserId, duplicateUserIds) {
        if (duplicateUserIds.includes(primaryUserId)) {
            throw new AppError('Primary user cannot be in duplicate list', 400);
        }

        if (duplicateUserIds.length === 0) {
            throw new AppError('At least one duplicate user required', 400);
        }
    }

    /**
     * Perform user merge
     * @private
     */
    async #performUserMerge(primaryUser, duplicateUsers, options) {
        const mergeData = {};

        duplicateUsers.forEach(duplicate => {
            // Merge contact information
            if (!primaryUser.phone && duplicate.phone) {
                primaryUser.phone = duplicate.phone;
                mergeData.phone = duplicate.phone;
            }

            // Merge metadata
            if (duplicate.metadata) {
                primaryUser.metadata = { ...primaryUser.metadata, ...duplicate.metadata };
                mergeData.metadata = duplicate.metadata;
            }

            // Merge custom fields
            if (duplicate.customFields) {
                primaryUser.customFields = { ...primaryUser.customFields, ...duplicate.customFields };
                mergeData.customFields = duplicate.customFields;
            }
        });

        return mergeData;
    }

    /**
     * Migrate related data
     * @private
     */
    async #migrateRelatedData(primaryUser, duplicateUsers, options) {
        for (const duplicate of duplicateUsers) {
            // Migrate user permissions
            await UserPermission.updateMany(
                { userId: duplicate._id },
                { userId: primaryUser._id }
            );

            // Migrate sessions
            await AdminSession.updateMany(
                { userId: duplicate._id },
                { userId: primaryUser._id }
            );
        }
    }

    /**
     * Handle duplicate accounts
     * @private
     */
    async #handleDuplicateAccounts(duplicateUsers, options, mergedBy) {
        for (const duplicate of duplicateUsers) {
            if (options.deleteDuplicates) {
                await this.deleteUser(duplicate._id, { hardDelete: true }, mergedBy);
            } else {
                duplicate.status = 'merged';
                duplicate.isActive = false;
                await duplicate.save();
            }
        }
    }

    /**
     * Send merge notifications
     * @private
     */
    async #sendMergeNotifications(primaryUser, duplicateUsers, mergedBy) {
        try {
            await this.#emailService.send({
                to: primaryUser.email,
                subject: 'Your accounts have been merged',
                template: 'account-merge',
                context: {
                    primaryUser,
                    mergedAccounts: duplicateUsers.length
                }
            });
        } catch (error) {
            logger.error('Error sending merge notifications:', error);
        }
    }
}

// Export singleton instance
module.exports = new UserManagementService();