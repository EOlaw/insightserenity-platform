/**
 * Unit Tests for Consultation Controller
 * Tests all HTTP request handlers for consultation management
 */

const { createMockRequest, createMockResponse, createMockNext, getResponseData, isSuccessResponse, isErrorResponse } = require('../../mocks/express.mock');
const { sampleConsultation, sampleConsultant, sampleClient, createConsultation } = require('../../fixtures/consultation.fixtures');

// Mock the consultation service
jest.mock('../../../servers/customer-services/modules/core-business/consultation-management/services/consultation-service');

describe('ConsultationController', () => {
  let ConsultationController;
  let consultationController;
  let mockConsultationService;
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Import mocked consultation service
    mockConsultationService = require('../../../servers/customer-services/modules/core-business/consultation-management/services/consultation-service');

    // Mock service methods
    mockConsultationService.createConsultation = jest.fn();
    mockConsultationService.getConsultationById = jest.fn();
    mockConsultationService.updateConsultation = jest.fn();
    mockConsultationService.cancelConsultation = jest.fn();
    mockConsultationService.completeConsultation = jest.fn();
    mockConsultationService.getConsultationsByConsultant = jest.fn();
    mockConsultationService.getConsultationsByClient = jest.fn();
    mockConsultationService.addConsultationNotes = jest.fn();

    // Import controller after mocking
    ConsultationController = require('../../../servers/customer-services/modules/core-business/consultation-management/controllers/consultation-controller');
    consultationController = new ConsultationController();

    // Create mock request, response, and next
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createConsultation', () => {
    it('should successfully create a consultation and return 201', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Business Strategy Session',
        type: 'strategy_session',
        scheduledStart: '2026-01-15T10:00:00Z',
        scheduledEnd: '2026-01-15T11:00:00Z',
        description: 'Initial consultation'
      };

      req.body = consultationData;
      req.user = {
        id: sampleClient._id.toString(),
        role: 'client'
      };

      const createdConsultation = {
        _id: '507f1f77bcf86cd799439011',
        ...consultationData,
        status: 'scheduled',
        durationMinutes: 60
      };

      mockConsultationService.createConsultation.mockResolvedValue(createdConsultation);

      // Act
      await consultationController.createConsultation(req, res, next);

      // Assert
      expect(mockConsultationService.createConsultation).toHaveBeenCalledWith(
        expect.objectContaining(consultationData),
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ _id: createdConsultation._id })
        })
      );
    });

    it('should return 400 when required fields are missing', async () => {
      // Arrange
      req.body = {
        title: 'Test Session'
        // Missing required fields
      };

      // Mock validation error
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      mockConsultationService.createConsultation.mockRejectedValue(validationError);

      // Act
      await consultationController.createConsultation(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call next with error when service throws', async () => {
      // Arrange
      req.body = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: '2026-01-15T10:00:00Z',
        scheduledEnd: '2026-01-15T11:00:00Z'
      };

      const serviceError = new Error('Service error');
      mockConsultationService.createConsultation.mockRejectedValue(serviceError);

      // Act
      await consultationController.createConsultation(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });

  describe('getConsultationById', () => {
    it('should successfully retrieve a consultation by ID', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.user = {
        id: sampleClient._id.toString(),
        role: 'client'
      };

      mockConsultationService.getConsultationById.mockResolvedValue(sampleConsultation);

      // Act
      await consultationController.getConsultationById(req, res, next);

      // Assert
      expect(mockConsultationService.getConsultationById).toHaveBeenCalledWith(
        consultationId,
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: sampleConsultation
        })
      );
    });

    it('should return 404 when consultation is not found', async () => {
      // Arrange
      req.params = { consultationId: '507f1f77bcf86cd799439099' };

      const notFoundError = new Error('Consultation not found');
      notFoundError.statusCode = 404;
      mockConsultationService.getConsultationById.mockRejectedValue(notFoundError);

      // Act
      await consultationController.getConsultationById(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(notFoundError);
    });
  });

  describe('getConsultationsByConsultant', () => {
    it('should retrieve all consultations for a consultant', async () => {
      // Arrange
      const consultantId = sampleConsultant._id.toString();
      req.params = { consultantId };
      req.query = { status: 'scheduled' };
      req.user = {
        id: consultantId,
        role: 'consultant'
      };

      const consultations = [
        sampleConsultation,
        createConsultation({ title: 'Second Session' })
      ];

      mockConsultationService.getConsultationsByConsultant.mockResolvedValue(consultations);

      // Act
      await consultationController.getConsultationsByConsultant(req, res, next);

      // Assert
      expect(mockConsultationService.getConsultationsByConsultant).toHaveBeenCalledWith(
        consultantId,
        expect.objectContaining({ status: 'scheduled' })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consultations,
            count: 2
          })
        })
      );
    });

    it('should return empty array when no consultations found', async () => {
      // Arrange
      req.params = { consultantId: sampleConsultant._id.toString() };
      req.user = {
        id: sampleConsultant._id.toString(),
        role: 'consultant'
      };

      mockConsultationService.getConsultationsByConsultant.mockResolvedValue([]);

      // Act
      await consultationController.getConsultationsByConsultant(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consultations: [],
            count: 0
          })
        })
      );
    });
  });

  describe('cancelConsultation', () => {
    it('should successfully cancel a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.body = {
        reason: 'Client requested cancellation'
      };
      req.user = {
        id: sampleClient._id.toString(),
        role: 'client'
      };

      const cancelledConsultation = {
        ...sampleConsultation,
        status: 'cancelled',
        cancellation: {
          reason: req.body.reason,
          cancelledAt: new Date(),
          cancelledBy: req.user.id
        }
      };

      mockConsultationService.cancelConsultation.mockResolvedValue(cancelledConsultation);

      // Act
      await consultationController.cancelConsultation(req, res, next);

      // Assert
      expect(mockConsultationService.cancelConsultation).toHaveBeenCalledWith(
        consultationId,
        expect.objectContaining({
          reason: req.body.reason,
          userId: req.user.id
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'cancelled'
          })
        })
      );
    });

    it('should return error when cancelling already completed consultation', async () => {
      // Arrange
      req.params = { consultationId: sampleConsultation._id.toString() };
      req.body = { reason: 'Test' };
      req.user = { id: sampleClient._id.toString(), role: 'client' };

      const error = new Error('Cannot cancel completed consultation');
      error.statusCode = 400;
      mockConsultationService.cancelConsultation.mockRejectedValue(error);

      // Act
      await consultationController.cancelConsultation(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('completeConsultation', () => {
    it('should successfully complete a consultation with outcomes', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.body = {
        outcome: {
          status: 'successful',
          summary: 'Productive session',
          actionItems: [
            {
              description: 'Follow-up task',
              assignedTo: sampleClient._id.toString(),
              dueDate: '2026-01-20T00:00:00Z'
            }
          ],
          nextSteps: ['Schedule follow-up']
        }
      };
      req.user = {
        id: sampleConsultant._id.toString(),
        role: 'consultant'
      };

      const completedConsultation = {
        ...sampleConsultation,
        status: 'completed',
        outcome: req.body.outcome,
        actualEnd: new Date()
      };

      mockConsultationService.completeConsultation.mockResolvedValue(completedConsultation);

      // Act
      await consultationController.completeConsultation(req, res, next);

      // Assert
      expect(mockConsultationService.completeConsultation).toHaveBeenCalledWith(
        consultationId,
        expect.objectContaining(req.body.outcome),
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'completed'
          })
        })
      );
    });
  });

  describe('submitClientFeedback', () => {
    it('should successfully submit client feedback', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.body = {
        rating: 5,
        comment: 'Excellent session, very helpful'
      };
      req.user = {
        id: sampleClient._id.toString(),
        role: 'client'
      };

      const updatedConsultation = {
        ...sampleConsultation,
        feedback: {
          client: {
            rating: req.body.rating,
            comment: req.body.comment,
            submittedAt: new Date()
          }
        }
      };

      mockConsultationService.submitClientFeedback = jest.fn().mockResolvedValue(updatedConsultation);

      // Act
      await consultationController.submitClientFeedback(req, res, next);

      // Assert
      expect(mockConsultationService.submitClientFeedback).toHaveBeenCalledWith(
        consultationId,
        expect.objectContaining({
          rating: req.body.rating,
          comment: req.body.comment
        }),
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should return error when rating is out of range', async () => {
      // Arrange
      req.params = { consultationId: sampleConsultation._id.toString() };
      req.body = {
        rating: 6, // Invalid rating
        comment: 'Test'
      };
      req.user = { id: sampleClient._id.toString(), role: 'client' };

      const validationError = new Error('Rating must be between 1 and 5');
      validationError.statusCode = 400;
      mockConsultationService.submitClientFeedback = jest.fn().mockRejectedValue(validationError);

      // Act
      await consultationController.submitClientFeedback(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(validationError);
    });
  });

  describe('addNote', () => {
    it('should successfully add a note to consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.body = {
        content: 'Important discussion points from the session'
      };
      req.user = {
        id: sampleConsultant._id.toString(),
        role: 'consultant'
      };

      const updatedConsultation = {
        ...sampleConsultation,
        notes: {
          consultant: [
            {
              content: req.body.content,
              createdBy: req.user.id,
              createdAt: new Date()
            }
          ],
          client: []
        }
      };

      mockConsultationService.addConsultationNotes.mockResolvedValue(updatedConsultation);

      // Act
      await consultationController.addNote(req, res, next);

      // Assert
      expect(mockConsultationService.addConsultationNotes).toHaveBeenCalledWith(
        consultationId,
        req.body.content,
        expect.objectContaining({
          userId: req.user.id,
          userRole: req.user.role
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('getUpcomingConsultations', () => {
    it('should retrieve upcoming consultations for authenticated user', async () => {
      // Arrange
      req.user = {
        id: sampleConsultant._id.toString(),
        role: 'consultant'
      };
      req.query = { limit: '10' };

      const upcomingConsultations = [
        sampleConsultation,
        createConsultation({ scheduledStart: new Date('2026-01-20T10:00:00Z') })
      ];

      mockConsultationService.getUpcomingConsultations = jest.fn().mockResolvedValue(upcomingConsultations);

      // Act
      await consultationController.getUpcomingConsultations(req, res, next);

      // Assert
      expect(mockConsultationService.getUpcomingConsultations).toHaveBeenCalledWith(
        req.user.id,
        expect.objectContaining({ limit: 10 })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            consultations: upcomingConsultations,
            count: 2
          })
        })
      );
    });
  });

  describe('rescheduleConsultation', () => {
    it('should successfully reschedule a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      req.params = { consultationId };
      req.body = {
        scheduledStart: '2026-01-20T10:00:00Z',
        scheduledEnd: '2026-01-20T11:00:00Z',
        reason: 'Consultant unavailable on original date'
      };
      req.user = {
        id: sampleConsultant._id.toString(),
        role: 'consultant'
      };

      const rescheduledConsultation = {
        ...sampleConsultation,
        scheduledStart: new Date(req.body.scheduledStart),
        scheduledEnd: new Date(req.body.scheduledEnd),
        status: 'rescheduled',
        rescheduleHistory: [
          {
            oldStart: sampleConsultation.scheduledStart,
            oldEnd: sampleConsultation.scheduledEnd,
            newStart: new Date(req.body.scheduledStart),
            newEnd: new Date(req.body.scheduledEnd),
            reason: req.body.reason,
            rescheduledBy: req.user.id,
            rescheduledAt: new Date()
          }
        ]
      };

      mockConsultationService.rescheduleConsultation = jest.fn().mockResolvedValue(rescheduledConsultation);

      // Act
      await consultationController.rescheduleConsultation(req, res, next);

      // Assert
      expect(mockConsultationService.rescheduleConsultation).toHaveBeenCalledWith(
        consultationId,
        expect.objectContaining({
          scheduledStart: req.body.scheduledStart,
          scheduledEnd: req.body.scheduledEnd,
          reason: req.body.reason
        }),
        expect.any(Object)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });
});
