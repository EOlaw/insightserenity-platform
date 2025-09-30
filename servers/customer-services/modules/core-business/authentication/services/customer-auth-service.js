/**
 * @fileoverview Customer Authentication Service - Orchestration Layer
 * @module servers/customer-services/modules/core-business/authentication/services/customer-auth-service
 * @description Customer-specific authentication orchestration that wraps shared auth-service
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Import shared authentication service (universal logic)
const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');

// Customer-specific services and utilities
const CustomerNotificationService = require('../../notifications/services/notification-service');
const CustomerAnalyticsService = require('../../analytics/services/analytics-service');
const CustomerOnboardingService = require('../../onboarding/services/onboarding-service');
const CustomerProfileService = require('../../user-management/services/user-service');
const OrganizationService = require('../../client-management/services/organization-service');

/**
 * Customer Authentication Service
 * Orchestrates authentication flows with customer-specific business logic
 * @class CustomerAuthService
 */
class CustomerAuthService {
    constructor() {
        // Reference to shared auth service (does NOT duplicate it)
        this.authService = AuthService;
        this.notificationService = CustomerNotificationService;
        this.analyticsService = CustomerAnalyticsService;
        this.onboardingService = CustomerOnboardingService;
        this.profileService = CustomerProfileService;
        this.organizationService = OrganizationService;

        // Customer-specific configuration
        this.config = {
            enableWelcomeEmail: process.env.CUSTOMER_WELCOME_EMAIL !== 'false',
            enableOnboarding: process.env.CUSTOMER_ONBOARDING !== 'false',
            enableAnalytics: process.env.CUSTOMER_ANALYTICS !== 'false',
            autoAssignDefaultRole: true,
            defaultRole: 'customer',
            requireProfileCompletion: false,
            enableReferralTracking: true,
            enableMarketingPreferences: true
        };
    }

