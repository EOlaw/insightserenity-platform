/**
 * @fileoverview Google OAuth Strategy
 */

const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const OAuthBaseStrategy = require('./oauth-strategy');
const config = require('../../../config');

class GoogleAuthStrategy extends OAuthBaseStrategy {
    constructor(options = {}) {
        super({
            provider: 'google',
            ...config.auth.oauth.google,
            ...options
        });
        
        this.strategy = new GoogleStrategy(
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

module.exports = GoogleAuthStrategy;
