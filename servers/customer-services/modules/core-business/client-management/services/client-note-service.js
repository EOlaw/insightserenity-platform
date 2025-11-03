/**
 * @fileoverview Client Note Management Service
 * @module servers/customer-services/modules/core-business/client-management/services/client-note-service
 * @description Comprehensive service for managing client notes including activity tracking, tagging, and knowledge management
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-note-service'
});
const validator = require('validator');
const crypto = require('crypto');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Note Type Constants
 */
const NOTE_TYPES = {
    GENERAL: 'general',
    MEETING: 'meeting',
    CALL: 'call',
    EMAIL: 'email',
    TASK: 'task',
    ISSUE: 'issue',
    OPPORTUNITY: 'opportunity',
    FEEDBACK: 'feedback',
    RESEARCH: 'research',
    DECISION: 'decision'
};

/**
 * Note Category Constants
 */
const NOTE_CATEGORIES = {
    RELATIONSHIP: 'relationship_management',
    SALES: 'sales',
    SUPPORT: 'customer_support',
    TECHNICAL: 'technical',
    FINANCIAL: 'financial',
    STRATEGIC: 'strategic',
    OPERATIONAL: 'operational',
    OTHER: 'other'
};

/**
 * Note Priority Constants
 */
const NOTE_PRIORITIES = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent',
    CRITICAL: 'critical'
};

/**
 * Note Visibility Constants
 */
const NOTE_VISIBILITY = {
    PRIVATE: 'private',
    TEAM: 'team',
    DEPARTMENT: 'department',
    COMPANY: 'company',
    PUBLIC: 'public'
};

/**
 * Client Note Management Service
 * @class ClientNoteService
 */
