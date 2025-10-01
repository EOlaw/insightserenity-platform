/**
 * @fileoverview Organization Service for Managing Multi-Tenant Organizations
 * @module servers/customer-services/modules/hosted-organizations/organization-management/services/organization-service
 * @description Service layer for organization management operations
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const database = require('../../../../../../shared/lib/database');

/**
 * Organization Service
 * Handles all business logic for organization management
 * @class OrganizationService
 */
class OrganizationService {
  constructor() {
    this.Organization = null;
    this._modelInitialized = false;
  }

  /**
   * Initialize the Organization model
   * @private
   */
  async _ensureModel() {
    if (!this._modelInitialized) {
      try {
        this.Organization = await database.getModel('Organization');
        this._modelInitialized = true;
      } catch (error) {
        logger.error('Failed to initialize Organization model', {
          error: error.message
        });
        throw new AppError('Organization model not available', 500, 'MODEL_INIT_ERROR');
      }
    }
    return this.Organization;
  }

  /**
   * Get organization by ID
   * @param {string} organizationId - Organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Organization object
   */
  async getOrganization(organizationId, options = {}) {
    try {
      const Organization = await this._ensureModel();

      const query = Organization.findById(organizationId);

      if (options.populate) {
        if (Array.isArray(options.populate)) {
          options.populate.forEach(path => query.populate(path));
        } else {
          query.populate(options.populate);
        }
      }

      const organization = await query.exec();

      if (!organization) {
        throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
      }

      logger.debug('Organization retrieved', {
        organizationId: organization._id,
        name: organization.name
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error retrieving organization', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to retrieve organization', 500, 'ORG_RETRIEVAL_ERROR');
    }
  }

  /**
   * Get organization by slug
   * @param {string} slug - Organization slug
   * @returns {Promise<Object>} Organization object
   */
  async getOrganizationBySlug(slug) {
    try {
      const Organization = await this._ensureModel();
      
      const organization = await Organization.findBySlug(slug);

      if (!organization) {
        throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
      }

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error retrieving organization by slug', {
        error: error.message,
        slug
      });
      throw new AppError('Failed to retrieve organization', 500, 'ORG_RETRIEVAL_ERROR');
    }
  }

  /**
   * Get organization by custom domain
   * @param {string} domain - Custom domain
   * @returns {Promise<Object>} Organization object
   */
  async getOrganizationByDomain(domain) {
    try {
      const Organization = await this._ensureModel();
      
      const organization = await Organization.findByCustomDomain(domain);

      if (!organization) {
        throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
      }

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error retrieving organization by domain', {
        error: error.message,
        domain
      });
      throw new AppError('Failed to retrieve organization', 500, 'ORG_RETRIEVAL_ERROR');
    }
  }

  /**
   * Create a new organization
   * @param {Object} organizationData - Organization data
   * @param {string} ownerId - Owner user ID
   * @returns {Promise<Object>} Created organization
   */
  async createOrganization(organizationData, ownerId) {
    try {
      const Organization = await this._ensureModel();

      // Set owner
      organizationData.owner = ownerId;

      // Initialize with trial status
      if (!organizationData.status) {
        organizationData.status = 'trial';
      }

      const organization = new Organization(organizationData);
      await organization.save();

      logger.info('Organization created', {
        organizationId: organization._id,
        name: organization.name,
        owner: ownerId
      });

      return organization;
    } catch (error) {
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new AppError(
          `Organization with this ${field} already exists`,
          409,
          'ORG_DUPLICATE'
        );
      }

      logger.error('Error creating organization', {
        error: error.message,
        organizationData
      });
      throw new AppError('Failed to create organization', 500, 'ORG_CREATE_ERROR');
    }
  }

  /**
   * Update organization
   * @param {string} organizationId - Organization ID
   * @param {Object} updateData - Data to update
   * @param {string} updatedBy - User ID performing the update
   * @returns {Promise<Object>} Updated organization
   */
  async updateOrganization(organizationId, updateData, updatedBy) {
    try {
      const organization = await this.getOrganization(organizationId);

      // Prevent updating certain protected fields directly
      delete updateData.owner;
      delete updateData.slug;
      delete updateData.createdAt;

      Object.assign(organization, updateData);
      await organization.save();

      logger.info('Organization updated', {
        organizationId: organization._id,
        updatedBy
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error updating organization', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to update organization', 500, 'ORG_UPDATE_ERROR');
    }
  }

  /**
   * Update organization status
   * @param {string} organizationId - Organization ID
   * @param {string} newStatus - New status
   * @param {string} reason - Reason for status change
   * @param {string} changedBy - User ID performing the change
   * @returns {Promise<Object>} Updated organization
   */
  async updateOrganizationStatus(organizationId, newStatus, reason, changedBy) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.updateStatus(newStatus, reason, changedBy);

      logger.info('Organization status updated', {
        organizationId: organization._id,
        oldStatus: organization.statusHistory[1]?.status,
        newStatus: newStatus
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error updating organization status', {
        error: error.message,
        organizationId,
        newStatus
      });
      throw new AppError('Failed to update organization status', 500, 'ORG_STATUS_UPDATE_ERROR');
    }
  }

  /**
   * Check if organization can accept new customers
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Validation result
   */
  async canAcceptNewCustomers(organizationId) {
    try {
      const organization = await this.getOrganization(organizationId);
      return organization.canAcceptNewCustomers();
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error checking customer acceptance', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to check customer acceptance', 500, 'ORG_CHECK_ERROR');
    }
  }

  /**
   * Check if organization can accept new users
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Validation result
   */
  async canAcceptNewUsers(organizationId) {
    try {
      const organization = await this.getOrganization(organizationId);
      return organization.canAcceptNewUsers();
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error checking user acceptance', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to check user acceptance', 500, 'ORG_CHECK_ERROR');
    }
  }

  /**
   * Get customer count for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} Customer count
   */
  async getCustomerCount(organizationId) {
    try {
      const organization = await this.getOrganization(organizationId);
      return organization.usage.customers.current || 0;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error getting customer count', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to get customer count', 500, 'ORG_COUNT_ERROR');
    }
  }

  /**
   * Get user count for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<number>} User count
   */
  async getUserCount(organizationId) {
    try {
      const organization = await this.getOrganization(organizationId);
      return organization.usage.users.current || 0;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error getting user count', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to get user count', 500, 'ORG_COUNT_ERROR');
    }
  }

  /**
   * Increment organization usage
   * @param {string} organizationId - Organization ID
   * @param {string} metric - Usage metric (users, customers, projects, etc.)
   * @param {number} amount - Amount to increment
   * @returns {Promise<Object>} Updated organization
   */
  async incrementUsage(organizationId, metric, amount = 1) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.incrementUsage(metric, amount);

      logger.debug('Organization usage incremented', {
        organizationId: organization._id,
        metric,
        amount
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error incrementing organization usage', {
        error: error.message,
        organizationId,
        metric
      });
      throw new AppError('Failed to increment usage', 500, 'ORG_USAGE_ERROR');
    }
  }

  /**
   * Decrement organization usage
   * @param {string} organizationId - Organization ID
   * @param {string} metric - Usage metric
   * @param {number} amount - Amount to decrement
   * @returns {Promise<Object>} Updated organization
   */
  async decrementUsage(organizationId, metric, amount = 1) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.decrementUsage(metric, amount);

      logger.debug('Organization usage decremented', {
        organizationId: organization._id,
        metric,
        amount
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error decrementing organization usage', {
        error: error.message,
        organizationId,
        metric
      });
      throw new AppError('Failed to decrement usage', 500, 'ORG_USAGE_ERROR');
    }
  }

  /**
   * Add admin to organization
   * @param {string} organizationId - Organization ID
   * @param {string} userId - User ID to add as admin
   * @param {string} addedBy - User ID performing the action
   * @returns {Promise<Object>} Updated organization
   */
  async addAdmin(organizationId, userId, addedBy) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.addAdmin(userId, addedBy);

      logger.info('Admin added to organization', {
        organizationId: organization._id,
        userId,
        addedBy
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error adding admin to organization', {
        error: error.message,
        organizationId,
        userId
      });
      throw new AppError('Failed to add admin', 500, 'ORG_ADMIN_ERROR');
    }
  }

  /**
   * Remove admin from organization
   * @param {string} organizationId - Organization ID
   * @param {string} userId - User ID to remove as admin
   * @returns {Promise<Object>} Updated organization
   */
  async removeAdmin(organizationId, userId) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.removeAdmin(userId);

      logger.info('Admin removed from organization', {
        organizationId: organization._id,
        userId
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error removing admin from organization', {
        error: error.message,
        organizationId,
        userId
      });
      throw new AppError('Failed to remove admin', 500, 'ORG_ADMIN_ERROR');
    }
  }

  /**
   * Check if user is admin of organization
   * @param {string} organizationId - Organization ID
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} True if user is admin
   */
  async isAdmin(organizationId, userId) {
    try {
      const organization = await this.getOrganization(organizationId);
      return organization.isAdmin(userId);
    } catch (error) {
      logger.error('Error checking admin status', {
        error: error.message,
        organizationId,
        userId
      });
      return false;
    }
  }

  /**
   * Update organization subscription
   * @param {string} organizationId - Organization ID
   * @param {Object} subscriptionData - Subscription data
   * @returns {Promise<Object>} Updated organization
   */
  async updateSubscription(organizationId, subscriptionData) {
    try {
      const organization = await this.getOrganization(organizationId);
      await organization.updateSubscription(subscriptionData);

      logger.info('Organization subscription updated', {
        organizationId: organization._id,
        planName: subscriptionData.planName
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error updating organization subscription', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to update subscription', 500, 'ORG_SUBSCRIPTION_ERROR');
    }
  }

  /**
   * Search organizations
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchOrganizations(query, options = {}) {
    try {
      const Organization = await this._ensureModel();
      
      const results = await Organization.searchOrganizations(query, options);

      logger.debug('Organizations searched', {
        query,
        resultsCount: results.organizations.length
      });

      return results;
    } catch (error) {
      logger.error('Error searching organizations', {
        error: error.message,
        query
      });
      throw new AppError('Failed to search organizations', 500, 'ORG_SEARCH_ERROR');
    }
  }

  /**
   * List organizations with pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Organizations list with pagination
   */
  async listOrganizations(filters = {}, options = {}) {
    try {
      const Organization = await this._ensureModel();
      
      const {
        page = 1,
        limit = 20,
        sort = { createdAt: -1 }
      } = options;

      const skip = (page - 1) * limit;

      const query = {};
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.tier) {
        query['subscription.tier'] = filters.tier;
      }

      const [organizations, total] = await Promise.all([
        Organization.find(query)
          .limit(limit)
          .skip(skip)
          .sort(sort)
          .populate('owner', 'email profile.firstName profile.lastName'),
        Organization.countDocuments(query)
      ]);

      return {
        organizations,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasMore: total > skip + organizations.length
        }
      };
    } catch (error) {
      logger.error('Error listing organizations', {
        error: error.message
      });
      throw new AppError('Failed to list organizations', 500, 'ORG_LIST_ERROR');
    }
  }

  /**
   * Get organization statistics
   * @returns {Promise<Object>} Organization statistics
   */
  async getStatistics() {
    try {
      const Organization = await this._ensureModel();
      
      const stats = await Organization.getStatistics();

      logger.debug('Organization statistics retrieved');

      return stats;
    } catch (error) {
      logger.error('Error getting organization statistics', {
        error: error.message
      });
      throw new AppError('Failed to get statistics', 500, 'ORG_STATS_ERROR');
    }
  }

  /**
   * Delete organization (soft delete)
   * @param {string} organizationId - Organization ID
   * @param {string} deletedBy - User ID performing deletion
   * @returns {Promise<Object>} Deleted organization
   */
  async deleteOrganization(organizationId, deletedBy) {
    try {
      const organization = await this.getOrganization(organizationId);

      organization.status = 'cancelled';
      organization.deletedAt = new Date();
      organization.cancelledAt = new Date();

      if (!organization.statusHistory) organization.statusHistory = [];
      organization.statusHistory.unshift({
        status: 'cancelled',
        reason: 'Organization deleted',
        changedAt: new Date(),
        changedBy: deletedBy
      });

      await organization.save();

      logger.info('Organization deleted', {
        organizationId: organization._id,
        deletedBy
      });

      return organization;
    } catch (error) {
      if (error instanceof AppError) throw error;
      
      logger.error('Error deleting organization', {
        error: error.message,
        organizationId
      });
      throw new AppError('Failed to delete organization', 500, 'ORG_DELETE_ERROR');
    }
  }

  /**
   * Validate organization exists and is active
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Validation result
   */
  async validateOrganization(organizationId) {
    try {
      const organization = await this.getOrganization(organizationId);

      if (organization.status !== 'active' && organization.status !== 'trial') {
        return {
          valid: false,
          reason: `Organization is ${organization.status}`,
          code: 'ORG_NOT_ACTIVE',
          organization
        };
      }

      if (organization.isTrialExpired) {
        return {
          valid: false,
          reason: 'Trial period has expired',
          code: 'TRIAL_EXPIRED',
          organization
        };
      }

      return {
        valid: true,
        organization
      };
    } catch (error) {
      if (error instanceof AppError) {
        return {
          valid: false,
          reason: error.message,
          code: error.errorCode
        };
      }
      
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new OrganizationService();