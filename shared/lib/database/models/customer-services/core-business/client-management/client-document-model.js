'use strict';

/**
 * @fileoverview Enhanced client document model with comprehensive document management and versioning
 * @module servers/customer-services/modules/core-business/clients/models/client-document-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
// const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
// const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
// const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * Enhanced client document schema definition for enterprise document management
 */
const clientDocumentSchemaDefinition = {
  // ==================== Core Identity ====================
  documentId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^DOC-[A-Z0-9]{10,}$/,
    index: true,
    immutable: true
  },

  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },

  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },

  engagementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Engagement',
    index: true
  },

  // ==================== Multi-Tenancy & Organization ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Document Information ====================
  documentInfo: {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 500
    },
    description: {
      type: String,
      maxlength: 5000
    },
    type: {
      type: String,
      enum: [
        'contract', 'proposal', 'invoice', 'report', 'presentation',
        'specification', 'requirement', 'design', 'legal', 'financial',
        'technical', 'meeting_notes', 'correspondence', 'certificate',
        'policy', 'procedure', 'template', 'form', 'image', 'video', 'other'
      ],
      required: true,
      index: true
    },
    category: {
      primary: {
        type: String,
        enum: [
          'business', 'legal', 'financial', 'technical', 'operational',
          'marketing', 'hr', 'compliance', 'strategic', 'administrative'
        ],
        required: true
      },
      secondary: [String],
      custom: [String]
    },
    classification: {
      level: {
        type: String,
        enum: ['public', 'internal', 'confidential', 'restricted', 'top_secret'],
        default: 'internal',
        index: true
      },
      handling: {
        type: String,
        enum: ['standard', 'sensitive', 'pii', 'phi', 'pci', 'classified']
      },
      markings: [String]
    },
    language: {
      type: String,
      default: 'en'
    },
    keywords: [String],
    abstract: {
      type: String,
      maxlength: 2000
    }
  },

  // ==================== File Details ====================
  fileDetails: {
    originalName: {
      type: String,
      required: true
    },
    fileName: {
      type: String,
      required: true
    },
    fileExtension: {
      type: String,
      required: true,
      lowercase: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    encoding: String,
    checksum: {
      md5: String,
      sha256: String
    },
    dimensions: {
      width: Number,
      height: Number,
      duration: Number,
      pages: Number
    },
    metadata: {
      author: String,
      creator: String,
      producer: String,
      subject: String,
      title: String,
      creationDate: Date,
      modificationDate: Date,
      extractedText: {
        type: String,
        select: false
      },
      customProperties: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    }
  },

  // ==================== Storage & Location ====================
  storage: {
    provider: {
      type: String,
      enum: ['aws_s3', 'azure_blob', 'gcp_storage', 'local', 'sharepoint', 'dropbox', 'box'],
      required: true
    },
    location: {
      bucket: String,
      path: String,
      region: String
    },
    url: {
      type: String,
      required: true
    },
    publicUrl: String,
    thumbnailUrl: String,
    cdnUrl: String,
    signedUrl: {
      url: String,
      expiresAt: Date
    },
    backup: {
      enabled: Boolean,
      location: String,
      lastBackup: Date
    },
    encryption: {
      enabled: {
        type: Boolean,
        default: true
      },
      algorithm: String,
      keyId: String
    },
    compression: {
      enabled: Boolean,
      algorithm: String,
      originalSize: Number
    }
  },

  // ==================== Version Control ====================
  versioning: {
    version: {
      major: {
        type: Number,
        default: 1
      },
      minor: {
        type: Number,
        default: 0
      },
      patch: {
        type: Number,
        default: 0
      },
      label: String
    },
    versionString: {
      type: String,
      default: '1.0.0'
    },
    isLatest: {
      type: Boolean,
      default: true,
      index: true
    },
    isDraft: {
      type: Boolean,
      default: false
    },
    parentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientDocument'
    },
    versionHistory: [{
      versionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientDocument'
      },
      version: String,
      createdAt: Date,
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changeNotes: String,
      size: Number
    }],
    changeLog: [{
      version: String,
      date: Date,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changes: [String],
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // ==================== Access Control & Permissions ====================
  accessControl: {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    permissions: {
      public: {
        type: Boolean,
        default: false
      },
      inherited: {
        type: Boolean,
        default: true
      },
      groups: [{
        groupId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Group'
        },
        permissions: {
          read: Boolean,
          write: Boolean,
          delete: Boolean,
          share: Boolean,
          download: Boolean
        }
      }],
      users: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        permissions: {
          read: Boolean,
          write: Boolean,
          delete: Boolean,
          share: Boolean,
          download: Boolean
        },
        grantedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        grantedAt: Date,
        expiresAt: Date
      }],
      roles: [{
        role: String,
        permissions: {
          read: Boolean,
          write: Boolean,
          delete: Boolean,
          share: Boolean,
          download: Boolean
        }
      }]
    },
    sharing: {
      isShared: {
        type: Boolean,
        default: false
      },
      sharedWith: [{
        type: {
          type: String,
          enum: ['user', 'group', 'external', 'public_link']
        },
        recipientId: String,
        recipientEmail: String,
        permissions: {
          view: Boolean,
          comment: Boolean,
          edit: Boolean,
          download: Boolean
        },
        sharedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        sharedAt: Date,
        expiresAt: Date,
        accessCount: {
          type: Number,
          default: 0
        },
        lastAccessedAt: Date
      }],
      publicLink: {
        enabled: Boolean,
        url: String,
        shortUrl: String,
        password: {
          type: String,
          select: false
        },
        expiresAt: Date,
        maxDownloads: Number,
        downloadCount: {
          type: Number,
          default: 0
        },
        requiresAuth: Boolean
      }
    },
    restrictions: {
      downloadDisabled: Boolean,
      printDisabled: Boolean,
      copyDisabled: Boolean,
      watermark: {
        enabled: Boolean,
        text: String,
        position: String
      },
      expiryDate: Date,
      viewLimit: Number,
      viewCount: {
        type: Number,
        default: 0
      }
    }
  },

  // ==================== Document Lifecycle ====================
  lifecycle: {
    status: {
      type: String,
      enum: ['draft', 'review', 'approved', 'published', 'archived', 'obsolete', 'deleted'],
      default: 'draft',
      index: true
    },
    stage: {
      type: String,
      enum: ['creation', 'review', 'approval', 'active', 'retention', 'disposition']
    },
    workflow: {
      templateId: String,
      currentStep: String,
      steps: [{
        name: String,
        type: {
          type: String,
          enum: ['review', 'approval', 'signature', 'notification']
        },
        assignee: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        status: {
          type: String,
          enum: ['pending', 'in_progress', 'completed', 'rejected', 'skipped']
        },
        completedAt: Date,
        comments: String
      }],
      completedAt: Date
    },
    approval: {
      required: {
        type: Boolean,
        default: false
      },
      approvers: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        role: String,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'abstained']
        },
        approvedAt: Date,
        comments: String,
        signature: String
      }],
      finalApproval: {
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        approvedAt: Date,
        approvalNumber: String
      }
    },
    review: {
      nextReviewDate: Date,
      reviewFrequency: {
        value: Number,
        unit: {
          type: String,
          enum: ['days', 'weeks', 'months', 'years']
        }
      },
      lastReviewDate: Date,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewNotes: String
    },
    retention: {
      policy: {
        type: String,
        enum: ['permanent', 'temporary', 'legal_hold', 'custom']
      },
      retentionPeriod: {
        value: Number,
        unit: {
          type: String,
          enum: ['days', 'months', 'years']
        }
      },
      retentionDate: Date,
      dispositionDate: Date,
      legalHold: {
        enabled: Boolean,
        reason: String,
        setBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        setAt: Date
      }
    }
  },

  // ==================== Relationships & References ====================
  relationships: {
    relatedDocuments: [{
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientDocument'
      },
      relationship: {
        type: String,
        enum: ['parent', 'child', 'sibling', 'reference', 'supersedes', 'superseded_by', 'attachment', 'related']
      },
      description: String
    }],
    contracts: [{
      contractId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contract'
      },
      type: {
        type: String,
        enum: ['primary', 'amendment', 'attachment', 'related']
      }
    }],
    invoices: [{
      invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice'
      },
      type: String
    }],
    dependencies: [{
      type: {
        type: String,
        enum: ['requires', 'required_by', 'references', 'referenced_by']
      },
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientDocument'
      },
      description: String
    }],
    externalReferences: [{
      system: String,
      referenceId: String,
      url: String,
      description: String
    }]
  },

  // ==================== Electronic Signatures ====================
  signatures: {
    required: {
      type: Boolean,
      default: false
    },
    signatories: [{
      name: String,
      email: String,
      role: String,
      order: Number,
      status: {
        type: String,
        enum: ['pending', 'sent', 'viewed', 'signed', 'declined', 'expired'],
        default: 'pending'
      },
      signatureType: {
        type: String,
        enum: ['electronic', 'digital', 'handwritten', 'certified']
      },
      signedAt: Date,
      signatureData: {
        signature: {
          type: String,
          select: false
        },
        certificate: String,
        ipAddress: String,
        userAgent: String,
        location: {
          latitude: Number,
          longitude: Number
        }
      },
      verificationCode: {
        type: String,
        select: false
      },
      reminder: {
        sent: Boolean,
        sentAt: Date,
        count: Number
      }
    }],
    envelope: {
      provider: {
        type: String,
        enum: ['docusign', 'adobe_sign', 'hellosign', 'pandadoc', 'internal']
      },
      envelopeId: String,
      status: String,
      sentAt: Date,
      completedAt: Date,
      certificateUrl: String
    },
    auditTrail: [{
      action: String,
      performedBy: String,
      timestamp: Date,
      details: String,
      ipAddress: String
    }]
  },

  // ==================== Comments & Annotations ====================
  collaboration: {
    comments: [{
      commentId: String,
      content: {
        type: String,
        required: true
      },
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      modifiedAt: Date,
      resolved: {
        type: Boolean,
        default: false
      },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date,
      replies: [{
        content: String,
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        createdAt: Date
      }],
      mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      attachments: [String]
    }],
    annotations: [{
      annotationId: String,
      type: {
        type: String,
        enum: ['highlight', 'note', 'drawing', 'stamp', 'redaction']
      },
      content: String,
      position: {
        page: Number,
        x: Number,
        y: Number,
        width: Number,
        height: Number
      },
      style: {
        color: String,
        opacity: Number,
        fontSize: Number
      },
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      createdAt: Date,
      modifiedAt: Date
    }],
    tasks: [{
      taskId: String,
      description: String,
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      dueDate: Date,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent']
      },
      status: {
        type: String,
        enum: ['open', 'in_progress', 'completed', 'cancelled'],
        default: 'open'
      },
      completedAt: Date,
      relatedComment: String
    }]
  },

  // ==================== Analytics & Tracking ====================
  analytics: {
    views: {
      total: {
        type: Number,
        default: 0
      },
      unique: {
        type: Number,
        default: 0
      },
      lastViewed: Date,
      viewHistory: [{
        viewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        viewedAt: Date,
        duration: Number,
        device: String,
        location: String
      }]
    },
    downloads: {
      total: {
        type: Number,
        default: 0
      },
      lastDownloaded: Date,
      downloadHistory: [{
        downloadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        downloadedAt: Date,
        version: String,
        format: String,
        size: Number
      }]
    },
    shares: {
      total: {
        type: Number,
        default: 0
      },
      internal: {
        type: Number,
        default: 0
      },
      external: {
        type: Number,
        default: 0
      }
    },
    prints: {
      total: {
        type: Number,
        default: 0
      },
      lastPrinted: Date
    },
    engagement: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      timeSpent: Number,
      interactions: Number,
      lastCalculated: Date
    },
    usage: {
      citedIn: [{
        documentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ClientDocument'
        },
        citedAt: Date
      }],
      usedInProjects: Number,
      referencedBy: Number
    }
  },

  // ==================== OCR & Content Extraction ====================
  contentExtraction: {
    ocr: {
      performed: {
        type: Boolean,
        default: false
      },
      engine: String,
      language: String,
      confidence: Number,
      performedAt: Date,
      text: {
        type: String,
        select: false
      }
    },
    textContent: {
      extracted: Boolean,
      content: {
        type: String,
        select: false
      },
      wordCount: Number,
      characterCount: Number,
      language: String
    },
    metadata: {
      extracted: Boolean,
      properties: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    },
    entities: [{
      type: {
        type: String,
        enum: ['person', 'organization', 'location', 'date', 'money', 'percentage', 'email', 'phone', 'url']
      },
      value: String,
      confidence: Number,
      position: {
        page: Number,
        boundingBox: {
          x: Number,
          y: Number,
          width: Number,
          height: Number
        }
      }
    }],
    searchableContent: {
      type: String,
      select: false,
      index: 'text'
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    regulatory: {
      requirements: [{
        regulation: String,
        requirement: String,
        compliant: Boolean,
        verifiedAt: Date,
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      certifications: [{
        type: String,
        number: String,
        issuedBy: String,
        issuedAt: Date,
        expiresAt: Date
      }]
    },
    privacy: {
      containsPii: Boolean,
      piiTypes: [String],
      redacted: Boolean,
      redactionMethod: String,
      consentObtained: Boolean
    },
    audit: {
      required: Boolean,
      frequency: String,
      lastAudit: Date,
      nextAudit: Date,
      auditLog: [{
        action: {
          type: String,
          enum: ['created', 'viewed', 'downloaded', 'modified', 'shared', 'deleted', 'restored']
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        performedAt: Date,
        details: String,
        ipAddress: String,
        userAgent: String,
        result: String
      }]
    },
    dataClassification: {
      level: String,
      tags: [String],
      handlingInstructions: String
    }
  },

  // ==================== Quality & Validation ====================
  quality: {
    validation: {
      status: {
        type: String,
        enum: ['not_validated', 'validating', 'valid', 'invalid', 'partially_valid'],
        default: 'not_validated'
      },
      validatedAt: Date,
      validatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      checks: [{
        type: {
          type: String,
          enum: ['format', 'content', 'metadata', 'signature', 'integrity', 'compliance']
        },
        passed: Boolean,
        message: String,
        severity: {
          type: String,
          enum: ['info', 'warning', 'error', 'critical']
        }
      }],
      score: {
        type: Number,
        min: 0,
        max: 100
      }
    },
    integrity: {
      verified: Boolean,
      checksum: String,
      algorithm: String,
      verifiedAt: Date,
      tampering: {
        detected: Boolean,
        details: String
      }
    },
    completeness: {
      score: Number,
      missingElements: [String],
      recommendations: [String]
    }
  },

  // ==================== Processing & Transformation ====================
  processing: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    queue: {
      position: Number,
      priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
      }
    },
    jobs: [{
      type: {
        type: String,
        enum: ['ocr', 'thumbnail', 'conversion', 'compression', 'encryption', 'watermark', 'redaction']
      },
      status: String,
      startedAt: Date,
      completedAt: Date,
      result: String,
      error: String
    }],
    conversions: [{
      format: String,
      url: String,
      size: Number,
      createdAt: Date
    }],
    thumbnails: [{
      size: String,
      url: String,
      width: Number,
      height: Number
    }]
  },

  // ==================== Tags & Metadata ====================
  tags: {
    system: [String],
    user: [String],
    auto: [String],
    taxonomy: [{
      category: String,
      terms: [String]
    }]
  },

  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // ==================== System Metadata ====================
  metadata: {
    source: {
      type: String,
      enum: ['upload', 'email', 'scan', 'api', 'integration', 'migration', 'generated', 'web']
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    importBatch: String,
    flags: {
      isFavorite: {
        type: Boolean,
        default: false
      },
      isPinned: {
        type: Boolean,
        default: false
      },
      isTemplate: {
        type: Boolean,
        default: false
      },
      requiresAction: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Deletion & Archival ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  restorable: {
    type: Boolean,
    default: true
  },

  permanentDeletionDate: Date
};

// Create schema
const clientDocumentSchema = new Schema(clientDocumentSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// ==================== Indexes ====================
clientDocumentSchema.index({ tenantId: 1, documentId: 1 }, { unique: true });
clientDocumentSchema.index({ tenantId: 1, clientId: 1, 'lifecycle.status': 1 });
clientDocumentSchema.index({ tenantId: 1, projectId: 1 });
clientDocumentSchema.index({ tenantId: 1, 'documentInfo.type': 1 });
clientDocumentSchema.index({ tenantId: 1, 'documentInfo.classification.level': 1 });
clientDocumentSchema.index({ tenantId: 1, 'versioning.isLatest': 1 });
clientDocumentSchema.index({ tenantId: 1, 'accessControl.owner': 1 });
clientDocumentSchema.index({ tenantId: 1, isDeleted: 1 });
clientDocumentSchema.index({ tenantId: 1, searchTokens: 1 });
clientDocumentSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
clientDocumentSchema.index({
  'documentInfo.name': 'text',
  'documentInfo.description': 'text',
  'documentInfo.keywords': 'text',
  'contentExtraction.searchableContent': 'text'
});

// ==================== Virtual Fields ====================
clientDocumentSchema.virtual('displayName').get(function() {
  return this.documentInfo.displayName || this.documentInfo.name;
});

clientDocumentSchema.virtual('isExpired').get(function() {
  return this.accessControl.restrictions.expiryDate && 
         this.accessControl.restrictions.expiryDate < new Date();
});

clientDocumentSchema.virtual('needsReview').get(function() {
  return this.lifecycle.review.nextReviewDate && 
         this.lifecycle.review.nextReviewDate < new Date();
});

clientDocumentSchema.virtual('isShared').get(function() {
  return this.accessControl.sharing.isShared || 
         this.accessControl.sharing.sharedWith.length > 0;
});

clientDocumentSchema.virtual('currentVersion').get(function() {
  const v = this.versioning.version;
  return `${v.major}.${v.minor}.${v.patch}`;
});

clientDocumentSchema.virtual('fileSize').get(function() {
  const size = this.fileDetails.size;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
});

// ==================== Pre-save Middleware ====================
clientDocumentSchema.pre('save', async function(next) {
  try {
    // Generate document ID if not provided
    if (!this.documentId && this.isNew) {
      this.documentId = await this.constructor.generateDocumentId(this.tenantId);
    }

    // Update version string
    const v = this.versioning.version;
    this.versioning.versionString = `${v.major}.${v.minor}.${v.patch}`;

    // Update search tokens
    this.updateSearchTokens();

    // Calculate checksums if new file
    if (this.isNew && !this.fileDetails.checksum.md5) {
      // In production, calculate actual checksums
      this.fileDetails.checksum.md5 = stringHelper.generateRandomString(32);
      this.fileDetails.checksum.sha256 = stringHelper.generateRandomString(64);
    }

    // Set display name if not provided
    if (!this.documentInfo.displayName) {
      this.documentInfo.displayName = this.documentInfo.name;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
clientDocumentSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add document name tokens
  if (this.documentInfo.name) {
    this.documentInfo.name.toLowerCase().split(/[\s\-_.]+/).forEach(token => tokens.add(token));
  }
  
  // Add keywords
  if (this.documentInfo.keywords) {
    this.documentInfo.keywords.forEach(keyword => tokens.add(keyword.toLowerCase()));
  }
  
  // Add type and category
  tokens.add(this.documentInfo.type.toLowerCase());
  tokens.add(this.documentInfo.category.primary.toLowerCase());
  
  // Add tags
  [...(this.tags.system || []), ...(this.tags.user || [])].forEach(tag => 
    tokens.add(tag.toLowerCase())
  );
  
  this.searchTokens = Array.from(tokens);
};

clientDocumentSchema.methods.createVersion = async function(fileData, userId, changeNotes) {
  // Mark current version as not latest
  this.versioning.isLatest = false;
  await this.save();
  
  // Create new version
  const newVersion = new this.constructor({
    ...this.toObject(),
    _id: new mongoose.Types.ObjectId(),
    documentId: await this.constructor.generateDocumentId(this.tenantId),
    versioning: {
      version: {
        major: this.versioning.version.major,
        minor: this.versioning.version.minor + 1,
        patch: 0
      },
      isLatest: true,
      parentVersionId: this._id,
      versionHistory: [
        ...this.versioning.versionHistory,
        {
          versionId: this._id,
          version: this.versioning.versionString,
          createdAt: this.createdAt,
          createdBy: this.metadata.uploadedBy,
          size: this.fileDetails.size
        }
      ]
    },
    fileDetails: {
      ...this.fileDetails.toObject(),
      ...fileData
    },
    metadata: {
      ...this.metadata.toObject(),
      uploadedBy: userId,
      uploadedAt: new Date()
    }
  });
  
  // Add change log entry
  newVersion.versioning.changeLog.push({
    version: newVersion.versioning.versionString,
    date: new Date(),
    author: userId,
    changes: changeNotes ? [changeNotes] : ['New version created']
  });
  
  await newVersion.save();
  
  logger.info('Document version created', {
    documentId: this.documentId,
    oldVersion: this.versioning.versionString,
    newVersion: newVersion.versioning.versionString
  });
  
  return newVersion;
};

clientDocumentSchema.methods.shareDocument = async function(shareData, userId) {
  const share = {
    type: shareData.type,
    recipientId: shareData.recipientId,
    recipientEmail: shareData.recipientEmail,
    permissions: shareData.permissions,
    sharedBy: userId,
    sharedAt: new Date(),
    expiresAt: shareData.expiresAt
  };
  
  this.accessControl.sharing.sharedWith.push(share);
  this.accessControl.sharing.isShared = true;
  
  // Update analytics
  this.analytics.shares.total += 1;
  if (shareData.type === 'external') {
    this.analytics.shares.external += 1;
  } else {
    this.analytics.shares.internal += 1;
  }
  
  await this.save();
  
  logger.info('Document shared', {
    documentId: this.documentId,
    sharedWith: shareData.recipientEmail || shareData.recipientId,
    sharedBy: userId
  });
  
  return share;
};

clientDocumentSchema.methods.addComment = async function(commentData, userId) {
  const comment = {
    commentId: `COM-${Date.now()}`,
    content: commentData.content,
    author: userId,
    createdAt: new Date(),
    mentions: commentData.mentions,
    attachments: commentData.attachments
  };
  
  this.collaboration.comments.unshift(comment);
  
  await this.save();
  
  return comment;
};

clientDocumentSchema.methods.requestSignature = async function(signatories, options = {}) {
  this.signatures.required = true;
  this.signatures.signatories = signatories.map((signatory, index) => ({
    name: signatory.name,
    email: signatory.email,
    role: signatory.role,
    order: signatory.order || index + 1,
    status: 'pending',
    signatureType: signatory.signatureType || 'electronic',
    verificationCode: stringHelper.generateRandomString(6).toUpperCase()
  }));
  
  if (options.provider) {
    this.signatures.envelope = {
      provider: options.provider,
      status: 'created',
      sentAt: new Date()
    };
  }
  
  await this.save();
  
  logger.info('Signature requested for document', {
    documentId: this.documentId,
    signatories: signatories.length
  });
};

clientDocumentSchema.methods.recordSignature = async function(signatoryEmail, signatureData) {
  const signatory = this.signatures.signatories.find(s => s.email === signatoryEmail);
  
  if (!signatory) {
    throw new AppError('Signatory not found', 404, 'SIGNATORY_NOT_FOUND');
  }
  
  if (signatory.status === 'signed') {
    throw new AppError('Already signed', 400, 'ALREADY_SIGNED');
  }
  
  signatory.status = 'signed';
  signatory.signedAt = new Date();
  signatory.signatureData = signatureData;
  
  // Add to audit trail
  this.signatures.auditTrail.push({
    action: 'signed',
    performedBy: signatoryEmail,
    timestamp: new Date(),
    details: `Document signed by ${signatory.name}`,
    ipAddress: signatureData.ipAddress
  });
  
  // Check if all signatures complete
  const allSigned = this.signatures.signatories.every(s => s.status === 'signed');
  if (allSigned && this.signatures.envelope) {
    this.signatures.envelope.status = 'completed';
    this.signatures.envelope.completedAt = new Date();
  }
  
  await this.save();
  
  logger.info('Document signed', {
    documentId: this.documentId,
    signatory: signatoryEmail
  });
};

clientDocumentSchema.methods.approve = async function(userId, comments) {
  const approver = {
    userId,
    status: 'approved',
    approvedAt: new Date(),
    comments
  };
  
  if (!this.lifecycle.approval.approvers) {
    this.lifecycle.approval.approvers = [];
  }
  
  this.lifecycle.approval.approvers.push(approver);
  
  // Check if all required approvals complete
  if (this.lifecycle.approval.required) {
    // In production, check against required approvers list
    this.lifecycle.approval.finalApproval = {
      approvedBy: userId,
      approvedAt: new Date(),
      approvalNumber: `APR-${Date.now()}`
    };
    
    this.lifecycle.status = 'approved';
  }
  
  await this.save();
  
  logger.info('Document approved', {
    documentId: this.documentId,
    approvedBy: userId
  });
};

clientDocumentSchema.methods.recordView = async function(userId, duration) {
  this.analytics.views.total += 1;
  this.analytics.views.lastViewed = new Date();
  
  // Check if unique view
  const recentView = this.analytics.views.viewHistory.find(v => 
    v.viewedBy.toString() === userId.toString() &&
    v.viewedAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  
  if (!recentView) {
    this.analytics.views.unique += 1;
  }
  
  this.analytics.views.viewHistory.unshift({
    viewedBy: userId,
    viewedAt: new Date(),
    duration
  });
  
  // Keep only last 100 views
  this.analytics.views.viewHistory = this.analytics.views.viewHistory.slice(0, 100);
  
  // Update view count restrictions
  if (this.accessControl.restrictions.viewLimit) {
    this.accessControl.restrictions.viewCount += 1;
  }
  
  await this.save();
};

clientDocumentSchema.methods.recordDownload = async function(userId, format) {
  this.analytics.downloads.total += 1;
  this.analytics.downloads.lastDownloaded = new Date();
  
  this.analytics.downloads.downloadHistory.unshift({
    downloadedBy: userId,
    downloadedAt: new Date(),
    version: this.versioning.versionString,
    format: format || this.fileDetails.fileExtension,
    size: this.fileDetails.size
  });
  
  // Keep only last 100 downloads
  this.analytics.downloads.downloadHistory = this.analytics.downloads.downloadHistory.slice(0, 100);
  
  // Update public link download count
  if (this.accessControl.sharing.publicLink.enabled) {
    this.accessControl.sharing.publicLink.downloadCount += 1;
  }
  
  await this.save();
};

// ==================== Static Methods ====================
clientDocumentSchema.statics.generateDocumentId = async function(tenantId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = stringHelper.generateRandomString(6).toUpperCase();
  return `DOC-${timestamp}-${random}`;
};

clientDocumentSchema.statics.findByClient = async function(clientId, options = {}) {
  const {
    type,
    status,
    includeDeleted = false,
    onlyLatest = true,
    limit = 100,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = {
    clientId,
    isDeleted: includeDeleted ? { $in: [true, false] } : false
  };
  
  if (type) {
    query['documentInfo.type'] = type;
  }
  
  if (status) {
    query['lifecycle.status'] = status;
  }
  
  if (onlyLatest) {
    query['versioning.isLatest'] = true;
  }
  
  const [documents, total] = await Promise.all([
    this.find(query)
      .populate('metadata.uploadedBy', 'profile.firstName profile.lastName email')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -contentExtraction.searchableContent'),
    this.countDocuments(query)
  ]);
  
  return {
    documents,
    total,
    hasMore: total > skip + documents.length
  };
};

clientDocumentSchema.statics.searchDocuments = async function(tenantId, searchQuery, options = {}) {
  const {
    clientId,
    filters = {},
    limit = 20,
    skip = 0,
    sort = { 'analytics.engagement.score': -1 }
  } = options;
  
  const query = {
    tenantId,
    isDeleted: false,
    'versioning.isLatest': true,
    $or: [
      { 'documentInfo.name': new RegExp(searchQuery, 'i') },
      { 'documentInfo.description': new RegExp(searchQuery, 'i') },
      { 'documentInfo.keywords': new RegExp(searchQuery, 'i') },
      { searchTokens: new RegExp(searchQuery, 'i') }
    ]
  };
  
  if (clientId) {
    query.clientId = clientId;
  }
  
  // Apply filters
  Object.keys(filters).forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null) {
      query[key] = filters[key];
    }
  });
  
  const [documents, total] = await Promise.all([
    this.find(query)
      .populate('clientId', 'companyName clientCode')
      .populate('metadata.uploadedBy', 'profile.firstName profile.lastName')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -contentExtraction'),
    this.countDocuments(query)
  ]);
  
  return {
    documents,
    total,
    hasMore: total > skip + documents.length
  };
};

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 */
module.exports = {
    schema: clientDocumentSchema,
    modelName: 'ClientDocument',

    // Legacy export for backward compatibility
    // This will be used if imported directly in environments without ConnectionManager
    createModel: function (connection) {
        if (connection) {
            return connection.model('ClientDocument', clientDocumentSchema)
        } else {
            // Fallback to default mongoose connection
            return mongoose.model('ClientDocument', clientDocumentSchema)
        }
    }
}

// For backward compatibility, also exports as direct model
module.exports.ClientDocument = mongoose.model('ClientDocument', clientDocumentSchema);
module.exports.clientDocumentSchema = clientDocumentSchema;
