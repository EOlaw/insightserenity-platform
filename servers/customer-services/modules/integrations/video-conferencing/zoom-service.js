/**
 * @fileoverview Zoom Video Conferencing Integration Service
 * @module servers/customer-services/modules/integrations/video-conferencing/zoom-service
 * @description Professional B2B Zoom integration for automated meeting creation and management
 * @version 1.0.0
 */

const axios = require('axios');
const logger = require('../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'zoom-service'
});
const { AppError } = require('../../../../../shared/lib/utils/app-error');

/**
 * Zoom Integration Service
 * Handles Zoom meeting creation, scheduling, and management using Server-to-Server OAuth
 */
class ZoomService {
    constructor() {
        this.accountId = process.env.ZOOM_ACCOUNT_ID;
        this.clientId = process.env.ZOOM_CLIENT_ID;
        this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
        this.apiBaseUrl = 'https://api.zoom.us/v2';
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Get OAuth access token using Server-to-Server OAuth
     * @private
     * @returns {Promise<string>} Access token
     */
    async _getAccessToken() {
        try {
            // Return cached token if still valid
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                return this.accessToken;
            }

            logger.info('Requesting new Zoom access token');

            const response = await axios.post(
                'https://zoom.us/oauth/token',
                null,
                {
                    params: {
                        grant_type: 'account_credentials',
                        account_id: this.accountId
                    },
                    auth: {
                        username: this.clientId,
                        password: this.clientSecret
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            // Set expiry to 5 minutes before actual expiry to be safe
            this.tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);

            logger.info('Zoom access token obtained successfully');
            return this.accessToken;

        } catch (error) {
            logger.error('Failed to obtain Zoom access token', {
                error: error.message,
                response: error.response?.data
            });
            throw new AppError(
                'Failed to authenticate with Zoom',
                500,
                'ZOOM_AUTH_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Make authenticated API request to Zoom
     * @private
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @returns {Promise<Object>} API response
     */
    async _makeRequest(method, endpoint, data = null) {
        try {
            const token = await this._getAccessToken();

            const config = {
                method,
                url: `${this.apiBaseUrl}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;

        } catch (error) {
            logger.error('Zoom API request failed', {
                method,
                endpoint,
                error: error.message,
                response: error.response?.data
            });

            if (error.response?.status === 401) {
                // Token expired, clear cache and retry once
                this.accessToken = null;
                this.tokenExpiry = null;

                if (!error.retried) {
                    error.retried = true;
                    return this._makeRequest(method, endpoint, data);
                }
            }

            throw new AppError(
                error.response?.data?.message || 'Zoom API request failed',
                error.response?.status || 500,
                'ZOOM_API_ERROR',
                { originalError: error.message }
            );
        }
    }

    /**
     * Create a scheduled Zoom meeting
     * @param {Object} meetingData - Meeting information
     * @param {string} meetingData.topic - Meeting topic/title
     * @param {string} meetingData.agenda - Meeting agenda
     * @param {Date} meetingData.startTime - Meeting start time
     * @param {number} meetingData.duration - Duration in minutes
     * @param {string} meetingData.timezone - Timezone (e.g., 'America/New_York')
     * @param {string} meetingData.hostEmail - Zoom host email (consultant email)
     * @param {Object} meetingData.settings - Additional meeting settings
     * @returns {Promise<Object>} Created meeting details
     */
    async createMeeting(meetingData) {
        try {
            const {
                topic,
                agenda,
                startTime,
                duration,
                timezone = 'America/New_York',
                hostEmail,
                settings = {}
            } = meetingData;

            logger.info('Creating Zoom meeting', {
                topic,
                startTime,
                duration,
                hostEmail
            });

            // Get user by email to use as host
            const userId = await this._getUserByEmail(hostEmail);

            const meetingPayload = {
                topic,
                type: 2, // Scheduled meeting
                start_time: new Date(startTime).toISOString(),
                duration,
                timezone,
                agenda: agenda || '',
                settings: {
                    host_video: settings.hostVideo !== false,
                    participant_video: settings.participantVideo !== false,
                    join_before_host: settings.joinBeforeHost || false,
                    mute_upon_entry: settings.muteUponEntry || false,
                    watermark: settings.watermark || false,
                    use_pmi: false,
                    approval_type: settings.approvalType || 0, // 0 = automatically approve
                    audio: settings.audio || 'both', // both, telephony, voip
                    auto_recording: settings.autoRecording || 'none', // none, local, cloud
                    waiting_room: settings.waitingRoom !== false,
                    meeting_authentication: settings.requireAuthentication || false,
                    ...settings
                },
                recurrence: meetingData.recurrence || undefined
            };

            const meeting = await this._makeRequest(
                'POST',
                `/users/${userId}/meetings`,
                meetingPayload
            );

            logger.info('Zoom meeting created successfully', {
                meetingId: meeting.id,
                joinUrl: meeting.join_url
            });

            return {
                meetingId: meeting.id.toString(),
                hostId: meeting.host_id,
                topic: meeting.topic,
                agenda: meeting.agenda,
                startTime: meeting.start_time,
                duration: meeting.duration,
                timezone: meeting.timezone,
                joinUrl: meeting.join_url,
                startUrl: meeting.start_url,
                password: meeting.password,
                encryptedPassword: meeting.encrypted_password,
                settings: meeting.settings,
                createdAt: meeting.created_at
            };

        } catch (error) {
            logger.error('Failed to create Zoom meeting', {
                error: error.message,
                meetingData
            });
            throw error;
        }
    }

    /**
     * Get user by email
     * @private
     * @param {string} email - User email
     * @returns {Promise<string>} User ID or 'me' for default user
     */
    async _getUserByEmail(email) {
        try {
            // Try to find user by email
            const response = await this._makeRequest('GET', `/users/${email}`);
            return response.id;
        } catch (error) {
            // If user not found, use 'me' (account owner)
            logger.warn('User not found by email, using account owner', { email });
            return 'me';
        }
    }

    /**
     * Get meeting details
     * @param {string} meetingId - Zoom meeting ID
     * @returns {Promise<Object>} Meeting details
     */
    async getMeeting(meetingId) {
        try {
            logger.info('Fetching Zoom meeting details', { meetingId });

            const meeting = await this._makeRequest('GET', `/meetings/${meetingId}`);

            return {
                meetingId: meeting.id.toString(),
                hostId: meeting.host_id,
                topic: meeting.topic,
                agenda: meeting.agenda,
                startTime: meeting.start_time,
                duration: meeting.duration,
                timezone: meeting.timezone,
                joinUrl: meeting.join_url,
                startUrl: meeting.start_url,
                password: meeting.password,
                status: meeting.status,
                settings: meeting.settings
            };

        } catch (error) {
            logger.error('Failed to fetch Zoom meeting', {
                meetingId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update meeting details
     * @param {string} meetingId - Zoom meeting ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateMeeting(meetingId, updates) {
        try {
            logger.info('Updating Zoom meeting', { meetingId, updates });

            const updatePayload = {};

            if (updates.topic) updatePayload.topic = updates.topic;
            if (updates.agenda) updatePayload.agenda = updates.agenda;
            if (updates.startTime) updatePayload.start_time = new Date(updates.startTime).toISOString();
            if (updates.duration) updatePayload.duration = updates.duration;
            if (updates.timezone) updatePayload.timezone = updates.timezone;
            if (updates.settings) updatePayload.settings = updates.settings;

            await this._makeRequest('PATCH', `/meetings/${meetingId}`, updatePayload);

            logger.info('Zoom meeting updated successfully', { meetingId });

        } catch (error) {
            logger.error('Failed to update Zoom meeting', {
                meetingId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete/cancel a meeting
     * @param {string} meetingId - Zoom meeting ID
     * @param {Object} options - Deletion options
     * @param {boolean} options.notifyHosts - Send notification to hosts
     * @param {boolean} options.notifyRegistrants - Send notification to registrants
     * @returns {Promise<void>}
     */
    async deleteMeeting(meetingId, options = {}) {
        try {
            logger.info('Deleting Zoom meeting', { meetingId, options });

            const params = {};
            if (options.notifyHosts !== undefined) {
                params.schedule_for_reminder = options.notifyHosts;
            }
            if (options.notifyRegistrants !== undefined) {
                params.cancel_meeting_reminder = options.notifyRegistrants;
            }

            await this._makeRequest(
                'DELETE',
                `/meetings/${meetingId}${Object.keys(params).length ? '?' + new URLSearchParams(params) : ''}`
            );

            logger.info('Zoom meeting deleted successfully', { meetingId });

        } catch (error) {
            logger.error('Failed to delete Zoom meeting', {
                meetingId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * List user's scheduled meetings
     * @param {string} userId - User ID or email (defaults to 'me')
     * @param {Object} options - List options
     * @returns {Promise<Array>} List of meetings
     */
    async listMeetings(userId = 'me', options = {}) {
        try {
            logger.info('Listing Zoom meetings', { userId, options });

            const params = {
                type: options.type || 'scheduled', // scheduled, live, upcoming
                page_size: options.pageSize || 30,
                page_number: options.pageNumber || 1
            };

            const response = await this._makeRequest(
                'GET',
                `/users/${userId}/meetings?${new URLSearchParams(params)}`
            );

            return response.meetings.map(meeting => ({
                meetingId: meeting.id.toString(),
                topic: meeting.topic,
                startTime: meeting.start_time,
                duration: meeting.duration,
                timezone: meeting.timezone,
                joinUrl: meeting.join_url,
                agenda: meeting.agenda
            }));

        } catch (error) {
            logger.error('Failed to list Zoom meetings', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get meeting participant report
     * @param {string} meetingId - Zoom meeting ID
     * @returns {Promise<Object>} Participant report
     */
    async getParticipantReport(meetingId) {
        try {
            logger.info('Fetching participant report', { meetingId });

            const response = await this._makeRequest(
                'GET',
                `/report/meetings/${meetingId}/participants`
            );

            return {
                meetingId: response.id,
                totalParticipants: response.participants_count,
                participants: response.participants.map(p => ({
                    userId: p.user_id,
                    name: p.name,
                    email: p.user_email,
                    joinTime: p.join_time,
                    leaveTime: p.leave_time,
                    duration: p.duration,
                    attentiveness_score: p.attentiveness_score
                }))
            };

        } catch (error) {
            logger.error('Failed to fetch participant report', {
                meetingId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate Zoom configuration
     * @returns {Promise<boolean>} True if configured correctly
     */
    async validateConfiguration() {
        try {
            if (!this.accountId || !this.clientId || !this.clientSecret) {
                logger.error('Zoom configuration incomplete', {
                    hasAccountId: !!this.accountId,
                    hasClientId: !!this.clientId,
                    hasClientSecret: !!this.clientSecret
                });
                return false;
            }

            // Test authentication
            await this._getAccessToken();

            // Test API access
            await this._makeRequest('GET', '/users/me');

            logger.info('Zoom configuration validated successfully');
            return true;

        } catch (error) {
            logger.error('Zoom configuration validation failed', {
                error: error.message
            });
            return false;
        }
    }
}

// Export singleton instance
module.exports = new ZoomService();
