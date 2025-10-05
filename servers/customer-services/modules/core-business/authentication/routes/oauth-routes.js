/**
 * @fileoverview OAuth & Social Authentication Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/oauth-routes
 */

const express = require('express');
const router = express.Router();

// Import controller (singleton - same pattern as user-routes)
const OAuthController = require('../controllers/oauth-controller');

/**
 * OAuth routes
 * Base path: /api/v1/auth/oauth
 */

// Public routes
router.get('/:provider', OAuthController.initiateOAuth.bind(OAuthController));
router.get('/:provider/callback', OAuthController.handleOAuthCallback.bind(OAuthController));

// Protected routes (require authentication middleware)
router.post('/link/:provider', OAuthController.linkOAuthAccount.bind(OAuthController));
router.delete('/unlink/:provider', OAuthController.unlinkOAuthAccount.bind(OAuthController));
router.get('/linked', OAuthController.getLinkedAccounts.bind(OAuthController));

module.exports = router;