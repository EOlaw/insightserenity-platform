/**
 * @fileoverview Enterprise Token Management Service
 * @module shared/lib/auth/services/token-service
 * @description Comprehensive token generation, validation, and management with rotation
 * @version 2.0.0
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');
const database = require('../../database');
const HashService = require('../../security/encryption/hash-service');

/**
 * Token Types Enum
 * @enum {string}
 */
const TOKEN_TYPES = {
    ACCESS: 'access',
    REFRESH: 'refresh',
    TEMP: 'temp',
    API: 'api',
    RESET: 'reset',
    VERIFICATION: 'verification',
    MAGIC_LINK: 'magic_link',
    INVITATION: 'invitation',
    DEVICE: 'device',
    WEBHOOK: 'webhook',
    ONE_TIME: 'one_time'
};

/**
 * Token Status Enum
 * @enum {string}
 */
const TOKEN_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
    USED: 'used',
    PENDING: 'pending'
};

/**
 * Token Purpose Enum
 * @enum {string}
 */
const TOKEN_PURPOSE = {
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    PASSWORD_RESET: 'password_reset',
    EMAIL_VERIFICATION: 'email_verification',
    PHONE_VERIFICATION: 'phone_verification',
    TWO_FACTOR: 'two_factor',
    API_ACCESS: 'api_access',
    WEBHOOK: 'webhook',
    MAGIC_LINK: 'magic_link',
    INVITATION: 'invitation',
    DEVICE_TRUST: 'device_trust'
};

/**
 * Enterprise Token Management Service
 * Handles token generation, validation, rotation, and lifecycle management
 * @class TokenService
 */
