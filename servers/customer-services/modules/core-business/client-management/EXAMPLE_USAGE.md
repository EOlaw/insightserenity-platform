# Client Management Module - Example Usage

## Quick Start

### 1. Import the Module in Your Main Server File

```javascript
// servers/customer-services/app.js or server.js
const express = require('express');
const app = express();

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import and initialize the client management module
const { moduleConfig } = require('./modules/core-business/client-management/module-config');

// Initialize module
moduleConfig.initialize().then(result => {
    console.log('Client Management Module initialized:', result);
}).catch(error => {
    console.error('Failed to initialize module:', error);
});

// Mount routes
const clientManagementRoutes = require('./modules/core-business/client-management/routes');
app.use('/api/v1', clientManagementRoutes);

// Global error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: {
            message: err.message,
            code: err.code,
            ...(process.env.NODE_ENV === 'development' && { 
                stack: err.stack,
                details: err.details 
            })
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### 2. Using Services Directly (Optional)

If you need to use the services in other parts of your application:

```javascript
// In any other file
const { ClientService, ClientContactService } = require('./modules/core-business/client-management/services');

// Create a client programmatically
async function createClientExample() {
    const clientData = {
        companyName: 'Example Corp',
        contact: {
            primaryEmail: 'info@example.com'
        }
    };

    const options = {
        tenantId: 'your-tenant-id',
        userId: 'user-id'
    };

    try {
        const client = await ClientService.createClient(clientData, options);
        console.log('Client created:', client);
        return client;
    } catch (error) {
        console.error('Failed to create client:', error);
        throw error;
    }
}
```

## Complete API Examples

### Client Operations

#### 1. Create a New Client

```bash
curl -X POST http://localhost:3000/api/v1/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "companyName": "TechStart Inc",
    "legalName": "TechStart Incorporated",
    "tradingName": "TechStart",
    "contact": {
      "primaryEmail": "hello@techstart.com",
      "primaryPhone": "+1-555-0123",
      "website": "https://techstart.com",
      "address": {
        "street": "123 Innovation Drive",
        "city": "San Francisco",
        "state": "CA",
        "postalCode": "94102",
        "country": "USA"
      }
    },
    "businessDetails": {
      "registrationNumber": "REG-2024-001",
      "taxId": "TAX-123456789",
      "companySize": "11-50",
      "foundedYear": 2020,
      "fiscalYearEnd": "12-31"
    },
    "industry": {
      "primary": {
        "sector": "Technology",
        "subsector": "Software Development"
      }
    },
    "relationship": {
      "tier": "mid_market",
      "accountManager": "64f8e9d2c3b1a5e6f7g8h901"
    }
  }'
```

#### 2. Get Client by ID

```bash
curl -X GET http://localhost:3000/api/v1/clients/64f8e9d2c3b1a5e6f7g8h902 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Search Clients with Filters

```bash
# Simple search
curl -X GET "http://localhost:3000/api/v1/clients/search?status=active&tier=enterprise&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Advanced search with POST
curl -X POST http://localhost:3000/api/v1/clients/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "filters": {
      "status": "active",
      "tier": "enterprise",
      "industry": "Technology",
      "revenueMin": 1000000,
      "revenueMax": 10000000,
      "search": "tech"
    },
    "page": 1,
    "limit": 20
  }'
```

#### 4. Update Client

```bash
curl -X PATCH http://localhost:3000/api/v1/clients/64f8e9d2c3b1a5e6f7g8h902 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "relationship": {
      "tier": "enterprise",
      "status": "active"
    },
    "contact": {
      "primaryPhone": "+1-555-9999"
    }
  }'
```

#### 5. Get Client Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/clients/statistics?dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Contact Operations

#### 1. Create Contact for a Client

