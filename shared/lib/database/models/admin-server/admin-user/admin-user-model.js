/**
 * @fileoverview Admin User Model
 * @module shared/lib/database/models/admin-server/admin-user
 * @description Mongoose model for administrative users with enterprise-grade security features
 *              including MFA, session management, IP whitelisting, and comprehensive audit trails.
 *              This model is separate from regular users and provides elevated access control.
 * @version 1.0.0
 * @requires mongoose
 * @requires bcryptjs
 * @requires validator
 * @requires crypto
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const validator = require('validator');

/**
 * @constant {number} BCRYPT_SALT_ROUNDS - Number of salt rounds for password hashing
 * Higher values = more secure but slower. 12 is enterprise standard.
 */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * @constant {number} MAX_LOGIN_ATTEMPTS - Maximum failed login attempts before account lockout
 */
const MAX_LOGIN_ATTEMPTS = 5;

/**
 * @constant {number} LOCK_TIME - Account lockout duration in milliseconds (2 hours)
 */
const LOCK_TIME = 2 * 60 * 60 * 1000;

/**
 * @constant {number} PASSWORD_EXPIRY_DAYS - Days until password must be changed
 */
const PASSWORD_EXPIRY_DAYS = 90;

/**
 * @constant {number} SESSION_EXPIRY_HOURS - Default session expiry in hours
 */
const SESSION_EXPIRY_HOURS = 24;

/**
 * Admin User Schema
 * @typedef {Object} AdminUserSchema
 * @description Comprehensive schema for administrative users with security-first design
 */
