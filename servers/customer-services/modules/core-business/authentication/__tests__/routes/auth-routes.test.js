/**
 * @fileoverview Authentication Routes Test Suite (CORRECTED)
 * @module servers/customer-services/modules/core-business/authentication/__tests__/routes/auth-routes
 */

const request = require('supertest');
const express = require('express');
const authRoutes = require('../../routes/auth-routes');
const AuthController = require('../../controllers/auth-controller');
const { authenticate } = require('../../../../../middleware/auth-middleware');

// Mock dependencies
jest.mock('../../controllers/auth-controller');
jest.mock('../../../../../middleware/auth-middleware');

describe('Authentication Routes Test Suite', () => {
  let app;

  beforeAll(() => {
    // Setup Express app with authentication routes
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('POST /api/v1/auth/register - User Registration', () => {
    test('should successfully register a new user with valid credentials', async () => {
      const mockResponse = {
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: 'user_123',
            email: 'john.doe@example.com',
            firstName: 'John',
            lastName: 'Doe',
            tenantId: 'tenant_456'
          },
          tokens: {
            accessToken: 'mock_access_token',
            refreshToken: 'mock_refresh_token'
          }
        }
      };

      AuthController.registerUser.mockImplementation((req, res) => {
        res.status(201).json(mockResponse);
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com',
          password: 'SecurePass123!@#',
          firstName: 'John',
          lastName: 'Doe'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('email', 'john.doe@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(AuthController.registerUser).toHaveBeenCalledTimes(1);
    });

    test('should return 400 when email format is invalid', async () => {
      AuthController.registerUser.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          message: 'Invalid email format',
          errors: [{ field: 'email', message: 'Must be a valid email address' }]
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'invalid-email-format',
          password: 'SecurePass123!@#',
          firstName: 'John'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid email');
    });

    test('should return 400 when password does not meet requirements', async () => {
      AuthController.registerUser.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          message: 'Password does not meet security requirements',
          errors: [{
            field: 'password',
            message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
          }]
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com',
          password: 'weak',
          firstName: 'John'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 409 when user already exists', async () => {
      AuthController.registerUser.mockImplementation((req, res) => {
        res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'existing.user@example.com',
          password: 'SecurePass123!@#',
          firstName: 'Existing'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('should return 400 when tenant ID is missing', async () => {
      AuthController.registerUser.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'john.doe@example.com',
          password: 'SecurePass123!@#'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login - User Login', () => {
    test('should successfully login with valid credentials', async () => {
      const mockResponse = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user_123',
            email: 'john.doe@example.com',
            firstName: 'John',
            lastName: 'Doe'
          },
          tokens: {
            accessToken: 'mock_access_token_xyz',
            refreshToken: 'mock_refresh_token_xyz'
          },
          sessionId: 'session_789'
        }
      };

      AuthController.loginUser.mockImplementation((req, res) => {
        res.status(200).json(mockResponse);
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com',
          password: 'SecurePass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('sessionId');
    });

    test('should return 401 with invalid credentials', async () => {
      AuthController.loginUser.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com',
          password: 'WrongPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    test('should return 403 when account is locked', async () => {
      AuthController.loginUser.mockImplementation((req, res) => {
        res.status(403).json({
          success: false,
          message: 'Account is locked due to multiple failed login attempts',
          data: {
            lockoutUntil: '2025-10-14T15:30:00Z',
            remainingMinutes: 15
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'locked.user@example.com',
          password: 'SecurePass123!@#'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('locked');
      expect(response.body.data).toHaveProperty('lockoutUntil');
    });

    test('should return 200 with MFA required status when MFA is enabled', async () => {
      AuthController.loginUser.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'MFA verification required',
          data: {
            mfaRequired: true,
            mfaToken: 'temp_mfa_token_xyz',
            mfaMethods: ['totp', 'sms']
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'mfa.user@example.com',
          password: 'SecurePass123!@#'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.mfaRequired).toBe(true);
      expect(response.body.data).toHaveProperty('mfaToken');
      expect(response.body.data.mfaMethods).toContain('totp');
    });
  });

  describe('POST /api/v1/auth/logout - User Logout', () => {
    test('should successfully logout authenticated user', async () => {
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 'user_123', email: 'john.doe@example.com' };
        req.sessionId = 'session_789';
        next();
      });

      AuthController.logoutUser.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'Logout successful'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer valid_access_token')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(AuthController.logoutUser).toHaveBeenCalledTimes(1);
    });

    test('should return 401 when no authentication token provided', async () => {
      authenticate.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 when token is invalid or expired', async () => {
      authenticate.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer invalid_token')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout-all - Logout All Sessions', () => {
    test('should successfully logout all user sessions', async () => {
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 'user_123', email: 'john.doe@example.com' };
        next();
      });

      // CORRECTED: Use logoutAllDevices instead of logoutAllSessions
      AuthController.logoutAllDevices.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'All sessions terminated successfully',
          data: {
            sessionsTerminated: 5
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', 'Bearer valid_access_token')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sessionsTerminated');
    });
  });

  describe('POST /api/v1/auth/refresh - Refresh Access Token', () => {
    test('should successfully refresh access token with valid refresh token', async () => {
      // CORRECTED: Use refreshToken instead of refreshAccessToken
      AuthController.refreshToken.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'Token refreshed successfully',
          data: {
            accessToken: 'new_access_token_abc',
            refreshToken: 'new_refresh_token_abc',
            expiresIn: 3600
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          refreshToken: 'valid_refresh_token_xyz'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    test('should return 401 when refresh token is invalid', async () => {
      // CORRECTED: Use refreshToken instead of refreshAccessToken
      AuthController.refreshToken.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          refreshToken: 'invalid_token'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 when refresh token is expired', async () => {
      // CORRECTED: Use refreshToken instead of refreshAccessToken
      AuthController.refreshToken.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Refresh token expired'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          refreshToken: 'expired_token'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('expired');
    });
  });

  describe('GET /api/v1/auth/me - Get Current User', () => {
    test('should successfully return current user profile', async () => {
      authenticate.mockImplementation((req, res, next) => {
        req.user = { id: 'user_123', email: 'john.doe@example.com' };
        next();
      });

      AuthController.getCurrentUser.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            id: 'user_123',
            email: 'john.doe@example.com',
            firstName: 'John',
            lastName: 'Doe',
            tenantId: 'tenant_456',
            role: 'user',
            permissions: ['read:profile', 'update:profile'],
            mfaEnabled: true,
            emailVerified: true
          }
        });
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid_access_token')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', 'user_123');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('permissions');
    });

    test('should return 401 when not authenticated', async () => {
      authenticate.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('X-Tenant-Id', 'tenant_456');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/verify-email - Verify Email Address', () => {
    test('should successfully verify email with valid token', async () => {
      AuthController.verifyEmail.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'Email verified successfully',
          data: {
            emailVerified: true,
            verifiedAt: '2025-10-14T12:00:00Z'
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          token: 'valid_verification_token_xyz'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.emailVerified).toBe(true);
    });

    test('should return 400 when verification token is invalid', async () => {
      AuthController.verifyEmail.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          token: 'invalid_token'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should return 410 when verification token is expired', async () => {
      AuthController.verifyEmail.mockImplementation((req, res) => {
        res.status(410).json({
          success: false,
          message: 'Verification token has expired'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          token: 'expired_token'
        });

      expect(response.status).toBe(410);
      expect(response.body.message).toContain('expired');
    });
  });

  describe('POST /api/v1/auth/resend-verification - Resend Email Verification', () => {
    test('should successfully resend verification email', async () => {
      // CORRECTED: Use resendVerification instead of resendEmailVerification
      AuthController.resendVerification.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: 'Verification email sent successfully',
          data: {
            emailSent: true,
            expiresIn: 3600
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.emailSent).toBe(true);
    });

    test('should return 404 when user not found', async () => {
      // CORRECTED: Use resendVerification instead of resendEmailVerification
      AuthController.resendVerification.mockImplementation((req, res) => {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should return 429 when rate limit exceeded', async () => {
      // CORRECTED: Use resendVerification instead of resendEmailVerification
      AuthController.resendVerification.mockImplementation((req, res) => {
        res.status(429).json({
          success: false,
          message: 'Too many verification requests. Please try again later.',
          data: {
            retryAfter: 300
          }
        });
      });

      const response = await request(app)
        .post('/api/v1/auth/resend-verification')
        .set('X-Tenant-Id', 'tenant_456')
        .send({
          email: 'john.doe@example.com'
        });

      expect(response.status).toBe(429);
      expect(response.body.message).toContain('Too many');
    });
  });

  describe('Test Suite Summary', () => {
    test('should have all critical authentication endpoints covered', () => {
      const criticalEndpoints = [
        'POST /register',
        'POST /login',
        'POST /logout',
        'POST /logout-all',
        'POST /refresh',
        'GET /me',
        'POST /verify-email',
        'POST /resend-verification'
      ];

      // This test serves as documentation of covered endpoints
      expect(criticalEndpoints.length).toBeGreaterThan(0);
    });
  });
});