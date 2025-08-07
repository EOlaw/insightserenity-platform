'use strict';

/**
 * @fileoverview Swagger/OpenAPI configuration for API documentation
 * @module shared/config/swagger-config
 */

const { parseBoolean, parseArray } = require('./base-config').helpers;

// Swagger configuration object
const swaggerConfig = {
  // Swagger UI settings
  enabled: parseBoolean(process.env.SWAGGER_ENABLED, true),
  title: process.env.SWAGGER_TITLE || 'InsightSerenity Platform API',
  version: process.env.SWAGGER_VERSION || '1.0.0',
  description: process.env.SWAGGER_DESCRIPTION || 'Comprehensive API documentation for InsightSerenity Platform - Enterprise Multi-tenant Solution for Consulting and Recruitment',
  
  // API documentation paths
  paths: {
    admin: process.env.SWAGGER_ADMIN_PATH || '/api-docs/admin',
    services: process.env.SWAGGER_SERVICES_PATH || '/api-docs/services',
    combined: process.env.SWAGGER_COMBINED_PATH || '/api-docs',
    json: process.env.SWAGGER_JSON_PATH || '/api-docs.json'
  },

  // OpenAPI specification
  openapi: {
    version: process.env.OPENAPI_VERSION || '3.0.3',
    info: {
      title: process.env.API_TITLE || 'InsightSerenity Platform API',
      version: process.env.API_VERSION || '1.0.0',
      description: process.env.API_DESCRIPTION || 'Enterprise-grade multi-tenant platform API for consulting and recruitment services',
      termsOfService: process.env.API_TERMS_URL || 'https://insightserenity.com/terms',
      contact: {
        name: process.env.API_CONTACT_NAME || 'API Support Team',
        email: process.env.API_CONTACT_EMAIL || 'api-support@insightserenity.com',
        url: process.env.API_CONTACT_URL || 'https://insightserenity.com/support'
      },
      license: {
        name: process.env.API_LICENSE_NAME || 'Proprietary',
        url: process.env.API_LICENSE_URL || 'https://insightserenity.com/license'
      }
    },
    externalDocs: {
      description: process.env.API_DOCS_DESCRIPTION || 'Find more information in our developer portal',
      url: process.env.API_DOCS_URL || 'https://developers.insightserenity.com'
    }
  },

  // Server configuration
  servers: {
    development: {
      url: process.env.SWAGGER_DEV_SERVER || 'http://localhost:3000',
      description: 'Development server'
    },
    staging: {
      url: process.env.SWAGGER_STAGING_SERVER || 'https://staging-api.insightserenity.com',
      description: 'Staging server'
    },
    production: {
      url: process.env.SWAGGER_PROD_SERVER || 'https://api.insightserenity.com',
      description: 'Production server'
    }
  },

  // Security schemes
  security: {
    schemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Authorization header using the Bearer scheme'
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API Key authentication'
      },
      oauth2: {
        type: 'oauth2',
        description: 'OAuth2 authentication',
        flows: {
          authorizationCode: {
            authorizationUrl: process.env.OAUTH_AUTH_URL || 'https://auth.insightserenity.com/oauth/authorize',
            tokenUrl: process.env.OAUTH_TOKEN_URL || 'https://auth.insightserenity.com/oauth/token',
            refreshUrl: process.env.OAUTH_REFRESH_URL || 'https://auth.insightserenity.com/oauth/refresh',
            scopes: {
              'read:users': 'Read user information',
              'write:users': 'Modify user information',
              'read:organizations': 'Read organization data',
              'write:organizations': 'Modify organization data',
              'read:projects': 'Read project data',
              'write:projects': 'Modify project data',
              'admin': 'Full administrative access'
            }
          }
        }
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'sessionId',
        description: 'Cookie-based session authentication'
      }
    },
    defaultSecurity: parseArray(process.env.SWAGGER_DEFAULT_SECURITY, ['bearerAuth'])
  },

  // Tags configuration
  tags: [
    {
      name: 'Authentication',
      description: 'Authentication and authorization endpoints',
      externalDocs: {
        description: 'Learn more about authentication',
        url: 'https://docs.insightserenity.com/auth'
      }
    },
    {
      name: 'Users',
      description: 'User management operations',
      externalDocs: {
        description: 'User management guide',
        url: 'https://docs.insightserenity.com/users'
      }
    },
    {
      name: 'Organizations',
      description: 'Organization management and multi-tenancy',
      externalDocs: {
        description: 'Multi-tenant architecture',
        url: 'https://docs.insightserenity.com/organizations'
      }
    },
    {
      name: 'Projects',
      description: 'Project and engagement management',
      externalDocs: {
        description: 'Project management guide',
        url: 'https://docs.insightserenity.com/projects'
      }
    },
    {
      name: 'Clients',
      description: 'Client relationship management',
      externalDocs: {
        description: 'CRM features',
        url: 'https://docs.insightserenity.com/clients'
      }
    },
    {
      name: 'Consultants',
      description: 'Consultant management and scheduling',
      externalDocs: {
        description: 'Consultant management',
        url: 'https://docs.insightserenity.com/consultants'
      }
    },
    {
      name: 'Jobs',
      description: 'Job posting and management',
      externalDocs: {
        description: 'Recruitment features',
        url: 'https://docs.insightserenity.com/jobs'
      }
    },
    {
      name: 'Candidates',
      description: 'Candidate management and tracking',
      externalDocs: {
        description: 'ATS features',
        url: 'https://docs.insightserenity.com/candidates'
      }
    },
    {
      name: 'Billing',
      description: 'Billing and subscription management',
      externalDocs: {
        description: 'Billing documentation',
        url: 'https://docs.insightserenity.com/billing'
      }
    },
    {
      name: 'Reports',
      description: 'Analytics and reporting endpoints',
      externalDocs: {
        description: 'Analytics guide',
        url: 'https://docs.insightserenity.com/reports'
      }
    },
    {
      name: 'Admin',
      description: 'Platform administration endpoints',
      externalDocs: {
        description: 'Admin guide',
        url: 'https://docs.insightserenity.com/admin'
      }
    },
    {
      name: 'Webhooks',
      description: 'Webhook management and events',
      externalDocs: {
        description: 'Webhook integration',
        url: 'https://docs.insightserenity.com/webhooks'
      }
    },
    {
      name: 'System',
      description: 'System health and monitoring',
      externalDocs: {
        description: 'System monitoring',
        url: 'https://docs.insightserenity.com/monitoring'
      }
    }
  ],

  // UI configuration
  ui: {
    theme: process.env.SWAGGER_UI_THEME || 'flattop',
    customCss: process.env.SWAGGER_CUSTOM_CSS || '',
    customJs: process.env.SWAGGER_CUSTOM_JS || '',
    favicon: process.env.SWAGGER_FAVICON || '/favicon.ico',
    logo: {
      url: process.env.SWAGGER_LOGO_URL || '/assets/logo.png',
      backgroundColor: process.env.SWAGGER_LOGO_BG || '#FFFFFF',
      altText: process.env.SWAGGER_LOGO_ALT || 'InsightSerenity Logo'
    },
    tryItOut: parseBoolean(process.env.SWAGGER_TRY_IT_OUT, true),
    deepLinking: parseBoolean(process.env.SWAGGER_DEEP_LINKING, true),
    displayOperationId: parseBoolean(process.env.SWAGGER_DISPLAY_OPERATION_ID, false),
    defaultModelsExpandDepth: parseInt(process.env.SWAGGER_MODELS_EXPAND_DEPTH) || 1,
    defaultModelExpandDepth: parseInt(process.env.SWAGGER_MODEL_EXPAND_DEPTH) || 1,
    defaultModelRendering: process.env.SWAGGER_MODEL_RENDERING || 'example',
    displayRequestDuration: parseBoolean(process.env.SWAGGER_DISPLAY_REQUEST_DURATION, true),
    docExpansion: process.env.SWAGGER_DOC_EXPANSION || 'list', // none, list, full
    filter: parseBoolean(process.env.SWAGGER_FILTER, true),
    showExtensions: parseBoolean(process.env.SWAGGER_SHOW_EXTENSIONS, true),
    showCommonExtensions: parseBoolean(process.env.SWAGGER_SHOW_COMMON_EXTENSIONS, true),
    persistAuthorization: parseBoolean(process.env.SWAGGER_PERSIST_AUTH, true)
  },

  // Schema configuration
  schemas: {
    definitions: {
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            description: 'Error code'
          },
          message: {
            type: 'string',
            description: 'Error message'
          },
          details: {
            type: 'object',
            description: 'Additional error details'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Error timestamp'
          }
        }
      },
      Pagination: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
            description: 'Current page number'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description: 'Items per page'
          },
          total: {
            type: 'integer',
            description: 'Total number of items'
          },
          pages: {
            type: 'integer',
            description: 'Total number of pages'
          }
        }
      },
      ApiResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Indicates if the request was successful'
          },
          data: {
            type: 'object',
            description: 'Response data'
          },
          meta: {
            type: 'object',
            description: 'Response metadata'
          },
          errors: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Error'
            },
            description: 'Array of errors if any'
          }
        }
      }
    }
  },

  // Examples configuration
  examples: {
    includeExamples: parseBoolean(process.env.SWAGGER_INCLUDE_EXAMPLES, true),
    exampleValues: {
      bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      apiKey: 'isk_1234567890abcdef',
      userId: '507f1f77bcf86cd799439011',
      organizationId: '507f191e810c19729de860ea',
      email: 'user@example.com',
      password: 'SecurePassword123!',
      timestamp: new Date().toISOString()
    }
  },

  // Options
  options: {
    enableCORS: parseBoolean(process.env.SWAGGER_ENABLE_CORS, true),
    enableValidation: parseBoolean(process.env.SWAGGER_ENABLE_VALIDATION, true),
    enableMocking: parseBoolean(process.env.SWAGGER_ENABLE_MOCKING, process.env.NODE_ENV !== 'production'),
    enableSchemaValidation: parseBoolean(process.env.SWAGGER_SCHEMA_VALIDATION, true),
    enableResponseValidation: parseBoolean(process.env.SWAGGER_RESPONSE_VALIDATION, true),
    hideSchemas: parseBoolean(process.env.SWAGGER_HIDE_SCHEMAS, false),
    hideProduction: parseBoolean(process.env.SWAGGER_HIDE_PRODUCTION, false),
    customMiddleware: parseArray(process.env.SWAGGER_CUSTOM_MIDDLEWARE, [])
  },

  // Access control
  access: {
    requireAuth: parseBoolean(process.env.SWAGGER_REQUIRE_AUTH, process.env.NODE_ENV === 'production'),
    allowedRoles: parseArray(process.env.SWAGGER_ALLOWED_ROLES, ['admin', 'developer']),
    ipWhitelist: parseArray(process.env.SWAGGER_IP_WHITELIST, []),
    username: process.env.SWAGGER_USERNAME || 'admin',
    password: process.env.SWAGGER_PASSWORD || 'admin'
  },

  // Generation options
  generation: {
    autoGenerate: parseBoolean(process.env.SWAGGER_AUTO_GENERATE, true),
    scanPaths: parseArray(process.env.SWAGGER_SCAN_PATHS, [
      './servers/admin-server/modules/**/routes/*.js',
      './servers/customer-services/modules/**/routes/*.js'
    ]),
    ignorePaths: parseArray(process.env.SWAGGER_IGNORE_PATHS, [
      '*/test/*',
      '*/tests/*',
      '*/mocks/*'
    ]),
    outputPath: process.env.SWAGGER_OUTPUT_PATH || './docs/api/swagger.json',
    baseDir: process.env.SWAGGER_BASE_DIR || process.cwd()
  }
};

// Validate swagger configuration
const validateSwaggerConfig = (config) => {
  const errors = [];

  // Validate OpenAPI version
  const validVersions = ['3.0.0', '3.0.1', '3.0.2', '3.0.3'];
  if (!validVersions.includes(config.openapi.version)) {
    errors.push(`Invalid OpenAPI version: ${config.openapi.version}`);
  }

  // Validate servers
  if (!config.servers.development.url || !config.servers.production.url) {
    errors.push('Development and production server URLs are required');
  }

  // Validate security schemes
  if (Object.keys(config.security.schemes).length === 0) {
    errors.push('At least one security scheme must be defined');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (!config.access.requireAuth) {
      console.warn('Warning: Swagger documentation should require authentication in production');
    }
    if (config.options.enableMocking) {
      errors.push('API mocking should be disabled in production');
    }
    if (config.access.username === 'admin' || config.access.password === 'admin') {
      errors.push('Default Swagger credentials must be changed in production');
    }
  }

  // if (errors.length > 0) {
  //   throw new Error('Swagger configuration validation failed:\n' + errors.join('\n'));
  // }

  return true;
};

// Validate the configuration
validateSwaggerConfig(swaggerConfig);

// Export configuration
module.exports = swaggerConfig;