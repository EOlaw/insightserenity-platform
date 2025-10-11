# Client Management Module - Integration Guide

## Overview
This module provides comprehensive client management functionality including clients, contacts, documents, and notes management.

## Directory Structure
```
/servers/customer-services/modules/core-business/client-management/
├── services/
│   ├── client-service.js
│   ├── client-contact-service.js
│   ├── client-document-service.js
│   ├── client-note-service.js
│   └── index.js
├── controllers/
│   ├── client-controller.js
│   ├── client-contact-controller.js
│   ├── client-document-controller.js
│   ├── client-note-controller.js
│   └── index.js
├── routes/
│   ├── client-routes.js
│   ├── client-contact-routes.js
│   ├── client-document-routes.js
│   ├── client-note-routes.js
│   └── index.js
└── README.md
```

## Integration Steps

### 1. Install Dependencies
Ensure the following packages are installed:
```bash
npm install express mongoose bcryptjs jsonwebtoken validator crypto
```

### 2. Configure Environment Variables
Add these to your `.env` file:
```env
# Client Management Configuration
COMPANY_TENANT_ID=default
PLATFORM_URL=https://yourplatform.com
AUTO_GENERATE_CLIENT_CODE=true
AUTO_GENERATE_CONTACT_ID=true
AUTO_GENERATE_DOCUMENT_ID=true
AUTO_GENERATE_NOTE_ID=true

# Client Settings
MAX_SUBSIDIARIES=50
DEFAULT_CURRENCY=USD
ENABLE_HEALTH_SCORE=true
REQUIRE_TIER_APPROVAL=false

# Contact Settings
MAX_CONTACTS_PER_CLIENT=100
REQUIRE_CONTACT_EMAIL_VERIFICATION=false
TRACK_CONTACT_ENGAGEMENT=true

# Document Settings
DOCUMENT_STORAGE_PATH=/storage/documents
MAX_DOCUMENT_SIZE=104857600
ENABLE_VERSION_CONTROL=true
MAX_VERSIONS_TO_KEEP=10
REQUIRE_DOCUMENT_APPROVAL=false
ALLOWED_DOCUMENT_TYPES=pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv

# Note Settings
MAX_NOTES_PER_CLIENT=10000
MAX_NOTE_LENGTH=50000
ENABLE_NOTE_VERSIONING=false
ENABLE_AUTO_TAGGING=false
ENABLE_SENTIMENT_ANALYSIS=false
```

### 3. Register Routes in Main Application

In your main application file (e.g., `servers/customer-services/app.js` or `server.js`):

