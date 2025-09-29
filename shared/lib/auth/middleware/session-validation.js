/**
 * @fileoverview Session Validation Middleware
 */

const SessionService = require('../services/session-service');

const validateSession = async (req, res, next) => {
    try {
        const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
        
        if (!sessionId) {
            return res.status(401).json({
                success: false,
                error: 'No session found'
            });
        }
        
        const session = await SessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
        }
        
        // Validate session belongs to user
        if (req.user && session.userId !== req.user.id) {
            return res.status(401).json({
                success: false,
                error: 'Session mismatch'
            });
        }
        
        req.session = session;
        next();
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Session validation failed'
        });
    }
};

module.exports = validateSession;
