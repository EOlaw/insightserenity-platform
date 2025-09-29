/**
 * @fileoverview PerformanceMonitor - Monitors database performance metrics
 * @module shared/lib/database/monitoring/performance-monitor
 * @requires events
 * @requires winston
 * @requires perf_hooks
 */

const { EventEmitter } = require('events');
const winston = require('winston');
const { performance, PerformanceObserver } = require('perf_hooks');
const os = require('os');

/**
 * @class PerformanceMonitor
 * @extends EventEmitter
 * @description Monitors and tracks database performance metrics with detailed analytics
 */
class PerformanceMonitor extends EventEmitter {
    /**
     * Creates an instance of PerformanceMonitor
     * @param {Object} options - Configuration options
     * @param {ConnectionManager} options.connectionManager - Connection manager instance
     * @param {winston.Logger} options.logger - Logger instance
     * @param {Object} options.config - Performance monitoring configuration
     */
    constructor(options = {}) {
        super();

        // Validate required dependencies
        if (!options.connectionManager) {
            throw new Error('ConnectionManager instance is required');
        }

        this.connectionManager = options.connectionManager;
        this.logger = options.logger || this._createDefaultLogger();

        // Performance monitoring configuration
        this.config = {
            enabled: options.config?.enabled !== false,
            interval: options.config?.interval || 60000, // 1 minute
            sampleRate: options.config?.sampleRate || 0.1, // Sample 10% of queries

            // Metrics to track
            metrics: {
                queries: options.config?.metrics?.queries !== false,
                connections: options.config?.metrics?.connections !== false,
                operations: options.config?.metrics?.operations !== false,
                memory: options.config?.metrics?.memory !== false,
                cpu: options.config?.metrics?.cpu !== false,
                network: options.config?.metrics?.network !== false
            },

            // Thresholds for performance issues
            thresholds: {
                slowQuery: options.config?.thresholds?.slowQuery || 1000, // 1 second
                slowOperation: options.config?.thresholds?.slowOperation || 500,
                highMemory: options.config?.thresholds?.highMemory || 500 * 1024 * 1024, // 500MB
                highCpu: options.config?.thresholds?.highCpu || 80, // 80%
                ...options.config?.thresholds
            },

            // Aggregation settings
            aggregation: {
                enabled: options.config?.aggregation?.enabled !== false,
                window: options.config?.aggregation?.window || 300000, // 5 minutes
                buckets: options.config?.aggregation?.buckets || 10
            },

            // Storage settings
            storage: {
                maxMetrics: options.config?.storage?.maxMetrics || 10000,
                maxHistory: options.config?.storage?.maxHistory || 1000,
                compressionEnabled: options.config?.storage?.compressionEnabled !== false
            },

            ...options.config
        };

        // Performance state
        this.state = {
            monitoring: false,
            startTime: Date.now(),
            lastUpdate: null,
            totalMeasurements: 0
        };

        // Performance metrics storage
        this.metrics = {
            queries: {
                total: 0,
                successful: 0,
                failed: 0,
                slow: 0,
                byType: new Map(),
                byDatabase: new Map(),
                byCollection: new Map(),
                responseTime: {
                    min: Infinity,
                    max: 0,
                    average: 0,
                    median: 0,
                    p95: 0,
                    p99: 0,
                    samples: []
                }
            },
            operations: {
                total: 0,
                byType: new Map(),
                responseTime: new Map(),
                errors: new Map()
            },
            connections: {
                created: 0,
                closed: 0,
                active: 0,
                idle: 0,
                poolSize: 0,
                waitQueue: 0,
                checkouts: 0,
                checkins: 0,
                timeouts: 0
            },
            system: {
                memory: {
                    process: {},
                    system: {},
                    history: []
                },
                cpu: {
                    usage: 0,
                    history: []
                },
                gc: {
                    collections: 0,
                    pauseTime: 0,
                    history: []
                }
            }
        };

        // Aggregated metrics
        this.aggregatedMetrics = {
            windows: [],
            current: null
        };

        // Performance marks
        this.marks = new Map();
        this.measures = new Map();

        // Monitoring timer
        this.monitoringTimer = null;

        // Performance observer
        this.performanceObserver = null;

        // Initialize if enabled
        if (this.config.enabled) {
            this.start();
        }

        this.logger.info('PerformanceMonitor initialized', {
            enabled: this.config.enabled,
            interval: this.config.interval,
            sampleRate: this.config.sampleRate
        });
    }

