'use strict';

/**
 * @fileoverview Enterprise user management controller for authentication and user lifecycle operations
 * @module servers/api/modules/user-management/controllers/user-controller
 * @requires module:servers/api/modules/user-management/services/user-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const UserService = require('../services/user-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError } = require('../../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../../shared/lib/utils/response-formatter');
const { StatusCodes } = require('../../../../../../shared/lib/utils/constants/status-codes');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class UserController
 * @description Handles HTTP requests for user management, authentication, and user lifecycle operations
 */
class UserController {
    /**
     * @private
     * @type {UserService}
     */
    static #userService = new UserService();

    /**
     * Authenticate user with multiple strategy support
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async authenticateUser(req, res, next) {
        try {
            const { credentials, strategy = 'local', rememberMe = false } = req.body;
            const context = {
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                correlationId: req.headers['x-correlation-id'] || stringHelper.generateUUID()
            };

            logger.info('User authentication attempt', {
                strategy,
                email: credentials?.email,
                ipAddress: context.ipAddress,
                correlationId: context.correlationId
            });

            // Validate required fields based on strategy
            const requiredFields = UserController.#getRequiredFieldsForStrategy(strategy);
            const missingFields = requiredFields.filter(field => !credentials?.[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields for ${strategy} authentication: ${missingFields.join(', ')}`, 'MISSING_REQUIRED_FIELDS');
            }

            // Additional strategy-specific validations
            switch (strategy) {
                case 'local':
                    if (!stringHelper.isValidEmail(credentials.email)) {
                        throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
                    }
                    if (credentials.password && credentials.password.length < 8) {
                        throw new ValidationError('Password must be at least 8 characters', 'PASSWORD_TOO_SHORT');
                    }
                    break;

                case 'google':
                case 'github':
                case 'linkedin':
                case 'microsoft':
                    if (!credentials.code) {
                        throw new ValidationError(`${strategy} authorization code is required`, 'MISSING_AUTH_CODE');
                    }
                    break;

                case 'saml':
                case 'oidc':
                    if (!credentials.ssoResponse) {
                        throw new ValidationError(`${strategy} SSO response is required`, 'MISSING_SSO_RESPONSE');
                    }
                    break;

                case 'ldap':
                    if (!credentials.username || !credentials.password) {
                        throw new ValidationError('Username and password are required for LDAP authentication', 'MISSING_LDAP_CREDENTIALS');
                    }
                    break;

                case 'jwt':
                    if (!credentials.token) {
                        throw new ValidationError('JWT token is required', 'MISSING_JWT_TOKEN');
                    }
                    break;

                default:
                    throw new ValidationError(`Unsupported authentication strategy: ${strategy}`, 'UNSUPPORTED_STRATEGY');
            }

            const authResult = await UserController.#userService.authenticateUser(
                credentials,
                strategy,
                context,
                { rememberMe }
            );

            const responseData = {
                success: authResult.success,
                user: authResult.user,
                tokens: authResult.tokens,
                session: authResult.session,
                method: authResult.method,
                correlationId: authResult.correlationId
            };

            // Set secure HTTP-only cookie for refresh token if applicable
            if (authResult.tokens?.refreshToken && rememberMe) {
                res.cookie('refreshToken', authResult.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                });
            }

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    responseData,
                    'Authentication successful',
                    {
                        strategy,
                        sessionExpiry: authResult.session?.expiresAt,
                        requiresMFA: authResult.requiresMFA || false,
                        securityScore: authResult.security?.score || null
                    }
                )
            );

        } catch (error) {
            logger.error('Authentication failed', {
                error: error.message,
                strategy: req.body?.strategy,
                email: req.body?.credentials?.email,
                ipAddress: req.ip,
                correlationId: req.headers['x-correlation-id']
            });
            next(error);
        }
    }

    /**
     * Register new user with comprehensive validation
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async registerUser(req, res, next) {
        try {
            const { userData, strategy = 'local', autoActivate = false } = req.body;
            const context = {
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                correlationId: req.headers['x-correlation-id'] || stringHelper.generateUUID(),
                requesterId: req.user?.id || 'anonymous'
            };

            logger.info('User registration attempt', {
                strategy,
                email: userData?.email,
                organizationId: userData?.organizationId,
                correlationId: context.correlationId
            });

            // Validate required fields
            const requiredFields = ['email', 'profile'];
            const missingFields = requiredFields.filter(field => !userData?.[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(
                    `Missing required fields: ${missingFields.join(', ')}`,
                    { missingFields },
                    'MISSING_REQUIRED_FIELDS'
                );
            }

            // Validate profile structure
            if (!userData.profile.firstName || !userData.profile.lastName) {
                throw new ValidationError(
                    'First name and last name are required in profile',
                    { firstName: !userData.profile.firstName, lastName: !userData.profile.lastName },
                    'INCOMPLETE_PROFILE'
                );
            }

            // Email validation
            if (!stringHelper.isValidEmail(userData.email)) {
                throw new ValidationError(
                    'Invalid email format',
                    { email: userData.email },
                    'INVALID_EMAIL'
                );
            }

            // Password validation for local strategy
            if (strategy === 'local') {
                if (!userData.password) {
                    throw new ValidationError(
                        'Password is required for local registration',
                        { password: 'required' },
                        'PASSWORD_REQUIRED'
                    );
                }
                if (userData.password.length < 8) {
                    throw new ValidationError(
                        'Password must be at least 8 characters',
                        { password: 'too_short' },
                        'PASSWORD_TOO_SHORT'
                    );
                }
                if (!stringHelper.isStrongPassword(userData.password)) {
                    throw new ValidationError(
                        'Password must contain uppercase, lowercase, numbers, and special characters',
                        { password: 'weak' },
                        'WEAK_PASSWORD'
                    );
                }
            }

            // Phone number validation if provided
            // if (userData.phoneNumber && !stringHelper.isValidPhoneNumber(userData.phoneNumber)) {
            //     throw new ValidationError(
            //         'Invalid phone number format',
            //         { phoneNumber: userData.phoneNumber },
            //         'INVALID_PHONE'
            //     );
            // }

            // Phone number validation if provided
            if (userData.phoneNumber && userData.phoneNumber.trim() !== '') {
                // More lenient phone number validation
                const phoneRegex = /^[\+]?[\d\s\-\(\)\.]{10,}$/;
                if (!phoneRegex.test(userData.phoneNumber.trim())) {
                    throw new ValidationError(
                        'Invalid phone number format. Please use a valid international or domestic format.',
                        { phoneNumber: userData.phoneNumber },
                        'INVALID_PHONE'
                    );
                }
            }

            // Organization validation if provided
            if (userData.organizationId && !stringHelper.isValidObjectId(userData.organizationId)) {
                throw new ValidationError(
                    'Invalid organization ID',
                    { organizationId: userData.organizationId },
                    'INVALID_ORGANIZATION_ID'
                );
            }

            const registrationResult = await UserController.#userService.registerUser(
                userData,
                strategy,
                context,
                {
                    autoActivate,
                    skipWelcomeEmail: req.body.skipWelcomeEmail || false,
                    notifyAdmins: req.body.notifyAdmins || false
                }
            );

            const responseData = {
                success: registrationResult.success,
                user: registrationResult.user,
                tokens: registrationResult.tokens,
                session: registrationResult.session,
                verificationRequired: !registrationResult.user?.verification?.email?.verified
            };

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    responseData,
                    'User registered successfully',
                    {
                        strategy,
                        autoActivated: autoActivate,
                        correlationId: registrationResult.correlationId,
                        verificationEmailSent: responseData.verificationRequired
                    }
                )
            );

        } catch (error) {
            logger.error('User registration failed', {
                error: error.message,
                email: req.body?.userData?.email,
                strategy: req.body?.strategy,
                correlationId: req.headers['x-correlation-id']
            });
            next(error);
        }
    }

    /**
     * Logout user with comprehensive session cleanup
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async logoutUser(req, res, next) {
        try {
            const sessionIdentifier = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.refreshToken ||
                req.body?.sessionId;
            const { allDevices = false, reason = 'user_request' } = req.body;
            const context = {
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                correlationId: req.headers['x-correlation-id'] || stringHelper.generateUUID()
            };

            logger.info('User logout attempt', {
                userId: req.user?.id,
                allDevices,
                reason,
                correlationId: context.correlationId
            });

            if (!sessionIdentifier) {
                throw new ValidationError('Session identifier is required for logout', 'MISSING_SESSION_IDENTIFIER');
            }

            const logoutResult = await UserController.#userService.logoutUser(
                sessionIdentifier,
                context,
                { allDevices, reason }
            );

            // Clear refresh token cookie
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    {
                        success: logoutResult.success,
                        sessionsTerminated: logoutResult.sessionsTerminated || 1,
                        allDevices: allDevices
                    },
                    'Logout successful',
                    {
                        correlationId: context.correlationId,
                        reason
                    }
                )
            );

        } catch (error) {
            logger.error('User logout failed', {
                error: error.message,
                userId: req.user?.id,
                correlationId: req.headers['x-correlation-id']
            });
            next(error);
        }
    }

    /**
     * Create a new user (admin operation)
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async createUser(req, res, next) {
        try {
            const userData = req.body;
            const createdBy = req.user.id;
            const { autoActivate = false, sendWelcomeEmail = true, generateTempPassword = false } = req.body.options || {};

            logger.info('Admin user creation attempt', {
                email: userData.email,
                organizationId: userData.organizationId,
                createdBy,
                autoActivate
            });

            // Validate required fields
            const requiredFields = ['email', 'profile', 'organizations'];
            const missingFields = requiredFields.filter(field => !userData[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, 'MISSING_REQUIRED_FIELDS');
            }

            // Validate profile structure
            if (!userData.profile.firstName || !userData.profile.lastName) {
                throw new ValidationError('First name and last name are required', 'INCOMPLETE_PROFILE');
            }

            // Email validation
            if (!stringHelper.isValidEmail(userData.email)) {
                throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
            }

            // Organization validation
            if (!Array.isArray(userData.organizations) || userData.organizations.length === 0) {
                throw new ValidationError('User must belong to at least one organization', 'MISSING_ORGANIZATIONS');
            }

            // Validate organization IDs and roles
            for (const org of userData.organizations) {
                if (!stringHelper.isValidObjectId(org.organizationId)) {
                    throw new ValidationError(`Invalid organization ID: ${org.organizationId}`, 'INVALID_ORGANIZATION_ID');
                }
                if (!org.roles || !Array.isArray(org.roles) || org.roles.length === 0) {
                    throw new ValidationError('Each organization must have at least one role', 'MISSING_ROLES');
                }
            }

            // Generate temporary password if requested
            if (generateTempPassword && !userData.password) {
                userData.tempPassword = stringHelper.generateSecurePassword();
                userData.password = userData.tempPassword;
            }

            const user = await UserController.#userService.createUser(
                userData,
                createdBy,
                {
                    autoActivate,
                    skipNotifications: !sendWelcomeEmail,
                    session: req.session
                }
            );

            const responseData = {
                ...user,
                tempPassword: userData.tempPassword || undefined
            };

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    responseData,
                    'User created successfully',
                    {
                        autoActivated: autoActivate,
                        welcomeEmailSent: sendWelcomeEmail,
                        tempPasswordGenerated: !!userData.tempPassword,
                        organizationsCount: userData.organizations.length
                    }
                )
            );

        } catch (error) {
            logger.error('User creation failed', {
                error: error.message,
                email: req.body?.email,
                createdBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get user by ID with comprehensive data
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getUserById(req, res, next) {
        try {
            const { userId } = req.params;
            const {
                populate = [],
                includeDeleted = false,
                includeAuthData = false,
                organizationId
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Get user by ID request', {
                userId,
                requesterId,
                populate: Array.isArray(populate) ? populate : [populate],
                includeAuthData
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Parse populate array
            const populateArray = Array.isArray(populate) ? populate :
                typeof populate === 'string' ? populate.split(',') : [];

            // Validate populate options
            const validPopulateOptions = ['organizations', 'profile', 'settings', 'preferences', 'sessions'];
            const invalidPopulate = populateArray.filter(option => !validPopulateOptions.includes(option));

            if (invalidPopulate.length > 0) {
                throw new ValidationError(`Invalid populate options: ${invalidPopulate.join(', ')}`, 'INVALID_POPULATE_OPTIONS');
            }

            const user = await UserController.#userService.getUserById(
                userId,
                {
                    populate: populateArray,
                    includeDeleted: includeDeleted === 'true',
                    checkPermissions: true,
                    requesterId,
                    organizationId,
                    includeAuthData: includeAuthData === 'true'
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    user,
                    'User retrieved successfully',
                    {
                        populated: populateArray,
                        hasAuthData: includeAuthData === 'true' && user.authData,
                        securityContext: user.securityContext,
                        metrics: user.metrics
                    }
                )
            );

        } catch (error) {
            logger.error('Get user failed', {
                error: error.message,
                userId: req.params?.userId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Update user information
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async updateUser(req, res, next) {
        try {
            const { userId } = req.params;
            const updateData = req.body;
            const updatedBy = req.user.id;
            const { reason, skipNotifications = false } = req.body.options || {};

            logger.info('User update attempt', {
                userId,
                updatedBy,
                fieldsToUpdate: Object.keys(updateData).filter(key => key !== 'options'),
                reason
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Remove options from update data
            const { options, ...cleanUpdateData } = updateData;

            // Validate email if being updated
            if (cleanUpdateData.email && !stringHelper.isValidEmail(cleanUpdateData.email)) {
                throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
            }

            // Validate phone number if being updated
            if (cleanUpdateData.phoneNumber && !stringHelper.isValidPhoneNumber(cleanUpdateData.phoneNumber)) {
                throw new ValidationError('Invalid phone number format', 'INVALID_PHONE');
            }

            // Validate password strength if being updated
            if (cleanUpdateData.password) {
                if (cleanUpdateData.password.length < 8) {
                    throw new ValidationError('Password must be at least 8 characters', 'PASSWORD_TOO_SHORT');
                }
                if (!stringHelper.isStrongPassword(cleanUpdateData.password)) {
                    throw new ValidationError('Password must contain uppercase, lowercase, numbers, and special characters', 'WEAK_PASSWORD');
                }
            }

            // Validate profile updates
            if (cleanUpdateData.profile) {
                if (cleanUpdateData.profile.firstName && cleanUpdateData.profile.firstName.length < 2) {
                    throw new ValidationError('First name must be at least 2 characters', 'INVALID_FIRST_NAME');
                }
                if (cleanUpdateData.profile.lastName && cleanUpdateData.profile.lastName.length < 2) {
                    throw new ValidationError('Last name must be at least 2 characters', 'INVALID_LAST_NAME');
                }
            }

            // Validate organization updates
            if (cleanUpdateData.organizations) {
                if (!Array.isArray(cleanUpdateData.organizations)) {
                    throw new ValidationError('Organizations must be an array', 'INVALID_ORGANIZATIONS_FORMAT');
                }

                for (const org of cleanUpdateData.organizations) {
                    if (!stringHelper.isValidObjectId(org.organizationId)) {
                        throw new ValidationError(`Invalid organization ID: ${org.organizationId}`, 'INVALID_ORGANIZATION_ID');
                    }
                }
            }

            const updatedUser = await UserController.#userService.updateUser(
                userId,
                cleanUpdateData,
                updatedBy,
                {
                    session: req.session,
                    skipNotifications,
                    reason
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    updatedUser,
                    'User updated successfully',
                    {
                        fieldsUpdated: Object.keys(cleanUpdateData),
                        updatedBy,
                        reason,
                        notificationsSent: !skipNotifications
                    }
                )
            );

        } catch (error) {
            logger.error('User update failed', {
                error: error.message,
                userId: req.params?.userId,
                updatedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Delete or deactivate user
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async deleteUser(req, res, next) {
        try {
            const { userId } = req.params;
            const deletedBy = req.user.id;
            const {
                hardDelete = false,
                reason,
                transferOwnership,
                gracePeriod = 30
            } = req.body;

            logger.info('User deletion attempt', {
                userId,
                deletedBy,
                hardDelete,
                reason,
                transferOwnership,
                gracePeriod
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate deletion reason
            if (!reason || reason.trim().length < 10) {
                throw new ValidationError('Deletion reason must be at least 10 characters', 'INSUFFICIENT_REASON');
            }

            // Validate transfer ownership if provided
            if (transferOwnership && !stringHelper.isValidObjectId(transferOwnership)) {
                throw new ValidationError('Invalid transfer ownership user ID', 'INVALID_TRANSFER_USER_ID');
            }

            // Validate grace period
            if (gracePeriod < 0 || gracePeriod > 365) {
                throw new ValidationError('Grace period must be between 0 and 365 days', 'INVALID_GRACE_PERIOD');
            }

            // Prevent self-deletion
            if (userId === deletedBy) {
                throw new ValidationError('Users cannot delete their own account', 'SELF_DELETION_NOT_ALLOWED');
            }

            const deletionSuccess = await UserController.#userService.deleteUser(
                userId,
                deletedBy,
                {
                    hardDelete,
                    reason,
                    transferOwnership,
                    gracePeriod,
                    session: req.session
                }
            );

            const responseMessage = hardDelete ?
                'User permanently deleted' :
                `User scheduled for deletion in ${gracePeriod} days`;

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    {
                        success: deletionSuccess,
                        userId,
                        deletionType: hardDelete ? 'permanent' : 'scheduled',
                        gracePeriod: hardDelete ? null : gracePeriod,
                        transferOwnership
                    },
                    responseMessage,
                    {
                        deletedBy,
                        reason,
                        effectiveDate: hardDelete ? new Date() : dateHelper.addDays(new Date(), gracePeriod)
                    }
                )
            );

        } catch (error) {
            logger.error('User deletion failed', {
                error: error.message,
                userId: req.params?.userId,
                deletedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Setup multi-factor authentication
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async setupMFA(req, res, next) {
        try {
            const { userId } = req.params;
            const { method, options = {} } = req.body;
            const requesterId = req.user.id;

            logger.info('MFA setup attempt', {
                userId,
                method,
                requesterId,
                options: Object.keys(options)
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate MFA method
            const validMethods = ['totp', 'sms', 'email', 'webauthn', 'backup_codes'];
            if (!method || !validMethods.includes(method)) {
                throw new ValidationError(`Invalid MFA method. Supported methods: ${validMethods.join(', ')}`, 'INVALID_MFA_METHOD');
            }

            // Method-specific validations
            switch (method) {
                case 'sms':
                    if (options.phoneNumber && !stringHelper.isValidPhoneNumber(options.phoneNumber)) {
                        throw new ValidationError('Invalid phone number for SMS MFA', 'INVALID_PHONE');
                    }
                    break;

                case 'email':
                    if (options.email && !stringHelper.isValidEmail(options.email)) {
                        throw new ValidationError('Invalid email for email MFA', 'INVALID_EMAIL');
                    }
                    break;

                case 'totp':
                    if (options.label && options.label.length > 50) {
                        throw new ValidationError('TOTP label must be 50 characters or less', 'INVALID_TOTP_LABEL');
                    }
                    break;

                case 'webauthn':
                    if (!options.challenge || !options.origin) {
                        throw new ValidationError('WebAuthn challenge and origin are required', 'MISSING_WEBAUTHN_DATA');
                    }
                    break;
            }

            const mfaResult = await UserController.#userService.setupMFA(
                userId,
                method,
                {
                    ...options,
                    requesterId
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    mfaResult,
                    `${method.toUpperCase()} MFA setup initiated`,
                    {
                        method,
                        requiresVerification: mfaResult.requiresVerification || false,
                        expiresAt: mfaResult.expiresAt,
                        nextStep: mfaResult.nextStep
                    }
                )
            );

        } catch (error) {
            logger.error('MFA setup failed', {
                error: error.message,
                userId: req.params?.userId,
                method: req.body?.method,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Complete MFA setup with verification
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async completeMFASetup(req, res, next) {
        try {
            const { userId } = req.params;
            const { method, verificationCode, options = {} } = req.body;
            const requesterId = req.user.id;

            logger.info('MFA setup completion attempt', {
                userId,
                method,
                requesterId,
                hasVerificationCode: !!verificationCode
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            if (!method) {
                throw new ValidationError('MFA method is required', 'MISSING_MFA_METHOD');
            }

            if (!verificationCode) {
                throw new ValidationError('Verification code is required', 'MISSING_VERIFICATION_CODE');
            }

            // Validate verification code format based on method
            switch (method) {
                case 'totp':
                    if (!/^\d{6}$/.test(verificationCode)) {
                        throw new ValidationError('TOTP code must be 6 digits', 'INVALID_TOTP_CODE');
                    }
                    break;

                case 'sms':
                case 'email':
                    if (!/^\d{6}$/.test(verificationCode)) {
                        throw new ValidationError('Verification code must be 6 digits', 'INVALID_VERIFICATION_CODE');
                    }
                    break;

                case 'backup_codes':
                    if (!/^[A-Z0-9]{8}$/.test(verificationCode)) {
                        throw new ValidationError('Backup code format is invalid', 'INVALID_BACKUP_CODE');
                    }
                    break;
            }

            const completionResult = await UserController.#userService.completeMFASetup(
                userId,
                method,
                verificationCode,
                {
                    ...options,
                    requesterId
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    completionResult,
                    `${method.toUpperCase()} MFA setup completed successfully`,
                    {
                        method,
                        backupCodes: completionResult.backupCodes,
                        recoveryInstructions: completionResult.recoveryInstructions,
                        compliance: completionResult.compliance
                    }
                )
            );

        } catch (error) {
            logger.error('MFA setup completion failed', {
                error: error.message,
                userId: req.params?.userId,
                method: req.body?.method,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Disable MFA method for user
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async disableMFA(req, res, next) {
        try {
            const { userId } = req.params;
            const { method, reason, verificationCode } = req.body;
            const disabledBy = req.user.id;

            logger.info('MFA disable attempt', {
                userId,
                method,
                disabledBy,
                reason
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            if (!method) {
                throw new ValidationError('MFA method is required', 'MISSING_MFA_METHOD');
            }

            if (!reason || reason.trim().length < 10) {
                throw new ValidationError('Reason for disabling MFA must be at least 10 characters', 'INSUFFICIENT_REASON');
            }

            // Require verification code for security-sensitive operations
            if (userId === disabledBy && !verificationCode) {
                throw new ValidationError('Verification code is required when disabling your own MFA', 'MISSING_VERIFICATION_CODE');
            }

            const disableResult = await UserController.#userService.disableMFA(
                userId,
                method,
                disabledBy,
                {
                    reason,
                    verificationCode
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    disableResult,
                    `${method.toUpperCase()} MFA disabled successfully`,
                    {
                        method,
                        disabledBy,
                        reason,
                        compliance: disableResult.compliance,
                        remainingMethods: disableResult.remainingMethods || []
                    }
                )
            );

        } catch (error) {
            logger.error('MFA disable failed', {
                error: error.message,
                userId: req.params?.userId,
                method: req.body?.method,
                disabledBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add user to organization with role assignment
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addUserToOrganization(req, res, next) {
        try {
            const { userId } = req.params;
            const { organizationId, roles = ['member'], permissions = [], invitedBy, startDate, autoAccept = false } = req.body;
            const assignedBy = req.user.id;

            logger.info('Add user to organization attempt', {
                userId,
                organizationId,
                roles,
                assignedBy,
                autoAccept
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate organization ID format
            if (!stringHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Validate roles
            if (!Array.isArray(roles) || roles.length === 0) {
                throw new ValidationError('At least one role must be specified', 'MISSING_ROLES');
            }

            const validRoles = ['super_admin', 'admin', 'manager', 'member', 'guest'];
            const invalidRoles = roles.filter(role => !validRoles.includes(role));

            if (invalidRoles.length > 0) {
                throw new ValidationError(`Invalid roles: ${invalidRoles.join(', ')}. Valid roles: ${validRoles.join(', ')}`, 'INVALID_ROLES');
            }

            // Validate permissions structure
            if (permissions.length > 0) {
                for (const permission of permissions) {
                    if (!permission.resource || !Array.isArray(permission.actions)) {
                        throw new ValidationError('Each permission must have resource and actions array', 'INVALID_PERMISSION_STRUCTURE');
                    }
                }
            }

            // Validate start date if provided
            if (startDate && !dateHelper.isValidDate(startDate)) {
                throw new ValidationError('Invalid start date format', 'INVALID_START_DATE');
            }

            // Validate invited by if provided
            if (invitedBy && !stringHelper.isValidObjectId(invitedBy)) {
                throw new ValidationError('Invalid invitedBy user ID format', 'INVALID_INVITED_BY');
            }

            const membership = await UserController.#userService.addUserToOrganization(
                userId,
                organizationId,
                roles,
                assignedBy,
                {
                    invitedBy,
                    startDate: startDate ? new Date(startDate) : undefined,
                    permissions,
                    autoAccept,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    membership,
                    autoAccept ? 'User added to organization successfully' : 'Organization invitation sent',
                    {
                        organizationId,
                        roles,
                        autoAccepted: autoAccept,
                        permissionsCount: permissions.length,
                        invitationSent: !autoAccept
                    }
                )
            );

        } catch (error) {
            logger.error('Add user to organization failed', {
                error: error.message,
                userId: req.params?.userId,
                organizationId: req.body?.organizationId,
                assignedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Remove user from organization
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async removeUserFromOrganization(req, res, next) {
        try {
            const { userId } = req.params;
            const { organizationId, transferOwnership, reason, gracePeriod = 0 } = req.body;
            const removedBy = req.user.id;

            logger.info('Remove user from organization attempt', {
                userId,
                organizationId,
                removedBy,
                transferOwnership,
                gracePeriod
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate organization ID format
            if (!stringHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Validate reason
            if (!reason || reason.trim().length < 10) {
                throw new ValidationError('Removal reason must be at least 10 characters', 'INSUFFICIENT_REASON');
            }

            // Validate transfer ownership if provided
            if (transferOwnership && !stringHelper.isValidObjectId(transferOwnership)) {
                throw new ValidationError('Invalid transfer ownership user ID', 'INVALID_TRANSFER_USER_ID');
            }

            // Validate grace period
            if (gracePeriod < 0 || gracePeriod > 90) {
                throw new ValidationError('Grace period must be between 0 and 90 days', 'INVALID_GRACE_PERIOD');
            }

            const removalSuccess = await UserController.#userService.removeUserFromOrganization(
                userId,
                organizationId,
                removedBy,
                {
                    transferOwnership,
                    reason,
                    gracePeriod,
                    session: req.session
                }
            );

            const responseMessage = gracePeriod > 0 ?
                `User removal scheduled in ${gracePeriod} days` :
                'User removed from organization successfully';

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    {
                        success: removalSuccess,
                        userId,
                        organizationId,
                        gracePeriod,
                        transferOwnership
                    },
                    responseMessage,
                    {
                        removedBy,
                        reason,
                        effectiveDate: gracePeriod > 0 ? dateHelper.addDays(new Date(), gracePeriod) : new Date()
                    }
                )
            );

        } catch (error) {
            logger.error('Remove user from organization failed', {
                error: error.message,
                userId: req.params?.userId,
                organizationId: req.body?.organizationId,
                removedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Search users with advanced filtering
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async searchUsers(req, res, next) {
        try {
            const {
                q: query,
                email,
                name,
                status,
                roles,
                mfaEnabled,
                emailVerified,
                company,
                school,
                limit = 20,
                offset = 0,
                sortBy = 'createdAt',
                sortOrder = 'desc',
                includeDeleted = false,
                organizationId,
                includeMetrics = false
            } = req.query;
            const requesterId = req.user.id;

            logger.info('User search request', {
                query,
                filters: { email, name, status, roles, mfaEnabled },
                pagination: { limit, offset },
                sort: { sortBy, sortOrder },
                requesterId
            });

            // Validate pagination parameters
            const limitNum = parseInt(limit);
            const offsetNum = parseInt(offset);

            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                throw new ValidationError('Limit must be between 1 and 100', 'INVALID_LIMIT');
            }

            if (isNaN(offsetNum) || offsetNum < 0) {
                throw new ValidationError('Offset must be non-negative', 'INVALID_OFFSET');
            }

            // Validate sort parameters
            const validSortFields = ['createdAt', 'updatedAt', 'email', 'profile.firstName', 'profile.lastName', 'activity.lastLoginAt'];
            if (!validSortFields.includes(sortBy)) {
                throw new ValidationError(`Invalid sort field. Valid options: ${validSortFields.join(', ')}`, 'INVALID_SORT_FIELD');
            }

            if (!['asc', 'desc'].includes(sortOrder)) {
                throw new ValidationError('Sort order must be "asc" or "desc"', 'INVALID_SORT_ORDER');
            }

            // Validate organization ID if provided
            if (organizationId && !stringHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Build search parameters
            const searchParams = {};

            if (query) searchParams.textSearch = query;
            if (email) searchParams.email = email;
            if (name) searchParams.name = name;
            if (status) {
                const statusArray = Array.isArray(status) ? status : status.split(',');
                const validStatuses = ['active', 'pending', 'suspended', 'inactive', 'deleted'];
                const invalidStatuses = statusArray.filter(s => !validStatuses.includes(s));

                if (invalidStatuses.length > 0) {
                    throw new ValidationError(`Invalid status values: ${invalidStatuses.join(', ')}`, 'INVALID_STATUS');
                }

                searchParams.status = statusArray;
            }
            if (roles) {
                const rolesArray = Array.isArray(roles) ? roles : roles.split(',');
                searchParams.roles = rolesArray;
            }
            if (mfaEnabled !== undefined) {
                searchParams.mfaEnabled = mfaEnabled === 'true';
            }
            if (emailVerified !== undefined) {
                searchParams.emailVerified = emailVerified === 'true';
            }
            if (company) searchParams.company = company;
            if (school) searchParams.school = school;

            const searchResults = await UserController.#userService.searchUsers(
                searchParams,
                {
                    limit: limitNum,
                    offset: offsetNum,
                    sortBy,
                    sortOrder,
                    includeDeleted: includeDeleted === 'true',
                    requesterId,
                    organizationId,
                    includeMetrics: includeMetrics === 'true'
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    searchResults,
                    `Found ${searchResults.users.length} users`,
                    {
                        searchParams,
                        totalCount: searchResults.pagination.totalCount,
                        hasMore: searchResults.pagination.hasMore,
                        searchDuration: searchResults.metadata?.searchDuration,
                        aggregations: searchResults.aggregations
                    }
                )
            );

        } catch (error) {
            logger.error('User search failed', {
                error: error.message,
                query: req.query?.q,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get comprehensive user analytics
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getUserAnalytics(req, res, next) {
        try {
            const { organizationId, timeRange = '30d', includeSecurityMetrics = false } = req.query;
            const requesterId = req.user.id;

            logger.info('User analytics request', {
                organizationId,
                timeRange,
                includeSecurityMetrics,
                requesterId
            });

            // Validate organization ID if provided
            if (organizationId && !stringHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Validate time range format
            const timeRangePattern = /^(\d+)([dwmy])$/;
            if (!timeRangePattern.test(timeRange)) {
                throw new ValidationError('Invalid time range format. Use format like "30d", "1w", "6m", "1y"', 'INVALID_TIME_RANGE');
            }

            const analytics = await UserController.#userService.getUserAnalytics(
                {
                    organizationId,
                    timeRange,
                    includeSecurityMetrics: includeSecurityMetrics === 'true'
                },
                requesterId
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    analytics,
                    'User analytics retrieved successfully',
                    {
                        timeRange,
                        organizationId,
                        includesSecurityMetrics: includeSecurityMetrics === 'true',
                        generatedAt: new Date()
                    }
                )
            );

        } catch (error) {
            logger.error('User analytics request failed', {
                error: error.message,
                organizationId: req.query?.organizationId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Perform security assessment for user
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async performSecurityAssessment(req, res, next) {
        try {
            const { userId } = req.params;
            const { includeRecommendations = true, assessmentType = 'standard' } = req.query;
            const requesterId = req.user.id;

            logger.info('Security assessment request', {
                userId,
                assessmentType,
                includeRecommendations,
                requesterId
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate assessment type
            const validAssessmentTypes = ['standard', 'comprehensive', 'compliance', 'quick'];
            if (!validAssessmentTypes.includes(assessmentType)) {
                throw new ValidationError(`Invalid assessment type. Valid options: ${validAssessmentTypes.join(', ')}`, 'INVALID_ASSESSMENT_TYPE');
            }

            const assessment = await UserController.#userService.performUserSecurityAssessment(
                userId,
                requesterId,
                {
                    includeRecommendations: includeRecommendations === 'true',
                    assessmentType,
                    includeCompliance: true
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    assessment,
                    'Security assessment completed',
                    {
                        assessmentType,
                        overallScore: assessment.overallScore,
                        securityLevel: assessment.securityLevel,
                        recommendationsCount: assessment.recommendations?.length || 0,
                        assessmentDate: new Date()
                    }
                )
            );

        } catch (error) {
            logger.error('Security assessment failed', {
                error: error.message,
                userId: req.params?.userId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get user activity timeline
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getUserActivityTimeline(req, res, next) {
        try {
            const { userId } = req.params;
            const {
                limit = 50,
                startDate,
                endDate,
                includeAuthEvents = true,
                eventTypes
            } = req.query;
            const requesterId = req.user.id;

            logger.info('User activity timeline request', {
                userId,
                limit,
                startDate,
                endDate,
                includeAuthEvents,
                requesterId
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate limit
            const limitNum = parseInt(limit);
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
                throw new ValidationError('Limit must be between 1 and 200', 'INVALID_LIMIT');
            }

            // Validate dates if provided
            if (startDate && !dateHelper.isValidDate(startDate)) {
                throw new ValidationError('Invalid start date format', 'INVALID_START_DATE');
            }

            if (endDate && !dateHelper.isValidDate(endDate)) {
                throw new ValidationError('Invalid end date format', 'INVALID_END_DATE');
            }

            if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
                throw new ValidationError('Start date must be before end date', 'INVALID_DATE_RANGE');
            }

            // Validate event types if provided
            let eventTypesArray = [];
            if (eventTypes) {
                eventTypesArray = Array.isArray(eventTypes) ? eventTypes : eventTypes.split(',');
                const validEventTypes = ['authentication', 'logout', 'profile_update', 'settings_change', 'security_event'];
                const invalidEventTypes = eventTypesArray.filter(type => !validEventTypes.includes(type));

                if (invalidEventTypes.length > 0) {
                    throw new ValidationError(`Invalid event types: ${invalidEventTypes.join(', ')}`, 'INVALID_EVENT_TYPES');
                }
            }

            const timeline = await UserController.#userService.getUserActivityTimeline(
                userId,
                {
                    limit: limitNum,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                    includeAuthEvents: includeAuthEvents === 'true',
                    eventTypes: eventTypesArray.length > 0 ? eventTypesArray : undefined,
                    requesterId
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    timeline,
                    'Activity timeline retrieved successfully',
                    {
                        eventsCount: timeline.length,
                        timeRange: {
                            startDate: startDate || 'beginning',
                            endDate: endDate || 'now'
                        },
                        includesAuthEvents: includeAuthEvents === 'true',
                        filteredEventTypes: eventTypesArray
                    }
                )
            );

        } catch (error) {
            logger.error('User activity timeline request failed', {
                error: error.message,
                userId: req.params?.userId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get required fields for authentication strategy
     * @private
     * @static
     * @param {string} strategy - Authentication strategy
     * @returns {Array} Required fields
     */
    static #getRequiredFieldsForStrategy(strategy) {
        switch (strategy) {
            case 'local':
                return ['email', 'password'];
            case 'google':
            case 'github':
            case 'linkedin':
            case 'microsoft':
                return ['code'];
            case 'saml':
            case 'oidc':
                return ['ssoResponse'];
            case 'ldap':
                return ['username', 'password'];
            case 'jwt':
                return ['token'];
            default:
                return ['email'];
        }
    }
}

module.exports = UserController;