    /**
     * Register a new customer
     * Orchestrates registration with customer-specific workflows
     * @param {Object} userData - User registration data
     * @param {string} tenantId - Organization/tenant identifier
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerCustomer(userData, tenantId, options = {}) {
        try {
            // STEP 1: Validate organization exists and accepts new customers
            await this._validateOrganizationCanAcceptCustomers(tenantId);

            // STEP 2: Apply customer-specific validation rules
            await this._validateCustomerRegistration(userData, tenantId);

            // STEP 3: Enrich user data with customer-specific defaults
            const enrichedUserData = await this._enrichCustomerData(userData, options);

            // STEP 4: Call shared auth service for core registration
            const registrationResult = await this.authService.register(
                enrichedUserData,
                tenantId,
                {
                    source: 'customer_portal',
                    ip: options.ip,
                    userAgent: options.userAgent,
                    deviceFingerprint: options.deviceFingerprint,
                    metadata: {
                        customerType: userData.customerType || 'standard',
                        referralCode: options.referralCode,
                        marketingSource: options.marketingSource,
                        utmParams: options.utmParams
                    }
                }
            );

            // STEP 5: Execute customer-specific post-registration workflows
            await this._executePostRegistrationWorkflows(
                registrationResult.user,
                tenantId,
                options
            );

            // STEP 6: Track analytics event
            if (this.config.enableAnalytics) {
                await this._trackRegistrationEvent(registrationResult.user, options);
            }

            // STEP 7: Send welcome communications
            if (this.config.enableWelcomeEmail) {
                await this._sendWelcomeEmail(registrationResult.user, tenantId);
            }

            // STEP 8: Initialize onboarding if enabled
            let onboardingData = null;
            if (this.config.enableOnboarding) {
                onboardingData = await this._initializeOnboarding(
                    registrationResult.user.id,
                    tenantId
                );
            }

            logger.info('Customer registration orchestrated successfully', {
                userId: registrationResult.user.id,
                email: registrationResult.user.email,
                tenantId
            });

            // Return enriched response with customer-specific data
            return {
                ...registrationResult,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(registrationResult),
                customerPortalUrl: this._getCustomerPortalUrl(tenantId)
            };

        } catch (error) {
            logger.error('Customer registration orchestration failed', {
                error: error.message,
                email: userData.email,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Authenticate customer with credentials
     * Orchestrates login with customer-specific checks and workflows
     * @param {Object} credentials - Login credentials
     * @param {string} tenantId - Organization identifier
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async loginCustomer(credentials, tenantId, options = {}) {
        try {
            // STEP 1: Customer-specific pre-login validations
            await this._validateCustomerLoginAttempt(credentials.email, tenantId);

            // STEP 2: Call shared auth service for core authentication
            const loginResult = await this.authService.login(
                credentials,
                tenantId,
                {
                    ip: options.ip,
                    userAgent: options.userAgent,
                    deviceFingerprint: options.deviceFingerprint
                }
            );

            // Handle MFA challenge (pass through from shared service)
            if (loginResult.requiresMFA) {
                return loginResult;
            }

            // STEP 3: Customer-specific post-login workflows
            await this._executePostLoginWorkflows(loginResult.user, tenantId, options);

            // STEP 4: Check if customer needs to complete profile
            const profileStatus = await this._checkProfileCompletionStatus(
                loginResult.user.id,
                tenantId
            );

            // STEP 5: Load customer-specific preferences and settings
            const customerPreferences = await this._loadCustomerPreferences(
                loginResult.user.id,
                tenantId
            );

            // STEP 6: Track login analytics
            if (this.config.enableAnalytics) {
                await this._trackLoginEvent(loginResult.user, options);
            }

            // STEP 7: Check for pending notifications or alerts
            const pendingNotifications = await this._getPendingNotifications(
                loginResult.user.id
            );

            logger.info('Customer login orchestrated successfully', {
                userId: loginResult.user.id,
                email: loginResult.user.email,
                tenantId
            });

            // Return enriched response with customer-specific data
            return {
                ...loginResult,
                profileStatus: profileStatus,
                preferences: customerPreferences,
                pendingNotifications: pendingNotifications,
                customerPortalUrl: this._getCustomerPortalUrl(tenantId),
                features: await this._getAvailableFeatures(loginResult.user, tenantId)
            };

        } catch (error) {
            logger.error('Customer login orchestration failed', {
                error: error.message,
                email: credentials.email,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Logout customer
     * Orchestrates logout with customer-specific cleanup
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logoutCustomer(userId, sessionId, options = {}) {
        try {
            // STEP 1: Execute customer-specific pre-logout tasks
            await this._executePreLogoutTasks(userId, sessionId);

            // STEP 2: Call shared auth service for core logout
            const logoutResult = await this.authService.logout(userId, sessionId, options);

            // STEP 3: Track logout analytics
            if (this.config.enableAnalytics) {
                await this._trackLogoutEvent(userId, options);
            }

            logger.info('Customer logout orchestrated successfully', {
                userId,
                sessionId
            });

            return logoutResult;

        } catch (error) {
            logger.error('Customer logout orchestration failed', {
                error: error.message,
                userId,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Request password reset for customer
     * Orchestrates password reset with customer-specific notifications
     * @param {string} email - Customer email
     * @param {string} tenantId - Organization identifier
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset request result
     */
    async requestCustomerPasswordReset(email, tenantId, options = {}) {
        try {
            // STEP 1: Call shared auth service for core password reset
            const resetResult = await this.authService.requestPasswordReset(
                email,
                tenantId,
                options
            );

            // STEP 2: Send customer-branded password reset email
            if (resetResult.resetToken) {
                await this._sendCustomerPasswordResetEmail(
                    email,
                    resetResult.resetToken,
                    tenantId
                );
            }

            // STEP 3: Track analytics
            if (this.config.enableAnalytics) {
                await this._trackPasswordResetRequest(email, tenantId);
            }

            logger.info('Customer password reset request orchestrated', {
                email,
                tenantId
            });

            return resetResult;

        } catch (error) {
            logger.error('Customer password reset request failed', {
                error: error.message,
                email,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Enable MFA for customer
     * Orchestrates MFA setup with customer-specific guidance
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} tenantId - Organization identifier
     * @param {Object} options - MFA options
     * @returns {Promise<Object>} MFA setup result
     */
    async enableCustomerMFA(userId, method, tenantId, options = {}) {
        try {
            // STEP 1: Call shared auth service for core MFA setup
            const mfaResult = await this.authService.enableMFA(
                userId,
                method,
                tenantId,
                options
            );

            // STEP 2: Send customer-friendly MFA setup instructions
            await this._sendMFASetupInstructions(userId, method, mfaResult);

            // STEP 3: Track analytics
            if (this.config.enableAnalytics) {
                await this._trackMFASetup(userId, method);
            }

            logger.info('Customer MFA setup orchestrated', {
                userId,
                method,
                tenantId
            });

            // Return with customer-friendly instructions
            return {
                ...mfaResult,
                supportUrl: this._getMFASupportUrl(),
                videoTutorial: this._getMFAVideoTutorialUrl(method)
            };

        } catch (error) {
            logger.error('Customer MFA setup failed', {
                error: error.message,
                userId,
                method,
                tenantId
            });
            throw error;
        }
    }

    // ============= CUSTOMER-SPECIFIC VALIDATION METHODS =============

    /**
     * Validate organization can accept new customers
     * @private
     */
    async _validateOrganizationCanAcceptCustomers(tenantId) {
        try {
            const organization = await this.organizationService.getOrganization(tenantId);

            if (!organization) {
                throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
            }

            if (organization.status !== 'active') {
                throw new AppError(
                    'Organization is not accepting new customers',
                    403,
                    'ORG_NOT_ACCEPTING_CUSTOMERS'
                );
            }

            // Check if organization has reached customer limit
            if (organization.limits?.maxCustomers) {
                const currentCustomerCount = await this.profileService.getCustomerCount(tenantId);
                if (currentCustomerCount >= organization.limits.maxCustomers) {
                    throw new AppError(
                        'Organization has reached maximum customer limit',
                        403,
                        'ORG_CUSTOMER_LIMIT_REACHED'
                    );
                }
            }

            return true;
        } catch (error) {
            logger.error('Organization validation failed', {
                error: error.message,
                tenantId
            });
            throw error;
        }
    }

    /**
     * Validate customer registration data
     * @private
     */
    async _validateCustomerRegistration(userData, tenantId) {
        // Add customer-specific validation rules here
        // Examples:
        // - Check if email domain is allowed
        // - Validate against customer blacklist
        // - Check age requirements
        // - Validate business-specific fields

        if (userData.companyName && userData.companyName.length < 2) {
            throw new AppError('Company name too short', 400, 'INVALID_COMPANY_NAME');
        }

        // Example: Check if email domain is blacklisted
        const emailDomain = userData.email.split('@')[1];
        const blockedDomains = ['tempmail.com', 'throwaway.email'];
        if (blockedDomains.includes(emailDomain)) {
            throw new AppError(
                'Email from this domain is not allowed',
                400,
                'BLOCKED_EMAIL_DOMAIN'
            );
        }

        return true;
    }

    /**
     * Validate customer login attempt
     * @private
     */
    async _validateCustomerLoginAttempt(email, tenantId) {
        // Customer-specific login validations
        // Examples:
        // - Check if customer subscription is active
        // - Validate against temporary bans
        // - Check business hours restrictions

        return true;
    }

    // ============= CUSTOMER-SPECIFIC ENRICHMENT METHODS =============

    /**
     * Enrich customer data with defaults and business logic
     * @private
     */
    async _enrichCustomerData(userData, options) {
        const enrichedData = { ...userData };

        // Apply customer-specific defaults
        if (this.config.autoAssignDefaultRole) {
            enrichedData.role = this.config.defaultRole;
        }

        // Add customer-specific fields
        enrichedData.customerType = userData.customerType || 'individual';
        enrichedData.marketingPreferences = {
            emailOptIn: userData.emailOptIn !== false,
            smsOptIn: userData.smsOptIn || false,
            source: options.marketingSource || 'direct'
        };

        // Track referral if provided
        if (options.referralCode && this.config.enableReferralTracking) {
            enrichedData.referralCode = options.referralCode;
        }

        return enrichedData;
    }

    // ============= CUSTOMER-SPECIFIC WORKFLOW METHODS =============

    /**
     * Execute post-registration workflows
     * @private
     */
    async _executePostRegistrationWorkflows(user, tenantId, options) {
        try {
            // Create customer profile
            await this.profileService.createCustomerProfile(user.id, {
                tenantId: tenantId,
                registrationSource: options.marketingSource,
                referralCode: options.referralCode
            });

            // Process referral if applicable
            if (options.referralCode && this.config.enableReferralTracking) {
                await this._processReferral(user.id, options.referralCode, tenantId);
            }

            // Subscribe to default notification channels
            await this._setupDefaultNotifications(user.id);

            logger.debug('Post-registration workflows completed', {
                userId: user.id,
                tenantId
            });
        } catch (error) {
            logger.error('Post-registration workflows failed', {
                error: error.message,
                userId: user.id
            });
            // Don't throw - registration already succeeded
        }
    }

    /**
     * Execute post-login workflows
     * @private
     */
    async _executePostLoginWorkflows(user, tenantId, options) {
        try {
            // Update last login timestamp
            await this.profileService.updateLastLogin(user.id);

            // Check for account updates or important notifications
            await this._checkForImportantUpdates(user.id);

            logger.debug('Post-login workflows completed', {
                userId: user.id,
                tenantId
            });
        } catch (error) {
            logger.error('Post-login workflows failed', {
                error: error.message,
                userId: user.id
            });
            // Don't throw - login already succeeded
        }
    }

    /**
     * Execute pre-logout tasks
     * @private
     */
    async _executePreLogoutTasks(userId, sessionId) {
        try {
            // Save any pending customer data
            // Clean up temporary resources
            // Log customer activity summary

            logger.debug('Pre-logout tasks completed', { userId, sessionId });
        } catch (error) {
            logger.error('Pre-logout tasks failed', {
                error: error.message,
                userId
            });
            // Don't throw - logout should proceed
        }
    }

    // ============= CUSTOMER-SPECIFIC NOTIFICATION METHODS =============

    /**
     * Send welcome email to customer
     * @private
     */
    async _sendWelcomeEmail(user, tenantId) {
        try {
            await this.notificationService.sendEmail({
                to: user.email,
                template: 'customer-welcome',
                data: {
                    firstName: user.profile?.firstName || user.email,
                    portalUrl: this._getCustomerPortalUrl(tenantId),
                    supportEmail: await this._getSupportEmail(tenantId)
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
     * Send password reset email to customer
     * @private
     */
    async _sendCustomerPasswordResetEmail(email, resetToken, tenantId) {
        try {
            await this.notificationService.sendEmail({
                to: email,
                template: 'customer-password-reset',
                data: {
                    resetUrl: this._getPasswordResetUrl(resetToken, tenantId),
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
    async _sendMFASetupInstructions(userId, method, mfaResult) {
        try {
            const user = await this.profileService.getUserById(userId);
            await this.notificationService.sendEmail({
                to: user.email,
                template: 'customer-mfa-setup',
                data: {
                    method: method,
                    instructions: mfaResult.instructions,
                    supportUrl: this._getMFASupportUrl()
                }
            });
        } catch (error) {
            logger.error('Failed to send MFA setup instructions', {
                error: error.message,
                userId
            });
        }
    }

    // ============= CUSTOMER-SPECIFIC ANALYTICS METHODS =============

    /**
     * Track registration event
     * @private
     */
    async _trackRegistrationEvent(user, options) {
        try {
            await this.analyticsService.track({
                event: 'customer_registered',
                userId: user.id,
                properties: {
                    email: user.email,
                    source: options.marketingSource,
                    referralCode: options.referralCode,
                    utmParams: options.utmParams
                }
            });
        } catch (error) {
            logger.error('Failed to track registration event', {
                error: error.message
            });
        }
    }

    /**
     * Track login event
     * @private
     */
    async _trackLoginEvent(user, options) {
        try {
            await this.analyticsService.track({
                event: 'customer_login',
                userId: user.id,
                properties: {
                    ip: options.ip,
                    userAgent: options.userAgent
                }
            });
        } catch (error) {
            logger.error('Failed to track login event', {
                error: error.message
            });
        }
    }

    /**
     * Track logout event
     * @private
     */
    async _trackLogoutEvent(userId, options) {
        try {
            await this.analyticsService.track({
                event: 'customer_logout',
                userId: userId,
                properties: {
                    logoutType: options.logoutAll ? 'all_devices' : 'single_device'
                }
            });
        } catch (error) {
            logger.error('Failed to track logout event', {
                error: error.message
            });
        }
    }

    /**
     * Track password reset request
     * @private
     */
    async _trackPasswordResetRequest(email, tenantId) {
        try {
            await this.analyticsService.track({
                event: 'customer_password_reset_requested',
                properties: {
                    email: email,
                    tenantId: tenantId
                }
            });
        } catch (error) {
            logger.error('Failed to track password reset request', {
                error: error.message
            });
        }
    }

    /**
     * Track MFA setup
     * @private
     */
    async _trackMFASetup(userId, method) {
        try {
            await this.analyticsService.track({
                event: 'customer_mfa_setup',
                userId: userId,
                properties: {
                    method: method
                }
            });
        } catch (error) {
            logger.error('Failed to track MFA setup', {
                error: error.message
            });
        }
    }

    // ============= CUSTOMER-SPECIFIC HELPER METHODS =============

    /**
     * Initialize customer onboarding
     * @private
     */
    async _initializeOnboarding(userId, tenantId) {
        try {
            return await this.onboardingService.createOnboarding({
                userId: userId,
                tenantId: tenantId,
                type: 'customer'
            });
        } catch (error) {
            logger.error('Failed to initialize onboarding', {
                error: error.message,
                userId
            });
            return null;
        }
    }

    /**
     * Check profile completion status
     * @private
     */
    async _checkProfileCompletionStatus(userId, tenantId) {
        try {
            const profile = await this.profileService.getCustomerProfile(userId, tenantId);
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
     * Load customer preferences
     * @private
     */
    async _loadCustomerPreferences(userId, tenantId) {
        try {
            return await this.profileService.getCustomerPreferences(userId, tenantId);
        } catch (error) {
            logger.error('Failed to load customer preferences', {
                error: error.message,
                userId
            });
            return {};
        }
    }

    /**
     * Get pending notifications for customer
     * @private
     */
    async _getPendingNotifications(userId) {
        try {
            return await this.notificationService.getPendingNotifications(userId);
        } catch (error) {
            logger.error('Failed to get pending notifications', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get available features for customer
     * @private
     */
    async _getAvailableFeatures(user, tenantId) {
        try {
            // Return features based on customer subscription, role, etc.
            return {
                hasProjectAccess: true,
                hasReporting: user.subscription?.tier === 'premium',
                hasAPIAccess: user.subscription?.tier !== 'free',
                maxProjects: user.subscription?.limits?.projects || 5
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

    /**
     * Process referral
     * @private
     */
    async _processReferral(userId, referralCode, tenantId) {
        try {
            // Logic to process referral rewards, credits, etc.
            logger.info('Processing referral', { userId, referralCode, tenantId });
        } catch (error) {
            logger.error('Failed to process referral', {
                error: error.message,
                userId,
                referralCode
            });
        }
    }

    /**
     * Setup default notifications for customer
     * @private
     */
    async _setupDefaultNotifications(userId) {
        try {
            await this.notificationService.subscribeToChannels(userId, [
                'account_updates',
                'security_alerts',
                'product_updates'
            ]);
        } catch (error) {
            logger.error('Failed to setup default notifications', {
                error: error.message,
                userId
            });
        }
    }

    /**
     * Check for important updates
     * @private
     */
    async _checkForImportantUpdates(userId) {
        try {
            // Check for pending actions, notifications, etc.
            logger.debug('Checking for important updates', { userId });
        } catch (error) {
            logger.error('Failed to check for important updates', {
                error: error.message,
                userId
            });
        }
    }

    // ============= URL HELPER METHODS =============

    _getCustomerPortalUrl(tenantId) {
        return `${process.env.CUSTOMER_PORTAL_URL || 'https://app.example.com'}/customers/${tenantId}`;
    }

    _getPasswordResetUrl(resetToken, tenantId) {
        return `${this._getCustomerPortalUrl(tenantId)}/reset-password?token=${resetToken}`;
    }

    _getMFASupportUrl() {
        return `${process.env.CUSTOMER_PORTAL_URL || 'https://app.example.com'}/support/mfa`;
    }

    _getMFAVideoTutorialUrl(method) {
        return `${process.env.CUSTOMER_PORTAL_URL || 'https://app.example.com'}/tutorials/mfa/${method}`;
    }

    async _getSupportEmail(tenantId) {
        try {
            const org = await this.organizationService.getOrganization(tenantId);
            return org.supportEmail || process.env.DEFAULT_SUPPORT_EMAIL || 'support@example.com';
        } catch (error) {
            return 'support@example.com';
        }
    }
}

// Export singleton instance
module.exports = new CustomerAuthService();