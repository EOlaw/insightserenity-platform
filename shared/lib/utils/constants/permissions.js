'use strict';

/**
 * @fileoverview Enterprise permission constants
 * @version 1.0.0
 * @author Enterprise Development Team
 * @since 2024-01-01
 */

/**
 * System permission constants for role-based access control
 */
class Permissions {
    // User Management Permissions
    static USER_CREATE = 'user:create';
    static USER_READ = 'user:read';
    static USER_UPDATE = 'user:update';
    static USER_DELETE = 'user:delete';
    static USER_LIST = 'user:list';
    static USER_MANAGE_ROLES = 'user:manage_roles';
    static USER_MANAGE_PERMISSIONS = 'user:manage_permissions';
    static USER_IMPERSONATE = 'user:impersonate';

    // Organization Management Permissions
    static ORG_CREATE = 'organization:create';
    static ORG_READ = 'organization:read';
    static ORG_UPDATE = 'organization:update';
    static ORG_DELETE = 'organization:delete';
    static ORG_LIST = 'organization:list';
    static ORG_MANAGE_MEMBERS = 'organization:manage_members';
    static ORG_MANAGE_SETTINGS = 'organization:manage_settings';
    static ORG_BILLING = 'organization:billing';

    // Content Management Permissions
    static CONTENT_CREATE = 'content:create';
    static CONTENT_READ = 'content:read';
    static CONTENT_UPDATE = 'content:update';
    static CONTENT_DELETE = 'content:delete';
    static CONTENT_PUBLISH = 'content:publish';
    static CONTENT_MODERATE = 'content:moderate';
    static CONTENT_ARCHIVE = 'content:archive';

    // System Administration Permissions
    static SYSTEM_ADMIN = 'system:admin';
    static SYSTEM_CONFIG = 'system:config';
    static SYSTEM_MONITOR = 'system:monitor';
    static SYSTEM_BACKUP = 'system:backup';
    static SYSTEM_LOGS = 'system:logs';
    static SYSTEM_MAINTENANCE = 'system:maintenance';

    // API Permissions
    static API_READ = 'api:read';
    static API_WRITE = 'api:write';
    static API_DELETE = 'api:delete';
    static API_ADMIN = 'api:admin';

    // File Management Permissions
    static FILE_UPLOAD = 'file:upload';
    static FILE_DOWNLOAD = 'file:download';
    static FILE_DELETE = 'file:delete';
    static FILE_MANAGE = 'file:manage';

    // Reporting Permissions
    static REPORT_VIEW = 'report:view';
    static REPORT_CREATE = 'report:create';
    static REPORT_EXPORT = 'report:export';
    static REPORT_ADMIN = 'report:admin';

    // Billing Permissions
    static BILLING_VIEW = 'billing:view';
    static BILLING_MANAGE = 'billing:manage';
    static BILLING_ADMIN = 'billing:admin';

    // Audit Permissions
    static AUDIT_VIEW = 'audit:view';
    static AUDIT_MANAGE = 'audit:manage';

    /**
     * Get all permissions grouped by category
     * @returns {Object} Grouped permissions
     */
    static getAllGrouped() {
        return {
            user: [
                this.USER_CREATE,
                this.USER_READ,
                this.USER_UPDATE,
                this.USER_DELETE,
                this.USER_LIST,
                this.USER_MANAGE_ROLES,
                this.USER_MANAGE_PERMISSIONS,
                this.USER_IMPERSONATE
            ],
            organization: [
                this.ORG_CREATE,
                this.ORG_READ,
                this.ORG_UPDATE,
                this.ORG_DELETE,
                this.ORG_LIST,
                this.ORG_MANAGE_MEMBERS,
                this.ORG_MANAGE_SETTINGS,
                this.ORG_BILLING
            ],
            content: [
                this.CONTENT_CREATE,
                this.CONTENT_READ,
                this.CONTENT_UPDATE,
                this.CONTENT_DELETE,
                this.CONTENT_PUBLISH,
                this.CONTENT_MODERATE,
                this.CONTENT_ARCHIVE
            ],
            system: [
                this.SYSTEM_ADMIN,
                this.SYSTEM_CONFIG,
                this.SYSTEM_MONITOR,
                this.SYSTEM_BACKUP,
                this.SYSTEM_LOGS,
                this.SYSTEM_MAINTENANCE
            ],
            api: [
                this.API_READ,
                this.API_WRITE,
                this.API_DELETE,
                this.API_ADMIN
            ],
            file: [
                this.FILE_UPLOAD,
                this.FILE_DOWNLOAD,
                this.FILE_DELETE,
                this.FILE_MANAGE
            ],
            report: [
                this.REPORT_VIEW,
                this.REPORT_CREATE,
                this.REPORT_EXPORT,
                this.REPORT_ADMIN
            ],
            billing: [
                this.BILLING_VIEW,
                this.BILLING_MANAGE,
                this.BILLING_ADMIN
            ],
            audit: [
                this.AUDIT_VIEW,
                this.AUDIT_MANAGE
            ]
        };
    }

    /**
     * Get all permissions as a flat array
     * @returns {Array<string>} All permissions
     */
    static getAll() {
        const grouped = this.getAllGrouped();
        return Object.values(grouped).flat();
    }

    /**
     * Check if a permission exists
     * @param {string} permission - Permission to check
     * @returns {boolean} True if permission exists
     */
    static exists(permission) {
        return this.getAll().includes(permission);
    }

    /**
     * Get permissions by category
     * @param {string} category - Category name
     * @returns {Array<string>} Permissions in category
     */
    static getByCategory(category) {
        const grouped = this.getAllGrouped();
        return grouped[category] || [];
    }

    /**
     * Get permission categories
     * @returns {Array<string>} Available categories
     */
    static getCategories() {
        return Object.keys(this.getAllGrouped());
    }
}

module.exports = Permissions;
