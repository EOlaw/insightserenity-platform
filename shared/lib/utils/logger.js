'use strict';

/**
 * @fileoverview Production-ready logger implementation with BigInt serialization support
 * @module shared/lib/utils/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * Logger implementation with comprehensive BigInt and complex object serialization support
 */
class Logger {
    /**
     * @private
     * @static
     * @type {winston.Logger|null}
     */
    static #instance = null;

    /**
     * @private
     * @static
     * @readonly
     */
    static #LOG_LEVELS = {
        levels: {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            verbose: 4,
            debug: 5,
            silly: 6
        },
        colors: {
            error: 'red',
            warn: 'yellow',
            info: 'green',
            http: 'magenta',
            verbose: 'cyan',
            debug: 'blue',
            silly: 'grey'
        }
    };

    /**
     * @private
     * @static
     * @readonly
     */
    static #DEFAULT_META = {
        service: process.env.APP_NAME || 'insightserenity-platform',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0'
    };

    /**
     * Safe JSON stringification that handles BigInt, circular references, and complex objects
     * @private
     * @static
     * @param {*} obj - Object to stringify
     * @param {number} [maxDepth=10] - Maximum recursion depth
     * @returns {string} Safe JSON string
     */
    static #safeJsonStringify(obj, maxDepth = 10) {
        const seen = new WeakSet();
        let depth = 0;

        try {
            return JSON.stringify(obj, (key, value) => {
                // Handle depth limitation to prevent stack overflow
                if (depth > maxDepth) {
                    return '[Max Depth Exceeded]';
                }

                // Handle circular references
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular Reference]';
                    }
                    seen.add(value);
                }

                // Handle BigInt conversion
                if (typeof value === 'bigint') {
                    return value.toString();
                }

                // Handle functions
                if (typeof value === 'function') {
                    return `[Function: ${value.name || 'anonymous'}]`;
                }

                // Handle undefined
                if (value === undefined) {
                    return '[undefined]';
                }

                // Handle symbols
                if (typeof value === 'symbol') {
                    return value.toString();
                }

                // Handle Dates
                if (value instanceof Date) {
                    return value.toISOString();
                }

                // Handle RegExp
                if (value instanceof RegExp) {
                    return value.toString();
                }

                // Handle Error objects
                if (value instanceof Error) {
                    return {
                        name: value.name,
                        message: value.message,
                        stack: value.stack,
                        code: value.code,
                        statusCode: value.statusCode
                    };
                }

                // Handle Buffer objects
                if (Buffer.isBuffer(value)) {
                    return `[Buffer: ${value.length} bytes]`;
                }

                // Handle very large objects/arrays
                if (Array.isArray(value) && value.length > 100) {
                    return `[Array: ${value.length} items - truncated]`;
                }

                if (typeof value === 'object' && value !== null) {
                    const keys = Object.keys(value);
                    if (keys.length > 100) {
                        return `[Object: ${keys.length} properties - truncated]`;
                    }
                }

                depth++;
                return value;
            }, 2);
        } catch (error) {
            // Fallback for any serialization failures
            if (error.message.includes('Converting circular structure')) {
                return '[Circular Structure - Serialization Failed]';
            }
            return `[Serialization Error: ${error.message}]`;
        }
    }

    /**
     * Safe configuration access with proper fallbacks
     * @private
     * @static
     * @returns {Object} Configuration object
     */
    static #getConfig() {
        let config = null;
        try {
            config = require('../../config');
        } catch (error) {
            console.log('Config module not available, using environment variables for logging');
        }

        const defaultLoggingConfig = {
            level: process.env.LOG_LEVEL || 'info',
            consoleLevel: process.env.CONSOLE_LOG_LEVEL || 'info',
            enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
            directory: process.env.LOG_DIRECTORY || 'logs',
            maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE, 10) || (10 * 1024 * 1024),
            maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 10,
            separateLogFiles: process.env.SEPARATE_LOG_FILES === 'true'
        };

        let loggingConfig = defaultLoggingConfig;

        if (config && config.logging) {
            loggingConfig = {
                ...defaultLoggingConfig,
                ...config.logging
            };

            if (!loggingConfig.directory || typeof loggingConfig.directory !== 'string') {
                loggingConfig.directory = defaultLoggingConfig.directory;
            }
        }

        if (!loggingConfig.directory) {
            loggingConfig.directory = 'logs';
            console.warn('Log directory was undefined, defaulting to "logs"');
        }

        if (typeof loggingConfig.directory !== 'string') {
            loggingConfig.directory = String(loggingConfig.directory);
            console.warn('Log directory was not a string, converting to string');
        }

        return {
            logging: loggingConfig,
            env: config?.environment?.name || process.env.NODE_ENV || 'development'
        };
    }

    /**
     * Creates or returns singleton logger instance
     * @static
     * @returns {winston.Logger} Winston logger instance
     */
    static getInstance() {
        if (!this.#instance) {
            this.#instance = this.#createLogger();
        }
        return this.#instance;
    }

    /**
     * Creates Winston logger with safe configuration and BigInt handling
     * @private
     * @static
     * @returns {winston.Logger} Configured logger instance
     */
    static #createLogger() {
        const config = this.#getConfig();
        const logDir = config.logging.directory;

        // Ensure log directory exists
        try {
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        } catch (error) {
            console.warn('Failed to create log directory, using console only:', error.message);
        }

        // Define log format with BigInt-safe JSON serialization
        const logFormat = winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.json({
                replacer: (key, value) => {
                    if (typeof value === 'bigint') {
                        return value.toString();
                    }
                    if (typeof value === 'function') {
                        return `[Function: ${value.name || 'anonymous'}]`;
                    }
                    if (typeof value === 'symbol') {
                        return value.toString();
                    }
                    if (value instanceof Date) {
                        return value.toISOString();
                    }
                    if (value instanceof Error) {
                        return {
                            name: value.name,
                            message: value.message,
                            stack: value.stack,
                            code: value.code,
                            statusCode: value.statusCode
                        };
                    }
                    if (Buffer.isBuffer(value)) {
                        return `[Buffer: ${value.length} bytes]`;
                    }
                    return value;
                }
            }),
            winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
        );

        // Console format for development with safe serialization
        const consoleFormat = winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, metadata, ...rest }) => {
                let log = `${timestamp} [${level}]: ${message}`;

                // Add metadata if present using safe serialization
                if (metadata && Object.keys(metadata).length > 0) {
                    log += ` ${this.#safeJsonStringify(metadata)}`;
                }

                // Add additional fields using safe serialization
                const additionalFields = Object.keys(rest).filter(key =>
                    !['timestamp', 'level', 'message', 'metadata'].includes(key)
                );

                if (additionalFields.length > 0) {
                    const additional = additionalFields.reduce((acc, key) => {
                        acc[key] = rest[key];
                        return acc;
                    }, {});
                    log += ` ${this.#safeJsonStringify(additional)}`;
                }

                return log;
            })
        );

        // Create transports array
        const transports = [];

        // Console transport (always enabled except in test)
        if (config.env !== 'test') {
            transports.push(
                new winston.transports.Console({
                    level: config.logging.consoleLevel,
                    format: config.env === 'production' ? logFormat : consoleFormat,
                    handleExceptions: true,
                    handleRejections: true
                })
            );
        }

        // File transports (only if enabled and directory is accessible)
        if ((config.env === 'production' || config.logging.enableFileLogging) && fs.existsSync(logDir)) {
            try {
                // Error log file
                transports.push(
                    new winston.transports.File({
                        filename: path.join(logDir, 'error.log'),
                        level: 'error',
                        format: logFormat,
                        maxsize: config.logging.maxFileSize,
                        maxFiles: config.logging.maxFiles,
                        tailable: true
                    })
                );

                // Combined log file
                transports.push(
                    new winston.transports.File({
                        filename: path.join(logDir, 'combined.log'),
                        format: logFormat,
                        maxsize: config.logging.maxFileSize,
                        maxFiles: config.logging.maxFiles,
                        tailable: true
                    })
                );

                // Separate files for different log levels if configured
                if (config.logging.separateLogFiles) {
                    ['warn', 'info', 'http', 'debug'].forEach(level => {
                        transports.push(
                            new winston.transports.File({
                                filename: path.join(logDir, `${level}.log`),
                                level: level,
                                format: logFormat,
                                maxsize: config.logging.maxFileSize,
                                maxFiles: config.logging.maxFiles || 5,
                                tailable: true
                            })
                        );
                    });
                }
            } catch (error) {
                console.warn('Failed to setup file logging, using console only:', error.message);
            }
        }

        // Create logger instance
        const logger = winston.createLogger({
            levels: this.#LOG_LEVELS.levels,
            level: config.logging.level,
            format: logFormat,
            defaultMeta: this.#DEFAULT_META,
            transports,
            exitOnError: false
        });

        // Add colors to winston
        winston.addColors(this.#LOG_LEVELS.colors);

        return logger;
    }

    /**
     * Log error with context and safe serialization
     * @static
     * @param {string} message - Error message
     * @param {Error|Object} [error] - Error object or metadata
     * @param {Object} [meta={}] - Additional metadata
     */
    static error(message, error, meta = {}) {
        const logger = this.getInstance();
        const errorMeta = this.#parseError(error);

        logger.error(message, {
            ...errorMeta,
            ...meta,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log warning with safe serialization
     * @static
     * @param {string} message - Warning message
     * @param {Object} [meta={}] - Additional metadata
     */
    static warn(message, meta = {}) {
        this.getInstance().warn(message, meta);
    }

    /**
     * Log info with safe serialization
     * @static
     * @param {string} message - Info message
     * @param {Object} [meta={}] - Additional metadata
     */
    static info(message, meta = {}) {
        this.getInstance().info(message, meta);
    }

    /**
     * Log HTTP request/response with safe serialization
     * @static
     * @param {string} message - HTTP message
     * @param {Object} [meta={}] - Request/response metadata
     */
    static http(message, meta = {}) {
        this.getInstance().http(message, meta);
    }

    /**
     * Log verbose information with safe serialization
     * @static
     * @param {string} message - Verbose message
     * @param {Object} [meta={}] - Additional metadata
     */
    static verbose(message, meta = {}) {
        this.getInstance().verbose(message, meta);
    }

    /**
     * Log debug information with safe serialization
     * @static
     * @param {string} message - Debug message
     * @param {Object} [meta={}] - Additional metadata
     */
    static debug(message, meta = {}) {
        this.getInstance().debug(message, meta);
    }

    /**
     * Log silly/trace level information with safe serialization
     * @static
     * @param {string} message - Silly message
     * @param {Object} [meta={}] - Additional metadata
     */
    static silly(message, meta = {}) {
        this.getInstance().silly(message, meta);
    }

    /**
     * Create child logger with additional context
     * @static
     * @param {Object} defaultMeta - Default metadata for child logger
     * @returns {Object} Child logger wrapper
     */
    static child(defaultMeta) {
        const childLogger = this.getInstance().child(defaultMeta);

        return {
            error: (message, error, meta = {}) => {
                const errorMeta = this.#parseError(error);
                childLogger.error(message, { ...errorMeta, ...meta });
            },
            warn: (message, meta = {}) => childLogger.warn(message, meta),
            info: (message, meta = {}) => childLogger.info(message, meta),
            http: (message, meta = {}) => childLogger.http(message, meta),
            verbose: (message, meta = {}) => childLogger.verbose(message, meta),
            debug: (message, meta = {}) => childLogger.debug(message, meta),
            silly: (message, meta = {}) => childLogger.silly(message, meta)
        };
    }

    /**
     * Parse error object for logging with enhanced handling
     * @private
     * @static
     * @param {Error|Object} error - Error to parse
     * @returns {Object} Parsed error metadata
     */
    static #parseError(error) {
        if (!error) return {};

        if (error instanceof Error) {
            return {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    code: error.code,
                    statusCode: error.statusCode,
                    details: error.details
                }
            };
        }

        if (typeof error === 'object') {
            return { error };
        }

        return { error: { message: String(error) } };
    }

    /**
     * Stream logs for real-time monitoring with safe serialization
     * @static
     * @param {Object} options - Stream options
     * @returns {Object} Log stream
     */
    static stream(options = {}) {
        const logger = this.getInstance();

        return {
            write: (message) => {
                logger.info(message.trim(), { stream: true, ...options });
            }
        };
    }

    /**
     * Query logs with safe handling
     * @static
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Log entries
     */
    static async query(options = {}) {
        const logger = this.getInstance();

        return new Promise((resolve, reject) => {
            const queryOptions = {
                from: options.from || new Date(Date.now() - 24 * 60 * 60 * 1000),
                until: options.until || new Date(),
                limit: options.limit || 100,
                start: options.start || 0,
                order: options.order || 'desc',
                fields: options.fields
            };

            logger.query(queryOptions, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    }

    /**
     * Profile performance with safe timing handling
     * @static
     * @param {string} id - Profile ID
     * @param {Object} [meta={}] - Additional metadata
     */
    static profile(id, meta = {}) {
        const logger = this.getInstance();
        logger.profile(id, meta);
    }

    /**
     * Start timer for performance measurement with BigInt-safe handling
     * @static
     * @param {string} label - Timer label
     * @returns {Function} End timer function
     */
    static startTimer(label) {
        const start = process.hrtime.bigint();

        return (meta = {}) => {
            const end = process.hrtime.bigint();
            const durationNs = end - start;
            const durationMs = Number(durationNs) / 1000000; // Convert to milliseconds

            this.info(`${label} completed`, {
                duration: durationMs,
                durationMs: durationMs,
                durationFormatted: `${durationMs.toFixed(2)}ms`,
                durationNanoseconds: durationNs.toString(), // Safe BigInt conversion
                ...meta
            });
        };
    }

    /**
     * Log method execution with safe timing
     * @static
     * @param {string} className - Class name
     * @param {string} methodName - Method name
     * @param {Object} [meta={}] - Additional metadata
     * @returns {Function} Method logger
     */
    static logMethod(className, methodName, meta = {}) {
        return {
            start: (args = {}) => {
                this.debug(`${className}.${methodName} started`, {
                    method: `${className}.${methodName}`,
                    arguments: args,
                    ...meta
                });
            },
            end: (result = null, duration = null) => {
                this.debug(`${className}.${methodName} completed`, {
                    method: `${className}.${methodName}`,
                    duration: typeof duration === 'bigint' ? duration.toString() : duration,
                    hasResult: result !== null,
                    ...meta
                });
            },
            error: (error) => {
                this.error(`${className}.${methodName} failed`, error, {
                    method: `${className}.${methodName}`,
                    ...meta
                });
            }
        };
    }

    /**
     * Configure logger at runtime
     * @static
     * @param {Object} options - Configuration options
     */
    static configure(options) {
        const logger = this.getInstance();

        if (options.level) {
            logger.level = options.level;
        }

        if (options.silent !== undefined) {
            logger.silent = options.silent;
        }

        if (options.defaultMeta) {
            Object.assign(logger.defaultMeta, options.defaultMeta);
        }
    }

    /**
     * Clear all logs (for testing)
     * @static
     */
    static clear() {
        try {
            const logger = this.getInstance();
            if (logger.clear) {
                logger.clear();
            }
        } catch (error) {
            console.warn('Failed to clear logs:', error.message);
        }
    }

    /**
     * Close all transports
     * @static
     * @returns {Promise<void>}
     */
    static async close() {
        try {
            const logger = this.getInstance();

            return new Promise((resolve) => {
                logger.end(() => {
                    this.#instance = null;
                    resolve();
                });
            });
        } catch (error) {
            console.warn('Failed to close logger:', error.message);
            this.#instance = null;
        }
    }
}

module.exports = Logger;