class TokenService {
    constructor() {
        // JWT Configuration
        this.jwtConfig = {
            secret: config.auth?.jwt?.secret || process.env.JWT_SECRET,
            algorithm: config.auth?.jwt?.algorithm || 'HS256',
            issuer: config.auth?.jwt?.issuer || 'insightserenity',
            audience: config.auth?.jwt?.audience || 'insightserenity-api'
        };

        // Token Expiry Configuration
        this.expiryConfig = {
            accessToken: config.auth?.jwt?.expiresIn || '15m',
            refreshToken: config.auth?.jwt?.refreshExpiresIn || '30d',
            tempToken: config.auth?.jwt?.tempExpiresIn || '5m',
            apiToken: config.auth?.jwt?.apiExpiresIn || '365d',
            resetToken: config.auth?.passwordResetTokenExpiry || 3600000, // 1 hour
            verificationToken: config.auth?.emailVerificationTokenExpiry || 86400000, // 24 hours
            magicLinkToken: config.auth?.magicLinkExpiry || 900000, // 15 minutes
            invitationToken: config.auth?.invitationExpiry || 604800000, // 7 days
            deviceToken: config.auth?.deviceTokenExpiry || 2592000000, // 30 days
            oneTimeToken: config.auth?.oneTimeTokenExpiry || 300000 // 5 minutes
        };

        // Token Rotation Configuration
        this.rotationConfig = {
            enableRotation: config.auth?.enableTokenRotation !== false,
            rotationThreshold: config.auth?.rotationThreshold || 0.5, // 50% of lifetime
            maxRotations: config.auth?.maxRotations || 5,
            gracePeriod: config.auth?.rotationGracePeriod || 60000 // 1 minute
        };

        // Security Configuration
        this.securityConfig = {
            enableFingerprinting: config.auth?.enableFingerprinting !== false,
            enableIPBinding: config.auth?.enableIPBinding || false,
            enableUserAgentBinding: config.auth?.enableUserAgentBinding || false,
            maxTokensPerUser: config.auth?.maxTokensPerUser || 10
        };

        // Statistics
        this.stats = {
            tokensGenerated: 0,
            tokensValidated: 0,
            tokensRevoked: 0,
            tokensExpired: 0,
            tokensRotated: 0,
            validationFailures: 0
        };

        // Token cache for performance
        this.tokenCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes

        // Initialize database
        this._initializeDatabase();
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.db = database;
            if (!this.db.isInitialized) {
                await this.db.initialize();
            }
            logger.info('TokenService: Database initialized successfully');
        } catch (error) {
            logger.error('TokenService: Database initialization failed', { error: error.message });
        }
    }

    // ============= ACCESS TOKEN METHODS =============

    /**
     * Generate access token
     * @param {Object} user - User object
     * @param {Object} [options] - Token options
     * @returns {string} JWT access token
     */
    generateAccessToken(user, options = {}) {
        try {
            const payload = {
                id: user._id || user.id,
                email: user.email,
                role: this._getUserRole(user),
                roles: this._getAllUserRoles(user),
                tenantId: options.tenantId || this._getPrimaryTenantId(user),
                organizationId: this._getPrimaryOrganizationId(user),
                type: TOKEN_TYPES.ACCESS,
                purpose: TOKEN_PURPOSE.AUTHENTICATION,
                tokenId: crypto.randomBytes(16).toString('hex'),
                iat: Math.floor(Date.now() / 1000)
            };

            // Add security bindings if enabled
            if (this.securityConfig.enableIPBinding && options.ip) {
                payload.ip = options.ip;
            }

            if (this.securityConfig.enableUserAgentBinding && options.userAgent) {
                payload.userAgent = this._hashUserAgent(options.userAgent);
            }

            if (this.securityConfig.enableFingerprinting && options.fingerprint) {
                payload.fingerprint = options.fingerprint;
            }

            // Add custom claims
            if (options.customClaims) {
                Object.assign(payload, options.customClaims);
            }

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.accessToken,
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Access token generated', {
                userId: payload.id,
                tokenId: payload.tokenId
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate access token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Generate refresh token with rotation support
     * @param {Object} user - User object
     * @param {Object} [options] - Token options
     * @returns {string} JWT refresh token
     */
    generateRefreshToken(user, options = {}) {
        try {
            const tokenFamily = options.tokenFamily || crypto.randomBytes(16).toString('hex');
            
            const payload = {
                id: user._id || user.id,
                type: TOKEN_TYPES.REFRESH,
                purpose: TOKEN_PURPOSE.AUTHENTICATION,
                tokenId: crypto.randomBytes(16).toString('hex'),
                tokenFamily: tokenFamily,
                rotationCount: options.rotationCount || 0,
                iat: Math.floor(Date.now() / 1000)
            };

            // Add tenant information
            if (options.tenantId) {
                payload.tenantId = options.tenantId;
            }

            // Add security bindings
            if (this.securityConfig.enableIPBinding && options.ip) {
                payload.ip = options.ip;
            }

            if (this.securityConfig.enableFingerprinting && options.fingerprint) {
                payload.fingerprint = options.fingerprint;
            }

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.refreshToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Refresh token generated', {
                userId: payload.id,
                tokenId: payload.tokenId,
                tokenFamily: tokenFamily
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate refresh token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Generate temporary token for MFA challenges
     * @param {Object} user - User object
     * @param {string} tenantId - Tenant identifier
     * @param {Object} [options] - Token options
     * @returns {string} JWT temporary token
     */
    generateTempToken(user, tenantId, options = {}) {
        try {
            const payload = {
                id: user._id || user.id,
                email: user.email,
                tenantId: tenantId,
                type: TOKEN_TYPES.TEMP,
                purpose: TOKEN_PURPOSE.TWO_FACTOR,
                tokenId: crypto.randomBytes(16).toString('hex'),
                temp: true,
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.tempToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Temp token generated', {
                userId: payload.id,
                tokenId: payload.tokenId
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate temp token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    // ============= API TOKEN METHODS =============

    /**
     * Generate API token for programmatic access
     * @param {Object} user - User object
     * @param {string} name - Token name/description
     * @param {Array<string>} scopes - Token scopes/permissions
     * @param {Object} [options] - Token options
     * @returns {Object} API token and metadata
     */
    async generateApiToken(user, name, scopes = [], options = {}) {
        try {
            const tokenId = crypto.randomBytes(16).toString('hex');
            const tokenSecret = crypto.randomBytes(32).toString('hex');
            
            // Create token string: sk_<env>_<tokenId>_<secret>
            const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
            const apiToken = `sk_${env}_${tokenId}_${tokenSecret}`;

            // Hash the token for storage
            const hashedToken = await HashService.hashToken(apiToken);

            const payload = {
                id: user._id || user.id,
                email: user.email,
                type: TOKEN_TYPES.API,
                purpose: TOKEN_PURPOSE.API_ACCESS,
                tokenId: tokenId,
                name: name,
                scopes: scopes,
                iat: Math.floor(Date.now() / 1000)
            };

            // Add tenant information
            if (options.tenantId) {
                payload.tenantId = options.tenantId;
            }

            // Store token metadata in database
            const tokenMetadata = {
                userId: user._id || user.id,
                tokenId: tokenId,
                hashedToken: hashedToken,
                name: name,
                scopes: scopes,
                type: TOKEN_TYPES.API,
                status: TOKEN_STATUS.ACTIVE,
                createdAt: new Date(),
                lastUsedAt: null,
                expiresAt: options.expiresAt || new Date(Date.now() + this.expiryConfig.apiToken),
                metadata: {
                    createdBy: options.createdBy,
                    ipAddress: options.ip,
                    userAgent: options.userAgent
                }
            };

            // TODO: Store tokenMetadata in database collection

            this.stats.tokensGenerated++;
            logger.info('API token generated', {
                userId: payload.id,
                tokenId: tokenId,
                name: name,
                scopes: scopes
            });

            return {
                token: apiToken,
                tokenId: tokenId,
                name: name,
                scopes: scopes,
                expiresAt: tokenMetadata.expiresAt,
                createdAt: tokenMetadata.createdAt
            };

        } catch (error) {
            logger.error('Failed to generate API token', { error: error.message });
            throw new AppError('API token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Validate API token
     * @param {string} token - API token
     * @returns {Promise<Object>} Token payload
     */
    async validateApiToken(token) {
        try {
            // Parse token format: sk_<env>_<tokenId>_<secret>
            const parts = token.split('_');
            if (parts.length !== 4 || parts[0] !== 'sk') {
                throw new AppError('Invalid API token format', 401, 'INVALID_TOKEN_FORMAT');
            }

            const tokenId = parts[2];

            // Check cache
            const cached = this._getCachedToken(tokenId);
            if (cached) {
                return cached;
            }

            // Hash the full token
            const hashedToken = await HashService.hashToken(token);

            // TODO: Retrieve token metadata from database
            // const tokenMetadata = await TokenModel.findOne({ tokenId, hashedToken });
            
            // Mock token metadata for now
            const tokenMetadata = {
                userId: 'mock-user-id',
                tokenId: tokenId,
                scopes: ['read', 'write'],
                status: TOKEN_STATUS.ACTIVE,
                expiresAt: new Date(Date.now() + 86400000)
            };

            if (!tokenMetadata) {
                throw new AppError('Invalid API token', 401, 'INVALID_TOKEN');
            }

            // Check token status
            switch (tokenMetadata.status) {
                case TOKEN_STATUS.REVOKED:
                    throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
                case TOKEN_STATUS.EXPIRED:
                    throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
                case TOKEN_STATUS.USED:
                    throw new AppError('One-time token already used', 401, 'TOKEN_USED');
                case TOKEN_STATUS.ACTIVE:
                    break;
                default:
                    throw new AppError('Invalid token status', 401, 'INVALID_TOKEN_STATUS');
            }

            // Check expiration
            if (tokenMetadata.expiresAt && new Date() > tokenMetadata.expiresAt) {
                throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
            }

            // Update last used timestamp
            // await TokenModel.updateOne({ tokenId }, { lastUsedAt: new Date() });

            const payload = {
                id: tokenMetadata.userId,
                type: TOKEN_TYPES.API,
                tokenId: tokenId,
                scopes: tokenMetadata.scopes
            };

            // Cache the validated token
            this._cacheToken(tokenId, payload);

            this.stats.tokensValidated++;
            return payload;

        } catch (error) {
            this.stats.validationFailures++;
            logger.error('API token validation failed', { error: error.message });
            throw error;
        }
    }

    // ============= SPECIAL TOKEN METHODS =============

    /**
     * Generate password reset token
     * @returns {string} Reset token
     */
    generateResetToken() {
        const token = crypto.randomBytes(32).toString('hex');
        this.stats.tokensGenerated++;
        logger.debug('Password reset token generated');
        return token;
    }

    /**
     * Generate email verification token
     * @returns {string} Verification token
     */
    generateVerificationToken() {
        const token = crypto.randomBytes(32).toString('hex');
        this.stats.tokensGenerated++;
        logger.debug('Email verification token generated');
        return token;
    }

    /**
     * Generate magic link token
     * @param {Object} user - User object
     * @param {string} purpose - Token purpose
     * @param {Object} [options] - Token options
     * @returns {string} Magic link token
     */
    generateMagicLinkToken(user, purpose, options = {}) {
        try {
            const payload = {
                id: user._id || user.id,
                email: user.email,
                type: TOKEN_TYPES.MAGIC_LINK,
                purpose: purpose,
                tokenId: crypto.randomBytes(16).toString('hex'),
                oneTime: true,
                iat: Math.floor(Date.now() / 1000)
            };

            // Add security bindings
            if (options.ip) {
                payload.ip = options.ip;
            }

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.magicLinkToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Magic link token generated', {
                userId: payload.id,
                tokenId: payload.tokenId,
                purpose: purpose
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate magic link token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Generate invitation token
     * @param {string} email - Invitee email
     * @param {string} organizationId - Organization ID
     * @param {Array<string>} roles - Assigned roles
     * @param {Object} [options] - Token options
     * @returns {string} Invitation token
     */
    generateInvitationToken(email, organizationId, roles = [], options = {}) {
        try {
            const payload = {
                email: email.toLowerCase(),
                organizationId: organizationId,
                roles: roles,
                type: TOKEN_TYPES.INVITATION,
                purpose: TOKEN_PURPOSE.INVITATION,
                tokenId: crypto.randomBytes(16).toString('hex'),
                invitedBy: options.invitedBy,
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.invitationToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Invitation token generated', {
                email: email,
                tokenId: payload.tokenId,
                organizationId: organizationId
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate invitation token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Generate device trust token
     * @param {Object} user - User object
     * @param {string} deviceFingerprint - Device fingerprint
     * @param {Object} [options] - Token options
     * @returns {string} Device token
     */
    generateDeviceToken(user, deviceFingerprint, options = {}) {
        try {
            const payload = {
                id: user._id || user.id,
                type: TOKEN_TYPES.DEVICE,
                purpose: TOKEN_PURPOSE.DEVICE_TRUST,
                deviceFingerprint: deviceFingerprint,
                tokenId: crypto.randomBytes(16).toString('hex'),
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.deviceToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('Device token generated', {
                userId: payload.id,
                tokenId: payload.tokenId,
                deviceFingerprint: deviceFingerprint
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate device token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    /**
     * Generate one-time token
     * @param {Object} data - Token data
     * @param {string} purpose - Token purpose
     * @param {Object} [options] - Token options
     * @returns {string} One-time token
     */
    generateOneTimeToken(data, purpose, options = {}) {
        try {
            const payload = {
                ...data,
                type: TOKEN_TYPES.ONE_TIME,
                purpose: purpose,
                tokenId: crypto.randomBytes(16).toString('hex'),
                oneTime: true,
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(payload, this.jwtConfig.secret, {
                expiresIn: options.expiresIn || this.expiryConfig.oneTimeToken,
                issuer: this.jwtConfig.issuer,
                algorithm: this.jwtConfig.algorithm
            });

            this.stats.tokensGenerated++;
            logger.debug('One-time token generated', {
                tokenId: payload.tokenId,
                purpose: purpose
            });

            return token;

        } catch (error) {
            logger.error('Failed to generate one-time token', { error: error.message });
            throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
        }
    }

    // ============= TOKEN VERIFICATION METHODS =============

    /**
     * Verify and decode JWT token
     * @param {string} token - JWT token
     * @param {string} [type] - Expected token type
     * @param {Object} [options] - Verification options
     * @returns {Object} Decoded token payload
     */
    verifyToken(token, type = TOKEN_TYPES.ACCESS, options = {}) {
        try {
            const verifyOptions = {
                issuer: this.jwtConfig.issuer,
                algorithms: [this.jwtConfig.algorithm]
            };

            // Add audience check for access tokens
            if (type === TOKEN_TYPES.ACCESS) {
                verifyOptions.audience = this.jwtConfig.audience;
            }

            // Merge custom options
            Object.assign(verifyOptions, options.verifyOptions || {});

            const decoded = jwt.verify(token, this.jwtConfig.secret, verifyOptions);

            // Validate token type (only if token has a type field)
            if (decoded.type && decoded.type !== type) {
                throw new AppError(
                    `Invalid token type. Expected ${type}, got ${decoded.type}`,
                    401,
                    'INVALID_TOKEN_TYPE'
                );
            }

            // Validate security bindings
            if (this.securityConfig.enableIPBinding && decoded.ip && options.ip) {
                if (decoded.ip !== options.ip) {
                    logger.warn('Token IP mismatch', {
                        tokenIP: decoded.ip,
                        requestIP: options.ip
                    });
                    throw new AppError('Token IP mismatch', 401, 'IP_MISMATCH');
                }
            }

            if (this.securityConfig.enableUserAgentBinding && decoded.userAgent && options.userAgent) {
                const hashedUA = this._hashUserAgent(options.userAgent);
                if (decoded.userAgent !== hashedUA) {
                    logger.warn('Token user agent mismatch');
                    throw new AppError('Token user agent mismatch', 401, 'USER_AGENT_MISMATCH');
                }
            }

            if (this.securityConfig.enableFingerprinting && decoded.fingerprint && options.fingerprint) {
                if (decoded.fingerprint !== options.fingerprint) {
                    logger.warn('Token fingerprint mismatch');
                    throw new AppError('Token fingerprint mismatch', 401, 'FINGERPRINT_MISMATCH');
                }
            }

            this.stats.tokensValidated++;
            return decoded;

        } catch (error) {
            this.stats.validationFailures++;

            // Log the actual JWT error for debugging
            console.log('[TOKEN-SERVICE] JWT verification error:', {
                name: error.name,
                message: error.message,
                code: error.code,
                isAppError: error instanceof AppError
            });

            // Handle specific JWT errors with switch case
            switch (error.name) {
                case 'TokenExpiredError':
                    this.stats.tokensExpired++;
                    throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');

                case 'JsonWebTokenError':
                    console.log('[TOKEN-SERVICE] JsonWebTokenError details:', error.message);
                    throw new AppError('Invalid token', 401, 'INVALID_TOKEN');

                case 'NotBeforeError':
                    throw new AppError('Token not yet valid', 401, 'TOKEN_NOT_ACTIVE');

                default:
                    if (error instanceof AppError) {
                        console.log('[TOKEN-SERVICE] Re-throwing AppError:', error.code);
                        throw error;
                    }
                    logger.error('Token verification failed', { error: error.message });
                    throw new AppError('Token verification failed', 401, 'VERIFICATION_FAILED');
            }
        }
    }

    /**
     * Decode token without verification (use with caution)
     * @param {string} token - JWT token
     * @returns {Object|null} Decoded payload or null
     */
    decodeToken(token) {
        try {
            return jwt.decode(token, { complete: false });
        } catch (error) {
            logger.error('Token decode failed', { error: error.message });
            return null;
        }
    }

    /**
     * Decode token with complete information
     * @param {string} token - JWT token
     * @returns {Object|null} Complete decoded token or null
     */
    decodeTokenComplete(token) {
        try {
            return jwt.decode(token, { complete: true });
        } catch (error) {
            logger.error('Token decode failed', { error: error.message });
            return null;
        }
    }

    // ============= TOKEN ROTATION METHODS =============

    /**
     * Check if token should be rotated
     * @param {Object} decoded - Decoded token
     * @returns {boolean} Whether token should be rotated
     */
    shouldRotateToken(decoded) {
        if (!this.rotationConfig.enableRotation) {
            return false;
        }

        // Check rotation count
        if (decoded.rotationCount >= this.rotationConfig.maxRotations) {
            return false;
        }

        // Check token age vs threshold
        const now = Math.floor(Date.now() / 1000);
        const tokenAge = now - decoded.iat;
        const tokenLifetime = decoded.exp - decoded.iat;
        const agePercentage = tokenAge / tokenLifetime;

        return agePercentage >= this.rotationConfig.rotationThreshold;
    }

    /**
     * Rotate refresh token
     * @param {string} oldToken - Old refresh token
     * @param {Object} user - User object
     * @param {Object} [options] - Rotation options
     * @returns {Object} New tokens
     */
    async rotateRefreshToken(oldToken, user, options = {}) {
        try {
            // Verify old token
            const decoded = this.verifyToken(oldToken, TOKEN_TYPES.REFRESH, options);

            // Check rotation count
            if (decoded.rotationCount >= this.rotationConfig.maxRotations) {
                throw new AppError('Maximum token rotations exceeded', 403, 'MAX_ROTATIONS_EXCEEDED');
            }

            // Generate new tokens
            const newAccessToken = this.generateAccessToken(user, options);
            const newRefreshToken = this.generateRefreshToken(user, {
                ...options,
                tokenFamily: decoded.tokenFamily,
                rotationCount: (decoded.rotationCount || 0) + 1
            });

            this.stats.tokensRotated++;
            logger.debug('Token rotated', {
                userId: user._id || user.id,
                oldTokenId: decoded.tokenId,
                rotationCount: decoded.rotationCount + 1
            });

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                rotationCount: decoded.rotationCount + 1
            };

        } catch (error) {
            logger.error('Token rotation failed', { error: error.message });
            throw error;
        }
    }

    // ============= TOKEN MANAGEMENT METHODS =============

    /**
     * Hash token for storage
     * @param {string} token - Token to hash
     * @returns {Promise<string>} Hashed token
     */
    async hashToken(token) {
        return await HashService.hashToken(token);
    }

    /**
     * Revoke token
     * @param {string} tokenId - Token ID to revoke
     * @param {string} [reason] - Revocation reason
     * @returns {Promise<boolean>} Success status
     */
    async revokeToken(tokenId, reason = 'manual') {
        try {
            // TODO: Update token status in database
            // await TokenModel.updateOne({ tokenId }, { status: TOKEN_STATUS.REVOKED, revokedAt: new Date(), revokedReason: reason });

            // Remove from cache
            this.tokenCache.delete(tokenId);

            this.stats.tokensRevoked++;
            logger.info('Token revoked', { tokenId, reason });

            return true;
        } catch (error) {
            logger.error('Token revocation failed', { error: error.message, tokenId });
            throw new AppError('Token revocation failed', 500, 'REVOCATION_FAILED');
        }
    }

    /**
     * Revoke all user tokens
     * @param {string} userId - User ID
     * @param {string} [reason] - Revocation reason
     * @returns {Promise<number>} Number of tokens revoked
     */
    async revokeAllUserTokens(userId, reason = 'logout_all') {
        try {
            // TODO: Update all user tokens in database
            // const result = await TokenModel.updateMany(
            //     { userId, status: TOKEN_STATUS.ACTIVE },
            //     { status: TOKEN_STATUS.REVOKED, revokedAt: new Date(), revokedReason: reason }
            // );

            // Clear cache for user tokens
            for (const [key, value] of this.tokenCache.entries()) {
                if (value.id === userId) {
                    this.tokenCache.delete(key);
                }
            }

            const count = 0; // result.modifiedCount;
            this.stats.tokensRevoked += count;
            logger.info('All user tokens revoked', { userId, count, reason });

            return count;
        } catch (error) {
            logger.error('Bulk token revocation failed', { error: error.message, userId });
            throw new AppError('Bulk token revocation failed', 500, 'BULK_REVOCATION_FAILED');
        }
    }

    /**
     * Check if token is revoked
     * @param {string} tokenId - Token ID
     * @returns {Promise<boolean>} Whether token is revoked
     */
    async isTokenRevoked(tokenId) {
        try {
            // Check cache first
            const cached = this.tokenCache.get(tokenId);
            if (cached) {
                return false; // If in cache, it's not revoked
            }

            // TODO: Check database
            // const token = await TokenModel.findOne({ tokenId });
            // return token?.status === TOKEN_STATUS.REVOKED;

            return false;
        } catch (error) {
            logger.error('Token revocation check failed', { error: error.message, tokenId });
            return false;
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Get user primary role
     * @private
     */
    _getUserRole(user) {
        if (user.role) return user.role;
        if (user.organizations && user.organizations.length > 0) {
            const primaryOrg = user.organizations.find(org => org.isPrimary) || user.organizations[0];
            if (primaryOrg.roles && primaryOrg.roles.length > 0) {
                return primaryOrg.roles[0].roleName;
            }
        }
        return 'member';
    }

    /**
     * Get all user roles
     * @private
     */
    _getAllUserRoles(user) {
        const roles = new Set();
        if (user.role) roles.add(user.role);
        if (user.organizations) {
            user.organizations.forEach(org => {
                if (org.roles) {
                    org.roles.forEach(role => roles.add(role.roleName));
                }
            });
        }
        return Array.from(roles);
    }

    /**
     * Get primary tenant ID
     * @private
     */
    _getPrimaryTenantId(user) {
        if (user.tenantId) return user.tenantId;
        if (user.organizations && user.organizations.length > 0) {
            const primaryOrg = user.organizations.find(org => org.isPrimary) || user.organizations[0];
            return primaryOrg.organizationId;
        }
        return null;
    }

    /**
     * Get primary organization ID
     * @private
     */
    _getPrimaryOrganizationId(user) {
        return this._getPrimaryTenantId(user);
    }

    /**
     * Hash user agent for storage
     * @private
     */
    _hashUserAgent(userAgent) {
        return crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 16);
    }

    /**
     * Cache token for performance
     * @private
     */
    _cacheToken(tokenId, payload) {
        this.tokenCache.set(tokenId, {
            ...payload,
            cachedAt: Date.now()
        });

        // Set expiry for cache cleanup
        setTimeout(() => {
            this.tokenCache.delete(tokenId);
        }, this.cacheExpiry);
    }

    /**
     * Get cached token
     * @private
     */
    _getCachedToken(tokenId) {
        const cached = this.tokenCache.get(tokenId);
        if (!cached) return null;

        // Check if cache is still valid
        if (Date.now() - cached.cachedAt > this.cacheExpiry) {
            this.tokenCache.delete(tokenId);
            return null;
        }

        return cached;
    }

    /**
     * Clear token cache
     */
    clearCache() {
        this.tokenCache.clear();
        logger.debug('Token cache cleared');
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            cacheSize: this.tokenCache.size,
            validationRate: this.stats.tokensValidated > 0
                ? ((this.stats.tokensValidated / (this.stats.tokensValidated + this.stats.validationFailures)) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.tokenCache.entries()) {
            if (now - value.cachedAt > this.cacheExpiry) {
                this.tokenCache.delete(key);
            }
        }
        logger.debug('Token cache cleaned up', { remainingEntries: this.tokenCache.size });
    }
}

// Export singleton instance
module.exports = new TokenService();