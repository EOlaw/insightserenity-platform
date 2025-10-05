# InsightSerenity Platform - Database & Authentication System Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Token Blacklist System](#token-blacklist-system)
4. [Database Service Layer](#database-service-layer)
5. [Implementation Guide](#implementation-guide)
6. [API Reference](#api-reference)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## System Overview

The InsightSerenity platform implements a production-ready, multi-tenant database architecture with secure authentication and session management. The system provides comprehensive token blacklist functionality that works reliably across multiple server instances, ensuring that logged-out tokens cannot be reused even in distributed environments.

### Key Features

The platform implements database-backed token blacklisting using MongoDB with TTL (Time-To-Live) indexes for automatic cleanup. All authentication operations check the blacklist to prevent unauthorized access with revoked tokens. The system supports multiple database connections for admin, customer, and shared data with automatic model discovery and registration. Full tenant isolation ensures data security across different organizational boundaries. The architecture scales horizontally across multiple server instances while maintaining consistent state through shared database storage.

### Technology Stack

The backend infrastructure uses Node.js with Express for the application server. MongoDB serves as the primary database with Mongoose ODM for data modeling. Passport JWT handles token-based authentication while bcryptjs provides password hashing. Winston manages structured logging throughout the system, and dotenv handles environment-specific configuration.

---

## Architecture

### Database Structure

The platform maintains three separate databases that serve distinct purposes within the system architecture.

The **Admin Database** stores administrative data, user management for administrators, system configuration, and audit logs. This database contains sensitive operational data requiring the highest security controls.

The **Customer Database** maintains customer-specific information including user accounts, profiles and preferences, organizational data, and business-specific entities. This database implements strict tenant isolation to ensure data privacy between different organizations.

The **Shared Database** contains cross-cutting concerns such as the token blacklist, shared configuration, and global settings. This database provides centralized state management for features that must remain consistent across all services.

### Component Architecture

The system consists of several interconnected components that work together to provide robust database and authentication functionality.

The **ConnectionManager** serves as the orchestrator for database connections, managing model routing and providing environment-specific configuration. This component ensures all database connections remain healthy and properly configured.

The **DatabaseManager** handles multiple MongoDB connections with connection pooling, implements health monitoring with automatic retry logic, and provides graceful shutdown capabilities. This component maintains the reliability of database connections throughout the application lifecycle.

The **ModelRouter** performs automatic model discovery, manages model-to-database routing, and maintains a performance-optimized cache. This component ensures efficient access to data models across the application.

The **DatabaseService** provides a secure abstraction layer over database operations, implements tenant isolation automatically, and offers specialized services for different entity types. This component simplifies database interactions for application developers.

The **AuthService** manages authentication flows, implements token generation and validation, handles token blacklisting for logout functionality, and provides comprehensive session management. This component ensures secure user authentication and authorization.

### Data Flow

When a user logs in, the authentication flow begins. The system validates credentials against the customer database, generates JWT access and refresh tokens, and returns both tokens to the client. The access token enables API access while the refresh token allows obtaining new access tokens.

On subsequent API requests, the authentication middleware extracts the JWT token from the Authorization header and verifies the token signature and expiration. The system then queries the token blacklist in the shared database to ensure the token has not been revoked. If all checks pass, the request proceeds to the protected route handler.

When a user logs out, the logout process initiates by hashing both access and refresh tokens and storing them in the token blacklist with their natural expiration dates. MongoDB TTL indexes automatically remove expired tokens from the blacklist, preventing database growth. Any future requests using these tokens are denied even though the JWT signature remains valid.

---

## Token Blacklist System

### Overview

The token blacklist system provides production-ready session management by storing invalidated tokens in MongoDB. This approach ensures consistent behavior across multiple server instances and survives server restarts, unlike in-memory solutions.

### Implementation Details

The TokenBlacklist model stores critical information for each blacklisted token. The system maintains a SHA-256 hash of the token rather than the plain token for security. Additional fields track the user ID, tenant ID for multi-tenancy support, the reason for blacklisting, timestamps for when the token was blacklisted and when it expires, IP address and user agent for audit trails, and custom metadata for additional context.

MongoDB manages automatic cleanup through a TTL index on the expiresAt field. This configuration instructs MongoDB to automatically delete documents after their expiration date passes, ensuring the blacklist collection does not grow indefinitely without requiring manual cleanup processes.

### Security Considerations

The implementation incorporates several security measures to protect the system. Tokens are hashed before storage using SHA-256 to prevent exposure if the database is compromised. The system implements fail-secure behavior, denying access if the blacklist check fails rather than allowing potentially revoked tokens through. Comprehensive audit logging tracks all blacklist operations for security monitoring and compliance purposes.

### Database Schema

```javascript
{
  tokenHash: String (indexed, unique),
  userId: ObjectId (indexed),
  tenantId: String (indexed),
  reason: String (enum: logout, password_change, forced_logout, security_revocation, account_deletion),
  blacklistedAt: Date (indexed),
  expiresAt: Date (indexed with TTL),
  ipAddress: String,
  userAgent: String,
  metadata: {
    sessionId: String,
    deviceId: String,
    location: String
  }
}
```

### Token Lifecycle

The lifecycle of a token begins at creation when the authentication service generates a JWT with an expiration time. During active use, requests include the token in the Authorization header, and the middleware verifies both signature and blacklist status. At logout, the system hashes the token and stores it in the blacklist with the token's natural expiration date. After expiration, MongoDB automatically removes the blacklist entry through the TTL index, completing the lifecycle.

---

## Database Service Layer

### Overview

The database service layer provides a secure, abstracted interface for all database operations throughout the application. This layer handles connection management automatically, implements tenant isolation, and provides specialized services for different entity types.

### Core Services

The **DatabaseService** serves as the base service providing access to any database and model, executing queries with automatic connection management, and creating multi-database transactions. This service forms the foundation for all database interactions.

The **UserDatabaseService** extends DatabaseService with user-specific operations including finding users with tenant isolation, creating and updating users securely, implementing soft delete functionality, and generating user statistics. This specialized service simplifies common user management tasks.

### Service Access

Application code accesses database services through the exported factory functions from the database module. The getDatabaseService function returns the general-purpose database service for any model or database access. The getUserDatabaseService function returns the specialized user service with built-in tenant isolation and user-specific methods.

### Model Access

The service layer provides flexible model access through the getModel method. This method accepts a model name and optional database name, with the system automatically discovering model file paths and caching models for performance. The method handles model instantiation with the correct database connection and provides helpful error messages when models cannot be found.

```javascript
const database = require('../../shared/lib/database');

// Get database service
const dbService = database.getDatabaseService();

// Access a model from specific database
const TokenBlacklist = dbService.getModel('TokenBlacklist', 'shared');
const User = dbService.getModel('User', 'customer');

// Use the model
const blacklistedTokens = await TokenBlacklist.find({ userId });
```

---

## Implementation Guide

### Building a New Service

Creating a new service follows a standard pattern that ensures consistency and maintainability across the platform. The following example demonstrates building a consultant service.

#### Service Structure

```javascript
/**
 * @fileoverview Consultant Service
 * @module servers/customer-services/modules/consultants/services/consultant-service
 */

const { AppError } = require('../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-service'
});
const database = require('../../../../../shared/lib/database');

class ConsultantService {
    constructor() {
        this._dbService = null;
    }

    /**
     * Get database service instance
     * @private
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    /**
     * Get Consultant model
     * @private
     */
    _getConsultantModel() {
        const dbService = this._getDatabaseService();
        return dbService.getModel('Consultant', 'customer');
    }

    /**
     * Create a new consultant
     * @param {Object} consultantData - Consultant data
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Created consultant
     */
    async createConsultant(consultantData, tenantId) {
        try {
            logger.info('Creating consultant', { 
                email: consultantData.email, 
                tenantId 
            });

            const Consultant = this._getConsultantModel();

            // Check if consultant already exists
            const existing = await Consultant.findOne({
                email: consultantData.email,
                tenantId
            });

            if (existing) {
                throw new AppError('Consultant already exists', 409);
            }

            // Create consultant
            const consultant = await Consultant.create({
                ...consultantData,
                tenantId,
                createdAt: new Date()
            });

            logger.info('Consultant created successfully', { 
                consultantId: consultant._id 
            });

            return this._sanitizeConsultant(consultant);

        } catch (error) {
            logger.error('Failed to create consultant', { 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Find consultant by ID
     * @param {string} consultantId - Consultant ID
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Consultant data
     */
    async findConsultantById(consultantId, tenantId) {
        try {
            const Consultant = this._getConsultantModel();

            const consultant = await Consultant.findOne({
                _id: consultantId,
                tenantId,
                isDeleted: { $ne: true }
            });

            if (!consultant) {
                throw new AppError('Consultant not found', 404);
            }

            return this._sanitizeConsultant(consultant);

        } catch (error) {
            logger.error('Failed to find consultant', { 
                error: error.message,
                consultantId 
            });
            throw error;
        }
    }

    /**
     * List consultants with pagination
     * @param {string} tenantId - Tenant ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated results
     */
    async listConsultants(tenantId, options = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                sort = '-createdAt',
                filters = {}
            } = options;

            const Consultant = this._getConsultantModel();
            const skip = (page - 1) * limit;

            const query = {
                tenantId,
                isDeleted: { $ne: true },
                ...filters
            };

            const [consultants, total] = await Promise.all([
                Consultant.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Consultant.countDocuments(query)
            ]);

            return {
                consultants: consultants.map(c => this._sanitizeConsultant(c)),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to list consultants', { 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Update consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} updates - Update data
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<Object>} Updated consultant
     */
    async updateConsultant(consultantId, updates, tenantId) {
        try {
            const Consultant = this._getConsultantModel();

            const consultant = await Consultant.findOneAndUpdate(
                {
                    _id: consultantId,
                    tenantId,
                    isDeleted: { $ne: true }
                },
                {
                    ...updates,
                    updatedAt: new Date()
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!consultant) {
                throw new AppError('Consultant not found', 404);
            }

            logger.info('Consultant updated successfully', { 
                consultantId 
            });

            return this._sanitizeConsultant(consultant);

        } catch (error) {
            logger.error('Failed to update consultant', { 
                error: error.message,
                consultantId 
            });
            throw error;
        }
    }

    /**
     * Delete consultant (soft delete)
     * @param {string} consultantId - Consultant ID
     * @param {string} tenantId - Tenant ID
     * @returns {Promise<void>}
     */
    async deleteConsultant(consultantId, tenantId) {
        try {
            const Consultant = this._getConsultantModel();

            const result = await Consultant.findOneAndUpdate(
                {
                    _id: consultantId,
                    tenantId,
                    isDeleted: { $ne: true }
                },
                {
                    isDeleted: true,
                    deletedAt: new Date()
                }
            );

            if (!result) {
                throw new AppError('Consultant not found', 404);
            }

            logger.info('Consultant deleted successfully', { 
                consultantId 
            });

        } catch (error) {
            logger.error('Failed to delete consultant', { 
                error: error.message,
                consultantId 
            });
            throw error;
        }
    }

    /**
     * Sanitize consultant data for output
     * @private
     */
    _sanitizeConsultant(consultant) {
        const data = consultant.toObject ? consultant.toObject() : consultant;
        delete data.__v;
        delete data.isDeleted;
        return data;
    }
}

module.exports = new ConsultantService();
```

### Building a Controller

Controllers handle HTTP request/response logic and delegate business logic to services.

```javascript
/**
 * @fileoverview Consultant Controller
 * @module servers/customer-services/modules/consultants/controllers/consultant-controller
 */

const consultantService = require('../services/consultant-service');
const { AppError } = require('../../../../../shared/lib/utils/app-error');

class ConsultantController {
    /**
     * Create consultant
     * POST /api/consultants
     */
    async createConsultant(req, res, next) {
        try {
            const consultantData = req.body;
            const tenantId = req.user.tenantId || 'default';

            const result = await consultantService.createConsultant(
                consultantData,
                tenantId
            );

            res.status(201).json({
                success: true,
                message: 'Consultant created successfully',
                data: result
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get consultant by ID
     * GET /api/consultants/:id
     */
    async getConsultant(req, res, next) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId || 'default';

            const consultant = await consultantService.findConsultantById(
                id,
                tenantId
            );

            res.status(200).json({
                success: true,
                data: consultant
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * List consultants
     * GET /api/consultants
     */
    async listConsultants(req, res, next) {
        try {
            const tenantId = req.user.tenantId || 'default';
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                sort: req.query.sort || '-createdAt',
                filters: req.query.filters || {}
            };

            const result = await consultantService.listConsultants(
                tenantId,
                options
            );

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Update consultant
     * PUT /api/consultants/:id
     */
    async updateConsultant(req, res, next) {
        try {
            const { id } = req.params;
            const updates = req.body;
            const tenantId = req.user.tenantId || 'default';

            const consultant = await consultantService.updateConsultant(
                id,
                updates,
                tenantId
            );

            res.status(200).json({
                success: true,
                message: 'Consultant updated successfully',
                data: consultant
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete consultant
     * DELETE /api/consultants/:id
     */
    async deleteConsultant(req, res, next) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId || 'default';

            await consultantService.deleteConsultant(id, tenantId);

            res.status(200).json({
                success: true,
                message: 'Consultant deleted successfully'
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ConsultantController();
```

### Building Routes

Routes define the API endpoints and apply middleware for authentication and validation.

```javascript
/**
 * @fileoverview Consultant Routes
 * @module servers/customer-services/modules/consultants/routes/consultant-routes
 */

const express = require('express');
const router = express.Router();
const consultantController = require('../controllers/consultant-controller');
const { authenticate } = require('../../../middleware/auth-middleware');

/**
 * All consultant routes require authentication
 * Base path: /api/v1/consultants
 */

/**
 * POST /api/v1/consultants
 * Create a new consultant
 * 
 * Request body:
 * {
 *   "firstName": "John",
 *   "lastName": "Doe",
 *   "email": "john.doe@example.com",
 *   "expertise": ["Strategy", "Operations"],
 *   "yearsOfExperience": 10
 * }
 */
router.post(
    '/',
    authenticate,
    consultantController.createConsultant.bind(consultantController)
);

/**
 * GET /api/v1/consultants
 * List all consultants with pagination
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort field (default: -createdAt)
 */
router.get(
    '/',
    authenticate,
    consultantController.listConsultants.bind(consultantController)
);

/**
 * GET /api/v1/consultants/:id
 * Get consultant by ID
 */
router.get(
    '/:id',
    authenticate,
    consultantController.getConsultant.bind(consultantController)
);

/**
 * PUT /api/v1/consultants/:id
 * Update consultant
 * 
 * Request body: Partial consultant object
 */
router.put(
    '/:id',
    authenticate,
    consultantController.updateConsultant.bind(consultantController)
);

/**
 * DELETE /api/v1/consultants/:id
 * Delete consultant (soft delete)
 */
router.delete(
    '/:id',
    authenticate,
    consultantController.deleteConsultant.bind(consultantController)
);

module.exports = router;
```

### Creating a Model

Models define the data structure and validation rules for database documents.

```javascript
/**
 * @fileoverview Consultant Model
 * @module shared/lib/database/models/customer-services/consultants/consultant-model
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const consultantSchema = new Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    phoneNumber: {
        type: String,
        trim: true
    },
    expertise: [{
        type: String,
        trim: true
    }],
    yearsOfExperience: {
        type: Number,
        min: 0
    },
    certifications: [{
        name: String,
        issuedBy: String,
        issuedDate: Date,
        expiryDate: Date
    }],
    tenantId: {
        type: String,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: Date
}, {
    timestamps: true,
    collection: 'consultants'
});

// Compound indexes
consultantSchema.index({ tenantId: 1, email: 1 }, { unique: true });
consultantSchema.index({ tenantId: 1, status: 1 });

// Methods
consultantSchema.methods.toSafeJSON = function() {
    const obj = this.toObject();
    delete obj.__v;
    delete obj.isDeleted;
    return obj;
};

module.exports = {
    schema: consultantSchema,
    modelName: 'Consultant',
    
    createModel: function(connection) {
        return connection.model(this.modelName, this.schema);
    }
};
```

---

## API Reference

### Database Service Methods

#### getDatabaseService()

Returns the general-purpose database service instance for accessing any model or database.

**Returns:** DatabaseService instance

**Example:**
```javascript
const dbService = database.getDatabaseService();
```

#### getUserDatabaseService()

Returns the specialized user database service with built-in tenant isolation and user-specific operations.

**Returns:** UserDatabaseService instance

**Example:**
```javascript
const userDbService = database.getUserDatabaseService();
```

#### getModel(modelName, databaseName)

Retrieves a model from the specified database with automatic model discovery and caching.

**Parameters:**
- modelName (String): Name of the model (e.g., 'User', 'TokenBlacklist')
- databaseName (String): Database name ('customer', 'admin', or 'shared')

**Returns:** Mongoose Model instance

**Example:**
```javascript
const TokenBlacklist = dbService.getModel('TokenBlacklist', 'shared');
```

#### getConnection(databaseName)

Returns the raw Mongoose connection for a specific database.

**Parameters:**
- databaseName (String): Database name

**Returns:** Mongoose Connection instance

**Example:**
```javascript
const customerDb = dbService.getConnection('customer');
```

### Authentication Service Methods

#### isTokenBlacklisted(token)

Checks if a token has been blacklisted through logout or other revocation.

**Parameters:**
- token (String): JWT access token to check

**Returns:** Promise<Boolean>

**Example:**
```javascript
const isBlacklisted = await authService.isTokenBlacklisted(token);
```

#### logoutUser(userId, token, options)

Logs out a user by adding their token to the blacklist.

**Parameters:**
- userId (String): User ID
- token (String): Access token to blacklist
- options (Object): Additional context (ip, userAgent, etc.)

**Returns:** Promise<void>

**Example:**
```javascript
await authService.logoutUser(userId, accessToken, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
});
```

---

## Best Practices

### Service Development

Services should maintain a single responsibility focused on one entity or domain area. Always use the database service layer rather than accessing models directly to ensure proper connection management and error handling. Implement comprehensive error handling with appropriate HTTP status codes and meaningful error messages. Use structured logging with context to facilitate debugging and monitoring.

### Security

Never expose sensitive data in API responses by sanitizing all output through dedicated methods. Always implement tenant isolation to prevent cross-tenant data access. Hash sensitive tokens before storing them in the database. Validate and sanitize all user input before processing. Use environment variables for sensitive configuration rather than hardcoding values.

### Performance

Implement pagination for list endpoints to prevent excessive data transfer. Use appropriate database indexes for frequently queried fields. Cache frequently accessed data when appropriate using the built-in model caching. Avoid N+1 query problems by using proper population and aggregation. Monitor slow queries and optimize as necessary.

### Error Handling

Use the AppError class for consistent error responses throughout the application. Provide specific error messages that help debugging without exposing system internals. Log errors with full context including request details and stack traces. Handle async errors properly with try-catch blocks and pass errors to Express error handlers.

---

## Troubleshooting

### Token Still Valid After Logout

If tokens remain valid after logout, verify the authentication middleware is checking the blacklist by examining server logs for blacklist check messages. Ensure the TokenBlacklist model is properly registered in the shared database. Confirm the token hash is being calculated correctly using SHA-256. Check MongoDB TTL indexes are properly configured with the expiresAt field.

### Database Connection Issues

When experiencing connection problems, verify environment variables are correctly set for database URIs. Check network connectivity to MongoDB servers, particularly for Atlas deployments. Review MongoDB Atlas IP whitelist settings if using cloud hosting. Examine connection pool configuration for the current environment. Monitor database logs for authentication or authorization errors.

### Model Not Found Errors

If the system cannot locate models, confirm the model file follows naming conventions with .model.js or -model.js extensions. Verify the model is in the correct directory structure under the models folder. Check the model exports the schema and modelName properties correctly. Clear the model cache and restart the server to force model rediscovery.

### Performance Issues

Address performance problems by examining slow query logs to identify optimization opportunities. Review database indexes to ensure they match common query patterns. Check connection pool settings align with application load requirements. Monitor memory usage for potential leaks in long-running processes. Use database profiling tools to identify bottlenecks.

---

## Conclusion

This documentation provides comprehensive guidance for working with the InsightSerenity platform database and authentication systems. The architecture supports secure, scalable application development with production-ready token management and flexible database access patterns. Following these patterns and best practices ensures consistent, maintainable code across the platform while maintaining security and performance standards.

For additional support or questions about implementation details, consult the inline code documentation or contact the platform development team.