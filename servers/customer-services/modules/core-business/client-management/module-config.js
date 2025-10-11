/**
 * @fileoverview Client Management Module Configuration
 * @module servers/customer-services/modules/core-business/client-management/module-config
 * @description Configuration and initialization for the client management module
 */

const logger = require('../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-management-config'
});

/**
 * Module metadata
 */
const MODULE_METADATA = {
    name: 'client-management',
    version: '1.0.0',
    description: 'Comprehensive client management module',
    author: 'Your Company',
    license: 'Proprietary',
    dependencies: {
        express: '^4.18.0',
        mongoose: '^7.0.0',
        bcryptjs: '^2.4.3',
        jsonwebtoken: '^9.0.0',
        validator: '^13.0.0',
        crypto: 'built-in'
    }
};

/**
 * Default module configuration
 */
const DEFAULT_CONFIG = {
    // General settings
    enabled: true,
    companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
    platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
    
    // Client settings
    clients: {
        autoGenerateCode: process.env.AUTO_GENERATE_CLIENT_CODE !== 'false',
        enableHealthScore: process.env.ENABLE_HEALTH_SCORE !== 'false',
        requireTierApproval: process.env.REQUIRE_TIER_APPROVAL === 'true',
        maxSubsidiaries: parseInt(process.env.MAX_SUBSIDIARIES, 10) || 50,
        defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD'
    },
    
    // Contact settings
    contacts: {
        autoGenerateId: process.env.AUTO_GENERATE_CONTACT_ID !== 'false',
        maxPerClient: parseInt(process.env.MAX_CONTACTS_PER_CLIENT, 10) || 100,
        requireEmailVerification: process.env.REQUIRE_CONTACT_EMAIL_VERIFICATION === 'true',
        trackEngagement: process.env.TRACK_CONTACT_ENGAGEMENT !== 'false'
    },
    
    // Document settings
    documents: {
        autoGenerateId: process.env.AUTO_GENERATE_DOCUMENT_ID !== 'false',
        storageBasePath: process.env.DOCUMENT_STORAGE_PATH || '/storage/documents',
        maxSize: parseInt(process.env.MAX_DOCUMENT_SIZE, 10) || 104857600, // 100MB
        enableVersionControl: process.env.ENABLE_VERSION_CONTROL !== 'false',
        maxVersionsToKeep: parseInt(process.env.MAX_VERSIONS_TO_KEEP, 10) || 10,
        requireApprovalForPublish: process.env.REQUIRE_DOCUMENT_APPROVAL === 'true',
        allowedFileTypes: (process.env.ALLOWED_DOCUMENT_TYPES || 'pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv').split(',')
    },
    
    // Note settings
    notes: {
        autoGenerateId: process.env.AUTO_GENERATE_NOTE_ID !== 'false',
        maxPerClient: parseInt(process.env.MAX_NOTES_PER_CLIENT, 10) || 10000,
        maxLength: parseInt(process.env.MAX_NOTE_LENGTH, 10) || 50000,
        enableVersioning: process.env.ENABLE_NOTE_VERSIONING === 'true',
        enableAutoTagging: process.env.ENABLE_AUTO_TAGGING === 'true',
        enableSentimentAnalysis: process.env.ENABLE_SENTIMENT_ANALYSIS === 'true'
    },
    
    // API settings
    api: {
        basePath: '/api/v1',
        versioning: true,
        documentation: true
    },
    
    // Security settings
    security: {
        requireAuthentication: true,
        requireAuthorization: true,
        enableRateLimiting: true,
        enableAuditLog: true
    },
    
    // Feature flags
    features: {
        bulkOperations: true,
        exportData: true,
        analytics: true,
        notifications: true,
        webhooks: false
    }
};

/**
 * Client Management Module Configuration Class
 */
class ClientManagementConfig {
    constructor(customConfig = {}) {
        this.config = this._mergeConfig(DEFAULT_CONFIG, customConfig);
        this.metadata = MODULE_METADATA;
        this.initialized = false;
    }

    /**
     * Merge custom configuration with defaults
     * @private
     */
    _mergeConfig(defaults, custom) {
        return {
            ...defaults,
            ...custom,
            clients: { ...defaults.clients, ...custom.clients },
            contacts: { ...defaults.contacts, ...custom.contacts },
            documents: { ...defaults.documents, ...custom.documents },
            notes: { ...defaults.notes, ...custom.notes },
            api: { ...defaults.api, ...custom.api },
            security: { ...defaults.security, ...custom.security },
            features: { ...defaults.features, ...custom.features }
        };
    }

