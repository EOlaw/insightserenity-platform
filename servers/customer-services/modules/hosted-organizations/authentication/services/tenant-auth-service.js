/**
 * @fileoverview Tenant Authentication Service - B2B Multi-Tenant Orchestration
 * @module servers/customer-services/modules/hosted-organizations/authentication/services/tenant-auth-service
 * @description Authentication orchestration for users belonging to hosted tenant organizations
 * @description Handles B2B customers who are part of organizations that pay for your platform
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Import universal authentication service
const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');

// Tenant organization services
const OrganizationService = require('../organization-management/services/organization-service');

// Shared services (these would be in a shared tenant services folder)
const TenantNotificationService = require('../../../core-business/notifications/services/notification-service');
const TenantAnalyticsService = require('../../../core-business/analytics/services/analytics-service');
const TenantOnboardingService = require('../../../core-business/onboarding/services/onboarding-service');
const TenantUserService = require('../user-management/services/tenant-user-service');

/**
 * Tenant User Roles
 * @enum {string}
 */
const TENANT_USER_ROLES = {
    OWNER: 'owner',
    ADMIN: 'admin',
    MANAGER: 'manager',
    MEMBER: 'member',
    VIEWER: 'viewer',
    GUEST: 'guest'
};

/**
 * Tenant Authentication Service
 * Orchestrates authentication for users belonging to hosted tenant organizations
 * @class TenantAuthService
 */
class TenantAuthService {
    constructor() {
        // Create configured instance of universal auth service
        this.authService = new AuthService({
            context: 'tenant_organization',
            requireEmailVerification: process.env.TENANT_REQUIRE_EMAIL_VERIFICATION !== 'false',
            enableMFA: process.env.TENANT_ENABLE_MFA !== 'false',
            maxLoginAttempts: parseInt(process.env.TENANT_MAX_LOGIN_ATTEMPTS || '5'),
            sessionTimeout: parseInt(process.env.TENANT_SESSION_TIMEOUT || '86400000'),
            
            // Configure user structure for multi-tenant (organizations required)
            userStructure: {
                identityFields: ['email', 'username'],
                credentialFields: ['password'],
                profileFields: ['firstName', 'lastName', 'phoneNumber'],
                statusFields: ['accountStatus'],
                securityFields: ['security', 'verification', 'mfa'],
                metadataFields: ['metadata', 'activity'],
                organizationFields: ['organizations'] // Required for tenant users
            },
            
            // Custom hooks for tenant workflows
            hooks: {
                beforeRegister: this._beforeRegisterHook.bind(this),
                afterRegister: this._afterRegisterHook.bind(this),
                beforeLogin: this._beforeLoginHook.bind(this),
                afterLogin: this._afterLoginHook.bind(this),
                enrichUserData: this._enrichUserDataHook.bind(this),
                sanitizeUserData: this._sanitizeUserDataHook.bind(this),
                validateUser: this._validateUserHook.bind(this)
            }
        });

        // Service dependencies
        this.organizationService = OrganizationService;
        this.notificationService = TenantNotificationService;
        this.analyticsService = TenantAnalyticsService;
        this.onboardingService = TenantOnboardingService;
        this.tenantUserService = TenantUserService;

        // Tenant-specific configuration
        this.config = {
            enableWelcomeEmail: process.env.TENANT_WELCOME_EMAIL !== 'false',
            enableOnboarding: process.env.TENANT_ONBOARDING !== 'false',
            enableAnalytics: process.env.TENANT_ANALYTICS !== 'false',
            autoAssignDefaultRole: true,
            defaultRole: TENANT_USER_ROLES.MEMBER,
            requireProfileCompletion: false,
            enableReferralTracking: true
        };
    }

