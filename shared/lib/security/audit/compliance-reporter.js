const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * ComplianceReporter - Generates compliance reports for various standards
 */
class ComplianceReporter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            standards: config.standards || ['SOC2', 'ISO27001', 'GDPR'],
            reportPath: config.reportPath || './reports/compliance',
            reportFormat: config.reportFormat || 'json',
            autoGenerate: config.autoGenerate || false,
            generateInterval: config.generateInterval || 24 * 60 * 60 * 1000
        };

        this.complianceRules = new Map();
        this.violations = [];
        this.assessments = new Map();

        this.initializeComplianceRules();
    }

    async initialize() {
        await fs.mkdir(this.config.reportPath, { recursive: true });

        if (this.config.autoGenerate) {
            this.startAutoGeneration();
        }

        this.emit('initialized');
    }

    initializeComplianceRules() {
        // SOC2 Rules
        this.complianceRules.set('SOC2', {
            'access-control': {
                description: 'Logical and physical access controls',
                check: (event) => this.checkAccessControl(event)
            },
            'change-management': {
                description: 'System change management controls',
                check: (event) => this.checkChangeManagement(event)
            },
            'data-encryption': {
                description: 'Data encryption in transit and at rest',
                check: (event) => this.checkDataEncryption(event)
            },
            'incident-response': {
                description: 'Security incident detection and response',
                check: (event) => this.checkIncidentResponse(event)
            }
        });

        // GDPR Rules
        this.complianceRules.set('GDPR', {
            'consent-management': {
                description: 'User consent for data processing',
                check: (event) => this.checkConsent(event)
            },
            'data-minimization': {
                description: 'Collect only necessary data',
                check: (event) => this.checkDataMinimization(event)
            },
            'right-to-erasure': {
                description: 'Support for data deletion requests',
                check: (event) => this.checkRightToErasure(event)
            },
            'data-portability': {
                description: 'Data export capabilities',
                check: (event) => this.checkDataPortability(event)
            }
        });

        // ISO27001 Rules
        this.complianceRules.set('ISO27001', {
            'risk-assessment': {
                description: 'Information security risk assessment',
                check: (event) => this.checkRiskAssessment(event)
            },
            'asset-management': {
                description: 'Information asset management',
                check: (event) => this.checkAssetManagement(event)
            },
            'supplier-relationships': {
                description: 'Supplier relationship security',
                check: (event) => this.checkSupplierSecurity(event)
            },
            'business-continuity': {
                description: 'Business continuity planning',
                check: (event) => this.checkBusinessContinuity(event)
            }
        });
    }

    async checkCompliance(event) {
        const results = {
            compliant: true,
            violations: [],
            warnings: []
        };

        for (const standard of this.config.standards) {
            const rules = this.complianceRules.get(standard);
            if (!rules) continue;

            for (const [ruleId, rule] of Object.entries(rules)) {
                try {
                    const checkResult = await rule.check(event);

                    if (!checkResult.compliant) {
                        results.compliant = false;
                        results.violations.push({
                            standard,
                            ruleId,
                            description: rule.description,
                            event: event.id,
                            details: checkResult.details
                        });
                    }

                    if (checkResult.warning) {
                        results.warnings.push({
                            standard,
                            ruleId,
                            description: rule.description,
                            event: event.id,
                            details: checkResult.details
                        });
                    }
                } catch (error) {
                    // Rule check failed
                    results.warnings.push({
                        standard,
                        ruleId,
                        error: error.message
                    });
                }
            }
        }

        if (results.violations.length > 0) {
            this.violations.push(...results.violations);
            this.emit('violation', results);
        }

        return results;
    }

    async generateReport(options = {}) {
        const report = {
            generated: new Date().toISOString(),
            period: {
                start: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                end: options.endDate || new Date()
            },
            standards: this.config.standards,
            summary: {
                totalEvents: options.events?.length || 0,
                violations: this.violations.length,
                complianceScore: this.calculateComplianceScore()
            },
            details: {}
        };

        for (const standard of this.config.standards) {
            report.details[standard] = await this.generateStandardReport(standard, options);
        }

        // Save report
        const fileName = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
        const filePath = path.join(this.config.reportPath, fileName);
        await fs.writeFile(filePath, JSON.stringify(report, null, 2));

        this.emit('reportGenerated', { filePath, report });

        return report;
    }

    async generateStandardReport(standard, options) {
        const rules = this.complianceRules.get(standard);
        const standardViolations = this.violations.filter(v => v.standard === standard);

        return {
            standard,
            compliant: standardViolations.length === 0,
            score: this.calculateStandardScore(standard),
            violations: standardViolations,
            rules: Object.keys(rules || {}),
            recommendations: this.getRecommendations(standard, standardViolations)
        };
    }

    calculateComplianceScore() {
        const totalRules = Array.from(this.complianceRules.values())
            .reduce((sum, rules) => sum + Object.keys(rules).length, 0);

        const violatedRules = new Set(this.violations.map(v => `${v.standard}-${v.ruleId}`)).size;

        return totalRules > 0 ? ((totalRules - violatedRules) / totalRules) * 100 : 100;
    }

    calculateStandardScore(standard) {
        const rules = this.complianceRules.get(standard);
        if (!rules) return 100;

        const totalRules = Object.keys(rules).length;
        const violations = this.violations.filter(v => v.standard === standard);
        const violatedRules = new Set(violations.map(v => v.ruleId)).size;

        return totalRules > 0 ? ((totalRules - violatedRules) / totalRules) * 100 : 100;
    }

    getRecommendations(standard, violations) {
        const recommendations = [];

        if (violations.length > 0) {
            recommendations.push({
                priority: 'high',
                action: 'Address compliance violations immediately',
                violations: violations.map(v => v.ruleId)
            });
        }

        // Standard-specific recommendations
        if (standard === 'GDPR' && violations.some(v => v.ruleId === 'consent-management')) {
            recommendations.push({
                priority: 'critical',
                action: 'Implement proper consent management system',
                details: 'Ensure explicit user consent for all data processing activities'
            });
        }

        if (standard === 'SOC2' && violations.some(v => v.ruleId === 'access-control')) {
            recommendations.push({
                priority: 'high',
                action: 'Strengthen access control mechanisms',
                details: 'Implement multi-factor authentication and role-based access control'
            });
        }

        return recommendations;
    }

    // Compliance check methods
    checkAccessControl(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'authentication' && event.outcome === 'failure') {
            const failureCount = this.getRecentFailures(event.userId);
            if (failureCount > 5) {
                result.compliant = false;
                result.details.reason = 'Excessive authentication failures';
            }
        }

        return result;
    }

    checkChangeManagement(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'configuration_change' && !event.approvedBy) {
            result.compliant = false;
            result.details.reason = 'Configuration change without approval';
        }

        return result;
    }

    checkDataEncryption(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'data_access' && !event.encrypted) {
            result.warning = true;
            result.details.reason = 'Data accessed without encryption';
        }

        return result;
    }

    checkIncidentResponse(event) {
        const result = { compliant: true, details: {} };

        if (event.severity === 'critical' && !event.incidentId) {
            result.compliant = false;
            result.details.reason = 'Critical event without incident tracking';
        }

        return result;
    }

    checkConsent(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'data_access' && event.personalData && !event.consentId) {
            result.compliant = false;
            result.details.reason = 'Personal data accessed without consent record';
        }

        return result;
    }

    checkDataMinimization(event) {
        const result = { compliant: true, details: {} };

        if (event.dataSize && event.dataSize > 1024 * 1024) { // 1MB
            result.warning = true;
            result.details.reason = 'Large data operation - verify necessity';
        }

        return result;
    }

    checkRightToErasure(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'data_deletion' && event.userRequest && !event.completed) {
            result.compliant = false;
            result.details.reason = 'User deletion request not completed';
        }

        return result;
    }

    checkDataPortability(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'data_export' && event.format !== 'machine-readable') {
            result.warning = true;
            result.details.reason = 'Data export not in machine-readable format';
        }

        return result;
    }

    checkRiskAssessment(event) {
        const result = { compliant: true, details: {} };

        if (event.riskLevel === 'high' && !event.riskAssessmentId) {
            result.compliant = false;
            result.details.reason = 'High risk operation without risk assessment';
        }

        return result;
    }

    checkAssetManagement(event) {
        const result = { compliant: true, details: {} };

        if (event.resourceType === 'asset' && !event.assetId) {
            result.warning = true;
            result.details.reason = 'Asset operation without asset identifier';
        }

        return result;
    }

    checkSupplierSecurity(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'external_integration' && !event.securityAssessment) {
            result.compliant = false;
            result.details.reason = 'External integration without security assessment';
        }

        return result;
    }

    checkBusinessContinuity(event) {
        const result = { compliant: true, details: {} };

        if (event.type === 'system_failure' && !event.continuityPlan) {
            result.compliant = false;
            result.details.reason = 'System failure without continuity plan';
        }

        return result;
    }

    getRecentFailures(userId) {
        // Implementation would check recent failure count
        return 0;
    }

    startAutoGeneration() {
        setInterval(async () => {
            try {
                await this.generateReport();
            } catch (error) {
                this.emit('error', error);
            }
        }, this.config.generateInterval);
    }

    async shutdown() {
        this.emit('shutdown');
    }
}

module.exports = ComplianceReporter;
