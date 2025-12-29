/**
 * @fileoverview Admin Role Controller
 * @module servers/admin-server/modules/user-management-system/roles/controllers
 * @description Class-based controller for role management (CRUD operations)
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminRole = require('../../../../../../shared/lib/database/models/admin-server/admin-role');
const AdminAuditLog = require('../../../../../../shared/lib/database/models/admin-server/admin-audit-log');

const logger = getLogger({ serviceName: 'admin-role-controller' });

/**
 * Admin Role Controller Class
 * @class AdminRoleController
 * @description Handles HTTP requests for role management
 */
class AdminRoleController {
  /**
   * Get all roles
   * @route GET /api/admin/roles
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getAllRoles(req, res, next) {
    try {
      const { page = 1, limit = 50, isActive } = req.query;

      // Build filter
      const filter = {};
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const [roles, total] = await Promise.all([
        AdminRole.find(filter)
          .populate('permissions', 'name description')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ level: -1, name: 1 })
          .lean(),
        AdminRole.countDocuments(filter)
      ]);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.list',
        resourceType: 'admin_role',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: {
          roles,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get all roles failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get role by ID
   * @route GET /api/admin/roles/:roleId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getRoleById(req, res, next) {
    try {
      const { roleId } = req.params;

      const role = await AdminRole.findById(roleId)
        .populate('permissions', 'name description resource action')
        .lean();

      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.view',
        resourceType: 'admin_role',
        resourceId: roleId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: { role }
      });
    } catch (error) {
      logger.error('Get role by ID failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }

  /**
   * Create new role
   * @route POST /api/admin/roles
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async createRole(req, res, next) {
    try {
      const { name, description, permissions, level, inheritsFrom } = req.body;

      // Validate required fields
      if (!name || !description) {
        throw new AppError('Name and description are required', 400, 'MISSING_FIELDS');
      }

      // Check if role already exists
      const existingRole = await AdminRole.findOne({ name });
      if (existingRole) {
        throw new AppError('Role with this name already exists', 409, 'ROLE_EXISTS');
      }

      // Create new role
      const newRole = await AdminRole.create({
        name,
        description,
        permissions: permissions || [],
        level: level || 1,
        inheritsFrom: inheritsFrom || null,
        isActive: true,
        isSystem: false,
        createdBy: req.user.id
      });

      // Populate permissions
      await newRole.populate('permissions', 'name description resource action');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.create',
        resourceType: 'admin_role',
        resourceId: newRole._id.toString(),
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { name, level }
      });

      logger.info('Role created', { roleId: newRole._id, name });

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: { role: newRole }
      });
    } catch (error) {
      logger.error('Create role failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Update role
   * @route PATCH /api/admin/roles/:roleId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async updateRole(req, res, next) {
    try {
      const { roleId } = req.params;
      const { name, description, permissions, level, inheritsFrom, isActive } = req.body;

      // Find role
      const role = await AdminRole.findById(roleId);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Prevent modification of system roles
      if (role.isSystem) {
        throw new AppError('Cannot modify system roles', 403, 'SYSTEM_ROLE_PROTECTED');
      }

      // Build update object
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (permissions !== undefined) updates.permissions = permissions;
      if (level !== undefined) updates.level = level;
      if (inheritsFrom !== undefined) updates.inheritsFrom = inheritsFrom;
      if (isActive !== undefined) updates.isActive = isActive;

      // Update role
      const updatedRole = await AdminRole.findByIdAndUpdate(
        roleId,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('permissions', 'name description resource action');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.update',
        resourceType: 'admin_role',
        resourceId: roleId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        changesSummary: `Updated fields: ${Object.keys(updates).join(', ')}`,
        metadata: { updates }
      });

      logger.info('Role updated', { roleId, updatedFields: Object.keys(updates) });

      res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: { role: updatedRole }
      });
    } catch (error) {
      logger.error('Update role failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }

  /**
   * Delete role
   * @route DELETE /api/admin/roles/:roleId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async deleteRole(req, res, next) {
    try {
      const { roleId } = req.params;

      // Find role
      const role = await AdminRole.findById(roleId);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Prevent deletion of system roles
      if (role.isSystem) {
        throw new AppError('Cannot delete system roles', 403, 'SYSTEM_ROLE_PROTECTED');
      }

      // Soft delete (deactivate)
      role.isActive = false;
      await role.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.delete',
        resourceType: 'admin_role',
        resourceId: roleId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { roleName: role.name }
      });

      logger.info('Role deleted', { roleId, name: role.name });

      res.status(200).json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      logger.error('Delete role failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }

  /**
   * Get role permissions
   * @route GET /api/admin/roles/:roleId/permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getRolePermissions(req, res, next) {
    try {
      const { roleId } = req.params;

      const role = await AdminRole.findById(roleId)
        .populate('permissions', 'name description resource action isActive')
        .lean();

      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      // Get inherited permissions if applicable
      let inheritedPermissions = [];
      if (role.inheritsFrom) {
        const parentRole = await AdminRole.findById(role.inheritsFrom)
          .populate('permissions', 'name description resource action isActive')
          .lean();

        if (parentRole) {
          inheritedPermissions = parentRole.permissions;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          roleId: role._id,
          roleName: role.name,
          directPermissions: role.permissions,
          inheritedPermissions,
          totalPermissions: [...new Set([...role.permissions.map(p => p._id.toString()), ...inheritedPermissions.map(p => p._id.toString())])].length
        }
      });
    } catch (error) {
      logger.error('Get role permissions failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }

  /**
   * Add permissions to role
   * @route POST /api/admin/roles/:roleId/permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async addPermissionsToRole(req, res, next) {
    try {
      const { roleId } = req.params;
      const { permissionIds } = req.body;

      if (!permissionIds || !Array.isArray(permissionIds) || permissionIds.length === 0) {
        throw new AppError('Permission IDs array is required', 400, 'MISSING_PERMISSIONS');
      }

      // Find role
      const role = await AdminRole.findById(roleId);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      if (role.isSystem) {
        throw new AppError('Cannot modify system role permissions', 403, 'SYSTEM_ROLE_PROTECTED');
      }

      // Add permissions (avoid duplicates)
      const existingPermissions = role.permissions.map(p => p.toString());
      const newPermissions = permissionIds.filter(id => !existingPermissions.includes(id));

      role.permissions.push(...newPermissions);
      await role.save();

      // Populate and return
      await role.populate('permissions', 'name description resource action');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.add_permissions',
        resourceType: 'admin_role',
        resourceId: roleId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { permissionsAdded: newPermissions.length }
      });

      res.status(200).json({
        success: true,
        message: `${newPermissions.length} permission(s) added to role`,
        data: { role }
      });
    } catch (error) {
      logger.error('Add permissions to role failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }

  /**
   * Remove permissions from role
   * @route DELETE /api/admin/roles/:roleId/permissions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async removePermissionsFromRole(req, res, next) {
    try {
      const { roleId } = req.params;
      const { permissionIds } = req.body;

      if (!permissionIds || !Array.isArray(permissionIds) || permissionIds.length === 0) {
        throw new AppError('Permission IDs array is required', 400, 'MISSING_PERMISSIONS');
      }

      // Find role
      const role = await AdminRole.findById(roleId);
      if (!role) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      if (role.isSystem) {
        throw new AppError('Cannot modify system role permissions', 403, 'SYSTEM_ROLE_PROTECTED');
      }

      // Remove permissions
      role.permissions = role.permissions.filter(
        p => !permissionIds.includes(p.toString())
      );
      await role.save();

      // Populate and return
      await role.populate('permissions', 'name description resource action');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'roles.remove_permissions',
        resourceType: 'admin_role',
        resourceId: roleId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { permissionsRemoved: permissionIds.length }
      });

      res.status(200).json({
        success: true,
        message: 'Permissions removed from role',
        data: { role }
      });
    } catch (error) {
      logger.error('Remove permissions from role failed', { error: error.message, roleId: req.params.roleId });
      next(error);
    }
  }
}

module.exports = AdminRoleController;
