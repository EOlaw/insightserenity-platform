/**
 * @file Request/Response Transformation Middleware
 * @description Advanced request/response transformation middleware for customer services with
 *              data normalization, format conversion, and business logic transformations
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/middleware/request-transform
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/services/cache-service
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const CacheService = require('../../../shared/lib/services/cache-service');

/**
 * Request/Response Transformation Middleware
 * Features:
 * - Data format conversion (JSON, XML, CSV, YAML)
 * - Business object transformation
 * - Multi-tenant data normalization
 * - API response standardization
 * - Field mapping and aliasing
 * - Data validation and sanitization
 * - Localization and internationalization
 * - Legacy system compatibility
 * - Real-time data enrichment
 * - Performance optimization
 */
class RequestTransformMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            enableRequestTransform: options.enableRequestTransform !== false,
            enableResponseTransform: options.enableResponseTransform !== false,
            enableFormatConversion: options.enableFormatConversion !== false,
            enableFieldMapping: options.enableFieldMapping !== false,
            enableDataEnrichment: options.enableDataEnrichment !== false,
            enableLocalization: options.enableLocalization !== false,
            
            // Supported formats
            supportedFormats: {
                input: ['json', 'xml', 'csv', 'yaml', 'form-data'],
                output: ['json', 'xml', 'csv', 'yaml']
            },

            // Default transformations
            defaultTransformations: {
                // Standardize timestamps
                timestamps: {
                    enabled: true,
                    inputFormats: ['ISO8601', 'Unix', 'RFC3339'],
                    outputFormat: 'ISO8601'
                },

                // Standardize pagination
                pagination: {
                    enabled: true,
                    defaultLimit: 20,
                    maxLimit: 100,
                    offsetBased: true,
                    cursorBased: false
                },

                // Response standardization
                responses: {
                    enabled: true,
                    standardFormat: {
                        success: true,
                        data: null,
                        message: null,
                        meta: {
                            timestamp: null,
                            version: null,
                            requestId: null
                        },
                        pagination: null,
                        errors: null
                    }
                },

                // Error standardization
                errors: {
                    enabled: true,
                    includeStack: false, // Only in development
                    includeRequestId: true,
                    standardCodes: true
                }
            },

            // Business object transformations
            businessTransforms: {
                // User object transformations
                user: {
                    input: {
                        fieldMappings: {
                            'firstName': 'profile.firstName',
                            'lastName': 'profile.lastName',
                            'email': 'email',
                            'phoneNumber': 'profile.phone'
                        },
                        requiredFields: ['email'],
                        sanitization: {
                            'email': 'email',
                            'profile.firstName': 'name',
                            'profile.lastName': 'name'
                        }
                    },
                    output: {
                        exclude: ['password', 'salt', '__v'],
                        transforms: {
                            'fullName': (obj) => `${obj.profile?.firstName || ''} ${obj.profile?.lastName || ''}`.trim(),
                            'displayName': (obj) => obj.profile?.displayName || obj.email
                        }
                    }
                },

                // Project object transformations
                project: {
                    input: {
                        fieldMappings: {
                            'projectName': 'name',
                            'clientCompany': 'client.name',
                            'startDate': 'timeline.startDate',
                            'endDate': 'timeline.endDate'
                        },
                        validation: {
                            'name': { required: true, minLength: 3 },
                            'timeline.startDate': { required: true, type: 'date' }
                        }
                    },
                    output: {
                        transforms: {
                            'duration': (obj) => obj.timeline?.endDate && obj.timeline?.startDate 
                                ? Math.ceil((new Date(obj.timeline.endDate) - new Date(obj.timeline.startDate)) / (1000 * 60 * 60 * 24))
                                : null,
                            'progress': (obj) => this.calculateProjectProgress(obj)
                        }
                    }
                },

                // Job posting transformations
                job: {
                    input: {
                        fieldMappings: {
                            'jobTitle': 'title',
                            'jobDescription': 'description',
                            'salaryMin': 'compensation.salary.min',
                            'salaryMax': 'compensation.salary.max'
                        },
                        enrichment: {
                            'location': 'enrichLocationData',
                            'skills': 'enrichSkillsData'
                        }
                    },
                    output: {
                        transforms: {
                            'formattedSalary': (obj) => this.formatSalaryRange(obj.compensation?.salary),
                            'skillsCount': (obj) => obj.requirements?.skills?.length || 0,
                            'applicationsCount': (obj) => obj.applications?.length || 0
                        }
                    }
                }
            },

            // Localization configuration
            localization: {
                defaultLocale: 'en-US',
                supportedLocales: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE'],
                dateFormats: {
                    'en-US': 'MM/DD/YYYY',
                    'en-GB': 'DD/MM/YYYY',
                    'es-ES': 'DD/MM/YYYY',
                    'fr-FR': 'DD/MM/YYYY',
                    'de-DE': 'DD.MM.YYYY'
                },
                currencyFormats: {
                    'en-US': 'USD',
                    'en-GB': 'GBP',
                    'es-ES': 'EUR',
                    'fr-FR': 'EUR',
                    'de-DE': 'EUR'
                }
            },

            // Performance settings
            performance: {
                enableCaching: options.cachingEnabled !== false,
                cacheTransforms: true,
                cacheTTL: 300, // 5 minutes
                maxTransformSize: 10 * 1024 * 1024, // 10MB
                enableCompression: true
            }
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.transformCache = new Map();
        this.transformMetrics = new Map();
        
        // Transformation functions
        this.requestTransformers = new Map();
        this.responseTransformers = new Map();
        this.formatConverters = new Map();
        this.fieldMappers = new Map();
        this.enrichers = new Map();

        this.initializeTransformers();
        this.initializeFormatConverters();
        this.initializeEnrichers();
        this.initializeBackgroundProcesses();

        console.log('Request transformation middleware initialized');
        logger.info('Request transformation middleware initialized', {
            enabled: this.config.enabled,
            requestTransform: this.config.enableRequestTransform,
            responseTransform: this.config.enableResponseTransform,
            formatConversion: this.config.enableFormatConversion,
            fieldMapping: this.config.enableFieldMapping,
            dataEnrichment: this.config.enableDataEnrichment,
            localization: this.config.enableLocalization
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    transform = async (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        const startTime = Date.now();

        try {
            console.log(`Processing transformations for ${req.method} ${req.path}`);

            // Initialize transform context
            req.transform = {
                startTime,
                inputFormat: this.detectInputFormat(req),
                outputFormat: this.detectOutputFormat(req),
                locale: this.detectLocale(req),
                businessObject: this.detectBusinessObject(req.path),
                transformations: [],
                metrics: {
                    requestTransformTime: 0,
                    responseTransformTime: 0,
                    enrichmentTime: 0,
                    validationTime: 0
                },
                cached: false,
                errors: [],
                warnings: []
            };

            // Apply request transformations
            if (this.config.enableRequestTransform) {
                const requestTransformStart = Date.now();
                await this.applyRequestTransformations(req);
                req.transform.metrics.requestTransformTime = Date.now() - requestTransformStart;
            }

            // Hook response transformations
            if (this.config.enableResponseTransform) {
                this.hookResponseTransformations(req, res);
            }

            // Set transformation headers
            this.setTransformHeaders(res, req.transform);

            const duration = Date.now() - startTime;
            console.log(`Request transformations completed in ${duration}ms`);

            next();

        } catch (error) {
            console.error(`Request transformation failed for ${req.path}:`, error.message);
            logger.error('Request transformation middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                requestId: req.requestId
            });

            // Set fallback transform context
            req.transform = {
                inputFormat: 'json',
                outputFormat: 'json',
                locale: this.config.localization.defaultLocale,
                businessObject: 'generic',
                transformations: [],
                metrics: {},
                cached: false,
                errors: [error.message],
                warnings: [],
                fallback: true
            };

            next();
        }
    };

    /**
     * Detect input format from request
     */
    detectInputFormat(req) {
        const contentType = req.get('content-type') || '';
        
        if (contentType.includes('application/json')) return 'json';
        if (contentType.includes('application/xml') || contentType.includes('text/xml')) return 'xml';
        if (contentType.includes('text/csv')) return 'csv';
        if (contentType.includes('application/x-yaml') || contentType.includes('text/yaml')) return 'yaml';
        if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) return 'form-data';
        
        return 'json'; // default
    }

    /**
     * Detect desired output format from request
     */
    detectOutputFormat(req) {
        // Check Accept header
        const accept = req.get('accept') || '';
        
        if (accept.includes('application/xml')) return 'xml';
        if (accept.includes('text/csv')) return 'csv';
        if (accept.includes('application/x-yaml')) return 'yaml';
        
        // Check query parameter
        const format = req.query.format;
        if (format && this.config.supportedFormats.output.includes(format)) {
            return format;
        }
        
        return 'json'; // default
    }

    /**
     * Detect locale from request
     */
    detectLocale(req) {
        // Check explicit locale header
        const localeHeader = req.get('x-locale') || req.get('accept-language');
        
        if (localeHeader) {
            const preferredLocale = localeHeader.split(',')[0].trim();
            if (this.config.localization.supportedLocales.includes(preferredLocale)) {
                return preferredLocale;
            }
        }
        
        // Check user preferences
        if (req.user?.preferences?.locale) {
            const userLocale = req.user.preferences.locale;
            if (this.config.localization.supportedLocales.includes(userLocale)) {
                return userLocale;
            }
        }
        
        return this.config.localization.defaultLocale;
    }

    /**
     * Detect business object type from path
     */
    detectBusinessObject(path) {
        const pathSegments = path.split('/').filter(Boolean);
        
        // Look for business object indicators
        const businessObjects = ['users', 'projects', 'clients', 'consultants', 'jobs', 'candidates', 'applications', 'engagements'];
        
        for (const segment of pathSegments) {
            for (const businessObject of businessObjects) {
                if (segment.includes(businessObject)) {
                    return businessObject.slice(0, -1); // Remove 's' (users -> user)
                }
            }
        }
        
        return 'generic';
    }

    /**
     * Apply request transformations
     */
    async applyRequestTransformations(req) {
        console.log(`Applying request transformations for ${req.transform.businessObject}`);

        try {
            // Format conversion
            if (req.transform.inputFormat !== 'json' && this.config.enableFormatConversion) {
                await this.convertInputFormat(req);
            }

            // Business object transformation
            const businessTransform = this.config.businessTransforms[req.transform.businessObject];
            if (businessTransform?.input) {
                await this.applyBusinessInputTransform(req, businessTransform.input);
            }

            // Field mapping
            if (this.config.enableFieldMapping) {
                await this.applyFieldMapping(req);
            }

            // Data enrichment
            if (this.config.enableDataEnrichment) {
                const enrichmentStart = Date.now();
                await this.applyDataEnrichment(req);
                req.transform.metrics.enrichmentTime = Date.now() - enrichmentStart;
            }

            // Validation
            const validationStart = Date.now();
            await this.applyValidation(req);
            req.transform.metrics.validationTime = Date.now() - validationStart;

            // Pagination standardization
            if (req.query && (req.query.page || req.query.limit || req.query.offset)) {
                this.standardizePagination(req);
            }

            console.log(`Request transformations completed for ${req.transform.businessObject}`);

        } catch (error) {
            console.error('Error in request transformations:', error.message);
            req.transform.errors.push(error.message);
            throw error;
        }
    }

    /**
     * Convert input format to JSON
     */
    async convertInputFormat(req) {
        const converter = this.formatConverters.get(req.transform.inputFormat);
        if (!converter) {
            throw new Error(`No converter available for format: ${req.transform.inputFormat}`);
        }

        console.log(`Converting input from ${req.transform.inputFormat} to JSON`);
        
        try {
            const originalBody = req.body || req.rawBody;
            req.body = await converter.toJson(originalBody);
            req.transform.transformations.push(`input_format_conversion:${req.transform.inputFormat}`);
            console.log(`Successfully converted input from ${req.transform.inputFormat}`);
        } catch (error) {
            console.error(`Input format conversion failed:`, error.message);
            throw new Error(`Input format conversion failed: ${error.message}`);
        }
    }

    /**
     * Apply business object input transformations
     */
    async applyBusinessInputTransform(req, inputConfig) {
        console.log('Applying business input transformations');

        try {
            // Field mappings
            if (inputConfig.fieldMappings && req.body) {
                req.body = this.applyFieldMappings(req.body, inputConfig.fieldMappings);
                req.transform.transformations.push('field_mappings');
            }

            // Required field validation
            if (inputConfig.requiredFields && req.body) {
                this.validateRequiredFields(req.body, inputConfig.requiredFields);
                req.transform.transformations.push('required_validation');
            }

            // Data sanitization
            if (inputConfig.sanitization && req.body) {
                req.body = await this.sanitizeData(req.body, inputConfig.sanitization);
                req.transform.transformations.push('data_sanitization');
            }

            // Custom validation rules
            if (inputConfig.validation && req.body) {
                await this.applyCustomValidation(req.body, inputConfig.validation);
                req.transform.transformations.push('custom_validation');
            }

            console.log('Business input transformations completed');

        } catch (error) {
            console.error('Business input transformation failed:', error.message);
            throw error;
        }
    }

    /**
     * Apply field mappings
     */
    applyFieldMappings(data, mappings) {
        const result = { ...data };
        
        for (const [sourceField, targetField] of Object.entries(mappings)) {
            if (data[sourceField] !== undefined) {
                this.setNestedValue(result, targetField, data[sourceField]);
                if (sourceField !== targetField) {
                    delete result[sourceField];
                }
            }
        }
        
        return result;
    }

    /**
     * Set nested object value using dot notation
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Get nested object value using dot notation
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Validate required fields
     */
    validateRequiredFields(data, requiredFields) {
        const missingFields = [];
        
        for (const field of requiredFields) {
            const value = this.getNestedValue(data, field);
            if (value === undefined || value === null || value === '') {
                missingFields.push(field);
            }
        }
        
        if (missingFields.length > 0) {
            throw new AppError(
                `Missing required fields: ${missingFields.join(', ')}`,
                400,
                'MISSING_REQUIRED_FIELDS',
                { missingFields }
            );
        }
    }

    /**
     * Sanitize data based on field types
     */
    async sanitizeData(data, sanitizationRules) {
        const sanitized = { ...data };
        
        for (const [field, sanitationType] of Object.entries(sanitizationRules)) {
            const value = this.getNestedValue(sanitized, field);
            if (value !== undefined) {
                const sanitizedValue = await this.sanitizeValue(value, sanitationType);
                this.setNestedValue(sanitized, field, sanitizedValue);
            }
        }
        
        return sanitized;
    }

    /**
     * Sanitize individual value
     */
    async sanitizeValue(value, type) {
        if (typeof value !== 'string') return value;
        
        switch (type) {
            case 'email':
                return value.toLowerCase().trim();
            case 'name':
                return value.trim().replace(/\s+/g, ' ');
            case 'phone':
                return value.replace(/[^\d+\-\(\)\s]/g, '');
            case 'html':
                // Basic HTML sanitization (in production, use a proper HTML sanitizer)
                return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            default:
                return value.trim();
        }
    }

    /**
     * Apply custom validation rules
     */
    async applyCustomValidation(data, validationRules) {
        for (const [field, rules] of Object.entries(validationRules)) {
            const value = this.getNestedValue(data, field);
            
            if (rules.required && (value === undefined || value === null || value === '')) {
                throw new AppError(`Field ${field} is required`, 400, 'VALIDATION_ERROR');
            }
            
            if (value !== undefined && value !== null) {
                if (rules.type && !this.validateType(value, rules.type)) {
                    throw new AppError(`Field ${field} must be of type ${rules.type}`, 400, 'VALIDATION_ERROR');
                }
                
                if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
                    throw new AppError(`Field ${field} must be at least ${rules.minLength} characters`, 400, 'VALIDATION_ERROR');
                }
                
                if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                    throw new AppError(`Field ${field} must be no more than ${rules.maxLength} characters`, 400, 'VALIDATION_ERROR');
                }
            }
        }
    }

    /**
     * Validate value type
     */
    validateType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'date':
                return !isNaN(Date.parse(value));
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            case 'url':
                try {
                    new URL(value);
                    return true;
                } catch {
                    return false;
                }
            default:
                return true;
        }
    }

    /**
     * Apply data enrichment
     */
    async applyDataEnrichment(req) {
        const businessTransform = this.config.businessTransforms[req.transform.businessObject];
        if (!businessTransform?.input?.enrichment) return;

        console.log('Applying data enrichment');

        for (const [field, enrichmentType] of Object.entries(businessTransform.input.enrichment)) {
            const value = this.getNestedValue(req.body, field);
            if (value) {
                const enricher = this.enrichers.get(enrichmentType);
                if (enricher) {
                    try {
                        const enrichedValue = await enricher(value, req);
                        this.setNestedValue(req.body, field, enrichedValue);
                        req.transform.transformations.push(`enrichment:${field}`);
                    } catch (error) {
                        console.error(`Enrichment failed for ${field}:`, error.message);
                        req.transform.warnings.push(`Enrichment failed for ${field}: ${error.message}`);
                    }
                }
            }
        }
    }

    /**
     * Standardize pagination parameters
     */
    standardizePagination(req) {
        const config = this.config.defaultTransformations.pagination;
        
        // Standardize limit
        let limit = parseInt(req.query.limit, 10) || config.defaultLimit;
        limit = Math.min(limit, config.maxLimit);
        req.query.limit = limit;

        // Standardize offset/page
        if (req.query.page) {
            const page = Math.max(1, parseInt(req.query.page, 10));
            req.query.offset = (page - 1) * limit;
            req.query.page = page;
        } else if (req.query.offset) {
            req.query.offset = Math.max(0, parseInt(req.query.offset, 10));
            req.query.page = Math.floor(req.query.offset / limit) + 1;
        } else {
            req.query.offset = 0;
            req.query.page = 1;
        }

        req.transform.transformations.push('pagination_standardization');
    }

    /**
     * Hook response transformations
     */
    hookResponseTransformations(req, res) {
        const originalSend = res.send;
        const originalJson = res.json;

        res.send = (body) => {
            try {
                const responseTransformStart = Date.now();
                const transformedBody = this.applyResponseTransformations(body, req, res);
                req.transform.metrics.responseTransformTime = Date.now() - responseTransformStart;
                return originalSend.call(res, transformedBody);
            } catch (error) {
                console.error('Response transformation failed:', error.message);
                req.transform.errors.push(`Response transformation failed: ${error.message}`);
                return originalSend.call(res, body);
            }
        };

        res.json = (data) => {
            try {
                const responseTransformStart = Date.now();
                const transformedData = this.applyResponseTransformations(data, req, res);
                req.transform.metrics.responseTransformTime = Date.now() - responseTransformStart;
                return originalJson.call(res, transformedData);
            } catch (error) {
                console.error('JSON response transformation failed:', error.message);
                req.transform.errors.push(`JSON response transformation failed: ${error.message}`);
                return originalJson.call(res, data);
            }
        };
    }

    /**
     * Apply response transformations
     */
    applyResponseTransformations(data, req, res) {
        console.log(`Applying response transformations for ${req.transform.businessObject}`);

        try {
            let transformedData = data;

            // Parse JSON strings
            if (typeof transformedData === 'string') {
                try {
                    transformedData = JSON.parse(transformedData);
                } catch {
                    // Not JSON, leave as string
                }
            }

            // Standardize response format
            if (this.config.defaultTransformations.responses.enabled) {
                transformedData = this.standardizeResponse(transformedData, req, res);
            }

            // Apply business object output transformations
            const businessTransform = this.config.businessTransforms[req.transform.businessObject];
            if (businessTransform?.output && transformedData.data) {
                transformedData.data = this.applyBusinessOutputTransform(transformedData.data, businessTransform.output, req);
            }

            // Apply localization
            if (this.config.enableLocalization && req.transform.locale !== this.config.localization.defaultLocale) {
                transformedData = this.applyLocalization(transformedData, req.transform.locale);
            }

            // Format conversion for output
            if (req.transform.outputFormat !== 'json') {
                return this.convertOutputFormat(transformedData, req.transform.outputFormat);
            }

            return transformedData;

        } catch (error) {
            console.error('Response transformation error:', error.message);
            return data;
        }
    }

    /**
     * Standardize response format
     */
    standardizeResponse(data, req, res) {
        // If already in standard format, return as is
        if (data && typeof data === 'object' && data.hasOwnProperty('success')) {
            return data;
        }

        const standardResponse = {
            success: res.statusCode < 400,
            data: data,
            message: null,
            meta: {
                timestamp: new Date().toISOString(),
                version: req.apiVersion?.finalVersion || 'v1',
                requestId: req.requestId
            },
            pagination: null,
            errors: null
        };

        // Add pagination info if available
        if (req.pagination) {
            standardResponse.pagination = req.pagination;
        }

        // Handle error responses
        if (!standardResponse.success) {
            standardResponse.errors = data?.errors || [data?.message || 'Unknown error'];
            standardResponse.data = null;
        }

        return standardResponse;
    }

    /**
     * Apply business object output transformations
     */
    applyBusinessOutputTransform(data, outputConfig, req) {
        let transformedData = Array.isArray(data) ? [...data] : { ...data };

        // Apply exclusions
        if (outputConfig.exclude) {
            transformedData = this.excludeFields(transformedData, outputConfig.exclude);
        }

        // Apply transformations
        if (outputConfig.transforms) {
            transformedData = this.applyOutputTransforms(transformedData, outputConfig.transforms);
        }

        return transformedData;
    }

    /**
     * Exclude specified fields from response
     */
    excludeFields(data, excludeFields) {
        if (Array.isArray(data)) {
            return data.map(item => this.excludeFields(item, excludeFields));
        }

        if (data && typeof data === 'object') {
            const filtered = { ...data };
            for (const field of excludeFields) {
                if (field.includes('.')) {
                    // Handle nested field exclusions
                    const [parent, ...rest] = field.split('.');
                    if (filtered[parent] && typeof filtered[parent] === 'object') {
                        filtered[parent] = this.excludeFields(filtered[parent], [rest.join('.')]);
                    }
                } else {
                    delete filtered[field];
                }
            }
            return filtered;
        }

        return data;
    }

    /**
     * Apply output transforms
     */
    applyOutputTransforms(data, transforms) {
        if (Array.isArray(data)) {
            return data.map(item => this.applyOutputTransforms(item, transforms));
        }

        if (data && typeof data === 'object') {
            const transformed = { ...data };
            
            for (const [field, transformer] of Object.entries(transforms)) {
                try {
                    if (typeof transformer === 'function') {
                        transformed[field] = transformer(data);
                    }
                } catch (error) {
                    console.error(`Transform function failed for ${field}:`, error.message);
                }
            }
            
            return transformed;
        }

        return data;
    }

    /**
     * Apply localization
     */
    applyLocalization(data, locale) {
        // This is a simplified localization implementation
        // In production, you would use a proper i18n library
        
        if (data && typeof data === 'object') {
            const localized = { ...data };
            
            // Localize dates
            if (localized.meta && localized.meta.timestamp) {
                const dateFormat = this.config.localization.dateFormats[locale];
                if (dateFormat) {
                    // Apply locale-specific date formatting
                    localized.meta.localizedTimestamp = this.formatDateForLocale(
                        localized.meta.timestamp, 
                        locale
                    );
                }
            }
            
            return localized;
        }
        
        return data;
    }

    /**
     * Format date for specific locale
     */
    formatDateForLocale(dateString, locale) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(locale);
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Convert output to different format
     */
    convertOutputFormat(data, format) {
        const converter = this.formatConverters.get(format);
        if (!converter) {
            console.warn(`No converter available for output format: ${format}`);
            return data;
        }

        try {
            return converter.fromJson(data);
        } catch (error) {
            console.error(`Output format conversion failed for ${format}:`, error.message);
            return data;
        }
    }

    /**
     * Set transformation headers
     */
    setTransformHeaders(res, transformInfo) {
        res.setHeader('X-Transform-Input-Format', transformInfo.inputFormat);
        res.setHeader('X-Transform-Output-Format', transformInfo.outputFormat);
        res.setHeader('X-Transform-Locale', transformInfo.locale);
        res.setHeader('X-Transform-Business-Object', transformInfo.businessObject);
        
        if (transformInfo.transformations.length > 0) {
            res.setHeader('X-Transform-Applied', transformInfo.transformations.join(','));
        }
        
        if (transformInfo.warnings.length > 0) {
            res.setHeader('X-Transform-Warnings', transformInfo.warnings.length);
        }
        
        if (transformInfo.cached) {
            res.setHeader('X-Transform-Cached', 'true');
        }
    }

    /**
     * Initialize transformers, converters, and enrichers
     */
    initializeTransformers() {
        console.log('Initializing transformation functions');

        // Business calculation functions
        this.calculateProjectProgress = (project) => {
            if (!project.timeline || !project.milestones) return null;
            
            const completedMilestones = project.milestones.filter(m => m.status === 'completed').length;
            const totalMilestones = project.milestones.length;
            
            return totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
        };

        this.formatSalaryRange = (salary) => {
            if (!salary || !salary.min || !salary.max) return null;
            
            const formatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: salary.currency || 'USD'
            });
            
            return `${formatter.format(salary.min)} - ${formatter.format(salary.max)}`;
        };

        console.log('Transformation functions initialized');
    }

    initializeFormatConverters() {
        console.log('Initializing format converters');

        // XML converter
        this.formatConverters.set('xml', {
            toJson: async (xmlData) => {
                // Simplified XML to JSON conversion
                // In production, use a proper XML parser like xml2js
                return { converted: 'from-xml', data: xmlData };
            },
            fromJson: (jsonData) => {
                // Simplified JSON to XML conversion
                return `<response>${JSON.stringify(jsonData)}</response>`;
            }
        });

        // CSV converter  
        this.formatConverters.set('csv', {
            toJson: async (csvData) => {
                // Simplified CSV to JSON conversion
                // In production, use a proper CSV parser like papaparse
                const lines = csvData.split('\n');
                const headers = lines[0].split(',');
                const data = lines.slice(1).map(line => {
                    const values = line.split(',');
                    return headers.reduce((obj, header, index) => {
                        obj[header.trim()] = values[index]?.trim();
                        return obj;
                    }, {});
                });
                return data;
            },
            fromJson: (jsonData) => {
                if (Array.isArray(jsonData)) {
                    const headers = Object.keys(jsonData[0] || {});
                    const headerRow = headers.join(',');
                    const dataRows = jsonData.map(item => 
                        headers.map(header => item[header] || '').join(',')
                    );
                    return [headerRow, ...dataRows].join('\n');
                }
                return JSON.stringify(jsonData);
            }
        });

        // YAML converter
        this.formatConverters.set('yaml', {
            toJson: async (yamlData) => {
                // Simplified YAML to JSON conversion
                // In production, use a proper YAML parser
                return { converted: 'from-yaml', data: yamlData };
            },
            fromJson: (jsonData) => {
                // Simplified JSON to YAML conversion
                return JSON.stringify(jsonData, null, 2);
            }
        });

        console.log('Format converters initialized');
    }

    initializeEnrichers() {
        console.log('Initializing data enrichers');

        // Location data enricher
        this.enrichers.set('enrichLocationData', async (location, req) => {
            // Mock location enrichment
            if (typeof location === 'string') {
                return {
                    raw: location,
                    formatted: location,
                    city: location.split(',')[0]?.trim(),
                    coordinates: { lat: 0, lng: 0 }, // Would fetch from geocoding API
                    timezone: 'UTC'
                };
            }
            return location;
        });

        // Skills data enricher
        this.enrichers.set('enrichSkillsData', async (skills, req) => {
            if (Array.isArray(skills)) {
                return skills.map(skill => {
                    if (typeof skill === 'string') {
                        return {
                            name: skill,
                            category: this.categorizeSkill(skill),
                            level: 'intermediate' // Could be determined by ML
                        };
                    }
                    return skill;
                });
            }
            return skills;
        });

        console.log('Data enrichers initialized');
    }

    /**
     * Categorize skill (helper function)
     */
    categorizeSkill(skill) {
        const categories = {
            'javascript': 'programming',
            'python': 'programming', 
            'java': 'programming',
            'react': 'frontend',
            'angular': 'frontend',
            'node': 'backend',
            'sql': 'database',
            'aws': 'cloud',
            'docker': 'devops'
        };
        
        const skillLower = skill.toLowerCase();
        for (const [key, category] of Object.entries(categories)) {
            if (skillLower.includes(key)) {
                return category;
            }
        }
        return 'general';
    }

    /**
     * Background processes
     */
    initializeBackgroundProcesses() {
        // Clean up transform cache every 10 minutes
        setInterval(() => {
            this.cleanupTransformCache();
        }, 600000);

        // Update transform metrics every hour
        setInterval(() => {
            this.updateTransformMetrics();
        }, 3600000);
    }

    cleanupTransformCache() {
        const cutoff = Date.now() - (this.config.performance.cacheTTL * 1000);
        let cleaned = 0;

        for (const [key, data] of this.transformCache) {
            if (data.timestamp < cutoff) {
                this.transformCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} expired transform cache entries`);
        }
    }

    updateTransformMetrics() {
        const allMetrics = Array.from(this.transformMetrics.values()).flat();
        console.log('Transform metrics updated:', {
            totalTransformations: allMetrics.length,
            cacheSize: this.transformCache.size
        });
    }

    /**
     * Public API methods
     */
    getStatistics() {
        return {
            config: {
                enabled: this.config.enabled,
                supportedFormats: this.config.supportedFormats,
                businessTransforms: Object.keys(this.config.businessTransforms),
                supportedLocales: this.config.localization.supportedLocales
            },
            cacheStats: {
                transformCacheSize: this.transformCache.size,
                transformMetricsSize: this.transformMetrics.size
            },
            components: {
                requestTransformers: this.requestTransformers.size,
                responseTransformers: this.responseTransformers.size,
                formatConverters: this.formatConverters.size,
                enrichers: this.enrichers.size
            }
        };
    }

    async healthCheck() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {
                formatConverters: { 
                    status: 'healthy', 
                    count: this.formatConverters.size 
                },
                enrichers: { 
                    status: 'healthy', 
                    count: this.enrichers.size 
                },
                transformCache: { 
                    status: 'healthy', 
                    size: this.transformCache.size 
                }
            }
        };
    }

    clearCaches() {
        console.log('Clearing transformation caches');
        this.transformCache.clear();
        this.transformMetrics.clear();
        logger.info('Transformation caches cleared');
    }
}

// Create singleton instance
const requestTransformMiddleware = new RequestTransformMiddleware({
    enabled: process.env.REQUEST_TRANSFORM_ENABLED !== 'false',
    enableRequestTransform: process.env.REQUEST_TRANSFORM_ENABLED !== 'false',
    enableResponseTransform: process.env.RESPONSE_TRANSFORM_ENABLED !== 'false',
    enableFormatConversion: process.env.FORMAT_CONVERSION_ENABLED !== 'false',
    enableFieldMapping: process.env.FIELD_MAPPING_ENABLED !== 'false',
    enableDataEnrichment: process.env.DATA_ENRICHMENT_ENABLED !== 'false',
    enableLocalization: process.env.LOCALIZATION_ENABLED !== 'false',
    cachingEnabled: process.env.TRANSFORM_CACHING_ENABLED !== 'false'
});

module.exports = requestTransformMiddleware.transform;