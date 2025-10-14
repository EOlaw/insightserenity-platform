# Client Management API Reference

## Overview

This document provides comprehensive API reference documentation for the Client Management System. All endpoints require authentication via JWT bearer tokens and enforce role-based access control. The API follows RESTful conventions with consistent request/response patterns across all endpoints.

**Base URL:** `http://localhost:3001/api/v1`  
**Production URL:** `https://api.insightserenity.com/v1`  
**API Version:** 1.0.0  
**Authentication:** Bearer Token (JWT)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Client Endpoints](#client-endpoints)
3. [Contact Endpoints](#contact-endpoints)
4. [Document Endpoints](#document-endpoints)
5. [Note Endpoints](#note-endpoints)
6. [Response Formats](#response-formats)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [Pagination](#pagination)

---

## Authentication

All API requests must include a valid JWT access token in the Authorization header.

### Request Headers

```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Obtaining Access Tokens

Access tokens are obtained through the authentication endpoint:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "userType": "client"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 86400
    }
  }
}
```

### Token Refresh

When the access token expires, use the refresh token to obtain a new access token:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Client Endpoints

### Create Client

Creates a new client record with automatic client code generation and validation.

**Endpoint:** `POST /clients`  
**Permission:** `clients:create`  
**Rate Limit:** 50 requests per minute

**Request Body:**

```json
{
  "companyName": "Acme Corporation",
  "legalName": "Acme Corporation Inc.",
  "tradingName": "Acme",
  "businessDetails": {
    "registrationNumber": "REG-123456",
    "taxId": "12-3456789",
    "entityType": "corporation",
    "incorporationDate": "2010-01-15",
    "fiscalYearEnd": "12-31",
    "employeeCount": 250,
    "annualRevenue": {
      "amount": 5000000,
      "currency": "USD",
      "year": 2024
    }
  },
  "industry": {
    "primary": "Technology",
    "secondary": ["Software", "SaaS"],
    "keywords": ["cloud", "enterprise", "B2B"]
  },
  "contacts": {
    "primary": {
      "name": "John Smith",
      "email": "john.smith@acme.com",
      "phone": "+1234567890",
      "jobTitle": "CEO",
      "preferredContactMethod": "email"
    }
  },
  "addresses": {
    "headquarters": {
      "street1": "123 Main Street",
      "street2": "Suite 400",
      "city": "New York",
      "state": "NY",
      "postalCode": "10001",
      "country": "United States",
      "timezone": "America/New_York"
    },
    "billing": {
      "sameAsHeadquarters": true
    }
  },
  "relationship": {
    "status": "prospect",
    "tier": "mid_market",
    "acquisitionSource": "inbound",
    "referralSource": "website"
  },
  "billing": {
    "currency": "USD",
    "paymentTerms": "net30",
    "taxExempt": false
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Client created successfully",
  "data": {
    "client": {
      "_id": "68ed6ca5212843ed4b5d4801",
      "clientCode": "CLI-AC309501SSB",
      "companyName": "Acme Corporation",
      "legalName": "Acme Corporation Inc.",
      "tradingName": "Acme",
      "tenantId": "000000000000000000000001",
      "organizationId": "000000000000000000000002",
      "businessDetails": {
        "registrationNumber": "REG-123456",
        "entityType": "corporation",
        "employeeCount": 250,
        "annualRevenue": {
          "amount": 5000000,
          "currency": "USD",
          "year": 2024
        }
      },
      "relationship": {
        "status": "prospect",
        "tier": "mid_market",
        "accountManager": null,
        "acquisitionDate": "2025-10-13T21:18:29.501Z",
        "acquisitionSource": "inbound"
      },
      "createdAt": "2025-10-13T21:18:29.518Z",
      "updatedAt": "2025-10-13T21:18:29.518Z"
    }
  }
}
```

**Validation Rules:**

- companyName: Required, 1-200 characters
- businessDetails.registrationNumber: Unique within tenant
- contacts.primary.email: Valid email format
- addresses.headquarters.country: Valid country name
- billing.currency: Valid ISO 4217 currency code

### Get Client by ID

Retrieves a single client by ID with optional population of related entities.

**Endpoint:** `GET /clients/:id`  
**Permission:** `clients:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `id` (required): Client ObjectId

**Query Parameters:**

- `populate` (optional): Set to "true" to populate related entities
- `fields` (optional): Comma-separated list of fields to include

**Example Request:**

```http
GET /clients/68ed6ca5212843ed4b5d4801?populate=true
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "client": {
      "_id": "68ed6ca5212843ed4b5d4801",
      "clientCode": "CLI-AC309501SSB",
      "companyName": "Acme Corporation",
      "displayName": "Acme",
      "relationship": {
        "status": "active",
        "tier": "mid_market",
        "healthScore": 85
      },
      "analytics": {
        "lifetime": {
          "totalRevenue": 150000,
          "totalProjects": 5,
          "totalEngagements": 12
        }
      },
      "createdAt": "2025-10-13T21:18:29.518Z",
      "updatedAt": "2025-10-13T21:18:29.518Z"
    }
  }
}
```

### Get Client by Code

Retrieves a client using the unique client code.

**Endpoint:** `GET /clients/code/:code`  
**Permission:** `clients:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `code` (required): Client code (e.g., CLI-AC309501SSB)

**Example Request:**

```http
GET /clients/code/CLI-AC309501SSB
Authorization: Bearer {access_token}
```

**Response:** `200 OK` (same structure as Get Client by ID)

### Update Client

Updates an existing client with partial or full update support.

**Endpoint:** `PUT /clients/:id` or `PATCH /clients/:id`  
**Permission:** `clients:update`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Client ObjectId

**Request Body:**

```json
{
  "relationship": {
    "status": "active",
    "tier": "enterprise",
    "accountManager": "507f1f77bcf86cd799439011"
  },
  "businessDetails": {
    "employeeCount": 300,
    "annualRevenue": {
      "amount": 6000000,
      "currency": "USD",
      "year": 2025
    }
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Client updated successfully",
  "data": {
    "client": {
      "_id": "68ed6ca5212843ed4b5d4801",
      "clientCode": "CLI-AC309501SSB",
      "relationship": {
        "status": "active",
        "tier": "enterprise",
        "accountManager": "507f1f77bcf86cd799439011"
      },
      "updatedAt": "2025-10-13T22:30:15.234Z"
    }
  }
}
```

**Immutable Fields:**

The following fields cannot be updated and will be ignored if included:
- clientCode
- tenantId
- createdAt

### Delete Client

Soft deletes a client by marking it as deleted. Hard delete available with query parameter.

**Endpoint:** `DELETE /clients/:id`  
**Permission:** `clients:delete`  
**Rate Limit:** 20 requests per minute

**Path Parameters:**

- `id` (required): Client ObjectId

**Query Parameters:**

- `hard` (optional): Set to "true" for permanent deletion (requires admin role)

**Example Request:**

```http
DELETE /clients/68ed6ca5212843ed4b5d4801
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Client deleted successfully",
  "data": {
    "clientId": "68ed6ca5212843ed4b5d4801",
    "deletedAt": "2025-10-13T23:45:12.456Z"
  }
}
```

### Search Clients

Performs advanced search with multiple filter criteria and full-text search support.

**Endpoint:** `GET /clients/search` or `POST /clients/search`  
**Permission:** `clients:read`  
**Rate Limit:** 100 requests per minute

**Query Parameters (GET):**

- `q` (optional): Search query for full-text search
- `status` (optional): Filter by relationship status
- `tier` (optional): Filter by client tier
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20, max: 100)
- `sort` (optional): Sort field and direction (e.g., "createdAt:-1")

**Request Body (POST):**

```json
{
  "query": "technology software",
  "filters": {
    "relationship.status": "active",
    "relationship.tier": ["enterprise", "strategic"],
    "billing.outstandingBalance": { "$gt": 0 },
    "createdAt": {
      "$gte": "2024-01-01T00:00:00.000Z",
      "$lte": "2024-12-31T23:59:59.999Z"
    }
  },
  "sort": {
    "analytics.lifetime.totalRevenue": -1
  },
  "page": 1,
  "limit": 20,
  "fields": ["clientCode", "companyName", "relationship", "analytics"]
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "clients": [
      {
        "_id": "68ed6ca5212843ed4b5d4801",
        "clientCode": "CLI-AC309501SSB",
        "companyName": "Acme Corporation",
        "relationship": {
          "status": "active",
          "tier": "enterprise"
        },
        "analytics": {
          "lifetime": {
            "totalRevenue": 150000
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "totalResults": 95,
      "hasMore": true
    }
  }
}
```

### Get Client Statistics

Retrieves aggregate statistics for clients within the tenant.

**Endpoint:** `GET /clients/statistics`  
**Permission:** `clients:read`  
**Rate Limit:** 100 requests per minute

**Query Parameters:**

- `dateRange` (optional): Date range for statistics (today, week, month, quarter, year, custom)
- `startDate` (optional): Start date for custom range (ISO 8601)
- `endDate` (optional): End date for custom range (ISO 8601)

**Example Request:**

```http
GET /clients/statistics?dateRange=month
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "statistics": {
      "totalClients": 150,
      "activeClients": 120,
      "newClientsThisMonth": 8,
      "clientsByStatus": {
        "prospect": 15,
        "lead": 10,
        "active": 120,
        "inactive": 3,
        "at_risk": 2
      },
      "clientsByTier": {
        "small_business": 80,
        "mid_market": 50,
        "enterprise": 15,
        "strategic": 5
      },
      "totalRevenue": 5250000,
      "averageRevenuePerClient": 35000,
      "outstandingBalance": 125000,
      "healthScoreAverage": 78
    }
  }
}
```

### Export Clients

Exports client data in specified format with filtering and field selection.

**Endpoint:** `GET /clients/export`  
**Permission:** `clients:export`  
**Rate Limit:** 10 requests per minute

**Query Parameters:**

- `format` (required): Export format (csv, excel, json)
- `filters` (optional): JSON string of filter criteria
- `fields` (optional): Comma-separated list of fields to include

**Example Request:**

```http
GET /clients/export?format=csv&fields=clientCode,companyName,relationship.status
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

Returns file download with appropriate content type and headers.

### Bulk Create Clients

Creates multiple clients in a single transaction with validation and rollback support.

**Endpoint:** `POST /clients/bulk`  
**Permission:** `clients:create`  
**Rate Limit:** 10 requests per minute

**Request Body:**

```json
{
  "clients": [
    {
      "companyName": "Company One",
      "contacts": {
        "primary": {
          "name": "Contact One",
          "email": "contact@company1.com"
        }
      }
    },
    {
      "companyName": "Company Two",
      "contacts": {
        "primary": {
          "name": "Contact Two",
          "email": "contact@company2.com"
        }
      }
    }
  ],
  "options": {
    "skipDuplicates": false,
    "validateOnly": false
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Bulk client creation completed",
  "data": {
    "created": 2,
    "failed": 0,
    "clients": [
      {
        "_id": "68ed6ca5212843ed4b5d4801",
        "clientCode": "CLI-CO309501AAA",
        "companyName": "Company One"
      },
      {
        "_id": "68ed6ca5212843ed4b5d4802",
        "clientCode": "CLI-CO309502BBB",
        "companyName": "Company Two"
      }
    ],
    "errors": []
  }
}
```

### Get Client Dashboard

Retrieves comprehensive dashboard data for a specific client including analytics, recent activity, and relationship health.

**Endpoint:** `GET /clients/:id/dashboard`  
**Permission:** `clients:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `id` (required): Client ObjectId

**Example Request:**

```http
GET /clients/68ed6ca5212843ed4b5d4801/dashboard
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "dashboard": {
      "client": {
        "_id": "68ed6ca5212843ed4b5d4801",
        "clientCode": "CLI-AC309501SSB",
        "companyName": "Acme Corporation"
      },
      "relationshipHealth": {
        "score": 85,
        "trend": "improving",
        "riskFactors": []
      },
      "financials": {
        "lifetimeRevenue": 150000,
        "outstandingBalance": 5000,
        "averageInvoiceValue": 12500
      },
      "activity": {
        "recentProjects": [],
        "recentDocuments": [],
        "recentNotes": [],
        "upcomingMeetings": []
      },
      "engagement": {
        "portalLogins": 45,
        "lastLoginAt": "2025-10-12T14:30:00.000Z",
        "documentsAccessed": 23,
        "supportTickets": 2
      }
    }
  }
}
```

---

## Contact Endpoints

### Create Contact

Creates a new contact associated with a client.

**Endpoint:** `POST /contacts`  
**Permission:** `contacts:create`  
**Rate Limit:** 50 requests per minute

**Request Body:**

```json
{
  "clientId": "68ed6ca5212843ed4b5d4801",
  "personalInfo": {
    "prefix": "Mr",
    "firstName": "Jane",
    "lastName": "Doe",
    "jobTitle": "Chief Technology Officer",
    "department": "Technology"
  },
  "professionalInfo": {
    "workEmail": "jane.doe@client.com",
    "directPhone": "+1234567890",
    "mobilePhone": "+1234567891",
    "linkedInProfile": "https://linkedin.com/in/janedoe"
  },
  "role": {
    "primaryRole": "decision_maker",
    "secondaryRoles": ["technical_contact"],
    "authorityLevel": "executive",
    "budgetAuthority": true
  },
  "communicationPreferences": {
    "preferredMethod": "email",
    "bestTimeToContact": "morning",
    "timezone": "America/New_York"
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Contact created successfully",
  "data": {
    "contact": {
      "_id": "68ed6ca5212843ed4b5d4900",
      "contactId": "CONT-JD309601ABC",
      "clientId": "68ed6ca5212843ed4b5d4801",
      "personalInfo": {
        "firstName": "Jane",
        "lastName": "Doe",
        "fullName": "Jane Doe",
        "jobTitle": "Chief Technology Officer"
      },
      "engagement": {
        "score": 0,
        "totalInteractions": 0
      },
      "createdAt": "2025-10-13T21:30:00.000Z"
    }
  }
}
```

### Get Contacts by Client

Retrieves all contacts for a specific client with filtering and sorting options.

**Endpoint:** `GET /clients/:clientId/contacts`  
**Permission:** `contacts:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `clientId` (required): Client ObjectId

**Query Parameters:**

- `role` (optional): Filter by primary role
- `department` (optional): Filter by department
- `page` (optional): Page number
- `limit` (optional): Results per page
- `sort` (optional): Sort field (e.g., "engagement.score:-1")

**Example Request:**

```http
GET /clients/68ed6ca5212843ed4b5d4801/contacts?role=decision_maker
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "contacts": [
      {
        "_id": "68ed6ca5212843ed4b5d4900",
        "contactId": "CONT-JD309601ABC",
        "personalInfo": {
          "fullName": "Jane Doe",
          "jobTitle": "Chief Technology Officer"
        },
        "engagement": {
          "score": 75,
          "lastContactAt": "2025-10-12T10:15:00.000Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalResults": 1
    }
  }
}
```

### Update Contact

Updates an existing contact with partial update support.

**Endpoint:** `PATCH /contacts/:id`  
**Permission:** `contacts:update`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Contact ObjectId

**Request Body:**

```json
{
  "personalInfo": {
    "jobTitle": "Chief Information Officer"
  },
  "professionalInfo": {
    "directPhone": "+1234567892"
  }
}
```

**Response:** `200 OK`

---

## Document Endpoints

### Upload Document

Uploads a new document associated with a client.

**Endpoint:** `POST /documents`  
**Permission:** `documents:create`  
**Rate Limit:** 20 requests per minute  
**Content-Type:** `multipart/form-data`

**Form Data:**

- `clientId` (required): Client ObjectId
- `file` (required): Document file
- `documentInfo[name]` (required): Document name
- `documentInfo[type]` (required): Document type
- `documentInfo[category]` (optional): Category
- `documentInfo[description]` (optional): Description
- `security[visibility]` (optional): Visibility level
- `tags[]` (optional): Array of tags

**Example Request:**

```http
POST /documents
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="clientId"

68ed6ca5212843ed4b5d4801
--boundary
Content-Disposition: form-data; name="file"; filename="contract.pdf"
Content-Type: application/pdf

[binary file data]
--boundary
Content-Disposition: form-data; name="documentInfo[name]"

Service Agreement 2025
--boundary
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "document": {
      "_id": "68ed6ca5212843ed4b5d5000",
      "documentId": "DOC-SA309701XYZ",
      "clientId": "68ed6ca5212843ed4b5d4801",
      "documentInfo": {
        "name": "Service Agreement 2025",
        "type": "contract"
      },
      "file": {
        "originalName": "contract.pdf",
        "size": 245760,
        "mimeType": "application/pdf",
        "downloadUrl": "/api/v1/documents/68ed6ca5212843ed4b5d5000/download"
      },
      "version": {
        "current": 1
      },
      "createdAt": "2025-10-13T22:00:00.000Z"
    }
  }
}
```

### Get Documents by Client

Retrieves all documents for a specific client.

**Endpoint:** `GET /clients/:clientId/documents`  
**Permission:** `documents:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `clientId` (required): Client ObjectId

**Query Parameters:**

- `type` (optional): Filter by document type
- `category` (optional): Filter by category
- `page` (optional): Page number
- `limit` (optional): Results per page

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "_id": "68ed6ca5212843ed4b5d5000",
        "documentId": "DOC-SA309701XYZ",
        "documentInfo": {
          "name": "Service Agreement 2025",
          "type": "contract"
        },
        "file": {
          "size": 245760,
          "mimeType": "application/pdf"
        },
        "createdAt": "2025-10-13T22:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "totalResults": 1
    }
  }
}
```

### Download Document

Downloads a document file with access control verification.

**Endpoint:** `GET /documents/:id/download`  
**Permission:** `documents:read`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Document ObjectId

**Example Request:**

```http
GET /documents/68ed6ca5212843ed4b5d5000/download
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