    /**
     * Register a new tenant user
     * @param {Object} userData - User registration data
     * @param {string} organizationId - Organization/tenant identifier
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerTenantUser(userData, organizationId, options = {}) {
        try {
            // CRITICAL: Validate organization exists and can accept new users
            await this._validateOrganizationCanAcceptUsers(organizationId);

            // Apply tenant-specific validation rules
            await this._validateTenantUserRegistration(userData, organizationId, options);

            // Enrich user data with tenant-specific metadata
            const enrichedUserData = await this._enrichTenantUserData(userData, options);

            // Configure organization membership data
            const organizationData = [{
                organizationId: organizationId,
                roles: this._determineUserRoles(options),
                isPrimary: true,
                joinedAt: new Date(),
                status: 'active',
                invitedBy: options.invitedBy,
                jobTitle: userData.jobTitle,
                departmentId: options.departmentId,
                teamIds: options.teamIds || []
            }];

            // Call universal auth service for core registration
            const registrationResult = await this.authService.register(
                enrichedUserData,
                organizationId,
                {
                    userType: 'tenant_user',
                    source: 'tenant_portal',
                    ip: options.ip,
                    userAgent: options.userAgent,
                    deviceFingerprint: options.deviceFingerprint,
                    organizationData: organizationData,
                    roleConfig: {
                        roles: this._determineUserRoles(options),
                        defaultRole: this.config.defaultRole
                    },
                    metadata: {
                        tenantContext: true,
                        organizationName: options.organizationName,
                        registrationSource: options.registrationSource,
                        invitationCode: options.invitationCode
                    }
                }
            );

            // Increment organization user count
            await this.organizationService.incrementUsage(organizationId, 'users');

            // Execute post-registration workflows
            await this._executePostRegistrationWorkflows(
                registrationResult.user,
                organizationId,
                options
            );

            // Initialize onboarding if enabled
            let onboardingData = null;
            if (this.config.enableOnboarding) {
                onboardingData = await this._initializeOnboarding(
                    registrationResult.user.id,
                    organizationId
                );
            }

            logger.info('Tenant user registration completed successfully', {
                userId: registrationResult.user.id,
                email: registrationResult.user.email,
                organizationId: organizationId
            });

            // Return enriched response
            return {
                ...registrationResult,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(registrationResult),
                organizationPortalUrl: this._getOrganizationPortalUrl(organizationId)
            };

        } catch (error) {
            logger.error('Tenant user registration failed', {
                error: error.message,
                email: userData.email,
                organizationId: organizationId
            });
            throw error;
        }
    }

    /**
     * Authenticate tenant user with credentials
     * @param {Object} credentials - Login credentials
     * @param {string} organizationId - Organization identifier
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async loginTenantUser(credentials, organizationId, options = {}) {
        try {
            // Pre-login validation: Check organization is active
            await this._validateOrganizationForLogin(organizationId);

            // Call universal auth service for core authentication
            const loginResult = await this.authService.login(
                credentials,
                organizationId,
                {
                    ip: options.ip,
                    userAgent: options.userAgent,
                    deviceFingerprint: options.deviceFingerprint
                }
            );

            // Handle MFA challenge (pass through)
            if (loginResult.requiresMFA) {
                return loginResult;
            }

            // Load tenant-specific user data
            const organizationMembership = this._getOrganizationMembership(
                loginResult.user,
                organizationId
            );

            // Check profile completion status
            const profileStatus = await this._checkProfileCompletionStatus(
                loginResult.user.id,
                organizationId
            );

            // Load organization-specific preferences
            const userPreferences = await this._loadUserPreferences(
                loginResult.user.id,
                organizationId
            );

            // Get pending notifications
            const pendingNotifications = await this._getPendingNotifications(
                loginResult.user.id,
                organizationId
            );

            logger.info('Tenant user login completed successfully', {
                userId: loginResult.user.id,
                email: loginResult.user.email,
                organizationId: organizationId
            });

            // Return enriched response
            return {
                ...loginResult,
                organization: {
                    id: organizationId,
                    membership: organizationMembership,
                    roles: organizationMembership?.roles || []
                },
                profileStatus: profileStatus,
                preferences: userPreferences,
                pendingNotifications: pendingNotifications,
                organizationPortalUrl: this._getOrganizationPortalUrl(organizationId),
                features: await this._getAvailableFeatures(loginResult.user, organizationId)
            };

        } catch (error) {
            logger.error('Tenant user login failed', {
                error: error.message,
                email: credentials.email,
                organizationId: organizationId
            });
            throw error;
        }
    }

    /**
     * Logout tenant user
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logoutTenantUser(userId, sessionId, options = {}) {
        try {
            // Call universal auth service for core logout
            const logoutResult = await this.authService.logout(userId, sessionId, options);

            logger.info('Tenant user logout completed successfully', {
                userId,
                sessionId
            });

            return logoutResult;

        } catch (error) {
            logger.error('Tenant user logout failed', {
                error: error.message,
                userId,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Request password reset for tenant user
     * @param {string} email - User email
     * @param {string} organizationId - Organization identifier
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset request result
     */
    async requestPasswordReset(email, organizationId, options = {}) {
        try {
            // Call universal auth service for core password reset
            const resetResult = await this.authService.requestPasswordReset(
                email,
                organizationId,
                options
            );

            // Send organization-branded password reset email
            if (resetResult.resetToken) {
                await this._sendPasswordResetEmail(
                    email,
                    resetResult.resetToken,
                    organizationId
                );
            }

            logger.info('Password reset request processed', {
                email,
                organizationId
            });

            return resetResult;

        } catch (error) {
            logger.error('Password reset request failed', {
                error: error.message,
                email,
                organizationId
            });
            throw error;
        }
    }

