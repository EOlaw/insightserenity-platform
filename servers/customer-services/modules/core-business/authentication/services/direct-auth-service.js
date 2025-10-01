/**
 * @fileoverview Direct Business Authentication Service
 * @module servers/customer-services/modules/core-business/authentication/services/direct-auth-service
 * @description Authentication orchestration for users registering directly with your company
 * @description Handles clients, consultants, and recruitment candidates without organization requirements
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Import universal authentication service
const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');

// Core business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');
const OnboardingService = require('../../onboarding/services/onboarding-service');
const UserProfileService = require('../../user-management/services/user-service');

/**
 * User Type Constants for Direct Business
 * @enum {string}
 */
const DIRECT_USER_TYPES = {
    CLIENT: 'client',
    CONSULTANT: 'consultant',
    CANDIDATE: 'candidate',
    PARTNER: 'partner'
};

/**
 * Registration Source Constants
 * @enum {string}
 */
const REGISTRATION_SOURCES = {
    WEB_CLIENT: 'web_client',
    WEB_CONSULTANT: 'web_consultant',
    WEB_CANDIDATE: 'web_candidate',
    REFERRAL: 'referral',
    LINKEDIN: 'linkedin',
    JOB_BOARD: 'job_board',
    DIRECT_INQUIRY: 'direct_inquiry'
};

/**
 * Direct Business Authentication Service
 * Orchestrates authentication for users who register directly with your company
 * @class DirectAuthService
 */
class DirectAuthService {
    constructor() {
        // Create configured instance of universal auth service
        this.authService = new AuthService({
            context: 'direct_business',
            requireEmailVerification: process.env.DIRECT_REQUIRE_EMAIL_VERIFICATION !== 'false',
            enableMFA: process.env.DIRECT_ENABLE_MFA !== 'false',
            maxLoginAttempts: parseInt(process.env.DIRECT_MAX_LOGIN_ATTEMPTS || '5'),
            sessionTimeout: parseInt(process.env.DIRECT_SESSION_TIMEOUT || '86400000'),
            
            // Configure user structure for direct business (no organizations required)
            userStructure: {
                identityFields: ['email', 'username'],
                credentialFields: ['password'],
                profileFields: ['firstName', 'lastName', 'phoneNumber'],
                statusFields: ['accountStatus'],
                securityFields: ['security', 'verification', 'mfa'],
                metadataFields: ['metadata', 'activity'],
                organizationFields: [] // Empty - no organization required
            },
            
            // Custom hooks for direct business workflows
            hooks: {
                beforeRegister: this._beforeRegisterHook.bind(this),
                afterRegister: this._afterRegisterHook.bind(this),
                beforeLogin: this._beforeLoginHook.bind(this),
                afterLogin: this._afterLoginHook.bind(this),
                enrichUserData: this._enrichUserDataHook.bind(this),
                sanitizeUserData: this._sanitizeUserDataHook.bind(this)
            }
        });

        // Service dependencies
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;
        this.onboardingService = OnboardingService;
        this.userProfileService = UserProfileService;

        // Direct business configuration
        this.config = {
            enableWelcomeEmail: process.env.DIRECT_WELCOME_EMAIL !== 'false',
            enableOnboarding: process.env.DIRECT_ONBOARDING !== 'false',
            enableAnalytics: process.env.DIRECT_ANALYTICS !== 'false',
            enableReferralTracking: process.env.DIRECT_REFERRAL_TRACKING !== 'false',
            companyTenantId: process.env.COMPANY_TENANT_ID || 'internal',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com'
        };
    }

