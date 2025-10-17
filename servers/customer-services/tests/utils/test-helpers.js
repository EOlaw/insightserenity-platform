/**
 * @fileoverview Test Helper Utilities
 * @module tests/utils/test-helpers
 * @description Common utility functions for testing authentication workflows
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { testUsers, generators } = require('../fixtures/test-fixtures');

/**
 * Authentication Test Helpers
 */
class AuthTestHelpers {
  /**
   * Generate a valid JWT token for testing
   * @param {Object} payload - Token payload
   * @param {string} type - Token type ('access' or 'refresh')
   * @param {Object} options - Additional options
   * @returns {string} JWT token
   */
  static generateToken(payload = {}, type = 'access', options = {}) {
    const secret = type === 'access' 
      ? process.env.JWT_SECRET || 'test-jwt-secret'
      : process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';

    const expiresIn = type === 'access' 
      ? options.expiresIn || '1h'
      : options.expiresIn || '7d';

    const defaultPayload = {
      userId: generators.generateUserId(),
      email: generators.generateEmail(),
      type
    };

    return jwt.sign(
      { ...defaultPayload, ...payload },
      secret,
      { expiresIn }
    );
  }

  /**
   * Generate an expired token for testing
   * @param {Object} payload - Token payload
   * @param {string} type - Token type
   * @returns {string} Expired JWT token
   */
  static generateExpiredToken(payload = {}, type = 'access') {
    const secret = type === 'access'
      ? process.env.JWT_SECRET || 'test-jwt-secret'
      : process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';

    const defaultPayload = {
      userId: generators.generateUserId(),
      email: generators.generateEmail(),
      type
    };

    return jwt.sign(
      { ...defaultPayload, ...payload },
      secret,
      { expiresIn: '-1h' } // Expired 1 hour ago
    );
  }

  /**
   * Hash a password for testing
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Match result
   */
  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Create a mock request object
   * @param {Object} options - Request options
   * @returns {Object} Mock request
   */
  static createMockRequest(options = {}) {
    return {
      body: options.body || {},
      query: options.query || {},
      params: options.params || {},
      headers: options.headers || {},
      cookies: options.cookies || {},
      user: options.user || null,
      ip: options.ip || '192.168.1.100',
      connection: {
        remoteAddress: options.ip || '192.168.1.100'
      },
      get: jest.fn((header) => options.headers?.[header.toLowerCase()]),
      ...options
    };
  }

  /**
   * Create a mock response object
   * @returns {Object} Mock response with spies
   */
  static createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };
    return res;
  }

  /**
   * Create a mock next function
   * @returns {Function} Mock next function
   */
  static createMockNext() {
    return jest.fn();
  }

  /**
   * Wait for a specified time (useful for testing timeouts)
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  static async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate mock user data for testing
   * @param {Object} overrides - Override default values
   * @returns {Object} Mock user data
   */
  static generateMockUser(overrides = {}) {
    return {
      _id: generators.generateUserId(),
      email: generators.generateEmail(),
      password: '$2b$10$hashedPasswordString',
      profile: {
        firstName: 'Test',
        lastName: 'User'
      },
      userType: 'client',
      emailVerified: false,
      phoneVerified: false,
      mfaEnabled: false,
      accountLocked: false,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      toObject: jest.fn(function() {
        const { _id, password, ...rest } = this;
        return { id: _id, ...rest };
      }),
      save: jest.fn().mockResolvedValue(true),
      ...overrides
    };
  }

  /**
   * Generate mock session data
   * @param {Object} overrides - Override default values
   * @returns {Object} Mock session data
   */
  static generateMockSession(overrides = {}) {
    return {
      _id: generators.generateSessionId(),
      userId: generators.generateUserId(),
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      deviceInfo: {
        type: 'desktop',
        name: 'Chrome',
        os: 'Windows 10'
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...overrides
    };
  }

  /**
   * Assert that response has authentication tokens
   * @param {Object} response - Response object
   */
  static assertHasTokens(response) {
    expect(response.body.data).toHaveProperty('tokens');
    expect(response.body.data.tokens).toHaveProperty('accessToken');
    expect(response.body.data.tokens).toHaveProperty('refreshToken');
    expect(typeof response.body.data.tokens.accessToken).toBe('string');
    expect(typeof response.body.data.tokens.refreshToken).toBe('string');
    expect(response.body.data.tokens.accessToken.length).toBeGreaterThan(0);
    expect(response.body.data.tokens.refreshToken.length).toBeGreaterThan(0);
  }

  /**
   * Assert that response has user data
   * @param {Object} response - Response object
   * @param {Object} expectedFields - Expected user fields
   */
  static assertHasUser(response, expectedFields = {}) {
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user).toHaveProperty('id');
    expect(response.body.data.user).toHaveProperty('email');
    
    // Check for expected fields
    Object.entries(expectedFields).forEach(([key, value]) => {
      expect(response.body.data.user[key]).toBe(value);
    });
  }

  /**
   * Assert that response is a success
   * @param {Object} response - Response object
   * @param {number} statusCode - Expected status code
   */
  static assertSuccess(response, statusCode = 200) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('success', true);
  }

  /**
   * Assert that response is an error
   * @param {Object} response - Response object
   * @param {number} statusCode - Expected status code
   * @param {string} messageContains - Expected message content
   */
  static assertError(response, statusCode, messageContains = null) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
    
    if (messageContains) {
      expect(response.body.message.toLowerCase()).toContain(messageContains.toLowerCase());
    }
  }

  /**
   * Assert validation errors
   * @param {Object} response - Response object
   * @param {Array<string>} fields - Expected error fields
   */
  static assertValidationErrors(response, fields = []) {
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('errors');
    expect(Array.isArray(response.body.errors)).toBe(true);
    
    if (fields.length > 0) {
      const errorFields = response.body.errors.map(err => err.field || err.param);
      fields.forEach(field => {
        expect(errorFields).toContain(field);
      });
    }
  }

  /**
   * Extract token from response
   * @param {Object} response - Response object
   * @param {string} type - Token type ('access' or 'refresh')
   * @returns {string} Token
   */
  static extractToken(response, type = 'access') {
    const tokenKey = type === 'access' ? 'accessToken' : 'refreshToken';
    return response.body.data?.tokens?.[tokenKey];
  }

  /**
   * Create authorization header
   * @param {string} token - JWT token
   * @returns {Object} Authorization header
   */
  static createAuthHeader(token) {
    return {
      Authorization: `Bearer ${token}`
    };
  }

  /**
   * Create tenant header
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Tenant header
   */
  static createTenantHeader(tenantId = 'test-tenant') {
    return {
      'X-Tenant-Id': tenantId
    };
  }

  /**
   * Create common headers for requests
   * @param {string} token - Optional JWT token
   * @param {string} tenantId - Optional tenant ID
   * @returns {Object} Headers object
   */
  static createHeaders(token = null, tenantId = 'test-tenant') {
    const headers = {
      ...this.createTenantHeader(tenantId),
      'Content-Type': 'application/json'
    };

    if (token) {
      Object.assign(headers, this.createAuthHeader(token));
    }

    return headers;
  }
}