Returns file with appropriate content type and content-disposition headers for download.

### Share Document

Shares a document with specified users or makes it public.

**Endpoint:** `POST /documents/:id/share`  
**Permission:** `documents:share`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Document ObjectId

**Request Body:**

```json
{
  "shareWith": ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"],
  "permissions": {
    "canView": true,
    "canDownload": true,
    "canEdit": false
  },
  "expiresAt": "2025-12-31T23:59:59.999Z",
  "notifyUsers": true,
  "message": "Please review this document"
}
```

**Response:** `200 OK`

---

## Note Endpoints

### Create Note

Creates a new note associated with a client.

**Endpoint:** `POST /notes`  
**Permission:** `notes:create`  
**Rate Limit:** 50 requests per minute

**Request Body:**

```json
{
  "clientId": "68ed6ca5212843ed4b5d4801",
  "content": {
    "title": "Quarterly Business Review Meeting",
    "body": "Discussed Q3 performance, upcoming projects, and budget planning for 2026. Client expressed satisfaction with service delivery.",
    "format": "plain_text"
  },
  "type": "meeting",
  "category": "business_review",
  "tags": ["qbr", "q3-2025", "satisfied"],
  "priority": "normal",
  "interaction": {
    "type": "in-person",
    "date": "2025-10-13T14:00:00.000Z",
    "duration": 90,
    "participants": ["507f1f77bcf86cd799439012"]
  },
  "tasks": [
    {
      "description": "Send Q4 proposal",
      "assignedTo": "507f1f77bcf86cd799439011",
      "dueDate": "2025-10-20T17:00:00.000Z",
      "priority": "high"
    }
  ]
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Note created successfully",
  "data": {
    "note": {
      "_id": "68ed6ca5212843ed4b5d5100",
      "noteId": "NOTE-QBR30971ABC",
      "clientId": "68ed6ca5212843ed4b5d4801",
      "content": {
        "title": "Quarterly Business Review Meeting",
        "wordCount": 25,
        "sentiment": {
          "score": 0.8,
          "category": "positive"
        }
      },
      "type": "meeting",
      "tasks": [
        {
          "description": "Send Q4 proposal",
          "status": "pending"
        }
      ],
      "createdAt": "2025-10-13T22:30:00.000Z"
    }
  }
}
```

