/**
 * @fileoverview Blog Routes
 * @module servers/customer-services/modules/content/blog/routes/blog-routes
 * @description Blog routes with public endpoints for readers and admin endpoints for content management
 */

const express = require('express');
const router = express.Router();
const BlogController = require('../controllers/blog-controller');

// Import middleware
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/permission-middleware');
const { validateRequest } = require('../../../../middleware/validation');
const { rateLimiter } = require('../../../../middleware/rate-limiter');

// ============================================================================
// PUBLIC ROUTES - No authentication required
// These endpoints are for public blog access (readers)
// ============================================================================

/**
 * @route   GET /api/v1/blog/posts
 * @desc    Get published blog posts with pagination and filtering
 * @access  Public
 * @query   {string} category - Filter by category
 * @query   {string} tag - Filter by tag
 * @query   {string} author - Filter by author ID
 * @query   {string} search - Search term
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Posts per page (default: 10)
 */
router.get(
    '/posts',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getPublishedPosts
);

/**
 * @route   GET /api/v1/blog/posts/featured
 * @desc    Get featured blog posts
 * @access  Public
 * @query   {number} limit - Number of featured posts (default: 3)
 */
router.get(
    '/posts/featured',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getFeaturedPosts
);

/**
 * @route   GET /api/v1/blog/posts/search
 * @desc    Search blog posts
 * @access  Public
 * @query   {string} q - Search query (required)
 * @query   {string} category - Filter by category
 * @query   {string} tag - Filter by tag
 * @query   {number} page - Page number
 * @query   {number} limit - Results per page
 */
router.get(
    '/posts/search',
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    BlogController.searchPosts
);

/**
 * @route   GET /api/v1/blog/posts/slug/:slug
 * @desc    Get a single blog post by slug
 * @access  Public
 * @param   {string} slug - Post slug
 */
router.get(
    '/posts/slug/:slug',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getPostBySlug
);

/**
 * @route   GET /api/v1/blog/categories
 * @desc    Get all blog categories with post counts
 * @access  Public
 */
router.get(
    '/categories',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getCategories
);

/**
 * @route   GET /api/v1/blog/tags
 * @desc    Get popular tags
 * @access  Public
 * @query   {number} limit - Number of tags to return (default: 20)
 */
router.get(
    '/tags',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getPopularTags
);

/**
 * @route   GET /api/v1/blog/authors
 * @desc    Get blog authors with post counts
 * @access  Public
 */
router.get(
    '/authors',
    rateLimiter({ maxRequests: 200, windowMs: 60000 }),
    BlogController.getAuthors
);

/**
 * @route   POST /api/v1/blog/posts/:id/share
 * @desc    Record a share action
 * @access  Public
 * @param   {string} id - Post ID
 * @body    {string} platform - Share platform (twitter, linkedin, facebook, email, other)
 */
router.post(
    '/posts/:id/share',
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.recordShare
);

/**
 * @route   POST /api/v1/blog/posts/:id/reactions
 * @desc    Add a reaction to a post
 * @access  Public
 * @param   {string} id - Post ID
 * @body    {string} type - Reaction type (likes, helpful, insightful)
 */
router.post(
    '/posts/:id/reactions',
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
    BlogController.addReaction
);

// ============================================================================
// ADMIN ROUTES - Authentication and authorization required
// These endpoints are for content management (admins/editors)
// ============================================================================

/**
 * @route   GET /api/v1/blog/admin/posts
 * @desc    Get all blog posts (including drafts and unpublished)
 * @access  Private (Admin, Editor)
 * @query   {string} status - Filter by status (draft, published, scheduled, etc.)
 * @query   {string} category - Filter by category
 * @query   {string} author - Filter by author ID
 * @query   {string} search - Search term
 * @query   {number} page - Page number
 * @query   {number} limit - Posts per page
 * @query   {boolean} includeDeleted - Include soft-deleted posts
 */
router.get(
    '/admin/posts',
    authenticate,
    authorize(['blog:read', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    BlogController.getAllPosts
);

/**
 * @route   GET /api/v1/blog/admin/statistics
 * @desc    Get blog analytics and statistics
 * @access  Private (Admin, Editor)
 * @query   {string} dateFrom - Start date for statistics
 * @query   {string} dateTo - End date for statistics
 */
router.get(
    '/admin/statistics',
    authenticate,
    authorize(['blog:read', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    BlogController.getStatistics
);

/**
 * @route   GET /api/v1/blog/admin/posts/:id
 * @desc    Get a single blog post by ID (includes drafts)
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 * @query   {boolean} populate - Populate referenced fields
 * @query   {boolean} includeDeleted - Include if soft-deleted
 */
router.get(
    '/admin/posts/:id',
    authenticate,
    authorize(['blog:read', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 100, windowMs: 60000 }),
    BlogController.getPostById
);

/**
 * @route   POST /api/v1/blog/admin/posts
 * @desc    Create a new blog post
 * @access  Private (Admin, Editor)
 * @body    {Object} postData - Blog post data
 */
router.post(
    '/admin/posts',
    authenticate,
    authorize(['blog:create', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.createPost
);

/**
 * @route   PUT /api/v1/blog/admin/posts/:id
 * @desc    Update a blog post (full update)
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 * @body    {Object} updateData - Updated post data
 */
router.put(
    '/admin/posts/:id',
    authenticate,
    authorize(['blog:update', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.updatePost
);

/**
 * @route   PATCH /api/v1/blog/admin/posts/:id
 * @desc    Update a blog post (partial update)
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 * @body    {Object} updateData - Fields to update
 */
router.patch(
    '/admin/posts/:id',
    authenticate,
    authorize(['blog:update', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.updatePost
);

/**
 * @route   DELETE /api/v1/blog/admin/posts/:id
 * @desc    Delete a blog post (soft delete)
 * @access  Private (Admin)
 * @param   {string} id - Post ID
 */
router.delete(
    '/admin/posts/:id',
    authenticate,
    authorize(['blog:delete', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 30, windowMs: 60000 }),
    BlogController.deletePost
);

/**
 * @route   POST /api/v1/blog/admin/posts/:id/publish
 * @desc    Publish a blog post
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 */
router.post(
    '/admin/posts/:id/publish',
    authenticate,
    authorize(['blog:publish', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.publishPost
);

/**
 * @route   POST /api/v1/blog/admin/posts/:id/unpublish
 * @desc    Unpublish a blog post
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 */
router.post(
    '/admin/posts/:id/unpublish',
    authenticate,
    authorize(['blog:publish', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.unpublishPost
);

/**
 * @route   POST /api/v1/blog/admin/posts/:id/schedule
 * @desc    Schedule a blog post for future publishing
 * @access  Private (Admin, Editor)
 * @param   {string} id - Post ID
 * @body    {string} scheduledAt - ISO date string for scheduled publication
 */
router.post(
    '/admin/posts/:id/schedule',
    authenticate,
    authorize(['blog:publish', 'blog:manage', 'admin']),
    rateLimiter({ maxRequests: 50, windowMs: 60000 }),
    BlogController.schedulePost
);

module.exports = router;