'use strict';

/**
 * @fileoverview Billing Model - Payment transactions and financial tracking
 * @module shared/lib/database/models/customer-services/core-business/consultation-management/billing-model
 * @description Manages payment transactions, Stripe integration, refunds, and financial reconciliation
 * for consultation services
 * @requires mongoose
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');

/**
 * Billing Transaction Schema Definition
 * Tracks all payment transactions for consultations and packages
 */
const billingSchemaDefinition = {
    // ==================== Core Identity ====================
    transactionId: {
        type: String,
        unique: true,
        required: true,
        uppercase: true,
        match: /^TXN-[A-Z0-9-]+$/,
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

    // ==================== Primary Relationships ====================
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },

    consultantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultant',
        index: true
    },

    consultationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consultation',
        index: true
    },

    packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ConsultationPackage',
        index: true
    },

    // ==================== Transaction Details ====================
    details: {
        type: {
            type: String,
            enum: [
                'consultation_payment',
                'package_purchase',
                'subscription_payment',
                'refund',
                'cancellation_fee',
                'late_fee',
                'adjustment',
                'consultant_payout',
                'other'
            ],
            required: true,
            index: true
        },
        description: {
            type: String,
            required: true,
            maxlength: 500
        },
        itemDetails: {
            consultationType: String,
            duration: Number,
            hourlyRate: Number,
            quantity: Number,
            unitPrice: Number
        }
    },

    // ==================== Amount & Currency ====================
    amount: {
        gross: {
            type: Number,
            required: true,
            min: 0
        },
        platformFee: {
            type: Number,
            default: 0,
            min: 0
        },
        processingFee: {
            type: Number,
            default: 0,
            min: 0
        },
        tax: {
            type: Number,
            default: 0,
            min: 0
        },
        discount: {
            type: Number,
            default: 0,
            min: 0
        },
        net: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            required: true,
            default: 'USD',
            uppercase: true
        }
    },

    // ==================== Stripe Integration ====================
    stripe: {
        paymentIntentId: {
            type: String,
            index: true,
            sparse: true
        },
        chargeId: {
            type: String,
            index: true,
            sparse: true
        },
        customerId: {
            type: String,
            index: true
        },
        paymentMethodId: {
            type: String
        },
        invoiceId: {
            type: String
        },
        subscriptionId: {
            type: String,
            index: true,
            sparse: true
        },
        receiptUrl: {
            type: String
        },
        receiptNumber: {
            type: String
        },
        statementDescriptor: {
            type: String,
            maxlength: 22
        },
        metadata: {
            type: Map,
            of: String
        },
        webhookEvents: [{
            eventId: String,
            eventType: String,
            receivedAt: Date,
            processed: Boolean
        }]
    },

    // ==================== Payment Method ====================
    paymentMethod: {
        type: {
            type: String,
            enum: ['credit_card', 'debit_card', 'ach', 'wire', 'paypal', 'wallet', 'bank_transfer', 'other'],
            required: true
        },
        brand: String,
        last4: String,
        expiryMonth: Number,
        expiryYear: Number,
        country: String,
        funding: {
            type: String,
            enum: ['credit', 'debit', 'prepaid', 'unknown']
        },
        fingerprint: String
    },

    // ==================== Transaction Status ====================
    status: {
        current: {
            type: String,
            enum: [
                'pending',
                'processing',
                'requires_action',
                'requires_capture',
                'succeeded',
                'failed',
                'cancelled',
                'refunded',
                'partially_refunded',
                'disputed'
            ],
            default: 'pending',
            required: true,
            index: true
        },
        history: [{
            status: String,
            changedAt: Date,
            changedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reason: String,
            notes: String,
            metadata: mongoose.Schema.Types.Mixed
        }],
        failureReason: {
            code: String,
            message: String,
            declineCode: String,
            networkStatus: String
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
        }
    },

    // ==================== Dates & Timing ====================
    dates: {
        initiated: {
            type: Date,
            default: Date.now,
            required: true
        },
        authorized: Date,
        captured: Date,
        completed: Date,
        failed: Date,
        refunded: Date,
        dueDate: Date,
        expiresAt: Date
    },

    // ==================== Refund Information ====================
    refund: {
        isRefunded: {
            type: Boolean,
            default: false
        },
        refundAmount: {
            type: Number,
            min: 0
        },
        refundReason: {
            type: String,
            enum: [
                'client_requested',
                'duplicate_charge',
                'fraudulent',
                'consultation_cancelled',
                'poor_service',
                'technical_issue',
                'other'
            ]
        },
        refundedAt: Date,
        refundedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        stripeRefundId: String,
        refundStatus: {
            type: String,
            enum: ['pending', 'succeeded', 'failed', 'cancelled']
        },
        partialRefunds: [{
            amount: Number,
            reason: String,
            stripeRefundId: String,
            refundedAt: Date,
            refundedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }]
    },

    // ==================== Dispute Information ====================
    dispute: {
        isDisputed: {
            type: Boolean,
            default: false
        },
        disputeId: String,
        reason: String,
        status: {
            type: String,
            enum: ['open', 'under_review', 'won', 'lost', 'expired']
        },
        amount: Number,
        evidence: {
            submittedAt: Date,
            documentUrls: [String],
            notes: String
        },
        disputedAt: Date,
        resolvedAt: Date,
        resolution: String
    },

    // ==================== Consultant Payout ====================
    consultantPayout: {
        amount: {
            type: Number,
            min: 0
        },
        status: {
            type: String,
            enum: ['pending', 'scheduled', 'processing', 'paid', 'failed', 'cancelled'],
            default: 'pending'
        },
        scheduledDate: Date,
        paidDate: Date,
        payoutMethod: {
            type: String,
            enum: ['stripe_connect', 'ach', 'wire', 'check', 'paypal']
        },
        stripeTransferId: String,
        payoutDetails: {
            type: Map,
            of: mongoose.Schema.Types.Mixed
        },
        notes: String
    },

    // ==================== Invoice Information ====================
    invoice: {
        invoiceNumber: {
            type: String,
            unique: true,
            sparse: true,
            index: true
        },
        invoiceDate: Date,
        dueDate: Date,
        paidDate: Date,
        invoiceUrl: String,
        invoicePdf: String,
        remindersSent: [{
            sentAt: Date,
            type: {
                type: String,
                enum: ['payment_due', 'overdue', 'final_notice']
            }
        }],
        notes: String
    },

    // ==================== Tax & Compliance ====================
    tax: {
        taxRate: {
            type: Number,
            min: 0,
            max: 100
        },
        taxAmount: {
            type: Number,
            min: 0
        },
        taxType: {
            type: String,
            enum: ['vat', 'gst', 'sales_tax', 'service_tax', 'none']
        },
        taxId: String,
        taxExempt: {
            type: Boolean,
            default: false
        },
        taxExemptionReason: String,
        jurisdiction: String
    },

    // ==================== Billing Address ====================
    billingAddress: {
        name: String,
        company: String,
        line1: String,
        line2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String,
        email: String,
        phone: String
    },

    // ==================== Risk & Fraud ====================
    risk: {
        score: {
            type: Number,
            min: 0,
            max: 100
        },
        level: {
            type: String,
            enum: ['normal', 'elevated', 'highest']
        },
        outcome: {
            type: String,
            enum: ['approved', 'manual_review', 'blocked']
        },
        flagged: {
            type: Boolean,
            default: false
        },
        flagReason: [String],
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewedAt: Date,
        reviewNotes: String
    },

    // ==================== Reconciliation ====================
    reconciliation: {
        reconciled: {
            type: Boolean,
            default: false
        },
        reconciledAt: Date,
        reconciledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        batchId: String,
        discrepancies: [{
            type: String,
            description: String,
            resolvedAt: Date
        }]
    },

    // ==================== Notifications ====================
    notifications: {
        receiptSent: {
            type: Boolean,
            default: false
        },
        receiptSentAt: Date,
        confirmationSent: {
            type: Boolean,
            default: false
        },
        confirmationSentAt: Date,
        failureNotificationSent: {
            type: Boolean,
            default: false
        }
    },

    // ==================== Metadata ====================
    metadata: {
        source: {
            type: String,
            enum: ['web', 'mobile', 'api', 'admin', 'import', 'recurring']
        },
        ipAddress: String,
        userAgent: String,
        deviceId: String,
        sessionId: String,
        referrer: String,
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
    }
};

