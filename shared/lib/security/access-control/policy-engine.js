'use strict';

/**
 * @fileoverview Dynamic policy evaluation engine for attribute-based access control
 * @module shared/lib/security/access-control/policy-engine
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/policy-model
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class PolicyEngine
 * @description Evaluates dynamic access control policies based on attributes and conditions
 */
class PolicyEngine {
  /**
   * @private
   * @static
   * @readonly
   */
  static #POLICY_EFFECTS = {
    ALLOW: 'allow',
    DENY: 'deny'
  };

  static #POLICY_TYPES = {
    RESOURCE: 'resource',
    IDENTITY: 'identity',
    CONTEXT: 'context',
    TIME: 'time',
    COMPOSITE: 'composite'
  };

  static #COMBINATION_ALGORITHMS = {
    DENY_OVERRIDES: 'deny-overrides',
    ALLOW_OVERRIDES: 'allow-overrides',
    FIRST_APPLICABLE: 'first-applicable',
    ONLY_ONE_APPLICABLE: 'only-one-applicable'
  };

  static #OPERATORS = {
    // Comparison
    EQUALS: 'equals',
    NOT_EQUALS: 'notEquals',
    GREATER_THAN: 'greaterThan',
    GREATER_THAN_OR_EQUAL: 'greaterThanOrEqual',
    LESS_THAN: 'lessThan',
    LESS_THAN_OR_EQUAL: 'lessThanOrEqual',
    
    // String
    CONTAINS: 'contains',
    NOT_CONTAINS: 'notContains',
    STARTS_WITH: 'startsWith',
    ENDS_WITH: 'endsWith',
    MATCHES: 'matches',
    
    // Array
    IN: 'in',
    NOT_IN: 'notIn',
    ANY_OF: 'anyOf',
    ALL_OF: 'allOf',
    
    // Existence
    EXISTS: 'exists',
    NOT_EXISTS: 'notExists',
    
    // Logical
    AND: 'and',
    OR: 'or',
    NOT: 'not'
  };

  static #ATTRIBUTE_SOURCES = {
    SUBJECT: 'subject',
    RESOURCE: 'resource',
    ACTION: 'action',
    ENVIRONMENT: 'environment',
    CONTEXT: 'context'
  };

  static #MAX_POLICY_DEPTH = 10;
  static #MAX_CONDITION_COMPLEXITY = 50;
  static #CACHE_TTL = 300000; // 5 minutes

  /**
   * Creates an instance of PolicyEngine
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {string} [options.combinationAlgorithm='deny-overrides'] - Policy combination algorithm
   * @param {boolean} [options.enableCache=true] - Enable policy evaluation cache
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [options.strictEvaluation=true] - Strict policy evaluation mode
   * @param {Object} [options.customFunctions={}] - Custom evaluation functions
   * @param {Object} [options.attributeResolvers={}] - Custom attribute resolvers
   */
  constructor(options = {}) {
    const {
      database,
      combinationAlgorithm = PolicyEngine.#COMBINATION_ALGORITHMS.DENY_OVERRIDES,
      enableCache = true,
      cacheTTL = PolicyEngine.#CACHE_TTL,
      strictEvaluation = true,
      customFunctions = {},
      attributeResolvers = {}
    } = options;

    this.database = database;
    this.combinationAlgorithm = combinationAlgorithm;
    this.enableCache = enableCache;
    this.cacheTTL = cacheTTL;
    this.strictEvaluation = strictEvaluation;

    // Initialize custom functions and resolvers
    this.customFunctions = { ...customFunctions };
    this.attributeResolvers = { ...attributeResolvers };

    // Initialize caches
    this.policyCache = new Map();
    this.evaluationCache = new Map();
    this.compiledPolicyCache = new Map();

    // Initialize in-memory storage
    this.inMemoryPolicies = new Map();
    this.inMemoryPolicySets = new Map();

    // Initialize built-in functions
    this.#initializeBuiltInFunctions();

    logger.info('PolicyEngine initialized', {
      combinationAlgorithm,
      enableCache,
      strictEvaluation,
      customFunctionsCount: Object.keys(customFunctions).length
    });
  }

  /**
   * Creates a new policy
   * @param {Object} policyData - Policy data
   * @param {string} policyData.name - Policy name
   * @param {string} [policyData.description] - Policy description
   * @param {string} [policyData.effect='allow'] - Policy effect
   * @param {Object} policyData.target - Policy target specification
   * @param {Object} [policyData.conditions] - Policy conditions
   * @param {number} [policyData.priority=100] - Policy priority
   * @param {Object} [policyData.metadata={}] - Additional metadata
   * @returns {Promise<Object>} Created policy
   * @throws {AppError} If creation fails
   */
  async createPolicy(policyData) {
    try {
      // Validate required fields
      if (!policyData.name || !policyData.target) {
        throw new AppError(
          'Policy name and target are required',
          400,
          'INVALID_POLICY_DATA'
        );
      }

      // Create policy object
      const policy = {
        id: this.#generatePolicyId(),
        name: policyData.name,
        description: policyData.description || '',
        effect: policyData.effect || PolicyEngine.#POLICY_EFFECTS.ALLOW,
        type: policyData.type || PolicyEngine.#POLICY_TYPES.RESOURCE,
        target: policyData.target,
        conditions: policyData.conditions || {},
        priority: policyData.priority || 100,
        active: true,
        metadata: {
          ...policyData.metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        }
      };

      // Validate policy
      this.#validatePolicy(policy);

      // Check for duplicates
      if (await this.#policyExists(policy.name)) {
        throw new AppError(
          'Policy already exists',
          409,
          'POLICY_EXISTS',
          { policyName: policy.name }
        );
      }

      // Compile policy
      const compiled = this.#compilePolicy(policy);
      policy.compiled = compiled;

      // Store policy
      if (this.database) {
        const PolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        await PolicyModel.create(policy);
      } else {
        this.inMemoryPolicies.set(policy.id, policy);
        this.inMemoryPolicies.set(policy.name, policy); // Also index by name
      }

      // Clear caches
      this.#clearCache();

      logger.info('Policy created', {
        policyId: policy.id,
        policyName: policy.name,
        effect: policy.effect
      });

      return policy;

    } catch (error) {
      logger.error('Policy creation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create policy',
        500,
        'POLICY_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Evaluates policies for a given context
   * @param {Object} context - Evaluation context
   * @param {Object} context.subject - Subject attributes
   * @param {string} context.resource - Resource identifier
   * @param {string} context.action - Action identifier
   * @param {Object} [context.environment={}] - Environment attributes
   * @returns {Promise<Object>} Evaluation result
   * @throws {AppError} If evaluation fails
   */
  async evaluate(context) {
    try {
      const startTime = Date.now();

      // Validate context
      this.#validateContext(context);

      // Check cache
      const cacheKey = this.#generateCacheKey(context);
      if (this.enableCache && this.evaluationCache.has(cacheKey)) {
        const cached = this.evaluationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.result;
        }
      }

      // Resolve all attributes
      const resolvedContext = await this.#resolveAttributes(context);

      // Find applicable policies
      const applicablePolicies = await this.#findApplicablePolicies(resolvedContext);

      if (applicablePolicies.length === 0) {
        const result = {
          decision: PolicyEngine.#POLICY_EFFECTS.DENY,
          reason: 'No applicable policies found',
          evaluationTime: Date.now() - startTime,
          appliedPolicies: []
        };

        this.#cacheResult(cacheKey, result);
        return result;
      }

      // Evaluate each applicable policy
      const evaluations = [];
      for (const policy of applicablePolicies) {
        const evaluation = await this.#evaluatePolicy(policy, resolvedContext);
        evaluations.push(evaluation);
      }

      // Combine results
      const decision = this.#combineDecisions(evaluations);

      // Build result
      const result = {
        decision: decision.effect,
        reason: decision.reason,
        evaluationTime: Date.now() - startTime,
        appliedPolicies: evaluations.map(e => ({
          id: e.policy.id,
          name: e.policy.name,
          effect: e.effect,
          matched: e.matched
        })),
        obligations: decision.obligations || [],
        advice: decision.advice || []
      };

      // Cache result
      this.#cacheResult(cacheKey, result);

      logger.debug('Policy evaluation completed', {
        decision: result.decision,
        policiesEvaluated: evaluations.length,
        evaluationTime: result.evaluationTime
      });

      return result;

    } catch (error) {
      logger.error('Policy evaluation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to evaluate policies',
        500,
        'POLICY_EVALUATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets a policy by ID or name
   * @param {string} policyIdentifier - Policy ID or name
   * @returns {Promise<Object|null>} Policy object or null
   * @throws {AppError} If retrieval fails
   */
  async getPolicy(policyIdentifier) {
    try {
      if (!policyIdentifier) {
        throw new AppError('Policy identifier is required', 400, 'INVALID_INPUT');
      }

      // Check cache
      if (this.enableCache && this.policyCache.has(policyIdentifier)) {
        const cached = this.policyCache.get(policyIdentifier);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.data;
        }
      }

      let policy;

      if (this.database) {
        const PolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        policy = await PolicyModel.findOne({
          $or: [
            { id: policyIdentifier },
            { name: policyIdentifier }
          ]
        });
      } else {
        policy = this.inMemoryPolicies.get(policyIdentifier);
      }

      // Cache result
      if (this.enableCache && policy) {
        this.policyCache.set(policyIdentifier, {
          data: policy,
          timestamp: Date.now()
        });
      }

      return policy || null;

    } catch (error) {
      logger.error('Policy retrieval failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to get policy',
        500,
        'POLICY_GET_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates a policy
   * @param {string} policyIdentifier - Policy ID or name
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated policy
   * @throws {AppError} If update fails
   */
  async updatePolicy(policyIdentifier, updates) {
    try {
      if (!policyIdentifier) {
        throw new AppError('Policy identifier is required', 400, 'INVALID_INPUT');
      }

      const policy = await this.getPolicy(policyIdentifier);
      if (!policy) {
        throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
      }

      // Prepare updated policy
      const updatedPolicy = {
        ...policy,
        ...updates,
        id: policy.id, // Prevent ID change
        metadata: {
          ...policy.metadata,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
          version: (policy.metadata.version || 0) + 1
        }
      };

      // Validate updated policy
      this.#validatePolicy(updatedPolicy);

      // Recompile policy
      const compiled = this.#compilePolicy(updatedPolicy);
      updatedPolicy.compiled = compiled;

      // Update storage
      if (this.database) {
        const PolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        await PolicyModel.updateOne({ id: policy.id }, updatedPolicy);
      } else {
        this.inMemoryPolicies.set(updatedPolicy.id, updatedPolicy);
        if (policy.name !== updatedPolicy.name) {
          this.inMemoryPolicies.delete(policy.name);
          this.inMemoryPolicies.set(updatedPolicy.name, updatedPolicy);
        }
      }

      // Clear caches
      this.#clearCache();

      logger.info('Policy updated', {
        policyId: policy.id,
        version: updatedPolicy.metadata.version
      });

      return updatedPolicy;

    } catch (error) {
      logger.error('Policy update failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to update policy',
        500,
        'POLICY_UPDATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Deletes a policy
   * @param {string} policyIdentifier - Policy ID or name
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deletePolicy(policyIdentifier) {
    try {
      if (!policyIdentifier) {
        throw new AppError('Policy identifier is required', 400, 'INVALID_INPUT');
      }

      const policy = await this.getPolicy(policyIdentifier);
      if (!policy) {
        throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
      }

      // Check if policy is in use
      const usage = await this.#checkPolicyUsage(policy.id);
      if (usage.inUse) {
        throw new AppError(
          'Cannot delete policy in use',
          409,
          'POLICY_IN_USE',
          { usage }
        );
      }

      // Delete policy
      if (this.database) {
        const PolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        await PolicyModel.deleteOne({ id: policy.id });
      } else {
        this.inMemoryPolicies.delete(policy.id);
        this.inMemoryPolicies.delete(policy.name);
      }

      // Clear caches
      this.#clearCache();

      logger.info('Policy deleted', { policyId: policy.id, policyName: policy.name });

      return {
        success: true,
        deletedPolicy: policy
      };

    } catch (error) {
      logger.error('Policy deletion failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to delete policy',
        500,
        'POLICY_DELETE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Lists policies with optional filtering
   * @param {Object} [options={}] - List options
   * @param {string} [options.type] - Filter by policy type
   * @param {string} [options.effect] - Filter by effect
   * @param {boolean} [options.active=true] - Include only active policies
   * @param {number} [options.limit=100] - Maximum results
   * @param {number} [options.offset=0] - Skip results
   * @returns {Promise<Object>} List results
   */
  async listPolicies(options = {}) {
    try {
      const {
        type,
        effect,
        active = true,
        limit = 100,
        offset = 0
      } = options;

      let policies;
      let total;

      if (this.database) {
        const PolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        const query = {};

        if (type) query.type = type;
        if (effect) query.effect = effect;
        if (active !== undefined) query.active = active;

        total = await PolicyModel.countDocuments(query);
        policies = await PolicyModel.find(query)
          .skip(offset)
          .limit(limit)
          .sort({ priority: -1, name: 1 });

      } else {
        policies = Array.from(this.inMemoryPolicies.values())
          .filter(policy => {
            // Deduplicate
            if (policy.id !== policy.name && this.inMemoryPolicies.has(policy.name)) {
              return false;
            }
            if (type && policy.type !== type) return false;
            if (effect && policy.effect !== effect) return false;
            if (active !== undefined && policy.active !== active) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.priority !== b.priority) {
              return b.priority - a.priority;
            }
            return a.name.localeCompare(b.name);
          });

        total = policies.length;
        policies = policies.slice(offset, offset + limit);
      }

      return {
        policies,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + policies.length < total
        }
      };

    } catch (error) {
      logger.error('Policy listing failed', error);

      throw new AppError(
        'Failed to list policies',
        500,
        'POLICY_LIST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a policy set
   * @param {Object} policySetData - Policy set data
   * @returns {Promise<Object>} Created policy set
   */
  async createPolicySet(policySetData) {
    try {
      if (!policySetData.name || !policySetData.policies) {
        throw new AppError(
          'Policy set name and policies are required',
          400,
          'INVALID_POLICY_SET_DATA'
        );
      }

      // Verify all policies exist
      for (const policyId of policySetData.policies) {
        const exists = await this.#policyExists(policyId);
        if (!exists) {
          throw new AppError(
            `Policy not found: ${policyId}`,
            404,
            'POLICY_NOT_FOUND'
          );
        }
      }

      const policySet = {
        id: this.#generatePolicyId('set'),
        name: policySetData.name,
        description: policySetData.description || '',
        policies: policySetData.policies,
        combinationAlgorithm: policySetData.combinationAlgorithm || this.combinationAlgorithm,
        target: policySetData.target || {},
        active: true,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        }
      };

      if (this.database) {
        const PolicySetModel = require('../../database/models/policy-set-model');
        await PolicySetModel.create(policySet);
      } else {
        this.inMemoryPolicySets.set(policySet.id, policySet);
        this.inMemoryPolicySets.set(policySet.name, policySet);
      }

      logger.info('Policy set created', {
        policySetId: policySet.id,
        policyCount: policySet.policies.length
      });

      return policySet;

    } catch (error) {
      logger.error('Policy set creation failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create policy set',
        500,
        'POLICY_SET_CREATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates policy configuration
   * @returns {Promise<Object>} Validation results
   */
  async validatePolicies() {
    try {
      const results = {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          total: 0,
          active: 0,
          inactive: 0,
          byType: {},
          byEffect: {},
          complexityIssues: []
        }
      };

      // Get all policies
      const { policies } = await this.listPolicies({ active: undefined });
      results.stats.total = policies.length;

      for (const policy of policies) {
        // Count statistics
        if (policy.active) {
          results.stats.active++;
        } else {
          results.stats.inactive++;
        }

        results.stats.byType[policy.type] = 
          (results.stats.byType[policy.type] || 0) + 1;
        
        results.stats.byEffect[policy.effect] = 
          (results.stats.byEffect[policy.effect] || 0) + 1;

        // Validate policy structure
        try {
          this.#validatePolicy(policy);
        } catch (error) {
          results.valid = false;
          results.errors.push({
            policyId: policy.id,
            error: error.message
          });
        }

        // Check complexity
        const complexity = this.#calculatePolicyComplexity(policy);
        if (complexity > PolicyEngine.#MAX_CONDITION_COMPLEXITY) {
          results.warnings.push({
            policyId: policy.id,
            warning: 'Policy exceeds complexity threshold',
            complexity
          });
          results.stats.complexityIssues.push({
            policyId: policy.id,
            complexity
          });
        }

        // Check for conflicts
        const conflicts = await this.#checkPolicyConflicts(policy);
        if (conflicts.length > 0) {
          results.warnings.push({
            policyId: policy.id,
            warning: 'Policy conflicts detected',
            conflicts
          });
        }
      }

      logger.info('Policy validation completed', {
        valid: results.valid,
        errorCount: results.errors.length,
        warningCount: results.warnings.length
      });

      return results;

    } catch (error) {
      logger.error('Policy validation failed', error);

      throw new AppError(
        'Failed to validate policies',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Tests a policy with sample context
   * @param {string} policyIdentifier - Policy ID or name
   * @param {Object} testContext - Test context
   * @returns {Promise<Object>} Test results
   */
  async testPolicy(policyIdentifier, testContext) {
    try {
      const policy = await this.getPolicy(policyIdentifier);
      if (!policy) {
        throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
      }

      // Validate test context
      this.#validateContext(testContext);

      // Resolve attributes
      const resolvedContext = await this.#resolveAttributes(testContext);

      // Check if policy applies
      const targetMatch = this.#evaluateTarget(policy.target, resolvedContext);

      if (!targetMatch) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          applicable: false,
          reason: 'Policy target does not match context'
        };
      }

      // Evaluate policy
      const evaluation = await this.#evaluatePolicy(policy, resolvedContext);

      return {
        policyId: policy.id,
        policyName: policy.name,
        applicable: true,
        effect: evaluation.effect,
        matched: evaluation.matched,
        conditionResults: evaluation.conditionResults,
        obligations: evaluation.obligations,
        advice: evaluation.advice
      };

    } catch (error) {
      logger.error('Policy test failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to test policy',
        500,
        'POLICY_TEST_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Initializes built-in functions
   * @private
   */
  #initializeBuiltInFunctions() {
    // Time-based functions
    this.customFunctions.currentTime = () => new Date();
    this.customFunctions.dayOfWeek = () => new Date().getDay();
    this.customFunctions.businessHours = () => {
      const hour = new Date().getHours();
      return hour >= 9 && hour < 17;
    };

    // String functions
    this.customFunctions.toLowerCase = (str) => str?.toLowerCase();
    this.customFunctions.toUpperCase = (str) => str?.toUpperCase();
    this.customFunctions.trim = (str) => str?.trim();

    // Array functions
    this.customFunctions.length = (arr) => arr?.length || 0;
    this.customFunctions.includes = (arr, item) => arr?.includes(item) || false;

    // Math functions
    this.customFunctions.min = Math.min;
    this.customFunctions.max = Math.max;
    this.customFunctions.abs = Math.abs;

    logger.debug('Built-in functions initialized', {
      count: Object.keys(this.customFunctions).length
    });
  }

  /**
   * Validates a policy
   * @private
   * @param {Object} policy - Policy to validate
   * @throws {AppError} If validation fails
   */
  #validatePolicy(policy) {
    // Validate effect
    if (!Object.values(PolicyEngine.#POLICY_EFFECTS).includes(policy.effect)) {
      throw new AppError(
        'Invalid policy effect',
        400,
        'INVALID_EFFECT',
        { effect: policy.effect }
      );
    }

    // Validate type
    if (policy.type && 
        !Object.values(PolicyEngine.#POLICY_TYPES).includes(policy.type)) {
      throw new AppError(
        'Invalid policy type',
        400,
        'INVALID_TYPE',
        { type: policy.type }
      );
    }

    // Validate target
    if (!policy.target || typeof policy.target !== 'object') {
      throw new AppError('Policy target must be an object', 400, 'INVALID_TARGET');
    }

    // Validate conditions
    if (policy.conditions) {
      this.#validateConditions(policy.conditions);
    }

    // Check complexity
    const complexity = this.#calculatePolicyComplexity(policy);
    if (complexity > PolicyEngine.#MAX_CONDITION_COMPLEXITY) {
      throw new AppError(
        'Policy complexity exceeds maximum',
        400,
        'POLICY_TOO_COMPLEX',
        { complexity, max: PolicyEngine.#MAX_CONDITION_COMPLEXITY }
      );
    }
  }

  /**
   * Validates conditions
   * @private
   * @param {Object} conditions - Conditions to validate
   * @param {number} [depth=0] - Current depth
   * @throws {AppError} If validation fails
   */
  #validateConditions(conditions, depth = 0) {
    if (depth > PolicyEngine.#MAX_POLICY_DEPTH) {
      throw new AppError(
        'Condition depth exceeds maximum',
        400,
        'CONDITIONS_TOO_DEEP'
      );
    }

    if (typeof conditions !== 'object' || conditions === null) {
      throw new AppError('Conditions must be an object', 400, 'INVALID_CONDITIONS');
    }

    for (const [key, condition of Object.entries(conditions)) {
      if (condition.operator) {
        // Validate operator
        if (!Object.values(PolicyEngine.#OPERATORS).includes(condition.operator)) {
          throw new AppError(
            'Invalid condition operator',
            400,
            'INVALID_OPERATOR',
            { operator: condition.operator }
          );
        }

        // Validate logical operators
        if (['and', 'or', 'not'].includes(condition.operator)) {
          if (!Array.isArray(condition.conditions)) {
            throw new AppError(
              'Logical operators require conditions array',
              400,
              'INVALID_LOGICAL_CONDITION'
            );
          }
          
          for (const subCondition of condition.conditions) {
            this.#validateConditions(subCondition, depth + 1);
          }
        }
      }
    }
  }

  /**
   * Validates evaluation context
   * @private
   * @param {Object} context - Context to validate
   * @throws {AppError} If validation fails
   */
  #validateContext(context) {
    if (!context || typeof context !== 'object') {
      throw new AppError('Context must be an object', 400, 'INVALID_CONTEXT');
    }

    if (!context.subject || typeof context.subject !== 'object') {
      throw new AppError('Context must include subject', 400, 'MISSING_SUBJECT');
    }

    if (!context.resource) {
      throw new AppError('Context must include resource', 400, 'MISSING_RESOURCE');
    }

    if (!context.action) {
      throw new AppError('Context must include action', 400, 'MISSING_ACTION');
    }
  }

  /**
   * Compiles a policy for efficient evaluation
   * @private
   * @param {Object} policy - Policy to compile
   * @returns {Object} Compiled policy
   */
  #compilePolicy(policy) {
    const compiled = {
      id: policy.id,
      effect: policy.effect,
      targetMatcher: this.#compileTarget(policy.target),
      conditionEvaluator: policy.conditions 
        ? this.#compileConditions(policy.conditions)
        : null,
      obligations: policy.obligations || [],
      advice: policy.advice || []
    };

    return compiled;
  }

  /**
   * Compiles target specification
   * @private
   * @param {Object} target - Target to compile
   * @returns {Function} Target matcher function
   */
  #compileTarget(target) {
    return (context) => {
      for (const [key, value] of Object.entries(target)) {
        const contextValue = this.#getAttributeValue(context, key);
        
        if (Array.isArray(value)) {
          if (!value.includes(contextValue)) {
            return false;
          }
        } else if (typeof value === 'object' && value.operator) {
          if (!this.#evaluateCondition(value, context)) {
            return false;
          }
        } else if (contextValue !== value && value !== '*') {
          return false;
        }
      }
      
      return true;
    };
  }

  /**
   * Compiles conditions
   * @private
   * @param {Object} conditions - Conditions to compile
   * @returns {Function} Condition evaluator function
   */
  #compileConditions(conditions) {
    return (context) => {
      return this.#evaluateConditions(conditions, context);
    };
  }

  /**
   * Resolves attributes in context
   * @private
   * @param {Object} context - Context with attributes to resolve
   * @returns {Promise<Object>} Resolved context
   */
  async #resolveAttributes(context) {
    const resolved = { ...context };

    // Apply custom attribute resolvers
    for (const [key, resolver] of Object.entries(this.attributeResolvers)) {
      if (typeof resolver === 'function') {
        try {
          const value = await resolver(context);
          this.#setAttributeValue(resolved, key, value);
        } catch (error) {
          logger.warn('Attribute resolver failed', { key, error: error.message });
        }
      }
    }

    // Add standard attributes
    resolved.environment = {
      ...resolved.environment,
      timestamp: new Date().toISOString(),
      dayOfWeek: new Date().getDay(),
      hour: new Date().getHours()
    };

    return resolved;
  }

  /**
   * Finds applicable policies for context
   * @private
   * @param {Object} context - Evaluation context
   * @returns {Promise<Array>} Applicable policies
   */
  async #findApplicablePolicies(context) {
    const applicable = [];
    const { policies } = await this.listPolicies({ active: true, limit: 1000 });

    for (const policy of policies) {
      // Check if compiled version exists
      if (!policy.compiled && this.compiledPolicyCache.has(policy.id)) {
        policy.compiled = this.compiledPolicyCache.get(policy.id);
      } else if (!policy.compiled) {
        policy.compiled = this.#compilePolicy(policy);
        this.compiledPolicyCache.set(policy.id, policy.compiled);
      }

      // Check target match
      if (policy.compiled.targetMatcher(context)) {
        applicable.push(policy);
      }
    }

    // Sort by priority
    applicable.sort((a, b) => b.priority - a.priority);

    return applicable;
  }

  /**
   * Evaluates a single policy
   * @private
   * @param {Object} policy - Policy to evaluate
   * @param {Object} context - Evaluation context
   * @returns {Promise<Object>} Evaluation result
   */
  async #evaluatePolicy(policy, context) {
    const result = {
      policy,
      effect: policy.effect,
      matched: false,
      conditionResults: {},
      obligations: [],
      advice: []
    };

    try {
      // Evaluate conditions
      if (policy.compiled.conditionEvaluator) {
        const conditionResult = policy.compiled.conditionEvaluator(context);
        result.matched = conditionResult;
        result.conditionResults = { evaluated: true, result: conditionResult };
      } else {
        // No conditions means automatic match
        result.matched = true;
      }

      // Add obligations and advice if matched
      if (result.matched) {
        result.obligations = policy.compiled.obligations || [];
        result.advice = policy.compiled.advice || [];
      }

    } catch (error) {
      logger.error('Policy evaluation error', {
        policyId: policy.id,
        error: error.message
      });
      
      if (this.strictEvaluation) {
        throw error;
      }
      
      result.matched = false;
      result.error = error.message;
    }

    return result;
  }

  /**
   * Evaluates target specification
   * @private
   * @param {Object} target - Target specification
   * @param {Object} context - Evaluation context
   * @returns {boolean} True if target matches
   */
  #evaluateTarget(target, context) {
    try {
      for (const [attribute, expected] of Object.entries(target)) {
        const actual = this.#getAttributeValue(context, attribute);
        
        if (!this.#matchValue(actual, expected)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.debug('Target evaluation error', { error: error.message });
      return false;
    }
  }

  /**
   * Evaluates conditions
   * @private
   * @param {Object} conditions - Conditions to evaluate
   * @param {Object} context - Evaluation context
   * @returns {boolean} Evaluation result
   */
  #evaluateConditions(conditions, context) {
    // Handle logical operators
    if (conditions.operator) {
      return this.#evaluateCondition(conditions, context);
    }

    // Handle object with multiple conditions (implicit AND)
    for (const [key, condition of Object.entries(conditions)) {
      if (!this.#evaluateCondition(condition, context)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a single condition
   * @private
   * @param {Object} condition - Condition to evaluate
   * @param {Object} context - Evaluation context
   * @returns {boolean} Evaluation result
   */
  #evaluateCondition(condition, context) {
    const { operator, attribute, value, conditions: subConditions } = condition;

    switch (operator) {
      // Logical operators
      case PolicyEngine.#OPERATORS.AND:
        return subConditions.every(c => this.#evaluateCondition(c, context));
        
      case PolicyEngine.#OPERATORS.OR:
        return subConditions.some(c => this.#evaluateCondition(c, context));
        
      case PolicyEngine.#OPERATORS.NOT:
        return !this.#evaluateCondition(subConditions[0], context);

      // Comparison operators
      case PolicyEngine.#OPERATORS.EQUALS:
        return this.#getAttributeValue(context, attribute) === value;
        
      case PolicyEngine.#OPERATORS.NOT_EQUALS:
        return this.#getAttributeValue(context, attribute) !== value;
        
      case PolicyEngine.#OPERATORS.GREATER_THAN:
        return this.#getAttributeValue(context, attribute) > value;
        
      case PolicyEngine.#OPERATORS.GREATER_THAN_OR_EQUAL:
        return this.#getAttributeValue(context, attribute) >= value;
        
      case PolicyEngine.#OPERATORS.LESS_THAN:
        return this.#getAttributeValue(context, attribute) < value;
        
      case PolicyEngine.#OPERATORS.LESS_THAN_OR_EQUAL:
        return this.#getAttributeValue(context, attribute) <= value;

      // String operators
      case PolicyEngine.#OPERATORS.CONTAINS:
        return String(this.#getAttributeValue(context, attribute)).includes(value);
        
      case PolicyEngine.#OPERATORS.NOT_CONTAINS:
        return !String(this.#getAttributeValue(context, attribute)).includes(value);
        
      case PolicyEngine.#OPERATORS.STARTS_WITH:
        return String(this.#getAttributeValue(context, attribute)).startsWith(value);
        
      case PolicyEngine.#OPERATORS.ENDS_WITH:
        return String(this.#getAttributeValue(context, attribute)).endsWith(value);
        
      case PolicyEngine.#OPERATORS.MATCHES:
        return new RegExp(value).test(this.#getAttributeValue(context, attribute));

      // Array operators
      case PolicyEngine.#OPERATORS.IN:
        return value.includes(this.#getAttributeValue(context, attribute));
        
      case PolicyEngine.#OPERATORS.NOT_IN:
        return !value.includes(this.#getAttributeValue(context, attribute));
        
      case PolicyEngine.#OPERATORS.ANY_OF:
        const attrArray = this.#getAttributeValue(context, attribute);
        return Array.isArray(attrArray) && value.some(v => attrArray.includes(v));
        
      case PolicyEngine.#OPERATORS.ALL_OF:
        const attrArr = this.#getAttributeValue(context, attribute);
        return Array.isArray(attrArr) && value.every(v => attrArr.includes(v));

      // Existence operators
      case PolicyEngine.#OPERATORS.EXISTS:
        return this.#getAttributeValue(context, attribute) !== undefined;
        
      case PolicyEngine.#OPERATORS.NOT_EXISTS:
        return this.#getAttributeValue(context, attribute) === undefined;

      default:
        if (this.customFunctions[operator]) {
          return this.customFunctions[operator](
            this.#getAttributeValue(context, attribute),
            value,
            context
          );
        }
        throw new AppError(
          `Unknown operator: ${operator}`,
          400,
          'UNKNOWN_OPERATOR'
        );
    }
  }

  /**
   * Gets attribute value from context
   * @private
   * @param {Object} context - Context object
   * @param {string} path - Attribute path
   * @returns {*} Attribute value
   */
  #getAttributeValue(context, path) {
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Sets attribute value in context
   * @private
   * @param {Object} context - Context object
   * @param {string} path - Attribute path
   * @param {*} value - Value to set
   */
  #setAttributeValue(context, path, value) {
    const parts = path.split('.');
    let current = context;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Matches values with wildcard support
   * @private
   * @param {*} actual - Actual value
   * @param {*} expected - Expected value
   * @returns {boolean} True if matches
   */
  #matchValue(actual, expected) {
    if (expected === '*') {
      return true;
    }

    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }

    if (typeof expected === 'object' && expected.operator) {
      return this.#evaluateCondition(expected, { value: actual });
    }

    return actual === expected;
  }

  /**
   * Combines multiple policy decisions
   * @private
   * @param {Array} evaluations - Policy evaluation results
   * @returns {Object} Combined decision
   */
  #combineDecisions(evaluations) {
    const algorithm = this.combinationAlgorithm;
    let decision = {
      effect: PolicyEngine.#POLICY_EFFECTS.DENY,
      reason: 'Default deny',
      obligations: [],
      advice: []
    };

    switch (algorithm) {
      case PolicyEngine.#COMBINATION_ALGORITHMS.DENY_OVERRIDES:
        // If any policy denies, the result is deny
        for (const eval of evaluations) {
          if (eval.matched) {
            if (eval.effect === PolicyEngine.#POLICY_EFFECTS.DENY) {
              return {
                effect: PolicyEngine.#POLICY_EFFECTS.DENY,
                reason: `Denied by policy: ${eval.policy.name}`,
                obligations: eval.obligations,
                advice: eval.advice
              };
            } else if (eval.effect === PolicyEngine.#POLICY_EFFECTS.ALLOW) {
              decision = {
                effect: PolicyEngine.#POLICY_EFFECTS.ALLOW,
                reason: `Allowed by policy: ${eval.policy.name}`,
                obligations: [...decision.obligations, ...eval.obligations],
                advice: [...decision.advice, ...eval.advice]
              };
            }
          }
        }
        break;

      case PolicyEngine.#COMBINATION_ALGORITHMS.ALLOW_OVERRIDES:
        // If any policy allows, the result is allow
        let hasDeny = false;
        for (const eval of evaluations) {
          if (eval.matched) {
            if (eval.effect === PolicyEngine.#POLICY_EFFECTS.ALLOW) {
              return {
                effect: PolicyEngine.#POLICY_EFFECTS.ALLOW,
                reason: `Allowed by policy: ${eval.policy.name}`,
                obligations: eval.obligations,
                advice: eval.advice
              };
            } else if (eval.effect === PolicyEngine.#POLICY_EFFECTS.DENY) {
              hasDeny = true;
              decision = {
                effect: PolicyEngine.#POLICY_EFFECTS.DENY,
                reason: `Denied by policy: ${eval.policy.name}`,
                obligations: eval.obligations,
                advice: eval.advice
              };
            }
          }
        }
        break;

      case PolicyEngine.#COMBINATION_ALGORITHMS.FIRST_APPLICABLE:
        // First matching policy determines result
        for (const eval of evaluations) {
          if (eval.matched) {
            return {
              effect: eval.effect,
              reason: `Determined by policy: ${eval.policy.name}`,
              obligations: eval.obligations,
              advice: eval.advice
            };
          }
        }
        break;

      case PolicyEngine.#COMBINATION_ALGORITHMS.ONLY_ONE_APPLICABLE:
        // Only one policy should match
        const matches = evaluations.filter(e => e.matched);
        if (matches.length === 1) {
          const match = matches[0];
          return {
            effect: match.effect,
            reason: `Single matching policy: ${match.policy.name}`,
            obligations: match.obligations,
            advice: match.advice
          };
        } else if (matches.length > 1) {
          return {
            effect: PolicyEngine.#POLICY_EFFECTS.DENY,
            reason: 'Multiple policies matched (only one allowed)',
            obligations: [],
            advice: []
          };
        }
        break;
    }

    return decision;
  }

  /**
   * Calculates policy complexity
   * @private
   * @param {Object} policy - Policy to analyze
   * @returns {number} Complexity score
   */
  #calculatePolicyComplexity(policy) {
    let complexity = 0;

    // Target complexity
    if (policy.target) {
      complexity += Object.keys(policy.target).length;
    }

    // Condition complexity
    if (policy.conditions) {
      complexity += this.#calculateConditionComplexity(policy.conditions);
    }

    // Obligations and advice
    complexity += (policy.obligations?.length || 0) * 2;
    complexity += (policy.advice?.length || 0);

    return complexity;
  }

  /**
   * Calculates condition complexity
   * @private
   * @param {Object} conditions - Conditions to analyze
   * @returns {number} Complexity score
   */
  #calculateConditionComplexity(conditions) {
    let complexity = 0;

    if (conditions.operator) {
      complexity += 1;
      
      if (conditions.conditions) {
        for (const subCondition of conditions.conditions) {
          complexity += this.#calculateConditionComplexity(subCondition);
        }
      }
    } else {
      complexity += Object.keys(conditions).length;
      
      for (const condition of Object.values(conditions)) {
        if (typeof condition === 'object' && condition.operator) {
          complexity += this.#calculateConditionComplexity(condition);
        }
      }
    }

    return complexity;
  }

  /**
   * Checks for policy conflicts
   * @private
   * @param {Object} policy - Policy to check
   * @returns {Promise<Array>} Conflicting policies
   */
  async #checkPolicyConflicts(policy) {
    const conflicts = [];
    const { policies } = await this.listPolicies({ active: true });

    for (const other of policies) {
      if (other.id === policy.id) continue;

      // Check for overlapping targets with different effects
      if (this.#targetsOverlap(policy.target, other.target) &&
          policy.effect !== other.effect) {
        conflicts.push({
          policyId: other.id,
          policyName: other.name,
          reason: 'Overlapping targets with different effects',
          thisEffect: policy.effect,
          otherEffect: other.effect
        });
      }
    }

    return conflicts;
  }

  /**
   * Checks if targets overlap
   * @private
   * @param {Object} target1 - First target
   * @param {Object} target2 - Second target
   * @returns {boolean} True if targets overlap
   */
  #targetsOverlap(target1, target2) {
    // Simplified overlap check
    for (const key of Object.keys(target1)) {
      if (key in target2) {
        const val1 = target1[key];
        const val2 = target2[key];
        
        if (val1 === '*' || val2 === '*') {
          return true;
        }
        
        if (Array.isArray(val1) && Array.isArray(val2)) {
          if (val1.some(v => val2.includes(v))) {
            return true;
          }
        } else if (val1 === val2) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Checks if policy exists
   * @private
   * @param {string} identifier - Policy identifier
   * @returns {Promise<boolean>} True if exists
   */
  async #policyExists(identifier) {
    const policy = await this.getPolicy(identifier);
    return !!policy;
  }

  /**
   * Checks policy usage
   * @private
   * @param {string} policyId - Policy ID
   * @returns {Promise<Object>} Usage information
   */
  async #checkPolicyUsage(policyId) {
    // Check if policy is part of any policy set
    const usage = {
      inUse: false,
      policySets: []
    };

    if (this.database) {
      const PolicySetModel = require('../../database/models/policy-set-model');
      const sets = await PolicySetModel.find({ policies: policyId });
      usage.policySets = sets.map(s => s.id);
      usage.inUse = sets.length > 0;
    } else {
      for (const [setId, set] of this.inMemoryPolicySets) {
        if (set.policies?.includes(policyId)) {
          usage.policySets.push(setId);
        }
      }
      usage.inUse = usage.policySets.length > 0;
    }

    return usage;
  }

  /**
   * Generates policy ID
   * @private
   * @param {string} [prefix='policy'] - ID prefix
   * @returns {string} Policy identifier
   */
  #generatePolicyId(prefix = 'policy') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates cache key
   * @private
   * @param {Object} context - Evaluation context
   * @returns {string} Cache key
   */
  #generateCacheKey(context) {
    const key = {
      subject: context.subject.id || context.subject,
      resource: context.resource,
      action: context.action,
      env: context.environment?.timestamp
    };
    
    return JSON.stringify(key);
  }

  /**
   * Caches evaluation result
   * @private
   * @param {string} key - Cache key
   * @param {Object} result - Result to cache
   */
  #cacheResult(key, result) {
    if (this.enableCache) {
      this.evaluationCache.set(key, {
        result,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.evaluationCache.size > 10000) {
        const firstKey = this.evaluationCache.keys().next().value;
        this.evaluationCache.delete(firstKey);
      }
    }
  }

  /**
   * Clears all caches
   * @private
   */
  #clearCache() {
    this.policyCache.clear();
    this.evaluationCache.clear();
    this.compiledPolicyCache.clear();
  }

  /**
   * Exports policy configuration
   * @returns {Promise<Array>} Exported policies
   */
  async exportPolicies() {
    const { policies } = await this.listPolicies({ 
      active: undefined,
      limit: Number.MAX_SAFE_INTEGER 
    });

    return policies.map(p => ({
      name: p.name,
      description: p.description,
      effect: p.effect,
      type: p.type,
      target: p.target,
      conditions: p.conditions,
      priority: p.priority,
      obligations: p.obligations,
      advice: p.advice,
      metadata: p.metadata,
      active: p.active
    }));
  }

  /**
   * Imports policy configuration
   * @param {Array} policies - Policies to import
   * @param {Object} [options={}] - Import options
   * @returns {Promise<Object>} Import results
   */
  async importPolicies(policies, options = {}) {
    const { merge = false } = options;
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const policy of policies) {
      try {
        await this.createPolicy(policy);
        results.imported++;
      } catch (error) {
        if (error.code === 'POLICY_EXISTS' && merge) {
          results.skipped++;
        } else {
          results.errors.push({
            policy: policy.name,
            error: error.message
          });
        }
      }
    }

    logger.info('Policies imported', results);

    return results;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    this.#clearCache();
    logger.info('PolicyEngine cleanup completed');
  }
}

module.exports = PolicyEngine;