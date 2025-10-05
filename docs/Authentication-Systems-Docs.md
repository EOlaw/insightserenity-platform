# Authentication System Documentation

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Database Infrastructure](#database-infrastructure)
- [Token Management](#token-management)
- [Authentication Flow](#authentication-flow)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Security Features](#security-features)
- [Production Deployment](#production-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

---

## Overview

The authentication system provides a production-ready, scalable solution for user authentication and session management. The system implements JWT-based authentication with database-backed token blacklisting, multi-factor authentication support, and comprehensive security features suitable for enterprise deployments.

### Key Features

The system provides stateless JWT authentication combined with stateful token invalidation through a MongoDB-backed blacklist. This approach delivers the performance benefits of JWT tokens while maintaining the security requirement for immediate token revocation upon logout. The authentication service supports multiple user types including clients, consultants, candidates, and partners, with role-based access control and tenant isolation.

Multi-factor authentication capabilities are built into the system, supporting TOTP, SMS, and email-based verification methods. The password management system includes configurable complexity requirements, secure hashing with bcrypt, password history tracking, and automatic token invalidation on password changes.

Session management features include configurable session timeouts, device tracking and trust management, suspicious activity detection, and automatic cleanup of expired sessions. The system maintains comprehensive audit trails for all authentication events, including login attempts, logout actions, password changes, and MFA operations.

### Technology Stack

The authentication system is built on Node.js with Express.js providing the web framework. MongoDB serves as the primary database with Mongoose as the ODM layer. JWT tokens are managed using jsonwebtoken, while bcryptjs handles password hashing. Passport.js with passport-jwt provides the authentication middleware layer.

---

## Architecture

### System Components

The authentication system comprises several interconnected components that work together to provide comprehensive authentication services. The Direct Authentication Service serves as the primary authentication engine, handling user registration, login, logout, and password management operations. This service maintains no state itself, instead delegating persistence to the database layer.

The Database Service Layer provides an abstracted interface to MongoDB connections, managing three separate databases for different data domains. The UserDatabaseService specializes in user-related operations with tenant isolation, while the shared database service handles cross-tenant resources like the token blacklist.

The Authentication Middleware intercepts all protected routes, performing two-step verification that first validates the JWT signature and expiration, then queries the database blacklist to ensure the token has not been revoked. This fail-secure design denies access if either verification step fails.

The Token Blacklist Service maintains a MongoDB collection of invalidated tokens with automatic expiration through TTL indexes. When a user logs out or changes their password, their tokens are added to this blacklist with an expiration date matching the token's natural lifetime. MongoDB automatically removes expired entries from the collection, preventing indefinite growth.

### Database Architecture

The system employs a multi-database architecture that separates concerns and enables horizontal scaling. The Admin Database stores administrative user accounts, system configuration, and platform management data. The Customer Database contains all customer-facing user accounts, profiles, preferences, and settings, with built-in tenant isolation for multi-tenancy support.

The Shared Database houses cross-tenant resources including the token blacklist, shared configuration, and system-wide settings. This separation ensures that token invalidation works consistently across all services and server instances.

Each database connection is managed independently with environment-specific connection pooling, health monitoring, and automatic reconnection logic. The connection manager orchestrates these connections and provides a unified interface for all database operations.

### Authentication Flow Architecture

The authentication flow follows a secure, multi-step process. When a user submits credentials, the system first retrieves the user document from the database, then verifies the password using bcrypt comparison. If multi-factor authentication is enabled, the system generates a temporary token and returns an MFA challenge requiring code verification before issuing permanent tokens.

Upon successful authentication, the system generates two tokens: a short-lived access token for API requests and a long-lived refresh token for obtaining new access tokens. Both tokens are signed JWTs containing the user ID, tenant ID, and token type. The refresh token is stored in an HTTP-only cookie for security.

When a protected route is accessed, the authentication middleware extracts the bearer token from the Authorization header, verifies its signature and expiration using the JWT secret, then queries the blacklist database to confirm the token has not been revoked. Only after both checks pass is the request allowed to proceed.

The logout process immediately adds the access and refresh tokens to the database blacklist with expiration dates matching their natural lifetimes. This ensures that even though the tokens remain cryptographically valid, they cannot be used for authentication. The fail-secure design of the middleware means that if the blacklist database is unavailable, authentication requests are denied rather than potentially allowing revoked tokens through.

---

## Database Infrastructure

### Connection Management

The database system maintains persistent connections to three MongoDB databases, each serving a distinct purpose within the application architecture. Connection pooling is configured based on the deployment environment, with development environments using minimal pools to conserve resources while production environments maintain larger pools to handle concurrent load.

The connection manager implements automatic reconnection with exponential backoff, ensuring that transient network issues do not cause permanent connection failures. Health checks run periodically to detect degraded database performance, with circuit breaker patterns preventing cascading failures when databases become unavailable.

Each connection is monitored for performance metrics including query response times, connection pool utilization, and error rates. These metrics feed into the application's monitoring system, enabling proactive identification of database issues before they impact users.

### Database Service API

The DatabaseService class provides the primary interface for database operations. To obtain a database connection, applications call the getConnection method with the database name as a parameter. This returns a mongoose connection object that can be used for direct database operations.

For model-based operations, the getModel method retrieves a specific Mongoose model by name and database. The system automatically discovers and registers models during initialization, making them available through this unified interface. Model discovery scans the configured directories and registers each model with its appropriate database connection.

Transaction support is provided through the createTransaction method, which accepts an array of database names and a transaction function. This method starts sessions on each specified database, begins transactions on all sessions, executes the provided function, and either commits all transactions on success or aborts all on failure. This ensures atomicity across multiple databases.

### User Database Service

The UserDatabaseService extends the base DatabaseService with user-specific operations that include tenant isolation by default. Every query automatically includes the tenant ID to prevent cross-tenant data access. The findUserById method retrieves a user by their ID and tenant, with optional field selection and population of related documents.

User creation through createUser automatically associates the new user with the specified tenant and sets appropriate default values for account status and security settings. The updateUser method enforces tenant isolation and validates all updates before applying them to the database.

User deletion supports both soft and hard deletion modes. Soft deletion marks the user as deleted and sets a deletion timestamp while preserving the data for potential recovery or audit purposes. Hard deletion permanently removes the user document from the database and should only be used when required by data protection regulations.

The userExists method provides an efficient way to check for existing users without retrieving their full documents. This is particularly useful during registration to prevent duplicate accounts. The findUserByCredentials method retrieves users for authentication purposes, including password and two-factor secret fields that are normally excluded from queries.

### Model Discovery and Registration

The model router automatically discovers all model files in the configured directories during system initialization. Models are identified by file naming patterns including files ending in .model.js or -model.js. The discovery process scans recursively through configured service directories, respecting exclusion patterns to avoid test files and other non-model content.

Each discovered model is associated with its target database based on directory structure. Models in the customer-services directory map to the customer database, models in admin-server map to the admin database, and models in the shared directory map to the shared database. This convention-based routing eliminates the need for explicit configuration while maintaining clear separation of concerns.

Models are registered lazily on first access, improving startup performance for applications that do not use all available models. The registration process instantiates the model with its designated database connection and caches the result for subsequent access. Model instances are shared across the application to maintain consistency and reduce memory overhead.

---

## Token Management

### JWT Token Structure

The system generates two types of JWT tokens for authentication purposes. Access tokens are short-lived credentials used for API authentication, containing the user ID, tenant ID, email address, and token type. These tokens expire after twenty-four hours by default, though this duration is configurable through environment variables.

Refresh tokens are long-lived credentials used exclusively to obtain new access tokens. These contain only the user ID and a type indicator, and expire after thirty days by default. The reduced information in refresh tokens limits the potential impact if a refresh token is compromised. Both token types are signed with the application's JWT secret, ensuring their integrity cannot be compromised without access to the secret key.

Each token includes standard JWT claims including the issued-at timestamp, expiration timestamp, and optionally a unique token identifier. The token identifier enables precise tracking of individual tokens in the blacklist, supporting features like selective token revocation and refresh token rotation.

### Token Blacklist Implementation

The token blacklist is implemented as a MongoDB collection in the shared database, ensuring consistency across all application servers and services. Each blacklist entry contains a cryptographically hashed representation of the token, preventing token exposure even if the database is compromised. The SHA-256 hashing algorithm creates a one-way hash of the token, allowing verification without storage of the actual token value.

Blacklist entries include metadata for audit and troubleshooting purposes. The user ID associates the blacklisted token with its owner, while the tenant ID maintains multi-tenancy boundaries. The reason field documents why the token was blacklisted, supporting values including logout, password change, forced logout, security revocation, and account deletion.

The blacklistedAt timestamp records when the token was added to the blacklist, while the expiresAt timestamp specifies when MongoDB should automatically remove the entry. Additional metadata captures the IP address and user agent of the logout request, along with session and device identifiers when available. This information proves valuable for security investigations and user support.

MongoDB's TTL index on the expiresAt field ensures automatic cleanup of expired blacklist entries. The database monitors this field continuously and removes documents where the expiration time has passed. This prevents indefinite growth of the blacklist collection and eliminates the need for manual cleanup jobs. The index is created with expireAfterSeconds set to zero, meaning documents are removed immediately upon expiration.

### Token Lifecycle

The token lifecycle begins when a user successfully authenticates. The system generates both an access token and a refresh token, returning them to the client in the response body. The refresh token is additionally set as an HTTP-only cookie named refreshToken with the secure and sameSite flags enabled in production environments.

During normal operation, the client includes the access token in the Authorization header of each API request using the Bearer scheme. The authentication middleware validates this token on every protected route, first verifying its cryptographic signature and expiration, then checking the blacklist database to ensure it has not been revoked. If both checks pass, the request proceeds with the user information attached to the request object.

When the access token approaches expiration, the client submits the refresh token to the token refresh endpoint. The system validates the refresh token, checks that it is not blacklisted, retrieves the associated user, and generates a new pair of tokens. Importantly, the old refresh token is immediately added to the blacklist as part of token rotation, preventing its reuse even if it was compromised. This rotation mechanism provides forward security, ensuring that token compromise has limited temporal impact.

The lifecycle concludes when the user logs out, either explicitly or through administrative action. The logout process adds both the access token and refresh token to the blacklist with expiration dates matching their remaining lifetimes. From this moment forward, any attempt to use these tokens will fail the blacklist check in the authentication middleware, effectively terminating the session immediately.

Password changes and other security-sensitive operations trigger wholesale token revocation for the affected user. All active tokens are added to the blacklist simultaneously, forcing re-authentication on all devices. This mechanism ensures that sensitive operations like password changes immediately secure the account across all active sessions.

---

## Authentication Flow

### Registration Process

The registration process begins when a client submits user information to the registration endpoint. The system validates all required fields including email address, password, first name, and last name. Email addresses are validated for correct format and converted to lowercase for consistency. Passwords are validated against configurable complexity requirements including minimum length, character diversity, and common password blacklists.

The system checks for existing users with the submitted email address within the specified tenant. If a user already exists, the registration fails with a conflict error. This check prevents duplicate accounts and maintains email uniqueness as a primary identifier within each tenant.

Upon passing validation, the password is hashed using bcrypt with a configurable work factor. The default work factor of ten provides strong security while maintaining acceptable performance. The resulting hash, not the plaintext password, is stored in the user document along with all other profile information.

The new user document is created with pending status if email verification is required. A verification token is generated and stored with the user record, set to expire after twenty-four hours. The system triggers asynchronous processes to send the welcome email and verification email, though these are non-blocking and do not prevent the registration from completing if they fail.

The registration response includes the complete user profile with sensitive fields removed, authentication tokens for immediate login, and information about required next steps such as email verification. The client receives both access and refresh tokens, enabling immediate authenticated access to the application while the verification process completes asynchronously.

### Login Process

The login process accepts user credentials in the form of email and password. The system retrieves the user document from the database using the provided email and tenant context. If no user is found, the system returns a generic authentication error without revealing whether the email exists, preventing enumeration attacks.

Account status validation occurs before password verification. The system checks for suspended, blocked, or deleted accounts and returns appropriate error messages. Accounts in pending verification status may be allowed to authenticate depending on configuration, though certain features may be restricted until verification completes.

Password verification uses bcrypt's constant-time comparison to prevent timing attacks. If verification fails, the system increments the failed login attempt counter on the user document. After exceeding the configured maximum attempts, the account transitions to locked status for a specified duration, preventing brute force attacks.

Multi-factor authentication introduces an additional verification step when enabled. Upon successful password verification, the system generates a temporary token valid for five minutes and returns it with an MFA challenge indicator. The client must submit this temporary token along with the MFA code to complete authentication. Only after MFA verification succeeds does the system generate the permanent access and refresh tokens.

Successful authentication triggers several side effects. The system records the login event with timestamp, IP address, user agent, and location information when available. Failed login attempt counters are reset. Device fingerprints are stored or updated for device trust management. The session is recorded in the session management system for monitoring and management purposes.

The login response provides the user profile with sensitive fields removed, both authentication tokens, and contextual information including dashboard URL, available features for the user type, and any required actions such as password expiration or security notices.

### Logout Process

The logout process accepts a request from an authenticated user and immediately invalidates their tokens. The authentication middleware ensures the user is authenticated before the logout handler executes, preventing anonymous logout attempts.

The system extracts the access token from the Authorization header and the refresh token from either the request body or the HTTP-only cookie. Both tokens are hashed using SHA-256 to create blacklist entries. The expiration date for each entry is extracted from the token itself, ensuring the blacklist entry expires precisely when the token would have naturally expired.

Blacklist entries are written to the shared database with all available metadata including the user ID, tenant ID, reason code, IP address, user agent, and session identifier. This operation is synchronous and must complete successfully before the logout is considered complete. If the database write fails, the logout is aborted with an error, ensuring the tokens remain valid rather than leaving them in an undefined state.

The response clears the refresh token cookie by setting it with an expired date and the same security flags used during creation. The client receives a success confirmation and should immediately discard both tokens. Any subsequent attempts to use these tokens will fail the blacklist check in the authentication middleware.

The logout-all variant extends this process to invalidate all tokens across all devices for a user. While the current implementation adds the presented tokens to the blacklist, a complete implementation would track all active sessions in a session management system and blacklist all associated tokens. This functionality supports use cases where account compromise is suspected or administrative action requires forced logout.

### Token Refresh Process

Token refresh enables clients to obtain new access tokens without requiring the user to re-authenticate. When an access token approaches expiration, the client submits the refresh token to the refresh endpoint. The system validates the refresh token's signature and expiration using the JWT secret, then checks the blacklist database to ensure the token has not been revoked.

If the refresh token is valid and not blacklisted, the system retrieves the associated user document using the user ID embedded in the token. Account status validation occurs at this point, preventing token refresh for suspended or deleted accounts even if the refresh token remains technically valid.

The system generates a new pair of tokens with fresh expiration times. Critically, the old refresh token is immediately added to the blacklist, implementing token rotation. This security measure ensures that each refresh token can only be used once, significantly limiting the window of vulnerability if a refresh token is compromised.

The response includes both new tokens and optionally the user profile. The new refresh token is set as an HTTP-only cookie, replacing the previous cookie. The client should immediately begin using the new access token for subsequent requests and discard the old tokens.

If refresh token validation fails for any reason including expiration, revocation, or invalid signature, the client receives an authentication error and must re-authenticate using credentials. This maintains security while providing a seamless user experience during normal operation when tokens are refreshed before expiration.

---

## API Reference

### Authentication Endpoints

#### POST /api/v1/auth/register

Registers a new user account in the system. The endpoint accepts user information and credentials, validates them against system requirements, creates the user account, and returns authentication tokens for immediate access.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "profile": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "userType": "client",
  "phoneNumber": "+1234567890"
}
```

**Success Response (201 Created):**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "68de62bd40233429aab785b5",
      "email": "user@example.com",
      "profile": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "accountStatus": {
        "status": "pending"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    },
    "requiresAction": ["VERIFY_EMAIL"]
  }
}
```

**Error Response (409 Conflict):**

```json
{
  "success": false,
  "error": {
    "code": "USER_EXISTS",
    "message": "User already exists with this email"
  }
}
```

**Validation Rules:**

Email must be a valid format and unique within the tenant. Password must be at least eight characters and contain uppercase letters, lowercase letters, numbers, and special characters. First name and last name are required and must be non-empty strings. User type must be one of the supported values: client, consultant, candidate, or partner.

---

#### POST /api/v1/auth/login

Authenticates a user with email and password credentials. Returns authentication tokens upon successful authentication or an MFA challenge if multi-factor authentication is enabled.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "68de62bd40233429aab785b5",
      "email": "user@example.com",
      "profile": {
        "firstName": "John",
        "lastName": "Doe"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    },
    "userType": "client",
    "dashboardUrl": "https://yourplatform.com/client/dashboard"
  }
}
```

**MFA Challenge Response (200 OK):**

```json
{
  "success": true,
  "requiresMFA": true,
  "data": {
    "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "mfaMethods": ["totp", "sms"],
    "challengeId": "a1b2c3d4e5f6"
  }
}
```

**Error Response (401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

The system increments failed login attempts on authentication failure. After five failed attempts, the account is locked for thirty minutes. Suspended or blocked accounts receive a forbidden error regardless of credential validity.

---

#### POST /api/v1/auth/logout

Logs out the current user by invalidating their authentication tokens. Both the access token and refresh token are added to the blacklist, immediately preventing their use for authentication.

**Headers:**

```
Authorization: Bearer {accessToken}
```

**Request Body (Optional):**

```json
{
  "sessionId": "abc123",
  "deviceId": "device-fingerprint"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

The refresh token is cleared from cookies automatically. The client should discard both tokens immediately upon receiving the success response. Any subsequent attempts to use the invalidated tokens will result in authentication errors.

---

#### POST /api/v1/auth/logout-all

Logs out the user from all devices by invalidating all active tokens. This endpoint is useful when account compromise is suspected or when users want to force logout everywhere.

**Headers:**

```
Authorization: Bearer {accessToken}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Logged out from all devices successfully",
  "data": {
    "tokensInvalidated": 3
  }
}
```

The response includes the count of tokens that were invalidated. The current session's tokens are always included in this count.

---

#### GET /api/v1/auth/me

Retrieves the current authenticated user's profile information. This endpoint requires a valid access token that has not been blacklisted.

**Headers:**

```
Authorization: Bearer {accessToken}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "68de62bd40233429aab785b5",
      "email": "user@example.com",
      "profile": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "accountStatus": {
        "status": "active"
      },
      "verification": {
        "email": {
          "verified": true
        }
      }
    }
  }
}
```

**Error Response (401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_REVOKED",
    "message": "Token has been revoked. Please login again."
  }
}
```

This error indicates the token has been blacklisted through logout or password change.

---

#### POST /api/v1/auth/refresh

Obtains new authentication tokens using a valid refresh token. The old refresh token is immediately invalidated and a new one is issued, implementing token rotation for enhanced security.

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

The refresh token can also be provided in the HTTP-only refreshToken cookie.

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    }
  }
}
```

**Error Response (401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_REVOKED",
    "message": "Invalid or expired refresh token"
  }
}
```

Clients should implement automatic token refresh logic that triggers before access token expiration to ensure uninterrupted access.

---

#### POST /api/v1/auth/change-password

Changes the password for the authenticated user. All existing tokens are immediately invalidated, requiring re-authentication on all devices.

**Headers:**

```
Authorization: Bearer {accessToken}
```

**Request Body:**

```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Response (401 Unauthorized):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Current password is incorrect"
  }
}
```

The new password must meet all complexity requirements. Confirmation password must match the new password exactly.

---

#### POST /api/v1/auth/forgot-password

Initiates the password reset process by sending a reset link to the user's email. For security, the endpoint always returns success regardless of whether the email exists.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Password reset instructions sent to your email"
}
```

