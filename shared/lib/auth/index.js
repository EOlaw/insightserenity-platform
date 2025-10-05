/**
 * @fileoverview Authentication Module Exports
 * @module shared/lib/auth
 */

// Export strategies
const strategies = {
    JWTStrategy: require('./strategies/jwt-strategy'),
    LocalStrategy: require('./strategies/local-strategy'),
    OAuthStrategy: require('./strategies/oauth-strategy'),
    GoogleStrategy: require('./strategies/google-strategy'),
    GitHubStrategy: require('./strategies/github-strategy'),
    LinkedInStrategy: require('./strategies/linkedin-strategy'),
    PasskeyStrategy: require('./strategies/passkey-strategy'),
    OrganizationStrategy: require('./strategies/organization-strategy')
};

// Export services
const services = {
    TokenService: require('./services/token-service'),
    AuthService: require('./services/auth-service'),
    SessionService: require('./services/session-service'),
    PasswordService: require('./services/password-service'),
    TwoFactorService: require('./services/two-factor-service'),
    BlacklistService: require('./services/blacklist-service')
};

// Export middleware
const middleware = {
    authenticate: require('./middleware/authenticate'),
    authorize: require('./middleware/authorize'),
    rateLimit: require('./middleware/rate-limit'),
    sessionValidation: require('./middleware/session-validation'),
    permissionCheck: require('./middleware/permission-check')
};

/**
 * Configure Passport strategies
 * @param {Object} passport - Passport instance
 * @param {Object} config - Configuration options
 * @param {string} config.jwtSecret - JWT secret key
 * @param {Object} config.jwtOptions - JWT options
 * @param {Object} config.oauth - OAuth configuration
 * @param {Object} config.callbacks - Strategy callbacks
 */
function configureStrategies(passport, config = {}) {
    const {
        jwtSecret = process.env.JWT_SECRET,
        jwtOptions = { expiresIn: '24h' },
        oauth = {},
        callbacks = {}
    } = config;

    // Configure JWT Strategy
    if (jwtSecret) {
        const JWTStrategy = require('passport-jwt').Strategy;
        const ExtractJWT = require('passport-jwt').ExtractJwt;

        passport.use('jwt', new JWTStrategy({
            jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret,
            passReqToCallback: true
        }, callbacks.jwt || ((req, payload, done) => {
            try {
                // Default JWT verification
                if (payload.id) {
                    return done(null, { id: payload.id, ...payload });
                }
                return done(null, false);
            } catch (error) {
                return done(error, false);
            }
        })));
    }

    // Configure Local Strategy
    const LocalStrategy = require('passport-local').Strategy;

    passport.use('local', new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true
    }, callbacks.local || ((req, email, password, done) => {
        try {
            // Default local authentication
            // This should be overridden with actual user authentication logic
            return done(null, false, { message: 'Local strategy not implemented' });
        } catch (error) {
            return done(error, false);
        }
    })));

    // Configure Google OAuth Strategy
    if (oauth.google && oauth.google.clientID) {
        const GoogleStrategy = require('passport-google-oauth20').Strategy;

        passport.use('google', new GoogleStrategy({
            clientID: oauth.google.clientID,
            clientSecret: oauth.google.clientSecret,
            callbackURL: oauth.google.callbackURL || '/auth/google/callback',
            passReqToCallback: true
        }, callbacks.google || ((req, accessToken, refreshToken, profile, done) => {
            try {
                // Default Google OAuth handling
                return done(null, profile);
            } catch (error) {
                return done(error, false);
            }
        })));
    }

    // Configure GitHub OAuth Strategy
    if (oauth.github && oauth.github.clientID) {
        const GitHubStrategy = require('passport-github2').Strategy;

        passport.use('github', new GitHubStrategy({
            clientID: oauth.github.clientID,
            clientSecret: oauth.github.clientSecret,
            callbackURL: oauth.github.callbackURL || '/auth/github/callback',
            passReqToCallback: true
        }, callbacks.github || ((req, accessToken, refreshToken, profile, done) => {
            try {
                // Default GitHub OAuth handling
                return done(null, profile);
            } catch (error) {
                return done(error, false);
            }
        })));
    }

    // Configure LinkedIn OAuth Strategy
    if (oauth.linkedin && oauth.linkedin.clientID) {
        const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;

        passport.use('linkedin', new LinkedInStrategy({
            clientID: oauth.linkedin.clientID,
            clientSecret: oauth.linkedin.clientSecret,
            callbackURL: oauth.linkedin.callbackURL || '/auth/linkedin/callback',
            scope: ['r_emailaddress', 'r_liteprofile'],
            passReqToCallback: true
        }, callbacks.linkedin || ((req, accessToken, refreshToken, profile, done) => {
            try {
                // Default LinkedIn OAuth handling
                return done(null, profile);
            } catch (error) {
                return done(error, false);
            }
        })));
    }

    // Passport serialization
    passport.serializeUser((user, done) => {
        done(null, user.id || user);
    });

    passport.deserializeUser((id, done) => {
        // This should be overridden with actual user deserialization logic
        done(null, { id });
    });

    return passport;
}

/**
 * Initialize authentication for Express app
 * @param {Object} app - Express application
 * @param {Object} options - Authentication options
 */
function initializeAuth(app, options = {}) {
    const passport = require('passport');

    // Initialize passport
    app.use(passport.initialize());

    if (options.session !== false) {
        app.use(passport.session());
    }

    // Configure strategies
    configureStrategies(passport, options);

    return passport;
}

module.exports = {
    strategies,
    services,
    middleware,

    // Main configuration functions
    configureStrategies,
    initializeAuth,

    // Convenience exports
    ...strategies,
    ...services,
    ...middleware
};
