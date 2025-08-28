/**
 * @file Business Context Middleware
 * @description Business logic context middleware for customer services with domain-specific
 *              context management, workflow tracking, and business rule enforcement
 * @version 2.1.0
 * @author InsightSerenity Platform Team
 * @module insightserenity-platform/servers/customer-services/middleware/business-context
 * @requires ../../../shared/lib/utils/logger
 * @requires ../../../shared/lib/utils/app-error
 * @requires ../../../shared/lib/database
 * @requires ../../../shared/lib/services/cache-service
 * @requires ../../../shared/lib/services/analytics-service
 */

'use strict';

const logger = require('../../../shared/lib/utils/logger');
const { AppError } = require('../../../shared/lib/utils/app-error');
const Database = require('../../../shared/lib/database');
const CacheService = require('../../../shared/lib/services/cache-service');
const AnalyticsService = require('../../../shared/lib/services/analytics-service');

/**
 * Business Context Middleware
 * Manages domain-specific context for:
 * - Project management workflows
 * - Client relationship management
 * - Consultant engagement tracking
 * - Recruitment process management
 * - Organization hierarchy enforcement
 * - Business rule validation
 * - Workflow state management
 * - Cross-domain data consistency
 */
class BusinessContextMiddleware {
    constructor(options = {}) {
        this.config = {
            enabled: options.enabled !== false,
            enableProjectContext: options.enableProjectContext !== false,
            enableClientContext: options.enableClientContext !== false,
            enableConsultantContext: options.enableConsultantContext !== false,
            enableRecruitmentContext: options.enableRecruitmentContext !== false,
            enableWorkflowTracking: options.enableWorkflowTracking !== false,
            enableBusinessRules: options.enableBusinessRules !== false,
            cacheEnabled: options.cacheEnabled !== false,
            cacheTTL: options.cacheTTL || 300, // 5 minutes
            strictValidation: options.strictValidation === true,
            
            // Business domain mappings
            domainMappings: {
                '/api/projects': 'project_management',
                '/api/clients': 'client_management', 
                '/api/consultants': 'consultant_management',
                '/api/engagements': 'engagement_management',
                '/api/jobs': 'recruitment',
                '/api/candidates': 'recruitment',
                '/api/applications': 'recruitment',
                '/api/partnerships': 'partnership_management',
                '/api/analytics': 'analytics',
                '/api/organizations': 'organization_management',
                '/api/subscriptions': 'subscription_management'
            },

            // Workflow state machines
            workflowStates: {
                project: {
                    states: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
                    transitions: {
                        planning: ['active', 'cancelled'],
                        active: ['on_hold', 'completed', 'cancelled'],
                        on_hold: ['active', 'cancelled'],
                        completed: [],
                        cancelled: []
                    },
                    permissions: {
                        planning: ['project_manager', 'admin'],
                        active: ['project_manager', 'team_member', 'admin'],
                        on_hold: ['project_manager', 'admin'],
                        completed: ['project_manager', 'admin'],
                        cancelled: ['project_manager', 'admin']
                    }
                },

                engagement: {
                    states: ['draft', 'proposed', 'negotiating', 'active', 'completed', 'cancelled'],
                    transitions: {
                        draft: ['proposed', 'cancelled'],
                        proposed: ['negotiating', 'active', 'cancelled'],
                        negotiating: ['active', 'proposed', 'cancelled'],
                        active: ['completed'],
                        completed: [],
                        cancelled: []
                    },
                    permissions: {
                        draft: ['consultant', 'client_manager', 'admin'],
                        proposed: ['consultant', 'client_manager', 'admin'],
                        negotiating: ['consultant', 'client_manager', 'admin'],
                        active: ['consultant', 'client_manager', 'admin'],
                        completed: ['consultant', 'client_manager', 'admin'],
                        cancelled: ['client_manager', 'admin']
                    }
                },

                recruitment: {
                    states: ['draft', 'published', 'active', 'paused', 'filled', 'cancelled'],
                    transitions: {
                        draft: ['published', 'cancelled'],
                        published: ['active', 'paused', 'cancelled'],
                        active: ['paused', 'filled', 'cancelled'],
                        paused: ['active', 'cancelled'],
                        filled: [],
                        cancelled: []
                    },
                    permissions: {
                        draft: ['recruiter', 'hiring_manager', 'admin'],
                        published: ['recruiter', 'hiring_manager', 'admin'],
                        active: ['recruiter', 'hiring_manager', 'admin'],
                        paused: ['recruiter', 'hiring_manager', 'admin'],
                        filled: ['recruiter', 'hiring_manager', 'admin'],
                        cancelled: ['hiring_manager', 'admin']
                    }
                }
            },

            // Business rules
            businessRules: {
                project_creation: {
                    requiresApproval: false,
                    maxConcurrentProjects: 50,
                    requiredFields: ['name', 'clientId', 'projectManagerId'],
                    subscriptionGates: {
                        free: { maxProjects: 3 },
                        professional: { maxProjects: 25 },
                        business: { maxProjects: 100 },
                        enterprise: { maxProjects: -1 }
                    }
                },

                client_onboarding: {
                    requiresApproval: true,
                    requiredDocuments: ['contract', 'nda'],
                    approvalWorkflow: ['sales_manager', 'legal', 'finance'],
                    autoAssignAccountManager: true
                },

                consultant_engagement: {
                    requiresSkillsMatch: true,
                    minimumSkillScore: 0.8,
                    requiresAvailabilityCheck: true,
                    maxConcurrentEngagements: 5,
                    rateValidation: true
                },

                job_posting: {
                    requiresApproval: false,
                    autoPublish: true,
                    requiredFields: ['title', 'description', 'requirements', 'location'],
                    skillsRequired: true,
                    salaryRangeRequired: true
                }
            }
        };

        this.cache = CacheService ? CacheService.getInstance() : null;
        this.analytics = AnalyticsService ? AnalyticsService.getInstance() : null;
        this.contextCache = new Map();
        this.workflowStates = new Map();
        this.businessMetrics = new Map();

        // Initialize background processes
        this.initializeBackgroundProcesses();

        console.log('Business context middleware initialized');
        logger.info('Business context middleware initialized', {
            enabled: this.config.enabled,
            projectContext: this.config.enableProjectContext,
            clientContext: this.config.enableClientContext,
            consultantContext: this.config.enableConsultantContext,
            recruitmentContext: this.config.enableRecruitmentContext,
            workflowTracking: this.config.enableWorkflowTracking,
            businessRules: this.config.enableBusinessRules
        });
    }

