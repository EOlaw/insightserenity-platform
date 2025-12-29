const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'credit-management-service'
});
const Client = require('../../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
const ConsultationPackage = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultation-management/consultation-package-model');
const Consultation = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultation-management/consultation-model');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Credit Management Service - Professional B2B Credit System
 * Handles auto credit assignment, deduction, expiration, and credit lifecycle
 */
class CreditManagementService {
  /**
   * Auto-assign free trial credit on client registration
   * Called after email verification
   */
  async assignFreeTrialCredit(clientId) {
    try {
      logger.info(`[CreditManagement] Auto-assigning free trial credit to client: ${clientId}`);

      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      // Check if already eligible or used
      if (!client.consultationCredits.freeTrial.eligible) {
        logger.info(`[CreditManagement] Client ${clientId} not eligible for free trial`);
        return { assigned: false, reason: 'not_eligible' };
      }

      if (client.consultationCredits.freeTrial.used) {
        logger.info(`[CreditManagement] Client ${clientId} already used free trial`);
        return { assigned: false, reason: 'already_used' };
      }

      // Get free trial package
      const freeTrialPackage = await ConsultationPackage.findOne({
        'details.type': 'free_trial',
        'availability.status': 'active',
        tenantId: client.tenantId || 'default',
        isDeleted: false
      });

      if (!freeTrialPackage) {
        logger.warn('[CreditManagement] Free trial package not found');
        return { assigned: false, reason: 'package_not_found' };
      }

      // Set expiration date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + freeTrialPackage.credits.expiresAfterDays);

      // Update client free trial info
      client.consultationCredits.freeTrial.eligible = true;
      client.consultationCredits.freeTrial.expiresAt = expiryDate;

      // Add to available credits (for free trial, we don't add to availableCredits since it's tracked separately)
      // The consultation booking will check freeTrial.eligible instead of availableCredits

      await client.save();

      logger.info(`[CreditManagement] Free trial credit assigned to client: ${clientId}, expires: ${expiryDate}`);

      // Send welcome email with free trial info
      await this.sendFreeTrialAssignedEmail(client, freeTrialPackage, expiryDate);

      return {
        assigned: true,
        packageName: freeTrialPackage.details.name,
        credits: freeTrialPackage.credits.total,
        duration: freeTrialPackage.credits.duration.minutes,
        expiresAt: expiryDate
      };
    } catch (error) {
      logger.error('[CreditManagement] Failed to assign free trial credit:', error);
      throw error;
    }
  }

  /**
   * Auto-deduct credits when consultation is completed
   * Called when consultant marks consultation as complete
   */
  async deductCreditsOnCompletion(consultationId) {
    try {
      logger.info(`[CreditManagement] Auto-deducting credits for consultation: ${consultationId}`);

      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        throw new AppError('Consultation not found', 404);
      }

      // Only deduct if consultation is completed or in_progress → completed transition
      if (consultation.status.current !== 'completed') {
        logger.info(`[CreditManagement] Consultation ${consultationId} not completed, skipping deduction`);
        return { deducted: false, reason: 'not_completed' };
      }

      // Check if already deducted
      if (consultation.billing.creditsDeducted) {
        logger.info(`[CreditManagement] Credits already deducted for consultation: ${consultationId}`);
        return { deducted: false, reason: 'already_deducted' };
      }

      const client = await Client.findById(consultation.clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      // Determine credits to deduct
      let creditsToDeduct = 1; // Default: 1 credit per consultation

      // Calculate based on actual duration if applicable
      if (consultation.schedule.duration?.actual) {
        const actualMinutes = consultation.schedule.duration.actual;
        const packageDuration = consultation.billing.packageDuration || 60; // Default 60 min

        // Round up to nearest credit unit
        creditsToDeduct = Math.ceil(actualMinutes / packageDuration);
      }

      // Handle free trial consultation
      if (consultation.billing.rateType === 'complimentary' && consultation.billing.packageId === 'PKG-FREE-TRIAL') {
        if (!client.consultationCredits.freeTrial.used) {
          client.consultationCredits.freeTrial.used = true;
          client.consultationCredits.freeTrial.usedAt = new Date();
          client.consultationCredits.freeTrial.consultationId = consultationId;
          await client.save();

          logger.info(`[CreditManagement] Free trial marked as used for client: ${client._id}`);

          return {
            deducted: true,
            type: 'free_trial',
            creditsDeducted: 0,
            remainingBalance: client.consultationCredits.availableCredits
          };
        } else {
          throw new AppError('Free trial already used', 403);
        }
      }

      // Deduct from available credits
      if (client.consultationCredits.availableCredits < creditsToDeduct) {
        throw new AppError('Insufficient credits', 402);
      }

      // Find the credit package this consultation used
      const packageId = consultation.billing.packageId;
      const creditPackageIndex = client.consultationCredits.credits.findIndex(
        pkg => pkg.packageId === packageId && pkg.status === 'active' && pkg.creditsRemaining > 0
      );

      if (creditPackageIndex === -1) {
        // Fallback: deduct from oldest active package
        const oldestPackage = client.consultationCredits.credits.find(
          pkg => pkg.status === 'active' && pkg.creditsRemaining > 0
        );

        if (!oldestPackage) {
          throw new AppError('No active credit packages found', 404);
        }

        oldestPackage.creditsUsed += creditsToDeduct;
        oldestPackage.creditsRemaining -= creditsToDeduct;

        if (oldestPackage.creditsRemaining === 0) {
          oldestPackage.status = 'depleted';
        }
      } else {
        // Deduct from specific package
        const creditPackage = client.consultationCredits.credits[creditPackageIndex];
        creditPackage.creditsUsed += creditsToDeduct;
        creditPackage.creditsRemaining -= creditsToDeduct;

        if (creditPackage.creditsRemaining === 0) {
          creditPackage.status = 'depleted';
        }
      }

      // Update available credits
      client.consultationCredits.availableCredits -= creditsToDeduct;

      // Update lifetime statistics
      if (!client.consultationCredits.lifetime) {
        client.consultationCredits.lifetime = {
          totalConsultations: 0,
          totalSpent: 0,
          totalCreditsPurchased: 0,
          totalCreditsUsed: 0
        };
      }

      client.consultationCredits.lifetime.totalConsultations += 1;
      client.consultationCredits.lifetime.totalCreditsUsed += creditsToDeduct;

      await client.save();

      // Update consultation record
      consultation.billing.creditsDeducted = true;
      consultation.billing.creditsUsed = creditsToDeduct;
      consultation.billing.actualCost = consultation.billing.estimatedCost || 0;
      await consultation.save();

      logger.info(`[CreditManagement] Deducted ${creditsToDeduct} credits from client: ${client._id}, new balance: ${client.consultationCredits.availableCredits}`);

      // Check if credits are running low and send notification
      if (client.consultationCredits.availableCredits <= 2 && client.consultationCredits.availableCredits > 0) {
        await this.sendLowCreditWarning(client);
      }

      return {
        deducted: true,
        type: 'paid',
        creditsDeducted: creditsToDeduct,
        remainingBalance: client.consultationCredits.availableCredits,
        packageUsed: packageId
      };
    } catch (error) {
      logger.error('[CreditManagement] Failed to deduct credits:', error);
      throw error;
    }
  }

  /**
   * Check if client has sufficient credits for booking
   */
  async checkCreditAvailability(clientId, requiredCredits = 1, options = {}) {
    try {
      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      // Check free trial eligibility
      if (options.useFreeTrialCredit) {
        if (client.consultationCredits.freeTrial.eligible && !client.consultationCredits.freeTrial.used) {
          // Check if free trial expired
          if (client.consultationCredits.freeTrial.expiresAt &&
              new Date() > client.consultationCredits.freeTrial.expiresAt) {
            return {
              available: false,
              reason: 'free_trial_expired',
              freeTrialExpired: true
            };
          }

          return {
            available: true,
            type: 'free_trial',
            remainingAfterBooking: 0
          };
        } else {
          return {
            available: false,
            reason: 'free_trial_not_available',
            freeTrialUsed: client.consultationCredits.freeTrial.used
          };
        }
      }

      // Check paid credits
      if (client.consultationCredits.availableCredits >= requiredCredits) {
        return {
          available: true,
          type: 'paid',
          currentBalance: client.consultationCredits.availableCredits,
          remainingAfterBooking: client.consultationCredits.availableCredits - requiredCredits,
          activePackages: client.consultationCredits.credits.filter(
            pkg => pkg.status === 'active' && pkg.creditsRemaining > 0
          )
        };
      }

      return {
        available: false,
        reason: 'insufficient_credits',
        currentBalance: client.consultationCredits.availableCredits,
        required: requiredCredits,
        shortfall: requiredCredits - client.consultationCredits.availableCredits
      };
    } catch (error) {
      logger.error('[CreditManagement] Failed to check credit availability:', error);
      throw error;
    }
  }

  /**
   * Expire old credits (run as cron job daily)
   */
  async expireOldCredits() {
    try {
      logger.info('[CreditManagement] Running credit expiration job');

      const now = new Date();
      const clients = await Client.find({
        'consultationCredits.credits.status': 'active',
        'consultationCredits.credits.expiryDate': { $lte: now }
      });

      let expiredCount = 0;
      let totalCreditsExpired = 0;

      for (const client of clients) {
        let clientUpdated = false;

        for (const creditPackage of client.consultationCredits.credits) {
          if (creditPackage.status === 'active' && creditPackage.expiryDate <= now) {
            const expiredCredits = creditPackage.creditsRemaining;

            creditPackage.status = 'expired';
            creditPackage.expiredAt = now;

            // Deduct from available credits
            client.consultationCredits.availableCredits -= expiredCredits;

            totalCreditsExpired += expiredCredits;
            expiredCount++;
            clientUpdated = true;

            logger.info(`[CreditManagement] Expired ${expiredCredits} credits from package ${creditPackage.packageId} for client: ${client._id}`);

            // Send expiration notification
            await this.sendCreditExpiredNotification(client, creditPackage, expiredCredits);
          }
        }

        if (clientUpdated) {
          await client.save();
        }
      }

      logger.info(`[CreditManagement] Credit expiration job completed. Expired ${expiredCount} packages (${totalCreditsExpired} credits) across ${clients.length} clients`);

      return {
        clientsProcessed: clients.length,
        packagesExpired: expiredCount,
        totalCreditsExpired
      };
    } catch (error) {
      logger.error('[CreditManagement] Credit expiration job failed:', error);
      throw error;
    }
  }

  /**
   * Send credit expiration warnings (run 7 days and 1 day before expiry)
   */
  async sendExpirationWarnings(daysBeforeExpiry = 7) {
    try {
      logger.info(`[CreditManagement] Sending ${daysBeforeExpiry}-day expiration warnings`);

      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + daysBeforeExpiry);

      const nextDay = new Date(warningDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const clients = await Client.find({
        'consultationCredits.credits.status': 'active',
        'consultationCredits.credits.expiryDate': {
          $gte: warningDate,
          $lt: nextDay
        }
      });

      for (const client of clients) {
        for (const creditPackage of client.consultationCredits.credits) {
          if (creditPackage.status === 'active' &&
              creditPackage.expiryDate >= warningDate &&
              creditPackage.expiryDate < nextDay &&
              creditPackage.creditsRemaining > 0) {

            await this.sendCreditExpirationWarning(client, creditPackage, daysBeforeExpiry);
          }
        }
      }

      logger.info(`[CreditManagement] Sent ${daysBeforeExpiry}-day warnings to ${clients.length} clients`);

      return { clientsNotified: clients.length };
    } catch (error) {
      logger.error('[CreditManagement] Failed to send expiration warnings:', error);
      throw error;
    }
  }

  /**
   * Get client credit summary
   */
  async getCreditSummary(clientId) {
    try {
      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      const activePackages = client.consultationCredits.credits.filter(
        pkg => pkg.status === 'active' && pkg.creditsRemaining > 0
      );

      const expiringPackages = activePackages.filter(pkg => {
        const daysUntilExpiry = Math.ceil((pkg.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
      });

      return {
        availableCredits: client.consultationCredits.availableCredits,
        freeTrial: {
          eligible: client.consultationCredits.freeTrial.eligible,
          used: client.consultationCredits.freeTrial.used,
          expiresAt: client.consultationCredits.freeTrial.expiresAt
        },
        activePackages: activePackages.map(pkg => ({
          packageId: pkg.packageId,
          packageName: pkg.packageName,
          creditsRemaining: pkg.creditsRemaining,
          sessionDuration: pkg.details.sessionDuration,
          expiryDate: pkg.expiryDate,
          daysUntilExpiry: Math.ceil((pkg.expiryDate - new Date()) / (1000 * 60 * 60 * 24))
        })),
        expiringCredits: expiringPackages,
        lifetime: client.consultationCredits.lifetime || {
          totalConsultations: 0,
          totalSpent: 0,
          totalCreditsPurchased: 0,
          totalCreditsUsed: 0
        }
      };
    } catch (error) {
      logger.error('[CreditManagement] Failed to get credit summary:', error);
      throw error;
    }
  }

  // Email notification methods
  async sendFreeTrialAssignedEmail(client, packageDetails, expiryDate) {
    try {
      const NotificationService = require('../../notifications/services/notification-service');

      await NotificationService.sendEmail({
        to: client.contactInformation.primaryEmail,
        subject: 'Welcome to InsightSerenity - Free Trial Activated',
        template: 'free-trial-assigned',
        data: {
          clientName: client.organizationName,
          duration: packageDetails.credits.duration.minutes,
          expiryDate: expiryDate.toLocaleDateString(),
          bookingUrl: `${process.env.CLIENT_URL}/consultations/book`
        }
      });
    } catch (error) {
      logger.error('[CreditManagement] Failed to send free trial email:', error);
    }
  }

  async sendLowCreditWarning(client) {
    try {
      const NotificationService = require('../../notifications/services/notification-service');

      await NotificationService.sendEmail({
        to: client.contactInformation.primaryEmail,
        subject: 'Low Credit Balance - InsightSerenity',
        template: 'low-credit-warning',
        data: {
          clientName: client.organizationName,
          remainingCredits: client.consultationCredits.availableCredits,
          purchaseUrl: `${process.env.CLIENT_URL}/consultations/packages`
        }
      });
    } catch (error) {
      logger.error('[CreditManagement] Failed to send low credit warning:', error);
    }
  }

  async sendCreditExpirationWarning(client, creditPackage, daysBeforeExpiry) {
    try {
      const NotificationService = require('../../notifications/services/notification-service');

      await NotificationService.sendEmail({
        to: client.contactInformation.primaryEmail,
        subject: `Credit Expiration Notice - ${daysBeforeExpiry} Days Remaining`,
        template: 'credit-expiration-warning',
        data: {
          clientName: client.organizationName,
          packageName: creditPackage.packageName,
          creditsRemaining: creditPackage.creditsRemaining,
          expiryDate: creditPackage.expiryDate.toLocaleDateString(),
          daysRemaining: daysBeforeExpiry,
          bookingUrl: `${process.env.CLIENT_URL}/consultations/book`
        }
      });
    } catch (error) {
      logger.error('[CreditManagement] Failed to send expiration warning:', error);
    }
  }

  async sendCreditExpiredNotification(client, creditPackage, expiredCredits) {
    try {
      const NotificationService = require('../../notifications/services/notification-service');

      await NotificationService.sendEmail({
        to: client.contactInformation.primaryEmail,
        subject: 'Credits Expired - InsightSerenity',
        template: 'credit-expired',
        data: {
          clientName: client.organizationName,
          packageName: creditPackage.packageName,
          expiredCredits,
          purchaseUrl: `${process.env.CLIENT_URL}/consultations/packages`
        }
      });
    } catch (error) {
      logger.error('[CreditManagement] Failed to send expiration notification:', error);
    }
  }
}

module.exports = new CreditManagementService();
