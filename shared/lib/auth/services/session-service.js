/**
 * @fileoverview Session Management Service
 */

const crypto = require('crypto');

class SessionService {
    constructor() {
        this.sessions = new Map(); // In production, use Redis
    }
    
    async createSession(data) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        
        const session = {
            id: sessionId,
            userId: data.userId,
            tenantId: data.tenantId,
            ip: data.ip,
            userAgent: data.userAgent,
            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        };
        
        this.sessions.set(sessionId, session);
        
        return session;
    }
    
    async getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            return null;
        }
        
        if (new Date() > session.expiresAt) {
            this.sessions.delete(sessionId);
            return null;
        }
        
        // Update last activity
        session.lastActivity = new Date();
        
        return session;
    }
    
    async terminateSession(sessionId) {
        return this.sessions.delete(sessionId);
    }
    
    async terminateUserSessions(userId) {
        for (const [id, session] of this.sessions) {
            if (session.userId === userId) {
                this.sessions.delete(id);
            }
        }
    }
    
    async extendSession(sessionId, duration = 3600000) {
        const session = this.sessions.get(sessionId);
        
        if (session) {
            session.expiresAt = new Date(Date.now() + duration);
            return true;
        }
        
        return false;
    }
}

module.exports = new SessionService();
