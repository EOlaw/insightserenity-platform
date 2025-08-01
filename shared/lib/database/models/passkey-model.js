'use strict';

/**
 * @fileoverview Passkey model for WebAuthn credential management and passwordless authentication
 * @module shared/lib/database/models/passkey-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const validators = require('../../utils/validators/common-validators');
const encryptionService = require('../../security/encryption/encryption-service');
const cryptoHelper = require('../../utils/helpers/crypto-helper');

/**
 * Passkey schema definition for WebAuthn credential management
 */
const passkeySchemaDefinition = {
  // ==================== Core Identity ====================
  passkeyId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      return `pk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  // ==================== WebAuthn Credential Data ====================
  credential: {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    rawId: {
      type: Buffer,
      required: true
    },
    publicKey: {
      type: Buffer,
      required: true,
      select: false
    },
    type: {
      type: String,
      enum: ['public-key'],
      default: 'public-key',
      required: true
    },
    algorithm: {
      type: Number,
      required: true,
      default: -7 // ES256
    },
    signCount: {
      type: Number,
      default: 0,
      min: 0
    },
    transports: [{
      type: String,
      enum: ['usb', 'nfc', 'ble', 'smart-card', 'hybrid', 'internal']
    }],
    backupEligible: {
      type: Boolean,
      default: false
    },
    backupState: {
      type: Boolean,
      default: false
    },
    uvInitialized: {
      type: Boolean,
      default: false
    },
    userPresent: {
      type: Boolean,
      default: true
    },
    userVerified: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Authenticator Information ====================
  authenticator: {
    aaguid: {
      type: String,
      index: true
    },
    name: String,
    displayName: String,
    icon: String,
    attestationType: {
      type: String,
      enum: ['none', 'basic', 'self', 'attca', 'ecdaa'],
      default: 'none'
    },
    attestationFormat: {
      type: String,
      enum: ['packed', 'tpm', 'android-key', 'android-safetynet', 'fido-u2f', 'apple', 'none'],
      default: 'none'
    },
    attestationStatement: {
      type: mongoose.Schema.Types.Mixed,
      select: false
    },
    isMultiDevice: {
      type: Boolean,
      default: false
    },
    cloneWarning: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Device Information ====================
  device: {
    platform: {
      type: String,
      enum: ['windows', 'macos', 'linux', 'android', 'ios', 'chrome_os', 'other'],
      index: true
    },
    browser: {
      name: String,
      version: String,
      userAgent: String
    },
    os: {
      name: String,
      version: String
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'embedded', 'other'],
      index: true
    },
    fingerprint: String,
    ipAddress: String,
    location: {
      country: String,
      region: String,
      city: String,
      timezone: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    }
  },

  // ==================== Registration Data ====================
  registration: {
    challenge: {
      type: String,
      select: false
    },
    origin: {
      type: String,
      required: true
    },
    rpId: {
      type: String,
      required: true,
      index: true
    },
    rpName: String,
    rpIcon: String,
    userHandle: {
      type: Buffer,
      select: false
    },
    registeredAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    registrationMethod: {
      type: String,
      enum: ['cross-platform', 'platform', 'roaming', 'unknown'],
      default: 'unknown'
    },
    requireResidentKey: {
      type: Boolean,
      default: false
    },
    requireUserVerification: {
      type: String,
      enum: ['required', 'preferred', 'discouraged'],
      default: 'preferred'
    }
  },

  // ==================== Status & Security ====================
  status: {
    state: {
      type: String,
      enum: ['active', 'inactive', 'revoked', 'compromised', 'expired', 'suspended'],
      default: 'active',
      index: true
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    lastUsedAt: {
      type: Date,
      index: true
    },
    lastVerifiedAt: Date,
    activatedAt: Date,
    revokedAt: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    revokeReason: {
      type: String,
      enum: ['user_request', 'admin_action', 'security_incident', 'device_lost', 'credential_compromised', 'policy_violation', 'expiration']
    },
    suspendedAt: Date,
    suspensionReason: String
  },

  // ==================== Usage Analytics ====================
  analytics: {
    totalAuthenticationsCount: {
      type: Number,
      default: 0
    },
    successfulAuthenticationsCount: {
      type: Number,
      default: 0
    },
    failedAuthenticationsCount: {
      type: Number,
      default: 0
    },
    lastAuthenticationAt: Date,
    lastSuccessfulAuthenticationAt: Date,
    lastFailedAuthenticationAt: Date,
    averageAuthenticationTime: Number,
    consecutiveFailures: {
      type: Number,
      default: 0
    },
    usagePattern: {
      mostUsedHour: Number,
      mostUsedDay: Number,
      averageUsagePerDay: Number,
      lastActiveWeek: Date
    },
    locationHistory: [{
      country: String,
      region: String,
      city: String,
      ipAddress: String,
      timestamp: Date,
      suspicious: Boolean
    }]
  },

  // ==================== Security Events ====================
  security: {
    signatureFailures: {
      count: {
        type: Number,
        default: 0
      },
      lastFailureAt: Date,
      consecutiveFailures: {
        type: Number,
        default: 0
      }
    },
    cloneDetection: {
      suspected: {
        type: Boolean,
        default: false
      },
      detectedAt: Date,
      details: String,
      resolved: Boolean,
      resolvedAt: Date
    },
    riskFactors: [{
      factor: {
        type: String,
        enum: ['location_change', 'device_change', 'time_anomaly', 'usage_pattern', 'failed_verifications']
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      detectedAt: Date,
      details: String,
      resolved: Boolean
    }],
    quarantine: {
      isQuarantined: {
        type: Boolean,
        default: false
      },
      quarantinedAt: Date,
      quarantineReason: String,
      releaseAt: Date
    }
  },

  // ==================== Backup & Recovery ====================
  backup: {
    isBackupCredential: {
      type: Boolean,
      default: false
    },
    backupEligible: {
      type: Boolean,
      default: false
    },
    primaryCredentialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Passkey'
    },
    backupCredentials: [{
      credentialId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passkey'
      },
      createdAt: Date,
      priority: Number
    }],
    recoveryMethod: {
      type: String,
      enum: ['email', 'sms', 'backup_codes', 'admin_reset', 'none'],
      default: 'none'
    },
    backupCodes: [{
      code: {
        type: String,
        select: false
      },
      usedAt: Date,
      createdAt: Date
    }]
  },

  // ==================== Policy Compliance ====================
  policy: {
    requiresUserVerification: {
      type: Boolean,
      default: true
    },
    allowCrossPlatform: {
      type: Boolean,
      default: true
    },
    allowPlatform: {
      type: Boolean,
      default: true
    },
    maxAge: {
      type: Number,
      default: 31536000000 // 1 year in milliseconds
    },
    allowedOrigins: [String],
    blockedOrigins: [String],
    complianceLevel: {
      type: String,
      enum: ['basic', 'enhanced', 'high_security', 'government'],
      default: 'basic'
    },
    certificationLevel: {
      type: String,
      enum: ['none', 'fido2_l1', 'fido2_l2', 'fido2_l3', 'common_criteria'],
      default: 'none'
    }
  },

  // ==================== Integration Data ====================
  integration: {
    source: {
      type: String,
      enum: ['direct_registration', 'account_recovery', 'admin_provision', 'migration', 'api_import'],
      default: 'direct_registration'
    },
    externalId: String,
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed', 'disabled'],
      default: 'synced'
    },
    lastSyncAt: Date,
    syncErrors: [{
      error: String,
      timestamp: Date,
      resolved: Boolean
    }],
    linkedAccounts: [{
      provider: String,
      accountId: String,
      linkedAt: Date,
      active: Boolean
    }]
  },

  // ==================== Audit Trail ====================
  auditTrail: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    actions: [{
      action: {
        type: String,
        enum: ['created', 'updated', 'activated', 'deactivated', 'revoked', 'suspended', 'verified', 'authentication_success', 'authentication_failure', 'policy_updated']
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: {
        type: Date,
        default: Date.now
      },
      ipAddress: String,
      userAgent: String,
      details: mongoose.Schema.Types.Mixed,
      correlationId: String
    }],
    dataChanges: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      changedAt: Date,
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    nickname: {
      type: String,
      maxlength: 100
    },
    description: String,
    tags: [String],
    category: {
      type: String,
      enum: ['primary', 'backup', 'recovery', 'temporary', 'testing'],
      default: 'primary'
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    notes: [{
      content: String,
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      category: {
        type: String,
        enum: ['general', 'security', 'technical', 'compliance']
      },
      internal: {
        type: Boolean,
        default: true
      }
    }],
    labels: {
      type: Map,
      of: String
    }
  },

  // ==================== Error Handling ====================
  errors: {
    lastError: {
      code: String,
      message: String,
      type: {
        type: String,
        enum: ['authentication_error', 'verification_error', 'signature_error', 'policy_error', 'network_error', 'device_error', 'user_error']
      },
      occurredAt: Date,
      details: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      },
      resolved: Boolean,
      resolvedAt: Date
    },
    errorHistory: [{
      code: String,
      message: String,
      type: String,
      occurredAt: Date,
      count: {
        type: Number,
        default: 1
      },
      lastOccurredAt: Date,
      resolved: Boolean,
      resolvedAt: Date
    }],
    debugInfo: {
      lastChallenge: {
        type: String,
        select: false
      },
      lastAssertionResponse: {
        type: mongoose.Schema.Types.Mixed,
        select: false
      },
      clientDataJSON: {
        type: String,
        select: false
      }
    }
  }
};

// Create schema with options
const passkeySchema = BaseModel.createSchema(passkeySchemaDefinition, {
  collection: 'passkeys',
  timestamps: true,
  suppressReservedKeysWarning: true
});

// ==================== Indexes ====================
passkeySchema.index({ userId: 1, 'status.state': 1 });
passkeySchema.index({ organizationId: 1, 'status.state': 1 });
passkeySchema.index({ tenantId: 1, 'status.state': 1 });
passkeySchema.index({ 'credential.id': 1 }, { unique: true });
passkeySchema.index({ 'authenticator.aaguid': 1 });
passkeySchema.index({ 'registration.rpId': 1, 'status.state': 1 });
passkeySchema.index({ 'status.lastUsedAt': -1 });
passkeySchema.index({ 'registration.registeredAt': -1 });
passkeySchema.index({ 'device.platform': 1, 'device.deviceType': 1 });
passkeySchema.index({ 'security.cloneDetection.suspected': 1 });
passkeySchema.index({ 'backup.isBackupCredential': 1 });
passkeySchema.index({ 'policy.complianceLevel': 1 });

// ==================== Virtual Fields ====================
passkeySchema.virtual('isActive').get(function() {
  return this.status.state === 'active';
});

passkeySchema.virtual('isExpired').get(function() {
  if (!this.policy.maxAge) return false;
  const ageMs = Date.now() - this.registration.registeredAt.getTime();
  return ageMs > this.policy.maxAge;
});

passkeySchema.virtual('daysSinceRegistration').get(function() {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - this.registration.registeredAt.getTime()) / msPerDay);
});

passkeySchema.virtual('daysSinceLastUse').get(function() {
  if (!this.status.lastUsedAt) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((Date.now() - this.status.lastUsedAt.getTime()) / msPerDay);
});

passkeySchema.virtual('successRate').get(function() {
  const total = this.analytics.totalAuthenticationsCount;
  if (total === 0) return 0;
  return (this.analytics.successfulAuthenticationsCount / total * 100).toFixed(2);
});

passkeySchema.virtual('riskLevel').get(function() {
  const factors = this.security.riskFactors || [];
  const highRisk = factors.filter(f => f.severity === 'high' || f.severity === 'critical').length;
  const mediumRisk = factors.filter(f => f.severity === 'medium').length;
  
  if (highRisk > 0) return 'high';
  if (mediumRisk > 1) return 'medium';
  return 'low';
});

passkeySchema.virtual('displayName').get(function() {
  return this.metadata.nickname || 
         this.authenticator.displayName || 
         this.authenticator.name ||
         `${this.device.platform || 'Unknown'} Device`;
});

// ==================== Pre-save Middleware ====================
passkeySchema.pre('save', async function(next) {
  try {
    // Encrypt sensitive credential data
    if (this.isModified('credential.publicKey') && this.credential.publicKey) {
      this.credential.publicKey = await encryptionService.encrypt(this.credential.publicKey);
    }

    if (this.isModified('registration.challenge') && this.registration.challenge) {
      this.registration.challenge = await encryptionService.encrypt(this.registration.challenge);
    }

    if (this.isModified('registration.userHandle') && this.registration.userHandle) {
      this.registration.userHandle = await encryptionService.encrypt(this.registration.userHandle);
    }

    // Encrypt backup codes
    if (this.isModified('backup.backupCodes')) {
      for (let code of this.backup.backupCodes) {
        if (code.code && !code.encrypted) {
          code.code = await encryptionService.encrypt(code.code);
          code.encrypted = true;
        }
      }
    }

    // Check for expiration
    if (this.isExpired && this.status.state === 'active') {
      this.status.state = 'expired';
    }

    // Update verification status
    if (this.isModified('status.lastVerifiedAt')) {
      this.status.isVerified = true;
    }

    // Add audit entry for status changes
    if (this.isModified('status.state') && !this.isNew) {
      this.auditTrail.actions.push({
        action: this.status.state === 'active' ? 'activated' : 'deactivated',
        performedAt: new Date(),
        details: {
          previousState: this.getChanges().$set?.['status.state'] ? 
            this._original?.status?.state : undefined,
          newState: this.status.state
        }
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
passkeySchema.methods.authenticate = async function(signatureData, challenge) {
  if (this.status.state !== 'active') {
    throw new AppError('Passkey is not active', 403, 'PASSKEY_INACTIVE');
  }

  if (this.isExpired) {
    throw new AppError('Passkey has expired', 401, 'PASSKEY_EXPIRED');
  }

  try {
    // Increment authentication count
    this.analytics.totalAuthenticationsCount += 1;
    this.analytics.lastAuthenticationAt = new Date();

    // Verify signature (this would integrate with WebAuthn library)
    const isValid = await this.verifySignature(signatureData, challenge);

    if (isValid) {
      // Update success metrics
      this.analytics.successfulAuthenticationsCount += 1;
      this.analytics.lastSuccessfulAuthenticationAt = new Date();
      this.analytics.consecutiveFailures = 0;
      this.status.lastUsedAt = new Date();
      this.status.lastVerifiedAt = new Date();

      // Update sign count
      if (signatureData.signCount !== undefined) {
        if (signatureData.signCount <= this.credential.signCount) {
          this.security.cloneDetection.suspected = true;
          this.security.cloneDetection.detectedAt = new Date();
        }
        this.credential.signCount = signatureData.signCount;
      }

      // Add audit entry
      this.auditTrail.actions.push({
        action: 'authentication_success',
        performedAt: new Date(),
        details: {
          signCount: this.credential.signCount,
          userPresent: signatureData.userPresent,
          userVerified: signatureData.userVerified
        }
      });

      await this.save();

      logger.info('Passkey authentication successful', {
        passkeyId: this._id,
        userId: this.userId,
        signCount: this.credential.signCount
      });

      return { success: true, authenticated: true };
    } else {
      // Handle failed authentication
      return await this.recordFailedAuthentication('Invalid signature');
    }
  } catch (error) {
    logger.error('Passkey authentication error', {
      passkeyId: this._id,
      error: error.message
    });

    return await this.recordFailedAuthentication(error.message);
  }
};

passkeySchema.methods.recordFailedAuthentication = async function(reason) {
  this.analytics.failedAuthenticationsCount += 1;
  this.analytics.consecutiveFailures += 1;
  this.analytics.lastFailedAuthenticationAt = new Date();

  // Add to error history
  this.errors.lastError = {
    code: 'AUTH_FAILED',
    message: reason,
    type: 'authentication_error',
    occurredAt: new Date()
  };

  // Check if should be suspended due to too many failures
  if (this.analytics.consecutiveFailures >= 5) {
    this.status.state = 'suspended';
    this.status.suspendedAt = new Date();
    this.status.suspensionReason = 'Too many consecutive failures';
  }

  // Add audit entry
  this.auditTrail.actions.push({
    action: 'authentication_failure',
    performedAt: new Date(),
    details: { reason, consecutiveFailures: this.analytics.consecutiveFailures }
  });

  await this.save();

  return { 
    success: false, 
    authenticated: false, 
    reason,
    consecutiveFailures: this.analytics.consecutiveFailures
  };
};

passkeySchema.methods.verifySignature = async function(signatureData, challenge) {
  // This would integrate with actual WebAuthn signature verification
  // Placeholder implementation
  try {
    // In a real implementation, this would:
    // 1. Reconstruct the signed data
    // 2. Verify the signature using the stored public key
    // 3. Validate the challenge
    // 4. Check authenticator data

    // For now, return true as placeholder
    return true;
  } catch (error) {
    logger.error('Signature verification failed', {
      passkeyId: this._id,
      error: error.message
    });
    return false;
  }
};

passkeySchema.methods.revoke = async function(reason, revokedBy) {
  this.status.state = 'revoked';
  this.status.revokedAt = new Date();
  this.status.revokedBy = revokedBy;
  this.status.revokeReason = reason;

  // Add audit entry
  this.auditTrail.actions.push({
    action: 'revoked',
    performedBy: revokedBy,
    performedAt: new Date(),
    details: { reason }
  });

  await this.save();

  logger.info('Passkey revoked', {
    passkeyId: this._id,
    userId: this.userId,
    reason,
    revokedBy
  });

  return this;
};

passkeySchema.methods.activate = async function(activatedBy) {
  if (this.isExpired) {
    throw new AppError('Cannot activate expired passkey', 400, 'PASSKEY_EXPIRED');
  }

  this.status.state = 'active';
  this.status.activatedAt = new Date();
  this.status.isVerified = true;

  // Reset consecutive failures
  this.analytics.consecutiveFailures = 0;

  // Add audit entry
  this.auditTrail.actions.push({
    action: 'activated',
    performedBy: activatedBy,
    performedAt: new Date()
  });

  await this.save();

  logger.info('Passkey activated', {
    passkeyId: this._id,
    userId: this.userId,
    activatedBy
  });

  return this;
};

passkeySchema.methods.generateBackupCodes = async function(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = cryptoHelper.generateSecureToken(12);
    codes.push({
      code: await encryptionService.encrypt(code),
      createdAt: new Date(),
      encrypted: true
    });
  }

  this.backup.backupCodes = codes;
  await this.save();

  return codes.map((_, index) => `backup-${this.passkeyId.slice(-4)}-${index + 1}`);
};

passkeySchema.methods.addSecurityRiskFactor = async function(factor, severity, details) {
  this.security.riskFactors.push({
    factor,
    severity,
    detectedAt: new Date(),
    details,
    resolved: false
  });

  // Auto-suspend if critical risk
  if (severity === 'critical') {
    this.status.state = 'suspended';
    this.status.suspendedAt = new Date();
    this.status.suspensionReason = `Critical security risk: ${factor}`;
  }

  await this.save();
  return this;
};

// ==================== Static Methods ====================
passkeySchema.statics.createPasskey = async function(userId, credentialData, deviceInfo) {
  const passkey = new this({
    userId,
    organizationId: credentialData.organizationId,
    tenantId: credentialData.tenantId,
    credential: {
      id: credentialData.id,
      rawId: credentialData.rawId,
      publicKey: credentialData.publicKey,
      algorithm: credentialData.algorithm,
      transports: credentialData.transports
    },
    authenticator: credentialData.authenticator,
    device: deviceInfo,
    registration: {
      origin: credentialData.origin,
      rpId: credentialData.rpId,
      rpName: credentialData.rpName,
      challenge: credentialData.challenge,
      registrationMethod: credentialData.crossOrigin ? 'cross-platform' : 'platform'
    },
    status: {
      state: 'active',
      isVerified: true,
      activatedAt: new Date()
    },
    auditTrail: {
      createdBy: userId,
      actions: [{
        action: 'created',
        performedBy: userId,
        performedAt: new Date(),
        details: { registrationMethod: credentialData.crossOrigin ? 'cross-platform' : 'platform' }
      }]
    }
  });

  await passkey.save();

  logger.info('Passkey created', {
    passkeyId: passkey._id,
    userId,
    credentialId: credentialData.id
  });

  return passkey;
};

passkeySchema.statics.findByCredentialId = async function(credentialId) {
  return await this.findOne({
    'credential.id': credentialId,
    'status.state': { $ne: 'revoked' }
  });
};

passkeySchema.statics.findActiveByUser = async function(userId) {
  return await this.find({
    userId,
    'status.state': 'active'
  }).sort({ 'status.lastUsedAt': -1 });
};

passkeySchema.statics.findByRpId = async function(rpId) {
  return await this.find({
    'registration.rpId': rpId,
    'status.state': 'active'
  });
};

passkeySchema.statics.cleanupExpiredPasskeys = async function() {
  const result = await this.updateMany(
    {
      'status.state': 'active',
      $expr: {
        $gt: [
          { $subtract: [new Date(), '$registration.registeredAt'] },
          '$policy.maxAge'
        ]
      }
    },
    {
      'status.state': 'expired'
    }
  );

  logger.info('Passkey cleanup completed', {
    expiredCount: result.modifiedCount
  });

  return result;
};

passkeySchema.statics.getSecurityReport = async function(organizationId) {
  const report = await this.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: null,
        totalPasskeys: { $sum: 1 },
        activePasskeys: {
          $sum: { $cond: [{ $eq: ['$status.state', 'active'] }, 1, 0] }
        },
        suspectedClones: {
          $sum: { $cond: ['$security.cloneDetection.suspected', 1, 0] }
        },
        highRiskPasskeys: {
          $sum: {
            $cond: [
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$security.riskFactors',
                        cond: { $in: ['$$this.severity', ['high', 'critical']] }
                      }
                    }
                  },
                  0
                ]
              },
              1,
              0
            ]
          }
        },
        avgAuthenticationsPerPasskey: {
          $avg: '$analytics.totalAuthenticationsCount'
        },
        avgSuccessRate: {
          $avg: {
            $cond: [
              { $gt: ['$analytics.totalAuthenticationsCount', 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      '$analytics.successfulAuthenticationsCount',
                      '$analytics.totalAuthenticationsCount'
                    ]
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      }
    }
  ]);

  return report[0] || {};
};

// Create and export model
const PasskeyModel = BaseModel.createModel('Passkey', passkeySchema);

module.exports = {
  schema: passkeySchema,
  model: PasskeyModel
};