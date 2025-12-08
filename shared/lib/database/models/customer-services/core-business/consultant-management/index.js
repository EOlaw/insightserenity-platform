'use strict';

/**
 * @fileoverview Consultant Management Models Index
 * @module shared/lib/database/models/customer-services/core-business/consultant-management
 * @description Exports all consultant management models
 */

const consultantModel = require('./consultant-model');
const consultantSkillModel = require('./consultant-skill-model');
const consultantAvailabilityModel = require('./consultant-availability-model');
const consultantAssignmentModel = require('./consultant-assignment-model');

module.exports = {
    // Main Consultant Model
    Consultant: consultantModel.Consultant,
    consultantSchema: consultantModel.consultantSchema,
    createConsultantModel: consultantModel.createModel,

    // Consultant Skill Model
    ConsultantSkill: consultantSkillModel.ConsultantSkill,
    consultantSkillSchema: consultantSkillModel.consultantSkillSchema,
    createConsultantSkillModel: consultantSkillModel.createModel,

    // Consultant Availability Model
    ConsultantAvailability: consultantAvailabilityModel.ConsultantAvailability,
    consultantAvailabilitySchema: consultantAvailabilityModel.consultantAvailabilitySchema,
    createConsultantAvailabilityModel: consultantAvailabilityModel.createModel,

    // Consultant Assignment Model
    ConsultantAssignment: consultantAssignmentModel.ConsultantAssignment,
    consultantAssignmentSchema: consultantAssignmentModel.consultantAssignmentSchema,
    createConsultantAssignmentModel: consultantAssignmentModel.createModel,

    // Schema collection for ConnectionManager registration
    schemas: {
        Consultant: consultantModel,
        ConsultantSkill: consultantSkillModel,
        ConsultantAvailability: consultantAvailabilityModel,
        ConsultantAssignment: consultantAssignmentModel
    }
};