    /**
     * Creates a default Winston logger
     * @private
     * @returns {winston.Logger} Logger instance
     */
    _createDefaultLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'performance-monitor' },
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Starts performance monitoring
     */
    start() {
        if (this.state.monitoring) {
            this.logger.warn('Performance monitoring is already running');
            return;
        }

        this.logger.info('Starting performance monitoring');

        // Setup performance observer
        this._setupPerformanceObserver();

        // Setup metric collection
        this._setupMetricCollection();

        // Start periodic collection
        this.monitoringTimer = setInterval(() => {
            this._collectMetrics();
        }, this.config.interval);

        // Initial collection
        this._collectMetrics();

        // Update state
        this.state.monitoring = true;
        this.state.startTime = Date.now();

        // Emit start event
        this.emit('monitoring:started');
    }

    /**
     * Stops performance monitoring
     */
    stop() {
        if (!this.state.monitoring) {
            this.logger.warn('Performance monitoring is not running');
            return;
        }

        this.logger.info('Stopping performance monitoring');

        // Clear timer
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }

        // Disconnect observer
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
            this.performanceObserver = null;
        }

        // Update state
        this.state.monitoring = false;

        // Emit stop event
        this.emit('monitoring:stopped');
    }

    /**
     * Sets up performance observer
     * @private
     */
    _setupPerformanceObserver() {
        this.performanceObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this._processPerformanceEntry(entry);
            }
        });

        // Observe different entry types
        this.performanceObserver.observe({
            entryTypes: ['measure', 'mark', 'function', 'gc']
        });
    }

    /**
     * Sets up metric collection hooks
     * @private
     */
    _setupMetricCollection() {
        // Hook into database manager events
        const databaseManager = this.connectionManager.databaseManager;

        databaseManager.on('connection:created', (data) => {
            this.metrics.connections.created++;
            this._recordMetric('connection.created', data.duration);
        });

        databaseManager.on('connection:closed', (data) => {
            this.metrics.connections.closed++;
        });

        databaseManager.on('query:executed', (data) => {
            this._recordQueryMetric(data);
        });

        // Hook into model router events
        const modelRouter = this.connectionManager.modelRouter;

        modelRouter.on('model:registered', (data) => {
            this._recordMetric('model.registered', data.duration);
        });

        modelRouter.on('model:loaded', (data) => {
            this._recordMetric('model.loaded', data.duration);
        });
    }

    /**
     * Collects metrics
     * @private
     */
    async _collectMetrics() {
        const timestamp = Date.now();

        try {
            // Collect system metrics
            if (this.config.metrics.memory) {
                await this._collectMemoryMetrics();
            }

            if (this.config.metrics.cpu) {
                await this._collectCpuMetrics();
            }

            // Collect connection metrics
            if (this.config.metrics.connections) {
                await this._collectConnectionMetrics();
            }

            // Aggregate metrics if enabled
            if (this.config.aggregation.enabled) {
                this._aggregateMetrics(timestamp);
            }

            // Clean up old metrics
            this._cleanupMetrics();

            // Update state
            this.state.lastUpdate = timestamp;

            // Emit metrics event
            this.emit('metrics:collected', {
                timestamp,
                metrics: this.getMetrics()
            });

        } catch (error) {
            this.logger.error('Failed to collect metrics', {
                error: error.message
            });
        }
    }

    /**
     * Collects memory metrics
     * @private
     */
    async _collectMemoryMetrics() {
        // Process memory
        const processMemory = process.memoryUsage();
        this.metrics.system.memory.process = {
            rss: processMemory.rss,
            heapTotal: processMemory.heapTotal,
            heapUsed: processMemory.heapUsed,
            external: processMemory.external,
            arrayBuffers: processMemory.arrayBuffers
        };

        // System memory
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        this.metrics.system.memory.system = {
            total: totalMemory,
            free: freeMemory,
            used: totalMemory - freeMemory,
            usage: ((totalMemory - freeMemory) / totalMemory) * 100
        };

        // Store history
        this.metrics.system.memory.history.push({
            timestamp: Date.now(),
            process: processMemory.heapUsed,
            system: totalMemory - freeMemory
        });

        // Keep only recent history
        if (this.metrics.system.memory.history.length > this.config.storage.maxHistory) {
            this.metrics.system.memory.history =
                this.metrics.system.memory.history.slice(-this.config.storage.maxHistory);
        }

        // Check for high memory usage
        if (processMemory.heapUsed > this.config.thresholds.highMemory) {
            this.emit('performance:warning', {
                type: 'memory',
                message: `High memory usage: ${(processMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                value: processMemory.heapUsed
            });
        }
    }

    /**
     * Collects CPU metrics
     * @private
     */
    async _collectCpuMetrics() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const cpuUsage = 100 - ((totalIdle / totalTick) * 100);
        this.metrics.system.cpu.usage = cpuUsage;

        // Store history
        this.metrics.system.cpu.history.push({
            timestamp: Date.now(),
            usage: cpuUsage
        });

        // Keep only recent history
        if (this.metrics.system.cpu.history.length > this.config.storage.maxHistory) {
            this.metrics.system.cpu.history =
                this.metrics.system.cpu.history.slice(-this.config.storage.maxHistory);
        }

        // Check for high CPU usage
        if (cpuUsage > this.config.thresholds.highCpu) {
            this.emit('performance:warning', {
                type: 'cpu',
                message: `High CPU usage: ${cpuUsage.toFixed(2)}%`,
                value: cpuUsage
            });
        }
    }

    /**
     * Collects connection metrics
     * @private
     */
    async _collectConnectionMetrics() {
        const connections = this.connectionManager.databaseManager.getAllConnections();

        let totalActive = 0;
        let totalIdle = 0;
        let totalPoolSize = 0;

        for (const [name, connection] of connections) {
            const poolMetrics = await this._getConnectionPoolMetrics(connection);

            totalActive += poolMetrics.inUse;
            totalIdle += poolMetrics.available;
            totalPoolSize += poolMetrics.total;
        }

        this.metrics.connections.active = totalActive;
        this.metrics.connections.idle = totalIdle;
        this.metrics.connections.poolSize = totalPoolSize;
    }

    /**
     * Gets connection pool metrics
     * @private
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Connection pool metrics
     */
    async _getConnectionPoolMetrics(connection) {
        const client = connection.getClient();
        const metrics = {
            total: 0,
            available: 0,
            inUse: 0,
            pending: 0
        };

        if (!client) return metrics;

        try {
            const topology = client.topology;
            if (!topology) return metrics;

            const servers = topology.s?.servers;
            if (!servers) return metrics;

            servers.forEach(server => {
                if (server.s?.pool) {
                    const pool = server.s.pool;
                    metrics.total += pool.totalConnectionCount || 0;
                    metrics.available += pool.availableConnectionCount || 0;
                    metrics.pending += pool.pendingConnectionCount || 0;
                }
            });

            metrics.inUse = metrics.total - metrics.available;

        } catch (error) {
            this.logger.error('Failed to get connection pool metrics', {
                error: error.message
            });
        }

        return metrics;
    }

    /**
     * Records a query metric
     * @private
     * @param {Object} data - Query data
     */
    _recordQueryMetric(data) {
        // Apply sampling
        if (Math.random() > this.config.sampleRate) {
            return;
        }

        this.metrics.queries.total++;

        if (data.success) {
            this.metrics.queries.successful++;
        } else {
            this.metrics.queries.failed++;
        }

        // Record by type
        const queryType = data.type || 'unknown';
        const typeCount = this.metrics.queries.byType.get(queryType) || 0;
        this.metrics.queries.byType.set(queryType, typeCount + 1);

        // Record by database
        const database = data.database || 'unknown';
        const dbCount = this.metrics.queries.byDatabase.get(database) || 0;
        this.metrics.queries.byDatabase.set(database, dbCount + 1);

        // Record by collection
        if (data.collection) {
            const collCount = this.metrics.queries.byCollection.get(data.collection) || 0;
            this.metrics.queries.byCollection.set(data.collection, collCount + 1);
        }

        // Record response time
        if (data.duration) {
            this._recordResponseTime(data.duration);

            // Check for slow query
            if (data.duration > this.config.thresholds.slowQuery) {
                this.metrics.queries.slow++;

                this.emit('performance:slowQuery', {
                    type: queryType,
                    database,
                    collection: data.collection,
                    duration: data.duration,
                    query: data.query
                });
            }
        }
    }

    /**
     * Records response time
     * @private
     * @param {number} duration - Response time in milliseconds
     */
    _recordResponseTime(duration) {
        const rt = this.metrics.queries.responseTime;

        // Update min/max
        rt.min = Math.min(rt.min, duration);
        rt.max = Math.max(rt.max, duration);

        // Add to samples
        rt.samples.push(duration);

        // Keep only recent samples
        if (rt.samples.length > this.config.storage.maxMetrics) {
            rt.samples = rt.samples.slice(-this.config.storage.maxMetrics);
        }

        // Calculate statistics
        this._calculateResponseTimeStats();
    }

    /**
     * Calculates response time statistics
     * @private
     */
    _calculateResponseTimeStats() {
        const rt = this.metrics.queries.responseTime;

        if (rt.samples.length === 0) return;

        // Sort samples
        const sorted = [...rt.samples].sort((a, b) => a - b);

        // Calculate average
        const sum = sorted.reduce((s, v) => s + v, 0);
        rt.average = sum / sorted.length;

        // Calculate median
        const mid = Math.floor(sorted.length / 2);
        rt.median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];

        // Calculate percentiles
        rt.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        rt.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    }

    /**
     * Records a metric
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {Object} tags - Optional tags
     */
    recordMetric(name, value, tags = {}) {
        this._recordMetric(name, value, tags);
    }

    /**
     * Records a metric internally
     * @private
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {Object} tags - Optional tags
     */
    _recordMetric(name, value, tags = {}) {
        // Parse metric name
        const parts = name.split('.');
        const category = parts[0];
        const operation = parts.slice(1).join('.');

        // Update operations metrics
        this.metrics.operations.total++;

        const opCount = this.metrics.operations.byType.get(operation) || 0;
        this.metrics.operations.byType.set(operation, opCount + 1);

        // Store response time
        if (!this.metrics.operations.responseTime.has(operation)) {
            this.metrics.operations.responseTime.set(operation, []);
        }

        const times = this.metrics.operations.responseTime.get(operation);
        times.push(value);

        // Keep only recent times
        if (times.length > 100) {
            times.shift();
        }

        // Check for slow operation
        if (value > this.config.thresholds.slowOperation) {
            this.emit('performance:slowOperation', {
                operation,
                duration: value,
                tags
            });
        }
    }

    /**
     * Processes performance entry
     * @private
     * @param {PerformanceEntry} entry - Performance entry
     */
    _processPerformanceEntry(entry) {
        switch (entry.entryType) {
            case 'measure':
                this._processMeasure(entry);
                break;

            case 'gc':
                this._processGC(entry);
                break;

            case 'function':
                this._processFunction(entry);
                break;
        }
    }

    /**
     * Processes a measure entry
     * @private
     * @param {PerformanceEntry} entry - Measure entry
     */
    _processMeasure(entry) {
        this.measures.set(entry.name, {
            duration: entry.duration,
            startTime: entry.startTime,
            timestamp: Date.now()
        });

        // Record as metric
        this._recordMetric(`measure.${entry.name}`, entry.duration);
    }

    /**
     * Processes a GC entry
     * @private
     * @param {PerformanceEntry} entry - GC entry
     */
    _processGC(entry) {
        this.metrics.system.gc.collections++;
        this.metrics.system.gc.pauseTime += entry.duration;

        this.metrics.system.gc.history.push({
            timestamp: Date.now(),
            duration: entry.duration,
            kind: entry.kind
        });

        // Keep only recent history
        if (this.metrics.system.gc.history.length > 100) {
            this.metrics.system.gc.history = this.metrics.system.gc.history.slice(-100);
        }
    }

    /**
     * Processes a function entry
     * @private
     * @param {PerformanceEntry} entry - Function entry
     */
    _processFunction(entry) {
        this._recordMetric(`function.${entry.name}`, entry.duration);
    }

    /**
     * Starts a performance measurement
     * @param {string} name - Measurement name
     */
    startMeasure(name) {
        performance.mark(`${name}-start`);
        this.marks.set(name, performance.now());
    }

    /**
     * Ends a performance measurement
     * @param {string} name - Measurement name
     * @returns {number} Duration in milliseconds
     */
    endMeasure(name) {
        const startTime = this.marks.get(name);
        if (!startTime) {
            this.logger.warn(`No start mark found for measurement: ${name}`);
            return 0;
        }

        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);

        const duration = performance.now() - startTime;
        this.marks.delete(name);

        return duration;
    }

    /**
     * Aggregates metrics
     * @private
     * @param {number} timestamp - Current timestamp
     */
    _aggregateMetrics(timestamp) {
        // Create new window if needed
        if (!this.aggregatedMetrics.current ||
            timestamp - this.aggregatedMetrics.current.startTime > this.config.aggregation.window) {

            // Save current window
            if (this.aggregatedMetrics.current) {
                this.aggregatedMetrics.windows.push(this.aggregatedMetrics.current);

                // Keep only recent windows
                const maxWindows = Math.ceil(3600000 / this.config.aggregation.window); // 1 hour
                if (this.aggregatedMetrics.windows.length > maxWindows) {
                    this.aggregatedMetrics.windows =
                        this.aggregatedMetrics.windows.slice(-maxWindows);
                }
            }

            // Create new window
            this.aggregatedMetrics.current = {
                startTime: timestamp,
                endTime: null,
                queries: {
                    count: 0,
                    responseTime: {
                        sum: 0,
                        count: 0,
                        min: Infinity,
                        max: 0
                    }
                },
                operations: {
                    count: 0,
                    byType: new Map()
                },
                errors: {
                    count: 0,
                    byType: new Map()
                }
            };
        }

        // Update current window
        const window = this.aggregatedMetrics.current;

        // Aggregate query metrics
        window.queries.count = this.metrics.queries.total;

        if (this.metrics.queries.responseTime.samples.length > 0) {
            const recent = this.metrics.queries.responseTime.samples.slice(-100);
            window.queries.responseTime.sum = recent.reduce((s, v) => s + v, 0);
            window.queries.responseTime.count = recent.length;
            window.queries.responseTime.min = Math.min(...recent);
            window.queries.responseTime.max = Math.max(...recent);
        }

        // Aggregate operation metrics
        window.operations.count = this.metrics.operations.total;
        window.operations.byType = new Map(this.metrics.operations.byType);

        // Update end time
        window.endTime = timestamp;
    }

    /**
     * Cleans up old metrics
     * @private
     */
    _cleanupMetrics() {
        // Clean up query samples
        if (this.metrics.queries.responseTime.samples.length > this.config.storage.maxMetrics) {
            this.metrics.queries.responseTime.samples =
                this.metrics.queries.responseTime.samples.slice(-this.config.storage.maxMetrics);
        }

        // Clean up operation response times
        for (const [op, times] of this.metrics.operations.responseTime) {
            if (times.length > 100) {
                this.metrics.operations.responseTime.set(op, times.slice(-100));
            }
        }

        // Clean up measures
        const measureCutoff = Date.now() - 3600000; // 1 hour
        for (const [name, measure] of this.measures) {
            if (measure.timestamp < measureCutoff) {
                this.measures.delete(name);
            }
        }
    }

    /**
     * Gets current metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            uptime: Date.now() - this.state.startTime,
            queries: {
                ...this.metrics.queries,
                byType: Object.fromEntries(this.metrics.queries.byType),
                byDatabase: Object.fromEntries(this.metrics.queries.byDatabase),
                byCollection: Object.fromEntries(this.metrics.queries.byCollection)
            },
            operations: {
                ...this.metrics.operations,
                byType: Object.fromEntries(this.metrics.operations.byType),
                responseTime: Object.fromEntries(
                    Array.from(this.metrics.operations.responseTime.entries())
                        .map(([op, times]) => [op, {
                            average: times.reduce((s, v) => s + v, 0) / times.length || 0,
                            min: Math.min(...times) || 0,
                            max: Math.max(...times) || 0
                        }])
                )
            },
            connections: this.metrics.connections,
            system: this.metrics.system
        };
    }

    /**
     * Gets aggregated metrics
     * @returns {Object} Aggregated metrics
     */
    getAggregatedMetrics() {
        return {
            current: this.aggregatedMetrics.current,
            windows: this.aggregatedMetrics.windows
        };
    }

    /**
     * Resets metrics
     */
    resetMetrics() {
        // Reset query metrics
        this.metrics.queries = {
            total: 0,
            successful: 0,
            failed: 0,
            slow: 0,
            byType: new Map(),
            byDatabase: new Map(),
            byCollection: new Map(),
            responseTime: {
                min: Infinity,
                max: 0,
                average: 0,
                median: 0,
                p95: 0,
                p99: 0,
                samples: []
            }
        };

        // Reset operation metrics
        this.metrics.operations = {
            total: 0,
            byType: new Map(),
            responseTime: new Map(),
            errors: new Map()
        };

        // Reset connection metrics (keep current values)

        // Reset system metrics (keep current values)

        // Reset aggregated metrics
        this.aggregatedMetrics = {
            windows: [],
            current: null
        };

        // Update state
        this.state.startTime = Date.now();
        this.state.totalMeasurements = 0;

        this.logger.info('Performance metrics reset');
    }

    /**
     * Generates a performance report
     * @returns {Object} Performance report
     */
    generateReport() {
        const metrics = this.getMetrics();
        const aggregated = this.getAggregatedMetrics();

        return {
            summary: {
                uptime: metrics.uptime,
                totalQueries: metrics.queries.total,
                successRate: (metrics.queries.successful / metrics.queries.total * 100).toFixed(2) + '%',
                averageResponseTime: metrics.queries.responseTime.average.toFixed(2) + 'ms',
                slowQueries: metrics.queries.slow,
                activeConnections: metrics.connections.active,
                memoryUsage: (metrics.system.memory.process.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
                cpuUsage: metrics.system.cpu.usage.toFixed(2) + '%'
            },
            queries: {
                total: metrics.queries.total,
                successful: metrics.queries.successful,
                failed: metrics.queries.failed,
                slow: metrics.queries.slow,
                responseTime: {
                    min: metrics.queries.responseTime.min.toFixed(2) + 'ms',
                    max: metrics.queries.responseTime.max.toFixed(2) + 'ms',
                    average: metrics.queries.responseTime.average.toFixed(2) + 'ms',
                    median: metrics.queries.responseTime.median.toFixed(2) + 'ms',
                    p95: metrics.queries.responseTime.p95.toFixed(2) + 'ms',
                    p99: metrics.queries.responseTime.p99.toFixed(2) + 'ms'
                },
                topTypes: Array.from(metrics.queries.byType.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10),
                topDatabases: Array.from(metrics.queries.byDatabase.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10),
                topCollections: Array.from(metrics.queries.byCollection.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
            },
            system: {
                memory: {
                    process: metrics.system.memory.process,
                    system: metrics.system.memory.system
                },
                cpu: {
                    usage: metrics.system.cpu.usage,
                    cores: os.cpus().length
                },
                gc: metrics.system.gc
            },
            trends: {
                memory: this._calculateTrend(metrics.system.memory.history, 'process'),
                cpu: this._calculateTrend(metrics.system.cpu.history, 'usage')
            }
        };
    }

    /**
     * Calculates trend
     * @private
     * @param {Array} history - History data
     * @param {string} field - Field to analyze
     * @returns {Object} Trend information
     */
    _calculateTrend(history, field) {
        if (history.length < 2) {
            return { direction: 'stable', change: 0 };
        }

        const recent = history.slice(-10);
        const older = history.slice(-20, -10);

        const recentAvg = recent.reduce((s, h) => s + h[field], 0) / recent.length;
        const olderAvg = older.length > 0
            ? older.reduce((s, h) => s + h[field], 0) / older.length
            : recentAvg;

        const change = ((recentAvg - olderAvg) / olderAvg) * 100;

        return {
            direction: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
            change: change.toFixed(2) + '%'
        };
    }

    /**
     * Cleans up resources
     */
    cleanup() {
        this.stop();
        this.removeAllListeners();

        this.logger.info('PerformanceMonitor cleanup completed');
    }
}

module.exports = PerformanceMonitor;
