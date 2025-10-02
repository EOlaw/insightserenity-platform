/**
 * @fileoverview Direct Business Authentication Service
 * @module servers/customer-services/modules/core-business/authentication/services/direct-auth-service
 * @description Authentication service for users registering directly with your company
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'direct-auth-service'
});
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const validator = require('validator');

// Import secure database service (same pattern as user-service)
const database = require('../../../../../../shared/lib/database');

// Import business services for post-registration workflows
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');
const OnboardingService = require('../../onboarding/services/onboarding-service');

/**
 * User Type Constants
 */
const DIRECT_USER_TYPES = {
    CLIENT: 'client',
    CONSULTANT: 'consultant',
    CANDIDATE: 'candidate',
    PARTNER: 'partner'
};

/**
 * Registration Source Constants
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
 * @class DirectAuthService
 */
class DirectAuthService {
    constructor() {
        // Database service reference (same pattern as user-service)
        this._dbService = null;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            requireEmailVerification: process.env.DIRECT_REQUIRE_EMAIL_VERIFICATION !== 'false',
            passwordMinLength: 8,
            maxLoginAttempts: 5,
            sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
        };

        // Service dependencies
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;
        this.onboardingService = OnboardingService;
    }

    /**
     * Get database service instance (same pattern as user-service)
     * @private
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getUserDatabaseService();
        }
        return this._dbService;
    }

    // ============= REGISTRATION =============

    /**
     * Register a new direct user
     * @param {Object} userData - User registration data
     * @param {string} userType - Type of user (client, consultant, candidate, partner)
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerDirectUser(userData, userType, options = {}) {
        try {
            logger.info('Starting direct user registration', {
                email: userData.email,
                userType: userType
            });

            // Validate user type
            this._validateUserType(userType);

            // Validate registration data
            this._validateRegistrationData(userData, userType);

            const dbService = this._getDatabaseService();

            // Check if user already exists
            const existingUser = await dbService.userExists(
                userData.email,
                this.config.companyTenantId
            );

            if (existingUser) {
                throw new AppError('User already exists with this email', 409);
            }

            // Prepare user document
            const userDocument = {
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: await this._hashPassword(userData.password),
                phoneNumber: userData.phoneNumber,

                // Profile (required fields)
                profile: {
                    firstName: userData.profile?.firstName,
                    lastName: userData.profile?.lastName,
                    middleName: userData.profile?.middleName,
                    displayName: userData.profile?.displayName,
                    title: userData.profile?.title,
                    bio: userData.profile?.bio,
                },

                // Account status
                accountStatus: {
                    status: 'pending',
                    reason: 'Account created - awaiting email verification',
                },

                // Verification
                verification: {
                    email: {
                        verified: false,
                        token: this._generateVerificationToken(),
                        tokenExpires: new Date(Date.now() + 86400000), // 24 hours
                    }
                },

                // Metadata - enrich with user type and source
                metadata: {
                    source: this._determineRegistrationSource(userType, options),
                    userType: userType,
                    directBusiness: true,
                    referrer: options.referralCode,
                    campaign: options.utmParams?.campaign,
                    tags: userData.metadata?.tags || [],
                    flags: {
                        isVip: false,
                        isBetaTester: false,
                        ...userData.metadata?.flags
                    }
                },

                // User-type-specific data in metadata
                customFields: this._getUserTypeSpecificFields(userData, userType)
            };

            // Create user through database service
            const newUser = await dbService.createUser(
                userDocument,
                this.config.companyTenantId
            );

            logger.info('User created successfully', {
                userId: newUser._id || newUser.id,
                email: newUser.email,
                userType: userType
            });

            // Execute post-registration workflows (non-blocking)
            this._executePostRegistrationWorkflows(newUser, userType, options)
                .catch(error => {
                    logger.error('Post-registration workflows failed (non-blocking)', {
                        error: error.message,
                        userId: newUser._id || newUser.id
                    });
                });

            // Initialize onboarding
            let onboardingData = null;
            try {
                onboardingData = await this._initializeOnboarding(
                    newUser._id || newUser.id,
                    userType
                );
            } catch (error) {
                logger.error('Onboarding initialization failed (non-blocking)', {
                    error: error.message
                });
            }

            // Generate tokens
            const accessToken = this._generateAccessToken(newUser);
            const refreshToken = this._generateRefreshToken(newUser);

            // Return registration result
            return {
                user: this._sanitizeUserOutput(newUser),
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                },
                userType: userType,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(userType, newUser),
                dashboardUrl: this._getDashboardUrl(userType),
                requiresAction: !newUser.verification?.email?.verified ? ['VERIFY_EMAIL'] : []
            };

        } catch (error) {
            logger.error('Direct user registration failed', {
                error: error.message,
                stack: error.stack,
                email: userData?.email,
                userType: userType
            });
            throw error;
        }
    }

    // ============= AUTHENTICATION =============

    /**
     * Authenticate direct user with credentials
     * @param {Object} credentials - Login credentials
     * @param {Object} options - Login options
     * @returns {Promise<Object>} Authentication result
     */
    async loginDirectUser(credentials, options = {}) {
        try {
            const { email, password } = credentials;

            logger.info('Starting direct user login', { email });

            const dbService = this._getDatabaseService();

            // Find user with credentials
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                await this._logFailedLogin(email, 'User not found', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            // Check account status
            if (user.accountStatus?.status === 'suspended') {
                throw AppError.forbidden('Account is suspended. Please contact support');
            }

            if (user.accountStatus?.status === 'blocked') {
                throw AppError.forbidden('Account is blocked. Please contact support');
            }

            // Verify password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                if (typeof user.incrementLoginAttempts === 'function') {
                    await user.incrementLoginAttempts();
                }
                await this._logFailedLogin(email, 'Invalid password', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            // Check for MFA
            if (user.mfa?.enabled) {
                const tempToken = this._generateTempToken(user._id || user.id);
                return {
                    requiresMFA: true,
                    tempToken: tempToken,
                    mfaMethods: user.mfa.methods || [],
                    challengeId: this._generateChallengeId()
                };
            }

            // Record successful login
            if (typeof user.recordLogin === 'function') {
                await user.recordLogin({
                    ip: options.ip,
                    userAgent: options.userAgent,
                    device: options.device,
                    location: options.location
                });
            }

            // Generate tokens
            const accessToken = this._generateAccessToken(user);
            const refreshToken = this._generateRefreshToken(user);

            // Get user type
            const userType = this._getUserTypeFromUser(user);

            // Load additional data (non-blocking)
            let userSpecificData = {};
            let pendingNotifications = [];

            try {
                userSpecificData = await this._loadUserSpecificData(
                    user._id || user.id,
                    userType
                );
            } catch (error) {
                logger.error('Failed to load user-specific data', { error: error.message });
            }

            logger.info('Direct user login successful', {
                userId: user._id || user.id,
                email: user.email,
                userType: userType
            });

            return {
                user: this._sanitizeUserOutput(user),
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                },
                userType: userType,
                userSpecificData: userSpecificData,
                pendingNotifications: pendingNotifications,
                dashboardUrl: this._getDashboardUrl(userType),
                features: this._getAvailableFeatures(userType)
            };

        } catch (error) {
            logger.error('Direct user login failed', {
                error: error.message,
                email: credentials?.email
            });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    _validateUserType(userType) {
        const validTypes = Object.values(DIRECT_USER_TYPES);
        if (!validTypes.includes(userType.toLowerCase())) {
            throw new AppError(
                `Invalid user type. Must be one of: ${validTypes.join(', ')}`,
                400
            );
        }
    }

    _validateRegistrationData(userData, userType) {
        const errors = [];

        if (!userData.email) {
            errors.push('Email is required');
        } else if (!validator.isEmail(userData.email)) {
            errors.push('Invalid email format');
        }

        if (!userData.password) {
            errors.push('Password is required');
        } else {
            if (userData.password.length < this.config.passwordMinLength) {
                errors.push(`Password must be at least ${this.config.passwordMinLength} characters`);
            }
            if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(userData.password)) {
                errors.push('Password must contain uppercase, lowercase, number, and special character');
            }
        }

        if (!userData.profile?.firstName) {
            errors.push('First name is required');
        }

        if (!userData.profile?.lastName) {
            errors.push('Last name is required');
        }

        if (errors.length > 0) {
            throw AppError.validation('Validation failed', errors);
        }
    }

    // ============= HELPER METHODS =============

    _getUserTypeSpecificFields(userData, userType) {
        const specificFields = {};

        switch (userType) {
            case DIRECT_USER_TYPES.CLIENT:
                specificFields.companyName = userData.companyName;
                specificFields.businessType = userData.businessType;
                specificFields.industry = userData.industry;
                break;
            case DIRECT_USER_TYPES.CONSULTANT:
                specificFields.expertise = userData.expertise;
                specificFields.yearsOfExperience = userData.yearsOfExperience;
                break;
            case DIRECT_USER_TYPES.CANDIDATE:
                specificFields.skills = userData.skills;
                specificFields.jobInterest = userData.jobInterest;
                break;
            case DIRECT_USER_TYPES.PARTNER:
                specificFields.organizationName = userData.organizationName;
                specificFields.partnerType = userData.partnerType;
                break;
        }

        return specificFields;
    }

    _determineRegistrationSource(userType, options) {
        if (options.referralCode) return REGISTRATION_SOURCES.REFERRAL;

        const sourceMap = {
            [DIRECT_USER_TYPES.CLIENT]: REGISTRATION_SOURCES.WEB_CLIENT,
            [DIRECT_USER_TYPES.CONSULTANT]: REGISTRATION_SOURCES.WEB_CONSULTANT,
            [DIRECT_USER_TYPES.CANDIDATE]: REGISTRATION_SOURCES.WEB_CANDIDATE,
        };

        return sourceMap[userType] || REGISTRATION_SOURCES.DIRECT_INQUIRY;
    }

    _getUserTypeFromUser(user) {
        return user.metadata?.userType || 
               user.customFields?.userType ||
               DIRECT_USER_TYPES.CLIENT;
    }

    _getRegistrationNextSteps(userType, user) {
        const steps = [];

        if (!user.verification?.email?.verified) {
            steps.push({
                action: 'VERIFY_EMAIL',
                message: 'Please verify your email address',
                priority: 'high'
            });
        }

        steps.push({
            action: 'COMPLETE_PROFILE',
            message: 'Complete your profile to get started',
            priority: 'medium'
        });

        return steps;
    }

    _getDashboardUrl(userType) {
        const baseUrl = this.config.platformUrl;
        const dashboardMap = {
            [DIRECT_USER_TYPES.CLIENT]: `${baseUrl}/client/dashboard`,
            [DIRECT_USER_TYPES.CONSULTANT]: `${baseUrl}/consultant/dashboard`,
            [DIRECT_USER_TYPES.CANDIDATE]: `${baseUrl}/candidate/dashboard`,
            [DIRECT_USER_TYPES.PARTNER]: `${baseUrl}/partner/dashboard`,
        };
        return dashboardMap[userType] || `${baseUrl}/dashboard`;
    }

    _getAvailableFeatures(userType) {
        return {
            messaging: true,
            notifications: true,
            profile: true,
            settings: true
        };
    }

    async _loadUserSpecificData(userId, userType) {
        return { userType };
    }

    // ============= POST-REGISTRATION WORKFLOWS =============

    async _executePostRegistrationWorkflows(user, userType, options) {
        try {
            // Send welcome email
            await this._sendWelcomeEmail(user, userType);

            // Track analytics
            await this._trackRegistrationEvent(user, userType, options);

            // Process referral if applicable
            if (options.referralCode) {
                await this._processReferral(user._id || user.id, options.referralCode, userType);
            }
        } catch (error) {
            logger.error('Post-registration workflows failed', {
                error: error.message,
                userId: user._id || user.id
            });
        }
    }

    async _sendWelcomeEmail(user, userType) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: `welcome-${userType}`,
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        userType: userType,
                        platformUrl: this.config.platformUrl
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send welcome email', { error: error.message });
        }
    }

    async _trackRegistrationEvent(user, userType, options) {
        try {
            if (typeof this.analyticsService.track === 'function') {
                await this.analyticsService.track({
                    event: 'user_registered',
                    userId: user._id || user.id,
                    properties: {
                        userType: userType,
                        email: user.email,
                        source: options.marketingSource || 'direct'
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to track registration event', { error: error.message });
        }
    }

    async _processReferral(userId, referralCode, userType) {
        logger.info('Processing referral', { userId, referralCode, userType });
    }

    async _initializeOnboarding(userId, userType) {
        try {
            if (typeof this.onboardingService.createOnboarding === 'function') {
                return await this.onboardingService.createOnboarding({
                    userId: userId,
                    type: userType,
                    context: 'direct_business'
                });
            }
        } catch (error) {
            logger.error('Failed to initialize onboarding', { error: error.message });
        }
        return null;
    }

    // ============= UTILITY METHODS =============

    async _hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }

    _generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    _generateAccessToken(user) {
        return jwt.sign(
            {
                userId: user._id || user.id,
                email: user.email,
                tenantId: this.config.companyTenantId
            },
            process.env.JWT_SECRET || 'customer-jwt-secret',
            { expiresIn: '24h' }
        );
    }

    _generateRefreshToken(user) {
        return jwt.sign(
            {
                userId: user._id || user.id,
                type: 'refresh'
            },
            process.env.JWT_SECRET || 'customer-jwt-secret',
            { expiresIn: '30d' }
        );
    }

    _generateTempToken(userId) {
        return jwt.sign(
            { userId, type: 'temp' },
            process.env.JWT_SECRET || 'customer-jwt-secret',
            { expiresIn: '5m' }
        );
    }

    _generateChallengeId() {
        return crypto.randomBytes(16).toString('hex');
    }

    _sanitizeUserOutput(user) {
        if (!user) return null;
        if (user.toSafeJSON) return user.toSafeJSON();

        const userObject = user.toObject ? user.toObject() : user;
        
        delete userObject.password;
        delete userObject.passwordHistory;
        delete userObject.security?.passwordReset;
        delete userObject.verification?.email?.token;
        delete userObject.__v;

        return userObject;
    }

    async _logFailedLogin(email, reason, options) {
        logger.warn('Failed login attempt', {
            email,
            reason,
            ip: options.ip,
            userAgent: options.userAgent
        });
    }
}

// Export singleton instance (same pattern as user-service)
module.exports = new DirectAuthService();