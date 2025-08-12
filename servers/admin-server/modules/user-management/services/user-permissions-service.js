'use strict';

/**
 * @fileoverview User permissions service for granular access control management
 * @module servers/admin-server/modules/user-management/services/user-permissions-service
 * @requires module:servers/admin-server/modules/user-management/models/user-permission-model
 * @requires module:servers/admin-server/modules/user-management/models/admin-user-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/role-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const UserPermission = require('../models/user-permission-model');
const AdminUser = require('../models/admin-user-model');
const User = require('../../../../../shared/lib/database/models/users/user-model');
const Role = require('../../../../../shared/lib/database/models/users/role-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

/**
 * Service for managing user permissions and access control
 * @class UserPermissionsService
 */
class UserPermissionsService {
    /**
     * Private fields
     */
    #cachePrefix = 'permissions:';
    #cacheTTL = 600; // 10 minutes
    #maxPermissionsPerUser = 500;
    #maxRolesPerUser = 20;
    #permissionInheritanceDepth = 5;
    #evaluationCacheSize = 1000;
    #auditRetentionDays = 2555; // 7 years
    #batchSize = 50;

    #cacheService;
    #notificationService;
    #evaluationCache;
    #permissionHierarchy;
    #roleHierarchy;

    /**
     * Constructor
     */
    constructor() {
        this.#cacheService = new CacheService();
        this.#notificationService = new NotificationService();
        this.#evaluationCache = new Map();
        this.#permissionHierarchy = new Map();
        this.#roleHierarchy = new Map();

        // Initialize hierarchies
        this.#initializeHierarchies();

        logger.info('UserPermissionsService initialized');
    }

    /**
     * Create a new permission
     * @param {Object} permissionData - Permission data
     * @param {string} createdBy - Admin creating the permission
     * @returns {Promise<Object>} Created permission
     */
    async createPermission(permissionData, createdBy) {
        try {
            logger.info(`Creating new permission: ${permissionData.permissionName}`);

            // Validate permission data
            await this.#validatePermissionData(permissionData);

            // Check for existing permission
            const existing = await UserPermission.findOne({
                $or: [
                    { permissionCode: permissionData.permissionCode },
                    {
                        category: permissionData.category,
                        module: permissionData.module,
                        resource: permissionData.resource,
                        action: permissionData.action
                    }
                ]
            });

            if (existing) {
                throw new AppError('Permission already exists', 409);
            }

            // Check dependencies
            if (permissionData.dependencies) {
                await this.#validatePermissionDependencies(permissionData.dependencies);
            }

            // Create permission
            const permission = new UserPermission({
                ...permissionData,
                auditLog: {
                    createdBy,
                    createdAt: new Date()
                }
            });

            await permission.save();

            // Update permission hierarchy
            await this.#updatePermissionHierarchy(permission);

            // Clear caches
            await this.#clearPermissionCaches();

            // Log audit
            await this.#logPermissionAudit('PERMISSION_CREATED', {
                permissionId: permission._id,
                permissionCode: permission.permissionCode,
                createdBy
            });

            logger.info(`Permission created: ${permission.permissionCode}`);

