'use strict';

/**
 * @fileoverview Enterprise role constants with permission mappings
 * @version 1.0.0
 * @author Enterprise Development Team
 * @since 2024-01-01
 */

const Permissions = require('./permissions');

/**
 * System role constants with associated permissions
 */
class Roles {
    // System Roles
    static SUPER_ADMIN = 'super_admin';
    static SYSTEM_ADMIN = 'system_admin';
    static PLATFORM_ADMIN = 'platform_admin';

    // Organization Roles
    static ORG_OWNER = 'org_owner';
    static ORG_ADMIN = 'org_admin';
    static ORG_MANAGER = 'org_manager';
    static ORG_MEMBER = 'org_member';

    // Content Roles
    static CONTENT_ADMIN = 'content_admin';
    static CONTENT_EDITOR = 'content_editor';
    static CONTENT_AUTHOR = 'content_author';
    static CONTENT_REVIEWER = 'content_reviewer';

    // User Roles
    static USER_ADMIN = 'user_admin';
    static USER_MANAGER = 'user_manager';
    static USER = 'user';

    // Support Roles
    static SUPPORT_ADMIN = 'support_admin';
    static SUPPORT_AGENT = 'support_agent';

    // Developer Roles
    static DEVELOPER = 'developer';
    static API_USER = 'api_user';

    // Guest/Limited Roles
    static GUEST = 'guest';
    static VIEWER = 'viewer';

