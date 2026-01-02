/**
 * Unit Tests for User Service
 * Tests all core functionality of the user management service
 */

const { createMockModel, createMockDocument, createObjectId } = require('../../mocks/database.mock');
const bcrypt = require('bcryptjs');

// Mock dependencies
jest.mock('../../../shared/lib/database');
jest.mock('bcryptjs');

describe('UserService', () => {
  let UserService;
  let userService;
  let mockDatabase;
  let mockUserModel;

  const sampleUser = {
    _id: createObjectId(),
    email: 'test@example.com',
    username: 'testuser',
    profile: {
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User'
    },
    role: 'client',
    status: 'active',
    tenantId: '507f1f77bcf86cd799439000',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock user model
    mockUserModel = createMockModel('User');

    // Mock database service
    mockDatabase = {
      getUserDatabaseService: jest.fn().mockReturnValue({
        getModel: jest.fn(() => mockUserModel),
        userExists: jest.fn().mockResolvedValue(false),
        createUser: jest.fn().mockResolvedValue(createMockDocument(sampleUser)),
        getUserById: jest.fn().mockResolvedValue(createMockDocument(sampleUser)),
        getUserByEmail: jest.fn().mockResolvedValue(createMockDocument(sampleUser)),
        updateUser: jest.fn().mockResolvedValue(createMockDocument(sampleUser)),
        deleteUser: jest.fn().mockResolvedValue(true),
        listUsers: jest.fn().mockResolvedValue({
          users: [createMockDocument(sampleUser)],
          totalCount: 1,
          currentPage: 1,
          totalPages: 1
        })
      })
    };

    // Mock bcrypt
    bcrypt.hash = jest.fn().mockResolvedValue('$2a$10$hashedpassword');
    bcrypt.compare = jest.fn().mockResolvedValue(true);

    // Mock the database module
    require('../../../shared/lib/database').getUserDatabaseService = mockDatabase.getUserDatabaseService;

    // Import the service after mocking
    UserService = require('../../../servers/customer-services/modules/core-business/user-management/services/user-service');
    userService = new UserService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createUser', () => {
    it('should successfully create a user with valid data', async () => {
      // Arrange
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        username: 'newuser',
        profile: {
          firstName: 'New',
          lastName: 'User',
          displayName: 'New User'
        },
        phoneNumber: '+1234567890',
        role: 'client'
      };

      const tenantId = '507f1f77bcf86cd799439000';
      const createdUser = createMockDocument({
        ...sampleUser,
        email: userData.email,
        username: userData.username,
        profile: userData.profile
      });

      const dbService = mockDatabase.getUserDatabaseService();
      dbService.createUser.mockResolvedValue(createdUser);

      // Act
      const result = await userService.createUser(userData, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, expect.any(Number));
      expect(dbService.userExists).toHaveBeenCalledWith(userData.email, tenantId);
      expect(dbService.createUser).toHaveBeenCalled();
    });

    it('should throw error when user already exists', async () => {
      // Arrange
      const userData = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        profile: {
          firstName: 'Existing',
          lastName: 'User'
        }
      };

      const tenantId = '507f1f77bcf86cd799439000';
      const dbService = mockDatabase.getUserDatabaseService();
      dbService.userExists.mockResolvedValue(true);

      // Act & Assert
      await expect(
        userService.createUser(userData, tenantId)
      ).rejects.toThrow('User already exists with this email');
    });

    it('should throw error when email is invalid', async () => {
      // Arrange
      const userData = {
        email: 'invalid-email',
        password: 'SecurePass123!',
        profile: {
          firstName: 'Test',
          lastName: 'User'
        }
      };

      const tenantId = '507f1f77bcf86cd799439000';

      // Act & Assert
      await expect(
        userService.createUser(userData, tenantId)
      ).rejects.toThrow();
    });

    it('should throw error when password is too weak', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: '123', // Too weak
        profile: {
          firstName: 'Test',
          lastName: 'User'
        }
      };

      const tenantId = '507f1f77bcf86cd799439000';

      // Act & Assert
      await expect(
        userService.createUser(userData, tenantId)
      ).rejects.toThrow();
    });

    it('should convert email to lowercase', async () => {
      // Arrange
      const userData = {
        email: 'UPPER@EXAMPLE.COM',
        password: 'SecurePass123!',
        profile: {
          firstName: 'Test',
          lastName: 'User'
        }
      };

      const tenantId = '507f1f77bcf86cd799439000';
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.createUser(userData, tenantId);

      // Assert
      expect(dbService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'upper@example.com'
        }),
        tenantId,
        null
      );
    });
  });

  describe('getUserById', () => {
    it('should successfully retrieve a user by ID', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      const result = await userService.getUserById(userId, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toEqual(sampleUser._id);
      expect(dbService.getUserById).toHaveBeenCalledWith(userId, tenantId);
    });

    it('should throw error when user is not found', async () => {
      // Arrange
      const userId = createObjectId().toString();
      const tenantId = '507f1f77bcf86cd799439000';
      const dbService = mockDatabase.getUserDatabaseService();
      dbService.getUserById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        userService.getUserById(userId, tenantId)
      ).rejects.toThrow('User not found');
    });

    it('should exclude sensitive fields by default', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const dbService = mockDatabase.getUserDatabaseService();
      const userWithPassword = createMockDocument({
        ...sampleUser,
        password: '$2a$10$hashedpassword'
      });
      dbService.getUserById.mockResolvedValue(userWithPassword);

      // Act
      const result = await userService.getUserById(userId, tenantId, { includeSensitive: false });

      // Assert
      expect(result.password).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    it('should successfully retrieve a user by email', async () => {
      // Arrange
      const email = sampleUser.email;
      const tenantId = sampleUser.tenantId;
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      const result = await userService.getUserByEmail(email, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(email);
      expect(dbService.getUserByEmail).toHaveBeenCalledWith(email, tenantId);
    });

    it('should convert email to lowercase before search', async () => {
      // Arrange
      const email = 'UPPER@EXAMPLE.COM';
      const tenantId = '507f1f77bcf86cd799439000';
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.getUserByEmail(email, tenantId);

      // Assert
      expect(dbService.getUserByEmail).toHaveBeenCalledWith(
        'upper@example.com',
        tenantId
      );
    });
  });

  describe('updateUser', () => {
    it('should successfully update a user', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const updateData = {
        profile: {
          firstName: 'Updated',
          lastName: 'Name'
        }
      };

      const updatedUser = createMockDocument({
        ...sampleUser,
        profile: {
          ...sampleUser.profile,
          ...updateData.profile
        }
      });

      const dbService = mockDatabase.getUserDatabaseService();
      dbService.updateUser.mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateUser(userId, updateData, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.profile.firstName).toBe('Updated');
      expect(dbService.updateUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining(updateData),
        tenantId
      );
    });

    it('should hash password when updating password', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const updateData = {
        password: 'NewSecurePass123!'
      };

      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.updateUser(userId, updateData, tenantId);

      // Assert
      expect(bcrypt.hash).toHaveBeenCalledWith(updateData.password, expect.any(Number));
    });

    it('should not allow updating protected fields', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const updateData = {
        _id: createObjectId(), // Protected field
        createdAt: new Date(), // Protected field
        profile: {
          firstName: 'Updated'
        }
      };

      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.updateUser(userId, updateData, tenantId);

      // Assert
      expect(dbService.updateUser).toHaveBeenCalledWith(
        userId,
        expect.not.objectContaining({
          _id: updateData._id,
          createdAt: updateData.createdAt
        }),
        tenantId
      );
    });
  });

  describe('deleteUser', () => {
    it('should successfully soft delete a user', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      const result = await userService.deleteUser(userId, tenantId);

      // Assert
      expect(result).toBe(true);
      expect(dbService.deleteUser).toHaveBeenCalledWith(userId, tenantId, false);
    });

    it('should successfully hard delete a user', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      const result = await userService.deleteUser(userId, tenantId, true);

      // Assert
      expect(result).toBe(true);
      expect(dbService.deleteUser).toHaveBeenCalledWith(userId, tenantId, true);
    });
  });

  describe('listUsers', () => {
    it('should successfully list users with pagination', async () => {
      // Arrange
      const tenantId = '507f1f77bcf86cd799439000';
      const options = {
        page: 1,
        limit: 20,
        sort: 'createdAt',
        order: 'desc'
      };

      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      const result = await userService.listUsers(tenantId, options);

      // Assert
      expect(result).toBeDefined();
      expect(result.users).toBeInstanceOf(Array);
      expect(result.totalCount).toBe(1);
      expect(dbService.listUsers).toHaveBeenCalledWith(tenantId, options);
    });

    it('should filter users by role', async () => {
      // Arrange
      const tenantId = '507f1f77bcf86cd799439000';
      const options = {
        role: 'consultant',
        page: 1,
        limit: 20
      };

      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.listUsers(tenantId, options);

      // Assert
      expect(dbService.listUsers).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ role: 'consultant' })
      );
    });

    it('should filter users by status', async () => {
      // Arrange
      const tenantId = '507f1f77bcf86cd799439000';
      const options = {
        status: 'active',
        page: 1,
        limit: 20
      };

      const dbService = mockDatabase.getUserDatabaseService();

      // Act
      await userService.listUsers(tenantId, options);

      // Assert
      expect(dbService.listUsers).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ status: 'active' })
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      // Arrange
      const plainPassword = 'SecurePass123!';
      const hashedPassword = '$2a$10$hashedpassword';
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await userService.verifyPassword(plainPassword, hashedPassword);

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith(plainPassword, hashedPassword);
    });

    it('should return false for incorrect password', async () => {
      // Arrange
      const plainPassword = 'WrongPassword123!';
      const hashedPassword = '$2a$10$hashedpassword';
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await userService.verifyPassword(plainPassword, hashedPassword);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('updateUserRole', () => {
    it('should successfully update user role', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const newRole = 'consultant';

      const updatedUser = createMockDocument({
        ...sampleUser,
        role: newRole
      });

      const dbService = mockDatabase.getUserDatabaseService();
      dbService.updateUser.mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateUserRole(userId, newRole, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.role).toBe(newRole);
      expect(dbService.updateUser).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ role: newRole }),
        tenantId
      );
    });

    it('should throw error for invalid role', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const invalidRole = 'invalid_role';

      // Act & Assert
      await expect(
        userService.updateUserRole(userId, invalidRole, tenantId)
      ).rejects.toThrow();
    });
  });

  describe('updateUserStatus', () => {
    it('should successfully update user status', async () => {
      // Arrange
      const userId = sampleUser._id.toString();
      const tenantId = sampleUser.tenantId;
      const newStatus = 'suspended';

      const updatedUser = createMockDocument({
        ...sampleUser,
        status: newStatus
      });

      const dbService = mockDatabase.getUserDatabaseService();
      dbService.updateUser.mockResolvedValue(updatedUser);

      // Act
      const result = await userService.updateUserStatus(userId, newStatus, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(newStatus);
    });
  });
});