    /**
     * Main middleware function
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    establishContext = async (req, res, next) => {
        if (!this.config.enabled) {
            return next();
        }

        const startTime = Date.now();

        try {
            console.log(`Establishing business context for ${req.method} ${req.path}`);

            // Initialize business context
            req.businessContext = {
                startTime,
                domain: this.identifyBusinessDomain(req.path),
                tenantId: req.tenantId || 'default',
                organizationId: req.organizationId || null,
                userId: req.user?.id || null,
                userRole: req.user?.role || 'user',
                workflow: null,
                entityContext: {},
                businessRules: new Map(),
                permissions: new Set(),
                validations: [],
                crossDomainRefs: new Map(),
                metrics: {
                    contextSetupTime: 0,
                    rulesEvaluated: 0,
                    validationsRun: 0,
                    permissionsChecked: 0
                }
            };

            // Establish domain-specific context
            await this.establishDomainContext(req);

            // Load entity-specific context if applicable
            await this.loadEntityContext(req);

            // Apply business rules
            await this.applyBusinessRules(req);

            // Setup workflow context if applicable
            await this.setupWorkflowContext(req);

            // Establish cross-domain references
            await this.establishCrossDomainReferences(req);

            // Set context headers
            this.setContextHeaders(res, req.businessContext);

            const duration = Date.now() - startTime;
            req.businessContext.metrics.contextSetupTime = duration;

            console.log(`Business context established in ${duration}ms for domain: ${req.businessContext.domain}`);

            logger.debug('Business context established', {
                domain: req.businessContext.domain,
                tenantId: req.businessContext.tenantId,
                userId: req.businessContext.userId,
                workflow: req.businessContext.workflow,
                duration,
                rulesCount: req.businessContext.businessRules.size,
                permissionsCount: req.businessContext.permissions.size
            });

            next();

        } catch (error) {
            console.error(`Business context setup failed for ${req.path}:`, error.message);
            logger.error('Business context middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path,
                method: req.method,
                tenantId: req.tenantId,
                userId: req.user?.id,
                requestId: req.requestId
            });

            if (this.config.strictValidation) {
                return next(new AppError('Business context setup failed', 500, 'BUSINESS_CONTEXT_ERROR'));
            }

            // Fallback context
            req.businessContext = {
                domain: 'unknown',
                tenantId: req.tenantId || 'default',
                organizationId: req.organizationId || null,
                userId: req.user?.id || null,
                userRole: req.user?.role || 'user',
                workflow: null,
                entityContext: {},
                businessRules: new Map(),
                permissions: new Set(['read']),
                validations: [],
                crossDomainRefs: new Map(),
                fallback: true,
                error: error.message
            };

            next();
        }
    };

    /**
     * Identify business domain from request path
     * @param {string} path - Request path
     * @returns {string} Business domain
     */
    identifyBusinessDomain(path) {
        for (const [pathPattern, domain] of Object.entries(this.config.domainMappings)) {
            if (path.startsWith(pathPattern)) {
                return domain;
            }
        }
        return 'general';
    }

