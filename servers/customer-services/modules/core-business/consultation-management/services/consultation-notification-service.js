const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultation-notification-service'
});
const Consultation = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultation-management/consultation-model');
const NotificationService = require('../../notifications/services/notification-service');

/**
 * Consultation Notification Service - Professional B2B Automated Notifications
 * Handles all consultation-related email notifications and reminders
 */
class ConsultationNotificationService {
  /**
   * Send booking confirmation emails to client and consultant
   */
  async sendBookingConfirmation(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        logger.warn(`[ConsultationNotification] Consultation not found: ${consultationId}`);
        return;
      }

      const client = consultation.clientId;
      const consultant = consultation.consultantId;

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Consultation Booking Confirmed - InsightSerenity',
        template: 'consultation-booking-confirmation-client',
        data: {
          clientName: client.organizationName || consultation.attendees.primary.client.name,
          consultationCode: consultation.consultationCode,
          consultantName: consultation.attendees.primary.consultant.name,
          scheduledStart: consultation.schedule.scheduledStart,
          scheduledEnd: consultation.schedule.scheduledEnd,
          duration: consultation.schedule.duration.scheduled,
          timezone: consultation.schedule.timezone,
          purpose: consultation.purpose,
          meetingUrl: consultation.videoConference?.meetingUrl || `${process.env.CLIENT_URL}/consultations/${consultationId}`,
          rescheduleUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}/reschedule`,
          cancelUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}/cancel`
        }
      });

      logger.info(`[ConsultationNotification] Booking confirmation sent to client: ${consultation.attendees.primary.client.email}`);

      // Send to consultant
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'New Consultation Booking - InsightSerenity',
        template: 'consultation-booking-confirmation-consultant',
        data: {
          consultantName: consultation.attendees.primary.consultant.name,
          consultationCode: consultation.consultationCode,
          clientName: client.organizationName || consultation.attendees.primary.client.name,
          clientContact: consultation.attendees.primary.client.name,
          scheduledStart: consultation.schedule.scheduledStart,
          scheduledEnd: consultation.schedule.scheduledEnd,
          duration: consultation.schedule.duration.scheduled,
          timezone: consultation.schedule.timezone,
          purpose: consultation.purpose,
          clientNotes: consultation.notes.client,
          meetingUrl: consultation.videoConference?.meetingUrl || `${process.env.CONSULTANT_URL}/consultations/${consultationId}`,
          prepareUrl: `${process.env.CONSULTANT_URL}/consultations/${consultationId}/prepare`
        }
      });

      logger.info(`[ConsultationNotification] Booking confirmation sent to consultant: ${consultation.attendees.primary.consultant.email}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send booking confirmation:', error);
    }
  }

  /**
   * Send 24-hour reminder before consultation
   */
  async send24HourReminder(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        return;
      }

      // Only send if consultation is still scheduled or confirmed
      if (!['scheduled', 'confirmed'].includes(consultation.status.current)) {
        return;
      }

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Reminder: Consultation Tomorrow - InsightSerenity',
        template: 'consultation-reminder-24h-client',
        data: {
          clientName: consultation.clientId.organizationName || consultation.attendees.primary.client.name,
          consultantName: consultation.attendees.primary.consultant.name,
          scheduledStart: consultation.schedule.scheduledStart,
          duration: consultation.schedule.duration.scheduled,
          timezone: consultation.schedule.timezone,
          meetingUrl: consultation.videoConference?.meetingUrl || `${process.env.CLIENT_URL}/consultations/${consultationId}`,
          prepareUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}`
        }
      });

      // Send to consultant
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'Reminder: Consultation Tomorrow - InsightSerenity',
        template: 'consultation-reminder-24h-consultant',
        data: {
          consultantName: consultation.attendees.primary.consultant.name,
          clientName: consultation.clientId.organizationName,
          scheduledStart: consultation.schedule.scheduledStart,
          duration: consultation.schedule.duration.scheduled,
          timezone: consultation.schedule.timezone,
          meetingUrl: consultation.videoConference?.meetingUrl || `${process.env.CONSULTANT_URL}/consultations/${consultationId}`,
          prepareUrl: `${process.env.CONSULTANT_URL}/consultations/${consultationId}/prepare`
        }
      });

      logger.info(`[ConsultationNotification] 24h reminder sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send 24h reminder:', error);
    }
  }

  /**
   * Send 1-hour reminder before consultation
   */
  async send1HourReminder(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation || !['scheduled', 'confirmed'].includes(consultation.status.current)) {
        return;
      }

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Reminder: Consultation Starting in 1 Hour',
        template: 'consultation-reminder-1h-client',
        data: {
          clientName: consultation.clientId.organizationName,
          consultantName: consultation.attendees.primary.consultant.name,
          scheduledStart: consultation.schedule.scheduledStart,
          meetingUrl: consultation.videoConference?.meetingUrl,
          joinUrl: consultation.videoConference?.meetingUrl || `${process.env.CLIENT_URL}/consultations/${consultationId}/join`
        }
      });

      // Send to consultant
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'Reminder: Consultation Starting in 1 Hour',
        template: 'consultation-reminder-1h-consultant',
        data: {
          consultantName: consultation.attendees.primary.consultant.name,
          clientName: consultation.clientId.organizationName,
          scheduledStart: consultation.schedule.scheduledStart,
          meetingUrl: consultation.videoConference?.meetingUrl,
          joinUrl: consultation.videoConference?.meetingUrl || `${process.env.CONSULTANT_URL}/consultations/${consultationId}/join`
        }
      });

      logger.info(`[ConsultationNotification] 1h reminder sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send 1h reminder:', error);
    }
  }

  /**
   * Send consultation started notification
   */
  async sendConsultationStarted(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId');

      if (!consultation) {
        return;
      }

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Your Consultation Has Started',
        template: 'consultation-started',
        data: {
          clientName: consultation.clientId.organizationName,
          consultantName: consultation.attendees.primary.consultant.name,
          meetingUrl: consultation.videoConference?.meetingUrl,
          joinUrl: consultation.videoConference?.meetingUrl || `${process.env.CLIENT_URL}/consultations/${consultationId}/join`
        }
      });

      logger.info(`[ConsultationNotification] Started notification sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send started notification:', error);
    }
  }

  /**
   * Send consultation completed notification with deliverables
   */
  async sendConsultationCompleted(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        return;
      }

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Consultation Completed - Summary Available',
        template: 'consultation-completed-client',
        data: {
          clientName: consultation.clientId.organizationName,
          consultationCode: consultation.consultationCode,
          consultantName: consultation.attendees.primary.consultant.name,
          completedAt: consultation.schedule.actualEnd,
          duration: consultation.schedule.duration.actual,
          summary: consultation.outcomes?.summary,
          keyPoints: consultation.outcomes?.keyPoints || [],
          deliverables: consultation.deliverables || [],
          actionItems: consultation.actionItems?.filter(item => item.assignedTo === 'client') || [],
          nextSteps: consultation.nextSteps,
          viewUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}`,
          feedbackUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}/feedback`,
          recordingUrl: consultation.recording?.url
        }
      });

      // Send to consultant (confirmation)
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'Consultation Marked as Complete',
        template: 'consultation-completed-consultant',
        data: {
          consultantName: consultation.attendees.primary.consultant.name,
          clientName: consultation.clientId.organizationName,
          consultationCode: consultation.consultationCode,
          completedAt: consultation.schedule.actualEnd,
          viewUrl: `${process.env.CONSULTANT_URL}/consultations/${consultationId}`
        }
      });

      logger.info(`[ConsultationNotification] Completion notification sent for consultation: ${consultationId}`);

      // Schedule feedback request for 24 hours later
      await this.scheduleFeedbackRequest(consultationId);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send completion notification:', error);
    }
  }

  /**
   * Send feedback request (24 hours after completion)
   */
  async sendFeedbackRequest(consultationId) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId');

      if (!consultation) {
        return;
      }

      // Check if feedback already submitted
      if (consultation.feedback?.client?.submittedAt) {
        logger.info(`[ConsultationNotification] Feedback already submitted for: ${consultationId}`);
        return;
      }

      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'We Value Your Feedback - InsightSerenity',
        template: 'consultation-feedback-request',
        data: {
          clientName: consultation.clientId.organizationName,
          consultantName: consultation.attendees.primary.consultant.name,
          consultationDate: consultation.schedule.actualStart || consultation.schedule.scheduledStart,
          feedbackUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}/feedback`
        }
      });

      logger.info(`[ConsultationNotification] Feedback request sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send feedback request:', error);
    }
  }

  /**
   * Send cancellation notification
   */
  async sendCancellationNotification(consultationId, canceledBy, reason) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        return;
      }

      // Send to client
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Consultation Canceled - InsightSerenity',
        template: 'consultation-canceled-client',
        data: {
          clientName: consultation.clientId.organizationName,
          consultationCode: consultation.consultationCode,
          consultantName: consultation.attendees.primary.consultant.name,
          scheduledStart: consultation.schedule.scheduledStart,
          canceledBy: canceledBy === 'client' ? 'You' : 'The consultant',
          reason: reason,
          rebookUrl: `${process.env.CLIENT_URL}/consultations/book`,
          supportUrl: `${process.env.CLIENT_URL}/support`
        }
      });

      // Send to consultant
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'Consultation Canceled - InsightSerenity',
        template: 'consultation-canceled-consultant',
        data: {
          consultantName: consultation.attendees.primary.consultant.name,
          consultationCode: consultation.consultationCode,
          clientName: consultation.clientId.organizationName,
          scheduledStart: consultation.schedule.scheduledStart,
          canceledBy: canceledBy === 'consultant' ? 'You' : 'The client',
          reason: reason
        }
      });

      logger.info(`[ConsultationNotification] Cancellation notification sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send cancellation notification:', error);
    }
  }

  /**
   * Send rescheduled notification
   */
  async sendRescheduleNotification(consultationId, newStartTime, newEndTime) {
    try {
      const consultation = await Consultation.findById(consultationId)
        .populate('clientId')
        .populate('consultantId');

      if (!consultation) {
        return;
      }

      // Send to both parties
      await NotificationService.sendEmail({
        to: consultation.attendees.primary.client.email,
        subject: 'Consultation Rescheduled - InsightSerenity',
        template: 'consultation-rescheduled',
        data: {
          recipientName: consultation.clientId.organizationName,
          consultationCode: consultation.consultationCode,
          consultantName: consultation.attendees.primary.consultant.name,
          oldStartTime: consultation.schedule.scheduledStart,
          newStartTime: newStartTime,
          newEndTime: newEndTime,
          timezone: consultation.schedule.timezone,
          meetingUrl: consultation.videoConference?.meetingUrl,
          viewUrl: `${process.env.CLIENT_URL}/consultations/${consultationId}`
        }
      });

      await NotificationService.sendEmail({
        to: consultation.attendees.primary.consultant.email,
        subject: 'Consultation Rescheduled - InsightSerenity',
        template: 'consultation-rescheduled',
        data: {
          recipientName: consultation.attendees.primary.consultant.name,
          consultationCode: consultation.consultationCode,
          clientName: consultation.clientId.organizationName,
          oldStartTime: consultation.schedule.scheduledStart,
          newStartTime: newStartTime,
          newEndTime: newEndTime,
          timezone: consultation.schedule.timezone,
          meetingUrl: consultation.videoConference?.meetingUrl,
          viewUrl: `${process.env.CONSULTANT_URL}/consultations/${consultationId}`
        }
      });

      logger.info(`[ConsultationNotification] Reschedule notification sent for consultation: ${consultationId}`);
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send reschedule notification:', error);
    }
  }

  /**
   * Schedule feedback request (internal scheduler - could be moved to Bull queue)
   */
  async scheduleFeedbackRequest(consultationId) {
    // In production, this should use Bull queue or similar
    // For now, using setTimeout for demonstration
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    setTimeout(async () => {
      await this.sendFeedbackRequest(consultationId);
    }, TWENTY_FOUR_HOURS);

    logger.info(`[ConsultationNotification] Feedback request scheduled for consultation: ${consultationId}`);
  }

  /**
   * Batch send reminders for consultations in next 24 hours
   * This should be run as a cron job
   */
  async sendBatch24HourReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 24);

      const nextDay = new Date(tomorrow);
      nextDay.setHours(nextDay.getHours() + 1);

      const consultations = await Consultation.find({
        'schedule.scheduledStart': {
          $gte: tomorrow,
          $lt: nextDay
        },
        'status.current': { $in: ['scheduled', 'confirmed'] }
      });

      logger.info(`[ConsultationNotification] Sending 24h reminders to ${consultations.length} consultations`);

      for (const consultation of consultations) {
        await this.send24HourReminder(consultation._id);
      }

      return { sent: consultations.length };
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send batch 24h reminders:', error);
      throw error;
    }
  }

  /**
   * Batch send reminders for consultations in next hour
   * This should be run as a cron job every 15 minutes
   */
  async sendBatch1HourReminders() {
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

      const fifteenMinutesLater = new Date(oneHourFromNow);
      fifteenMinutesLater.setMinutes(fifteenMinutesLater.getMinutes() + 15);

      const consultations = await Consultation.find({
        'schedule.scheduledStart': {
          $gte: oneHourFromNow,
          $lt: fifteenMinutesLater
        },
        'status.current': { $in: ['scheduled', 'confirmed'] }
      });

      logger.info(`[ConsultationNotification] Sending 1h reminders to ${consultations.length} consultations`);

      for (const consultation of consultations) {
        await this.send1HourReminder(consultation._id);
      }

      return { sent: consultations.length };
    } catch (error) {
      logger.error('[ConsultationNotification] Failed to send batch 1h reminders:', error);
      throw error;
    }
  }
}

module.exports = new ConsultationNotificationService();
