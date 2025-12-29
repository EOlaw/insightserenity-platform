const cron = require('node-cron');
const logger = require('../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultation-scheduler'
});

/**
 * Professional B2B Consultation Platform - Scheduled Jobs
 * Handles all automated tasks: reminders, credit expiration, notifications
 */
class ConsultationScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('[Scheduler] Jobs are already running');
      return;
    }

    logger.info('[Scheduler] 🚀 Starting consultation platform scheduled jobs');

    try {
      // Import services (lazy load to avoid circular dependencies)
      const CreditManagementService = require('../modules/core-business/billing/services/credit-management-service');
      const ConsultationNotificationService = require('../modules/core-business/consultation-management/services/consultation-notification-service');

      // 1. Send 24-hour consultation reminders
      // Runs daily at 9:00 AM UTC
      const reminder24hJob = cron.schedule('0 9 * * *', async () => {
        try {
          logger.info('[Scheduler] 📧 Running 24-hour reminder job');
          const result = await ConsultationNotificationService.sendBatch24HourReminders();
          logger.info(`[Scheduler] ✅ 24h reminders sent: ${result.sent} consultations`);
        } catch (error) {
          logger.error('[Scheduler] ❌ 24h reminder job failed:', error);
        }
      }, {
        timezone: 'UTC',
        scheduled: true
      });
      this.jobs.push({ name: '24h-reminders', job: reminder24hJob });
      logger.info('[Scheduler] ✓ 24-hour reminder job scheduled (Daily 9:00 AM UTC)');

      // 2. Send 1-hour consultation reminders
      // Runs every 15 minutes
      const reminder1hJob = cron.schedule('*/15 * * * *', async () => {
        try {
          logger.info('[Scheduler] 📧 Running 1-hour reminder job');
          const result = await ConsultationNotificationService.sendBatch1HourReminders();
          logger.info(`[Scheduler] ✅ 1h reminders sent: ${result.sent} consultations`);
        } catch (error) {
          logger.error('[Scheduler] ❌ 1h reminder job failed:', error);
        }
      }, {
        timezone: 'UTC',
        scheduled: true
      });
      this.jobs.push({ name: '1h-reminders', job: reminder1hJob });
      logger.info('[Scheduler] ✓ 1-hour reminder job scheduled (Every 15 minutes)');

      // 3. Expire old credits
      // Runs daily at 2:00 AM UTC
      const expireCreditsJob = cron.schedule('0 2 * * *', async () => {
        try {
          logger.info('[Scheduler] ⏰ Running credit expiration job');
          const result = await CreditManagementService.expireOldCredits();
          logger.info(`[Scheduler] ✅ Expired ${result.packagesExpired} packages (${result.totalCreditsExpired} credits) across ${result.clientsProcessed} clients`);
        } catch (error) {
          logger.error('[Scheduler] ❌ Credit expiration job failed:', error);
        }
      }, {
        timezone: 'UTC',
        scheduled: true
      });
      this.jobs.push({ name: 'expire-credits', job: expireCreditsJob });
      logger.info('[Scheduler] ✓ Credit expiration job scheduled (Daily 2:00 AM UTC)');

      // 4. Send 7-day expiration warnings
      // Runs daily at 9:00 AM UTC
      const warning7dJob = cron.schedule('0 9 * * *', async () => {
        try {
          logger.info('[Scheduler] ⚠️  Running 7-day expiration warning job');
          const result = await CreditManagementService.sendExpirationWarnings(7);
          logger.info(`[Scheduler] ✅ 7-day warnings sent: ${result.clientsNotified} clients`);
        } catch (error) {
          logger.error('[Scheduler] ❌ 7-day warning job failed:', error);
        }
      }, {
        timezone: 'UTC',
        scheduled: true
      });
      this.jobs.push({ name: '7day-warnings', job: warning7dJob });
      logger.info('[Scheduler] ✓ 7-day expiration warning job scheduled (Daily 9:00 AM UTC)');

      // 5. Send 1-day expiration warnings
      // Runs daily at 9:00 AM UTC
      const warning1dJob = cron.schedule('0 9 * * *', async () => {
        try {
          logger.info('[Scheduler] ⚠️  Running 1-day expiration warning job');
          const result = await CreditManagementService.sendExpirationWarnings(1);
          logger.info(`[Scheduler] ✅ 1-day warnings sent: ${result.clientsNotified} clients`);
        } catch (error) {
          logger.error('[Scheduler] ❌ 1-day warning job failed:', error);
        }
      }, {
        timezone: 'UTC',
        scheduled: true
      });
      this.jobs.push({ name: '1day-warnings', job: warning1dJob });
      logger.info('[Scheduler] ✓ 1-day expiration warning job scheduled (Daily 9:00 AM UTC)');

      this.isRunning = true;
      logger.info(`[Scheduler] 🎉 All ${this.jobs.length} scheduled jobs initialized successfully`);

      // Log next execution times
      this.logNextExecutions();

    } catch (error) {
      logger.error('[Scheduler] ❌ Failed to start scheduled jobs:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[Scheduler] No jobs are running');
      return;
    }

    logger.info('[Scheduler] 🛑 Stopping all scheduled jobs');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.info(`[Scheduler] ✓ Stopped job: ${name}`);
    });

    this.jobs = [];
    this.isRunning = false;

    logger.info('[Scheduler] ✅ All scheduled jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.length,
      jobs: this.jobs.map(({ name }) => name)
    };
  }

  /**
   * Log next execution times for all jobs
   */
  logNextExecutions() {
    logger.info('[Scheduler] 📅 Next scheduled executions:');
    logger.info('  • 24h reminders: Daily at 9:00 AM UTC');
    logger.info('  • 1h reminders: Every 15 minutes');
    logger.info('  • Credit expiration: Daily at 2:00 AM UTC');
    logger.info('  • 7-day warnings: Daily at 9:00 AM UTC');
    logger.info('  • 1-day warnings: Daily at 9:00 AM UTC');
  }

  /**
   * Test run all jobs immediately (for testing purposes)
   */
  async testRun() {
    logger.info('[Scheduler] 🧪 Running test execution of all jobs');

    try {
      const CreditManagementService = require('../modules/core-business/billing/services/credit-management-service');
      const ConsultationNotificationService = require('../modules/core-business/consultation-management/services/consultation-notification-service');

      // Test 24h reminders
      logger.info('[Scheduler] Testing 24h reminders...');
      await ConsultationNotificationService.sendBatch24HourReminders();

      // Test 1h reminders
      logger.info('[Scheduler] Testing 1h reminders...');
      await ConsultationNotificationService.sendBatch1HourReminders();

      // Test credit expiration
      logger.info('[Scheduler] Testing credit expiration...');
      await CreditManagementService.expireOldCredits();

      // Test warnings
      logger.info('[Scheduler] Testing expiration warnings...');
      await CreditManagementService.sendExpirationWarnings(7);
      await CreditManagementService.sendExpirationWarnings(1);

      logger.info('[Scheduler] ✅ Test run completed successfully');
    } catch (error) {
      logger.error('[Scheduler] ❌ Test run failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
const scheduler = new ConsultationScheduler();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('[Scheduler] SIGTERM received, stopping scheduled jobs');
  scheduler.stop();
});

process.on('SIGINT', () => {
  logger.info('[Scheduler] SIGINT received, stopping scheduled jobs');
  scheduler.stop();
});

module.exports = scheduler;
