/**
 * @fileoverview Mock Data Utilities for Testing
 * @module tests/setup/mock-data
 */

/**
 * Generate mock user data
 */
const mockUsers = {
  standard: {
    id: 'user_standard_123',
    email: 'standard.user@example.com',
    password: 'SecurePass123!@#',
    firstName: 'Standard',
    lastName: 'User',
    tenantId: 'tenant_456',
    role: 'user',
    emailVerified: true,
    phoneVerified: false,
    mfaEnabled: false,
    createdAt: '2025-01-01T00:00:00Z'
  },

  admin: {
    id: 'user_admin_456',
    email: 'admin.user@example.com',
    password: 'AdminPass123!@#',
    firstName: 'Admin',
    lastName: 'User',
    tenantId: 'tenant_456',
    role: 'admin',
    emailVerified: true,
    phoneVerified: true,
    mfaEnabled: true,
    createdAt: '2024-12-01T00:00:00Z'
  },

  unverified: {
    id: 'user_unverified_789',
    email: 'unverified.user@example.com',
    password: 'UnverifiedPass123!@#',
    firstName: 'Unverified',
    lastName: 'User',
    tenantId: 'tenant_456',
    role: 'user',
    emailVerified: false,
    phoneVerified: false,
    mfaEnabled: false,
    createdAt: '2025-10-14T00:00:00Z'
  },

  locked: {
    id: 'user_locked_101',
    email: 'locked.user@example.com',
    password: 'LockedPass123!@#',
    firstName: 'Locked',
    lastName: 'User',
    tenantId: 'tenant_456',
    role: 'user',
    emailVerified: true,
    phoneVerified: false,
    mfaEnabled: false,
    accountLocked: true,
    lockoutUntil: '2025-10-14T15:30:00Z',
    createdAt: '2025-09-01T00:00:00Z'
  }
};

/**
 * Generate mock tokens
 */
const mockTokens = {
  valid: {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid.access.token',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid.refresh.token',
    mfaToken: 'temp_mfa_token_abc123',
    expiresIn: 3600
  },

  expired: {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.access.token',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.refresh.token'
  },

  invalid: {
    accessToken: 'invalid.token.format',
    refreshToken: 'invalid.refresh.format'
  }
};

/**
 * Generate mock verification tokens
 */
const mockVerificationTokens = {
  email: {
    valid: 'email_verification_token_valid_123',
    expired: 'email_verification_token_expired_456',
    invalid: 'email_verification_token_invalid_789'
  },

  password: {
    valid: 'password_reset_token_valid_123',
    expired: 'password_reset_token_expired_456',
    invalid: 'password_reset_token_invalid_789'
  },

  phone: {
    valid: 'phone_verification_code_123456',
    expired: 'phone_verification_code_expired',
    invalid: 'phone_verification_code_000000'
  }
};

/**
 * Generate mock MFA data
 */
const mockMFA = {
  totp: {
    secret: 'JBSWY3DPEHPK3PXP',
    qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    backupCodes: [
      'ABCD-1234-EFGH-5678',
      'IJKL-9012-MNOP-3456',
      'QRST-7890-UVWX-1234',
      'YZAB-5678-CDEF-9012'
    ],
    validCode: '123456',
    invalidCode: '000000'
  },

  sms: {
    phoneNumber: '+1234567890',
    validCode: '654321',
    invalidCode: '000000'
  },

  email: {
    email: 'mfa.user@example.com',
    validCode: '789012',
    invalidCode: '000000'
  }
};

/**
 * Generate mock sessions
 */
const mockSessions = {
  active: [
    {
      id: 'session_active_1',
      userId: 'user_standard_123',
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ip: '192.168.1.100',
        platform: 'Windows',
        browser: 'Chrome'
      },
      createdAt: '2025-10-14T10:00:00Z',
      lastActivity: '2025-10-14T12:00:00Z',
      expiresAt: '2025-10-21T10:00:00Z'
    },
    {
      id: 'session_active_2',
      userId: 'user_standard_123',
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
        ip: '192.168.1.101',
        platform: 'iOS',
        browser: 'Safari'
      },
      createdAt: '2025-10-13T14:00:00Z',
      lastActivity: '2025-10-14T11:30:00Z',
      expiresAt: '2025-10-20T14:00:00Z'
    }
  ]
};

/**
 * Generate mock OAuth data
 */
