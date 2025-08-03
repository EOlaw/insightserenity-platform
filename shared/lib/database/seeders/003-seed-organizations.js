'use strict';

/**
 * @fileoverview Seeds default organizations and organizational structures - FIXED VERSION
 * @module shared/lib/database/seeders/003-seed-organizations
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/utils/validators/organization-validators
 * @requires module:shared/lib/utils/helpers/slug-helper
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/roles
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const BaseModel = require('../models/base-model');
const { validateOrganizationData } = require('../../utils/validators/organization-validators');
const { generateSlug } = require('../../utils/helpers/slug-helper');
const { STATUS_CODES } = require('../../utils/constants/status-codes');
const { ROLES } = require('../../utils/constants/roles');

/**
 * @class OrganizationsSeeder
 * @description Seeds default organizations with complete configuration and proper dependencies
 */
class OrganizationsSeeder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DEFAULT_SETTINGS = {
    billing: {
      currency: 'USD',
      taxRate: 0,
      billingCycle: 'monthly',
      paymentTerms: 30,
      autoRenew: true
    },
    security: {
      enforceSSO: false,
      enforceMFA: false,
      passwordPolicy: 'standard',
      sessionTimeout: 3600,
      ipWhitelist: [],
      allowedDomains: []
    },
    features: {
      whiteLabel: false,
      customDomain: false,
      advancedAnalytics: false,
      apiAccess: true,
      maxUsers: 100,
      maxProjects: 50,
      maxStorage: 10737418240 // 10GB
    },
    branding: {
      primaryColor: '#2563EB',
      secondaryColor: '#1E40AF',
      logoUrl: null,
      faviconUrl: null,
      customCSS: null
    },
    notifications: {
      emailEnabled: true,
      smsEnabled: false,
      webhooksEnabled: false,
      slackEnabled: false
    }
  };

  /**
   * Seeds organizations
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
      
      logger.info('Starting organizations seeding', { environment });

      let totalRecords = 0;

      // Verify user dependencies first
      const ownerUser = await OrganizationsSeeder.#ensureOwnerUser(session);
      if (!ownerUser) {
        throw new AppError('No suitable owner user found for organizations', 500, 'NO_OWNER_USER');
      }

      // Seed main platform organization
      const platformResult = await OrganizationsSeeder.#seedPlatformOrganization(session, environment, ownerUser);
      totalRecords += platformResult.count;

      // Seed demo organizations
      if (environment !== 'production') {
        const demoResult = await OrganizationsSeeder.#seedDemoOrganizations(session, ownerUser);
        totalRecords += demoResult.count;
      }

      // Seed partner organizations
      const partnerResult = await OrganizationsSeeder.#seedPartnerOrganizations(session, environment, ownerUser);
      totalRecords += partnerResult.count;

      // Create associated tenants
      const tenantResult = await OrganizationsSeeder.#createOrganizationTenants(session);
      totalRecords += tenantResult.count;

      logger.info('Organizations seeding completed', { 
        totalRecords,
        details: {
          platform: platformResult.count,
          demo: environment !== 'production' ? demoResult?.count || 0 : 0,
          partners: partnerResult.count,
          tenants: tenantResult.count
        }
      });

      return { recordsSeeded: totalRecords };

    } catch (error) {
      logger.error('Organizations seeding failed', error);
      throw new AppError(
        'Failed to seed organizations',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seeded organizations
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const issues = [];
      const db = BaseModel.getDatabase();
      const orgsCollection = db.collection('organizations');
      const tenantsCollection = db.collection('tenants');

      // Check for platform organization
      const platformOrg = await orgsCollection.findOne({ 
        slug: 'insightserenity',
        isPlatform: true
      });

      if (!platformOrg) {
        issues.push({
          type: 'organization',
          issue: 'Platform organization not found'
        });
      }

      // Validate organization-tenant relationships
      const organizations = await orgsCollection.find({}).toArray();
      
      for (const org of organizations) {
        const tenant = await tenantsCollection.findOne({ organizationId: org._id });
        
        if (!tenant) {
          issues.push({
            type: 'tenant',
            issue: `No tenant found for organization: ${org.name}`
          });
        }

        // Validate required fields
        if (!org.settings || !org.subscription || !org.contact || !org.ownership) {
          issues.push({
            type: 'organization',
            issue: `Organization ${org.name} has incomplete data`
          });
        }

        // Validate ownership
        if (!org.ownership?.ownerId) {
          issues.push({
            type: 'organization',
            issue: `Organization ${org.name} missing owner`
          });
        }

        // Validate contact email
        if (!org.contact?.email) {
          issues.push({
            type: 'organization',
            issue: `Organization ${org.name} missing contact email`
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
   * Ensures a suitable owner user exists for organizations
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Owner user document
   */
  static async #ensureOwnerUser(session) {
    try {
      const db = BaseModel.getDatabase();
      const usersCollection = db.collection('users');

      // First, try to find super admin
      let ownerUser = await usersCollection.findOne({
        'roles.code': ROLES.SUPER_ADMIN,
        status: 'active'
      }, { session });

      if (ownerUser) {
        logger.info('Found super admin user for organization ownership', {
          userId: ownerUser._id,
          username: ownerUser.username
        });
        return ownerUser;
      }

      // Fallback to any admin user
      ownerUser = await usersCollection.findOne({
        'roles.code': ROLES.ADMIN,
        status: 'active'
      }, { session });

      if (ownerUser) {
        logger.info('Found admin user for organization ownership', {
          userId: ownerUser._id,
          username: ownerUser.username
        });
        return ownerUser;
      }

      // Fallback to system service account
      ownerUser = await usersCollection.findOne({
        username: 'system.service',
        isSystem: true
      }, { session });

      if (ownerUser) {
        logger.info('Found system service user for organization ownership', {
          userId: ownerUser._id,
          username: ownerUser.username
        });
        return ownerUser;
      }

      // Last resort: create a minimal system owner user
      const systemOwner = {
        username: 'system.org.owner',
        email: 'system.org.owner@insightserenity.com',
        password: 'N/A', // System user, no password login
        firstName: 'System',
        lastName: 'Organization Owner',
        displayName: 'System Organization Owner',
        roles: [{
          code: ROLES.ADMIN,
          name: 'Administrator',
          assignedAt: new Date(),
          assignedBy: 'system'
        }],
        profile: {
          title: 'System Account',
          department: 'System'
        },
        security: {
          twoFactorEnabled: false,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          loginAttempts: 0
        },
        status: 'active',
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isSystem: true,
        isServiceAccount: true,
        metadata: {
          source: 'seeder',
          purpose: 'organization_ownership',
          createdForSeeding: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await usersCollection.insertOne(systemOwner, { session });
      systemOwner._id = result.insertedId;

      logger.info('Created system owner user for organizations', {
        userId: systemOwner._id,
        username: systemOwner.username
      });

      return systemOwner;

    } catch (error) {
      logger.error('Failed to ensure owner user', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds the main platform organization
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @param {Object} ownerUser - Owner user document
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPlatformOrganization(session, environment, ownerUser) {
    try {
      logger.info('Seeding platform organization');

      const db = BaseModel.getDatabase();
      const collection = db.collection('organizations');

      // Check if platform org exists
      const existing = await collection.findOne(
        { slug: 'insightserenity' },
        { session }
      );

      if (existing) {
        logger.info('Platform organization already exists, skipping');
        return { count: 0 };
      }

      const platformOrg = {
        name: 'InsightSerenity Inc',
        slug: 'insightserenity',
        displayName: 'InsightSerenity Platform',
        description: 'Main platform organization for InsightSerenity consulting and recruitment services',
        type: 'system',
        isPlatform: true,
        industry: 'technology',
        size: '1001-5000',
        
        // Required contact information
        contact: {
          email: 'contact@insightserenity.com',
          phone: '+1-800-INSIGHT',
          website: 'https://insightserenity.com',
          supportEmail: 'support@insightserenity.com',
          salesEmail: 'sales@insightserenity.com',
          billingEmail: 'billing@insightserenity.com'
        },

        address: {
          street1: '123 Innovation Drive',
          street2: 'Suite 100',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'US',
          timezone: 'America/Los_Angeles'
        },

        // Required ownership information
        ownership: {
          ownerId: ownerUser._id,
          createdBy: ownerUser._id,
          transferHistory: []
        },

        // Multi-tenancy configuration
        tenancy: {
          tenantId: null, // Will be set when tenant is created
          isolationLevel: 'dedicated',
          dataResidency: {
            region: 'us-west-2',
            requirements: ['data_sovereignty']
          },
          customDomain: {
            domain: 'platform.insightserenity.com',
            verified: true,
            verificationToken: null,
            sslEnabled: true
          },
          subdomainPrefix: 'platform'
        },

        // Subscription configuration
        subscription: {
          status: 'active',
          tier: 'enterprise',
          planId: null,
          trial: {
            startDate: new Date(),
            endDate: null,
            daysRemaining: null,
            extended: false,
            extensionHistory: []
          },
          currentPeriod: {
            startDate: new Date(),
            endDate: null,
            billingCycle: 'annual'
          },
          nextBilling: {
            date: null,
            amount: 0,
            currency: 'USD'
          },
          cancellation: null
        },

        billing: {
          customerId: {
            stripe: null,
            paypal: null,
            other: null
          },
          paymentMethods: [],
          invoices: [],
          credits: {
            balance: 0,
            currency: 'USD',
            transactions: []
          },
          taxInfo: {
            taxId: null,
            vatId: null,
            taxExempt: false,
            taxExemptId: null
          }
        },

        // Features configuration
        features: {
          users: {
            limit: -1, // Unlimited
            current: 0
          },
          projects: {
            limit: -1, // Unlimited
            current: 0
          },
          storage: {
            limit: -1, // Unlimited
            used: 0
          },
          apiCalls: {
            monthlyLimit: -1, // Unlimited
            used: 0,
            resetDate: null
          },
          customDomain: {
            enabled: true
          },
          whiteLabel: {
            enabled: true
          },
          advancedAnalytics: {
            enabled: true
          },
          apiAccess: {
            enabled: true,
            rateLimit: -1 // Unlimited
          },
          support: {
            level: 'dedicated',
            slaHours: 1
          },
          integrations: []
        },

        // Branding configuration
        branding: {
          logo: {
            url: '/assets/logo/insightserenity-logo.png',
            publicId: 'insightserenity-logo',
            darkModeUrl: '/assets/logo/insightserenity-logo-dark.png'
          },
          favicon: {
            url: '/assets/favicon/favicon.ico',
            publicId: 'insightserenity-favicon'
          },
          colors: {
            primary: '#1976D2',
            secondary: '#424242',
            accent: '#82B1FF',
            background: '#FFFFFF',
            text: '#212121'
          },
          theme: {
            mode: 'light',
            customCss: null,
            customJs: null
          },
          emailTemplates: {
            headerHtml: null,
            footerHtml: null,
            customStyles: null
          },
          socialLinks: {
            facebook: null,
            twitter: null,
            linkedin: 'https://linkedin.com/company/insightserenity',
            instagram: null,
            youtube: null,
            github: 'https://github.com/insightserenity'
          }
        },

        // Settings configuration
        settings: {
          general: {
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12h',
            startOfWeek: 'monday',
            fiscalYearStart: 'january'
          },
          security: {
            requireMfa: environment === 'production',
            passwordPolicy: {
              minLength: 12,
              requireUppercase: true,
              requireNumbers: true,
              requireSpecialChars: true,
              expiryDays: 90
            },
            sessionTimeout: 3600,
            ipWhitelist: [],
            allowedDomains: ['insightserenity.com'],
            ssoEnabled: false,
            ssoProvider: null,
            ssoConfiguration: null
          },
          notifications: {
            channels: {
              email: {
                enabled: true,
                settings: {}
              },
              slack: {
                enabled: false,
                webhookUrl: null,
                channel: null
              },
              webhook: {
                enabled: false,
                urls: []
              }
            },
            preferences: {
              newUserSignup: true,
              billingAlerts: true,
              securityAlerts: true,
              systemUpdates: true,
              usageAlerts: true
            }
          },
          compliance: {
            dataRetention: {
              enabled: true,
              days: 2555 // 7 years
            },
            auditLog: {
              enabled: true,
              retentionDays: 2555
            },
            gdprCompliant: true,
            hipaaCompliant: false,
            soc2Compliant: true
          }
        },

        // Team structure
        team: {
          departments: [],
          teams: [],
          roles: []
        },

        // Integration configuration
        integrations: {
          oauth: {
            clientId: null,
            clientSecret: null,
            redirectUris: [],
            scopes: []
          },
          webhooks: [],
          apiKeys: [],
          connectedApps: []
        },

        // Analytics and metrics
        analytics: {
          metrics: {
            totalUsers: 0,
            activeUsers: 0,
            totalProjects: 0,
            totalRevenue: 0,
            mrr: 0,
            churnRate: 0,
            nps: {
              score: null,
              lastMeasured: null
            }
          },
          usage: {
            daily: [],
            monthly: []
          },
          growth: {
            userGrowthRate: 0,
            revenueGrowthRate: 0,
            lastCalculated: new Date()
          }
        },

        // Status and lifecycle
        status: {
          state: 'active',
          health: {
            score: 100,
            factors: {
              payment: 25,
              usage: 25,
              engagement: 25,
              support: 25
            },
            lastCalculated: new Date()
          },
          suspension: null,
          verification: {
            email: {
              verified: true,
              verifiedAt: new Date()
            },
            domain: {
              verified: true,
              verifiedAt: new Date()
            },
            business: {
              verified: true,
              documents: [],
              verifiedAt: new Date()
            }
          }
        },

        // Metadata and search
        metadata: {
          tags: ['platform', 'enterprise', 'consulting', 'recruitment'],
          customFields: new Map(),
          referralSource: 'direct',
          referralCode: null,
          campaignId: null,
          utmParams: {
            source: null,
            medium: null,
            campaign: null,
            term: null,
            content: null
          },
          notes: [],
          flags: {
            isTestAccount: false,
            isPremium: true,
            requiresAttention: false,
            isPartner: false
          }
        },

        searchTokens: ['insightserenity', 'platform', 'consulting', 'recruitment', 'enterprise'],

        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate organization data
      try {
        const validation = validateOrganizationData(platformOrg);
        if (!validation.isValid) {
          logger.error('Platform organization validation failed', {
            errors: validation.errors
          });
          throw new AppError('Invalid platform organization data', 400, 'VALIDATION_ERROR', validation.errors);
        }
      } catch (validationError) {
        // If validation function doesn't exist, proceed with basic validation
        logger.warn('Organization validation function not available, proceeding with basic validation');
        
        if (!platformOrg.name || !platformOrg.contact?.email || !platformOrg.ownership?.ownerId) {
          throw new AppError('Platform organization missing required fields', 400, 'MISSING_REQUIRED_FIELDS');
        }
      }

      await collection.insertOne(platformOrg, { session });

      logger.info('Platform organization created successfully', {
        name: platformOrg.name,
        slug: platformOrg.slug,
        ownerId: platformOrg.ownership.ownerId
      });

      return { count: 1 };

    } catch (error) {
      logger.error('Failed to seed platform organization', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds demo organizations
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {Object} ownerUser - Owner user document
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedDemoOrganizations(session, ownerUser) {
    try {
      logger.info('Seeding demo organizations');

      const db = BaseModel.getDatabase();
      const collection = db.collection('organizations');

      const demoOrganizations = [
        {
          name: 'Acme Consulting Group',
          displayName: 'Acme Consulting',
          description: 'Demo organization for consulting services showcase',
          type: 'business',
          industry: 'consulting',
          size: '51-200',
          plan: 'professional',
          features: {
            consulting: true,
            recruitment: false,
            whiteLabel: true
          }
        },
        {
          name: 'TechTalent Recruiters',
          displayName: 'TechTalent',
          description: 'Demo organization for recruitment services showcase',
          type: 'business',
          industry: 'technology',
          size: '11-50',
          plan: 'business',
          features: {
            consulting: false,
            recruitment: true,
            whiteLabel: false
          }
        },
        {
          name: 'Global Solutions Partners',
          displayName: 'GSP',
          description: 'Demo organization for full-service showcase',
          type: 'business',
          industry: 'consulting',
          size: '201-500',
          plan: 'enterprise',
          features: {
            consulting: true,
            recruitment: true,
            whiteLabel: true
          }
        }
      ];

      let count = 0;

      for (const orgData of demoOrganizations) {
        const slug = OrganizationsSeeder.#generateSlug(orgData.name);
        
        const existing = await collection.findOne(
          { slug },
          { session }
        );

        if (existing) {
          logger.info(`Demo organization ${orgData.name} already exists, skipping`);
          continue;
        }

        const demoOrg = OrganizationsSeeder.#createOrganizationDocument(orgData, ownerUser, slug, true);

        await collection.insertOne(demoOrg, { session });
        count++;

        logger.info(`Created demo organization: ${orgData.name}`);
      }

      logger.info(`Created ${count} demo organizations`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed demo organizations', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds partner organizations
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @param {Object} ownerUser - Owner user document
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPartnerOrganizations(session, environment, ownerUser) {
    try {
      logger.info('Seeding partner organizations');

      const db = BaseModel.getDatabase();
      const collection = db.collection('organizations');

      const partnerOrganizations = [
        {
          name: 'Strategic Alliance Partners',
          displayName: 'SAP',
          description: 'Premier strategic partner for enterprise consulting',
          type: 'business',
          partnerType: 'strategic',
          tier: 'platinum',
          commission: 20
        },
        {
          name: 'Regional Recruitment Network',
          displayName: 'RRN',
          description: 'Regional partner network for recruitment services',
          type: 'business',
          partnerType: 'regional',
          tier: 'gold',
          commission: 15
        }
      ];

      let count = 0;

      for (const partnerData of partnerOrganizations) {
        const slug = OrganizationsSeeder.#generateSlug(partnerData.name);
        
        const existing = await collection.findOne(
          { slug },
          { session }
        );

        if (existing) {
          logger.info(`Partner organization ${partnerData.name} already exists, skipping`);
          continue;
        }

        const partnerOrg = OrganizationsSeeder.#createOrganizationDocument(partnerData, ownerUser, slug, false, true);

        await collection.insertOne(partnerOrg, { session });
        count++;

        logger.info(`Created partner organization: ${partnerData.name}`);
      }

      // Create indexes
      await collection.createIndex({ slug: 1 }, { unique: true, session });
      await collection.createIndex({ 'ownership.ownerId': 1, 'status.state': 1 }, { session });
      await collection.createIndex({ 'subscription.status': 1, 'subscription.tier': 1 }, { session });
      await collection.createIndex({ type: 1 }, { session });
      await collection.createIndex({ 'status.state': 1 }, { session });
      await collection.createIndex({ isPlatform: 1 }, { session });
      await collection.createIndex({ createdAt: -1 }, { session });

      logger.info(`Created ${count} partner organizations`);

      return { count };

    } catch (error) {
      logger.error('Failed to seed partner organizations', error);
      throw error;
    }
  }

  /**
   * @private
   * Creates tenants for organizations
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #createOrganizationTenants(session) {
    try {
      logger.info('Creating organization tenants');

      const db = BaseModel.getDatabase();
      const orgsCollection = db.collection('organizations');
      const tenantsCollection = db.collection('tenants');

      // Get all organizations without tenants
      const organizations = await orgsCollection.find({}, { session }).toArray();
      let count = 0;

      for (const org of organizations) {
        const existingTenant = await tenantsCollection.findOne(
          { organizationId: org._id },
          { session }
        );

        if (existingTenant) {
          logger.info(`Tenant for ${org.name} already exists, skipping`);
          continue;
        }

        const tenant = {
          organizationId: org._id,
          organizationName: org.name,
          tenantId: `tenant_${org.slug}`,
          database: {
            name: `insightserenity_${org.slug}`,
            connection: org.isPlatform ? 'primary' : 'shared',
            shard: org.isPlatform ? 'primary' : OrganizationsSeeder.#getShardForSize(org.size)
          },
          storage: {
            bucket: `insightserenity-${org.slug}`,
            region: 'us-west-2',
            provider: 'aws',
            quotaBytes: org.features?.storage?.limit || 10737418240,
            usedBytes: org.features?.storage?.used || 0
          },
          configuration: {
            timezone: org.address?.timezone || 'America/New_York',
            locale: 'en-US',
            currency: 'USD',
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12h'
          },
          isolation: {
            level: org.isPlatform ? 'dedicated' : 'shared',
            resourcePool: org.isPlatform ? 'platform' : 'standard',
            priority: OrganizationsSeeder.#getPriorityForPlan(org.subscription?.tier)
          },
          features: org.features || {},
          limits: {
            maxUsers: org.features?.users?.limit || 100,
            maxProjects: org.features?.projects?.limit || 50,
            maxApiCalls: OrganizationsSeeder.#getApiLimitForPlan(org.subscription?.tier),
            maxConcurrentRequests: OrganizationsSeeder.#getConcurrencyLimit(org.subscription?.tier)
          },
          status: {
            state: 'active',
            health: {
              score: 100,
              lastCheck: new Date()
            }
          },
          isActive: true,
          metadata: {
            organizationType: org.type,
            subscriptionPlan: org.subscription?.tier,
            createdFrom: 'seeder'
          },
          createdAt: org.createdAt,
          updatedAt: new Date()
        };

        await tenantsCollection.insertOne(tenant, { session });

        // Update organization with tenant ID
        await orgsCollection.updateOne(
          { _id: org._id },
          { $set: { 'tenancy.tenantId': tenant._id } },
          { session }
        );

        count++;

        logger.info(`Created tenant for organization: ${org.name}`);
      }

      // Create indexes for tenants
      await tenantsCollection.createIndex({ organizationId: 1 }, { unique: true, session });
      await tenantsCollection.createIndex({ tenantId: 1 }, { unique: true, session });
      await tenantsCollection.createIndex({ 'status.state': 1 }, { session });
      await tenantsCollection.createIndex({ 'database.shard': 1 }, { session });

      logger.info(`Created ${count} organization tenants`);

      return { count };

    } catch (error) {
      logger.error('Failed to create organization tenants', error);
      throw error;
    }
  }

  /**
   * @private
   * Helper methods for organization creation
   */

  static #generateSlug(name) {
    if (generateSlug && typeof generateSlug === 'function') {
      return generateSlug(name);
    }
    // Fallback slug generation
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }

  static #createOrganizationDocument(orgData, ownerUser, slug, isDemo = false, isPartner = false) {
    const baseOrg = {
      name: orgData.name,
      slug,
      displayName: orgData.displayName,
      description: orgData.description,
      type: orgData.type,
      isPlatform: false,
      industry: orgData.industry,
      size: orgData.size,

      contact: {
        email: `contact@${slug}.${isDemo ? 'demo' : 'example'}.com`,
        phone: `+1-555-${isDemo ? 'DEMO' : 'TEST'}-${Math.floor(Math.random() * 9000) + 1000}`,
        website: `https://${slug}.${isDemo ? 'demo' : 'example'}.com`,
        supportEmail: `support@${slug}.${isDemo ? 'demo' : 'example'}.com`,
        salesEmail: `sales@${slug}.${isDemo ? 'demo' : 'example'}.com`,
        billingEmail: `billing@${slug}.${isDemo ? 'demo' : 'example'}.com`
      },

      address: {
        street1: `${Math.floor(Math.random() * 9000) + 1000} Demo Street`,
        street2: null,
        city: 'Demo City',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
        timezone: 'America/Los_Angeles'
      },

      ownership: {
        ownerId: ownerUser._id,
        createdBy: ownerUser._id,
        transferHistory: []
      },

      tenancy: {
        tenantId: null,
        isolationLevel: 'shared',
        dataResidency: {
          region: 'us-west-2',
          requirements: []
        },
        customDomain: null,
        subdomainPrefix: slug
      },

      subscription: {
        status: 'active',
        tier: orgData.plan || 'starter',
        planId: null,
        trial: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
          daysRemaining: 335,
          extended: false,
          extensionHistory: []
        },
        currentPeriod: {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
          billingCycle: 'monthly'
        },
        nextBilling: {
          date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amount: OrganizationsSeeder.#getPlanPrice(orgData.plan || 'starter'),
          currency: 'USD'
        },
        cancellation: null
      },

      billing: {
        customerId: { stripe: null, paypal: null, other: null },
        paymentMethods: [],
        invoices: [],
        credits: { balance: 0, currency: 'USD', transactions: [] },
        taxInfo: { taxId: null, vatId: null, taxExempt: false, taxExemptId: null }
      },

      features: OrganizationsSeeder.#getPlanFeatures(orgData.plan || 'starter', orgData.features),

      branding: {
        logo: { url: null, publicId: null, darkModeUrl: null },
        favicon: { url: null, publicId: null },
        colors: { primary: '#1976D2', secondary: '#424242', accent: '#82B1FF' },
        theme: { mode: 'light', customCss: null, customJs: null },
        emailTemplates: { headerHtml: null, footerHtml: null, customStyles: null },
        socialLinks: {}
      },

      settings: OrganizationsSeeder.#DEFAULT_SETTINGS,

      team: { departments: [], teams: [], roles: [] },

      integrations: {
        oauth: { clientId: null, clientSecret: null, redirectUris: [], scopes: [] },
        webhooks: [],
        apiKeys: [],
        connectedApps: []
      },

      analytics: {
        metrics: {
          totalUsers: Math.floor(Math.random() * 50) + 10,
          activeUsers: Math.floor(Math.random() * 30) + 5,
          totalProjects: Math.floor(Math.random() * 20) + 5,
          totalRevenue: 0,
          mrr: 0,
          churnRate: 0,
          nps: { score: null, lastMeasured: null }
        },
        usage: { daily: [], monthly: [] },
        growth: { userGrowthRate: 0, revenueGrowthRate: 0, lastCalculated: new Date() }
      },

      status: {
        state: 'active',
        health: {
          score: 100,
          factors: { payment: 25, usage: 25, engagement: 25, support: 25 },
          lastCalculated: new Date()
        },
        suspension: null,
        verification: {
          email: { verified: true, verifiedAt: new Date() },
          domain: { verified: false, verifiedAt: null },
          business: { verified: false, documents: [], verifiedAt: null }
        }
      },

      metadata: {
        tags: [isDemo ? 'demo' : 'test', orgData.type, orgData.size],
        customFields: new Map(),
        referralSource: 'seeder',
        referralCode: null,
        campaignId: null,
        utmParams: { source: null, medium: null, campaign: null, term: null, content: null },
        notes: [],
        flags: {
          isTestAccount: !isPartner,
          isPremium: false,
          requiresAttention: false,
          isPartner: isPartner
        }
      },

      searchTokens: [slug, orgData.name.toLowerCase(), orgData.type],

      isDemo,
      isPartner,
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      updatedAt: new Date()
    };

    // Add partner-specific fields
    if (isPartner) {
      baseOrg.partnerDetails = {
        type: orgData.partnerType,
        tier: orgData.tier,
        commissionRate: orgData.commission,
        agreementStartDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        agreementEndDate: new Date(Date.now() + 545 * 24 * 60 * 60 * 1000),
        status: 'active',
        performance: {
          totalReferrals: Math.floor(Math.random() * 50) + 10,
          successfulReferrals: Math.floor(Math.random() * 30) + 5,
          totalRevenue: Math.floor(Math.random() * 100000) + 50000,
          lastReferralDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        }
      };
    }

    return baseOrg;
  }

  static #getPlanFeatures(plan, customFeatures = {}) {
    const baseFeatures = {
      starter: {
        users: { limit: 10, current: 0 },
        projects: { limit: 5, current: 0 },
        storage: { limit: 1073741824, used: 0 }, // 1GB
        apiCalls: { monthlyLimit: 1000, used: 0, resetDate: null },
        customDomain: { enabled: false },
        whiteLabel: { enabled: false },
        advancedAnalytics: { enabled: false },
        apiAccess: { enabled: false, rateLimit: 100 },
        support: { level: 'community', slaHours: null },
        integrations: []
      },
      professional: {
        users: { limit: 50, current: 0 },
        projects: { limit: 25, current: 0 },
        storage: { limit: 10737418240, used: 0 }, // 10GB
        apiCalls: { monthlyLimit: 10000, used: 0, resetDate: null },
        customDomain: { enabled: false },
        whiteLabel: { enabled: false },
        advancedAnalytics: { enabled: false },
        apiAccess: { enabled: true, rateLimit: 1000 },
        support: { level: 'email', slaHours: 24 },
        integrations: []
      },
      business: {
        users: { limit: 200, current: 0 },
        projects: { limit: 100, current: 0 },
        storage: { limit: 107374182400, used: 0 }, // 100GB
        apiCalls: { monthlyLimit: 50000, used: 0, resetDate: null },
        customDomain: { enabled: true },
        whiteLabel: { enabled: true },
        advancedAnalytics: { enabled: false },
        apiAccess: { enabled: true, rateLimit: 5000 },
        support: { level: 'priority', slaHours: 12 },
        integrations: []
      },
      enterprise: {
        users: { limit: -1, current: 0 }, // Unlimited
        projects: { limit: -1, current: 0 }, // Unlimited
        storage: { limit: 1099511627776, used: 0 }, // 1TB
        apiCalls: { monthlyLimit: -1, used: 0, resetDate: null }, // Unlimited
        customDomain: { enabled: true },
        whiteLabel: { enabled: true },
        advancedAnalytics: { enabled: true },
        apiAccess: { enabled: true, rateLimit: -1 },
        support: { level: 'dedicated', slaHours: 4 },
        integrations: []
      }
    };

    const features = baseFeatures[plan] || baseFeatures.starter;
    
    // Apply custom features
    Object.assign(features, customFeatures);
    
    return features;
  }

  static #getPlanPrice(plan) {
    const prices = {
      starter: 49,
      professional: 149,
      business: 499,
      enterprise: 1499,
      partner: 0
    };
    return prices[plan] || 0;
  }

  static #getShardForSize(size) {
    const shards = {
      '1-10': 'shard-01',
      '11-50': 'shard-01',
      '51-200': 'shard-02',
      '201-500': 'shard-02',
      '501-1000': 'shard-03',
      '1001-5000': 'shard-03',
      '5000+': 'shard-dedicated'
    };
    return shards[size] || 'shard-01';
  }

  static #getPriorityForPlan(plan) {
    const priorities = {
      starter: 1,
      professional: 2,
      business: 3,
      enterprise: 4,
      platform: 5
    };
    return priorities[plan] || 1;
  }

  static #getApiLimitForPlan(plan) {
    const limits = {
      starter: 1000,
      professional: 10000,
      business: 50000,
      enterprise: -1, // Unlimited
      platform: -1 // Unlimited
    };
    return limits[plan] || 1000;
  }

  static #getConcurrencyLimit(plan) {
    const limits = {
      starter: 10,
      professional: 25,
      business: 50,
      enterprise: 100,
      platform: 200
    };
    return limits[plan] || 10;
  }
}

module.exports = OrganizationsSeeder;