    /**
     * Initialize the module
     * @returns {Promise<Object>} Initialization result
     */
    async initialize() {
        try {
            logger.info('Initializing Client Management Module', {
                version: this.metadata.version,
                config: this.config
            });

            // Validate configuration
            this._validateConfig();

            // Initialize services
            const services = await this._initializeServices();

            // Register routes
            const routes = this._getRoutes();

            // Setup event listeners
            this._setupEventListeners();

            this.initialized = true;

            logger.info('Client Management Module initialized successfully', {
                services: Object.keys(services),
                routes: routes.length
            });

            return {
                success: true,
                module: this.metadata.name,
                version: this.metadata.version,
                services,
                routes
            };

        } catch (error) {
            logger.error('Failed to initialize Client Management Module', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfig() {
        const errors = [];

        // Validate client settings
        if (this.config.clients.maxSubsidiaries < 1) {
            errors.push('clients.maxSubsidiaries must be at least 1');
        }

        // Validate contact settings
        if (this.config.contacts.maxPerClient < 1) {
            errors.push('contacts.maxPerClient must be at least 1');
        }

        // Validate document settings
        if (this.config.documents.maxSize < 1024) {
            errors.push('documents.maxSize must be at least 1KB');
        }

        if (this.config.documents.maxVersionsToKeep < 1) {
            errors.push('documents.maxVersionsToKeep must be at least 1');
        }

        // Validate note settings
        if (this.config.notes.maxLength < 1) {
            errors.push('notes.maxLength must be at least 1');
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }

        logger.info('Configuration validated successfully');
    }

    /**
     * Initialize services
     * @private
     */
    async _initializeServices() {
        const { initializeServices } = require('./services');
        return await initializeServices(this.config);
    }

    /**
     * Get routes
     * @private
     */
    _getRoutes() {
        const routes = require('./routes');
        return routes;
    }

    /**
     * Setup event listeners
     * @private
     */
    _setupEventListeners() {
        logger.info('Setting up event listeners');
        
        // Add event listeners here as needed
        // Example: Listen for client creation events, document uploads, etc.
    }

    /**
     * Get module configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get module metadata
     * @returns {Object} Module metadata
     */
    getMetadata() {
        return { ...this.metadata };
    }

    /**
     * Check if module is initialized
     * @returns {boolean} Initialization status
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Get module health status
     * @returns {Promise<Object>} Health status
     */
    async getHealthStatus() {
        try {
            const { checkServicesHealth } = require('./services');
            const servicesHealth = await checkServicesHealth();

            return {
                module: this.metadata.name,
                version: this.metadata.version,
                status: servicesHealth.status,
                initialized: this.initialized,
                services: servicesHealth.services,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to get health status', {
                error: error.message
            });

            return {
                module: this.metadata.name,
                version: this.metadata.version,
                status: 'error',
                initialized: this.initialized,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Shutdown the module
     * @returns {Promise<void>}
     */
    async shutdown() {
        try {
            logger.info('Shutting down Client Management Module');

            // Cleanup resources
            // Close connections, clear caches, etc.

            this.initialized = false;

            logger.info('Client Management Module shut down successfully');

        } catch (error) {
            logger.error('Failed to shutdown Client Management Module', {
                error: error.message
            });
            throw error;
        }
    }
}

/**
 * Create and export module configuration instance
 */
const moduleConfig = new ClientManagementConfig();

/**
 * Export configuration and utilities
 */
module.exports = {
    /**
     * Module configuration instance
     */
    moduleConfig,

    /**
     * Create new configuration instance
     * @param {Object} customConfig - Custom configuration
     * @returns {ClientManagementConfig} Configuration instance
     */
    createConfig: (customConfig) => new ClientManagementConfig(customConfig),

    /**
     * Get default configuration
     * @returns {Object} Default configuration
     */
    getDefaultConfig: () => ({ ...DEFAULT_CONFIG }),

    /**
     * Get module metadata
     * @returns {Object} Module metadata
     */
    getMetadata: () => ({ ...MODULE_METADATA }),

    /**
     * Initialize module with custom config
     * @param {Object} customConfig - Custom configuration
     * @returns {Promise<Object>} Initialization result
     */
    initializeModule: async (customConfig = {}) => {
        const config = new ClientManagementConfig(customConfig);
        return await config.initialize();
    }
};

/**
 * Auto-initialize if not in test environment
 */
if (process.env.NODE_ENV !== 'test' && process.env.AUTO_INIT_MODULES !== 'false') {
    moduleConfig.initialize().catch(error => {
        logger.error('Auto-initialization failed', { error: error.message });
    });
}