#!/usr/bin/env node

/**
 * SSL Certificate Validation Test
 * Tests that SSL certificates can be loaded and used by Node.js HTTPS server
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ADMIN_SSL_DIR = path.join(__dirname, '../../admin-server/ssl');
const CUSTOMER_SSL_DIR = path.join(__dirname, '../../customer-services/ssl');

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   SSL Certificate Validation Test                                ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

function testCertificate(name, sslDir, port) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Testing ${name} SSL Certificate`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const keyPath = path.join(sslDir, 'server.key');
  const certPath = path.join(sslDir, 'server.crt');

  // Test 1: Check file existence
  console.log(`\n[1] Checking file existence...`);
  try {
    if (!fs.existsSync(keyPath)) {
      console.log(`  ✗ FAIL: Private key not found at ${keyPath}`);
      return false;
    }
    console.log(`  ✓ PASS: Private key exists`);

    if (!fs.existsSync(certPath)) {
      console.log(`  ✗ FAIL: Certificate not found at ${certPath}`);
      return false;
    }
    console.log(`  ✓ PASS: Certificate exists`);
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}`);
    return false;
  }

  // Test 2: Check file permissions
  console.log(`\n[2] Checking file permissions...`);
  try {
    const keyStats = fs.statSync(keyPath);
    const keyMode = (keyStats.mode & parseInt('777', 8)).toString(8);
    console.log(`  ℹ Private key permissions: ${keyMode}`);

    const certStats = fs.statSync(certPath);
    const certMode = (certStats.mode & parseInt('777', 8)).toString(8);
    console.log(`  ℹ Certificate permissions: ${certMode}`);
    console.log(`  ✓ PASS: Permissions readable`);
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}`);
    return false;
  }

  // Test 3: Read certificate content
  console.log(`\n[3] Reading certificate files...`);
  let key, cert;
  try {
    key = fs.readFileSync(keyPath, 'utf8');
    console.log(`  ✓ PASS: Private key readable (${key.length} bytes)`);

    cert = fs.readFileSync(certPath, 'utf8');
    console.log(`  ✓ PASS: Certificate readable (${cert.length} bytes)`);
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}`);
    return false;
  }

  // Test 4: Validate certificate format
  console.log(`\n[4] Validating certificate format...`);
  try {
    if (!key.includes('BEGIN RSA PRIVATE KEY') && !key.includes('BEGIN PRIVATE KEY')) {
      console.log(`  ✗ FAIL: Invalid private key format`);
      return false;
    }
    console.log(`  ✓ PASS: Private key format valid`);

    if (!cert.includes('BEGIN CERTIFICATE')) {
      console.log(`  ✗ FAIL: Invalid certificate format`);
      return false;
    }
    console.log(`  ✓ PASS: Certificate format valid`);
  } catch (error) {
    console.log(`  ✗ FAIL: ${error.message}`);
    return false;
  }

  // Test 5: Create HTTPS server with certificate
  console.log(`\n[5] Creating HTTPS server...`);
  return new Promise((resolve) => {
    try {
      const httpsOptions = {
        key: key,
        cert: cert,
        requestCert: false,
        rejectUnauthorized: false
      };

      const server = https.createServer(httpsOptions, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'healthy',
          ssl: true,
          service: name
        }));
      });

      server.listen(port, '0.0.0.0', () => {
        console.log(`  ✓ PASS: HTTPS server created and listening on port ${port}`);

        // Test 6: Make HTTPS request to server
        console.log(`\n[6] Testing HTTPS request...`);
        const options = {
          hostname: 'localhost',
          port: port,
          path: '/',
          method: 'GET',
          rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.ssl === true) {
                console.log(`  ✓ PASS: HTTPS request successful`);
                console.log(`  ℹ Response: ${JSON.stringify(response)}`);
                server.close(() => {
                  console.log(`\n✅ ${name} SSL Certificate: ALL TESTS PASSED\n`);
                  resolve(true);
                });
              } else {
                console.log(`  ✗ FAIL: SSL not enabled in response`);
                server.close(() => resolve(false));
              }
            } catch (error) {
              console.log(`  ✗ FAIL: Invalid response: ${error.message}`);
              server.close(() => resolve(false));
            }
          });
        });

        req.on('error', (error) => {
          console.log(`  ✗ FAIL: Request error: ${error.message}`);
          server.close(() => resolve(false));
        });

        req.end();
      });

      server.on('error', (error) => {
        console.log(`  ✗ FAIL: Server error: ${error.message}`);
        resolve(false);
      });
    } catch (error) {
      console.log(`  ✗ FAIL: ${error.message}`);
      resolve(false);
    }
  });
}

async function runTests() {
  let allPassed = true;

  // Test Admin Server SSL
  const adminPassed = await testCertificate('Admin Server', ADMIN_SSL_DIR, 9002);
  if (!adminPassed) allPassed = false;

  // Wait a second between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test Customer Services SSL
  const customerPassed = await testCertificate('Customer Services', CUSTOMER_SSL_DIR, 9001);
  if (!customerPassed) allPassed = false;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (allPassed) {
    console.log('✅ ALL SSL CERTIFICATES VALID AND WORKING!\n');
    console.log('Your SSL certificates are properly configured and can be used by');
    console.log('Node.js HTTPS servers. The admin-server and customer-services will');
    console.log('use HTTPS when SSL_ENABLED=true in their .env files.\n');
    process.exit(0);
  } else {
    console.log('❌ SOME SSL TESTS FAILED\n');
    console.log('Please check the errors above and regenerate certificates if needed.\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
