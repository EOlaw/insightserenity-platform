'use strict';

/**
 * @fileoverview Consultation Package Model - Consultation bundles and credits
 * @module shared/lib/database/models/customer-services/core-business/consultation-management/consultation-package-model
 * @description Manages consultation packages, bundles, credits, and subscription plans
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Consultation Package Schema Definition
 * Manages consultation credits, packages, and subscription plans
 */
const consultationPackageSchemaDefinition = {
    // ==================== Core Identity ====================
    packageId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^PKG-[A-Z0-9-]+$/,
        index: true,
        immutable: true
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
        required: true,
        index: true
    },

    // ==================== Package Details ====================
    details: {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
            index: true
        },
        description: {
            type: String,
            maxlength: 2000
        },
        type: {
            type: String,
            enum: [
                'free_trial',              // First-time 15-min consultation
                'pay_per_use',             // Single consultation
                'consultation_bundle',      // Bulk consultation credits
                'monthly_subscription',     // Monthly unlimited/limited
                'quarterly_subscription',   // Quarterly plan
                'annual_subscription',      // Annual plan
                'custom_plan'              // Enterprise custom
            ],
            required: true,
            index: true
        },
        category: {
            type: String,
            enum: ['individual', 'business', 'enterprise'],
            default: 'individual'
        },
        sku: {
            type: String,
            unique: true,
            sparse: true
        }
    },

    // ==================== Credits & Usage ====================
    credits: {
        total: {
            type: Number,
            required: true,
            min: 0
        },
        unlimited: {
            type: Boolean,
            default: false
        },
        duration: {
            minutes: {
                type: Number,
                min: 0
            },
            hours: {
                type: Number,
                min: 0
            }
        },
        expiresAfterDays: {
            type: Number,
            min: 0
        },
        rollover: {
            allowed: {
                type: Boolean,
                default: false
            },
            maxRollover: Number
        }
    },

    // ==================== Pricing ====================
    pricing: {
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            required: true,
            default: 'USD',
            uppercase: true
        },
        pricePerCredit: Number,
        discount: {
            percentage: {
                type: Number,
                min: 0,
                max: 100
            },
            amount: {
                type: Number,
                min: 0
            },
            reason: String
        },
        originalPrice: Number,
        savings: Number,
        taxable: {
            type: Boolean,
            default: true
        }
    },

    // ==================== Subscription Details ====================
    subscription: {
        recurring: {
            type: Boolean,
            default: false
        },
        interval: {
            type: String,
            enum: ['day', 'week', 'month', 'quarter', 'year'],
            default: 'month'
        },
        intervalCount: {
            type: Number,
            min: 1,
            default: 1
        },
        trialPeriod: {
            enabled: {
                type: Boolean,
                default: false
            },
            days: {
                type: Number,
                min: 0
            }
        },
        billingCycle: {
            type: String,
            enum: ['prepaid', 'postpaid'],
            default: 'prepaid'
        },
        autoRenew: {
            type: Boolean,
            default: true
        },
        cancellationPolicy: {
            allowCancellation: {
                type: Boolean,
                default: true
            },
            refundable: Boolean,
            noticePeriodDays: Number
        }
    },

    // ==================== Eligibility & Restrictions ====================
    eligibility: {
        clientTypes: [{
            type: String,
            enum: ['new', 'existing', 'returning', 'premium', 'all']
        }],
        minimumPurchase: {
            amount: Number,
            currency: String
        },
        maximumPurchasePerClient: Number,
        requiresApproval: {
            type: Boolean,
            default: false
        },
        consultantTiers: [{
            type: String,
            enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'all']
        }],
        consultationType: [{
            type: String
        }],
        geographicRestrictions: {
            allowedCountries: [String],
            blockedCountries: [String]
        }
    },

    // ==================== Features & Benefits ====================
    features: [{
        name: String,
        description: String,
        included: {
            type: Boolean,
            default: true
        },
        value: String
    }],

    // ==================== Stripe Integration ====================
    stripe: {
        priceId: {
            type: String,
            index: true,
            sparse: true
        },
        productId: {
            type: String,
            index: true,
            sparse: true
        },
        lookupKey: String,
        metadata: {
            type: Map,
            of: String
        }
    },

    // ==================== Availability ====================
    availability: {
        status: {
            type: String,
            enum: ['draft', 'active', 'inactive', 'archived', 'discontinued'],
            default: 'draft',
            index: true
        },
        startDate: Date,
        endDate: Date,
        limitedTimeOffer: {
            type: Boolean,
            default: false
        },
        quantityLimit: {
            total: Number,
            remaining: Number
        },
        visibleToPublic: {
            type: Boolean,
            default: true
        },
        featuredPackage: {
            type: Boolean,
            default: false
        },
        displayOrder: {
            type: Number,
            default: 0
        }
    },

    // ==================== Usage Statistics ====================
    statistics: {
        totalPurchases: {
            type: Number,
            default: 0
        },
        activeSubscriptions: {
            type: Number,
            default: 0
        },
        totalRevenue: {
            type: Number,
            default: 0
        },
        averageRating: {
            type: Number,
            min: 0,
            max: 5
        },
        conversionRate: Number,
        churnRate: Number,
        lastPurchased: Date
    },

    // ==================== Terms & Conditions ====================
    terms: {
        termsUrl: String,
        acceptanceRequired: {
            type: Boolean,
            default: false
        },
        refundPolicy: String,
        cancellationPolicy: String,
        usageRestrictions: [String],
        disclaimers: [String]
    },

    // ==================== Marketing ====================
    marketing: {
        tagline: String,
        highlights: [String],
        badge: {
            type: String,
            enum: ['popular', 'best_value', 'new', 'limited', 'recommended', 'none'],
            default: 'none'
        },
        testimonials: [{
            clientName: String,
            feedback: String,
            rating: Number,
            date: Date
        }],
        images: [{
            url: String,
            alt: String,
            isPrimary: Boolean
        }]
    },

    // ==================== Metadata ====================
    metadata: {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        tags: [String],
        customFields: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },
        notes: String
    },

    // ==================== Status ====================
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },

    deletedAt: Date,

    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
};

