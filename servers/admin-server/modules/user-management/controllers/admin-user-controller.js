'use strict';

/**
 * @fileoverview Admin user controller for handling administrative user management endpoints
 * @module servers/admin-server/modules/user-management/controllers/admin-user-controller
 * @requires module:servers/admin-server/modules/user-management/services/admin-user-service
 * @requires module:servers/admin-server/modules/user-management/services/user-permissions-service
 * @requires module:servers/admin-server/modules/user-management/services/user-sessions-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const adminUserService = require('../services/admin-user-service');
const userPermissionsService = require('../services/user-permissions-service');
const userSessionsService = require('../services/user-sessions-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { STATUS_CODES } = require('../../../../../shared/lib/utils/constants/status-codes');

/**
 * Controller class for administrative user management
 * @class AdminUserController
 */
class AdminUserController {
    /**
     * Private fields
     */
    #responseFormatter;
    #validationRules;
    #rateLimits;
    #auditConfig;
    #cacheConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeValidationRules();
        this.#initializeRateLimits();
        this.#initializeAuditConfig();
        this.#initializeCacheConfig();

        // Bind methods to preserve context
        this.createAdminUser = this.createAdminUser.bind(this);
        this.getAdminUser = this.getAdminUser.bind(this);
        this.updateAdminUser = this.updateAdminUser.bind(this);
        this.deleteAdminUser = this.deleteAdminUser.bind(this);
        this.listAdminUsers = this.listAdminUsers.bind(this);
        this.searchAdminUsers = this.searchAdminUsers.bind(this);
        this.assignRole = this.assignRole.bind(this);
        this.revokeRole = this.revokeRole.bind(this);
        this.updatePermissions = this.updatePermissions.bind(this);
        this.suspendAdminUser = this.suspendAdminUser.bind(this);
        this.reactivateAdminUser = this.reactivateAdminUser.bind(this);
        this.bulkUpdateAdminUsers = this.bulkUpdateAdminUsers.bind(this);
        this.importAdminUsers = this.importAdminUsers.bind(this);
        this.exportAdminUsers = this.exportAdminUsers.bind(this);
        this.getAdminUserStatistics = this.getAdminUserStatistics.bind(this);
        this.getAdminUserActivity = this.getAdminUserActivity.bind(this);
        this.resetAdminPassword = this.resetAdminPassword.bind(this);
        this.enableTwoFactor = this.enableTwoFactor.bind(this);
        this.disableTwoFactor = this.disableTwoFactor.bind(this);
        this.getAdminUserSessions = this.getAdminUserSessions.bind(this);
        this.terminateAdminUserSessions = this.terminateAdminUserSessions.bind(this);
        this.getAdminUserPermissions = this.getAdminUserPermissions.bind(this);
        this.auditAdminUser = this.auditAdminUser.bind(this);
        this.generateAdminReport = this.generateAdminReport.bind(this);
        this.updateAccessControl = this.updateAccessControl.bind(this);
        this.addCertification = this.addCertification.bind(this);
        this.addComplianceTraining = this.addComplianceTraining.bind(this);
        this.addAdministrativeNote = this.addAdministrativeNote.bind(this);
        this.updateOnboardingStatus = this.updateOnboardingStatus.bind(this);
        this.getTeamMembers = this.getTeamMembers.bind(this);
        this.updateWorkSchedule = this.updateWorkSchedule.bind(this);

