/**
 * @fileoverview Blog Management Service
 * @module servers/customer-services/modules/content/blog/services/blog-service
 * @description Comprehensive service for managing blog operations including CRUD, publishing, and analytics
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'blog-service'
});
const validator = require('validator');
const crypto = require('crypto');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services (optional - can be enabled when available)
// const NotificationService = require('../../notifications/services/notification-service');
// const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Blog Post Status Constants
 */
const POST_STATUS = {
    DRAFT: 'draft',
    PENDING_REVIEW: 'pending_review',
    SCHEDULED: 'scheduled',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
    UNPUBLISHED: 'unpublished'
};

/**
 * Blog Post Visibility Constants
 */
const POST_VISIBILITY = {
    PUBLIC: 'public',
    PRIVATE: 'private',
    PASSWORD_PROTECTED: 'password_protected',
    MEMBERS_ONLY: 'members_only'
};

/**
 * Blog Management Service
 * @class BlogService
 */
class BlogService {
    constructor() {
        this._dbService = null;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            defaultPostsPerPage: parseInt(process.env.BLOG_POSTS_PER_PAGE, 10) || 10,
            maxExcerptLength: parseInt(process.env.BLOG_MAX_EXCERPT_LENGTH, 10) || 500,
            enableComments: process.env.BLOG_ENABLE_COMMENTS !== 'false',
            moderateComments: process.env.BLOG_MODERATE_COMMENTS !== 'false',
            trackAnalytics: process.env.BLOG_TRACK_ANALYTICS !== 'false'
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    // ============= BLOG POST CRUD OPERATIONS =============

    /**
     * Create a new blog post
     * @param {Object} postData - Blog post information
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created blog post
     */
    async createPost(postData, options = {}) {
        try {
            logger.info('Starting blog post creation', {
                title: postData.title,
                tenantId: options.tenantId
            });

            // Validate post data
            await this._validatePostData(postData);

            // Set default values
            postData.tenantId = options.tenantId || this.config.companyTenantId;
            postData.createdBy = options.userId;

            // Initialize analytics
            postData.analytics = {
                views: { total: 0, unique: 0, byDate: [] },
                shares: { total: 0, byPlatform: {} },
                bookmarks: 0
            };

            // Initialize reactions
            postData.reactions = {
                likes: 0,
                helpful: 0,
                insightful: 0
            };

            // Initialize comments settings
            postData.comments = {
                enabled: this.config.enableComments,
                moderation: this.config.moderateComments ? 'post_approval' : 'none',
                count: 0
            };

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            // Create post
            const newPost = new BlogPost(postData);
            await newPost.save();

            logger.info('Blog post created successfully', {
                postId: newPost._id,
                title: newPost.title,
                status: newPost.status
            });

            // Track creation event
            await this._trackBlogEvent(newPost, 'post_created', {
                userId: options.userId
            });

            return this._sanitizePostOutput(newPost);

        } catch (error) {
            logger.error('Blog post creation failed', {
                error: error.message,
                stack: error.stack,
                title: postData?.title
            });
            throw error;
        }
    }

    /**
     * Get blog post by ID
     * @param {string} postId - Post ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Blog post data
     */
    async getPostById(postId, options = {}) {
        try {
            logger.info('Fetching blog post by ID', { postId });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            let query = BlogPost.findById(postId);

            // Apply population if requested
            if (options.populate) {
                query = query.populate('author.userId createdBy updatedBy');
            }

            const post = await query.exec();

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Check if deleted
            if (post.isDeleted && !options.includeDeleted) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Track view if enabled
            if (options.trackView && this.config.trackAnalytics && post.status === 'published') {
                await post.incrementViews();
            }

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Failed to fetch blog post', {
                error: error.message,
                postId
            });
            throw error;
        }
    }

    /**
     * Get blog post by slug
     * @param {string} slug - Post slug
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Blog post data
     */
    async getPostBySlug(slug, options = {}) {
        try {
            logger.info('Fetching blog post by slug', { slug });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const query = {
                slug: slug.toLowerCase(),
                isDeleted: false
            };

            if (options.tenantId) {
                query.tenantId = options.tenantId;
            }

            // For public access, only show published posts
            if (options.publicAccess) {
                query.status = 'published';
                query.publishedAt = { $lte: new Date() };
            }

            let postQuery = BlogPost.findOne(query);

            if (options.populate) {
                postQuery = postQuery.populate('author.userId');
            }

            const post = await postQuery.exec();

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { slug }
                });
            }

            // Track view if enabled
            if (options.trackView && this.config.trackAnalytics && post.status === 'published') {
                await post.incrementViews();
            }

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Failed to fetch blog post by slug', {
                error: error.message,
                slug
            });
            throw error;
        }
    }

    /**
     * Update blog post
     * @param {string} postId - Post ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated blog post
     */
    async updatePost(postId, updateData, options = {}) {
        try {
            logger.info('Starting blog post update', {
                postId,
                updateFields: Object.keys(updateData)
            });

            // Validate update data
            await this._validatePostUpdateData(updateData);

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            // Get existing post
            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Check if deleted
            if (post.isDeleted) {
                throw AppError.badRequest('Cannot update deleted post');
            }

            // Create revision if content changed
            if (updateData.content?.body && updateData.content.body !== post.content.body) {
                await post.createRevision(options.userId, options.changeNotes || 'Content updated');
            }

            // Apply updates
            Object.keys(updateData).forEach(key => {
                if (typeof updateData[key] === 'object' && !Array.isArray(updateData[key]) && updateData[key] !== null) {
                    // Merge nested objects
                    post[key] = { ...post[key]?.toObject?.() || post[key], ...updateData[key] };
                } else {
                    post[key] = updateData[key];
                }
            });

            post.updatedBy = options.userId;
            post.updatedAt = new Date();

            // Save updated post
            await post.save();

            logger.info('Blog post updated successfully', {
                postId,
                userId: options.userId
            });

            // Track update event
            await this._trackBlogEvent(post, 'post_updated', {
                userId: options.userId,
                updatedFields: Object.keys(updateData)
            });

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Blog post update failed', {
                error: error.message,
                postId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Delete blog post (soft delete)
     * @param {string} postId - Post ID
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Deleted blog post
     */
    async deletePost(postId, options = {}) {
        try {
            logger.info('Starting blog post deletion', { postId });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Soft delete
            post.isDeleted = true;
            post.deletedAt = new Date();
            post.deletedBy = options.userId;
            await post.save();

            logger.info('Blog post deleted successfully', {
                postId,
                userId: options.userId
            });

            // Track deletion event
            await this._trackBlogEvent(post, 'post_deleted', {
                userId: options.userId
            });

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Blog post deletion failed', {
                error: error.message,
                postId,
                stack: error.stack
            });
            throw error;
        }
    }

    // ============= PUBLISHING OPERATIONS =============

    /**
     * Publish a blog post
     * @param {string} postId - Post ID
     * @param {Object} options - Publish options
     * @returns {Promise<Object>} Published blog post
     */
    async publishPost(postId, options = {}) {
        try {
            logger.info('Publishing blog post', { postId });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Validate post is ready for publishing
            await this._validatePostForPublishing(post);

            // Publish the post
            await post.publish(options.userId);

            logger.info('Blog post published successfully', {
                postId,
                publishedAt: post.publishedAt
            });

            // Track publish event
            await this._trackBlogEvent(post, 'post_published', {
                userId: options.userId
            });

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Blog post publishing failed', {
                error: error.message,
                postId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Schedule a blog post for future publishing
     * @param {string} postId - Post ID
     * @param {Date} scheduledDate - Date to publish
     * @param {Object} options - Schedule options
     * @returns {Promise<Object>} Scheduled blog post
     */
    async schedulePost(postId, scheduledDate, options = {}) {
        try {
            logger.info('Scheduling blog post', { postId, scheduledDate });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            // Validate scheduled date
            if (new Date(scheduledDate) <= new Date()) {
                throw AppError.badRequest('Scheduled date must be in the future');
            }

            // Validate post is ready for publishing
            await this._validatePostForPublishing(post);

            // Set schedule
            post.status = POST_STATUS.SCHEDULED;
            post.scheduledAt = new Date(scheduledDate);
            post.updatedBy = options.userId;
            await post.save();

            logger.info('Blog post scheduled successfully', {
                postId,
                scheduledAt: post.scheduledAt
            });

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Blog post scheduling failed', {
                error: error.message,
                postId,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Unpublish a blog post
     * @param {string} postId - Post ID
     * @param {Object} options - Unpublish options
     * @returns {Promise<Object>} Unpublished blog post
     */
    async unpublishPost(postId, options = {}) {
        try {
            logger.info('Unpublishing blog post', { postId });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            await post.unpublish();

            logger.info('Blog post unpublished successfully', { postId });

            return this._sanitizePostOutput(post);

        } catch (error) {
            logger.error('Blog post unpublishing failed', {
                error: error.message,
                postId,
                stack: error.stack
            });
            throw error;
        }
    }

    // ============= QUERY OPERATIONS =============

    /**
     * Get published blog posts (public access)
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} List of published posts
     */
    async getPublishedPosts(filters = {}, options = {}) {
        try {
            logger.info('Fetching published blog posts', { filters });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            // Build query for published posts
            const query = {
                tenantId: options.tenantId || this.config.companyTenantId,
                status: POST_STATUS.PUBLISHED,
                publishedAt: { $lte: new Date() },
                isDeleted: false,
                visibility: POST_VISIBILITY.PUBLIC
            };

            // Apply filters
            if (filters.category) {
                query.category = filters.category;
            }

            if (filters.tag) {
                query.tags = filters.tag.toLowerCase();
            }

            if (filters.author) {
                query['author.userId'] = filters.author;
            }

            if (filters.featured !== undefined) {
                query.featured = filters.featured;
            }

            if (filters.searchTerm) {
                query.$or = [
                    { title: { $regex: filters.searchTerm, $options: 'i' } },
                    { excerpt: { $regex: filters.searchTerm, $options: 'i' } },
                    { tags: { $regex: filters.searchTerm, $options: 'i' } }
                ];
            }

            // Pagination
            const page = parseInt(filters.page, 10) || 1;
            const limit = parseInt(filters.limit, 10) || this.config.defaultPostsPerPage;
            const skip = (page - 1) * limit;

            // Sort
            const sort = filters.sort || { publishedAt: -1 };

            // Execute query
            const [posts, total] = await Promise.all([
                BlogPost.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .select('-content.body -searchTokens -auditLog -version.history')
                    .exec(),
                BlogPost.countDocuments(query)
            ]);

            logger.info('Published posts retrieved', {
                total,
                returned: posts.length,
                page
            });

            return {
                posts: posts.map(post => this._sanitizePostOutput(post)),
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                    hasMore: total > skip + posts.length
                }
            };

        } catch (error) {
            logger.error('Failed to fetch published posts', {
                error: error.message,
                filters,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get featured blog posts
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of featured posts
     */
    async getFeaturedPosts(options = {}) {
        try {
            logger.info('Fetching featured blog posts');

            return this.getPublishedPosts(
                { featured: true },
                { 
                    ...options, 
                    limit: options.limit || 3 
                }
            );

        } catch (error) {
            logger.error('Failed to fetch featured posts', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Search blog posts
     * @param {string} searchTerm - Search term
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchPosts(searchTerm, options = {}) {
        try {
            logger.info('Searching blog posts', { searchTerm });

            return this.getPublishedPosts(
                { searchTerm, ...options.filters },
                options
            );

        } catch (error) {
            logger.error('Blog post search failed', {
                error: error.message,
                searchTerm,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get all posts (admin access)
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} List of all posts
     */
    async getAllPosts(filters = {}, options = {}) {
        try {
            logger.info('Fetching all blog posts (admin)', { filters });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            // Build query
            const query = {
                tenantId: options.tenantId || this.config.companyTenantId
            };

            if (!options.includeDeleted) {
                query.isDeleted = false;
            }

            // Apply filters
            if (filters.status) {
                query.status = filters.status;
            }

            if (filters.category) {
                query.category = filters.category;
            }

            if (filters.author) {
                query['author.userId'] = filters.author;
            }

            if (filters.searchTerm) {
                query.$or = [
                    { title: { $regex: filters.searchTerm, $options: 'i' } },
                    { excerpt: { $regex: filters.searchTerm, $options: 'i' } }
                ];
            }

            // Pagination
            const page = parseInt(filters.page, 10) || 1;
            const limit = parseInt(filters.limit, 10) || 20;
            const skip = (page - 1) * limit;

            // Execute query
            const [posts, total] = await Promise.all([
                BlogPost.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .select('-content.body -searchTokens -auditLog')
                    .populate('author.userId createdBy', 'name email')
                    .exec(),
                BlogPost.countDocuments(query)
            ]);

            logger.info('All posts retrieved (admin)', {
                total,
                returned: posts.length,
                page
            });

            return {
                posts: posts.map(post => this._sanitizePostOutput(post)),
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to fetch all posts', {
                error: error.message,
                filters,
                stack: error.stack
            });
            throw error;
        }
    }

    // ============= METADATA OPERATIONS =============

    /**
     * Get all categories with post counts
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of categories
     */
    async getCategories(options = {}) {
        try {
            logger.info('Fetching blog categories');

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const tenantId = options.tenantId || this.config.companyTenantId;
            const categories = await BlogPost.getCategories(tenantId);

            // Add "All Posts" as first option
            const allCategories = [
                { _id: 'All Posts', count: categories.reduce((sum, cat) => sum + cat.count, 0) },
                ...categories
            ];

            logger.info('Categories retrieved', { count: allCategories.length });

            return allCategories;

        } catch (error) {
            logger.error('Failed to fetch categories', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get popular tags
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of popular tags
     */
    async getPopularTags(options = {}) {
        try {
            logger.info('Fetching popular tags');

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const tenantId = options.tenantId || this.config.companyTenantId;
            const limit = options.limit || 20;
            
            const tags = await BlogPost.getPopularTags(tenantId, limit);

            logger.info('Popular tags retrieved', { count: tags.length });

            return tags.map(tag => tag._id);

        } catch (error) {
            logger.error('Failed to fetch popular tags', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get authors with post counts
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of authors
     */
    async getAuthors(options = {}) {
        try {
            logger.info('Fetching blog authors');

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const tenantId = options.tenantId || this.config.companyTenantId;
            const authors = await BlogPost.getAuthors(tenantId);

            logger.info('Authors retrieved', { count: authors.length });

            return authors;

        } catch (error) {
            logger.error('Failed to fetch authors', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get blog statistics
     * @param {Object} filters - Filter criteria
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Blog statistics
     */
    async getStatistics(filters = {}, options = {}) {
        try {
            logger.info('Fetching blog statistics', { filters });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const tenantId = options.tenantId || this.config.companyTenantId;
            const dateRange = {};
            
            if (filters.dateFrom) {
                dateRange.start = new Date(filters.dateFrom);
            }
            if (filters.dateTo) {
                dateRange.end = new Date(filters.dateTo);
            }

            const statistics = await BlogPost.getStatistics(tenantId, dateRange);

            logger.info('Blog statistics retrieved');

            return statistics;

        } catch (error) {
            logger.error('Failed to fetch blog statistics', {
                error: error.message,
                filters,
                stack: error.stack
            });
            throw error;
        }
    }

    // ============= ENGAGEMENT OPERATIONS =============

    /**
     * Record a share
     * @param {string} postId - Post ID
     * @param {string} platform - Share platform
     * @returns {Promise<number>} Total shares
     */
    async recordShare(postId, platform) {
        try {
            logger.info('Recording share', { postId, platform });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            const totalShares = await post.incrementShare(platform);

            logger.info('Share recorded', { postId, platform, totalShares });

            return totalShares;

        } catch (error) {
            logger.error('Failed to record share', {
                error: error.message,
                postId,
                platform,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Add a reaction to a post
     * @param {string} postId - Post ID
     * @param {string} reactionType - Reaction type (likes, helpful, insightful)
     * @returns {Promise<Object>} Updated reactions
     */
    async addReaction(postId, reactionType) {
        try {
            logger.info('Adding reaction', { postId, reactionType });

            const dbService = this._getDatabaseService();
            const BlogPost = dbService.getModel('BlogPost', 'customer');

            const post = await BlogPost.findById(postId);

            if (!post) {
                throw AppError.notFound('Blog post not found', {
                    context: { postId }
                });
            }

            const reactions = await post.addReaction(reactionType);

            logger.info('Reaction added', { postId, reactionType, reactions });

            return reactions;

        } catch (error) {
            logger.error('Failed to add reaction', {
                error: error.message,
                postId,
                reactionType,
                stack: error.stack
            });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    /**
     * Validate post data
     * @private
     */
    async _validatePostData(postData) {
        const errors = [];

        // Required fields
        if (!postData.title || postData.title.trim().length === 0) {
            errors.push({ field: 'title', message: 'Title is required' });
        }

        if (postData.title && postData.title.length > 300) {
            errors.push({ field: 'title', message: 'Title too long (max 300 characters)' });
        }

        if (!postData.excerpt || postData.excerpt.trim().length === 0) {
            errors.push({ field: 'excerpt', message: 'Excerpt is required' });
        }

        if (postData.excerpt && postData.excerpt.length > this.config.maxExcerptLength) {
            errors.push({ field: 'excerpt', message: `Excerpt too long (max ${this.config.maxExcerptLength} characters)` });
        }

        if (!postData.content?.body || postData.content.body.trim().length === 0) {
            errors.push({ field: 'content.body', message: 'Content is required' });
        }

        if (!postData.category || postData.category.trim().length === 0) {
            errors.push({ field: 'category', message: 'Category is required' });
        }

        if (!postData.author?.name) {
            errors.push({ field: 'author.name', message: 'Author name is required' });
        }

        // Validate author email if provided
        if (postData.author?.email && !validator.isEmail(postData.author.email)) {
            errors.push({ field: 'author.email', message: 'Invalid author email' });
        }

        // Validate URLs
        if (postData.featuredImage?.url && !validator.isURL(postData.featuredImage.url, { require_protocol: true })) {
            errors.push({ field: 'featuredImage.url', message: 'Invalid featured image URL' });
        }

        if (errors.length > 0) {
            throw AppError.validation('Blog post validation failed', { errors });
        }
    }

    /**
     * Validate post update data
     * @private
     */
    async _validatePostUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['postId', 'tenantId', 'createdAt', 'createdBy'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate title length if provided
        if (updateData.title && updateData.title.length > 300) {
            errors.push({ field: 'title', message: 'Title too long (max 300 characters)' });
        }

        // Validate excerpt length if provided
        if (updateData.excerpt && updateData.excerpt.length > this.config.maxExcerptLength) {
            errors.push({ field: 'excerpt', message: `Excerpt too long (max ${this.config.maxExcerptLength} characters)` });
        }

        if (errors.length > 0) {
            throw AppError.validation('Blog post update validation failed', { errors });
        }
    }

    /**
     * Validate post is ready for publishing
     * @private
     */
    async _validatePostForPublishing(post) {
        const errors = [];

        if (!post.title || post.title.trim().length === 0) {
            errors.push({ field: 'title', message: 'Title is required for publishing' });
        }

        if (!post.excerpt || post.excerpt.trim().length === 0) {
            errors.push({ field: 'excerpt', message: 'Excerpt is required for publishing' });
        }

        if (!post.content?.body || post.content.body.trim().length === 0) {
            errors.push({ field: 'content.body', message: 'Content is required for publishing' });
        }

        if (!post.category) {
            errors.push({ field: 'category', message: 'Category is required for publishing' });
        }

        if (errors.length > 0) {
            throw AppError.validation('Post is not ready for publishing', { errors });
        }
    }

    // ============= HELPER METHODS =============

    /**
     * Track blog event
     * @private
     */
    async _trackBlogEvent(post, eventType, data) {
        try {
            logger.debug('Tracking blog event', {
                eventType,
                postId: post._id || post.id,
                data
            });
            // Placeholder for analytics integration
        } catch (error) {
            logger.error('Failed to track blog event', { error: error.message });
        }
    }

    /**
     * Sanitize post output
     * @private
     */
    _sanitizePostOutput(post) {
        if (!post) return null;

        const postObject = post.toObject ? post.toObject() : post;

        // Remove sensitive/internal fields
        delete postObject.__v;
        delete postObject.searchTokens;
        delete postObject.password;

        return postObject;
    }
}

module.exports = new BlogService();