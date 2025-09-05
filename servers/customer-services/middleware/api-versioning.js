'use strict';

/**
 * @file API Versioning Middleware
 * @description Advanced API versioning middleware for customer services with backward compatibility,
 *              deprecation management, and seamless version transitions
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/middleware/api-versioning
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/services/cache-service
 */


const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const CacheService = require('../../../shared/lib/services/cache-service');

/**
 * API Versioning Middleware
 * Features:
 * - Multiple versioning strategies (header, URL path, query parameter)
 * - Backward compatibility management
 * - Deprecation warnings and timelines
 * - Version-specific feature flags
 * - Automatic request/response transformation
 * - Version analytics and monitoring
 * - Sunset policies and migration assistance
 * - Beta version support
 * - Client version tracking
 */
class ApiVersioningMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            defaultVersion: options.defaultVersion || 'v1',
            currentVersion: options.currentVersion || 'v2',
            supportedVersions: options.supportedVersions || ['v1', 'v2'],
            betaVersions: options.betaVersions || ['v3-beta'],
            
            // Version detection strategies
            versionStrategies: {
                header: options.headerStrategy !== false, // Accept-Version or X-API-Version
                urlPath: options.urlPathStrategy !== false, // /api/v1/endpoint
                queryParam: options.queryParamStrategy === true, // ?version=v1
                mediaType: options.mediaTypeStrategy === true // application/vnd.api+json;version=1
            },

            // Version configuration
            versions: {
                'v1': {
                    name: 'Version 1.0',
                    releaseDate: '2023-01-01',
                    deprecationDate: '2024-06-01',
                    sunsetDate: '2024-12-31',
                    status: 'deprecated',
                    features: {
                        basicAuth: true,
                        legacyResponses: true,
                        simpleValidation: true,
                        limitedRateLimit: true
                    },
                    transformations: {
                        request: 'v1RequestTransform',
                        response: 'v1ResponseTransform'
                    },
                    documentation: '/docs/v1',
                    migrationGuide: '/docs/migration/v1-to-v2'
                },

                'v2': {
                    name: 'Version 2.0',
                    releaseDate: '2024-01-01',
                    deprecationDate: null,
                    sunsetDate: null,
                    status: 'stable',
                    features: {
                        enhancedAuth: true,
                        structuredResponses: true,
                        advancedValidation: true,
                        fullRateLimit: true,
                        webhooks: true,
                        pagination: true
                    },
                    transformations: {
                        request: 'v2RequestTransform',
                        response: 'v2ResponseTransform'
                    },
                    documentation: '/docs/v2',
                    migrationGuide: null
                },

                'v3-beta': {
                    name: 'Version 3.0 Beta',
                    releaseDate: '2024-06-01',
                    deprecationDate: null,
                    sunsetDate: null,
                    status: 'beta',
                    features: {
                        graphqlSupport: true,
                        realTimeUpdates: true,
                        aiEnhancedEndpoints: true,
                        advancedAnalytics: true,
                        multiTenantImprovements: true
                    },
                    transformations: {
                        request: 'v3RequestTransform',
                        response: 'v3ResponseTransform'
                    },
                    documentation: '/docs/v3-beta',
                    migrationGuide: '/docs/migration/v2-to-v3',
                    betaAccess: true
                }
            },

            // Deprecation configuration
            deprecation: {
                warningPeriod: 180, // days before sunset
                noticeHeaders: true,
                logWarnings: true,
                emailNotifications: false,
                gracePeriod: 30 // days after sunset for emergency access
            },

            // Version analytics
            analytics: {
                enabled: options.analyticsEnabled !== false,
                trackClientVersions: true,
                trackEndpointUsage: true,
                trackMigrationPatterns: true,
                sampleRate: options.analyticsSampleRate || 0.1
            },

            // Client version tracking
            clientTracking: {
                enabled: options.clientTrackingEnabled !== false,
                identifyByUserAgent: true,
                identifyByApiKey: true,
                identifyByClientId: true,
                storageEnabled: true,
                cacheTTL: 3600 // 1 hour
            }
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.versionMetrics = new Map();
        this.clientVersions = new Map();
        this.deprecationWarnings = new Map();

        // Request/Response transformers
        this.transformers = {
            request: new Map(),
            response: new Map()
        };

        this.initializeTransformers();
        this.initializeBackgroundProcesses();

        console.log('API versioning middleware initialized');
        logger.info('API versioning middleware initialized', {
            enabled: this.config.enabled,
            defaultVersion: this.config.defaultVersion,
            currentVersion: this.config.currentVersion,
            supportedVersions: this.config.supportedVersions,
            betaVersions: this.config.betaVersions,
            strategies: this.config.versionStrategies
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    handleVersioning = async (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        const startTime = Date.now();

        try {
            console.log(`Processing API versioning for ${req.method} ${req.path}`);

            // Initialize version context
            req.apiVersion = {
                startTime,
                detectedVersion: null,
                requestedVersion: null,
                finalVersion: null,
                strategy: null,
                isDeprecated: false,
                isBeta: false,
                supportLevel: 'full',
                warnings: [],
                transformations: {
                    request: null,
                    response: null
                },
                clientInfo: {
                    userAgent: req.get('user-agent') || 'unknown',
                    apiKey: req.get('x-api-key') || null,
                    clientId: req.get('x-client-id') || null
                }
            };

            // Detect requested API version
            const detectionResult = await this.detectApiVersion(req);
            req.apiVersion = { ...req.apiVersion, ...detectionResult };

            console.log(`Detected API version: ${req.apiVersion.finalVersion} via ${req.apiVersion.strategy}`);

            // Validate version support
            const validationResult = await this.validateVersion(req.apiVersion.finalVersion, req);
            if (!validationResult.valid) {
                return this.handleUnsupportedVersion(req, res, validationResult);
            }

            // Update version context with validation results
            req.apiVersion = { ...req.apiVersion, ...validationResult };

            // Check for deprecation
            await this.checkDeprecation(req, res);

            // Check beta access if applicable
            if (req.apiVersion.isBeta) {
                const betaAccess = await this.checkBetaAccess(req);
                if (!betaAccess.allowed) {
                    return this.handleBetaAccessDenied(req, res, betaAccess);
                }
            }

            // Apply version-specific transformations
            await this.applyRequestTransformations(req);

            // Set version headers
            this.setVersionHeaders(res, req.apiVersion);

            // Track version usage
            await this.trackVersionUsage(req);

            // Hook response transformation
            this.hookResponseTransformation(req, res);

            const duration = Date.now() - startTime;
            console.log(`API versioning completed in ${duration}ms for version ${req.apiVersion.finalVersion}`);

            next();

        } catch (error) {
            console.error(`API versioning failed for ${req.path}:`, error.message);
            logger.error('API versioning middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                requestId: req.requestId
            });

            // Fallback to default version
            req.apiVersion = {
                detectedVersion: this.config.defaultVersion,
                requestedVersion: this.config.defaultVersion,
                finalVersion: this.config.defaultVersion,
                strategy: 'fallback',
                isDeprecated: false,
                isBeta: false,
                supportLevel: 'fallback',
                warnings: ['Version detection failed, using default'],
                error: error.message
            };

            this.setVersionHeaders(res, req.apiVersion);
            next();
        }
    };

    /**
     * Detect API version from request
     * @param {Object} req - Express request object
     * @returns {Object} Detection result
     */
    async detectApiVersion(req) {
        console.log('Detecting API version from request');

        let detectedVersion = null;
        let strategy = null;

        // Strategy 1: Check URL path (/api/v1/...)
        if (this.config.versionStrategies.urlPath) {
            const pathMatch = req.path.match(/^\/api\/(v\d+(?:-[a-zA-Z]+)?)\//);
            if (pathMatch) {
                detectedVersion = pathMatch[1];
                strategy = 'url_path';
                console.log(`Version detected from URL path: ${detectedVersion}`);
            }
        }

        // Strategy 2: Check version headers
        if (!detectedVersion && this.config.versionStrategies.header) {
            const versionHeader = req.get('x-api-version') || req.get('accept-version');
            if (versionHeader) {
                detectedVersion = versionHeader;
                strategy = 'header';
                console.log(`Version detected from header: ${detectedVersion}`);
            }
        }

        // Strategy 3: Check query parameter
        if (!detectedVersion && this.config.versionStrategies.queryParam) {
            const queryVersion = req.query.version || req.query.v;
            if (queryVersion) {
                detectedVersion = queryVersion;
                strategy = 'query_param';
                console.log(`Version detected from query parameter: ${detectedVersion}`);
            }
        }

        // Strategy 4: Check Accept header (media type versioning)
        if (!detectedVersion && this.config.versionStrategies.mediaType) {
            const acceptHeader = req.get('accept');
            if (acceptHeader) {
                const mediaTypeMatch = acceptHeader.match(/application\/vnd\.api\+json;version=(\d+)/);
                if (mediaTypeMatch) {
                    detectedVersion = `v${mediaTypeMatch[1]}`;
                    strategy = 'media_type';
                    console.log(`Version detected from media type: ${detectedVersion}`);
                }
            }
        }

        // Use default version if none detected
        if (!detectedVersion) {
            detectedVersion = this.config.defaultVersion;
            strategy = 'default';
            console.log(`Using default version: ${detectedVersion}`);
        }

        return {
            detectedVersion,
            requestedVersion: detectedVersion,
            finalVersion: detectedVersion,
            strategy
        };
    }

    /**
     * Validate version support
     * @param {string} version - Requested version
     * @param {Object} req - Express request object
     * @returns {Object} Validation result
     */
    async validateVersion(version, req) {
        console.log(`Validating version: ${version}`);

        const validation = {
            valid: false,
            version,
            supportLevel: 'none',
            isDeprecated: false,
            isBeta: false,
            isSunset: false,
            reason: null,
            versionConfig: null
        };

        // Check if version exists in configuration
        const versionConfig = this.config.versions[version];
        if (!versionConfig) {
            validation.reason = `Version ${version} not found`;
            console.log(`Version ${version} not found in configuration`);
            return validation;
        }

        validation.versionConfig = versionConfig;

        // Check if version is in supported list
        const isSupported = this.config.supportedVersions.includes(version);
        const isBeta = this.config.betaVersions.includes(version);

        if (!isSupported && !isBeta) {
            validation.reason = `Version ${version} is not supported`;
            console.log(`Version ${version} is not in supported versions list`);
            return validation;
        }

        // Check sunset status
        if (versionConfig.sunsetDate && new Date() > new Date(versionConfig.sunsetDate)) {
            const gracePeriod = new Date(versionConfig.sunsetDate);
            gracePeriod.setDate(gracePeriod.getDate() + this.config.deprecation.gracePeriod);
            
            if (new Date() > gracePeriod) {
                validation.isSunset = true;
                validation.reason = `Version ${version} has been sunset and is no longer available`;
                console.log(`Version ${version} is past sunset date and grace period`);
                return validation;
            } else {
                validation.supportLevel = 'grace_period';
                console.log(`Version ${version} is in sunset grace period`);
            }
        }

        // Check deprecation status
        if (versionConfig.deprecationDate && new Date() > new Date(versionConfig.deprecationDate)) {
            validation.isDeprecated = true;
            validation.supportLevel = validation.supportLevel || 'deprecated';
            console.log(`Version ${version} is deprecated`);
        }

        // Check beta status
        if (isBeta) {
            validation.isBeta = true;
            validation.supportLevel = 'beta';
            console.log(`Version ${version} is beta`);
        }

        // Set support level if not already set
        if (!validation.supportLevel || validation.supportLevel === 'none') {
            validation.supportLevel = 'full';
        }

        validation.valid = true;
        validation.reason = `Version ${version} is supported (${validation.supportLevel})`;
        console.log(`Version ${version} validation passed: ${validation.supportLevel} support`);

        return validation;
    }

    /**
     * Check deprecation and add warnings
     */
    async checkDeprecation(req, res) {
        if (!req.apiVersion.isDeprecated) return;

        const version = req.apiVersion.finalVersion;
        const versionConfig = req.apiVersion.versionConfig;

        console.log(`Adding deprecation warnings for version ${version}`);

        // Calculate days until sunset
        let daysUntilSunset = null;
        if (versionConfig.sunsetDate) {
            const sunsetDate = new Date(versionConfig.sunsetDate);
            const now = new Date();
            daysUntilSunset = Math.ceil((sunsetDate - now) / (24 * 60 * 60 * 1000));
        }

        // Add deprecation headers
        if (this.config.deprecation.noticeHeaders) {
            res.setHeader('X-API-Deprecated', 'true');
            res.setHeader('X-API-Deprecation-Date', versionConfig.deprecationDate);
            
            if (versionConfig.sunsetDate) {
                res.setHeader('X-API-Sunset-Date', versionConfig.sunsetDate);
                if (daysUntilSunset !== null) {
                    res.setHeader('X-API-Sunset-Days', daysUntilSunset);
                }
            }
            
            if (versionConfig.migrationGuide) {
                res.setHeader('X-API-Migration-Guide', versionConfig.migrationGuide);
            }

            res.setHeader('Warning', `299 - "API version ${version} is deprecated${
                daysUntilSunset ? ` and will be sunset in ${daysUntilSunset} days` : ''
            }. Please migrate to ${this.config.currentVersion}."`);
        }

        // Add to warnings
        req.apiVersion.warnings.push({
            type: 'deprecation',
            message: `Version ${version} is deprecated`,
            daysUntilSunset,
            migrationGuide: versionConfig.migrationGuide,
            recommendedVersion: this.config.currentVersion
        });

        // Log deprecation warning
        if (this.config.deprecation.logWarnings) {
            logger.warn('Deprecated API version used', {
                version,
                userAgent: req.apiVersion.clientInfo.userAgent,
                apiKey: req.apiVersion.clientInfo.apiKey,
                daysUntilSunset,
                endpoint: req.path,
                method: req.method,
                ip: req.ip
            });
        }

        // Store deprecation warning for analytics
        const warningKey = `${version}:${req.apiVersion.clientInfo.userAgent}`;
        if (!this.deprecationWarnings.has(warningKey)) {
            this.deprecationWarnings.set(warningKey, {
                version,
                firstSeen: new Date(),
                count: 0,
                userAgent: req.apiVersion.clientInfo.userAgent,
                apiKey: req.apiVersion.clientInfo.apiKey
            });
        }
        this.deprecationWarnings.get(warningKey).count++;
    }

    /**
     * Check beta access permissions
     */
    async checkBetaAccess(req) {
        const version = req.apiVersion.finalVersion;
        const versionConfig = req.apiVersion.versionConfig;

        console.log(`Checking beta access for version ${version}`);

        const access = {
            allowed: false,
            reason: null,
            requirements: []
        };

        // Check if beta access is required
        if (!versionConfig.betaAccess) {
            access.allowed = true;
            access.reason = 'No beta access required';
            return access;
        }

        // Check API key for beta access
        const apiKey = req.apiVersion.clientInfo.apiKey;
        if (!apiKey) {
            access.reason = 'API key required for beta access';
            access.requirements.push('api_key');
            return access;
        }

        // Check if API key has beta access (this would typically check a database)
        const hasBetaAccess = await this.checkApiBetaAccess(apiKey);
        if (!hasBetaAccess) {
            access.reason = 'API key not authorized for beta access';
            access.requirements.push('beta_authorization');
            return access;
        }

        // Check subscription tier for beta access
        const subscription = req.subscription?.tier;
        if (subscription && !['business', 'enterprise'].includes(subscription)) {
            access.reason = 'Beta access requires business or enterprise subscription';
            access.requirements.push('premium_subscription');
            return access;
        }

        access.allowed = true;
        access.reason = 'Beta access granted';
        console.log(`Beta access granted for version ${version}`);

        return access;
    }

    /**
     * Check API key beta access (mock implementation)
     */
    async checkApiBetaAccess(apiKey) {
        try {
            // This would typically check a database or external service
            // For now, we'll use a simple cache or return true for demo
            
            if (this.cache) {
                const betaAccess = await this.cache.get(`beta_access:${apiKey}`);
                return betaAccess === 'true';
            }

            // Mock: allow beta access for specific patterns
            return apiKey && (apiKey.includes('beta') || apiKey.includes('test'));
        } catch (error) {
            console.error('Error checking beta access:', error.message);
            return false;
        }
    }

    /**
     * Apply request transformations
     */
    async applyRequestTransformations(req) {
        const version = req.apiVersion.finalVersion;
        const versionConfig = req.apiVersion.versionConfig;

        if (!versionConfig.transformations?.request) {
            return;
        }

        const transformerName = versionConfig.transformations.request;
        const transformer = this.transformers.request.get(transformerName);

        if (!transformer) {
            console.warn(`Request transformer ${transformerName} not found for version ${version}`);
            return;
        }

        console.log(`Applying request transformation: ${transformerName}`);

        try {
            await transformer(req);
            req.apiVersion.transformations.request = transformerName;
            console.log(`Request transformation ${transformerName} applied successfully`);
        } catch (error) {
            console.error(`Request transformation ${transformerName} failed:`, error.message);
            req.apiVersion.warnings.push({
                type: 'transformation_error',
                message: `Request transformation failed: ${error.message}`,
                transformer: transformerName
            });
        }
    }

    /**
     * Hook response transformation
     */
    hookResponseTransformation(req, res) {
        const version = req.apiVersion.finalVersion;
        const versionConfig = req.apiVersion.versionConfig;

        if (!versionConfig.transformations?.response) {
            return;
        }

        const transformerName = versionConfig.transformations.response;
        const transformer = this.transformers.response.get(transformerName);

        if (!transformer) {
            console.warn(`Response transformer ${transformerName} not found for version ${version}`);
            return;
        }

        // Hook into response
        const originalSend = res.send;
        const originalJson = res.json;

        res.send = (body) => {
            try {
                console.log(`Applying response transformation: ${transformerName}`);
                const transformedBody = transformer(body, req, res);
                req.apiVersion.transformations.response = transformerName;
                return originalSend.call(res, transformedBody);
            } catch (error) {
                console.error(`Response transformation ${transformerName} failed:`, error.message);
                req.apiVersion.warnings.push({
                    type: 'response_transformation_error',
                    message: `Response transformation failed: ${error.message}`,
                    transformer: transformerName
                });
                return originalSend.call(res, body);
            }
        };

        res.json = (data) => {
            try {
                console.log(`Applying JSON response transformation: ${transformerName}`);
                const transformedData = transformer(data, req, res);
                req.apiVersion.transformations.response = transformerName;
                return originalJson.call(res, transformedData);
            } catch (error) {
                console.error(`JSON response transformation ${transformerName} failed:`, error.message);
                req.apiVersion.warnings.push({
                    type: 'json_transformation_error',
                    message: `JSON response transformation failed: ${error.message}`,
                    transformer: transformerName
                });
                return originalJson.call(res, data);
            }
        };
    }

    /**
     * Set version headers on response
     */
    setVersionHeaders(res, versionInfo) {
        res.setHeader('X-API-Version', versionInfo.finalVersion);
        res.setHeader('X-API-Version-Strategy', versionInfo.strategy);
        res.setHeader('X-API-Current-Version', this.config.currentVersion);
        
        if (versionInfo.supportLevel) {
            res.setHeader('X-API-Support-Level', versionInfo.supportLevel);
        }

        if (versionInfo.warnings.length > 0) {
            res.setHeader('X-API-Warnings', versionInfo.warnings.length);
        }

        if (versionInfo.versionConfig?.documentation) {
            res.setHeader('X-API-Documentation', versionInfo.versionConfig.documentation);
        }
    }

    /**
     * Track version usage for analytics
     */
    async trackVersionUsage(req) {
        if (!this.config.analytics.enabled) return;

        try {
            // Sample requests based on sample rate
            if (Math.random() > this.config.analytics.sampleRate) {
                return;
            }

            const usage = {
                timestamp: Date.now(),
                version: req.apiVersion.finalVersion,
                requestedVersion: req.apiVersion.requestedVersion,
                strategy: req.apiVersion.strategy,
                endpoint: req.path,
                method: req.method,
                userAgent: req.apiVersion.clientInfo.userAgent,
                apiKey: req.apiVersion.clientInfo.apiKey,
                clientId: req.apiVersion.clientInfo.clientId,
                isDeprecated: req.apiVersion.isDeprecated,
                isBeta: req.apiVersion.isBeta,
                supportLevel: req.apiVersion.supportLevel,
                transformations: req.apiVersion.transformations,
                warnings: req.apiVersion.warnings.map(w => w.type),
                tenantId: req.tenantId,
                userId: req.user?.id
            };

            // Store in metrics
            const metricsKey = `usage:${new Date().getHours()}`;
            if (!this.versionMetrics.has(metricsKey)) {
                this.versionMetrics.set(metricsKey, []);
            }
            this.versionMetrics.get(metricsKey).push(usage);

            // Track client versions
            if (this.config.clientTracking.enabled) {
                await this.trackClientVersion(req.apiVersion.clientInfo, req.apiVersion.finalVersion);
            }

        } catch (error) {
            console.error('Error tracking version usage:', error.message);
        }
    }

    /**
     * Track client version information
     */
    async trackClientVersion(clientInfo, version) {
        try {
            const clientKey = clientInfo.apiKey || clientInfo.clientId || clientInfo.userAgent;
            if (!clientKey) return;

            const versionKey = `client_version:${clientKey}`;
            
            let clientData = null;
            if (this.cache) {
                clientData = await this.cache.get(versionKey);
                if (clientData) {
                    clientData = JSON.parse(clientData);
                }
            }

            if (!clientData) {
                clientData = {
                    clientKey,
                    versions: {},
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    totalRequests: 0
                };
            }

            // Update version usage
            if (!clientData.versions[version]) {
                clientData.versions[version] = { count: 0, firstUsed: Date.now() };
            }
            clientData.versions[version].count++;
            clientData.lastSeen = Date.now();
            clientData.totalRequests++;

            // Store updated data
            if (this.cache) {
                await this.cache.set(versionKey, JSON.stringify(clientData), this.config.clientTracking.cacheTTL);
            }

            // Store in local cache
            this.clientVersions.set(clientKey, clientData);

        } catch (error) {
            console.error('Error tracking client version:', error.message);
        }
    }

    /**
     * Handle unsupported version
     */
    handleUnsupportedVersion(req, res, validationResult) {
        console.log(`Handling unsupported version: ${validationResult.version}`);

        const supportedVersions = [...this.config.supportedVersions, ...this.config.betaVersions];
        
        res.setHeader('X-API-Supported-Versions', supportedVersions.join(', '));
        res.setHeader('X-API-Current-Version', this.config.currentVersion);
        res.setHeader('X-API-Default-Version', this.config.defaultVersion);

        const error = new AppError(
            `API version ${validationResult.version} is not supported`,
            400,
            'UNSUPPORTED_API_VERSION',
            {
                requestedVersion: validationResult.version,
                supportedVersions,
                currentVersion: this.config.currentVersion,
                reason: validationResult.reason
            }
        );

        return res.status(400).json({
            success: false,
            error: {
                message: error.message,
                code: error.code,
                details: error.details,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Handle beta access denied
     */
    handleBetaAccessDenied(req, res, betaAccess) {
        console.log(`Handling beta access denied for version: ${req.apiVersion.finalVersion}`);

        res.setHeader('X-API-Beta-Access', 'required');
        res.setHeader('X-API-Beta-Requirements', betaAccess.requirements.join(', '));

        const error = new AppError(
            `Beta access required for version ${req.apiVersion.finalVersion}`,
            403,
            'BETA_ACCESS_REQUIRED',
            {
                version: req.apiVersion.finalVersion,
                reason: betaAccess.reason,
                requirements: betaAccess.requirements
            }
        );

        return res.status(403).json({
            success: false,
            error: {
                message: error.message,
                code: error.code,
                details: error.details,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Initialize request/response transformers
     */
    initializeTransformers() {
        console.log('Initializing API version transformers');

        // V1 Request Transformer
        this.transformers.request.set('v1RequestTransform', (req) => {
            // Transform v1 requests to internal format
            if (req.body && req.body.data) {
                // V1 used nested data structure
                req.body = req.body.data;
            }

            // Transform v1 query parameters
            if (req.query.limit) {
                req.query.limit = Math.min(parseInt(req.query.limit, 10), 100); // V1 had lower limits
            }
        });

        // V1 Response Transformer
        this.transformers.response.set('v1ResponseTransform', (data, req, res) => {
            if (typeof data === 'object' && data !== null) {
                // V1 used simpler response structure
                if (data.success !== undefined) {
                    return {
                        status: data.success ? 'ok' : 'error',
                        data: data.data || data.result,
                        message: data.message,
                        timestamp: new Date().toISOString()
                    };
                }
            }
            return data;
        });

        // V2 Request Transformer (minimal changes)
        this.transformers.request.set('v2RequestTransform', (req) => {
            // V2 is the current standard format
            // Add any specific v2 transformations here
        });

        // V2 Response Transformer (current format)
        this.transformers.response.set('v2ResponseTransform', (data, req, res) => {
            // V2 uses current format, minimal transformation
            return data;
        });

        // V3 Beta Request Transformer
        this.transformers.request.set('v3RequestTransform', (req) => {
            // V3 beta enhancements
            if (req.body && req.body.meta) {
                // V3 supports metadata in requests
                req.metadata = req.body.meta;
                delete req.body.meta;
            }
        });

        // V3 Beta Response Transformer
        this.transformers.response.set('v3ResponseTransform', (data, req, res) => {
            if (typeof data === 'object' && data !== null && data.success !== undefined) {
                // V3 includes enhanced metadata
                return {
                    ...data,
                    meta: {
                        version: 'v3-beta',
                        timestamp: new Date().toISOString(),
                        processingTime: Date.now() - (req.apiVersion?.startTime || Date.now()),
                        ...(req.metadata || {})
                    }
                };
            }
            return data;
        });

        console.log('API version transformers initialized');
    }

    /**
     * Background processes
     */
    initializeBackgroundProcesses() {
        // Clean up old metrics every hour
        setInterval(() => {
            this.cleanupMetrics();
        }, 3600000);

        // Generate version usage reports every 6 hours
        setInterval(() => {
            this.generateUsageReport();
        }, 21600000);

        // Check for deprecation notifications every day
        setInterval(() => {
            this.checkDeprecationNotifications();
        }, 86400000);
    }

    cleanupMetrics() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        let cleaned = 0;

        for (const [key, metrics] of this.versionMetrics) {
            if (metrics[0]?.timestamp < cutoff) {
                this.versionMetrics.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old version metrics`);
        }
    }

    generateUsageReport() {
        const allMetrics = Array.from(this.versionMetrics.values()).flat();
        
        const report = {
            totalRequests: allMetrics.length,
            versionDistribution: new Map(),
            deprecationWarnings: this.deprecationWarnings.size,
            betaUsage: 0
        };

        // Calculate version distribution
        allMetrics.forEach(metric => {
            const count = report.versionDistribution.get(metric.version) || 0;
            report.versionDistribution.set(metric.version, count + 1);
            
            if (metric.isBeta) {
                report.betaUsage++;
            }
        });

        console.log('API Version Usage Report:', {
            totalRequests: report.totalRequests,
            versionDistribution: Object.fromEntries(report.versionDistribution),
            deprecationWarnings: report.deprecationWarnings,
            betaUsage: report.betaUsage
        });

        logger.info('API version usage report', report);
    }

    checkDeprecationNotifications() {
        // Check if any versions are approaching sunset
        for (const [version, config] of Object.entries(this.config.versions)) {
            if (config.sunsetDate) {
                const sunsetDate = new Date(config.sunsetDate);
                const now = new Date();
                const daysUntilSunset = Math.ceil((sunsetDate - now) / (24 * 60 * 60 * 1000));

                if (daysUntilSunset <= this.config.deprecation.warningPeriod && daysUntilSunset > 0) {
                    console.log(`Version ${version} will sunset in ${daysUntilSunset} days`);
                    logger.warn('API version approaching sunset', {
                        version,
                        daysUntilSunset,
                        sunsetDate: config.sunsetDate,
                        migrationGuide: config.migrationGuide
                    });
                }
            }
        }
    }

    /**
     * Public API methods
     */
    getStatistics() {
        const allMetrics = Array.from(this.versionMetrics.values()).flat();
        
        const stats = {
            totalRequests: allMetrics.length,
            versionDistribution: new Map(),
            strategyDistribution: new Map(),
            deprecationWarnings: this.deprecationWarnings.size,
            betaUsage: allMetrics.filter(m => m.isBeta).length,
            clientVersions: this.clientVersions.size,
            supportedVersions: this.config.supportedVersions,
            betaVersions: this.config.betaVersions,
            currentVersion: this.config.currentVersion
        };

        // Calculate distributions
        allMetrics.forEach(metric => {
            // Version distribution
            const versionCount = stats.versionDistribution.get(metric.version) || 0;
            stats.versionDistribution.set(metric.version, versionCount + 1);

            // Strategy distribution
            const strategyCount = stats.strategyDistribution.get(metric.strategy) || 0;
            stats.strategyDistribution.set(metric.strategy, strategyCount + 1);
        });

        return stats;
    }

    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {}
        };

        try {
            // Check cache connectivity
            if (this.cache) {
                try {
                    await this.cache.ping();
                    health.components.cache = { status: 'healthy', type: 'redis' };
                } catch (error) {
                    health.components.cache = { status: 'unhealthy', error: error.message };
                    health.status = 'degraded';
                }
            }

            // Check transformers
            health.components.transformers = {
                status: 'healthy',
                requestTransformers: this.transformers.request.size,
                responseTransformers: this.transformers.response.size
            };

            // Check version configurations
            health.components.versions = {
                status: 'healthy',
                supported: this.config.supportedVersions.length,
                beta: this.config.betaVersions.length,
                current: this.config.currentVersion,
                default: this.config.defaultVersion
            };

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    clearCaches() {
        console.log('Clearing API versioning caches');
        this.versionMetrics.clear();
        this.clientVersions.clear();
        this.deprecationWarnings.clear();
        
        logger.info('API versioning caches cleared');
    }

    /**
     * Helper methods for application code
     */
    static getApiVersion(req) {
        return req.apiVersion?.finalVersion || 'unknown';
    }

    static isDeprecated(req) {
        return req.apiVersion?.isDeprecated === true;
    }

    static isBeta(req) {
        return req.apiVersion?.isBeta === true;
    }

    static getSupportLevel(req) {
        return req.apiVersion?.supportLevel || 'unknown';
    }

    static getVersionConfig(req) {
        return req.apiVersion?.versionConfig || null;
    }
}

// Create singleton instance
const apiVersioningMiddleware = new ApiVersioningMiddleware({
    enabled: process.env.API_VERSIONING_ENABLED !== 'false',
    defaultVersion: process.env.API_DEFAULT_VERSION || 'v1',
    currentVersion: process.env.API_CURRENT_VERSION || 'v2',
    headerStrategy: process.env.API_VERSION_HEADER_STRATEGY !== 'false',
    urlPathStrategy: process.env.API_VERSION_URL_STRATEGY !== 'false',
    queryParamStrategy: process.env.API_VERSION_QUERY_STRATEGY === 'true',
    analyticsEnabled: process.env.API_VERSION_ANALYTICS !== 'false',
    clientTrackingEnabled: process.env.API_CLIENT_TRACKING !== 'false'
});

module.exports = apiVersioningMiddleware.handleVersioning;