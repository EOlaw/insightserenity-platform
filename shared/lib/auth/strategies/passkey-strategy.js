'use strict';

/**
 * @fileoverview Passkey (WebAuthn/FIDO2) authentication strategy for Passport.js
 * @module shared/lib/auth/strategies/passkey-strategy
 * @requires module:@simplewebauthn/server
 * @requires module:passport-strategy
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/passkey-model
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 */

const { Strategy } = require('passport-strategy');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const UserModel = require('../../database/models/customer-services/core-business/user-management/user-model');
const PasskeyModel = require('../../database/models/users/passkey-model');
const CacheService = require('../../services/cache-service');
const AuditService = require('../../security/audit/audit-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');

/**
 * @class PasskeyAuthStrategy
 * @extends Strategy
 * @description WebAuthn/FIDO2 authentication strategy with enterprise security features
 */
class PasskeyAuthStrategy extends Strategy {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {AuditService}
   */
  #auditService;

  /**
   * @private
   * @type {EncryptionService}
   */
  #encryptionService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map}
   */
  #activeRegistrations;

  /**
   * @private
   * @type {Map}
   */
  #activeAuthentications;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    name: 'passkey',
    rpName: process.env.APP_NAME || 'InsightSerenity Platform',
    rpID: process.env.APP_DOMAIN || 'localhost',
    origin: process.env.APP_URL || 'http://localhost:3000',
    challengeSize: 32,
    timeout: 60000, // 60 seconds
    authenticator: {
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // 'platform' | 'cross-platform'
        requireResidentKey: true,
        residentKey: 'required', // 'discouraged' | 'preferred' | 'required'
        userVerification: 'required' // 'discouraged' | 'preferred' | 'required'
      },
      attestation: 'direct', // 'none' | 'indirect' | 'direct' | 'enterprise'
      extensions: {
        credProps: true,
        largeBlob: {
          support: 'preferred'
        }
      }
    },
    security: {
      requireUserVerification: true,
      allowBackupAuthenticator: true,
      validateOrigin: true,
      validateRpId: true,
      antiPhishing: true,
      maxCredentialsPerUser: 10
    },
    features: {
      supportMultiDevice: true,
      supportPasswordless: true,
      supportUsernameless: true,
      syncAcrossDevices: false,
      allowCredentialSharing: false
    },
    cache: {
      challengeTTL: 300, // 5 minutes
      registrationTTL: 600, // 10 minutes
      authenticationTTL: 300 // 5 minutes
    },
    audit: {
      logRegistrationAttempts: true,
      logAuthenticationAttempts: true,
      logCredentialUpdates: true,
      logSecurityEvents: true
    }
  };

  /**
   * Creates passkey strategy instance
   * @param {Object} [config] - Strategy configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {AuditService} [auditService] - Audit service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   */
  constructor(
    config = {},
    cacheService,
    auditService,
    encryptionService
  ) {
    super();
    
    this.#config = { ...PasskeyAuthStrategy.#DEFAULT_CONFIG, ...config };
    this.#cacheService = cacheService || new CacheService();
    this.#auditService = auditService || new AuditService();
    this.#encryptionService = encryptionService || new EncryptionService();
    this.#activeRegistrations = new Map();
    this.#activeAuthentications = new Map();

    this.name = this.#config.name;

    logger.info('PasskeyAuthStrategy initialized', {
      rpName: this.#config.rpName,
      rpID: this.#config.rpID,
      userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
      attestation: this.#config.authenticator.attestation
    });
  }

  /**
   * Authenticates using passkey
   * @param {Object} req - Express request object
   * @param {Object} [options] - Authentication options
   */
  async authenticate(req, options = {}) {
    const correlationId = req.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      const { action, credential, challenge, userId } = req.body;

      switch (action) {
        case 'register-begin':
          await this.#handleRegistrationBegin(req, correlationId);
          break;

        case 'register-complete':
          await this.#handleRegistrationComplete(req, correlationId);
          break;

        case 'authenticate-begin':
          await this.#handleAuthenticationBegin(req, correlationId);
          break;

        case 'authenticate-complete':
          await this.#handleAuthenticationComplete(req, correlationId);
          break;

        default:
          throw new AppError(
            'Invalid passkey action',
            400,
            ERROR_CODES.PASSKEY_INVALID_ACTION,
            { correlationId, action }
          );
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Passkey operation failed', {
        correlationId,
        error: error.message,
        duration
      });

      this.fail(error, 401);
    }
  }

  /**
   * Generates registration options for a user
   * @param {string} userId - User ID
   * @param {Object} [options] - Registration options
   * @returns {Promise<Object>} Registration options
   */
  async generateRegistrationOptions(userId, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Get user
      const user = await UserModel.findById(userId).lean();
      if (!user) {
        throw new AppError(
          'User not found',
          404,
          ERROR_CODES.USER_NOT_FOUND,
          { correlationId, userId }
        );
      }

      // Get existing credentials
      const existingCredentials = await PasskeyModel.find({
        userId,
        isActive: true
      }).lean();

      // Check credential limit
      if (existingCredentials.length >= this.#config.security.maxCredentialsPerUser) {
        throw new AppError(
          'Maximum passkey limit reached',
          400,
          ERROR_CODES.PASSKEY_LIMIT_EXCEEDED,
          { 
            correlationId,
            limit: this.#config.security.maxCredentialsPerUser,
            current: existingCredentials.length
          }
        );
      }

      // Generate registration options
      const registrationOptions = await generateRegistrationOptions({
        rpName: this.#config.rpName,
        rpID: this.#config.rpID,
        userID: userId,
        userName: user.username || user.email,
        userDisplayName: user.displayName || user.firstName || user.username,
        timeout: this.#config.timeout,
        attestationType: this.#config.authenticator.attestation,
        authenticatorSelection: this.#config.authenticator.authenticatorSelection,
        excludeCredentials: existingCredentials.map(cred => ({
          id: Buffer.from(cred.credentialId, 'base64'),
          type: 'public-key',
          transports: cred.transports
        })),
        extensions: this.#config.authenticator.extensions
      });

      // Store registration state
      const registrationState = {
        userId,
        challenge: registrationOptions.challenge,
        userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
        timestamp: Date.now(),
        correlationId
      };

      const stateKey = `passkey_reg:${userId}:${registrationOptions.challenge}`;
      await this.#cacheService.set(stateKey, registrationState, this.#config.cache.registrationTTL);
      this.#activeRegistrations.set(registrationOptions.challenge, registrationState);

      // Audit registration attempt
      if (this.#config.audit.logRegistrationAttempts) {
        await this.#auditService.logEvent({
          event: 'passkey.registration.started',
          userId,
          correlationId,
          metadata: {
            rpID: this.#config.rpID,
            attestationType: this.#config.authenticator.attestation,
            existingCredentials: existingCredentials.length
          }
        });
      }

      return registrationOptions;

    } catch (error) {
      logger.error('Failed to generate registration options', {
        correlationId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verifies registration response
   * @param {string} userId - User ID
   * @param {Object} credential - Registration credential
   * @param {Object} [options] - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyRegistrationResponse(userId, credential, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Get registration state
      const stateKey = `passkey_reg:${userId}:${credential.response.clientDataJSON}`;
      const registrationState = await this.#cacheService.get(stateKey) ||
                               this.#activeRegistrations.get(credential.response.clientDataJSON);

      if (!registrationState) {
        throw new AppError(
          'Registration session not found or expired',
          400,
          ERROR_CODES.PASSKEY_SESSION_EXPIRED,
          { correlationId }
        );
      }

      // Verify registration
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: registrationState.challenge,
        expectedOrigin: this.#config.origin,
        expectedRPID: this.#config.rpID,
        requireUserVerification: this.#config.security.requireUserVerification
      });

      if (!verification.verified) {
        throw new AppError(
          'Registration verification failed',
          400,
          ERROR_CODES.PASSKEY_VERIFICATION_FAILED,
          { correlationId, info: verification.registrationInfo }
        );
      }

      // Save credential
      const passkeyData = {
        userId,
        credentialId: Buffer.from(verification.registrationInfo.credentialID).toString('base64'),
        credentialPublicKey: Buffer.from(verification.registrationInfo.credentialPublicKey).toString('base64'),
        counter: verification.registrationInfo.counter,
        credentialDeviceType: verification.registrationInfo.credentialDeviceType,
        credentialBackedUp: verification.registrationInfo.credentialBackedUp,
        transports: credential.response.transports || [],
        attestationObject: Buffer.from(credential.response.attestationObject).toString('base64'),
        clientDataJSON: Buffer.from(credential.response.clientDataJSON).toString('base64'),
        fmt: verification.registrationInfo.fmt,
        aaguid: verification.registrationInfo.aaguid,
        userVerified: verification.registrationInfo.userVerified,
        deviceName: options.deviceName || 'Unknown Device',
        lastUsedAt: new Date(),
        registeredAt: new Date(),
        isActive: true
      };

      const passkey = await PasskeyModel.create(passkeyData);

      // Update user
      await UserModel.findByIdAndUpdate(userId, {
        $push: { passkeys: passkey._id },
        hasPasskey: true,
        lastPasskeyUpdate: new Date()
      });

      // Clean up state
      await this.#cacheService.delete(stateKey);
      this.#activeRegistrations.delete(registrationState.challenge);

      // Audit successful registration
      if (this.#config.audit.logRegistrationAttempts) {
        await this.#auditService.logEvent({
          event: 'passkey.registration.completed',
          userId,
          correlationId,
          metadata: {
            credentialId: passkeyData.credentialId,
            deviceType: passkeyData.credentialDeviceType,
            backedUp: passkeyData.credentialBackedUp,
            deviceName: passkeyData.deviceName
          }
        });
      }

      return {
        verified: true,
        credentialId: passkeyData.credentialId,
        deviceName: passkeyData.deviceName
      };

    } catch (error) {
      logger.error('Failed to verify registration response', {
        correlationId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @private
   * Handles registration begin
   */
  async #handleRegistrationBegin(req, correlationId) {
    const { userId } = req.body;

    if (!userId) {
      throw new AppError(
        'User ID required for registration',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { correlationId }
      );
    }

    const options = await this.generateRegistrationOptions(userId, { correlationId });
    
    this.success({
      action: 'register-begin',
      options,
      correlationId
    });
  }

  /**
   * @private
   * Handles registration complete
   */
  async #handleRegistrationComplete(req, correlationId) {
    const { userId, credential, deviceName } = req.body;

    if (!userId || !credential) {
      throw new AppError(
        'User ID and credential required',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { correlationId }
      );
    }

    const result = await this.verifyRegistrationResponse(
      userId,
      credential,
      { correlationId, deviceName }
    );

    this.success({
      action: 'register-complete',
      result,
      correlationId
    });
  }

  /**
   * @private
   * Handles authentication begin
   */
  async #handleAuthenticationBegin(req, correlationId) {
    const { username } = req.body;
    let userId = req.body.userId;

    // For usernameless flow, we'll get credentials from the browser
    if (!userId && !username && this.#config.features.supportUsernameless) {
      return this.#handleUsernamelessAuthBegin(req, correlationId);
    }

    // Find user if username provided
    if (!userId && username) {
      const user = await UserModel.findOne({
        $or: [
          { email: username },
          { username: username }
        ],
        hasPasskey: true
      }).lean();

      if (!user) {
        throw new AppError(
          'User not found or has no passkeys',
          404,
          ERROR_CODES.USER_NOT_FOUND,
          { correlationId }
        );
      }

      userId = user._id;
    }

    // Get user's passkeys
    const passkeys = await PasskeyModel.find({
      userId,
      isActive: true
    }).lean();

    if (passkeys.length === 0) {
      throw new AppError(
        'No passkeys found for user',
        404,
        ERROR_CODES.PASSKEY_NOT_FOUND,
        { correlationId }
      );
    }

    // Generate authentication options
    const authOptions = await generateAuthenticationOptions({
      timeout: this.#config.timeout,
      allowCredentials: passkeys.map(pk => ({
        id: Buffer.from(pk.credentialId, 'base64'),
        type: 'public-key',
        transports: pk.transports
      })),
      userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
      rpID: this.#config.rpID
    });

    // Store authentication state
    const authState = {
      userId,
      challenge: authOptions.challenge,
      userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
      timestamp: Date.now(),
      correlationId
    };

    const stateKey = `passkey_auth:${authOptions.challenge}`;
    await this.#cacheService.set(stateKey, authState, this.#config.cache.authenticationTTL);
    this.#activeAuthentications.set(authOptions.challenge, authState);

    // Audit authentication attempt
    if (this.#config.audit.logAuthenticationAttempts) {
      await this.#auditService.logEvent({
        event: 'passkey.authentication.started',
        userId,
        correlationId,
        metadata: {
          credentialCount: passkeys.length
        }
      });
    }

    this.success({
      action: 'authenticate-begin',
      options: authOptions,
      correlationId
    });
  }

  /**
   * @private
   * Handles usernameless authentication begin
   */
  async #handleUsernamelessAuthBegin(req, correlationId) {
    // Generate authentication options without allowCredentials
    const authOptions = await generateAuthenticationOptions({
      timeout: this.#config.timeout,
      userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
      rpID: this.#config.rpID
    });

    // Store authentication state
    const authState = {
      usernameless: true,
      challenge: authOptions.challenge,
      userVerification: this.#config.authenticator.authenticatorSelection.userVerification,
      timestamp: Date.now(),
      correlationId
    };

    const stateKey = `passkey_auth:${authOptions.challenge}`;
    await this.#cacheService.set(stateKey, authState, this.#config.cache.authenticationTTL);
    this.#activeAuthentications.set(authOptions.challenge, authState);

    this.success({
      action: 'authenticate-begin',
      options: authOptions,
      usernameless: true,
      correlationId
    });
  }

  /**
   * @private
   * Handles authentication complete
   */
  async #handleAuthenticationComplete(req, correlationId) {
    const { credential } = req.body;

    if (!credential) {
      throw new AppError(
        'Credential required',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { correlationId }
      );
    }

    // Get authentication state
    const clientDataJSON = JSON.parse(
      Buffer.from(credential.response.clientDataJSON, 'base64').toString()
    );
    const challenge = clientDataJSON.challenge;

    const stateKey = `passkey_auth:${challenge}`;
    const authState = await this.#cacheService.get(stateKey) ||
                     this.#activeAuthentications.get(challenge);

    if (!authState) {
      throw new AppError(
        'Authentication session not found or expired',
        400,
        ERROR_CODES.PASSKEY_SESSION_EXPIRED,
        { correlationId }
      );
    }

    // Find passkey by credential ID
    const credentialId = Buffer.from(credential.id, 'base64').toString('base64');
    const passkey = await PasskeyModel.findOne({
      credentialId,
      isActive: true
    }).lean();

    if (!passkey) {
      throw new AppError(
        'Passkey not found',
        404,
        ERROR_CODES.PASSKEY_NOT_FOUND,
        { correlationId, credentialId }
      );
    }

    // Get user
    const user = await UserModel.findById(passkey.userId)
      .populate('roles')
      .populate('permissions')
      .lean();

    if (!user || !user.isActive) {
      throw new AppError(
        'User not found or inactive',
        403,
        ERROR_CODES.ACCOUNT_INACTIVE,
        { correlationId }
      );
    }

    // Verify authentication
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: authState.challenge,
      expectedOrigin: this.#config.origin,
      expectedRPID: this.#config.rpID,
      authenticator: {
        credentialID: Buffer.from(passkey.credentialId, 'base64'),
        credentialPublicKey: Buffer.from(passkey.credentialPublicKey, 'base64'),
        counter: passkey.counter
      },
      requireUserVerification: this.#config.security.requireUserVerification
    });

    if (!verification.verified) {
      throw new AppError(
        'Authentication verification failed',
        401,
        ERROR_CODES.PASSKEY_VERIFICATION_FAILED,
        { correlationId }
      );
    }

    // Update passkey counter and last used
    await PasskeyModel.findByIdAndUpdate(passkey._id, {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
      $inc: { useCount: 1 }
    });

    // Update user login info
    await UserModel.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      lastLoginMethod: 'passkey',
      lastLoginIP: req.ip || req.connection.remoteAddress,
      lastLoginUserAgent: req.headers['user-agent']
    });

    // Clean up state
    await this.#cacheService.delete(stateKey);
    this.#activeAuthentications.delete(challenge);

    // Audit successful authentication
    if (this.#config.audit.logAuthenticationAttempts) {
      await this.#auditService.logEvent({
        event: 'passkey.authentication.completed',
        userId: user._id,
        correlationId,
        metadata: {
          credentialId: passkey.credentialId,
          deviceName: passkey.deviceName,
          userVerified: verification.authenticationInfo.userVerified
        }
      });
    }

    // Success
    this.success(user);
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `passkey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export factory function
module.exports = (config) => {
  return new PasskeyAuthStrategy(config);
};

// Also export class for testing
module.exports.PasskeyAuthStrategy = PasskeyAuthStrategy;