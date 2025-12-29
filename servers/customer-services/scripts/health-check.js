#!/usr/bin/env node

/**
 * System Health Check Script
 *
 * Comprehensive health check for Insight Serenity Platform
 * Verifies all critical services and dependencies
 *
 * Usage:
 *   node scripts/health-check.js
 *   node scripts/health-check.js --verbose
 *   node scripts/health-check.js --json
 */

const mongoose = require('mongoose');
const redis = require('redis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const jsonOutput = args.includes('--json');

// Health check results
const results = {
  timestamp: new Date().toISOString(),
  status: 'healthy',
  checks: {},
  errors: []
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Logging functions
function log(message, color = '') {
  if (!jsonOutput) {
    console.log(color + message + colors.reset);
  }
}

function logSuccess(name, message) {
  results.checks[name] = { status: 'pass', message };
  log(`✓ ${name}: ${message}`, colors.green);
}

function logWarning(name, message) {
  results.checks[name] = { status: 'warning', message };
  log(`⚠ ${name}: ${message}`, colors.yellow);
}

function logError(name, message, error) {
  results.checks[name] = { status: 'fail', message, error: error?.message };
  results.errors.push({ check: name, error: error?.message || message });
  results.status = 'unhealthy';
  log(`✗ ${name}: ${message}`, colors.red);
  if (verbose && error) {
    console.error(error);
  }
}

function logInfo(message) {
  log(message, colors.blue);
}

// ========================================
// Health Check Functions
// ========================================

/**
 * Check Environment Variables
 */
async function checkEnvironment() {
  logInfo('\n📋 Checking Environment Configuration...');

  const required = [
    'NODE_ENV',
    'PORT',
    'MONGODB_URI',
    'JWT_SECRET',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
    'ZOOM_ACCOUNT_ID',
    'ZOOM_CLIENT_ID',
    'ZOOM_CLIENT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length === 0) {
    logSuccess('environment', 'All required variables present');
  } else {
    logError('environment', `Missing variables: ${missing.join(', ')}`);
  }

  // Check NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    logInfo(`   Environment: PRODUCTION`);
  } else {
    logWarning('environment-mode', `Running in ${process.env.NODE_ENV} mode`);
  }
}

/**
 * Check MongoDB Connection
 */
async function checkMongoDB() {
  logInfo('\n🗄️  Checking MongoDB Connection...');

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    const dbName = mongoose.connection.db.databaseName;
    const state = mongoose.connection.readyState;

    if (state === 1) {
      logSuccess('mongodb', `Connected to database: ${dbName}`);

      // Check collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      logInfo(`   Collections: ${collections.length}`);

      // Check if required collections exist
      const requiredCollections = ['users', 'consultations', 'creditpackages'];
      const existingCollections = collections.map(c => c.name);
      const missingCollections = requiredCollections.filter(c => !existingCollections.includes(c));

      if (missingCollections.length > 0) {
        logWarning('mongodb-collections', `Missing collections: ${missingCollections.join(', ')}`);
      } else {
        logSuccess('mongodb-collections', 'All required collections exist');
      }

    } else {
      logError('mongodb', `Connection state: ${state} (expected 1)`);
    }

    await mongoose.connection.close();

  } catch (error) {
    logError('mongodb', 'Failed to connect', error);
  }
}

/**
 * Check Redis Connection
 */
async function checkRedis() {
  logInfo('\n🔴 Checking Redis Connection...');

  try {
    const client = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000
      }
    });

    client.on('error', (err) => {
      logError('redis', 'Connection error', err);
    });

    await client.connect();

    // Test Redis operations
    await client.set('health_check', 'ok', { EX: 10 });
    const value = await client.get('health_check');

    if (value === 'ok') {
      logSuccess('redis', 'Connected and operational');
    } else {
      logError('redis', 'Read/write test failed');
    }

    // Get Redis info
    const info = await client.info();
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    if (memoryMatch) {
      logInfo(`   Memory: ${memoryMatch[1]}`);
    }

    await client.quit();

  } catch (error) {
    logError('redis', 'Failed to connect', error);
  }
}

