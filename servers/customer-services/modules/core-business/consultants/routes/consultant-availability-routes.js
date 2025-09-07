'use strict';

/**
 * @fileoverview Comprehensive consultant availability management routes with calendar integration, booking operations, and capacity planning
 * @module servers/customer-services/modules/core-business/consultants/routes/consultant-availability-routes
 * @requires express
 * @requires module:servers/customer-services/modules/core-business/consultants/controllers/consultant-availability-controller
 * @requires module:shared/lib/auth/middleware/authenticate
 * @requires module:shared/lib/auth/middleware/authorize
 * @requires module:shared/lib/auth/middleware/rate-limit
 * @requires module:shared/lib/middleware/security/request-sanitizer
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const ConsultantAvailabilityController = require('../controllers/consultant-availability-controller');
// const AvailabilityValidators = require('../validators/availability-validators');
// const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
// const {
//   createLimiter,
//   limitByIP,
//   limitByUser,
//   limitByEndpoint,
//   combinedLimit,
//   customLimit,
//   costBasedLimit,
//   adaptiveLimit
// } = require('../../../../../shared/lib/auth/middleware/rate-limit');
// const { requestSanitizer } = require('../../../../../shared/lib/middleware/security/request-sanitizer');
// const { middleware: auditMiddleware, logEvent: auditLogEvent } = require('../../../../../shared/lib/middleware/logging/audit-logger');
// const { validate: requestValidator } = require('../../../../../shared/lib/middleware/validation/request-validator');
// const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Advanced rate limiting configurations for availability operations
 */
const AVAILABILITY_RATE_LIMITS = {
  // Default rate limiting for availability operations
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150,
    message: 'Too many availability requests from this IP, please try again later.',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false
  },
  
  // Availability read operations
  read: {
    windowMs: 1 * 60 * 1000, // 1 minute
    baseMax: 250,
    minMax: 125,
    maxMax: 500,
    message: 'Availability read rate limit exceeded.',
    headers: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Availability write operations
  write: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 60,
    message: 'Availability write rate limit exceeded.',
    headers: true,
    burstProtection: true,
    skipSuccessfulRequests: false,
    skipFailedRequests: true
  },
  
  // Booking operations
  booking: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Booking operation rate limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_booking`
  },
  
  // Calendar sync operations
  sync: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 20,
    message: 'Calendar sync rate limit exceeded.',
    headers: true
  },
  
  // Search operations
  search: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 100,
    message: 'Availability search rate limit exceeded.',
    headers: true
  },
  
  // Analytics operations
  analytics: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxCost: 8000,
    message: 'Availability analytics cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_analytics`
  },
  
  // Capacity planning operations
  capacity: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 6000,
    message: 'Capacity planning cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_capacity`
  },
  
  // Conflict detection/resolution
  conflict: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 30,
    message: 'Conflict operation rate limit exceeded.',
    headers: true
  },
  
  // Bulk operations
  bulk: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxCost: 15000,
    message: 'Bulk availability operation cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_bulk`
  },
  
  // Export/Import operations
  export: {
    windowMs: 20 * 60 * 1000, // 20 minutes
    maxCost: 5000,
    message: 'Availability export cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_export`
  },
  
  // Optimization operations
  optimization: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxCost: 7000,
    message: 'Utilization optimization cost limit exceeded.',
    headers: true,
    keyGenerator: (req) => `${req.ip}_${req.user?.id || 'anonymous'}_optimization`
  },
  
  // Real-time operations
  realtime: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120,
    message: 'Real-time availability rate limit exceeded.',
    headers: true
  }
};

/**
 * Enhanced cost calculator for availability operations
 */
