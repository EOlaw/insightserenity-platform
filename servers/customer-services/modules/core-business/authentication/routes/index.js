/**
 * @fileoverview Authentication Routes Aggregator
 * @module servers/customer-services/modules/core-business/authentication/routes/index
 * @description Aggregates all authentication routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth-routes');
const mfaRoutes = require('./mfa-routes');
const passwordRoutes = require('./password-routes');
const sessionRoutes = require('./session-routes');
const oauthRoutes = require('./oauth-routes');
const verificationRoutes = require('./verification-routes');

/**
 * Mount authentication routes
 * Base path: /api/auth
 */

// Main authentication routes (/api/auth/*)
router.use('/', authRoutes);

// MFA routes (/api/auth/mfa/*)
router.use('/mfa', mfaRoutes);

// OAuth routes (/api/auth/oauth/*)
router.use('/oauth', oauthRoutes);

// Password routes (/api/auth/password/*)
router.use('/password', passwordRoutes);

// Session routes (/api/auth/sessions/*)
router.use('/session', sessionRoutes);
router.use('/sessions', sessionRoutes);

// Verification routes (/api/auth/verify/*)
router.use('/verify', verificationRoutes);

// Export aggregated router
module.exports = router;