    /**
     * Get role permissions mapping
     * @returns {Object} Role to permissions mapping
     */
    static getRolePermissions() {
        return {
            [this.SUPER_ADMIN]: Permissions.getAll(),

            [this.SYSTEM_ADMIN]: [
                ...Permissions.getByCategory('system'),
                ...Permissions.getByCategory('user'),
                ...Permissions.getByCategory('organization'),
                ...Permissions.getByCategory('audit'),
                Permissions.REPORT_ADMIN,
                Permissions.API_ADMIN
            ],

            [this.PLATFORM_ADMIN]: [
                Permissions.SYSTEM_CONFIG,
                Permissions.SYSTEM_MONITOR,
                Permissions.SYSTEM_LOGS,
                ...Permissions.getByCategory('organization'),
                ...Permissions.getByCategory('user'),
                Permissions.REPORT_ADMIN,
                Permissions.AUDIT_VIEW
            ],

            [this.ORG_OWNER]: [
                ...Permissions.getByCategory('organization'),
                Permissions.USER_CREATE,
                Permissions.USER_READ,
                Permissions.USER_UPDATE,
                Permissions.USER_DELETE,
                Permissions.USER_LIST,
                Permissions.USER_MANAGE_ROLES,
                ...Permissions.getByCategory('content'),
                ...Permissions.getByCategory('billing'),
                Permissions.REPORT_VIEW,
                Permissions.REPORT_CREATE,
                Permissions.REPORT_EXPORT,
                ...Permissions.getByCategory('file')
            ],

            [this.ORG_ADMIN]: [
                Permissions.ORG_READ,
                Permissions.ORG_UPDATE,
                Permissions.ORG_MANAGE_MEMBERS,
                Permissions.ORG_MANAGE_SETTINGS,
                Permissions.USER_CREATE,
                Permissions.USER_READ,
                Permissions.USER_UPDATE,
                Permissions.USER_LIST,
                Permissions.USER_MANAGE_ROLES,
                ...Permissions.getByCategory('content'),
                Permissions.BILLING_VIEW,
                Permissions.BILLING_MANAGE,
                Permissions.REPORT_VIEW,
                Permissions.REPORT_CREATE,
                ...Permissions.getByCategory('file')
            ],

            [this.ORG_MANAGER]: [
                Permissions.ORG_READ,
                Permissions.ORG_MANAGE_MEMBERS,
                Permissions.USER_CREATE,
                Permissions.USER_READ,
                Permissions.USER_UPDATE,
                Permissions.USER_LIST,
                Permissions.CONTENT_CREATE,
                Permissions.CONTENT_READ,
                Permissions.CONTENT_UPDATE,
                Permissions.CONTENT_DELETE,
                Permissions.CONTENT_PUBLISH,
                Permissions.BILLING_VIEW,
                Permissions.REPORT_VIEW,
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD,
                Permissions.FILE_MANAGE
            ],

            [this.ORG_MEMBER]: [
                Permissions.ORG_READ,
                Permissions.USER_READ,
                Permissions.CONTENT_CREATE,
                Permissions.CONTENT_READ,
                Permissions.CONTENT_UPDATE,
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD,
                Permissions.REPORT_VIEW
            ],

            [this.CONTENT_ADMIN]: [
                ...Permissions.getByCategory('content'),
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD,
                Permissions.FILE_DELETE,
                Permissions.FILE_MANAGE,
                Permissions.USER_READ,
                Permissions.USER_LIST
            ],

            [this.CONTENT_EDITOR]: [
                Permissions.CONTENT_CREATE,
                Permissions.CONTENT_READ,
                Permissions.CONTENT_UPDATE,
                Permissions.CONTENT_DELETE,
                Permissions.CONTENT_PUBLISH,
                Permissions.CONTENT_MODERATE,
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD,
                Permissions.FILE_DELETE
            ],

            [this.CONTENT_AUTHOR]: [
                Permissions.CONTENT_CREATE,
                Permissions.CONTENT_READ,
                Permissions.CONTENT_UPDATE,
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD
            ],

            [this.CONTENT_REVIEWER]: [
                Permissions.CONTENT_READ,
                Permissions.CONTENT_MODERATE,
                Permissions.CONTENT_ARCHIVE
            ],

            [this.USER_ADMIN]: [
                ...Permissions.getByCategory('user'),
                Permissions.ORG_READ,
                Permissions.ORG_LIST,
                Permissions.AUDIT_VIEW,
                Permissions.REPORT_VIEW
            ],

            [this.USER_MANAGER]: [
                Permissions.USER_CREATE,
                Permissions.USER_READ,
                Permissions.USER_UPDATE,
                Permissions.USER_LIST,
                Permissions.USER_MANAGE_ROLES,
                Permissions.ORG_READ
            ],

            [this.USER]: [
                Permissions.USER_READ,
                Permissions.CONTENT_READ,
                Permissions.FILE_DOWNLOAD,
                Permissions.REPORT_VIEW
            ],

            [this.SUPPORT_ADMIN]: [
                Permissions.USER_READ,
                Permissions.USER_LIST,
                Permissions.USER_UPDATE,
                Permissions.ORG_READ,
                Permissions.ORG_LIST,
                Permissions.CONTENT_READ,
                Permissions.AUDIT_VIEW,
                Permissions.REPORT_VIEW,
                Permissions.SYSTEM_LOGS
            ],

            [this.SUPPORT_AGENT]: [
                Permissions.USER_READ,
                Permissions.USER_LIST,
                Permissions.ORG_READ,
                Permissions.ORG_LIST,
                Permissions.CONTENT_READ,
                Permissions.REPORT_VIEW
            ],

            [this.DEVELOPER]: [
                ...Permissions.getByCategory('api'),
                Permissions.SYSTEM_LOGS,
                Permissions.REPORT_VIEW,
                Permissions.FILE_UPLOAD,
                Permissions.FILE_DOWNLOAD
            ],

            [this.API_USER]: [
                Permissions.API_READ,
                Permissions.API_WRITE
            ],

            [this.VIEWER]: [
                Permissions.CONTENT_READ,
                Permissions.USER_READ,
                Permissions.ORG_READ,
                Permissions.FILE_DOWNLOAD
            ],

            [this.GUEST]: [
                Permissions.CONTENT_READ
            ]
        };
    }

    /**
     * Get all available roles
     * @returns {Array<string>} All role names
     */
    static getAll() {
        return Object.keys(this.getRolePermissions());
    }