        logger.info('AdminUserController initialized');
    }

    /**
     * Create a new admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createAdminUser(req, res, next) {
        try {
            logger.info('Creating admin user - Controller');

            // Validate request body
            const validationResult = await this.#validateCreateRequest(req.body);
            if (!validationResult.valid) {
                throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
            }

            // Extract admin ID from authenticated user
            const createdBy = req.user?.adminId || req.user?.id;
            if (!createdBy) {
                throw new AppError('Admin authentication required', STATUS_CODES.UNAUTHORIZED);
            }

            // Check permissions
            const hasPermission = await this.#checkPermission(createdBy, 'userManagement.create');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to create admin users', STATUS_CODES.FORBIDDEN);
            }

            // Process request based on creation type
            let result;

            switch (req.body.creationType) {
                case 'SINGLE':
                    result = await this.#createSingleAdminUser(req.body, createdBy);
                    break;

                case 'BULK':
                    result = await this.#createBulkAdminUsers(req.body.users, createdBy);
                    break;

                case 'IMPORT':
                    result = await this.#importAdminUsersFromFile(req.body, req.file, createdBy);
                    break;

                default:
                    result = await this.#createStandardAdminUser(req.body, createdBy);
            }

            // Log successful creation
            await this.#logControllerAction('ADMIN_USER_CREATED', {
                createdBy,
                userData: this.#sanitizeForLogging(req.body)
            });

            // Format and send response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);

        } catch (error) {
            logger.error('Error in createAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * Get admin user by ID or identifier
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                includePermissions: req.query.includePermissions === 'true',
                includeActivity: req.query.includeActivity === 'true',
                includeMetrics: req.query.includeMetrics === 'true',
                skipCache: req.query.skipCache === 'true'
            };

            logger.info(`Fetching admin user: ${id}`);

            // Check permissions
            const requesterId = req.user?.adminId || req.user?.id;
            const canViewSensitiveData = await this.#checkPermission(
                requesterId,
                'userManagement.viewSensitiveData'
            );

            // Get admin user
            const adminUser = await adminUserService.getAdminUser(id, options);

            // Filter sensitive data if no permission
            const filteredUser = canViewSensitiveData
                ? adminUser
                : this.#filterSensitiveData(adminUser);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                filteredUser,
                'Admin user retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in getAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * Update admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const updatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Updating admin user: ${id}`);

            // Validate update data
            const validationResult = await this.#validateUpdateRequest(updateData);
            if (!validationResult.valid) {
                throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
            }

            // Check permissions for specific update types
            const updateType = this.#determineUpdateType(updateData);
            const requiredPermission = this.#getRequiredPermissionForUpdate(updateType);

            const hasPermission = await this.#checkPermission(updatedBy, requiredPermission);
            if (!hasPermission) {
                throw new AppError('Insufficient permissions for this update', STATUS_CODES.FORBIDDEN);
            }

            // Handle different update scenarios
            let result;

            switch (updateType) {
                case 'PROFILE':
                    result = await this.#updateAdminProfile(id, updateData, updatedBy);
                    break;

                case 'DEPARTMENT':
                    result = await this.#updateAdminDepartment(id, updateData, updatedBy);
                    break;

                case 'ACCESS_CONTROL':
                    result = await this.#updateAdminAccessControl(id, updateData, updatedBy);
                    break;

                case 'STATUS':
                    result = await this.#updateAdminStatus(id, updateData, updatedBy);
                    break;

                case 'PERMISSIONS':
                    result = await this.#updateAdminPermissions(id, updateData, updatedBy);
                    break;

                case 'METADATA':
                    result = await this.#updateAdminMetadata(id, updateData, updatedBy);
                    break;

                case 'BULK':
                    result = await this.#processBulkAdminUpdate(id, updateData, updatedBy);
                    break;

                default:
                    result = await adminUserService.updateAdminUser(id, updateData, updatedBy);
            }

            // Log update
            await this.#logControllerAction('ADMIN_USER_UPDATED', {
                adminUserId: id,
                updateType,
                updatedBy,
                changes: this.#sanitizeForLogging(updateData)
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in updateAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * Delete admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async deleteAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const deletedBy = req.user?.adminId || req.user?.id;
            const options = {
                hardDelete: req.query.hardDelete === 'true',
                reason: req.body.reason || 'Administrative deletion'
            };

            logger.info(`Deleting admin user: ${id}`);

            // Check delete permissions
            const hasPermission = await this.#checkPermission(deletedBy, 'userManagement.delete');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to delete admin users', STATUS_CODES.FORBIDDEN);
            }

            // Prevent self-deletion
            if (id === deletedBy) {
                throw new AppError('Cannot delete your own admin account', STATUS_CODES.BAD_REQUEST);
            }

            // Check for cascading implications
            const implications = await this.#checkDeletionImplications(id);
            if (implications.hasBlockers && !options.force) {
                throw new AppError(
                    'Cannot delete user due to existing dependencies',
                    STATUS_CODES.CONFLICT,
                    implications
                );
            }

            // Delete admin user
            const result = await adminUserService.deleteAdminUser(id, options, deletedBy);

            // Log deletion
            await this.#logControllerAction('ADMIN_USER_DELETED', {
                adminUserId: id,
                deletedBy,
                options
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user deleted successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in deleteAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * List admin users with filtering and pagination
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async listAdminUsers(req, res, next) {
        try {
            logger.info('Listing admin users');

            // Parse filters and options
            const filters = this.#parseListFilters(req.query);
            const options = this.#parseListOptions(req.query);

            // Check read permissions
            const requesterId = req.user?.adminId || req.user?.id;
            const hasPermission = await this.#checkPermission(requesterId, 'userManagement.read');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to list admin users', STATUS_CODES.FORBIDDEN);
            }

            // Apply department-based filtering if needed
            const userDepartment = await this.#getUserDepartment(requesterId);
            if (userDepartment && !this.#hasGlobalAccess(requesterId)) {
                filters.department = userDepartment;
            }

            // Get admin users list
            const result = await adminUserService.listAdminUsers(filters, options);

            // Format response with pagination metadata
            const response = this.#responseFormatter.formatPaginatedSuccess(
                result.users,
                result.pagination,
                'Admin users retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in listAdminUsers controller:', error);
            next(error);
        }
    }

    /**
     * Search admin users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchAdminUsers(req, res, next) {
        try {
            const { q: searchQuery } = req.query;

            if (!searchQuery || searchQuery.length < 2) {
                throw new AppError('Search query must be at least 2 characters', STATUS_CODES.BAD_REQUEST);
            }

            logger.info(`Searching admin users: ${searchQuery}`);

            // Parse search options
            const options = {
                department: req.query.department,
                status: req.query.status,
                role: req.query.role,
                limit: parseInt(req.query.limit) || 10
            };

            // Perform search
            const results = await adminUserService.searchAdminUsers(searchQuery, options);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Found ${results.length} admin users`
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in searchAdminUsers controller:', error);
            next(error);
        }
    }

    /**
     * Assign role to admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async assignRole(req, res, next) {
        try {
            const { id } = req.params;
            const roleData = req.body;
            const assignedBy = req.user?.adminId || req.user?.id;

            logger.info(`Assigning role to admin user: ${id}`);

            // Validate role data
            if (!roleData.roleName) {
                throw new AppError('Role name is required', STATUS_CODES.BAD_REQUEST);
            }

            // Check role assignment permissions
            const hasPermission = await this.#checkPermission(assignedBy, 'userManagement.manageRoles');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to assign roles', STATUS_CODES.FORBIDDEN);
            }

            // Check for role elevation attempt
            if (await this.#isRoleElevation(assignedBy, roleData.roleName)) {
                throw new AppError('Cannot assign a role higher than your own', STATUS_CODES.FORBIDDEN);
            }

            // Assign role
            const result = await adminUserService.assignRole(id, roleData, assignedBy);

            // Log role assignment
            await this.#logControllerAction('ROLE_ASSIGNED', {
                adminUserId: id,
                roleData,
                assignedBy
            });

            // Send notification
            await this.#sendRoleAssignmentNotification(id, roleData, assignedBy);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Role assigned successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in assignRole controller:', error);
            next(error);
        }
    }

    /**
     * Revoke role from admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async revokeRole(req, res, next) {
        try {
            const { id } = req.params;
            const { roleName, reason } = req.body;
            const revokedBy = req.user?.adminId || req.user?.id;

            logger.info(`Revoking role from admin user: ${id}`);

            // Validate request
            if (!roleName) {
                throw new AppError('Role name is required', STATUS_CODES.BAD_REQUEST);
            }

            if (!reason) {
                throw new AppError('Revocation reason is required', STATUS_CODES.BAD_REQUEST);
            }

            // Check permissions
            const hasPermission = await this.#checkPermission(revokedBy, 'userManagement.manageRoles');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to revoke roles', STATUS_CODES.FORBIDDEN);
            }

            // Revoke role
            const result = await adminUserService.revokeRole(id, roleName, revokedBy, reason);

            // Log revocation
            await this.#logControllerAction('ROLE_REVOKED', {
                adminUserId: id,
                roleName,
                reason,
                revokedBy
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Role revoked successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in revokeRole controller:', error);
            next(error);
        }
    }

    /**
     * Update admin user permissions
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updatePermissions(req, res, next) {
        try {
            const { id } = req.params;
            const permissions = req.body.permissions;
            const updatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Updating permissions for admin user: ${id}`);

            // Validate permissions object
            if (!permissions || typeof permissions !== 'object') {
                throw new AppError('Invalid permissions object', STATUS_CODES.BAD_REQUEST);
            }

            // Check permission management rights
            const hasPermission = await this.#checkPermission(updatedBy, 'userManagement.manageRoles');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to update permissions', STATUS_CODES.FORBIDDEN);
            }

            // Validate permission changes
            const validationResult = await this.#validatePermissionChanges(permissions);
            if (!validationResult.valid) {
                throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
            }

            // Update permissions
            const result = await adminUserService.updatePermissions(id, permissions, updatedBy);

            // Force session refresh for the user
            await userSessionsService.terminateUserSessions(id, 'PERMISSIONS_UPDATED', {
                skipNotification: false
            });

            // Log permission update
            await this.#logControllerAction('PERMISSIONS_UPDATED', {
                adminUserId: id,
                permissions: this.#sanitizeForLogging(permissions),
                updatedBy
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Permissions updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in updatePermissions controller:', error);
            next(error);
        }
    }

    /**
     * Suspend admin user account
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async suspendAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const suspensionData = req.body;
            const suspendedBy = req.user?.adminId || req.user?.id;

            logger.info(`Suspending admin user: ${id}`);

            // Validate suspension data
            if (!suspensionData.reason) {
                throw new AppError('Suspension reason is required', STATUS_CODES.BAD_REQUEST);
            }

            // Check permissions
            const hasPermission = await this.#checkPermission(suspendedBy, 'userManagement.update');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to suspend users', STATUS_CODES.FORBIDDEN);
            }

            // Prevent self-suspension
            if (id === suspendedBy) {
                throw new AppError('Cannot suspend your own account', STATUS_CODES.BAD_REQUEST);
            }

            // Suspend user
            const result = await adminUserService.suspendAdminUser(id, suspensionData, suspendedBy);

            // Log suspension
            await this.#logControllerAction('ADMIN_USER_SUSPENDED', {
                adminUserId: id,
                suspensionData,
                suspendedBy
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user suspended successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in suspendAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * Reactivate suspended admin user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async reactivateAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const reactivatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Reactivating admin user: ${id}`);

            // Check permissions
            const hasPermission = await this.#checkPermission(reactivatedBy, 'userManagement.update');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions to reactivate users', STATUS_CODES.FORBIDDEN);
            }

            // Reactivate user
            const result = await adminUserService.reactivateAdminUser(id, reactivatedBy);

            // Log reactivation
            await this.#logControllerAction('ADMIN_USER_REACTIVATED', {
                adminUserId: id,
                reactivatedBy
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user reactivated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in reactivateAdminUser controller:', error);
            next(error);
        }
    }

    /**
     * Bulk update admin users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkUpdateAdminUsers(req, res, next) {
        try {
            const { userIds, updateData } = req.body;
            const updatedBy = req.user?.adminId || req.user?.id;

            logger.info(`Bulk updating ${userIds.length} admin users`);

            // Validate bulk update request
            if (!Array.isArray(userIds) || userIds.length === 0) {
                throw new AppError('User IDs array is required', STATUS_CODES.BAD_REQUEST);
            }

            if (userIds.length > 100) {
                throw new AppError('Maximum 100 users can be updated at once', STATUS_CODES.BAD_REQUEST);
            }

            // Check bulk operations permission
            const hasPermission = await this.#checkPermission(updatedBy, 'userManagement.bulkOperations');
            if (!hasPermission) {
                throw new AppError('Insufficient permissions for bulk operations', STATUS_CODES.FORBIDDEN);
            }

            // Perform bulk update
            const result = await adminUserService.bulkUpdateAdminUsers(userIds, updateData, updatedBy);

            // Log bulk operation
            await this.#logControllerAction('BULK_UPDATE_ADMIN_USERS', {
                userIds,
                updateData: this.#sanitizeForLogging(updateData),
                updatedBy,
                results: result
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                `Bulk update completed: ${result.successful.length} successful, ${result.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in bulkUpdateAdminUsers controller:', error);
            next(error);
        }
    }

    /**
     * Get admin user statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getAdminUserStatistics(req, res, next) {
        try {
            logger.info('Fetching admin user statistics');

            // Parse filters
            const filters = {
                department: req.query.department,
                status: req.query.status,
                role: req.query.role,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            // Get statistics
            const statistics = await adminUserService.getAdminUserStatistics(filters);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                statistics,
                'Statistics retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);

        } catch (error) {
            logger.error('Error in getAdminUserStatistics controller:', error);
            next(error);
        }
    }

    /**
     * Private helper methods
     */

    #initializeValidationRules() {
        this.#validationRules = {
            createUser: {
                email: { required: true, type: 'email' },
                username: { required: true, type: 'string', minLength: 3, maxLength: 30 },
                firstName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
                lastName: { required: true, type: 'string', minLength: 1, maxLength: 50 },
                department: { required: true, type: 'enum', values: ['EXECUTIVE', 'OPERATIONS', 'TECHNICAL', 'SUPPORT', 'SECURITY', 'COMPLIANCE', 'FINANCE', 'HUMAN_RESOURCES'] },
                title: { required: true, type: 'string', minLength: 2, maxLength: 100 }
            },
            updateUser: {
                email: { type: 'email' },
                firstName: { type: 'string', minLength: 1, maxLength: 50 },
                lastName: { type: 'string', minLength: 1, maxLength: 50 },
                department: { type: 'enum', values: ['EXECUTIVE', 'OPERATIONS', 'TECHNICAL', 'SUPPORT', 'SECURITY', 'COMPLIANCE', 'FINANCE', 'HUMAN_RESOURCES'] },
                title: { type: 'string', minLength: 2, maxLength: 100 }
            }
        };
    }

    #initializeRateLimits() {
        this.#rateLimits = {
            create: { windowMs: 60000, max: 10 }, // 10 creates per minute
            update: { windowMs: 60000, max: 30 }, // 30 updates per minute
            delete: { windowMs: 60000, max: 5 }, // 5 deletes per minute
            bulkOperations: { windowMs: 60000, max: 5 }, // 5 bulk operations per minute
            export: { windowMs: 300000, max: 5 } // 5 exports per 5 minutes
        };
    }

    #initializeAuditConfig() {
        this.#auditConfig = {
            enabled: true,
            sensitiveFields: ['password', 'twoFactorSecret', 'securityQuestions', 'mfaSecret'],
            retentionDays: 2555 // 7 years
        };
    }

    #initializeCacheConfig() {
        this.#cacheConfig = {
            enabled: true,
            ttl: 300, // 5 minutes
            prefix: 'admin:user:controller:'
        };
    }

    async #validateCreateRequest(data) {
        const errors = [];
        const rules = this.#validationRules.createUser;

        for (const [field, rule] of Object.entries(rules)) {
            if (rule.required && !data[field]) {
                errors.push(`${field} is required`);
                continue;
            }

            if (data[field]) {
                if (rule.type === 'email' && !CommonValidator.isValidEmail(data[field])) {
                    errors.push(`${field} must be a valid email`);
                }

                if (rule.type === 'string') {
                    if (rule.minLength && data[field].length < rule.minLength) {
                        errors.push(`${field} must be at least ${rule.minLength} characters`);
                    }
                    if (rule.maxLength && data[field].length > rule.maxLength) {
                        errors.push(`${field} must be at most ${rule.maxLength} characters`);
                    }
                }

                if (rule.type === 'enum' && !rule.values.includes(data[field])) {
                    errors.push(`${field} must be one of: ${rule.values.join(', ')}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            message: errors.join('; ')
        };
    }

    async #validateUpdateRequest(data) {
        const errors = [];
        const rules = this.#validationRules.updateUser;

        for (const [field, rule] of Object.entries(rules)) {
            if (data[field]) {
                if (rule.type === 'email' && !CommonValidator.isValidEmail(data[field])) {
                    errors.push(`${field} must be a valid email`);
                }

                if (rule.type === 'string') {
                    if (rule.minLength && data[field].length < rule.minLength) {
                        errors.push(`${field} must be at least ${rule.minLength} characters`);
                    }
                    if (rule.maxLength && data[field].length > rule.maxLength) {
                        errors.push(`${field} must be at most ${rule.maxLength} characters`);
                    }
                }

                if (rule.type === 'enum' && !rule.values.includes(data[field])) {
                    errors.push(`${field} must be one of: ${rule.values.join(', ')}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            message: errors.join('; ')
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

    #determineUpdateType(updateData) {
        const keys = Object.keys(updateData);

        if (keys.some(k => ['displayName', 'title', 'officeLocation', 'timezone'].includes(k))) {
            return 'PROFILE';
        }

        if (keys.includes('department')) {
            return 'DEPARTMENT';
        }

        if (keys.some(k => ['ipWhitelist', 'accessHours', 'geofencing', 'mfaRequirements'].includes(k))) {
            return 'ACCESS_CONTROL';
        }

        if (keys.some(k => ['accountStatus', 'suspensionDetails', 'terminationDetails'].includes(k))) {
            return 'STATUS';
        }

        if (keys.includes('granularPermissions')) {
            return 'PERMISSIONS';
        }

        if (keys.some(k => ['certifications', 'complianceTraining', 'administrativeNotes'].includes(k))) {
            return 'METADATA';
        }

        if (keys.length > 5) {
            return 'BULK';
        }

        return 'GENERAL';
    }

    #getRequiredPermissionForUpdate(updateType) {
        const permissionMap = {
            'PROFILE': 'userManagement.update',
            'DEPARTMENT': 'userManagement.update',
            'ACCESS_CONTROL': 'securityAdministration.managePolicies',
            'STATUS': 'userManagement.update',
            'PERMISSIONS': 'userManagement.manageRoles',
            'METADATA': 'userManagement.update',
            'BULK': 'userManagement.bulkOperations',
            'GENERAL': 'userManagement.update'
        };

        return permissionMap[updateType] || 'userManagement.update';
    }

    #parseListFilters(query) {
        const filters = {};

        if (query.status) filters.status = query.status;
        if (query.department) filters.department = query.department;
        if (query.role) filters.role = query.role;
        if (query.reportingTo) filters.reportingTo = query.reportingTo;
        if (query.createdAfter) filters.createdAfter = query.createdAfter;
        if (query.createdBefore) filters.createdBefore = query.createdBefore;
        if (query.lastActiveAfter) filters.lastActiveAfter = query.lastActiveAfter;

        return filters;
    }

    #parseListOptions(query) {
        return {
            page: parseInt(query.page) || 1,
            limit: Math.min(parseInt(query.limit) || 20, 100),
            sortBy: query.sortBy || 'createdAt',
            sortOrder: query.sortOrder || 'desc',
            includeStats: query.includeStats === 'true',
            includeLastActivity: query.includeLastActivity === 'true'
        };
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

    #filterSensitiveData(user) {
        const filtered = { ...user };

        delete filtered.accessControl?.mfaRequirements?.backupCodes;
        delete filtered.activityTracking?.loginHistory;
        delete filtered.auditLog?.accessLog;

        return filtered;
    }

    async #logControllerAction(action, data) {
        try {
            logger.audit({
                category: 'ADMIN_USER_CONTROLLER',
                action,
                timestamp: new Date(),
                data: this.#sanitizeForLogging(data)
            });
        } catch (error) {
            logger.error('Error logging controller action:', error);
        }
    }

    /**
     * Create a single admin user
     * @private
     */
    async #createSingleAdminUser(userData, createdBy) {
        try {
            // Enrich user data with defaults
            const enrichedData = {
                ...userData,
                adminProfile: {
                    displayName: `${userData.firstName} ${userData.lastName}`,
                    title: userData.title,
                    department: userData.department,
                    officeLocation: userData.officeLocation || null,
                    timezone: userData.timezone || 'UTC',
                    startDate: userData.startDate || new Date(),
                    employeeId: userData.employeeId || this.#generateEmployeeId(),
                    reportingTo: userData.reportingTo || null
                },
                accessControl: {
                    mfaRequired: userData.mfaRequired !== false,
                    ipWhitelist: userData.ipWhitelist || [],
                    accessHours: userData.accessHours || {
                        enabled: false,
                        schedule: {}
                    },
                    geofencing: userData.geofencing || {
                        enabled: false,
                        allowedRegions: []
                    }
                },
                metadata: {
                    creationMethod: 'SINGLE_CREATE',
                    createdByAdmin: createdBy,
                    initialRoles: userData.roles || [],
                    ...userData.metadata
                }
            };

            // Create admin user through service
            const result = await adminUserService.createAdminUser(enrichedData, {
                sendWelcomeEmail: userData.sendWelcomeEmail !== false,
                requirePasswordChange: userData.requirePasswordChange !== false,
                skipEmailVerification: userData.skipEmailVerification || false
            }, createdBy);

            return result;
        } catch (error) {
            logger.error('Error creating single admin user:', error);
            throw error;
        }
    }

    /**
     * Create multiple admin users in bulk
     * @private
     */
    async #createBulkAdminUsers(usersData, createdBy) {
        try {
            // Validate bulk data
            if (!Array.isArray(usersData) || usersData.length === 0) {
                throw new AppError('Users data must be a non-empty array', STATUS_CODES.BAD_REQUEST);
            }

            if (usersData.length > 50) {
                throw new AppError('Maximum 50 users can be created at once', STATUS_CODES.BAD_REQUEST);
            }

            // Process users in batches
            const batchSize = 10;
            const results = {
                successful: [],
                failed: [],
                totalProcessed: 0
            };

            for (let i = 0; i < usersData.length; i += batchSize) {
                const batch = usersData.slice(i, i + batchSize);

                for (const userData of batch) {
                    try {
                        const enrichedData = {
                            ...userData,
                            metadata: {
                                creationMethod: 'BULK_CREATE',
                                batchIndex: i / batchSize + 1,
                                ...userData.metadata
                            }
                        };

                        const result = await this.#createSingleAdminUser(enrichedData, createdBy);
                        results.successful.push({
                            userData: userData,
                            result: result
                        });
                    } catch (error) {
                        results.failed.push({
                            userData: userData,
                            error: error.message
                        });
                    }
                    results.totalProcessed++;
                }
            }

            return results;
        } catch (error) {
            logger.error('Error creating bulk admin users:', error);
            throw error;
        }
    }

    /**
     * Import admin users from file
     * @private
     */
    async #importAdminUsersFromFile(importData, file, createdBy) {
        try {
            if (!file) {
                throw new AppError('Import file is required', STATUS_CODES.BAD_REQUEST);
            }

            // Parse file based on type
            let parsedData;
            const fileExtension = file.originalname.split('.').pop().toLowerCase();

            switch (fileExtension) {
                case 'csv':
                    parsedData = await this.#parseCSVFile(file);
                    break;
                case 'xlsx':
                case 'xls':
                    parsedData = await this.#parseExcelFile(file);
                    break;
                case 'json':
                    parsedData = await this.#parseJSONFile(file);
                    break;
                default:
                    throw new AppError('Unsupported file format. Use CSV, Excel, or JSON', STATUS_CODES.BAD_REQUEST);
            }

            // Apply field mapping if provided
            if (importData.fieldMapping) {
                parsedData = this.#applyFieldMapping(parsedData, importData.fieldMapping);
            }

            // Validate imported data
            const validationResults = await this.#validateImportedData(parsedData);

            if (validationResults.errors.length > 0 && !importData.skipInvalid) {
                throw new AppError('Import validation failed', STATUS_CODES.BAD_REQUEST, {
                    errors: validationResults.errors
                });
            }

            // Create users from valid data
            const createResults = await this.#createBulkAdminUsers(validationResults.validUsers, createdBy);

            return {
                imported: createResults.successful.length,
                failed: createResults.failed.length + validationResults.errors.length,
                details: {
                    successful: createResults.successful,
                    failed: [...createResults.failed, ...validationResults.errors]
                }
            };
        } catch (error) {
            logger.error('Error importing admin users from file:', error);
            throw error;
        }
    }

    /**
     * Create standard admin user
     * @private
     */
    async #createStandardAdminUser(userData, createdBy) {
        return await this.#createSingleAdminUser(userData, createdBy);
    }

    /**
     * Update admin user profile
     * @private
     */
    async #updateAdminProfile(adminUserId, updateData, updatedBy) {
        try {
            const profileUpdates = {
                adminProfile: {}
            };

            // Map profile fields
            const profileFields = ['displayName', 'title', 'officeLocation', 'timezone', 'phoneNumber', 'biography'];
            profileFields.forEach(field => {
                if (updateData[field] !== undefined) {
                    profileUpdates.adminProfile[field] = updateData[field];
                }
            });

            // Handle name changes
            if (updateData.firstName || updateData.lastName) {
                const currentUser = await adminUserService.getAdminUser(adminUserId);
                const firstName = updateData.firstName || currentUser.firstName;
                const lastName = updateData.lastName || currentUser.lastName;

                profileUpdates.firstName = firstName;
                profileUpdates.lastName = lastName;
                profileUpdates.adminProfile.displayName = `${firstName} ${lastName}`;
            }

            return await adminUserService.updateAdminUser(adminUserId, profileUpdates, updatedBy);
        } catch (error) {
            logger.error('Error updating admin profile:', error);
            throw error;
        }
    }

    /**
     * Update admin user department
     * @private
     */
    async #updateAdminDepartment(adminUserId, updateData, updatedBy) {
        try {
            const departmentUpdates = {
                adminProfile: {
                    department: updateData.department
                }
            };

            // Handle reporting structure changes
            if (updateData.reportingTo !== undefined) {
                departmentUpdates.adminProfile.reportingTo = updateData.reportingTo;
            }

            // Handle team assignments
            if (updateData.teamAssignments) {
                departmentUpdates.adminProfile.teamAssignments = updateData.teamAssignments;
            }

            // Add audit trail for department changes
            departmentUpdates.auditLog = {
                departmentChange: {
                    previousDepartment: (await adminUserService.getAdminUser(adminUserId)).adminProfile?.department,
                    newDepartment: updateData.department,
                    changedBy: updatedBy,
                    changedAt: new Date(),
                    reason: updateData.reason || 'Department reassignment'
                }
            };

            return await adminUserService.updateAdminUser(adminUserId, departmentUpdates, updatedBy);
        } catch (error) {
            logger.error('Error updating admin department:', error);
            throw error;
        }
    }

    /**
     * Update admin access control settings
     * @private
     */
    async #updateAdminAccessControl(adminUserId, updateData, updatedBy) {
        try {
            const accessUpdates = {
                accessControl: {}
            };

            // Handle IP whitelist updates
            if (updateData.ipWhitelist !== undefined) {
                accessUpdates.accessControl.ipWhitelist = updateData.ipWhitelist;
            }

            // Handle access hours updates
            if (updateData.accessHours !== undefined) {
                accessUpdates.accessControl.accessHours = updateData.accessHours;
            }

            // Handle geofencing updates
            if (updateData.geofencing !== undefined) {
                accessUpdates.accessControl.geofencing = updateData.geofencing;
            }

            // Handle MFA requirements
            if (updateData.mfaRequirements !== undefined) {
                accessUpdates.accessControl.mfaRequirements = updateData.mfaRequirements;
            }

            // Handle session restrictions
            if (updateData.sessionRestrictions !== undefined) {
                accessUpdates.accessControl.sessionRestrictions = updateData.sessionRestrictions;
            }

            return await adminUserService.updateAdminUser(adminUserId, accessUpdates, updatedBy);
        } catch (error) {
            logger.error('Error updating admin access control:', error);
            throw error;
        }
    }

    /**
     * Update admin user status
     * @private
     */
    async #updateAdminStatus(adminUserId, updateData, updatedBy) {
        try {
            const statusUpdates = {};

            // Handle account status changes
            if (updateData.accountStatus !== undefined) {
                statusUpdates.accountStatus = updateData.accountStatus;

                // Add status change audit
                statusUpdates.auditLog = {
                    statusChange: {
                        previousStatus: (await adminUserService.getAdminUser(adminUserId)).accountStatus,
                        newStatus: updateData.accountStatus,
                        changedBy: updatedBy,
                        changedAt: new Date(),
                        reason: updateData.statusChangeReason || 'Status update'
                    }
                };
            }

            // Handle suspension
            if (updateData.suspensionDetails) {
                statusUpdates.suspensionDetails = {
                    ...updateData.suspensionDetails,
                    suspendedBy: updatedBy,
                    suspendedAt: new Date()
                };
            }

            // Handle termination
            if (updateData.terminationDetails) {
                statusUpdates.terminationDetails = {
                    ...updateData.terminationDetails,
                    terminatedBy: updatedBy,
                    terminatedAt: new Date()
                };

                // Terminate all active sessions
                await userSessionsService.terminateUserSessions(adminUserId, 'ACCOUNT_TERMINATED');
            }

            return await adminUserService.updateAdminUser(adminUserId, statusUpdates, updatedBy);
        } catch (error) {
            logger.error('Error updating admin status:', error);
            throw error;
        }
    }

    /**
     * Update admin user permissions
     * @private
     */
    async #updateAdminPermissions(adminUserId, updateData, updatedBy) {
        try {
            const permissionUpdates = {
                granularPermissions: updateData.granularPermissions
            };

            // Add permission change audit
            const currentUser = await adminUserService.getAdminUser(adminUserId);
            permissionUpdates.auditLog = {
                permissionChange: {
                    previousPermissions: currentUser.granularPermissions,
                    newPermissions: updateData.granularPermissions,
                    changedBy: updatedBy,
                    changedAt: new Date(),
                    reason: updateData.permissionChangeReason || 'Permission update'
                }
            };

            const result = await adminUserService.updateAdminUser(adminUserId, permissionUpdates, updatedBy);

            // Update permissions in permission service
            if (updateData.granularPermissions) {
                await userPermissionsService.updateUserPermissions(adminUserId, updateData.granularPermissions, updatedBy);
            }

            return result;
        } catch (error) {
            logger.error('Error updating admin permissions:', error);
            throw error;
        }
    }

    /**
     * Update admin user metadata
     * @private
     */
    async #updateAdminMetadata(adminUserId, updateData, updatedBy) {
        try {
            const metadataUpdates = {};

            // Handle certifications
            if (updateData.certifications) {
                metadataUpdates.certifications = updateData.certifications;
            }

            // Handle compliance training
            if (updateData.complianceTraining) {
                metadataUpdates.complianceTraining = updateData.complianceTraining;
            }

            // Handle administrative notes
            if (updateData.administrativeNotes) {
                metadataUpdates.administrativeNotes = updateData.administrativeNotes;
            }

            // Handle custom metadata
            if (updateData.customMetadata) {
                metadataUpdates.customMetadata = updateData.customMetadata;
            }

            return await adminUserService.updateAdminUser(adminUserId, metadataUpdates, updatedBy);
        } catch (error) {
            logger.error('Error updating admin metadata:', error);
            throw error;
        }
    }

    /**
     * Process bulk admin update
     * @private
     */
    async #processBulkAdminUpdate(adminUserId, updateData, updatedBy) {
        try {
            // Determine which subsystems need updates
            const updateTypes = [];

            if (this.#hasProfileFields(updateData)) {
                updateTypes.push('PROFILE');
            }

            if (updateData.department) {
                updateTypes.push('DEPARTMENT');
            }

            if (this.#hasAccessControlFields(updateData)) {
                updateTypes.push('ACCESS_CONTROL');
            }

            if (this.#hasStatusFields(updateData)) {
                updateTypes.push('STATUS');
            }

            // Process updates sequentially to maintain data integrity
            const results = {};

            for (const updateType of updateTypes) {
                try {
                    switch (updateType) {
                        case 'PROFILE':
                            results.profile = await this.#updateAdminProfile(adminUserId, updateData, updatedBy);
                            break;
                        case 'DEPARTMENT':
                            results.department = await this.#updateAdminDepartment(adminUserId, updateData, updatedBy);
                            break;
                        case 'ACCESS_CONTROL':
                            results.accessControl = await this.#updateAdminAccessControl(adminUserId, updateData, updatedBy);
                            break;
                        case 'STATUS':
                            results.status = await this.#updateAdminStatus(adminUserId, updateData, updatedBy);
                            break;
                    }
                } catch (error) {
                    results[updateType.toLowerCase()] = { error: error.message };
                }
            }

            return {
                bulkUpdate: true,
                results,
                updateTypes,
                updatedAt: new Date()
            };
        } catch (error) {
            logger.error('Error processing bulk admin update:', error);
            throw error;
        }
    }

    /**
     * Check deletion implications
     * @private
     */
    async #checkDeletionImplications(adminUserId) {
        try {
            const implications = {
                hasBlockers: false,
                blockers: [],
                warnings: [],
                dependencies: []
            };

            // Check if user has active sessions
            const activeSessions = await userSessionsService.getUserSessions(adminUserId, { activeOnly: true });
            if (activeSessions.length > 0) {
                implications.warnings.push(`User has ${activeSessions.length} active sessions that will be terminated`);
            }

            // Check if user is managing other users
            const managedUsers = await adminUserService.listAdminUsers({ reportingTo: adminUserId });
            if (managedUsers.users.length > 0) {
                implications.hasBlockers = true;
                implications.blockers.push(`User manages ${managedUsers.users.length} other admin users. Reassign reporting structure first.`);
            }

            // Check if user owns critical resources
            const ownedResources = await this.#checkOwnedResources(adminUserId);
            if (ownedResources.length > 0) {
                implications.hasBlockers = true;
                implications.blockers.push(`User owns ${ownedResources.length} critical resources. Transfer ownership first.`);
                implications.dependencies.push(...ownedResources);
            }

            // Check if user is the only one with certain permissions
            const criticalPermissions = await this.#checkCriticalPermissions(adminUserId);
            if (criticalPermissions.length > 0) {
                implications.hasBlockers = true;
                implications.blockers.push(`User is the only one with critical permissions: ${criticalPermissions.join(', ')}`);
            }

            // Check ongoing processes
            const ongoingProcesses = await this.#checkOngoingProcesses(adminUserId);
            if (ongoingProcesses.length > 0) {
                implications.warnings.push(`User has ${ongoingProcesses.length} ongoing processes that may be affected`);
                implications.dependencies.push(...ongoingProcesses);
            }

            return implications;
        } catch (error) {
            logger.error('Error checking deletion implications:', error);
            return { hasBlockers: false, blockers: [], warnings: [], dependencies: [] };
        }
    }

    /**
     * Get user department
     * @private
     */
    async #getUserDepartment(adminUserId) {
        try {
            const adminUser = await adminUserService.getAdminUser(adminUserId, { skipCache: true });
            return adminUser.adminProfile?.department || null;
        } catch (error) {
            logger.error('Error getting user department:', error);
            return null;
        }
    }

    /**
     * Check if user has global access
     * @private
     */
    async #hasGlobalAccess(adminUserId) {
        try {
            const hasPermission = await this.#checkPermission(adminUserId, 'systemAdministration.globalAccess');
            return hasPermission;
        } catch (error) {
            logger.error('Error checking global access:', error);
            return false;
        }
    }

    /**
     * Check if role assignment is an elevation
     * @private
     */
    async #isRoleElevation(assignerId, targetRole) {
        try {
            const assigner = await adminUserService.getAdminUser(assignerId);
            const assignerRoles = assigner.roles || [];

            // Define role hierarchy (higher number = higher privilege)
            const roleHierarchy = {
                'USER_ADMIN': 1,
                'DEPARTMENT_ADMIN': 2,
                'SUPPORT_ADMIN': 3,
                'BILLING_ADMIN': 3,
                'SECURITY_ADMIN': 4,
                'PLATFORM_ADMIN': 5,
                'SUPER_ADMIN': 6
            };

            const assignerMaxLevel = Math.max(...assignerRoles.map(role => roleHierarchy[role] || 0));
            const targetRoleLevel = roleHierarchy[targetRole] || 0;

            return targetRoleLevel > assignerMaxLevel;
        } catch (error) {
            logger.error('Error checking role elevation:', error);
            return true; // Err on the side of caution
        }
    }

    /**
     * Send role assignment notification
     * @private
     */
    async #sendRoleAssignmentNotification(adminUserId, roleData, assignedBy) {
        try {
            const adminUser = await adminUserService.getAdminUser(adminUserId);
            const assigner = await adminUserService.getAdminUser(assignedBy);

            // Send in-app notification
            await this.#sendNotification({
                userId: adminUserId,
                type: 'ROLE_ASSIGNED',
                title: 'New Role Assigned',
                message: `You have been assigned the role: ${roleData.roleName}`,
                metadata: {
                    roleName: roleData.roleName,
                    assignedBy: assigner.adminProfile?.displayName || 'System Admin',
                    assignedAt: new Date()
                }
            });

            // Send email notification
            await this.#sendEmail({
                to: adminUser.email,
                subject: 'Role Assignment Notification',
                template: 'role-assignment',
                context: {
                    userName: adminUser.adminProfile?.displayName || `${adminUser.firstName} ${adminUser.lastName}`,
                    roleName: roleData.roleName,
                    assignedBy: assigner.adminProfile?.displayName || 'System Administrator',
                    effectiveDate: roleData.effectiveDate || new Date(),
                    expiryDate: roleData.expiryDate || null
                }
            });

        } catch (error) {
            logger.error('Error sending role assignment notification:', error);
            // Don't throw error as this is non-critical
        }
    }

    /**
     * Validate permission changes
     * @private
     */
    async #validatePermissionChanges(permissions) {
        try {
            const errors = [];

            // Check if permissions object is valid
            if (!permissions || typeof permissions !== 'object') {
                errors.push('Permissions must be an object');
                return { valid: false, message: errors.join('; ') };
            }

            // Validate permission structure
            const validCategories = [
                'userManagement', 'systemAdministration', 'securityAdministration',
                'contentManagement', 'financialManagement', 'reportingAnalytics'
            ];

            for (const [category, categoryPermissions] of Object.entries(permissions)) {
                if (!validCategories.includes(category)) {
                    errors.push(`Invalid permission category: ${category}`);
                    continue;
                }

                if (typeof categoryPermissions !== 'object') {
                    errors.push(`Permissions for ${category} must be an object`);
                    continue;
                }

                // Validate individual permissions
                for (const [permission, value] of Object.entries(categoryPermissions)) {
                    if (typeof value !== 'boolean') {
                        errors.push(`Permission ${category}.${permission} must be a boolean value`);
                    }
                }
            }

            // Check for dangerous permission combinations
            const dangerousCombinations = await this.#checkDangerousPermissionCombinations(permissions);
            if (dangerousCombinations.length > 0) {
                errors.push(...dangerousCombinations);
            }

            return {
                valid: errors.length === 0,
                message: errors.join('; ')
            };
        } catch (error) {
            logger.error('Error validating permission changes:', error);
            return { valid: false, message: 'Permission validation failed' };
        }
    }

    /**
     * Parse CSV file
     * @private
     */
    async #parseCSVFile(file) {
        const Papa = require('papaparse');

        return new Promise((resolve, reject) => {
            Papa.parse(file.buffer.toString(), {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`));
                    } else {
                        resolve(results.data);
                    }
                },
                error: (error) => reject(error)
            });
        });
    }

    /**
     * Parse Excel file
     * @private
     */
    async #parseExcelFile(file) {
        const XLSX = require('xlsx');

        try {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (data.length < 2) {
                throw new Error('Excel file must contain header row and at least one data row');
            }

            const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s+/g, '_'));
            const rows = data.slice(1);

            return rows.map(row => {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index] || null;
                });
                return obj;
            });
        } catch (error) {
            throw new Error(`Excel parsing error: ${error.message}`);
        }
    }

    /**
     * Parse JSON file
     * @private
     */
    async #parseJSONFile(file) {
        try {
            const data = JSON.parse(file.buffer.toString());

            if (!Array.isArray(data)) {
                throw new Error('JSON file must contain an array of user objects');
            }

            return data;
        } catch (error) {
            throw new Error(`JSON parsing error: ${error.message}`);
        }
    }

    /**
     * Apply field mapping to imported data
     * @private
     */
    #applyFieldMapping(data, fieldMapping) {
        return data.map(row => {
            const mappedRow = {};

            for (const [targetField, sourceField] of Object.entries(fieldMapping)) {
                if (row[sourceField] !== undefined) {
                    mappedRow[targetField] = row[sourceField];
                }
            }

            // Keep unmapped fields
            for (const [key, value] of Object.entries(row)) {
                if (!Object.values(fieldMapping).includes(key)) {
                    mappedRow[key] = value;
                }
            }

            return mappedRow;
        });
    }

    /**
     * Validate imported data
     * @private
     */
    async #validateImportedData(data) {
        const validUsers = [];
        const errors = [];

        for (let i = 0; i < data.length; i++) {
            const user = data[i];
            const rowErrors = [];

            // Required field validation
            if (!user.email || !CommonValidator.isValidEmail(user.email)) {
                rowErrors.push('Invalid or missing email');
            }

            if (!user.first_name && !user.firstName) {
                rowErrors.push('Missing first name');
            }

            if (!user.last_name && !user.lastName) {
                rowErrors.push('Missing last name');
            }

            if (!user.department) {
                rowErrors.push('Missing department');
            }

            if (rowErrors.length > 0) {
                errors.push({
                    row: i + 1,
                    email: user.email,
                    errors: rowErrors
                });
            } else {
                // Normalize field names
                const normalizedUser = {
                    email: user.email,
                    firstName: user.first_name || user.firstName,
                    lastName: user.last_name || user.lastName,
                    department: user.department,
                    title: user.title || 'Admin User',
                    username: user.username || user.email.split('@')[0]
                };

                validUsers.push(normalizedUser);
            }
        }

        return { validUsers, errors };
    }

    /**
     * Generate employee ID
     * @private
     */
    #generateEmployeeId() {
        const prefix = 'ADM';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 3).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    }

    /**
     * Check if update data has profile fields
     * @private
     */
    #hasProfileFields(updateData) {
        const profileFields = ['displayName', 'title', 'firstName', 'lastName', 'officeLocation', 'timezone', 'phoneNumber', 'biography'];
        return profileFields.some(field => updateData[field] !== undefined);
    }

    /**
     * Check if update data has access control fields
     * @private
     */
    #hasAccessControlFields(updateData) {
        const accessFields = ['ipWhitelist', 'accessHours', 'geofencing', 'mfaRequirements', 'sessionRestrictions'];
        return accessFields.some(field => updateData[field] !== undefined);
    }

    /**
     * Check if update data has status fields
     * @private
     */
    #hasStatusFields(updateData) {
        const statusFields = ['accountStatus', 'suspensionDetails', 'terminationDetails'];
        return statusFields.some(field => updateData[field] !== undefined);
    }

    /**
     * Check owned resources
     * @private
     */
    async #checkOwnedResources(adminUserId) {
        const ownedResources = [];

        try {
            // Check for owned organizations
            const ownedOrgs = await this.#queryOwnedOrganizations(adminUserId);
            if (ownedOrgs.length > 0) {
                ownedResources.push(...ownedOrgs.map(org => ({
                    type: 'ORGANIZATION',
                    id: org._id,
                    name: org.name
                })));
            }

            // Check for owned projects or processes
            const ownedProjects = await this.#queryOwnedProjects(adminUserId);
            if (ownedProjects.length > 0) {
                ownedResources.push(...ownedProjects.map(project => ({
                    type: 'PROJECT',
                    id: project._id,
                    name: project.name
                })));
            }

            return ownedResources;
        } catch (error) {
            logger.error('Error checking owned resources:', error);
            return [];
        }
    }

    /**
     * Check critical permissions
     * @private
     */
    async #checkCriticalPermissions(adminUserId) {
        try {
            const criticalPermissions = [];
            const userPermissions = await userPermissionsService.getUserPermissions(adminUserId);

            // Define critical system permissions that should have multiple holders
            const criticalSystemPerms = [
                'systemAdministration.globalAccess',
                'userManagement.delete',
                'securityAdministration.managePolicies'
            ];

            for (const permission of criticalSystemPerms) {
                if (userPermissions.effective.some(p => p.permissionCode === permission)) {
                    // Check if other users also have this permission
                    const otherHolders = await this.#countPermissionHolders(permission, adminUserId);
                    if (otherHolders === 0) {
                        criticalPermissions.push(permission);
                    }
                }
            }

            return criticalPermissions;
        } catch (error) {
            logger.error('Error checking critical permissions:', error);
            return [];
        }
    }

    /**
     * Check ongoing processes
     * @private
     */
    async #checkOngoingProcesses(adminUserId) {
        // This would check for ongoing workflows, approvals, etc.
        return [];
    }

    /**
     * Query owned organizations
     * @private
     */
    async #queryOwnedOrganizations(adminUserId) {
        // Implementation would query organization service
        return [];
    }

    /**
     * Query owned projects
     * @private
     */
    async #queryOwnedProjects(adminUserId) {
        // Implementation would query project management service
        return [];
    }

    /**
     * Count permission holders
     * @private
     */
    async #countPermissionHolders(permission, excludeUserId) {
        // Implementation would count how many other users have this permission
        return 1; // Placeholder
    }

    /**
     * Check dangerous permission combinations
     * @private
     */
    async #checkDangerousPermissionCombinations(permissions) {
        const warnings = [];

        // Check for risky combinations
        if (permissions.userManagement?.delete && permissions.systemAdministration?.globalAccess) {
            warnings.push('Dangerous combination: Global access with user deletion rights');
        }

        if (permissions.financialManagement?.processPayments && permissions.userManagement?.manageRoles) {
            warnings.push('High risk combination: Financial processing with role management');
        }

        return warnings;
    }

    /**
     * Send notification helper
     * @private
     */
    async #sendNotification(notificationData) {
        try {
            // Implementation would use notification service
            logger.debug('Sending notification:', notificationData);
        } catch (error) {
            logger.error('Error sending notification:', error);
        }
    }

    /**
     * Send email helper
     * @private
     */
    async #sendEmail(emailData) {
        try {
            // Implementation would use email service
            logger.debug('Sending email:', { to: emailData.to, subject: emailData.subject });
        } catch (error) {
            logger.error('Error sending email:', error);
        }
    }

    /**
     * Additional endpoint-specific methods that are referenced in the controller
     */
    async importAdminUsers(req, res, next) {
        // This method is bound in constructor but not implemented
        return this.#importAdminUsersFromFile(req.body, req.file, req.user?.adminId || req.user?.id);
    }

    async exportAdminUsers(req, res, next) {
        try {
            const filters = this.#parseListFilters(req.query);
            const options = {
                format: req.query.format || 'csv',
                fields: req.query.fields ? req.query.fields.split(',') : null
            };

            const result = await adminUserService.exportAdminUsers(filters, options, req.user?.adminId || req.user?.id);

            res.setHeader('Content-Disposition', `attachment; filename="admin-users.${options.format}"`);
            res.setHeader('Content-Type', this.#getContentType(options.format));
            res.send(result.data);
        } catch (error) {
            logger.error('Error in exportAdminUsers controller:', error);
            next(error);
        }
    }

    async getAdminUserActivity(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                days: parseInt(req.query.days) || 30,
                includeDetails: req.query.includeDetails === 'true'
            };

            const activity = await adminUserService.getAdminUserActivity(id, options);

            const response = this.#responseFormatter.formatSuccess(
                activity,
                'Admin user activity retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in getAdminUserActivity controller:', error);
            next(error);
        }
    }

    async resetAdminPassword(req, res, next) {
        try {
            const { id } = req.params;
            const { temporaryPassword, requireChange } = req.body;
            const resetBy = req.user?.adminId || req.user?.id;

            const result = await adminUserService.resetPassword(id, {
                temporaryPassword,
                requireChange: requireChange !== false
            }, resetBy);

            const response = this.#responseFormatter.formatSuccess(
                result,
                'Password reset successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in resetAdminPassword controller:', error);
            next(error);
        }
    }

    async enableTwoFactor(req, res, next) {
        try {
            const { id } = req.params;
            const enabledBy = req.user?.adminId || req.user?.id;

            const result = await adminUserService.enableTwoFactor(id, enabledBy);

            const response = this.#responseFormatter.formatSuccess(
                result,
                'Two-factor authentication enabled successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in enableTwoFactor controller:', error);
            next(error);
        }
    }

    async disableTwoFactor(req, res, next) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const disabledBy = req.user?.adminId || req.user?.id;

            const result = await adminUserService.disableTwoFactor(id, reason, disabledBy);

            const response = this.#responseFormatter.formatSuccess(
                result,
                'Two-factor authentication disabled successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in disableTwoFactor controller:', error);
            next(error);
        }
    }

    async getAdminUserSessions(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                activeOnly: req.query.activeOnly === 'true',
                limit: parseInt(req.query.limit) || 20
            };

            const sessions = await userSessionsService.getUserSessions(id, options);

            const response = this.#responseFormatter.formatSuccess(
                sessions,
                'Admin user sessions retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in getAdminUserSessions controller:', error);
            next(error);
        }
    }

    async terminateAdminUserSessions(req, res, next) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const terminatedBy = req.user?.adminId || req.user?.id;

            const result = await userSessionsService.terminateUserSessions(id, reason || 'ADMIN_TERMINATED', {
                terminatedBy
            });

            const response = this.#responseFormatter.formatSuccess(
                result,
                'Admin user sessions terminated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in terminateAdminUserSessions controller:', error);
            next(error);
        }
    }

    async getAdminUserPermissions(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                includeInherited: req.query.includeInherited === 'true',
                includeRolePermissions: req.query.includeRolePermissions === 'true'
            };

            const permissions = await userPermissionsService.getUserPermissions(id, options);

            const response = this.#responseFormatter.formatSuccess(
                permissions,
                'Admin user permissions retrieved successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in getAdminUserPermissions controller:', error);
            next(error);
        }
    }

    async auditAdminUser(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                includePermissions: req.query.includePermissions === 'true',
                includeSessions: req.query.includeSessions === 'true',
                days: parseInt(req.query.days) || 90
            };

            const auditResult = await userPermissionsService.auditUserPermissions(id, options);

            const response = this.#responseFormatter.formatSuccess(
                auditResult,
                'Admin user audit completed successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        } catch (error) {
            logger.error('Error in auditAdminUser controller:', error);
            next(error);
        }
    }

    async generateAdminReport(req, res, next) {
        try {
            const options = {
                reportType: req.query.type || 'COMPREHENSIVE',
                dateRange: {
                    start: req.query.startDate,
                    end: req.query.endDate
                },
                filters: this.#parseListFilters(req.query),
                format: req.query.format || 'JSON'
            };

            const report = await adminUserService.generateReport(options, req.user?.adminId || req.user?.id);

            if (options.format === 'JSON') {
                const response = this.#responseFormatter.formatSuccess(
                    report,
                    'Admin report generated successfully'
                );
                res.status(STATUS_CODES.OK).json(response);
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="admin-report.${options.format.toLowerCase()}"`);
                res.setHeader('Content-Type', this.#getContentType(options.format));
                res.send(report.data);
            }
        } catch (error) {
            logger.error('Error in generateAdminReport controller:', error);
            next(error);
        }
    }

    /**
     * Get content type for file downloads
     * @private
     */
    #getContentType(format) {
        const contentTypes = {
            'csv': 'text/csv',
            'json': 'application/json',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'pdf': 'application/pdf'
        };
        return contentTypes[format.toLowerCase()] || 'application/octet-stream';
    }

    // Additional methods referenced in constructor bindings that need basic implementations
    async updateAccessControl(req, res, next) {
        return this.#updateAdminAccessControl(req.params.id, req.body, req.user?.adminId || req.user?.id);
    }

    async addCertification(req, res, next) {
        // Implementation for adding certifications
        const { id } = req.params;
        const certificationData = req.body;
        const addedBy = req.user?.adminId || req.user?.id;

        const result = await adminUserService.addCertification(id, certificationData, addedBy);
        const response = this.#responseFormatter.formatSuccess(result, 'Certification added successfully');
        res.status(STATUS_CODES.OK).json(response);
    }

    async addComplianceTraining(req, res, next) {
        // Implementation for adding compliance training
        const { id } = req.params;
        const trainingData = req.body;
        const addedBy = req.user?.adminId || req.user?.id;

        const result = await adminUserService.addComplianceTraining(id, trainingData, addedBy);
        const response = this.#responseFormatter.formatSuccess(result, 'Compliance training added successfully');
        res.status(STATUS_CODES.OK).json(response);
    }

    async addAdministrativeNote(req, res, next) {
        // Implementation for adding administrative notes
        const { id } = req.params;
        const noteData = req.body;
        const addedBy = req.user?.adminId || req.user?.id;

        const result = await adminUserService.addAdministrativeNote(id, noteData, addedBy);
        const response = this.#responseFormatter.formatSuccess(result, 'Administrative note added successfully');
        res.status(STATUS_CODES.OK).json(response);
    }

    async updateOnboardingStatus(req, res, next) {
        // Implementation for updating onboarding status
        const { id } = req.params;
        const statusData = req.body;
        const updatedBy = req.user?.adminId || req.user?.id;

        const result = await adminUserService.updateOnboardingStatus(id, statusData, updatedBy);
        const response = this.#responseFormatter.formatSuccess(result, 'Onboarding status updated successfully');
        res.status(STATUS_CODES.OK).json(response);
    }

    async getTeamMembers(req, res, next) {
        // Implementation for getting team members
        const { id } = req.params;
        const options = this.#parseListOptions(req.query);

        const teamMembers = await adminUserService.getTeamMembers(id, options);
        const response = this.#responseFormatter.formatSuccess(teamMembers, 'Team members retrieved successfully');
        res.status(STATUS_CODES.OK).json(response);
    }

    async updateWorkSchedule(req, res, next) {
        // Implementation for updating work schedule
        const { id } = req.params;
        const scheduleData = req.body;
        const updatedBy = req.user?.adminId || req.user?.id;

        const result = await adminUserService.updateWorkSchedule(id, scheduleData, updatedBy);
        const response = this.#responseFormatter.formatSuccess(result, 'Work schedule updated successfully');
        res.status(STATUS_CODES.OK).json(response);
    }
}

// Export singleton instance
module.exports = new AdminUserController();