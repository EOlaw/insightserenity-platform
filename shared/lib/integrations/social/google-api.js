'use strict';

/**
 * @fileoverview Google API integration service
 * @module shared/lib/integrations/social/google-api
 * @requires module:googleapis
 * @requires module:google-auth-library
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class GoogleAPI
 * @description Handles Google OAuth 2.0 and various Google API operations
 * Implements profile access, calendar, drive, and other Google services integration
 */
class GoogleAPI {
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
   * @type {Map}
   * @description Map of OAuth2 clients per user
   */
  #oauth2Clients;

  /**
   * @private
   * @type {Object}
   * @description Google API service instances
   */
  #services;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    cacheTTL: 3600,
    profileCacheTTL: 86400,
    calendarCacheTTL: 1800,
    driveCacheTTL: 3600,
    scopes: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    defaultCalendarMaxResults: 250,
    defaultDrivePageSize: 100,
    defaultDriveFields: 'id, name, mimeType, modifiedTime, size, webViewLink, parents'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Google service names
   */
  static #SERVICES = {
    OAUTH2: 'oauth2',
    CALENDAR: 'calendar',
    DRIVE: 'drive',
    GMAIL: 'gmail',
    SHEETS: 'sheets',
    DOCS: 'docs',
    PEOPLE: 'people',
    YOUTUBE: 'youtube'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Google scopes mapping
   */
  static #SCOPES = {
    PROFILE: 'https://www.googleapis.com/auth/userinfo.profile',
    EMAIL: 'https://www.googleapis.com/auth/userinfo.email',
    CALENDAR: 'https://www.googleapis.com/auth/calendar',
    CALENDAR_READONLY: 'https://www.googleapis.com/auth/calendar.readonly',
    DRIVE: 'https://www.googleapis.com/auth/drive',
    DRIVE_FILE: 'https://www.googleapis.com/auth/drive.file',
    DRIVE_READONLY: 'https://www.googleapis.com/auth/drive.readonly',
    GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
    GMAIL_READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
    SHEETS: 'https://www.googleapis.com/auth/spreadsheets',
    DOCS: 'https://www.googleapis.com/auth/documents',
    CONTACTS: 'https://www.googleapis.com/auth/contacts',
    YOUTUBE: 'https://www.googleapis.com/auth/youtube'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Google API error codes
   */
  static #GOOGLE_ERRORS = {
    invalid_grant: 'Invalid or expired authorization grant',
    invalid_client: 'Invalid client credentials',
    invalid_scope: 'Invalid or malformed scope',
    access_denied: 'Access denied by user',
    unauthorized_client: 'Unauthorized client',
    unsupported_response_type: 'Unsupported response type',
    server_error: 'Google server error',
    temporarily_unavailable: 'Service temporarily unavailable'
  };

  /**
   * Creates a new GoogleAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.clientId - Google OAuth client ID
   * @param {string} config.clientSecret - Google OAuth client secret
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {Array<string>} [config.scopes] - OAuth scopes
   * @param {number} [config.timeout=30000] - Request timeout
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.clientId || !config?.clientSecret) {
        throw new AppError(
          'Google client ID and secret are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'GoogleAPI' }
        );
      }

      if (!config.redirectUri) {
        throw new AppError(
          'Google redirect URI is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'redirectUri' }
        );
      }

      this.#config = {
        ...GoogleAPI.#DEFAULT_CONFIG,
        ...config,
        scopes: config.scopes || GoogleAPI.#DEFAULT_CONFIG.scopes
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#oauth2Clients = new Map();
      this.#services = {};

      // Initialize service instances
      this.#initializeServices();

      logger.info('GoogleAPI initialized', {
        scopes: this.#config.scopes,
        hasEncryption: !!this.#encryptionService
      });
    } catch (error) {
      logger.error('GoogleAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize Google API service',
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
   * @param {string} [options.accessType='online'] - Access type (online/offline)
   * @param {string} [options.prompt='consent'] - Prompt type
   * @param {boolean} [options.includeGrantedScopes=true] - Include previously granted scopes
   * @returns {string} Authorization URL
   */
  generateAuthorizationUrl(options = {}) {
    try {
      const oauth2Client = new OAuth2Client(
        this.#config.clientId,
        this.#config.clientSecret,
        this.#config.redirectUri
      );

      const scopes = [
        ...this.#config.scopes,
        ...(options.additionalScopes || [])
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: options.accessType || 'online',
        scope: scopes,
        state: options.state,
        prompt: options.prompt || 'consent',
        include_granted_scopes: options.includeGrantedScopes !== false
      });

      logger.info('Generated Google authorization URL', {
        scopes,
        accessType: options.accessType || 'online',
        hasState: !!options.state
      });

      return authUrl;
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);
      throw new AppError(
        'Failed to generate Google authorization URL',
        500,
        ERROR_CODES.OAUTH_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Exchanges authorization code for tokens
   * @param {string} code - Authorization code
   * @param {Object} [options] - Exchange options
   * @returns {Promise<Object>} Token response
   * @throws {AppError} If token exchange fails
   */
  async exchangeCodeForToken(code, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Exchanging Google authorization code', { correlationId });

      const oauth2Client = new OAuth2Client(
        this.#config.clientId,
        this.#config.clientSecret,
        this.#config.redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);

      const tokenData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        idToken: tokens.id_token
      };

      // Decode ID token for user info
      if (tokens.id_token) {
        const ticket = await oauth2Client.verifyIdToken({
          idToken: tokens.id_token,
          audience: this.#config.clientId
        });
        const payload = ticket.getPayload();
        
        tokenData.userId = payload.sub;
        tokenData.email = payload.email;
        tokenData.emailVerified = payload.email_verified;
        tokenData.name = payload.name;
        tokenData.picture = payload.picture;
      }

      // Store OAuth2 client
      if (options.userId || tokenData.userId) {
        const userId = options.userId || tokenData.userId;
        oauth2Client.setCredentials(tokens);
        this.#oauth2Clients.set(userId, oauth2Client);
        
        // Cache encrypted tokens
        await this.#cacheTokens(userId, tokenData);
      }

      logger.info('Google token exchange successful', {
        correlationId,
        hasRefreshToken: !!tokens.refresh_token,
        scope: tokens.scope
      });

      return tokenData;

    } catch (error) {
      logger.error('Google token exchange failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Refreshes an expired access token
   * @param {string} refreshToken - Refresh token
   * @param {Object} [options] - Refresh options
   * @returns {Promise<Object>} New token response
   * @throws {AppError} If refresh fails
   */
  async refreshAccessToken(refreshToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Refreshing Google access token', { correlationId });

      const oauth2Client = new OAuth2Client(
        this.#config.clientId,
        this.#config.clientSecret,
        this.#config.redirectUri
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      const tokenData = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken,
        expiryDate: credentials.expiry_date,
        tokenType: credentials.token_type,
        scope: credentials.scope
      };

      // Update stored client if userId provided
      if (options.userId) {
        oauth2Client.setCredentials(credentials);
        this.#oauth2Clients.set(options.userId, oauth2Client);
        
        // Update cached tokens
        await this.#cacheTokens(options.userId, tokenData);
      }

      logger.info('Token refresh successful', {
        correlationId,
        newExpiryDate: new Date(credentials.expiry_date).toISOString()
      });

      return tokenData;

    } catch (error) {
      logger.error('Token refresh failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Fetches user profile information
   * @param {string} accessToken - Google access token
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.useCache=true] - Use cached profile
   * @returns {Promise<Object>} User profile data
   * @throws {AppError} If profile fetch fails
   */
  async fetchUserProfile(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      if (options.useCache !== false) {
        const cacheKey = `google:profile:${await this.#hashToken(accessToken)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Profile retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching Google user profile', { correlationId });

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const oauth2 = google.oauth2({
        version: 'v2',
        auth: oauth2Client
      });

      const { data } = await oauth2.userinfo.get();

      const profile = {
        id: data.id,
        email: data.email,
        emailVerified: data.verified_email,
        name: data.name,
        givenName: data.given_name,
        familyName: data.family_name,
        picture: data.picture,
        locale: data.locale,
        hd: data.hd // Hosted domain for G Suite
      };

      // Cache the profile
      if (options.useCache !== false) {
        const cacheKey = `google:profile:${await this.#hashToken(accessToken)}`;
        await this.#cacheService.set(cacheKey, profile, this.#config.profileCacheTTL);
      }

      logger.info('Google profile fetched successfully', {
        correlationId,
        userId: profile.id
      });

      return profile;

    } catch (error) {
      logger.error('Profile fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Fetches user's calendar events
   * @param {string} accessToken - Google access token
   * @param {Object} [options] - Fetch options
   * @param {Date} [options.timeMin] - Start time for events
   * @param {Date} [options.timeMax] - End time for events
   * @param {number} [options.maxResults=250] - Maximum results
   * @param {string} [options.calendarId='primary'] - Calendar ID
   * @param {boolean} [options.singleEvents=true] - Expand recurring events
   * @param {boolean} [options.useCache=true] - Use cached data
   * @returns {Promise<Object>} Calendar events
   * @throws {AppError} If fetch fails
   */
  async getCalendarEvents(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache
      if (options.useCache !== false) {
        const cacheKey = `google:calendar:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Calendar events retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Fetching Google calendar events', {
        correlationId,
        calendarId: options.calendarId || 'primary'
      });

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const calendar = google.calendar({
        version: 'v3',
        auth: oauth2Client
      });

      // Default to next 7 days if no time range specified
      const timeMin = options.timeMin || new Date();
      const timeMax = options.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: options.calendarId || 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: Math.min(options.maxResults || 250, 2500),
        singleEvents: options.singleEvents !== false,
        orderBy: 'startTime'
      });

      const events = {
        summary: response.data.summary,
        description: response.data.description,
        timeZone: response.data.timeZone,
        nextSyncToken: response.data.nextSyncToken,
        events: response.data.items.map(event => ({
          id: event.id,
          status: event.status,
          htmlLink: event.htmlLink,
          created: event.created,
          updated: event.updated,
          summary: event.summary,
          description: event.description,
          location: event.location,
          creator: event.creator,
          organizer: event.organizer,
          start: event.start,
          end: event.end,
          recurringEventId: event.recurringEventId,
          transparency: event.transparency,
          visibility: event.visibility,
          attendees: event.attendees,
          reminders: event.reminders,
          conferenceData: event.conferenceData
        }))
      };

      // Cache the results
      if (options.useCache !== false) {
        const cacheKey = `google:calendar:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        await this.#cacheService.set(cacheKey, events, this.#config.calendarCacheTTL);
      }

      logger.info('Calendar events fetched successfully', {
        correlationId,
        eventCount: events.events.length
      });

      return events;

    } catch (error) {
      logger.error('Calendar events fetch failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Lists files in Google Drive
   * @param {string} accessToken - Google access token
   * @param {Object} [options] - List options
   * @param {string} [options.q] - Search query
   * @param {number} [options.pageSize=100] - Page size
   * @param {string} [options.pageToken] - Page token
   * @param {string} [options.orderBy] - Order by field
   * @param {string} [options.fields] - Fields to return
   * @param {boolean} [options.useCache=true] - Use cached data
   * @returns {Promise<Object>} Drive files
   * @throws {AppError} If listing fails
   */
  async listDriveFiles(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache
      if (options.useCache !== false && !options.pageToken) {
        const cacheKey = `google:drive:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        const cached = await this.#cacheService.get(cacheKey);
        
        if (cached) {
          logger.debug('Drive files retrieved from cache', { correlationId });
          return cached;
        }
      }

      logger.info('Listing Google Drive files', {
        correlationId,
        hasQuery: !!options.q
      });

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const drive = google.drive({
        version: 'v3',
        auth: oauth2Client
      });

      const params = {
        pageSize: Math.min(options.pageSize || 100, 1000),
        fields: `nextPageToken, files(${options.fields || this.#config.defaultDriveFields})`
      };

      if (options.q) params.q = options.q;
      if (options.pageToken) params.pageToken = options.pageToken;
      if (options.orderBy) params.orderBy = options.orderBy;

      const response = await drive.files.list(params);

      const files = {
        nextPageToken: response.data.nextPageToken,
        files: response.data.files.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          modifiedTime: file.modifiedTime,
          createdTime: file.createdTime,
          parents: file.parents,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink,
          iconLink: file.iconLink,
          thumbnailLink: file.thumbnailLink,
          trashed: file.trashed,
          starred: file.starred,
          shared: file.shared,
          owners: file.owners,
          permissions: file.permissions
        }))
      };

      // Cache the results
      if (options.useCache !== false && !options.pageToken) {
        const cacheKey = `google:drive:${await this.#hashToken(accessToken)}:${JSON.stringify(options)}`;
        await this.#cacheService.set(cacheKey, files, this.#config.driveCacheTTL);
      }

      logger.info('Drive files listed successfully', {
        correlationId,
        fileCount: files.files.length,
        hasMore: !!files.nextPageToken
      });

      return files;

    } catch (error) {
      logger.error('Drive files listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Creates a file in Google Drive
   * @param {string} accessToken - Google access token
   * @param {Object} fileData - File data
   * @param {string} fileData.name - File name
   * @param {string} fileData.mimeType - MIME type
   * @param {Buffer|string} fileData.content - File content
   * @param {Array<string>} [fileData.parents] - Parent folder IDs
   * @param {string} [fileData.description] - File description
   * @returns {Promise<Object>} Created file
   * @throws {AppError} If creation fails
   */
  async createDriveFile(accessToken, fileData) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Creating Google Drive file', {
        correlationId,
        name: fileData.name,
        mimeType: fileData.mimeType
      });

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const drive = google.drive({
        version: 'v3',
        auth: oauth2Client
      });

      const requestBody = {
        name: fileData.name,
        mimeType: fileData.mimeType
      };

      if (fileData.parents) requestBody.parents = fileData.parents;
      if (fileData.description) requestBody.description = fileData.description;

      const media = {
        mimeType: fileData.mimeType,
        body: typeof fileData.content === 'string' 
          ? Buffer.from(fileData.content) 
          : fileData.content
      };

      const response = await drive.files.create({
        requestBody,
        media,
        fields: this.#config.defaultDriveFields
      });

      logger.info('Drive file created successfully', {
        correlationId,
        fileId: response.data.id
      });

      return {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        webViewLink: response.data.webViewLink,
        createdTime: response.data.createdTime
      };

    } catch (error) {
      logger.error('Drive file creation failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Lists user's YouTube channels
   * @param {string} accessToken - Google access token
   * @param {Object} [options] - List options
   * @returns {Promise<Object>} YouTube channels
   * @throws {AppError} If listing fails
   */
  async listYouTubeChannels(accessToken, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Listing YouTube channels', { correlationId });

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const youtube = google.youtube({
        version: 'v3',
        auth: oauth2Client
      });

      const response = await youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        mine: true
      });

      const channels = response.data.items.map(channel => ({
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        publishedAt: channel.snippet.publishedAt,
        thumbnails: channel.snippet.thumbnails,
        statistics: {
          viewCount: channel.statistics.viewCount,
          subscriberCount: channel.statistics.subscriberCount,
          videoCount: channel.statistics.videoCount
        },
        contentDetails: {
          uploads: channel.contentDetails.relatedPlaylists.uploads,
          likes: channel.contentDetails.relatedPlaylists.likes
        }
      }));

      logger.info('YouTube channels listed successfully', {
        correlationId,
        channelCount: channels.length
      });

      return { channels };

    } catch (error) {
      logger.error('YouTube channels listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * Validates an access token
   * @param {string} accessToken - Access token to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateToken(accessToken) {
    try {
      logger.info('Validating Google access token');

      const oauth2Client = await this.#getOAuth2Client(accessToken);
      const tokenInfo = await oauth2Client.getTokenInfo(accessToken);

      return {
        valid: true,
        email: tokenInfo.email,
        userId: tokenInfo.sub,
        scope: tokenInfo.scope,
        expiryDate: tokenInfo.expiry_date,
        isExpired: Date.now() > tokenInfo.expiry_date
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
   * Revokes access and refresh tokens
   * @param {string} token - Access or refresh token to revoke
   * @returns {Promise<Object>} Revocation result
   */
  async revokeToken(token) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Revoking Google token', { correlationId });

      const oauth2Client = new OAuth2Client(
        this.#config.clientId,
        this.#config.clientSecret,
        this.#config.redirectUri
      );

      await oauth2Client.revokeToken(token);

      // Clear from cache and clients
      const tokenHash = await this.#hashToken(token);
      await this.#cacheService.delete(`google:token:*${tokenHash}*`);
      await this.#cacheService.delete(`google:profile:${tokenHash}`);
      await this.#cacheService.delete(`google:calendar:${tokenHash}:*`);
      await this.#cacheService.delete(`google:drive:${tokenHash}:*`);

      // Remove OAuth2 clients that might be using this token
      for (const [userId, client] of this.#oauth2Clients.entries()) {
        const credentials = client.credentials;
        if (credentials.access_token === token || credentials.refresh_token === token) {
          this.#oauth2Clients.delete(userId);
        }
      }

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
      
      throw this.#handleGoogleError(error, correlationId);
    }
  }

  /**
   * @private
   * Initializes Google service instances
   */
  #initializeServices() {
    // Services are initialized on-demand when OAuth2 client is available
    this.#services = {
      [GoogleAPI.#SERVICES.OAUTH2]: google.oauth2('v2'),
      [GoogleAPI.#SERVICES.CALENDAR]: google.calendar('v3'),
      [GoogleAPI.#SERVICES.DRIVE]: google.drive('v3'),
      [GoogleAPI.#SERVICES.GMAIL]: google.gmail('v1'),
      [GoogleAPI.#SERVICES.SHEETS]: google.sheets('v4'),
      [GoogleAPI.#SERVICES.DOCS]: google.docs('v1'),
      [GoogleAPI.#SERVICES.PEOPLE]: google.people('v1'),
      [GoogleAPI.#SERVICES.YOUTUBE]: google.youtube('v3')
    };
  }

  /**
   * @private
   * Gets or creates OAuth2 client
   */
  async #getOAuth2Client(accessToken, refreshToken = null) {
    // Check if we have a client for this token
    for (const [userId, client] of this.#oauth2Clients.entries()) {
      if (client.credentials.access_token === accessToken) {
        return client;
      }
    }

    // Create new client
    const oauth2Client = new OAuth2Client(
      this.#config.clientId,
      this.#config.clientSecret,
      this.#config.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    return oauth2Client;
  }

  /**
   * @private
   * Caches encrypted tokens
   */
  async #cacheTokens(userId, tokenData) {
    try {
      const encryptedData = {
        ...tokenData,
        accessToken: await this.#encryptionService.encrypt(tokenData.accessToken)
      };

      if (tokenData.refreshToken) {
        encryptedData.refreshToken = await this.#encryptionService.encrypt(tokenData.refreshToken);
      }

      const cacheKey = `google:token:${userId}`;
      const ttl = tokenData.expiryDate 
        ? Math.floor((tokenData.expiryDate - Date.now()) / 1000)
        : this.#config.cacheTTL;

      await this.#cacheService.set(cacheKey, encryptedData, ttl);

    } catch (error) {
      logger.error('Failed to cache tokens', { error: error.message });
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
   * Handles Google API errors
   */
  #handleGoogleError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const errorCode = error.code || error.response?.data?.error;
    const errorMessage = GoogleAPI.#GOOGLE_ERRORS[errorCode] || error.message || 'Google API error';

    let appErrorCode = ERROR_CODES.EXTERNAL_API_ERROR;
    let status = error.response?.status || 500;

    if (errorCode === 'invalid_grant' || status === 401) {
      appErrorCode = ERROR_CODES.UNAUTHORIZED;
      status = 401;
    } else if (status === 403) {
      appErrorCode = ERROR_CODES.FORBIDDEN;
    } else if (status === 404) {
      appErrorCode = ERROR_CODES.NOT_FOUND;
    } else if (status === 429) {
      appErrorCode = ERROR_CODES.RATE_LIMIT_ERROR;
    }

    return new AppError(
      errorMessage,
      status,
      appErrorCode,
      {
        correlationId,
        googleError: errorCode,
        details: error.response?.data?.error_description
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Check Google OAuth2 endpoint
      const axios = require('axios');
      await axios.get('https://www.googleapis.com/oauth2/v3/tokeninfo', {
        timeout: 5000,
        params: { access_token: 'invalid' }
      }).catch(error => {
        // We expect this to fail, we're just checking if the endpoint is reachable
        if (error.response?.status !== 400) {
          throw error;
        }
      });

      return {
        healthy: true,
        service: 'GoogleAPI',
        connectedClients: this.#oauth2Clients.size
      };
    } catch (error) {
      logger.error('Google health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'GoogleAPI',
        error: error.message
      };
    }
  }
}

module.exports = GoogleAPI;