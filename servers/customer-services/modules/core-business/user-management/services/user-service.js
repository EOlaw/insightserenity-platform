/**
 * @fileoverview Secure User Service - Database Abstracted
 * @module servers/customer-services/modules/core-business/user-management/services/user
 * @description Enterprise-grade user service with secure database abstraction
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const validator = require('validator');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

const USER_ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    TEAM_LEAD: 'team_lead',
    EMPLOYEE: 'employee',
    CLIENT: 'client',
    CONSULTANT: 'consultant',
    CANDIDATE: 'candidate',
    PARTNER: 'partner',
    VENDOR: 'vendor',
    GUEST: 'guest'
};

const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    DELETED: 'deleted',
    PENDING: 'pending',
    BLOCKED: 'blocked',
    ARCHIVED: 'archived'
};

/**
 * User Service Class - Secure Database Operations
 * @class UserService
 */
class UserService {
    constructor() {
        this.defaultPageSize = 20;
        this.maxPageSize = 100;
        this.maxExportLimit = 10000;
        this.passwordMinLength = 8;
        this.maxLoginAttempts = 5;
        this.lockoutDuration = 2 * 60 * 60 * 1000; // 2 hours
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        this.refreshTokenExpiry = 30 * 24 * 60 * 60 * 1000; // 30 days
        
        // Database service reference
        this._dbService = null;
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

    // ============= USER CREATION AND MANAGEMENT =============

    async createUser(userData, tenantId, createdBy = null) {
        try {
            this._validateUserData(userData);

            const dbService = this._getDatabaseService();

            // Check if user already exists
            const existingUser = await dbService.userExists(userData.email, tenantId);
            if (existingUser) {
                throw new AppError('User already exists with this email', 409);
            }

            // Prepare user document aligned with schema
            const userDocument = {
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: await this._hashPassword(userData.password),
                phoneNumber: userData.phoneNumber,
                
                // Profile object (required fields)
                profile: {
                    firstName: userData.profile?.firstName,
                    lastName: userData.profile?.lastName,
                    middleName: userData.profile?.middleName,
                    displayName: userData.profile?.displayName,
                    title: userData.profile?.title,
                    bio: userData.profile?.bio,
                    dateOfBirth: userData.profile?.dateOfBirth,
                    gender: userData.profile?.gender,
                    avatar: userData.profile?.avatar,
                },

                // Account status
                accountStatus: {
                    status: userData.accountStatus?.status || 'pending',
                    reason: userData.accountStatus?.reason,
                },

                // Verification
                verification: {
                    email: {
                        verified: false,
                        token: this._generateVerificationToken(),
                        tokenExpires: new Date(Date.now() + 86400000), // 24 hours
                    }
                },

                // Preferences with proper structure
                preferences: {
                    language: userData.preferences?.language || 'en',
                    timezone: userData.preferences?.timezone || 'UTC',
                    theme: userData.preferences?.theme || 'auto',
                    notifications: {
                        email: {
                            enabled: userData.preferences?.notifications?.email?.enabled ?? true,
                            frequency: userData.preferences?.notifications?.email?.frequency || 'instant',
                            categories: {
                                security: userData.preferences?.notifications?.email?.categories?.security ?? true,
                                updates: userData.preferences?.notifications?.email?.categories?.updates ?? true,
                                marketing: userData.preferences?.notifications?.email?.categories?.marketing ?? false,
                                social: userData.preferences?.notifications?.email?.categories?.social ?? true,
                                billing: userData.preferences?.notifications?.email?.categories?.billing ?? true,
                            }
                        },
                        sms: {
                            enabled: userData.preferences?.notifications?.sms?.enabled ?? false,
                            categories: {
                                security: userData.preferences?.notifications?.sms?.categories?.security ?? true,
                                critical: userData.preferences?.notifications?.sms?.categories?.critical ?? true,
                            }
                        },
                        push: {
                            enabled: userData.preferences?.notifications?.push?.enabled ?? true,
                            tokens: userData.preferences?.notifications?.push?.tokens || []
                        },
                        inApp: {
                            enabled: userData.preferences?.notifications?.inApp?.enabled ?? true,
                            playSound: userData.preferences?.notifications?.inApp?.playSound ?? true,
                            showBadge: userData.preferences?.notifications?.inApp?.showBadge ?? true,
                        }
                    },
                    privacy: {
                        profileVisibility: userData.preferences?.privacy?.profileVisibility || 'organization',
                        showEmail: userData.preferences?.privacy?.showEmail ?? false,
                        showPhone: userData.preferences?.privacy?.showPhone ?? false,
                        showLocation: userData.preferences?.privacy?.showLocation ?? false,
                        allowDirectMessages: userData.preferences?.privacy?.allowDirectMessages ?? true,
                        allowMentions: userData.preferences?.privacy?.allowMentions ?? true,
                        dataCollection: {
                            analytics: userData.preferences?.privacy?.dataCollection?.analytics ?? true,
                            personalization: userData.preferences?.privacy?.dataCollection?.personalization ?? true,
                            thirdParty: userData.preferences?.privacy?.dataCollection?.thirdParty ?? false,
                        }
                    }
                },

                // Organizations
                organizations: userData.organizations || [],

                // Compliance
                compliance: {
                    gdpr: {
                        consentGiven: userData.compliance?.gdpr?.consentGiven || false,
                        consentDate: userData.compliance?.gdpr?.consentGiven ? new Date() : null,
                    },
                    terms: {
                        accepted: userData.compliance?.terms?.accepted || false,
                        acceptedAt: userData.compliance?.terms?.accepted ? new Date() : null,
                        version: userData.compliance?.terms?.version,
                    },
                    privacy: {
                        accepted: userData.compliance?.privacy?.accepted || false,
                        acceptedAt: userData.compliance?.privacy?.accepted ? new Date() : null,
                        version: userData.compliance?.privacy?.version,
                    },
                    marketing: {
                        consent: userData.compliance?.marketing?.consent || false,
                        consentDate: userData.compliance?.marketing?.consent ? new Date() : null,
                        channels: {
                            email: userData.compliance?.marketing?.channels?.email ?? false,
                            sms: userData.compliance?.marketing?.channels?.sms ?? false,
                            push: userData.compliance?.marketing?.channels?.push ?? false,
                        }
                    }
                },

                // Metadata
                metadata: {
                    source: userData.metadata?.source || 'api',
                    referrer: userData.metadata?.referrer,
                    campaign: userData.metadata?.campaign,
                    tags: userData.metadata?.tags || [],
                    flags: {
                        isVip: userData.metadata?.flags?.isVip ?? false,
                        isBetaTester: userData.metadata?.flags?.isBetaTester ?? false,
                        isInfluencer: userData.metadata?.flags?.isInfluencer ?? false,
                        requiresReview: userData.metadata?.flags?.requiresReview ?? false,
                    }
                },

                // Security
                security: {
                    loginAttempts: {
                        count: 0,
                        lastAttempt: null,
                        lockUntil: null,
                    },
                    riskScore: 0,
                    threatLevel: 'none',
                },

                // Activity
                activity: {
                    loginCount: 0,
                    activitySummary: {
                        totalLogins: 0,
                        totalActions: 0,
                        lastWeek: 0,
                        lastMonth: 0,
                    }
                },

                // API Access
                apiAccess: {
                    enabled: false,
                    keys: [],
                    webhooks: [],
                },
            };

            // Create user through secure database service
            const newUser = await dbService.createUser(userDocument, tenantId);

            await this._logAuditEvent('USER_CREATED', {
                userId: newUser._id,
                tenantId,
                createdBy,
                userEmail: newUser.email,
            });

            return newUser.toSafeJSON ? newUser.toSafeJSON() : this._sanitizeUserOutput(newUser);

        } catch (error) {
            console.error('Error creating user:', error);

            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern || {})[0] || 'field';
                throw new AppError(`User with this ${field} already exists`, 409);
            }

            throw error;
        }
    }

    async bulkCreateUsers(usersData, tenantId, createdBy) {
        if (!Array.isArray(usersData) || usersData.length === 0) {
            throw AppError.validation('Invalid users data');
        }

        if (usersData.length > 1000) {
            throw AppError.validation('Cannot create more than 1000 users at once');
        }

        const results = {
            successful: [],
            failed: [],
            total: usersData.length
        };

        const batchSize = 10;
        for (let i = 0; i < usersData.length; i += batchSize) {
            const batch = usersData.slice(i, i + batchSize);

            await Promise.all(batch.map(async (userData) => {
                try {
                    const user = await this.createUser(userData, tenantId, createdBy);
                    results.successful.push({
                        email: user.email,
                        id: user._id || user.id,
                        username: user.username
                    });
                } catch (error) {
                    results.failed.push({
                        email: userData.email,
                        error: error.message,
                        data: userData
                    });
                }
            }));
        }

        return results;
    }

    async getUserById(userId, tenantId, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            const user = await dbService.findUserById(userId, tenantId, options);

            if (!user) {
                throw AppError.notFound('User');
            }

            // Update last activity if method exists
            if (typeof user.updateActivity === 'function') {
                await user.updateActivity();
            }

            return options.includeSensitive ? user.toObject() : this._sanitizeUserOutput(user);

        } catch (error) {
            throw error;
        }
    }

    async getUsers(tenantId, options = {}) {
        try {
            const {
                page = 1,
                limit = this.defaultPageSize,
                sort = '-createdAt',
                filters = {},
                search = null,
                includeStats = false
            } = options;

            const validatedLimit = Math.min(limit, this.maxPageSize);

            const dbService = this._getDatabaseService();
            const result = await dbService.findUsers(tenantId, {
                page,
                limit: validatedLimit,
                sort,
                filters,
                search
            });

            // Sanitize user data
            result.users = result.users.map(user => this._sanitizeUserOutput(user));

            if (includeStats) {
                result.statistics = await dbService.getUserStatistics(tenantId, filters);
            }

            return result;

        } catch (error) {
            throw error;
        }
    }

    async updateUser(userId, updates, tenantId, updatedBy = null) {
        try {
            const dbService = this._getDatabaseService();
            
            // Get current user
            const currentUser = await dbService.findUserById(userId, tenantId);
            if (!currentUser) {
                throw AppError.notFound('User');
            }

            await this._validateUpdatePermissions(currentUser, updates, updatedBy);

            // Remove restricted fields
            const restrictedFields = [
                'password', 'email', 'tenantId', 'createdAt',
                'createdBy', 'emailVerificationToken', 'passwordResetToken'
            ];
            restrictedFields.forEach(field => delete updates[field]);

            // Add update metadata
            updates.updatedBy = updatedBy;
            updates.updatedAt = new Date();

            const updatedUser = await dbService.updateUser(userId, updates, tenantId);

            await this._logUserActivity(userId, 'USER_UPDATED', {
                updatedBy,
                changes: Object.keys(updates)
            });

            return this._sanitizeUserOutput(updatedUser);

        } catch (error) {
            throw error;
        }
    }

    async deleteUser(userId, tenantId, deletedBy, options = {}) {
        try {
            const dbService = this._getDatabaseService();
            
            const user = await dbService.findUserById(userId, tenantId);
            if (!user) {
                throw AppError.notFound('User');
            }

            const result = await dbService.deleteUser(userId, tenantId, options);

            await this._logUserActivity(userId, 'USER_DELETED', {
                deletedBy,
                method: options.hardDelete ? 'hard' : 'soft'
            });

            return {
                message: 'User deleted successfully',
                method: options.hardDelete ? 'permanent' : 'soft'
            };

        } catch (error) {
            throw error;
        }
    }

    // ============= AUTHENTICATION AND SECURITY =============

    async authenticateUser(email, password, tenantId, context = {}) {
        try {
            const {
                ip = null,
                userAgent = null,
                device = null,
                location = null,
                method = 'password'
            } = context;

            const dbService = this._getDatabaseService();
            const user = await dbService.findUserByCredentials(email, tenantId);

            if (!user) {
                await this._logFailedLogin(email, tenantId, 'User not found', context);
                throw AppError.unauthorized('Invalid credentials');
            }

            if (user.isLocked) {
                const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);
                throw AppError.unauthorized(`Account is locked. Try again in ${remainingTime} minutes`);
            }

            if (user.accountStatus?.status === USER_STATUS.SUSPENDED) {
                throw AppError.forbidden('Account is suspended. Please contact support');
            }

            if (user.accountStatus?.status === USER_STATUS.BLOCKED) {
                throw AppError.forbidden('Account is blocked. Please contact support');
            }

            if (user.accountStatus?.status === USER_STATUS.INACTIVE) {
                throw AppError.forbidden('Account is inactive. Please contact support to reactivate');
            }

            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                if (typeof user.incrementLoginAttempts === 'function') {
                    await user.incrementLoginAttempts();
                }

                const attemptsRemaining = this.maxLoginAttempts - (user.security?.loginAttempts?.count || 0);
                if (attemptsRemaining <= 0) {
                    throw AppError.unauthorized('Account locked due to too many failed attempts');
                } else {
                    throw AppError.unauthorized(`Invalid credentials. ${attemptsRemaining} attempts remaining`);
                }
            }

            // Generate tokens
            const accessToken = this._generateAccessToken(user);
            const refreshToken = this._generateRefreshToken(user);

            // Record successful login
            if (typeof user.recordLogin === 'function') {
                await user.recordLogin({ ip, userAgent, device, location, method });
            }

            const response = {
                user: this._sanitizeUserOutput(user),
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                },
                requiresAction: []
            };

            // Add required actions
            if (!user.verification?.email?.verified) response.requiresAction.push('VERIFY_EMAIL');
            if (user.mfa?.enabled) {
                response.requiresAction.push('TWO_FACTOR_AUTH');
                delete response.tokens;
                response.tempToken = this._generateTempToken(user._id);
            }

            return response;

        } catch (error) {
            throw error;
        }
    }

    async changePassword(userId, currentPassword, newPassword, tenantId) {
        try {
            const dbService = this._getDatabaseService();
            const user = await dbService.findUserById(userId, tenantId, { select: '+password +passwordHistory' });

            if (!user) {
                throw AppError.notFound('User');
            }

            const isValid = await user.comparePassword(currentPassword);
            if (!isValid) {
                throw AppError.unauthorized('Current password is incorrect');
            }

            this._validatePassword(newPassword);

            if (await user.comparePassword(newPassword)) {
                throw AppError.validation('New password must be different from current password');
            }

            // Update password directly on user document
            user.password = newPassword;
            await user.save();

            await this._sendPasswordChangeNotification(user);
            await this._logUserActivity(userId, 'PASSWORD_CHANGED', { method: 'user_initiated' });

            return {
                message: 'Password changed successfully',
                requiresRelogin: true
            };

        } catch (error) {
            throw error;
        }
    }

    async requestPasswordReset(email, tenantId) {
        try {
            const dbService = this._getDatabaseService();
            const User = dbService.getUserModel();
            
            const user = await User.findOne({
                email: email.toLowerCase(),
                'accountStatus.status': { $ne: 'deleted' }
            });

            if (!user) {
                return { message: 'If the email exists, a password reset link has been sent' };
            }

            const resetToken = await user.generatePasswordResetToken();

            await this._sendPasswordResetEmail(user, resetToken);
            await this._logUserActivity(user._id, 'PASSWORD_RESET_REQUESTED', { email });

            return { message: 'If the email exists, a password reset link has been sent' };

        } catch (error) {
            throw error;
        }
    }

    async resetPassword(resetToken, newPassword, tenantId) {
        try {
            this._validatePassword(newPassword);

            const dbService = this._getDatabaseService();
            const User = dbService.getUserModel();
            
            const user = await User.findOne({
                'security.passwordReset.token': await this._hashToken(resetToken),
                'security.passwordReset.tokenExpires': { $gt: Date.now() },
                'accountStatus.status': { $nin: ['deleted', 'archived'] }
            }).select('+password +passwordHistory');

            if (!user) {
                throw AppError.unauthorized('Invalid or expired reset token');
            }

            await user.resetPassword(resetToken, newPassword);

            await this._sendPasswordResetConfirmation(user);
            await this._logUserActivity(user._id, 'PASSWORD_RESET_COMPLETED', { method: 'reset_token' });

            return { message: 'Password has been reset successfully' };

        } catch (error) {
            throw error;
        }
    }

    // ============= USER SEARCH AND FILTERING =============

    async searchUsers(tenantId, searchTerm, options = {}) {
        try {
            const {
                page = 1,
                limit = this.defaultPageSize,
                filters = {}
            } = options;

            const dbService = this._getDatabaseService();
            const result = await dbService.findUsers(tenantId, {
                page,
                limit,
                search: searchTerm,
                filters
            });

            result.users = result.users.map(user => this._sanitizeUserOutput(user));

            return {
                ...result,
                searchTerm,
                filters
            };

        } catch (error) {
            throw error;
        }
    }

    async getUsersByRole(tenantId, role, options = {}) {
        return await this.getUsers(tenantId, {
            ...options,
            filters: { ...options.filters, 'organizations.roles.roleName': role }
        });
    }

    async getUsersByDepartment(tenantId, department, options = {}) {
        return await this.getUsers(tenantId, {
            ...options,
            filters: { ...options.filters, 'organizations.departmentId': department }
        });
    }

    async getUsersByManager(tenantId, managerId, options = {}) {
        return await this.getUsers(tenantId, {
            ...options,
            filters: { ...options.filters, 'organizations.manager': managerId }
        });
    }

    // ============= USER STATISTICS =============

    async getUserStatistics(tenantId, filters = {}) {
        try {
            const dbService = this._getDatabaseService();
            return await dbService.getUserStatistics(tenantId, filters);
        } catch (error) {
            throw error;
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Validate user data against schema requirements
     * @private
     */
    _validateUserData(userData) {
        const errors = [];

        // Check required profile fields (as per schema)
        if (!userData.profile?.firstName) {
            errors.push('First name is required');
        }
        
        if (!userData.profile?.lastName) {
            errors.push('Last name is required');
        }

        // Check email
        if (!userData.email) {
            errors.push('Email is required');
        } else if (!validator.isEmail(userData.email)) {
            errors.push('Invalid email format');
        }

        // Check password
        if (!userData.password) {
            errors.push('Password is required');
        } else {
            if (userData.password.length < this.passwordMinLength) {
                errors.push(`Password must be at least ${this.passwordMinLength} characters`);
            }
            if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(userData.password)) {
                errors.push('Password must contain uppercase, lowercase, number, and special character');
            }
        }

        if (errors.length > 0) {
            throw AppError.validation('Validation failed', errors);
        }
    }

    _validatePassword(password) {
        if (password.length < this.passwordMinLength) {
            throw AppError.validation(`Password must be at least ${this.passwordMinLength} characters`);
        }

        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)) {
            throw AppError.validation('Password must contain uppercase, lowercase, number, and special character');
        }
    }

    _sanitizeUserOutput(user) {
        if (!user) return null;

        if (user.toSafeJSON) {
            return user.toSafeJSON();
        }

        const userObject = user.toObject ? user.toObject() : user;
        
        // Remove sensitive fields
        delete userObject.password;
        delete userObject.passwordHistory;
        delete userObject.security?.passwordReset;
        delete userObject.verification?.email?.token;
        delete userObject.verification?.phone?.code;
        delete userObject.mfa?.methods;
        delete userObject.apiAccess?.keys;
        delete userObject.authProviders;
        delete userObject.searchTokens;
        delete userObject.__v;

        return userObject;
    }

    async _validateUpdatePermissions(user, updates, updatedBy) {
        // Add permission validation logic here
        return true;
    }

    async _hashPassword(password) {
        const saltRounds = 10;
        return await bcrypt.hash(password, saltRounds);
    }

    async _hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    _generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    _generateAccessToken(user) {
        return jwt.sign(
            { 
                userId: user._id,
                email: user.email,
                tenantId: user.organizations?.[0]?.tenantId
            },
            process.env.JWT_SECRET || 'customer-jwt-secret',
            { expiresIn: '24h' }
        );
    }

    _generateRefreshToken(user) {
        return jwt.sign(
            { 
                userId: user._id,
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

    // Placeholder methods for external services
    async _logUserActivity(userId, action, metadata = {}) {
        console.log(`User activity: ${action}`, { userId, ...metadata });
    }

    async _sendPasswordChangeNotification(user) {
        console.log(`Sending password change notification to ${user.email}`);
    }

    async _sendPasswordResetEmail(user, resetToken) {
        console.log(`Sending password reset email to ${user.email}`);
    }

    async _sendPasswordResetConfirmation(user) {
        console.log(`Sending password reset confirmation to ${user.email}`);
    }

    async _logFailedLogin(email, tenantId, reason, context) {
        console.log(`Failed login attempt for ${email}`, { reason, ...context });
    }

    async _logAuditEvent(eventType, data) {
        try {
            console.log(`Audit Event: ${eventType}`, data);
        } catch (error) {
            console.error('Failed to log audit event:', error);
        }
    }
}

module.exports = new UserService();