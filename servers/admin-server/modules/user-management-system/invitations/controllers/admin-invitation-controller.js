/**
 * @fileoverview Admin Invitation Controller
 * @module servers/admin-server/modules/user-management-system/invitations/controllers
 * @description Class-based controller for managing admin user invitations
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminInvitation = require('../../../../../../shared/lib/database/models/admin-server/admin-invitation');
const AdminUser = require('../../../../../../shared/lib/database/models/admin-server/admin-user');
const AdminAuditLog = require('../../../../../../shared/lib/database/models/admin-server/admin-audit-log');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const logger = getLogger({ serviceName: 'admin-invitation-controller' });

/**
 * Admin Invitation Controller Class
 * @class AdminInvitationController
 * @description Handles HTTP requests for invitation management
 */
class AdminInvitationController {
  /**
   * Get all invitations
   * @route GET /api/admin/invitations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getAllInvitations(req, res, next) {
    try {
      const { page = 1, limit = 20, status } = req.query;

      // Build filter
      const filter = {};
      if (status) filter.status = status;

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const [invitations, total] = await Promise.all([
        AdminInvitation.find(filter)
          .populate('invitedBy', 'firstName lastName email')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 })
          .lean(),
        AdminInvitation.countDocuments(filter)
      ]);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'invitations.list',
        resourceType: 'admin_invitation',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: {
          invitations,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get all invitations failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get invitation by ID
   * @route GET /api/admin/invitations/:invitationId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getInvitationById(req, res, next) {
    try {
      const { invitationId } = req.params;

      const invitation = await AdminInvitation.findById(invitationId)
        .populate('invitedBy', 'firstName lastName email')
        .lean();

      if (!invitation) {
        throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'invitations.view',
        resourceType: 'admin_invitation',
        resourceId: invitationId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: { invitation }
      });
    } catch (error) {
      logger.error('Get invitation by ID failed', { error: error.message, invitationId: req.params.invitationId });
      next(error);
    }
  }

  /**
   * Send invitation
   * @route POST /api/admin/invitations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async sendInvitation(req, res, next) {
    try {
      const { email, role, permissions, department } = req.body;

      // Validate required fields
      if (!email || !role) {
        throw new AppError('Email and role are required', 400, 'MISSING_FIELDS');
      }

      // Check if user already exists
      const existingUser = await AdminUser.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new AppError('Admin user with this email already exists', 409, 'USER_EXISTS');
      }

      // Check if there's a pending invitation
      const existingInvitation = await AdminInvitation.findOne({
        email: email.toLowerCase(),
        status: 'pending'
      });

      if (existingInvitation) {
        throw new AppError('Pending invitation already exists for this email', 409, 'INVITATION_EXISTS');
      }

      // Generate invitation token
      const invitationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(invitationToken).digest('hex');

      // Create invitation
      const newInvitation = await AdminInvitation.create({
        email: email.toLowerCase(),
        role,
        permissions: permissions || [],
        department,
        invitationToken: hashedToken,
        invitedBy: req.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending'
      });

      // TODO: Send invitation email with token
      // const invitationLink = `${process.env.ADMIN_PORTAL_URL}/accept-invitation/${invitationToken}`;
      // await emailService.sendInvitation(email, invitationLink);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'invitations.send',
        resourceType: 'admin_invitation',
        resourceId: newInvitation._id.toString(),
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { email, role }
      });

      logger.info('Invitation sent', { invitationId: newInvitation._id, email });

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully',
        data: {
          invitation: {
            id: newInvitation._id,
            email: newInvitation.email,
            role: newInvitation.role,
            expiresAt: newInvitation.expiresAt
          },
          // In development, return token for testing
          ...(process.env.NODE_ENV === 'development' && { invitationToken })
        }
      });
    } catch (error) {
      logger.error('Send invitation failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Resend invitation
   * @route POST /api/admin/invitations/:invitationId/resend
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async resendInvitation(req, res, next) {
    try {
      const { invitationId } = req.params;

      // Find invitation
      const invitation = await AdminInvitation.findById(invitationId);
      if (!invitation) {
        throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
      }

      if (invitation.status !== 'pending') {
        throw new AppError('Can only resend pending invitations', 400, 'INVALID_STATUS');
      }

      // Generate new token
      const invitationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(invitationToken).digest('hex');

      // Update invitation
      invitation.invitationToken = hashedToken;
      invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await invitation.save();

      // TODO: Resend invitation email
      // const invitationLink = `${process.env.ADMIN_PORTAL_URL}/accept-invitation/${invitationToken}`;
      // await emailService.sendInvitation(invitation.email, invitationLink);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'invitations.resend',
        resourceType: 'admin_invitation',
        resourceId: invitationId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        message: 'Invitation resent successfully',
        data: {
          ...(process.env.NODE_ENV === 'development' && { invitationToken })
        }
      });
    } catch (error) {
      logger.error('Resend invitation failed', { error: error.message, invitationId: req.params.invitationId });
      next(error);
    }
  }

  /**
   * Revoke invitation
   * @route DELETE /api/admin/invitations/:invitationId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async revokeInvitation(req, res, next) {
    try {
      const { invitationId } = req.params;

      // Find invitation
      const invitation = await AdminInvitation.findById(invitationId);
      if (!invitation) {
        throw new AppError('Invitation not found', 404, 'INVITATION_NOT_FOUND');
      }

      if (invitation.status !== 'pending') {
        throw new AppError('Can only revoke pending invitations', 400, 'INVALID_STATUS');
      }

      // Update status
      invitation.status = 'revoked';
      await invitation.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'invitations.revoke',
        resourceType: 'admin_invitation',
        resourceId: invitationId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      logger.info('Invitation revoked', { invitationId });

      res.status(200).json({
        success: true,
        message: 'Invitation revoked successfully'
      });
    } catch (error) {
      logger.error('Revoke invitation failed', { error: error.message, invitationId: req.params.invitationId });
      next(error);
    }
  }

  /**
   * Accept invitation (public endpoint)
   * @route POST /api/admin/invitations/:token/accept
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async acceptInvitation(req, res, next) {
    try {
      const { token } = req.params;
      const { firstName, lastName, password } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !password) {
        throw new AppError('First name, last name, and password are required', 400, 'MISSING_FIELDS');
      }

      if (password.length < 8) {
        throw new AppError('Password must be at least 8 characters', 400, 'INVALID_PASSWORD');
      }

      // Hash token and find invitation
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      const invitation = await AdminInvitation.findOne({
        invitationToken: hashedToken,
        status: 'pending'
      });

      if (!invitation) {
        throw new AppError('Invalid or expired invitation', 400, 'INVALID_INVITATION');
      }

      // Check if expired
      if (invitation.expiresAt < new Date()) {
        invitation.status = 'expired';
        await invitation.save();
        throw new AppError('Invitation has expired', 400, 'INVITATION_EXPIRED');
      }

      // Check if user already exists
      const existingUser = await AdminUser.findOne({ email: invitation.email });
      if (existingUser) {
        throw new AppError('User already exists', 409, 'USER_EXISTS');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create admin user
      const newUser = await AdminUser.create({
        email: invitation.email,
        firstName,
        lastName,
        passwordHash,
        role: invitation.role,
        permissions: invitation.permissions,
        department: invitation.department,
        isActive: true,
        isEmailVerified: true, // Auto-verified via invitation
        mfaEnabled: false
      });

      // Update invitation status
      invitation.status = 'accepted';
      invitation.acceptedAt = new Date();
      await invitation.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: newUser._id,
        action: 'invitations.accept',
        resourceType: 'admin_invitation',
        resourceId: invitation._id.toString(),
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { email: newUser.email }
      });

      logger.info('Invitation accepted', { invitationId: invitation._id, userId: newUser._id });

      res.status(201).json({
        success: true,
        message: 'Invitation accepted. Your account has been created successfully.',
        data: {
          user: {
            id: newUser._id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role
          }
        }
      });
    } catch (error) {
      logger.error('Accept invitation failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get invitation statistics
   * @route GET /api/admin/invitations/stats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getInvitationStats(req, res, next) {
    try {
      const [pending, accepted, expired, revoked] = await Promise.all([
        AdminInvitation.countDocuments({ status: 'pending' }),
        AdminInvitation.countDocuments({ status: 'accepted' }),
        AdminInvitation.countDocuments({ status: 'expired' }),
        AdminInvitation.countDocuments({ status: 'revoked' })
      ]);

      res.status(200).json({
        success: true,
        data: {
          stats: {
            pending,
            accepted,
            expired,
            revoked,
            total: pending + accepted + expired + revoked
          }
        }
      });
    } catch (error) {
      logger.error('Get invitation stats failed', { error: error.message });
      next(error);
    }
  }
}

module.exports = AdminInvitationController;
