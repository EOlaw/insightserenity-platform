/**
 * @fileoverview Token Service - JWT Token Management
 * @module servers/admin-server/services/auth/token-service
 * @description Class-based service for generating, verifying, and managing JWT tokens
 *              with support for access tokens, refresh tokens, and token rotation.
 * @version 1.0.0
 * @requires jsonwebtoken
 * @requires crypto
 */

'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

const logger = getLogger({ serviceName: 'token-service' });

/**
 * Token Service Class
 * @class TokenService
 * @description Handles all JWT token operations including generation, verification, and rotation
 */
class TokenService {
  /**
   * @private
   * @static
   * @constant {string} JWT_SECRET - JWT signing secret from environment
   */
  static #JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

  /**
   * @private
   * @static
   * @constant {string} JWT_REFRESH_SECRET - Refresh token signing secret
   */
  static #JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret-change-in-production';

  /**
   * @private
   * @static
   * @constant {string} ACCESS_TOKEN_EXPIRY - Access token expiry time
   */
  static #ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';

  /**
   * @private
   * @static
   * @constant {string} REFRESH_TOKEN_EXPIRY - Refresh token expiry time
   */
  static #REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

  /**
   * @private
   * @static
   * @constant {string} TOKEN_ISSUER - JWT issuer claim
   */
  static #TOKEN_ISSUER = 'insightserenity-admin';

  /**
   * @private
   * @static
   * @constant {string} TOKEN_AUDIENCE - JWT audience claim
   */
  static #TOKEN_AUDIENCE = 'insightserenity-admin-api';

