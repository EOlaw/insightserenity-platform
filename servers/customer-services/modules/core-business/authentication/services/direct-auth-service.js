/**
 * @fileoverview Enhanced Direct Business Authentication Service
 * @module servers/customer-services/modules/core-business/authentication/services/direct-auth-service
 * @description Complete authentication service with permission management and client relationships
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'direct-auth-service'
});
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');
const OnboardingService = require('../../onboarding/services/onboarding-service');

// Get entity strategy registry and check if we need to create a related entity
const EntityStrategyRegistry = require('../../../../../../shared/lib/database/services/entity-strategy-registry');
const UniversalTransactionService = require('../../../../../../shared/lib/database/services/universal-transaction-service');

/**
 * User Type Constants
 */
const DIRECT_USER_TYPES = {
    CLIENT: 'client',
    CONSULTANT: 'consultant',
    CANDIDATE: 'candidate',
    PARTNER: 'partner',
    ADMIN: 'admin'
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
 * Default Permissions by User Type
 */
const DEFAULT_PERMISSIONS_BY_TYPE = {
    client: [
        'clients:read',
        'clients:update',
        'projects:read',
        'documents:read',
        'documents:create',
        'contacts:read',
        'contacts:update',
        'invoices:read',
        'notes:read',
        'notes:create'
    ],
    consultant: [
        'projects:read',
        'projects:update',
        'clients:read',
        'timesheets:create',
        'timesheets:read',
        'timesheets:update',
        'documents:read',
        'documents:create',
        'notes:read',
        'notes:create'
    ],
    candidate: [
        'jobs:read',
        'applications:create',
        'applications:read',
        'applications:update',
        'profile:read',
        'profile:update',
        'documents:read',
        'documents:create'
    ],
    partner: [
        'jobs:read',
        'jobs:create',
        'candidates:read',
        'candidates:create',
        'candidates:update',
        'applications:read',
        'applications:create',
        'partnerships:read',
        'partnerships:update'
    ],
    admin: [
        '*:*'
    ]
};

/**
 * Default Roles by User Type
 */
const DEFAULT_ROLES_BY_TYPE = {
    client: ['user'],
    consultant: ['user'],
    candidate: ['user'],
    partner: ['user', 'partner'],
    admin: ['admin']
};

/**
 * Direct Business Authentication Service
 */
class DirectAuthService {
    constructor() {
        this._dbService = null;
        this._defaultTenantObjectId = null;
        this._defaultOrganizationObjectId = null;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            defaultOrganizationId: process.env.DEFAULT_ORGANIZATION_ID,
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            requireEmailVerification: process.env.EMAIL_VERIFICATION !== 'false',
            autoCreateClient: process.env.AUTO_CREATE_CLIENT_ON_REGISTRATION !== 'false',
            passwordMinLength: 8,
            maxLoginAttempts: 5,
            sessionTimeout: 24 * 60 * 60 * 1000,
            jwtSecret: process.env.JWT_SECRET || 'customer-jwt-secret',
            jwtExpiresIn: '24h',
            refreshTokenExpiresIn: '30d'
        };

        // Service dependencies
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;
        this.onboardingService = OnboardingService;
    }

    /**
     * Get database service instance
     * @private
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getUserDatabaseService();
        }
        return this._dbService;
    }

    /**
     * Get TokenBlacklist model from shared database
     * @private
     */
    _getTokenBlacklistModel() {
        try {
            const dbService = database.getDatabaseService();
            return dbService.getModel('TokenBlacklist', 'shared');
        } catch (error) {
            logger.error('Failed to get TokenBlacklist model', {
                error: error.message
            });
            throw new AppError('Token blacklist service unavailable', 500);
        }
    }

    /**
     * Get or create default tenant ObjectId
     * CRITICAL: This ensures we always use a valid ObjectId for organizations[].tenantId
     * @private
     */
    _getDefaultTenantObjectId() {
        if (this._defaultTenantObjectId) {
            return this._defaultTenantObjectId;
        }

        // If COMPANY_TENANT_ID is set and is a valid ObjectId, use it
        if (this.config.companyTenantId &&
            this.config.companyTenantId !== 'default' &&
            mongoose.Types.ObjectId.isValid(this.config.companyTenantId)) {
            this._defaultTenantObjectId = new mongoose.Types.ObjectId(this.config.companyTenantId);
            return this._defaultTenantObjectId;
        }

        // Create a consistent default ObjectId using a deterministic string
        // This ensures the same ObjectId is used across all registrations
        const defaultIdString = '000000000000000000000001';
        this._defaultTenantObjectId = new mongoose.Types.ObjectId(defaultIdString);

        logger.info('Using default tenant ObjectId', {
            tenantId: this._defaultTenantObjectId.toString()
        });

        return this._defaultTenantObjectId;
    }

    /**
     * Get or create default organization ObjectId
     * @private
     */
    _getDefaultOrganizationObjectId() {
        if (this._defaultOrganizationObjectId) {
            return this._defaultOrganizationObjectId;
        }

        // If DEFAULT_ORGANIZATION_ID is set and is a valid ObjectId, use it
        if (this.config.defaultOrganizationId &&
            mongoose.Types.ObjectId.isValid(this.config.defaultOrganizationId)) {
            this._defaultOrganizationObjectId = new mongoose.Types.ObjectId(this.config.defaultOrganizationId);
            return this._defaultOrganizationObjectId;
        }

        // Create a consistent default ObjectId for organization
        const defaultOrgIdString = '000000000000000000000002';
        this._defaultOrganizationObjectId = new mongoose.Types.ObjectId(defaultOrgIdString);

        logger.info('Using default organization ObjectId', {
            organizationId: this._defaultOrganizationObjectId.toString()
        });

        return this._defaultOrganizationObjectId;
    }

    /**
     * Hash token for secure storage
     * @private
     */
    _hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Extract expiration date from JWT token
     * @private
     */
    _extractTokenExpiration(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                return new Date(decoded.exp * 1000);
            }
            return new Date(Date.now() + 24 * 60 * 60 * 1000);
        } catch (error) {
            logger.warn('Failed to extract token expiration', {
                error: error.message
            });
            return new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
    }

    /**
     * Generate unique session identifier
     * @private
     */
    _generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Register a new direct business user
     * @param {Object} userData - User registration data
     * @param {string} userType - Type of user (client, consultant, etc.)
     * @param {Object} options - Registration options
     * @returns {Promise<Object>} Registration result
     */
    async registerDirectUser(userData, userType, options = {}) {
        try {
            logger.info('Starting direct user registration', {
                email: userData.email,
                userType: userType
            });

            // Validate user type and registration data
            this._validateUserType(userType);
            this._validateRegistrationData(userData, userType);

            const dbService = this._getDatabaseService();

            // Check for existing user
            const existingUser = await dbService.userExists(
                userData.email,
                this.config.companyTenantId
            );

            if (existingUser) {
                throw new AppError('User already exists with this email', 409);
            }

            // Get default permissions and roles
            const defaultPermissions = this._getDefaultPermissions(userType);
            const defaultRoles = this._getDefaultRoles(userType);

            // Build organization membership
            const organizationMembership = this._buildOrganizationMembership(
                defaultPermissions,
                defaultRoles,
                options
            );

            // Build User document
            const userDocument = {
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: userData.password,
                phoneNumber: userData.phoneNumber,
                profile: {
                    firstName: userData.profile?.firstName,
                    lastName: userData.profile?.lastName,
                    middleName: userData.profile?.middleName,
                    displayName: userData.profile?.displayName ||
                        `${userData.profile?.firstName} ${userData.profile?.lastName}`.trim(),
                    title: userData.profile?.title,
                    bio: userData.profile?.bio,
                },
                permissions: defaultPermissions,
                roles: defaultRoles,
                organizations: [organizationMembership],
                defaultOrganizationId: organizationMembership.organizationId,
                tenantId: this.config.companyTenantId,
                accountStatus: {
                    status: 'pending',
                    reason: 'Account created - awaiting email verification',
                },
                verification: {
                    email: {
                        verified: false,
                        token: this._generateVerificationToken(),
                        tokenExpires: new Date(Date.now() + 86400000),
                    }
                },
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
                customFields: this._getUserTypeSpecificFields(userData, userType)
            };

            const relatedEntities = [];
            let useStrategyForClient = false;

            // Check if this user type requires a related entity through strategy
            if (EntityStrategyRegistry.hasStrategy(userType)) {
                const strategy = EntityStrategyRegistry.getStrategy(userType);
                const entityType = EntityStrategyRegistry.getEntityType(userType);

                // Verify strategy has required methods
                const strategyConfig = strategy.getConfig ? strategy.getConfig() : null;
                const hasValidStrategy = strategyConfig &&
                    strategyConfig.linkingField &&
                    typeof strategy.prepare === 'function' &&
                    typeof strategy.link === 'function';

                if (hasValidStrategy) {
                    logger.info('Using entity strategy for related entity creation', {
                        userType,
                        entityType,
                        linkingField: strategyConfig.linkingField
                    });

                    // Validate entity-specific data
                    const validation = await strategy.validate(userData, options);

                    if (!validation.valid) {
                        throw AppError.validation(
                            `${entityType} validation failed`,
                            validation.errors
                        );
                    }

                    // Log warnings if any
                    if (validation.warnings && validation.warnings.length > 0) {
                        logger.warn('Entity validation warnings', {
                            userType,
                            entityType,
                            warnings: validation.warnings
                        });
                    }

                    relatedEntities.push({
                        type: entityType,
                        strategy: strategy,
                        userData: userData,
                        options: {
                            tenantId: this._getDefaultTenantObjectId(),
                            organizationId: this._getDefaultOrganizationObjectId(),
                            accountManager: options.accountManager,
                            utmParams: options.utmParams
                        }
                    });

                    useStrategyForClient = true;
                } else {
                    logger.warn('Strategy exists but is incomplete, will use fallback creation', {
                        userType,
                        entityType,
                        hasConfig: !!strategyConfig,
                        hasLinkingField: !!(strategyConfig?.linkingField),
                        hasPrepare: typeof strategy.prepare === 'function',
                        hasLink: typeof strategy.link === 'function'
                    });
                }
            }

            // Execute universal transaction to create User
            const result = await UniversalTransactionService.executeTransaction(
                {
                    type: 'User',
                    data: userDocument,
                    database: 'customer'
                },
                relatedEntities.map(entity => ({
                    type: entity.type,
                    data: null,
                    prepareUsing: async (user) => {
                        return await entity.strategy.prepare(entity.userData, user, entity.options);
                    },
                    linkingField: entity.strategy.getConfig().linkingField,
                    linkingStrategy: (entityData, user) => {
                        entity.strategy.link(entityData, user);
                    }
                })),
                {
                    tenantId: this.config.companyTenantId,
                    metadata: {
                        userType: userType,
                        registrationSource: this._determineRegistrationSource(userType, options)
                    }
                }
            );

            const { entities, transaction } = result;
            let newUser = entities.primary;
            let relatedEntity = entities.related && entities.related.length > 0
                ? entities.related[0].entity
                : null;

            // Handle Client creation for client userType if strategy was not used
            if (userType === DIRECT_USER_TYPES.CLIENT && !useStrategyForClient) {
                logger.info('Creating Client using fallback method after User creation', {
                    userId: newUser._id,
                    email: newUser.email
                });

                try {
                    relatedEntity = await this._createClientDocument(newUser, userData, options);

                    if (relatedEntity) {
                        logger.info('Client created successfully via fallback method', {
                            userId: newUser._id,
                            clientId: relatedEntity._id,
                            clientCode: relatedEntity.clientCode
                        });

                        // Fetch updated user with clientId populated
                        const User = dbService.getModel('User', 'customer');
                        const updatedUser = await User.findById(newUser._id);

                        if (updatedUser) {
                            newUser = updatedUser;
                            logger.debug('User document refreshed with clientId', {
                                userId: newUser._id,
                                clientId: newUser.clientId
                            });
                        } else {
                            logger.warn('Could not fetch updated user after clientId assignment', {
                                userId: newUser._id
                            });
                        }
                    } else {
                        logger.warn('Client creation returned null', {
                            userId: newUser._id
                        });
                    }
                } catch (clientError) {
                    logger.error('Fallback Client creation failed', {
                        error: clientError.message,
                        stack: clientError.stack,
                        userId: newUser._id
                    });
                    // Continue with registration - user account is still valid
                }
            }

            logger.info('User registered successfully', {
                userId: newUser._id,
                relatedEntityId: relatedEntity?._id,
                email: newUser.email,
                userType: userType,
                transactionId: transaction.id,
                duration: transaction.duration,
                hasClientId: !!newUser.clientId,
                methodUsed: useStrategyForClient ? 'strategy' : 'fallback'
            });

            // Verify transaction integrity
            const integrityCheck = await UniversalTransactionService.verifyTransactionIntegrity(
                transaction.id
            );

            if (!integrityCheck.valid) {
                logger.error('Transaction integrity check failed', integrityCheck);
            }

            // Execute post-registration workflows asynchronously
            this._executePostRegistrationWorkflows(newUser, userType, options, relatedEntity)
                .catch(error => {
                    logger.error('Post-registration workflows failed (non-blocking)', {
                        error: error.message,
                        userId: newUser._id
                    });
                });

            // Initialize onboarding
            let onboardingData = null;
            try {
                onboardingData = await this._initializeOnboarding(newUser._id, userType);
            } catch (error) {
                logger.error('Onboarding initialization failed (non-blocking)', {
                    error: error.message
                });
            }

            // Generate tokens based on email verification requirement
            let tokens = null;
            if (!this.config.requireEmailVerification || newUser.verification?.email?.verified) {
                const accessToken = this._generateAccessToken(newUser);
                const refreshToken = this._generateRefreshToken(newUser);
                tokens = {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                };
            }

            // Build response
            const response = {
                user: this._sanitizeUserOutput(newUser),
                relatedEntity: relatedEntity ? this._sanitizeEntityOutput(relatedEntity, userType) : null,
                userType: userType,
                permissions: newUser.permissions,
                roles: newUser.roles,
                onboarding: onboardingData,
                nextSteps: this._getRegistrationNextSteps(userType, newUser),
                dashboardUrl: this._getDashboardUrl(userType),
                transaction: {
                    id: transaction.id,
                    status: transaction.status,
                    verified: integrityCheck.valid,
                    duration: transaction.duration
                }
            };

            if (tokens) {
                response.tokens = tokens;
                response.requiresAction = [];
            } else {
                response.requiresAction = ['VERIFY_EMAIL'];
                response.message = 'Registration successful. Please check your email to verify your account before logging in.';
                response.verificationEmailSent = true;
            }

            return response;

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

    /**
     * Sanitize entity output based on entity type
     * @private
     */
    _sanitizeEntityOutput(entity, userType) {
        if (!entity) return null;

        const entityObject = entity.toObject ? entity.toObject() : entity;

        // Return common fields across all entity types
        return {
            id: entityObject._id,
            code: entityObject.clientCode || entityObject.consultantCode || entityObject.candidateCode,
            createdAt: entityObject.createdAt,
            type: userType
        };
    }

    /**
     * Get default permissions for user type
     * @private
     */
    _getDefaultPermissions(userType) {
        return DEFAULT_PERMISSIONS_BY_TYPE[userType] || DEFAULT_PERMISSIONS_BY_TYPE.client;
    }

    /**
     * Get default roles for user type
     * @private
     */
    _getDefaultRoles(userType) {
        return [...DEFAULT_ROLES_BY_TYPE[userType]] || ['user'];
    }

    /**
     * Build organization membership structure with permissions
     * CRITICAL FIX: Uses ObjectId for organizations[].tenantId
     * @private
     */
    _buildOrganizationMembership(permissions, roles, options) {
        // Get or create organization ObjectId
        const organizationId = options.organizationId || this._getDefaultOrganizationObjectId();

        return {
            // Organization ID as ObjectId
            organizationId: organizationId,

            // CRITICAL FIX: Use ObjectId for organizations[].tenantId (not string)
            tenantId: this._getDefaultTenantObjectId(),

            // Convert flat permission strings to structured format
            permissions: permissions.map(permString => {
                const [resource, action] = permString.split(':');
                return {
                    resource: resource,
                    actions: action === '*' ? ['*'] : [action],
                    grantedAt: new Date(),
                    grantedBy: options.grantedBy || null
                };
            }),

            // Assign roles with metadata
            roles: roles.map(roleName => ({
                roleName: roleName,
                assignedAt: new Date(),
                assignedBy: options.assignedBy || null
            })),

            joinedAt: new Date(),
            status: 'active',
            isPrimary: true
        };
    }

    /**
     * Create Client business entity document for client user type
     * @private
     */
    async _createClientDocument(user, userData, options) {
        try {
            logger.info('Creating Client document for user', {
                userId: user._id || user.id,
                email: user.email
            });

            // CRITICAL FIX: Get Client model from database service
            const dbService = database.getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            if (!Client) {
                throw new Error('Client model not available from database service');
            }

            // Generate unique client code
            const clientCode = await this._generateClientCode(user);

            // CRITICAL FIX: Map registration source to valid acquisitionSource enum
            const sourceMapping = {
                [REGISTRATION_SOURCES.WEB_CLIENT]: 'inbound',
                [REGISTRATION_SOURCES.WEB_CONSULTANT]: 'inbound',
                [REGISTRATION_SOURCES.WEB_CANDIDATE]: 'inbound',
                [REGISTRATION_SOURCES.REFERRAL]: 'referral',
                [REGISTRATION_SOURCES.LINKEDIN]: 'inbound',
                [REGISTRATION_SOURCES.JOB_BOARD]: 'inbound',
                [REGISTRATION_SOURCES.DIRECT_INQUIRY]: 'direct_sales'
            };

            const registrationSource = this._determineRegistrationSource(DIRECT_USER_TYPES.CLIENT, options);
            const acquisitionSource = sourceMapping[registrationSource] || 'other';

            const clientData = {
                clientCode: clientCode,
                companyName: userData.companyName ||
                    userData.customFields?.companyName ||
                    `${user.profile.firstName} ${user.profile.lastName}'s Company`,

                // CRITICAL FIX: Use ObjectId for tenantId (not string)
                tenantId: this._getDefaultTenantObjectId(),

                // Use ObjectId for organizationId
                organizationId: this._getDefaultOrganizationObjectId(),

                // CRITICAL FIX: Provide required addresses.headquarters.country field
                addresses: {
                    headquarters: {
                        country: userData.country || 'United States',
                        city: userData.city,
                        state: userData.state,
                        postalCode: userData.postalCode,
                        street1: userData.address,
                        timezone: userData.timezone || 'America/New_York'
                    }
                },

                contacts: {
                    primary: {
                        name: `${user.profile.firstName} ${user.profile.lastName}`,
                        email: user.email,
                        phone: user.phoneNumber,
                        preferredContactMethod: 'email'
                    }
                },

                relationship: {
                    status: 'prospect',
                    tier: userData.businessTier || 'small_business',
                    accountManager: options.accountManager || null,
                    acquisitionDate: new Date(),
                    // CRITICAL FIX: Use valid enum value for acquisitionSource
                    acquisitionSource: acquisitionSource
                },

                businessDetails: {
                    entityType: userData.entityType || userData.customFields?.businessType || 'other',
                    numberOfEmployees: userData.numberOfEmployees ? {
                        range: userData.numberOfEmployees
                    } : undefined
                },

                metadata: {
                    // CRITICAL FIX: Use valid enum value for metadata.source
                    source: 'api',
                    linkedUserId: user._id || user.id,
                    registrationData: {
                        registeredAt: new Date(),
                        registrationSource: registrationSource,
                        campaign: options.utmParams?.campaign
                    },
                    tags: ['user-registration', registrationSource],
                    flags: {
                        isVip: false,
                        isStrategic: false,
                        requiresAttention: false
                    }
                }
            };

            const client = await Client.create(clientData);

            // Update user with clientId reference using the database connection
            const customerConnection = dbService.getConnection('customer');
            await customerConnection.model('User').findByIdAndUpdate(
                user._id || user.id,
                { clientId: client._id },
                { new: true }
            );

            logger.info('Client document created successfully', {
                clientId: client._id,
                clientCode: client.clientCode,
                userId: user._id || user.id
            });

            return client;

        } catch (error) {
            logger.error('Failed to create Client document', {
                error: error.message,
                stack: error.stack,
                userId: user._id || user.id
            });

            // Return null to allow registration to complete
            // The user document is still created successfully
            return null;
        }
    }

    /**
     * Generate unique client code
     * @private
     */
    async _generateClientCode(user) {
        const prefix = 'CLI';
        const initials = `${user.profile.firstName.charAt(0)}${user.profile.lastName.charAt(0)}`.toUpperCase();
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();

        return `${prefix}-${initials}${timestamp}${random}`;
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

            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                await this._logFailedLogin(email, 'User not found', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            if (user.accountStatus?.status === 'suspended') {
                throw AppError.forbidden('Account is suspended. Please contact support');
            }

            if (user.accountStatus?.status === 'blocked') {
                throw AppError.forbidden('Account is blocked. Please contact support');
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                if (typeof user.incrementLoginAttempts === 'function') {
                    await user.incrementLoginAttempts();
                }
                await this._logFailedLogin(email, 'Invalid password', options);
                throw AppError.unauthorized('Invalid credentials');
            }

            if (this.config.requireEmailVerification && !user.verification?.email?.verified) {
                logger.warn('Login attempt with unverified email', {
                    userId: user._id || user.id,
                    email: user.email
                });

                try {
                    const needsNewToken = !user.verification.email.token ||
                        !user.verification.email.tokenExpires ||
                        new Date() > new Date(user.verification.email.tokenExpires);

                    if (needsNewToken) {
                        user.verification.email.token = this._generateVerificationToken();
                        user.verification.email.tokenExpires = new Date(Date.now() + 86400000);
                        user.verification.email.attempts = (user.verification.email.attempts || 0) + 1;
                        await user.save();
                    }

                    await this._sendVerificationEmail(user);
                } catch (emailError) {
                    logger.error('Failed to send verification email on login', {
                        error: emailError.message,
                        userId: user._id || user.id
                    });
                }

                throw new AppError(
                    'Email verification required. A verification link has been sent to your email address.',
                    403,
                    'EMAIL_NOT_VERIFIED',
                    {
                        requiresEmailVerification: true,
                        email: user.email,
                        userId: user._id || user.id,
                        verificationSent: true
                    }
                );
            }

            if (user.mfa?.enabled) {
                const tempToken = this._generateTempToken(user._id || user.id);
                return {
                    requiresMFA: true,
                    tempToken: tempToken,
                    mfaMethods: user.mfa.methods || [],
                    challengeId: this._generateChallengeId()
                };
            }

            if (typeof user.recordLogin === 'function') {
                await user.recordLogin({
                    ip: options.ip,
                    userAgent: options.userAgent,
                    device: options.device,
                    location: options.location
                });
            }

            const accessToken = this._generateAccessToken(user);
            const refreshToken = this._generateRefreshToken(user);

            const userType = this._getUserTypeFromUser(user);

            let userSpecificData = {};
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
                userType: userType,
                permissions: user.permissions
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
                pendingNotifications: [],
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

    async isTokenBlacklisted(token) {
        try {
            const TokenBlacklist = this._getTokenBlacklistModel();
            const tokenHash = this._hashToken(token);
            const isBlacklisted = await TokenBlacklist.isBlacklisted(tokenHash);

            if (isBlacklisted) {
                logger.debug('Token found in blacklist');
            }

            return isBlacklisted;
        } catch (error) {
            logger.error('Error checking token blacklist', {
                error: error.message
            });
            return true;
        }
    }

    async logoutUser(userId, token, options = {}) {
        try {
            logger.info('Logging out user', { userId });

            const TokenBlacklist = this._getTokenBlacklistModel();
            const tokenHash = this._hashToken(token);
            const expiresAt = this._extractTokenExpiration(token);

            await TokenBlacklist.blacklistToken({
                tokenHash: tokenHash,
                userId: userId,
                tenantId: this.config.companyTenantId,
                expiresAt: expiresAt,
                reason: 'logout',
                ipAddress: options.ip,
                userAgent: options.userAgent,
                metadata: {
                    sessionId: options.sessionId,
                    deviceId: options.deviceId,
                    location: options.location
                }
            });

            logger.info('User logged out successfully', { userId });
        } catch (error) {
            logger.error('Logout failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    async logoutUserAllDevices(userId, reason = 'logout_all') {
        try {
            logger.info('Logging out user from all devices', { userId, reason });

            const TokenBlacklist = this._getTokenBlacklistModel();
            const result = await TokenBlacklist.blacklistUserTokens(
                userId,
                this.config.companyTenantId,
                reason
            );

            logger.info('User logged out from all devices', {
                userId,
                tokensBlacklisted: result
            });

            return result;
        } catch (error) {
            logger.error('Logout all devices failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    async getUserById(userId) {
        try {
            const dbService = this._getDatabaseService();
            const user = await dbService.findUserById(userId, this.config.companyTenantId, {
                select: '-password -verification.email.token'
            });

            if (!user) {
                throw new AppError('User not found', 404);
            }

            return this._sanitizeUserOutput(user);
        } catch (error) {
            logger.error('Failed to get user by ID', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    async verifyEmail(token, email) {
        try {
            logger.info('Verifying email', { email });

            const dbService = this._getDatabaseService();
            const User = dbService.getModel('User', 'customer');

            const user = await User.findOne({
                email: email.toLowerCase(),
                tenantId: this.config.companyTenantId,
                'accountStatus.status': { $ne: 'deleted' }
            }).select('+verification.email.token');

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            if (user.verification?.email?.verified) {
                return {
                    message: 'Email already verified',
                    verified: true,
                    user: this._sanitizeUserOutput(user)
                };
            }

            const storedToken = user.verification?.email?.token;
            const tokenExpires = user.verification?.email?.tokenExpires;

            if (!storedToken) {
                throw new AppError('No verification token found', 400, 'NO_TOKEN');
            }

            if (storedToken.trim() !== token.trim()) {
                logger.warn('Token mismatch', {
                    providedLength: token.length,
                    storedLength: storedToken.length,
                    email
                });
                throw new AppError('Invalid verification token', 400, 'INVALID_TOKEN');
            }

            if (new Date() > new Date(tokenExpires)) {
                throw new AppError('Verification token has expired', 400, 'TOKEN_EXPIRED');
            }

            user.verification.email.verified = true;
            user.verification.email.verifiedAt = new Date();
            user.verification.email.token = undefined;
            user.verification.email.tokenExpires = undefined;

            if (user.accountStatus.status === 'pending') {
                user.accountStatus.status = 'active';
                user.accountStatus.activatedAt = new Date();
                user.accountStatus.reason = 'Email verified successfully';
            }

            await user.save();

            logger.info('Email verified successfully', {
                userId: user._id || user.id,
                email: user.email
            });

            return {
                message: 'Email verified successfully',
                verified: true,
                user: this._sanitizeUserOutput(user)
            };
        } catch (error) {
            logger.error('Email verification failed', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    async resendVerificationEmail(email) {
        try {
            logger.info('Resending verification email', { email });

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                throw new AppError('User not found', 404);
            }

            if (user.verification?.email?.verified) {
                throw new AppError('Email already verified', 400);
            }

            user.verification.email.token = this._generateVerificationToken();
            user.verification.email.tokenExpires = new Date(Date.now() + 86400000);
            user.verification.email.attempts = (user.verification.email.attempts || 0) + 1;

            await user.save();
            await this._sendVerificationEmail(user);

            logger.info('Verification email resent', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Failed to resend verification email', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    async initiatePasswordReset(email) {
        try {
            logger.info('Initiating password reset', { email });

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(
                email,
                this.config.companyTenantId
            );

            if (!user) {
                logger.warn('Password reset requested for non-existent user', { email });
                return;
            }

            const resetToken = this._generateVerificationToken();
            const resetExpires = new Date(Date.now() + 3600000);

            user.security = user.security || {};
            user.security.passwordReset = {
                token: resetToken,
                tokenExpires: resetExpires,
                attempts: (user.security.passwordReset?.attempts || 0) + 1
            };

            await user.save();
            await this._sendPasswordResetEmail(user, resetToken);

            logger.info('Password reset initiated', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Failed to initiate password reset', {
                error: error.message,
                email
            });
            throw error;
        }
    }

    async resetPassword(token, newPassword) {
        try {
            logger.info('Resetting password');

            const dbService = this._getDatabaseService();
            const User = dbService.getModel('User', 'customer');

            const user = await User.findOne({
                'security.passwordReset.token': token,
                'security.passwordReset.tokenExpires': { $gt: new Date() }
            });

            if (!user) {
                throw new AppError('Invalid or expired reset token', 400);
            }

            this._validatePassword(newPassword);

            user.password = newPassword;
            user.security.passwordReset = undefined;

            await user.save();
            await this.logoutUserAllDevices(user._id.toString(), 'password_reset');

            logger.info('Password reset successfully', { userId: user._id || user.id });
        } catch (error) {
            logger.error('Password reset failed', {
                error: error.message
            });
            throw error;
        }
    }

    async changePassword(userId, currentPassword, newPassword, currentToken = null) {
        try {
            logger.info('Changing password', { userId });

            const dbService = this._getDatabaseService();
            const User = dbService.getModel('User', 'customer');

            const user = await User.findOne({
                _id: userId,
                tenantId: this.config.companyTenantId,
                'accountStatus.status': { $ne: 'deleted' }
            }).select('+password');

            if (!user) {
                throw new AppError('User not found', 404, 'USER_NOT_FOUND');
            }

            if (!user.password) {
                throw new AppError('User password not found. Please contact support.', 500);
            }

            const isCurrentPasswordValid = await user.comparePassword(currentPassword);

            if (!isCurrentPasswordValid) {
                throw new AppError('Current password is incorrect', 401);
            }

            this._validatePassword(newPassword);

            user.password = newPassword;
            await user.save();

            logger.info('Password changed successfully', { userId });

            if (currentToken) {
                try {
                    await this.logoutUser(userId, currentToken, {
                        reason: 'password_change',
                        immediate: true
                    });
                } catch (error) {
                    logger.error('Failed to blacklist current token', {
                        error: error.message,
                        userId
                    });
                }
            }

            try {
                await this.logoutUserAllDevices(userId, 'password_change');
            } catch (error) {
                logger.warn('Failed to blacklist all tokens after password change', {
                    error: error.message,
                    userId
                });
            }
        } catch (error) {
            logger.error('Password change failed', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    async refreshAccessToken(refreshToken, oldAccessToken = null) {
        try {
            logger.info('Refreshing access token');

            const decoded = jwt.verify(refreshToken, this.config.jwtSecret);

            if (decoded.type !== 'refresh') {
                throw new AppError('Invalid token type', 401);
            }

            const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
            if (isBlacklisted) {
                throw new AppError('Refresh token has been revoked', 401);
            }

            const user = await this.getUserById(decoded.userId);

            const newAccessToken = this._generateAccessToken(user);
            const newRefreshToken = this._generateRefreshToken(user);

            await this.logoutUser(decoded.userId, refreshToken, {
                reason: 'token_refresh'
            });

            if (oldAccessToken) {
                try {
                    const oldDecoded = jwt.decode(oldAccessToken);
                    if (oldDecoded && oldDecoded.userId === decoded.userId) {
                        await this.logoutUser(decoded.userId, oldAccessToken, {
                            reason: 'token_refresh_access'
                        });
                    }
                } catch (error) {
                    logger.warn('Failed to blacklist old access token during refresh', {
                        userId: decoded.userId,
                        error: error.message
                    });
                }
            }

            logger.info('Access token refreshed', { userId: decoded.userId });

            return {
                tokens: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                }
            };
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                throw new AppError('Invalid or expired refresh token', 401);
            }
            logger.error('Token refresh failed', { error: error.message });
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
            this._validatePassword(userData.password, errors);
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

    _validatePassword(password, errors = []) {
        if (password.length < this.config.passwordMinLength) {
            errors.push(`Password must be at least ${this.config.passwordMinLength} characters`);
        }
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password)) {
            errors.push('Password must contain uppercase, lowercase, number, and special character');
        }

        if (errors.length > 0) {
            throw AppError.validation('Password validation failed', errors);
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

    async _executePostRegistrationWorkflows(user, userType, options, clientDocument) {
        try {
            await this._sendWelcomeEmail(user, userType);
            await this._trackRegistrationEvent(user, userType, options);

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

    async _sendVerificationEmail(user) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: 'email-verification',
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        verificationLink: `${this.config.platformUrl}/verify-email?token=${user.verification.email.token}`,
                        token: user.verification.email.token
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send verification email', { error: error.message });
        }
    }

    async _sendPasswordResetEmail(user, resetToken) {
        try {
            if (typeof this.notificationService.sendEmail === 'function') {
                await this.notificationService.sendEmail({
                    to: user.email,
                    template: 'password-reset',
                    data: {
                        firstName: user.profile?.firstName || 'User',
                        resetLink: `${this.config.platformUrl}/reset-password?token=${resetToken}`,
                        token: resetToken
                    }
                });
            }
        } catch (error) {
            logger.error('Failed to send password reset email', { error: error.message });
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

    /**
     * Initialize onboarding for new user
     * FIXED: Now properly passes tenantId to onboarding service
     * @private
     */
    async _initializeOnboarding(userId, userType) {
        try {
            if (typeof this.onboardingService.createOnboarding === 'function') {
                return await this.onboardingService.createOnboarding({
                    userId: userId,
                    tenantId: this.config.companyTenantId, // FIXED: Added tenantId parameter
                    type: userType,
                    context: 'direct_business'
                });
            }
        } catch (error) {
            logger.error('Failed to initialize onboarding', {
                error: error.message,
                userId: userId,
                userType: userType,
                tenantId: this.config.companyTenantId // Added for debugging
            });
        }
        return null;
    }

    // ============= UTILITY METHODS =============

    _generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    _generateAccessToken(user) {
        return jwt.sign(
            {
                id: user._id || user.id,
                userId: user._id || user.id,
                email: user.email,
                tenantId: this.config.companyTenantId,
                permissions: user.permissions,
                roles: user.roles
            },
            this.config.jwtSecret,
            { expiresIn: this.config.jwtExpiresIn }
        );
    }

    _generateRefreshToken(user) {
        return jwt.sign(
            {
                userId: user._id || user.id,
                type: 'refresh'
            },
            this.config.jwtSecret,
            { expiresIn: this.config.refreshTokenExpiresIn }
        );
    }

    _generateTempToken(userId) {
        return jwt.sign(
            { userId, type: 'temp' },
            this.config.jwtSecret,
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

    _sanitizeClientOutput(client) {
        if (!client) return null;

        return {
            id: client._id || client.id,
            clientCode: client.clientCode,
            companyName: client.companyName,
            relationship: client.relationship,
            createdAt: client.createdAt
        };
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

module.exports = new DirectAuthService();