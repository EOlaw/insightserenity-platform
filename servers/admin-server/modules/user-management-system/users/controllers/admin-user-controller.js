/**
 * @fileoverview Admin User Controller
 * @module servers/admin-server/modules/user-management-system/users/controllers
 * @description Class-based controller for admin user management (CRUD operations)
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminUser = require('../../../../../../shared/lib/database/models/admin-server/admin-user');
const AdminAuditLog = require('../../../../../../shared/lib/database/models/admin-server/admin-audit-log');
const bcrypt = require('bcryptjs');

const logger = getLogger({ serviceName: 'admin-user-controller' });

/**
 * Admin User Controller Class
 * @class AdminUserController
 * @description Handles HTTP requests for admin user management
 */
class AdminUserController {
  /**
   * Get all admin users (with pagination and filtering)
   * @route GET /api/admin/users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getAllUsers(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        department,
        isActive,
        search
      } = req.query;

      // Build filter query
      const filter = {};

      if (role) filter.role = role;
      if (department) filter.department = department;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      // Search by email, first name, or last name
      if (search) {
        filter.$or = [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ];
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const [users, total] = await Promise.all([
        AdminUser.find(filter)
          .select('-passwordHash -mfaSecret')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 })
          .lean(),
        AdminUser.countDocuments(filter)
      ]);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.list',
        resourceType: 'admin_user',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { filter, page, limit }
      });

      res.status(200).json({
        success: true,
        data: {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get all users failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get admin user by ID
   * @route GET /api/admin/users/:userId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getUserById(req, res, next) {
    try {
      const { userId } = req.params;

      const user = await AdminUser.findById(userId)
        .select('-passwordHash -mfaSecret')
        .lean();

      if (!user) {
        throw new AppError('Admin user not found', 404, 'USER_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.view',
        resourceType: 'admin_user',
        resourceId: userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: { user }
      });
    } catch (error) {
      logger.error('Get user by ID failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }

  /**
   * Create new admin user
   * @route POST /api/admin/users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async createUser(req, res, next) {
    try {
      const {
        email,
        firstName,
        lastName,
        password,
        role,
        permissions,
        department,
        phoneNumber
      } = req.body;

      // Validate required fields
      if (!email || !firstName || !lastName || !password || !role) {
        throw new AppError('Missing required fields', 400, 'MISSING_FIELDS');
      }

      // Check if user already exists
      const existingUser = await AdminUser.findOne({
        email: email.toLowerCase()
      });

      if (existingUser) {
        throw new AppError('Admin user with this email already exists', 409, 'USER_EXISTS');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create new user
      const newUser = await AdminUser.create({
        email: email.toLowerCase(),
        firstName,
        lastName,
        passwordHash,
        role,
        permissions: permissions || [],
        department,
        phoneNumber,
        isActive: true,
        isEmailVerified: false,
        mfaEnabled: false,
        createdBy: req.user.id
      });

      // Remove sensitive data
      const userResponse = newUser.toObject();
      delete userResponse.passwordHash;
      delete userResponse.mfaSecret;

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.create',
        resourceType: 'admin_user',
        resourceId: newUser._id.toString(),
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { email, role, department }
      });

      logger.info('Admin user created', { userId: newUser._id, email });

      res.status(201).json({
        success: true,
        message: 'Admin user created successfully',
        data: { user: userResponse }
      });
    } catch (error) {
      logger.error('Create user failed', { error: error.message });

      // Log failed attempt
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.create',
        resourceType: 'admin_user',
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { error: error.message }
      }).catch(() => {});

      next(error);
    }
  }

  /**
   * Update admin user
   * @route PATCH /api/admin/users/:userId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async updateUser(req, res, next) {
    try {
      const { userId } = req.params;
      const {
        firstName,
        lastName,
        role,
        permissions,
        department,
        phoneNumber,
        isActive
      } = req.body;

      // Find user
      const user = await AdminUser.findById(userId);
      if (!user) {
        throw new AppError('Admin user not found', 404, 'USER_NOT_FOUND');
      }

      // Build update object
      const updates = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (role !== undefined) updates.role = role;
      if (permissions !== undefined) updates.permissions = permissions;
      if (department !== undefined) updates.department = department;
      if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
      if (isActive !== undefined) updates.isActive = isActive;

      // Update user
      const updatedUser = await AdminUser.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('-passwordHash -mfaSecret');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.update',
        resourceType: 'admin_user',
        resourceId: userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        changesSummary: `Updated fields: ${Object.keys(updates).join(', ')}`,
        metadata: { updates }
      });

      logger.info('Admin user updated', { userId, updatedFields: Object.keys(updates) });

      res.status(200).json({
        success: true,
        message: 'Admin user updated successfully',
        data: { user: updatedUser }
      });
    } catch (error) {
      logger.error('Update user failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }

  /**
   * Delete admin user (soft delete)
   * @route DELETE /api/admin/users/:userId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async deleteUser(req, res, next) {
    try {
      const { userId } = req.params;

      // Prevent self-deletion
      if (userId === req.user.id) {
        throw new AppError('Cannot delete your own account', 403, 'SELF_DELETE_FORBIDDEN');
      }

      // Find user
      const user = await AdminUser.findById(userId);
      if (!user) {
        throw new AppError('Admin user not found', 404, 'USER_NOT_FOUND');
      }

      // Soft delete (deactivate)
      user.isActive = false;
      user.deactivatedAt = new Date();
      user.deactivatedBy = req.user.id;
      await user.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.delete',
        resourceType: 'admin_user',
        resourceId: userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { email: user.email }
      });

      logger.info('Admin user deleted (deactivated)', { userId, email: user.email });

      res.status(200).json({
        success: true,
        message: 'Admin user deleted successfully'
      });
    } catch (error) {
      logger.error('Delete user failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }

  /**
   * Activate admin user
   * @route POST /api/admin/users/:userId/activate
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async activateUser(req, res, next) {
    try {
      const { userId } = req.params;

      const user = await AdminUser.findByIdAndUpdate(
        userId,
        {
          $set: {
            isActive: true,
            deactivatedAt: null,
            deactivatedBy: null
          }
        },
        { new: true }
      ).select('-passwordHash -mfaSecret');

      if (!user) {
        throw new AppError('Admin user not found', 404, 'USER_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.activate',
        resourceType: 'admin_user',
        resourceId: userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      logger.info('Admin user activated', { userId });

      res.status(200).json({
        success: true,
        message: 'Admin user activated successfully',
        data: { user }
      });
    } catch (error) {
      logger.error('Activate user failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }

  /**
   * Get user activity/audit logs
   * @route GET /api/admin/users/:userId/activity
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getUserActivity(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [activities, total] = await Promise.all([
        AdminAuditLog.find({ adminUser: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        AdminAuditLog.countDocuments({ adminUser: userId })
      ]);

      res.status(200).json({
        success: true,
        data: {
          activities,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get user activity failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }

  /**
   * Reset user password (admin action)
   * @route POST /api/admin/users/:userId/reset-password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async resetUserPassword(req, res, next) {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        throw new AppError('Password must be at least 8 characters', 400, 'INVALID_PASSWORD');
      }

      // Find user
      const user = await AdminUser.findById(userId);
      if (!user) {
        throw new AppError('Admin user not found', 404, 'USER_NOT_FOUND');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      user.passwordHash = passwordHash;
      user.passwordChangedAt = new Date();
      user.mustChangePassword = true; // Force password change on next login
      await user.save();

      // Revoke all sessions
      await user.revokeAllSessions('admin_password_reset');

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'users.reset_password',
        resourceType: 'admin_user',
        resourceId: userId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { targetUser: user.email }
      });

      logger.info('User password reset by admin', { userId, resetBy: req.user.id });

      res.status(200).json({
        success: true,
        message: 'Password reset successfully. User will be prompted to change password on next login.'
      });
    } catch (error) {
      logger.error('Reset user password failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }
}

module.exports = AdminUserController;
