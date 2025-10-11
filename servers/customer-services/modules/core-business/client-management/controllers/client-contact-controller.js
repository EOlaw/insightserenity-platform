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
     * @route POST /api/v1/contacts
     */
    async createContact(req, res, next) {
        try {
            logger.info('Create contact request received', {
                clientId: req.body.clientId,
                email: req.body.contactInfo?.email,
                userId: req.user?.id
            });

            const contactData = {
                ...req.body,
                tenantId: req.user?.tenantId || req.body.tenantId,
                organizationId: req.user?.organizationId || req.body.organizationId
            };

            const options = {
                tenantId: req.user?.tenantId,
                organizationId: req.user?.organizationId,
                userId: req.user?.id,
                source: req.body.source || 'manual',
                sendWelcome: req.body.sendWelcome === true
            };

            const contact = await ClientContactService.createContact(contactData, options);

            logger.info('Contact created successfully', {
                contactId: contact.contactId,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Contact created successfully',
                data: {
                    contact
                }
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
     * @route GET /api/v1/contacts/:id
     */
    async getContactById(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                populate: req.query.populate === 'true'
            };

            logger.info('Get contact by ID request', { contactId: id, userId: req.user?.id });

            const contact = await ClientContactService.getContactById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    contact
                }
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
     * Get contacts by client
     * @route GET /api/v1/clients/:clientId/contacts
     */
    async getContactsByClient(req, res, next) {
        try {
            const { clientId } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                status: req.query.status,
                role: req.query.role,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            logger.info('Get contacts by client request', {
                clientId,
                userId: req.user?.id
            });

            const contacts = await ClientContactService.getContactsByClient(clientId, options);

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
     * @route PUT /api/v1/contacts/:id
     * @route PATCH /api/v1/contacts/:id
     */
    async updateContact(req, res, next) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Update contact request', {
                contactId: id,
                updateFields: Object.keys(updateData),
                userId: req.user?.id
            });

            const contact = await ClientContactService.updateContact(id, updateData, options);

            logger.info('Contact updated successfully', {
                contactId: id,
                userId: req.user?.id
            });

            res.status(200).json({
                success: true,
                message: 'Contact updated successfully',
                data: {
                    contact
                }
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
     * @route DELETE /api/v1/contacts/:id
     */
    async deleteContact(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id,
                softDelete: req.query.soft !== 'false',
                forceDelete: req.query.force === 'true'
            };

            logger.info('Delete contact request', {
                contactId: id,
                softDelete: options.softDelete,
                userId: req.user?.id
            });

            const result = await ClientContactService.deleteContact(id, options);

            logger.info('Contact deleted successfully', {
                contactId: id,
                deletionType: result.deletionType,
                userId: req.user?.id
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
     * Search contacts
     * @route GET /api/v1/contacts/search
     * @route POST /api/v1/contacts/search
     */
    async searchContacts(req, res, next) {
        try {
            const filters = req.method === 'POST' ? req.body.filters || {} : {
                clientId: req.query.clientId,
                status: req.query.status,
                role: req.query.role,
                department: req.query.department,
                search: req.query.q || req.query.search
            };

            const options = {
                tenantId: req.user?.tenantId,
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 20,
                sortBy: req.query.sortBy,
                sortOrder: req.query.sortOrder
            };

            logger.info('Search contacts request', {
                filters,
                page: options.page,
                userId: req.user?.id
            });

            const result = await ClientContactService.searchContacts(filters, options);

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Search contacts failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Record contact interaction
     * @route POST /api/v1/contacts/:id/interactions
     */
    async recordInteraction(req, res, next) {
        try {
            const { id } = req.params;
            const interactionData = req.body;

            const options = {
                tenantId: req.user?.tenantId,
                userId: req.user?.id
            };

            logger.info('Record interaction request', {
                contactId: id,
                type: interactionData.type,
                userId: req.user?.id
            });

            const contact = await ClientContactService.recordInteraction(id, interactionData, options);

            logger.info('Interaction recorded successfully', {
                contactId: id,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: 'Interaction recorded successfully',
                data: {
                    contact
                }
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
     * Bulk create contacts
     * @route POST /api/v1/contacts/bulk
     */
    async bulkCreateContacts(req, res, next) {
        try {
            const { contacts } = req.body;

            if (!Array.isArray(contacts) || contacts.length === 0) {
                throw AppError.validation('Invalid bulk contact data');
            }

            logger.info('Bulk create contacts request', {
                count: contacts.length,
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

            for (const contactData of contacts) {
                try {
                    const contact = await ClientContactService.createContact(contactData, options);
                    results.success.push({
                        contactId: contact.contactId,
                        name: `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`,
                        email: contact.contactInfo?.email
                    });
                } catch (error) {
                    results.failed.push({
                        email: contactData.contactInfo?.email,
                        name: `${contactData.personalInfo?.firstName} ${contactData.personalInfo?.lastName}`,
                        error: error.message
                    });
                }
            }

            logger.info('Bulk create contacts completed', {
                successCount: results.success.length,
                failedCount: results.failed.length,
                userId: req.user?.id
            });

            res.status(201).json({
                success: true,
                message: `Bulk contact creation completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
                data: results
            });

        } catch (error) {
            logger.error('Bulk create contacts failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Export contacts
     * @route GET /api/v1/contacts/export
     */
    async exportContacts(req, res, next) {
        try {
            const filters = {
                clientId: req.query.clientId,
                status: req.query.status,
                role: req.query.role
            };

            const options = {
                tenantId: req.user?.tenantId,
                format: req.query.format || 'json'
            };

            logger.info('Export contacts request', {
                filters,
                format: options.format,
                userId: req.user?.id
            });

            const result = await ClientContactService.searchContacts(filters, {
                tenantId: options.tenantId,
                limit: 10000
            });

            if (options.format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
                
                const csv = this._convertToCSV(result.contacts);
                res.status(200).send(csv);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.json');
                res.status(200).json({
                    success: true,
                    exportDate: new Date().toISOString(),
                    data: result
                });
            }

        } catch (error) {
            logger.error('Export contacts failed', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get contact engagement metrics
     * @route GET /api/v1/contacts/:id/engagement
     */
    async getContactEngagement(req, res, next) {
        try {
            const { id } = req.params;
            const options = {
                tenantId: req.user?.tenantId
            };

            logger.info('Get contact engagement request', {
                contactId: id,
                userId: req.user?.id
            });

            const contact = await ClientContactService.getContactById(id, options);

            res.status(200).json({
                success: true,
                data: {
                    engagement: contact.engagement,
                    communications: contact.communications
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

    /**
     * Convert contacts array to CSV
     * @private
     */
    _convertToCSV(contacts) {
        if (!contacts || contacts.length === 0) return '';

        const headers = ['Contact ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Job Title', 'Department', 'Status', 'Created Date'];
        const rows = contacts.map(contact => [
            contact.contactId || '',
            contact.personalInfo?.firstName || '',
            contact.personalInfo?.lastName || '',
            contact.contactInfo?.email || '',
            contact.contactInfo?.phone || '',
            contact.professionalInfo?.jobTitle || '',
            contact.professionalInfo?.department || '',
            contact.status || '',
            contact.createdAt ? new Date(contact.createdAt).toISOString() : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(field => `"${field}"`).join(','))
        ].join('\n');

        return csvContent;
    }
}

module.exports = new ClientContactController();