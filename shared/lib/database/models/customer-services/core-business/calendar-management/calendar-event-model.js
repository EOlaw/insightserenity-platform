'use strict';

/**
 * @fileoverview Calendar Event Model - Universal scheduling and event management
 * @module shared/lib/database/models/customer-services/core-business/calendar-management/calendar-event-model
 * @description Multi-tenant Calendar Event model supporting all entity types with comprehensive scheduling features
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const CommonValidator = require('../../../../../utils/validators/common-validators');
const stringHelper = require('../../../../../utils/helpers/string-helper');

/**
 * Calendar Event Schema Definition
 * Supports universal scheduling for all entity types with recurrence, reminders, and collaboration
 */
const calendarEventSchemaDefinition = {
  // ==================== Core Identity ====================
  eventId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^EVT-[A-Z0-9]{10,}$/,
    index: true,
    immutable: true
  },

  // ==================== Multi-Tenancy & Organization ====================
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

  // ==================== Owner & Entity Relationships ====================
  // The primary owner of this event (who created it)
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'ownerModel',
    required: true,
    index: true
  },

  ownerModel: {
    type: String,
    required: true,
    enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner'],
    index: true
  },

  // Related entities - allows events to be linked to multiple entities
  relatedEntities: [{
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    entityModel: {
      type: String,
      required: true,
      enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner', 'Project', 'Engagement', 'Job', 'Application']
    },
    role: {
      type: String,
      enum: ['primary', 'secondary', 'participant', 'observer']
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ==================== Event Information ====================
  eventInfo: {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      index: true
    },
    description: {
      type: String,
      maxlength: 5000
    },
    type: {
      type: String,
      enum: [
        'meeting', 'call', 'video_conference', 'deadline', 'reminder', 
        'task', 'appointment', 'interview', 'presentation', 'training',
        'workshop', 'conference', 'social', 'personal', 'other'
      ],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: [
        'work', 'personal', 'client', 'internal', 'sales', 'support',
        'recruitment', 'consulting', 'administrative', 'strategic', 'other'
      ],
      default: 'work',
      index: true
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
      index: true
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'confidential', 'internal'],
      default: 'internal',
      index: true
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'tentative', 'cancelled', 'completed', 'rescheduled', 'no_show'],
      default: 'scheduled',
      index: true
    },
    tags: [String],
    color: {
      type: String,
      default: '#ffc451'
    }
  },

  // ==================== Schedule Information ====================
  schedule: {
    startDateTime: {
      type: Date,
      required: true,
      index: true
    },
    endDateTime: {
      type: Date,
      required: true,
      index: true
    },
    timezone: {
      type: String,
      default: 'UTC',
      required: true
    },
    allDay: {
      type: Boolean,
      default: false
    },
    duration: {
      minutes: Number,
      hours: Number
    },
    // For recurring events
    isRecurring: {
      type: Boolean,
      default: false,
      index: true
    },
    recurrence: {
      pattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom']
      },
      interval: {
        type: Number,
        min: 1,
        default: 1
      },
      daysOfWeek: [{
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      }],
      dayOfMonth: Number,
      monthOfYear: Number,
      endsOn: {
        type: String,
        enum: ['never', 'date', 'after_occurrences']
      },
      endDate: Date,
      occurrences: Number,
      exceptions: [Date] // Dates to skip
    },
    parentEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CalendarEvent'
    },
    instanceDate: Date // For recurring event instances
  },

  // ==================== Location & Meeting Details ====================
  location: {
    type: {
      type: String,
      enum: ['physical', 'virtual', 'phone', 'hybrid', 'tbd']
    },
    physical: {
      venue: String,
      address: {
        street1: String,
        street2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
      },
      room: String,
      floor: String,
      building: String,
      directions: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    virtual: {
      platform: {
        type: String,
        enum: ['zoom', 'teams', 'meet', 'webex', 'skype', 'phone', 'other']
      },
      meetingUrl: String,
      meetingId: String,
      passcode: {
        type: String,
        select: false
      },
      dialIn: {
        phoneNumber: String,
        accessCode: String,
        pin: String
      },
      instructions: String
    },
    phone: {
      number: String,
      extension: String,
      conferenceId: String
    }
  },

  // ==================== Participants & Attendees ====================
  participants: [{
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    participantModel: {
      type: String,
      required: true,
      enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner', 'Contact']
    },
    participantInfo: {
      name: String,
      email: String,
      phone: String,
      title: String
    },
    role: {
      type: String,
      enum: ['organizer', 'required', 'optional', 'resource', 'observer'],
      default: 'required'
    },
    responseStatus: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'tentative', 'no_response'],
      default: 'pending'
    },
    responseAt: Date,
    responseNote: String,
    notificationSent: {
      type: Boolean,
      default: false
    },
    notificationSentAt: Date,
    checkedIn: {
      type: Boolean,
      default: false
    },
    checkedInAt: Date,
    attended: Boolean,
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // ==================== Reminders & Notifications ====================
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app', 'popup'],
      required: true
    },
    timing: {
      type: String,
      enum: ['at_time', 'before'],
      default: 'before'
    },
    minutes: {
      type: Number,
      min: 0
    },
    customTime: Date,
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date,
    recipients: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    message: String,
    active: {
      type: Boolean,
      default: true
    }
  }],

  // ==================== Agenda & Preparation ====================
  agenda: {
    items: [{
      order: Number,
      title: String,
      description: String,
      duration: Number,
      presenter: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'agenda.items.presenterModel'
      },
      presenterModel: String,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'skipped']
      }
    }],
    objectives: [String],
    outcomes: [String],
    actionItems: [{
      description: String,
      assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      dueDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'cancelled']
      },
      completedAt: Date
    }]
  },

  preparation: {
    materials: [{
      name: String,
      description: String,
      url: String,
      type: String,
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      uploadedAt: Date,
      required: Boolean
    }],
    prerequisites: [String],
    instructions: String
  },

  // ==================== Resources & Requirements ====================
  resources: {
    equipment: [{
      name: String,
      type: String,
      quantity: Number,
      reserved: Boolean,
      reservationId: String
    }],
    catering: {
      required: Boolean,
      type: String,
      headcount: Number,
      dietaryRestrictions: [String],
      orderPlaced: Boolean,
      vendor: String,
      confirmationNumber: String
    },
    technicalRequirements: {
      internet: Boolean,
      projector: Boolean,
      microphone: Boolean,
      recordingEquipment: Boolean,
      other: [String]
    }
  },

  // ==================== Collaboration & Communication ====================
  collaboration: {
    allowGuestInvites: {
      type: Boolean,
      default: false
    },
    allowModifications: {
      type: String,
      enum: ['organizer_only', 'participants', 'anyone'],
      default: 'organizer_only'
    },
    comments: [{
      commentId: String,
      content: String,
      author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      edited: Boolean,
      editedAt: Date,
      replies: [{
        content: String,
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        createdAt: Date
      }]
    }],
    sharedNotes: {
      content: String,
      lastEditedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      lastEditedAt: Date
    }
  },

  // ==================== Post-Event Information ====================
  outcome: {
    completed: Boolean,
    completedAt: Date,
    summary: String,
    attendanceRate: Number,
    actualDuration: Number,
    recording: {
      available: Boolean,
      url: String,
      duration: Number,
      size: Number
    },
    transcript: {
      available: Boolean,
      url: String,
      generatedAt: Date
    },
    followUpRequired: Boolean,
    followUpEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CalendarEvent'
    },
    rating: {
      overall: Number,
      organization: Number,
      content: Number,
      engagement: Number,
      ratedBy: [{
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        rating: Number,
        ratedAt: Date
      }]
    }
  },

  // ==================== Integration & Sync ====================
  integration: {
    externalIds: {
      google: String,
      microsoft: String,
      zoom: String,
      salesforce: String,
      custom: {
        type: Map,
        of: String
      }
    },
    syncStatus: {
      lastSync: Date,
      nextSync: Date,
      provider: String,
      errors: [{
        date: Date,
        provider: String,
        error: String
      }]
    },
    calendarId: String,
    icalUid: String
  },

  // ==================== Privacy & Access Control ====================
  privacy: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    visibleTo: [{
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      entityModel: {
        type: String,
        required: true,
        enum: ['User', 'Team', 'Department', 'Organization']
      }
    }],
    editableBy: [{
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      entityModel: {
        type: String,
        required: true,
        enum: ['User', 'Team', 'Department']
      }
    }]
  },

  // ==================== Metadata & System ====================
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'sync', 'api', 'automation', 'template'],
      default: 'manual'
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventTemplate'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    importBatch: String,
    version: {
      type: Number,
      default: 1
    },
    flags: {
      isImportant: {
        type: Boolean,
        default: false
      },
      requiresApproval: {
        type: Boolean,
        default: false
      },
      approved: Boolean,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      approvedAt: Date
    }
  },

  // ==================== Change History ====================
  changeHistory: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: String,
    notificationSent: Boolean
  }],

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Soft Delete ====================
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

