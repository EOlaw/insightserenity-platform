'use strict';

/**
 * @fileoverview Custom validation utilities for specialized use cases
 * @module shared/lib/utils/validators/custom-validators
 */

const { body, validationResult } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class CustomValidators
 * @description Custom validation rules for specialized requirements
 */
class CustomValidators {
  /**
   * Validate business rules
   * @static
   * @param {Function} validator - Custom validator function
   * @param {string} [errorMessage] - Error message
   * @returns {Function} Express middleware
   */
  static businessRule(validator, errorMessage = 'Business rule validation failed') {
    return async (req, res, next) => {
      try {
        const isValid = await validator(req);
        if (!isValid) {
          return next(new AppError(errorMessage, 400, 'BUSINESS_RULE_VIOLATION'));
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Validate conditional requirements
   * @static
   * @param {string} field - Field to validate
   * @param {Function} condition - Condition function
   * @param {Function} validator - Validator to apply if condition is true
   * @returns {Function} Express validator middleware
   */
  static conditional(field, condition, validator) {
    return body(field).custom((value, { req }) => {
      if (condition(req)) {
        return validator(value, req);
      }
      return true;
    });
  }

  /**
   * Validate dependent fields
   * @static
   * @param {Object} dependencies - Field dependencies
   * @returns {Array} Array of validators
   */
  static dependencies(dependencies) {
    const validators = [];

    for (const [field, config] of Object.entries(dependencies)) {
      validators.push(
        body(field).custom((value, { req }) => {
          if (value) {
            for (const requiredField of config.requires || []) {
              if (!req.body[requiredField]) {
                throw new Error(`${field} requires ${requiredField} to be provided`);
              }
            }
          }

          if (config.excludes) {
            for (const excludedField of config.excludes) {
              if (value && req.body[excludedField]) {
                throw new Error(`${field} cannot be used with ${excludedField}`);
              }
            }
          }

          return true;
        })
      );
    }

    return validators;
  }

  /**
   * Validate cron expression
   * @static
   * @param {string} [field='schedule'] - Field name
   * @returns {Function} Express validator middleware
   */
  static cronExpression(field = 'schedule') {
    return body(field)
      .optional()
      .matches(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/)
      .withMessage('Invalid cron expression');
  }

  /**
   * Validate coordinates
   * @static
   * @param {string} [latField='latitude'] - Latitude field
   * @param {string} [lngField='longitude'] - Longitude field
   * @returns {Array} Array of validators
   */
  static coordinates(latField = 'latitude', lngField = 'longitude') {
    return [
      body(latField)
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be between -90 and 90'),

      body(lngField)
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be between -180 and 180')
    ];
  }

  /**
   * Validate color code
   * @static
   * @param {string} [field='color'] - Field name
   * @returns {Function} Express validator middleware
   */
  static colorCode(field = 'color') {
    return body(field)
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage('Invalid color code format');
  }

  /**
   * Validate semantic version
   * @static
   * @param {string} [field='version'] - Field name
   * @returns {Function} Express validator middleware
   */
  static semver(field = 'version') {
    return body(field)
      .optional()
      .matches(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/)
      .withMessage('Invalid semantic version format');
  }

  /**
   * Validate IBAN
   * @static
   * @param {string} [field='iban'] - Field name
   * @returns {Function} Express validator middleware
   */
  static iban(field = 'iban') {
    return body(field)
      .optional()
      .isIBAN()
      .withMessage('Invalid IBAN format');
  }

  /**
   * Validate BIC/SWIFT code
   * @static
   * @param {string} [field='bic'] - Field name
   * @returns {Function} Express validator middleware
   */
  static bic(field = 'bic') {
    return body(field)
      .optional()
      .isBIC()
      .withMessage('Invalid BIC/SWIFT code');
  }

  /**
   * Validate tax ID
   * @static
   * @param {string} [field='taxId'] - Field name
   * @param {string} [locale='US'] - Locale for tax ID format
   * @returns {Function} Express validator middleware
   */
  static taxId(field = 'taxId', locale = 'US') {
    return body(field)
      .optional()
      .isTaxID(locale)
      .withMessage(`Invalid tax ID format for ${locale}`);
  }

  /**
   * Validate file extension
   * @static
   * @param {string} field - Field name
   * @param {Array<string>} extensions - Allowed extensions
   * @returns {Function} Express middleware
   */
  static fileExtension(field, extensions) {
    return (req, res, next) => {
      const file = req.files?.[field] || req.file;

      if (!file) {
        return next();
      }

      const fileExt = file.originalname.split('.').pop().toLowerCase();

      if (!extensions.includes(fileExt)) {
        return next(new AppError(
          `File extension must be one of: ${extensions.join(', ')}`,
          400,
          'INVALID_FILE_EXTENSION'
        ));
      }

      next();
    };
  }

  /**
   * Validate data range consistency
   * @static
   * @param {string} startField - Start field name
   * @param {string} endField - End field name
   * @param {string} [type='date'] - Type of comparison (date, number)
   * @returns {Function} Express validator middleware
   */
  static range(startField, endField, type = 'date') {
    return body(endField).custom((value, { req }) => {
      if (!value || !req.body[startField]) {
        return true;
      }

      if (type === 'date') {
        return new Date(value) > new Date(req.body[startField]);
      } else if (type === 'number') {
        return Number(value) > Number(req.body[startField]);
      }

      return value > req.body[startField];
    }).withMessage(`${endField} must be greater than ${startField}`);
  }

  /**
   * Validate complex password requirements
   * @static
   * @param {string} [field='password'] - Field name
   * @param {Object} [requirements={}] - Password requirements
   * @returns {Function} Express validator middleware
   */
  static complexPassword(field = 'password', requirements = {}) {
    const {
      minLength = 12,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecialChars = true,
      prohibitCommon = true
    } = requirements;

    return body(field)
      .isLength({ min: minLength })
      .withMessage(`Password must be at least ${minLength} characters`)
      .custom(value => {
        if (requireUppercase && !/[A-Z]/.test(value)) {
          throw new Error('Password must contain at least one uppercase letter');
        }
        if (requireLowercase && !/[a-z]/.test(value)) {
          throw new Error('Password must contain at least one lowercase letter');
        }
        if (requireNumbers && !/\d/.test(value)) {
          throw new Error('Password must contain at least one number');
        }
        if (requireSpecialChars && !/[@$!%*?&]/.test(value)) {
          throw new Error('Password must contain at least one special character');
        }
        if (prohibitCommon) {
          const commonPasswords = ['password', '123456', 'qwerty'];
          if (commonPasswords.some(common => value.toLowerCase().includes(common))) {
            throw new Error('Password is too common');
          }
        }
        return true;
      });
  }

  /**
   * Validate database query
   * @static
   * @returns {Array} Array of validators
   */
  static databaseQuery() {
    return [
      body('filter')
        .optional()
        .isJSON()
        .withMessage('Filter must be valid JSON'),

      body('projection')
        .optional()
        .isJSON()
        .withMessage('Projection must be valid JSON'),

      body('options.limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Limit must be between 1 and 1000'),

      body('options.skip')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Skip must be non-negative')
    ];
  }

  /**
   * Create custom async validator
   * @static
   * @param {string} field - Field name
   * @param {Function} validator - Async validator function
   * @param {string} [errorMessage] - Error message
   * @returns {Function} Express validator middleware
   */
  static async(field, validator, errorMessage = 'Validation failed') {
    return body(field).custom(async (value, { req }) => {
      const isValid = await validator(value, req);
      if (!isValid) {
        throw new Error(errorMessage);
      }
      return true;
    });
  }
}

module.exports = CustomValidators;
