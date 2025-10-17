/**
 * @fileoverview Metrics Collector Implementation
 * @module servers/gateway/utils/metrics-collector
 */

const os = require('os');
const { getLogger } = require('../../../shared/lib/utils/logger');

/**
 * Metrics Collector Class
 * @class MetricsCollector
 */
class MetricsCollector {
    constructor(options = {}) {
        this.logger = getLogger({ serviceName: 'metrics-collector' });
        this.interval = options.interval || 10000; // Collect every 10 seconds
        this.maxDataPoints = options.maxDataPoints || 360; // Keep 1 hour of data

        // Request metrics
        this.requests = {
            total: 0,
            success: 0,
            errors: 0,
            byStatus: {},
            byMethod: {},
            byPath: {},
            byService: {}
        };

        // Response time metrics
        this.responseTimes = [];
        this.responseTimeHistogram = {
            '0-50ms': 0,
            '50-100ms': 0,
            '100-200ms': 0,
            '200-500ms': 0,
            '500-1000ms': 0,
            '1000-2000ms': 0,
            '2000ms+': 0
        };

        // System metrics
        this.systemMetrics = [];

        // Service metrics
        this.serviceMetrics = new Map();

        // Start collecting system metrics
        this.startCollecting();
    }

    /**
     * Record request
     */
    recordRequest(req, res, responseTime) {
        this.requests.total++;

        // Record by status
        const statusCode = res.statusCode;
        this.requests.byStatus[statusCode] = (this.requests.byStatus[statusCode] || 0) + 1;

        if (statusCode >= 200 && statusCode < 400) {
            this.requests.success++;
        } else if (statusCode >= 400) {
            this.requests.errors++;
        }

        // Record by method
        const method = req.method;
        this.requests.byMethod[method] = (this.requests.byMethod[method] || 0) + 1;

        // Record by path (normalize to avoid too many unique paths)
        const path = this.normalizePath(req.path);
        this.requests.byPath[path] = (this.requests.byPath[path] || 0) + 1;

        // Record by service
        const service = this.extractService(req.path);
        if (service) {
            this.requests.byService[service] = (this.requests.byService[service] || 0) + 1;
        }

        // Record response time
        if (responseTime !== undefined) {
            this.recordResponseTime(responseTime);
        }
    }

    /**
     * Record response time
     */
    recordResponseTime(time) {
        this.responseTimes.push({
            time,
            timestamp: Date.now()
        });

        // Keep only recent data
        const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour
        this.responseTimes = this.responseTimes.filter(rt => rt.timestamp > cutoff);

        // Update histogram
        if (time < 50) {
            this.responseTimeHistogram['0-50ms']++;
        } else if (time < 100) {
            this.responseTimeHistogram['50-100ms']++;
        } else if (time < 200) {
            this.responseTimeHistogram['100-200ms']++;
        } else if (time < 500) {
            this.responseTimeHistogram['200-500ms']++;
        } else if (time < 1000) {
            this.responseTimeHistogram['500-1000ms']++;
        } else if (time < 2000) {
            this.responseTimeHistogram['1000-2000ms']++;
        } else {
            this.responseTimeHistogram['2000ms+']++;
        }
    }

    /**
     * Record service metric
     */
    recordServiceMetric(serviceName, metric, value) {
        if (!this.serviceMetrics.has(serviceName)) {
            this.serviceMetrics.set(serviceName, {});
        }

        const serviceMetrics = this.serviceMetrics.get(serviceName);
        if (!serviceMetrics[metric]) {
            serviceMetrics[metric] = [];
        }

        serviceMetrics[metric].push({
            value,
            timestamp: Date.now()
        });

        // Keep only recent data
        const cutoff = Date.now() - (60 * 60 * 1000);
        serviceMetrics[metric] = serviceMetrics[metric].filter(m => m.timestamp > cutoff);
    }

    /**
     * Normalize path for metrics
     */
    normalizePath(path) {
        // Replace IDs with placeholders
        return path
            .replace(/\/\d+/g, '/:id')
            .replace(/\/[a-f0-9]{24}/g, '/:id') // MongoDB ObjectIds
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:uuid'); // UUIDs
    }

    /**
     * Extract service from path
     */
    extractService(path) {
        const match = path.match(/^\/api\/([^\/]+)/);
        return match ? match[1] : null;
    }

