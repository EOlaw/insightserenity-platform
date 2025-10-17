/**
 * @fileoverview API Gateway Server Entry Point
 * @module servers/gateway/server
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GatewayApp = require('./app');
const { getLogger } = require('../../shared/lib/utils/logger');

/**
 * Gateway Server Class
 * @class GatewayServer
 */
class GatewayServer {
    constructor() {
        this.app = null;
        this.server = null;
        this.port = this.normalizePort(process.env.PORT || '3002');
        this.host = process.env.HOST || '0.0.0.0';
        this.isProduction = process.env.NODE_ENV === 'production';
        this.logger = getLogger({ serviceName: 'gateway-server' });
    }

    /**
     * Start the server
     */
    async start() {
        try {
            // Create Gateway application
            const gatewayApp = new GatewayApp();
            this.app = gatewayApp.getApp();

            // Create HTTP/HTTPS server
            if (this.isProduction && process.env.SSL_ENABLED === 'true') {
                const httpsOptions = {
                    key: fs.readFileSync(process.env.SSL_KEY_PATH || './ssl/key.pem'),
                    cert: fs.readFileSync(process.env.SSL_CERT_PATH || './ssl/cert.pem')
                };
                this.server = https.createServer(httpsOptions, this.app);
            } else {
                this.server = http.createServer(this.app);
            }

            // Start listening
            this.server.listen(this.port, this.host, () => {
                const protocol = this.server instanceof https.Server ? 'https' : 'http';

                console.log('\n' + '='.repeat(60));
                console.log('🌐 API GATEWAY SERVER STARTED');
                console.log('='.repeat(60));
                console.log(`📍 Gateway:      ${protocol}://${this.host}:${this.port}`);
                console.log(`🔗 Admin API:    ${protocol}://${this.host}:${this.port}/api/admin`);
                console.log(`🔗 Customer API: ${protocol}://${this.host}:${this.port}/api/customers`);
                console.log(`🏥 Health:       ${protocol}://${this.host}:${this.port}/health`);
                console.log(`📊 Metrics:      ${protocol}://${this.host}:${this.port}/metrics`);
                console.log(`⚙️  Environment:  ${process.env.NODE_ENV}`);
                console.log(`🔧 Process:      ${process.pid}`);
                console.log('='.repeat(60) + '\n');

                this.logger.info('Gateway Server Started', {
                    pid: process.pid,
                    protocol,
                    host: this.host,
                    port: this.port,
                    environment: process.env.NODE_ENV,
                    services: {
                        admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:3000',
                        customer: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001'
                    }
                });

                // Send ready signal
                if (process.send) {
                    process.send('ready');
                }
            });

            // Handle server errors
            this.server.on('error', this.onError.bind(this));

            // Setup graceful shutdown
            this.setupGracefulShutdown();

        } catch (error) {
            this.logger.error('Failed to start gateway server', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        }
    }

    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            this.logger.info(`Received ${signal}, starting graceful shutdown...`);

            // Stop accepting new connections
            this.server.close(async () => {
                this.logger.info('Gateway server closed');

                try {
                    // Additional cleanup if needed
                    this.logger.info('Graceful shutdown completed');
                    process.exit(0);

                } catch (error) {
                    this.logger.error('Error during graceful shutdown', {
                        error: error.message
                    });
                    process.exit(1);
                }
            });

            // Force shutdown after timeout
            setTimeout(() => {
                this.logger.error('Forced shutdown due to timeout');
                process.exit(1);
            }, 30000);
        };

        // Register signal handlers
        process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    /**
     * Handle server errors
     */
    onError(error) {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind = typeof this.port === 'string'
            ? `Pipe ${this.port}`
            : `Port ${this.port}`;

        switch (error.code) {
            case 'EACCES':
                this.logger.error(`${bind} requires elevated privileges`);
                console.error(`\n❌ ERROR: ${bind} requires elevated privileges\n`);
                process.exit(1);
                break;

            case 'EADDRINUSE':
                this.logger.error(`${bind} is already in use`);
                console.error(`\n❌ ERROR: ${bind} is already in use\n`);
                process.exit(1);
                break;

            default:
                throw error;
        }
    }

    /**
     * Normalize port value
     */
    normalizePort(val) {
        const port = parseInt(val, 10);

        if (isNaN(port)) {
            return val;
        }

        if (port >= 0) {
            return port;
        }

        return false;
    }
}

// ASCII Art Banner
console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║       ___   ___  ___   ___   _                          ║
║      / _ \\ | _ \\|_ _| / __| | |                         ║
║     | (_) ||  _/ | | | (_ | |_|                         ║
║      \\___/ |_|  |___| \\___| (_)                         ║
║                                                          ║
║          G A T E W A Y   S E R V E R                    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

// Create and start server
const server = new GatewayServer();

server.start().catch((error) => {
    console.error('Failed to start gateway server:', error);
    process.exit(1);
});

module.exports = server;
