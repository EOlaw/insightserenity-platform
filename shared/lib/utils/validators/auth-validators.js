'use strict';

/**
 * @fileoverview Authentication and authorization validation utilities
 * @module shared/lib/utils/validators/auth-validators
 */

const { body, header, validationResult } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class AuthValidators
 * @description Authentication and authorization validation rules
 */
class AuthValidators {
  /**
   * Validate login credentials
   * @static
   * @returns {Array} Array of validators
   */
  static login() {
    return [
      body('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),

      body('rememberMe')
        .optional()
        .isBoolean()
        .withMessage('Remember me must be a boolean value')
        .toBoolean()
    ];
  }

  /**
   * Validate registration data
   * @static
   * @returns {Array} Array of validators
   */
  static register() {
    return [
      body('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number and special character'),

      body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),

      body('firstName')
        .notEmpty()
        .withMessage('First name is required')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens and apostrophes'),

      body('lastName')
        .notEmpty()
        .withMessage('Last name is required')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens and apostrophes'),

      body('terms')
        .notEmpty()
        .withMessage('You must accept the terms and conditions')
        .isBoolean()
        .withMessage('Terms acceptance must be a boolean value')
        .custom(value => value === true)
        .withMessage('You must accept the terms and conditions')
    ];
  }

  /**
   * Validate password reset request
   * @static
   * @returns {Array} Array of validators
   */
  static forgotPassword() {
    return [
      body('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
    ];
  }

  /**
   * Validate password reset
   * @static
   * @returns {Array} Array of validators
   */
  static resetPassword() {
    return [
      body('token')
        .notEmpty()
        .withMessage('Reset token is required')
        .isLength({ min: 20 })
        .withMessage('Invalid reset token'),

      body('password')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number and special character'),

      body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match')
    ];
  }

  /**
   * Validate password change
   * @static
   * @returns {Array} Array of validators
   */
  static changePassword() {
    return [
      body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

      body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number and special character')
        .custom((value, { req }) => value !== req.body.currentPassword)
        .withMessage('New password must be different from current password'),

      body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match')
    ];
  }

  /**
   * Validate JWT token in header
   * @static
   * @returns {Array} Array of validators
   */
  static jwtToken() {
    return [
      header('authorization')
        .notEmpty()
        .withMessage('Authorization header is required')
        .matches(/^Bearer .+/)
        .withMessage('Authorization header must be in format: Bearer <token>')
        .custom(value => {
          const token = value.split(' ')[1];
          return token && token.length > 0;
        })
        .withMessage('Invalid authorization token')
    ];
  }

  /**
   * Validate API key
   * @static
   * @returns {Array} Array of validators
   */
  static apiKey() {
    return [
      header('x-api-key')
        .notEmpty()
        .withMessage('API key is required')
        .isLength({ min: 32 })
        .withMessage('Invalid API key format')
    ];
  }

  /**
   * Validate refresh token
   * @static
   * @returns {Array} Array of validators
   */
  static refreshToken() {
    return [
      body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token is required')
        .isLength({ min: 20 })
        .withMessage('Invalid refresh token')
    ];
  }

  /**
   * Validate two-factor authentication
   * @static
   * @returns {Array} Array of validators
   */
  static twoFactorAuth() {
    return [
      body('code')
        .notEmpty()
        .withMessage('2FA code is required')
        .matches(/^\d{6}$/)
        .withMessage('2FA code must be 6 digits')
    ];
  }

  /**
   * Validate OAuth callback
   * @static
   * @returns {Array} Array of validators
   */
  static oauthCallback() {
    return [
      body('code')
        .notEmpty()
        .withMessage('OAuth code is required'),

      body('state')
        .notEmpty()
        .withMessage('OAuth state is required')
        .isLength({ min: 16 })
        .withMessage('Invalid OAuth state')
    ];
  }

  /**
   * Validate session
   * @static
   * @returns {Function} Express middleware
   */
  static session() {
    return (req, res, next) => {
      if (!req.session || !req.session.userId) {
        return next(new AppError('Invalid session', 401, 'INVALID_SESSION'));
      }

      if (req.session.expiresAt && new Date(req.session.expiresAt) < new Date()) {
        return next(new AppError('Session expired', 401, 'SESSION_EXPIRED'));
      }

      next();
    };
  }

  /**
   * Validate permissions
   * @static
   * @param {Array<string>} requiredPermissions - Required permissions
   * @returns {Function} Express middleware
   */
  static permissions(requiredPermissions = []) {
    return (req, res, next) => {
      if (!req.user) {
        return next(new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED'));
      }

      const userPermissions = req.user.permissions || [];
      const hasPermission = requiredPermissions.every(perm =>
        userPermissions.includes(perm)
      );

      if (!hasPermission) {
        return next(new AppError(
          'Insufficient permissions',
          403,
          'INSUFFICIENT_PERMISSIONS',
          { required: requiredPermissions, current: userPermissions }
        ));
      }

      next();
    };
  }

  /**
   * Validate roles
   * @static
   * @param {Array<string>} requiredRoles - Required roles
   * @returns {Function} Express middleware
   */
  static roles(requiredRoles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return next(new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED'));
      }

      const userRoles = req.user.roles || [];
      const hasRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return next(new AppError(
          'Insufficient role privileges',
          403,
          'INSUFFICIENT_ROLE',
          { required: requiredRoles, current: userRoles }
        ));
      }

      next();
    };
  }

