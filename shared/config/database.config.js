module.exports = {
    // MongoDB configuration for multi-tenant architecture
    mongodb: {
        // Separate URIs for each database
        admin: {
            uri: process.env.DATABASE_ADMIN_URI || process.env.MONGODB_URI,
            name: 'insightserenity_admin',
            options: {
                // useNewUrlParser: true,
                // useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 2,
                maxIdleTimeMS: process.env.NODE_ENV === 'production' ? 120000 : 30000
            }
        },
        customer: {
            uri: process.env.DATABASE_CUSTOMER_URI || process.env.MONGODB_URI,
            name: 'insightserenity_customer',
            options: {
                // useNewUrlParser: true,
                // useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 2,
                maxIdleTimeMS: process.env.NODE_ENV === 'production' ? 120000 : 30000
            }
        },
        shared: {
            uri: process.env.DATABASE_SHARED_URI || process.env.MONGODB_URI,
            name: 'insightserenity_shared',
            options: {
                // useNewUrlParser: true,
                // useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 2,
                maxIdleTimeMS: process.env.NODE_ENV === 'production' ? 120000 : 30000
            }
        },
        // Common configuration
        poolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
        authSource: process.env.DB_AUTH_SOURCE || 'admin'
    },

    // Redis configuration for caching and rate limiting
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        ttl: 300,
        // Additional Redis options
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        reconnectOnError: (err) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                return true;
            }
            return false;
        }
    }
};