```bash
curl -X POST http://localhost:3000/api/v1/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientId": "64f8e9d2c3b1a5e6f7g8h902",
    "personalInfo": {
      "prefix": "Ms",
      "firstName": "Sarah",
      "lastName": "Johnson",
      "dateOfBirth": "1985-06-15"
    },
    "contactInfo": {
      "email": "sarah.johnson@techstart.com",
      "phone": "+1-555-0124",
      "mobile": "+1-555-0125"
    },
    "professionalInfo": {
      "jobTitle": "Chief Technology Officer",
      "department": "Technology",
      "seniority": "executive"
    },
    "role": {
      "primary": "decision_maker",
      "secondary": ["technical_contact"],
      "isPrimary": true
    },
    "socialMedia": {
      "linkedin": "https://linkedin.com/in/sarahjohnson"
    }
  }'
```

#### 2. Get Contacts for a Client

```bash
curl -X GET http://localhost:3000/api/v1/clients/64f8e9d2c3b1a5e6f7g8h902/contacts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Record Contact Interaction

```bash
curl -X POST http://localhost:3000/api/v1/contacts/CONT-ABC123/interactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "call",
    "channel": "phone",
    "subject": "Q4 Renewal Discussion",
    "notes": "Discussed renewal terms for Q4. Client is interested in upgrading to enterprise plan.",
    "outcome": "positive",
    "duration": 45,
    "sentiment": "positive"
  }'
```

#### 4. Search Contacts

```bash
curl -X GET "http://localhost:3000/api/v1/contacts/search?clientId=64f8e9d2c3b1a5e6f7g8h902&role=decision_maker" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Document Operations

#### 1. Create/Upload Document

```bash
curl -X POST http://localhost:3000/api/v1/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientId": "64f8e9d2c3b1a5e6f7g8h902",
    "documentInfo": {
      "name": "Master Service Agreement 2024",
      "displayName": "MSA 2024 - TechStart",
      "description": "Master service agreement for software development services",
      "type": "agreement",
      "tags": ["contract", "msa", "2024"]
    },
    "access": {
      "level": "confidential",
      "allowedUsers": ["64f8e9d2c3b1a5e6f7g8h903"]
    },
    "status": "draft"
  }'
```

#### 2. Get Documents for a Client

```bash
curl -X GET "http://localhost:3000/api/v1/clients/64f8e9d2c3b1a5e6f7g8h902/documents?type=contract&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Share Document

```bash
curl -X POST http://localhost:3000/api/v1/documents/DOC-XYZ789/share \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userIds": ["64f8e9d2c3b1a5e6f7g8h904", "64f8e9d2c3b1a5e6f7g8h905"],
    "notify": true
  }'
```

#### 4. Download Document

```bash
curl -X GET http://localhost:3000/api/v1/documents/DOC-XYZ789/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output document.pdf
```

#### 5. Search Documents

```bash
curl -X GET "http://localhost:3000/api/v1/documents/search?clientId=64f8e9d2c3b1a5e6f7g8h902&type=contract&search=msa" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Note Operations

#### 1. Create Note

```bash
curl -X POST http://localhost:3000/api/v1/notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientId": "64f8e9d2c3b1a5e6f7g8h902",
    "type": "meeting",
    "category": "sales",
    "priority": "high",
    "content": {
      "title": "Q4 2024 Strategy Meeting",
      "body": "Met with the CTO and CFO to discuss Q4 strategy. Key points:\n- Interested in upgrading to enterprise tier\n- Need additional features for team collaboration\n- Budget approved for Q4\n- Decision expected by end of month",
      "format": "markdown"
    },
    "tags": ["renewal", "upgrade", "q4", "strategy"],
    "visibility": "team",
    "relatedEntities": {
      "contactId": "CONT-ABC123"
    }
  }'
```

#### 2. Get Notes for a Client

```bash
curl -X GET "http://localhost:3000/api/v1/clients/64f8e9d2c3b1a5e6f7g8h902/notes?type=meeting&priority=high" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Search Notes

```bash
curl -X GET "http://localhost:3000/api/v1/notes/search?clientId=64f8e9d2c3b1a5e6f7g8h902&tags=renewal&dateFrom=2024-10-01" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 4. Add Comment to Note

