const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * SOXCompliance - Sarbanes-Oxley Act compliance management
 * Implements financial controls, audit trails, and internal controls
 */
class SOXCompliance extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            strictMode: config.strictMode || true,
            section302Required: config.section302Required !== false, // CEO/CFO certification
            section404Required: config.section404Required !== false, // Internal controls
            section409Required: config.section409Required !== false, // Real-time disclosures
            section802Required: config.section802Required !== false, // Criminal penalties
            section906Required: config.section906Required !== false, // Corporate responsibility
            auditTrailRequired: config.auditTrailRequired !== false,
            segregationOfDuties: config.segregationOfDuties !== false,
            accessControlRequired: config.accessControlRequired !== false,
            changeManagementRequired: config.changeManagementRequired !== false,
            dataRetentionYears: config.dataRetentionYears || 7,
            financialReportingControls: config.financialReportingControls !== false,
            itGeneralControls: config.itGeneralControls !== false,
            fraudDetection: config.fraudDetection !== false,
            whistleblowerProtection: config.whistleblowerProtection !== false,
            materialityThreshold: config.materialityThreshold || 5, // percentage
            controlTestingFrequency: config.controlTestingFrequency || 'quarterly',
            externalAuditorAccess: config.externalAuditorAccess !== false,
            managementAssessmentRequired: config.managementAssessmentRequired !== false,
            auditCommitteeOversight: config.auditCommitteeOversight !== false,
            auditLogPath: config.auditLogPath || './logs/sox'
        };

        this.controls = new Map();
        this.controlTests = new Map();
        this.deficiencies = new Map();
        this.certifications = new Map();
        this.disclosures = new Map();
        this.auditTrails = new Map();
        this.accessLogs = new Map();
        this.changeRecords = new Map();
        this.fraudAlerts = [];
        this.whistleblowerReports = [];
        this.materialWeaknesses = [];
        this.significantDeficiencies = [];

        this.controlCategories = {
            ENTITY_LEVEL: 'entity_level',
            IT_GENERAL: 'it_general',
            APPLICATION: 'application',
            FINANCIAL_REPORTING: 'financial_reporting',
            DISCLOSURE: 'disclosure',
            OPERATIONAL: 'operational'
        };

        this.controlTypes = {
            PREVENTIVE: 'preventive',
            DETECTIVE: 'detective',
            CORRECTIVE: 'corrective',
            COMPENSATING: 'compensating',
            MONITORING: 'monitoring'
        };

        this.controlFrequencies = {
            CONTINUOUS: 'continuous',
            DAILY: 'daily',
            WEEKLY: 'weekly',
            MONTHLY: 'monthly',
            QUARTERLY: 'quarterly',
            ANNUAL: 'annual'
        };

        this.deficiencyTypes = {
            CONTROL_DEFICIENCY: 'control_deficiency',
            SIGNIFICANT_DEFICIENCY: 'significant_deficiency',
            MATERIAL_WEAKNESS: 'material_weakness'
        };

        this.assertions = {
            EXISTENCE: 'existence',
            COMPLETENESS: 'completeness',
            ACCURACY: 'accuracy',
            VALUATION: 'valuation',
            RIGHTS_OBLIGATIONS: 'rights_and_obligations',
            PRESENTATION: 'presentation_and_disclosure'
        };

        this.statistics = {
            totalControls: 0,
            controlTests: 0,
            passedTests: 0,
            failedTests: 0,
            deficiencies: 0,
            materialWeaknesses: 0,
            significantDeficiencies: 0,
            certifications: 0,
            disclosures: 0,
            fraudAlerts: 0,
            whistleblowerReports: 0,
            remediations: 0,
            violations: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize SOX compliance service
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.emit('disabled');
                return;
            }

            // Create required directories
            await this.createRequiredDirectories();

            // Initialize control framework
            await this.initializeControlFramework();

            // Set up monitoring
            this.setupComplianceMonitoring();

            // Load existing records
            await this.loadExistingRecords();

            this.isInitialized = true;
            this.emit('initialized');

            await this.logComplianceEvent({
                type: 'INITIALIZATION',
                status: 'SUCCESS',
                framework: this.getControlFrameworkSummary()
            });

        } catch (error) {
            this.emit('error', error);
            throw new Error(`SOX compliance initialization failed: ${error.message}`);
        }
    }

    /**
     * Initialize control framework
     */
    async initializeControlFramework() {
        // Entity Level Controls
        await this.createControl({
            id: 'ELC-001',
            name: 'Control Environment',
            category: this.controlCategories.ENTITY_LEVEL,
            type: this.controlTypes.PREVENTIVE,
            description: 'Tone at the top and ethical values',
            frequency: this.controlFrequencies.CONTINUOUS,
            owner: 'Management',
            assertions: [this.assertions.EXISTENCE]
        });

        await this.createControl({
            id: 'ELC-002',
            name: 'Risk Assessment',
            category: this.controlCategories.ENTITY_LEVEL,
            type: this.controlTypes.DETECTIVE,
            description: 'Identification and analysis of risks',
            frequency: this.controlFrequencies.QUARTERLY,
            owner: 'Risk Management',
            assertions: [this.assertions.COMPLETENESS]
        });

        // IT General Controls (ITGC)
        await this.createControl({
            id: 'ITGC-001',
            name: 'Access Controls',
            category: this.controlCategories.IT_GENERAL,
            type: this.controlTypes.PREVENTIVE,
            description: 'User access management and authentication',
            frequency: this.controlFrequencies.CONTINUOUS,
            owner: 'IT Security',
            assertions: [this.assertions.RIGHTS_OBLIGATIONS]
        });

        await this.createControl({
            id: 'ITGC-002',
            name: 'Change Management',
            category: this.controlCategories.IT_GENERAL,
            type: this.controlTypes.PREVENTIVE,
            description: 'System change authorization and testing',
            frequency: this.controlFrequencies.CONTINUOUS,
            owner: 'IT Operations',
            assertions: [this.assertions.ACCURACY]
        });

        await this.createControl({
            id: 'ITGC-003',
            name: 'Data Backup and Recovery',
            category: this.controlCategories.IT_GENERAL,
            type: this.controlTypes.CORRECTIVE,
            description: 'Regular backups and disaster recovery',
            frequency: this.controlFrequencies.DAILY,
            owner: 'IT Operations',
            assertions: [this.assertions.EXISTENCE, this.assertions.COMPLETENESS]
        });

        // Financial Reporting Controls
        await this.createControl({
            id: 'FRC-001',
            name: 'Journal Entry Review',
            category: this.controlCategories.FINANCIAL_REPORTING,
            type: this.controlTypes.DETECTIVE,
            description: 'Review and approval of journal entries',
            frequency: this.controlFrequencies.MONTHLY,
            owner: 'Controller',
            assertions: [this.assertions.ACCURACY, this.assertions.VALUATION]
        });

        await this.createControl({
            id: 'FRC-002',
            name: 'Account Reconciliation',
            category: this.controlCategories.FINANCIAL_REPORTING,
            type: this.controlTypes.DETECTIVE,
            description: 'Regular reconciliation of key accounts',
            frequency: this.controlFrequencies.MONTHLY,
            owner: 'Accounting',
            assertions: [this.assertions.COMPLETENESS, this.assertions.ACCURACY]
        });

        await this.createControl({
            id: 'FRC-003',
            name: 'Financial Close Process',
            category: this.controlCategories.FINANCIAL_REPORTING,
            type: this.controlTypes.PREVENTIVE,
            description: 'Structured month-end close procedures',
            frequency: this.controlFrequencies.MONTHLY,
            owner: 'CFO',
            assertions: [this.assertions.PRESENTATION]
        });

        // Segregation of Duties
        if (this.config.segregationOfDuties) {
            await this.createControl({
                id: 'SOD-001',
                name: 'Segregation of Duties',
                category: this.controlCategories.ENTITY_LEVEL,
                type: this.controlTypes.PREVENTIVE,
                description: 'Separation of incompatible duties',
                frequency: this.controlFrequencies.CONTINUOUS,
                owner: 'Compliance',
                assertions: [this.assertions.RIGHTS_OBLIGATIONS]
            });
        }
    }

    /**
     * Create or update a control
     * @param {object} control - Control details
     * @returns {Promise<object>} Control record
     */
    async createControl(control) {
        try {
            const controlRecord = {
                id: control.id || this.generateControlId(),
                name: control.name,
                category: control.category,
                type: control.type,
                description: control.description,
                objective: control.objective,
                frequency: control.frequency,
                owner: control.owner,
                assertions: control.assertions || [],
                risks: control.risks || [],
                testProcedures: control.testProcedures || [],
                documentation: control.documentation || [],
                automated: control.automated || false,
                keyControl: control.keyControl || false,
                compensatingControls: control.compensatingControls || [],
                created: new Date().toISOString(),
                lastTested: null,
                lastTestResult: null,
                effectiveness: 'not_tested',
                status: 'active'
            };

            // Validate control
            this.validateControl(controlRecord);

            // Store control
            this.controls.set(controlRecord.id, controlRecord);

            // Log control creation
            await this.logComplianceEvent({
                type: 'CONTROL_CREATED',
                controlId: controlRecord.id,
                category: controlRecord.category,
                owner: controlRecord.owner
            });

            this.statistics.totalControls++;
            this.emit('controlCreated', controlRecord);

            return controlRecord;

        } catch (error) {
            throw new Error(`Failed to create control: ${error.message}`);
        }
    }

    /**
     * Test a control
     * @param {string} controlId - Control ID
     * @param {object} test - Test details
     * @returns {Promise<object>} Test result
     */
    async testControl(controlId, test) {
        try {
            const control = this.controls.get(controlId);
            if (!control) {
                throw new Error(`Control not found: ${controlId}`);
            }

            const testRecord = {
                id: this.generateTestId(),
                controlId,
                testDate: new Date().toISOString(),
                tester: test.tester,
                testType: test.type || 'design_and_operating',
                sampleSize: test.sampleSize || 0,
                sampleMethod: test.sampleMethod || 'random',
                procedures: test.procedures || control.testProcedures,
                observations: test.observations || [],
                exceptions: test.exceptions || [],
                result: test.result, // 'pass', 'fail', 'partial'
                effectiveness: test.effectiveness, // 'effective', 'ineffective', 'partially_effective'
                recommendations: test.recommendations || [],
                evidence: test.evidence || [],
                reviewedBy: test.reviewedBy,
                reviewDate: test.reviewDate
            };

            // Calculate test result if not provided
            if (!testRecord.result) {
                testRecord.result = this.calculateTestResult(testRecord);
            }

            // Determine effectiveness
            if (!testRecord.effectiveness) {
                testRecord.effectiveness = this.determineEffectiveness(testRecord);
            }

            // Store test record
            if (!this.controlTests.has(controlId)) {
                this.controlTests.set(controlId, []);
            }
            this.controlTests.get(controlId).push(testRecord);

            // Update control
            control.lastTested = testRecord.testDate;
            control.lastTestResult = testRecord.result;
            control.effectiveness = testRecord.effectiveness;

            // Check for deficiencies
            if (testRecord.result === 'fail' || testRecord.effectiveness === 'ineffective') {
                await this.identifyDeficiency({
                    controlId,
                    testId: testRecord.id,
                    exceptions: testRecord.exceptions,
                    impact: test.impact
                });
            }

            // Log test
            await this.logComplianceEvent({
                type: 'CONTROL_TESTED',
                controlId,
                testId: testRecord.id,
                result: testRecord.result,
                effectiveness: testRecord.effectiveness
            });

            // Update statistics
            this.statistics.controlTests++;
            if (testRecord.result === 'pass') {
                this.statistics.passedTests++;
            } else {
                this.statistics.failedTests++;
            }

            this.emit('controlTested', testRecord);

            return testRecord;

        } catch (error) {
            throw new Error(`Failed to test control: ${error.message}`);
        }
    }

    /**
     * Identify and record a deficiency
     * @param {object} deficiency - Deficiency details
     * @returns {Promise<object>} Deficiency record
     */
    async identifyDeficiency(deficiency) {
        try {
            const deficiencyRecord = {
                id: this.generateDeficiencyId(),
                controlId: deficiency.controlId,
                testId: deficiency.testId,
                identifiedDate: new Date().toISOString(),
                type: null, // Will be determined
                description: deficiency.description || 'Control test failure',
                rootCause: deficiency.rootCause,
                impact: deficiency.impact,
                likelihood: deficiency.likelihood,
                financialImpact: deficiency.financialImpact,
                assertions: deficiency.assertions || [],
                affectedAccounts: deficiency.affectedAccounts || [],
                remediationPlan: deficiency.remediationPlan,
                remediationDeadline: deficiency.remediationDeadline,
                remediationOwner: deficiency.remediationOwner,
                status: 'identified',
                compensatingControls: deficiency.compensatingControls || []
            };

            // Determine deficiency type
            deficiencyRecord.type = this.classifyDeficiency(deficiencyRecord);

            // Store deficiency
            this.deficiencies.set(deficiencyRecord.id, deficiencyRecord);

            // Update categories
            if (deficiencyRecord.type === this.deficiencyTypes.MATERIAL_WEAKNESS) {
                this.materialWeaknesses.push(deficiencyRecord);
                this.statistics.materialWeaknesses++;
            } else if (deficiencyRecord.type === this.deficiencyTypes.SIGNIFICANT_DEFICIENCY) {
                this.significantDeficiencies.push(deficiencyRecord);
                this.statistics.significantDeficiencies++;
            }

            // Create remediation plan if not provided
            if (!deficiencyRecord.remediationPlan) {
                deficiencyRecord.remediationPlan = await this.createRemediationPlan(deficiencyRecord);
            }

            // Log deficiency
            await this.logComplianceEvent({
                type: 'DEFICIENCY_IDENTIFIED',
                deficiencyId: deficiencyRecord.id,
                deficiencyType: deficiencyRecord.type,
                controlId: deficiencyRecord.controlId
            });

            this.statistics.deficiencies++;
            this.emit('deficiencyIdentified', deficiencyRecord);

            // Alert if material weakness
            if (deficiencyRecord.type === this.deficiencyTypes.MATERIAL_WEAKNESS) {
                await this.alertMaterialWeakness(deficiencyRecord);
            }

            return deficiencyRecord;

        } catch (error) {
            throw new Error(`Failed to identify deficiency: ${error.message}`);
        }
    }

    /**
     * Process Section 302 certification
     * @param {object} certification - Certification details
     * @returns {Promise<object>} Certification record
     */
    async processSection302Certification(certification) {
        try {
            if (!this.config.section302Required) {
                throw new Error('Section 302 certification not required');
            }

            const certRecord = {
                id: this.generateCertificationId(),
                section: '302',
                period: certification.period,
                certifier: certification.certifier, // CEO or CFO
                certifierTitle: certification.certifierTitle,
                certificationDate: new Date().toISOString(),
                statements: {
                    reviewedReport: certification.reviewedReport !== false,
                    noMaterialMisstatements: certification.noMaterialMisstatements !== false,
                    fairPresentation: certification.fairPresentation !== false,
                    disclosureControlsEffective: certification.disclosureControlsEffective !== false,
                    disclosedDeficiencies: certification.disclosedDeficiencies !== false,
                    disclosedFraud: certification.disclosedFraud !== false,
                    noSignificantChanges: certification.noSignificantChanges !== false
                },
                deficiencies: certification.deficiencies || [],
                materialWeaknesses: this.materialWeaknesses.filter(
                    mw => mw.status !== 'remediated'
                ),
                significantDeficiencies: this.significantDeficiencies.filter(
                    sd => sd.status !== 'remediated'
                ),
                fraudIncidents: certification.fraudIncidents || [],
                signature: certification.signature,
                status: 'certified'
            };

            // Validate certification completeness
            this.validateCertification(certRecord);

            // Store certification
            this.certifications.set(certRecord.id, certRecord);

            // Log certification
            await this.logComplianceEvent({
                type: 'SECTION_302_CERTIFICATION',
                certificationId: certRecord.id,
                certifier: certRecord.certifier,
                period: certRecord.period
            });

            this.statistics.certifications++;
            this.emit('section302Certified', certRecord);

            return certRecord;

        } catch (error) {
            throw new Error(`Section 302 certification failed: ${error.message}`);
        }
    }

    /**
     * Process Section 404 assessment
     * @param {object} assessment - Assessment details
     * @returns {Promise<object>} Assessment report
     */
    async processSection404Assessment(assessment) {
        try {
            if (!this.config.section404Required) {
                throw new Error('Section 404 assessment not required');
            }

            const assessmentReport = {
                id: this.generateAssessmentId(),
                section: '404',
                period: assessment.period,
                assessmentDate: new Date().toISOString(),
                scope: assessment.scope || 'all_material_accounts',
                methodology: assessment.methodology || 'risk-based',
                controls: {
                    total: this.controls.size,
                    tested: 0,
                    effective: 0,
                    ineffective: 0
                },
                deficiencies: {
                    controlDeficiencies: [],
                    significantDeficiencies: [],
                    materialWeaknesses: []
                },
                managementConclusion: null,
                auditorOpinion: assessment.auditorOpinion,
                remediationStatus: {},
                documentation: assessment.documentation || []
            };

            // Analyze control effectiveness
            for (const [controlId, control] of this.controls.entries()) {
                if (control.lastTested) {
                    assessmentReport.controls.tested++;

                    if (control.effectiveness === 'effective') {
                        assessmentReport.controls.effective++;
                    } else {
                        assessmentReport.controls.ineffective++;
                    }
                }
            }

            // Categorize deficiencies
            for (const deficiency of this.deficiencies.values()) {
                if (deficiency.status !== 'remediated') {
                    switch (deficiency.type) {
                        case this.deficiencyTypes.MATERIAL_WEAKNESS:
                            assessmentReport.deficiencies.materialWeaknesses.push(deficiency);
                            break;
                        case this.deficiencyTypes.SIGNIFICANT_DEFICIENCY:
                            assessmentReport.deficiencies.significantDeficiencies.push(deficiency);
                            break;
                        default:
                            assessmentReport.deficiencies.controlDeficiencies.push(deficiency);
                    }
                }
            }

            // Determine management conclusion
            assessmentReport.managementConclusion = this.determineManagementConclusion(assessmentReport);

            // Log assessment
            await this.logComplianceEvent({
                type: 'SECTION_404_ASSESSMENT',
                assessmentId: assessmentReport.id,
                period: assessmentReport.period,
                conclusion: assessmentReport.managementConclusion
            });

            this.emit('section404Assessed', assessmentReport);

            return assessmentReport;

        } catch (error) {
            throw new Error(`Section 404 assessment failed: ${error.message}`);
        }
    }

    /**
     * Report fraud or irregularity
     * @param {object} fraud - Fraud details
     * @returns {Promise<object>} Fraud alert
     */
    async reportFraud(fraud) {
        try {
            const fraudAlert = {
                id: this.generateFraudId(),
                reportedDate: new Date().toISOString(),
                reporter: fraud.reporter || 'anonymous',
                type: fraud.type, // 'financial_reporting', 'asset_misappropriation', 'corruption'
                description: fraud.description,
                amount: fraud.amount,
                period: fraud.period,
                perpetrators: fraud.perpetrators || [],
                evidence: fraud.evidence || [],
                impact: fraud.impact,
                investigationStatus: 'pending',
                investigationFindings: null,
                correctiveActions: [],
                disclosed: false,
                lawEnforcementInvolved: fraud.lawEnforcementInvolved || false
            };

            // Store fraud alert
            this.fraudAlerts.push(fraudAlert);

            // Trigger investigation
            await this.initiateInvestigation(fraudAlert);

            // Check if disclosure required
            if (this.isDisclosureRequired(fraudAlert)) {
                await this.createDisclosure({
                    type: 'fraud',
                    relatedId: fraudAlert.id,
                    description: fraud.description,
                    materialImpact: fraud.amount > this.calculateMaterialityThreshold()
                });
            }

            // Log fraud report
            await this.logComplianceEvent({
                type: 'FRAUD_REPORTED',
                fraudId: fraudAlert.id,
                severity: fraud.impact
            });

            this.statistics.fraudAlerts++;
            this.emit('fraudReported', fraudAlert);

            return fraudAlert;

        } catch (error) {
            throw new Error(`Failed to report fraud: ${error.message}`);
        }
    }

    /**
     * Process whistleblower report
     * @param {object} report - Whistleblower report
     * @returns {Promise<object>} Report record
     */
    async processWhistleblowerReport(report) {
        try {
            if (!this.config.whistleblowerProtection) {
                throw new Error('Whistleblower protection not configured');
            }

            const reportRecord = {
                id: this.generateWhistleblowerId(),
                receivedDate: new Date().toISOString(),
                anonymous: report.anonymous !== false,
                reporterId: report.anonymous ? null : report.reporterId,
                category: report.category, // 'accounting', 'auditing', 'ethics', 'compliance'
                description: report.description,
                evidence: report.evidence || [],
                urgency: report.urgency || 'normal',
                investigationRequired: true,
                investigationStatus: 'pending',
                protectionMeasures: [],
                resolution: null,
                closedDate: null
            };

            // Apply protection measures
            if (!report.anonymous) {
                reportRecord.protectionMeasures = [
                    'Identity protection',
                    'Retaliation monitoring',
                    'Legal protection'
                ];
            }

            // Store report
            this.whistleblowerReports.push(reportRecord);

            // Initiate investigation if serious
            if (report.urgency === 'high' || report.category === 'accounting') {
                await this.initiateInvestigation({
                    type: 'whistleblower',
                    reportId: reportRecord.id,
                    priority: 'high'
                });
            }

            // Notify audit committee if required
            if (this.config.auditCommitteeOversight) {
                await this.notifyAuditCommittee(reportRecord);
            }

            // Log report
            await this.logComplianceEvent({
                type: 'WHISTLEBLOWER_REPORT',
                reportId: reportRecord.id,
                category: reportRecord.category,
                anonymous: reportRecord.anonymous
            });

            this.statistics.whistleblowerReports++;
            this.emit('whistleblowerReport', reportRecord);

            return reportRecord;

        } catch (error) {
            throw new Error(`Failed to process whistleblower report: ${error.message}`);
        }
    }

    /**
     * Track change management
     * @param {object} change - Change details
     * @returns {Promise<object>} Change record
     */
    async trackChange(change) {
        try {
            if (!this.config.changeManagementRequired) {
                return null;
            }

            const changeRecord = {
                id: this.generateChangeId(),
                requestDate: new Date().toISOString(),
                requestor: change.requestor,
                type: change.type, // 'system', 'process', 'control', 'policy'
                description: change.description,
                justification: change.justification,
                impact: change.impact,
                risks: change.risks || [],
                approvals: [],
                testing: {
                    required: change.testingRequired !== false,
                    plan: change.testPlan,
                    results: null
                },
                implementation: {
                    date: change.implementationDate,
                    status: 'pending'
                },
                rollback: {
                    plan: change.rollbackPlan,
                    tested: false
                },
                documentation: change.documentation || [],
                auditTrail: []
            };

            // Check for required approvals
            const requiredApprovals = this.getRequiredApprovals(change);
            for (const approver of requiredApprovals) {
                changeRecord.approvals.push({
                    approver,
                    status: 'pending',
                    date: null
                });
            }

            // Apply segregation of duties
            if (this.config.segregationOfDuties) {
                this.validateSegregationOfDuties(changeRecord);
            }

            // Store change record
            this.changeRecords.set(changeRecord.id, changeRecord);

            // Create audit trail entry
            changeRecord.auditTrail.push({
                timestamp: new Date().toISOString(),
                action: 'created',
                user: change.requestor
            });

            // Log change
            await this.logComplianceEvent({
                type: 'CHANGE_REQUESTED',
                changeId: changeRecord.id,
                changeType: changeRecord.type,
                requestor: changeRecord.requestor
            });

            this.emit('changeTracked', changeRecord);

            return changeRecord;

        } catch (error) {
            throw new Error(`Failed to track change: ${error.message}`);
        }
    }

    /**
     * Validate SOX compliance
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
                requirements: []
            };

            // Check audit trail requirement
            if (this.config.auditTrailRequired && operation === 'financial_transaction') {
                if (!data.auditTrail) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '404',
                        requirement: 'Audit Trail',
                        message: 'All financial transactions must have complete audit trail'
                    });
                }
            }

            // Check access control
            if (this.config.accessControlRequired && operation === 'system_access') {
                if (!data.authenticated || !data.authorized) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '404',
                        requirement: 'Access Control',
                        message: 'Proper authentication and authorization required'
                    });
                }
            }

            // Check segregation of duties
            if (this.config.segregationOfDuties && operation === 'approval') {
                if (data.requestor === data.approver) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '404',
                        requirement: 'Segregation of Duties',
                        message: 'Requestor cannot be the approver'
                    });
                }
            }

            // Check change management
            if (this.config.changeManagementRequired && operation === 'system_change') {
                if (!data.changeTicket || !data.approvals || !data.testing) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '404',
                        requirement: 'Change Management',
                        message: 'Changes must be approved and tested'
                    });
                }
            }

            // Check data retention
            if (operation === 'data_deletion') {
                const retentionValid = this.checkRetentionCompliance(data);
                if (!retentionValid) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '802',
                        requirement: 'Document Retention',
                        message: `Financial records must be retained for ${this.config.dataRetentionYears} years`
                    });
                }
            }

            // Check certification requirements
            if (operation === 'financial_reporting' && this.config.section302Required) {
                if (!data.certified) {
                    validation.warnings.push({
                        section: '302',
                        requirement: 'Management Certification',
                        message: 'Financial reports require management certification'
                    });
                }
            }

            // Check real-time disclosure
            if (operation === 'material_event' && this.config.section409Required) {
                if (!data.disclosedTimely) {
                    validation.compliant = false;
                    validation.violations.push({
                        section: '409',
                        requirement: 'Real-time Disclosure',
                        message: 'Material events must be disclosed promptly'
                    });
                }
            }

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
            throw new Error(`SOX validation failed: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */

    validateControl(control) {
        if (!control.name || !control.category || !control.owner) {
            throw new Error('Control must have name, category, and owner');
        }

        if (!Object.values(this.controlCategories).includes(control.category)) {
            throw new Error(`Invalid control category: ${control.category}`);
        }
    }

    calculateTestResult(test) {
        if (test.exceptions.length === 0) {
            return 'pass';
        } else if (test.exceptions.length <= test.sampleSize * 0.1) {
            return 'partial';
        } else {
            return 'fail';
        }
    }

    determineEffectiveness(test) {
        if (test.result === 'pass') {
            return 'effective';
        } else if (test.result === 'partial') {
            return 'partially_effective';
        } else {
            return 'ineffective';
        }
    }

    classifyDeficiency(deficiency) {
        // Material weakness: reasonable possibility of material misstatement
        if (deficiency.financialImpact > this.calculateMaterialityThreshold()) {
            return this.deficiencyTypes.MATERIAL_WEAKNESS;
        }

        // Significant deficiency: less severe than material weakness but important
        if (deficiency.likelihood === 'probable' || deficiency.impact === 'high') {
            return this.deficiencyTypes.SIGNIFICANT_DEFICIENCY;
        }

        // Control deficiency
        return this.deficiencyTypes.CONTROL_DEFICIENCY;
    }

    calculateMaterialityThreshold() {
        // Simplified calculation - would use financial data in practice
        const revenue = 1000000; // Example
        return revenue * (this.config.materialityThreshold / 100);
    }

    async createRemediationPlan(deficiency) {
        return {
            actions: [
                'Identify root cause',
                'Design compensating controls',
                'Implement fixes',
                'Test effectiveness',
                'Monitor ongoing compliance'
            ],
            timeline: '30 days',
            owner: deficiency.remediationOwner || 'Compliance Officer'
        };
    }

    async alertMaterialWeakness(deficiency) {
        // Alert management and audit committee
        this.emit('materialWeaknessAlert', deficiency);
    }

    validateCertification(certification) {
        for (const [key, value] of Object.entries(certification.statements)) {
            if (!value && key !== 'noSignificantChanges') {
                throw new Error(`Certification incomplete: ${key} not confirmed`);
            }
        }
    }

    determineManagementConclusion(assessment) {
        if (assessment.deficiencies.materialWeaknesses.length > 0) {
            return 'ineffective';
        } else if (assessment.deficiencies.significantDeficiencies.length > 0) {
            return 'effective_with_deficiencies';
        } else {
            return 'effective';
        }
    }

    isDisclosureRequired(fraud) {
        return fraud.amount > this.calculateMaterialityThreshold() ||
               fraud.type === 'financial_reporting';
    }

    async createDisclosure(disclosure) {
        const disclosureRecord = {
            id: this.generateDisclosureId(),
            date: new Date().toISOString(),
            type: disclosure.type,
            description: disclosure.description,
            materialImpact: disclosure.materialImpact,
            form8K: disclosure.materialImpact,
            disclosed: false
        };

        this.disclosures.set(disclosureRecord.id, disclosureRecord);
        this.statistics.disclosures++;

        return disclosureRecord;
    }

    async initiateInvestigation(incident) {
        // Implementation would trigger investigation workflow
        this.emit('investigationInitiated', incident);
    }

    async notifyAuditCommittee(report) {
        // Implementation would notify audit committee
        this.emit('auditCommitteeNotified', report);
    }

    getRequiredApprovals(change) {
        const approvals = ['Direct Manager'];

        if (change.type === 'system' || change.impact === 'high') {
            approvals.push('IT Manager', 'Compliance Officer');
        }

        if (change.type === 'financial' || change.type === 'control') {
            approvals.push('CFO');
        }

        return approvals;
    }

    validateSegregationOfDuties(change) {
        // Check that requestor is not an approver
        const isApprover = change.approvals.some(a => a.approver === change.requestor);
        if (isApprover) {
            throw new Error('Segregation of duties violation: requestor cannot approve own change');
        }
    }

    checkRetentionCompliance(data) {
        if (!data.documentDate) return true;

        const docDate = new Date(data.documentDate);
        const now = new Date();
        const yearsDiff = (now - docDate) / (365 * 24 * 60 * 60 * 1000);

        return yearsDiff < this.config.dataRetentionYears;
    }

    getControlFrameworkSummary() {
        const summary = {
            totalControls: this.controls.size,
            byCategory: {},
            byType: {},
            byFrequency: {}
        };

        for (const control of this.controls.values()) {
            // By category
            summary.byCategory[control.category] =
                (summary.byCategory[control.category] || 0) + 1;

            // By type
            summary.byType[control.type] =
                (summary.byType[control.type] || 0) + 1;

            // By frequency
            summary.byFrequency[control.frequency] =
                (summary.byFrequency[control.frequency] || 0) + 1;
        }

        return summary;
    }

    async logComplianceEvent(event) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        const logFile = path.join(
            this.config.auditLogPath,
            `sox-${new Date().toISOString().split('T')[0]}.log`
        );

        await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

        // Also add to audit trail
        const auditEntry = {
            id: this.generateAuditId(),
            ...logEntry
        };

        this.auditTrails.set(auditEntry.id, auditEntry);
    }

    async createRequiredDirectories() {
        const dirs = [
            this.config.auditLogPath,
            path.join(this.config.auditLogPath, 'controls'),
            path.join(this.config.auditLogPath, 'tests'),
            path.join(this.config.auditLogPath, 'certifications'),
            path.join(this.config.auditLogPath, 'incidents')
        ];

        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    async loadExistingRecords() {
        // Load existing compliance records from storage
    }

    setupComplianceMonitoring() {
        // Set up periodic compliance monitoring
        setInterval(() => {
            this.performComplianceReview();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    performComplianceReview() {
        // Review controls, test schedules, deficiencies
        this.emit('complianceReview');
    }

    // ID generators
    generateControlId() {
        return `CTRL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateTestId() {
        return `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDeficiencyId() {
        return `DEF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateCertificationId() {
        return `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateAssessmentId() {
        return `ASSESS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateFraudId() {
        return `FRAUD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateWhistleblowerId() {
        return `WB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateChangeId() {
        return `CHG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDisclosureId() {
        return `DISC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateAuditId() {
        return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get compliance status
     * @returns {Promise<object>} Compliance status
     */
    async getStatus() {
        const effectiveControls = Array.from(this.controls.values())
            .filter(c => c.effectiveness === 'effective').length;

        return {
            compliant: this.materialWeaknesses.length === 0,
            statistics: this.statistics,
            controlEffectiveness: {
                total: this.controls.size,
                effective: effectiveControls,
                percentage: (effectiveControls / this.controls.size) * 100
            },
            deficiencies: {
                material: this.materialWeaknesses.length,
                significant: this.significantDeficiencies.length,
                control: this.statistics.deficiencies - this.materialWeaknesses.length - this.significantDeficiencies.length
            },
            recentCertifications: Array.from(this.certifications.values()).slice(-5),
            pendingRemediations: Array.from(this.deficiencies.values())
                .filter(d => d.status !== 'remediated').length
        };
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.emit('shutdown');
    }
}

module.exports = SOXCompliance;