    /**
     * Enable MFA for tenant user
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} organizationId - Organization identifier
     * @param {Object} options - MFA options
     * @returns {Promise<Object>} MFA setup result
     */
    async enableMFA(userId, method, organizationId, options = {}) {
        try {
            const mfaResult = await this.authService.enableMFA(
                userId,
                method,
                organizationId,
                options
            );

            // Send MFA setup instructions
            await this._sendMFASetupInstructions(userId, method, mfaResult, organizationId);

            logger.info('MFA setup initiated', {
                userId,
                method,
                organizationId
            });

            return {
                ...mfaResult,
                supportUrl: this._getMFASupportUrl(organizationId),
                videoTutorial: this._getMFAVideoTutorialUrl(method)
            };

        } catch (error) {
            logger.error('MFA setup failed', {
                error: error.message,
                userId,
                method,
                organizationId
            });
            throw error;
        }
    }

    // ============= HOOK IMPLEMENTATIONS =============

    /**
     * Before register hook
     * @private
     */
    async _beforeRegisterHook(userData, tenantId, options) {
        logger.debug('Before register hook executed', {
            email: userData.email,
            organizationId: tenantId
        });
    }

    /**
     * After register hook
     * @private
     */
    async _afterRegisterHook(user, tokens, session, options) {
        logger.debug('After register hook executed', {
            userId: user._id,
            organizationId: options.organizationData?.[0]?.organizationId
        });
    }

    /**
     * Before login hook
     * @private
     */
    async _beforeLoginHook(credentials, tenantId, options) {
        logger.debug('Before login hook executed', {
            email: credentials.email,
            organizationId: tenantId
        });
    }

    /**
     * After login hook
     * @private
     */
    async _afterLoginHook(user, tokens, session, options) {
        // Update last login timestamp
        try {
            await this.tenantUserService.updateLastLogin(user._id);
        } catch (error) {
            logger.error('Failed to update last login', {
                error: error.message,
                userId: user._id
            });
        }

        logger.debug('After login hook executed', { userId: user._id });
    }

    /**
     * Enrich user data hook
     * @private
     */
    async _enrichUserDataHook(userDocument, options) {
        // Add tenant-specific enrichments
        if (!userDocument.metadata) userDocument.metadata = {};
        
        userDocument.metadata.tenantContext = true;
        userDocument.metadata.organizationId = options.organizationData?.[0]?.organizationId;

        logger.debug('User data enriched for tenant context');
    }

    /**
     * Sanitize user data hook
     * @private
     */
    async _sanitizeUserDataHook(user, options) {
        const userObject = user.toObject ? user.toObject() : user;
        
        // Remove sensitive fields
        delete userObject.password;
        delete userObject.passwordHistory;
        delete userObject.security;
        delete userObject.verification;
        
        if (userObject.mfa) {
            delete userObject.mfa.methods;
        }
        
        delete userObject.__v;

        return userObject;
    }

    /**
     * Validate user hook (tenant-specific validation)
     * @private
     */
    async _validateUserHook(user, options) {
        // Additional tenant-specific user validation during login
        const organizationMembership = user.organizations?.find(
            org => org.organizationId.toString() === options.tenantId?.toString()
        );

        if (!organizationMembership) {
            throw new AppError(
                'User does not belong to this organization',
                403,
                'USER_NOT_MEMBER'
            );
        }

        if (organizationMembership.status !== 'active') {
            throw new AppError(
                `Organization membership is ${organizationMembership.status}`,
                403,
                'MEMBERSHIP_INACTIVE'
            );
        }
    }

    // ============= VALIDATION METHODS =============

    /**
     * Validate organization can accept new users
     * @private
     */
    async _validateOrganizationCanAcceptUsers(organizationId) {
        try {
            const organization = await this.organizationService.getOrganization(organizationId);

            if (!organization) {
                throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
            }

            // Use the organization's built-in validation method
            const canAccept = organization.canAcceptNewUsers();
            
            if (!canAccept.allowed) {
                throw new AppError(
                    canAccept.reason,
                    403,
                    canAccept.code
                );
            }

            return true;

        } catch (error) {
            logger.error('Organization validation failed', {
                error: error.message,
                organizationId
            });
            throw error;
        }
    }