const calculateAvailabilityCost = (req) => {
  let cost = 25; // Base cost for availability operations
  
  // Path-based cost calculation
  const pathCosts = {
    'search': 100,
    'match': 200,
    'optimize': 300,
    'capacity': 250,
    'analytics': 180,
    'forecast': 220,
    'conflicts': 150,
    'dashboard': 160,
    'report': 200,
    'bulk': 400,
    'export': 180,
    'import': 250,
    'sync': 120,
    'booking': 80,
    'schedule': 90,
    'utilization': 140,
    'timeline': 100,
    'working-hours': 60,
    'time-off': 70,
    'commitment': 80
  };

  Object.entries(pathCosts).forEach(([keyword, additionalCost]) => {
    if (req.path.includes(keyword)) {
      cost += additionalCost;
    }
  });
  
  // Request body analysis
  if (req.body) {
    if (req.body.consultants && Array.isArray(req.body.consultants)) {
      cost += req.body.consultants.length * 20;
    }
    
    if (req.body.bookings && Array.isArray(req.body.bookings)) {
      cost += req.body.bookings.length * 25;
    }
    
    if (req.body.updates && Array.isArray(req.body.updates)) {
      cost += req.body.updates.length * 18;
    }
    
    if (req.body.includeBookings === 'true') cost += 60;
    if (req.body.includeConflicts === 'true') cost += 80;
    if (req.body.includeUtilization === 'true') cost += 70;
    if (req.body.includeAnalytics === 'true') cost += 90;
    if (req.body.includeProjections === 'true') cost += 100;
    if (req.body.includeRecommendations === 'true') cost += 80;
    if (req.body.syncExternalCalendar === 'true') cost += 120;
    if (req.body.autoScheduleReviews === 'true') cost += 90;
    
    // Complex matching criteria
    if (req.body.requiredSkills && Array.isArray(req.body.requiredSkills)) {
      cost += req.body.requiredSkills.length * 15;
    }
    if (req.body.timeframe && req.body.timeframe === 'realtime') cost += 150;
    
    const bodySize = JSON.stringify(req.body).length;
    if (bodySize > 100000) { // 100KB
      cost += Math.floor(bodySize / 10000) * 12;
    }
  }

  // Query parameter analysis
  if (req.query) {
    if (req.query.includeBookings === 'true') cost += 40;
    if (req.query.includeConflicts === 'true') cost += 60;
    if (req.query.includeUtilization === 'true') cost += 50;
    if (req.query.includeAnalytics === 'true') cost += 70;
    if (req.query.includeCalendar === 'true') cost += 80;
    if (req.query.includeProjections === 'true') cost += 80;
    if (req.query.includeMarketTrends === 'true') cost += 90;
    
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) cost += Math.ceil((limit - 100) / 50) * 25;
    
    // Date range complexity
    if (req.query.startDate && req.query.endDate) {
      const start = new Date(req.query.startDate);
      const end = new Date(req.query.endDate);
      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      if (daysDiff > 90) cost += Math.floor(daysDiff / 30) * 20;
    }
  }
  
  return Math.min(cost, 30000); // Cap at 30000
};

/**
 * Enhanced availability operation logger
 */
const availabilityOperationLogger = (operation) => {
  return async (req, res, next) => {
    try {
      const operationMetadata = {
        operation,
        consultantId: req.consultantContext?.consultantId || req.params.consultantId,
        bookingId: req.params.bookingId,
        conflictId: req.params.conflictId,
        goalId: req.params.goalId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        userAgent: req.get('user-agent'),
        requestSize: JSON.stringify(req.body || {}).length,
        queryParams: req.query
      };

      // logger.info(`Availability operation initiated: ${operation}`, operationMetadata);

      // Store operation context
      req.availabilityOperationContext = {
        operation,
        startTime: Date.now(),
        metadata: operationMetadata
      };

      next();
    } catch (error) {
      // logger.error('Failed to log availability operation', {
      //   operation,
      //   error: error.message
      // });
      next();
    }
  };
};

/**
 * Enhanced middleware to validate availability access
 */