const calendarEventSchema = new Schema(calendarEventSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== Indexes ====================
calendarEventSchema.index({ tenantId: 1, eventId: 1 }, { unique: true });
calendarEventSchema.index({ tenantId: 1, ownerId: 1, 'schedule.startDateTime': -1 });
calendarEventSchema.index({ tenantId: 1, 'eventInfo.status': 1, 'schedule.startDateTime': 1 });
calendarEventSchema.index({ tenantId: 1, 'eventInfo.type': 1, 'schedule.startDateTime': 1 });
calendarEventSchema.index({ tenantId: 1, 'participants.participantId': 1 });
calendarEventSchema.index({ tenantId: 1, 'relatedEntities.entityId': 1 });
calendarEventSchema.index({ tenantId: 1, 'schedule.isRecurring': 1 });
calendarEventSchema.index({ tenantId: 1, organizationId: 1, 'schedule.startDateTime': 1 });
calendarEventSchema.index({ 'schedule.startDateTime': 1, 'schedule.endDateTime': 1 });
calendarEventSchema.index({ searchTokens: 1 });
calendarEventSchema.index({ createdAt: -1 });

// Text search index
calendarEventSchema.index({
  'eventInfo.title': 'text',
  'eventInfo.description': 'text',
  'agenda.items.title': 'text'
});

// ==================== Virtual Fields ====================
calendarEventSchema.virtual('isUpcoming').get(function() {
  return this.schedule.startDateTime > new Date() && this.eventInfo.status === 'scheduled';
});

calendarEventSchema.virtual('isPast').get(function() {
  return this.schedule.endDateTime < new Date();
});

calendarEventSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.schedule.startDateTime <= now && 
         this.schedule.endDateTime >= now && 
         this.eventInfo.status !== 'cancelled';
});