    /**
     * Establish domain-specific context
     * @param {Object} req - Express request object
     */
    async establishDomainContext(req) {
        const domain = req.businessContext.domain;
        console.log(`Establishing context for domain: ${domain}`);

        switch (domain) {
            case 'project_management':
                await this.establishProjectContext(req);
                break;
            case 'client_management':
                await this.establishClientContext(req);
                break;
            case 'consultant_management':
                await this.establishConsultantContext(req);
                break;
            case 'engagement_management':
                await this.establishEngagementContext(req);
                break;
            case 'recruitment':
                await this.establishRecruitmentContext(req);
                break;
            case 'organization_management':
                await this.establishOrganizationContext(req);
                break;
            default:
                await this.establishGeneralContext(req);
        }
    }

    /**
     * Establish project management context
     */
    async establishProjectContext(req) {
        if (!this.config.enableProjectContext) return;

        console.log('Setting up project management context');

        try {
            req.businessContext.workflow = 'project';
            req.businessContext.permissions.add('projects:read');

            // Add role-based permissions
            if (req.businessContext.userRole === 'project_manager' || req.businessContext.userRole === 'admin') {
                req.businessContext.permissions.add('projects:create');
                req.businessContext.permissions.add('projects:update');
                req.businessContext.permissions.add('projects:delete');
                req.businessContext.permissions.add('projects:manage_team');
            }

            if (req.businessContext.userRole === 'team_member') {
                req.businessContext.permissions.add('projects:update_status');
                req.businessContext.permissions.add('projects:add_time');
            }

            // Load project-specific business rules
            const projectRules = this.config.businessRules.project_creation;
            req.businessContext.businessRules.set('project_creation', projectRules);

            // Set validation rules
            req.businessContext.validations.push('validate_project_limits');
            req.businessContext.validations.push('validate_required_fields');

        } catch (error) {
            console.error('Error establishing project context:', error.message);
            throw error;
        }
    }

