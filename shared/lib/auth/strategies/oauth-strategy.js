/**
 * @fileoverview OAuth Base Strategy
 */

class OAuthBaseStrategy {
    constructor(options = {}) {
        this.provider = options.provider;
        this.clientID = options.clientID;
        this.clientSecret = options.clientSecret;
        this.callbackURL = options.callbackURL;
        this.scope = options.scope || [];
    }
    
    async handleCallback(accessToken, refreshToken, profile, done) {
        try {
            const user = {
                provider: this.provider,
                providerId: profile.id,
                email: profile.emails?.[0]?.value,
                firstName: profile.name?.givenName,
                lastName: profile.name?.familyName,
                avatar: profile.photos?.[0]?.value,
                profile: profile._json
            };
            
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
}

module.exports = OAuthBaseStrategy;
