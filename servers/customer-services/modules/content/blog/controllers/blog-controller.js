/**
 * @fileoverview Blog Controller
 * @module servers/customer-services/modules/content/blog/controllers/blog-controller
 * @description HTTP request handlers for blog operations (both public and admin)
 */

const BlogService = require('../services/blog-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'blog-controller'
});

/**
 * Blog Controller
 * @class BlogController
 */
class BlogController {
    constructor() {
        // Bind all methods to ensure 'this' context is preserved when used as route handlers
        this.getPublishedPosts = this.getPublishedPosts.bind(this);
        this.getFeaturedPosts = this.getFeaturedPosts.bind(this);
        this.getPostBySlug = this.getPostBySlug.bind(this);
        this.getPostById = this.getPostById.bind(this);
        this.searchPosts = this.searchPosts.bind(this);
        this.getCategories = this.getCategories.bind(this);
        this.getPopularTags = this.getPopularTags.bind(this);
        this.getAuthors = this.getAuthors.bind(this);
        this.recordShare = this.recordShare.bind(this);
        this.addReaction = this.addReaction.bind(this);
        
        // Admin operations
        this.createPost = this.createPost.bind(this);
        this.updatePost = this.updatePost.bind(this);
        this.deletePost = this.deletePost.bind(this);
        this.publishPost = this.publishPost.bind(this);
        this.unpublishPost = this.unpublishPost.bind(this);
        this.schedulePost = this.schedulePost.bind(this);
        this.getAllPosts = this.getAllPosts.bind(this);
        this.getStatistics = this.getStatistics.bind(this);
    }

    // ============= PUBLIC ENDPOINTS =============

