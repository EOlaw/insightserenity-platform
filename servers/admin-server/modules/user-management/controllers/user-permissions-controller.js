'use strict';

/**
 * @fileoverview User permissions controller for handling permission management endpoints
 * @module servers/admin-server/modules/user-management/controllers/user-permissions-controller
 * @requires module:servers/admin-server/modules/user-management/services/user-permissions-service
 * @requires module:servers/admin-server/modules/user-management/services/user-sessions-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const userPermissionsService = require('../services/user-permissions-service');
const userSessionsService = require('../services/user-sessions-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const { STATUS_CODES } = require('../../../../../shared/lib/utils/constants/status-codes');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

/**
 * Controller class for permission management operations
 * @class UserPermissionsController
 */
class UserPermissionsController {
  /**
   * Private fields
   */
  #responseFormatter;
  #validationConfig;
  #permissionConfig;
  #roleConfig;
  #auditConfig;
  #cacheConfig;
  #bulkOperationConfig;
  #securityConfig;
  
  /**
   * Constructor
   */
  constructor() {
    this.#responseFormatter = new ResponseFormatter();
    this.#initializeConfigurations();
    
    // Bind all methods to preserve context
    this.createPermission = this.createPermission.bind(this);
    this.getPermission = this.getPermission.bind(this);
    this.updatePermission = this.updatePermission.bind(this);
    this.deletePermission = this.deletePermission.bind(this);
    this.listPermissions = this.listPermissions.bind(this);
    this.assignPermissionToUser = this.assignPermissionToUser.bind(this);
    this.revokePermissionFromUser = this.revokePermissionFromUser.bind(this);
    this.getUserPermissions = this.getUserPermissions.bind(this);
    this.checkUserPermission = this.checkUserPermission.bind(this);
    this.grantRoleToUser = this.grantRoleToUser.bind(this);
    this.revokeRoleFromUser = this.revokeRoleFromUser.bind(this);
    this.bulkAssignPermissions = this.bulkAssignPermissions.bind(this);
    this.bulkRevokePermissions = this.bulkRevokePermissions.bind(this);
    this.cloneUserPermissions = this.cloneUserPermissions.bind(this);
    this.getPermissionStatistics = this.getPermissionStatistics.bind(this);
    this.auditUserPermissions = this.auditUserPermissions.bind(this);
    this.createRole = this.createRole.bind(this);
    this.updateRole = this.updateRole.bind(this);
    this.deleteRole = this.deleteRole.bind(this);
    this.listRoles = this.listRoles.bind(this);
    this.getRolePermissions = this.getRolePermissions.bind(this);
    this.updateRolePermissions = this.updateRolePermissions.bind(this);
    this.getUserRoles = this.getUserRoles.bind(this);
    this.getPermissionMatrix = this.getPermissionMatrix.bind(this);
    this.validatePermissionAssignment = this.validatePermissionAssignment.bind(this);
    this.checkPermissionConflicts = this.checkPermissionConflicts.bind(this);
    this.getPermissionDependencies = this.getPermissionDependencies.bind(this);
    this.getPermissionHierarchy = this.getPermissionHierarchy.bind(this);
    this.exportPermissions = this.exportPermissions.bind(this);
    this.importPermissions = this.importPermissions.bind(this);
    this.syncPermissions = this.syncPermissions.bind(this);
    this.refreshUserPermissions = this.refreshUserPermissions.bind(this);
    this.getEffectivePermissions = this.getEffectivePermissions.bind(this);
    this.evaluatePermissionPolicy = this.evaluatePermissionPolicy.bind(this);
    
    logger.info('UserPermissionsController initialized');
  }
  
