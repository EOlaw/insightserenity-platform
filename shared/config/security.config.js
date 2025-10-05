module.exports = {
    cors: {
        enabled: true,
        origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
    },
    helmet: {
        enabled: true,
        contentSecurityPolicy: false
    },
    encryption: {
        algorithm: 'aes-256-gcm',
        key: process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this'
    }
};
