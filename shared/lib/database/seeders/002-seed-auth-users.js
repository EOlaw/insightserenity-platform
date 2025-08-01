'use strict';

/**
 * @fileoverview Seeds authentication users including super admin and test users
 * @module shared/lib/database/seeders/002-seed-auth-users
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/auth/services/password-service
 * @requires module:shared/lib/utils/validators/auth-validators
 * @requires module:shared/lib/utils/validators/user-validators
 * @requires module:shared/lib/utils/constants/roles
 * @requires module:shared/lib/utils/helpers/crypto-helper
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const UserModel = require('..\models\users\user-model');
const PasswordService = require('../../auth/services/password-service');
const { validateEmail, validatePassword } = require('../../utils/validators/auth-validators');
const { validateUserData } = require('../../utils/validators/user-validators');
const { ROLES } = require('../../utils/constants/roles');
const { generateSecureToken } = require('../../utils/helpers/crypto-helper');

/**
 * @class AuthUsersSeeder
 * @description Seeds system authentication users for various roles and testing
 */
class AuthUsersSeeder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DEFAULT_PASSWORD = 'Adm1n@2024!'; // Will be changed on first login
  static #TEST_PASSWORD = 'Test@1234!';
  
  static #SYSTEM_USERS = {
    SUPER_ADMIN: 'superadmin',
    SYSTEM_SERVICE: 'system.service',
    API_SERVICE: 'api.service'
  };

  /**
   * Seeds authentication users
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
      
      logger.info('Starting authentication users seeding', { environment });

      let totalUsers = 0;

      // Seed super admin
      const superAdminResult = await AuthUsersSeeder.#seedSuperAdmin(session, environment);
      totalUsers += superAdminResult.count;

      // Seed system service accounts
      const serviceResult = await AuthUsersSeeder.#seedServiceAccounts(session, environment);
      totalUsers += serviceResult.count;

      // Seed test users (non-production only)
      if (environment !== 'production') {
        const testResult = await AuthUsersSeeder.#seedTestUsers(session);
        totalUsers += testResult.count;
      }

      // Seed role-based demo users (non-production only)
      if (environment !== 'production') {
        const demoResult = await AuthUsersSeeder.#seedDemoUsers(session);
        totalUsers += demoResult.count;
      }

      logger.info('Authentication users seeding completed', { 
        totalUsers,
        environment,
        details: {
          superAdmin: superAdminResult.count,
          serviceAccounts: serviceResult.count,
          testUsers: environment !== 'production' ? testResult?.count || 0 : 0,
          demoUsers: environment !== 'production' ? demoResult?.count || 0 : 0
        }
      });

      return { recordsSeeded: totalUsers };

    } catch (error) {
      logger.error('Authentication users seeding failed', error);
      throw new AppError(
        'Failed to seed authentication users',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seeded authentication users
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const issues = [];
      const db = UserModel.getDatabase();
      const collection = db.collection('users');

      // Check for super admin
      const superAdmin = await collection.findOne({ 
        username: AuthUsersSeeder.#SYSTEM_USERS.SUPER_ADMIN,
        'roles.code': ROLES.SUPER_ADMIN
      });

      if (!superAdmin) {
        issues.push({
          type: 'user',
          issue: 'Super admin user not found'
        });
      }

      // Check for system service accounts
      const systemService = await collection.findOne({ 
        username: AuthUsersSeeder.#SYSTEM_USERS.SYSTEM_SERVICE 
      });

      if (!systemService) {
        issues.push({
          type: 'user',
          issue: 'System service account not found'
        });
      }

      // Validate user data integrity
      const users = await collection.find({ isSystem: true }).toArray();
      
      for (const user of users) {
        if (!user.password || !user.email || !user.roles || user.roles.length === 0) {
          issues.push({
            type: 'user',
            issue: `User ${user.username} has incomplete data`
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
   * Seeds super admin user
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedSuperAdmin(session, environment) {
    try {
      logger.info('Seeding super admin user');

      const db = UserModel.getDatabase();
      const usersCollection = db.collection('users');
      const rolesCollection = db.collection('roles');

      // Check if super admin already exists
      const existingAdmin = await usersCollection.findOne(
        { username: AuthUsersSeeder.#SYSTEM_USERS.SUPER_ADMIN },
        { session }
      );

      if (existingAdmin) {
        logger.info('Super admin already exists, skipping');
        return { count: 0 };
      }

      // Get super admin role
      const superAdminRole = await rolesCollection.findOne(
        { code: ROLES.SUPER_ADMIN },
        { session }
      );

      if (!superAdminRole) {
        throw new AppError('Super admin role not found', 500, 'ROLE_NOT_FOUND');
      }

      // Hash password
      const hashedPassword = await PasswordService.hashPassword(AuthUsersSeeder.#DEFAULT_PASSWORD);

      // Create super admin user
      const superAdmin = {
        username: AuthUsersSeeder.#SYSTEM_USERS.SUPER_ADMIN,
        email: 'superadmin@insightserenity.com',
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Administrator',
        displayName: 'Super Admin',
        roles: [{
          roleId: superAdminRole._id,
          code: superAdminRole.code,
          name: superAdminRole.name,
          assignedAt: new Date(),
          assignedBy: 'system'
        }],
        profile: {
          title: 'System Administrator',
          department: 'IT',
          phone: '+1-000-000-0000',
          timezone: 'UTC',
          locale: 'en-US',
          avatar: null
        },
        security: {
          twoFactorEnabled: environment === 'production',
          twoFactorMethod: null,
          passwordChangedAt: new Date(),
          passwordExpiresAt: new Date(Date.now() + (environment === 'production' ? 0 : 90 * 24 * 60 * 60 * 1000)), // Immediate in prod, 90 days in dev
          mustChangePassword: environment === 'production',
          securityQuestions: [],
          loginAttempts: 0,
          lockoutUntil: null,
          lastLoginAt: null,
          lastLoginIp: null,
          activeSessions: []
        },
        preferences: {
          notifications: {
            email: true,
            inApp: true,
            sms: false
          },
          theme: 'system',
          language: 'en',
          dashboardLayout: 'default'
        },
        status: 'active',
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isPhoneVerified: false,
        isSystem: true,
        metadata: {
          source: 'system',
          createdBySystem: true,
          environment,
          version: '1.0.0'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate user data
      const validation = validateUserData(superAdmin);
      if (!validation.isValid) {
        throw new AppError('Invalid super admin data', 400, 'VALIDATION_ERROR', validation.errors);
      }

      await usersCollection.insertOne(superAdmin, { session });

      logger.info('Super admin user created successfully', {
        username: superAdmin.username,
        email: superAdmin.email
      });

      return { count: 1 };

    } catch (error) {
      logger.error('Failed to seed super admin', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds system service accounts
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedServiceAccounts(session, environment) {
    try {
      logger.info('Seeding system service accounts');

      const db = UserModel.getDatabase();
      const usersCollection = db.collection('users');
      const rolesCollection = db.collection('roles');

      // Get admin role for service accounts
      const adminRole = await rolesCollection.findOne(
        { code: ROLES.ADMIN },
        { session }
      );

      if (!adminRole) {
        throw new AppError('Admin role not found', 500, 'ROLE_NOT_FOUND');
      }

      const serviceAccounts = [
        {
          username: AuthUsersSeeder.#SYSTEM_USERS.SYSTEM_SERVICE,
          email: 'system.service@insightserenity.com',
          firstName: 'System',
          lastName: 'Service',
          displayName: 'System Service Account',
          description: 'Internal system service account for automated processes',
          permissions: ['system:*']
        },
        {
          username: AuthUsersSeeder.#SYSTEM_USERS.API_SERVICE,
          email: 'api.service@insightserenity.com',
          firstName: 'API',
          lastName: 'Service',
          displayName: 'API Service Account',
          description: 'Service account for API integrations',
          permissions: ['api:*']
        },
        {
          username: 'monitoring.service',
          email: 'monitoring.service@insightserenity.com',
          firstName: 'Monitoring',
          lastName: 'Service',
          displayName: 'Monitoring Service Account',
          description: 'Service account for system monitoring',
          permissions: ['monitoring:*', 'system:read']
        },
        {
          username: 'backup.service',
          email: 'backup.service@insightserenity.com',
          firstName: 'Backup',
          lastName: 'Service',
          displayName: 'Backup Service Account',
          description: 'Service account for backup operations',
          permissions: ['backup:*', 'system:read']
        }
      ];

      let count = 0;

      for (const accountData of serviceAccounts) {
        const existing = await usersCollection.findOne(
          { username: accountData.username },
          { session }
        );

        if (existing) {
          logger.info(`Service account ${accountData.username} already exists, skipping`);
          continue;
        }

        // Generate secure API key for service accounts
        const apiKey = await generateSecureToken(32);
        const hashedApiKey = await PasswordService.hashPassword(apiKey);

        const serviceAccount = {
          ...accountData,
          password: hashedApiKey,
          apiKey: {
            hash: hashedApiKey,
            prefix: apiKey.substring(0, 8),
            createdAt: new Date(),
            lastUsedAt: null,
            expiresAt: environment === 'production' 
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
              : null // Never expires in dev
          },
          roles: [{
            roleId: adminRole._id,
            code: adminRole.code,
            name: adminRole.name,
            assignedAt: new Date(),
            assignedBy: 'system'
          }],
          profile: {
            title: 'Service Account',
            department: 'System',
            timezone: 'UTC',
            locale: 'en-US'
          },
          security: {
            twoFactorEnabled: false,
            passwordChangedAt: new Date(),
            passwordExpiresAt: null, // Service accounts don't expire
            mustChangePassword: false,
            loginAttempts: 0,
            activeSessions: []
          },
          preferences: {
            notifications: {
              email: false,
              inApp: false,
              sms: false
            }
          },
          status: 'active',
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          isSystem: true,
          isServiceAccount: true,
          metadata: {
            source: 'system',
            accountType: 'service',
            environment,
            version: '1.0.0',
            permissions: accountData.permissions
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await usersCollection.insertOne(serviceAccount, { session });
        count++;

        // Log API key for initial setup (only in non-production)
        if (environment !== 'production') {
          logger.info(`Service account created: ${accountData.username}`, {
            apiKeyPrefix: apiKey.substring(0, 8) + '...'
          });
        }
      }

      logger.info(`Created ${count} service accounts`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed service accounts', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test users for development/testing
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestUsers(session) {
    try {
      logger.info('Seeding test users');

      const db = UserModel.getDatabase();
      const usersCollection = db.collection('users');
      const rolesCollection = db.collection('roles');

      // Get user role
      const userRole = await rolesCollection.findOne(
        { code: ROLES.USER },
        { session }
      );

      if (!userRole) {
        throw new AppError('User role not found', 500, 'ROLE_NOT_FOUND');
      }

      const testUsers = [
        {
          username: 'test.user1',
          email: 'test.user1@example.com',
          firstName: 'Test',
          lastName: 'User One',
          displayName: 'Test User 1'
        },
        {
          username: 'test.user2',
          email: 'test.user2@example.com',
          firstName: 'Test',
          lastName: 'User Two',
          displayName: 'Test User 2'
        },
        {
          username: 'test.user3',
          email: 'test.user3@example.com',
          firstName: 'Test',
          lastName: 'User Three',
          displayName: 'Test User 3'
        }
      ];

      const hashedTestPassword = await PasswordService.hashPassword(AuthUsersSeeder.#TEST_PASSWORD);
      let count = 0;

      for (const userData of testUsers) {
        const existing = await usersCollection.findOne(
          { username: userData.username },
          { session }
        );

        if (existing) {
          logger.info(`Test user ${userData.username} already exists, skipping`);
          continue;
        }

        const testUser = {
          ...userData,
          password: hashedTestPassword,
          roles: [{
            roleId: userRole._id,
            code: userRole.code,
            name: userRole.name,
            assignedAt: new Date(),
            assignedBy: 'system'
          }],
          profile: {
            title: 'Test User',
            department: 'Testing',
            phone: '+1-555-000-0000',
            timezone: 'America/New_York',
            locale: 'en-US'
          },
          security: {
            twoFactorEnabled: false,
            passwordChangedAt: new Date(),
            passwordExpiresAt: null,
            mustChangePassword: false,
            loginAttempts: 0,
            activeSessions: []
          },
          preferences: {
            notifications: {
              email: true,
              inApp: true,
              sms: false
            },
            theme: 'light',
            language: 'en',
            dashboardLayout: 'default'
          },
          status: 'active',
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          isPhoneVerified: false,
          isSystem: false,
          metadata: {
            source: 'seeder',
            purpose: 'testing',
            environment: 'development'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await usersCollection.insertOne(testUser, { session });
        count++;
      }

      logger.info(`Created ${count} test users`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed test users', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds demo users for each role
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedDemoUsers(session) {
    try {
      logger.info('Seeding demo users for each role');

      const db = UserModel.getDatabase();
      const usersCollection = db.collection('users');
      const rolesCollection = db.collection('roles');

      // Get all roles except super admin
      const roles = await rolesCollection.find(
        { code: { $ne: ROLES.SUPER_ADMIN } },
        { session }
      ).toArray();

      const hashedDemoPassword = await PasswordService.hashPassword(AuthUsersSeeder.#TEST_PASSWORD);
      let count = 0;

      for (const role of roles) {
        const username = `demo.${role.code.toLowerCase()}`;
        const existing = await usersCollection.findOne(
          { username },
          { session }
        );

        if (existing) {
          logger.info(`Demo user ${username} already exists, skipping`);
          continue;
        }

        const demoUser = {
          username,
          email: `${username}@demo.insightserenity.com`,
          password: hashedDemoPassword,
          firstName: 'Demo',
          lastName: role.name,
          displayName: `Demo ${role.name}`,
          roles: [{
            roleId: role._id,
            code: role.code,
            name: role.name,
            assignedAt: new Date(),
            assignedBy: 'system'
          }],
          profile: {
            title: `${role.name} Demo Account`,
            department: 'Demo',
            phone: '+1-555-123-4567',
            timezone: 'America/New_York',
            locale: 'en-US',
            bio: `This is a demo account for the ${role.name} role. Use this account to explore the platform features available to ${role.name} users.`
          },
          security: {
            twoFactorEnabled: false,
            passwordChangedAt: new Date(),
            passwordExpiresAt: null,
            mustChangePassword: false,
            loginAttempts: 0,
            activeSessions: []
          },
          preferences: {
            notifications: {
              email: false,
              inApp: true,
              sms: false
            },
            theme: 'light',
            language: 'en',
            dashboardLayout: role.code === ROLES.ADMIN ? 'admin' : 'default'
          },
          status: 'active',
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          isPhoneVerified: false,
          isSystem: false,
          isDemo: true,
          metadata: {
            source: 'seeder',
            purpose: 'demo',
            role: role.code,
            environment: 'development',
            features: AuthUsersSeeder.#getDemoFeatures(role.code)
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await usersCollection.insertOne(demoUser, { session });
        count++;

        logger.info(`Created demo user: ${username}`);
      }

      // Create indexes for efficient querying
      await usersCollection.createIndex({ username: 1 }, { unique: true, session });
      await usersCollection.createIndex({ email: 1 }, { unique: true, session });
      await usersCollection.createIndex({ 'roles.code': 1 }, { session });
      await usersCollection.createIndex({ status: 1 }, { session });
      await usersCollection.createIndex({ isSystem: 1 }, { session });
      await usersCollection.createIndex({ isDemo: 1 }, { session });
      await usersCollection.createIndex({ createdAt: -1 }, { session });

      logger.info(`Created ${count} demo users`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed demo users', error);
      throw error;
    }
  }

  /**
   * @private
   * Gets demo features based on role
   * @static
   * @param {string} roleCode - Role code
   * @returns {Array<string>} Feature list
   */
  static #getDemoFeatures(roleCode) {
    const features = {
      [ROLES.ADMIN]: [
        'user_management',
        'organization_management',
        'system_settings',
        'reports',
        'analytics',
        'billing',
        'security_settings'
      ],
      [ROLES.MANAGER]: [
        'team_management',
        'project_management',
        'reports',
        'analytics',
        'resource_allocation'
      ],
      [ROLES.USER]: [
        'profile_management',
        'project_participation',
        'basic_reports',
        'notifications'
      ],
      [ROLES.GUEST]: [
        'view_public_content',
        'limited_reports'
      ]
    };

    return features[roleCode] || [];
  }
}

module.exports = AuthUsersSeeder;