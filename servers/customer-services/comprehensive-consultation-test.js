const axios = require('axios');
const mongoose = require('mongoose');

const API_BASE = 'http://localhost:3001/api/v1';
const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

// Test data
const clientData = {
  email: `test.client.${Date.now()}@example.com`,
  password: 'TestClient123!',
  profile: {
    firstName: 'Test',
    lastName: 'Client'
  },
  userType: 'client'
};

const consultantData = {
  email: `test.consultant.${Date.now()}@example.com`,
  password: 'TestConsultant123!',
  profile: {
    firstName: 'Test',
    lastName: 'Consultant'
  },
  userType: 'consultant'
};

let testResults = {
  passed: [],
  failed: [],
  warnings: []
};

function logSuccess(message) {
  console.log(`✅ ${message}`);
  testResults.passed.push(message);
}

function logError(message, error) {
  console.log(`❌ ${message}`);
  if (error?.response) {
    console.log(`   Status: ${error.response.status}`);
    console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
  } else {
    console.log(`   Error: ${error?.message || error}`);
  }
  testResults.failed.push({ message, error: error?.response?.data || error?.message });
}

function logWarning(message) {
  console.log(`⚠️  ${message}`);
  testResults.warnings.push(message);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

async function getVerificationToken(email) {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('   📊 MongoDB connection established');
    }

    // Check if model already exists
    let User;
    if (mongoose.models.User) {
      User = mongoose.models.User;
    } else {
      User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    }

    const user = await User.findOne({ email });

    if (!user) {
      throw new Error(`User not found in database with email: ${email}`);
    }

    // Convert to plain object to ensure proper data access
    const userObj = user.toObject();

    console.log(`   📧 User found with ID: ${userObj._id}`);
    console.log(`   🔑 Verification object exists: ${!!userObj.verification}`);
    console.log(`   🔑 Email verification exists: ${!!userObj.verification?.email}`);
    console.log(`   🔑 Token exists: ${!!userObj.verification?.email?.token}`);

    const token = userObj.verification?.email?.token || userObj.emailVerification?.verificationToken;

    if (!token) {
      console.error('   ❌ Token not found in expected locations');
      console.error('   Verification structure:', JSON.stringify(userObj.verification, null, 2));
    }

    return { token, userId: userObj._id.toString() };
  } catch (error) {
    console.error('   ❌ getVerificationToken error:', error.message);
    throw error;
  }
}

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     COMPREHENSIVE CONSULTATION BACKEND TEST SUITE        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let clientToken = null;
  let consultantToken = null;
  let clientUserId = null;
  let consultantUserId = null;
  let consultantId = null;
  let freeTrialPackageId = null;
  let paidPackageId = null;
  let freeTrialConsultationId = null;
  let paidConsultationId = null;

  // ============================================================
  // STEP 1: REGISTER CLIENT USER
  // ============================================================
  console.log('\n📝 STEP 1: Registering Client User');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.post(`${API_BASE}/auth/register`, clientData);
    clientUserId = response.data.user?.id || response.data.user?._id;
    logSuccess(`Client registered: ${clientData.email}`);
    logInfo(`   User ID: ${clientUserId}`);
  } catch (error) {
    logError('Failed to register client', error);
    return;
  }

  // ============================================================
  // STEP 2: REGISTER CONSULTANT USER (with retry for transient errors)
  // ============================================================
  console.log('\n📝 STEP 2: Registering Consultant User');
  console.log('─────────────────────────────────────────────────────────');
  let consultantRetries = 0;
  while (consultantRetries < 3) {
    try {
      const response = await axios.post(`${API_BASE}/auth/register`, consultantData);
      consultantUserId = response.data.user?.id || response.data.user?._id;
      logSuccess(`Consultant registered: ${consultantData.email}`);
      logInfo(`   User ID: ${consultantUserId}`);
      break;
    } catch (error) {
      const isTransientError = error?.response?.data?.error?.message?.includes('catalog changes') ||
                               error?.response?.data?.error?.message?.includes('retry');
      if (isTransientError && consultantRetries < 2) {
        consultantRetries++;
        logWarning(`Transient error, retrying (attempt ${consultantRetries + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        continue;
      }
      logError('Failed to register consultant', error);
      return;
    }
  }

  // ============================================================
  // STEP 3: GET VERIFICATION TOKENS FROM DATABASE
  // ============================================================
  console.log('\n🔍 STEP 3: Getting Verification Tokens from Database');
  console.log('─────────────────────────────────────────────────────────');

  // Add delay to ensure database writes complete
  logInfo('Waiting 2 seconds for database writes to complete...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  let clientVerificationToken, consultantVerificationToken;

  try {
    logInfo(`Looking for client with email: ${clientData.email}`);
    const clientTokenData = await getVerificationToken(clientData.email);
    clientVerificationToken = clientTokenData.token;
    clientUserId = clientTokenData.userId; // Update userId from database
    logSuccess('Retrieved client verification token');
    logInfo(`   Token: ${clientVerificationToken ? clientVerificationToken.substring(0, 20) + '...' : 'UNDEFINED'}`);
    logInfo(`   User ID from DB: ${clientUserId}`);

    if (!clientVerificationToken) {
      throw new Error('Client verification token is undefined');
    }
  } catch (error) {
    logError('Failed to get client verification token', error);
    return;
  }

  try {
    logInfo(`Looking for consultant with email: ${consultantData.email}`);
    const consultantTokenData = await getVerificationToken(consultantData.email);
    consultantVerificationToken = consultantTokenData.token;
    consultantUserId = consultantTokenData.userId; // Update userId from database
    logSuccess('Retrieved consultant verification token');
    logInfo(`   Token: ${consultantVerificationToken ? consultantVerificationToken.substring(0, 20) + '...' : 'UNDEFINED'}`);
    logInfo(`   User ID from DB: ${consultantUserId}`);

    if (!consultantVerificationToken) {
      throw new Error('Consultant verification token is undefined');
    }
  } catch (error) {
    logError('Failed to get consultant verification token', error);
    return;
  }

  // ============================================================
  // STEP 4: VERIFY CLIENT EMAIL
  // ============================================================
  console.log('\n✉️  STEP 4: Verifying Client Email');
  console.log('─────────────────────────────────────────────────────────');
  try {
    await axios.post(`${API_BASE}/auth/verify/email`, {
      token: clientVerificationToken
    });
    logSuccess('Client email verified');
  } catch (error) {
    logError('Failed to verify client email', error);
    return;
  }

  // ============================================================
  // STEP 5: VERIFY CONSULTANT EMAIL
  // ============================================================
  console.log('\n✉️  STEP 5: Verifying Consultant Email');
  console.log('─────────────────────────────────────────────────────────');
  try {
    await axios.post(`${API_BASE}/auth/verify/email`, {
      token: consultantVerificationToken
    });
    logSuccess('Consultant email verified');
  } catch (error) {
    logError('Failed to verify consultant email', error);
    return;
  }

  // ============================================================
  // STEP 6: ADD CONSULTANT ROLE TO CONSULTANT USER
  // ============================================================
  console.log('\n🔐 STEP 6: Adding Consultant Role');
  console.log('─────────────────────────────────────────────────────────');
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    // Check if model already exists
    let User;
    if (mongoose.models.User) {
      User = mongoose.models.User;
    } else {
      User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    }

    const user = await User.findOne({ email: consultantData.email });

    if (!user) {
      throw new Error('Consultant user not found');
    }

    if (!user.roles.includes('consultant')) {
      user.roles.push('consultant');
      await user.save();
      logSuccess('Added consultant role to user');
    } else {
      logInfo('User already has consultant role');
    }

    consultantId = user.consultantId?.toString();
    logInfo(`   Consultant ID: ${consultantId}`);
  } catch (error) {
    logError('Failed to add consultant role', error);
    return;
  }

  // ============================================================
  // STEP 7: ADD CLIENT ROLE TO CLIENT USER
  // ============================================================
  console.log('\n🔐 STEP 7: Adding Client Role');
  console.log('─────────────────────────────────────────────────────────');
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    // Check if model already exists
    let User;
    if (mongoose.models.User) {
      User = mongoose.models.User;
    } else {
      User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    }

    const user = await User.findOne({ email: clientData.email });

    if (!user) {
      throw new Error('Client user not found');
    }

    if (!user.roles.includes('client')) {
      user.roles.push('client');
      await user.save();
      logSuccess('Added client role to user');
    } else {
      logInfo('User already has client role');
    }
  } catch (error) {
    logError('Failed to add client role', error);
    return;
  }

  // ============================================================
  // STEP 8: LOGIN AS CLIENT
  // ============================================================
  console.log('\n🔑 STEP 8: Logging in as Client');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: clientData.email,
      password: clientData.password
    });

    // Debug: log response structure
    console.log('   🔍 Login response keys:', Object.keys(response.data));

    clientToken = response.data.data?.tokens?.accessToken ||
                 response.data.tokens?.accessToken ||
                 response.data.accessToken ||
                 response.data.data?.accessToken ||
                 response.data.token ||
                 response.data.data?.token;

    logSuccess('Client logged in successfully');
    logInfo(`   Token: ${clientToken ? clientToken.substring(0, 30) + '...' : 'UNDEFINED'}`);

    if (!clientToken) {
      console.error('   ❌ Token not found in response. Response data:', JSON.stringify(response.data, null, 2));
      throw new Error('Login token not found in response');
    }
  } catch (error) {
    logError('Failed to login as client', error);
    return;
  }

  // ============================================================
  // STEP 9: GET CONSULTATION PACKAGES
  // ============================================================
  console.log('\n📦 STEP 9: Getting Consultation Packages');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.get(`${API_BASE}/billing/packages`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });

    const packages = response.data.data || response.data;

    // Find free trial package
    freeTrialPackageId = packages.find(p => p.details?.type === 'free_trial')?._id;
    // Find paid package
    paidPackageId = packages.find(p => p.details?.type === 'pay_per_use' || p.details?.type === 'consultation_bundle')?._id;

    logSuccess(`Found ${packages.length} consultation packages`);
    logInfo(`   Free Trial Package ID: ${freeTrialPackageId || 'NOT FOUND'}`);
    logInfo(`   Paid Package ID: ${paidPackageId || 'NOT FOUND'}`);

    if (!freeTrialPackageId) {
      logWarning('No free trial package found');
    }
    if (!paidPackageId) {
      logWarning('No paid package found');
    }
  } catch (error) {
    logError('Failed to get consultation packages', error);
    return;
  }

  // ============================================================
  // STEP 10: BOOK FREE TRIAL CONSULTATION
  // ============================================================
  if (freeTrialPackageId && consultantId) {
    console.log('\n📅 STEP 10: Booking Free Trial Consultation');
    console.log('─────────────────────────────────────────────────────────');
    try {
      const scheduledStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Tomorrow
      const scheduledEnd = new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(); // Tomorrow + 1 hour

      const response = await axios.post(
        `${API_BASE}/consultations/book-with-package`,
        {
          packageId: freeTrialPackageId,
          consultantId: consultantId,
          scheduledStart,
          scheduledEnd,
          title: 'Free Trial Consultation Test',
          description: 'Automated test booking for free trial',
          type: 'general_consultation',
          timezone: 'UTC'
        },
        { headers: { Authorization: `Bearer ${clientToken}` } }
      );

      freeTrialConsultationId = response.data.data?._id || response.data._id;
      logSuccess('Free trial consultation booked');
      logInfo(`   Consultation ID: ${freeTrialConsultationId}`);
      logInfo(`   Scheduled: ${new Date(scheduledStart).toLocaleString()}`);
    } catch (error) {
      logError('Failed to book free trial consultation', error);
    }
  } else {
    logWarning('Skipping free trial booking - missing package ID or consultant ID');
  }

  // ============================================================
  // STEP 11: BOOK PAID CONSULTATION
  // ============================================================
  if (paidPackageId && consultantId) {
    console.log('\n💳 STEP 11: Booking Paid Consultation');
    console.log('─────────────────────────────────────────────────────────');
    try {
      const scheduledStart = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // Day after tomorrow
      const scheduledEnd = new Date(Date.now() + 48 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();

      const response = await axios.post(
        `${API_BASE}/consultations/book-with-package`,
        {
          packageId: paidPackageId,
          consultantId: consultantId,
          scheduledStart,
          scheduledEnd,
          title: 'Paid Consultation Test',
          description: 'Automated test booking for paid consultation',
          type: 'strategy_session',
          timezone: 'UTC'
        },
        { headers: { Authorization: `Bearer ${clientToken}` } }
      );

      paidConsultationId = response.data.data?._id || response.data._id;
      logSuccess('Paid consultation booked');
      logInfo(`   Consultation ID: ${paidConsultationId}`);
      logInfo(`   Scheduled: ${new Date(scheduledStart).toLocaleString()}`);
    } catch (error) {
      logError('Failed to book paid consultation', error);
    }
  } else {
    logWarning('Skipping paid consultation booking - missing package ID or consultant ID');
  }

  // ============================================================
  // STEP 12: VERIFY CLIENT CAN SEE THEIR CONSULTATIONS
  // ============================================================
  console.log('\n👁️  STEP 12: Verifying Client Can See Their Consultations');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.get(`${API_BASE}/consultations/me`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });

    const consultations = response.data.data?.data || response.data.data || response.data;
    logSuccess(`Client can see ${consultations.length} consultation(s)`);

    consultations.forEach((c, i) => {
      logInfo(`   ${i + 1}. ${c.details?.title} - Status: ${c.status?.current}`);
    });

    if (freeTrialConsultationId) {
      const foundFreeTrial = consultations.find(c => c._id === freeTrialConsultationId);
      if (foundFreeTrial) {
        logSuccess('✓ Free trial consultation found in client list');
      } else {
        logError('Free trial consultation NOT found in client list');
      }
    }

    if (paidConsultationId) {
      const foundPaid = consultations.find(c => c._id === paidConsultationId);
      if (foundPaid) {
        logSuccess('✓ Paid consultation found in client list');
      } else {
        logError('Paid consultation NOT found in client list');
      }
    }
  } catch (error) {
    logError('Failed to get client consultations', error);
  }

  // ============================================================
  // STEP 13: LOGIN AS CONSULTANT
  // ============================================================
  console.log('\n🔑 STEP 13: Logging in as Consultant');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: consultantData.email,
      password: consultantData.password
    });

    // Debug: log response structure
    console.log('   🔍 Login response keys:', Object.keys(response.data));

    consultantToken = response.data.data?.tokens?.accessToken ||
                     response.data.tokens?.accessToken ||
                     response.data.accessToken ||
                     response.data.data?.accessToken ||
                     response.data.token ||
                     response.data.data?.token;

    logSuccess('Consultant logged in successfully');
    logInfo(`   Token: ${consultantToken ? consultantToken.substring(0, 30) + '...' : 'UNDEFINED'}`);

    if (!consultantToken) {
      console.error('   ❌ Token not found in response. Response data:', JSON.stringify(response.data, null, 2));
      throw new Error('Login token not found in response');
    }
  } catch (error) {
    logError('Failed to login as consultant', error);
    return;
  }

  // ============================================================
  // STEP 14: VERIFY CONSULTANT CAN SEE CONSULTATIONS
  // ============================================================
  console.log('\n👁️  STEP 14: Verifying Consultant Can See Consultations');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.get(`${API_BASE}/consultations/me`, {
      headers: { Authorization: `Bearer ${consultantToken}` }
    });

    const consultations = response.data.data?.data || response.data.data || response.data;
    logSuccess(`Consultant can see ${consultations.length} consultation(s)`);

    consultations.forEach((c, i) => {
      logInfo(`   ${i + 1}. ${c.details?.title} - Status: ${c.status?.current}`);
    });

    if (freeTrialConsultationId) {
      const foundFreeTrial = consultations.find(c => c._id === freeTrialConsultationId);
      if (foundFreeTrial) {
        logSuccess('✓ Free trial consultation found in consultant list');
      } else {
        logError('Free trial consultation NOT found in consultant list');
      }
    }

    if (paidConsultationId) {
      const foundPaid = consultations.find(c => c._id === paidConsultationId);
      if (foundPaid) {
        logSuccess('✓ Paid consultation found in consultant list');
      } else {
        logError('Paid consultation NOT found in consultant list');
      }
    }
  } catch (error) {
    logError('Failed to get consultant consultations', error);
  }

  // ============================================================
  // STEP 15: TEST CREDIT BALANCE
  // ============================================================
  console.log('\n💰 STEP 15: Checking Client Credit Balance');
  console.log('─────────────────────────────────────────────────────────');
  try {
    const response = await axios.get(`${API_BASE}/billing/credits/balance`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });

    const balance = response.data.data || response.data;
    logSuccess('Retrieved client credit balance');
    logInfo(`   Available Credits: ${balance.availableCredits}`);
    logInfo(`   Free Trial Used: ${balance.freeTrial?.used}`);
    logInfo(`   Lifetime Consultations: ${balance.lifetime?.totalConsultations}`);
  } catch (error) {
    logError('Failed to get credit balance', error);
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY REPORT                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`✅ PASSED: ${testResults.passed.length} tests`);
  console.log(`❌ FAILED: ${testResults.failed.length} tests`);
  console.log(`⚠️  WARNINGS: ${testResults.warnings.length} warnings\n`);

  if (testResults.failed.length > 0) {
    console.log('Failed Tests:');
    testResults.failed.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.message}`);
      if (f.error) {
        console.log(`     ${JSON.stringify(f.error, null, 2).substring(0, 200)}...`);
      }
    });
    console.log('');
  }

  if (testResults.warnings.length > 0) {
    console.log('Warnings:');
    testResults.warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. ${w}`);
    });
    console.log('');
  }

  const successRate = ((testResults.passed.length / (testResults.passed.length + testResults.failed.length)) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate}%\n`);

  if (testResults.failed.length === 0) {
    console.log('🎉 ALL TESTS PASSED! Backend is working correctly.\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Please review the errors above.\n');
  }

  // Close mongoose connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('Closed database connection.\n');
  }

  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run the tests
runTests().catch((error) => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