const adminUserSchema = new mongoose.Schema(
  {
    // ============================================================================
    // Basic Identity Fields
    // ============================================================================

    /**
     * @property {string} email - Admin user's email address (unique identifier)
     * @required
     * @unique
     * @lowercase
     * @index
     */
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (email) => validator.isEmail(email),
        message: 'Invalid email address format'
      }
    },

    /**
     * @property {string} firstName - Admin user's first name
     * @required
     */
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters'],
      maxlength: [50, 'First name cannot exceed 50 characters']
    },

    /**
     * @property {string} lastName - Admin user's last name
     * @required
     */
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters'],
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },

    /**
     * @property {string} phoneNumber - Admin user's phone number (optional)
     * @optional
     */
    phoneNumber: {
      type: String,
      trim: true,
      sparse: true,
      validate: {
        validator: function(phone) {
          return !phone || validator.isMobilePhone(phone, 'any');
        },
        message: 'Invalid phone number format'
      }
    },

    // ============================================================================
    // Authentication & Security Fields
    // ============================================================================

    /**
     * @property {string} passwordHash - Bcrypt hashed password
     * @required
     * @private - Never send to client
     */
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false // Exclude from queries by default for security
    },

    /**
     * @property {Date} lastPasswordChange - Timestamp of last password change
     * @description Used for enforcing password rotation policies
     */
    lastPasswordChange: {
      type: Date,
      default: Date.now
    },

    /**
     * @property {Array<string>} passwordHistory - Array of previous password hashes
     * @description Prevents password reuse (store last 5 passwords)
     * @private
     */
    passwordHistory: {
      type: [String],
      default: [],
      select: false,
      validate: {
        validator: function(history) {
          return history.length <= 5;
        },
        message: 'Password history cannot exceed 5 entries'
      }
    },

    /**
     * @property {boolean} mustChangePassword - Flag requiring password change on next login
     * @description Set to true for new users or after admin password reset
     */
    mustChangePassword: {
      type: Boolean,
      default: false
    },

    // ============================================================================
    // Multi-Factor Authentication (MFA) Fields
    // ============================================================================

    /**
     * @property {boolean} mfaEnabled - Whether MFA is enabled for this admin
     * @required - Should be true for production environments
     */
    mfaEnabled: {
      type: Boolean,
      default: false,
      required: true
    },

    /**
     * @property {string} mfaSecret - TOTP secret for MFA (base32 encoded)
     * @private
     * @description Used with Google Authenticator or similar TOTP apps
     */
    mfaSecret: {
      type: String,
      select: false
    },

    /**
     * @property {Array<string>} backupCodes - One-time use backup codes for MFA recovery
     * @private
     * @description Each code is hashed and can only be used once
     */
    backupCodes: {
      type: [String],
      default: [],
      select: false,
      validate: {
        validator: function(codes) {
          return codes.length <= 10;
        },
        message: 'Cannot have more than 10 backup codes'
      }
    },

    /**
     * @property {Date} mfaEnabledAt - Timestamp when MFA was first enabled
     */
    mfaEnabledAt: {
      type: Date
    },

    // ============================================================================
    // Authorization & Access Control Fields
    // ============================================================================

    /**
     * @property {string} role - Primary role of the admin user
     * @required
     * @enum {string} - superadmin, admin, support, analyst, viewer
     * @index
     */
    role: {
      type: String,
      required: [true, 'Admin role is required'],
      enum: {
        values: ['superadmin', 'admin', 'support', 'analyst', 'viewer'],
        message: '{VALUE} is not a valid admin role'
      },
      default: 'viewer',
      index: true
    },

    /**
     * @property {Array<mongoose.Schema.Types.ObjectId>} roles - Reference to AdminRole documents
     * @description For complex RBAC scenarios with multiple role assignments
     */
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminRole'
    }],

    /**
     * @property {Array<string>} permissions - Direct permission assignments
     * @description Granular permissions that override role-based permissions
     * @example ['users:read', 'users:write', 'billing:admin', 'system:config']
     */
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function(perms) {
          // Validate permission format: resource:action
          return perms.every(perm => /^[a-z-]+:[a-z-]+$/i.test(perm));
        },
        message: 'Invalid permission format. Use resource:action (e.g., users:read)'
      }
    },

    /**
     * @property {string} department - Department or team the admin belongs to
     * @optional
     */
    department: {
      type: String,
      trim: true,
      enum: {
        values: [
          'executive',
          'engineering',
          'operations',
          'support',
          'finance',
          'marketing',
          'sales',
          'security',
          'compliance'
        ],
        message: '{VALUE} is not a valid department'
      }
    },

    // ============================================================================
    // IP Whitelisting & Network Security
    // ============================================================================

    /**
     * @property {Array<string>} ipWhitelist - Allowed IP addresses/ranges for this admin
     * @description If populated, admin can only access from these IPs
     * @example ['192.168.1.100', '10.0.0.0/24', '2001:db8::/32']
     */
    ipWhitelist: {
      type: [String],
      default: [],
      validate: {
        validator: function(ips) {
          return ips.every(ip => validator.isIP(ip) || /^[\d.]+\/\d+$/.test(ip));
        },
        message: 'Invalid IP address or CIDR range in whitelist'
      }
    },

    /**
     * @property {Array<string>} allowedOrigins - Allowed CORS origins for this admin
     * @description Restricts which domains can make requests on behalf of this admin
     */
    allowedOrigins: {
      type: [String],
      default: []
    },

    // ============================================================================
    // Session Management Fields
    // ============================================================================

    /**
     * @property {Array<Object>} activeSessions - Currently active sessions for this admin
     * @description Tracks all active login sessions with device/location info
     */
    activeSessions: [{
      sessionId: {
        type: String,
        required: true,
        unique: true
      },
      tokenHash: {
        type: String,
        required: true
      },
      ipAddress: {
        type: String,
        required: true
      },
      userAgent: {
        type: String,
        required: true
      },
      deviceInfo: {
        type: String
      },
      location: {
        country: String,
        city: String,
        timezone: String
      },
      createdAt: {
        type: Date,
        default: Date.now,
        required: true
      },
      lastActivity: {
        type: Date,
        default: Date.now,
        required: true
      },
      expiresAt: {
        type: Date,
        required: true
      },
      isMfaVerified: {
        type: Boolean,
        default: false
      }
    }],

    /**
     * @property {number} maxConcurrentSessions - Maximum allowed concurrent sessions
     * @description Limits how many devices can be logged in simultaneously
     */
    maxConcurrentSessions: {
      type: Number,
      default: 3,
      min: [1, 'Must allow at least 1 concurrent session'],
      max: [10, 'Cannot exceed 10 concurrent sessions']
    },

    // ============================================================================
    // Security Tracking & Account Protection
    // ============================================================================

    /**
     * @property {Date} lastLogin - Timestamp of last successful login
     * @index
     */
    lastLogin: {
      type: Date,
      index: true
    },

    /**
     * @property {string} lastLoginIp - IP address of last successful login
     */
    lastLoginIp: {
      type: String
    },

    /**
     * @property {number} failedLoginAttempts - Count of consecutive failed login attempts
     * @description Resets to 0 on successful login
     */
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },

    /**
     * @property {Date} lockedUntil - Timestamp until which account is locked
     * @description Account is locked after MAX_LOGIN_ATTEMPTS failed attempts
     */
    lockedUntil: {
      type: Date
    },

    /**
     * @property {Array<Object>} loginHistory - Historical record of login attempts
     * @description Keeps last 50 login attempts for security analysis
     */
    loginHistory: {
      type: [{
        timestamp: {
          type: Date,
          default: Date.now
        },
        ipAddress: String,
        userAgent: String,
        success: Boolean,
        failureReason: String,
        mfaUsed: Boolean,
        location: {
          country: String,
          city: String
        }
      }],
      default: [],
      validate: {
        validator: function(history) {
          return history.length <= 50;
        },
        message: 'Login history cannot exceed 50 entries'
      }
    },

    // ============================================================================
    // API Access & Programmatic Authentication
    // ============================================================================

    /**
     * @property {Array<mongoose.Schema.Types.ObjectId>} apiKeys - Reference to AdminAPIKey documents
     * @description API keys for programmatic access to admin endpoints
     */
    apiKeys: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminAPIKey'
    }],

    // ============================================================================
    // Account Status & Lifecycle Management
    // ============================================================================

    /**
     * @property {boolean} isActive - Whether the admin account is active
     * @required
     * @index
     * @description Soft delete - inactive accounts cannot log in
     */
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true
    },

    /**
     * @property {boolean} isEmailVerified - Whether email address has been verified
     * @required
     */
    isEmailVerified: {
      type: Boolean,
      default: false,
      required: true
    },

    /**
     * @property {string} emailVerificationToken - Token for email verification
     * @private
     */
    emailVerificationToken: {
      type: String,
      select: false
    },

    /**
     * @property {Date} emailVerificationExpires - Expiry time for email verification token
     */
    emailVerificationExpires: {
      type: Date
    },

    /**
     * @property {Date} suspendedAt - Timestamp when account was suspended
     */
    suspendedAt: {
      type: Date
    },

    /**
     * @property {string} suspensionReason - Reason for account suspension
     */
    suspensionReason: {
      type: String,
      trim: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} suspendedBy - Admin who suspended this account
     */
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    // ============================================================================
    // Audit Trail & Compliance
    // ============================================================================

    /**
     * @property {mongoose.Schema.Types.ObjectId} createdBy - Admin who created this account
     * @required
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: function() {
        // First superadmin doesn't need createdBy
        return this.role !== 'superadmin';
      }
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} lastModifiedBy - Admin who last modified this account
     */
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {Date} deletedAt - Soft delete timestamp
     * @description For compliance, we soft delete instead of hard delete
     */
    deletedAt: {
      type: Date,
      index: true
    },

    /**
     * @property {mongoose.Schema.Types.ObjectId} deletedBy - Admin who deleted this account
     */
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser'
    },

    /**
     * @property {Object} metadata - Additional flexible metadata
     * @description For storing custom fields without schema changes
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    /**
     * @property {string} passwordResetToken - Token for password reset
     * @private
     */
    passwordResetToken: {
      type: String,
      select: false
    },

    /**
     * @property {Date} passwordResetExpires - Expiry time for password reset token
     */
    passwordResetExpires: {
      type: Date
    },

    /**
     * @property {Array<string>} securityQuestions - Security questions for account recovery
     * @private
     * @deprecated - Use MFA backup codes instead
     */
    securityQuestions: {
      type: [{
        question: String,
        answerHash: String
      }],
      select: false,
      default: []
    }
  },
  {
    // Schema options
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'admin_users', // Explicit collection name

    // Optimize queries by creating compound indexes
    indexes: [
      { email: 1 },
      { role: 1, isActive: 1 },
      { lastLogin: -1 },
      { deletedAt: 1 }
    ],

    // Enable versioning for audit trail
    versionKey: '__v',

    // Optimize document storage
    minimize: false, // Keep empty objects

    // JSON transformation options
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        // Remove sensitive fields when converting to JSON
        delete ret.passwordHash;
        delete ret.passwordHistory;
        delete ret.mfaSecret;
        delete ret.backupCodes;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        delete ret.securityQuestions;
        delete ret.__v;
        return ret;
      }
    },

    toObject: {
      virtuals: true
    }
  }
);