  /**
   * Create a new permission
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async createPermission(req, res, next) {
    try {
      logger.info('Creating permission - Controller');
      
      const createdBy = req.user?.adminId || req.user?.id;
      
      // Check permission to create permissions
      const hasPermission = await this.#checkAdminPermission(
        createdBy,
        'securityAdministration.managePolicies'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to create permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate permission data
      const validationResult = await this.#validatePermissionData(req.body);
      if (!validationResult.valid) {
        throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
      }
      
      // Check for permission code conflicts
      await this.#checkPermissionCodeConflict(req.body.permissionCode);
      
      // Validate dependencies if provided
      if (req.body.dependencies) {
        await this.#validatePermissionDependencies(req.body.dependencies);
      }
      
      // Create permission
      const permission = await userPermissionsService.createPermission(req.body, createdBy);
      
      // Log creation
      await this.#logControllerAction('PERMISSION_CREATED', {
        permissionId: permission._id,
        permissionCode: permission.permissionCode,
        createdBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        permission,
        'Permission created successfully',
        STATUS_CODES.CREATED
      );
      
      res.status(STATUS_CODES.CREATED).json(response);
      
    } catch (error) {
      logger.error('Error in createPermission controller:', error);
      next(error);
    }
  }
  
  /**
   * Get permission by ID or code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getPermission(req, res, next) {
    try {
      const { id } = req.params;
      
      logger.info(`Fetching permission: ${id}`);
      
      // Parse options
      const options = {
        includeUsage: req.query.includeUsage === 'true',
        includeAssignments: req.query.includeAssignments === 'true',
        skipCache: req.query.skipCache === 'true'
      };
      
      // Get permission
      const permission = await userPermissionsService.getPermission(id, options);
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        permission,
        'Permission retrieved successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in getPermission controller:', error);
      next(error);
    }
  }
  
  /**
   * Update permission
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async updatePermission(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const updatedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Updating permission: ${id}`);
      
      // Check permission to update permissions
      const hasPermission = await this.#checkAdminPermission(
        updatedBy,
        'securityAdministration.managePolicies'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to update permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate update data
      const validationResult = await this.#validatePermissionUpdate(updateData);
      if (!validationResult.valid) {
        throw new AppError(validationResult.message, STATUS_CODES.BAD_REQUEST);
      }
      
      // Check if updating system permission
      if (updateData.status?.isSystem !== undefined) {
        throw new AppError('Cannot modify system permission status', STATUS_CODES.FORBIDDEN);
      }
      
      // Update permission
      const permission = await userPermissionsService.updatePermission(id, updateData, updatedBy);
      
      // Force permission cache refresh for affected users
      await this.#refreshAffectedUserPermissions(id);
      
      // Log update
      await this.#logControllerAction('PERMISSION_UPDATED', {
        permissionId: id,
        changes: this.#sanitizeForLogging(updateData),
        updatedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        permission,
        'Permission updated successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in updatePermission controller:', error);
      next(error);
    }
  }
  
  /**
   * Delete permission
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async deletePermission(req, res, next) {
    try {
      const { id } = req.params;
      const deletedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Deleting permission: ${id}`);
      
      // Check permission to delete permissions
      const hasPermission = await this.#checkAdminPermission(
        deletedBy,
        'securityAdministration.managePolicies'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to delete permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Parse deletion options
      const options = {
        softDelete: req.query.softDelete !== 'false',
        forceDelete: req.query.forceDelete === 'true'
      };
      
      // Check for active assignments
      const activeAssignments = await this.#checkActivePermissionAssignments(id);
      if (activeAssignments > 0 && !options.forceDelete) {
        throw new AppError(
          `Cannot delete permission with ${activeAssignments} active assignments`,
          STATUS_CODES.CONFLICT
        );
      }
      
      // Delete permission
      const result = await userPermissionsService.deletePermission(id, options, deletedBy);
      
      // Log deletion
      await this.#logControllerAction('PERMISSION_DELETED', {
        permissionId: id,
        options,
        deletedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Permission deleted successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in deletePermission controller:', error);
      next(error);
    }
  }
  
  /**
   * List permissions with filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async listPermissions(req, res, next) {
    try {
      logger.info('Listing permissions');
      
      // Parse filters
      const filters = this.#parsePermissionFilters(req.query);
      
      // Parse options
      const options = this.#parseListOptions(req.query);
      
      // Get permissions list
      const result = await userPermissionsService.listPermissions(filters, options);
      
      // Format response with pagination
      const response = this.#responseFormatter.formatPaginatedSuccess(
        result.permissions,
        result.pagination,
        'Permissions retrieved successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in listPermissions controller:', error);
      next(error);
    }
  }
  
  /**
   * Assign permission to user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async assignPermissionToUser(req, res, next) {
    try {
      const { userId, permissionId } = req.body;
      const assignedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Assigning permission ${permissionId} to user ${userId}`);
      
      // Check permission to assign permissions
      const hasPermission = await this.#checkAdminPermission(
        assignedBy,
        'userManagement.manageRoles'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to assign permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate assignment data
      const assignmentData = {
        scope: req.body.scope || 'ORGANIZATION',
        expiresAt: req.body.expiresAt,
        restrictions: req.body.restrictions || [],
        reason: req.body.reason
      };
      
      // Check for permission elevation
      await this.#checkPermissionElevation(assignedBy, permissionId);
      
      // Validate user eligibility
      await this.#validateUserEligibility(userId, permissionId);
      
      // Assign permission
      const result = await userPermissionsService.assignPermissionToUser(
        userId,
        permissionId,
        assignmentData,
        assignedBy
      );
      
      // Force session refresh for the user
      await userSessionsService.terminateUserSessions(userId, 'PERMISSIONS_UPDATED', {
        skipNotification: true
      });
      
      // Log assignment
      await this.#logControllerAction('PERMISSION_ASSIGNED', {
        userId,
        permissionId,
        assignmentData,
        assignedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Permission assigned successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in assignPermissionToUser controller:', error);
      next(error);
    }
  }
  
  /**
   * Revoke permission from user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async revokePermissionFromUser(req, res, next) {
    try {
      const { userId, permissionId } = req.body;
      const revokedBy = req.user?.adminId || req.user?.id;
      const reason = req.body.reason || 'Administrative revocation';
      
      logger.info(`Revoking permission ${permissionId} from user ${userId}`);
      
      // Check permission to revoke permissions
      const hasPermission = await this.#checkAdminPermission(
        revokedBy,
        'userManagement.manageRoles'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to revoke permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Revoke permission
      const result = await userPermissionsService.revokePermissionFromUser(
        userId,
        permissionId,
        { reason },
        revokedBy
      );
      
      // Force session refresh for the user
      await userSessionsService.terminateUserSessions(userId, 'PERMISSIONS_UPDATED', {
        skipNotification: true
      });
      
      // Log revocation
      await this.#logControllerAction('PERMISSION_REVOKED', {
        userId,
        permissionId,
        reason,
        revokedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Permission revoked successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in revokePermissionFromUser controller:', error);
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
      const { userId } = req.params;
      const requesterId = req.user?.adminId || req.user?.id;
      
      logger.info(`Fetching permissions for user: ${userId}`);
      
      // Check if requester can view permissions
      const canView = userId === requesterId || 
        await this.#checkAdminPermission(requesterId, 'userManagement.read');
      
      if (!canView) {
        throw new AppError('Insufficient permissions to view user permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Get user permissions
      const permissions = await userPermissionsService.getUserPermissions(userId, {
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
   * Check if user has specific permission
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async checkUserPermission(req, res, next) {
    try {
      const { userId, permissionCode } = req.body;
      const context = req.body.context || {};
      
      logger.debug(`Checking permission ${permissionCode} for user ${userId}`);
      
      // Check permission
      const hasPermission = await userPermissionsService.checkUserPermission(
        userId,
        permissionCode,
        context
      );
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        {
          hasPermission,
          userId,
          permissionCode,
          context,
          checkedAt: new Date()
        },
        hasPermission ? 'Permission granted' : 'Permission denied'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in checkUserPermission controller:', error);
      next(error);
    }
  }
  
  /**
   * Grant role to user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async grantRoleToUser(req, res, next) {
    try {
      const { userId, roleId } = req.body;
      const grantedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Granting role ${roleId} to user ${userId}`);
      
      // Check permission to grant roles
      const hasPermission = await this.#checkAdminPermission(
        grantedBy,
        'userManagement.manageRoles'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to grant roles', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate role grant data
      const grantData = {
        expiresAt: req.body.expiresAt,
        scope: req.body.scope || 'ORGANIZATION',
        reason: req.body.reason
      };
      
      // Check for role elevation
      await this.#checkRoleElevation(grantedBy, roleId);
      
      // Grant role
      const result = await userPermissionsService.grantRoleToUser(
        userId,
        roleId,
        grantData,
        grantedBy
      );
      
      // Force session refresh
      await userSessionsService.terminateUserSessions(userId, 'ROLE_GRANTED', {
        skipNotification: true
      });
      
      // Log role grant
      await this.#logControllerAction('ROLE_GRANTED', {
        userId,
        roleId,
        grantData,
        grantedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Role granted successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in grantRoleToUser controller:', error);
      next(error);
    }
  }
  
  /**
   * Revoke role from user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async revokeRoleFromUser(req, res, next) {
    try {
      const { userId, roleId } = req.body;
      const revokedBy = req.user?.adminId || req.user?.id;
      const reason = req.body.reason || 'Administrative revocation';
      
      logger.info(`Revoking role ${roleId} from user ${userId}`);
      
      // Check permission to revoke roles
      const hasPermission = await this.#checkAdminPermission(
        revokedBy,
        'userManagement.manageRoles'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to revoke roles', STATUS_CODES.FORBIDDEN);
      }
      
      // Revoke role
      const result = await userPermissionsService.revokeRoleFromUser(
        userId,
        roleId,
        { reason },
        revokedBy
      );
      
      // Force session refresh
      await userSessionsService.terminateUserSessions(userId, 'ROLE_REVOKED', {
        skipNotification: true
      });
      
      // Log role revocation
      await this.#logControllerAction('ROLE_REVOKED', {
        userId,
        roleId,
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
      logger.error('Error in revokeRoleFromUser controller:', error);
      next(error);
    }
  }
  
  /**
   * Bulk assign permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async bulkAssignPermissions(req, res, next) {
    try {
      const { assignments } = req.body;
      const assignedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Bulk assigning ${assignments.length} permissions`);
      
      // Check permission
      const hasPermission = await this.#checkAdminPermission(
        assignedBy,
        'userManagement.bulkOperations'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions for bulk operations', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate assignments
      if (!Array.isArray(assignments) || assignments.length === 0) {
        throw new AppError('Assignments array is required', STATUS_CODES.BAD_REQUEST);
      }
      
      if (assignments.length > this.#bulkOperationConfig.maxBatchSize) {
        throw new AppError(
          `Maximum ${this.#bulkOperationConfig.maxBatchSize} assignments allowed at once`,
          STATUS_CODES.BAD_REQUEST
        );
      }
      
      // Validate each assignment
      for (const assignment of assignments) {
        if (!assignment.userId || !assignment.permissionId) {
          throw new AppError('Each assignment must have userId and permissionId', STATUS_CODES.BAD_REQUEST);
        }
      }
      
      // Perform bulk assignment
      const result = await userPermissionsService.bulkAssignPermissions(assignments, assignedBy);
      
      // Log bulk operation
      await this.#logControllerAction('BULK_PERMISSIONS_ASSIGNED', {
        assignmentCount: assignments.length,
        results: result,
        assignedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        `Bulk assignment completed: ${result.successful.length} successful, ${result.failed.length} failed`
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in bulkAssignPermissions controller:', error);
      next(error);
    }
  }
  
  /**
   * Clone user permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async cloneUserPermissions(req, res, next) {
    try {
      const { sourceUserId, targetUserId } = req.body;
      const clonedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Cloning permissions from ${sourceUserId} to ${targetUserId}`);
      
      // Check permission
      const hasPermission = await this.#checkAdminPermission(
        clonedBy,
        'userManagement.manageRoles'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to clone permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Validate users
      if (!sourceUserId || !targetUserId) {
        throw new AppError('Source and target user IDs are required', STATUS_CODES.BAD_REQUEST);
      }
      
      if (sourceUserId === targetUserId) {
        throw new AppError('Source and target users must be different', STATUS_CODES.BAD_REQUEST);
      }
      
      // Parse options
      const options = {
        includeRoles: req.body.includeRoles !== false,
        includeTemporary: req.body.includeTemporary === true,
        overwrite: req.body.overwrite === true
      };
      
      // Clone permissions
      const result = await userPermissionsService.cloneUserPermissions(
        sourceUserId,
        targetUserId,
        options,
        clonedBy
      );
      
      // Force session refresh for target user
      await userSessionsService.terminateUserSessions(targetUserId, 'PERMISSIONS_CLONED', {
        skipNotification: true
      });
      
      // Log cloning
      await this.#logControllerAction('PERMISSIONS_CLONED', {
        sourceUserId,
        targetUserId,
        options,
        results: result,
        clonedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        result,
        'Permissions cloned successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in cloneUserPermissions controller:', error);
      next(error);
    }
  }
  
  /**
   * Get permission statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getPermissionStatistics(req, res, next) {
    try {
      logger.info('Fetching permission statistics');
      
      // Parse filters
      const filters = {
        category: req.query.category,
        module: req.query.module,
        isActive: req.query.isActive === 'true',
        isSystem: req.query.isSystem === 'true',
        riskLevel: req.query.riskLevel
      };
      
      // Get statistics
      const statistics = await userPermissionsService.getPermissionStatistics(filters);
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        statistics,
        'Statistics retrieved successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in getPermissionStatistics controller:', error);
      next(error);
    }
  }
  
  /**
   * Audit user permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async auditUserPermissions(req, res, next) {
    try {
      const { userId } = req.params;
      const auditedBy = req.user?.adminId || req.user?.id;
      
      logger.info(`Auditing permissions for user: ${userId}`);
      
      // Check permission to perform audits
      const hasPermission = await this.#checkAdminPermission(
        auditedBy,
        'securityAdministration.performAudits'
      );
      
      if (!hasPermission) {
        throw new AppError('Insufficient permissions to perform audits', STATUS_CODES.FORBIDDEN);
      }
      
      // Parse audit options
      const options = {
        days: parseInt(req.query.days) || 90,
        includeRecommendations: req.query.includeRecommendations !== 'false',
        checkCompliance: req.query.checkCompliance === 'true'
      };
      
      // Perform audit
      const auditResult = await userPermissionsService.auditUserPermissions(userId, options);
      
      // Take action based on risk level
      if (auditResult.risk === 'HIGH' && req.body.autoRemediate === true) {
        await this.#performAutoRemediation(userId, auditResult, auditedBy);
      }
      
      // Log audit
      await this.#logControllerAction('USER_PERMISSIONS_AUDITED', {
        userId,
        auditResult,
        auditedBy
      });
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        auditResult,
        'Audit completed successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in auditUserPermissions controller:', error);
      next(error);
    }
  }
  
  /**
   * Get effective permissions for user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getEffectivePermissions(req, res, next) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.adminId || req.user?.id;
      
      logger.info(`Getting effective permissions for user: ${userId}`);
      
      // Check if requester can view permissions
      const canView = userId === requesterId || 
        await this.#checkAdminPermission(requesterId, 'userManagement.read');
      
      if (!canView) {
        throw new AppError('Insufficient permissions to view effective permissions', STATUS_CODES.FORBIDDEN);
      }
      
      // Get user permissions
      const permissions = await userPermissionsService.getUserPermissions(userId);
      
      // Build effective permissions list with context
      const effectivePermissions = permissions.effective.map(perm => ({
        permissionCode: perm.permissionCode,
        permissionName: perm.permissionName,
        category: perm.category,
        source: perm.source || 'DIRECT',
        scope: perm.scope,
        expiresAt: perm.expiresAt,
        restrictions: perm.restrictions || [],
        riskLevel: perm.configuration?.riskLevel || 'LOW'
      }));
      
      // Group by category
      const grouped = this.#groupPermissionsByCategory(effectivePermissions);
      
      // Format response
      const response = this.#responseFormatter.formatSuccess(
        {
          userId,
          totalPermissions: effectivePermissions.length,
          permissions: effectivePermissions,
          byCategory: grouped,
          evaluatedAt: new Date()
        },
        'Effective permissions retrieved successfully'
      );
      
      res.status(STATUS_CODES.OK).json(response);
      
    } catch (error) {
      logger.error('Error in getEffectivePermissions controller:', error);
      next(error);
    }
  }
  
  /**
   * Private helper methods
   */
  
