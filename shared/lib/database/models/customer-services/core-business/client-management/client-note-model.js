'use strict';

/**
 * @fileoverview Enhanced client note model with comprehensive activity tracking and knowledge management
 * @module servers/customer-services/modules/core-business/clients/models/client-note-model
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
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');
const EncryptionService = require('../../../../../security/encryption/encryption-service');

/**
 * Enhanced client note schema definition for enterprise knowledge management
 */
const clientNoteSchemaDefinition = {
  // ==================== Core Identity ====================
  noteId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^NOTE-[A-Z0-9]{8,}$/,
    index: true,
    immutable: true
  },

  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
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

  // ==================== Note Content ====================
  content: {
    title: {
      type: String,
      trim: true,
      maxlength: 500
    },
    body: {
      type: String,
      required: true,
      maxlength: 50000
    },
    summary: {
      type: String,
      maxlength: 1000
    },
    format: {
      type: String,
      enum: ['plain_text', 'markdown', 'html', 'rich_text'],
      default: 'plain_text'
    },
    language: {
      type: String,
      default: 'en'
    },
    wordCount: Number,
    characterCount: Number,
    readingTime: Number,
    sentiment: {
      score: {
        type: Number,
        min: -1,
        max: 1
      },
      magnitude: Number,
      label: {
        type: String,
        enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative']
      }
    }
  },

  // ==================== Note Classification ====================
  classification: {
    type: {
      type: String,
      enum: [
        'meeting', 'call', 'email', 'task', 'reminder', 'observation',
        'feedback', 'complaint', 'opportunity', 'risk', 'decision',
        'action_item', 'follow_up', 'research', 'analysis', 'strategy',
        'personal', 'technical', 'financial', 'legal', 'general'
      ],
      required: true,
      index: true
    },
    category: {
      primary: {
        type: String,
        enum: [
          'sales', 'support', 'technical', 'financial', 'legal',
          'operational', 'strategic', 'relationship', 'compliance', 'general'
        ],
        required: true
      },
      secondary: [String]
    },
    subtype: String,
    importance: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'fyi'],
      default: 'medium',
      index: true
    },
    urgency: {
      type: String,
      enum: ['immediate', 'urgent', 'normal', 'low', 'none'],
      default: 'normal'
    },
    sensitivity: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted', 'personal'],
      default: 'internal'
    },
    tags: {
      system: [String],
      user: [String],
      auto: [String]
    }
  },

  // ==================== Context & Relationships ====================
  context: {
    source: {
      type: {
        type: String,
        enum: ['manual', 'meeting', 'call', 'email', 'chat', 'portal', 'api', 'integration', 'import']
      },
      referenceId: String,
      url: String
    },
    relatedTo: {
      projects: [{
        projectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project'
        },
        projectName: String,
        relevance: {
          type: String,
          enum: ['primary', 'secondary', 'mentioned']
        }
      }],
      engagements: [{
        engagementId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Engagement'
        },
        engagementName: String
      }],
      contacts: [{
        contactId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ClientContact'
        },
        contactName: String,
        role: String
      }],
      documents: [{
        documentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ClientDocument'
        },
        documentName: String,
        reference: String
      }],
      opportunities: [{
        opportunityId: String,
        opportunityName: String,
        stage: String
      }],
      tickets: [{
        ticketId: String,
        ticketNumber: String,
        status: String
      }]
    },
    meeting: {
      meetingId: String,
      title: String,
      date: Date,
      attendees: [{
        name: String,
        email: String,
        role: String,
        organization: String
      }],
      duration: Number,
      location: String,
      agenda: [String],
      recordingUrl: String
    },
    interaction: {
      type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'chat', 'video', 'in_person']
      },
      date: Date,
      duration: Number,
      participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }],
      outcome: String
    }
  },

  // ==================== Action Items & Follow-ups ====================
  actionItems: [{
    itemId: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dueDate: Date,
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'],
      default: 'pending'
    },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String,
    dependencies: [String],
    reminders: [{
      date: Date,
      sent: Boolean,
      method: String
    }]
  }],

  followUps: [{
    followUpId: String,
    type: {
      type: String,
      enum: ['task', 'call', 'email', 'meeting', 'review', 'decision']
    },
    description: String,
    scheduledFor: Date,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'postponed'],
      default: 'scheduled'
    },
    completedAt: Date,
    outcome: String,
    nextSteps: String
  }],

  // ==================== Mentions & References ====================
  mentions: {
    users: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notified: {
        type: Boolean,
        default: false
      },
      notifiedAt: Date,
      acknowledged: Boolean,
      acknowledgedAt: Date
    }],
    contacts: [{
      contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientContact'
      },
      context: String
    }],
    organizations: [{
      name: String,
      context: String
    }],
    topics: [String],
    keywords: {
      manual: [String],
      extracted: [String],
      frequency: {
        type: Map,
        of: Number
      }
    }
  },

  // ==================== Attachments & Media ====================
  attachments: [{
    attachmentId: String,
    type: {
      type: String,
      enum: ['document', 'image', 'video', 'audio', 'link', 'code', 'data']
    },
    name: String,
    description: String,
    url: String,
    thumbnailUrl: String,
    size: Number,
    mimeType: String,
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    accessibility: {
      altText: String,
      transcript: String
    }
  }],

  links: [{
    url: {
      type: String,
      required: true
    },
    title: String,
    description: String,
    type: {
      type: String,
      enum: ['reference', 'resource', 'documentation', 'external', 'internal']
    },
    preview: {
      title: String,
      description: String,
      image: String,
      favicon: String
    },
    clickCount: {
      type: Number,
      default: 0
    },
    lastClicked: Date
  }],

  // ==================== Visibility & Access ====================
  visibility: {
    scope: {
      type: String,
      enum: ['private', 'team', 'department', 'organization', 'client_visible'],
      default: 'team',
      index: true
    },
    teams: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    }],
    departments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    }],
    sharedWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      permission: {
        type: String,
        enum: ['view', 'comment', 'edit', 'admin'],
        default: 'view'
      },
      sharedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      sharedAt: Date,
      expiresAt: Date
    }],
    clientVisible: {
      enabled: {
        type: Boolean,
        default: false
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      visibleToContacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientContact'
      }]
    },
    restrictions: {
      noExport: Boolean,
      noCopy: Boolean,
      noForward: Boolean,
      watermark: Boolean
    }
  },

  // ==================== Collaboration & Interactions ====================
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
      editedAt: Date,
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
      reactions: [{
        type: {
          type: String,
          enum: ['like', 'helpful', 'insightful', 'question', 'concern']
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        addedAt: Date
      }]
    }],
    contributors: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        enum: ['author', 'editor', 'reviewer', 'approver', 'viewer']
      },
      contributions: [{
        type: {
          type: String,
          enum: ['created', 'edited', 'commented', 'reviewed', 'approved']
        },
        timestamp: Date,
        description: String
      }],
      lastContribution: Date
    }],
    votes: {
      upvotes: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        votedAt: Date
      }],
      downvotes: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        votedAt: Date
      }],
      score: {
        type: Number,
        default: 0
      }
    },
    bookmarks: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      bookmarkedAt: Date,
      folder: String,
      tags: [String]
    }]
  },

  // ==================== Templates & Automation ====================
  template: {
    isTemplate: {
      type: Boolean,
      default: false
    },
    templateId: String,
    templateName: String,
    templateCategory: String,
    placeholders: [{
      key: String,
      description: String,
      defaultValue: String,
      required: Boolean
    }],
    usageCount: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  },

  automation: {
    triggers: [{
      type: {
        type: String,
        enum: ['event', 'schedule', 'condition', 'webhook']
      },
      event: String,
      schedule: String,
      condition: String,
      action: String,
      enabled: Boolean,
      lastTriggered: Date
    }],
    rules: [{
      name: String,
      condition: String,
      action: String,
      enabled: Boolean,
      priority: Number
    }],
    notifications: [{
      type: {
        type: String,
        enum: ['email', 'sms', 'push', 'slack', 'teams', 'webhook']
      },
      recipients: [String],
      template: String,
      trigger: String,
      sent: Boolean,
      sentAt: Date
    }]
  },

  // ==================== Analytics & Insights ====================
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
        device: String
      }]
    },
    engagement: {
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      interactions: {
        type: Number,
        default: 0
      },
      shares: {
        type: Number,
        default: 0
      },
      exports: {
        type: Number,
        default: 0
      },
      timeSpent: Number,
      lastInteraction: Date
    },
    usefulness: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      ratedBy: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        rating: Number,
        ratedAt: Date,
        feedback: String
      }],
      averageRating: Number,
      totalRatings: {
        type: Number,
        default: 0
      }
    },
    impact: {
      decisionsInfluenced: Number,
      actionsGenerated: Number,
      referencedIn: [{
        type: {
          type: String,
          enum: ['note', 'document', 'project', 'decision', 'report']
        },
        referenceId: String,
        referencedAt: Date
      }],
      outcomes: [{
        description: String,
        impact: {
          type: String,
          enum: ['high', 'medium', 'low']
        },
        measuredAt: Date
      }]
    },
    trends: {
      viewTrend: {
        type: String,
        enum: ['increasing', 'stable', 'decreasing']
      },
      engagementTrend: {
        type: String,
        enum: ['increasing', 'stable', 'decreasing']
      },
      lastAnalyzed: Date
    }
  },

  // ==================== AI & Intelligence ====================
  intelligence: {
    analysis: {
      performed: {
        type: Boolean,
        default: false
      },
      performedAt: Date,
      engine: String,
      results: {
        summary: String,
        keyPoints: [String],
        entities: [{
          type: String,
          value: String,
          confidence: Number
        }],
        topics: [{
          topic: String,
          relevance: Number
        }],
        suggestions: [{
          type: {
            type: String,
            enum: ['action', 'follow_up', 'risk', 'opportunity']
          },
          description: String,
          priority: String,
          confidence: Number
        }]
      }
    },
    classification: {
      autoClassified: Boolean,
      confidence: Number,
      suggestedTags: [String],
      suggestedCategory: String,
      reviewRequired: Boolean
    },
    insights: [{
      type: {
        type: String,
        enum: ['pattern', 'anomaly', 'trend', 'correlation', 'prediction']
      },
      description: String,
      confidence: Number,
      evidence: [String],
      generatedAt: Date,
      validatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    relatedContent: [{
      type: {
        type: String,
        enum: ['note', 'document', 'knowledge_base', 'external']
      },
      contentId: String,
      title: String,
      relevanceScore: Number,
      reason: String
    }]
  },

  // ==================== Version Control ====================
  versioning: {
    version: {
      type: Number,
      default: 1
    },
    revisions: [{
      revisionId: String,
      version: Number,
      content: {
        title: String,
        body: String
      },
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changedAt: Date,
      changeDescription: String,
      diff: {
        additions: Number,
        deletions: Number,
        changes: [String]
      }
    }],
    lastModified: {
      date: Date,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String
    },
    locked: {
      isLocked: {
        type: Boolean,
        default: false
      },
      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      lockedAt: Date,
      reason: String
    }
  },

  // ==================== Reminders & Scheduling ====================
  reminders: [{
    reminderId: String,
    type: {
      type: String,
      enum: ['follow_up', 'review', 'action', 'expiry', 'custom']
    },
    description: String,
    remindAt: Date,
    remindWho: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    frequency: {
      type: String,
      enum: ['once', 'daily', 'weekly', 'monthly', 'custom']
    },
    customSchedule: String,
    status: {
      type: String,
      enum: ['active', 'sent', 'acknowledged', 'snoozed', 'cancelled'],
      default: 'active'
    },
    sentAt: Date,
    acknowledgedAt: Date,
    snoozedUntil: Date
  }],

  scheduling: {
    publishAt: Date,
    expiresAt: Date,
    archiveAt: Date,
    reviewCycle: {
      frequency: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'annually', 'custom']
      },
      nextReview: Date,
      lastReviewed: Date,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },

  // ==================== Knowledge Management ====================
  knowledge: {
    category: {
      type: String,
      enum: ['best_practice', 'lesson_learned', 'solution', 'issue', 'faq', 'guideline', 'policy']
    },
    value: {
      type: String,
      enum: ['high', 'medium', 'low']
    },
    applicability: {
      scope: {
        type: String,
        enum: ['specific', 'team', 'department', 'organization', 'universal']
      },
      contexts: [String],
      industries: [String],
      scenarios: [String]
    },
    verification: {
      verified: {
        type: Boolean,
        default: false
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date,
      evidence: [String]
    },
    lifecycle: {
      stage: {
        type: String,
        enum: ['draft', 'review', 'approved', 'published', 'archived', 'deprecated']
      },
      publishedAt: Date,
      deprecatedAt: Date,
      replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClientNote'
      }
    }
  },

  // ==================== Compliance & Audit ====================
  compliance: {
    retention: {
      policy: {
        type: String,
        enum: ['permanent', 'temporary', 'legal_hold', 'client_requirement']
      },
      retainUntil: Date,
      legalHold: {
        enabled: Boolean,
        reason: String,
        setBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        setAt: Date
      }
    },
    privacy: {
      containsPii: Boolean,
      piiTypes: [String],
      redacted: Boolean,
      encryptionRequired: Boolean
    },
    audit: {
      required: Boolean,
      auditLog: [{
        action: {
          type: String,
          enum: ['created', 'viewed', 'edited', 'shared', 'exported', 'deleted', 'restored']
        },
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        performedAt: Date,
        details: String,
        ipAddress: String,
        userAgent: String
      }]
    },
    regulatory: {
      requirements: [String],
      compliant: Boolean,
      lastReview: Date,
      nextReview: Date
    }
  },

  // ==================== Search & Discovery ====================
  searchOptimization: {
    keywords: {
      primary: [String],
      secondary: [String],
      semantic: [String]
    },
    searchRank: {
      type: Number,
      default: 0
    },
    searchHits: {
      type: Number,
      default: 0
    },
    clickThroughRate: Number,
    relatedSearches: [String]
  },

  discovery: {
    featured: {
      isFeatured: {
        type: Boolean,
        default: false
      },
      featuredAt: Date,
      featuredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      featuredUntil: Date
    },
    recommended: {
      score: Number,
      reasons: [String],
      recommendedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    },
    trending: {
      isTrending: Boolean,
      trendScore: Number,
      trendingSince: Date
    }
  },

  // ==================== Integration & External Systems ====================
  integrations: {
    externalIds: {
      salesforce: String,
      hubspot: String,
      jira: String,
      confluence: String,
      sharepoint: String,
      custom: {
        type: Map,
        of: String
      }
    },
    syncStatus: {
      lastSync: Date,
      nextSync: Date,
      syncErrors: [{
        date: Date,
        system: String,
        error: String,
        resolved: Boolean
      }]
    },
    webhooks: [{
      event: String,
      url: String,
      lastTriggered: Date,
      status: String
    }]
  },

  // ==================== Custom Fields & Metadata ====================
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  metadata: {
    source: {
      type: String,
      enum: ['manual', 'meeting', 'call', 'email', 'import', 'api', 'integration', 'ai_generated']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    importBatch: String,
    importedFrom: String,
    originalFormat: String,
    flags: {
      isPinned: {
        type: Boolean,
        default: false
      },
      isImportant: {
        type: Boolean,
        default: false
      },
      requiresReview: {
        type: Boolean,
        default: false
      },
      hasIssues: {
        type: Boolean,
        default: false
      }
    },
    qualityScore: {
      completeness: Number,
      accuracy: Number,
      relevance: Number,
      overall: Number
    }
  },

  // ==================== Search Tokens ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Status & Lifecycle ====================
  status: {
    current: {
      type: String,
      enum: ['draft', 'active', 'archived', 'deleted'],
      default: 'active',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
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
    archivedAt: Date,
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    archiveReason: String
  }
};

const clientNoteSchema = new Schema(clientNoteSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// ==================== Indexes ====================
clientNoteSchema.index({ tenantId: 1, noteId: 1 }, { unique: true });
clientNoteSchema.index({ tenantId: 1, clientId: 1, 'status.current': 1 });
clientNoteSchema.index({ tenantId: 1, 'classification.type': 1 });
clientNoteSchema.index({ tenantId: 1, 'classification.importance': 1 });
clientNoteSchema.index({ tenantId: 1, 'visibility.scope': 1 });
clientNoteSchema.index({ tenantId: 1, 'metadata.createdBy': 1 });
clientNoteSchema.index({ tenantId: 1, 'actionItems.assignedTo': 1, 'actionItems.status': 1 });
clientNoteSchema.index({ tenantId: 1, 'status.isActive': 1, 'status.isDeleted': 1 });
clientNoteSchema.index({ tenantId: 1, searchTokens: 1 });
clientNoteSchema.index({ tenantId: 1, createdAt: -1 });

// Text search index
clientNoteSchema.index({
  'content.title': 'text',
  'content.body': 'text',
  'content.summary': 'text',
  'mentions.keywords.manual': 'text'
});

// ==================== Virtual Fields ====================
clientNoteSchema.virtual('displayTitle').get(function() {
  return this.content.title || this.content.body.substring(0, 100) + '...';
});

clientNoteSchema.virtual('hasActionItems').get(function() {
  return this.actionItems.some(item => item.status === 'pending' || item.status === 'in_progress');
});

clientNoteSchema.virtual('pendingActionItems').get(function() {
  return this.actionItems.filter(item => item.status === 'pending' || item.status === 'in_progress');
});

clientNoteSchema.virtual('overdueActionItems').get(function() {
  const now = new Date();
  return this.actionItems.filter(item => 
    item.status === 'pending' && item.dueDate && item.dueDate < now
  );
});

clientNoteSchema.virtual('engagementScore').get(function() {
  const views = this.analytics.views.total || 0;
  const interactions = this.analytics.engagement.interactions || 0;
  const rating = this.analytics.usefulness.averageRating || 0;
  const comments = this.collaboration.comments.length || 0;
  
  return Math.min(100, (views * 0.2) + (interactions * 0.3) + (rating * 10) + (comments * 5));
});

clientNoteSchema.virtual('isEditable').get(function() {
  return !this.versioning.locked.isLocked && 
         this.status.current !== 'archived' && 
         !this.status.isDeleted;
});

clientNoteSchema.virtual('needsReview').get(function() {
  return this.scheduling.reviewCycle?.nextReview && 
         this.scheduling.reviewCycle.nextReview < new Date();
});

// ==================== Pre-save Middleware ====================
clientNoteSchema.pre('save', async function(next) {
  try {
    // Generate note ID if not provided
    if (!this.noteId && this.isNew) {
      this.noteId = await this.constructor.generateNoteId(this.tenantId);
    }

    // Update content metrics
    if (this.isModified('content.body')) {
      this.updateContentMetrics();
    }

    // Update search tokens
    this.updateSearchTokens();

    // Extract keywords if modified
    if (this.isModified('content.body')) {
      this.extractKeywords();
    }

    // Auto-generate summary if not provided
    if (this.isModified('content.body') && !this.content.summary) {
      this.generateSummary();
    }

    // Update engagement score
    this.calculateEngagementScore();

    // Check for mentions
    if (this.isModified('content.body')) {
      this.extractMentions();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
clientNoteSchema.methods.updateContentMetrics = function() {
  const body = this.content.body || '';
  this.content.wordCount = body.split(/\s+/).filter(word => word.length > 0).length;
  this.content.characterCount = body.length;
  
  // Estimate reading time (200 words per minute)
  this.content.readingTime = Math.ceil(this.content.wordCount / 200);
};

clientNoteSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  // Add title tokens
  if (this.content.title) {
    this.content.title.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  // Add important words from body (first 500 characters)
  const bodyPreview = this.content.body.substring(0, 500);
  bodyPreview.toLowerCase().split(/\s+/)
    .filter(word => word.length > 3)
    .forEach(token => tokens.add(token));
  
  // Add tags
  [...(this.classification.tags.user || []), 
   ...(this.classification.tags.system || [])].forEach(tag => 
    tokens.add(tag.toLowerCase())
  );
  
  // Add keywords
  if (this.mentions.keywords.manual) {
    this.mentions.keywords.manual.forEach(keyword => tokens.add(keyword.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens).slice(0, 100); // Limit to 100 tokens
};

clientNoteSchema.methods.extractKeywords = function() {
  const body = this.content.body.toLowerCase();
  const words = body.split(/\s+/).filter(word => word.length > 4);
  
  // Simple keyword frequency analysis
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  // Get top keywords
  const keywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
  
  this.mentions.keywords.extracted = keywords;
  this.mentions.keywords.frequency = new Map(Object.entries(frequency).slice(0, 20));
};

clientNoteSchema.methods.generateSummary = function() {
  // Simple summary generation (first 3 sentences or 200 characters)
  const sentences = this.content.body.match(/[^.!?]+[.!?]+/g) || [];
  const summary = sentences.slice(0, 3).join(' ');
  
  this.content.summary = summary.length > 200 
    ? summary.substring(0, 197) + '...'
    : summary;
};

clientNoteSchema.methods.extractMentions = function() {
  const body = this.content.body;
  
  // Extract @mentions (simplified)
  const userMentions = body.match(/@\w+/g) || [];
  // In production, would map these to actual user IDs
  
  // Extract hashtags as topics
  const topics = body.match(/#\w+/g) || [];
  this.mentions.topics = topics.map(t => t.substring(1));
};

clientNoteSchema.methods.calculateEngagementScore = function() {
  let score = 0;
  
  // Views contribute 30%
  score += Math.min(30, this.analytics.views.total * 0.3);
  
  // Interactions contribute 30%
  score += Math.min(30, this.analytics.engagement.interactions * 0.5);
  
  // Comments contribute 20%
  score += Math.min(20, this.collaboration.comments.length * 2);
  
  // Usefulness rating contributes 20%
  if (this.analytics.usefulness.averageRating) {
    score += (this.analytics.usefulness.averageRating / 5) * 20;
  }
  
  this.analytics.engagement.score = Math.round(score);
};

clientNoteSchema.methods.addActionItem = async function(actionData, userId) {
  const actionItem = {
    itemId: `ACT-${Date.now()}`,
    description: actionData.description,
    assignedTo: actionData.assignedTo,
    dueDate: actionData.dueDate,
    priority: actionData.priority || 'medium',
    status: 'pending',
    notes: actionData.notes,
    dependencies: actionData.dependencies
  };
  
  this.actionItems.push(actionItem);
  
  await this.save();
  
  logger.info('Action item added to note', {
    noteId: this.noteId,
    actionItemId: actionItem.itemId,
    assignedTo: actionData.assignedTo
  });
  
  return actionItem;
};

clientNoteSchema.methods.completeActionItem = async function(itemId, userId, notes) {
  const actionItem = this.actionItems.find(item => item.itemId === itemId);
  
  if (!actionItem) {
    throw new AppError('Action item not found', 404, 'ACTION_ITEM_NOT_FOUND');
  }
  
  actionItem.status = 'completed';
  actionItem.completedAt = new Date();
  actionItem.completedBy = userId;
  if (notes) {
    actionItem.notes = (actionItem.notes ? actionItem.notes + '\n' : '') + notes;
  }
  
  await this.save();
  
  logger.info('Action item completed', {
    noteId: this.noteId,
    actionItemId: itemId,
    completedBy: userId
  });
};

clientNoteSchema.methods.addComment = async function(commentData, userId) {
  const comment = {
    commentId: `COM-${Date.now()}`,
    content: commentData.content,
    author: userId,
    createdAt: new Date()
  };
  
  this.collaboration.comments.push(comment);
  this.analytics.engagement.interactions += 1;
  this.analytics.engagement.lastInteraction = new Date();
  
  await this.save();
  
  return comment;
};

clientNoteSchema.methods.shareWith = async function(shareData, userId) {
  const share = {
    userId: shareData.userId,
    permission: shareData.permission || 'view',
    sharedBy: userId,
    sharedAt: new Date(),
    expiresAt: shareData.expiresAt
  };
  
  // Check if already shared
  const existing = this.visibility.sharedWith.find(s => 
    s.userId.toString() === shareData.userId.toString()
  );
  
  if (existing) {
    existing.permission = share.permission;
    existing.expiresAt = share.expiresAt;
  } else {
    this.visibility.sharedWith.push(share);
  }
  
  this.analytics.engagement.shares += 1;
  
  await this.save();
  
  logger.info('Note shared', {
    noteId: this.noteId,
    sharedWith: shareData.userId,
    permission: share.permission
  });
  
  return share;
};

clientNoteSchema.methods.recordView = async function(userId, duration) {
  this.analytics.views.total += 1;
  this.analytics.views.lastViewed = new Date();
  
  // Check if unique view (not viewed by this user in last 24 hours)
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
  
  // Update engagement
  this.analytics.engagement.interactions += 1;
  if (duration) {
    this.analytics.engagement.timeSpent = (this.analytics.engagement.timeSpent || 0) + duration;
  }
  
  await this.save();
};

clientNoteSchema.methods.addRevision = async function(changes, userId, description) {
  const revision = {
    revisionId: `REV-${Date.now()}`,
    version: this.versioning.version + 1,
    content: {
      title: this.content.title,
      body: this.content.body
    },
    changedBy: userId,
    changedAt: new Date(),
    changeDescription: description
  };
  
  // Calculate diff (simplified)
  const oldLength = this.content.body.length;
  const newLength = changes.body ? changes.body.length : oldLength;
  revision.diff = {
    additions: Math.max(0, newLength - oldLength),
    deletions: Math.max(0, oldLength - newLength),
    changes: []
  };
  
  this.versioning.revisions.unshift(revision);
  this.versioning.revisions = this.versioning.revisions.slice(0, 50); // Keep last 50 revisions
  
  // Update content
  if (changes.title) this.content.title = changes.title;
  if (changes.body) this.content.body = changes.body;
  
  this.versioning.version += 1;
  this.versioning.lastModified = {
    date: new Date(),
    by: userId,
    reason: description
  };
  
  await this.save();
  
  logger.info('Note revision created', {
    noteId: this.noteId,
    version: this.versioning.version,
    changedBy: userId
  });
  
  return revision;
};

clientNoteSchema.methods.archive = async function(userId, reason) {
  this.status.current = 'archived';
  this.status.isActive = false;
  this.status.archivedAt = new Date();
  this.status.archivedBy = userId;
  this.status.archiveReason = reason;
  
  await this.save();
  
  logger.info('Note archived', {
    noteId: this.noteId,
    archivedBy: userId,
    reason
  });
};

// ==================== Static Methods ====================
clientNoteSchema.statics.generateNoteId = async function(tenantId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = stringHelper.generateRandomString(4).toUpperCase();
  return `NOTE-${timestamp}-${random}`;
};

clientNoteSchema.statics.findByClient = async function(clientId, options = {}) {
  const {
    type,
    importance,
    includeArchived = false,
    limit = 50,
    skip = 0,
    sort = { createdAt: -1 }
  } = options;
  
  const query = {
    clientId,
    'status.isDeleted': false
  };
  
  if (!includeArchived) {
    query['status.current'] = { $ne: 'archived' };
  }
  
  if (type) {
    query['classification.type'] = type;
  }
  
  if (importance) {
    query['classification.importance'] = importance;
  }
  
  const [notes, total] = await Promise.all([
    this.find(query)
      .populate('metadata.createdBy', 'profile.firstName profile.lastName email')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -content.body'),
    this.countDocuments(query)
  ]);
  
  return {
    notes,
    total,
    hasMore: total > skip + notes.length
  };
};

clientNoteSchema.statics.searchNotes = async function(tenantId, searchQuery, options = {}) {
  const {
    clientId,
    filters = {},
    limit = 20,
    skip = 0,
    sort = { 'analytics.engagement.score': -1 }
  } = options;
  
  const query = {
    tenantId,
    'status.isDeleted': false,
    'status.current': 'active',
    $or: [
      { 'content.title': new RegExp(searchQuery, 'i') },
      { 'content.summary': new RegExp(searchQuery, 'i') },
      { 'mentions.keywords.manual': new RegExp(searchQuery, 'i') },
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
  
  const [notes, total] = await Promise.all([
    this.find(query)
      .populate('clientId', 'companyName clientCode')
      .populate('metadata.createdBy', 'profile.firstName profile.lastName')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens -content.body'),
    this.countDocuments(query)
  ]);
  
  return {
    notes,
    total,
    hasMore: total > skip + notes.length
  };
};

clientNoteSchema.statics.getActionItemsSummary = async function(tenantId, options = {}) {
  const { assignedTo, clientId, daysAhead = 30 } = options;
  
  const match = {
    tenantId,
    'status.isDeleted': false,
    'actionItems.status': { $in: ['pending', 'in_progress'] }
  };
  
  if (assignedTo) {
    match['actionItems.assignedTo'] = assignedTo;
  }
  
  if (clientId) {
    match.clientId = clientId;
  }
  
  const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  
  const summary = await this.aggregate([
    { $match: match },
    { $unwind: '$actionItems' },
    { $match: { 'actionItems.status': { $in: ['pending', 'in_progress'] } } },
    {
      $facet: {
        byPriority: [
          {
            $group: {
              _id: '$actionItems.priority',
              count: { $sum: 1 }
            }
          }
        ],
        overdue: [
          {
            $match: {
              'actionItems.dueDate': { $lt: new Date() }
            }
          },
          { $count: 'count' }
        ],
        upcoming: [
          {
            $match: {
              'actionItems.dueDate': {
                $gte: new Date(),
                $lte: futureDate
              }
            }
          },
          { $count: 'count' }
        ],
        byAssignee: [
          {
            $group: {
              _id: '$actionItems.assignedTo',
              count: { $sum: 1 }
            }
          },
          { $limit: 10 }
        ]
      }
    }
  ]);
  
  return summary[0];
};

/**
 * Export schema for ConnectionManager registration
 * This allows the ConnectionManager to create the model with specific database connections
 */
module.exports = {
    schema: clientNoteSchema,
    modelName: 'ClientNote',

    // Legacy export for backward compatibility
    // This will be used if imported directly in environments without ConnectionManager
    createModel: function (connection) {
        if (connection) {
            return connection.model('ClientNote', clientNoteSchema)
        } else {
            // Fallback to default mongoose connection
            return mongoose.model('ClientNote', clientNoteSchema)
        }
    }
}

// For backward compatibility, also exports as direct model
module.exports.ClientNote = mongoose.model('ClientNote', clientNoteSchema)
module.exports.clientNoteSchema = clientNoteSchema;