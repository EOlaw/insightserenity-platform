/**
 * @fileoverview Validation Middleware
 * @module servers/gateway/middleware/validation
 */

/**
 * Validation Middleware
 */
module.exports = (schema = {}) => {
    return (req, res, next) => {
        const errors = [];

        // Validate headers
        if (schema.headers) {
            const headerErrors = validateObject(req.headers, schema.headers, 'header');
            errors.push(...headerErrors);
        }

        // Validate query parameters
        if (schema.query) {
            const queryErrors = validateObject(req.query, schema.query, 'query');
            errors.push(...queryErrors);
        }

        // Validate body
        if (schema.body) {
            const bodyErrors = validateObject(req.body, schema.body, 'body');
            errors.push(...bodyErrors);
        }

        // Validate params
        if (schema.params) {
            const paramErrors = validateObject(req.params, schema.params, 'param');
            errors.push(...paramErrors);
        }

        // If validation errors, return error response
        if (errors.length > 0) {
            return res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed'
                },
                errors: errors
            });
        }

        next();
    };
};

/**
 * Validate object against schema
 */
function validateObject(obj, schema, location) {
    const errors = [];

    // Check required fields
    if (schema.required) {
        for (const field of schema.required) {
            if (obj[field] === undefined || obj[field] === null) {
                errors.push({
                    field: field,
                    location: location,
                    message: `${field} is required`
                });
            }
        }
    }

    // Check field types
    if (schema.properties) {
        for (const [field, rules] of Object.entries(schema.properties)) {
            if (obj[field] !== undefined) {
                // Check type
                if (rules.type && !isType(obj[field], rules.type)) {
                    errors.push({
                        field: field,
                        location: location,
                        message: `${field} must be of type ${rules.type}`
                    });
                }

                // Check min length
                if (rules.minLength && obj[field].length < rules.minLength) {
                    errors.push({
                        field: field,
                        location: location,
                        message: `${field} must be at least ${rules.minLength} characters`
                    });
                }

                // Check max length
                if (rules.maxLength && obj[field].length > rules.maxLength) {
                    errors.push({
                        field: field,
                        location: location,
                        message: `${field} must be at most ${rules.maxLength} characters`
                    });
                }

                // Check pattern
                if (rules.pattern && !new RegExp(rules.pattern).test(obj[field])) {
                    errors.push({
                        field: field,
                        location: location,
                        message: `${field} does not match required pattern`
                    });
                }

                // Check enum
                if (rules.enum && !rules.enum.includes(obj[field])) {
                    errors.push({
                        field: field,
                        location: location,
                        message: `${field} must be one of: ${rules.enum.join(', ')}`
                    });
                }
            }
        }
    }

    return errors;
}

/**
 * Check if value is of specified type
 */
function isType(value, type) {
    switch (type) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && !isNaN(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        default:
            return true;
    }
}