The reset token expires after one hour. Multiple reset requests invalidate previous tokens.

---

#### POST /api/v1/auth/reset-password

Completes the password reset process using the token from the reset email. All existing tokens are invalidated upon successful reset.

**Request Body:**

```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Error Response (400 Bad Request):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_RESET_TOKEN",
    "message": "Invalid or expired reset token"
  }
}
```

---

#### POST /api/v1/auth/verify-email

Verifies a user's email address using the verification token sent during registration.

**Request Body:**

```json
{
  "token": "verification-token-from-email",
  "email": "user@example.com"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "verified": true,
    "accountStatus": "active"
  }
}
```

Account status transitions from pending to active upon successful verification. Verification tokens expire after twenty-four hours.

---

#### POST /api/v1/auth/resend-verification

Requests a new verification email if the previous one expired or was not received.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Verification email sent successfully"
}
```

The previous verification token is invalidated when a new one is generated.

---

## Configuration

### Environment Variables

The authentication system requires several environment variables for proper operation. These variables control database connections, JWT signing, and operational behavior.

**Required Variables:**

```bash
# JWT Configuration
JWT_SECRET=your-256-bit-secret-key-here

# Database Connections
DATABASE_ADMIN_URI=mongodb+srv://user:pass@cluster.mongodb.net/admin_db
DATABASE_CUSTOMER_URI=mongodb+srv://user:pass@cluster.mongodb.net/customer_db
DATABASE_SHARED_URI=mongodb+srv://user:pass@cluster.mongodb.net/shared_db

