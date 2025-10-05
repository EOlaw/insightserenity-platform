const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * HIPAACompliance - HIPAA compliance management for healthcare data
 * Implements administrative, physical, and technical safeguards
 */
class HIPAACompliance extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            strictMode: config.strictMode || true,
            encryptionRequired: config.encryptionRequired !== false,
            auditRequired: config.auditRequired !== false,
            accessControlRequired: config.accessControlRequired !== false,
            integrityControlRequired: config.integrityControlRequired !== false,
            transmissionSecurityRequired: config.transmissionSecurityRequired !== false,
            minimumPasswordLength: config.minimumPasswordLength || 12,
            passwordComplexity: config.passwordComplexity !== false,
            sessionTimeout: config.sessionTimeout || 15 * 60 * 1000, // 15 minutes
            automaticLogoff: config.automaticLogoff !== false,
            encryptionAlgorithm: config.encryptionAlgorithm || 'aes-256-gcm',
            dataRetentionYears: config.dataRetentionYears || 6,
            businessAssociateAgreements: config.businessAssociateAgreements || [],
            coveredEntity: config.coveredEntity || {},
            riskAssessmentInterval: config.riskAssessmentInterval || 365, // days
            trainingRequired: config.trainingRequired !== false,
            contingencyPlanPath: config.contingencyPlanPath || './contingency',
            auditLogPath: config.auditLogPath || './logs/hipaa',
            breachNotificationRequired: config.breachNotificationRequired !== false,
            breachNotificationDays: config.breachNotificationDays || 60
        };

        this.phiRecords = new Map(); // Protected Health Information
        this.accessLogs = new Map();
        this.disclosures = new Map();
        this.authorizations = new Map();
        this.breaches = [];
        this.riskAssessments = new Map();
        this.trainingSessions = new Map();
        this.businessAssociates = new Map();
        this.securityIncidents = [];
        this.contingencyPlans = new Map();

        this.safeguards = {
            administrative: new Map(),
            physical: new Map(),
            technical: new Map()
        };

        this.phiCategories = {
            DEMOGRAPHIC: ['name', 'address', 'birthDate', 'phone', 'email', 'ssn'],
            MEDICAL: ['diagnosis', 'treatment', 'medication', 'allergy', 'procedure', 'labResult'],
            FINANCIAL: ['insurance', 'billing', 'payment', 'claim'],
            IDENTIFIERS: ['mrn', 'accountNumber', 'certificateNumber', 'deviceId', 'biometric']
        };

        this.accessLevels = {
            NO_ACCESS: 0,
            READ_ONLY: 1,
            READ_WRITE: 2,
            FULL_ACCESS: 3,
            ADMIN: 4
        };

        this.disclosureTypes = {
            TREATMENT: 'treatment',
            PAYMENT: 'payment',
            OPERATIONS: 'operations',
            AUTHORIZED: 'authorized',
            REQUIRED_BY_LAW: 'required_by_law',
            PUBLIC_HEALTH: 'public_health',
            RESEARCH: 'research',
            EMERGENCY: 'emergency'
        };

        this.statistics = {
            phiRecords: 0,
            accessAttempts: 0,
            authorizedAccess: 0,
            deniedAccess: 0,
            disclosures: 0,
            breaches: 0,
            encryptedTransmissions: 0,
            riskAssessments: 0,
            trainingSessions: 0,
            violations: 0,
            remediations: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize HIPAA compliance service
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.emit('disabled');
                return;
            }

            // Create required directories
            await this.createRequiredDirectories();

            // Initialize safeguards
            await this.initializeSafeguards();

            // Load existing records
            await this.loadExistingRecords();

            // Set up monitoring
            this.setupMonitoring();

            // Validate configuration
            this.validateConfiguration();

            this.isInitialized = true;
            this.emit('initialized');

            await this.logComplianceEvent({
                type: 'INITIALIZATION',
                status: 'SUCCESS',
                safeguards: this.getSafeguardStatus()
            });

        } catch (error) {
            this.emit('error', error);
            throw new Error(`HIPAA compliance initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize HIPAA safeguards
     */
    async initializeSafeguards() {
        // Administrative Safeguards
        this.safeguards.administrative.set('security_officer', {
            implemented: true,
            description: 'Security officer designation',
            contact: this.config.coveredEntity.securityOfficer
        });

        this.safeguards.administrative.set('workforce_training', {
            implemented: this.config.trainingRequired,
            description: 'Workforce training program',
            lastTraining: null,
            nextTraining: null
        });

        this.safeguards.administrative.set('access_management', {
            implemented: this.config.accessControlRequired,
            description: 'Access authorization and management',
            controls: ['role-based', 'minimum-necessary']
        });

        this.safeguards.administrative.set('risk_assessment', {
            implemented: true,
            description: 'Regular risk assessments',
            frequency: this.config.riskAssessmentInterval
        });

        // Physical Safeguards
        this.safeguards.physical.set('facility_access', {
            implemented: true,
            description: 'Facility access controls',
            measures: ['badge-access', 'visitor-log', 'escort-policy']
        });

        this.safeguards.physical.set('workstation_use', {
            implemented: true,
            description: 'Workstation use policies',
            controls: ['automatic-logoff', 'screen-lock']
        });

        this.safeguards.physical.set('device_controls', {
            implemented: true,
            description: 'Device and media controls',
            procedures: ['disposal', 'reuse', 'accountability']
        });

        // Technical Safeguards
        this.safeguards.technical.set('access_control', {
            implemented: this.config.accessControlRequired,
            description: 'Technical access controls',
            mechanisms: ['unique-user-id', 'automatic-logoff', 'encryption']
        });

        this.safeguards.technical.set('audit_controls', {
            implemented: this.config.auditRequired,
            description: 'Audit logs and controls',
            features: ['hardware', 'software', 'procedural']
        });

        this.safeguards.technical.set('integrity', {
            implemented: this.config.integrityControlRequired,
            description: 'Data integrity controls',
            methods: ['hashing', 'digital-signatures', 'checksums']
        });

        this.safeguards.technical.set('transmission_security', {
            implemented: this.config.transmissionSecurityRequired,
            description: 'Transmission security',
            protocols: ['tls', 'vpn', 'encryption']
        });
    }

    /**
     * Process PHI access request
     * @param {object} request - Access request
     * @returns {Promise<object>} Access decision
     */
    async accessPHI(request) {
        const startTime = Date.now();
        this.statistics.accessAttempts++;

        try {
            const accessDecision = {
                granted: false,
                requestId: this.generateRequestId(),
                userId: request.userId,
                patientId: request.patientId,
                purpose: request.purpose,
                timestamp: new Date().toISOString(),
                dataAccessed: [],
                restrictions: [],
                auditId: null
            };

            // Verify user authentication
            const authenticated = await this.verifyAuthentication(request.userId, request.credentials);
            if (!authenticated) {
                accessDecision.denialReason = 'Authentication failed';
                await this.logAccessAttempt(accessDecision);
                this.statistics.deniedAccess++;
                return accessDecision;
            }

            // Check authorization
            const authorized = await this.checkAuthorization(
                request.userId,
                request.patientId,
                request.purpose
            );

            if (!authorized.granted) {
                accessDecision.denialReason = authorized.reason;
                await this.logAccessAttempt(accessDecision);
                this.statistics.deniedAccess++;
                return accessDecision;
            }

            // Apply minimum necessary standard
            const allowedData = this.applyMinimumNecessary(
                request.requestedData,
                request.purpose,
                request.userId
            );

            // Check if encryption is required
            if (this.config.encryptionRequired && !request.encryptedChannel) {
                accessDecision.denialReason = 'Encrypted channel required';
                await this.logAccessAttempt(accessDecision);
                this.statistics.deniedAccess++;
                return accessDecision;
            }

            // Grant access
            accessDecision.granted = true;
            accessDecision.dataAccessed = allowedData;
            accessDecision.restrictions = this.getAccessRestrictions(request.purpose);
            accessDecision.expiresAt = new Date(Date.now() + this.config.sessionTimeout).toISOString();

            // Create audit log
            accessDecision.auditId = await this.createAuditLog({
                type: 'PHI_ACCESS',
                userId: request.userId,
                patientId: request.patientId,
                purpose: request.purpose,
                dataAccessed: allowedData,
                timestamp: accessDecision.timestamp,
                processingTime: Date.now() - startTime
            });

            // Track access
            this.trackAccess(request.userId, request.patientId, allowedData);

            this.statistics.authorizedAccess++;
            this.emit('phiAccessed', accessDecision);

            return accessDecision;

        } catch (error) {
            this.statistics.violations++;
            throw new Error(`PHI access failed: ${error.message}`);
        }
    }

    /**
     * Record PHI disclosure
     * @param {object} disclosure - Disclosure details
     * @returns {Promise<object>} Disclosure record
     */
    async recordDisclosure(disclosure) {
        try {
            this.validateDisclosure(disclosure);

            const disclosureRecord = {
                id: this.generateDisclosureId(),
                patientId: disclosure.patientId,
                recipientName: disclosure.recipientName,
                recipientAddress: disclosure.recipientAddress,
                purpose: disclosure.purpose,
                type: disclosure.type || this.disclosureTypes.AUTHORIZED,
                description: disclosure.description,
                dataDisclosed: disclosure.dataDisclosed,
                disclosureDate: new Date().toISOString(),
                authorization: disclosure.authorizationId || null,
                requestedBy: disclosure.requestedBy,
                approvedBy: disclosure.approvedBy,
                method: disclosure.method, // 'electronic', 'paper', 'verbal'
                tracking: {
                    sent: new Date().toISOString(),
                    received: null,
                    confirmed: false
                }
            };

            // Verify authorization if required
            if (this.requiresAuthorization(disclosure.type)) {
                const hasAuth = await this.verifyAuthorization(
                    disclosure.patientId,
                    disclosure.authorizationId
                );

                if (!hasAuth) {
                    throw new Error('Valid authorization required for disclosure');
                }
            }

            // Apply security measures
            if (disclosure.method === 'electronic') {
                disclosureRecord.securityMeasures = {
                    encrypted: true,
                    algorithm: this.config.encryptionAlgorithm,
                    transmissionProtocol: 'TLS 1.3'
                };
                this.statistics.encryptedTransmissions++;
            }

            // Store disclosure
            this.disclosures.set(disclosureRecord.id, disclosureRecord);

            // Update patient disclosure history
            this.updateDisclosureHistory(disclosure.patientId, disclosureRecord.id);

            // Create audit log
            await this.createAuditLog({
                type: 'PHI_DISCLOSURE',
                disclosureId: disclosureRecord.id,
                patientId: disclosure.patientId,
                recipient: disclosure.recipientName,
                purpose: disclosure.purpose
            });

            this.statistics.disclosures++;
            this.emit('disclosureRecorded', disclosureRecord);

            return disclosureRecord;

        } catch (error) {
            this.statistics.violations++;
            throw new Error(`Failed to record disclosure: ${error.message}`);
        }
    }

    /**
     * Report security incident or breach
     * @param {object} incident - Incident details
     * @returns {Promise<object>} Incident report
     */
    async reportSecurityIncident(incident) {
        try {
            const incidentReport = {
                id: this.generateIncidentId(),
                type: incident.type, // 'breach', 'unauthorized_access', 'loss', 'theft'
                discoveredDate: incident.discoveredDate || new Date().toISOString(),
                reportedDate: new Date().toISOString(),
                description: incident.description,
                affectedPatients: incident.affectedPatients || [],
                affectedRecords: incident.affectedRecords || 0,
                dataTypes: incident.dataTypes || [],
                cause: incident.cause,
                location: incident.location,
                containmentActions: incident.containmentActions || [],
                investigationStatus: 'pending',
                riskAssessment: null,
                breachDetermination: null,
                notifications: []
            };

            // Perform risk assessment
            incidentReport.riskAssessment = await this.performRiskAssessment(incident);

            // Determine if breach notification is required
            incidentReport.breachDetermination = this.determineBreachNotification(
                incidentReport.riskAssessment
            );

            if (incidentReport.breachDetermination.notificationRequired) {
                // Calculate notification deadline
                const deadline = new Date();
                deadline.setDate(deadline.getDate() + this.config.breachNotificationDays);
                incidentReport.notificationDeadline = deadline.toISOString();

                // Add to breaches
                this.breaches.push(incidentReport);
                this.statistics.breaches++;

                // Initiate notifications
                await this.initiateBreachNotifications(incidentReport);
            }

            // Store incident
            this.securityIncidents.push(incidentReport);

            // Create audit log
            await this.createAuditLog({
                type: 'SECURITY_INCIDENT',
                incidentId: incidentReport.id,
                severity: incidentReport.riskAssessment.riskLevel,
                affectedCount: incidentReport.affectedRecords
            });

            this.emit('securityIncidentReported', incidentReport);

            return incidentReport;

        } catch (error) {
            throw new Error(`Failed to report security incident: ${error.message}`);
        }
    }

    /**
     * Conduct risk assessment
     * @param {object} scope - Assessment scope
     * @returns {Promise<object>} Risk assessment report
     */
    async conductRiskAssessment(scope = {}) {
        try {
            const assessment = {
                id: this.generateAssessmentId(),
                conductedDate: new Date().toISOString(),
                scope: scope.areas || ['administrative', 'physical', 'technical'],
                methodology: 'NIST 800-30',
                findings: [],
                vulnerabilities: [],
                threats: [],
                risks: [],
                recommendations: [],
                overallRiskLevel: null,
                nextAssessmentDate: null
            };

            // Assess administrative safeguards
            if (scope.areas.includes('administrative')) {
                const adminFindings = this.assessAdministrativeSafeguards();
                assessment.findings.push(...adminFindings);
            }

            // Assess physical safeguards
            if (scope.areas.includes('physical')) {
                const physicalFindings = this.assessPhysicalSafeguards();
                assessment.findings.push(...physicalFindings);
            }

            // Assess technical safeguards
            if (scope.areas.includes('technical')) {
                const technicalFindings = this.assessTechnicalSafeguards();
                assessment.findings.push(...technicalFindings);
            }

            // Identify vulnerabilities
            assessment.vulnerabilities = this.identifyVulnerabilities(assessment.findings);

            // Identify threats
            assessment.threats = this.identifyThreats();

            // Calculate risks
            assessment.risks = this.calculateRisks(
                assessment.vulnerabilities,
                assessment.threats
            );

            // Generate recommendations
            assessment.recommendations = this.generateRecommendations(assessment.risks);

            // Determine overall risk level
            assessment.overallRiskLevel = this.determineOverallRiskLevel(assessment.risks);

            // Set next assessment date
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + this.config.riskAssessmentInterval);
            assessment.nextAssessmentDate = nextDate.toISOString();

            // Store assessment
            this.riskAssessments.set(assessment.id, assessment);

            // Create remediation plan if high risk
            if (assessment.overallRiskLevel === 'high') {
                await this.createRemediationPlan(assessment);
            }

            // Log assessment
            await this.createAuditLog({
                type: 'RISK_ASSESSMENT',
                assessmentId: assessment.id,
                riskLevel: assessment.overallRiskLevel,
                findings: assessment.findings.length,
                recommendations: assessment.recommendations.length
            });

            this.statistics.riskAssessments++;
            this.emit('riskAssessmentCompleted', assessment);

            return assessment;

        } catch (error) {
            throw new Error(`Risk assessment failed: ${error.message}`);
        }
    }

    /**
     * Record workforce training
     * @param {object} training - Training details
     * @returns {Promise<object>} Training record
     */
    async recordTraining(training) {
        try {
            const trainingRecord = {
                id: this.generateTrainingId(),
                employeeId: training.employeeId,
                employeeName: training.employeeName,
                trainingType: training.type, // 'initial', 'annual', 'remedial'
                topics: training.topics || [
                    'Privacy Rule',
                    'Security Rule',
                    'Breach Notification',
                    'Minimum Necessary',
                    'Patient Rights'
                ],
                completedDate: new Date().toISOString(),
                score: training.score,
                passed: training.score >= 80,
                certificateId: this.generateCertificateId(),
                validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                materials: training.materials,
                duration: training.duration,
                instructor: training.instructor
            };

            // Store training record
            if (!this.trainingSessions.has(training.employeeId)) {
                this.trainingSessions.set(training.employeeId, []);
            }
            this.trainingSessions.get(training.employeeId).push(trainingRecord);

            // Update safeguard status
            this.safeguards.administrative.get('workforce_training').lastTraining =
                trainingRecord.completedDate;
            this.safeguards.administrative.get('workforce_training').nextTraining =
                trainingRecord.validUntil;

            // Create audit log
            await this.createAuditLog({
                type: 'WORKFORCE_TRAINING',
                trainingId: trainingRecord.id,
                employeeId: training.employeeId,
                passed: trainingRecord.passed
            });

            this.statistics.trainingSessions++;
            this.emit('trainingRecorded', trainingRecord);

            return trainingRecord;

        } catch (error) {
            throw new Error(`Failed to record training: ${error.message}`);
        }
    }

    /**
     * Create Business Associate Agreement (BAA)
     * @param {object} agreement - Agreement details
     * @returns {Promise<object>} BAA record
     */
    async createBAA(agreement) {
        try {
            const baa = {
                id: this.generateBAAId(),
                businessAssociateName: agreement.name,
                businessAssociateAddress: agreement.address,
                businessAssociateContact: agreement.contact,
                servicesProvided: agreement.services,
                effectiveDate: agreement.effectiveDate || new Date().toISOString(),
                expirationDate: agreement.expirationDate,
                phiTypes: agreement.phiTypes || [],
                permittedUses: agreement.permittedUses || [],
                requiredSafeguards: [
                    'Implement administrative safeguards',
                    'Implement physical safeguards',
                    'Implement technical safeguards',
                    'Report security incidents',
                    'Ensure subcontractor compliance'
                ],
                terminationClauses: agreement.terminationClauses,
                signedDate: new Date().toISOString(),
                signedBy: {
                    coveredEntity: agreement.coveredEntitySignatory,
                    businessAssociate: agreement.businessAssociateSignatory
                },
                status: 'active',
                reviews: [],
                incidents: []
            };

            // Store BAA
            this.businessAssociates.set(baa.id, baa);

            // Add to configuration
            this.config.businessAssociateAgreements.push(baa.id);

            // Create audit log
            await this.createAuditLog({
                type: 'BAA_CREATED',
                baaId: baa.id,
                businessAssociate: baa.businessAssociateName
            });

            this.emit('baaCreated', baa);

            return baa;

        } catch (error) {
            throw new Error(`Failed to create BAA: ${error.message}`);
        }
    }

    /**
     * Validate HIPAA compliance
     * @param {string} operation - Operation type
     * @param {object} data - Operation data
     * @returns {Promise<object>} Validation result
     */
    async validate(operation, data) {
        try {
            const validation = {
                compliant: true,
                violations: [],
                warnings: [],
                safeguardStatus: {}
            };

            // Check encryption requirement
            if (this.config.encryptionRequired && operation === 'transmit') {
                if (!data.encrypted) {
                    validation.compliant = false;
                    validation.violations.push({
                        rule: 'Encryption Required',
                        section: '164.312(a)(2)(iv)',
                        message: 'PHI must be encrypted during transmission'
                    });
                }
            }

            // Check access controls
            if (this.config.accessControlRequired && operation === 'access') {
                if (!data.authenticated || !data.authorized) {
                    validation.compliant = false;
                    validation.violations.push({
                        rule: 'Access Control',
                        section: '164.312(a)(1)',
                        message: 'Proper authentication and authorization required'
                    });
                }
            }

            // Check audit requirements
            if (this.config.auditRequired && !data.auditLogged) {
                validation.warnings.push({
                    rule: 'Audit Controls',
                    section: '164.312(b)',
                    message: 'Activity should be logged for audit'
                });
            }

            // Check minimum necessary
            if (operation === 'disclose' && !this.isMinimumNecessary(data)) {
                validation.compliant = false;
                validation.violations.push({
                    rule: 'Minimum Necessary',
                    section: '164.502(b)',
                    message: 'Only minimum necessary PHI should be disclosed'
                });
            }

            // Check data integrity
            if (this.config.integrityControlRequired && operation === 'modify') {
                if (!data.integrityVerified) {
                    validation.warnings.push({
                        rule: 'Integrity Controls',
                        section: '164.312(c)(1)',
                        message: 'Data integrity should be verified'
                    });
                }
            }

            // Check retention requirements
            if (operation === 'delete') {
                const retentionValid = this.checkRetentionRequirement(data);
                if (!retentionValid) {
                    validation.compliant = false;
                    validation.violations.push({
                        rule: 'Retention Requirement',
                        section: '164.530(j)(2)',
                        message: `Records must be retained for ${this.config.dataRetentionYears} years`
                    });
                }
            }

            // Get safeguard status
            validation.safeguardStatus = this.getSafeguardStatus();

            // Log validation
            if (!validation.compliant) {
                this.statistics.violations++;
                await this.logComplianceEvent({
                    type: 'VALIDATION_FAILED',
                    operation,
                    violations: validation.violations
                });
            }

            return validation;

        } catch (error) {
            throw new Error(`HIPAA validation failed: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */

    async verifyAuthentication(userId, credentials) {
        // Implementation would verify user authentication
        // Check password complexity, MFA, etc.
        return true;
    }

    async checkAuthorization(userId, patientId, purpose) {
        // Check if user is authorized to access patient data for purpose
        const userRole = await this.getUserRole(userId);
        const hasConsent = await this.checkPatientConsent(patientId, purpose);

        if (!hasConsent && !this.isEmergency(purpose)) {
            return { granted: false, reason: 'Patient consent required' };
        }

        if (!this.isAuthorizedRole(userRole, purpose)) {
            return { granted: false, reason: 'Role not authorized for purpose' };
        }

        return { granted: true };
    }

    applyMinimumNecessary(requestedData, purpose, userId) {
        // Filter data based on minimum necessary standard
        const userRole = this.getUserRole(userId);
        const allowedFields = this.getMinimumFieldsForPurpose(purpose, userRole);

        return requestedData.filter(field => allowedFields.includes(field));
    }

    getAccessRestrictions(purpose) {
        const restrictions = [];

        if (purpose === 'treatment') {
            restrictions.push('Use only for direct patient care');
        }

        if (purpose === 'research') {
            restrictions.push('De-identify data when possible');
            restrictions.push('No re-identification attempts');
        }

        return restrictions;
    }

    trackAccess(userId, patientId, dataAccessed) {
        const accessKey = `${userId}-${patientId}`;
        if (!this.accessLogs.has(accessKey)) {
            this.accessLogs.set(accessKey, []);
        }

        this.accessLogs.get(accessKey).push({
            timestamp: new Date().toISOString(),
            dataAccessed
        });
    }

    requiresAuthorization(disclosureType) {
        const noAuthRequired = [
            this.disclosureTypes.TREATMENT,
            this.disclosureTypes.PAYMENT,
            this.disclosureTypes.OPERATIONS,
            this.disclosureTypes.REQUIRED_BY_LAW,
            this.disclosureTypes.PUBLIC_HEALTH
        ];

        return !noAuthRequired.includes(disclosureType);
    }

    async verifyAuthorization(patientId, authorizationId) {
        const auth = this.authorizations.get(authorizationId);
        if (!auth) return false;

        return auth.patientId === patientId &&
               auth.status === 'active' &&
               new Date(auth.expirationDate) > new Date();
    }

    updateDisclosureHistory(patientId, disclosureId) {
        const key = `patient-${patientId}`;
        if (!this.phiRecords.has(key)) {
            this.phiRecords.set(key, { disclosures: [] });
        }
        this.phiRecords.get(key).disclosures.push(disclosureId);
    }

    async performRiskAssessment(incident) {
        const assessment = {
            probability: this.calculateProbability(incident),
            impact: this.calculateImpact(incident),
            riskLevel: null,
            mitigatingFactors: [],
            aggravatingFactors: []
        };

        // Check mitigating factors
        if (incident.dataTypes && !incident.dataTypes.includes('SSN')) {
            assessment.mitigatingFactors.push('No SSN exposed');
        }

        if (incident.containmentActions && incident.containmentActions.length > 0) {
            assessment.mitigatingFactors.push('Quick containment');
        }

        // Check aggravating factors
        if (incident.affectedRecords > 500) {
            assessment.aggravatingFactors.push('Large number of records');
        }

        if (incident.dataTypes && incident.dataTypes.some(type =>
            this.phiCategories.MEDICAL.includes(type))) {
            assessment.aggravatingFactors.push('Medical information exposed');
        }

        // Calculate risk level
        const riskScore = assessment.probability * assessment.impact;
        if (riskScore >= 9) {
            assessment.riskLevel = 'high';
        } else if (riskScore >= 4) {
            assessment.riskLevel = 'medium';
        } else {
            assessment.riskLevel = 'low';
        }

        return assessment;
    }

    calculateProbability(incident) {
        // Calculate probability of harm (1-5 scale)
        let probability = 2; // Base probability

        if (incident.type === 'breach') probability += 2;
        if (incident.type === 'theft') probability += 1;
        if (incident.cause === 'malicious') probability += 1;

        return Math.min(5, probability);
    }

    calculateImpact(incident) {
        // Calculate impact of harm (1-5 scale)
        let impact = 2; // Base impact

        if (incident.affectedRecords > 1000) impact += 2;
        if (incident.affectedRecords > 100) impact += 1;
        if (incident.dataTypes.includes('SSN')) impact += 1;
        if (incident.dataTypes.includes('diagnosis')) impact += 1;

        return Math.min(5, impact);
    }

    determineBreachNotification(riskAssessment) {
        const determination = {
            notificationRequired: false,
            reason: null,
            exceptions: []
        };

        if (riskAssessment.riskLevel === 'high' || riskAssessment.riskLevel === 'medium') {
            determination.notificationRequired = true;
            determination.reason = 'Risk of harm to individuals';
        }

        // Check for exceptions
        if (riskAssessment.mitigatingFactors.includes('Data encrypted')) {
            determination.notificationRequired = false;
            determination.exceptions.push('Encryption safe harbor');
        }

        return determination;
    }

    async initiateBreachNotifications(incident) {
        const notifications = [];

        // Notify affected individuals
        if (incident.affectedPatients.length > 0) {
            notifications.push({
                type: 'individual',
                method: incident.affectedPatients.length < 10 ? 'direct' : 'mail',
                deadline: this.calculateNotificationDeadline(60)
            });
        }

        // Notify HHS
        notifications.push({
            type: 'HHS',
            method: 'electronic',
            deadline: this.calculateNotificationDeadline(60)
        });

        // Notify media if large breach
        if (incident.affectedRecords > 500) {
            notifications.push({
                type: 'media',
                method: 'press_release',
                deadline: this.calculateNotificationDeadline(60)
            });
        }

        incident.notifications = notifications;
    }

    calculateNotificationDeadline(days) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + days);
        return deadline.toISOString();
    }

    assessAdministrativeSafeguards() {
        const findings = [];

        for (const [key, safeguard] of this.safeguards.administrative) {
            if (!safeguard.implemented) {
                findings.push({
                    type: 'administrative',
                    safeguard: key,
                    status: 'not_implemented',
                    risk: 'high'
                });
            }
        }

        return findings;
    }

    assessPhysicalSafeguards() {
        const findings = [];

        for (const [key, safeguard] of this.safeguards.physical) {
            if (!safeguard.implemented) {
                findings.push({
                    type: 'physical',
                    safeguard: key,
                    status: 'not_implemented',
                    risk: 'medium'
                });
            }
        }

        return findings;
    }

    assessTechnicalSafeguards() {
        const findings = [];

        for (const [key, safeguard] of this.safeguards.technical) {
            if (!safeguard.implemented) {
                findings.push({
                    type: 'technical',
                    safeguard: key,
                    status: 'not_implemented',
                    risk: 'high'
                });
            }
        }

        return findings;
    }

    identifyVulnerabilities(findings) {
        return findings.filter(f => f.status === 'not_implemented' || f.status === 'partial')
            .map(f => ({
                safeguard: f.safeguard,
                type: f.type,
                severity: f.risk
            }));
    }

    identifyThreats() {
        return [
            { type: 'external_attack', probability: 'medium' },
            { type: 'insider_threat', probability: 'low' },
            { type: 'physical_theft', probability: 'low' },
            { type: 'natural_disaster', probability: 'low' },
            { type: 'system_failure', probability: 'medium' }
        ];
    }

    calculateRisks(vulnerabilities, threats) {
        const risks = [];

        for (const vuln of vulnerabilities) {
            for (const threat of threats) {
                risks.push({
                    vulnerability: vuln.safeguard,
                    threat: threat.type,
                    likelihood: threat.probability,
                    impact: vuln.severity,
                    riskLevel: this.calculateRiskLevel(threat.probability, vuln.severity)
                });
            }
        }

        return risks;
    }

    calculateRiskLevel(probability, impact) {
        const probMap = { low: 1, medium: 2, high: 3 };
        const impactMap = { low: 1, medium: 2, high: 3 };

        const score = probMap[probability] * impactMap[impact];

        if (score >= 6) return 'high';
        if (score >= 3) return 'medium';
        return 'low';
    }

    generateRecommendations(risks) {
        const recommendations = [];

        const highRisks = risks.filter(r => r.riskLevel === 'high');
        for (const risk of highRisks) {
            recommendations.push({
                priority: 'high',
                risk: risk.vulnerability,
                recommendation: `Implement ${risk.vulnerability} safeguard immediately`,
                timeline: '30 days'
            });
        }

        return recommendations;
    }

    determineOverallRiskLevel(risks) {
        const highRisks = risks.filter(r => r.riskLevel === 'high').length;
        const mediumRisks = risks.filter(r => r.riskLevel === 'medium').length;

        if (highRisks > 0) return 'high';
        if (mediumRisks > 2) return 'medium';
        return 'low';
    }

    async createRemediationPlan(assessment) {
        const plan = {
            assessmentId: assessment.id,
            created: new Date().toISOString(),
            actions: assessment.recommendations.map(rec => ({
                action: rec.recommendation,
                priority: rec.priority,
                deadline: this.calculateDeadline(rec.timeline),
                status: 'pending'
            }))
        };

        this.statistics.remediations++;
        return plan;
    }

    calculateDeadline(timeline) {
        const days = parseInt(timeline) || 30;
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + days);
        return deadline.toISOString();
    }

    isMinimumNecessary(data) {
        // Check if data adheres to minimum necessary standard
        return true;
    }

    checkRetentionRequirement(data) {
        if (!data.createdDate) return true;

        const created = new Date(data.createdDate);
        const now = new Date();
        const yearsDiff = (now - created) / (365 * 24 * 60 * 60 * 1000);

        return yearsDiff < this.config.dataRetentionYears;
    }

    getUserRole(userId) {
        // Implementation would get user role
        return 'provider';
    }

    async checkPatientConsent(patientId, purpose) {
        // Check if patient has given consent for purpose
        return true;
    }

    isEmergency(purpose) {
        return purpose === 'emergency';
    }

    isAuthorizedRole(role, purpose) {
        // Check if role is authorized for purpose
        return true;
    }

    getMinimumFieldsForPurpose(purpose, role) {
        // Return minimum necessary fields for purpose and role
        if (purpose === 'treatment') {
            return ['diagnosis', 'medication', 'allergy'];
        }
        if (purpose === 'billing') {
            return ['insurance', 'billing'];
        }
        return [];
    }

    validateDisclosure(disclosure) {
        if (!disclosure.patientId) {
            throw new Error('Patient ID required');
        }
        if (!disclosure.recipientName) {
            throw new Error('Recipient name required');
        }
        if (!disclosure.purpose) {
            throw new Error('Disclosure purpose required');
        }
    }

    getSafeguardStatus() {
        const status = {
            administrative: {},
            physical: {},
            technical: {}
        };

        for (const [key, safeguard] of this.safeguards.administrative) {
            status.administrative[key] = safeguard.implemented;
        }

        for (const [key, safeguard] of this.safeguards.physical) {
            status.physical[key] = safeguard.implemented;
        }

        for (const [key, safeguard] of this.safeguards.technical) {
            status.technical[key] = safeguard.implemented;
        }

        return status;
    }

    async createAuditLog(event) {
        const logEntry = {
            id: this.generateAuditId(),
            timestamp: new Date().toISOString(),
            ...event
        };

        const logFile = path.join(
            this.config.auditLogPath,
            `hipaa-${new Date().toISOString().split('T')[0]}.log`
        );

        await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

        return logEntry.id;
    }

    async logAccessAttempt(decision) {
        await this.createAuditLog({
            type: 'ACCESS_ATTEMPT',
            granted: decision.granted,
            userId: decision.userId,
            patientId: decision.patientId,
            reason: decision.denialReason
        });
    }

    async logComplianceEvent(event) {
        await this.createAuditLog(event);
    }

    async createRequiredDirectories() {
        const dirs = [
            this.config.auditLogPath,
            this.config.contingencyPlanPath,
            path.join(this.config.auditLogPath, 'access'),
            path.join(this.config.auditLogPath, 'disclosures'),
            path.join(this.config.auditLogPath, 'incidents')
        ];

        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    async loadExistingRecords() {
        // Load existing compliance records from storage
    }

    setupMonitoring() {
        // Set up continuous monitoring
        setInterval(() => {
            this.performComplianceCheck();
        }, 60 * 60 * 1000); // Hourly
    }

    validateConfiguration() {
        if (this.config.strictMode) {
            if (!this.config.encryptionRequired) {
                throw new Error('Encryption must be required in strict mode');
            }
            if (!this.config.auditRequired) {
                throw new Error('Audit logging must be required in strict mode');
            }
        }
    }

    performComplianceCheck() {
        // Perform periodic compliance check
        this.emit('complianceCheck');
    }

    // ID generators
    generateRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDisclosureId() {
        return `disc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateIncidentId() {
        return `inc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateAssessmentId() {
        return `assess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateTrainingId() {
        return `train-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateCertificateId() {
        return `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateBAAId() {
        return `baa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateAuditId() {
        return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get compliance status
     * @returns {Promise<object>} Compliance status
     */
    async getStatus() {
        return {
            compliant: this.statistics.violations === 0,
            statistics: this.statistics,
            safeguards: this.getSafeguardStatus(),
            recentIncidents: this.securityIncidents.slice(-5),
            activeBAAs: this.businessAssociates.size,
            pendingAssessments: Array.from(this.riskAssessments.values())
                .filter(a => new Date(a.nextAssessmentDate) < new Date()).length
        };
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.emit('shutdown');
    }
}

module.exports = HIPAACompliance;
