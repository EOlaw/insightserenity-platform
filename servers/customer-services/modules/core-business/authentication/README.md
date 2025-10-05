# Authentication Module - Complete Implementation Guide

## 📁 File Structure & Locations

### Controllers (Complete ✅)
Place these files in: `servers/customer-services/modules/core-business/authentication/controllers/`

1. **auth-controller.js** - Main authentication operations
   - `registerUser()` - User registration
   - `loginUser()` - User login
   - `logoutUser()` - Single session logout
   - `logoutAllSessions()` - Logout from all devices
   - `refreshAccessToken()` - Refresh JWT token
   - `getCurrentUser()` - Get authenticated user info
   - `verifyEmail()` - Verify email with token
   - `resendEmailVerification()` - Resend verification email

2. **mfa-controller.js** - Multi-Factor Authentication
   - `setupTotpMfa()` - Setup authenticator app
   - `setupSmsMfa()` - Setup SMS-based MFA
   - `setupEmailMfa()` - Setup email-based MFA
   - `verifyMfaSetup()` - Verify MFA during setup
   - `challengeMfa()` - Verify MFA during login
   - `disableMfa()` - Disable MFA method
   - `getMfaMethods()` - Get enabled MFA methods
   - `getBackupCodes()` - Get backup codes
   - `regenerateBackupCodes()` - Generate new backup codes

3. **password-controller.js** - Password management
   - `requestPasswordReset()` - Request password reset
   - `resetPassword()` - Reset password with token
   - `changePassword()` - Change password (authenticated)
   - `validatePassword()` - Validate password strength
   - `getPasswordRequirements()` - Get password requirements
   - `updatePasswordExpiry()` - Update expiry settings (admin)
   - `forcePasswordReset()` - Force user password reset (admin)

4. **session-controller.js** - Session management
   - `listActiveSessions()` - List all active sessions
   - `getSessionDetails()` - Get specific session details
   - `terminateSession()` - Terminate specific session
   - `terminateAllSessions()` - Terminate all sessions
   - `getSessionStatistics()` - Get session statistics
   - `refreshSessionActivity()` - Update session activity
   - `reportSuspiciousSession()` - Report suspicious session

5. **oauth-controller.js** - OAuth authentication
   - `initiateGitHubAuth()` - Start GitHub OAuth
   - `handleGitHubCallback()` - Handle GitHub callback
   - `initiateLinkedInAuth()` - Start LinkedIn OAuth
   - `handleLinkedInCallback()` - Handle LinkedIn callback
   - `initiateGoogleAuth()` - Start Google OAuth
   - `handleGoogleCallback()` - Handle Google callback
   - `linkOAuthAccount()` - Link OAuth to existing account
   - `unlinkOAuthAccount()` - Unlink OAuth account
   - `getLinkedAccounts()` - Get linked OAuth accounts

6. **verification-controller.js** - Email/phone verification
   - `verifyEmail()` - Verify email with token
   - `verifyEmailWithCode()` - Verify email with code
   - `resendEmailVerification()` - Resend email verification
   - `checkEmailVerificationStatus()` - Check email status
   - `sendPhoneVerificationCode()` - Send phone verification
   - `verifyPhone()` - Verify phone with code
   - `checkPhoneVerificationStatus()` - Check phone status
   - `resendPhoneVerificationCode()` - Resend phone code
   - `verifyDocument()` - Verify identity document (KYC)
   - `getVerificationStatus()` - Get all verification statuses

---

### DTOs (Complete ✅)
Place these files in: `servers/customer-services/modules/core-business/authentication/dto/`

1. **auth-response.dto.js** - Authentication response formatting
   - `formatRegistrationResponse()` - Format registration response
   - `formatLoginResponse()` - Format login response
   - `formatMfaChallengeResponse()` - Format MFA challenge
   - `formatTokenRefreshResponse()` - Format token refresh
   - `formatPasswordResetRequestResponse()` - Format password reset request
   - `formatPasswordResetResponse()` - Format password reset
   - `formatPasswordChangeResponse()` - Format password change
   - `formatEmailVerificationResponse()` - Format email verification
   - `formatMfaSetupResponse()` - Format MFA setup
   - `formatSessionListResponse()` - Format session list
   - `formatOAuthLinkResponse()` - Format OAuth link
   - `formatErrorResponse()` - Format error response
   - `formatSuccessResponse()` - Format success response

2. **user-response.dto.js** - User data formatting
   - `format()` - Full user formatting
   - `formatBasic()` - Minimal user info
   - `formatPublic()` - Public profile formatting
   - `formatListItem()` - List item formatting
   - `formatMany()` - Format multiple users
   - `formatWithContext()` - Format with additional context
   - `sanitizeForLogging()` - Sanitize for logs

---

### Services (Complete ✅)
Place these files in their respective locations:

1. **customer-auth-service.js** - Already provided
   - Location: `servers/customer-services/modules/core-business/authentication/services/`
   - Orchestrates authentication with customer-specific business logic

2. **notification-service.js** (STUB) - Needs implementation
   - Location: `servers/customer-services/modules/core-business/notifications/services/`
   - `sendEmail()` - Send email notifications
   - `sendSMS()` - Send SMS notifications
   - `sendPushNotification()` - Send push notifications
   - `getPendingNotifications()` - Get pending notifications
   - `subscribeToChannels()` - Subscribe to notification channels
   - `markAsRead()` - Mark notification as read