    /**
     * Validate organization for login
     * @private
     */
    async _validateOrganizationForLogin(organizationId) {
        try {
            const validationResult = await this.organizationService.validateOrganization(organizationId);

            if (!validationResult.valid) {
                throw new AppError(
                    validationResult.reason,
                    403,
                    validationResult.code
                );
            }

            return true;

        } catch (error) {
            logger.error('Organization login validation failed', {
                error: error.message,
                organizationId
            });
            throw error;
        }
    }

    /**
     * Validate tenant user registration
     * @private
     */
    async _validateTenantUserRegistration(userData, organizationId, options) {
        // Check if email domain is allowed for this organization
        const organization = await this.organizationService.getOrganization(organizationId);
        
        if (organization.settings?.allowedDomains?.length > 0) {
            const emailDomain = userData.email.split('@')[1];
            if (!organization.settings.allowedDomains.includes(emailDomain)) {
                throw new AppError(
                    'Email domain not allowed for this organization',
                    400,
                    'DOMAIN_NOT_ALLOWED'
                );
            }
        }

        // Validate invitation code if required
        if (options.requireInvitation && !options.invitationCode) {
            throw new AppError(
                'Invitation code required',
                400,
                'INVITATION_REQUIRED'
            );
        }

        return true;
    }

    // ============= ENRICHMENT METHODS =============

    /**
     * Enrich tenant user data
     * @private
     */
    async _enrichTenantUserData(userData, options) {
        const enrichedData = { ...userData };

        // Add tenant-specific metadata
        enrichedData.tenantContext = true;
        enrichedData.registrationSource = options.registrationSource || 'direct';

        // Track invitation if provided
        if (options.invitationCode) {
            enrichedData.invitationCode = options.invitationCode;
        }

        return enrichedData;
    }

    /**
     * Determine user roles
     * @private
     */
    _determineUserRoles(options) {
        if (options.roles && Array.isArray(options.roles)) {
            return options.roles.map(role => ({
                roleName: role,
                assignedAt: new Date()
            }));
        }

        return [{
            roleName: options.role || this.config.defaultRole,
            assignedAt: new Date()
        }];
    }

    // ============= WORKFLOW METHODS =============

    /**
     * Execute post-registration workflows
     * @private
     */
    async _executePostRegistrationWorkflows(user, organizationId, options) {
        try {
            // Create tenant user profile
            await this.tenantUserService.createTenantUserProfile(user.id, {
                organizationId: organizationId,
                registrationSource: options.registrationSource,
                invitedBy: options.invitedBy
            });

            // Send welcome email
            if (this.config.enableWelcomeEmail) {
                await this._sendWelcomeEmail(user, organizationId);
            }

            // Track analytics
            if (this.config.enableAnalytics) {
                await this._trackRegistrationEvent(user, organizationId, options);
            }

            logger.debug('Post-registration workflows completed', {
                userId: user.id,
                organizationId
            });

        } catch (error) {
            logger.error('Post-registration workflows failed', {
                error: error.message,
                userId: user.id
            });
            // Do not throw - registration already succeeded
        }
    }