```bash
curl -X POST http://localhost:3000/api/v1/notes/NOTE-DEF456/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "content": "Follow up scheduled for next week to finalize the terms."
  }'
```

#### 5. Get Recent Notes

```bash
curl -X GET "http://localhost:3000/api/v1/notes/recent?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 6. Get Note Statistics

```bash
curl -X GET "http://localhost:3000/api/v1/notes/statistics?clientId=64f8e9d2c3b1a5e6f7g8h902" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Bulk Operations

### Bulk Create Clients

```bash
curl -X POST http://localhost:3000/api/v1/clients/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clients": [
      {
        "companyName": "Company A",
        "contact": { "primaryEmail": "info@companya.com" }
      },
      {
        "companyName": "Company B",
        "contact": { "primaryEmail": "info@companyb.com" }
      }
    ]
  }'
```

### Bulk Create Contacts

```bash
curl -X POST http://localhost:3000/api/v1/contacts/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "contacts": [
      {
        "clientId": "64f8e9d2c3b1a5e6f7g8h902",
        "personalInfo": { "firstName": "John", "lastName": "Doe" },
        "contactInfo": { "email": "john@techstart.com" }
      },
      {
        "clientId": "64f8e9d2c3b1a5e6f7g8h902",
        "personalInfo": { "firstName": "Jane", "lastName": "Smith" },
        "contactInfo": { "email": "jane@techstart.com" }
      }
    ]
  }'
```

## Export Operations

### Export Clients to CSV

```bash
curl -X GET "http://localhost:3000/api/v1/clients/export?format=csv&status=active" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output clients.csv
```

### Export Contacts to JSON

```bash
curl -X GET "http://localhost:3000/api/v1/contacts/export?format=json&clientId=64f8e9d2c3b1a5e6f7g8h902" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output contacts.json
```

### Export Notes to CSV

```bash
curl -X GET "http://localhost:3000/api/v1/notes/export?format=csv&dateFrom=2024-01-01&dateTo=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output notes.csv
```

## Module Health Check

```bash
curl -X GET http://localhost:3000/api/v1/health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Programmatic Usage in Code

```javascript
// Import services
const { 
    ClientService, 
    ClientContactService, 
    ClientDocumentService, 
    ClientNoteService 
} = require('./modules/core-business/client-management/services');

async function completeClientSetup() {
    const options = {
        tenantId: 'tenant-123',
        organizationId: 'org-456',
        userId: 'user-789'
    };

    try {
        // 1. Create client
        const client = await ClientService.createClient({
            companyName: 'New Client Corp',
            contact: { primaryEmail: 'info@newclient.com' }
        }, options);

        console.log('Client created:', client.clientCode);

        // 2. Create primary contact
        const contact = await ClientContactService.createContact({
            clientId: client._id,
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe'
            },
            contactInfo: {
                email: 'john.doe@newclient.com'
            },
            role: {
                primary: 'decision_maker',
                isPrimary: true
            }
        }, options);

        console.log('Contact created:', contact.contactId);

        // 3. Create initial document
        const document = await ClientDocumentService.createDocument({
            clientId: client._id,
            documentInfo: {
                name: 'Onboarding Checklist',
                type: 'other'
            }
        }, options);

        console.log('Document created:', document.documentId);

        // 4. Create welcome note
        const note = await ClientNoteService.createNote({
            clientId: client._id,
            type: 'general',
            category: 'relationship_management',
            content: {
                title: 'Welcome to Our Platform',
                body: 'Initial onboarding note for new client.'
            }
        }, options);

        console.log('Note created:', note.noteId);

        return {
            client,
            contact,
            document,
            note
        };

    } catch (error) {
        console.error('Setup failed:', error);
        throw error;
    }
}

// Execute
completeClientSetup()
    .then(result => console.log('Setup complete:', result))
    .catch(error => console.error('Setup failed:', error));
```

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    "client": { ... }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "errors": [
        {
          "field": "companyName",
          "message": "Company name is required"
        }
      ]
    }
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "clients": [ ... ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```