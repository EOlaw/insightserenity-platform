/**
 * @fileoverview OAuth Validators
 * @module servers/customer-services/modules/core-business/authentication/validators/oauth-validators
 * @description Validation middleware for OAuth routes
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
 * Validate OAuth account linking
 */
const validateOAuthLink = [
    body('provider')
        .notEmpty()
        .withMessage('OAuth provider is required')
        .isIn(['github', 'google', 'linkedin'])
        .withMessage('Provider must be one of: github, google, linkedin'),
    
    body('providerAccountId')
        .notEmpty()
        .withMessage('Provider account ID is required')
        .isString()
        .withMessage('Provider account ID must be a string')
        .isLength({ min: 1, max: 255 })
        .withMessage('Provider account ID must be between 1 and 255 characters'),
    
    body('accessToken')
        .optional()
        .isString()
        .withMessage('Access token must be a string')
        .isLength({ min: 10 })
        .withMessage('Invalid access token format'),
    
    body('refreshToken')
        .optional()
        .isString()
        .withMessage('Refresh token must be a string'),
    
    body('email')
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    
    body('profile')
        .optional()
        .isObject()
        .withMessage('Profile must be an object'),
    
    body('profile.name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Profile name must be between 1 and 255 characters'),
    
    body('profile.avatarUrl')
        .optional()
        .isURL()
        .withMessage('Avatar URL must be a valid URL'),
    
    handleValidationErrors
];

/**
 * Validate OAuth account unlinking
 */
const validateOAuthUnlink = [
    body('provider')
        .notEmpty()
        .withMessage('OAuth provider is required')
        .isIn(['github', 'google', 'linkedin'])
        .withMessage('Provider must be one of: github, google, linkedin'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required for security verification')
        .isString()
        .withMessage('Password must be a string'),
    
    body('confirmUnlink')
        .notEmpty()
        .withMessage('Unlink confirmation is required')
        .isBoolean()
        .withMessage('Confirm unlink must be a boolean')
        .equals('true')
        .withMessage('You must confirm the unlink action'),
    
    handleValidationErrors
];

module.exports = {
    validateOAuthLink,
    validateOAuthUnlink
};