  /**
   * Generate JWT access token
   * @param {Object} payload - Token payload
   * @param {string} payload.adminUserId - Admin user ID
   * @param {string} payload.email - Admin email
   * @param {string} payload.role - Admin role
   * @param {Array<string>} payload.permissions - Admin permissions
   * @param {string} payload.sessionId - Session ID
   * @param {Object} options - Token options
   * @param {string} options.expiresIn - Custom expiry time (optional)
   * @returns {string} JWT access token
   * @throws {AppError} If token generation fails
   * @static
   * @public
   */
  static generateAccessToken(payload, options = {}) {
    try {
      const {
        adminUserId,
        email,
        role,
        permissions = [],
        sessionId,
        department
      } = payload;

      // Validate required fields
      if (!adminUserId || !email || !role || !sessionId) {
        throw new AppError('Missing required token payload fields', 400, 'INVALID_TOKEN_PAYLOAD');
      }

      // Construct token payload
      const tokenPayload = {
        sub: adminUserId, // Subject (user ID)
        email,
        role,
        permissions,
        sessionId,
        department,
        type: 'access',
        iss: this.#TOKEN_ISSUER,
        aud: this.#TOKEN_AUDIENCE
      };

      // Sign token
      const token = jwt.sign(
        tokenPayload,
        this.#JWT_SECRET,
        {
          expiresIn: options.expiresIn || this.#ACCESS_TOKEN_EXPIRY,
          algorithm: 'HS256'
        }
      );

      logger.debug('Access token generated', {
        adminUserId,
        email,
        role,
        sessionId,
        expiresIn: options.expiresIn || this.#ACCESS_TOKEN_EXPIRY
      });

      return token;
    } catch (error) {
      logger.error('Access token generation failed', {
        error: error.message,
        payload
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Token generation failed', 500, 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Generate JWT refresh token
   * @param {Object} payload - Token payload
   * @param {string} payload.adminUserId - Admin user ID
   * @param {string} payload.sessionId - Session ID
   * @param {Object} options - Token options
   * @param {string} options.expiresIn - Custom expiry time (optional)
   * @returns {string} JWT refresh token
   * @throws {AppError} If token generation fails
   * @static
   * @public
   */
  static generateRefreshToken(payload, options = {}) {
    try {
      const { adminUserId, sessionId } = payload;

      // Validate required fields
      if (!adminUserId || !sessionId) {
        throw new AppError('Missing required refresh token payload fields', 400, 'INVALID_TOKEN_PAYLOAD');
      }

      // Construct minimal payload for refresh token
      const tokenPayload = {
        sub: adminUserId,
        sessionId,
        type: 'refresh',
        iss: this.#TOKEN_ISSUER,
        aud: this.#TOKEN_AUDIENCE
      };

      // Sign token with different secret
      const token = jwt.sign(
        tokenPayload,
        this.#JWT_REFRESH_SECRET,
        {
          expiresIn: options.expiresIn || this.#REFRESH_TOKEN_EXPIRY,
          algorithm: 'HS256'
        }
      );

      logger.debug('Refresh token generated', {
        adminUserId,
        sessionId
      });

      return token;
    } catch (error) {
      logger.error('Refresh token generation failed', {
        error: error.message,
        payload
      });

      if (error instanceof AppError) throw error;
      throw new AppError('Refresh token generation failed', 500, 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Generate token pair (access + refresh)
   * @param {Object} payload - Token payload
   * @returns {Object} Token pair { accessToken, refreshToken, expiresIn }
   * @throws {AppError} If token generation fails
   * @static
   * @public
   */
  static generateTokenPair(payload) {
    try {
      const accessToken = this.generateAccessToken(payload);
      const refreshToken = this.generateRefreshToken(payload);

      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: this.getAccessTokenExpirySeconds()
      };
    } catch (error) {
      logger.error('Token pair generation failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify JWT access token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   * @throws {AppError} If token is invalid or expired
   * @static
   * @public
   */
  static verifyAccessToken(token) {
    try {
      if (!token) {
        throw new AppError('Token is required', 401, 'NO_TOKEN');
      }

      // Verify and decode token
      const decoded = jwt.verify(token, this.#JWT_SECRET, {
        issuer: this.#TOKEN_ISSUER,
        audience: this.#TOKEN_AUDIENCE,
        algorithms: ['HS256']
      });

      // Validate token type
      if (decoded.type !== 'access') {
        throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      logger.debug('Access token verified', {
        adminUserId: decoded.sub,
        sessionId: decoded.sessionId
      });

      return decoded;
    } catch (error) {
      logger.warn('Access token verification failed', {
        error: error.message,
        name: error.name
      });

      // Handle specific JWT errors
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
      }

      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
      }

      if (error.name === 'NotBeforeError') {
        throw new AppError('Token not yet valid', 401, 'TOKEN_NOT_ACTIVE');
      }

      if (error instanceof AppError) throw error;
      throw new AppError('Token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
    }
  }

  /**
   * Verify JWT refresh token
   * @param {string} token - JWT refresh token to verify
   * @returns {Object} Decoded token payload
   * @throws {AppError} If token is invalid or expired
   * @static
   * @public
   */
  static verifyRefreshToken(token) {
    try {
      if (!token) {
        throw new AppError('Refresh token is required', 401, 'NO_REFRESH_TOKEN');
      }

      // Verify and decode token with refresh secret
      const decoded = jwt.verify(token, this.#JWT_REFRESH_SECRET, {
        issuer: this.#TOKEN_ISSUER,
        audience: this.#TOKEN_AUDIENCE,
        algorithms: ['HS256']
      });

      // Validate token type
      if (decoded.type !== 'refresh') {
        throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      logger.debug('Refresh token verified', {
        adminUserId: decoded.sub,
        sessionId: decoded.sessionId
      });

      return decoded;
    } catch (error) {
      logger.warn('Refresh token verification failed', {
        error: error.message,
        name: error.name
      });

      // Handle specific JWT errors
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Refresh token has expired', 401, 'REFRESH_TOKEN_EXPIRED');
      }

      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      if (error instanceof AppError) throw error;
      throw new AppError('Refresh token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
    }
  }

  /**
   * Decode token without verification (for inspection only)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token payload (unverified)
   * @static
   * @public
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.error('Token decode failed', { error: error.message });
      return null;
    }
  }

  /**
   * Hash token for storage
   * @param {string} token - Plain text token
   * @returns {string} Hashed token
   * @static
   * @public
   */
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get access token expiry in seconds
   * @returns {number} Expiry time in seconds
   * @static
   * @public
   */
  static getAccessTokenExpirySeconds() {
    const expiry = this.#ACCESS_TOKEN_EXPIRY;

    // Parse expiry string (e.g., "15m", "1h", "7d")
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    const multipliers = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400
    };

    return value * (multipliers[unit] || 60); // Default to minutes
  }

  /**
   * Get refresh token expiry in seconds
   * @returns {number} Expiry time in seconds
   * @static
   * @public
   */
  static getRefreshTokenExpirySeconds() {
    const expiry = this.#REFRESH_TOKEN_EXPIRY;

    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    const multipliers = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400
    };

    return value * (multipliers[unit] || 86400); // Default to days
  }

  /**
   * Extract token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} Extracted token or null
   * @static
   * @public
   */
  static extractTokenFromHeader(authHeader) {
    if (!authHeader) return null;

    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return null;
    }

    // Extract and return token
    const token = authHeader.substring(7);
    return token.trim() || null;
  }

  /**
   * Check if token is expired (without verification)
   * @param {string} token - JWT token
   * @returns {boolean} True if token is expired
   * @static
   * @public
   */
  static isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return true;

      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiry date
   * @param {string} token - JWT token
   * @returns {Date|null} Expiry date or null
   * @static
   * @public
   */
  static getTokenExpiry(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return null;

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate password reset token
   * @param {Object} payload - Token payload
   * @param {string} payload.adminUserId - Admin user ID
   * @param {string} payload.email - Admin email
   * @returns {string} Password reset token (expires in 10 minutes)
   * @static
   * @public
   */
  static generatePasswordResetToken(payload) {
    try {
      const { adminUserId, email } = payload;

      const tokenPayload = {
        sub: adminUserId,
        email,
        type: 'password_reset',
        iss: this.#TOKEN_ISSUER,
        aud: this.#TOKEN_AUDIENCE
      };

      return jwt.sign(tokenPayload, this.#JWT_SECRET, {
        expiresIn: '10m', // Short-lived for security
        algorithm: 'HS256'
      });
    } catch (error) {
      logger.error('Password reset token generation failed', {
        error: error.message
      });
      throw new AppError('Password reset token generation failed', 500, 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Verify password reset token
   * @param {string} token - Password reset token
   * @returns {Object} Decoded token payload
   * @throws {AppError} If token is invalid
   * @static
   * @public
   */
  static verifyPasswordResetToken(token) {
    try {
      const decoded = jwt.verify(token, this.#JWT_SECRET, {
        issuer: this.#TOKEN_ISSUER,
        audience: this.#TOKEN_AUDIENCE
      });

      if (decoded.type !== 'password_reset') {
        throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Password reset token has expired', 401, 'TOKEN_EXPIRED');
      }

      if (error instanceof AppError) throw error;
      throw new AppError('Invalid password reset token', 401, 'INVALID_TOKEN');
    }
  }

  /**
   * Generate email verification token
   * @param {Object} payload - Token payload
   * @param {string} payload.adminUserId - Admin user ID
   * @param {string} payload.email - Admin email
   * @returns {string} Email verification token (expires in 24 hours)
   * @static
   * @public
   */
  static generateEmailVerificationToken(payload) {
    try {
      const { adminUserId, email } = payload;

      const tokenPayload = {
        sub: adminUserId,
        email,
        type: 'email_verification',
        iss: this.#TOKEN_ISSUER,
        aud: this.#TOKEN_AUDIENCE
      };

      return jwt.sign(tokenPayload, this.#JWT_SECRET, {
        expiresIn: '24h',
        algorithm: 'HS256'
      });
    } catch (error) {
      logger.error('Email verification token generation failed', {
        error: error.message
      });
      throw new AppError('Email verification token generation failed', 500, 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Verify email verification token
   * @param {string} token - Email verification token
   * @returns {Object} Decoded token payload
   * @throws {AppError} If token is invalid
   * @static
   * @public
   */
  static verifyEmailVerificationToken(token) {
    try {
      const decoded = jwt.verify(token, this.#JWT_SECRET, {
        issuer: this.#TOKEN_ISSUER,
        audience: this.#TOKEN_AUDIENCE
      });

      if (decoded.type !== 'email_verification') {
        throw new AppError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Email verification token has expired', 401, 'TOKEN_EXPIRED');
      }

      if (error instanceof AppError) throw error;
      throw new AppError('Invalid email verification token', 401, 'INVALID_TOKEN');
    }
  }
}

module.exports = TokenService;
