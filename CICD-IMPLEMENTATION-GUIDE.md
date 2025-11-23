# InsightSerenity CI/CD Pipeline Implementation Guide

## Table of Contents

1. [Prerequisites and Requirements](#prerequisites-and-requirements)
2. [Pre-Implementation Checklist](#pre-implementation-checklist)
3. [Complete Directory Structure](#complete-directory-structure)
4. [Implementation Steps](#implementation-steps)
5. [GitHub Workflows Configuration](#github-workflows-configuration)
6. [Deployment Scripts](#deployment-scripts)
7. [EC2 Server Setup](#ec2-server-setup)
8. [GitHub Secrets Configuration](#github-secrets-configuration)
9. [Testing the Pipeline](#testing-the-pipeline)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## Prerequisites and Requirements

### Before You Begin

You must have the following items ready before starting the CI/CD pipeline implementation:

#### AWS Infrastructure
- Active AWS account with appropriate permissions
- EC2 instances provisioned for your services (minimum four instances: customer frontend, customer backend, admin frontend, admin backend)
- Elastic IP addresses assigned to each EC2 instance
- Security groups configured to allow SSH (port 22) from GitHub Actions IP ranges
- Security groups configured to allow HTTP (port 80) and HTTPS (port 443) traffic
- SSH key pair created and private key downloaded
- S3 bucket already configured for document storage
- MongoDB Atlas cluster operational with connection string available

#### Domain and SSL
- Domain names configured and pointing to your EC2 instances
- SSL certificates obtained (recommend using Let's Encrypt certbot)
- DNS records properly configured for all services

#### Development Environment
- Git repository hosted on GitHub
- Local development environment with Node.js 24.9.0 installed
- Access to create GitHub Actions workflows and secrets
- Postman or similar tool for API testing

#### Required Access and Credentials
- AWS Access Key ID and Secret Access Key with EC2 and S3 permissions
- MongoDB Atlas connection strings for customer, admin, and shared databases
- JWT secret key generated (use a strong random string)
- SSH private key for EC2 access
- Slack webhook URL for notifications (optional but recommended)
- Snyk account for security scanning (optional but recommended)

#### Package Dependencies

You will need to install the following npm packages in your project root:

```bash
npm install --save-dev ssh2 jest @types/jest eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

---

## Pre-Implementation Checklist

Complete this checklist before proceeding with implementation:

### AWS Setup
- [ ] EC2 instances created and running
- [ ] Elastic IPs assigned to all instances
- [ ] Security groups configured for SSH and web traffic
- [ ] SSH key pair generated and private key secured
- [ ] S3 bucket created and accessible
- [ ] IAM user created with programmatic access for deployments

### GitHub Setup
- [ ] Repository created and code pushed
- [ ] Branch protection rules configured for main branch
- [ ] GitHub Actions enabled in repository settings
- [ ] Access to repository settings for adding secrets

### Application Setup
- [ ] All services have package.json with required scripts (build, test, lint)
- [ ] Environment variable templates documented
- [ ] Database migration scripts prepared
- [ ] Health check endpoints implemented in all backend services

### Documentation
- [ ] Current architecture documented
- [ ] Deployment process documented
- [ ] Rollback procedures documented
- [ ] Emergency contacts list maintained

---

## Complete Directory Structure

Your InsightSerenity repository should follow this exact structure. Create any missing directories and files according to this layout:

```
insightserenity/
│
├── .github/
│   └── workflows/
│       ├── customer-frontend.yml
│       ├── customer-backend.yml
│       ├── admin-frontend.yml
│       ├── admin-backend.yml
│       └── shared-services.yml
│
├── customer/
│   ├── frontend/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   └── .eslintrc.js
│   │
│   └── backend/
│       ├── src/
│       ├── tests/
│       ├── migrations/
│       ├── package.json
│       ├── server.js
│       └── .eslintrc.js
│
├── admin/
│   ├── frontend/
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tsconfig.json
│   │   └── .eslintrc.js
│   │
│   └── backend/
│       ├── src/
│       ├── tests/
│       ├── migrations/
│       ├── package.json
│       ├── server.js
│       └── .eslintrc.js
│
├── shared/
│   ├── utils/
│   ├── types/
│   └── config/
│
├── scripts/
│   ├── deploy.js
│   ├── health-check.js
│   ├── rollback.js
│   ├── run-migrations.js
│   └── package.json
│
├── tests/
│   ├── integration/
│   └── e2e/
│
├── .gitignore
├── package.json
├── README.md
└── CICD-IMPLEMENTATION-GUIDE.md (this file)
```

---

## Implementation Steps

Follow these steps in order to implement your CI/CD pipeline successfully.

### Step 1: Prepare Your Local Repository

First, ensure your local repository structure matches the directory layout specified above. Create any missing directories:

```bash
mkdir -p .github/workflows
mkdir -p scripts
mkdir -p customer/frontend customer/backend
mkdir -p admin/frontend admin/backend
mkdir -p tests/integration tests/e2e
```

### Step 2: Install Required Dependencies

Navigate to your scripts directory and initialize it as a Node.js package:

```bash
cd scripts
npm init -y
npm install ssh2
cd ..
```

### Step 3: Create GitHub Workflow Files

Create each workflow file in the `.github/workflows/` directory with the exact content provided in the sections below.

### Step 4: Create Deployment Scripts

Create all deployment scripts in the `scripts/` directory with the exact content provided in the deployment scripts section.

### Step 5: Configure EC2 Servers

Follow the EC2 server setup instructions to prepare your deployment targets.

### Step 6: Add GitHub Secrets

Configure all required secrets in your GitHub repository settings.

### Step 7: Test the Pipeline

Follow the testing procedures to validate your pipeline before production use.

---

## GitHub Workflows Configuration

### File: `.github/workflows/customer-frontend.yml`

Place this file at the exact path `.github/workflows/customer-frontend.yml` in your repository root:

```yaml
name: Customer Frontend CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'customer/frontend/**'
      - '.github/workflows/customer-frontend.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'customer/frontend/**'

env:
  NODE_VERSION: '24.9.0'
  AWS_REGION: 'us-east-1'

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: customer/frontend/package-lock.json

      - name: Install Dependencies
        working-directory: ./customer/frontend
        run: npm ci

      - name: Run ESLint
        working-directory: ./customer/frontend
        run: npm run lint

      - name: Run Type Check
        working-directory: ./customer/frontend
        run: npm run type-check

      - name: Run Unit Tests
        working-directory: ./customer/frontend
        run: npm run test:ci
        env:
          CI: true

      - name: Upload Test Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./customer/frontend/coverage/coverage-final.json
          flags: customer-frontend

  build:
    name: Build Application
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: customer/frontend/package-lock.json

      - name: Install Dependencies
        working-directory: ./customer/frontend
        run: npm ci

      - name: Build Application
        working-directory: ./customer/frontend
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.CUSTOMER_API_URL }}
          NEXT_PUBLIC_ENV: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}

      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: customer-frontend-build
          path: customer/frontend/.next
          retention-days: 7

  deploy:
    name: Deploy to AWS
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    environment:
      name: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Script Dependencies
        working-directory: ./scripts
        run: npm ci

      - name: Download Build Artifacts
        uses: actions/download-artifact@v4
        with:
          name: customer-frontend-build
          path: customer/frontend/.next

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to EC2
        run: node scripts/deploy.js customer-frontend
        env:
          DEPLOY_HOST: ${{ secrets.CUSTOMER_FRONTEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          ENVIRONMENT: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}

      - name: Health Check
        run: node scripts/health-check.js
        env:
          SERVICE_URL: ${{ secrets.CUSTOMER_FRONTEND_URL }}
          MAX_RETRIES: 5
          RETRY_DELAY: 10000

      - name: Rollback on Failure
        if: failure()
        run: node scripts/rollback.js customer-frontend
        env:
          DEPLOY_HOST: ${{ secrets.CUSTOMER_FRONTEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.24.0
        with:
          payload: |
            {
              "text": "${{ job.status == 'success' && '✅' || '❌' }} Customer Frontend Deployment ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Status: ${{ job.status }}*\n*Service:* Customer Frontend\n*Branch:* ${{ github.ref_name }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### File: `.github/workflows/customer-backend.yml`

Place this file at the exact path `.github/workflows/customer-backend.yml`:

```yaml
name: Customer Backend CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'customer/backend/**'
      - '.github/workflows/customer-backend.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'customer/backend/**'

env:
  NODE_VERSION: '24.9.0'
  AWS_REGION: 'us-east-1'

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        env:
          MONGO_INITDB_ROOT_USERNAME: test
          MONGO_INITDB_ROOT_PASSWORD: test
        options: >-
          --health-cmd "mongosh --eval 'db.adminCommand({ ping: 1 })'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: customer/backend/package-lock.json

      - name: Install Dependencies
        working-directory: ./customer/backend
        run: npm ci

      - name: Run ESLint
        working-directory: ./customer/backend
        run: npm run lint

      - name: Run Unit Tests
        working-directory: ./customer/backend
        run: npm run test:ci
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://test:test@localhost:27017/test?authSource=admin
          JWT_SECRET: test-secret-key-for-ci-pipeline

      - name: Run Integration Tests
        working-directory: ./customer/backend
        run: npm run test:integration
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://test:test@localhost:27017/test?authSource=admin
          JWT_SECRET: test-secret-key-for-ci-pipeline
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ env.AWS_REGION }}

      - name: Upload Test Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./customer/backend/coverage/coverage-final.json
          flags: customer-backend

  security-scan:
    name: Security Scanning
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run npm audit
        working-directory: ./customer/backend
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Run Snyk Security Scan
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --file=customer/backend/package.json

  deploy:
    name: Deploy to AWS EC2
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    environment:
      name: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Script Dependencies
        working-directory: ./scripts
        run: npm ci

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to EC2
        run: node scripts/deploy.js customer-backend
        env:
          DEPLOY_HOST: ${{ secrets.CUSTOMER_BACKEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          ENVIRONMENT: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
          MONGODB_URI: ${{ secrets.MONGODB_URI_CUSTOMER }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}

      - name: Run Database Migrations
        run: node scripts/run-migrations.js
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI_CUSTOMER }}
          SERVICE_NAME: customer-backend

      - name: Health Check
        run: node scripts/health-check.js
        env:
          SERVICE_URL: ${{ secrets.CUSTOMER_BACKEND_URL }}/health
          MAX_RETRIES: 5
          RETRY_DELAY: 10000

      - name: Rollback on Failure
        if: failure()
        run: node scripts/rollback.js customer-backend
        env:
          DEPLOY_HOST: ${{ secrets.CUSTOMER_BACKEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.24.0
        with:
          payload: |
            {
              "text": "${{ job.status == 'success' && '✅' || '❌' }} Customer Backend Deployment ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Status: ${{ job.status }}*\n*Service:* Customer Backend\n*Branch:* ${{ github.ref_name }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### File: `.github/workflows/admin-backend.yml`

Place this file at the exact path `.github/workflows/admin-backend.yml`:

```yaml
name: Admin Backend CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'admin/backend/**'
      - '.github/workflows/admin-backend.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'admin/backend/**'

env:
  NODE_VERSION: '24.9.0'
  AWS_REGION: 'us-east-1'

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        env:
          MONGO_INITDB_ROOT_USERNAME: test
          MONGO_INITDB_ROOT_PASSWORD: test
        options: >-
          --health-cmd "mongosh --eval 'db.adminCommand({ ping: 1 })'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: admin/backend/package-lock.json

      - name: Install Dependencies
        working-directory: ./admin/backend
        run: npm ci

      - name: Run ESLint
        working-directory: ./admin/backend
        run: npm run lint

      - name: Run Unit Tests
        working-directory: ./admin/backend
        run: npm run test:ci
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://test:test@localhost:27017/test?authSource=admin
          JWT_SECRET: test-secret-key-for-ci-pipeline

      - name: Upload Test Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./admin/backend/coverage/coverage-final.json
          flags: admin-backend

  deploy:
    name: Deploy to AWS EC2
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
    environment:
      name: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Script Dependencies
        working-directory: ./scripts
        run: npm ci

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to EC2
        run: node scripts/deploy.js admin-backend
        env:
          DEPLOY_HOST: ${{ secrets.ADMIN_BACKEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          ENVIRONMENT: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
          MONGODB_URI: ${{ secrets.MONGODB_URI_ADMIN }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}

      - name: Health Check
        run: node scripts/health-check.js
        env:
          SERVICE_URL: ${{ secrets.ADMIN_BACKEND_URL }}/health
          MAX_RETRIES: 5
          RETRY_DELAY: 10000

      - name: Rollback on Failure
        if: failure()
        run: node scripts/rollback.js admin-backend
        env:
          DEPLOY_HOST: ${{ secrets.ADMIN_BACKEND_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
```

---

## Deployment Scripts

All deployment scripts should be placed in the `scripts/` directory at the root of your repository.

### File: `scripts/package.json`

Create this file at `scripts/package.json`:

```json
{
  "name": "insightserenity-deployment-scripts",
  "version": "1.0.0",
  "description": "Deployment automation scripts for InsightSerenity platform",
  "main": "deploy.js",
  "scripts": {
    "test": "echo \"No tests configured for deployment scripts\""
  },
  "dependencies": {
    "ssh2": "^1.15.0"
  },
  "engines": {
    "node": ">=24.9.0"
  }
}
```

### File: `scripts/deploy.js`

Create this file at `scripts/deploy.js`:

```javascript
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

/**
 * Deployer class handles the complete deployment process for InsightSerenity services
 * This includes: backup, upload, dependency installation, build, configuration, and service restart
 */
class Deployer {
  constructor(config) {
    this.config = config;
    this.conn = new Client();
    this.serviceName = config.serviceName;
    this.environment = config.environment;
  }

  /**
   * Establishes SSH connection to the target server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.conn
        .on('ready', () => {
          console.log('SSH connection established to deployment server');
          resolve();
        })
        .on('error', (err) => {
          console.error('SSH connection error:', err);
          reject(err);
        })
        .connect({
          host: this.config.host,
          port: this.config.port || 22,
          username: this.config.username,
          privateKey: this.config.privateKey
        });
    });
  }

  /**
   * Executes a command on the remote server via SSH
   */
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) {
          console.error('Command execution error:', err);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code) => {
            if (code !== 0) {
              const error = new Error(`Command failed with exit code ${code}`);
              error.stderr = stderr;
              error.stdout = stdout;
              return reject(error);
            }
            resolve({ stdout, stderr, code });
          })
          .on('data', (data) => {
            stdout += data.toString();
            console.log(data.toString());
          })
          .stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
          });
      });
    });
  }

  /**
   * Creates a backup of the current deployment before deploying new version
   */
  async createBackup() {
    console.log('Creating backup of current deployment...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `/var/backups/${this.serviceName}-${timestamp}`;

    await this.executeCommand(`
      if [ -d /var/www/${this.serviceName}/current ]; then
        sudo mkdir -p /var/backups
        sudo cp -r /var/www/${this.serviceName}/current ${backupPath}
        echo "Backup created at ${backupPath}"
      else
        echo "No existing deployment to backup - this is a fresh installation"
      fi
    `);

    return backupPath;
  }

  /**
   * Uploads application files to the remote server
   */
  async uploadFiles() {
    console.log('Uploading application files to server...');
    
    const releaseDir = `/var/www/${this.serviceName}/releases/${Date.now()}`;
    
    await this.executeCommand(`
      sudo mkdir -p ${releaseDir}
      sudo chown -R ${this.config.username}:${this.config.username} /var/www/${this.serviceName}
    `);

    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) {
          console.error('SFTP initialization error:', err);
          return reject(err);
        }

        const localPath = path.join(process.cwd(), this.getLocalPath());
        const remotePath = releaseDir;

        console.log(`Uploading from ${localPath} to ${remotePath}`);

        this.uploadDirectory(sftp, localPath, remotePath)
          .then(() => {
            console.log('File upload completed successfully');
            resolve(releaseDir);
          })
          .catch((err) => {
            console.error('File upload failed:', err);
            reject(err);
          });
      });
    });
  }

  /**
   * Recursively uploads a directory and its contents via SFTP
   */
  async uploadDirectory(sftp, localDir, remoteDir) {
    const files = await readdir(localDir);
    
    for (const file of files) {
      // Skip unnecessary directories and files
      if (file === 'node_modules' || file === '.git' || file === '.next' || file === 'coverage') {
        continue;
      }
      
      const localPath = path.join(localDir, file);
      const remotePath = path.join(remoteDir, file);
      const fileStat = await stat(localPath);

      if (fileStat.isDirectory()) {
        try {
          await promisify(sftp.mkdir.bind(sftp))(remotePath);
        } catch (err) {
          // Directory may already exist, continue
        }
        await this.uploadDirectory(sftp, localPath, remotePath);
      } else {
        await promisify(sftp.fastPut.bind(sftp))(localPath, remotePath);
        console.log(`Uploaded: ${remotePath}`);
      }
    }
  }

  /**
   * Returns the local path for the service being deployed
   */
  getLocalPath() {
    const pathMap = {
      'customer-frontend': 'customer/frontend',
      'customer-backend': 'customer/backend',
      'admin-frontend': 'admin/frontend',
      'admin-backend': 'admin/backend'
    };
    return pathMap[this.serviceName] || this.serviceName;
  }

  /**
   * Installs production dependencies on the remote server
   */
  async installDependencies(releaseDir) {
    console.log('Installing production dependencies...');
    await this.executeCommand(`
      cd ${releaseDir}
      npm ci --production --omit=dev
    `);
  }

  /**
   * Builds the application if it is a frontend service
   */
  async buildApplication(releaseDir) {
    if (this.serviceName.includes('frontend')) {
      console.log('Building frontend application...');
      await this.executeCommand(`
        cd ${releaseDir}
        npm run build
      `);
    }
  }

  /**
   * Creates environment configuration file with necessary variables
   */
  async createEnvironmentFile(releaseDir) {
    console.log('Creating environment configuration file...');
    
    const envVars = this.getEnvironmentVariables();
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await this.executeCommand(`
      cat > ${releaseDir}/.env << 'EOL'
${envContent}
EOL
      chmod 600 ${releaseDir}/.env
    `);
  }

  /**
   * Retrieves environment variables for the service
   */
  getEnvironmentVariables() {
    const baseVars = {
      NODE_ENV: this.environment,
      PORT: this.serviceName.includes('backend') ? 5000 : 3000
    };

    // Add service-specific environment variables
    if (process.env.MONGODB_URI) baseVars.MONGODB_URI = process.env.MONGODB_URI;
    if (process.env.JWT_SECRET) baseVars.JWT_SECRET = process.env.JWT_SECRET;
    if (process.env.AWS_S3_BUCKET) baseVars.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;
    if (process.env.AWS_REGION) baseVars.AWS_REGION = process.env.AWS_REGION;
    if (process.env.AWS_ACCESS_KEY_ID) baseVars.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    if (process.env.AWS_SECRET_ACCESS_KEY) baseVars.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

    return baseVars;
  }

  /**
   * Updates the symbolic link to point to the new release
   */
  async updateSymlink(releaseDir) {
    console.log('Updating current symlink to new release...');
    await this.executeCommand(`
      sudo ln -nfs ${releaseDir} /var/www/${this.serviceName}/current
    `);
  }

  /**
   * Restarts the systemd service for the deployed application
   */
  async restartService() {
    console.log('Restarting service...');
    await this.executeCommand(`
      sudo systemctl restart ${this.serviceName}
      sleep 5
      sudo systemctl status ${this.serviceName} --no-pager
    `);
  }

  /**
   * Removes old releases, keeping only the five most recent
   */
  async cleanupOldReleases() {
    console.log('Cleaning up old releases (keeping last 5)...');
    await this.executeCommand(`
      cd /var/www/${this.serviceName}/releases
      ls -t | tail -n +6 | xargs -r sudo rm -rf
    `);
  }

  /**
   * Closes the SSH connection
   */
  async disconnect() {
    this.conn.end();
    console.log('SSH connection closed');
  }

  /**
   * Executes the complete deployment process
   */
  async deploy() {
    try {
      console.log(`========================================`);
      console.log(`Starting deployment of ${this.serviceName}`);
      console.log(`Environment: ${this.environment}`);
      console.log(`========================================`);
      
      await this.connect();
      const backupPath = await this.createBackup();
      const releaseDir = await this.uploadFiles();
      await this.installDependencies(releaseDir);
      await this.buildApplication(releaseDir);
      await this.createEnvironmentFile(releaseDir);
      await this.updateSymlink(releaseDir);
      await this.restartService();
      await this.cleanupOldReleases();
      
      console.log('========================================');
      console.log('Deployment completed successfully');
      console.log('========================================');
      process.exit(0);
    } catch (error) {
      console.error('========================================');
      console.error('Deployment failed:', error.message);
      console.error('========================================');
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const serviceName = process.argv[2];
  
  if (!serviceName) {
    console.error('Usage: node deploy.js <service-name>');
    console.error('Valid service names: customer-frontend, customer-backend, admin-frontend, admin-backend');
    process.exit(1);
  }

  const config = {
    serviceName,
    host: process.env.DEPLOY_HOST,
    username: process.env.DEPLOY_USER,
    privateKey: process.env.DEPLOY_KEY,
    environment: process.env.ENVIRONMENT || 'staging'
  };

  // Validate required configuration
  if (!config.host || !config.username || !config.privateKey) {
    console.error('Missing required environment variables: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY');
    process.exit(1);
  }

  const deployer = new Deployer(config);
  await deployer.deploy();
}

main();
```

### File: `scripts/health-check.js`

Create this file at `scripts/health-check.js`:

```javascript
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * HealthChecker performs automated health checks on deployed services
 * with retry logic and configurable timeouts
 */
class HealthChecker {
  constructor(config) {
    this.serviceUrl = config.serviceUrl;
    this.maxRetries = config.maxRetries || 5;
    this.retryDelay = config.retryDelay || 10000;
    this.timeout = config.timeout || 5000;
  }

  /**
   * Performs a single health check request
   */
  async performHealthCheck() {
    const url = new URL(this.serviceUrl);
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.get(this.serviceUrl, { timeout: this.timeout }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ 
              status: res.statusCode, 
              data,
              headers: res.headers 
            });
          } else {
            reject(new Error(`Health check failed with status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Health check request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check request timed out'));
      });
    });
  }

  /**
   * Performs health checks with retry logic
   */
  async checkWithRetries() {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Health check attempt ${attempt}/${this.maxRetries}...`);
        console.log(`Checking: ${this.serviceUrl}`);
        
        const result = await this.performHealthCheck();
        
        console.log(`Health check successful!`);
        console.log(`Status: ${result.status}`);
        console.log(`Response: ${result.data.substring(0, 200)}${result.data.length > 200 ? '...' : ''}`);
        
        return true;
      } catch (error) {
        console.error(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          console.log(`Waiting ${this.retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    throw new Error(`Health check failed after ${this.maxRetries} attempts`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const config = {
    serviceUrl: process.env.SERVICE_URL,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 10000,
    timeout: parseInt(process.env.TIMEOUT) || 5000
  };

  if (!config.serviceUrl) {
    console.error('SERVICE_URL environment variable is required');
    console.error('Example: SERVICE_URL=https://api.insightserenity.com/health');
    process.exit(1);
  }

  console.log('========================================');
  console.log('Starting Health Check');
  console.log('========================================');

  try {
    const checker = new HealthChecker(config);
    await checker.checkWithRetries();
    
    console.log('========================================');
    console.log('Health check passed');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Health check failed:', error.message);
    console.error('========================================');
    process.exit(1);
  }
}

main();
```

### File: `scripts/rollback.js`

Create this file at `scripts/rollback.js`:

```javascript
const { Client } = require('ssh2');

/**
 * RollbackManager handles automated rollback to previous deployment
 * in case of deployment failures
 */
class RollbackManager {
  constructor(config) {
    this.config = config;
    this.conn = new Client();
    this.serviceName = config.serviceName;
  }

  /**
   * Establishes SSH connection to the target server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.conn
        .on('ready', () => {
          console.log('SSH connection established for rollback operation');
          resolve();
        })
        .on('error', (err) => {
          console.error('SSH connection error:', err);
          reject(err);
        })
        .connect({
          host: this.config.host,
          port: this.config.port || 22,
          username: this.config.username,
          privateKey: this.config.privateKey
        });
    });
  }

  /**
   * Executes a command on the remote server
   */
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) {
          console.error('Command execution error:', err);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code) => {
            if (code !== 0) {
              console.warn(`Command exited with code ${code}`);
            }
            resolve({ stdout, stderr, code });
          })
          .on('data', (data) => {
            stdout += data.toString();
            console.log(data.toString());
          })
          .stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
          });
      });
    });
  }

  /**
   * Finds the previous release directory
   */
  async findPreviousRelease() {
    console.log('Searching for previous release...');
    
    const result = await this.executeCommand(`
      cd /var/www/${this.serviceName}/releases
      ls -t | head -n 2 | tail -n 1
    `);
    
    const previousRelease = result.stdout.trim();
    
    if (!previousRelease) {
      throw new Error('No previous release found for rollback');
    }
    
    const releasePath = `/var/www/${this.serviceName}/releases/${previousRelease}`;
    console.log(`Previous release found: ${releasePath}`);
    
    return releasePath;
  }

  /**
   * Rolls back to the specified release
   */
  async rollbackToRelease(releasePath) {
    console.log(`Rolling back to ${releasePath}...`);
    
    // Update symlink to previous release
    await this.executeCommand(`
      sudo ln -nfs ${releasePath} /var/www/${this.serviceName}/current
    `);
    
    console.log('Symlink updated to previous release');
    
    // Restart service with previous release
    await this.executeCommand(`
      sudo systemctl restart ${this.serviceName}
      sleep 5
      sudo systemctl status ${this.serviceName} --no-pager
    `);
    
    console.log('Service restarted with previous release');
  }

  /**
   * Closes the SSH connection
   */
  async disconnect() {
    this.conn.end();
    console.log('SSH connection closed');
  }

  /**
   * Executes the complete rollback process
   */
  async performRollback() {
    try {
      console.log('========================================');
      console.log(`Starting rollback for ${this.serviceName}`);
      console.log('========================================');
      
      await this.connect();
      const previousRelease = await this.findPreviousRelease();
      await this.rollbackToRelease(previousRelease);
      
      console.log('========================================');
      console.log('Rollback completed successfully');
      console.log('========================================');
      process.exit(0);
    } catch (error) {
      console.error('========================================');
      console.error('Rollback failed:', error.message);
      console.error('========================================');
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const serviceName = process.argv[2];
  
  if (!serviceName) {
    console.error('Usage: node rollback.js <service-name>');
    console.error('Valid service names: customer-frontend, customer-backend, admin-frontend, admin-backend');
    process.exit(1);
  }

  const config = {
    serviceName,
    host: process.env.DEPLOY_HOST,
    username: process.env.DEPLOY_USER,
    privateKey: process.env.DEPLOY_KEY
  };

  // Validate required configuration
  if (!config.host || !config.username || !config.privateKey) {
    console.error('Missing required environment variables: DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY');
    process.exit(1);
  }

  const rollbackManager = new RollbackManager(config);
  await rollbackManager.performRollback();
}

main();
```

### File: `scripts/run-migrations.js`

Create this file at `scripts/run-migrations.js`:

```javascript
const { MongoClient } = require('mongodb');

/**
 * MigrationRunner handles database schema migrations for InsightSerenity
 * This ensures database schema changes are applied consistently across environments
 */
class MigrationRunner {
  constructor(config) {
    this.config = config;
    this.mongoUri = config.mongoUri;
    this.serviceName = config.serviceName;
    this.client = null;
    this.db = null;
  }

  /**
   * Connects to MongoDB
   */
  async connect() {
    console.log('Connecting to MongoDB...');
    this.client = new MongoClient(this.mongoUri);
    await this.client.connect();
    this.db = this.client.db();
    console.log('Connected to MongoDB successfully');
  }

  /**
   * Loads migration definitions
   */
  async loadMigrations() {
    // Define your migrations here
    // Each migration should have a unique name and an up function
    return [
      {
        name: '001_add_client_indexes',
        description: 'Add performance indexes for client queries',
        up: async (db) => {
          console.log('Creating indexes on clients collection...');
          await db.collection('clients').createIndex({ organizationId: 1 });
          await db.collection('clients').createIndex({ createdAt: -1 });
          await db.collection('clients').createIndex({ status: 1, organizationId: 1 });
          console.log('Client indexes created successfully');
        }
      },
      {
        name: '002_add_user_permissions_field',
        description: 'Add permissions field to users without it',
        up: async (db) => {
          console.log('Adding permissions field to users...');
          const result = await db.collection('users').updateMany(
            { permissions: { $exists: false } },
            { $set: { permissions: [] } }
          );
          console.log(`Updated ${result.modifiedCount} users with permissions field`);
        }
      },
      {
        name: '003_add_document_indexes',
        description: 'Add indexes for document management',
        up: async (db) => {
          console.log('Creating indexes on documents collection...');
          await db.collection('documents').createIndex({ clientId: 1, createdAt: -1 });
          await db.collection('documents').createIndex({ uploadedBy: 1 });
          await db.collection('documents').createIndex({ documentType: 1 });
          console.log('Document indexes created successfully');
        }
      },
      {
        name: '004_add_contact_indexes',
        description: 'Add indexes for contact management',
        up: async (db) => {
          console.log('Creating indexes on contacts collection...');
          await db.collection('contacts').createIndex({ clientId: 1 });
          await db.collection('contacts').createIndex({ email: 1 });
          await db.collection('contacts').createIndex({ isPrimary: 1, clientId: 1 });
          console.log('Contact indexes created successfully');
        }
      }
    ];
  }

  /**
   * Retrieves list of already applied migrations
   */
  async getAppliedMigrations() {
    const migrationsCollection = this.db.collection('migrations');
    const applied = await migrationsCollection
      .find()
      .project({ name: 1 })
      .toArray();
    return new Set(applied.map(m => m.name));
  }

  /**
   * Records a migration as applied
   */
  async recordMigration(migrationName) {
    const migrationsCollection = this.db.collection('migrations');
    await migrationsCollection.insertOne({
      name: migrationName,
      appliedAt: new Date(),
      service: this.serviceName
    });
  }

  /**
   * Executes all pending migrations
   */
  async runMigrations() {
    console.log('Loading migration definitions...');
    const migrations = await this.loadMigrations();
    
    console.log('Checking applied migrations...');
    const appliedMigrations = await this.getAppliedMigrations();
    
    console.log(`Found ${appliedMigrations.size} previously applied migrations`);
    console.log(`Total migrations available: ${migrations.length}`);
    
    let appliedCount = 0;
    
    for (const migration of migrations) {
      if (!appliedMigrations.has(migration.name)) {
        console.log('========================================');
        console.log(`Applying migration: ${migration.name}`);
        console.log(`Description: ${migration.description}`);
        console.log('========================================');
        
        try {
          await migration.up(this.db);
          await this.recordMigration(migration.name);
          console.log(`Migration ${migration.name} completed successfully`);
          appliedCount++;
        } catch (error) {
          console.error(`Migration ${migration.name} failed:`, error.message);
          throw error;
        }
      } else {
        console.log(`Skipping already applied migration: ${migration.name}`);
      }
    }
    
    console.log('========================================');
    console.log(`Applied ${appliedCount} new migrations`);
    console.log('========================================');
  }

  /**
   * Closes MongoDB connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('MongoDB connection closed');
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const config = {
    mongoUri: process.env.MONGODB_URI,
    serviceName: process.env.SERVICE_NAME || 'unknown-service'
  };

  if (!config.mongoUri) {
    console.error('MONGODB_URI environment variable is required');
    console.error('Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/database');
    process.exit(1);
  }

  console.log('========================================');
  console.log('Starting Database Migrations');
  console.log(`Service: ${config.serviceName}`);
  console.log('========================================');

  const runner = new MigrationRunner(config);
  
  try {
    await runner.connect();
    await runner.runMigrations();
    
    console.log('========================================');
    console.log('All migrations completed successfully');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('========================================');
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

main();
```

---

## EC2 Server Setup

Each EC2 instance requires proper configuration to support automated deployments. Follow these instructions for each server.

### Initial Server Configuration

Connect to your EC2 instance via SSH and execute the following setup commands:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 24.9.0 using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 24.9.0
nvm use 24.9.0
nvm alias default 24.9.0

# Install nginx
sudo apt install nginx -y

# Install certbot for SSL certificates
sudo apt install certbot python3-certbot-nginx -y

# Create deployment user
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG sudo deploy

# Create directory structure
sudo mkdir -p /var/www/customer-frontend/releases
sudo mkdir -p /var/www/customer-backend/releases
sudo mkdir -p /var/www/admin-frontend/releases
sudo mkdir -p /var/www/admin-backend/releases
sudo mkdir -p /var/backups

# Set ownership
sudo chown -R deploy:deploy /var/www

# Configure SSH key for deployment user
sudo mkdir -p /home/deploy/.ssh
sudo touch /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

### Add Your SSH Public Key

Add your deployment SSH public key to the authorized_keys file:

```bash
echo "your-ssh-public-key-here" | sudo tee -a /home/deploy/.ssh/authorized_keys
```

### Create Systemd Service Files

For each backend service, create a systemd service file. Example for customer backend at `/etc/systemd/system/customer-backend.service`:

```ini
[Unit]
Description=InsightSerenity Customer Backend Service
Documentation=https://github.com/your-org/insightserenity
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/customer-backend/current
ExecStart=/home/deploy/.nvm/versions/node/v24.9.0/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=customer-backend

# Environment variables (sensitive values will come from .env file)
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```

Create similar service files for admin-backend, customer-frontend (if using standalone mode), and admin-frontend.

Enable and start the services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable customer-backend
sudo systemctl enable admin-backend
```

### Configure Nginx

Create nginx configuration for your customer frontend at `/etc/nginx/sites-available/customer-frontend`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name customer.insightserenity.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS configuration
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name customer.insightserenity.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/customer.insightserenity.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/customer.insightserenity.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/customer-frontend-access.log;
    error_log /var/log/nginx/customer-frontend-error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy configuration
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }

    # Static files caching
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
```

Create similar configurations for other services, adjusting ports and domain names accordingly. Backend services typically run on port 5000.

Enable the site and obtain SSL certificates:

```bash
sudo ln -s /etc/nginx/sites-available/customer-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificate
sudo certbot --nginx -d customer.insightserenity.com

# Setup automatic renewal
sudo systemctl enable certbot.timer
```

---

## GitHub Secrets Configuration

Navigate to your GitHub repository, then go to Settings → Secrets and variables → Actions. Add the following secrets:

### AWS Credentials
- **AWS_ACCESS_KEY_ID**: Your AWS access key with EC2 and S3 permissions
- **AWS_SECRET_ACCESS_KEY**: Your AWS secret access key
- **AWS_REGION**: Your AWS region (example: us-east-1)
- **AWS_S3_BUCKET**: Your S3 bucket name for document storage

### Deployment SSH Configuration
- **DEPLOY_USER**: The SSH username for deployment (typically 'deploy')
- **DEPLOY_SSH_KEY**: Your private SSH key content (entire key including headers)

### EC2 Host Addresses
- **CUSTOMER_FRONTEND_HOST**: IP or domain of customer frontend server
- **CUSTOMER_BACKEND_HOST**: IP or domain of customer backend server
- **ADMIN_FRONTEND_HOST**: IP or domain of admin frontend server
- **ADMIN_BACKEND_HOST**: IP or domain of admin backend server

### Service URLs for Health Checks
- **CUSTOMER_FRONTEND_URL**: Full URL including protocol (https://customer.insightserenity.com)
- **CUSTOMER_BACKEND_URL**: Full backend URL (https://api-customer.insightserenity.com)
- **ADMIN_BACKEND_URL**: Full admin backend URL

### Application Configuration
- **MONGODB_URI_CUSTOMER**: MongoDB connection string for customer database
- **MONGODB_URI_ADMIN**: MongoDB connection string for admin database
- **JWT_SECRET**: Strong random string for JWT token signing (generate using: openssl rand -base64 32)
- **CUSTOMER_API_URL**: API endpoint URL for customer services

### Optional Integrations
- **SLACK_WEBHOOK_URL**: Slack webhook for deployment notifications
- **SNYK_TOKEN**: Snyk API token for security scanning

### Creating Environment Configurations

GitHub Actions supports environment-specific secrets. Create two environments:

1. Go to Settings → Environments
2. Create 'production' environment
3. Create 'staging' environment
4. Add environment-specific protection rules and secrets as needed

---

## Testing the Pipeline

Follow this testing strategy to validate your CI/CD pipeline before production use.

### Phase 1: Local Testing

Test the deployment scripts locally to ensure they work correctly:

```bash
# Install script dependencies
cd scripts
npm install

# Test health check script
SERVICE_URL=https://www.google.com MAX_RETRIES=2 node health-check.js

# This should pass since Google is accessible
```

### Phase 2: Branch Protection Setup

Configure branch protection for your main branch:

1. Navigate to Settings → Branches
2. Add branch protection rule for 'main'
3. Enable "Require status checks to pass before merging"
4. Select your CI workflows as required checks
5. Enable "Require branches to be up to date before merging"

### Phase 3: Test with Pull Request

Create a test pull request to trigger the CI pipeline:

```bash
# Create a test branch
git checkout -b test-ci-pipeline

# Make a small change to trigger workflows
echo "# CI/CD Pipeline Test" >> customer/frontend/README.md

# Commit and push
git add .
git commit -m "test: Validate CI pipeline configuration"
git push origin test-ci-pipeline
```

Create a pull request from this branch. The workflows should trigger automatically and run the test jobs.

### Phase 4: Test Deployment to Staging

Merge your test branch to the develop branch (or create a develop branch) to trigger a staging deployment:

```bash
git checkout develop
git merge test-ci-pipeline
git push origin develop
```

Monitor the GitHub Actions tab to watch the deployment progress.

### Phase 5: Verify Deployment

After deployment completes, verify the services are running correctly:

```bash
# Check service status on EC2
ssh deploy@your-server-ip
sudo systemctl status customer-backend
sudo systemctl status customer-frontend

# Check logs
sudo journalctl -u customer-backend -n 50
```

Test the health endpoints:

```bash
curl https://your-customer-backend-url/health
curl https://your-customer-frontend-url
```

### Phase 6: Test Rollback

Intentionally create a failing deployment to test the rollback mechanism. The pipeline should automatically rollback to the previous working version when health checks fail.

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: SSH Connection Failed

**Symptoms**: Deployment fails with SSH connection timeout or authentication error

**Solutions**:
- Verify the SSH key is correctly added to GitHub secrets (include the entire key with headers)
- Ensure the EC2 security group allows SSH from GitHub Actions IP ranges
- Verify the deploy user exists on the server with proper permissions
- Check that the authorized_keys file has correct permissions (600)

#### Issue: Health Check Continuously Fails

**Symptoms**: Deployment completes but health check times out

**Solutions**:
- Verify the service is actually running: `sudo systemctl status service-name`
- Check service logs: `sudo journalctl -u service-name -n 100`
- Ensure the health endpoint exists in your application
- Verify nginx is correctly proxying to the application port
- Check firewall rules allow traffic on the application port

#### Issue: Build Fails Due to Environment Variables

**Symptoms**: Build step fails with missing environment variable errors

**Solutions**:
- Verify all required secrets are configured in GitHub
- Check that environment variables are correctly passed in the workflow file
- Ensure the .env file is created correctly in the deploy script
- Validate MongoDB connection strings and AWS credentials

#### Issue: Service Fails to Start After Deployment

**Symptoms**: Deployment completes but service status shows failed

**Solutions**:
- Check service logs for specific error messages
- Verify all dependencies were installed correctly
- Ensure the .env file contains all required variables
- Check that the symbolic link points to the correct release directory
- Verify file permissions in the release directory

#### Issue: Old Releases Not Being Cleaned Up

**Symptoms**: Server disk space fills up over time

**Solutions**:
- Verify the cleanup command is executing in the deploy script
- Manually clean old releases: `cd /var/www/service-name/releases && ls -t | tail -n +6 | xargs sudo rm -rf`
- Check server disk space: `df -h`
- Consider adjusting the number of releases to keep

#### Issue: Database Migration Fails

**Symptoms**: Migration script exits with error

**Solutions**:
- Verify MongoDB connection string is correct
- Check that the database user has appropriate permissions
- Review migration logs for specific errors
- Test migrations in a development environment first
- Ensure migrations are idempotent (can run multiple times safely)

---

## Additional Considerations

### Security Hardening

Your CI/CD pipeline handles sensitive credentials and production access. Implement these additional security measures:

1. **Rotate Credentials Regularly**: Establish a quarterly schedule for rotating SSH keys, JWT secrets, and AWS access keys.

2. **Audit Access Logs**: Regularly review deployment logs and SSH access logs on your EC2 instances.

3. **Implement IP Restrictions**: Consider restricting SSH access to specific GitHub Actions IP ranges using security groups.

4. **Use AWS Secrets Manager**: For production environments, consider moving sensitive configuration from environment variables to AWS Secrets Manager.

5. **Enable GitHub Security Features**: Turn on security alerts, Dependabot, and code scanning in your repository settings.

### Monitoring and Alerting

Implement comprehensive monitoring for your deployment pipeline:

1. **Setup CloudWatch Alarms**: Configure alarms for EC2 CPU usage, disk space, and memory consumption.

2. **Application Performance Monitoring**: Consider integrating tools like New Relic or DataDog for application-level monitoring.

3. **Log Aggregation**: Implement centralized logging using services like CloudWatch Logs or the ELK stack.

4. **Uptime Monitoring**: Use services like Pingdom or UptimeRobot to monitor service availability.

### Disaster Recovery Planning

Maintain procedures for emergency situations:

1. **Database Backups**: Implement automated MongoDB Atlas backups and test restoration procedures.

2. **Infrastructure as Code**: Document your EC2 configuration and nginx setup for rapid recreation if needed.

3. **Emergency Contacts**: Maintain a list of team members responsible for production systems.

4. **Runbook Documentation**: Create step-by-step guides for common emergency scenarios.

### Performance Optimization

Optimize your deployment pipeline over time:

1. **Dependency Caching**: The workflows already implement npm caching, but monitor cache hit rates.

2. **Parallel Deployments**: Consider deploying multiple services in parallel if they are independent.

3. **Build Optimization**: Review and optimize your Next.js build configuration for faster builds.

4. **Zero-Downtime Deployments**: Implement blue-green deployment or rolling updates for production.

---

## Next Steps After Implementation

Once your CI/CD pipeline is operational, consider these enhancements:

### Short-term Improvements

1. **Add End-to-End Tests**: Implement automated E2E tests using Playwright or Cypress that run before deployment.

2. **Implement Code Coverage Requirements**: Set minimum code coverage thresholds in your workflows.

3. **Add Performance Testing**: Integrate load testing tools to validate performance before production deployment.

4. **Setup Automated Database Backups**: Implement pre-deployment database backups for additional safety.

### Long-term Enhancements

1. **Implement Feature Flags**: Add feature flag capability to enable gradual rollout of new features.

2. **Setup A/B Testing Infrastructure**: Prepare infrastructure for A/B testing of new features.

3. **Implement Canary Deployments**: Deploy new versions to a subset of servers first for validation.

4. **Add Multi-Region Support**: Expand your deployment pipeline to support multiple AWS regions for disaster recovery.

5. **Implement Infrastructure as Code**: Consider using Terraform or AWS CDK to manage your infrastructure alongside application code.

---

## Conclusion

This comprehensive CI/CD pipeline provides automated testing, building, and deployment capabilities specifically designed for the InsightSerenity platform. The implementation supports your multi-tenant architecture while maintaining proper separation between customer and administrative systems.

The pipeline includes comprehensive error handling, health checking, and automated rollback capabilities to ensure reliable deployments. By following this guide step by step, you will establish a production-ready deployment system that enables rapid, safe iterations on your platform.

Remember to thoroughly test each component in a non-production environment before deploying to production. Start with the staging environment, validate all functionality, and only then proceed to production deployments.

For questions or issues during implementation, review the troubleshooting section and ensure all prerequisites are properly configured. The success of your CI/CD pipeline depends on careful attention to configuration details and proper server setup.

---

**Document Version**: 1.0  
**Last Updated**: November 2025  
**Maintained By**: InsightSerenity Development Team