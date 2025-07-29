'use strict';

/**
 * @fileoverview Enterprise-grade integration service for third-party system orchestration
 * @module shared/lib/services/integration-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/webhook-service
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/config
 */

const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const CacheService = require('./cache-service');
const WebhookService = require('./webhook-service');
const OrganizationModel = require('../database/models/organization-model');
const AuditLogModel = require('../database/models/audit-log-model');
const EncryptionService = require('../security/encryption/encryption-service');
const ExternalAPIService = require('./external-api-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * @class IntegrationService
 * @extends EventEmitter
 * @description Comprehensive integration service for managing third-party system connections
 */
class IntegrationService extends EventEmitter {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #integrations = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #connectors = new Map();

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {EncryptionService}
   */
  static #encryptionService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #rateLimiters = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #circuitBreakers = new Map();

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @type {EventEmitter}
   */
  static #eventEmitter = new EventEmitter();

  /**
   * Initialize integration service
   * @static
   * @returns {Promise<void>}
   */
  static async initialize() {
    if (this.#initialized) {
      return;
    }

    try {
      this.#cacheService = new CacheService({ namespace: 'integrations' });
      this.#encryptionService = new EncryptionService();

      // Register built-in connectors
      await this.#registerBuiltInConnectors();

      // Load saved integrations
      await this.#loadSavedIntegrations();

      this.#initialized = true;
      logger.info('IntegrationService initialized');
    } catch (error) {
      logger.error('Failed to initialize IntegrationService', { error: error.message });
      throw new AppError(
        'Integration service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Register a new integration connector
   * @static
   * @param {Object} connector - Connector configuration
   * @param {string} connector.id - Unique connector ID
   * @param {string} connector.name - Display name
   * @param {string} connector.type - Connector type
   * @param {Object} connector.config - Configuration schema
   * @param {Function} connector.connect - Connection function
   * @param {Function} connector.disconnect - Disconnection function
   * @param {Function} connector.execute - Execution function
   * @param {Object} [connector.methods] - Available methods
   * @returns {boolean} Registration success
   */
  static registerConnector(connector) {
    const { id, name, type, config, connect, disconnect, execute, methods } = connector;

    if (!id || !name || !connect || !execute) {
      throw new AppError(
        'Invalid connector configuration',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    this.#connectors.set(id, {
      id,
      name,
      type: type || 'custom',
      config: config || {},
      connect,
      disconnect: disconnect || (() => Promise.resolve()),
      execute,
      methods: methods || {},
      metadata: {
        registeredAt: new Date(),
        version: connector.version || '1.0.0'
      }
    });

    logger.info('Integration connector registered', { id, name, type });
    return true;
  }

  /**
   * Create integration for organization
   * @static
   * @param {Object} options - Integration options
   * @param {string} options.organizationId - Organization ID
   * @param {string} options.connectorId - Connector ID
   * @param {string} options.name - Integration name
   * @param {Object} options.config - Integration configuration
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.userId] - User creating integration
   * @returns {Promise<Object>} Created integration
   */
  static async createIntegration(options) {
    await this.initialize();

    const { organizationId, connectorId, name, config: integrationConfig, metadata, userId } = options;

    try {
      // Validate connector exists
      const connector = this.#connectors.get(connectorId);
      if (!connector) {
        throw new AppError(
          'Connector not found',
          404,
          ERROR_CODES.RESOURCE_NOT_FOUND
        );
      }

      // Validate configuration
      await this.#validateConfig(connector.config, integrationConfig);

      // Encrypt sensitive data
      const encryptedConfig = await this.#encryptConfig(integrationConfig);

      // Generate integration ID
      const integrationId = this.#generateIntegrationId();

      // Test connection
      const testResult = await this.#testConnection(connector, integrationConfig);
      if (!testResult.success) {
        throw new AppError(
          'Connection test failed',
          400,
          ERROR_CODES.INTEGRATION_CONNECTION_FAILED,
          { reason: testResult.error }
        );
      }

      // Create integration record
      const integration = {
        id: integrationId,
        organizationId,
        connectorId,
        name,
        config: encryptedConfig,
        status: 'active',
        metadata: {
          ...metadata,
          connectionTest: testResult,
          createdBy: userId,
          createdAt: new Date(),
          lastSync: null,
          errorCount: 0
        }
      };

      // Save to database
      await OrganizationModel.updateOne(
        { _id: organizationId },
        {
          $push: {
            integrations: integration
          }
        }
      );

      // Cache integration
      this.#integrations.set(integrationId, {
        ...integration,
        connector,
        decryptedConfig: integrationConfig
      });

      // Initialize rate limiter and circuit breaker
      this.#initializeRateLimiter(integrationId, connector);
      this.#initializeCircuitBreaker(integrationId, connector);

      // Audit log
      await this.#auditLog({
        action: 'integration.created',
        integrationId,
        organizationId,
        userId,
        metadata: {
          connectorId,
          name
        }
      });

      // Emit event
      this.#eventEmitter.emit('integration:created', integration);

      logger.info('Integration created', { integrationId, organizationId, connectorId });
      return this.#sanitizeIntegration(integration);

    } catch (error) {
      logger.error('Failed to create integration', {
        error: error.message,
        organizationId,
        connectorId
      });
      throw error;
    }
  }

  /**
   * Execute integration method
   * @static
   * @param {Object} options - Execution options
   * @param {string} options.integrationId - Integration ID
   * @param {string} options.method - Method to execute
   * @param {Object} [options.params] - Method parameters
   * @param {string} [options.userId] - User executing method
   * @param {Object} [options.context] - Execution context
   * @returns {Promise<Object>} Execution result
   */
  static async execute(options) {
    await this.initialize();

    const { integrationId, method, params = {}, userId, context = {} } = options;
    const startTime = Date.now();

    try {
      // Get integration
      const integration = await this.#getIntegration(integrationId);
      if (!integration) {
        throw new AppError(
          'Integration not found',
          404,
          ERROR_CODES.RESOURCE_NOT_FOUND
        );
      }

      // Check status
      if (integration.status !== 'active') {
        throw new AppError(
          'Integration is not active',
          400,
          ERROR_CODES.INTEGRATION_INACTIVE
        );
      }

      // Check rate limit
      await this.#checkRateLimit(integrationId);

      // Check circuit breaker
      await this.#checkCircuitBreaker(integrationId);

      // Prepare execution context
      const executionContext = {
        integrationId,
        method,
        params,
        config: integration.decryptedConfig,
        context: {
          ...context,
          organizationId: integration.organizationId,
          userId
        }
      };

      // Execute through connector
      const result = await this.#executeWithRetry(
        integration.connector,
        executionContext
      );

      // Update last sync
      await this.#updateLastSync(integrationId, {
        success: true,
        method,
        duration: Date.now() - startTime
      });

      // Cache result if applicable
      if (result.cacheable !== false) {
        await this.#cacheResult(integrationId, method, params, result);
      }

      // Emit event
      this.#eventEmitter.emit('integration:executed', {
        integrationId,
        method,
        success: true
      });

      return result;

    } catch (error) {
      // Update error count
      await this.#updateErrorCount(integrationId);

      // Record circuit breaker failure
      this.#recordCircuitBreakerFailure(integrationId);

      // Emit error event
      this.#eventEmitter.emit('integration:error', {
        integrationId,
        method,
        error: error.message
      });

      logger.error('Integration execution failed', {
        integrationId,
        method,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Integration execution failed',
        500,
        ERROR_CODES.INTEGRATION_EXECUTION_FAILED,
        { integrationId, method, originalError: error.message }
      );
    }
  }

  /**
   * Sync data from integration
   * @static
   * @param {Object} options - Sync options
   * @param {string} options.integrationId - Integration ID
   * @param {string} [options.syncType='full'] - Sync type (full/incremental)
   * @param {Date} [options.since] - Sync since date (for incremental)
   * @param {Function} [options.onProgress] - Progress callback
   * @param {string} [options.userId] - User initiating sync
   * @returns {Promise<Object>} Sync results
   */
  static async sync(options) {
    await this.initialize();

    const {
      integrationId,
      syncType = 'full',
      since,
      onProgress,
      userId
    } = options;

    const syncId = this.#generateSyncId();
    const startTime = Date.now();

    try {
      const integration = await this.#getIntegration(integrationId);
      if (!integration) {
        throw new AppError(
          'Integration not found',
          404,
          ERROR_CODES.RESOURCE_NOT_FOUND
        );
      }

      // Check if sync method exists
      if (!integration.connector.methods.sync) {
        throw new AppError(
          'Sync not supported by this integration',
          400,
          ERROR_CODES.METHOD_NOT_SUPPORTED
        );
      }

      logger.info('Starting integration sync', { syncId, integrationId, syncType });

      // Execute sync
      const syncParams = {
        type: syncType,
        since: since || integration.metadata.lastSync,
        onProgress: (progress) => {
          if (onProgress) onProgress(progress);
          this.#eventEmitter.emit('integration:sync:progress', {
            syncId,
            integrationId,
            progress
          });
        }
      };

      const result = await this.execute({
        integrationId,
        method: 'sync',
        params: syncParams,
        userId,
        context: { syncId }
      });

      // Process sync results
      const processed = await this.#processSyncResults(integration, result);

      // Update last sync
      await this.#updateLastSync(integrationId, {
        success: true,
        syncType,
        recordsProcessed: processed.total,
        duration: Date.now() - startTime
      });

      // Audit log
      await this.#auditLog({
        action: 'integration.synced',
        integrationId,
        organizationId: integration.organizationId,
        userId,
        metadata: {
          syncId,
          syncType,
          recordsProcessed: processed.total,
          duration: Date.now() - startTime
        }
      });

      logger.info('Integration sync completed', {
        syncId,
        integrationId,
        recordsProcessed: processed.total
      });

      return {
        syncId,
        integrationId,
        syncType,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        processed,
        status: 'completed'
      };

    } catch (error) {
      logger.error('Integration sync failed', {
        syncId,
        integrationId,
        error: error.message
      });

      // Update error count
      await this.#updateErrorCount(integrationId);

      throw error;
    }
  }

  /**
   * List available connectors
   * @static
   * @param {Object} [filters] - Filter options
   * @returns {Array<Object>} Available connectors
   */
  static listConnectors(filters = {}) {
    const connectors = [];
    
    this.#connectors.forEach((connector, id) => {
      if (filters.type && connector.type !== filters.type) {
        return;
      }

      connectors.push({
        id: connector.id,
        name: connector.name,
        type: connector.type,
        configSchema: connector.config,
        methods: Object.keys(connector.methods),
        version: connector.metadata.version
      });
    });

    return connectors;
  }

  /**
   * Get organization integrations
   * @static
   * @param {string} organizationId - Organization ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Array>} Organization integrations
   */
  static async getOrganizationIntegrations(organizationId, options = {}) {
    const organization = await OrganizationModel.findById(organizationId)
      .select('integrations')
      .lean();

    if (!organization) {
      throw new AppError(
        'Organization not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    let integrations = organization.integrations || [];

    // Apply filters
    if (options.status) {
      integrations = integrations.filter(i => i.status === options.status);
    }

    if (options.connectorId) {
      integrations = integrations.filter(i => i.connectorId === options.connectorId);
    }

    // Sanitize and enrich
    return integrations.map(integration => {
      const connector = this.#connectors.get(integration.connectorId);
      return {
        ...this.#sanitizeIntegration(integration),
        connector: connector ? {
          id: connector.id,
          name: connector.name,
          type: connector.type
        } : null
      };
    });
  }

  /**
   * Update integration
   * @static
   * @param {Object} options - Update options
   * @param {string} options.integrationId - Integration ID
   * @param {Object} options.updates - Updates to apply
   * @param {string} [options.userId] - User updating integration
   * @returns {Promise<Object>} Updated integration
   */
  static async updateIntegration(options) {
    const { integrationId, updates, userId } = options;

    const integration = await this.#getIntegration(integrationId);
    if (!integration) {
      throw new AppError(
        'Integration not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    // Handle config updates
    if (updates.config) {
      await this.#validateConfig(integration.connector.config, updates.config);
      updates.config = await this.#encryptConfig(updates.config);
      
      // Test new config
      const testResult = await this.#testConnection(integration.connector, updates.config);
      if (!testResult.success) {
        throw new AppError(
          'Connection test with new config failed',
          400,
          ERROR_CODES.INTEGRATION_CONNECTION_FAILED
        );
      }
    }

    // Update in database
    await OrganizationModel.updateOne(
      {
        _id: integration.organizationId,
        'integrations.id': integrationId
      },
      {
        $set: Object.entries(updates).reduce((acc, [key, value]) => {
          acc[`integrations.$.${key}`] = value;
          return acc;
        }, {})
      }
    );

    // Update cache
    if (this.#integrations.has(integrationId)) {
      Object.assign(this.#integrations.get(integrationId), updates);
    }

    // Audit log
    await this.#auditLog({
      action: 'integration.updated',
      integrationId,
      organizationId: integration.organizationId,
      userId,
      metadata: { updates: Object.keys(updates) }
    });

    return this.#sanitizeIntegration({
      ...integration,
      ...updates
    });
  }

  /**
   * Delete integration
   * @static
   * @param {Object} options - Delete options
   * @param {string} options.integrationId - Integration ID
   * @param {string} [options.userId] - User deleting integration
   * @returns {Promise<boolean>} Success status
   */
  static async deleteIntegration(options) {
    const { integrationId, userId } = options;

    const integration = await this.#getIntegration(integrationId);
    if (!integration) {
      throw new AppError(
        'Integration not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    // Disconnect if connected
    if (integration.connector.disconnect) {
      try {
        await integration.connector.disconnect(integration.decryptedConfig);
      } catch (error) {
        logger.warn('Error disconnecting integration', {
          integrationId,
          error: error.message
        });
      }
    }

    // Remove from database
    await OrganizationModel.updateOne(
      { _id: integration.organizationId },
      {
        $pull: {
          integrations: { id: integrationId }
        }
      }
    );

    // Remove from cache
    this.#integrations.delete(integrationId);
    this.#rateLimiters.delete(integrationId);
    this.#circuitBreakers.delete(integrationId);

    // Clear cached data
    await this.#cacheService.deletePattern(`integration:${integrationId}:*`);

    // Audit log
    await this.#auditLog({
      action: 'integration.deleted',
      integrationId,
      organizationId: integration.organizationId,
      userId,
      metadata: {
        name: integration.name,
        connectorId: integration.connectorId
      }
    });

    logger.info('Integration deleted', { integrationId });
    return true;
  }

  /**
   * Register webhook for integration
   * @static
   * @param {Object} options - Webhook options
   * @param {string} options.integrationId - Integration ID
   * @param {string} options.event - Event name
   * @param {string} options.url - Webhook URL
   * @param {Object} [options.config] - Webhook configuration
   * @returns {Promise<Object>} Webhook registration result
   */
  static async registerWebhook(options) {
    const { integrationId, event, url, config } = options;

    const integration = await this.#getIntegration(integrationId);
    if (!integration) {
      throw new AppError(
        'Integration not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    // Register with webhook service
    const webhook = await WebhookService.register({
      organizationId: integration.organizationId,
      url,
      events: [`integration.${integrationId}.${event}`],
      metadata: {
        integrationId,
        connectorId: integration.connectorId,
        ...config
      }
    });

    logger.info('Integration webhook registered', {
      integrationId,
      event,
      webhookId: webhook.id
    });

    return webhook;
  }

  /**
   * Handle incoming webhook
   * @static
   * @param {Object} options - Webhook data
   * @param {string} options.integrationId - Integration ID
   * @param {Object} options.headers - Request headers
   * @param {Object} options.body - Request body
   * @param {string} [options.signature] - Request signature
   * @returns {Promise<Object>} Processing result
   */
  static async handleWebhook(options) {
    const { integrationId, headers, body, signature } = options;

    const integration = await this.#getIntegration(integrationId);
    if (!integration) {
      throw new AppError(
        'Integration not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    // Verify webhook if connector supports it
    if (integration.connector.methods.verifyWebhook) {
      const verified = await integration.connector.methods.verifyWebhook({
        headers,
        body,
        signature,
        config: integration.decryptedConfig
      });

      if (!verified) {
        throw new AppError(
          'Webhook verification failed',
          401,
          ERROR_CODES.WEBHOOK_VERIFICATION_FAILED
        );
      }
    }

    // Process webhook
    if (integration.connector.methods.processWebhook) {
      const result = await integration.connector.methods.processWebhook({
        headers,
        body,
        config: integration.decryptedConfig,
        context: {
          integrationId,
          organizationId: integration.organizationId
        }
      });

      // Emit event
      this.#eventEmitter.emit('integration:webhook:received', {
        integrationId,
        result
      });

      return result;
    }

    return { processed: true };
  }

  /**
   * Get integration health status
   * @static
   * @param {string} integrationId - Integration ID
   * @returns {Promise<Object>} Health status
   */
  static async getHealth(integrationId) {
    const integration = await this.#getIntegration(integrationId);
    if (!integration) {
      throw new AppError(
        'Integration not found',
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const health = {
      id: integrationId,
      name: integration.name,
      status: integration.status,
      connector: integration.connector.name,
      lastSync: integration.metadata.lastSync,
      errorCount: integration.metadata.errorCount || 0,
      circuitBreaker: 'closed',
      rateLimit: null
    };

    // Check circuit breaker status
    const circuitBreaker = this.#circuitBreakers.get(integrationId);
    if (circuitBreaker) {
      health.circuitBreaker = circuitBreaker.state;
    }

    // Check rate limit status
    const rateLimiter = this.#rateLimiters.get(integrationId);
    if (rateLimiter) {
      health.rateLimit = {
        remaining: rateLimiter.remaining,
        reset: rateLimiter.reset
      };
    }

    // Test connection if active
    if (integration.status === 'active') {
      try {
        const testResult = await this.#testConnection(
          integration.connector,
          integration.decryptedConfig
        );
        health.connectionTest = testResult;
      } catch (error) {
        health.connectionTest = {
          success: false,
          error: error.message
        };
      }
    }

    return health;
  }

  /**
   * Subscribe to integration events
   * @static
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  static on(event, handler) {
    this.#eventEmitter.on(event, handler);
    return () => this.#eventEmitter.off(event, handler);
  }

  /**
   * @private
   * Register built-in connectors
   */
  static async #registerBuiltInConnectors() {
    // Salesforce connector
    this.registerConnector({
      id: 'salesforce',
      name: 'Salesforce',
      type: 'crm',
      config: {
        clientId: { type: 'string', required: true },
        clientSecret: { type: 'string', required: true, sensitive: true },
        username: { type: 'string', required: true },
        password: { type: 'string', required: true, sensitive: true },
        securityToken: { type: 'string', required: true, sensitive: true },
        sandbox: { type: 'boolean', default: false }
      },
      connect: async (config) => {
        // Salesforce connection logic
        return { connected: true };
      },
      execute: async (context) => {
        // Execute Salesforce API calls
        return ExternalAPIService.request({
          method: context.method,
          url: `https://${context.config.sandbox ? 'test' : 'login'}.salesforce.com/services/data/v50.0/${context.params.endpoint}`,
          headers: {
            'Authorization': `Bearer ${context.config.accessToken}`
          }
        });
      },
      methods: {
        sync: async (context) => {
          // Salesforce sync logic
          return { records: [] };
        },
        getContacts: async (context) => {
          // Get contacts logic
          return { contacts: [] };
        }
      }
    });

    // HubSpot connector
    this.registerConnector({
      id: 'hubspot',
      name: 'HubSpot',
      type: 'marketing',
      config: {
        apiKey: { type: 'string', required: true, sensitive: true }
      },
      connect: async (config) => {
        return { connected: true };
      },
      execute: async (context) => {
        return ExternalAPIService.request({
          method: context.method,
          url: `https://api.hubapi.com/crm/v3/${context.params.endpoint}`,
          headers: {
            'Authorization': `Bearer ${context.config.apiKey}`
          }
        });
      },
      methods: {
        sync: async (context) => {
          return { records: [] };
        }
      }
    });

    // Slack connector
    this.registerConnector({
      id: 'slack',
      name: 'Slack',
      type: 'communication',
      config: {
        token: { type: 'string', required: true, sensitive: true },
        channel: { type: 'string', required: true }
      },
      connect: async (config) => {
        return { connected: true };
      },
      execute: async (context) => {
        if (context.method === 'sendMessage') {
          return ExternalAPIService.request({
            method: 'POST',
            url: 'https://slack.com/api/chat.postMessage',
            headers: {
              'Authorization': `Bearer ${context.config.token}`
            },
            data: {
              channel: context.config.channel,
              text: context.params.message
            }
          });
        }
      },
      methods: {
        sendMessage: async (context) => {
          return { sent: true };
        }
      }
    });

    // Google Workspace connector
    this.registerConnector({
      id: 'google-workspace',
      name: 'Google Workspace',
      type: 'productivity',
      config: {
        clientId: { type: 'string', required: true },
        clientSecret: { type: 'string', required: true, sensitive: true },
        refreshToken: { type: 'string', required: true, sensitive: true }
      },
      connect: async (config) => {
        return { connected: true };
      },
      execute: async (context) => {
        // Google API logic
        return { success: true };
      },
      methods: {
        syncCalendar: async (context) => {
          return { events: [] };
        },
        syncDrive: async (context) => {
          return { files: [] };
        }
      }
    });

    // Microsoft 365 connector
    this.registerConnector({
      id: 'microsoft365',
      name: 'Microsoft 365',
      type: 'productivity',
      config: {
        clientId: { type: 'string', required: true },
        clientSecret: { type: 'string', required: true, sensitive: true },
        tenantId: { type: 'string', required: true }
      },
      connect: async (config) => {
        return { connected: true };
      },
      execute: async (context) => {
        // Microsoft Graph API logic
        return { success: true };
      },
      methods: {
        syncCalendar: async (context) => {
          return { events: [] };
        },
        syncOneDrive: async (context) => {
          return { files: [] };
        }
      }
    });
  }

  /**
   * @private
   * Load saved integrations
   */
  static async #loadSavedIntegrations() {
    try {
      const organizations = await OrganizationModel.find({
        'integrations.0': { $exists: true }
      }).select('integrations').lean();

      for (const org of organizations) {
        for (const integration of org.integrations) {
          if (integration.status === 'active') {
            const connector = this.#connectors.get(integration.connectorId);
            if (connector) {
              try {
                const decryptedConfig = await this.#decryptConfig(integration.config);
                this.#integrations.set(integration.id, {
                  ...integration,
                  organizationId: org._id,
                  connector,
                  decryptedConfig
                });

                this.#initializeRateLimiter(integration.id, connector);
                this.#initializeCircuitBreaker(integration.id, connector);
              } catch (error) {
                logger.error('Failed to load integration', {
                  integrationId: integration.id,
                  error: error.message
                });
              }
            }
          }
        }
      }

      logger.info('Loaded saved integrations', {
        count: this.#integrations.size
      });
    } catch (error) {
      logger.error('Failed to load saved integrations', { error: error.message });
    }
  }

  /**
   * @private
   * Get integration with decrypted config
   */
  static async #getIntegration(integrationId) {
    // Check cache first
    if (this.#integrations.has(integrationId)) {
      return this.#integrations.get(integrationId);
    }

    // Load from database
    const organizations = await OrganizationModel.find({
      'integrations.id': integrationId
    }).select('integrations').lean();

    if (!organizations.length) {
      return null;
    }

    const org = organizations[0];
    const integration = org.integrations.find(i => i.id === integrationId);
    
    if (!integration) {
      return null;
    }

    const connector = this.#connectors.get(integration.connectorId);
    if (!connector) {
      throw new AppError(
        'Connector not found for integration',
        500,
        ERROR_CODES.CONNECTOR_NOT_FOUND
      );
    }

    const decryptedConfig = await this.#decryptConfig(integration.config);

    const fullIntegration = {
      ...integration,
      organizationId: org._id,
      connector,
      decryptedConfig
    };

    // Cache for future use
    this.#integrations.set(integrationId, fullIntegration);

    return fullIntegration;
  }

  /**
   * @private
   * Validate configuration against schema
   */
  static async #validateConfig(schema, config) {
    for (const [key, rules] of Object.entries(schema)) {
      if (rules.required && !config[key]) {
        throw new AppError(
          `Missing required field: ${key}`,
          400,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      if (config[key] !== undefined) {
        if (rules.type === 'string' && typeof config[key] !== 'string') {
          throw new AppError(
            `Invalid type for field ${key}: expected string`,
            400,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
        if (rules.type === 'boolean' && typeof config[key] !== 'boolean') {
          throw new AppError(
            `Invalid type for field ${key}: expected boolean`,
            400,
            ERROR_CODES.VALIDATION_ERROR
          );
        }
      }
    }
  }

  /**
   * @private
   * Encrypt sensitive configuration
   */
  static async #encryptConfig(config) {
    const encrypted = {};
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.length > 0) {
        encrypted[key] = await this.#encryptionService.encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }
    return encrypted;
  }

  /**
   * @private
   * Decrypt configuration
   */
  static async #decryptConfig(encryptedConfig) {
    const decrypted = {};
    for (const [key, value] of Object.entries(encryptedConfig)) {
      if (typeof value === 'string' && value.includes(':')) {
        try {
          decrypted[key] = await this.#encryptionService.decrypt(value);
        } catch (error) {
          decrypted[key] = value; // Not encrypted
        }
      } else {
        decrypted[key] = value;
      }
    }
    return decrypted;
  }

  /**
   * @private
   * Test connection
   */
  static async #testConnection(connector, config) {
    try {
      const result = await connector.connect(config);
      return {
        success: true,
        timestamp: new Date(),
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * @private
   * Execute with retry
   */
  static async #executeWithRetry(connector, context, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await connector.execute(context);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * @private
   * Initialize rate limiter
   */
  static #initializeRateLimiter(integrationId, connector) {
    const limits = connector.rateLimits || {
      requests: 100,
      window: 60000 // 1 minute
    };

    this.#rateLimiters.set(integrationId, {
      requests: limits.requests,
      window: limits.window,
      tokens: limits.requests,
      lastRefill: Date.now(),
      remaining: limits.requests,
      reset: Date.now() + limits.window
    });
  }

  /**
   * @private
   * Check rate limit
   */
  static async #checkRateLimit(integrationId) {
    const limiter = this.#rateLimiters.get(integrationId);
    if (!limiter) return;

    const now = Date.now();
    const timePassed = now - limiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / limiter.window * limiter.requests);

    if (tokensToAdd > 0) {
      limiter.tokens = Math.min(limiter.requests, limiter.tokens + tokensToAdd);
      limiter.lastRefill = now;
      limiter.reset = now + limiter.window;
    }

    if (limiter.tokens <= 0) {
      throw new AppError(
        'Rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        {
          reset: new Date(limiter.reset),
          limit: limiter.requests
        }
      );
    }

    limiter.tokens--;
    limiter.remaining = limiter.tokens;
  }

  /**
   * @private
   * Initialize circuit breaker
   */
  static #initializeCircuitBreaker(integrationId, connector) {
    const settings = connector.circuitBreaker || {
      threshold: 5,
      timeout: 60000, // 1 minute
      resetTimeout: 120000 // 2 minutes
    };

    this.#circuitBreakers.set(integrationId, {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      nextAttempt: null,
      settings
    });
  }

  /**
   * @private
   * Check circuit breaker
   */
  static async #checkCircuitBreaker(integrationId) {
    const breaker = this.#circuitBreakers.get(integrationId);
    if (!breaker) return;

    if (breaker.state === 'open') {
      if (Date.now() < breaker.nextAttempt) {
        throw new AppError(
          'Circuit breaker is open',
          503,
          ERROR_CODES.CIRCUIT_BREAKER_OPEN,
          {
            nextAttempt: new Date(breaker.nextAttempt)
          }
        );
      }
      // Try half-open
      breaker.state = 'half-open';
    }
  }

  /**
   * @private
   * Record circuit breaker failure
   */
  static #recordCircuitBreakerFailure(integrationId) {
    const breaker = this.#circuitBreakers.get(integrationId);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= breaker.settings.threshold) {
      breaker.state = 'open';
      breaker.nextAttempt = Date.now() + breaker.settings.timeout;
      
      logger.warn('Circuit breaker opened', {
        integrationId,
        failures: breaker.failures
      });
    }
  }

  /**
   * @private
   * Process sync results
   */
  static async #processSyncResults(integration, results) {
    const processed = {
      total: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    // Process based on connector type
    if (integration.connector.methods.processSyncResults) {
      return await integration.connector.methods.processSyncResults({
        results,
        context: {
          integrationId: integration.id,
          organizationId: integration.organizationId
        }
      });
    }

    return processed;
  }

  /**
   * @private
   * Cache result
   */
  static async #cacheResult(integrationId, method, params, result) {
    const cacheKey = `integration:${integrationId}:${method}:${crypto
      .createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .substring(0, 16)}`;

    await this.#cacheService.set(cacheKey, result, 300); // 5 minutes
  }

  /**
   * @private
   * Update last sync
   */
  static async #updateLastSync(integrationId, syncInfo) {
    await OrganizationModel.updateOne(
      { 'integrations.id': integrationId },
      {
        $set: {
          'integrations.$.metadata.lastSync': new Date(),
          'integrations.$.metadata.lastSyncInfo': syncInfo
        }
      }
    );

    // Update cache
    const cached = this.#integrations.get(integrationId);
    if (cached) {
      cached.metadata.lastSync = new Date();
      cached.metadata.lastSyncInfo = syncInfo;
    }
  }

  /**
   * @private
   * Update error count
   */
  static async #updateErrorCount(integrationId) {
    await OrganizationModel.updateOne(
      { 'integrations.id': integrationId },
      {
        $inc: {
          'integrations.$.metadata.errorCount': 1
        },
        $set: {
          'integrations.$.metadata.lastError': new Date()
        }
      }
    );

    // Update cache
    const cached = this.#integrations.get(integrationId);
    if (cached) {
      cached.metadata.errorCount = (cached.metadata.errorCount || 0) + 1;
      cached.metadata.lastError = new Date();

      // Auto-disable after too many errors
      if (cached.metadata.errorCount >= 10) {
        await this.updateIntegration({
          integrationId,
          updates: { status: 'error' }
        });
      }
    }
  }

  /**
   * @private
   * Sanitize integration for external use
   */
  static #sanitizeIntegration(integration) {
    const sanitized = { ...integration };
    delete sanitized.config;
    delete sanitized.decryptedConfig;
    delete sanitized.connector;
    return sanitized;
  }

  /**
   * @private
   * Generate integration ID
   */
  static #generateIntegrationId() {
    return `int_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate sync ID
   */
  static #generateSyncId() {
    return `sync_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'integration',
        resourceId: data.integrationId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error: error.message });
    }
  }
}

module.exports = IntegrationService;