const consultationPackageSchema = new Schema(consultationPackageSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
consultationPackageSchema.index({ tenantId: 1, packageId: 1 }, { unique: true });
consultationPackageSchema.index({ tenantId: 1, 'details.type': 1 });
consultationPackageSchema.index({ tenantId: 1, 'availability.status': 1 });
consultationPackageSchema.index({ tenantId: 1, 'details.sku': 1 }, { sparse: true });
consultationPackageSchema.index({ 'stripe.priceId': 1 }, { sparse: true });
consultationPackageSchema.index({ 'stripe.productId': 1 }, { sparse: true });
consultationPackageSchema.index({ 'availability.featuredPackage': 1, 'availability.displayOrder': 1 });

// ==================== Virtuals ====================
consultationPackageSchema.virtual('isActive').get(function() {
    return this.availability.status === 'active' &&
           (!this.availability.endDate || this.availability.endDate > new Date()) &&
           !this.isDeleted;
});

consultationPackageSchema.virtual('isFreeT rial').get(function() {
    return this.details.type === 'free_trial';
});

consultationPackageSchema.virtual('isSubscription').get(function() {
    return this.subscription.recurring;
});

consultationPackageSchema.virtual('effectivePrice').get(function() {
    if (this.pricing.discount?.amount) {
        return this.pricing.amount - this.pricing.discount.amount;
    }
    if (this.pricing.discount?.percentage) {
        return this.pricing.amount * (1 - this.pricing.discount.percentage / 100);
    }
    return this.pricing.amount;
});

consultationPackageSchema.virtual('savingsAmount').get(function() {
    if (this.pricing.originalPrice) {
        return this.pricing.originalPrice - this.effectivePrice;
    }
    return 0;
});

consultationPackageSchema.virtual('savingsPercentage').get(function() {
    if (this.pricing.originalPrice && this.pricing.originalPrice > 0) {
        return ((this.pricing.originalPrice - this.effectivePrice) / this.pricing.originalPrice) * 100;
    }
    return 0;
});

consultationPackageSchema.virtual('totalMinutes').get(function() {
    const hours = this.credits.duration?.hours || 0;
    const minutes = this.credits.duration?.minutes || 0;
    return (hours * 60) + minutes;
});

// ==================== Pre-Save Middleware ====================
consultationPackageSchema.pre('save', async function(next) {
    try {
        // Calculate price per credit
        if (this.credits.total > 0 && this.pricing.amount > 0) {
            this.pricing.pricePerCredit = this.pricing.amount / this.credits.total;
        }

        // Calculate savings
        if (this.pricing.originalPrice) {
            const effective = this.effectivePrice;
            this.pricing.savings = this.pricing.originalPrice - effective;
        }

        // Update quantity remaining
        if (this.availability.quantityLimit?.total && !this.availability.quantityLimit.remaining) {
            this.availability.quantityLimit.remaining = this.availability.quantityLimit.total;
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
consultationPackageSchema.methods.purchase = async function(quantity = 1) {
    // Update statistics
    this.statistics.totalPurchases = (this.statistics.totalPurchases || 0) + quantity;
    this.statistics.totalRevenue = (this.statistics.totalRevenue || 0) + (this.effectivePrice * quantity);
    this.statistics.lastPurchased = new Date();

    // Update quantity if limited
    if (this.availability.quantityLimit?.remaining) {
        this.availability.quantityLimit.remaining -= quantity;

        if (this.availability.quantityLimit.remaining <= 0) {
            this.availability.status = 'inactive';
        }
    }

    // Increment active subscriptions if applicable
    if (this.isSubscription) {
        this.statistics.activeSubscriptions = (this.statistics.activeSubscriptions || 0) + 1;
    }

    return this.save();
};

consultationPackageSchema.methods.cancelSubscription = async function() {
    if (this.isSubscription && this.statistics.activeSubscriptions > 0) {
        this.statistics.activeSubscriptions -= 1;
    }
    return this.save();
};

consultationPackageSchema.methods.activate = async function(userId) {
    this.availability.status = 'active';
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationPackageSchema.methods.deactivate = async function(userId) {
    this.availability.status = 'inactive';
    this.metadata.updatedBy = userId;
    return this.save();
};

consultationPackageSchema.methods.archive = async function(userId) {
    this.availability.status = 'archived';
    this.metadata.updatedBy = userId;
    return this.save();
};

// ==================== Static Methods ====================
consultationPackageSchema.statics.generatePackageId = async function(tenantId, prefix = 'PKG') {
    const count = await this.countDocuments({ tenantId });
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${timestamp}-${(count + 1).toString().padStart(4, '0')}`;
};

consultationPackageSchema.statics.findActivePackages = function(tenantId, options = {}) {
    const query = {
        tenantId,
        'availability.status': 'active',
        isDeleted: false,
        $or: [
            { 'availability.startDate': { $lte: new Date() } },
            { 'availability.startDate': { $exists: false } }
        ],
        $or: [
            { 'availability.endDate': { $gte: new Date() } },
            { 'availability.endDate': { $exists: false } }
        ]
    };

    if (options.type) {
        query['details.type'] = options.type;
    }

    if (options.category) {
        query['details.category'] = options.category;
    }

    if (options.featured) {
        query['availability.featuredPackage'] = true;
    }

    return this.find(query)
        .sort({ 'availability.featuredPackage': -1, 'availability.displayOrder': 1 });
};

consultationPackageSchema.statics.getFreeTrialPackage = function(tenantId) {
    return this.findOne({
        tenantId,
        'details.type': 'free_trial',
        'availability.status': 'active',
        isDeleted: false
    });
};

consultationPackageSchema.statics.getPopularPackages = function(tenantId, limit = 5) {
    return this.find({
        tenantId,
        'availability.status': 'active',
        isDeleted: false
    })
        .sort({ 'statistics.totalPurchases': -1 })
        .limit(limit);
};

consultationPackageSchema.statics.getPackageStatistics = async function(tenantId) {
    const stats = await this.aggregate([
        {
            $match: {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                isDeleted: false
            }
        },
        {
            $group: {
                _id: null,
                totalPackages: { $sum: 1 },
                activePackages: {
                    $sum: { $cond: [{ $eq: ['$availability.status', 'active'] }, 1, 0] }
                },
                totalPurchases: { $sum: '$statistics.totalPurchases' },
                totalRevenue: { $sum: '$statistics.totalRevenue' },
                activeSubscriptions: { $sum: '$statistics.activeSubscriptions' }
            }
        }
    ]);

    return stats[0] || {
        totalPackages: 0,
        activePackages: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        activeSubscriptions: 0
    };
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: consultationPackageSchema,
    modelName: 'ConsultationPackage',
    createModel: function(connection) {
        if (connection) {
            return connection.model('ConsultationPackage', consultationPackageSchema);
        }
        return mongoose.model('ConsultationPackage', consultationPackageSchema);
    }
};

module.exports.ConsultationPackage = mongoose.model('ConsultationPackage', consultationPackageSchema);
module.exports.consultationPackageSchema = consultationPackageSchema;