// ============================================================================
// Virtual Properties
// ============================================================================

/**
 * Virtual: fullName
 * @returns {string} Full name of admin user
 */
adminUserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

/**
 * Virtual: isLocked
 * @returns {boolean} Whether account is currently locked
 */
adminUserSchema.virtual('isLocked').get(function() {
  return !!(this.lockedUntil && this.lockedUntil > Date.now());
});

/**
 * Virtual: isPasswordExpired
 * @returns {boolean} Whether password has expired
 */
adminUserSchema.virtual('isPasswordExpired').get(function() {
  if (!this.lastPasswordChange) return false;
  const expiryDate = new Date(this.lastPasswordChange);
  expiryDate.setDate(expiryDate.getDate() + PASSWORD_EXPIRY_DAYS);
  return Date.now() > expiryDate;
});

/**
 * Virtual: isDeleted
 * @returns {boolean} Whether account is soft deleted
 */
adminUserSchema.virtual('isDeleted').get(function() {
  return !!this.deletedAt;
});

/**
 * Virtual: activeSessionCount
 * @returns {number} Number of active sessions
 */
adminUserSchema.virtual('activeSessionCount').get(function() {
  const now = Date.now();
  return this.activeSessions.filter(session => new Date(session.expiresAt) > now).length;
});