```javascript
const express = require('express');
const app = express();

// Import client management routes
const clientManagementRoutes = require('./modules/core-business/client-management/routes');

// Mount the client management routes
app.use('/api/v1', clientManagementRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: {
            message: err.message,
            code: err.code,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### 4. Database Connection

Ensure your database connection is properly configured in:
`/shared/lib/database/index.js`

The services will automatically use the database connection manager to access the models.

### 5. Middleware Configuration

Ensure these middleware are properly configured:

#### Authentication Middleware
Location: `/shared/lib/middleware/auth.js`

```javascript
// Must export an authenticate function
module.exports = {
    authenticate: async (req, res, next) => {
        // Your authentication logic
        // Set req.user with { id, tenantId, organizationId, ... }
        next();
    }
};
```

#### Permission Middleware
Location: `/shared/lib/middleware/permissions.js`

```javascript
// Must export a checkPermission function
module.exports = {
    checkPermission: (permission) => {
        return async (req, res, next) => {
            // Your permission checking logic
            // Check if req.user has the required permission
            next();
        };
    }
};
```

#### Rate Limiter Middleware
Location: `/shared/lib/middleware/rate-limiter.js`

```javascript
// Must export a rateLimiter function
module.exports = {
    rateLimiter: (options) => {
        return async (req, res, next) => {
            // Your rate limiting logic
            next();
        };
    }
};
```

## API Endpoints

### Clients
- `POST /api/v1/clients` - Create client
- `GET /api/v1/clients/:id` - Get client by ID
- `GET /api/v1/clients/code/:code` - Get client by code
- `PUT /api/v1/clients/:id` - Update client
- `PATCH /api/v1/clients/:id` - Partial update client
- `DELETE /api/v1/clients/:id` - Delete client
- `GET /api/v1/clients/search` - Search clients
- `POST /api/v1/clients/search` - Advanced search clients
- `GET /api/v1/clients/statistics` - Get client statistics
- `POST /api/v1/clients/bulk` - Bulk create clients
- `GET /api/v1/clients/export` - Export clients
- `GET /api/v1/clients/:id/dashboard` - Get client dashboard

### Contacts
- `POST /api/v1/contacts` - Create contact
- `GET /api/v1/contacts/:id` - Get contact by ID
- `PUT /api/v1/contacts/:id` - Update contact
- `PATCH /api/v1/contacts/:id` - Partial update contact
- `DELETE /api/v1/contacts/:id` - Delete contact
- `GET /api/v1/contacts/search` - Search contacts
- `POST /api/v1/contacts/search` - Advanced search contacts
- `POST /api/v1/contacts/:id/interactions` - Record interaction
- `GET /api/v1/contacts/:id/engagement` - Get engagement metrics
- `POST /api/v1/contacts/bulk` - Bulk create contacts
- `GET /api/v1/contacts/export` - Export contacts
- `GET /api/v1/clients/:clientId/contacts` - Get client contacts

### Documents
- `POST /api/v1/documents` - Create/upload document
- `GET /api/v1/documents/:id` - Get document by ID
- `PUT /api/v1/documents/:id` - Update document
- `PATCH /api/v1/documents/:id` - Partial update document
- `DELETE /api/v1/documents/:id` - Delete document
- `GET /api/v1/documents/search` - Search documents
- `POST /api/v1/documents/search` - Advanced search documents
- `POST /api/v1/documents/:id/share` - Share document
- `GET /api/v1/documents/:id/download` - Download document
- `GET /api/v1/documents/:id/versions` - Get document versions
- `GET /api/v1/documents/:id/analytics` - Get document analytics
- `POST /api/v1/documents/bulk` - Bulk upload documents
- `GET /api/v1/clients/:clientId/documents` - Get client documents

### Notes
- `POST /api/v1/notes` - Create note
- `GET /api/v1/notes/:id` - Get note by ID
- `PUT /api/v1/notes/:id` - Update note
- `PATCH /api/v1/notes/:id` - Partial update note
- `DELETE /api/v1/notes/:id` - Delete note
- `GET /api/v1/notes/search` - Search notes
- `POST /api/v1/notes/search` - Advanced search notes
- `GET /api/v1/notes/recent` - Get recent notes
- `GET /api/v1/notes/tags/:tag` - Get notes by tag
- `GET /api/v1/notes/priority/:priority` - Get notes by priority
- `POST /api/v1/notes/:id/comments` - Add comment to note
- `GET /api/v1/notes/statistics` - Get note statistics
- `POST /api/v1/notes/bulk` - Bulk create notes
- `GET /api/v1/notes/export` - Export notes
- `GET /api/v1/clients/:clientId/notes` - Get client notes

## Usage Examples

### Create a Client
```javascript
POST /api/v1/clients
Content-Type: application/json
Authorization: Bearer <token>

{
    "companyName": "Acme Corporation",
    "legalName": "Acme Corp LLC",
    "contact": {
        "primaryEmail": "info@acme.com",
        "primaryPhone": "+1234567890",
        "website": "https://acme.com"
    },
    "businessDetails": {
        "registrationNumber": "REG123456",
        "taxId": "TAX789012",
        "companySize": "51-200",
        "foundedYear": 2010
    },
    "industry": {
        "primary": {
            "sector": "Technology",
            "subsector": "Software"
        }
    },
    "relationship": {
        "tier": "enterprise",
        "accountManager": "64a7f8e9d2c3b1a5e6f7g8h9"
    }
}
```

### Search Clients
```javascript
GET /api/v1/clients/search?status=active&tier=enterprise&page=1&limit=20
Authorization: Bearer <token>
```

### Create a Contact
```javascript
POST /api/v1/contacts
Content-Type: application/json
Authorization: Bearer <token>

{
    "clientId": "64a7f8e9d2c3b1a5e6f7g8h9",
    "personalInfo": {
        "firstName": "John",
        "lastName": "Doe",
        "prefix": "Mr"
    },
    "contactInfo": {
        "email": "john.doe@acme.com",
        "phone": "+1234567890"
    },
    "professionalInfo": {
        "jobTitle": "CTO",
        "department": "Technology"
    },
    "role": {
        "primary": "decision_maker",
        "isPrimary": true
    }
}
```

### Upload a Document
```javascript
POST /api/v1/documents
Content-Type: application/json
Authorization: Bearer <token>