const validateAvailabilityAccess = async (req, res, next) => {
  try {
    const consultantId = req.consultantContext?.consultantId || req.params.consultantId;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userPermissions = req.user?.permissions || [];
    
    // Access validation rules for availability
    const accessValidationRules = {
      'availability_read': {
        allowedRoles: ['admin', 'manager', 'user', 'viewer', 'hr', 'scheduler'],
        requiredPermissions: ['consultant_availability.read'],
        paths: ['/dashboard', '/summary', '/timeline', '/capacity', '/utilization']
      },
      'availability_write': {
        allowedRoles: ['admin', 'manager', 'hr', 'scheduler', 'user'],
        requiredPermissions: ['consultant_availability.update'],
        paths: ['/schedule', '/working-hours', '/time-off', '/commitment']
      },
      'availability_book': {
        allowedRoles: ['admin', 'manager', 'user', 'scheduler'],
        requiredPermissions: ['consultant_availability.book'],
        paths: ['/booking', '/book', '/reserve']
      },
      'availability_analytics': {
        allowedRoles: ['admin', 'manager', 'analyst', 'hr'],
        requiredPermissions: ['consultant_availability.analytics'],
        paths: ['/analytics', '/capacity', '/optimization', '/forecast', '/reports']
      },
      'availability_conflicts': {
        allowedRoles: ['admin', 'manager', 'hr', 'scheduler'],
        requiredPermissions: ['consultant_availability.conflicts'],
        paths: ['/conflicts', '/resolve']
      },
      'availability_sync': {
        allowedRoles: ['admin', 'hr', 'scheduler'],
        requiredPermissions: ['consultant_availability.sync'],
        paths: ['/sync', '/calendar']
      },
      'availability_bulk': {
        allowedRoles: ['admin', 'hr'],
        requiredPermissions: ['consultant_availability.bulk_update'],
        paths: ['/bulk']
      }
    };

    // Self-access validation for consultants
    if (consultantId === userId) {
      // Consultants can read their own availability and update basic settings
      if (req.method === 'GET' || 
          (req.method === 'POST' && req.path.includes('time-off')) ||
          (req.method === 'PATCH' && req.path.includes('working-hours'))) {
        return next();
      }
    }

    // Validate based on request path and method
    for (const [resourceType, rules] of Object.entries(accessValidationRules)) {
      if (rules.paths.some(path => req.path.includes(path))) {
        // Role-based validation
        if (!rules.allowedRoles.includes(userRole)) {
          // logger.warn('Unauthorized availability access attempt', {
          //   consultantId,
          //   userId,
          //   userRole,
          //   requiredRoles: rules.allowedRoles
          // });
          
          return res.status(403).json({
            success: false,
            message: `Insufficient role permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.allowedRoles
          });
        }

        // Permission-based validation
        const hasRequiredPermissions = rules.requiredPermissions.every(permission =>
          userPermissions.includes(permission)
        );

        if (!hasRequiredPermissions) {
          // logger.warn('Insufficient permissions for availability access', {
          //   consultantId,
          //   userId,
          //   userPermissions,
          //   requiredPermissions: rules.requiredPermissions
          // });
          
          return res.status(403).json({
            success: false,
            message: `Insufficient permissions for ${resourceType.replace('_', ' ')}`,
            required: rules.requiredPermissions
          });
        }
      }
    }
    
    // logger.debug('Availability access validated successfully', {
    //   consultantId,
    //   userId,
    //   userRole
    // });
    
    next();
  } catch (error) {
    // logger.error('Failed to validate availability access', {
    //   error: error.message,
    //   userId: req.user?.id
    // });
    
    return res.status(500).json({
      success: false,
      message: 'Availability access validation failed'
    });
  }
};

/**
 * Validate availability data middleware
 */
const validateAvailabilityData = async (req, res, next) => {
  try {
    const validationErrors = [];
    
    // Validate working hours data
    if (req.body.workingHours) {
      if (req.body.timeZone && !isValidTimezone(req.body.timeZone)) {
        validationErrors.push('Invalid timezone');
      }
    }
    
    // Validate booking data
    if (req.body.period) {
      if (!req.body.period.start || !req.body.period.end) {
        validationErrors.push('Booking period must include start and end dates');
      }
      
      if (req.body.period.start && req.body.period.end) {
        const start = new Date(req.body.period.start);
        const end = new Date(req.body.period.end);
        
        if (end <= start) {
          validationErrors.push('End date must be after start date');
        }
        
        const duration = (end - start) / (1000 * 60 * 60); // hours
        if (duration < 0.5) {
          validationErrors.push('Minimum booking duration is 30 minutes');
        }
        if (duration > 8760) { // 1 year
          validationErrors.push('Maximum booking duration is 1 year');
        }
      }
    }
    
    // Validate allocation data
    if (req.body.allocation) {
      if (req.body.allocation.percentage && 
          (req.body.allocation.percentage < 0 || req.body.allocation.percentage > 100)) {
        validationErrors.push('Allocation percentage must be between 0 and 100');
      }
    }
    
    // Validate capacity data
    if (req.body.capacity) {
      if (req.body.capacity.hoursPerDay && 
          (req.body.capacity.hoursPerDay < 1 || req.body.capacity.hoursPerDay > 24)) {
        validationErrors.push('Hours per day must be between 1 and 24');
      }
      
      if (req.body.capacity.daysPerWeek && 
          (req.body.capacity.daysPerWeek < 1 || req.body.capacity.daysPerWeek > 7)) {
        validationErrors.push('Days per week must be between 1 and 7');
      }
    }
    
    // Validate time off data
    if (req.body.type || req.body.timeOffType) {
      const allowedTypes = ['vacation', 'sick', 'personal', 'training', 'conference'];
      const type = req.body.type || req.body.timeOffType;
      if (!allowedTypes.includes(type)) {
        validationErrors.push(`Invalid time off type. Allowed: ${allowedTypes.join(', ')}`);
      }
    }
    
    // Validate conflict resolution data
    if (req.body.strategy) {
      const allowedStrategies = ['reschedule', 'reassign', 'split', 'override'];
      if (!allowedStrategies.includes(req.body.strategy)) {
        validationErrors.push(`Invalid resolution strategy. Allowed: ${allowedStrategies.join(', ')}`);
      }
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    next();
  } catch (error) {
    // logger.error('Failed to validate availability data', {
    //   error: error.message
    // });
    next();
  }
};

/**
 * Simple timezone validation function
 */
function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (ex) {
    return false;
  }
}

/**
 * Parameter validation middleware
 */
router.param('bookingId', (req, res, next, bookingId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(bookingId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid booking ID format'
    });
  }
  req.params.bookingId = bookingId;
  next();
});

router.param('conflictId', (req, res, next, conflictId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(conflictId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid conflict ID format'
    });
  }
  req.params.conflictId = conflictId;
  next();
});

router.param('goalId', (req, res, next, goalId) => {
  if (!/^[0-9a-fA-F]{24}$/.test(goalId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid goal ID format'
    });
  }
  req.params.goalId = goalId;
  next();
});

/**
 * Apply middleware to all availability routes
 */
// router.use(authenticate);
// router.use(requestSanitizer({
//   sanitizeFields: ['reason', 'notes', 'description'],
//   removeFields: ['password', 'token', 'apiKey'],
//   maxDepth: 10,
//   maxKeys: 100
// }));

/**
 * ===============================================================================
 * AVAILABILITY CORE ROUTES
 * Core availability management operations
 * ===============================================================================
 */

// Initialize consultant availability
router.post(
  '/initialize',
  // authorize(['admin', 'manager', 'hr']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  // AvailabilityValidators.validateInitialize,
  validateAvailabilityData,
  availabilityOperationLogger('availability-initialize'),
  ConsultantAvailabilityController.initializeAvailability
);

// Get consultant availability
router.get(
  '/',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr', 'scheduler']),
  validateAvailabilityAccess,
  // adaptiveLimit(AVAILABILITY_RATE_LIMITS.read),
  ConsultantAvailabilityController.getConsultantAvailability
);

// Get availability dashboard
router.get(
  '/dashboard',
  // authorize(['admin', 'manager', 'user', 'viewer', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  ConsultantAvailabilityController.getAvailabilityDashboard
);

// Update availability schedule
router.patch(
  '/schedule',
  // authorize(['admin', 'manager', 'hr', 'scheduler', 'user']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  // AvailabilityValidators.validateScheduleUpdate,
  validateAvailabilityData,
  availabilityOperationLogger('availability-schedule-update'),
  ConsultantAvailabilityController.updateAvailabilitySchedule
);

// Delete availability data
router.delete(
  '/',
  // authorize(['admin']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  availabilityOperationLogger('availability-delete'),
  ConsultantAvailabilityController.deleteAvailability
);

/**
 * ===============================================================================
 * WORKING HOURS AND SCHEDULE MANAGEMENT ROUTES
 * ===============================================================================
 */

// Update working hours
router.patch(
  '/working-hours',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  // AvailabilityValidators.validateWorkingHours,
  validateAvailabilityData,
  availabilityOperationLogger('working-hours-update'),
  ConsultantAvailabilityController.updateWorkingHours
);

// Add time off
router.post(
  '/time-off',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  // AvailabilityValidators.validateTimeOff,
  validateAvailabilityData,
  availabilityOperationLogger('time-off-add'),
  ConsultantAvailabilityController.addTimeOff
);

// Remove time off
router.delete(
  '/time-off/:timeOffId',
  // authorize(['admin', 'manager', 'hr', 'user']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  availabilityOperationLogger('time-off-remove'),
  ConsultantAvailabilityController.removeTimeOff
);

// Add recurring commitment
router.post(
  '/commitments/recurring',
  // authorize(['admin', 'manager', 'hr', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  // AvailabilityValidators.validateRecurringCommitment,
  validateAvailabilityData,
  availabilityOperationLogger('recurring-commitment-add'),
  ConsultantAvailabilityController.addRecurringCommitment
);

// Remove recurring commitment
router.delete(
  '/commitments/recurring/:commitmentId',
  // authorize(['admin', 'manager', 'hr', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.write),
  availabilityOperationLogger('recurring-commitment-remove'),
  ConsultantAvailabilityController.removeRecurringCommitment
);

/**
 * ===============================================================================
 * BOOKING MANAGEMENT ROUTES
 * ===============================================================================
 */

// Create booking
router.post(
  '/bookings',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.booking),
  // AvailabilityValidators.validateBooking,
  validateAvailabilityData,
  availabilityOperationLogger('booking-create'),
  ConsultantAvailabilityController.createBooking
);

// Get bookings
router.get(
  '/bookings',
  // authorize(['admin', 'manager', 'user', 'viewer', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.read),
  ConsultantAvailabilityController.getBookings
);

// Update booking
router.put(
  '/bookings/:bookingId',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.booking),
  // AvailabilityValidators.validateBookingUpdate,
  validateAvailabilityData,
  availabilityOperationLogger('booking-update'),
  ConsultantAvailabilityController.updateBooking
);

// Cancel booking
router.delete(
  '/bookings/:bookingId',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.booking),
  availabilityOperationLogger('booking-cancel'),
  ConsultantAvailabilityController.cancelBooking
);

/**
 * ===============================================================================
 * AVAILABILITY SEARCH AND MATCHING ROUTES
 * ===============================================================================
 */

// Search available consultants
router.post(
  '/search/consultants',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  // limitByEndpoint(AVAILABILITY_RATE_LIMITS.search),
  // AvailabilityValidators.validateAvailabilitySearch,
  validateAvailabilityData,
  availabilityOperationLogger('consultants-search'),
  ConsultantAvailabilityController.searchAvailableConsultants
);

// Get availability range for multiple consultants
router.get(
  '/range',
  // authorize(['admin', 'manager', 'user', 'viewer', 'scheduler']),
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.search),
  (req, res) => {
    // Get availability range for multiple consultants
    res.json({
      success: true,
      data: {
        consultants: [
          {
            consultantId: '507f1f77bcf86cd799439011',
            name: 'John Doe',
            availability: [
              { date: '2024-01-15', available: true, utilization: 60 },
              { date: '2024-01-16', available: false, utilization: 100 },
              { date: '2024-01-17', available: true, utilization: 40 }
            ]
          }
        ],
        dateRange: {
          start: req.query.startDate,
          end: req.query.endDate
        }
      }
    });
  }
);

/**
 * ===============================================================================
 * CAPACITY PLANNING AND ANALYTICS ROUTES
 * ===============================================================================
 */

// Calculate capacity
router.get(
  '/capacity',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.capacity),
  ConsultantAvailabilityController.calculateCapacity
);

// Get capacity planning data
router.get(
  '/capacity/planning',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.capacity),
  ConsultantAvailabilityController.getCapacityPlanning
);

// Optimize utilization
router.post(
  '/optimization/utilization',
  // authorize(['admin', 'manager', 'analyst']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.optimization),
  availabilityOperationLogger('utilization-optimize'),
  ConsultantAvailabilityController.optimizeUtilization
);

// Get utilization trends
router.get(
  '/utilization/trends',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  ConsultantAvailabilityController.getUtilizationTrends
);

// Generate optimization recommendations
router.get(
  '/optimization/recommendations',
  // authorize(['admin', 'manager', 'analyst']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  ConsultantAvailabilityController.generateOptimizationRecommendations
);

/**
 * ===============================================================================
 * CONFLICT DETECTION AND RESOLUTION ROUTES
 * ===============================================================================
 */

// Detect conflicts
router.get(
  '/conflicts',
  // authorize(['admin', 'manager', 'hr', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.conflict),
  ConsultantAvailabilityController.detectConflicts
);

// Check availability conflicts for time slot
router.post(
  '/conflicts/check',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.conflict),
  // AvailabilityValidators.validateConflictCheck,
  validateAvailabilityData,
  availabilityOperationLogger('conflicts-check'),
  ConsultantAvailabilityController.checkAvailabilityConflicts
);

// Resolve conflict
router.post(
  '/conflicts/:conflictId/resolve',
  // authorize(['admin', 'manager', 'hr', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.conflict),
  // AvailabilityValidators.validateConflictResolution,
  validateAvailabilityData,
  availabilityOperationLogger('conflict-resolve'),
  ConsultantAvailabilityController.resolveConflict
);

/**
 * ===============================================================================
 * REPORTING AND FORECASTING ROUTES
 * ===============================================================================
 */

// Generate utilization report
router.get(
  '/reports/utilization',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  ConsultantAvailabilityController.generateUtilizationReport
);

// Forecast availability
router.post(
  '/forecast',
  // authorize(['admin', 'manager', 'analyst']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  // AvailabilityValidators.validateForecast,
  availabilityOperationLogger('availability-forecast'),
  ConsultantAvailabilityController.forecastAvailability
);

// Get availability statistics
router.get(
  '/statistics',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  ConsultantAvailabilityController.getAvailabilityStatistics
);

/**
 * ===============================================================================
 * BULK OPERATIONS ROUTES
 * ===============================================================================
 */

// Bulk update availability
router.patch(
  '/bulk/update',
  // authorize(['admin', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.bulk),
  // AvailabilityValidators.validateBulkUpdate,
  validateAvailabilityData,
  availabilityOperationLogger('bulk-availability-update'),
  ConsultantAvailabilityController.bulkUpdateAvailability
);

// Bulk create bookings
router.post(
  '/bulk/bookings',
  // authorize(['admin', 'manager', 'scheduler']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.bulk),
  // AvailabilityValidators.validateBulkBookings,
  validateAvailabilityData,
  availabilityOperationLogger('bulk-bookings-create'),
  ConsultantAvailabilityController.bulkCreateBookings
);

/**
 * ===============================================================================
 * EXPORT AND IMPORT ROUTES
 * ===============================================================================
 */

// Export availability report
router.get(
  '/export/:format',
  // authorize(['admin', 'manager', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.export),
  // AvailabilityValidators.validateExport,
  availabilityOperationLogger('availability-export'),
  ConsultantAvailabilityController.exportAvailabilityReport
);

// Import availability data
router.post(
  '/import',
  // authorize(['admin', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.bulk),
  // AvailabilityValidators.validateImport,
  availabilityOperationLogger('availability-import'),
  ConsultantAvailabilityController.importAvailabilityData
);

/**
 * ===============================================================================
 * CALENDAR INTEGRATION ROUTES
 * ===============================================================================
 */

// Sync calendar data
router.post(
  '/calendar/sync',
  // authorize(['admin', 'hr', 'user']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.sync),
  availabilityOperationLogger('calendar-sync'),
  ConsultantAvailabilityController.syncCalendarData
);

// Calendar webhook endpoint
router.post(
  '/calendar/webhook',
  // Rate limiting for webhooks
  // limitByIP({ windowMs: 60000, max: 100 }),
  (req, res) => {
    // Handle calendar webhook notifications
    res.json({
      success: true,
      message: 'Webhook received',
      timestamp: new Date().toISOString()
    });
  }
);

/**
 * ===============================================================================
 * TIME SLOT VALIDATION ROUTES
 * ===============================================================================
 */

// Validate time slot
router.post(
  '/validate/time-slot',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.default),
  // AvailabilityValidators.validateTimeSlot,
  validateAvailabilityData,
  ConsultantAvailabilityController.validateTimeSlot
);

// Validate availability data
router.post(
  '/validate',
  // authorize(['admin', 'manager', 'hr']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.default),
  ConsultantAvailabilityController.validateAvailabilityData
);

/**
 * ===============================================================================
 * REAL-TIME AVAILABILITY ROUTES
 * ===============================================================================
 */

// Get real-time availability status
router.get(
  '/realtime/status',
  // authorize(['admin', 'manager', 'user', 'viewer', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.realtime),
  (req, res) => {
    // Real-time availability status
    res.json({
      success: true,
      data: {
        status: 'available',
        currentUtilization: 75,
        nextAvailable: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        upcomingBookings: [
          {
            id: 'booking_123',
            start: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
            duration: 120,
            type: 'meeting'
          }
        ],
        lastUpdated: new Date().toISOString()
      }
    });
  }
);

// Real-time availability updates (SSE endpoint)
router.get(
  '/realtime/updates',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial data
    res.write(`data: ${JSON.stringify({
      type: 'status',
      data: { status: 'connected', timestamp: new Date().toISOString() }
    })}\n\n`);

    // Send periodic updates
    const updateInterval = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'availability_update',
        data: {
          consultantId: req.consultantContext?.consultantId,
          status: 'available',
          utilization: Math.floor(Math.random() * 100),
          timestamp: new Date().toISOString()
        }
      })}\n\n`);
    }, 30000); // 30 seconds

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(updateInterval);
    });
  }
);

