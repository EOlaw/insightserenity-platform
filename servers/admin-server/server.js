/**
 * @file Admin Server Entry Point
 * @description Enterprise administration server with enhanced security and monitoring
 * @version 3.0.0
 */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const app = require('./app');
const config = require('../../shared/config');
const Database = require('../../shared/lib/database');
const logger = require('../../shared/lib/utils/logger');
const AuditService = require('../../shared/lib/security/audit/audit-service');
const { AuditEventTypes } = require('../../shared/lib/security/audit/audit-event-types');
const HealthMonitor = require('../../shared/lib/utils/health-monitor');
const SecurityManager = require('../../shared/lib/security/security-manager');

/**
 * Admin Server class for platform administration
 * @class AdminServer
 */
class AdminServer {
    constructor() {
        this.server = null;
        this.isShuttingDown = false;
        this.healthMonitor = null;
        this.securityManager = null;
        this.adminConnections = new Map();
        this.startTime = null;
    }

    /**
     * Initialize and start the admin server
     * @returns {Promise<http.Server|https.Server>} The server instance
     * @throws {Error} If server initialization fails
     */
    async start() {
        try {
            this.startTime = new Date();
            
            // Initialize security manager first
            this.securityManager = new SecurityManager({
                enforceIPWhitelist: true,
                requireMFA: config.admin.security.requireMFA,
                sessionTimeout: config.admin.security.sessionTimeout
            });
            
            logger.info('Starting InsightSerenity Admin Server', {
                environment: config.app.env,
                version: config.app.version,
                nodeVersion: process.version,
                platform: process.platform,
                adminFeatures: {
                    multiTenant: config.database.multiTenant.enabled,
                    auditLogging: config.features.auditLogs,
                    realTimeMonitoring: config.admin.features.realTimeMonitoring,
                    advancedSecurity: config.admin.security.advanced
                }
            });

            // Verify admin security prerequisites
            await this.verifySecurityPrerequisites();
            
            // Initialize the Express application
            const expressApp = await app.start();
            
            if (!expressApp) {
                throw new Error('Failed to initialize Admin Express application');
            }

            // Initialize health monitoring
            this.healthMonitor = new HealthMonitor({
                checkInterval: config.admin.monitoring.healthCheckInterval || 30000,
                services: ['database', 'redis', 'auth', 'audit'],
                customChecks: {
                    adminSessions: () => this.checkAdminSessions(),
                    securityStatus: () => this.checkSecurityStatus()
                }
            });
            
            await this.healthMonitor.start();

            // Log database health for admin visibility
            const dbHealth = Database.getHealthStatus();
            logger.info('Admin Server: Database health status', {
                isConnected: dbHealth.isConnected,
                totalConnections: dbHealth.totalConnections,
                multiTenantEnabled: dbHealth.multiTenantEnabled,
                strategy: dbHealth.strategy,
                tenantsActive: dbHealth.activeConnections.filter(c => c.name.includes('tenant')).length,
                masterConnection: dbHealth.activeConnections.find(c => c.name === 'master')?.state
            });

            // Create server with enhanced security for admin
            if (config.admin.security.forceSSL || config.security.ssl.enabled) {
                this.server = await this.createSecureHttpsServer(expressApp);
            } else {
                if (config.app.env === 'production') {
                    throw new Error('Admin server must use HTTPS in production');
                }
                logger.warn('Admin server running without SSL - NOT RECOMMENDED');
                this.server = this.createHttpServer(expressApp);
            }

            // Start listening
            await this.listen();
            
            // Setup admin-specific handlers
            this.setupAdminHandlers();
            this.setupGracefulShutdown();
            this.setupErrorHandlers();
            this.setupSecurityMonitoring();

            // Log successful startup to audit
            await AuditService.log({
                type: AuditEventTypes.ADMIN_SERVER_START,
                action: 'admin_server_startup',
                category: 'system',
                severity: 'info',
                systemGenerated: true,
                target: {
                    type: 'admin_server',
                    id: config.admin.serverId || 'admin-primary',
                    metadata: {
                        version: config.app.version,
                        environment: config.app.env,
                        features: Object.keys(config.admin.features || {}),
                        securityLevel: config.admin.security.level || 'high'
                    }
                }
            });

            return this.server;
        } catch (error) {
            logger.error('Failed to start admin server', { 
                error: error.message,
                stack: error.stack,
                config: {
                    port: config.admin.port,
                    ssl: config.admin.security.forceSSL
                }
            });
            
            // Log startup failure
            await AuditService.log({
                type: AuditEventTypes.ADMIN_SERVER_START,
                action: 'admin_server_startup',
                category: 'system',
                result: 'failure',
                severity: 'critical',
                systemGenerated: true,
                error: {
                    message: error.message,
                    code: error.code
                }
            });
            
            throw error;
        }
    }