### Get Notes by Client

Retrieves all notes for a specific client with filtering options.

**Endpoint:** `GET /clients/:clientId/notes`  
**Permission:** `notes:read`  
**Rate Limit:** 100 requests per minute

**Path Parameters:**

- `clientId` (required): Client ObjectId

**Query Parameters:**

- `type` (optional): Filter by note type
- `category` (optional): Filter by category
- `tags` (optional): Comma-separated list of tags
- `priority` (optional): Filter by priority
- `startDate` (optional): Filter by date range start
- `endDate` (optional): Filter by date range end
- `page` (optional): Page number
- `limit` (optional): Results per page
- `sort` (optional): Sort field (default: "createdAt:-1")

**Example Request:**

```http
GET /clients/68ed6ca5212843ed4b5d4801/notes?type=meeting&page=1&limit=10
Authorization: Bearer {access_token}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "notes": [
      {
        "_id": "68ed6ca5212843ed4b5d5100",
        "noteId": "NOTE-QBR30971ABC",
        "content": {
          "title": "Quarterly Business Review Meeting",
          "summary": "Discussed Q3 performance and budget planning"
        },
        "type": "meeting",
        "createdAt": "2025-10-13T22:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalResults": 1
    }
  }
}
```

### Update Note

Updates an existing note with version tracking.