# Tenant Configuration
COMPANY_TENANT_ID=your-company-tenant-id
```

**Optional Variables:**

```bash
# Token Expiration
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=30d

# Security Settings
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=1800000
REQUIRE_EMAIL_VERIFICATION=true

# Application URLs
PLATFORM_URL=https://yourplatform.com

# Environment
NODE_ENV=production
LOG_LEVEL=info
```

### JWT Secret Generation

The JWT secret must be a cryptographically random string of sufficient length to prevent brute force attacks. Generate a secure secret using Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Store this secret securely and never commit it to version control. In production environments, use secret management services like AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault.

### Database Configuration

MongoDB connections should use connection strings with authentication credentials and appropriate connection options. For MongoDB Atlas deployments, use the SRV connection string format:

```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

For self-hosted MongoDB instances, use the standard connection string format:

```
mongodb://username:password@host1:27017,host2:27017/database?replicaSet=rs0&authSource=admin
```

Replica sets are strongly recommended for production deployments to ensure high availability and data durability. The authentication system requires replica sets for multi-document transactions.

### Connection Pooling

Connection pool sizes are configured automatically based on the environment. Development environments use minimal pools to conserve resources, while production environments use larger pools to handle concurrent load. Override these defaults through environment variables:

```bash
DB_MAX_POOL_SIZE=200
DB_MIN_POOL_SIZE=10
```

