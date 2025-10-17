/**
 * @fileoverview Authentication Controller Unit Tests
 * @module servers/customer-services/modules/core-business/authentication/__tests__/controllers/auth-controller
 * @description Comprehensive unit tests for AuthController business logic
 */

const authController = require('../../controllers/auth-controller');
const directAuthService = require('../../services/direct-auth-service');
const { validationResult } = require('express-validator');

// Mock dependencies
jest.mock('../../services/direct-auth-service');
jest.mock('express-validator');

// Create a mock AppError class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }

  static validation(message, errors) {
    const error = new AppError(message, 400);
    error.errors = errors;
    return error;
  }
}

describe('AuthController Unit Tests', () => {
  let mockRequest;
  let mockResponse;
  let mockNext;

  beforeEach(() => {
    // Setup mock request object
    mockRequest = {
      body: {},
      headers: {},
      cookies: {},
      ip: '192.168.1.100',
      connection: { remoteAddress: '192.168.1.100' },
      user: null
    };

    // Setup mock response object with chainable methods
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };

    // Setup mock next function for error handling
    mockNext = jest.fn();

    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock process.env for secure cookie settings
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('registerUser', () => {
    test('should successfully register a new user with complete profile data', async () => {
      // Arrange
      const registrationData = {
        email: 'john.doe@example.com',
        password: 'SecurePass123!@#',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890'
        },
        userType: 'client',
        companyName: 'Acme Corporation'
      };

      const mockRegistrationResult = {
        user: {
          id: 'user_123',
          email: 'john.doe@example.com',
          userType: 'client',
          emailVerified: false
        },
        tokens: {
          accessToken: 'mock_access_token',
          refreshToken: 'mock_refresh_token'
        },
        verificationToken: 'verification_token_123'
      };

      mockRequest.body = registrationData;
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      directAuthService.registerDirectUser.mockResolvedValue(mockRegistrationResult);

      // Act
      await authController.registerUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(validationResult).toHaveBeenCalledWith(mockRequest);
      expect(directAuthService.registerDirectUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registrationData.email,
          password: registrationData.password,
          profile: registrationData.profile
        }),
        'client',
        expect.objectContaining({
          ip: mockRequest.ip,
          userAgent: mockRequest.headers['user-agent']
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: mockRegistrationResult
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return validation errors when registration data is invalid', async () => {
      // Arrange
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password must be at least 8 characters' }
      ];

      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors
      });

      // Act
      await authController.registerUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: validationErrors
        })
      );
      expect(directAuthService.registerDirectUser).not.toHaveBeenCalled();
    });

    test('should handle service errors during registration', async () => {
      // Arrange
      const serviceError = new Error('Database connection failed');
      
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#',
        userType: 'client'
      };

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      directAuthService.registerDirectUser.mockRejectedValue(serviceError);

      // Act
      await authController.registerUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(serviceError);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should include optional marketing data when provided', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#',
        userType: 'client',
        referralCode: 'REF123',
        utmParams: { source: 'google', campaign: 'spring2025' },
        marketingSource: 'paid-search'
      };

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      directAuthService.registerDirectUser.mockResolvedValue({
        user: { id: 'user_123' },
        tokens: {}
      });

      // Act
      await authController.registerUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.registerDirectUser).toHaveBeenCalledWith(
        expect.any(Object),
        'client',
        expect.objectContaining({
          referralCode: 'REF123',
          utmParams: { source: 'google', campaign: 'spring2025' },
          marketingSource: 'paid-search'
        })
      );
    });
  });

  describe('loginUser', () => {
    test('should successfully authenticate user with valid credentials', async () => {
      // Arrange
      mockRequest.body = {
        email: 'john.doe@example.com',
        password: 'SecurePass123!@#'
      };
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      const mockLoginResult = {
        user: {
          id: 'user_123',
          email: 'john.doe@example.com',
          emailVerified: true
        },
        tokens: {
          accessToken: 'access_token_xyz',
          refreshToken: 'refresh_token_xyz'
        },
        sessionId: 'session_789'
      };

      directAuthService.loginDirectUser.mockResolvedValue(mockLoginResult);

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.loginDirectUser).toHaveBeenCalledWith(
        {
          email: 'john.doe@example.com',
          password: 'SecurePass123!@#'
        },
        expect.objectContaining({
          ip: mockRequest.ip,
          userAgent: mockRequest.headers['user-agent']
        })
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh_token_xyz',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: mockLoginResult
      });
    });

    test('should return MFA challenge when MFA is required', async () => {
      // Arrange
      mockRequest.body = {
        email: 'mfa.user@example.com',
        password: 'SecurePass123!@#'
      };

      const mockMFAResult = {
        requiresMFA: true,
        tempToken: 'temp_mfa_token_abc',
        mfaMethods: ['totp', 'sms'],
        challengeId: 'challenge_xyz'
      };

      directAuthService.loginDirectUser.mockResolvedValue(mockMFAResult);

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        requiresMFA: true,
        data: {
          tempToken: 'temp_mfa_token_abc',
          mfaMethods: ['totp', 'sms'],
          challengeId: 'challenge_xyz'
        }
      });
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    test('should return error when credentials are missing', async () => {
      // Arrange
      mockRequest.body = { email: 'test@example.com' };

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Email/username and password are required'
        })
      );
      expect(directAuthService.loginDirectUser).not.toHaveBeenCalled();
    });

    test('should accept username instead of email for login', async () => {
      // Arrange
      mockRequest.body = {
        username: 'johndoe',
        password: 'SecurePass123!@#'
      };

      directAuthService.loginDirectUser.mockResolvedValue({
        user: { id: 'user_123' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      });

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.loginDirectUser).toHaveBeenCalledWith(
        {
          email: 'johndoe',
          password: 'SecurePass123!@#'
        },
        expect.any(Object)
      );
    });

    test('should include device and location information when provided', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#',
        device: {
          type: 'mobile',
          name: 'iPhone 14',
          os: 'iOS 17'
        },
        location: {
          city: 'San Francisco',
          country: 'USA'
        }
      };

      directAuthService.loginDirectUser.mockResolvedValue({
        user: { id: 'user_123' },
        tokens: { accessToken: 'token', refreshToken: 'refresh' }
      });

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.loginDirectUser).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          device: mockRequest.body.device,
          location: mockRequest.body.location
        })
      );
    });
  });

  describe('logoutUser', () => {
    test('should successfully logout user and invalidate tokens', async () => {
      // Arrange
      mockRequest.user = { id: 'user_123', email: 'test@example.com' };
      mockRequest.headers.authorization = 'Bearer access_token_xyz';
      mockRequest.cookies = { refreshToken: 'refresh_token_xyz' };
      mockRequest.body = { sessionId: 'session_789' };

      directAuthService.logoutUser.mockResolvedValue(true);

      // Act
      await authController.logoutUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.logoutUser).toHaveBeenCalledTimes(2);
      expect(directAuthService.logoutUser).toHaveBeenNthCalledWith(
        1,
        'user_123',
        'access_token_xyz',
        expect.objectContaining({
          ip: mockRequest.ip,
          sessionId: 'session_789'
        })
      );
      expect(directAuthService.logoutUser).toHaveBeenNthCalledWith(
        2,
        'user_123',
        'refresh_token_xyz',
        expect.objectContaining({
          reason: 'logout_refresh'
        })
      );
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'strict'
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logout successful'
      });
    });

    test('should return error when user is not authenticated', async () => {
      // Arrange
      mockRequest.user = null;

      // Act
      await authController.logoutUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not authenticated'
        })
      );
      expect(directAuthService.logoutUser).not.toHaveBeenCalled();
    });

    test('should handle logout when only access token is present', async () => {
      // Arrange
      mockRequest.user = { id: 'user_123' };
      mockRequest.headers.authorization = 'Bearer access_token_xyz';
      mockRequest.cookies = {};
      mockRequest.body = {};

      directAuthService.logoutUser.mockResolvedValue(true);

      // Act
      await authController.logoutUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.logoutUser).toHaveBeenCalledTimes(1);
      expect(directAuthService.logoutUser).toHaveBeenCalledWith(
        'user_123',
        'access_token_xyz',
        expect.any(Object)
      );
    });

    test('should handle service errors during logout gracefully', async () => {
      // Arrange
      mockRequest.user = { id: 'user_123' };
      mockRequest.headers.authorization = 'Bearer access_token_xyz';
      
      const serviceError = new Error('Token blacklist operation failed');
      directAuthService.logoutUser.mockRejectedValue(serviceError);

      // Act
      await authController.logoutUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(serviceError);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('logoutAllDevices', () => {
    test('should successfully logout user from all devices', async () => {
      // Arrange
      mockRequest.user = { id: 'user_123' };
      mockRequest.headers.authorization = 'Bearer access_token_xyz';
      mockRequest.cookies = { refreshToken: 'refresh_token_xyz' };

      directAuthService.logoutUser.mockResolvedValue(true);
      directAuthService.logoutUserAllDevices.mockResolvedValue(5);

      // Act
      await authController.logoutAllDevices(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.logoutUser).toHaveBeenCalledTimes(2);
      expect(directAuthService.logoutUserAllDevices).toHaveBeenCalledWith(
        'user_123',
        'logout_all_devices'
      );
      expect(mockResponse.clearCookie).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out from all devices successfully',
        data: {
          tokensInvalidated: 5
        }
      });
    });

    test('should return error when user is not authenticated', async () => {
      // Arrange
      mockRequest.user = null;

      // Act
      await authController.logoutAllDevices(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not authenticated'
        })
      );
      expect(directAuthService.logoutUserAllDevices).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    test('should successfully return authenticated user data', async () => {
      // Arrange
      mockRequest.user = { id: 'user_123' };

      const mockUserData = {
        id: 'user_123',
        email: 'john.doe@example.com',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        },
        emailVerified: true,
        mfaEnabled: false,
        role: 'user'
      };

      directAuthService.getUserById.mockResolvedValue(mockUserData);

      // Act
      await authController.getCurrentUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.getUserById).toHaveBeenCalledWith('user_123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: mockUserData
        }
      });
    });

    test('should return error when user is not authenticated', async () => {
      // Arrange
      mockRequest.user = null;

      // Act
      await authController.getCurrentUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not authenticated'
        })
      );
      expect(directAuthService.getUserById).not.toHaveBeenCalled();
    });

    test('should handle user not found scenario', async () => {
      // Arrange
      mockRequest.user = { id: 'user_999' };
      directAuthService.getUserById.mockResolvedValue(null);

      // Act
      await authController.getCurrentUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not found')
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should properly propagate service layer errors', async () => {
      // Arrange
      const serviceError = new Error('Service unavailable');
      serviceError.statusCode = 503;

      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#',
        userType: 'client'
      };

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      directAuthService.registerDirectUser.mockRejectedValue(serviceError);

      // Act
      await authController.registerUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(serviceError);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#'
      };

      const unexpectedError = new TypeError('Cannot read property of undefined');
      directAuthService.loginDirectUser.mockRejectedValue(unexpectedError);

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(unexpectedError);
    });
  });

  describe('Request Context Handling', () => {
    test('should extract IP address from various request properties', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#'
      };
      mockRequest.ip = undefined;
      mockRequest.connection = { remoteAddress: '10.0.0.1' };

      directAuthService.loginDirectUser.mockResolvedValue({
        user: { id: 'user_123' },
        tokens: { accessToken: 'token' }
      });

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.loginDirectUser).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          ip: '10.0.0.1'
        })
      );
    });

    test('should handle missing user agent gracefully', async () => {
      // Arrange
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!@#'
      };
      mockRequest.headers = {};

      directAuthService.loginDirectUser.mockResolvedValue({
        user: { id: 'user_123' },
        tokens: { accessToken: 'token' }
      });

      // Act
      await authController.loginUser(mockRequest, mockResponse, mockNext);

      // Assert
      expect(directAuthService.loginDirectUser).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          userAgent: undefined
        })
      );
    });
  });
});