/**
 * ===============================================================================
 * ADVANCED ANALYTICS AND INSIGHTS ROUTES
 * ===============================================================================
 */

// Get availability insights
router.get(
  '/insights',
  // authorize(['admin', 'manager', 'analyst']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  (req, res) => {
    // AI-powered availability insights
    res.json({
      success: true,
      data: {
        utilizationInsights: {
          trend: 'increasing',
          optimalUtilization: 80,
          currentUtilization: 75,
          recommendation: 'Consider taking on 1-2 more projects'
        },
        scheduleOptimization: {
          blockedTimeRecommendation: '2 hours daily',
          meetingConsolidation: 'Tuesdays and Thursdays',
          focusTimeBlocks: ['9-11 AM', '2-4 PM']
        },
        predictiveAnalytics: {
          busyPeriods: ['Q4 2024', 'March 2025'],
          lightPeriods: ['January 2025'],
          burnoutRisk: 'low'
        }
      }
    });
  }
);

// Get workload balance analysis
router.get(
  '/analysis/workload-balance',
  // authorize(['admin', 'manager', 'analyst', 'hr']),
  validateAvailabilityAccess,
  // costBasedLimit(calculateAvailabilityCost, AVAILABILITY_RATE_LIMITS.analytics),
  (req, res) => {
    // Workload balance analysis
    res.json({
      success: true,
      data: {
        balance: {
          score: 8.2,
          distribution: {
            projects: 60,
            meetings: 25,
            admin: 10,
            learning: 5
          }
        },
        recommendations: [
          'Reduce meeting frequency by 20%',
          'Allocate more time for skill development',
          'Consider delegating administrative tasks'
        ],
        riskFactors: [
          'High meeting density on Wednesdays',
          'Limited buffer time between projects'
        ]
      }
    });
  }
);

