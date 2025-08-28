/**
 * @file Performance Monitoring Middleware
 * @description Comprehensive performance monitoring middleware for customer services
 *              Tracks request metrics, database performance, tenant isolation overhead, and business KPIs
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const CacheService = require('../../../shared/lib/services/cache-service');
const AnalyticsService = require('../../../shared/lib/services/analytics-service');

/**
 * Performance Monitoring Middleware
 * Monitors and tracks:
 * - Request/response performance metrics
 * - Database query performance
 * - Multi-tenant isolation overhead
 * - Memory and CPU usage patterns
 * - Business operation metrics
 * - User experience metrics
 * - API endpoint performance
 * - Cache hit/miss ratios
 */
class PerformanceMonitoringMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            trackRequests: options.trackRequests !== false,
            trackDatabase: options.trackDatabase !== false,
            trackMemory: options.trackMemory !== false,
            trackBusiness: options.trackBusiness !== false,
            trackTenantIsolation: options.trackTenantIsolation !== false,
            detailedLogging: options.detailedLogging === true || process.env.NODE_ENV === 'development',
            slowRequestThreshold: options.slowRequestThreshold || 2000, // 2 seconds
            verySlowRequestThreshold: options.verySlowRequestThreshold || 5000, // 5 seconds
            memoryThreshold: options.memoryThreshold || 512 * 1024 * 1024, // 512MB
            metricsRetention: options.metricsRetention || 3600000, // 1 hour
            aggregateInterval: options.aggregateInterval || 60000, // 1 minute
            alertThresholds: options.alertThresholds || {
                errorRate: 0.05, // 5%
                p95ResponseTime: 3000, // 3 seconds
                memoryUsage: 0.85, // 85%
                cpuUsage: 0.80 // 80%
            }
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.analytics = AnalyticsService ? AnalyticsService.getInstance() : null;

        // Performance tracking storage
        this.metrics = {
            requests: new Map(),
            database: new Map(),
            memory: new Map(),
            business: new Map(),
            tenant: new Map(),
            endpoints: new Map()
        };

        // Aggregated statistics
        this.stats = {
            totalRequests: 0,
            totalErrors: 0,
            totalResponseTime: 0,
            slowRequests: 0,
            verySlowRequests: 0,
            averageResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            requestsPerSecond: 0,
            errorRate: 0,
            tenantIsolationOverhead: 0,
            memoryPeak: 0,
            cpuPeak: 0,
            lastReset: Date.now()
        };

        // Response time buckets for histogram
        this.responseTimeBuckets = new Map([
            ['<100ms', 0],
            ['100-500ms', 0], 
            ['500ms-1s', 0],
            ['1-2s', 0],
            ['2-5s', 0],
            ['>5s', 0]
        ]);

        // Start background processes
        this.startAggregation();
        this.startCleanup();

        console.log('Performance monitoring middleware initialized');
        logger.info('Performance monitoring middleware initialized', {
            enabled: this.config.enabled,
            trackRequests: this.config.trackRequests,
            trackDatabase: this.config.trackDatabase,
            trackMemory: this.config.trackMemory,
            trackBusiness: this.config.trackBusiness,
            trackTenantIsolation: this.config.trackTenantIsolation,
            slowThreshold: this.config.slowRequestThreshold,
            verySlowThreshold: this.config.verySlowRequestThreshold
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    monitor = (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        const requestStart = process.hrtime();
        const requestStartTime = Date.now();
        const memoryStart = process.memoryUsage();

        // Initialize request performance tracking
        req.performance = {
            startTime: requestStartTime,
            startHrTime: requestStart,
            startMemory: memoryStart,
            tenantId: req.tenantId || 'default',
            organizationId: req.organizationId || null,
            isAuthenticated: !!req.user,
            userId: req.user?.id || null,
            endpoint: `${req.method} ${req.route?.path || req.path}`,
            dbQueries: [],
            cacheOperations: [],
            businessOperations: [],
            warnings: [],
            metadata: {}
        };

        console.log(`Starting performance monitoring for ${req.performance.endpoint} (tenant: ${req.performance.tenantId})`);

        // Track tenant isolation setup overhead
        if (this.config.trackTenantIsolation && req.tenantContext) {
            const tenantSetupTime = Date.now() - (req.tenantContext.setupTime || requestStartTime);
            req.performance.tenantIsolationOverhead = tenantSetupTime;
            
            if (this.config.detailedLogging && tenantSetupTime > 100) {
                console.log(`High tenant isolation overhead detected: ${tenantSetupTime}ms for tenant ${req.performance.tenantId}`);
                req.performance.warnings.push({
                    type: 'high_tenant_overhead',
                    value: tenantSetupTime,
                    threshold: 100
                });
            }
        }

        // Override database query methods to track performance
        if (this.config.trackDatabase) {
            this.instrumentDatabaseQueries(req);
        }

        // Override cache operations to track performance
        if (this.cache && this.config.trackRequests) {
            this.instrumentCacheOperations(req);
        }

        // Response handler
        const originalSend = res.send;
        res.send = (body) => {
            try {
                const responseTime = process.hrtime(requestStart);
                const responseTimeMs = responseTime[0] * 1000 + responseTime[1] / 1000000;
                const memoryEnd = process.memoryUsage();

                // Calculate performance metrics
                req.performance.endTime = Date.now();
                req.performance.responseTime = responseTimeMs;
                req.performance.endMemory = memoryEnd;
                req.performance.memoryDelta = {
                    rss: memoryEnd.rss - memoryStart.rss,
                    heapUsed: memoryEnd.heapUsed - memoryStart.heapUsed,
                    heapTotal: memoryEnd.heapTotal - memoryStart.heapTotal,
                    external: memoryEnd.external - memoryStart.external
                };

                // Record the performance data
                this.recordPerformanceData(req, res);

                // Log performance issues
                this.checkPerformanceThresholds(req, res);

            } catch (error) {
                console.error('Performance monitoring error during response:', error.message);
                logger.error('Performance monitoring error', {
                    error: error.message,
                    requestId: req.requestId,
                    endpoint: req.performance?.endpoint
                });
            }

            return originalSend.call(res, body);
        };

        next();
    };

    /**
     * Instrument database queries for performance tracking
     * @param {Object} req - Express request object
     */
    instrumentDatabaseQueries(req) {
        // This would typically hook into the database layer
        // For now, we'll provide a helper method for manual tracking
        req.trackDbQuery = (operation, collection, query, duration) => {
            req.performance.dbQueries.push({
                operation,
                collection,
                query: this.config.detailedLogging ? query : '[query]',
                duration,
                timestamp: Date.now(),
                tenantId: req.performance.tenantId
            });

            if (duration > 1000) {
                console.log(`Slow database query detected: ${operation} on ${collection} took ${duration}ms`);
                req.performance.warnings.push({
                    type: 'slow_db_query',
                    operation,
                    collection,
                    duration,
                    threshold: 1000
                });
            }
        };
    }

    /**
     * Instrument cache operations for performance tracking
     * @param {Object} req - Express request object
     */
    instrumentCacheOperations(req) {
        req.trackCacheOperation = (operation, key, hit, duration) => {
            req.performance.cacheOperations.push({
                operation,
                key: this.config.detailedLogging ? key : '[key]',
                hit,
                duration,
                timestamp: Date.now(),
                tenantId: req.performance.tenantId
            });
        };
    }

    /**
     * Record performance data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    recordPerformanceData(req, res) {
        const now = Date.now();
        const responseTime = req.performance.responseTime;
        const endpoint = req.performance.endpoint;
        const tenantId = req.performance.tenantId;
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;

        // Update global statistics
        this.stats.totalRequests++;
        this.stats.totalResponseTime += responseTime;
        this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.totalRequests;
        
        if (isError) {
            this.stats.totalErrors++;
            this.stats.errorRate = this.stats.totalErrors / this.stats.totalRequests;
        }

        if (responseTime >= this.config.slowRequestThreshold) {
            this.stats.slowRequests++;
            if (responseTime >= this.config.verySlowRequestThreshold) {
                this.stats.verySlowRequests++;
            }
        }

        // Update response time buckets
        this.updateResponseTimeBuckets(responseTime);

        // Store detailed request metrics
        const requestMetric = {
            timestamp: now,
            requestId: req.requestId,
            tenantId,
            organizationId: req.performance.organizationId,
            endpoint,
            method: req.method,
            path: req.path,
            responseTime,
            statusCode,
            isError,
            userAgent: req.get('user-agent'),
            userId: req.performance.userId,
            isAuthenticated: req.performance.isAuthenticated,
            memoryDelta: req.performance.memoryDelta,
            tenantIsolationOverhead: req.performance.tenantIsolationOverhead || 0,
            dbQueries: req.performance.dbQueries.length,
            totalDbTime: req.performance.dbQueries.reduce((sum, q) => sum + q.duration, 0),
            cacheOperations: req.performance.cacheOperations.length,
            cacheHitRate: this.calculateCacheHitRate(req.performance.cacheOperations),
            businessOperations: req.performance.businessOperations.length,
            warnings: req.performance.warnings.length,
            warningTypes: req.performance.warnings.map(w => w.type)
        };

        // Store in request metrics
        this.metrics.requests.set(`${now}-${req.requestId}`, requestMetric);

        // Store endpoint-specific metrics
        if (!this.metrics.endpoints.has(endpoint)) {
            this.metrics.endpoints.set(endpoint, {
                totalRequests: 0,
                totalErrors: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0,
                recentResponseTimes: [],
                errorRate: 0
            });
        }

        const endpointStats = this.metrics.endpoints.get(endpoint);
        endpointStats.totalRequests++;
        endpointStats.totalResponseTime += responseTime;
        endpointStats.averageResponseTime = endpointStats.totalResponseTime / endpointStats.totalRequests;
        endpointStats.minResponseTime = Math.min(endpointStats.minResponseTime, responseTime);
        endpointStats.maxResponseTime = Math.max(endpointStats.maxResponseTime, responseTime);
        endpointStats.recentResponseTimes.push(responseTime);
        
        if (isError) {
            endpointStats.totalErrors++;
            endpointStats.errorRate = endpointStats.totalErrors / endpointStats.totalRequests;
        }

        // Keep only recent response times for percentile calculation
        if (endpointStats.recentResponseTimes.length > 1000) {
            endpointStats.recentResponseTimes = endpointStats.recentResponseTimes.slice(-1000);
        }

        // Calculate percentiles
        const sorted = [...endpointStats.recentResponseTimes].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        const p99Index = Math.floor(sorted.length * 0.99);
        endpointStats.p95ResponseTime = sorted[p95Index] || 0;
        endpointStats.p99ResponseTime = sorted[p99Index] || 0;

        // Store tenant-specific metrics
        if (!this.metrics.tenant.has(tenantId)) {
            this.metrics.tenant.set(tenantId, {
                totalRequests: 0,
                totalErrors: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                isolationOverhead: 0,
                uniqueUsers: new Set(),
                dbQueries: 0,
                cacheOperations: 0,
                businessOperations: 0
            });
        }

        const tenantStats = this.metrics.tenant.get(tenantId);
        tenantStats.totalRequests++;
        tenantStats.totalResponseTime += responseTime;
        tenantStats.averageResponseTime = tenantStats.totalResponseTime / tenantStats.totalRequests;
        tenantStats.isolationOverhead += req.performance.tenantIsolationOverhead || 0;
        tenantStats.dbQueries += req.performance.dbQueries.length;
        tenantStats.cacheOperations += req.performance.cacheOperations.length;
        tenantStats.businessOperations += req.performance.businessOperations.length;
        
        if (req.performance.userId) {
            tenantStats.uniqueUsers.add(req.performance.userId);
        }
        
        if (isError) {
            tenantStats.totalErrors++;
        }

        // Log detailed performance information
        if (this.config.detailedLogging) {
            console.log(`Performance summary for ${endpoint}:`, {
                responseTime: Math.round(responseTime),
                statusCode,
                tenantId,
                dbQueries: req.performance.dbQueries.length,
                cacheOps: req.performance.cacheOperations.length,
                memoryDelta: req.performance.memoryDelta.heapUsed,
                warnings: req.performance.warnings.length
            });
        }

        // Send to analytics service
        if (this.analytics && this.config.trackBusiness) {
            this.analytics.track('request_performance', {
                ...requestMetric,
                environment: process.env.NODE_ENV
            });
        }
    }

    /**
     * Update response time buckets for histogram
     * @param {number} responseTime - Response time in milliseconds
     */
    updateResponseTimeBuckets(responseTime) {
        if (responseTime < 100) {
            this.responseTimeBuckets.set('<100ms', this.responseTimeBuckets.get('<100ms') + 1);
        } else if (responseTime < 500) {
            this.responseTimeBuckets.set('100-500ms', this.responseTimeBuckets.get('100-500ms') + 1);
        } else if (responseTime < 1000) {
            this.responseTimeBuckets.set('500ms-1s', this.responseTimeBuckets.get('500ms-1s') + 1);
        } else if (responseTime < 2000) {
            this.responseTimeBuckets.set('1-2s', this.responseTimeBuckets.get('1-2s') + 1);
        } else if (responseTime < 5000) {
            this.responseTimeBuckets.set('2-5s', this.responseTimeBuckets.get('2-5s') + 1);
        } else {
            this.responseTimeBuckets.set('>5s', this.responseTimeBuckets.get('>5s') + 1);
        }
    }

    /**
     * Calculate cache hit rate from operations
     * @param {Array} cacheOperations - Cache operations array
     * @returns {number} Hit rate percentage
     */
    calculateCacheHitRate(cacheOperations) {
        if (cacheOperations.length === 0) return 0;
        
        const hits = cacheOperations.filter(op => op.hit).length;
        return (hits / cacheOperations.length) * 100;
    }

    /**
     * Check performance thresholds and log issues
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    checkPerformanceThresholds(req, res) {
        const responseTime = req.performance.responseTime;
        const memoryDelta = req.performance.memoryDelta;
        const tenantOverhead = req.performance.tenantIsolationOverhead || 0;

        // Check response time thresholds
        if (responseTime >= this.config.verySlowRequestThreshold) {
            console.warn(`Very slow request detected: ${req.performance.endpoint} took ${Math.round(responseTime)}ms`);
            logger.warn('Very slow request detected', {
                endpoint: req.performance.endpoint,
                responseTime: Math.round(responseTime),
                threshold: this.config.verySlowRequestThreshold,
                tenantId: req.performance.tenantId,
                requestId: req.requestId,
                dbQueries: req.performance.dbQueries.length,
                warnings: req.performance.warnings
            });
        } else if (responseTime >= this.config.slowRequestThreshold) {
            console.log(`Slow request detected: ${req.performance.endpoint} took ${Math.round(responseTime)}ms`);
            logger.info('Slow request detected', {
                endpoint: req.performance.endpoint,
                responseTime: Math.round(responseTime),
                threshold: this.config.slowRequestThreshold,
                tenantId: req.performance.tenantId,
                requestId: req.requestId
            });
        }

        // Check memory usage
        if (memoryDelta.heapUsed > this.config.memoryThreshold) {
            console.warn(`High memory usage detected: ${Math.round(memoryDelta.heapUsed / 1024 / 1024)}MB for ${req.performance.endpoint}`);
            logger.warn('High memory usage detected', {
                endpoint: req.performance.endpoint,
                memoryDelta: Math.round(memoryDelta.heapUsed / 1024 / 1024),
                threshold: Math.round(this.config.memoryThreshold / 1024 / 1024),
                tenantId: req.performance.tenantId,
                requestId: req.requestId
            });
        }

        // Check tenant isolation overhead
        if (tenantOverhead > 500) {
            console.warn(`High tenant isolation overhead: ${tenantOverhead}ms for tenant ${req.performance.tenantId}`);
            logger.warn('High tenant isolation overhead', {
                tenantId: req.performance.tenantId,
                overhead: tenantOverhead,
                threshold: 500,
                endpoint: req.performance.endpoint,
                requestId: req.requestId
            });
        }

        // Check error rate thresholds
        if (this.stats.errorRate > this.config.alertThresholds.errorRate) {
            logger.warn('High error rate detected', {
                errorRate: Math.round(this.stats.errorRate * 100),
                threshold: Math.round(this.config.alertThresholds.errorRate * 100),
                totalRequests: this.stats.totalRequests,
                totalErrors: this.stats.totalErrors
            });
        }
    }

    /**
     * Start aggregation process
     */
    startAggregation() {
        setInterval(() => {
            try {
                this.aggregateMetrics();
            } catch (error) {
                console.error('Metrics aggregation error:', error.message);
                logger.error('Metrics aggregation error', { error: error.message });
            }
        }, this.config.aggregateInterval);
    }

    /**
     * Start cleanup process
     */
    startCleanup() {
        setInterval(() => {
            try {
                this.cleanupOldMetrics();
            } catch (error) {
                console.error('Metrics cleanup error:', error.message);
                logger.error('Metrics cleanup error', { error: error.message });
            }
        }, this.config.metricsRetention / 2); // Clean up twice per retention period
    }

    /**
     * Aggregate metrics and calculate statistics
     */
    aggregateMetrics() {
        const now = Date.now();
        
        // Calculate requests per second
        const timeSinceReset = now - this.stats.lastReset;
        this.stats.requestsPerSecond = (this.stats.totalRequests / (timeSinceReset / 1000)) || 0;

        // Calculate memory peak
        const currentMemory = process.memoryUsage();
        this.stats.memoryPeak = Math.max(this.stats.memoryPeak, currentMemory.heapUsed);

        // Log aggregated statistics
        if (this.config.detailedLogging) {
            console.log('Performance metrics aggregated:', {
                totalRequests: this.stats.totalRequests,
                errorRate: Math.round(this.stats.errorRate * 100),
                averageResponseTime: Math.round(this.stats.averageResponseTime),
                requestsPerSecond: Math.round(this.stats.requestsPerSecond),
                slowRequests: this.stats.slowRequests,
                verySlowRequests: this.stats.verySlowRequests,
                memoryPeakMB: Math.round(this.stats.memoryPeak / 1024 / 1024)
            });
        }

        // Store aggregated statistics
        if (this.cache) {
            this.cache.set('performance_stats', this.stats, 300); // 5 minutes TTL
        }
    }

    /**
     * Clean up old metrics to prevent memory leaks
     */
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.metricsRetention;
        let cleaned = 0;

        // Clean up request metrics
        for (const [key, metric] of this.metrics.requests) {
            if (metric.timestamp < cutoff) {
                this.metrics.requests.delete(key);
                cleaned++;
            }
        }

        // Clean up other metric types similarly
        ['database', 'memory', 'business'].forEach(type => {
            for (const [key, metric] of this.metrics[type]) {
                if (metric.timestamp < cutoff) {
                    this.metrics[type].delete(key);
                    cleaned++;
                }
            }
        });

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old performance metrics`);
        }
    }

    /**
     * Get current performance statistics
     * @returns {Object} Performance statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            responseTimeBuckets: Object.fromEntries(this.responseTimeBuckets),
            endpointStats: Object.fromEntries(this.metrics.endpoints),
            tenantStats: Object.fromEntries(
                Array.from(this.metrics.tenant.entries()).map(([key, value]) => [
                    key, 
                    { ...value, uniqueUsers: value.uniqueUsers.size }
                ])
            ),
            metricsCount: {
                requests: this.metrics.requests.size,
                database: this.metrics.database.size,
                memory: this.metrics.memory.size,
                business: this.metrics.business.size,
                tenant: this.metrics.tenant.size,
                endpoints: this.metrics.endpoints.size
            },
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }

    /**
     * Get performance report for specific tenant
     * @param {string} tenantId - Tenant ID
     * @returns {Object} Tenant performance report
     */
    getTenantReport(tenantId) {
        const tenantStats = this.metrics.tenant.get(tenantId);
        if (!tenantStats) {
            return null;
        }

        return {
            tenantId,
            totalRequests: tenantStats.totalRequests,
            totalErrors: tenantStats.totalErrors,
            errorRate: tenantStats.totalErrors / tenantStats.totalRequests,
            averageResponseTime: tenantStats.averageResponseTime,
            isolationOverhead: tenantStats.isolationOverhead / tenantStats.totalRequests,
            uniqueUsers: tenantStats.uniqueUsers.size,
            dbQueries: tenantStats.dbQueries,
            cacheOperations: tenantStats.cacheOperations,
            businessOperations: tenantStats.businessOperations
        };
    }

    /**
     * Reset all statistics
     */
    resetStatistics() {
        console.log('Resetting performance monitoring statistics');
        
        this.stats = {
            totalRequests: 0,
            totalErrors: 0,
            totalResponseTime: 0,
            slowRequests: 0,
            verySlowRequests: 0,
            averageResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            requestsPerSecond: 0,
            errorRate: 0,
            tenantIsolationOverhead: 0,
            memoryPeak: 0,
            cpuPeak: 0,
            lastReset: Date.now()
        };

        this.responseTimeBuckets.forEach((value, key) => {
            this.responseTimeBuckets.set(key, 0);
        });

        this.metrics.requests.clear();
        this.metrics.database.clear();
        this.metrics.memory.clear();
        this.metrics.business.clear();
        this.metrics.tenant.clear();
        this.metrics.endpoints.clear();

        logger.info('Performance monitoring statistics reset');
    }
}

// Create singleton instance
const performanceMonitoringMiddleware = new PerformanceMonitoringMiddleware({
    enabled: process.env.PERFORMANCE_MONITORING_ENABLED !== 'false',
    trackRequests: process.env.TRACK_REQUESTS !== 'false',
    trackDatabase: process.env.TRACK_DATABASE !== 'false',
    trackMemory: process.env.TRACK_MEMORY !== 'false',
    trackBusiness: process.env.TRACK_BUSINESS !== 'false',
    trackTenantIsolation: process.env.TRACK_TENANT_ISOLATION !== 'false',
    detailedLogging: process.env.PERFORMANCE_DETAILED_LOGGING === 'true',
    slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 2000,
    verySlowRequestThreshold: parseInt(process.env.VERY_SLOW_REQUEST_THRESHOLD, 10) || 5000,
    memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD, 10) || 512 * 1024 * 1024,
    metricsRetention: parseInt(process.env.METRICS_RETENTION, 10) || 3600000,
    aggregateInterval: parseInt(process.env.METRICS_AGGREGATE_INTERVAL, 10) || 60000
});

module.exports = performanceMonitoringMiddleware.monitor;