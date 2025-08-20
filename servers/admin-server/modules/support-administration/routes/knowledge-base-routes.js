'use strict';

/**
 * @fileoverview Enterprise knowledge base routes for comprehensive knowledge management operations
 * @module servers/admin-server/modules/support-administration/routes/knowledge-base-routes
 * @requires express
 * @requires module:servers/admin-server/modules/support-administration/controllers/knowledge-base-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/audit-logger
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/compression-config
 * @requires module:shared/lib/middleware/cors-middleware
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const KnowledgeBaseController = require('../controllers/knowledge-base-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const auditLogger = require('../../../../../shared/lib/middleware/audit-logger');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const compression = require('../../../../../shared/lib/middleware/compression-config');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const logger = require('../../../../../shared/lib/utils/logger');

const router = express.Router();
const knowledgeBaseController = new KnowledgeBaseController();

// ==================== Global Route Middleware Configuration ====================

// Apply security headers to all routes
router.use(securityHeaders);

// Apply CORS configuration
router.use(corsMiddleware);

// Apply compression for performance optimization
router.use(compression);

// Apply authentication to all knowledge base routes
router.use(authenticate);

// Apply audit logging to all operations
router.use(auditLogger);

// ==================== Article Management Routes ====================

/**
 * @route GET /api/admin/knowledge-base/articles
 * @description Retrieve knowledge base articles with filtering and pagination
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles', 
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticles
);

/**
 * @route POST /api/admin/knowledge-base/articles
 * @description Create new knowledge base article
 * @access Admin
 * @permissions kb.create, admin.knowledge
 */
router.post('/articles',
  authorize(['kb.create', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 30 }),
  knowledgeBaseController.createArticle
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId
 * @description Retrieve specific article with complete details
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles/:articleId',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 300 }),
  knowledgeBaseController.getArticleDetails
);

/**
 * @route PUT /api/admin/knowledge-base/articles/:articleId
 * @description Update knowledge base article content and metadata
 * @access Admin
 * @permissions kb.update, admin.knowledge
 */