// ============================================================================
// Indexes for Performance Optimization
// ============================================================================

// Compound index for authentication queries
adminUserSchema.index({ email: 1, isActive: 1, deletedAt: 1 });

// Index for session management queries
adminUserSchema.index({ 'activeSessions.sessionId': 1 });

// Index for security auditing
adminUserSchema.index({ role: 1, department: 1 });

// TTL index for automatic cleanup of locked accounts (optional)
// adminUserSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0, sparse: true });

// ============================================================================
// Pre-Save Middleware Hooks
// ============================================================================

/**
 * Pre-save hook: Hash password if modified
 * @description Automatically hashes password before saving to database
 */
adminUserSchema.pre('save', async function(next) {
  try {
    // Only hash password if it has been modified (or is new)
    if (!this.isModified('passwordHash')) return next();

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);

    // Update password change timestamp
    if (!this.isNew) {
      this.lastPasswordChange = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Pre-save hook: Trim login history
 * @description Keeps only last 50 login attempts
 */
adminUserSchema.pre('save', function(next) {
  if (this.loginHistory && this.loginHistory.length > 50) {
    // Keep only the most recent 50 entries
    this.loginHistory = this.loginHistory.slice(-50);
  }
  next();
});

/**
 * Pre-save hook: Validate session limits
 * @description Ensures active sessions don't exceed max allowed
 */
adminUserSchema.pre('save', function(next) {
  const now = Date.now();

  // Filter out expired sessions
  this.activeSessions = this.activeSessions.filter(
    session => new Date(session.expiresAt) > now
  );

  // If still over limit, remove oldest sessions
  if (this.activeSessions.length > this.maxConcurrentSessions) {
    this.activeSessions.sort((a, b) => a.createdAt - b.createdAt);
    this.activeSessions = this.activeSessions.slice(-this.maxConcurrentSessions);
  }

  next();
});

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Compare provided password with stored hash
 * @param {string} candidatePassword - Plain text password to verify
 * @returns {Promise<boolean>} True if password matches
 * @async
 */
adminUserSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Load passwordHash if not selected
    if (!this.passwordHash) {
      const user = await this.constructor.findById(this._id).select('+passwordHash');
      return bcrypt.compare(candidatePassword, user.passwordHash);
    }
    return bcrypt.compare(candidatePassword, this.passwordHash);
  } catch (error) {
    throw new Error(`Password comparison failed: ${error.message}`);
  }
};

/**
 * Check if password has been used before
 * @param {string} password - Plain text password to check
 * @returns {Promise<boolean>} True if password was used before
 * @async
 */
adminUserSchema.methods.isPasswordInHistory = async function(password) {
  try {
    const user = await this.constructor.findById(this._id).select('+passwordHistory');
    if (!user.passwordHistory || user.passwordHistory.length === 0) return false;

    // Check against all historical passwords
    for (const oldHash of user.passwordHistory) {
      const isMatch = await bcrypt.compare(password, oldHash);
      if (isMatch) return true;
    }
    return false;
  } catch (error) {
    throw new Error(`Password history check failed: ${error.message}`);
  }
};

/**
 * Increment failed login attempts and lock account if necessary
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.incLoginAttempts = async function() {
  // If account is locked and lock time has passed, reset attempts
  if (this.lockedUntil && this.lockedUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockedUntil: 1 }
    });
  }

  // Otherwise, increment attempts
  const updates = { $inc: { failedLoginAttempts: 1 } };

  // Lock account if max attempts reached
  if (this.failedLoginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockedUntil: Date.now() + LOCK_TIME };
  }

  return this.updateOne(updates);
};

/**
 * Reset failed login attempts on successful login
 * @param {string} ipAddress - IP address of successful login
 * @param {string} userAgent - User agent string
 * @param {Object} location - Geographic location data
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.resetLoginAttempts = async function(ipAddress, userAgent, location = {}) {
  // Add to login history
  const loginEntry = {
    timestamp: new Date(),
    ipAddress,
    userAgent,
    success: true,
    mfaUsed: this.mfaEnabled,
    location
  };

  return this.updateOne({
    $set: {
      failedLoginAttempts: 0,
      lastLogin: Date.now(),
      lastLoginIp: ipAddress
    },
    $unset: { lockedUntil: 1 },
    $push: {
      loginHistory: {
        $each: [loginEntry],
        $slice: -50 // Keep only last 50 entries
      }
    }
  });
};

/**
 * Add failed login attempt to history
 * @param {string} ipAddress - IP address of failed login
 * @param {string} userAgent - User agent string
 * @param {string} failureReason - Reason for failure
 * @param {Object} location - Geographic location data
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.recordFailedLogin = async function(ipAddress, userAgent, failureReason, location = {}) {
  const loginEntry = {
    timestamp: new Date(),
    ipAddress,
    userAgent,
    success: false,
    failureReason,
    mfaUsed: false,
    location
  };

  return this.updateOne({
    $push: {
      loginHistory: {
        $each: [loginEntry],
        $slice: -50
      }
    }
  });
};

/**
 * Create a new session for this admin user
 * @param {string} sessionId - Unique session identifier
 * @param {string} tokenHash - Hashed JWT token
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @param {Object} options - Additional session options
 * @returns {Promise<Object>} Created session object
 * @async
 */
adminUserSchema.methods.createSession = async function(sessionId, tokenHash, ipAddress, userAgent, options = {}) {
  const expiresAt = new Date(Date.now() + (SESSION_EXPIRY_HOURS * 60 * 60 * 1000));

  const session = {
    sessionId,
    tokenHash,
    ipAddress,
    userAgent,
    deviceInfo: options.deviceInfo || null,
    location: options.location || null,
    createdAt: new Date(),
    lastActivity: new Date(),
    expiresAt,
    isMfaVerified: options.isMfaVerified || false
  };

  // Remove expired sessions first
  this.activeSessions = this.activeSessions.filter(s => new Date(s.expiresAt) > Date.now());

  // Check if we're at max sessions
  if (this.activeSessions.length >= this.maxConcurrentSessions) {
    // Remove oldest session
    this.activeSessions.sort((a, b) => a.createdAt - b.createdAt);
    this.activeSessions.shift();
  }

  this.activeSessions.push(session);
  await this.save();

  return session;
};

/**
 * Remove a session
 * @param {string} sessionId - Session ID to remove
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.removeSession = async function(sessionId) {
  this.activeSessions = this.activeSessions.filter(s => s.sessionId !== sessionId);
  return this.save();
};

/**
 * Remove all sessions (logout from all devices)
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.removeAllSessions = async function() {
  this.activeSessions = [];
  return this.save();
};

/**
 * Update session activity timestamp
 * @param {string} sessionId - Session ID to update
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.updateSessionActivity = async function(sessionId) {
  const session = this.activeSessions.find(s => s.sessionId === sessionId);
  if (session) {
    session.lastActivity = new Date();
    return this.save();
  }
};

/**
 * Generate password reset token
 * @returns {string} Reset token (plain text, to be sent to user)
 * @description Token is hashed before storage for security
 */
adminUserSchema.methods.createPasswordResetToken = function() {
  // Generate random token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token before storing
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expiry (10 minutes for security)
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  // Return plain token to be sent to user
  return resetToken;
};

/**
 * Generate email verification token
 * @returns {string} Verification token (plain text)
 */
adminUserSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return verificationToken;
};

