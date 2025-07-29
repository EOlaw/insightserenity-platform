'use strict';

/**
 * @fileoverview Enterprise-grade analytics service for tracking events, metrics, and KPIs
 * @module shared/lib/services/analytics-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/config
 */

const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const CacheService = require('./cache-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class AnalyticsService
 * @description Comprehensive analytics service for tracking, aggregating, and reporting metrics
 */
class AnalyticsService {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #providers = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #eventSchemas = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Function>}
   */
  static #processors = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #metrics = new Map();

  /**
   * @private
   * @static
   * @type {Set<Object>}
   */
  static #eventQueue = new Set();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @type {NodeJS.Timeout}
   */
  static #flushInterval;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #EVENT_TYPES = {
    // User events
    USER_SIGNUP: 'user.signup',
    USER_LOGIN: 'user.login',
    USER_LOGOUT: 'user.logout',
    USER_PROFILE_UPDATE: 'user.profile.update',
    USER_PASSWORD_CHANGE: 'user.password.change',
    
    // Page/Screen events
    PAGE_VIEW: 'page.view',
    SCREEN_VIEW: 'screen.view',
    
    // Interaction events
    BUTTON_CLICK: 'button.click',
    LINK_CLICK: 'link.click',
    FORM_SUBMIT: 'form.submit',
    SEARCH: 'search',
    
    // Business events
    PROJECT_CREATE: 'project.create',
    PROJECT_UPDATE: 'project.update',
    PROJECT_COMPLETE: 'project.complete',
    
    // Revenue events
    PAYMENT_INITIATED: 'payment.initiated',
    PAYMENT_COMPLETED: 'payment.completed',
    PAYMENT_FAILED: 'payment.failed',
    SUBSCRIPTION_START: 'subscription.start',
    SUBSCRIPTION_CANCEL: 'subscription.cancel',
    
    // Performance events
    API_REQUEST: 'api.request',
    PAGE_LOAD: 'page.load',
    ERROR: 'error',
    
    // Custom events
    CUSTOM: 'custom'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #METRIC_TYPES = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    SUMMARY: 'summary'
  };

  /**
   * Initialize analytics service
   * @static
   * @param {Object} [options] - Configuration options
   * @returns {Promise<void>}
   */
  static async initialize(options = {}) {
    if (this.#initialized) {
      return;
    }

    try {
      this.#config = {
        providers: {
          internal: { enabled: true },
          googleAnalytics: { 
            enabled: config.analytics?.googleAnalytics?.enabled || false,
            trackingId: config.analytics?.googleAnalytics?.trackingId,
            ...options.providers?.googleAnalytics
          },
          mixpanel: {
            enabled: config.analytics?.mixpanel?.enabled || false,
            token: config.analytics?.mixpanel?.token,
            ...options.providers?.mixpanel
          },
          segment: {
            enabled: config.analytics?.segment?.enabled || false,
            writeKey: config.analytics?.segment?.writeKey,
            ...options.providers?.segment
          }
        },
        batching: {
          enabled: true,
          batchSize: 100,
          flushInterval: 30000, // 30 seconds
          ...config.analytics?.batching,
          ...options.batching
        },
        sampling: {
          enabled: config.analytics?.sampling?.enabled || false,
          rate: config.analytics?.sampling?.rate || 1.0,
          ...options.sampling
        },
        privacy: {
          anonymizeIp: true,
          excludePii: true,
          gdprCompliant: true,
          ...config.analytics?.privacy,
          ...options.privacy
        },
        retention: {
          raw: 30, // days
          aggregated: 365, // days
          ...config.analytics?.retention,
          ...options.retention
        },
        realtime: {
          enabled: true,
          windowSize: 300000, // 5 minutes
          ...options.realtime
        },
        ...options
      };

      // Initialize services
      this.#cacheService = new CacheService({ namespace: 'analytics' });
      
      // Initialize providers
      await this.#initializeProviders();
      
      // Register default schemas
      this.#registerDefaultSchemas();
      
      // Register default processors
      this.#registerDefaultProcessors();
      
      // Start batch processor
      if (this.#config.batching.enabled) {
        this.#startBatchProcessor();
      }

      this.#initialized = true;
      logger.info('AnalyticsService initialized', {
        providers: Array.from(this.#providers.keys()),
        schemas: this.#eventSchemas.size
      });

    } catch (error) {
      logger.error('Failed to initialize AnalyticsService', { error: error.message });
      throw new AppError(
        'Analytics service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Track analytics event
   * @static
   * @param {Object} options - Event options
   * @param {string} options.event - Event name
   * @param {Object} [options.properties] - Event properties
   * @param {string} [options.userId] - User ID
   * @param {string} [options.sessionId] - Session ID
   * @param {string} [options.organizationId] - Organization ID
   * @param {Object} [options.context] - Event context
   * @param {Date} [options.timestamp] - Event timestamp
   * @returns {Promise<Object>} Tracking result
   */
  static async track(options) {
    await this.initialize();

    const eventId = this.#generateEventId();
    
    try {
      // Validate and enrich event
      const event = await this.#validateAndEnrichEvent(options);
      
      // Apply sampling
      if (!this.#shouldSample(event)) {
        return { eventId, sampled: false };
      }

      // Check privacy settings
      if (this.#config.privacy.excludePii) {
        event.properties = this.#removePii(event.properties);
      }

      // Process event through processors
      const processed = await this.#processEvent(event);
      
      // Add to queue or send immediately
      if (this.#config.batching.enabled) {
        this.#eventQueue.add(processed);
        
        if (this.#eventQueue.size >= this.#config.batching.batchSize) {
          await this.#flushEvents();
        }
      } else {
        await this.#sendEvent(processed);
      }

      // Update real-time metrics
      if (this.#config.realtime.enabled) {
        await this.#updateRealtimeMetrics(processed);
      }

      logger.debug('Event tracked', {
        eventId,
        event: event.event,
        userId: event.userId
      });

      return {
        eventId,
        tracked: true,
        timestamp: event.timestamp
      };

    } catch (error) {
      logger.error('Event tracking failed', {
        eventId,
        error: error.message,
        event: options.event
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to track event',
        500,
        ERROR_CODES.ANALYTICS_TRACKING_FAILED,
        { eventId, originalError: error.message }
      );
    }
  }

  /**
   * Track page view
   * @static
   * @param {Object} options - Page view options
   * @returns {Promise<Object>} Tracking result
   */
  static async trackPageView(options) {
    return this.track({
      event: this.#EVENT_TYPES.PAGE_VIEW,
      properties: {
        url: options.url,
        title: options.title,
        referrer: options.referrer,
        ...options.properties
      },
      userId: options.userId,
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      context: options.context
    });
  }

  /**
   * Track user action
   * @static
   * @param {Object} options - User action options
   * @returns {Promise<Object>} Tracking result
   */
  static async trackUserAction(options) {
    const eventMap = {
      signup: this.#EVENT_TYPES.USER_SIGNUP,
      login: this.#EVENT_TYPES.USER_LOGIN,
      logout: this.#EVENT_TYPES.USER_LOGOUT,
      profileUpdate: this.#EVENT_TYPES.USER_PROFILE_UPDATE,
      passwordChange: this.#EVENT_TYPES.USER_PASSWORD_CHANGE
    };

    return this.track({
      event: eventMap[options.action] || this.#EVENT_TYPES.CUSTOM,
      properties: options.properties,
      userId: options.userId,
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      context: options.context
    });
  }

  /**
   * Track revenue event
   * @static
   * @param {Object} options - Revenue event options
   * @returns {Promise<Object>} Tracking result
   */
  static async trackRevenue(options) {
    const eventMap = {
      initiated: this.#EVENT_TYPES.PAYMENT_INITIATED,
      completed: this.#EVENT_TYPES.PAYMENT_COMPLETED,
      failed: this.#EVENT_TYPES.PAYMENT_FAILED,
      subscriptionStart: this.#EVENT_TYPES.SUBSCRIPTION_START,
      subscriptionCancel: this.#EVENT_TYPES.SUBSCRIPTION_CANCEL
    };

    return this.track({
      event: eventMap[options.type] || this.#EVENT_TYPES.CUSTOM,
      properties: {
        amount: options.amount,
        currency: options.currency || 'USD',
        productId: options.productId,
        productName: options.productName,
        quantity: options.quantity || 1,
        ...options.properties
      },
      userId: options.userId,
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      context: options.context
    });
  }

  /**
   * Track performance metric
   * @static
   * @param {Object} options - Performance metric options
   * @returns {Promise<void>}
   */
  static async trackPerformance(options) {
    await this.initialize();

    const { metric, value, tags = {}, type = this.#METRIC_TYPES.GAUGE } = options;

    try {
      // Get or create metric
      if (!this.#metrics.has(metric)) {
        this.#metrics.set(metric, {
          type,
          values: [],
          tags: new Map()
        });
      }

      const metricData = this.#metrics.get(metric);
      
      // Update metric based on type
      switch (type) {
        case this.#METRIC_TYPES.COUNTER:
          metricData.value = (metricData.value || 0) + value;
          break;
          
        case this.#METRIC_TYPES.GAUGE:
          metricData.value = value;
          break;
          
        case this.#METRIC_TYPES.HISTOGRAM:
        case this.#METRIC_TYPES.SUMMARY:
          metricData.values.push({
            value,
            timestamp: Date.now()
          });
          // Keep only recent values
          if (metricData.values.length > 1000) {
            metricData.values = metricData.values.slice(-1000);
          }
          break;
      }

      // Update tags
      Object.entries(tags).forEach(([key, val]) => {
        if (!metricData.tags.has(key)) {
          metricData.tags.set(key, new Set());
        }
        metricData.tags.get(key).add(val);
      });

      // Send to providers that support metrics
      for (const [name, provider] of this.#providers) {
        if (provider.trackMetric) {
          await provider.trackMetric(metric, value, type, tags);
        }
      }

      logger.debug('Performance metric tracked', { metric, value, type });

    } catch (error) {
      logger.error('Performance tracking failed', {
        metric,
        error: error.message
      });
    }
  }

  /**
   * Get analytics data
   * @static
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Analytics data
   */
  static async getAnalytics(options = {}) {
    await this.initialize();

    const {
      startDate,
      endDate,
      events,
      userId,
      organizationId,
      groupBy = 'day',
      metrics = ['count']
    } = options;

    try {
      // Get data from cache or aggregate
      const cacheKey = this.#buildAnalyticsCacheKey(options);
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Aggregate data
      const data = await this.#aggregateAnalytics({
        startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate || new Date(),
        events,
        userId,
        organizationId,
        groupBy,
        metrics
      });

      // Cache results
      await this.#cacheService.set(cacheKey, data, 300); // 5 minutes

      return data;

    } catch (error) {
      logger.error('Failed to get analytics', { error: error.message });
      throw new AppError(
        'Failed to retrieve analytics',
        500,
        ERROR_CODES.ANALYTICS_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Get real-time analytics
   * @static
   * @param {Object} options - Real-time options
   * @returns {Promise<Object>} Real-time data
   */
  static async getRealtime(options = {}) {
    await this.initialize();

    if (!this.#config.realtime.enabled) {
      throw new AppError(
        'Real-time analytics not enabled',
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE
      );
    }

    const {
      metric = 'activeUsers',
      window = this.#config.realtime.windowSize
    } = options;

    try {
      const cacheKey = `realtime:${metric}:${window}`;
      const data = await this.#cacheService.get(cacheKey);
      
      if (!data) {
        return {
          metric,
          value: 0,
          window,
          timestamp: new Date()
        };
      }

      return data;

    } catch (error) {
      logger.error('Failed to get real-time analytics', { error: error.message });
      throw new AppError(
        'Failed to retrieve real-time analytics',
        500,
        ERROR_CODES.ANALYTICS_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Get funnel analysis
   * @static
   * @param {Object} options - Funnel options
   * @returns {Promise<Object>} Funnel data
   */
  static async getFunnel(options) {
    await this.initialize();

    const {
      steps,
      startDate,
      endDate,
      userId,
      organizationId
    } = options;

    if (!steps || steps.length < 2) {
      throw new AppError(
        'At least 2 steps required for funnel',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    try {
      const funnelData = {
        steps: [],
        conversion: {
          total: 0,
          rate: 0
        }
      };

      // Calculate conversion for each step
      let previousCount = null;
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const count = await this.#getEventCount({
          event: step.event,
          startDate,
          endDate,
          userId,
          organizationId,
          filters: step.filters
        });

        const stepData = {
          name: step.name || step.event,
          event: step.event,
          count,
          rate: previousCount ? (count / previousCount) * 100 : 100
        };

        funnelData.steps.push(stepData);
        
        if (i === 0) {
          funnelData.conversion.total = count;
        }
        
        previousCount = count;
      }

      // Overall conversion rate
      if (funnelData.conversion.total > 0) {
        const lastStep = funnelData.steps[funnelData.steps.length - 1];
        funnelData.conversion.rate = 
          (lastStep.count / funnelData.conversion.total) * 100;
      }

      return funnelData;

    } catch (error) {
      logger.error('Failed to get funnel analysis', { error: error.message });
      throw new AppError(
        'Failed to retrieve funnel analysis',
        500,
        ERROR_CODES.ANALYTICS_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Get cohort analysis
   * @static
   * @param {Object} options - Cohort options
   * @returns {Promise<Object>} Cohort data
   */
  static async getCohort(options) {
    await this.initialize();

    const {
      cohortEvent,
      returnEvent,
      startDate,
      endDate,
      interval = 'week',
      periods = 12
    } = options;

    try {
      const cohorts = [];
      const intervalMs = this.#getIntervalMs(interval);
      const currentDate = new Date(startDate);

      // Generate cohorts
      for (let i = 0; i < periods; i++) {
        const cohortStart = new Date(currentDate);
        const cohortEnd = new Date(currentDate.getTime() + intervalMs);
        
        // Get users in cohort
        const cohortUsers = await this.#getUsersForEvent({
          event: cohortEvent,
          startDate: cohortStart,
          endDate: cohortEnd
        });

        // Track retention for each period
        const retention = [];
        
        for (let j = 0; j <= i; j++) {
          const periodStart = new Date(cohortStart.getTime() + (j * intervalMs));
          const periodEnd = new Date(periodStart.getTime() + intervalMs);
          
          const returnedUsers = await this.#getUsersForEvent({
            event: returnEvent,
            startDate: periodStart,
            endDate: periodEnd,
            userIds: cohortUsers
          });

          retention.push({
            period: j,
            users: returnedUsers.length,
            rate: cohortUsers.length > 0 
              ? (returnedUsers.length / cohortUsers.length) * 100 
              : 0
          });
        }

        cohorts.push({
          cohort: cohortStart.toISOString().split('T')[0],
          size: cohortUsers.length,
          retention
        });

        currentDate.setTime(currentDate.getTime() + intervalMs);
      }

      return {
        cohortEvent,
        returnEvent,
        interval,
        cohorts
      };

    } catch (error) {
      logger.error('Failed to get cohort analysis', { error: error.message });
      throw new AppError(
        'Failed to retrieve cohort analysis',
        500,
        ERROR_CODES.ANALYTICS_RETRIEVAL_FAILED
      );
    }
  }

  /**
   * Register event schema
   * @static
   * @param {string} event - Event name
   * @param {Object} schema - Event schema
   */
  static registerEventSchema(event, schema) {
    if (!event || !schema) {
      throw new AppError(
        'Invalid event schema',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#eventSchemas.set(event, {
      ...schema,
      required: schema.required || [],
      properties: schema.properties || {}
    });

    logger.info('Event schema registered', { event });
  }

  /**
   * Register event processor
   * @static
   * @param {string} event - Event name or pattern
   * @param {Function} processor - Processor function
   */
  static registerProcessor(event, processor) {
    if (!event || typeof processor !== 'function') {
      throw new AppError(
        'Invalid processor configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#processors.set(event, processor);
    logger.info('Event processor registered', { event });
  }

  /**
   * Export analytics data
   * @static
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Export result
   */
  static async export(options) {
    await this.initialize();

    const {
      format = 'csv',
      startDate,
      endDate,
      events,
      userId,
      organizationId
    } = options;

    try {
      // Get analytics data
      const data = await this.getAnalytics({
        startDate,
        endDate,
        events,
        userId,
        organizationId
      });

      // Format data based on requested format
      let exported;
      
      switch (format) {
        case 'csv':
          exported = this.#formatAsCsv(data);
          break;
          
        case 'json':
          exported = JSON.stringify(data, null, 2);
          break;
          
        case 'excel':
          exported = await this.#formatAsExcel(data);
          break;
          
        default:
          throw new AppError(
            'Unsupported export format',
            400,
            ERROR_CODES.UNSUPPORTED_FORMAT
          );
      }

      return {
        data: exported,
        format,
        filename: `analytics_${Date.now()}.${format}`
      };

    } catch (error) {
      logger.error('Analytics export failed', { error: error.message });
      throw error instanceof AppError ? error : new AppError(
        'Failed to export analytics',
        500,
        ERROR_CODES.EXPORT_FAILED
      );
    }
  }

  /**
   * Get analytics statistics
   * @static
   * @returns {Object} Analytics statistics
   */
  static getStats() {
    const stats = {
      providers: {},
      events: {
        queued: this.#eventQueue.size,
        schemas: this.#eventSchemas.size,
        processors: this.#processors.size
      },
      metrics: {}
    };

    // Provider stats
    this.#providers.forEach((provider, name) => {
      stats.providers[name] = {
        enabled: true,
        events: provider.stats?.events || 0,
        errors: provider.stats?.errors || 0
      };
    });

    // Metric stats
    this.#metrics.forEach((metric, name) => {
      stats.metrics[name] = {
        type: metric.type,
        value: metric.value,
        count: metric.values?.length || 0
      };
    });

    return stats;
  }

  /**
   * @private
   * Initialize analytics providers
   */
  static async #initializeProviders() {
    // Internal provider (always enabled)
    this.#providers.set('internal', {
      send: async (event) => {
        // Store in database or internal storage
        logger.debug('Internal analytics event', { event: event.event });
        return { success: true };
      },
      trackMetric: async (metric, value, type, tags) => {
        logger.debug('Internal analytics metric', { metric, value });
        return { success: true };
      },
      stats: { events: 0, errors: 0 }
    });

    // Google Analytics
    if (this.#config.providers.googleAnalytics.enabled) {
      // Initialize GA provider
      this.#providers.set('googleAnalytics', {
        send: async (event) => {
          // Implement GA tracking
          return { success: true };
        }
      });
    }

    // Mixpanel
    if (this.#config.providers.mixpanel.enabled) {
      // Initialize Mixpanel provider
      this.#providers.set('mixpanel', {
        send: async (event) => {
          // Implement Mixpanel tracking
          return { success: true };
        }
      });
    }

    // Segment
    if (this.#config.providers.segment.enabled) {
      // Initialize Segment provider
      this.#providers.set('segment', {
        send: async (event) => {
          // Implement Segment tracking
          return { success: true };
        }
      });
    }
  }

  /**
   * @private
   * Register default event schemas
   */
  static #registerDefaultSchemas() {
    // User events
    this.registerEventSchema(this.#EVENT_TYPES.USER_SIGNUP, {
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        email: { type: 'string' },
        source: { type: 'string' },
        referrer: { type: 'string' }
      }
    });

    this.registerEventSchema(this.#EVENT_TYPES.USER_LOGIN, {
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        method: { type: 'string' },
        success: { type: 'boolean' }
      }
    });

    // Page view
    this.registerEventSchema(this.#EVENT_TYPES.PAGE_VIEW, {
      required: ['url'],
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        referrer: { type: 'string' }
      }
    });

    // Revenue events
    this.registerEventSchema(this.#EVENT_TYPES.PAYMENT_COMPLETED, {
      required: ['amount', 'currency'],
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        productId: { type: 'string' },
        productName: { type: 'string' }
      }
    });
  }

  /**
   * @private
   * Register default processors
   */
  static #registerDefaultProcessors() {
    // User agent parser
    this.registerProcessor('*', (event) => {
      if (event.context?.userAgent) {
        // Parse user agent
        event.context.browser = this.#parseBrowser(event.context.userAgent);
        event.context.os = this.#parseOS(event.context.userAgent);
        event.context.device = this.#parseDevice(event.context.userAgent);
      }
      return event;
    });

    // Session enrichment
    this.registerProcessor('*', async (event) => {
      if (event.sessionId) {
        const session = await this.#getSession(event.sessionId);
        if (session) {
          event.context = {
            ...event.context,
            sessionDuration: Date.now() - session.startTime,
            pageViews: session.pageViews
          };
        }
      }
      return event;
    });

    // Geo-location enrichment
    this.registerProcessor('*', (event) => {
      if (event.context?.ip && this.#config.privacy.anonymizeIp) {
        // Anonymize IP
        const parts = event.context.ip.split('.');
        if (parts.length === 4) {
          parts[3] = '0';
          event.context.ip = parts.join('.');
        }
      }
      return event;
    });
  }

  /**
   * @private
   * Validate and enrich event
   */
  static async #validateAndEnrichEvent(options) {
    const event = {
      id: this.#generateEventId(),
      event: options.event,
      properties: options.properties || {},
      userId: options.userId,
      sessionId: options.sessionId,
      organizationId: options.organizationId,
      context: {
        ...options.context,
        timestamp: options.timestamp || new Date(),
        library: {
          name: 'InsightSerenity Analytics',
          version: '1.0.0'
        }
      }
    };

    // Validate against schema
    const schema = this.#eventSchemas.get(event.event);
    if (schema) {
      // Check required fields
      for (const field of schema.required) {
        if (!event.properties[field]) {
          throw new AppError(
            `Missing required field: ${field}`,
            400,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
      }

      // Validate property types
      for (const [prop, config] of Object.entries(schema.properties)) {
        if (event.properties[prop] !== undefined) {
          const actualType = typeof event.properties[prop];
          if (actualType !== config.type) {
            throw new AppError(
              `Invalid type for ${prop}: expected ${config.type}, got ${actualType}`,
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
        }
      }
    }

    return event;
  }

  /**
   * @private
   * Process event through processors
   */
  static async #processEvent(event) {
    let processed = { ...event };

    // Apply matching processors
    for (const [pattern, processor] of this.#processors) {
      if (pattern === '*' || pattern === event.event || 
          (pattern.includes('*') && this.#matchPattern(event.event, pattern))) {
        processed = await processor(processed);
      }
    }

    return processed;
  }

  /**
   * @private
   * Send event to providers
   */
  static async #sendEvent(event) {
    const results = [];

    for (const [name, provider] of this.#providers) {
      try {
        const result = await provider.send(event);
        results.push({ provider: name, success: true, result });
        
        if (provider.stats) {
          provider.stats.events++;
        }
      } catch (error) {
        logger.error(`Analytics provider error: ${name}`, { error: error.message });
        results.push({ provider: name, success: false, error: error.message });
        
        if (provider.stats) {
          provider.stats.errors++;
        }
      }
    }

    return results;
  }

  /**
   * @private
   * Flush queued events
   */
  static async #flushEvents() {
    if (this.#eventQueue.size === 0) return;

    const events = Array.from(this.#eventQueue);
    this.#eventQueue.clear();

    try {
      // Send events in batch
      for (const event of events) {
        await this.#sendEvent(event);
      }

      logger.debug('Flushed analytics events', { count: events.length });

    } catch (error) {
      logger.error('Failed to flush events', { error: error.message });
      
      // Re-queue failed events
      events.forEach(event => this.#eventQueue.add(event));
    }
  }

  /**
   * @private
   * Start batch processor
   */
  static #startBatchProcessor() {
    this.#flushInterval = setInterval(async () => {
      await this.#flushEvents();
    }, this.#config.batching.flushInterval);
  }

  /**
   * @private
   * Should sample event
   */
  static #shouldSample(event) {
    if (!this.#config.sampling.enabled) return true;
    
    // Always track important events
    const importantEvents = [
      this.#EVENT_TYPES.USER_SIGNUP,
      this.#EVENT_TYPES.PAYMENT_COMPLETED,
      this.#EVENT_TYPES.ERROR
    ];
    
    if (importantEvents.includes(event.event)) {
      return true;
    }

    // Sample based on rate
    return Math.random() < this.#config.sampling.rate;
  }

  /**
   * @private
   * Remove PII from properties
   */
  static #removePii(properties) {
    const piiFields = [
      'email', 'phone', 'ssn', 'creditCard', 
      'password', 'address', 'firstName', 'lastName'
    ];

    const cleaned = { ...properties };
    
    piiFields.forEach(field => {
      if (cleaned[field]) {
        cleaned[field] = '[REDACTED]';
      }
    });

    return cleaned;
  }

  /**
   * @private
   * Update real-time metrics
   */
  static async #updateRealtimeMetrics(event) {
    const window = this.#config.realtime.windowSize;
    const now = Date.now();
    
    // Update active users
    if (event.userId) {
      const activeUsersKey = `realtime:activeUsers:${window}`;
      const activeUsers = await this.#cacheService.get(activeUsersKey) || new Set();
      
      activeUsers.add(event.userId);
      
      await this.#cacheService.set(activeUsersKey, activeUsers, window / 1000);
    }

    // Update event counts
    const eventCountKey = `realtime:events:${event.event}:${window}`;
    const eventCount = await this.#cacheService.get(eventCountKey) || 0;
    
    await this.#cacheService.set(eventCountKey, eventCount + 1, window / 1000);
  }

  /**
   * @private
   * Aggregate analytics data
   */
  static async #aggregateAnalytics(options) {
    // This would typically query a database or analytics store
    // For now, return mock aggregated data
    
    const data = {
      summary: {
        totalEvents: 0,
        uniqueUsers: 0,
        sessions: 0,
        avgSessionDuration: 0
      },
      timeline: [],
      events: {},
      users: {
        new: 0,
        returning: 0
      }
    };

    // Generate timeline data
    const current = new Date(options.startDate);
    while (current <= options.endDate) {
      data.timeline.push({
        date: current.toISOString(),
        events: Math.floor(Math.random() * 1000),
        users: Math.floor(Math.random() * 100)
      });
      
      current.setDate(current.getDate() + 1);
    }

    return data;
  }

  /**
   * @private
   * Get event count
   */
  static async #getEventCount(options) {
    // This would query the analytics store
    // Return mock data for now
    return Math.floor(Math.random() * 1000);
  }

  /**
   * @private
   * Get users for event
   */
  static async #getUsersForEvent(options) {
    // This would query the analytics store
    // Return mock data for now
    const count = Math.floor(Math.random() * 100);
    return Array.from({ length: count }, (_, i) => `user_${i}`);
  }

  /**
   * @private
   * Get session data
   */
  static async #getSession(sessionId) {
    return await this.#cacheService.get(`session:${sessionId}`);
  }

  /**
   * @private
   * Parse browser from user agent
   */
  static #parseBrowser(userAgent) {
    // Simple browser detection
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  }

  /**
   * @private
   * Parse OS from user agent
   */
  static #parseOS(userAgent) {
    // Simple OS detection
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Other';
  }

  /**
   * @private
   * Parse device from user agent
   */
  static #parseDevice(userAgent) {
    // Simple device detection
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }

  /**
   * @private
   * Match pattern
   */
  static #matchPattern(event, pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(event);
  }

  /**
   * @private
   * Build analytics cache key
   */
  static #buildAnalyticsCacheKey(options) {
    const parts = [
      'analytics',
      options.startDate?.toISOString(),
      options.endDate?.toISOString(),
      options.events?.join(','),
      options.userId,
      options.organizationId,
      options.groupBy
    ].filter(Boolean);

    return parts.join(':');
  }

  /**
   * @private
   * Format as CSV
   */
  static #formatAsCsv(data) {
    // Convert data to CSV format
    const headers = ['Date', 'Events', 'Users'];
    const rows = data.timeline.map(item => 
      [item.date, item.events, item.users].join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * @private
   * Format as Excel
   */
  static async #formatAsExcel(data) {
    // This would use a library like exceljs
    // Return placeholder for now
    return Buffer.from(this.#formatAsCsv(data));
  }

  /**
   * @private
   * Get interval in milliseconds
   */
  static #getIntervalMs(interval) {
    const intervals = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };
    
    return intervals[interval] || intervals.day;
  }

  /**
   * @private
   * Generate event ID
   */
  static #generateEventId() {
    return `event_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  static async shutdown() {
    logger.info('Shutting down AnalyticsService');

    // Stop batch processor
    if (this.#flushInterval) {
      clearInterval(this.#flushInterval);
    }

    // Flush remaining events
    await this.#flushEvents();

    // Clear data
    this.#providers.clear();
    this.#eventSchemas.clear();
    this.#processors.clear();
    this.#metrics.clear();
    this.#eventQueue.clear();

    await this.#cacheService.shutdown();

    this.#initialized = false;
    logger.info('AnalyticsService shutdown complete');
  }
}

// Export event types
AnalyticsService.EVENT_TYPES = AnalyticsService.#EVENT_TYPES;
AnalyticsService.METRIC_TYPES = AnalyticsService.#METRIC_TYPES;

module.exports = AnalyticsService;