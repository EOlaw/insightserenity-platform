'use strict';

/**
 * @fileoverview Platform Management Services Index - Enterprise Service Orchestration and Management
 * @module servers/admin-server/modules/platform-management/services
 * @version 3.2.0
 * @author InsightSerenity Platform Team
 * @description This module serves as the central enterprise-grade orchestrator for all platform management services,
 *              providing unified service access, dependency injection, health monitoring, metrics collection,
 *              service discovery, load balancing, circuit breaking, configuration management, audit logging,
 *              performance optimization, and comprehensive service lifecycle management for the InsightSerenity platform.
 * 
 * Features:
 * - Centralized service orchestration and management
 * - Advanced service health monitoring and recovery
 * - Comprehensive metrics collection and analytics
 * - Service dependency management and injection
 * - Circuit breaker and resilience patterns
 * - Configuration management and validation
 * - Audit logging and security compliance
 * - Performance monitoring and optimization
 * - Service discovery and load balancing
 * - Event-driven service communication
 * - Resource management and pooling
 * - Graceful degradation and fallback mechanisms
 * - Enterprise-grade error handling and recovery
 * - Service versioning and compatibility management
 * - Real-time monitoring and alerting
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const crypto = require('crypto');
const express = require('express');

// Core infrastructure imports
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');

// Platform Management Service imports
const ConfigurationService = require('./configuration-service');
const MaintenanceService = require('./maintenance-service');
const PlatformService = require('./platform-service');
const SystemService = require('./system-service');

/**
 * ServiceHealthStatus - Enumeration for service health states
 * @readonly
 * @enum {string}
 */
const ServiceHealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
  STARTING: 'starting',
  STOPPING: 'stopping',
  FAILED: 'failed'
};

/**
 * ServiceState - Enumeration for service lifecycle states
 * @readonly
 * @enum {string}
 */
const ServiceState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  INITIALIZED: 'initialized',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
  MAINTENANCE: 'maintenance'
};

/**
 * ServicePriority - Enumeration for service initialization priorities
 * @readonly
 * @enum {number}
 */
const ServicePriority = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4
};

/**
 * CircuitBreakerState - Enumeration for circuit breaker states
 * @readonly
 * @enum {string}
 */
const CircuitBreakerState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * @class PlatformManagementServicesOrchestrator
 * @extends EventEmitter
 * @description Enterprise-grade service orchestrator that manages all platform management services
 *              with advanced features including health monitoring, metrics collection, service discovery,
 *              circuit breaking, configuration management, and comprehensive lifecycle management.
 */