Monitor connection pool utilization through the system metrics endpoints and adjust these values based on actual load patterns.

---

## Security Features

### Password Security

The system implements comprehensive password security measures to protect user credentials. Passwords are hashed using bcrypt with a work factor of ten, providing strong resistance to brute force attacks while maintaining acceptable performance. The work factor can be increased in future versions as computing power increases.

Password complexity requirements are configurable and enforce minimum length, character diversity, and exclusion of common passwords. The default configuration requires eight characters minimum with at least one uppercase letter, one lowercase letter, one number, and one special character. Organizations can strengthen these requirements based on their security policies.

Password history tracking prevents users from reusing recent passwords. The system stores hashes of previous passwords and validates new passwords against this history during password changes. The number of passwords to remember is configurable, with five being the default.

All password-related operations trigger automatic token invalidation. When a user changes their password or completes a password reset, all existing authentication tokens are immediately added to the blacklist. This ensures that password changes secure the account across all devices and sessions.

### Token Security

Authentication tokens employ several security mechanisms to prevent common attacks. Tokens are signed using HMAC-SHA256, ensuring their integrity cannot be compromised without access to the secret key. Any modification to a token's payload invalidates its signature, causing authentication to fail.

Token expiration limits the window of vulnerability if a token is compromised. Access tokens expire after twenty-four hours, requiring periodic refresh. This shorter lifetime reduces risk while maintaining a good user experience. Refresh tokens expire after thirty days, balancing convenience against security.

