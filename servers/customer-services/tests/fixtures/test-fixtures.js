u/**
 * @fileoverview Test Fixtures - Reusable Test Data
 * @module servers/customer-services/tests/fixtures/test-fixtures
 * @description Centralized test data for consistent testing across all test suites
 */

/**
 * Sample users for testing
 */
const testUsers = {
  valid: {
    standard: {
      email: 'john.doe@example.com',
      password: 'SecurePass123!@#',
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890'
      },
      userType: 'client',
      companyName: 'Acme Corporation'
    },

    consultant: {
      email: 'jane.consultant@example.com',
      password: 'ConsultantPass123!@#',
      profile: {
        firstName: 'Jane',
        lastName: 'Consultant',
        phoneNumber: '+1987654321'
      },
      userType: 'consultant',
      expertise: 'Software Engineering',
      yearsOfExperience: 10
    },

    candidate: {
      email: 'bob.candidate@example.com',
      password: 'CandidatePass123!@#',
      profile: {
        firstName: 'Bob',
        lastName: 'Candidate',
        phoneNumber: '+1555123456'
      },
      userType: 'candidate',
      skills: ['JavaScript', 'React', 'Node.js'],
      jobInterest: 'Full Stack Developer'
    },

    partner: {
      email: 'alice.partner@example.com',
      password: 'PartnerPass123!@#',
      profile: {
        firstName: 'Alice',
        lastName: 'Partner'
      },
      userType: 'partner',
      organizationName: 'Partner Org',
      partnerType: 'technology'
    }
  },

  invalid: {
    weakPassword: {
      email: 'weak@example.com',
      password: 'weak',
      userType: 'client'
    },

    invalidEmail: {
      email: 'not-an-email',
      password: 'SecurePass123!@#',
      userType: 'client'
    },

    missingRequired: {
      password: 'SecurePass123!@#',
      userType: 'client'
    },

    noUppercase: {
      email: 'test@example.com',
      password: 'lowercase123!@#',
      userType: 'client'
    },

    noLowercase: {
      email: 'test@example.com',
      password: 'UPPERCASE123!@#',
      userType: 'client'
    },

    noNumbers: {
      email: 'test@example.com',
      password: 'NoNumbers!@#',
      userType: 'client'
    },

    noSpecialChars: {
      email: 'test@example.com',
      password: 'NoSpecialChars123',
      userType: 'client'
    }
  }
};

/**
 * Sample authentication tokens
 */
const testTokens = {
  valid: {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoiam9obi5kb2VAZXhhbXBsZS5jb20iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE2NDA5OTg4MDB9.valid_signature',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE2NDE2MDAwMDB9.valid_signature',
    verificationToken: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    resetToken: 'z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1'
  },

  expired: {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsImVtYWlsIjoiam9obi5kb2VAZXhhbXBsZS5jb20iLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE2NDA5OTUyMDF9.expired_signature',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMyIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE2NDA5OTUyMDF9.expired_signature'
  },

  invalid: {
    accessToken: 'invalid.token.format',
    refreshToken: 'another.invalid.token',
    verificationToken: 'invalid_verification_token',
    resetToken: 'invalid_reset_token'
  }
};

/**
 * Sample session data
 */
const testSessions = {
  active: {
    desktop: {
      id: 'session_desktop_123',
      userId: 'user_123',
      deviceInfo: {
        type: 'desktop',
        name: 'Chrome on Windows',
        os: 'Windows 10',
        browser: 'Chrome 120'
      },
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      location: {
        city: 'San Francisco',
        country: 'USA',
        timezone: 'America/Los_Angeles'
      },
      createdAt: new Date('2025-01-01T10:00:00Z'),
      lastActivity: new Date('2025-01-15T14:30:00Z'),
      expiresAt: new Date('2025-01-22T10:00:00Z')
    },

    mobile: {
      id: 'session_mobile_456',
      userId: 'user_123',
      deviceInfo: {
        type: 'mobile',
        name: 'Safari on iPhone',
        os: 'iOS 17',
        browser: 'Safari 17'
      },
      ip: '192.168.1.101',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      location: {
        city: 'New York',
        country: 'USA',
        timezone: 'America/New_York'
      },
      createdAt: new Date('2025-01-10T08:00:00Z'),
      lastActivity: new Date('2025-01-15T12:00:00Z'),
      expiresAt: new Date('2025-01-24T08:00:00Z')
    },

    tablet: {
      id: 'session_tablet_789',
      userId: 'user_123',
      deviceInfo: {
        type: 'tablet',
        name: 'Chrome on iPad',
        os: 'iPadOS 17',
        browser: 'Chrome 120'
      },
      ip: '192.168.1.102',
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)',
      location: {
        city: 'Los Angeles',
        country: 'USA',
        timezone: 'America/Los_Angeles'
      },
      createdAt: new Date('2025-01-12T16:00:00Z'),
      lastActivity: new Date('2025-01-15T18:45:00Z'),
      expiresAt: new Date('2025-01-26T16:00:00Z')
    }
  }
};

/**
 * Sample MFA data
 */
