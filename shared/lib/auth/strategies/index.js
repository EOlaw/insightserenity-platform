/**
 * @fileoverview Authentication Strategies Index
 * @module shared/lib/auth/strategies
 * @description Exports all authentication strategies for Passport.js
 */

const JWTAuthStrategy = require('./jwt-strategy');
const GitHubAuthStrategy = require('./github-strategy');
const LinkedInAuthStrategy = require('./linkedin-strategy');
const PasskeyAuthStrategy = require('./passkey-strategy');

/**
 * Configures all authentication strategies for Passport
 * @param {Object} passport - Passport instance
 * @param {Object} options - Configuration options
 * @param {Object} options.jwt - JWT strategy options
 * @param {Object} options.github - GitHub strategy options
 * @param {Object} options.linkedin - LinkedIn strategy options
 * @param {Object} options.passkey - Passkey strategy options
 * @param {Function} options.getUserById - Function to get user by ID
 * @param {Function} options.getUserByEmail - Function to get user by email
 * @param {Function} options.findOrCreateUser - Function to find or create user
 * @param {winston.Logger} options.logger - Logger instance
 */
function configureStrategies(passport, options = {}) {
    const strategies = {};

    // Configure JWT Strategy
    // FIXED: This now properly instantiates and registers the JWT strategy
    if (options.jwt !== false) {
        // Create JWT strategy instance with proper options
        const jwtStrategyOptions = {
            secret: options.jwt?.secret || options.jwt?.secretOrKey,
            issuer: options.jwt?.issuer,
            audience: options.jwt?.audience
        };

        const jwtStrategy = new JWTAuthStrategy(jwtStrategyOptions);

        // CRITICAL FIX: Use getStrategy() not createStrategy()
        // The JWTAuthStrategy class defines getStrategy(), not createStrategy()
        passport.use('jwt', jwtStrategy.getStrategy());
        strategies.jwt = jwtStrategy;
    }

    // Configure GitHub Strategy
    if (options.github && options.github.clientID) {
        const githubStrategy = new GitHubAuthStrategy({
            clientID: options.github.clientID,
            clientSecret: options.github.clientSecret,
            callbackURL: options.github.callbackURL,
            scope: options.github.scope,
            findOrCreateUser: options.findOrCreateUser,
            logger: options.logger
        });

        // Check if GitHubAuthStrategy uses createStrategy or getStrategy
        const githubStrategyInstance = githubStrategy.createStrategy 
            ? githubStrategy.createStrategy() 
            : githubStrategy.getStrategy();
        
        passport.use('github', githubStrategyInstance);
        strategies.github = githubStrategy;
    }

    // Configure LinkedIn Strategy
    if (options.linkedin && options.linkedin.clientID) {
        const linkedinStrategy = new LinkedInAuthStrategy({
            clientID: options.linkedin.clientID,
            clientSecret: options.linkedin.clientSecret,
            callbackURL: options.linkedin.callbackURL,
            scope: options.linkedin.scope,
            findOrCreateUser: options.findOrCreateUser,
            logger: options.logger
        });

        // Check if LinkedInAuthStrategy uses createStrategy or getStrategy
        const linkedinStrategyInstance = linkedinStrategy.createStrategy 
            ? linkedinStrategy.createStrategy() 
            : linkedinStrategy.getStrategy();
        
        passport.use('linkedin', linkedinStrategyInstance);
        strategies.linkedin = linkedinStrategy;
    }

    // Configure Passkey Strategy
    if (options.passkey !== false) {
        const passkeyStrategy = new PasskeyAuthStrategy({
            rpName: options.passkey?.rpName,
            rpID: options.passkey?.rpID,
            origin: options.passkey?.origin,
            getUserById: options.getUserById,
            getUserByEmail: options.getUserByEmail,
            saveCredential: options.passkey?.saveCredential,
            getCredential: options.passkey?.getCredential,
            getUserCredentials: options.passkey?.getUserCredentials,
            logger: options.logger
        });

        // Check if PasskeyAuthStrategy uses createStrategy or getStrategy
        const passkeyStrategyInstance = passkeyStrategy.createStrategy 
            ? passkeyStrategy.createStrategy() 
            : passkeyStrategy.getStrategy();
        
        passport.use('passkey', passkeyStrategyInstance);
        strategies.passkey = passkeyStrategy;
    }

    return strategies;
}

/**
 * Creates individual strategy instances
 */
const createStrategies = {
    /**
     * Creates JWT strategy
     * @param {Object} options - Strategy options
     * @returns {JWTAuthStrategy} JWT strategy instance
     */
    jwt: (options = {}) => {
        return new JWTAuthStrategy(options);
    },

    /**
     * Creates GitHub strategy
     * @param {Object} options - Strategy options
     * @returns {GitHubAuthStrategy} GitHub strategy instance
     */
    github: (options = {}) => {
        return new GitHubAuthStrategy(options);
    },

    /**
     * Creates LinkedIn strategy
     * @param {Object} options - Strategy options
     * @returns {LinkedInAuthStrategy} LinkedIn strategy instance
     */
    linkedin: (options = {}) => {
        return new LinkedInAuthStrategy(options);
    },

    /**
     * Creates Passkey strategy
     * @param {Object} options - Strategy options
     * @returns {PasskeyAuthStrategy} Passkey strategy instance
     */
    passkey: (options = {}) => {
        return new PasskeyAuthStrategy(options);
    }
};

module.exports = {
    // Strategy classes
    JWTAuthStrategy,
    GitHubAuthStrategy,
    LinkedInAuthStrategy,
    PasskeyAuthStrategy,

    // Configuration function
    configureStrategies,

    // Factory functions
    createStrategies
};