The blacklist system provides immediate token revocation capability despite the stateless nature of JWTs. When a user logs out or performs security-sensitive operations, their tokens are added to the blacklist with expiration dates matching the tokens' remaining lifetimes. The authentication middleware checks this blacklist on every request, ensuring revoked tokens cannot be used.

Token rotation during refresh operations prevents replay attacks on refresh tokens. Each time a refresh token is used to obtain new access tokens, the old refresh token is immediately blacklisted. This ensures each refresh token can only be used once, significantly limiting the impact of token compromise.

Refresh tokens are transmitted and stored using HTTP-only cookies with the secure and sameSite flags enabled in production. This prevents JavaScript access to the tokens and provides protection against cross-site scripting and cross-site request forgery attacks.

### Multi-Factor Authentication

The system supports multiple MFA methods including time-based one-time passwords, SMS verification, and email verification. When MFA is enabled for an account, successful password authentication returns a temporary token and MFA challenge instead of permanent access tokens.

TOTP implementation follows RFC 6238 standards and is compatible with standard authenticator applications including Google Authenticator, Authy, and Microsoft Authenticator. Secret keys are generated using cryptographically secure random number generation and stored encrypted in the database.

SMS and email MFA methods generate six-digit codes that expire after ten minutes. These codes are hashed before storage and validated using constant-time comparison to prevent timing attacks. Rate limiting prevents brute force attempts on MFA codes.

