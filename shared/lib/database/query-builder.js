'use strict';

/**
 * @fileoverview Advanced query builder with fluent API and optimization
 * @module shared/lib/database/query-builder
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const validators = require('../utils/validators/common-validators');

/**
 * @class QueryBuilder
 * @description Fluent query builder with validation and optimization
 */
class QueryBuilder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #QUERY_TYPES = {
    FIND: 'find',
    FIND_ONE: 'findOne',
    INSERT: 'insert',
    UPDATE: 'update',
    DELETE: 'delete',
    AGGREGATE: 'aggregate',
    COUNT: 'count',
    DISTINCT: 'distinct'
  };

  static #OPERATORS = {
    COMPARISON: {
      $eq: 'equals',
      $ne: 'not equals',
      $gt: 'greater than',
      $gte: 'greater than or equal',
      $lt: 'less than',
      $lte: 'less than or equal',
      $in: 'in array',
      $nin: 'not in array'
    },
    LOGICAL: {
      $and: 'and',
      $or: 'or',
      $not: 'not',
      $nor: 'nor'
    },
    ELEMENT: {
      $exists: 'exists',
      $type: 'type'
    },
    EVALUATION: {
      $regex: 'regex',
      $text: 'text search',
      $where: 'javascript expression'
    },
    ARRAY: {
      $all: 'all',
      $elemMatch: 'element match',
      $size: 'size'
    }
  };

  static #UPDATE_OPERATORS = {
    $set: 'set',
    $unset: 'unset',
    $inc: 'increment',
    $mul: 'multiply',
    $push: 'push',
    $pull: 'pull',
    $addToSet: 'add to set',
    $pop: 'pop',
    $rename: 'rename'
  };

  static #AGGREGATION_STAGES = {
    $match: 'match',
    $group: 'group',
    $project: 'project',
    $sort: 'sort',
    $limit: 'limit',
    $skip: 'skip',
    $unwind: 'unwind',
    $lookup: 'lookup',
    $count: 'count',
    $facet: 'facet'
  };

  /**
   * Creates an instance of QueryBuilder
   * @constructor
   * @param {Object} model - Database model
   * @param {Object} [options={}] - Query builder options
   */
  constructor(model, options = {}) {
    if (!model) {
      throw new AppError('Model is required for QueryBuilder', 400, 'INVALID_MODEL');
    }

    this.model = model;
    this.queryType = null;
    this.query = {};
    this.updateData = {};
    this.options = {};
    this.pipeline = [];
    this.populateFields = [];
    this.selectFields = null;
    this.sortCriteria = {};
    this.limitValue = null;
    this.skipValue = null;
    this.tenantId = options.tenantId || null;
    this.explain = false;
    this.lean = false;
    this.cacheKey = null;
    this.cacheDuration = null;
    this.validationRules = {};
    this.hooks = {
      pre: [],
      post: []
    };
  }

  /**
   * Creates a new QueryBuilder instance
   * @static
   * @param {Object} model - Database model
   * @param {Object} [options={}] - Options
   * @returns {QueryBuilder} New QueryBuilder instance
   */
  static create(model, options = {}) {
    return new QueryBuilder(model, options);
  }

  /**
   * Sets up a find query
   * @param {Object} [conditions={}] - Query conditions
   * @returns {QueryBuilder} Fluent interface
   */
  find(conditions = {}) {
    this.queryType = QueryBuilder.#QUERY_TYPES.FIND;
    this.#mergeConditions(conditions);
    return this;
  }

  /**
   * Sets up a findOne query
   * @param {Object} [conditions={}] - Query conditions
   * @returns {QueryBuilder} Fluent interface
   */
  findOne(conditions = {}) {
    this.queryType = QueryBuilder.#QUERY_TYPES.FIND_ONE;
    this.#mergeConditions(conditions);
    return this;
  }

  /**
   * Sets up an insert query
   * @param {Object|Array} data - Data to insert
   * @returns {QueryBuilder} Fluent interface
   */
  insert(data) {
    if (!data) {
      throw new AppError('Insert data is required', 400, 'MISSING_INSERT_DATA');
    }

    this.queryType = QueryBuilder.#QUERY_TYPES.INSERT;
    this.insertData = data;
    return this;
  }

  /**
   * Sets up an update query
   * @param {Object} [conditions={}] - Update conditions
   * @param {Object} [data={}] - Update data
   * @returns {QueryBuilder} Fluent interface
   */
  update(conditions = {}, data = {}) {
    this.queryType = QueryBuilder.#QUERY_TYPES.UPDATE;
    this.#mergeConditions(conditions);
    this.updateData = data;
    return this;
  }

  /**
   * Sets up a delete query
   * @param {Object} [conditions={}] - Delete conditions
   * @returns {QueryBuilder} Fluent interface
   */
  delete(conditions = {}) {
    this.queryType = QueryBuilder.#QUERY_TYPES.DELETE;
    this.#mergeConditions(conditions);
    return this;
  }

  /**
   * Sets up an aggregation pipeline
   * @param {Array} [pipeline=[]] - Aggregation pipeline
   * @returns {QueryBuilder} Fluent interface
   */
  aggregate(pipeline = []) {
    this.queryType = QueryBuilder.#QUERY_TYPES.AGGREGATE;
    this.pipeline = Array.isArray(pipeline) ? pipeline : [pipeline];
    return this;
  }

  /**
   * Sets up a count query
   * @param {Object} [conditions={}] - Count conditions
   * @returns {QueryBuilder} Fluent interface
   */
  count(conditions = {}) {
    this.queryType = QueryBuilder.#QUERY_TYPES.COUNT;
    this.#mergeConditions(conditions);
    return this;
  }

  /**
   * Sets up a distinct query
   * @param {string} field - Field to get distinct values
   * @param {Object} [conditions={}] - Query conditions
   * @returns {QueryBuilder} Fluent interface
   */
  distinct(field, conditions = {}) {
    if (!field) {
      throw new AppError('Field is required for distinct query', 400, 'MISSING_FIELD');
    }

    this.queryType = QueryBuilder.#QUERY_TYPES.DISTINCT;
    this.distinctField = field;
    this.#mergeConditions(conditions);
    return this;
  }

  /**
   * Adds where conditions
   * @param {string|Object} field - Field name or conditions object
   * @param {*} [value] - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  where(field, value) {
    if (typeof field === 'object' && !value) {
      this.#mergeConditions(field);
    } else if (typeof field === 'string') {
      this.query[field] = value;
    }
    return this;
  }

  /**
   * Adds equality condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  equals(field, value) {
    this.query[field] = { $eq: value };
    return this;
  }

  /**
   * Adds not equal condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  notEquals(field, value) {
    this.query[field] = { $ne: value };
    return this;
  }

  /**
   * Adds greater than condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  greaterThan(field, value) {
    this.query[field] = { $gt: value };
    return this;
  }

  /**
   * Adds greater than or equal condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  greaterThanOrEqual(field, value) {
    this.query[field] = { $gte: value };
    return this;
  }

  /**
   * Adds less than condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  lessThan(field, value) {
    this.query[field] = { $lt: value };
    return this;
  }

  /**
   * Adds less than or equal condition
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {QueryBuilder} Fluent interface
   */
  lessThanOrEqual(field, value) {
    this.query[field] = { $lte: value };
    return this;
  }

  /**
   * Adds in array condition
   * @param {string} field - Field name
   * @param {Array} values - Array of values
   * @returns {QueryBuilder} Fluent interface
   */
  in(field, values) {
    if (!Array.isArray(values)) {
      throw new AppError('Values must be an array', 400, 'INVALID_IN_VALUES');
    }
    this.query[field] = { $in: values };
    return this;
  }

  /**
   * Adds not in array condition
   * @param {string} field - Field name
   * @param {Array} values - Array of values
   * @returns {QueryBuilder} Fluent interface
   */
  notIn(field, values) {
    if (!Array.isArray(values)) {
      throw new AppError('Values must be an array', 400, 'INVALID_NIN_VALUES');
    }
    this.query[field] = { $nin: values };
    return this;
  }

  /**
   * Adds between condition
   * @param {string} field - Field name
   * @param {*} min - Minimum value
   * @param {*} max - Maximum value
   * @returns {QueryBuilder} Fluent interface
   */
  between(field, min, max) {
    this.query[field] = { $gte: min, $lte: max };
    return this;
  }

  /**
   * Adds exists condition
   * @param {string} field - Field name
   * @param {boolean} [exists=true] - Whether field should exist
   * @returns {QueryBuilder} Fluent interface
   */
  exists(field, exists = true) {
    this.query[field] = { $exists: exists };
    return this;
  }

  /**
   * Adds regex condition
   * @param {string} field - Field name
   * @param {RegExp|string} pattern - Regex pattern
   * @param {string} [flags] - Regex flags
   * @returns {QueryBuilder} Fluent interface
   */
  regex(field, pattern, flags) {
    if (pattern instanceof RegExp) {
      this.query[field] = { $regex: pattern };
    } else {
      this.query[field] = { $regex: pattern, $options: flags };
    }
    return this;
  }

  /**
   * Adds text search condition
   * @param {string} searchText - Text to search
   * @returns {QueryBuilder} Fluent interface
   */
  text(searchText) {
    if (!searchText) {
      throw new AppError('Search text is required', 400, 'MISSING_SEARCH_TEXT');
    }
    this.query.$text = { $search: searchText };
    return this;
  }

  /**
   * Adds AND condition
   * @param {Array} conditions - Array of conditions
   * @returns {QueryBuilder} Fluent interface
   */
  and(conditions) {
    if (!Array.isArray(conditions)) {
      throw new AppError('Conditions must be an array', 400, 'INVALID_AND_CONDITIONS');
    }
    this.query.$and = conditions;
    return this;
  }

  /**
   * Adds OR condition
   * @param {Array} conditions - Array of conditions
   * @returns {QueryBuilder} Fluent interface
   */
  or(conditions) {
    if (!Array.isArray(conditions)) {
      throw new AppError('Conditions must be an array', 400, 'INVALID_OR_CONDITIONS');
    }
    this.query.$or = conditions;
    return this;
  }

  /**
   * Adds NOT condition
   * @param {Object} condition - Condition to negate
   * @returns {QueryBuilder} Fluent interface
   */
  not(condition) {
    if (typeof condition !== 'object') {
      throw new AppError('Condition must be an object', 400, 'INVALID_NOT_CONDITION');
    }
    this.query.$not = condition;
    return this;
  }

  /**
   * Sets fields to select
   * @param {string|Array|Object} fields - Fields to select
   * @returns {QueryBuilder} Fluent interface
   */
  select(fields) {
    if (typeof fields === 'string') {
      this.selectFields = fields;
    } else if (Array.isArray(fields)) {
      this.selectFields = fields.join(' ');
    } else if (typeof fields === 'object') {
      this.selectFields = fields;
    }
    return this;
  }

  /**
   * Sets sort criteria
   * @param {string|Object} field - Field name or sort object
   * @param {string|number} [order] - Sort order ('asc', 'desc', 1, -1)
   * @returns {QueryBuilder} Fluent interface
   */
  sort(field, order) {
    if (typeof field === 'object') {
      this.sortCriteria = { ...this.sortCriteria, ...field };
    } else if (typeof field === 'string') {
      const sortOrder = order === 'desc' || order === -1 ? -1 : 1;
      this.sortCriteria[field] = sortOrder;
    }
    return this;
  }

  /**
   * Sets limit for results
   * @param {number} limit - Maximum number of results
   * @returns {QueryBuilder} Fluent interface
   */
  limit(limit) {
    if (typeof limit !== 'number' || limit < 0) {
      throw new AppError('Limit must be a positive number', 400, 'INVALID_LIMIT');
    }
    this.limitValue = limit;
    return this;
  }

  /**
   * Sets number of results to skip
   * @param {number} skip - Number of results to skip
   * @returns {QueryBuilder} Fluent interface
   */
  skip(skip) {
    if (typeof skip !== 'number' || skip < 0) {
      throw new AppError('Skip must be a positive number', 400, 'INVALID_SKIP');
    }
    this.skipValue = skip;
    return this;
  }

  /**
   * Sets pagination
   * @param {number} page - Page number (1-based)
   * @param {number} [pageSize=20] - Items per page
   * @returns {QueryBuilder} Fluent interface
   */
  paginate(page, pageSize = 20) {
    if (typeof page !== 'number' || page < 1) {
      throw new AppError('Page must be a positive number', 400, 'INVALID_PAGE');
    }
    
    this.skipValue = (page - 1) * pageSize;
    this.limitValue = pageSize;
    this.pagination = { page, pageSize };
    return this;
  }

  /**
   * Sets fields to populate
   * @param {string|Array|Object} fields - Fields to populate
   * @param {string} [select] - Fields to select from populated docs
   * @returns {QueryBuilder} Fluent interface
   */
  populate(fields, select) {
    if (typeof fields === 'string') {
      this.populateFields.push({ path: fields, select });
    } else if (Array.isArray(fields)) {
      fields.forEach(field => {
        if (typeof field === 'string') {
          this.populateFields.push({ path: field });
        } else {
          this.populateFields.push(field);
        }
      });
    } else if (typeof fields === 'object') {
      this.populateFields.push(fields);
    }
    return this;
  }

  /**
   * Sets update operation
   * @param {Object} data - Update data
   * @returns {QueryBuilder} Fluent interface
   */
  set(data) {
    if (!this.updateData.$set) {
      this.updateData.$set = {};
    }
    Object.assign(this.updateData.$set, data);
    return this;
  }

  /**
   * Unsets fields
   * @param {string|Array} fields - Fields to unset
   * @returns {QueryBuilder} Fluent interface
   */
  unset(fields) {
    if (!this.updateData.$unset) {
      this.updateData.$unset = {};
    }
    
    if (typeof fields === 'string') {
      this.updateData.$unset[fields] = 1;
    } else if (Array.isArray(fields)) {
      fields.forEach(field => {
        this.updateData.$unset[field] = 1;
      });
    }
    return this;
  }

  /**
   * Increments fields
   * @param {string|Object} field - Field name or increment object
   * @param {number} [value=1] - Increment value
   * @returns {QueryBuilder} Fluent interface
   */
  increment(field, value = 1) {
    if (!this.updateData.$inc) {
      this.updateData.$inc = {};
    }
    
    if (typeof field === 'object') {
      Object.assign(this.updateData.$inc, field);
    } else {
      this.updateData.$inc[field] = value;
    }
    return this;
  }

  /**
   * Pushes values to array fields
   * @param {string|Object} field - Field name or push object
   * @param {*} [value] - Value to push
   * @returns {QueryBuilder} Fluent interface
   */
  push(field, value) {
    if (!this.updateData.$push) {
      this.updateData.$push = {};
    }
    
    if (typeof field === 'object') {
      Object.assign(this.updateData.$push, field);
    } else {
      this.updateData.$push[field] = value;
    }
    return this;
  }

  /**
   * Pulls values from array fields
   * @param {string|Object} field - Field name or pull object
   * @param {*} [value] - Value to pull
   * @returns {QueryBuilder} Fluent interface
   */
  pull(field, value) {
    if (!this.updateData.$pull) {
      this.updateData.$pull = {};
    }
    
    if (typeof field === 'object') {
      Object.assign(this.updateData.$pull, field);
    } else {
      this.updateData.$pull[field] = value;
    }
    return this;
  }

  /**
   * Adds to set (array without duplicates)
   * @param {string|Object} field - Field name or addToSet object
   * @param {*} [value] - Value to add
   * @returns {QueryBuilder} Fluent interface
   */
  addToSet(field, value) {
    if (!this.updateData.$addToSet) {
      this.updateData.$addToSet = {};
    }
    
    if (typeof field === 'object') {
      Object.assign(this.updateData.$addToSet, field);
    } else {
      this.updateData.$addToSet[field] = value;
    }
    return this;
  }

  /**
   * Adds aggregation pipeline stage
   * @param {Object} stage - Pipeline stage
   * @returns {QueryBuilder} Fluent interface
   */
  addStage(stage) {
    if (this.queryType !== QueryBuilder.#QUERY_TYPES.AGGREGATE) {
      this.queryType = QueryBuilder.#QUERY_TYPES.AGGREGATE;
    }
    this.pipeline.push(stage);
    return this;
  }

  /**
   * Adds match stage to pipeline
   * @param {Object} conditions - Match conditions
   * @returns {QueryBuilder} Fluent interface
   */
  match(conditions) {
    return this.addStage({ $match: conditions });
  }

  /**
   * Adds group stage to pipeline
   * @param {Object} grouping - Group specification
   * @returns {QueryBuilder} Fluent interface
   */
  group(grouping) {
    return this.addStage({ $group: grouping });
  }

  /**
   * Adds project stage to pipeline
   * @param {Object} projection - Projection specification
   * @returns {QueryBuilder} Fluent interface
   */
  project(projection) {
    return this.addStage({ $project: projection });
  }

  /**
   * Adds lookup (join) stage to pipeline
   * @param {Object} lookup - Lookup specification
   * @returns {QueryBuilder} Fluent interface
   */
  lookup(lookup) {
    return this.addStage({ $lookup: lookup });
  }

  /**
   * Adds unwind stage to pipeline
   * @param {string|Object} path - Field path to unwind
   * @returns {QueryBuilder} Fluent interface
   */
  unwind(path) {
    if (typeof path === 'string') {
      return this.addStage({ $unwind: path });
    }
    return this.addStage({ $unwind: path });
  }

  /**
   * Sets tenant context
   * @param {string} tenantId - Tenant identifier
   * @returns {QueryBuilder} Fluent interface
   */
  forTenant(tenantId) {
    this.tenantId = tenantId;
    this.#applyTenantContext();
    return this;
  }

  /**
   * Enables query explanation
   * @param {boolean} [enable=true] - Enable explanation
   * @returns {QueryBuilder} Fluent interface
   */
  explain(enable = true) {
    this.explain = enable;
    return this;
  }

  /**
   * Enables lean queries (plain objects)
   * @param {boolean} [enable=true] - Enable lean
   * @returns {QueryBuilder} Fluent interface
   */
  lean(enable = true) {
    this.lean = enable;
    return this;
  }

  /**
   * Sets cache options
   * @param {string} key - Cache key
   * @param {number} [duration=300000] - Cache duration in ms
   * @returns {QueryBuilder} Fluent interface
   */
  cache(key, duration = 300000) {
    this.cacheKey = key;
    this.cacheDuration = duration;
    return this;
  }

  /**
   * Sets query options
   * @param {Object} options - Query options
   * @returns {QueryBuilder} Fluent interface
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Adds validation rules
   * @param {Object} rules - Validation rules
   * @returns {QueryBuilder} Fluent interface
   */
  validate(rules) {
    this.validationRules = { ...this.validationRules, ...rules };
    return this;
  }

  /**
   * Adds pre-execution hook
   * @param {Function} hook - Hook function
   * @returns {QueryBuilder} Fluent interface
   */
  pre(hook) {
    if (typeof hook !== 'function') {
      throw new AppError('Hook must be a function', 400, 'INVALID_HOOK');
    }
    this.hooks.pre.push(hook);
    return this;
  }

  /**
   * Adds post-execution hook
   * @param {Function} hook - Hook function
   * @returns {QueryBuilder} Fluent interface
   */
  post(hook) {
    if (typeof hook !== 'function') {
      throw new AppError('Hook must be a function', 400, 'INVALID_HOOK');
    }
    this.hooks.post.push(hook);
    return this;
  }

  /**
   * Builds the final query object
   * @returns {Object} Query object
   */
  build() {
    const builtQuery = {
      type: this.queryType,
      query: this.query,
      options: this.#buildOptions()
    };

    if (this.queryType === QueryBuilder.#QUERY_TYPES.UPDATE) {
      builtQuery.update = this.updateData;
    }

    if (this.queryType === QueryBuilder.#QUERY_TYPES.INSERT) {
      builtQuery.data = this.insertData;
    }

    if (this.queryType === QueryBuilder.#QUERY_TYPES.AGGREGATE) {
      builtQuery.pipeline = this.pipeline;
    }

    if (this.queryType === QueryBuilder.#QUERY_TYPES.DISTINCT) {
      builtQuery.field = this.distinctField;
    }

    return builtQuery;
  }

  /**
   * Executes the query
   * @async
   * @returns {Promise<*>} Query result
   * @throws {AppError} If execution fails
   */
  async execute() {
    try {
      // Run pre-execution hooks
      for (const hook of this.hooks.pre) {
        await hook(this);
      }

      // Validate query if rules defined
      if (Object.keys(this.validationRules).length > 0) {
        await this.#validateQuery();
      }

      // Build final query
      const queryData = this.build();

      // Log query execution
      logger.debug('Executing query', {
        type: queryData.type,
        model: this.model.modelName || this.model.name
      });

      // Execute based on query type
      let result;

      switch (queryData.type) {
        case QueryBuilder.#QUERY_TYPES.FIND:
          result = await this.#executeFind();
          break;

        case QueryBuilder.#QUERY_TYPES.FIND_ONE:
          result = await this.#executeFindOne();
          break;

        case QueryBuilder.#QUERY_TYPES.INSERT:
          result = await this.#executeInsert();
          break;

        case QueryBuilder.#QUERY_TYPES.UPDATE:
          result = await this.#executeUpdate();
          break;

        case QueryBuilder.#QUERY_TYPES.DELETE:
          result = await this.#executeDelete();
          break;

        case QueryBuilder.#QUERY_TYPES.AGGREGATE:
          result = await this.#executeAggregate();
          break;

        case QueryBuilder.#QUERY_TYPES.COUNT:
          result = await this.#executeCount();
          break;

        case QueryBuilder.#QUERY_TYPES.DISTINCT:
          result = await this.#executeDistinct();
          break;

        default:
          throw new AppError('Invalid query type', 400, 'INVALID_QUERY_TYPE');
      }

      // Run post-execution hooks
      for (const hook of this.hooks.post) {
        result = await hook(result, this) || result;
      }

      return result;

    } catch (error) {
      logger.error('Query execution failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Query execution failed',
        500,
        'QUERY_EXECUTION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Merges conditions into query
   * @param {Object} conditions - Conditions to merge
   */
  #mergeConditions(conditions) {
    if (this.tenantId && !conditions.tenantId) {
      conditions.tenantId = this.tenantId;
    }
    this.query = { ...this.query, ...conditions };
  }

  /**
   * @private
   * Applies tenant context to query
   */
  #applyTenantContext() {
    if (this.tenantId) {
      if (this.queryType === QueryBuilder.#QUERY_TYPES.AGGREGATE) {
        // Add tenant match as first stage
        this.pipeline.unshift({ $match: { tenantId: this.tenantId } });
      } else {
        // Add tenant to query conditions
        this.query.tenantId = this.tenantId;
      }

      // Add tenant to insert/update data
      if (this.insertData) {
        if (Array.isArray(this.insertData)) {
          this.insertData = this.insertData.map(doc => ({ ...doc, tenantId: this.tenantId }));
        } else {
          this.insertData.tenantId = this.tenantId;
        }
      }

      if (this.updateData.$set) {
        this.updateData.$set.tenantId = this.tenantId;
      }
    }
  }

  /**
   * @private
   * Builds query options
   * @returns {Object} Query options
   */
  #buildOptions() {
    const options = { ...this.options };

    if (this.selectFields) {
      options.select = this.selectFields;
    }

    if (Object.keys(this.sortCriteria).length > 0) {
      options.sort = this.sortCriteria;
    }

    if (this.limitValue !== null) {
      options.limit = this.limitValue;
    }

    if (this.skipValue !== null) {
      options.skip = this.skipValue;
    }

    if (this.populateFields.length > 0) {
      options.populate = this.populateFields;
    }

    if (this.lean) {
      options.lean = true;
    }

    if (this.explain) {
      options.explain = true;
    }

    return options;
  }

  /**
   * @private
   * Validates query based on rules
   * @async
   * @throws {AppError} If validation fails
   */
  async #validateQuery() {
    const errors = [];

    // Validate query conditions
    for (const [field, rule] of Object.entries(this.validationRules)) {
      const value = this.query[field];
      
      if (rule.required && !value) {
        errors.push(`${field} is required`);
      }

      if (value && rule.validator) {
        const isValid = await rule.validator(value);
        if (!isValid) {
          errors.push(`${field} validation failed`);
        }
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        'Query validation failed',
        400,
        'VALIDATION_ERROR',
        { errors }
      );
    }
  }

  /**
   * @private
   * Executes find query
   * @async
   * @returns {Promise<Array>} Query results
   */
  async #executeFind() {
    let query = this.model.find(this.query);

    // Apply options
    if (this.selectFields) {
      query = query.select(this.selectFields);
    }

    if (Object.keys(this.sortCriteria).length > 0) {
      query = query.sort(this.sortCriteria);
    }

    if (this.limitValue !== null) {
      query = query.limit(this.limitValue);
    }

    if (this.skipValue !== null) {
      query = query.skip(this.skipValue);
    }

    if (this.populateFields.length > 0) {
      this.populateFields.forEach(populate => {
        query = query.populate(populate);
      });
    }

    if (this.lean) {
      query = query.lean();
    }

    const results = await query.exec();

    // Add pagination metadata if requested
    if (this.pagination) {
      const totalCount = await this.model.countDocuments(this.query);
      const totalPages = Math.ceil(totalCount / this.pagination.pageSize);

      return {
        data: results,
        pagination: {
          page: this.pagination.page,
          pageSize: this.pagination.pageSize,
          totalCount,
          totalPages,
          hasNextPage: this.pagination.page < totalPages,
          hasPreviousPage: this.pagination.page > 1
        }
      };
    }

    return results;
  }

  /**
   * @private
   * Executes findOne query
   * @async
   * @returns {Promise<Object|null>} Single result
   */
  async #executeFindOne() {
    let query = this.model.findOne(this.query);

    if (this.selectFields) {
      query = query.select(this.selectFields);
    }

    if (this.populateFields.length > 0) {
      this.populateFields.forEach(populate => {
        query = query.populate(populate);
      });
    }

    if (this.lean) {
      query = query.lean();
    }

    return await query.exec();
  }

  /**
   * @private
   * Executes insert query
   * @async
   * @returns {Promise<Object|Array>} Inserted documents
   */
  async #executeInsert() {
    if (Array.isArray(this.insertData)) {
      return await this.model.insertMany(this.insertData, this.options);
    }
    return await this.model.create(this.insertData);
  }

  /**
   * @private
   * Executes update query
   * @async
   * @returns {Promise<Object>} Update result
   */
  async #executeUpdate() {
    const options = {
      ...this.options,
      new: this.options.returnDocument === 'after' || this.options.new !== false,
      runValidators: true
    };

    if (this.options.multi || this.options.updateMany) {
      return await this.model.updateMany(this.query, this.updateData, options);
    }

    return await this.model.findOneAndUpdate(this.query, this.updateData, options);
  }

  /**
   * @private
   * Executes delete query
   * @async
   * @returns {Promise<Object>} Delete result
   */
  async #executeDelete() {
    if (this.options.multi || this.options.deleteMany) {
      return await this.model.deleteMany(this.query);
    }

    return await this.model.findOneAndDelete(this.query);
  }

  /**
   * @private
   * Executes aggregate query
   * @async
   * @returns {Promise<Array>} Aggregation results
   */
  async #executeAggregate() {
    return await this.model.aggregate(this.pipeline, this.options);
  }

  /**
   * @private
   * Executes count query
   * @async
   * @returns {Promise<number>} Document count
   */
  async #executeCount() {
    return await this.model.countDocuments(this.query);
  }

  /**
   * @private
   * Executes distinct query
   * @async
   * @returns {Promise<Array>} Distinct values
   */
  async #executeDistinct() {
    return await this.model.distinct(this.distinctField, this.query);
  }

  /**
   * Creates a copy of the query builder
   * @returns {QueryBuilder} Cloned query builder
   */
  clone() {
    const cloned = new QueryBuilder(this.model, { tenantId: this.tenantId });
    
    // Copy all properties
    cloned.queryType = this.queryType;
    cloned.query = { ...this.query };
    cloned.updateData = { ...this.updateData };
    cloned.options = { ...this.options };
    cloned.pipeline = [...this.pipeline];
    cloned.populateFields = [...this.populateFields];
    cloned.selectFields = this.selectFields;
    cloned.sortCriteria = { ...this.sortCriteria };
    cloned.limitValue = this.limitValue;
    cloned.skipValue = this.skipValue;
    cloned.explain = this.explain;
    cloned.lean = this.lean;
    cloned.cacheKey = this.cacheKey;
    cloned.cacheDuration = this.cacheDuration;
    cloned.validationRules = { ...this.validationRules };
    cloned.hooks = {
      pre: [...this.hooks.pre],
      post: [...this.hooks.post]
    };

    return cloned;
  }

  /**
   * Converts query to string representation
   * @returns {string} Query string
   */
  toString() {
    const queryData = this.build();
    return JSON.stringify(queryData, null, 2);
  }

  /**
   * Gets query statistics
   * @returns {Object} Query statistics
   */
  getStats() {
    return {
      type: this.queryType,
      hasConditions: Object.keys(this.query).length > 0,
      conditionCount: Object.keys(this.query).length,
      hasTenantContext: !!this.tenantId,
      hasPopulate: this.populateFields.length > 0,
      hasSort: Object.keys(this.sortCriteria).length > 0,
      hasPagination: !!(this.limitValue || this.skipValue),
      pipelineLength: this.pipeline.length
    };
  }
}

module.exports = QueryBuilder;