'use strict';

/**
 * @fileoverview Enhanced consultant availability model with comprehensive scheduling and capacity management
 * @module servers/customer-services/modules/core-business/consultants/models/consultant-availability-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../base-model');
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const dateHelper = require('../../../../../utils/helpers/date-helper');

/**
 * Enhanced consultant availability schema for comprehensive scheduling and resource management
 */
const consultantAvailabilitySchemaDefinition = {
  // ==================== Core Identity ====================
  availabilityId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^AVL-[A-Z0-9]{8}$/,
    index: true,
    immutable: true
  },

  consultantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consultant',
    required: true,
    index: true
  },

  // ==================== Multi-Tenancy ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Current Status ====================
  currentStatus: {
    status: {
      type: String,
      enum: ['available', 'partially_available', 'busy', 'on_project', 'on_leave', 'blocked', 'unavailable'],
      default: 'available',
      required: true,
      index: true
    },
    effectiveFrom: {
      type: Date,
      default: Date.now
    },
    effectiveUntil: Date,
    reason: String,
    details: String,
    autoUpdate: {
      type: Boolean,
      default: true
    },
    manualOverride: {
      active: Boolean,
      setBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      setAt: Date,
      expiresAt: Date
    }
  },

  // ==================== Capacity Configuration ====================
  capacity: {
    standard: {
      hoursPerDay: {
        type: Number,
        default: 8,
        min: 0,
        max: 24
      },
      daysPerWeek: {
        type: Number,
        default: 5,
        min: 0,
        max: 7
      },
      hoursPerWeek: {
        type: Number,
        default: 40,
        min: 0,
        max: 168
      },
      hoursPerMonth: {
        type: Number,
        default: 160,
        min: 0
      },
      utilizationTarget: {
        type: Number,
        default: 80,
        min: 0,
        max: 100
      }
    },
    current: {
      availableHours: {
        today: Number,
        thisWeek: Number,
        thisMonth: Number,
        nextMonth: Number
      },
      allocatedHours: {
        today: Number,
        thisWeek: Number,
        thisMonth: Number,
        nextMonth: Number
      },
      utilization: {
        current: {
          type: Number,
          min: 0,
          max: 100
        },
        projected: {
          nextWeek: Number,
          nextMonth: Number,
          nextQuarter: Number
        },
        trend: {
          type: String,
          enum: ['increasing', 'stable', 'decreasing']
        }
      },
      lastCalculated: Date
    },
    buffers: {
      adminTime: {
        percentage: {
          type: Number,
          default: 10,
          min: 0,
          max: 100
        },
        hoursPerWeek: Number
      },
      trainingTime: {
        percentage: {
          type: Number,
          default: 10,
          min: 0,
          max: 100
        },
        hoursPerWeek: Number
      },
      bufferTime: {
        percentage: {
          type: Number,
          default: 5,
          min: 0,
          max: 100
        },
        hoursPerWeek: Number
      }
    },
    constraints: {
      maxConsecutiveHours: {
        type: Number,
        default: 10
      },
      maxProjectsSimultaneous: {
        type: Number,
        default: 3
      },
      minBreakBetweenProjects: {
        hours: Number,
        days: Number
      },
      maxOvertimePerWeek: {
        type: Number,
        default: 10
      },
      maxTravelDaysPerMonth: {
        type: Number,
        default: 10
      }
    }
  },

  // ==================== Schedule & Calendar ====================
  schedule: {
    workingHours: {
      timezone: {
        type: String,
        default: 'UTC'
      },
      regular: {
        monday: {
          isWorking: { type: Boolean, default: true },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: [{
            start: String,
            end: String,
            type: String
          }]
        },
        tuesday: {
          isWorking: { type: Boolean, default: true },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: [{
            start: String,
            end: String,
            type: String
          }]
        },
        wednesday: {
          isWorking: { type: Boolean, default: true },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: [{
            start: String,
            end: String,
            type: String
          }]
        },
        thursday: {
          isWorking: { type: Boolean, default: true },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: [{
            start: String,
            end: String,
            type: String
          }]
        },
        friday: {
          isWorking: { type: Boolean, default: true },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: [{
            start: String,
            end: String,
            type: String
          }]
        },
        saturday: {
          isWorking: { type: Boolean, default: false },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: []
        },
        sunday: {
          isWorking: { type: Boolean, default: false },
          start: { type: String, default: '09:00' },
          end: { type: String, default: '17:00' },
          breaks: []
        }
      },
      exceptions: [{
        date: Date,
        isWorking: Boolean,
        start: String,
        end: String,
        reason: String
      }],
      flexibility: {
        flexibleHours: Boolean,
        coreHours: {
          start: String,
          end: String
        },
        remoteAvailable: Boolean,
        weekendAvailable: Boolean,
        eveningAvailable: Boolean,
        emergencyAvailable: Boolean
      }
    },
    calendar: [{
      date: {
        type: Date,
        required: true,
        index: true
      },
      dayType: {
        type: String,
        enum: ['working', 'weekend', 'holiday', 'leave', 'sick', 'training', 'blocked'],
        required: true
      },
      availability: {
        morning: {
          type: String,
          enum: ['available', 'busy', 'tentative', 'blocked']
        },
        afternoon: {
          type: String,
          enum: ['available', 'busy', 'tentative', 'blocked']
        },
        evening: {
          type: String,
          enum: ['available', 'busy', 'tentative', 'blocked']
        }
      },
      allocations: [{
        projectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Project'
        },
        engagementId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Engagement'
        },
        clientId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Client'
        },
        hours: Number,
        type: {
          type: String,
          enum: ['project', 'meeting', 'training', 'admin', 'travel', 'other']
        },
        status: {
          type: String,
          enum: ['confirmed', 'tentative', 'proposed']
        },
        billable: Boolean,
        location: String,
        notes: String
      }],
      totalHours: Number,
      availableHours: Number,
      utilization: Number,
      notes: String
    }],
    recurringCommitments: [{
      name: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['meeting', 'training', 'admin', 'project', 'other']
      },
      recurrence: {
        pattern: {
          type: String,
          enum: ['daily', 'weekly', 'bi_weekly', 'monthly', 'custom']
        },
        frequency: Number,
        daysOfWeek: [Number],
        dayOfMonth: Number,
        customPattern: String
      },
      timeSlot: {
        start: String,
        end: String,
        duration: Number
      },
      effectivePeriod: {
        start: Date,
        end: Date
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      billable: Boolean,
      optional: Boolean,
      autoDecline: Boolean,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      }
    }]
  },

  // ==================== Allocations & Bookings ====================
  allocations: {
    current: [{
      allocationId: {
        type: String,
        unique: true,
        required: true
      },
      type: {
        type: String,
        enum: ['project', 'engagement', 'opportunity', 'internal', 'training'],
        required: true
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      engagementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Engagement'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      role: String,
      period: {
        start: {
          type: Date,
          required: true
        },
        end: {
          type: Date,
          required: true
        }
      },
      allocation: {
        percentage: {
          type: Number,
          min: 0,
          max: 100
        },
        hoursPerWeek: Number,
        hoursPerDay: Number,
        totalHours: Number
      },
      status: {
        type: String,
        enum: ['proposed', 'tentative', 'confirmed', 'active', 'completed', 'cancelled'],
        default: 'proposed'
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      billable: {
        type: Boolean,
        default: true
      },
      rate: {
        amount: Number,
        currency: String,
        discount: Number
      },
      location: {
        type: {
          type: String,
          enum: ['onsite', 'remote', 'hybrid', 'travel']
        },
        details: String,
        travelRequired: Boolean
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      notes: String
    }],
    future: [{
      allocationId: String,
      type: String,
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      tentativePeriod: {
        start: Date,
        end: Date
      },
      estimatedAllocation: Number,
      probability: Number,
      status: {
        type: String,
        enum: ['pipeline', 'proposed', 'likely', 'confirmed']
      },
      value: Number,
      notes: String
    }],
    history: [{
      allocationId: String,
      type: String,
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      period: {
        start: Date,
        end: Date
      },
      actualHours: Number,
      plannedHours: Number,
      utilization: Number,
      performance: {
        onTime: Boolean,
        quality: Number,
        clientSatisfaction: Number
      },
      revenue: Number,
      completedAt: Date
    }]
  },

  // ==================== Leave & Time Off ====================
  timeOff: {
    balance: {
      vacation: {
        entitled: Number,
        used: Number,
        remaining: Number,
        carryOver: Number
      },
      sick: {
        entitled: Number,
        used: Number,
        remaining: Number
      },
      personal: {
        entitled: Number,
        used: Number,
        remaining: Number
      },
      compensatory: {
        earned: Number,
        used: Number,
        remaining: Number
      },
      unpaid: {
        taken: Number,
        approved: Number
      }
    },
    requests: [{
      requestId: String,
      type: {
        type: String,
        enum: ['vacation', 'sick', 'personal', 'compensatory', 'unpaid', 'maternity', 'paternity', 'sabbatical'],
        required: true
      },
      period: {
        start: {
          type: Date,
          required: true
        },
        end: {
          type: Date,
          required: true
        },
        totalDays: Number,
        workingDays: Number
      },
      reason: String,
      status: {
        type: String,
        enum: ['draft', 'submitted', 'approved', 'rejected', 'cancelled', 'taken'],
        default: 'draft'
      },
      requestedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date,
      approvalNotes: String,
      coverage: {
        arranged: Boolean,
        coveredBy: [{
          consultantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultant'
          },
          responsibilities: [String]
        }]
      },
      impact: {
        projectsAffected: [{
          projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Project'
          },
          impact: String,
          mitigation: String
        }],
        clientNotification: Boolean,
        rescheduledMeetings: [String]
      }
    }],
    holidays: [{
      date: Date,
      name: String,
      type: {
        type: String,
        enum: ['public', 'company', 'floating', 'optional']
      },
      location: String,
      observed: Boolean
    }],
    blackoutDates: [{
      period: {
        start: Date,
        end: Date
      },
      reason: String,
      type: {
        type: String,
        enum: ['project_critical', 'company_event', 'peak_season', 'other']
      },
      exceptions: [String]
    }]
  },

  // ==================== Location & Travel ====================
  location: {
    base: {
      office: String,
      city: String,
      country: String,
      timezone: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    current: {
      location: String,
      city: String,
      country: String,
      timezone: String,
      workingFrom: {
        type: String,
        enum: ['office', 'home', 'client_site', 'co_working', 'traveling']
      },
      since: Date,
      until: Date
    },
    preferences: {
      remoteWork: {
        preferred: Boolean,
        percentage: Number,
        equipped: Boolean,
        limitations: [String]
      },
      officeWork: {
        preferred: Boolean,
        daysPerWeek: Number,
        flexibleDays: Boolean
      },
      travel: {
        willingToTravel: Boolean,
        maxPercentage: Number,
        domesticOnly: Boolean,
        internationalAllowed: Boolean,
        restrictions: [String],
        preferredAirlines: [String],
        preferredHotels: [String],
        dietaryRestrictions: [String]
      },
      relocation: {
        willing: Boolean,
        locations: [String],
        timeframe: String,
        assistance: [String]
      }
    },
    travelSchedule: [{
      tripId: String,
      purpose: {
        type: String,
        enum: ['client_meeting', 'project', 'conference', 'training', 'other']
      },
      destination: {
        city: String,
        country: String,
        timezone: String
      },
      period: {
        departure: Date,
        return: Date
      },
      projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      },
      clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      },
      status: {
        type: String,
        enum: ['planned', 'booked', 'in_progress', 'completed', 'cancelled']
      },
      bookings: {
        flight: {
          booked: Boolean,
          details: String,
          cost: Number
        },
        hotel: {
          booked: Boolean,
          details: String,
          cost: Number
        },
        transportation: {
          arranged: Boolean,
          details: String,
          cost: Number
        }
      },
      approvals: {
        travel: {
          approved: Boolean,
          approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          approvedAt: Date
        },
        expense: {
          preApproved: Boolean,
          limit: Number,
          approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          }
        }
      }
    }]
  },

  // ==================== Conflicts & Constraints ====================
  conflicts: {
    scheduling: [{
      type: {
        type: String,
        enum: ['double_booking', 'overtime', 'leave_conflict', 'skill_mismatch', 'location_conflict']
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      period: {
        start: Date,
        end: Date
      },
      description: String,
      affectedAllocations: [String],
      resolution: {
        proposed: String,
        status: {
          type: String,
          enum: ['unresolved', 'in_progress', 'resolved', 'escalated']
        },
        resolvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        resolvedAt: Date
      }
    }],
    constraints: [{
      type: {
        type: String,
        enum: ['skill', 'certification', 'clearance', 'location', 'language', 'availability']
      },
      constraint: String,
      projects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
      }],
      impact: String,
      workaround: String,
      expiryDate: Date
    }],
    preferences: {
      avoidClients: [{
        clientId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Client'
        },
        reason: String,
        since: Date,
        reviewDate: Date
      }],
      avoidProjects: [{
        type: String,
        reason: String
      }],
      preferredProjects: [String],
      preferredClients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
      }],
      teamPreferences: {
        preferredColleagues: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Consultant'
        }],
        avoidColleagues: [{
          consultantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Consultant'
          },
          reason: String
        }]
      }
    }
  },

  // ==================== Forecasting & Planning ====================
  forecast: {
    availability: [{
      period: {
        start: Date,
        end: Date,
        month: String,
        quarter: String,
        year: Number
      },
      plannedUtilization: Number,
      confirmedHours: Number,
      tentativeHours: Number,
      availableHours: Number,
      probability: {
        fullyBooked: Number,
        partiallyBooked: Number,
        available: Number
      },
      pipeline: [{
        opportunityId: String,
        probability: Number,
        hours: Number,
        value: Number
      }],
      risks: [{
        risk: String,
        probability: Number,
        impact: String,
        mitigation: String
      }]
    }],
    demandForecast: {
      skills: [{
        skillId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ConsultantSkill'
        },
        demandLevel: {
          type: String,
          enum: ['low', 'moderate', 'high', 'critical']
        },
        projects: Number,
        hours: Number
      }],
      industries: [{
        industry: String,
        demand: Number,
        growth: Number
      }],
      nextSixMonths: {
        expectedUtilization: Number,
        expectedRevenue: Number,
        expectedProjects: Number
      }
    },
    capacityPlanning: {
      optimalUtilization: Number,
      breakEvenUtilization: Number,
      maxSustainableUtilization: Number,
      bufferRequired: Number,
      recommendations: [{
        recommendation: String,
        priority: String,
        impact: String,
        timeframe: String
      }]
    }
  },

  // ==================== Notifications & Automation ====================
  notifications: {
    settings: {
      bookingRequests: {
        enabled: Boolean,
        channel: {
          type: String,
          enum: ['email', 'sms', 'push', 'in_app']
        },
        advance: Number
      },
      scheduleChanges: {
        enabled: Boolean,
        channel: String,
        immediate: Boolean
      },
      conflictAlerts: {
        enabled: Boolean,
        channel: String,
        severity: {
          type: String,
          enum: ['all', 'high', 'critical']
        }
      },
      utilizationAlerts: {
        enabled: Boolean,
        thresholds: {
          low: Number,
          high: Number
        }
      },
      upcomingLeave: {
        enabled: Boolean,
        daysBefore: Number
      }
    },
    pending: [{
      type: String,
      message: String,
      priority: String,
      createdAt: Date,
      expiresAt: Date,
      action: String,
      acknowledged: Boolean
    }],
    history: [{
      type: String,
      message: String,
      sentAt: Date,
      channel: String,
      status: String,
      response: String
    }]
  },

  // ==================== Analytics & Metrics ====================
  analytics: {
    utilization: {
      current: {
        daily: Number,
        weekly: Number,
        monthly: Number,
        quarterly: Number,
        yearly: Number
      },
      historical: [{
        period: String,
        utilization: Number,
        billable: Number,
        nonBillable: Number,
        overtime: Number
      }],
      trends: {
        direction: {
          type: String,
          enum: ['increasing', 'stable', 'decreasing']
        },
        rate: Number,
        projection: Number
      },
      benchmarks: {
        vsTarget: Number,
        vsPeers: Number,
        vsDepartment: Number,
        vsCompany: Number
      }
    },
    efficiency: {
      plannedVsActual: Number,
      scheduleAdherence: Number,
      bookingLeadTime: Number,
      cancellationRate: Number,
      reschedulingRate: Number
    },
    patterns: {
      peakDays: [String],
      peakHours: [String],
      quietPeriods: [String],
      averageProjectDuration: Number,
      averageBreakBetweenProjects: Number,
      preferredWorkingPattern: String
    },
    performance: {
      availabilityScore: Number,
      reliabilityScore: Number,
      flexibilityScore: Number,
      overallScore: Number,
      ranking: {
        department: Number,
        company: Number
      }
    }
  },

  // ==================== Integration & Sync ====================
  integration: {
    externalCalendars: [{
      provider: {
        type: String,
        enum: ['google', 'outlook', 'apple', 'other']
      },
      accountId: String,
      syncEnabled: Boolean,
      syncDirection: {
        type: String,
        enum: ['one_way_in', 'one_way_out', 'two_way']
      },
      lastSync: Date,
      nextSync: Date,
      syncErrors: [{
        date: Date,
        error: String,
        resolved: Boolean
      }]
    }],
    resourcePlanning: {
      systemId: String,
      syncEnabled: Boolean,
      lastSync: Date,
      mappings: {
        projectField: String,
        allocationField: String,
        statusField: String
      }
    },
    timesheets: {
      systemId: String,
      autoUpdate: Boolean,
      lastUpdate: Date,
      discrepancies: [{
        date: Date,
        scheduled: Number,
        reported: Number,
        resolution: String
      }]
    }
  },

  // ==================== Metadata ====================
  metadata: {
    lastModified: {
      schedule: Date,
      allocations: Date,
      availability: Date,
      forecast: Date
    },
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvals: {
      schedule: {
        approved: Boolean,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        approvedAt: Date
      },
      allocations: {
        approved: Boolean,
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        approvedAt: Date
      }
    },
    locked: {
      isLocked: Boolean,
      lockedUntil: Date,
      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String
    },
    visibility: {
      public: Boolean,
      team: Boolean,
      managers: Boolean,
      hr: Boolean
    },
    tags: [String],
    customFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    version: {
      type: Number,
      default: 1
    }
  },

  // ==================== Audit Trail ====================
  auditLog: [{
    action: String,
    entity: String,
    entityId: String,
    changes: {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: Date,
    reason: String,
    ip: String
  }],

  // ==================== Deletion ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

// Create schema
const consultantAvailabilitySchema = BaseModel.createSchema(consultantAvailabilitySchemaDefinition, {
  collection: 'consultant_availability',
  timestamps: true
});

// ==================== Indexes ====================
consultantAvailabilitySchema.index({ tenantId: 1, availabilityId: 1 }, { unique: true });
consultantAvailabilitySchema.index({ tenantId: 1, consultantId: 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'currentStatus.status': 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'schedule.calendar.date': 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'allocations.current.period.start': 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'allocations.current.status': 1 });
consultantAvailabilitySchema.index({ tenantId: 1, 'capacity.current.utilization.current': 1 });

// Compound indexes for common queries
consultantAvailabilitySchema.index({ 
  tenantId: 1, 
  consultantId: 1, 
  'schedule.calendar.date': 1 
});

consultantAvailabilitySchema.index({ 
  tenantId: 1, 
  'currentStatus.status': 1, 
  'capacity.current.utilization.current': 1 
});

// ==================== Virtual Fields ====================
consultantAvailabilitySchema.virtual('isAvailable').get(function() {
  return this.currentStatus.status === 'available' || 
         this.currentStatus.status === 'partially_available';
});

consultantAvailabilitySchema.virtual('currentUtilization').get(function() {
  return this.capacity.current?.utilization?.current || 0;
});

consultantAvailabilitySchema.virtual('hasCapacity').get(function() {
  const utilization = this.capacity.current?.utilization?.current || 0;
  return utilization < 100;
});

consultantAvailabilitySchema.virtual('isOverallocated').get(function() {
  const utilization = this.capacity.current?.utilization?.current || 0;
  return utilization > 100;
});

consultantAvailabilitySchema.virtual('nextAvailableDate').get(function() {
  if (this.isAvailable) return new Date();
  
  // Find next available date from allocations
  const now = new Date();
  const futureAllocations = this.allocations.current
    .filter(a => a.status === 'confirmed' || a.status === 'active')
    .filter(a => a.period.end > now)
    .sort((a, b) => a.period.end - b.period.end);
  
  if (futureAllocations.length > 0) {
    return futureAllocations[0].period.end;
  }
  
  return null;
});

// ==================== Pre-save Middleware ====================
consultantAvailabilitySchema.pre('save', async function(next) {
  try {
    // Generate availability ID if not provided
    if (!this.availabilityId && this.isNew) {
      this.availabilityId = await this.constructor.generateAvailabilityId();
    }

    // Calculate current capacity
    if (this.isModified('allocations.current') || this.isModified('schedule')) {
      this.calculateCapacity();
    }

    // Update current status based on allocations
    if (this.isModified('allocations.current')) {
      this.updateCurrentStatus();
    }

    // Check for conflicts
    if (this.isModified('allocations.current') || this.isModified('timeOff.requests')) {
      this.detectConflicts();
    }

    // Update analytics
    if (this.isModified('allocations') || this.isModified('schedule')) {
      this.updateAnalytics();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
consultantAvailabilitySchema.methods.calculateCapacity = function() {
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  // Calculate allocated hours for different periods
  const allocations = this.allocations.current.filter(a => 
    a.status === 'confirmed' || a.status === 'active'
  );
  
  let todayHours = 0;
  let weekHours = 0;
  let monthHours = 0;
  
  allocations.forEach(allocation => {
    // Calculate overlap with periods
    if (allocation.period.start <= now && allocation.period.end >= now) {
      todayHours += (allocation.allocation.hoursPerDay || 0);
    }
    
    if (allocation.period.start <= endOfWeek && allocation.period.end >= startOfWeek) {
      weekHours += (allocation.allocation.hoursPerWeek || 0);
    }
    
    if (allocation.period.start <= endOfMonth && allocation.period.end >= startOfMonth) {
      const daysInMonth = this.getWorkingDaysInPeriod(
        Math.max(allocation.period.start, startOfMonth),
        Math.min(allocation.period.end, endOfMonth)
      );
      monthHours += daysInMonth * (allocation.allocation.hoursPerDay || 0);
    }
  });
  
  // Update capacity metrics
  if (!this.capacity.current) {
    this.capacity.current = {};
  }
  
  this.capacity.current.allocatedHours = {
    today: todayHours,
    thisWeek: weekHours,
    thisMonth: monthHours
  };
  
  this.capacity.current.availableHours = {
    today: Math.max(0, this.capacity.standard.hoursPerDay - todayHours),
    thisWeek: Math.max(0, this.capacity.standard.hoursPerWeek - weekHours),
    thisMonth: Math.max(0, this.capacity.standard.hoursPerMonth - monthHours)
  };
  
  // Calculate utilization
  const weeklyUtilization = (weekHours / this.capacity.standard.hoursPerWeek) * 100;
  this.capacity.current.utilization = {
    current: Math.round(weeklyUtilization),
    projected: {
      nextWeek: this.calculateProjectedUtilization(7),
      nextMonth: this.calculateProjectedUtilization(30),
      nextQuarter: this.calculateProjectedUtilization(90)
    }
  };
  
  // Determine trend
  if (this.capacity.current.utilization.projected.nextMonth > weeklyUtilization + 10) {
    this.capacity.current.utilization.trend = 'increasing';
  } else if (this.capacity.current.utilization.projected.nextMonth < weeklyUtilization - 10) {
    this.capacity.current.utilization.trend = 'decreasing';
  } else {
    this.capacity.current.utilization.trend = 'stable';
  }
  
  this.capacity.current.lastCalculated = new Date();
};

consultantAvailabilitySchema.methods.getWorkingDaysInPeriod = function(startDate, endDate) {
  let workingDays = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
    
    if (this.schedule.workingHours.regular[dayName].isWorking) {
      // Check if it's not a holiday or time off
      const isHoliday = this.timeOff.holidays.some(h => 
        h.date.toDateString() === current.toDateString() && h.observed
      );
      
      const isTimeOff = this.timeOff.requests.some(r => 
        r.status === 'approved' && 
        r.period.start <= current && 
        r.period.end >= current
      );
      
      if (!isHoliday && !isTimeOff) {
        workingDays++;
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
};

consultantAvailabilitySchema.methods.calculateProjectedUtilization = function(daysAhead) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);
  
  const workingDays = this.getWorkingDaysInPeriod(startDate, endDate);
  const totalAvailableHours = workingDays * this.capacity.standard.hoursPerDay;
  
  let allocatedHours = 0;
  
  this.allocations.current
    .filter(a => a.status === 'confirmed' || a.status === 'active')
    .forEach(allocation => {
      if (allocation.period.start <= endDate && allocation.period.end >= startDate) {
        const overlapStart = Math.max(allocation.period.start, startDate);
        const overlapEnd = Math.min(allocation.period.end, endDate);
        const overlapDays = this.getWorkingDaysInPeriod(overlapStart, overlapEnd);
        allocatedHours += overlapDays * (allocation.allocation.hoursPerDay || 0);
      }
    });
  
  return Math.round((allocatedHours / totalAvailableHours) * 100);
};

consultantAvailabilitySchema.methods.updateCurrentStatus = function() {
  const utilization = this.capacity.current?.utilization?.current || 0;
  
  if (utilization === 0) {
    this.currentStatus.status = 'available';
  } else if (utilization < 50) {
    this.currentStatus.status = 'partially_available';
  } else if (utilization < 100) {
    this.currentStatus.status = 'on_project';
  } else {
    this.currentStatus.status = 'busy';
  }
  
  // Check for leave
  const now = new Date();
  const onLeave = this.timeOff.requests.some(r => 
    r.status === 'approved' &&
    r.period.start <= now &&
    r.period.end >= now
  );
  
  if (onLeave) {
    this.currentStatus.status = 'on_leave';
  }
  
  // Check for manual override
  if (this.currentStatus.manualOverride?.active && 
      (!this.currentStatus.manualOverride.expiresAt || 
       this.currentStatus.manualOverride.expiresAt > now)) {
    // Keep manual status
    return;
  }
  
  this.currentStatus.effectiveFrom = new Date();
};

consultantAvailabilitySchema.methods.detectConflicts = function() {
  const conflicts = [];
  
  // Check for double bookings
  const allocations = this.allocations.current.filter(a => 
    a.status === 'confirmed' || a.status === 'active'
  );
  
  for (let i = 0; i < allocations.length; i++) {
    for (let j = i + 1; j < allocations.length; j++) {
      const a1 = allocations[i];
      const a2 = allocations[j];
      
      // Check if periods overlap
      if (a1.period.start <= a2.period.end && a1.period.end >= a2.period.start) {
        const totalAllocation = (a1.allocation.percentage || 0) + (a2.allocation.percentage || 0);
        
        if (totalAllocation > 100) {
          conflicts.push({
            type: 'double_booking',
            severity: totalAllocation > 150 ? 'critical' : 'high',
            period: {
              start: Math.max(a1.period.start, a2.period.start),
              end: Math.min(a1.period.end, a2.period.end)
            },
            description: `Overallocation: ${totalAllocation}% between ${a1.projectId} and ${a2.projectId}`,
            affectedAllocations: [a1.allocationId, a2.allocationId],
            resolution: {
              proposed: 'Reduce allocation percentage or reschedule',
              status: 'unresolved'
            }
          });
        }
      }
    }
  }
  
  // Check for leave conflicts
  this.timeOff.requests
    .filter(r => r.status === 'approved')
    .forEach(leave => {
      allocations.forEach(allocation => {
        if (allocation.period.start <= leave.period.end && 
            allocation.period.end >= leave.period.start) {
          conflicts.push({
            type: 'leave_conflict',
            severity: 'high',
            period: {
              start: Math.max(allocation.period.start, leave.period.start),
              end: Math.min(allocation.period.end, leave.period.end)
            },
            description: `Allocation during approved leave: ${allocation.projectId}`,
            affectedAllocations: [allocation.allocationId],
            resolution: {
              proposed: 'Reassign to another consultant or reschedule',
              status: 'unresolved'
            }
          });
        }
      });
    });
  
  this.conflicts.scheduling = conflicts;
};

consultantAvailabilitySchema.methods.updateAnalytics = function() {
  // Calculate historical utilization
  const periods = [];
  const now = new Date();
  
  // Last 12 months
  for (let i = 11; i >= 0; i--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const utilization = this.calculateUtilizationForPeriod(periodStart, periodEnd);
    periods.push({
      period: `${periodStart.getFullYear()}-${(periodStart.getMonth() + 1).toString().padStart(2, '0')}`,
      utilization: utilization.total,
      billable: utilization.billable,
      nonBillable: utilization.nonBillable,
      overtime: utilization.overtime
    });
  }
  
  if (!this.analytics) this.analytics = {};
  if (!this.analytics.utilization) this.analytics.utilization = {};
  
  this.analytics.utilization.historical = periods;
  
  // Calculate efficiency metrics
  const plannedHours = this.allocations.history.reduce((sum, a) => sum + (a.plannedHours || 0), 0);
  const actualHours = this.allocations.history.reduce((sum, a) => sum + (a.actualHours || 0), 0);
  
  this.analytics.efficiency = {
    plannedVsActual: plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0,
    scheduleAdherence: this.calculateScheduleAdherence(),
    bookingLeadTime: this.calculateAverageBookingLeadTime(),
    cancellationRate: this.calculateCancellationRate(),
    reschedulingRate: this.calculateReschedulingRate()
  };
};

consultantAvailabilitySchema.methods.calculateUtilizationForPeriod = function(startDate, endDate) {
  const workingDays = this.getWorkingDaysInPeriod(startDate, endDate);
  const totalAvailableHours = workingDays * this.capacity.standard.hoursPerDay;
  
  let billableHours = 0;
  let nonBillableHours = 0;
  let overtimeHours = 0;
  
  this.allocations.history
    .filter(a => a.period.start <= endDate && a.period.end >= startDate)
    .forEach(allocation => {
      const hours = allocation.actualHours || 0;
      if (allocation.billable) {
        billableHours += hours;
      } else {
        nonBillableHours += hours;
      }
      
      if (hours > this.capacity.standard.hoursPerDay) {
        overtimeHours += hours - this.capacity.standard.hoursPerDay;
      }
    });
  
  return {
    total: Math.round(((billableHours + nonBillableHours) / totalAvailableHours) * 100),
    billable: Math.round((billableHours / totalAvailableHours) * 100),
    nonBillable: Math.round((nonBillableHours / totalAvailableHours) * 100),
    overtime: overtimeHours
  };
};

consultantAvailabilitySchema.methods.calculateScheduleAdherence = function() {
  // Implementation for schedule adherence calculation
  return 95; // Placeholder
};

consultantAvailabilitySchema.methods.calculateAverageBookingLeadTime = function() {
  // Implementation for average booking lead time
  return 14; // days - placeholder
};

consultantAvailabilitySchema.methods.calculateCancellationRate = function() {
  // Implementation for cancellation rate
  return 5; // percentage - placeholder
};

consultantAvailabilitySchema.methods.calculateReschedulingRate = function() {
  // Implementation for rescheduling rate
  return 10; // percentage - placeholder
};

consultantAvailabilitySchema.methods.bookAllocation = async function(allocationData) {
  const allocation = {
    allocationId: mongoose.Types.ObjectId().toString(),
    type: allocationData.type,
    projectId: allocationData.projectId,
    engagementId: allocationData.engagementId,
    clientId: allocationData.clientId,
    role: allocationData.role,
    period: allocationData.period,
    allocation: allocationData.allocation,
    status: allocationData.status || 'proposed',
    priority: allocationData.priority || 'medium',
    billable: allocationData.billable !== false,
    rate: allocationData.rate,
    location: allocationData.location,
    requestedBy: allocationData.requestedBy,
    notes: allocationData.notes
  };
  
  // Check capacity
  const projectedUtilization = this.calculateProjectedUtilizationWithNewAllocation(allocation);
  if (projectedUtilization > this.capacity.constraints.maxOvertimePerWeek + 100) {
    throw new AppError(`Cannot book allocation. Would exceed maximum capacity (${projectedUtilization}%)`, 400);
  }
  
  this.allocations.current.push(allocation);
  
  // Recalculate capacity and detect conflicts
  this.calculateCapacity();
  this.detectConflicts();
  
  await this.save();
  
  logger.info('Allocation booked', {
    consultantId: this.consultantId,
    allocationId: allocation.allocationId,
    utilization: this.capacity.current.utilization.current
  });
  
  return allocation;
};

consultantAvailabilitySchema.methods.calculateProjectedUtilizationWithNewAllocation = function(newAllocation) {
  // Calculate what utilization would be with new allocation
  const tempAllocations = [...this.allocations.current, newAllocation];
  let totalPercentage = 0;
  
  tempAllocations
    .filter(a => a.status === 'confirmed' || a.status === 'active')
    .forEach(allocation => {
      if (allocation.period.start <= newAllocation.period.end && 
          allocation.period.end >= newAllocation.period.start) {
        totalPercentage += (allocation.allocation.percentage || 0);
      }
    });
  
  return totalPercentage;
};

// ==================== Static Methods ====================
consultantAvailabilitySchema.statics.generateAvailabilityId = async function() {
  const prefix = 'AVL';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    let random = '';
    for (let i = 0; i < 8; i++) {
      random += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    code = `${prefix}-${random}`;
    
    const existing = await this.findOne({ availabilityId: code });
    exists = !!existing;
  }
  
  return code;
};

consultantAvailabilitySchema.statics.findAvailableConsultants = async function(tenantId, requirements = {}) {
  const {
    startDate,
    endDate,
    minimumAvailability = 50,
    skills = [],
    location,
    maxUtilization = 80
  } = requirements;
  
  const query = {
    tenantId,
    isDeleted: false,
    'currentStatus.status': { $in: ['available', 'partially_available'] },
    'capacity.current.utilization.current': { $lte: maxUtilization }
  };
  
  const consultants = await this.find(query)
    .populate('consultantId', 'personalInfo skills profile')
    .sort({ 'capacity.current.utilization.current': 1 });
  
  // Further filter based on specific period availability
  if (startDate && endDate) {
    return consultants.filter(consultant => {
      const projectedUtilization = consultant.calculateProjectedUtilizationForPeriod(
        startDate,
        endDate
      );
      return (100 - projectedUtilization) >= minimumAvailability;
    });
  }
  
  return consultants;
};

consultantAvailabilitySchema.statics.getUtilizationReport = async function(tenantId, options = {}) {
  const {
    startDate = new Date(),
    endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    groupBy = 'consultant'
  } = options;
  
  const pipeline = [
    {
      $match: {
        tenantId,
        isDeleted: false
      }
    },
    {
      $lookup: {
        from: 'consultants',
        localField: 'consultantId',
        foreignField: '_id',
        as: 'consultant'
      }
    },
    {
      $unwind: '$consultant'
    },
    {
      $project: {
        consultantName: {
          $concat: ['$consultant.personalInfo.firstName', ' ', '$consultant.personalInfo.lastName']
        },
        department: '$consultant.profile.department',
        level: '$consultant.profile.level',
        currentUtilization: '$capacity.current.utilization.current',
        projectedUtilization: '$capacity.current.utilization.projected',
        availableHours: '$capacity.current.availableHours',
        status: '$currentStatus.status'
      }
    }
  ];
  
  if (groupBy === 'department') {
    pipeline.push({
      $group: {
        _id: '$department',
        avgUtilization: { $avg: '$currentUtilization' },
        totalConsultants: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] }
        },
        totalAvailableHours: { $sum: '$availableHours.thisMonth' }
      }
    });
  } else if (groupBy === 'level') {
    pipeline.push({
      $group: {
        _id: '$level',
        avgUtilization: { $avg: '$currentUtilization' },
        totalConsultants: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $lt: ['$currentUtilization', 100] }, 1, 0] }
        }
      }
    });
  }
  
  return await this.aggregate(pipeline);
};

// ==================== Create Model ====================
const ConsultantAvailabilityModel = BaseModel.createModel('ConsultantAvailability', consultantAvailabilitySchema, {
  collection: 'consultant_availability',
  enableTimestamps: true,
  enableAudit: true,
  enableSoftDelete: true
});

module.exports = ConsultantAvailabilityModel;