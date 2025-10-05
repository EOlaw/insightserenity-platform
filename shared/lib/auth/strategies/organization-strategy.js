/**
 * @fileoverview Organization-based Authentication Strategy
 */

class OrganizationStrategy {
    constructor(options = {}) {
        this.getOrganization = options.getOrganization;
        this.validateOrgAccess = options.validateOrgAccess;
    }
    
    async authenticate(req, email, password) {
        const domain = email.split('@')[1];
        
        // Get organization by domain
        const org = await this.getOrganization(domain);
        
        if (!org) {
            throw new Error('Organization not found');
        }
        
        // Check if SSO is enabled
        if (org.ssoEnabled) {
            return {
                method: 'sso',
                ssoProvider: org.ssoProvider,
                ssoUrl: org.ssoUrl
            };
        }
        
        // Standard authentication
        return {
            method: 'standard',
            organizationId: org._id,
            tenantId: org.tenantId
        };
    }
    
    async validateAccess(user, organizationId) {
        if (this.validateOrgAccess) {
            return await this.validateOrgAccess(user, organizationId);
        }
        
        return user.organizationId === organizationId;
    }
}

module.exports = OrganizationStrategy;
