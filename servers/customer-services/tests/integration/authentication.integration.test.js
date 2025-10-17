/**
 * @fileoverview Authentication Integration Tests
 * @module servers/customer-services/tests/integration/authentication.integration.test
 * @description End-to-end integration tests for complete authentication workflows
 */

const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const app = require('../../app'); // Your Express app

describe('Authentication Integration Tests', () => {
  let mongoServer;
  let testUser;
  let accessToken;
  let refreshToken;

  // Setup: Start in-memory MongoDB before all tests
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri);

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-key';
  }, 30000);

  // Cleanup: Close connections after all tests
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  }, 30000);

  // Clear database between test suites
  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('Complete User Registration Flow', () => {
    test('should complete full registration process with email verification', async () => {
      // Step 1: Register new user
      const registrationData = {
        email: 'integration.test@example.com',
        password: 'SecurePass123!@#',
        profile: {
          firstName: 'Integration',
          lastName: 'Test'
        },
        userType: 'client',
        companyName: 'Test Company'
      };

      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send(registrationData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.data).toHaveProperty('user');
      expect(registerResponse.body.data).toHaveProperty('tokens');
      expect(registerResponse.body.data.user.email).toBe(registrationData.email);
      expect(registerResponse.body.data.user.emailVerified).toBe(false);

      // Store tokens for subsequent tests
      const { user, tokens, verificationToken } = registerResponse.body.data;
      testUser = user;
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;

      // Step 2: Verify that user can access protected routes with token
      const profileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data.id).toBe(user.id);
      expect(profileResponse.body.data.emailVerified).toBe(false);

      // Step 3: Verify email with token
      if (verificationToken) {
        const verifyResponse = await request(app)
          .post('/api/v1/auth/verify-email')
          .set('X-Tenant-Id', 'test-tenant')
          .send({ token: verificationToken, email: registrationData.email })
          .expect(200);

        expect(verifyResponse.body.success).toBe(true);
        expect(verifyResponse.body.data.emailVerified).toBe(true);
      }

      // Step 4: Confirm email verification status
      const updatedProfileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(updatedProfileResponse.body.data.emailVerified).toBe(true);
    }, 15000);

    test('should prevent duplicate registration with same email', async () => {
      // Register first user
      const userData = {
        email: 'duplicate.test@example.com',
        password: 'SecurePass123!@#',
        userType: 'client'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send(userData)
        .expect(201);

      // Attempt to register with same email
      const duplicateResponse = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send(userData)
        .expect(409);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.message).toContain('already exists');
    });

    test('should validate registration data and return detailed errors', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'weak',
        userType: 'client'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });
  });

  describe('Complete Login and Session Management Flow', () => {
    beforeEach(async () => {
      // Create a test user before each login test
      const registrationData = {
        email: 'login.test@example.com',
        password: 'SecurePass123!@#',
        userType: 'client'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send(registrationData);

      testUser = response.body.data.user;
    });

    test('should complete full login process and create session', async () => {
      // Step 1: Login with valid credentials
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'login.test@example.com',
          password: 'SecurePass123!@#'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data).toHaveProperty('user');
      expect(loginResponse.body.data).toHaveProperty('tokens');
      expect(loginResponse.body.data).toHaveProperty('sessionId');

      const { tokens, sessionId } = loginResponse.body.data;
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;

      // Step 2: Verify access token works for protected routes
      const profileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data.id).toBe(testUser.id);

      // Step 3: Logout and invalidate tokens
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);

      // Step 4: Verify token is invalidated
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);
    }, 15000);

    test('should handle failed login attempts and account locking', async () => {
      const credentials = {
        email: 'login.test@example.com',
        password: 'WrongPassword123!@#'
      };

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .set('X-Tenant-Id', 'test-tenant')
          .send(credentials);

        if (i < 4) {
          expect(response.status).toBe(401);
          expect(response.body.message).toContain('Invalid');
        } else {
          // After 5 failed attempts, account should be locked
          expect(response.status).toBe(403);
          expect(response.body.message).toContain('locked');
        }
      }

      // Verify account remains locked even with correct password
      const lockedResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'login.test@example.com',
          password: 'SecurePass123!@#'
        })
        .expect(403);

      expect(lockedResponse.body.message).toContain('locked');
    }, 15000);

    test('should reject login without required credentials', async () => {
      // No email
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ password: 'SecurePass123!@#' })
        .expect(400);

      // No password
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ email: 'login.test@example.com' })
        .expect(400);

      // Empty credentials
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({})
        .expect(400);
    });
  });

  describe('Token Refresh and Rotation Flow', () => {
    beforeEach(async () => {
      // Create and login user to get tokens
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'refresh.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'refresh.test@example.com',
          password: 'SecurePass123!@#'
        });

      accessToken = loginResponse.body.data.tokens.accessToken;
      refreshToken = loginResponse.body.data.tokens.refreshToken;
    });

    test('should successfully refresh access token with valid refresh token', async () => {
      // Step 1: Refresh token
      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ refreshToken })
        .expect(200);

      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.data).toHaveProperty('accessToken');
      expect(refreshResponse.body.data).toHaveProperty('refreshToken');

      const newAccessToken = refreshResponse.body.data.accessToken;
      const newRefreshToken = refreshResponse.body.data.refreshToken;

      // Verify tokens are different (rotation)
      expect(newAccessToken).not.toBe(accessToken);
      expect(newRefreshToken).not.toBe(refreshToken);

      // Step 2: Verify new access token works
      const profileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(profileResponse.body.success).toBe(true);

      // Step 3: Verify old refresh token is invalidated
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ refreshToken })
        .expect(401);
    }, 15000);

    test('should reject refresh with invalid token', async () => {
      const invalidToken = 'invalid.refresh.token';

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ refreshToken: invalidToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    test('should reject refresh without token', async () => {
      await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'test-tenant')
        .send({})
        .expect(400);
    });
  });

  describe('Multi-Device Logout Flow', () => {
    let device1Token, device2Token, device3Token;

    beforeEach(async () => {
      // Create user
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'multidevice.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      // Login from three different devices
      const device1 = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .set('User-Agent', 'Mozilla/5.0 (Windows)')
        .send({
          email: 'multidevice.test@example.com',
          password: 'SecurePass123!@#'
        });

      const device2 = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .send({
          email: 'multidevice.test@example.com',
          password: 'SecurePass123!@#'
        });

      const device3 = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh)')
        .send({
          email: 'multidevice.test@example.com',
          password: 'SecurePass123!@#'
        });

      device1Token = device1.body.data.tokens.accessToken;
      device2Token = device2.body.data.tokens.accessToken;
      device3Token = device3.body.data.tokens.accessToken;
    });

    test('should logout from all devices simultaneously', async () => {
      // Verify all three devices can access protected route
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device1Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device2Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device3Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      // Logout from all devices using device1 token
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${device1Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.data).toHaveProperty('tokensInvalidated');
      expect(logoutResponse.body.data.tokensInvalidated).toBeGreaterThan(0);

      // Verify all devices are logged out
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device1Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device2Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device3Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);
    }, 20000);

    test('should only logout current device with standard logout', async () => {
      // Logout only device1
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${device1Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      // Verify device1 is logged out
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device1Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);

      // Verify device2 and device3 still work
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device2Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${device3Token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);
    }, 15000);
  });

  describe('Email Verification Flow', () => {
    test('should resend verification email when requested', async () => {
      // Register user
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'verify.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        })
        .expect(201);

      const userEmail = registerResponse.body.data.user.email;

      // Request resend verification
      const resendResponse = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('X-Tenant-Id', 'test-tenant')
        .send({ email: userEmail })
        .expect(200);

      expect(resendResponse.body.success).toBe(true);
      expect(resendResponse.body.data).toHaveProperty('emailSent', true);
    });

    test('should prevent too many verification email requests', async () => {
      // Register user
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'ratelimit.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      // Make multiple resend requests
      for (let i = 0; i < 6; i++) {
        const response = await request(app)
          .post('/api/v1/auth/resend-verification')
          .set('X-Tenant-Id', 'test-tenant')
          .send({ email: 'ratelimit.test@example.com' });

        if (i < 5) {
          expect(response.status).toBe(200);
        } else {
          // Should be rate limited after 5 requests
          expect(response.status).toBe(429);
          expect(response.body.message).toContain('Too many');
        }
      }
    }, 15000);
  });

  describe('Protected Routes Authorization', () => {
    test('should prevent access to protected routes without authentication', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);
    });

    test('should prevent access with expired or invalid tokens', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token';

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(401);
    });

    test('should allow access with valid authentication token', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'protected.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'protected.test@example.com',
          password: 'SecurePass123!@#'
        });

      const token = loginResponse.body.data.tokens.accessToken;

      // Access protected route
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-Id', 'test-tenant')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('email', 'protected.test@example.com');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database errors gracefully', async () => {
      // Temporarily disconnect from database to simulate error
      await mongoose.disconnect();

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .send({
          email: 'error.test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body.success).toBe(false);

      // Reconnect for other tests
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    });

    test('should handle malformed request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'test-tenant')
        .set('Content-Type', 'application/json')
        .send('{"invalid json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle missing tenant ID', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!@#',
          userType: 'client'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});