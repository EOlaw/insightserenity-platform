/**
 * Express Mock Utilities
 * Provides mock request, response, and next functions for testing Express middleware and controllers
 */

/**
 * Creates a mock Express request object
 */
const createMockRequest = (options = {}) => {
  const req = {
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {},
    user: options.user || null,
    session: options.session || {},
    cookies: options.cookies || {},
    signedCookies: options.signedCookies || {},
    get: jest.fn((header) => req.headers[header.toLowerCase()]),
    header: jest.fn((header) => req.headers[header.toLowerCase()]),
    ip: options.ip || '127.0.0.1',
    ips: options.ips || [],
    protocol: options.protocol || 'https',
    secure: options.secure !== undefined ? options.secure : true,
    xhr: options.xhr || false,
    method: options.method || 'GET',
    path: options.path || '/',
    originalUrl: options.originalUrl || '/',
    baseUrl: options.baseUrl || '',
    url: options.url || '/',
    tenant: options.tenant || null,
    file: options.file || null,
    files: options.files || null
  };

  return req;
};

/**
 * Creates a mock Express response object
 */
const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    attachment: jest.fn().mockReturnThis(),
    sendFile: jest.fn().mockReturnThis(),
    download: jest.fn().mockReturnThis(),
    locals: {},
    headersSent: false,
    statusCode: 200
  };

  // Track what was sent
  res.json.mockImplementation((data) => {
    res._jsonData = data;
    return res;
  });

  res.send.mockImplementation((data) => {
    res._sendData = data;
    return res;
  });

  res.status.mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });

  return res;
};

/**
 * Creates a mock Express next function
 */
const createMockNext = () => {
  const next = jest.fn();
  return next;
};

/**
 * Helper to extract response data from mock response
 */
const getResponseData = (res) => {
  return res._jsonData || res._sendData || null;
};

/**
 * Helper to check if response was successful (2xx status)
 */
const isSuccessResponse = (res) => {
  return res.statusCode >= 200 && res.statusCode < 300;
};

/**
 * Helper to check if response was an error (4xx or 5xx status)
 */
const isErrorResponse = (res) => {
  return res.statusCode >= 400;
};

/**
 * Creates a mock authenticated user
 */
const createMockUser = (overrides = {}) => ({
  _id: overrides._id || '507f1f77bcf86cd799439011',
  email: overrides.email || 'test@example.com',
  firstName: overrides.firstName || 'Test',
  lastName: overrides.lastName || 'User',
  role: overrides.role || 'client',
  isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true,
  isActive: overrides.isActive !== undefined ? overrides.isActive : true,
  ...overrides
});

/**
 * Creates a mock authenticated consultant
 */
const createMockConsultant = (overrides = {}) => ({
  _id: overrides._id || '507f1f77bcf86cd799439012',
  email: overrides.email || 'consultant@example.com',
  firstName: overrides.firstName || 'Test',
  lastName: overrides.lastName || 'Consultant',
  role: overrides.role || 'consultant',
  specialization: overrides.specialization || 'General',
  isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true,
  isActive: overrides.isActive !== undefined ? overrides.isActive : true,
  ...overrides
});

module.exports = {
  createMockRequest,
  createMockResponse,
  createMockNext,
  getResponseData,
  isSuccessResponse,
  isErrorResponse,
  createMockUser,
  createMockConsultant
};
