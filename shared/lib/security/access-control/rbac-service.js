const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * RBACService - Role-Based Access Control service
 * Manages roles, permissions, and access control decisions
 */
class RBACService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            strictMode: config.strictMode || false,
            hierarchical: config.hierarchical !== false,
            dynamic: config.dynamic || false,
            contextual: config.contextual !== false,
            defaultDeny: config.defaultDeny !== false,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            maxRoleDepth: config.maxRoleDepth || 10,
            auditEnabled: config.auditEnabled !== false,
            conflictResolution: config.conflictResolution || 'deny', // 'deny', 'allow', 'priority'
            sessionBased: config.sessionBased !== false
        };

        this.roles = new Map();
        this.permissions = new Map();
        this.assignments = new Map(); // user -> roles
        this.resources = new Map();
        this.policies = new Map();
        this.sessions = new Map();
        this.cache = new Map();

        this.hierarchyGraph = new Map(); // role inheritance
        this.delegations = new Map(); // temporary permissions
        this.constraints = new Map(); // role constraints
        this.separationOfDuties = new Map(); // SoD rules

        this.statistics = {
            totalRoles: 0,
            totalPermissions: 0,
            totalAssignments: 0,
            accessChecks: 0,
            grants: 0,
            denials: 0,
            cacheHits: 0,
            cacheMisses: 0,
            conflicts: 0
        };

        this.builtInRoles = {
            SUPER_ADMIN: {
                name: 'super_admin',
                description: 'Full system access',
                permissions: ['*'],
                priority: 1000
            },
            ADMIN: {
                name: 'admin',
                description: 'Administrative access',
                permissions: ['admin.*'],
                priority: 900
            },
            USER: {
                name: 'user',
                description: 'Standard user access',
                permissions: ['user.*'],
                priority: 100
            },
            GUEST: {
                name: 'guest',
                description: 'Guest access',
                permissions: ['public.*'],
                priority: 10
            }
        };

        this.operationTypes = {
            CREATE: 'create',
            READ: 'read',
            UPDATE: 'update',
            DELETE: 'delete',
            EXECUTE: 'execute',
            APPROVE: 'approve',
            SHARE: 'share',
            EXPORT: 'export'
        };
    }

    /**
     * Initialize RBAC service
     */
    async initialize() {
        try {
            // Initialize built-in roles
            for (const [key, roleData] of Object.entries(this.builtInRoles)) {
                await this.createRole({
                    id: key.toLowerCase(),
                    ...roleData,
                    builtin: true
                });
            }

            // Set up cache cleanup
            if (this.config.cacheEnabled) {
                this.setupCacheCleanup();
            }

            this.emit('initialized');

        } catch (error) {
            this.emit('error', error);
            throw new Error(`RBAC initialization failed: ${error.message}`);
        }
    }

    /**
     * Create a new role
     * @param {object} roleData - Role data
     * @returns {Promise<object>} Created role
     */
    async createRole(roleData) {
        try {
            const role = {
                id: roleData.id || this.generateRoleId(),
                name: roleData.name,
                description: roleData.description,
                permissions: new Set(roleData.permissions || []),
                priority: roleData.priority || 100,
                active: roleData.active !== false,
                builtin: roleData.builtin || false,
                constraints: roleData.constraints || {},
                metadata: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    createdBy: roleData.createdBy || 'system',
                    version: 1
                }
            };

            // Validate role
            this.validateRole(role);

            // Check for conflicts
            if (this.config.strictMode) {
                this.checkRoleConflicts(role);
            }

            // Store role
            this.roles.set(role.id, role);
            this.statistics.totalRoles++;

            // Set up hierarchy if parent specified
            if (roleData.parent) {
                this.addRoleHierarchy(role.id, roleData.parent);
            }

            this.emit('roleCreated', role);

            return {
                id: role.id,
                name: role.name,
                permissions: Array.from(role.permissions)
            };

        } catch (error) {
            throw new Error(`Failed to create role: ${error.message}`);
        }
    }

    /**
     * Assign role to user
     * @param {string} userId - User ID
     * @param {string} roleId - Role ID
     * @param {object} options - Assignment options
     * @returns {Promise<object>} Assignment result
     */
    async assignRole(userId, roleId, options = {}) {
        try {
            const role = this.roles.get(roleId);
            if (!role) {
                throw new Error(`Role not found: ${roleId}`);
            }

            // Check separation of duties
            if (this.config.strictMode) {
                await this.checkSeparationOfDuties(userId, roleId);
            }

            // Get or create user assignments
            if (!this.assignments.has(userId)) {
                this.assignments.set(userId, {
                    roles: new Set(),
                    directPermissions: new Set(),
                    delegations: new Map(),
                    constraints: {}
                });
            }

            const userAssignments = this.assignments.get(userId);

            // Check if already assigned
            if (userAssignments.roles.has(roleId)) {
                return { success: false, message: 'Role already assigned' };
            }

            // Add role
            userAssignments.roles.add(roleId);

            // Add constraints if specified
            if (options.constraints) {
                userAssignments.constraints[roleId] = options.constraints;
            }

            // Set expiration if temporary
            if (options.expiresAt) {
                this.scheduleDelegationExpiry(userId, roleId, options.expiresAt);
            }

            // Clear cache for user
            this.clearUserCache(userId);

            this.statistics.totalAssignments++;

            this.emit('roleAssigned', { userId, roleId });

            return {
                success: true,
                userId,
                roleId,
                effectivePermissions: await this.getUserPermissions(userId)
            };

        } catch (error) {
            throw new Error(`Failed to assign role: ${error.message}`);
        }
    }

    /**
     * Check access permission
     * @param {object} subject - Subject (user/service)
     * @param {object} resource - Resource to access
     * @param {string} action - Action to perform
     * @param {object} context - Additional context
     * @returns {Promise<object>} Access decision
     */
    async checkAccess(subject, resource, action, context = {}) {
        const startTime = Date.now();
        this.statistics.accessChecks++;

        try {
            // Check cache first
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(subject, resource, action, context);
                if (this.cache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.cache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            // Build access decision
            const decision = {
                granted: false,
                subject: subject.id || subject,
                resource: resource.id || resource,
                action,
                timestamp: new Date().toISOString(),
                reasons: [],
                appliedPolicies: [],
                processingTime: 0
            };

            // Get user's effective permissions
            const permissions = await this.getUserPermissions(subject.id || subject);

            // Check direct permission match
            const permissionString = this.buildPermissionString(resource, action);
            if (this.hasPermission(permissions, permissionString)) {
                decision.granted = true;
                decision.reasons.push('Direct permission match');
            }

            // Check wildcard permissions
            if (!decision.granted && this.hasWildcardPermission(permissions, resource, action)) {
                decision.granted = true;
                decision.reasons.push('Wildcard permission match');
            }

            // Check contextual permissions
            if (this.config.contextual && !decision.granted) {
                const contextualResult = await this.checkContextualPermission(
                    subject, resource, action, context
                );
                if (contextualResult.granted) {
                    decision.granted = true;
                    decision.reasons.push('Contextual permission granted');
                    decision.appliedPolicies.push(...contextualResult.policies);
                }
            }

            // Check dynamic permissions
            if (this.config.dynamic && !decision.granted) {
                const dynamicResult = await this.checkDynamicPermission(
                    subject, resource, action, context
                );
                if (dynamicResult.granted) {
                    decision.granted = true;
                    decision.reasons.push('Dynamic permission granted');
                }
            }

            // Apply policies
            const policyResult = await this.applyPolicies(subject, resource, action, context);
            if (policyResult.deny) {
                decision.granted = false;
                decision.reasons.push(`Policy denial: ${policyResult.reason}`);
                decision.appliedPolicies.push(...policyResult.policies);
            }

            // Default deny if configured
            if (!decision.granted && this.config.defaultDeny) {
                decision.reasons.push('Default deny policy');
            }

            decision.processingTime = Date.now() - startTime;

            // Update statistics
            if (decision.granted) {
                this.statistics.grants++;
            } else {
                this.statistics.denials++;
            }

            // Cache decision
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(subject, resource, action, context);
                this.cache.set(cacheKey, decision);
                this.scheduleCacheExpiry(cacheKey);
            }

            // Audit access check
            if (this.config.auditEnabled) {
                this.emit('accessChecked', decision);
            }

            return decision;

        } catch (error) {
            throw new Error(`Access check failed: ${error.message}`);
        }
    }

    /**
     * Get user's effective permissions
     * @param {string} userId - User ID
     * @returns {Promise<Set>} Set of permissions
     */
    async getUserPermissions(userId) {
        const permissions = new Set();
        const userAssignments = this.assignments.get(userId);

        if (!userAssignments) {
            return permissions;
        }

        // Add direct permissions
        for (const permission of userAssignments.directPermissions) {
            permissions.add(permission);
        }

        // Add role permissions
        const processedRoles = new Set();
        for (const roleId of userAssignments.roles) {
            await this.collectRolePermissions(roleId, permissions, processedRoles);
        }

        // Add delegation permissions
        for (const [delegationId, delegation] of userAssignments.delegations) {
            if (!delegation.expired) {
                for (const permission of delegation.permissions) {
                    permissions.add(permission);
                }
            }
        }

        // Apply constraints
        return this.applyPermissionConstraints(permissions, userAssignments.constraints);
    }

    /**
     * Collect permissions from role and its hierarchy
     * @param {string} roleId - Role ID
     * @param {Set} permissions - Permission set to populate
     * @param {Set} processedRoles - Already processed roles
     */
    async collectRolePermissions(roleId, permissions, processedRoles) {
        if (processedRoles.has(roleId)) {
            return; // Avoid circular dependencies
        }

        processedRoles.add(roleId);
        const role = this.roles.get(roleId);

        if (!role || !role.active) {
            return;
        }

        // Add role's permissions
        for (const permission of role.permissions) {
            permissions.add(permission);
        }

        // Process parent roles if hierarchical
        if (this.config.hierarchical && this.hierarchyGraph.has(roleId)) {
            const parents = this.hierarchyGraph.get(roleId);
            for (const parentId of parents) {
                await this.collectRolePermissions(parentId, permissions, processedRoles);
            }
        }
    }

    /**
     * Create a new permission
     * @param {object} permissionData - Permission data
     * @returns {Promise<object>} Created permission
     */
    async createPermission(permissionData) {
        const permission = {
            id: permissionData.id || this.generatePermissionId(),
            name: permissionData.name,
            resource: permissionData.resource,
            actions: new Set(permissionData.actions || []),
            conditions: permissionData.conditions || {},
            description: permissionData.description,
            metadata: {
                created: new Date().toISOString(),
                createdBy: permissionData.createdBy || 'system'
            }
        };

        this.permissions.set(permission.id, permission);
        this.statistics.totalPermissions++;

        this.emit('permissionCreated', permission);

        return permission;
    }

    /**
     * Create or update policy
     * @param {object} policyData - Policy data
     * @returns {Promise<object>} Policy
     */
    async createPolicy(policyData) {
        const policy = {
            id: policyData.id || this.generatePolicyId(),
            name: policyData.name,
            effect: policyData.effect, // 'allow' or 'deny'
            subjects: new Set(policyData.subjects || []),
            resources: new Set(policyData.resources || []),
            actions: new Set(policyData.actions || []),
            conditions: policyData.conditions || {},
            priority: policyData.priority || 100,
            active: policyData.active !== false,
            metadata: {
                created: new Date().toISOString(),
                createdBy: policyData.createdBy || 'system'
            }
        };

        this.policies.set(policy.id, policy);

        this.emit('policyCreated', policy);

        return policy;
    }

    /**
     * Helper methods
     */

    validateRole(role) {
        if (!role.name) {
            throw new Error('Role name is required');
        }

        if (this.config.strictMode) {
            // Check for duplicate names
            for (const existing of this.roles.values()) {
                if (existing.name === role.name && existing.id !== role.id) {
                    throw new Error(`Role name already exists: ${role.name}`);
                }
            }
        }
    }

    checkRoleConflicts(role) {
        // Check for permission conflicts
        for (const permission of role.permissions) {
            for (const existingRole of this.roles.values()) {
                if (this.hasConflictingPermission(permission, existingRole.permissions)) {
                    this.statistics.conflicts++;
                    if (this.config.conflictResolution === 'deny') {
                        throw new Error(`Permission conflict detected: ${permission}`);
                    }
                }
            }
        }
    }

    async checkSeparationOfDuties(userId, roleId) {
        const sodRules = this.separationOfDuties.get(roleId);
        if (!sodRules) return;

        const userAssignments = this.assignments.get(userId);
        if (!userAssignments) return;

        for (const conflictingRole of sodRules) {
            if (userAssignments.roles.has(conflictingRole)) {
                throw new Error(`Separation of duties violation: Cannot assign ${roleId} with ${conflictingRole}`);
            }
        }
    }

    buildPermissionString(resource, action) {
        const resourceStr = typeof resource === 'string' ? resource : resource.type || resource.id;
        return `${resourceStr}:${action}`;
    }

    hasPermission(permissions, permissionString) {
        return permissions.has(permissionString) || permissions.has('*');
    }

    hasWildcardPermission(permissions, resource, action) {
        const resourceStr = typeof resource === 'string' ? resource : resource.type || resource.id;

        // Check various wildcard patterns
        const patterns = [
            `${resourceStr}:*`,
            `*:${action}`,
            `${resourceStr.split('.')[0]}.*:${action}`,
            `${resourceStr}.*`
        ];

        return patterns.some(pattern => permissions.has(pattern));
    }

    async checkContextualPermission(subject, resource, action, context) {
        const result = { granted: false, policies: [] };

        // Check time-based constraints
        if (context.time) {
            const now = new Date();
            const hour = now.getHours();

            // Example: Check business hours
            if (hour < 8 || hour > 18) {
                const permission = `${resource}:${action}:after-hours`;
                if (this.hasPermission(await this.getUserPermissions(subject.id), permission)) {
                    result.granted = true;
                    result.policies.push('after-hours-access');
                }
            }
        }

        // Check location-based constraints
        if (context.location) {
            const permission = `${resource}:${action}:${context.location}`;
            if (this.hasPermission(await this.getUserPermissions(subject.id), permission)) {
                result.granted = true;
                result.policies.push('location-based-access');
            }
        }

        // Check resource ownership
        if (context.owner && context.owner === subject.id) {
            const permission = `${resource}:${action}:owner`;
            if (this.hasPermission(await this.getUserPermissions(subject.id), permission)) {
                result.granted = true;
                result.policies.push('owner-access');
            }
        }

        return result;
    }

    async checkDynamicPermission(subject, resource, action, context) {
        // Implement dynamic permission evaluation
        // This could involve external service calls, database queries, etc.
        return { granted: false };
    }

    async applyPolicies(subject, resource, action, context) {
        const result = { deny: false, reason: null, policies: [] };

        // Evaluate each policy
        const applicablePolicies = [];
        for (const policy of this.policies.values()) {
            if (!policy.active) continue;

            const applies = this.policyApplies(policy, subject, resource, action, context);
            if (applies) {
                applicablePolicies.push(policy);
            }
        }

        // Sort by priority
        applicablePolicies.sort((a, b) => b.priority - a.priority);

        // Apply policies
        for (const policy of applicablePolicies) {
            result.policies.push(policy.id);

            if (policy.effect === 'deny') {
                result.deny = true;
                result.reason = policy.name;
                break; // Deny takes precedence
            }
        }

        return result;
    }

    policyApplies(policy, subject, resource, action, context) {
        // Check if policy applies to subject
        if (policy.subjects.size > 0) {
            const subjectId = subject.id || subject;
            if (!policy.subjects.has(subjectId) && !policy.subjects.has('*')) {
                return false;
            }
        }

        // Check if policy applies to resource
        if (policy.resources.size > 0) {
            const resourceId = resource.id || resource;
            if (!policy.resources.has(resourceId) && !policy.resources.has('*')) {
                return false;
            }
        }

        // Check if policy applies to action
        if (policy.actions.size > 0) {
            if (!policy.actions.has(action) && !policy.actions.has('*')) {
                return false;
            }
        }

        // Check conditions
        if (policy.conditions && Object.keys(policy.conditions).length > 0) {
            return this.evaluateConditions(policy.conditions, context);
        }

        return true;
    }

    evaluateConditions(conditions, context) {
        for (const [key, value] of Object.entries(conditions)) {
            if (context[key] !== value) {
                return false;
            }
        }
        return true;
    }

    applyPermissionConstraints(permissions, constraints) {
        // Apply any constraints to the permission set
        // This could involve removing certain permissions based on constraints
        return permissions;
    }

    hasConflictingPermission(permission, existingPermissions) {
        // Check for conflicts between permissions
        // This is a simplified implementation
        return false;
    }

    addRoleHierarchy(childId, parentId) {
        if (!this.hierarchyGraph.has(childId)) {
            this.hierarchyGraph.set(childId, new Set());
        }
        this.hierarchyGraph.get(childId).add(parentId);

        // Check for cycles
        if (this.hasHierarchyCycle(childId)) {
            this.hierarchyGraph.get(childId).delete(parentId);
            throw new Error('Role hierarchy cycle detected');
        }
    }

    hasHierarchyCycle(roleId, visited = new Set()) {
        if (visited.has(roleId)) {
            return true;
        }

        visited.add(roleId);

        const parents = this.hierarchyGraph.get(roleId);
        if (parents) {
            for (const parentId of parents) {
                if (this.hasHierarchyCycle(parentId, new Set(visited))) {
                    return true;
                }
            }
        }

        return false;
    }

    generateCacheKey(subject, resource, action, context) {
        const data = JSON.stringify({
            s: subject.id || subject,
            r: resource.id || resource,
            a: action,
            c: context
        });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    scheduleCacheExpiry(key) {
        setTimeout(() => {
            this.cache.delete(key);
        }, this.config.cacheTTL);
    }

    clearUserCache(userId) {
        // Clear cache entries for a specific user
        for (const [key, value] of this.cache.entries()) {
            if (value.subject === userId) {
                this.cache.delete(key);
            }
        }
    }

    scheduleDelegationExpiry(userId, roleId, expiresAt) {
        const timeout = new Date(expiresAt).getTime() - Date.now();
        if (timeout > 0) {
            setTimeout(() => {
                this.revokeRole(userId, roleId);
            }, timeout);
        }
    }

    setupCacheCleanup() {
        setInterval(() => {
            // Clear expired cache entries
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now - new Date(value.timestamp).getTime() > this.config.cacheTTL) {
                    this.cache.delete(key);
                }
            }
        }, this.config.cacheTTL);
    }

    generateRoleId() {
        return `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generatePermissionId() {
        return `perm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generatePolicyId() {
        return `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Revoke role from user
     * @param {string} userId - User ID
     * @param {string} roleId - Role ID
     * @returns {Promise<object>} Revocation result
     */
    async revokeRole(userId, roleId) {
        const userAssignments = this.assignments.get(userId);
        if (!userAssignments) {
            return { success: false, message: 'User has no assignments' };
        }

        if (!userAssignments.roles.has(roleId)) {
            return { success: false, message: 'Role not assigned to user' };
        }

        userAssignments.roles.delete(roleId);
        delete userAssignments.constraints[roleId];

        this.clearUserCache(userId);
        this.statistics.totalAssignments--;

        this.emit('roleRevoked', { userId, roleId });

        return { success: true, userId, roleId };
    }

    /**
     * Get all roles for a user
     * @param {string} userId - User ID
     * @returns {Promise<array>} User's roles
     */
    async getUserRoles(userId) {
        const userAssignments = this.assignments.get(userId);
        if (!userAssignments) {
            return [];
        }

        const roles = [];
        for (const roleId of userAssignments.roles) {
            const role = this.roles.get(roleId);
            if (role) {
                roles.push({
                    id: role.id,
                    name: role.name,
                    permissions: Array.from(role.permissions)
                });
            }
        }

        return roles;
    }

    /**
     * Get statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheSize: this.cache.size,
            sessionCount: this.sessions.size,
            hierarchyDepth: this.calculateMaxHierarchyDepth()
        };
    }

    calculateMaxHierarchyDepth() {
        let maxDepth = 0;

        for (const roleId of this.roles.keys()) {
            const depth = this.calculateRoleDepth(roleId);
            maxDepth = Math.max(maxDepth, depth);
        }

        return maxDepth;
    }

    calculateRoleDepth(roleId, visited = new Set()) {
        if (visited.has(roleId)) {
            return 0;
        }

        visited.add(roleId);

        const parents = this.hierarchyGraph.get(roleId);
        if (!parents || parents.size === 0) {
            return 1;
        }

        let maxParentDepth = 0;
        for (const parentId of parents) {
            const parentDepth = this.calculateRoleDepth(parentId, new Set(visited));
            maxParentDepth = Math.max(maxParentDepth, parentDepth);
        }

        return maxParentDepth + 1;
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.cache.clear();
        this.sessions.clear();
        this.emit('shutdown');
    }
}

module.exports = RBACService;
