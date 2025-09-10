'use strict';

/**
 * @fileoverview User management controller for handling platform user management endpoints
 * @module servers/admin-server/modules/user-management/controllers/user-management-controller
 * @requires module:servers/admin-server/modules/user-management/services/user-management-service
 * @requires module:servers/admin-server/modules/user-management/services/user-permissions-service
 * @requires module:servers/admin-server/modules/user-management/services/user-sessions-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const userManagementService = require('../services/user-management-service');
const userPermissionsService = require('../services/user-permissions-service');
const userSessionsService = require('../services/user-sessions-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const { ResponseFormatter } = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { STATUS_CODES } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * Controller class for platform user management operations
 * @class UserManagementController
 */
class UserManagementController {
    /**
     * Private fields
     */
    #responseFormatter;
    #validationConfig;
    #paginationConfig;
    #searchConfig;
    #exportConfig;
    #importConfig;
    #bulkOperationConfig;
    #auditConfig;
    #notificationConfig;
    #rateLimitConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeConfigurations();

        // Bind all methods to preserve context
        this.createUser = this.createUser.bind(this);
        this.getUser = this.getUser.bind(this);
        this.updateUser = this.updateUser.bind(this);
        this.deleteUser = this.deleteUser.bind(this);
        this.listUsers = this.listUsers.bind(this);
        this.searchUsers = this.searchUsers.bind(this);
        this.bulkCreateUsers = this.bulkCreateUsers.bind(this);
        this.bulkUpdateUsers = this.bulkUpdateUsers.bind(this);
        this.bulkDeleteUsers = this.bulkDeleteUsers.bind(this);
        this.importUsers = this.importUsers.bind(this);
        this.exportUsers = this.exportUsers.bind(this);
        this.mergeUsers = this.mergeUsers.bind(this);
        this.getUserStatistics = this.getUserStatistics.bind(this);
        this.verifyUserEmail = this.verifyUserEmail.bind(this);
        this.resetUserPassword = this.resetUserPassword.bind(this);
        this.enableTwoFactorAuth = this.enableTwoFactorAuth.bind(this);
        this.disableTwoFactorAuth = this.disableTwoFactorAuth.bind(this);
        this.updateUserPreferences = this.updateUserPreferences.bind(this);
        this.updateUserProfile = this.updateUserProfile.bind(this);
        this.updateUserStatus = this.updateUserStatus.bind(this);
        this.assignUserToOrganization = this.assignUserToOrganization.bind(this);
        this.removeUserFromOrganization = this.removeUserFromOrganization.bind(this);
        this.getUserActivity = this.getUserActivity.bind(this);
        this.getUserSessions = this.getUserSessions.bind(this);
        this.terminateUserSessions = this.terminateUserSessions.bind(this);
        this.getUserPermissions = this.getUserPermissions.bind(this);
        this.updateUserPermissions = this.updateUserPermissions.bind(this);
        this.grantUserRole = this.grantUserRole.bind(this);
        this.revokeUserRole = this.revokeUserRole.bind(this);
        this.auditUser = this.auditUser.bind(this);
        this.generateUserReport = this.generateUserReport.bind(this);
        this.validateUserData = this.validateUserData.bind(this);
        this.checkUserEligibility = this.checkUserEligibility.bind(this);

