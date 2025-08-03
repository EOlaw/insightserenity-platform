'use strict';

/**
 * @fileoverview Seeds initial system data including roles, permissions, and lookup values
 * @module shared/lib/database/seeders/001-seed-initial-data
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/validators/common-validators
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ROLES, ROLE_HIERARCHY } = require('../../utils/constants/roles');
const { PERMISSIONS, PERMISSION_CATEGORIES } = require('../../utils/constants/permissions');
const { STATUS_CODES, STATUS_TYPES } = require('../../utils/constants/status-codes');
const BaseModel = require('../models/base-model');
const { validateEnum } = require('../../utils/validators/common-validators');

/**
 * @class InitialDataSeeder
 * @description Seeds core system data required for application functionality
 */
class InitialDataSeeder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #COLLECTIONS = {
    ROLES: 'roles',
    PERMISSIONS: 'permissions',
    STATUS_CODES: 'status_codes',
    SYSTEM_SETTINGS: 'system_settings',
    EMAIL_TEMPLATES: 'email_templates',
    NOTIFICATION_TYPES: 'notification_types'
  };

  /**
   * Seeds initial system data
   * @static
   * @async
   * @param {Object} [options={}] - Seeding options
   * @param {string} [options.environment] - Current environment
   * @param {Object} [options.session] - MongoDB session for transactions
   * @returns {Promise<Object>} Seeding result
   * @throws {AppError} If seeding fails
   */
  static async up(options = {}) {
    try {
      const { environment = 'development', session } = options;
      
      logger.info('Starting initial data seeding', { environment });

      let totalRecords = 0;

      // Seed roles
      const rolesResult = await InitialDataSeeder.#seedRoles(session);
      totalRecords += rolesResult.count;

      // Seed permissions
      const permissionsResult = await InitialDataSeeder.#seedPermissions(session);
      totalRecords += permissionsResult.count;

      // Seed status codes
      const statusResult = await InitialDataSeeder.#seedStatusCodes(session);
      totalRecords += statusResult.count;

      // Seed system settings
      const settingsResult = await InitialDataSeeder.#seedSystemSettings(session, environment);
      totalRecords += settingsResult.count;

      // Seed email templates
      const templatesResult = await InitialDataSeeder.#seedEmailTemplates(session);
      totalRecords += templatesResult.count;

      // Seed notification types
      const notificationResult = await InitialDataSeeder.#seedNotificationTypes(session);
      totalRecords += notificationResult.count;

      logger.info('Initial data seeding completed', { 
        totalRecords,
        details: {
          roles: rolesResult.count,
          permissions: permissionsResult.count,
          statusCodes: statusResult.count,
          systemSettings: settingsResult.count,
          emailTemplates: templatesResult.count,
          notificationTypes: notificationResult.count
        }
      });

      return { recordsSeeded: totalRecords };

    } catch (error) {
      logger.error('Initial data seeding failed', error);
      throw new AppError(
        'Failed to seed initial data',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seeded initial data
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const issues = [];
      const db = BaseModel.getDatabase();

      // Validate roles
      const rolesCollection = db.collection(InitialDataSeeder.#COLLECTIONS.ROLES);
      const rolesCount = await rolesCollection.countDocuments();
      const expectedRolesCount = Object.keys(ROLES).length;

      if (rolesCount < expectedRolesCount) {
        issues.push({
          type: 'roles',
          issue: `Missing roles: expected ${expectedRolesCount}, found ${rolesCount}`
        });
      }

      // Validate permissions
      const permissionsCollection = db.collection(InitialDataSeeder.#COLLECTIONS.PERMISSIONS);
      const permissionsCount = await permissionsCollection.countDocuments();
      
      if (permissionsCount === 0) {
        issues.push({
          type: 'permissions',
          issue: 'No permissions found in database'
        });
      }

      // Validate critical system settings
      const settingsCollection = db.collection(InitialDataSeeder.#COLLECTIONS.SYSTEM_SETTINGS);
      const criticalSettings = ['system.initialized', 'security.sessionTimeout', 'email.enabled'];
      
      for (const key of criticalSettings) {
        const setting = await settingsCollection.findOne({ key });
        if (!setting) {
          issues.push({
            type: 'system_settings',
            issue: `Missing critical setting: ${key}`
          });
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      logger.error('Validation failed', error);
      return {
        valid: false,
        issues: [{ type: 'error', issue: error.message }]
      };
    }
  }

  /**
   * @private
   * Seeds system roles
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedRoles(session) {
    try {
      logger.info('Seeding system roles');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.ROLES);

      const roles = [];
      
      for (const [key, value] of Object.entries(ROLES)) {
        const existingRole = await collection.findOne({ code: value }, { session });
        
        if (!existingRole) {
          roles.push({
            code: value,
            name: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
            description: InitialDataSeeder.#getRoleDescription(value),
            hierarchy: ROLE_HIERARCHY[value] || 0,
            isSystem: true,
            isActive: true,
            permissions: [],
            metadata: {
              source: 'system',
              immutable: true
            },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (roles.length > 0) {
        await collection.insertMany(roles, { session });
        logger.info(`Seeded ${roles.length} roles`);
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ hierarchy: 1 }, { session });
      await collection.createIndex({ isActive: 1 }, { session });

      return { count: roles.length };

    } catch (error) {
      logger.error('Failed to seed roles', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds system permissions
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPermissions(session) {
    try {
      logger.info('Seeding system permissions');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.PERMISSIONS);

      const permissions = [];
      
      for (const [category, categoryPermissions] of Object.entries(PERMISSIONS)) {
        for (const [key, value] of Object.entries(categoryPermissions)) {
          const existingPermission = await collection.findOne({ code: value }, { session });
          
          if (!existingPermission) {
            permissions.push({
              code: value,
              name: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
              category: PERMISSION_CATEGORIES[category] || category,
              description: InitialDataSeeder.#getPermissionDescription(value),
              resource: value.split(':')[0],
              action: value.split(':')[1],
              isSystem: true,
              isActive: true,
              metadata: {
                source: 'system',
                immutable: true,
                risk: InitialDataSeeder.#getPermissionRiskLevel(value)
              },
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      }

      if (permissions.length > 0) {
        await collection.insertMany(permissions, { session });
        logger.info(`Seeded ${permissions.length} permissions`);
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ resource: 1, action: 1 }, { session });
      await collection.createIndex({ isActive: 1 }, { session });

      // Assign permissions to roles
      await InitialDataSeeder.#assignDefaultPermissions(session);

      return { count: permissions.length };

    } catch (error) {
      logger.error('Failed to seed permissions', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds status codes
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedStatusCodes(session) {
    try {
      logger.info('Seeding status codes');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.STATUS_CODES);

      const statusCodes = [];
      
      for (const [type, codes] of Object.entries(STATUS_CODES)) {
        for (const [key, value] of Object.entries(codes)) {
          const existingStatus = await collection.findOne({ 
            type: STATUS_TYPES[type], 
            code: value 
          }, { session });
          
          if (!existingStatus) {
            statusCodes.push({
              type: STATUS_TYPES[type],
              code: value,
              name: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
              description: InitialDataSeeder.#getStatusDescription(type, value),
              displayOrder: InitialDataSeeder.#getStatusOrder(type, value),
              color: InitialDataSeeder.#getStatusColor(value),
              icon: InitialDataSeeder.#getStatusIcon(value),
              isActive: true,
              isDefault: InitialDataSeeder.#isDefaultStatus(type, value),
              metadata: {
                source: 'system',
                immutable: true
              },
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      }

      if (statusCodes.length > 0) {
        await collection.insertMany(statusCodes, { session });
        logger.info(`Seeded ${statusCodes.length} status codes`);
      }

      // Create indexes
      await collection.createIndex({ type: 1, code: 1 }, { unique: true, session });
      await collection.createIndex({ type: 1, displayOrder: 1 }, { session });
      await collection.createIndex({ isActive: 1 }, { session });

      return { count: statusCodes.length };

    } catch (error) {
      logger.error('Failed to seed status codes', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds system settings
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedSystemSettings(session, environment) {
    try {
      logger.info('Seeding system settings');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.SYSTEM_SETTINGS);

      const settings = [
        // System Settings
        {
          key: 'system.initialized',
          value: true,
          category: 'system',
          description: 'System initialization status',
          type: 'boolean',
          isEditable: false
        },
        {
          key: 'system.version',
          value: '1.0.0',
          category: 'system',
          description: 'System version',
          type: 'string',
          isEditable: false
        },
        {
          key: 'system.maintenanceMode',
          value: false,
          category: 'system',
          description: 'Maintenance mode status',
          type: 'boolean',
          isEditable: true
        },

        // Security Settings
        {
          key: 'security.sessionTimeout',
          value: environment === 'production' ? 3600 : 86400, // 1 hour vs 24 hours
          category: 'security',
          description: 'Session timeout in seconds',
          type: 'number',
          isEditable: true,
          validation: { min: 300, max: 86400 }
        },
        {
          key: 'security.maxLoginAttempts',
          value: 5,
          category: 'security',
          description: 'Maximum login attempts before lockout',
          type: 'number',
          isEditable: true,
          validation: { min: 3, max: 10 }
        },
        {
          key: 'security.lockoutDuration',
          value: 900, // 15 minutes
          category: 'security',
          description: 'Account lockout duration in seconds',
          type: 'number',
          isEditable: true,
          validation: { min: 300, max: 3600 }
        },
        {
          key: 'security.passwordMinLength',
          value: 8,
          category: 'security',
          description: 'Minimum password length',
          type: 'number',
          isEditable: true,
          validation: { min: 6, max: 32 }
        },
        {
          key: 'security.passwordRequireUppercase',
          value: true,
          category: 'security',
          description: 'Require uppercase letters in passwords',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'security.passwordRequireNumbers',
          value: true,
          category: 'security',
          description: 'Require numbers in passwords',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'security.passwordRequireSymbols',
          value: true,
          category: 'security',
          description: 'Require symbols in passwords',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'security.twoFactorRequired',
          value: environment === 'production',
          category: 'security',
          description: 'Require two-factor authentication',
          type: 'boolean',
          isEditable: true
        },

        // Email Settings
        {
          key: 'email.enabled',
          value: true,
          category: 'email',
          description: 'Email service enabled',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'email.fromAddress',
          value: 'noreply@insightserenity.com',
          category: 'email',
          description: 'Default from email address',
          type: 'string',
          isEditable: true
        },
        {
          key: 'email.fromName',
          value: 'InsightSerenity Platform',
          category: 'email',
          description: 'Default from name',
          type: 'string',
          isEditable: true
        },
        {
          key: 'email.replyToAddress',
          value: 'support@insightserenity.com',
          category: 'email',
          description: 'Reply-to email address',
          type: 'string',
          isEditable: true
        },

        // Rate Limiting Settings
        {
          key: 'rateLimit.apiRequestsPerMinute',
          value: environment === 'production' ? 60 : 300,
          category: 'rateLimit',
          description: 'API requests per minute per user',
          type: 'number',
          isEditable: true,
          validation: { min: 10, max: 1000 }
        },
        {
          key: 'rateLimit.loginAttemptsPerHour',
          value: 10,
          category: 'rateLimit',
          description: 'Login attempts per hour per IP',
          type: 'number',
          isEditable: true,
          validation: { min: 5, max: 50 }
        },

        // File Upload Settings
        {
          key: 'uploads.maxFileSize',
          value: 10485760, // 10MB
          category: 'uploads',
          description: 'Maximum file upload size in bytes',
          type: 'number',
          isEditable: true,
          validation: { min: 1048576, max: 104857600 } // 1MB - 100MB
        },
        {
          key: 'uploads.allowedFileTypes',
          value: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif'],
          category: 'uploads',
          description: 'Allowed file extensions',
          type: 'array',
          isEditable: true
        },

        // Feature Flags
        {
          key: 'features.recruitment',
          value: true,
          category: 'features',
          description: 'Recruitment module enabled',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'features.whiteLabel',
          value: true,
          category: 'features',
          description: 'White label functionality enabled',
          type: 'boolean',
          isEditable: true
        },
        {
          key: 'features.advancedAnalytics',
          value: environment === 'production',
          category: 'features',
          description: 'Advanced analytics enabled',
          type: 'boolean',
          isEditable: true
        }
      ];

      const insertedSettings = [];
      
      for (const setting of settings) {
        const existing = await collection.findOne({ key: setting.key }, { session });
        
        if (!existing) {
          insertedSettings.push({
            ...setting,
            environment,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (insertedSettings.length > 0) {
        await collection.insertMany(insertedSettings, { session });
        logger.info(`Seeded ${insertedSettings.length} system settings`);
      }

      // Create indexes
      await collection.createIndex({ key: 1 }, { unique: true, session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ environment: 1 }, { session });

      return { count: insertedSettings.length };

    } catch (error) {
      logger.error('Failed to seed system settings', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds email templates
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedEmailTemplates(session) {
    try {
      logger.info('Seeding email templates');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.EMAIL_TEMPLATES);

      const templates = [
        {
          code: 'welcome',
          name: 'Welcome Email',
          subject: 'Welcome to InsightSerenity!',
          htmlContent: InitialDataSeeder.#getEmailTemplate('welcome'),
          textContent: 'Welcome to InsightSerenity! Your account has been created successfully.',
          variables: ['firstName', 'organizationName', 'loginUrl'],
          category: 'user',
          isActive: true
        },
        {
          code: 'password-reset',
          name: 'Password Reset',
          subject: 'Reset Your Password',
          htmlContent: InitialDataSeeder.#getEmailTemplate('password-reset'),
          textContent: 'Click the link to reset your password: {{resetLink}}',
          variables: ['firstName', 'resetLink', 'expirationTime'],
          category: 'security',
          isActive: true
        },
        {
          code: 'two-factor',
          name: 'Two-Factor Authentication',
          subject: 'Your Verification Code',
          htmlContent: InitialDataSeeder.#getEmailTemplate('two-factor'),
          textContent: 'Your verification code is: {{code}}',
          variables: ['firstName', 'code', 'expirationTime'],
          category: 'security',
          isActive: true
        },
        {
          code: 'invitation',
          name: 'User Invitation',
          subject: 'You\'re Invited to Join {{organizationName}}',
          htmlContent: InitialDataSeeder.#getEmailTemplate('invitation'),
          textContent: 'You have been invited to join {{organizationName}}. Click here to accept: {{invitationLink}}',
          variables: ['inviterName', 'organizationName', 'invitationLink', 'role'],
          category: 'user',
          isActive: true
        },
        {
          code: 'account-locked',
          name: 'Account Locked',
          subject: 'Account Security Alert',
          htmlContent: InitialDataSeeder.#getEmailTemplate('account-locked'),
          textContent: 'Your account has been locked due to multiple failed login attempts.',
          variables: ['firstName', 'lockReason', 'supportEmail'],
          category: 'security',
          isActive: true
        }
      ];

      const insertedTemplates = [];
      
      for (const template of templates) {
        const existing = await collection.findOne({ code: template.code }, { session });
        
        if (!existing) {
          insertedTemplates.push({
            ...template,
            version: 1,
            metadata: {
              source: 'system',
              lastModifiedBy: 'system'
            },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (insertedTemplates.length > 0) {
        await collection.insertMany(insertedTemplates, { session });
        logger.info(`Seeded ${insertedTemplates.length} email templates`);
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ isActive: 1 }, { session });

      return { count: insertedTemplates.length };

    } catch (error) {
      logger.error('Failed to seed email templates', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds notification types
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedNotificationTypes(session) {
    try {
      logger.info('Seeding notification types');

      const db = BaseModel.getDatabase();
      const collection = db.collection(InitialDataSeeder.#COLLECTIONS.NOTIFICATION_TYPES);

      const notificationTypes = [
        {
          code: 'system-alert',
          name: 'System Alert',
          description: 'Critical system notifications',
          category: 'system',
          channels: ['email', 'in-app'],
          priority: 'high',
          defaultEnabled: true
        },
        {
          code: 'security-alert',
          name: 'Security Alert',
          description: 'Security-related notifications',
          category: 'security',
          channels: ['email', 'in-app', 'sms'],
          priority: 'critical',
          defaultEnabled: true
        },
        {
          code: 'user-activity',
          name: 'User Activity',
          description: 'User action notifications',
          category: 'user',
          channels: ['in-app'],
          priority: 'normal',
          defaultEnabled: false
        },
        {
          code: 'task-reminder',
          name: 'Task Reminder',
          description: 'Task and deadline reminders',
          category: 'business',
          channels: ['email', 'in-app'],
          priority: 'normal',
          defaultEnabled: true
        },
        {
          code: 'report-ready',
          name: 'Report Ready',
          description: 'Report generation completion',
          category: 'business',
          channels: ['email', 'in-app'],
          priority: 'normal',
          defaultEnabled: true
        }
      ];

      const insertedTypes = [];
      
      for (const type of notificationTypes) {
        const existing = await collection.findOne({ code: type.code }, { session });
        
        if (!existing) {
          insertedTypes.push({
            ...type,
            isActive: true,
            metadata: {
              source: 'system',
              immutable: type.category === 'system' || type.category === 'security'
            },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (insertedTypes.length > 0) {
        await collection.insertMany(insertedTypes, { session });
        logger.info(`Seeded ${insertedTypes.length} notification types`);
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ priority: 1 }, { session });

      return { count: insertedTypes.length };

    } catch (error) {
      logger.error('Failed to seed notification types', error);
      throw error;
    }
  }

  /**
   * @private
   * Assigns default permissions to roles
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<void>}
   */
  static async #assignDefaultPermissions(session) {
    try {
      const db = BaseModel.getDatabase();
      const rolesCollection = db.collection(InitialDataSeeder.#COLLECTIONS.ROLES);
      const permissionsCollection = db.collection(InitialDataSeeder.#COLLECTIONS.PERMISSIONS);

      // Define default permissions for each role
      const rolePermissions = {
        [ROLES.SUPER_ADMIN]: await permissionsCollection.find({}, { session }).toArray(),
        [ROLES.ADMIN]: await permissionsCollection.find({
          'metadata.risk': { $ne: 'critical' }
        }, { session }).toArray(),
        [ROLES.MANAGER]: await permissionsCollection.find({
          $or: [
            { category: 'users' },
            { category: 'organizations' },
            { category: 'business' },
            { action: 'read' }
          ]
        }, { session }).toArray(),
        [ROLES.USER]: await permissionsCollection.find({
          action: { $in: ['read', 'create', 'update'] },
          resource: { $nin: ['user', 'organization', 'system'] }
        }, { session }).toArray(),
        [ROLES.GUEST]: await permissionsCollection.find({
          action: 'read',
          resource: { $nin: ['user', 'organization', 'system', 'security'] }
        }, { session }).toArray()
      };

      // Update each role with permissions
      for (const [roleCode, permissions] of Object.entries(rolePermissions)) {
        await rolesCollection.updateOne(
          { code: roleCode },
          { 
            $set: { 
              permissions: permissions.map(p => p.code),
              updatedAt: new Date()
            }
          },
          { session }
        );
      }

      logger.info('Assigned default permissions to roles');

    } catch (error) {
      logger.error('Failed to assign permissions', error);
      throw error;
    }
  }

  /**
   * @private
   * Helper methods for generating descriptions and metadata
   */

  static #getRoleDescription(role) {
    const descriptions = {
      [ROLES.SUPER_ADMIN]: 'Full system access with all permissions',
      [ROLES.ADMIN]: 'Administrative access with most permissions',
      [ROLES.MANAGER]: 'Management access for teams and resources',
      [ROLES.USER]: 'Standard user access for regular operations',
      [ROLES.GUEST]: 'Limited read-only access'
    };
    return descriptions[role] || 'System role';
  }

  static #getPermissionDescription(permission) {
    const [resource, action] = permission.split(':');
    return `Permission to ${action} ${resource} resources`;
  }

  static #getPermissionRiskLevel(permission) {
    if (permission.includes('delete') || permission.includes('system')) {
      return 'critical';
    }
    if (permission.includes('update') || permission.includes('admin')) {
      return 'high';
    }
    if (permission.includes('create')) {
      return 'medium';
    }
    return 'low';
  }

  static #getStatusDescription(type, code) {
    const descriptions = {
      user: {
        active: 'User account is active and accessible',
        inactive: 'User account is inactive',
        suspended: 'User account is temporarily suspended',
        deleted: 'User account has been deleted'
      },
      project: {
        draft: 'Project is in draft status',
        active: 'Project is currently active',
        completed: 'Project has been completed',
        cancelled: 'Project has been cancelled'
      }
    };
    return descriptions[type]?.[code] || `${type} status: ${code}`;
  }

  static #getStatusOrder(type, code) {
    const orders = {
      user: { active: 1, inactive: 2, suspended: 3, deleted: 4 },
      project: { draft: 1, active: 2, completed: 3, cancelled: 4 }
    };
    return orders[type]?.[code] || 99;
  }

  static #getStatusColor(code) {
    const colors = {
      active: '#10B981',
      completed: '#10B981',
      inactive: '#6B7280',
      draft: '#3B82F6',
      suspended: '#F59E0B',
      cancelled: '#EF4444',
      deleted: '#DC2626'
    };
    return colors[code] || '#6B7280';
  }

  static #getStatusIcon(code) {
    const icons = {
      active: 'check-circle',
      completed: 'check-circle',
      inactive: 'x-circle',
      draft: 'edit',
      suspended: 'pause-circle',
      cancelled: 'x-circle',
      deleted: 'trash'
    };
    return icons[code] || 'info';
  }

  static #isDefaultStatus(type, code) {
    const defaults = {
      user: 'active',
      project: 'draft'
    };
    return defaults[type] === code;
  }

  static #getEmailTemplate(templateType) {
    // Return basic HTML templates - in production, these would be more sophisticated
    const baseTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563EB; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f5f5f5; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{subject}}</h1>
    </div>
    <div class="content">
      {{content}}
    </div>
    <div class="footer">
      <p>&copy; 2024 InsightSerenity. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    return baseTemplate;
  }
}

module.exports = InitialDataSeeder;