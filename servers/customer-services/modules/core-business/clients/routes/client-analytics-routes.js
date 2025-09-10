'use strict';

/**
 * @fileoverview Comprehensive client analytics and reporting routes
 * @module servers/customer-services/modules/core-business/clients/routes/client-analytics-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/clients/controllers/client-analytics-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // Important: mergeParams to access parent route params
const ClientAnalyticsController = require('../controllers/client-analytics-controller');
// const ClientAnalyticsValidators = require('../validators/client-analytics-validators');
// const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
// const {
//   createLimiter,
//   limitByIP,
//   limitByUser,
//   limitByEndpoint,
//   combinedLimit,
//   customLimit,
//   costBasedLimit,
//   adaptiveLimit
// } = require('../../../../../shared/lib/auth/middleware/rate-limit');
// const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
// const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Advanced rate limiting configurations for analytics operations
 */
const RATE_LIMITS = {
  // Default rate limiting for analytics operations
  default: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100,
    message: 'Too many analytics requests, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Real-time analytics with higher limits
  realtime: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,
    message: 'Real-time analytics rate limit exceeded.',
    headers: true
  },
  
  // Report generation with cost-based limiting
  reports: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 5000,
    message: 'Report generation rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id}_reports`
  },
  
  // Export operations
  export: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 3000,
    message: 'Analytics export rate limit exceeded.',
    headers: true
  },
  
  // Dashboard operations
  dashboard: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50,
    message: 'Dashboard request rate limit exceeded.',
    headers: true
  },
  
  // Predictive analytics
  predictive: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 8000,
    message: 'Predictive analytics rate limit exceeded.',
    headers: true
  },
  
  // Aggregation operations
  aggregation: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 6000,
    message: 'Analytics aggregation rate limit exceeded.',
    headers: true
  }
};

/**
 * Cost calculator for analytics operations
 */
const calculateAnalyticsCost = (req) => {
  let cost = 30; // Base cost for analytics
  
  // Path-based cost calculation
  const pathCosts = {
    'predictive': 150,
    'forecast': 150,
    'aggregated': 100,
    'comparison': 80,
    'benchmark': 90,
    'trend': 70,
    'correlation': 100,
    'report': 120,
    'export': 80,
    'custom': 100
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Date range cost calculation
  if (req.query.dateFrom && req.query.dateTo) {
    const daysDiff = Math.ceil((new Date(req.query.dateTo) - new Date(req.query.dateFrom)) / (1000 * 60 * 60 * 24));
    if (daysDiff > 90) cost += Math.ceil(daysDiff / 30) * 20;
    if (daysDiff > 365) cost += 100;
  }
  
  // Metrics and dimensions
  if (req.query.metrics) {
    const metricsCount = req.query.metrics.split(',').length;
    cost += metricsCount * 10;
  }
  
  if (req.query.dimensions) {
    const dimensionsCount = req.query.dimensions.split(',').length;
    cost += dimensionsCount * 15;
  }
  
  // Include options
  if (req.query.includeComparisons === 'true') cost += 50;
  if (req.query.includePredictions === 'true') cost += 80;
  if (req.query.includeBenchmarks === 'true') cost += 60;
  if (req.query.includeRecommendations === 'true') cost += 40;
  
  return Math.min(cost, 15000); // Cap at 15000
};

/**
 * Analytics operation logger
 */
const analyticsOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        clientId: req.params.clientId || req.clientContext?.clientId,
        dateRange: {
          from: req.query.dateFrom,
          to: req.query.dateTo
        },
        metrics: req.query.metrics,
        dimensions: req.query.dimensions,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      };

      // logger.info(`Analytics operation initiated: ${operation}`, operationMetadata);

      req.analyticsOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log analytics operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Middleware to validate analytics access
 */
const validateAnalyticsAccess = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Analytics-specific access rules
    const analyticsRoles = ['admin', 'manager', 'analyst', 'viewer'];
    const analyticsPermissions = ['clients.analytics', 'analytics.read'];
    
    if (!analyticsRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient role for analytics access',
        required: analyticsRoles
      });
    }
    
    const hasPermission = analyticsPermissions.some(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasPermission && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for analytics access',
        required: analyticsPermissions
      });
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to validate analytics access', {
    //   error: error.message
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Access validation failed'
    });
  }
};

/**
 * Middleware to process analytics parameters
 */
