'use strict';

/**
 * @fileoverview Central export file for all shared services
 * @module shared/lib/services
 * @description Aggregates and exports all service modules for centralized access
 */

// Core Communication Services
const EmailService = require('./email-service');
const SMSService = require('./sms-service');
const NotificationService = require('./notification-service');

// Data and Storage Services
const CacheService = require('./cache-service');
const FileService = require('./file-service');
const SearchService = require('./search-service');
const BackupService = require('./backup-service');

// Integration and External Services
const WebhookService = require('./webhook-service');
const IntegrationService = require('./integration-service');
const ExternalAPIService = require('./external-api-service');

// Business Services
const PaymentService = require('./payment-service');
const AnalyticsService = require('./analytics-service');

/**
 * @namespace Services
 * @description Collection of all available services
 */
const Services = {
  // Communication
  EmailService,
  SMSService,
  NotificationService,

  // Data & Storage
  CacheService,
  FileService,
  SearchService,
  BackupService,

  // Integration
  WebhookService,
  IntegrationService,
  ExternalAPIService,

  // Business
  PaymentService,
  AnalyticsService
};

// Initialize critical services on module load
(async function initializeServices() {
  try {
    // Initialize services that require startup configuration
    await Promise.all([
      CacheService.getInstance().initialize?.(),
      NotificationService.initialize?.(),
      IntegrationService.initialize?.(),
      PaymentService.initialize?.()
    ]);

    console.log('[Services] Core services initialized successfully');
  } catch (error) {
    console.error('[Services] Failed to initialize some services:', error.message);
    // Don't throw - allow the application to start even if some services fail
  }
})();

// Export individual services
module.exports = {
  // Communication Services
  EmailService,
  SMSService,
  NotificationService,

  // Data and Storage Services
  CacheService,
  FileService,
  SearchService,
  BackupService,

  // Integration and External Services
  WebhookService,
  IntegrationService,
  ExternalAPIService,

  // Business Services
  PaymentService,
  AnalyticsService,

  // Convenience methods
  /**
   * Get service by name
   * @param {string} serviceName - Name of the service
   * @returns {Object|null} Service class or null if not found
   */
  getService(serviceName) {
    return Services[serviceName] || null;
  },

  /**
   * List all available services
   * @returns {Array<string>} Array of service names
   */
  listServices() {
    return Object.keys(Services);
  },

  /**
   * Check if service exists
   * @param {string} serviceName - Name of the service
   * @returns {boolean} True if service exists
   */
  hasService(serviceName) {
    return Services.hasOwnProperty(serviceName);
  },

  /**
   * Initialize all services
   * @returns {Promise<Object>} Initialization results
   */
  async initializeAll() {
    const results = {};
    
    for (const [name, Service] of Object.entries(Services)) {
      try {
        if (typeof Service.initialize === 'function') {
          await Service.initialize();
          results[name] = { initialized: true };
        } else {
          results[name] = { initialized: true, note: 'No initialization required' };
        }
      } catch (error) {
        results[name] = { 
          initialized: false, 
          error: error.message 
        };
      }
    }
    
    return results;
  },

  /**
   * Gracefully shutdown all services
   * @returns {Promise<Object>} Shutdown results
   */
  async shutdownAll() {
    const results = {};
    
    for (const [name, Service] of Object.entries(Services)) {
      try {
        if (typeof Service.shutdown === 'function') {
          await Service.shutdown();
          results[name] = { shutdown: true };
        } else if (typeof Service.getInstance === 'function') {
          const instance = Service.getInstance();
          if (typeof instance.shutdown === 'function') {
            await instance.shutdown();
            results[name] = { shutdown: true };
          }
        } else {
          results[name] = { shutdown: true, note: 'No shutdown required' };
        }
      } catch (error) {
        results[name] = { 
          shutdown: false, 
          error: error.message 
        };
      }
    }
    
    return results;
  },

  /**
   * Get service health status
   * @returns {Promise<Object>} Health status for all services
   */
  async getHealthStatus() {
    const health = {};
    
    for (const [name, Service] of Object.entries(Services)) {
      try {
        if (typeof Service.getHealth === 'function') {
          health[name] = await Service.getHealth();
        } else if (typeof Service.getStats === 'function') {
          health[name] = await Service.getStats();
        } else if (typeof Service.isInitialized === 'function') {
          health[name] = { 
            status: Service.isInitialized() ? 'healthy' : 'not_initialized' 
          };
        } else {
          health[name] = { status: 'unknown' };
        }
      } catch (error) {
        health[name] = { 
          status: 'error', 
          error: error.message 
        };
      }
    }
    
    return health;
  },

  /**
   * Service factory for creating service instances with custom config
   * @param {string} serviceName - Name of the service
   * @param {Object} config - Configuration options
   * @returns {Object} Service instance
   */
  createService(serviceName, config = {}) {
    const Service = Services[serviceName];
    
    if (!Service) {
      throw new Error(`Service '${serviceName}' not found`);
    }
    
    // Handle different service instantiation patterns
    if (typeof Service.getInstance === 'function') {
      return Service.getInstance(config);
    } else if (typeof Service.create === 'function') {
      return Service.create(config);
    } else if (Service.prototype && Service.prototype.constructor) {
      return new Service(config);
    } else {
      // Static service
      return Service;
    }
  },

  /**
   * Register custom service
   * @param {string} name - Service name
   * @param {Object} service - Service class or object
   * @returns {boolean} Registration success
   */
  registerService(name, service) {
    if (Services[name]) {
      throw new Error(`Service '${name}' already exists`);
    }
    
    Services[name] = service;
    module.exports[name] = service;
    
    return true;
  },

  /**
   * Service middleware for Express routes
   * @param {Array<string>} requiredServices - Services required for the route
   * @returns {Function} Express middleware
   */
  requireServices(requiredServices = []) {
    return (req, res, next) => {
      req.services = {};
      
      for (const serviceName of requiredServices) {
        const Service = Services[serviceName];
        
        if (!Service) {
          return res.status(500).json({
            error: `Required service '${serviceName}' not found`
          });
        }
        
        req.services[serviceName] = Service;
      }
      
      // Add all services if no specific ones required
      if (requiredServices.length === 0) {
        req.services = { ...Services };
      }
      
      next();
    };
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Services] SIGTERM received, shutting down services...');
  await module.exports.shutdownAll();
});

process.on('SIGINT', async () => {
  console.log('[Services] SIGINT received, shutting down services...');
  await module.exports.shutdownAll();
});