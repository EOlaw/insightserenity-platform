/**
 * @fileoverview Local Authentication Strategy
 */

const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcryptjs');

class LocalAuthStrategy {
    constructor(getUserByEmail) {
        this.getUserByEmail = getUserByEmail;
        
        this.strategy = new LocalStrategy(
            {
                usernameField: 'email',
                passwordField: 'password',
                passReqToCallback: true
            },
            this.verify.bind(this)
        );
    }
    
    async verify(req, email, password, done) {
        try {
            const user = await this.getUserByEmail(email, req.body.tenantId);
            
            if (!user) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            
            const isValid = await bcrypt.compare(password, user.password);
            
            if (!isValid) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
    
    getStrategy() {
        return this.strategy;
    }
}

module.exports = LocalAuthStrategy;