3. **analytics-service.js** (STUB) - Needs implementation
   - Location: `servers/customer-services/modules/core-business/analytics/services/`
   - `track()` - Track events
   - `identify()` - Identify users
   - `page()` - Track page views
   - `trackFunnel()` - Track conversion funnels
   - `trackRevenue()` - Track revenue
   - `createCohort()` - Create user cohorts
   - `getUserAnalytics()` - Get user analytics
   - `getReport()` - Generate analytics reports

4. **onboarding-service.js** (STUB) - Needs implementation
   - Location: `servers/customer-services/modules/core-business/onboarding/services/`
   - `createOnboarding()` - Create onboarding workflow
   - `getOnboarding()` - Get onboarding data
   - `updateProgress()` - Update step progress
   - `skipStep()` - Skip onboarding step
   - `completeOnboarding()` - Complete onboarding
   - `resetOnboarding()` - Reset onboarding
   - `getOnboardingStats()` - Get statistics

---

## 🔧 What's Already Implemented

### ✅ Complete
- All 6 controller files with comprehensive methods
- 2 DTO files for response formatting
- 1 main orchestration service (customer-auth-service.js)
- 3 stub services (notification, analytics, onboarding)

### 🔨 Stub Services (Need Implementation)
The following services are **stubs** with function signatures but need actual implementation:

1. **Notification Service**
   - Integrate with email provider (SendGrid, Mailgun, AWS SES)
   - Integrate with SMS provider (Twilio, AWS SNS)
   - Integrate with push notification service (FCM, APNS)
   - Implement template rendering
   - Store notification history in database

2. **Analytics Service**
   - Integrate with analytics providers (Segment, Mixpanel, Google Analytics)
   - Implement event batching and queuing
   - Store events in database
   - Implement reporting and aggregation

3. **Onboarding Service**
   - Implement database models for onboarding
   - Create onboarding workflows
   - Track step completion
   - Implement progress calculation
   - Store onboarding data

---

## 📋 Next Steps

### 1. Create Route Files
You need to create the route files that connect controllers to endpoints.

**Create: `servers/customer-services/modules/core-business/authentication/routes/`**

```javascript
// auth-routes.js
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth-controller');
const { validateRegistration, validateLogin } = require('../validators/auth-validators');

router.post('/register', validateRegistration, AuthController.registerUser);
router.post('/login', validateLogin, AuthController.loginUser);
router.post('/logout', authenticate(), AuthController.logoutUser);
router.post('/logout-all', authenticate(), AuthController.logoutAllSessions);
router.post('/refresh', AuthController.refreshAccessToken);
router.get('/me', authenticate(), AuthController.getCurrentUser);
router.post('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', AuthController.resendEmailVerification);

module.exports = router;
```

### 2. Create Validator Files
Create input validation using express-validator or Joi.

**Create: `servers/customer-services/modules/core-business/authentication/validators/`**

```javascript
// auth-validators.js
const { body } = require('express-validator');

exports.validateRegistration = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').optional().trim().isLength({ min: 1 }),
    body('lastName').optional().trim().isLength({ min: 1 })
];

exports.validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];
```

### 3. Create Middleware Files
Create authentication and authorization middleware.

**Create: `servers/customer-services/modules/core-business/authentication/middlewares/`**

```javascript
// authenticate.js
const jwt = require('jsonwebtoken');
const { AppError } = require('../../../../../shared/lib/utils/app-error');

module.exports = function authenticate() {
    return async (req, res, next) => {
        try {
            const token = req.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Attach user to request
            req.user = decoded;
            req.session = { id: decoded.sessionId };
            
            next();
        } catch (error) {
            next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
        }
    };
};
```

### 4. Mount Routes in Main App
In your main app.js file:

```javascript
// app.js
const authRoutes = require('./modules/core-business/authentication/routes');

// Mount authentication routes
app.use('/api/auth', authRoutes);
```

### 5. Implement Shared Services
The controllers rely on shared services that should exist in:
- `shared/lib/auth/services/auth-service.js`
- `shared/lib/auth/services/token-service.js`
- `shared/lib/auth/services/session-service.js`
- `shared/lib/auth/services/two-factor-service.js`
- `shared/lib/auth/services/password-service.js`
- `shared/lib/auth/services/oauth-service.js`
- `shared/lib/auth/services/verification-service.js`

Make sure these services are implemented or create them if they don't exist.

### 6. Create Database Models
Create models for:
- Users
- Sessions
- MFA configurations
- OAuth connections
- Verification tokens
- Onboarding progress
- Notifications
- Analytics events

### 7. Implement Stub Services
Complete the three stub services:
1. Notification Service - Add email/SMS provider integration
2. Analytics Service - Add analytics provider integration
3. Onboarding Service - Add database operations and workflow logic

---

## 🎯 Testing the Implementation

### Test Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant123" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant123" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### Test Get Current User
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 📝 Summary

### ✅ What You Have
- **6 complete controllers** with all methods implemented
- **2 DTOs** for consistent response formatting
- **1 orchestration service** (customer-auth-service.js)
- **3 stub services** with method signatures

### 🔨 What You Need to Do
1. Create route files
2. Create validator files
3. Create middleware files
4. Mount routes in app.js
5. Implement or verify shared services exist
6. Create database models
7. Complete stub service implementations
8. Add tests

### 🎉 Result
Once complete, you'll have a production-ready authentication system with:
- User registration and login
- Multi-factor authentication (TOTP, SMS, Email)
- OAuth integration (GitHub, LinkedIn, Google)
- Password management
- Session management
- Email/phone verification
- Customer-specific workflows
- Analytics tracking
- Onboarding flows

---

## 📞 Support

If you encounter any issues or need clarification on implementation details, refer to the comments in each file or check the shared services documentation.