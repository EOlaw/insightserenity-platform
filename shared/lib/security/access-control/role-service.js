const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * RoleService - Comprehensive role management service
 * Handles role creation, hierarchy, inheritance, and management
 */
class RoleService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            hierarchical: config.hierarchical !== false,
            maxHierarchyDepth: config.maxHierarchyDepth || 10,
            dynamicRoles: config.dynamicRoles || false,
            roleInheritance: config.roleInheritance !== false,
            temporalRoles: config.temporalRoles || false,
            conditionalRoles: config.conditionalRoles || false,
            roleTemplates: config.roleTemplates !== false,
            maxRolesPerUser: config.maxRolesPerUser || 50,
            maxPermissionsPerRole: config.maxPermissionsPerRole || 1000,
            auditEnabled: config.auditEnabled !== false,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            separationOfDuties: config.separationOfDuties !== false,
            roleActivation: config.roleActivation || 'immediate', // 'immediate', 'delayed', 'scheduled'
            roleExpiration: config.roleExpiration || false,
            defaultExpiration: config.defaultExpiration || 365 * 24 * 60 * 60 * 1000, // 1 year
            roleGroups: config.roleGroups || false,
            customAttributes: config.customAttributes || false,
            roleValidation: config.roleValidation !== false,
            conflictResolution: config.conflictResolution || 'deny'
        };

        this.roles = new Map();
        this.roleHierarchy = new Map();
        this.roleTemplates = new Map();
        this.roleGroups = new Map();
        this.roleAssignments = new Map();
        this.roleConstraints = new Map();
        this.roleConflicts = new Map();
        this.roleSchedule = new Map();
        this.roleCache = new Map();
        this.roleHistory = new Map();

        this.statistics = {
            totalRoles: 0,
            activeRoles: 0,
            expiredRoles: 0,
            temporaryRoles: 0,
            inheritedPermissions: 0,
            roleAssignments: 0,
            roleRevocations: 0,
            conflictsDetected: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };

        this.roleTypes = {
            SYSTEM: 'system',
            APPLICATION: 'application',
            BUSINESS: 'business',
            TECHNICAL: 'technical',
            TEMPORARY: 'temporary',
            DELEGATED: 'delegated',
            EMERGENCY: 'emergency',
            CUSTOM: 'custom'
        };

        this.roleStates = {
            DRAFT: 'draft',
            PENDING: 'pending',
            ACTIVE: 'active',
            SUSPENDED: 'suspended',
            EXPIRED: 'expired',
            ARCHIVED: 'archived',
            DELETED: 'deleted'
        };

        this.constraintTypes = {
            TIME_BASED: 'time-based',
            LOCATION_BASED: 'location-based',
            CONTEXT_BASED: 'context-based',
            ATTRIBUTE_BASED: 'attribute-based',
            CARDINALITY: 'cardinality',
            MUTUAL_EXCLUSION: 'mutual-exclusion',
            PREREQUISITE: 'prerequisite',
            BINDING: 'binding'
        };

        this.initializeBuiltInRoles();
        this.initializeRoleTemplates();
    }

    /**
     * Initialize the role service
     */
    async initialize() {
        try {
            // Set up role expiration monitoring
            if (this.config.roleExpiration) {
                this.setupExpirationMonitoring();
            }

            // Set up cache cleanup
            if (this.config.cacheEnabled) {
                this.setupCacheCleanup();
            }

            // Set up role scheduling if temporal roles are enabled
            if (this.config.temporalRoles) {
                this.setupRoleScheduling();
            }

            // Load persisted roles if available
            await this.loadPersistedRoles();

            this.emit('initialized');

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Role service initialization failed: ${error.message}`);
        }
    }

    /**
     * Create a new role
     * @param {object} roleData - Role definition
     * @returns {Promise<object>} Created role
     */
    async createRole(roleData) {
        try {
            // Validate role data
            this.validateRoleData(roleData);

            const role = {
                id: roleData.id || this.generateRoleId(),
                name: roleData.name,
                displayName: roleData.displayName || roleData.name,
                description: roleData.description,
                type: roleData.type || this.roleTypes.CUSTOM,
                state: roleData.state || this.roleStates.ACTIVE,
                permissions: new Set(roleData.permissions || []),
                deniedPermissions: new Set(roleData.deniedPermissions || []),
                parent: roleData.parent || null,
                children: new Set(),
                groups: new Set(roleData.groups || []),
                constraints: roleData.constraints || {},
                attributes: roleData.attributes || {},
                priority: roleData.priority || 100,
                activationDate: roleData.activationDate || new Date().toISOString(),
                expirationDate: roleData.expirationDate || this.calculateExpiration(roleData),
                metadata: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    createdBy: roleData.createdBy || 'system',
                    version: 1,
                    tags: roleData.tags || [],
                    source: roleData.source || 'manual'
                },
                config: {
                    inheritable: roleData.inheritable !== false,
                    assignable: roleData.assignable !== false,
                    modifiable: roleData.modifiable !== false,
                    deletable: roleData.deletable !== false,
                    temporal: roleData.temporal || false,
                    conditional: roleData.conditional || false
                }
            };

            // Check for conflicts
            if (this.config.separationOfDuties) {
                await this.checkRoleConflicts(role);
            }

            // Set up hierarchy if parent specified
            if (role.parent) {
                await this.establishHierarchy(role.id, role.parent);
            }

            // Apply role template if specified
            if (roleData.template) {
                await this.applyRoleTemplate(role, roleData.template);
            }

            // Store role
            this.roles.set(role.id, role);
            this.statistics.totalRoles++;

            if (role.state === this.roleStates.ACTIVE) {
                this.statistics.activeRoles++;
            }

            // Schedule activation if delayed
            if (this.config.roleActivation === 'scheduled' && roleData.activationTime) {
                await this.scheduleRoleActivation(role.id, roleData.activationTime);
            }

            // Set up expiration if temporal
            if (role.config.temporal) {
                this.statistics.temporaryRoles++;
                await this.scheduleRoleExpiration(role.id, role.expirationDate);
            }

            // Index role for fast lookup
            this.indexRole(role);

            // Record in history
            this.recordRoleHistory(role.id, 'created', roleData);

            // Clear cache
            this.clearRoleCache();

            this.emit('roleCreated', role);

            return {
                id: role.id,
                name: role.name,
                state: role.state,
                permissions: Array.from(role.permissions)
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to create role: ${error.message}`);
        }
    }

    /**
     * Update an existing role
     * @param {string} roleId - Role ID
     * @param {object} updates - Updates to apply
     * @returns {Promise<object>} Updated role
     */
    async updateRole(roleId, updates) {
        try {
            const role = this.roles.get(roleId);

            if (!role) {
                throw new Error(`Role not found: ${roleId}`);
            }

            if (!role.config.modifiable) {
                throw new Error(`Role is not modifiable: ${roleId}`);
            }

            // Validate updates
            this.validateRoleUpdates(updates);

            // Store previous version for rollback if needed
            const previousVersion = { ...role };

            // Apply updates
            if (updates.name !== undefined) role.name = updates.name;
            if (updates.displayName !== undefined) role.displayName = updates.displayName;
            if (updates.description !== undefined) role.description = updates.description;
            if (updates.priority !== undefined) role.priority = updates.priority;

            // Update permissions
            if (updates.permissions) {
                if (updates.permissions.add) {
                    for (const perm of updates.permissions.add) {
                        role.permissions.add(perm);
                    }
                }
                if (updates.permissions.remove) {
                    for (const perm of updates.permissions.remove) {
                        role.permissions.delete(perm);
                    }
                }
            }

            // Update denied permissions
            if (updates.deniedPermissions) {
                if (updates.deniedPermissions.add) {
                    for (const perm of updates.deniedPermissions.add) {
                        role.deniedPermissions.add(perm);
                    }
                }
                if (updates.deniedPermissions.remove) {
                    for (const perm of updates.deniedPermissions.remove) {
                        role.deniedPermissions.delete(perm);
                    }
                }
            }

            // Update constraints
            if (updates.constraints) {
                role.constraints = { ...role.constraints, ...updates.constraints };
            }

            // Update attributes
            if (updates.attributes) {
                role.attributes = { ...role.attributes, ...updates.attributes };
            }

            // Update metadata
            role.metadata.modified = new Date().toISOString();
            role.metadata.version++;
            role.metadata.modifiedBy = updates.modifiedBy || 'system';

            // Check for conflicts after update
            if (this.config.separationOfDuties) {
                const conflictCheck = await this.checkRoleConflicts(role);
                if (conflictCheck.hasConflicts) {
                    // Rollback changes
                    this.roles.set(roleId, previousVersion);
                    throw new Error(`Update would create conflicts: ${conflictCheck.conflicts.join(', ')}`);
                }
            }

            // Clear cache
            this.clearRoleCache();

            // Record in history
            this.recordRoleHistory(roleId, 'updated', updates);

            this.emit('roleUpdated', { roleId, updates });

            return {
                id: role.id,
                name: role.name,
                version: role.metadata.version,
                modified: role.metadata.modified
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to update role: ${error.message}`);
        }
    }

    /**
     * Delete a role
     * @param {string} roleId - Role ID
     * @param {object} options - Deletion options
     * @returns {Promise<object>} Deletion result
     */
    async deleteRole(roleId, options = {}) {
        try {
            const role = this.roles.get(roleId);

            if (!role) {
                throw new Error(`Role not found: ${roleId}`);
            }

            if (!role.config.deletable) {
                throw new Error(`Role is not deletable: ${roleId}`);
            }

            // Check if role has active assignments
            const assignments = await this.getRoleAssignments(roleId);
            if (assignments.length > 0 && !options.force) {
                throw new Error(`Role has active assignments: ${assignments.length}`);
            }

            // Handle role hierarchy
            if (role.parent || role.children.size > 0) {
                await this.handleRoleDeletionHierarchy(roleId, options);
            }

            // Soft delete or hard delete
            if (options.hardDelete) {
                // Remove from all structures
                this.roles.delete(roleId);
                this.roleHierarchy.delete(roleId);
                this.roleAssignments.delete(roleId);
                this.roleConstraints.delete(roleId);
                this.roleConflicts.delete(roleId);

                // Clear from cache
                this.clearRoleCache();

                // Record deletion
                this.recordRoleHistory(roleId, 'deleted', { hardDelete: true });
            } else {
                // Soft delete - mark as deleted
                role.state = this.roleStates.DELETED;
                role.metadata.deleted = new Date().toISOString();
                role.metadata.deletedBy = options.deletedBy || 'system';

                // Record soft deletion
                this.recordRoleHistory(roleId, 'deleted', { softDelete: true });
            }

            // Update statistics
            this.statistics.totalRoles--;
            if (role.state === this.roleStates.ACTIVE) {
                this.statistics.activeRoles--;
            }

            this.emit('roleDeleted', { roleId, options });

            return {
                success: true,
                roleId,
                deletedAt: new Date().toISOString()
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to delete role: ${error.message}`);
        }
    }

    /**
     * Get role by ID
     * @param {string} roleId - Role ID
     * @param {object} options - Retrieval options
     * @returns {Promise<object>} Role details
     */
    async getRole(roleId, options = {}) {
        try {
            // Check cache first
            if (this.config.cacheEnabled && !options.skipCache) {
                const cacheKey = `role:${roleId}`;
                if (this.roleCache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.roleCache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            const role = this.roles.get(roleId);

            if (!role) {
                throw new Error(`Role not found: ${roleId}`);
            }

            // Check if role is deleted and not requesting deleted roles
            if (role.state === this.roleStates.DELETED && !options.includeDeleted) {
                throw new Error(`Role is deleted: ${roleId}`);
            }

            // Build role response
            const roleData = {
                id: role.id,
                name: role.name,
                displayName: role.displayName,
                description: role.description,
                type: role.type,
                state: role.state,
                permissions: Array.from(role.permissions),
                deniedPermissions: Array.from(role.deniedPermissions),
                parent: role.parent,
                children: Array.from(role.children),
                groups: Array.from(role.groups),
                constraints: role.constraints,
                attributes: role.attributes,
                priority: role.priority,
                metadata: role.metadata,
                config: role.config
            };

            // Include effective permissions if requested
            if (options.includeEffectivePermissions) {
                roleData.effectivePermissions = await this.getEffectivePermissions(roleId);
            }

            // Include assignments if requested
            if (options.includeAssignments) {
                roleData.assignments = await this.getRoleAssignments(roleId);
            }

            // Include hierarchy if requested
            if (options.includeHierarchy) {
                roleData.hierarchy = await this.getRoleHierarchy(roleId);
            }

            // Cache result
            if (this.config.cacheEnabled) {
                const cacheKey = `role:${roleId}`;
                this.roleCache.set(cacheKey, roleData);
                this.scheduleCacheExpiry(cacheKey);
            }

            return roleData;

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to get role: ${error.message}`);
        }
    }

    /**
     * Get all roles
     * @param {object} filter - Filter criteria
     * @returns {Promise<array>} List of roles
     */
    async getRoles(filter = {}) {
        try {
            let roles = Array.from(this.roles.values());

            // Apply filters
            if (filter.type) {
                roles = roles.filter(r => r.type === filter.type);
            }

            if (filter.state) {
                roles = roles.filter(r => r.state === filter.state);
            }

            if (filter.group) {
                roles = roles.filter(r => r.groups.has(filter.group));
            }

            if (filter.parent) {
                roles = roles.filter(r => r.parent === filter.parent);
            }

            if (filter.hasPermission) {
                roles = roles.filter(r => r.permissions.has(filter.hasPermission));
            }

            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                roles = roles.filter(r =>
                    r.name.toLowerCase().includes(searchLower) ||
                    r.displayName.toLowerCase().includes(searchLower) ||
                    r.description?.toLowerCase().includes(searchLower)
                );
            }

            // Exclude deleted unless specified
            if (!filter.includeDeleted) {
                roles = roles.filter(r => r.state !== this.roleStates.DELETED);
            }

            // Sort
            if (filter.sortBy) {
                roles = this.sortRoles(roles, filter.sortBy, filter.sortOrder);
            }

            // Paginate
            if (filter.limit) {
                const offset = filter.offset || 0;
                roles = roles.slice(offset, offset + filter.limit);
            }

            // Transform to output format
            return roles.map(r => ({
                id: r.id,
                name: r.name,
                displayName: r.displayName,
                type: r.type,
                state: r.state,
                priority: r.priority,
                permissionCount: r.permissions.size,
                created: r.metadata.created
            }));

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to get roles: ${error.message}`);
        }
    }

    /**
     * Get effective permissions for a role (including inherited)
     * @param {string} roleId - Role ID
     * @returns {Promise<Set>} Effective permissions
     */
    async getEffectivePermissions(roleId) {
        const permissions = new Set();
        const deniedPermissions = new Set();
        const processed = new Set();

        const collectPermissions = async (rId) => {
            if (processed.has(rId)) return;
            processed.add(rId);

            const role = this.roles.get(rId);
            if (!role) return;

            // Add direct permissions
            for (const perm of role.permissions) {
                permissions.add(perm);
            }

            // Add denied permissions
            for (const perm of role.deniedPermissions) {
                deniedPermissions.add(perm);
            }

            // Process parent if inheritance is enabled
            if (this.config.roleInheritance && role.parent) {
                await collectPermissions(role.parent);
            }
        };

        await collectPermissions(roleId);

        // Remove denied permissions from effective permissions
        for (const denied of deniedPermissions) {
            permissions.delete(denied);
        }

        this.statistics.inheritedPermissions = permissions.size;

        return permissions;
    }

    /**
     * Get role hierarchy
     * @param {string} roleId - Role ID
     * @returns {Promise<object>} Role hierarchy
     */
    async getRoleHierarchy(roleId) {
        const hierarchy = {
            role: roleId,
            ancestors: [],
            descendants: [],
            depth: 0,
            breadth: 0
        };

        // Get ancestors
        let current = this.roles.get(roleId);
        while (current && current.parent) {
            hierarchy.ancestors.push(current.parent);
            current = this.roles.get(current.parent);
            hierarchy.depth++;

            if (hierarchy.depth > this.config.maxHierarchyDepth) {
                break;
            }
        }

        // Get descendants
        const collectDescendants = (rId, level = 0) => {
            const role = this.roles.get(rId);
            if (!role) return;

            for (const childId of role.children) {
                hierarchy.descendants.push({
                    id: childId,
                    level: level + 1
                });
                hierarchy.breadth = Math.max(hierarchy.breadth, role.children.size);
                collectDescendants(childId, level + 1);
            }
        };

        collectDescendants(roleId);

        return hierarchy;
    }

    /**
     * Initialize built-in roles
     */
    initializeBuiltInRoles() {
        const builtInRoles = [
            {
                id: 'super-admin',
                name: 'super-admin',
                displayName: 'Super Administrator',
                description: 'Full system access',
                type: this.roleTypes.SYSTEM,
                permissions: ['*'],
                priority: 1000,
                config: {
                    modifiable: false,
                    deletable: false
                }
            },
            {
                id: 'admin',
                name: 'admin',
                displayName: 'Administrator',
                description: 'Administrative access',
                type: this.roleTypes.SYSTEM,
                permissions: ['admin.*'],
                priority: 900,
                parent: 'super-admin'
            },
            {
                id: 'user',
                name: 'user',
                displayName: 'User',
                description: 'Standard user access',
                type: this.roleTypes.SYSTEM,
                permissions: ['user.*'],
                priority: 100
            },
            {
                id: 'guest',
                name: 'guest',
                displayName: 'Guest',
                description: 'Guest access',
                type: this.roleTypes.SYSTEM,
                permissions: ['public.*'],
                priority: 10
            }
        ];

        for (const roleData of builtInRoles) {
            const role = {
                ...roleData,
                state: this.roleStates.ACTIVE,
                permissions: new Set(roleData.permissions),
                deniedPermissions: new Set(),
                children: new Set(),
                groups: new Set(),
                constraints: {},
                attributes: {},
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
                    assignable: true,
                    modifiable: roleData.config?.modifiable !== false,
                    deletable: roleData.config?.deletable !== false,
                    temporal: false,
                    conditional: false
                }
            };

            this.roles.set(role.id, role);
        }
    }

    /**
     * Initialize role templates
     */
    initializeRoleTemplates() {
        // Department head template
        this.roleTemplates.set('department-head', {
            name: 'Department Head',
            description: 'Template for department head roles',
            basePermissions: [
                'department.view',
                'department.manage',
                'department.reports',
                'team.manage',
                'budget.view'
            ],
            constraints: {
                maxUsers: 1,
                requiresApproval: true
            },
            attributes: {
                level: 'management',
                scope: 'department'
            }
        });

        // Project manager template
        this.roleTemplates.set('project-manager', {
            name: 'Project Manager',
            description: 'Template for project manager roles',
            basePermissions: [
                'project.create',
                'project.update',
                'project.assign',
                'resource.allocate',
                'report.generate'
            ],
            constraints: {
                projectLimit: 10
            },
            attributes: {
                level: 'management',
                scope: 'project'
            }
        });

        // Developer template
        this.roleTemplates.set('developer', {
            name: 'Developer',
            description: 'Template for developer roles',
            basePermissions: [
                'code.read',
                'code.write',
                'repository.access',
                'issue.create',
                'issue.update'
            ],
            attributes: {
                level: 'contributor',
                scope: 'technical'
            }
        });

        // Auditor template
        this.roleTemplates.set('auditor', {
            name: 'Auditor',
            description: 'Template for auditor roles',
            basePermissions: [
                'audit.view',
                'report.view',
                'log.access',
                'compliance.check'
            ],
            deniedPermissions: [
                'data.modify',
                'config.change'
            ],
            attributes: {
                level: 'readonly',
                scope: 'compliance'
            }
        });
    }

    /**
     * Helper methods
     */

    validateRoleData(roleData) {
        if (!roleData.name) {
            throw new Error('Role name is required');
        }

        if (this.config.roleValidation) {
            // Check for duplicate names
            for (const role of this.roles.values()) {
                if (role.name === roleData.name && role.state !== this.roleStates.DELETED) {
                    throw new Error(`Role name already exists: ${roleData.name}`);
                }
            }

            // Validate permissions count
            if (roleData.permissions &&
                roleData.permissions.length > this.config.maxPermissionsPerRole) {
                throw new Error(`Too many permissions: ${roleData.permissions.length}`);
            }
        }
    }

    validateRoleUpdates(updates) {
        if (updates.permissions && updates.permissions.add) {
            const addCount = updates.permissions.add.length;
            if (addCount > this.config.maxPermissionsPerRole) {
                throw new Error(`Too many permissions to add: ${addCount}`);
            }
        }
    }

    calculateExpiration(roleData) {
        if (roleData.expirationDate) {
            return roleData.expirationDate;
        }

        if (roleData.temporal || this.config.roleExpiration) {
            const expirationTime = Date.now() + this.config.defaultExpiration;
            return new Date(expirationTime).toISOString();
        }

        return null;
    }

    async checkRoleConflicts(role) {
        const conflicts = [];

        // Check mutual exclusion conflicts
        for (const [conflictRoleId, conflictTypes] of this.roleConflicts.entries()) {
            if (conflictTypes.has('mutual-exclusion')) {
                // Check if user has conflicting role
                conflicts.push(conflictRoleId);
            }
        }

        // Check permission conflicts
        for (const perm of role.permissions) {
            for (const otherRole of this.roles.values()) {
                if (otherRole.id !== role.id &&
                    otherRole.deniedPermissions.has(perm)) {
                    conflicts.push(`Permission conflict with ${otherRole.name}`);
                }
            }
        }

        if (conflicts.length > 0) {
            this.statistics.conflictsDetected++;
        }

        return {
            hasConflicts: conflicts.length > 0,
            conflicts
        };
    }

    async establishHierarchy(childId, parentId) {
        const parent = this.roles.get(parentId);
        if (!parent) {
            throw new Error(`Parent role not found: ${parentId}`);
        }

        const child = this.roles.get(childId);
        if (!child) {
            throw new Error(`Child role not found: ${childId}`);
        }

        // Check for circular dependency
        if (await this.wouldCreateCycle(childId, parentId)) {
            throw new Error('Hierarchy would create a cycle');
        }

        // Check hierarchy depth
        const depth = await this.calculateHierarchyDepth(parentId);
        if (depth >= this.config.maxHierarchyDepth) {
            throw new Error(`Maximum hierarchy depth exceeded: ${depth}`);
        }

        // Establish relationship
        parent.children.add(childId);
        child.parent = parentId;

        // Update hierarchy map
        if (!this.roleHierarchy.has(parentId)) {
            this.roleHierarchy.set(parentId, new Set());
        }
        this.roleHierarchy.get(parentId).add(childId);
    }

    async wouldCreateCycle(childId, parentId) {
        const visited = new Set();

        const checkCycle = (roleId) => {
            if (roleId === childId) return true;
            if (visited.has(roleId)) return false;

            visited.add(roleId);

            const role = this.roles.get(roleId);
            if (role && role.parent) {
                return checkCycle(role.parent);
            }

            return false;
        };

        return checkCycle(parentId);
    }

    async calculateHierarchyDepth(roleId) {
        let depth = 0;
        let current = this.roles.get(roleId);

        while (current && current.parent) {
            depth++;
            current = this.roles.get(current.parent);

            if (depth > this.config.maxHierarchyDepth) {
                break;
            }
        }

        return depth;
    }

    async applyRoleTemplate(role, templateId) {
        const template = this.roleTemplates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        // Apply base permissions
        if (template.basePermissions) {
            for (const perm of template.basePermissions) {
                role.permissions.add(perm);
            }
        }

        // Apply denied permissions
        if (template.deniedPermissions) {
            for (const perm of template.deniedPermissions) {
                role.deniedPermissions.add(perm);
            }
        }

        // Apply constraints
        if (template.constraints) {
            role.constraints = { ...role.constraints, ...template.constraints };
        }

        // Apply attributes
        if (template.attributes) {
            role.attributes = { ...role.attributes, ...template.attributes };
        }

        role.metadata.template = templateId;
    }

    async scheduleRoleActivation(roleId, activationTime) {
        const delay = new Date(activationTime).getTime() - Date.now();

        if (delay > 0) {
            setTimeout(() => {
                const role = this.roles.get(roleId);
                if (role) {
                    role.state = this.roleStates.ACTIVE;
                    this.statistics.activeRoles++;
                    this.emit('roleActivated', { roleId });
                }
            }, delay);

            this.roleSchedule.set(roleId, {
                type: 'activation',
                scheduledTime: activationTime
            });
        }
    }

    async scheduleRoleExpiration(roleId, expirationTime) {
        const delay = new Date(expirationTime).getTime() - Date.now();

        if (delay > 0) {
            setTimeout(() => {
                const role = this.roles.get(roleId);
                if (role) {
                    role.state = this.roleStates.EXPIRED;
                    this.statistics.activeRoles--;
                    this.statistics.expiredRoles++;
                    this.emit('roleExpired', { roleId });
                }
            }, delay);

            this.roleSchedule.set(roleId, {
                type: 'expiration',
                scheduledTime: expirationTime
            });
        }
    }

    async getRoleAssignments(roleId) {
        const assignments = [];

        for (const [userId, userRoles] of this.roleAssignments.entries()) {
            if (userRoles.has(roleId)) {
                assignments.push({
                    userId,
                    roleId,
                    assignedAt: userRoles.get(roleId).assignedAt
                });
            }
        }

        return assignments;
    }

    async handleRoleDeletionHierarchy(roleId, options) {
        const role = this.roles.get(roleId);

        // Update parent's children
        if (role.parent) {
            const parent = this.roles.get(role.parent);
            if (parent) {
                parent.children.delete(roleId);
            }
        }

        // Handle children
        if (role.children.size > 0) {
            if (options.cascadeDelete) {
                // Delete all children
                for (const childId of role.children) {
                    await this.deleteRole(childId, options);
                }
            } else if (options.orphanChildren) {
                // Remove parent reference from children
                for (const childId of role.children) {
                    const child = this.roles.get(childId);
                    if (child) {
                        child.parent = null;
                    }
                }
            } else if (options.reassignTo) {
                // Reassign children to another parent
                for (const childId of role.children) {
                    const child = this.roles.get(childId);
                    if (child) {
                        child.parent = options.reassignTo;
                        const newParent = this.roles.get(options.reassignTo);
                        if (newParent) {
                            newParent.children.add(childId);
                        }
                    }
                }
            }
        }
    }

    indexRole(role) {
        // Index by various attributes for fast lookup
        // This would typically involve more sophisticated indexing
    }

    recordRoleHistory(roleId, action, details) {
        if (!this.roleHistory.has(roleId)) {
            this.roleHistory.set(roleId, []);
        }

        const history = this.roleHistory.get(roleId);
        history.push({
            action,
            details,
            timestamp: new Date().toISOString()
        });

        // Keep only last 100 entries
        if (history.length > 100) {
            history.shift();
        }
    }

    clearRoleCache() {
        if (this.config.cacheEnabled) {
            this.roleCache.clear();
        }
    }

    scheduleCacheExpiry(key) {
        setTimeout(() => {
            this.roleCache.delete(key);
        }, this.config.cacheTTL);
    }

    sortRoles(roles, sortBy, sortOrder = 'asc') {
        return roles.sort((a, b) => {
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

    setupExpirationMonitoring() {
        setInterval(() => {
            const now = Date.now();

            for (const role of this.roles.values()) {
                if (role.expirationDate &&
                    new Date(role.expirationDate).getTime() < now &&
                    role.state === this.roleStates.ACTIVE) {

                    role.state = this.roleStates.EXPIRED;
                    this.statistics.activeRoles--;
                    this.statistics.expiredRoles++;
                    this.emit('roleExpired', { roleId: role.id });
                }
            }
        }, 60000); // Check every minute
    }

    setupCacheCleanup() {
        setInterval(() => {
            this.roleCache.clear();
        }, this.config.cacheTTL);
    }

    setupRoleScheduling() {
        // Set up role scheduling system for temporal roles
    }

    async loadPersistedRoles() {
        // Load roles from persistent storage
        // This would typically involve database operations
    }

    generateRoleId() {
        return `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheSize: this.roleCache.size,
            hierarchyDepth: this.calculateMaxHierarchyDepth(),
            templateCount: this.roleTemplates.size
        };
    }

    calculateMaxHierarchyDepth() {
        let maxDepth = 0;

        for (const role of this.roles.values()) {
            if (!role.parent) {
                const depth = this.calculateBranchDepth(role.id);
                maxDepth = Math.max(maxDepth, depth);
            }
        }

        return maxDepth;
    }

    calculateBranchDepth(roleId, depth = 0) {
        const role = this.roles.get(roleId);
        if (!role || role.children.size === 0) {
            return depth;
        }

        let maxChildDepth = depth;
        for (const childId of role.children) {
            const childDepth = this.calculateBranchDepth(childId, depth + 1);
            maxChildDepth = Math.max(maxChildDepth, childDepth);
        }

        return maxChildDepth;
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.roleCache.clear();
        this.emit('shutdown');
    }
}

module.exports = RoleService;
