/**
 * Security Module - Comprehensive security services for enterprise applications
 * Provides encryption, key management, hashing, audit, compliance, and access control
 */

// Encryption Services
const EncryptionService = require('./encryption/encryption-service');
const KeyManager = require('./encryption/key-manager');
const HashService = require('./encryption/hash-service');
const CryptoUtils = require('./encryption/crypto-utils');

// Audit Services
const AuditService = require('./audit/audit-service');
const AuditLogger = require('./audit/audit-logger');
const AuditEvents = require('./audit/audit-events');
const ComplianceReporter = require('./audit/compliance-reporter');
const AuditTrail = require('./audit/audit-trail');

// Compliance Services
const GDPRCompliance = require('./compliance/gdpr-compliance');
const HIPAACompliance = require('./compliance/hipaa-compliance');
const SOXCompliance = require('./compliance/sox-compliance');
const DataRetention = require('./compliance/data-retention');
const PrivacyControls = require('./compliance/privacy-controls');

// Access Control Services
const RBACService = require('./access-control/rbac-service');
const PermissionService = require('./access-control/permission-service');
const RoleService = require('./access-control/role-service');
const PolicyEngine = require('./access-control/policy-engine');

/**
 * SecurityManager - Main security orchestrator
 */
class SecurityManager {
    constructor(config = {}) {
        this.config = {
            encryption: config.encryption || {},
            audit: config.audit || {},
            compliance: config.compliance || {},
            accessControl: config.accessControl || {},
            ...config
        };

        this.services = {};
        this.initialized = false;
    }

    /**
     * Initialize all security services
     */
    async initialize() {
        try {
            // Initialize encryption services
            this.services.encryption = new EncryptionService(this.config.encryption);
            await this.services.encryption.initialize();

            this.services.keyManager = new KeyManager(this.config.encryption.keyManager || {});
            await this.services.keyManager.initialize();

            this.services.hashService = new HashService(this.config.encryption.hash || {});

            this.services.cryptoUtils = new CryptoUtils();

            // Initialize audit services
            this.services.audit = new AuditService(this.config.audit);
            await this.services.audit.initialize();

            // Initialize compliance services
            this.services.gdprCompliance = new GDPRCompliance(this.config.compliance.gdpr || {});
            await this.services.gdprCompliance.initialize();

            this.services.hipaaCompliance = new HIPAACompliance(this.config.compliance.hipaa || {});
            await this.services.hipaaCompliance.initialize();

            this.services.soxCompliance = new SOXCompliance(this.config.compliance.sox || {});
            await this.services.soxCompliance.initialize();

            this.services.dataRetention = new DataRetention(this.config.compliance.retention || {});
            await this.services.dataRetention.initialize();

            this.services.privacyControls = new PrivacyControls(this.config.compliance.privacy || {});
            await this.services.privacyControls.initialize();

            // Initialize access control services
            this.services.rbac = new RBACService(this.config.accessControl.rbac || {});
            await this.services.rbac.initialize();

            this.services.permissions = new PermissionService(this.config.accessControl.permissions || {});
            await this.services.permissions.initialize();

            this.services.roles = new RoleService(this.config.accessControl.roles || {});
            await this.services.roles.initialize();

            this.services.policyEngine = new PolicyEngine(this.config.accessControl.policies || {});
            await this.services.policyEngine.initialize();

            this.initialized = true;

            // Log initialization
            await this.services.audit.logEvent({
                type: 'SYSTEM_EVENT',
                action: 'SECURITY_INITIALIZED',
                outcome: 'SUCCESS',
                details: {
                    services: Object.keys(this.services)
                }
            });

            return this;

        } catch (error) {
            throw new Error(`Security initialization failed: ${error.message}`);
        }
    }

    /**
     * Encrypt data using the encryption service
     */
    async encrypt(data, options = {}) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        const result = await this.services.encryption.encrypt(data, options);

        // Audit the encryption operation
        await this.services.audit.logEvent({
            type: 'SECURITY_EVENT',
            action: 'ENCRYPT',
            outcome: 'SUCCESS',
            details: {
                mode: options.mode || 'standard',
                size: result.metadata.originalSize
            }
        });