const testMFA = {
  totp: {
    secret: 'JBSWY3DPEHPK3PXP',
    qrCode: 'otpauth://totp/InsightSerenity:john.doe@example.com?secret=JBSWY3DPEHPK3PXP&issuer=InsightSerenity',
    backupCodes: [
      'ABCD-1234-EFGH-5678',
      'IJKL-9012-MNOP-3456',
      'QRST-7890-UVWX-1234',
      'YZAB-5678-CDEF-9012',
      'GHIJ-3456-KLMN-7890',
      'OPQR-1234-STUV-5678',
      'WXYZ-9012-ABCD-3456',
      'EFGH-7890-IJKL-1234'
    ],
    validCodes: ['123456', '789012', '345678'],
    invalidCodes: ['000000', '999999', '111111']
  },

  sms: {
    phoneNumber: '+1234567890',
    validCodes: ['654321', '876543', '234567'],
    invalidCodes: ['000000', '999999', '111111']
  },

  email: {
    email: 'john.doe@example.com',
    validCodes: ['789012', '456789', '123890'],
    invalidCodes: ['000000', '999999', '111111']
  }
};

/**
 * Sample OAuth provider data
 */
const testOAuth = {
  github: {
    provider: 'github',
    providerId: 'github_user_12345',
    profile: {
      id: '12345',
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'john.doe@example.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345'
    },
    accessToken: 'gho_github_access_token_abc123',
    refreshToken: 'ghr_github_refresh_token_xyz789'
  },

  google: {
    provider: 'google',
    providerId: 'google_user_67890',
    profile: {
      id: '67890',
      email: 'john.doe@gmail.com',
      displayName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/default-user'
    },
    accessToken: 'ya29.google_access_token_abc123',
    refreshToken: '1//google_refresh_token_xyz789',
    idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.google_id_token'
  },

  linkedin: {
    provider: 'linkedin',
    providerId: 'linkedin_user_abcdef',
    profile: {
      id: 'abcdef123',
      email: 'john.doe@linkedin.com',
      firstName: 'John',
      lastName: 'Doe',
      profileUrl: 'https://www.linkedin.com/in/johndoe',
      pictureUrl: 'https://media.licdn.com/dms/image/default'
    },
    accessToken: 'AQV_linkedin_access_token_abc123',
    refreshToken: 'AQU_linkedin_refresh_token_xyz789'
  }
};

/**
 * Sample error responses
 */
const testErrors = {
  validation: {
    success: false,
    message: 'Validation failed',
    errors: [
      {
        field: 'email',
        message: 'Must be a valid email address',
        value: 'invalid-email'
      },
      {
        field: 'password',
        message: 'Password must be at least 8 characters',
        value: 'short'
      }
    ]
  },

  unauthorized: {
    success: false,
    message: 'Authentication required',
    code: 'UNAUTHORIZED',
    statusCode: 401
  },

  forbidden: {
    success: false,
    message: 'You do not have permission to perform this action',
    code: 'FORBIDDEN',
    statusCode: 403
  },

  notFound: {
    success: false,
    message: 'Resource not found',
    code: 'NOT_FOUND',
    statusCode: 404
  },

  conflict: {
    success: false,
    message: 'Resource already exists',
    code: 'CONFLICT',
    statusCode: 409
  },

  rateLimited: {
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
    statusCode: 429,
    retryAfter: 300
  },

  serverError: {
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
    statusCode: 500
  }
};

/**
 * Sample request contexts
 */
const testContexts = {
  web: {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    device: {
      type: 'desktop',
      name: 'Chrome Browser',
      os: 'Windows 10'
    },
    location: {
      city: 'San Francisco',
      region: 'California',
      country: 'USA',
      timezone: 'America/Los_Angeles'
    }
  },

  mobile: {
    ip: '192.168.1.101',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    device: {
      type: 'mobile',
      name: 'iPhone 14',
      os: 'iOS 17'
    },
    location: {
      city: 'New York',
      region: 'New York',
      country: 'USA',
      timezone: 'America/New_York'
    }
  },

  api: {
    ip: '10.0.0.1',
    userAgent: 'API Client/1.0',
    device: {
      type: 'server',
      name: 'API Server',
      os: 'Linux'
    },
    apiKey: 'api_key_abc123xyz789'
  }
};

/**
 * Helper functions to generate test data
 */
const generators = {
  /**
   * Generate a unique email for testing
   */
  generateEmail: (prefix = 'test') => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}_${timestamp}_${random}@example.com`;
  },

  /**
   * Generate a unique username
   */
  generateUsername: (prefix = 'user') => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}_${timestamp}_${random}`;
  },

  /**
   * Generate a strong password
   */
  generateStrongPassword: () => {
    const length = 12;
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  },

  /**
   * Generate user ID
   */
  generateUserId: () => {
    return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  },

  /**
   * Generate session ID
   */
  generateSessionId: () => {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  },

  /**
   * Generate tenant ID
   */
  generateTenantId: () => {
    return `tenant_${Math.random().toString(36).substring(2, 10)}`;
  },

  /**
   * Generate complete test user
   */
  generateTestUser: (overrides = {}) => {
    return {
      email: generators.generateEmail(),
      password: generators.generateStrongPassword(),
      profile: {
        firstName: 'Test',
        lastName: 'User',
        phoneNumber: `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`
      },
      userType: 'client',
      emailVerified: false,
      mfaEnabled: false,
      accountLocked: false,
      ...overrides
    };
  }
};

module.exports = {
  testUsers,
  testTokens,
  testSessions,
  testMFA,
  testOAuth,
  testErrors,
  testContexts,
  generators
};