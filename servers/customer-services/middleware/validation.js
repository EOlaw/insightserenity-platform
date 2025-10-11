/**
 * @fileoverview Request Validation Middleware
 * @module shared/lib/middleware/validation
 * @description Comprehensive middleware for validating and sanitizing incoming requests
 */

const { AppError } = require('../../../shared/lib/utils/app-error');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'validation-middleware'
});
const validator = require('validator');

/**
 * Validation rule types
 */
const ValidationRuleTypes = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    EMAIL: 'email',
    URL: 'url',
    UUID: 'uuid',
    DATE: 'date',
    OBJECT: 'object',
    ARRAY: 'array',
    ENUM: 'enum',
    PHONE: 'phone',
    POSTAL_CODE: 'postalCode',
    CREDIT_CARD: 'creditCard',
    IP_ADDRESS: 'ipAddress',
    MONGO_ID: 'mongoId'
};

/**
 * Validation configuration class
 */
class ValidationConfig {
    constructor() {
        this.rules = {};
        this.customValidators = new Map();
    }

    /**
     * Add validation rule for a field
     * @param {string} field - Field name (supports dot notation for nested fields)
     * @param {Object} rule - Validation rule configuration
     * @returns {ValidationConfig} This instance for chaining
     */
    addRule(field, rule) {
        this.rules[field] = {
            type: rule.type || ValidationRuleTypes.STRING,
            required: rule.required !== false,
            min: rule.min,
            max: rule.max,
            minLength: rule.minLength,
            maxLength: rule.maxLength,
            pattern: rule.pattern,
            enum: rule.enum,
            custom: rule.custom,
            message: rule.message,
            sanitize: rule.sanitize !== false,
            trim: rule.trim !== false,
            lowercase: rule.lowercase,
            uppercase: rule.uppercase,
            default: rule.default,
            transform: rule.transform
        };
        return this;
    }

    /**
     * Register custom validator function
     * @param {string} name - Validator name
     * @param {Function} validatorFn - Validation function
     */
    registerCustomValidator(name, validatorFn) {
        this.customValidators.set(name, validatorFn);
    }

    /**
     * Get validation rules
     * @returns {Object} Validation rules
     */
    getRules() {
        return this.rules;
    }

    /**
     * Get custom validator
     * @param {string} name - Validator name
     * @returns {Function|undefined} Validator function
     */
    getCustomValidator(name) {
        return this.customValidators.get(name);
    }
}

/**
 * Request validator class
 */
