module.exports = {
    admin: {
        url: process.env.ADMIN_SERVICE_URL || 'http://localhost:3000',
        timeout: 30000
    },
    customer: {
        url: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
        timeout: 30000
    },
    gateway: {
        url: process.env.GATEWAY_URL || 'http://localhost:3002',
        timeout: 30000
    }
};
