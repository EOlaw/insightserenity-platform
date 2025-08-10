/**
 * Logger Utility
 * Centralized logging for the API Gateway
 */

const winston = require('winston');
const path = require('path');

/**
 * Logger Class
 */
class Logger {
    constructor(config = {}) {
        this.config = {
            level: config.level || 'info',
            format: config.format || 'json',
            console: config.console !== false,
            file: config.file || {},
            service: config.service || 'api-gateway',
            ...config
        };
        
        this.logger = this.createLogger();
    }

    /**
     * Create Winston logger instance
     */
    createLogger() {
        const formats = [];
        
        // Add timestamp
        formats.push(winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }));
        
        // Add service name
        formats.push(winston.format.label({ 
            label: this.config.service 
        }));
        
        // Add errors stack trace
        formats.push(winston.format.errors({ stack: true }));
        
        // Format based on configuration
        if (this.config.format === 'json') {
            formats.push(winston.format.json());
        } else if (this.config.format === 'simple') {
            formats.push(winston.format.simple());
        } else if (this.config.format === 'combined') {
            formats.push(winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message, label, timestamp, ...metadata }) => {
                    let msg = `${timestamp} [${label}] ${level}: ${message}`;
                    if (Object.keys(metadata).length > 0) {
                        msg += ` ${JSON.stringify(metadata)}`;
                    }
                    return msg;
                })
            ));
        }
        
        const transports = [];
        
        // Console transport
        if (this.config.console) {
            transports.push(new winston.transports.Console({
                level: this.config.level,
                handleExceptions: true,
                handleRejections: true
            }));
        }
        
        // File transport
        if (this.config.file?.enabled) {
            const logDir = path.dirname(this.config.file.filename || 'logs/gateway.log');
            
            // Main log file
            transports.push(new winston.transports.File({
                filename: this.config.file.filename || 'logs/gateway.log',
                level: this.config.level,
                maxsize: this.parseSize(this.config.file.maxSize || '20m'),
                maxFiles: this.config.file.maxFiles || 5,
                tailable: true,
                zippedArchive: this.config.file.compress !== false
            }));
            
            // Error log file
            transports.push(new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                maxsize: this.parseSize(this.config.file.maxSize || '20m'),
                maxFiles: this.config.file.maxFiles || 5,
                tailable: true,
                zippedArchive: this.config.file.compress !== false
            }));
        }
        
        return winston.createLogger({
            level: this.config.level,
            format: winston.format.combine(...formats),
            transports: transports,
            exitOnError: false
        });
    }

    /**
     * Parse size string to bytes
     */
    parseSize(size) {
        const units = {
            'b': 1,
            'k': 1024,
            'm': 1024 * 1024,
            'g': 1024 * 1024 * 1024
        };
        
        const match = size.toLowerCase().match(/^(\d+)([bkmg])?$/);
        if (!match) {
            return 20 * 1024 * 1024; // Default 20MB
        }
        
        const value = parseInt(match[1]);
        const unit = match[2] || 'm';
        
        return value * units[unit];
    }

    /**
     * Log methods
     */
    error(message, meta = {}) {
        this.logger.error(message, this.formatMeta(meta));
    }

    warn(message, meta = {}) {
        this.logger.warn(message, this.formatMeta(meta));
    }

    info(message, meta = {}) {
        this.logger.info(message, this.formatMeta(meta));
    }

    debug(message, meta = {}) {
        this.logger.debug(message, this.formatMeta(meta));
    }

    trace(message, meta = {}) {
        this.logger.silly(message, this.formatMeta(meta));
    }

    /**
     * Format metadata
     */
    formatMeta(meta) {
        if (meta instanceof Error) {
            return {
                error: {
                    message: meta.message,
                    stack: meta.stack,
                    code: meta.code,
                    name: meta.name
                }
            };
        }
        
        return meta;
    }

    /**
     * Create child logger with additional context
     */
    child(metadata) {
        const childLogger = Object.create(this);
        childLogger.defaultMetadata = { ...this.defaultMetadata, ...metadata };
        return childLogger;
    }

    /**
     * Profile a function execution
     */
    profile(id) {
        return this.logger.profile(id);
    }

    /**
     * Start a timer
     */
    startTimer() {
        return this.logger.startTimer();
    }

    /**
     * Query logs
     */
    query(options = {}) {
        return new Promise((resolve, reject) => {
            this.logger.query(options, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    }

    /**
     * Stream logs
     */
    stream(options = {}) {
        return this.logger.stream(options);
    }

    /**
     * Close logger
     */
    close() {
        return new Promise((resolve) => {
            this.logger.close(() => resolve());
        });
    }
}

module.exports = { Logger };