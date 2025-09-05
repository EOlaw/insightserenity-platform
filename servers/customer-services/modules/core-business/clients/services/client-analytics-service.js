'use strict';

/**
 * @fileoverview Enterprise client analytics service with comprehensive metrics, predictions, and reporting
 * @module servers/customer-services/modules/core-business/clients/services/client-analytics-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-contact-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-document-model
 * @requires module:servers/customer-services/modules/core-business/clients/models/client-note-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError } = require('../../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const ClientModel = require('../models/client-model');
const ClientContactModel = require('../models/client-contact-model');
const ClientDocumentModel = require('../models/client-document-model');
const ClientNoteModel = require('../models/client-note-model');
const ExcelJS = require('exceljs');
const moment = require('moment');
const _ = require('lodash');

/**
 * Client analytics service for performance tracking and insights generation
 * @class ClientAnalyticsService
 * @description Provides comprehensive analytics, metrics, predictions, and reporting for client performance
 */
class ClientAnalyticsService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {number}
     */
    #cacheTTL = 1800; // 30 minutes for analytics cache

    /**
     * @private
     * @type {Object}
     */
    #metricsDefinitions = {
        engagement: {
            weight: 0.25,
            factors: ['interactions', 'portalActivity', 'documentAccess', 'responseRate']
        },
        revenue: {
            weight: 0.30,
            factors: ['totalRevenue', 'recurringRevenue', 'growthRate', 'paymentTimeliness']
        },
        satisfaction: {
            weight: 0.20,
            factors: ['npsScore', 'csatScore', 'supportTickets', 'escalations']
        },
        retention: {
            weight: 0.25,
            factors: ['contractLength', 'renewalRate', 'expansionRevenue', 'churnRisk']
        }
    };

    /**
     * @private
     * @type {Object}
     */
    #predictiveModels = {
        churn: {
            threshold: 0.7,
            factors: ['healthScore', 'engagementTrend', 'supportTickets', 'paymentDelay']
        },
        growth: {
            threshold: 0.6,
            factors: ['revenueGrowth', 'projectCount', 'userAdoption', 'engagement']
        },
        upsell: {
            threshold: 0.65,
            factors: ['utilization', 'satisfaction', 'budgetAuthority', 'expansionHistory']
        }
    };

    /**
     * @private
     * @type {Object}
     */
    #benchmarks = {
        industry: new Map(),
        tier: new Map(),
        region: new Map()
    };

    /**
     * Creates an instance of ClientAnalyticsService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service and load benchmarks
     * @private
     */
    async #initializeService() {
        try {
            await this.#loadBenchmarks();
            logger.info('ClientAnalyticsService initialized successfully');
        } catch (error) {
            logger.error('Error initializing ClientAnalyticsService', { error: error.message });
        }
    }

    // ==================== Core Analytics ====================

    /**
     * Get comprehensive analytics for a client
     * @param {string} clientId - Client ID
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Comprehensive analytics data
     */
    async getClientAnalytics(clientId, options = {}) {
        const {
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            metrics = ['all'],
            comparisons = true,
            predictions = true
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('analytics', clientId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) return cached;

            // Fetch client data
            const client = await ClientModel.findById(clientId)
                .populate('projects.projectId')
                .populate('contracts.contractId');

            if (!client) {
                throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
            }

            // Build analytics object
            const analytics = {
                clientId,
                clientCode: client.clientCode,
                companyName: client.companyName,
                dateRange,
                metrics: {},
                trends: {},
                comparisons: {},
                predictions: {},
                recommendations: []
            };

            // Calculate metrics based on requested types
            if (metrics.includes('all') || metrics.includes('performance')) {
                analytics.metrics.performance = await this.#calculatePerformanceMetrics(client, dateRange);
            }
            if (metrics.includes('all') || metrics.includes('engagement')) {
                analytics.metrics.engagement = await this.#calculateEngagementMetrics(client, dateRange);
            }
            if (metrics.includes('all') || metrics.includes('financial')) {
                analytics.metrics.financial = await this.#calculateFinancialMetrics(client, dateRange);
            }
            if (metrics.includes('all') || metrics.includes('retention')) {
                analytics.metrics.retention = await this.#calculateRetentionMetrics(client, dateRange);
            }

            // Calculate trends
            analytics.trends = await this.#calculateTrends(client, dateRange);

            // Add comparisons if requested
            if (comparisons) {
                analytics.comparisons = await this.#generateComparisons(client, analytics.metrics);
            }

            // Add predictions if requested
            if (predictions) {
                analytics.predictions = await this.#generatePredictions(client, analytics.metrics);
            }

            // Generate recommendations
            analytics.recommendations = await this.#generateRecommendations(analytics);

            // Calculate overall score
            analytics.overallScore = this.#calculateOverallScore(analytics.metrics);

            // Cache results
            await this.#cacheService.set(cacheKey, analytics, this.#cacheTTL);

            // Log analytics access
            await this.#auditService.log({
                action: 'CLIENT_ANALYTICS_ACCESSED',
                entityType: 'client',
                entityId: clientId,
                userId: options.userId,
                details: { metrics: metrics.join(', ') }
            });

            return analytics;
        } catch (error) {
            logger.error('Error getting client analytics', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Get aggregated analytics for multiple clients
     * @param {Object} filters - Client filters
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Aggregated analytics
     */
    async getAggregatedAnalytics(filters = {}, options = {}) {
        const {
            groupBy = 'tier',
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            tenantId
        } = options;

        try {
            // Build query
            const query = {
                isDeleted: false,
                'archiveStatus.isArchived': { $ne: true }
            };
            if (tenantId) query.tenantId = tenantId;
            Object.assign(query, filters);

            // Aggregate analytics
            const aggregation = await ClientModel.aggregate([
                { $match: query },
                {
                    $facet: {
                        overview: [
                            {
                                $group: {
                                    _id: null,
                                    totalClients: { $sum: 1 },
                                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
                                    avgRevenue: { $avg: '$analytics.lifetime.totalRevenue' },
                                    totalProjects: { $sum: '$analytics.lifetime.totalProjects' },
                                    avgHealthScore: { $avg: '$relationship.healthScore.score' },
                                    activeClients: {
                                        $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
                                    }
                                }
                            }
                        ],
                        byGroup: [
                            {
                                $group: {
                                    _id: `$${groupBy}`,
                                    count: { $sum: 1 },
                                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
                                    avgRevenue: { $avg: '$analytics.lifetime.totalRevenue' },
                                    avgHealthScore: { $avg: '$relationship.healthScore.score' },
                                    activeProjects: { $sum: '$analytics.current.activeProjects' }
                                }
                            },
                            { $sort: { totalRevenue: -1 } }
                        ],
                        timeline: [
                            {
                                $unwind: '$projects'
                            },
                            {
                                $match: {
                                    'projects.startDate': { $gte: dateRange.start, $lte: dateRange.end }
                                }
                            },
                            {
                                $group: {
                                    _id: {
                                        year: { $year: '$projects.startDate' },
                                        month: { $month: '$projects.startDate' }
                                    },
                                    revenue: { $sum: '$projects.value' },
                                    projectCount: { $sum: 1 }
                                }
                            },
                            { $sort: { '_id.year': 1, '_id.month': 1 } }
                        ],
                        riskDistribution: [
                            {
                                $group: {
                                    _id: '$relationship.churnRisk.level',
                                    count: { $sum: 1 },
                                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' }
                                }
                            }
                        ]
                    }
                }
            ]);

            const results = aggregation[0];

            // Calculate additional metrics
            const aggregatedAnalytics = {
                overview: results.overview[0] || {},
                distribution: {
                    byGroup: results.byGroup,
                    byRisk: results.riskDistribution
                },
                timeline: this.#formatTimeline(results.timeline),
                insights: await this.#generateAggregatedInsights(results),
                benchmarks: await this.#getBenchmarks(groupBy),
                dateRange
            };

            return aggregatedAnalytics;
        } catch (error) {
            logger.error('Error getting aggregated analytics', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    // ==================== Performance Metrics ====================

    /**
     * Calculate comprehensive performance metrics
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for calculations
     * @returns {Promise<Object>} Performance metrics
     * @private
     */
    async #calculatePerformanceMetrics(client, dateRange) {
        const metrics = {
            score: 0,
            components: {},
            trends: {},
            benchmarks: {}
        };

        try {
            // Project performance
            const projectMetrics = await this.#calculateProjectMetrics(client, dateRange);
            metrics.components.projects = projectMetrics;

            // Delivery performance
            const deliveryMetrics = await this.#calculateDeliveryMetrics(client, dateRange);
            metrics.components.delivery = deliveryMetrics;

            // Quality metrics
            const qualityMetrics = await this.#calculateQualityMetrics(client, dateRange);
            metrics.components.quality = qualityMetrics;

            // Resource utilization
            const utilizationMetrics = await this.#calculateUtilizationMetrics(client, dateRange);
            metrics.components.utilization = utilizationMetrics;

            // Calculate overall performance score
            metrics.score = this.#calculateWeightedScore([
                { value: projectMetrics.score, weight: 0.3 },
                { value: deliveryMetrics.score, weight: 0.3 },
                { value: qualityMetrics.score, weight: 0.2 },
                { value: utilizationMetrics.score, weight: 0.2 }
            ]);

            // Get performance trends
            metrics.trends = await this.#getPerformanceTrends(client, dateRange);

            // Compare with benchmarks
            metrics.benchmarks = await this.#compareWithBenchmarks(
                metrics.score,
                'performance',
                client.relationship.tier
            );

            return metrics;
        } catch (error) {
            logger.error('Error calculating performance metrics', {
                error: error.message,
                clientId: client._id
            });
            return metrics;
        }
    }

    /**
     * Calculate engagement metrics
     * @private
     */
    async #calculateEngagementMetrics(client, dateRange) {
        const metrics = {
            score: 0,
            components: {},
            indicators: {},
            timeline: []
        };

        try {
            // Portal activity
            const portalActivity = client.analytics.engagement.portalLogins || 0;
            const lastActivity = client.analytics.engagement.lastActivityDate;
            const daysSinceActivity = lastActivity ?
                Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24)) : 999;

            metrics.components.portalActivity = {
                logins: portalActivity,
                lastActivity: lastActivity,
                daysSinceActivity,
                score: Math.max(0, 100 - (daysSinceActivity * 2))
            };

            // Communication frequency
            const interactions = await ClientNoteModel.countDocuments({
                clientId: client._id,
                createdAt: { $gte: dateRange.start, $lte: dateRange.end }
            });

            metrics.components.communication = {
                interactions,
                averagePerWeek: interactions / 12,
                score: Math.min(100, interactions * 5)
            };

            // Document engagement
            const documentActivity = await ClientDocumentModel.aggregate([
                {
                    $match: {
                        clientId: client._id,
                        createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalViews: { $sum: '$analytics.views.total' },
                        totalDownloads: { $sum: '$analytics.downloads.total' },
                        documentsCreated: { $sum: 1 }
                    }
                }
            ]);

            metrics.components.documents = documentActivity[0] || {
                totalViews: 0,
                totalDownloads: 0,
                documentsCreated: 0,
                score: 0
            };

            // Contact engagement
            const contactEngagement = await ClientContactModel.aggregate([
                {
                    $match: {
                        clientId: client._id,
                        'relationship.status': 'active'
                    }
                },
                {
                    $group: {
                        _id: null,
                        activeContacts: { $sum: 1 },
                        avgEngagementScore: { $avg: '$scoring.engagementScore.score' }
                    }
                }
            ]);

            metrics.components.contacts = contactEngagement[0] || {
                activeContacts: 0,
                avgEngagementScore: 0,
                score: 0
            };

            // Feature adoption
            const featureAdoption = client.analytics.engagement.featureAdoption || new Map();
            metrics.components.featureAdoption = {
                adoptedFeatures: featureAdoption.size,
                adoptionRate: (featureAdoption.size / 10) * 100, // Assuming 10 key features
                score: Math.min(100, featureAdoption.size * 10)
            };

            // Calculate overall engagement score
            metrics.score = this.#calculateWeightedScore([
                { value: metrics.components.portalActivity.score, weight: 0.25 },
                { value: metrics.components.communication.score, weight: 0.25 },
                { value: metrics.components.documents.score || 50, weight: 0.2 },
                { value: metrics.components.contacts.avgEngagementScore || 50, weight: 0.15 },
                { value: metrics.components.featureAdoption.score, weight: 0.15 }
            ]);

            // Engagement indicators
            metrics.indicators = {
                isHighlyEngaged: metrics.score >= 80,
                isEngaged: metrics.score >= 60,
                isAtRisk: metrics.score < 40,
                trend: this.#calculateTrend(metrics.score, 50) // Compare with baseline
            };

            return metrics;
        } catch (error) {
            logger.error('Error calculating engagement metrics', {
                error: error.message,
                clientId: client._id
            });
            return metrics;
        }
    }

    /**
     * Calculate financial metrics
     * @private
     */
    async #calculateFinancialMetrics(client, dateRange) {
        const metrics = {
            revenue: {},
            profitability: {},
            billing: {},
            forecast: {}
        };

        try {
            // Revenue metrics
            metrics.revenue = {
                total: client.analytics.lifetime.totalRevenue || 0,
                recurring: client.analytics.current.monthlyRecurringRevenue || 0,
                annualRecurring: client.analytics.current.annualRecurringRevenue || 0,
                pending: client.analytics.current.pendingRevenue || 0,
                averageProjectValue: client.analytics.lifetime.averageProjectValue || 0
            };

            // Growth calculations
            const previousPeriodRevenue = await this.#getPreviousPeriodRevenue(client, dateRange);
            metrics.revenue.growth = {
                amount: metrics.revenue.total - previousPeriodRevenue,
                percentage: previousPeriodRevenue > 0 ?
                    ((metrics.revenue.total - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0
            };

            // Billing performance
            metrics.billing = {
                outstandingBalance: client.billing.outstandingBalance || 0,
                paymentPerformance: client.billing.paymentPerformance || {},
                creditUtilization: client.billing.creditLimit?.amount ?
                    (client.billing.outstandingBalance / client.billing.creditLimit.amount) * 100 : 0,
                daysOutstanding: client.billing.paymentPerformance?.averageDaysToPayment || 0
            };

            // Profitability estimation (simplified)
            const estimatedCost = metrics.revenue.total * 0.6; // 60% cost assumption
            metrics.profitability = {
                estimatedProfit: metrics.revenue.total - estimatedCost,
                margin: ((metrics.revenue.total - estimatedCost) / metrics.revenue.total) * 100,
                ltv: this.#calculateLifetimeValue(client),
                cac: this.#calculateCustomerAcquisitionCost(client)
            };

            // Revenue forecast
            metrics.forecast = await this.#generateRevenueForecast(client, metrics.revenue);

            return metrics;
        } catch (error) {
            logger.error('Error calculating financial metrics', {
                error: error.message,
                clientId: client._id
            });
            return metrics;
        }
    }

    /**
     * Calculate retention metrics
     * @private
     */
    async #calculateRetentionMetrics(client, dateRange) {
        const metrics = {
            score: 0,
            indicators: {},
            risks: [],
            opportunities: []
        };

        try {
            // Contract metrics
            const activeContracts = client.contracts.filter(c => c.status === 'active').length;
            const contractValue = client.contracts
                .filter(c => c.status === 'active')
                .reduce((sum, c) => sum + (c.value?.amount || 0), 0);

            metrics.indicators.contracts = {
                active: activeContracts,
                totalValue: contractValue,
                averageLength: this.#calculateAverageContractLength(client.contracts)
            };

            // Renewal metrics
            const renewalDate = client.lifecycle.importantDates?.nextRenewalDate;
            const daysUntilRenewal = renewalDate ?
                Math.floor((renewalDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

            metrics.indicators.renewal = {
                nextRenewalDate: renewalDate,
                daysUntilRenewal,
                renewalProbability: this.#calculateRenewalProbability(client),
                isUpForRenewal: daysUntilRenewal && daysUntilRenewal <= 90
            };

            // Satisfaction indicators
            metrics.indicators.satisfaction = {
                nps: client.relationship.satisfactionScore?.nps || 0,
                csat: client.relationship.satisfactionScore?.csat || 0,
                healthScore: client.relationship.healthScore?.score || 0,
                trend: client.relationship.healthScore?.trend || 'stable'
            };

            // Churn risk assessment
            const churnRisk = await this.#assessChurnRisk(client);
            metrics.indicators.churnRisk = churnRisk;

            // Identify risks
            if (churnRisk.level === 'high' || churnRisk.level === 'critical') {
                metrics.risks.push({
                    type: 'churn',
                    level: churnRisk.level,
                    factors: churnRisk.factors,
                    recommendation: 'Immediate intervention required'
                });
            }

            if (daysUntilRenewal && daysUntilRenewal <= 30) {
                metrics.risks.push({
                    type: 'renewal',
                    level: 'urgent',
                    daysRemaining: daysUntilRenewal,
                    recommendation: 'Initiate renewal discussions immediately'
                });
            }

            // Identify opportunities
            if (metrics.indicators.satisfaction.healthScore > 80) {
                metrics.opportunities.push({
                    type: 'upsell',
                    confidence: 'high',
                    recommendation: 'Client is highly satisfied - explore expansion opportunities'
                });
            }

            // Calculate retention score
            metrics.score = this.#calculateWeightedScore([
                { value: metrics.indicators.satisfaction.healthScore || 50, weight: 0.4 },
                { value: metrics.indicators.renewal.renewalProbability * 100, weight: 0.3 },
                { value: 100 - (churnRisk.score * 100), weight: 0.3 }
            ]);

            return metrics;
        } catch (error) {
            logger.error('Error calculating retention metrics', {
                error: error.message,
                clientId: client._id
            });
            return metrics;
        }
    }

    // ==================== Predictive Analytics ====================

    /**
     * Generate predictions for client
     * @private
     */
    async #generatePredictions(client, currentMetrics) {
        const predictions = {
            churn: {},
            growth: {},
            upsell: {},
            risks: [],
            opportunities: []
        };

        try {
            // Churn prediction
            predictions.churn = await this.#predictChurn(client, currentMetrics);

            // Growth prediction
            predictions.growth = await this.#predictGrowth(client, currentMetrics);

            // Upsell prediction
            predictions.upsell = await this.#predictUpsell(client, currentMetrics);

            // Risk predictions
            if (predictions.churn.probability > 0.6) {
                predictions.risks.push({
                    type: 'churn',
                    probability: predictions.churn.probability,
                    timeframe: '3 months',
                    impact: 'high',
                    preventiveActions: predictions.churn.preventiveActions
                });
            }

            // Opportunity predictions
            if (predictions.upsell.probability > 0.7) {
                predictions.opportunities.push({
                    type: 'upsell',
                    probability: predictions.upsell.probability,
                    potentialValue: predictions.upsell.potentialValue,
                    recommendedProducts: predictions.upsell.recommendations
                });
            }

            if (predictions.growth.expectedGrowth > 20) {
                predictions.opportunities.push({
                    type: 'expansion',
                    expectedGrowth: predictions.growth.expectedGrowth,
                    drivers: predictions.growth.drivers
                });
            }

            return predictions;
        } catch (error) {
            logger.error('Error generating predictions', {
                error: error.message,
                clientId: client._id
            });
            return predictions;
        }
    }

    /**
     * Predict churn probability
     * @private
     */
    async #predictChurn(client, metrics) {
        const factors = {
            healthScore: client.relationship.healthScore?.score || 50,
            engagementTrend: metrics.engagement?.indicators?.trend || 'stable',
            supportTickets: client.analytics.engagement.supportTickets || 0,
            paymentDelay: client.billing.paymentPerformance?.averageDaysToPayment || 0,
            lastInteraction: client.communications.lastContact?.date,
            satisfactionScore: client.relationship.satisfactionScore?.nps || 0
        };

        // Simple churn model (in production, use ML model)
        let churnScore = 0;

        if (factors.healthScore < 50) churnScore += 0.3;
        if (factors.engagementTrend === 'decreasing') churnScore += 0.2;
        if (factors.supportTickets > 10) churnScore += 0.1;
        if (factors.paymentDelay > 60) churnScore += 0.2;
        if (factors.satisfactionScore < 0) churnScore += 0.2;

        const daysSinceContact = factors.lastInteraction ?
            Math.floor((new Date() - factors.lastInteraction) / (1000 * 60 * 60 * 24)) : 999;
        if (daysSinceContact > 60) churnScore += 0.1;

        return {
            probability: Math.min(1, churnScore),
            confidence: 0.75, // Model confidence
            factors: Object.entries(factors)
                .filter(([key, value]) => this.#isNegativeFactor(key, value))
                .map(([key]) => key),
            preventiveActions: [
                'Schedule executive business review',
                'Assign dedicated success manager',
                'Offer loyalty incentives',
                'Address outstanding issues'
            ],
            timeframe: '90 days'
        };
    }

    /**
     * Predict growth potential
     * @private
     */
    async #predictGrowth(client, metrics) {
        const historicalGrowth = metrics.financial?.revenue?.growth?.percentage || 0;
        const projectPipeline = client.opportunities?.filter(o =>
            o.stage === 'proposal' || o.stage === 'negotiation'
        ).length || 0;

        const factors = {
            currentGrowth: historicalGrowth,
            pipelineStrength: projectPipeline,
            marketConditions: 1.0, // External factor
            clientSatisfaction: client.relationship.satisfactionScore?.csat || 50,
            budgetAvailability: client.billing.creditLimit?.amount || 0
        };

        // Calculate expected growth
        const baseGrowth = historicalGrowth > 0 ? historicalGrowth : 10;
        const adjustments = {
            pipeline: projectPipeline * 5,
            satisfaction: (factors.clientSatisfaction - 50) / 10,
            budget: factors.budgetAvailability > 100000 ? 10 : 0
        };

        const expectedGrowth = baseGrowth +
            adjustments.pipeline +
            adjustments.satisfaction +
            adjustments.budget;

        return {
            expectedGrowth: Math.max(0, expectedGrowth),
            confidence: 0.65,
            drivers: Object.entries(adjustments)
                .filter(([key, value]) => value > 0)
                .map(([key]) => key),
            recommendations: [
                'Focus on pipeline conversion',
                'Maintain high satisfaction levels',
                'Explore new service offerings'
            ],
            timeframe: '12 months'
        };
    }

    /**
     * Predict upsell opportunities
     * @private
     */
    async #predictUpsell(client, metrics) {
        const utilization = metrics.performance?.components?.utilization?.score || 0;
        const satisfaction = client.relationship.satisfactionScore?.csat || 50;
        const currentSpend = client.analytics.lifetime.totalRevenue || 0;
        const creditAvailable = (client.billing.creditLimit?.amount || 0) - (client.billing.outstandingBalance || 0);

        // Calculate upsell probability
        let upsellScore = 0;

        if (utilization > 80) upsellScore += 0.3;
        if (satisfaction > 70) upsellScore += 0.3;
        if (creditAvailable > currentSpend * 0.2) upsellScore += 0.2;
        if (client.relationship.tier === 'strategic' || client.relationship.tier === 'enterprise') {
            upsellScore += 0.2;
        }

        const potentialValue = currentSpend * 0.3; // 30% increase potential

        return {
            probability: Math.min(1, upsellScore),
            confidence: 0.7,
            potentialValue,
            recommendations: [
                'Premium support package',
                'Additional user licenses',
                'Advanced analytics module',
                'Professional services'
            ],
            triggers: [
                'High utilization rate',
                'Strong satisfaction scores',
                'Available budget'
            ]
        };
    }

    // ==================== Reporting & Export ====================

    /**
     * Generate comprehensive analytics report
     * @param {string} clientId - Client ID
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Analytics report
     */
    async generateAnalyticsReport(clientId, options = {}) {
        const {
            format = 'pdf',
            sections = ['overview', 'performance', 'financial', 'predictions'],
            dateRange = { start: moment().subtract(90, 'days').toDate(), end: new Date() },
            includeCharts = true
        } = options;

        try {
            // Get comprehensive analytics
            const analytics = await this.getClientAnalytics(clientId, {
                dateRange,
                metrics: ['all'],
                comparisons: true,
                predictions: true
            });

            // Get client details
            const client = await ClientModel.findById(clientId);

            // Build report structure
            const report = {
                metadata: {
                    generatedAt: new Date(),
                    generatedBy: options.userId,
                    reportId: `RPT-${Date.now()}`,
                    format
                },
                client: {
                    clientCode: client.clientCode,
                    companyName: client.companyName,
                    tier: client.relationship.tier,
                    accountManager: client.relationship.accountManager
                },
                sections: {}
            };

            // Add requested sections
            for (const section of sections) {
                switch (section) {
                    case 'overview':
                        report.sections.overview = this.#generateOverviewSection(analytics, client);
                        break;
                    case 'performance':
                        report.sections.performance = this.#generatePerformanceSection(analytics);
                        break;
                    case 'financial':
                        report.sections.financial = this.#generateFinancialSection(analytics);
                        break;
                    case 'predictions':
                        report.sections.predictions = this.#generatePredictionsSection(analytics);
                        break;
                    case 'recommendations':
                        report.sections.recommendations = this.#generateRecommendationsSection(analytics);
                        break;
                }
            }

            // Add charts if requested
            if (includeCharts) {
                report.charts = await this.#generateCharts(analytics);
            }

            // Generate report in requested format
            let output;
            switch (format) {
                case 'json':
                    output = report;
                    break;
                case 'excel':
                    output = await this.#generateExcelReport(report);
                    break;
                case 'pdf':
                    output = await this.#generatePDFReport(report);
                    break;
                default:
                    throw new ValidationError(`Unsupported report format: ${format}`, 'INVALID_FORMAT');
            }

            // Log report generation
            await this.#auditService.log({
                action: 'ANALYTICS_REPORT_GENERATED',
                entityType: 'client',
                entityId: clientId,
                userId: options.userId,
                details: {
                    reportId: report.metadata.reportId,
                    format,
                    sections: sections.join(', ')
                }
            });

            return output;
        } catch (error) {
            logger.error('Error generating analytics report', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Export analytics data
     * @param {Object} analyticsData - Analytics data to export
     * @param {string} format - Export format
     * @returns {Promise<Buffer>} Exported data
     */
    async exportAnalytics(analyticsData, format = 'csv') {
        try {
            let exportBuffer;

            switch (format.toLowerCase()) {
                case 'csv':
                    exportBuffer = await this.#exportToCSV(analyticsData);
                    break;
                case 'excel':
                    exportBuffer = await this.#exportToExcel(analyticsData);
                    break;
                case 'json':
                    exportBuffer = Buffer.from(JSON.stringify(analyticsData, null, 2));
                    break;
                default:
                    throw new ValidationError(`Unsupported export format: ${format}`, 'INVALID_FORMAT');
            }

            return exportBuffer;
        } catch (error) {
            logger.error('Error exporting analytics', {
                error: error.message,
                format
            });
            throw error;
        }
    }

    // ==================== Dashboard Data ====================

    /**
     * Get dashboard data for client analytics
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Dashboard options
     * @returns {Promise<Object>} Dashboard data
     */
    async getDashboardData(filters = {}, options = {}) {
        const {
            widgets = ['kpi', 'trends', 'distribution', 'alerts'],
            dateRange = { start: moment().subtract(30, 'days').toDate(), end: new Date() },
            tenantId
        } = options;

        try {
            const dashboard = {
                generated: new Date(),
                dateRange,
                widgets: {}
            };

            // Get KPI widget data
            if (widgets.includes('kpi')) {
                dashboard.widgets.kpi = await this.#getKPIData(filters, { tenantId, dateRange });
            }

            // Get trends widget data
            if (widgets.includes('trends')) {
                dashboard.widgets.trends = await this.#getTrendsData(filters, { tenantId, dateRange });
            }

            // Get distribution widget data
            if (widgets.includes('distribution')) {
                dashboard.widgets.distribution = await this.#getDistributionData(filters, { tenantId });
            }

            // Get alerts widget data
            if (widgets.includes('alerts')) {
                dashboard.widgets.alerts = await this.#getAlertsData(filters, { tenantId });
            }

            // Get top performers
            if (widgets.includes('topPerformers')) {
                dashboard.widgets.topPerformers = await this.#getTopPerformers(filters, { tenantId });
            }

            // Get at-risk clients
            if (widgets.includes('atRisk')) {
                dashboard.widgets.atRisk = await this.#getAtRiskClients(filters, { tenantId });
            }

            return dashboard;
        } catch (error) {
            logger.error('Error getting dashboard data', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Generate cache key
     * @private
     */
    #generateCacheKey(type, identifier, options = {}) {
        const optionsString = JSON.stringify(options);
        return `analytics:${type}:${identifier}:${Buffer.from(optionsString).toString('base64')}`;
    }

    /**
     * Calculate weighted score
     * @private
     */
    #calculateWeightedScore(components) {
        return components.reduce((total, component) => {
            return total + (component.value * component.weight);
        }, 0);
    }

    /**
     * Calculate trend
     * @private
     */
    #calculateTrend(current, previous) {
        if (!previous || previous === 0) return 'stable';
        const change = ((current - previous) / previous) * 100;
        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    /**
     * Load benchmarks
     * @private
     */
    async #loadBenchmarks() {
        // Load industry benchmarks
        this.#benchmarks.industry.set('technology', {
            performance: 75,
            engagement: 70,
            retention: 85,
            growth: 20
        });
        this.#benchmarks.industry.set('healthcare', {
            performance: 70,
            engagement: 65,
            retention: 80,
            growth: 15
        });

        // Load tier benchmarks
        this.#benchmarks.tier.set('strategic', {
            performance: 85,
            engagement: 80,
            retention: 90,
            healthScore: 85
        });
        this.#benchmarks.tier.set('enterprise', {
            performance: 75,
            engagement: 70,
            retention: 85,
            healthScore: 75
        });
    }

    /**
     * Get KPI data for dashboard
     * @private
     */
    async #getKPIData(filters, options) {
        const { tenantId, dateRange } = options;

        const kpis = await ClientModel.aggregate([
            {
                $match: {
                    tenantId,
                    isDeleted: false,
                    ...filters
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' },
                    activeClients: {
                        $sum: { $cond: [{ $eq: ['$relationship.status', 'active'] }, 1, 0] }
                    },
                    avgHealthScore: { $avg: '$relationship.healthScore.score' },
                    atRiskCount: {
                        $sum: {
                            $cond: [
                                { $in: ['$relationship.churnRisk.level', ['high', 'critical']] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        return kpis[0] || {
            totalRevenue: 0,
            activeClients: 0,
            avgHealthScore: 0,
            atRiskCount: 0
        };
    }

    /**
     * Calculate project metrics
     * @private
     */
    async #calculateProjectMetrics(client, dateRange) {
        const projects = client.projects || [];
        const activeProjects = projects.filter(p => p.status === 'active');
        const completedProjects = projects.filter(p =>
            p.status === 'completed' &&
            p.endDate >= dateRange.start &&
            p.endDate <= dateRange.end
        );

        return {
            total: projects.length,
            active: activeProjects.length,
            completed: completedProjects.length,
            successRate: projects.length > 0 ?
                (completedProjects.length / projects.length) * 100 : 0,
            averageValue: projects.length > 0 ?
                projects.reduce((sum, p) => sum + (p.value || 0), 0) / projects.length : 0,
            score: Math.min(100, (activeProjects.length * 10) + (completedProjects.length * 5))
        };
    }

    /**
     * Generate recommendations based on analytics
     * @private
     */
    async #generateRecommendations(analytics) {
        const recommendations = [];

        // Performance recommendations
        if (analytics.metrics?.performance?.score < 60) {
            recommendations.push({
                category: 'performance',
                priority: 'high',
                action: 'Schedule performance review meeting',
                reason: 'Performance score below acceptable threshold',
                impact: 'Improve delivery quality and client satisfaction'
            });
        }

        // Engagement recommendations
        if (analytics.metrics?.engagement?.score < 50) {
            recommendations.push({
                category: 'engagement',
                priority: 'high',
                action: 'Implement engagement recovery plan',
                reason: 'Low engagement indicates potential churn risk',
                impact: 'Increase client retention and satisfaction'
            });
        }

        // Financial recommendations
        if (analytics.metrics?.financial?.billing?.outstandingBalance > 10000) {
            recommendations.push({
                category: 'financial',
                priority: 'urgent',
                action: 'Follow up on outstanding payments',
                reason: 'High outstanding balance affecting cash flow',
                impact: 'Improve cash flow and reduce financial risk'
            });
        }

        // Growth recommendations
        if (analytics.predictions?.upsell?.probability > 0.7) {
            recommendations.push({
                category: 'growth',
                priority: 'medium',
                action: 'Present upsell opportunities',
                reason: 'High probability of successful upsell',
                impact: `Potential revenue increase of $${analytics.predictions.upsell.potentialValue}`
            });
        }

        return recommendations;
    }

    /**
     * Export to Excel format
     * @private
     */
    async #exportToExcel(data) {
        const workbook = new ExcelJS.Workbook();

        // Overview sheet
        const overviewSheet = workbook.addWorksheet('Overview');
        overviewSheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 },
            { header: 'Trend', key: 'trend', width: 15 },
            { header: 'Benchmark', key: 'benchmark', width: 15 }
        ];

        // Add data rows
        if (data.metrics) {
            Object.entries(data.metrics).forEach(([category, metrics]) => {
                overviewSheet.addRow({
                    metric: category.toUpperCase(),
                    value: metrics.score || 0,
                    trend: metrics.trend || 'stable',
                    benchmark: metrics.benchmark || 'N/A'
                });
            });
        }

        // Style the header
        overviewSheet.getRow(1).font = { bold: true };
        overviewSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4A90E2' }
        };

        return await workbook.xlsx.writeBuffer();
    }

    /**
     * Assess churn risk
     * @private
     */
    async #assessChurnRisk(client) {
        const riskFactors = [];
        let riskScore = 0;

        // Health score factor
        const healthScore = client.relationship.healthScore?.score || 50;
        if (healthScore < 50) {
            riskFactors.push('Low health score');
            riskScore += 0.3;
        }

        // Engagement factor
        const lastActivity = client.analytics.engagement.lastActivityDate;
        const daysSinceActivity = lastActivity ?
            Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24)) : 999;
        if (daysSinceActivity > 60) {
            riskFactors.push('Low engagement');
            riskScore += 0.2;
        }

        // Payment factor
        if (client.billing.paymentPerformance?.averageDaysToPayment > 60) {
            riskFactors.push('Payment delays');
            riskScore += 0.2;
        }

        // Support tickets
        if (client.analytics.engagement.supportTickets > 10) {
            riskFactors.push('High support ticket volume');
            riskScore += 0.15;
        }

        // Satisfaction factor
        if (client.relationship.satisfactionScore?.nps < 0) {
            riskFactors.push('Negative NPS score');
            riskScore += 0.15;
        }

        // Determine risk level
        let level;
        if (riskScore >= 0.7) level = 'critical';
        else if (riskScore >= 0.5) level = 'high';
        else if (riskScore >= 0.3) level = 'medium';
        else if (riskScore >= 0.1) level = 'low';
        else level = 'none';

        return {
            score: riskScore,
            level,
            factors: riskFactors,
            assessedAt: new Date()
        };
    }

    /**
     * Calculate delivery metrics for client performance
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for calculations
     * @returns {Promise<Object>} Delivery metrics
     */
    async #calculateDeliveryMetrics(client, dateRange) {
        try {
            const projects = client.projects || [];
            const completedProjects = projects.filter(p =>
                p.status === 'completed' &&
                p.endDate >= dateRange.start &&
                p.endDate <= dateRange.end
            );

            const onTimeDeliveries = completedProjects.filter(p =>
                p.actualEndDate && p.plannedEndDate &&
                p.actualEndDate <= p.plannedEndDate
            ).length;

            const avgDeliveryTime = completedProjects.length > 0 ?
                completedProjects.reduce((sum, p) => {
                    const planned = new Date(p.plannedEndDate);
                    const actual = new Date(p.actualEndDate);
                    return sum + Math.max(0, (actual - planned) / (1000 * 60 * 60 * 24));
                }, 0) / completedProjects.length : 0;

            return {
                onTimeDeliveryRate: completedProjects.length > 0 ?
                    (onTimeDeliveries / completedProjects.length) * 100 : 0,
                averageDeliveryDelay: avgDeliveryTime,
                totalDeliveries: completedProjects.length,
                perfectDeliveries: onTimeDeliveries,
                score: completedProjects.length > 0 ?
                    Math.max(0, 100 - (avgDeliveryTime * 2)) : 50
            };
        } catch (error) {
            logger.error('Error calculating delivery metrics', {
                error: error.message,
                clientId: client._id
            });
            return { score: 0, onTimeDeliveryRate: 0, averageDeliveryDelay: 0 };
        }
    }

    /**
     * Calculate quality metrics for client performance
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for calculations
     * @returns {Promise<Object>} Quality metrics
     */
    async #calculateQualityMetrics(client, dateRange) {
        try {
            const feedbackScore = client.relationship?.satisfactionScore?.csat || 0;
            const defectRate = client.analytics?.quality?.defectRate || 0;
            const reworkRate = client.analytics?.quality?.reworkRate || 0;
            const clientApprovalRate = client.analytics?.quality?.approvalRate || 90;

            const qualityScore = Math.max(0,
                (feedbackScore * 0.3) +
                ((100 - defectRate) * 0.25) +
                ((100 - reworkRate) * 0.25) +
                (clientApprovalRate * 0.2)
            );

            return {
                score: qualityScore,
                clientSatisfaction: feedbackScore,
                defectRate,
                reworkRate,
                approvalRate: clientApprovalRate,
                qualityTrend: this.#calculateTrend(qualityScore, 75)
            };
        } catch (error) {
            logger.error('Error calculating quality metrics', {
                error: error.message,
                clientId: client._id
            });
            return { score: 0, defectRate: 0, reworkRate: 0 };
        }
    }

    /**
     * Calculate utilization metrics
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for calculations
     * @returns {Promise<Object>} Utilization metrics
     */
    async #calculateUtilizationMetrics(client, dateRange) {
        try {
            const allocatedHours = client.analytics?.utilization?.allocatedHours || 0;
            const billedHours = client.analytics?.utilization?.billedHours || 0;
            const contractedCapacity = client.analytics?.utilization?.contractedCapacity || 100;
            const actualUtilization = client.analytics?.utilization?.actualUtilization || 0;

            const utilizationRate = allocatedHours > 0 ?
                (billedHours / allocatedHours) * 100 : 0;

            const capacityUtilization = contractedCapacity > 0 ?
                (actualUtilization / contractedCapacity) * 100 : 0;

            const efficiency = Math.min(100, utilizationRate);
            const score = (efficiency * 0.6) + (capacityUtilization * 0.4);

            return {
                score,
                utilizationRate,
                capacityUtilization,
                efficiency,
                allocatedHours,
                billedHours,
                trend: this.#calculateTrend(score, 80)
            };
        } catch (error) {
            logger.error('Error calculating utilization metrics', {
                error: error.message,
                clientId: client._id
            });
            return { score: 0, utilizationRate: 0, capacityUtilization: 0 };
        }
    }

    /**
     * Get performance trends over time
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for trend analysis
     * @returns {Promise<Object>} Performance trends
     */
    async #getPerformanceTrends(client, dateRange) {
        try {
            const periods = 4; // Last 4 quarters or periods
            const periodLength = (dateRange.end - dateRange.start) / periods;
            const trends = [];

            for (let i = 0; i < periods; i++) {
                const periodStart = new Date(dateRange.start.getTime() + (i * periodLength));
                const periodEnd = new Date(periodStart.getTime() + periodLength);

                const periodProjects = client.projects?.filter(p =>
                    p.startDate >= periodStart && p.startDate <= periodEnd
                ) || [];

                const periodScore = periodProjects.length > 0 ?
                    periodProjects.reduce((sum, p) => sum + (p.performanceScore || 75), 0) / periodProjects.length :
                    75;

                trends.push({
                    period: i + 1,
                    startDate: periodStart,
                    endDate: periodEnd,
                    score: periodScore,
                    projectCount: periodProjects.length
                });
            }

            const overallTrend = trends.length > 1 ?
                this.#calculateTrend(trends[trends.length - 1].score, trends[0].score) : 'stable';

            return {
                periods: trends,
                overallTrend,
                improvement: trends.length > 1 ?
                    trends[trends.length - 1].score - trends[0].score : 0
            };
        } catch (error) {
            logger.error('Error calculating performance trends', {
                error: error.message,
                clientId: client._id
            });
            return { periods: [], overallTrend: 'stable', improvement: 0 };
        }
    }

    /**
     * Compare metrics with benchmarks
     * @private
     * @param {number} score - Score to compare
     * @param {string} metricType - Type of metric
     * @param {string} tier - Client tier
     * @returns {Promise<Object>} Benchmark comparison
     */
    async #compareWithBenchmarks(score, metricType, tier) {
        try {
            const tierBenchmarks = this.#benchmarks.tier.get(tier) || {};
            const industryBenchmarks = this.#benchmarks.industry.get('average') || {};

            const benchmark = tierBenchmarks[metricType] || industryBenchmarks[metricType] || 75;
            const percentile = this.#calculatePercentile(score, benchmark);

            return {
                score,
                benchmark,
                difference: score - benchmark,
                percentile,
                performance: score >= benchmark ? 'above' : 'below',
                tier,
                comparison: {
                    tier: tierBenchmarks[metricType] || null,
                    industry: industryBenchmarks[metricType] || null
                }
            };
        } catch (error) {
            logger.error('Error comparing with benchmarks', {
                error: error.message,
                score,
                metricType
            });
            return { score, benchmark: 75, difference: score - 75, performance: 'unknown' };
        }
    }

    /**
     * Get previous period revenue for comparison
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Current date range
     * @returns {Promise<number>} Previous period revenue
     */
    async #getPreviousPeriodRevenue(client, dateRange) {
        try {
            const periodLength = dateRange.end - dateRange.start;
            const previousStart = new Date(dateRange.start.getTime() - periodLength);
            const previousEnd = dateRange.start;

            const previousProjects = client.projects?.filter(p =>
                p.startDate >= previousStart && p.startDate < previousEnd
            ) || [];

            return previousProjects.reduce((sum, p) => sum + (p.value?.amount || 0), 0);
        } catch (error) {
            logger.error('Error getting previous period revenue', {
                error: error.message,
                clientId: client._id
            });
            return 0;
        }
    }

    /**
     * Generate revenue forecast
     * @private
     * @param {Object} client - Client object
     * @param {Object} revenueMetrics - Current revenue metrics
     * @returns {Promise<Object>} Revenue forecast
     */
    async #generateRevenueForecast(client, revenueMetrics) {
        try {
            const monthlyRecurring = revenueMetrics.recurring || 0;
            const growthRate = revenueMetrics.growth?.percentage || 0;
            const seasonalityFactor = 1.1; // 10% seasonal boost

            const forecast = {
                next30Days: monthlyRecurring,
                next90Days: monthlyRecurring * 3 * (1 + (growthRate / 100 / 12)),
                next12Months: monthlyRecurring * 12 * (1 + (growthRate / 100)),
                confidence: 0.75,
                assumptions: [
                    'Current growth rate continues',
                    'No major churn events',
                    'Seasonal factors accounted for'
                ]
            };

            // Apply seasonality
            forecast.next90Days *= seasonalityFactor;
            forecast.next12Months *= seasonalityFactor;

            // Adjust for risk factors
            const churnRisk = client.relationship?.churnRisk?.level || 'low';
            const riskAdjustment = {
                'low': 1.0,
                'medium': 0.95,
                'high': 0.85,
                'critical': 0.7
            };

            const adjustment = riskAdjustment[churnRisk] || 1.0;
            forecast.next90Days *= adjustment;
            forecast.next12Months *= adjustment;

            return forecast;
        } catch (error) {
            logger.error('Error generating revenue forecast', {
                error: error.message,
                clientId: client._id
            });
            return { next30Days: 0, next90Days: 0, next12Months: 0, confidence: 0 };
        }
    }

    /**
     * Calculate customer acquisition cost
     * @private
     * @param {Object} client - Client object
     * @returns {number} Customer acquisition cost
     */
    #calculateCustomerAcquisitionCost(client) {
        try {
            // Simplified CAC calculation
            const acquisitionSource = client.relationship?.acquisitionSource;
            const baseCosts = {
                'direct_sales': 5000,
                'referral': 1000,
                'marketing': 3000,
                'partner': 2000,
                'inbound': 1500
            };

            return baseCosts[acquisitionSource] || 3000;
        } catch (error) {
            logger.error('Error calculating CAC', {
                error: error.message,
                clientId: client._id
            });
            return 3000;
        }
    }

    /**
     * Calculate average contract length
     * @private
     * @param {Array} contracts - Client contracts
     * @returns {number} Average contract length in months
     */
    #calculateAverageContractLength(contracts) {
        try {
            if (!contracts || contracts.length === 0) return 12;

            const lengths = contracts.map(contract => {
                const start = new Date(contract.startDate);
                const end = new Date(contract.endDate);
                return Math.abs(end - start) / (1000 * 60 * 60 * 24 * 30); // Convert to months
            });

            return lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
        } catch (error) {
            logger.error('Error calculating average contract length', { error: error.message });
            return 12;
        }
    }

    /**
     * Calculate renewal probability
     * @private
     * @param {Object} client - Client object
     * @returns {number} Renewal probability (0-1)
     */
    #calculateRenewalProbability(client) {
        try {
            const healthScore = client.relationship?.healthScore?.score || 50;
            const satisfaction = client.relationship?.satisfactionScore?.nps || 0;
            const paymentHistory = client.billing?.paymentPerformance?.onTimeRate || 50;
            const engagement = client.analytics?.engagement?.score || 50;

            // Weighted probability model
            const probability = (
                (healthScore / 100) * 0.4 +
                ((satisfaction + 100) / 200) * 0.25 + // Convert NPS (-100 to +100) to 0-1 scale
                (paymentHistory / 100) * 0.2 +
                (engagement / 100) * 0.15
            );

            return Math.min(1, Math.max(0, probability));
        } catch (error) {
            logger.error('Error calculating renewal probability', {
                error: error.message,
                clientId: client._id
            });
            return 0.5;
        }
    }

    /**
     * Calculate trends across multiple metrics
     * @private
     * @param {Object} client - Client object
     * @param {Object} dateRange - Date range for trend analysis
     * @returns {Promise<Object>} Comprehensive trends analysis
     */
    async #calculateTrends(client, dateRange) {
        try {
            const trends = {};

            // Revenue trend
            const currentRevenue = client.analytics?.lifetime?.totalRevenue || 0;
            const previousRevenue = await this.#getPreviousPeriodRevenue(client, dateRange);
            trends.revenue = {
                current: currentRevenue,
                previous: previousRevenue,
                change: currentRevenue - previousRevenue,
                changePercent: previousRevenue > 0 ?
                    ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0,
                direction: this.#calculateTrend(currentRevenue, previousRevenue)
            };

            // Health score trend
            const currentHealth = client.relationship?.healthScore?.score || 0;
            const healthTrend = client.relationship?.healthScore?.trend || 'stable';
            trends.health = {
                current: currentHealth,
                trend: healthTrend,
                direction: healthTrend
            };

            // Engagement trend
            const engagementScore = client.analytics?.engagement?.score || 50;
            trends.engagement = {
                current: engagementScore,
                direction: engagementScore >= 70 ? 'increasing' :
                    engagementScore <= 40 ? 'decreasing' : 'stable'
            };

            // Project volume trend
            const activeProjects = client.analytics?.current?.activeProjects || 0;
            const totalProjects = client.analytics?.lifetime?.totalProjects || 0;
            trends.projects = {
                active: activeProjects,
                total: totalProjects,
                direction: activeProjects > 3 ? 'increasing' :
                    activeProjects === 0 ? 'decreasing' : 'stable'
            };

            return trends;
        } catch (error) {
            logger.error('Error calculating trends', {
                error: error.message,
                clientId: client._id
            });
            return {};
        }
    }

    /**
     * Generate comparisons with peer clients
     * @private
     * @param {Object} client - Client object
     * @param {Object} metrics - Current client metrics
     * @returns {Promise<Object>} Peer comparisons
     */
    async #generateComparisons(client, metrics) {
        try {
            const comparisons = {};

            // Find peer clients (same tier and industry)
            const peers = await ClientModel.find({
                'relationship.tier': client.relationship?.tier,
                'industry.primary.sector': client.industry?.primary?.sector,
                isDeleted: false,
                _id: { $ne: client._id }
            }).limit(20);

            if (peers.length === 0) {
                return { message: 'No peer clients found for comparison' };
            }

            // Calculate peer averages
            const peerMetrics = {
                performance: peers.reduce((sum, p) => sum + (p.analytics?.performance?.score || 0), 0) / peers.length,
                engagement: peers.reduce((sum, p) => sum + (p.analytics?.engagement?.score || 0), 0) / peers.length,
                healthScore: peers.reduce((sum, p) => sum + (p.relationship?.healthScore?.score || 0), 0) / peers.length,
                revenue: peers.reduce((sum, p) => sum + (p.analytics?.lifetime?.totalRevenue || 0), 0) / peers.length
            };

            // Generate comparisons
            if (metrics.performance) {
                comparisons.performance = {
                    clientScore: metrics.performance.score,
                    peerAverage: peerMetrics.performance,
                    percentile: this.#calculatePercentile(metrics.performance.score, peerMetrics.performance),
                    ranking: metrics.performance.score > peerMetrics.performance ? 'above_average' : 'below_average'
                };
            }

            if (metrics.engagement) {
                comparisons.engagement = {
                    clientScore: metrics.engagement.score,
                    peerAverage: peerMetrics.engagement,
                    percentile: this.#calculatePercentile(metrics.engagement.score, peerMetrics.engagement),
                    ranking: metrics.engagement.score > peerMetrics.engagement ? 'above_average' : 'below_average'
                };
            }

            comparisons.summary = {
                totalPeers: peers.length,
                tier: client.relationship?.tier,
                industry: client.industry?.primary?.sector
            };

            return comparisons;
        } catch (error) {
            logger.error('Error generating comparisons', {
                error: error.message,
                clientId: client._id
            });
            return {};
        }
    }

    /**
     * Calculate overall analytics score
     * @private
     * @param {Object} metrics - All client metrics
     * @returns {number} Overall score (0-100)
     */
    #calculateOverallScore(metrics) {
        try {
            const scores = [];
            const weights = [];

            if (metrics.performance?.score) {
                scores.push(metrics.performance.score);
                weights.push(0.3);
            }

            if (metrics.engagement?.score) {
                scores.push(metrics.engagement.score);
                weights.push(0.25);
            }

            if (metrics.financial?.revenue?.total) {
                // Normalize revenue to 0-100 scale (simplified)
                const normalizedRevenue = Math.min(100, (metrics.financial.revenue.total / 100000) * 50);
                scores.push(normalizedRevenue);
                weights.push(0.25);
            }

            if (metrics.retention?.score) {
                scores.push(metrics.retention.score);
                weights.push(0.2);
            }

            if (scores.length === 0) return 0;

            // Calculate weighted average
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);
            const weightedSum = scores.reduce((sum, score, index) => sum + (score * weights[index]), 0);

            return Math.round(weightedSum / totalWeight);
        } catch (error) {
            logger.error('Error calculating overall score', { error: error.message });
            return 0;
        }
    }

    /**
     * Format timeline data for display
     * @private
     * @param {Array} timelineData - Raw timeline data
     * @returns {Array} Formatted timeline
     */
    #formatTimeline(timelineData) {
        try {
            return timelineData.map(item => ({
                date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
                revenue: item.revenue || 0,
                projects: item.projectCount || 0,
                month: item._id.month,
                year: item._id.year
            })).sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return a.month - b.month;
            });
        } catch (error) {
            logger.error('Error formatting timeline', { error: error.message });
            return [];
        }
    }

    /**
     * Generate insights from aggregated analytics
     * @private
     * @param {Object} results - Aggregated results
     * @returns {Promise<Array>} Generated insights
     */
    async #generateAggregatedInsights(results) {
        try {
            const insights = [];

            // Revenue insights
            if (results.overview[0]?.totalRevenue) {
                const totalRevenue = results.overview[0].totalRevenue;
                const avgRevenue = results.overview[0].avgRevenue;

                if (totalRevenue > 1000000) {
                    insights.push({
                        type: 'revenue',
                        level: 'success',
                        title: 'Strong Revenue Performance',
                        description: `Total revenue of $${(totalRevenue / 1000000).toFixed(1)}M demonstrates strong market position.`
                    });
                }

                if (avgRevenue < 10000) {
                    insights.push({
                        type: 'revenue',
                        level: 'warning',
                        title: 'Low Average Revenue per Client',
                        description: 'Consider strategies to increase client value and upselling opportunities.'
                    });
                }
            }

            // Health score insights
            if (results.overview[0]?.avgHealthScore) {
                const avgHealth = results.overview[0].avgHealthScore;

                if (avgHealth < 60) {
                    insights.push({
                        type: 'health',
                        level: 'alert',
                        title: 'Low Average Health Score',
                        description: 'Client health scores indicate potential retention risks requiring immediate attention.'
                    });
                } else if (avgHealth > 80) {
                    insights.push({
                        type: 'health',
                        level: 'success',
                        title: 'Excellent Client Health',
                        description: 'Strong client health scores indicate good relationship management and satisfaction.'
                    });
                }
            }

            // Risk distribution insights
            if (results.riskDistribution) {
                const highRiskClients = results.riskDistribution
                    .filter(item => item._id === 'high' || item._id === 'critical')
                    .reduce((sum, item) => sum + item.count, 0);

                if (highRiskClients > 0) {
                    insights.push({
                        type: 'risk',
                        level: 'alert',
                        title: 'High-Risk Clients Detected',
                        description: `${highRiskClients} clients require immediate retention efforts.`
                    });
                }
            }

            return insights;
        } catch (error) {
            logger.error('Error generating aggregated insights', { error: error.message });
            return [];
        }
    }

    /**
     * Get benchmarks for comparison
     * @private
     * @param {string} groupBy - Grouping criteria
     * @returns {Promise<Object>} Benchmark data
     */
    async #getBenchmarks(groupBy) {
        try {
            const benchmarks = {
                groupBy,
                values: {}
            };

            switch (groupBy) {
                case 'tier':
                    benchmarks.values = {
                        strategic: { avgRevenue: 500000, avgHealthScore: 85, activeProjects: 15 },
                        enterprise: { avgRevenue: 200000, avgHealthScore: 75, activeProjects: 8 },
                        mid_market: { avgRevenue: 80000, avgHealthScore: 70, activeProjects: 4 },
                        small_business: { avgRevenue: 30000, avgHealthScore: 65, activeProjects: 2 }
                    };
                    break;
                case 'industry':
                    benchmarks.values = {
                        technology: { avgRevenue: 150000, avgHealthScore: 78 },
                        healthcare: { avgRevenue: 120000, avgHealthScore: 75 },
                        finance: { avgRevenue: 200000, avgHealthScore: 80 },
                        retail: { avgRevenue: 80000, avgHealthScore: 70 }
                    };
                    break;
                default:
                    benchmarks.values = {
                        overall: { avgRevenue: 100000, avgHealthScore: 75, activeProjects: 5 }
                    };
            }

            return benchmarks;
        } catch (error) {
            logger.error('Error getting benchmarks', { error: error.message });
            return { groupBy, values: {} };
        }
    }

    /**
     * Generate overview section for reports
     * @private
     * @param {Object} analytics - Analytics data
     * @param {Object} client - Client data
     * @returns {Object} Overview section
     */
    #generateOverviewSection(analytics, client) {
        return {
            title: 'Executive Summary',
            data: {
                clientInfo: {
                    name: client.companyName,
                    code: client.clientCode,
                    tier: client.relationship?.tier,
                    status: client.relationship?.status,
                    accountManager: client.relationship?.accountManager
                },
                keyMetrics: {
                    overallScore: analytics.overallScore,
                    healthScore: client.relationship?.healthScore?.score,
                    totalRevenue: analytics.metrics?.financial?.revenue?.total || 0,
                    activeProjects: client.analytics?.current?.activeProjects || 0
                },
                highlights: [
                    `Overall score: ${analytics.overallScore}/100`,
                    `Health score trend: ${client.relationship?.healthScore?.trend || 'stable'}`,
                    `Revenue growth: ${analytics.metrics?.financial?.revenue?.growth?.percentage || 0}%`
                ]
            }
        };
    }

    /**
     * Generate performance section for reports
     * @private
     * @param {Object} analytics - Analytics data
     * @returns {Object} Performance section
     */
    #generatePerformanceSection(analytics) {
        const performance = analytics.metrics?.performance || {};

        return {
            title: 'Performance Analysis',
            data: {
                overall: {
                    score: performance.score || 0,
                    trend: performance.trends?.overallTrend || 'stable'
                },
                components: performance.components || {},
                benchmarks: performance.benchmarks || {},
                recommendations: analytics.recommendations?.filter(r => r.category === 'performance') || []
            }
        };
    }

    /**
     * Generate financial section for reports
     * @private
     * @param {Object} analytics - Analytics data
     * @returns {Object} Financial section
     */
    #generateFinancialSection(analytics) {
        const financial = analytics.metrics?.financial || {};

        return {
            title: 'Financial Performance',
            data: {
                revenue: financial.revenue || {},
                profitability: financial.profitability || {},
                billing: financial.billing || {},
                forecast: financial.forecast || {},
                insights: [
                    `Total revenue: $${(financial.revenue?.total || 0).toLocaleString()}`,
                    `Revenue growth: ${financial.revenue?.growth?.percentage || 0}%`,
                    `Outstanding balance: $${(financial.billing?.outstandingBalance || 0).toLocaleString()}`
                ]
            }
        };
    }

    /**
     * Generate predictions section for reports
     * @private
     * @param {Object} analytics - Analytics data
     * @returns {Object} Predictions section
     */
    #generatePredictionsSection(analytics) {
        const predictions = analytics.predictions || {};

        return {
            title: 'Predictive Analytics',
            data: {
                churn: predictions.churn || {},
                growth: predictions.growth || {},
                upsell: predictions.upsell || {},
                risks: predictions.risks || [],
                opportunities: predictions.opportunities || [],
                summary: {
                    churnProbability: predictions.churn?.probability || 0,
                    growthPotential: predictions.growth?.expectedGrowth || 0,
                    upsellProbability: predictions.upsell?.probability || 0
                }
            }
        };
    }

    /**
     * Generate recommendations section for reports
     * @private
     * @param {Object} analytics - Analytics data
     * @returns {Object} Recommendations section
     */
    #generateRecommendationsSection(analytics) {
        const recommendations = analytics.recommendations || [];

        return {
            title: 'Strategic Recommendations',
            data: {
                immediate: recommendations.filter(r => r.priority === 'urgent' || r.priority === 'high'),
                strategic: recommendations.filter(r => r.priority === 'medium'),
                longTerm: recommendations.filter(r => r.priority === 'low'),
                summary: {
                    total: recommendations.length,
                    byCategory: _.countBy(recommendations, 'category'),
                    byPriority: _.countBy(recommendations, 'priority')
                }
            }
        };
    }

    /**
     * Generate charts for analytics
     * @private
     * @param {Object} analytics - Analytics data
     * @returns {Promise<Object>} Chart configurations
     */
    async #generateCharts(analytics) {
        try {
            const charts = {};

            // Performance radar chart
            if (analytics.metrics?.performance) {
                charts.performanceRadar = {
                    type: 'radar',
                    data: {
                        labels: ['Projects', 'Delivery', 'Quality', 'Utilization'],
                        datasets: [{
                            label: 'Performance Metrics',
                            data: [
                                analytics.metrics.performance.components?.projects?.score || 0,
                                analytics.metrics.performance.components?.delivery?.score || 0,
                                analytics.metrics.performance.components?.quality?.score || 0,
                                analytics.metrics.performance.components?.utilization?.score || 0
                            ]
                        }]
                    }
                };
            }

            // Revenue trend line chart
            if (analytics.trends?.revenue) {
                charts.revenueTrend = {
                    type: 'line',
                    data: {
                        labels: ['Previous Period', 'Current Period'],
                        datasets: [{
                            label: 'Revenue Trend',
                            data: [
                                analytics.trends.revenue.previous || 0,
                                analytics.trends.revenue.current || 0
                            ]
                        }]
                    }
                };
            }

            // Health score gauge
            if (analytics.metrics?.retention) {
                charts.healthGauge = {
                    type: 'doughnut',
                    data: {
                        labels: ['Health Score', 'Remaining'],
                        datasets: [{
                            data: [
                                analytics.metrics.retention.indicators?.satisfaction?.healthScore || 0,
                                100 - (analytics.metrics.retention.indicators?.satisfaction?.healthScore || 0)
                            ]
                        }]
                    }
                };
            }

            return charts;
        } catch (error) {
            logger.error('Error generating charts', { error: error.message });
            return {};
        }
    }

    /**
     * Generate Excel report
     * @private
     * @param {Object} report - Report data
     * @returns {Promise<Buffer>} Excel buffer
     */
    async #generateExcelReport(report) {
        try {
            const workbook = new ExcelJS.Workbook();

            // Overview sheet
            const overviewSheet = workbook.addWorksheet('Overview');
            overviewSheet.columns = [
                { header: 'Metric', key: 'metric', width: 30 },
                { header: 'Value', key: 'value', width: 20 }
            ];

            if (report.sections.overview) {
                const overview = report.sections.overview.data;
                overviewSheet.addRow({ metric: 'Client Name', value: overview.clientInfo?.name });
                overviewSheet.addRow({ metric: 'Client Code', value: overview.clientInfo?.code });
                overviewSheet.addRow({ metric: 'Overall Score', value: overview.keyMetrics?.overallScore });
                overviewSheet.addRow({ metric: 'Health Score', value: overview.keyMetrics?.healthScore });
                overviewSheet.addRow({ metric: 'Total Revenue', value: overview.keyMetrics?.totalRevenue });
            }

            // Performance sheet
            if (report.sections.performance) {
                const perfSheet = workbook.addWorksheet('Performance');
                perfSheet.columns = [
                    { header: 'Component', key: 'component', width: 25 },
                    { header: 'Score', key: 'score', width: 15 },
                    { header: 'Trend', key: 'trend', width: 15 }
                ];

                const components = report.sections.performance.data.components || {};
                Object.entries(components).forEach(([key, value]) => {
                    perfSheet.addRow({
                        component: key.charAt(0).toUpperCase() + key.slice(1),
                        score: value.score || 0,
                        trend: value.trend || 'stable'
                    });
                });
            }

            // Style the headers
            workbook.worksheets.forEach(worksheet => {
                worksheet.getRow(1).font = { bold: true };
                worksheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF4A90E2' }
                };
            });

            return await workbook.xlsx.writeBuffer();
        } catch (error) {
            logger.error('Error generating Excel report', { error: error.message });
            throw new AppError('Failed to generate Excel report', 'EXCEL_GENERATION_FAILED');
        }
    }

    /**
     * Generate PDF report
     * @private
     * @param {Object} report - Report data
     * @returns {Promise<Buffer>} PDF buffer
     */
    async #generatePDFReport(report) {
        try {
            // Simplified PDF generation - in production, use a proper PDF library like PDFKit
            const htmlContent = `
        <html>
          <head>
            <title>Client Analytics Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .header { border-bottom: 2px solid #4A90E2; padding-bottom: 20px; }
              .section { margin-top: 30px; }
              .metric { display: flex; justify-content: space-between; padding: 10px; background: #f5f5f5; margin: 5px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Client Analytics Report</h1>
              <p>Generated: ${report.metadata.generatedAt}</p>
              <p>Client: ${report.client.companyName} (${report.client.clientCode})</p>
            </div>
            
            ${Object.entries(report.sections || {}).map(([key, section]) => `
              <div class="section">
                <h2>${section.title}</h2>
                <div>${JSON.stringify(section.data, null, 2)}</div>
              </div>
            `).join('')}
          </body>
        </html>
      `;

            // Convert HTML to PDF (simplified - use puppeteer or similar in production)
            return Buffer.from(htmlContent);
        } catch (error) {
            logger.error('Error generating PDF report', { error: error.message });
            throw new AppError('Failed to generate PDF report', 'PDF_GENERATION_FAILED');
        }
    }

    /**
     * Export analytics to CSV
     * @private
     * @param {Object} data - Analytics data to export
     * @returns {Promise<Buffer>} CSV buffer
     */
    async #exportToCSV(data) {
        try {
            const rows = [];
            rows.push(['Metric', 'Category', 'Value', 'Trend', 'Benchmark']);

            // Extract metrics for CSV export
            if (data.metrics) {
                Object.entries(data.metrics).forEach(([category, metrics]) => {
                    if (metrics.score !== undefined) {
                        rows.push([
                            'Overall Score',
                            category,
                            metrics.score,
                            metrics.trend || 'stable',
                            metrics.benchmark || 'N/A'
                        ]);
                    }

                    if (metrics.components) {
                        Object.entries(metrics.components).forEach(([component, values]) => {
                            if (values.score !== undefined) {
                                rows.push([
                                    component,
                                    category,
                                    values.score,
                                    values.trend || 'stable',
                                    values.benchmark || 'N/A'
                                ]);
                            }
                        });
                    }
                });
            }

            const csvContent = rows.map(row =>
                row.map(cell =>
                    typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
                ).join(',')
            ).join('\n');

            return Buffer.from(csvContent);
        } catch (error) {
            logger.error('Error exporting to CSV', { error: error.message });
            throw new AppError('Failed to export to CSV', 'CSV_EXPORT_FAILED');
        }
    }

    /**
     * Get trends data for dashboard
     * @private
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Trends data
     */
    async #getTrendsData(filters, options) {
        try {
            const { tenantId, dateRange } = options;

            // Generate mock trend data - replace with actual implementation
            const trendData = [];
            const days = Math.floor((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24));

            for (let i = 0; i < days; i++) {
                const date = new Date(dateRange.start);
                date.setDate(date.getDate() + i);

                trendData.push({
                    date: date.toISOString().split('T')[0],
                    revenue: Math.random() * 10000,
                    healthScore: 70 + (Math.random() * 20),
                    engagement: 60 + (Math.random() * 30),
                    activeProjects: Math.floor(Math.random() * 10)
                });
            }

            return {
                timeline: trendData,
                summary: {
                    totalDataPoints: trendData.length,
                    averageHealthScore: trendData.reduce((sum, d) => sum + d.healthScore, 0) / trendData.length,
                    totalRevenue: trendData.reduce((sum, d) => sum + d.revenue, 0)
                }
            };
        } catch (error) {
            logger.error('Error getting trends data', { error: error.message });
            return { timeline: [], summary: {} };
        }
    }

    /**
     * Get distribution data for dashboard
     * @private
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Distribution data
     */
    async #getDistributionData(filters, options) {
        try {
            const { tenantId } = options;

            const distributions = await ClientModel.aggregate([
                {
                    $match: {
                        tenantId,
                        isDeleted: false,
                        ...filters
                    }
                },
                {
                    $facet: {
                        byTier: [
                            {
                                $group: {
                                    _id: '$relationship.tier',
                                    count: { $sum: 1 },
                                    totalRevenue: { $sum: '$analytics.lifetime.totalRevenue' }
                                }
                            }
                        ],
                        byIndustry: [
                            {
                                $group: {
                                    _id: '$industry.primary.sector',
                                    count: { $sum: 1 },
                                    avgHealthScore: { $avg: '$relationship.healthScore.score' }
                                }
                            }
                        ],
                        byHealthScore: [
                            {
                                $bucket: {
                                    groupBy: '$relationship.healthScore.score',
                                    boundaries: [0, 25, 50, 75, 100],
                                    default: 'Unknown',
                                    output: {
                                        count: { $sum: 1 },
                                        avgRevenue: { $avg: '$analytics.lifetime.totalRevenue' }
                                    }
                                }
                            }
                        ]
                    }
                }
            ]);

            return distributions[0] || { byTier: [], byIndustry: [], byHealthScore: [] };
        } catch (error) {
            logger.error('Error getting distribution data', { error: error.message });
            return { byTier: [], byIndustry: [], byHealthScore: [] };
        }
    }

    /**
     * Get alerts data for dashboard
     * @private
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Alerts data
     */
    async #getAlertsData(filters, options) {
        try {
            const { tenantId } = options;

            const alerts = [];

            // Get high-risk clients
            const highRiskClients = await ClientModel.find({
                tenantId,
                'relationship.churnRisk.level': { $in: ['high', 'critical'] },
                isDeleted: false
            }).select('clientCode companyName relationship.churnRisk');

            highRiskClients.forEach(client => {
                alerts.push({
                    type: 'churn_risk',
                    level: client.relationship.churnRisk.level === 'critical' ? 'critical' : 'warning',
                    title: 'High Churn Risk',
                    message: `${client.companyName} (${client.clientCode}) has ${client.relationship.churnRisk.level} churn risk`,
                    clientId: client._id,
                    timestamp: new Date()
                });
            });

            // Get clients with low health scores
            const lowHealthClients = await ClientModel.find({
                tenantId,
                'relationship.healthScore.score': { $lt: 50 },
                isDeleted: false
            }).limit(5).select('clientCode companyName relationship.healthScore');

            lowHealthClients.forEach(client => {
                alerts.push({
                    type: 'health_score',
                    level: 'warning',
                    title: 'Low Health Score',
                    message: `${client.companyName} health score: ${client.relationship.healthScore?.score || 0}`,
                    clientId: client._id,
                    timestamp: new Date()
                });
            });

            // Get overdue payments
            const overdueClients = await ClientModel.find({
                tenantId,
                'billing.outstandingBalance': { $gt: 0 },
                'billing.paymentPerformance.averageDaysToPayment': { $gt: 60 },
                isDeleted: false
            }).limit(5).select('clientCode companyName billing.outstandingBalance');

            overdueClients.forEach(client => {
                alerts.push({
                    type: 'payment',
                    level: 'warning',
                    title: 'Payment Overdue',
                    message: `${client.companyName} has outstanding balance: $${client.billing.outstandingBalance?.toLocaleString()}`,
                    clientId: client._id,
                    timestamp: new Date()
                });
            });

            return {
                alerts: alerts.sort((a, b) => b.timestamp - a.timestamp),
                summary: {
                    total: alerts.length,
                    critical: alerts.filter(a => a.level === 'critical').length,
                    warning: alerts.filter(a => a.level === 'warning').length,
                    info: alerts.filter(a => a.level === 'info').length
                }
            };
        } catch (error) {
            logger.error('Error getting alerts data', { error: error.message });
            return { alerts: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } };
        }
    }

    /**
     * Get top performing clients
     * @private
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Top performers
     */
    async #getTopPerformers(filters, options) {
        try {
            const { tenantId } = options;

            const topPerformers = await ClientModel.find({
                tenantId,
                isDeleted: false,
                'relationship.status': 'active',
                ...filters
            })
                .sort({ 'analytics.lifetime.totalRevenue': -1 })
                .limit(10)
                .select('clientCode companyName analytics.lifetime.totalRevenue relationship.healthScore.score relationship.tier');

            return topPerformers.map(client => ({
                clientId: client._id,
                clientCode: client.clientCode,
                companyName: client.companyName,
                totalRevenue: client.analytics?.lifetime?.totalRevenue || 0,
                healthScore: client.relationship?.healthScore?.score || 0,
                tier: client.relationship?.tier,
                rank: topPerformers.indexOf(client) + 1
            }));
        } catch (error) {
            logger.error('Error getting top performers', { error: error.message });
            return [];
        }
    }

    /**
     * Get at-risk clients
     * @private
     * @param {Object} filters - Dashboard filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} At-risk clients
     */
    async #getAtRiskClients(filters, options) {
        try {
            const { tenantId } = options;

            const atRiskClients = await ClientModel.find({
                tenantId,
                isDeleted: false,
                $or: [
                    { 'relationship.churnRisk.level': { $in: ['high', 'critical'] } },
                    { 'relationship.healthScore.score': { $lt: 50 } },
                    { 'billing.paymentPerformance.averageDaysToPayment': { $gt: 60 } }
                ],
                ...filters
            })
                .sort({ 'relationship.churnRisk.score': -1 })
                .limit(10)
                .select('clientCode companyName relationship analytics.lifetime.totalRevenue');

            return atRiskClients.map(client => ({
                clientId: client._id,
                clientCode: client.clientCode,
                companyName: client.companyName,
                riskLevel: client.relationship?.churnRisk?.level || 'unknown',
                riskScore: client.relationship?.churnRisk?.score || 0,
                healthScore: client.relationship?.healthScore?.score || 0,
                totalRevenue: client.analytics?.lifetime?.totalRevenue || 0,
                riskFactors: client.relationship?.churnRisk?.factors || []
            }));
        } catch (error) {
            logger.error('Error getting at-risk clients', { error: error.message });
            return [];
        }
    }

    /**
     * Calculate percentile for benchmarking
     * @private
     * @param {number} value - Value to calculate percentile for
     * @param {number} benchmark - Benchmark value
     * @returns {number} Percentile (0-100)
     */
    #calculatePercentile(value, benchmark) {
        if (benchmark === 0) return value > 0 ? 100 : 50;
        const ratio = value / benchmark;
        return Math.min(100, Math.max(0, ratio * 50 + 25));
    }

    /**
     * Calculate lifetime value
     * @private
     */
    #calculateLifetimeValue(client) {
        const avgRevenue = client.analytics.current.monthlyRecurringRevenue || 0;
        const retentionRate = 0.85; // Assumed 85% retention
        const months = 1 / (1 - retentionRate); // Expected lifetime in months
        return avgRevenue * months;
    }

    /**
     * Check if factor is negative
     * @private
     */
    #isNegativeFactor(key, value) {
        const negativeThresholds = {
            healthScore: 50,
            satisfactionScore: 0,
            supportTickets: 10,
            paymentDelay: 30
        };

        if (negativeThresholds[key] !== undefined) {
            return value < negativeThresholds[key];
        }

        if (key === 'engagementTrend') return value === 'decreasing';

        return false;
    }
}

module.exports = ClientAnalyticsService;