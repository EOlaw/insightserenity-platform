/**
 * @fileoverview Load Balancer Implementation
 * @module servers/gateway/utils/load-balancer
 * @description Production-ready load balancer with multiple algorithms
 */

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Load Balancing Algorithms
 */
const Algorithm = {
    ROUND_ROBIN: 'round-robin',
    LEAST_CONNECTIONS: 'least-connections',
    WEIGHTED_ROUND_ROBIN: 'weighted-round-robin',
    IP_HASH: 'ip-hash',
    RANDOM: 'random',
    LEAST_RESPONSE_TIME: 'least-response-time',
    RESOURCE_BASED: 'resource-based'
};

/**
 * Server Health Status
 */
const HealthStatus = {
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy',
    DEGRADED: 'degraded'
};

/**
 * Server Instance Class
 */
class Server {
    constructor(options = {}) {
        this.id = options.id || crypto.randomBytes(8).toString('hex');
        this.url = options.url;
        this.weight = options.weight || 1;
        this.maxConnections = options.maxConnections || 100;

        // State
        this.healthy = true;
        this.status = HealthStatus.HEALTHY;
        this.activeConnections = 0;
        this.totalRequests = 0;
        this.failedRequests = 0;
        this.lastHealthCheck = null;
        this.lastFailure = null;

        // Metrics
        this.responseTimes = [];
        this.averageResponseTime = 0;
        this.cpuUsage = 0;
        this.memoryUsage = 0;

        // Health check
        this.consecutiveFailures = 0;
        this.healthCheckUrl = options.healthCheckUrl || `${this.url}/health`;
    }

    /**
     * Increment connection count
     */
    incrementConnections() {
        this.activeConnections++;
        this.totalRequests++;
    }

    /**
     * Decrement connection count
     */
    decrementConnections() {
        if (this.activeConnections > 0) {
            this.activeConnections--;
        }
    }

    /**
     * Record response time
     */
    recordResponseTime(time) {
        this.responseTimes.push(time);

        // Keep only last 100 response times
        if (this.responseTimes.length > 100) {
            this.responseTimes = this.responseTimes.slice(-100);
        }

        // Calculate average
        this.averageResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    }

    /**
     * Record failure
     */
    recordFailure() {
        this.failedRequests++;
        this.lastFailure = Date.now();
        this.consecutiveFailures++;
    }

    /**
     * Record success
     */
    recordSuccess() {
        this.consecutiveFailures = 0;
    }

    /**
     * Update health status
     */
    updateHealth(healthy, status = null) {
        this.healthy = healthy;
        this.status = status || (healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY);
        this.lastHealthCheck = Date.now();

        if (healthy) {
            this.consecutiveFailures = 0;
        }
    }

    /**
     * Get server load
     */
    getLoad() {
        return this.activeConnections / this.maxConnections;
    }

    /**
     * Get server score (for scoring algorithms)
     */
    getScore() {
        let score = 100;

        // Deduct for active connections
        score -= (this.getLoad() * 30);

        // Deduct for response time
        if (this.averageResponseTime > 0) {
            score -= Math.min(30, this.averageResponseTime / 100);
        }

        // Deduct for failures
        score -= Math.min(20, this.consecutiveFailures * 5);

        // Deduct for resource usage
        score -= (this.cpuUsage * 0.1);
        score -= (this.memoryUsage * 0.1);

        // Apply weight
        score *= this.weight;

        return Math.max(0, score);
    }

    /**
     * Check if server can accept connections
     */
    canAcceptConnections() {
        return this.healthy &&
               this.activeConnections < this.maxConnections &&
               this.status !== HealthStatus.UNHEALTHY;
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            id: this.id,
            url: this.url,
            healthy: this.healthy,
            status: this.status,
            activeConnections: this.activeConnections,
            totalRequests: this.totalRequests,
            failedRequests: this.failedRequests,
            averageResponseTime: this.averageResponseTime,
            load: this.getLoad(),
            score: this.getScore()
        };
    }
}

/**
 * Load Balancer Class
 * @class LoadBalancer
 * @extends EventEmitter
 */
class LoadBalancer extends EventEmitter {
    /**
     * Creates an instance of LoadBalancer
     * @param {Object} options - Load balancer options
     */
    constructor(options = {}) {
        super();

        // Configuration
        this.algorithm = options.algorithm || Algorithm.ROUND_ROBIN;
        this.sticky = options.sticky || false;
        this.stickyTtl = options.stickyTtl || 3600000; // 1 hour
        this.healthCheckInterval = options.healthCheckInterval || 30000;
        this.healthCheckTimeout = options.healthCheckTimeout || 5000;
        this.maxFailures = options.maxFailures || 3;
        this.retryDelay = options.retryDelay || 10000;

        // State
        this.servers = new Map();
        this.currentIndex = 0;
        this.stickySessions = new Map();
        this.healthCheckTimer = null;

        // Initialize servers
        if (options.servers) {
            options.servers.forEach(server => this.addServer(server));
        }

        // Start health checks
        if (options.enableHealthCheck !== false) {
            this.startHealthChecks();
        }
    }