    /**
     * Verify security prerequisites for admin server
     */
    async verifySecurityPrerequisites() {
        const checks = [];
        
        // Check SSL certificates
        if (config.admin.security.forceSSL || config.security.ssl.enabled) {
            checks.push(this.verifySslCertificates());
        }
        
        // Check IP whitelist configuration
        if (config.admin.security.ipWhitelist?.enabled) {
            checks.push(this.verifyIpWhitelist());
        }
        
        // Check audit log availability
        checks.push(this.verifyAuditLogSystem());
        
        // Check admin database permissions
        checks.push(this.verifyDatabasePermissions());
        
        const results = await Promise.allSettled(checks);
        const failures = results.filter(r => r.status === 'rejected');
        
        if (failures.length > 0) {
            throw new Error(`Security prerequisites failed: ${failures.map(f => f.reason).join(', ')}`);
        }
        
        logger.info('All security prerequisites verified successfully');
    }

    /**
     * Create HTTP server (development only)
     */
    createHttpServer(app) {
        logger.warn('Creating HTTP server for admin - development only');
        return http.createServer(app);
    }

    /**
     * Create HTTPS server with enhanced security
     */
    async createSecureHttpsServer(app) {
        try {
            const keyPath = path.resolve(process.cwd(), config.admin.security.ssl?.keyPath || config.security.ssl.keyPath);
            const certPath = path.resolve(process.cwd(), config.admin.security.ssl?.certPath || config.security.ssl.certPath);
            
            if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
                throw new Error(`SSL certificates not found: key=${keyPath}, cert=${certPath}`);
            }

            const sslOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
                // Enhanced security options for admin
                secureOptions: require('constants').SSL_OP_NO_TLSv1 | require('constants').SSL_OP_NO_TLSv1_1,
                ciphers: config.admin.security.ssl?.ciphers || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
                honorCipherOrder: true,
                requestCert: config.admin.security.ssl?.requestClientCert || false,
                rejectUnauthorized: config.admin.security.ssl?.rejectUnauthorized || false
            };

            // Add CA if configured
            if (config.admin.security.ssl?.ca || config.security.ssl.ca) {
                const caPath = path.resolve(process.cwd(), config.admin.security.ssl?.ca || config.security.ssl.ca);
                if (fs.existsSync(caPath)) {
                    sslOptions.ca = fs.readFileSync(caPath);
                }
            }

            logger.info('Admin HTTPS server configured with enhanced security', {
                tlsVersion: 'TLS 1.2+',
                clientCertRequired: sslOptions.requestCert,
                cipherSuite: 'High Security'
            });