/**
 * Check if admin has specific permission
 * @param {string} permission - Permission to check (format: resource:action)
 * @returns {boolean} True if admin has permission
 */
adminUserSchema.methods.hasPermission = function(permission) {
  // Superadmin has all permissions
  if (this.role === 'superadmin') return true;

  // Check direct permissions
  return this.permissions.includes(permission);
};

/**
 * Check if admin has any of the specified permissions
 * @param {Array<string>} permissions - Array of permissions to check
 * @returns {boolean} True if admin has at least one permission
 */
adminUserSchema.methods.hasAnyPermission = function(permissions) {
  if (this.role === 'superadmin') return true;
  return permissions.some(perm => this.permissions.includes(perm));
};

/**
 * Check if admin has all of the specified permissions
 * @param {Array<string>} permissions - Array of permissions to check
 * @returns {boolean} True if admin has all permissions
 */
adminUserSchema.methods.hasAllPermissions = function(permissions) {
  if (this.role === 'superadmin') return true;
  return permissions.every(perm => this.permissions.includes(perm));
};

/**
 * Check if IP address is whitelisted
 * @param {string} ipAddress - IP address to check
 * @returns {boolean} True if IP is whitelisted or no whitelist configured
 */
adminUserSchema.methods.isIpWhitelisted = function(ipAddress) {
  // If no whitelist configured, allow all IPs
  if (!this.ipWhitelist || this.ipWhitelist.length === 0) return true;

  // Check if IP is in whitelist (supports CIDR notation)
  return this.ipWhitelist.some(whitelistedIp => {
    // Exact match
    if (whitelistedIp === ipAddress) return true;

    // CIDR range check (simplified - use ipaddr.js for production)
    if (whitelistedIp.includes('/')) {
      // Basic CIDR check - implement proper CIDR matching in production
      const [network] = whitelistedIp.split('/');
      return ipAddress.startsWith(network.split('.').slice(0, 3).join('.'));
    }

    return false;
  });
};