    /**
     * Establish client management context
     */
    async establishClientContext(req) {
        if (!this.config.enableClientContext) return;

        console.log('Setting up client management context');

        try {
            req.businessContext.workflow = 'client_onboarding';
            req.businessContext.permissions.add('clients:read');

            // Add role-based permissions
            if (['client_manager', 'sales_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('clients:create');
                req.businessContext.permissions.add('clients:update');
                req.businessContext.permissions.add('clients:manage_contacts');
            }

            if (['admin', 'finance_manager'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('clients:view_financial');
                req.businessContext.permissions.add('clients:manage_billing');
            }

            // Load client-specific business rules
            const clientRules = this.config.businessRules.client_onboarding;
            req.businessContext.businessRules.set('client_onboarding', clientRules);

            // Set validation rules
            req.businessContext.validations.push('validate_client_data');
            req.businessContext.validations.push('validate_contract_terms');

        } catch (error) {
            console.error('Error establishing client context:', error.message);
            throw error;
        }
    }

    /**
     * Establish consultant management context
     */
    async establishConsultantContext(req) {
        if (!this.config.enableConsultantContext) return;

        console.log('Setting up consultant management context');

        try {
            req.businessContext.workflow = 'consultant_engagement';
            req.businessContext.permissions.add('consultants:read');

            // Add role-based permissions
            if (['consultant_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('consultants:create');
                req.businessContext.permissions.add('consultants:update');
                req.businessContext.permissions.add('consultants:manage_engagements');
            }

            if (req.businessContext.userRole === 'consultant') {
                req.businessContext.permissions.add('consultants:update_profile');
                req.businessContext.permissions.add('consultants:manage_availability');
            }

            // Load consultant-specific business rules
            const consultantRules = this.config.businessRules.consultant_engagement;
            req.businessContext.businessRules.set('consultant_engagement', consultantRules);

            // Set validation rules
            req.businessContext.validations.push('validate_skills_match');
            req.businessContext.validations.push('validate_availability');
            req.businessContext.validations.push('validate_engagement_limits');

        } catch (error) {
            console.error('Error establishing consultant context:', error.message);
            throw error;
        }
    }

    /**
     * Establish engagement management context
     */
    async establishEngagementContext(req) {
        console.log('Setting up engagement management context');

        try {
            req.businessContext.workflow = 'engagement';
            req.businessContext.permissions.add('engagements:read');

            // Add role-based permissions
            if (['consultant', 'client_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('engagements:create');
                req.businessContext.permissions.add('engagements:update');
            }

            if (['client_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('engagements:approve');
                req.businessContext.permissions.add('engagements:cancel');
            }

            // Set validation rules
            req.businessContext.validations.push('validate_engagement_terms');
            req.businessContext.validations.push('validate_consultant_availability');

        } catch (error) {
            console.error('Error establishing engagement context:', error.message);
            throw error;
        }
    }

    /**
     * Establish recruitment context
     */
    async establishRecruitmentContext(req) {
        if (!this.config.enableRecruitmentContext) return;

        console.log('Setting up recruitment context');

        try {
            req.businessContext.workflow = 'recruitment';
            req.businessContext.permissions.add('recruitment:read');

            // Add role-based permissions
            if (['recruiter', 'hiring_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('recruitment:create_jobs');
                req.businessContext.permissions.add('recruitment:manage_applications');
            }

            if (['hiring_manager', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('recruitment:approve_jobs');
                req.businessContext.permissions.add('recruitment:make_offers');
            }

            // Load recruitment-specific business rules
            const recruitmentRules = this.config.businessRules.job_posting;
            req.businessContext.businessRules.set('job_posting', recruitmentRules);

            // Set validation rules
            req.businessContext.validations.push('validate_job_requirements');
            req.businessContext.validations.push('validate_salary_range');

        } catch (error) {
            console.error('Error establishing recruitment context:', error.message);
            throw error;
        }
    }

    /**
     * Establish organization context
     */
    async establishOrganizationContext(req) {
        console.log('Setting up organization context');

        try {
            req.businessContext.permissions.add('organization:read');

            // Add role-based permissions
            if (['org_admin', 'admin'].includes(req.businessContext.userRole)) {
                req.businessContext.permissions.add('organization:update');
                req.businessContext.permissions.add('organization:manage_members');
                req.businessContext.permissions.add('organization:manage_settings');
            }

            if (req.businessContext.userRole === 'admin') {
                req.businessContext.permissions.add('organization:delete');
            }

        } catch (error) {
            console.error('Error establishing organization context:', error.message);
            throw error;
        }
    }

    /**
     * Establish general context for non-specific domains
     */
    async establishGeneralContext(req) {
        console.log('Setting up general context');

        req.businessContext.permissions.add('general:read');
        
        if (req.businessContext.userRole !== 'guest') {
            req.businessContext.permissions.add('general:write');
        }
    }

    /**
     * Load entity-specific context from request parameters
     */
    async loadEntityContext(req) {
        console.log('Loading entity-specific context');

        try {
            // Extract entity IDs from URL parameters
            const entityIds = this.extractEntityIds(req);

            if (Object.keys(entityIds).length === 0) {
                return;
            }

            console.log('Found entity IDs:', entityIds);

            // Load context for each entity type
            for (const [entityType, entityId] of Object.entries(entityIds)) {
                const context = await this.loadEntityData(entityType, entityId, req);
                if (context) {
                    req.businessContext.entityContext[entityType] = context;
                }
            }

        } catch (error) {
            console.error('Error loading entity context:', error.message);
            // Continue without entity context
        }
    }

    /**
     * Extract entity IDs from request parameters
     * @param {Object} req - Express request object
     * @returns {Object} Entity IDs mapped by type
     */
    extractEntityIds(req) {
        const entityIds = {};
        const params = { ...req.params, ...req.query };

        // Common entity ID patterns
        const patterns = {
            projectId: 'project',
            clientId: 'client', 
            consultantId: 'consultant',
            engagementId: 'engagement',
            jobId: 'job',
            candidateId: 'candidate',
            applicationId: 'application',
            organizationId: 'organization',
            userId: 'user'
        };

        for (const [paramName, entityType] of Object.entries(patterns)) {
            if (params[paramName]) {
                entityIds[entityType] = params[paramName];
            }
        }

        return entityIds;
    }

    /**
     * Load entity data from database
     * @param {string} entityType - Type of entity
     * @param {string} entityId - Entity ID
     * @param {Object} req - Express request object
     * @returns {Object|null} Entity context
     */
    async loadEntityData(entityType, entityId, req) {
        try {
            const cacheKey = `entity:${req.businessContext.tenantId}:${entityType}:${entityId}`;
            
            // Check cache first
            let entityData = null;
            if (this.cache) {
                entityData = await this.cache.get(cacheKey);
                if (entityData) {
                    return JSON.parse(entityData);
                }
            }

            // Load from database
            switch (entityType) {
                case 'project':
                    entityData = await this.loadProjectData(entityId, req);
                    break;
                case 'client':
                    entityData = await this.loadClientData(entityId, req);
                    break;
                case 'consultant':
                    entityData = await this.loadConsultantData(entityId, req);
                    break;
                case 'engagement':
                    entityData = await this.loadEngagementData(entityId, req);
                    break;
                case 'job':
                    entityData = await this.loadJobData(entityId, req);
                    break;
                case 'organization':
                    entityData = await this.loadOrganizationData(entityId, req);
                    break;
                default:
                    return null;
            }

            // Cache the result
            if (entityData && this.cache) {
                await this.cache.set(cacheKey, JSON.stringify(entityData), this.config.cacheTTL);
            }

            return entityData;

        } catch (error) {
            console.error(`Error loading ${entityType} data:`, error.message);
            return null;
        }
    }

    /**
     * Load project data
     */
    async loadProjectData(projectId, req) {
        try {
            const Project = await Database.getModel('Project');
            const project = await Project.findById(projectId)
                .select('name status clientId projectManagerId team budget timeline')
                .populate('client', 'name type')
                .populate('projectManager', 'profile.firstName profile.lastName')
                .lean();

            if (!project) {
                return null;
            }

            return {
                id: project._id,
                name: project.name,
                status: project.status,
                client: project.client,
                projectManager: project.projectManager,
                teamSize: project.team?.length || 0,
                budget: project.budget,
                timeline: project.timeline,
                permissions: this.calculateProjectPermissions(project, req)
            };
        } catch (error) {
            console.error('Error loading project data:', error.message);
            return null;
        }
    }

    /**
     * Load client data
     */
    async loadClientData(clientId, req) {
        try {
            const Client = await Database.getModel('Client');
            const client = await Client.findById(clientId)
                .select('name type status industry accountManager contacts')
                .populate('accountManager', 'profile.firstName profile.lastName')
                .lean();

            if (!client) {
                return null;
            }

            return {
                id: client._id,
                name: client.name,
                type: client.type,
                status: client.status,
                industry: client.industry,
                accountManager: client.accountManager,
                contactsCount: client.contacts?.length || 0,
                permissions: this.calculateClientPermissions(client, req)
            };
        } catch (error) {
            console.error('Error loading client data:', error.message);
            return null;
        }
    }

    /**
     * Load consultant data
     */
    async loadConsultantData(consultantId, req) {
        try {
            const Consultant = await Database.getModel('Consultant');
            const consultant = await Consultant.findById(consultantId)
                .select('profile skills availability engagements rates')
                .lean();

            if (!consultant) {
                return null;
            }

            return {
                id: consultant._id,
                profile: consultant.profile,
                skills: consultant.skills,
                availability: consultant.availability,
                activeEngagements: consultant.engagements?.filter(e => e.status === 'active').length || 0,
                rates: consultant.rates,
                permissions: this.calculateConsultantPermissions(consultant, req)
            };
        } catch (error) {
            console.error('Error loading consultant data:', error.message);
            return null;
        }
    }

    /**
     * Load engagement data
     */
    async loadEngagementData(engagementId, req) {
        try {
            const Engagement = await Database.getModel('Engagement');
            const engagement = await Engagement.findById(engagementId)
                .select('projectId consultantId status terms timeline billing')
                .populate('project', 'name')
                .populate('consultant', 'profile.firstName profile.lastName')
                .lean();

            if (!engagement) {
                return null;
            }

            return {
                id: engagement._id,
                project: engagement.project,
                consultant: engagement.consultant,
                status: engagement.status,
                terms: engagement.terms,
                timeline: engagement.timeline,
                billing: engagement.billing,
                permissions: this.calculateEngagementPermissions(engagement, req)
            };
        } catch (error) {
            console.error('Error loading engagement data:', error.message);
            return null;
        }
    }

    /**
     * Load job data
     */
    async loadJobData(jobId, req) {
        try {
            const Job = await Database.getModel('Job');
            const job = await Job.findById(jobId)
                .select('title status hiringManager department requirements applications')
                .populate('hiringManager', 'profile.firstName profile.lastName')
                .lean();

            if (!job) {
                return null;
            }

            return {
                id: job._id,
                title: job.title,
                status: job.status,
                hiringManager: job.hiringManager,
                department: job.department,
                requirements: job.requirements,
                applicationsCount: job.applications?.length || 0,
                permissions: this.calculateJobPermissions(job, req)
            };
        } catch (error) {
            console.error('Error loading job data:', error.message);
            return null;
        }
    }

    /**
     * Load organization data
     */
    async loadOrganizationData(organizationId, req) {
        try {
            const Organization = await Database.getModel('Organization');
            const organization = await Organization.findById(organizationId)
                .select('name type status subscription settings')
                .lean();

            if (!organization) {
                return null;
            }

            return {
                id: organization._id,
                name: organization.name,
                type: organization.type,
                status: organization.status,
                subscription: organization.subscription,
                settings: organization.settings,
                permissions: this.calculateOrganizationPermissions(organization, req)
            };
        } catch (error) {
            console.error('Error loading organization data:', error.message);
            return null;
        }
    }

    /**
     * Calculate entity-specific permissions
     */
    calculateProjectPermissions(project, req) {
        const permissions = new Set();
        const userRole = req.businessContext.userRole;
        const userId = req.businessContext.userId;

        // Basic read permission
        permissions.add('read');

        // Project manager permissions
        if (project.projectManager && project.projectManager._id.toString() === userId) {
            permissions.add('update');
            permissions.add('manage_team');
            permissions.add('manage_timeline');
        }

        // Team member permissions
        if (project.team && project.team.some(member => member.userId.toString() === userId)) {
            permissions.add('update_status');
            permissions.add('add_time_entries');
        }

        // Admin permissions
        if (userRole === 'admin') {
            permissions.add('update');
            permissions.add('delete');
            permissions.add('manage_team');
        }

        return Array.from(permissions);
    }

    calculateClientPermissions(client, req) {
        const permissions = new Set(['read']);
        const userRole = req.businessContext.userRole;
        const userId = req.businessContext.userId;

        // Account manager permissions
        if (client.accountManager && client.accountManager._id.toString() === userId) {
            permissions.add('update');
            permissions.add('manage_contacts');
        }

        // Role-based permissions
        if (['client_manager', 'sales_manager', 'admin'].includes(userRole)) {
            permissions.add('update');
            permissions.add('manage_contacts');
        }

        return Array.from(permissions);
    }

    calculateConsultantPermissions(consultant, req) {
        const permissions = new Set(['read']);
        const userId = req.businessContext.userId;
        const userRole = req.businessContext.userRole;

        // Self-management permissions
        if (consultant._id.toString() === userId) {
            permissions.add('update_profile');
            permissions.add('manage_availability');
            permissions.add('view_engagements');
        }

        // Manager permissions
        if (['consultant_manager', 'admin'].includes(userRole)) {
            permissions.add('update');
            permissions.add('manage_engagements');
        }

        return Array.from(permissions);
    }

    calculateEngagementPermissions(engagement, req) {
        const permissions = new Set(['read']);
        const userId = req.businessContext.userId;
        const userRole = req.businessContext.userRole;

        // Consultant permissions
        if (engagement.consultant && engagement.consultant._id.toString() === userId) {
            permissions.add('update_status');
            permissions.add('add_time_entries');
        }

        // Manager permissions
        if (['client_manager', 'consultant_manager', 'admin'].includes(userRole)) {
            permissions.add('update');
            permissions.add('approve');
            permissions.add('cancel');
        }

        return Array.from(permissions);
    }

    calculateJobPermissions(job, req) {
        const permissions = new Set(['read']);
        const userId = req.businessContext.userId;
        const userRole = req.businessContext.userRole;

        // Hiring manager permissions
        if (job.hiringManager && job.hiringManager._id.toString() === userId) {
            permissions.add('update');
            permissions.add('manage_applications');
            permissions.add('make_offers');
        }

        // Recruiter permissions
        if (['recruiter', 'admin'].includes(userRole)) {
            permissions.add('update');
            permissions.add('manage_applications');
        }

        return Array.from(permissions);
    }

    calculateOrganizationPermissions(organization, req) {
        const permissions = new Set(['read']);
        const userRole = req.businessContext.userRole;

        if (['org_admin', 'admin'].includes(userRole)) {
            permissions.add('update');
            permissions.add('manage_members');
            permissions.add('manage_settings');
        }

        return Array.from(permissions);
    }

    /**
     * Apply business rules
     */
    async applyBusinessRules(req) {
        if (!this.config.enableBusinessRules) return;

        console.log('Applying business rules');

        try {
            const domain = req.businessContext.domain;
            const subscription = req.subscription?.tier || 'free';

            // Apply subscription-based rules
            await this.applySubscriptionRules(req, subscription);

            // Apply domain-specific rules
            switch (domain) {
                case 'project_management':
                    await this.applyProjectRules(req);
                    break;
                case 'client_management':
                    await this.applyClientRules(req);
                    break;
                case 'consultant_management':
                    await this.applyConsultantRules(req);
                    break;
                case 'recruitment':
                    await this.applyRecruitmentRules(req);
                    break;
            }

            req.businessContext.metrics.rulesEvaluated = req.businessContext.businessRules.size;

        } catch (error) {
            console.error('Error applying business rules:', error.message);
            // Continue without strict rule enforcement
        }
    }

    /**
     * Apply subscription-based business rules
     */
    async applySubscriptionRules(req, subscription) {
        const subscriptionLimits = {
            free: { maxProjects: 3, maxTeamSize: 5, maxStorage: '100MB' },
            professional: { maxProjects: 25, maxTeamSize: 25, maxStorage: '1GB' },
            business: { maxProjects: 100, maxTeamSize: 100, maxStorage: '10GB' },
            enterprise: { maxProjects: -1, maxTeamSize: -1, maxStorage: 'unlimited' }
        };

        const limits = subscriptionLimits[subscription] || subscriptionLimits.free;
        req.businessContext.businessRules.set('subscription_limits', limits);
    }

    /**
     * Apply project-specific business rules
     */
    async applyProjectRules(req) {
        const projectRules = this.config.businessRules.project_creation;
        
        // Check project limits
        if (req.method === 'POST' && req.path.includes('/projects')) {
            const subscription = req.subscription?.tier || 'free';
            const maxProjects = projectRules.subscriptionGates[subscription]?.maxProjects || 3;
            
            req.businessContext.businessRules.set('max_projects', maxProjects);
        }
    }

    /**
     * Apply client-specific business rules
     */
    async applyClientRules(req) {
        const clientRules = this.config.businessRules.client_onboarding;
        req.businessContext.businessRules.set('client_onboarding', clientRules);
    }

    /**
     * Apply consultant-specific business rules
     */
    async applyConsultantRules(req) {
        const consultantRules = this.config.businessRules.consultant_engagement;
        req.businessContext.businessRules.set('consultant_engagement', consultantRules);
    }

    /**
     * Apply recruitment-specific business rules
     */
    async applyRecruitmentRules(req) {
        const recruitmentRules = this.config.businessRules.job_posting;
        req.businessContext.businessRules.set('job_posting', recruitmentRules);
    }

    /**
     * Setup workflow context
     */
    async setupWorkflowContext(req) {
        if (!this.config.enableWorkflowTracking) return;
        if (!req.businessContext.workflow) return;

        console.log(`Setting up workflow context for: ${req.businessContext.workflow}`);

        const workflowConfig = this.config.workflowStates[req.businessContext.workflow];
        if (!workflowConfig) return;

        req.businessContext.workflowStates = workflowConfig.states;
        req.businessContext.workflowTransitions = workflowConfig.transitions;
        req.businessContext.workflowPermissions = workflowConfig.permissions;

        // Load current workflow state if entity context is available
        const entityContext = Object.values(req.businessContext.entityContext)[0];
        if (entityContext && entityContext.status) {
            req.businessContext.currentWorkflowState = entityContext.status;
            req.businessContext.allowedTransitions = workflowConfig.transitions[entityContext.status] || [];
        }
    }

    /**
     * Establish cross-domain references
     */
    async establishCrossDomainReferences(req) {
        console.log('Establishing cross-domain references');

        try {
            const entityContext = req.businessContext.entityContext;

            // Project -> Client references
            if (entityContext.project && entityContext.project.client) {
                req.businessContext.crossDomainRefs.set('client', entityContext.project.client);
            }

            // Engagement -> Project and Consultant references
            if (entityContext.engagement) {
                if (entityContext.engagement.project) {
                    req.businessContext.crossDomainRefs.set('project', entityContext.engagement.project);
                }
                if (entityContext.engagement.consultant) {
                    req.businessContext.crossDomainRefs.set('consultant', entityContext.engagement.consultant);
                }
            }

            // Job -> Hiring Manager references
            if (entityContext.job && entityContext.job.hiringManager) {
                req.businessContext.crossDomainRefs.set('hiringManager', entityContext.job.hiringManager);
            }

        } catch (error) {
            console.error('Error establishing cross-domain references:', error.message);
            // Continue without cross-domain references
        }
    }

    /**
     * Set context headers on response
     */
    setContextHeaders(res, businessContext) {
        res.setHeader('X-Business-Domain', businessContext.domain);
        res.setHeader('X-Business-Context', 'established');
        
        if (businessContext.workflow) {
            res.setHeader('X-Business-Workflow', businessContext.workflow);
        }
        
        if (businessContext.currentWorkflowState) {
            res.setHeader('X-Workflow-State', businessContext.currentWorkflowState);
        }
        
        res.setHeader('X-Permissions-Count', businessContext.permissions.size);
        res.setHeader('X-Business-Rules-Count', businessContext.businessRules.size);
    }

    /**
     * Background processes
     */
    initializeBackgroundProcesses() {
        // Clean up context cache every 10 minutes
        setInterval(() => {
            this.cleanupContextCache();
        }, 600000);

        // Update business metrics every hour
        setInterval(() => {
            this.updateBusinessMetrics();
        }, 3600000);
    }

    cleanupContextCache() {
        const cutoff = Date.now() - (this.config.cacheTTL * 1000 * 2);
        let cleaned = 0;

        for (const [key, data] of this.contextCache) {
            if (data.timestamp < cutoff) {
                this.contextCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} expired business context cache entries`);
        }
    }

    updateBusinessMetrics() {
        // Calculate business context metrics
        const metrics = {
            totalContextSetups: Array.from(this.businessMetrics.values()).reduce((sum, m) => sum + (m.count || 0), 0),
            domainDistribution: new Map(),
            averageSetupTime: 0
        };

        console.log('Business context metrics updated:', {
            totalSetups: metrics.totalContextSetups,
            cacheSize: this.contextCache.size
        });
    }

    /**
     * Public API methods
     */
    getStatistics() {
        return {
            config: {
                enabled: this.config.enabled,
                domains: Object.keys(this.config.domainMappings),
                workflows: Object.keys(this.config.workflowStates),
                businessRules: Object.keys(this.config.businessRules)
            },
            cacheStats: {
                contextCacheSize: this.contextCache.size,
                workflowStatesSize: this.workflowStates.size,
                businessMetricsSize: this.businessMetrics.size
            }
        };
    }

    async healthCheck() {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {}
        };

        try {
            // Check cache connectivity
            if (this.cache) {
                try {
                    await this.cache.ping();
                    health.components.cache = { status: 'healthy', type: 'redis' };
                } catch (error) {
                    health.components.cache = { status: 'unhealthy', error: error.message };
                    health.status = 'degraded';
                }
            }

            // Check database connectivity
            try {
                await Database.isConnected();
                health.components.database = { status: 'healthy' };
            } catch (error) {
                health.components.database = { status: 'unhealthy', error: error.message };
                health.status = 'degraded';
            }

            health.components.localCache = {
                status: 'healthy',
                size: this.contextCache.size
            };

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    clearCaches() {
        console.log('Clearing business context caches');
        this.contextCache.clear();
        this.workflowStates.clear();
        this.businessMetrics.clear();
        
        logger.info('Business context caches cleared');
    }

    /**
     * Helper methods for application code
     */
    static hasPermission(req, permission) {
        if (!req.businessContext || !req.businessContext.permissions) return false;
        return req.businessContext.permissions.has(permission);
    }

    static getBusinessRule(req, ruleName) {
        if (!req.businessContext || !req.businessContext.businessRules) return null;
        return req.businessContext.businessRules.get(ruleName);
    }

    static getEntityContext(req, entityType) {
        if (!req.businessContext || !req.businessContext.entityContext) return null;
        return req.businessContext.entityContext[entityType];
    }

    static getCurrentWorkflowState(req) {
        if (!req.businessContext) return null;
        return req.businessContext.currentWorkflowState;
    }

    static getAllowedWorkflowTransitions(req) {
        if (!req.businessContext) return [];
        return req.businessContext.allowedTransitions || [];
    }

    static getCrossDomainReference(req, refType) {
        if (!req.businessContext || !req.businessContext.crossDomainRefs) return null;
        return req.businessContext.crossDomainRefs.get(refType);
    }
}

// Create singleton instance
const businessContextMiddleware = new BusinessContextMiddleware({
    enabled: process.env.BUSINESS_CONTEXT_ENABLED !== 'false',
    enableProjectContext: process.env.PROJECT_CONTEXT_ENABLED !== 'false',
    enableClientContext: process.env.CLIENT_CONTEXT_ENABLED !== 'false',
    enableConsultantContext: process.env.CONSULTANT_CONTEXT_ENABLED !== 'false',
    enableRecruitmentContext: process.env.RECRUITMENT_CONTEXT_ENABLED !== 'false',
    enableWorkflowTracking: process.env.WORKFLOW_TRACKING_ENABLED !== 'false',
    enableBusinessRules: process.env.BUSINESS_RULES_ENABLED !== 'false',
    strictValidation: process.env.BUSINESS_CONTEXT_STRICT_MODE === 'true',
    cacheTTL: parseInt(process.env.BUSINESS_CONTEXT_CACHE_TTL, 10) || 300
});

module.exports = businessContextMiddleware.establishContext;