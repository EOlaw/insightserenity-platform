/**
 * @fileoverview Job Scheduler Index
 * @module servers/admin-server/jobs
 * @description Centralized job scheduler for all background jobs
 * @version 1.0.0
 */

'use strict';

const SessionCleanupJob = require('./session-cleanup-job');
const TokenCleanupJob = require('./token-cleanup-job');
const AuditLogArchivalJob = require('./audit-log-archival-job');
const SecurityMonitoringJob = require('./security-monitoring-job');
const ReportGenerationJob = require('./report-generation-job');
const NotificationJob = require('./notification-job');
const { getLogger } = require('../../../shared/lib/utils/logger');

const logger = getLogger({ serviceName: 'job-scheduler' });

/**
 * Job Scheduler Class
 * @class JobScheduler
 * @description Manages and executes all background jobs
 */
class JobScheduler {
  /**
   * @private
   * @static
   * @type {Array<Object>} Registered jobs
   */
  static #jobs = [];

  /**
   * @private
   * @static
   * @type {Map<string, NodeJS.Timeout>} Active job intervals
   */
  static #intervals = new Map();

  /**
   * Register all jobs
   * @static
   * @private
   */
  static #registerJobs() {
    this.#jobs = [
      SessionCleanupJob.getConfig(),
      TokenCleanupJob.getConfig(),
      AuditLogArchivalJob.getConfig(),
      SecurityMonitoringJob.getConfig(),
      ReportGenerationJob.getConfig(),
      NotificationJob.getConfig()
    ];

    logger.info('Jobs registered', {
      totalJobs: this.#jobs.length,
      enabledJobs: this.#jobs.filter(j => j.enabled).length
    });
  }

  /**
   * Parse cron expression to milliseconds (simplified for common patterns)
   * @param {string} cronExpr - Cron expression
   * @returns {number} Interval in milliseconds
   * @static
   * @private
   */
  static #parseCronToMs(cronExpr) {
    // Simplified cron parser for common patterns
    // Format: minute hour day month weekday

    // Every X minutes: */X * * * *
    const everyMinutesMatch = cronExpr.match(/^\*\/(\d+) \* \* \* \*$/);
    if (everyMinutesMatch) {
      return parseInt(everyMinutesMatch[1]) * 60 * 1000;
    }

    // Every X hours: 0 */X * * *
    const everyHoursMatch = cronExpr.match(/^0 \*\/(\d+) \* \* \*$/);
    if (everyHoursMatch) {
      return parseInt(everyHoursMatch[1]) * 60 * 60 * 1000;
    }

    // Hourly: 0 * * * *
    if (cronExpr === '0 * * * *') {
      return 60 * 60 * 1000; // 1 hour
    }

    // Daily at specific hour: 0 X * * *
    const dailyMatch = cronExpr.match(/^0 (\d+) \* \* \*$/);
    if (dailyMatch) {
      return 24 * 60 * 60 * 1000; // Run daily (we'll handle specific time separately)
    }

    // Default to 1 hour if can't parse
    logger.warn('Could not parse cron expression, defaulting to 1 hour', { cronExpr });
    return 60 * 60 * 1000;
  }

  /**
   * Start a specific job
   * @param {Object} job - Job configuration
   * @static
   * @private
   */
  static #startJob(job) {
    if (!job.enabled) {
      logger.info('Job is disabled, skipping', { jobName: job.name });
      return;
    }

    const intervalMs = this.#parseCronToMs(job.schedule);

    // Execute immediately on start
    job.execute()
      .then(result => {
        logger.info('Job executed on startup', { jobName: job.name, result });
      })
      .catch(error => {
        logger.error('Job failed on startup', { jobName: job.name, error: error.message });
      });

    // Schedule recurring execution
    const interval = setInterval(async () => {
      try {
        logger.debug('Executing scheduled job', { jobName: job.name });
        const result = await job.execute();
        logger.debug('Scheduled job completed', { jobName: job.name, result });
      } catch (error) {
        logger.error('Scheduled job failed', {
          jobName: job.name,
          error: error.message,
          stack: error.stack
        });
      }
    }, intervalMs);

    this.#intervals.set(job.name, interval);

    logger.info('Job scheduled', {
      jobName: job.name,
      schedule: job.schedule,
      intervalMs,
      description: job.description
    });
  }

  /**
   * Start all jobs
   * @static
   * @public
   */
  static start() {
    logger.info('Starting job scheduler');

    // Register jobs
    this.#registerJobs();

    // Start each enabled job
    for (const job of this.#jobs) {
      this.#startJob(job);
    }

    logger.info('Job scheduler started', {
      activeJobs: this.#intervals.size
    });
  }

  /**
   * Stop all jobs
   * @static
   * @public
   */
  static stop() {
    logger.info('Stopping job scheduler');

    for (const [jobName, interval] of this.#intervals.entries()) {
      clearInterval(interval);
      logger.info('Job stopped', { jobName });
    }

    this.#intervals.clear();

    logger.info('Job scheduler stopped');
  }

  /**
   * Get job status
   * @returns {Array<Object>} Job status information
   * @static
   * @public
   */
  static getStatus() {
    return this.#jobs.map(job => ({
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled,
      running: this.#intervals.has(job.name),
      description: job.description
    }));
  }

  /**
   * Execute a specific job manually
   * @param {string} jobName - Job name
   * @returns {Promise<Object>} Job execution result
   * @static
   * @public
   */
  static async executeJob(jobName) {
    const job = this.#jobs.find(j => j.name === jobName);

    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    logger.info('Manually executing job', { jobName });
    return await job.execute();
  }
}

module.exports = JobScheduler;