/**
 * ===============================================================================
 * AVAILABILITY AUTOMATION ROUTES
 * ===============================================================================
 */

// Auto-schedule optimization
router.post(
  '/automation/optimize-schedule',
  // authorize(['admin', 'manager']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.optimization),
  availabilityOperationLogger('schedule-auto-optimize'),
  (req, res) => {
    // Automated schedule optimization
    res.json({
      success: true,
      data: {
        optimizationId: `opt_${Date.now()}`,
        status: 'processing',
        estimatedCompletion: new Date(Date.now() + 180000).toISOString(), // 3 minutes
        changes: {
          moved: 2,
          consolidated: 3,
          bufferAdded: 5
        }
      }
    });
  }
);

// Smart booking suggestions
router.get(
  '/suggestions/booking',
  // authorize(['admin', 'manager', 'user', 'scheduler']),
  validateAvailabilityAccess,
  // limitByUser(AVAILABILITY_RATE_LIMITS.read),
  (req, res) => {
    // AI-powered booking suggestions
    res.json({
      success: true,
      data: {
        suggestions: [
          {
            timeSlot: {
              start: '2024-01-15T09:00:00Z',
              end: '2024-01-15T11:00:00Z'
            },
            confidence: 0.92,
            reason: 'Optimal energy period based on historical performance',
            conflictRisk: 'low'
          },
          {
            timeSlot: {
              start: '2024-01-15T14:00:00Z',
              end: '2024-01-15T16:00:00Z'
            },
            confidence: 0.85,
            reason: 'Good availability with minimal meeting conflicts',
            conflictRisk: 'none'
          }
        ]
      }
    });
  }
);

/**
 * ===============================================================================
 * HEALTH CHECK AND MONITORING ROUTES
 * ===============================================================================
 */

// Availability service health check
router.get(
  '/health',
  (req, res) => {
    res.status(200).json({
      success: true,
      service: 'consultant-availability-management',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.SERVICE_VERSION || '1.0.0',
      metrics: {
        activeBookings: 1247,
        conflictsDetected: 3,
        utilizationAverage: 76.8
      }
    });
  }
);

/**
 * ===============================================================================
 * ERROR HANDLING MIDDLEWARE
 * ===============================================================================
 */
router.use((err, req, res, next) => {
  const errorContext = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    consultantId: req.consultantContext?.consultantId || req.params.consultantId,
    bookingId: req.params?.bookingId,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  };

  // logger.error('Availability route error', errorContext);

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Handle specific error types
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An internal server error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Availability validation failed';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Availability conflict detected';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    message = 'Scheduling conflict';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Availability data not found';
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'AVAILABILITY_ERROR',
      message,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        stack: err.stack,
        details: err.details
      })
    }
  });
});

module.exports = router;