class ClientNoteService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            autoGenerateNoteId: process.env.AUTO_GENERATE_NOTE_ID !== 'false',
            maxNotesPerClient: parseInt(process.env.MAX_NOTES_PER_CLIENT, 10) || 10000,
            maxNoteLength: parseInt(process.env.MAX_NOTE_LENGTH, 10) || 50000,
            enableNoteVersioning: process.env.ENABLE_NOTE_VERSIONING === 'true',
            enableAutoTagging: process.env.ENABLE_AUTO_TAGGING === 'true',
            enableSentimentAnalysis: process.env.ENABLE_SENTIMENT_ANALYSIS === 'true'
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database;
        }
        return this._dbService;
    }

    // ============= NOTE CREATION & MANAGEMENT =============

    /**
     * Create a new client note
     * @param {Object} noteData - Note information
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created note
     */
    async createNote(noteData, options = {}) {
        try {
            logger.info('Starting note creation', {
                clientId: noteData.clientId,
                noteType: noteData.type,
                title: noteData.content?.title
            });

            // Validate note data
            await this._validateNoteData(noteData);

            // Verify client exists
            await this._verifyClientExists(noteData.clientId, options.tenantId);

            // Check note limit for client
            await this._checkNoteLimit(noteData.clientId);

            // Generate note ID if not provided
            if (!noteData.noteId && this.config.autoGenerateNoteId) {
                noteData.noteId = await this._generateNoteId();
            }

            // Set default values
            noteData.tenantId = options.tenantId || this.config.companyTenantId;
            noteData.organizationId = options.organizationId || noteData.organizationId;
            noteData.type = noteData.type || NOTE_TYPES.GENERAL;
            noteData.category = noteData.category || NOTE_CATEGORIES.OTHER;
            noteData.priority = noteData.priority || NOTE_PRIORITIES.NORMAL;
            noteData.visibility = noteData.visibility || NOTE_VISIBILITY.TEAM;

            // Calculate content metrics
            if (noteData.content?.body) {
                noteData.content.wordCount = this._countWords(noteData.content.body);
                noteData.content.characterCount = noteData.content.body.length;
                noteData.content.readingTime = Math.ceil(noteData.content.wordCount / 200); // Average reading speed
            }

            // Auto-generate tags if enabled
            if (this.config.enableAutoTagging && noteData.content?.body) {
                noteData.tags = await this._generateAutoTags(noteData.content.body);
            }

            // Analyze sentiment if enabled
            if (this.config.enableSentimentAnalysis && noteData.content?.body) {
                noteData.content.sentiment = await this._analyzeSentiment(noteData.content.body);
            }

            // Initialize metadata
            noteData.metadata = {
                createdBy: options.userId,
                createdAt: new Date(),
                version: 1,
                source: options.source || 'manual'
            };

            // Initialize engagement metrics
            noteData.engagement = {
                viewCount: 0,
                shareCount: 0,
                commentCount: 0,
                lastViewedAt: null
            };

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            // Create note
            const newNote = new ClientNote(noteData);
            await newNote.save();

            logger.info('Note created successfully', {
                noteId: newNote.noteId,
                clientId: newNote.clientId,
                type: newNote.type
            });

            // Post-creation activities
            await this._handlePostNoteCreation(newNote, options);

            return this._sanitizeNoteOutput(newNote);

        } catch (error) {
            logger.error('Note creation failed', {
                error: error.message,
                stack: error.stack,
                clientId: noteData?.clientId
            });
            throw error;
        }
    }

    /**
     * Get note by ID
     * @param {string} noteId - Note ID or MongoDB ObjectId
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Note data
     */
    async getNoteById(noteId, options = {}) {
        try {
            logger.info('Fetching note by ID', { noteId });

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            // Determine if searching by MongoDB ID or noteId field
            let query;
            if (noteId.match(/^[0-9a-fA-F]{24}$/)) {
                query = ClientNote.findById(noteId);
            } else {
                query = ClientNote.findOne({ noteId: noteId.toUpperCase() });
            }

            // Apply population if requested
            if (options.populate) {
                query = query.populate('clientId metadata.createdBy relatedEntities.contactId');
            }

            const note = await query.exec();

            if (!note) {
                throw AppError.notFound('Note not found', {
                    context: { noteId }
                });
            }

            // Check tenant access
            if (options.tenantId && note.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this note');
            }

            // Check visibility permissions
            if (options.userId && !await this._checkNoteVisibility(note, options.userId)) {
                throw AppError.forbidden('Insufficient permissions to view this note');
            }

            // Track note view
            await this._trackNoteView(note._id, options.userId);

            return this._sanitizeNoteOutput(note);

        } catch (error) {
            logger.error('Failed to fetch note', {
                error: error.message,
                noteId
            });
            throw error;
        }
    }

    /**
     * Get all notes for a client
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of notes
     */
    async getNotesByClient(clientId, options = {}) {
        try {
            logger.info('Fetching notes by client', { clientId });

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            const query = {
                clientId: clientId,
                tenantId: options.tenantId || this.config.companyTenantId,
                'metadata.isDeleted': { $ne: true }
            };

            // Filter by note type if provided
            if (options.type) {
                query.type = options.type;
            }

            // Filter by category if provided
            if (options.category) {
                query.category = options.category;
            }

            // Filter by priority if provided
            if (options.priority) {
                query.priority = options.priority;
            }

            // Filter by tags if provided
            if (options.tags) {
                query.tags = { $in: Array.isArray(options.tags) ? options.tags : [options.tags] };
            }

            // Filter by date range if provided
            if (options.dateFrom || options.dateTo) {
                query['metadata.createdAt'] = {};
                if (options.dateFrom) query['metadata.createdAt'].$gte = new Date(options.dateFrom);
                if (options.dateTo) query['metadata.createdAt'].$lte = new Date(options.dateTo);
            }

            let noteQuery = ClientNote.find(query);

            // Apply sorting
            const sortField = options.sortBy || 'metadata.createdAt';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
            noteQuery = noteQuery.sort({ [sortField]: sortOrder });

            // Apply pagination
            if (options.limit) {
                const page = parseInt(options.page, 10) || 1;
                const limit = parseInt(options.limit, 10);
                const skip = (page - 1) * limit;
                noteQuery = noteQuery.skip(skip).limit(limit);
            }

            const notes = await noteQuery.lean().exec();

            logger.info('Notes fetched successfully', {
                clientId,
                count: notes.length
            });

            return notes.map(n => this._sanitizeNoteOutput(n));

        } catch (error) {
            logger.error('Failed to fetch notes by client', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Update note information
     * @param {string} noteId - Note ID
     * @param {Object} updateData - Data to update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated note
     */
    async updateNote(noteId, updateData, options = {}) {
        try {
            logger.info('Updating note', {
                noteId,
                updateFields: Object.keys(updateData)
            });

            // Validate update data
            await this._validateNoteUpdateData(updateData);

            // Get existing note
            const note = await this.getNoteById(noteId, { 
                tenantId: options.tenantId,
                userId: options.userId
            });

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            // Archive current version if versioning enabled
            if (this.config.enableNoteVersioning && updateData.content?.body) {
                await this._archiveNoteVersion(note);
            }

            // Prepare update
            const update = {
                ...updateData,
                'metadata.updatedBy': options.userId,
                'metadata.lastModified': new Date(),
                'metadata.version': note.metadata.version + 1
            };

            // Recalculate metrics if content changed
            if (updateData.content?.body) {
                update['content.wordCount'] = this._countWords(updateData.content.body);
                update['content.characterCount'] = updateData.content.body.length;
                update['content.readingTime'] = Math.ceil(update['content.wordCount'] / 200);
            }

            // Perform update
            const updatedNote = await ClientNote.findOneAndUpdate(
                { noteId: noteId.toUpperCase() },
                { $set: update },
                { new: true, runValidators: true }
            );

            if (!updatedNote) {
                throw AppError.notFound('Note not found for update');
            }

            logger.info('Note updated successfully', {
                noteId,
                version: updatedNote.metadata.version
            });

            // Track update event
            await this._trackNoteEvent(updatedNote, 'note_updated', {
                updatedFields: Object.keys(updateData),
                userId: options.userId
            });

            return this._sanitizeNoteOutput(updatedNote);

        } catch (error) {
            logger.error('Note update failed', {
                error: error.message,
                noteId
            });
            throw error;
        }
    }

    /**
     * Delete/archive note
     * @param {string} noteId - Note ID
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteNote(noteId, options = {}) {
        try {
            logger.info('Deleting note', { noteId, softDelete: options.softDelete });

            const note = await this.getNoteById(noteId, { 
                tenantId: options.tenantId,
                userId: options.userId
            });

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            let result;

            if (options.softDelete !== false) {
                // Soft delete
                result = await ClientNote.findOneAndUpdate(
                    { noteId: noteId.toUpperCase() },
                    {
                        $set: {
                            'metadata.deletedAt': new Date(),
                            'metadata.deletedBy': options.userId,
                            'metadata.isDeleted': true
                        }
                    },
                    { new: true }
                );
            } else {
                // Hard delete - only if authorized
                if (!options.forceDelete) {
                    throw AppError.forbidden('Hard delete requires force flag');
                }
                result = await ClientNote.findOneAndDelete({ noteId: noteId.toUpperCase() });
            }

            logger.info('Note deleted successfully', {
                noteId,
                softDelete: options.softDelete !== false
            });

            // Track deletion event
            await this._trackNoteEvent(note, 'note_deleted', {
                softDelete: options.softDelete !== false,
                userId: options.userId
            });

            return {
                success: true,
                noteId,
                deletionType: options.softDelete !== false ? 'soft' : 'hard'
            };

        } catch (error) {
            logger.error('Note deletion failed', {
                error: error.message,
                noteId
            });
            throw error;
        }
    }

    /**
     * Add comment to note
     * @param {string} noteId - Note ID
     * @param {Object} commentData - Comment details
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated note
     */
    async addComment(noteId, commentData, options = {}) {
        try {
            logger.info('Adding comment to note', { noteId });

            const note = await this.getNoteById(noteId, { 
                tenantId: options.tenantId,
                userId: options.userId
            });

            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            // Prepare comment
            const comment = {
                id: crypto.randomBytes(12).toString('hex'),
                author: options.userId,
                content: commentData.content,
                createdAt: new Date(),
                likes: 0,
                isEdited: false
            };

            // Update note with comment
            const updatedNote = await ClientNote.findOneAndUpdate(
                { noteId: noteId.toUpperCase() },
                {
                    $push: { 'collaboration.comments': comment },
                    $inc: { 'engagement.commentCount': 1 }
                },
                { new: true }
            );

            logger.info('Comment added successfully', { noteId });

            return this._sanitizeNoteOutput(updatedNote);

        } catch (error) {
            logger.error('Failed to add comment', {
                error: error.message,
                noteId
            });
            throw error;
        }
    }

    // ============= VALIDATION METHODS =============

    /**
     * Validate note data
     * @private
     */
    async _validateNoteData(noteData) {
        const errors = [];

        // Required fields
        if (!noteData.clientId) {
            errors.push({ field: 'clientId', message: 'Client ID is required' });
        }

        if (!noteData.content?.body) {
            errors.push({ field: 'content.body', message: 'Note content is required' });
        }

        // Validate note length
        if (noteData.content?.body && noteData.content.body.length > this.config.maxNoteLength) {
            errors.push({ 
                field: 'content.body', 
                message: `Note exceeds maximum length of ${this.config.maxNoteLength} characters` 
            });
        }

        if (errors.length > 0) {
            throw AppError.validation('Note validation failed', { errors });
        }
    }

    /**
     * Validate note update data
     * @private
     */
    async _validateNoteUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['noteId', 'clientId', 'tenantId'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate note length if content updated
        if (updateData.content?.body && updateData.content.body.length > this.config.maxNoteLength) {
            errors.push({ 
                field: 'content.body', 
                message: `Note exceeds maximum length of ${this.config.maxNoteLength} characters` 
            });
        }

        if (errors.length > 0) {
            throw AppError.validation('Note update validation failed', { errors });
        }
    }

    /**
     * Verify client exists
     * @private
     */
    async _verifyClientExists(clientId, tenantId) {
        const dbService = this._getDatabaseService();
        const Client = await dbService.getModel('Client', 'customer');

        const client = await Client.findById(clientId);

        if (!client) {
            throw AppError.notFound('Client not found', {
                context: { clientId }
            });
        }

        if (tenantId && client.tenantId.toString() !== tenantId) {
            throw AppError.forbidden('Access denied to this client');
        }
    }

    /**
     * Check note limit for client
     * @private
     */
    async _checkNoteLimit(clientId) {
        const dbService = this._getDatabaseService();
        const ClientNote = await dbService.getModel('ClientNote', 'customer');

        const count = await ClientNote.countDocuments({
            clientId: clientId,
            'metadata.isDeleted': { $ne: true }
        });

        if (count >= this.config.maxNotesPerClient) {
            throw AppError.validation('Note limit reached for this client', {
                context: {
                    currentCount: count,
                    maxAllowed: this.config.maxNotesPerClient
                }
            });
        }
    }

    /**
     * Check note visibility permissions
     * @private
     */
    async _checkNoteVisibility(note, userId) {
        // Private notes only visible to creator
        if (note.visibility === NOTE_VISIBILITY.PRIVATE) {
            return note.metadata.createdBy && note.metadata.createdBy.toString() === userId;
        }

        // Public notes visible to all
        if (note.visibility === NOTE_VISIBILITY.PUBLIC) {
            return true;
        }

        // Team/Department/Company - implement based on your org structure
        return true;
    }

    // ============= HELPER METHODS =============

    /**
     * Generate unique note ID
     * @private
     */
    async _generateNoteId() {
        const prefix = 'NOTE';
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        
        const id = `${prefix}-${timestamp}${random}`;

        // Verify uniqueness
        const dbService = this._getDatabaseService();
        const ClientNote = await dbService.getModel('ClientNote', 'customer');
        const existing = await ClientNote.findOne({ noteId: id });

        if (existing) {
            return this._generateNoteId();
        }

        return id;
    }

    /**
     * Count words in text
     * @private
     */
    _countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).length;
    }

    /**
     * Generate auto tags from content
     * @private
     */
    async _generateAutoTags(content) {
        // Placeholder for auto-tagging logic
        // Could use NLP or keyword extraction
        return [];
    }

    /**
     * Analyze sentiment of content
     * @private
     */
    async _analyzeSentiment(content) {
        // Placeholder for sentiment analysis
        return {
            score: 0,
            polarity: 'neutral',
            confidence: 0
        };
    }

    /**
     * Archive note version
     * @private
     */
    async _archiveNoteVersion(note) {
        logger.info('Archiving note version', {
            noteId: note.noteId,
            version: note.metadata.version
        });
        // Placeholder for version archival logic
    }

    /**
     * Track note view
     * @private
     */
    async _trackNoteView(noteId, userId) {
        try {
            const dbService = this._getDatabaseService();
            const ClientNote = await dbService.getModel('ClientNote', 'customer');

            await ClientNote.findByIdAndUpdate(
                noteId,
                {
                    $inc: { 'engagement.viewCount': 1 },
                    $set: { 'engagement.lastViewedAt': new Date() }
                }
            );
        } catch (error) {
            logger.error('Failed to track note view', { error: error.message });
        }
    }

    /**
     * Handle post-note creation activities
     * @private
     */
    async _handlePostNoteCreation(note, options) {
        try {
            // Track creation event
            await this._trackNoteEvent(note, 'note_created', {
                userId: options.userId,
                source: options.source || 'manual'
            });

            // Send notifications if mentions exist
            if (note.collaboration?.mentions && note.collaboration.mentions.length > 0) {
                await this._notifyMentionedUsers(note, options);
            }

        } catch (error) {
            logger.error('Post-note creation activities failed (non-blocking)', {
                error: error.message,
                noteId: note.noteId
            });
        }
    }

    /**
     * Notify mentioned users
     * @private
     */
    async _notifyMentionedUsers(note, options) {
        try {
            if (typeof this.notificationService.sendNotification === 'function') {
                for (const userId of note.collaboration.mentions) {
                    await this.notificationService.sendNotification({
                        type: 'note_mention',
                        recipient: userId,
                        data: {
                            noteId: note.noteId,
                            noteTitle: note.content.title,
                            mentionedBy: options.userId
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('Failed to send mention notifications', { error: error.message });
        }
    }

    /**
     * Track note event
     * @private
     */
    async _trackNoteEvent(note, eventType, data) {
        try {
            if (typeof this.analyticsService.trackEvent === 'function') {
                await this.analyticsService.trackEvent({
                    type: eventType,
                    noteId: note._id || note.id,
                    clientId: note.clientId,
                    data: data
                });
            }
        } catch (error) {
            logger.error('Failed to track note event', { error: error.message });
        }
    }

    /**
     * Sanitize note output
     * @private
     */
    _sanitizeNoteOutput(note) {
        if (!note) return null;

        const noteObject = note.toObject ? note.toObject() : note;

        // Remove sensitive fields
        delete noteObject.__v;
        delete noteObject.metadata?.deletedAt;
        delete noteObject.metadata?.deletedBy;

        return noteObject;
    }
}

module.exports = new ClientNoteService();