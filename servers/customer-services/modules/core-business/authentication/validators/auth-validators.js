/**
 * @fileoverview Authentication Validators
 * @module servers/customer-services/modules/core-business/authentication/validators/auth-validators
 * @description Validation middleware for authentication routes
 * @version 1.0.0
 */

const { body, validationResult } = require('express-validator');

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg,
                value: err.value
            }))
        });
    }
    next();
};

/**
 * Validate user registration
 */
const validateRegistration = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail()
        .isLength({ max: 255 })
        .withMessage('Email must not exceed 255 characters'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    
    body('firstName')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('phoneNumber')
        .optional()
        .trim()
        .matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Must be a valid phone number in E.164 format'),
    
    body('dateOfBirth')
        .optional()
        .isISO8601()
        .withMessage('Must be a valid date in ISO 8601 format')
        .custom((value) => {
            const age = Math.floor((new Date() - new Date(value)) / 31557600000);
            return age >= 18;
        })
        .withMessage('User must be at least 18 years old'),
    
    body('termsAccepted')
        .notEmpty()
        .withMessage('Terms and conditions acceptance is required')
        .isBoolean()
        .withMessage('Terms acceptance must be a boolean')
        .equals('true')
        .withMessage('You must accept the terms and conditions'),
    
    body('marketingConsent')
        .optional()
        .isBoolean()
        .withMessage('Marketing consent must be a boolean'),
    
    handleValidationErrors
];

/**
 * Validate user login
 */
const validateLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isString()
        .withMessage('Password must be a string'),
    
    body('rememberMe')
        .optional()
        .isBoolean()
        .withMessage('Remember me must be a boolean'),
    
    body('deviceInfo')
        .optional()
        .isObject()
        .withMessage('Device info must be an object'),
    
    body('deviceInfo.userAgent')
        .optional()
        .isString()
        .withMessage('User agent must be a string'),
    
    body('deviceInfo.ipAddress')
        .optional()
        .isIP()
        .withMessage('Must be a valid IP address'),
    
    handleValidationErrors
];

/**
 * Validate refresh token
 */
const validateRefreshToken = [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token is required')
        .isString()
        .withMessage('Refresh token must be a string')
        .isLength({ min: 20 })
        .withMessage('Invalid refresh token format'),
    
    body('deviceId')
        .optional()
        .isString()
        .withMessage('Device ID must be a string')
        .isLength({ max: 255 })
        .withMessage('Device ID must not exceed 255 characters'),
    
    handleValidationErrors
];

module.exports = {
    validateRegistration,
    validateLogin,
    validateRefreshToken
};