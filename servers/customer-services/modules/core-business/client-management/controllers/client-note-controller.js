/**
 * @fileoverview Client Note Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-note-controller
 * @description HTTP request handlers for client note operations
 */

const ClientNoteService = require('../services/client-note-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-note-controller'
});

/**
 * Client Note Controller
 * @class ClientNoteController
 */
class ClientNoteController {
    /**
     * Create a new note
     * @route POST /api/v1/notes
     */
    async createNote(req, res, next) {
        try {
            logger.info('Create note request received', {
                clientId: req.body.clientId,
                noteType: req.body.type,
                userId: req.user?.id
            });

            const noteData = {
                ...req.body,
                tenantId: req.user?.tenantId || req.body.tenantId,
                organizationId: req.user?.organizationId || req.body.organizationId
            };

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                source: req.body.source || 'manual'
            };

            const note = await ClientNoteService.createNote(noteData, options);

            logger.info('Note created successfully', {
                noteId: note.noteId,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Note created successfully',
                data: {
                    note
                }
            });

        } catch (error) {
            logger.error('Create note failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get note by ID
     * @route GET /api/v1/notes/:id
     */
    async getNoteById(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                populate: req.query.populate === 'true'
            };

            logger.info('Get note by ID request', { noteId: id, userId: req.user?.id });

            const note = await ClientNoteService.getNoteById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    note
                }
            });

        } catch (error) {
            logger.error('Get note by ID failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get notes by client
     * @route GET /api/v1/clients/:clientId/notes
     */
    async getNotesByClient(req, res, next) {
        try {
            const { clientId } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                type: req.query.type,
                category: req.query.category,
                priority: req.query.priority,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                dateFrom: req.query.dateFrom,
                dateTo: req.query.dateTo,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
                page: req.query.page,
                limit: req.query.limit
            };

            logger.info('Get notes by client request', {
                clientId,
                userId: req.user?.id
            });

            const notes = await ClientNoteService.getNotesByClient(clientId, options);

            res.status(200).json({
                success: true,
                data: {
                    notes,
                    count: notes.length
                }
            });

        } catch (error) {
            logger.error('Get notes by client failed', {
                error: error.message,
                clientId: req.params.clientId
            });
            next(error);
        }
    }

    /**
     * Update note
     * @route PUT /api/v1/notes/:id
     * @route PATCH /api/v1/notes/:id
     */
    async updateNote(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Update note request', {
                noteId: id,
                updateFields: Object.keys(updateData),
                userId: req.user?.id
            });

            const note = await ClientNoteService.updateNote(id, updateData, options);

            logger.info('Note updated successfully', {
                noteId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Note updated successfully',
                data: {
                    note
                }
            });

        } catch (error) {
            logger.error('Update note failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Delete note
     * @route DELETE /api/v1/notes/:id
     */
    async deleteNote(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            logger.info('Delete note request', {
                noteId: id,
                softDelete: options.softDelete,
                userId: req.user?.id
            });

            const result = await ClientNoteService.deleteNote(id, options);

            logger.info('Note deleted successfully', {
                noteId: id,
                deletionType: result.deletionType,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Note deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Delete note failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Add comment to note
     * @route POST /api/v1/notes/:id/comments
     */
    async addComment(req, res, next) {
        try {
            const { id } = req.params;
            const commentData = {
                content: req.body.content
            };

            if (!commentData.content) {
                throw AppError.validation('Comment content is required');
            }

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Add comment request', {
                noteId: id,
                userId: req.user?.id
            });

            const note = await ClientNoteService.addComment(id, commentData, options);

            logger.info('Comment added successfully', {
                noteId: id,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Comment added successfully',
                data: {
                    note
                }
            });

        } catch (error) {
            logger.error('Add comment failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Bulk create notes
     * @route POST /api/v1/notes/bulk
     */
    async bulkCreateNotes(req, res, next) {
        try {
            const { notes } = req.body;

            if (!Array.isArray(notes) || notes.length === 0) {
                throw AppError.validation('Invalid bulk note data');
            }

            logger.info('Bulk create notes request', {
                count: notes.length,
                userId: req.user?.id
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                source: 'bulk_import'
            };

            const results = {
                success: [],
                failed: []
            };

            for (const noteData of notes) {
                try {
                    const note = await ClientNoteService.createNote(noteData, options);
                    results.success.push({
                        noteId: note.noteId,
                        title: note.content.title
                    });
                } catch (error) {
                    results.failed.push({
                        title: noteData.content?.title,
                        error: error.message
                    });
                }
            }

            logger.info('Bulk create notes completed', {
                successCount: results.success.length,
                failedCount: results.failed.length,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: `Bulk note creation completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
                data: results
            });

        } catch (error) {
            logger.error('Bulk create notes failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Convert notes array to CSV
     * @private
     */
    _convertToCSV(notes) {
        if (!notes || notes.length === 0) return '';

        const headers = ['Note ID', 'Title', 'Type', 'Category', 'Priority', 'Created By', 'Created Date', 'Word Count'];
        const rows = notes.map(note => [
            note.noteId || '',
            note.content?.title || '',
            note.type || '',
            note.category || '',
            note.priority || '',
            note.metadata?.createdBy || '',
            note.metadata?.createdAt ? new Date(note.metadata.createdAt).toISOString() : '',
            note.content?.wordCount || 0
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(field => `"${field}"`).join(','))
        ].join('\n');

        return csvContent;
    }
}

module.exports = new ClientNoteController();