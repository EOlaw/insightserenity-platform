# Core Directory

## Purpose
Foundational infrastructure and utilities shared across the admin server:
- Database configuration and migrations
- Input validation schemas
- Constants and enumerations
- Utility functions
- Type definitions

## Structure

```
core/
├── database/          # Database infrastructure
│   ├── migrations/   # Database migrations
│   │   ├── 001-create-admin-users.js
│   │   ├── 002-create-admin-roles.js
│   │   └── README.md
│   ├── seeders/      # Database seeders
│   │   ├── admin-roles-seeder.js
│   │   ├── admin-permissions-seeder.js
│   │   └── super-admin-seeder.js
│   ├── connection.js # Database connection management
│   └── README.md
│
├── validators/        # Input validation schemas
│   ├── admin-user-validator.js
│   ├── admin-role-validator.js
│   ├── api-key-validator.js
│   └── README.md
│
├── constants/         # Application constants
│   ├── permissions.js
│   ├── roles.js
│   ├── error-codes.js
│   ├── audit-actions.js
│   └── README.md
│
├── utils/             # Utility functions
│   ├── crypto-utils.js
│   ├── validation-utils.js
│   ├── date-utils.js
│   └── README.md
│
└── README.md
```

## Database

### Migrations
Database schema migrations for version control:

```javascript
// core/database/migrations/001-create-admin-users.js
module.exports = {
  async up(db) {
    // Create collection with validation
    await db.createCollection('admin_users', {
      validator: {
        $jsonSchema: {
          // Schema definition
        }
      }
    });

    // Create indexes
    await db.collection('admin_users').createIndex({ email: 1 }, { unique: true });
  },

  async down(db) {
    await db.collection('admin_users').drop();
  }
};
```

### Seeders
Initial data population:

```javascript
// core/database/seeders/super-admin-seeder.js
const AdminUser = require('../../../../shared/lib/database/models/admin-server/admin-user');
const bcrypt = require('bcryptjs');

module.exports = {
  async seed() {
    const exists = await AdminUser.findOne({ role: 'superadmin' });
    if (exists) return;

    await AdminUser.create({
      email: 'super@insightserenity.com',
      firstName: 'Super',
      lastName: 'Admin',
      passwordHash: await bcrypt.hash('ChangeMe123!', 12),
      role: 'superadmin',
      isActive: true,
      isEmailVerified: true,
      mfaEnabled: false
    });
  }
};
```

## Validators

Input validation using Joi or class-validator:

```javascript
// core/validators/admin-user-validator.js
const Joi = require('joi');

/**
 * Admin User Validation Schemas
 */
class AdminUserValidator {
  /**
   * Validate admin user creation
   */
  static createSchema = Joi.object({
    email: Joi.string().email().required(),
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    password: Joi.string()
      .min(12)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character'
      }),
    role: Joi.string()
      .valid('superadmin', 'admin', 'support', 'analyst', 'viewer')
      .required(),
    department: Joi.string().optional(),
    permissions: Joi.array().items(Joi.string()).optional()
  });

  /**
   * Validate admin user update
   */
  static updateSchema = Joi.object({
    firstName: Joi.string().min(2).max(50),
    lastName: Joi.string().min(2).max(50),
    role: Joi.string().valid('superadmin', 'admin', 'support', 'analyst', 'viewer'),
    department: Joi.string(),
    permissions: Joi.array().items(Joi.string()),
    isActive: Joi.boolean()
  }).min(1); // At least one field required
}

module.exports = AdminUserValidator;
```

## Constants

Centralized constant definitions:

```javascript
// core/constants/permissions.js
/**
 * Admin Permissions Constants
 * @description Centralized permission definitions for RBAC
 */
module.exports = {
  // User Management
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_ADMIN: 'users:admin',

  // Role Management
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',

  // Billing
  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
  BILLING_ADMIN: 'billing:admin',

  // Analytics
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_EXPORT: 'analytics:export',

  // System Configuration
  SYSTEM_READ: 'system:read',
  SYSTEM_WRITE: 'system:write',
  SYSTEM_ADMIN: 'system:admin',

  // Audit
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // Security
  SECURITY_ADMIN: 'security:admin'
};
```

```javascript
// core/constants/roles.js
/**
 * Admin Roles Constants
 */
module.exports = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  SUPPORT: 'support',
  ANALYST: 'analyst',
  VIEWER: 'viewer',

  // Role levels (for hierarchy)
  ROLE_LEVELS: {
    superadmin: 100,
    admin: 80,
    support: 60,
    analyst: 40,
    viewer: 20
  }
};
```

```javascript
// core/constants/audit-actions.js
/**
 * Audit Action Constants
 */
module.exports = {
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_MFA_VERIFY: 'auth.mfa.verify',
  AUTH_PASSWORD_RESET: 'auth.password.reset',

  // User Management
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_SUSPEND: 'user.suspend',
  USER_ACTIVATE: 'user.activate',

  // Role Management
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',

  // Session Management
  SESSION_CREATE: 'session.create',
  SESSION_REVOKE: 'session.revoke',
  SESSION_REVOKE_ALL: 'session.revoke_all',

  // API Key Management
  API_KEY_CREATE: 'api_key.create',
  API_KEY_REVOKE: 'api_key.revoke',

  // System Configuration
  CONFIG_UPDATE: 'config.update',
  INTEGRATION_UPDATE: 'integration.update',

  // Data Operations
  DATA_EXPORT: 'data.export',
  DATA_IMPORT: 'data.import'
};
```

## Utils

Reusable utility functions:

```javascript
// core/utils/crypto-utils.js
const crypto = require('crypto');

/**
 * Cryptography Utility Functions
 */
class CryptoUtils {
  /**
   * Generate secure random string
   * @param {number} length - Length in bytes
   * @returns {string} Hex string
   */
  static generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash string with SHA-256
   * @param {string} data - Data to hash
   * @returns {string} Hashed string
   */
  static hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate HMAC signature
   * @param {string} data - Data to sign
   * @param {string} secret - Secret key
   * @returns {string} HMAC signature
   */
  static generateHMAC(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
}

module.exports = CryptoUtils;
```

## Usage

```javascript
// Import validators
const { AdminUserValidator } = require('./core/validators/admin-user-validator');

// Import constants
const PERMISSIONS = require('./core/constants/permissions');
const ROLES = require('./core/constants/roles');

// Import utils
const CryptoUtils = require('./core/utils/crypto-utils');
```

## Best Practices

1. **Constants**: Define all magic strings and numbers as constants
2. **Validators**: Validate all input at controller level
3. **Utils**: Keep utility functions pure and stateless
4. **Database**: Use migrations for all schema changes
5. **Seeders**: Make seeders idempotent