        logger.info('UserManagementController initialized');
    }

    /**
     * Create a new platform user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createUser(req, res, next) {
        try {
            logger.info('Creating platform user - Controller');

            const createdBy = req.user?.adminId || req.user?.id;

            // Validate permissions
            const hasPermission = await this.#checkPermission(createdBy, 'userManagement.create');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to create users', STATUS_CODES.FORBIDDEN);
            }

            // Validate user data
            const validationResult = await this.#validateUserData(req.body, 'create');
            if (!validationResult.valid) {
                throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
            }

            // Determine user creation type and options
            const options = this.#buildUserCreationOptions(req);

            // Handle different user types
            let result;

            switch (options.userType) {
                case 'CUSTOMER':
                    result = await this.#createCustomerUser(req.body, options, createdBy);
                    break;

                case 'PARTNER':
                    result = await this.#createPartnerUser(req.body, options, createdBy);
                    break;

                case 'EMPLOYEE':
                    result = await this.#createEmployeeUser(req.body, options, createdBy);
                    break;

                case 'CONTRACTOR':
                    result = await this.#createContractorUser(req.body, options, createdBy);
                    break;

                case 'API_USER':
                    result = await this.#createAPIUser(req.body, options, createdBy);
                    break;

                case 'SERVICE_ACCOUNT':
                    result = await this.#createServiceAccount(req.body, options, createdBy);
                    break;

                case 'GUEST':
                    result = await this.#createGuestUser(req.body, options, createdBy);
                    break;

                default:
                    result = await userManagementService.createUser(req.body, options, createdBy);
            }

            // Log creation
            await this.#logControllerAction('USER_CREATED', {
                userId: result._id,
                userType: options.userType,
                createdBy
            });

            // Send welcome notifications if enabled
            if (options.sendWelcomeEmail !== false) {
                await this.#sendWelcomeNotifications(result, options);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'User created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);

        } catch (error) {
            logger.error('Error in createUser controller:', error);
            next(error);
        }
    }

    /**
     * Get user by ID or identifier
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getUser(req, res, next) {
        try {
            const { id } = req.params;
            const requesterId = req.user?.adminId || req.user?.id;

            logger.info(`Fetching user: ${id}`);

            // Check read permissions
            const hasPermission = await this.#checkPermission(requesterId, 'userManagement.read');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to view users', STATUS_CODES.FORBIDDEN);
            }

            // Build query options
            const options = {
                includePermissions: req.query.includePermissions === 'true',
                includeActivity: req.query.includeActivity === 'true',
                includeOrganizations: req.query.includeOrganizations === 'true',
                includeMetrics: req.query.includeMetrics === 'true',
                includeSecurityInfo: req.query.includeSecurityInfo === 'true',
                skipCache: req.query.skipCache === 'true',
                populate: req.query.populate
            };

            // Get user
            const user = await userManagementService.getUser(id, options);

            // Check if requester can view sensitive data
            const canViewSensitive = await this.#checkPermission(
                requesterId,
                'userManagement.viewSensitiveData'
            );

            // Filter sensitive data if needed
            const filteredUser = canViewSensitive ? user : this.#filterSensitiveUserData(user);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                filteredUser,
                'User retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in getUser controller:', error);
            next(error);
        }
    }

    /**
     * Update user information
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateUser(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const updatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Updating user: ${id}`);

            // Check update permissions
            const hasPermission = await this.#checkPermission(updatedBy, 'userManagement.update');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to update users', STATUS_CODES.FORBIDDEN);
            }

            // Validate update data
            const validationResult = await this.#validateUserData(updateData, 'update');
            if (!validationResult.valid) {
                throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
            }

            // Determine update type
            const updateType = this.#determineUpdateType(updateData);

            // Check specific permissions for update type
            const requiredPermission = this.#getRequiredPermissionForUpdateType(updateType);
            if (requiredPermission && !await this.#checkPermission(updatedBy, requiredPermission)) {
                throw new AppError(`Insufficient permissions for ${updateType} update`, STATUS_CODES.FORBIDDEN);
            }

            // Perform update
            const result = await userManagementService.updateUser(id, updateData, updatedBy);

            // Handle post-update actions based on type
            await this.#handlePostUpdateActions(result, updateType, updateData);

            // Log update
            await this.#logControllerAction('USER_UPDATED', {
                userId: id,
                updateType,
                updatedBy,
                changes: this.#sanitizeForLogging(updateData)
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'User updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in updateUser controller:', error);
            next(error);
        }
    }

    /**
     * Delete user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async deleteUser(req, res, next) {
        try {
            const { id } = req.params;
            const deletedBy = req.user?.adminId || req.user?.id;

            logger.info(`Deleting user: ${id}`);

            // Check delete permissions
            const hasPermission = await this.#checkPermission(deletedBy, 'userManagement.delete');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to delete users', STATUS_CODES.FORBIDDEN);
            }

            // Parse deletion options
            const options = {
                hardDelete: req.query.hardDelete === 'true',
                reason: req.body.reason || 'Administrative deletion',
                preserveData: req.query.preserveData === 'true',
                notifyUser: req.query.notifyUser !== 'false'
            };

            // Check for data dependencies
            const dependencies = await this.#checkUserDependencies(id);
            if (dependencies.hasBlockers && !options.force) {
                throw new AppError(
                    'Cannot delete user due to existing dependencies',
                    STATUS_CODES.CONFLICT,
                    dependencies
                );
            }

            // Delete user
            const result = await userManagementService.deleteUser(id, options, deletedBy);

            // Log deletion
            await this.#logControllerAction('USER_DELETED', {
                userId: id,
                deletedBy,
                options
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'User deleted successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in deleteUser controller:', error);
            next(error);
        }
    }

    /**
     * List users with filtering and pagination
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async listUsers(req, res, next) {
        try {
            logger.info('Listing users');

            const requesterId = req.user?.adminId || req.user?.id;

            // Check read permissions
            const hasPermission = await this.#checkPermission(requesterId, 'userManagement.read');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to list users', STATUS_CODES.FORBIDDEN);
            }

            // Parse filters
            const filters = this.#parseListFilters(req.query);

            // Parse options
            const options = this.#parseListOptions(req.query);

            // Apply organization-based filtering if needed
            const userOrg = await this.#getUserOrganization(requesterId);
            if (userOrg && !await this.#hasGlobalAccess(requesterId)) {
                filters.organizationId = userOrg;
            }

            // Get users list
            const result = await userManagementService.listUsers(filters, options);

            // Filter sensitive data if needed
            const canViewSensitive = await this.#checkPermission(
                requesterId,
                'userManagement.viewSensitiveData'
            );

            if (!canViewSensitive) {
                result.users = result.users.map(user => this.#filterSensitiveUserData(user));
            }

            // Format response with pagination
            const response = this.#responseFormatter.formatPaginatedSuccess(
                result.users,
                result.pagination,
                'Users retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in listUsers controller:', error);
            next(error);
        }
    }

    /**
     * Search users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchUsers(req, res, next) {
        try {
            const { q: searchQuery } = req.query;

            if (!searchQuery || searchQuery.length < this.#searchConfig.minQueryLength) {
                throw new AppError(
                    `Search query must be at least ${this.#searchConfig.minQueryLength} characters`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            logger.info(`Searching users: ${searchQuery}`);

            // Parse search options
            const options = {
                filters: this.#parseSearchFilters(req.query),
                limit: Math.min(parseInt(req.query.limit) || 20, this.#searchConfig.maxResults),
                populate: req.query.populate,
                sortBy: req.query.sortBy || 'relevance'
            };

            // Perform search
            const results = await userManagementService.searchUsers(searchQuery, options);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Found ${results.length} users`
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in searchUsers controller:', error);
            next(error);
        }
    }

    /**
     * Bulk create users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkCreateUsers(req, res, next) {
        try {
            const { users } = req.body;
            const createdBy = req.user?.adminId || req.user?.id;

            logger.info(`Bulk creating ${users.length} users`);

            // Check bulk operations permission
            const hasPermission = await this.#checkPermission(createdBy, 'userManagement.bulkOperations');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions for bulk operations', STATUS_CODES.FORBIDDEN);
            }

            // Validate bulk data
            if (!Array.isArray(users) || users.length === 0) {
                throw new AppError('Users array is required', STATUS_CODES.BAD_REQUEST);
            }

            if (users.length > this.#bulkOperationConfig.maxBatchSize) {
                throw new AppError(
                    `Maximum ${this.#bulkOperationConfig.maxBatchSize} users can be created at once`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            // Validate each user
            const validationErrors = [];
            for (let i = 0; i < users.length; i++) {
                const validation = await this.#validateUserData(users[i], 'create');
                if (!validation.valid) {
                    validationErrors.push({ index: i, error: validation.message });
                }
            }

            if (validationErrors.length > 0) {
                throw new AppError('Validation errors in bulk data', STATUS_CODES.BAD_REQUEST, validationErrors);
            }

            // Parse options
            const options = {
                skipDuplicates: req.query.skipDuplicates === 'true',
                sendWelcomeEmails: req.query.sendWelcomeEmails !== 'false',
                validateEmails: req.query.validateEmails !== 'false',
                onProgress: this.#createProgressCallback(req, res)
            };

            // Perform bulk creation
            const result = await userManagementService.bulkCreateUsers(users, options, createdBy);

            // Log bulk operation
            await this.#logControllerAction('BULK_USERS_CREATED', {
                createdBy,
                totalUsers: users.length,
                results: result
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                `Bulk creation completed: ${result.created.length} created, ${result.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in bulkCreateUsers controller:', error);
            next(error);
        }
    }

    /**
     * Bulk update users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkUpdateUsers(req, res, next) {
        try {
            const { userIds, updateData } = req.body;
            const updatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Bulk updating ${userIds.length} users`);

            // Check permissions
            const hasPermission = await this.#checkPermission(updatedBy, 'userManagement.bulkOperations');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions for bulk operations', STATUS_CODES.FORBIDDEN);
            }

            // Validate request
            if (!Array.isArray(userIds) || userIds.length === 0) {
                throw new AppError('User IDs array is required', STATUS_CODES.BAD_REQUEST);
            }

            if (userIds.length > this.#bulkOperationConfig.maxBatchSize) {
                throw new AppError(
                    `Maximum ${this.#bulkOperationConfig.maxBatchSize} users can be updated at once`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            // Validate update data
            const validation = await this.#validateUserData(updateData, 'update');
            if (!validation.valid) {
                throw new AppError(validation.message, STATUS_CODES.BAD_REQUEST);
            }

            // Parse options
            const options = {
                skipMissing: req.query.skipMissing === 'true',
                notifyUsers: req.query.notifyUsers !== 'false',
                onProgress: this.#createProgressCallback(req, res)
            };

            // Perform bulk update
            const result = await userManagementService.bulkUpdateUsers(userIds, updateData, options, updatedBy);

            // Log bulk operation
            await this.#logControllerAction('BULK_USERS_UPDATED', {
                updatedBy,
                userIds,
                updateData: this.#sanitizeForLogging(updateData),
                results: result
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                `Bulk update completed: ${result.updated.length} updated, ${result.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in bulkUpdateUsers controller:', error);
            next(error);
        }
    }

    /**
     * Import users from file
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async importUsers(req, res, next) {
        try {
            const importedBy = req.user?.adminId || req.user?.id;

            logger.info('Importing users from file');

            // Check permissions
            const hasPermission = await this.#checkPermission(importedBy, 'userManagement.import');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to import users', STATUS_CODES.FORBIDDEN);
            }

            // Validate file upload
            if (!req.file) {
                throw new AppError('Import file is required', STATUS_CODES.BAD_REQUEST);
            }

            // Validate file format
            const supportedFormats = this.#importConfig.supportedFormats;
            const fileExtension = req.file.originalname.split('.').pop().toUpperCase();

            if (!supportedFormats.includes(fileExtension)) {
                throw new AppError(
                    `Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            // Check file size
            if (req.file.size > this.#importConfig.maxFileSize) {
                throw new AppError(
                    `File size exceeds maximum limit of ${this.#importConfig.maxFileSize / 1024 / 1024}MB`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            // Parse import options
            const options = {
                format: fileExtension,
                updateExisting: req.body.updateExisting === 'true',
                skipInvalid: req.body.skipInvalid === 'true',
                sendWelcomeEmails: req.body.sendWelcomeEmails !== 'false',
                fieldMapping: req.body.fieldMapping ? JSON.parse(req.body.fieldMapping) : null,
                defaultValues: req.body.defaultValues ? JSON.parse(req.body.defaultValues) : null
            };

            // Perform import
            const result = await userManagementService.importUsers(req.file.buffer, options, importedBy);

            // Log import
            await this.#logControllerAction('USERS_IMPORTED', {
                importedBy,
                fileName: req.file.originalname,
                format: fileExtension,
                results: result
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Import completed successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in importUsers controller:', error);
            next(error);
        }
    }

    /**
     * Export users to file
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async exportUsers(req, res, next) {
        try {
            const exportedBy = req.user?.adminId || req.user?.id;

            logger.info('Exporting users');

            // Check permissions
            const hasPermission = await this.#checkPermission(exportedBy, 'userManagement.export');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to export users', STATUS_CODES.FORBIDDEN);
            }

            // Parse export filters
            const filters = this.#parseExportFilters(req.query);

            // Parse export options
            const options = {
                format: req.query.format || 'CSV',
                fields: req.query.fields ? req.query.fields.split(',') : null,
                includeHeaders: req.query.includeHeaders !== 'false',
                encrypt: req.query.encrypt === 'true',
                encryptionKey: req.query.encryptionKey,
                dateFormat: req.query.dateFormat || 'ISO',
                allowLarge: req.query.allowLarge === 'true'
            };

            // Validate format
            if (!this.#exportConfig.supportedFormats.includes(options.format)) {
                throw new AppError(
                    `Unsupported export format. Supported formats: ${this.#exportConfig.supportedFormats.join(', ')}`,
                    STATUS_CODES.BAD_REQUEST
                );
            }

            // Perform export
            const result = await userManagementService.exportUsers(filters, options, exportedBy);

            // Log export
            await this.#logControllerAction('USERS_EXPORTED', {
                exportedBy,
                filters,
                format: options.format,
                recordCount: result.metadata.recordCount
            });

            // Set response headers
            const filename = `users_export_${Date.now()}.${options.format.toLowerCase()}`;
            res.setHeader('Content-Type', this.#getContentTypeForFormat(options.format));
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            // Send file
            res.send(result.data);

        } catch (error) {
            logger.error('Error in exportUsers controller:', error);
            next(error);
        }
    }

    /**
     * Get user statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getUserStatistics(req, res, next) {
        try {
            logger.info('Fetching user statistics');

            // Parse filters
            const filters = {
                organizationId: req.query.organizationId,
                userType: req.query.userType,
                status: req.query.status,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo,
                groupBy: req.query.groupBy
            };

            // Parse options
            const options = {
                includeGrowth: req.query.includeGrowth === 'true',
                includeActivity: req.query.includeActivity === 'true',
                includeDemographics: req.query.includeDemographics === 'true',
                skipCache: req.query.skipCache === 'true'
            };

            // Get statistics
            const statistics = await userManagementService.getUserStatistics(filters, options);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                statistics,
                'Statistics retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in getUserStatistics controller:', error);
            next(error);
        }
    }

    /**
     * Get user permissions
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getUserPermissions(req, res, next) {
        try {
            const { id } = req.params;
            const requesterId = req.user?.adminId || req.user?.id;

            logger.info(`Fetching permissions for user: ${id}`);

            // Check if requester can view permissions
            const canViewPermissions =
                id === requesterId ||
                await this.#checkPermission(requesterId, 'userManagement.manageRoles');

            if (!canViewPermissions) {
                throw new AppError('Insufficient permissions to view user permissions', STATUS_CODES.FORBIDDEN);
            }

            // Get user permissions
            const permissions = await userPermissionsService.getUserPermissions(id, {
                skipCache: req.query.skipCache === 'true'
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                permissions,
                'User permissions retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in getUserPermissions controller:', error);
            next(error);
        }
    }

    /**
     * Private helper methods
     */

    #initializeConfigurations() {
        this.#validationConfig = {
            email: {
                required: true,
                pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                maxLength: 255
            },
            username: {
                required: true,
                pattern: /^[a-zA-Z0-9_-]{3,30}$/,
                minLength: 3,
                maxLength: 30
            },
            password: {
                minLength: 12,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true
            },
            name: {
                minLength: 1,
                maxLength: 50,
                pattern: /^[a-zA-Z\s'-]+$/
            }
        };

        this.#paginationConfig = {
            defaultLimit: 20,
            maxLimit: 100,
            defaultPage: 1
        };

        this.#searchConfig = {
            minQueryLength: 2,
            maxResults: 50,
            searchableFields: ['email', 'username', 'firstName', 'lastName', 'phoneNumber']
        };

        this.#exportConfig = {
            supportedFormats: ['CSV', 'JSON', 'EXCEL', 'PDF', 'XML'],
            maxRecords: 10000,
            defaultFields: ['email', 'username', 'firstName', 'lastName', 'createdAt', 'status']
        };

        this.#importConfig = {
            supportedFormats: ['CSV', 'JSON', 'EXCEL', 'XML'],
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxRecords: 5000
        };

        this.#bulkOperationConfig = {
            maxBatchSize: 100,
            batchProcessingSize: 10,
            progressUpdateInterval: 1000
        };

        this.#auditConfig = {
            enabled: true,
            sensitiveFields: ['password', 'twoFactorSecret', 'apiKey', 'apiSecret'],
            retentionDays: 2555
        };

        this.#notificationConfig = {
            welcomeEmail: true,
            passwordReset: true,
            accountChanges: true,
            securityAlerts: true
        };

        this.#rateLimitConfig = {
            create: { windowMs: 60000, max: 20 },
            update: { windowMs: 60000, max: 50 },
            delete: { windowMs: 60000, max: 10 },
            bulkOperations: { windowMs: 300000, max: 5 },
            export: { windowMs: 300000, max: 10 }
        };
    }

    async #checkPermission(userId, permission) {
        try {
            return await userPermissionsService.checkUserPermission(userId, permission);
        } catch (error) {
            logger.error('Error checking permission:', error);
            return false;
        }
    }

    async #validateUserData(data, operation) {
        const errors = [];
        const rules = operation === 'create' ? this.#validationConfig : {};

        // Email validation
        if (operation === 'create' || data.email) {
            if (operation === 'create' && !data.email) {
                errors.push('Email is required');
            } else if (data.email && !this.#validationConfig.email.pattern.test(data.email)) {
                errors.push('Invalid email format');
            }
        }

        // Username validation
        if (operation === 'create' || data.username) {
            if (operation === 'create' && !data.username) {
                errors.push('Username is required');
            } else if (data.username && !this.#validationConfig.username.pattern.test(data.username)) {
                errors.push('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens');
            }
        }

        // Password validation for create
        if (operation === 'create' && data.password) {
            const passwordErrors = this.#validatePassword(data.password);
            errors.push(...passwordErrors);
        }

        // Name validation
        if (data.firstName && !this.#validationConfig.name.pattern.test(data.firstName)) {
            errors.push('Invalid first name format');
        }

        if (data.lastName && !this.#validationConfig.name.pattern.test(data.lastName)) {
            errors.push('Invalid last name format');
        }

        return {
            valid: errors.length === 0,
            message: errors.join('; ')
        };
    }

    #validatePassword(password) {
        const errors = [];
        const config = this.#validationConfig.password;

        if (password.length < config.minLength) {
            errors.push(`Password must be at least ${config.minLength} characters`);
        }

        if (config.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (config.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (config.requireNumbers && !/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        return errors;
    }

    #buildUserCreationOptions(req) {
        return {
            userType: req.body.userType || 'STANDARD',
            organizationId: req.body.organizationId,
            role: req.body.role,
            autoActivate: req.body.autoActivate === true,
            skipEmailVerification: req.body.skipEmailVerification === true,
            sendWelcomeEmail: req.body.sendWelcomeEmail !== false,
            metadata: req.body.metadata || {},
            customFields: req.body.customFields || {}
        };
    }

    #determineUpdateType(updateData) {
        const keys = Object.keys(updateData);

        if (keys.some(k => ['email', 'username', 'phoneNumber'].includes(k))) {
            return 'CONTACT';
        }

        if (keys.some(k => ['firstName', 'lastName', 'avatar', 'bio'].includes(k))) {
            return 'PROFILE';
        }

        if (keys.some(k => ['password', 'twoFactorEnabled', 'securityQuestions'].includes(k))) {
            return 'SECURITY';
        }

        if (keys.some(k => ['preferences', 'settings', 'notifications'].includes(k))) {
            return 'PREFERENCES';
        }

        if (keys.some(k => ['isActive', 'emailVerified', 'accountLocked'].includes(k))) {
            return 'STATUS';
        }

        if (keys.includes('organizationId')) {
            return 'ORGANIZATION';
        }

        if (keys.includes('metadata')) {
            return 'METADATA';
        }

        if (keys.includes('customFields')) {
            return 'CUSTOM_FIELDS';
        }

        if (keys.length > 5) {
            return 'BULK';
        }

        return 'GENERAL';
    }

    #getRequiredPermissionForUpdateType(updateType) {
        const permissionMap = {
            'CONTACT': 'userManagement.update',
            'PROFILE': 'userManagement.update',
            'SECURITY': 'securityAdministration.managePolicies',
            'PREFERENCES': 'userManagement.update',
            'STATUS': 'userManagement.update',
            'ORGANIZATION': 'organizationManagement.update',
            'METADATA': 'userManagement.update',
            'CUSTOM_FIELDS': 'userManagement.update',
            'BULK': 'userManagement.bulkOperations',
            'GENERAL': 'userManagement.update'
        };

        return permissionMap[updateType];
    }

    #parseListFilters(query) {
        const filters = {};

        if (query.status) filters.status = query.status;
        if (query.userType) filters.userType = query.userType;
        if (query.organizationId) filters.organizationId = query.organizationId;
        if (query.role) filters.role = query.role;
        if (query.emailVerified) filters.emailVerified = query.emailVerified === 'true';
        if (query.twoFactorEnabled) filters.twoFactorEnabled = query.twoFactorEnabled === 'true';
        if (query.createdAfter) filters.createdAfter = query.createdAfter;
        if (query.createdBefore) filters.createdBefore = query.createdBefore;
        if (query.lastLoginAfter) filters.lastLoginAfter = query.lastLoginAfter;
        if (query.lastLoginBefore) filters.lastLoginBefore = query.lastLoginBefore;

        return filters;
    }

    #parseListOptions(query) {
        return {
            page: parseInt(query.page) || this.#paginationConfig.defaultPage,
            limit: Math.min(
                parseInt(query.limit) || this.#paginationConfig.defaultLimit,
                this.#paginationConfig.maxLimit
            ),
            sortBy: query.sortBy || 'createdAt',
            sortOrder: query.sortOrder || 'desc',
            populate: query.populate,
            includeStats: query.includeStats === 'true',
            includeLastActivity: query.includeLastActivity === 'true'
        };
    }

    #parseSearchFilters(query) {
        const filters = {};

        if (query.status) filters.status = query.status;
        if (query.userType) filters.userType = query.userType;
        if (query.organizationId) filters.organizationId = query.organizationId;
        if (query.role) filters.role = query.role;

        return filters;
    }

    #parseExportFilters(query) {
        const filters = {};

        if (query.status) filters.status = query.status;
        if (query.userType) filters.userType = query.userType;
        if (query.organizationId) filters.organizationId = query.organizationId;
        if (query.createdAfter) filters.createdAfter = query.createdAfter;
        if (query.createdBefore) filters.createdBefore = query.createdBefore;

        return filters;
    }

    #filterSensitiveUserData(user) {
        const filtered = { ...user };

        // Remove sensitive fields
        delete filtered.password;
        delete filtered.passwordHistory;
        delete filtered.twoFactorSecret;
        delete filtered.securityQuestions;
        delete filtered.apiKey;
        delete filtered.apiSecret;
        delete filtered.resetPasswordToken;
        delete filtered.verificationToken;

        return filtered;
    }

    #sanitizeForLogging(data) {
        const sanitized = { ...data };

        for (const field of this.#auditConfig.sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    #getContentTypeForFormat(format) {
        const contentTypes = {
            'CSV': 'text/csv',
            'JSON': 'application/json',
            'EXCEL': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'PDF': 'application/pdf',
            'XML': 'application/xml'
        };

        return contentTypes[format] || 'application/octet-stream';
    }

    #createProgressCallback(req, res) {
        return (progress) => {
            // Send progress updates via SSE if supported
            if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
            }
        };
    }

    async #logControllerAction(action, data) {
        try {
            logger.audit({
                category: 'USER_MANAGEMENT_CONTROLLER',
                action,
                timestamp: new Date(),
                data: this.#sanitizeForLogging(data)
            });
        } catch (error) {
            logger.error('Error logging controller action:', error);
        }
    }

    /**
   * Missing Private Methods for UserManagementController
   * Add these methods to your UserManagementController class
   */

    // User Creation Methods
    async #createCustomerUser(userData, options, createdBy) {
        const customerSpecificData = {
            ...userData,
            userType: 'CUSTOMER',
            defaultPermissions: ['customer.read', 'customer.update'],
            requiresApproval: false
        };

        return await userManagementService.createUser(customerSpecificData, options, createdBy);
    }

    async #createPartnerUser(userData, options, createdBy) {
        const partnerSpecificData = {
            ...userData,
            userType: 'PARTNER',
            defaultPermissions: ['partner.read', 'partner.update', 'partner.manage'],
            requiresApproval: true
        };

        return await userManagementService.createUser(partnerSpecificData, options, createdBy);
    }

    async #createEmployeeUser(userData, options, createdBy) {
        const employeeSpecificData = {
            ...userData,
            userType: 'EMPLOYEE',
            defaultPermissions: ['employee.read', 'employee.update', 'internal.access'],
            requiresApproval: false
        };

        return await userManagementService.createUser(employeeSpecificData, options, createdBy);
    }

    async #createContractorUser(userData, options, createdBy) {
        const contractorSpecificData = {
            ...userData,
            userType: 'CONTRACTOR',
            defaultPermissions: ['contractor.read', 'contractor.update'],
            requiresApproval: true,
            expirationDate: options.contractEnd
        };

        return await userManagementService.createUser(contractorSpecificData, options, createdBy);
    }

    async #createAPIUser(userData, options, createdBy) {
        const apiUserData = {
            ...userData,
            userType: 'API_USER',
            defaultPermissions: ['api.read', 'api.write'],
            generateApiKey: true,
            requiresApproval: true
        };

        return await userManagementService.createUser(apiUserData, options, createdBy);
    }

    async #createServiceAccount(userData, options, createdBy) {
        const serviceAccountData = {
            ...userData,
            userType: 'SERVICE_ACCOUNT',
            defaultPermissions: ['service.read', 'service.write'],
            generateApiKey: true,
            requiresApproval: false,
            automated: true
        };

        return await userManagementService.createUser(serviceAccountData, options, createdBy);
    }

    async #createGuestUser(userData, options, createdBy) {
        const guestUserData = {
            ...userData,
            userType: 'GUEST',
            defaultPermissions: ['guest.read'],
            requiresApproval: false,
            expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        };

        return await userManagementService.createUser(guestUserData, options, createdBy);
    }

    // Notification Methods
    async #sendWelcomeNotifications(user, options) {
        try {
            if (options.sendWelcomeEmail !== false) {
                // Send welcome email
                logger.info(`Sending welcome email to user: ${user.email}`);
                // Implementation would depend on your notification service
            }

            if (options.sendWelcomeSMS && user.phoneNumber) {
                // Send welcome SMS
                logger.info(`Sending welcome SMS to user: ${user.phoneNumber}`);
            }
        } catch (error) {
            logger.error('Error sending welcome notifications:', error);
        }
    }

    // Update Handler Methods
    async #handlePostUpdateActions(user, updateType, updateData) {
        try {
            switch (updateType) {
                case 'SECURITY':
                    await this.#handleSecurityUpdate(user, updateData);
                    break;
                case 'STATUS':
                    await this.#handleStatusUpdate(user, updateData);
                    break;
                case 'ORGANIZATION':
                    await this.#handleOrganizationUpdate(user, updateData);
                    break;
                default:
                    logger.info(`No post-update actions required for update type: ${updateType}`);
            }
        } catch (error) {
            logger.error('Error in post-update actions:', error);
        }
    }

    async #handleSecurityUpdate(user, updateData) {
        if (updateData.password) {
            // Log password change
            logger.audit(`Password changed for user: ${user._id}`);
        }

        if (updateData.twoFactorEnabled !== undefined) {
            // Log 2FA status change
            logger.audit(`2FA ${updateData.twoFactorEnabled ? 'enabled' : 'disabled'} for user: ${user._id}`);
        }
    }

    async #handleStatusUpdate(user, updateData) {
        if (updateData.isActive !== undefined) {
            if (!updateData.isActive) {
                // Terminate user sessions when deactivated
                await userSessionsService.terminateAllUserSessions(user._id);
            }
            logger.audit(`User ${updateData.isActive ? 'activated' : 'deactivated'}: ${user._id}`);
        }
    }

    async #handleOrganizationUpdate(user, updateData) {
        if (updateData.organizationId) {
            logger.audit(`User organization changed: ${user._id} -> ${updateData.organizationId}`);
        }
    }

    // Permission and Access Methods
    async #getUserOrganization(userId) {
        try {
            const user = await userManagementService.getUser(userId, { populate: 'organization' });
            return user?.organizationId || null;
        } catch (error) {
            logger.error('Error getting user organization:', error);
            return null;
        }
    }

    async #hasGlobalAccess(userId) {
        try {
            return await userPermissionsService.checkUserPermission(userId, 'global.access');
        } catch (error) {
            logger.error('Error checking global access:', error);
            return false;
        }
    }

    // Dependency Check Methods
    async #checkUserDependencies(userId) {
        try {
            const dependencies = {
                hasBlockers: false,
                blockers: [],
                warnings: []
            };

            // Check for active sessions
            const activeSessions = await userSessionsService.getActiveUserSessions(userId);
            if (activeSessions.length > 0) {
                dependencies.warnings.push(`User has ${activeSessions.length} active sessions`);
            }

            // Check for owned resources
            const ownedResources = await this.#checkOwnedResources(userId);
            if (ownedResources.length > 0) {
                dependencies.hasBlockers = true;
                dependencies.blockers.push(`User owns ${ownedResources.length} resources`);
            }

            // Check for pending transactions
            const pendingTransactions = await this.#checkPendingTransactions(userId);
            if (pendingTransactions.length > 0) {
                dependencies.hasBlockers = true;
                dependencies.blockers.push(`User has ${pendingTransactions.length} pending transactions`);
            }

            return dependencies;
        } catch (error) {
            logger.error('Error checking user dependencies:', error);
            return { hasBlockers: false, blockers: [], warnings: [] };
        }
    }

    async #checkOwnedResources(userId) {
        // Implementation would depend on your system's resources
        // This is a placeholder implementation
        try {
            // Check for owned documents, projects, etc.
            return [];
        } catch (error) {
            logger.error('Error checking owned resources:', error);
            return [];
        }
    }

    async #checkPendingTransactions(userId) {
        // Implementation would depend on your system's transaction model
        try {
            // Check for pending financial transactions, orders, etc.
            return [];
        } catch (error) {
            logger.error('Error checking pending transactions:', error);
            return [];
        }
    }

    // Validation Helper Methods
    async #validateUserData(data, operation) {
        const errors = [];

        // Email validation
        if (operation === 'create' || data.email) {
            if (operation === 'create' && !data.email) {
                errors.push('Email is required');
            } else if (data.email && !this.#validationConfig.email.pattern.test(data.email)) {
                errors.push('Invalid email format');
            } else if (data.email) {
                // Check for email uniqueness
                const existingUser = await userManagementService.findUserByEmail(data.email);
                if (existingUser && (operation === 'create' || existingUser._id !== data._id)) {
                    errors.push('Email already exists');
                }
            }
        }

        // Username validation
        if (operation === 'create' || data.username) {
            if (operation === 'create' && !data.username) {
                errors.push('Username is required');
            } else if (data.username && !this.#validationConfig.username.pattern.test(data.username)) {
                errors.push('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens');
            } else if (data.username) {
                // Check for username uniqueness
                const existingUser = await userManagementService.findUserByUsername(data.username);
                if (existingUser && (operation === 'create' || existingUser._id !== data._id)) {
                    errors.push('Username already exists');
                }
            }
        }

        // Password validation for create
        if (operation === 'create' && data.password) {
            const passwordErrors = this.#validatePassword(data.password);
            errors.push(...passwordErrors);
        }

        // Phone number validation
        if (data.phoneNumber) {
            const phonePattern = /^\+?[1-9]\d{1,14}$/;
            if (!phonePattern.test(data.phoneNumber)) {
                errors.push('Invalid phone number format');
            }
        }

        // Name validation
        if (data.firstName && !this.#validationConfig.name.pattern.test(data.firstName)) {
            errors.push('Invalid first name format');
        }

        if (data.lastName && !this.#validationConfig.name.pattern.test(data.lastName)) {
            errors.push('Invalid last name format');
        }

        // Date validation
        if (data.dateOfBirth) {
            const birthDate = new Date(data.dateOfBirth);
            const today = new Date();
            const age = today.getFullYear() - birthDate.getFullYear();

            if (age < 13) {
                errors.push('User must be at least 13 years old');
            }

            if (age > 120) {
                errors.push('Invalid date of birth');
            }
        }

        return {
            valid: errors.length === 0,
            message: errors.join('; '),
            errors
        };
    }

    #validatePassword(password) {
        const errors = [];
        const config = this.#validationConfig.password;

        if (password.length < config.minLength) {
            errors.push(`Password must be at least ${config.minLength} characters`);
        }

        if (config.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (config.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (config.requireNumbers && !/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        // Check against common passwords
        const commonPasswords = [
            'password', '123456', 'password123', 'admin', 'qwerty',
            'letmein', 'welcome', 'monkey', '1234567890'
        ];

        if (commonPasswords.includes(password.toLowerCase())) {
            errors.push('Password is too common');
        }

        return errors;
    }

    // Additional Helper Methods
    #sanitizeForLogging(data) {
        const sanitized = { ...data };

        for (const field of this.#auditConfig.sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        // Also sanitize nested objects
        Object.keys(sanitized).forEach(key => {
            if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
                sanitized[key] = this.#sanitizeForLogging(sanitized[key]);
            }
        });

        return sanitized;
    }

    #getContentTypeForFormat(format) {
        const contentTypes = {
            'CSV': 'text/csv',
            'JSON': 'application/json',
            'EXCEL': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'PDF': 'application/pdf',
            'XML': 'application/xml'
        };

        return contentTypes[format] || 'application/octet-stream';
    }

    #createProgressCallback(req, res) {
        return (progress) => {
            try {
                // Send progress updates via SSE if supported
                if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
                    res.write(`data: ${JSON.stringify(progress)}\n\n`);
                }

                // Log progress for debugging
                logger.debug('Operation progress:', progress);
            } catch (error) {
                logger.error('Error in progress callback:', error);
            }
        };
    }

    async #logControllerAction(action, data) {
        try {
            if (this.#auditConfig.enabled) {
                logger.audit({
                    category: 'USER_MANAGEMENT_CONTROLLER',
                    action,
                    timestamp: new Date(),
                    data: this.#sanitizeForLogging(data)
                });
            }
        } catch (error) {
            logger.error('Error logging controller action:', error);
        }
    }
}

// Export singleton instance
module.exports = new UserManagementController();