        return result;
    }

    /**
     * Decrypt data using the encryption service
     */
    async decrypt(encryptedData, options = {}) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        const result = await this.services.encryption.decrypt(encryptedData, options);

        // Audit the decryption operation
        await this.services.audit.logEvent({
            type: 'SECURITY_EVENT',
            action: 'DECRYPT',
            outcome: 'SUCCESS'
        });

        return result;
    }

    /**
     * Hash data using the hash service
     */
    async hash(data, options = {}) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        return await this.services.hashService.createHash(data, options);
    }

    /**
     * Check access permissions
     */
    async checkAccess(subject, resource, action, context = {}) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        const result = await this.services.rbac.checkAccess(subject, resource, action, context);

        // Audit the access check
        await this.services.audit.logEvent({
            type: 'AUTHORIZATION',
            action: 'ACCESS_CHECK',
            userId: subject.id,
            resource: resource.id,
            requestedAction: action,
            outcome: result.granted ? 'SUCCESS' : 'DENIED',
            details: result
        });

        return result;
    }

    /**
     * Validate compliance for an operation
     */
    async validateCompliance(operation, data, standard = 'all') {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        const results = {};

        if (standard === 'all' || standard === 'GDPR') {
            results.gdpr = await this.services.gdprCompliance.validate(operation, data);
        }

        if (standard === 'all' || standard === 'HIPAA') {
            results.hipaa = await this.services.hipaaCompliance.validate(operation, data);
        }

        if (standard === 'all' || standard === 'SOX') {
            results.sox = await this.services.soxCompliance.validate(operation, data);
        }

        return results;
    }

    /**
     * Get a specific service
     */
    getService(serviceName) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        return this.services[serviceName];
    }

    /**
     * Generate security report
     */
    async generateSecurityReport(options = {}) {
        if (!this.initialized) {
            throw new Error('Security manager not initialized');
        }

        const report = {
            generated: new Date().toISOString(),
            encryption: await this.services.encryption.getStatistics(),
            keyManagement: await this.services.keyManager.getStatistics(),
            audit: await this.services.audit.getStatistics(),
            compliance: {
                gdpr: await this.services.gdprCompliance.getStatus(),
                hipaa: await this.services.hipaaCompliance.getStatus(),
                sox: await this.services.soxCompliance.getStatus()
            },
            accessControl: {
                roles: await this.services.roles.getStatistics(),
                permissions: await this.services.permissions.getStatistics(),
                policies: await this.services.policyEngine.getStatistics()
            }
        };

        return report;
    }

    /**
     * Shutdown all security services
     */
    async shutdown() {
        if (!this.initialized) {
            return;
        }

        // Log shutdown event
        await this.services.audit.logEvent({
            type: 'SYSTEM_EVENT',
            action: 'SECURITY_SHUTDOWN',
            outcome: 'PENDING'
        });

        // Shutdown all services
        for (const [name, service] of Object.entries(this.services)) {
            if (service && typeof service.shutdown === 'function') {
                await service.shutdown();
            }
        }

        this.initialized = false;
    }
}

// Export all modules and classes
module.exports = {
    // Main Manager
    SecurityManager,

    // Encryption Module
    EncryptionService,
    KeyManager,
    HashService,
    CryptoUtils,

    // Audit Module
    AuditService,
    AuditLogger,
    AuditEvents,
    ComplianceReporter,
    AuditTrail,

    // Compliance Module
    GDPRCompliance,
    HIPAACompliance,
    SOXCompliance,
    DataRetention,
    PrivacyControls,

    // Access Control Module
    RBACService,
    PermissionService,
    RoleService,
    PolicyEngine,

    // Factory function for quick setup
    createSecurityManager: (config) => {
        return new SecurityManager(config);
    },

    // Utility functions
    utils: {
        generateSecureToken: () => {
            const utils = new CryptoUtils();
            return utils.generateSecureToken();
        },

        hashPassword: async (password) => {
            const utils = new CryptoUtils();
            return await utils.createPasswordHash(password);
        },

        verifyPassword: async (password, hash, salt, iterations) => {
            const utils = new CryptoUtils();
            return await utils.verifyPassword(password, hash, salt, iterations);
        }
    }
};
