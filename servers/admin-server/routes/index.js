/**
 * @fileoverview Admin Server Routes Aggregator
 * @module servers/admin-server/routes/index
 * @description Main routes aggregator for all admin server modules
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();

const { getLogger } = require('../../../shared/lib/utils/logger');
const logger = getLogger({ serviceName: 'admin-routes' });

// ============================================================================
// Import Module Routes
// ============================================================================

// Content Management System
let cmsRoutes;
try {
    cmsRoutes = require('../modules/content-management-system/routes');
    logger.info('CMS routes loaded');
} catch (error) {
    logger.warn('CMS routes not available', { error: error.message });
}

// User Management System
let userManagementRoutes;
try {
    userManagementRoutes = require('../modules/user-management-system/routes');
    logger.info('User management routes loaded');
} catch (error) {
    logger.warn('User management routes not available', { error: error.message });
}

// Client Administration
let clientAdminRoutes;
try {
    clientAdminRoutes = require('../modules/client-administration/routes');
    logger.info('Client administration routes loaded');
} catch (error) {
    logger.warn('Client administration routes not available', { error: error.message });
}

// Billing System
let billingRoutes;
try {
    billingRoutes = require('../modules/billing-system/routes');
    logger.info('Billing routes loaded');
} catch (error) {
    logger.warn('Billing routes not available', { error: error.message });
}

// Tenant Management
let tenantRoutes;
try {
    tenantRoutes = require('../modules/tenant-management/routes');
    logger.info('Tenant management routes loaded');
} catch (error) {
    logger.warn('Tenant management routes not available', { error: error.message });
}

// Analytics & Reporting
let analyticsRoutes;
try {
    analyticsRoutes = require('../modules/analytics-reporting/routes');
    logger.info('Analytics routes loaded');
} catch (error) {
    logger.warn('Analytics routes not available', { error: error.message });
}

// System Configuration
let systemRoutes;
try {
    systemRoutes = require('../modules/system-configuration/routes');
    logger.info('System configuration routes loaded');
} catch (error) {
    logger.warn('System configuration routes not available', { error: error.message });
}

// Audit & Compliance
let auditRoutes;
try {
    auditRoutes = require('../modules/audit-compliance/routes');
    logger.info('Audit routes loaded');
} catch (error) {
    logger.warn('Audit routes not available', { error: error.message });
}

// Monitoring & Health
let monitoringRoutes;
try {
    monitoringRoutes = require('../modules/monitoring-health/routes');
    logger.info('Monitoring routes loaded');
} catch (error) {
    logger.warn('Monitoring routes not available', { error: error.message });
}

// ============================================================================
// Mount Module Routes
// ============================================================================

// Content Management System - /api/v1/admin/cms
if (cmsRoutes) {
    router.use('/cms', cmsRoutes);
}

// User Management System - /api/v1/admin/users
if (userManagementRoutes) {
    router.use('/users', userManagementRoutes);
}

// Client Administration - /api/v1/admin/clients
if (clientAdminRoutes) {
    router.use('/clients', clientAdminRoutes);
}

// Billing System - /api/v1/admin/billing
if (billingRoutes) {
    router.use('/billing', billingRoutes);
}

// Tenant Management - /api/v1/admin/tenants
if (tenantRoutes) {
    router.use('/tenants', tenantRoutes);
}

// Analytics & Reporting - /api/v1/admin/analytics
if (analyticsRoutes) {
    router.use('/analytics', analyticsRoutes);
}

// System Configuration - /api/v1/admin/system
if (systemRoutes) {
    router.use('/system', systemRoutes);
}

// Audit & Compliance - /api/v1/admin/audit
if (auditRoutes) {
    router.use('/audit', auditRoutes);
}

// Monitoring & Health - /api/v1/admin/monitoring
if (monitoringRoutes) {
    router.use('/monitoring', monitoringRoutes);
}

// ============================================================================
// API Information Endpoint
// ============================================================================

/**
 * @route   GET /api/v1/admin
 * @desc    Get admin API information and available modules
 * @access  Public
 */
router.get('/', (req, res) => {
    const availableModules = [];

    if (cmsRoutes) {
        availableModules.push({
            name: 'Content Management System',
            path: '/cms',
            description: 'Blog posts, pages, media, and templates',
            status: 'active'
        });
    }

    if (userManagementRoutes) {
        availableModules.push({
            name: 'User Management System',
            path: '/users',
            description: 'Users, roles, permissions, and sessions',
            status: 'active'
        });
    }

    if (clientAdminRoutes) {
        availableModules.push({
            name: 'Client Administration',
            path: '/clients',
            description: 'Administrative client operations',
            status: 'active'
        });
    }

    if (billingRoutes) {
        availableModules.push({
            name: 'Billing System',
            path: '/billing',
            description: 'Subscriptions, invoices, and payments',
            status: 'active'
        });
    }

    if (tenantRoutes) {
        availableModules.push({
            name: 'Tenant Management',
            path: '/tenants',
            description: 'Multi-tenant administration',
            status: 'active'
        });
    }

    if (analyticsRoutes) {
        availableModules.push({
            name: 'Analytics & Reporting',
            path: '/analytics',
            description: 'Dashboards and reports',
            status: 'active'
        });
    }

    if (systemRoutes) {
        availableModules.push({
            name: 'System Configuration',
            path: '/system',
            description: 'Settings and integrations',
            status: 'active'
        });
    }

    if (auditRoutes) {
        availableModules.push({
            name: 'Audit & Compliance',
            path: '/audit',
            description: 'Audit logs and compliance',
            status: 'active'
        });
    }

    if (monitoringRoutes) {
        availableModules.push({
            name: 'Monitoring & Health',
            path: '/monitoring',
            description: 'System monitoring and alerts',
            status: 'active'
        });
    }

    res.status(200).json({
        success: true,
        message: 'InsightSerenity Admin API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        modules: availableModules,
        totalModules: availableModules.length
    });
});

/**
 * @route   GET /api/v1/admin/status
 * @desc    Get admin server status
 * @access  Public
 */
router.get('/status', (req, res) => {
    res.status(200).json({
        success: true,
        status: 'operational',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        memoryUsage: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        }
    });
});

module.exports = router;