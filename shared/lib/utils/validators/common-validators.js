'use strict';

/**
 * @fileoverview Common validation utilities for general use
 * @module shared/lib/utils/validators/common-validators
 */

const { body, param, query, validationResult } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class CommonValidators
 * @description Common validation rules and utilities
 */
class CommonValidators {
  /**
   * Validate MongoDB ObjectId
   * @static
   * @param {string} field - Field name to validate
   * @param {string} [location='param'] - Location of field (param, body, query)
   * @returns {Function} Express validator middleware
   */
  static mongoId(field, location = 'param') {
    const validator = location === 'param' ? param :
                      location === 'body' ? body : query;

    return validator(field)
      .isMongoId()
      .withMessage(`${field} must be a valid MongoDB ObjectId`);
  }

  /**
   * Validate email address
   * @static
   * @param {string} [field='email'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static email(field = 'email', options = {}) {
    const { required = true, normalize = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Email is required');
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isEmail()
      .withMessage('Please provide a valid email address');

    if (normalize) {
      validator = validator.normalizeEmail({
        gmail_remove_dots: false,
        gmail_remove_subaddress: false,
        outlookdotcom_remove_subaddress: false
      });
    }

    return validator;
  }

  /**
   * Validate phone number
   * @static
   * @param {string} [field='phone'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static phoneNumber(field = 'phone', options = {}) {
    const { required = true, locale = 'any' } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Phone number is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isMobilePhone(locale)
      .withMessage('Please provide a valid phone number');
  }

  /**
   * Validate URL
   * @static
   * @param {string} [field='url'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static url(field = 'url', options = {}) {
    const {
      required = true,
      protocols = ['http', 'https'],
      requireProtocol = true
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('URL is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isURL({
        protocols,
        require_protocol: requireProtocol,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid URL');
  }

  /**
   * Validate date
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static date(field, options = {}) {
    const {
      required = true,
      format = 'YYYY-MM-DD',
      before = null,
      after = null
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isISO8601()
      .withMessage(`${field} must be a valid date in ${format} format`);

    if (before) {
      validator = validator
        .custom(value => new Date(value) < new Date(before))
        .withMessage(`${field} must be before ${before}`);
    }

    if (after) {
      validator = validator
        .custom(value => new Date(value) > new Date(after))
        .withMessage(`${field} must be after ${after}`);
    }

    return validator;
  }

  /**
   * Validate string length
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static stringLength(field, options = {}) {
    const {
      min = 1,
      max = 255,
      required = true,
      trim = true
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    if (trim) {
      validator = validator.trim();
    }

    return validator
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`);
  }

  /**
   * Validate number range
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static numberRange(field, options = {}) {
    const {
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      required = true,
      integer = false
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isNumeric()
      .withMessage(`${field} must be a number`);

    if (integer) {
      validator = validator
        .isInt({ min, max })
        .withMessage(`${field} must be an integer between ${min} and ${max}`);
    } else {
      validator = validator
        .isFloat({ min, max })
        .withMessage(`${field} must be between ${min} and ${max}`);
    }

    return validator;
  }

  /**
   * Validate boolean
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static boolean(field, options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isBoolean()
      .withMessage(`${field} must be a boolean value`)
      .toBoolean();
  }

  /**
   * Validate array
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static array(field, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = 100,
      unique = false
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isArray({ min: minLength, max: maxLength })
      .withMessage(`${field} must be an array with ${minLength}-${maxLength} items`);

    if (unique) {
      validator = validator
        .custom(value => {
          const uniqueItems = [...new Set(value)];
          return uniqueItems.length === value.length;
        })
        .withMessage(`${field} must contain unique values`);
    }

    return validator;
  }

  /**
   * Validate enum values
   * @static
   * @param {string} field - Field name
   * @param {Array} values - Allowed values
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static enum(field, values, options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(', ')}`);
  }

  /**
   * Validate JSON
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static json(field, options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isJSON()
      .withMessage(`${field} must be valid JSON`);
  }

  /**
   * Validate UUID
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static uuid(field, options = {}) {
    const { required = true, version = 4 } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isUUID(version)
      .withMessage(`${field} must be a valid UUID v${version}`);
  }

  /**
   * Validate IP address
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static ipAddress(field, options = {}) {
    const { required = true, version = 4 } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isIP(version)
      .withMessage(`${field} must be a valid IPv${version} address`);
  }

  /**
   * Validate credit card
   * @static
   * @param {string} [field='cardNumber'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static creditCard(field = 'cardNumber', options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Card number is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isCreditCard()
      .withMessage('Please provide a valid credit card number');
  }

  /**
   * Validate postal code
   * @static
   * @param {string} [field='postalCode'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static postalCode(field = 'postalCode', options = {}) {
    const { required = true, locale = 'any' } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Postal code is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isPostalCode(locale)
      .withMessage('Please provide a valid postal code');
  }

  /**
   * Validate pagination parameters
   * @static
   * @returns {Array} Array of validators
   */
  static pagination() {
    return [
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
        .matches(/^[a-zA-Z_]+:(asc|desc)$/)
        .withMessage('Sort must be in format: field:asc or field:desc'),

      query('search')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters')
    ];
  }

  /**
   * Validate file upload
   * @static
   * @param {string} [field='file'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express middleware
   */
  static fileUpload(field = 'file', options = {}) {
    const {
      required = true,
      maxSize = 10 * 1024 * 1024, // 10MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
    } = options;

    return (req, res, next) => {
      const file = req.files?.[field] || req.file;

      if (required && !file) {
        return next(new AppError('File is required', 400, 'FILE_REQUIRED'));
      }

      if (!required && !file) {
        return next();
      }

      if (file.size > maxSize) {
        return next(new AppError(
          `File size must not exceed ${maxSize / 1024 / 1024}MB`,
          400,
          'FILE_TOO_LARGE'
        ));
      }

      if (!allowedTypes.includes(file.mimetype)) {
        return next(new AppError(
          `File type must be one of: ${allowedTypes.join(', ')}`,
          400,
          'INVALID_FILE_TYPE'
        ));
      }

      next();
    };
  }

  /**
   * Check validation results
   * @static
   * @returns {Function} Express middleware
   */
  static checkValidation() {
    return (req, res, next) => {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(err => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location
        }));

        return next(new AppError(
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: formattedErrors }
        ));
      }

      next();
    };
  }

  /**
   * Sanitize input
   * @static
   * @param {string} field - Field name
   * @returns {Function} Express validator middleware
   */
  static sanitize(field) {
    return body(field)
      .trim()
      .escape()
      .stripLow();
  }
}

module.exports = CommonValidators;