    /**
     * Register a new direct user (client, consultant, or candidate)
     * @param {Object} userData - User registration data
     * @param {string} userType - Type of user (client, consultant, candidate)
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerDirectUser(userData, userType, options = {}) {
        try {
            // Validate user type
            this._validateUserType(userType);

            // Apply user-type-specific validation
            await this._validateDirectUserRegistration(userData, userType, options);

            // Enrich user data with direct business metadata
            const enrichedUserData = await this._enrichDirectUserData(userData, userType, options);

            // Call universal auth service for core registration
            const registrationResult = await this.authService.register(
                enrichedUserData,
                this.config.companyTenantId, // Your company is the tenant
                {
                    userType: userType,
                    source: this._determineRegistrationSource(userType, options),
                    ip: options.ip,
                    userAgent: options.userAgent,
                    deviceFingerprint: options.deviceFingerprint,
                    customFields: {
                        userTypeSpecificData: this._getUserTypeSpecificFields(userData, userType)
                    },
                    metadata: {
                        directBusiness: true,
                        userCategory: userType,
                        registrationContext: options.context || 'web',
                        referralCode: options.referralCode,
                        utmParams: options.utmParams
                    }
                }
            );

            // Execute post-registration workflows
            await this._executePostRegistrationWorkflows(
                registrationResult.user,
                userType,
                options
            );

            // Initialize user-type-specific onboarding
            let onboardingData = null;
            if (this.config.enableOnboarding) {
                onboardingData = await this._initializeOnboarding(
                    registrationResult.user.id,
                    userType
                );
            }

            logger.info('Direct user registration completed successfully', {
                userId: registrationResult.user.id,
                email: registrationResult.user.email,
                userType: userType
            });

            // Return enriched response
            return {
                ...registrationResult,
                userType: userType,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(userType, registrationResult),
                dashboardUrl: this._getDashboardUrl(userType)
            };

        } catch (error) {
            logger.error('Direct user registration failed', {
                error: error.message,
                email: userData.email,
                userType: userType
            });
            throw error;
        }
    }

    /**
     * Authenticate direct user with credentials
     * @param {Object} credentials - Login credentials
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async loginDirectUser(credentials, options = {}) {
        try {
            // Call universal auth service for core authentication
            const loginResult = await this.authService.login(
                credentials,
                this.config.companyTenantId,
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

            // Load user-specific data based on user type
            const userType = this._getUserTypeFromUser(loginResult.user);
            const userSpecificData = await this._loadUserSpecificData(
                loginResult.user.id,
                userType
            );

            // Check for pending notifications
            const pendingNotifications = await this._getPendingNotifications(
                loginResult.user.id
            );

            logger.info('Direct user login completed successfully', {
                userId: loginResult.user.id,
                email: loginResult.user.email,
                userType: userType
            });

            // Return enriched response
            return {
                ...loginResult,
                userType: userType,
                userSpecificData: userSpecificData,
                pendingNotifications: pendingNotifications,
                dashboardUrl: this._getDashboardUrl(userType),
                features: this._getAvailableFeatures(userType)
            };

        } catch (error) {
            logger.error('Direct user login failed', {
                error: error.message,
                email: credentials.email
            });
            throw error;
        }
    }

    /**
     * Logout direct user
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @param {Object} options - Logout options
     * @returns {Promise<Object>} Logout result
     */
    async logoutDirectUser(userId, sessionId, options = {}) {
        try {
            // Call universal auth service for core logout
            const logoutResult = await this.authService.logout(userId, sessionId, options);

            logger.info('Direct user logout completed successfully', {
                userId,
                sessionId
            });

            return logoutResult;

        } catch (error) {
            logger.error('Direct user logout failed', {
                error: error.message,
                userId,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Request password reset for direct user
     * @param {string} email - User email
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset request result
     */
    async requestPasswordReset(email, options = {}) {
        try {
            // Call universal auth service for core password reset
            const resetResult = await this.authService.requestPasswordReset(
                email,
                this.config.companyTenantId,
                options
            );

            // Send direct business password reset email
            if (resetResult.resetToken) {
                await this._sendPasswordResetEmail(email, resetResult.resetToken);
            }

            logger.info('Password reset request processed', { email });

            return resetResult;

        } catch (error) {
            logger.error('Password reset request failed', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Reset password with token
     * @param {string} token - Reset token
     * @param {string} newPassword - New password
     * @param {Object} options - Reset options
     * @returns {Promise<Object>} Reset result
     */
    async resetPassword(token, newPassword, options = {}) {
        try {
            return await this.authService.resetPassword(
                token,
                newPassword,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('Password reset failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Change password for authenticated user
     * @param {string} userId - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @param {Object} options - Change options
     * @returns {Promise<Object>} Change result
     */
    async changePassword(userId, currentPassword, newPassword, options = {}) {
        try {
            return await this.authService.changePassword(
                userId,
                currentPassword,
                newPassword,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Verify email with token
     * @param {string} token - Verification token
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} Verification result
     */
    async verifyEmail(token, options = {}) {
        try {
            return await this.authService.verifyEmail(
                token,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('Email verification failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Resend email verification
     * @param {string} email - User email
     * @param {Object} options - Resend options
     * @returns {Promise<Object>} Resend result
     */
    async resendEmailVerification(email, options = {}) {
        try {
            return await this.authService.resendEmailVerification(
                email,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('Resend email verification failed', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    /**
     * Enable MFA for direct user
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {Object} options - MFA options
     * @returns {Promise<Object>} MFA setup result
     */
    async enableMFA(userId, method, options = {}) {
        try {
            const mfaResult = await this.authService.enableMFA(
                userId,
                method,
                this.config.companyTenantId,
                options
            );

            // Send MFA setup instructions
            await this._sendMFASetupInstructions(userId, method, mfaResult);

            logger.info('MFA setup initiated', { userId, method });

            return {
                ...mfaResult,
                supportUrl: `${this.config.platformUrl}/support/mfa`,
                videoTutorial: `${this.config.platformUrl}/tutorials/mfa/${method}`
            };

        } catch (error) {
            logger.error('MFA setup failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Verify and complete MFA setup
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} code - Verification code
     * @param {Object} options - Verification options
     * @returns {Promise<Object>} Verification result
     */
    async verifyAndCompleteMFA(userId, method, code, options = {}) {
        try {
            return await this.authService.verifyAndCompleteMFA(
                userId,
                method,
                code,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('MFA verification failed', {
                error: error.message,
                userId,
                method
            });
            throw error;
        }
    }

    /**
     * Disable MFA for direct user
     * @param {string} userId - User ID
     * @param {string} method - MFA method
     * @param {string} password - User password
     * @param {Object} options - Disable options
     * @returns {Promise<Object>} Disable result
     */
    async disableMFA(userId, method, password, options = {}) {
        try {
            return await this.authService.disableMFA(
                userId,
                method,
                password,
                this.config.companyTenantId,
                options
            );
        } catch (error) {
            logger.error('MFA disable failed', {
                error: error.message,
                userId,
                method
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
            userType: options.userType
        });
    }

    /**
     * After register hook
     * @private
     */
    async _afterRegisterHook(user, tokens, session, options) {
        logger.debug('After register hook executed', {
            userId: user._id,
            userType: options.userType
        });
    }

    /**
     * Before login hook
     * @private
     */
    async _beforeLoginHook(credentials, tenantId, options) {
        logger.debug('Before login hook executed', {
            email: credentials.email
        });
    }

    /**
     * After login hook
     * @private
     */
    async _afterLoginHook(user, tokens, session, options) {
        // Update last login timestamp
        try {
            await this.userProfileService.updateLastLogin(user._id);
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
        // Add direct business specific enrichments
        if (!userDocument.metadata) userDocument.metadata = {};
        
        userDocument.metadata.directBusiness = true;
        userDocument.metadata.userCategory = options.userType;
        userDocument.metadata.registrationPlatform = 'direct';

        logger.debug('User data enriched', { userType: options.userType });
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

    // ============= VALIDATION METHODS =============

    /**
     * Validate user type
     * @private
     */
    _validateUserType(userType) {
        const validTypes = Object.values(DIRECT_USER_TYPES);
        if (!validTypes.includes(userType)) {
            throw new AppError(
                `Invalid user type. Must be one of: ${validTypes.join(', ')}`,
                400,
                'INVALID_USER_TYPE'
            );
        }
    }

    /**
     * Validate direct user registration
     * @private
     */
    async _validateDirectUserRegistration(userData, userType, options) {
        // User-type-specific validation
        switch (userType) {
            case DIRECT_USER_TYPES.CLIENT:
                await this._validateClientRegistration(userData, options);
                break;
            
            case DIRECT_USER_TYPES.CONSULTANT:
                await this._validateConsultantRegistration(userData, options);
                break;
            
            case DIRECT_USER_TYPES.CANDIDATE:
                await this._validateCandidateRegistration(userData, options);
                break;
            
            case DIRECT_USER_TYPES.PARTNER:
                await this._validatePartnerRegistration(userData, options);
                break;
        }

        // Common validation
        if (userData.phoneNumber && userData.phoneNumber.length < 10) {
            throw new AppError('Invalid phone number', 400, 'INVALID_PHONE');
        }

        return true;
    }

    /**
     * Validate client registration
     * @private
     */
    async _validateClientRegistration(userData, options) {
        // Client-specific validation
        if (userData.companyName && userData.companyName.length < 2) {
            throw new AppError('Company name too short', 400, 'INVALID_COMPANY_NAME');
        }
    }

    /**
     * Validate consultant registration
     * @private
     */
    async _validateConsultantRegistration(userData, options) {
        // Consultant-specific validation
        if (!userData.skills || userData.skills.length === 0) {
            logger.warn('Consultant registered without skills', {
                email: userData.email
            });
        }
    }

    /**
     * Validate candidate registration
     * @private
     */
    async _validateCandidateRegistration(userData, options) {
        // Candidate-specific validation
        if (options.jobId && !options.jobId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new AppError('Invalid job ID format', 400, 'INVALID_JOB_ID');
        }
    }

    /**
     * Validate partner registration
     * @private
     */
    async _validatePartnerRegistration(userData, options) {
        // Partner-specific validation
        if (!userData.organizationName) {
            throw new AppError('Organization name required for partners', 400, 'ORG_NAME_REQUIRED');
        }
    }

    // ============= ENRICHMENT METHODS =============

    /**
     * Enrich direct user data
     * @private
     */
    async _enrichDirectUserData(userData, userType, options) {
        const enrichedData = { ...userData };

        // Add user type
        enrichedData.userType = userType;

        // Add registration metadata
        enrichedData.registrationSource = this._determineRegistrationSource(userType, options);
        enrichedData.registrationContext = options.context || 'web';

        // Track referral if provided
        if (options.referralCode && this.config.enableReferralTracking) {
            enrichedData.referralCode = options.referralCode;
        }

        // Add UTM parameters for marketing tracking
        if (options.utmParams) {
            enrichedData.utmParams = options.utmParams;
        }

        return enrichedData;
    }

    /**
     * Get user type specific fields
     * @private
     */
    _getUserTypeSpecificFields(userData, userType) {
        const specificFields = {};

        switch (userType) {
            case DIRECT_USER_TYPES.CLIENT:
                specificFields.companyName = userData.companyName;
                specificFields.industry = userData.industry;
                specificFields.companySize = userData.companySize;
                break;
            
            case DIRECT_USER_TYPES.CONSULTANT:
                specificFields.skills = userData.skills || [];
                specificFields.experience = userData.experience;
                specificFields.hourlyRate = userData.hourlyRate;
                specificFields.availability = userData.availability;
                break;
            
            case DIRECT_USER_TYPES.CANDIDATE:
                specificFields.jobId = userData.jobId;
                specificFields.resumeUrl = userData.resumeUrl;
                specificFields.linkedInUrl = userData.linkedInUrl;
                specificFields.yearsOfExperience = userData.yearsOfExperience;
                break;
            
            case DIRECT_USER_TYPES.PARTNER:
                specificFields.organizationName = userData.organizationName;
                specificFields.partnerType = userData.partnerType;
                specificFields.website = userData.website;
                break;
        }

        return specificFields;
    }

    // ============= WORKFLOW METHODS =============

    /**
     * Execute post-registration workflows
     * @private
     */
    async _executePostRegistrationWorkflows(user, userType, options) {
        try {
            // Create user profile
            await this.userProfileService.createProfile(user.id, {
                userType: userType,
                registrationSource: options.source,
                referralCode: options.referralCode
            });

            // Send welcome email
            if (this.config.enableWelcomeEmail) {
                await this._sendWelcomeEmail(user, userType);
            }

            // Track analytics
            if (this.config.enableAnalytics) {
                await this._trackRegistrationEvent(user, userType, options);
            }

            // Process referral if applicable
            if (options.referralCode && this.config.enableReferralTracking) {
                await this._processReferral(user.id, options.referralCode, userType);
            }

            logger.debug('Post-registration workflows completed', {
                userId: user.id,
                userType: userType
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
    async _initializeOnboarding(userId, userType) {
        try {
            return await this.onboardingService.createOnboarding({
                userId: userId,
                type: userType,
                context: 'direct_business'
            });
        } catch (error) {
            logger.error('Failed to initialize onboarding', {
                error: error.message,
                userId
            });
            return null;
        }
    }

    // ============= NOTIFICATION METHODS =============

    /**
     * Send welcome email
     * @private
     */
    async _sendWelcomeEmail(user, userType) {
        try {
            const templateMap = {
                [DIRECT_USER_TYPES.CLIENT]: 'client-welcome',
                [DIRECT_USER_TYPES.CONSULTANT]: 'consultant-welcome',
                [DIRECT_USER_TYPES.CANDIDATE]: 'candidate-welcome',
                [DIRECT_USER_TYPES.PARTNER]: 'partner-welcome'
            };

            await this.notificationService.sendEmail({
                to: user.email,
                template: templateMap[userType] || 'user-welcome',
                data: {
                    firstName: user.profile?.firstName || user.email,
                    dashboardUrl: this._getDashboardUrl(userType),
                    supportEmail: process.env.SUPPORT_EMAIL || 'support@yourcompany.com'
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
    async _sendPasswordResetEmail(email, resetToken) {
        try {
            await this.notificationService.sendEmail({
                to: email,
                template: 'password-reset',
                data: {
                    resetUrl: `${this.config.platformUrl}/reset-password?token=${resetToken}`,
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
            const user = await this.userProfileService.getUserById(userId);
            await this.notificationService.sendEmail({
                to: user.email,
                template: 'mfa-setup',
                data: {
                    method: method,
                    instructions: mfaResult.instructions,
                    supportUrl: `${this.config.platformUrl}/support/mfa`
                }
            });
        } catch (error) {
            logger.error('Failed to send MFA setup instructions', {
                error: error.message,
                userId
            });
        }
    }

    // ============= ANALYTICS METHODS =============

    /**
     * Track registration event
     * @private
     */
    async _trackRegistrationEvent(user, userType, options) {
        try {
            await this.analyticsService.track({
                event: 'direct_user_registered',
                userId: user.id,
                properties: {
                    email: user.email,
                    userType: userType,
                    source: options.source,
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

    // ============= HELPER METHODS =============

    /**
     * Determine registration source
     * @private
     */
    _determineRegistrationSource(userType, options) {
        if (options.source) return options.source;

        const sourceMap = {
            [DIRECT_USER_TYPES.CLIENT]: REGISTRATION_SOURCES.WEB_CLIENT,
            [DIRECT_USER_TYPES.CONSULTANT]: REGISTRATION_SOURCES.WEB_CONSULTANT,
            [DIRECT_USER_TYPES.CANDIDATE]: REGISTRATION_SOURCES.WEB_CANDIDATE,
            [DIRECT_USER_TYPES.PARTNER]: REGISTRATION_SOURCES.DIRECT_INQUIRY
        };

        return sourceMap[userType] || REGISTRATION_SOURCES.WEB_CLIENT;
    }

    /**
     * Get user type from user object
     * @private
     */
    _getUserTypeFromUser(user) {
        return user.metadata?.userCategory || 
               user.metadata?.userType || 
               DIRECT_USER_TYPES.CLIENT;
    }

    /**
     * Load user specific data
     * @private
     */
    async _loadUserSpecificData(userId, userType) {
        try {
            return await this.userProfileService.getUserSpecificData(userId, userType);
        } catch (error) {
            logger.error('Failed to load user specific data', {
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
     * Get registration next steps
     * @private
     */
    _getRegistrationNextSteps(userType, registrationResult) {
        const steps = [];

        if (registrationResult.requiresEmailVerification) {
            steps.push({
                step: 'verify_email',
                title: 'Verify your email',
                description: 'Check your inbox for a verification link',
                required: true
            });
        }

        // User type specific steps
        switch (userType) {
            case DIRECT_USER_TYPES.CLIENT:
                steps.push({
                    step: 'complete_profile',
                    title: 'Complete your company profile',
                    description: 'Tell us more about your business needs',
                    required: false
                });
                break;
            
            case DIRECT_USER_TYPES.CONSULTANT:
                steps.push({
                    step: 'upload_resume',
                    title: 'Upload your resume',
                    description: 'Help us match you with the right opportunities',
                    required: false
                });
                break;
            
            case DIRECT_USER_TYPES.CANDIDATE:
                steps.push({
                    step: 'complete_application',
                    title: 'Complete your job application',
                    description: 'Finish applying for the position',
                    required: true
                });
                break;
        }

        return steps;
    }

    /**
     * Get dashboard URL
     * @private
     */
    _getDashboardUrl(userType) {
        const urlMap = {
            [DIRECT_USER_TYPES.CLIENT]: `${this.config.platformUrl}/client/dashboard`,
            [DIRECT_USER_TYPES.CONSULTANT]: `${this.config.platformUrl}/consultant/dashboard`,
            [DIRECT_USER_TYPES.CANDIDATE]: `${this.config.platformUrl}/candidate/dashboard`,
            [DIRECT_USER_TYPES.PARTNER]: `${this.config.platformUrl}/partner/dashboard`
        };

        return urlMap[userType] || `${this.config.platformUrl}/dashboard`;
    }

    /**
     * Get available features
     * @private
     */
    _getAvailableFeatures(userType) {
        const featuresMap = {
            [DIRECT_USER_TYPES.CLIENT]: {
                canCreateProjects: true,
                canHireConsultants: true,
                canViewReports: true,
                canManageTeam: true
            },
            [DIRECT_USER_TYPES.CONSULTANT]: {
                canBrowseProjects: true,
                canSubmitProposals: true,
                canManageProfile: true,
                canViewEarnings: true
            },
            [DIRECT_USER_TYPES.CANDIDATE]: {
                canBrowseJobs: true,
                canApplyToJobs: true,
                canManageApplications: true,
                canUploadResume: true
            },
            [DIRECT_USER_TYPES.PARTNER]: {
                canManageReferrals: true,
                canViewCommissions: true,
                canAccessPartnerPortal: true
            }
        };

        return featuresMap[userType] || {};
    }

    /**
     * Process referral
     * @private
     */
    async _processReferral(userId, referralCode, userType) {
        try {
            logger.info('Processing referral', { userId, referralCode, userType });
            // Implement referral processing logic
        } catch (error) {
            logger.error('Failed to process referral', {
                error: error.message,
                userId,
                referralCode
            });
        }
    }
}

// Export singleton instance
module.exports = new DirectAuthService();

// Export user type constants for reference
module.exports.DIRECT_USER_TYPES = DIRECT_USER_TYPES;
module.exports.REGISTRATION_SOURCES = REGISTRATION_SOURCES;