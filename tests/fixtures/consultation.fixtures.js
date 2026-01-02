/**
 * Test Fixtures for Consultation Tests
 * Provides sample data for consultation-related tests
 */

const mongoose = require('mongoose');

const createObjectId = () => new mongoose.Types.ObjectId();

/**
 * Sample consultant data
 */
const sampleConsultant = {
  _id: createObjectId(),
  firstName: 'John',
  lastName: 'Consultant',
  email: 'john.consultant@example.com',
  role: 'consultant',
  specialization: 'Business Strategy',
  status: {
    isActive: true,
    isVerified: true,
    isDeleted: false
  },
  availability: {
    timezone: 'UTC',
    workingHours: {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '09:00', end: '17:00' }]
    }
  },
  rating: {
    average: 4.8,
    count: 25
  }
};

/**
 * Sample client data
 */
const sampleClient = {
  _id: createObjectId(),
  firstName: 'Jane',
  lastName: 'Client',
  email: 'jane.client@example.com',
  role: 'client',
  status: {
    isActive: true,
    isVerified: true,
    isDeleted: false
  },
  credits: {
    balance: 1000,
    currency: 'USD'
  }
};

/**
 * Sample consultation data
 */
const sampleConsultation = {
  _id: createObjectId(),
  consultantId: sampleConsultant._id,
  clientId: sampleClient._id,
  title: 'Business Strategy Session',
  description: 'Initial consultation to discuss business strategy and growth plans',
  type: 'strategy_session',
  status: 'scheduled',
  scheduledStart: new Date('2026-01-15T10:00:00Z'),
  scheduledEnd: new Date('2026-01-15T11:00:00Z'),
  durationMinutes: 60,
  timezone: 'UTC',
  meetingLink: 'https://zoom.us/j/123456789',
  price: {
    amount: 200,
    currency: 'USD'
  },
  notes: {
    consultant: [],
    client: []
  },
  createdAt: new Date('2026-01-02T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z')
};

/**
 * Sample completed consultation with outcomes
 */
const sampleCompletedConsultation = {
  ...sampleConsultation,
  _id: createObjectId(),
  status: 'completed',
  actualStart: new Date('2026-01-15T10:02:00Z'),
  actualEnd: new Date('2026-01-15T11:05:00Z'),
  actualDurationMinutes: 63,
  outcome: {
    status: 'successful',
    summary: 'Productive session discussing business growth strategies',
    actionItems: [
      {
        id: createObjectId(),
        description: 'Develop marketing plan',
        assignedTo: sampleClient._id,
        status: 'pending',
        dueDate: new Date('2026-01-22T00:00:00Z')
      },
      {
        id: createObjectId(),
        description: 'Review financial projections',
        assignedTo: sampleConsultant._id,
        status: 'in_progress',
        dueDate: new Date('2026-01-20T00:00:00Z')
      }
    ],
    nextSteps: [
      'Schedule follow-up in 2 weeks',
      'Client to prepare Q1 financial report'
    ]
  },
  feedback: {
    client: {
      rating: 5,
      comment: 'Excellent session, very insightful and actionable advice',
      submittedAt: new Date('2026-01-15T12:00:00Z')
    }
  }
};

/**
 * Sample consultation package
 */
const sampleConsultationPackage = {
  _id: createObjectId(),
  name: 'Business Strategy Package',
  description: '5-session business strategy consultation package',
  consultantId: sampleConsultant._id,
  sessions: {
    total: 5,
    duration: 60,
    validityDays: 90
  },
  price: {
    amount: 900,
    currency: 'USD',
    discount: 10 // 10% discount vs individual sessions
  },
  isActive: true,
  features: [
    'Initial assessment',
    'Strategy development',
    'Implementation planning',
    'Progress review',
    'Final optimization'
  ],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};

/**
 * Sample deliverable
 */
const sampleDeliverable = {
  _id: createObjectId(),
  consultationId: sampleConsultation._id,
  title: 'Business Strategy Document',
  description: 'Comprehensive business strategy and action plan',
  type: 'document',
  status: 'in_progress',
  dueDate: new Date('2026-01-20T00:00:00Z'),
  files: [],
  createdAt: new Date('2026-01-15T11:00:00Z'),
  updatedAt: new Date('2026-01-15T11:00:00Z')
};

/**
 * Create a new consultation with custom data
 */
const createConsultation = (overrides = {}) => ({
  ...sampleConsultation,
  _id: createObjectId(),
  ...overrides
});

/**
 * Create a new consultant with custom data
 */
const createConsultant = (overrides = {}) => ({
  ...sampleConsultant,
  _id: createObjectId(),
  ...overrides
});

/**
 * Create a new client with custom data
 */
const createClient = (overrides = {}) => ({
  ...sampleClient,
  _id: createObjectId(),
  ...overrides
});

/**
 * Create a new package with custom data
 */
const createPackage = (overrides = {}) => ({
  ...sampleConsultationPackage,
  _id: createObjectId(),
  ...overrides
});

module.exports = {
  sampleConsultant,
  sampleClient,
  sampleConsultation,
  sampleCompletedConsultation,
  sampleConsultationPackage,
  sampleDeliverable,
  createConsultation,
  createConsultant,
  createClient,
  createPackage
};
