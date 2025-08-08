'use strict';

/**
 * @fileoverview Administrative user service for comprehensive user management operations
 * @module servers/admin-server/modules/user-management/services/admin-user-service
 * @requires module:servers/admin-server/modules/user-management/models/admin-user-model
 * @requires module:servers/admin-server/modules/user-management/models/user-permission-model
 * @requires module:servers/admin-server/modules/user-management/models/admin-session-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/constants/permissions
 */

const AdminUser = require('../models/admin-user-model');
const UserPermission = require('../models/user-permission-model');
const AdminSession = require('../models/admin-session-model');
const User = require('../../../../../shared/lib/database/models/user-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const HashService = require('../../../../../shared/lib/security/encryption/hash-service');
const EmailService = require('../../../../../shared/lib/services/email-service');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');

/**
 * Administrative user service class for managing admin users
 * @class AdminUserService
 */
class AdminUserService {
    /**
     * Private fields using ES6 private field syntax
     */
    #cachePrefix = 'admin:user:';
    #cacheTTL = 300; // 5 minutes
    #maxLoginAttempts = 5;
    #lockoutDuration = 1800000; // 30 minutes
    #sessionDuration = 3600000; // 1 hour
    #passwordMinLength = 12;
    #passwordHistoryCount = 5;
    #mfaGracePeriod = 604800000; // 7 days
    #emailService;
    #cacheService;
    #notificationService;

    /**
     * Constructor for AdminUserService
     */
    constructor() {
        this.#emailService = new EmailService();
        this.#cacheService = new CacheService();
        this.#notificationService = new NotificationService();

        logger.info('AdminUserService initialized');
    }

    /**
     * Create a new administrative user
     * @param {Object} userData - User data for creation
     * @param {string} createdBy - ID of the admin creating the user
     * @returns {Promise<Object>} Created admin user
     */
    async createAdminUser(userData, createdBy) {
        try {
            logger.info(`Creating new admin user by ${createdBy}`);

            // Validate input data
            await this.#validateUserData(userData);

            // Check for existing user
            const existingUser = await User.findOne({
                $or: [
                    { email: userData.email },
                    { username: userData.username }
                ]
            });

            if (existingUser) {
                throw new AppError('User with this email or username already exists', 409);
            }

            // Create base user first
            const baseUser = await this.#createBaseUser(userData);

            // Create admin user profile
            const adminUserData = {
                userId: baseUser._id,
                adminProfile: {
                    displayName: userData.displayName || `${userData.firstName} ${userData.lastName}`,
                    department: userData.department,
                    title: userData.title,
                    employeeId: userData.employeeId,
                    reportingTo: userData.reportingTo,
                    officeLocation: userData.officeLocation,
                    timezone: userData.timezone || 'UTC',
                    workSchedule: userData.workSchedule
                },
                administrativeRoles: [],
                granularPermissions: this.#initializeDefaultPermissions(userData.department),
                accessControl: this.#initializeAccessControl(userData),
                status: {
                    accountStatus: 'PENDING_APPROVAL'
                },
                auditLog: {
                    createdBy: createdBy
                }
            };

            const adminUser = new AdminUser(adminUserData);
            await adminUser.save();

            // Assign initial role based on department
            const initialRole = await this.#determineInitialRole(userData.department);
            if (initialRole) {
                await this.assignRole(adminUser._id, initialRole, createdBy);
            }

            // Send welcome email
            await this.#sendWelcomeEmail(baseUser, adminUser);

            // Create onboarding tasks
            await this.#createOnboardingTasks(adminUser);

            // Invalidate cache
            await this.#invalidateUserCache(adminUser._id);

            // Log audit event
            await this.#logAuditEvent('ADMIN_USER_CREATED', {
                adminUserId: adminUser._id,
                createdBy,
                userData: this.#sanitizeUserData(userData)
            });

            logger.info(`Admin user created successfully: ${adminUser.administrativeId}`);

            return {
                adminUser: adminUser.toSafeJSON(),
                baseUser: this.#sanitizeUserData(baseUser)
            };

        } catch (error) {
            logger.error('Error creating admin user:', error);
            throw error;
        }
    }

    /**
     * Retrieve admin user by various identifiers
     * @param {string} identifier - User identifier (ID, email, username, administrativeId)
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Admin user data
     */
    async getAdminUser(identifier, options = {}) {
        try {
            logger.debug(`Fetching admin user: ${identifier}`);

            // Check cache first
            const cacheKey = `${this.#cachePrefix}${identifier}`;
            const cachedUser = await this.#cacheService.get(cacheKey);

            if (cachedUser && !options.skipCache) {
                logger.debug('Returning cached admin user');
                return cachedUser;
            }

            // Determine query based on identifier type
            let query;

            switch (true) {
                case mongoose.Types.ObjectId.isValid(identifier):
                    query = { _id: identifier };
                    break;
                case identifier.startsWith('ADM-'):
                    query = { administrativeId: identifier };
                    break;
                case CommonValidator.isValidEmail(identifier):
                    const user = await User.findOne({ email: identifier });
                    if (user) {
                        query = { userId: user._id };
                    }
                    break;
                default:
                    const userByUsername = await User.findOne({ username: identifier });
                    if (userByUsername) {
                        query = { userId: userByUsername._id };
                    }
                    break;
            }

            if (!query) {
                throw new AppError('Admin user not found', 404);
            }

            // Fetch admin user with population
            let adminUser = await AdminUser.findOne(query)
                .populate('userId', '-password')
                .populate('adminProfile.reportingTo', 'adminProfile.displayName')
                .populate('adminProfile.teamMembers', 'adminProfile.displayName');

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Apply data transformations based on options
            if (options.includePermissions) {
                adminUser = await this.#enrichWithPermissions(adminUser);
            }

            if (options.includeActivity) {
                adminUser = await this.#enrichWithActivity(adminUser);
            }

            if (options.includeMetrics) {
                adminUser = await this.#enrichWithMetrics(adminUser);
            }

            const result = adminUser.toSafeJSON();

            // Cache the result
            await this.#cacheService.set(cacheKey, result, this.#cacheTTL);

            return result;

        } catch (error) {
            logger.error('Error fetching admin user:', error);
            throw error;
        }
    }

    /**
     * Update admin user information
     * @param {string} adminUserId - Admin user ID
     * @param {Object} updateData - Data to update
     * @param {string} updatedBy - ID of admin performing update
     * @returns {Promise<Object>} Updated admin user
     */
    async updateAdminUser(adminUserId, updateData, updatedBy) {
        try {
            logger.info(`Updating admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Check permissions for update
            await this.#checkUpdatePermissions(adminUser, updateData, updatedBy);

            // Process updates based on update type
            const updateType = this.#determineUpdateType(updateData);

            switch (updateType) {
                case 'PROFILE':
                    await this.#updateProfile(adminUser, updateData);
                    break;

                case 'DEPARTMENT':
                    await this.#updateDepartment(adminUser, updateData, updatedBy);
                    break;

                case 'ACCESS_CONTROL':
                    await this.#updateAccessControl(adminUser, updateData, updatedBy);
                    break;

                case 'PERMISSIONS':
                    await this.updatePermissions(adminUser._id, updateData, updatedBy);
                    break;

                case 'STATUS':
                    await this.#updateStatus(adminUser, updateData, updatedBy);
                    break;

                case 'METADATA':
                    await this.#updateMetadata(adminUser, updateData);
                    break;

                case 'MULTIPLE':
                    await this.#handleMultipleUpdates(adminUser, updateData, updatedBy);
                    break;

                default:
                    throw new AppError('Invalid update type', 400);
            }

            // Add audit log entry
            adminUser.auditLog.modifications.push({
                modifiedBy: updatedBy,
                modifiedAt: new Date(),
                changes: new Map(Object.entries(updateData)),
                reason: updateData.updateReason || 'Administrative update'
            });

            adminUser.auditLog.lastModifiedBy = updatedBy;
            adminUser.auditLog.lastModifiedAt = new Date();

            await adminUser.save();

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Send notification if significant changes
            if (this.#isSignificantChange(updateType)) {
                await this.#sendUpdateNotification(adminUser, updateData, updatedBy);
            }

            // Log audit event
            await this.#logAuditEvent('ADMIN_USER_UPDATED', {
                adminUserId,
                updatedBy,
                updateType,
                changes: updateData
            });

            logger.info(`Admin user ${adminUserId} updated successfully`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error updating admin user:', error);
            throw error;
        }
    }

    /**
     * Checks if the updating admin user has permission to update the target admin user.
     * @param {Object} adminUser - The admin user document to be updated
     * @param {Object} updateData - The update data
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #checkUpdatePermissions(adminUser, updateData, updatedBy) {
        // Example implementation: Only allow SYSTEM_ADMIN, EXECUTIVE, or self-update for profile
        const updatingAdmin = await AdminUser.findOne({ userId: updatedBy });
        if (!updatingAdmin) {
            throw new AppError('Updating admin user not found', 404);
        }
        const allowedRoles = ['SYSTEM_ADMIN', 'EXECUTIVE'];
        const isSelfUpdate = String(adminUser.userId) === String(updatedBy);
        const hasRole = (updatingAdmin.administrativeRoles || []).some(role =>
            allowedRoles.includes(role.roleName)
        );
        if (!hasRole && !isSelfUpdate) {
            throw new AppError('Insufficient permissions to update admin user', 403);
        }
        // Optionally, add more granular permission checks here
        return true;
    }

    /**
     * Determines the update type based on the updateData object.
     * @param {Object} updateData
     * @returns {string} Update type
     */
    #determineUpdateType(updateData) {
        if (!updateData || typeof updateData !== 'object') return 'UNKNOWN';
        const keys = Object.keys(updateData);
        if (keys.length === 1) {
            if (keys.includes('profile')) return 'PROFILE';
            if (keys.includes('department')) return 'DEPARTMENT';
            if (keys.includes('accessControl')) return 'ACCESS_CONTROL';
            if (keys.includes('permissions')) return 'PERMISSIONS';
            if (keys.includes('status')) return 'STATUS';
            if (keys.includes('metadata')) return 'METADATA';
        }
        // If multiple recognized keys are present, treat as MULTIPLE
        const recognized = ['profile', 'department', 'accessControl', 'permissions', 'status', 'metadata'];
        const found = keys.filter(k => recognized.includes(k));
        if (found.length > 1) return 'MULTIPLE';
        // Fallback: try to infer from direct field updates
        if (keys.includes('displayName') || keys.includes('title') || keys.includes('employeeId')) return 'PROFILE';
        if (keys.includes('department')) return 'DEPARTMENT';
        if (keys.includes('accountStatus')) return 'STATUS';
        return 'UNKNOWN';
    }

    /**
     * Delete or deactivate admin user
     * @param {string} adminUserId - Admin user ID
     * @param {Object} options - Deletion options
     * @param {string} deletedBy - ID of admin performing deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteAdminUser(adminUserId, options = {}, deletedBy) {
        try {
            logger.info(`Deleting admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Check if user can be deleted
            await this.#checkDeletionEligibility(adminUser);

            if (options.hardDelete) {
                // Perform hard delete
                await this.#performHardDelete(adminUser, deletedBy);

                return {
                    success: true,
                    message: 'Admin user permanently deleted',
                    deletedAt: new Date()
                };
            } else {
                // Perform soft delete (deactivation)
                await adminUser.terminateAccount({
                    terminatedBy: deletedBy,
                    reason: options.reason || 'Administrative termination'
                });

                // Terminate all active sessions
                await AdminSession.terminateUserSessions(
                    adminUser.userId,
                    'Account terminated'
                );

                // Revoke all permissions
                await this.#revokeAllPermissions(adminUser, deletedBy);

                // Invalidate cache
                await this.#invalidateUserCache(adminUserId);

                // Log audit event
                await this.#logAuditEvent('ADMIN_USER_TERMINATED', {
                    adminUserId,
                    deletedBy,
                    reason: options.reason
                });

                return {
                    success: true,
                    message: 'Admin user account terminated',
                    terminatedAt: new Date()
                };
            }

        } catch (error) {
            logger.error('Error deleting admin user:', error);
            throw error;
        }
    }

    /**
     * List admin users with filtering and pagination
     * @param {Object} filters - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated admin users
     */
    async listAdminUsers(filters = {}, options = {}) {
        try {
            logger.debug('Listing admin users with filters:', filters);

            // Build query
            const query = this.#buildListQuery(filters);

            // Apply pagination
            const page = parseInt(options.page) || 1;
            const limit = parseInt(options.limit) || 20;
            const skip = (page - 1) * limit;

            // Build sort
            const sort = this.#buildSortQuery(options.sortBy, options.sortOrder);

            // Execute query with count
            const [adminUsers, totalCount] = await Promise.all([
                AdminUser.find(query)
                    .populate('userId', 'email username firstName lastName')
                    .populate('adminProfile.reportingTo', 'adminProfile.displayName')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                AdminUser.countDocuments(query)
            ]);

            // Transform results
            const transformedUsers = await Promise.all(
                adminUsers.map(async (user) => {
                    if (options.includeStats) {
                        user.stats = await this.#getUserStatistics(user._id);
                    }

                    if (options.includeLastActivity) {
                        user.lastActivity = await this.#getLastActivity(user._id);
                    }

                    return this.#sanitizeAdminUser(user);
                })
            );

            return {
                users: transformedUsers,
                pagination: {
                    page,
                    limit,
                    totalPages: Math.ceil(totalCount / limit),
                    totalCount,
                    hasNext: page * limit < totalCount,
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            logger.error('Error listing admin users:', error);
            throw error;
        }
    }

    /**
     * Search admin users
     * @param {string} searchQuery - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Search results
     */
    async searchAdminUsers(searchQuery, options = {}) {
        try {
            logger.debug(`Searching admin users: ${searchQuery}`);

            // Build search query
            const searchRegex = new RegExp(searchQuery, 'i');

            const baseUsers = await User.find({
                $or: [
                    { email: searchRegex },
                    { username: searchRegex },
                    { firstName: searchRegex },
                    { lastName: searchRegex }
                ]
            }).select('_id');

            const userIds = baseUsers.map(u => u._id);

            const query = {
                $or: [
                    { userId: { $in: userIds } },
                    { administrativeId: searchRegex },
                    { 'adminProfile.displayName': searchRegex },
                    { 'adminProfile.employeeId': searchRegex },
                    { 'adminProfile.title': searchRegex }
                ]
            };

            // Add additional filters
            if (options.department) {
                query['adminProfile.department'] = options.department;
            }

            if (options.status) {
                query['status.accountStatus'] = options.status;
            }

            if (options.role) {
                query['administrativeRoles.roleName'] = options.role;
            }

            // Execute search
            const results = await AdminUser.find(query)
                .populate('userId', 'email username firstName lastName')
                .limit(options.limit || 10)
                .lean();

            return results.map(this.#sanitizeAdminUser);

        } catch (error) {
            logger.error('Error searching admin users:', error);
            throw error;
        }
    }

    /**
     * Assign role to admin user
     * @param {string} adminUserId - Admin user ID
     * @param {Object} roleData - Role assignment data
     * @param {string} assignedBy - ID of admin assigning role
     * @returns {Promise<Object>} Updated admin user
     */
    async assignRole(adminUserId, roleData, assignedBy) {
        try {
            logger.info(`Assigning role to admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Validate role
            if (!Object.values(ROLES.ADMIN).includes(roleData.roleName)) {
                throw new AppError('Invalid role name', 400);
            }

            // Check for role conflicts
            const conflicts = adminUser.getConflictingRoles(roleData.roleName);
            const hasConflict = adminUser.administrativeRoles.some(
                r => conflicts.includes(r.roleName) && (!r.expiresAt || r.expiresAt > new Date())
            );

            if (hasConflict) {
                throw new AppError('Role conflicts with existing roles', 409);
            }

            // Assign role
            await adminUser.assignRole(roleData, assignedBy);

            // Grant associated permissions
            const permissions = adminUser.getRolePermissions(roleData.roleName);
            await this.#grantRolePermissions(adminUser, permissions, assignedBy);

            // Send notification
            await this.#sendRoleAssignmentNotification(adminUser, roleData, assignedBy);

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Log audit event
            await this.#logAuditEvent('ROLE_ASSIGNED', {
                adminUserId,
                roleData,
                assignedBy
            });

            logger.info(`Role ${roleData.roleName} assigned to admin user ${adminUserId}`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error assigning role:', error);
            throw error;
        }
    }

    /**
     * Revoke role from admin user
     * @param {string} adminUserId - Admin user ID
     * @param {string} roleName - Role to revoke
     * @param {string} revokedBy - ID of admin revoking role
     * @param {string} reason - Reason for revocation
     * @returns {Promise<Object>} Updated admin user
     */
    async revokeRole(adminUserId, roleName, revokedBy, reason) {
        try {
            logger.info(`Revoking role from admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Check if user has the role
            const hasRole = adminUser.administrativeRoles.some(
                r => r.roleName === roleName && (!r.expiresAt || r.expiresAt > new Date())
            );

            if (!hasRole) {
                throw new AppError('User does not have this role', 404);
            }

            // Revoke role
            await adminUser.revokeRole(roleName, revokedBy, reason);

            // Revoke associated permissions
            const permissions = adminUser.getRolePermissions(roleName);
            await this.#revokeRolePermissions(adminUser, permissions, revokedBy);

            // Send notification
            await this.#sendRoleRevocationNotification(adminUser, roleName, revokedBy, reason);

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Log audit event
            await this.#logAuditEvent('ROLE_REVOKED', {
                adminUserId,
                roleName,
                revokedBy,
                reason
            });

            logger.info(`Role ${roleName} revoked from admin user ${adminUserId}`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error revoking role:', error);
            throw error;
        }
    }

    /**
     * Update admin user permissions
     * @param {string} adminUserId - Admin user ID
     * @param {Object} permissions - Permissions to update
     * @param {string} updatedBy - ID of admin updating permissions
     * @returns {Promise<Object>} Updated admin user
     */
    async updatePermissions(adminUserId, permissions, updatedBy) {
        try {
            logger.info(`Updating permissions for admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Update granular permissions
            await adminUser.updateGranularPermissions(permissions, updatedBy);

            // Check for permission dependencies
            await this.#validatePermissionDependencies(permissions);

            // Update permission assignments in UserPermission model
            await this.#updatePermissionAssignments(adminUser, permissions, updatedBy);

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Log audit event
            await this.#logAuditEvent('PERMISSIONS_UPDATED', {
                adminUserId,
                permissions,
                updatedBy
            });

            logger.info(`Permissions updated for admin user ${adminUserId}`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error updating permissions:', error);
            throw error;
        }
    }

    async #validatePermissionDependencies(permissions) {
        // Example implementation: Check for required dependencies between permissions
        // You can expand this logic based on your application's permission structure
        if (permissions.organizationManagement?.update && !permissions.organizationManagement?.read) {
            throw new AppError('Cannot grant update permission without read permission for organization management', 400);
        }
        if (permissions.userManagement?.delete && !permissions.userManagement?.update) {
            throw new AppError('Cannot grant delete permission without update permission for user management', 400);
        }
        // Add more dependency checks as needed
        return true;
    }

    async #updatePermissionAssignments(adminUser, permissions, updatedBy) {
        // Update or create UserPermission document for the admin user
        try {
            let userPermission = await UserPermission.findOne({ userId: adminUser.userId });
            if (!userPermission) {
                userPermission = new UserPermission({
                    userId: adminUser.userId,
                    permissions: permissions,
                    assignedBy: updatedBy,
                    assignedAt: new Date()
                });
            } else {
                userPermission.permissions = permissions;
                userPermission.assignedBy = updatedBy;
                userPermission.assignedAt = new Date();
            }
            await userPermission.save();
        } catch (error) {
            logger.error('Error updating permission assignments:', error);
            throw new AppError('Failed to update permission assignments', 500);
        }
    }

    /**
     * Suspend admin user account
     * @param {string} adminUserId - Admin user ID
     * @param {Object} suspensionData - Suspension details
     * @param {string} suspendedBy - ID of admin performing suspension
     * @returns {Promise<Object>} Suspended admin user
     */
    async suspendAdminUser(adminUserId, suspensionData, suspendedBy) {
        try {
            logger.info(`Suspending admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Check if already suspended
            if (adminUser.status.accountStatus === 'SUSPENDED') {
                throw new AppError('User is already suspended', 400);
            }

            // Suspend account
            await adminUser.suspendAccount({
                suspendedBy,
                reason: suspensionData.reason,
                duration: suspensionData.duration,
                reviewRequired: suspensionData.reviewRequired
            });

            // Terminate active sessions
            await AdminSession.terminateUserSessions(
                adminUser.userId,
                'Account suspended'
            );

            // Send notification
            await this.#sendSuspensionNotification(adminUser, suspensionData, suspendedBy);

            // Schedule auto-reactivation if duration specified
            if (suspensionData.duration) {
                await this.#scheduleReactivation(adminUser._id, suspensionData.duration);
            }

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Log audit event
            await this.#logAuditEvent('ADMIN_USER_SUSPENDED', {
                adminUserId,
                suspensionData,
                suspendedBy
            });

            logger.info(`Admin user ${adminUserId} suspended`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error suspending admin user:', error);
            throw error;
        }
    }

    /**
     * Reactivate suspended admin user
     * @param {string} adminUserId - Admin user ID
     * @param {string} reactivatedBy - ID of admin performing reactivation
     * @returns {Promise<Object>} Reactivated admin user
     */
    async reactivateAdminUser(adminUserId, reactivatedBy) {
        try {
            logger.info(`Reactivating admin user ${adminUserId}`);

            const adminUser = await AdminUser.findById(adminUserId);

            if (!adminUser) {
                throw new AppError('Admin user not found', 404);
            }

            // Reactivate account
            await adminUser.reactivateAccount({ reactivatedBy });

            // Send notification
            await this.#sendReactivationNotification(adminUser, reactivatedBy);

            // Invalidate cache
            await this.#invalidateUserCache(adminUserId);

            // Log audit event
            await this.#logAuditEvent('ADMIN_USER_REACTIVATED', {
                adminUserId,
                reactivatedBy
            });

            logger.info(`Admin user ${adminUserId} reactivated`);

            return adminUser.toSafeJSON();

        } catch (error) {
            logger.error('Error reactivating admin user:', error);
            throw error;
        }
    }

    async #sendSuspensionNotification(adminUser, suspensionData, suspendedBy) {
        try {
            await this.#notificationService.send({
                to: adminUser.userId?.email || '',
                type: 'ADMIN_USER_SUSPENDED',
                subject: 'Your admin account has been suspended',
                message: `Hello ${adminUser.adminProfile?.displayName || ''}, your account has been suspended by admin (${suspendedBy}). Reason: ${suspensionData.reason || 'No reason provided'}.`,
                metadata: {
                    adminUserId: adminUser._id,
                    suspendedBy,
                    reason: suspensionData.reason,
                    duration: suspensionData.duration,
                    reviewRequired: suspensionData.reviewRequired
                }
            });
        } catch (error) {
            logger.error('Error sending suspension notification:', error);
        }
    }

    async #sendRoleRevocationNotification(adminUser, roleName, revokedBy, reason) {
        try {
            await this.#notificationService.send({
                to: adminUser.userId?.email || '',
                type: 'ROLE_REVOKED',
                subject: `Your admin role "${roleName}" has been revoked`,
                message: `Hello ${adminUser.adminProfile?.displayName || ''}, your role "${roleName}" has been revoked by admin (${revokedBy}). Reason: ${reason || 'No reason provided'}.`,
                metadata: {
                    adminUserId: adminUser._id,
                    roleName,
                    revokedBy,
                    reason
                }
            });
        } catch (error) {
            logger.error('Error sending role revocation notification:', error);
        }
    }

    async #sendRoleAssignmentNotification(adminUser, roleData, assignedBy) {
        try {
            await this.#notificationService.send({
                to: adminUser.userId?.email || '',
                type: 'ROLE_ASSIGNED',
                subject: `You have been assigned the "${roleData.roleName}" role`,
                message: `Hello ${adminUser.adminProfile?.displayName || ''}, you have been assigned the "${roleData.roleName}" role by admin (${assignedBy}).`,
                metadata: {
                    adminUserId: adminUser._id,
                    roleData,
                    assignedBy
                }
            });
        } catch (error) {
            logger.error('Error sending role assignment notification:', error);
        }
    }

    async #grantRolePermissions(adminUser, permissions, assignedBy) {
        // Add the specified permissions to the user's granularPermissions
        try {
            if (!adminUser.granularPermissions) {
                adminUser.granularPermissions = {};
            }
            for (const [permCategory, permObj] of Object.entries(permissions)) {
                if (!adminUser.granularPermissions[permCategory]) {
                    adminUser.granularPermissions[permCategory] = {};
                }
                for (const permKey of Object.keys(permObj)) {
                    adminUser.granularPermissions[permCategory][permKey] = true;
                }
            }
            // Also update UserPermission model if present
            let userPermission = await UserPermission.findOne({ userId: adminUser.userId });
            if (userPermission) {
                for (const [permCategory, permObj] of Object.entries(permissions)) {
                    if (!userPermission.permissions[permCategory]) {
                        userPermission.permissions[permCategory] = {};
                    }
                    for (const permKey of Object.keys(permObj)) {
                        userPermission.permissions[permCategory][permKey] = true;
                    }
                }
                userPermission.assignedBy = assignedBy;
                userPermission.assignedAt = new Date();
                await userPermission.save();
            }
            await adminUser.save();
        } catch (error) {
            logger.error('Error granting role permissions:', error);
            throw new AppError('Failed to grant role permissions', 500);
        }
    }

    async #revokeRolePermissions(adminUser, permissions, revokedBy) {
        // Remove the specified permissions from the user's granularPermissions
        try {
            if (!adminUser.granularPermissions) {
                adminUser.granularPermissions = {};
            }
            for (const [permCategory, permObj] of Object.entries(permissions)) {
                if (adminUser.granularPermissions[permCategory]) {
                    for (const permKey of Object.keys(permObj)) {
                        adminUser.granularPermissions[permCategory][permKey] = false;
                    }
                }
            }
            // Also update UserPermission model if present
            let userPermission = await UserPermission.findOne({ userId: adminUser.userId });
            if (userPermission) {
                for (const [permCategory, permObj] of Object.entries(permissions)) {
                    if (userPermission.permissions[permCategory]) {
                        for (const permKey of Object.keys(permObj)) {
                            userPermission.permissions[permCategory][permKey] = false;
                        }
                    }
                }
                userPermission.assignedBy = revokedBy;
                userPermission.assignedAt = new Date();
                await userPermission.save();
            }
            await adminUser.save();
        } catch (error) {
            logger.error('Error revoking role permissions:', error);
            throw new AppError('Failed to revoke role permissions', 500);
        }
    }

    async #scheduleReactivation(adminUserId, duration) {
        // Schedules reactivation of a suspended admin user after the specified duration (in ms)
        try {
            setTimeout(async () => {
                try {
                    const adminUser = await AdminUser.findById(adminUserId);
                    if (adminUser && adminUser.status.accountStatus === 'SUSPENDED') {
                        await this.reactivateAdminUser(adminUserId, 'system_auto_reactivation');
                        logger.info(`Admin user ${adminUserId} automatically reactivated after suspension period.`);
                    }
                } catch (error) {
                    logger.error('Error during scheduled reactivation:', error);
                }
            }, duration);
        } catch (error) {
            logger.error('Error scheduling reactivation:', error);
        }
    }

    async #sendReactivationNotification(adminUser, reactivatedBy) {
        try {
            await this.#notificationService.send({
                to: adminUser.userId?.email || '',
                type: 'ADMIN_USER_REACTIVATED',
                subject: 'Your admin account has been reactivated',
                message: `Hello ${adminUser.adminProfile?.displayName || ''}, your account has been reactivated by admin (${reactivatedBy}). You may now log in.`,
                metadata: {
                    adminUserId: adminUser._id,
                    reactivatedBy
                }
            });
        } catch (error) {
            logger.error('Error sending reactivation notification:', error);
        }
    }

    async #sendUpdateNotification(adminUser, updateData, updatedBy) {
        try {
            await this.#notificationService.send({
                to: adminUser.userId?.email || '',
                type: 'ADMIN_USER_UPDATED',
                subject: 'Your admin account information has been updated',
                message: `Hello ${adminUser.adminProfile?.displayName || ''}, your account information has been updated by admin (${updatedBy}).`,
                metadata: {
                    adminUserId: adminUser._id,
                    updatedBy,
                    changes: updateData
                }
            });
        } catch (error) {
            logger.error('Error sending update notification:', error);
        }
    }

    /**
     * Bulk update admin users
     * @param {Array} userIds - Array of user IDs to update
     * @param {Object} updateData - Data to update
     * @param {string} updatedBy - ID of admin performing update
     * @returns {Promise<Object>} Bulk update result
     */
    async bulkUpdateAdminUsers(userIds, updateData, updatedBy) {
        try {
            logger.info(`Bulk updating ${userIds.length} admin users`);

            const results = {
                successful: [],
                failed: [],
                totalProcessed: 0
            };

            // Validate bulk operation
            await this.#validateBulkOperation(userIds, updateData, updatedBy);

            // Process updates in batches
            const batchSize = 10;
            for (let i = 0; i < userIds.length; i += batchSize) {
                const batch = userIds.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(async (userId) => {
                        try {
                            await this.updateAdminUser(userId, updateData, updatedBy);
                            results.successful.push(userId);
                        } catch (error) {
                            results.failed.push({
                                userId,
                                error: error.message
                            });
                        }
                        results.totalProcessed++;
                    })
                );
            }

            // Log audit event
            await this.#logAuditEvent('BULK_UPDATE', {
                userIds,
                updateData,
                updatedBy,
                results
            });

            logger.info(`Bulk update completed: ${results.successful.length} successful, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk update:', error);
            throw error;
        }
    }

    /**
     * Import admin users from external source
     * @param {Array} userData - Array of user data to import
     * @param {Object} importOptions - Import options
     * @param {string} importedBy - ID of admin performing import
     * @returns {Promise<Object>} Import result
     */
    async importAdminUsers(userData, importOptions = {}, importedBy) {
        try {
            logger.info(`Importing ${userData.length} admin users`);

            const results = {
                imported: [],
                skipped: [],
                failed: [],
                totalProcessed: 0
            };

            // Validate import data
            await this.#validateImportData(userData);

            for (const user of userData) {
                try {
                    results.totalProcessed++;

                    // Check if user exists
                    const existing = await User.findOne({
                        $or: [
                            { email: user.email },
                            { username: user.username }
                        ]
                    });

                    if (existing && !importOptions.updateExisting) {
                        results.skipped.push({
                            email: user.email,
                            reason: 'User already exists'
                        });
                        continue;
                    }

                    if (existing && importOptions.updateExisting) {
                        // Update existing user
                        const adminUser = await AdminUser.findOne({ userId: existing._id });
                        if (adminUser) {
                            await this.updateAdminUser(adminUser._id, user, importedBy);
                            results.imported.push(adminUser._id);
                        }
                    } else {
                        // Create new user
                        const created = await this.createAdminUser(user, importedBy);
                        results.imported.push(created.adminUser._id);
                    }

                } catch (error) {
                    results.failed.push({
                        userData: { email: user.email, username: user.username },
                        error: error.message
                    });
                }
            }

            // Log audit event
            await this.#logAuditEvent('BULK_IMPORT', {
                importedBy,
                importOptions,
                results
            });

            logger.info(`Import completed: ${results.imported.length} imported, ${results.skipped.length} skipped, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error importing admin users:', error);
            throw error;
        }
    }

    /**
     * Export admin users to specified format
     * @param {Object} filters - Export filters
     * @param {Object} exportOptions - Export options
     * @param {string} exportedBy - ID of admin performing export
     * @returns {Promise<Object>} Export result
     */
    async exportAdminUsers(filters = {}, exportOptions = {}, exportedBy) {
        try {
            logger.info('Exporting admin users');

            // Check export permissions
            await this.#checkExportPermissions(exportedBy);

            // Build query
            const query = this.#buildListQuery(filters);

            // Fetch users
            const adminUsers = await AdminUser.find(query)
                .populate('userId', 'email username firstName lastName')
                .lean();

            // Transform data based on format
            let exportData;

            switch (exportOptions.format) {
                case 'CSV':
                    exportData = await this.#formatAsCSV(adminUsers, exportOptions);
                    break;

                case 'JSON':
                    exportData = await this.#formatAsJSON(adminUsers, exportOptions);
                    break;

                case 'EXCEL':
                    exportData = await this.#formatAsExcel(adminUsers, exportOptions);
                    break;

                default:
                    throw new AppError('Invalid export format', 400);
            }

            // Log audit event
            await this.#logAuditEvent('DATA_EXPORT', {
                exportedBy,
                filters,
                exportOptions,
                recordCount: adminUsers.length
            });

            logger.info(`Exported ${adminUsers.length} admin users`);

            return {
                data: exportData,
                metadata: {
                    exportedAt: new Date(),
                    exportedBy,
                    recordCount: adminUsers.length,
                    format: exportOptions.format
                }
            };

        } catch (error) {
            logger.error('Error exporting admin users:', error);
            throw error;
        }
    }

    /**
     * Get admin user statistics
     * @param {Object} filters - Statistics filters
     * @returns {Promise<Object>} User statistics
     */
    async getAdminUserStatistics(filters = {}) {
        try {
            logger.debug('Fetching admin user statistics');

            const query = this.#buildListQuery(filters);

            const [
                totalUsers,
                activeUsers,
                suspendedUsers,
                departmentStats,
                roleStats,
                activityStats
            ] = await Promise.all([
                AdminUser.countDocuments(query),
                AdminUser.countDocuments({ ...query, 'status.accountStatus': 'ACTIVE' }),
                AdminUser.countDocuments({ ...query, 'status.accountStatus': 'SUSPENDED' }),
                this.#getDepartmentStatistics(query),
                this.#getRoleStatistics(query),
                this.#getActivityStatistics(query)
            ]);

            return {
                total: totalUsers,
                active: activeUsers,
                suspended: suspendedUsers,
                inactive: totalUsers - activeUsers - suspendedUsers,
                byDepartment: departmentStats,
                byRole: roleStats,
                activity: activityStats,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Error fetching statistics:', error);
            throw error;
        }
    }

    /**
     * Handles multiple update types in a single request.
     * @param {Object} adminUser - The admin user document
     * @param {Object} updateData - The update data containing multiple update types
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #handleMultipleUpdates(adminUser, updateData, updatedBy) {
        // Example: Apply multiple update types sequentially
        if (updateData.profile) {
            await this.#updateProfile(adminUser, updateData.profile, updatedBy);
        }
        if (updateData.department) {
            await this.#updateDepartment(adminUser, updateData.department, updatedBy);
        }
        if (updateData.accessControl) {
            await this.#updateAccessControl(adminUser, updateData.accessControl, updatedBy);
        }
        if (updateData.permissions) {
            await this.updatePermissions(adminUser._id, updateData.permissions, updatedBy);
        }
        if (updateData.status) {
            await this.#updateStatus(adminUser, updateData.status, updatedBy);
        }
        if (updateData.metadata) {
            await this.#updateMetadata(adminUser, updateData.metadata);
        }
        // Add more update types as needed
    }

    /**
     * Updates the profile information of an admin user.
     * @param {Object} adminUser - The admin user document
     * @param {Object} profileData - The profile data to update
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #updateProfile(adminUser, profileData, updatedBy) {
        if (!adminUser.adminProfile) {
            adminUser.adminProfile = {};
        }
        Object.assign(adminUser.adminProfile, profileData);
        if (!adminUser.auditLog) {
            adminUser.auditLog = {};
        }
        if (!adminUser.auditLog.profileChanges) {
            adminUser.auditLog.profileChanges = [];
        }
        adminUser.auditLog.profileChanges.push({
            changedBy: updatedBy,
            changedAt: new Date(),
            newProfile: { ...profileData }
        });
        await adminUser.save();
    }

    /**
     * Updates the department of an admin user.
     * @param {Object} adminUser - The admin user document
     * @param {Object|string} departmentData - The department data to update (can be string or object)
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #updateDepartment(adminUser, departmentData, updatedBy) {
        if (!adminUser.adminProfile) {
            adminUser.adminProfile = {};
        }
        if (typeof departmentData === 'string') {
            adminUser.adminProfile.department = departmentData;
        } else if (typeof departmentData === 'object' && departmentData.department) {
            adminUser.adminProfile.department = departmentData.department;
            // Optionally update other department-related fields
            if (departmentData.officeLocation) {
                adminUser.adminProfile.officeLocation = departmentData.officeLocation;
            }
            if (departmentData.reportingTo) {
                adminUser.adminProfile.reportingTo = departmentData.reportingTo;
            }
        }
        if (!adminUser.auditLog) {
            adminUser.auditLog = {};
        }
        if (!adminUser.auditLog.departmentChanges) {
            adminUser.auditLog.departmentChanges = [];
        }
        adminUser.auditLog.departmentChanges.push({
            changedBy: updatedBy,
            changedAt: new Date(),
            newDepartment: typeof departmentData === 'string' ? departmentData : departmentData.department
        });
        await adminUser.save();
    }

    /**
     * Updates the access control settings for an admin user.
     * @param {Object} adminUser - The admin user document
     * @param {Object} accessControlData - The access control data to update
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #updateAccessControl(adminUser, accessControlData, updatedBy) {
        if (!adminUser.accessControl) {
            adminUser.accessControl = {};
        }
        Object.assign(adminUser.accessControl, accessControlData);
        if (!adminUser.auditLog) {
            adminUser.auditLog = {};
        }
        if (!adminUser.auditLog.accessControlChanges) {
            adminUser.auditLog.accessControlChanges = [];
        }
        adminUser.auditLog.accessControlChanges.push({
            changedBy: updatedBy,
            changedAt: new Date(),
            newAccessControl: { ...accessControlData }
        });
        await adminUser.save();
    }

    /**
     * Updates the status of an admin user.
     * @param {Object} adminUser - The admin user document
     * @param {Object} statusData - The status data to update
     * @param {string} updatedBy - The ID of the admin performing the update
     */
    async #updateStatus(adminUser, statusData, updatedBy) {
        if (!adminUser.status) {
            adminUser.status = {};
        }
        Object.assign(adminUser.status, statusData);
        if (!adminUser.auditLog) {
            adminUser.auditLog = {};
        }
        if (!adminUser.auditLog.statusChanges) {
            adminUser.auditLog.statusChanges = [];
        }
        adminUser.auditLog.statusChanges.push({
            changedBy: updatedBy,
            changedAt: new Date(),
            newStatus: { ...statusData }
        });
        await adminUser.save();
    }

    /**
     * Updates administrative metadata for an admin user.
     * @param {Object} adminUser - The admin user document
     * @param {Object} metadata - The metadata to update
     */
    async #updateMetadata(adminUser, metadata) {
        if (!adminUser.administrativeMetadata) {
            adminUser.administrativeMetadata = {};
        }
        Object.assign(adminUser.administrativeMetadata, metadata);
        await adminUser.save();
    }

    /**
     * Determines if the update type is significant and should trigger notifications.
     * @param {string} updateType
     * @returns {boolean}
     */
    #isSignificantChange(updateType) {
        const significantTypes = [
            'DEPARTMENT',
            'ACCESS_CONTROL',
            'PERMISSIONS',
            'STATUS',
            'MULTIPLE'
        ];
        return significantTypes.includes(updateType);
    }

    /**
     * Private helper methods
     */

    async #checkDeletionEligibility(adminUser) {
        // Example eligibility check: prevent deletion if user is the last SYSTEM_ADMIN
        if (!adminUser) {
            throw new AppError('Admin user not found for deletion eligibility check', 404);
        }
        if (adminUser.administrativeRoles?.some(role => role.roleName === 'SYSTEM_ADMIN')) {
            const systemAdminCount = await AdminUser.countDocuments({
                'administrativeRoles.roleName': 'SYSTEM_ADMIN',
                _id: { $ne: adminUser._id }
            });
            if (systemAdminCount === 0) {
                throw new AppError('Cannot delete the last SYSTEM_ADMIN user', 403);
            }
        }
        // Add more eligibility checks as needed
        return true;
    }

    async #validateBulkOperation(userIds, updateData, updatedBy) {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new AppError('User IDs for bulk update must be a non-empty array', 400);
        }
        if (typeof updateData !== 'object' || !updateData) {
            throw new AppError('Update data for bulk update must be a valid object', 400);
        }
        // Optionally, check if updatedBy is a valid admin user
        const adminUser = await AdminUser.findOne({ userId: updatedBy });
        if (!adminUser) {
            throw new AppError('Updating admin user not found', 404);
        }
        return true;
    }

    async #validateImportData(userData) {
        if (!Array.isArray(userData)) {
            throw new AppError('Import data must be an array', 400);
        }
        for (const user of userData) {
            await this.#validateUserData(user);
        }
        return true;
    }

    async #formatAsCSV(adminUsers, exportOptions) {
        // Simple CSV formatter for adminUsers array
        const fields = [
            'administrativeId',
            'userId.email',
            'userId.username',
            'adminProfile.displayName',
            'adminProfile.department',
            'status.accountStatus',
            'createdAt'
        ];
        const header = fields.join(',');
        const rows = adminUsers.map(user => {
            return [
                user.administrativeId || '',
                user.userId?.email || '',
                user.userId?.username || '',
                user.adminProfile?.displayName || '',
                user.adminProfile?.department || '',
                user.status?.accountStatus || '',
                user.createdAt ? new Date(user.createdAt).toISOString() : ''
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        });
        return [header, ...rows].join('\n');
    }

    async #formatAsJSON(adminUsers, exportOptions) {
        // Simple JSON formatter for adminUsers array
        return JSON.stringify(adminUsers, null, exportOptions?.pretty ? 2 : 0);
    }

    async #formatAsExcel(adminUsers, exportOptions) {
        // Simple Excel formatter for adminUsers array (returns a buffer with XLSX content)
        // Uses 'exceljs' library, which must be installed: npm install exceljs
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Admin Users');
        const columns = [
            { header: 'Administrative ID', key: 'administrativeId', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Username', key: 'username', width: 20 },
            { header: 'Display Name', key: 'displayName', width: 25 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Account Status', key: 'accountStatus', width: 15 },
            { header: 'Created At', key: 'createdAt', width: 25 }
        ];
        worksheet.columns = columns;
        adminUsers.forEach(user => {
            worksheet.addRow({
                administrativeId: user.administrativeId || '',
                email: user.userId?.email || '',
                username: user.userId?.username || '',
                displayName: user.adminProfile?.displayName || '',
                department: user.adminProfile?.department || '',
                accountStatus: user.status?.accountStatus || '',
                createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : ''
            });
        });
        return await workbook.xlsx.writeBuffer();
    }

    async #getDepartmentStatistics(query) {
        // Aggregate department statistics
        const stats = await AdminUser.aggregate([
            { $match: query },
            { $group: { _id: '$adminProfile.department', count: { $sum: 1 } } }
        ]);
        const result = {};
        stats.forEach(stat => {
            result[stat._id] = stat.count;
        });
        return result;
    }

    async #getRoleStatistics(query) {
        // Aggregate role statistics
        const stats = await AdminUser.aggregate([
            { $match: query },
            { $unwind: '$administrativeRoles' },
            { $group: { _id: '$administrativeRoles.roleName', count: { $sum: 1 } } }
        ]);
        const result = {};
        stats.forEach(stat => {
            result[stat._id] = stat.count;
        });
        return result;
    }

    async #getActivityStatistics(query) {
        // Aggregate activity statistics (example: last login distribution)
        const stats = await AdminUser.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$activityTracking.lastLogin.timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);
        const result = {};
        stats.forEach(stat => {
            result[stat._id] = stat.count;
        });
        return result;
    }

    async #validateUserData(userData) {
        // Validate email
        if (!CommonValidator.isValidEmail(userData.email)) {
            throw new AppError('Invalid email format', 400);
        }

        // Validate username
        if (!userData.username || userData.username.length < 3) {
            throw new AppError('Username must be at least 3 characters', 400);
        }

        // Validate department
        const validDepartments = ['EXECUTIVE', 'OPERATIONS', 'TECHNICAL', 'SUPPORT',
            'SECURITY', 'COMPLIANCE', 'FINANCE', 'HUMAN_RESOURCES'];
        if (!validDepartments.includes(userData.department)) {
            throw new AppError('Invalid department', 400);
        }

        // Validate required fields
        const requiredFields = ['firstName', 'lastName', 'title'];
        for (const field of requiredFields) {
            if (!userData[field]) {
                throw new AppError(`${field} is required`, 400);
            }
        }

        return true;
    }

    async #createBaseUser(userData) {
        const baseUserData = {
            email: userData.email,
            username: userData.username,
            firstName: userData.firstName,
            lastName: userData.lastName,
            password: userData.password || stringHelper.generateRandomString(16),
            phoneNumber: userData.phoneNumber,
            isActive: true,
            emailVerified: false
        };

        const baseUser = new User(baseUserData);
        await baseUser.save();

        return baseUser;
    }

    #initializeDefaultPermissions(department) {
        const defaultPermissions = {
            userManagement: {
                read: true,
                create: false,
                update: false,
                delete: false
            },
            organizationManagement: {
                read: true,
                create: false,
                update: false,
                delete: false
            }
        };

        // Add department-specific permissions
        switch (department) {
            case 'TECHNICAL':
                defaultPermissions.systemAdministration = {
                    viewSystemHealth: true,
                    accessLogs: true
                };
                break;

            case 'SUPPORT':
                defaultPermissions.supportAdministration = {
                    viewTickets: true,
                    manageTickets: true
                };
                break;

            case 'SECURITY':
                defaultPermissions.securityAdministration = {
                    viewSecurityLogs: true,
                    performAudits: true
                };
                break;
        }

        return defaultPermissions;
    }

    #initializeAccessControl(userData) {
        return {
            ipWhitelist: userData.ipWhitelist || [],
            accessHours: userData.accessHours || { enabled: false },
            geofencing: userData.geofencing || { enabled: false },
            deviceRestrictions: userData.deviceRestrictions || { enabled: false },
            mfaRequirements: {
                enforced: true,
                methods: ['TOTP'],
                gracePeriodUntil: new Date(Date.now() + this.#mfaGracePeriod)
            },
            sessionRestrictions: {
                maxConcurrentSessions: 3,
                sessionTimeout: this.#sessionDuration,
                idleTimeout: 900000, // 15 minutes
                requireReauthentication: {
                    forSensitiveOperations: true,
                    afterIdleMinutes: 30
                }
            }
        };
    }

    async #determineInitialRole(department) {
        const roleMapping = {
            'EXECUTIVE': 'READ_ONLY_ADMIN',
            'TECHNICAL': 'SYSTEM_ADMIN',
            'SUPPORT': 'SUPPORT_ADMIN',
            'SECURITY': 'SECURITY_ADMIN',
            'COMPLIANCE': 'COMPLIANCE_OFFICER',
            'FINANCE': 'BILLING_ADMIN',
            'OPERATIONS': 'USER_ADMIN',
            'HUMAN_RESOURCES': 'USER_ADMIN'
        };

        const roleName = roleMapping[department] || 'READ_ONLY_ADMIN';

        return {
            roleName,
            scope: 'DEPARTMENTAL',
            metadata: {
                reason: 'Initial role assignment based on department'
            }
        };
    }

    async #sendWelcomeEmail(baseUser, adminUser) {
        try {
            await this.#emailService.sendEmail({
                to: baseUser.email,
                subject: 'Welcome to InsightSerenity Admin Platform',
                template: 'admin-welcome',
                data: {
                    firstName: baseUser.firstName,
                    administrativeId: adminUser.administrativeId,
                    department: adminUser.adminProfile.department,
                    loginUrl: process.env.ADMIN_LOGIN_URL
                }
            });
        } catch (error) {
            logger.error('Error sending welcome email:', error);
        }
    }

    async #createOnboardingTasks(adminUser) {
        const onboardingSteps = [
            { name: 'Profile Setup', completed: false },
            { name: 'Security Configuration', completed: false },
            { name: 'MFA Setup', completed: false },
            { name: 'Department Training', completed: false },
            { name: 'System Access Review', completed: false }
        ];

        adminUser.administrativeMetadata.onboardingStatus = {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            steps: onboardingSteps
        };

        await adminUser.save();
    }

    async #invalidateUserCache(adminUserId) {
        const patterns = [
            `${this.#cachePrefix}${adminUserId}`,
            `${this.#cachePrefix}*:${adminUserId}`,
            'admin:users:list:*',
            'admin:users:stats:*'
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    async #logAuditEvent(eventType, eventData) {
        try {
            logger.audit({
                type: eventType,
                timestamp: new Date(),
                data: eventData
            });
        } catch (error) {
            logger.error('Error logging audit event:', error);
        }
    }

    #sanitizeUserData(user) {
        const sanitized = { ...user.toObject ? user.toObject() : user };
        delete sanitized.password;
        delete sanitized.passwordHistory;
        delete sanitized.securityQuestions;
        delete sanitized.mfaSecret;
        return sanitized;
    }

    #sanitizeAdminUser(adminUser) {
        const sanitized = { ...adminUser };
        delete sanitized.accessControl?.mfaRequirements?.backupCodes;
        delete sanitized.auditLog?.accessLog;
        delete sanitized.activityTracking?.loginHistory;
        return sanitized;
    }

    #buildListQuery(filters) {
        const query = {};

        if (filters.status) {
            query['status.accountStatus'] = filters.status;
        }

        if (filters.department) {
            query['adminProfile.department'] = filters.department;
        }

        if (filters.role) {
            query['administrativeRoles.roleName'] = filters.role;
        }

        if (filters.reportingTo) {
            query['adminProfile.reportingTo'] = filters.reportingTo;
        }

        if (filters.createdAfter) {
            query.createdAt = { $gte: new Date(filters.createdAfter) };
        }

        if (filters.createdBefore) {
            query.createdAt = { ...query.createdAt, $lte: new Date(filters.createdBefore) };
        }

        if (filters.lastActiveAfter) {
            query['activityTracking.lastLogin.timestamp'] = {
                $gte: new Date(filters.lastActiveAfter)
            };
        }

        return query;
    }

    #buildSortQuery(sortBy = 'createdAt', sortOrder = 'desc') {
        const sortFields = {
            'createdAt': 'createdAt',
            'lastLogin': 'activityTracking.lastLogin.timestamp',
            'displayName': 'adminProfile.displayName',
            'department': 'adminProfile.department',
            'status': 'status.accountStatus'
        };

        const field = sortFields[sortBy] || 'createdAt';
        const order = sortOrder === 'asc' ? 1 : -1;

        return { [field]: order };
    }

    async #getLastActivity(adminUserId) {
        // Fetch the last activity timestamp for the given admin user
        try {
            const adminUser = await AdminUser.findById(adminUserId).lean();
            return adminUser?.activityTracking?.lastLogin?.timestamp || null;
        } catch (error) {
            logger.error('Error fetching last activity:', error);
            return null;
        }
    }

    async #getUserStatistics(adminUserId) {
        // Example implementation: return basic statistics for the admin user
        try {
            const adminUser = await AdminUser.findById(adminUserId).lean();
            if (!adminUser) return null;
            // Example stats: number of roles, last login, account status
            return {
                roleCount: Array.isArray(adminUser.administrativeRoles) ? adminUser.administrativeRoles.length : 0,
                lastLogin: adminUser.activityTracking?.lastLogin?.timestamp || null,
                accountStatus: adminUser.status?.accountStatus || null
            };
        } catch (error) {
            logger.error('Error fetching user statistics:', error);
            return null;
        }
    }

    async #enrichWithMetrics(adminUser) {
        // Example implementation: add metrics to adminUser object
        try {
            // You can add more complex metrics here as needed
            adminUser.metrics = {
                roleCount: Array.isArray(adminUser.administrativeRoles) ? adminUser.administrativeRoles.length : 0,
                lastLogin: adminUser.activityTracking?.lastLogin?.timestamp || null,
                accountStatus: adminUser.status?.accountStatus || null
            };
            return adminUser;
        } catch (error) {
            logger.error('Error enriching admin user with metrics:', error);
            return adminUser;
        }
    }

    async #enrichWithActivity(adminUser) {
        // Example implementation: add activity info to adminUser object
        try {
            adminUser.activity = {
                lastLogin: adminUser.activityTracking?.lastLogin?.timestamp || null,
                loginCount: Array.isArray(adminUser.activityTracking?.loginHistory)
                    ? adminUser.activityTracking.loginHistory.length
                    : 0
            };
            return adminUser;
        } catch (error) {
            logger.error('Error enriching admin user with activity:', error);
            return adminUser;
        }
    }

    async #enrichWithPermissions(adminUser) {
        // Example implementation: add permissions info to adminUser object
        try {
            const userPermission = await UserPermission.findOne({ userId: adminUser.userId }).lean();
            adminUser.permissions = userPermission ? userPermission.permissions : adminUser.granularPermissions || {};
            return adminUser;
        } catch (error) {
            logger.error('Error enriching admin user with permissions:', error);
            adminUser.permissions = adminUser.granularPermissions || {};
            return adminUser;
        }
    }

    async #checkExportPermissions(exportedBy) {
        // Example: Only allow users with 'EXPORT_ADMIN_USERS' permission
        const adminUser = await AdminUser.findOne({ userId: exportedBy });
        if (!adminUser) {
            throw new AppError('Exporting admin user not found', 404);
        }
        const hasPermission =
            adminUser.granularPermissions?.userManagement?.export === true ||
            (adminUser.administrativeRoles || []).some(role =>
                role.roleName === 'SYSTEM_ADMIN' || role.roleName === 'EXECUTIVE'
            );
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to export admin users', 403);
        }
        return true;
    }

    async #revokeAllPermissions(adminUser, revokedBy) {
        // Revoke all permissions for the admin user
        try {
            // Set all granular permissions to false
            if (adminUser.granularPermissions) {
                for (const permCategory of Object.keys(adminUser.granularPermissions)) {
                    for (const permKey of Object.keys(adminUser.granularPermissions[permCategory])) {
                        adminUser.granularPermissions[permCategory][permKey] = false;
                    }
                }
            }
            // Also update UserPermission model if present
            let userPermission = await UserPermission.findOne({ userId: adminUser.userId });
            if (userPermission && userPermission.permissions) {
                for (const permCategory of Object.keys(userPermission.permissions)) {
                    for (const permKey of Object.keys(userPermission.permissions[permCategory])) {
                        userPermission.permissions[permCategory][permKey] = false;
                    }
                }
                userPermission.assignedBy = revokedBy;
                userPermission.assignedAt = new Date();
                await userPermission.save();
            }
            await adminUser.save();
        } catch (error) {
            logger.error('Error revoking all permissions:', error);
            throw new AppError('Failed to revoke all permissions', 500);
        }
    }

    async #performHardDelete(adminUser, deletedBy) {
        // Permanently delete the admin user and related data
        try {
            // Remove related UserPermission
            await UserPermission.deleteOne({ userId: adminUser.userId });
            // Remove related AdminSession
            await AdminSession.deleteMany({ userId: adminUser.userId });
            // Remove base User
            await User.deleteOne({ _id: adminUser.userId });
            // Remove AdminUser
            await AdminUser.deleteOne({ _id: adminUser._id });
            // Optionally, log audit event for hard delete
            await this.#logAuditEvent('ADMIN_USER_HARD_DELETED', {
                adminUserId: adminUser._id,
                deletedBy,
                deletedAt: new Date()
            });
        } catch (error) {
            logger.error('Error performing hard delete:', error);
            throw new AppError('Failed to perform hard delete', 500);
        }
    }
}

// Export singleton instance
module.exports = new AdminUserService();