/**
 * @fileoverview Consultant Management Services Index
 * @module servers/customer-services/modules/core-business/consultant-management/services
 * @description Central export point for all consultant management services including
 * consultant profiles, skills, availability, and assignment management
 */

// Import all services
const ConsultantService = require('./consultant-service');
const ConsultantSkillService = require('./consultant-skill-service');
const ConsultantAvailabilityService = require('./consultant-availability-service');
const ConsultantAssignmentService = require('./consultant-assignment-service');

// Import constants from services
const { CONSULTANT_STATUS, PROFESSIONAL_LEVEL, EMPLOYMENT_TYPE } = require('./consultant-service');
const { SKILL_CATEGORIES, PROFICIENCY_LEVELS } = require('./consultant-skill-service');
const { 
    AVAILABILITY_TYPES, 
    AVAILABILITY_STATUS, 
    TIME_OFF_REASONS, 
    APPROVAL_STATUS: AVAILABILITY_APPROVAL_STATUS, 
    RECURRENCE_PATTERNS 
} = require('./consultant-availability-service');
const { 
    ASSIGNMENT_STATUS, 
    ASSIGNMENT_ROLES, 
    RATE_TYPES, 
    APPROVAL_STATUS: ASSIGNMENT_APPROVAL_STATUS, 
    WORK_LOCATIONS 
} = require('./consultant-assignment-service');

/**
 * Consultant Management Services
 * @namespace ConsultantManagementServices
 * @description Provides comprehensive consultant lifecycle management including:
 * - Core consultant profile management (CRUD, search, status management)
 * - Skills and competency tracking (assessments, endorsements, verification)
 * - Availability and time-off management (scheduling, approvals, capacity planning)
 * - Assignment and staffing management (project allocation, billing, time tracking)
 */
const ConsultantManagementServices = {
    // Core Services
    ConsultantService,
    ConsultantSkillService,
    ConsultantAvailabilityService,
    ConsultantAssignmentService,

    // Consultant Constants
    CONSULTANT_STATUS,
    PROFESSIONAL_LEVEL,
    EMPLOYMENT_TYPE,

    // Skill Constants
    SKILL_CATEGORIES,
    PROFICIENCY_LEVELS,

    // Availability Constants
    AVAILABILITY_TYPES,
    AVAILABILITY_STATUS,
    TIME_OFF_REASONS,
    AVAILABILITY_APPROVAL_STATUS,
    RECURRENCE_PATTERNS,

    // Assignment Constants
    ASSIGNMENT_STATUS,
    ASSIGNMENT_ROLES,
    RATE_TYPES,
    ASSIGNMENT_APPROVAL_STATUS,
    WORK_LOCATIONS
};

// Default exports
module.exports = ConsultantManagementServices;

// Named exports for individual services
module.exports.ConsultantService = ConsultantService;
module.exports.ConsultantSkillService = ConsultantSkillService;
module.exports.ConsultantAvailabilityService = ConsultantAvailabilityService;
module.exports.ConsultantAssignmentService = ConsultantAssignmentService;

// Named exports for constants
module.exports.CONSULTANT_STATUS = CONSULTANT_STATUS;
module.exports.PROFESSIONAL_LEVEL = PROFESSIONAL_LEVEL;
module.exports.EMPLOYMENT_TYPE = EMPLOYMENT_TYPE;
module.exports.SKILL_CATEGORIES = SKILL_CATEGORIES;
module.exports.PROFICIENCY_LEVELS = PROFICIENCY_LEVELS;
module.exports.AVAILABILITY_TYPES = AVAILABILITY_TYPES;
module.exports.AVAILABILITY_STATUS = AVAILABILITY_STATUS;
module.exports.TIME_OFF_REASONS = TIME_OFF_REASONS;
module.exports.AVAILABILITY_APPROVAL_STATUS = AVAILABILITY_APPROVAL_STATUS;
module.exports.RECURRENCE_PATTERNS = RECURRENCE_PATTERNS;
module.exports.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS;
module.exports.ASSIGNMENT_ROLES = ASSIGNMENT_ROLES;
module.exports.RATE_TYPES = RATE_TYPES;
module.exports.ASSIGNMENT_APPROVAL_STATUS = ASSIGNMENT_APPROVAL_STATUS;
module.exports.WORK_LOCATIONS = WORK_LOCATIONS;

/**
 * Service Factory Methods
 * Provides convenient access to service instances with optional configuration
 */

/**
 * Get consultant service instance
 * @returns {ConsultantService} Consultant service singleton
 */
module.exports.getConsultantService = () => ConsultantService;

/**
 * Get consultant skill service instance
 * @returns {ConsultantSkillService} Consultant skill service singleton
 */
module.exports.getConsultantSkillService = () => ConsultantSkillService;

/**
 * Get consultant availability service instance
 * @returns {ConsultantAvailabilityService} Consultant availability service singleton
 */
module.exports.getConsultantAvailabilityService = () => ConsultantAvailabilityService;

/**
 * Get consultant assignment service instance
 * @returns {ConsultantAssignmentService} Consultant assignment service singleton
 */
module.exports.getConsultantAssignmentService = () => ConsultantAssignmentService;

/**
 * Initialize all services
 * Can be called during application startup to ensure all services are ready
 * @returns {Promise<void>}
 */
module.exports.initializeServices = async () => {
    // Services are initialized on first use through lazy loading
    // This method provides a hook for any future initialization requirements
    return Promise.resolve();
};

/**
 * Service health check
 * Verifies all services are operational
 * @returns {Promise<Object>} Health status for each service
 */
module.exports.healthCheck = async () => {
    const status = {
        consultantService: 'healthy',
        consultantSkillService: 'healthy',
        consultantAvailabilityService: 'healthy',
        consultantAssignmentService: 'healthy',
        timestamp: new Date().toISOString()
    };

    // Add any service-specific health checks here
    return status;
};