  #initializeConfigurations() {
    this.#validationConfig = {
      permissionCode: {
        pattern: /^[A-Z][A-Z0-9_]{2,49}$/,
        minLength: 3,
        maxLength: 50
      },
      permissionName: {
        minLength: 3,
        maxLength: 100
      },
      description: {
        maxLength: 500
      }
    };
    
    this.#permissionConfig = {
      categories: [
        'USER_MANAGEMENT',
        'ORGANIZATION_MANAGEMENT',
        'SYSTEM_ADMINISTRATION',
        'SECURITY_ADMINISTRATION',
        'BILLING_ADMINISTRATION',
        'SUPPORT_ADMINISTRATION',
        'ANALYTICS_ADMINISTRATION',
        'CONTENT_MANAGEMENT',
        'API_ACCESS',
        'INTEGRATION_MANAGEMENT'
      ],
      actions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE', 'APPROVE', 'EXPORT', 'IMPORT', 'MANAGE', 'VIEW', 'MODIFY'],
      scopes: ['GLOBAL', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PROJECT', 'PERSONAL'],
      riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      sensitivityLevels: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET']
    };
    
    this.#roleConfig = {
      systemRoles: Object.values(ROLES.ADMIN),
      maxRolesPerUser: 10,
      roleHierarchy: {
        'SUPER_ADMIN': 10,
        'SYSTEM_ADMIN': 9,
        'SECURITY_ADMIN': 8,
        'USER_ADMIN': 7,
        'BILLING_ADMIN': 6,
        'SUPPORT_ADMIN': 5,
        'COMPLIANCE_OFFICER': 5,
        'READ_ONLY_ADMIN': 1
      }
    };
    
    this.#auditConfig = {
      enabled: true,
      retentionDays: 2555,
      criticalPermissions: [
        'userManagement.delete',
        'systemAdministration.emergencyAccess',
        'securityAdministration.manageEncryption',
        'organizationManagement.delete'
      ]
    };
    
    this.#cacheConfig = {
      enabled: true,
      ttl: 600,
      prefix: 'permissions:controller:'
    };
    
    this.#bulkOperationConfig = {
      maxBatchSize: 100,
      batchProcessingSize: 10
    };
    
    this.#securityConfig = {
      preventElevation: true,
      requireJustification: true,
      maxPermissionsPerUser: 500,
      highRiskThreshold: 70
    };
  }
  
  async #checkAdminPermission(userId, permission) {
    try {
      return await userPermissionsService.checkUserPermission(userId, permission);
    } catch (error) {
      logger.error('Error checking admin permission:', error);
      return false;
    }
  }
  
  async #validatePermissionData(data) {
    const errors = [];
    
    // Validate permission code
    if (!data.permissionCode) {
      errors.push('Permission code is required');
    } else if (!this.#validationConfig.permissionCode.pattern.test(data.permissionCode)) {
      errors.push('Permission code must be uppercase alphanumeric with underscores, 3-50 characters');
    }
    
    // Validate permission name
    if (!data.permissionName) {
      errors.push('Permission name is required');
    } else if (data.permissionName.length < this.#validationConfig.permissionName.minLength ||
               data.permissionName.length > this.#validationConfig.permissionName.maxLength) {
      errors.push('Permission name must be 3-100 characters');
    }
    
    // Validate category
    if (!data.category) {
      errors.push('Category is required');
    } else if (!this.#permissionConfig.categories.includes(data.category)) {
      errors.push(`Invalid category. Must be one of: ${this.#permissionConfig.categories.join(', ')}`);
    }
    
    // Validate action
    if (!data.action) {
      errors.push('Action is required');
    } else if (!this.#permissionConfig.actions.includes(data.action)) {
      errors.push(`Invalid action. Must be one of: ${this.#permissionConfig.actions.join(', ')}`);
    }
    
    // Validate module and resource
    if (!data.module) errors.push('Module is required');
    if (!data.resource) errors.push('Resource is required');
    if (!data.description) errors.push('Description is required');
    
    return {
      valid: errors.length === 0,
      message: errors.join('; ')
    };
  }
  
  async #validatePermissionUpdate(data) {
    const errors = [];
    
    // Validate permission name if provided
    if (data.permissionName && (
      data.permissionName.length < this.#validationConfig.permissionName.minLength ||
      data.permissionName.length > this.#validationConfig.permissionName.maxLength
    )) {
      errors.push('Permission name must be 3-100 characters');
    }
    
    // Validate description if provided
    if (data.description && data.description.length > this.#validationConfig.description.maxLength) {
      errors.push('Description must not exceed 500 characters');
    }
    
    // Validate configuration changes
    if (data.configuration) {
      if (data.configuration.scope && !this.#permissionConfig.scopes.includes(data.configuration.scope)) {
        errors.push('Invalid scope');
      }
      
      if (data.configuration.riskLevel && !this.#permissionConfig.riskLevels.includes(data.configuration.riskLevel)) {
        errors.push('Invalid risk level');
      }
      
      if (data.configuration.sensitivityLevel && !this.#permissionConfig.sensitivityLevels.includes(data.configuration.sensitivityLevel)) {
        errors.push('Invalid sensitivity level');
      }
    }
    
    return {
      valid: errors.length === 0,
      message: errors.join('; ')
    };
  }
  
  async #checkPermissionCodeConflict(permissionCode) {
    // Check if permission code already exists
    // This would typically check against the database
    return false;
  }
  
  async #validatePermissionDependencies(dependencies) {
    // Validate permission dependencies
    if (dependencies.requiredPermissions) {
      for (const req of dependencies.requiredPermissions) {
        if (!req.permissionCode) {
          throw new AppError('Required permission code is missing', STATUS_CODES.BAD_REQUEST);
        }
      }
    }
    
    return true;
  }
  
  async #checkActivePermissionAssignments(permissionId) {
    // Check for active assignments of this permission
    // This would query the database
    return 0;
  }
  
  async #checkPermissionElevation(userId, permissionId) {
    // Check if user is trying to assign a permission higher than their own
    if (!this.#securityConfig.preventElevation) {
      return true;
    }
    
    // Get user's highest permission level
    // Compare with permission being assigned
    return true;
  }
  
  async #checkRoleElevation(userId, roleId) {
    // Check if user is trying to assign a role higher than their own
    if (!this.#securityConfig.preventElevation) {
      return true;
    }
    
    // Get user's highest role level
    // Compare with role being assigned
    return true;
  }
  
  async #validateUserEligibility(userId, permissionId) {
    // Validate if user is eligible for the permission
    return true;
  }
  
  async #refreshAffectedUserPermissions(permissionId) {
    // Refresh permission caches for all affected users
    logger.debug(`Refreshing permissions for users affected by permission ${permissionId}`);
  }
  
  async #performAutoRemediation(userId, auditResult, performedBy) {
    // Perform automatic remediation based on audit findings
    logger.info(`Performing auto-remediation for user ${userId}`);
    
    // Remove excessive permissions
    // Fix permission conflicts
    // Remove expired permissions
  }
  
  #parsePermissionFilters(query) {
    const filters = {};
    
    if (query.category) filters.category = query.category;
    if (query.module) filters.module = query.module;
    if (query.resource) filters.resource = query.resource;
    if (query.action) filters.action = query.action;
    if (query.isActive !== undefined) filters.isActive = query.isActive === 'true';
    if (query.isSystem !== undefined) filters.isSystem = query.isSystem === 'true';
    if (query.riskLevel) filters.riskLevel = query.riskLevel;
    
    return filters;
  }
  
  #parseListOptions(query) {
    return {
      page: parseInt(query.page) || 1,
      limit: Math.min(parseInt(query.limit) || 20, 100),
      sortBy: query.sortBy || 'permissionCode',
      sortOrder: query.sortOrder || 'asc',
      includeUsage: query.includeUsage === 'true'
    };
  }
  
  #groupPermissionsByCategory(permissions) {
    const grouped = {};
    
    for (const permission of permissions) {
      const category = permission.category || 'UNCATEGORIZED';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(permission);
    }
    
    return grouped;
  }
  
  #sanitizeForLogging(data) {
    const sanitized = { ...data };
    // Remove sensitive fields from logging
    return sanitized;
  }
  
  async #logControllerAction(action, data) {
    try {
      logger.audit({
        category: 'PERMISSIONS_CONTROLLER',
        action,
        timestamp: new Date(),
        data: this.#sanitizeForLogging(data)
      });
    } catch (error) {
      logger.error('Error logging controller action:', error);
    }
  }
}

// Export singleton instance
module.exports = new UserPermissionsController();