'use strict';

/**
 * @fileoverview Organization-based authentication strategy for multi-tenant support
 * @module shared/lib/auth/strategies/organization-strategy
 * @requires module:passport-strategy
 * @requires module:shared/lib/auth/services/auth-service
 * @requires module:shared/lib/auth/services/password-service
 * @requires module:shared/lib/auth/services/token-service
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/tenant-model
 * @requires module:shared/lib/database/models/organization-member-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const { Strategy } = require('passport-strategy');
const AuthService = require('../services/auth-service');
const PasswordService = require('../services/password-service');
const TokenService = require('../services/token-service');
const UserModel = require('../../database/models/users/user-model');
const OrganizationModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-model');
const TenantModel = require('../../database/models/organizations/tenant-model');
const OrganizationMemberModel = require('../../../../servers/customer-services/modules/hosted-organizations/organizations/models/organization-member-model');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class OrganizationAuthStrategy
 * @extends Strategy
 * @description Multi-tenant organization authentication strategy
 */
class OrganizationAuthStrategy extends Strategy {
  /**
   * @private
   * @type {AuthService}
   */
  #authService;

  /**
   * @private
   * @type {PasswordService}
   */
  #passwordService;

  /**
   * @private
   * @type {TokenService}
   */
  #tokenService;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #organizationCache;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    name: 'organization',
    identifierField: 'identifier', // Can be 'email', 'username', or custom
    passwordField: 'password',
    organizationField: 'organization', // Field containing org identifier
    passReqToCallback: true,
    session: false,
    multiTenant: {
      strategy: 'subdomain', // 'subdomain' | 'header' | 'path' | 'field'
      isolation: 'logical', // 'logical' | 'physical' | 'hybrid'
      allowCrossOrganization: false,
      enforceOrgBoundaries: true,
      supportGlobalUsers: true // Allow users to exist across organizations
    },
    organization: {
      identifierType: 'slug', // 'slug' | 'id' | 'domain' | 'code'
      autoDetect: true,
      requireVerification: true,
      allowInactive: false,
      checkSubscription: true,
      enforceLimits: true
    },
    security: {
      isolateSessions: true,
      preventOrgSwitching: false,
      requireOrgContext: true,
      validateMembership: true,
      checkPermissions: true,
      enforceIPRestrictions: true
    },
    features: {
      supportSSO: true,
      supportSAML: true,
      supportOIDC: true,
      supportCustomDomains: true,
      supportWhiteLabeling: true
    },
    cache: {
      organizationCacheTTL: 3600, // 1 hour
      membershipCacheTTL: 1800, // 30 minutes
      tenantCacheTTL: 7200 // 2 hours
    },
    audit: {
      logOrganizationAccess: true,
      logCrossOrgAttempts: true,
      logMembershipChecks: true,
      trackOrgUsage: true
    }
  };

  /**
   * Creates organization strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {Object} [services] - Service instances
   */
  constructor(config = {}, services = {}) {
    super();
    
    this.#config = { ...OrganizationAuthStrategy.#DEFAULT_CONFIG, ...config };
    this.#authService = services.authService || new AuthService();
    this.#passwordService = services.passwordService || new PasswordService();
    this.#tokenService = services.tokenService || new TokenService();
    this.#cacheService = services.cacheService || new CacheService();
    this.#auditService = services.auditService || new AuditService();
    this.#organizationCache = new Map();

    this.name = this.#config.name;

    logger.info('OrganizationAuthStrategy initialized', {
      strategy: this.#config.multiTenant.strategy,
      isolation: this.#config.multiTenant.isolation,
      identifierType: this.#config.organization.identifierType
    });
  }

  /**
   * Authenticates user within organization context
   * @param {Object} req - Express request object
   * @param {Object} [options] - Authentication options
   */
  async authenticate(req, options = {}) {
    const correlationId = req.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      // Extract credentials
      const identifier = req.body[this.#config.identifierField];
      const password = req.body[this.#config.passwordField];
      const organizationIdentifier = req.body[this.#config.organizationField];

      // Validate input
      if (!identifier || !password) {
        throw new AppError(
          'Credentials required',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { correlationId }
        );
      }

      // Detect organization context
      const organization = await this.#detectOrganization(
        req,
        organizationIdentifier,
        correlationId
      );

      if (!organization) {
        throw new AppError(
          'Organization context required',
          400,
          ERROR_CODES.ORGANIZATION_NOT_FOUND,
          { correlationId }
        );
      }

      // Validate organization status
      await this.#validateOrganization(organization, correlationId);

      // Find user within organization
      const user = await this.#findOrganizationUser(
        identifier,
        organization._id,
        correlationId
      );

      if (!user) {
        throw new AppError(
          'Invalid credentials',
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          { correlationId }
        );
      }

      // Verify password
      const isValidPassword = await this.#passwordService.verifyPassword(
        password,
        user.password
      );

      if (!isValidPassword) {
        await this.#handleFailedLogin(user, organization, correlationId);
        throw new AppError(
          'Invalid credentials',
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          { correlationId }
        );
      }

      // Validate membership and permissions
      const membership = await this.#validateMembership(
        user,
        organization,
        correlationId
      );

      // Check organization-specific restrictions
      await this.#checkOrganizationRestrictions(
        user,
        organization,
        membership,
        req,
        correlationId
      );

      // Get tenant configuration if multi-tenant
      const tenant = await this.#getTenantConfiguration(organization, correlationId);

      // Enhance user with organization context
      const enhancedUser = await this.#enhanceUserWithOrgContext(
        user,
        organization,
        membership,
        tenant,
        correlationId
      );

      // Update login metadata
      await this.#updateLoginMetadata(user, organization, req);

      // Audit successful login
      if (this.#config.audit.logOrganizationAccess) {
        await this.#auditOrganizationLogin(
          req,
          enhancedUser,
          organization,
          true,
          correlationId
        );
      }

      logger.info('Organization authentication successful', {
        correlationId,
        userId: user._id,
        organizationId: organization._id,
        duration: Date.now() - startTime
      });

      this.success(enhancedUser);

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Organization authentication failed', {
        correlationId,
        error: error.message,
        duration
      });

      this.fail(error, error.statusCode || 401);
    }
  }

  /**
   * @private
   * Detects organization from request
   */
  async #detectOrganization(req, explicitIdentifier, correlationId) {
    let organizationIdentifier = explicitIdentifier;

    // Auto-detect organization if enabled
    if (this.#config.organization.autoDetect && !organizationIdentifier) {
      switch (this.#config.multiTenant.strategy) {
        case 'subdomain':
          organizationIdentifier = this.#extractSubdomain(req);
          break;

        case 'header':
          organizationIdentifier = req.headers['x-organization-id'] || 
                                 req.headers['x-tenant-id'];
          break;

        case 'path':
          // Extract from URL path (e.g., /org/acme-corp/login)
          const pathMatch = req.path.match(/^\/org\/([^\/]+)/);
          organizationIdentifier = pathMatch?.[1];
          break;

        case 'field':
          // Already handled by explicitIdentifier
          break;

        default:
          logger.warn('Unknown multi-tenant strategy', {
            correlationId,
            strategy: this.#config.multiTenant.strategy
          });
      }
    }

    if (!organizationIdentifier) {
      return null;
    }

    // Check cache
    const cacheKey = `org:${this.#config.organization.identifierType}:${organizationIdentifier}`;
    const cachedOrg = await this.#cacheService.get(cacheKey);
    if (cachedOrg) {
      return cachedOrg;
    }

    // Find organization
    const query = {};
    switch (this.#config.organization.identifierType) {
      case 'slug':
        query.slug = organizationIdentifier;
        break;
      case 'id':
        query._id = organizationIdentifier;
        break;
      case 'domain':
        query.customDomain = organizationIdentifier;
        break;
      case 'code':
        query.organizationCode = organizationIdentifier;
        break;
    }

    const organization = await OrganizationModel.findOne(query)
      .populate('subscription')
      .lean();

    if (organization) {
      // Cache organization
      await this.#cacheService.set(
        cacheKey,
        organization,
        this.#config.cache.organizationCacheTTL
      );
    }

    return organization;
  }

  /**
   * @private
   * Validates organization status
   */
  async #validateOrganization(organization, correlationId) {
    if (!organization.isActive && !this.#config.organization.allowInactive) {
      throw new AppError(
        'Organization is inactive',
        403,
        ERROR_CODES.ORGANIZATION_INACTIVE,
        { correlationId, organizationId: organization._id }
      );
    }

    if (this.#config.organization.requireVerification && !organization.isVerified) {
      throw new AppError(
        'Organization not verified',
        403,
        ERROR_CODES.ORGANIZATION_NOT_VERIFIED,
        { correlationId, organizationId: organization._id }
      );
    }

    if (this.#config.organization.checkSubscription && organization.subscription) {
      const subscription = organization.subscription;
      
      if (!subscription.isActive || subscription.status === 'expired') {
        throw new AppError(
          'Organization subscription expired',
          403,
          ERROR_CODES.SUBSCRIPTION_EXPIRED,
          { correlationId, organizationId: organization._id }
        );
      }

      if (subscription.status === 'suspended') {
        throw new AppError(
          'Organization subscription suspended',
          403,
          ERROR_CODES.SUBSCRIPTION_SUSPENDED,
          { correlationId, organizationId: organization._id }
        );
      }
    }
  }

  /**
   * @private
   * Finds user within organization context
   */
  async #findOrganizationUser(identifier, organizationId, correlationId) {
    const cacheKey = `org_user:${organizationId}:${identifier}`;
    
    // Check cache
    const cachedUser = await this.#cacheService.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    // Build query
    const baseQuery = {
      $or: [
        { email: identifier },
        { username: identifier }
      ],
      isDeleted: { $ne: true }
    };

    let user;

    if (this.#config.multiTenant.supportGlobalUsers) {
      // First, find the user
      user = await UserModel.findOne(baseQuery)
        .select('+password')
        .populate('roles')
        .populate('permissions')
        .lean();

      if (user) {
        // Then check if they have membership in this organization
        const membership = await OrganizationMemberModel.findOne({
          userId: user._id,
          organizationId,
          isActive: true
        }).lean();

        if (!membership) {
          return null; // User exists but not in this organization
        }
      }
    } else {
      // Direct query with organization constraint
      user = await UserModel.findOne({
        ...baseQuery,
        organizationId
      })
      .select('+password')
      .populate('roles')
      .populate('permissions')
      .lean();
    }

    if (user) {
      // Don't cache user with password
      const userToCache = { ...user };
      delete userToCache.password;
      await this.#cacheService.set(cacheKey, userToCache, this.#config.cache.membershipCacheTTL);
    }

    return user;
  }

  /**
   * @private
   * Validates organization membership
   */
  async #validateMembership(user, organization, correlationId) {
    if (!this.#config.security.validateMembership) {
      return null;
    }

    const membership = await OrganizationMemberModel.findOne({
      userId: user._id,
      organizationId: organization._id
    })
    .populate('role')
    .populate('permissions')
    .lean();

    if (!membership) {
      throw new AppError(
        'Not a member of this organization',
        403,
        ERROR_CODES.ORGANIZATION_MEMBERSHIP_REQUIRED,
        { correlationId }
      );
    }

    if (!membership.isActive) {
      throw new AppError(
        'Organization membership inactive',
        403,
        ERROR_CODES.MEMBERSHIP_INACTIVE,
        { correlationId }
      );
    }

    if (membership.expiresAt && membership.expiresAt < new Date()) {
      throw new AppError(
        'Organization membership expired',
        403,
        ERROR_CODES.MEMBERSHIP_EXPIRED,
        { correlationId }
      );
    }

    // Audit membership check
    if (this.#config.audit.logMembershipChecks) {
      await this.#auditService.logEvent({
        event: 'organization.membership_validated',
        userId: user._id,
        organizationId: organization._id,
        correlationId,
        metadata: {
          membershipId: membership._id,
          role: membership.role?.name,
          permissions: membership.permissions?.length || 0
        }
      });
    }

    return membership;
  }

  /**
   * @private
   * Checks organization-specific restrictions
   */
  async #checkOrganizationRestrictions(user, organization, membership, req, correlationId) {
    // Check IP restrictions
    if (this.#config.security.enforceIPRestrictions && organization.ipRestrictions?.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress;
      const isAllowedIP = this.#checkIPRestriction(clientIP, organization.ipRestrictions);

      if (!isAllowedIP) {
        throw new AppError(
          'Access denied from this IP address',
          403,
          ERROR_CODES.IP_RESTRICTED,
          { correlationId, clientIP }
        );
      }
    }

    // Check time-based restrictions
    if (organization.accessSchedule) {
      const isWithinSchedule = this.#checkAccessSchedule(organization.accessSchedule);
      
      if (!isWithinSchedule) {
        throw new AppError(
          'Access denied outside allowed hours',
          403,
          ERROR_CODES.TIME_RESTRICTED,
          { correlationId }
        );
      }
    }

    // Check member limits
    if (this.#config.organization.enforceLimits && organization.limits?.maxMembers) {
      const memberCount = await OrganizationMemberModel.countDocuments({
        organizationId: organization._id,
        isActive: true
      });

      if (memberCount >= organization.limits.maxMembers) {
        logger.warn('Organization member limit reached', {
          correlationId,
          organizationId: organization._id,
          limit: organization.limits.maxMembers,
          current: memberCount
        });
      }
    }

    // Check custom restrictions
    if (organization.customRestrictions && membership) {
      await this.#evaluateCustomRestrictions(
        user,
        organization,
        membership,
        req,
        correlationId
      );
    }
  }

  /**
   * @private
   * Gets tenant configuration
   */
  async #getTenantConfiguration(organization, correlationId) {
    if (this.#config.multiTenant.isolation === 'logical') {
      return null; // No separate tenant config needed
    }

    const cacheKey = `tenant:${organization._id}`;
    const cachedTenant = await this.#cacheService.get(cacheKey);
    if (cachedTenant) {
      return cachedTenant;
    }

    const tenant = await TenantModel.findOne({
      organizationId: organization._id,
      isActive: true
    }).lean();

    if (tenant) {
      await this.#cacheService.set(cacheKey, tenant, this.#config.cache.tenantCacheTTL);
    }

    return tenant;
  }

  /**
   * @private
   * Enhances user with organization context
   */
  async #enhanceUserWithOrgContext(user, organization, membership, tenant, correlationId) {
    const enhancedUser = {
      ...user,
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        customDomain: organization.customDomain
      },
      membership: membership ? {
        _id: membership._id,
        role: membership.role,
        permissions: membership.permissions,
        department: membership.department,
        joinedAt: membership.createdAt
      } : null,
      tenant: tenant ? {
        _id: tenant._id,
        database: tenant.database,
        schema: tenant.schema,
        isolation: tenant.isolationType
      } : null,
      organizationContext: {
        isOrganizationAdmin: membership?.role?.name === 'organization_admin',
        organizationPermissions: this.#mergePermissions(user, membership),
        features: organization.features || {},
        limits: organization.limits || {}
      }
    };

    // Add SSO info if applicable
    if (this.#config.features.supportSSO && organization.ssoConfig) {
      enhancedUser.sso = {
        enabled: organization.ssoConfig.enabled,
        provider: organization.ssoConfig.provider,
        enforced: organization.ssoConfig.enforced
      };
    }

    return enhancedUser;
  }

  /**
   * @private
   * Extracts subdomain from request
   */
  #extractSubdomain(req) {
    const host = req.get('host') || req.hostname;
    const parts = host.split('.');
    
    // Ignore www
    if (parts[0] === 'www') {
      parts.shift();
    }

    // Get subdomain if exists
    if (parts.length > 2 || (parts.length === 2 && !parts[1].includes(':'))) {
      return parts[0];
    }

    return null;
  }

  /**
   * @private
   * Checks IP restriction
   */
  #checkIPRestriction(clientIP, restrictions) {
    // Simplified IP checking - in production, use proper IP range checking
    return restrictions.some(restriction => {
      if (restriction.type === 'exact') {
        return restriction.value === clientIP;
      }
      if (restriction.type === 'range') {
        // Implement IP range checking
        return true; // Placeholder
      }
      if (restriction.type === 'cidr') {
        // Implement CIDR checking
        return true; // Placeholder
      }
      return false;
    });
  }

  /**
   * @private
   * Checks access schedule
   */
  #checkAccessSchedule(schedule) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    // Check day of week
    if (schedule.daysOfWeek && !schedule.daysOfWeek.includes(currentDay)) {
      return false;
    }

    // Check time range
    if (schedule.startHour !== undefined && currentHour < schedule.startHour) {
      return false;
    }
    if (schedule.endHour !== undefined && currentHour >= schedule.endHour) {
      return false;
    }

    // Check timezone if specified
    if (schedule.timezone) {
      // Implement timezone-aware checking
    }

    return true;
  }

  /**
   * @private
   * Evaluates custom restrictions
   */
  async #evaluateCustomRestrictions(user, organization, membership, req, correlationId) {
    // Placeholder for custom restriction evaluation
    // This could integrate with a rules engine or custom scripts
    
    if (organization.customRestrictions.requireMFA && !user.twoFactorEnabled) {
      throw new AppError(
        'Two-factor authentication required by organization',
        403,
        ERROR_CODES.MFA_REQUIRED,
        { correlationId }
      );
    }

    if (organization.customRestrictions.minPasswordAge) {
      const passwordAge = Date.now() - new Date(user.passwordChangedAt).getTime();
      const minAge = organization.customRestrictions.minPasswordAge * 86400000; // days to ms
      
      if (passwordAge < minAge) {
        throw new AppError(
          'Password too recently changed',
          403,
          ERROR_CODES.PASSWORD_TOO_NEW,
          { correlationId }
        );
      }
    }
  }

  /**
   * @private
   * Merges user and membership permissions
   */
  #mergePermissions(user, membership) {
    const permissions = new Set();

    // Add user's direct permissions
    if (user.permissions) {
      user.permissions.forEach(p => permissions.add(p.code || p));
    }

    // Add role permissions
    if (user.roles) {
      user.roles.forEach(role => {
        if (role.permissions) {
          role.permissions.forEach(p => permissions.add(p.code || p));
        }
      });
    }

    // Add membership permissions
    if (membership) {
      if (membership.permissions) {
        membership.permissions.forEach(p => permissions.add(p.code || p));
      }
      if (membership.role?.permissions) {
        membership.role.permissions.forEach(p => permissions.add(p.code || p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * @private
   * Handles failed login
   */
  async #handleFailedLogin(user, organization, correlationId) {
    // Track failed attempts
    await UserModel.findByIdAndUpdate(user._id, {
      $inc: { failedLoginAttempts: 1 },
      lastFailedLogin: new Date()
    });

    // Audit failed login
    if (this.#config.audit.logOrganizationAccess) {
      await this.#auditService.logEvent({
        event: 'organization.login_failed',
        userId: user._id,
        organizationId: organization._id,
        correlationId,
        metadata: {
          reason: 'invalid_password'
        }
      });
    }
  }

  /**
   * @private
   * Updates login metadata
   */
  async #updateLoginMetadata(user, organization, req) {
    await UserModel.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastLoginIP: req.ip || req.connection.remoteAddress,
      lastLoginUserAgent: req.headers['user-agent'],
      lastLoginOrganization: organization._id,
      failedLoginAttempts: 0
    });

    // Update organization member activity
    await OrganizationMemberModel.findOneAndUpdate(
      {
        userId: user._id,
        organizationId: organization._id
      },
      {
        lastActivityAt: new Date(),
        $inc: { loginCount: 1 }
      }
    );
  }

  /**
   * @private
   * Audits organization login
   */
  async #auditOrganizationLogin(req, user, organization, success, correlationId) {
    try {
      await this.#auditService.logEvent({
        event: success ? 'organization.login_success' : 'organization.login_failed',
        userId: user._id,
        organizationId: organization._id,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        correlationId,
        metadata: {
          method: 'organization',
          organizationSlug: organization.slug,
          membershipRole: user.membership?.role?.name,
          detectionStrategy: this.#config.multiTenant.strategy
        }
      });

      // Track organization usage
      if (this.#config.audit.trackOrgUsage && success) {
        await this.#auditService.logMetric({
          metric: 'organization.active_users',
          organizationId: organization._id,
          value: 1,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Failed to audit organization login', { error: error.message });
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export factory function
module.exports = (config) => {
  return new OrganizationAuthStrategy(config);
};

// Also export class for testing and extension
module.exports.OrganizationAuthStrategy = OrganizationAuthStrategy;