class PlatformManagementServicesOrchestrator extends EventEmitter {
  /**
   * Creates an instance of PlatformManagementServicesOrchestrator
   * @constructor
   */
  constructor() {
    super();
    
    // Set maximum listeners to handle enterprise-scale event management
    this.setMaxListeners(100);
    
    // Core infrastructure services
    this.#cacheService = new CacheService({
      prefix: 'platform_mgmt:',
      ttl: 300,
      maxMemory: '512mb',
      enableCompression: true
    });
    
    this.#notificationService = new NotificationService();
    this.#auditService = new AuditService();
    this.#transactionManager = new TransactionManager();
    
    // Service registry and management
    this.#serviceRegistry = new Map();
    this.#serviceMetrics = new Map();
    this.#serviceHealthChecks = new Map();
    this.#serviceDependencies = new Map();
    this.#serviceCircuitBreakers = new Map();
    this.#serviceLoadBalancers = new Map();
    
    // Configuration and state management
    this.#configuration = new Map();
    this.#serviceStates = new Map();
    this.#performanceMetrics = new Map();
    this.#eventHistory = [];
    this.#errorHistory = [];
    
    // Operational state
    this.#initialized = false;
    this.#starting = false;
    this.#stopping = false;
    this.#healthCheckInterval = null;
    this.#metricsCollectionInterval = null;
    this.#performanceMonitoringInterval = null;
    
    // Enterprise features
    this.#rateLimiters = new Map();
    this.#requestQueues = new Map();
    this.#resourcePools = new Map();
    this.#securityPolicies = new Map();
    
    // Initialize core configuration
    this.#initializeConfiguration();
    
    // Setup event handlers
    this.#setupEventHandlers();
    
    logger.info('PlatformManagementServicesOrchestrator instantiated', {
      maxListeners: this.getMaxListeners(),
      initialConfiguration: Object.fromEntries(this.#configuration)
    });
  }

  // Private fields
  #cacheService;
  #notificationService;
  #auditService;
  #transactionManager;
  #serviceRegistry;
  #serviceMetrics;
  #serviceHealthChecks;
  #serviceDependencies;
  #serviceCircuitBreakers;
  #serviceLoadBalancers;
  #configuration;
  #serviceStates;
  #performanceMetrics;
  #eventHistory;
  #errorHistory;
  #initialized;
  #starting;
  #stopping;
  #healthCheckInterval;
  #metricsCollectionInterval;
  #performanceMonitoringInterval;
  #rateLimiters;
  #requestQueues;
  #resourcePools;
  #securityPolicies;

  // Constants
  static SERVICE_NAMES = {
    CONFIGURATION: 'configuration',
    MAINTENANCE: 'maintenance',
    PLATFORM: 'platform',
    SYSTEM: 'system'
  };

  static EVENTS = {
    SERVICE_REGISTERED: 'service.registered',
    SERVICE_STARTED: 'service.started',
    SERVICE_STOPPED: 'service.stopped',
    SERVICE_HEALTH_CHANGED: 'service.health.changed',
    SERVICE_ERROR: 'service.error',
    SERVICE_RECOVERED: 'service.recovered',
    CIRCUIT_BREAKER_OPENED: 'circuit.breaker.opened',
    CIRCUIT_BREAKER_CLOSED: 'circuit.breaker.closed',
    METRICS_COLLECTED: 'metrics.collected',
    PERFORMANCE_ALERT: 'performance.alert',
    CONFIGURATION_CHANGED: 'configuration.changed',
    DEPENDENCY_FAILED: 'dependency.failed',
    RESOURCE_EXHAUSTED: 'resource.exhausted',
    SECURITY_VIOLATION: 'security.violation'
  };

  static CACHE_KEYS = {
    SERVICE_HEALTH: 'service:health',
    SERVICE_METRICS: 'service:metrics',
    SERVICE_CONFIG: 'service:config',
    PERFORMANCE_DATA: 'performance:data',
    CIRCUIT_BREAKER_STATE: 'circuit:breaker:state'
  };

  static HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  static METRICS_COLLECTION_INTERVAL = 10000; // 10 seconds
  static PERFORMANCE_MONITORING_INTERVAL = 5000; // 5 seconds
  static CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  static MAX_ERROR_HISTORY = 1000;
  static MAX_EVENT_HISTORY = 10000;

  /**
   * Initialize the orchestrator and all managed services
   * @async
   * @returns {Promise<void>}
   * @throws {AppError} If initialization fails
   */
  async initialize() {
    if (this.#initialized) {
      logger.warn('PlatformManagementServicesOrchestrator already initialized');
      return;
    }

    if (this.#starting) {
      throw new AppError('Orchestrator initialization already in progress', 409);
    }

    this.#starting = true;
    const startTime = performance.now();

    try {
      logger.info('Initializing PlatformManagementServicesOrchestrator...');

      // Initialize infrastructure services
      await this.#initializeInfrastructure();

      // Register all platform management services
      await this.#registerServices();

      // Initialize service dependencies
      await this.#initializeServiceDependencies();

      // Setup circuit breakers
      await this.#setupCircuitBreakers();

      // Initialize health monitoring
      await this.#initializeHealthMonitoring();

      // Initialize metrics collection
      await this.#initializeMetricsCollection();

      // Initialize performance monitoring
      await this.#initializePerformanceMonitoring();

      // Setup security policies
      await this.#setupSecurityPolicies();

      // Start all services in dependency order
      await this.#startServicesInOrder();

      // Setup resource pools
      await this.#setupResourcePools();

      // Initialize rate limiters
      await this.#initializeRateLimiters();

      // Validate service initialization
      await this.#validateServiceInitialization();

      this.#initialized = true;
      this.#starting = false;

      const initializationTime = performance.now() - startTime;

      logger.info('PlatformManagementServicesOrchestrator initialized successfully', {
        initializationTime: `${initializationTime.toFixed(2)}ms`,
        servicesRegistered: this.#serviceRegistry.size,
        healthMonitoring: !!this.#healthCheckInterval,
        metricsCollection: !!this.#metricsCollectionInterval,
        performanceMonitoring: !!this.#performanceMonitoringInterval
      });

      // Emit initialization complete event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_STARTED, {
        service: 'orchestrator',
        initializationTime,
        timestamp: new Date()
      });

      // Create audit log
      await this.#auditService.log({
        action: 'orchestrator.initialize',
        resource: 'platform_management_orchestrator',
        details: {
          initializationTime,
          servicesCount: this.#serviceRegistry.size,
          features: this.#getEnabledFeatures()
        }
      });

    } catch (error) {
      this.#starting = false;
      logger.error('Failed to initialize PlatformManagementServicesOrchestrator', {
        error: error.message,
        stack: error.stack
      });

      // Cleanup partial initialization
      await this.#cleanupPartialInitialization();

      throw new AppError(`Orchestrator initialization failed: ${error.message}`, 500);
    }
  }

  /**
   * Register a service with the orchestrator
   * @async
   * @param {string} serviceName - Name of the service
   * @param {Object} serviceInstance - Service instance
   * @param {Object} [options={}] - Registration options
   * @returns {Promise<Object>} Service registration details
   * @throws {AppError} If registration fails
   */
  async registerService(serviceName, serviceInstance, options = {}) {
    try {
      const registrationId = crypto.randomUUID();
      const registrationTime = new Date();

      // Validate service instance
      this.#validateServiceInstance(serviceName, serviceInstance);

      // Create service descriptor
      const serviceDescriptor = {
        name: serviceName,
        instance: serviceInstance,
        registrationId,
        registrationTime,
        state: ServiceState.UNINITIALIZED,
        health: ServiceHealthStatus.UNKNOWN,
        priority: options.priority || ServicePriority.NORMAL,
        dependencies: options.dependencies || [],
        configuration: options.configuration || {},
        metadata: {
          version: options.version || '1.0.0',
          description: options.description || `${serviceName} service`,
          tags: options.tags || [],
          capabilities: options.capabilities || [],
          endpoints: options.endpoints || [],
          ...options.metadata
        },
        metrics: {
          requestCount: 0,
          errorCount: 0,
          responseTime: [],
          throughput: 0,
          availability: 100
        },
        circuitBreaker: {
          state: CircuitBreakerState.CLOSED,
          failureCount: 0,
          lastFailureTime: null,
          timeout: options.circuitBreakerTimeout || PlatformManagementServicesOrchestrator.CIRCUIT_BREAKER_TIMEOUT
        }
      };

      // Register service
      this.#serviceRegistry.set(serviceName, serviceDescriptor);
      this.#serviceStates.set(serviceName, ServiceState.UNINITIALIZED);

      // Initialize service metrics
      this.#serviceMetrics.set(serviceName, {
        performance: new Map(),
        errors: new Map(),
        availability: new Map(),
        customMetrics: new Map()
      });

      // Setup service dependencies
      if (serviceDescriptor.dependencies.length > 0) {
        this.#serviceDependencies.set(serviceName, serviceDescriptor.dependencies);
      }

      // Initialize health check
      await this.#initializeServiceHealthCheck(serviceName, serviceDescriptor);

      // Setup circuit breaker
      await this.#setupServiceCircuitBreaker(serviceName, serviceDescriptor);

      logger.info('Service registered successfully', {
        serviceName,
        registrationId,
        priority: serviceDescriptor.priority,
        dependencies: serviceDescriptor.dependencies,
        capabilities: serviceDescriptor.metadata.capabilities
      });

      // Emit service registered event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_REGISTERED, {
        serviceName,
        serviceDescriptor,
        timestamp: registrationTime
      });

      return {
        registrationId,
        serviceName,
        state: serviceDescriptor.state,
        registrationTime
      };

    } catch (error) {
      logger.error('Failed to register service', {
        serviceName,
        error: error.message
      });
      throw new AppError(`Service registration failed: ${error.message}`, 500);
    }
  }

  /**
   * Start a specific service
   * @async
   * @param {string} serviceName - Name of the service to start
   * @returns {Promise<Object>} Service start result
   * @throws {AppError} If service start fails
   */
  async startService(serviceName) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      if (serviceDescriptor.state === ServiceState.RUNNING) {
        logger.warn(`Service '${serviceName}' already running`);
        return { serviceName, state: ServiceState.RUNNING, message: 'Already running' };
      }

      // Check dependencies
      await this.#checkServiceDependencies(serviceName);

      // Update state
      this.#updateServiceState(serviceName, ServiceState.STARTING);

      const startTime = performance.now();

      // Start the service
      if (typeof serviceDescriptor.instance.start === 'function') {
        await serviceDescriptor.instance.start();
      } else if (typeof serviceDescriptor.instance.initialize === 'function') {
        await serviceDescriptor.instance.initialize();
      }

      const startDuration = performance.now() - startTime;

      // Update state and health
      this.#updateServiceState(serviceName, ServiceState.RUNNING);
      await this.#updateServiceHealth(serviceName, ServiceHealthStatus.HEALTHY);

      // Record metrics
      this.#recordServiceMetric(serviceName, 'startTime', startDuration);

      logger.info('Service started successfully', {
        serviceName,
        startDuration: `${startDuration.toFixed(2)}ms`,
        state: ServiceState.RUNNING
      });

      // Emit service started event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_STARTED, {
        serviceName,
        startDuration,
        timestamp: new Date()
      });

      return {
        serviceName,
        state: ServiceState.RUNNING,
        startDuration
      };

    } catch (error) {
      // Update state to error
      this.#updateServiceState(serviceName, ServiceState.ERROR);
      await this.#updateServiceHealth(serviceName, ServiceHealthStatus.FAILED);

      logger.error('Failed to start service', {
        serviceName,
        error: error.message
      });

      throw new AppError(`Service start failed: ${error.message}`, 500);
    }
  }

  /**
   * Stop a specific service
   * @async
   * @param {string} serviceName - Name of the service to stop
   * @returns {Promise<Object>} Service stop result
   * @throws {AppError} If service stop fails
   */
  async stopService(serviceName) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      if (serviceDescriptor.state === ServiceState.STOPPED) {
        logger.warn(`Service '${serviceName}' already stopped`);
        return { serviceName, state: ServiceState.STOPPED, message: 'Already stopped' };
      }

      // Update state
      this.#updateServiceState(serviceName, ServiceState.STOPPING);

      const stopTime = performance.now();

      // Stop the service
      if (typeof serviceDescriptor.instance.stop === 'function') {
        await serviceDescriptor.instance.stop();
      } else if (typeof serviceDescriptor.instance.shutdown === 'function') {
        await serviceDescriptor.instance.shutdown();
      }

      const stopDuration = performance.now() - stopTime;

      // Update state and health
      this.#updateServiceState(serviceName, ServiceState.STOPPED);
      await this.#updateServiceHealth(serviceName, ServiceHealthStatus.UNKNOWN);

      // Record metrics
      this.#recordServiceMetric(serviceName, 'stopTime', stopDuration);

      logger.info('Service stopped successfully', {
        serviceName,
        stopDuration: `${stopDuration.toFixed(2)}ms`,
        state: ServiceState.STOPPED
      });

      // Emit service stopped event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_STOPPED, {
        serviceName,
        stopDuration,
        timestamp: new Date()
      });

      return {
        serviceName,
        state: ServiceState.STOPPED,
        stopDuration
      };

    } catch (error) {
      // Update state to error
      this.#updateServiceState(serviceName, ServiceState.ERROR);

      logger.error('Failed to stop service', {
        serviceName,
        error: error.message
      });

      throw new AppError(`Service stop failed: ${error.message}`, 500);
    }
  }

  /**
   * Get comprehensive service health status
   * @async
   * @param {string} [serviceName] - Optional specific service name
   * @returns {Promise<Object>} Service health information
   */
  async getServiceHealth(serviceName = null) {
    try {
      if (serviceName) {
        return await this.#getIndividualServiceHealth(serviceName);
      }

      // Get health for all services
      const healthData = {
        overall: {
          status: ServiceHealthStatus.HEALTHY,
          servicesTotal: this.#serviceRegistry.size,
          servicesHealthy: 0,
          servicesDegraded: 0,
          servicesUnhealthy: 0,
          lastCheck: new Date()
        },
        services: {},
        dependencies: {},
        circuitBreakers: {}
      };

      for (const [name, descriptor] of this.#serviceRegistry) {
        const serviceHealth = await this.#getIndividualServiceHealth(name);
        healthData.services[name] = serviceHealth;

        // Update overall counters
        switch (serviceHealth.status) {
          case ServiceHealthStatus.HEALTHY:
            healthData.overall.servicesHealthy++;
            break;
          case ServiceHealthStatus.DEGRADED:
            healthData.overall.servicesDegraded++;
            break;
          case ServiceHealthStatus.UNHEALTHY:
          case ServiceHealthStatus.FAILED:
            healthData.overall.servicesUnhealthy++;
            break;
        }

        // Include dependency information
        if (this.#serviceDependencies.has(name)) {
          healthData.dependencies[name] = await this.#checkServiceDependencies(name, false);
        }

        // Include circuit breaker information
        if (this.#serviceCircuitBreakers.has(name)) {
          healthData.circuitBreakers[name] = this.#serviceCircuitBreakers.get(name);
        }
      }

      // Determine overall health status
      if (healthData.overall.servicesUnhealthy > 0) {
        healthData.overall.status = ServiceHealthStatus.UNHEALTHY;
      } else if (healthData.overall.servicesDegraded > 0) {
        healthData.overall.status = ServiceHealthStatus.DEGRADED;
      }

      return healthData;

    } catch (error) {
      logger.error('Failed to get service health', {
        serviceName,
        error: error.message
      });
      throw new AppError(`Failed to get service health: ${error.message}`, 500);
    }
  }

  /**
   * Get comprehensive service metrics
   * @async
   * @param {string} [serviceName] - Optional specific service name
   * @param {Object} [options={}] - Metrics options
   * @returns {Promise<Object>} Service metrics data
   */
  async getServiceMetrics(serviceName = null, options = {}) {
    try {
      const {
        timeRange = '1h',
        includeHistorical = false,
        includePerformance = true,
        includeErrors = true
      } = options;

      if (serviceName) {
        return await this.#getIndividualServiceMetrics(serviceName, options);
      }

      // Get metrics for all services
      const metricsData = {
        overview: {
          totalRequests: 0,
          totalErrors: 0,
          averageResponseTime: 0,
          averageThroughput: 0,
          averageAvailability: 0,
          collectionTime: new Date()
        },
        services: {},
        performance: {},
        errors: {},
        historical: includeHistorical ? {} : undefined
      };

      const serviceNames = Array.from(this.#serviceRegistry.keys());
      let totalResponseTime = 0;
      let totalThroughput = 0;
      let totalAvailability = 0;

      for (const name of serviceNames) {
        const serviceMetrics = await this.#getIndividualServiceMetrics(name, options);
        metricsData.services[name] = serviceMetrics;

        // Aggregate overview metrics
        metricsData.overview.totalRequests += serviceMetrics.requestCount;
        metricsData.overview.totalErrors += serviceMetrics.errorCount;
        totalResponseTime += serviceMetrics.averageResponseTime;
        totalThroughput += serviceMetrics.throughput;
        totalAvailability += serviceMetrics.availability;

        if (includePerformance) {
          metricsData.performance[name] = serviceMetrics.performance;
        }

        if (includeErrors) {
          metricsData.errors[name] = serviceMetrics.errors;
        }

        if (includeHistorical) {
          metricsData.historical[name] = serviceMetrics.historical;
        }
      }

      // Calculate averages
      const serviceCount = serviceNames.length;
      if (serviceCount > 0) {
        metricsData.overview.averageResponseTime = totalResponseTime / serviceCount;
        metricsData.overview.averageThroughput = totalThroughput / serviceCount;
        metricsData.overview.averageAvailability = totalAvailability / serviceCount;
      }

      return metricsData;

    } catch (error) {
      logger.error('Failed to get service metrics', {
        serviceName,
        error: error.message
      });
      throw new AppError(`Failed to get service metrics: ${error.message}`, 500);
    }
  }

  /**
   * Execute a service operation with circuit breaker protection
   * @async
   * @param {string} serviceName - Name of the service
   * @param {string} operation - Operation name
   * @param {Function} operationFunc - Operation function to execute
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<*>} Operation result
   * @throws {AppError} If operation fails or circuit breaker is open
   */
  async executeServiceOperation(serviceName, operation, operationFunc, options = {}) {
    const startTime = performance.now();
    const operationId = crypto.randomUUID();

    try {
      // Check if service is registered
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      // Check circuit breaker
      const circuitBreaker = this.#serviceCircuitBreakers.get(serviceName);
      if (circuitBreaker && circuitBreaker.state === CircuitBreakerState.OPEN) {
        const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailureTime;
        if (timeSinceLastFailure < circuitBreaker.timeout) {
          throw new AppError(`Circuit breaker open for service '${serviceName}'`, 503);
        } else {
          // Move to half-open state
          circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
          this.#serviceCircuitBreakers.set(serviceName, circuitBreaker);
        }
      }

      // Execute the operation
      const result = await Promise.race([
        operationFunc(),
        this.#createOperationTimeout(options.timeout || 30000)
      ]);

      const executionTime = performance.now() - startTime;

      // Record successful operation
      this.#recordServiceOperation(serviceName, operation, executionTime, true);

      // Close circuit breaker if it was half-open
      if (circuitBreaker && circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
        circuitBreaker.state = CircuitBreakerState.CLOSED;
        circuitBreaker.failureCount = 0;
        this.#serviceCircuitBreakers.set(serviceName, circuitBreaker);

        this.emit(PlatformManagementServicesOrchestrator.EVENTS.CIRCUIT_BREAKER_CLOSED, {
          serviceName,
          operation,
          timestamp: new Date()
        });
      }

      logger.debug('Service operation executed successfully', {
        serviceName,
        operation,
        operationId,
        executionTime: `${executionTime.toFixed(2)}ms`
      });

      return result;

    } catch (error) {
      const executionTime = performance.now() - startTime;

      // Record failed operation
      this.#recordServiceOperation(serviceName, operation, executionTime, false, error);

      // Update circuit breaker
      const circuitBreaker = this.#serviceCircuitBreakers.get(serviceName);
      if (circuitBreaker) {
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();

        if (circuitBreaker.failureCount >= (options.failureThreshold || 5)) {
          circuitBreaker.state = CircuitBreakerState.OPEN;
          
          this.emit(PlatformManagementServicesOrchestrator.EVENTS.CIRCUIT_BREAKER_OPENED, {
            serviceName,
            operation,
            failureCount: circuitBreaker.failureCount,
            timestamp: new Date()
          });
        }

        this.#serviceCircuitBreakers.set(serviceName, circuitBreaker);
      }

      logger.error('Service operation failed', {
        serviceName,
        operation,
        operationId,
        executionTime: `${executionTime.toFixed(2)}ms`,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get service configuration
   * @param {string} serviceName - Name of the service
   * @returns {Object} Service configuration
   * @throws {AppError} If service not found
   */
  getServiceConfiguration(serviceName) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      return {
        name: serviceName,
        configuration: serviceDescriptor.configuration,
        metadata: serviceDescriptor.metadata,
        state: serviceDescriptor.state,
        health: serviceDescriptor.health,
        dependencies: serviceDescriptor.dependencies,
        registrationTime: serviceDescriptor.registrationTime
      };

    } catch (error) {
      logger.error('Failed to get service configuration', {
        serviceName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update service configuration
   * @async
   * @param {string} serviceName - Name of the service
   * @param {Object} configuration - New configuration
   * @param {string} [userId] - User ID making the change
   * @returns {Promise<Object>} Updated configuration
   * @throws {AppError} If update fails
   */
  async updateServiceConfiguration(serviceName, configuration, userId = 'system') {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      const oldConfiguration = { ...serviceDescriptor.configuration };

      // Update configuration
      serviceDescriptor.configuration = {
        ...serviceDescriptor.configuration,
        ...configuration,
        lastModified: new Date(),
        modifiedBy: userId
      };

      this.#serviceRegistry.set(serviceName, serviceDescriptor);

      // Apply configuration to service instance if supported
      if (typeof serviceDescriptor.instance.updateConfiguration === 'function') {
        await serviceDescriptor.instance.updateConfiguration(serviceDescriptor.configuration);
      }

      logger.info('Service configuration updated', {
        serviceName,
        userId,
        changedKeys: Object.keys(configuration)
      });

      // Emit configuration changed event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.CONFIGURATION_CHANGED, {
        serviceName,
        oldConfiguration,
        newConfiguration: serviceDescriptor.configuration,
        userId,
        timestamp: new Date()
      });

      // Create audit log
      await this.#auditService.log({
        userId,
        action: 'service.configuration.update',
        resource: 'service_configuration',
        resourceId: serviceName,
        details: {
          changedKeys: Object.keys(configuration),
          previousConfig: oldConfiguration,
          newConfig: serviceDescriptor.configuration
        }
      });

      return serviceDescriptor.configuration;

    } catch (error) {
      logger.error('Failed to update service configuration', {
        serviceName,
        error: error.message
      });
      throw new AppError(`Configuration update failed: ${error.message}`, 500);
    }
  }

  /**
   * Shutdown the orchestrator and all managed services
   * @async
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.#stopping) {
      logger.warn('Orchestrator shutdown already in progress');
      return;
    }

    this.#stopping = true;
    const shutdownStartTime = performance.now();

    try {
      logger.info('Shutting down PlatformManagementServicesOrchestrator...');

      // Stop monitoring intervals
      this.#stopMonitoringIntervals();

      // Stop all services in reverse dependency order
      await this.#stopServicesInReverseOrder();

      // Cleanup resources
      await this.#cleanupResources();

      // Clear all internal state
      this.#clearInternalState();

      const shutdownTime = performance.now() - shutdownStartTime;

      logger.info('PlatformManagementServicesOrchestrator shutdown completed', {
        shutdownTime: `${shutdownTime.toFixed(2)}ms`
      });

      // Create audit log
      await this.#auditService.log({
        action: 'orchestrator.shutdown',
        resource: 'platform_management_orchestrator',
        details: {
          shutdownTime,
          servicesShutdown: this.#serviceRegistry.size
        }
      });

    } catch (error) {
      logger.error('Error during orchestrator shutdown', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.#stopping = false;
      this.#initialized = false;
    }
  }

  /**
   * Get orchestrator statistics and status
   * @returns {Object} Orchestrator statistics
   */
  getStatistics() {
    try {
      const uptime = this.#initialized ? Date.now() - this.#serviceRegistry.get('orchestrator')?.registrationTime?.getTime() || 0 : 0;

      const statistics = {
        orchestrator: {
          initialized: this.#initialized,
          uptime,
          servicesManaged: this.#serviceRegistry.size,
          healthMonitoring: !!this.#healthCheckInterval,
          metricsCollection: !!this.#metricsCollectionInterval,
          performanceMonitoring: !!this.#performanceMonitoringInterval
        },
        services: {
          total: this.#serviceRegistry.size,
          running: Array.from(this.#serviceStates.values()).filter(state => state === ServiceState.RUNNING).length,
          stopped: Array.from(this.#serviceStates.values()).filter(state => state === ServiceState.STOPPED).length,
          error: Array.from(this.#serviceStates.values()).filter(state => state === ServiceState.ERROR).length
        },
        performance: {
          totalRequests: Array.from(this.#serviceRegistry.values()).reduce((sum, desc) => sum + desc.metrics.requestCount, 0),
          totalErrors: Array.from(this.#serviceRegistry.values()).reduce((sum, desc) => sum + desc.metrics.errorCount, 0),
          averageResponseTime: this.#calculateAverageResponseTime(),
          circuitBreakersOpen: Array.from(this.#serviceCircuitBreakers.values()).filter(cb => cb.state === CircuitBreakerState.OPEN).length
        },
        events: {
          totalEvents: this.#eventHistory.length,
          recentErrors: this.#errorHistory.slice(-10),
          lastHealthCheck: this.#getLastHealthCheckTime()
        },
        features: this.#getEnabledFeatures()
      };

      return statistics;

    } catch (error) {
      logger.error('Failed to get orchestrator statistics', {
        error: error.message
      });
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Private helper methods

  /**
   * Initialize core configuration
   * @private
   */
  #initializeConfiguration() {
    this.#configuration.set('healthCheckInterval', PlatformManagementServicesOrchestrator.HEALTH_CHECK_INTERVAL);
    this.#configuration.set('metricsCollectionInterval', PlatformManagementServicesOrchestrator.METRICS_COLLECTION_INTERVAL);
    this.#configuration.set('performanceMonitoringInterval', PlatformManagementServicesOrchestrator.PERFORMANCE_MONITORING_INTERVAL);
    this.#configuration.set('circuitBreakerTimeout', PlatformManagementServicesOrchestrator.CIRCUIT_BREAKER_TIMEOUT);
    this.#configuration.set('maxErrorHistory', PlatformManagementServicesOrchestrator.MAX_ERROR_HISTORY);
    this.#configuration.set('maxEventHistory', PlatformManagementServicesOrchestrator.MAX_EVENT_HISTORY);
    this.#configuration.set('enablePerformanceMonitoring', true);
    this.#configuration.set('enableCircuitBreakers', true);
    this.#configuration.set('enableHealthChecks', true);
    this.#configuration.set('enableMetricsCollection', true);
    this.#configuration.set('enableAuditLogging', true);
  }

  /**
   * Setup event handlers
   * @private
   */
  #setupEventHandlers() {
    // Service health change handler
    this.on(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_HEALTH_CHANGED, (event) => {
      this.#handleServiceHealthChange(event);
    });

    // Service error handler
    this.on(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_ERROR, (event) => {
      this.#handleServiceError(event);
    });

    // Circuit breaker events
    this.on(PlatformManagementServicesOrchestrator.EVENTS.CIRCUIT_BREAKER_OPENED, (event) => {
      this.#handleCircuitBreakerOpened(event);
    });

    // Performance alert handler
    this.on(PlatformManagementServicesOrchestrator.EVENTS.PERFORMANCE_ALERT, (event) => {
      this.#handlePerformanceAlert(event);
    });
  }

  /**
   * Initialize infrastructure services
   * @private
   * @async
   */
  async #initializeInfrastructure() {
    try {
      // Initialize cache service
      if (typeof this.#cacheService.initialize === 'function') {
        await this.#cacheService.initialize();
      }

      // Initialize notification service
      if (typeof this.#notificationService.initialize === 'function') {
        await this.#notificationService.initialize();
      }

      // Initialize audit service
      if (typeof this.#auditService.initialize === 'function') {
        await this.#auditService.initialize();
      }

      logger.info('Infrastructure services initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize infrastructure services', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Register all platform management services
   * @private
   * @async
   */
  async #registerServices() {
    try {
      // Register Configuration Service
      await this.registerService(
        PlatformManagementServicesOrchestrator.SERVICE_NAMES.CONFIGURATION,
        ConfigurationService,
        {
          priority: ServicePriority.HIGH,
          dependencies: [],
          capabilities: ['configuration', 'validation', 'encryption'],
          version: '1.0.0',
          description: 'Configuration management service'
        }
      );

      // Register System Service
      await this.registerService(
        PlatformManagementServicesOrchestrator.SERVICE_NAMES.SYSTEM,
        SystemService,
        {
          priority: ServicePriority.CRITICAL,
          dependencies: [],
          capabilities: ['monitoring', 'health', 'metrics'],
          version: '1.0.0',
          description: 'System health and monitoring service'
        }
      );

      // Register Platform Service
      await this.registerService(
        PlatformManagementServicesOrchestrator.SERVICE_NAMES.PLATFORM,
        PlatformService,
        {
          priority: ServicePriority.HIGH,
          dependencies: [PlatformManagementServicesOrchestrator.SERVICE_NAMES.CONFIGURATION],
          capabilities: ['platform', 'features', 'deployments'],
          version: '1.0.0',
          description: 'Platform management service'
        }
      );

      // Register Maintenance Service
      await this.registerService(
        PlatformManagementServicesOrchestrator.SERVICE_NAMES.MAINTENANCE,
        MaintenanceService,
        {
          priority: ServicePriority.NORMAL,
          dependencies: [
            PlatformManagementServicesOrchestrator.SERVICE_NAMES.PLATFORM,
            PlatformManagementServicesOrchestrator.SERVICE_NAMES.SYSTEM
          ],
          capabilities: ['maintenance', 'scheduling', 'notifications'],
          version: '1.0.0',
          description: 'Maintenance operations and scheduling service'
        }
      );

      logger.info('All platform management services registered successfully', {
        servicesCount: this.#serviceRegistry.size
      });

    } catch (error) {
      logger.error('Failed to register platform management services', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize service dependencies
   * @private
   * @async
   */
  async #initializeServiceDependencies() {
    try {
      for (const [serviceName, dependencies] of this.#serviceDependencies) {
        for (const dependency of dependencies) {
          if (!this.#serviceRegistry.has(dependency)) {
            throw new AppError(`Dependency '${dependency}' not found for service '${serviceName}'`, 500);
          }
        }
      }

      logger.info('Service dependencies validated successfully');

    } catch (error) {
      logger.error('Failed to initialize service dependencies', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Setup circuit breakers for all services
   * @private
   * @async
   */
  async #setupCircuitBreakers() {
    try {
      if (!this.#configuration.get('enableCircuitBreakers')) {
        logger.info('Circuit breakers disabled');
        return;
      }

      for (const [serviceName, descriptor] of this.#serviceRegistry) {
        await this.#setupServiceCircuitBreaker(serviceName, descriptor);
      }

      logger.info('Circuit breakers setup completed');

    } catch (error) {
      logger.error('Failed to setup circuit breakers', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Setup circuit breaker for a specific service
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {Object} descriptor - Service descriptor
   */
  async #setupServiceCircuitBreaker(serviceName, descriptor) {
    const circuitBreaker = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      timeout: descriptor.circuitBreaker.timeout,
      failureThreshold: 5,
      successThreshold: 3
    };

    this.#serviceCircuitBreakers.set(serviceName, circuitBreaker);
  }

  /**
   * Initialize health monitoring
   * @private
   * @async
   */
  async #initializeHealthMonitoring() {
    try {
      if (!this.#configuration.get('enableHealthChecks')) {
        logger.info('Health monitoring disabled');
        return;
      }

      const interval = this.#configuration.get('healthCheckInterval');
      this.#healthCheckInterval = setInterval(async () => {
        await this.#performHealthChecks();
      }, interval);

      logger.info('Health monitoring initialized', {
        interval: `${interval}ms`
      });

    } catch (error) {
      logger.error('Failed to initialize health monitoring', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize metrics collection
   * @private
   * @async
   */
  async #initializeMetricsCollection() {
    try {
      if (!this.#configuration.get('enableMetricsCollection')) {
        logger.info('Metrics collection disabled');
        return;
      }

      const interval = this.#configuration.get('metricsCollectionInterval');
      this.#metricsCollectionInterval = setInterval(async () => {
        await this.#collectMetrics();
      }, interval);

      logger.info('Metrics collection initialized', {
        interval: `${interval}ms`
      });

    } catch (error) {
      logger.error('Failed to initialize metrics collection', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize performance monitoring
   * @private
   * @async
   */
  async #initializePerformanceMonitoring() {
    try {
      if (!this.#configuration.get('enablePerformanceMonitoring')) {
        logger.info('Performance monitoring disabled');
        return;
      }

      const interval = this.#configuration.get('performanceMonitoringInterval');
      this.#performanceMonitoringInterval = setInterval(async () => {
        await this.#monitorPerformance();
      }, interval);

      logger.info('Performance monitoring initialized', {
        interval: `${interval}ms`
      });

    } catch (error) {
      logger.error('Failed to initialize performance monitoring', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate service instance before registration
   * @private
   * @param {string} serviceName - Service name
   * @param {Object} serviceInstance - Service instance to validate
   * @throws {AppError} If validation fails
   */
  #validateServiceInstance(serviceName, serviceInstance) {
    if (!serviceInstance) {
      throw new AppError(`Service instance cannot be null for '${serviceName}'`, 400);
    }

    if (typeof serviceInstance !== 'object') {
      throw new AppError(`Service instance must be an object for '${serviceName}'`, 400);
    }

    // Check for required methods (at least one initialization method)
    const hasInitMethod = typeof serviceInstance.initialize === 'function' ||
                         typeof serviceInstance.start === 'function';

    if (!hasInitMethod) {
      logger.warn(`Service '${serviceName}' does not have initialize or start method`, {
        availableMethods: Object.getOwnPropertyNames(serviceInstance).filter(prop => 
          typeof serviceInstance[prop] === 'function'
        )
      });
    }

    logger.debug('Service instance validated', {
      serviceName,
      hasInitialize: typeof serviceInstance.initialize === 'function',
      hasStart: typeof serviceInstance.start === 'function',
      hasStop: typeof serviceInstance.stop === 'function',
      hasShutdown: typeof serviceInstance.shutdown === 'function'
    });
  }

  /**
   * Initialize health check for a specific service
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {Object} serviceDescriptor - Service descriptor
   */
  async #initializeServiceHealthCheck(serviceName, serviceDescriptor) {
    try {
      const healthCheck = {
        serviceName,
        status: ServiceHealthStatus.UNKNOWN,
        lastCheck: null,
        lastHealthy: null,
        consecutiveFailures: 0,
        responseTime: null,
        details: {},
        history: []
      };

      this.#serviceHealthChecks.set(serviceName, healthCheck);

      // Perform initial health check if service supports it
      if (typeof serviceDescriptor.instance.healthCheck === 'function') {
        await this.#performServiceHealthCheck(serviceName);
      }

      logger.debug('Service health check initialized', { serviceName });

    } catch (error) {
      logger.error('Failed to initialize service health check', {
        serviceName,
        error: error.message
      });
    }
  }

  /**
   * Update service state
   * @private
   * @param {string} serviceName - Service name
   * @param {ServiceState} newState - New service state
   */
  #updateServiceState(serviceName, newState) {
    const oldState = this.#serviceStates.get(serviceName);
    this.#serviceStates.set(serviceName, newState);

    const serviceDescriptor = this.#serviceRegistry.get(serviceName);
    if (serviceDescriptor) {
      serviceDescriptor.state = newState;
      this.#serviceRegistry.set(serviceName, serviceDescriptor);
    }

    logger.debug('Service state updated', {
      serviceName,
      oldState,
      newState,
      timestamp: new Date()
    });

    // Add to event history
    this.#addToEventHistory({
      type: 'state_change',
      serviceName,
      oldState,
      newState,
      timestamp: new Date()
    });
  }

  /**
   * Update service health status
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {ServiceHealthStatus} newHealth - New health status
   * @param {Object} [details={}] - Additional health details
   */
  async #updateServiceHealth(serviceName, newHealth, details = {}) {
    try {
      const healthCheck = this.#serviceHealthChecks.get(serviceName);
      if (!healthCheck) {
        logger.warn(`No health check found for service '${serviceName}'`);
        return;
      }

      const oldHealth = healthCheck.status;
      healthCheck.status = newHealth;
      healthCheck.lastCheck = new Date();
      healthCheck.details = { ...healthCheck.details, ...details };

      if (newHealth === ServiceHealthStatus.HEALTHY) {
        healthCheck.lastHealthy = new Date();
        healthCheck.consecutiveFailures = 0;
      } else if (newHealth === ServiceHealthStatus.UNHEALTHY || newHealth === ServiceHealthStatus.FAILED) {
        healthCheck.consecutiveFailures++;
      }

      // Update service descriptor
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (serviceDescriptor) {
        serviceDescriptor.health = newHealth;
        this.#serviceRegistry.set(serviceName, serviceDescriptor);
      }

      // Add to health history
      healthCheck.history.push({
        status: newHealth,
        timestamp: new Date(),
        details
      });

      // Keep only last 100 health check entries
      if (healthCheck.history.length > 100) {
        healthCheck.history = healthCheck.history.slice(-100);
      }

      this.#serviceHealthChecks.set(serviceName, healthCheck);

      // Emit health change event if status changed
      if (oldHealth !== newHealth) {
        this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_HEALTH_CHANGED, {
          serviceName,
          oldHealth,
          newHealth,
          details,
          timestamp: new Date()
        });
      }

      logger.debug('Service health updated', {
        serviceName,
        oldHealth,
        newHealth,
        consecutiveFailures: healthCheck.consecutiveFailures
      });

    } catch (error) {
      logger.error('Failed to update service health', {
        serviceName,
        newHealth,
        error: error.message
      });
    }
  }

  /**
   * Record service metric
   * @private
   * @param {string} serviceName - Service name
   * @param {string} metricName - Metric name
   * @param {*} value - Metric value
   * @param {Object} [metadata={}] - Additional metadata
   */
  #recordServiceMetric(serviceName, metricName, value, metadata = {}) {
    try {
      const serviceMetrics = this.#serviceMetrics.get(serviceName);
      if (!serviceMetrics) {
        logger.warn(`No metrics container found for service '${serviceName}'`);
        return;
      }

      const timestamp = new Date();
      const metricEntry = {
        name: metricName,
        value,
        timestamp,
        metadata
      };

      // Add to performance metrics
      if (!serviceMetrics.performance.has(metricName)) {
        serviceMetrics.performance.set(metricName, []);
      }

      const metricHistory = serviceMetrics.performance.get(metricName);
        metricHistory.push(metricEntry);

      // Keep only last 1000 entries per metric
      if (metricHistory.length > 1000) {
        serviceMetrics.performance.set(metricName, metricHistory.slice(-1000));
      }

      // Update service descriptor metrics
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (serviceDescriptor) {
        switch (metricName) {
          case 'responseTime':
            serviceDescriptor.metrics.responseTime.push(value);
            if (serviceDescriptor.metrics.responseTime.length > 100) {
              serviceDescriptor.metrics.responseTime = serviceDescriptor.metrics.responseTime.slice(-100);
            }
            break;
          case 'requestCount':
            serviceDescriptor.metrics.requestCount++;
            break;
          case 'errorCount':
            serviceDescriptor.metrics.errorCount++;
            break;
        }

        this.#serviceRegistry.set(serviceName, serviceDescriptor);
      }

      this.#serviceMetrics.set(serviceName, serviceMetrics);

      logger.debug('Service metric recorded', {
        serviceName,
        metricName,
        value,
        timestamp
      });

    } catch (error) {
      logger.error('Failed to record service metric', {
        serviceName,
        metricName,
        error: error.message
      });
    }
  }

  /**
   * Check service dependencies
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {boolean} [throwOnFailure=true] - Whether to throw on dependency failure
   * @returns {Promise<Object>} Dependency check results
   */
  async #checkServiceDependencies(serviceName, throwOnFailure = true) {
    try {
      const dependencies = this.#serviceDependencies.get(serviceName) || [];
      const results = {
        serviceName,
        dependenciesChecked: dependencies.length,
        dependenciesHealthy: 0,
        dependenciesFailed: 0,
        details: {}
      };

      for (const dependency of dependencies) {
        const dependencyDescriptor = this.#serviceRegistry.get(dependency);
        const dependencyHealth = this.#serviceHealthChecks.get(dependency);

        if (!dependencyDescriptor) {
          results.dependenciesFailed++;
          results.details[dependency] = {
            status: 'not_registered',
            error: 'Dependency not registered'
          };

          if (throwOnFailure) {
            throw new AppError(`Dependency '${dependency}' not registered for service '${serviceName}'`, 500);
          }
          continue;
        }

        if (dependencyDescriptor.state !== ServiceState.RUNNING) {
          results.dependenciesFailed++;
          results.details[dependency] = {
            status: 'not_running',
            state: dependencyDescriptor.state
          };

          if (throwOnFailure) {
            throw new AppError(`Dependency '${dependency}' not running for service '${serviceName}'`, 503);
          }
          continue;
        }

        if (dependencyHealth && dependencyHealth.status === ServiceHealthStatus.UNHEALTHY) {
          results.dependenciesFailed++;
          results.details[dependency] = {
            status: 'unhealthy',
            health: dependencyHealth.status
          };

          if (throwOnFailure) {
            throw new AppError(`Dependency '${dependency}' unhealthy for service '${serviceName}'`, 503);
          }
          continue;
        }

        results.dependenciesHealthy++;
        results.details[dependency] = {
          status: 'healthy',
          state: dependencyDescriptor.state,
          health: dependencyHealth?.status || ServiceHealthStatus.UNKNOWN
        };
      }

      logger.debug('Service dependencies checked', {
        serviceName,
        dependenciesChecked: results.dependenciesChecked,
        dependenciesHealthy: results.dependenciesHealthy,
        dependenciesFailed: results.dependenciesFailed
      });

      return results;

    } catch (error) {
      logger.error('Failed to check service dependencies', {
        serviceName,
        error: error.message
      });

      if (throwOnFailure) {
        throw error;
      }

      return {
        serviceName,
        error: error.message,
        dependenciesChecked: 0,
        dependenciesHealthy: 0,
        dependenciesFailed: 0,
        details: {}
      };
    }
  }

  /**
   * Get individual service health
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Service health data
   */
  async #getIndividualServiceHealth(serviceName) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      const healthCheck = this.#serviceHealthChecks.get(serviceName);

      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      // Perform real-time health check if supported
      let currentHealth = healthCheck?.status || ServiceHealthStatus.UNKNOWN;
      let healthDetails = healthCheck?.details || {};

      if (typeof serviceDescriptor.instance.healthCheck === 'function') {
        try {
          const healthResult = await serviceDescriptor.instance.healthCheck();
          currentHealth = healthResult.status || ServiceHealthStatus.HEALTHY;
          healthDetails = { ...healthDetails, ...healthResult.details };
        } catch (healthError) {
          currentHealth = ServiceHealthStatus.UNHEALTHY;
          healthDetails.error = healthError.message;
        }
      }

      return {
        serviceName,
        status: currentHealth,
        state: serviceDescriptor.state,
        details: healthDetails,
        lastCheck: healthCheck?.lastCheck,
        lastHealthy: healthCheck?.lastHealthy,
        consecutiveFailures: healthCheck?.consecutiveFailures || 0,
        uptime: serviceDescriptor.registrationTime ? 
          Date.now() - serviceDescriptor.registrationTime.getTime() : 0,
        metrics: {
          requestCount: serviceDescriptor.metrics.requestCount,
          errorCount: serviceDescriptor.metrics.errorCount,
          availability: serviceDescriptor.metrics.availability
        }
      };

    } catch (error) {
      logger.error('Failed to get individual service health', {
        serviceName,
        error: error.message
      });

      return {
        serviceName,
        status: ServiceHealthStatus.UNKNOWN,
        error: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Get individual service metrics
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {Object} [options={}] - Metrics options
   * @returns {Promise<Object>} Service metrics data
   */
  async #getIndividualServiceMetrics(serviceName, options = {}) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      const serviceMetrics = this.#serviceMetrics.get(serviceName);

      if (!serviceDescriptor) {
        throw new AppError(`Service '${serviceName}' not registered`, 404);
      }

      const {
        timeRange = '1h',
        includeHistorical = false,
        includePerformance = true,
        includeErrors = true
      } = options;

      // Calculate average response time
      const responseTimes = serviceDescriptor.metrics.responseTime || [];
      const averageResponseTime = responseTimes.length > 0 ?
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;

      // Calculate throughput (requests per second)
      const uptime = serviceDescriptor.registrationTime ?
        (Date.now() - serviceDescriptor.registrationTime.getTime()) / 1000 : 1;
      const throughput = serviceDescriptor.metrics.requestCount / Math.max(uptime, 1);

      const metrics = {
        serviceName,
        requestCount: serviceDescriptor.metrics.requestCount,
        errorCount: serviceDescriptor.metrics.errorCount,
        errorRate: serviceDescriptor.metrics.requestCount > 0 ?
          (serviceDescriptor.metrics.errorCount / serviceDescriptor.metrics.requestCount) * 100 : 0,
        averageResponseTime,
        throughput,
        availability: serviceDescriptor.metrics.availability,
        uptime
      };

      if (includePerformance && serviceMetrics) {
        metrics.performance = this.#formatPerformanceMetrics(serviceMetrics.performance, timeRange);
      }

      if (includeErrors && serviceMetrics) {
        metrics.errors = this.#formatErrorMetrics(serviceMetrics.errors, timeRange);
      }

      if (includeHistorical && serviceMetrics) {
        metrics.historical = this.#formatHistoricalMetrics(serviceMetrics, timeRange);
      }

      return metrics;

    } catch (error) {
      logger.error('Failed to get individual service metrics', {
        serviceName,
        error: error.message
      });

      return {
        serviceName,
        error: error.message,
        requestCount: 0,
        errorCount: 0,
        errorRate: 0,
        averageResponseTime: 0,
        throughput: 0,
        availability: 0,
        uptime: 0
      };
    }
  }

  /**
   * Create operation timeout promise
   * @private
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise} Timeout promise
   */
  #createOperationTimeout(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new AppError('Operation timeout', 408));
      }, timeout);
    });
  }

  /**
   * Record service operation result
   * @private
   * @param {string} serviceName - Service name
   * @param {string} operation - Operation name
   * @param {number} executionTime - Execution time in milliseconds
   * @param {boolean} success - Whether operation succeeded
   * @param {Error} [error] - Error if operation failed
   */
  #recordServiceOperation(serviceName, operation, executionTime, success, error = null) {
    try {
      // Record basic metrics
      this.#recordServiceMetric(serviceName, 'responseTime', executionTime);
      this.#recordServiceMetric(serviceName, 'requestCount', 1);

      if (!success) {
        this.#recordServiceMetric(serviceName, 'errorCount', 1);
      }

      // Record operation-specific metrics
      const serviceMetrics = this.#serviceMetrics.get(serviceName);
      if (serviceMetrics) {
        const operationKey = `operation:${operation}`;
        
        if (!serviceMetrics.customMetrics.has(operationKey)) {
          serviceMetrics.customMetrics.set(operationKey, {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalTime: 0,
            averageTime: 0,
            lastCall: null
          });
        }

        const operationMetrics = serviceMetrics.customMetrics.get(operationKey);
        operationMetrics.totalCalls++;
        operationMetrics.totalTime += executionTime;
        operationMetrics.averageTime = operationMetrics.totalTime / operationMetrics.totalCalls;
        operationMetrics.lastCall = new Date();

        if (success) {
          operationMetrics.successfulCalls++;
        } else {
          operationMetrics.failedCalls++;
          
          // Record error details
          if (error) {
            if (!serviceMetrics.errors.has('recent')) {
              serviceMetrics.errors.set('recent', []);
            }
            
            const recentErrors = serviceMetrics.errors.get('recent');
            recentErrors.push({
              operation,
              error: error.message,
              timestamp: new Date(),
              executionTime
            });

            // Keep only last 50 errors
            if (recentErrors.length > 50) {
              serviceMetrics.errors.set('recent', recentErrors.slice(-50));
            }
          }
        }

        serviceMetrics.customMetrics.set(operationKey, operationMetrics);
        this.#serviceMetrics.set(serviceName, serviceMetrics);
      }

      logger.debug('Service operation recorded', {
        serviceName,
        operation,
        executionTime: `${executionTime.toFixed(2)}ms`,
        success
      });

    } catch (recordError) {
      logger.error('Failed to record service operation', {
        serviceName,
        operation,
        error: recordError.message
      });
    }
  }

  /**
   * Setup security policies for all services
   * @private
   * @async
   */
  async #setupSecurityPolicies() {
    try {
      // Default security policies
      const defaultPolicies = {
        authentication: {
          required: true,
          methods: ['jwt', 'session']
        },
        authorization: {
          enabled: true,
          roleBasedAccess: true
        },
        rateLimit: {
          enabled: true,
          requests: 1000,
          window: 60000 // 1 minute
        },
        audit: {
          enabled: true,
          logAllOperations: true
        }
      };

      for (const [serviceName] of this.#serviceRegistry) {
        this.#securityPolicies.set(serviceName, { ...defaultPolicies });
      }

      logger.info('Security policies setup completed');

    } catch (error) {
      logger.error('Failed to setup security policies', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start services in dependency order
   * @private
   * @async
   */
  async #startServicesInOrder() {
    try {
      const serviceNames = Array.from(this.#serviceRegistry.keys());
      const startOrder = this.#calculateServiceStartOrder(serviceNames);

      for (const serviceName of startOrder) {
        try {
          await this.startService(serviceName);
          
          // Wait a moment between service starts
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          logger.error(`Failed to start service '${serviceName}' during initialization`, {
            error: error.message
          });
          
          // Continue with other services
          continue;
        }
      }

      logger.info('Services started in dependency order', {
        startOrder,
        successfulStarts: Array.from(this.#serviceStates.values())
          .filter(state => state === ServiceState.RUNNING).length
      });

    } catch (error) {
      logger.error('Failed to start services in order', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Setup resource pools for efficient resource management
   * @private
   * @async
   */
  async #setupResourcePools() {
    try {
      // Database connection pool
      this.#resourcePools.set('database', {
        type: 'database',
        maxSize: 20,
        currentSize: 0,
        available: [],
        inUse: new Set()
      });

      // HTTP connection pool
      this.#resourcePools.set('http', {
        type: 'http',
        maxSize: 100,
        currentSize: 0,
        available: [],
        inUse: new Set()
      });

      // Cache connection pool
      this.#resourcePools.set('cache', {
        type: 'cache',
        maxSize: 10,
        currentSize: 0,
        available: [],
        inUse: new Set()
      });

      logger.info('Resource pools setup completed');

    } catch (error) {
      logger.error('Failed to setup resource pools', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize rate limiters for each service
   * @private
   * @async
   */
  async #initializeRateLimiters() {
    try {
      for (const [serviceName] of this.#serviceRegistry) {
        this.#rateLimiters.set(serviceName, {
          requests: new Map(),
          limits: {
            perSecond: 100,
            perMinute: 1000,
            perHour: 10000
          },
          windowStart: Date.now()
        });
      }

      logger.info('Rate limiters initialized for all services');

    } catch (error) {
      logger.error('Failed to initialize rate limiters', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate service initialization
   * @private
   * @async
   */
  async #validateServiceInitialization() {
    try {
      const validationResults = {
        totalServices: this.#serviceRegistry.size,
        runningServices: 0,
        failedServices: 0,
        details: {}
      };

      for (const [serviceName, descriptor] of this.#serviceRegistry) {
        const isRunning = descriptor.state === ServiceState.RUNNING;
        const isHealthy = descriptor.health === ServiceHealthStatus.HEALTHY;

        validationResults.details[serviceName] = {
          state: descriptor.state,
          health: descriptor.health,
          validated: isRunning && (isHealthy || descriptor.health === ServiceHealthStatus.UNKNOWN)
        };

        if (validationResults.details[serviceName].validated) {
          validationResults.runningServices++;
        } else {
          validationResults.failedServices++;
        }
      }

      if (validationResults.failedServices > 0) {
        logger.warn('Service initialization validation completed with failures', validationResults);
      } else {
        logger.info('Service initialization validation successful', validationResults);
      }

      return validationResults;

    } catch (error) {
      logger.error('Failed to validate service initialization', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cleanup partial initialization on failure
   * @private
   * @async
   */
  async #cleanupPartialInitialization() {
    try {
      logger.info('Cleaning up partial initialization...');

      // Stop any running monitoring intervals
      this.#stopMonitoringIntervals();

      // Stop any started services
      for (const [serviceName, descriptor] of this.#serviceRegistry) {
        if (descriptor.state === ServiceState.RUNNING || descriptor.state === ServiceState.STARTING) {
          try {
            await this.stopService(serviceName);
          } catch (stopError) {
            logger.error(`Failed to stop service '${serviceName}' during cleanup`, {
              error: stopError.message
            });
          }
        }
      }

      // Clear partial state
      this.#serviceStates.clear();
      this.#serviceHealthChecks.clear();
      this.#serviceCircuitBreakers.clear();

      logger.info('Partial initialization cleanup completed');

    } catch (error) {
      logger.error('Failed to cleanup partial initialization', {
        error: error.message
      });
    }
  }

  /**
   * Get enabled features list
   * @private
   * @returns {Array<string>} List of enabled features
   */
  #getEnabledFeatures() {
    const features = [];

    if (this.#configuration.get('enableHealthChecks')) {
      features.push('health_monitoring');
    }

    if (this.#configuration.get('enableMetricsCollection')) {
      features.push('metrics_collection');
    }

    if (this.#configuration.get('enablePerformanceMonitoring')) {
      features.push('performance_monitoring');
    }

    if (this.#configuration.get('enableCircuitBreakers')) {
      features.push('circuit_breakers');
    }

    if (this.#configuration.get('enableAuditLogging')) {
      features.push('audit_logging');
    }

    features.push('service_discovery');
    features.push('dependency_management');
    features.push('event_driven_architecture');
    features.push('resource_pooling');
    features.push('rate_limiting');
    features.push('security_policies');

    return features;
  }

  /**
   * Stop all monitoring intervals
   * @private
   */
  #stopMonitoringIntervals() {
    if (this.#healthCheckInterval) {
      clearInterval(this.#healthCheckInterval);
      this.#healthCheckInterval = null;
    }

    if (this.#metricsCollectionInterval) {
      clearInterval(this.#metricsCollectionInterval);
      this.#metricsCollectionInterval = null;
    }

    if (this.#performanceMonitoringInterval) {
      clearInterval(this.#performanceMonitoringInterval);
      this.#performanceMonitoringInterval = null;
    }

    logger.debug('Monitoring intervals stopped');
  }

  /**
   * Stop services in reverse dependency order
   * @private
   * @async
   */
  async #stopServicesInReverseOrder() {
    try {
      const serviceNames = Array.from(this.#serviceRegistry.keys());
      const stopOrder = this.#calculateServiceStartOrder(serviceNames).reverse();

      for (const serviceName of stopOrder) {
        try {
          const descriptor = this.#serviceRegistry.get(serviceName);
          if (descriptor && descriptor.state === ServiceState.RUNNING) {
            await this.stopService(serviceName);
          }
        } catch (error) {
          logger.error(`Failed to stop service '${serviceName}' during shutdown`, {
            error: error.message
          });
        }
      }

      logger.info('Services stopped in reverse dependency order');

    } catch (error) {
      logger.error('Failed to stop services in reverse order', {
        error: error.message
      });
    }
  }

  /**
   * Cleanup all resources
   * @private
   * @async
   */
  async #cleanupResources() {
    try {
      // Close resource pools
      for (const [poolName, pool] of this.#resourcePools) {
        try {
          // Close any active connections in the pool
          if (pool.available) {
            for (const resource of pool.available) {
              if (typeof resource.close === 'function') {
                await resource.close();
              }
            }
          }
        } catch (poolError) {
          logger.error(`Failed to cleanup resource pool '${poolName}'`, {
            error: poolError.message
          });
        }
      }

      // Clear caches
      if (typeof this.#cacheService.clear === 'function') {
        await this.#cacheService.clear();
      }

      logger.info('Resource cleanup completed');

    } catch (error) {
      logger.error('Failed to cleanup resources', {
        error: error.message
      });
    }
  }

  /**
   * Clear all internal state
   * @private
   */
  #clearInternalState() {
    this.#serviceRegistry.clear();
    this.#serviceMetrics.clear();
    this.#serviceHealthChecks.clear();
    this.#serviceDependencies.clear();
    this.#serviceCircuitBreakers.clear();
    this.#serviceLoadBalancers.clear();
    this.#serviceStates.clear();
    this.#performanceMetrics.clear();
    this.#eventHistory.length = 0;
    this.#errorHistory.length = 0;
    this.#rateLimiters.clear();
    this.#requestQueues.clear();
    this.#resourcePools.clear();
    this.#securityPolicies.clear();

    logger.debug('Internal state cleared');
  }

  /**
   * Calculate average response time across all services
   * @private
   * @returns {number} Average response time in milliseconds
   */
  #calculateAverageResponseTime() {
    try {
      let totalResponseTime = 0;
      let totalRequests = 0;

      for (const [, descriptor] of this.#serviceRegistry) {
        const responseTimes = descriptor.metrics.responseTime || [];
        if (responseTimes.length > 0) {
          const serviceTotal = responseTimes.reduce((sum, time) => sum + time, 0);
          totalResponseTime += serviceTotal;
          totalRequests += responseTimes.length;
        }
      }

      return totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    } catch (error) {
      logger.error('Failed to calculate average response time', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get last health check time
   * @private
   * @returns {Date|null} Last health check time
   */
  #getLastHealthCheckTime() {
    try {
      let lastCheck = null;

      for (const [, healthCheck] of this.#serviceHealthChecks) {
        if (healthCheck.lastCheck && (!lastCheck || healthCheck.lastCheck > lastCheck)) {
          lastCheck = healthCheck.lastCheck;
        }
      }

      return lastCheck;

    } catch (error) {
      logger.error('Failed to get last health check time', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Handle service health change events
   * @private
   * @param {Object} event - Health change event
   */
  #handleServiceHealthChange(event) {
    try {
      const { serviceName, oldHealth, newHealth, details } = event;

      // Log health change
      logger.info('Service health changed', {
        serviceName,
        oldHealth,
        newHealth,
        details
      });

      // Send notifications for critical health changes
      if (newHealth === ServiceHealthStatus.UNHEALTHY || newHealth === ServiceHealthStatus.FAILED) {
        this.#notificationService.sendAlert({
          type: 'service_health_degraded',
          serviceName,
          oldHealth,
          newHealth,
          details,
          timestamp: new Date()
        });
      }

      // Add to event history
      this.#addToEventHistory({
        type: 'health_change',
        serviceName,
        oldHealth,
        newHealth,
        details,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to handle service health change', {
        error: error.message
      });
    }
  }

  /**
   * Handle service error events
   * @private
   * @param {Object} event - Service error event
   */
  #handleServiceError(event) {
    try {
      const { serviceName, error, operation, timestamp } = event;

      // Log service error
      logger.error('Service error occurred', {
        serviceName,
        error: error.message,
        operation,
        timestamp
      });

      // Add to error history
      this.#addToErrorHistory({
        serviceName,
        error: error.message,
        operation,
        timestamp
      });

      // Emit service error event
      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_ERROR, event);

    } catch (handlingError) {
      logger.error('Failed to handle service error event', {
        error: handlingError.message
      });
    }
  }

  /**
   * Handle circuit breaker opened events
   * @private
   * @param {Object} event - Circuit breaker event
   */
  #handleCircuitBreakerOpened(event) {
    try {
      const { serviceName, operation, failureCount } = event;

      logger.warn('Circuit breaker opened', {
        serviceName,
        operation,
        failureCount
      });

      // Send alert notification
      this.#notificationService.sendAlert({
        type: 'circuit_breaker_opened',
        serviceName,
        operation,
        failureCount,
        timestamp: new Date()
      });

      // Add to event history
      this.#addToEventHistory({
        type: 'circuit_breaker_opened',
        serviceName,
        operation,
        failureCount,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to handle circuit breaker opened event', {
        error: error.message
      });
    }
  }

  /**
   * Handle performance alert events
   * @private
   * @param {Object} event - Performance alert event
   */
  #handlePerformanceAlert(event) {
    try {
      const { serviceName, metric, threshold, currentValue } = event;

      logger.warn('Performance alert triggered', {
        serviceName,
        metric,
        threshold,
        currentValue
      });

      // Send performance alert
      this.#notificationService.sendAlert({
        type: 'performance_alert',
        serviceName,
        metric,
        threshold,
        currentValue,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to handle performance alert', {
        error: error.message
      });
    }
  }

  /**
   * Perform health checks for all services
   * @private
   * @async
   */
  async #performHealthChecks() {
    try {
      for (const [serviceName] of this.#serviceRegistry) {
        await this.#performServiceHealthCheck(serviceName);
      }

      this.emit(PlatformManagementServicesOrchestrator.EVENTS.SERVICE_HEALTH_CHANGED, {
        type: 'bulk_health_check',
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to perform health checks', {
        error: error.message
      });
    }
  }

  /**
   * Perform health check for a specific service
   * @private
   * @async
   * @param {string} serviceName - Service name
   */
  async #performServiceHealthCheck(serviceName) {
    try {
      const serviceDescriptor = this.#serviceRegistry.get(serviceName);
      if (!serviceDescriptor) {
        return;
      }

      const startTime = performance.now();
      let healthStatus = ServiceHealthStatus.UNKNOWN;
      let healthDetails = {};

      // Check if service has health check method
      if (typeof serviceDescriptor.instance.healthCheck === 'function') {
        try {
          const healthResult = await serviceDescriptor.instance.healthCheck();
          healthStatus = healthResult.status || ServiceHealthStatus.HEALTHY;
          healthDetails = healthResult.details || {};
        } catch (healthError) {
          healthStatus = ServiceHealthStatus.UNHEALTHY;
          healthDetails = {
            error: healthError.message,
            lastError: new Date()
          };
        }
      } else if (serviceDescriptor.state === ServiceState.RUNNING) {
        // If no health check method, assume healthy if running
        healthStatus = ServiceHealthStatus.HEALTHY;
      }

      const responseTime = performance.now() - startTime;

      // Update health check record
      const healthCheck = this.#serviceHealthChecks.get(serviceName);
      if (healthCheck) {
        healthCheck.responseTime = responseTime;
      }

      // Update service health
      await this.#updateServiceHealth(serviceName, healthStatus, healthDetails);

      // Record health check metric
      this.#recordServiceMetric(serviceName, 'healthCheckTime', responseTime);

    } catch (error) {
      logger.error('Failed to perform service health check', {
        serviceName,
        error: error.message
      });

      // Mark as unhealthy if health check fails
      await this.#updateServiceHealth(serviceName, ServiceHealthStatus.UNHEALTHY, {
        error: error.message,
        lastHealthCheckError: new Date()
      });
    }
  }

  /**
   * Collect metrics from all services
   * @private
   * @async
   */
  async #collectMetrics() {
    try {
      for (const [serviceName, descriptor] of this.#serviceRegistry) {
        await this.#collectServiceMetrics(serviceName, descriptor);
      }

      this.emit(PlatformManagementServicesOrchestrator.EVENTS.METRICS_COLLECTED, {
        servicesCount: this.#serviceRegistry.size,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to collect metrics', {
        error: error.message
      });
    }
  }

  /**
   * Collect metrics for a specific service
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {Object} serviceDescriptor - Service descriptor
   */
  async #collectServiceMetrics(serviceName, serviceDescriptor) {
    try {
      // Collect basic metrics
      const uptime = Date.now() - serviceDescriptor.registrationTime.getTime();
      this.#recordServiceMetric(serviceName, 'uptime', uptime);

      // Collect custom metrics if service supports it
      if (typeof serviceDescriptor.instance.getMetrics === 'function') {
        try {
          const customMetrics = await serviceDescriptor.instance.getMetrics();
          
          for (const [metricName, metricValue] of Object.entries(customMetrics)) {
            this.#recordServiceMetric(serviceName, metricName, metricValue);
          }
        } catch (metricsError) {
          logger.debug('Failed to collect custom metrics for service', {
            serviceName,
            error: metricsError.message
          });
        }
      }

      // Update availability calculation
      const healthCheck = this.#serviceHealthChecks.get(serviceName);
      if (healthCheck) {
        const healthyTime = healthCheck.lastHealthy ? 
          Date.now() - healthCheck.lastHealthy.getTime() : 0;
        const availability = Math.max(0, Math.min(100, (healthyTime / uptime) * 100));
        
        serviceDescriptor.metrics.availability = availability;
        this.#serviceRegistry.set(serviceName, serviceDescriptor);
      }

    } catch (error) {
      logger.error('Failed to collect service metrics', {
        serviceName,
        error: error.message
      });
    }
  }

  /**
   * Monitor performance across all services
   * @private
   * @async
   */
  async #monitorPerformance() {
    try {
      for (const [serviceName, descriptor] of this.#serviceRegistry) {
        await this.#monitorServicePerformance(serviceName, descriptor);
      }

    } catch (error) {
      logger.error('Failed to monitor performance', {
        error: error.message
      });
    }
  }

  /**
   * Monitor performance for a specific service
   * @private
   * @async
   * @param {string} serviceName - Service name
   * @param {Object} serviceDescriptor - Service descriptor
   */
  async #monitorServicePerformance(serviceName, serviceDescriptor) {
    try {
      const metrics = serviceDescriptor.metrics;
      
      // Check response time threshold
      if (metrics.responseTime.length > 0) {
        const avgResponseTime = metrics.responseTime.reduce((sum, time) => sum + time, 0) / metrics.responseTime.length;
        
        if (avgResponseTime > 5000) { // 5 seconds threshold
          this.emit(PlatformManagementServicesOrchestrator.EVENTS.PERFORMANCE_ALERT, {
            serviceName,
            metric: 'response_time',
            threshold: 5000,
            currentValue: avgResponseTime,
            timestamp: new Date()
          });
        }
      }

      // Check error rate threshold
      const errorRate = metrics.requestCount > 0 ? 
        (metrics.errorCount / metrics.requestCount) * 100 : 0;
      
      if (errorRate > 10) { // 10% error rate threshold
        this.emit(PlatformManagementServicesOrchestrator.EVENTS.PERFORMANCE_ALERT, {
          serviceName,
          metric: 'error_rate',
          threshold: 10,
          currentValue: errorRate,
          timestamp: new Date()
        });
      }

      // Check availability threshold
      if (metrics.availability < 95) { // 95% availability threshold
        this.emit(PlatformManagementServicesOrchestrator.EVENTS.PERFORMANCE_ALERT, {
          serviceName,
          metric: 'availability',
          threshold: 95,
          currentValue: metrics.availability,
          timestamp: new Date()
        });
      }

    } catch (error) {
      logger.error('Failed to monitor service performance', {
        serviceName,
        error: error.message
      });
    }
  }

  /**
   * Calculate service start order based on dependencies
   * @private
   * @param {Array<string>} serviceNames - List of service names
   * @returns {Array<string>} Ordered list of service names
   */
  #calculateServiceStartOrder(serviceNames) {
    try {
      const visited = new Set();
      const visiting = new Set();
      const result = [];

      const visit = (serviceName) => {
        if (visiting.has(serviceName)) {
          throw new AppError(`Circular dependency detected: ${serviceName}`, 500);
        }

        if (visited.has(serviceName)) {
          return;
        }

        visiting.add(serviceName);

        const dependencies = this.#serviceDependencies.get(serviceName) || [];
        for (const dependency of dependencies) {
          if (serviceNames.includes(dependency)) {
            visit(dependency);
          }
        }

        visiting.delete(serviceName);
        visited.add(serviceName);
        result.push(serviceName);
      };

      // Sort by priority first, then process dependencies
      const prioritizedServices = serviceNames
        .map(name => ({
          name,
          priority: this.#serviceRegistry.get(name)?.priority || ServicePriority.NORMAL
        }))
        .sort((a, b) => a.priority - b.priority)
        .map(item => item.name);

      for (const serviceName of prioritizedServices) {
        visit(serviceName);
      }

      return result;

    } catch (error) {
      logger.error('Failed to calculate service start order', {
        error: error.message
      });
      // Return original order as fallback
      return serviceNames;
    }
  }

  /**
   * Format performance metrics for response
   * @private
   * @param {Map} performanceMap - Performance metrics map
   * @param {string} timeRange - Time range filter
   * @returns {Object} Formatted performance metrics
   */
  #formatPerformanceMetrics(performanceMap, timeRange) {
    try {
      const cutoffTime = this.#getTimeRangeCutoff(timeRange);
      const formatted = {};

      for (const [metricName, metricHistory] of performanceMap) {
        const filteredHistory = metricHistory.filter(entry => 
          entry.timestamp >= cutoffTime
        );

        if (filteredHistory.length > 0) {
          const values = filteredHistory.map(entry => entry.value);
          formatted[metricName] = {
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((sum, val) => sum + val, 0) / values.length,
            latest: values[values.length - 1],
            trend: this.#calculateTrend(values)
          };
        }
      }

      return formatted;

    } catch (error) {
      logger.error('Failed to format performance metrics', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Format error metrics for response
   * @private
   * @param {Map} errorsMap - Error metrics map
   * @param {string} timeRange - Time range filter
   * @returns {Object} Formatted error metrics
   */
  #formatErrorMetrics(errorsMap, timeRange) {
    try {
      const cutoffTime = this.#getTimeRangeCutoff(timeRange);
      const formatted = {};

      for (const [errorType, errorHistory] of errorsMap) {
        const filteredErrors = errorHistory.filter(entry => 
          entry.timestamp >= cutoffTime
        );

        formatted[errorType] = {
          count: filteredErrors.length,
          recent: filteredErrors.slice(-10), // Last 10 errors
          frequency: filteredErrors.length / Math.max(1, (Date.now() - cutoffTime.getTime()) / (60 * 1000)) // per minute
        };
      }

      return formatted;

    } catch (error) {
      logger.error('Failed to format error metrics', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Format historical metrics for response
   * @private
   * @param {Object} serviceMetrics - Service metrics object
   * @param {string} timeRange - Time range filter
   * @returns {Object} Formatted historical metrics
   */
  #formatHistoricalMetrics(serviceMetrics, timeRange) {
    try {
      const cutoffTime = this.#getTimeRangeCutoff(timeRange);
      const historical = {
        performance: {},
        errors: {},
        events: []
      };

      // Format performance history
      for (const [metricName, metricHistory] of serviceMetrics.performance) {
        const filteredHistory = metricHistory.filter(entry => 
          entry.timestamp >= cutoffTime
        );
        historical.performance[metricName] = filteredHistory;
      }

      // Format error history
      for (const [errorType, errorHistory] of serviceMetrics.errors) {
        const filteredErrors = errorHistory.filter(entry => 
          entry.timestamp >= cutoffTime
        );
        historical.errors[errorType] = filteredErrors;
      }

      return historical;

    } catch (error) {
      logger.error('Failed to format historical metrics', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Get time range cutoff date
   * @private
   * @param {string} timeRange - Time range string
   * @returns {Date} Cutoff date
   */
  #getTimeRangeCutoff(timeRange) {
    const now = new Date();
    const ranges = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    const milliseconds = ranges[timeRange] || ranges['1h'];
    return new Date(now.getTime() - milliseconds);
  }

  /**
   * Calculate trend from values array
   * @private
   * @param {Array<number>} values - Array of numeric values
   * @returns {string} Trend direction
   */
  #calculateTrend(values) {
    if (values.length < 2) {
      return 'stable';
    }

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Add event to event history
   * @private
   * @param {Object} event - Event to add
   */
  #addToEventHistory(event) {
    this.#eventHistory.push(event);
    
    // Keep only last N events
    const maxEvents = this.#configuration.get('maxEventHistory');
    if (this.#eventHistory.length > maxEvents) {
      this.#eventHistory = this.#eventHistory.slice(-maxEvents);
    }
  }

  /**
   * Add error to error history
   * @private
   * @param {Object} error - Error to add
   */
  #addToErrorHistory(error) {
    this.#errorHistory.push(error);
    
    // Keep only last N errors
    const maxErrors = this.#configuration.get('maxErrorHistory');
    if (this.#errorHistory.length > maxErrors) {
      this.#errorHistory = this.#errorHistory.slice(-maxErrors);
    }
  }
}

// Create and export the singleton orchestrator instance
const orchestrator = new PlatformManagementServicesOrchestrator();

// Create Express router for external API access
const router = express.Router();

// Health endpoint
router.get('/health', async (req, res) => {
  try {
    const health = await orchestrator.getServiceHealth();
    res.json({
      success: true,
      data: health,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await orchestrator.getServiceMetrics();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Statistics endpoint
router.get('/statistics', (req, res) => {
  try {
    const statistics = orchestrator.getStatistics();
    res.json({
      success: true,
      data: statistics,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Export the orchestrator and router
module.exports = {
  orchestrator,
  router,
  PlatformManagementServicesOrchestrator,
  ServiceHealthStatus,
  ServiceState,
  ServicePriority,
  CircuitBreakerState,
  
  // Individual service exports for direct access
  ConfigurationService,
  MaintenanceService,
  PlatformService,
  SystemService,
  
  // Convenience methods
  initialize: () => orchestrator.initialize(),
  shutdown: () => orchestrator.shutdown(),
  getStatistics: () => orchestrator.getStatistics(),
  getServiceHealth: (serviceName) => orchestrator.getServiceHealth(serviceName),
  getServiceMetrics: (serviceName, options) => orchestrator.getServiceMetrics(serviceName, options)
};