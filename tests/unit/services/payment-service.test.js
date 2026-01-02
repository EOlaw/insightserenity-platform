/**
 * Unit Tests for Payment Service
 * Tests all core functionality of the payment and billing service
 */

const { createMockModel, createMockDocument, createObjectId } = require('../../mocks/database.mock');

// Mock dependencies
jest.mock('../../../shared/lib/database');
jest.mock('stripe');

describe('PaymentService', () => {
  let PaymentService;
  let paymentService;
  let mockDatabase;
  let mockPaymentModel;
  let mockStripe;

  const samplePayment = {
    _id: createObjectId(),
    userId: createObjectId(),
    amount: 200,
    currency: 'USD',
    status: 'pending',
    method: 'credit_card',
    type: 'consultation',
    referenceId: createObjectId(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock payment model
    mockPaymentModel = createMockModel('Payment');

    // Mock Stripe
    mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_123456',
          client_secret: 'secret_123',
          status: 'requires_payment_method'
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'pi_123456',
          status: 'succeeded'
        }),
        confirm: jest.fn().mockResolvedValue({
          id: 'pi_123456',
          status: 'succeeded'
        }),
        cancel: jest.fn().mockResolvedValue({
          id: 'pi_123456',
          status: 'canceled'
        })
      },
      refunds: {
        create: jest.fn().mockResolvedValue({
          id: 're_123456',
          status: 'succeeded',
          amount: 200
        })
      },
      customers: {
        create: jest.fn().mockResolvedValue({
          id: 'cus_123456'
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'cus_123456'
        })
      }
    };

    // Mock database service
    mockDatabase = {
      getDatabaseService: jest.fn().mockReturnValue({
        getModel: jest.fn(() => mockPaymentModel)
      })
    };

    // Mock the dependencies
    require('../../../shared/lib/database').getDatabaseService = mockDatabase.getDatabaseService;
    jest.mock('stripe', () => jest.fn(() => mockStripe));

    // Import the service after mocking
    PaymentService = require('../../../servers/customer-services/modules/core-business/billing-management/services/payment-service');
    paymentService = new PaymentService();
    paymentService.stripe = mockStripe; // Inject mock stripe
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should successfully create a payment intent', async () => {
      // Arrange
      const paymentData = {
        userId: samplePayment.userId.toString(),
        amount: 200,
        currency: 'USD',
        type: 'consultation',
        referenceId: samplePayment.referenceId.toString()
      };

      const createdPayment = createMockDocument({
        ...samplePayment,
        stripePaymentIntentId: 'pi_123456',
        stripeClientSecret: 'secret_123'
      });

      mockPaymentModel.create.mockResolvedValue(createdPayment);

      // Act
      const result = await paymentService.createPaymentIntent(paymentData);

      // Assert
      expect(result).toBeDefined();
      expect(result.stripePaymentIntentId).toBe('pi_123456');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 20000, // Amount in cents
          currency: 'usd'
        })
      );
      expect(mockPaymentModel.create).toHaveBeenCalled();
    });

    it('should throw error when amount is invalid', async () => {
      // Arrange
      const paymentData = {
        userId: samplePayment.userId.toString(),
        amount: -50, // Invalid amount
        currency: 'USD',
        type: 'consultation'
      };

      // Act & Assert
      await expect(
        paymentService.createPaymentIntent(paymentData)
      ).rejects.toThrow();
    });

    it('should throw error when currency is invalid', async () => {
      // Arrange
      const paymentData = {
        userId: samplePayment.userId.toString(),
        amount: 200,
        currency: 'INVALID', // Invalid currency
        type: 'consultation'
      };

      // Act & Assert
      await expect(
        paymentService.createPaymentIntent(paymentData)
      ).rejects.toThrow();
    });
  });

  describe('confirmPayment', () => {
    it('should successfully confirm a payment', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const mockPayment = createMockDocument({
        ...samplePayment,
        stripePaymentIntentId: 'pi_123456'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      const updatedPayment = createMockDocument({
        ...mockPayment,
        status: 'succeeded'
      });

      mockPaymentModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedPayment)
      });

      // Act
      const result = await paymentService.confirmPayment(paymentId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('succeeded');
      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_123456');
    });

    it('should throw error when payment is not found', async () => {
      // Arrange
      const paymentId = createObjectId().toString();

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null)
      });

      // Act & Assert
      await expect(
        paymentService.confirmPayment(paymentId)
      ).rejects.toThrow('Payment not found');
    });

    it('should throw error when payment is already succeeded', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const succeededPayment = createMockDocument({
        ...samplePayment,
        status: 'succeeded'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(succeededPayment)
      });

      // Act & Assert
      await expect(
        paymentService.confirmPayment(paymentId)
      ).rejects.toThrow();
    });
  });

  describe('processRefund', () => {
    it('should successfully process a refund', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const refundAmount = 200;
      const reason = 'Customer requested refund';

      const mockPayment = createMockDocument({
        ...samplePayment,
        status: 'succeeded',
        stripePaymentIntentId: 'pi_123456'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      const updatedPayment = createMockDocument({
        ...mockPayment,
        status: 'refunded',
        refund: {
          amount: refundAmount,
          reason,
          stripeRefundId: 're_123456',
          refundedAt: new Date()
        }
      });

      mockPaymentModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedPayment)
      });

      // Act
      const result = await paymentService.processRefund(paymentId, refundAmount, reason);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('refunded');
      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_123456',
          amount: 20000 // Amount in cents
        })
      );
    });

    it('should throw error when refund amount exceeds payment amount', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const refundAmount = 500; // More than payment amount

      const mockPayment = createMockDocument({
        ...samplePayment,
        amount: 200,
        status: 'succeeded'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      // Act & Assert
      await expect(
        paymentService.processRefund(paymentId, refundAmount, 'Test')
      ).rejects.toThrow();
    });

    it('should throw error when payment is not succeeded', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const refundAmount = 100;

      const mockPayment = createMockDocument({
        ...samplePayment,
        status: 'pending'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      // Act & Assert
      await expect(
        paymentService.processRefund(paymentId, refundAmount, 'Test')
      ).rejects.toThrow();
    });
  });

  describe('getPaymentById', () => {
    it('should successfully retrieve a payment by ID', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const mockPayment = createMockDocument(samplePayment);

      mockPaymentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      // Act
      const result = await paymentService.getPaymentById(paymentId);

      // Assert
      expect(result).toBeDefined();
      expect(result._id).toEqual(samplePayment._id);
      expect(mockPaymentModel.findById).toHaveBeenCalledWith(paymentId);
    });

    it('should throw error when payment is not found', async () => {
      // Arrange
      const paymentId = createObjectId().toString();

      mockPaymentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null)
      });

      // Act & Assert
      await expect(
        paymentService.getPaymentById(paymentId)
      ).rejects.toThrow('Payment not found');
    });
  });

  describe('getPaymentsByUser', () => {
    it('should retrieve all payments for a user', async () => {
      // Arrange
      const userId = samplePayment.userId.toString();
      const mockPayments = [
        createMockDocument(samplePayment),
        createMockDocument({ ...samplePayment, _id: createObjectId(), amount: 150 })
      ];

      mockPaymentModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPayments)
      });

      // Act
      const result = await paymentService.getPaymentsByUser(userId);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(mockPaymentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId })
      );
    });

    it('should filter payments by status', async () => {
      // Arrange
      const userId = samplePayment.userId.toString();
      const status = 'succeeded';
      const mockPayments = [createMockDocument({ ...samplePayment, status })];

      mockPaymentModel.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPayments)
      });

      // Act
      const result = await paymentService.getPaymentsByUser(userId, { status });

      // Assert
      expect(result).toBeDefined();
      expect(mockPaymentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ userId, status })
      );
    });
  });

  describe('cancelPayment', () => {
    it('should successfully cancel a payment', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const mockPayment = createMockDocument({
        ...samplePayment,
        stripePaymentIntentId: 'pi_123456',
        status: 'pending'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPayment)
      });

      const cancelledPayment = createMockDocument({
        ...mockPayment,
        status: 'canceled'
      });

      mockPaymentModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(cancelledPayment)
      });

      // Act
      const result = await paymentService.cancelPayment(paymentId);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_123456');
    });

    it('should throw error when payment is already succeeded', async () => {
      // Arrange
      const paymentId = samplePayment._id.toString();
      const succeededPayment = createMockDocument({
        ...samplePayment,
        status: 'succeeded'
      });

      mockPaymentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(succeededPayment)
      });

      // Act & Assert
      await expect(
        paymentService.cancelPayment(paymentId)
      ).rejects.toThrow();
    });
  });

  describe('createStripeCustomer', () => {
    it('should successfully create a Stripe customer', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        name: 'Test User'
      };

      // Act
      const result = await paymentService.createStripeCustomer(userData);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('cus_123456');
      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: userData.email,
          name: userData.name
        })
      );
    });
  });
});
