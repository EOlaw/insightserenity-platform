# Background Jobs Directory

## Purpose
Scheduled and background tasks for admin server maintenance, reporting, and automation:
- Cleanup expired sessions and tokens
- Generate scheduled reports
- Send scheduled notifications
- Data archival and cleanup
- Health check monitoring
- License and subscription management
- Automated backups

## Structure

```
jobs/
├── cleanup/           # Cleanup jobs
│   ├── session-cleanup.js
│   ├── token-cleanup.js
│   └── audit-log-cleanup.js
├── reports/           # Report generation jobs
│   ├── daily-report-job.js
│   ├── weekly-report-job.js
│   └── monthly-report-job.js
├── notifications/     # Notification jobs
│   ├── expiry-notification-job.js
│   └── security-alert-job.js
├── monitoring/        # Monitoring jobs
│   ├── health-check-job.js
│   └── performance-monitor-job.js
├── job-scheduler.js   # Main job scheduler
├── job-runner.js      # Job execution engine
└── README.md
```

## Job Scheduling

Jobs are scheduled using cron syntax:

```javascript
// job-scheduler.js
const schedule = require('node-cron');

// Run every day at 2 AM
schedule.schedule('0 2 * * *', () => {
  require('./cleanup/session-cleanup').run();
});

// Run every hour
schedule.schedule('0 * * * *', () => {
  require('./monitoring/health-check-job').run();
});
```

## Job Types

### Cleanup Jobs
- **Session Cleanup**: Remove expired sessions (Runs: Every 6 hours)
- **Token Cleanup**: Remove expired tokens (Runs: Daily at 3 AM)
- **Audit Log Cleanup**: Archive old audit logs (Runs: Monthly)

### Report Jobs
- **Daily Report**: Generate daily activity summary (Runs: Daily at 1 AM)
- **Weekly Report**: Generate weekly analytics (Runs: Sundays at 2 AM)
- **Monthly Report**: Generate monthly compliance report (Runs: 1st of month)

### Notification Jobs
- **Expiry Notifications**: Notify admins of expiring credentials (Runs: Daily at 9 AM)
- **Security Alerts**: Send security incident notifications (Runs: Every 15 minutes)

### Monitoring Jobs
- **Health Check**: System health monitoring (Runs: Every 5 minutes)
- **Performance Monitor**: Track system performance (Runs: Every 10 minutes)

## Job Structure

Each job should follow this structure:

```javascript
/**
 * @fileoverview Example Job
 * @module servers/admin-server/jobs/example-job
 */

'use strict';

const { getLogger } = require('../../../shared/lib/utils/logger');
const logger = getLogger({ serviceName: 'example-job' });

class ExampleJob {
  /**
   * Run the job
   * @returns {Promise<void>}
   * @static
   */
  static async run() {
    const startTime = Date.now();
    logger.info('Starting Example Job');

    try {
      // Job logic here
      await this.performTask();

      const duration = Date.now() - startTime;
      logger.info('Example Job completed', { duration });
    } catch (error) {
      logger.error('Example Job failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform the actual task
   * @returns {Promise<void>}
   * @private
   */
  static async performTask() {
    // Implementation
  }
}

module.exports = ExampleJob;
```

## Usage

```javascript
// Manual execution
const SessionCleanupJob = require('./jobs/cleanup/session-cleanup');
await SessionCleanupJob.run();

// Scheduled execution (in server.js)
require('./jobs/job-scheduler');
```

## Monitoring

All jobs should:
1. Log start and completion times
2. Report errors with full stack traces
3. Track execution duration
4. Update job execution history in database
5. Send alerts for failed critical jobs

## Error Handling

Jobs should handle errors gracefully:

```javascript
try {
  await job.run();
} catch (error) {
  // Log error
  logger.error('Job failed', { error });

  // Send alert for critical jobs
  if (job.isCritical) {
    await alertService.sendJobFailureAlert(job.name, error);
  }

  // Retry logic for retryable jobs
  if (job.retryable && attempts < maxRetries) {
    await retryJob(job, attempts + 1);
  }
}
```

## Best Practices

1. **Idempotency**: Jobs should be safe to run multiple times
2. **Atomic Operations**: Use transactions for database operations
3. **Resource Cleanup**: Always clean up resources (connections, file handles)
4. **Graceful Degradation**: Don't crash the entire server on job failure
5. **Monitoring**: Track job execution metrics
6. **Timeout Handling**: Set reasonable timeouts for long-running jobs