    /**
     * Start collecting system metrics
     */
    startCollecting() {
        this.collectInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, this.interval);

        // Collect initial metrics
        this.collectSystemMetrics();
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const metrics = {
            timestamp: Date.now(),
            cpu: {
                usage: this.getCPUUsage(),
                loadAvg: os.loadavg()
            },
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
            },
            process: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };

        this.systemMetrics.push(metrics);

        // Keep only recent data
        if (this.systemMetrics.length > this.maxDataPoints) {
            this.systemMetrics = this.systemMetrics.slice(-this.maxDataPoints);
        }
    }

    /**
     * Get CPU usage percentage
     */
    getCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);

        return usage;
    }

    /**
     * Get metrics summary
     */
    getMetrics() {
        const now = Date.now();
        const responseTimeStats = this.calculateResponseTimeStats();
        const currentSystem = this.systemMetrics[this.systemMetrics.length - 1] || {};

        return {
            timestamp: new Date(now).toISOString(),
            uptime: process.uptime(),
            requests: {
                ...this.requests,
                rate: this.calculateRequestRate()
            },
            responseTime: {
                ...responseTimeStats,
                histogram: this.responseTimeHistogram
            },
            system: currentSystem,
            services: this.getServiceMetrics(),
            health: this.calculateHealthScore()
        };
    }

    /**
     * Calculate response time statistics
     */
    calculateResponseTimeStats() {
        if (this.responseTimes.length === 0) {
            return {
                min: 0,
                max: 0,
                avg: 0,
                median: 0,
                p95: 0,
                p99: 0
            };
        }

        const times = this.responseTimes.map(rt => rt.time).sort((a, b) => a - b);
        const sum = times.reduce((a, b) => a + b, 0);

        return {
            min: times[0],
            max: times[times.length - 1],
            avg: Math.round(sum / times.length),
            median: times[Math.floor(times.length / 2)],
            p95: times[Math.floor(times.length * 0.95)],
            p99: times[Math.floor(times.length * 0.99)]
        };
    }

    /**
     * Calculate request rate
     */
    calculateRequestRate() {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const recentRequests = this.responseTimes.filter(rt => rt.timestamp > fiveMinutesAgo).length;
        return (recentRequests / 5).toFixed(2); // Requests per minute
    }

    /**
     * Get service metrics
     */
    getServiceMetrics() {
        const metrics = {};

        for (const [service, data] of this.serviceMetrics.entries()) {
            metrics[service] = {};

            for (const [metric, values] of Object.entries(data)) {
                if (values.length > 0) {
                    const recentValues = values.map(v => v.value);
                    metrics[service][metric] = {
                        current: recentValues[recentValues.length - 1],
                        avg: recentValues.reduce((a, b) => a + b, 0) / recentValues.length,
                        min: Math.min(...recentValues),
                        max: Math.max(...recentValues)
                    };
                }
            }
        }

        return metrics;
    }

    /**
     * Calculate health score
     */
    calculateHealthScore() {
        let score = 100;

        // Deduct for error rate
        const errorRate = this.requests.total > 0
            ? (this.requests.errors / this.requests.total) * 100
            : 0;
        score -= Math.min(30, errorRate * 3);

        // Deduct for slow response times
        const stats = this.calculateResponseTimeStats();
        if (stats.avg > 1000) score -= 10;
        if (stats.avg > 2000) score -= 20;
        if (stats.p95 > 3000) score -= 10;

        // Deduct for high memory usage
        const currentSystem = this.systemMetrics[this.systemMetrics.length - 1];
        if (currentSystem?.memory?.usage > 80) score -= 10;
        if (currentSystem?.memory?.usage > 90) score -= 20;

        return Math.max(0, Math.round(score));
    }

    /**
     * Reset metrics
     */
    reset() {
        this.requests = {
            total: 0,
            success: 0,
            errors: 0,
            byStatus: {},
            byMethod: {},
            byPath: {},
            byService: {}
        };

        this.responseTimes = [];
        this.responseTimeHistogram = {
            '0-50ms': 0,
            '50-100ms': 0,
            '100-200ms': 0,
            '200-500ms': 0,
            '500-1000ms': 0,
            '1000-2000ms': 0,
            '2000ms+': 0
        };

        this.serviceMetrics.clear();
    }

    /**
     * Stop collecting
     */
    stop() {
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }
    }
}

module.exports = { MetricsCollector };