const billingSchema = new Schema(billingSchemaDefinition, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ==================== Indexes ====================
billingSchema.index({ tenantId: 1, transactionId: 1 }, { unique: true });
billingSchema.index({ tenantId: 1, clientId: 1 });
billingSchema.index({ tenantId: 1, consultantId: 1 });
billingSchema.index({ tenantId: 1, consultationId: 1 });
billingSchema.index({ tenantId: 1, 'status.current': 1 });
billingSchema.index({ tenantId: 1, 'dates.initiated': -1 });
billingSchema.index({ 'stripe.paymentIntentId': 1 }, { sparse: true });
billingSchema.index({ 'stripe.chargeId': 1 }, { sparse: true });
billingSchema.index({ 'stripe.customerId': 1 }, { sparse: true });
billingSchema.index({ 'invoice.invoiceNumber': 1 }, { sparse: true });
billingSchema.index({ 'details.type': 1 });
billingSchema.index({ 'consultantPayout.status': 1, 'consultantPayout.scheduledDate': 1 });

// ==================== Virtuals ====================
billingSchema.virtual('isSuccessful').get(function() {
    return this.status.current === 'succeeded';
});

billingSchema.virtual('isPending').get(function() {
    return this.status.current === 'pending' || this.status.current === 'processing';
});

billingSchema.virtual('isFailed').get(function() {
    return this.status.current === 'failed';
});

billingSchema.virtual('isRefundable').get(function() {
    return this.status.current === 'succeeded' && !this.refund.isRefunded;
});

billingSchema.virtual('platformRevenue').get(function() {
    return this.amount.platformFee + this.amount.processingFee;
});

billingSchema.virtual('consultantEarnings').get(function() {
    return this.amount.net - this.amount.platformFee - this.amount.processingFee;
});

billingSchema.virtual('totalFees').get(function() {
    return this.amount.platformFee + this.amount.processingFee + this.amount.tax;
});

billingSchema.virtual('isOverdue').get(function() {
    if (!this.dates.dueDate) return false;
    return this.status.current === 'pending' && this.dates.dueDate < new Date();
});

// ==================== Pre-Save Middleware ====================
billingSchema.pre('save', async function(next) {
    try {
        // Calculate net amount
        if (this.isModified('amount')) {
            this.amount.net = this.amount.gross
                - this.amount.discount
                + this.amount.tax
                + this.amount.processingFee;
        }

        // Update status history
        if (this.isModified('status.current') && this.status.current !== this._original?.status?.current) {
            this.status.history.push({
                status: this.status.current,
                changedAt: new Date(),
                changedBy: this.metadata?.updatedBy
            });

            // Update relevant dates
            if (this.status.current === 'succeeded') {
                this.dates.completed = new Date();
            } else if (this.status.current === 'failed') {
                this.dates.failed = new Date();
            } else if (this.status.current === 'refunded') {
                this.dates.refunded = new Date();
            }
        }

        // Generate invoice number if not exists
        if (!this.invoice.invoiceNumber && this.status.current === 'succeeded') {
            this.invoice.invoiceNumber = await this.constructor.generateInvoiceNumber(this.tenantId);
            this.invoice.invoiceDate = new Date();
        }

        next();
    } catch (error) {
        next(error);
    }
});

// ==================== Instance Methods ====================
billingSchema.methods.markAsSucceeded = async function(paymentDetails = {}) {
    this.status.current = 'succeeded';
    this.dates.completed = new Date();

    if (paymentDetails.stripePaymentIntentId) {
        this.stripe.paymentIntentId = paymentDetails.stripePaymentIntentId;
    }
    if (paymentDetails.stripeChargeId) {
        this.stripe.chargeId = paymentDetails.stripeChargeId;
    }
    if (paymentDetails.receiptUrl) {
        this.stripe.receiptUrl = paymentDetails.receiptUrl;
    }

    return this.save();
};

billingSchema.methods.markAsFailed = async function(reason, errorDetails = {}) {
    this.status.current = 'failed';
    this.dates.failed = new Date();
    this.status.failureReason = {
        code: errorDetails.code,
        message: reason,
        declineCode: errorDetails.declineCode,
        networkStatus: errorDetails.networkStatus
    };

    return this.save();
};

billingSchema.methods.processRefund = async function(refundAmount, reason, userId) {
    // Validate refund amount
    const maxRefund = this.amount.net - (this.refund.partialRefunds?.reduce((sum, r) => sum + r.amount, 0) || 0);

    if (refundAmount > maxRefund) {
        throw new Error(`Refund amount exceeds available refund (max: ${maxRefund})`);
    }

    const isFullRefund = refundAmount === maxRefund;

    if (isFullRefund) {
        this.status.current = 'refunded';
        this.refund.isRefunded = true;
        this.refund.refundAmount = refundAmount;
        this.refund.refundReason = reason;
        this.refund.refundedAt = new Date();
        this.refund.refundedBy = userId;
        this.dates.refunded = new Date();
    } else {
        this.status.current = 'partially_refunded';

        if (!this.refund.partialRefunds) {
            this.refund.partialRefunds = [];
        }

        this.refund.partialRefunds.push({
            amount: refundAmount,
            reason,
            refundedAt: new Date(),
            refundedBy: userId
        });
    }

    return this.save();
};

billingSchema.methods.scheduleConsultantPayout = async function(payoutDate, payoutMethod = 'stripe_connect') {
    // Calculate consultant earnings (net minus platform fees)
    const earnings = this.consultantEarnings;

    this.consultantPayout = {
        amount: earnings,
        status: 'scheduled',
        scheduledDate: payoutDate,
        payoutMethod
    };

    return this.save();
};

billingSchema.methods.markPayoutComplete = async function(transferId) {
    this.consultantPayout.status = 'paid';
    this.consultantPayout.paidDate = new Date();
    this.consultantPayout.stripeTransferId = transferId;

    return this.save();
};

billingSchema.methods.flagForReview = async function(reason, userId) {
    this.risk.flagged = true;
    this.risk.flagReason = this.risk.flagReason || [];
    this.risk.flagReason.push(reason);
    this.risk.reviewedBy = userId;
    this.risk.reviewedAt = new Date();

    return this.save();
};

// ==================== Static Methods ====================
billingSchema.statics.generateTransactionId = async function(tenantId) {
    const count = await this.countDocuments({ tenantId });
    const timestamp = Date.now().toString().slice(-6);
    return `TXN-${timestamp}-${(count + 1).toString().padStart(4, '0')}`;
};

billingSchema.statics.generateInvoiceNumber = async function(tenantId) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

    const count = await this.countDocuments({
        tenantId,
        'invoice.invoiceNumber': new RegExp(`^INV-${year}${month}-`)
    });

    return `INV-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
};

billingSchema.statics.findByClient = function(tenantId, clientId, options = {}) {
    const query = {
        tenantId,
        clientId,
        'status.isDeleted': false
    };

    if (options.status) {
        query['status.current'] = options.status;
    }

    if (options.startDate || options.endDate) {
        query['dates.initiated'] = {};
        if (options.startDate) query['dates.initiated'].$gte = new Date(options.startDate);
        if (options.endDate) query['dates.initiated'].$lte = new Date(options.endDate);
    }

    return this.find(query)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode')
        .populate('consultationId', 'consultationId details.title')
        .sort({ 'dates.initiated': -1 })
        .limit(options.limit || 100);
};

billingSchema.statics.findByConsultant = function(tenantId, consultantId, options = {}) {
    const query = {
        tenantId,
        consultantId,
        'status.isDeleted': false,
        'status.current': 'succeeded'
    };

    if (options.payoutStatus) {
        query['consultantPayout.status'] = options.payoutStatus;
    }

    return this.find(query)
        .populate('clientId', 'companyName clientCode')
        .populate('consultationId', 'consultationId details.title')
        .sort({ 'dates.completed': -1 })
        .limit(options.limit || 100);
};

billingSchema.statics.getRevenueSummary = async function(tenantId, startDate, endDate) {
    const match = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        'status.current': 'succeeded',
        'status.isDeleted': false
    };

    if (startDate || endDate) {
        match['dates.completed'] = {};
        if (startDate) match['dates.completed'].$gte = startDate;
        if (endDate) match['dates.completed'].$lte = endDate;
    }

    const summary = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                grossRevenue: { $sum: '$amount.gross' },
                netRevenue: { $sum: '$amount.net' },
                platformFees: { $sum: '$amount.platformFee' },
                processingFees: { $sum: '$amount.processingFee' },
                taxCollected: { $sum: '$amount.tax' },
                refundedAmount: {
                    $sum: {
                        $cond: [{ $eq: ['$status.current', 'refunded'] }, '$refund.refundAmount', 0]
                    }
                },
                consultantPayouts: { $sum: '$consultantPayout.amount' }
            }
        }
    ]);

    return summary[0] || {
        totalTransactions: 0,
        grossRevenue: 0,
        netRevenue: 0,
        platformFees: 0,
        processingFees: 0,
        taxCollected: 0,
        refundedAmount: 0,
        consultantPayouts: 0
    };
};

billingSchema.statics.getPendingPayouts = async function(tenantId, consultantId = null) {
    const match = {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        'consultantPayout.status': { $in: ['pending', 'scheduled'] },
        'status.current': 'succeeded',
        'status.isDeleted': false
    };

    if (consultantId) {
        match.consultantId = new mongoose.Types.ObjectId(consultantId);
    }

    return this.find(match)
        .populate('consultantId', 'profile.firstName profile.lastName consultantCode')
        .populate('consultationId', 'consultationId details.title')
        .sort({ 'consultantPayout.scheduledDate': 1 });
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
    schema: billingSchema,
    modelName: 'Billing',
    createModel: function(connection) {
        if (connection) {
            return connection.model('Billing', billingSchema);
        }
        return mongoose.model('Billing', billingSchema);
    }
};

module.exports.Billing = mongoose.model('Billing', billingSchema);
module.exports.billingSchema = billingSchema;
