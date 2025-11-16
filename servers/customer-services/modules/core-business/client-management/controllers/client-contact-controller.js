/**
 * @fileoverview Client Contact Management Controller
 * @module servers/customer-services/modules/core-business/client-management/controllers/client-contact-controller
 * @description HTTP request handlers for client contact operations
 */

const ClientContactService = require('../services/client-contact-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-contact-controller'
});

/**
 * Client Contact Controller
 * @class ClientContactController
 */
class ClientContactController {
    /**
     * Create a new contact
     * @route POST /api/v1/clients/contacts
     */
    async createContact(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;

            logger.info('Create contact request received', {
                clientId: req.body.clientId,
                userId: userId
            });

            const contactData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                source: req.body.source || 'manual',
                sendWelcome: req.body.sendWelcome === true,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress
            };

            const contact = await ClientContactService.createContact(contactData, options);

            logger.info('Contact created successfully', {
                contactId: contact.contactId,
                userId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Contact created successfully',
                data: contact
            });

        } catch (error) {
            logger.error('Create contact failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get contact by ID
     * @route GET /api/v1/clients/contacts/:id
     */
    async getContactById(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get contact by ID request', {
                contactId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                populate: req.query.populate === 'true',
                includeDeleted: req.query.includeDeleted === 'true'
            };

            const contact = await ClientContactService.getContactById(id, options);

            logger.info('Contact fetched successfully', {
                contactId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: contact
            });

        } catch (error) {
            logger.error('Get contact by ID failed', {
                error: error.message,
                contactId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get all contacts for authenticated client
     * @route GET /api/v1/clients/contacts
     */
    async getContacts(req, res, next) {
        try {
            const userId = req.user?._id || req.user?.id;

            logger.info('Get all contacts request', {
                userId: userId,
                userClientId: req.user?.clientId,
                query: req.query
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                status: req.query.status,
                role: req.query.role,
                search: req.query.search,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder,
                limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
                skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
                includeDeleted: req.query.includeDeleted === 'true'
            };

            const result = await ClientContactService.getContacts(options);

            logger.info('All contacts fetched successfully', {
                userId: userId,
                count: result.contacts.length,
                total: result.metadata.total
            });

            res.status(200).json({
                success: true,
                data: result.contacts,
                metadata: result.metadata
            });

        } catch (error) {
            logger.error('Get all contacts failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get contacts by client
     * @route GET /api/v1/clients/:clientId/contacts
     */
    async getContactsByClient(req, res, next) {
        try {
            const { clientId } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get contacts by client request', {
                clientId,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId,
                status: req.query.status,
                role: req.query.role,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            const contacts = await ClientContactService.getContactsByClient(clientId, options);

            logger.info('Contacts fetched successfully', {
                clientId,
                count: contacts.length,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    contacts,
                    count: contacts.length
                }
            });

        } catch (error) {
            logger.error('Get contacts by client failed', {
                error: error.message,
                clientId: req.params.clientId
            });
            next(error);
        }
    }

    /**
     * Update contact
     * @route PUT /api/v1/clients/contacts/:id
     * @route PATCH /api/v1/clients/contacts/:id
     */
    async updateContact(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const userId = req.user?._id || req.user?.id;

            logger.info('Update contact request', {
                contactId: id,
                updateFields: Object.keys(updateData),
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const contact = await ClientContactService.updateContact(id, updateData, options);

            logger.info('Contact updated successfully', {
                contactId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                message: 'Contact updated successfully',
                data: contact
            });

        } catch (error) {
            logger.error('Update contact failed', {
                error: error.message,
                contactId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Delete contact
     * @route DELETE /api/v1/clients/contacts/:id
     */
    async deleteContact(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Delete contact request', {
                contactId: id,
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

            const result = await ClientContactService.deleteContact(id, options);

            logger.info('Contact deleted successfully', {
                contactId: id,
                deletionType: result.deletionType,
                userId: userId
            });

            res.status(200).json({
                success: true,
                message: 'Contact deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Delete contact failed', {
                error: error.message,
                contactId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Record contact interaction
     * @route POST /api/v1/clients/contacts/:id/interactions
     */
    async recordInteraction(req, res, next) {
        try {
            const { id } = req.params;
            const interactionData = req.body;
            const userId = req.user?._id || req.user?.id;

            logger.info('Record interaction request', {
                contactId: id,
                type: interactionData.type,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const contact = await ClientContactService.recordInteraction(id, interactionData, options);

            logger.info('Interaction recorded successfully', {
                contactId: id,
                userId: userId
            });

            res.status(201).json({
                success: true,
                message: 'Interaction recorded successfully',
                data: contact
            });

        } catch (error) {
            logger.error('Record interaction failed', {
                error: error.message,
                contactId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get contact engagement metrics
     * @route GET /api/v1/clients/contacts/:id/engagement
     */
    async getContactEngagement(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user?._id || req.user?.id;

            logger.info('Get contact engagement request', {
                contactId: id,
                userId: userId
            });

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: userId,
                userClientId: req.user?.clientId
            };

            const contact = await ClientContactService.getContactById(id, options);

            logger.info('Contact engagement fetched successfully', {
                contactId: id,
                userId: userId
            });

            res.status(200).json({
                success: true,
                data: {
                    engagement: contact.engagement,
                    relationship: contact.relationship,
                    interactions: contact.interactions
                }
            });

        } catch (error) {
            logger.error('Get contact engagement failed', {
                error: error.message,
                contactId: req.params.id
            });
            next(error);
        }
    }
}

module.exports = new ClientContactController();