/**
 * @fileoverview LinkedIn OAuth Strategy
 */

const OAuthBaseStrategy = require('./oauth-strategy');

class LinkedInAuthStrategy extends OAuthBaseStrategy {
    constructor(options = {}) {
        super({
            provider: 'linkedin',
            ...options
        });
    }
    
    getStrategy() {
        // LinkedIn strategy would be implemented here
        return null;
    }
}

module.exports = LinkedInAuthStrategy;
