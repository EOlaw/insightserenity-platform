'use strict';

/**
 * @fileoverview Cryptographic utilities for hashing, encryption, and security
 * @module shared/lib/utils/helpers/crypto-helper
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * @class CryptoHelper
 * @description Comprehensive cryptographic utilities for the platform
 */
class CryptoHelper {
  /**
   * Generate random bytes
   * @static
   * @param {number} [length=32] - Number of bytes
   * @returns {Buffer} Random bytes
   */
  static randomBytes(length = 32) {
    return crypto.randomBytes(length);
  }

  /**
   * Generate random hex string
   * @static
   * @param {number} [length=32] - Number of bytes (hex string will be 2x length)
   * @returns {string} Random hex string
   */
  static randomHex(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate random base64 string
   * @static
   * @param {number} [length=32] - Number of bytes
   * @returns {string} Random base64 string
   */
  static randomBase64(length = 32) {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Generate random URL-safe base64 string
   * @static
   * @param {number} [length=32] - Number of bytes
   * @returns {string} Random URL-safe base64 string
   */
  static randomBase64Url(length = 32) {
    return crypto.randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate UUID v4
   * @static
   * @returns {string} UUID v4
   */
  static generateUUID() {
    return crypto.randomUUID();
  }

  /**
   * Generate secure random token
   * @static
   * @param {number} [length=32] - Token length
   * @returns {string} Secure token
   */
  static generateToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let token = '';
    
    for (let i = 0; i < length; i++) {
      token += chars[bytes[i] % chars.length];
    }
    
    return token;
  }

  /**
   * Hash data using SHA256
   * @static
   * @param {string|Buffer} data - Data to hash
   * @param {string} [encoding='hex'] - Output encoding
   * @returns {string} Hash value
   */
  static sha256(data, encoding = 'hex') {
    return crypto.createHash('sha256').update(data).digest(encoding);
  }

  /**
   * Hash data using SHA512
   * @static
   * @param {string|Buffer} data - Data to hash
   * @param {string} [encoding='hex'] - Output encoding
   * @returns {string} Hash value
   */
  static sha512(data, encoding = 'hex') {
    return crypto.createHash('sha512').update(data).digest(encoding);
  }

  /**
   * Create HMAC
   * @static
   * @param {string|Buffer} data - Data to hash
   * @param {string} secret - Secret key
   * @param {string} [algorithm='sha256'] - Hash algorithm
   * @param {string} [encoding='hex'] - Output encoding
   * @returns {string} HMAC value
   */
  static hmac(data, secret, algorithm = 'sha256', encoding = 'hex') {
    return crypto.createHmac(algorithm, secret).update(data).digest(encoding);
  }

  /**
   * Hash password using bcrypt
   * @static
   * @async
   * @param {string} password - Password to hash
   * @param {number} [rounds=10] - Salt rounds
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password, rounds = 10) {
    return bcrypt.hash(password, rounds);
  }

  /**
   * Compare password with hash
   * @static
   * @async
   * @param {string} password - Plain password
   * @param {string} hash - Password hash
   * @returns {Promise<boolean>} True if password matches
   */
  static async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Encrypt data using AES-256-GCM
   * @static
   * @param {string|Buffer} data - Data to encrypt
   * @param {string} key - Encryption key (32 bytes)
   * @returns {Object} Encrypted data with iv, tag, and data
   */
  static encrypt(data, key) {
    // Ensure key is 32 bytes
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
    if (keyBuffer.length !== 32) {
      throw new Error('Encryption key must be 32 bytes');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   * @static
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} encryptedData.iv - Initialization vector
   * @param {string} encryptedData.tag - Authentication tag
   * @param {string} encryptedData.data - Encrypted data
   * @param {string} key - Decryption key (32 bytes)
   * @returns {Buffer} Decrypted data
   */
  static decrypt(encryptedData, key) {
    // Ensure key is 32 bytes
    const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
    if (keyBuffer.length !== 32) {
      throw new Error('Decryption key must be 32 bytes');
    }

    const iv = Buffer.from(encryptedData.iv, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    const encrypted = Buffer.from(encryptedData.data, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted;
  }

  /**
   * Encrypt string
   * @static
   * @param {string} text - Text to encrypt
   * @param {string} key - Encryption key
   * @returns {string} Encrypted string (base64)
   */
  static encryptString(text, key) {
    const encrypted = this.encrypt(text, key);
    return `${encrypted.iv}:${encrypted.tag}:${encrypted.data}`;
  }

  /**
   * Decrypt string
   * @static
   * @param {string} encryptedText - Encrypted string
   * @param {string} key - Decryption key
   * @returns {string} Decrypted string
   */
  static decryptString(encryptedText, key) {
    const [iv, tag, data] = encryptedText.split(':');
    const decrypted = this.decrypt({ iv, tag, data }, key);
    return decrypted.toString('utf8');
  }

  /**
   * Generate RSA key pair
   * @static
   * @param {number} [modulusLength=2048] - Key size in bits
   * @returns {Object} Public and private keys
   */
  static generateKeyPair(modulusLength = 2048) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    return { publicKey, privateKey };
  }

  /**
   * Sign data with private key
   * @static
   * @param {string|Buffer} data - Data to sign
   * @param {string} privateKey - Private key (PEM format)
   * @param {string} [algorithm='RSA-SHA256'] - Signing algorithm
   * @returns {string} Signature (base64)
   */
  static sign(data, privateKey, algorithm = 'RSA-SHA256') {
    const sign = crypto.createSign(algorithm);
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  }

  /**
   * Verify signature with public key
   * @static
   * @param {string|Buffer} data - Original data
   * @param {string} signature - Signature to verify (base64)
   * @param {string} publicKey - Public key (PEM format)
   * @param {string} [algorithm='RSA-SHA256'] - Signing algorithm
   * @returns {boolean} True if signature is valid
   */
  static verify(data, signature, publicKey, algorithm = 'RSA-SHA256') {
    const verify = crypto.createVerify(algorithm);
    verify.update(data);
    return verify.verify(publicKey, signature, 'base64');
  }

  /**
   * Create secure hash for tokens
   * @static
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   */
  static hashToken(token) {
    return this.sha256(token + process.env.TOKEN_SALT || 'default-salt');
  }

  /**
   * Generate OTP (One-Time Password)
   * @static
   * @param {number} [length=6] - OTP length
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.numeric=true] - Use only numbers
   * @param {number} [options.expiresIn=300000] - Expiry time in ms (5 minutes)
   * @returns {Object} OTP and expiry time
   */
  static generateOTP(length = 6, options = {}) {
    const { numeric = true, expiresIn = 300000 } = options;
    
    let otp = '';
    const chars = numeric ? '0123456789' : '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    for (let i = 0; i < length; i++) {
      otp += chars[Math.floor(Math.random() * chars.length)];
    }
    
    return {
      otp,
      expiresAt: new Date(Date.now() + expiresIn)
    };
  }

  /**
   * Generate API key
   * @static
   * @param {string} [prefix=''] - Key prefix
   * @returns {Object} API key and hashed key
   */
  static generateApiKey(prefix = '') {
    const key = prefix + this.randomBase64Url(32);
    const hashedKey = this.hashToken(key);
    
    return {
      key,
      hashedKey
    };
  }

  /**
   * Constant-time string comparison
   * @static
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if strings are equal
   */
  static timingSafeEqual(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  /**
   * Derive key from password using PBKDF2
   * @static
   * @param {string} password - Password
   * @param {string|Buffer} salt - Salt
   * @param {number} [iterations=100000] - Number of iterations
   * @param {number} [keyLength=32] - Key length in bytes
   * @param {string} [digest='sha256'] - Hash algorithm
   * @returns {Buffer} Derived key
   */
  static deriveKey(password, salt, iterations = 100000, keyLength = 32, digest = 'sha256') {
    const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt);
    return crypto.pbkdf2Sync(password, saltBuffer, iterations, keyLength, digest);
  }

  /**
   * Generate password salt
   * @static
   * @param {number} [length=16] - Salt length in bytes
   * @returns {string} Salt (hex)
   */
  static generateSalt(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Create fingerprint from data
   * @static
   * @param {Object} data - Data to fingerprint
   * @returns {string} Fingerprint hash
   */
  static createFingerprint(data) {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return this.sha256(normalized);
  }
}

module.exports = CryptoHelper;