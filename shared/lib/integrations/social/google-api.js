/**
 * @fileoverview Google API Integration
 */

class GoogleAPI {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.headers = {
            'Authorization': `Bearer ${accessToken}`
        };
    }
    
    async getUserInfo() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Google API error: ${error.message}`);
        }
    }
    
    async getCalendarEvents() {
        try {
            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Google Calendar API error: ${error.message}`);
        }
    }
    
    async getDriveFiles() {
        try {
            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Google Drive API error: ${error.message}`);
        }
    }
    
    async getGmailMessages() {
        try {
            const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages', {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`Gmail API error: ${error.message}`);
        }
    }
}

module.exports = GoogleAPI;
