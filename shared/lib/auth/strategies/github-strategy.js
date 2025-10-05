/**
 * @fileoverview GitHub OAuth Strategy
 */

const { Strategy: GitHubStrategy } = require('passport-github2');
const OAuthBaseStrategy = require('./oauth-strategy');
const config = require('../../../config');

class GitHubAuthStrategy extends OAuthBaseStrategy {
    constructor(options = {}) {
        super({
            provider: 'github',
            ...config.auth.oauth.github,
            ...options
        });
        
        this.strategy = new GitHubStrategy(
            {
                clientID: this.clientID,
                clientSecret: this.clientSecret,
                callbackURL: this.callbackURL,
                scope: this.scope
            },
            this.handleCallback.bind(this)
        );
    }
    
    getStrategy() {
        return this.strategy;
    }
}

module.exports = GitHubAuthStrategy;
