const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * PermissionService - Comprehensive permission management service
 * Handles permission creation, validation, and management
 */
class PermissionService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            hierarchical: config.hierarchical !== false,
            wildcardSupport: config.wildcardSupport !== false,
            dynamicPermissions: config.dynamicPermissions || false,
            contextualPermissions: config.contextualPermissions || false,
            temporalPermissions: config.temporalPermissions || false,
            conditionalPermissions: config.conditionalPermissions || false,
            permissionInheritance: config.permissionInheritance !== false,
            maxPermissionDepth: config.maxPermissionDepth || 10,
            maxPermissionsPerEntity: config.maxPermissionsPerEntity || 1000,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            auditEnabled: config.auditEnabled !== false,
            strictValidation: config.strictValidation !== false,
            permissionGrouping: config.permissionGrouping !== false,
            customPermissions: config.customPermissions !== false,
            permissionTemplates: config.permissionTemplates !== false,
            conflictDetection: config.conflictDetection !== false,
            permissionScoping: config.permissionScoping !== false,
            defaultScope: config.defaultScope || 'application'
        };

        this.permissions = new Map();
        this.permissionGroups = new Map();
        this.permissionTemplates = new Map();
        this.permissionHierarchy = new Map();
        this.permissionScopes = new Map();
        this.permissionConditions = new Map();
        this.permissionCache = new Map();
        this.dynamicPermissionHandlers = new Map();
        this.permissionAliases = new Map();
        this.permissionMetadata = new Map();

        this.statistics = {
            totalPermissions: 0,
            activePermissions: 0,
            dynamicPermissions: 0,
            permissionChecks: 0,
            granted: 0,
            denied: 0,
            cacheHits: 0,
            cacheMisses: 0,
            conflictsDetected: 0,
            errors: 0
        };

        this.permissionTypes = {
            RESOURCE: 'resource',
            ACTION: 'action',
            FIELD: 'field',
            OPERATION: 'operation',
            SYSTEM: 'system',
            API: 'api',
            UI: 'ui',
            DATA: 'data',
            WORKFLOW: 'workflow',
            CUSTOM: 'custom'
        };

        this.permissionStates = {
            ACTIVE: 'active',
            INACTIVE: 'inactive',
            DEPRECATED: 'deprecated',
            SUSPENDED: 'suspended',
            REVOKED: 'revoked'
        };

        this.operations = {
            CREATE: 'create',
            READ: 'read',
            UPDATE: 'update',
            DELETE: 'delete',
            EXECUTE: 'execute',
            APPROVE: 'approve',
            PUBLISH: 'publish',
            SHARE: 'share',
            EXPORT: 'export',
            IMPORT: 'import',
            MANAGE: 'manage',
            ADMIN: 'admin'
        };

        this.scopes = {
            GLOBAL: 'global',
            APPLICATION: 'application',
            ORGANIZATION: 'organization',
            DEPARTMENT: 'department',
            TEAM: 'team',
            PROJECT: 'project',
            USER: 'user',
            SESSION: 'session'
        };

        this.initializeBuiltInPermissions();
        this.initializePermissionTemplates();
    }

    /**
     * Initialize the permission service
     */
    async initialize() {
        try {
            // Set up cache cleanup
            if (this.config.cacheEnabled) {
                this.setupCacheCleanup();
            }

            // Set up permission monitoring
            this.setupPermissionMonitoring();

            // Load custom permissions if enabled
            if (this.config.customPermissions) {
                await this.loadCustomPermissions();
            }

            // Initialize dynamic permission handlers
            if (this.config.dynamicPermissions) {
                this.initializeDynamicHandlers();
            }

            this.emit('initialized');

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Permission service initialization failed: ${error.message}`);
        }
    }

    /**
     * Create a new permission
     * @param {object} permissionData - Permission definition
     * @returns {Promise<object>} Created permission
     */
    async createPermission(permissionData) {
        try {
            // Validate permission data
            this.validatePermissionData(permissionData);

            const permission = {
                id: permissionData.id || this.generatePermissionId(),
                name: permissionData.name,
                displayName: permissionData.displayName || permissionData.name,
                description: permissionData.description,
                type: permissionData.type || this.permissionTypes.CUSTOM,
                state: permissionData.state || this.permissionStates.ACTIVE,
                resource: permissionData.resource,
                operation: permissionData.operation,
                scope: permissionData.scope || this.config.defaultScope,
                conditions: permissionData.conditions || [],
                constraints: permissionData.constraints || {},
                attributes: permissionData.attributes || {},
                parent: permissionData.parent || null,
                children: new Set(),
                groups: new Set(permissionData.groups || []),
                aliases: new Set(permissionData.aliases || []),
                metadata: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    createdBy: permissionData.createdBy || 'system',
                    version: 1,
                    tags: permissionData.tags || [],
                    source: permissionData.source || 'manual'
                },
                config: {
                    inheritable: permissionData.inheritable !== false,
                    overridable: permissionData.overridable !== false,
                    combinable: permissionData.combinable !== false,
                    temporal: permissionData.temporal || false,
                    conditional: permissionData.conditional || false,
                    contextual: permissionData.contextual || false,
                    dynamic: permissionData.dynamic || false
                }
            };

            // Check for conflicts
            if (this.config.conflictDetection) {
                await this.checkPermissionConflicts(permission);
            }

            // Set up hierarchy if parent specified
            if (permission.parent) {
                await this.establishHierarchy(permission.id, permission.parent);
            }

            // Apply template if specified
            if (permissionData.template) {
                await this.applyPermissionTemplate(permission, permissionData.template);
            }

            // Register dynamic handler if dynamic permission
            if (permission.config.dynamic && permissionData.handler) {
                this.registerDynamicHandler(permission.id, permissionData.handler);
            }

            // Store permission
            this.permissions.set(permission.id, permission);
            this.statistics.totalPermissions++;

            if (permission.state === this.permissionStates.ACTIVE) {
                this.statistics.activePermissions++;
            }

            if (permission.config.dynamic) {
                this.statistics.dynamicPermissions++;
            }

            // Index permission
            this.indexPermission(permission);

            // Register aliases
            for (const alias of permission.aliases) {
                this.permissionAliases.set(alias, permission.id);
            }

            // Clear cache
            this.clearPermissionCache();

            this.emit('permissionCreated', permission);

            return {
                id: permission.id,
                name: permission.name,
                resource: permission.resource,
                operation: permission.operation,
                scope: permission.scope
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to create permission: ${error.message}`);
        }
    }

    /**
     * Check if entity has permission
     * @param {string} entityId - Entity ID (user, role, etc.)
     * @param {string} permission - Permission to check
     * @param {object} context - Context for evaluation
     * @returns {Promise<boolean>} Permission check result
     */
    async hasPermission(entityId, permission, context = {}) {
        const startTime = Date.now();
        this.statistics.permissionChecks++;

        try {
            // Check cache first
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(entityId, permission, context);
                if (this.permissionCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    const cached = this.permissionCache.get(cacheKey);

                    if (cached.result) {
                        this.statistics.granted++;
                    } else {
                        this.statistics.denied++;
                    }

                    return cached.result;
                }
                this.statistics.cacheMisses++;
            }

            // Resolve permission (handle aliases, wildcards, etc.)
            const resolvedPermission = await this.resolvePermission(permission);

            // Check direct permission
            let hasPermission = await this.checkDirectPermission(entityId, resolvedPermission);

            // Check wildcard permissions
            if (!hasPermission && this.config.wildcardSupport) {
                hasPermission = await this.checkWildcardPermission(entityId, resolvedPermission);
            }

            // Check hierarchical permissions
            if (!hasPermission && this.config.hierarchical) {
                hasPermission = await this.checkHierarchicalPermission(entityId, resolvedPermission);
            }

            // Check dynamic permissions
            if (!hasPermission && this.config.dynamicPermissions) {
                hasPermission = await this.checkDynamicPermission(entityId, resolvedPermission, context);
            }

            // Check contextual permissions
            if (hasPermission && this.config.contextualPermissions) {
                hasPermission = await this.validateContextualPermission(
                    entityId,
                    resolvedPermission,
                    context
                );
            }

            // Check temporal permissions
            if (hasPermission && this.config.temporalPermissions) {
                hasPermission = await this.validateTemporalPermission(
                    entityId,
                    resolvedPermission,
                    context
                );
            }

            // Check conditional permissions
            if (hasPermission && this.config.conditionalPermissions) {
                hasPermission = await this.validateConditionalPermission(
                    entityId,
                    resolvedPermission,
                    context
                );
            }

            // Update statistics
            if (hasPermission) {
                this.statistics.granted++;
            } else {
                this.statistics.denied++;
            }

            // Cache result
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(entityId, permission, context);
                this.permissionCache.set(cacheKey, {
                    result: hasPermission,
                    timestamp: Date.now(),
                    duration: Date.now() - startTime
                });
                this.scheduleCacheExpiry(cacheKey);
            }

            // Audit if enabled
            if (this.config.auditEnabled) {
                this.emit('permissionChecked', {
                    entityId,
                    permission,
                    result: hasPermission,
                    context,
                    duration: Date.now() - startTime
                });
            }

            return hasPermission;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Permission check failed: ${error.message}`);
        }
    }

    /**
     * Grant permission to entity
     * @param {string} entityId - Entity ID
     * @param {string} permissionId - Permission ID
     * @param {object} options - Grant options
     * @returns {Promise<object>} Grant result
     */
    async grantPermission(entityId, permissionId, options = {}) {
        try {
            const permission = await this.getPermission(permissionId);

            if (!permission) {
                throw new Error(`Permission not found: ${permissionId}`);
            }

            // Check if permission can be granted
            if (permission.state !== this.permissionStates.ACTIVE) {
                throw new Error(`Permission is not active: ${permissionId}`);
            }

            // Store the grant
            const grant = {
                id: this.generateGrantId(),
                entityId,
                permissionId,
                grantedAt: new Date().toISOString(),
                grantedBy: options.grantedBy || 'system',
                expiresAt: options.expiresAt || null,
                conditions: options.conditions || [],
                scope: options.scope || permission.scope,
                metadata: options.metadata || {}
            };

            // Store in appropriate structure (this would typically be in a database)
            if (!this.permissionMetadata.has(entityId)) {
                this.permissionMetadata.set(entityId, {
                    grants: new Map(),
                    denials: new Map(),
                    history: []
                });
            }

            const entityMetadata = this.permissionMetadata.get(entityId);
            entityMetadata.grants.set(permissionId, grant);
            entityMetadata.history.push({
                action: 'grant',
                permissionId,
                timestamp: grant.grantedAt
            });

            // Clear cache for entity
            this.clearEntityCache(entityId);

            this.emit('permissionGranted', {
                entityId,
                permissionId,
                grant
            });

            return grant;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to grant permission: ${error.message}`);
        }
    }

    /**
     * Revoke permission from entity
     * @param {string} entityId - Entity ID
     * @param {string} permissionId - Permission ID
     * @param {object} options - Revocation options
     * @returns {Promise<object>} Revocation result
     */
    async revokePermission(entityId, permissionId, options = {}) {
        try {
            const entityMetadata = this.permissionMetadata.get(entityId);

            if (!entityMetadata || !entityMetadata.grants.has(permissionId)) {
                throw new Error(`Permission not granted to entity: ${permissionId}`);
            }

            // Remove the grant
            const grant = entityMetadata.grants.get(permissionId);
            entityMetadata.grants.delete(permissionId);

            // Add to history
            entityMetadata.history.push({
                action: 'revoke',
                permissionId,
                timestamp: new Date().toISOString(),
                revokedBy: options.revokedBy || 'system',
                reason: options.reason
            });

            // Add to denials if specified
            if (options.deny) {
                entityMetadata.denials.set(permissionId, {
                    deniedAt: new Date().toISOString(),
                    deniedBy: options.revokedBy || 'system',
                    reason: options.reason,
                    permanent: options.permanent || false
                });
            }

            // Clear cache for entity
            this.clearEntityCache(entityId);

            this.emit('permissionRevoked', {
                entityId,
                permissionId,
                previousGrant: grant
            });

            return {
                success: true,
                entityId,
                permissionId,
                revokedAt: new Date().toISOString()
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to revoke permission: ${error.message}`);
        }
    }

    /**
     * Get permission by ID
     * @param {string} permissionId - Permission ID
     * @returns {Promise<object>} Permission details
     */
    async getPermission(permissionId) {
        // Check if it's an alias
        if (this.permissionAliases.has(permissionId)) {
            permissionId = this.permissionAliases.get(permissionId);
        }

        return this.permissions.get(permissionId);
    }

    /**
     * Get all permissions
     * @param {object} filter - Filter criteria
     * @returns {Promise<array>} List of permissions
     */
    async getPermissions(filter = {}) {
        try {
            let permissions = Array.from(this.permissions.values());

            // Apply filters
            if (filter.type) {
                permissions = permissions.filter(p => p.type === filter.type);
            }

            if (filter.state) {
                permissions = permissions.filter(p => p.state === filter.state);
            }

            if (filter.resource) {
                permissions = permissions.filter(p => p.resource === filter.resource);
            }

            if (filter.operation) {
                permissions = permissions.filter(p => p.operation === filter.operation);
            }

            if (filter.scope) {
                permissions = permissions.filter(p => p.scope === filter.scope);
            }

            if (filter.group) {
                permissions = permissions.filter(p => p.groups.has(filter.group));
            }

            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                permissions = permissions.filter(p =>
                    p.name.toLowerCase().includes(searchLower) ||
                    p.displayName.toLowerCase().includes(searchLower) ||
                    p.description?.toLowerCase().includes(searchLower)
                );
            }

            // Sort
            if (filter.sortBy) {
                permissions = this.sortPermissions(permissions, filter.sortBy, filter.sortOrder);
            }

            // Paginate
            if (filter.limit) {
                const offset = filter.offset || 0;
                permissions = permissions.slice(offset, offset + filter.limit);
            }

            // Transform to output format
            return permissions.map(p => ({
                id: p.id,
                name: p.name,
                displayName: p.displayName,
                type: p.type,
                resource: p.resource,
                operation: p.operation,
                scope: p.scope,
                state: p.state
            }));

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to get permissions: ${error.message}`);
        }
    }

    /**
     * Get entity permissions
     * @param {string} entityId - Entity ID
     * @returns {Promise<array>} Entity's permissions
     */
    async getEntityPermissions(entityId) {
        const entityMetadata = this.permissionMetadata.get(entityId);

        if (!entityMetadata) {
            return [];
        }

        const permissions = [];

        for (const [permissionId, grant] of entityMetadata.grants.entries()) {
            const permission = await this.getPermission(permissionId);
            if (permission) {
                permissions.push({
                    ...permission,
                    grant
                });
            }
        }

        return permissions;
    }

    /**
     * Initialize built-in permissions
     */
    initializeBuiltInPermissions() {
        const builtInPermissions = [
            // System permissions
            { id: 'system.admin', name: 'system.admin', resource: 'system', operation: 'admin', type: this.permissionTypes.SYSTEM },
            { id: 'system.manage', name: 'system.manage', resource: 'system', operation: 'manage', type: this.permissionTypes.SYSTEM },
            { id: 'system.view', name: 'system.view', resource: 'system', operation: 'read', type: this.permissionTypes.SYSTEM },

            // User permissions
            { id: 'user.create', name: 'user.create', resource: 'user', operation: 'create', type: this.permissionTypes.RESOURCE },
            { id: 'user.read', name: 'user.read', resource: 'user', operation: 'read', type: this.permissionTypes.RESOURCE },
            { id: 'user.update', name: 'user.update', resource: 'user', operation: 'update', type: this.permissionTypes.RESOURCE },
            { id: 'user.delete', name: 'user.delete', resource: 'user', operation: 'delete', type: this.permissionTypes.RESOURCE },

            // Role permissions
            { id: 'role.create', name: 'role.create', resource: 'role', operation: 'create', type: this.permissionTypes.RESOURCE },
            { id: 'role.read', name: 'role.read', resource: 'role', operation: 'read', type: this.permissionTypes.RESOURCE },
            { id: 'role.update', name: 'role.update', resource: 'role', operation: 'update', type: this.permissionTypes.RESOURCE },
            { id: 'role.delete', name: 'role.delete', resource: 'role', operation: 'delete', type: this.permissionTypes.RESOURCE },
            { id: 'role.assign', name: 'role.assign', resource: 'role', operation: 'assign', type: this.permissionTypes.OPERATION },

            // Data permissions
            { id: 'data.read', name: 'data.read', resource: 'data', operation: 'read', type: this.permissionTypes.DATA },
            { id: 'data.write', name: 'data.write', resource: 'data', operation: 'write', type: this.permissionTypes.DATA },
            { id: 'data.export', name: 'data.export', resource: 'data', operation: 'export', type: this.permissionTypes.DATA },
            { id: 'data.import', name: 'data.import', resource: 'data', operation: 'import', type: this.permissionTypes.DATA },

            // API permissions
            { id: 'api.access', name: 'api.access', resource: 'api', operation: 'access', type: this.permissionTypes.API },
            { id: 'api.admin', name: 'api.admin', resource: 'api', operation: 'admin', type: this.permissionTypes.API }
        ];

        for (const permData of builtInPermissions) {
            const permission = {
                ...permData,
                displayName: permData.name.replace('.', ' ').toUpperCase(),
                description: `Built-in ${permData.name} permission`,
                state: this.permissionStates.ACTIVE,
                scope: this.scopes.APPLICATION,
                conditions: [],
                constraints: {},
                attributes: {},
                parent: null,
                children: new Set(),
                groups: new Set(['built-in']),
                aliases: new Set(),
                metadata: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    createdBy: 'system',
                    version: 1,
                    tags: ['built-in'],
                    source: 'system'
                },
                config: {
                    inheritable: true,
                    overridable: false,
                    combinable: true,
                    temporal: false,
                    conditional: false,
                    contextual: false,
                    dynamic: false
                }
            };

            this.permissions.set(permission.id, permission);
        }
    }

    /**
     * Initialize permission templates
     */
    initializePermissionTemplates() {
        // CRUD template
        this.permissionTemplates.set('crud', {
            name: 'CRUD Operations',
            description: 'Create, Read, Update, Delete permissions',
            generate: (resource) => [
                { name: `${resource}.create`, resource, operation: 'create' },
                { name: `${resource}.read`, resource, operation: 'read' },
                { name: `${resource}.update`, resource, operation: 'update' },
                { name: `${resource}.delete`, resource, operation: 'delete' }
            ]
        });

        // Admin template
        this.permissionTemplates.set('admin', {
            name: 'Administrative',
            description: 'Full administrative permissions',
            generate: (resource) => [
                { name: `${resource}.admin`, resource, operation: 'admin' },
                { name: `${resource}.manage`, resource, operation: 'manage' },
                { name: `${resource}.configure`, resource, operation: 'configure' }
            ]
        });

        // Readonly template
        this.permissionTemplates.set('readonly', {
            name: 'Read Only',
            description: 'Read-only permissions',
            generate: (resource) => [
                { name: `${resource}.read`, resource, operation: 'read' },
                { name: `${resource}.list`, resource, operation: 'list' },
                { name: `${resource}.view`, resource, operation: 'view' }
            ]
        });

        // Workflow template
        this.permissionTemplates.set('workflow', {
            name: 'Workflow',
            description: 'Workflow-related permissions',
            generate: (resource) => [
                { name: `${resource}.submit`, resource, operation: 'submit' },
                { name: `${resource}.approve`, resource, operation: 'approve' },
                { name: `${resource}.reject`, resource, operation: 'reject' },
                { name: `${resource}.review`, resource, operation: 'review' }
            ]
        });
    }

    /**
     * Helper methods
     */

    validatePermissionData(permissionData) {
        if (!permissionData.name) {
            throw new Error('Permission name is required');
        }

        if (this.config.strictValidation) {
            // Check for duplicate names
            for (const permission of this.permissions.values()) {
                if (permission.name === permissionData.name) {
                    throw new Error(`Permission name already exists: ${permissionData.name}`);
                }
            }

            // Validate resource and operation
            if (!permissionData.resource) {
                throw new Error('Permission resource is required');
            }

            if (!permissionData.operation) {
                throw new Error('Permission operation is required');
            }
        }
    }

    async checkPermissionConflicts(permission) {
        const conflicts = [];

        // Check for conflicting permissions
        for (const existing of this.permissions.values()) {
            if (existing.resource === permission.resource &&
                existing.operation === permission.operation &&
                existing.scope === permission.scope &&
                existing.id !== permission.id) {
                conflicts.push(`Duplicate permission: ${existing.name}`);
            }
        }

        if (conflicts.length > 0) {
            this.statistics.conflictsDetected++;

            if (this.config.conflictDetection === 'strict') {
                throw new Error(`Permission conflicts detected: ${conflicts.join(', ')}`);
            }
        }

        return conflicts;
    }

    async establishHierarchy(childId, parentId) {
        const parent = this.permissions.get(parentId);
        if (!parent) {
            throw new Error(`Parent permission not found: ${parentId}`);
        }

        const child = this.permissions.get(childId);
        if (!child) {
            throw new Error(`Child permission not found: ${childId}`);
        }

        parent.children.add(childId);
        child.parent = parentId;

        if (!this.permissionHierarchy.has(parentId)) {
            this.permissionHierarchy.set(parentId, new Set());
        }
        this.permissionHierarchy.get(parentId).add(childId);
    }

    async applyPermissionTemplate(permission, templateId) {
        const template = this.permissionTemplates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        // Generate permissions from template
        const generatedPermissions = template.generate(permission.resource);

        // This would typically create multiple permissions
        // For now, we'll just update the current permission
        permission.metadata.template = templateId;
    }

    registerDynamicHandler(permissionId, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Dynamic handler must be a function');
        }

        this.dynamicPermissionHandlers.set(permissionId, handler);
    }

    async resolvePermission(permission) {
        // Check if it's an alias
        if (this.permissionAliases.has(permission)) {
            return this.permissionAliases.get(permission);
        }

        // Return as is if it's a valid permission ID
        if (this.permissions.has(permission)) {
            return permission;
        }

        // Try to parse as resource.operation format
        const parts = permission.split('.');
        if (parts.length === 2) {
            const [resource, operation] = parts;

            // Find matching permission
            for (const perm of this.permissions.values()) {
                if (perm.resource === resource && perm.operation === operation) {
                    return perm.id;
                }
            }
        }

        return permission;
    }

    async checkDirectPermission(entityId, permissionId) {
        const entityMetadata = this.permissionMetadata.get(entityId);

        if (!entityMetadata) {
            return false;
        }

        // Check if permission is granted
        if (entityMetadata.grants.has(permissionId)) {
            const grant = entityMetadata.grants.get(permissionId);

            // Check if grant is expired
            if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
                return false;
            }

            return true;
        }

        // Check if permission is denied
        if (entityMetadata.denials.has(permissionId)) {
            return false;
        }

        return false;
    }

    async checkWildcardPermission(entityId, permissionId) {
        const permission = await this.getPermission(permissionId);
        if (!permission) return false;

        const entityMetadata = this.permissionMetadata.get(entityId);
        if (!entityMetadata) return false;

        // Check for wildcard grants
        for (const [grantedPermId] of entityMetadata.grants.entries()) {
            if (grantedPermId.includes('*')) {
                const pattern = grantedPermId.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`);

                if (regex.test(permission.name)) {
                    return true;
                }
            }
        }

        return false;
    }

    async checkHierarchicalPermission(entityId, permissionId) {
        const permission = await this.getPermission(permissionId);
        if (!permission || !permission.parent) return false;

        // Check parent permissions
        return await this.hasPermission(entityId, permission.parent);
    }

    async checkDynamicPermission(entityId, permissionId, context) {
        const handler = this.dynamicPermissionHandlers.get(permissionId);

        if (!handler) {
            return false;
        }

        try {
            return await handler(entityId, context);
        } catch (error) {
            this.emit('error', {
                type: 'dynamic-permission-error',
                permissionId,
                error: error.message
            });
            return false;
        }
    }

    async validateContextualPermission(entityId, permissionId, context) {
        const permission = await this.getPermission(permissionId);
        if (!permission || !permission.config.contextual) return true;

        // Validate context requirements
        if (permission.constraints.requiredContext) {
            for (const required of permission.constraints.requiredContext) {
                if (!context[required]) {
                    return false;
                }
            }
        }

        // Validate context values
        if (permission.constraints.contextValues) {
            for (const [key, value] of Object.entries(permission.constraints.contextValues)) {
                if (context[key] !== value) {
                    return false;
                }
            }
        }

        return true;
    }

    async validateTemporalPermission(entityId, permissionId, context) {
        const permission = await this.getPermission(permissionId);
        if (!permission || !permission.config.temporal) return true;

        const now = new Date();

        // Check time-based constraints
        if (permission.constraints.validFrom) {
            if (now < new Date(permission.constraints.validFrom)) {
                return false;
            }
        }

        if (permission.constraints.validUntil) {
            if (now > new Date(permission.constraints.validUntil)) {
                return false;
            }
        }

        // Check time of day constraints
        if (permission.constraints.timeOfDay) {
            const hour = now.getHours();
            const { start, end } = permission.constraints.timeOfDay;

            if (hour < start || hour >= end) {
                return false;
            }
        }

        // Check day of week constraints
        if (permission.constraints.daysOfWeek) {
            const day = now.getDay();
            if (!permission.constraints.daysOfWeek.includes(day)) {
                return false;
            }
        }

        return true;
    }

    async validateConditionalPermission(entityId, permissionId, context) {
        const permission = await this.getPermission(permissionId);
        if (!permission || !permission.config.conditional) return true;

        // Evaluate conditions
        for (const condition of permission.conditions) {
            const result = await this.evaluateCondition(condition, entityId, context);
            if (!result) {
                return false;
            }
        }

        return true;
    }

    async evaluateCondition(condition, entityId, context) {
        // Simple condition evaluation
        // In production, this would be more sophisticated
        if (condition.type === 'attribute') {
            const value = context[condition.attribute];

            switch (condition.operator) {
                case '==':
                    return value === condition.value;
                case '!=':
                    return value !== condition.value;
                case '>':
                    return value > condition.value;
                case '<':
                    return value < condition.value;
                case 'in':
                    return condition.value.includes(value);
                default:
                    return false;
            }
        }

        return true;
    }

    indexPermission(permission) {
        // Index by resource
        if (!this.permissionScopes.has(permission.resource)) {
            this.permissionScopes.set(permission.resource, new Set());
        }
        this.permissionScopes.get(permission.resource).add(permission.id);

        // Index by group
        for (const group of permission.groups) {
            if (!this.permissionGroups.has(group)) {
                this.permissionGroups.set(group, new Set());
            }
            this.permissionGroups.get(group).add(permission.id);
        }
    }

    clearPermissionCache() {
        if (this.config.cacheEnabled) {
            this.permissionCache.clear();
        }
    }

    clearEntityCache(entityId) {
        if (this.config.cacheEnabled) {
            for (const [key] of this.permissionCache.entries()) {
                if (key.startsWith(`${entityId}:`)) {
                    this.permissionCache.delete(key);
                }
            }
        }
    }

    generateCacheKey(entityId, permission, context) {
        const contextKey = Object.keys(context).sort().map(k => `${k}:${context[k]}`).join(',');
        return `${entityId}:${permission}:${contextKey}`;
    }

    scheduleCacheExpiry(key) {
        setTimeout(() => {
            this.permissionCache.delete(key);
        }, this.config.cacheTTL);
    }

    sortPermissions(permissions, sortBy, sortOrder = 'asc') {
        return permissions.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            if (sortBy === 'created' || sortBy === 'modified') {
                aVal = new Date(a.metadata[sortBy]).getTime();
                bVal = new Date(b.metadata[sortBy]).getTime();
            }

            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();

            for (const [key, value] of this.permissionCache.entries()) {
                if (now - value.timestamp > this.config.cacheTTL) {
                    this.permissionCache.delete(key);
                }
            }
        }, this.config.cacheTTL);
    }

    setupPermissionMonitoring() {
        // Set up monitoring for permission changes, usage, etc.
    }

    async loadCustomPermissions() {
        // Load custom permissions from storage or configuration
    }

    initializeDynamicHandlers() {
        // Initialize built-in dynamic permission handlers

        // Owner permission handler
        this.dynamicPermissionHandlers.set('owner', async (entityId, context) => {
            return context.resourceOwner === entityId;
        });

        // Department permission handler
        this.dynamicPermissionHandlers.set('department', async (entityId, context) => {
            return context.userDepartment === context.resourceDepartment;
        });

        // Time-based permission handler
        this.dynamicPermissionHandlers.set('business-hours', async (entityId, context) => {
            const hour = new Date().getHours();
            return hour >= 8 && hour < 18;
        });
    }

    generatePermissionId() {
        return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateGrantId() {
        return `grant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheSize: this.permissionCache.size,
            templateCount: this.permissionTemplates.size,
            dynamicHandlers: this.dynamicPermissionHandlers.size
        };
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.permissionCache.clear();
        this.emit('shutdown');
    }
}

module.exports = PermissionService;