/**
 * Database Test Helpers
 */
class DatabaseTestHelpers {
  /**
   * Clear all collections in the database
   * @param {Object} mongoose - Mongoose instance
   */
  static async clearDatabase(mongoose) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }

  /**
   * Drop database
   * @param {Object} mongoose - Mongoose instance
   */
  static async dropDatabase(mongoose) {
    await mongoose.connection.dropDatabase();
  }

  /**
   * Create test database connection
   * @param {string} uri - MongoDB URI
   * @param {Object} options - Connection options
   * @returns {Promise<Object>} Mongoose connection
   */
  static async createTestConnection(uri, options = {}) {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ...options
    });
    return mongoose;
  }

  /**
   * Seed test users
   * @param {Object} UserModel - User model
   * @param {number} count - Number of users to create
   * @returns {Promise<Array>} Created users
   */
  static async seedUsers(UserModel, count = 5) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const userData = generators.generateTestUser({
        email: generators.generateEmail(`user${i}`),
        profile: {
          firstName: `User${i}`,
          lastName: 'Test'
        }
      });
      
      const user = await UserModel.create(userData);
      users.push(user);
    }
    
    return users;
  }
}

/**
 * Time Test Helpers
 */
class TimeTestHelpers {
  /**
   * Mock Date.now() to return a specific timestamp
   * @param {number} timestamp - Timestamp to return
   */
  static mockDateNow(timestamp) {
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => timestamp);
    return () => {
      Date.now = originalDateNow;
    };
  }

  /**
   * Advance time by specified milliseconds
   * @param {number} ms - Milliseconds to advance
   */
  static advanceTime(ms) {
    jest.advanceTimersByTime(ms);
  }

  /**
   * Get timestamp for future date
   * @param {number} days - Days in the future
   * @returns {number} Timestamp
   */
  static getFutureTimestamp(days) {
    return Date.now() + (days * 24 * 60 * 60 * 1000);
  }

  /**
   * Get timestamp for past date
   * @param {number} days - Days in the past
   * @returns {number} Timestamp
   */
  static getPastTimestamp(days) {
    return Date.now() - (days * 24 * 60 * 60 * 1000);
  }
}

/**
 * Assertion Helpers
 */
class AssertionHelpers {
  /**
   * Assert that function throws specific error
   * @param {Function} fn - Function to test
   * @param {string} errorMessage - Expected error message
   */
  static async assertThrowsError(fn, errorMessage) {
    await expect(fn()).rejects.toThrow(errorMessage);
  }

  /**
   * Assert that object has specific properties
   * @param {Object} obj - Object to test
   * @param {Array<string>} properties - Expected properties
   */
  static assertHasProperties(obj, properties) {
    properties.forEach(prop => {
      expect(obj).toHaveProperty(prop);
    });
  }

  /**
   * Assert that value is within range
   * @param {number} value - Value to test
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   */
  static assertInRange(value, min, max) {
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
  }
}

module.exports = {
  AuthTestHelpers,
  DatabaseTestHelpers,
  TimeTestHelpers,
  AssertionHelpers
};