{
    "clientId": "64a7f8e9d2c3b1a5e6f7g8h9",
    "documentInfo": {
        "name": "Service Agreement 2024",
        "type": "contract",
        "description": "Annual service agreement for 2024"
    },
    "access": {
        "level": "confidential"
    }
}
```

### Create a Note
```javascript
POST /api/v1/notes
Content-Type: application/json
Authorization: Bearer <token>

{
    "clientId": "64a7f8e9d2c3b1a5e6f7g8h9",
    "type": "meeting",
    "category": "sales",
    "priority": "high",
    "content": {
        "title": "Q4 Strategy Discussion",
        "body": "Discussed renewal strategy and upsell opportunities for Q4..."
    },
    "tags": ["renewal", "strategy", "q4"]
}
```

## Testing

### Run Tests
```bash
npm test
```

### Test Individual Endpoints
Use tools like Postman or curl:

```bash
# Create a client
curl -X POST http://localhost:3000/api/v1/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "companyName": "Test Company",
    "contact": {
      "primaryEmail": "test@example.com"
    }
  }'

# Get client by ID
curl -X GET http://localhost:3000/api/v1/clients/64a7f8e9d2c3b1a5e6f7g8h9 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Permissions Required

Ensure users have the following permissions:

### Client Permissions
- `clients:create` - Create clients
- `clients:read` - Read/view clients
- `clients:update` - Update clients
- `clients:delete` - Delete clients
- `clients:export` - Export client data

### Contact Permissions
- `contacts:create` - Create contacts
- `contacts:read` - Read/view contacts
- `contacts:update` - Update contacts
- `contacts:delete` - Delete contacts
- `contacts:export` - Export contact data

### Document Permissions
- `documents:create` - Create/upload documents
- `documents:read` - Read/view documents
- `documents:update` - Update documents
- `documents:delete` - Delete documents
- `documents:share` - Share documents with others

### Note Permissions
- `notes:create` - Create notes
- `notes:read` - Read/view notes
- `notes:update` - Update notes
- `notes:delete` - Delete notes
- `notes:export` - Export note data

## Database Models

The following models must be registered in the database:
- `Client` - Main client model
- `ClientContact` - Client contact model
- `ClientDocument` - Client document model
- `ClientNote` - Client note model

These models are located in:
`/shared/lib/database/models/customer-services/core-business/client-management/`

## Error Handling

All services and controllers use the AppError utility for consistent error handling:

```javascript
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Validation error
throw AppError.validation('Invalid input data', { errors: [...] });

// Not found error
throw AppError.notFound('Client not found', { context: { clientId } });

// Unauthorized error
throw AppError.unauthorized('Invalid credentials');

// Forbidden error
throw AppError.forbidden('Access denied');

// Conflict error
throw AppError.conflict('Client already exists');
```

## Logging

All services and controllers use the logger utility:

```javascript
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'your-service-name'
});

logger.info('Operation completed', { data });
logger.error('Operation failed', { error: error.message });
logger.warn('Warning message', { context });
```

## Performance Considerations

1. **Pagination**: All search endpoints support pagination with `page` and `limit` parameters
2. **Indexing**: Ensure database indexes are created on frequently queried fields
3. **Caching**: Consider implementing caching for frequently accessed data
4. **Rate Limiting**: Configure appropriate rate limits based on your requirements

## Security Considerations

1. **Authentication**: All routes require authentication via JWT tokens
2. **Authorization**: Permission checks are enforced on all operations
3. **Input Validation**: All inputs are validated before processing
4. **SQL Injection**: Using Mongoose ORM prevents SQL injection attacks
5. **Rate Limiting**: Prevents abuse and DoS attacks

## Troubleshooting

### Common Issues

1. **Routes not working**
   - Ensure routes are properly mounted in the main app
   - Check that middleware is correctly configured
   - Verify authentication tokens are valid

2. **Database connection errors**
   - Verify MongoDB connection string
   - Ensure database service is running
   - Check network connectivity

3. **Permission denied errors**
   - Verify user has required permissions
   - Check permission middleware configuration
   - Ensure tenant/organization IDs match

4. **Model not found errors**
   - Verify models are properly registered in the database
   - Check model paths are correct
   - Ensure database connection is initialized

## Support

For issues or questions:
- Check the logs in `/servers/customer-services/logs/`
- Review the error stack traces
- Contact the development team

## Version History

- **v1.0.0** - Initial release with comprehensive client management functionality

## License

Internal use only - Proprietary software