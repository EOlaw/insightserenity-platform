'use strict';

/**
 * @fileoverview Administrative utility helpers for platform management
 * @module servers/admin-server/utils/admin-helpers
 * @requires module:shared/lib/utils/helpers
 * @requires module:shared/lib/utils/constants
 * @requires module:servers/admin-server/config
 */

const { dateHelper, stringHelper, paginationHelper } = require('../../../shared/lib/utils/helpers');
const { ROLES, PERMISSIONS } = require('../../../shared/lib/utils/constants');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class AdminHelpers
 * @description Comprehensive utility functions for administrative operations
 */
class AdminHelpers {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #roleHierarchy = {
    [ROLES.SUPER_ADMIN]: 100,
    [ROLES.PLATFORM_ADMIN]: 90,
    [ROLES.ORGANIZATION_ADMIN]: 80,
    [ROLES.BILLING_ADMIN]: 70,
    [ROLES.SUPPORT_ADMIN]: 60,
    [ROLES.SECURITY_ADMIN]: 60,
    [ROLES.USER_ADMIN]: 50,
    [ROLES.VIEWER]: 10
  };

  /**
   * Check if admin has required permission
   * @static
   * @param {Object} admin - Admin user object
   * @param {string|Array<string>} requiredPermissions - Required permissions
   * @param {Object} [options={}] - Check options
   * @returns {boolean} True if has permission
   */
  static hasPermission(admin, requiredPermissions, options = {}) {
    const { requireAll = false, checkRestrictions = true } = options;

    if (!admin || !admin.permissions) {
      return false;
    }

    // Super admin bypass
    if (admin.role === ROLES.SUPER_ADMIN && !options.strictCheck) {
      return true;
    }

    const permissions = Array.isArray(requiredPermissions) 
      ? requiredPermissions 
      : [requiredPermissions];

    // Check restrictions
    if (checkRestrictions && admin.restrictions) {
      const hasRestriction = permissions.some(perm => 
        admin.restrictions.includes(perm)
      );
      if (hasRestriction) {
        return false;
      }
    }

    // Check permissions
    if (requireAll) {
      return permissions.every(perm => admin.permissions.includes(perm));
    } else {
      return permissions.some(perm => admin.permissions.includes(perm));
    }
  }

  /**
   * Check if admin can manage another user based on role hierarchy
   * @static
   * @param {Object} admin - Admin user
   * @param {Object} targetUser - Target user
   * @returns {boolean} True if can manage
   */
  static canManageUser(admin, targetUser) {
    if (!admin || !targetUser) {
      return false;
    }

    // Super admin can manage everyone
    if (admin.role === ROLES.SUPER_ADMIN) {
      return true;
    }

    // Can't manage yourself
    if (admin._id === targetUser._id) {
      return false;
    }

    // Check role hierarchy
    const adminLevel = this.#roleHierarchy[admin.role] || 0;
    const targetLevel = this.#roleHierarchy[targetUser.role] || 0;

    return adminLevel > targetLevel;
  }

  /**
   * Generate admin session token with metadata
   * @static
   * @param {Object} admin - Admin user
   * @param {Object} [options={}] - Token options
   * @returns {Object} Token data
   */
  static generateAdminToken(admin, options = {}) {
    const {
      expiresIn = config.session?.timeout || 3600000,
      includePermissions = true,
      includeMeta = true
    } = options;

    const tokenId = crypto.randomUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + expiresIn;

    const tokenData = {
      tokenId,
      userId: admin._id,
      role: admin.role,
      issuedAt,
      expiresAt
    };

    if (includePermissions) {
      tokenData.permissions = admin.permissions;
      tokenData.restrictions = admin.restrictions;
    }

    if (includeMeta) {
      tokenData.meta = {
        ip: options.ip,
        userAgent: options.userAgent,
        deviceId: options.deviceId,
        sessionFingerprint: this.generateSessionFingerprint(options)
      };
    }

    return tokenData;
  }

  /**
   * Generate session fingerprint for security
   * @static
   * @param {Object} context - Request context
   * @returns {string} Session fingerprint
   */
  static generateSessionFingerprint(context) {
    const components = [
      context.userAgent || 'unknown',
      context.acceptLanguage || 'en',
      context.acceptEncoding || 'gzip',
      context.screenResolution || 'unknown',
      context.timezone || 'UTC'
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Format admin activity for display
   * @static
   * @param {Object} activity - Activity record
   * @param {Object} [options={}] - Format options
   * @returns {Object} Formatted activity
   */
  static formatAdminActivity(activity, options = {}) {
    const {
      includeMetadata = true,
      includeTechnical = false,
      timezone = 'UTC'
    } = options;

    const formatted = {
      id: activity._id || activity.actionId,
      action: this.#humanizeAction(activity.action),
      user: activity.userId ? {
        id: activity.userId._id || activity.userId,
        name: activity.userId.name || 'Unknown User',
        email: activity.userId.email
      } : null,
      timestamp: dateHelper.formatDate(activity.timestamp, {
        format: 'YYYY-MM-DD HH:mm:ss',
        timezone
      }),
      relativeTime: dateHelper.fromNow(activity.timestamp),
      resource: activity.resource,
      resourceId: activity.resourceId,
      status: activity.status || 'completed'
    };

    if (includeMetadata && activity.metadata) {
      formatted.metadata = this.#filterMetadata(activity.metadata, includeTechnical);
    }

    if (activity.changes) {
      formatted.changes = this.#formatChanges(activity.changes);
    }

    return formatted;
  }

  /**
   * Build admin dashboard statistics
   * @static
   * @param {Object} data - Raw statistics data
   * @returns {Object} Formatted dashboard stats
   */
  static buildDashboardStats(data) {
    return {
      overview: {
        totalUsers: data.users?.total || 0,
        activeUsers: data.users?.active || 0,
        totalOrganizations: data.organizations?.total || 0,
        activeSubscriptions: data.subscriptions?.active || 0,
        revenue: {
          monthly: this.#formatCurrency(data.revenue?.monthly || 0),
          annual: this.#formatCurrency(data.revenue?.annual || 0),
          growth: this.#formatPercentage(data.revenue?.growth || 0)
        }
      },
      system: {
        health: data.system?.health || 'healthy',
        uptime: this.#formatUptime(data.system?.uptime || 0),
        performance: {
          responseTime: `${data.system?.avgResponseTime || 0}ms`,
          errorRate: this.#formatPercentage(data.system?.errorRate || 0),
          throughput: `${data.system?.throughput || 0} req/s`
        }
      },
      security: {
        failedLogins: data.security?.failedLogins || 0,
        suspiciousActivities: data.security?.suspiciousActivities || 0,
        blockedIPs: data.security?.blockedIPs || 0,
        lastSecurityScan: dateHelper.fromNow(data.security?.lastScan)
      },
      recent: {
        newUsers: data.recent?.users || [],
        activities: data.recent?.activities || [],
        alerts: data.recent?.alerts || []
      }
    };
  }

  /**
   * Validate and sanitize admin input
   * @static
   * @param {Object} input - Input data
   * @param {Object} schema - Validation schema
   * @returns {Object} Sanitized input
   */
  static sanitizeAdminInput(input, schema = {}) {
    const sanitized = {};

    Object.keys(schema).forEach(key => {
      const rule = schema[key];
      const value = input[key];

      if (value === undefined && rule.required) {
        throw new Error(`Missing required field: ${key}`);
      }

      if (value !== undefined) {
        // Type validation
        if (rule.type && typeof value !== rule.type) {
          throw new Error(`Invalid type for ${key}: expected ${rule.type}`);
        }

        // Custom validation
        if (rule.validate && !rule.validate(value)) {
          throw new Error(`Invalid value for ${key}`);
        }

        // Sanitization
        if (rule.sanitize) {
          sanitized[key] = rule.sanitize(value);
        } else {
          sanitized[key] = value;
        }
      } else if (rule.default !== undefined) {
        sanitized[key] = typeof rule.default === 'function' 
          ? rule.default() 
          : rule.default;
      }
    });

    return sanitized;
  }

  /**
   * Build admin filter query
   * @static
   * @param {Object} filters - Filter parameters
   * @param {Object} [options={}] - Query options
   * @returns {Object} MongoDB query
   */
  static buildAdminQuery(filters, options = {}) {
    const {
      searchFields = ['name', 'email', 'description'],
      dateFields = ['createdAt', 'updatedAt'],
      allowedFilters = null
    } = options;

    const query = {};

    // Text search
    if (filters.search) {
      query.$or = searchFields.map(field => ({
        [field]: { $regex: filters.search, $options: 'i' }
      }));
    }

    // Status filter
    if (filters.status) {
      query.status = filters.status;
    }

    // Date range filters
    dateFields.forEach(field => {
      if (filters[`${field}Start`] || filters[`${field}End`]) {
        query[field] = {};
        if (filters[`${field}Start`]) {
          query[field].$gte = new Date(filters[`${field}Start`]);
        }
        if (filters[`${field}End`]) {
          query[field].$lte = new Date(filters[`${field}End`]);
        }
      }
    });

    // Custom filters
    if (allowedFilters) {
      allowedFilters.forEach(filter => {
        if (filters[filter] !== undefined) {
          query[filter] = filters[filter];
        }
      });
    }

    // Organization filter for multi-tenant
    if (filters.organizationId) {
      query.organizationId = filters.organizationId;
    }

    return query;
  }

  /**
   * Generate admin report filename
   * @static
   * @param {string} reportType - Type of report
   * @param {Object} [options={}] - Filename options
   * @returns {string} Generated filename
   */
  static generateReportFilename(reportType, options = {}) {
    const {
      format = 'csv',
      includeTimestamp = true,
      prefix = 'admin-report',
      organizationId
    } = options;

    const parts = [prefix, reportType];
    
    if (organizationId) {
      parts.push(organizationId);
    }

    if (includeTimestamp) {
      parts.push(dateHelper.formatDate(new Date(), {
        format: 'YYYYMMDD-HHmmss'
      }));
    }

    return `${parts.join('-')}.${format}`;
  }

  /**
   * Calculate admin metrics
   * @static
   * @param {Array} data - Data array
   * @param {string} field - Field to calculate
   * @returns {Object} Calculated metrics
   */
  static calculateMetrics(data, field) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        count: 0,
        sum: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }

    const values = data.map(item => item[field] || 0).sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    
    return {
      count: values.length,
      sum,
      average: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      median: values[Math.floor(values.length / 2)]
    };
  }

  /**
   * Humanize action names
   * @private
   * @static
   * @param {string} action - Action string
   * @returns {string} Humanized action
   */
  static #humanizeAction(action) {
    return action
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .replace(/_/g, ' ');
  }

  /**
   * Filter metadata for display
   * @private
   * @static
   * @param {Object} metadata - Raw metadata
   * @param {boolean} includeTechnical - Include technical details
   * @returns {Object} Filtered metadata
   */
  static #filterMetadata(metadata, includeTechnical) {
    const filtered = {};
    const technicalFields = ['stack', 'headers', 'query', 'params'];

    Object.keys(metadata).forEach(key => {
      if (!includeTechnical && technicalFields.includes(key)) {
        return;
      }
      filtered[key] = metadata[key];
    });

    return filtered;
  }

  /**
   * Format changes for display
   * @private
   * @static
   * @param {Object} changes - Change object
   * @returns {Object} Formatted changes
   */
  static #formatChanges(changes) {
    const formatted = {};

    if (changes.old) {
      formatted.previous = changes.old;
    }

    if (changes.new) {
      formatted.current = changes.new;
    }

    if (changes.fields) {
      formatted.modifiedFields = changes.fields;
    }

    return formatted;
  }

  /**
   * Format currency
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @returns {string} Formatted currency
   */
  static #formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  }

  /**
   * Format percentage
   * @private
   * @static
   * @param {number} value - Percentage value
   * @returns {string} Formatted percentage
   */
  static #formatPercentage(value) {
    return `${(value * 100).toFixed(2)}%`;
  }

  /**
   * Format uptime
   * @private
   * @static
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted uptime
   */
  static #formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
  }
}

module.exports = AdminHelpers;