    /**
     * Get permissions for a specific role
     * @param {string} role - Role name
     * @returns {Array<string>} Permissions for the role
     */
    static getPermissions(role) {
        const rolePermissions = this.getRolePermissions();
        return rolePermissions[role] || [];
    }

    /**
     * Check if a role exists
     * @param {string} role - Role to check
     * @returns {boolean} True if role exists
     */
    static exists(role) {
        return this.getAll().includes(role);
    }

    /**
     * Check if a role has a specific permission
     * @param {string} role - Role name
     * @param {string} permission - Permission to check
     * @returns {boolean} True if role has permission
     */
    static hasPermission(role, permission) {
        const permissions = this.getPermissions(role);
        return permissions.includes(permission);
    }

    /**
     * Get roles that have a specific permission
     * @param {string} permission - Permission to search for
     * @returns {Array<string>} Roles with the permission
     */
    static getRolesWithPermission(permission) {
        const rolePermissions = this.getRolePermissions();
        return Object.keys(rolePermissions).filter(role =>
            rolePermissions[role].includes(permission)
        );
    }

    /**
     * Get role hierarchy (higher roles inherit lower role permissions)
     * @returns {Object} Role hierarchy mapping
     */
    static getHierarchy() {
        return {
            [this.SUPER_ADMIN]: [this.SYSTEM_ADMIN, this.PLATFORM_ADMIN],
            [this.SYSTEM_ADMIN]: [this.PLATFORM_ADMIN, this.USER_ADMIN],
            [this.PLATFORM_ADMIN]: [this.USER_ADMIN, this.SUPPORT_ADMIN],
            [this.ORG_OWNER]: [this.ORG_ADMIN, this.ORG_MANAGER, this.ORG_MEMBER],
            [this.ORG_ADMIN]: [this.ORG_MANAGER, this.ORG_MEMBER],
            [this.ORG_MANAGER]: [this.ORG_MEMBER],
            [this.CONTENT_ADMIN]: [this.CONTENT_EDITOR, this.CONTENT_AUTHOR, this.CONTENT_REVIEWER],
            [this.CONTENT_EDITOR]: [this.CONTENT_AUTHOR],
            [this.USER_ADMIN]: [this.USER_MANAGER, this.USER],
            [this.USER_MANAGER]: [this.USER],
            [this.SUPPORT_ADMIN]: [this.SUPPORT_AGENT],
            [this.DEVELOPER]: [this.API_USER],
            [this.USER]: [this.VIEWER, this.GUEST],
            [this.VIEWER]: [this.GUEST]
        };
    }

    /**
     * Get roles grouped by category
     * @returns {Object} Roles grouped by type
     */
    static getGrouped() {
        return {
            system: [this.SUPER_ADMIN, this.SYSTEM_ADMIN, this.PLATFORM_ADMIN],
            organization: [this.ORG_OWNER, this.ORG_ADMIN, this.ORG_MANAGER, this.ORG_MEMBER],
            content: [this.CONTENT_ADMIN, this.CONTENT_EDITOR, this.CONTENT_AUTHOR, this.CONTENT_REVIEWER],
            user: [this.USER_ADMIN, this.USER_MANAGER, this.USER],
            support: [this.SUPPORT_ADMIN, this.SUPPORT_AGENT],
            development: [this.DEVELOPER, this.API_USER],
            limited: [this.GUEST, this.VIEWER]
        };
    }

    /**
     * Check if a role is higher than another in hierarchy
     * @param {string} role1 - First role
     * @param {string} role2 - Second role
     * @returns {boolean} True if role1 is higher than role2
     */
    static isHigherRole(role1, role2) {
        const hierarchy = this.getHierarchy();

        function checkHierarchy(higherRole, lowerRole) {
            const subordinates = hierarchy[higherRole] || [];
            if (subordinates.includes(lowerRole)) return true;

            return subordinates.some(subordinate =>
                checkHierarchy(subordinate, lowerRole)
            );
        }

        return checkHierarchy(role1, role2);
    }
}

module.exports = Roles;