    /**
     * Initialize onboarding
     * @private
     */
    async _initializeOnboarding(userId, organizationId) {
        try {
            return await this.onboardingService.createOnboarding({
                userId: userId,
                organizationId: organizationId,
                type: 'tenant_user'
            });
        } catch (error) {
            logger.error('Failed to initialize onboarding', {
                error: error.message,
                userId
            });
            return null;
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Get organization membership for user
     * @private
     */
    _getOrganizationMembership(user, organizationId) {
        return user.organizations?.find(
            org => org.organizationId.toString() === organizationId.toString()
        );
    }

    /**
     * Check profile completion status
     * @private
     */
    async _checkProfileCompletionStatus(userId, organizationId) {
        try {
            const profile = await this.tenantUserService.getTenantUserProfile(userId, organizationId);
            return {
                isComplete: profile.completionPercentage === 100,
                completionPercentage: profile.completionPercentage || 0,
                missingFields: profile.missingFields || []
            };
        } catch (error) {
            logger.error('Failed to check profile completion', {
                error: error.message,
                userId
            });
            return { isComplete: false, completionPercentage: 0 };
        }
    }

    /**
     * Load user preferences
     * @private
     */
    async _loadUserPreferences(userId, organizationId) {
        try {
            return await this.tenantUserService.getUserPreferences(userId, organizationId);
        } catch (error) {
            logger.error('Failed to load user preferences', {
                error: error.message,
                userId
            });
            return {};
        }
    }

    /**
     * Get pending notifications
     * @private
     */
    async _getPendingNotifications(userId, organizationId) {
        try {
            return await this.notificationService.getPendingNotifications(userId, organizationId);
        } catch (error) {
            logger.error('Failed to get pending notifications', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get available features
     * @private
     */
    async _getAvailableFeatures(user, organizationId) {
        try {
            const organization = await this.organizationService.getOrganization(organizationId);
            const membership = this._getOrganizationMembership(user, organizationId);

            return {
                hasProjectAccess: true,
                hasReporting: organization.subscription?.tier !== 'free',
                hasAPIAccess: organization.features?.apiAccess?.enabled || false,
                hasAdvancedFeatures: organization.subscription?.tier === 'enterprise',
                userRole: membership?.roles?.[0]?.roleName || 'member'
            };

        } catch (error) {
            logger.error('Failed to get available features', {
                error: error.message,
                userId: user.id
            });
            return {};
        }
    }

    /**
     * Get registration next steps
     * @private
     */
    _getRegistrationNextSteps(registrationResult) {
        const steps = [];

        if (registrationResult.requiresEmailVerification) {
            steps.push({
                step: 'verify_email',
                title: 'Verify your email',
                description: 'Check your inbox for a verification link',
                required: true
            });
        }

        if (this.config.requireProfileCompletion) {
            steps.push({
                step: 'complete_profile',
                title: 'Complete your profile',
                description: 'Add additional information to your account',
                required: false
            });
        }

        if (this.config.enableOnboarding) {
            steps.push({
                step: 'onboarding_tour',
                title: 'Take a quick tour',
                description: 'Learn about the platform features',
                required: false
            });
        }

        return steps;
    }

    // ============= NOTIFICATION METHODS =============

    /**
     * Send welcome email
     * @private
     */
    async _sendWelcomeEmail(user, organizationId) {
        try {
            const organization = await this.organizationService.getOrganization(organizationId);

            await this.notificationService.sendEmail({
                to: user.email,
                template: 'tenant-user-welcome',
                data: {
                    firstName: user.profile?.firstName || user.email,
                    organizationName: organization.name,
                    portalUrl: this._getOrganizationPortalUrl(organizationId),
                    supportEmail: organization.contact?.supportEmail || 'support@yourplatform.com'
                }
            });
        } catch (error) {
            logger.error('Failed to send welcome email', {
                error: error.message,
                userId: user.id
            });
        }
    }

    /**
     * Send password reset email
     * @private
     */
    async _sendPasswordResetEmail(email, resetToken, organizationId) {
        try {
            await this.notificationService.sendEmail({
                to: email,
                template: 'tenant-password-reset',
                data: {
                    resetUrl: this._getPasswordResetUrl(resetToken, organizationId),
                    expiryHours: 1
                }
            });
        } catch (error) {
            logger.error('Failed to send password reset email', {
                error: error.message,
                email
            });
        }
    }

    /**
     * Send MFA setup instructions
     * @private
     */
    async _sendMFASetupInstructions(userId, method, mfaResult, organizationId) {
        try {
            const user = await this.tenantUserService.getUserById(userId);
            await this.notificationService.sendEmail({
                to: user.email,
                template: 'tenant-mfa-setup',
                data: {
                    method: method,
                    instructions: mfaResult.instructions,
                    supportUrl: this._getMFASupportUrl(organizationId)
                }
            });
        } catch (error) {
            logger.error('Failed to send MFA setup instructions', {
                error: error.message,
                userId
            });
        }
    }

    /**
     * Track registration event
     * @private
     */
    async _trackRegistrationEvent(user, organizationId, options) {
        try {
            await this.analyticsService.track({
                event: 'tenant_user_registered',
                userId: user.id,
                properties: {
                    email: user.email,
                    organizationId: organizationId,
                    source: options.registrationSource,
                    invitedBy: options.invitedBy
                }
            });
        } catch (error) {
            logger.error('Failed to track registration event', {
                error: error.message
            });
        }
    }

    // ============= URL HELPER METHODS =============

    _getOrganizationPortalUrl(organizationId) {
        return `${process.env.PLATFORM_URL || 'https://yourplatform.com'}/org/${organizationId}`;
    }

    _getPasswordResetUrl(resetToken, organizationId) {
        return `${this._getOrganizationPortalUrl(organizationId)}/reset-password?token=${resetToken}`;
    }

    _getMFASupportUrl(organizationId) {
        return `${this._getOrganizationPortalUrl(organizationId)}/support/mfa`;
    }

    _getMFAVideoTutorialUrl(method) {
        return `${process.env.PLATFORM_URL || 'https://yourplatform.com'}/tutorials/mfa/${method}`;
    }
}

// Export singleton instance
module.exports = new TenantAuthService();

// Export role constants for reference
module.exports.TENANT_USER_ROLES = TENANT_USER_ROLES;