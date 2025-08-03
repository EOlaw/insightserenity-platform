'use strict';

/**
 * @fileoverview Seeds comprehensive test data for development and testing environments
 * @module shared/lib/database/seeders/005-seed-test-data
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/database/models/organization-model
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/test/fixtures/user-fixtures
 * @requires module:shared/lib/test/fixtures/organization-fixtures
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const UserModel = require('..\models\users\user-model');
const OrganizationModel = require('..\..\..\..\servers\customer-services\modules\hosted-organizations\organizations\models\organization-model');
const BaseModel = require('../models/base-model');
const userFixtures = require('../../test/fixtures/user-fixtures');
const organizationFixtures = require('../../test/fixtures/organization-fixtures');
const { generateDateRange, addDays, subtractDays } = require('../../utils/helpers/date-helper');
const { generateRandomString, generateSlug } = require('../../utils/helpers/string-helper');

/**
 * @class TestDataSeeder
 * @description Seeds comprehensive test data for development and testing
 */
class TestDataSeeder {
  /**
   * @private
   * @static
   * @readonly
   */
  static #COLLECTIONS = {
    USERS: 'users',
    ORGANIZATIONS: 'organizations',
    CLIENTS: 'clients',
    PROJECTS: 'projects',
    CONSULTANTS: 'consultants',
    ENGAGEMENTS: 'engagements',
    JOBS: 'jobs',
    CANDIDATES: 'candidates',
    APPLICATIONS: 'applications',
    ACTIVITIES: 'activities',
    NOTIFICATIONS: 'notifications',
    DOCUMENTS: 'documents',
    COMMENTS: 'comments',
    TASKS: 'tasks'
  };

  static #TEST_DATA_PREFIX = 'test_';
  static #DEMO_COMPANIES = [
    'Acme Corporation', 'Global Tech Solutions', 'Innovative Systems Inc',
    'Digital Dynamics', 'Future Forward Ltd', 'Quantum Enterprises',
    'Synergy Partners', 'NextGen Innovations', 'Strategic Ventures',
    'Pioneer Technologies'
  ];

  /**
   * Seeds test data
   * @static
   * @async
   * @param {Object} [options={}] - Seeding options
   * @param {string} [options.environment] - Current environment
   * @param {Object} [options.session] - MongoDB session for transactions
   * @returns {Promise<Object>} Seeding result
   * @throws {AppError} If seeding fails
   */
  static async up(options = {}) {
    try {
      const { environment = 'development', session } = options;

      // Skip test data in production
      if (environment === 'production') {
        logger.info('Skipping test data seeding in production environment');
        return { recordsSeeded: 0 };
      }
      
      logger.info('Starting test data seeding', { environment });

      let totalRecords = 0;

      // Seed test clients
      const clientsResult = await TestDataSeeder.#seedTestClients(session);
      totalRecords += clientsResult.count;

      // Seed test projects
      const projectsResult = await TestDataSeeder.#seedTestProjects(session);
      totalRecords += projectsResult.count;

      // Seed test consultants
      const consultantsResult = await TestDataSeeder.#seedTestConsultants(session);
      totalRecords += consultantsResult.count;

      // Seed test engagements
      const engagementsResult = await TestDataSeeder.#seedTestEngagements(session);
      totalRecords += engagementsResult.count;

      // Seed test jobs
      const jobsResult = await TestDataSeeder.#seedTestJobs(session);
      totalRecords += jobsResult.count;

      // Seed test candidates
      const candidatesResult = await TestDataSeeder.#seedTestCandidates(session);
      totalRecords += candidatesResult.count;

      // Seed test applications
      const applicationsResult = await TestDataSeeder.#seedTestApplications(session);
      totalRecords += applicationsResult.count;

      // Seed test activities
      const activitiesResult = await TestDataSeeder.#seedTestActivities(session);
      totalRecords += activitiesResult.count;

      // Seed test documents
      const documentsResult = await TestDataSeeder.#seedTestDocuments(session);
      totalRecords += documentsResult.count;

      // Seed test tasks
      const tasksResult = await TestDataSeeder.#seedTestTasks(session);
      totalRecords += tasksResult.count;

      logger.info('Test data seeding completed', { 
        totalRecords,
        details: {
          clients: clientsResult.count,
          projects: projectsResult.count,
          consultants: consultantsResult.count,
          engagements: engagementsResult.count,
          jobs: jobsResult.count,
          candidates: candidatesResult.count,
          applications: applicationsResult.count,
          activities: activitiesResult.count,
          documents: documentsResult.count,
          tasks: tasksResult.count
        }
      });

      return { recordsSeeded: totalRecords };

    } catch (error) {
      logger.error('Test data seeding failed', error);
      throw new AppError(
        'Failed to seed test data',
        500,
        'SEED_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates seeded test data
   * @static
   * @async
   * @returns {Promise<Object>} Validation result
   */
  static async validate() {
    try {
      const issues = [];
      const db = BaseModel.getDatabase();

      // Check for test data presence
      const collections = [
        'clients', 'projects', 'jobs', 'candidates'
      ];

      for (const collectionName of collections) {
        const collection = db.collection(collectionName);
        const testCount = await collection.countDocuments({
          $or: [
            { name: { $regex: TestDataSeeder.#TEST_DATA_PREFIX, $options: 'i' } },
            { 'metadata.isTestData': true }
          ]
        });

        if (testCount === 0) {
          issues.push({
            type: collectionName,
            issue: `No test data found in ${collectionName} collection`
          });
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      logger.error('Validation failed', error);
      return {
        valid: false,
        issues: [{ type: 'error', issue: error.message }]
      };
    }
  }

  /**
   * @private
   * Seeds test clients
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestClients(session) {
    try {
      logger.info('Seeding test clients');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.CLIENTS);
      const orgsCollection = db.collection(TestDataSeeder.#COLLECTIONS.ORGANIZATIONS);

      // Get demo organizations
      const demoOrgs = await orgsCollection.find({ isDemo: true }, { session }).toArray();
      if (demoOrgs.length === 0) {
        logger.warn('No demo organizations found for test clients');
        return { count: 0 };
      }

      const clients = [];
      const industries = ['Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing'];
      const sizes = ['startup', 'small', 'medium', 'large', 'enterprise'];

      for (let i = 0; i < 20; i++) {
        const company = TestDataSeeder.#DEMO_COMPANIES[i % TestDataSeeder.#DEMO_COMPANIES.length];
        const clientName = `${TestDataSeeder.#TEST_DATA_PREFIX}${company}_${i}`;
        
        const client = {
          organizationId: demoOrgs[i % demoOrgs.length]._id,
          name: clientName,
          displayName: company,
          slug: generateSlug(clientName),
          type: i % 3 === 0 ? 'prospect' : 'active',
          industry: industries[i % industries.length],
          size: sizes[i % sizes.length],
          website: `https://www.${generateSlug(company)}.com`,
          description: `${company} is a leading company in the ${industries[i % industries.length]} industry.`,
          contact: {
            primary: {
              name: `John Doe ${i}`,
              title: 'CEO',
              email: `john.doe${i}@${generateSlug(company)}.com`,
              phone: `+1-555-${String(1000 + i).padStart(4, '0')}`,
              linkedin: `https://linkedin.com/in/johndoe${i}`
            },
            billing: {
              name: `Jane Smith ${i}`,
              title: 'CFO',
              email: `billing@${generateSlug(company)}.com`,
              phone: `+1-555-${String(2000 + i).padStart(4, '0')}`
            }
          },
          address: {
            street1: `${100 + i} Business Avenue`,
            street2: `Suite ${200 + i}`,
            city: ['San Francisco', 'New York', 'Chicago', 'Austin', 'Seattle'][i % 5],
            state: ['CA', 'NY', 'IL', 'TX', 'WA'][i % 5],
            postalCode: String(10000 + i),
            country: 'US'
          },
          financials: {
            creditLimit: (i + 1) * 10000,
            paymentTerms: [15, 30, 45, 60][i % 4],
            currency: 'USD',
            taxId: `XX-${String(1000000 + i)}`,
            totalRevenue: 0,
            outstandingBalance: 0
          },
          metrics: {
            totalProjects: Math.floor(Math.random() * 10) + 1,
            activeProjects: Math.floor(Math.random() * 5),
            completedProjects: Math.floor(Math.random() * 5),
            totalValue: (Math.floor(Math.random() * 500) + 100) * 1000,
            satisfaction: 4 + Math.random(),
            lastContactDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
          },
          tags: [
            industries[i % industries.length].toLowerCase(),
            sizes[i % sizes.length],
            i % 2 === 0 ? 'priority' : 'standard'
          ],
          status: i % 10 === 0 ? 'inactive' : 'active',
          isActive: i % 10 !== 0,
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i
          },
          customFields: {
            preferredConsultant: null,
            accountManager: `Account Manager ${i % 5}`,
            notes: 'Test client for development and testing purposes'
          },
          createdAt: new Date(Date.now() - (90 - i) * 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        };

        clients.push(client);
      }

      await collection.insertMany(clients, { session });

      // Create indexes
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ slug: 1 }, { unique: true, session });
      await collection.createIndex({ type: 1 }, { session });
      await collection.createIndex({ industry: 1 }, { session });
      await collection.createIndex({ status: 1 }, { session });

      logger.info(`Created ${clients.length} test clients`);

      return { count: clients.length };

    } catch (error) {
      logger.error('Failed to seed test clients', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test projects
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestProjects(session) {
    try {
      logger.info('Seeding test projects');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.PROJECTS);
      const clientsCollection = db.collection(TestDataSeeder.#COLLECTIONS.CLIENTS);

      // Get test clients
      const testClients = await clientsCollection.find(
        { 'metadata.isTestData': true },
        { session }
      ).toArray();

      if (testClients.length === 0) {
        logger.warn('No test clients found for projects');
        return { count: 0 };
      }

      const projects = [];
      const projectTypes = [
        'Digital Transformation',
        'Process Optimization',
        'Market Analysis',
        'Strategic Planning',
        'Change Management',
        'Technology Implementation'
      ];

      const statuses = ['planning', 'active', 'on-hold', 'completed', 'cancelled'];

      for (let i = 0; i < 50; i++) {
        const client = testClients[i % testClients.length];
        const projectType = projectTypes[i % projectTypes.length];
        
        const startDate = new Date(Date.now() - (120 - i * 2) * 24 * 60 * 60 * 1000);
        const endDate = addDays(startDate, 30 + (i % 6) * 30);
        
        const project = {
          organizationId: client.organizationId,
          clientId: client._id,
          name: `${TestDataSeeder.#TEST_DATA_PREFIX}${projectType}_Project_${i}`,
          displayName: `${projectType} for ${client.displayName}`,
          slug: generateSlug(`${client.slug}-project-${i}`),
          type: projectType.toLowerCase().replace(/\s+/g, '-'),
          description: `${projectType} project for ${client.displayName}. This project aims to deliver comprehensive solutions and measurable results.`,
          objectives: [
            `Achieve ${20 + i % 5}% improvement in operational efficiency`,
            `Reduce costs by ${10 + i % 3}%`,
            `Implement best practices across the organization`,
            `Deliver actionable insights and recommendations`
          ],
          deliverables: [
            'Initial Assessment Report',
            'Strategic Roadmap',
            'Implementation Plan',
            'Training Materials',
            'Final Report and Recommendations'
          ],
          timeline: {
            startDate,
            endDate,
            milestones: [
              {
                name: 'Project Kickoff',
                date: startDate,
                status: 'completed',
                description: 'Initial project meeting and planning'
              },
              {
                name: 'Assessment Phase',
                date: addDays(startDate, 14),
                status: i < 25 ? 'completed' : 'pending',
                description: 'Current state analysis and assessment'
              },
              {
                name: 'Strategy Development',
                date: addDays(startDate, 30),
                status: i < 15 ? 'completed' : 'pending',
                description: 'Develop strategic recommendations'
              },
              {
                name: 'Implementation',
                date: addDays(startDate, 60),
                status: i < 10 ? 'completed' : 'pending',
                description: 'Execute implementation plan'
              },
              {
                name: 'Project Closure',
                date: endDate,
                status: i < 5 ? 'completed' : 'pending',
                description: 'Final deliverables and handover'
              }
            ]
          },
          budget: {
            total: (50 + i * 10) * 1000,
            currency: 'USD',
            spent: i < 25 ? (30 + i * 5) * 1000 : 0,
            remaining: i < 25 ? (20 + i * 5) * 1000 : (50 + i * 10) * 1000,
            billing: {
              type: ['fixed', 'hourly', 'retainer'][i % 3],
              rate: 200 + (i % 5) * 50,
              frequency: ['monthly', 'milestone', 'completion'][i % 3]
            }
          },
          team: {
            projectManager: `PM_${i % 5}`,
            leadConsultant: `LC_${i % 4}`,
            consultants: [`C_${i % 3}`, `C_${(i + 1) % 3}`],
            totalMembers: 3 + (i % 3)
          },
          metrics: {
            progress: i < 5 ? 100 : Math.min(95, (i * 2)),
            health: ['green', 'yellow', 'red'][i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0],
            risks: Math.floor(Math.random() * 5),
            issues: Math.floor(Math.random() * 3),
            tasksTotal: 20 + i % 10,
            tasksCompleted: Math.floor((20 + i % 10) * (i < 5 ? 1 : Math.min(0.95, i * 0.02))),
            hoursLogged: i * 10 + Math.floor(Math.random() * 100),
            customerSatisfaction: i < 10 ? 4.5 + Math.random() * 0.5 : null
          },
          documents: {
            total: 5 + i % 10,
            categories: {
              contracts: 1,
              reports: 2 + i % 3,
              presentations: 1 + i % 2,
              deliverables: 1 + i % 5
            }
          },
          status: statuses[Math.min(4, Math.floor(i / 10))],
          priority: ['low', 'medium', 'high', 'critical'][i % 4],
          visibility: 'private',
          tags: [
            projectType.toLowerCase().replace(/\s+/g, '-'),
            client.industry.toLowerCase(),
            `priority-${['low', 'medium', 'high', 'critical'][i % 4]}`
          ],
          isActive: !['completed', 'cancelled'].includes(statuses[Math.min(4, Math.floor(i / 10))]),
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            version: '1.0'
          },
          customFields: {
            clientSponsor: client.contact.primary.name,
            businessUnit: ['IT', 'Operations', 'Finance', 'Sales', 'Marketing'][i % 5],
            region: ['North America', 'Europe', 'Asia Pacific'][i % 3]
          },
          createdAt: startDate,
          updatedAt: new Date()
        };

        projects.push(project);
      }

      await collection.insertMany(projects, { session });

      // Create indexes
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ clientId: 1 }, { session });
      await collection.createIndex({ slug: 1 }, { unique: true, session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ 'timeline.startDate': 1 }, { session });
      await collection.createIndex({ 'timeline.endDate': 1 }, { session });

      logger.info(`Created ${projects.length} test projects`);

      return { count: projects.length };

    } catch (error) {
      logger.error('Failed to seed test projects', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test consultants
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestConsultants(session) {
    try {
      logger.info('Seeding test consultants');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.CONSULTANTS);
      const orgsCollection = db.collection(TestDataSeeder.#COLLECTIONS.ORGANIZATIONS);

      // Get demo organizations
      const demoOrgs = await orgsCollection.find({ isDemo: true }, { session }).toArray();

      const consultants = [];
      const skills = [
        'Project Management', 'Business Analysis', 'Change Management',
        'Data Analytics', 'Strategic Planning', 'Process Improvement',
        'Technology Consulting', 'Financial Analysis', 'Risk Management',
        'Digital Transformation'
      ];

      const certifications = [
        'PMP', 'CBAP', 'Six Sigma', 'Agile', 'ITIL', 
        'CPA', 'MBA', 'TOGAF', 'AWS', 'Azure'
      ];

      const levels = ['Junior', 'Mid-Level', 'Senior', 'Principal', 'Partner'];

      for (let i = 0; i < 30; i++) {
        const firstName = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily'][i % 6];
        const lastName = ['Smith', 'Johnson', 'Williams', 'Brown', 'Davis', 'Miller'][Math.floor(i / 6) % 6];
        
        const consultant = {
          organizationId: demoOrgs[i % demoOrgs.length]._id,
          userId: null, // Will be linked to users in real implementation
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@consultants.test`,
          phone: `+1-555-${String(3000 + i).padStart(4, '0')}`,
          title: `${levels[Math.floor(i / 6)]} Consultant`,
          level: levels[Math.floor(i / 6)].toLowerCase().replace('-', ''),
          department: ['Strategy', 'Operations', 'Technology', 'Finance'][i % 4],
          profile: {
            bio: `Experienced consultant with ${5 + Math.floor(i / 6) * 2} years in the industry. Specializes in ${skills[i % skills.length]} and ${skills[(i + 1) % skills.length]}.`,
            avatar: null,
            linkedin: `https://linkedin.com/in/${firstName.toLowerCase()}${lastName.toLowerCase()}${i}`,
            summary: `Results-driven consultant with proven track record in delivering value to clients.`,
            languages: ['English', 'Spanish', 'French', 'German', 'Mandarin'].slice(0, 1 + (i % 3))
          },
          skills: {
            primary: skills.slice(i % skills.length, (i % skills.length) + 3),
            secondary: skills.slice((i + 3) % skills.length, ((i + 3) % skills.length) + 2),
            industries: ['Technology', 'Finance', 'Healthcare', 'Retail'].slice(0, 2 + (i % 2)),
            tools: ['Excel', 'PowerPoint', 'Tableau', 'SQL', 'Python', 'Salesforce'].slice(0, 3 + (i % 3))
          },
          certifications: certifications.slice(i % certifications.length, (i % certifications.length) + (1 + Math.floor(i / 10))).map(cert => ({
            name: cert,
            issuer: `${cert} Institute`,
            dateObtained: new Date(Date.now() - (365 + i * 30) * 24 * 60 * 60 * 1000),
            expiryDate: cert === 'PMP' || cert === 'CBAP' ? 
              new Date(Date.now() + (365 * 3 - i * 30) * 24 * 60 * 60 * 1000) : null,
            credentialId: `${cert}-${100000 + i}`
          })),
          experience: {
            totalYears: 5 + Math.floor(i / 6) * 2,
            consultingYears: 3 + Math.floor(i / 6) * 2,
            previousEmployers: [
              {
                company: ['Big Four Consulting', 'Tech Consultancy Inc', 'Global Advisory Group'][i % 3],
                role: `${levels[Math.max(0, Math.floor(i / 6) - 1)]} Consultant`,
                duration: `${2 + i % 3} years`,
                achievements: ['Led major transformation project', 'Increased client revenue by 20%']
              }
            ]
          },
          availability: {
            status: ['available', 'partially-available', 'busy', 'on-leave'][i % 4],
            currentUtilization: [0, 25, 50, 75, 100][i % 5],
            nextAvailable: i % 4 === 2 ? addDays(new Date(), 30) : new Date(),
            preferredProjectTypes: projectTypes.slice(i % 3, (i % 3) + 2),
            travelWillingness: ['none', 'limited', 'flexible', 'extensive'][i % 4]
          },
          billing: {
            standardRate: 150 + Math.floor(i / 6) * 50,
            currency: 'USD',
            minimumHours: 20,
            overtimeRate: 200 + Math.floor(i / 6) * 75
          },
          performance: {
            projectsCompleted: 10 + i,
            totalHoursBilled: 1000 + i * 100,
            averageRating: 4.0 + (i % 10) / 10,
            totalReviews: 5 + Math.floor(i / 3),
            clientSatisfaction: 4.2 + (i % 8) / 10,
            onTimeDelivery: 90 + (i % 10)
          },
          assignments: {
            current: i % 4 !== 0 ? [`project_${i % 10}`] : [],
            past: Array.from({ length: 3 + i % 5 }, (_, idx) => `project_${i + idx + 10}`),
            upcoming: i % 3 === 0 ? [`project_${i + 50}`] : []
          },
          status: i % 20 === 0 ? 'inactive' : 'active',
          isActive: i % 20 !== 0,
          isAvailable: ['available', 'partially-available'].includes(['available', 'partially-available', 'busy', 'on-leave'][i % 4]),
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i
          },
          tags: [
            levels[Math.floor(i / 6)].toLowerCase(),
            ...skills.slice(i % skills.length, (i % skills.length) + 2).map(s => s.toLowerCase().replace(/\s+/g, '-'))
          ],
          createdAt: new Date(Date.now() - (180 - i * 2) * 24 * 60 * 60 * 1000),
          updatedAt: new Date()
        };

        consultants.push(consultant);
      }

      await collection.insertMany(consultants, { session });

      // Create indexes
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ email: 1 }, { unique: true, session });
      await collection.createIndex({ 'availability.status': 1 }, { session });
      await collection.createIndex({ level: 1 }, { session });
      await collection.createIndex({ 'skills.primary': 1 }, { session });

      logger.info(`Created ${consultants.length} test consultants`);

      return { count: consultants.length };

    } catch (error) {
      logger.error('Failed to seed test consultants', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test engagements
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestEngagements(session) {
    try {
      logger.info('Seeding test engagements');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.ENGAGEMENTS);
      const projectsCollection = db.collection(TestDataSeeder.#COLLECTIONS.PROJECTS);
      const consultantsCollection = db.collection(TestDataSeeder.#COLLECTIONS.CONSULTANTS);

      // Get test projects and consultants
      const testProjects = await projectsCollection.find(
        { 'metadata.isTestData': true },
        { session }
      ).limit(30).toArray();

      const testConsultants = await consultantsCollection.find(
        { 'metadata.isTestData': true },
        { session }
      ).toArray();

      if (testProjects.length === 0 || testConsultants.length === 0) {
        logger.warn('Insufficient test data for engagements');
        return { count: 0 };
      }

      const engagements = [];
      const engagementTypes = ['full-time', 'part-time', 'advisory', 'project-based'];
      const roles = ['Lead Consultant', 'Senior Consultant', 'Consultant', 'Analyst', 'Subject Matter Expert'];

      for (let i = 0; i < 60; i++) {
        const project = testProjects[i % testProjects.length];
        const consultant = testConsultants[i % testConsultants.length];
        
        const startDate = project.timeline.startDate;
        const endDate = i % 3 === 0 ? null : project.timeline.endDate; // Some ongoing
        
        const engagement = {
          organizationId: project.organizationId,
          projectId: project._id,
          consultantId: consultant._id,
          name: `${TestDataSeeder.#TEST_DATA_PREFIX}Engagement_${project.slug}_${consultant.lastName}`,
          type: engagementTypes[i % engagementTypes.length],
          role: roles[i % roles.length],
          description: `${consultant.displayName} engaged as ${roles[i % roles.length]} for ${project.displayName}`,
          timeline: {
            startDate,
            endDate,
            plannedHours: 160 * (1 + i % 3),
            actualHours: Math.min(160 * (1 + i % 3), i * 10),
            allocation: [25, 50, 75, 100][i % 4] // Percentage
          },
          billing: {
            rate: consultant.billing.standardRate,
            currency: 'USD',
            type: ['hourly', 'daily', 'fixed'][i % 3],
            totalBudget: consultant.billing.standardRate * 160 * (1 + i % 3),
            invoiced: i < 20 ? consultant.billing.standardRate * Math.min(160, i * 10) : 0,
            paid: i < 15 ? consultant.billing.standardRate * Math.min(160, i * 8) : 0
          },
          responsibilities: [
            'Deliver project objectives within timeline and budget',
            'Provide expert guidance and recommendations',
            'Collaborate with client stakeholders',
            'Prepare and present deliverables',
            'Mentor junior team members'
          ].slice(0, 3 + i % 2),
          deliverables: [
            'Weekly status reports',
            'Analysis documentation',
            'Strategic recommendations',
            'Implementation roadmap'
          ].slice(0, 2 + i % 3),
          performance: {
            rating: i < 30 ? 4.0 + (i % 10) / 10 : null,
            feedback: i < 30 ? 'Excellent performance and client satisfaction' : null,
            milestonesMet: Math.floor((i / 60) * 5),
            deliverablesCompleted: Math.floor((i / 60) * 4)
          },
          status: i < 10 ? 'completed' : i < 40 ? 'active' : 'planned',
          isActive: i >= 10 && i < 40,
          approvals: {
            clientApproved: true,
            clientApprovedBy: `Client_Manager_${i % 5}`,
            clientApprovedAt: subtractDays(startDate, 5),
            internalApproved: true,
            internalApprovedBy: `Internal_Manager_${i % 3}`,
            internalApprovedAt: subtractDays(startDate, 7)
          },
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            projectName: project.name,
            consultantName: consultant.displayName
          },
          tags: [
            engagementTypes[i % engagementTypes.length],
            project.type,
            consultant.level
          ],
          createdAt: subtractDays(startDate, 10),
          updatedAt: new Date()
        };

        engagements.push(engagement);
      }

      await collection.insertMany(engagements, { session });

      // Create indexes
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ projectId: 1 }, { session });
      await collection.createIndex({ consultantId: 1 }, { session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ 'timeline.startDate': 1 }, { session });

      logger.info(`Created ${engagements.length} test engagements`);

      return { count: engagements.length };

    } catch (error) {
      logger.error('Failed to seed test engagements', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test jobs
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestJobs(session) {
    try {
      logger.info('Seeding test jobs');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.JOBS);
      const orgsCollection = db.collection(TestDataSeeder.#COLLECTIONS.ORGANIZATIONS);
      const clientsCollection = db.collection(TestDataSeeder.#COLLECTIONS.CLIENTS);

      // Get demo organizations and clients
      const demoOrgs = await orgsCollection.find({ isDemo: true }, { session }).toArray();
      const testClients = await clientsCollection.find(
        { 'metadata.isTestData': true },
        { session }
      ).limit(10).toArray();

      const jobs = [];
      const jobTitles = [
        'Senior Business Analyst',
        'Project Manager',
        'Data Scientist',
        'Solution Architect',
        'Change Management Consultant',
        'Financial Analyst',
        'DevOps Engineer',
        'UX Designer',
        'Marketing Manager',
        'Sales Executive'
      ];

      const departments = ['IT', 'Finance', 'Operations', 'Marketing', 'Sales', 'HR'];
      const employmentTypes = ['full-time', 'part-time', 'contract', 'temporary'];
      const experienceLevels = ['entry', 'mid', 'senior', 'executive'];

      for (let i = 0; i < 40; i++) {
        const client = testClients[i % testClients.length];
        const title = jobTitles[i % jobTitles.length];
        
        const job = {
          organizationId: demoOrgs[i % demoOrgs.length]._id,
          clientId: client._id,
          title: `${TestDataSeeder.#TEST_DATA_PREFIX}${title}_${i}`,
          displayTitle: title,
          slug: generateSlug(`${client.slug}-${title}-${i}`),
          department: departments[i % departments.length],
          employmentType: employmentTypes[i % employmentTypes.length],
          experienceLevel: experienceLevels[Math.floor(i / 10) % experienceLevels.length],
          description: {
            summary: `We are seeking a ${title} to join our ${departments[i % departments.length]} team at ${client.displayName}.`,
            responsibilities: [
              `Lead and manage ${title.toLowerCase()} activities`,
              'Collaborate with cross-functional teams',
              'Develop and implement strategic initiatives',
              'Provide expert guidance and recommendations',
              'Drive continuous improvement'
            ],
            requirements: [
              `${3 + Math.floor(i / 10)}+ years of relevant experience`,
              `Bachelor's degree in related field`,
              'Strong analytical and problem-solving skills',
              'Excellent communication abilities',
              'Proven track record of success'
            ],
            niceToHave: [
              'Advanced degree preferred',
              'Industry certifications',
              'Experience with specific tools/technologies',
              'International experience'
            ]
          },
          location: {
            type: ['on-site', 'remote', 'hybrid'][i % 3],
            city: client.address.city,
            state: client.address.state,
            country: client.address.country,
            remoteOptions: {
              fullyRemote: i % 3 === 1,
              hybridDays: i % 3 === 2 ? 2 : 0,
              timezone: 'Flexible'
            }
          },
          compensation: {
            salary: {
              min: 60000 + (Math.floor(i / 10) * 20000),
              max: 80000 + (Math.floor(i / 10) * 30000),
              currency: 'USD',
              period: 'annual'
            },
            bonus: {
              eligible: true,
              targetPercentage: 10 + (i % 4) * 5
            },
            benefits: [
              'Health Insurance',
              'Dental & Vision',
              '401k Matching',
              'PTO',
              'Professional Development'
            ]
          },
          skills: {
            required: skills.slice(i % 5, (i % 5) + 3),
            preferred: skills.slice((i + 3) % 5, ((i + 3) % 5) + 2),
            certifications: i % 2 === 0 ? [certifications[i % certifications.length]] : []
          },
          application: {
            deadline: addDays(new Date(), 30 - i % 20),
            process: [
              'Initial Screening',
              'Technical Interview',
              'Cultural Fit Interview',
              'Final Interview',
              'Reference Check'
            ],
            estimatedDuration: '2-4 weeks',
            contactEmail: `careers@${client.slug}.com`
          },
          metrics: {
            views: 100 + i * 10 + Math.floor(Math.random() * 500),
            applications: 5 + i + Math.floor(Math.random() * 50),
            shortlisted: Math.floor((5 + i) * 0.3),
            interviewed: Math.floor((5 + i) * 0.1),
            daysOpen: i < 10 ? 30 + i * 2 : i - 10
          },
          status: i < 5 ? 'closed' : i < 30 ? 'active' : 'draft',
          isActive: i >= 5 && i < 30,
          isFeatured: i % 10 === 0,
          isUrgent: i % 8 === 0,
          publishedAt: i < 30 ? subtractDays(new Date(), 30 - i) : null,
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            clientName: client.displayName
          },
          tags: [
            departments[i % departments.length].toLowerCase(),
            experienceLevels[Math.floor(i / 10) % experienceLevels.length],
            employmentTypes[i % employmentTypes.length]
          ],
          createdAt: subtractDays(new Date(), 40 - i),
          updatedAt: new Date()
        };

        jobs.push(job);
      }

      await collection.insertMany(jobs, { session });

      // Create indexes
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ clientId: 1 }, { session });
      await collection.createIndex({ slug: 1 }, { unique: true, session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ employmentType: 1 }, { session });
      await collection.createIndex({ experienceLevel: 1 }, { session });
      await collection.createIndex({ 'location.type': 1 }, { session });

      logger.info(`Created ${jobs.length} test jobs`);

      return { count: jobs.length };

    } catch (error) {
      logger.error('Failed to seed test jobs', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test candidates
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestCandidates(session) {
    try {
      logger.info('Seeding test candidates');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.CANDIDATES);

      const candidates = [];
      const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'William', 'Linda'];
      const lastNames = ['Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia'];
      
      for (let i = 0; i < 100; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@candidates.test`;
        
        const candidate = {
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email,
          phone: `+1-555-${String(4000 + i).padStart(4, '0')}`,
          profile: {
            headline: `${experienceLevels[Math.floor(i / 25) % experienceLevels.length]} ${jobTitles[i % jobTitles.length]}`,
            summary: `Experienced professional with ${5 + Math.floor(i / 20)} years in the industry. Proven track record of success and continuous learning.`,
            location: {
              city: ['San Francisco', 'New York', 'Chicago', 'Austin', 'Seattle'][i % 5],
              state: ['CA', 'NY', 'IL', 'TX', 'WA'][i % 5],
              country: 'US',
              openToRelocation: i % 3 === 0
            },
            currentEmployer: i % 4 !== 0 ? TestDataSeeder.#DEMO_COMPANIES[i % TestDataSeeder.#DEMO_COMPANIES.length] : null,
            currentTitle: i % 4 !== 0 ? jobTitles[(i + 1) % jobTitles.length] : null,
            yearsOfExperience: 5 + Math.floor(i / 20),
            highestEducation: ['Bachelor', 'Master', 'PhD', 'Professional'][Math.floor(i / 25) % 4]
          },
          skills: {
            technical: skills.slice(i % 7, (i % 7) + 4),
            soft: ['Leadership', 'Communication', 'Problem Solving', 'Teamwork', 'Adaptability'].slice(0, 3),
            certifications: certifications.slice(i % 8, (i % 8) + Math.floor(i / 30) + 1),
            languages: ['English', 'Spanish', 'French', 'German'].slice(0, 1 + (i % 3))
          },
          experience: Array.from({ length: 2 + Math.floor(i / 30) }, (_, idx) => ({
            company: TestDataSeeder.#DEMO_COMPANIES[(i + idx) % TestDataSeeder.#DEMO_COMPANIES.length],
            title: jobTitles[(i + idx) % jobTitles.length],
            startDate: subtractDays(new Date(), (365 * (3 - idx) + i * 10)),
            endDate: idx === 0 && i % 4 !== 0 ? null : subtractDays(new Date(), (365 * (2 - idx) + i * 5)),
            current: idx === 0 && i % 4 !== 0,
            description: 'Led key initiatives and delivered significant value to the organization.',
            achievements: [
              'Increased efficiency by 25%',
              'Managed team of 10+ professionals',
              'Delivered projects on time and under budget'
            ]
          })),
          education: [
            {
              degree: ['Bachelor', 'Master', 'PhD', 'Professional'][Math.floor(i / 25) % 4],
              field: ['Business Administration', 'Computer Science', 'Engineering', 'Finance'][i % 4],
              institution: ['State University', 'Tech Institute', 'Business School', 'Liberal Arts College'][i % 4],
              graduationYear: 2010 + Math.floor(i / 20),
              gpa: 3.0 + (i % 10) / 10
            }
          ],
          preferences: {
            jobTypes: employmentTypes.slice(i % 2, (i % 2) + 2),
            minSalary: 60000 + (Math.floor(i / 25) * 20000),
            maxSalary: 100000 + (Math.floor(i / 25) * 30000),
            currency: 'USD',
            locations: [
              ['San Francisco', 'New York', 'Chicago', 'Austin', 'Seattle'][i % 5],
              ['San Francisco', 'New York', 'Chicago', 'Austin', 'Seattle'][(i + 1) % 5]
            ],
            remotePreference: ['on-site', 'remote', 'hybrid', 'flexible'][i % 4],
            startDate: i % 5 === 0 ? 'immediately' : `${1 + i % 3} months`
          },
          documents: {
            resume: {
              filename: `${firstName}_${lastName}_Resume.pdf`,
              uploadedAt: subtractDays(new Date(), 10 + i % 20),
              size: 150000 + Math.floor(Math.random() * 100000),
              version: 1 + Math.floor(i / 50)
            },
            coverLetter: i % 3 === 0 ? null : {
              filename: `${firstName}_${lastName}_CoverLetter.pdf`,
              uploadedAt: subtractDays(new Date(), 10 + i % 20),
              size: 50000 + Math.floor(Math.random() * 50000)
            },
            portfolio: i % 5 === 0 ? `https://portfolio.${firstName.toLowerCase()}${lastName.toLowerCase()}.com` : null
          },
          social: {
            linkedin: `https://linkedin.com/in/${firstName.toLowerCase()}${lastName.toLowerCase()}${i}`,
            github: i % 3 === 0 ? `https://github.com/${firstName.toLowerCase()}${i}` : null,
            twitter: i % 5 === 0 ? `@${firstName.toLowerCase()}${i}` : null
          },
          status: ['active', 'passive', 'not-looking', 'archived'][i % 20 === 0 ? 3 : i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0],
          isActive: i % 20 !== 0,
          source: ['website', 'referral', 'job-board', 'linkedin', 'agency'][i % 5],
          rating: i < 50 ? 3 + (i % 20) / 10 : null,
          notes: i < 30 ? 'Strong candidate with excellent qualifications' : null,
          tags: [
            experienceLevels[Math.floor(i / 25) % experienceLevels.length],
            skills[i % skills.length].toLowerCase().replace(/\s+/g, '-'),
            i % 3 === 0 ? 'top-talent' : 'standard'
          ],
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            importBatch: `batch_${Math.floor(i / 20)}`
          },
          privacy: {
            hideFromSearch: i % 20 === 0,
            anonymizeData: false,
            consentGiven: true,
            consentDate: subtractDays(new Date(), 30 + i)
          },
          createdAt: subtractDays(new Date(), 60 + i),
          updatedAt: new Date()
        };

        candidates.push(candidate);
      }

      await collection.insertMany(candidates, { session });

      // Create indexes
      await collection.createIndex({ email: 1 }, { unique: true, session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ 'skills.technical': 1 }, { session });
      await collection.createIndex({ 'profile.yearsOfExperience': 1 }, { session });
      await collection.createIndex({ 'preferences.locations': 1 }, { session });
      await collection.createIndex({ source: 1 }, { session });
      await collection.createIndex({ createdAt: -1 }, { session });

      logger.info(`Created ${candidates.length} test candidates`);

      return { count: candidates.length };

    } catch (error) {
      logger.error('Failed to seed test candidates', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test applications
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestApplications(session) {
    try {
      logger.info('Seeding test applications');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.APPLICATIONS);
      const jobsCollection = db.collection(TestDataSeeder.#COLLECTIONS.JOBS);
      const candidatesCollection = db.collection(TestDataSeeder.#COLLECTIONS.CANDIDATES);

      // Get test jobs and candidates
      const activeJobs = await jobsCollection.find(
        { 'metadata.isTestData': true, status: 'active' },
        { session }
      ).toArray();

      const activeCandidates = await candidatesCollection.find(
        { 'metadata.isTestData': true, status: 'active' },
        { session }
      ).limit(50).toArray();

      if (activeJobs.length === 0 || activeCandidates.length === 0) {
        logger.warn('Insufficient active test data for applications');
        return { count: 0 };
      }

      const applications = [];
      const applicationStatuses = [
        'submitted', 'under-review', 'shortlisted', 'interview-scheduled',
        'interviewed', 'reference-check', 'offer-extended', 'offer-accepted',
        'rejected', 'withdrawn'
      ];

      const rejectionReasons = [
        'Not enough experience',
        'Salary expectations too high',
        'Not a cultural fit',
        'Position filled',
        'Skills mismatch'
      ];

      let applicationIndex = 0;

      for (const job of activeJobs) {
        const applicationsPerJob = 3 + Math.floor(Math.random() * 7); // 3-10 applications per job
        
        for (let i = 0; i < applicationsPerJob && applicationIndex < 150; i++) {
          const candidate = activeCandidates[(applicationIndex + i) % activeCandidates.length];
          const daysAgo = Math.floor(Math.random() * 20);
          
          const status = applicationStatuses[Math.min(
            Math.floor(applicationIndex / 15),
            applicationStatuses.length - 1
          )];
          
          const application = {
            jobId: job._id,
            candidateId: candidate._id,
            organizationId: job.organizationId,
            applicationNumber: `APP-${String(10000 + applicationIndex).padStart(6, '0')}`,
            status,
            stage: TestDataSeeder.#getApplicationStage(status),
            timeline: {
              submitted: subtractDays(new Date(), daysAgo),
              reviewed: ['submitted', 'withdrawn'].includes(status) ? null : 
                subtractDays(new Date(), daysAgo - 1),
              shortlisted: ['shortlisted', 'interview-scheduled', 'interviewed', 'reference-check', 
                'offer-extended', 'offer-accepted'].includes(status) ?
                subtractDays(new Date(), daysAgo - 3) : null,
              interviewed: ['interviewed', 'reference-check', 'offer-extended', 'offer-accepted'].includes(status) ?
                subtractDays(new Date(), daysAgo - 7) : null,
              decided: ['offer-extended', 'offer-accepted', 'rejected'].includes(status) ?
                subtractDays(new Date(), daysAgo - 10) : null
            },
            screening: {
              score: 60 + Math.floor(Math.random() * 40),
              matchPercentage: 50 + Math.floor(Math.random() * 50),
              skillsMatch: TestDataSeeder.#calculateSkillsMatch(job.skills.required, candidate.skills.technical),
              experienceMatch: candidate.profile.yearsOfExperience >= 5,
              educationMatch: true,
              locationMatch: true
            },
            interviews: ['interviewed', 'reference-check', 'offer-extended', 'offer-accepted'].includes(status) ? [
              {
                type: 'phone-screening',
                date: subtractDays(new Date(), daysAgo - 5),
                interviewer: 'HR Manager',
                duration: 30,
                rating: 3 + Math.random() * 2,
                notes: 'Good communication skills, enthusiastic about the role',
                outcome: 'proceed'
              },
              {
                type: 'technical',
                date: subtractDays(new Date(), daysAgo - 7),
                interviewer: 'Technical Lead',
                duration: 60,
                rating: 3 + Math.random() * 2,
                notes: 'Strong technical background, good problem-solving approach',
                outcome: 'proceed'
              }
            ] : [],
            evaluation: {
              strengths: [
                'Strong technical skills',
                'Excellent communication',
                'Cultural fit',
                'Relevant experience'
              ].slice(0, 2 + Math.floor(Math.random() * 2)),
              weaknesses: [
                'Limited industry experience',
                'Salary expectations high',
                'Notice period too long'
              ].slice(0, Math.floor(Math.random() * 2)),
              overallRating: status === 'rejected' ? 2 + Math.random() : 3 + Math.random() * 2,
              recommendation: ['rejected', 'withdrawn'].includes(status) ? 'reject' : 
                ['offer-extended', 'offer-accepted'].includes(status) ? 'hire' : 'proceed'
            },
            offer: ['offer-extended', 'offer-accepted'].includes(status) ? {
              salary: job.compensation.salary.min + 
                Math.floor(Math.random() * (job.compensation.salary.max - job.compensation.salary.min)),
              currency: job.compensation.salary.currency,
              startDate: addDays(new Date(), 30),
              expiryDate: addDays(new Date(), 7),
              status: status === 'offer-accepted' ? 'accepted' : 'pending',
              negotiated: Math.random() > 0.7
            } : null,
            rejection: status === 'rejected' ? {
              reason: rejectionReasons[Math.floor(Math.random() * rejectionReasons.length)],
              feedback: 'Thank you for your interest. We have decided to proceed with other candidates.',
              date: subtractDays(new Date(), daysAgo - 10)
            } : null,
            documents: {
              resume: true,
              coverLetter: candidate.documents.coverLetter !== null,
              portfolio: candidate.documents.portfolio !== null,
              references: ['reference-check', 'offer-extended', 'offer-accepted'].includes(status)
            },
            communication: {
              emails: 1 + Math.floor(applicationIndex / 10),
              lastContact: subtractDays(new Date(), Math.floor(daysAgo / 2)),
              nextFollowUp: ['under-review', 'shortlisted', 'interview-scheduled'].includes(status) ?
                addDays(new Date(), 3) : null
            },
            flags: {
              priority: applicationIndex % 10 === 0,
              fastTrack: applicationIndex % 15 === 0,
              referral: applicationIndex % 8 === 0,
              internal: false
            },
            metadata: {
              source: 'test-seeder',
              isTestData: true,
              testIndex: applicationIndex,
              jobTitle: job.displayTitle,
              candidateName: candidate.displayName
            },
            tags: [
              status,
              TestDataSeeder.#getApplicationStage(status),
              candidate.profile.highestEducation.toLowerCase()
            ],
            createdAt: subtractDays(new Date(), daysAgo),
            updatedAt: new Date()
          };

          applications.push(application);
          applicationIndex++;
        }
      }

      await collection.insertMany(applications, { session });

      // Create indexes
      await collection.createIndex({ jobId: 1 }, { session });
      await collection.createIndex({ candidateId: 1 }, { session });
      await collection.createIndex({ organizationId: 1 }, { session });
      await collection.createIndex({ applicationNumber: 1 }, { unique: true, session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ stage: 1 }, { session });
      await collection.createIndex({ 'timeline.submitted': -1 }, { session });

      logger.info(`Created ${applications.length} test applications`);

      return { count: applications.length };

    } catch (error) {
      logger.error('Failed to seed test applications', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test activities
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestActivities(session) {
    try {
      logger.info('Seeding test activities');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.ACTIVITIES);

      const activities = [];
      const activityTypes = [
        'user_login', 'user_logout', 'project_created', 'project_updated',
        'client_added', 'job_posted', 'application_received', 'interview_scheduled',
        'offer_extended', 'document_uploaded', 'report_generated', 'email_sent'
      ];

      const actors = [
        'john.doe@test.com', 'jane.smith@test.com', 'admin@test.com',
        'manager@test.com', 'recruiter@test.com'
      ];

      for (let i = 0; i < 200; i++) {
        const activityType = activityTypes[i % activityTypes.length];
        const daysAgo = Math.floor(i / 10);
        
        const activity = {
          type: activityType,
          actor: {
            id: `user_${i % 5}`,
            email: actors[i % actors.length],
            name: actors[i % actors.length].split('@')[0].replace('.', ' ')
          },
          target: TestDataSeeder.#getActivityTarget(activityType, i),
          action: TestDataSeeder.#getActivityAction(activityType),
          description: TestDataSeeder.#getActivityDescription(activityType, i),
          context: {
            ip: `192.168.1.${100 + (i % 100)}`,
            userAgent: 'Mozilla/5.0 Test Browser',
            organizationId: `org_${i % 3}`,
            module: TestDataSeeder.#getActivityModule(activityType)
          },
          changes: ['project_updated', 'client_updated'].includes(activityType) ? {
            before: { status: 'draft' },
            after: { status: 'active' }
          } : null,
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            importance: ['low', 'medium', 'high'][i % 3]
          },
          tags: [
            activityType.split('_')[0],
            TestDataSeeder.#getActivityModule(activityType)
          ],
          timestamp: subtractDays(new Date(), daysAgo),
          createdAt: subtractDays(new Date(), daysAgo)
        };

        activities.push(activity);
      }

      await collection.insertMany(activities, { session });

      // Create indexes
      await collection.createIndex({ type: 1 }, { session });
      await collection.createIndex({ 'actor.id': 1 }, { session });
      await collection.createIndex({ 'context.organizationId': 1 }, { session });
      await collection.createIndex({ timestamp: -1 }, { session });

      logger.info(`Created ${activities.length} test activities`);

      return { count: activities.length };

    } catch (error) {
      logger.error('Failed to seed test activities', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test documents
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestDocuments(session) {
    try {
      logger.info('Seeding test documents');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.DOCUMENTS);

      const documents = [];
      const documentTypes = [
        'contract', 'proposal', 'report', 'presentation',
        'invoice', 'statement-of-work', 'resume', 'cover-letter'
      ];

      const fileExtensions = ['pdf', 'docx', 'xlsx', 'pptx'];

      for (let i = 0; i < 100; i++) {
        const docType = documentTypes[i % documentTypes.length];
        const extension = fileExtensions[i % fileExtensions.length];
        
        const document = {
          name: `${TestDataSeeder.#TEST_DATA_PREFIX}${docType}_${i}.${extension}`,
          displayName: `Test ${docType.replace('-', ' ')} ${i}`,
          type: docType,
          category: TestDataSeeder.#getDocumentCategory(docType),
          description: `Test ${docType} document for development purposes`,
          file: {
            originalName: `${docType}_${i}.${extension}`,
            mimeType: TestDataSeeder.#getMimeType(extension),
            size: 100000 + Math.floor(Math.random() * 900000), // 100KB - 1MB
            extension,
            url: `/test-documents/${docType}_${i}.${extension}`,
            storageKey: `documents/test/${docType}_${i}.${extension}`
          },
          relatedTo: {
            type: ['project', 'client', 'job', 'candidate'][i % 4],
            id: `${['project', 'client', 'job', 'candidate'][i % 4]}_${i % 10}`,
            name: `Test ${['Project', 'Client', 'Job', 'Candidate'][i % 4]} ${i % 10}`
          },
          version: {
            number: 1 + Math.floor(i / 30),
            isLatest: true,
            previousVersion: i > 30 ? `doc_${i - 30}` : null
          },
          access: {
            level: ['public', 'internal', 'confidential', 'restricted'][i % 4],
            sharedWith: i % 3 === 0 ? ['user_1', 'user_2'] : [],
            permissions: {
              read: ['all'],
              write: ['owner', 'admin'],
              delete: ['owner']
            }
          },
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            keywords: [docType, 'test', 'development'],
            checksum: generateRandomString(32),
            expiryDate: i % 10 === 0 ? addDays(new Date(), 90) : null
          },
          audit: {
            uploadedBy: actors[i % actors.length],
            uploadedAt: subtractDays(new Date(), 30 - Math.floor(i / 5)),
            lastAccessedBy: actors[(i + 1) % actors.length],
            lastAccessedAt: subtractDays(new Date(), Math.floor(i / 10)),
            downloadCount: Math.floor(Math.random() * 20)
          },
          status: i % 50 === 0 ? 'archived' : 'active',
          isActive: i % 50 !== 0,
          tags: [
            docType,
            extension,
            TestDataSeeder.#getDocumentCategory(docType)
          ],
          createdAt: subtractDays(new Date(), 30 - Math.floor(i / 5)),
          updatedAt: new Date()
        };

        documents.push(document);
      }

      await collection.insertMany(documents, { session });

      // Create indexes
      await collection.createIndex({ type: 1 }, { session });
      await collection.createIndex({ category: 1 }, { session });
      await collection.createIndex({ 'relatedTo.type': 1, 'relatedTo.id': 1 }, { session });
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ 'file.extension': 1 }, { session });

      logger.info(`Created ${documents.length} test documents`);

      return { count: documents.length };

    } catch (error) {
      logger.error('Failed to seed test documents', error);
      throw error;
    }
  }

  /**
   * @private
   * Seeds test tasks
   * @static
   * @async
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} Seeding result
   */
  static async #seedTestTasks(session) {
    try {
      logger.info('Seeding test tasks');

      const db = BaseModel.getDatabase();
      const collection = db.collection(TestDataSeeder.#COLLECTIONS.TASKS);

      const tasks = [];
      const taskTypes = [
        'Review Document', 'Schedule Meeting', 'Prepare Report',
        'Contact Client', 'Update Status', 'Conduct Interview',
        'Submit Proposal', 'Analyze Data', 'Follow Up'
      ];

      const priorities = ['low', 'medium', 'high', 'urgent'];
      const statuses = ['pending', 'in-progress', 'completed', 'cancelled', 'overdue'];

      for (let i = 0; i < 80; i++) {
        const taskType = taskTypes[i % taskTypes.length];
        const dueInDays = -10 + Math.floor(i / 4); // Some overdue, some future
        
        const task = {
          title: `${TestDataSeeder.#TEST_DATA_PREFIX}${taskType} #${i}`,
          description: `${taskType} - This is a test task for development purposes`,
          type: taskType.toLowerCase().replace(/\s+/g, '-'),
          priority: priorities[i % priorities.length],
          status: TestDataSeeder.#getTaskStatus(dueInDays, i),
          assignee: {
            id: `user_${i % 5}`,
            name: actors[i % actors.length].split('@')[0].replace('.', ' '),
            email: actors[i % actors.length]
          },
          creator: {
            id: `user_${(i + 1) % 5}`,
            name: actors[(i + 1) % actors.length].split('@')[0].replace('.', ' '),
            email: actors[(i + 1) % actors.length]
          },
          relatedTo: {
            type: ['project', 'client', 'job', 'application'][i % 4],
            id: `${['project', 'client', 'job', 'application'][i % 4]}_${i % 10}`,
            name: `Test ${['Project', 'Client', 'Job', 'Application'][i % 4]} ${i % 10}`
          },
          timeline: {
            createdAt: subtractDays(new Date(), 20 - Math.floor(i / 8)),
            dueDate: addDays(new Date(), dueInDays),
            startedAt: ['in-progress', 'completed'].includes(TestDataSeeder.#getTaskStatus(dueInDays, i)) ?
              subtractDays(new Date(), 5) : null,
            completedAt: TestDataSeeder.#getTaskStatus(dueInDays, i) === 'completed' ?
              subtractDays(new Date(), 2) : null
          },
          effort: {
            estimated: 2 + (i % 8), // 2-10 hours
            actual: ['completed'].includes(TestDataSeeder.#getTaskStatus(dueInDays, i)) ?
              2 + (i % 6) : null,
            unit: 'hours'
          },
          checklist: taskType.includes('Review') || taskType.includes('Prepare') ? [
            { item: 'Gather requirements', completed: true },
            { item: 'Initial draft', completed: i % 3 !== 0 },
            { item: 'Review and finalize', completed: false },
            { item: 'Submit for approval', completed: false }
          ] : null,
          dependencies: i % 5 === 0 && i > 0 ? [`task_${i - 1}`] : [],
          blockers: i % 10 === 0 ? ['Waiting for client response'] : [],
          comments: [
            {
              author: actors[(i + 2) % actors.length],
              text: 'Please prioritize this task',
              timestamp: subtractDays(new Date(), 3)
            }
          ],
          attachments: i % 3 === 0 ? [`document_${i}`] : [],
          tags: [
            taskType.toLowerCase().replace(/\s+/g, '-'),
            priorities[i % priorities.length],
            ['project', 'client', 'job', 'application'][i % 4]
          ],
          notifications: {
            reminderSent: dueInDays < 3 && dueInDays > -3,
            escalationSent: dueInDays < -3
          },
          metadata: {
            source: 'test-seeder',
            isTestData: true,
            testIndex: i,
            category: TestDataSeeder.#getTaskCategory(taskType)
          },
          isActive: !['completed', 'cancelled'].includes(TestDataSeeder.#getTaskStatus(dueInDays, i)),
          createdAt: subtractDays(new Date(), 20 - Math.floor(i / 8)),
          updatedAt: new Date()
        };

        tasks.push(task);
      }

      await collection.insertMany(tasks, { session });

      // Create indexes
      await collection.createIndex({ status: 1 }, { session });
      await collection.createIndex({ priority: 1 }, { session });
      await collection.createIndex({ 'assignee.id': 1 }, { session });
      await collection.createIndex({ 'relatedTo.type': 1, 'relatedTo.id': 1 }, { session });
      await collection.createIndex({ 'timeline.dueDate': 1 }, { session });

      logger.info(`Created ${tasks.length} test tasks`);

      return { count: tasks.length };

    } catch (error) {
      logger.error('Failed to seed test tasks', error);
      throw error;
    }
  }

  /**
   * @private
   * Helper methods
   */

  static #getApplicationStage(status) {
    const stages = {
      'submitted': 'new',
      'under-review': 'screening',
      'shortlisted': 'screening',
      'interview-scheduled': 'interview',
      'interviewed': 'interview',
      'reference-check': 'final',
      'offer-extended': 'offer',
      'offer-accepted': 'hired',
      'rejected': 'rejected',
      'withdrawn': 'withdrawn'
    };
    return stages[status] || 'new';
  }

  static #calculateSkillsMatch(requiredSkills, candidateSkills) {
    const matches = requiredSkills.filter(skill => 
      candidateSkills.some(candSkill => 
        candSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(candSkill.toLowerCase())
      )
    );
    return Math.round((matches.length / requiredSkills.length) * 100);
  }

  static #getActivityTarget(activityType, index) {
    const targets = {
      'project_created': { type: 'project', id: `project_${index}`, name: `Project ${index}` },
      'client_added': { type: 'client', id: `client_${index}`, name: `Client ${index}` },
      'job_posted': { type: 'job', id: `job_${index}`, name: `Job ${index}` },
      'application_received': { type: 'application', id: `app_${index}`, name: `Application ${index}` }
    };
    return targets[activityType] || null;
  }

  static #getActivityAction(activityType) {
    const actions = {
      'user_login': 'logged in',
      'user_logout': 'logged out',
      'project_created': 'created',
      'project_updated': 'updated',
      'client_added': 'added',
      'job_posted': 'posted',
      'application_received': 'received',
      'interview_scheduled': 'scheduled',
      'offer_extended': 'extended',
      'document_uploaded': 'uploaded',
      'report_generated': 'generated',
      'email_sent': 'sent'
    };
    return actions[activityType] || activityType.split('_').join(' ');
  }

  static #getActivityDescription(activityType, index) {
    const descriptions = {
      'user_login': 'User logged into the system',
      'user_logout': 'User logged out of the system',
      'project_created': `Created new project: Test Project ${index}`,
      'project_updated': `Updated project: Test Project ${index}`,
      'client_added': `Added new client: Test Client ${index}`,
      'job_posted': `Posted new job: Test Position ${index}`,
      'application_received': `Received application for Job ${index % 10}`,
      'interview_scheduled': `Scheduled interview for Application ${index}`,
      'offer_extended': `Extended offer to Candidate ${index}`,
      'document_uploaded': `Uploaded document: Test Document ${index}`,
      'report_generated': `Generated report: Test Report ${index}`,
      'email_sent': `Sent email to recipient${index}@test.com`
    };
    return descriptions[activityType] || `${activityType} activity`;
  }

  static #getActivityModule(activityType) {
    const modules = {
      'user_login': 'auth',
      'user_logout': 'auth',
      'project_created': 'projects',
      'project_updated': 'projects',
      'client_added': 'clients',
      'job_posted': 'recruitment',
      'application_received': 'recruitment',
      'interview_scheduled': 'recruitment',
      'offer_extended': 'recruitment',
      'document_uploaded': 'documents',
      'report_generated': 'reports',
      'email_sent': 'communications'
    };
    return modules[activityType] || 'general';
  }

  static #getDocumentCategory(docType) {
    const categories = {
      'contract': 'legal',
      'proposal': 'business',
      'report': 'deliverables',
      'presentation': 'deliverables',
      'invoice': 'financial',
      'statement-of-work': 'legal',
      'resume': 'recruitment',
      'cover-letter': 'recruitment'
    };
    return categories[docType] || 'general';
  }

  static #getMimeType(extension) {
    const mimeTypes = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  static #getTaskStatus(dueInDays, index) {
    if (dueInDays < -3) return 'overdue';
    if (index % 15 === 0) return 'cancelled';
    if (index < 20) return 'completed';
    if (index < 40) return 'in-progress';
    return 'pending';
  }

  static #getTaskCategory(taskType) {
    if (taskType.includes('Review') || taskType.includes('Analyze')) return 'analysis';
    if (taskType.includes('Contact') || taskType.includes('Follow')) return 'communication';
    if (taskType.includes('Prepare') || taskType.includes('Submit')) return 'deliverable';
    if (taskType.includes('Schedule') || taskType.includes('Conduct')) return 'coordination';
    return 'administrative';
  }
}

// Import required dependencies at the bottom to avoid circular dependencies
const { projectTypes, skills, certifications, experienceLevels, actors } = {
  projectTypes: [
    'Digital Transformation',
    'Process Optimization',
    'Market Analysis',
    'Strategic Planning',
    'Change Management',
    'Technology Implementation'
  ],
  skills: [
    'Project Management', 'Business Analysis', 'Change Management',
    'Data Analytics', 'Strategic Planning', 'Process Improvement',
    'Technology Consulting', 'Financial Analysis', 'Risk Management',
    'Digital Transformation'
  ],
  certifications: [
    'PMP', 'CBAP', 'Six Sigma', 'Agile', 'ITIL', 
    'CPA', 'MBA', 'TOGAF', 'AWS', 'Azure'
  ],
  experienceLevels: ['entry', 'mid', 'senior', 'executive'],
  actors: [
    'john.doe@test.com', 'jane.smith@test.com', 'admin@test.com',
    'manager@test.com', 'recruiter@test.com'
  ]
};

module.exports = TestDataSeeder;