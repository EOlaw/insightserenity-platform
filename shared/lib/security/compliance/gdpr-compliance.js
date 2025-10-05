const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * GDPRCompliance - GDPR compliance management and validation
 * Handles data protection, privacy rights, and GDPR requirements
 */
class GDPRCompliance extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            enabled: config.enabled !== false,
            strictMode: config.strictMode || false,
            consentRequired: config.consentRequired !== false,
            dataMinimization: config.dataMinimization !== false,
            rightToErasure: config.rightToErasure !== false,
            dataPortability: config.dataPortability !== false,
            privacyByDesign: config.privacyByDesign !== false,
            breachNotification: config.breachNotification !== false,
            breachNotificationTime: config.breachNotificationTime || 72, // hours
            lawfulBasis: config.lawfulBasis || ['consent', 'contract', 'legal', 'vital', 'public', 'legitimate'],
            dataRetentionPeriod: config.dataRetentionPeriod || 365 * 24 * 60 * 60 * 1000, // 1 year
            auditLogPath: config.auditLogPath || './logs/gdpr',
            encryptPersonalData: config.encryptPersonalData !== false,
            anonymizationEnabled: config.anonymizationEnabled !== false,
            pseudonymizationEnabled: config.pseudonymizationEnabled !== false,
            crossBorderTransfers: config.crossBorderTransfers || false,
            approvedCountries: config.approvedCountries || ['EU', 'EEA'],
            dpoContact: config.dpoContact || null,
            processingRecords: config.processingRecords !== false,
            impactAssessments: config.impactAssessments !== false
        };

        this.consentRecords = new Map();
        this.processingActivities = new Map();
        this.dataSubjects = new Map();
        this.breaches = [];
        this.erasureRequests = new Map();
        this.accessRequests = new Map();
        this.portabilityRequests = new Map();
        this.objections = new Map();
        this.dpiaRecords = new Map(); // Data Protection Impact Assessments

        this.personalDataCategories = {
            BASIC: ['name', 'email', 'phone', 'address'],
            SENSITIVE: ['health', 'religion', 'ethnicity', 'political', 'sexual', 'genetic', 'biometric'],
            FINANCIAL: ['bankAccount', 'creditCard', 'income', 'tax'],
            BEHAVIORAL: ['browsing', 'preferences', 'location', 'usage'],
            IDENTIFIERS: ['ssn', 'passport', 'driverLicense', 'nationalId']
        };

        this.lawfulBases = {
            CONSENT: 'consent',
            CONTRACT: 'contract',
            LEGAL_OBLIGATION: 'legal',
            VITAL_INTERESTS: 'vital',
            PUBLIC_TASK: 'public',
            LEGITIMATE_INTERESTS: 'legitimate'
        };

        this.dataSubjectRights = {
            ACCESS: 'access',
            RECTIFICATION: 'rectification',
            ERASURE: 'erasure',
            PORTABILITY: 'portability',
            RESTRICTION: 'restriction',
            OBJECTION: 'objection',
            AUTOMATED_DECISION: 'automated_decision'
        };

        this.statistics = {
            totalConsents: 0,
            activeConsents: 0,
            withdrawnConsents: 0,
            dataBreaches: 0,
            erasureRequests: 0,
            accessRequests: 0,
            portabilityRequests: 0,
            violations: 0,
            dpiaCount: 0,
            crossBorderTransfers: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize GDPR compliance service
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.emit('disabled');
                return;
            }

            // Create audit directory
            await fs.mkdir(this.config.auditLogPath, { recursive: true });

            // Load existing records
            await this.loadExistingRecords();

            // Set up periodic compliance checks
            this.setupComplianceChecks();

            // Initialize breach monitoring
            this.setupBreachMonitoring();

            this.isInitialized = true;
            this.emit('initialized');

            await this.logComplianceEvent({
                type: 'INITIALIZATION',
                status: 'SUCCESS',
                details: { config: this.getSafeConfig() }
            });

        } catch (error) {
            this.emit('error', error);
            throw new Error(`GDPR compliance initialization failed: ${error.message}`);
        }
    }

    /**
     * Record consent from data subject
     * @param {object} consent - Consent details
     * @returns {Promise<object>} Consent record
     */
    async recordConsent(consent) {
        try {
            this.validateConsent(consent);

            const consentRecord = {
                id: this.generateConsentId(),
                dataSubjectId: consent.dataSubjectId,
                purposes: consent.purposes,
                scope: consent.scope,
                lawfulBasis: consent.lawfulBasis || this.lawfulBases.CONSENT,
                obtained: new Date().toISOString(),
                expiresAt: consent.expiresAt || this.calculateConsentExpiry(),
                method: consent.method, // 'explicit', 'implicit'
                version: consent.version || '1.0',
                language: consent.language || 'en',
                withdrawable: consent.withdrawable !== false,
                metadata: {
                    ip: consent.ip,
                    userAgent: consent.userAgent,
                    source: consent.source,
                    formId: consent.formId
                },
                status: 'active',
                hash: null
            };

            // Generate integrity hash
            consentRecord.hash = this.generateRecordHash(consentRecord);

            // Store consent
            this.consentRecords.set(consentRecord.id, consentRecord);

            // Update data subject record
            this.updateDataSubjectRecord(consent.dataSubjectId, {
                consent: consentRecord.id,
                consentDate: consentRecord.obtained
            });

            // Log consent
            await this.logComplianceEvent({
                type: 'CONSENT_OBTAINED',
                dataSubjectId: consent.dataSubjectId,
                consentId: consentRecord.id,
                purposes: consent.purposes
            });

            // Update statistics
            this.statistics.totalConsents++;
            this.statistics.activeConsents++;

            this.emit('consentRecorded', consentRecord);

            return consentRecord;

        } catch (error) {
            this.statistics.violations++;
            throw new Error(`Failed to record consent: ${error.message}`);
        }
    }

    /**
     * Withdraw consent
     * @param {string} consentId - Consent ID
     * @param {object} options - Withdrawal options
     * @returns {Promise<object>} Withdrawal confirmation
     */
    async withdrawConsent(consentId, options = {}) {
        try {
            const consent = this.consentRecords.get(consentId);

            if (!consent) {
                throw new Error('Consent record not found');
            }

            if (!consent.withdrawable) {
                throw new Error('This consent cannot be withdrawn');
            }

            // Update consent status
            consent.status = 'withdrawn';
            consent.withdrawnAt = new Date().toISOString();
            consent.withdrawalReason = options.reason;

            // Process data deletion if required
            if (options.deleteData) {
                await this.processErasureRequest({
                    dataSubjectId: consent.dataSubjectId,
                    reason: 'consent_withdrawal',
                    scope: consent.scope
                });
            }

            // Log withdrawal
            await this.logComplianceEvent({
                type: 'CONSENT_WITHDRAWN',
                dataSubjectId: consent.dataSubjectId,
                consentId,
                reason: options.reason
            });

            // Update statistics
            this.statistics.activeConsents--;
            this.statistics.withdrawnConsents++;

            this.emit('consentWithdrawn', consent);

            return {
                success: true,
                consentId,
                withdrawnAt: consent.withdrawnAt
            };

        } catch (error) {
            throw new Error(`Failed to withdraw consent: ${error.message}`);
        }
    }

    /**
     * Process data subject access request
     * @param {object} request - Access request
     * @returns {Promise<object>} Access request response
     */
    async processAccessRequest(request) {
        try {
            const requestRecord = {
                id: this.generateRequestId(),
                type: this.dataSubjectRights.ACCESS,
                dataSubjectId: request.dataSubjectId,
                requestedAt: new Date().toISOString(),
                status: 'pending',
                verificationMethod: request.verificationMethod,
                scope: request.scope || 'all'
            };

            this.accessRequests.set(requestRecord.id, requestRecord);

            // Verify identity
            const verified = await this.verifyDataSubjectIdentity(
                request.dataSubjectId,
                request.verificationData
            );

            if (!verified) {
                requestRecord.status = 'rejected';
                requestRecord.reason = 'identity_verification_failed';
                return requestRecord;
            }

            // Collect data
            const subjectData = await this.collectDataSubjectInformation(request.dataSubjectId);

            // Prepare response
            const response = {
                requestId: requestRecord.id,
                dataSubjectId: request.dataSubjectId,
                providedAt: new Date().toISOString(),
                data: subjectData,
                format: request.format || 'json',
                categories: Object.keys(subjectData),
                processingPurposes: this.getProcessingPurposes(request.dataSubjectId),
                retention: this.getRetentionInformation(request.dataSubjectId),
                recipients: this.getDataRecipients(request.dataSubjectId),
                source: this.getDataSource(request.dataSubjectId)
            };

            // Update request status
            requestRecord.status = 'completed';
            requestRecord.completedAt = response.providedAt;

            // Log access request
            await this.logComplianceEvent({
                type: 'ACCESS_REQUEST_COMPLETED',
                dataSubjectId: request.dataSubjectId,
                requestId: requestRecord.id
            });

            // Update statistics
            this.statistics.accessRequests++;

            this.emit('accessRequestCompleted', response);

            return response;

        } catch (error) {
            throw new Error(`Failed to process access request: ${error.message}`);
        }
    }

    /**
     * Process erasure request (Right to be Forgotten)
     * @param {object} request - Erasure request
     * @returns {Promise<object>} Erasure confirmation
     */
    async processErasureRequest(request) {
        try {
            const requestRecord = {
                id: this.generateRequestId(),
                type: this.dataSubjectRights.ERASURE,
                dataSubjectId: request.dataSubjectId,
                requestedAt: new Date().toISOString(),
                status: 'pending',
                scope: request.scope || 'all',
                reason: request.reason
            };

            this.erasureRequests.set(requestRecord.id, requestRecord);

            // Check if erasure can be performed
            const canErase = await this.checkErasureEligibility(request.dataSubjectId);

            if (!canErase.eligible) {
                requestRecord.status = 'rejected';
                requestRecord.reason = canErase.reason;
                return requestRecord;
            }

            // Perform erasure
            const erasureResult = await this.performDataErasure(
                request.dataSubjectId,
                request.scope
            );

            // Update request status
            requestRecord.status = 'completed';
            requestRecord.completedAt = new Date().toISOString();
            requestRecord.erasedData = erasureResult.categories;

            // Notify third parties if required
            if (request.notifyRecipients) {
                await this.notifyRecipientsOfErasure(request.dataSubjectId);
            }

            // Log erasure
            await this.logComplianceEvent({
                type: 'ERASURE_REQUEST_COMPLETED',
                dataSubjectId: request.dataSubjectId,
                requestId: requestRecord.id,
                erasedCategories: erasureResult.categories
            });

            // Update statistics
            this.statistics.erasureRequests++;

            this.emit('erasureRequestCompleted', requestRecord);

            return requestRecord;

        } catch (error) {
            throw new Error(`Failed to process erasure request: ${error.message}`);
        }
    }

    /**
     * Process data portability request
     * @param {object} request - Portability request
     * @returns {Promise<object>} Portable data package
     */
    async processPortabilityRequest(request) {
        try {
            const requestRecord = {
                id: this.generateRequestId(),
                type: this.dataSubjectRights.PORTABILITY,
                dataSubjectId: request.dataSubjectId,
                requestedAt: new Date().toISOString(),
                status: 'pending',
                format: request.format || 'json',
                targetController: request.targetController
            };

            this.portabilityRequests.set(requestRecord.id, requestRecord);

            // Collect portable data
            const portableData = await this.collectPortableData(request.dataSubjectId);

            // Format data for portability
            const formattedData = this.formatDataForPortability(
                portableData,
                request.format
            );

            // Create data package
            const dataPackage = {
                version: '1.0',
                created: new Date().toISOString(),
                dataSubjectId: request.dataSubjectId,
                format: request.format,
                data: formattedData,
                metadata: {
                    categories: Object.keys(portableData),
                    recordCount: this.countRecords(portableData),
                    checksum: this.generateChecksum(formattedData)
                }
            };

            // Transfer to another controller if requested
            if (request.targetController) {
                await this.transferToController(dataPackage, request.targetController);
            }

            // Update request status
            requestRecord.status = 'completed';
            requestRecord.completedAt = new Date().toISOString();

            // Log portability request
            await this.logComplianceEvent({
                type: 'PORTABILITY_REQUEST_COMPLETED',
                dataSubjectId: request.dataSubjectId,
                requestId: requestRecord.id,
                targetController: request.targetController
            });

            // Update statistics
            this.statistics.portabilityRequests++;

            this.emit('portabilityRequestCompleted', dataPackage);

            return dataPackage;

        } catch (error) {
            throw new Error(`Failed to process portability request: ${error.message}`);
        }
    }

    /**
     * Report data breach
     * @param {object} breach - Breach details
     * @returns {Promise<object>} Breach report
     */
    async reportDataBreach(breach) {
        try {
            const breachReport = {
                id: this.generateBreachId(),
                discoveredAt: breach.discoveredAt || new Date().toISOString(),
                reportedAt: new Date().toISOString(),
                nature: breach.nature, // 'confidentiality', 'integrity', 'availability'
                categories: breach.categories, // Types of personal data affected
                approximateAffected: breach.approximateAffected,
                consequences: breach.consequences,
                measuresTaken: breach.measuresTaken,
                measuresProposed: breach.measuresProposed,
                crossBorder: breach.crossBorder || false,
                notificationRequired: null,
                notificationDeadline: null,
                status: 'reported'
            };

            // Assess notification requirement
            const assessment = this.assessBreachSeverity(breachReport);
            breachReport.notificationRequired = assessment.notificationRequired;
            breachReport.riskLevel = assessment.riskLevel;

            if (assessment.notificationRequired) {
                const discoveredTime = new Date(breachReport.discoveredAt).getTime();
                const deadlineTime = discoveredTime + (this.config.breachNotificationTime * 60 * 60 * 1000);
                breachReport.notificationDeadline = new Date(deadlineTime).toISOString();
            }

            // Store breach report
            this.breaches.push(breachReport);

            // Notify authorities if required
            if (breachReport.notificationRequired) {
                await this.notifyDataProtectionAuthority(breachReport);

                // Notify affected individuals if high risk
                if (assessment.riskLevel === 'high') {
                    await this.notifyAffectedIndividuals(breachReport);
                }
            }

            // Log breach
            await this.logComplianceEvent({
                type: 'DATA_BREACH_REPORTED',
                breachId: breachReport.id,
                severity: assessment.riskLevel,
                affectedCount: breach.approximateAffected
            });

            // Update statistics
            this.statistics.dataBreaches++;

            this.emit('dataBreachReported', breachReport);

            return breachReport;

        } catch (error) {
            throw new Error(`Failed to report data breach: ${error.message}`);
        }
    }

    /**
     * Conduct Data Protection Impact Assessment (DPIA)
     * @param {object} processing - Processing activity details
     * @returns {Promise<object>} DPIA report
     */
    async conductDPIA(processing) {
        try {
            const dpia = {
                id: this.generateDPIAId(),
                conductedAt: new Date().toISOString(),
                processingActivity: processing.activity,
                purpose: processing.purpose,
                necessity: processing.necessity,
                proportionality: processing.proportionality,
                risks: [],
                measures: [],
                residualRisk: null,
                approval: null
            };

            // Identify risks
            dpia.risks = this.identifyPrivacyRisks(processing);

            // Identify measures
            dpia.measures = this.identifyRiskMeasures(dpia.risks);

            // Calculate residual risk
            dpia.residualRisk = this.calculateResidualRisk(dpia.risks, dpia.measures);

            // Determine approval requirement
            dpia.approval = {
                required: dpia.residualRisk === 'high',
                status: 'pending',
                approver: this.config.dpoContact
            };

            // Store DPIA
            this.dpiaRecords.set(dpia.id, dpia);

            // Log DPIA
            await this.logComplianceEvent({
                type: 'DPIA_CONDUCTED',
                dpiaId: dpia.id,
                activity: processing.activity,
                residualRisk: dpia.residualRisk
            });

            // Update statistics
            this.statistics.dpiaCount++;

            this.emit('dpiaCompleted', dpia);

            return dpia;

        } catch (error) {
            throw new Error(`Failed to conduct DPIA: ${error.message}`);
        }
    }

    /**
     * Validate operation for GDPR compliance
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

            // Check consent requirement
            if (this.config.consentRequired && this.requiresConsent(operation)) {
                const hasConsent = await this.checkConsent(data.dataSubjectId, operation);
                if (!hasConsent) {
                    validation.compliant = false;
                    validation.violations.push({
                        requirement: 'consent',
                        message: 'Valid consent required for this operation'
                    });
                }
            }

            // Check lawful basis
            const lawfulBasis = this.checkLawfulBasis(operation, data);
            if (!lawfulBasis) {
                validation.compliant = false;
                validation.violations.push({
                    requirement: 'lawful_basis',
                    message: 'No lawful basis for processing'
                });
            }

            // Check data minimization
            if (this.config.dataMinimization) {
                const minimal = this.checkDataMinimization(data);
                if (!minimal) {
                    validation.warnings.push({
                        requirement: 'data_minimization',
                        message: 'Consider reducing data collection'
                    });
                }
            }

            // Check purpose limitation
            const purposeValid = this.checkPurposeLimitation(operation, data);
            if (!purposeValid) {
                validation.compliant = false;
                validation.violations.push({
                    requirement: 'purpose_limitation',
                    message: 'Processing exceeds stated purpose'
                });
            }

            // Check retention period
            const retentionValid = this.checkRetentionPeriod(data);
            if (!retentionValid) {
                validation.warnings.push({
                    requirement: 'retention',
                    message: 'Data retention period exceeded'
                });
            }

            // Check cross-border transfer
            if (data.transferLocation) {
                const transferValid = this.checkCrossBorderTransfer(data.transferLocation);
                if (!transferValid) {
                    validation.compliant = false;
                    validation.violations.push({
                        requirement: 'cross_border',
                        message: 'Unauthorized cross-border transfer'
                    });
                }
            }

            // Check encryption requirement
            if (this.config.encryptPersonalData && this.containsPersonalData(data)) {
                if (!data.encrypted) {
                    validation.compliant = false;
                    validation.violations.push({
                        requirement: 'encryption',
                        message: 'Personal data must be encrypted'
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
            throw new Error(`GDPR validation failed: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */

    validateConsent(consent) {
        if (!consent.dataSubjectId) {
            throw new Error('Data subject ID is required');
        }

        if (!consent.purposes || consent.purposes.length === 0) {
            throw new Error('At least one purpose must be specified');
        }

        if (!consent.scope) {
            throw new Error('Consent scope is required');
        }

        if (this.config.strictMode) {
            if (!consent.method || consent.method !== 'explicit') {
                throw new Error('Explicit consent required in strict mode');
            }
        }
    }

    generateConsentId() {
        return `consent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateRequestId() {
        return `request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateBreachId() {
        return `breach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateDPIAId() {
        return `dpia-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    calculateConsentExpiry() {
        return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
    }

    generateRecordHash(record) {
        const data = JSON.stringify(record);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    generateChecksum(data) {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('md5').update(str).digest('hex');
    }

    updateDataSubjectRecord(dataSubjectId, updates) {
        if (!this.dataSubjects.has(dataSubjectId)) {
            this.dataSubjects.set(dataSubjectId, {
                id: dataSubjectId,
                created: new Date().toISOString(),
                consents: [],
                requests: []
            });
        }

        const record = this.dataSubjects.get(dataSubjectId);
        Object.assign(record, updates);
    }

    async verifyDataSubjectIdentity(dataSubjectId, verificationData) {
        // Implementation would verify identity
        return true;
    }

    async collectDataSubjectInformation(dataSubjectId) {
        // Implementation would collect all data about subject
        return {
            personal: {},
            behavioral: {},
            preferences: {},
            consents: Array.from(this.consentRecords.values())
                .filter(c => c.dataSubjectId === dataSubjectId)
        };
    }

    async collectPortableData(dataSubjectId) {
        // Implementation would collect portable data
        return {
            personal: {},
            provided: {},
            observed: {}
        };
    }

    formatDataForPortability(data, format) {
        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);
            case 'csv':
                // Convert to CSV format
                return data;
            case 'xml':
                // Convert to XML format
                return data;
            default:
                return data;
        }
    }

    countRecords(data) {
        let count = 0;
        for (const category of Object.values(data)) {
            if (Array.isArray(category)) {
                count += category.length;
            } else if (typeof category === 'object') {
                count += Object.keys(category).length;
            }
        }
        return count;
    }

    async checkErasureEligibility(dataSubjectId) {
        // Check legal requirements, ongoing contracts, etc.
        return { eligible: true };
    }

    async performDataErasure(dataSubjectId, scope) {
        // Implementation would erase data
        return { categories: ['personal', 'behavioral'] };
    }

    async notifyRecipientsOfErasure(dataSubjectId) {
        // Notify third parties about erasure
    }

    async transferToController(dataPackage, targetController) {
        // Transfer data to another controller
        if (this.config.crossBorderTransfers) {
            this.statistics.crossBorderTransfers++;
        }
    }

    assessBreachSeverity(breach) {
        let riskLevel = 'low';
        let notificationRequired = false;

        // Check if sensitive data is involved
        const hasSensitive = breach.categories.some(cat =>
            this.personalDataCategories.SENSITIVE.includes(cat)
        );

        if (hasSensitive) {
            riskLevel = 'high';
            notificationRequired = true;
        } else if (breach.approximateAffected > 1000) {
            riskLevel = 'medium';
            notificationRequired = true;
        }

        return { riskLevel, notificationRequired };
    }

    async notifyDataProtectionAuthority(breach) {
        // Implementation would notify DPA
        this.emit('dpaNotified', breach);
    }

    async notifyAffectedIndividuals(breach) {
        // Implementation would notify individuals
        this.emit('individualsNotified', breach);
    }

    identifyPrivacyRisks(processing) {
        const risks = [];

        // Check for high-risk processing
        if (processing.largScale) {
            risks.push({
                type: 'large_scale',
                level: 'medium',
                description: 'Large scale processing of personal data'
            });
        }

        if (processing.sensitiveData) {
            risks.push({
                type: 'sensitive_data',
                level: 'high',
                description: 'Processing of sensitive personal data'
            });
        }

        if (processing.automated) {
            risks.push({
                type: 'automated_decision',
                level: 'medium',
                description: 'Automated decision making'
            });
        }

        return risks;
    }

    identifyRiskMeasures(risks) {
        const measures = [];

        for (const risk of risks) {
            if (risk.type === 'sensitive_data') {
                measures.push({
                    type: 'encryption',
                    description: 'End-to-end encryption of sensitive data'
                });
            }

            if (risk.type === 'large_scale') {
                measures.push({
                    type: 'minimization',
                    description: 'Data minimization techniques'
                });
            }
        }

        return measures;
    }

    calculateResidualRisk(risks, measures) {
        const maxRisk = risks.reduce((max, risk) => {
            const levels = { low: 1, medium: 2, high: 3 };
            return Math.max(max, levels[risk.level] || 0);
        }, 0);

        const mitigation = measures.length * 0.5;
        const residual = Math.max(1, maxRisk - mitigation);

        const levels = ['low', 'medium', 'high'];
        return levels[Math.min(2, Math.floor(residual) - 1)];
    }

    requiresConsent(operation) {
        const consentRequired = [
            'marketing',
            'profiling',
            'data_sharing',
            'cookies',
            'analytics'
        ];
        return consentRequired.includes(operation);
    }

    async checkConsent(dataSubjectId, purpose) {
        const consents = Array.from(this.consentRecords.values())
            .filter(c =>
                c.dataSubjectId === dataSubjectId &&
                c.status === 'active' &&
                c.purposes.includes(purpose)
            );

        return consents.length > 0;
    }

    checkLawfulBasis(operation, data) {
        // Check if operation has a lawful basis
        return data.lawfulBasis && this.config.lawfulBasis.includes(data.lawfulBasis);
    }

    checkDataMinimization(data) {
        // Check if only necessary data is being collected
        return true;
    }

    checkPurposeLimitation(operation, data) {
        // Check if processing aligns with stated purpose
        return true;
    }

    checkRetentionPeriod(data) {
        // Check if data is within retention period
        return true;
    }

    checkCrossBorderTransfer(location) {
        return this.config.approvedCountries.includes(location);
    }

    containsPersonalData(data) {
        const personalFields = [
            ...this.personalDataCategories.BASIC,
            ...this.personalDataCategories.SENSITIVE,
            ...this.personalDataCategories.FINANCIAL
        ];

        return personalFields.some(field => data[field] !== undefined);
    }

    getProcessingPurposes(dataSubjectId) {
        // Get all processing purposes for a data subject
        return ['service_provision', 'legal_compliance'];
    }

    getRetentionInformation(dataSubjectId) {
        // Get retention information
        return {
            period: this.config.dataRetentionPeriod,
            basis: 'legal_requirement'
        };
    }

    getDataRecipients(dataSubjectId) {
        // Get list of data recipients
        return ['processors', 'third_parties'];
    }

    getDataSource(dataSubjectId) {
        // Get data source information
        return 'directly_provided';
    }

    async logComplianceEvent(event) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...event
        };

        const logFile = path.join(
            this.config.auditLogPath,
            `gdpr-${new Date().toISOString().split('T')[0]}.log`
        );

        await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    }

    async loadExistingRecords() {
        // Load existing compliance records from storage
    }

    setupComplianceChecks() {
        // Set up periodic compliance validation
        setInterval(() => {
            this.performComplianceAudit();
        }, 24 * 60 * 60 * 1000); // Daily
    }

    setupBreachMonitoring() {
        // Set up breach detection and monitoring
    }

    async performComplianceAudit() {
        // Perform comprehensive compliance audit
        this.emit('auditPerformed');
    }

    getSafeConfig() {
        return {
            enabled: this.config.enabled,
            strictMode: this.config.strictMode,
            consentRequired: this.config.consentRequired,
            dataMinimization: this.config.dataMinimization,
            rightToErasure: this.config.rightToErasure,
            dataPortability: this.config.dataPortability
        };
    }

    /**
     * Get compliance status
     * @returns {Promise<object>} Compliance status
     */
    async getStatus() {
        return {
            compliant: this.statistics.violations === 0,
            statistics: this.statistics,
            activeConsents: this.statistics.activeConsents,
            pendingRequests: {
                access: Array.from(this.accessRequests.values())
                    .filter(r => r.status === 'pending').length,
                erasure: Array.from(this.erasureRequests.values())
                    .filter(r => r.status === 'pending').length,
                portability: Array.from(this.portabilityRequests.values())
                    .filter(r => r.status === 'pending').length
            },
            recentBreaches: this.breaches.slice(-5)
        };
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        // Save state and cleanup
        this.emit('shutdown');
    }
}

module.exports = GDPRCompliance;
