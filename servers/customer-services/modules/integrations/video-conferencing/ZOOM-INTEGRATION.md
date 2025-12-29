# Zoom Video Conferencing Integration

Professional B2B Zoom integration for automated meeting creation, management, and cancellation.

---

## 🎯 Features

✅ **Automated Meeting Creation** - Creates Zoom meetings when consultations are booked
✅ **Server-to-Server OAuth** - No user authentication required
✅ **Meeting Management** - Update, cancel, and retrieve meeting details
✅ **Cloud Recording** - Automatically record consultations for quality assurance
✅ **Participant Reports** - Get attendance and engagement metrics
✅ **Token Caching** - Efficient OAuth token management
✅ **Error Handling** - Graceful fallbacks if Zoom fails

---

## 📋 Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Environment Variables](#environment-variables)
3. [How It Works](#how-it-works)
4. [API Reference](#api-reference)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## 🚀 Setup Instructions

### Step 1: Create Zoom Server-to-Server OAuth App

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** → **Build App**
3. Select **Server-to-Server OAuth**
4. Fill in app information:
   - App Name: `Insight Serenity Consultation Platform`
   - Company Name: `Insight Serenity`
   - Developer Contact: Your email
5. Click **Create**

### Step 2: Get Credentials

After creating the app, you'll see:
- **Account ID**
- **Client ID**
- **Client Secret**

Copy these values - you'll need them for environment variables.

### Step 3: Add Scopes

In your app settings, go to **Scopes** and add:

**Required Scopes:**
- `meeting:write:admin` - Create meetings
- `meeting:read:admin` - Read meeting details
- `meeting:update:admin` - Update meetings
- `meeting:delete:admin` - Delete meetings
- `user:read:admin` - Read user information
- `report:read:admin` - Get participant reports (optional)

Click **Add Scopes** and then **Continue**.

### Step 4: Activate App

1. Go to **Activation** tab
2. Toggle the activation switch to **Active**
3. Your app is now ready to use!

### Step 5: Configure Environment Variables

Add to `.env`:

```bash
# Zoom Server-to-Server OAuth
ZOOM_ACCOUNT_ID=your_account_id_here
ZOOM_CLIENT_ID=your_client_id_here
ZOOM_CLIENT_SECRET=your_client_secret_here

# Optional: Default host email (if consultant email not found in Zoom)
ZOOM_DEFAULT_HOST_EMAIL=admin@yourcompany.com
```

### Step 6: Verify Configuration

Run the validation test:

```javascript
const ZoomService = require('./modules/integrations/video-conferencing/zoom-service');

// Test configuration
const isValid = await ZoomService.validateConfiguration();
console.log('Zoom configured:', isValid);
```

---

## 🔐 Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ZOOM_ACCOUNT_ID` | ✅ Yes | Your Zoom account ID | `abc123def456` |
| `ZOOM_CLIENT_ID` | ✅ Yes | OAuth client ID | `xyz789uvw012` |
| `ZOOM_CLIENT_SECRET` | ✅ Yes | OAuth client secret | `secret_key_here` |
| `ZOOM_DEFAULT_HOST_EMAIL` | ⚠️ Recommended | Fallback host email | `admin@company.com` |

**Security Note:** Never commit `.env` files to version control!

---

## 🔄 How It Works

### Consultation Booking Flow

```
1. Client books consultation
   ↓
2. Consultation saved to database
   ↓
3. ZoomService.createMeeting() called
   ↓
4. OAuth token obtained (cached for 1 hour)
   ↓
5. Zoom API creates meeting
   ↓
6. Meeting details saved to consultation.location
   ↓
7. Email sent with Zoom link
```

### Meeting Creation Logic

```javascript
// In consultation-service.js

if (consultationData.location?.type === 'remote' || !consultationData.location) {
    const zoomMeeting = await ZoomService.createMeeting({
        topic: consultationData.title,
        startTime: consultationData.scheduledStart,
        duration: 60, // minutes
        hostEmail: consultant.email,
        settings: {
            waitingRoom: true,
            autoRecording: 'cloud'
        }
    });

    // Save meeting details
    consultation.location = {
        type: 'remote',
        platform: 'zoom',
        meetingId: zoomMeeting.meetingId,
        meetingUrl: zoomMeeting.joinUrl,
        meetingPassword: zoomMeeting.password
    };
}
```

### Cancellation Flow

```
1. Consultation cancelled
   ↓
2. Check if Zoom meeting exists
   ↓
3. ZoomService.deleteMeeting() called
   ↓
4. Zoom meeting cancelled
   ↓
5. Cancellation email sent
```

---

## 📚 API Reference

### ZoomService Methods

#### `createMeeting(meetingData)`

Creates a scheduled Zoom meeting.

**Parameters:**
```javascript
{
  topic: 'Strategic Planning Session',        // Meeting title
  agenda: 'Discuss Q1 strategy',             // Meeting description
  startTime: new Date('2025-01-15T14:00:00'), // Start time
  duration: 60,                               // Duration in minutes
  timezone: 'America/New_York',               // Timezone
  hostEmail: 'consultant@company.com',        // Zoom host email
  settings: {
    hostVideo: true,                          // Host video on
    participantVideo: true,                   // Participant video on
    joinBeforeHost: false,                    // Allow join before host
    muteUponEntry: true,                      // Mute on entry
    waitingRoom: true,                        // Enable waiting room
    autoRecording: 'cloud'                    // cloud | local | none
  }
}
```

**Returns:**
```javascript
{
  meetingId: '12345678901',
  hostId: 'abc123',
  topic: 'Strategic Planning Session',
  startTime: '2025-01-15T14:00:00Z',
  duration: 60,
  timezone: 'America/New_York',
  joinUrl: 'https://zoom.us/j/12345678901?pwd=...',
  startUrl: 'https://zoom.us/s/12345678901?...',
  password: 'abc123',
  createdAt: '2025-01-10T10:00:00Z'
}
```

---

#### `getMeeting(meetingId)`

Get meeting details.

**Parameters:**
- `meetingId` (string) - Zoom meeting ID

**Returns:** Meeting object

---

#### `updateMeeting(meetingId, updates)`

Update meeting details.

**Parameters:**
```javascript
{
  topic: 'New Title',                         // Optional
  agenda: 'Updated agenda',                   // Optional
  startTime: new Date('2025-01-16T14:00:00'), // Optional
  duration: 90,                               // Optional
  settings: { ... }                           // Optional
}
```

---

#### `deleteMeeting(meetingId, options)`

Cancel/delete a meeting.

**Parameters:**
```javascript
{
  notifyHosts: true,        // Send email to hosts
  notifyRegistrants: false  // Send email to registrants
}
```

---

#### `listMeetings(userId, options)`

List scheduled meetings for a user.

**Parameters:**
```javascript
{
  type: 'scheduled',  // scheduled | live | upcoming
  pageSize: 30,       // Results per page
  pageNumber: 1       // Page number
}
```

---

#### `getParticipantReport(meetingId)`

Get participant report after meeting ends.

**Returns:**
```javascript
{
  meetingId: '12345678901',
  totalParticipants: 2,
  participants: [
    {
      userId: 'user123',
      name: 'John Doe',
      email: 'john@company.com',
      joinTime: '2025-01-15T14:00:00Z',
      leaveTime: '2025-01-15T15:00:00Z',
      duration: 60,
      attentiveness_score: 95
    }
  ]
}
```

---

## 🧪 Testing

### Manual Test - Create Meeting

```javascript
const ZoomService = require('./modules/integrations/video-conferencing/zoom-service');

async function testZoom() {
  try {
    // Test configuration
    const isValid = await ZoomService.validateConfiguration();
    console.log('✓ Configuration valid:', isValid);

    // Create test meeting
    const meeting = await ZoomService.createMeeting({
      topic: 'Test Consultation',
      agenda: 'Testing Zoom integration',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      duration: 30,
      timezone: 'America/New_York',
      hostEmail: 'your-email@company.com',
      settings: {
        waitingRoom: true,
        autoRecording: 'cloud'
      }
    });

    console.log('✓ Meeting created:');
    console.log('  Meeting ID:', meeting.meetingId);
    console.log('  Join URL:', meeting.joinUrl);
    console.log('  Password:', meeting.password);

    // Get meeting details
    const details = await ZoomService.getMeeting(meeting.meetingId);
    console.log('✓ Meeting details retrieved');

    // Delete meeting
    await ZoomService.deleteMeeting(meeting.meetingId);
    console.log('✓ Meeting deleted');

  } catch (error) {
    console.error('✗ Test failed:', error.message);
  }
}

testZoom();
```

### Integration Test - Full Flow

```bash
# 1. Book consultation (triggers Zoom creation)
curl -X POST http://localhost:3001/api/consultations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "clientId": "client_id_here",
    "consultantId": "consultant_id_here",
    "title": "Test Consultation",
    "type": "strategy",
    "scheduledStart": "2025-01-15T14:00:00Z",
    "scheduledEnd": "2025-01-15T15:00:00Z",
    "location": { "type": "remote" }
  }'

# 2. Check consultation has Zoom link
# Response should include:
# {
#   "location": {
#     "type": "remote",
#     "platform": "zoom",
#     "meetingUrl": "https://zoom.us/j/..."
#   }
# }

# 3. Cancel consultation (triggers Zoom cancellation)
curl -X POST http://localhost:3001/api/consultations/{id}/cancel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{ "reason": "Testing cancellation" }'
```

---

## 🔧 Troubleshooting

### Error: "Failed to authenticate with Zoom"

**Cause:** Invalid credentials or inactive app

**Solution:**
1. Verify `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` in `.env`
2. Check app is **Active** in Zoom Marketplace
3. Ensure credentials are from **Server-to-Server OAuth** (not OAuth)

---

### Error: "User not found by email"

**Cause:** Consultant email not in Zoom account

**Solution:**
1. Set `ZOOM_DEFAULT_HOST_EMAIL` in `.env` to account owner email
2. Or add consultants as licensed users in Zoom

---

### Error: "Insufficient scopes"

**Cause:** Missing required scopes

**Solution:**
1. Go to app settings → **Scopes**
2. Add all required scopes listed above
3. Reactivate the app

---

### Meetings not being created

**Check logs:**
```bash
# Look for Zoom-related errors
tail -f logs/customer-services.log | grep -i zoom
```

**Common issues:**
- Consultation `location.type` not set to `'remote'`
- Consultant email invalid
- Zoom credentials not configured

---

## 📊 Integration Status

| Feature | Status | Location |
|---------|--------|----------|
| Zoom Service | ✅ Complete | `zoom-service.js` |
| Auto Meeting Creation | ✅ Complete | `consultation-service.js:310-362` |
| Auto Meeting Cancellation | ✅ Complete | `consultation-service.js:997-1016` |
| Meeting Updates | ⚠️ Partial | Not hooked to reschedule flow |
| Participant Reports | ✅ Complete | `zoom-service.js:getParticipantReport()` |
| Cloud Recording | ✅ Complete | Auto-enabled in settings |

---

## 🎯 Next Steps

### Recommended Enhancements

1. **Reschedule Integration** - Update Zoom meeting when consultation is rescheduled
2. **Recording Access** - Download and attach recordings to consultations
3. **Participant Analytics** - Track attendance and engagement scores
4. **Waiting Room Management** - Custom waiting room messages
5. **Breakout Rooms** - Support for multi-participant sessions

### Implementation Example - Reschedule

```javascript
// In rescheduleConsultation() method

if (consultation.location?.platform === 'zoom' && consultation.location?.meetingId) {
  await ZoomService.updateMeeting(consultation.location.meetingId, {
    startTime: newStartTime,
    duration: newDuration
  });
}
```

---

## 📝 Best Practices

✅ **DO:**
- Use `autoRecording: 'cloud'` for quality assurance
- Enable `waitingRoom` for security
- Set `muteUponEntry: true` for large meetings
- Cache OAuth tokens (handled automatically)
- Log all Zoom operations

❌ **DON'T:**
- Commit Zoom credentials to git
- Skip error handling
- Create meetings without timezone
- Allow `joinBeforeHost` for sensitive sessions

---

## 🔒 Security Considerations

1. **OAuth Tokens** - Cached in memory, expire after 1 hour
2. **Meeting Passwords** - Auto-generated and stored securely
3. **Waiting Rooms** - Enabled by default to prevent unauthorized access
4. **Recording** - Stored in Zoom cloud, access controlled
5. **Credentials** - Never logged or exposed in API responses

---

## 📞 Support

- **Zoom API Docs:** https://developers.zoom.us/docs/api/
- **Zoom Support:** https://support.zoom.us/
- **Internal Issues:** Check server logs in `logs/customer-services.log`

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Status:** Production Ready ✅
