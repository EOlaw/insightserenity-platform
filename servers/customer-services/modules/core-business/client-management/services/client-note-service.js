/**
 * @fileoverview Client Note Management Service
 * @module servers/customer-services/modules/core-business/client-management/services/client-note-service
 * @description Comprehensive service for managing client notes with enterprise-grade access control
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-note-service'
});
const validator = require('validator');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Note Type Constants
 */
const NOTE_TYPES = {
    MEETING: 'meeting',
    CALL: 'call',
    EMAIL: 'email',
    TASK: 'task',
    REMINDER: 'reminder',
    OBSERVATION: 'observation',
    FEEDBACK: 'feedback',
    COMPLAINT: 'complaint',
    OPPORTUNITY: 'opportunity',
    RISK: 'risk',
    DECISION: 'decision',
    ACTION_ITEM: 'action_item',
    FOLLOW_UP: 'follow_up',
    RESEARCH: 'research',
    ANALYSIS: 'analysis',
    STRATEGY: 'strategy',
    PERSONAL: 'personal',
    TECHNICAL: 'technical',
    FINANCIAL: 'financial',
    LEGAL: 'legal',
    GENERAL: 'general'
};

/**
 * Note Category Constants
 */
const NOTE_CATEGORIES = {
    SALES: 'sales',
    SUPPORT: 'support',
    TECHNICAL: 'technical',
    FINANCIAL: 'financial',
    LEGAL: 'legal',
    OPERATIONAL: 'operational',
    STRATEGIC: 'strategic',
    RELATIONSHIP: 'relationship',
    COMPLIANCE: 'compliance',
    GENERAL: 'general'
};

/**
 * Note Importance Constants
 */
