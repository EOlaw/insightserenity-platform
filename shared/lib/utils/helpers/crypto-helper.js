'use strict';

/**
 * @fileoverview Enterprise-grade cryptographic utility for secure operations
 * @version 1.0.0
 * @author Enterprise Development Team
 * @since 2024-01-01
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const AppError = require('../app-error');
const Logger = require('../logger');

/**
 * Enterprise cryptographic utility class
 * Provides secure encryption, hashing, and key generation functionality
 */
class CryptoHelper {
    static #ALGORITHM = 'aes-256-gcm';
    static #KEY_LENGTH = 32;
    static #IV_LENGTH = 16;
    static #TAG_LENGTH = 16;
    static #SALT_ROUNDS = 12;

    /**
     * Generates a cryptographically secure random string
     * @param {number} length - Length of the string to generate
     * @param {string} charset - Character set to use (default: alphanumeric)
     * @returns {string} Random string
     */
    static generateRandomString(length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
        try {
            if (length <= 0) {
                throw new AppError('Length must be positive', 400, 'INVALID_LENGTH');
            }

            const randomBytes = crypto.randomBytes(length);
            let result = '';

            for (let i = 0; i < length; i++) {
                result += charset[randomBytes[i] % charset.length];
            }

            return result;
        } catch (error) {
            Logger.error('Failed to generate random string', { error: error.message, length });
            throw new AppError('Random string generation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Generates a secure random token
     * @param {number} bytes - Number of bytes for the token (default: 32)
     * @returns {string} Hex-encoded random token
     */
    static generateToken(bytes = 32) {
        try {
            return crypto.randomBytes(bytes).toString('hex');
        } catch (error) {
            Logger.error('Failed to generate token', { error: error.message, bytes });
            throw new AppError('Token generation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Generates a UUID v4
     * @returns {string} UUID v4 string
     */
    static generateUUID() {
        try {
            return crypto.randomUUID();
        } catch (error) {
            Logger.error('Failed to generate UUID', { error: error.message });
            throw new AppError('UUID generation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Creates a cryptographic hash using SHA-256
     * @param {string} data - Data to hash
     * @param {string} salt - Optional salt value
     * @returns {string} Hex-encoded hash
     */
    static hash(data, salt = '') {
        try {
            if (typeof data !== 'string') {
                throw new AppError('Data must be a string', 400, 'INVALID_INPUT');
            }

            const hash = crypto.createHash('sha256');
            hash.update(data + salt);
            return hash.digest('hex');
        } catch (error) {
            Logger.error('Failed to create hash', { error: error.message });
            throw new AppError('Hashing failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Creates a HMAC signature
     * @param {string} data - Data to sign
     * @param {string} secret - Secret key for HMAC
     * @param {string} algorithm - HMAC algorithm (default: sha256)
     * @returns {string} Hex-encoded HMAC signature
     */
    static hmac(data, secret, algorithm = 'sha256') {
        try {
            if (typeof data !== 'string' || typeof secret !== 'string') {
                throw new AppError('Data and secret must be strings', 400, 'INVALID_INPUT');
            }

            const hmac = crypto.createHmac(algorithm, secret);
            hmac.update(data);
            return hmac.digest('hex');
        } catch (error) {
            Logger.error('Failed to create HMAC', { error: error.message, algorithm });
            throw new AppError('HMAC creation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Hashes a password using bcrypt
     * @param {string} password - Plain text password
     * @param {number} saltRounds - Number of salt rounds (default: 12)
     * @returns {Promise<string>} Hashed password
     */
    static async hashPassword(password, saltRounds = this.#SALT_ROUNDS) {
        try {
            if (typeof password !== 'string') {
                throw new AppError('Password must be a string', 400, 'INVALID_INPUT');
            }

            if (password.length < 8) {
                throw new AppError('Password must be at least 8 characters', 400, 'WEAK_PASSWORD');
            }

            return await bcrypt.hash(password, saltRounds);
        } catch (error) {
            Logger.error('Failed to hash password', { error: error.message });
            if (error instanceof AppError) throw error;
            throw new AppError('Password hashing failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Verifies a password against a hash
     * @param {string} password - Plain text password
     * @param {string} hash - Hashed password
     * @returns {Promise<boolean>} True if password matches
     */
    static async verifyPassword(password, hash) {
        try {
            if (typeof password !== 'string' || typeof hash !== 'string') {
                throw new AppError('Password and hash must be strings', 400, 'INVALID_INPUT');
            }

            return await bcrypt.compare(password, hash);
        } catch (error) {
            Logger.error('Failed to verify password', { error: error.message });
            if (error instanceof AppError) throw error;
            throw new AppError('Password verification failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Encrypts data using AES-256-GCM
     * @param {string} plaintext - Data to encrypt
     * @param {string} key - Encryption key (32 bytes)
     * @returns {Object} Encrypted data with IV and auth tag
     */
    static encrypt(plaintext, key) {
        try {
            if (typeof plaintext !== 'string' || typeof key !== 'string') {
                throw new AppError('Plaintext and key must be strings', 400, 'INVALID_INPUT');
            }

            if (Buffer.from(key, 'hex').length !== this.#KEY_LENGTH) {
                throw new AppError(`Key must be ${this.#KEY_LENGTH} bytes`, 400, 'INVALID_KEY_LENGTH');
            }

            const iv = crypto.randomBytes(this.#IV_LENGTH);
            const cipher = crypto.createCipher(this.#ALGORITHM, Buffer.from(key, 'hex'));
            cipher.setAutoPadding(true);

            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const authTag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            Logger.error('Failed to encrypt data', { error: error.message });
            throw new AppError('Encryption failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Decrypts data using AES-256-GCM
     * @param {Object} encryptedData - Encrypted data object
     * @param {string} key - Decryption key (32 bytes)
     * @returns {string} Decrypted plaintext
     */
    static decrypt(encryptedData, key) {
        try {
            const { encrypted, iv, authTag } = encryptedData;

            if (!encrypted || !iv || !authTag) {
                throw new AppError('Missing encryption components', 400, 'INVALID_ENCRYPTED_DATA');
            }

            if (Buffer.from(key, 'hex').length !== this.#KEY_LENGTH) {
                throw new AppError(`Key must be ${this.#KEY_LENGTH} bytes`, 400, 'INVALID_KEY_LENGTH');
            }

            const decipher = crypto.createDecipher(this.#ALGORITHM, Buffer.from(key, 'hex'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            Logger.error('Failed to decrypt data', { error: error.message });
            throw new AppError('Decryption failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Generates a cryptographic key
     * @param {number} length - Key length in bytes (default: 32)
     * @returns {string} Hex-encoded key
     */
    static generateKey(length = this.#KEY_LENGTH) {
        try {
            return crypto.randomBytes(length).toString('hex');
        } catch (error) {
            Logger.error('Failed to generate key', { error: error.message, length });
            throw new AppError('Key generation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Derives a key from a password using PBKDF2
     * @param {string} password - Password to derive from
     * @param {string} salt - Salt value
     * @param {number} iterations - Number of iterations (default: 100000)
     * @param {number} keyLength - Key length in bytes (default: 32)
     * @returns {Promise<string>} Hex-encoded derived key
     */
    static async deriveKey(password, salt, iterations = 100000, keyLength = this.#KEY_LENGTH) {
        try {
            if (typeof password !== 'string' || typeof salt !== 'string') {
                throw new AppError('Password and salt must be strings', 400, 'INVALID_INPUT');
            }

            return new Promise((resolve, reject) => {
                crypto.pbkdf2(password, salt, iterations, keyLength, 'sha256', (err, derivedKey) => {
                    if (err) {
                        Logger.error('Failed to derive key', { error: err.message });
                        reject(new AppError('Key derivation failed', 500, 'CRYPTO_ERROR'));
                    } else {
                        resolve(derivedKey.toString('hex'));
                    }
                });
            });
        } catch (error) {
            Logger.error('Failed to derive key', { error: error.message });
            throw new AppError('Key derivation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Generates a secure salt
     * @param {number} length - Salt length in bytes (default: 16)
     * @returns {string} Hex-encoded salt
     */
    static generateSalt(length = 16) {
        try {
            return crypto.randomBytes(length).toString('hex');
        } catch (error) {
            Logger.error('Failed to generate salt', { error: error.message, length });
            throw new AppError('Salt generation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Creates a digital signature using RSA
     * @param {string} data - Data to sign
     * @param {string} privateKey - RSA private key in PEM format
     * @param {string} algorithm - Signature algorithm (default: RSA-SHA256)
     * @returns {string} Base64-encoded signature
     */
    static sign(data, privateKey, algorithm = 'RSA-SHA256') {
        try {
            if (typeof data !== 'string' || typeof privateKey !== 'string') {
                throw new AppError('Data and private key must be strings', 400, 'INVALID_INPUT');
            }

            const sign = crypto.createSign(algorithm);
            sign.update(data);
            sign.end();

            return sign.sign(privateKey, 'base64');
        } catch (error) {
            Logger.error('Failed to create signature', { error: error.message, algorithm });
            throw new AppError('Signature creation failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Verifies a digital signature using RSA
     * @param {string} data - Original data
     * @param {string} signature - Base64-encoded signature
     * @param {string} publicKey - RSA public key in PEM format
     * @param {string} algorithm - Signature algorithm (default: RSA-SHA256)
     * @returns {boolean} True if signature is valid
     */
    static verify(data, signature, publicKey, algorithm = 'RSA-SHA256') {
        try {
            if (typeof data !== 'string' || typeof signature !== 'string' || typeof publicKey !== 'string') {
                throw new AppError('Data, signature, and public key must be strings', 400, 'INVALID_INPUT');
            }

            const verify = crypto.createVerify(algorithm);
            verify.update(data);
            verify.end();

            return verify.verify(publicKey, signature, 'base64');
        } catch (error) {
            Logger.error('Failed to verify signature', { error: error.message, algorithm });
            throw new AppError('Signature verification failed', 500, 'CRYPTO_ERROR');
        }
    }

    /**
     * Securely compares two strings to prevent timing attacks
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {boolean} True if strings are equal
     */
    static secureCompare(a, b) {
        try {
            if (typeof a !== 'string' || typeof b !== 'string') {
                return false;
            }

            if (a.length !== b.length) {
                return false;
            }

            return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
        } catch (error) {
            Logger.error('Failed to perform secure comparison', { error: error.message });
            return false;
        }
    }
}

module.exports = CryptoHelper;
