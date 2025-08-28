'use strict';

/**
 * @fileoverview Enterprise knowledge article model for comprehensive knowledge base management
 * @module servers/admin-server/modules/support-administration/models/knowledge-article-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/search-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/analytics-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const CommonValidator = require('../../../../utils/validators/common-validators');
const stringHelper = require('../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../utils/helpers/date-helper');
const cryptoHelper = require('../../../../utils/helpers/crypto-helper');
const SearchService = require('../../../../services/search-service');
const CacheService = require('../../../../services/cache-service');
const AnalyticsService = require('../../../../services/analytics-service');

/**
 * @class KnowledgeArticleSchema
 * @description Comprehensive knowledge article schema for enterprise knowledge base management
 * @extends mongoose.Schema
 */
const knowledgeArticleSchemaDefinition = {
  // ==================== Core Article Identification ====================
  articleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `KB-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for knowledge article'
  },

  articleReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      description: 'Reference to organization'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
      description: 'Reference to department'
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      sparse: true,
      description: 'Reference to related product'
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      sparse: true,
      description: 'Reference to related service'
    },
    externalId: {
      type: String,
      sparse: true,
      description: 'External system reference ID'
    }
  },

  // ==================== Article Content ====================
  content: {
    title: {
      type: String,
      required: true,
      index: 'text',
      maxlength: 300,
      description: 'Article title'
    },
    slug: {
      type: String,
      unique: true,
      index: true,
      description: 'URL-friendly slug'
    },
    summary: {
      type: String,
      maxlength: 500,
      description: 'Brief article summary'
    },
    body: {
      html: {
        type: String,
        required: true,
        maxlength: 50000,
        description: 'HTML content'
      },
      markdown: {
        type: String,
        maxlength: 50000,
        description: 'Markdown content'
      },
      plainText: {
        type: String,
        maxlength: 50000,
        description: 'Plain text content'
      }
    },
    sections: [{
      sectionId: String,
      title: String,
      content: String,
      order: Number,
      level: Number,
      anchor: String,
      subsections: [{
        subsectionId: String,
        title: String,
        content: String,
        order: Number
      }]
    }],
    keywords: [{
      keyword: String,
      relevance: Number,
      synonyms: [String]
    }],
    language: {
      primary: {
        type: String,
        default: 'en',
        index: true
      },
      translations: [{
        language: String,
        title: String,
        summary: String,
        body: mongoose.Schema.Types.Mixed,
        translatedBy: mongoose.Schema.Types.ObjectId,
        translatedAt: Date,
        approved: Boolean
      }]
    },
    readingTime: {
      minutes: Number,
      words: Number,
      lastCalculated: Date
    }
  },

  // ==================== Article Classification ====================
  classification: {
    category: {
      primary: {
        type: String,
        enum: ['GETTING_STARTED', 'HOW_TO', 'TROUBLESHOOTING', 'FAQ', 'BEST_PRACTICES', 'REFERENCE', 'TUTORIAL', 'CONCEPT', 'INTEGRATION', 'API_DOCUMENTATION', 'RELEASE_NOTES', 'POLICY'],
        required: true,
        index: true
      },
      secondary: [String],
      custom: [String]
    },
    topics: [{
      topicId: String,
      name: String,
      path: String,
      level: Number
    }],
    tags: [{
      tag: String,
      addedBy: mongoose.Schema.Types.ObjectId,
      addedAt: Date
    }],
    audience: {
      primary: {
        type: String,
        enum: ['END_USER', 'ADMINISTRATOR', 'DEVELOPER', 'SUPPORT_AGENT', 'PARTNER', 'PUBLIC', 'INTERNAL'],
        index: true
      },
      secondary: [String],
      expertise: {
        type: String,
        enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']
      }
    },
    products: [{
      productId: mongoose.Schema.Types.ObjectId,
      productName: String,
      versions: [String]
    }],
    features: [{
      featureId: String,
      featureName: String,
      module: String
    }]
  },

  // ==================== Versioning & History ====================
  versioning: {
    currentVersion: {
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
      versionString: String
    },
    versionHistory: [{
      version: String,
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      changeType: {
        type: String,
        enum: ['MAJOR_UPDATE', 'MINOR_UPDATE', 'PATCH', 'TYPO_FIX', 'FORMATTING', 'CONTENT_ADDITION', 'CONTENT_REMOVAL']
      },
      changeNotes: String,
      diff: mongoose.Schema.Types.Mixed,
      snapshot: mongoose.Schema.Types.Mixed
    }],
    isDraft: {
      type: Boolean,
      default: true,
      index: true
    },
    draftVersion: mongoose.Schema.Types.Mixed,
    publishedVersion: mongoose.Schema.Types.Mixed,
    scheduledPublish: {
      scheduled: Boolean,
      publishAt: Date,
      scheduledBy: mongoose.Schema.Types.ObjectId
    }
  },

  // ==================== Publishing & Workflow ====================
  publishing: {
    status: {
      current: {
        type: String,
        enum: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED', 'DELETED'],
        default: 'DRAFT',
        required: true,
        index: true
      },
      lastChanged: Date,
      changedBy: mongoose.Schema.Types.ObjectId
    },
    publishedAt: Date,
    publishedBy: mongoose.Schema.Types.ObjectId,
    publishChannel: [{
      channel: {
        type: String,
        enum: ['INTERNAL_KB', 'PUBLIC_KB', 'CUSTOMER_PORTAL', 'DEVELOPER_DOCS', 'HELP_CENTER', 'API']
      },
      publishedAt: Date,
      url: String,
      active: Boolean
    }],
    visibility: {
      scope: {
        type: String,
        enum: ['PUBLIC', 'AUTHENTICATED', 'ORGANIZATION', 'DEPARTMENT', 'TEAM', 'ROLE_BASED', 'CUSTOM'],
        default: 'PUBLIC',
        index: true
      },
      restrictions: {
        organizations: [mongoose.Schema.Types.ObjectId],
        departments: [mongoose.Schema.Types.ObjectId],
        teams: [mongoose.Schema.Types.ObjectId],
        roles: [String],
        users: [mongoose.Schema.Types.ObjectId]
      }
    },
    expiration: {
      expires: Boolean,
      expiresAt: Date,
      action: {
        type: String,
        enum: ['ARCHIVE', 'DELETE', 'NOTIFY', 'REVIEW']
      },
      warningDays: Number
    }
  },

  // ==================== Review & Approval ====================
  review: {
    requiresReview: {
      type: Boolean,
      default: true
    },
    currentReview: {
      reviewId: String,
      status: {
        type: String,
        enum: ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']
      },
      requestedAt: Date,
      requestedBy: mongoose.Schema.Types.ObjectId,
      assignedTo: [mongoose.Schema.Types.ObjectId],
      dueDate: Date
    },
    reviewHistory: [{
      reviewId: String,
      reviewer: mongoose.Schema.Types.ObjectId,
      reviewedAt: Date,
      decision: {
        type: String,
        enum: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']
      },
      comments: String,
      changes: mongoose.Schema.Types.Mixed,
      score: Number
    }],
    approvalWorkflow: {
      workflowId: String,
      stages: [{
        stageNumber: Number,
        stageName: String,
        approvers: [mongoose.Schema.Types.ObjectId],
        requiredApprovals: Number,
        status: String,
        completedAt: Date
      }]
    },
    qualityChecks: {
      grammarCheck: {
        passed: Boolean,
        score: Number,
        checkedAt: Date
      },
      readabilityScore: Number,
      seoScore: Number,
      accuracyVerified: Boolean,
      technicallAccurate: Boolean,
      legallyReviewed: Boolean
    }
  },

  // ==================== Authorship & Contributors ====================
  authorship: {
    primaryAuthor: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
      },
      name: String,
      email: String,
      department: String
    },
    contributors: [{
      userId: mongoose.Schema.Types.ObjectId,
      name: String,
      role: {
        type: String,
        enum: ['CO_AUTHOR', 'EDITOR', 'REVIEWER', 'TRANSLATOR', 'SUBJECT_MATTER_EXPERT']
      },
      contributions: [String],
      addedAt: Date
    }],
    ownership: {
      owner: mongoose.Schema.Types.ObjectId,
      team: mongoose.Schema.Types.ObjectId,
      department: String,
      transferHistory: [{
        from: mongoose.Schema.Types.ObjectId,
        to: mongoose.Schema.Types.ObjectId,
        transferredAt: Date,
        reason: String
      }]
    },
    expertise: {
      subjectMatterExperts: [mongoose.Schema.Types.ObjectId],
      technicalReviewers: [mongoose.Schema.Types.ObjectId],
      lastExpertReview: Date
    }
  },

  // ==================== Media & Attachments ====================
  media: {
    images: [{
      imageId: String,
      url: String,
      altText: String,
      caption: String,
      size: Number,
      dimensions: {
        width: Number,
        height: Number
      },
      format: String,
      uploadedAt: Date,
      uploadedBy: mongoose.Schema.Types.ObjectId
    }],
    videos: [{
      videoId: String,
      url: String,
      thumbnail: String,
      title: String,
      duration: Number,
      format: String,
      size: Number,
      transcript: String,
      uploadedAt: Date,
      uploadedBy: mongoose.Schema.Types.ObjectId
    }],
    attachments: [{
      attachmentId: String,
      fileName: String,
      fileType: String,
      size: Number,
      url: String,
      description: String,
      downloadCount: Number,
      uploadedAt: Date,
      uploadedBy: mongoose.Schema.Types.ObjectId
    }],
    diagrams: [{
      diagramId: String,
      type: {
        type: String,
        enum: ['FLOWCHART', 'SEQUENCE', 'ARCHITECTURE', 'NETWORK', 'UML', 'OTHER']
      },
      title: String,
      url: String,
      editableUrl: String,
      format: String
    }],
    codeSnippets: [{
      snippetId: String,
      language: String,
      code: String,
      title: String,
      description: String,
      runnable: Boolean,
      output: String
    }]
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    views: {
      total: {
        type: Number,
        default: 0,
        index: true
      },
      unique: {
        type: Number,
        default: 0
      },
      authenticated: Number,
      anonymous: Number,
      byChannel: [{
        channel: String,
        count: Number
      }],
      trend: [{
        date: Date,
        views: Number
      }]
    },
    engagement: {
      averageTimeOnPage: Number,
      bounceRate: Number,
      scrollDepth: Number,
      interactions: {
        likes: Number,
        dislikes: Number,
        shares: Number,
        bookmarks: Number,
        prints: Number,
        downloads: Number
      },
      clickThroughRate: Number
    },
    feedback: {
      helpful: {
        yes: {
          type: Number,
          default: 0
        },
        no: {
          type: Number,
          default: 0
        }
      },
      rating: {
        average: Number,
        count: Number,
        distribution: {
          one: Number,
          two: Number,
          three: Number,
          four: Number,
          five: Number
        }
      },
      comments: [{
        commentId: String,
        userId: mongoose.Schema.Types.ObjectId,
        comment: String,
        rating: Number,
        timestamp: Date,
        helpful: Boolean
      }],
      suggestions: [{
        suggestionId: String,
        userId: mongoose.Schema.Types.ObjectId,
        suggestion: String,
        status: {
          type: String,
          enum: ['PENDING', 'REVIEWED', 'IMPLEMENTED', 'DECLINED']
        },
        submittedAt: Date
      }]
    },
    search: {
      appearances: Number,
      clicks: Number,
      clickThroughRate: Number,
      averagePosition: Number,
      keywords: [{
        keyword: String,
        impressions: Number,
        clicks: Number
      }]
    },
    effectiveness: {
      ticketDeflection: Number,
      resolutionRate: Number,
      escalationReduction: Number,
      customerSatisfaction: Number,
      lastCalculated: Date
    }
  },

  // ==================== SEO & Discovery ====================
  seo: {
    metaTitle: {
      type: String,
      maxlength: 70
    },
    metaDescription: {
      type: String,
      maxlength: 160
    },
    canonicalUrl: String,
    ogTags: {
      title: String,
      description: String,
      image: String,
      type: String
    },
    structuredData: mongoose.Schema.Types.Mixed,
    robots: {
      index: {
        type: Boolean,
        default: true
      },
      follow: {
        type: Boolean,
        default: true
      },
      snippet: Boolean,
      archive: Boolean
    },
    sitemap: {
      include: {
        type: Boolean,
        default: true
      },
      priority: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      },
      changeFrequency: {
        type: String,
        enum: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'],
        default: 'monthly'
      }
    }
  },

  // ==================== Related Content ====================
  relatedContent: {
    relatedArticles: [{
      articleId: String,
      title: String,
      relationship: {
        type: String,
        enum: ['PREREQUISITE', 'NEXT_STEP', 'RELATED', 'SEE_ALSO', 'ALTERNATIVE']
      },
      relevanceScore: Number,
      addedAt: Date,
      addedBy: mongoose.Schema.Types.ObjectId,
      automatic: Boolean
    }],
    prerequisites: [{
      articleId: String,
      title: String,
      required: Boolean,
      order: Number
    }],
    series: {
      seriesId: String,
      seriesName: String,
      partNumber: Number,
      totalParts: Number,
      nextArticle: String,
      previousArticle: String
    },
    collections: [{
      collectionId: String,
      collectionName: String,
      order: Number
    }],
    externalLinks: [{
      url: String,
      title: String,
      description: String,
      type: {
        type: String,
        enum: ['DOCUMENTATION', 'TUTORIAL', 'VIDEO', 'TOOL', 'REFERENCE']
      },
      verified: Boolean,
      lastChecked: Date
    }]
  },

  // ==================== Ticket Integration ====================
  ticketIntegration: {
    linkedTickets: [{
      ticketId: String,
      linkedAt: Date,
      linkedBy: mongoose.Schema.Types.ObjectId,
      resolved: Boolean
    }],
    ticketsSolved: {
      count: {
        type: Number,
        default: 0
      },
      tickets: [{
        ticketId: String,
        solvedAt: Date,
        feedback: String
      }]
    },
    commonIssues: [{
      issue: String,
      frequency: Number,
      lastOccurrence: Date,
      resolution: String
    }],
    suggestedFor: {
      categories: [String],
      types: [String],
      products: [String]
    }
  },

  // ==================== AI & Automation ====================
  aiEnhancement: {
    autoGenerated: {
      isGenerated: Boolean,
      generatedFrom: String,
      generatedAt: Date,
      model: String,
      confidence: Number
    },
    suggestions: {
      contentSuggestions: [{
        suggestion: String,
        type: String,
        confidence: Number,
        accepted: Boolean
      }],
      tagSuggestions: [String],
      categorySuggestions: [String],
      relatedSuggestions: [String]
    },
    optimization: {
      readabilityOptimized: Boolean,
      seoOptimized: Boolean,
      structureOptimized: Boolean,
      lastOptimized: Date
    },
    translation: {
      autoTranslated: Boolean,
      translationModel: String,
      qualityScore: Number,
      humanVerified: Boolean
    },
    summaryGeneration: {
      autoSummary: String,
      keyPoints: [String],
      generatedAt: Date
    }
  },

  // ==================== Compliance & Governance ====================
  compliance: {
    retention: {
      policy: String,
      retainUntil: Date,
      legalHold: Boolean,
      destructionScheduled: Date
    },
    privacy: {
      containsPII: Boolean,
      piiTypes: [String],
      redacted: Boolean,
      gdprCompliant: Boolean
    },
    regulatory: {
      requirements: [String],
      certifications: [String],
      lastAudit: Date,
      auditNotes: String
    },
    accessibility: {
      wcagLevel: {
        type: String,
        enum: ['A', 'AA', 'AAA']
      },
      altTextComplete: Boolean,
      keyboardNavigable: Boolean,
      screenReaderOptimized: Boolean,
      lastChecked: Date
    },
    export: {
      exportable: Boolean,
      exportFormats: [String],
      exportRestrictions: [String]
    }
  },

  // ==================== Metadata & Timestamps ====================
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    lastReviewedAt: Date,
    nextReviewDate: Date,
    customProperties: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['MANUAL', 'IMPORTED', 'MIGRATED', 'API', 'AI_GENERATED']
    },
    importedFrom: String,
    flags: {
      featured: Boolean,
      sticky: Boolean,
      outdated: Boolean,
      underConstruction: Boolean,
      highPriority: Boolean
    }
  }
}

const knowledgeArticleSchema = BaseModel.createSchema(knowledgeArticleSchemaDefinition, {
  collection: 'knowledge_articles',
  timestamps: true,
  strict: true,
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes ====================
knowledgeArticleSchema.index({ 'content.title': 'text', 'content.body.plainText': 'text', 'content.summary': 'text' });
knowledgeArticleSchema.index({ 'publishing.status.current': 1, 'analytics.views.total': -1 });
knowledgeArticleSchema.index({ 'classification.category.primary': 1, 'classification.audience.primary': 1 });
knowledgeArticleSchema.index({ 'content.slug': 1 });
knowledgeArticleSchema.index({ 'versioning.isDraft': 1, 'publishing.status.current': 1 });
knowledgeArticleSchema.index({ 'authorship.primaryAuthor.userId': 1 });
knowledgeArticleSchema.index({ 'analytics.feedback.rating.average': -1 });

// ==================== Virtual Properties ====================
knowledgeArticleSchema.virtual('isPublished').get(function() {
  return this.publishing.status.current === 'PUBLISHED';
});

knowledgeArticleSchema.virtual('url').get(function() {
  return `/kb/${this.content.slug || this.articleId}`;
});

knowledgeArticleSchema.virtual('helpfulnessScore').get(function() {
  const helpful = this.analytics.feedback.helpful;
  const total = helpful.yes + helpful.no;
  return total > 0 ? (helpful.yes / total) * 100 : 0;
});

knowledgeArticleSchema.virtual('popularityScore').get(function() {
  const views = this.analytics.views.total || 0;
  const engagement = this.analytics.engagement.interactions;
  const feedback = this.analytics.feedback.rating.average || 0;
  
  return (views * 0.3) + 
         ((engagement.likes + engagement.shares + engagement.bookmarks) * 0.4) + 
         (feedback * 20 * 0.3);
});

// ==================== Instance Methods ====================

/**
 * Publish article
 * @async
 * @param {Object} publishOptions - Publishing options
 * @returns {Promise<Object>} Publish result
 */
knowledgeArticleSchema.methods.publish = async function(publishOptions = {}) {
  try {
    // Validate article is ready for publishing
    if (!this.review.requiresReview || 
        (this.review.currentReview && this.review.currentReview.status === 'APPROVED')) {
      
      // Update version
      if (publishOptions.versionBump) {
        await this.bumpVersion(publishOptions.versionBump);
      }
      
      // Set publishing status
      this.publishing.status.current = 'PUBLISHED';
      this.publishing.status.lastChanged = new Date();
      this.publishing.status.changedBy = publishOptions.publishedBy;
      this.publishing.publishedAt = new Date();
      this.publishing.publishedBy = publishOptions.publishedBy;
      
      // Add to publish channels
      if (publishOptions.channels) {
        publishOptions.channels.forEach(channel => {
          this.publishing.publishChannel.push({
            channel,
            publishedAt: new Date(),
            active: true
          });
        });
      }
      
      // Update draft status
      this.versioning.isDraft = false;
      this.versioning.publishedVersion = {
        version: this.versioning.currentVersion,
        content: this.content,
        publishedAt: new Date()
      };
      
      // Clear cache
      const cacheService = new CacheService();
      await cacheService.invalidate(`article:${this.articleId}`);
      
      // Update search index
      const searchService = new SearchService();
      await searchService.indexArticle(this);
      
      await this.save();
      
      logger.info(`Article ${this.articleId} published successfully`);
      return { success: true, publishedAt: this.publishing.publishedAt };
      
    } else {
      throw new AppError('Article requires approval before publishing', 400);
    }
  } catch (error) {
    logger.error(`Failed to publish article ${this.articleId}:`, error);
    throw error;
  }
};

/**
 * Update article content
 * @async
 * @param {Object} contentData - Content updates
 * @param {Object} options - Update options
 * @returns {Promise<Object>} Update result
 */
knowledgeArticleSchema.methods.updateContent = async function(contentData, options = {}) {
  try {
    // Save current version to history
    if (options.createVersion) {
      await this.createVersion(options.changeType || 'CONTENT_UPDATE', options.changeNotes);
    }
    
    // Update content fields
    if (contentData.title) {
      this.content.title = contentData.title;
      this.content.slug = stringHelper.slugify(contentData.title);
    }
    
    if (contentData.summary) {
      this.content.summary = contentData.summary;
    }
    
    if (contentData.body) {
      this.content.body = {
        html: contentData.body.html || contentData.body,
        markdown: contentData.body.markdown,
        plainText: stringHelper.stripHtml(contentData.body.html || contentData.body)
      };
      
      // Update reading time
      this.calculateReadingTime();
    }
    
    if (contentData.sections) {
      this.content.sections = contentData.sections;
    }
    
    if (contentData.keywords) {
      this.content.keywords = contentData.keywords;
    }
    
    // Update metadata
    this.metadata.lastModifiedBy = options.modifiedBy;
    this.metadata.lastModifiedAt = new Date();
    
    // Mark as draft if published
    if (this.isPublished && !options.keepPublished) {
      this.versioning.isDraft = true;
      this.versioning.draftVersion = {
        content: this.content,
        savedAt: new Date()
      };
    }
    
    await this.save();
    
    // Update search index if published
    if (this.isPublished) {
      const searchService = new SearchService();
      await searchService.updateArticle(this);
    }
    
    logger.info(`Article ${this.articleId} content updated`);
    return { success: true, version: this.versioning.currentVersion };
    
  } catch (error) {
    logger.error(`Failed to update article content:`, error);
    throw error;
  }
};

/**
 * Submit article for review
 * @async
 * @param {Object} reviewRequest - Review request details
 * @returns {Promise<Object>} Review submission result
 */
knowledgeArticleSchema.methods.submitForReview = async function(reviewRequest) {
  try {
    const reviewId = `REV-${Date.now()}-${cryptoHelper.generateRandomString(6)}`;
    
    this.review.currentReview = {
      reviewId,
      status: 'PENDING',
      requestedAt: new Date(),
      requestedBy: reviewRequest.requestedBy,
      assignedTo: reviewRequest.reviewers || [],
      dueDate: reviewRequest.dueDate || dateHelper.addDays(new Date(), 3)
    };
    
    this.publishing.status.current = 'IN_REVIEW';
    this.publishing.status.lastChanged = new Date();
    this.publishing.status.changedBy = reviewRequest.requestedBy;
    
    await this.save();
    
    // Notify reviewers
    // Implementation would send notifications to assigned reviewers
    
    logger.info(`Article ${this.articleId} submitted for review`);
    return { success: true, reviewId };
    
  } catch (error) {
    logger.error(`Failed to submit article for review:`, error);
    throw error;
  }
};

/**
 * Add review feedback
 * @async
 * @param {Object} reviewData - Review feedback
 * @returns {Promise<Object>} Review addition result
 */
knowledgeArticleSchema.methods.addReview = async function(reviewData) {
  try {
    const review = {
      reviewId: this.review.currentReview?.reviewId || `REV-${Date.now()}`,
      reviewer: reviewData.reviewer,
      reviewedAt: new Date(),
      decision: reviewData.decision,
      comments: reviewData.comments,
      changes: reviewData.changes,
      score: reviewData.score
    };
    
    this.review.reviewHistory.push(review);
    
    // Update current review status
    if (this.review.currentReview) {
      this.review.currentReview.status = reviewData.decision;
      
      if (reviewData.decision === 'APPROVED') {
        this.publishing.status.current = 'APPROVED';
        
        // Auto-publish if configured
        if (reviewData.autoPublish) {
          await this.publish({ publishedBy: reviewData.reviewer });
        }
      } else if (reviewData.decision === 'REJECTED') {
        this.publishing.status.current = 'DRAFT';
      }
    }
    
    this.metadata.lastReviewedAt = new Date();
    
    await this.save();
    
    logger.info(`Review added to article ${this.articleId}`);
    return { success: true, decision: reviewData.decision };
    
  } catch (error) {
    logger.error(`Failed to add review:`, error);
    throw error;
  }
};

/**
 * Archive article
 * @async
 * @param {Object} archiveOptions - Archive options
 * @returns {Promise<Object>} Archive result
 */
knowledgeArticleSchema.methods.archive = async function(archiveOptions = {}) {
  try {
    this.publishing.status.current = 'ARCHIVED';
    this.publishing.status.lastChanged = new Date();
    this.publishing.status.changedBy = archiveOptions.archivedBy;
    
    // Deactivate all publish channels
    this.publishing.publishChannel.forEach(channel => {
      channel.active = false;
    });
    
    // Remove from search index
    const searchService = new SearchService();
    await searchService.removeArticle(this.articleId);
    
    // Clear cache
    const cacheService = new CacheService();
    await cacheService.invalidate(`article:${this.articleId}`);
    
    await this.save();
    
    logger.info(`Article ${this.articleId} archived`);
    return { success: true, archivedAt: new Date() };
    
  } catch (error) {
    logger.error(`Failed to archive article:`, error);
    throw error;
  }
};

/**
 * Track article view
 * @async
 * @param {Object} viewData - View tracking data
 * @returns {Promise<void>}
 */
knowledgeArticleSchema.methods.trackView = async function(viewData = {}) {
  try {
    this.analytics.views.total++;
    
    if (viewData.userId) {
      this.analytics.views.authenticated = (this.analytics.views.authenticated || 0) + 1;
    } else {
      this.analytics.views.anonymous = (this.analytics.views.anonymous || 0) + 1;
    }
    
    // Update channel views
    if (viewData.channel) {
      const channelView = this.analytics.views.byChannel.find(c => c.channel === viewData.channel);
      if (channelView) {
        channelView.count++;
      } else {
        this.analytics.views.byChannel.push({ channel: viewData.channel, count: 1 });
      }
    }
    
    // Add to trend data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrend = this.analytics.views.trend.find(t => 
      t.date.getTime() === today.getTime()
    );
    
    if (todayTrend) {
      todayTrend.views++;
    } else {
      this.analytics.views.trend.push({ date: today, views: 1 });
    }
    
    // Track search metrics if from search
    if (viewData.fromSearch && viewData.searchKeyword) {
      const keyword = this.analytics.search.keywords.find(k => k.keyword === viewData.searchKeyword);
      if (keyword) {
        keyword.clicks++;
      } else {
        this.analytics.search.keywords.push({
          keyword: viewData.searchKeyword,
          impressions: 1,
          clicks: 1
        });
      }
    }
    
    await this.save();
    
    // Send to analytics service
    const analyticsService = new AnalyticsService();
    await analyticsService.trackEvent('article_view', {
      articleId: this.articleId,
      userId: viewData.userId,
      channel: viewData.channel
    });
    
  } catch (error) {
    logger.error(`Failed to track article view:`, error);
  }
};

/**
 * Add feedback
 * @async
 * @param {Object} feedbackData - Feedback data
 * @returns {Promise<Object>} Feedback addition result
 */
knowledgeArticleSchema.methods.addFeedback = async function(feedbackData) {
  try {
    if (feedbackData.helpful !== undefined) {
      if (feedbackData.helpful) {
        this.analytics.feedback.helpful.yes++;
      } else {
        this.analytics.feedback.helpful.no++;
      }
    }
    
    if (feedbackData.rating) {
      // Update rating average
      const currentTotal = (this.analytics.feedback.rating.average || 0) * 
                          (this.analytics.feedback.rating.count || 0);
      this.analytics.feedback.rating.count = (this.analytics.feedback.rating.count || 0) + 1;
      this.analytics.feedback.rating.average = 
        (currentTotal + feedbackData.rating) / this.analytics.feedback.rating.count;
      
      // Update distribution
      const distribution = this.analytics.feedback.rating.distribution || {};
      const ratingKey = ['one', 'two', 'three', 'four', 'five'][feedbackData.rating - 1];
      distribution[ratingKey] = (distribution[ratingKey] || 0) + 1;
      this.analytics.feedback.rating.distribution = distribution;
    }
    
    if (feedbackData.comment) {
      this.analytics.feedback.comments.push({
        commentId: `COM-${Date.now()}`,
        userId: feedbackData.userId,
        comment: feedbackData.comment,
        rating: feedbackData.rating,
        timestamp: new Date()
      });
    }
    
    if (feedbackData.suggestion) {
      this.analytics.feedback.suggestions.push({
        suggestionId: `SUG-${Date.now()}`,
        userId: feedbackData.userId,
        suggestion: feedbackData.suggestion,
        status: 'PENDING',
        submittedAt: new Date()
      });
    }
    
    await this.save();
    
    logger.info(`Feedback added to article ${this.articleId}`);
    return { success: true };
    
  } catch (error) {
    logger.error(`Failed to add feedback:`, error);
    throw error;
  }
};

/**
 * Link to support ticket
 * @async
 * @param {String} ticketId - Ticket ID to link
 * @param {Object} linkOptions - Link options
 * @returns {Promise<Object>} Link result
 */
knowledgeArticleSchema.methods.linkToTicket = async function(ticketId, linkOptions = {}) {
  try {
    // Check if already linked
    const existingLink = this.ticketIntegration.linkedTickets.find(t => t.ticketId === ticketId);
    if (existingLink) {
      return { success: true, alreadyLinked: true };
    }
    
    this.ticketIntegration.linkedTickets.push({
      ticketId,
      linkedAt: new Date(),
      linkedBy: linkOptions.linkedBy,
      resolved: linkOptions.resolved || false
    });
    
    // Update solved count if resolved
    if (linkOptions.resolved) {
      this.ticketIntegration.ticketsSolved.count++;
      this.ticketIntegration.ticketsSolved.tickets.push({
        ticketId,
        solvedAt: new Date(),
        feedback: linkOptions.feedback
      });
      
      // Update effectiveness metrics
      this.analytics.effectiveness.ticketDeflection = 
        (this.analytics.effectiveness.ticketDeflection || 0) + 1;
    }
    
    await this.save();
    
    logger.info(`Article ${this.articleId} linked to ticket ${ticketId}`);
    return { success: true };
    
  } catch (error) {
    logger.error(`Failed to link article to ticket:`, error);
    throw error;
  }
};

/**
 * Calculate reading time
 * @returns {Object} Reading time metrics
 */
knowledgeArticleSchema.methods.calculateReadingTime = function() {
  const wordsPerMinute = 200;
  const text = this.content.body.plainText || '';
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  
  this.content.readingTime = {
    minutes: readingTime,
    words: wordCount,
    lastCalculated: new Date()
  };
  
  return this.content.readingTime;
};

/**
 * Create version snapshot
 * @async
 * @param {String} changeType - Type of change
 * @param {String} changeNotes - Change notes
 * @returns {Promise<Object>} Version creation result
 */
knowledgeArticleSchema.methods.createVersion = async function(changeType, changeNotes) {
  try {
    const version = `${this.versioning.currentVersion.major}.${this.versioning.currentVersion.minor}.${this.versioning.currentVersion.patch}`;
    
    this.versioning.versionHistory.push({
      version,
      createdAt: new Date(),
      createdBy: this.metadata.lastModifiedBy,
      changeType,
      changeNotes,
      snapshot: {
        content: this.content,
        classification: this.classification,
        media: this.media
      }
    });
    
    // Limit version history
    if (this.versioning.versionHistory.length > 50) {
      this.versioning.versionHistory = this.versioning.versionHistory.slice(-50);
    }
    
    await this.save();
    
    return { success: true, version };
    
  } catch (error) {
    logger.error(`Failed to create version:`, error);
    throw error;
  }
};

/**
 * Bump version number
 * @async
 * @param {String} bumpType - Type of version bump (major, minor, patch)
 * @returns {Promise<Object>} New version
 */
knowledgeArticleSchema.methods.bumpVersion = async function(bumpType = 'patch') {
  switch (bumpType) {
    case 'major':
      this.versioning.currentVersion.major++;
      this.versioning.currentVersion.minor = 0;
      this.versioning.currentVersion.patch = 0;
      break;
    case 'minor':
      this.versioning.currentVersion.minor++;
      this.versioning.currentVersion.patch = 0;
      break;
    case 'patch':
    default:
      this.versioning.currentVersion.patch++;
  }
  
  this.versioning.currentVersion.versionString = 
    `${this.versioning.currentVersion.major}.${this.versioning.currentVersion.minor}.${this.versioning.currentVersion.patch}`;
  
  await this.save();
  
  return this.versioning.currentVersion;
};

// ==================== Static Methods ====================

/**
 * Find published articles
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Array>} Published articles
 */
knowledgeArticleSchema.statics.findPublished = async function(filters = {}) {
  const query = { 'publishing.status.current': 'PUBLISHED' };
  
  if (filters.category) {
    query['classification.category.primary'] = filters.category;
  }
  
  if (filters.audience) {
    query['classification.audience.primary'] = filters.audience;
  }
  
  if (filters.product) {
    query['classification.products.productId'] = filters.product;
  }
  
  if (filters.language) {
    query['content.language.primary'] = filters.language;
  }
  
  return this.find(query)
    .sort(filters.sort || { 'analytics.views.total': -1 })
    .limit(filters.limit || 20);
};

/**
 * Search articles
 * @static
 * @async
 * @param {String} searchQuery - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
knowledgeArticleSchema.statics.searchArticles = async function(searchQuery, options = {}) {
  const searchConditions = {
    $text: { $search: searchQuery },
    'publishing.status.current': options.includeUnpublished ? { $ne: 'DELETED' } : 'PUBLISHED'
  };
  
  if (options.filters) {
    Object.assign(searchConditions, options.filters);
  }
  
  const articles = await this.find(searchConditions, {
    score: { $meta: 'textScore' }
  })
  .sort({ score: { $meta: 'textScore' } })
  .limit(options.limit || 10);
  
  // Track search impressions
  for (const article of articles) {
    article.analytics.search.appearances = (article.analytics.search.appearances || 0) + 1;
    await article.save();
  }
  
  return articles;
};

/**
 * Get popular articles
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Popular articles
 */
knowledgeArticleSchema.statics.getPopularArticles = async function(options = {}) {
  const dateRange = options.dateRange || dateHelper.addDays(new Date(), -30);
  
  return this.aggregate([
    {
      $match: {
        'publishing.status.current': 'PUBLISHED',
        'metadata.lastModifiedAt': { $gte: dateRange }
      }
    },
    {
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: ['$analytics.views.total', 0.3] },
            { $multiply: ['$analytics.engagement.interactions.likes', 5] },
            { $multiply: ['$analytics.engagement.interactions.shares', 10] },
            { $multiply: ['$analytics.feedback.rating.average', 20] }
          ]
        }
      }
    },
    { $sort: { popularityScore: -1 } },
    { $limit: options.limit || 10 }
  ]);
};

/**
 * Get articles needing review
 * @static
 * @async
 * @returns {Promise<Array>} Articles needing review
 */
knowledgeArticleSchema.statics.getArticlesNeedingReview = async function() {
  const reviewDate = new Date();
  
  return this.find({
    $or: [
      { 'metadata.nextReviewDate': { $lte: reviewDate } },
      { 
        'metadata.lastReviewedAt': { $lte: dateHelper.addDays(reviewDate, -90) },
        'publishing.status.current': 'PUBLISHED'
      },
      { 'metadata.flags.outdated': true }
    ]
  }).sort({ 'metadata.nextReviewDate': 1 });
};

// ==================== Private Helper Methods ====================

/**
 * Validate content quality
 * @private
 * @returns {Object} Validation result
 */
knowledgeArticleSchema.methods.#validateContentQuality = function() {
  const issues = [];
  
  // Check content length
  if (!this.content.body.plainText || this.content.body.plainText.length < 100) {
    issues.push('Content too short');
  }
  
  // Check for required sections
  if (!this.content.title || this.content.title.length < 5) {
    issues.push('Title too short');
  }
  
  if (!this.content.summary || this.content.summary.length < 20) {
    issues.push('Summary missing or too short');
  }
  
  // Check for media alt text
  const imagesWithoutAlt = this.media.images.filter(img => !img.altText);
  if (imagesWithoutAlt.length > 0) {
    issues.push(`${imagesWithoutAlt.length} images missing alt text`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
};

// ==================== Hooks ====================
knowledgeArticleSchema.pre('save', async function(next) {
  // Generate slug if not present
  if (!this.content.slug && this.content.title) {
    this.content.slug = stringHelper.slugify(this.content.title);
  }
  
  // Calculate reading time
  if (this.isModified('content.body')) {
    this.calculateReadingTime();
  }
  
  // Update version string
  this.versioning.currentVersion.versionString = 
    `${this.versioning.currentVersion.major}.${this.versioning.currentVersion.minor}.${this.versioning.currentVersion.patch}`;
  
  // Set next review date if published
  if (this.isPublished && !this.metadata.nextReviewDate) {
    this.metadata.nextReviewDate = dateHelper.addDays(new Date(), 90);
  }
  
  next();
});

knowledgeArticleSchema.post('save', async function(doc) {
  // Update cache if published
  if (doc.isPublished) {
    const cacheService = new CacheService();
    await cacheService.set(`article:${doc.articleId}`, doc, 3600);
  }
});

// ==================== Model Export ====================
const KnowledgeArticleModel = mongoose.model('KnowledgeArticle', knowledgeArticleSchema);

module.exports = KnowledgeArticleModel;