'use strict';

/**
 * @fileoverview User-related validation utilities
 * @module shared/lib/utils/validators/user-validators
 */

const { body, param, query } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class UserValidators
 * @description User-specific validation rules
 */
class UserValidators {
  /**
   * Validate user creation
   * @static
   * @returns {Array} Array of validators
   */
  static createUser() {
    return [
      body('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

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

      body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores and hyphens'),

      body('role')
        .optional()
        .isIn(['user', 'admin', 'moderator', 'viewer'])
        .withMessage('Invalid role specified'),

      body('organizationId')
        .optional()
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('phone')
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),

      body('dateOfBirth')
        .optional()
        .isISO8601()
        .withMessage('Please provide a valid date of birth')
        .custom(value => {
          const age = new Date().getFullYear() - new Date(value).getFullYear();
          return age >= 13 && age <= 120;
        })
        .withMessage('User must be between 13 and 120 years old')
    ];
  }

  /**
   * Validate user update
   * @static
   * @returns {Array} Array of validators
   */
  static updateUser() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens and apostrophes'),

      body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens and apostrophes'),

      body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores and hyphens'),

      body('bio')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Bio must not exceed 500 characters'),

      body('avatar')
        .optional()
        .isURL()
        .withMessage('Avatar must be a valid URL'),

