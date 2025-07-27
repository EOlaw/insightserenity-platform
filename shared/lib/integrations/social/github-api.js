'use strict';

/**
 * @fileoverview GitHub API integration service
 * @module shared/lib/integrations/social/github-api
 * @requires module:@octokit/rest
 * @requires module:@octokit/auth-oauth-app
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/services/webhook-service
 */

const { Octokit } = require('@octokit/rest');
const { createOAuthAppAuth } = require('@octokit/auth-oauth-app');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const WebhookService = require('../../services/webhook-service');

/**
 * @class GitHubAPI
 * @description Handles GitHub OAuth and API operations with comprehensive functionality
 * Implements profile access, repository management, and webhook handling
 */
class GitHubAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for token and data caching
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   * @description Encryption service for sensitive data
   */
  #encryptionService;

  /**
   * @private
   * @type {WebhookService}
   * @description Webhook service for GitHub events
   */
  #webhookService;

  /**
   * @private
   * @type {Map}
   * @description Map of Octokit instances per access token
   */
  #octokitInstances;

  /**
   * @private
   * @type {Object}
   * @description OAuth app authentication instance
   */
  #oauthApp;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    apiVersion: '2022-11-28',
    baseURL: 'https://api.github.com',
    authURL: 'https://github.com/login/oauth',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    cacheTTL: 3600,
    profileCacheTTL: 86400,
    repoCacheTTL: 43200,
    scopes: ['read:user', 'user:email', 'repo'],
    userAgent: 'InsightSerenity-Platform/1.0',
    perPage: 30,
    maxPerPage: 100
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description GitHub API endpoints
   */
  static #ENDPOINTS = {
    USER: '/user',
    USER_EMAILS: '/user/emails',
    USER_REPOS: '/user/repos',
    USER_ORGS: '/user/orgs',
    USER_FOLLOWERS: '/user/followers',
    USER_FOLLOWING: '/user/following',
    REPOS: '/repos',
    SEARCH_REPOS: '/search/repositories',
    SEARCH_USERS: '/search/users'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description GitHub webhook events
   */
  static #WEBHOOK_EVENTS = {
    PUSH: 'push',
    PULL_REQUEST: 'pull_request',
    ISSUES: 'issues',
    RELEASE: 'release',
    REPOSITORY: 'repository',
    STAR: 'star',
    FORK: 'fork'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Repository visibility options
   */
  static #VISIBILITY = {
    PUBLIC: 'public',
    PRIVATE: 'private',
    INTERNAL: 'internal'
  };

  /**
   * Creates a new GitHubAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.clientId - GitHub OAuth app client ID
   * @param {string} config.clientSecret - GitHub OAuth app client secret
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {string} [config.webhookSecret] - Webhook secret for validation
   * @param {Array<string>} [config.scopes] - OAuth scopes
   * @param {string} [config.userAgent] - User agent string
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @param {WebhookService} [webhookService] - Webhook service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService, webhookService) {
    try {
      if (!config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'GitHub client ID and secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'GitHubAPI' }
        );
      }

      if (!config.redirectUri) {
        throw new AppError(
          'GitHub redirect URI is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'redirectUri' }
        );
      }

      this.#config = {
        ...GitHubAPI.#DEFAULT_CONFIG,
        ...config,
        scopes: config.scopes || GitHubAPI.#DEFAULT_CONFIG.scopes
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#webhookService = webhookService || new WebhookService();
      this.#octokitInstances = new Map();

      // Initialize OAuth app authentication
      this.#oauthApp = createOAuthAppAuth({
        clientType: 'oauth-app',
        clientId: this.#config.clientId,
        clientSecret: this.#config.clientSecret
      });

      logger.info('GitHubAPI initialized', {
        scopes: this.#config.scopes,
        userAgent: this.#config.userAgent,
        hasWebhookSecret: !!this.#config.webhookSecret
      });
    } catch (error) {
      logger.error('GitHubAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize GitHub API service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates OAuth authorization URL
   * @param {Object} [options] - Authorization options
   * @param {string} [options.state] - OAuth state parameter
   * @param {Array<string>} [options.additionalScopes] - Additional scopes
   * @param {boolean} [options.allowSignup=true] - Allow signup during auth
   * @returns {string} Authorization URL
   */
  generateAuthorizationUrl(options = {}) {
    try {
      const params = new URLSearchParams({
        client_id: this.#config.clientId,
        redirect_uri: this.#config.redirectUri,
        scope: [...this.#config.scopes, ...(options.additionalScopes || [])].join(' '),
        allow_signup: options.allowSignup !== false ? 'true' : 'false'
      });

      if (options.state) {
        params.append('state', options.state);
      }

      const authUrl = `${this.#config.authURL}/authorize?${params.toString()}`;

      logger.info('Generated GitHub authorization URL', {
        scopes: this.#config.scopes,
        hasState: !!options.state
      });

      return authUrl;
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);
      throw new AppError(
        'Failed to generate GitHub authorization URL',
        500,
        ERROR_CODES.OAUTH_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Exchanges authorization code for access token
   * @param {string} code - Authorization code
   * @param {Object} [options] - Exchange options
   * @returns {Promise<Object>} Token response
   * @throws {AppError} If token exchange fails
   */
  async exchangeCodeForToken(code, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Exchanging GitHub authorization code', { correlationId });

      const auth = await this.#oauthApp({
        type: 'oauth-user',
        code,
        redirectUrl: this.#config.redirectUri
      });

      const tokenData = {
        accessToken: auth.token,
        tokenType: 'bearer',
        scope: auth.scopes.join(' '),
        createdAt: Date.now()
      };

      // Validate token and get user info
      const octokit = await this.#getOctokit(tokenData.accessToken);
      const { data: user } = await octokit.users.getAuthenticated();

      tokenData.userId = user.id;
      tokenData.username = user.login;

      // Encrypt and cache token
      if (options.userId || user.id) {
        await this.#cacheToken(options.userId || user.id, tokenData);
      }

      logger.info('GitHub token exchange successful', {
        correlationId,
        username: user.login,
        scopes: auth.scopes
      });

      return tokenData;

    } catch (error) {
      logger.error('GitHub token exchange failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Fetches user profile information
   * @param {string} accessToken - GitHub access token
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.includeEmail=true] - Include email addresses
   * @param {boolean} [options.includeOrgs=false] - Include organizations
   * @param {boolean} [options.useCache=true] - Use cached profile
   * @returns {Promise<Object>} User profile data
   * @throws {AppError} If profile fetch fails
   */
  async fetchUserProfile(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `github:profile:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Profile retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching GitHub user profile', {
        correlationId,
        includeEmail: options.includeEmail !== false,
        includeOrgs: options.includeOrgs === true
      });

      const octokit = await this.#getOctokit(accessToken);

      // Fetch basic profile
      const { data: user } = await octokit.users.getAuthenticated();

      const profile = {
        id: user.id,
        username: user.login,
        name: user.name,
        email: user.email,
        bio: user.bio,
        company: user.company,
        location: user.location,
        blog: user.blog,
        avatarUrl: user.avatar_url,
        htmlUrl: user.html_url,
        publicRepos: user.public_repos,
        publicGists: user.public_gists,
        followers: user.followers,
        following: user.following,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        privateRepos: user.total_private_repos,
        ownedPrivateRepos: user.owned_private_repos,
        diskUsage: user.disk_usage,
        collaborators: user.collaborators,
        twoFactorAuthentication: user.two_factor_authentication,
        plan: user.plan
      };

      // Fetch emails if requested
      if (options.includeEmail !== false && !profile.email) {
        try {
          const { data: emails } = await octokit.users.listEmailsForAuthenticatedUser();
          profile.emails = emails.map(email => ({
            email: email.email,
            primary: email.primary,
            verified: email.verified,
            visibility: email.visibility
          }));
          
          const primaryEmail = emails.find(e => e.primary);
          if (primaryEmail) {
            profile.email = primaryEmail.email;
          }
        } catch (error) {
          logger.warn('Failed to fetch email addresses', {
            correlationId,
            error: error.message
          });
        }
      }

      // Fetch organizations if requested
      if (options.includeOrgs) {
        try {
          const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();
          profile.organizations = orgs.map(org => ({
            id: org.id,
            login: org.login,
            avatarUrl: org.avatar_url,
            description: org.description
          }));
        } catch (error) {
          logger.warn('Failed to fetch organizations', {
            correlationId,
            error: error.message
          });
        }
      }

      // Cache the profile
      if (options.useCache !== false) {
        const cacheKey = `github:profile:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, profile, this.#config.profileCacheTTL);
      }

      logger.info('GitHub profile fetched successfully', {
        correlationId,
        username: profile.username
      });

      return profile;

    } catch (error) {
      logger.error('Profile fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Fetches user's repositories
   * @param {string} accessToken - GitHub access token
   * @param {Object} [options] - Fetch options
   * @param {string} [options.type='all'] - Repository type (all, owner, member)
   * @param {string} [options.sort='updated'] - Sort field
   * @param {string} [options.direction='desc'] - Sort direction
   * @param {number} [options.perPage=30] - Results per page
   * @param {number} [options.page=1] - Page number
   * @param {boolean} [options.useCache=true] - Use cached data
   * @returns {Promise<Object>} Repositories data
   * @throws {AppError} If fetch fails
   */
  async getRepositories(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache
      if (options.useCache !== false) {
        const cacheKey = `github:repos:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Repositories retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching GitHub repositories', {
        correlationId,
        type: options.type || 'all',
        sort: options.sort || 'updated'
      });

      const octokit = await this.#getOctokit(accessToken);

      const response = await octokit.repos.listForAuthenticatedUser({
        type: options.type || 'all',
        sort: options.sort || 'updated',
        direction: options.direction || 'desc',
        per_page: Math.min(options.perPage || 30, this.#config.maxPerPage),
        page: options.page || 1
      });

      const repositories = {
        total: response.data.length,
        page: options.page || 1,
        perPage: options.perPage || 30,
        repositories: response.data.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          private: repo.private,
          htmlUrl: repo.html_url,
          language: repo.language,
          stargazersCount: repo.stargazers_count,
          watchersCount: repo.watchers_count,
          forksCount: repo.forks_count,
          openIssuesCount: repo.open_issues_count,
          size: repo.size,
          defaultBranch: repo.default_branch,
          visibility: repo.visibility,
          pushedAt: repo.pushed_at,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          permissions: repo.permissions,
          topics: repo.topics
        }))
      };

      // Cache the results
      if (options.useCache !== false) {
        const cacheKey = `github:repos:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        await this.#cacheService.set(cacheKey, repositories, this.#config.repoCacheTTL);
      }

      logger.info('Repositories fetched successfully', {
        correlationId,
        count: repositories.repositories.length
      });

      return repositories;

    } catch (error) {
      logger.error('Repositories fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Gets user's followers
   * @param {string} accessToken - GitHub access token
   * @param {Object} [options] - Fetch options
   * @param {number} [options.perPage=30] - Results per page
   * @param {number} [options.page=1] - Page number
   * @returns {Promise<Object>} Followers data
   * @throws {AppError} If fetch fails
   */
  async getFollowers(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Fetching GitHub followers', {
        correlationId,
        page: options.page || 1
      });

      const octokit = await this.#getOctokit(accessToken);

      const response = await octokit.users.listFollowersForAuthenticatedUser({
        per_page: Math.min(options.perPage || 30, this.#config.maxPerPage),
        page: options.page || 1
      });

      const followers = {
        total: response.data.length,
        page: options.page || 1,
        perPage: options.perPage || 30,
        followers: response.data.map(user => ({
          id: user.id,
          username: user.login,
          avatarUrl: user.avatar_url,
          htmlUrl: user.html_url,
          type: user.type
        }))
      };

      logger.info('Followers fetched successfully', {
        correlationId,
        count: followers.followers.length
      });

      return followers;

    } catch (error) {
      logger.error('Followers fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Creates a repository
   * @param {string} accessToken - GitHub access token
   * @param {Object} repoData - Repository data
   * @param {string} repoData.name - Repository name
   * @param {string} [repoData.description] - Repository description
   * @param {boolean} [repoData.private=false] - Private repository
   * @param {boolean} [repoData.autoInit=true] - Initialize with README
   * @param {string} [repoData.gitignoreTemplate] - Gitignore template
   * @param {string} [repoData.licenseTemplate] - License template
   * @returns {Promise<Object>} Created repository
   * @throws {AppError} If creation fails
   */
  async createRepository(accessToken, repoData) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Creating GitHub repository', {
        correlationId,
        name: repoData.name,
        private: repoData.private || false
      });

      const octokit = await this.#getOctokit(accessToken);

      const { data: repo } = await octokit.repos.createForAuthenticatedUser({
        name: repoData.name,
        description: repoData.description,
        private: repoData.private || false,
        auto_init: repoData.autoInit !== false,
        gitignore_template: repoData.gitignoreTemplate,
        license_template: repoData.licenseTemplate,
        has_issues: repoData.hasIssues !== false,
        has_projects: repoData.hasProjects !== false,
        has_wiki: repoData.hasWiki !== false
      });

      logger.info('Repository created successfully', {
        correlationId,
        repoId: repo.id,
        fullName: repo.full_name
      });

      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        private: repo.private,
        defaultBranch: repo.default_branch,
        createdAt: repo.created_at
      };

    } catch (error) {
      logger.error('Repository creation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Validates an access token
   * @param {string} accessToken - Access token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(accessToken) {
    try {
      logger.info('Validating GitHub access token');

      const octokit = await this.#getOctokit(accessToken);
      
      // Check token with rate limit endpoint (doesn't count against rate limit)
      const { data: rateLimit } = await octokit.rateLimit.get();
      
      // Also try to get authenticated user
      const { data: user } = await octokit.users.getAuthenticated();

      return {
        valid: true,
        username: user.login,
        userId: user.id,
        scopes: octokit.request.defaults.headers['X-OAuth-Scopes']?.split(', ') || [],
        rateLimit: {
          limit: rateLimit.rate.limit,
          remaining: rateLimit.rate.remaining,
          reset: new Date(rateLimit.rate.reset * 1000).toISOString()
        }
      };

    } catch (error) {
      logger.warn('Token validation failed', { error: error.message });

      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Revokes access token
   * @param {string} accessToken - Access token to revoke
   * @returns {Promise<Object>} Revocation result
   */
  async revokeToken(accessToken) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Revoking GitHub access token', { correlationId });

      // Use the OAuth app auth to revoke the token
      await this.#oauthApp({
        type: 'delete-token',
        token: accessToken
      });

      // Clear from cache and instances
      const tokenHash = await this.#hashToken(accessToken);
      await this.#cacheService.delete(`github:token:*${tokenHash}*`);
      await this.#cacheService.delete(`github:profile:${tokenHash}`);
      await this.#cacheService.delete(`github:repos:${tokenHash}:*`);
      this.#octokitInstances.delete(accessToken);

      logger.info('Token revoked successfully', { correlationId });

      return {
        success: true,
        message: 'Token revoked successfully'
      };

    } catch (error) {
      logger.error('Token revocation failed', {
        correlationId,
        error: error.message
      });
      
      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * Validates webhook signature
   * @param {string} payload - Webhook payload
   * @param {string} signature - GitHub signature header
   * @returns {boolean} Validation result
   */
  validateWebhookSignature(payload, signature) {
    try {
      if (!this.#config.webhookSecret) {
        logger.warn('Webhook secret not configured');
        return false;
      }

      const crypto = require('crypto');
      const computedSignature = 'sha256=' + crypto
        .createHmac('sha256', this.#config.webhookSecret)
        .update(payload)
        .digest('hex');

      const valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );

      logger.info('Webhook signature validation', { valid });

      return valid;

    } catch (error) {
      logger.error('Webhook validation error', { error: error.message });
      return false;
    }
  }

  /**
   * Processes webhook event
   * @param {Object} event - GitHub webhook event
   * @returns {Promise<Object>} Processing result
   */
  async processWebhookEvent(event) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Processing GitHub webhook', {
        correlationId,
        event: event.name,
        action: event.payload?.action
      });

      // Process based on event type
      const handlers = {
        [GitHubAPI.#WEBHOOK_EVENTS.PUSH]: this.#handlePushEvent,
        [GitHubAPI.#WEBHOOK_EVENTS.PULL_REQUEST]: this.#handlePullRequestEvent,
        [GitHubAPI.#WEBHOOK_EVENTS.ISSUES]: this.#handleIssuesEvent,
        [GitHubAPI.#WEBHOOK_EVENTS.RELEASE]: this.#handleReleaseEvent,
        [GitHubAPI.#WEBHOOK_EVENTS.REPOSITORY]: this.#handleRepositoryEvent
      };

      const handler = handlers[event.name];
      if (handler) {
        return await handler.call(this, event.payload, correlationId);
      }

      return {
        processed: true,
        event: event.name,
        message: 'Event received but no specific handler implemented'
      };

    } catch (error) {
      logger.error('Webhook processing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGitHubError(error, correlationId);
    }
  }

  /**
   * @private
   * Gets or creates Octokit instance
   */
  async #getOctokit(accessToken) {
    if (this.#octokitInstances.has(accessToken)) {
      return this.#octokitInstances.get(accessToken);
    }

    const octokit = new Octokit({
      auth: accessToken,
      userAgent: this.#config.userAgent,
      timeZone: 'UTC',
      baseUrl: this.#config.baseURL,
      request: {
        timeout: this.#config.timeout
      }
    });

    this.#octokitInstances.set(accessToken, octokit);

    // Clean up old instances if too many
    if (this.#octokitInstances.size > 100) {
      const firstKey = this.#octokitInstances.keys().next().value;
      this.#octokitInstances.delete(firstKey);
    }

    return octokit;
  }

  /**
   * @private
   * Caches encrypted token
   */
  async #cacheToken(userId, tokenData) {
    try {
      const encryptedToken = await this.#encryptionService.encrypt(
        tokenData.accessToken
      );

      const cacheData = {
        ...tokenData,
        accessToken: encryptedToken
      };

      const cacheKey = `github:token:${userId}`;
      await this.#cacheService.set(cacheKey, cacheData, this.#config.cacheTTL);

    } catch (error) {
      logger.error('Failed to cache token', { error: error.message });
    }
  }

  /**
   * @private
   * Hashes token for cache key
   */
  async #hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * @private
   * Handles push webhook event
   */
  async #handlePushEvent(payload, correlationId) {
    logger.info('Handling push event', {
      correlationId,
      repository: payload.repository.full_name,
      commits: payload.commits?.length
    });

    return {
      processed: true,
      repository: payload.repository.full_name,
      branch: payload.ref?.replace('refs/heads/', ''),
      commits: payload.commits?.length || 0,
      pusher: payload.pusher?.name
    };
  }

  /**
   * @private
   * Handles pull request webhook event
   */
  async #handlePullRequestEvent(payload, correlationId) {
    logger.info('Handling pull request event', {
      correlationId,
      action: payload.action,
      number: payload.pull_request?.number
    });

    return {
      processed: true,
      action: payload.action,
      number: payload.pull_request?.number,
      title: payload.pull_request?.title,
      state: payload.pull_request?.state
    };
  }

  /**
   * @private
   * Handles issues webhook event
   */
  async #handleIssuesEvent(payload, correlationId) {
    logger.info('Handling issues event', {
      correlationId,
      action: payload.action,
      number: payload.issue?.number
    });

    return {
      processed: true,
      action: payload.action,
      number: payload.issue?.number,
      title: payload.issue?.title,
      state: payload.issue?.state
    };
  }

  /**
   * @private
   * Handles release webhook event
   */
  async #handleReleaseEvent(payload, correlationId) {
    logger.info('Handling release event', {
      correlationId,
      action: payload.action,
      tagName: payload.release?.tag_name
    });

    return {
      processed: true,
      action: payload.action,
      tagName: payload.release?.tag_name,
      name: payload.release?.name,
      prerelease: payload.release?.prerelease
    };
  }

  /**
   * @private
   * Handles repository webhook event
   */
  async #handleRepositoryEvent(payload, correlationId) {
    logger.info('Handling repository event', {
      correlationId,
      action: payload.action,
      repository: payload.repository?.full_name
    });

    return {
      processed: true,
      action: payload.action,
      repository: payload.repository?.full_name,
      private: payload.repository?.private
    };
  }

  /**
   * @private
   * Handles GitHub API errors
   */
  #handleGitHubError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const status = error.status || error.response?.status;
    let errorCode = ERROR_CODES.EXTERNAL_API_ERROR;
    let message = 'GitHub API error';

    if (status === 401) {
      errorCode = ERROR_CODES.UNAUTHORIZED;
      message = 'Invalid or expired access token';
    } else if (status === 403) {
      errorCode = ERROR_CODES.FORBIDDEN;
      message = error.response?.headers?.['x-ratelimit-remaining'] === '0'
        ? 'GitHub API rate limit exceeded'
        : 'Insufficient permissions';
    } else if (status === 404) {
      errorCode = ERROR_CODES.NOT_FOUND;
      message = 'Resource not found';
    } else if (status === 422) {
      errorCode = ERROR_CODES.VALIDATION_ERROR;
      message = 'Validation failed';
    }

    return new AppError(
      message,
      status || 500,
      errorCode,
      {
        correlationId,
        githubError: error.message,
        documentation: error.documentation_url,
        rateLimitRemaining: error.response?.headers?.['x-ratelimit-remaining'],
        rateLimitReset: error.response?.headers?.['x-ratelimit-reset']
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `github_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Check GitHub API status
      const response = await axios.get('https://api.github.com/rate_limit', {
        timeout: 5000,
        headers: {
          'User-Agent': this.#config.userAgent
        }
      });

      return {
        healthy: true,
        service: 'GitHubAPI',
        apiVersion: this.#config.apiVersion,
        rateLimit: {
          limit: response.data.rate.limit,
          remaining: response.data.rate.remaining,
          reset: new Date(response.data.rate.reset * 1000).toISOString()
        }
      };
    } catch (error) {
      logger.error('GitHub health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'GitHubAPI',
        error: error.message
      };
    }
  }
}

module.exports = GitHubAPI;