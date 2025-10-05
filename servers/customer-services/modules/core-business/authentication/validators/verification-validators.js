/**
 * @fileoverview Verification Validators
 * @module servers/customer-services/modules/core-business/authentication/validators/verification-validators
 * @description Validation middleware for email and phone verification routes
 * @version 1.0.0
 */

const { body, query, validationResult } = require('express-validator');

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
 * Validate email verification
 */
const validateEmailVerification = [
    body('token')
        .if(body('code').not().exists())
        .notEmpty()
        .withMessage('Verification token is required')
        .isString()
        .withMessage('Token must be a string')
        .isLength({ min: 20 })
        .withMessage('Invalid token format'),
    
    body('code')
        .if(body('token').not().exists())
        .notEmpty()
        .withMessage('Verification code is required')
        .isString()
        .withMessage('Code must be a string')
        .trim()
        .matches(/^[0-9]{6}$/)
        .withMessage('Code must be a 6-digit number'),
    
    body('email')
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    
    query('token')
        .optional()
        .isString()
        .withMessage('Query token must be a string'),
    
    handleValidationErrors
];

/**
 * Validate phone verification
 */
const validatePhoneVerification = [
    body('phoneNumber')
        .if((value, { req }) => !req.body.code)
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+?[1-9]\d{1,14}$/)
        .withMessage('Must be a valid phone number in E.164 format'),
    
    body('code')
        .if((value, { req }) => req.method === 'POST' && req.path.includes('/verify'))
        .notEmpty()
        .withMessage('Verification code is required')
        .isString()
        .withMessage('Code must be a string')
        .trim()
        .matches(/^[0-9]{6}$/)
        .withMessage('Code must be a 6-digit number'),
    
    body('verificationId')
        .optional()
        .isString()
        .withMessage('Verification ID must be a string'),
    
    body('method')
        .optional()
        .isIn(['sms', 'call'])
        .withMessage('Method must be either sms or call'),
    
    handleValidationErrors
];

/**
 * Validate document verification (KYC)
 */
const validateDocumentVerification = [
    body('documentType')
        .notEmpty()
        .withMessage('Document type is required')
        .isIn(['passport', 'drivers_license', 'national_id', 'residence_permit'])
        .withMessage('Document type must be one of: passport, drivers_license, national_id, residence_permit'),
    
    body('documentNumber')
        .notEmpty()
        .withMessage('Document number is required')
        .trim()
        .isLength({ min: 5, max: 50 })
        .withMessage('Document number must be between 5 and 50 characters')
        .matches(/^[A-Z0-9-]+$/i)
        .withMessage('Document number can only contain letters, numbers, and hyphens'),
    
    body('issuingCountry')
        .notEmpty()
        .withMessage('Issuing country is required')
        .isISO31661Alpha2()
        .withMessage('Must be a valid ISO 3166-1 alpha-2 country code'),
    
    body('expiryDate')
        .notEmpty()
        .withMessage('Expiry date is required')
        .isISO8601()
        .withMessage('Must be a valid date in ISO 8601 format')
        .custom((value) => {
            const expiry = new Date(value);
            const now = new Date();
            return expiry > now;
        })
        .withMessage('Document must not be expired'),
    
    body('dateOfBirth')
        .notEmpty()
        .withMessage('Date of birth is required')
        .isISO8601()
        .withMessage('Must be a valid date in ISO 8601 format')
        .custom((value) => {
            const age = Math.floor((new Date() - new Date(value)) / 31557600000);
            return age >= 18;
        })
        .withMessage('User must be at least 18 years old'),
    
    body('frontImageUrl')
        .notEmpty()
        .withMessage('Front image URL is required')
        .isURL()
        .withMessage('Must be a valid URL'),
    
    body('backImageUrl')
        .optional()
        .isURL()
        .withMessage('Must be a valid URL'),
    
    body('selfieImageUrl')
        .optional()
        .isURL()
        .withMessage('Must be a valid URL'),
    
    body('address')
        .optional()
        .isObject()
        .withMessage('Address must be an object'),
    
    body('address.street')
        .optional()
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Street must be between 1 and 255 characters'),
    
    body('address.city')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('City must be between 1 and 100 characters'),
    
    body('address.state')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('State must be between 1 and 100 characters'),
    
    body('address.postalCode')
        .optional()
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Postal code must be between 3 and 20 characters'),
    
    body('address.country')
        .optional()
        .isISO31661Alpha2()
        .withMessage('Must be a valid ISO 3166-1 alpha-2 country code'),
    
    handleValidationErrors
];

module.exports = {
    validateEmailVerification,
    validatePhoneVerification,
    validateDocumentVerification
};