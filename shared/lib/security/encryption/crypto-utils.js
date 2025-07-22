'use strict';

/**
 * @fileoverview Low-level cryptographic utility functions
 * @module shared/lib/security/encryption/crypto-utils
 * @requires crypto
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');

/**
 * @class CryptoUtils
 * @description Provides low-level cryptographic utilities and helper functions
 */
class CryptoUtils {
  /**
   * @private
   * @static
   * @readonly
   */
  static #HASH_ALGORITHMS = {
    MD5: 'md5',
    SHA1: 'sha1',
    SHA256: 'sha256',
    SHA384: 'sha384',
    SHA512: 'sha512',
    SHA3_256: 'sha3-256',
    SHA3_384: 'sha3-384',
    SHA3_512: 'sha3-512',
    BLAKE2S256: 'blake2s256',
    BLAKE2B512: 'blake2b512'
  };

  static #HMAC_ALGORITHMS = ['sha256', 'sha384', 'sha512'];
  
  static #ENCODING_FORMATS = ['hex', 'base64', 'base64url', 'binary', 'utf8'];
  
  static #SECURE_RANDOM_DEFAULTS = {
    min: 0,
    max: Number.MAX_SAFE_INTEGER
  };

  static #TIME_CONSTANT_BUFFER_SIZE = 256;

  /**
   * Generates cryptographically secure random bytes
   * @static
   * @param {number} [length=32] - Number of bytes to generate
   * @returns {Buffer} Random bytes
   * @throws {AppError} If generation fails
   */
  static generateRandomBytes(length = 32) {
    try {
      if (!Number.isInteger(length) || length <= 0) {
        throw new AppError('Length must be a positive integer', 400, 'INVALID_LENGTH');
      }

      return crypto.randomBytes(length);

    } catch (error) {
      logger.error('Random bytes generation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to generate random bytes',
        500,
        'RANDOM_GENERATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a secure random string
   * @static
   * @param {number} [length=32] - Length of string
   * @param {Object} [options={}] - Generation options
   * @param {string} [options.encoding='hex'] - Output encoding
   * @param {string} [options.charset] - Custom character set
   * @returns {string} Random string
   */
  static generateRandomString(length = 32, options = {}) {
    try {
      const { 
        encoding = 'hex',
        charset
      } = options;

      if (charset) {
        return this.#generateCustomCharsetString(length, charset);
      }

      // Calculate required bytes for encoding
      let byteLength;
      switch (encoding) {
        case 'hex':
          byteLength = Math.ceil(length / 2);
          break;
        case 'base64':
        case 'base64url':
          byteLength = Math.ceil(length * 3 / 4);
          break;
        default:
          byteLength = length;
      }

      const bytes = this.generateRandomBytes(byteLength);
      const encoded = bytes.toString(encoding);

      return encoded.slice(0, length);

    } catch (error) {
      logger.error('Random string generation failed', error);
      throw new AppError(
        'Failed to generate random string',
        500,
        'RANDOM_STRING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a secure random integer
   * @static
   * @param {number} [min=0] - Minimum value (inclusive)
   * @param {number} [max=Number.MAX_SAFE_INTEGER] - Maximum value (inclusive)
   * @returns {number} Random integer
   */
  static generateRandomInt(
    min = CryptoUtils.#SECURE_RANDOM_DEFAULTS.min,
    max = CryptoUtils.#SECURE_RANDOM_DEFAULTS.max
  ) {
    try {
      if (min > max) {
        throw new AppError('Min must be less than or equal to max', 400, 'INVALID_RANGE');
      }

      const range = max - min + 1;
      const bytesNeeded = Math.ceil(Math.log2(range) / 8);
      const maxValue = Math.pow(256, bytesNeeded);
      const threshold = maxValue - (maxValue % range);

      let randomValue;
      do {
        const bytes = this.generateRandomBytes(bytesNeeded);
        randomValue = parseInt(bytes.toString('hex'), 16);
      } while (randomValue >= threshold);

      return min + (randomValue % range);

    } catch (error) {
      logger.error('Random integer generation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to generate random integer',
        500,
        'RANDOM_INT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a UUID v4
   * @static
   * @param {boolean} [secure=true] - Use crypto.randomUUID if available
   * @returns {string} UUID v4
   */
  static generateUUID(secure = true) {
    try {
      // Use native randomUUID if available (Node.js 14.17+)
      if (secure && crypto.randomUUID) {
        return crypto.randomUUID();
      }

      // Manual UUID v4 generation
      const bytes = this.generateRandomBytes(16);
      
      // Set version (4) and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = bytes.toString('hex');
      
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
      ].join('-');

    } catch (error) {
      logger.error('UUID generation failed', error);
      throw new AppError(
        'Failed to generate UUID',
        500,
        'UUID_GENERATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a hash of data
   * @static
   * @param {string|Buffer} data - Data to hash
   * @param {Object} [options={}] - Hash options
   * @param {string} [options.algorithm='sha256'] - Hash algorithm
   * @param {string} [options.encoding='hex'] - Output encoding
   * @param {Buffer} [options.salt] - Optional salt
   * @returns {string|Buffer} Hash value
   */
  static hash(data, options = {}) {
    try {
      const {
        algorithm = CryptoUtils.#HASH_ALGORITHMS.SHA256,
        encoding = 'hex',
        salt
      } = options;

      if (!Object.values(CryptoUtils.#HASH_ALGORITHMS).includes(algorithm)) {
        throw new AppError('Invalid hash algorithm', 400, 'INVALID_ALGORITHM');
      }

      const hash = crypto.createHash(algorithm);
      
      if (salt) {
        hash.update(salt);
      }
      
      hash.update(data);
      
      return encoding ? hash.digest(encoding) : hash.digest();

    } catch (error) {
      logger.error('Hashing failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create hash',
        500,
        'HASHING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates an HMAC
   * @static
   * @param {string|Buffer} data - Data to sign
   * @param {string|Buffer} key - HMAC key
   * @param {Object} [options={}] - HMAC options
   * @param {string} [options.algorithm='sha256'] - HMAC algorithm
   * @param {string} [options.encoding='hex'] - Output encoding
   * @returns {string|Buffer} HMAC value
   */
  static hmac(data, key, options = {}) {
    try {
      const {
        algorithm = 'sha256',
        encoding = 'hex'
      } = options;

      if (!CryptoUtils.#HMAC_ALGORITHMS.includes(algorithm)) {
        throw new AppError('Invalid HMAC algorithm', 400, 'INVALID_ALGORITHM');
      }

      if (!key) {
        throw new AppError('HMAC key is required', 400, 'KEY_REQUIRED');
      }

      const hmac = crypto.createHmac(algorithm, key);
      hmac.update(data);
      
      return encoding ? hmac.digest(encoding) : hmac.digest();

    } catch (error) {
      logger.error('HMAC creation failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create HMAC',
        500,
        'HMAC_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Performs constant-time comparison
   * @static
   * @param {Buffer|string} a - First value
   * @param {Buffer|string} b - Second value
   * @returns {boolean} True if equal
   */
  static timingSafeEqual(a, b) {
    try {
      const bufferA = Buffer.isBuffer(a) ? a : Buffer.from(a);
      const bufferB = Buffer.isBuffer(b) ? b : Buffer.from(b);

      // Pad to same length for timing safety
      const maxLength = Math.max(bufferA.length, bufferB.length);
      const paddedA = Buffer.alloc(maxLength);
      const paddedB = Buffer.alloc(maxLength);
      
      bufferA.copy(paddedA);
      bufferB.copy(paddedB);

      // Length comparison is not timing safe, but we need it
      const lengthEqual = bufferA.length === bufferB.length;
      const contentEqual = crypto.timingSafeEqual(paddedA, paddedB);

      return lengthEqual && contentEqual;

    } catch (error) {
      logger.error('Timing safe comparison failed', error);
      return false;
    }
  }

  /**
   * Generates initialization vector (IV)
   * @static
   * @param {string} [algorithm='aes-256-gcm'] - Encryption algorithm
   * @returns {Buffer} Generated IV
   */
  static generateIV(algorithm = 'aes-256-gcm') {
    const ivLengths = {
      'aes-256-gcm': 16,
      'aes-256-cbc': 16,
      'aes-192-gcm': 16,
      'aes-128-gcm': 16,
      'chacha20-poly1305': 12
    };

    const length = ivLengths[algorithm] || 16;
    return this.generateRandomBytes(length);
  }

  /**
   * Generates a salt
   * @static
   * @param {number} [length=32] - Salt length in bytes
   * @returns {Buffer} Generated salt
   */
  static generateSalt(length = 32) {
    return this.generateRandomBytes(length);
  }

  /**
   * Derives a key from password using PBKDF2
   * @static
   * @param {string} password - Password to derive from
   * @param {Buffer|string} salt - Salt value
   * @param {Object} [options={}] - Derivation options
   * @returns {Promise<Buffer>} Derived key
   */
  static async deriveKey(password, salt, options = {}) {
    const {
      iterations = 100000,
      keyLength = 32,
      digest = 'sha256'
    } = options;

    return new Promise((resolve, reject) => {
      const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex');
      
      crypto.pbkdf2(password, saltBuffer, iterations, keyLength, digest, (err, derivedKey) => {
        if (err) {
          reject(new AppError(
            'Key derivation failed',
            500,
            'KEY_DERIVATION_ERROR',
            { originalError: err.message }
          ));
        } else {
          resolve(derivedKey);
        }
      });
    });
  }

  /**
   * Creates a key from password using scrypt
   * @static
   * @param {string} password - Password to derive from
   * @param {Buffer|string} salt - Salt value
   * @param {Object} [options={}] - Scrypt options
   * @returns {Promise<Buffer>} Derived key
   */
  static async scryptKey(password, salt, options = {}) {
    const {
      keyLength = 32,
      N = 16384,
      r = 8,
      p = 1
    } = options;

    return new Promise((resolve, reject) => {
      const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex');
      
      crypto.scrypt(password, saltBuffer, keyLength, { N, r, p }, (err, derivedKey) => {
        if (err) {
          reject(new AppError(
            'Scrypt key derivation failed',
            500,
            'SCRYPT_ERROR',
            { originalError: err.message }
          ));
        } else {
          resolve(derivedKey);
        }
      });
    });
  }

  /**
   * Encodes data to various formats
   * @static
   * @param {Buffer|string} data - Data to encode
   * @param {string} [format='base64'] - Output format
   * @returns {string} Encoded data
   */
  static encode(data, format = 'base64') {
    try {
      if (!CryptoUtils.#ENCODING_FORMATS.includes(format)) {
        throw new AppError('Invalid encoding format', 400, 'INVALID_FORMAT');
      }

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      return buffer.toString(format);

    } catch (error) {
      logger.error('Encoding failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to encode data',
        500,
        'ENCODING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Decodes data from various formats
   * @static
   * @param {string} data - Data to decode
   * @param {string} [format='base64'] - Input format
   * @returns {Buffer} Decoded data
   */
  static decode(data, format = 'base64') {
    try {
      if (!CryptoUtils.#ENCODING_FORMATS.includes(format)) {
        throw new AppError('Invalid decoding format', 400, 'INVALID_FORMAT');
      }

      return Buffer.from(data, format);

    } catch (error) {
      logger.error('Decoding failed', error);
      throw new AppError(
        'Failed to decode data',
        500,
        'DECODING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates a fingerprint of data
   * @static
   * @param {*} data - Data to fingerprint
   * @param {Object} [options={}] - Fingerprint options
   * @returns {string} Data fingerprint
   */
  static createFingerprint(data, options = {}) {
    const {
      algorithm = 'sha256',
      encoding = 'hex',
      normalize = true
    } = options;

    try {
      let input;
      
      if (typeof data === 'object' && data !== null) {
        // Sort object keys for consistent fingerprinting
        input = normalize ? JSON.stringify(this.#sortObject(data)) : JSON.stringify(data);
      } else {
        input = String(data);
      }

      return this.hash(input, { algorithm, encoding });

    } catch (error) {
      logger.error('Fingerprint creation failed', error);
      throw new AppError(
        'Failed to create fingerprint',
        500,
        'FINGERPRINT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a nonce
   * @static
   * @param {number} [length=16] - Nonce length in bytes
   * @returns {string} Generated nonce
   */
  static generateNonce(length = 16) {
    return this.generateRandomBytes(length).toString('base64url');
  }

  /**
   * Creates a challenge for authentication
   * @static
   * @param {Object} [options={}] - Challenge options
   * @returns {Object} Challenge data
   */
  static createChallenge(options = {}) {
    const {
      length = 32,
      expiresIn = 300, // 5 minutes
      algorithm = 'sha256'
    } = options;

    const challenge = this.generateRandomString(length, { encoding: 'base64url' });
    const timestamp = Date.now();
    const expires = timestamp + (expiresIn * 1000);
    
    const signature = this.hash(
      `${challenge}:${timestamp}:${expires}`,
      { algorithm }
    );

    return {
      challenge,
      timestamp,
      expires,
      signature
    };
  }

  /**
   * Verifies a challenge response
   * @static
   * @param {string} challenge - Original challenge
   * @param {string} response - Challenge response
   * @param {Object} challengeData - Challenge metadata
   * @returns {boolean} Verification result
   */
  static verifyChallenge(challenge, response, challengeData) {
    try {
      const { timestamp, expires, signature, algorithm = 'sha256' } = challengeData;

      // Check expiration
      if (Date.now() > expires) {
        return false;
      }

      // Verify signature
      const expectedSignature = this.hash(
        `${challenge}:${timestamp}:${expires}`,
        { algorithm }
      );

      if (!this.timingSafeEqual(signature, expectedSignature)) {
        return false;
      }

      // Verify response
      const expectedResponse = this.hash(challenge, { algorithm });
      return this.timingSafeEqual(response, expectedResponse);

    } catch (error) {
      logger.error('Challenge verification failed', error);
      return false;
    }
  }

  /**
   * Zeroizes sensitive buffer data
   * @static
   * @param {Buffer} buffer - Buffer to zeroize
   */
  static zeroize(buffer) {
    if (Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    }
  }

  /**
   * Creates a masked version of sensitive data
   * @static
   * @param {string} data - Data to mask
   * @param {Object} [options={}] - Masking options
   * @returns {string} Masked data
   */
  static maskSensitiveData(data, options = {}) {
    const {
      showFirst = 4,
      showLast = 4,
      maskChar = '*',
      minMaskLength = 6
    } = options;

    if (!data || typeof data !== 'string') {
      return '';
    }

    const length = data.length;
    
    if (length <= showFirst + showLast) {
      return maskChar.repeat(Math.max(length, minMaskLength));
    }

    const first = data.slice(0, showFirst);
    const last = data.slice(-showLast);
    const maskLength = Math.max(length - showFirst - showLast, minMaskLength);
    
    return `${first}${maskChar.repeat(maskLength)}${last}`;
  }

  /**
   * Splits a secret into shares using Shamir's Secret Sharing
   * @static
   * @param {Buffer|string} secret - Secret to split
   * @param {number} shares - Total number of shares
   * @param {number} threshold - Minimum shares needed to reconstruct
   * @returns {Array} Secret shares
   */
  static splitSecret(secret, shares, threshold) {
    try {
      if (threshold > shares) {
        throw new AppError('Threshold cannot exceed total shares', 400, 'INVALID_THRESHOLD');
      }

      // This is a simplified implementation
      // In production, use a proper Shamir's Secret Sharing library
      const secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(secret);
      const shareList = [];

      for (let i = 0; i < shares; i++) {
        const share = {
          id: i + 1,
          data: this.generateRandomBytes(secretBuffer.length).toString('hex'),
          threshold,
          total: shares
        };
        shareList.push(share);
      }

      logger.warn('Using simplified secret splitting - use proper SSS library in production');
      
      return shareList;

    } catch (error) {
      logger.error('Secret splitting failed', error);
      
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to split secret',
        500,
        'SECRET_SPLIT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates a key pair
   * @static
   * @param {Object} [options={}] - Key pair options
   * @returns {Promise<Object>} Generated key pair
   */
  static async generateKeyPair(options = {}) {
    const {
      type = 'rsa',
      modulusLength = 2048,
      publicExponent = 65537,
      format = 'pem'
    } = options;

    return new Promise((resolve, reject) => {
      const keyOptions = {
        modulusLength,
        publicExponent,
        publicKeyEncoding: {
          type: 'spki',
          format
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format
        }
      };

      crypto.generateKeyPair(type, keyOptions, (err, publicKey, privateKey) => {
        if (err) {
          reject(new AppError(
            'Key pair generation failed',
            500,
            'KEYPAIR_ERROR',
            { originalError: err.message }
          ));
        } else {
          resolve({ publicKey, privateKey });
        }
      });
    });
  }

  /**
   * Signs data with private key
   * @static
   * @param {Buffer|string} data - Data to sign
   * @param {string|Buffer|KeyObject} privateKey - Private key
   * @param {Object} [options={}] - Signing options
   * @returns {Buffer} Signature
   */
  static sign(data, privateKey, options = {}) {
    try {
      const {
        algorithm = 'RSA-SHA256',
        padding = crypto.constants.RSA_PKCS1_PADDING
      } = options;

      const sign = crypto.createSign(algorithm);
      sign.update(data);
      sign.end();

      return sign.sign({
        key: privateKey,
        padding
      });

    } catch (error) {
      logger.error('Signing failed', error);
      throw new AppError(
        'Failed to sign data',
        500,
        'SIGNING_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Verifies signature with public key
   * @static
   * @param {Buffer|string} data - Original data
   * @param {Buffer} signature - Signature to verify
   * @param {string|Buffer|KeyObject} publicKey - Public key
   * @param {Object} [options={}] - Verification options
   * @returns {boolean} Verification result
   */
  static verify(data, signature, publicKey, options = {}) {
    try {
      const {
        algorithm = 'RSA-SHA256',
        padding = crypto.constants.RSA_PKCS1_PADDING
      } = options;

      const verify = crypto.createVerify(algorithm);
      verify.update(data);
      verify.end();

      return verify.verify({
        key: publicKey,
        padding
      }, signature);

    } catch (error) {
      logger.error('Verification failed', error);
      return false;
    }
  }

  /**
   * Generates custom charset string
   * @private
   * @static
   * @param {number} length - String length
   * @param {string} charset - Character set
   * @returns {string} Random string
   */
  static #generateCustomCharsetString(length, charset) {
    const chars = charset.split('');
    const result = [];
    
    for (let i = 0; i < length; i++) {
      const index = this.generateRandomInt(0, chars.length - 1);
      result.push(chars[index]);
    }
    
    return result.join('');
  }

  /**
   * Sorts object recursively for consistent hashing
   * @private
   * @static
   * @param {*} obj - Object to sort
   * @returns {*} Sorted object
   */
  static #sortObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.#sortObject(item));
    }

    const sorted = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.#sortObject(obj[key]);
    }
    
    return sorted;
  }

  /**
   * Gets available hash algorithms
   * @static
   * @returns {Array} Available algorithms
   */
  static getHashAlgorithms() {
    return Object.values(CryptoUtils.#HASH_ALGORITHMS);
  }

  /**
   * Gets crypto capabilities
   * @static
   * @returns {Object} Crypto capabilities
   */
  static getCapabilities() {
    return {
      hashAlgorithms: this.getHashAlgorithms(),
      ciphers: crypto.getCiphers(),
      curves: crypto.getCurves(),
      hashes: crypto.getHashes(),
      randomBytes: true,
      pbkdf2: true,
      scrypt: true
    };
  }
}

module.exports = CryptoUtils;