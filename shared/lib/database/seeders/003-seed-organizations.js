'use strict';

/**
 * @fileoverview Seeds default organizations and organizational structures
 * @module shared/lib/database/seeders/003-seed-organizations
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/utils/validators/organization-validators
 * @requires module:shared/lib/utils/helpers/slug-helper
 * @requires module:shared/lib/utils/constants/status-codes
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const OrganizationModel = require('../models/organization-model');
const TenantModel = require('../models/tenant-model');
const { validateOrganizationData } = require('../../utils/validators/organization-validators');
const { generateSlug } = require('../../utils/helpers/slug-helper');
const { STATUS_CODES } = require('../../utils/constants/status-codes');

/**
 * @class OrganizationsSeeder
 * @description Seeds default organizations with complete configuration
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

      // Seed main platform organization
      const platformResult = await OrganizationsSeeder.#seedPlatformOrganization(session, environment);
      totalRecords += platformResult.count;

      // Seed demo organizations
      if (environment !== 'production') {
        const demoResult = await OrganizationsSeeder.#seedDemoOrganizations(session);
        totalRecords += demoResult.count;
      }

      // Seed partner organizations
      const partnerResult = await OrganizationsSeeder.#seedPartnerOrganizations(session, environment);
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
      const db = OrganizationModel.getDatabase();
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
        if (!org.settings || !org.subscription || !org.contact) {
          issues.push({
            type: 'organization',
            issue: `Organization ${org.name} has incomplete data`
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
   * Seeds the main platform organization
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @param {string} environment - Current environment
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPlatformOrganization(session, environment) {
    try {
      logger.info('Seeding platform organization');

      const db = OrganizationModel.getDatabase();
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
        type: 'platform',
        isPlatform: true,
        industry: 'Technology',
        size: 'enterprise',
        website: 'https://insightserenity.com',
        logo: {
          url: '/assets/logo/insightserenity-logo.png',
          thumbnailUrl: '/assets/logo/insightserenity-logo-thumb.png',
          altText: 'InsightSerenity Logo'
        },
        contact: {
          email: 'contact@insightserenity.com',
          phone: '+1-800-INSIGHT',
          address: {
            street1: '123 Innovation Drive',
            street2: 'Suite 100',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'US'
          },
          supportEmail: 'support@insightserenity.com',
          salesEmail: 'sales@insightserenity.com'
        },
        subscription: {
          plan: 'platform',
          status: 'active',
          startDate: new Date(),
          endDate: null,
          features: {
            whiteLabel: true,
            customDomain: true,
            advancedAnalytics: true,
            apiAccess: true,
            unlimitedUsers: true,
            unlimitedProjects: true,
            unlimitedStorage: true
          },
          billing: {
            amount: 0,
            currency: 'USD',
            interval: 'monthly',
            lastBilledAt: null,
            nextBillingAt: null
          }
        },
        settings: {
          ...OrganizationsSeeder.#DEFAULT_SETTINGS,
          features: {
            ...OrganizationsSeeder.#DEFAULT_SETTINGS.features,
            whiteLabel: true,
            customDomain: true,
            advancedAnalytics: true,
            maxUsers: -1, // Unlimited
            maxProjects: -1, // Unlimited
            maxStorage: -1 // Unlimited
          },
          security: {
            ...OrganizationsSeeder.#DEFAULT_SETTINGS.security,
            enforceMFA: environment === 'production',
            passwordPolicy: 'strict'
          }
        },
        metrics: {
          totalUsers: 0,
          activeUsers: 0,
          totalProjects: 0,
          activeProjects: 0,
          totalClients: 0,
          totalCandidates: 0,
          storageUsed: 0,
          lastActivityAt: new Date()
        },
        status: STATUS_CODES.ORGANIZATION?.ACTIVE || 'active',
        isActive: true,
        isVerified: true,
        verifiedAt: new Date(),
        metadata: {
          source: 'system',
          environment,
          version: '1.0.0',
          features: [
            'consulting',
            'recruitment',
            'white-label',
            'api-platform',
            'analytics',
            'integrations'
          ]
        },
        tags: ['platform', 'enterprise', 'consulting', 'recruitment'],
        integrations: [],
        webhooks: [],
        apiKeys: [],
        customFields: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate organization data
      const validation = validateOrganizationData(platformOrg);
      if (!validation.isValid) {
        throw new AppError('Invalid platform organization data', 400, 'VALIDATION_ERROR', validation.errors);
      }

      await collection.insertOne(platformOrg, { session });

      logger.info('Platform organization created successfully');

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
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedDemoOrganizations(session) {
    try {
      logger.info('Seeding demo organizations');

      const db = OrganizationModel.getDatabase();
      const collection = db.collection('organizations');

      const demoOrganizations = [
        {
          name: 'Acme Consulting Group',
          displayName: 'Acme Consulting',
          description: 'Demo organization for consulting services showcase',
          type: 'consulting',
          industry: 'Management Consulting',
          size: 'medium',
          website: 'https://demo-acme.insightserenity.com',
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
          type: 'recruitment',
          industry: 'Human Resources',
          size: 'small',
          website: 'https://demo-techtalent.insightserenity.com',
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
          type: 'hybrid',
          industry: 'Professional Services',
          size: 'large',
          website: 'https://demo-gsp.insightserenity.com',
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
        const slug = generateSlug(orgData.name);
        
        const existing = await collection.findOne(
          { slug },
          { session }
        );

        if (existing) {
          logger.info(`Demo organization ${orgData.name} already exists, skipping`);
          continue;
        }

        const demoOrg = {
          name: orgData.name,
          slug,
          displayName: orgData.displayName,
          description: orgData.description,
          type: orgData.type,
          isPlatform: false,
          industry: orgData.industry,
          size: orgData.size,
          website: orgData.website,
          logo: {
            url: `/assets/demo/${slug}-logo.png`,
            thumbnailUrl: `/assets/demo/${slug}-logo-thumb.png`,
            altText: `${orgData.displayName} Logo`
          },
          contact: {
            email: `contact@${slug}.demo`,
            phone: '+1-555-DEMO-' + String(count + 100),
            address: {
              street1: `${100 + count} Demo Street`,
              city: 'Demo City',
              state: 'CA',
              postalCode: '90210',
              country: 'US'
            },
            supportEmail: `support@${slug}.demo`,
            salesEmail: `sales@${slug}.demo`
          },
          subscription: {
            plan: orgData.plan,
            status: 'active',
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            endDate: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000), // 11 months future
            features: OrganizationsSeeder.#getPlanFeatures(orgData.plan, orgData.features),
            billing: {
              amount: OrganizationsSeeder.#getPlanPrice(orgData.plan),
              currency: 'USD',
              interval: 'monthly',
              lastBilledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          },
          settings: {
            ...OrganizationsSeeder.#DEFAULT_SETTINGS,
            features: {
              ...OrganizationsSeeder.#DEFAULT_SETTINGS.features,
              ...OrganizationsSeeder.#getPlanLimits(orgData.plan)
            }
          },
          metrics: {
            totalUsers: Math.floor(Math.random() * 50) + 10,
            activeUsers: Math.floor(Math.random() * 30) + 5,
            totalProjects: Math.floor(Math.random() * 20) + 5,
            activeProjects: Math.floor(Math.random() * 10) + 2,
            totalClients: orgData.features.consulting ? Math.floor(Math.random() * 30) + 10 : 0,
            totalCandidates: orgData.features.recruitment ? Math.floor(Math.random() * 100) + 50 : 0,
            storageUsed: Math.floor(Math.random() * 1073741824) + 104857600, // 100MB - 1GB
            lastActivityAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000) // Within last 24h
          },
          status: STATUS_CODES.ORGANIZATION?.ACTIVE || 'active',
          isActive: true,
          isDemo: true,
          isVerified: true,
          verifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
          metadata: {
            source: 'seeder',
            purpose: 'demo',
            environment: 'development',
            demoFeatures: Object.keys(orgData.features).filter(k => orgData.features[k])
          },
          tags: ['demo', orgData.type, orgData.size, orgData.industry.toLowerCase().replace(/\s+/g, '-')],
          integrations: OrganizationsSeeder.#getDemoIntegrations(orgData.type),
          webhooks: [],
          apiKeys: [],
          customFields: {
            demoNotes: 'This is a demo organization for testing and showcase purposes'
          },
          createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          updatedAt: new Date()
        };

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
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedPartnerOrganizations(session, environment) {
    try {
      logger.info('Seeding partner organizations');

      const db = OrganizationModel.getDatabase();
      const collection = db.collection('organizations');

      const partnerOrganizations = [
        {
          name: 'Strategic Alliance Partners',
          displayName: 'SAP',
          description: 'Premier strategic partner for enterprise consulting',
          type: 'partner',
          partnerType: 'strategic',
          tier: 'platinum',
          commission: 20
        },
        {
          name: 'Regional Recruitment Network',
          displayName: 'RRN',
          description: 'Regional partner network for recruitment services',
          type: 'partner',
          partnerType: 'regional',
          tier: 'gold',
          commission: 15
        }
      ];

      let count = 0;

      for (const partnerData of partnerOrganizations) {
        const slug = generateSlug(partnerData.name);
        
        const existing = await collection.findOne(
          { slug },
          { session }
        );

        if (existing) {
          logger.info(`Partner organization ${partnerData.name} already exists, skipping`);
          continue;
        }

        const partnerOrg = {
          name: partnerData.name,
          slug,
          displayName: partnerData.displayName,
          description: partnerData.description,
          type: partnerData.type,
          isPlatform: false,
          isPartner: true,
          partnerDetails: {
            type: partnerData.partnerType,
            tier: partnerData.tier,
            commissionRate: partnerData.commission,
            agreementStartDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 months ago
            agreementEndDate: new Date(Date.now() + 545 * 24 * 60 * 60 * 1000), // 18 months future
            status: 'active',
            performance: {
              totalReferrals: Math.floor(Math.random() * 50) + 10,
              successfulReferrals: Math.floor(Math.random() * 30) + 5,
              totalRevenue: Math.floor(Math.random() * 100000) + 50000,
              lastReferralDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            }
          },
          industry: 'Professional Services',
          size: 'medium',
          website: `https://partner-${slug}.com`,
          logo: null,
          contact: {
            email: `partner@${slug}.com`,
            phone: '+1-800-PARTNER',
            address: {
              street1: 'Partner Plaza',
              city: 'Partner City',
              state: 'NY',
              postalCode: '10001',
              country: 'US'
            },
            supportEmail: `support@${slug}.com`,
            salesEmail: `sales@${slug}.com`
          },
          subscription: {
            plan: 'partner',
            status: 'active',
            startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
            endDate: null,
            features: {
              partnerPortal: true,
              referralTracking: true,
              commissionReports: true,
              cobranding: partnerData.tier === 'platinum',
              apiAccess: true
            },
            billing: {
              amount: 0, // Partners don't pay
              currency: 'USD',
              interval: 'monthly'
            }
          },
          settings: {
            ...OrganizationsSeeder.#DEFAULT_SETTINGS,
            partner: {
              autoApproveReferrals: false,
              notifyOnReferral: true,
              monthlyReports: true,
              brandingLevel: partnerData.tier
            }
          },
          metrics: {
            totalUsers: 5,
            activeUsers: 3,
            totalProjects: 0,
            activeProjects: 0,
            totalClients: 0,
            totalCandidates: 0,
            storageUsed: 52428800, // 50MB
            lastActivityAt: new Date()
          },
          status: STATUS_CODES.ORGANIZATION?.ACTIVE || 'active',
          isActive: true,
          isVerified: true,
          verifiedAt: new Date(Date.now() - 170 * 24 * 60 * 60 * 1000),
          metadata: {
            source: 'seeder',
            partnerType: partnerData.partnerType,
            partnerTier: partnerData.tier,
            environment
          },
          tags: ['partner', partnerData.partnerType, partnerData.tier],
          integrations: [],
          webhooks: [],
          apiKeys: [],
          customFields: {},
          createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        };

        await collection.insertOne(partnerOrg, { session });
        count++;

        logger.info(`Created partner organization: ${partnerData.name}`);
      }

      // Create indexes
      await collection.createIndex({ slug: 1 }, { unique: true, session });
      await collection.createIndex({ type: 1 }, { session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ isActive: 1 }, { session });
      await collection.createIndex({ isPlatform: 1 }, { session });
      await collection.createIndex({ isPartner: 1 }, { session });
      await collection.createIndex({ 'subscription.plan': 1 }, { session });
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

      const db = TenantModel.getDatabase();
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
            quotaBytes: org.settings?.features?.maxStorage || 10737418240,
            usedBytes: org.metrics?.storageUsed || 0
          },
          configuration: {
            timezone: 'America/New_York',
            locale: 'en-US',
            currency: org.settings?.billing?.currency || 'USD',
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12h'
          },
          isolation: {
            level: org.isPlatform ? 'dedicated' : 'shared',
            resourcePool: org.isPlatform ? 'platform' : 'standard',
            priority: OrganizationsSeeder.#getPriorityForPlan(org.subscription?.plan)
          },
          features: org.subscription?.features || {},
          limits: {
            maxUsers: org.settings?.features?.maxUsers || 100,
            maxProjects: org.settings?.features?.maxProjects || 50,
            maxApiCalls: OrganizationsSeeder.#getApiLimitForPlan(org.subscription?.plan),
            maxConcurrentRequests: OrganizationsSeeder.#getConcurrencyLimit(org.subscription?.plan)
          },
          status: 'active',
          isActive: true,
          metadata: {
            organizationType: org.type,
            subscriptionPlan: org.subscription?.plan,
            createdFrom: 'seeder'
          },
          createdAt: org.createdAt,
          updatedAt: new Date()
        };

        await tenantsCollection.insertOne(tenant, { session });
        count++;

        logger.info(`Created tenant for organization: ${org.name}`);
      }

      // Create indexes
      await tenantsCollection.createIndex({ organizationId: 1 }, { unique: true, session });
      await tenantsCollection.createIndex({ tenantId: 1 }, { unique: true, session });
      await tenantsCollection.createIndex({ status: 1 }, { session });
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
   * Helper methods for organization configuration
   */

  static #getPlanFeatures(plan, customFeatures = {}) {
    const baseFeatures = {
      starter: {
        basicReporting: true,
        emailSupport: true,
        apiAccess: false,
        customBranding: false,
        advancedAnalytics: false
      },
      professional: {
        basicReporting: true,
        advancedReporting: true,
        emailSupport: true,
        phoneSupport: true,
        apiAccess: true,
        customBranding: false,
        advancedAnalytics: false
      },
      business: {
        basicReporting: true,
        advancedReporting: true,
        emailSupport: true,
        phoneSupport: true,
        prioritySupport: true,
        apiAccess: true,
        customBranding: true,
        advancedAnalytics: false
      },
      enterprise: {
        basicReporting: true,
        advancedReporting: true,
        customReporting: true,
        emailSupport: true,
        phoneSupport: true,
        prioritySupport: true,
        dedicatedSupport: true,
        apiAccess: true,
        customBranding: true,
        whiteLabel: true,
        advancedAnalytics: true,
        customIntegrations: true
      }
    };

    return { ...baseFeatures[plan] || baseFeatures.starter, ...customFeatures };
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

  static #getPlanLimits(plan) {
    const limits = {
      starter: {
        maxUsers: 10,
        maxProjects: 5,
        maxStorage: 1073741824 // 1GB
      },
      professional: {
        maxUsers: 50,
        maxProjects: 25,
        maxStorage: 10737418240 // 10GB
      },
      business: {
        maxUsers: 200,
        maxProjects: 100,
        maxStorage: 107374182400 // 100GB
      },
      enterprise: {
        maxUsers: -1, // Unlimited
        maxProjects: -1, // Unlimited
        maxStorage: 1099511627776 // 1TB
      }
    };
    return limits[plan] || limits.starter;
  }

  static #getDemoIntegrations(orgType) {
    const integrations = {
      consulting: [
        { type: 'slack', status: 'active', connectedAt: new Date() },
        { type: 'googleWorkspace', status: 'active', connectedAt: new Date() }
      ],
      recruitment: [
        { type: 'linkedin', status: 'active', connectedAt: new Date() },
        { type: 'indeed', status: 'pending', connectedAt: null }
      ],
      hybrid: [
        { type: 'slack', status: 'active', connectedAt: new Date() },
        { type: 'linkedin', status: 'active', connectedAt: new Date() },
        { type: 'salesforce', status: 'active', connectedAt: new Date() }
      ]
    };
    return integrations[orgType] || [];
  }

  static #getShardForSize(size) {
    const shards = {
      small: 'shard-01',
      medium: 'shard-02',
      large: 'shard-03',
      enterprise: 'shard-dedicated'
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