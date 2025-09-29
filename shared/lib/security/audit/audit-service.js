const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const AuditLogger = require('./audit-logger');
const AuditEvents = require('./audit-events');
const ComplianceReporter = require('./compliance-reporter');
const AuditTrail = require('./audit-trail');

/**
 * AuditService - Comprehensive audit service for security and compliance
 * Manages audit logging, event tracking, compliance reporting, and audit trails
 */
class AuditService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            logLevel: config.logLevel || 'info',
            logPath: config.logPath || './logs/audit',
            maxLogSize: config.maxLogSize || 100 * 1024 * 1024, // 100MB
            maxLogAge: config.maxLogAge || 90 * 24 * 60 * 60 * 1000, // 90 days
            rotationInterval: config.rotationInterval || 24 * 60 * 60 * 1000, // Daily
            compressionEnabled: config.compressionEnabled !== false,
            encryptionEnabled: config.encryptionEnabled !== false,
            tamperProtection: config.tamperProtection !== false,
            realTimeAlerts: config.realTimeAlerts !== false,
            alertThresholds: config.alertThresholds || {},
            complianceStandards: config.complianceStandards || ['SOC2', 'ISO27001', 'GDPR'],
            retentionPolicy: config.retentionPolicy || {},
            indexingEnabled: config.indexingEnabled !== false,
            searchEnabled: config.searchEnabled !== false,
            aggregationEnabled: config.aggregationEnabled !== false,
            correlationEnabled: config.correlationEnabled !== false,
            anomalyDetection: config.anomalyDetection || false,
            externalIntegration: config.externalIntegration || null,
            bufferSize: config.bufferSize || 1000,
            flushInterval: config.flushInterval || 5000, // 5 seconds
            timezone: config.timezone || 'UTC',
            includeSystemInfo: config.includeSystemInfo !== false,
            includeStackTrace: config.includeStackTrace || false,
            sanitizeData: config.sanitizeData !== false,
            customFields: config.customFields || {}
        };

        this.auditLogger = null;
        this.auditEvents = null;
        this.complianceReporter = null;
        this.auditTrail = null;

        this.buffer = [];
        this.indexes = new Map();
        this.correlations = new Map();
        this.anomalies = [];
        this.alerts = [];
        this.sessions = new Map();

        this.statistics = {
            totalEvents: 0,
            eventsByType: {},
            eventsBySeverity: {},
            eventsByUser: {},
            eventsByResource: {},
            alertsTriggered: 0,
            anomaliesDetected: 0,
            complianceViolations: 0,
            errors: 0,
            lastFlush: null,
            bufferFlushes: 0,
            averageEventSize: 0,
            peakBufferSize: 0
        };

        this.eventTypes = {
            AUTHENTICATION: 'authentication',
            AUTHORIZATION: 'authorization',
            DATA_ACCESS: 'data_access',
            DATA_MODIFICATION: 'data_modification',
            DATA_DELETION: 'data_deletion',
            CONFIGURATION_CHANGE: 'configuration_change',
            SECURITY_EVENT: 'security_event',
            SYSTEM_EVENT: 'system_event',
            ERROR_EVENT: 'error_event',
            COMPLIANCE_EVENT: 'compliance_event',
            ADMIN_ACTION: 'admin_action',
            USER_ACTION: 'user_action',
            API_CALL: 'api_call',
            FILE_OPERATION: 'file_operation',
            NETWORK_EVENT: 'network_event'
        };

        this.severityLevels = {
            CRITICAL: 'critical',
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low',
            INFO: 'info',
            DEBUG: 'debug'
        };

        this.actions = {
            CREATE: 'create',
            READ: 'read',
            UPDATE: 'update',
            DELETE: 'delete',
            EXECUTE: 'execute',
            LOGIN: 'login',
            LOGOUT: 'logout',
            GRANT: 'grant',
            REVOKE: 'revoke',
            APPROVE: 'approve',
            REJECT: 'reject',
            EXPORT: 'export',
            IMPORT: 'import',
            BACKUP: 'backup',
            RESTORE: 'restore'
        };

        this.resourceTypes = {
            USER: 'user',
            ROLE: 'role',
            PERMISSION: 'permission',
            DATA: 'data',
            FILE: 'file',
            DATABASE: 'database',
            API: 'api',
            SYSTEM: 'system',
            CONFIGURATION: 'configuration',
            KEY: 'key',
            TOKEN: 'token',
            SESSION: 'session',
            POLICY: 'policy',
            RULE: 'rule',
            REPORT: 'report'
        };

        this.outcomes = {
            SUCCESS: 'success',
            FAILURE: 'failure',
            PARTIAL: 'partial',
            PENDING: 'pending',
            DENIED: 'denied',
            ERROR: 'error',
            TIMEOUT: 'timeout',
            CANCELLED: 'cancelled'
        };

        this.isInitialized = false;
        this.flushTimer = null;
        this.rotationTimer = null;
    }

    /**
     * Initialize the audit service
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.emit('disabled');
                return;
            }

            // Create audit log directory
            await this.createAuditDirectory();

            // Initialize components
            this.auditLogger = new AuditLogger({
                logPath: this.config.logPath,
                maxLogSize: this.config.maxLogSize,
                compressionEnabled: this.config.compressionEnabled,
                encryptionEnabled: this.config.encryptionEnabled
            });
            await this.auditLogger.initialize();

            this.auditEvents = new AuditEvents({
                eventTypes: this.eventTypes,
                severityLevels: this.severityLevels
            });

            this.complianceReporter = new ComplianceReporter({
                standards: this.config.complianceStandards,
                reportPath: path.join(this.config.logPath, 'compliance')
            });
            await this.complianceReporter.initialize();

            this.auditTrail = new AuditTrail({
                trailPath: path.join(this.config.logPath, 'trails'),
                tamperProtection: this.config.tamperProtection
            });
            await this.auditTrail.initialize();

            // Set up buffer flushing
            this.setupBufferFlushing();

            // Set up log rotation
            this.setupLogRotation();

            // Initialize indexes if enabled
            if (this.config.indexingEnabled) {
                await this.initializeIndexes();
            }

            // Initialize anomaly detection if enabled
            if (this.config.anomalyDetection) {
                await this.initializeAnomalyDetection();
            }

            // Initialize external integration if configured
            if (this.config.externalIntegration) {
                await this.initializeExternalIntegration();
            }

            this.isInitialized = true;
            this.emit('initialized');

            // Log initialization event
            await this.logEvent({
                type: this.eventTypes.SYSTEM_EVENT,
                action: 'INITIALIZE',
                resource: 'AuditService',
                outcome: this.outcomes.SUCCESS,
                details: {
                    config: this.getSafeConfig()
                }
            });

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Audit service initialization failed: ${error.message}`);
        }
    }

    /**
     * Log an audit event
     * @param {object} event - Event to log
     * @returns {Promise<object>} Logged event with metadata
     */
    async logEvent(event) {
        try {
            if (!this.config.enabled) {
                return null;
            }

            // Validate event
            this.validateEvent(event);

            // Enrich event with metadata
            const enrichedEvent = this.enrichEvent(event);

            // Check for sensitive data and sanitize if needed
            if (this.config.sanitizeData) {
                this.sanitizeEvent(enrichedEvent);
            }

            // Add to buffer
            this.buffer.push(enrichedEvent);

            // Update statistics
            this.updateStatistics(enrichedEvent);

            // Check for real-time alerts
            if (this.config.realTimeAlerts) {
                await this.checkAlertConditions(enrichedEvent);
            }

            // Check for anomalies
            if (this.config.anomalyDetection) {
                await this.detectAnomalies(enrichedEvent);
            }

            // Correlate with other events
            if (this.config.correlationEnabled) {
                await this.correlateEvent(enrichedEvent);
            }

            // Index event if enabled
            if (this.config.indexingEnabled) {
                await this.indexEvent(enrichedEvent);
            }

            // Flush buffer if full
            if (this.buffer.length >= this.config.bufferSize) {
                await this.flushBuffer();
            }

            // Add to audit trail
            if (this.auditTrail) {
                await this.auditTrail.addEntry(enrichedEvent);
            }

            // Check compliance
            if (this.complianceReporter) {
                await this.complianceReporter.checkCompliance(enrichedEvent);
            }

            this.emit('eventLogged', enrichedEvent);

            return enrichedEvent;

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);

            // Log error as audit event if possible
            try {
                await this.logErrorEvent(error, event);
            } catch (innerError) {
                console.error('Failed to log error event:', innerError);
            }

            throw new Error(`Failed to log audit event: ${error.message}`);
        }
    }

    /**
     * Log multiple events in batch
     * @param {array} events - Array of events to log
     * @returns {Promise<array>} Logged events
     */
    async logBatch(events) {
        const results = [];

        for (const event of events) {
            try {
                const result = await this.logEvent(event);
                results.push(result);
            } catch (error) {
                results.push({ error: error.message, event });
            }
        }

        return results;
    }

    /**
     * Search audit logs
     * @param {object} query - Search query
     * @returns {Promise<array>} Search results
     */
    async search(query) {
        if (!this.config.searchEnabled) {
            throw new Error('Search is not enabled');
        }

        try {
            const results = [];

            // Search in buffer first
            const bufferResults = this.searchBuffer(query);
            results.push(...bufferResults);

            // Search in persisted logs
            if (this.auditLogger) {
                const logResults = await this.auditLogger.search(query);
                results.push(...logResults);
            }

            // Apply filters
            let filtered = this.applyFilters(results, query);

            // Sort results
            if (query.sort) {
                filtered = this.sortResults(filtered, query.sort);
            }

            // Apply pagination
            if (query.limit) {
                const offset = query.offset || 0;
                filtered = filtered.slice(offset, offset + query.limit);
            }

            return filtered;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Generate audit report
     * @param {object} options - Report options
     * @returns {Promise<object>} Audit report
     */
    async generateReport(options = {}) {
        try {
            const startDate = options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const endDate = options.endDate || new Date();
            const format = options.format || 'json';

            // Gather events for the period
            const events = await this.search({
                startDate,
                endDate,
                limit: options.limit || 10000
            });

            // Generate statistics
            const statistics = this.generateStatistics(events);

            // Generate compliance report if needed
            let complianceReport = null;
            if (options.includeCompliance && this.complianceReporter) {
                complianceReport = await this.complianceReporter.generateReport({
                    events,
                    startDate,
                    endDate
                });
            }

            // Generate anomaly report if needed
            let anomalyReport = null;
            if (options.includeAnomalies) {
                anomalyReport = this.generateAnomalyReport(events);
            }

            // Create report
            const report = {
                metadata: {
                    generated: new Date().toISOString(),
                    period: {
                        start: startDate.toISOString(),
                        end: endDate.toISOString()
                    },
                    eventCount: events.length,
                    format
                },
                statistics,
                complianceReport,
                anomalyReport,
                topEvents: this.getTopEvents(events, 10),
                criticalEvents: this.getCriticalEvents(events),
                failedOperations: this.getFailedOperations(events),
                userActivity: this.getUserActivity(events),
                resourceAccess: this.getResourceAccess(events),
                trends: this.analyzeTrends(events)
            };

            // Format report based on requested format
            return this.formatReport(report, format);

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Report generation failed: ${error.message}`);
        }
    }

    /**
     * Export audit logs
     * @param {object} options - Export options
     * @returns {Promise<string>} Export file path
     */
    async exportLogs(options = {}) {
        try {
            const format = options.format || 'json';
            const compress = options.compress !== false;
            const encrypt = options.encrypt || false;

            // Flush buffer before export
            await this.flushBuffer();

            // Get logs to export
            const logs = await this.search(options.query || {});

            // Create export data
            const exportData = {
                metadata: {
                    exported: new Date().toISOString(),
                    count: logs.length,
                    format,
                    compressed: compress,
                    encrypted: encrypt
                },
                logs
            };

            // Format data
            let data;
            switch (format) {
                case 'json':
                    data = JSON.stringify(exportData, null, 2);
                    break;
                case 'csv':
                    data = this.convertToCSV(logs);
                    break;
                case 'xml':
                    data = this.convertToXML(exportData);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            // Compress if needed
            if (compress) {
                const zlib = require('zlib');
                const { promisify } = require('util');
                const gzip = promisify(zlib.gzip);
                data = await gzip(data);
            }

            // Encrypt if needed
            if (encrypt && options.encryptionKey) {
                // Encryption logic would go here
                data = this.encryptData(data, options.encryptionKey);
            }

            // Save to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = compress ? '.gz' : `.${format}`;
            const fileName = `audit-export-${timestamp}${extension}`;
            const filePath = path.join(this.config.logPath, 'exports', fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, data);

            // Log export event
            await this.logEvent({
                type: this.eventTypes.ADMIN_ACTION,
                action: this.actions.EXPORT,
                resource: 'audit-logs',
                outcome: this.outcomes.SUCCESS,
                details: {
                    fileName,
                    recordCount: logs.length,
                    format,
                    compressed: compress,
                    encrypted: encrypt
                }
            });

            return filePath;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Export failed: ${error.message}`);
        }
    }

    /**
     * Archive old audit logs
     * @param {object} options - Archive options
     * @returns {Promise<object>} Archive result
     */
    async archiveLogs(options = {}) {
        try {
            const cutoffDate = options.cutoffDate ||
                new Date(Date.now() - this.config.maxLogAge);

            // Find logs to archive
            const logsToArchive = await this.search({
                endDate: cutoffDate
            });

            if (logsToArchive.length === 0) {
                return {
                    archived: 0,
                    message: 'No logs to archive'
                };
            }

            // Create archive
            const archivePath = await this.exportLogs({
                query: { endDate: cutoffDate },
                format: 'json',
                compress: true,
                encrypt: this.config.encryptionEnabled
            });

            // Delete archived logs if specified
            if (options.deleteAfterArchive) {
                await this.deleteLogs({ endDate: cutoffDate });
            }

            // Log archive event
            await this.logEvent({
                type: this.eventTypes.SYSTEM_EVENT,
                action: this.actions.BACKUP,
                resource: 'audit-logs',
                outcome: this.outcomes.SUCCESS,
                details: {
                    archivePath,
                    recordCount: logsToArchive.length,
                    cutoffDate: cutoffDate.toISOString(),
                    deleted: options.deleteAfterArchive
                }
            });

            return {
                archived: logsToArchive.length,
                archivePath,
                cutoffDate: cutoffDate.toISOString()
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Archive failed: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */

    enrichEvent(event) {
        const enriched = {
            ...event,
            id: this.generateEventId(),
            timestamp: new Date().toISOString(),
            severity: event.severity || this.severityLevels.INFO,
            source: event.source || 'application',
            environment: process.env.NODE_ENV || 'development',
            hostname: require('os').hostname(),
            processId: process.pid,
            ...this.config.customFields
        };

        // Add session information if available
        if (event.sessionId && this.sessions.has(event.sessionId)) {
            enriched.session = this.sessions.get(event.sessionId);
        }

        // Add system information if enabled
        if (this.config.includeSystemInfo) {
            enriched.system = {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                memory: process.memoryUsage(),
                uptime: process.uptime()
            };
        }

        // Add stack trace if enabled and error event
        if (this.config.includeStackTrace && event.error) {
            enriched.stackTrace = event.error.stack;
        }

        // Calculate event hash for integrity
        if (this.config.tamperProtection) {
            const crypto = require('crypto');
            const eventString = JSON.stringify(enriched);
            enriched.hash = crypto.createHash('sha256').update(eventString).digest('hex');
        }

        return enriched;
    }

    validateEvent(event) {
        if (!event) {
            throw new Error('Event is required');
        }

        if (!event.type) {
            throw new Error('Event type is required');
        }

        if (!event.action) {
            throw new Error('Event action is required');
        }

        // Validate against known types if strict mode
        if (this.config.strictValidation) {
            if (!Object.values(this.eventTypes).includes(event.type)) {
                throw new Error(`Unknown event type: ${event.type}`);
            }

            if (event.severity && !Object.values(this.severityLevels).includes(event.severity)) {
                throw new Error(`Unknown severity level: ${event.severity}`);
            }

            if (event.outcome && !Object.values(this.outcomes).includes(event.outcome)) {
                throw new Error(`Unknown outcome: ${event.outcome}`);
            }
        }
    }

    sanitizeEvent(event) {
        const sensitiveFields = [
            'password', 'token', 'secret', 'key', 'apiKey',
            'creditCard', 'ssn', 'pin', 'cvv'
        ];

        const sanitize = (obj) => {
            if (typeof obj !== 'object' || obj === null) {
                return obj;
            }

            for (const key in obj) {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object') {
                    sanitize(obj[key]);
                }
            }

            return obj;
        };

        return sanitize(event);
    }

    async flushBuffer() {
        if (this.buffer.length === 0) {
            return;
        }

        try {
            const events = [...this.buffer];
            this.buffer = [];

            // Write to audit logger
            if (this.auditLogger) {
                await this.auditLogger.writeBatch(events);
            }

            // Send to external integration if configured
            if (this.config.externalIntegration) {
                await this.sendToExternalSystem(events);
            }

            this.statistics.lastFlush = new Date().toISOString();
            this.statistics.bufferFlushes++;

            this.emit('bufferFlushed', {
                eventCount: events.length,
                timestamp: this.statistics.lastFlush
            });

        } catch (error) {
            // Put events back in buffer on error
            this.buffer.unshift(...events);
            throw error;
        }
    }

    setupBufferFlushing() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(async () => {
            try {
                await this.flushBuffer();
            } catch (error) {
                this.emit('error', error);
            }
        }, this.config.flushInterval);
    }

    setupLogRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
        }

        this.rotationTimer = setInterval(async () => {
            try {
                if (this.auditLogger) {
                    await this.auditLogger.rotate();
                }

                // Archive old logs
                await this.archiveLogs({
                    deleteAfterArchive: true
                });

                this.emit('logsRotated');
            } catch (error) {
                this.emit('error', error);
            }
        }, this.config.rotationInterval);
    }

    async checkAlertConditions(event) {
        const alerts = [];

        // Check severity-based alerts
        if (event.severity === this.severityLevels.CRITICAL) {
            alerts.push({
                type: 'CRITICAL_EVENT',
                event,
                timestamp: new Date().toISOString()
            });
        }

        // Check failure-based alerts
        if (event.outcome === this.outcomes.FAILURE) {
            const recentFailures = this.buffer.filter(e =>
                e.outcome === this.outcomes.FAILURE &&
                e.userId === event.userId &&
                Date.now() - new Date(e.timestamp).getTime() < 60000 // Last minute
            );

            if (recentFailures.length >= 5) {
                alerts.push({
                    type: 'MULTIPLE_FAILURES',
                    event,
                    count: recentFailures.length,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Check custom alert thresholds
        for (const [condition, threshold] of Object.entries(this.config.alertThresholds)) {
            if (this.evaluateCondition(event, condition, threshold)) {
                alerts.push({
                    type: 'THRESHOLD_EXCEEDED',
                    condition,
                    threshold,
                    event,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Process alerts
        for (const alert of alerts) {
            this.alerts.push(alert);
            this.statistics.alertsTriggered++;
            this.emit('alert', alert);
        }
    }

    async detectAnomalies(event) {
        // Simple anomaly detection based on patterns
        const anomalies = [];

        // Check for unusual time patterns
        const hour = new Date(event.timestamp).getHours();
        if (hour >= 2 && hour <= 5) {
            anomalies.push({
                type: 'UNUSUAL_TIME',
                description: 'Activity during unusual hours',
                event
            });
        }

        // Check for unusual access patterns
        if (event.type === this.eventTypes.DATA_ACCESS) {
            const recentAccess = this.buffer.filter(e =>
                e.type === this.eventTypes.DATA_ACCESS &&
                e.userId === event.userId &&
                Date.now() - new Date(e.timestamp).getTime() < 60000
            );

            if (recentAccess.length > 100) {
                anomalies.push({
                    type: 'EXCESSIVE_ACCESS',
                    description: 'Unusually high data access rate',
                    event,
                    count: recentAccess.length
                });
            }
        }

        // Process anomalies
        for (const anomaly of anomalies) {
            this.anomalies.push(anomaly);
            this.statistics.anomaliesDetected++;
            this.emit('anomaly', anomaly);
        }
    }

    async correlateEvent(event) {
        // Correlate events by session, user, or resource
        const correlationKey = event.sessionId || event.userId || event.resourceId;

        if (correlationKey) {
            if (!this.correlations.has(correlationKey)) {
                this.correlations.set(correlationKey, []);
            }

            this.correlations.get(correlationKey).push(event);

            // Keep correlation size manageable
            const correlation = this.correlations.get(correlationKey);
            if (correlation.length > 1000) {
                correlation.shift();
            }
        }
    }

    async indexEvent(event) {
        // Index by various fields for fast searching
        const indexFields = ['type', 'userId', 'resourceId', 'sessionId', 'severity'];

        for (const field of indexFields) {
            if (event[field]) {
                const indexKey = `${field}:${event[field]}`;

                if (!this.indexes.has(indexKey)) {
                    this.indexes.set(indexKey, new Set());
                }

                this.indexes.get(indexKey).add(event.id);
            }
        }
    }

    searchBuffer(query) {
        let results = [...this.buffer];

        // Apply filters
        if (query.type) {
            results = results.filter(e => e.type === query.type);
        }

        if (query.userId) {
            results = results.filter(e => e.userId === query.userId);
        }

        if (query.severity) {
            results = results.filter(e => e.severity === query.severity);
        }

        if (query.startDate) {
            results = results.filter(e => new Date(e.timestamp) >= query.startDate);
        }

        if (query.endDate) {
            results = results.filter(e => new Date(e.timestamp) <= query.endDate);
        }

        if (query.text) {
            const searchText = query.text.toLowerCase();
            results = results.filter(e =>
                JSON.stringify(e).toLowerCase().includes(searchText)
            );
        }

        return results;
    }

    applyFilters(results, query) {
        // Additional filtering logic
        return results;
    }

    sortResults(results, sortConfig) {
        const field = sortConfig.field || 'timestamp';
        const order = sortConfig.order || 'desc';

        return results.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];

            if (order === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    generateEventId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateStatistics(events) {
        const stats = {
            total: events.length,
            byType: {},
            bySeverity: {},
            byOutcome: {},
            byUser: {},
            byHour: {},
            averageProcessingTime: 0
        };

        let totalProcessingTime = 0;

        for (const event of events) {
            // By type
            stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;

            // By severity
            stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;

            // By outcome
            stats.byOutcome[event.outcome] = (stats.byOutcome[event.outcome] || 0) + 1;

            // By user
            if (event.userId) {
                stats.byUser[event.userId] = (stats.byUser[event.userId] || 0) + 1;
            }

            // By hour
            const hour = new Date(event.timestamp).getHours();
            stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

            // Processing time
            if (event.processingTime) {
                totalProcessingTime += event.processingTime;
            }
        }

        stats.averageProcessingTime = events.length > 0 ?
            totalProcessingTime / events.length : 0;

        return stats;
    }

    updateStatistics(event) {
        this.statistics.totalEvents++;

        // By type
        this.statistics.eventsByType[event.type] =
            (this.statistics.eventsByType[event.type] || 0) + 1;

        // By severity
        this.statistics.eventsBySeverity[event.severity] =
            (this.statistics.eventsBySeverity[event.severity] || 0) + 1;

        // By user
        if (event.userId) {
            this.statistics.eventsByUser[event.userId] =
                (this.statistics.eventsByUser[event.userId] || 0) + 1;
        }

        // By resource
        if (event.resourceId) {
            this.statistics.eventsByResource[event.resourceId] =
                (this.statistics.eventsByResource[event.resourceId] || 0) + 1;
        }

        // Average event size
        const eventSize = Buffer.byteLength(JSON.stringify(event));
        this.statistics.averageEventSize =
            (this.statistics.averageEventSize * (this.statistics.totalEvents - 1) + eventSize) /
            this.statistics.totalEvents;

        // Peak buffer size
        if (this.buffer.length > this.statistics.peakBufferSize) {
            this.statistics.peakBufferSize = this.buffer.length;
        }
    }

    async createAuditDirectory() {
        const dirs = [
            this.config.logPath,
            path.join(this.config.logPath, 'exports'),
            path.join(this.config.logPath, 'archives'),
            path.join(this.config.logPath, 'compliance'),
            path.join(this.config.logPath, 'trails')
        ];

        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * Get service statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            bufferSize: this.buffer.length,
            indexSize: this.indexes.size,
            correlationSize: this.correlations.size,
            alertCount: this.alerts.length,
            anomalyCount: this.anomalies.length,
            sessionCount: this.sessions.size,
            config: this.getSafeConfig()
        };
    }

    getSafeConfig() {
        return {
            enabled: this.config.enabled,
            logLevel: this.config.logLevel,
            complianceStandards: this.config.complianceStandards,
            realTimeAlerts: this.config.realTimeAlerts,
            anomalyDetection: this.config.anomalyDetection,
            bufferSize: this.config.bufferSize,
            flushInterval: this.config.flushInterval
        };
    }

    /**
     * Shutdown the audit service
     */
    async shutdown() {
        try {
            // Flush remaining buffer
            await this.flushBuffer();

            // Clear timers
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }

            if (this.rotationTimer) {
                clearInterval(this.rotationTimer);
            }

            // Shutdown components
            if (this.auditLogger) {
                await this.auditLogger.shutdown();
            }

            if (this.complianceReporter) {
                await this.complianceReporter.shutdown();
            }

            if (this.auditTrail) {
                await this.auditTrail.shutdown();
            }

            // Clear memory
            this.buffer = [];
            this.indexes.clear();
            this.correlations.clear();
            this.sessions.clear();

            this.emit('shutdown');

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
}

module.exports = AuditService;
