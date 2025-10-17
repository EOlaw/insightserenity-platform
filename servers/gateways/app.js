/**
 * @fileoverview API Gateway Express Application
 * @module servers/gateway/app
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Import configurations
const routingConfig = require('./config/routing-config');
const securityConfig = require('./config/security-config');

// Import utilities
const { CircuitBreakerFactory } = require('./utils/circuit-breaker');
const { LoadBalancer } = require('./utils/load-balancer');

// Import shared modules
const { getLogger } = require('../../shared/lib/utils/logger');

class GatewayApp {
    constructor(options = {}) {
        this.app = express();
        this.logger = getLogger({ serviceName: 'api-gateway' });
        this.circuitBreakerFactory = new CircuitBreakerFactory();
        this.loadBalancers = new Map();

        this._initialize();
    }

    _initialize() {
        this._configureMiddleware();
        this._configureSecurity();
        this._configureProxies();
        this._configureErrorHandling();
    }

    _configureMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(compression());
    }

    _configureSecurity() {
        if (securityConfig.helmet.enabled) {
            this.app.use(helmet());
        }
        if (securityConfig.cors.enabled) {
            this.app.use(cors(securityConfig.cors));
        }
    }

    _configureProxies() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // Admin service proxy
        this.app.use('/api/admin', createProxyMiddleware({
            target: process.env.ADMIN_SERVICE_URL || 'http://localhost:3000',
            changeOrigin: true,
            pathRewrite: { '^/api/admin': '/api' }
        }));

        // Customer service proxy
        this.app.use('/api/customers', createProxyMiddleware({
            target: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
            changeOrigin: true,
            pathRewrite: { '^/api/customers': '/api' }
        }));
    }

    _configureErrorHandling() {
        this.app.use((err, req, res, next) => {
            this.logger.error('Gateway error', { error: err.message });
            res.status(err.status || 500).json({
                success: false,
                error: { code: 'GATEWAY_ERROR', message: err.message }
            });
        });
    }

    getApp() {
        return this.app;
    }
}

module.exports = GatewayApp;