      body('preferences')
        .optional()
        .isJSON()
        .withMessage('Preferences must be valid JSON')
    ];
  }

  /**
   * Validate user profile update
   * @static
   * @returns {Array} Array of validators
   */
  static updateProfile() {
    return [
      body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

      body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

      body('bio')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Bio must not exceed 500 characters'),

      body('website')
        .optional()
        .isURL()
        .withMessage('Website must be a valid URL'),

      body('location')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Location must not exceed 100 characters'),

      body('socialLinks.twitter')
        .optional()
        .matches(/^@?[a-zA-Z0-9_]{1,15}$/)
        .withMessage('Invalid Twitter handle'),

      body('socialLinks.linkedin')
        .optional()
        .isURL()
        .withMessage('LinkedIn URL must be valid'),

      body('socialLinks.github')
        .optional()
        .matches(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/)
        .withMessage('Invalid GitHub username')
    ];
  }

  /**
   * Validate user deletion
   * @static
   * @returns {Array} Array of validators
   */
  static deleteUser() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('confirmation')
        .optional()
        .equals('DELETE')
        .withMessage('Please type DELETE to confirm'),

      body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason must not exceed 500 characters')
    ];
  }

  /**
   * Validate user search
   * @static
   * @returns {Array} Array of validators
   */
  static searchUsers() {
    return [
      query('q')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters'),

      query('role')
        .optional()
        .isIn(['user', 'admin', 'moderator', 'viewer'])
        .withMessage('Invalid role filter'),

      query('status')
        .optional()
        .isIn(['active', 'inactive', 'suspended', 'pending'])
        .withMessage('Invalid status filter'),

      query('organizationId')
        .optional()
        .isMongoId()
        .withMessage('Invalid organization ID'),

      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),

      query('sort')
        .optional()
        .isIn(['createdAt', '-createdAt', 'firstName', '-firstName', 'lastName', '-lastName', 'email', '-email'])
        .withMessage('Invalid sort field')
    ];
  }

  /**
   * Validate user status update
   * @static
   * @returns {Array} Array of validators
   */
  static updateUserStatus() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('status')
        .notEmpty()
        .withMessage('Status is required')
        .isIn(['active', 'inactive', 'suspended', 'banned'])
        .withMessage('Invalid status'),

      body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason must not exceed 500 characters'),

      body('suspendedUntil')
        .optional()
        .isISO8601()
        .withMessage('Suspended until must be a valid date')
        .custom(value => new Date(value) > new Date())
        .withMessage('Suspended until must be in the future')
    ];
  }

  /**
   * Validate user preferences update
   * @static
   * @returns {Array} Array of validators
   */
  static updatePreferences() {
    return [
      body('theme')
        .optional()
        .isIn(['light', 'dark', 'auto'])
        .withMessage('Invalid theme'),

      body('language')
        .optional()
        .isLocale()
        .withMessage('Invalid language code'),

      body('timezone')
        .optional()
        .matches(/^[A-Za-z_]+\/[A-Za-z_]+$/)
        .withMessage('Invalid timezone'),

      body('emailNotifications')
        .optional()
        .isBoolean()
        .withMessage('Email notifications must be a boolean')
        .toBoolean(),

      body('pushNotifications')
        .optional()
        .isBoolean()
        .withMessage('Push notifications must be a boolean')
        .toBoolean(),

      body('twoFactorEnabled')
        .optional()
        .isBoolean()
        .withMessage('Two-factor authentication must be a boolean')
        .toBoolean()
    ];
  }

  /**
   * Validate user avatar upload
   * @static
   * @returns {Function} Express middleware
   */
  static uploadAvatar() {
    return (req, res, next) => {
      if (!req.file) {
        return next(new AppError('Avatar file is required', 400, 'FILE_REQUIRED'));
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return next(new AppError(
          'Avatar must be JPEG, PNG, GIF or WebP',
          400,
          'INVALID_FILE_TYPE'
        ));
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        return next(new AppError(
          'Avatar file size must not exceed 5MB',
          400,
          'FILE_TOO_LARGE'
        ));
      }

      next();
    };
  }

  /**
   * Validate user address
   * @static
   * @returns {Array} Array of validators
   */
  static validateAddress() {
    return [
      body('address.street')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Street must be between 1 and 100 characters'),

      body('address.city')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('City must be between 1 and 50 characters'),

      body('address.state')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('State must be between 2 and 50 characters'),

      body('address.country')
        .optional()
        .isISO31661Alpha2()
        .withMessage('Country must be a valid ISO 3166-1 alpha-2 code'),

      body('address.postalCode')
        .optional()
        .matches(/^[A-Z0-9\s-]+$/i)
        .withMessage('Invalid postal code format')
    ];
  }

  /**
   * Validate user permissions update
   * @static
   * @returns {Array} Array of validators
   */
  static updatePermissions() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('permissions')
        .notEmpty()
        .withMessage('Permissions are required')
        .isArray()
        .withMessage('Permissions must be an array'),

      body('permissions.*')
        .isString()
        .withMessage('Each permission must be a string')
        .matches(/^[a-z]+:[a-z]+$/)
        .withMessage('Permission must be in format: resource:action')
    ];
  }

  /**
   * Validate user role assignment
   * @static
   * @returns {Array} Array of validators
   */
  static assignRole() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('roleId')
        .notEmpty()
        .withMessage('Role ID is required')
        .isMongoId()
        .withMessage('Invalid role ID'),

      body('expiresAt')
        .optional()
        .isISO8601()
        .withMessage('Expiry date must be valid')
        .custom(value => new Date(value) > new Date())
        .withMessage('Expiry date must be in the future')
    ];
  }

  /**
   * Validate bulk user operations
   * @static
   * @returns {Array} Array of validators
   */
  static bulkOperation() {
    return [
      body('userIds')
        .notEmpty()
        .withMessage('User IDs are required')
        .isArray({ min: 1, max: 100 })
        .withMessage('Must select between 1 and 100 users'),

      body('userIds.*')
        .isMongoId()
        .withMessage('Each user ID must be valid'),

      body('operation')
        .notEmpty()
        .withMessage('Operation is required')
        .isIn(['activate', 'deactivate', 'delete', 'export'])
        .withMessage('Invalid bulk operation'),

      body('confirmation')
        .optional()
        .custom((value, { req }) => {
          if (req.body.operation === 'delete') {
            return value === 'DELETE';
          }
          return true;
        })
        .withMessage('Please type DELETE to confirm bulk deletion')
    ];
  }

  /**
   * Validate user verification
   * @static
   * @returns {Array} Array of validators
   */
  static verifyUser() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('verificationType')
        .notEmpty()
        .withMessage('Verification type is required')
        .isIn(['email', 'phone', 'identity'])
        .withMessage('Invalid verification type'),

      body('verificationData')
        .notEmpty()
        .withMessage('Verification data is required')
    ];
  }

  /**
   * Validate user activity query
   * @static
   * @returns {Array} Array of validators
   */
  static getUserActivity() {
    return [
      param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isMongoId()
        .withMessage('Invalid user ID'),

      query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be valid'),

      query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be valid')
        .custom((value, { req }) => {
          if (req.query.startDate) {
            return new Date(value) > new Date(req.query.startDate);
          }
          return true;
        })
        .withMessage('End date must be after start date'),

      query('type')
        .optional()
        .isIn(['login', 'action', 'api', 'all'])
        .withMessage('Invalid activity type')
    ];
  }
}

module.exports = UserValidators;
