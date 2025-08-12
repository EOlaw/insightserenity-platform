// scripts/start-services.js   --- remove this file it's not needed anymore
const { spawn } = require('child_process');
const path = require('path');

class ServiceOrchestrator {
    constructor() {
        this.services = [];
        this.isShuttingDown = false;
    }

    async start() {
        console.log('Starting InsightSerenity Platform Services...\n');

        // Start Admin Server
        const adminServer = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '../servers/admin-server'),
            env: { 
                ...process.env, 
                PORT: '4001',
                NODE_ENV: process.env.NODE_ENV || 'development'
            },
            stdio: 'inherit'
        });

        this.services.push({ name: 'Admin Server', process: adminServer, port: 4001 });

        // Start Customer Services (if you have it)
        const customerServices = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '../servers/customer-services'),
            env: { 
                ...process.env, 
                PORT: '4002',
                NODE_ENV: process.env.NODE_ENV || 'development'
            },
            stdio: 'inherit'
        });

        this.services.push({ name: 'Customer Services', process: customerServices, port: 4002 });

        // Wait for backend services to be ready
        await this.waitForServices();

        // Start API Gateway
        const gateway = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '../servers/gateway'),
            env: { 
                ...process.env, 
                GATEWAY_PORT: '3000',
                ADMIN_SERVER_URL: 'http://localhost:4001',
                CUSTOMER_SERVICES_URL: 'http://localhost:4002',
                NODE_ENV: process.env.NODE_ENV || 'development'
            },
            stdio: 'inherit'
        });

        this.services.push({ name: 'API Gateway', process: gateway, port: 3000 });

        // Handle graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());

        console.log('\n✅ All services started successfully!');
        console.log('\nService URLs:');
        console.log('  API Gateway: http://localhost:3000');
        console.log('  Admin Server (Direct): http://localhost:4001');
        console.log('  Customer Services (Direct): http://localhost:4002');
        console.log('\nAccess all services through the gateway at http://localhost:3000');
    }

    async waitForServices() {
        console.log('Waiting for backend services to be ready...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        console.log('\nShutting down services...');
        
        for (const service of this.services) {
            console.log(`Stopping ${service.name}...`);
            service.process.kill('SIGTERM');
        }

        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
}

const orchestrator = new ServiceOrchestrator();
orchestrator.start().catch(console.error);