/**
 * Check Stripe Integration
 */
async function checkStripe() {
  logInfo('\n💳 Checking Stripe Integration...');

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Test API connection
    const balance = await stripe.balance.retrieve();

    logSuccess('stripe', 'API connection successful');
    logInfo(`   Account: ${balance.object}`);

    // Verify webhook secret
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      logSuccess('stripe-webhook', 'Webhook secret configured');
    } else {
      logWarning('stripe-webhook', 'Webhook secret not configured');
    }

  } catch (error) {
    logError('stripe', 'API connection failed', error);
  }
}

/**
 * Check Zoom Integration
 */
async function checkZoom() {
  logInfo('\n📹 Checking Zoom Integration...');

  try {
    const ZoomService = require('../modules/integrations/video-conferencing/zoom-service');

    const isValid = await ZoomService.validateConfiguration();

    if (isValid) {
      logSuccess('zoom', 'Configuration valid');
    } else {
      logError('zoom', 'Configuration validation failed');
    }

  } catch (error) {
    logError('zoom', 'Integration check failed', error);
  }
}

/**
 * Check Email Service
 */
async function checkEmail() {
  logInfo('\n📧 Checking Email Service...');

  try {
    if (process.env.SENDGRID_API_KEY) {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      logSuccess('email-sendgrid', 'SendGrid configured');

      if (process.env.SENDGRID_FROM_EMAIL) {
        logInfo(`   From: ${process.env.SENDGRID_FROM_EMAIL}`);
      } else {
        logWarning('email-from', 'SENDGRID_FROM_EMAIL not configured');
      }

    } else if (process.env.GMAIL_USER) {
      logSuccess('email-gmail', 'Gmail fallback configured');
      logInfo(`   Gmail: ${process.env.GMAIL_USER}`);
    } else {
      logError('email', 'No email service configured');
    }

  } catch (error) {
    logError('email', 'Email service check failed', error);
  }
}

/**
 * Check File Storage (AWS S3)
 */
async function checkFileStorage() {
  logInfo('\n📁 Checking File Storage (AWS S3)...');

  try {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_S3_BUCKET) {
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION
      });

      const params = {
        Bucket: process.env.AWS_S3_BUCKET
      };

      await s3.headBucket(params).promise();
      logSuccess('aws-s3', `Bucket accessible: ${process.env.AWS_S3_BUCKET}`);

    } else {
      logWarning('aws-s3', 'S3 not configured (optional)');
    }

  } catch (error) {
    logError('aws-s3', 'S3 access failed', error);
  }
}

/**
 * Check Email Templates
 */
async function checkEmailTemplates() {
  logInfo('\n📄 Checking Email Templates...');

  const templatesPath = path.join(__dirname, '../email-templates');

  try {
    const requiredTemplates = [
      'consultation/booking-confirmation-client.html',
      'consultation/reminder-24h-client.html',
      'consultation/completed-client.html',
      'credit/free-trial-assigned.html',
      'payment/payment-confirmation.html'
    ];

    let allExist = true;
    let missingTemplates = [];

    for (const template of requiredTemplates) {
      const filePath = path.join(templatesPath, template);
      if (!fs.existsSync(filePath)) {
        allExist = false;
        missingTemplates.push(template);
      }
    }

    if (allExist) {
      logSuccess('email-templates', 'All critical templates exist');
      logInfo(`   Location: ${templatesPath}`);
    } else {
      logError('email-templates', `Missing templates: ${missingTemplates.join(', ')}`);
    }

  } catch (error) {
    logError('email-templates', 'Template check failed', error);
  }
}

/**
 * Check Cron Jobs
 */