/**
 * Soft delete admin user
 * @param {mongoose.Schema.Types.ObjectId} deletedBy - ID of admin performing deletion
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.softDelete = async function(deletedBy) {
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.isActive = false;
  return this.save();
};

/**
 * Restore soft-deleted admin user
 * @returns {Promise<void>}
 * @async
 */
adminUserSchema.methods.restore = async function() {
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Find admin by email (including inactive)
 * @param {string} email - Email address to search
 * @returns {Promise<Object|null>} Admin user document or null
 * @static
 * @async
 */
adminUserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

/**
 * Find admin by email (active only)
 * @param {string} email - Email address to search
 * @returns {Promise<Object|null>} Admin user document or null
 * @static
 * @async
 */
adminUserSchema.statics.findActiveByEmail = function(email) {
  return this.findOne({
    email: email.toLowerCase(),
    isActive: true,
    deletedAt: null
  });
};

/**
 * Find admin by password reset token
 * @param {string} token - Plain text reset token
 * @returns {Promise<Object|null>} Admin user document or null
 * @static
 * @async
 */
adminUserSchema.statics.findByPasswordResetToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return this.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
    isActive: true
  }).select('+passwordResetToken');
};

/**
 * Find admin by email verification token
 * @param {string} token - Plain text verification token
 * @returns {Promise<Object|null>} Admin user document or null
 * @static
 * @async
 */
