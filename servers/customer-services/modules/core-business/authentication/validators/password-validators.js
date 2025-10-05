/**
 * @fileoverview Password Validators
 * @module servers/customer-services/modules/core-business/authentication/validators/password-validators
 * @description Validation middleware for password management routes
 * @version 1.0.0
 */

const { body, param, validationResult } = require('express-validator');

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
 * Validate password reset request
 */
const validatePasswordReset = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required')
        .isString()
        .withMessage('Reset token must be a string')
        .isLength({ min: 20 })
        .withMessage('Invalid reset token format'),
    
    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    
    handleValidationErrors
];

/**
 * Validate password change
 */
const validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required')
        .isString()
        .withMessage('Current password must be a string'),
    
    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
        .custom((value, { req }) => value !== req.body.currentPassword)
        .withMessage('New password must be different from current password'),
    
    body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    
    body('logoutAllSessions')
        .optional()
        .isBoolean()
        .withMessage('Logout all sessions must be a boolean'),
    
    handleValidationErrors
];

/**
 * Validate password strength validation
 */
const validatePasswordValidation = [
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isString()
        .withMessage('Password must be a string'),
    
    body('userId')
        .optional()
        .isString()
        .withMessage('User ID must be a string'),
    
    handleValidationErrors
];

/**
 * Validate force password reset (admin only)
 */
const validateForcePasswordReset = [
    param('userId')
        .notEmpty()
        .withMessage('User ID is required')
        .isString()
        .withMessage('User ID must be a string'),
    
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason must not exceed 500 characters'),
    
    body('notifyUser')
        .optional()
        .isBoolean()
        .withMessage('Notify user must be a boolean'),
    
    handleValidationErrors
];

module.exports = {
    validatePasswordReset,
    validatePasswordChange,
    validatePasswordValidation,
    validateForcePasswordReset
};