Backup codes provide account recovery when primary MFA methods are unavailable. Ten backup codes are generated during MFA enrollment, each usable only once. These codes are hashed before storage and automatically removed from the database after use.

### Account Security

Account lockout protects against brute force attacks on passwords. After five failed login attempts, the account is locked for thirty minutes. The failed attempt counter resets upon successful authentication or after the lockout period expires.

Device tracking enables detection of logins from new devices or locations. The system records device fingerprints and IP addresses for each login, comparing them against historical data. Unusual patterns trigger security alerts and may require additional verification.

Suspicious activity detection analyzes login patterns including geographic location changes, impossible travel scenarios, and unusual access times. When suspicious activity is detected, the system logs security events and may require additional authentication factors before granting access.

Session management tracks all active sessions for each user, recording device information, location, and last activity time. Users can view their active sessions and terminate specific sessions remotely. Administrators can force logout for security incidents or policy violations.

### Data Protection

Sensitive data is excluded from query results by default through Mongoose schema configuration. Password hashes, security tokens, and two-factor secrets use the select: false option, requiring explicit inclusion in queries. This prevents accidental exposure of sensitive data.

Audit trails capture all authentication events including login attempts, logout actions, password changes, and MFA operations. These logs include timestamps, IP addresses, user agents, and success or failure status. Audit data is retained according to compliance requirements and can be exported for security analysis.

Input validation and sanitization protect against injection attacks and malicious data. Email addresses are validated for correct format and normalized to lowercase. User input is validated against whitelists where possible rather than blacklists. Mongoose's built-in validation provides additional protection at the database layer.

Transport security requires HTTPS in production environments through strict transport security headers and secure cookie flags. All authentication endpoints should only be accessible over encrypted connections to prevent credential interception.

---

## Production Deployment

### Infrastructure Requirements

The authentication system requires a MongoDB cluster with replica set configuration for production deployments. Replica sets provide high availability through automatic failover and data redundancy through replication. Configure at least three nodes in the replica set for proper quorum.

Application servers should be deployed behind a load balancer with session affinity disabled. The stateless nature of JWT authentication combined with database-backed blacklisting enables requests to be distributed across any available server. Health check endpoints should be configured on the load balancer to detect and route around failed servers.

Redis or similar caching layer can improve performance by caching frequently accessed data including user profiles and authentication configuration. The blacklist check remains a database query to ensure consistency, but other read operations benefit from caching.

### Database Indexes

The TokenBlacklist collection requires specific indexes for optimal performance. The primary index on tokenHash with unique constraint enables fast lookups during authentication. The TTL index on expiresAt with expireAfterSeconds set to zero enables automatic cleanup of expired tokens.

Compound indexes support common query patterns including user-based lookups and tenant-based analytics. Create indexes on userId with blacklistedAt descending, and on tenantId with blacklistedAt descending. These indexes accelerate queries for user activity history and tenant statistics.

The User collection requires indexes on email and tenantId for authentication queries. Create a compound unique index on these fields to enforce email uniqueness within tenants while enabling efficient lookups. Additional indexes on accountStatus and verification status support common filtering operations.

### Monitoring and Alerting

Monitor authentication metrics including login success rates, average response times, token blacklist size, and database connection pool utilization. Establish baseline metrics during normal operation and configure alerts for significant deviations.

Database health monitoring should track query response times, connection pool exhaustion, replica set status, and disk utilization. Configure alerts for slow queries exceeding one second, connection pool utilization above eighty percent, and replica set member failures.

Application error rates should be monitored with alerts for sudden increases. Track authentication errors separately from other application errors to identify potential security issues or infrastructure problems. Log aggregation tools should be configured to detect patterns in failed authentication attempts.

Token blacklist growth should be monitored to ensure TTL indexes are functioning correctly. The collection size should remain relatively stable, with entries being removed as they expire. Continuous growth indicates a problem with the TTL index configuration.