async function checkCronJobs() {
  logInfo('\n⏰ Checking Cron Job Configuration...');

  try {
    const schedulerPath = path.join(__dirname, '../modules/core-business/consultation-management/services/consultation-scheduler.js');

    if (fs.existsSync(schedulerPath)) {
      logSuccess('cron-scheduler', 'Scheduler file exists');

      if (process.env.ENABLE_CRON_JOBS === 'true') {
        logSuccess('cron-enabled', 'Cron jobs enabled');
      } else {
        logWarning('cron-enabled', 'Cron jobs disabled');
      }
    } else {
      logError('cron-scheduler', 'Scheduler file not found');
    }

  } catch (error) {
    logError('cron-scheduler', 'Cron check failed', error);
  }
}

/**
 * Check Server Health Endpoint
 */
async function checkServerHealth() {
  logInfo('\n🏥 Checking Server Health Endpoint...');

  try {
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
    const healthUrl = `${serverUrl}/health`;

    const response = await axios.get(healthUrl, { timeout: 5000 });

    if (response.status === 200 && response.data.status === 'healthy') {
      logSuccess('server-health', 'Server responding healthy');
      logInfo(`   URL: ${healthUrl}`);
    } else {
      logError('server-health', `Unexpected response: ${JSON.stringify(response.data)}`);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logWarning('server-health', 'Server not running (expected if not started)');
    } else {
      logError('server-health', 'Health check failed', error);
    }
  }
}

/**
 * Check Disk Space
 */
async function checkDiskSpace() {
  logInfo('\n💾 Checking Disk Space...');

  try {
    const { execSync } = require('child_process');
    const output = execSync('df -h .').toString();
    const lines = output.split('\n');

    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const usePercent = parts[4];
      const used = parseInt(usePercent);

      logInfo(`   Disk Usage: ${usePercent}`);

      if (used > 90) {
        logError('disk-space', `Critical: ${usePercent} used`);
      } else if (used > 80) {
        logWarning('disk-space', `Warning: ${usePercent} used`);
      } else {
        logSuccess('disk-space', `Healthy: ${usePercent} used`);
      }
    }

  } catch (error) {
    logWarning('disk-space', 'Could not check disk space (may not be Unix system)');
  }
}

// ========================================
// Main Execution
// ========================================

async function runHealthChecks() {
  if (!jsonOutput) {
    console.log(colors.bright + '\n╔════════════════════════════════════════════════╗');
    console.log('║   Insight Serenity - System Health Check      ║');
    console.log('╚════════════════════════════════════════════════╝' + colors.reset);
  }

  await checkEnvironment();
  await checkMongoDB();
  await checkRedis();
  await checkStripe();
  await checkZoom();
  await checkEmail();
  await checkFileStorage();
  await checkEmailTemplates();
  await checkCronJobs();
  await checkServerHealth();
  await checkDiskSpace();

  // Summary
  if (!jsonOutput) {
    console.log(colors.bright + '\n╔════════════════════════════════════════════════╗');
    console.log(`║   Status: ${results.status.toUpperCase().padEnd(37)} ║`);
    console.log('╚════════════════════════════════════════════════╝' + colors.reset);

    const passed = Object.values(results.checks).filter(c => c.status === 'pass').length;
    const warnings = Object.values(results.checks).filter(c => c.status === 'warning').length;
    const failed = Object.values(results.checks).filter(c => c.status === 'fail').length;

    console.log(colors.green + `\n✓ Passed: ${passed}` + colors.reset);
    if (warnings > 0) console.log(colors.yellow + `⚠ Warnings: ${warnings}` + colors.reset);
    if (failed > 0) console.log(colors.red + `✗ Failed: ${failed}` + colors.reset);

    if (results.errors.length > 0) {
      console.log(colors.red + '\nErrors:');
      results.errors.forEach(err => {
        console.log(`  - ${err.check}: ${err.error}`);
      });
      console.log(colors.reset);
    }
  } else {
    console.log(JSON.stringify(results, null, 2));
  }

  // Exit with appropriate code
  process.exit(results.status === 'healthy' ? 0 : 1);
}

// Run checks
runHealthChecks().catch(error => {
  console.error(colors.red + 'Fatal error during health check:' + colors.reset);
  console.error(error);
  process.exit(1);
});
