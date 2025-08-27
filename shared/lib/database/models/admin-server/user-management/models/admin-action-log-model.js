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
          await this.#updatePermissions(adminUser, updateData, updatedBy);
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
   * Private helper methods
   */
  
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
}

// Export singleton instance
module.exports = new AdminUserService();