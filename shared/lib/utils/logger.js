'use strict';

/**
 * @fileoverview Production-ready logger implementation using Winston
 * @module shared/lib/utils/logger
 * @requires winston
 * @requires path
 * @requires fs
 * @requires module:shared/config
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

/**
 * @class Logger
 * @description Centralized logging utility with support for multiple transports, 
 * log levels, and structured logging for production environments
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
    service: config.app?.name || 'insightserenity-platform',
    environment: config.env || 'development',
    version: config.app?.version || '1.0.0'
  };

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
   * Creates Winston logger with configured transports
   * @private
   * @static
   * @returns {winston.Logger} Configured logger instance
   */
  static #createLogger() {
    const logDir = config.logging?.directory || 'logs';
    
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, metadata, ...rest }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        
        // Add metadata if present
        if (metadata && Object.keys(metadata).length > 0) {
          log += ` ${JSON.stringify(metadata)}`;
        }
        
        // Add additional fields
        const additionalFields = Object.keys(rest).filter(key => 
          !['timestamp', 'level', 'message', 'metadata'].includes(key)
        );
        
        if (additionalFields.length > 0) {
          const additional = additionalFields.reduce((acc, key) => {
            acc[key] = rest[key];
            return acc;
          }, {});
          log += ` ${JSON.stringify(additional)}`;
        }
        
        return log;
      })
    );

    // Create transports array
    const transports = [];

    // Console transport
    if (config.env !== 'test') {
      transports.push(
        new winston.transports.Console({
          level: config.logging?.consoleLevel || 'info',
          format: config.env === 'production' ? logFormat : consoleFormat,
          handleExceptions: true,
          handleRejections: true
        })
      );
    }

    // File transports for production
    if (config.env === 'production' || config.logging?.enableFileLogging) {
      // Error log file
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: config.logging?.maxFileSize || 10 * 1024 * 1024, // 10MB
          maxFiles: config.logging?.maxFiles || 10,
          tailable: true
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          format: logFormat,
          maxsize: config.logging?.maxFileSize || 10 * 1024 * 1024, // 10MB
          maxFiles: config.logging?.maxFiles || 10,
          tailable: true
        })
      );

      // Separate files for different log levels if configured
      if (config.logging?.separateLogFiles) {
        ['warn', 'info', 'http', 'debug'].forEach(level => {
          transports.push(
            new winston.transports.File({
              filename: path.join(logDir, `${level}.log`),
              level: level,
              format: logFormat,
              maxsize: config.logging?.maxFileSize || 10 * 1024 * 1024,
              maxFiles: config.logging?.maxFiles || 5,
              tailable: true
            })
          );
        });
      }
    }

    // Create logger instance
    const logger = winston.createLogger({
      levels: this.#LOG_LEVELS.levels,
      level: config.logging?.level || 'info',
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
   * Log error with context
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
   * Log warning
   * @static
   * @param {string} message - Warning message
   * @param {Object} [meta={}] - Additional metadata
   */
  static warn(message, meta = {}) {
    this.getInstance().warn(message, meta);
  }

  /**
   * Log info
   * @static
   * @param {string} message - Info message
   * @param {Object} [meta={}] - Additional metadata
   */
  static info(message, meta = {}) {
    this.getInstance().info(message, meta);
  }

  /**
   * Log HTTP request/response
   * @static
   * @param {string} message - HTTP message
   * @param {Object} [meta={}] - Request/response metadata
   */
  static http(message, meta = {}) {
    this.getInstance().http(message, meta);
  }

  /**
   * Log verbose information
   * @static
   * @param {string} message - Verbose message
   * @param {Object} [meta={}] - Additional metadata
   */
  static verbose(message, meta = {}) {
    this.getInstance().verbose(message, meta);
  }

  /**
   * Log debug information
   * @static
   * @param {string} message - Debug message
   * @param {Object} [meta={}] - Additional metadata
   */
  static debug(message, meta = {}) {
    this.getInstance().debug(message, meta);
  }

  /**
   * Log silly/trace level information
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
   * Parse error object for logging
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
   * Stream logs for real-time monitoring
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
   * Query logs
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
   * Profile performance
   * @static
   * @param {string} id - Profile ID
   * @param {Object} [meta={}] - Additional metadata
   */
  static profile(id, meta = {}) {
    const logger = this.getInstance();
    logger.profile(id, meta);
  }

  /**
   * Start timer for performance measurement
   * @static
   * @param {string} label - Timer label
   * @returns {Function} End timer function
   */
  static startTimer(label) {
    const start = Date.now();
    
    return (meta = {}) => {
      const duration = Date.now() - start;
      this.info(`${label} completed`, {
        duration,
        durationMs: duration,
        durationFormatted: `${duration}ms`,
        ...meta
      });
    };
  }

  /**
   * Log method execution
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
          duration,
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
    const logger = this.getInstance();
    logger.clear();
  }

  /**
   * Close all transports
   * @static
   * @returns {Promise<void>}
   */
  static async close() {
    const logger = this.getInstance();
    
    return new Promise((resolve) => {
      logger.end(() => {
        this.#instance = null;
        resolve();
      });
    });
  }
}

module.exports = Logger;