### Scaling Considerations

Horizontal scaling is achieved by deploying additional application servers behind the load balancer. Each server maintains its own connection pool to the database cluster but shares the same authentication state through the database-backed blacklist. This architecture scales linearly with the number of application servers.

Database scaling follows MongoDB's standard patterns. Vertical scaling increases the resources available to existing database servers, while sharding distributes data across multiple servers for massive scale. The authentication system's tenant-based data model naturally supports sharding by tenant identifier.

The token blacklist grows with user activity but remains manageable through TTL-based automatic cleanup. Each blacklist entry is relatively small, containing only the hashed token and metadata. Monitor collection size and adjust TTL settings or token expiration times if growth exceeds expectations.

Rate limiting should be implemented at the load balancer or API gateway level to protect against abuse. Authentication endpoints are particularly sensitive to rate limiting to prevent brute force attacks. Implement progressive delays on failed login attempts and temporary blocks on excessive failures from specific IP addresses.

### Backup and Recovery

Database backups should occur daily with point-in-time recovery enabled. MongoDB Atlas provides automated backups with configurable retention periods. Self-hosted deployments should implement backup strategies using mongodump or filesystem snapshots on replica set members.

The token blacklist can be excluded from backups as it contains only temporary data that expires naturally. User collections and configuration data require careful backup with appropriate retention policies based on compliance requirements.

Disaster recovery procedures should include documented steps for restoring database backups, reconfiguring application servers with new database endpoints, and validating system functionality after recovery. Regular disaster recovery drills ensure procedures remain current and staff maintain proficiency.

---

## Monitoring and Maintenance

### Health Checks

The system provides health check endpoints that report on database connectivity, authentication service status, and overall system health. These endpoints should be integrated with load balancer health checks and monitoring systems.

The primary health endpoint at /health returns a JSON response indicating overall system status:

```json
{
  "status": "healthy",
  "timestamp": "2025-10-02T11:32:00.000Z",
  "services": {
    "database": "connected",
    "authentication": "operational",
    "tokenBlacklist": "available"
  }
}
```

Individual service health can be queried through specific endpoints. Database health checks verify connectivity to all three databases and report on connection pool status. Authentication service health verifies JWT signing functionality and blacklist accessibility.

### Metrics Collection

The system exposes metrics through /api/metrics in Prometheus format, enabling integration with standard monitoring stacks. Key metrics include authentication request rates, token generation rates, blacklist check durations, and database query performance.

Authentication metrics track login success and failure rates, MFA challenge rates, token refresh rates, and logout rates. These metrics enable detection of unusual patterns that may indicate security incidents or system problems.

Database metrics include connection pool utilization, query response times, and operation counts. Monitor these metrics to identify performance bottlenecks and capacity planning requirements. Connection pool exhaustion indicates insufficient pool size configuration.

Token blacklist metrics track collection size, entry creation rate, and query performance. Monitor blacklist check duration to ensure it remains under acceptable thresholds. Increases in check duration may indicate index problems or collection size issues.

### Log Management

The system generates structured JSON logs for all authentication events, errors, and significant operations. Log aggregation tools can ingest these logs for analysis, alerting, and compliance reporting.

Authentication logs include successful and failed login attempts, logout operations, token refresh operations, and password changes. Each log entry includes user identifier, timestamp, IP address, user agent, and operation result. Failed login attempts include the failure reason without exposing sensitive information.

Error logs capture exceptions and system problems with full stack traces and contextual information. These logs should be monitored for patterns indicating bugs or infrastructure issues. High error rates trigger alerts for immediate investigation.

Audit logs record all security-sensitive operations including account creation, permission changes, MFA configuration, and administrative actions. These logs are retained according to compliance requirements and may be subject to external audit.

### Database Maintenance

Regular maintenance tasks ensure optimal database performance and reliability. Index optimization should occur monthly to rebuild fragmented indexes and update statistics. Monitor index utilization and remove unused indexes to reduce storage overhead.

The token blacklist collection requires no manual maintenance beyond monitoring. TTL indexes automatically remove expired entries, preventing indefinite growth. Verify TTL functionality by monitoring collection size and confirming entries are removed after expiration.

User collection maintenance includes periodic cleanup of soft-deleted accounts after retention periods expire, archival of inactive accounts according to data retention policies, and validation of data integrity. Implement automated jobs for these maintenance tasks with appropriate logging and error handling.

Database backup validation should occur regularly through test restore procedures. Verify that backups can be restored successfully and that restored data passes integrity checks. Document any discrepancies and adjust backup procedures as needed.

### Token Blacklist Maintenance

The token blacklist collection grows during normal operation but should remain stable in size due to automatic cleanup. Monitor the collection size through database metrics and investigate sustained growth that indicates TTL problems.

Verify TTL index functionality by checking that the index exists and is configured correctly:

```javascript
db.token_blacklist.getIndexes()
```

