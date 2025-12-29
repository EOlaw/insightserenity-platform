const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../../../../../../shared/lib/auth/middleware/authenticate');
const CreditManagementService = require('../services/credit-management-service');
const { body, validationResult } = require('express-validator');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'credit-routes'
});

/**
 * Credit Management Routes - Professional B2B Credit System
 * Handles credit balance, availability checking, and credit history
 */

/**
 * @route   GET /api/credits/me/summary
 * @desc    Get comprehensive credit summary for current client
 * @access  Private (Client only)
 */
router.get('/me/summary',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      logger.info(`[CreditRoutes] Fetching credit summary for client: ${req.user.clientId}`);

      const summary = await CreditManagementService.getCreditSummary(req.user.clientId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to fetch credit summary:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/credits/check-availability
 * @desc    Check if client has sufficient credits for booking
 * @access  Private (Client only)
 */
router.post('/check-availability',
  authenticate,
  requireRoles(['client']),
  [
    body('requiredCredits').optional().isInt({ min: 1 }),
    body('options.useFreeTrialCredit').optional().isBoolean()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      logger.info(`[CreditRoutes] Checking credit availability for client: ${req.user.clientId}`);

      const availability = await CreditManagementService.checkCreditAvailability(
        req.user.clientId,
        req.body.requiredCredits || 1,
        req.body.options || {}
      );

      res.json({
        success: true,
        data: availability
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to check credit availability:', error);
      next(error);
    }
  }
);

/**
 * @route   GET /api/credits/me/balance
 * @desc    Get quick credit balance (simplified version)
 * @access  Private (Client only)
 */
router.get('/me/balance',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      const Client = require('../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
      const client = await Client.findById(req.user.clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      res.json({
        success: true,
        data: {
          availableCredits: client.consultationCredits.availableCredits || 0,
          freeTrial: {
            eligible: client.consultationCredits.freeTrial?.eligible || false,
            used: client.consultationCredits.freeTrial?.used || false
          }
        }
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to fetch credit balance:', error);
      next(error);
    }
  }
);

/**
 * @route   GET /api/credits/me/history
 * @desc    Get credit usage history
 * @access  Private (Client only)
 */
router.get('/me/history',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      const Client = require('../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
      const client = await Client.findById(req.user.clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      // Get credit packages history
      const history = client.consultationCredits.credits || [];

      res.json({
        success: true,
        data: {
          packages: history.map(pkg => ({
            packageId: pkg.packageId,
            packageName: pkg.packageName,
            creditsAdded: pkg.creditsAdded,
            creditsUsed: pkg.creditsUsed,
            creditsRemaining: pkg.creditsRemaining,
            purchaseDate: pkg.purchaseDate,
            expiryDate: pkg.expiryDate,
            status: pkg.status,
            amount: pkg.amount
          })),
          lifetime: client.consultationCredits.lifetime || {
            totalConsultations: 0,
            totalSpent: 0,
            totalCreditsPurchased: 0,
            totalCreditsUsed: 0
          }
        }
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to fetch credit history:', error);
      next(error);
    }
  }
);

/**
 * @route   GET /api/credits/expiring
 * @desc    Get credits expiring in next 30 days
 * @access  Private (Client only)
 */
router.get('/expiring',
  authenticate,
  requireRoles(['client']),
  async (req, res, next) => {
    try {
      const Client = require('../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
      const client = await Client.findById(req.user.clientId);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringPackages = (client.consultationCredits.credits || []).filter(pkg => {
        return pkg.status === 'active' &&
               pkg.creditsRemaining > 0 &&
               pkg.expiryDate &&
               pkg.expiryDate <= thirtyDaysFromNow &&
               pkg.expiryDate > now;
      });

      res.json({
        success: true,
        data: {
          expiringPackages: expiringPackages.map(pkg => ({
            packageId: pkg.packageId,
            packageName: pkg.packageName,
            creditsRemaining: pkg.creditsRemaining,
            expiryDate: pkg.expiryDate,
            daysUntilExpiry: Math.ceil((pkg.expiryDate - now) / (1000 * 60 * 60 * 24))
          }))
        }
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to fetch expiring credits:', error);
      next(error);
    }
  }
);

/**
 * @route   POST /api/credits/admin/assign-free-trial/:clientId
 * @desc    Manually assign free trial to a client (Admin only)
 * @access  Private (Admin only)
 */
router.post('/admin/assign-free-trial/:clientId',
  authenticate,
  requireRoles(['admin']),
  async (req, res, next) => {
    try {
      logger.info(`[CreditRoutes] Admin assigning free trial to client: ${req.params.clientId}`);

      const result = await CreditManagementService.assignFreeTrialCredit(req.params.clientId);

      res.json({
        success: true,
        message: 'Free trial assigned successfully',
        data: result
      });
    } catch (error) {
      logger.error('[CreditRoutes] Failed to assign free trial:', error);
      next(error);
    }
  }
);

module.exports = router;