            return permission.toSafeJSON();

        } catch (error) {
            logger.error('Error creating permission:', error);
            throw error;
        }
    }

    /**
     * Get permission by ID or code
     * @param {string} identifier - Permission ID or code
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Permission data
     */
    async getPermission(identifier, options = {}) {
        try {
            logger.debug(`Fetching permission: ${identifier}`);

            // Check cache
            const cacheKey = `${this.#cachePrefix}permission:${identifier}`;
            const cached = await this.#cacheService.get(cacheKey);

            if (cached && !options.skipCache) {
                return cached;
            }

            // Find permission
            const query = mongoose.Types.ObjectId.isValid(identifier)
                ? { _id: identifier }
                : { permissionCode: identifier };

            const permission = await UserPermission.findOne(query)
                .populate(options.populate || '');

            if (!permission) {
                throw new AppError('Permission not found', 404);
            }

            // Enrich with additional data
            if (options.includeUsage) {
                permission.usage = await this.#getPermissionUsage(permission._id);
            }

            if (options.includeAssignments) {
                permission.assignments = await this.#getPermissionAssignments(permission._id);
            }

            const result = permission.toSafeJSON();

            // Cache result
            await this.#cacheService.set(cacheKey, result, this.#cacheTTL);

            return result;

        } catch (error) {
            logger.error('Error fetching permission:', error);
            throw error;
        }
    }

    /**
     * Update permission
     * @param {string} permissionId - Permission ID
     * @param {Object} updateData - Update data
     * @param {string} updatedBy - Admin updating the permission
     * @returns {Promise<Object>} Updated permission
     */
    async updatePermission(permissionId, updateData, updatedBy) {
        try {
            logger.info(`Updating permission: ${permissionId}`);

            const permission = await UserPermission.findById(permissionId);

            if (!permission) {
                throw new AppError('Permission not found', 404);
            }

            // Check if system permission
            if (permission.status.isSystem && !updateData.forceUpdate) {
                throw new AppError('Cannot modify system permission', 403);
            }

            // Validate updates
            await this.#validatePermissionUpdate(permission, updateData);

            // Apply updates
            Object.assign(permission, updateData);

            // Add audit entry
            permission.auditLog.modifications.push({
                modifiedBy: updatedBy,
                modifiedAt: new Date(),
                changes: new Map(Object.entries(updateData))
            });

            permission.auditLog.lastModifiedBy = updatedBy;
            permission.auditLog.lastModifiedAt = new Date();

            await permission.save();

            // Update hierarchy if needed
            if (updateData.dependencies) {
                await this.#updatePermissionHierarchy(permission);
            }

            // Clear caches
            await this.#clearPermissionCaches();

            // Notify affected users
            await this.#notifyPermissionUpdate(permission, updateData);

            // Log audit
            await this.#logPermissionAudit('PERMISSION_UPDATED', {
                permissionId,
                changes: updateData,
                updatedBy
            });

            logger.info(`Permission ${permissionId} updated`);

            return permission.toSafeJSON();

        } catch (error) {
            logger.error('Error updating permission:', error);
            throw error;
        }
    }

    /**
     * Delete permission
     * @param {string} permissionId - Permission ID
     * @param {Object} options - Deletion options
     * @param {string} deletedBy - Admin deleting the permission
     * @returns {Promise<Object>} Deletion result
     */
    async deletePermission(permissionId, options = {}, deletedBy) {
        try {
            logger.info(`Deleting permission: ${permissionId}`);

            const permission = await UserPermission.findById(permissionId);

            if (!permission) {
                throw new AppError('Permission not found', 404);
            }

            // Check if system permission
            if (permission.status.isSystem) {
                throw new AppError('Cannot delete system permission', 403);
            }

            // Check for active assignments
            if (permission.usageTracking.activeAssignments > 0 && !options.forceDelete) {
                throw new AppError('Permission has active assignments', 409);
            }

            if (options.softDelete) {
                // Soft delete - retire the permission
                await permission.retire();
            } else {
                // Hard delete
                await UserPermission.deleteOne({ _id: permissionId });
            }

            // Clear caches
            await this.#clearPermissionCaches();

            // Log audit
            await this.#logPermissionAudit('PERMISSION_DELETED', {
                permissionId,
                permissionCode: permission.permissionCode,
                deletedBy,
                softDelete: options.softDelete
            });

            logger.info(`Permission ${permissionId} deleted`);

            return {
                success: true,
                message: 'Permission deleted successfully',
                permissionCode: permission.permissionCode
            };

        } catch (error) {
            logger.error('Error deleting permission:', error);
            throw error;
        }
    }

    /**
     * List permissions with filtering
     * @param {Object} filters - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated permissions list
     */
    async listPermissions(filters = {}, options = {}) {
        try {
            logger.debug('Listing permissions');

            // Build query
            const query = this.#buildPermissionQuery(filters);

            // Pagination
            const page = parseInt(options.page) || 1;
            const limit = Math.min(parseInt(options.limit) || 20, 100);
            const skip = (page - 1) * limit;

            // Sort
            const sort = this.#buildPermissionSort(options.sortBy, options.sortOrder);

            // Execute query
            const [permissions, totalCount] = await Promise.all([
                UserPermission.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                UserPermission.countDocuments(query)
            ]);

            // Enrich with usage data if requested
            if (options.includeUsage) {
                for (const permission of permissions) {
                    permission.usage = await this.#getPermissionUsage(permission._id);
                }
            }

            return {
                permissions: permissions.map(p => this.#sanitizePermission(p)),
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
            logger.error('Error listing permissions:', error);
            throw error;
        }
    }

    /**
     * Assign permission to user
     * @param {string} userId - User ID
     * @param {string} permissionId - Permission ID
     * @param {Object} assignmentData - Assignment data
     * @param {string} assignedBy - Admin assigning the permission
     * @returns {Promise<Object>} Assignment result
     */
    async assignPermissionToUser(userId, permissionId, assignmentData = {}, assignedBy) {
        try {
            logger.info(`Assigning permission ${permissionId} to user ${userId}`);

            // Validate user and permission
            const [user, permission] = await Promise.all([
                User.findById(userId),
                UserPermission.findById(permissionId)
            ]);

            if (!user) {
                throw new AppError('User not found', 404);
            }

            if (!permission) {
                throw new AppError('Permission not found', 404);
            }

            // Check if already assigned
            const existingAssignment = permission.usageTracking.assignments.find(
                a => a.userId.equals(userId) && (!a.expiresAt || a.expiresAt > new Date())
            );

            if (existingAssignment) {
                throw new AppError('Permission already assigned to user', 409);
            }

            // Check user eligibility
            await this.#checkUserEligibility(user, permission);

            // Check for conflicts
            await this.#checkPermissionConflicts(userId, permission);

            // Check dependencies
            await this.#checkPermissionDependencies(userId, permission);

            // Assign permission
            const assignment = await permission.assignToUser(userId, {
                ...assignmentData,
                assignedBy
            });

            // Clear user permission cache
            await this.#clearUserPermissionCache(userId);

            // Send notification
            await this.#sendPermissionAssignmentNotification(user, permission, assignedBy);

            // Log audit
            await this.#logPermissionAudit('PERMISSION_ASSIGNED', {
                userId,
                permissionId,
                assignment,
                assignedBy
            });

            logger.info(`Permission ${permissionId} assigned to user ${userId}`);

            return {
                success: true,
                assignment,
                permission: permission.toSafeJSON()
            };

        } catch (error) {
            logger.error('Error assigning permission:', error);
            throw error;
        }
    }

    /**
     * Revoke permission from user
     * @param {string} userId - User ID
     * @param {string} permissionId - Permission ID
     * @param {Object} revocationData - Revocation data
     * @param {string} revokedBy - Admin revoking the permission
     * @returns {Promise<Object>} Revocation result
     */
    async revokePermissionFromUser(userId, permissionId, revocationData = {}, revokedBy) {
        try {
            logger.info(`Revoking permission ${permissionId} from user ${userId}`);

            const permission = await UserPermission.findById(permissionId);

            if (!permission) {
                throw new AppError('Permission not found', 404);
            }

            // Revoke permission
            const revoked = await permission.revokeFromUser(userId, {
                ...revocationData,
                revokedBy
            });

            // Check for dependent permissions
            await this.#handleDependentPermissions(userId, permission);

            // Clear user permission cache
            await this.#clearUserPermissionCache(userId);

            // Send notification
            const user = await User.findById(userId);
            await this.#sendPermissionRevocationNotification(user, permission, revokedBy);

            // Log audit
            await this.#logPermissionAudit('PERMISSION_REVOKED', {
                userId,
                permissionId,
                revocationData,
                revokedBy
            });

            logger.info(`Permission ${permissionId} revoked from user ${userId}`);

            return {
                success: true,
                message: 'Permission revoked successfully',
                revoked
            };

        } catch (error) {
            logger.error('Error revoking permission:', error);
            throw error;
        }
    }

    /**
     * Get user permissions
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User permissions
     */
    async getUserPermissions(userId, options = {}) {
        try {
            logger.debug(`Fetching permissions for user: ${userId}`);

            // Check cache
            const cacheKey = `${this.#cachePrefix}user:${userId}`;
            const cached = await this.#cacheService.get(cacheKey);

            if (cached && !options.skipCache) {
                return cached;
            }

            // Get direct permissions
            const directPermissions = await this.#getDirectPermissions(userId);

            // Get role-based permissions
            const rolePermissions = await this.#getRoleBasedPermissions(userId);

            // Get inherited permissions
            const inheritedPermissions = await this.#getInheritedPermissions(userId);

            // Get temporary permissions
            const temporaryPermissions = await this.#getTemporaryPermissions(userId);

            // Merge and deduplicate
            const allPermissions = this.#mergePermissions([
                ...directPermissions,
                ...rolePermissions,
                ...inheritedPermissions,
                ...temporaryPermissions
            ]);

            // Build permission matrix
            const permissionMatrix = this.#buildPermissionMatrix(allPermissions);

            // Calculate effective permissions
            const effectivePermissions = this.#calculateEffectivePermissions(allPermissions);

            const result = {
                userId,
                direct: directPermissions,
                roles: rolePermissions,
                inherited: inheritedPermissions,
                temporary: temporaryPermissions,
                effective: effectivePermissions,
                matrix: permissionMatrix,
                summary: {
                    totalPermissions: allPermissions.length,
                    categories: this.#groupPermissionsByCategory(allPermissions),
                    highRiskCount: allPermissions.filter(p => p.isHighRisk).length
                }
            };

            // Cache result
            await this.#cacheService.set(cacheKey, result, this.#cacheTTL);

            return result;

        } catch (error) {
            logger.error('Error fetching user permissions:', error);
            throw error;
        }
    }

    /**
     * Check if user has permission
     * @param {string} userId - User ID
     * @param {string} permissionCode - Permission code
     * @param {Object} context - Evaluation context
     * @returns {Promise<boolean>} Has permission
     */
    async checkUserPermission(userId, permissionCode, context = {}) {
        try {
            logger.debug(`Checking permission ${permissionCode} for user ${userId}`);

            // Check evaluation cache
            const cacheKey = `${userId}:${permissionCode}:${JSON.stringify(context)}`;
            if (this.#evaluationCache.has(cacheKey)) {
                return this.#evaluationCache.get(cacheKey);
            }

            // Get user permissions
            const userPermissions = await this.getUserPermissions(userId);

            // Find matching permission
            const hasPermission = userPermissions.effective.some(p => {
                if (p.permissionCode === permissionCode) {
                    // Check context restrictions
                    return this.#evaluatePermissionContext(p, context);
                }

                // Check wildcard permissions
                if (p.permissionCode.includes('*')) {
                    const pattern = p.permissionCode.replace(/\*/g, '.*');
                    const regex = new RegExp(`^${pattern}$`);
                    if (regex.test(permissionCode)) {
                        return this.#evaluatePermissionContext(p, context);
                    }
                }

                return false;
            });

            // Cache evaluation result
            this.#evaluationCache.set(cacheKey, hasPermission);

            // Limit cache size
            if (this.#evaluationCache.size > this.#evaluationCacheSize) {
                const firstKey = this.#evaluationCache.keys().next().value;
                this.#evaluationCache.delete(firstKey);
            }

            // Log access attempt
            await this.#logAccessAttempt(userId, permissionCode, hasPermission, context);

            return hasPermission;

        } catch (error) {
            logger.error('Error checking user permission:', error);
            return false;
        }
    }

    /**
     * Grant role to user
     * @param {string} userId - User ID
     * @param {string} roleId - Role ID
     * @param {Object} grantData - Grant data
     * @param {string} grantedBy - Admin granting the role
     * @returns {Promise<Object>} Grant result
     */
    async grantRoleToUser(userId, roleId, grantData = {}, grantedBy) {
        try {
            logger.info(`Granting role ${roleId} to user ${userId}`);

            // Validate user and role
            const [user, role] = await Promise.all([
                User.findById(userId),
                Role.findById(roleId)
            ]);

            if (!user) {
                throw new AppError('User not found', 404);
            }

            if (!role) {
                throw new AppError('Role not found', 404);
            }

            // Check if user already has role
            if (user.roles && user.roles.includes(roleId)) {
                throw new AppError('User already has this role', 409);
            }

            // Check role conflicts
            await this.#checkRoleConflicts(user, role);

            // Check role prerequisites
            await this.#checkRolePrerequisites(user, role);

            // Grant role
            user.roles = user.roles || [];
            user.roles.push(roleId);
            await user.save();

            // Grant role permissions
            const rolePermissions = await this.#getRolePermissions(roleId);
            for (const permission of rolePermissions) {
                await this.assignPermissionToUser(userId, permission._id, {
                    source: 'ROLE',
                    roleId,
                    ...grantData
                }, grantedBy);
            }

            // Clear caches
            await this.#clearUserPermissionCache(userId);

            // Send notification
            await this.#sendRoleGrantNotification(user, role, grantedBy);

            // Log audit
            await this.#logPermissionAudit('ROLE_GRANTED', {
                userId,
                roleId,
                roleName: role.name,
                grantedBy
            });

            logger.info(`Role ${roleId} granted to user ${userId}`);

            return {
                success: true,
                message: 'Role granted successfully',
                role: role.name,
                permissions: rolePermissions.length
            };

        } catch (error) {
            logger.error('Error granting role:', error);
            throw error;
        }
    }

    /**
     * Revoke role from user
     * @param {string} userId - User ID
     * @param {string} roleId - Role ID
     * @param {Object} revokeData - Revoke data
     * @param {string} revokedBy - Admin revoking the role
     * @returns {Promise<Object>} Revoke result
     */
    async revokeRoleFromUser(userId, roleId, revokeData = {}, revokedBy) {
        try {
            logger.info(`Revoking role ${roleId} from user ${userId}`);

            const user = await User.findById(userId);

            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Check if user has role
            if (!user.roles || !user.roles.includes(roleId)) {
                throw new AppError('User does not have this role', 404);
            }

            // Remove role
            user.roles = user.roles.filter(r => !r.equals(roleId));
            await user.save();

            // Revoke role permissions
            const rolePermissions = await this.#getRolePermissions(roleId);
            for (const permission of rolePermissions) {
                // Check if permission is not granted from another source
                const otherSources = await this.#checkPermissionOtherSources(userId, permission._id, roleId);
                if (!otherSources) {
                    await this.revokePermissionFromUser(userId, permission._id, {
                        reason: 'Role revoked',
                        ...revokeData
                    }, revokedBy);
                }
            }

            // Clear caches
            await this.#clearUserPermissionCache(userId);

            // Send notification
            const role = await Role.findById(roleId);
            await this.#sendRoleRevocationNotification(user, role, revokedBy);

            // Log audit
            await this.#logPermissionAudit('ROLE_REVOKED', {
                userId,
                roleId,
                roleName: role.name,
                revokedBy
            });

            logger.info(`Role ${roleId} revoked from user ${userId}`);

            return {
                success: true,
                message: 'Role revoked successfully',
                role: role.name
            };

        } catch (error) {
            logger.error('Error revoking role:', error);
            throw error;
        }
    }

    /**
     * Bulk assign permissions
     * @param {Array} assignments - Array of assignment objects
     * @param {string} assignedBy - Admin performing assignments
     * @returns {Promise<Object>} Bulk assignment result
     */
    async bulkAssignPermissions(assignments, assignedBy) {
        try {
            logger.info(`Bulk assigning ${assignments.length} permissions`);

            const results = {
                successful: [],
                failed: [],
                totalProcessed: 0
            };

            // Process in batches
            const batches = this.#createBatches(assignments, this.#batchSize);

            for (const batch of batches) {
                const batchPromises = batch.map(async (assignment) => {
                    try {
                        await this.assignPermissionToUser(
                            assignment.userId,
                            assignment.permissionId,
                            assignment.data || {},
                            assignedBy
                        );
                        results.successful.push(assignment);
                    } catch (error) {
                        results.failed.push({
                            ...assignment,
                            error: error.message
                        });
                    }
                    results.totalProcessed++;
                });

                await Promise.all(batchPromises);
            }

            // Clear caches for affected users
            const affectedUsers = [...new Set(assignments.map(a => a.userId))];
            for (const userId of affectedUsers) {
                await this.#clearUserPermissionCache(userId);
            }

            // Log audit
            await this.#logPermissionAudit('BULK_PERMISSIONS_ASSIGNED', {
                results,
                assignedBy
            });

            logger.info(`Bulk assignment completed: ${results.successful.length} successful, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk permission assignment:', error);
            throw error;
        }
    }

    /**
     * Bulk revoke permissions
     * @param {Array} revocations - Array of revocation objects
     * @param {string} revokedBy - Admin performing revocations
     * @returns {Promise<Object>} Bulk revocation result
     */
    async bulkRevokePermissions(revocations, revokedBy) {
        try {
            logger.info(`Bulk revoking ${revocations.length} permissions`);

            const results = {
                successful: [],
                failed: [],
                totalProcessed: 0
            };

            // Process in batches
            const batches = this.#createBatches(revocations, this.#batchSize);

            for (const batch of batches) {
                const batchPromises = batch.map(async (revocation) => {
                    try {
                        await this.revokePermissionFromUser(
                            revocation.userId,
                            revocation.permissionId,
                            revocation.data || {},
                            revokedBy
                        );
                        results.successful.push(revocation);
                    } catch (error) {
                        results.failed.push({
                            ...revocation,
                            error: error.message
                        });
                    }
                    results.totalProcessed++;
                });

                await Promise.all(batchPromises);
            }

            // Clear caches for affected users
            const affectedUsers = [...new Set(revocations.map(r => r.userId))];
            for (const userId of affectedUsers) {
                await this.#clearUserPermissionCache(userId);
            }

            // Log audit
            await this.#logPermissionAudit('BULK_PERMISSIONS_REVOKED', {
                results,
                revokedBy
            });

            logger.info(`Bulk revocation completed: ${results.successful.length} successful, ${results.failed.length} failed`);

            return results;

        } catch (error) {
            logger.error('Error in bulk permission revocation:', error);
            throw error;
        }
    }

    /**
     * Clone permissions from one user to another
     * @param {string} sourceUserId - Source user ID
     * @param {string} targetUserId - Target user ID
     * @param {Object} options - Clone options
     * @param {string} clonedBy - Admin performing clone
     * @returns {Promise<Object>} Clone result
     */
    async cloneUserPermissions(sourceUserId, targetUserId, options = {}, clonedBy) {
        try {
            logger.info(`Cloning permissions from ${sourceUserId} to ${targetUserId}`);

            // Get source user permissions
            const sourcePermissions = await this.getUserPermissions(sourceUserId);

            // Filter permissions based on options
            let permissionsToClone = sourcePermissions.direct;

            if (options.includeRoles) {
                const sourceUser = await User.findById(sourceUserId);
                const targetUser = await User.findById(targetUserId);

                // Clone roles
                for (const roleId of sourceUser.roles || []) {
                    if (!targetUser.roles || !targetUser.roles.includes(roleId)) {
                        await this.grantRoleToUser(targetUserId, roleId, {
                            source: 'CLONED',
                            sourceUserId
                        }, clonedBy);
                    }
                }
            }

            if (!options.includeTemporary) {
                permissionsToClone = permissionsToClone.filter(p => !p.temporary);
            }

            // Clone direct permissions
            const cloneResults = {
                cloned: [],
                skipped: [],
                failed: []
            };

            for (const permission of permissionsToClone) {
                try {
                    // Check if target already has permission
                    const hasPermission = await this.checkUserPermission(
                        targetUserId,
                        permission.permissionCode
                    );

                    if (hasPermission) {
                        cloneResults.skipped.push(permission.permissionCode);
                        continue;
                    }

                    // Clone permission
                    await this.assignPermissionToUser(
                        targetUserId,
                        permission._id,
                        {
                            source: 'CLONED',
                            sourceUserId,
                            ...permission.assignmentData
                        },
                        clonedBy
                    );

                    cloneResults.cloned.push(permission.permissionCode);
                } catch (error) {
                    cloneResults.failed.push({
                        permissionCode: permission.permissionCode,
                        error: error.message
                    });
                }
            }

            // Clear target user cache
            await this.#clearUserPermissionCache(targetUserId);

            // Log audit
            await this.#logPermissionAudit('PERMISSIONS_CLONED', {
                sourceUserId,
                targetUserId,
                results: cloneResults,
                clonedBy
            });

            logger.info(`Permissions cloned: ${cloneResults.cloned.length} cloned, ${cloneResults.skipped.length} skipped`);

            return cloneResults;

        } catch (error) {
            logger.error('Error cloning permissions:', error);
            throw error;
        }
    }

    /**
     * Get permission statistics
     * @param {Object} filters - Statistics filters
     * @returns {Promise<Object>} Permission statistics
     */
    async getPermissionStatistics(filters = {}) {
        try {
            logger.debug('Generating permission statistics');

            const [
                totalPermissions,
                activePermissions,
                systemPermissions,
                customPermissions,
                categoryStats,
                usageStats,
                riskStats,
                assignmentStats
            ] = await Promise.all([
                UserPermission.countDocuments(filters),
                UserPermission.countDocuments({ ...filters, 'status.isActive': true }),
                UserPermission.countDocuments({ ...filters, 'status.isSystem': true }),
                UserPermission.countDocuments({ ...filters, 'status.isCustom': true }),
                this.#getCategoryStatistics(filters),
                this.#getUsageStatistics(filters),
                this.#getRiskStatistics(filters),
                this.#getAssignmentStatistics(filters)
            ]);

            return {
                summary: {
                    total: totalPermissions,
                    active: activePermissions,
                    system: systemPermissions,
                    custom: customPermissions,
                    inactive: totalPermissions - activePermissions
                },
                categories: categoryStats,
                usage: usageStats,
                risk: riskStats,
                assignments: assignmentStats,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Error generating permission statistics:', error);
            throw error;
        }
    }

    /**
     * Perform permission audit
     * @param {string} userId - User ID to audit
     * @param {Object} options - Audit options
     * @returns {Promise<Object>} Audit result
     */
    async auditUserPermissions(userId, options = {}) {
        try {
            logger.info(`Auditing permissions for user ${userId}`);

            const auditResult = {
                userId,
                timestamp: new Date(),
                findings: [],
                recommendations: [],
                risk: 'LOW'
            };

            // Get user permissions
            const userPermissions = await this.getUserPermissions(userId);

            // Check for excessive permissions
            if (userPermissions.effective.length > this.#maxPermissionsPerUser) {
                auditResult.findings.push({
                    type: 'EXCESSIVE_PERMISSIONS',
                    severity: 'HIGH',
                    message: `User has ${userPermissions.effective.length} permissions (limit: ${this.#maxPermissionsPerUser})`
                });
                auditResult.risk = 'HIGH';
            }

            // Check for high-risk permissions
            const highRiskPermissions = userPermissions.effective.filter(p => p.isHighRisk);
            if (highRiskPermissions.length > 0) {
                auditResult.findings.push({
                    type: 'HIGH_RISK_PERMISSIONS',
                    severity: 'MEDIUM',
                    message: `User has ${highRiskPermissions.length} high-risk permissions`,
                    permissions: highRiskPermissions.map(p => p.permissionCode)
                });
                if (auditResult.risk === 'LOW') auditResult.risk = 'MEDIUM';
            }

            // Check for conflicting permissions
            const conflicts = await this.#findPermissionConflicts(userPermissions.effective);
            if (conflicts.length > 0) {
                auditResult.findings.push({
                    type: 'CONFLICTING_PERMISSIONS',
                    severity: 'HIGH',
                    message: 'User has conflicting permissions',
                    conflicts
                });
                auditResult.risk = 'HIGH';
            }

            // Check for expired permissions
            const expiredPermissions = userPermissions.effective.filter(
                p => p.expiresAt && new Date(p.expiresAt) < new Date()
            );
            if (expiredPermissions.length > 0) {
                auditResult.findings.push({
                    type: 'EXPIRED_PERMISSIONS',
                    severity: 'MEDIUM',
                    message: `User has ${expiredPermissions.length} expired permissions`,
                    permissions: expiredPermissions.map(p => p.permissionCode)
                });
            }

            // Check for unused permissions
            const unusedPermissions = await this.#findUnusedPermissions(userId, options.days || 90);
            if (unusedPermissions.length > 0) {
                auditResult.recommendations.push({
                    type: 'REMOVE_UNUSED',
                    message: `Consider removing ${unusedPermissions.length} unused permissions`,
                    permissions: unusedPermissions
                });
            }

            // Check for missing dependencies
            const missingDependencies = await this.#findMissingDependencies(userPermissions.effective);
            if (missingDependencies.length > 0) {
                auditResult.findings.push({
                    type: 'MISSING_DEPENDENCIES',
                    severity: 'MEDIUM',
                    message: 'Some permissions have missing dependencies',
                    dependencies: missingDependencies
                });
            }

            // Generate recommendations
            if (userPermissions.temporary.length > 5) {
                auditResult.recommendations.push({
                    type: 'REVIEW_TEMPORARY',
                    message: 'Review and consolidate temporary permissions'
                });
            }

            // Log audit
            await this.#logPermissionAudit('USER_PERMISSIONS_AUDITED', {
                userId,
                auditResult
            });

            return auditResult;

        } catch (error) {
            logger.error('Error auditing user permissions:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */

    #initializeHierarchies() {
        // Initialize permission hierarchy
        this.#permissionHierarchy.set('*', ['**']);
        this.#permissionHierarchy.set('admin.*', ['admin.**']);
        this.#permissionHierarchy.set('user.*', ['user.**']);

        // Initialize role hierarchy
        this.#roleHierarchy.set('SUPER_ADMIN', ['ADMIN', 'MODERATOR', 'USER']);
        this.#roleHierarchy.set('ADMIN', ['MODERATOR', 'USER']);
        this.#roleHierarchy.set('MODERATOR', ['USER']);
    }

    async #validatePermissionData(data) {
        if (!data.permissionCode || !/^[A-Z][A-Z0-9_]{2,49}$/.test(data.permissionCode)) {
            throw new AppError('Invalid permission code format', 400);
        }

        if (!data.permissionName || data.permissionName.length < 3) {
            throw new AppError('Permission name must be at least 3 characters', 400);
        }

        if (!data.category || !data.module || !data.resource || !data.action) {
            throw new AppError('Missing required permission fields', 400);
        }

        return true;
    }

    async #validatePermissionDependencies(dependencies) {
        if (dependencies.requiredPermissions) {
            for (const req of dependencies.requiredPermissions) {
                const exists = await UserPermission.findOne({
                    permissionCode: req.permissionCode,
                    'status.isActive': true
                });

                if (!exists && req.mandatory) {
                    throw new AppError(`Required permission ${req.permissionCode} does not exist`, 400);
                }
            }
        }

        return true;
    }

    async #clearPermissionCaches() {
        const patterns = [
            `${this.#cachePrefix}permission:*`,
            `${this.#cachePrefix}user:*`,
            'permissions:stats:*'
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }

        // Clear evaluation cache
        this.#evaluationCache.clear();
    }

    async #clearUserPermissionCache(userId) {
        const patterns = [
            `${this.#cachePrefix}user:${userId}`,
            `${this.#cachePrefix}user:${userId}:*`
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }

        // Clear evaluation cache entries for user
        for (const [key] of this.#evaluationCache) {
            if (key.startsWith(userId)) {
                this.#evaluationCache.delete(key);
            }
        }
    }

    #buildPermissionQuery(filters) {
        const query = {};

        if (filters.category) {
            query.category = filters.category;
        }

        if (filters.module) {
            query.module = filters.module;
        }

        if (filters.resource) {
            query.resource = filters.resource;
        }

        if (filters.action) {
            query.action = filters.action;
        }

        if (filters.isActive !== undefined) {
            query['status.isActive'] = filters.isActive;
        }

        if (filters.isSystem !== undefined) {
            query['status.isSystem'] = filters.isSystem;
        }

        if (filters.riskLevel) {
            query['configuration.riskLevel'] = filters.riskLevel;
        }

        return query;
    }

    #buildPermissionSort(sortBy = 'permissionCode', sortOrder = 'asc') {
        const sortFields = {
            'permissionCode': 'permissionCode',
            'permissionName': 'permissionName',
            'category': 'category',
            'createdAt': 'auditLog.createdAt',
            'usage': 'usageTracking.totalAssignments'
        };

        const field = sortFields[sortBy] || 'permissionCode';
        const order = sortOrder === 'desc' ? -1 : 1;

        return { [field]: order };
    }

    #sanitizePermission(permission) {
        const sanitized = { ...permission };
        delete sanitized.auditLog?.modifications;
        delete sanitized.usageTracking?.assignments;
        delete sanitized.usageTracking?.revocations;
        return sanitized;
    }

    async #logPermissionAudit(action, data) {
        try {
            logger.audit({
                category: 'PERMISSIONS',
                action,
                timestamp: new Date(),
                data
            });
        } catch (error) {
            logger.error('Error logging permission audit:', error);
        }
    }

    #createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    #evaluatePermissionContext(permission, context) {
        // Time restrictions
        if (permission.configuration?.timeRestricted) {
            if (!this.#checkTimeRestrictions(permission.configuration.timeRestrictions)) {
                return false;
            }
        }

        // Location restrictions
        if (permission.configuration?.locationRestricted && context.location) {
            if (!this.#checkLocationRestrictions(permission.configuration.locationRestrictions, context.location)) {
                return false;
            }
        }

        // Resource restrictions
        if (permission.restrictions && context.resource) {
            if (!this.#checkResourceRestrictions(permission.restrictions, context.resource)) {
                return false;
            }
        }

        return true;
    }

    #checkTimeRestrictions(restrictions) {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = now.toTimeString().substr(0, 5);

        if (restrictions.daysOfWeek && !restrictions.daysOfWeek.includes(dayOfWeek)) {
            return false;
        }

        if (restrictions.startTime && restrictions.endTime) {
            return currentTime >= restrictions.startTime && currentTime <= restrictions.endTime;
        }

        return true;
    }

    #checkLocationRestrictions(restrictions, location) {
        if (restrictions.allowedCountries?.length > 0) {
            if (!restrictions.allowedCountries.includes(location.country)) {
                return false;
            }
        }

        if (restrictions.allowedRegions?.length > 0) {
            if (!restrictions.allowedRegions.includes(location.region)) {
                return false;
            }
        }

        return true;
    }

    #checkResourceRestrictions(restrictions, resource) {
        if (restrictions.allowedResources?.length > 0) {
            if (!restrictions.allowedResources.includes(resource)) {
                return false;
            }
        }

        if (restrictions.deniedResources?.length > 0) {
            if (restrictions.deniedResources.includes(resource)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Update permission hierarchy
     * @private
     */
    async #updatePermissionHierarchy(permission) {
        try {
            if (permission.dependencies?.hierarchyParent) {
                this.#permissionHierarchy.set(
                    permission.permissionCode,
                    permission.dependencies.hierarchyParent
                );
            }

            if (permission.dependencies?.hierarchyChildren) {
                permission.dependencies.hierarchyChildren.forEach(child => {
                    this.#permissionHierarchy.set(child, permission.permissionCode);
                });
            }

            logger.debug(`Permission hierarchy updated for ${permission.permissionCode}`);
        } catch (error) {
            logger.error('Error updating permission hierarchy:', error);
        }
    }

    /**
     * Get permission usage statistics
     * @private
     */
    async #getPermissionUsage(permissionId) {
        try {
            const permission = await UserPermission.findById(permissionId);
            if (!permission) return null;

            return {
                totalAssignments: permission.usageTracking?.totalAssignments || 0,
                activeAssignments: permission.usageTracking?.activeAssignments || 0,
                lastUsed: permission.usageTracking?.lastUsed,
                averageUsagePerDay: permission.usageTracking?.averageUsagePerDay || 0,
                peakUsagePeriod: permission.usageTracking?.peakUsagePeriod
            };
        } catch (error) {
            logger.error('Error getting permission usage:', error);
            return null;
        }
    }

    /**
     * Get permission assignments
     * @private
     */
    async #getPermissionAssignments(permissionId) {
        try {
            const permission = await UserPermission.findById(permissionId);
            if (!permission) return [];

            return permission.usageTracking?.assignments?.map(assignment => ({
                userId: assignment.userId,
                assignedAt: assignment.assignedAt,
                assignedBy: assignment.assignedBy,
                expiresAt: assignment.expiresAt,
                isActive: !assignment.expiresAt || assignment.expiresAt > new Date()
            })) || [];
        } catch (error) {
            logger.error('Error getting permission assignments:', error);
            return [];
        }
    }

    /**
     * Validate permission update
     * @private
     */
    async #validatePermissionUpdate(permission, updateData) {
        // Check if trying to update immutable fields
        const immutableFields = ['permissionCode', 'category', 'module'];
        const hasImmutableUpdates = immutableFields.some(field =>
            updateData.hasOwnProperty(field) && updateData[field] !== permission[field]
        );

        if (hasImmutableUpdates) {
            throw new AppError('Cannot update immutable permission fields', 400);
        }

        // Validate permission code format if being updated
        if (updateData.permissionCode && !/^[A-Z][A-Z0-9_]{2,49}$/.test(updateData.permissionCode)) {
            throw new AppError('Invalid permission code format', 400);
        }

        // Validate dependencies if being updated
        if (updateData.dependencies) {
            await this.#validatePermissionDependencies(updateData.dependencies);
        }

        return true;
    }

    /**
     * Notify about permission update
     * @private
     */
    async #notifyPermissionUpdate(permission, updateData) {
        try {
            // Get all users with this permission
            const assignments = await this.#getPermissionAssignments(permission._id);

            for (const assignment of assignments) {
                if (assignment.isActive) {
                    await this.#notificationService.send({
                        userId: assignment.userId,
                        type: 'PERMISSION_UPDATED',
                        title: 'Permission Updated',
                        message: `Your permission "${permission.permissionName}" has been updated`,
                        metadata: {
                            permissionCode: permission.permissionCode,
                            changes: updateData
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('Error sending permission update notifications:', error);
        }
    }

    /**
     * Get direct permissions for user
     * @private
     */
    async #getDirectPermissions(userId) {
        try {
            const permissions = await UserPermission.find({
                'usageTracking.assignments': {
                    $elemMatch: {
                        userId: userId,
                        $or: [
                            { expiresAt: null },
                            { expiresAt: { $gt: new Date() } }
                        ]
                    }
                },
                'status.isActive': true
            }).lean();

            return permissions.map(permission => ({
                ...permission,
                source: 'DIRECT',
                assignmentData: permission.usageTracking.assignments.find(
                    a => a.userId.equals(userId)
                )
            }));
        } catch (error) {
            logger.error('Error getting direct permissions:', error);
            return [];
        }
    }

    /**
     * Get role-based permissions for user
     * @private
     */
    async #getRoleBasedPermissions(userId) {
        try {
            const user = await User.findById(userId).populate('roles');
            if (!user || !user.roles || user.roles.length === 0) {
                return [];
            }

            const rolePermissions = [];

            for (const role of user.roles) {
                const permissions = await this.#getRolePermissions(role._id);
                permissions.forEach(permission => {
                    rolePermissions.push({
                        ...permission,
                        source: 'ROLE',
                        roleName: role.name,
                        roleId: role._id
                    });
                });
            }

            return rolePermissions;
        } catch (error) {
            logger.error('Error getting role-based permissions:', error);
            return [];
        }
    }

    /**
     * Get inherited permissions for user
     * @private
     */
    async #getInheritedPermissions(userId) {
        try {
            // Get user's organization hierarchy
            const user = await User.findById(userId).populate('organizations.organizationId');
            if (!user || !user.organizations || user.organizations.length === 0) {
                return [];
            }

            const inheritedPermissions = [];

            for (const orgMembership of user.organizations) {
                const organization = orgMembership.organizationId;

                // Get permissions inherited from organization
                if (organization.inheritedPermissions) {
                    for (const permissionId of organization.inheritedPermissions) {
                        const permission = await UserPermission.findById(permissionId);
                        if (permission && permission.status.isActive) {
                            inheritedPermissions.push({
                                ...permission.toObject(),
                                source: 'INHERITED',
                                organizationName: organization.name,
                                organizationId: organization._id
                            });
                        }
                    }
                }
            }

            return inheritedPermissions;
        } catch (error) {
            logger.error('Error getting inherited permissions:', error);
            return [];
        }
    }

    /**
     * Get temporary permissions for user
     * @private
     */
    async #getTemporaryPermissions(userId) {
        try {
            const permissions = await UserPermission.find({
                'usageTracking.assignments': {
                    $elemMatch: {
                        userId: userId,
                        expiresAt: { $gt: new Date() },
                        temporary: true
                    }
                },
                'status.isActive': true
            }).lean();

            return permissions.map(permission => {
                const assignment = permission.usageTracking.assignments.find(
                    a => a.userId.equals(userId) && a.temporary
                );

                return {
                    ...permission,
                    source: 'TEMPORARY',
                    expiresAt: assignment.expiresAt,
                    assignmentData: assignment
                };
            });
        } catch (error) {
            logger.error('Error getting temporary permissions:', error);
            return [];
        }
    }

    /**
     * Merge and deduplicate permissions
     * @private
     */
    #mergePermissions(permissionArrays) {
        const merged = permissionArrays.flat();
        const unique = new Map();

        merged.forEach(permission => {
            const key = permission.permissionCode;

            if (!unique.has(key)) {
                unique.set(key, permission);
            } else {
                // Keep the permission with higher precedence
                const existing = unique.get(key);
                const precedence = {
                    'DIRECT': 4,
                    'ROLE': 3,
                    'INHERITED': 2,
                    'TEMPORARY': 1
                };

                if (precedence[permission.source] > precedence[existing.source]) {
                    unique.set(key, permission);
                }
            }
        });

        return Array.from(unique.values());
    }

    /**
     * Build permission matrix
     * @private
     */
    #buildPermissionMatrix(permissions) {
        const matrix = {};

        permissions.forEach(permission => {
            const { category, module, resource, action } = permission;

            if (!matrix[category]) {
                matrix[category] = {};
            }

            if (!matrix[category][module]) {
                matrix[category][module] = {};
            }

            if (!matrix[category][module][resource]) {
                matrix[category][module][resource] = [];
            }

            matrix[category][module][resource].push({
                action,
                permissionCode: permission.permissionCode,
                source: permission.source,
                restrictions: permission.restrictions
            });
        });

        return matrix;
    }

    /**
     * Calculate effective permissions
     * @private
     */
    #calculateEffectivePermissions(permissions) {
        const effective = [];
        const processed = new Set();

        // Sort by precedence (DIRECT > ROLE > INHERITED > TEMPORARY)
        const sorted = permissions.sort((a, b) => {
            const precedence = { 'DIRECT': 4, 'ROLE': 3, 'INHERITED': 2, 'TEMPORARY': 1 };
            return precedence[b.source] - precedence[a.source];
        });

        sorted.forEach(permission => {
            const key = `${permission.category}:${permission.module}:${permission.resource}:${permission.action}`;

            if (!processed.has(key)) {
                effective.push(permission);
                processed.add(key);
            }
        });

        return effective;
    }

    /**
     * Group permissions by category
     * @private
     */
    #groupPermissionsByCategory(permissions) {
        const grouped = {};

        permissions.forEach(permission => {
            const category = permission.category || 'uncategorized';

            if (!grouped[category]) {
                grouped[category] = {
                    count: 0,
                    permissions: []
                };
            }

            grouped[category].count++;
            grouped[category].permissions.push(permission.permissionCode);
        });

        return grouped;
    }

    /**
     * Log access attempt
     * @private
     */
    async #logAccessAttempt(userId, permissionCode, hasPermission, context) {
        try {
            logger.audit({
                category: 'ACCESS_CONTROL',
                action: 'PERMISSION_CHECK',
                userId,
                permissionCode,
                result: hasPermission ? 'GRANTED' : 'DENIED',
                context,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Error logging access attempt:', error);
        }
    }

    /**
     * Check user eligibility for permission
     * @private
     */
    async #checkUserEligibility(user, permission) {
        // Check if user is active
        if (!user.isActive) {
            throw new AppError('User is not active', 403);
        }

        // Check if user account is locked
        if (user.security?.isLocked) {
            throw new AppError('User account is locked', 403);
        }

        // Check permission prerequisites
        if (permission.dependencies?.userPrerequisites) {
            for (const prerequisite of permission.dependencies.userPrerequisites) {
                switch (prerequisite.type) {
                    case 'MIN_ACCOUNT_AGE':
                        const accountAge = (new Date() - user.createdAt) / (1000 * 60 * 60 * 24);
                        if (accountAge < prerequisite.value) {
                            throw new AppError('User does not meet minimum account age requirement', 403);
                        }
                        break;

                    case 'EMAIL_VERIFIED':
                        if (!user.emailVerified) {
                            throw new AppError('Email verification required', 403);
                        }
                        break;

                    case 'TWO_FACTOR_ENABLED':
                        if (!user.twoFactorEnabled) {
                            throw new AppError('Two-factor authentication required', 403);
                        }
                        break;
                }
            }
        }

        return true;
    }

    /**
     * Check for permission conflicts
     * @private
     */
    async #checkPermissionConflicts(userId, permission) {
        if (!permission.configuration?.conflictingPermissions) {
            return true;
        }

        const userPermissions = await this.getUserPermissions(userId);
        const conflictingCodes = permission.configuration.conflictingPermissions;

        const hasConflict = userPermissions.effective.some(p =>
            conflictingCodes.includes(p.permissionCode)
        );

        if (hasConflict) {
            throw new AppError('Permission conflicts with existing user permissions', 409);
        }

        return true;
    }

    /**
     * Check permission dependencies
     * @private
     */
    async #checkPermissionDependencies(userId, permission) {
        if (!permission.dependencies?.requiredPermissions) {
            return true;
        }

        const userPermissions = await this.getUserPermissions(userId);
        const userPermissionCodes = userPermissions.effective.map(p => p.permissionCode);

        for (const required of permission.dependencies.requiredPermissions) {
            if (required.mandatory && !userPermissionCodes.includes(required.permissionCode)) {
                throw new AppError(`Required permission missing: ${required.permissionCode}`, 400);
            }
        }

        return true;
    }

    /**
     * Send permission assignment notification
     * @private
     */
    async #sendPermissionAssignmentNotification(user, permission, assignedBy) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'PERMISSION_ASSIGNED',
                title: 'New Permission Granted',
                message: `You have been granted the permission: ${permission.permissionName}`,
                metadata: {
                    permissionCode: permission.permissionCode,
                    assignedBy,
                    assignedAt: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending permission assignment notification:', error);
        }
    }

    /**
     * Handle dependent permissions
     * @private
     */
    async #handleDependentPermissions(userId, revokedPermission) {
        try {
            // Find permissions that depend on the revoked permission
            const dependentPermissions = await UserPermission.find({
                'dependencies.requiredPermissions': {
                    $elemMatch: {
                        permissionCode: revokedPermission.permissionCode,
                        mandatory: true
                    }
                }
            });

            const userPermissions = await this.getUserPermissions(userId);
            const userPermissionCodes = userPermissions.effective.map(p => p.permissionCode);

            for (const dependent of dependentPermissions) {
                if (userPermissionCodes.includes(dependent.permissionCode)) {
                    logger.warn(`Revoking dependent permission: ${dependent.permissionCode}`);
                    await this.revokePermissionFromUser(userId, dependent._id, {
                        reason: 'Dependency revoked',
                        cascade: true
                    }, 'system');
                }
            }
        } catch (error) {
            logger.error('Error handling dependent permissions:', error);
        }
    }

    /**
     * Send permission revocation notification
     * @private
     */
    async #sendPermissionRevocationNotification(user, permission, revokedBy) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'PERMISSION_REVOKED',
                title: 'Permission Revoked',
                message: `Your permission "${permission.permissionName}" has been revoked`,
                metadata: {
                    permissionCode: permission.permissionCode,
                    revokedBy,
                    revokedAt: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending permission revocation notification:', error);
        }
    }

    /**
     * Check for role conflicts
     * @private
     */
    async #checkRoleConflicts(user, role) {
        if (!role.configuration?.conflictingRoles) {
            return true;
        }

        const userRoles = user.roles || [];
        const conflictingRoleIds = role.configuration.conflictingRoles;

        const hasConflict = userRoles.some(userRoleId =>
            conflictingRoleIds.includes(userRoleId.toString())
        );

        if (hasConflict) {
            throw new AppError('Role conflicts with existing user roles', 409);
        }

        return true;
    }

    /**
     * Check role prerequisites
     * @private
     */
    async #checkRolePrerequisites(user, role) {
        if (!role.prerequisites?.requiredRoles) {
            return true;
        }

        const userRoles = user.roles || [];
        const requiredRoleIds = role.prerequisites.requiredRoles;

        const hasAllRequired = requiredRoleIds.every(requiredId =>
            userRoles.some(userRoleId => userRoleId.equals(requiredId))
        );

        if (!hasAllRequired) {
            throw new AppError('User does not have required prerequisite roles', 400);
        }

        return true;
    }

    /**
     * Get permissions for a role
     * @private
     */
    async #getRolePermissions(roleId) {
        try {
            const role = await Role.findById(roleId).populate('permissions');
            return role?.permissions || [];
        } catch (error) {
            logger.error('Error getting role permissions:', error);
            return [];
        }
    }

    /**
     * Send role grant notification
     * @private
     */
    async #sendRoleGrantNotification(user, role, grantedBy) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'ROLE_GRANTED',
                title: 'New Role Assigned',
                message: `You have been assigned the role: ${role.name}`,
                metadata: {
                    roleName: role.name,
                    roleId: role._id,
                    grantedBy,
                    grantedAt: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending role grant notification:', error);
        }
    }

    /**
     * Check if permission is granted from other sources
     * @private
     */
    async #checkPermissionOtherSources(userId, permissionId, excludeRoleId) {
        try {
            const userPermissions = await this.getUserPermissions(userId);

            return userPermissions.effective.some(permission => {
                if (permission._id.equals(permissionId)) {
                    // Check if permission comes from sources other than the excluded role
                    return permission.source === 'DIRECT' ||
                        permission.source === 'INHERITED' ||
                        (permission.source === 'ROLE' && !permission.roleId.equals(excludeRoleId));
                }
                return false;
            });
        } catch (error) {
            logger.error('Error checking permission other sources:', error);
            return false;
        }
    }

    /**
     * Send role revocation notification
     * @private
     */
    async #sendRoleRevocationNotification(user, role, revokedBy) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'ROLE_REVOKED',
                title: 'Role Revoked',
                message: `Your role "${role.name}" has been revoked`,
                metadata: {
                    roleName: role.name,
                    roleId: role._id,
                    revokedBy,
                    revokedAt: new Date()
                }
            });
        } catch (error) {
            logger.error('Error sending role revocation notification:', error);
        }
    }

    /**
     * Get category statistics
     * @private
     */
    async #getCategoryStatistics(filters) {
        try {
            const pipeline = [
                { $match: filters },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 },
                        activeCount: {
                            $sum: { $cond: ['$status.isActive', 1, 0] }
                        },
                        systemCount: {
                            $sum: { $cond: ['$status.isSystem', 1, 0] }
                        }
                    }
                },
                { $sort: { count: -1 } }
            ];

            const stats = await UserPermission.aggregate(pipeline);
            return stats.reduce((acc, stat) => {
                acc[stat._id] = {
                    total: stat.count,
                    active: stat.activeCount,
                    system: stat.systemCount
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error calculating category statistics:', error);
            return {};
        }
    }

    /**
     * Get usage statistics
     * @private
     */
    async #getUsageStatistics(filters) {
        try {
            const pipeline = [
                { $match: filters },
                {
                    $group: {
                        _id: null,
                        totalAssignments: { $sum: '$usageTracking.totalAssignments' },
                        activeAssignments: { $sum: '$usageTracking.activeAssignments' },
                        avgUsagePerPermission: { $avg: '$usageTracking.totalAssignments' },
                        mostUsedPermissions: {
                            $push: {
                                permissionCode: '$permissionCode',
                                usage: '$usageTracking.totalAssignments'
                            }
                        }
                    }
                }
            ];

            const stats = await UserPermission.aggregate(pipeline);
            const result = stats[0] || {};

            // Sort and limit most used permissions
            if (result.mostUsedPermissions) {
                result.mostUsedPermissions = result.mostUsedPermissions
                    .sort((a, b) => b.usage - a.usage)
                    .slice(0, 10);
            }

            return result;
        } catch (error) {
            logger.error('Error calculating usage statistics:', error);
            return {};
        }
    }

    /**
     * Get risk statistics
     * @private
     */
    async #getRiskStatistics(filters) {
        try {
            const pipeline = [
                { $match: filters },
                {
                    $group: {
                        _id: '$configuration.riskLevel',
                        count: { $sum: 1 },
                        activeCount: {
                            $sum: { $cond: ['$status.isActive', 1, 0] }
                        }
                    }
                }
            ];

            const stats = await UserPermission.aggregate(pipeline);
            return stats.reduce((acc, stat) => {
                const riskLevel = stat._id || 'UNKNOWN';
                acc[riskLevel] = {
                    total: stat.count,
                    active: stat.activeCount
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error calculating risk statistics:', error);
            return {};
        }
    }

    /**
     * Get assignment statistics
     * @private
     */
    async #getAssignmentStatistics(filters) {
        try {
            const pipeline = [
                { $match: filters },
                { $unwind: '$usageTracking.assignments' },
                {
                    $group: {
                        _id: {
                            year: { $year: '$usageTracking.assignments.assignedAt' },
                            month: { $month: '$usageTracking.assignments.assignedAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } },
                { $limit: 12 }
            ];

            const stats = await UserPermission.aggregate(pipeline);
            return stats.map(stat => ({
                year: stat._id.year,
                month: stat._id.month,
                assignments: stat.count
            }));
        } catch (error) {
            logger.error('Error calculating assignment statistics:', error);
            return [];
        }
    }

    /**
     * Find permission conflicts
     * @private
     */
    async #findPermissionConflicts(permissions) {
        const conflicts = [];

        for (let i = 0; i < permissions.length; i++) {
            const permission = permissions[i];

            if (permission.configuration?.conflictingPermissions) {
                const conflictingCodes = permission.configuration.conflictingPermissions;

                for (let j = i + 1; j < permissions.length; j++) {
                    const otherPermission = permissions[j];

                    if (conflictingCodes.includes(otherPermission.permissionCode)) {
                        conflicts.push({
                            permission1: permission.permissionCode,
                            permission2: otherPermission.permissionCode,
                            type: 'CONFIGURATION_CONFLICT'
                        });
                    }
                }
            }

            // Check for business logic conflicts
            if (permission.resource === 'USER' && permission.action === 'DELETE') {
                const hasCreateUserPermission = permissions.some(p =>
                    p.resource === 'USER' && p.action === 'CREATE'
                );

                if (hasCreateUserPermission) {
                    conflicts.push({
                        permission1: permission.permissionCode,
                        permission2: 'USER_CREATE',
                        type: 'BUSINESS_LOGIC_CONFLICT',
                        description: 'User with DELETE permission should not have CREATE permission'
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Find unused permissions
     * @private
     */
    async #findUnusedPermissions(userId, days = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const userPermissions = await this.getUserPermissions(userId);
            const unusedPermissions = [];

            for (const permission of userPermissions.effective) {
                const lastUsed = permission.usageTracking?.lastUsed;

                if (!lastUsed || new Date(lastUsed) < cutoffDate) {
                    unusedPermissions.push({
                        permissionCode: permission.permissionCode,
                        lastUsed: lastUsed,
                        daysSinceLastUse: lastUsed
                            ? Math.floor((new Date() - new Date(lastUsed)) / (1000 * 60 * 60 * 24))
                            : null
                    });
                }
            }

            return unusedPermissions;
        } catch (error) {
            logger.error('Error finding unused permissions:', error);
            return [];
        }
    }

    /**
     * Find missing dependencies
     * @private
     */
    async #findMissingDependencies(permissions) {
        const missingDependencies = [];
        const permissionCodes = permissions.map(p => p.permissionCode);

        for (const permission of permissions) {
            if (permission.dependencies?.requiredPermissions) {
                for (const required of permission.dependencies.requiredPermissions) {
                    if (required.mandatory && !permissionCodes.includes(required.permissionCode)) {
                        missingDependencies.push({
                            permission: permission.permissionCode,
                            missingDependency: required.permissionCode,
                            mandatory: required.mandatory
                        });
                    }
                }
            }
        }

        return missingDependencies;
    }
}

// Export singleton instance
module.exports = new UserPermissionsService();