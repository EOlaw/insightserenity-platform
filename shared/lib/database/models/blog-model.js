'use strict';

/**
 * @fileoverview Comprehensive blog model for enterprise content management
 * @module shared/lib/database/models/blog-model
 * @requires mongoose
 * @description Full-featured blog post model with multi-tenancy, analytics, SEO optimization,
 *              and enterprise content management capabilities
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Blog post schema definition for enterprise content management
 */
const blogPostSchemaDefinition = {
    // ==================== Core Identity ====================
    postId: {
        type: String,
        unique: true,
        required: true,
        index: true,
        immutable: true
    },

    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true
    },

    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300,
        index: true
    },

    subtitle: {
        type: String,
        trim: true,
        maxlength: 500
    },

    excerpt: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },

    // ==================== Content ====================
    content: {
        body: {
            type: String,
            required: true
        },
        format: {
            type: String,
            enum: ['markdown', 'html', 'rich_text'],
            default: 'markdown'
        },
        wordCount: {
            type: Number,
            default: 0
        },
        readTime: {
            type: Number, // in minutes
            default: 0
        },
        tableOfContents: [{
            id: String,
            title: String,
            level: Number
        }]
    },

    // ==================== Multi-Tenancy ====================
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
        index: true
    },

    // ==================== Author Information ====================
    author: {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        role: {
            type: String,
            trim: true
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        },
        avatar: String,
        bio: {
            type: String,
            maxlength: 500
        },
        socialLinks: {
            linkedin: String,
            twitter: String,
            github: String,
            website: String
        }
    },

    coAuthors: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        name: String,
        role: String,
        contribution: String
    }],

    // ==================== Categorization ====================
    category: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    subcategory: {
        type: String,
        trim: true
    },

    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],

    // ==================== Media & Assets ====================
    featuredImage: {
        url: String,
        alt: String,
        caption: String,
        credit: String,
        width: Number,
        height: Number,
        thumbnails: {
            small: String,
            medium: String,
            large: String
        }
    },

    gallery: [{
        url: String,
        alt: String,
        caption: String,
        order: Number
    }],

    attachments: [{
        name: String,
        url: String,
        type: String,
        size: Number,
        downloadCount: {
            type: Number,
            default: 0
        }
    }],

    // ==================== Publishing & Scheduling ====================
    status: {
        type: String,
        enum: ['draft', 'pending_review', 'scheduled', 'published', 'archived', 'unpublished'],
        default: 'draft',
        index: true
    },

    visibility: {
        type: String,
        enum: ['public', 'private', 'password_protected', 'members_only'],
        default: 'public'
    },

    password: {
        type: String,
        select: false
    },

    publishedAt: {
        type: Date,
        index: true
    },

    scheduledAt: {
        type: Date,
        index: true
    },

    expiresAt: Date,

    featured: {
        type: Boolean,
        default: false,
        index: true
    },

    sticky: {
        type: Boolean,
        default: false
    },

    // ==================== SEO & Meta ====================
    seo: {
        metaTitle: {
            type: String,
            maxlength: 70
        },
        metaDescription: {
            type: String,
            maxlength: 160
        },
        metaKeywords: [String],
        canonicalUrl: String,
        noIndex: {
            type: Boolean,
            default: false
        },
        noFollow: {
            type: Boolean,
            default: false
        },
        ogImage: String,
        ogTitle: String,
        ogDescription: String,
        twitterCard: {
            type: String,
            enum: ['summary', 'summary_large_image', 'app', 'player'],
            default: 'summary_large_image'
        },
        structuredData: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        }
    },

    // ==================== Engagement & Analytics ====================
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
            byDate: [{
                date: Date,
                views: Number
            }]
        },
        engagement: {
            averageReadTime: Number,
            scrollDepth: Number,
            bounceRate: Number
        },
        shares: {
            total: {
                type: Number,
                default: 0
            },
            byPlatform: {
                twitter: { type: Number, default: 0 },
                linkedin: { type: Number, default: 0 },
                facebook: { type: Number, default: 0 },
                email: { type: Number, default: 0 },
                other: { type: Number, default: 0 }
            }
        },
        bookmarks: {
            type: Number,
            default: 0
        },
        clickThroughRate: Number,
        sources: [{
            source: String,
            medium: String,
            campaign: String,
            visits: Number
        }]
    },

    // ==================== Comments & Reactions ====================
    comments: {
        enabled: {
            type: Boolean,
            default: true
        },
        moderation: {
            type: String,
            enum: ['none', 'pre_approval', 'post_approval'],
            default: 'post_approval'
        },
        count: {
            type: Number,
            default: 0
        },
        lastCommentAt: Date
    },

    reactions: {
        likes: {
            type: Number,
            default: 0
        },
        helpful: {
            type: Number,
            default: 0
        },
        insightful: {
            type: Number,
            default: 0
        }
    },

    // ==================== Related Content ====================
    relatedPosts: [{
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BlogPost'
        },
        relevanceScore: Number
    }],

    series: {
        name: String,
        part: Number,
        total: Number,
        previousPost: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BlogPost'
        },
        nextPost: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BlogPost'
        }
    },

    // ==================== Call to Action ====================
    cta: {
        enabled: {
            type: Boolean,
            default: false
        },
        type: {
            type: String,
            enum: ['newsletter', 'demo', 'download', 'contact', 'custom']
        },
        title: String,
        description: String,
        buttonText: String,
        buttonUrl: String,
        position: {
            type: String,
            enum: ['top', 'middle', 'bottom', 'sidebar'],
            default: 'bottom'
        }
    },

    // ==================== Versioning & Revision ====================
    version: {
        current: {
            type: Number,
            default: 1
        },
        history: [{
            version: Number,
            content: String,
            title: String,
            excerpt: String,
            editedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            editedAt: Date,
            changeNotes: String
        }]
    },

    // ==================== Editorial Workflow ====================
    workflow: {
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewers: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected', 'changes_requested']
            },
            comments: String,
            reviewedAt: Date
        }],
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date,
        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },

    // ==================== Localization ====================
    locale: {
        type: String,
        default: 'en',
        index: true
    },

    translations: [{
        locale: String,
        title: String,
        excerpt: String,
        content: String,
        slug: String,
        translatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        translatedAt: Date
    }],

    // ==================== Custom Fields ====================
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },

    // ==================== Search Optimization ====================
    searchTokens: {
        type: [String],
        select: false
    },

    // ==================== Audit Trail ====================
    auditLog: [{
        action: String,
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedAt: Date,
        ip: String,
        userAgent: String
    }],

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'import', 'api', 'migration'],
            default: 'manual'
        },
        importBatch: String,
        importedAt: Date,
        externalId: String,
        externalUrl: String
    },

    // ==================== Lifecycle ====================
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // ==================== Soft Delete ====================
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

    // ==================== Archive ====================
    archiveStatus: {
        isArchived: {
            type: Boolean,
            default: false
        },
        archivedAt: Date,
        archivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        archiveReason: String
    }
};

