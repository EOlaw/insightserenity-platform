/**
 * Unit Tests for Consultation Service
 * Tests all core functionality of the consultation management service
 */

const { createMockModel, createMockDocument, createObjectId } = require('../../mocks/database.mock');
const {
  sampleConsultant,
  sampleClient,
  sampleConsultation,
  createConsultation,
  createConsultant,
  createClient
} = require('../../fixtures/consultation.fixtures');

// Mock dependencies
jest.mock('../../../shared/lib/database');
jest.mock('../../../servers/customer-services/modules/core-business/notifications/services/notification-service');
jest.mock('../../../servers/customer-services/modules/core-business/analytics/services/analytics-service');
jest.mock('../../../servers/customer-services/modules/core-business/billing-management/services/payment-service');

describe('ConsultationService', () => {
  let ConsultationService;
  let consultationService;
  let mockDatabase;
  let mockConsultationModel;
  let mockConsultantModel;
  let mockClientModel;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock models
    mockConsultationModel = createMockModel('Consultation');
    mockConsultantModel = createMockModel('Consultant');
    mockClientModel = createMockModel('Client');

    // Mock database service
    mockDatabase = {
      getDatabaseService: jest.fn().mockReturnValue({
        getModel: jest.fn((modelName) => {
          if (modelName === 'Consultation') return mockConsultationModel;
          if (modelName === 'Consultant') return mockConsultantModel;
          if (modelName === 'Client') return mockClientModel;
          return createMockModel(modelName);
        })
      })
    };

    // Mock the database module
    require('../../../shared/lib/database').getDatabaseService = mockDatabase.getDatabaseService;

    // Import the service after mocking
    ConsultationService = require('../../../servers/customer-services/modules/core-business/consultation-management/services/consultation-service');
    consultationService = new ConsultationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createConsultation', () => {
    it('should successfully create a consultation when all data is valid', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Business Strategy Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z'),
        description: 'Initial consultation'
      };

      const mockConsultant = createMockDocument(sampleConsultant);
      const mockClient = createMockDocument(sampleClient);
      const mockCreatedConsultation = createMockDocument({
        ...consultationData,
        _id: createObjectId(),
        status: 'scheduled',
        durationMinutes: 60
      });

      // Mock model methods
      mockConsultantModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultant)
      });

      mockClientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockClient)
      });

      mockConsultationModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]) // No conflicts
      });

      mockConsultationModel.create.mockResolvedValue(mockCreatedConsultation);

      // Act
      const result = await consultationService.createConsultation(consultationData);

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(mockConsultantModel.findById).toHaveBeenCalledWith(consultationData.consultantId);
      expect(mockClientModel.findById).toHaveBeenCalledWith(consultationData.clientId);
      expect(mockConsultationModel.create).toHaveBeenCalled();
    });

    it('should throw error when consultant is not found', async () => {
      // Arrange
      const consultationData = {
        consultantId: createObjectId().toString(),
        clientId: sampleClient._id.toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z')
      };

      mockConsultantModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null)
      });

      // Act & Assert
      await expect(
        consultationService.createConsultation(consultationData)
      ).rejects.toThrow('Consultant not found');
    });

    it('should throw error when client is not found', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: createObjectId().toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z')
      };

      const mockConsultant = createMockDocument(sampleConsultant);

      mockConsultantModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultant)
      });

      mockClientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null)
      });

      // Act & Assert
      await expect(
        consultationService.createConsultation(consultationData)
      ).rejects.toThrow('Client not found');
    });

    it('should throw error when consultant is not active', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z')
      };

      const inactiveConsultant = createMockDocument({
        ...sampleConsultant,
        status: {
          isActive: false,
          isVerified: true,
          isDeleted: false
        }
      });

      mockConsultantModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(inactiveConsultant)
      });

      // Act & Assert
      await expect(
        consultationService.createConsultation(consultationData)
      ).rejects.toThrow('Consultant is not active');
    });

    it('should throw error when required fields are missing', async () => {
      // Arrange
      const incompleteData = {
        consultantId: sampleConsultant._id.toString(),
        title: 'Test Session'
        // Missing required fields
      };

      // Act & Assert
      await expect(
        consultationService.createConsultation(incompleteData)
      ).rejects.toThrow();
    });

    it('should detect and throw error on scheduling conflicts', async () => {
      // Arrange
      const consultationData = {
        consultantId: sampleConsultant._id.toString(),
        clientId: sampleClient._id.toString(),
        title: 'Test Session',
        type: 'strategy_session',
        scheduledStart: new Date('2026-01-15T10:00:00Z'),
        scheduledEnd: new Date('2026-01-15T11:00:00Z')
      };

      const mockConsultant = createMockDocument(sampleConsultant);
      const mockClient = createMockDocument(sampleClient);

      // Mock a conflicting consultation
      const conflictingConsultation = createMockDocument({
        ...sampleConsultation,
        scheduledStart: new Date('2026-01-15T10:30:00Z'),
        scheduledEnd: new Date('2026-01-15T11:30:00Z')
      });

      mockConsultantModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultant)
      });

      mockClientModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockClient)
      });

      mockConsultationModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([conflictingConsultation])
      });

      // Act & Assert
      await expect(
        consultationService.createConsultation(consultationData)
      ).rejects.toThrow();
    });
  });

  describe('getConsultationById', () => {
    it('should successfully retrieve a consultation by ID', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const mockConsultation = createMockDocument(sampleConsultation);

      mockConsultationModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockConsultation)
      });

      // Act
      const result = await consultationService.getConsultationById(consultationId);

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toEqual(sampleConsultation._id);
      expect(mockConsultationModel.findById).toHaveBeenCalledWith(consultationId);
    });

    it('should throw error when consultation is not found', async () => {
      // Arrange
      const consultationId = createObjectId().toString();

      mockConsultationModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      });

      // Act & Assert
      await expect(
        consultationService.getConsultationById(consultationId)
      ).rejects.toThrow('Consultation not found');
    });
  });

  describe('updateConsultationStatus', () => {
    it('should successfully update consultation status', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const newStatus = 'confirmed';
      const mockConsultation = createMockDocument(sampleConsultation);
      const updatedConsultation = createMockDocument({
        ...sampleConsultation,
        status: newStatus
      });

      mockConsultationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultation)
      });

      mockConsultationModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedConsultation)
      });

      // Act
      const result = await consultationService.updateConsultationStatus(
        consultationId,
        newStatus
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(newStatus);
      expect(mockConsultationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        consultationId,
        expect.objectContaining({ status: newStatus }),
        expect.any(Object)
      );
    });

    it('should throw error for invalid status', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const invalidStatus = 'invalid_status';

      // Act & Assert
      await expect(
        consultationService.updateConsultationStatus(consultationId, invalidStatus)
      ).rejects.toThrow();
    });
  });

  describe('cancelConsultation', () => {
    it('should successfully cancel a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const reason = 'Client requested cancellation';
      const mockConsultation = createMockDocument(sampleConsultation);
      const cancelledConsultation = createMockDocument({
        ...sampleConsultation,
        status: 'cancelled',
        cancellation: {
          reason,
          cancelledAt: new Date(),
          cancelledBy: sampleClient._id
        }
      });

      mockConsultationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultation)
      });

      mockConsultationModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cancelledConsultation)
      });

      // Act
      const result = await consultationService.cancelConsultation(
        consultationId,
        { reason, userId: sampleClient._id.toString() }
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('cancelled');
      expect(mockConsultationModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should throw error when consultation is already completed', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const completedConsultation = createMockDocument({
        ...sampleConsultation,
        status: 'completed'
      });

      mockConsultationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(completedConsultation)
      });

      // Act & Assert
      await expect(
        consultationService.cancelConsultation(consultationId, { reason: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('getConsultationsByConsultant', () => {
    it('should retrieve all consultations for a consultant', async () => {
      // Arrange
      const consultantId = sampleConsultant._id.toString();
      const mockConsultations = [
        createMockDocument(sampleConsultation),
        createMockDocument(createConsultation({ title: 'Second Session' }))
      ];

      mockConsultationModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockConsultations)
      });

      // Act
      const result = await consultationService.getConsultationsByConsultant(consultantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(mockConsultationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ consultantId })
      );
    });

    it('should filter consultations by status', async () => {
      // Arrange
      const consultantId = sampleConsultant._id.toString();
      const status = 'scheduled';
      const mockConsultations = [createMockDocument(sampleConsultation)];

      mockConsultationModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockConsultations)
      });

      // Act
      const result = await consultationService.getConsultationsByConsultant(
        consultantId,
        { status }
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockConsultationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ consultantId, status })
      );
    });
  });

  describe('addConsultationNotes', () => {
    it('should successfully add notes to a consultation', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const notes = 'Important discussion points from today\'s session';
      const userId = sampleConsultant._id.toString();
      const mockConsultation = createMockDocument(sampleConsultation);

      mockConsultationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultation)
      });

      mockConsultation.save.mockResolvedValue({
        ...mockConsultation,
        notes: {
          consultant: [{ content: notes, createdBy: userId, createdAt: new Date() }],
          client: []
        }
      });

      // Act
      const result = await consultationService.addConsultationNotes(
        consultationId,
        notes,
        { userId, userRole: 'consultant' }
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockConsultation.save).toHaveBeenCalled();
    });
  });

  describe('completeConsultation', () => {
    it('should successfully complete a consultation with outcomes', async () => {
      // Arrange
      const consultationId = sampleConsultation._id.toString();
      const outcomeData = {
        status: 'successful',
        summary: 'Productive session',
        actionItems: [
          {
            description: 'Follow-up task',
            assignedTo: sampleClient._id.toString(),
            dueDate: new Date('2026-01-20T00:00:00Z')
          }
        ]
      };

      const mockConsultation = createMockDocument({
        ...sampleConsultation,
        status: 'in_progress'
      });

      const completedConsultation = createMockDocument({
        ...sampleConsultation,
        status: 'completed',
        outcome: outcomeData,
        actualEnd: new Date()
      });

      mockConsultationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockConsultation)
      });

      mockConsultationModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(completedConsultation)
      });

      // Act
      const result = await consultationService.completeConsultation(
        consultationId,
        outcomeData
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(mockConsultationModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });
});