const processAnalyticsParams = (req, res, next) => {
  try {
    // Set default date range if not provided
    if (!req.query.dateFrom) {
      req.query.dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (!req.query.dateTo) {
      req.query.dateTo = new Date().toISOString();
    }
    
    // Validate date range
    const dateFrom = new Date(req.query.dateFrom);
    const dateTo = new Date(req.query.dateTo);
    
    if (dateFrom >= dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range: dateFrom must be before dateTo'
      });
    }
    
    // Process granularity
    const validGranularities = ['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    if (req.query.granularity && !validGranularities.includes(req.query.granularity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid granularity. Valid options: ${validGranularities.join(', ')}`
      });
    }
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid analytics parameters'
    });
  }
};

/**
 * ===============================================================================
 * CORE ANALYTICS ROUTES
 * ===============================================================================
 */

// Get comprehensive client analytics
router.get(
  '/',
  // authorize(['admin', 'manager', 'analyst', 'viewer']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
  processAnalyticsParams,
  // ClientAnalyticsValidators.validateAnalyticsQuery,
  analyticsOperationLogger('get-analytics'),
  ClientAnalyticsController.getClientAnalytics
);

// Get aggregated analytics across multiple clients
router.get(
  '/aggregated',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.aggregation),
  processAnalyticsParams,
  analyticsOperationLogger('get-aggregated-analytics'),
  ClientAnalyticsController.getAggregatedAnalytics
);

// Get dashboard data
router.get(
  '/dashboard',
  // authorize(['admin', 'manager', 'analyst', 'viewer']),
  validateAnalyticsAccess,
  // limitByUser(RATE_LIMITS.dashboard),
  processAnalyticsParams,
  analyticsOperationLogger('get-dashboard'),
  ClientAnalyticsController.getDashboardData
);

/**
 * ===============================================================================
 * PERFORMANCE METRICS ROUTES
 * ===============================================================================
 */

// Get performance metrics
router.get(
  '/performance',
  // authorize(['admin', 'manager', 'analyst', 'viewer']),
  validateAnalyticsAccess,
  // limitByUser(RATE_LIMITS.default),
  processAnalyticsParams,
  analyticsOperationLogger('get-performance-metrics'),
  ClientAnalyticsController.getPerformanceMetrics
);

// Get engagement metrics
// router.get(
//   '/engagement',
//   // authorize(['admin', 'manager', 'analyst', 'viewer']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-engagement-metrics'),
//   ClientAnalyticsController.getEngagementMetrics
// );

// // Get financial metrics
// router.get(
//   '/financial',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-financial-metrics'),
//   ClientAnalyticsController.getFinancialMetrics
// );

// // Get retention metrics
// router.get(
//   '/retention',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-retention-metrics'),
//   ClientAnalyticsController.getRetentionMetrics
// );

/**
 * ===============================================================================
 * PREDICTIVE ANALYTICS ROUTES
 * ===============================================================================
 */

// Get predictive insights
router.get(
  '/predictions',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.predictive),
  processAnalyticsParams,
  analyticsOperationLogger('get-predictions'),
  ClientAnalyticsController.getPredictiveInsights
);

// Get churn analysis
// router.get(
//   '/churn-analysis',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.predictive),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-churn-analysis'),
//   ClientAnalyticsController.getChurnAnalysis
// );

// // Get growth predictions
// router.get(
//   '/growth-predictions',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.predictive),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-growth-predictions'),
//   ClientAnalyticsController.getGrowthPredictions
// );

// // Get upsell opportunities
// router.get(
//   '/upsell-opportunities',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.predictive),
//   analyticsOperationLogger('get-upsell-opportunities'),
//   ClientAnalyticsController.getUpsellOpportunities
// );

/**
 * ===============================================================================
 * COMPARATIVE ANALYTICS ROUTES
 * ===============================================================================
 */

// Get client comparisons
// router.get(
//   '/comparisons',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
//   processAnalyticsParams,
//   // ClientAnalyticsValidators.validateComparison,
//   analyticsOperationLogger('get-comparisons'),
//   ClientAnalyticsController.getClientComparisons
// );

// // Get industry benchmarks
// router.get(
//   '/benchmarks',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-benchmarks'),
//   ClientAnalyticsController.getIndustryBenchmarks
// );

// Get competitive analysis
// router.get(
//   '/competitive',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-competitive-analysis'),
//   ClientAnalyticsController.getCompetitiveAnalysis
// );

/**
 * ===============================================================================
 * TREND ANALYSIS ROUTES
 * ===============================================================================
 */

// Get trend analysis
// router.get(
//   '/trends',
//   // authorize(['admin', 'manager', 'analyst', 'viewer']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-trends'),
//   ClientAnalyticsController.getTrendAnalysis
// );

// Get health score analytics
router.get(
  '/health-scores',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // limitByUser(RATE_LIMITS.default),
  processAnalyticsParams,
  analyticsOperationLogger('get-health-scores'),
  ClientAnalyticsController.getHealthScoreAnalytics
);

