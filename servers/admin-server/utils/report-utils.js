'use strict';

/**
 * @fileoverview Report generation and management utilities for administrative reporting
 * @module servers/admin-server/utils/report-utils
 * @requires module:shared/lib/utils/helpers
 * @requires module:shared/lib/services/file-service
 * @requires module:servers/admin-server/config
 */

const { dateHelper, stringHelper, numberFormatter } = require('../../../shared/lib/utils/helpers');
const FileService = require('../../../shared/lib/services/file-service');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class ReportUtils
 * @description Comprehensive report generation and management utilities
 */
class ReportUtils {
  /**
   * @private
   * @static
   * @type {FileService}
   */
  static #fileService = new FileService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    formats: config.reports?.supportedFormats || ['csv', 'xlsx', 'pdf', 'json'],
    templates: config.reports?.templatesPath || './templates/reports',
    tempDirectory: config.reports?.tempDirectory || './temp/reports',
    maxRows: config.reports?.maxRows || 100000,
    compression: config.reports?.compression !== false,
    encryption: config.reports?.encryption || false,
    watermark: config.reports?.watermark || 'InsightSerenity Platform'
  };

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #reportTemplates = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #reportDefinitions = new Map([
    ['user-activity', {
      name: 'User Activity Report',
      description: 'Comprehensive user activity and engagement metrics',
      sections: ['summary', 'details', 'trends', 'recommendations'],
      defaultPeriod: 30
    }],
    ['financial-summary', {
      name: 'Financial Summary Report',
      description: 'Revenue, billing, and subscription analytics',
      sections: ['revenue', 'subscriptions', 'transactions', 'forecasts'],
      defaultPeriod: 90
    }],
    ['security-audit', {
      name: 'Security Audit Report',
      description: 'Security events, access logs, and compliance status',
      sections: ['overview', 'incidents', 'access-logs', 'compliance'],
      defaultPeriod: 30
    }],
    ['platform-health', {
      name: 'Platform Health Report',
      description: 'System performance, uptime, and resource utilization',
      sections: ['metrics', 'performance', 'errors', 'recommendations'],
      defaultPeriod: 7
    }],
    ['organization-overview', {
      name: 'Organization Overview Report',
      description: 'Multi-tenant organization statistics and usage',
      sections: ['organizations', 'users', 'usage', 'growth'],
      defaultPeriod: 30
    }]
  ]);

  /**
   * Generate comprehensive report
   * @static
   * @param {string} reportType - Type of report
   * @param {Object} parameters - Report parameters
   * @param {Object} [options={}] - Generation options
   * @returns {Promise<Object>} Generated report
   */
  static async generateReport(reportType, parameters, options = {}) {
    const {
      format = 'pdf',
      includeCharts = true,
      compress = this.#config.compression,
      encrypt = this.#config.encryption,
      watermark = true
    } = options;

    // Validate report type
    const reportDef = this.#reportDefinitions.get(reportType);
    if (!reportDef) {
      throw new Error(`Unknown report type: ${reportType}`);
    }

    // Generate report ID
    const reportId = crypto.randomUUID();
    const timestamp = new Date();

    // Collect report data
    const reportData = await this.#collectReportData(reportType, parameters);

    // Build report structure
    const report = {
      reportId,
      type: reportType,
      name: reportDef.name,
      generatedAt: timestamp,
      generatedBy: parameters.userId,
      parameters,
      data: reportData,
      summary: this.#generateReportSummary(reportData, reportType),
      sections: await this.#buildReportSections(reportType, reportData, reportDef.sections),
      metadata: {
        format,
        rowCount: this.#countReportRows(reportData),
        dataRange: this.#getDataRange(parameters),
        version: config.app?.version
      }
    };

    // Add charts if requested
    if (includeCharts && format !== 'csv') {
      report.charts = await this.#generateReportCharts(reportType, reportData);
    }

    // Format report based on output type
    let formattedReport = await this.#formatReport(report, format);

    // Add watermark if requested
    if (watermark && format === 'pdf') {
      formattedReport = await this.#addWatermark(formattedReport);
    }

    // Compress if requested
    if (compress) {
      formattedReport = await this.#compressReport(formattedReport, format);
    }

    // Encrypt if requested
    if (encrypt) {
      formattedReport = await this.#encryptReport(formattedReport);
    }

    return {
      reportId,
      type: reportType,
      name: reportDef.name,
      format,
      generatedAt: timestamp,
      size: Buffer.byteLength(formattedReport),
      compressed: compress,
      encrypted: encrypt,
      data: formattedReport,
      downloadUrl: await this.#generateDownloadUrl(reportId, format)
    };
  }

  /**
   * Schedule recurring report
   * @static
   * @param {Object} schedule - Report schedule configuration
   * @returns {Promise<Object>} Schedule confirmation
   */
  static async scheduleReport(schedule) {
    const {
      reportType,
      parameters,
      frequency, // daily, weekly, monthly
      recipients,
      format = 'pdf',
      enabled = true
    } = schedule;

    const scheduleId = crypto.randomUUID();

    // Validate schedule
    this.#validateSchedule(schedule);

    // Create schedule entry
    const scheduleEntry = {
      scheduleId,
      reportType,
      parameters,
      frequency,
      recipients,
      format,
      enabled,
      nextRun: this.#calculateNextRun(frequency),
      lastRun: null,
      createdAt: new Date(),
      createdBy: parameters.userId
    };

    // Store schedule (would be saved to database)
    // For now, return confirmation
    return {
      scheduleId,
      reportType,
      frequency,
      nextRun: scheduleEntry.nextRun,
      status: 'scheduled'
    };
  }

  /**
   * Build report from template
   * @static
   * @param {string} templateName - Template name
   * @param {Object} data - Report data
   * @param {Object} [options={}] - Template options
   * @returns {Promise<Object>} Generated report
   */
  static async buildFromTemplate(templateName, data, options = {}) {
    const template = await this.#loadTemplate(templateName);
    
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Process template sections
    const processedSections = await Promise.all(
      template.sections.map(section => 
        this.#processTemplateSection(section, data, options)
      )
    );

    return {
      reportId: crypto.randomUUID(),
      templateName,
      generatedAt: new Date(),
      title: template.title,
      sections: processedSections,
      data
    };
  }

  /**
   * Aggregate report data
   * @static
   * @param {Array} data - Raw data
   * @param {Object} aggregation - Aggregation configuration
   * @returns {Object} Aggregated data
   */
  static aggregateData(data, aggregation) {
    const {
      groupBy,
      metrics,
      filters = {},
      sort,
      limit
    } = aggregation;

    // Apply filters
    let filteredData = this.#applyFilters(data, filters);

    // Group data
    const grouped = this.#groupData(filteredData, groupBy);

    // Calculate metrics
    const aggregated = {};
    
    Object.entries(grouped).forEach(([key, group]) => {
      aggregated[key] = this.#calculateMetrics(group, metrics);
    });

    // Sort results
    if (sort) {
      const sorted = Object.entries(aggregated)
        .sort((a, b) => this.#compareValues(a[1], b[1], sort));
      
      aggregated = Object.fromEntries(sorted);
    }

    // Apply limit
    if (limit) {
      const limited = Object.entries(aggregated).slice(0, limit);
      aggregated = Object.fromEntries(limited);
    }

    return aggregated;
  }

  /**
   * Generate report summary
   * @static
   * @param {Object} data - Report data
   * @param {string} reportType - Report type
   * @returns {Object} Summary statistics
   */
  static generateSummary(data, reportType) {
    const summary = {
      overview: {},
      highlights: [],
      trends: {},
      alerts: []
    };

    // Type-specific summaries
    switch (reportType) {
      case 'user-activity':
        summary.overview = {
          totalUsers: data.users?.length || 0,
          activeUsers: data.activeUsers || 0,
          newUsers: data.newUsers || 0,
          avgSessionDuration: data.avgSessionDuration || 0
        };
        break;

      case 'financial-summary':
        summary.overview = {
          totalRevenue: data.totalRevenue || 0,
          recurringRevenue: data.recurringRevenue || 0,
          avgTransactionValue: data.avgTransactionValue || 0,
          growthRate: data.growthRate || 0
        };
        break;

      case 'security-audit':
        summary.overview = {
          totalEvents: data.events?.length || 0,
          criticalEvents: data.criticalEvents || 0,
          failedLogins: data.failedLogins || 0,
          complianceScore: data.complianceScore || 0
        };
        break;

      default:
        summary.overview = this.#generateGenericSummary(data);
    }

    // Generate highlights
    summary.highlights = this.#generateHighlights(data, reportType);

    // Calculate trends
    summary.trends = this.#calculateTrends(data);

    // Generate alerts
    summary.alerts = this.#generateAlerts(data, reportType);

    return summary;
  }

  /**
   * Export report data
   * @static
   * @param {Object} data - Data to export
   * @param {string} format - Export format
   * @param {Object} [options={}] - Export options
   * @returns {Promise<Buffer>} Exported data
   */
  static async exportData(data, format, options = {}) {
    const {
      filename = `export-${Date.now()}`,
      headers = true,
      delimiter = ',',
      encoding = 'utf8'
    } = options;

    switch (format.toLowerCase()) {
      case 'csv':
        return this.#exportToCSV(data, { headers, delimiter, encoding });

      case 'xlsx':
      case 'excel':
        return this.#exportToExcel(data, options);

      case 'json':
        return Buffer.from(JSON.stringify(data, null, 2), encoding);

      case 'pdf':
        return this.#exportToPDF(data, options);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Validate report data
   * @static
   * @param {Object} data - Report data
   * @param {Object} schema - Validation schema
   * @returns {Object} Validation result
   */
  static validateReportData(data, schema) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (!data[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // Validate data types
    if (schema.fields) {
      Object.entries(schema.fields).forEach(([field, rules]) => {
        const value = data[field];
        
        if (value !== undefined) {
          // Type check
          if (rules.type && typeof value !== rules.type) {
            errors.push(`Invalid type for ${field}: expected ${rules.type}`);
          }

          // Range check
          if (rules.min !== undefined && value < rules.min) {
            warnings.push(`${field} is below minimum value ${rules.min}`);
          }
          
          if (rules.max !== undefined && value > rules.max) {
            warnings.push(`${field} exceeds maximum value ${rules.max}`);
          }

          // Custom validation
          if (rules.validate && !rules.validate(value)) {
            errors.push(`Invalid value for ${field}`);
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Collect report data
   * @private
   * @static
   * @param {string} reportType - Report type
   * @param {Object} parameters - Report parameters
   * @returns {Promise<Object>} Collected data
   */
  static async #collectReportData(reportType, parameters) {
    // This would typically query various services and databases
    // For demonstration, returning mock structure
    const mockData = {
      'user-activity': {
        users: [],
        sessions: [],
        activities: [],
        metrics: {}
      },
      'financial-summary': {
        transactions: [],
        subscriptions: [],
        revenue: {},
        forecasts: {}
      },
      'security-audit': {
        events: [],
        incidents: [],
        accessLogs: [],
        compliance: {}
      },
      'platform-health': {
        metrics: [],
        performance: {},
        errors: [],
        resources: {}
      },
      'organization-overview': {
        organizations: [],
        users: [],
        usage: {},
        growth: {}
      }
    };

    return mockData[reportType] || {};
  }

  /**
   * Build report sections
   * @private
   * @static
   * @param {string} reportType - Report type
   * @param {Object} data - Report data
   * @param {Array} sections - Section definitions
   * @returns {Promise<Array>} Built sections
   */
  static async #buildReportSections(reportType, data, sections) {
    return Promise.all(
      sections.map(async section => {
        const sectionData = await this.#extractSectionData(data, section);
        
        return {
          name: section,
          title: this.#formatSectionTitle(section),
          data: sectionData,
          summary: this.#summarizeSectionData(sectionData),
          visualizations: await this.#generateSectionVisualizations(sectionData, section)
        };
      })
    );
  }

  /**
   * Format report based on output type
   * @private
   * @static
   * @param {Object} report - Report object
   * @param {string} format - Output format
   * @returns {Promise<Buffer>} Formatted report
   */
  static async #formatReport(report, format) {
    switch (format) {
      case 'pdf':
        return this.#generatePDFReport(report);
      
      case 'xlsx':
        return this.#generateExcelReport(report);
      
      case 'csv':
        return this.#generateCSVReport(report);
      
      case 'json':
        return Buffer.from(JSON.stringify(report, null, 2));
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Export to CSV
   * @private
   * @static
   * @param {Object} data - Data to export
   * @param {Object} options - Export options
   * @returns {Buffer} CSV data
   */
  static #exportToCSV(data, options) {
    const { headers, delimiter, encoding } = options;
    const rows = [];

    // Flatten nested data
    const flatData = this.#flattenData(data);

    // Add headers
    if (headers && flatData.length > 0) {
      rows.push(Object.keys(flatData[0]).join(delimiter));
    }

    // Add data rows
    flatData.forEach(item => {
      const values = Object.values(item).map(value => 
        typeof value === 'string' && value.includes(delimiter) 
          ? `"${value.replace(/"/g, '""')}"` 
          : value
      );
      rows.push(values.join(delimiter));
    });

    return Buffer.from(rows.join('\n'), encoding);
  }

  /**
   * Flatten nested data structure
   * @private
   * @static
   * @param {Object|Array} data - Data to flatten
   * @param {string} [prefix=''] - Property prefix
   * @returns {Array} Flattened data
   */
  static #flattenData(data, prefix = '') {
    if (Array.isArray(data)) {
      return data.map(item => 
        typeof item === 'object' ? this.#flattenObject(item, prefix) : item
      );
    }
    
    return [this.#flattenObject(data, prefix)];
  }

  /**
   * Flatten object
   * @private
   * @static
   * @param {Object} obj - Object to flatten
   * @param {string} [prefix=''] - Property prefix
   * @returns {Object} Flattened object
   */
  static #flattenObject(obj, prefix = '') {
    const flattened = {};

    Object.entries(obj).forEach(([key, value]) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, this.#flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        flattened[newKey] = value.length;
      } else if (value instanceof Date) {
        flattened[newKey] = value.toISOString();
      } else {
        flattened[newKey] = value;
      }
    });

    return flattened;
  }

  /**
   * Calculate next run time for schedule
   * @private
   * @static
   * @param {string} frequency - Schedule frequency
   * @returns {Date} Next run time
   */
  static #calculateNextRun(frequency) {
    const now = new Date();
    
    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      
      default:
        throw new Error(`Invalid frequency: ${frequency}`);
    }
  }

  /**
   * Generate report summary
   * @private
   * @static
   * @param {Object} data - Report data
   * @param {string} reportType - Report type
   * @returns {Object} Summary
   */
  static #generateReportSummary(data, reportType) {
    return {
      dataPoints: this.#countDataPoints(data),
      dateRange: this.#extractDateRange(data),
      keyMetrics: this.#extractKeyMetrics(data, reportType),
      status: 'complete'
    };
  }

  /**
   * Count report rows
   * @private
   * @static
   * @param {Object} data - Report data
   * @returns {number} Row count
   */
  static #countReportRows(data) {
    let count = 0;
    
    Object.values(data).forEach(value => {
      if (Array.isArray(value)) {
        count += value.length;
      } else if (typeof value === 'object') {
        count += Object.keys(value).length;
      }
    });
    
    return count;
  }

  /**
   * Format section title
   * @private
   * @static
   * @param {string} section - Section name
   * @returns {string} Formatted title
   */
  static #formatSectionTitle(section) {
    return section
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

module.exports = ReportUtils;