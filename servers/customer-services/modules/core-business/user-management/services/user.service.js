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

            // Prepare user document
            const userDocument = {
                ...userData,
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: await this._hashPassword(userData.password),
                status: userData.status || 'active',
                emailVerified: false,
                verificationToken: this._generateVerificationToken(),
                metadata: {
                    ...userData.metadata,
                    createdBy: createdBy || 'system',
                    createdAt: new Date(),
                    lastUpdated: new Date(),
                    lastUpdatedBy: createdBy || 'system',
                    version: 1,
                    source: userData.metadata?.source || 'api',
                    ipAddress: userData.metadata?.ipAddress
                },
                security: {
                    ...userData.security,
                    loginAttempts: 0,
                    lastLogin: null,
                    lastPasswordChange: new Date(),
                    passwordHistory: [],
                    mfaEnabled: false,
                    apiKeys: []
                },
                preferences: {
                    ...this._getDefaultPreferences(),
                    ...userData.preferences
                },
                professional: {
                    ...userData.professional,
                    skills: userData.professional?.skills || [],
                    certifications: userData.professional?.certifications || [],
                    education: userData.professional?.education || []
                },
                compliance: {
                    gdprConsent: userData.compliance?.gdprConsent || false,
                    gdprConsentDate: userData.compliance?.gdprConsent ? new Date() : null,
                    marketingConsent: userData.compliance?.marketingConsent || false,
                    dataRetentionConsent: userData.compliance?.dataRetentionConsent || false,
                    termsAccepted: userData.compliance?.termsAccepted || false,
                    termsAcceptedDate: userData.compliance?.termsAccepted ? new Date() : null,
                    privacyPolicyAccepted: userData.compliance?.privacyPolicyAccepted || false,
                    privacyPolicyAcceptedDate: userData.compliance?.privacyPolicyAccepted ? new Date() : null
                }
            };

            // Create user through secure database service
            const newUser = await dbService.createUser(userDocument, tenantId);

            await this._logAuditEvent('USER_CREATED', {
                userId: newUser._id,
                tenantId,
                createdBy,
                userEmail: newUser.email,
                userRole: newUser.role
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

            if (user.status === USER_STATUS.SUSPENDED) {
                throw AppError.forbidden('Account is suspended. Please contact support');
            }

            if (user.status === USER_STATUS.BLOCKED) {
                throw AppError.forbidden('Account is blocked. Please contact support');
            }

            if (user.status === USER_STATUS.INACTIVE) {
                throw AppError.forbidden('Account is inactive. Please contact support to reactivate');
            }

            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                if (typeof user.recordFailedLogin === 'function') {
                    await user.recordFailedLogin({ ip, userAgent, reason: 'Invalid password' });
                }

                const attemptsRemaining = this.maxLoginAttempts - user.loginAttempts;
                if (attemptsRemaining <= 0) {
                    throw AppError.unauthorized('Account locked due to too many failed attempts');
                } else {
                    throw AppError.unauthorized(`Invalid credentials. ${attemptsRemaining} attempts remaining`);
                }
            }

            // Generate tokens
            const accessToken = user.generateAuthToken({
                audience: 'customer-services',
                expiresIn: '24h'
            });

            const refreshToken = await user.generateRefreshToken({
                ip, userAgent, deviceId: device
            });

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
            if (user.mustChangePassword) response.requiresAction.push('CHANGE_PASSWORD');
            if (!user.emailVerified) response.requiresAction.push('VERIFY_EMAIL');
            if (!user.phoneVerified && user.profile?.phoneNumbers?.length > 0) response.requiresAction.push('VERIFY_PHONE');

            if (user.twoFactorEnabled) {
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

            // Update password
            const updates = {
                password: await this._hashPassword(newPassword),
                passwordChangedAt: new Date(),
                mustChangePassword: false,
                refreshTokens: [] // Clear all refresh tokens
            };

            await dbService.updateUser(userId, updates, tenantId);

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
            const user = await dbService.findUserByCredentials(email, tenantId);

            if (!user) {
                return { message: 'If the email exists, a password reset link has been sent' };
            }

            const resetToken = user.generatePasswordResetToken();
            await user.save();

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

            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            const dbService = this._getDatabaseService();

            // Find user by reset token (would need custom method)
            const User = dbService.getUserModel();
            const user = await User.findOne({
                passwordResetToken: hashedToken,
                passwordResetExpires: { $gt: Date.now() },
                tenantId,
                status: { $nin: [USER_STATUS.DELETED, USER_STATUS.ARCHIVED] }
            }).select('+passwordHistory');

            if (!user) {
                throw AppError.unauthorized('Invalid or expired reset token');
            }

            // Update password
            user.password = await this._hashPassword(newPassword);
            user.passwordChangedAt = new Date();
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            user.mustChangePassword = false;
            user.refreshTokens = [];

            await user.save();

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
            filters: { ...options.filters, role }
        });
    }

    async getUsersByDepartment(tenantId, department, options = {}) {
        return await this.getUsers(tenantId, {
            ...options,
            filters: { ...options.filters, 'professional.department': department }
        });
    }

    async getUsersByManager(tenantId, managerId, options = {}) {
        return await this.getUsers(tenantId, {
            ...options,
            filters: { ...options.filters, 'professional.manager': managerId }
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

    _validateUserData(userData) {
        const errors = [];

        if (!userData.firstName) errors.push('First name is required');
        if (!userData.lastName) errors.push('Last name is required');
        if (!userData.email) errors.push('Email is required');
        if (!userData.password) errors.push('Password is required');

        if (userData.email && !validator.isEmail(userData.email)) {
            errors.push('Invalid email format');
        }

        if (userData.password) {
            if (userData.password.length < this.passwordMinLength) {
                errors.push(`Password must be at least ${this.passwordMinLength} characters`);
            }
            if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(userData.password)) {
                errors.push('Password must contain uppercase, lowercase, and numbers');
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
        delete userObject.passwordResetToken;
        delete userObject.passwordResetExpires;
        delete userObject.emailVerificationToken;
        delete userObject.emailVerificationExpires;
        delete userObject.twoFactorSecret;
        delete userObject.refreshTokens;
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

    _generateVerificationToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    _generateTempToken(userId) {
        return jwt.sign(
            { userId, type: 'temp' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );
    }

    _getDefaultPreferences() {
        return {
            language: 'en',
            timezone: 'UTC',
            theme: 'light',
            notifications: {
                email: true,
                push: false,
                sms: false,
                inApp: true
            },
            privacy: {
                profileVisible: true,
                showEmail: false,
                showPhone: false,
                showLocation: false
            }
        };
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