  /**
   * Validate email verification
   * @static
   * @returns {Array} Array of validators
   */
  static verifyEmail() {
    return [
      body('token')
        .notEmpty()
        .withMessage('Verification token is required')
        .isLength({ min: 20 })
        .withMessage('Invalid verification token')
    ];
  }

  /**
   * Validate account activation
   * @static
   * @returns {Array} Array of validators
   */
  static activateAccount() {
    return [
      body('activationCode')
        .notEmpty()
        .withMessage('Activation code is required')
        .isLength({ min: 6, max: 6 })
        .withMessage('Activation code must be 6 characters')
        .isAlphanumeric()
        .withMessage('Activation code must be alphanumeric')
    ];
  }

  /**
   * Validate passkey registration
   * @static
   * @returns {Array} Array of validators
   */
  static registerPasskey() {
    return [
      body('credentialId')
        .notEmpty()
        .withMessage('Credential ID is required'),

      body('publicKey')
        .notEmpty()
        .withMessage('Public key is required'),

      body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Passkey name must be between 1 and 50 characters')
    ];
  }

  /**
   * Validate passkey authentication
   * @static
   * @returns {Array} Array of validators
   */
  static authenticatePasskey() {
    return [
      body('credentialId')
        .notEmpty()
        .withMessage('Credential ID is required'),

      body('signature')
        .notEmpty()
        .withMessage('Signature is required'),

      body('authenticatorData')
        .notEmpty()
        .withMessage('Authenticator data is required'),

      body('clientDataJSON')
        .notEmpty()
        .withMessage('Client data is required')
    ];
  }

  /**
   * Validate logout
   * @static
   * @returns {Array} Array of validators
   */
  static logout() {
    return [
      body('everywhere')
        .optional()
        .isBoolean()
        .withMessage('Everywhere flag must be a boolean')
        .toBoolean()
    ];
  }

  /**
   * Check if user is authenticated
   * @static
   * @returns {Function} Express middleware
   */
  static isAuthenticated() {
    return (req, res, next) => {
      if (!req.user || !req.user.id) {
        return next(new AppError('Authentication required', 401, 'NOT_AUTHENTICATED'));
      }

      if (req.user.status === 'suspended' || req.user.status === 'banned') {
        return next(new AppError(
          'Account has been suspended',
          403,
          'ACCOUNT_SUSPENDED'
        ));
      }

      if (req.user.emailVerified === false) {
        return next(new AppError(
          'Email verification required',
          403,
          'EMAIL_NOT_VERIFIED'
        ));
      }

      next();
    };
  }

  /**
   * Check if user owns resource
   * @static
   * @param {Function} resourceOwnerGetter - Function to get resource owner ID
   * @returns {Function} Express middleware
   */
  static isOwner(resourceOwnerGetter) {
    return async (req, res, next) => {
      try {
        const ownerId = await resourceOwnerGetter(req);

        if (!ownerId) {
          return next(new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND'));
        }

        if (String(ownerId) !== String(req.user.id)) {
          return next(new AppError(
            'You do not have permission to access this resource',
            403,
            'NOT_OWNER'
          ));
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Validate CSRF token
   * @static
   * @returns {Array} Array of validators
   */
  static csrfToken() {
    return [
      body('_csrf')
        .notEmpty()
        .withMessage('CSRF token is required')
        .isLength({ min: 20 })
        .withMessage('Invalid CSRF token')
    ];
  }
}

module.exports = AuthValidators;
