'use strict';

/**
 * @fileoverview SAML operations and metadata handling service
 * @module shared/lib/integrations/sso/saml-api
 * @requires module:saml2-js
 * @requires module:xmldom
 * @requires module:xpath
 * @requires module:xml-crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const saml2 = require('saml2-js');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const xmlCrypto = require('xml-crypto');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');

/**
 * @class SAMLAPI
 * @description Handles SAML 2.0 operations including metadata generation, 
 * assertion validation, and identity provider integration
 */
class SAMLAPI {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for metadata and session caching
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
   * @type {Object}
   * @description SAML Service Provider instance
   */
  #serviceProvider;

  /**
   * @private
   * @type {Map}
   * @description Map of Identity Provider instances
   */
  #identityProviders;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    protocol: 'saml2',
    version: '2.0',
    nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    cacheTTL: 3600,
    metadataCacheTTL: 86400,
    sessionCacheTTL: 28800, // 8 hours
    assertionLifetime: 300, // 5 minutes
    clockSkew: 300, // 5 minutes tolerance
    allowCreate: true,
    forceAuthn: false,
    validateSignature: true,
    validateAssertions: true,
    encryptAssertions: false,
    signRequests: true,
    signResponses: true
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description SAML namespace URIs
   */
  static #NAMESPACES = {
    SAML2: 'urn:oasis:names:tc:SAML:2.0:assertion',
    SAMLP2: 'urn:oasis:names:tc:SAML:2.0:protocol',
    MD: 'urn:oasis:names:tc:SAML:2.0:metadata',
    DS: 'http://www.w3.org/2000/09/xmldsig#',
    XENC: 'http://www.w3.org/2001/04/xmlenc#',
    XS: 'http://www.w3.org/2001/XMLSchema',
    XSI: 'http://www.w3.org/2001/XMLSchema-instance'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description SAML binding types
   */
  static #BINDINGS = {
    HTTP_POST: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
    HTTP_REDIRECT: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
    HTTP_ARTIFACT: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact',
    SOAP: 'urn:oasis:names:tc:SAML:2.0:bindings:SOAP'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Standard SAML attribute names
   */
  static #ATTRIBUTES = {
    EMAIL: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    FIRST_NAME: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    LAST_NAME: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    DISPLAY_NAME: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    GROUPS: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
    ROLES: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    DEPARTMENT: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department',
    EMPLOYEE_ID: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/employeeid'
  };

  /**
   * Creates a new SAMLAPI instance
   * @param {Object} config - Service configuration
   * @param {string} config.entityId - Service Provider entity ID
   * @param {string} config.assertionConsumerServiceUrl - ACS URL
   * @param {string} config.singleLogoutServiceUrl - SLO URL
   * @param {string} [config.privateKey] - SP private key for signing
   * @param {string} [config.certificate] - SP certificate
   * @param {Object} [config.idp] - Identity Provider configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.entityId || !config?.assertionConsumerServiceUrl) {
        throw new AppError(
          'SAML entity ID and ACS URL are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'SAMLAPI' }
        );
      }

      this.#config = {
        ...SAMLAPI.#DEFAULT_CONFIG,
        ...config
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#identityProviders = new Map();

      // Initialize Service Provider
      this.#initializeServiceProvider();

      // Initialize Identity Providers if configured
      if (config.idp) {
        this.#initializeIdentityProvider('default', config.idp);
      }

      logger.info('SAMLAPI initialized', {
        entityId: this.#config.entityId,
        hasPrivateKey: !!this.#config.privateKey,
        hasCertificate: !!this.#config.certificate,
        idpCount: this.#identityProviders.size
      });
    } catch (error) {
      logger.error('SAMLAPI initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize SAML API service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates Service Provider metadata XML
   * @param {Object} [options] - Metadata generation options
   * @param {boolean} [options.includeSigningCert=true] - Include signing certificate
   * @param {boolean} [options.includeEncryptionCert=false] - Include encryption certificate
   * @returns {string} SP metadata XML
   */
  generateServiceProviderMetadata(options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Generating Service Provider metadata', {
        correlationId,
        entityId: this.#config.entityId
      });

      const spOptions = {
        entity_id: this.#config.entityId,
        private_key: this.#config.privateKey,
        certificate: this.#config.certificate,
        assert_endpoint: this.#config.assertionConsumerServiceUrl,
        force_authn: this.#config.forceAuthn,
        auth_context: {
          comparison: 'exact',
          class_refs: ['urn:oasis:names:tc:SAML:1.0:am:password']
        },
        nameid_format: this.#config.nameIdFormat,
        sign_get_request: this.#config.signRequests,
        allow_unencrypted_assertion: !this.#config.encryptAssertions
      };

      if (this.#config.singleLogoutServiceUrl) {
        spOptions.slo_service_url = this.#config.singleLogoutServiceUrl;
      }

      const sp = new saml2.ServiceProvider(spOptions);
      const metadata = sp.create_metadata();

      logger.info('Service Provider metadata generated successfully', {
        correlationId,
        metadataLength: metadata.length
      });

      return metadata;

    } catch (error) {
      logger.error('Metadata generation failed', {
        correlationId,
        error: error.message
      });

      throw new AppError(
        'Failed to generate SAML metadata',
        500,
        ERROR_CODES.SAML_METADATA_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Creates an authentication request
   * @param {string} [idpName='default'] - Identity Provider name
   * @param {Object} [options] - Request options
   * @param {string} [options.relayState] - Relay state parameter
   * @param {boolean} [options.forceAuthn] - Force re-authentication
   * @param {string} [options.nameIdPolicy] - NameID format policy
   * @returns {Promise<Object>} Authentication request data
   */
  async createAuthenticationRequest(idpName = 'default', options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      const idp = this.#identityProviders.get(idpName);
      if (!idp) {
        throw new AppError(
          `Identity Provider '${idpName}' not configured`,
          400,
          ERROR_CODES.SAML_IDP_NOT_FOUND,
          { idpName }
        );
      }

      logger.info('Creating SAML authentication request', {
        correlationId,
        idpName,
        relayState: options.relayState
      });

      return new Promise((resolve, reject) => {
        this.#serviceProvider.create_login_request_url(idp, {
          relay_state: options.relayState,
          force_authn: options.forceAuthn || this.#config.forceAuthn,
          nameid_format: options.nameIdPolicy || this.#config.nameIdFormat
        }, (err, loginUrl, requestId) => {
          if (err) {
            logger.error('Authentication request creation failed', {
              correlationId,
              error: err.message
            });
            return reject(new AppError(
              'Failed to create SAML authentication request',
              500,
              ERROR_CODES.SAML_REQUEST_ERROR,
              { correlationId, originalError: err.message }
            ));
          }

          // Cache request ID for validation
          this.#cacheService.set(
            `saml:request:${requestId}`,
            { correlationId, createdAt: Date.now() },
            this.#config.assertionLifetime
          );

          logger.info('Authentication request created successfully', {
            correlationId,
            requestId,
            loginUrl: loginUrl.substring(0, 100) + '...'
          });

          resolve({
            loginUrl,
            requestId,
            relayState: options.relayState,
            correlationId
          });
        });
      });

    } catch (error) {
      logger.error('Authentication request creation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create authentication request',
        500,
        ERROR_CODES.SAML_REQUEST_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Processes and validates a SAML response
   * @param {string} samlResponse - Base64 encoded SAML response
   * @param {Object} [options] - Processing options
   * @param {string} [options.relayState] - Relay state parameter
   * @param {string} [options.idpName='default'] - Identity Provider name
   * @returns {Promise<Object>} Processed assertion data
   */
  async processSAMLResponse(samlResponse, options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      const idp = this.#identityProviders.get(options.idpName || 'default');
      if (!idp) {
        throw new AppError(
          `Identity Provider '${options.idpName}' not configured`,
          400,
          ERROR_CODES.SAML_IDP_NOT_FOUND,
          { idpName: options.idpName }
        );
      }

      logger.info('Processing SAML response', {
        correlationId,
        hasRelayState: !!options.relayState,
        responseLength: samlResponse.length
      });

      return new Promise((resolve, reject) => {
        const requestBody = {
          SAMLResponse: samlResponse,
          RelayState: options.relayState
        };

        this.#serviceProvider.post_assert(idp, requestBody, async (err, samlAssert) => {
          if (err) {
            logger.error('SAML response processing failed', {
              correlationId,
              error: err.message
            });
            return reject(new AppError(
              'Failed to process SAML response',
              400,
              ERROR_CODES.SAML_RESPONSE_ERROR,
              { correlationId, originalError: err.message }
            ));
          }

          try {
            // Extract and validate assertion data
            const assertionData = await this.#extractAssertionData(samlAssert, correlationId);

            // Validate request ID if present
            if (samlAssert.response_header?.in_response_to) {
              await this.#validateRequestId(samlAssert.response_header.in_response_to, correlationId);
            }

            // Cache assertion for potential logout
            await this.#cacheAssertion(assertionData, correlationId);

            logger.info('SAML response processed successfully', {
              correlationId,
              nameId: assertionData.nameId,
              sessionIndex: assertionData.sessionIndex
            });

            resolve(assertionData);

          } catch (validationError) {
            logger.error('SAML assertion validation failed', {
              correlationId,
              error: validationError.message
            });
            reject(validationError);
          }
        });
      });

    } catch (error) {
      logger.error('SAML response processing failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to process SAML response',
        500,
        ERROR_CODES.SAML_RESPONSE_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Creates a logout request
   * @param {Object} userSession - User session data
   * @param {string} userSession.nameId - User's NameID
   * @param {string} userSession.sessionIndex - SAML session index
   * @param {string} [idpName='default'] - Identity Provider name
   * @param {Object} [options] - Logout options
   * @returns {Promise<Object>} Logout request data
   */
  async createLogoutRequest(userSession, idpName = 'default', options = {}) {
    const correlationId = this.#generateCorrelationId();

    try {
      const idp = this.#identityProviders.get(idpName);
      if (!idp) {
        throw new AppError(
          `Identity Provider '${idpName}' not configured`,
          400,
          ERROR_CODES.SAML_IDP_NOT_FOUND,
          { idpName }
        );
      }

      logger.info('Creating SAML logout request', {
        correlationId,
        nameId: userSession.nameId,
        sessionIndex: userSession.sessionIndex
      });

      return new Promise((resolve, reject) => {
        this.#serviceProvider.create_logout_request_url(idp, {
          name_id: userSession.nameId,
          session_index: userSession.sessionIndex,
          relay_state: options.relayState
        }, (err, logoutUrl, requestId) => {
          if (err) {
            logger.error('Logout request creation failed', {
              correlationId,
              error: err.message
            });
            return reject(new AppError(
              'Failed to create SAML logout request',
              500,
              ERROR_CODES.SAML_LOGOUT_ERROR,
              { correlationId, originalError: err.message }
            ));
          }

          logger.info('Logout request created successfully', {
            correlationId,
            requestId
          });

          resolve({
            logoutUrl,
            requestId,
            relayState: options.relayState,
            correlationId
          });
        });
      });

    } catch (error) {
      logger.error('Logout request creation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to create logout request',
        500,
        ERROR_CODES.SAML_LOGOUT_ERROR,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Validates Identity Provider metadata
   * @param {string} metadataXml - IDP metadata XML
   * @returns {Promise<Object>} Validation result
   */
  async validateIdentityProviderMetadata(metadataXml) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Validating Identity Provider metadata', {
        correlationId,
        metadataLength: metadataXml.length
      });

      // Parse XML
      const doc = new DOMParser().parseFromString(metadataXml, 'text/xml');
      
      // Check for parsing errors
      const parseErrors = doc.getElementsByTagName('parsererror');
      if (parseErrors.length > 0) {
        throw new AppError(
          'Invalid XML format',
          400,
          ERROR_CODES.SAML_METADATA_INVALID,
          { correlationId }
        );
      }

      // Extract metadata information
      const metadata = this.#extractMetadataInfo(doc, correlationId);

      // Validate required elements
      this.#validateMetadataElements(metadata, correlationId);

      logger.info('Identity Provider metadata validated successfully', {
        correlationId,
        entityId: metadata.entityId
      });

      return {
        valid: true,
        metadata,
        correlationId
      };

    } catch (error) {
      logger.error('Metadata validation failed', {
        correlationId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to validate metadata',
        400,
        ERROR_CODES.SAML_METADATA_INVALID,
        { correlationId, originalError: error.message }
      );
    }
  }

  /**
   * Adds or updates an Identity Provider configuration
   * @param {string} name - IDP name/identifier
   * @param {Object} idpConfig - IDP configuration
   * @param {string} idpConfig.ssoLoginUrl - SSO login URL
   * @param {string} idpConfig.ssoLogoutUrl - SSO logout URL
   * @param {string} idpConfig.certificate - IDP certificate
   * @param {string} [idpConfig.entityId] - IDP entity ID
   * @returns {Promise<Object>} Configuration result
   */
  async addIdentityProvider(name, idpConfig) {
    const correlationId = this.#generateCorrelationId();

    try {
      logger.info('Adding Identity Provider', {
        correlationId,
        name,
        hasEntityId: !!idpConfig.entityId
      });

      // Validate configuration
      if (!idpConfig.ssoLoginUrl || !idpConfig.certificate) {
        throw new AppError(
          'SSO login URL and certificate are required',
          400,
          ERROR_CODES.SAML_IDP_CONFIG_INVALID,
          { name }
        );
      }

      // Initialize IDP
      const idp = this.#initializeIdentityProvider(name, idpConfig);

      // Cache configuration
      await this.#cacheService.set(
        `saml:idp:${name}`,
        idpConfig,
        this.#config.metadataCacheTTL
      );

      logger.info('Identity Provider added successfully', {
        correlationId,
        name,
        entityId: idpConfig.entityId
      });

      return {
        success: true,
        name,
        entityId: idpConfig.entityId,
        correlationId
      };

    } catch (error) {
      logger.error('Failed to add Identity Provider', {
        correlationId,
        name,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to add Identity Provider',
        500,
        ERROR_CODES.SAML_IDP_CONFIG_ERROR,
        { correlationId, name, originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Initializes Service Provider
   */
  #initializeServiceProvider() {
    const spOptions = {
      entity_id: this.#config.entityId,
      private_key: this.#config.privateKey,
      certificate: this.#config.certificate,
      assert_endpoint: this.#config.assertionConsumerServiceUrl,
      force_authn: this.#config.forceAuthn,
      auth_context: {
        comparison: 'exact',
        class_refs: ['urn:oasis:names:tc:SAML:1.0:am:password']
      },
      nameid_format: this.#config.nameIdFormat,
      sign_get_request: this.#config.signRequests,
      allow_unencrypted_assertion: !this.#config.encryptAssertions
    };

    if (this.#config.singleLogoutServiceUrl) {
      spOptions.slo_service_url = this.#config.singleLogoutServiceUrl;
    }

    this.#serviceProvider = new saml2.ServiceProvider(spOptions);
  }

  /**
   * @private
   * Initializes an Identity Provider
   */
  #initializeIdentityProvider(name, idpConfig) {
    const idpOptions = {
      sso_login_url: idpConfig.ssoLoginUrl,
      sso_logout_url: idpConfig.ssoLogoutUrl,
      certificates: [idpConfig.certificate],
      force_authn: idpConfig.forceAuthn || this.#config.forceAuthn,
      sign_get_request: idpConfig.signRequests || this.#config.signRequests,
      allow_unencrypted_assertion: idpConfig.allowUnencryptedAssertion || !this.#config.encryptAssertions
    };

    if (idpConfig.entityId) {
      idpOptions.entity_id = idpConfig.entityId;
    }

    const idp = new saml2.IdentityProvider(idpOptions);
    this.#identityProviders.set(name, idp);

    return idp;
  }

  /**
   * @private
   * Extracts assertion data from SAML assertion
   */
  async #extractAssertionData(samlAssert, correlationId) {
    const assertionData = {
      nameId: samlAssert.user.name_id,
      nameIdFormat: samlAssert.user.format,
      sessionIndex: samlAssert.user.session_index,
      issuer: samlAssert.response_header.destination,
      attributes: {},
      rawAttributes: samlAssert.user.attributes,
      assertionId: samlAssert.response_header.id,
      responseId: samlAssert.response_header.in_response_to,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + (this.#config.assertionLifetime * 1000))
    };

    // Map standard attributes
    if (samlAssert.user.attributes) {
      Object.entries(samlAssert.user.attributes).forEach(([key, value]) => {
        // Normalize attribute values
        const normalizedValue = Array.isArray(value) ? value : [value];
        assertionData.attributes[key] = normalizedValue;

        // Map to standard claim names
        if (key === SAMLAPI.#ATTRIBUTES.EMAIL) {
          assertionData.email = normalizedValue[0];
        } else if (key === SAMLAPI.#ATTRIBUTES.FIRST_NAME) {
          assertionData.firstName = normalizedValue[0];
        } else if (key === SAMLAPI.#ATTRIBUTES.LAST_NAME) {
          assertionData.lastName = normalizedValue[0];
        } else if (key === SAMLAPI.#ATTRIBUTES.DISPLAY_NAME) {
          assertionData.displayName = normalizedValue[0];
        } else if (key === SAMLAPI.#ATTRIBUTES.GROUPS) {
          assertionData.groups = normalizedValue;
        } else if (key === SAMLAPI.#ATTRIBUTES.ROLES) {
          assertionData.roles = normalizedValue;
        }
      });
    }

    return assertionData;
  }

  /**
   * @private
   * Validates request ID
   */
  async #validateRequestId(requestId, correlationId) {
    const cachedRequest = await this.#cacheService.get(`saml:request:${requestId}`);
    
    if (!cachedRequest) {
      throw new AppError(
        'Invalid or expired request ID',
        400,
        ERROR_CODES.SAML_REQUEST_INVALID,
        { correlationId, requestId }
      );
    }

    // Remove from cache to prevent replay
    await this.#cacheService.delete(`saml:request:${requestId}`);
  }

  /**
   * @private
   * Caches assertion for logout
   */
  async #cacheAssertion(assertionData, correlationId) {
    try {
      const sessionKey = `saml:session:${assertionData.nameId}:${assertionData.sessionIndex}`;
      await this.#cacheService.set(
        sessionKey,
        {
          nameId: assertionData.nameId,
          sessionIndex: assertionData.sessionIndex,
          issuer: assertionData.issuer,
          correlationId,
          createdAt: Date.now()
        },
        this.#config.sessionCacheTTL
      );
    } catch (error) {
      logger.warn('Failed to cache assertion', {
        correlationId,
        error: error.message
      });
    }
  }

  /**
   * @private
   * Extracts metadata information from XML document
   */
  #extractMetadataInfo(doc, correlationId) {
    const metadata = {
      entityId: null,
      ssoServices: [],
      sloServices: [],
      certificates: [],
      nameIdFormats: [],
      attributes: []
    };

    try {
      // Extract entity ID
      const entityDescriptor = doc.getElementsByTagNameNS(SAMLAPI.#NAMESPACES.MD, 'EntityDescriptor')[0];
      if (entityDescriptor) {
        metadata.entityId = entityDescriptor.getAttribute('entityID');
      }

      // Extract SSO services
      const ssoServices = doc.getElementsByTagNameNS(SAMLAPI.#NAMESPACES.MD, 'SingleSignOnService');
      for (let i = 0; i < ssoServices.length; i++) {
        const service = ssoServices[i];
        metadata.ssoServices.push({
          binding: service.getAttribute('Binding'),
          location: service.getAttribute('Location')
        });
      }

      // Extract SLO services
      const sloServices = doc.getElementsByTagNameNS(SAMLAPI.#NAMESPACES.MD, 'SingleLogoutService');
      for (let i = 0; i < sloServices.length; i++) {
        const service = sloServices[i];
        metadata.sloServices.push({
          binding: service.getAttribute('Binding'),
          location: service.getAttribute('Location')
        });
      }

      // Extract certificates
      const certificates = doc.getElementsByTagNameNS(SAMLAPI.#NAMESPACES.DS, 'X509Certificate');
      for (let i = 0; i < certificates.length; i++) {
        metadata.certificates.push(certificates[i].textContent.trim());
      }

    } catch (error) {
      logger.error('Failed to extract metadata information', {
        correlationId,
        error: error.message
      });
    }

    return metadata;
  }

  /**
   * @private
   * Validates metadata elements
   */
  #validateMetadataElements(metadata, correlationId) {
    if (!metadata.entityId) {
      throw new AppError(
        'Missing entity ID in metadata',
        400,
        ERROR_CODES.SAML_METADATA_INVALID,
        { correlationId, field: 'entityId' }
      );
    }

    if (metadata.ssoServices.length === 0) {
      throw new AppError(
        'No SSO services found in metadata',
        400,
        ERROR_CODES.SAML_METADATA_INVALID,
        { correlationId, field: 'ssoServices' }
      );
    }

    if (metadata.certificates.length === 0) {
      throw new AppError(
        'No certificates found in metadata',
        400,
        ERROR_CODES.SAML_METADATA_INVALID,
        { correlationId, field: 'certificates' }
      );
    }
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `saml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      return {
        healthy: true,
        service: 'SAMLAPI',
        entityId: this.#config.entityId,
        identityProviders: Array.from(this.#identityProviders.keys()),
        features: {
          signRequests: this.#config.signRequests,
          validateSignatures: this.#config.validateSignature,
          encryptAssertions: this.#config.encryptAssertions
        }
      };
    } catch (error) {
      logger.error('SAML health check failed', { error: error.message });

      return {
        healthy: false,
        service: 'SAMLAPI',
        error: error.message
      };
    }
  }
}

module.exports = SAMLAPI;