'use strict';

/**
 * @fileoverview Comprehensive Enterprise Routing Configuration - Complete routing management for InsightSerenity API Gateway
 * @module servers/gateway/config/routing-config
 * @version 3.0.0
 * @author InsightSerenity Platform Team
 * @description This module provides comprehensive routing configuration, policies, transformations,
 *              and validation for the InsightSerenity API Gateway. It supports multi-tenant routing,
 *              service discovery, load balancing, circuit breaking, caching strategies, and advanced
 *              request transformation capabilities for enterprise-grade microservices architecture.
 */

const { performance } = require('perf_hooks');
const crypto = require('crypto');

/**
 * RouteValidationError - Custom error class for route validation failures
 * @class RouteValidationError
 * @extends Error
 */
class RouteValidationError extends Error {
    /**
     * Creates an instance of RouteValidationError
     * @param {string} message - Error message
     * @param {Object} route - Route object that failed validation
     * @param {number} index - Index of the route in the configuration
     */
    constructor(message, route, index) {
        super(message);
        this.name = 'RouteValidationError';
        this.route = route;
        this.index = index;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Comprehensive routing configuration module providing enterprise-grade routing capabilities
 * for the InsightSerenity platform. This module supports advanced routing patterns, multi-tenant
 * isolation, service discovery, load balancing, circuit breaking, caching strategies, request
 * transformation, security policies, and comprehensive monitoring and analytics.
 */
const routingConfig = {
    /**
     * Core routing policies and enterprise configuration
     */
    policies: {
        // Primary routing strategy configuration
        defaultStrategy: 'path-based', // 'path-based', 'header-based', 'weighted', 'geographic'
        
        // Route matching configuration with advanced options
        matching: {
            caseSensitive: false,
            strict: false,
            mergeParams: true,
            trailingSlash: 'ignore', // 'ignore', 'strict', 'redirect'
            queryString: 'preserve', // 'preserve', 'ignore', 'transform'
            fragment: 'ignore'
        },

        // Route priority hierarchy with granular control
        priorities: {
            system: 2000,      // System and health endpoints
            security: 1500,    // Security and authentication endpoints
            admin: 1000,       // Administrative endpoints
            exact: 800,        // Exact path matches
            prefix: 500,       // Prefix-based matches
            pattern: 300,      // Pattern and regex matches
            wildcard: 100,     // Wildcard matches
            fallback: 0        // Default fallback routes
        },

        // Multi-tenant routing architecture with advanced isolation
        multiTenant: {
            enabled: true,
            strategy: 'subdomain', // 'subdomain', 'header', 'path', 'hybrid'
            headerName: 'X-Tenant-ID',
            pathPrefix: '/tenant',
            subdomainLevel: 1,
            defaultTenant: 'default',
            tenantValidation: {
                enabled: true,
                allowedPattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]$/,
                blacklistedTenants: ['admin', 'api', 'www', 'mail', 'ftp']
            },
            isolation: {
                enabled: true,
                validateTenant: true,
                blockCrossTenant: true,
                auditCrossTenantAccess: true,
                tenantScopedCaching: true
            },
            routing: {
                inheritGlobalRoutes: true,
                tenantSpecificRoutes: true,
                routeOverrides: true
            }
        },

        // Geographic routing capabilities for global distribution
        geographic: {
            enabled: false,
            strategy: 'nearest', // 'nearest', 'regional', 'country', 'continent'
            geoLocationHeader: 'X-Geo-Location',
            regions: {
                'us-east': {
                    zones: ['us-east-1', 'us-east-2'],
                    weight: 1.0,
                    latency: 50
                },
                'us-west': {
                    zones: ['us-west-1', 'us-west-2'],
                    weight: 1.0,
                    latency: 80
                },
                'eu-central': {
                    zones: ['eu-central-1', 'eu-west-1'],
                    weight: 0.8,
                    latency: 120
                },
                'asia-pacific': {
                    zones: ['ap-southeast-1', 'ap-northeast-1'],
                    weight: 0.6,
                    latency: 200
                }
            },
            fallbackRegion: 'us-east',
            maxLatency: 500,
            healthCheckInterval: 30000
        },

        // A/B testing and canary deployment routing
        canary: {
            enabled: false,
            defaultPercentage: 5,
            maxPercentage: 50,
            rampUpDuration: 3600000, // 1 hour
            routes: [
                {
                    name: 'api-v2-canary',
                    path: '/api/v2/*',
                    percentage: 10,
                    criteria: {
                        headers: { 'X-Beta-User': 'true' },
                        userAgent: /chrome/i,
                        timeRange: { start: '09:00', end: '17:00' }
                    },
                    metrics: {
                        successRate: 0.95,
                        averageLatency: 500,
                        errorThreshold: 0.05
                    }
                }
            ],
            rollback: {
                enabled: true,
                conditions: {
                    errorRateThreshold: 0.1,
                    latencyThreshold: 1000,
                    successRateThreshold: 0.9
                }
            }
        },

        // Feature flag routing for dynamic feature control
        featureFlags: {
            enabled: true,
            provider: 'internal', // 'internal', 'launchdarkly', 'split'
            defaultFlags: {
                'new-dashboard': false,
                'advanced-analytics': false,
                'real-time-notifications': true
            },
            routing: {
                flagBasedRouting: true,
                fallbackBehavior: 'disable' // 'disable', 'enable', 'passthrough'
            }
        },

        // Comprehensive routing rules for InsightSerenity platform
        rules: [
            // ===== SYSTEM AND INFRASTRUCTURE ROUTES =====
            
            /**
             * System health and monitoring endpoints
             */
            {
                name: 'system-health-live',
                pattern: /^\/health\/live$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 2000,
                cache: false,
                monitoring: {
                    enabled: true,
                    alertOnFailure: true
                },
                rateLimit: {
                    windowMs: 60000,
                    max: 1000,
                    skipSuccessfulRequests: true
                }
            },
            {
                name: 'system-health-ready',
                pattern: /^\/health\/ready$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 2000,
                cache: false,
                healthCheck: {
                    dependencies: ['admin-server', 'customer-services'],
                    timeout: 5000
                }
            },
            {
                name: 'system-health-startup',
                pattern: /^\/health\/startup$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 2000,
                cache: false
            },
            {
                name: 'system-metrics',
                pattern: /^\/metrics$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'required',
                authorization: ['admin', 'monitoring', 'ops'],
                priority: 1900,
                cache: false,
                rateLimit: {
                    windowMs: 60000,
                    max: 60
                }
            },

            // ===== SECURITY AND AUTHENTICATION ROUTES =====
            
            /**
             * Public authentication endpoints
             */
            {
                name: 'auth-login',
                pattern: /^\/api\/auth\/login$/,
                target: 'customer-services',
                methods: ['POST'],
                authentication: 'none',
                priority: 1500,
                rateLimit: {
                    windowMs: 900000, // 15 minutes
                    max: 5,
                    skipSuccessfulRequests: false
                },
                security: {
                    bruteForceProtection: true,
                    captchaRequired: false,
                    ipWhitelist: false
                },
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'authentication',
                        'X-Security-Level': 'high'
                    }
                },
                audit: {
                    logAllAttempts: true,
                    logFailures: true,
                    retentionPeriod: '90d'
                }
            },
            {
                name: 'auth-register',
                pattern: /^\/api\/auth\/register$/,
                target: 'customer-services',
                methods: ['POST'],
                authentication: 'none',
                priority: 1500,
                rateLimit: {
                    windowMs: 3600000, // 1 hour
                    max: 3
                },
                validation: {
                    bodySchema: 'user-registration',
                    sanitization: true
                },
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'registration'
                    }
                }
            },
            {
                name: 'auth-password-reset',
                pattern: /^\/api\/auth\/(forgot-password|reset-password)$/,
                target: 'customer-services',
                methods: ['POST'],
                authentication: 'none',
                priority: 1500,
                rateLimit: {
                    windowMs: 3600000,
                    max: 3
                },
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'password-reset'
                    }
                }
            },
            {
                name: 'auth-token-refresh',
                pattern: /^\/api\/auth\/refresh$/,
                target: 'customer-services',
                methods: ['POST'],
                authentication: 'required',
                priority: 1400,
                rateLimit: {
                    windowMs: 60000,
                    max: 30
                },
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'token-refresh'
                    }
                }
            },
            {
                name: 'auth-logout',
                pattern: /^\/api\/auth\/logout$/,
                target: 'customer-services',
                methods: ['POST', 'DELETE'],
                authentication: 'required',
                priority: 1400,
                cache: false,
                transform: {
                    stripPrefix: '/api',
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'logout'
                    }
                }
            },

            // ===== ADMIN SERVER ROUTES =====
            
            /**
             * Platform Management Module routes
             */
            {
                name: 'admin-platform-management',
                pattern: /^\/api\/admin\/platform\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'platform-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                circuitBreaker: {
                    enabled: true,
                    timeout: 15000,
                    errorThreshold: 60
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'platform-management',
                        'X-Route-Type': 'admin-module',
                        'X-Admin-Context': 'platform'
                    }
                },
                audit: {
                    logAllRequests: true,
                    includeRequestBody: true,
                    includeResponseBody: false
                }
            },

            /**
             * User Management Module routes
             */
            {
                name: 'admin-user-management',
                pattern: /^\/api\/admin\/users\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'user-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 50
                },
                validation: {
                    enforceSchema: true,
                    allowExtraFields: false
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'user-management',
                        'X-Route-Type': 'admin-module',
                        'X-Admin-Context': 'users'
                    }
                },
                cache: {
                    enabled: true,
                    ttl: 300,
                    varyBy: ['authorization', 'x-tenant-id']
                }
            },

            /**
             * Organization Management Module routes
             */
            {
                name: 'admin-organization-management',
                pattern: /^\/api\/admin\/organizations\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'org-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 75
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'organization-management',
                        'X-Route-Type': 'admin-module',
                        'X-Admin-Context': 'organizations'
                    }
                }
            },

            /**
             * Security Administration Module routes
             */
            {
                name: 'admin-security-administration',
                pattern: /^\/api\/admin\/security\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'security-admin'],
                priority: 1200,
                rateLimit: {
                    windowMs: 60000,
                    max: 30
                },
                security: {
                    requireMFA: true,
                    sessionValidation: 'strict',
                    auditLevel: 'high'
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'security-administration',
                        'X-Route-Type': 'admin-security',
                        'X-Security-Level': 'critical'
                    }
                }
            },

            /**
             * Billing Administration Module routes
             */
            {
                name: 'admin-billing-administration',
                pattern: /^\/api\/admin\/billing\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'billing-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 40
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'billing-administration',
                        'X-Route-Type': 'admin-billing',
                        'X-Admin-Context': 'billing'
                    }
                }
            },

            /**
             * System Monitoring Module routes
             */
            {
                name: 'admin-system-monitoring',
                pattern: /^\/api\/admin\/monitoring\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'monitoring-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'system-monitoring',
                        'X-Route-Type': 'admin-monitoring',
                        'X-Admin-Context': 'monitoring'
                    }
                }
            },

            /**
             * Support Administration Module routes
             */
            {
                name: 'admin-support-administration',
                pattern: /^\/api\/admin\/support\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'support-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'support-administration',
                        'X-Route-Type': 'admin-support',
                        'X-Admin-Context': 'support'
                    }
                }
            },

            /**
             * Reports and Analytics Module routes
             */
            {
                name: 'admin-reports-analytics',
                pattern: /^\/api\/admin\/analytics\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin', 'analytics-admin'],
                priority: 1000,
                rateLimit: {
                    windowMs: 60000,
                    max: 150
                },
                cache: {
                    enabled: true,
                    ttl: 600,
                    varyBy: ['authorization', 'x-tenant-id'],
                    invalidateOn: ['POST', 'PUT', 'DELETE']
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Module': 'reports-analytics',
                        'X-Route-Type': 'admin-analytics',
                        'X-Admin-Context': 'analytics'
                    }
                }
            },

            /**
             * General Admin routes (catch-all for admin endpoints)
             */
            {
                name: 'admin-general-routes',
                pattern: /^\/api\/admin\/.*/,
                target: 'admin-server',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['admin', 'super-admin'],
                priority: 800,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    stripPrefix: '/api/admin',
                    addHeaders: {
                        'X-Service-Name': 'admin-server',
                        'X-Route-Type': 'admin-general',
                        'X-Admin-Context': 'general'
                    }
                }
            },

            // ===== CUSTOMER SERVICES ROUTES =====

            /**
             * Core Business - Clients Module routes
             */
            {
                name: 'customer-clients',
                pattern: /^\/api\/clients\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'client-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                cache: {
                    enabled: true,
                    ttl: 300,
                    varyBy: ['authorization', 'x-tenant-id']
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'clients',
                        'X-Route-Type': 'core-business',
                        'X-Business-Context': 'clients'
                    }
                }
            },

            /**
             * Core Business - Projects Module routes
             */
            {
                name: 'customer-projects',
                pattern: /^\/api\/projects\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'project-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'projects',
                        'X-Route-Type': 'core-business',
                        'X-Business-Context': 'projects'
                    }
                }
            },

            /**
             * Core Business - Consultants Module routes
             */
            {
                name: 'customer-consultants',
                pattern: /^\/api\/consultants\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'consultant-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'consultants',
                        'X-Route-Type': 'core-business',
                        'X-Business-Context': 'consultants'
                    }
                }
            },

            /**
             * Core Business - Engagements Module routes
             */
            {
                name: 'customer-engagements',
                pattern: /^\/api\/engagements\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'engagement-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'engagements',
                        'X-Route-Type': 'core-business',
                        'X-Business-Context': 'engagements'
                    }
                }
            },

            /**
             * Hosted Organizations - Organizations Module routes
             */
            {
                name: 'customer-organizations',
                pattern: /^\/api\/organizations\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'org-admin'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 150
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'organizations',
                        'X-Route-Type': 'hosted-organizations',
                        'X-Business-Context': 'organizations'
                    }
                }
            },

            /**
             * Hosted Organizations - Tenants Module routes
             */
            {
                name: 'customer-tenants',
                pattern: /^\/api\/tenants\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'tenant-admin'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'tenants',
                        'X-Route-Type': 'hosted-organizations',
                        'X-Business-Context': 'tenants'
                    }
                }
            },

            /**
             * Hosted Organizations - Subscriptions Module routes
             */
            {
                name: 'customer-subscriptions',
                pattern: /^\/api\/subscriptions\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'billing-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'subscriptions',
                        'X-Route-Type': 'hosted-organizations',
                        'X-Business-Context': 'subscriptions'
                    }
                }
            },

            /**
             * Hosted Organizations - White Label Module routes
             */
            {
                name: 'customer-white-label',
                pattern: /^\/api\/white-label\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'white-label-admin'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 50
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'white-label',
                        'X-Route-Type': 'hosted-organizations',
                        'X-Business-Context': 'white-label'
                    }
                }
            },

            /**
             * Recruitment Services - Jobs Module routes
             */
            {
                name: 'recruitment-jobs',
                pattern: /^\/api\/jobs\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'recruiter'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 300
                },
                cache: {
                    enabled: true,
                    ttl: 600,
                    varyBy: ['authorization', 'x-tenant-id']
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'jobs',
                        'X-Route-Type': 'recruitment-services',
                        'X-Business-Context': 'recruitment'
                    }
                }
            },

            /**
             * Recruitment Services - Candidates Module routes
             */
            {
                name: 'recruitment-candidates',
                pattern: /^\/api\/candidates\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'recruiter'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 300
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'candidates',
                        'X-Route-Type': 'recruitment-services',
                        'X-Business-Context': 'recruitment'
                    }
                }
            },

            /**
             * Recruitment Services - Applications Module routes
             */
            {
                name: 'recruitment-applications',
                pattern: /^\/api\/applications\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'recruiter'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 200
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'applications',
                        'X-Route-Type': 'recruitment-services',
                        'X-Business-Context': 'recruitment'
                    }
                }
            },

            /**
             * Recruitment Services - Partnerships Module routes
             */
            {
                name: 'recruitment-partnerships',
                pattern: /^\/api\/partnerships\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                authentication: 'required',
                authorization: ['user', 'admin', 'partner-manager'],
                priority: 700,
                rateLimit: {
                    windowMs: 60000,
                    max: 100
                },
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Module': 'partnerships',
                        'X-Route-Type': 'recruitment-services',
                        'X-Business-Context': 'partnerships'
                    }
                }
            },

            // ===== WEBSOCKET AND REAL-TIME ROUTES =====

            /**
             * WebSocket connection routes for real-time communication
             */
            {
                name: 'websocket-general',
                pattern: /^\/ws\/.*/,
                target: 'customer-services',
                methods: ['GET'],
                protocol: 'ws',
                authentication: 'required',
                priority: 800,
                transform: {
                    stripPrefix: '/ws',
                    addHeaders: {
                        'X-Route-Type': 'websocket',
                        'X-Protocol': 'ws'
                    }
                }
            },

            /**
             * Server-Sent Events for real-time updates
             */
            {
                name: 'sse-notifications',
                pattern: /^\/api\/notifications\/stream$/,
                target: 'customer-services',
                methods: ['GET'],
                authentication: 'required',
                priority: 750,
                cache: false,
                transform: {
                    addHeaders: {
                        'X-Service-Name': 'customer-services',
                        'X-Route-Type': 'sse',
                        'X-Stream-Type': 'notifications'
                    }
                }
            },

            // ===== API DOCUMENTATION AND DISCOVERY ROUTES =====

            /**
             * OpenAPI specification and documentation routes
             */
            {
                name: 'api-docs-root',
                pattern: /^\/api-docs$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 900,
                cache: {
                    enabled: true,
                    ttl: 3600
                }
            },
            {
                name: 'api-docs-ui',
                pattern: /^\/api-docs\/.*/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 900,
                cache: {
                    enabled: true,
                    ttl: 3600
                }
            },
            {
                name: 'openapi-spec',
                pattern: /^\/openapi\.json$/,
                target: 'gateway',
                methods: ['GET'],
                authentication: 'none',
                priority: 900,
                cache: {
                    enabled: true,
                    ttl: 1800
                }
            },

            // ===== LEGACY AND COMPATIBILITY ROUTES =====

            /**
             * Legacy API routes for backward compatibility
             */
            {
                name: 'legacy-api-v1',
                pattern: /^\/v1\/.*/,
                target: 'customer-services',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                authentication: 'required',
                priority: 200,
                rateLimit: {
                    windowMs: 60000,
                    max: 50
                },
                deprecation: {
                    deprecated: true,
                    sunsetDate: '2024-12-31',
                    alternativeEndpoint: '/api/*'
                },
                transform: {
                    stripPrefix: '/v1',
                    addPrefix: '/api',
                    addHeaders: {
                        'X-Route-Type': 'legacy',
                        'X-API-Version': 'v1',
                        'X-Deprecation-Warning': 'This API version is deprecated. Please migrate to /api/*'
                    }
                }
            }
        ],

        // Enhanced fallback routes with intelligent error handling
        fallback: {
            enabled: true,
            routes: [
                {
                    name: 'api-not-found',
                    pattern: /^\/api\/.*/,
                    response: {
                        status: 404,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Error-Type': 'route-not-found'
                        },
                        body: {
                            success: false,
                            error: {
                                code: 'ROUTE_NOT_FOUND',
                                message: 'The requested API endpoint does not exist',
                                timestamp: () => new Date().toISOString(),
                                requestId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
                                documentation: '/api-docs'
                            }
                        }
                    }
                },
                {
                    name: 'general-not-found',
                    pattern: /.*/,
                    response: {
                        status: 404,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Error-Type': 'resource-not-found'
                        },
                        body: {
                            success: false,
                            error: {
                                code: 'RESOURCE_NOT_FOUND',
                                message: 'The requested resource was not found',
                                timestamp: () => new Date().toISOString(),
                                requestId: (req) => req.headers['x-request-id'] || crypto.randomUUID()
                            }
                        }
                    }
                }
            ]
        },

        // Route aggregation for composite requests and microservice orchestration
        aggregation: {
            enabled: true,
            maxConcurrency: 10,
            timeout: 30000,
            endpoints: [
                {
                    name: 'admin-dashboard-aggregate',
                    path: '/api/admin/dashboard/aggregate',
                    method: 'GET',
                    authentication: 'required',
                    authorization: ['admin', 'super-admin'],
                    aggregate: [
                        {
                            service: 'admin-server',
                            endpoint: '/stats/overview',
                            key: 'systemStats',
                            timeout: 5000,
                            required: true
                        },
                        {
                            service: 'customer-services',
                            endpoint: '/metrics/current',
                            key: 'serviceMetrics',
                            timeout: 5000,
                            required: false
                        },
                        {
                            service: 'admin-server',
                            endpoint: '/health/detailed',
                            key: 'healthStatus',
                            timeout: 3000,
                            required: false
                        }
                    ],
                    parallel: true,
                    cache: {
                        enabled: true,
                        ttl: 60
                    }
                },
                {
                    name: 'user-profile-complete',
                    path: '/api/user/profile/complete',
                    method: 'GET',
                    authentication: 'required',
                    aggregate: [
                        {
                            service: 'customer-services',
                            endpoint: '/user/profile/basic',
                            key: 'profile',
                            timeout: 5000,
                            required: true
                        },
                        {
                            service: 'customer-services',
                            endpoint: '/user/preferences',
                            key: 'preferences',
                            timeout: 3000,
                            required: false
                        },
                        {
                            service: 'customer-services',
                            endpoint: '/user/activity/recent',
                            key: 'recentActivity',
                            timeout: 3000,
                            required: false
                        }
                    ],
                    parallel: true
                }
            ]
        },

        // Enhanced transformation rules for request and response processing
        transformation: {
            request: {
                // URL rewriting rules
                urlRewrite: [
                    {
                        name: 'legacy-to-current',
                        from: /^\/legacy\/(.*)$/,
                        to: '/api/v1/$1',
                        preserveQuery: true
                    },
                    {
                        name: 'version-normalization',
                        from: /^\/v1\/(.*)$/,
                        to: '/api/$1',
                        preserveQuery: true
                    },
                    {
                        name: 'admin-shorthand',
                        from: /^\/admin\/(.*)$/,
                        to: '/api/admin/$1',
                        preserveQuery: true
                    }
                ],
                
                // Query parameter transformations
                queryParams: {
                    rename: {
                        'limit': 'pageSize',
                        'offset': 'pageNumber',
                        'sort': 'orderBy'
                    },
                    defaults: {
                        'pageSize': '20',
                        'pageNumber': '1',
                        'sortOrder': 'asc'
                    },
                    remove: ['debug', 'test', 'internal', '_'],
                    transform: {
                        'pageNumber': (value) => Math.max(1, parseInt(value, 10) || 1),
                        'pageSize': (value) => Math.min(100, Math.max(1, parseInt(value, 10) || 20))
                    }
                },
                
                // Header transformations
                headers: {
                    rename: {
                        'X-Token': 'Authorization',
                        'X-API-Token': 'Authorization'
                    },
                    format: {
                        'Authorization': (value) => {
                            if (!value.startsWith('Bearer ')) {
                                return `Bearer ${value}`;
                            }
                            return value;
                        },
                        'User-Agent': (value) => value || 'InsightSerenity-Gateway/1.0'
                    },
                    add: {
                        'X-Gateway-Version': '1.0.0',
                        'X-Request-Timestamp': () => new Date().toISOString(),
                        'X-Request-ID': () => crypto.randomUUID()
                    },
                    remove: ['X-Internal-Secret', 'X-Debug-Token']
                },
                
                // Body transformations
                body: {
                    sanitize: true,
                    maxSize: '10mb',
                    allowedTypes: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data']
                }
            },
            
            response: {
                // Response body transformations
                body: {
                    wrapResponse: false,
                    wrapper: {
                        success: true,
                        timestamp: () => new Date().toISOString(),
                        version: 'v1',
                        requestId: (req) => req.headers['x-request-id']
                    },
                    unwrapLegacy: true
                },
                
                // Status code mapping
                statusCodes: {
                    204: 200, // Convert no content to OK
                    301: 302  // Convert permanent redirects to temporary
                },
                
                // Header transformations
                headers: {
                    add: {
                        'X-Gateway-Response': 'true',
                        'X-Response-Time': (req, res, startTime) => `${performance.now() - startTime}ms`
                    },
                    remove: ['X-Internal-Service', 'X-Database-Query-Time']
                }
            }
        }
    },

    // Service registry configuration with health monitoring
    services: {
        registry: [
            {
                name: 'admin-server',
                url: process.env.ADMIN_SERVER_URL || 'http://localhost:4001',
                healthPath: '/health',
                path: '/admin',
                requiresAuth: true,
                autoRoute: false,
                timeout: 30000,
                retries: 3,
                weight: 1.0,
                tags: ['admin', 'management', 'internal'],
                metadata: {
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development'
                }
            },
            {
                name: 'customer-services',
                url: process.env.CUSTOMER_SERVICES_URL || 'http://localhost:4002',
                healthPath: '/health',
                path: '/services',
                requiresAuth: true,
                autoRoute: false,
                timeout: 30000,
                retries: 3,
                weight: 1.0,
                supportsWebSocket: true,
                tags: ['customer', 'business', 'public'],
                metadata: {
                    version: '1.0.0',
                    environment: process.env.NODE_ENV || 'development'
                }
            }
        ]
    },

    /**
     * Apply routing transformations to configuration with comprehensive error handling
     * @param {Object} config - Configuration object to transform
     * @throws {Error} If transformation fails
     */
    applyTransformations(config) {
        const startTime = performance.now();
        
        try {
            console.log('Starting routing configuration transformations...');
            
            // Initialize routing configuration with safe defaults
            config.routing = config.routing || {};
            
            // Merge routing policies with comprehensive validation
            config.routing = {
                ...this.policies,
                ...config.routing
            };

            // Ensure rules array exists and is valid
            if (!Array.isArray(config.routing.rules)) {
                console.warn('config.routing.rules is not an array, initializing as empty array');
                config.routing.rules = [];
            }

            // Process and validate routes with enhanced error handling
            this.processRoutes(config);

            // Add dynamic routes based on services
            this.addDynamicRoutes(config);

            // Setup route caching strategies
            this.setupRouteCaching(config);

            // Validate final configuration
            this.validateFinalConfiguration(config);

            const duration = performance.now() - startTime;
            console.log(`Routing configuration transformations completed in ${duration.toFixed(2)}ms`);

        } catch (error) {
            console.error('Error in applyTransformations:', error.message);
            console.error('Stack trace:', error.stack);
            throw new Error(`Routing configuration transformation failed: ${error.message}`);
        }
    },

    /**
     * Process and validate route configurations with comprehensive validation
     * @param {Object} config - Configuration object containing routing rules
     * @throws {RouteValidationError} If route validation fails
     */
    processRoutes(config) {
        try {
            console.log('Processing and validating routes...');
            
            if (!Array.isArray(config.routing.rules)) {
                console.warn('config.routing.rules is not an array, initializing as empty array');
                config.routing.rules = [];
            }

            // Normalize routes from different configuration sources
            config.routing.rules = this.normalizeRoutes(config.routing.rules);

            // Sort routes by priority (highest first)
            config.routing.rules.sort((a, b) => {
                const priorityA = this.getRoutePriority(a);
                const priorityB = this.getRoutePriority(b);
                return priorityB - priorityA;
            });

            // Validate and enhance each route
            config.routing.rules.forEach((route, index) => {
                try {
                    // Pre-validation checks
                    if (!route || typeof route !== 'object') {
                        throw new RouteValidationError(
                            `Route at index ${index} is not a valid object`,
                            route,
                            index
                        );
                    }

                    // Normalize route format (handle different property names)
                    route = this.normalizeRouteFormat(route, index);
                    
                    // Validate the route
                    this.validateRoute(route);
                    
                    // Enhance route with computed properties
                    this.enhanceRoute(route, index);
                    
                    // Update the route in the array
                    config.routing.rules[index] = route;

                } catch (error) {
                    if (error instanceof RouteValidationError) {
                        throw error;
                    }
                    
                    console.error(`Error processing route at index ${index}:`, error.message);
                    console.error('Route data:', JSON.stringify(route, null, 2));
                    throw new RouteValidationError(
                        `Route validation failed at index ${index}: ${error.message}`,
                        route,
                        index
                    );
                }
            });

            console.log(`Successfully processed ${config.routing.rules.length} routes`);

        } catch (error) {
            console.error('Error in processRoutes:', error.message);
            throw error;
        }
    },

    /**
     * Normalize routes from different configuration sources
     * @param {Array} routes - Array of route configurations
     * @returns {Array} Normalized routes
     */
    normalizeRoutes(routes) {
        if (!Array.isArray(routes)) {
            return [];
        }

        return routes.map((route, index) => {
            try {
                return this.normalizeRouteFormat(route, index);
            } catch (error) {
                console.warn(`Failed to normalize route at index ${index}:`, error.message);
                return null;
            }
        }).filter(Boolean);
    },

    /**
     * Normalize route format to handle different property naming conventions
     * @param {Object} route - Route configuration object
     * @param {number} index - Route index for error reporting
     * @returns {Object} Normalized route
     */
    normalizeRouteFormat(route, index) {
        if (!route || typeof route !== 'object') {
            throw new Error(`Invalid route object at index ${index}`);
        }

        const normalized = { ...route };

        // Handle different property names for route pattern
        if (route.path && !route.pattern) {
            // Convert path string to regex pattern
            if (typeof route.path === 'string') {
                // Escape special regex characters and convert wildcards
                const escapedPath = route.path
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '.*');
                normalized.pattern = new RegExp(`^${escapedPath}$`);
            } else {
                normalized.pattern = route.path;
            }
            delete normalized.path;
        }

        // Handle different target naming conventions
        if (route.target) {
            // Convert camelCase to kebab-case
            if (route.target === 'adminServer') {
                normalized.target = 'admin-server';
            } else if (route.target === 'customerServices') {
                normalized.target = 'customer-services';
            }
        }

        // Handle different rate limit property structures
        if (route.rateLimit) {
            if (route.rateLimit.requests && route.rateLimit.window) {
                normalized.rateLimit = {
                    max: route.rateLimit.requests,
                    windowMs: route.rateLimit.window
                };
            }
        }

        // Generate name if missing
        if (!normalized.name) {
            if (normalized.pattern && normalized.target) {
                const patternStr = normalized.pattern.toString().replace(/[^a-zA-Z0-9]/g, '-');
                normalized.name = `auto-${normalized.target}-${patternStr.substring(0, 20)}-${index}`;
            } else {
                normalized.name = `auto-route-${index}`;
            }
        }

        // Ensure authentication property is properly formatted
        if (normalized.authentication === true) {
            normalized.authentication = 'required';
        } else if (normalized.authentication === false) {
            normalized.authentication = 'none';
        }

        return normalized;
    },

    /**
     * Get route priority based on pattern type and explicit priority
     * @param {Object} route - Route configuration
     * @returns {number} Priority value
     */
    getRoutePriority(route) {
        // Return explicit priority if set
        if (route.priority !== undefined && typeof route.priority === 'number') {
            return route.priority;
        }

        // Determine priority based on pattern type and route characteristics
        if (route.name && route.name.startsWith('system-')) {
            return this.policies.priorities.system;
        }

        if (route.name && route.name.includes('auth')) {
            return this.policies.priorities.security;
        }

        if (route.name && route.name.includes('admin')) {
            return this.policies.priorities.admin;
        }

        if (typeof route.pattern === 'string') {
            if (route.pattern.includes('*')) {
                return this.policies.priorities.wildcard;
            }
            return this.policies.priorities.exact;
        }

        if (route.pattern instanceof RegExp) {
            const source = route.pattern.source;
            if (source.includes('.*') || source.includes('.+')) {
                return this.policies.priorities.pattern;
            }
            return this.policies.priorities.prefix;
        }

        return this.policies.priorities.fallback;
    },

    /**
     * Enhanced route validation with comprehensive error checking
     * @param {Object} route - Route to validate
     * @throws {Error} If route is invalid
     */
    validateRoute(route) {
        // Validate required name property
        if (!route.name || typeof route.name !== 'string' || route.name.trim().length === 0) {
            throw new Error('Route must have a name (non-empty string)');
        }

        // Validate required pattern property
        if (!route.pattern) {
            throw new Error(`Route ${route.name} must have a pattern`);
        }

        // Validate pattern type
        if (typeof route.pattern !== 'string' && !(route.pattern instanceof RegExp)) {
            throw new Error(`Route ${route.name} pattern must be a string or RegExp`);
        }

        // Validate required target property
        if (!route.target || typeof route.target !== 'string' || route.target.trim().length === 0) {
            throw new Error(`Route ${route.name} must have a target (non-empty string)`);
        }

        // Validate methods if specified
        if (route.methods) {
            if (!Array.isArray(route.methods)) {
                throw new Error(`Route ${route.name} methods must be an array`);
            }
            
            const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
            route.methods.forEach(method => {
                if (typeof method !== 'string') {
                    throw new Error(`Invalid method type in route ${route.name}: ${typeof method}`);
                }
                if (!validMethods.includes(method.toUpperCase())) {
                    throw new Error(`Invalid HTTP method ${method} in route ${route.name}`);
                }
            });
        }

        // Validate authentication property
        if (route.authentication !== undefined) {
            const validAuth = ['required', 'optional', 'none'];
            if (!validAuth.includes(route.authentication)) {
                throw new Error(`Invalid authentication value in route ${route.name}: ${route.authentication}`);
            }
        }

        // Validate authorization if specified
        if (route.authorization) {
            if (!Array.isArray(route.authorization)) {
                throw new Error(`Authorization must be an array in route ${route.name}`);
            }
            route.authorization.forEach(role => {
                if (typeof role !== 'string' || role.trim().length === 0) {
                    throw new Error(`Invalid authorization role in route ${route.name}: ${role}`);
                }
            });
        }

        // Validate rate limit configuration if specified
        if (route.rateLimit) {
            if (typeof route.rateLimit !== 'object' || route.rateLimit === null) {
                throw new Error(`Rate limit must be an object in route ${route.name}`);
            }
            if (typeof route.rateLimit.windowMs !== 'number' || route.rateLimit.windowMs <= 0) {
                throw new Error(`Invalid rate limit windowMs in route ${route.name}`);
            }
            if (typeof route.rateLimit.max !== 'number' || route.rateLimit.max <= 0) {
                throw new Error(`Invalid rate limit max in route ${route.name}`);
            }
        }

        // Validate cache configuration if specified
        if (route.cache && typeof route.cache === 'object' && route.cache !== null) {
            if (route.cache.ttl !== undefined && (typeof route.cache.ttl !== 'number' || route.cache.ttl < 0)) {
                throw new Error(`Invalid cache TTL in route ${route.name}`);
            }
        }
    },

    /**
     * Enhance route with computed properties and defaults
     * @param {Object} route - Route to enhance
     * @param {number} index - Route index
     */
    enhanceRoute(route, index) {
        // Ensure route has required fields with safe defaults
        route.id = route.id || `${route.name}-${Date.now()}-${index}`;
        route.priority = route.priority || this.getRoutePriority(route);
        route.metrics = route.metrics !== false;
        route.logging = route.logging !== false;
        
        // Set default authentication if not specified
        if (route.authentication === undefined) {
            route.authentication = 'required';
        }
        
        // Set default methods if not specified
        if (!route.methods) {
            route.methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
        }

        // Normalize methods to uppercase
        route.methods = route.methods.map(method => method.toUpperCase());

        // Add metadata
        route.metadata = route.metadata || {};
        route.metadata.createdAt = route.metadata.createdAt || new Date().toISOString();
        route.metadata.index = index;
    },

    /**
     * Add dynamic routes based on service registry
     * @param {Object} config - Configuration object
     */
    addDynamicRoutes(config) {
        try {
            console.log('Adding dynamic routes from service registry...');
            
            if (!config.services || !Array.isArray(config.services.registry)) {
                console.log('No service registry found, skipping dynamic route creation');
                return;
            }

            let dynamicRouteCount = 0;

            config.services.registry.forEach((service, index) => {
                try {
                    // Skip services with auto-routing disabled
                    if (service.autoRoute === false) {
                        console.log(`Auto-routing disabled for service: ${service.name}`);
                        return;
                    }

                    // Validate service configuration
                    if (!service.name || !service.path) {
                        console.warn(`Service at index ${index} missing name or path, skipping auto-route creation`);
                        return;
                    }

                    // Check if route already exists for this service
                    const existingRoute = config.routing.rules.find(
                        route => route.target === service.name
                    );

                    if (!existingRoute) {
                        // Create automatic route for service with comprehensive configuration
                        const dynamicRoute = {
                            name: `auto-${service.name}`,
                            pattern: new RegExp(`^${this.escapeRegexChars(service.path)}/.*`),
                            target: service.name,
                            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
                            authentication: service.requiresAuth ? 'required' : 'optional',
                            rateLimit: service.rateLimit,
                            priority: this.policies.priorities.prefix,
                            transform: {
                                stripPrefix: service.path,
                                addHeaders: {
                                    'X-Service-Name': service.name,
                                    'X-Route-Type': 'dynamic',
                                    'X-Auto-Generated': 'true'
                                }
                            },
                            metadata: {
                                autoGenerated: true,
                                sourceService: service.name
                            }
                        };

                        // Validate the dynamic route before adding
                        this.validateRoute(dynamicRoute);
                        config.routing.rules.push(dynamicRoute);
                        dynamicRouteCount++;
                        
                        console.log(`Created dynamic route for service: ${service.name}`);
                    } else {
                        console.log(`Route already exists for service: ${service.name}`);
                    }

                } catch (serviceError) {
                    console.error(`Error creating dynamic route for service ${service.name}:`, serviceError.message);
                    // Continue processing other services
                }
            });

            console.log(`Added ${dynamicRouteCount} dynamic routes`);

        } catch (error) {
            console.error('Error in addDynamicRoutes:', error.message);
            // Don't throw here, just log the error
        }
    },

    /**
     * Escape special regex characters in a string
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeRegexChars(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    /**
     * Setup route caching strategies based on route characteristics
     * @param {Object} config - Configuration object
     */
    setupRouteCaching(config) {
        try {
            console.log('Setting up route caching strategies...');
            
            if (!Array.isArray(config.routing.rules)) {
                return;
            }

            let cacheEnabledCount = 0;

            config.routing.rules.forEach(route => {
                // Skip if caching is explicitly disabled
                if (route.cache === false) {
                    return;
                }

                // Setup intelligent caching based on route characteristics
                if (route.methods && route.methods.includes('GET')) {
                    // Default caching for GET requests
                    if (!route.cache || route.cache === true) {
                        route.cache = {
                            enabled: true,
                            ttl: this.getCacheTTLForRoute(route),
                            vary: this.getCacheVaryHeadersForRoute(route),
                            key: this.generateCacheKeyFunction(route)
                        };
                        cacheEnabledCount++;
                    }
                }

                // Disable caching for mutation methods unless explicitly enabled
                if (route.methods && ['POST', 'PUT', 'DELETE', 'PATCH'].some(m => route.methods.includes(m))) {
                    if (!route.cache) {
                        route.cache = { enabled: false };
                    }
                }

                // Disable caching for authentication and admin routes
                if (route.name && (route.name.includes('auth') || route.name.includes('admin'))) {
                    if (!route.cache) {
                        route.cache = { enabled: false };
                    }
                }
            });

            console.log(`Enabled caching for ${cacheEnabledCount} routes`);

        } catch (error) {
            console.error('Error in setupRouteCaching:', error.message);
            // Don't throw here, just log the error
        }
    },

    /**
     * Get appropriate cache TTL for a route based on its characteristics
     * @param {Object} route - Route configuration
     * @returns {number} Cache TTL in seconds
     */
    getCacheTTLForRoute(route) {
        // Static content - long cache
        if (route.name && route.name.includes('static')) {
            return 86400; // 24 hours
        }

        // Documentation - medium cache
        if (route.name && route.name.includes('docs')) {
            return 3600; // 1 hour
        }

        // Analytics and reports - medium cache
        if (route.name && route.name.includes('analytics')) {
            return 600; // 10 minutes
        }

        // Regular content - short cache
        return 300; // 5 minutes
    },

    /**
     * Get cache vary headers for a route
     * @param {Object} route - Route configuration
     * @returns {Array} Array of header names to vary cache by
     */
    getCacheVaryHeadersForRoute(route) {
        const baseHeaders = ['Accept', 'Accept-Encoding'];

        // Add tenant-specific headers for multi-tenant routes
        if (this.policies.multiTenant.enabled) {
            baseHeaders.push('X-Tenant-ID');
        }

        // Add authorization header for authenticated routes
        if (route.authentication === 'required') {
            baseHeaders.push('Authorization');
        }

        return baseHeaders;
    },

    /**
     * Generate cache key function for a route
     * @param {Object} route - Route configuration
     * @returns {Function} Cache key generation function
     */
    generateCacheKeyFunction(route) {
        return (req) => {
            const parts = [];
            
            // Add tenant information
            const tenant = req.headers['x-tenant-id'] || 'default';
            parts.push(`tenant:${tenant}`);
            
            // Add method and path
            parts.push(`method:${req.method}`);
            parts.push(`path:${req.path}`);
            
            // Add query parameters (sorted for consistency)
            if (req.query && Object.keys(req.query).length > 0) {
                const sortedQuery = Object.keys(req.query)
                    .sort()
                    .map(key => `${key}=${req.query[key]}`)
                    .join('&');
                parts.push(`query:${sortedQuery}`);
            }
            
            // Add user context for personalized content
            if (req.user && req.user.id) {
                parts.push(`user:${req.user.id}`);
            }
            
            return parts.join('|');
        };
    },

    /**
     * Validate final configuration after all transformations
     * @param {Object} config - Configuration object
     * @throws {Error} If final validation fails
     */
    validateFinalConfiguration(config) {
        try {
            console.log('Performing final configuration validation...');
            
            // Validate route uniqueness
            const routeNames = new Set();
            const duplicateNames = [];
            
            config.routing.rules.forEach(route => {
                if (routeNames.has(route.name)) {
                    duplicateNames.push(route.name);
                } else {
                    routeNames.add(route.name);
                }
            });
            
            if (duplicateNames.length > 0) {
                throw new Error(`Duplicate route names found: ${duplicateNames.join(', ')}`);
            }
            
            // Validate service references
            const availableServices = new Set();
            if (config.services && config.services.registry) {
                config.services.registry.forEach(service => {
                    availableServices.add(service.name);
                });
            }
            availableServices.add('gateway'); // Gateway is always available
            
            const invalidTargets = [];
            config.routing.rules.forEach(route => {
                if (!availableServices.has(route.target)) {
                    invalidTargets.push(`${route.name} -> ${route.target}`);
                }
            });
            
            if (invalidTargets.length > 0) {
                console.warn(`Routes with unavailable targets: ${invalidTargets.join(', ')}`);
            }
            
            console.log('Final configuration validation completed successfully');
            
        } catch (error) {
            console.error('Final configuration validation failed:', error.message);
            throw error;
        }
    },

    /**
     * Find matching route for request with comprehensive matching logic
     * @param {Object} req - Request object
     * @param {Array} routes - Array of route configurations
     * @returns {Object|null} Matching route or null
     */
    findMatchingRoute(req, routes) {
        const method = req.method.toUpperCase();
        const path = req.path;
        const startTime = performance.now();

        try {
            // Sort routes by priority if not already sorted
            const sortedRoutes = routes.sort((a, b) => (b.priority || 0) - (a.priority || 0));

            for (const route of sortedRoutes) {
                // Check method compatibility
                if (route.methods && !route.methods.includes(method)) {
                    continue;
                }

                // Check pattern matching
                let isMatch = false;
                
                if (typeof route.pattern === 'string') {
                    if (route.pattern === path) {
                        isMatch = true;
                    } else if (route.pattern.endsWith('*')) {
                        const prefix = route.pattern.slice(0, -1);
                        isMatch = path.startsWith(prefix);
                    }
                } else if (route.pattern instanceof RegExp) {
                    isMatch = route.pattern.test(path);
                }

                if (isMatch) {
                    // Log matching performance
                    const duration = performance.now() - startTime;
                    if (duration > 10) {
                        console.warn(`Slow route matching: ${duration.toFixed(2)}ms for ${path}`);
                    }

                    return {
                        ...route,
                        matchDuration: duration,
                        matchedAt: new Date().toISOString()
                    };
                }
            }

            return null;

        } catch (error) {
            console.error('Error in findMatchingRoute:', error.message);
            return null;
        }
    },

    /**
     * Apply route transformations to request
     * @param {Object} req - Request object
     * @param {Object} route - Route configuration
     */
    applyRouteTransformations(req, route) {
        if (!route.transform) {
            return;
        }

        const transform = route.transform;
        const startTime = performance.now();

        try {
            // Apply URL transformations
            if (transform.stripPrefix) {
                const regex = new RegExp(`^${this.escapeRegexChars(transform.stripPrefix)}`);
                req.url = req.url.replace(regex, '');
                req.path = req.path.replace(regex, '');
            }

            if (transform.addPrefix) {
                req.url = transform.addPrefix + req.url;
                req.path = transform.addPrefix + req.path;
            }

            // Apply header transformations
            if (transform.addHeaders) {
                Object.entries(transform.addHeaders).forEach(([key, value]) => {
                    const headerValue = typeof value === 'function' ? value(req) : value;
                    req.headers[key.toLowerCase()] = headerValue;
                });
            }

            if (transform.removeHeaders) {
                transform.removeHeaders.forEach(header => {
                    delete req.headers[header.toLowerCase()];
                });
            }

            // Apply query parameter transformations
            if (transform.queryParams) {
                this.applyQueryTransformations(req, transform.queryParams);
            }

            // Add transformation metadata
            req.transformationApplied = {
                route: route.name,
                duration: performance.now() - startTime,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`Error applying transformations for route ${route.name}:`, error.message);
            // Continue processing - transformation errors shouldn't stop request
        }
    },

    /**
     * Apply query parameter transformations
     * @param {Object} req - Request object
     * @param {Object} queryConfig - Query transformation configuration
     */
    applyQueryTransformations(req, queryConfig) {
        if (!req.query) {
            req.query = {};
        }

        // Rename query parameters
        if (queryConfig.rename) {
            Object.entries(queryConfig.rename).forEach(([from, to]) => {
                if (req.query[from] !== undefined) {
                    req.query[to] = req.query[from];
                    delete req.query[from];
                }
            });
        }

        // Apply default values
        if (queryConfig.defaults) {
            Object.entries(queryConfig.defaults).forEach(([key, value]) => {
                if (req.query[key] === undefined) {
                    req.query[key] = value;
                }
            });
        }

        // Transform query parameter values
        if (queryConfig.transform) {
            Object.entries(queryConfig.transform).forEach(([key, transformer]) => {
                if (req.query[key] !== undefined && typeof transformer === 'function') {
                    try {
                        req.query[key] = transformer(req.query[key]);
                    } catch (error) {
                        console.warn(`Query parameter transformation failed for ${key}:`, error.message);
                    }
                }
            });
        }

        // Remove unwanted parameters
        if (queryConfig.remove) {
            queryConfig.remove.forEach(param => {
                delete req.query[param];
            });
        }
    }
};

// Export the routing configuration module
module.exports = routingConfig;