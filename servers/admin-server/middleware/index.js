'use strict';

/**
 * @fileoverview Admin server middleware exports
 * @module servers/admin-server/middleware
 */

const adminAuth = require('./admin-auth');
const adminCors = require('./admin-cors');
const adminRateLimit = require('./admin-rate-limit');
const auditLogger = require('./audit-logger');
const ipWhitelist = require('./ip-whitelist');
const sessionValidation = require('./session-validation');
const securityHeaders = require('./security-headers');

module.exports = {
  adminAuth,
  adminCors,
  adminRateLimit,
  auditLogger,
  ipWhitelist,
  sessionValidation,
  securityHeaders,
  
  // Middleware stack for admin routes
  adminMiddlewareStack: [
    securityHeaders,
    ipWhitelist,
    adminCors,
    adminRateLimit,
    adminAuth,
    sessionValidation,
    auditLogger
  ],
  
  // Public endpoint middleware (health checks, etc.)
  publicMiddlewareStack: [
    securityHeaders,
    adminCors
  ]
};