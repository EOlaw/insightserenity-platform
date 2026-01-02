/**
 * Unit Tests for Consultation Routes
 * Tests all route definitions and middleware integrations
 */

const request = require('supertest');
const express = require('express');
const { sampleConsultation, sampleConsultant, sampleClient } = require('../../fixtures/consultation.fixtures');

// Mock all dependencies
jest.mock('../../../servers/customer-services/modules/core-business/consultation-management/controllers/consultation-controller');
jest.mock('../../../servers/customer-services/middleware/auth-middleware');
jest.mock('../../../servers/customer-services/middleware/rate-limiter');

describe('Consultation Routes', () => {
  let app;
  let mockController;
  let mockAuthMiddleware;
  let mockRateLimiter;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create Express app
    app = express();
    app.use(express.json());

    // Import and setup mocked modules
    mockAuthMiddleware = require('../../../servers/customer-services/middleware/auth-middleware');
    mockRateLimiter = require('../../../servers/customer-services/middleware/rate-limiter');
    mockController = require('../../../servers/customer-services/modules/core-business/consultation-management/controllers/consultation-controller');

    // Mock authenticate middleware - always allow
    mockAuthMiddleware.authenticate = jest.fn((req, res, next) => {
      req.user = {
        id: sampleClient._id.toString(),
        role: 'client',
        email: 'test@example.com'
      };
      next();
    });

    // Mock authorize middleware - check roles
    mockAuthMiddleware.authorize = jest.fn((allowedRoles) => {
      return (req, res, next) => {
        if (allowedRoles.includes(req.user.role)) {
          next();
        } else {
          res.status(403).json({ success: false, message: 'Forbidden' });
        }
      };
    });

    // Mock rate limiter - always allow
    mockRateLimiter.rateLimiter = jest.fn(() => {
      return (req, res, next) => next();
    });

    // Mock controller methods
    mockController.createConsultation = jest.fn((req, res) => {
      res.status(201).json({
        success: true,
        message: 'Consultation created successfully',
        data: { _id: '507f1f77bcf86cd799439011', ...req.body }
      });
    });

    mockController.bookConsultationWithPackage = jest.fn((req, res) => {
      res.status(201).json({
        success: true,
        message: 'Consultation booked with package successfully',
        data: { _id: '507f1f77bcf86cd799439011', ...req.body }
      });
    });

    mockController.getMyConsultations = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        data: { consultations: [sampleConsultation], count: 1 }
      });
    });

    mockController.getConsultationById = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        data: sampleConsultation
      });
    });

    mockController.getConsultationsByConsultant = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        data: { consultations: [sampleConsultation], count: 1 }
      });
    });

    mockController.getUpcomingConsultations = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        data: { consultations: [sampleConsultation], count: 1 }
      });
    });

    mockController.cancelConsultation = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        message: 'Consultation cancelled successfully',
        data: { ...sampleConsultation, status: 'cancelled' }
      });
    });

    mockController.completeConsultation = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        message: 'Consultation completed successfully',
        data: { ...sampleConsultation, status: 'completed' }
      });
    });

    mockController.rescheduleConsultation = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        message: 'Consultation rescheduled successfully',
        data: { ...sampleConsultation, status: 'rescheduled' }
      });
    });

    mockController.submitClientFeedback = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        message: 'Feedback submitted successfully',
        data: sampleConsultation
      });
    });

    mockController.addNote = jest.fn((req, res) => {
      res.status(200).json({
        success: true,
        message: 'Note added successfully',
        data: sampleConsultation
      });
    });

    mockController.constructor = {
      createValidation: jest.fn(() => []),
      bookWithPackageValidation: jest.fn(() => []),
      feedbackValidation: jest.fn(() => [])
    };

    // Import routes after mocking
    const consultationRoutes = require('../../../servers/customer-services/modules/core-business/consultation-management/routes/consultation-routes');
    app.use('/api/consultations', consultationRoutes);

    // Error handler
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/consultations/book', () => {
    it('should create a consultation when authenticated', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Business Strategy Session',
        type: 'strategy_session',
        scheduledStart: '2026-01-15T10:00:00Z',
        scheduledEnd: '2026-01-15T11:00:00Z'
      };

      // Act
      const response = await request(app)
        .post('/api/consultations/book')
        .send(consultationData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(mockController.createConsultation).toHaveBeenCalled();
      expect(mockAuthMiddleware.authenticate).toHaveBeenCalled();
    });

    it('should apply rate limiting', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: '2026-01-15T10:00:00Z',
        scheduledEnd: '2026-01-15T11:00:00Z'
      };

      // Act
      await request(app)
        .post('/api/consultations/book')
        .send(consultationData)
        .expect(201);

      // Assert
      expect(mockRateLimiter.rateLimiter).toHaveBeenCalled();
    });
  });

  describe('POST /api/consultations/book-with-package', () => {
    it('should book consultation with package when authenticated', async () => {
      // Arrange
      const bookingData = {
        packageId: '507f1f77bcf86cd799439099',
        consultantId: sampleConsultant._id.toString(),
        scheduledStart: '2026-01-15T10:00:00Z',
        scheduledEnd: '2026-01-15T11:00:00Z',
        title: 'Package Session',
        type: 'strategy_session'
      };

      // Act
      const response = await request(app)
        .post('/api/consultations/book-with-package')
        .send(bookingData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(mockController.bookConsultationWithPackage).toHaveBeenCalled();
    });
  });

  describe('GET /api/consultations/me', () => {
    it('should retrieve authenticated user\'s consultations', async () => {
      // Act
      const response = await request(app)
        .get('/api/consultations/me')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.consultations).toBeDefined();
      expect(mockController.getMyConsultations).toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      // Arrange
      mockAuthMiddleware.authenticate = jest.fn((req, res, next) => {
        res.status(401).json({ success: false, message: 'Unauthorized' });
      });

      // Re-setup routes with new mock
      const consultationRoutes = require('../../../servers/customer-services/modules/core-business/consultation-management/routes/consultation-routes');
      app.use('/api/consultations-test', consultationRoutes);

      // Act
      const response = await request(app)
        .get('/api/consultations-test/me')
        .expect(401);

      // Assert
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/consultations/upcoming', () => {
    it('should retrieve upcoming consultations', async () => {
      // Act
      const response = await request(app)
        .get('/api/consultations/upcoming')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.consultations).toBeDefined();
      expect(mockController.getUpcomingConsultations).toHaveBeenCalled();
    });

    it('should apply authorization', async () => {
      // Act
      await request(app)
        .get('/api/consultations/upcoming')
        .expect(200);

      // Assert
      expect(mockAuthMiddleware.authorize).toHaveBeenCalled();
    });
  });

  describe('GET /api/consultations/:consultationId', () => {
    it('should retrieve consultation by ID', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();

      // Act
      const response = await request(app)
        .get(`/api/consultations/${consultationId}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(mockController.getConsultationById).toHaveBeenCalled();
    });
  });

  describe('PUT /api/consultations/:consultationId/cancel', () => {
    it('should cancel a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const cancellationData = {
        reason: 'Client requested cancellation'
      };

      // Act
      const response = await request(app)
        .put(`/api/consultations/${consultationId}/cancel`)
        .send(cancellationData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockController.cancelConsultation).toHaveBeenCalled();
    });
  });

  describe('PUT /api/consultations/:consultationId/complete', () => {
    it('should complete a consultation with consultant role', async () => {
      // Arrange - mock consultant user
      mockAuthMiddleware.authenticate = jest.fn((req, res, next) => {
        req.user = {
          id: sampleConsultant._id.toString(),
          role: 'consultant',
          email: 'consultant@example.com'
        };
        next();
      });

      const consultationId = sampleConsultation._id.toString();
      const outcomeData = {
        outcome: {
          status: 'successful',
          summary: 'Productive session',
          actionItems: []
        }
      };

      // Act
      const response = await request(app)
        .put(`/api/consultations/${consultationId}/complete`)
        .send(outcomeData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockController.completeConsultation).toHaveBeenCalled();
    });
  });

  describe('PUT /api/consultations/:consultationId/reschedule', () => {
    it('should reschedule a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const rescheduleData = {
        scheduledStart: '2026-01-20T10:00:00Z',
        scheduledEnd: '2026-01-20T11:00:00Z',
        reason: 'Consultant unavailable'
      };

      // Act
      const response = await request(app)
        .put(`/api/consultations/${consultationId}/reschedule`)
        .send(rescheduleData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockController.rescheduleConsultation).toHaveBeenCalled();
    });
  });

  describe('POST /api/consultations/:consultationId/feedback/client', () => {
    it('should submit client feedback', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const feedbackData = {
        rating: 5,
        comment: 'Excellent session'
      };

      // Act
      const response = await request(app)
        .post(`/api/consultations/${consultationId}/feedback/client`)
        .send(feedbackData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockController.submitClientFeedback).toHaveBeenCalled();
    });
  });

  describe('POST /api/consultations/:consultationId/notes', () => {
    it('should add note to consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const noteData = {
        content: 'Important discussion points'
      };

      // Act
      const response = await request(app)
        .post(`/api/consultations/${consultationId}/notes`)
        .send(noteData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(mockController.addNote).toHaveBeenCalled();
    });
  });

  describe('Authorization checks', () => {
    it('should deny access when user role is not authorized', async () => {
      // Arrange - mock unauthorized role
      mockAuthMiddleware.authorize = jest.fn((allowedRoles) => {
        return (req, res, next) => {
          res.status(403).json({ success: false, message: 'Forbidden' });
        };
      });

      // Re-setup routes
      jest.resetModules();
      const consultationRoutes = require('../../../servers/customer-services/modules/core-business/consultation-management/routes/consultation-routes');
      const testApp = express();
      testApp.use(express.json());
      testApp.use('/api/consultations', consultationRoutes);

      // Act
      const response = await request(testApp)
        .get('/api/consultations/me')
        .expect(403);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Forbidden');
    });
  });
});
