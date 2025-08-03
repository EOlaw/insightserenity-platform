'use strict';

/**
 * @fileoverview Seeds granular permissions and permission sets for RBAC
 * @module shared/lib/database/seeders/004-seed-permissions
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/security/access-control/permission-service
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const BaseModel = require('../models/base-model');
const PermissionService = require('../../security/access-control/permission-service');
const { PERMISSIONS, PERMISSION_CATEGORIES } = require('../../utils/constants/permissions');
const { ROLES } = require('../../utils/constants/roles');

/**
 * @class PermissionsSeeder
 * @description Seeds comprehensive permission system with granular access controls
 */
class PermissionsSeeder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #COLLECTIONS = {
    PERMISSIONS: 'permissions',
    PERMISSION_SETS: 'permission_sets',
    ROLES: 'roles',
    ROLE_PERMISSIONS: 'role_permissions'
  };

  static #PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete', 'list', 'manage', 'execute'];
  
  static #RESOURCE_TYPES = {
    // Core Resources
    USER: 'user',
    ORGANIZATION: 'organization',
    TENANT: 'tenant',
    ROLE: 'role',
    PERMISSION: 'permission',
    
    // Business Resources
    CLIENT: 'client',
    PROJECT: 'project',
    CONSULTANT: 'consultant',
    ENGAGEMENT: 'engagement',
    
    // Recruitment Resources
    JOB: 'job',
    CANDIDATE: 'candidate',
    APPLICATION: 'application',
    PARTNER: 'partner',
    
    // System Resources
    SYSTEM: 'system',
    SETTINGS: 'settings',
    AUDIT: 'audit',
    REPORT: 'report',
    ANALYTICS: 'analytics',
    INTEGRATION: 'integration',
    WEBHOOK: 'webhook',
    API: 'api'
  };

  /**
   * Seeds permissions
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
      
      logger.info('Starting permissions seeding', { environment });

      let totalRecords = 0;

      // Seed individual permissions
      const permissionsResult = await PermissionsSeeder.#seedIndividualPermissions(session);
      totalRecords += permissionsResult.count;

      // Seed permission sets
      const setsResult = await PermissionsSeeder.#seedPermissionSets(session);
      totalRecords += setsResult.count;

      // Seed role-permission mappings
      const mappingsResult = await PermissionsSeeder.#seedRolePermissionMappings(session);
      totalRecords += mappingsResult.count;

      // Seed custom permissions for features
      const customResult = await PermissionsSeeder.#seedCustomPermissions(session, environment);
      totalRecords += customResult.count;

      // Seed API permissions
      const apiResult = await PermissionsSeeder.#seedApiPermissions(session);
      totalRecords += apiResult.count;

      logger.info('Permissions seeding completed', { 
        totalRecords,
        details: {
          permissions: permissionsResult.count,
          permissionSets: setsResult.count,
          roleMappings: mappingsResult.count,
          customPermissions: customResult.count,
          apiPermissions: apiResult.count
        }
      });

      return { recordsSeeded: totalRecords };

    } catch (error) {
      logger.error('Permissions seeding failed', error);
      throw new AppError(
        'Failed to seed permissions',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seeded permissions
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const issues = [];
      const db = BaseModel.getDatabase();

      // Check permission count
      const permissionsCollection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSIONS);
      const permissionCount = await permissionsCollection.countDocuments();
      
      const expectedMinPermissions = Object.keys(PermissionsSeeder.#RESOURCE_TYPES).length * 
                                    PermissionsSeeder.#PERMISSION_ACTIONS.length;

      if (permissionCount < expectedMinPermissions) {
        issues.push({
          type: 'permissions',
          issue: `Insufficient permissions: expected at least ${expectedMinPermissions}, found ${permissionCount}`
        });
      }

      // Check role-permission assignments
      const rolesCollection = db.collection(PermissionsSeeder.#COLLECTIONS.ROLES);
      const roles = await rolesCollection.find({}).toArray();

      for (const role of roles) {
        if (!role.permissions || role.permissions.length === 0) {
          issues.push({
            type: 'role_permissions',
            issue: `Role ${role.code} has no permissions assigned`
          });
        }
      }

      // Validate permission structure
      const samplePermissions = await permissionsCollection.find({}).limit(10).toArray();
      
      for (const permission of samplePermissions) {
        if (!permission.resource || !permission.action || !permission.code) {
          issues.push({
            type: 'permission_structure',
            issue: `Permission ${permission._id} has invalid structure`
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
   * Seeds individual granular permissions
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedIndividualPermissions(session) {
    try {
      logger.info('Seeding individual permissions');

      const db = BaseModel.getDatabase();
      const collection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSIONS);

      const permissions = [];

      // Generate permissions for each resource and action combination
      for (const [resourceKey, resourceValue] of Object.entries(PermissionsSeeder.#RESOURCE_TYPES)) {
        for (const action of PermissionsSeeder.#PERMISSION_ACTIONS) {
          const code = `${resourceValue}:${action}`;
          
          const existing = await collection.findOne({ code }, { session });
          if (existing) continue;

          const permission = {
            code,
            name: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resourceKey.toLowerCase()}`,
            description: PermissionsSeeder.#generatePermissionDescription(resourceValue, action),
            category: PermissionsSeeder.#getResourceCategory(resourceValue),
            resource: resourceValue,
            action,
            scope: PermissionsSeeder.#getPermissionScope(resourceValue, action),
            risk: PermissionsSeeder.#calculateRiskLevel(resourceValue, action),
            dependencies: PermissionsSeeder.#getPermissionDependencies(resourceValue, action),
            constraints: PermissionsSeeder.#getPermissionConstraints(resourceValue, action),
            metadata: {
              resourceType: resourceKey,
              actionType: action,
              isSystem: true,
              requiresMFA: PermissionsSeeder.#requiresMFA(resourceValue, action),
              auditLevel: PermissionsSeeder.#getAuditLevel(resourceValue, action),
              dataClassification: PermissionsSeeder.#getDataClassification(resourceValue)
            },
            isActive: true,
            isSystem: true,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          permissions.push(permission);
        }
      }

      // Add special composite permissions
      const compositePermissions = PermissionsSeeder.#generateCompositePermissions();
      for (const compPerm of compositePermissions) {
        const existing = await collection.findOne({ code: compPerm.code }, { session });
        if (!existing) {
          permissions.push({
            ...compPerm,
            isActive: true,
            isSystem: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (permissions.length > 0) {
        await collection.insertMany(permissions, { session });
        logger.info(`Seeded ${permissions.length} individual permissions`);
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ resource: 1, action: 1 }, { session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ 'metadata.risk': 1 }, { session });

      return { count: permissions.length };

    } catch (error) {
      logger.error('Failed to seed individual permissions', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds permission sets (grouped permissions)
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPermissionSets(session) {
    try {
      logger.info('Seeding permission sets');

      const db = BaseModel.getDatabase();
      const collection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSION_SETS);

      const permissionSets = [
        {
          code: 'user-management',
          name: 'User Management',
          description: 'Complete user management capabilities',
          permissions: [
            'user:create', 'user:read', 'user:update', 'user:delete', 'user:list',
            'role:read', 'role:list', 'permission:read', 'permission:list'
          ],
          category: 'administration'
        },
        {
          code: 'organization-admin',
          name: 'Organization Administration',
          description: 'Full organization management permissions',
          permissions: [
            'organization:create', 'organization:read', 'organization:update', 
            'organization:delete', 'organization:list', 'organization:manage',
            'tenant:read', 'tenant:update', 'tenant:manage',
            'settings:read', 'settings:update', 'settings:manage'
          ],
          category: 'administration'
        },
        {
          code: 'consulting-manager',
          name: 'Consulting Management',
          description: 'Manage consulting operations',
          permissions: [
            'client:create', 'client:read', 'client:update', 'client:list',
            'project:create', 'project:read', 'project:update', 'project:list',
            'consultant:read', 'consultant:list', 'consultant:manage',
            'engagement:create', 'engagement:read', 'engagement:update', 'engagement:list'
          ],
          category: 'business'
        },
        {
          code: 'recruitment-manager',
          name: 'Recruitment Management',
          description: 'Manage recruitment operations',
          permissions: [
            'job:create', 'job:read', 'job:update', 'job:delete', 'job:list',
            'candidate:create', 'candidate:read', 'candidate:update', 'candidate:list',
            'application:read', 'application:update', 'application:list',
            'partner:read', 'partner:list'
          ],
          category: 'business'
        },
        {
          code: 'reporting-analytics',
          name: 'Reporting & Analytics',
          description: 'Access to reports and analytics',
          permissions: [
            'report:read', 'report:create', 'report:list', 'report:execute',
            'analytics:read', 'analytics:execute'
          ],
          category: 'analytics'
        },
        {
          code: 'system-admin',
          name: 'System Administration',
          description: 'System-level administration permissions',
          permissions: [
            'system:read', 'system:update', 'system:manage',
            'audit:read', 'audit:list',
            'integration:create', 'integration:read', 'integration:update', 
            'integration:delete', 'integration:list',
            'webhook:create', 'webhook:read', 'webhook:update', 'webhook:delete'
          ],
          category: 'system'
        },
        {
          code: 'api-full-access',
          name: 'API Full Access',
          description: 'Complete API access permissions',
          permissions: [
            'api:read', 'api:create', 'api:update', 'api:delete', 'api:execute'
          ],
          category: 'api'
        },
        {
          code: 'read-only',
          name: 'Read Only Access',
          description: 'Read-only access to all resources',
          permissions: Object.values(PermissionsSeeder.#RESOURCE_TYPES).map(r => `${r}:read`),
          category: 'basic'
        },
        {
          code: 'self-service',
          name: 'Self Service',
          description: 'Permissions for self-service operations',
          permissions: [
            'user:read', 'user:update', // Own profile only
            'project:read', 'project:list', // Assigned projects
            'report:read', 'report:list' // Own reports
          ],
          category: 'basic',
          constraints: {
            scopeToSelf: true
          }
        }
      ];

      let count = 0;

      for (const setData of permissionSets) {
        const existing = await collection.findOne({ code: setData.code }, { session });
        
        if (!existing) {
          const permissionSet = {
            ...setData,
            isActive: true,
            isSystem: true,
            metadata: {
              source: 'system',
              immutable: true
            },
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await collection.insertOne(permissionSet, { session });
          count++;
        }
      }

      // Create indexes
      await collection.createIndex({ code: 1 }, { unique: true, session });
      await collection.createIndex({ category: 1 }, { session });

      logger.info(`Created ${count} permission sets`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed permission sets', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds role-permission mappings
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedRolePermissionMappings(session) {
    try {
      logger.info('Seeding role-permission mappings');

      const db = BaseModel.getDatabase();
      const rolesCollection = db.collection(PermissionsSeeder.#COLLECTIONS.ROLES);
      const permissionsCollection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSIONS);
      const setsCollection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSION_SETS);

      // Get all permissions and sets
      const allPermissions = await permissionsCollection.find({}, { session }).toArray();
      const allSets = await setsCollection.find({}, { session }).toArray();

      // Define role permission mappings
      const roleMappings = {
        [ROLES.SUPER_ADMIN]: {
          permissions: allPermissions.map(p => p.code),
          sets: allSets.map(s => s.code),
          description: 'Full system access'
        },
        [ROLES.ADMIN]: {
          sets: [
            'user-management',
            'organization-admin',
            'consulting-manager',
            'recruitment-manager',
            'reporting-analytics'
          ],
          exclude: ['system:delete', 'system:manage', 'audit:delete'],
          description: 'Administrative access'
        },
        [ROLES.MANAGER]: {
          sets: [
            'consulting-manager',
            'recruitment-manager',
            'reporting-analytics'
          ],
          additional: ['user:read', 'user:list', 'organization:read'],
          description: 'Management access'
        },
        [ROLES.USER]: {
          sets: ['self-service'],
          additional: [
            'client:read', 'project:read', 'job:read', 
            'candidate:read', 'report:read'
          ],
          description: 'Standard user access'
        },
        [ROLES.GUEST]: {
          sets: ['read-only'],
          exclude: [
            'user:read', 'audit:read', 'system:read', 
            'settings:read', 'permission:read'
          ],
          description: 'Guest access'
        }
      };

      let updateCount = 0;

      for (const [roleCode, mapping] of Object.entries(roleMappings)) {
        const role = await rolesCollection.findOne({ code: roleCode }, { session });
        
        if (!role) {
          logger.warn(`Role ${roleCode} not found, skipping permission mapping`);
          continue;
        }

        // Build permission list
        let permissions = [];

        // Add permissions from sets
        if (mapping.sets) {
          for (const setCode of mapping.sets) {
            const set = allSets.find(s => s.code === setCode);
            if (set) {
              permissions = permissions.concat(set.permissions);
            }
          }
        }

        // Add individual permissions
        if (mapping.permissions) {
          permissions = permissions.concat(mapping.permissions);
        }

        // Add additional permissions
        if (mapping.additional) {
          permissions = permissions.concat(mapping.additional);
        }

        // Remove excluded permissions
        if (mapping.exclude) {
          permissions = permissions.filter(p => !mapping.exclude.includes(p));
        }

        // Remove duplicates
        permissions = [...new Set(permissions)];

        // Update role with permissions
        await rolesCollection.updateOne(
          { _id: role._id },
          {
            $set: {
              permissions,
              permissionSets: mapping.sets || [],
              permissionMetadata: {
                totalPermissions: permissions.length,
                description: mapping.description,
                lastUpdated: new Date()
              },
              updatedAt: new Date()
            }
          },
          { session }
        );

        updateCount++;

        logger.info(`Updated role ${roleCode} with ${permissions.length} permissions`);
      }

      return { count: updateCount };

    } catch (error) {
      logger.error('Failed to seed role-permission mappings', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds custom permissions for specific features
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedCustomPermissions(session, environment) {
    try {
      logger.info('Seeding custom permissions');

      const db = BaseModel.getDatabase();
      const collection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSIONS);

      const customPermissions = [
        // White Label Permissions
        {
          code: 'whitelabel:configure',
          name: 'Configure White Label',
          description: 'Configure white label settings',
          category: 'features',
          resource: 'whitelabel',
          action: 'configure',
          risk: 'medium'
        },
        {
          code: 'whitelabel:manage',
          name: 'Manage White Label',
          description: 'Full white label management',
          category: 'features',
          resource: 'whitelabel',
          action: 'manage',
          risk: 'high'
        },
        
        // Billing Permissions
        {
          code: 'billing:view',
          name: 'View Billing',
          description: 'View billing information',
          category: 'financial',
          resource: 'billing',
          action: 'view',
          risk: 'low'
        },
        {
          code: 'billing:manage',
          name: 'Manage Billing',
          description: 'Manage billing and payments',
          category: 'financial',
          resource: 'billing',
          action: 'manage',
          risk: 'critical'
        },
        
        // Data Export Permissions
        {
          code: 'data:export',
          name: 'Export Data',
          description: 'Export system data',
          category: 'data',
          resource: 'data',
          action: 'export',
          risk: 'high'
        },
        {
          code: 'data:import',
          name: 'Import Data',
          description: 'Import data into system',
          category: 'data',
          resource: 'data',
          action: 'import',
          risk: 'critical'
        },
        
        // Compliance Permissions
        {
          code: 'compliance:audit',
          name: 'Compliance Audit',
          description: 'Perform compliance audits',
          category: 'compliance',
          resource: 'compliance',
          action: 'audit',
          risk: 'medium'
        },
        {
          code: 'compliance:report',
          name: 'Compliance Reporting',
          description: 'Generate compliance reports',
          category: 'compliance',
          resource: 'compliance',
          action: 'report',
          risk: 'medium'
        },
        
        // Advanced Analytics
        {
          code: 'analytics:advanced',
          name: 'Advanced Analytics',
          description: 'Access advanced analytics features',
          category: 'analytics',
          resource: 'analytics',
          action: 'advanced',
          risk: 'low'
        },
        {
          code: 'analytics:export',
          name: 'Export Analytics',
          description: 'Export analytics data',
          category: 'analytics',
          resource: 'analytics',
          action: 'export',
          risk: 'medium'
        }
      ];

      // Add environment-specific permissions
      if (environment === 'development') {
        customPermissions.push(
          {
            code: 'debug:enable',
            name: 'Enable Debug Mode',
            description: 'Enable system debug mode',
            category: 'development',
            resource: 'debug',
            action: 'enable',
            risk: 'critical'
          },
          {
            code: 'test:execute',
            name: 'Execute Tests',
            description: 'Execute system tests',
            category: 'development',
            resource: 'test',
            action: 'execute',
            risk: 'high'
          }
        );
      }

      let count = 0;

      for (const permData of customPermissions) {
        const existing = await collection.findOne({ code: permData.code }, { session });
        
        if (!existing) {
          const permission = {
            ...permData,
            scope: 'organization',
            dependencies: [],
            constraints: {},
            metadata: {
              isCustom: true,
              environment,
              requiresMFA: permData.risk === 'critical',
              auditLevel: permData.risk === 'critical' ? 'detailed' : 'standard'
            },
            isActive: true,
            isSystem: false,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await collection.insertOne(permission, { session });
          count++;
        }
      }

      logger.info(`Created ${count} custom permissions`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed custom permissions', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds API-specific permissions
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedApiPermissions(session) {
    try {
      logger.info('Seeding API permissions');

      const db = BaseModel.getDatabase();
      const collection = db.collection(PermissionsSeeder.#COLLECTIONS.PERMISSIONS);

      const apiVersions = ['v1', 'v2'];
      const apiEndpoints = [
        'users', 'organizations', 'projects', 'clients', 
        'jobs', 'candidates', 'reports', 'webhooks'
      ];
      const apiMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

      const apiPermissions = [];

      // Generate API permissions
      for (const version of apiVersions) {
        for (const endpoint of apiEndpoints) {
          for (const method of apiMethods) {
            const code = `api:${version}:${endpoint}:${method}`;
            
            const existing = await collection.findOne({ code }, { session });
            if (existing) continue;

            const permission = {
              code,
              name: `API ${version} ${method} ${endpoint}`,
              description: `Permission to ${method} ${endpoint} via API ${version}`,
              category: 'api',
              resource: `api:${version}:${endpoint}`,
              action: method.toLowerCase(),
              scope: 'api',
              risk: PermissionsSeeder.#getApiRiskLevel(method),
              metadata: {
                apiVersion: version,
                endpoint,
                method,
                isApiPermission: true,
                rateLimited: true,
                requiresApiKey: true
              },
              isActive: true,
              isSystem: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            apiPermissions.push(permission);
          }
        }
      }

      // Add special API permissions
      const specialApiPermissions = [
        {
          code: 'api:admin:access',
          name: 'API Admin Access',
          description: 'Administrative API access',
          risk: 'critical'
        },
        {
          code: 'api:rate:unlimited',
          name: 'Unlimited API Rate',
          description: 'Bypass API rate limits',
          risk: 'high'
        },
        {
          code: 'api:batch:operations',
          name: 'Batch API Operations',
          description: 'Perform batch API operations',
          risk: 'high'
        }
      ];

      for (const special of specialApiPermissions) {
        const existing = await collection.findOne({ code: special.code }, { session });
        if (!existing) {
          apiPermissions.push({
            ...special,
            category: 'api',
            resource: 'api',
            action: special.code.split(':').pop(),
            scope: 'api',
            metadata: {
              isSpecialApi: true,
              requiresApproval: true
            },
            isActive: true,
            isSystem: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (apiPermissions.length > 0) {
        await collection.insertMany(apiPermissions, { session });
      }

      logger.info(`Created ${apiPermissions.length} API permissions`);

      return { count: apiPermissions.length };

    } catch (error) {
      logger.error('Failed to seed API permissions', error);
      throw error;
    }
  }

  /**
   * @private
   * Helper methods for permission generation
   */

  static #generatePermissionDescription(resource, action) {
    const descriptions = {
      create: `Create new ${resource} records`,
      read: `View ${resource} information`,
      update: `Modify existing ${resource} records`,
      delete: `Remove ${resource} records`,
      list: `List and search ${resource} records`,
      manage: `Full management of ${resource} resources`,
      execute: `Execute ${resource} operations`
    };
    return descriptions[action] || `Perform ${action} on ${resource}`;
  }

  static #getResourceCategory(resource) {
    const categories = {
      user: 'users',
      organization: 'organizations',
      tenant: 'organizations',
      role: 'security',
      permission: 'security',
      client: 'business',
      project: 'business',
      consultant: 'business',
      engagement: 'business',
      job: 'recruitment',
      candidate: 'recruitment',
      application: 'recruitment',
      partner: 'recruitment',
      system: 'system',
      settings: 'system',
      audit: 'compliance',
      report: 'analytics',
      analytics: 'analytics',
      integration: 'integrations',
      webhook: 'integrations',
      api: 'api'
    };
    return categories[resource] || 'general';
  }

  static #getPermissionScope(resource, action) {
    // System resources are global scope
    if (['system', 'settings', 'audit'].includes(resource)) {
      return 'global';
    }
    
    // Delete actions typically require organization scope
    if (action === 'delete' || action === 'manage') {
      return 'organization';
    }
    
    // Most other permissions are tenant scoped
    return 'tenant';
  }

  static #calculateRiskLevel(resource, action) {
    const criticalResources = ['system', 'permission', 'role', 'audit'];
    const criticalActions = ['delete', 'manage'];
    
    if (criticalResources.includes(resource) && criticalActions.includes(action)) {
      return 'critical';
    }
    
    if (criticalResources.includes(resource) || action === 'delete') {
      return 'high';
    }
    
    if (['create', 'update'].includes(action)) {
      return 'medium';
    }
    
    return 'low';
  }

  static #getPermissionDependencies(resource, action) {
    const dependencies = {
      create: [`${resource}:read`],
      update: [`${resource}:read`],
      delete: [`${resource}:read`, `${resource}:update`],
      manage: [`${resource}:create`, `${resource}:read`, `${resource}:update`, `${resource}:delete`]
    };
    return dependencies[action] || [];
  }

  static #getPermissionConstraints(resource, action) {
    const constraints = {};
    
    // Add common constraints
    if (action === 'delete') {
      constraints.requiresConfirmation = true;
      constraints.softDeleteOnly = ['user', 'organization', 'client'].includes(resource);
    }
    
    if (action === 'manage') {
      constraints.requiresElevation = true;
    }
    
    // Resource-specific constraints
    if (resource === 'user' && action === 'create') {
      constraints.maxPerDay = 100;
    }
    
    if (resource === 'api' && action === 'execute') {
      constraints.rateLimited = true;
    }
    
    return constraints;
  }

  static #requiresMFA(resource, action) {
    const mfaResources = ['system', 'permission', 'role', 'billing', 'audit'];
    const mfaActions = ['delete', 'manage'];
    
    return mfaResources.includes(resource) || mfaActions.includes(action);
  }

  static #getAuditLevel(resource, action) {
    const detailedAuditResources = ['user', 'permission', 'role', 'billing', 'system'];
    const detailedAuditActions = ['create', 'update', 'delete', 'manage'];
    
    if (detailedAuditResources.includes(resource) && detailedAuditActions.includes(action)) {
      return 'detailed';
    }
    
    if (action === 'read' || action === 'list') {
      return 'minimal';
    }
    
    return 'standard';
  }

  static #getDataClassification(resource) {
    const classifications = {
      user: 'sensitive',
      billing: 'confidential',
      system: 'internal',
      audit: 'restricted',
      permission: 'internal',
      role: 'internal',
      client: 'confidential',
      candidate: 'sensitive'
    };
    return classifications[resource] || 'public';
  }

  static #generateCompositePermissions() {
    return [
      {
        code: '*:*',
        name: 'Super Admin',
        description: 'All permissions - super admin only',
        category: 'system',
        resource: '*',
        action: '*',
        risk: 'critical',
        metadata: {
          isWildcard: true,
          isSuperAdmin: true
        }
      },
      {
        code: '*:read',
        name: 'Read All',
        description: 'Read access to all resources',
        category: 'system',
        resource: '*',
        action: 'read',
        risk: 'medium',
        metadata: {
          isWildcard: true
        }
      }
    ];
  }

  static #getApiRiskLevel(method) {
    const risks = {
      'GET': 'low',
      'POST': 'medium',
      'PUT': 'medium',
      'PATCH': 'medium',
      'DELETE': 'high'
    };
    return risks[method] || 'medium';
  }
}

module.exports = PermissionsSeeder;