Confirm entries are removed after expiration by monitoring the oldest entry in the collection. The oldest entry should never be significantly older than the longest token expiration period.

If TTL cleanup fails, manual cleanup can be performed through a maintenance job:

```javascript
db.token_blacklist.deleteMany({
  expiresAt: { $lt: new Date() }
})
```

This manual cleanup should rarely be necessary if TTL indexes are functioning correctly.

---

## Troubleshooting

### Authentication Failures

When users report authentication failures, follow a systematic troubleshooting process. First verify the user account exists and is in active status. Check for account lockout due to failed login attempts, suspension by administrators, or pending email verification.

Review recent authentication logs for the affected user to identify patterns. Multiple failed attempts may indicate incorrect credentials or automated attacks. Successful authentication followed by immediate failure may indicate token blacklist issues.

Test authentication directly using API tools to eliminate client-side issues. Verify the request includes correct headers and properly formatted JSON. Check that the password is being transmitted correctly without encoding issues.

For blacklist-related failures, query the token_blacklist collection for entries matching the user ID. Verify the tokenHash corresponds to the token being used. Check the expiration date to confirm the entry should still exist.

### Token Blacklist Issues

If tokens are not being properly blacklisted, verify the TokenBlacklist model is correctly registered and connected to the shared database. Check application logs for errors during logout operations. Verify the database connection to the shared database is functioning.

If blacklist checks fail to detect blacklisted tokens, verify the token hashing algorithm matches between logout and authentication. The same token must produce identical hashes for the blacklist to function. Check that the SHA-256 algorithm is being used consistently.

If tokens are being blacklisted but not cleaned up, verify the TTL index exists and is configured correctly. Check MongoDB logs for TTL-related errors. Verify the expiresAt field contains valid date values and is not in the past at the time of insertion.

For performance issues with blacklist checks, examine the database query plan to confirm indexes are being used. Verify the tokenHash index exists and is unique. Monitor query execution times and investigate queries exceeding one hundred milliseconds.

### Database Connectivity Problems

Database connection failures prevent all authentication operations. Check MongoDB server status and replica set configuration. Verify network connectivity between application servers and database servers. Check firewall rules and security group configurations.

Connection pool exhaustion manifests as timeout errors on authentication requests. Increase pool size configuration or reduce the number of concurrent requests. Monitor connection pool metrics to identify usage patterns and capacity requirements.

Replica set failovers cause temporary authentication failures while the new primary is elected. Configure applications with appropriate retry logic and connection timeout settings. Monitor replica set health to identify underlying infrastructure problems.

Query timeouts indicate performance problems or resource constraints. Enable database profiling to identify slow queries. Add missing indexes, optimize query patterns, or increase database resources as needed.

### MFA Problems

MFA challenge failures require verification of the MFA method configuration. For TOTP, verify the secret key is stored correctly and the user's authenticator application is synchronized. Check that the time window for code acceptance is appropriate.

For SMS and email MFA, verify the delivery mechanism is functioning. Check notification service logs for delivery failures. Verify the user's phone number or email address is correct and accessible.

Backup code failures indicate incorrect code entry or codes that have already been used. Verify the code being submitted matches the format of generated codes. Check the backup codes collection for the user to confirm remaining codes.

If MFA challenges are not being triggered when expected, verify the MFA enabled flag is set correctly on the user account. Check that the MFA methods array contains at least one enabled method. Review authentication flow logs to identify where the MFA branch is being bypassed.

### Performance Degradation

Authentication performance problems often stem from database issues. Monitor query execution times and identify slow queries. Verify indexes exist for common query patterns. Check database server resource utilization including CPU, memory, and disk I/O.

Token blacklist checks add latency to authentication requests. Monitor blacklist check duration and investigate checks exceeding one hundred milliseconds. Verify the tokenHash index exists and is being used by the query optimizer.

Connection pool exhaustion causes authentication to fail or timeout. Monitor pool utilization metrics and increase pool size if consistently above eighty percent. Implement connection pooling at the application level to share connections across requests.

Network latency between application and database servers affects authentication performance. Deploy application servers in the same region as database servers. Use VPC peering or private network connections to reduce latency and improve reliability.

---

## Conclusion

This authentication system provides enterprise-grade security combined with operational excellence. The database-backed token blacklist ensures immediate token revocation while maintaining the performance benefits of stateless JWT authentication. Comprehensive security features including MFA support, password policies, and account lockout protect against common attacks.

The multi-database architecture with tenant isolation enables secure multi-tenancy while maintaining data separation. Automatic token cleanup through TTL indexes prevents indefinite database growth. Extensive monitoring and logging capabilities support operational requirements and compliance obligations.

Production deployment best practices including connection pooling, health checks, and metrics collection ensure reliable operation at scale. The system scales horizontally by adding application servers while maintaining consistent authentication state through the shared blacklist database.

Regular maintenance procedures and comprehensive troubleshooting guidance enable operations teams to maintain the system effectively. The combination of robust security, operational excellence, and clear documentation makes this authentication system suitable for mission-critical enterprise deployments.