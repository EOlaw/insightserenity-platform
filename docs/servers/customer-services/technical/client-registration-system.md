# Client Registration System - Technical Documentation

## Executive Summary

This document provides comprehensive technical documentation for the Client Registration System, which enables atomic creation of both User and Client documents during the registration process. The system uses MongoDB transactions to ensure data consistency and implements a flexible entity strategy pattern for different user types.

**Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Status:** Production Ready

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Implementation Details](#implementation-details)
4. [System Components](#system-components)
5. [Usage Guide](#usage-guide)
6. [Upgrade Procedures](#upgrade-procedures)
7. [Testing and Verification](#testing-and-verification)
8. [Troubleshooting](#troubleshooting)
9. [Future Enhancements](#future-enhancements)

---

## 1. Problem Statement

### Original Issue

During user registration for client-type users, the system was only creating User documents in the database. The corresponding Client documents were not being created, resulting in incomplete user profiles and broken relationships.

### Root Cause Analysis

The Universal Transaction Service was not invoking the `prepareUsing` callback function that was responsible for preparing Client entity data using the entity strategy. The service was directly using the `data` field (which was set to `null`) instead of calling the preparation function.

**Problematic Code Pattern:**
```javascript
relatedEntities.push({
    type: entityType,
    data: null, // Will be prepared by strategy
    prepareUsing: async (user) => {
        return await entity.strategy.prepare(entity.userData, user, entity.options);
    }
});
```

The transaction service was ignoring `prepareUsing` and attempting to create entities with `null` data.

### Business Impact

This issue prevented proper client onboarding and resulted in orphaned user records without associated business entities. It affected data integrity and required manual database corrections.

---

## 2. Solution Architecture

### Design Principles

The solution implements a lazy evaluation pattern where related entity data is prepared only when needed, using the primary entity as context. This approach provides several benefits:

1. **Separation of Concerns:** Entity preparation logic remains in entity-specific strategies
2. **Data Consistency:** Primary entity is created first and used to prepare related entities
3. **Transaction Safety:** All operations occur within a single MongoDB transaction
4. **Extensibility:** New entity types can be added without modifying core transaction logic

### System Flow

```
User Registration Request
    ↓
DirectAuthService validates input
    ↓
Entity Strategy Registry provides Client strategy
    ↓
Universal Transaction Service starts transaction
    ↓
    1. Create User (Primary Entity)
    ↓
    2. Prepare Client data using prepareUsing callback
    ↓
    3. Create Client (Related Entity)
    ↓
    4. Link User ↔ Client bidirectionally
    ↓
Transaction commits atomically
    ↓
Post-registration workflows execute
```

### Transaction Guarantees

The system provides ACID guarantees through MongoDB transactions:

- **Atomicity:** Both User and Client are created or neither is created
- **Consistency:** All documents contain proper transaction metadata and links
- **Isolation:** Concurrent registrations do not interfere with each other
- **Durability:** Committed data survives system failures

---

## 3. Implementation Details

### Core Changes

#### File: `universal-transaction-service.js`

**Location:** `servers/customer-services/shared/lib/database/services/universal-transaction-service.js`

**Modified Method:** `_createRelatedEntities`

**Before:**
```javascript
async _createRelatedEntities(connection, relatedEntities, primaryEntity, session, transactionContext) {
    const results = [];
    
    for (const relatedEntityConfig of relatedEntities) {
        const { type, data, linkingStrategy } = relatedEntityConfig;
        
        const enhancedData = {
            ...data, // This was null!
            _transactionMetadata: {...}
        };
        
        // Rest of the code...
    }
}
```

**After:**
```javascript
async _createRelatedEntities(connection, relatedEntities, primaryEntity, session, transactionContext) {
    const results = [];

    for (const relatedEntityConfig of relatedEntities) {
        try {
            const { type, data, prepareUsing, linkingStrategy } = relatedEntityConfig;

            // CRITICAL FIX: Prepare entity data if prepareUsing function is provided
            let entityData = data;
            if (!entityData && prepareUsing && typeof prepareUsing === 'function') {
                entityData = await prepareUsing(primaryEntity);
                
                logger.debug('Entity data prepared using strategy', {
                    transactionId: transactionContext.id,
                    entityType: type,
                    primaryEntityId: primaryEntity._id
                });
            }

            if (!entityData) {
                throw new Error(`No data available for related entity: ${type}`);
            }

            // Enhanced data with transaction metadata
            const enhancedData = {
                ...entityData,
                _transactionMetadata: {
                    transactionId: transactionContext.id,
                    createdAt: new Date(),
                    createdBy: transactionContext.initiatedBy || 'system',
                    role: 'related',
                    relatedTo: {
                        type: primaryEntity.type || 'User',
                        id: primaryEntity._id
                    }
                }
            };

            const Model = connection.getModel(type);
            const result = await Model.create([enhancedData], { session });

            transactionContext.entities.push({
                type,
                id: result[0]._id,
                role: 'related'
            });

            results.push({
                type,
                entity: result[0],
                linkingStrategy
            });

            logger.debug('Related entity created', {
                transactionId: transactionContext.id,
                entityType: type,
                entityId: result[0]._id
            });

        } catch (error) {
            logger.error('Failed to create related entity', {
                transactionId: transactionContext.id,
                entityType: relatedEntityConfig.type,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    return results;
}
```

### Key Improvements

1. **Dynamic Data Preparation:** Calls `prepareUsing` callback when data is not provided
2. **Error Handling:** Throws clear errors when entity data is unavailable
3. **Logging Enhancement:** Logs each step of entity preparation and creation
4. **Validation:** Checks if `prepareUsing` is a function before calling it

---

## 4. System Components

### 4.1 Universal Transaction Service

**Purpose:** Orchestrates atomic multi-entity creation with MongoDB transactions

**Key Methods:**

- `executeTransaction()`: Main entry point for transaction execution
- `_createEntity()`: Creates primary entity
- `_createRelatedEntities()`: Creates and prepares related entities (MODIFIED)
- `_linkRelatedEntities()`: Establishes bidirectional links
- `_verifyTransactionIntegrity()`: Validates post-commit data integrity

**Configuration:**
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
            return await strategy.prepare(clientData, user);
        },
        linkingStrategy: {
            primaryField: 'clientId',
            relatedField: 'userId'
        }
    }]
};
```

### 4.2 Entity Strategy Registry

**Purpose:** Manages entity-specific preparation strategies

**Location:** `servers/customer-services/lib/entity-strategy-registry.js`

**Registered Strategies:**

1. **Client Strategy**
   - Path: `modules/core-business/client-management/strategies/client-registration-strategy`
   - Handles client entity preparation with user context

2. **Consultant Strategy**
   - Path: `modules/core-business/consultant-management/strategies/consultant-registration-strategy`
   - Handles consultant entity preparation

**Future Strategies:** Candidate, Partner (currently showing warnings)

### 4.3 Direct Auth Service

**Purpose:** Manages user registration workflow

**Location:** `servers/customer-services/modules/authentication/services/direct-auth-service.js`

**Key Method:** `registerDirectUser()`

**Workflow:**
1. Validates registration data
2. Retrieves entity strategy from registry
3. Configures transaction with primary and related entities
4. Executes transaction
5. Verifies integrity
6. Triggers post-registration workflows

### 4.4 Client Registration Strategy

**Purpose:** Prepares Client entity data using User context

**Location:** `servers/customer-services/modules/core-business/client-management/strategies/client-registration-strategy.js`

**Key Method:** `prepare(clientData, user, options)`

**Functionality:**
- Generates unique client code (CLI-XXXXX format)
- Maps user data to client fields
- Sets default values for business details
- Configures initial relationship status
- Creates searchable tokens

---

## 5. Usage Guide

### 5.1 Registration API Endpoint

**Endpoint:** `POST /api/v1/auth/register`

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "YourSecurePassword123!",
  "username": "johndoe",
  "phoneNumber": "+1234567890",
  "userType": "client",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "middleName": "Michael",
    "bio": "Software engineer with a passion for building scalable systems"
  },
  "companyName": "John Doe's Company"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "68ed6ca5212843ed4b5d47f0",
    "clientId": "68ed6ca5212843ed4b5d4801",
    "email": "john.doe@example.com",
    "userType": "client",
    "accountStatus": "pending"
  },
  "meta": {
    "transactionId": "txn_1760390309260_91453557c4b41770"
  }
}
```

### 5.2 Created Documents

#### User Document Structure

**Collection:** `users` (customer database)

**Key Fields:**
- `_id`: User identifier
- `email`: User email address
- `username`: Unique username
- `password`: Bcrypt hashed password
- `clientId`: Reference to Client document
- `organizations`: Organization memberships with roles and permissions
- `accountStatus`: Account verification status
- `verification`: Email/phone verification state
- `_transactionMetadata`: Transaction tracking information

#### Client Document Structure

**Collection:** `clients` (customer database)

**Key Fields:**
- `_id`: Client identifier
- `clientCode`: Unique client code (CLI-XXXXX)
- `companyName`: Company name
- `userId`: Reference to User document
- `tenantId`: Tenant identifier
- `organizationId`: Organization identifier
- `businessDetails`: Company information
- `contacts.primary`: Primary contact information
- `relationship.status`: Client lifecycle stage
- `_transactionMetadata`: Transaction tracking information

### 5.3 Adding New Entity Types

To add support for new user types (consultant, candidate, partner):

**Step 1: Create Entity Strategy**

Create a new strategy file following this pattern:

```javascript
// Path: modules/[module-name]/strategies/[entity]-registration-strategy.js

class [Entity]RegistrationStrategy {
    constructor(databaseConnection) {
        this.connection = databaseConnection;
    }

    async prepare(entityData, user, options = {}) {
        // Prepare entity-specific data using user context
        const prepared = {
            userId: user._id,
            email: user.email,
            // Entity-specific fields
            ...entityData,
            tenantId: options.tenantId,
            organizationId: options.organizationId,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        return prepared;
    }

    validate(entityData) {
        // Validate entity-specific data
        return { valid: true };
    }
}

module.exports = [Entity]RegistrationStrategy;
```

**Step 2: Register Strategy**

Update entity strategy registry configuration to include the new entity type path.

**Step 3: Update Direct Auth Service**

No changes needed - the service automatically uses registered strategies.

**Step 4: Test**

Use the registration endpoint with the new userType value.

---

## 6. Upgrade Procedures

### 6.1 Applying This Fix to Existing Systems

If upgrading an existing system with the old code:

**Step 1: Backup Database**
```bash
mongodump --uri="mongodb+srv://[credentials]" --out=/backup/pre-upgrade
```

**Step 2: Update Code**

Replace the `_createRelatedEntities` method in `universal-transaction-service.js` with the fixed version.

**Step 3: Restart Services**
```bash
npm run start:dev
# or for production
pm2 restart customer-services
```

**Step 4: Verify Fix**

Run test registration and verify both documents are created:

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "username": "testuser",
    "userType": "client",
    "profile": {
      "firstName": "Test",
      "lastName": "User"
    },
    "companyName": "Test Company"
  }'
```

**Step 5: Database Verification**

Check MongoDB for both documents:

```javascript
// Connect to MongoDB
use insightserenity_customer_dev

// Find the user
db.users.findOne({ email: "test@example.com" })

// Find the linked client using clientId from user document
db.clients.findOne({ _id: ObjectId("[clientId from user]") })

// Verify bidirectional linking
// User should have clientId field
// Client should have userId field
```

### 6.2 Data Migration for Existing Users

For users created before this fix was applied (orphaned User documents without Client documents):

**Migration Script:**

```javascript
// migration-create-missing-clients.js
const { ConnectionManager } = require('./shared/lib/database/connection-manager');
const ClientRegistrationStrategy = require('./modules/core-business/client-management/strategies/client-registration-strategy');

async function migrateOrphanedUsers() {
    const connection = await ConnectionManager.getInstance();
    const User = connection.getModel('User');
    const Client = connection.getModel('Client');
    const strategy = new ClientRegistrationStrategy(connection);
    
    // Find users without clientId
    const orphanedUsers = await User.find({
        userType: 'client',
        clientId: { $exists: false }
    });
    
    console.log(`Found ${orphanedUsers.length} orphaned users`);
    
    for (const user of orphanedUsers) {
        try {
            // Prepare client data
            const clientData = await strategy.prepare({
                companyName: user.profile?.companyName || `${user.profile.firstName} ${user.profile.lastName}'s Company`
            }, user, {
                tenantId: user.tenantId || 'default',
                organizationId: user.defaultOrganizationId
            });
            
            // Create client
            const client = await Client.create(clientData);
            
            // Link to user
            user.clientId = client._id;
            await user.save();
            
            // Link to client
            client.userId = user._id;
            await client.save();
            
            console.log(`Migrated user ${user.email} -> Client ${client.clientCode}`);
        } catch (error) {
            console.error(`Failed to migrate user ${user.email}:`, error.message);
        }
    }
    
    console.log('Migration completed');
}

// Run migration
migrateOrphanedUsers()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
```

**Running the Migration:**

```bash
node migration-create-missing-clients.js
```

### 6.3 Version Control Best Practices

**Git Commit Message Format:**

```
fix(transaction): Implement prepareUsing callback for related entities

- Modified _createRelatedEntities to invoke prepareUsing callback
- Added validation to ensure entity data is available
- Enhanced logging for entity preparation steps
- Fixes issue where Client documents were not created during registration

Closes #[issue-number]
```

**Tagging the Release:**

```bash
git tag -a v1.1.0 -m "Fix client document creation in transactions"
git push origin v1.1.0
```

---

## 7. Testing and Verification

### 7.1 Unit Tests

Create tests for the modified transaction service method:

```javascript
// tests/universal-transaction-service.test.js
describe('UniversalTransactionService - _createRelatedEntities', () => {
    it('should call prepareUsing when data is null', async () => {
        const mockPrepareUsing = jest.fn().mockResolvedValue({
            companyName: 'Test Company',
            userId: 'user123'
        });
        
        const relatedEntities = [{
            type: 'Client',
            data: null,
            prepareUsing: mockPrepareUsing
        }];
        
        await service._createRelatedEntities(
            connection,
            relatedEntities,
            { _id: 'user123' },
            session,
            transactionContext
        );
        
        expect(mockPrepareUsing).toHaveBeenCalledWith({ _id: 'user123' });
    });
    
    it('should throw error when no data and no prepareUsing', async () => {
        const relatedEntities = [{
            type: 'Client',
            data: null
        }];
        
        await expect(
            service._createRelatedEntities(
                connection,
                relatedEntities,
                { _id: 'user123' },
                session,
                transactionContext
            )
        ).rejects.toThrow('No data available for related entity: Client');
    });
});
```

### 7.2 Integration Tests

Test the complete registration flow:

```javascript
// tests/integration/registration.test.js
describe('Client Registration Integration', () => {
    it('should create both User and Client documents', async () => {
        const response = await request(app)
            .post('/api/v1/auth/register')
            .send({
                email: 'integration-test@example.com',
                password: 'TestPassword123!',
                username: 'integrationtest',
                userType: 'client',
                profile: {
                    firstName: 'Integration',
                    lastName: 'Test'
                },
                companyName: 'Test Company'
            });
        
        expect(response.status).toBe(201);
        expect(response.body.data.userId).toBeDefined();
        expect(response.body.data.clientId).toBeDefined();
        
        // Verify User document
        const user = await User.findById(response.body.data.userId);
        expect(user).toBeDefined();
        expect(user.clientId.toString()).toBe(response.body.data.clientId);
        
        // Verify Client document
        const client = await Client.findById(response.body.data.clientId);
        expect(client).toBeDefined();
        expect(client.userId.toString()).toBe(response.body.data.userId);
        
        // Verify transaction metadata
        expect(user._transactionMetadata).toBeDefined();
        expect(client._transactionMetadata).toBeDefined();
        expect(user._transactionMetadata.transactionId)
            .toBe(client._transactionMetadata.transactionId);
    });
});
```

### 7.3 Manual Testing Checklist

**Pre-Test Setup:**
- [ ] Development environment running on port 3001
- [ ] MongoDB connection established
- [ ] Postman or curl available for API testing

**Test Case 1: Successful Registration**
- [ ] Send registration request with valid data
- [ ] Verify 201 status code received
- [ ] Verify response contains both userId and clientId
- [ ] Check MongoDB for User document
- [ ] Check MongoDB for Client document
- [ ] Verify User.clientId matches Client._id
- [ ] Verify Client.userId matches User._id
- [ ] Verify both documents have matching transactionId

**Test Case 2: Transaction Rollback**
- [ ] Modify code to throw error after User creation
- [ ] Send registration request
- [ ] Verify neither User nor Client exists in database
- [ ] Restore code to working state

**Test Case 3: Duplicate Email**
- [ ] Register a user successfully
- [ ] Attempt to register again with same email
- [ ] Verify error response received
- [ ] Verify no duplicate documents created

**Test Case 4: Invalid User Type**
- [ ] Send registration with unsupported userType
- [ ] Verify appropriate error response
- [ ] Verify no documents created

### 7.4 Monitoring and Logging

**Key Log Messages to Monitor:**

```
✓ Success Indicators:
- "Starting direct user registration"
- "Entity data prepared using strategy"
- "Transaction committed successfully"
- "User registered successfully with universal transaction"

✗ Error Indicators:
- "Strategy not found in any expected location"
- "Transaction integrity check failed"
- "Failed to create related entity"
- "No data available for related entity"
```

**Log Locations:**

Development:
```bash
tail -f /path/to/customer-services/logs/customer-services-*.log
```

Production:
```bash
# If using PM2
pm2 logs customer-services

# If using systemd
journalctl -u customer-services -f
```

**Monitoring Queries:**

Check transaction success rate:
```javascript
db.users.aggregate([
    {
        $match: {
            "_transactionMetadata.transactionId": { $exists: true },
            "createdAt": { $gte: new Date("2025-10-13") }
        }
    },
    {
        $lookup: {
            from: "clients",
            localField: "clientId",
            foreignField: "_id",
            as: "client"
        }
    },
    {
        $project: {
            email: 1,
            hasClient: { $gt: [{ $size: "$client" }, 0] },
            transactionId: "$_transactionMetadata.transactionId"
        }
    }
])
```

---

## 8. Troubleshooting

### 8.1 Common Issues

#### Issue: Client Document Not Created

**Symptoms:**
- User document exists but clientId is null or undefined
- No Client document with matching userId
- Log shows "Transaction committed successfully" but missing related entity

**Diagnosis:**
```bash
# Check logs for strategy loading
grep "Strategy loaded successfully" logs/customer-services-*.log

# Check for preparation errors
grep "Entity data prepared using strategy" logs/customer-services-*.log

# Verify strategy registration
grep "Entity strategy registered" logs/customer-services-*.log
```

**Solutions:**

1. **Strategy Not Loaded:**
   - Verify strategy file exists at correct path
   - Check strategy exports correct class
   - Restart server to reload strategies

2. **prepareUsing Not Called:**
   - Verify Universal Transaction Service has been updated with fix
   - Check that relatedEntities configuration includes prepareUsing function
   - Add debug logs in _createRelatedEntities method

3. **Strategy Prepare Method Fails:**
   - Add try-catch in strategy.prepare()
   - Log error details
   - Verify all required fields are provided

#### Issue: Transaction Integrity Check Failed

**Symptoms:**
- Log shows "Transaction integrity check failed"
- Documents are created but metadata mismatch warning appears

**Diagnosis:**
```javascript
// Check transaction metadata in both documents
db.users.findOne(
    { _id: ObjectId("[userId]") },
    { "_transactionMetadata": 1 }
)

db.clients.findOne(
    { _id: ObjectId("[clientId]") },
    { "_transactionMetadata": 1 }
)
```

**Solutions:**

1. This is often a timing issue during metadata verification
2. The documents are still created successfully
3. You can ignore this warning if both documents exist with correct links
4. To fix: Ensure _verifyTransactionIntegrity uses correct field paths

#### Issue: Rate Limiting Error

**Symptoms:**
```
ValidationError: The Express 'trust proxy' setting is true, which allows anyone to trivially bypass IP-based rate limiting
```

**Solution:**

Update rate limiting configuration to handle proxy properly:

```javascript
// In middleware/rate-limit.js or server configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Add this configuration
    trustProxy: true,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    }
});
```

#### Issue: MongoDB Connection Warnings

**Symptoms:**
```
warn: Initialization already in progress
```

**Solution:**

This warning appears when ConnectionManager.initialize() is called multiple times concurrently. It's harmless but can be prevented by ensuring initialization happens once during server startup.

### 8.2 Debug Mode

Enable debug logging for transaction service:

**Environment Variable:**
```bash
DEBUG=universal-transaction-service,entity-strategy-registry npm run start:dev
```

**Code-Level Debugging:**

Add breakpoints or additional logs in these key methods:

1. `DirectAuthService.registerDirectUser()` - Before transaction execution
2. `UniversalTransactionService._createRelatedEntities()` - At prepareUsing call
3. `ClientRegistrationStrategy.prepare()` - During data preparation

### 8.3 Support Contact Matrix

| Component | Primary Contact | Escalation |
|-----------|----------------|------------|
| Transaction Service | Platform Team | Backend Lead |
| Entity Strategies | Business Logic Team | Architecture Team |
| Database Issues | DevOps Team | DBA |
| API/Authentication | Security Team | Backend Lead |

---

## 9. Future Enhancements

### 9.1 Planned Improvements

**Priority 1: Complete Remaining Entity Types**

Implement strategies for:
- Consultant registration
- Candidate registration
- Partner registration

Expected timeline: Q4 2025

**Priority 2: Enhanced Transaction Monitoring**

- Real-time transaction dashboard
- Automated integrity verification
- Transaction replay capability for debugging

Expected timeline: Q1 2026

**Priority 3: Performance Optimization**

- Connection pooling improvements
- Parallel entity preparation (where possible)
- Caching frequently used strategies

Expected timeline: Q2 2026

### 9.2 Experimental Features

**Multi-Tenant Transaction Isolation**

Currently under investigation:
- Per-tenant transaction isolation levels
- Cross-tenant transaction coordination
- Tenant-specific rollback strategies

**Event Sourcing Integration**

Exploring event sourcing pattern for:
- Complete audit trail of entity creation
- Time-travel debugging capabilities
- Better analytics on registration patterns

### 9.3 Technical Debt

**Known Limitations:**

1. **Onboarding Service Integration:** Currently shows stub responses. Needs full implementation with tenant ID handling.

2. **Notification Service:** Uses email stubs. Production implementation required.

3. **Strategy Discovery:** Currently uses file system scanning. Consider implementing strategy registry database for better management.

4. **Error Recovery:** Transaction rollback works but post-rollback cleanup could be more comprehensive.

**Remediation Plan:**

These items are tracked in the project backlog with target completion dates in the upcoming sprint planning sessions.

---

## Appendix A: Configuration Reference

### Environment Variables

```bash
# Database Configuration
MONGODB_URI=mongodb+srv://[credentials]@cluster0.mongodb.net/
DB_NAME_CUSTOMER=insightserenity_customer_dev
DB_NAME_SHARED=insightserenity_shared_dev
DB_NAME_ADMIN=insightserenity_admin_dev

# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Transaction Configuration
TRANSACTION_TIMEOUT=30000
MAX_RETRY_ATTEMPTS=3

# Logging
LOG_LEVEL=info
DEBUG_MODE=false
```

### Database Indexes

Required indexes for optimal performance:

```javascript
// users collection
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ clientId: 1 })
db.users.createIndex({ "_transactionMetadata.transactionId": 1 })

// clients collection
db.clients.createIndex({ clientCode: 1 }, { unique: true })
db.clients.createIndex({ userId: 1 })
db.clients.createIndex({ "contacts.primary.email": 1 })
db.clients.createIndex({ "_transactionMetadata.transactionId": 1 })
```

---

## Appendix B: API Reference

### Complete Registration Request Schema

```json
{
  "email": "string (required, email format)",
  "password": "string (required, min 8 chars, must include uppercase, lowercase, number, special char)",
  "username": "string (required, alphanumeric, 3-30 chars)",
  "phoneNumber": "string (optional, E.164 format)",
  "userType": "string (required, enum: ['client', 'consultant', 'candidate', 'partner'])",
  "profile": {
    "firstName": "string (required)",
    "lastName": "string (required)",
    "middleName": "string (optional)",
    "displayName": "string (optional)",
    "bio": "string (optional, max 500 chars)"
  },
  "companyName": "string (required for userType='client')",
  "organizationId": "string (optional, defaults to system default)",
  "tenantId": "string (optional, defaults to 'default')"
}
```

### Complete Registration Response Schema

```json
{
  "success": "boolean",
  "message": "string",
  "data": {
    "userId": "string (ObjectId)",
    "clientId": "string (ObjectId, for client userType)",
    "email": "string",
    "username": "string",
    "userType": "string",
    "accountStatus": "string (enum: ['pending', 'active', 'suspended'])",
    "verification": {
      "emailVerified": "boolean",
      "phoneVerified": "boolean"
    }
  },
  "meta": {
    "transactionId": "string",
    "timestamp": "string (ISO 8601)",
    "duration": "number (milliseconds)"
  }
}
```

---

## Document Control

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-13 | System Team | Initial documentation |

**Review Schedule:**

This document should be reviewed and updated:
- After each major system upgrade
- When new entity types are added
- When transaction logic changes
- Quarterly as part of documentation maintenance

**Document Ownership:**

- **Technical Owner:** Backend Engineering Team
- **Business Owner:** Product Management
- **Maintained By:** Platform Team

---

## Glossary

**Entity Strategy:** A class that implements preparation and validation logic for a specific entity type

**Transaction Metadata:** System-generated data attached to each document that tracks transaction participation

**Related Entity:** An entity that is created in the same transaction as the primary entity and has a relationship with it

**Prepare Function:** A method that transforms input data into the final structure needed for entity creation

**Linking Strategy:** Configuration that defines how two entities should be bidirectionally linked

**Universal Transaction Service:** The core service that orchestrates multi-entity transactions with MongoDB

**Direct Auth Service:** The service that handles user registration and authentication workflows

---

**End of Documentation**