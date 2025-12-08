/**
 * @fileoverview Consultant Management Controllers Index
 * @module servers/customer-services/modules/core-business/consultant-management/controllers
 * @description Central export point for all consultant management controllers and validation rules
 */

const consultantController = require('./consultant-controller');
const consultantSkillController = require('./consultant-skill-controller');
const consultantAvailabilityController = require('./consultant-availability-controller');
const consultantAssignmentController = require('./consultant-assignment-controller');

// Extract controller classes for direct instantiation if needed
const { ConsultantController } = require('./consultant-controller');
const { ConsultantSkillController } = require('./consultant-skill-controller');
const { ConsultantAvailabilityController } = require('./consultant-availability-controller');
const { ConsultantAssignmentController } = require('./consultant-assignment-controller');

/**
 * All validation rules grouped by controller
 */
const validationRules = {
    consultant: {
        create: ConsultantController.createValidation,
        update: ConsultantController.updateValidation,
        list: ConsultantController.listValidation,
        availability: ConsultantController.availabilityValidation,
        addSkill: ConsultantController.addSkillValidation,
        addCertification: ConsultantController.addCertificationValidation,
        addReview: ConsultantController.addReviewValidation,
        addDocument: ConsultantController.addDocumentValidation
    },
    skill: {
        create: ConsultantSkillController.createValidation,
        update: ConsultantSkillController.updateValidation,
        list: ConsultantSkillController.listValidation,
        assessment: ConsultantSkillController.assessmentValidation,
        endorsement: ConsultantSkillController.endorsementValidation,
        projectExperience: ConsultantSkillController.projectExperienceValidation,
        course: ConsultantSkillController.courseValidation
    },
    availability: {
        create: ConsultantAvailabilityController.createValidation,
        update: ConsultantAvailabilityController.updateValidation,
        list: ConsultantAvailabilityController.listValidation,
        timeOff: ConsultantAvailabilityController.timeOffValidation,
        findAvailable: ConsultantAvailabilityController.findAvailableValidation
    },
    assignment: {
        create: ConsultantAssignmentController.createValidation,
        update: ConsultantAssignmentController.updateValidation,
        list: ConsultantAssignmentController.listValidation,
        timeLog: ConsultantAssignmentController.timeLogValidation,
        extend: ConsultantAssignmentController.extendValidation
    }
};

/**
 * Factory function to get controller instances
 * @param {string} controllerName - Name of the controller
 * @returns {Object} Controller instance
 */
function getController(controllerName) {
    const controllers = {
        consultant: consultantController,
        skill: consultantSkillController,
        availability: consultantAvailabilityController,
        assignment: consultantAssignmentController
    };

    if (!controllers[controllerName]) {
        throw new Error(`Controller '${controllerName}' not found`);
    }

    return controllers[controllerName];
}

/**
 * Factory function to get validation rules
 * @param {string} controllerName - Name of the controller
 * @param {string} ruleName - Name of the validation rule
 * @returns {Array} Express validator chain
 */
function getValidation(controllerName, ruleName) {
    const controllerRules = validationRules[controllerName];
    
    if (!controllerRules) {
        throw new Error(`Validation rules for controller '${controllerName}' not found`);
    }

    const rule = controllerRules[ruleName];
    
    if (!rule) {
        throw new Error(`Validation rule '${ruleName}' for controller '${controllerName}' not found`);
    }

    return rule();
}

/**
 * Initialize all controllers (if needed for dependency injection)
 * @param {Object} dependencies - Dependencies to inject
 * @returns {Object} Initialized controllers
 */
function initializeControllers(dependencies = {}) {
    // Controllers are singletons by default
    // This function can be used for testing or custom initialization
    return {
        consultant: consultantController,
        skill: consultantSkillController,
        availability: consultantAvailabilityController,
        assignment: consultantAssignmentController
    };
}

/**
 * Health check for all controllers
 * @returns {Object} Health status
 */
function healthCheck() {
    return {
        consultant: !!consultantController,
        skill: !!consultantSkillController,
        availability: !!consultantAvailabilityController,
        assignment: !!consultantAssignmentController,
        status: 'healthy',
        timestamp: new Date().toISOString()
    };
}

// Export singleton instances
module.exports = {
    // Controller instances
    consultantController,
    consultantSkillController,
    consultantAvailabilityController,
    consultantAssignmentController,

    // Controller classes
    ConsultantController,
    ConsultantSkillController,
    ConsultantAvailabilityController,
    ConsultantAssignmentController,

    // Validation rules
    validationRules,

    // Factory functions
    getController,
    getValidation,
    initializeControllers,
    healthCheck
};

// Named exports for ES6 style imports
module.exports.default = {
    consultantController,
    consultantSkillController,
    consultantAvailabilityController,
    consultantAssignmentController
};