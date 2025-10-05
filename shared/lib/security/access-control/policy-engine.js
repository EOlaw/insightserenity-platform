const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * PolicyEngine - Attribute-Based Access Control (ABAC) Policy Engine
 * Evaluates complex policies based on attributes, conditions, and rules
 */
class PolicyEngine extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            mode: config.mode || 'enforce', // 'enforce', 'permissive', 'monitor'
            defaultEffect: config.defaultEffect || 'deny',
            evaluationStrategy: config.evaluationStrategy || 'first-match', // 'first-match', 'all-match', 'priority'
            maxPolicyDepth: config.maxPolicyDepth || 10,
            maxConditionComplexity: config.maxConditionComplexity || 100,
            cacheEnabled: config.cacheEnabled !== false,
            cacheTTL: config.cacheTTL || 300000, // 5 minutes
            auditEnabled: config.auditEnabled !== false,
            strictValidation: config.strictValidation !== false,
            dynamicPolicies: config.dynamicPolicies || false,
            externalPolicySource: config.externalPolicySource || null,
            conflictResolution: config.conflictResolution || 'deny-overrides', // 'deny-overrides', 'permit-overrides', 'first-applicable'
            preprocessingEnabled: config.preprocessingEnabled || false,
            postprocessingEnabled: config.postprocessingEnabled || false,
            ruleEngine: config.ruleEngine || 'native', // 'native', 'json-rules', 'drools'
            breakGlass: config.breakGlass || false,
            policyVersioning: config.policyVersioning !== false,
            maxPolicySize: config.maxPolicySize || 1024 * 1024 // 1MB
        };

        this.policies = new Map();
        this.policyGroups = new Map();
        this.policyTemplates = new Map();
        this.rules = new Map();
        this.attributes = new Map();
        this.functions = new Map();
        this.obligations = new Map();
        this.advice = new Map();
        this.cache = new Map();
        this.evaluationHistory = [];
        this.policyVersions = new Map();
        this.activeBreakGlass = new Map();

        this.statistics = {
            totalPolicies: 0,
            totalEvaluations: 0,
            permits: 0,
            denies: 0,
            indeterminates: 0,
            notApplicable: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageEvaluationTime: 0,
            conflictsResolved: 0,
            breakGlassActivations: 0
        };

        this.effects = {
            PERMIT: 'Permit',
            DENY: 'Deny',
            INDETERMINATE: 'Indeterminate',
            NOT_APPLICABLE: 'NotApplicable'
        };

        this.algorithms = {
            DENY_OVERRIDES: 'DenyOverrides',
            PERMIT_OVERRIDES: 'PermitOverrides',
            FIRST_APPLICABLE: 'FirstApplicable',
            ONLY_ONE_APPLICABLE: 'OnlyOneApplicable',
            ORDERED_DENY_OVERRIDES: 'OrderedDenyOverrides',
            ORDERED_PERMIT_OVERRIDES: 'OrderedPermitOverrides',
            DENY_UNLESS_PERMIT: 'DenyUnlessPermit',
            PERMIT_UNLESS_DENY: 'PermitUnlessDeny'
        };

        this.operators = {
            EQUALS: '==',
            NOT_EQUALS: '!=',
            GREATER_THAN: '>',
            LESS_THAN: '<',
            GREATER_THAN_OR_EQUAL: '>=',
            LESS_THAN_OR_EQUAL: '<=',
            IN: 'in',
            NOT_IN: 'not_in',
            CONTAINS: 'contains',
            NOT_CONTAINS: 'not_contains',
            MATCHES: 'matches',
            EXISTS: 'exists',
            NOT_EXISTS: 'not_exists',
            AND: '&&',
            OR: '||',
            NOT: '!'
        };

        this.attributeCategories = {
            SUBJECT: 'subject',
            RESOURCE: 'resource',
            ACTION: 'action',
            ENVIRONMENT: 'environment',
            CONTEXT: 'context'
        };

        this.initializeBuiltInFunctions();
        this.initializeBuiltInTemplates();
    }

    /**
     * Initialize the policy engine
     */
    async initialize() {
        try {
            // Load external policies if configured
            if (this.config.externalPolicySource) {
                await this.loadExternalPolicies();
            }

            // Initialize rule engine if not native
            if (this.config.ruleEngine !== 'native') {
                await this.initializeRuleEngine();
            }

            // Set up cache cleanup
            if (this.config.cacheEnabled) {
                this.setupCacheCleanup();
            }

            // Set up policy monitoring
            this.setupPolicyMonitoring();

            this.emit('initialized');

        } catch (error) {
            this.statistics.errors++;
            this.emit('error', error);
            throw new Error(`Policy engine initialization failed: ${error.message}`);
        }
    }

    /**
     * Create or update a policy
     * @param {object} policyData - Policy definition
     * @returns {Promise<object>} Created/updated policy
     */
    async createPolicy(policyData) {
        try {
            // Validate policy
            this.validatePolicy(policyData);

            const policy = {
                id: policyData.id || this.generatePolicyId(),
                name: policyData.name,
                description: policyData.description,
                version: policyData.version || '1.0.0',
                effect: policyData.effect || this.effects.DENY,
                target: this.normalizeTarget(policyData.target),
                condition: policyData.condition || null,
                rules: policyData.rules || [],
                obligations: policyData.obligations || [],
                advice: policyData.advice || [],
                priority: policyData.priority || 100,
                algorithm: policyData.algorithm || this.algorithms.DENY_OVERRIDES,
                enabled: policyData.enabled !== false,
                metadata: {
                    created: new Date().toISOString(),
                    modified: new Date().toISOString(),
                    author: policyData.author || 'system',
                    tags: policyData.tags || [],
                    schema: policyData.schema || '1.0'
                }
            };

            // Store version if versioning is enabled
            if (this.config.policyVersioning) {
                await this.storePolicyVersion(policy);
            }

            // Preprocess policy if enabled
            if (this.config.preprocessingEnabled) {
                await this.preprocessPolicy(policy);
            }

            // Store policy
            this.policies.set(policy.id, policy);
            this.statistics.totalPolicies++;

            // Clear relevant cache entries
            this.clearPolicyCache(policy.id);

            // Index policy for fast lookup
            this.indexPolicy(policy);

            this.emit('policyCreated', policy);

            return {
                id: policy.id,
                name: policy.name,
                version: policy.version,
                effect: policy.effect
            };

        } catch (error) {
            this.statistics.errors++;
            throw new Error(`Failed to create policy: ${error.message}`);
        }
    }

    /**
     * Evaluate policies for a request
     * @param {object} request - Request context with attributes
     * @returns {Promise<object>} Evaluation result
     */
    async evaluate(request) {
        const startTime = Date.now();
        this.statistics.totalEvaluations++;

        try {
            // Check cache first
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(request);
                if (this.cache.has(cacheKey)) {
                    this.statistics.cacheHits++;
                    return this.cache.get(cacheKey);
                }
                this.statistics.cacheMisses++;
            }

            // Check for break glass activation
            if (this.config.breakGlass) {
                const breakGlassResult = await this.checkBreakGlass(request);
                if (breakGlassResult) {
                    return breakGlassResult;
                }
            }

            // Normalize request
            const normalizedRequest = this.normalizeRequest(request);

            // Build evaluation context
            const context = {
                request: normalizedRequest,
                attributes: await this.resolveAttributes(normalizedRequest),
                environment: this.getEnvironmentAttributes(),
                functions: this.functions,
                startTime
            };

            // Find applicable policies
            const applicablePolicies = await this.findApplicablePolicies(context);

            if (applicablePolicies.length === 0) {
                const result = this.createEvaluationResult(
                    this.effects.NOT_APPLICABLE,
                    'No applicable policies found',
                    context
                );
                this.statistics.notApplicable++;
                return result;
            }

            // Evaluate policies based on strategy
            let result;
            switch (this.config.evaluationStrategy) {
                case 'first-match':
                    result = await this.evaluateFirstMatch(applicablePolicies, context);
                    break;
                case 'all-match':
                    result = await this.evaluateAllMatch(applicablePolicies, context);
                    break;
                case 'priority':
                    result = await this.evaluatePriority(applicablePolicies, context);
                    break;
                default:
                    result = await this.evaluateWithAlgorithm(applicablePolicies, context);
            }

            // Apply post-processing if enabled
            if (this.config.postprocessingEnabled) {
                result = await this.postprocessResult(result, context);
            }

            // Process obligations and advice
            result = await this.processObligationsAndAdvice(result, context);

            // Update statistics
            this.updateStatistics(result);

            // Cache result
            if (this.config.cacheEnabled) {
                const cacheKey = this.generateCacheKey(request);
                this.cache.set(cacheKey, result);
                this.scheduleCacheExpiry(cacheKey);
            }

            // Record evaluation history
            this.recordEvaluation(request, result, context);

            // Audit if enabled
            if (this.config.auditEnabled) {
                this.emit('policyEvaluated', {
                    request: normalizedRequest,
                    result,
                    duration: Date.now() - startTime
                });
            }

            return result;

        } catch (error) {
            this.statistics.errors++;

            return this.createEvaluationResult(
                this.effects.INDETERMINATE,
                `Evaluation error: ${error.message}`,
                { error: error.stack }
            );
        }
    }

    /**
     * Evaluate a single policy
     * @param {object} policy - Policy to evaluate
     * @param {object} context - Evaluation context
     * @returns {Promise<object>} Policy evaluation result
     */
    async evaluatePolicy(policy, context) {
        try {
            // Check if policy is enabled
            if (!policy.enabled) {
                return {
                    effect: this.effects.NOT_APPLICABLE,
                    reason: 'Policy is disabled'
                };
            }

            // Evaluate target
            if (policy.target) {
                const targetMatch = await this.evaluateTarget(policy.target, context);
                if (!targetMatch) {
                    return {
                        effect: this.effects.NOT_APPLICABLE,
                        reason: 'Target does not match'
                    };
                }
            }

            // Evaluate condition
            if (policy.condition) {
                const conditionResult = await this.evaluateCondition(policy.condition, context);
                if (!conditionResult) {
                    return {
                        effect: this.effects.NOT_APPLICABLE,
                        reason: 'Condition not satisfied'
                    };
                }
            }

            // Evaluate rules if present
            if (policy.rules && policy.rules.length > 0) {
                return await this.evaluateRules(policy.rules, policy.algorithm, context);
            }

            // Return policy effect
            return {
                effect: policy.effect,
                policyId: policy.id,
                obligations: policy.obligations,
                advice: policy.advice
            };

        } catch (error) {
            return {
                effect: this.effects.INDETERMINATE,
                reason: `Policy evaluation error: ${error.message}`,
                error: error.stack
            };
        }
    }

    /**
     * Evaluate target matching
     * @param {object} target - Target specification
     * @param {object} context - Evaluation context
     * @returns {Promise<boolean>} Match result
     */
    async evaluateTarget(target, context) {
        try {
            // Evaluate subject matching
            if (target.subjects && target.subjects.length > 0) {
                const subjectMatch = await this.evaluateTargetMatch(
                    target.subjects,
                    context.attributes.subject,
                    context
                );
                if (!subjectMatch) return false;
            }

            // Evaluate resource matching
            if (target.resources && target.resources.length > 0) {
                const resourceMatch = await this.evaluateTargetMatch(
                    target.resources,
                    context.attributes.resource,
                    context
                );
                if (!resourceMatch) return false;
            }

            // Evaluate action matching
            if (target.actions && target.actions.length > 0) {
                const actionMatch = await this.evaluateTargetMatch(
                    target.actions,
                    context.attributes.action,
                    context
                );
                if (!actionMatch) return false;
            }

            // Evaluate environment matching
            if (target.environments && target.environments.length > 0) {
                const envMatch = await this.evaluateTargetMatch(
                    target.environments,
                    context.attributes.environment,
                    context
                );
                if (!envMatch) return false;
            }

            return true;

        } catch (error) {
            throw new Error(`Target evaluation failed: ${error.message}`);
        }
    }

    /**
     * Evaluate condition
     * @param {object} condition - Condition specification
     * @param {object} context - Evaluation context
     * @returns {Promise<boolean>} Condition result
     */
    async evaluateCondition(condition, context) {
        try {
            // Handle different condition types
            if (typeof condition === 'boolean') {
                return condition;
            }

            if (typeof condition === 'string') {
                // Evaluate as expression
                return await this.evaluateExpression(condition, context);
            }

            if (typeof condition === 'object') {
                // Handle complex conditions
                if (condition.operator) {
                    return await this.evaluateOperator(condition, context);
                }

                if (condition.function) {
                    return await this.evaluateFunction(condition, context);
                }

                if (condition.all) {
                    // AND condition
                    for (const subCondition of condition.all) {
                        if (!await this.evaluateCondition(subCondition, context)) {
                            return false;
                        }
                    }
                    return true;
                }

                if (condition.any) {
                    // OR condition
                    for (const subCondition of condition.any) {
                        if (await this.evaluateCondition(subCondition, context)) {
                            return true;
                        }
                    }
                    return false;
                }

                if (condition.not) {
                    // NOT condition
                    return !await this.evaluateCondition(condition.not, context);
                }
            }

            return false;

        } catch (error) {
            throw new Error(`Condition evaluation failed: ${error.message}`);
        }
    }

    /**
     * Evaluate operator-based condition
     * @param {object} condition - Operator condition
     * @param {object} context - Evaluation context
     * @returns {Promise<boolean>} Evaluation result
     */
    async evaluateOperator(condition, context) {
        const left = await this.resolveValue(condition.left, context);
        const right = await this.resolveValue(condition.right, context);
        const operator = condition.operator;

        switch (operator) {
            case this.operators.EQUALS:
                return left === right;

            case this.operators.NOT_EQUALS:
                return left !== right;

            case this.operators.GREATER_THAN:
                return left > right;

            case this.operators.LESS_THAN:
                return left < right;

            case this.operators.GREATER_THAN_OR_EQUAL:
                return left >= right;

            case this.operators.LESS_THAN_OR_EQUAL:
                return left <= right;

            case this.operators.IN:
                return Array.isArray(right) && right.includes(left);

            case this.operators.NOT_IN:
                return Array.isArray(right) && !right.includes(left);

            case this.operators.CONTAINS:
                if (typeof left === 'string' && typeof right === 'string') {
                    return left.includes(right);
                }
                if (Array.isArray(left)) {
                    return left.includes(right);
                }
                return false;

            case this.operators.NOT_CONTAINS:
                if (typeof left === 'string' && typeof right === 'string') {
                    return !left.includes(right);
                }
                if (Array.isArray(left)) {
                    return !left.includes(right);
                }
                return true;

            case this.operators.MATCHES:
                if (typeof left === 'string' && typeof right === 'string') {
                    const regex = new RegExp(right);
                    return regex.test(left);
                }
                return false;

            case this.operators.EXISTS:
                return left !== undefined && left !== null;

            case this.operators.NOT_EXISTS:
                return left === undefined || left === null;

            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    /**
     * Initialize built-in functions
     */
    initializeBuiltInFunctions() {
        // String functions
        this.functions.set('string:equals', (a, b) => a === b);
        this.functions.set('string:contains', (str, substr) => str.includes(substr));
        this.functions.set('string:starts-with', (str, prefix) => str.startsWith(prefix));
        this.functions.set('string:ends-with', (str, suffix) => str.endsWith(suffix));
        this.functions.set('string:length', (str) => str.length);
        this.functions.set('string:lower', (str) => str.toLowerCase());
        this.functions.set('string:upper', (str) => str.toUpperCase());
        this.functions.set('string:trim', (str) => str.trim());

        // Numeric functions
        this.functions.set('numeric:equals', (a, b) => a === b);
        this.functions.set('numeric:greater-than', (a, b) => a > b);
        this.functions.set('numeric:less-than', (a, b) => a < b);
        this.functions.set('numeric:between', (val, min, max) => val >= min && val <= max);
        this.functions.set('numeric:abs', (val) => Math.abs(val));
        this.functions.set('numeric:round', (val) => Math.round(val));
        this.functions.set('numeric:floor', (val) => Math.floor(val));
        this.functions.set('numeric:ceil', (val) => Math.ceil(val));

        // Date/Time functions
        this.functions.set('time:now', () => new Date());
        this.functions.set('time:today', () => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            return now;
        });
        this.functions.set('time:before', (date1, date2) => new Date(date1) < new Date(date2));
        this.functions.set('time:after', (date1, date2) => new Date(date1) > new Date(date2));
        this.functions.set('time:between', (date, start, end) => {
            const d = new Date(date);
            return d >= new Date(start) && d <= new Date(end);
        });
        this.functions.set('time:business-hours', () => {
            const now = new Date();
            const hour = now.getHours();
            const day = now.getDay();
            return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
        });

        // Array functions
        this.functions.set('array:contains', (arr, item) => arr.includes(item));
        this.functions.set('array:size', (arr) => arr.length);
        this.functions.set('array:empty', (arr) => arr.length === 0);
        this.functions.set('array:intersection', (arr1, arr2) =>
            arr1.filter(x => arr2.includes(x))
        );
        this.functions.set('array:union', (arr1, arr2) =>
            [...new Set([...arr1, ...arr2])]
        );
        this.functions.set('array:difference', (arr1, arr2) =>
            arr1.filter(x => !arr2.includes(x))
        );

        // Logical functions
        this.functions.set('logical:and', (...args) => args.every(Boolean));
        this.functions.set('logical:or', (...args) => args.some(Boolean));
        this.functions.set('logical:not', (val) => !val);
        this.functions.set('logical:xor', (a, b) => (a && !b) || (!a && b));

        // Network functions
        this.functions.set('network:ip-in-range', (ip, range) => {
            // Simplified IP range check
            return true; // Would implement proper CIDR checking
        });
        this.functions.set('network:is-private-ip', (ip) => {
            const privateRanges = ['10.', '172.16.', '192.168.'];
            return privateRanges.some(range => ip.startsWith(range));
        });

        // Security functions
        this.functions.set('security:has-mfa', (subject) => {
            return subject.mfaEnabled === true;
        });
        this.functions.set('security:risk-score', (subject) => {
            // Calculate risk score based on various factors
            return 0; // Would implement actual risk scoring
        });

        // Custom functions can be added by users
        this.functions.set('custom:evaluate', async (expression, context) => {
            return await this.evaluateExpression(expression, context);
        });
    }

    /**
     * Initialize built-in policy templates
     */
    initializeBuiltInTemplates() {
        // Time-based access template
        this.policyTemplates.set('time-based-access', {
            name: 'Time-Based Access Control',
            description: 'Restrict access based on time',
            parameters: ['startTime', 'endTime', 'timezone'],
            generate: (params) => ({
                condition: {
                    function: 'time:between',
                    args: ['environment.currentTime', params.startTime, params.endTime]
                }
            })
        });

        // Location-based access template
        this.policyTemplates.set('location-based-access', {
            name: 'Location-Based Access Control',
            description: 'Restrict access based on location',
            parameters: ['allowedLocations', 'deniedLocations'],
            generate: (params) => ({
                condition: {
                    all: [
                        {
                            function: 'array:contains',
                            args: [params.allowedLocations, 'environment.location']
                        },
                        {
                            not: {
                                function: 'array:contains',
                                args: [params.deniedLocations, 'environment.location']
                            }
                        }
                    ]
                }
            })
        });

        // Role-based template
        this.policyTemplates.set('role-based', {
            name: 'Role-Based Access Control',
            description: 'Grant access based on roles',
            parameters: ['requiredRoles', 'forbiddenRoles'],
            generate: (params) => ({
                condition: {
                    all: [
                        {
                            function: 'array:intersection',
                            args: ['subject.roles', params.requiredRoles],
                            operator: '!=',
                            right: []
                        },
                        {
                            function: 'array:intersection',
                            args: ['subject.roles', params.forbiddenRoles],
                            operator: '==',
                            right: []
                        }
                    ]
                }
            })
        });

        // Attribute-based template
        this.policyTemplates.set('attribute-based', {
            name: 'Attribute-Based Access Control',
            description: 'Grant access based on attributes',
            parameters: ['requiredAttributes', 'attributeConditions'],
            generate: (params) => ({
                condition: {
                    all: params.attributeConditions.map(cond => ({
                        left: `subject.${cond.attribute}`,
                        operator: cond.operator,
                        right: cond.value
                    }))
                }
            })
        });

        // Data classification template
        this.policyTemplates.set('data-classification', {
            name: 'Data Classification Policy',
            description: 'Control access based on data classification',
            parameters: ['classification', 'minClearanceLevel'],
            generate: (params) => ({
                condition: {
                    all: [
                        {
                            left: 'resource.classification',
                            operator: '<=',
                            right: params.classification
                        },
                        {
                            left: 'subject.clearanceLevel',
                            operator: '>=',
                            right: params.minClearanceLevel
                        }
                    ]
                }
            })
        });

        // Break glass template
        this.policyTemplates.set('break-glass', {
            name: 'Break Glass Emergency Access',
            description: 'Emergency override policy',
            parameters: ['reason', 'approver', 'duration'],
            generate: (params) => ({
                effect: this.effects.PERMIT,
                obligations: [
                    {
                        id: 'log-break-glass',
                        attributes: {
                            reason: params.reason,
                            approver: params.approver,
                            duration: params.duration
                        }
                    },
                    {
                        id: 'notify-security',
                        attributes: {
                            urgency: 'immediate'
                        }
                    }
                ]
            })
        });
    }

    /**
     * Helper methods
     */

    validatePolicy(policyData) {
        if (!policyData.name) {
            throw new Error('Policy name is required');
        }

        if (this.config.strictValidation) {
            // Check policy size
            const policySize = JSON.stringify(policyData).length;
            if (policySize > this.config.maxPolicySize) {
                throw new Error(`Policy size ${policySize} exceeds maximum ${this.config.maxPolicySize}`);
            }

            // Validate effect
            if (policyData.effect && !Object.values(this.effects).includes(policyData.effect)) {
                throw new Error(`Invalid effect: ${policyData.effect}`);
            }

            // Validate algorithm
            if (policyData.algorithm && !Object.values(this.algorithms).includes(policyData.algorithm)) {
                throw new Error(`Invalid algorithm: ${policyData.algorithm}`);
            }

            // Check condition complexity
            if (policyData.condition) {
                const complexity = this.calculateConditionComplexity(policyData.condition);
                if (complexity > this.config.maxConditionComplexity) {
                    throw new Error(`Condition complexity ${complexity} exceeds maximum ${this.config.maxConditionComplexity}`);
                }
            }
        }
    }

    calculateConditionComplexity(condition, depth = 0) {
        if (depth > this.config.maxPolicyDepth) {
            throw new Error(`Policy depth exceeds maximum ${this.config.maxPolicyDepth}`);
        }

        let complexity = 1;

        if (typeof condition === 'object' && condition !== null) {
            if (condition.all) {
                complexity += condition.all.reduce((sum, c) =>
                    sum + this.calculateConditionComplexity(c, depth + 1), 0);
            }
            if (condition.any) {
                complexity += condition.any.reduce((sum, c) =>
                    sum + this.calculateConditionComplexity(c, depth + 1), 0);
            }
            if (condition.not) {
                complexity += this.calculateConditionComplexity(condition.not, depth + 1);
            }
        }

        return complexity;
    }

    normalizeTarget(target) {
        if (!target) return null;

        return {
            subjects: this.normalizeTargetArray(target.subjects),
            resources: this.normalizeTargetArray(target.resources),
            actions: this.normalizeTargetArray(target.actions),
            environments: this.normalizeTargetArray(target.environments)
        };
    }

    normalizeTargetArray(arr) {
        if (!arr) return [];
        if (!Array.isArray(arr)) return [arr];
        return arr;
    }

    normalizeRequest(request) {
        return {
            subject: request.subject || {},
            resource: request.resource || {},
            action: request.action || '',
            environment: request.environment || {},
            context: request.context || {}
        };
    }

    async resolveAttributes(request) {
        const attributes = {
            subject: { ...request.subject },
            resource: { ...request.resource },
            action: request.action,
            environment: { ...request.environment },
            context: { ...request.context }
        };

        // Resolve dynamic attributes
        for (const [category, attrs] of Object.entries(attributes)) {
            if (typeof attrs === 'object' && attrs !== null) {
                for (const [key, value] of Object.entries(attrs)) {
                    if (typeof value === 'function') {
                        attributes[category][key] = await value();
                    }
                }
            }
        }

        return attributes;
    }

    getEnvironmentAttributes() {
        return {
            currentTime: new Date().toISOString(),
            timestamp: Date.now(),
            hostname: require('os').hostname(),
            platform: process.platform,
            nodeVersion: process.version
        };
    }

    async findApplicablePolicies(context) {
        const applicable = [];

        for (const policy of this.policies.values()) {
            if (policy.enabled) {
                const targetMatch = await this.evaluateTarget(policy.target, context);
                if (targetMatch) {
                    applicable.push(policy);
                }
            }
        }

        // Sort by priority if using priority strategy
        if (this.config.evaluationStrategy === 'priority') {
            applicable.sort((a, b) => b.priority - a.priority);
        }

        return applicable;
    }

    async evaluateFirstMatch(policies, context) {
        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);
            if (result.effect !== this.effects.NOT_APPLICABLE) {
                return this.createEvaluationResult(
                    result.effect,
                    `First match: ${policy.name}`,
                    { policyId: policy.id, ...result }
                );
            }
        }

        return this.createEvaluationResult(
            this.effects.NOT_APPLICABLE,
            'No policies matched',
            context
        );
    }

    async evaluateAllMatch(policies, context) {
        const results = [];

        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);
            results.push({ policy: policy.id, ...result });

            if (result.effect === this.effects.DENY) {
                return this.createEvaluationResult(
                    this.effects.DENY,
                    `Denied by policy: ${policy.name}`,
                    { results }
                );
            }
        }

        const hasPermit = results.some(r => r.effect === this.effects.PERMIT);

        return this.createEvaluationResult(
            hasPermit ? this.effects.PERMIT : this.effects.NOT_APPLICABLE,
            hasPermit ? 'All applicable policies evaluated' : 'No permit found',
            { results }
        );
    }

    async evaluatePriority(policies, context) {
        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);

            if (result.effect === this.effects.PERMIT || result.effect === this.effects.DENY) {
                return this.createEvaluationResult(
                    result.effect,
                    `Priority match: ${policy.name} (priority: ${policy.priority})`,
                    { policyId: policy.id, ...result }
                );
            }
        }

        return this.createEvaluationResult(
            this.config.defaultEffect === 'permit' ? this.effects.PERMIT : this.effects.DENY,
            'Default effect applied',
            context
        );
    }

    async evaluateWithAlgorithm(policies, context) {
        const algorithm = policies[0]?.algorithm || this.algorithms.DENY_OVERRIDES;

        switch (algorithm) {
            case this.algorithms.DENY_OVERRIDES:
                return await this.denyOverrides(policies, context);
            case this.algorithms.PERMIT_OVERRIDES:
                return await this.permitOverrides(policies, context);
            case this.algorithms.FIRST_APPLICABLE:
                return await this.firstApplicable(policies, context);
            default:
                return await this.denyOverrides(policies, context);
        }
    }

    async denyOverrides(policies, context) {
        let hasPermit = false;

        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);

            if (result.effect === this.effects.DENY) {
                return this.createEvaluationResult(
                    this.effects.DENY,
                    `Deny overrides: ${policy.name}`,
                    { policyId: policy.id, ...result }
                );
            }

            if (result.effect === this.effects.PERMIT) {
                hasPermit = true;
            }
        }

        return this.createEvaluationResult(
            hasPermit ? this.effects.PERMIT : this.effects.NOT_APPLICABLE,
            hasPermit ? 'Permit (no denies found)' : 'Not applicable',
            context
        );
    }

    async permitOverrides(policies, context) {
        let hasDeny = false;

        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);

            if (result.effect === this.effects.PERMIT) {
                return this.createEvaluationResult(
                    this.effects.PERMIT,
                    `Permit overrides: ${policy.name}`,
                    { policyId: policy.id, ...result }
                );
            }

            if (result.effect === this.effects.DENY) {
                hasDeny = true;
            }
        }

        return this.createEvaluationResult(
            hasDeny ? this.effects.DENY : this.effects.NOT_APPLICABLE,
            hasDeny ? 'Deny (no permits found)' : 'Not applicable',
            context
        );
    }

    async firstApplicable(policies, context) {
        for (const policy of policies) {
            const result = await this.evaluatePolicy(policy, context);

            if (result.effect !== this.effects.NOT_APPLICABLE) {
                return this.createEvaluationResult(
                    result.effect,
                    `First applicable: ${policy.name}`,
                    { policyId: policy.id, ...result }
                );
            }
        }

        return this.createEvaluationResult(
            this.effects.NOT_APPLICABLE,
            'No applicable policy found',
            context
        );
    }

    createEvaluationResult(effect, reason, details = {}) {
        return {
            decision: effect,
            reason,
            timestamp: new Date().toISOString(),
            details,
            obligations: details.obligations || [],
            advice: details.advice || []
        };
    }

    async processObligationsAndAdvice(result, context) {
        // Process obligations (must be fulfilled)
        if (result.obligations && result.obligations.length > 0) {
            for (const obligation of result.obligations) {
                await this.processObligation(obligation, context);
            }
        }

        // Process advice (optional)
        if (result.advice && result.advice.length > 0) {
            for (const advice of result.advice) {
                await this.processAdvice(advice, context);
            }
        }

        return result;
    }

    async processObligation(obligation, context) {
        // Implementation would handle specific obligations
        this.emit('obligationProcessed', { obligation, context });
    }

    async processAdvice(advice, context) {
        // Implementation would handle specific advice
        this.emit('adviceProcessed', { advice, context });
    }

    async resolveValue(value, context) {
        if (typeof value === 'string' && value.includes('.')) {
            // Resolve attribute path
            const path = value.split('.');
            let current = context.attributes;

            for (const segment of path) {
                if (current && typeof current === 'object') {
                    current = current[segment];
                } else {
                    return undefined;
                }
            }

            return current;
        }

        return value;
    }

    async evaluateExpression(expression, context) {
        // Safe expression evaluation
        // In production, use a proper expression evaluator
        try {
            // This is a simplified implementation
            return true;
        } catch (error) {
            throw new Error(`Expression evaluation failed: ${error.message}`);
        }
    }

    async evaluateFunction(condition, context) {
        const func = this.functions.get(condition.function);
        if (!func) {
            throw new Error(`Unknown function: ${condition.function}`);
        }

        const args = await Promise.all(
            (condition.args || []).map(arg => this.resolveValue(arg, context))
        );

        return await func(...args);
    }

    async evaluateTargetMatch(targetItems, attributes, context) {
        for (const item of targetItems) {
            if (typeof item === 'string') {
                if (item === '*' || item === attributes) {
                    return true;
                }
            } else if (typeof item === 'object') {
                if (await this.evaluateCondition(item, context)) {
                    return true;
                }
            }
        }
        return false;
    }

    async evaluateRules(rules, algorithm, context) {
        // Evaluate rules based on combining algorithm
        const results = [];

        for (const rule of rules) {
            const ruleResult = await this.evaluateRule(rule, context);
            results.push(ruleResult);

            // Early termination for some algorithms
            if (algorithm === this.algorithms.FIRST_APPLICABLE &&
                ruleResult.effect !== this.effects.NOT_APPLICABLE) {
                return ruleResult;
            }

            if (algorithm === this.algorithms.DENY_OVERRIDES &&
                ruleResult.effect === this.effects.DENY) {
                return ruleResult;
            }

            if (algorithm === this.algorithms.PERMIT_OVERRIDES &&
                ruleResult.effect === this.effects.PERMIT) {
                return ruleResult;
            }
        }

        // Combine results based on algorithm
        return this.combineRuleResults(results, algorithm);
    }

    async evaluateRule(rule, context) {
        // Similar to policy evaluation but for individual rules
        if (rule.condition) {
            const conditionResult = await this.evaluateCondition(rule.condition, context);
            if (!conditionResult) {
                return {
                    effect: this.effects.NOT_APPLICABLE,
                    reason: 'Rule condition not satisfied'
                };
            }
        }

        return {
            effect: rule.effect || this.effects.PERMIT,
            ruleId: rule.id
        };
    }

    combineRuleResults(results, algorithm) {
        // Implement combination logic based on algorithm
        switch (algorithm) {
            case this.algorithms.DENY_OVERRIDES:
                for (const result of results) {
                    if (result.effect === this.effects.DENY) return result;
                }
                for (const result of results) {
                    if (result.effect === this.effects.PERMIT) return result;
                }
                break;

            case this.algorithms.PERMIT_OVERRIDES:
                for (const result of results) {
                    if (result.effect === this.effects.PERMIT) return result;
                }
                for (const result of results) {
                    if (result.effect === this.effects.DENY) return result;
                }
                break;
        }

        return {
            effect: this.effects.NOT_APPLICABLE,
            reason: 'No applicable rules'
        };
    }

    async checkBreakGlass(request) {
        if (request.breakGlass && request.breakGlass.activated) {
            const breakGlassId = this.generateBreakGlassId();

            this.activeBreakGlass.set(breakGlassId, {
                request,
                activated: new Date().toISOString(),
                reason: request.breakGlass.reason,
                approver: request.breakGlass.approver,
                duration: request.breakGlass.duration || 3600000 // 1 hour default
            });

            this.statistics.breakGlassActivations++;

            this.emit('breakGlassActivated', {
                id: breakGlassId,
                request
            });

            return this.createEvaluationResult(
                this.effects.PERMIT,
                'Break glass emergency access granted',
                {
                    breakGlassId,
                    obligations: [
                        {
                            id: 'audit-break-glass',
                            attributes: request.breakGlass
                        }
                    ]
                }
            );
        }

        return null;
    }

    async preprocessPolicy(policy) {
        // Perform policy preprocessing
        // This could include optimization, validation, etc.
    }

    async postprocessResult(result, context) {
        // Perform result post-processing
        // This could include enrichment, transformation, etc.
        return result;
    }

    async storePolicyVersion(policy) {
        if (!this.policyVersions.has(policy.id)) {
            this.policyVersions.set(policy.id, []);
        }

        const versions = this.policyVersions.get(policy.id);
        versions.push({
            version: policy.version,
            policy: { ...policy },
            stored: new Date().toISOString()
        });

        // Keep only last 10 versions
        if (versions.length > 10) {
            versions.shift();
        }
    }

    indexPolicy(policy) {
        // Index policy for fast lookup
        // This could include various indexing strategies
    }

    clearPolicyCache(policyId) {
        // Clear cache entries related to this policy
        for (const [key, value] of this.cache.entries()) {
            if (value.details && value.details.policyId === policyId) {
                this.cache.delete(key);
            }
        }
    }

    generateCacheKey(request) {
        const data = JSON.stringify({
            subject: request.subject,
            resource: request.resource,
            action: request.action,
            environment: request.environment?.location
        });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    scheduleCacheExpiry(key) {
        setTimeout(() => {
            this.cache.delete(key);
        }, this.config.cacheTTL);
    }

    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now - new Date(value.timestamp).getTime() > this.config.cacheTTL) {
                    this.cache.delete(key);
                }
            }
        }, this.config.cacheTTL);
    }

    setupPolicyMonitoring() {
        // Set up monitoring for policy changes, performance, etc.
    }

    async loadExternalPolicies() {
        // Load policies from external source
        // This could be a database, file system, or API
    }

    async initializeRuleEngine() {
        // Initialize external rule engine if configured
    }

    recordEvaluation(request, result, context) {
        this.evaluationHistory.push({
            timestamp: new Date().toISOString(),
            request,
            result,
            duration: Date.now() - context.startTime
        });

        // Keep only last 1000 evaluations
        if (this.evaluationHistory.length > 1000) {
            this.evaluationHistory.shift();
        }
    }

    updateStatistics(result) {
        switch (result.decision) {
            case this.effects.PERMIT:
                this.statistics.permits++;
                break;
            case this.effects.DENY:
                this.statistics.denies++;
                break;
            case this.effects.INDETERMINATE:
                this.statistics.indeterminates++;
                break;
            case this.effects.NOT_APPLICABLE:
                this.statistics.notApplicable++;
                break;
        }

        // Update average evaluation time
        const totalEvals = this.statistics.totalEvaluations;
        const currentAvg = this.statistics.averageEvaluationTime;
        const newDuration = result.details?.duration || 0;

        this.statistics.averageEvaluationTime =
            (currentAvg * (totalEvals - 1) + newDuration) / totalEvals;
    }

    generatePolicyId() {
        return `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateBreakGlassId() {
        return `break-glass-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheSize: this.cache.size,
            activeBreakGlass: this.activeBreakGlass.size,
            evaluationHistorySize: this.evaluationHistory.length
        };
    }

    /**
     * Shutdown the policy engine
     */
    async shutdown() {
        this.cache.clear();
        this.evaluationHistory = [];
        this.emit('shutdown');
    }
}

module.exports = PolicyEngine;