calendarEventSchema.virtual('durationMinutes').get(function() {
  if (this.schedule.duration && this.schedule.duration.minutes) {
    return this.schedule.duration.minutes + (this.schedule.duration.hours || 0) * 60;
  }
  const diff = this.schedule.endDateTime - this.schedule.startDateTime;
  return Math.floor(diff / 60000);
});

calendarEventSchema.virtual('acceptedParticipants').get(function() {
  return this.participants.filter(p => p.responseStatus === 'accepted').length;
});

calendarEventSchema.virtual('pendingParticipants').get(function() {
  return this.participants.filter(p => p.responseStatus === 'pending').length;
});

// ==================== Pre-save Middleware ====================
calendarEventSchema.pre('save', async function(next) {
  try {
    // Generate eventId if not provided
    if (!this.eventId && this.isNew) {
      this.eventId = await this.constructor.generateEventId(this.tenantId);
    }

    // Calculate duration
    if (this.schedule.startDateTime && this.schedule.endDateTime) {
      const durationMs = this.schedule.endDateTime - this.schedule.startDateTime;
      this.schedule.duration = {
        minutes: Math.floor(durationMs / 60000) % 60,
        hours: Math.floor(durationMs / 3600000)
      };
    }

    // Update search tokens
    this.updateSearchTokens();

    // Validate schedule
    if (this.schedule.endDateTime <= this.schedule.startDateTime) {
      throw new AppError('End date must be after start date', 400, 'INVALID_SCHEDULE');
    }

    // Track changes for notifications
    if (!this.isNew && this.isModified('schedule')) {
      if (!this.changeHistory) this.changeHistory = [];
      this.changeHistory.unshift({
        field: 'schedule',
        oldValue: this._original?.schedule,
        newValue: this.schedule,
        changedBy: this.metadata.lastModifiedBy,
        changedAt: new Date(),
        notificationSent: false
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Store original document for change tracking
calendarEventSchema.pre('save', function(next) {
  if (!this.isNew) {
    this._original = this.toObject();
  }
  next();
});

// ==================== Instance Methods ====================
calendarEventSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  if (this.eventInfo.title) {
    this.eventInfo.title.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  if (this.eventId) {
    tokens.add(this.eventId.toLowerCase());
  }
  
  if (this.eventInfo.tags) {
    this.eventInfo.tags.forEach(tag => tokens.add(tag.toLowerCase()));
  }
  
  this.searchTokens = Array.from(tokens);
};

calendarEventSchema.methods.addParticipant = async function(participantData, addedBy) {
  const participant = {
    participantId: participantData.id,
    participantModel: participantData.model,
    participantInfo: {
      name: participantData.name,
      email: participantData.email,
      phone: participantData.phone,
      title: participantData.title
    },
    role: participantData.role || 'required',
    responseStatus: 'pending',
    addedAt: new Date(),
    addedBy
  };
  
  // Check if participant already exists
  const exists = this.participants.some(
    p => p.participantId.toString() === participantData.id.toString()
  );
  
  if (exists) {
    throw new AppError('Participant already added', 409, 'PARTICIPANT_EXISTS');
  }
  
  this.participants.push(participant);
  await this.save();
  
  return participant;
};

calendarEventSchema.methods.updateParticipantResponse = async function(participantId, responseStatus, note) {
  const participant = this.participants.find(
    p => p.participantId.toString() === participantId.toString()
  );
  
  if (!participant) {
    throw new AppError('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
  }
  
  participant.responseStatus = responseStatus;
  participant.responseAt = new Date();
  if (note) participant.responseNote = note;
  
  await this.save();
  return participant;
};

calendarEventSchema.methods.addReminder = async function(reminderData) {
  const reminder = {
    type: reminderData.type,
    timing: reminderData.timing || 'before',
    minutes: reminderData.minutes,
    customTime: reminderData.customTime,
    recipients: reminderData.recipients || [],
    message: reminderData.message,
    sent: false,
    active: true
  };
  
  if (!this.reminders) this.reminders = [];
  this.reminders.push(reminder);
  
  await this.save();
  return reminder;
};

calendarEventSchema.methods.cancel = async function(cancelledBy, reason) {
  this.eventInfo.status = 'cancelled';
  
  if (!this.changeHistory) this.changeHistory = [];
  this.changeHistory.unshift({
    field: 'status',
    oldValue: this.eventInfo.status,
    newValue: 'cancelled',
    changedBy: cancelledBy,
    changedAt: new Date(),
    reason,
    notificationSent: false
  });
  
  await this.save();
  
  logger.info('Event cancelled', {
    eventId: this.eventId,
    cancelledBy,
    reason
  });
  
  return true;
};

calendarEventSchema.methods.reschedule = async function(newStartDate, newEndDate, rescheduledBy, reason) {
  const oldSchedule = {
    startDateTime: this.schedule.startDateTime,
    endDateTime: this.schedule.endDateTime
  };
  
  this.schedule.startDateTime = newStartDate;
  this.schedule.endDateTime = newEndDate;
  this.eventInfo.status = 'rescheduled';
  
  if (!this.changeHistory) this.changeHistory = [];
  this.changeHistory.unshift({
    field: 'schedule',
    oldValue: oldSchedule,
    newValue: {
      startDateTime: newStartDate,
      endDateTime: newEndDate
    },
    changedBy: rescheduledBy,
    changedAt: new Date(),
    reason,
    notificationSent: false
  });
  
  // Reset participant responses
  this.participants.forEach(p => {
    if (p.responseStatus !== 'organizer') {
      p.responseStatus = 'pending';
      p.responseAt = null;
    }
  });
  
  await this.save();
  
  logger.info('Event rescheduled', {
    eventId: this.eventId,
    rescheduledBy,
    newStart: newStartDate,
    newEnd: newEndDate
  });
  
  return true;
};

calendarEventSchema.methods.markComplete = async function(completionData) {
  this.eventInfo.status = 'completed';
  this.outcome.completed = true;
  this.outcome.completedAt = new Date();
  
  if (completionData) {
    if (completionData.summary) this.outcome.summary = completionData.summary;
    if (completionData.actualDuration) this.outcome.actualDuration = completionData.actualDuration;
    if (completionData.attendanceRate !== undefined) this.outcome.attendanceRate = completionData.attendanceRate;
  }
  
  await this.save();
  return true;
};

calendarEventSchema.methods.generateRecurringInstances = async function(untilDate) {
  if (!this.schedule.isRecurring) {
    throw new AppError('Event is not recurring', 400, 'NOT_RECURRING');
  }
  
  const instances = [];
  const recurrence = this.schedule.recurrence;
  let currentDate = new Date(this.schedule.startDateTime);
  const endDate = untilDate || (recurrence.endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  
  let occurrenceCount = 0;
  const maxOccurrences = recurrence.endsOn === 'after_occurrences' ? recurrence.occurrences : 1000;
  
  while (currentDate <= endDate && occurrenceCount < maxOccurrences) {
    // Check if this date is an exception
    const isException = recurrence.exceptions?.some(
      exc => exc.toDateString() === currentDate.toDateString()
    );
    
    if (!isException) {
      instances.push({
        ...this.toObject(),
        _id: new mongoose.Types.ObjectId(),
        eventId: `${this.eventId}-${occurrenceCount}`,
        parentEventId: this._id,
        instanceDate: new Date(currentDate),
        schedule: {
          ...this.schedule,
          startDateTime: new Date(currentDate),
          endDateTime: new Date(currentDate.getTime() + (this.schedule.endDateTime - this.schedule.startDateTime)),
          isRecurring: false,
          recurrence: undefined
        }
      });
    }
    
    // Calculate next occurrence
    switch (recurrence.pattern) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + recurrence.interval);
        break;
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + (7 * recurrence.interval));
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + recurrence.interval);
        break;
      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + recurrence.interval);
        break;
    }
    
    occurrenceCount++;
  }
  
  return instances;
};

// ==================== Static Methods ====================
calendarEventSchema.statics.generateEventId = async function(tenantId) {
  const prefix = 'EVT';
  const randomPart = stringHelper.generateRandomString(10, 'ALPHANUMERIC').toUpperCase();
  return `${prefix}-${randomPart}`;
};

calendarEventSchema.statics.findByOwner = async function(tenantId, ownerId, ownerModel, options = {}) {
  const {
    status,
    type,
    startDate,
    endDate,
    includeRecurring = true,
    limit = 50,
    skip = 0,
    sort = { 'schedule.startDateTime': 1 }
  } = options;
  
  const query = {
    tenantId,
    ownerId,
    ownerModel,
    isDeleted: false
  };
  
  if (status) {
    query['eventInfo.status'] = status;
  }
  
  if (type) {
    query['eventInfo.type'] = type;
  }
  
  if (startDate || endDate) {
    query['schedule.startDateTime'] = {};
    if (startDate) query['schedule.startDateTime'].$gte = startDate;
    if (endDate) query['schedule.startDateTime'].$lte = endDate;
  }
  
  if (!includeRecurring) {
    query['schedule.isRecurring'] = false;
  }
  
  const [events, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(query)
  ]);
  
  return {
    events,
    total,
    hasMore: total > skip + events.length
  };
};

calendarEventSchema.statics.findByParticipant = async function(tenantId, participantId, options = {}) {
  const {
    responseStatus,
    startDate,
    endDate,
    limit = 50,
    skip = 0
  } = options;
  
  const query = {
    tenantId,
    'participants.participantId': participantId,
    isDeleted: false
  };
  
  if (responseStatus) {
    query['participants.responseStatus'] = responseStatus;
  }
  
  if (startDate || endDate) {
    query['schedule.startDateTime'] = {};
    if (startDate) query['schedule.startDateTime'].$gte = startDate;
    if (endDate) query['schedule.startDateTime'].$lte = endDate;
  }
  
  const [events, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort({ 'schedule.startDateTime': 1 }),
    this.countDocuments(query)
  ]);
  
  return {
    events,
    total,
    hasMore: total > skip + events.length
  };
};

calendarEventSchema.statics.getUpcomingEvents = async function(tenantId, userId, days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  const events = await this.find({
    tenantId,
    $or: [
      { ownerId: userId },
      { 'participants.participantId': userId }
    ],
    'schedule.startDateTime': {
      $gte: startDate,
      $lte: endDate
    },
    'eventInfo.status': { $in: ['scheduled', 'confirmed'] },
    isDeleted: false
  })
  .sort({ 'schedule.startDateTime': 1 })
  .limit(20);
  
  return events;
};

calendarEventSchema.statics.getPendingReminders = async function() {
  const now = new Date();
  
  const events = await this.find({
    'reminders.sent': false,
    'reminders.active': true,
    'eventInfo.status': { $in: ['scheduled', 'confirmed'] },
    isDeleted: false
  });
  
  const pendingReminders = [];
  
  events.forEach(event => {
    event.reminders.forEach((reminder, index) => {
      if (!reminder.sent && reminder.active) {
        let reminderTime;
        
        if (reminder.timing === 'at_time' && reminder.customTime) {
          reminderTime = reminder.customTime;
        } else if (reminder.timing === 'before' && reminder.minutes) {
          reminderTime = new Date(event.schedule.startDateTime.getTime() - (reminder.minutes * 60000));
        }
        
        if (reminderTime && reminderTime <= now) {
          pendingReminders.push({
            eventId: event._id,
            event,
            reminder,
            reminderIndex: index
          });
        }
      }
    });
  });
  
  return pendingReminders;
};

/**
 * Export schema for ConnectionManager registration
 */
module.exports = {
  schema: calendarEventSchema,
  modelName: 'CalendarEvent',
  
  createModel: function(connection) {
    if (connection) {
      return connection.model('CalendarEvent', calendarEventSchema);
    } else {
      return mongoose.model('CalendarEvent', calendarEventSchema);
    }
  }
};

module.exports.CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
module.exports.calendarEventSchema = calendarEventSchema;