**Endpoint:** `PATCH /notes/:id`  
**Permission:** `notes:update`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Note ObjectId

**Request Body:**

```json
{
  "content": {
    "body": "Updated content with additional information about budget approval."
  },
  "tags": ["qbr", "q3-2025", "satisfied", "approved"]
}
```

**Response:** `200 OK`

### Add Comment to Note

Adds a comment to an existing note for collaboration.

**Endpoint:** `POST /notes/:id/comments`  
**Permission:** `notes:update`  
**Rate Limit:** 50 requests per minute

**Path Parameters:**

- `id` (required): Note ObjectId

**Request Body:**

```json
{
  "text": "Great meeting! The client seems very positive about our services.",
  "mentions": ["507f1f77bcf86cd799439012"]
}
```

**Response:** `201 Created`

---

## Response Formats

### Success Response

All successful API responses follow this structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response payload
  },
  "meta": {
    // Optional metadata
  }
}
```

### Error Response

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details
    },
    "timestamp": "2025-10-13T23:00:00.000Z"
  }
}
```

---

## Error Handling

### HTTP Status Codes

- **200 OK:** Successful request
- **201 Created:** Resource created successfully
- **204 No Content:** Successful deletion
- **400 Bad Request:** Invalid request data
- **401 Unauthorized:** Missing or invalid authentication
- **403 Forbidden:** Insufficient permissions
- **404 Not Found:** Resource does not exist
- **409 Conflict:** Resource already exists
- **422 Unprocessable Entity:** Validation error
- **429 Too Many Requests:** Rate limit exceeded
- **500 Internal Server Error:** Server error
- **503 Service Unavailable:** Service temporarily unavailable