    /**
     * Add server to pool
     * @param {Object} serverConfig - Server configuration
     */
    addServer(serverConfig) {
        const server = new Server(serverConfig);
        this.servers.set(server.id, server);

        this.emit('server:added', server.getStats());

        return server.id;
    }

    /**
     * Remove server from pool
     * @param {string} serverId - Server ID
     */
    removeServer(serverId) {
        const server = this.servers.get(serverId);
        if (server) {
            this.servers.delete(serverId);
            this.emit('server:removed', server.getStats());
            return true;
        }
        return false;
    }

    /**
     * Get next server based on algorithm
     * @param {Object} context - Request context (IP, session, etc.)
     * @returns {Server|null} Selected server
     */
    getNextServer(context = {}) {
        const availableServers = this._getAvailableServers();

        if (availableServers.length === 0) {
            this.emit('no-servers-available');
            return null;
        }

        // Check sticky session
        if (this.sticky && context.sessionId) {
            const stickyServer = this._getStickyServer(context.sessionId);
            if (stickyServer && stickyServer.canAcceptConnections()) {
                return stickyServer;
            }
        }

        let selectedServer;

        // Select based on algorithm
        switch (this.algorithm) {
            case Algorithm.ROUND_ROBIN:
                selectedServer = this._roundRobin(availableServers);
                break;

            case Algorithm.LEAST_CONNECTIONS:
                selectedServer = this._leastConnections(availableServers);
                break;

            case Algorithm.WEIGHTED_ROUND_ROBIN:
                selectedServer = this._weightedRoundRobin(availableServers);
                break;

            case Algorithm.IP_HASH:
                selectedServer = this._ipHash(availableServers, context.ip);
                break;

            case Algorithm.RANDOM:
                selectedServer = this._random(availableServers);
                break;

            case Algorithm.LEAST_RESPONSE_TIME:
                selectedServer = this._leastResponseTime(availableServers);
                break;

            case Algorithm.RESOURCE_BASED:
                selectedServer = this._resourceBased(availableServers);
                break;

            default:
                selectedServer = this._roundRobin(availableServers);
        }

        // Store sticky session
        if (this.sticky && context.sessionId && selectedServer) {
            this._setStickyServer(context.sessionId, selectedServer);
        }

        if (selectedServer) {
            selectedServer.incrementConnections();
            this.emit('server:selected', selectedServer.getStats());
        }

        return selectedServer;
    }

    /**
     * Get available servers
     * @private
     */
    _getAvailableServers() {
        return Array.from(this.servers.values())
            .filter(server => server.canAcceptConnections());
    }

    /**
     * Round Robin algorithm
     * @private
     */
    _roundRobin(servers) {
        if (servers.length === 0) return null;

        const server = servers[this.currentIndex % servers.length];
        this.currentIndex++;

        return server;
    }

    /**
     * Least Connections algorithm
     * @private
     */
    _leastConnections(servers) {
        return servers.reduce((min, server) =>
            server.activeConnections < min.activeConnections ? server : min
        );
    }

    /**
     * Weighted Round Robin algorithm
     * @private
     */
    _weightedRoundRobin(servers) {
        const totalWeight = servers.reduce((sum, s) => sum + s.weight, 0);
        let random = Math.random() * totalWeight;

        for (const server of servers) {
            random -= server.weight;
            if (random <= 0) {
                return server;
            }
        }

        return servers[servers.length - 1];
    }

    /**
     * IP Hash algorithm
     * @private
     */
    _ipHash(servers, ip) {
        if (!ip || servers.length === 0) {
            return this._random(servers);
        }

        const hash = crypto.createHash('md5').update(ip).digest('hex');
        const index = parseInt(hash.substring(0, 8), 16) % servers.length;

        return servers[index];
    }

    /**
     * Random algorithm
     * @private
     */
    _random(servers) {
        if (servers.length === 0) return null;

        const index = Math.floor(Math.random() * servers.length);
        return servers[index];
    }

    /**
     * Least Response Time algorithm
     * @private
     */
    _leastResponseTime(servers) {
        return servers.reduce((min, server) =>
            server.averageResponseTime < min.averageResponseTime ? server : min
        );
    }

