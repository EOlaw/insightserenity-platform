# Client Management System - Technical Documentation

## Executive Summary

This document provides comprehensive technical documentation for the Client Management System, a core component of the InsightSerenity Platform. The system manages the complete lifecycle of client relationships, from initial contact through active engagement, including associated contacts, documents, and activity notes. Built on a modern microservices architecture with MongoDB Atlas for data persistence, the system implements enterprise-grade features including multi-tenancy, role-based access control, transaction management, and comprehensive audit logging.

**Version:** 1.0.0  
**Platform:** InsightSerenity Customer Services  
**Last Updated:** October 13, 2025  
**Status:** Production Ready

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Module Structure](#module-structure)
3. [Data Models](#data-models)
4. [Service Layer](#service-layer)
5. [Controller Layer](#controller-layer)
6. [Routing Layer](#routing-layer)
7. [Business Logic](#business-logic)
8. [Transaction Management](#transaction-management)
9. [Security Implementation](#security-implementation)
10. [Integration Patterns](#integration-patterns)
11. [Extension Points](#extension-points)
12. [Code Examples](#code-examples)

---

## 1. System Architecture

### 1.1 Architectural Pattern

The Client Management System follows a layered architecture pattern with clear separation of concerns:

**Presentation Layer** (Controllers) handles HTTP requests and responses, input validation, and error formatting. Controllers delegate business logic to the service layer and transform data for API consumers.

**Business Logic Layer** (Services) implements core business rules, data validation, and orchestrates database operations. Services are stateless and reusable across different contexts.

**Data Access Layer** (Models) defines database schemas, implements data validation rules, and provides query methods. Models use Mongoose ODM for MongoDB interaction.

**Infrastructure Layer** (Database Connection, Transaction Service) manages database connectivity, connection pooling, transaction handling, and system-level concerns.

### 1.2 Component Interaction

```
HTTP Request Flow:
Client Request
    ↓
Express Middleware Stack
    ├─ Authentication (JWT verification)
    ├─ Rate Limiting
    ├─ Request Validation
    ├─ Permission Checking
    └─ Request Parsing
    ↓
Route Handler
    ↓
Controller Method
    ├─ Input Validation
    ├─ Context Extraction (user, tenant)
    └─ Service Invocation
    ↓
Service Method
    ├─ Business Logic Validation
    ├─ Data Transformation
    ├─ Model Interaction
    └─ Transaction Management
    ↓
Database Layer
    ├─ Query Execution
    ├─ Index Utilization
    └─ Data Persistence
    ↓
Response Flow (reverse path)
```

### 1.3 Multi-Tenancy Architecture

The system implements database-level multi-tenancy with complete data isolation. Every query automatically includes tenant context, preventing cross-tenant data access. The tenant identifier is extracted from the authenticated user's JWT token and propagated through all system layers.

The architecture supports white-label deployment where each tenant can have custom branding, configuration, and business rules. Tenant configuration is stored in the shared database and loaded during request processing.

### 1.4 Module Location

The Client Management Module is located at:
```
servers/customer-services/modules/core-business/client-management/
```

This location places it within the customer services server, under the core business modules category, indicating its fundamental role in the platform's business operations.

---

## 2. Module Structure

### 2.1 Directory Organization

```
client-management/
├── controllers/
│   ├── client-controller.js           # Client HTTP handlers
│   ├── client-contact-controller.js   # Contact HTTP handlers
│   ├── client-document-controller.js  # Document HTTP handlers
│   ├── client-note-controller.js      # Note HTTP handlers
│   └── index.js                       # Controller exports
├── services/
│   ├── client-service.js              # Client business logic
│   ├── client-contact-service.js      # Contact business logic
│   ├── client-document-service.js     # Document business logic
│   ├── client-note-service.js         # Note business logic
│   └── index.js                       # Service exports
├── routes/
│   ├── client-routes.js               # Client API routes
│   ├── client-contact-routes.js       # Contact API routes
│   ├── client-document-routes.js      # Document API routes
│   ├── client-note-routes.js          # Note API routes
│   └── index.js                       # Route aggregation
├── strategies/
│   └── client-registration-strategy.js # Registration strategy
├── module-config.js                   # Module configuration
└── README.md                          # Integration guide
```

### 2.2 Design Patterns

**Repository Pattern:** Services act as repositories, abstracting database operations from business logic. This allows easy swapping of data stores without affecting business code.

**Strategy Pattern:** The registration strategy implements the strategy pattern, allowing different user types to have different registration flows while maintaining a unified interface.

**Singleton Pattern:** Service instances are created as singletons to prevent multiple instantiations and ensure consistent state management.

**Factory Pattern:** The connection manager uses the factory pattern to create and manage database connections based on configuration.

**Middleware Chain:** Express middleware provides a flexible chain-of-responsibility pattern for request processing.

---

## 3. Data Models

### 3.1 Client Model

**Location:** `shared/lib/database/models/customer-services/core-business/client-management/client-model.js`

The Client model represents business organizations that engage with the platform. It includes comprehensive business information, relationship tracking, billing details, and analytics.

**Core Fields:**

- **clientCode** (String, unique, immutable): Auto-generated unique identifier in format "CLI-XXXXX". Provides human-readable reference that can be used in external communications.

- **companyName** (String, required): Primary company name used for identification and search. Indexed for fast lookups.

- **legalName** (String): Official registered business name for legal documents and contracts. May differ from trading name.

- **tradingName** (String): Brand name or DBA (Doing Business As) name used in customer-facing contexts.

**Multi-Tenancy Fields:**

- **tenantId** (ObjectId, required, immutable): References the tenant owning this client record. All queries automatically filter by tenant ID to ensure data isolation.

- **organizationId** (ObjectId, required): References the organization within the tenant. Supports organizational hierarchies within a single tenant.

- **parentClientId** (ObjectId): References parent client for subsidiary relationships. Enables corporate structure modeling.

**Business Details:**

The businessDetails object contains comprehensive company information including registration number, tax identification, entity type (Corporation, LLC, Partnership, etc.), fiscal year end, employee count, founding date, and annual revenue metrics. Tax IDs are encrypted at rest using field-level encryption.

**Contact Information:**

The contacts object stores primary contact details including name, email, phone, and preferred contact method. Additional arrays support technical contacts, executive contacts, and stakeholder relationships. Each contact entry includes engagement scoring and last contact timestamp.

**Address Information:**

The addresses object supports headquarters, billing, shipping, and additional locations. Each address includes geocoding data for mapping and proximity searches. The billing address can reference headquarters to avoid duplication.

**Billing Information:**

Comprehensive billing tracking includes currency, payment terms, tax exempt status, outstanding balance, total lifetime revenue, payment methods, and billing history. Payment history is maintained for audit and analytics purposes.

**Relationship Tracking:**

The relationship object tracks client status (prospect, lead, active, inactive, at-risk, churned), tier classification (small business, mid-market, enterprise, strategic), account manager assignment, acquisition details, and churn risk factors. This information drives customer success workflows.

**Communication Preferences:**

Stores language preference, do-not-contact flags, communication restrictions, and preferred channels. Ensures compliance with client communication preferences.

**Analytics:**

Comprehensive lifetime value metrics including total revenue, projects, engagements, invoices, and payments. Current period metrics track active projects and recent activity. Engagement metrics include portal logins, API usage, and support tickets. Performance metrics track customer satisfaction scores and escalations.

**Lifecycle Management:**

Tracks current stage (prospect, qualified, customer, advocate), stage history with timestamps, and important milestone dates including first contact, qualification, first purchase, renewals, and churn date.

**Search Optimization:**

The searchTokens array stores tokenized versions of searchable fields for efficient full-text search. Tokens are automatically updated on save.

**Audit Fields:**

Comprehensive audit log tracks all modifications with timestamp, user, action type, IP address, and changed fields. Supports compliance and forensic analysis.

### 3.2 ClientContact Model

**Location:** `shared/lib/database/models/customer-services/core-business/client-management/client-contact-model.js`

Represents individual contacts within client organizations. Supports detailed personal information, professional details, engagement tracking, and relationship mapping.

**Core Fields:**

- **contactId** (String, unique, immutable): Auto-generated identifier in format "CONT-XXXXXXXX". Provides stable reference across system.

- **clientId** (ObjectId, required): References parent client. Indexed for efficient client-to-contact queries.

**Personal Information:**

Includes prefix (Mr, Ms, Dr, etc.), first name, middle name, last name, suffix, nickname, full name (computed), maiden name, preferred name, pronouns, date of birth (encrypted), nationality, and languages spoken. Personal information respects privacy regulations.

**Professional Information:**

Stores job title, department, division, direct phone, mobile phone, office phone, fax, work email, personal email, LinkedIn profile, and other social media accounts. Tracks reporting structure with manager and direct reports.

**Role Information:**

Defines primary role (decision maker, influencer, gatekeeper, end user), secondary roles, authority level, and budget authority. Used for sales and account management workflows.

**Engagement Tracking:**

Comprehensive engagement metrics including total interactions, emails sent/received, calls made/received, meetings attended, documents accessed, last contact date, and engagement score. The engagement score is calculated based on interaction frequency and recency.

**Communication Preferences:**

Stores preferred contact method, best contact time, do-not-contact flags, opt-out status, bounce status, and unsubscribe information. Ensures compliance with communication regulations.

**Relationships:**

Maps relationships with other contacts in same client, including relationship type (colleague, manager, report, peer) and strength indicator. Enables influence mapping and stakeholder analysis.

### 3.3 ClientDocument Model

**Location:** `shared/lib/database/models/customer-services/core-business/client-management/client-document-model.js`

Manages documents associated with clients including contracts, proposals, reports, and general files. Implements comprehensive document lifecycle management with versioning, security, and compliance features.

**Core Fields:**

- **documentId** (String, unique, immutable): Auto-generated identifier in format "DOC-XXXXXXXXXX".

- **clientId** (ObjectId, required): References parent client.

- **projectId** (ObjectId): Optional reference to specific project.

- **engagementId** (ObjectId): Optional reference to specific engagement.

**Document Information:**

Includes document name, display name, description, type classification (contract, proposal, invoice, report, presentation, etc.), category, tags, and custom metadata. The file object stores original filename, storage path, size, MIME type, hash, and download URL.

**Version Control:**

Maintains version history with version number, file reference, upload timestamp, uploaded by user, change description, and version status (draft, current, superseded, archived). Supports rollback to previous versions and version comparison.

**Security:**

Implements access control with visibility settings (private, organization, client, public), shared with users list, and permissions matrix (view, download, edit, delete, share). Encryption settings include encryption status, key reference, and algorithm. Digital signature support includes signature status, signed by, signature timestamp, certificate reference, and verification status.

**Compliance:**

Tracks retention policy with required period, destruction date, legal hold status, compliance tags, and audit records. Data classification includes sensitivity level, handling instructions, and classification tags.

**Processing:**

Manages document processing status including queue position, priority, job status (OCR, thumbnail generation, format conversion), and processing results. Supports automated document workflows.

**Quality Assurance:**

Implements validation checks for format, content, metadata, signature, integrity, and compliance. Maintains validation score and integrity verification using checksums.

### 3.4 ClientNote Model

**Location:** `shared/lib/database/models/customer-services/core-business/client-management/client-note-model.js`

Captures activity notes, meeting minutes, call logs, and general observations about clients. Supports rich text formatting, categorization, and collaboration features.

**Core Fields:**

- **noteId** (String, unique, immutable): Auto-generated identifier in format "NOTE-XXXXXXXX".

- **clientId** (ObjectId, required): References parent client.

**Content:**

Stores note title, body content, summary, format (plain text, markdown, HTML, rich text), language, word count, character count, and estimated reading time. Sentiment analysis provides sentiment score, category (positive, negative, neutral), confidence score, and detected keywords.

**Categorization:**

Supports type classification (meeting, call, email, task, follow-up, general), category assignment, tags, priority level, and status tracking (draft, active, completed, archived).

**Interaction Tracking:**

Records related contact, interaction type (in-person, phone, video, email), interaction date, duration, location, participants, and outcomes. Used for relationship management and activity reporting.

**Collaboration:**

Tracks author, last modified by, contributors, mentions, shared with users, comments, reactions, and view tracking. Enables team collaboration on client information.

**Task Management:**

Supports action items with task description, assigned to user, due date, completion status, priority, and reminder settings. Integrates note-taking with task management.

---

## 4. Service Layer

### 4.1 ClientService

**Location:** `servers/customer-services/modules/core-business/client-management/services/client-service.js`

The ClientService encapsulates all business logic related to client management. It provides methods for creating, retrieving, updating, and deleting clients while enforcing business rules and tenant isolation.

**Key Methods:**

**createClient(clientData, options):** Creates a new client record with automatic client code generation, validation, duplicate checking, and transaction support. Accepts client data object and options including tenantId and organizationId. Returns created client with all computed fields populated.

**getClientById(clientId, options):** Retrieves client by ID with tenant filtering, optional population of related entities, and field projection. Throws AppError.notFound if client does not exist or belongs to different tenant.

**getClientByCode(clientCode, options):** Retrieves client by unique code with same security and population options as ID-based retrieval.

**updateClient(clientId, updateData, options):** Updates client with validation of update data, prevention of immutable field changes, and transaction support. Maintains audit trail of all changes.

**deleteClient(clientId, options):** Soft deletes client by default, setting isDeleted flag and deletedAt timestamp. Hard delete option available for compliance requirements. Handles cascading deletion of related records.

**searchClients(criteria, options):** Performs complex client searches with support for text search, field filtering, relationship status, tier classification, date ranges, and custom field queries. Returns paginated results with total count.

**getClientDashboard(clientId, options):** Retrieves comprehensive dashboard data including client summary, recent activity, outstanding items, upcoming renewals, and relationship health metrics.

**exportClients(criteria, options):** Exports client data in CSV, Excel, or JSON format with field selection, filtering, and formatting options.

**bulkCreateClients(clientsData, options):** Creates multiple clients in a single transaction with validation, duplicate detection, and rollback on any failure.

**Business Logic Implementation:**

The service implements several critical business rules. Client codes are automatically generated using a consistent format combining prefix, name initials, timestamp, and random characters to ensure uniqueness. Duplicate prevention checks company name and registration number against existing clients in the same tenant. Search token generation parses company names, contact names, and industry keywords into searchable tokens. Analytics calculation aggregates revenue, project counts, and engagement metrics. Health scoring evaluates client relationship health based on engagement, outstanding balance, and churn risk factors.

### 4.2 ClientContactService

Manages all operations related to client contacts with similar patterns to ClientService. Implements contact-specific business logic including engagement scoring, contact deduplication, and relationship mapping.

**Key Methods:**

**createContact(contactData, options):** Creates contact with auto-generated contact ID, email validation, phone validation, duplicate detection within client, and engagement initialization.

**getContactsByClient(clientId, options):** Retrieves all contacts for a client with optional filtering by role, department, or status. Supports pagination and sorting.

**updateContactEngagement(contactId, interactionData):** Updates contact engagement metrics based on interactions. Recalculates engagement score using recency and frequency algorithms.

**getPrimaryContact(clientId):** Retrieves the designated primary contact for a client, falling back to most engaged contact if none designated.

**searchContacts(criteria, options):** Searches contacts across multiple clients with support for name search, email search, role filtering, and engagement thresholds.

### 4.3 ClientDocumentService

Handles document lifecycle management including upload, versioning, security, and compliance.

**Key Methods:**

**uploadDocument(documentData, fileData, options):** Handles document upload with file validation, virus scanning, storage path generation, thumbnail generation, and metadata extraction. Supports chunked uploads for large files.

**createDocumentVersion(documentId, versionData, fileData, options):** Creates new document version while maintaining version history. Previous version is marked as superseded.

**shareDocument(documentId, shareData, options):** Shares document with specified users or makes public. Implements permission-based access control and notification to recipients.

**downloadDocument(documentId, options):** Generates secure download URL with expiration and access logging. Supports range requests for partial downloads.

**applyRetentionPolicy(documentId, policyData, options):** Applies retention policy including retention period, destruction date, and legal hold flags. Implements automated policy enforcement.

**validateDocument(documentId, options):** Performs document validation checks including format validation, content scanning, signature verification, and compliance checking.

### 4.4 ClientNoteService

Manages note creation, collaboration, and task integration.

**Key Methods:**

**createNote(noteData, options):** Creates note with auto-generated note ID, sentiment analysis, word counting, and participant notification.

**addComment(noteId, commentData, options):** Adds comment to note with mention detection and notification to mentioned users.

**createTaskFromNote(noteId, taskData, options):** Extracts action items from note and creates tasks with assignment and due dates.

**searchNotes(criteria, options):** Searches notes using full-text search, tag filtering, date ranges, and sentiment filtering.

---

## 5. Controller Layer

### 5.1 ClientController

**Location:** `servers/customer-services/modules/core-business/client-management/controllers/client-controller.js`

Controllers handle HTTP request/response cycles, extracting request data, validating inputs, invoking services, and formatting responses.

**Standard Controller Pattern:**

```javascript
async methodName(req, res, next) {
    try {
        // Extract data from request
        const data = req.body;
        const { id } = req.params;
        const options = {
            tenantId: req.user?.tenantId,
            userId: req.user?.id
        };

        // Log request
        logger.info('Operation started', { data, options });

        // Invoke service
        const result = await Service.method(data, options);

        // Format response
        res.status(200).json({
            success: true,
            message: 'Operation completed successfully',
            data: { result }
        });

    } catch (error) {
        // Log error
        logger.error('Operation failed', { error: error.message });
        
        // Pass to error handler
        next(error);
    }
}
```

**Key Responsibilities:**

Controllers extract user context from JWT token attached by authentication middleware. This includes user ID, tenant ID, organization ID, and permissions. Context is passed to services for authorization and tenant filtering.

Input validation ensures all required fields are present and properly formatted before service invocation. Validation errors are returned with 400 status code and detailed error messages.

Error handling wraps all operations in try-catch blocks. Errors are logged with context and passed to Express error handling middleware for consistent error response formatting.

Response formatting ensures consistent API response structure across all endpoints with success flag, message, data payload, and optional metadata.

### 5.2 Common Controller Methods

**createClient:** Handles POST /clients with request body validation, duplicate checking, service invocation, and 201 response on success.

**getClientById:** Handles GET /clients/:id with parameter extraction, service invocation, and 200 response with client data.

**updateClient:** Handles PUT/PATCH /clients/:id with partial update support, optimistic locking for concurrent updates, and change notification.

**deleteClient:** Handles DELETE /clients/:id with confirmation requirement, cascade handling, and 204 response on success.

**searchClients:** Handles GET/POST /clients/search with query parameter or body-based criteria, pagination support, and result transformation.

**getStatistics:** Handles GET /clients/statistics with aggregation of client metrics, tenant filtering, and caching for performance.

---

## 6. Routing Layer

### 6.1 Route Definition

**Location:** `servers/customer-services/modules/core-business/client-management/routes/client-routes.js`

Routes define API endpoints and apply middleware chains for authentication, authorization, validation, and rate limiting.

**Standard Route Pattern:**

```javascript
router.method(
    '/path/:param',
    authenticate,                              // JWT verification
    checkPermission('resource:action'),        // Permission check
    rateLimiter({ maxRequests: 100, windowMs: 60000 }), // Rate limit
    validateRequest(validationSchema),         // Input validation
    Controller.methodName                      // Controller handler
);
```

**Middleware Application Order:**

Authentication runs first to verify JWT token and extract user context. If token is invalid or expired, request is rejected with 401 status.

Permission checking verifies user has required permission for the operation. Permission format is "resource:action" (e.g., "clients:update"). If user lacks permission, request is rejected with 403 status.

Rate limiting protects endpoints from abuse by limiting requests per time window. Limits vary by endpoint sensitivity, with higher limits for read operations and lower limits for create/update operations.

Input validation uses Joi schemas to validate request body, parameters, and query strings. Validation errors are returned with detailed field-level error messages.

### 6.2 Route Organization

Routes are organized hierarchically with main routes for each entity type and nested routes for related resources.

**Main Routes:**
- /clients - Client operations
- /contacts - Contact operations
- /documents - Document operations
- /notes - Note operations

**Nested Routes:**
- /clients/:clientId/contacts - Contacts for specific client
- /clients/:clientId/documents - Documents for specific client
- /clients/:clientId/notes - Notes for specific client

**Special Routes:**
- /clients/search - Advanced search
- /clients/statistics - Analytics
- /clients/export - Data export
- /clients/bulk - Bulk operations

### 6.3 Route Mounting

Routes are aggregated in the index file and mounted to the Express application:

```javascript
// In routes/index.js
const clientRoutes = require('./client-routes');
const contactRoutes = require('./client-contact-routes');
const documentRoutes = require('./client-document-routes');
const noteRoutes = require('./client-note-routes');

router.use('/clients', clientRoutes);
router.use('/contacts', contactRoutes);
router.use('/documents', documentRoutes);
router.use('/notes', noteRoutes);

module.exports = router;
```

---

## 7. Business Logic

### 7.1 Client Code Generation

Client codes follow the format "CLI-{initials}{timestamp}{random}" where initials are derived from company name, timestamp provides temporal ordering, and random characters ensure uniqueness even for simultaneous registrations.

**Algorithm:**

```javascript
function generateClientCode(companyName, tenantId) {
    // Extract initials (first letters of first two words)
    const words = companyName.trim().split(/\s+/);
    const initials = words.slice(0, 2)
        .map(w => w.charAt(0).toUpperCase())
        .join('');
    
    // Generate timestamp component (last 6 digits of timestamp)
    const timestamp = Date.now().toString().slice(-6);
    
    // Generate random component (3 uppercase letters)
    const random = generateRandomString(3);
    
    // Combine components
    const code = `CLI-${initials}${timestamp}${random}`;
    
    // Verify uniqueness within tenant
    const exists = await Client.exists({ tenantId, clientCode: code });
    if (exists) {
        // Recursive call with new random component
        return generateClientCode(companyName, tenantId);
    }
    
    return code;
}
```

### 7.2 Search Token Generation

Search tokens enable efficient full-text search without database text indexes. Tokens are generated during save operations and stored in the searchTokens array.

**Token Generation Process:**

Company name is split on whitespace and punctuation, converted to lowercase, and added to token set. Legal name and trading name undergo same process. Contact names from primary and technical contacts are tokenized. Industry keywords and custom tags are included. Client code is added in lowercase. The resulting set eliminates duplicates and provides comprehensive search coverage.

### 7.3 Relationship Health Scoring

Client relationship health is scored on a scale of 0-100 based on multiple factors:

**Engagement Score (30% weight):** Recent portal logins, API usage, document access, and communication frequency contribute to engagement score. Recency is weighted more heavily than frequency.

**Financial Health (25% weight):** Payment history, outstanding balance, and revenue trend indicate financial health. On-time payments and growing revenue increase score.

**Project Activity (20% weight):** Active projects, recent project completions, and project success rate contribute to activity score.

**Communication Quality (15% weight):** Response time to communications, meeting attendance, and NPS scores indicate relationship quality.

**Risk Factors (10% weight):** Negative factors including payment delays, support escalations, contract disputes, and decreased engagement reduce score.

The composite score is calculated using weighted average and normalized to 0-100 range. Scores below 40 trigger at-risk workflows, scores 40-70 indicate stable relationships, and scores above 70 indicate strong relationships.

### 7.4 Engagement Scoring for Contacts

Contact engagement is scored based on interaction frequency and recency using a decay function:

**Score Calculation:**

```javascript
function calculateEngagementScore(contact) {
    let score = 0;
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    // Score recent interactions with decay
    contact.interactions.forEach(interaction => {
        const daysAgo = (now - interaction.date) / dayInMs;
        const decay = Math.exp(-daysAgo / 30); // 30-day half-life
        const weight = getInteractionWeight(interaction.type);
        score += weight * decay;
    });
    
    // Normalize to 0-100 scale
    return Math.min(100, Math.round(score * 10));
}

function getInteractionWeight(type) {
    const weights = {
        'in-person': 10,
        'video': 8,
        'phone': 6,
        'email': 4,
        'chat': 2
    };
    return weights[type] || 1;
}
```

---

## 8. Transaction Management

### 8.1 Universal Transaction Service Integration

The Client Management System integrates with the Universal Transaction Service for atomic multi-entity operations. This is particularly important during client registration where both User and Client documents must be created atomically.

**Transaction Configuration:**

```javascript
const transactionConfig = {
    primaryEntity: {
        type: 'User',
        databaseName: 'customer',
        data: userData
    },
    relatedEntities: [{
        type: 'Client',
        prepareUsing: async (user) => {
            return await ClientRegistrationStrategy.prepare(clientData, user, options);
        },
        linkingStrategy: {
            primaryField: 'clientId',
            relatedField: 'userId'
        }
    }]
};

const result = await UniversalTransactionService.executeTransaction(transactionConfig);
```

### 8.2 Transaction Metadata

All documents created within transactions include metadata tracking transaction participation:

```javascript
_transactionMetadata: {
    transactionId: 'txn_unique_identifier',
    createdAt: Date,
    createdBy: 'user_id or system',
    role: 'primary' or 'related',
    relatedTo: {
        type: 'EntityType',
        id: 'entity_id'
    }
}
```

This metadata enables transaction integrity verification, audit trails, and debugging of distributed operations.

### 8.3 Registration Strategy Pattern

The ClientRegistrationStrategy implements the prepare method for the transaction service:

**Location:** `servers/customer-services/modules/core-business/client-management/strategies/client-registration-strategy.js`

**Key Method:**

```javascript
async prepare(clientData, user, options = {}) {
    // Generate unique client code
    const clientCode = await generateClientCode(
        clientData.companyName || `${user.profile.firstName} ${user.profile.lastName}'s Company`,
        options.tenantId
    );
    
    // Prepare client document
    const preparedClient = {
        clientCode,
        companyName: clientData.companyName || `${user.profile.firstName} ${user.profile.lastName}'s Company`,
        legalName: clientData.companyName || `${user.profile.firstName} ${user.profile.lastName}'s Company`,
        userId: user._id,
        tenantId: options.tenantId || user.tenantId,
        organizationId: options.organizationId || user.defaultOrganizationId,
        contacts: {
            primary: {
                name: `${user.profile.firstName} ${user.profile.lastName}`,
                email: user.email,
                phone: user.phoneNumber,
                preferredContactMethod: 'email'
            }
        },
        addresses: {
            headquarters: {
                country: 'United States',
                timezone: 'America/New_York'
            },
            billing: {
                sameAsHeadquarters: true
            }
        },
        businessDetails: {
            entityType: 'other',
            annualRevenue: {
                currency: 'USD'
            }
        },
        relationship: {
            status: 'prospect',
            tier: 'small_business',
            acquisitionDate: new Date(),
            acquisitionSource: 'inbound'
        },
        billing: {
            currency: 'USD',
            paymentTerms: 'net30',
            taxExempt: false,
            outstandingBalance: 0,
            totalRevenue: 0
        },
        metadata: {
            source: 'api',
            tags: ['user-registration', user.metadata?.source || 'web_client']
        }
    };
    
    // Generate search tokens
    preparedClient.searchTokens = generateSearchTokens(preparedClient);
    
    return preparedClient;
}
```

---

## 9. Security Implementation

### 9.1 Authentication Flow

The system uses JWT-based authentication with access and refresh tokens. Access tokens are short-lived (24 hours) and contain user identity and permissions. Refresh tokens are long-lived (30 days) and used to obtain new access tokens.

**Authentication Middleware:**

```javascript
async function authenticate(req, res, next) {
    try {
        // Extract token from header
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            throw AppError.unauthorized('No authentication token provided');
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check token blacklist
        const isBlacklisted = await TokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
            throw AppError.unauthorized('Token has been revoked');
        }
        
        // Load user context
        const user = await UserService.getUserById(decoded.userId);
        if (!user) {
            throw AppError.unauthorized('User not found');
        }
        
        // Attach to request
        req.user = user;
        req.token = token;
        
        next();
    } catch (error) {
        next(error);
    }
}
```

### 9.2 Permission System

The permission system implements role-based access control with granular permissions. Permissions follow the format "resource:action" where resource is the entity type and action is the operation.

**Permission Checking Middleware:**

```javascript
function checkPermission(requiredPermission) {
    return async (req, res, next) => {
        try {
            const user = req.user;
            
            // Check user permissions array
            if (user.permissions.includes(requiredPermission)) {
                return next();
            }
            
            // Check organization-level permissions
            const org = user.organizations.find(o => 
                o.organizationId.toString() === req.params.organizationId
            );
            
            if (org) {
                const hasOrgPermission = org.permissions.some(p => 
                    p.resource === resourceFromPermission(requiredPermission) &&
                    p.actions.includes(actionFromPermission(requiredPermission))
                );
                
                if (hasOrgPermission) {
                    return next();
                }
            }
            
            throw AppError.forbidden('Insufficient permissions');
        } catch (error) {
            next(error);
        }
    };
}
```

### 9.3 Data Encryption

Sensitive fields are encrypted at rest using AES-256 encryption. The EncryptionService provides encrypt and decrypt methods using application-level keys.

**Encryption Implementation:**

```javascript
// In model pre-save hook
clientSchema.pre('save', async function(next) {
    if (this.isModified('businessDetails.taxId') && this.businessDetails.taxId) {
        this.businessDetails.taxId = await EncryptionService.encrypt(
            this.businessDetails.taxId
        );
    }
    next();
});

// In service retrieval
async function getClient(clientId, options) {
    const client = await Client.findById(clientId);
    
    if (client.businessDetails.taxId) {
        client.businessDetails.taxId = await EncryptionService.decrypt(
            client.businessDetails.taxId
        );
    }
    
    return client;
}
```

### 9.4 Audit Logging

All operations are logged to the audit trail with timestamp, user, action, IP address, and changed fields.

**Audit Trail Implementation:**

```javascript
clientSchema.post('save', async function(doc) {
    await AuditLog.create({
        tenantId: doc.tenantId,
        entityType: 'Client',
        entityId: doc._id,
        action: doc.isNew ? 'create' : 'update',
        performedBy: doc.updatedBy,
        performedAt: new Date(),
        changes: doc.isNew ? null : doc.getChanges(),
        ipAddress: doc.requestIpAddress,
        userAgent: doc.requestUserAgent
    });
});
```

---

## 10. Integration Patterns

### 10.1 Service-to-Service Communication

Services communicate through direct method calls within the same application instance. For cross-service communication in distributed deployments, implement message queues or API gateways.

### 10.2 Event-Driven Architecture

The system can emit events for significant operations to enable loose coupling and extensibility:

```javascript
// In service after operation
EventEmitter.emit('client.created', {
    clientId: client._id,
    tenantId: client.tenantId,
    timestamp: new Date()
});

// In consumer
EventEmitter.on('client.created', async (event) => {
    await NotificationService.sendWelcomeEmail(event.clientId);
    await AnalyticsService.trackClientCreation(event);
});
```

### 10.3 Webhook Integration

The system supports outbound webhooks for external system integration:

```javascript
async function triggerWebhook(eventType, payload) {
    const webhooks = await Webhook.find({
        tenantId: payload.tenantId,
        events: eventType,
        active: true
    });
    
    for (const webhook of webhooks) {
        await axios.post(webhook.url, {
            event: eventType,
            timestamp: new Date(),
            data: payload
        }, {
            headers: {
                'X-Webhook-Signature': generateSignature(payload, webhook.secret)
            }
        });
    }
}
```

---

## 11. Extension Points

### 11.1 Custom Field Support

The customFields map in models allows tenants to add custom data without schema changes:

```javascript
// Adding custom field
client.customFields.set('customField', 'value');
await client.save();

// Querying custom field
const clients = await Client.find({
    'customFields.customField': 'value'
});
```

### 11.2 Plugin Architecture

Services support middleware plugins for cross-cutting concerns:

```javascript
ClientService.use({
    beforeCreate: async (clientData) => {
        // Execute before client creation
        await validateWithExternalSystem(clientData);
        return clientData;
    },
    afterCreate: async (client) => {
        // Execute after client creation
        await syncToExternalCRM(client);
    }
});
```

### 11.3 Strategy Pattern for User Types

Different user types can implement custom registration strategies:

```javascript
// Register strategy for new user type
EntityStrategyRegistry.register('consultant', {
    strategy: ConsultantRegistrationStrategy,
    entityType: 'Consultant'
});

// Strategy is automatically used during registration
const result = await DirectAuthService.registerDirectUser({
    userType: 'consultant',
    ...userData
});
```

---

## 12. Code Examples

### 12.1 Complete Client Creation Flow

```javascript
// In client application
const response = await fetch('http://localhost:3001/api/v1/clients', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
        companyName: 'Acme Corporation',
        businessDetails: {
            registrationNumber: 'REG-123456',
            entityType: 'corporation',
            annualRevenue: {
                amount: 5000000,
                currency: 'USD'
            }
        },
        contacts: {
            primary: {
                name: 'John Smith',
                email: 'john.smith@acme.com',
                phone: '+1234567890',
                preferredContactMethod: 'email'
            }
        },
        addresses: {
            headquarters: {
                street1: '123 Main St',
                city: 'New York',
                state: 'NY',
                postalCode: '10001',
                country: 'United States'
            }
        }
    })
});

const result = await response.json();
// Returns created client with generated clientCode
```

### 12.2 Client Search with Advanced Filters

```javascript
const response = await fetch('http://localhost:3001/api/v1/clients/search', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
        query: 'technology',
        filters: {
            'relationship.status': 'active',
            'relationship.tier': ['enterprise', 'strategic'],
            'billing.outstandingBalance': { $gt: 0 },
            createdAt: {
                $gte: '2024-01-01',
                $lte: '2024-12-31'
            }
        },
        sort: { 'analytics.lifetime.totalRevenue': -1 },
        page: 1,
        limit: 20
    })
});

const result = await response.json();
// Returns paginated list of matching clients
```

### 12.3 Creating Contact with Engagement Tracking

```javascript
const response = await fetch('http://localhost:3001/api/v1/contacts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
        clientId: '507f1f77bcf86cd799439011',
        personalInfo: {
            firstName: 'Jane',
            lastName: 'Doe',
            jobTitle: 'Chief Technology Officer'
        },
        professionalInfo: {
            workEmail: 'jane.doe@client.com',
            directPhone: '+1234567890',
            department: 'Technology'
        },
        role: {
            primaryRole: 'decision_maker',
            authorityLevel: 'executive'
        },
        communicationPreferences: {
            preferredMethod: 'email',
            bestTimeToContact: 'morning'
        }
    })
});

const result = await response.json();
// Returns created contact with auto-generated contactId
```

---

## Conclusion

The Client Management System provides a comprehensive, enterprise-ready solution for managing client relationships with robust security, scalability, and extensibility. The layered architecture with clear separation of concerns enables maintainability and testability while the transaction support ensures data integrity. The system's flexible design supports customization through custom fields, plugins, and strategy patterns while maintaining consistency through enforced business rules and audit logging.

For additional information, consult the API documentation, operations guide, and database architecture documentation.

---

**Document Maintenance**

This technical documentation should be updated whenever:
- New features are added to the system
- Existing functionality is significantly modified
- Business logic rules change
- Security implementations are updated
- Integration patterns are established

**Last Review:** October 13, 2025  
**Next Review:** January 2026  
**Document Owner:** Platform Engineering Team