adminUserSchema.statics.findByEmailVerificationToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return this.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  }).select('+emailVerificationToken');
};

/**
 * Get all active admins by role
 * @param {string} role - Role to filter by
 * @returns {Promise<Array>} Array of admin users
 * @static
 * @async
 */
adminUserSchema.statics.findByRole = function(role) {
  return this.find({
    role,
    isActive: true,
    deletedAt: null
  }).sort({ lastName: 1, firstName: 1 });
};

/**
 * Get admins with expired passwords
 * @returns {Promise<Array>} Array of admin users with expired passwords
 * @static
 * @async
 */
adminUserSchema.statics.findWithExpiredPasswords = function() {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - PASSWORD_EXPIRY_DAYS);

  return this.find({
    isActive: true,
    deletedAt: null,
    lastPasswordChange: { $lt: expiryDate }
  });
};

/**
 * Clean up expired sessions for all users
 * @returns {Promise<Object>} Update result
 * @static
 * @async
 */
adminUserSchema.statics.cleanupExpiredSessions = async function() {
  const now = new Date();

  return this.updateMany(
    { 'activeSessions.expiresAt': { $lt: now } },
    {
      $pull: {
        activeSessions: { expiresAt: { $lt: now } }
      }
    }
  );
};

/**
 * Get admin statistics
 * @returns {Promise<Object>} Statistics object
 * @static
 * @async
 */
adminUserSchema.statics.getStatistics = async function() {
  const [stats] = await this.aggregate([
    {
      $facet: {
        total: [{ $count: 'count' }],
        active: [
          { $match: { isActive: true, deletedAt: null } },
          { $count: 'count' }
        ],
        byRole: [
          { $match: { isActive: true, deletedAt: null } },
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ],
        withMFA: [
          { $match: { isActive: true, deletedAt: null, mfaEnabled: true } },
          { $count: 'count' }
        ],
        locked: [
          { $match: { lockedUntil: { $gt: new Date() } } },
          { $count: 'count' }
        ]
      }
    }
  ]);

  return {
    total: stats.total[0]?.count || 0,
    active: stats.active[0]?.count || 0,
    byRole: stats.byRole.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {}),
    withMFA: stats.withMFA[0]?.count || 0,
    locked: stats.locked[0]?.count || 0
  };
};

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Query helper: Find only active admins
 */
adminUserSchema.query.active = function() {
  return this.where({ isActive: true, deletedAt: null });
};

/**
 * Query helper: Find only deleted admins
 */
adminUserSchema.query.deleted = function() {
  return this.where({ deletedAt: { $ne: null } });
};

/**
 * Query helper: Find admins with MFA enabled
 */
adminUserSchema.query.withMFA = function() {
  return this.where({ mfaEnabled: true });
};

/**
 * Query helper: Find locked accounts
 */
adminUserSchema.query.locked = function() {
  return this.where({ lockedUntil: { $gt: new Date() } });
};

// ============================================================================
// Model Export - ConnectionManager Compatible
// ============================================================================

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 *
 * IMPORTANT: Do NOT compile the model here with mongoose.model()
 * The ConnectionManager will compile it with the correct database connection
 */
module.exports = {
  schema: adminUserSchema,
  modelName: 'AdminUser'
};
