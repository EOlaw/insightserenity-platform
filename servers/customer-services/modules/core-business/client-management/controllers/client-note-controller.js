/**
 * @fileoverview Client Note Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-note-controller
 * @description HTTP request handlers for client note operations with self-service access control
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
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Create note request received', {
                clientId: req.body.clientId,
                noteTitle: req.body.content?.title,
                noteType: req.body.classification?.type,
                userId: userId
            });

            const noteData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                source: req.body.source || 'web',
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress
            };

            const note = await ClientNoteService.createNote(noteData, options);

            logger.info('Note created successfully', {
                noteId: note.noteId,
                userId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Note created successfully',
                data: note
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
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Get note by ID request', {
                noteId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                populate: req.query.populate === 'true',
                includeDeleted: req.query.includeDeleted === 'true',
                trackView: req.query.trackView !== 'false'
            };

            const note = await ClientNoteService.getNoteById(id, options);

            logger.info('Note fetched successfully', {
                noteId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: note
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
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Get notes by client request', {
                clientId,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                type: req.query.type,
                category: req.query.category,
                importance: req.query.importance,
                tags: req.query.tags ? req.query.tags.split(',') : undefined,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            const notes = await ClientNoteService.getNotesByClient(clientId, options);

            logger.info('Notes fetched successfully', {
                clientId,
                count: notes.length,
                userId: userId
            });

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
            const userId = req.user?._id || req.user?.id;

            logger.info('Update note request', {
                noteId: id,
                updateFields: Object.keys(updateData),
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                createNewVersion: req.body.createNewVersion === true
            };

            const note = await ClientNoteService.updateNote(id, updateData, options);

            logger.info('Note updated successfully', {
                noteId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                message: 'Note updated successfully',
                data: note
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
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Delete note request', {
                noteId: id,
                softDelete: req.query.soft !== 'false',
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            const result = await ClientNoteService.deleteNote(id, options);

            logger.info('Note deleted successfully', {
                noteId: id,
                deletionType: result.deletionType,
                userId: userId
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
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Add comment to note request', {
                noteId: id,
                userId: userId
            });

            if (!req.body.content) {
                throw AppError.validation('Comment content is required');
            }

            const commentData = {
                content: req.body.content
            };

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const note = await ClientNoteService.addComment(id, commentData, options);

            logger.info('Comment added successfully', {
                noteId: id,
                userId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Comment added successfully',
                data: note
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
     * Get note comments
     * @route GET /api/v1/notes/:id/comments
     */
    async getNoteComments(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Get note comments request', {
                noteId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const note = await ClientNoteService.getNoteById(id, options);

            logger.info('Note comments fetched successfully', {
                noteId: id,
                commentCount: note.collaboration?.comments?.length || 0,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    noteId: note.noteId,
                    comments: note.collaboration?.comments || [],
                    count: note.collaboration?.comments?.length || 0
                }
            });

        } catch (error) {
            logger.error('Get note comments failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get note analytics
     * @route GET /api/v1/notes/:id/analytics
     */
    async getNoteAnalytics(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Get note analytics request', {
                noteId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const note = await ClientNoteService.getNoteById(id, options);

            logger.info('Note analytics fetched successfully', {
                noteId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    noteId: note.noteId,
                    analytics: note.analytics,
                    engagement: {
                        viewCount: note.analytics?.views?.total || 0,
                        commentCount: note.collaboration?.comments?.length || 0,
                        shareCount: note.analytics?.engagement?.shares || 0
                    }
                }
            });

        } catch (error) {
            logger.error('Get note analytics failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get note action items
     * @route GET /api/v1/notes/:id/action-items
     */
    async getNoteActionItems(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;
            
            logger.info('Get note action items request', {
                noteId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const note = await ClientNoteService.getNoteById(id, options);

            logger.info('Note action items fetched successfully', {
                noteId: id,
                actionItemCount: note.actionItems?.length || 0,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    noteId: note.noteId,
                    actionItems: note.actionItems || [],
                    count: note.actionItems?.length || 0,
                    pending: note.actionItems?.filter(item => item.status === 'pending' || item.status === 'in_progress').length || 0
                }
            });

        } catch (error) {
            logger.error('Get note action items failed', {
                error: error.message,
                noteId: req.params.id
            });
            next(error);
        }
    }
}

module.exports = new ClientNoteController();