/**
 * @fileoverview MFA Validators
 * @module servers/customer-services/modules/core-business/authentication/validators/mfa-validators
 * @description Validation middleware for MFA routes
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
 * Validate MFA setup
 */
const validateMfaSetup = [
    body('type')
        .optional()
        .isIn(['totp', 'sms', 'email'])
        .withMessage('MFA type must be one of: totp, sms, email'),
    
    body('phoneNumber')
        .if(body('type').equals('sms'))
        .notEmpty()
        .withMessage('Phone number is required for SMS MFA')
        .matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Must be a valid phone number in E.164 format'),
    
    body('email')
        .if(body('type').equals('email'))
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    
    body('deviceName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Device name must be between 1 and 100 characters'),
    
    handleValidationErrors
];

/**
 * Validate MFA verification
 */
const validateMfaVerification = [
    body('code')
        .notEmpty()
        .withMessage('Verification code is required')
        .isString()
        .withMessage('Code must be a string')
        .trim()
        .matches(/^[0-9]{6}$/)
        .withMessage('Code must be a 6-digit number'),
    
    body('mfaType')
        .optional()
        .isIn(['totp', 'sms', 'email', 'backup'])
        .withMessage('MFA type must be one of: totp, sms, email, backup'),
    
    body('challengeId')
        .optional()
        .isString()
        .withMessage('Challenge ID must be a string')
        .isLength({ min: 20, max: 255 })
        .withMessage('Invalid challenge ID format'),
    
    body('rememberDevice')
        .optional()
        .isBoolean()
        .withMessage('Remember device must be a boolean'),
    
    body('deviceName')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Device name must be between 1 and 100 characters'),
    
    handleValidationErrors
];

/**
 * Validate MFA disable
 */
const validateMfaDisable = [
    body('mfaType')
        .notEmpty()
        .withMessage('MFA type is required')
        .isIn(['totp', 'sms', 'email', 'all'])
        .withMessage('MFA type must be one of: totp, sms, email, all'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required for security verification')
        .isString()
        .withMessage('Password must be a string'),
    
    body('verificationCode')
        .optional()
        .isString()
        .withMessage('Verification code must be a string')
        .trim()
        .matches(/^[0-9]{6}$/)
        .withMessage('Code must be a 6-digit number'),
    
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason must not exceed 500 characters'),
    
    handleValidationErrors
];

module.exports = {
    validateMfaSetup,
    validateMfaVerification,
    validateMfaDisable
};