/**
 * @file Monitoring Configuration
 * @description Health checks, metrics, and observability settings for admin server
 * @version 3.0.0
 */

'use strict';

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const isDevelopment = environment === 'development';

/**
 * Parse boolean from environment variable
 * @param {string} value - Environment variable value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
const parseBooleanFromEnv = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Parse array from comma-separated environment variable
 * @param {string} value - Environment variable value
 * @returns {Array} Parsed array
 */
const parseArrayFromEnv = (value) => {
    if (!value) return [];
    return value.split(',').map(item => item.trim()).filter(Boolean);
};

/**
 * Monitoring configuration for admin server
 */
module.exports = {
    // Core monitoring settings
    enabled: parseBooleanFromEnv(process.env.ADMIN_MONITORING_ENABLED, true),
    level: process.env.ADMIN_MONITORING_LEVEL || (isProduction ? 'production' : 'detailed'),
    
    // Health check configuration
    healthCheck: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_HEALTH_CHECK_ENABLED, true),
        interval: parseInt(process.env.ADMIN_HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
        timeout: parseInt(process.env.ADMIN_HEALTH_CHECK_TIMEOUT, 10) || 5000, // 5 seconds
        retries: parseInt(process.env.ADMIN_HEALTH_CHECK_RETRIES, 10) || 3,
        unhealthyThreshold: parseInt(process.env.ADMIN_UNHEALTHY_THRESHOLD, 10) || 3,
        healthyThreshold: parseInt(process.env.ADMIN_HEALTHY_THRESHOLD, 10) || 2,
        
        // Health check endpoints
        endpoints: {
            basic: process.env.ADMIN_HEALTH_ENDPOINT || '/health',
            detailed: process.env.ADMIN_HEALTH_DETAILED_ENDPOINT || '/health/detailed',
            ready: process.env.ADMIN_READINESS_ENDPOINT || '/ready',
            live: process.env.ADMIN_LIVENESS_ENDPOINT || '/live'
        },
        
        // Service checks
        checks: {
            database: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CHECK_DATABASE, true),
                timeout: parseInt(process.env.ADMIN_DB_CHECK_TIMEOUT, 10) || 3000,
                query: process.env.ADMIN_DB_CHECK_QUERY || 'db.admin.command({ ping: 1 })',
                critical: parseBooleanFromEnv(process.env.ADMIN_DB_CHECK_CRITICAL, true)
            },
            redis: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CHECK_REDIS, true),
                timeout: parseInt(process.env.ADMIN_REDIS_CHECK_TIMEOUT, 10) || 2000,
                command: process.env.ADMIN_REDIS_CHECK_COMMAND || 'PING',
                critical: parseBooleanFromEnv(process.env.ADMIN_REDIS_CHECK_CRITICAL, true)
            },
            disk: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CHECK_DISK, true),
                path: process.env.ADMIN_CHECK_DISK_PATH || '/',
                thresholdPercent: parseInt(process.env.ADMIN_DISK_THRESHOLD_PERCENT, 10) || 90,
                critical: parseBooleanFromEnv(process.env.ADMIN_DISK_CHECK_CRITICAL, false)
            },
            memory: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CHECK_MEMORY, true),
                thresholdPercent: parseInt(process.env.ADMIN_MEMORY_THRESHOLD_PERCENT, 10) || 85,
                heapThresholdPercent: parseInt(process.env.ADMIN_HEAP_THRESHOLD_PERCENT, 10) || 90,
                critical: parseBooleanFromEnv(process.env.ADMIN_MEMORY_CHECK_CRITICAL, false)
            },
            cpu: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CHECK_CPU, true),
                thresholdPercent: parseInt(process.env.ADMIN_CPU_THRESHOLD_PERCENT, 10) || 80,
                sampleInterval: parseInt(process.env.ADMIN_CPU_SAMPLE_INTERVAL, 10) || 1000,
                critical: parseBooleanFromEnv(process.env.ADMIN_CPU_CHECK_CRITICAL, false)
            },
            custom: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_CUSTOM_HEALTH_CHECKS, true),
                checks: parseArrayFromEnv(process.env.ADMIN_CUSTOM_CHECK_NAMES)
            }
        },
        
        // Response configuration
        response: {
            includeDetails: parseBooleanFromEnv(process.env.ADMIN_HEALTH_INCLUDE_DETAILS, !isProduction),
            includeMetrics: parseBooleanFromEnv(process.env.ADMIN_HEALTH_INCLUDE_METRICS, true),
            includeTimestamps: parseBooleanFromEnv(process.env.ADMIN_HEALTH_INCLUDE_TIMESTAMPS, true),
            cacheResponse: parseBooleanFromEnv(process.env.ADMIN_HEALTH_CACHE_RESPONSE, true),
            cacheDuration: parseInt(process.env.ADMIN_HEALTH_CACHE_DURATION, 10) || 5000
        }
    },
    
    // Metrics configuration
    metrics: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_METRICS_ENABLED, true),
        
        // Prometheus metrics
        prometheus: {
            enabled: parseBooleanFromEnv(process.env.METRICS_ENABLED || process.env.PROMETHEUS_ENABLED, true),
            port: parseInt(process.env.METRICS_PORT || process.env.PROMETHEUS_PORT, 10) || 9091,
            path: process.env.METRICS_PATH || process.env.PROMETHEUS_PATH || '/metrics',
            defaultLabels: {
                service: 'admin-server',
                environment: environment,
                instance: process.env.INSTANCE_ID || process.env.HOSTNAME || 'unknown'
            },
            
            // Metric collection settings
            collectDefaultMetrics: parseBooleanFromEnv(process.env.ADMIN_COLLECT_DEFAULT_METRICS, true),
            prefix: process.env.ADMIN_METRICS_PREFIX || 'insightserenity_admin_',
            
            // Buckets and histograms
            httpDurationBuckets: process.env.ADMIN_HTTP_DURATION_BUCKETS ? 
                process.env.ADMIN_HTTP_DURATION_BUCKETS.split(',').map(b => parseFloat(b)) :
                [0.003, 0.03, 0.1, 0.3, 1.5, 10],
            
            // Custom metrics
            customMetrics: {
                activeUsers: parseBooleanFromEnv(process.env.ADMIN_METRIC_ACTIVE_USERS, true),
                apiUsage: parseBooleanFromEnv(process.env.ADMIN_METRIC_API_USAGE, true),
                securityEvents: parseBooleanFromEnv(process.env.ADMIN_METRIC_SECURITY_EVENTS, true),
                systemResources: parseBooleanFromEnv(process.env.ADMIN_METRIC_SYSTEM_RESOURCES, true),
                businessMetrics: parseBooleanFromEnv(process.env.ADMIN_METRIC_BUSINESS, true)
            }
        },
        
        // StatsD metrics
        statsd: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_STATSD_ENABLED, false),
            host: process.env.ADMIN_STATSD_HOST || 'localhost',
            port: parseInt(process.env.ADMIN_STATSD_PORT, 10) || 8125,
            prefix: process.env.ADMIN_STATSD_PREFIX || 'admin.',
            suffix: process.env.ADMIN_STATSD_SUFFIX || '',
            globalize: parseBooleanFromEnv(process.env.ADMIN_STATSD_GLOBALIZE, false),
            cacheDns: parseBooleanFromEnv(process.env.ADMIN_STATSD_CACHE_DNS, true),
            mock: parseBooleanFromEnv(process.env.ADMIN_STATSD_MOCK, isDevelopment)
        },
        
        // Application Performance Monitoring (APM)
        apm: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_APM_ENABLED, isProduction),
            service: process.env.ADMIN_APM_SERVICE || 'admin-server',
            provider: process.env.ADMIN_APM_PROVIDER || 'datadog', // datadog, newrelic, elastic
            sampleRate: parseFloat(process.env.ADMIN_APM_SAMPLE_RATE) || 1.0,
            
            // Transaction settings
            captureBody: process.env.ADMIN_APM_CAPTURE_BODY || 'errors',
            captureHeaders: parseBooleanFromEnv(process.env.ADMIN_APM_CAPTURE_HEADERS, true),
            captureErrorLogStackTraces: parseBooleanFromEnv(process.env.ADMIN_APM_CAPTURE_STACK, true),
            
            // Filtering
            ignoreUrls: parseArrayFromEnv(process.env.ADMIN_APM_IGNORE_URLS) || ['/health', '/metrics'],
            ignoreUserAgents: parseArrayFromEnv(process.env.ADMIN_APM_IGNORE_USER_AGENTS)
        }
    },
    
    // Logging configuration
    logging: {
        // Structured logging
        structured: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_STRUCTURED_LOGGING, true),
            format: process.env.ADMIN_LOG_FORMAT || 'json',
            pretty: parseBooleanFromEnv(process.env.ADMIN_LOG_PRETTY, isDevelopment),
            
            // Log fields
            includeTimestamp: parseBooleanFromEnv(process.env.ADMIN_LOG_TIMESTAMP, true),
            includeLevel: parseBooleanFromEnv(process.env.ADMIN_LOG_LEVEL_FIELD, true),
            includeHostname: parseBooleanFromEnv(process.env.ADMIN_LOG_HOSTNAME, true),
            includePid: parseBooleanFromEnv(process.env.ADMIN_LOG_PID, true),
            includeRequestId: parseBooleanFromEnv(process.env.ADMIN_LOG_REQUEST_ID, true),
            includeUserId: parseBooleanFromEnv(process.env.ADMIN_LOG_USER_ID, true),
            
            // Custom fields
            customFields: {
                service: 'admin-server',
                environment: environment,
                version: process.env.APP_VERSION || '3.0.0'
            }
        },
        
        // Log aggregation
        aggregation: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_LOG_AGGREGATION, isProduction),
            provider: process.env.ADMIN_LOG_PROVIDER || 'elasticsearch', // elasticsearch, cloudwatch, stackdriver
            
            // Elasticsearch settings
            elasticsearch: {
                node: process.env.ADMIN_ELASTICSEARCH_NODE || 'http://localhost:9200',
                index: process.env.ADMIN_ELASTICSEARCH_INDEX || 'admin-logs',
                type: process.env.ADMIN_ELASTICSEARCH_TYPE || '_doc',
                apiVersion: process.env.ADMIN_ELASTICSEARCH_API_VERSION || '7.x',
                auth: {
                    username: process.env.ADMIN_ELASTICSEARCH_USERNAME,
                    password: process.env.ADMIN_ELASTICSEARCH_PASSWORD
                }
            },
            
            // Buffer settings
            bufferSize: parseInt(process.env.ADMIN_LOG_BUFFER_SIZE, 10) || 100,
            flushInterval: parseInt(process.env.ADMIN_LOG_FLUSH_INTERVAL, 10) || 5000
        },
        
        // Log levels per category
        levels: {
            default: process.env.ADMIN_LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
            security: process.env.ADMIN_LOG_LEVEL_SECURITY || 'info',
            audit: process.env.ADMIN_LOG_LEVEL_AUDIT || 'info',
            performance: process.env.ADMIN_LOG_LEVEL_PERFORMANCE || 'warn',
            database: process.env.ADMIN_LOG_LEVEL_DATABASE || 'warn',
            http: process.env.ADMIN_LOG_LEVEL_HTTP || 'info'
        }
    },
    
    // Tracing configuration
    tracing: {
        enabled: parseBooleanFromEnv(process.env.TRACING_ENABLED || process.env.JAEGER_ENABLED, true),
        
        // Jaeger configuration
        jaeger: {
            serviceName: process.env.JAEGER_SERVICE_NAME || 'insightserenity-admin',
            agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
            agentPort: parseInt(process.env.JAEGER_AGENT_PORT, 10) || 6831,
            collectorEndpoint: process.env.JAEGER_COLLECTOR_ENDPOINT,
            
            // Sampling
            samplerType: process.env.JAEGER_SAMPLER_TYPE || 'probabilistic',
            samplerParam: parseFloat(process.env.JAEGER_SAMPLER_PARAM) || 0.1,
            
            // Reporter
            reporterLogSpans: parseBooleanFromEnv(process.env.JAEGER_REPORTER_LOG_SPANS, isDevelopment),
            reporterFlushInterval: parseInt(process.env.JAEGER_REPORTER_FLUSH_INTERVAL, 10) || 1000,
            
            // Tags
            tags: {
                environment: environment,
                version: process.env.APP_VERSION || '3.0.0',
                component: 'admin-server'
            }
        },
        
        // OpenTelemetry configuration
        opentelemetry: {
            enabled: parseBooleanFromEnv(process.env.OTEL_ENABLED, false),
            endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            headers: process.env.OTEL_EXPORTER_OTLP_HEADERS,
            serviceName: process.env.OTEL_SERVICE_NAME || 'admin-server',
            serviceVersion: process.env.OTEL_SERVICE_VERSION || process.env.APP_VERSION || '3.0.0'
        },
        
        // Trace settings
        propagation: {
            inject: parseArrayFromEnv(process.env.ADMIN_TRACE_INJECT) || ['http_headers'],
            extract: parseArrayFromEnv(process.env.ADMIN_TRACE_EXTRACT) || ['http_headers']
        }
    },
    
    // Alerting configuration
    alerting: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_ALERTING_ENABLED, true),
        
        // Alert channels
        channels: {
            email: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_EMAIL_ENABLED, true),
                recipients: parseArrayFromEnv(process.env.ADMIN_ALERT_EMAILS),
                criticalRecipients: parseArrayFromEnv(process.env.ADMIN_CRITICAL_EMAILS),
                throttle: parseInt(process.env.ADMIN_ALERT_EMAIL_THROTTLE, 10) || 300000 // 5 minutes
            },
            slack: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_SLACK_ENABLED, false),
                webhookUrl: process.env.ADMIN_SLACK_WEBHOOK_URL,
                channel: process.env.ADMIN_SLACK_CHANNEL || '#admin-alerts',
                username: process.env.ADMIN_SLACK_USERNAME || 'Admin Monitor',
                iconEmoji: process.env.ADMIN_SLACK_ICON || ':warning:',
                throttle: parseInt(process.env.ADMIN_ALERT_SLACK_THROTTLE, 10) || 300000
            },
            pagerduty: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_PAGERDUTY_ENABLED, false),
                serviceKey: process.env.ADMIN_PAGERDUTY_SERVICE_KEY,
                routingKey: process.env.ADMIN_PAGERDUTY_ROUTING_KEY
            },
            webhook: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_WEBHOOK_ENABLED, false),
                urls: parseArrayFromEnv(process.env.ADMIN_ALERT_WEBHOOK_URLS),
                headers: process.env.ADMIN_ALERT_WEBHOOK_HEADERS ? 
                    JSON.parse(process.env.ADMIN_ALERT_WEBHOOK_HEADERS) : {},
                timeout: parseInt(process.env.ADMIN_ALERT_WEBHOOK_TIMEOUT, 10) || 5000
            }
        },
        
        // Alert rules
        rules: {
            // System alerts
            highCpu: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_HIGH_CPU, true),
                threshold: parseInt(process.env.ADMIN_ALERT_CPU_THRESHOLD, 10) || 80,
                duration: parseInt(process.env.ADMIN_ALERT_CPU_DURATION, 10) || 300000,
                severity: process.env.ADMIN_ALERT_CPU_SEVERITY || 'warning'
            },
            highMemory: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_HIGH_MEMORY, true),
                threshold: parseInt(process.env.ADMIN_ALERT_MEMORY_THRESHOLD, 10) || 85,
                duration: parseInt(process.env.ADMIN_ALERT_MEMORY_DURATION, 10) || 300000,
                severity: process.env.ADMIN_ALERT_MEMORY_SEVERITY || 'warning'
            },
            diskSpace: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_DISK_SPACE, true),
                threshold: parseInt(process.env.ADMIN_ALERT_DISK_THRESHOLD, 10) || 90,
                severity: process.env.ADMIN_ALERT_DISK_SEVERITY || 'critical'
            },
            
            // Security alerts
            failedLogins: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_FAILED_LOGINS, true),
                threshold: parseInt(process.env.ADMIN_ALERT_LOGIN_THRESHOLD, 10) || 5,
                window: parseInt(process.env.ADMIN_ALERT_LOGIN_WINDOW, 10) || 300000,
                severity: process.env.ADMIN_ALERT_LOGIN_SEVERITY || 'high'
            },
            suspiciousActivity: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_SUSPICIOUS, true),
                severity: process.env.ADMIN_ALERT_SUSPICIOUS_SEVERITY || 'critical'
            },
            
            // Application alerts
            errorRate: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_ERROR_RATE, true),
                threshold: parseFloat(process.env.ADMIN_ALERT_ERROR_THRESHOLD) || 0.05,
                window: parseInt(process.env.ADMIN_ALERT_ERROR_WINDOW, 10) || 300000,
                severity: process.env.ADMIN_ALERT_ERROR_SEVERITY || 'high'
            },
            responseTime: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_ALERT_RESPONSE_TIME, true),
                threshold: parseInt(process.env.ADMIN_ALERT_RESPONSE_THRESHOLD, 10) || 5000,
                percentile: parseInt(process.env.ADMIN_ALERT_RESPONSE_PERCENTILE, 10) || 95,
                severity: process.env.ADMIN_ALERT_RESPONSE_SEVERITY || 'warning'
            }
        },
        
        // Alert configuration
        config: {
            cooldown: parseInt(process.env.ADMIN_ALERT_COOLDOWN, 10) || 3600000, // 1 hour
            grouping: parseBooleanFromEnv(process.env.ADMIN_ALERT_GROUPING, true),
            groupWindow: parseInt(process.env.ADMIN_ALERT_GROUP_WINDOW, 10) || 300000,
            maxAlertsPerHour: parseInt(process.env.ADMIN_MAX_ALERTS_PER_HOUR, 10) || 100,
            includeContext: parseBooleanFromEnv(process.env.ADMIN_ALERT_INCLUDE_CONTEXT, true),
            includeStackTrace: parseBooleanFromEnv(process.env.ADMIN_ALERT_INCLUDE_STACK, !isProduction)
        }
    },
    
    // Dashboard configuration
    dashboard: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_DASHBOARD_ENABLED, true),
        refreshInterval: parseInt(process.env.ADMIN_DASHBOARD_REFRESH, 10) || 5000,
        
        // Widgets
        widgets: {
            systemHealth: parseBooleanFromEnv(process.env.ADMIN_WIDGET_SYSTEM_HEALTH, true),
            activeUsers: parseBooleanFromEnv(process.env.ADMIN_WIDGET_ACTIVE_USERS, true),
            apiUsage: parseBooleanFromEnv(process.env.ADMIN_WIDGET_API_USAGE, true),
            errorLogs: parseBooleanFromEnv(process.env.ADMIN_WIDGET_ERROR_LOGS, true),
            securityEvents: parseBooleanFromEnv(process.env.ADMIN_WIDGET_SECURITY_EVENTS, true),
            performance: parseBooleanFromEnv(process.env.ADMIN_WIDGET_PERFORMANCE, true),
            businessMetrics: parseBooleanFromEnv(process.env.ADMIN_WIDGET_BUSINESS_METRICS, true)
        },
        
        // Real-time features
        realTime: {
            enabled: parseBooleanFromEnv(process.env.ADMIN_REAL_TIME_ENABLED, true),
            websocket: parseBooleanFromEnv(process.env.ADMIN_WEBSOCKET_ENABLED, true),
            polling: parseBooleanFromEnv(process.env.ADMIN_POLLING_ENABLED, false),
            pollInterval: parseInt(process.env.ADMIN_POLL_INTERVAL, 10) || 10000
        }
    },
    
    // Performance monitoring
    performance: {
        enabled: parseBooleanFromEnv(process.env.ADMIN_PERFORMANCE_MONITORING, true),
        
        // Thresholds
        thresholds: {
            responseTime: {
                excellent: parseInt(process.env.ADMIN_PERF_EXCELLENT, 10) || 100,
                good: parseInt(process.env.ADMIN_PERF_GOOD, 10) || 500,
                fair: parseInt(process.env.ADMIN_PERF_FAIR, 10) || 1000,
                poor: parseInt(process.env.ADMIN_PERF_POOR, 10) || 3000
            },
            
            // Apdex score calculation
            apdex: {
                enabled: parseBooleanFromEnv(process.env.ADMIN_APDEX_ENABLED, true),
                threshold: parseInt(process.env.ADMIN_APDEX_THRESHOLD, 10) || 500,
                toleratedMultiplier: parseFloat(process.env.ADMIN_APDEX_MULTIPLIER) || 4
            }
        },
        
        // Resource monitoring
        resources: {
            trackMemory: parseBooleanFromEnv(process.env.ADMIN_TRACK_MEMORY, true),
            trackCpu: parseBooleanFromEnv(process.env.ADMIN_TRACK_CPU, true),
            trackEventLoop: parseBooleanFromEnv(process.env.ADMIN_TRACK_EVENT_LOOP, true),
            trackGc: parseBooleanFromEnv(process.env.ADMIN_TRACK_GC, !isProduction)
        }
    }
};