router.put('/articles/:articleId',
  authorize(['kb.update', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.updateArticle
);

/**
 * @route DELETE /api/admin/knowledge-base/articles/:articleId
 * @description Delete knowledge base article with proper archiving
 * @access Admin
 * @permissions kb.delete, admin.knowledge
 */
router.delete('/articles/:articleId',
  authorize(['kb.delete', 'admin.knowledge']),
  rateLimit({ windowMs: 600000, max: 20 }),
  knowledgeBaseController.deleteArticle
);

// ==================== Article Publishing Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/publish/:operation
 * @description Handle article publishing operations (publish, unpublish, schedule, etc.)
 * @access Admin
 * @permissions kb.publish, admin.knowledge
 */
router.post('/articles/:articleId/publish/:operation',
  authorize(['kb.publish', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.publishArticle
);

/**
 * @route GET /api/admin/knowledge-base/articles/published
 * @description Retrieve all published articles
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles/published',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getPublishedArticles
);

/**
 * @route GET /api/admin/knowledge-base/articles/drafts
 * @description Retrieve all draft articles
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles/drafts',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getDraftArticles
);

/**
 * @route GET /api/admin/knowledge-base/articles/scheduled
 * @description Retrieve all scheduled articles
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles/scheduled',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 150 }),
  knowledgeBaseController.getScheduledArticles
);

// ==================== Article Version Control Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/versions/:operation
 * @description Handle article version control operations
 * @access Admin
 * @permissions kb.versions, admin.knowledge
 */
router.post('/articles/:articleId/versions/:operation',
  authorize(['kb.versions', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 100 }),
  knowledgeBaseController.manageVersions
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/versions
 * @description Retrieve all versions of specific article
 * @access Admin
 * @permissions kb.versions, admin.knowledge
 */
router.get('/articles/:articleId/versions',
  authorize(['kb.versions', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleVersions
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/versions/:versionId
 * @description Retrieve specific version of article
 * @access Admin
 * @permissions kb.versions, admin.knowledge
 */
router.get('/articles/:articleId/versions/:versionId',
  authorize(['kb.versions', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 250 }),
  knowledgeBaseController.getArticleVersion
);

// ==================== Article Review and Approval Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/review/:operation
 * @description Handle article review and approval operations
 * @access Admin
 * @permissions kb.review, admin.knowledge
 */
router.post('/articles/:articleId/review/:operation',
  authorize(['kb.review', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 80 }),
  knowledgeBaseController.manageReview
);

/**
 * @route GET /api/admin/knowledge-base/articles/pending-review
 * @description Retrieve articles pending review
 * @access Admin
 * @permissions kb.review, admin.knowledge
 */
router.get('/articles/pending-review',
  authorize(['kb.review', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 150 }),
  knowledgeBaseController.getArticlesPendingReview
);

/**
 * @route GET /api/admin/knowledge-base/articles/review-queue
 * @description Retrieve review queue with prioritization
 * @access Admin
 * @permissions kb.review, admin.knowledge
 */
router.get('/articles/review-queue',
  authorize(['kb.review', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getReviewQueue
);

/**
 * @route GET /api/admin/knowledge-base/reviews/:reviewId
 * @description Retrieve specific review details
 * @access Admin
 * @permissions kb.review, admin.knowledge
 */
router.get('/reviews/:reviewId',
  authorize(['kb.review', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getReviewDetails
);

// ==================== Article Content Management Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/content/:operation
 * @description Handle article content operations (update, add sections, media, etc.)
 * @access Admin
 * @permissions kb.content, admin.knowledge
 */
router.post('/articles/:articleId/content/:operation',
  authorize(['kb.content', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 100 }),
  knowledgeBaseController.manageContent
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/attachments
 * @description Retrieve all attachments for specific article
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/articles/:articleId/attachments',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleAttachments
);

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/media/upload
 * @description Upload media files to article
 * @access Admin
 * @permissions kb.media.upload, admin.knowledge
 */
router.post('/articles/:articleId/media/upload',
  authorize(['kb.media.upload', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.uploadArticleMedia
);

/**
 * @route DELETE /api/admin/knowledge-base/articles/:articleId/media/:mediaId
 * @description Remove media from article
 * @access Admin
 * @permissions kb.media.delete, admin.knowledge
 */
router.delete('/articles/:articleId/media/:mediaId',
  authorize(['kb.media.delete', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 80 }),
  knowledgeBaseController.removeArticleMedia
);

// ==================== Knowledge Base Search Routes ====================

/**
 * @route GET /api/admin/knowledge-base/search/:operation
 * @description Handle knowledge base search operations
 * @access Admin
 * @permissions kb.search, admin.knowledge
 */
router.get('/search/:operation',
  authorize(['kb.search', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.searchKnowledgeBase
);

/**
 * @route POST /api/admin/knowledge-base/search/advanced
 * @description Perform advanced knowledge base search
 * @access Admin
 * @permissions kb.search.advanced, admin.knowledge
 */
router.post('/search/advanced',
  authorize(['kb.search.advanced', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.advancedSearch
);

/**
 * @route GET /api/admin/knowledge-base/search/suggestions
 * @description Get search suggestions and auto-complete
 * @access Admin
 * @permissions kb.search, admin.knowledge
 */
router.get('/search/suggestions',
  authorize(['kb.search', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 300 }),
  knowledgeBaseController.getSearchSuggestions
);

/**
 * @route POST /api/admin/knowledge-base/search/index/rebuild
 * @description Rebuild search index for knowledge base
 * @access Admin
 * @permissions kb.search.admin, admin.knowledge
 */
router.post('/search/index/rebuild',
  authorize(['kb.search.admin', 'admin.knowledge']),
  rateLimit({ windowMs: 1800000, max: 5 }),
  knowledgeBaseController.rebuildSearchIndex
);

// ==================== Article Classification Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/classification/:operation
 * @description Handle article classification operations
 * @access Admin
 * @permissions kb.classify, admin.knowledge
 */
router.post('/articles/:articleId/classification/:operation',
  authorize(['kb.classify', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 100 }),
  knowledgeBaseController.manageClassification
);

/**
 * @route GET /api/admin/knowledge-base/categories
 * @description Retrieve all knowledge base categories
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/categories',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getCategories
);

/**
 * @route POST /api/admin/knowledge-base/categories
 * @description Create new knowledge base category
 * @access Admin
 * @permissions kb.categories.create, admin.knowledge
 */
router.post('/categories',
  authorize(['kb.categories.create', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 30 }),
  knowledgeBaseController.createCategory
);

/**
 * @route PUT /api/admin/knowledge-base/categories/:categoryId
 * @description Update knowledge base category
 * @access Admin
 * @permissions kb.categories.update, admin.knowledge
 */
router.put('/categories/:categoryId',
  authorize(['kb.categories.update', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.updateCategory
);

/**
 * @route DELETE /api/admin/knowledge-base/categories/:categoryId
 * @description Delete knowledge base category
 * @access Admin
 * @permissions kb.categories.delete, admin.knowledge
 */
router.delete('/categories/:categoryId',
  authorize(['kb.categories.delete', 'admin.knowledge']),
  rateLimit({ windowMs: 600000, max: 20 }),
  knowledgeBaseController.deleteCategory
);

/**
 * @route GET /api/admin/knowledge-base/tags
 * @description Retrieve all knowledge base tags
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/tags',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getTags
);

/**
 * @route GET /api/admin/knowledge-base/tags/popular
 * @description Retrieve popular knowledge base tags
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/tags/popular',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 150 }),
  knowledgeBaseController.getPopularTags
);

// ==================== Article Translation Routes ====================

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/translations/:operation
 * @description Handle article translation operations
 * @access Admin
 * @permissions kb.translate, admin.knowledge
 */
router.post('/articles/:articleId/translations/:operation',
  authorize(['kb.translate', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.manageTranslations
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/translations
 * @description Retrieve all translations for specific article
 * @access Admin
 * @permissions kb.translate, admin.knowledge
 */
router.get('/articles/:articleId/translations',
  authorize(['kb.translate', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleTranslations
);

/**
 * @route GET /api/admin/knowledge-base/translations/pending
 * @description Retrieve pending translation requests
 * @access Admin
 * @permissions kb.translate, admin.knowledge
 */
router.get('/translations/pending',
  authorize(['kb.translate', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 150 }),
  knowledgeBaseController.getPendingTranslations
);

/**
 * @route GET /api/admin/knowledge-base/languages/supported
 * @description Retrieve supported languages for translation
 * @access Admin
 * @permissions kb.read, admin.knowledge
 */
router.get('/languages/supported',
  authorize(['kb.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getSupportedLanguages
);

// ==================== Knowledge Base Analytics Routes ====================

/**
 * @route GET /api/admin/knowledge-base/analytics/:analysisType
 * @description Retrieve knowledge base analytics and metrics
 * @access Admin
 * @permissions kb.analytics, admin.analytics
 */
router.get('/analytics/:analysisType',
  authorize(['kb.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getKnowledgeAnalytics
);

/**
 * @route GET /api/admin/knowledge-base/analytics/dashboard/overview
 * @description Get knowledge base analytics dashboard overview
 * @access Admin
 * @permissions kb.analytics, admin.analytics
 */
router.get('/analytics/dashboard/overview',
  authorize(['kb.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getAnalyticsDashboard
);

/**
 * @route GET /api/admin/knowledge-base/analytics/articles/performance
 * @description Get article performance analytics
 * @access Admin
 * @permissions kb.analytics, admin.analytics
 */
router.get('/analytics/articles/performance',
  authorize(['kb.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getArticlePerformanceAnalytics
);

/**
 * @route GET /api/admin/knowledge-base/analytics/search/patterns
 * @description Analyze search patterns and user behavior
 * @access Admin
 * @permissions kb.analytics, admin.analytics
 */
router.get('/analytics/search/patterns',
  authorize(['kb.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  knowledgeBaseController.getSearchPatternAnalytics
);

/**
 * @route GET /api/admin/knowledge-base/analytics/content/gaps
 * @description Identify content gaps and opportunities
 * @access Admin
 * @permissions kb.analytics, admin.analytics
 */
router.get('/analytics/content/gaps',
  authorize(['kb.analytics', 'admin.analytics']),
  rateLimit({ windowMs: 60000, max: 40 }),
  knowledgeBaseController.getContentGapAnalysis
);

/**
 * @route POST /api/admin/knowledge-base/analytics/reports/custom
 * @description Generate custom knowledge base analytics reports
 * @access Admin
 * @permissions kb.analytics.custom, admin.analytics
 */
router.post('/analytics/reports/custom',
  authorize(['kb.analytics.custom', 'admin.analytics']),
  rateLimit({ windowMs: 300000, max: 20 }),
  knowledgeBaseController.generateCustomAnalyticsReport
);

// ==================== Knowledge Base Workflow Routes ====================

/**
 * @route POST /api/admin/knowledge-base/workflows/:workflowType/execute
 * @description Execute knowledge base workflows
 * @access Admin
 * @permissions kb.workflow, admin.workflows
 */
router.post('/workflows/:workflowType/execute',
  authorize(['kb.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 300000, max: 30 }),
  knowledgeBaseController.executeWorkflow
);

/**
 * @route GET /api/admin/knowledge-base/workflows
 * @description Retrieve available knowledge base workflows
 * @access Admin
 * @permissions kb.workflow, admin.workflows
 */
router.get('/workflows',
  authorize(['kb.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getAvailableWorkflows
);

/**
 * @route GET /api/admin/knowledge-base/workflows/active
 * @description Retrieve active workflow instances
 * @access Admin
 * @permissions kb.workflow, admin.workflows
 */
router.get('/workflows/active',
  authorize(['kb.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getActiveWorkflows
);

/**
 * @route GET /api/admin/knowledge-base/workflows/:workflowId/status
 * @description Get workflow execution status
 * @access Admin
 * @permissions kb.workflow, admin.workflows
 */
router.get('/workflows/:workflowId/status',
  authorize(['kb.workflow', 'admin.workflows']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getWorkflowStatus
);

// ==================== Knowledge Base Bulk Operations Routes ====================

/**
 * @route POST /api/admin/knowledge-base/bulk/:operation
 * @description Handle bulk knowledge base operations
 * @access Admin
 * @permissions kb.bulk, admin.knowledge
 */
router.post('/bulk/:operation',
  authorize(['kb.bulk', 'admin.knowledge']),
  rateLimit({ windowMs: 600000, max: 10 }),
  knowledgeBaseController.bulkOperations
);

/**
 * @route POST /api/admin/knowledge-base/import/articles
 * @description Import articles from external sources
 * @access Admin
 * @permissions kb.import, admin.knowledge
 */
router.post('/import/articles',
  authorize(['kb.import', 'admin.knowledge']),
  rateLimit({ windowMs: 600000, max: 10 }),
  knowledgeBaseController.importArticles
);

/**
 * @route POST /api/admin/knowledge-base/export/articles
 * @description Export articles in various formats
 * @access Admin
 * @permissions kb.export, admin.export
 */
router.post('/export/articles',
  authorize(['kb.export', 'admin.export']),
  rateLimit({ windowMs: 600000, max: 15 }),
  knowledgeBaseController.exportArticles
);

/**
 * @route POST /api/admin/knowledge-base/sync/external
 * @description Synchronize with external knowledge management systems
 * @access Admin
 * @permissions kb.sync, admin.integrations
 */
router.post('/sync/external',
  authorize(['kb.sync', 'admin.integrations']),
  rateLimit({ windowMs: 1800000, max: 5 }),
  knowledgeBaseController.syncExternalSystems
);

// ==================== Knowledge Base Configuration Routes ====================

/**
 * @route GET /api/admin/knowledge-base/configuration
 * @description Retrieve knowledge base configuration settings
 * @access Admin
 * @permissions kb.config.read, admin.knowledge
 */
router.get('/configuration',
  authorize(['kb.config.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getKnowledgeBaseConfiguration
);

/**
 * @route PUT /api/admin/knowledge-base/configuration
 * @description Update knowledge base configuration settings
 * @access Admin
 * @permissions kb.config.update, admin.knowledge
 */
router.put('/configuration',
  authorize(['kb.config.update', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 20 }),
  knowledgeBaseController.updateKnowledgeBaseConfiguration
);

/**
 * @route GET /api/admin/knowledge-base/configuration/templates
 * @description Retrieve article templates configuration
 * @access Admin
 * @permissions kb.templates.read, admin.knowledge
 */
router.get('/configuration/templates',
  authorize(['kb.templates.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getArticleTemplates
);

/**
 * @route POST /api/admin/knowledge-base/configuration/templates
 * @description Create new article template
 * @access Admin
 * @permissions kb.templates.create, admin.knowledge
 */
router.post('/configuration/templates',
  authorize(['kb.templates.create', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 30 }),
  knowledgeBaseController.createArticleTemplate
);

/**
 * @route PUT /api/admin/knowledge-base/configuration/templates/:templateId
 * @description Update article template
 * @access Admin
 * @permissions kb.templates.update, admin.knowledge
 */
router.put('/configuration/templates/:templateId',
  authorize(['kb.templates.update', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 40 }),
  knowledgeBaseController.updateArticleTemplate
);

/**
 * @route DELETE /api/admin/knowledge-base/configuration/templates/:templateId
 * @description Delete article template
 * @access Admin
 * @permissions kb.templates.delete, admin.knowledge
 */
router.delete('/configuration/templates/:templateId',
  authorize(['kb.templates.delete', 'admin.knowledge']),
  rateLimit({ windowMs: 600000, max: 20 }),
  knowledgeBaseController.deleteArticleTemplate
);

// ==================== Knowledge Base Quality Management Routes ====================

/**
 * @route GET /api/admin/knowledge-base/quality/assessments
 * @description Retrieve quality assessments for articles
 * @access Admin
 * @permissions kb.quality.read, admin.quality
 */
router.get('/quality/assessments',
  authorize(['kb.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getQualityAssessments
);

/**
 * @route POST /api/admin/knowledge-base/quality/assessments
 * @description Create quality assessment for article
 * @access Admin
 * @permissions kb.quality.create, admin.quality
 */
router.post('/quality/assessments',
  authorize(['kb.quality.create', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 30 }),
  knowledgeBaseController.createQualityAssessment
);

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/quality/review
 * @description Trigger quality review for article
 * @access Admin
 * @permissions kb.quality.review, admin.quality
 */
router.post('/articles/:articleId/quality/review',
  authorize(['kb.quality.review', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.triggerQualityReview
);

/**
 * @route GET /api/admin/knowledge-base/quality/metrics
 * @description Get knowledge base quality metrics
 * @access Admin
 * @permissions kb.quality.metrics, admin.quality
 */
router.get('/quality/metrics',
  authorize(['kb.quality.metrics', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getQualityMetrics
);

/**
 * @route GET /api/admin/knowledge-base/quality/standards
 * @description Retrieve quality standards configuration
 * @access Admin
 * @permissions kb.quality.read, admin.quality
 */
router.get('/quality/standards',
  authorize(['kb.quality.read', 'admin.quality']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getQualityStandards
);

/**
 * @route PUT /api/admin/knowledge-base/quality/standards
 * @description Update quality standards configuration
 * @access Admin
 * @permissions kb.quality.configure, admin.quality
 */
router.put('/quality/standards',
  authorize(['kb.quality.configure', 'admin.quality']),
  rateLimit({ windowMs: 300000, max: 20 }),
  knowledgeBaseController.updateQualityStandards
);

// ==================== Knowledge Base Collaboration Routes ====================

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/collaborators
 * @description Get article collaborators and contributors
 * @access Admin
 * @permissions kb.collaboration.read, admin.knowledge
 */
router.get('/articles/:articleId/collaborators',
  authorize(['kb.collaboration.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleCollaborators
);

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/collaborators
 * @description Add collaborators to article
 * @access Admin
 * @permissions kb.collaboration.manage, admin.knowledge
 */
router.post('/articles/:articleId/collaborators',
  authorize(['kb.collaboration.manage', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 50 }),
  knowledgeBaseController.addArticleCollaborators
);

/**
 * @route DELETE /api/admin/knowledge-base/articles/:articleId/collaborators/:userId
 * @description Remove collaborator from article
 * @access Admin
 * @permissions kb.collaboration.manage, admin.knowledge
 */
router.delete('/articles/:articleId/collaborators/:userId',
  authorize(['kb.collaboration.manage', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 60 }),
  knowledgeBaseController.removeArticleCollaborator
);

/**
 * @route POST /api/admin/knowledge-base/articles/:articleId/comments
 * @description Add comment to article
 * @access Admin
 * @permissions kb.comments.add, admin.knowledge
 */
router.post('/articles/:articleId/comments',
  authorize(['kb.comments.add', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 100 }),
  knowledgeBaseController.addArticleComment
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/comments
 * @description Get article comments and discussions
 * @access Admin
 * @permissions kb.comments.read, admin.knowledge
 */
router.get('/articles/:articleId/comments',
  authorize(['kb.comments.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleComments
);

// ==================== Knowledge Base Performance Routes ====================

/**
 * @route GET /api/admin/knowledge-base/performance/overview
 * @description Get knowledge base performance overview
 * @access Admin
 * @permissions kb.performance.read, admin.monitoring
 */
router.get('/performance/overview',
  authorize(['kb.performance.read', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getPerformanceOverview
);

/**
 * @route GET /api/admin/knowledge-base/performance/search
 * @description Get search performance metrics
 * @access Admin
 * @permissions kb.performance.search, admin.monitoring
 */
router.get('/performance/search',
  authorize(['kb.performance.search', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getSearchPerformance
);

/**
 * @route GET /api/admin/knowledge-base/performance/content
 * @description Get content performance metrics
 * @access Admin
 * @permissions kb.performance.content, admin.monitoring
 */
router.get('/performance/content',
  authorize(['kb.performance.content', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 50 }),
  knowledgeBaseController.getContentPerformance
);

/**
 * @route GET /api/admin/knowledge-base/health
 * @description Get knowledge base system health status
 * @access Admin
 * @permissions kb.health.read, admin.monitoring
 */
router.get('/health',
  authorize(['kb.health.read', 'admin.monitoring']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getKnowledgeBaseHealth
);

// ==================== Knowledge Base Feedback Routes ====================

/**
 * @route GET /api/admin/knowledge-base/feedback
 * @description Retrieve user feedback for knowledge base articles
 * @access Admin
 * @permissions kb.feedback.read, admin.knowledge
 */
router.get('/feedback',
  authorize(['kb.feedback.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 100 }),
  knowledgeBaseController.getFeedback
);

/**
 * @route GET /api/admin/knowledge-base/articles/:articleId/feedback
 * @description Get feedback for specific article
 * @access Admin
 * @permissions kb.feedback.read, admin.knowledge
 */
router.get('/articles/:articleId/feedback',
  authorize(['kb.feedback.read', 'admin.knowledge']),
  rateLimit({ windowMs: 60000, max: 200 }),
  knowledgeBaseController.getArticleFeedback
);

/**
 * @route POST /api/admin/knowledge-base/feedback/:feedbackId/respond
 * @description Respond to user feedback
 * @access Admin
 * @permissions kb.feedback.respond, admin.knowledge
 */
router.post('/feedback/:feedbackId/respond',
  authorize(['kb.feedback.respond', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 80 }),
  knowledgeBaseController.respondToFeedback
);

/**
 * @route PUT /api/admin/knowledge-base/feedback/:feedbackId/status
 * @description Update feedback status
 * @access Admin
 * @permissions kb.feedback.manage, admin.knowledge
 */
router.put('/feedback/:feedbackId/status',
  authorize(['kb.feedback.manage', 'admin.knowledge']),
  rateLimit({ windowMs: 300000, max: 100 }),
  knowledgeBaseController.updateFeedbackStatus
);

// ==================== Error Handling Middleware ====================

/**
 * @description Handle route-specific errors
 */
router.use((error, req, res, next) => {
  logger.error('Knowledge base route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip,
    articleId: req.params.articleId
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error in knowledge base management';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: error.code || 'KNOWLEDGE_BASE_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      articleId: req.params.articleId,
      requestId: req.headers['x-request-id']
    }
  });
});

/**
 * @description Handle 404 errors for undefined routes
 */
router.use('*', (req, res) => {
  logger.warn('Knowledge base route not found:', {
    path: req.path,
    method: req.method,
    user: req.user?.id,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: {
      message: 'Knowledge base endpoint not found',
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id']
    }
  });
});

logger.info('Knowledge base routes initialized successfully');

module.exports = router;