            return https.createServer(sslOptions, app);
        } catch (error) {
            logger.error('Failed to create secure HTTPS server', { error: error.message });
            throw error;
        }
    }

    /**
     * Verify SSL certificates exist and are valid
     */
    async verifySslCertificates() {
        const keyPath = path.resolve(process.cwd(), config.admin.security.ssl?.keyPath || config.security.ssl.keyPath);
        const certPath = path.resolve(process.cwd(), config.admin.security.ssl?.certPath || config.security.ssl.certPath);
        
        if (!fs.existsSync(keyPath)) {
            throw new Error(`Admin SSL key not found: ${keyPath}`);
        }
        
        if (!fs.existsSync(certPath)) {
            throw new Error(`Admin SSL certificate not found: ${certPath}`);
        }
        
        // TODO: Add certificate expiration check
        logger.info('SSL certificates verified', { keyPath, certPath });
        return true;
    }

    /**
     * Verify IP whitelist configuration
     */
    async verifyIpWhitelist() {
        const whitelist = config.admin.security.ipWhitelist?.addresses || [];
        if (whitelist.length === 0) {
            throw new Error('Admin IP whitelist is empty - no access will be allowed');
        }
        
        logger.info('IP whitelist configured', { 
            addresses: whitelist.length,
            ranges: whitelist.filter(ip => ip.includes('/')).length
        });
        return true;
    }

    /**
     * Verify audit log system is operational
     */
    async verifyAuditLogSystem() {
        try {
            await AuditService.verify();
            logger.info('Audit log system verified');
            return true;
        } catch (error) {
            throw new Error(`Audit system not operational: ${error.message}`);
        }
    }

    /**
     * Verify database permissions for admin operations
     */
    async verifyDatabasePermissions() {
        try {
            const db = await Database.getConnection();
            // Test admin permissions by checking collections
            const collections = await db.db.listCollections().toArray();
            logger.info('Database permissions verified', { collections: collections.length });
            return true;
        } catch (error) {
            throw new Error(`Database permission check failed: ${error.message}`);
        }
    }

    /**
     * Start server listening
     */
    listen() {
        return new Promise((resolve, reject) => {
            const port = config.admin.port || 5001;
            const host = config.admin.host || '127.0.0.1'; // Admin defaults to localhost only
            
            this.server.listen(port, host, () => {
                const protocol = this.server instanceof https.Server ? 'HTTPS' : 'HTTP';
                
                logger.info(`InsightSerenity Admin Server started`, {
                    protocol,
                    host,
                    port,
                    url: `${protocol.toLowerCase()}://${host}:${port}`,
                    environment: config.app.env,
                    adminDashboard: `${protocol.toLowerCase()}://${host}:${port}/admin/dashboard`,
                    apiDocs: `${protocol.toLowerCase()}://${host}:${port}/admin/api-docs`,
                    healthCheck: `${protocol.toLowerCase()}://${host}:${port}/health`
                });
                
                resolve();
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`Admin port ${port} is already in use`);
                } else if (error.code === 'EACCES') {
                    logger.error(`Admin port ${port} requires elevated privileges`);
                } else {
                    logger.error('Admin server error', { error: error.message });
                }
                reject(error);
            });
        });
    }

    /**
     * Setup admin-specific connection handlers
     */
    setupAdminHandlers() {
        this.server.on('connection', (socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            this.adminConnections.set(connectionId, {
                socket,
                connectedAt: new Date(),
                remoteAddress: socket.remoteAddress
            });
            
            socket.on('close', () => {
                this.adminConnections.delete(connectionId);
            });
        });
        
        // Monitor admin connections
        setInterval(() => {
            if (this.adminConnections.size > 0) {
                logger.debug('Active admin connections', {
                    count: this.adminConnections.size,
                    addresses: Array.from(this.adminConnections.values()).map(c => c.remoteAddress)
                });
            }
        }, 60000); // Every minute
    }

    /**
     * Setup security monitoring for admin activities
     */
    setupSecurityMonitoring() {
        // Monitor failed login attempts
        this.app.on('admin:login:failed', async (data) => {
            await AuditService.log({
                type: AuditEventTypes.ADMIN_LOGIN_FAILED,
                action: 'admin_login_failed',
                category: 'security',
                severity: 'warning',
                actor: {
                    ip: data.ip,
                    userAgent: data.userAgent
                },
                target: {
                    type: 'admin_account',
                    id: data.username
                }
            });
            
            // Check for brute force attempts
            if (data.attempts > 5) {
                logger.warn('Potential brute force attack on admin', data);
                // TODO: Implement IP blocking
            }
        });
        
        // Monitor privilege escalations
        this.app.on('admin:privilege:changed', async (data) => {
            await AuditService.log({
                type: AuditEventTypes.PRIVILEGE_ESCALATION,
                action: 'privilege_changed',
                category: 'security',
                severity: 'high',
                actor: data.actor,
                target: data.target,
                changes: data.changes
            });
        });
    }

    /**
     * Check admin sessions health
     */
    async checkAdminSessions() {
        // Implementation would check Redis session store
        return {
            healthy: true,
            activeSessions: 0, // Would query Redis
            expiredToday: 0
        };
    }

    /**
     * Check security status
     */
    async checkSecurityStatus() {
        return {
            healthy: true,
            sslEnabled: this.server instanceof https.Server,
            ipWhitelistActive: config.admin.security.ipWhitelist?.enabled,
            mfaRequired: config.admin.security.requireMFA,
            lastSecurityScan: new Date().toISOString()
        };
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                logger.warn('Admin shutdown already in progress');
                return;
            }

            this.isShuttingDown = true;
            logger.info(`Admin server received ${signal}, starting graceful shutdown`);

            try {
                // Log shutdown event
                await AuditService.log({
                    type: AuditEventTypes.ADMIN_SERVER_SHUTDOWN,
                    action: 'admin_server_shutdown',
                    category: 'system',
                    severity: 'info',
                    systemGenerated: true,
                    target: {
                        type: 'admin_server',
                        id: config.admin.serverId || 'admin-primary',
                        metadata: {
                            signal,
                            uptime: process.uptime(),
                            activeConnections: this.adminConnections.size
                        }
                    }
                });

                // Stop health monitoring
                if (this.healthMonitor) {
                    await this.healthMonitor.stop();
                }

                // Close all admin connections
                for (const [id, conn] of this.adminConnections) {
                    conn.socket.destroy();
                }

                // Close server
                await this.closeServer();

                // Close database connections
                await Database.close();

                // Stop the Express app
                if (app.stop) {
                    await app.stop();
                }

                // Flush audit logs
                await AuditService.flush();

                logger.info('Admin server graceful shutdown completed', {
                    signal,
                    uptime: process.uptime()
                });
                
                process.exit(0);
            } catch (error) {
                logger.error('Error during admin shutdown', { error: error.message });
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    /**
     * Setup error handlers
     */
    setupErrorHandlers() {
        process.on('uncaughtException', (error) => {
            logger.error('Admin Server: Uncaught Exception', { 
                error: error.message,
                stack: error.stack,
                severity: 'critical'
            });
            
            // Admin server must exit on uncaught exceptions
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Admin Server: Unhandled Promise Rejection', { 
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined,
                severity: 'high'
            });
        });
    }

    /**
     * Close the server
     */
    closeServer() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                logger.error('Admin server forceful shutdown due to timeout');
                reject(new Error('Server close timeout'));
            }, 30000);

            this.server.close((error) => {
                clearTimeout(timeout);
                
                if (error) {
                    logger.error('Error closing admin server', { error: error.message });
                    reject(error);
                } else {
                    logger.info('Admin server closed successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Get admin server status
     */
    getStatus() {
        const dbHealth = Database.getHealthStatus();
        const uptime = this.startTime ? (new Date() - this.startTime) / 1000 : 0;
        
        return {
            server: {
                running: !!this.server,
                uptime,
                startTime: this.startTime,
                environment: config.app.env,
                version: config.app.version,
                nodeVersion: process.version
            },
            connections: {
                active: this.adminConnections.size,
                addresses: Array.from(this.adminConnections.values()).map(c => ({
                    address: c.remoteAddress,
                    duration: (new Date() - c.connectedAt) / 1000
                }))
            },
            security: {
                ssl: this.server instanceof https.Server,
                ipWhitelist: config.admin.security.ipWhitelist?.enabled,
                mfa: config.admin.security.requireMFA
            },
            database: dbHealth,
            health: this.healthMonitor?.getStatus() || {},
            timestamp: new Date().toISOString()
        };
    }
}

// Create singleton instance
const adminServer = new AdminServer();

// Start server if run directly
if (require.main === module) {
    adminServer.start().catch((error) => {
        logger.error('Failed to start admin server', { 
            error: error.message,
            stack: error.stack 
        });
        process.exit(1);
    });
}

module.exports = adminServer;