    /**
     * Get published blog posts (public access)
     * @route GET /api/v1/blog/posts
     * @access Public
     */
    async getPublishedPosts(req, res, next) {
        try {
            const filters = {
                category: req.query.category,
                tag: req.query.tag,
                author: req.query.author,
                page: req.query.page,
                limit: req.query.limit,
                searchTerm: req.query.search
            };

            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID
            };

            logger.info('Get published posts request', { filters });

            const result = await BlogService.getPublishedPosts(filters, options);

            res.status(200).json({
                success: true,
                data: {
                    posts: result.posts,
                    pagination: result.pagination
                }
            });

        } catch (error) {
            logger.error('Get published posts failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get featured blog posts (public access)
     * @route GET /api/v1/blog/posts/featured
     * @access Public
     */
    async getFeaturedPosts(req, res, next) {
        try {
            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID,
                limit: parseInt(req.query.limit, 10) || 3
            };

            logger.info('Get featured posts request', { limit: options.limit });

            const result = await BlogService.getFeaturedPosts(options);

            res.status(200).json({
                success: true,
                data: {
                    posts: result.posts
                }
            });

        } catch (error) {
            logger.error('Get featured posts failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get blog post by slug (public access)
     * @route GET /api/v1/blog/posts/slug/:slug
     * @access Public
     */
    async getPostBySlug(req, res, next) {
        try {
            const { slug } = req.params;

            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID,
                populate: req.query.populate === 'true',
                trackView: true,
                publicAccess: true
            };

            logger.info('Get post by slug request', { slug });

            const post = await BlogService.getPostBySlug(slug, options);

            res.status(200).json({
                success: true,
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Get post by slug failed', {
                error: error.message,
                slug: req.params.slug,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Search blog posts (public access)
     * @route GET /api/v1/blog/posts/search
     * @access Public
     */
    async searchPosts(req, res, next) {
        try {
            const searchTerm = req.query.q || req.query.search;

            if (!searchTerm) {
                throw AppError.badRequest('Search term is required');
            }

            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID,
                filters: {
                    category: req.query.category,
                    tag: req.query.tag,
                    page: req.query.page,
                    limit: req.query.limit
                }
            };

            logger.info('Search posts request', { searchTerm });

            const result = await BlogService.searchPosts(searchTerm, options);

            res.status(200).json({
                success: true,
                data: {
                    posts: result.posts,
                    pagination: result.pagination,
                    searchTerm
                }
            });

        } catch (error) {
            logger.error('Search posts failed', {
                error: error.message,
                searchTerm: req.query.q,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get blog categories (public access)
     * @route GET /api/v1/blog/categories
     * @access Public
     */
    async getCategories(req, res, next) {
        try {
            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID
            };

            logger.info('Get categories request');

            const categories = await BlogService.getCategories(options);

            res.status(200).json({
                success: true,
                data: {
                    categories
                }
            });

        } catch (error) {
            logger.error('Get categories failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get popular tags (public access)
     * @route GET /api/v1/blog/tags
     * @access Public
     */
    async getPopularTags(req, res, next) {
        try {
            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID,
                limit: parseInt(req.query.limit, 10) || 20
            };

            logger.info('Get popular tags request', { limit: options.limit });

            const tags = await BlogService.getPopularTags(options);

            res.status(200).json({
                success: true,
                data: {
                    tags
                }
            });

        } catch (error) {
            logger.error('Get popular tags failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get blog authors (public access)
     * @route GET /api/v1/blog/authors
     * @access Public
     */
    async getAuthors(req, res, next) {
        try {
            const options = {
                tenantId: req.tenantId || process.env.COMPANY_TENANT_ID
            };

            logger.info('Get authors request');

            const authors = await BlogService.getAuthors(options);

            res.status(200).json({
                success: true,
                data: {
                    authors
                }
            });

        } catch (error) {
            logger.error('Get authors failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Record a share (public access)
     * @route POST /api/v1/blog/posts/:id/share
     * @access Public
     */
    async recordShare(req, res, next) {
        try {
            const { id } = req.params;
            const { platform } = req.body;

            if (!platform) {
                throw AppError.badRequest('Platform is required');
            }

            logger.info('Record share request', { postId: id, platform });

            const totalShares = await BlogService.recordShare(id, platform);

            res.status(200).json({
                success: true,
                data: {
                    totalShares
                }
            });

        } catch (error) {
            logger.error('Record share failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Add a reaction (public access)
     * @route POST /api/v1/blog/posts/:id/reactions
     * @access Public
     */
    async addReaction(req, res, next) {
        try {
            const { id } = req.params;
            const { type } = req.body;

            if (!type || !['likes', 'helpful', 'insightful'].includes(type)) {
                throw AppError.badRequest('Valid reaction type is required (likes, helpful, insightful)');
            }

            logger.info('Add reaction request', { postId: id, type });

            const reactions = await BlogService.addReaction(id, type);

            res.status(200).json({
                success: true,
                data: {
                    reactions
                }
            });

        } catch (error) {
            logger.error('Add reaction failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    // ============= ADMIN ENDPOINTS =============

    /**
     * Create a new blog post
     * @route POST /api/v1/blog/admin/posts
     * @access Private (Admin)
     */
    async createPost(req, res, next) {
        try {
            const postData = { ...req.body };

            // Set author from authenticated user if not provided
            if (!postData.author) {
                postData.author = {
                    userId: req.user?.id,
                    name: req.user?.name || req.user?.fullName,
                    role: req.user?.role || req.user?.title,
                    email: req.user?.email
                };
            }

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Create post request', {
                title: postData.title,
                userId: req.user?.id
            });

            const post = await BlogService.createPost(postData, options);

            logger.info('Post created successfully', {
                postId: post._id,
                title: post.title
            });

            res.status(201).json({
                success: true,
                message: 'Blog post created successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Create post failed', {
                error: error.message,
                title: req.body?.title,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get post by ID (admin access - includes drafts)
     * @route GET /api/v1/blog/admin/posts/:id
     * @access Private (Admin)
     */
    async getPostById(req, res, next) {
        try {
            const { id } = req.params;

            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true',
                includeDeleted: req.query.includeDeleted === 'true'
            };

            logger.info('Get post by ID request (admin)', { postId: id });

            const post = await BlogService.getPostById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Get post by ID failed (admin)', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Update a blog post
     * @route PUT /api/v1/blog/admin/posts/:id
     * @route PATCH /api/v1/blog/admin/posts/:id
     * @access Private (Admin)
     */
    async updatePost(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = { ...req.body };

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                changeNotes: req.body.changeNotes
            };

            // Remove changeNotes from update data
            delete updateData.changeNotes;

            logger.info('Update post request', {
                postId: id,
                updateFields: Object.keys(updateData),
                userId: req.user?.id
            });

            const post = await BlogService.updatePost(id, updateData, options);

            logger.info('Post updated successfully', {
                postId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Blog post updated successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Update post failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Delete a blog post
     * @route DELETE /api/v1/blog/admin/posts/:id
     * @access Private (Admin)
     */
    async deletePost(req, res, next) {
        try {
            const { id } = req.params;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Delete post request', {
                postId: id,
                userId: req.user?.id
            });

            const post = await BlogService.deletePost(id, options);

            logger.info('Post deleted successfully', {
                postId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Blog post deleted successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Delete post failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Publish a blog post
     * @route POST /api/v1/blog/admin/posts/:id/publish
     * @access Private (Admin)
     */
    async publishPost(req, res, next) {
        try {
            const { id } = req.params;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Publish post request', {
                postId: id,
                userId: req.user?.id
            });

            const post = await BlogService.publishPost(id, options);

            logger.info('Post published successfully', {
                postId: id,
                publishedAt: post.publishedAt
            });

            res.status(200).json({
                success: true,
                message: 'Blog post published successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Publish post failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Unpublish a blog post
     * @route POST /api/v1/blog/admin/posts/:id/unpublish
     * @access Private (Admin)
     */
    async unpublishPost(req, res, next) {
        try {
            const { id } = req.params;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Unpublish post request', {
                postId: id,
                userId: req.user?.id
            });

            const post = await BlogService.unpublishPost(id, options);

            logger.info('Post unpublished successfully', { postId: id });

            res.status(200).json({
                success: true,
                message: 'Blog post unpublished successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Unpublish post failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Schedule a blog post
     * @route POST /api/v1/blog/admin/posts/:id/schedule
     * @access Private (Admin)
     */
    async schedulePost(req, res, next) {
        try {
            const { id } = req.params;
            const { scheduledAt } = req.body;

            if (!scheduledAt) {
                throw AppError.badRequest('Scheduled date is required');
            }

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Schedule post request', {
                postId: id,
                scheduledAt,
                userId: req.user?.id
            });

            const post = await BlogService.schedulePost(id, scheduledAt, options);

            logger.info('Post scheduled successfully', {
                postId: id,
                scheduledAt: post.scheduledAt
            });

            res.status(200).json({
                success: true,
                message: 'Blog post scheduled successfully',
                data: {
                    post
                }
            });

        } catch (error) {
            logger.error('Schedule post failed', {
                error: error.message,
                postId: req.params.id,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get all posts (admin access - includes all statuses)
     * @route GET /api/v1/blog/admin/posts
     * @access Private (Admin)
     */
    async getAllPosts(req, res, next) {
        try {
            const filters = {
                status: req.query.status,
                category: req.query.category,
                author: req.query.author,
                page: req.query.page,
                limit: req.query.limit,
                searchTerm: req.query.search
            };

            const options = {
                tenantId: req.user?.tenantId,
                includeDeleted: req.query.includeDeleted === 'true'
            };

            logger.info('Get all posts request (admin)', { filters });

            const result = await BlogService.getAllPosts(filters, options);

            res.status(200).json({
                success: true,
                data: {
                    posts: result.posts,
                    pagination: result.pagination
                }
            });

        } catch (error) {
            logger.error('Get all posts failed (admin)', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get blog statistics
     * @route GET /api/v1/blog/admin/statistics
     * @access Private (Admin)
     */
    async getStatistics(req, res, next) {
        try {
            const filters = {
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo
            };

            const options = {
                tenantId: req.user?.tenantId
            };

            logger.info('Get blog statistics request', { filters });

            const statistics = await BlogService.getStatistics(filters, options);

            res.status(200).json({
                success: true,
                data: {
                    statistics
                }
            });

        } catch (error) {
            logger.error('Get blog statistics failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

module.exports = new BlogController();