class RequestValidator {
    /**
     * Validate request data against rules
     * @param {Object} data - Data to validate
     * @param {Object} rules - Validation rules
     * @param {ValidationConfig} config - Validation configuration
     * @returns {Object} Validation result
     */
    static validate(data, rules, config) {
        const errors = [];
        const sanitized = {};

        for (const [field, rule] of Object.entries(rules)) {
            try {
                const value = this._getNestedValue(data, field);
                const result = this._validateField(field, value, rule, config);

                if (result.error) {
                    errors.push(result.error);
                } else {
                    this._setNestedValue(sanitized, field, result.value);
                }
            } catch (error) {
                logger.error('Field validation error', {
                    field,
                    error: error.message
                });
                errors.push({
                    field,
                    message: error.message,
                    type: 'validation_error'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            data: sanitized
        };
    }

    /**
     * Validate individual field
     * @private
     */
    static _validateField(field, value, rule, config) {
        // Handle undefined/null values
        if (value === undefined || value === null) {
            if (rule.required) {
                return {
                    error: {
                        field,
                        message: rule.message || `${field} is required`,
                        type: 'required'
                    }
                };
            }
            return { value: rule.default !== undefined ? rule.default : value };
        }

        // Apply transformations
        let processedValue = value;

        if (rule.trim && typeof processedValue === 'string') {
            processedValue = processedValue.trim();
        }

        if (rule.lowercase && typeof processedValue === 'string') {
            processedValue = processedValue.toLowerCase();
        }

        if (rule.uppercase && typeof processedValue === 'string') {
            processedValue = processedValue.toUpperCase();
        }

        if (rule.transform && typeof rule.transform === 'function') {
            processedValue = rule.transform(processedValue);
        }

        // Type validation
        const typeValidation = this._validateType(field, processedValue, rule);
        if (typeValidation.error) {
            return typeValidation;
        }

        processedValue = typeValidation.value;

        // Length/size validation
        if (rule.minLength !== undefined || rule.maxLength !== undefined) {
            const lengthValidation = this._validateLength(field, processedValue, rule);
            if (lengthValidation.error) {
                return lengthValidation;
            }
        }

        // Min/max validation for numbers
        if (rule.min !== undefined || rule.max !== undefined) {
            const rangeValidation = this._validateRange(field, processedValue, rule);
            if (rangeValidation.error) {
                return rangeValidation;
            }
        }

        // Enum validation
        if (rule.enum && Array.isArray(rule.enum)) {
            if (!rule.enum.includes(processedValue)) {
                return {
                    error: {
                        field,
                        message: rule.message || `${field} must be one of: ${rule.enum.join(', ')}`,
                        type: 'enum',
                        allowedValues: rule.enum
                    }
                };
            }
        }

        // Pattern validation
        if (rule.pattern) {
            const regex = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
            if (!regex.test(String(processedValue))) {
                return {
                    error: {
                        field,
                        message: rule.message || `${field} format is invalid`,
                        type: 'pattern'
                    }
                };
            }
        }

        // Custom validation
        if (rule.custom) {
            let customValidator;
            if (typeof rule.custom === 'string') {
                customValidator = config.getCustomValidator(rule.custom);
            } else if (typeof rule.custom === 'function') {
                customValidator = rule.custom;
            }

            if (customValidator) {
                const customResult = customValidator(processedValue, field, rule);
                if (customResult !== true) {
                    return {
                        error: {
                            field,
                            message: typeof customResult === 'string' ? customResult : (rule.message || `${field} validation failed`),
                            type: 'custom'
                        }
                    };
                }
            }
        }

        return { value: processedValue };
    }

    /**
     * Validate field type
     * @private
     */
    static _validateType(field, value, rule) {
        switch (rule.type) {
            case ValidationRuleTypes.STRING:
                if (typeof value !== 'string') {
                    return {
                        error: {
                            field,
                            message: `${field} must be a string`,
                            type: 'type'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.NUMBER:
                const num = Number(value);
                if (isNaN(num)) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid number`,
                            type: 'type'
                        }
                    };
                }
                return { value: num };

            case ValidationRuleTypes.BOOLEAN:
                if (typeof value === 'boolean') {
                    return { value };
                }
                if (value === 'true' || value === '1' || value === 1) {
                    return { value: true };
                }
                if (value === 'false' || value === '0' || value === 0) {
                    return { value: false };
                }
                return {
                    error: {
                        field,
                        message: `${field} must be a boolean`,
                        type: 'type'
                    }
                };

            case ValidationRuleTypes.EMAIL:
                if (!validator.isEmail(String(value))) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid email address`,
                            type: 'email'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.URL:
                if (!validator.isURL(String(value))) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid URL`,
                            type: 'url'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.UUID:
                if (!validator.isUUID(String(value))) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid UUID`,
                            type: 'uuid'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.DATE:
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid date`,
                            type: 'date'
                        }
                    };
                }
                return { value: date };

            case ValidationRuleTypes.PHONE:
                if (!validator.isMobilePhone(String(value), 'any', { strictMode: false })) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid phone number`,
                            type: 'phone'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.MONGO_ID:
                if (!validator.isMongoId(String(value))) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid MongoDB ObjectId`,
                            type: 'mongoId'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.IP_ADDRESS:
                if (!validator.isIP(String(value))) {
                    return {
                        error: {
                            field,
                            message: `${field} must be a valid IP address`,
                            type: 'ipAddress'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.OBJECT:
                if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                    return {
                        error: {
                            field,
                            message: `${field} must be an object`,
                            type: 'type'
                        }
                    };
                }
                break;

            case ValidationRuleTypes.ARRAY:
                if (!Array.isArray(value)) {
                    return {
                        error: {
                            field,
                            message: `${field} must be an array`,
                            type: 'type'
                        }
                    };
                }
                break;
        }

        return { value };
    }

    /**
     * Validate length/size
     * @private
     */
    static _validateLength(field, value, rule) {
        let length;
        if (typeof value === 'string' || Array.isArray(value)) {
            length = value.length;
        } else {
            return { value };
        }

        if (rule.minLength !== undefined && length < rule.minLength) {
            return {
                error: {
                    field,
                    message: `${field} must be at least ${rule.minLength} characters/items`,
                    type: 'minLength',
                    min: rule.minLength,
                    actual: length
                }
            };
        }

        if (rule.maxLength !== undefined && length > rule.maxLength) {
            return {
                error: {
                    field,
                    message: `${field} must not exceed ${rule.maxLength} characters/items`,
                    type: 'maxLength',
                    max: rule.maxLength,
                    actual: length
                }
            };
        }

        return { value };
    }

    /**
     * Validate numeric range
     * @private
     */
    static _validateRange(field, value, rule) {
        const num = Number(value);
        if (isNaN(num)) {
            return { value };
        }

        if (rule.min !== undefined && num < rule.min) {
            return {
                error: {
                    field,
                    message: `${field} must be at least ${rule.min}`,
                    type: 'min',
                    min: rule.min,
                    actual: num
                }
            };
        }

        if (rule.max !== undefined && num > rule.max) {
            return {
                error: {
                    field,
                    message: `${field} must not exceed ${rule.max}`,
                    type: 'max',
                    max: rule.max,
                    actual: num
                }
            };
        }

        return { value };
    }

    /**
     * Get nested value from object using dot notation
     * @private
     */
    static _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Set nested value in object using dot notation
     * @private
     */
    static _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }
}

/**
 * Validation middleware factory
 * @param {Object|ValidationConfig} schema - Validation schema or config
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function validateRequest(schema, options = {}) {
    const config = schema instanceof ValidationConfig ? schema : new ValidationConfig();
    
    if (!(schema instanceof ValidationConfig)) {
        Object.entries(schema).forEach(([field, rule]) => {
            config.addRule(field, rule);
        });
    }

    const {
        source = 'body', // 'body', 'query', 'params', 'headers'
        stripUnknown = true,
        abortEarly = false,
        context = {}
    } = options;

    return (req, res, next) => {
        try {
            logger.debug('Validating request', {
                source,
                method: req.method,
                path: req.path
            });

            const data = req[source];
            const rules = config.getRules();

            const result = RequestValidator.validate(data, rules, config);

            if (!result.valid) {
                logger.warn('Validation failed', {
                    errors: result.errors,
                    path: req.path
                });

                if (abortEarly && result.errors.length > 0) {
                    throw AppError.validation(result.errors[0].message, {
                        errors: [result.errors[0]]
                    });
                }

                throw AppError.validation('Request validation failed', {
                    errors: result.errors
                });
            }

            // Replace request data with sanitized version
            if (stripUnknown) {
                req[source] = result.data;
            } else {
                req[source] = { ...data, ...result.data };
            }

            // Store validation metadata
            req.validationMetadata = {
                source,
                validated: true,
                timestamp: new Date()
            };

            logger.debug('Validation passed', {
                source,
                fieldsValidated: Object.keys(rules).length
            });

            next();

        } catch (error) {
            if (error instanceof AppError) {
                next(error);
            } else {
                logger.error('Validation middleware error', {
                    error: error.message,
                    stack: error.stack
                });
                next(AppError.internal('Validation processing error'));
            }
        }
    };
}

/**
 * Sanitize request data
 * @param {Object} options - Sanitization options
 * @returns {Function} Express middleware
 */
function sanitizeRequest(options = {}) {
    const {
        xss = true,
        sql = true,
        trim = true,
        lowercase = false,
        stripTags = true
    } = options;

    return (req, res, next) => {
        try {
            ['body', 'query', 'params'].forEach(source => {
                if (req[source] && typeof req[source] === 'object') {
                    req[source] = sanitizeObject(req[source], {
                        xss,
                        sql,
                        trim,
                        lowercase,
                        stripTags
                    });
                }
            });

            next();
        } catch (error) {
            logger.error('Sanitization error', {
                error: error.message
            });
            next(error);
        }
    };
}

/**
 * Sanitize object recursively
 * @private
 */
function sanitizeObject(obj, options) {
    if (typeof obj !== 'object' || obj === null) {
        return sanitizeValue(obj, options);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, options));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value, options);
    }
    return sanitized;
}

/**
 * Sanitize individual value
 * @private
 */
function sanitizeValue(value, options) {
    if (typeof value !== 'string') {
        return value;
    }

    let sanitized = value;

    if (options.trim) {
        sanitized = sanitized.trim();
    }

    if (options.lowercase) {
        sanitized = sanitized.toLowerCase();
    }

    if (options.xss) {
        sanitized = validator.escape(sanitized);
    }

    if (options.stripTags) {
        sanitized = validator.stripLow(sanitized);
    }

    return sanitized;
}

/**
 * Create validation schema builder
 * @returns {ValidationConfig} New validation config
 */
function createSchema() {
    return new ValidationConfig();
}

module.exports = {
    validateRequest,
    sanitizeRequest,
    createSchema,
    ValidationConfig,
    ValidationRuleTypes,
    RequestValidator
};