const blogPostSchema = new Schema(blogPostSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
blogPostSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
blogPostSchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ tenantId: 1, category: 1 });
blogPostSchema.index({ tenantId: 1, tags: 1 });
blogPostSchema.index({ tenantId: 1, 'author.userId': 1 });
blogPostSchema.index({ tenantId: 1, featured: 1, publishedAt: -1 });
blogPostSchema.index({ tenantId: 1, 'analytics.views.total': -1 });
blogPostSchema.index({ tenantId: 1, createdAt: -1 });
blogPostSchema.index({ tenantId: 1, isDeleted: 1 });
blogPostSchema.index({ tenantId: 1, searchTokens: 1 });

// Text search index
blogPostSchema.index({
    title: 'text',
    excerpt: 'text',
    'content.body': 'text',
    tags: 'text',
    'author.name': 'text'
});

// ==================== Virtual Fields ====================
blogPostSchema.virtual('isPublished').get(function() {
    return this.status === 'published' && 
           this.publishedAt && 
           this.publishedAt <= new Date() && 
           !this.isDeleted;
});

blogPostSchema.virtual('isScheduled').get(function() {
    return this.status === 'scheduled' && 
           this.scheduledAt && 
           this.scheduledAt > new Date();
});

blogPostSchema.virtual('url').get(function() {
    return `/blog/${this.slug}`;
});

blogPostSchema.virtual('readTimeFormatted').get(function() {
    const minutes = this.content.readTime || 0;
    return `${minutes} min read`;
});

blogPostSchema.virtual('formattedDate').get(function() {
    if (!this.publishedAt) return null;
    return this.publishedAt.toISOString().split('T')[0];
});