// Get revenue analytics
// router.get(
//   '/revenue',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-revenue-analytics'),
//   ClientAnalyticsController.getRevenueAnalytics
// );

/**
 * ===============================================================================
 * PORTFOLIO ANALYTICS ROUTES
 * ===============================================================================
 */

// Get portfolio analytics
// router.get(
//   '/portfolio',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.aggregation),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-portfolio-analytics'),
//   ClientAnalyticsController.getPortfolioAnalytics
// );

// // Get client scorecard
// router.get(
//   '/scorecard',
//   // authorize(['admin', 'manager', 'analyst', 'viewer']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-scorecard'),
//   ClientAnalyticsController.getClientScorecard
// );

// // Get risk assessment
// router.get(
//   '/risk-assessment',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
//   processAnalyticsParams,
//   analyticsOperationLogger('get-risk-assessment'),
//   ClientAnalyticsController.getRiskAssessment
// );

/**
 * ===============================================================================
 * CUSTOM ANALYTICS ROUTES
 * ===============================================================================
 */

// Get custom metrics
// router.post(
//   '/custom-metrics',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.default),
//   // ClientAnalyticsValidators.validateCustomMetrics,
//   analyticsOperationLogger('get-custom-metrics'),
//   ClientAnalyticsController.getCustomMetrics
// );

// Create custom report
router.post(
  '/custom-report',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.reports),
  // ClientAnalyticsValidators.validateCustomReport,
  analyticsOperationLogger('create-custom-report'),
  ClientAnalyticsController.createCustomReport
);

/**
 * ===============================================================================
 * REPORTING ROUTES
 * ===============================================================================
 */

// Generate analytics report
router.post(
  '/report/generate',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.reports),
  // ClientAnalyticsValidators.validateReportGeneration,
  analyticsOperationLogger('generate-report'),
  ClientAnalyticsController.generateAnalyticsReport
);

// // Schedule report
// router.post(
//   '/report/schedule',
//   // authorize(['admin', 'manager']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   // ClientAnalyticsValidators.validateReportSchedule,
//   analyticsOperationLogger('schedule-report'),
//   ClientAnalyticsController.scheduleReport
// );

// // Get report history
// router.get(
//   '/report/history',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   ClientAnalyticsController.getReportHistory
// );

/**
 * ===============================================================================
 * EXPORT ROUTES
 * ===============================================================================
 */

// Export analytics data
router.get(
  '/export',
  // authorize(['admin', 'manager', 'analyst']),
  validateAnalyticsAccess,
  // costBasedLimit(calculateAnalyticsCost, RATE_LIMITS.export),
  processAnalyticsParams,
  analyticsOperationLogger('export-analytics'),
  ClientAnalyticsController.exportAnalytics
);

/**
 * ===============================================================================
 * ALERT AND NOTIFICATION ROUTES
 * ===============================================================================
 */

// Get alert metrics
// router.get(
//   '/alerts',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   ClientAnalyticsController.getAlertMetrics
// );

// // Get notification metrics
// router.get(
//   '/notifications',
//   // authorize(['admin', 'manager', 'analyst']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   ClientAnalyticsController.getContactNotifications
// );

/**
 * ===============================================================================
 * SETTINGS AND CONFIGURATION ROUTES
 * ===============================================================================
 */

// // Update analytics settings
// router.put(
//   '/settings',
//   // authorize(['admin', 'manager']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   // ClientAnalyticsValidators.validateSettings,
//   analyticsOperationLogger('update-settings'),
//   ClientAnalyticsController.updateAnalyticsSettings
// );

// // Refresh analytics cache
// router.post(
//   '/refresh',
//   // authorize(['admin', 'manager']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   analyticsOperationLogger('refresh-cache'),
//   ClientAnalyticsController.refreshAnalyticsCache
// );

// // Get analytics metadata
// router.get(
//   '/metadata',
//   // authorize(['admin', 'manager', 'analyst', 'viewer']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   ClientAnalyticsController.getAnalyticsMetadata
// );

// // Validate analytics data
// router.post(
//   '/validate',
//   // authorize(['admin', 'manager']),
//   validateAnalyticsAccess,
//   // limitByUser(RATE_LIMITS.default),
//   analyticsOperationLogger('validate-data'),
//   ClientAnalyticsController.validateAnalyticsData
// );

/**
 * ===============================================================================
 * ERROR HANDLING MIDDLEWARE
 * ===============================================================================
 */
router.use((err, req, res, next) => {
  const errorContext = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    clientId: req.params?.clientId || req.clientContext?.clientId,
    analyticsOperation: req.analyticsOperationContext?.operation,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Analytics route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'ANALYTICS_ERROR',
      message: err.message || 'Analytics operation failed',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;