/**
 * @fileoverview OAuth Routes
 * @module servers/customer-services/modules/core-business/authentication/routes/oauth-routes
 * @description Handles OAuth authentication routes
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// Import controllers
const OAuthController = require('../controllers/oauth-controller');

// Import middleware
const { authenticate } = require('../middlewares/authenticate');
const { rateLimit } = require('../middlewares/rate-limit');

// Import validators
const { validateOAuthLink, validateOAuthUnlink } = require('../validators/oauth-validators');

/**
 * @route   GET /api/auth/oauth/github
 * @desc    Initiate GitHub OAuth
 * @access  Public
 */
router.get(
    '/github',
    rateLimit.api,
    OAuthController.initiateGitHubAuth
);

/**
 * @route   GET /api/auth/oauth/github/callback
 * @desc    Handle GitHub OAuth callback
 * @access  Public
 */
router.get(
    '/github/callback',
    OAuthController.handleGitHubCallback
);

/**
 * @route   GET /api/auth/oauth/linkedin
 * @desc    Initiate LinkedIn OAuth
 * @access  Public
 */
router.get(
    '/linkedin',
    rateLimit.api,
    OAuthController.initiateLinkedInAuth
);

/**
 * @route   GET /api/auth/oauth/linkedin/callback
 * @desc    Handle LinkedIn OAuth callback
 * @access  Public
 */
router.get(
    '/linkedin/callback',
    OAuthController.handleLinkedInCallback
);

/**
 * @route   GET /api/auth/oauth/google
 * @desc    Initiate Google OAuth
 * @access  Public
 */
router.get(
    '/google',
    rateLimit.api,
    OAuthController.initiateGoogleAuth
);

/**
 * @route   GET /api/auth/oauth/google/callback
 * @desc    Handle Google OAuth callback
 * @access  Public
 */
router.get(
    '/google/callback',
    OAuthController.handleGoogleCallback
);

/**
 * @route   POST /api/auth/oauth/link
 * @desc    Link OAuth account to existing user
 * @access  Protected
 */
router.post(
    '/link',
    authenticate(),
    validateOAuthLink,
    OAuthController.linkOAuthAccount
);

/**
 * @route   POST /api/auth/oauth/unlink
 * @desc    Unlink OAuth account
 * @access  Protected
 */
router.post(
    '/unlink',
    authenticate(),
    validateOAuthUnlink,
    OAuthController.unlinkOAuthAccount
);

/**
 * @route   GET /api/auth/oauth/linked
 * @desc    Get linked OAuth accounts
 * @access  Protected
 */
router.get(
    '/linked',
    authenticate(),
    OAuthController.getLinkedAccounts
);

module.exports = router;