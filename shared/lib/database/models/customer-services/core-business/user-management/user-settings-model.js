'use strict';

/**
 * @fileoverview Comprehensive user settings model for account management, security, and system configuration
 * @module shared/lib/database/models/users/user-settings-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');

// Enhanced fallback for dependencies
let HashService, stringHelper;
try {
  HashService = require('../../../../../security/encryption/hash-service');
  stringHelper = require('../../../../../utils/helpers/string-helper');
} catch (error) {
  logger.warn('Security dependencies not available, using fallback implementations');
  
  const crypto = require('crypto');
  HashService = {
    hashToken: async (token) => {
      return crypto.createHash('sha256').update(token).digest('hex');
    },
    generateSecureToken: () => {
      return crypto.randomBytes(32).toString('hex');
    }
  };
  
  stringHelper = {
    generateRandomString: (length) => {
      return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }
  };
}

// Fallback validators
const validators = {
  isURL: function(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  isEmail: function(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  },
  isIPAddress: function(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }
};

/**
 * User settings schema definition
 */
const userSettingsSchemaDefinition = {
  // ==================== User Reference ====================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  // ==================== Account Management Settings ====================
  account: {
    profile: {
      allowPublicProfile: {
        type: Boolean,
        default: false
      },
      showInDirectory: {
        type: Boolean,
        default: true
      },
      allowSearchIndexing: {
        type: Boolean,
        default: false
      },
      profileCompletionReminders: {
        type: Boolean,
        default: true
      },
      autoUpdateFromProviders: {
        type: Boolean,
        default: true
      }
    },

    deactivation: {
      allowSelfDeactivation: {
        type: Boolean,
        default: true
      },
      deactivationReason: String,
      scheduledDeactivationDate: Date,
      dataRetentionPeriod: {
        type: Number,
        default: 90, // days
        min: 30,
        max: 365
      },
      notifyBeforeDeactivation: {
        type: Boolean,
        default: true
      },
      notificationDays: {
        type: Number,
        default: 7,
        min: 1,
        max: 30
      }
    },

    deletion: {
      allowSelfDeletion: {
        type: Boolean,
        default: false
      },
      requireConfirmation: {
        type: Boolean,
        default: true
      },
      confirmationMethod: {
        type: String,
        enum: ['email', 'sms', 'both'],
        default: 'email'
      },
      gracePeriod: {
        type: Number,
        default: 30, // days
        min: 7,
        max: 90
      },
      hardDeleteAfter: {
        type: Number,
        default: 365, // days
        min: 90,
        max: 2555 // 7 years
      }
    },

    recovery: {
      enableAccountRecovery: {
        type: Boolean,
        default: true
      },
      recoveryMethods: [{
        type: {
          type: String,
          enum: ['email', 'phone', 'security_questions', 'backup_codes', 'recovery_key']
        },
        enabled: Boolean,
        verified: Boolean,
        lastUsed: Date
      }],
      recoveryQuestions: [{
        questionId: String,
        question: String,
        answerHash: {
          type: String,
          select: false
        },
        setAt: Date
      }],
      backupCodes: [{
        code: {
          type: String,
          select: false
        },
        used: Boolean,
        usedAt: Date,
        generatedAt: Date
      }]
    }
  },

  // ==================== Security Settings ====================
  security: {
    password: {
      changeRequired: {
        type: Boolean,
        default: false
      },
      changeFrequency: {
        type: Number, // days
        default: 90,
        min: 30,
        max: 365
      },
      preventReuse: {
        type: Number,
        default: 5,
        min: 3,
        max: 24
      },
      requireComplexPassword: {
        type: Boolean,
        default: true
      },
      minLength: {
        type: Number,
        default: 8,
        min: 6,
        max: 128
      },
      requireSpecialChars: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireLowercase: {
        type: Boolean,
        default: true
      },
      allowCommonPasswords: {
        type: Boolean,
        default: false
      },
      notifyOnChange: {
        type: Boolean,
        default: true
      }
    },

    twoFactor: {
      required: {
        type: Boolean,
        default: false
      },
      gracePeriod: {
        type: Number, // days
        default: 7,
        min: 0,
        max: 30
      },
      allowedMethods: [{
        type: String,
        enum: ['totp', 'sms', 'email', 'hardware_key', 'biometric', 'backup_codes']
      }],
      backupMethods: [{
        type: String,
        enum: ['sms', 'email', 'backup_codes', 'recovery_key']
      }],
      rememberDevice: {
        enabled: {
          type: Boolean,
          default: true
        },
        duration: {
          type: Number, // days
          default: 30,
          min: 1,
          max: 90
        }
      },
      notifyOnDisable: {
        type: Boolean,
        default: true
      }
    },

    sessions: {
      maxConcurrentSessions: {
        type: Number,
        default: 5,
        min: 1,
        max: 20
      },
      maxSessionDuration: {
        type: Number, // hours
        default: 8,
        min: 1,
        max: 168 // 7 days
      },
      idleTimeout: {
        type: Number, // minutes
        default: 30,
        min: 5,
        max: 480
      },
      requireReauth: {
        enabled: {
          type: Boolean,
          default: false
        },
        frequency: {
          type: Number, // hours
          default: 24,
          min: 1,
          max: 168
        },
        actions: [String] // specific actions requiring reauth
      },
      terminateOnPasswordChange: {
        type: Boolean,
        default: true
      },
      notifyNewLogins: {
        type: Boolean,
        default: true
      },
      logoutOnBrowserClose: {
        type: Boolean,
        default: false
      }
    },

    access: {
      ipWhitelist: {
        enabled: {
          type: Boolean,
          default: false
        },
        addresses: [{
          ip: {
            type: String,
            validate: [validators.isIPAddress, 'Invalid IP address format']
          },
          subnet: String,
          description: String,
          addedAt: Date,
          lastUsed: Date
        }]
      },
      ipBlacklist: {
        enabled: {
          type: Boolean,
          default: false
        },
        addresses: [{
          ip: {
            type: String,
            validate: [validators.isIPAddress, 'Invalid IP address format']
          },
          subnet: String,
          reason: String,
          addedAt: Date,
          expiresAt: Date
        }]
      },
      locationRestrictions: {
        enabled: {
          type: Boolean,
          default: false
        },
        allowedCountries: [String],
        blockedCountries: [String],
        notifyUnusualLocation: {
          type: Boolean,
          default: true
        },
        requireVerificationFromNewLocation: {
          type: Boolean,
          default: false
        }
      },
      deviceTrust: {
        requireDeviceVerification: {
          type: Boolean,
          default: false
        },
        autoTrustOrganizationDevices: {
          type: Boolean,
          default: true
        },
        trustDuration: {
          type: Number, // days
          default: 90,
          min: 1,
          max: 365
        },
        maxTrustedDevices: {
          type: Number,
          default: 10,
          min: 1,
          max: 50
        }
      }
    },

    monitoring: {
      enableActivityMonitoring: {
        type: Boolean,
        default: true
      },
      logSuspiciousActivity: {
        type: Boolean,
        default: true
      },
      alertOnMultipleFailedLogins: {
        type: Boolean,
        default: true
      },
      failedLoginThreshold: {
        type: Number,
        default: 5,
        min: 3,
        max: 20
      },
      alertOnNewDevice: {
        type: Boolean,
        default: true
      },
      alertOnPasswordChange: {
        type: Boolean,
        default: true
      },
      alertOnPermissionChange: {
        type: Boolean,
        default: true
      }
    }
  },

  // ==================== API & Integration Settings ====================
  api: {
    access: {
      enabled: {
        type: Boolean,
        default: false
      },
      maxKeys: {
        type: Number,
        default: 5,
        min: 1,
        max: 50
      },
      keyExpiration: {
        type: Number, // days, null for no expiration
        default: null,
        min: 1,
        max: 365
      },
      autoRotate: {
        enabled: {
          type: Boolean,
          default: false
        },
        frequency: {
          type: Number, // days
          default: 90,
          min: 30,
          max: 365
        },
        notifyBeforeRotation: {
          type: Boolean,
          default: true
        },
        gracePeriod: {
          type: Number, // days
          default: 7,
          min: 1,
          max: 30
        }
      }
    },

    rateLimit: {
      enabled: {
        type: Boolean,
        default: true
      },
      requestsPerMinute: {
        type: Number,
        default: 60,
        min: 10,
        max: 10000
      },
      requestsPerHour: {
        type: Number,
        default: 1000,
        min: 100,
        max: 100000
      },
      requestsPerDay: {
        type: Number,
        default: 10000,
        min: 1000,
        max: 1000000
      },
      burstLimit: {
        type: Number,
        default: 100,
        min: 10,
        max: 1000
      },
      throttleOnExceed: {
        type: Boolean,
        default: true
      }
    },

    permissions: {
      defaultScopes: [String],
      maxScopes: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
      },
      allowSensitiveScopes: {
        type: Boolean,
        default: false
      },
      requireScopeApproval: {
        type: Boolean,
        default: true
      }
    },

    webhooks: {
      enabled: {
        type: Boolean,
        default: false
      },
      maxWebhooks: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
      },
      retryAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10
      },
      timeout: {
        type: Number, // seconds
        default: 30,
        min: 5,
        max: 300
      },
      verifySSL: {
        type: Boolean,
        default: true
      },
      allowSelfSigned: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Data Management Settings ====================
  data: {
    retention: {
      personalData: {
        retentionPeriod: {
          type: Number, // days
          default: 2555, // 7 years
          min: 365,
          max: 3650 // 10 years
        },
        autoDelete: {
          type: Boolean,
          default: false
        },
        notifyBeforeDeletion: {
          type: Boolean,
          default: true
        }
      },
      activityLogs: {
        retentionPeriod: {
          type: Number, // days
          default: 365,
          min: 90,
          max: 2555
        },
        autoDelete: {
          type: Boolean,
          default: true
        }
      },
      files: {
        retentionPeriod: {
          type: Number, // days
          default: 1095, // 3 years
          min: 365,
          max: 2555
        },
        deleteInactiveFiles: {
          type: Boolean,
          default: false
        },
        inactivityThreshold: {
          type: Number, // days
          default: 365,
          min: 90,
          max: 1095
        }
      },
      backups: {
        retentionPeriod: {
          type: Number, // days
          default: 90,
          min: 30,
          max: 365
        },
        autoDelete: {
          type: Boolean,
          default: true
        }
      }
    },

    export: {
      enableDataExport: {
        type: Boolean,
        default: true
      },
      exportFormats: [{
        type: String,
        enum: ['json', 'csv', 'xml', 'pdf']
      }],
      maxExportsPerMonth: {
        type: Number,
        default: 3,
        min: 1,
        max: 10
      },
      exportRetentionDays: {
        type: Number,
        default: 30,
        min: 7,
        max: 90
      },
      notifyOnExportReady: {
        type: Boolean,
        default: true
      },
      includeMetadata: {
        type: Boolean,
        default: true
      },
      includeSystemData: {
        type: Boolean,
        default: false
      }
    },

    backup: {
      enableAutoBackup: {
        type: Boolean,
        default: true
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'weekly'
      },
      includeFiles: {
        type: Boolean,
        default: true
      },
      encryption: {
        type: Boolean,
        default: true
      },
      compression: {
        type: Boolean,
        default: true
      },
      notifyOnBackup: {
        type: Boolean,
        default: false
      },
      maxBackupSize: {
        type: Number, // MB
        default: 1000,
        min: 100,
        max: 10000
      }
    },

    sync: {
      enableCloudSync: {
        type: Boolean,
        default: true
      },
      syncFrequency: {
        type: String,
        enum: ['realtime', 'hourly', 'daily'],
        default: 'realtime'
      },
      conflictResolution: {
        type: String,
        enum: ['server_wins', 'client_wins', 'merge', 'prompt'],
        default: 'merge'
      },
      enableOfflineMode: {
        type: Boolean,
        default: true
      }
    }
  },

  // ==================== Integration Settings ====================
  integrations: {
    oauth: {
      allowedProviders: [{
        provider: {
          type: String,
          enum: ['google', 'microsoft', 'github', 'linkedin', 'slack', 'zoom', 'custom']
        },
        enabled: Boolean,
        autoLink: Boolean,
        syncProfile: Boolean,
        permissions: [String]
      }],
      autoRevokeInactive: {
        type: Boolean,
        default: true
      },
      inactivityThreshold: {
        type: Number, // days
        default: 90,
        min: 30,
        max: 365
      }
    },

    sso: {
      enabled: {
        type: Boolean,
        default: false
      },
      provider: String,
      requireSSO: {
        type: Boolean,
        default: false
      },
      allowLocalLogin: {
        type: Boolean,
        default: true
      },
      attributeMapping: {
        type: Map,
        of: String
      },
      groupMapping: {
        type: Map,
        of: [String]
      }
    },

    ldap: {
      enabled: {
        type: Boolean,
        default: false
      },
      server: String,
      baseDN: String,
      userFilter: String,
      groupFilter: String,
      syncFrequency: {
        type: String,
        enum: ['hourly', 'daily', 'weekly'],
        default: 'daily'
      },
      attributeMapping: {
        type: Map,
        of: String
      }
    },

    calendar: {
      enabled: {
        type: Boolean,
        default: false
      },
      providers: [{
        type: {
          type: String,
          enum: ['google', 'outlook', 'exchange', 'ical']
        },
        enabled: Boolean,
        syncDirection: {
          type: String,
          enum: ['read', 'write', 'bidirectional'],
          default: 'read'
        },
        syncFrequency: {
          type: String,
          enum: ['realtime', 'hourly', 'daily'],
          default: 'hourly'
        }
      }],
      defaultCalendar: String,
      createMeetingLinks: {
        type: Boolean,
        default: true
      }
    },

    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      provider: {
        type: String,
        enum: ['gmail', 'outlook', 'exchange', 'imap']
      },
      syncEmail: {
        type: Boolean,
        default: false
      },
      syncContacts: {
        type: Boolean,
        default: false
      },
      emailSignature: String,
      autoReply: {
        enabled: Boolean,
        message: String,
        startDate: Date,
        endDate: Date
      }
    },

    storage: {
      providers: [{
        type: {
          type: String,
          enum: ['google_drive', 'onedrive', 'dropbox', 's3', 'box']
        },
        enabled: Boolean,
        isDefault: Boolean,
        syncFrequency: {
          type: String,
          enum: ['realtime', 'hourly', 'daily'],
          default: 'hourly'
        },
        quota: Number // MB
      }],
      autoSync: {
        type: Boolean,
        default: true
      },
      syncDeletes: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Billing & Subscription Settings ====================
  billing: {
    preferences: {
      currency: {
        type: String,
        default: 'USD'
      },
      invoiceEmail: {
        type: String,
        validate: [validators.isEmail, 'Invalid email address']
      },
      billingAddress: {
        company: String,
        line1: String,
        line2: String,
        city: String,
        state: String,
        country: String,
        postalCode: String
      },
      taxId: String,
      purchaseOrderRequired: {
        type: Boolean,
        default: false
      }
    },

    notifications: {
      invoiceGenerated: {
        type: Boolean,
        default: true
      },
      paymentSuccessful: {
        type: Boolean,
        default: true
      },
      paymentFailed: {
        type: Boolean,
        default: true
      },
      subscriptionExpiring: {
        type: Boolean,
        default: true
      },
      usageAlerts: {
        enabled: {
          type: Boolean,
          default: true
        },
        thresholds: [{
          percentage: Number,
          enabled: Boolean
        }]
      }
    },

    automation: {
      autoRenew: {
        type: Boolean,
        default: true
      },
      autoUpgrade: {
        enabled: {
          type: Boolean,
          default: false
        },
        threshold: Number, // usage percentage
        targetPlan: String
      },
      autoDowngrade: {
        enabled: {
          type: Boolean,
          default: false
        },
        threshold: Number, // usage percentage
        targetPlan: String,
        gracePeriod: Number // days
      }
    },

    spending: {
      monthlyLimit: Number,
      alertThreshold: Number,
      hardLimit: {
        type: Boolean,
        default: false
      },
      approvalRequired: {
        enabled: {
          type: Boolean,
          default: false
        },
        threshold: Number,
        approvers: [String]
      }
    }
  },

  // ==================== Feature Flags & Toggles ====================
  features: {
    beta: {
      participateInBeta: {
        type: Boolean,
        default: false
      },
      autoEnrollNewFeatures: {
        type: Boolean,
        default: false
      },
      provideFeedback: {
        type: Boolean,
        default: true
      }
    },

    experimental: {
      enableExperimentalFeatures: {
        type: Boolean,
        default: false
      },
      features: [{
        featureId: String,
        enabled: Boolean,
        enrolledAt: Date,
        feedback: String
      }]
    },

    accessibility: {
      enableA11yFeatures: {
        type: Boolean,
        default: true
      },
      features: [{
        featureId: String,
        enabled: Boolean
      }]
    },

    performance: {
      enablePerformanceMode: {
        type: Boolean,
        default: false
      },
      reducedAnimations: {
        type: Boolean,
        default: false
      },
      lazyLoading: {
        type: Boolean,
        default: true
      },
      prefetching: {
        type: Boolean,
        default: true
      }
    }
  },

  // ==================== Compliance & Legal Settings ====================
  compliance: {
    gdpr: {
      consentGiven: {
        type: Boolean,
        default: false
      },
      consentDate: Date,
      consentVersion: String,
      withdrawalDate: Date,
      dataProcessingPurposes: [{
        purpose: String,
        consented: Boolean,
        consentDate: Date
      }],
      rightToPortability: {
        type: Boolean,
        default: true
      },
      rightToErasure: {
        type: Boolean,
        default: true
      }
    },

    ccpa: {
      optOut: {
        type: Boolean,
        default: false
      },
      optOutDate: Date,
      dataSaleOptOut: {
        type: Boolean,
        default: false
      },
      personalInfoCategories: [{
        category: String,
        consented: Boolean
      }]
    },

    hipaa: {
      authorizedUsers: [String],
      accessLogging: {
        type: Boolean,
        default: true
      },
      encryptionRequired: {
        type: Boolean,
        default: true
      },
      minimumNecessary: {
        type: Boolean,
        default: true
      }
    },

    terms: {
      acceptedVersion: String,
      acceptedDate: Date,
      ipAddress: String,
      requireAcceptance: {
        type: Boolean,
        default: true
      }
    },

    privacy: {
      acceptedVersion: String,
      acceptedDate: Date,
      ipAddress: String
    },

    marketing: {
      emailConsent: {
        type: Boolean,
        default: false
      },
      smsConsent: {
        type: Boolean,
        default: false
      },
      phoneConsent: {
        type: Boolean,
        default: false
      },
      thirdPartySharing: {
        type: Boolean,
        default: false
      },
      targetedAdvertising: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Organization Settings ====================
  organization: {
    roles: {
      autoAssignRoles: [{
        roleId: String,
        condition: String,
        enabled: Boolean
      }],
      requestableRoles: [{
        roleId: String,
        requireApproval: Boolean,
        approvers: [String]
      }],
      temporaryRoles: {
        enabled: {
          type: Boolean,
          default: false
        },
        maxDuration: Number, // hours
        requireJustification: {
          type: Boolean,
          default: true
        }
      }
    },

    departments: {
      allowDepartmentTransfer: {
        type: Boolean,
        default: false
      },
      requireApprovalForTransfer: {
        type: Boolean,
        default: true
      },
      transferApprovers: [String]
    },

    teams: {
      allowTeamCreation: {
        type: Boolean,
        default: false
      },
      maxTeams: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
      },
      autoJoinTeams: [{
        teamId: String,
        condition: String
      }]
    },

    reporting: {
      allowDirectReports: {
        type: Boolean,
        default: false
      },
      maxDirectReports: {
        type: Number,
        default: 10,
        min: 1,
        max: 50
      },
      reportingChainDepth: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
      }
    }
  },

  // ==================== System Settings ====================
  system: {
    maintenance: {
      allowMaintenanceEmails: {
        type: Boolean,
        default: true
      },
      maintenanceWindow: {
        day: {
          type: String,
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          default: 'sunday'
        },
        startTime: {
          type: String,
          default: '02:00'
        },
        duration: {
          type: Number, // hours
          default: 4,
          min: 1,
          max: 12
        }
      }
    },

    diagnostics: {
      enableTelemetry: {
        type: Boolean,
        default: true
      },
      enableCrashReporting: {
        type: Boolean,
        default: true
      },
      enablePerformanceMonitoring: {
        type: Boolean,
        default: true
      },
      logLevel: {
        type: String,
        enum: ['error', 'warn', 'info', 'debug'],
        default: 'info'
      },
      shareAnonymousData: {
        type: Boolean,
        default: true
      }
    },

    updates: {
      autoUpdate: {
        type: Boolean,
        default: true
      },
      updateChannel: {
        type: String,
        enum: ['stable', 'beta', 'alpha'],
        default: 'stable'
      },
      notifyUpdates: {
        type: Boolean,
        default: true
      },
      allowPreRelease: {
        type: Boolean,
        default: false
      }
    },

    performance: {
      caching: {
        enabled: {
          type: Boolean,
          default: true
        },
        duration: {
          type: Number, // minutes
          default: 60,
          min: 5,
          max: 1440
        }
      },
      compression: {
        enabled: {
          type: Boolean,
          default: true
        },
        level: {
          type: Number,
          default: 6,
          min: 1,
          max: 9
        }
      },
      prefetching: {
        enabled: {
          type: Boolean,
          default: true
        },
        aggressiveness: {
          type: String,
          enum: ['conservative', 'moderate', 'aggressive'],
          default: 'moderate'
        }
      }
    }
  },

  // ==================== Custom Settings ====================
  custom: {
    organizationSettings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    
    applicationSettings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },

    userDefinedSettings: [{
      key: String,
      value: mongoose.Schema.Types.Mixed,
      type: {
        type: String,
        enum: ['string', 'number', 'boolean', 'object', 'array']
      },
      category: String,
      description: String,
      encrypted: {
        type: Boolean,
        default: false
      },
      sensitive: {
        type: Boolean,
        default: false
      }
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    version: {
      type: Number,
      default: 1
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastSyncedAt: Date,
    syncedFrom: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    inheritFromOrganization: {
      type: Boolean,
      default: true
    },
    overrides: [{
      key: String,
      originalValue: mongoose.Schema.Types.Mixed,
      overriddenAt: Date,
      overriddenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String,
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    configurationProfile: String,
    tags: [String],
    notes: String
  }
};

// Create schema
const userSettingsSchema = BaseModel.createSchema(userSettingsSchemaDefinition, {
  collection: 'user_settings',
  timestamps: true
});

// ==================== Indexes ====================
userSettingsSchema.index({ userId: 1 });
userSettingsSchema.index({ organizationId: 1 });
userSettingsSchema.index({ 'security.twoFactor.required': 1 });
userSettingsSchema.index({ 'api.access.enabled': 1 });
userSettingsSchema.index({ 'metadata.lastSyncedAt': -1 });
userSettingsSchema.index({ 'metadata.tags': 1 });
userSettingsSchema.index({ 'billing.preferences.currency': 1 });

// ==================== Virtual Fields ====================
userSettingsSchema.virtual('isSecurityCompliant').get(function() {
  return this.security.password.requireComplexPassword &&
         this.security.twoFactor.required &&
         this.security.sessions.maxSessionDuration <= 24;
});

userSettingsSchema.virtual('isDataCompliant').get(function() {
  return this.compliance.gdpr.consentGiven &&
         this.data.retention.personalData.retentionPeriod <= 2555;
});

userSettingsSchema.virtual('hasApiAccess').get(function() {
  return this.api.access.enabled;
});

userSettingsSchema.virtual('totalIntegrations').get(function() {
  let count = 0;
  if (this.integrations.oauth.allowedProviders) count += this.integrations.oauth.allowedProviders.filter(p => p.enabled).length;
  if (this.integrations.sso.enabled) count += 1;
  if (this.integrations.ldap.enabled) count += 1;
  return count;
});

// ==================== Pre-save Middleware ====================
userSettingsSchema.pre('save', async function(next) {
  try {
    // Update version on changes
    if (this.isModified() && !this.isNew) {
      this.metadata.version += 1;
    }

    // Set default metadata
    if (this.isNew) {
      this.metadata.lastSyncedAt = new Date();
    }

    // Validate security settings
    this.validateSecuritySettings();

    // Validate billing settings
    this.validateBillingSettings();

    // Update sync timestamp
    if (this.isModified()) {
      this.metadata.lastSyncedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
userSettingsSchema.methods.validateSecuritySettings = function() {
  // Validate password requirements
  if (this.security.password.minLength < 6 || this.security.password.minLength > 128) {
    throw new AppError('Password minimum length must be between 6 and 128', 400, 'INVALID_PASSWORD_LENGTH');
  }

  // Validate session settings
  if (this.security.sessions.maxConcurrentSessions < 1) {
    throw new AppError('Must allow at least one concurrent session', 400, 'INVALID_SESSION_LIMIT');
  }

  // Validate IP addresses
  if (this.security.access.ipWhitelist.enabled && this.security.access.ipWhitelist.addresses) {
    for (const entry of this.security.access.ipWhitelist.addresses) {
      if (!validators.isIPAddress(entry.ip)) {
        throw new AppError(`Invalid IP address: ${entry.ip}`, 400, 'INVALID_IP_ADDRESS');
      }
    }
  }

  return true;
};

userSettingsSchema.methods.validateBillingSettings = function() {
  if (this.billing.preferences.invoiceEmail && !validators.isEmail(this.billing.preferences.invoiceEmail)) {
    throw new AppError('Invalid invoice email address', 400, 'INVALID_INVOICE_EMAIL');
  }

  return true;
};

userSettingsSchema.methods.getEffectiveSettings = async function() {
  const settings = this.toObject();
  
  // Apply organization defaults if inheritance is enabled
  if (this.metadata.inheritFromOrganization && this.organizationId) {
    try {
      const orgSettings = await this.constructor.getOrganizationDefaults(this.organizationId);
      if (orgSettings) {
        settings = this.mergeSettings(orgSettings, settings);
      }
    } catch (error) {
      logger.warn('Failed to get organization default settings', { 
        organizationId: this.organizationId,
        error: error.message 
      });
    }
  }
  
  return settings;
};

userSettingsSchema.methods.mergeSettings = function(baseSettings, userSettings) {
  const merge = (base, user) => {
    if (!base || typeof base !== 'object') return user;
    if (!user || typeof user !== 'object') return base;
    
    const result = { ...base };
    
    for (const key in user) {
      if (user[key] !== null && user[key] !== undefined) {
        if (typeof user[key] === 'object' && !Array.isArray(user[key])) {
          result[key] = merge(base[key], user[key]);
        } else {
          result[key] = user[key];
        }
      }
    }
    
    return result;
  };
  
  return merge(baseSettings, userSettings);
};

userSettingsSchema.methods.updateSetting = async function(path, value, options = {}) {
  const { reason = 'user_update', requireApproval = false, approvedBy = null } = options;
  const originalValue = this.get(path);
  
  // Record override if different from original
  if (JSON.stringify(originalValue) !== JSON.stringify(value)) {
    if (!this.metadata.overrides) this.metadata.overrides = [];
    
    this.metadata.overrides.push({
      key: path,
      originalValue,
      overriddenAt: new Date(),
      overriddenBy: this.metadata.lastUpdatedBy,
      reason,
      approved: !requireApproval,
      approvedBy: requireApproval ? null : approvedBy
    });
  }
  
  this.set(path, value);
  
  if (!requireApproval) {
    await this.save();
  }
  
  return this;
};

userSettingsSchema.methods.resetToDefaults = async function(category = null) {
  const defaults = await this.constructor.getDefaultSettings();
  
  if (category) {
    if (defaults[category]) {
      this[category] = defaults[category];
    }
  } else {
    // Reset all settings
    Object.assign(this, defaults);
    this.metadata.overrides = [];
    this.metadata.version = 1;
  }
  
  await this.save();
  return this;
};

userSettingsSchema.methods.enableTwoFactor = async function(methods = ['totp']) {
  this.security.twoFactor.required = true;
  this.security.twoFactor.allowedMethods = methods;
  
  // Generate backup codes if not exist
  if (!this.account.recovery.backupCodes || this.account.recovery.backupCodes.length === 0) {
    await this.generateBackupCodes();
  }
  
  await this.save();
  
  logger.info('Two-factor authentication enabled', {
    userId: this.userId,
    methods
  });
  
  return this;
};

userSettingsSchema.methods.generateBackupCodes = async function(count = 10) {
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    const code = stringHelper.generateRandomString(8).toUpperCase();
    codes.push({
      code: await HashService.hashToken(code),
      used: false,
      generatedAt: new Date()
    });
  }
  
  this.account.recovery.backupCodes = codes;
  await this.save();
  
  return codes.map(c => c.code);
};

userSettingsSchema.methods.addApiKey = async function(keyData) {
  const { name, scopes = [], expiresIn = null } = keyData;
  
  if (!this.api.access.enabled) {
    throw new AppError('API access is not enabled', 403, 'API_ACCESS_DISABLED');
  }
  
  const User = this.model('User');
  const user = await User.findById(this.userId);
  
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  const apiKey = await user.generateApiKey(name, scopes);
  
  // Set expiration if specified
  if (expiresIn) {
    const expirationDate = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
    apiKey.expiresAt = expirationDate;
  }
  
  return apiKey;
};

userSettingsSchema.methods.addIPToWhitelist = async function(ipData) {
  const { ip, subnet, description } = ipData;
  
  if (!validators.isIPAddress(ip)) {
    throw new AppError('Invalid IP address format', 400, 'INVALID_IP_FORMAT');
  }
  
  if (!this.security.access.ipWhitelist.addresses) {
    this.security.access.ipWhitelist.addresses = [];
  }
  
  // Check for duplicates
  const existingIp = this.security.access.ipWhitelist.addresses.find(entry => entry.ip === ip);
  if (existingIp) {
    throw new AppError('IP address already in whitelist', 409, 'IP_EXISTS');
  }
  
  this.security.access.ipWhitelist.addresses.push({
    ip,
    subnet,
    description,
    addedAt: new Date()
  });
  
  await this.save();
  return this;
};

userSettingsSchema.methods.enableIntegration = async function(integrationType, provider, config = {}) {
  const validTypes = ['oauth', 'sso', 'ldap', 'calendar', 'email', 'storage'];
  
  if (!validTypes.includes(integrationType)) {
    throw new AppError('Invalid integration type', 400, 'INVALID_INTEGRATION_TYPE');
  }
  
  if (integrationType === 'oauth') {
    if (!this.integrations.oauth.allowedProviders) {
      this.integrations.oauth.allowedProviders = [];
    }
    
    const existingProvider = this.integrations.oauth.allowedProviders.find(p => p.provider === provider);
    if (existingProvider) {
      existingProvider.enabled = true;
      Object.assign(existingProvider, config);
    } else {
      this.integrations.oauth.allowedProviders.push({
        provider,
        enabled: true,
        ...config
      });
    }
  } else {
    this.integrations[integrationType].enabled = true;
    Object.assign(this.integrations[integrationType], config);
  }
  
  await this.save();
  
  logger.info('Integration enabled', {
    userId: this.userId,
    type: integrationType,
    provider
  });
  
  return this;
};

userSettingsSchema.methods.updateBillingPreferences = async function(preferences) {
  Object.assign(this.billing.preferences, preferences);
  
  // Validate email if provided
  if (preferences.invoiceEmail && !validators.isEmail(preferences.invoiceEmail)) {
    throw new AppError('Invalid invoice email address', 400, 'INVALID_EMAIL');
  }
  
  await this.save();
  return this.billing.preferences;
};

userSettingsSchema.methods.giveConsent = async function(consentType, purposes = []) {
  const validTypes = ['gdpr', 'ccpa', 'marketing', 'terms', 'privacy'];
  
  if (!validTypes.includes(consentType)) {
    throw new AppError('Invalid consent type', 400, 'INVALID_CONSENT_TYPE');
  }
  
  const now = new Date();
  
  if (consentType === 'gdpr') {
    this.compliance.gdpr.consentGiven = true;
    this.compliance.gdpr.consentDate = now;
    this.compliance.gdpr.consentVersion = '1.0'; // Should be dynamic
    
    if (purposes.length > 0) {
      this.compliance.gdpr.dataProcessingPurposes = purposes.map(purpose => ({
        purpose,
        consented: true,
        consentDate: now
      }));
    }
  }
  
  await this.save();
  
  logger.info('Consent given', {
    userId: this.userId,
    consentType,
    purposes
  });
  
  return this;
};

userSettingsSchema.methods.exportSettings = function(format = 'json', includeSecrets = false) {
  const settings = this.toObject();
  
  // Remove sensitive information unless explicitly requested
  if (!includeSecrets) {
    delete settings.account.recovery.backupCodes;
    delete settings.account.recovery.recoveryQuestions;
    delete settings.custom.userDefinedSettings;
  }
  
  // Remove metadata
  delete settings._id;
  delete settings.__v;
  
  if (format === 'json') {
    return JSON.stringify(settings, null, 2);
  }
  
  return settings;
};

userSettingsSchema.methods.importSettings = async function(settingsData, options = {}) {
  const { overwrite = false, categories = null, validateOnly = false } = options;
  
  // Validate settings data
  if (validateOnly) {
    this.validateSecuritySettings.call({ security: settingsData.security || {} });
    this.validateBillingSettings.call({ billing: settingsData.billing || {} });
    return { valid: true };
  }
  
  if (categories && Array.isArray(categories)) {
    // Import only specific categories
    for (const category of categories) {
      if (settingsData[category]) {
        if (overwrite) {
          this[category] = settingsData[category];
        } else {
          this[category] = this.mergeSettings(this[category], settingsData[category]);
        }
      }
    }
  } else {
    // Import all settings
    if (overwrite) {
      Object.assign(this, settingsData);
    } else {
      for (const key in settingsData) {
        if (key !== '_id' && key !== '__v' && key !== 'userId') {
          this[key] = this.mergeSettings(this[key], settingsData[key]);
        }
      }
    }
  }
  
  this.metadata.version += 1;
  await this.save();
  
  return this;
};

// ==================== Static Methods ====================
userSettingsSchema.statics.createDefaultSettings = async function(userId, organizationId = null) {
  const existingSettings = await this.findOne({ userId });
  
  if (existingSettings) {
    throw new AppError('User settings already exist', 409, 'SETTINGS_EXIST');
  }
  
  const defaults = await this.getDefaultSettings();
  
  const settings = new this({
    userId,
    organizationId,
    ...defaults,
    metadata: {
      version: 1,
      isDefault: true,
      lastSyncedAt: new Date()
    }
  });
  
  await settings.save();
  
  logger.info('Default user settings created', {
    userId,
    organizationId
  });
  
  return settings;
};

userSettingsSchema.statics.getDefaultSettings = async function() {
  return {
    account: {
      profile: {
        allowPublicProfile: false,
        showInDirectory: true
      },
      deactivation: {
        allowSelfDeactivation: true,
        dataRetentionPeriod: 90
      }
    },
    security: {
      password: {
        requireComplexPassword: true,
        minLength: 8,
        changeFrequency: 90
      },
      twoFactor: {
        required: false,
        gracePeriod: 7
      },
      sessions: {
        maxConcurrentSessions: 5,
        maxSessionDuration: 8,
        idleTimeout: 30
      }
    },
    api: {
      access: {
        enabled: false,
        maxKeys: 5
      }
    },
    data: {
      retention: {
        personalData: {
          retentionPeriod: 2555,
          autoDelete: false
        }
      },
      backup: {
        enableAutoBackup: true,
        frequency: 'weekly'
      }
    }
  };
};

userSettingsSchema.statics.findByUserId = async function(userId, options = {}) {
  const settings = await this.findOne({ userId });
  
  if (!settings && options.createIfNotExists) {
    return await this.createDefaultSettings(userId, options.organizationId);
  }
  
  return settings;
};

userSettingsSchema.statics.getOrganizationDefaults = async function(organizationId) {
  // This would typically fetch organization-level default settings
  // For now, return null - implementation depends on organization model
  return null;
};

userSettingsSchema.statics.bulkUpdateSettings = async function(updates) {
  const results = {
    successful: [],
    failed: []
  };
  
  for (const update of updates) {
    try {
      const { userId, settings, reason } = update;
      
      const userSettings = await this.findByUserId(userId);
      if (!userSettings) {
        results.failed.push({
          userId,
          error: 'User settings not found'
        });
        continue;
      }
      
      await userSettings.importSettings(settings, { overwrite: false });
      
      results.successful.push({
        userId,
        version: userSettings.metadata.version
      });
      
    } catch (error) {
      results.failed.push({
        userId: update.userId,
        error: error.message
      });
    }
  }
  
  return results;
};

userSettingsSchema.statics.getSecurityAnalytics = async function(organizationId = null) {
  const match = organizationId ? { organizationId } : {};
  
  const analytics = await this.aggregate([
    { $match: match },
    {
      $facet: {
        twoFactor: [
          {
            $group: {
              _id: '$security.twoFactor.required',
              count: { $sum: 1 }
            }
          }
        ],
        passwordComplexity: [
          {
            $group: {
              _id: '$security.password.requireComplexPassword',
              count: { $sum: 1 }
            }
          }
        ],
        apiAccess: [
          {
            $group: {
              _id: '$api.access.enabled',
              count: { $sum: 1 }
            }
          }
        ],
        sessions: [
          {
            $group: {
              _id: null,
              avgMaxSessions: { $avg: '$security.sessions.maxConcurrentSessions' },
              avgSessionDuration: { $avg: '$security.sessions.maxSessionDuration' },
              avgIdleTimeout: { $avg: '$security.sessions.idleTimeout' }
            }
          }
        ],
        compliance: [
          {
            $group: {
              _id: null,
              gdprConsent: {
                $sum: { $cond: ['$compliance.gdpr.consentGiven', 1, 0] }
              },
              ccpaOptOut: {
                $sum: { $cond: ['$compliance.ccpa.optOut', 1, 0] }
              },
              marketingConsent: {
                $sum: { $cond: ['$compliance.marketing.emailConsent', 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);
  
  return analytics[0];
};

userSettingsSchema.statics.migrateSettings = async function(fromVersion, toVersion) {
  const settings = await this.find({
    'metadata.version': fromVersion
  });
  
  let migratedCount = 0;
  
  for (const setting of settings) {
    try {
      // Apply migration logic based on version
      if (fromVersion === 1 && toVersion === 2) {
        // Example migration: add new security settings
        if (!setting.security.access) {
          setting.security.access = {
            ipWhitelist: { enabled: false, addresses: [] },
            locationRestrictions: { enabled: false }
          };
        }
      }
      
      setting.metadata.version = toVersion;
      await setting.save();
      migratedCount++;
      
    } catch (error) {
      logger.error('Failed to migrate user settings', {
        userId: setting.userId,
        error: error.message
      });
    }
  }
  
  logger.info('User settings migration completed', {
    fromVersion,
    toVersion,
    migratedCount
  });
  
  return migratedCount;
};

userSettingsSchema.statics.validateConfiguration = async function(configData) {
  const errors = [];
  
  // Validate security configuration
  if (configData.security) {
    if (configData.security.password) {
      const pwd = configData.security.password;
      if (pwd.minLength && (pwd.minLength < 6 || pwd.minLength > 128)) {
        errors.push('Password minimum length must be between 6 and 128');
      }
    }
    
    if (configData.security.sessions) {
      const sessions = configData.security.sessions;
      if (sessions.maxConcurrentSessions && sessions.maxConcurrentSessions < 1) {
        errors.push('Must allow at least one concurrent session');
      }
    }
  }
  
  // Validate billing configuration
  if (configData.billing && configData.billing.preferences) {
    const billing = configData.billing.preferences;
    if (billing.invoiceEmail && !validators.isEmail(billing.invoiceEmail)) {
      errors.push('Invalid invoice email address');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

userSettingsSchema.statics.getFeatureUsage = async function(organizationId = null) {
  const match = organizationId ? { organizationId } : {};
  
  const usage = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        apiAccessEnabled: {
          $sum: { $cond: ['$api.access.enabled', 1, 0] }
        },
        twoFactorRequired: {
          $sum: { $cond: ['$security.twoFactor.required', 1, 0] }
        },
        autoBackupEnabled: {
          $sum: { $cond: ['$data.backup.enableAutoBackup', 1, 0] }
        },
        betaParticipation: {
          $sum: { $cond: ['$features.beta.participateInBeta', 1, 0] }
        },
        experimentalFeatures: {
          $sum: { $cond: ['$features.experimental.enableExperimentalFeatures', 1, 0] }
        }
      }
    }
  ]);
  
  return usage[0] || {};
};

// ==================== Create Model ====================
const UserSettingsModel = BaseModel.createModel('UserSettings', userSettingsSchema);

module.exports = UserSettingsModel;