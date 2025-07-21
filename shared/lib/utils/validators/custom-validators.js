'use strict';

/**
 * @fileoverview Custom business logic validators for application-specific rules
 * @module shared/lib/utils/validators/custom-validators
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('./common-validators');
const DateHelper = require('../helpers/date-helper');
const StringHelper = require('../helpers/string-helper');
const { VALIDATION_ERRORS, BUSINESS_ERRORS } = require('../constants/error-codes');

/**
 * @class CustomValidator
 * @description Provides custom validation methods for business-specific rules and complex scenarios
 */
class CustomValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #BUSINESS_HOURS = {
    start: 8, // 8 AM
    end: 18,  // 6 PM
    workDays: [1, 2, 3, 4, 5] // Monday to Friday
  };

  static #PROJECT_CODE_REGEX = /^[A-Z]{3}-\d{4}-[A-Z0-9]{3}$/;
  static #INVOICE_NUMBER_REGEX = /^INV-\d{4}-\d{6}$/;
  static #CONTRACT_ID_REGEX = /^[A-Z]{2}\d{2}-\d{6}-[A-Z]{2}$/;
  static #RESOURCE_ID_REGEX = /^RES-[A-Z]{3}-\d{6}$/;

  static #CURRENCY_PRECISION = {
    USD: 2, EUR: 2, GBP: 2, JPY: 0, KRW: 0,
    BTC: 8, ETH: 18, XRP: 6
  };

  static #PRIORITY_LEVELS = {
    CRITICAL: { value: 1, slaHours: 4 },
    HIGH: { value: 2, slaHours: 8 },
    MEDIUM: { value: 3, slaHours: 24 },
    LOW: { value: 4, slaHours: 72 }
  };

  static #WORKFLOW_STATES = {
    PROJECT: ['draft', 'planning', 'active', 'on-hold', 'completed', 'cancelled', 'archived'],
    TASK: ['todo', 'in-progress', 'review', 'testing', 'done', 'blocked'],
    INVOICE: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled'],
    CONTRACT: ['draft', 'negotiation', 'pending', 'active', 'expired', 'terminated']
  };

  /**
   * Validates business hours and working time
   * @static
   * @param {Date|string} dateTime - Date/time to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.allowWeekends=false] - Allow weekend times
   * @param {boolean} [options.allowHolidays=false] - Allow holiday times
   * @param {number} [options.startHour] - Custom start hour
   * @param {number} [options.endHour] - Custom end hour
   * @returns {Object} Validation result
   */
  static validateBusinessHours(dateTime, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!dateTime) {
      result.message = 'Date/time is required';
      return result;
    }
    
    const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
    
    if (isNaN(date.getTime())) {
      result.message = 'Invalid date/time format';
      return result;
    }
    
    const {
      allowWeekends = false,
      allowHolidays = false,
      startHour = this.#BUSINESS_HOURS.start,
      endHour = this.#BUSINESS_HOURS.end
    } = options;
    
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    
    // Check weekend
    if (!allowWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      result.message = 'Date falls on a weekend';
      return result;
    }
    
    // Check business hours
    if (hour < startHour || hour >= endHour) {
      result.message = `Time must be between ${startHour}:00 and ${endHour}:00`;
      return result;
    }
    
    // Check holidays (simplified - in production, use a holiday calendar API)
    if (!allowHolidays && this.#isHoliday(date)) {
      result.message = 'Date falls on a holiday';
      return result;
    }
    
    result.isValid = true;
    result.nextBusinessDay = this.#getNextBusinessDay(date);
    return result;
  }

  /**
   * Validates project code format
   * @static
   * @param {string} projectCode - Project code to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateProjectCode(projectCode, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!projectCode || typeof projectCode !== 'string') {
      result.message = 'Project code is required';
      return result;
    }
    
    const upperCode = projectCode.toUpperCase().trim();
    
    if (!this.#PROJECT_CODE_REGEX.test(upperCode)) {
      result.message = 'Invalid project code format (Expected: ABC-1234-X1Y)';
      return result;
    }
    
    // Extract parts
    const [prefix, year, suffix] = upperCode.split('-');
    
    // Validate year
    const currentYear = new Date().getFullYear();
    const codeYear = parseInt(year);
    
    if (codeYear < 2020 || codeYear > currentYear + 1) {
      result.message = 'Project year is out of valid range';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = upperCode;
    result.components = { prefix, year: codeYear, suffix };
    return result;
  }

  /**
   * Validates financial amount
   * @static
   * @param {number|string} amount - Amount to validate
   * @param {Object} [options={}] - Validation options
   * @param {string} [options.currency='USD'] - Currency code
   * @param {number} [options.min=0] - Minimum amount
   * @param {number} [options.max] - Maximum amount
   * @param {boolean} [options.allowNegative=false] - Allow negative amounts
   * @returns {Object} Validation result
   */
  static validateFinancialAmount(amount, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!CommonValidator.isDefined(amount)) {
      result.message = 'Amount is required';
      return result;
    }
    
    const {
      currency = 'USD',
      min = 0,
      max,
      allowNegative = false
    } = options;
    
    const numAmount = Number(amount);
    
    if (isNaN(numAmount) || !isFinite(numAmount)) {
      result.message = 'Invalid amount format';
      return result;
    }
    
    // Check negative values
    if (!allowNegative && numAmount < 0) {
      result.message = 'Negative amounts are not allowed';
      return result;
    }
    
    // Check range
    if (numAmount < min) {
      result.message = `Amount must be at least ${min}`;
      return result;
    }
    
    if (max !== undefined && numAmount > max) {
      result.message = `Amount must not exceed ${max}`;
      return result;
    }
    
    // Check precision
    const precision = this.#CURRENCY_PRECISION[currency] || 2;
    const factor = Math.pow(10, precision);
    const rounded = Math.round(numAmount * factor) / factor;
    
    if (rounded !== numAmount) {
      result.message = `Amount precision exceeds ${precision} decimal places for ${currency}`;
      return result;
    }
    
    result.isValid = true;
    result.sanitized = rounded;
    result.formatted = this.#formatCurrency(rounded, currency);
    result.precision = precision;
    return result;
  }

  /**
   * Validates date range
   * @static
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.minDays] - Minimum days between dates
   * @param {number} [options.maxDays] - Maximum days between dates
   * @param {boolean} [options.allowPastDates=false] - Allow dates in the past
   * @param {boolean} [options.allowSameDay=false] - Allow same day range
   * @returns {Object} Validation result
   */
  static validateDateRange(startDate, endDate, options = {}) {
    const result = {
      isValid: false,
      message: '',
      duration: null
    };
    
    if (!startDate || !endDate) {
      result.message = 'Both start and end dates are required';
      return result;
    }
    
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      result.message = 'Invalid date format';
      return result;
    }
    
    const {
      minDays,
      maxDays,
      allowPastDates = false,
      allowSameDay = false
    } = options;
    
    // Check if end is before start
    if (end < start) {
      result.message = 'End date cannot be before start date';
      return result;
    }
    
    // Check same day
    if (!allowSameDay && DateHelper.isSameDay(start, end)) {
      result.message = 'Start and end dates cannot be the same';
      return result;
    }
    
    // Check past dates
    if (!allowPastDates) {
      const now = new Date();
      if (start < now) {
        result.message = 'Start date cannot be in the past';
        return result;
      }
    }
    
    // Calculate duration
    const daysDiff = DateHelper.daysBetween(start, end);
    
    // Check minimum duration
    if (minDays !== undefined && daysDiff < minDays) {
      result.message = `Duration must be at least ${minDays} days`;
      return result;
    }
    
    // Check maximum duration
    if (maxDays !== undefined && daysDiff > maxDays) {
      result.message = `Duration must not exceed ${maxDays} days`;
      return result;
    }
    
    result.isValid = true;
    result.duration = {
      days: daysDiff,
      businessDays: this.#calculateBusinessDays(start, end),
      weeks: Math.floor(daysDiff / 7),
      months: DateHelper.monthsBetween(start, end)
    };
    result.sanitized = {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
    
    return result;
  }

  /**
   * Validates workflow state transition
   * @static
   * @param {string} currentState - Current state
   * @param {string} newState - New state to transition to
   * @param {string} workflowType - Type of workflow
   * @returns {Object} Validation result
   */
  static validateWorkflowTransition(currentState, newState, workflowType) {
    const result = { isValid: false, message: '' };
    
    if (!currentState || !newState || !workflowType) {
      result.message = 'Current state, new state, and workflow type are required';
      return result;
    }
    
    const workflow = this.#WORKFLOW_STATES[workflowType.toUpperCase()];
    
    if (!workflow) {
      result.message = 'Invalid workflow type';
      return result;
    }
    
    const normalizedCurrent = currentState.toLowerCase();
    const normalizedNew = newState.toLowerCase();
    
    // Check if states exist in workflow
    if (!workflow.includes(normalizedCurrent)) {
      result.message = 'Current state is not valid for this workflow';
      return result;
    }
    
    if (!workflow.includes(normalizedNew)) {
      result.message = 'New state is not valid for this workflow';
      return result;
    }
    
    // Define valid transitions
    const validTransitions = this.#getValidTransitions(workflowType, normalizedCurrent);
    
    if (!validTransitions.includes(normalizedNew)) {
      result.message = `Cannot transition from '${normalizedCurrent}' to '${normalizedNew}'`;
      result.allowedTransitions = validTransitions;
      return result;
    }
    
    result.isValid = true;
    result.transition = {
      from: normalizedCurrent,
      to: normalizedNew,
      workflow: workflowType
    };
    
    return result;
  }

  /**
   * Validates resource allocation
   * @static
   * @param {Object} allocation - Resource allocation details
   * @returns {Object} Validation result
   */
  static validateResourceAllocation(allocation) {
    const result = {
      isValid: true,
      errors: {},
      warnings: {},
      sanitized: {}
    };
    
    if (!allocation || typeof allocation !== 'object') {
      result.isValid = false;
      result.errors.allocation = 'Allocation data is required';
      return result;
    }
    
    // Validate resource ID
    if (!allocation.resourceId) {
      result.isValid = false;
      result.errors.resourceId = 'Resource ID is required';
    } else if (!this.#RESOURCE_ID_REGEX.test(allocation.resourceId)) {
      result.isValid = false;
      result.errors.resourceId = 'Invalid resource ID format';
    } else {
      result.sanitized.resourceId = allocation.resourceId;
    }
    
    // Validate allocation percentage
    if (allocation.percentage !== undefined) {
      const percentage = Number(allocation.percentage);
      
      if (isNaN(percentage)) {
        result.isValid = false;
        result.errors.percentage = 'Percentage must be a number';
      } else if (percentage < 0 || percentage > 100) {
        result.isValid = false;
        result.errors.percentage = 'Percentage must be between 0 and 100';
      } else {
        result.sanitized.percentage = percentage;
        
        // Warnings for allocation levels
        if (percentage > 90) {
          result.warnings.percentage = 'Resource is nearly fully allocated';
        } else if (percentage < 10) {
          result.warnings.percentage = 'Resource has very low allocation';
        }
      }
    }
    
    // Validate hours per week
    if (allocation.hoursPerWeek !== undefined) {
      const hours = Number(allocation.hoursPerWeek);
      
      if (isNaN(hours)) {
        result.isValid = false;
        result.errors.hoursPerWeek = 'Hours must be a number';
      } else if (hours < 0 || hours > 60) {
        result.isValid = false;
        result.errors.hoursPerWeek = 'Hours per week must be between 0 and 60';
      } else {
        result.sanitized.hoursPerWeek = hours;
        
        if (hours > 40) {
          result.warnings.hoursPerWeek = 'Allocation exceeds standard work week';
        }
      }
    }
    
    // Validate allocation period
    if (allocation.startDate && allocation.endDate) {
      const periodValidation = this.validateDateRange(
        allocation.startDate,
        allocation.endDate,
        { minDays: 1, allowSameDay: true }
      );
      
      if (!periodValidation.isValid) {
        result.isValid = false;
        result.errors.period = periodValidation.message;
      } else {
        result.sanitized.startDate = periodValidation.sanitized.startDate;
        result.sanitized.endDate = periodValidation.sanitized.endDate;
        result.sanitized.duration = periodValidation.duration;
      }
    }
    
    return result;
  }

  /**
   * Validates scheduling conflict
   * @static
   * @param {Object} newSchedule - New schedule to validate
   * @param {Array} existingSchedules - Existing schedules to check against
   * @returns {Object} Validation result with conflicts
   */
  static validateSchedulingConflict(newSchedule, existingSchedules = []) {
    const result = {
      isValid: true,
      conflicts: [],
      overlaps: []
    };
    
    if (!newSchedule || typeof newSchedule !== 'object') {
      result.isValid = false;
      result.message = 'Schedule data is required';
      return result;
    }
    
    if (!newSchedule.startTime || !newSchedule.endTime) {
      result.isValid = false;
      result.message = 'Start and end times are required';
      return result;
    }
    
    const newStart = new Date(newSchedule.startTime);
    const newEnd = new Date(newSchedule.endTime);
    
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      result.isValid = false;
      result.message = 'Invalid date format';
      return result;
    }
    
    // Check each existing schedule
    for (const existing of existingSchedules) {
      if (!existing.startTime || !existing.endTime) continue;
      
      const existingStart = new Date(existing.startTime);
      const existingEnd = new Date(existing.endTime);
      
      if (isNaN(existingStart.getTime()) || isNaN(existingEnd.getTime())) continue;
      
      // Check for overlap
      const hasOverlap = (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      );
      
      if (hasOverlap) {
        const conflict = {
          id: existing.id,
          title: existing.title,
          startTime: existingStart.toISOString(),
          endTime: existingEnd.toISOString(),
          overlapType: this.#getOverlapType(newStart, newEnd, existingStart, existingEnd)
        };
        
        result.conflicts.push(conflict);
        
        // Determine if it's a hard conflict or soft overlap
        if (existing.mandatory || newSchedule.mandatory) {
          result.isValid = false;
        } else {
          result.overlaps.push(conflict);
        }
      }
    }
    
    if (!result.isValid) {
      result.message = `Schedule conflicts with ${result.conflicts.length} existing item(s)`;
    }
    
    return result;
  }

  /**
   * Validates invoice number format
   * @static
   * @param {string} invoiceNumber - Invoice number to validate
   * @returns {Object} Validation result
   */
  static validateInvoiceNumber(invoiceNumber) {
    const result = { isValid: false, message: '' };
    
    if (!invoiceNumber || typeof invoiceNumber !== 'string') {
      result.message = 'Invoice number is required';
      return result;
    }
    
    const upper = invoiceNumber.toUpperCase().trim();
    
    if (!this.#INVOICE_NUMBER_REGEX.test(upper)) {
      result.message = 'Invalid invoice format (Expected: INV-YYYY-000000)';
      return result;
    }
    
    // Extract components
    const parts = upper.split('-');
    const year = parseInt(parts[1]);
    const sequence = parseInt(parts[2]);
    
    // Validate year
    const currentYear = new Date().getFullYear();
    if (year < 2020 || year > currentYear) {
      result.message = 'Invoice year is invalid';
      return result;
    }
    
    // Validate sequence
    if (sequence < 1 || sequence > 999999) {
      result.message = 'Invoice sequence number out of range';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = upper;
    result.components = {
      prefix: 'INV',
      year,
      sequence,
      formatted: `INV-${year}-${String(sequence).padStart(6, '0')}`
    };
    
    return result;
  }

  /**
   * Validates contract terms
   * @static
   * @param {Object} contract - Contract details
   * @returns {Object} Validation result
   */
  static validateContractTerms(contract) {
    const result = {
      isValid: true,
      errors: {},
      warnings: {},
      sanitized: {}
    };
    
    if (!contract || typeof contract !== 'object') {
      result.isValid = false;
      result.errors.contract = 'Contract data is required';
      return result;
    }
    
    // Validate contract ID
    if (!contract.contractId) {
      result.isValid = false;
      result.errors.contractId = 'Contract ID is required';
    } else if (!this.#CONTRACT_ID_REGEX.test(contract.contractId)) {
      result.isValid = false;
      result.errors.contractId = 'Invalid contract ID format';
    } else {
      result.sanitized.contractId = contract.contractId;
    }
    
    // Validate contract value
    if (contract.value !== undefined) {
      const valueValidation = this.validateFinancialAmount(contract.value, {
        currency: contract.currency || 'USD',
        min: 0,
        allowNegative: false
      });
      
      if (!valueValidation.isValid) {
        result.isValid = false;
        result.errors.value = valueValidation.message;
      } else {
        result.sanitized.value = valueValidation.sanitized;
        result.sanitized.formattedValue = valueValidation.formatted;
      }
    }
    
    // Validate contract period
    if (contract.startDate && contract.endDate) {
      const periodValidation = this.validateDateRange(
        contract.startDate,
        contract.endDate,
        { minDays: 1, maxDays: 3650, allowPastDates: true }
      );
      
      if (!periodValidation.isValid) {
        result.isValid = false;
        result.errors.period = periodValidation.message;
      } else {
        result.sanitized.startDate = periodValidation.sanitized.startDate;
        result.sanitized.endDate = periodValidation.sanitized.endDate;
        result.sanitized.duration = periodValidation.duration;
        
        // Warnings for contract duration
        if (periodValidation.duration.days > 1095) { // 3 years
          result.warnings.duration = 'Contract duration exceeds 3 years';
        }
        
        // Check if contract is expiring soon
        const daysUntilExpiry = DateHelper.daysBetween(new Date(), new Date(contract.endDate));
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
          result.warnings.expiry = `Contract expires in ${daysUntilExpiry} days`;
        }
      }
    }
    
    // Validate payment terms
    if (contract.paymentTerms) {
      const validTerms = ['net-15', 'net-30', 'net-45', 'net-60', 'due-on-receipt', 'prepaid'];
      if (!validTerms.includes(contract.paymentTerms)) {
        result.isValid = false;
        result.errors.paymentTerms = 'Invalid payment terms';
      } else {
        result.sanitized.paymentTerms = contract.paymentTerms;
      }
    }
    
    // Validate renewal terms
    if (contract.autoRenewal !== undefined) {
      result.sanitized.autoRenewal = Boolean(contract.autoRenewal);
      
      if (contract.autoRenewal && contract.renewalPeriod) {
        const validPeriods = ['monthly', 'quarterly', 'annually'];
        if (!validPeriods.includes(contract.renewalPeriod)) {
          result.isValid = false;
          result.errors.renewalPeriod = 'Invalid renewal period';
        } else {
          result.sanitized.renewalPeriod = contract.renewalPeriod;
        }
      }
    }
    
    return result;
  }

  /**
   * Validates priority and SLA
   * @static
   * @param {string} priority - Priority level
   * @param {Date|string} createdAt - Creation time
   * @returns {Object} Validation result with SLA details
   */
  static validatePriorityAndSLA(priority, createdAt) {
    const result = { isValid: false, message: '' };
    
    if (!priority) {
      result.message = 'Priority is required';
      return result;
    }
    
    const upperPriority = priority.toUpperCase();
    const priorityConfig = this.#PRIORITY_LEVELS[upperPriority];
    
    if (!priorityConfig) {
      result.message = 'Invalid priority level';
      result.validPriorities = Object.keys(this.#PRIORITY_LEVELS);
      return result;
    }
    
    if (!createdAt) {
      result.message = 'Creation time is required for SLA calculation';
      return result;
    }
    
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    
    if (isNaN(created.getTime())) {
      result.message = 'Invalid creation time';
      return result;
    }
    
    // Calculate SLA deadline
    const slaDeadline = new Date(created);
    slaDeadline.setHours(slaDeadline.getHours() + priorityConfig.slaHours);
    
    // Adjust for business hours
    const adjustedDeadline = this.#adjustToBusinessHours(slaDeadline);
    
    // Check if SLA is breached
    const now = new Date();
    const hoursRemaining = (adjustedDeadline - now) / (1000 * 60 * 60);
    
    result.isValid = true;
    result.priority = {
      level: upperPriority,
      value: priorityConfig.value,
      slaHours: priorityConfig.slaHours
    };
    result.sla = {
      deadline: adjustedDeadline.toISOString(),
      hoursRemaining: Math.max(0, hoursRemaining),
      isBreached: hoursRemaining < 0,
      percentageElapsed: Math.min(100, ((now - created) / (adjustedDeadline - created)) * 100)
    };
    
    if (result.sla.hoursRemaining < 2 && !result.sla.isBreached) {
      result.warning = 'SLA deadline approaching';
    }
    
    return result;
  }

  /**
   * Validates batch operation
   * @static
   * @param {Array} items - Items to process in batch
   * @param {string} operation - Operation type
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateBatchOperation(items, operation, options = {}) {
    const result = {
      isValid: true,
      errors: [],
      validItems: [],
      invalidItems: [],
      summary: {}
    };
    
    if (!Array.isArray(items)) {
      result.isValid = false;
      result.errors.push('Items must be an array');
      return result;
    }
    
    const {
      maxBatchSize = 1000,
      minBatchSize = 1,
      allowDuplicates = false,
      validateItem
    } = options;
    
    // Validate batch size
    if (items.length < minBatchSize) {
      result.isValid = false;
      result.errors.push(`Batch must contain at least ${minBatchSize} items`);
      return result;
    }
    
    if (items.length > maxBatchSize) {
      result.isValid = false;
      result.errors.push(`Batch size exceeds maximum of ${maxBatchSize} items`);
      return result;
    }
    
    // Validate operation
    const validOperations = ['create', 'update', 'delete', 'import', 'export', 'process'];
    if (!validOperations.includes(operation)) {
      result.isValid = false;
      result.errors.push('Invalid operation type');
      return result;
    }
    
    // Check for duplicates
    if (!allowDuplicates) {
      const uniqueIds = new Set();
      const duplicates = [];
      
      items.forEach((item, index) => {
        const id = item.id || item._id || index;
        if (uniqueIds.has(id)) {
          duplicates.push(id);
        }
        uniqueIds.add(id);
      });
      
      if (duplicates.length > 0) {
        result.isValid = false;
        result.errors.push(`Duplicate items found: ${duplicates.join(', ')}`);
      }
    }
    
    // Validate individual items
    if (validateItem && typeof validateItem === 'function') {
      items.forEach((item, index) => {
        const itemValidation = validateItem(item);
        
        if (itemValidation.isValid) {
          result.validItems.push({ index, item, validation: itemValidation });
        } else {
          result.invalidItems.push({ index, item, errors: itemValidation.errors });
        }
      });
      
      if (result.invalidItems.length > 0) {
        result.isValid = false;
        result.errors.push(`${result.invalidItems.length} items failed validation`);
      }
    } else {
      result.validItems = items.map((item, index) => ({ index, item }));
    }
    
    // Summary
    result.summary = {
      totalItems: items.length,
      validItems: result.validItems.length,
      invalidItems: result.invalidItems.length,
      operation,
      estimatedProcessingTime: this.#estimateProcessingTime(items.length, operation)
    };
    
    return result;
  }

  /**
   * Checks if date is a holiday
   * @private
   * @static
   * @param {Date} date - Date to check
   * @returns {boolean} True if holiday
   */
  static #isHoliday(date) {
    // Simplified holiday check - in production, use a proper holiday calendar
    const holidays = [
      '01-01', // New Year's Day
      '07-04', // Independence Day (US)
      '12-25', // Christmas
      '12-26'  // Boxing Day
    ];
    
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return holidays.includes(monthDay);
  }

  /**
   * Gets next business day
   * @private
   * @static
   * @param {Date} date - Current date
   * @returns {Date} Next business day
   */
  static #getNextBusinessDay(date) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    
    while (next.getDay() === 0 || next.getDay() === 6 || this.#isHoliday(next)) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  /**
   * Calculates business days between dates
   * @private
   * @static
   * @param {Date} start - Start date
   * @param {Date} end - End date
   * @returns {number} Number of business days
   */
  static #calculateBusinessDays(start, end) {
    let count = 0;
    const current = new Date(start);
    
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !this.#isHoliday(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  /**
   * Formats currency amount
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  static #formatCurrency(amount, currency) {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: this.#CURRENCY_PRECISION[currency] || 2,
      maximumFractionDigits: this.#CURRENCY_PRECISION[currency] || 2
    });
    
    return formatter.format(amount);
  }

  /**
   * Gets valid workflow transitions
   * @private
   * @static
   * @param {string} workflowType - Workflow type
   * @param {string} currentState - Current state
   * @returns {Array} Valid next states
   */
  static #getValidTransitions(workflowType, currentState) {
    const transitions = {
      PROJECT: {
        'draft': ['planning', 'cancelled'],
        'planning': ['active', 'cancelled'],
        'active': ['on-hold', 'completed', 'cancelled'],
        'on-hold': ['active', 'cancelled'],
        'completed': ['archived'],
        'cancelled': ['archived'],
        'archived': []
      },
      TASK: {
        'todo': ['in-progress', 'blocked'],
        'in-progress': ['review', 'blocked', 'todo'],
        'review': ['testing', 'in-progress'],
        'testing': ['done', 'in-progress'],
        'done': [],
        'blocked': ['todo', 'in-progress']
      },
      INVOICE: {
        'draft': ['sent', 'cancelled'],
        'sent': ['viewed', 'paid', 'overdue', 'cancelled'],
        'viewed': ['paid', 'partial', 'overdue', 'cancelled'],
        'partial': ['paid', 'overdue'],
        'paid': [],
        'overdue': ['paid', 'cancelled'],
        'cancelled': []
      },
      CONTRACT: {
        'draft': ['negotiation', 'cancelled'],
        'negotiation': ['pending', 'draft', 'cancelled'],
        'pending': ['active', 'cancelled'],
        'active': ['expired', 'terminated'],
        'expired': ['terminated'],
        'terminated': []
      }
    };
    
    const workflow = transitions[workflowType.toUpperCase()];
    return workflow ? (workflow[currentState] || []) : [];
  }

  /**
   * Determines overlap type
   * @private
   * @static
   * @param {Date} start1 - First start time
   * @param {Date} end1 - First end time
   * @param {Date} start2 - Second start time
   * @param {Date} end2 - Second end time
   * @returns {string} Overlap type
   */
  static #getOverlapType(start1, end1, start2, end2) {
    if (start1.getTime() === start2.getTime() && end1.getTime() === end2.getTime()) {
      return 'exact';
    } else if (start1 >= start2 && end1 <= end2) {
      return 'contained';
    } else if (start1 <= start2 && end1 >= end2) {
      return 'contains';
    } else if (start1 < start2 && end1 > start2 && end1 <= end2) {
      return 'starts-before';
    } else if (start1 >= start2 && start1 < end2 && end1 > end2) {
      return 'ends-after';
    }
    return 'partial';
  }

  /**
   * Adjusts datetime to business hours
   * @private
   * @static
   * @param {Date} date - Date to adjust
   * @returns {Date} Adjusted date
   */
  static #adjustToBusinessHours(date) {
    const adjusted = new Date(date);
    const hour = adjusted.getHours();
    const dayOfWeek = adjusted.getDay();
    
    // If weekend, move to Monday
    if (dayOfWeek === 0) {
      adjusted.setDate(adjusted.getDate() + 1);
    } else if (dayOfWeek === 6) {
      adjusted.setDate(adjusted.getDate() + 2);
    }
    
    // If before business hours, set to start of business day
    if (hour < this.#BUSINESS_HOURS.start) {
      adjusted.setHours(this.#BUSINESS_HOURS.start, 0, 0, 0);
    }
    // If after business hours, move to next business day
    else if (hour >= this.#BUSINESS_HOURS.end) {
      adjusted.setDate(adjusted.getDate() + 1);
      adjusted.setHours(this.#BUSINESS_HOURS.start, 0, 0, 0);
      
      // Check if new date is weekend
      const newDay = adjusted.getDay();
      if (newDay === 0) {
        adjusted.setDate(adjusted.getDate() + 1);
      } else if (newDay === 6) {
        adjusted.setDate(adjusted.getDate() + 2);
      }
    }
    
    return adjusted;
  }

  /**
   * Estimates processing time for batch operations
   * @private
   * @static
   * @param {number} itemCount - Number of items
   * @param {string} operation - Operation type
   * @returns {Object} Time estimates
   */
  static #estimateProcessingTime(itemCount, operation) {
    const baseTimePerItem = {
      'create': 50,    // 50ms per item
      'update': 30,    // 30ms per item
      'delete': 20,    // 20ms per item
      'import': 100,   // 100ms per item
      'export': 10,    // 10ms per item
      'process': 75    // 75ms per item
    };
    
    const timePerItem = baseTimePerItem[operation] || 50;
    const totalMs = itemCount * timePerItem;
    
    return {
      milliseconds: totalMs,
      seconds: Math.ceil(totalMs / 1000),
      minutes: Math.ceil(totalMs / 60000),
      formatted: totalMs < 60000 
        ? `${Math.ceil(totalMs / 1000)} seconds`
        : `${Math.ceil(totalMs / 60000)} minutes`
    };
  }

  /**
   * Creates custom validation chain
   * @static
   * @param {string} type - Validation type
   * @returns {Function} Validator function
   */
  static createValidator(type) {
    const validators = {
      businessHours: (value, options) => this.validateBusinessHours(value, options),
      projectCode: (value) => this.validateProjectCode(value),
      financialAmount: (value, options) => this.validateFinancialAmount(value, options),
      dateRange: (start, end, options) => this.validateDateRange(start, end, options),
      workflowTransition: (current, next, workflow) => this.validateWorkflowTransition(current, next, workflow),
      resourceAllocation: (allocation) => this.validateResourceAllocation(allocation),
      schedulingConflict: (schedule, existing) => this.validateSchedulingConflict(schedule, existing),
      invoiceNumber: (value) => this.validateInvoiceNumber(value),
      contractTerms: (contract) => this.validateContractTerms(contract),
      priorityAndSLA: (priority, created) => this.validatePriorityAndSLA(priority, created),
      batchOperation: (items, operation, options) => this.validateBatchOperation(items, operation, options)
    };
    
    return validators[type] || null;
  }
}

module.exports = CustomValidator;