### Error Codes

- `AUTH_TOKEN_MISSING`: No authentication token provided
- `AUTH_TOKEN_INVALID`: Invalid or expired token
- `AUTH_TOKEN_REVOKED`: Token has been revoked
- `PERMISSION_DENIED`: Insufficient permissions for operation
- `RESOURCE_NOT_FOUND`: Requested resource does not exist
- `RESOURCE_ALREADY_EXISTS`: Resource with same identifier exists
- `VALIDATION_ERROR`: Input validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Unexpected server error

### Example Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": {
      "errors": [
        {
          "field": "companyName",
          "message": "Company name is required"
        },
        {
          "field": "contacts.primary.email",
          "message": "Invalid email format"
        }
      ]
    },
    "timestamp": "2025-10-13T23:00:00.000Z"
  }
}
```

---

## Rate Limiting

Rate limits are applied per user per endpoint to prevent abuse. Limits vary by endpoint sensitivity:

**Read Operations:** 100 requests per minute  
**Write Operations:** 50 requests per minute  
**Bulk Operations:** 10 requests per minute  
**Export Operations:** 10 requests per minute

### Rate Limit Headers

All responses include rate limit information in headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1697239200
```

### Rate Limit Exceeded Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds.",
    "details": {
      "limit": 100,
      "resetAt": "2025-10-13T23:01:00.000Z"
    }
  }
}
```

---

## Pagination

List endpoints support pagination using page and limit parameters.

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

**Response Structure:**

```json
{
  "success": true,
  "data": {
    "clients": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "totalResults": 95,
      "hasMore": true,
      "hasPrevious": false
    }
  }
}
```

---

## Additional Resources

For more information, see:
- [Technical Documentation](../technical/client-management-system.md)
- [Operations Guide](../operations/deployment-monitoring.md)
- [Database Architecture](../database/client-database-architecture.md)

---

**Document Version:** 1.0.0  
**Last Updated:** October 13, 2025  
**Maintained By:** Platform API Team