const NOTE_IMPORTANCE = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    FYI: 'fyi'
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
            maxNoteLength: parseInt(process.env.MAX_NOTE_LENGTH, 10) || 50000,
            maxNotesPerClient: parseInt(process.env.MAX_NOTES_PER_CLIENT, 10) || 10000,
            enableVersionControl: process.env.ENABLE_NOTE_VERSION_CONTROL !== 'false',
            maxVersionsToKeep: parseInt(process.env.MAX_NOTE_VERSIONS_TO_KEEP, 10) || 50
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    // ============= NOTE CREATION & MANAGEMENT =============

    /**
     * Create a new note with enterprise-grade validation and context inheritance
     */
    async createNote(noteData, options = {}) {
        const operationId = crypto.randomBytes(8).toString('hex');
        const startTime = Date.now();

        try {
            logger.info('Starting note creation', {
                operationId,
                clientId: noteData.clientId,
                noteTitle: noteData.content?.title,
                noteType: noteData.classification?.type,
                userId: options.userId,
                source: options.source || 'manual'
            });

            // PHASE 1: INPUT VALIDATION
            await this._validateNoteData(noteData);

            if (!noteData.clientId || !mongoose.Types.ObjectId.isValid(noteData.clientId)) {
                throw AppError.validation('Valid client ID is required', {
                    context: {
                        providedClientId: noteData.clientId,
                        field: 'clientId'
                    }
                });
            }

            // PHASE 2: CLIENT VERIFICATION AND CONTEXT INHERITANCE
            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');

            const parentClient = await Client.findById(noteData.clientId)
                .select('tenantId organizationId companyName relationship.status')
                .lean();

            if (!parentClient) {
                throw AppError.notFound('Parent client not found', {
                    context: { clientId: noteData.clientId }
                });
            }

            if (parentClient.relationship?.status === 'inactive' ||
                parentClient.relationship?.status === 'churned') {
                throw AppError.validation(
                    'Cannot create notes for inactive or churned clients',
                    {
                        context: {
                            clientId: noteData.clientId,
                            clientStatus: parentClient.relationship.status
                        }
                    }
                );
            }

            // PHASE 3: ACCESS CONTROL VERIFICATION
            if (options.userClientId) {
                if (parentClient._id.toString() !== options.userClientId.toString()) {
                    throw AppError.forbidden(
                        'You can only create notes for your own account',
                        {
                            context: {
                                requestedClientId: noteData.clientId,
                                userClientId: options.userClientId
                            }
                        }
                    );
                }
                logger.debug('Self-service access validated', {
                    operationId,
                    userId: options.userId,
                    clientId: options.userClientId
                });
            } else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context', {
                        context: {
                            providedTenantId: options.tenantId,
                            clientTenantId: parentClient.tenantId
                        }
                    });
                }

                if (parentClient.tenantId.toString() !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this client', {
                        context: {
                            clientTenantId: parentClient.tenantId.toString(),
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }

                logger.debug('Administrative access validated', {
                    operationId,
                    userId: options.userId,
                    tenantId: options.tenantId
                });
            }

            // PHASE 4: BUSINESS RULE VALIDATION
            await this._checkNoteLimit(noteData.clientId);

            // PHASE 5: DATA ENRICHMENT AND PREPARATION
            if (!noteData.noteId && this.config.autoGenerateNoteId) {
                noteData.noteId = await this._generateNoteId();
            }

            noteData.tenantId = parentClient.tenantId;
            noteData.organizationId = parentClient.organizationId;

            // Initialize classification
            if (!noteData.classification) {
                noteData.classification = {};
            }
            noteData.classification.type = noteData.classification.type || NOTE_TYPES.GENERAL;
            noteData.classification.category = noteData.classification.category || {};
            noteData.classification.category.primary = noteData.classification.category.primary || NOTE_CATEGORIES.GENERAL;
            noteData.classification.importance = noteData.classification.importance || NOTE_IMPORTANCE.MEDIUM;

            // Calculate content metrics
            if (noteData.content?.body) {
                noteData.content.wordCount = this._countWords(noteData.content.body);
                noteData.content.characterCount = noteData.content.body.length;
                noteData.content.readingTime = Math.ceil(noteData.content.wordCount / 200);

                // Auto-generate summary if not provided
                if (!noteData.content.summary) {
                    noteData.content.summary = this._generateSummary(noteData.content.body);
                }
            }

            // Initialize versioning if enabled
            if (this.config.enableVersionControl) {
                noteData.versioning = {
                    version: 1,
                    revisions: [],
                    lastModified: {
                        date: new Date(),
                        by: options.userId
                    },
                    locked: {
                        isLocked: false
                    }
                };
            }

            // Initialize visibility
            if (!noteData.visibility) {
                noteData.visibility = {
                    scope: 'team',
                    teams: [],
                    departments: [],
                    sharedWith: [],
                    clientVisible: {
                        enabled: false
                    },
                    restrictions: {
                        noExport: false,
                        noCopy: false,
                        noForward: false
                    }
                };
            }

            // Initialize analytics
            if (!noteData.analytics) {
                noteData.analytics = {
                    views: {
                        total: 0,
                        unique: 0,
                        viewHistory: []
                    },
                    engagement: {
                        score: 0,
                        interactions: 0,
                        shares: 0,
                        exports: 0
                    },
                    usefulness: {
                        totalRatings: 0
                    }
                };
            }

            // Initialize collaboration
            if (!noteData.collaboration) {
                noteData.collaboration = {
                    comments: [],
                    contributors: [],
                    votes: {
                        upvotes: [],
                        downvotes: [],
                        score: 0
                    },
                    bookmarks: []
                };
            }

            // Set metadata
            noteData.metadata = {
                source: options.source || 'manual',
                createdBy: options.userId,
                createdAt: new Date(),
                flags: {
                    isPinned: false,
                    isImportant: false,
                    requiresReview: false,
                    hasIssues: false
                }
            };

            // Set status
            noteData.status = {
                current: 'active',
                isActive: true,
                isDeleted: false
            };

            // PHASE 6: DATABASE PERSISTENCE
            const ClientNote = dbService.getModel('ClientNote', 'customer');
            const newNote = new ClientNote(noteData);
            await newNote.save();

            const duration = Date.now() - startTime;

            logger.info('Note created successfully', {
                operationId,
                noteId: newNote.noteId,
                clientId: newNote.clientId,
                tenantId: newNote.tenantId.toString(),
                organizationId: newNote.organizationId?.toString(),
                noteTitle: newNote.content?.title,
                noteType: newNote.classification?.type,
                userId: options.userId,
                duration: `${duration}ms`
            });

            // PHASE 7: POST-CREATION ACTIVITIES
            setImmediate(async () => {
                try {
                    await this._handlePostNoteCreation(newNote, options);
                } catch (postError) {
                    logger.error('Post-creation activities failed (non-critical)', {
                        operationId,
                        noteId: newNote.noteId,
                        error: postError.message,
                        stack: postError.stack
                    });
                }
            });

            return this._sanitizeNoteOutput(newNote);

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Note creation failed', {
                operationId,
                error: error.message,
                errorCode: error.code,
                stack: error.stack,
                clientId: noteData?.clientId,
                userId: options?.userId,
                duration: `${duration}ms`,
                context: error.context || {}
            });

            if (error instanceof AppError) {
                throw error;
            }

            if (error.name === 'ValidationError') {
                throw AppError.validation('Note validation failed', {
                    errors: Object.keys(error.errors).map(key => ({
                        field: key,
                        message: error.errors[key].message,
                        value: error.errors[key].value
                    }))
                });
            }

            throw AppError.internal('Note creation failed', {
                originalError: error.message,
                operationId
            });
        }
    }

    /**
     * Get note by ID with enterprise-grade access control
     */
    async getNoteById(noteId, options = {}) {
        try {
            logger.info('Fetching note by ID', { noteId });

            if (!mongoose.Types.ObjectId.isValid(noteId)) {
                throw AppError.validation('Invalid note ID format', {
                    context: { noteId }
                });
            }

            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');
            const Client = dbService.getModel('Client', 'customer');

            // Fetch note without population
            const note = await ClientNote.findById(noteId).lean();

            if (!note) {
                throw AppError.notFound('Note not found', {
                    context: { noteId }
                });
            }

            if (note.status?.isDeleted && !options.includeDeleted) {
                throw AppError.notFound('Note not found', {
                    context: { noteId }
                });
            }

            // Manually fetch client data if needed
            if (options.populate) {
                const client = await Client.findById(note.clientId)
                    .select('companyName clientCode tenantId organizationId')
                    .lean();

                if (client) {
                    note.clientId = client;
                }
            } else {
                const client = await Client.findById(note.clientId)
                    .select('tenantId organizationId')
                    .lean();

                if (client) {
                    note.clientId = client;
                }
            }

            // ACCESS CONTROL: Self-service check
            if (options.userClientId) {
                const clientIdString = note.clientId._id ?
                    note.clientId._id.toString() :
                    note.clientId.toString();

                if (clientIdString !== options.userClientId.toString()) {
                    throw AppError.forbidden('You can only access notes from your own account', {
                        context: {
                            noteClientId: clientIdString,
                            userClientId: options.userClientId
                        }
                    });
                }
            }
            // ACCESS CONTROL: Administrative tenant check
            else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context');
                }

                const noteTenantId = note.clientId.tenantId ?
                    note.clientId.tenantId.toString() :
                    note.tenantId.toString();

                if (noteTenantId !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this note', {
                        context: {
                            noteTenantId: noteTenantId,
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }
            }

            logger.info('Note fetched successfully', {
                noteId: note._id,
                clientId: note.clientId._id || note.clientId
            });

            // Track view
            if (options.trackView && options.userId) {
                setImmediate(async () => {
                    try {
                        await this._recordNoteView(note._id, options.userId);
                    } catch (trackError) {
                        logger.error('Failed to track note view', {
                            error: trackError.message,
                            noteId: note._id
                        });
                    }
                });
            }

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
     * Get all notes for a client with access control
     */
    async getNotesByClient(clientId, options = {}) {
        try {
            logger.info('Fetching notes by client', { clientId });

            // Validate client ID format
            if (!mongoose.Types.ObjectId.isValid(clientId)) {
                throw AppError.validation('Invalid client ID format', {
                    context: { clientId }
                });
            }

            const dbService = this._getDatabaseService();
            const Client = dbService.getModel('Client', 'customer');
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            // Verify client exists and get tenant information
            const client = await Client.findById(clientId)
                .select('tenantId organizationId companyName')
                .lean();

            if (!client) {
                throw AppError.notFound('Client not found', {
                    context: { clientId }
                });
            }

            // ACCESS CONTROL: Self-service check
            if (options.userClientId) {
                if (client._id.toString() !== options.userClientId.toString()) {
                    throw AppError.forbidden('You can only access notes from your own account', {
                        context: {
                            requestedClientId: clientId,
                            userClientId: options.userClientId
                        }
                    });
                }
            }
            // ACCESS CONTROL: Administrative tenant check
            else if (options.tenantId && !options.skipTenantCheck) {
                if (!mongoose.Types.ObjectId.isValid(options.tenantId)) {
                    throw AppError.validation('Valid tenant ID required in authentication context');
                }

                if (client.tenantId.toString() !== options.tenantId.toString()) {
                    throw AppError.forbidden('Access denied to this client', {
                        context: {
                            clientTenantId: client.tenantId.toString(),
                            userTenantId: options.tenantId.toString()
                        }
                    });
                }
            }

            // Build query
            const query = {
                clientId: clientId,
                'status.isDeleted': { $ne: true }
            };

            // Filter by note type if provided
            if (options.type) {
                query['classification.type'] = options.type;
            }

            // Filter by category if provided
            if (options.category) {
                query['classification.category.primary'] = options.category;
            }

            // Filter by importance if provided
            if (options.importance) {
                query['classification.importance'] = options.importance;
            }

            // Filter by tags if provided
            if (options.tags) {
                query['classification.tags.user'] = { $in: Array.isArray(options.tags) ? options.tags : [options.tags] };
            }

            // Build and execute query
            const sortField = options.sortBy || 'metadata.createdAt';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

            const notes = await ClientNote.find(query)
                .sort({ [sortField]: sortOrder })
                .lean();

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
     * Get all notes for authenticated client with filtering and sorting
     * This method is designed for self-service access where clients retrieve their own notes
     * @param {Object} options - Query options
     * @param {string} options.userClientId - Client ID from authenticated user (required for self-service)
     * @param {string} options.tenantId - Tenant ID for admin access
     * @param {string} options.type - Filter by note type (meeting, call, email, task, reminder, etc.)
     * @param {string} options.importance - Filter by importance level (critical, high, medium, low, fyi)
     * @param {string} options.category - Filter by category (sales, support, technical, financial, etc.)
     * @param {string} options.status - Filter by status (draft, active, archived)
     * @param {string} options.search - Search term for title, body, or keywords
     * @param {string} options.sortBy - Field to sort by (default: 'createdAt')
     * @param {string} options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
     * @param {number} options.limit - Maximum number of notes to return (max 100, default: 50)
     * @param {number} options.skip - Number of notes to skip for pagination (default: 0)
     * @param {boolean} options.includeDeleted - Include soft-deleted notes (default: false)
     * @param {boolean} options.includeArchived - Include archived notes (default: false)
     * @returns {Promise<Object>} Object containing notes array and metadata
     */
    async getNotes(options = {}) {
        const operationId = crypto.randomBytes(8).toString('hex');
        const startTime = Date.now();

        try {
            logger.info('Starting get all notes operation', {
                operationId,
                userClientId: options.userClientId,
                tenantId: options.tenantId,
                filters: {
                    type: options.type,
                    importance: options.importance,
                    category: options.category,
                    status: options.status,
                    search: options.search
                }
            });

            // PHASE 1: ACCESS CONTROL
            let clientId;

            if (options.userClientId) {
                // Self-service access - client accessing their own notes
                if (!mongoose.Types.ObjectId.isValid(options.userClientId)) {
                    throw AppError.validation('Invalid client ID', {
                        context: { userClientId: options.userClientId }
                    });
                }
                clientId = options.userClientId;

                logger.debug('Self-service access - retrieving own notes', {
                    operationId,
                    clientId: clientId
                });
            } else if (options.tenantId) {
                // Administrative access - would need clientId specified
                throw AppError.validation('Client ID required for administrative access', {
                    context: {
                        message: 'Use getNotesByClient method for admin operations with specific clientId'
                    }
                });
            } else {
                throw AppError.unauthorized('Authentication required', {
                    context: { message: 'User must be authenticated to retrieve notes' }
                });
            }

            // PHASE 2: BUILD QUERY
            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            const query = {
                clientId: clientId,
                'status.isDeleted': options.includeDeleted === true ? { $in: [true, false] } : { $ne: true }
            };

            // Apply type filter
            if (options.type) {
                const validTypes = [
                    'meeting', 'call', 'email', 'task', 'reminder', 'observation',
                    'feedback', 'complaint', 'opportunity', 'risk', 'decision',
                    'action_item', 'follow_up', 'research', 'analysis', 'strategy',
                    'personal', 'technical', 'financial', 'legal', 'general'
                ];

                if (!validTypes.includes(options.type)) {
                    throw AppError.validation('Invalid note type filter', {
                        context: {
                            provided: options.type,
                            validValues: validTypes
                        }
                    });
                }
                query['classification.type'] = options.type;
            }

            // Apply importance filter
            if (options.importance) {
                const validImportance = ['critical', 'high', 'medium', 'low', 'fyi'];

                if (!validImportance.includes(options.importance)) {
                    throw AppError.validation('Invalid importance filter', {
                        context: {
                            provided: options.importance,
                            validValues: validImportance
                        }
                    });
                }
                query['classification.importance'] = options.importance;
            }

            // Apply category filter
            if (options.category) {
                const validCategories = [
                    'sales', 'support', 'technical', 'financial', 'legal',
                    'operational', 'strategic', 'relationship', 'compliance', 'general'
                ];

                if (!validCategories.includes(options.category)) {
                    throw AppError.validation('Invalid category filter', {
                        context: {
                            provided: options.category,
                            validValues: validCategories
                        }
                    });
                }
                query['classification.category.primary'] = options.category;
            }

            // Apply status filter
            if (options.status) {
                const validStatuses = ['draft', 'active', 'archived', 'deleted'];

                if (!validStatuses.includes(options.status)) {
                    throw AppError.validation('Invalid status filter', {
                        context: {
                            provided: options.status,
                            validValues: validStatuses
                        }
                    });
                }
                query['status.current'] = options.status;
            } else {
                // Default to active notes only
                if (!options.includeArchived) {
                    query['status.current'] = 'active';
                } else {
                    query['status.current'] = { $in: ['active', 'archived'] };
                }
            }

            // Apply search filter
            if (options.search && options.search.trim()) {
                const searchTerm = options.search.trim();
                query.$or = [
                    { 'content.title': { $regex: searchTerm, $options: 'i' } },
                    { 'content.body': { $regex: searchTerm, $options: 'i' } },
                    { 'content.summary': { $regex: searchTerm, $options: 'i' } },
                    { 'mentions.keywords.manual': { $regex: searchTerm, $options: 'i' } },
                    { 'classification.tags.user': { $regex: searchTerm, $options: 'i' } }
                ];
            }

            // PHASE 3: BUILD SORT OPTIONS
            const sortBy = options.sortBy || 'createdAt';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
            const sort = { [sortBy]: sortOrder };

            // Add secondary sort by createdAt for consistent ordering
            if (sortBy !== 'createdAt') {
                sort['createdAt'] = -1;
            }

            // PHASE 4: PAGINATION
            const limit = options.limit ? parseInt(options.limit, 10) : 50;
            const skip = options.skip ? parseInt(options.skip, 10) : 0;

            if (limit > 100) {
                throw AppError.validation('Limit cannot exceed 100 notes per request', {
                    context: { requestedLimit: limit, maxLimit: 100 }
                });
            }

            // PHASE 5: EXECUTE QUERY
            const [notes, totalCount] = await Promise.all([
                ClientNote.find(query)
                    .select('-__v -searchTokens -personalPreferences.notes')
                    .populate('metadata.createdBy', 'profile.firstName profile.lastName email')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                ClientNote.countDocuments(query)
            ]);

            // PHASE 6: SANITIZE OUTPUT
            const sanitizedNotes = notes.map(note => this._sanitizeNoteOutput(note));

            const duration = Date.now() - startTime;

            logger.info('Get all notes completed successfully', {
                operationId,
                clientId: clientId,
                count: notes.length,
                totalCount: totalCount,
                duration: `${duration}ms`,
                filters: {
                    type: options.type,
                    importance: options.importance,
                    category: options.category,
                    status: options.status,
                    hasSearch: !!options.search
                }
            });

            return {
                notes: sanitizedNotes,
                metadata: {
                    total: totalCount,
                    count: notes.length,
                    limit: limit,
                    skip: skip,
                    hasMore: skip + notes.length < totalCount,
                    filters: {
                        type: options.type,
                        importance: options.importance,
                        category: options.category,
                        status: options.status || 'active',
                        search: options.search,
                        includeArchived: options.includeArchived
                    }
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Get all notes failed', {
                operationId,
                error: error.message,
                duration: `${duration}ms`,
                userClientId: options.userClientId
            });

            throw error;
        }
    }

    /**
     * Update note information with access control
     */
    async updateNote(noteId, updateData, options = {}) {
        try {
            logger.info('Updating note', {
                noteId,
                updateFields: Object.keys(updateData),
                userId: options.userId
            });

            if (!mongoose.Types.ObjectId.isValid(noteId)) {
                throw AppError.validation('Invalid note ID format', {
                    context: { noteId }
                });
            }

            await this._validateNoteUpdateData(updateData);

            // Get existing note with access control
            const existingNote = await this.getNoteById(noteId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            // Flatten nested objects into dot notation
            const flattenUpdate = (obj, prefix = '') => {
                const flattened = {};

                for (const [key, value] of Object.entries(obj)) {
                    const newKey = prefix ? `${prefix}.${key}` : key;

                    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                        Object.assign(flattened, flattenUpdate(value, newKey));
                    } else {
                        flattened[newKey] = value;
                    }
                }

                return flattened;
            };

            const flattenedUpdate = flattenUpdate(updateData);

            // Recalculate metrics if content changed
            if (updateData.content?.body) {
                flattenedUpdate['content.wordCount'] = this._countWords(updateData.content.body);
                flattenedUpdate['content.characterCount'] = updateData.content.body.length;
                flattenedUpdate['content.readingTime'] = Math.ceil(flattenedUpdate['content.wordCount'] / 200);
            }

            // Handle version increment if creating new version
            if (options.createNewVersion && this.config.enableVersionControl) {
                const currentVersion = existingNote.versioning?.version || 1;
                flattenedUpdate['versioning.version'] = currentVersion + 1;
                flattenedUpdate['versioning.lastModified.date'] = new Date();
                flattenedUpdate['versioning.lastModified.by'] = options.userId;
            }

            // Perform update with flattened fields
            const updatedNote = await ClientNote.findByIdAndUpdate(
                noteId,
                { $set: flattenedUpdate },
                { new: true, runValidators: true }
            ).lean();

            if (!updatedNote) {
                throw AppError.notFound('Note not found for update');
            }

            logger.info('Note updated successfully', {
                noteId,
                userId: options.userId
            });

            // Track update event
            setImmediate(async () => {
                try {
                    await this._trackNoteEvent(updatedNote, 'note_updated', {
                        updatedFields: Object.keys(updateData),
                        userId: options.userId,
                        newVersion: options.createNewVersion
                    });
                } catch (trackError) {
                    logger.error('Failed to track update event', {
                        error: trackError.message,
                        noteId
                    });
                }
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
     * Delete/archive note with access control
     */
    async deleteNote(noteId, options = {}) {
        try {
            logger.info('Deleting note', {
                noteId,
                softDelete: options.softDelete,
                userId: options.userId
            });

            // Validate note ID format
            if (!mongoose.Types.ObjectId.isValid(noteId)) {
                throw AppError.validation('Invalid note ID format', {
                    context: { noteId }
                });
            }

            // Get existing note with access control
            const existingNote = await this.getNoteById(noteId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            let result;

            if (options.softDelete !== false) {
                // Soft delete - mark as deleted
                result = await ClientNote.findByIdAndUpdate(
                    noteId,
                    {
                        $set: {
                            'status.isDeleted': true,
                            'status.current': 'deleted',
                            'status.isActive': false,
                            'status.deletedAt': new Date(),
                            'status.deletedBy': options.userId
                        }
                    },
                    { new: true }
                ).lean();
            } else {
                // Hard delete - only if authorized
                if (!options.forceDelete) {
                    throw AppError.forbidden('Hard delete requires force flag');
                }
                result = await ClientNote.findByIdAndDelete(noteId).lean();
            }

            logger.info('Note deleted successfully', {
                noteId,
                softDelete: options.softDelete !== false,
                userId: options.userId
            });

            // Track deletion event
            setImmediate(async () => {
                try {
                    await this._trackNoteEvent(existingNote, 'note_deleted', {
                        softDelete: options.softDelete !== false,
                        userId: options.userId
                    });
                } catch (trackError) {
                    logger.error('Failed to track deletion event', {
                        error: trackError.message,
                        noteId
                    });
                }
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
     * Add comment to note with access control
     */
    async addComment(noteId, commentData, options = {}) {
        try {
            logger.info('Adding comment to note', {
                noteId,
                userId: options.userId
            });

            // Get note with access control
            const note = await this.getNoteById(noteId, {
                tenantId: options.tenantId,
                userClientId: options.userClientId,
                skipTenantCheck: options.skipTenantCheck
            });

            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            // Prepare comment
            const comment = {
                commentId: `COM-${Date.now()}`,
                content: commentData.content,
                author: options.userId,
                createdAt: new Date(),
                resolved: false
            };

            // Update note with comment
            const updatedNote = await ClientNote.findByIdAndUpdate(
                noteId,
                {
                    $push: { 'collaboration.comments': comment },
                    $inc: { 'analytics.engagement.interactions': 1 },
                    $set: { 'analytics.engagement.lastInteraction': new Date() }
                },
                { new: true }
            ).lean();

            logger.info('Comment added successfully', {
                noteId,
                commentId: comment.commentId,
                userId: options.userId
            });

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
     * Validate note data with enhanced error reporting
     * @private
     */
    async _validateNoteData(noteData) {
        const errors = [];

        logger.debug('Starting note data validation', {
            hasClientId: !!noteData.clientId,
            hasContent: !!noteData.content
        });

        // Required fields
        if (!noteData.clientId) {
            errors.push({ field: 'clientId', message: 'Client ID is required' });
        }

        if (!noteData.content?.body) {
            errors.push({ field: 'content.body', message: 'Note content is required' });
        }

        if (noteData.content?.body && noteData.content.body.length > this.config.maxNoteLength) {
            errors.push({
                field: 'content.body',
                message: `Note content exceeds maximum length of ${this.config.maxNoteLength} characters`
            });
        }

        if (noteData.content?.title && noteData.content.title.length > 500) {
            errors.push({
                field: 'content.title',
                message: 'Note title exceeds maximum length of 500 characters'
            });
        }

        // Validate note type if provided
        if (noteData.classification?.type) {
            const validTypes = Object.values(NOTE_TYPES);
            if (!validTypes.includes(noteData.classification.type)) {
                errors.push({
                    field: 'classification.type',
                    message: `Invalid note type. Must be one of: ${validTypes.join(', ')}`
                });
            }
        }

        if (errors.length > 0) {
            logger.error('Note validation failed with errors', {
                errors: errors,
                noteData: {
                    clientId: noteData.clientId,
                    noteTitle: noteData.content?.title,
                    noteType: noteData.classification?.type
                }
            });

            throw AppError.validation('Note validation failed', { errors });
        }

        logger.debug('Note validation passed successfully');
    }

    /**
     * Validate note update data
     * @private
     */
    async _validateNoteUpdateData(updateData) {
        const errors = [];

        // Cannot update immutable fields
        const immutableFields = ['noteId', 'clientId', 'tenantId', 'organizationId', 'metadata.createdAt', 'metadata.createdBy'];
        for (const field of immutableFields) {
            if (updateData[field] !== undefined) {
                errors.push({ field, message: `${field} cannot be updated` });
            }
        }

        // Validate note content length if provided
        if (updateData.content?.body && updateData.content.body.length > this.config.maxNoteLength) {
            errors.push({
                field: 'content.body',
                message: `Note content exceeds maximum length of ${this.config.maxNoteLength} characters`
            });
        }

        // Validate note title length if provided
        if (updateData.content?.title && updateData.content.title.length > 500) {
            errors.push({
                field: 'content.title',
                message: 'Note title exceeds maximum length of 500 characters'
            });
        }

        if (errors.length > 0) {
            throw AppError.validation('Note update validation failed', { errors });
        }
    }

    /**
     * Check note limit for client
     * @private
     */
    async _checkNoteLimit(clientId) {
        const dbService = this._getDatabaseService();
        const ClientNote = dbService.getModel('ClientNote', 'customer');

        const count = await ClientNote.countDocuments({
            clientId: clientId,
            'status.isDeleted': { $ne: true }
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
        const ClientNote = dbService.getModel('ClientNote', 'customer');
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
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Generate summary from content
     * @private
     */
    _generateSummary(content) {
        if (!content) return '';

        // Get first 3 sentences or 200 characters
        const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
        const summary = sentences.slice(0, 3).join(' ');

        return summary.length > 200
            ? summary.substring(0, 197) + '...'
            : summary;
    }

    /**
     * Record note view
     * @private
     */
    async _recordNoteView(noteId, userId) {
        try {
            const dbService = this._getDatabaseService();
            const ClientNote = dbService.getModel('ClientNote', 'customer');

            await ClientNote.findByIdAndUpdate(
                noteId,
                {
                    $inc: {
                        'analytics.views.total': 1
                    },
                    $set: {
                        'analytics.views.lastViewed': new Date()
                    },
                    $push: {
                        'analytics.views.viewHistory': {
                            $each: [{
                                viewedBy: userId,
                                viewedAt: new Date()
                            }],
                            $slice: -100
                        }
                    }
                }
            );

            logger.debug('Note view recorded', { noteId, userId });
        } catch (error) {
            logger.error('Failed to record note view', {
                error: error.message,
                noteId,
                userId
            });
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

        } catch (error) {
            logger.error('Post-note creation activities failed (non-blocking)', {
                error: error.message,
                noteId: note.noteId
            });
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
            logger.error('Failed to track note event', {
                error: error.message,
                eventType,
                noteId: note._id || note.id
            });
        }
    }

    /**
     * Sanitize note output
     * @private
     */
    _sanitizeNoteOutput(note) {
        if (!note) return null;

        const noteObject = note.toObject ? note.toObject() : note;

        // Remove sensitive and internal fields
        delete noteObject.__v;
        delete noteObject.searchTokens;
        delete noteObject.personalPreferences?.notes;
        delete noteObject.status?.deletedAt;
        delete noteObject.status?.deletedBy;

        return noteObject;
    }
}

module.exports = new ClientNoteService();