// ==================== Pre-save Middleware ====================
blogPostSchema.pre('save', async function(next) {
    try {
        // Generate post ID if not provided
        if (!this.postId && this.isNew) {
            this.postId = await this.constructor.generatePostId(this.tenantId);
        }

        // Generate slug from title if not provided
        if (!this.slug && this.title) {
            this.slug = await this.constructor.generateSlug(this.title, this.tenantId);
        }

        // Calculate word count and read time
        if (this.isModified('content.body')) {
            const plainText = this.content.body.replace(/<[^>]*>/g, '').replace(/[#*`_~\[\]]/g, '');
            this.content.wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;
            this.content.readTime = Math.ceil(this.content.wordCount / 200); // 200 words per minute
        }

        // Update search tokens
        this.updateSearchTokens();

        // Set published date when status changes to published
        if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
            this.publishedAt = new Date();
        }

        // Auto-generate SEO meta if not provided
        if (!this.seo.metaTitle) {
            this.seo.metaTitle = this.title.substring(0, 70);
        }
        if (!this.seo.metaDescription) {
            this.seo.metaDescription = this.excerpt.substring(0, 160);
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
blogPostSchema.methods.updateSearchTokens = function() {
    const tokens = new Set();
    
    // Add title tokens
    if (this.title) {
        this.title.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
    
    // Add excerpt tokens
    if (this.excerpt) {
        this.excerpt.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
    
    // Add tags
    if (this.tags) {
        this.tags.forEach(tag => tokens.add(tag.toLowerCase()));
    }
    
    // Add category
    if (this.category) {
        tokens.add(this.category.toLowerCase());
    }
    
    // Add author name
    if (this.author?.name) {
        this.author.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
    
    this.searchTokens = Array.from(tokens);
};

blogPostSchema.methods.incrementViews = async function() {
    this.analytics.views.total += 1;
    
    // Update daily views
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyView = this.analytics.views.byDate.find(
        d => d.date.getTime() === today.getTime()
    );
    
    if (dailyView) {
        dailyView.views += 1;
    } else {
        this.analytics.views.byDate.push({ date: today, views: 1 });
        // Keep only last 90 days
        if (this.analytics.views.byDate.length > 90) {
            this.analytics.views.byDate = this.analytics.views.byDate.slice(-90);
        }
    }
    
    await this.save();
    return this.analytics.views.total;
};

blogPostSchema.methods.incrementShare = async function(platform) {
    this.analytics.shares.total += 1;
    
    if (this.analytics.shares.byPlatform[platform] !== undefined) {
        this.analytics.shares.byPlatform[platform] += 1;
    } else {
        this.analytics.shares.byPlatform.other += 1;
    }
    
    await this.save();
    return this.analytics.shares.total;
};

blogPostSchema.methods.addReaction = async function(type) {
    if (this.reactions[type] !== undefined) {
        this.reactions[type] += 1;
        await this.save();
    }
    return this.reactions;
};

blogPostSchema.methods.publish = async function(userId) {
    this.status = 'published';
    this.publishedAt = new Date();
    this.workflow.publishedBy = userId;
    await this.save();
    return this;
};

blogPostSchema.methods.unpublish = async function() {
    this.status = 'unpublished';
    await this.save();
    return this;
};

blogPostSchema.methods.archive = async function(userId, reason) {
    this.archiveStatus = {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: userId,
        archiveReason: reason
    };
    this.status = 'archived';
    await this.save();
    return this;
};

blogPostSchema.methods.createRevision = async function(userId, changeNotes) {
    const revision = {
        version: this.version.current,
        content: this.content.body,
        title: this.title,
        excerpt: this.excerpt,
        editedBy: userId,
        editedAt: new Date(),
        changeNotes
    };
    
    this.version.history.push(revision);
    this.version.current += 1;
    
    // Keep only last 50 revisions
    if (this.version.history.length > 50) {
        this.version.history = this.version.history.slice(-50);
    }
    
    await this.save();
    return revision;
};

// ==================== Static Methods ====================
blogPostSchema.statics.generatePostId = async function(tenantId) {
    const prefix = 'POST';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const postId = `${prefix}-${timestamp}-${random}`;
    
    // Verify uniqueness
    const existing = await this.findOne({ postId });
    if (existing) {
        return this.generatePostId(tenantId);
    }
    
    return postId;
};

blogPostSchema.statics.generateSlug = async function(title, tenantId) {
    let slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100);
    
    // Check for existing slug
    const existing = await this.findOne({ tenantId, slug });
    if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`;
    }
    
    return slug;
};

blogPostSchema.statics.findPublished = async function(tenantId, options = {}) {
    const {
        category,
        tag,
        author,
        featured,
        limit = 10,
        skip = 0,
        sort = { publishedAt: -1 }
    } = options;
    
    const query = {
        tenantId,
        status: 'published',
        publishedAt: { $lte: new Date() },
        isDeleted: false
    };
    
    if (category) {
        query.category = category;
    }
    
    if (tag) {
        query.tags = tag;
    }
    
    if (author) {
        query['author.userId'] = author;
    }
    
    if (featured !== undefined) {
        query.featured = featured;
    }
    
    const [posts, total] = await Promise.all([
        this.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .select('-content.body -searchTokens -auditLog -version.history'),
        this.countDocuments(query)
    ]);
    
    return {
        posts,
        total,
        hasMore: total > skip + posts.length
    };
};

blogPostSchema.statics.getCategories = async function(tenantId) {
    return this.aggregate([
        { 
            $match: { 
                tenantId: new mongoose.Types.ObjectId(tenantId),
                status: 'published',
                isDeleted: false 
            } 
        },
        { 
            $group: { 
                _id: '$category', 
                count: { $sum: 1 } 
            } 
        },
        { $sort: { count: -1 } }
    ]);
};

blogPostSchema.statics.getPopularTags = async function(tenantId, limit = 20) {
    return this.aggregate([
        { 
            $match: { 
                tenantId: new mongoose.Types.ObjectId(tenantId),
                status: 'published',
                isDeleted: false 
            } 
        },
        { $unwind: '$tags' },
        { 
            $group: { 
                _id: '$tags', 
                count: { $sum: 1 } 
            } 
        },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
};

blogPostSchema.statics.getAuthors = async function(tenantId) {
    return this.aggregate([
        { 
            $match: { 
                tenantId: new mongoose.Types.ObjectId(tenantId),
                status: 'published',
                isDeleted: false 
            } 
        },
        { 
            $group: { 
                _id: '$author.userId',
                name: { $first: '$author.name' },
                role: { $first: '$author.role' },
                avatar: { $first: '$author.avatar' },
                posts: { $sum: 1 }
            } 
        },
        { $sort: { posts: -1 } }
    ]);
};

blogPostSchema.statics.getStatistics = async function(tenantId, dateRange = {}) {
    const match = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        isDeleted: false
    };
    
    if (dateRange.start || dateRange.end) {
        match.createdAt = {};
        if (dateRange.start) match.createdAt.$gte = dateRange.start;
        if (dateRange.end) match.createdAt.$lte = dateRange.end;
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $facet: {
                overview: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            published: {
                                $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] }
                            },
                            drafts: {
                                $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
                            },
                            totalViews: { $sum: '$analytics.views.total' },
                            totalShares: { $sum: '$analytics.shares.total' },
                            avgReadTime: { $avg: '$content.readTime' }
                        }
                    }
                ],
                byCategory: [
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                topPosts: [
                    { $match: { status: 'published' } },
                    { $sort: { 'analytics.views.total': -1 } },
                    { $limit: 10 },
                    { $project: { title: 1, slug: 1, views: '$analytics.views.total' } }
                ],
                recentPosts: [
                    { $sort: { createdAt: -1 } },
                    { $limit: 5 },
                    { $project: { title: 1, status: 1, createdAt: 1 } }
                ]
            }
        }
    ]);
    
    return {
        overview: stats[0].overview[0] || {
            total: 0,
            published: 0,
            drafts: 0,
            totalViews: 0,
            totalShares: 0,
            avgReadTime: 0
        },
        byCategory: stats[0].byCategory,
        topPosts: stats[0].topPosts,
        recentPosts: stats[0].recentPosts
    };
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: blogPostSchema,
    modelName: 'BlogPost',
    
    createModel: function(connection) {
        if (connection) {
            return connection.model('BlogPost', blogPostSchema);
        }
        return mongoose.model('BlogPost', blogPostSchema);
    }
};

// For backward compatibility
module.exports.BlogPost = mongoose.model('BlogPost', blogPostSchema);
module.exports.blogPostSchema = blogPostSchema;