    /**
     * Resource Based algorithm
     * @private
     */
    _resourceBased(servers) {
        return servers.reduce((best, server) =>
            server.getScore() > best.getScore() ? server : best
        );
    }

    /**
     * Get sticky server
     * @private
     */
    _getStickyServer(sessionId) {
        const sticky = this.stickySessions.get(sessionId);

        if (sticky && Date.now() - sticky.timestamp < this.stickyTtl) {
            return this.servers.get(sticky.serverId);
        }

        // Clean up expired session
        this.stickySessions.delete(sessionId);
        return null;
    }

    /**
     * Set sticky server
     * @private
     */
    _setStickyServer(sessionId, server) {
        this.stickySessions.set(sessionId, {
            serverId: server.id,
            timestamp: Date.now()
        });

        // Clean up old sessions periodically
        this._cleanupStickySessions();
    }

    /**
     * Cleanup expired sticky sessions
     * @private
     */
    _cleanupStickySessions() {
        const now = Date.now();

        for (const [sessionId, sticky] of this.stickySessions) {
            if (now - sticky.timestamp > this.stickyTtl) {
                this.stickySessions.delete(sessionId);
            }
        }
    }

    /**
     * Start health checks
     */
    startHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(() => {
            this._performHealthChecks();
        }, this.healthCheckInterval);

        // Perform initial health check
        this._performHealthChecks();
    }

    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * Perform health checks on all servers
     * @private
     */
    async _performHealthChecks() {
        const promises = Array.from(this.servers.values()).map(server =>
            this._checkServerHealth(server)
        );

        await Promise.allSettled(promises);

        this.emit('health-check:complete', this.getStats());
    }

    /**
     * Check individual server health
     * @private
     */
    async _checkServerHealth(server) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.healthCheckTimeout);

            const response = await fetch(server.healthCheckUrl, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (response.ok) {
                server.updateHealth(true, HealthStatus.HEALTHY);
                server.recordSuccess();

                this.emit('server:healthy', server.getStats());
            } else {
                throw new Error(`Health check failed with status ${response.status}`);
            }

        } catch (error) {
            server.recordFailure();

            if (server.consecutiveFailures >= this.maxFailures) {
                server.updateHealth(false, HealthStatus.UNHEALTHY);
                this.emit('server:unhealthy', server.getStats());
            } else {
                server.updateHealth(true, HealthStatus.DEGRADED);
                this.emit('server:degraded', server.getStats());
            }
        }
    }

    /**
     * Mark server as complete
     * @param {string} serverId - Server ID
     * @param {boolean} success - Whether request was successful
     * @param {number} responseTime - Response time in ms
     */
    markComplete(serverId, success = true, responseTime = 0) {
        const server = this.servers.get(serverId);

        if (server) {
            server.decrementConnections();

            if (success) {
                server.recordSuccess();
                if (responseTime > 0) {
                    server.recordResponseTime(responseTime);
                }
            } else {
                server.recordFailure();
            }

            this.emit('request:complete', {
                serverId,
                success,
                responseTime,
                stats: server.getStats()
            });
        }
    }

    /**
     * Update server resources
     * @param {string} serverId - Server ID
     * @param {Object} resources - Resource usage
     */
    updateServerResources(serverId, resources) {
        const server = this.servers.get(serverId);

        if (server) {
            if (resources.cpu !== undefined) {
                server.cpuUsage = resources.cpu;
            }
            if (resources.memory !== undefined) {
                server.memoryUsage = resources.memory;
            }
        }
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        const servers = Array.from(this.servers.values());

        return {
            algorithm: this.algorithm,
            totalServers: servers.length,
            healthyServers: servers.filter(s => s.healthy).length,
            unhealthyServers: servers.filter(s => !s.healthy).length,
            totalConnections: servers.reduce((sum, s) => sum + s.activeConnections, 0),
            totalRequests: servers.reduce((sum, s) => sum + s.totalRequests, 0),
            servers: servers.map(s => s.getStats()),
            stickySessions: this.stickySessions.size
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.servers.forEach(server => {
            server.totalRequests = 0;
            server.failedRequests = 0;
            server.responseTimes = [];
            server.averageResponseTime = 0;
        });
    }

    /**
     * Set algorithm
     */
    setAlgorithm(algorithm) {
        if (Object.values(Algorithm).includes(algorithm)) {
            this.algorithm = algorithm;
            this.emit('algorithm:changed', algorithm);
        }
    }
}

module.exports = {
    LoadBalancer,
    Algorithm,
    HealthStatus,
    Server
};
