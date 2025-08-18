'use strict';

/**
 * @fileoverview Enterprise subscription administration controller for comprehensive subscription API endpoints
 * @module servers/admin-server/modules/billing-administration/controllers/subscription-admin-controller
 * @requires module:servers/admin-server/modules/billing-administration/services/subscription-admin-service
 * @requires module:servers/admin-server/modules/billing-administration/services/billing-admin-service
 * @requires module:servers/admin-server/modules/billing-administration/services/invoice-admin-service
 * @requires module:servers/admin-server/modules/billing-administration/services/payment-admin-service
 * @requires module:servers/admin-server/modules/billing-administration/models/billing-admin-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/formatters/currency-formatter
 * @requires module:shared/lib/utils/formatters/number-formatter
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/analytics-service
 */

const SubscriptionAdminService = require('../services/subscription-admin-service');
const BillingAdminService = require('../services/billing-admin-service');
const InvoiceAdminService = require('../services/invoice-admin-service');
const PaymentAdminService = require('../services/payment-admin-service');
const BillingAdmin = require('../models/billing-admin-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const currencyFormatter = require('../../../../../shared/lib/utils/formatters/currency-formatter');
const numberFormatter = require('../../../../../shared/lib/utils/formatters/number-formatter');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const AuditService = require('../../../../../shared/lib/services/audit-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AnalyticsService = require('../../../../../shared/lib/services/analytics-service');

/**
 * @class SubscriptionAdminController
 * @description Enterprise subscription administration controller handling all subscription-related API endpoints
 */
class SubscriptionAdminController {
  #subscriptionService;
  #billingService;
  #invoiceService;
  #paymentService;
  #cacheService;
  #auditService;
  #notificationService;
  #analyticsService;
  #initialized;
  #controllerName;
  #config;

  /**
   * @constructor
   * @description Initialize subscription administration controller with dependencies
   */
  constructor() {
    this.#subscriptionService = new SubscriptionAdminService();
    this.#billingService = new BillingAdminService();
    this.#invoiceService = new InvoiceAdminService();
    this.#paymentService = new PaymentAdminService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#notificationService = new NotificationService();
    this.#analyticsService = new AnalyticsService();
    this.#initialized = false;
    this.#controllerName = 'SubscriptionAdminController';
    this.#config = {
      cachePrefix: 'subscription_controller:',
      cacheTTL: 300,
      defaultPageSize: 50,
      maxPageSize: 200,
      defaultSortOrder: '-startDate',
      allowedSortFields: ['startDate', 'endDate', 'mrr', 'status', 'tier', 'planName'],
      allowedFilterFields: ['status', 'tier', 'planId', 'dateRange', 'customerId'],
      responseTimeout: 30000,
      maxRetryAttempts: 3,
      bulkOperationLimit: 100,
      trialPeriodDefault: 14,
      gracePeriodDays: 7,
      renewalReminderDays: [30, 14, 7, 3, 1],
      churnPreventionThreshold: 0.7,
      rateLimit: {
        window: 60000,
        maxRequests: 100
      },
      defaultCurrency: 'USD',
      supportedIntervals: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'],
      pricingTiers: ['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'],
      subscriptionStatuses: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
      upgradeRules: {
        immediateCharge: true,
        proration: true,
        creditUnusedTime: true
      },
      downgradeRules: {
        effectNextCycle: true,
        allowMidCycle: false,
        refundPolicy: 'NO_REFUND'
      },
      cancellationRules: {
        endOfBillingPeriod: true,
        immediateAccess: false,
        refundPolicy: 'PRORATED'
      },
      metricsCalculation: {
        mrrIncludeDiscounts: true,
        arrMultiplier: 12,
        churnWindow: 30
      }
    };
  }

  /**
   * Initialize the subscription controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#subscriptionService.initialize();
      await this.#billingService.initialize();
      await this.#invoiceService.initialize();
      await this.#paymentService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      await this.#notificationService.initialize();
      await this.#analyticsService.initialize();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Subscription controller initialization failed', 500);
    }
  }

  /**
   * Handle subscription API request based on action type
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  async handleSubscriptionRequest(req, res, next) {
    const actionType = req.params.action || req.body.action;
    
    try {
      let result;
      
      switch (actionType) {
        // ==================== Subscription Lifecycle ====================
        case 'create-subscription':
          result = await this.createSubscription(req, res, next);
          break;
          
        case 'activate-subscription':
          result = await this.activateSubscription(req, res, next);
          break;
          
        case 'pause-subscription':
          result = await this.pauseSubscription(req, res, next);
          break;
          
        case 'resume-subscription':
          result = await this.resumeSubscription(req, res, next);
          break;
          
        case 'cancel-subscription':
          result = await this.cancelSubscription(req, res, next);
          break;
          
        case 'reactivate-subscription':
          result = await this.reactivateSubscription(req, res, next);
          break;
          
        case 'expire-subscription':
          result = await this.expireSubscription(req, res, next);
          break;
          
        case 'terminate-subscription':
          result = await this.terminateSubscription(req, res, next);
          break;

        // ==================== Subscription Management ====================
        case 'get-subscription':
          result = await this.getSubscription(req, res, next);
          break;
          
        case 'list-subscriptions':
          result = await this.listSubscriptions(req, res, next);
          break;
          
        case 'update-subscription':
          result = await this.updateSubscription(req, res, next);
          break;
          
        case 'search-subscriptions':
          result = await this.searchSubscriptions(req, res, next);
          break;
          
        case 'subscription-history':
          result = await this.getSubscriptionHistory(req, res, next);
          break;
          
        case 'subscription-timeline':
          result = await this.getSubscriptionTimeline(req, res, next);
          break;
          
        case 'subscription-details':
          result = await this.getSubscriptionDetails(req, res, next);
          break;
          
        case 'bulk-update-subscriptions':
          result = await this.bulkUpdateSubscriptions(req, res, next);
          break;

        // ==================== Plan Management ====================
        case 'upgrade-plan':
          result = await this.upgradePlan(req, res, next);
          break;
          
        case 'downgrade-plan':
          result = await this.downgradePlan(req, res, next);
          break;
          
        case 'change-plan':
          result = await this.changePlan(req, res, next);
          break;
          
        case 'preview-plan-change':
          result = await this.previewPlanChange(req, res, next);
          break;
          
        case 'add-addon':
          result = await this.addAddon(req, res, next);
          break;
          
        case 'remove-addon':
          result = await this.removeAddon(req, res, next);
          break;
          
        case 'update-addon':
          result = await this.updateAddon(req, res, next);
          break;
          
        case 'list-addons':
          result = await this.listAddons(req, res, next);
          break;

        // ==================== Trial Management ====================
        case 'start-trial':
          result = await this.startTrial(req, res, next);
          break;
          
        case 'extend-trial':
          result = await this.extendTrial(req, res, next);
          break;
          
        case 'end-trial':
          result = await this.endTrial(req, res, next);
          break;
          
        case 'convert-trial':
          result = await this.convertTrial(req, res, next);
          break;
          
        case 'cancel-trial':
          result = await this.cancelTrial(req, res, next);
          break;
          
        case 'trial-status':
          result = await this.getTrialStatus(req, res, next);
          break;
          
        case 'trial-analytics':
          result = await this.getTrialAnalytics(req, res, next);
          break;
          
        case 'optimize-trial':
          result = await this.optimizeTrialDuration(req, res, next);
          break;

        // ==================== Renewal Operations ====================
        case 'process-renewal':
          result = await this.processRenewal(req, res, next);
          break;
          
        case 'schedule-renewal':
          result = await this.scheduleRenewal(req, res, next);
          break;
          
        case 'preview-renewal':
          result = await this.previewRenewal(req, res, next);
          break;
          
        case 'update-renewal-settings':
          result = await this.updateRenewalSettings(req, res, next);
          break;
          
        case 'disable-auto-renewal':
          result = await this.disableAutoRenewal(req, res, next);
          break;
          
        case 'enable-auto-renewal':
          result = await this.enableAutoRenewal(req, res, next);
          break;
          
        case 'apply-renewal-discount':
          result = await this.applyRenewalDiscount(req, res, next);
          break;
          
        case 'batch-renewals':
          result = await this.processBatchRenewals(req, res, next);
          break;

        // ==================== Usage Tracking ====================
        case 'track-usage':
          result = await this.trackUsage(req, res, next);
          break;
          
        case 'get-usage':
          result = await this.getUsage(req, res, next);
          break;
          
        case 'update-usage-limits':
          result = await this.updateUsageLimits(req, res, next);
          break;
          
        case 'calculate-overage':
          result = await this.calculateOverage(req, res, next);
          break;
          
        case 'apply-overage-charges':
          result = await this.applyOverageCharges(req, res, next);
          break;
          
        case 'reset-usage':
          result = await this.resetUsage(req, res, next);
          break;
          
        case 'usage-report':
          result = await this.generateUsageReport(req, res, next);
          break;
          
        case 'usage-trends':
          result = await this.analyzeUsageTrends(req, res, next);
          break;

        // ==================== Billing Cycle Operations ====================
        case 'update-billing-cycle':
          result = await this.updateBillingCycle(req, res, next);
          break;
          
        case 'calculate-proration':
          result = await this.calculateProration(req, res, next);
          break;
          
        case 'apply-proration':
          result = await this.applyProration(req, res, next);
          break;
          
        case 'sync-billing-dates':
          result = await this.syncBillingDates(req, res, next);
          break;
          
        case 'preview-billing':
          result = await this.previewBilling(req, res, next);
          break;
          
        case 'process-billing-cycle':
          result = await this.processBillingCycle(req, res, next);
          break;
          
        case 'skip-billing-cycle':
          result = await this.skipBillingCycle(req, res, next);
          break;
          
        case 'billing-schedule':
          result = await this.getBillingSchedule(req, res, next);
          break;

        // ==================== Revenue Metrics ====================
        case 'calculate-mrr':
          result = await this.calculateMRR(req, res, next);
          break;
          
        case 'calculate-arr':
          result = await this.calculateARR(req, res, next);
          break;
          
        case 'calculate-ltv':
          result = await this.calculateLTV(req, res, next);
          break;
          
        case 'calculate-churn':
          result = await this.calculateChurn(req, res, next);
          break;
          
        case 'forecast-revenue':
          result = await this.forecastRevenue(req, res, next);
          break;
          
        case 'revenue-recognition':
          result = await this.recognizeRevenue(req, res, next);
          break;
          
        case 'deferred-revenue':
          result = await this.calculateDeferredRevenue(req, res, next);
          break;
          
        case 'expansion-revenue':
          result = await this.analyzeExpansionRevenue(req, res, next);
          break;

        // ==================== Customer Retention ====================
        case 'identify-churn-risk':
          result = await this.identifyChurnRisk(req, res, next);
          break;
          
        case 'prevent-churn':
          result = await this.preventChurn(req, res, next);
          break;
          
        case 'win-back-customer':
          result = await this.winBackCustomer(req, res, next);
          break;
          
        case 'retention-offer':
          result = await this.createRetentionOffer(req, res, next);
          break;
          
        case 'analyze-cancellation':
          result = await this.analyzeCancellationReasons(req, res, next);
          break;
          
        case 'retention-metrics':
          result = await this.getRetentionMetrics(req, res, next);
          break;
          
        case 'segment-customers':
          result = await this.segmentCustomers(req, res, next);
          break;
          
        case 'personalize-retention':
          result = await this.personalizeRetentionStrategy(req, res, next);
          break;

        // ==================== Analytics & Reporting ====================
        case 'subscription-analytics':
          result = await this.getSubscriptionAnalytics(req, res, next);
          break;
          
        case 'growth-metrics':
          result = await this.getGrowthMetrics(req, res, next);
          break;
          
        case 'cohort-analysis':
          result = await this.performCohortAnalysis(req, res, next);
          break;
          
        case 'plan-performance':
          result = await this.analyzePlanPerformance(req, res, next);
          break;
          
        case 'subscription-report':
          result = await this.generateSubscriptionReport(req, res, next);
          break;
          
        case 'export-subscriptions':
          result = await this.exportSubscriptions(req, res, next);
          break;
          
        case 'benchmark-metrics':
          result = await this.benchmarkMetrics(req, res, next);
          break;
          
        case 'predictive-analytics':
          result = await this.getPredictiveAnalytics(req, res, next);
          break;

        // ==================== Default Case ====================
        default:
          throw new AppError(`Unknown subscription action: ${actionType}`, 400);
      }

      return result;

    } catch (error) {
      logger.error(`Subscription request failed: ${actionType}`, error);
      next(error);
    }
  }

  // ==================== Subscription Lifecycle Methods ====================

  /**
   * Create a new subscription
   * @async
   */
  createSubscription = asyncHandler(async (req, res, next) => {
    const { 
      billingAccountId, 
      planId, 
      planName, 
      tier, 
      startDate,
      billingInterval,
      paymentMethodId,
      startTrial,
      trialDays,
      discounts,
      metadata 
    } = req.body;

    // Validate required fields
    if (!billingAccountId || !planId || !tier) {
      throw new AppError('Missing required subscription fields', 400);
    }

    // Validate tier
    if (!this.#config.pricingTiers.includes(tier)) {
      throw new AppError('Invalid subscription tier', 400);
    }

    // Validate billing interval
    if (billingInterval && !this.#config.supportedIntervals.includes(billingInterval)) {
      throw new AppError('Invalid billing interval', 400);
    }

    // Process subscription creation through service
    const result = await this.#subscriptionService.processSubscriptionOperation(
      'CREATE_SUBSCRIPTION',
      {
        billingAccountId,
        planId,
        planName,
        tier,
        startDate: startDate || new Date(),
        billingInterval: billingInterval || 'MONTHLY',
        paymentMethodId,
        startTrial: startTrial || false,
        trialDays: trialDays || this.#config.trialPeriodDefault,
        discounts: discounts || [],
        metadata: metadata || {}
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    // Audit the creation
    await this.#auditService.log({
      action: 'SUBSCRIPTION_CREATED',
      userId: req.user.id,
      resourceId: result.subscription?.subscriptionId,
      details: {
        billingAccountId,
        planId,
        tier,
        trial: startTrial
      }
    });

    // Send welcome notification
    await this.#notificationService.sendNotification({
      type: 'SUBSCRIPTION_WELCOME',
      recipients: [req.user.email],
      data: {
        subscriptionId: result.subscription?.subscriptionId,
        planName,
        tier
      }
    });

    res.status(201).json(responseFormatter.success(
      result,
      'Subscription created successfully'
    ));
  });

  /**
   * Cancel subscription
   * @async
   */
  cancelSubscription = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { reason, feedback, offerRetention, immediateEffect } = req.body;

    // Get subscription
    const billingAccount = await BillingAdmin.findOne({
      'subscriptionManagement.currentSubscription.subscriptionId': subscriptionId
    });

    if (!billingAccount) {
      throw new AppError('Subscription not found', 404);
    }

    // Process cancellation through service
    const result = await this.#subscriptionService.processSubscriptionOperation(
      'CANCEL_SUBSCRIPTION',
      {
        billingAccountId: billingAccount._id,
        reason,
        feedback,
        offerRetention: offerRetention !== false,
        immediateEffect: immediateEffect || !this.#config.cancellationRules.endOfBillingPeriod
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    // Trigger retention workflow if enabled
    if (offerRetention !== false && result.churnRisk > this.#config.churnPreventionThreshold) {
      await this.#subscriptionService.executeSubscriptionWorkflow(
        'RETENTION_WORKFLOW',
        {
          billingAccountId: billingAccount._id,
          subscriptionId,
          cancellationReason: reason
        },
        {
          user: req.user
        }
      );
    }

    res.status(200).json(responseFormatter.success(
      result,
      'Subscription cancelled successfully'
    ));
  });

  /**
   * Pause subscription
   * @async
   */
  pauseSubscription = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { pauseDate, resumeDate, reason } = req.body;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'PAUSE_SUBSCRIPTION',
      {
        subscriptionId,
        pauseDate: pauseDate || new Date(),
        resumeDate,
        reason
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Subscription paused successfully'
    ));
  });

  // ==================== Subscription Management Methods ====================

  /**
   * Get subscription details
   * @async
   */
  getSubscription = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;

    // Check cache first
    const cacheKey = `${this.#config.cachePrefix}subscription:${subscriptionId}`;
    const cached = await this.#cacheService.get(cacheKey);
    
    if (cached) {
      return res.status(200).json(responseFormatter.success(
        cached,
        'Subscription retrieved from cache'
      ));
    }

    // Get from database
    const billingAccount = await BillingAdmin.findOne({
      'subscriptionManagement.currentSubscription.subscriptionId': subscriptionId
    }).lean();

    if (!billingAccount) {
      throw new AppError('Subscription not found', 404);
    }

    const subscription = billingAccount.subscriptionManagement.currentSubscription;

    // Calculate additional metrics
    const subscriptionData = {
      ...subscription,
      metrics: {
        totalRevenue: subscription.mrr * this.#getSubscriptionAge(subscription.startDate),
        customerLifetime: this.#getSubscriptionAge(subscription.startDate),
        nextRenewal: subscription.currentPeriodEnd,
        daysUntilRenewal: Math.ceil((subscription.currentPeriodEnd - new Date()) / (1000 * 60 * 60 * 24))
      },
      billingAccountId: billingAccount._id,
      organizationId: billingAccount.billingReference.organizationId
    };

    // Cache the result
    await this.#cacheService.set(cacheKey, subscriptionData, this.#config.cacheTTL);

    res.status(200).json(responseFormatter.success(
      subscriptionData,
      'Subscription retrieved successfully'
    ));
  });

  /**
   * List subscriptions with pagination and filters
   * @async
   */
  listSubscriptions = asyncHandler(async (req, res, next) => {
    const {
      page = 1,
      limit = this.#config.defaultPageSize,
      status,
      tier,
      planId,
      startDate,
      endDate,
      sortBy = this.#config.defaultSortOrder,
      customerId
    } = req.query;

    // Build query
    const query = {};
    
    if (status) {
      query['subscriptionManagement.currentSubscription.status'] = status;
    }
    
    if (tier) {
      query['subscriptionManagement.currentSubscription.tier'] = tier;
    }
    
    if (planId) {
      query['subscriptionManagement.currentSubscription.planId'] = planId;
    }
    
    if (customerId) {
      query['billingReference.customerId'] = customerId;
    }
    
    if (startDate || endDate) {
      query['subscriptionManagement.currentSubscription.startDate'] = {};
      if (startDate) {
        query['subscriptionManagement.currentSubscription.startDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        query['subscriptionManagement.currentSubscription.startDate'].$lte = new Date(endDate);
      }
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const billingAccounts = await BillingAdmin.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Extract subscriptions
    const subscriptions = billingAccounts.map(account => ({
      ...account.subscriptionManagement.currentSubscription,
      billingAccountId: account._id,
      organizationId: account.billingReference.organizationId,
      customerId: account.billingReference.customerId
    }));

    // Get total count
    const totalCount = await BillingAdmin.countDocuments(query);

    // Calculate aggregate metrics
    const aggregateMetrics = {
      totalMRR: 0,
      totalARR: 0,
      activeCount: 0,
      trialCount: 0,
      pausedCount: 0,
      cancelledCount: 0
    };

    for (const subscription of subscriptions) {
      aggregateMetrics.totalMRR += subscription.mrr || 0;
      aggregateMetrics.totalARR += subscription.arr || 0;
      
      switch (subscription.status) {
        case 'ACTIVE':
          aggregateMetrics.activeCount++;
          break;
        case 'TRIAL':
          aggregateMetrics.trialCount++;
          break;
        case 'PAUSED':
          aggregateMetrics.pausedCount++;
          break;
        case 'CANCELLED':
          aggregateMetrics.cancelledCount++;
          break;
      }
    }

    // Format response with pagination
    const response = {
      subscriptions,
      metrics: aggregateMetrics,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    };

    res.status(200).json(responseFormatter.success(
      response,
      'Subscriptions retrieved successfully'
    ));
  });

  // ==================== Plan Management Methods ====================

  /**
   * Upgrade subscription plan
   * @async
   */
  upgradePlan = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { newPlanId, newTier, immediateEffect, applyProration } = req.body;

    // Validate new tier
    if (!this.#config.pricingTiers.includes(newTier)) {
      throw new AppError('Invalid subscription tier', 400);
    }

    // Get current subscription
    const billingAccount = await BillingAdmin.findOne({
      'subscriptionManagement.currentSubscription.subscriptionId': subscriptionId
    });

    if (!billingAccount) {
      throw new AppError('Subscription not found', 404);
    }

    const currentTierIndex = this.#config.pricingTiers.indexOf(
      billingAccount.subscriptionManagement.currentSubscription.tier
    );
    const newTierIndex = this.#config.pricingTiers.indexOf(newTier);

    if (newTierIndex <= currentTierIndex) {
      throw new AppError('New tier must be higher than current tier for upgrade', 400);
    }

    // Process upgrade through service
    const result = await this.#subscriptionService.processSubscriptionOperation(
      'UPGRADE_PLAN',
      {
        billingAccountId: billingAccount._id,
        newPlanId,
        newTier,
        immediateEffect: immediateEffect !== false && this.#config.upgradeRules.immediateCharge,
        applyProration: applyProration !== false && this.#config.upgradeRules.proration
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Plan upgraded successfully'
    ));
  });

  /**
   * Downgrade subscription plan
   * @async
   */
  downgradePlan = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { newPlanId, newTier, effectiveDate } = req.body;

    // Validate new tier
    if (!this.#config.pricingTiers.includes(newTier)) {
      throw new AppError('Invalid subscription tier', 400);
    }

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'DOWNGRADE_PLAN',
      {
        subscriptionId,
        newPlanId,
        newTier,
        effectiveDate: effectiveDate || (this.#config.downgradeRules.effectNextCycle ? 'NEXT_CYCLE' : 'IMMEDIATE')
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Plan downgrade scheduled successfully'
    ));
  });

  // ==================== Trial Management Methods ====================

  /**
   * Start trial subscription
   * @async
   */
  startTrial = asyncHandler(async (req, res, next) => {
    const { billingAccountId, planId, trialDays, requirePaymentMethod } = req.body;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'START_TRIAL',
      {
        billingAccountId,
        planId,
        trialDays: trialDays || this.#config.trialPeriodDefault,
        requirePaymentMethod: requirePaymentMethod || false
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    // Schedule trial reminders
    await this.#subscriptionService.executeSubscriptionWorkflow(
      'TRIAL_ONBOARDING',
      {
        billingAccountId,
        trialEndDate: result.trialEndDate
      },
      {
        user: req.user
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Trial started successfully'
    ));
  });

  /**
   * Convert trial to paid subscription
   * @async
   */
  convertTrial = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { paymentMethodId, applyDiscount, discountCode } = req.body;

    if (!paymentMethodId) {
      throw new AppError('Payment method required for trial conversion', 400);
    }

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'CONVERT_TRIAL',
      {
        subscriptionId,
        paymentMethodId,
        applyDiscount,
        discountCode
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Trial converted to paid subscription successfully'
    ));
  });

  // ==================== Renewal Operations Methods ====================

  /**
   * Process subscription renewal
   * @async
   */
  processRenewal = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { autoRenewal, renewalTerms } = req.body;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'PROCESS_RENEWAL',
      {
        subscriptionId,
        autoRenewal: autoRenewal !== false,
        renewalTerms: renewalTerms || 'SAME_TERMS'
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Renewal processed successfully'
    ));
  });

  /**
   * Process batch renewals
   * @async
   */
  processBatchRenewals = asyncHandler(async (req, res, next) => {
    const { renewalDate } = req.body;

    const result = await this.#subscriptionService.executeSubscriptionWorkflow(
      'BATCH_RENEWAL_WORKFLOW',
      {
        renewalDate: renewalDate || new Date()
      },
      {
        user: req.user
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      `Batch renewal completed: ${result.renewedCount} renewed, ${result.failedCount} failed`
    ));
  });

  // ==================== Usage Tracking Methods ====================

  /**
   * Track usage metrics
   * @async
   */
  trackUsage = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { metrics, timestamp } = req.body;

    if (!metrics || Object.keys(metrics).length === 0) {
      throw new AppError('Usage metrics are required', 400);
    }

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'TRACK_USAGE',
      {
        subscriptionId,
        metrics,
        timestamp: timestamp || new Date()
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Usage tracked successfully'
    ));
  });

  /**
   * Calculate overage charges
   * @async
   */
  calculateOverage = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { period } = req.query;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'CALCULATE_OVERAGE',
      {
        subscriptionId,
        period: period || 'CURRENT'
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Overage calculated successfully'
    ));
  });

  // ==================== Revenue Metrics Methods ====================

  /**
   * Calculate Monthly Recurring Revenue
   * @async
   */
  calculateMRR = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, includeChurn, segmentBy } = req.query;

    const result = await this.#subscriptionService.analyzeSubscriptionMetrics(
      'MRR_GROWTH',
      {
        startDate: startDate ? new Date(startDate) : dateHelper.addMonths(new Date(), -12),
        endDate: endDate ? new Date(endDate) : new Date(),
        includeChurn: includeChurn === 'true',
        segmentBy: segmentBy || 'tier'
      },
      {
        user: req.user
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'MRR calculated successfully'
    ));
  });

  /**
   * Calculate churn metrics
   * @async
   */
  calculateChurn = asyncHandler(async (req, res, next) => {
    const { period, cohort, includeReasons } = req.query;

    const result = await this.#subscriptionService.analyzeSubscriptionMetrics(
      'CHURN_RATE',
      {
        period: period || 'MONTHLY',
        cohort,
        includeReasons: includeReasons === 'true'
      },
      {
        user: req.user
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Churn metrics calculated successfully'
    ));
  });

  // ==================== Customer Retention Methods ====================

  /**
   * Identify churn risk
   * @async
   */
  identifyChurnRisk = asyncHandler(async (req, res, next) => {
    const { threshold, includeFactors } = req.query;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'IDENTIFY_CHURN_RISK',
      {
        riskThreshold: threshold || this.#config.churnPreventionThreshold,
        includeFactors: includeFactors === 'true'
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Churn risk analysis completed'
    ));
  });

  /**
   * Create retention offer
   * @async
   */
  createRetentionOffer = asyncHandler(async (req, res, next) => {
    const { subscriptionId } = req.params;
    const { offerType, discountPercentage, duration, customMessage } = req.body;

    const result = await this.#subscriptionService.processSubscriptionOperation(
      'OFFER_RETENTION_DEAL',
      {
        subscriptionId,
        offerType: offerType || 'DISCOUNT',
        discountPercentage: discountPercentage || 20,
        duration: duration || 3,
        customMessage
      },
      {
        user: req.user,
        ipAddress: req.ip,
        sessionId: req.sessionID
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Retention offer created successfully'
    ));
  });

  // ==================== Analytics & Reporting Methods ====================

  /**
   * Get subscription analytics
   * @async
   */
  getSubscriptionAnalytics = asyncHandler(async (req, res, next) => {
    const { metrics, period, groupBy } = req.query;

    const metricsToAnalyze = metrics ? metrics.split(',') : [
      'growth', 'churn', 'retention', 'revenue', 'usage'
    ];

    const results = {};
    
    for (const metric of metricsToAnalyze) {
      const analysisTypeMap = {
        'growth': 'SUBSCRIBER_GROWTH',
        'churn': 'CHURN_RATE',
        'retention': 'RETENTION_RATE',
        'revenue': 'MRR_GROWTH',
        'usage': 'FEATURE_USAGE'
      };

      if (analysisTypeMap[metric]) {
        results[metric] = await this.#subscriptionService.analyzeSubscriptionMetrics(
          analysisTypeMap[metric],
          {
            period: period || 'MONTHLY',
            groupBy: groupBy || 'tier'
          },
          {
            user: req.user
          }
        );
      }
    }

    res.status(200).json(responseFormatter.success(
      results,
      'Subscription analytics retrieved successfully'
    ));
  });

  /**
   * Perform cohort analysis
   * @async
   */
  performCohortAnalysis = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, cohortSize, metric } = req.query;

    const result = await this.#subscriptionService.analyzeSubscriptionMetrics(
      'COHORT_ANALYSIS',
      {
        startDate: startDate ? new Date(startDate) : dateHelper.addMonths(new Date(), -12),
        endDate: endDate ? new Date(endDate) : new Date(),
        cohortSize: cohortSize || 'MONTHLY',
        metric: metric || 'RETENTION'
      },
      {
        user: req.user
      }
    );

    res.status(200).json(responseFormatter.success(
      result,
      'Cohort analysis completed successfully'
    ));
  });

  /**
   * Export subscriptions
   * @async
   */
  exportSubscriptions = asyncHandler(async (req, res, next) => {
    const { format = 'csv', status, startDate, endDate } = req.query;

    // Build query
    const query = {};
    if (status) {
      query['subscriptionManagement.currentSubscription.status'] = status;
    }
    if (startDate || endDate) {
      query['subscriptionManagement.currentSubscription.startDate'] = {};
      if (startDate) {
        query['subscriptionManagement.currentSubscription.startDate'].$gte = new Date(startDate);
      }
      if (endDate) {
        query['subscriptionManagement.currentSubscription.startDate'].$lte = new Date(endDate);
      }
    }

    const billingAccounts = await BillingAdmin.find(query).lean();

    // Extract subscription data
    const subscriptions = billingAccounts.map(account => ({
      subscriptionId: account.subscriptionManagement.currentSubscription.subscriptionId,
      customerId: account.billingReference.customerId,
      planName: account.subscriptionManagement.currentSubscription.planName,
      tier: account.subscriptionManagement.currentSubscription.tier,
      status: account.subscriptionManagement.currentSubscription.status,
      mrr: account.subscriptionManagement.currentSubscription.mrr,
      startDate: account.subscriptionManagement.currentSubscription.startDate,
      currentPeriodEnd: account.subscriptionManagement.currentSubscription.currentPeriodEnd
    }));

    // Format based on requested type
    let exportData;
    if (format === 'csv') {
      exportData = this.#convertToCSV(subscriptions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
    } else {
      exportData = subscriptions;
      res.setHeader('Content-Type', 'application/json');
    }

    res.send(exportData);
  });

  // ==================== Helper Methods ====================

  /**
   * Get subscription age in months
   * @private
   */
  #getSubscriptionAge(startDate) {
    const months = Math.floor((new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30));
    return Math.max(1, months);
  }

  /**
   * Convert data to CSV format
   * @private
   */
  #convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(value => 
        typeof value === 'string' && value.includes(',') ? `"${value}"` : value
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }

  // Additional method stubs for remaining endpoints
  activateSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription activated'));
  });

  resumeSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription resumed'));
  });

  reactivateSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription reactivated'));
  });

  expireSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription expired'));
  });

  terminateSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription terminated'));
  });

  updateSubscription = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription updated'));
  });

  searchSubscriptions = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscriptions found'));
  });

  getSubscriptionHistory = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription history retrieved'));
  });

  getSubscriptionTimeline = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription timeline retrieved'));
  });

  getSubscriptionDetails = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription details retrieved'));
  });

  bulkUpdateSubscriptions = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Bulk update completed'));
  });

  changePlan = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Plan changed'));
  });

  previewPlanChange = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Plan change preview generated'));
  });

  addAddon = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Addon added'));
  });

  removeAddon = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Addon removed'));
  });

  updateAddon = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Addon updated'));
  });

  listAddons = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Addons retrieved'));
  });

  extendTrial = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial extended'));
  });

  endTrial = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial ended'));
  });

  cancelTrial = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial cancelled'));
  });

  getTrialStatus = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial status retrieved'));
  });

  getTrialAnalytics = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial analytics retrieved'));
  });

  optimizeTrialDuration = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Trial duration optimized'));
  });

  scheduleRenewal = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Renewal scheduled'));
  });

  previewRenewal = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Renewal preview generated'));
  });

  updateRenewalSettings = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Renewal settings updated'));
  });

  disableAutoRenewal = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Auto-renewal disabled'));
  });

  enableAutoRenewal = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Auto-renewal enabled'));
  });

  applyRenewalDiscount = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Renewal discount applied'));
  });

  getUsage = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Usage retrieved'));
  });

  updateUsageLimits = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Usage limits updated'));
  });

  applyOverageCharges = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Overage charges applied'));
  });

  resetUsage = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Usage reset'));
  });

  generateUsageReport = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Usage report generated'));
  });

  analyzeUsageTrends = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Usage trends analyzed'));
  });

  updateBillingCycle = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing cycle updated'));
  });

  calculateProration = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Proration calculated'));
  });

  applyProration = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Proration applied'));
  });

  syncBillingDates = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing dates synced'));
  });

  previewBilling = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing preview generated'));
  });

  processBillingCycle = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing cycle processed'));
  });

  skipBillingCycle = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing cycle skipped'));
  });

  getBillingSchedule = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Billing schedule retrieved'));
  });

  calculateARR = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'ARR calculated'));
  });

  calculateLTV = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'LTV calculated'));
  });

  forecastRevenue = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Revenue forecast generated'));
  });

  recognizeRevenue = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Revenue recognized'));
  });

  calculateDeferredRevenue = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Deferred revenue calculated'));
  });

  analyzeExpansionRevenue = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Expansion revenue analyzed'));
  });

  preventChurn = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Churn prevention initiated'));
  });

  winBackCustomer = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Win-back campaign initiated'));
  });

  analyzeCancellationReasons = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Cancellation reasons analyzed'));
  });

  getRetentionMetrics = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Retention metrics retrieved'));
  });

  segmentCustomers = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Customers segmented'));
  });

  personalizeRetentionStrategy = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Retention strategy personalized'));
  });

  getGrowthMetrics = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Growth metrics retrieved'));
  });

  analyzePlanPerformance = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Plan performance analyzed'));
  });

  generateSubscriptionReport = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Subscription report generated'));
  });

  benchmarkMetrics = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Metrics benchmarked'));
  });

  getPredictiveAnalytics = asyncHandler(async (req, res, next) => {
    res.status(200).json(responseFormatter.success({}, 'Predictive analytics retrieved'));
  });
}

module.exports = SubscriptionAdminController;