const mockOAuth = {
  github: {
    provider: 'github',
    providerId: 'github_12345678',
    profile: {
      id: '12345678',
      username: 'githubuser',
      displayName: 'GitHub User',
      email: 'github.user@example.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345678'
    },
    accessToken: 'github_access_token_xyz',
    refreshToken: 'github_refresh_token_xyz'
  },

  google: {
    provider: 'google',
    providerId: 'google_987654321',
    profile: {
      id: '987654321',
      email: 'google.user@example.com',
      displayName: 'Google User',
      firstName: 'Google',
      lastName: 'User',
      picture: 'https://lh3.googleusercontent.com/a/default-user'
    },
    accessToken: 'google_access_token_xyz',
    refreshToken: 'google_refresh_token_xyz',
    idToken: 'google_id_token_xyz'
  },

  linkedin: {
    provider: 'linkedin',
    providerId: 'linkedin_abcdef123',
    profile: {
      id: 'abcdef123',
      email: 'linkedin.user@example.com',
      firstName: 'LinkedIn',
      lastName: 'User',
      profileUrl: 'https://www.linkedin.com/in/linkedinuser',
      pictureUrl: 'https://media.licdn.com/dms/image/default'
    },
    accessToken: 'linkedin_access_token_xyz',
    refreshToken: 'linkedin_refresh_token_xyz'
  }
};

/**
 * Generate mock password policy
 */
const mockPasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventReuse: 5,
  expirationDays: 90,
  validPasswords: [
    'SecurePass123!@#',
    'Str0ng!P@ssw0rd',
    'C0mplex#Pass123'
  ],
  invalidPasswords: [
    'weak',
    'password',
    'NoSpecialChar123',
    'no-uppercase-123!',
    'NO-LOWERCASE-123!',
    'NoNumbers!@#'
  ]
};

/**
 * Generate mock tenant data
 */
const mockTenants = {
  primary: {
    id: 'tenant_456',
    name: 'Primary Tenant',
    domain: 'primary.example.com',
    status: 'active',
    plan: 'enterprise',
    settings: {
      mfaRequired: false,
      passwordPolicy: mockPasswordPolicy,
      sessionTimeout: 3600
    }
  },

  secondary: {
    id: 'tenant_789',
    name: 'Secondary Tenant',
    domain: 'secondary.example.com',
    status: 'active',
    plan: 'professional',
    settings: {
      mfaRequired: true,
      passwordPolicy: mockPasswordPolicy,
      sessionTimeout: 1800
    }
  }
};

/**
 * Generate mock API responses
 */
const mockResponses = {
  success: {
    registration: {
      success: true,
      message: 'User registered successfully',
      data: {
        user: mockUsers.standard,
        tokens: mockTokens.valid
      }
    },

    login: {
      success: true,
      message: 'Login successful',
      data: {
        user: mockUsers.standard,
        tokens: mockTokens.valid,
        sessionId: 'session_active_1'
      }
    },

    logout: {
      success: true,
      message: 'Logout successful'
    },

    refresh: {
      success: true,
      message: 'Token refreshed successfully',
      data: mockTokens.valid
    }
  },

  error: {
    unauthorized: {
      success: false,
      message: 'Authentication required',
      code: 'UNAUTHORIZED'
    },

    invalidCredentials: {
      success: false,
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    },

    accountLocked: {
      success: false,
      message: 'Account is locked due to multiple failed login attempts',
      code: 'ACCOUNT_LOCKED',
      data: {
        lockoutUntil: '2025-10-14T15:30:00Z',
        remainingMinutes: 15
      }
    },

    validation: {
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: [
        {
          field: 'email',
          message: 'Must be a valid email address'
        },
        {
          field: 'password',
          message: 'Password must be at least 8 characters'
        }
      ]
    }
  }
};

/**
 * Helper functions
 */
const helpers = {
  /**
   * Generate random user
   */
  generateRandomUser: (overrides = {}) => ({
    id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    email: `test.${Date.now()}@example.com`,
    password: 'RandomPass123!@#',
    firstName: 'Random',
    lastName: 'User',
    tenantId: 'tenant_456',
    role: 'user',
    emailVerified: false,
    phoneVerified: false,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  /**
   * Generate random token
   */
  generateRandomToken: (type = 'access') => {
    const prefix = type === 'access' ? 'acc' : 'ref';
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  },

  /**
   * Generate random session ID
   */
  generateSessionId: () => {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  },

  /**
   * Generate random tenant ID
   */
  generateTenantId: () => {
    return `tenant_${Math.random().toString(36).substring(2, 10)}`;
  }
};

module.exports = {
  mockUsers,
  mockTokens,
  mockVerificationTokens,
  mockMFA,
  mockSessions,
  mockOAuth,
  mockPasswordPolicy,
  mockTenants,
  mockResponses,
  helpers
};