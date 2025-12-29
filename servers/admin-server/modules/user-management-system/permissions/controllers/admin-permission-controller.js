/**
 * @fileoverview Admin Permission Controller
 * @module servers/admin-server/modules/user-management-system/permissions/controllers
 * @description Class-based controller for permission management (CRUD operations)
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminPermission = require('../../../../../../shared/lib/database/models/admin-server/admin-permission');
const AdminAuditLog = require('../../../../../../shared/lib/database/models/admin-server/admin-audit-log');

const logger = getLogger({ serviceName: 'admin-permission-controller' });

/**
 * Admin Permission Controller Class
 * @class AdminPermissionController
 * @description Handles HTTP requests for permission management
 */
class AdminPermissionController {
  /**
   * Get all permissions
   * @route GET /api/admin/permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getAllPermissions(req, res, next) {
    try {
      const { page = 1, limit = 100, resource, action, isActive } = req.query;

      // Build filter
      const filter = {};
      if (resource) filter.resource = resource;
      if (action) filter.action = action;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const [permissions, total] = await Promise.all([
        AdminPermission.find(filter)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ resource: 1, action: 1 })
          .lean(),
        AdminPermission.countDocuments(filter)
      ]);

      // Group by resource for better organization
      const groupedByResource = permissions.reduce((acc, permission) => {
        if (!acc[permission.resource]) {
          acc[permission.resource] = [];
        }
        acc[permission.resource].push(permission);
        return acc;
      }, {});

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.list',
        resourceType: 'admin_permission',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: {
          permissions,
          groupedByResource,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get all permissions failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get permission by ID
   * @route GET /api/admin/permissions/:permissionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getPermissionById(req, res, next) {
    try {
      const { permissionId } = req.params;

      const permission = await AdminPermission.findById(permissionId).lean();

      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.view',
        resourceType: 'admin_permission',
        resourceId: permissionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: { permission }
      });
    } catch (error) {
      logger.error('Get permission by ID failed', { error: error.message, permissionId: req.params.permissionId });
      next(error);
    }
  }

  /**
   * Create new permission
   * @route POST /api/admin/permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async createPermission(req, res, next) {
    try {
      const { name, description, resource, action } = req.body;

      // Validate required fields
      if (!name || !description || !resource || !action) {
        throw new AppError('Name, description, resource, and action are required', 400, 'MISSING_FIELDS');
      }

      // Check if permission already exists
      const existingPermission = await AdminPermission.findOne({ name });
      if (existingPermission) {
        throw new AppError('Permission with this name already exists', 409, 'PERMISSION_EXISTS');
      }

      // Create new permission
      const newPermission = await AdminPermission.create({
        name,
        description,
        resource,
        action,
        isActive: true,
        isSystem: false,
        createdBy: req.user.id
      });

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.create',
        resourceType: 'admin_permission',
        resourceId: newPermission._id.toString(),
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { name, resource, action }
      });

      logger.info('Permission created', { permissionId: newPermission._id, name });

      res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: { permission: newPermission }
      });
    } catch (error) {
      logger.error('Create permission failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Update permission
   * @route PATCH /api/admin/permissions/:permissionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async updatePermission(req, res, next) {
    try {
      const { permissionId } = req.params;
      const { name, description, resource, action, isActive } = req.body;

      // Find permission
      const permission = await AdminPermission.findById(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Prevent modification of system permissions
      if (permission.isSystem) {
        throw new AppError('Cannot modify system permissions', 403, 'SYSTEM_PERMISSION_PROTECTED');
      }

      // Build update object
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (resource !== undefined) updates.resource = resource;
      if (action !== undefined) updates.action = action;
      if (isActive !== undefined) updates.isActive = isActive;

      // Update permission
      const updatedPermission = await AdminPermission.findByIdAndUpdate(
        permissionId,
        { $set: updates },
        { new: true, runValidators: true }
      );

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.update',
        resourceType: 'admin_permission',
        resourceId: permissionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        changesSummary: `Updated fields: ${Object.keys(updates).join(', ')}`,
        metadata: { updates }
      });

      logger.info('Permission updated', { permissionId, updatedFields: Object.keys(updates) });

      res.status(200).json({
        success: true,
        message: 'Permission updated successfully',
        data: { permission: updatedPermission }
      });
    } catch (error) {
      logger.error('Update permission failed', { error: error.message, permissionId: req.params.permissionId });
      next(error);
    }
  }

  /**
   * Delete permission
   * @route DELETE /api/admin/permissions/:permissionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async deletePermission(req, res, next) {
    try {
      const { permissionId } = req.params;

      // Find permission
      const permission = await AdminPermission.findById(permissionId);
      if (!permission) {
        throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
      }

      // Prevent deletion of system permissions
      if (permission.isSystem) {
        throw new AppError('Cannot delete system permissions', 403, 'SYSTEM_PERMISSION_PROTECTED');
      }

      // Soft delete (deactivate)
      permission.isActive = false;
      await permission.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.delete',
        resourceType: 'admin_permission',
        resourceId: permissionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { permissionName: permission.name }
      });

      logger.info('Permission deleted', { permissionId, name: permission.name });

      res.status(200).json({
        success: true,
        message: 'Permission deleted successfully'
      });
    } catch (error) {
      logger.error('Delete permission failed', { error: error.message, permissionId: req.params.permissionId });
      next(error);
    }
  }

  /**
   * Get all available resources
   * @route GET /api/admin/permissions/resources
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getResources(req, res, next) {
    try {
      // Get distinct resources
      const resources = await AdminPermission.distinct('resource');

      res.status(200).json({
        success: true,
        data: { resources: resources.sort() }
      });
    } catch (error) {
      logger.error('Get resources failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get all available actions
   * @route GET /api/admin/permissions/actions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getActions(req, res, next) {
    try {
      // Get distinct actions
      const actions = await AdminPermission.distinct('action');

      res.status(200).json({
        success: true,
        data: { actions: actions.sort() }
      });
    } catch (error) {
      logger.error('Get actions failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Bulk create permissions
   * @route POST /api/admin/permissions/bulk
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async bulkCreatePermissions(req, res, next) {
    try {
      const { permissions } = req.body;

      if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        throw new AppError('Permissions array is required', 400, 'MISSING_PERMISSIONS');
      }

      // Validate each permission
      for (const perm of permissions) {
        if (!perm.name || !perm.description || !perm.resource || !perm.action) {
          throw new AppError('Each permission must have name, description, resource, and action', 400, 'INVALID_PERMISSION');
        }
      }

      // Add createdBy to each permission
      const permissionsToCreate = permissions.map(p => ({
        ...p,
        isActive: true,
        isSystem: false,
        createdBy: req.user.id
      }));

      // Bulk insert (ignore duplicates)
      const result = await AdminPermission.insertMany(permissionsToCreate, { ordered: false })
        .catch(error => {
          // Handle duplicate key errors
          if (error.code === 11000) {
            return { insertedCount: error.result?.nInserted || 0 };
          }
          throw error;
        });

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'permissions.bulk_create',
        resourceType: 'admin_permission',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { count: result.insertedCount || permissions.length }
      });

      res.status(201).json({
        success: true,
        message: `${result.insertedCount || permissions.length} permission(s) created successfully`,
        data: { created: result.insertedCount || permissions.length }
      });
    } catch (error) {
      logger.error('Bulk create permissions failed', { error: error.message });
      next(error);
    }
  }
}

module.exports = AdminPermissionController;
