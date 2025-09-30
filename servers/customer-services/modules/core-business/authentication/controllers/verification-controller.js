/**
 * @fileoverview Verification Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/verification-controller
 * @description Handles HTTP requests for email and phone verification operations
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Verification Controller
 * Handles all verification-related HTTP requests
 * @class VerificationController
 */
class VerificationController {
    /**
     * Verify email address with token
     * @route POST /api/auth/verify/email
     * @access Public
     */
    async verifyEmail(req, res, next) {
        try {
            const { token, email } = req.body;

            if (!token) {
                throw new AppError('Verification token is required', 400, 'MISSING_TOKEN');
            }

            // Call shared auth service for email verification
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const result = await AuthService.verifyEmail(token, email);

            logger.info('Email verification successful', {
                email: result.email,
                userId: result.userId
            });

            res.status(200).json({
                success: true,
                message: 'Email verified successfully',
                data: {
                    email: result.email,
                    verified: true,
                    verifiedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Email verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Verify email with code (alternative method)
     * @route POST /api/auth/verify/email/code
     * @access Public
     */
    async verifyEmailWithCode(req, res, next) {
        try {
            const { email, code } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            if (!code) {
                throw new AppError('Verification code is required', 400, 'MISSING_CODE');
            }

            // Call shared auth service for email verification with code
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const result = await AuthService.verifyEmailWithCode(email, code, tenantId);

            logger.info('Email verification with code successful', {
                email: email,
                userId: result.userId
            });

            res.status(200).json({
                success: true,
                message: 'Email verified successfully',
                data: {
                    email: email,
                    verified: true,
                    verifiedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Email verification with code failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Resend email verification
     * @route POST /api/auth/verify/email/resend
     * @access Public
     */
    async resendEmailVerification(req, res, next) {
        try {
            const { email } = req.body;
            const tenantId = req.headers['x-tenant-id'] || req.body.tenantId;

            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            // Call shared auth service to resend verification
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.resendEmailVerification(email, tenantId);

            logger.info('Verification email resent', {
                email,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Verification email sent successfully',
                data: {
                    email: email,
                    message: 'Please check your email for the verification link'
                }
            });

        } catch (error) {
            logger.error('Resend email verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Check email verification status
     * @route GET /api/auth/verify/email/status
     * @access Public
     */
    async checkEmailVerificationStatus(req, res, next) {
        try {
            const { email } = req.query;
            const tenantId = req.headers['x-tenant-id'];

            if (!email) {
                throw new AppError('Email is required', 400, 'MISSING_EMAIL');
            }

            // Call shared auth service to check status
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            const status = await AuthService.getEmailVerificationStatus(email, tenantId);

            logger.debug('Email verification status checked', {
                email,
                isVerified: status.isVerified
            });

            res.status(200).json({
                success: true,
                message: 'Email verification status retrieved',
                data: {
                    email: email,
                    isVerified: status.isVerified,
                    verifiedAt: status.verifiedAt,
                    canResend: status.canResend,
                    nextResendAvailableAt: status.nextResendAvailableAt
                }
            });

        } catch (error) {
            logger.error('Check email verification status failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Send phone verification code
     * @route POST /api/auth/verify/phone/send
     * @access Protected
     */
    async sendPhoneVerificationCode(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { phoneNumber, method } = req.body;

            if (!phoneNumber) {
                throw new AppError('Phone number is required', 400, 'MISSING_PHONE_NUMBER');
            }

            // Method can be 'sms' or 'call'
            const verificationMethod = method || 'sms';

            // Call shared verification service to send code
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const result = await VerificationService.sendPhoneVerificationCode(
                userId,
                phoneNumber,
                verificationMethod,
                tenantId
            );

            logger.info('Phone verification code sent', {
                userId,
                phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                method: verificationMethod,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: `Verification code sent via ${verificationMethod}`,
                data: {
                    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                    verificationId: result.verificationId,
                    expiresIn: result.expiresIn,
                    method: verificationMethod,
                    canResendAt: result.canResendAt
                }
            });

        } catch (error) {
            logger.error('Send phone verification code failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Verify phone number with code
     * @route POST /api/auth/verify/phone
     * @access Protected
     */
    async verifyPhone(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { phoneNumber, code, verificationId } = req.body;

            if (!phoneNumber) {
                throw new AppError('Phone number is required', 400, 'MISSING_PHONE_NUMBER');
            }

            if (!code) {
                throw new AppError('Verification code is required', 400, 'MISSING_CODE');
            }

            // Call shared verification service to verify phone
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const result = await VerificationService.verifyPhone(
                userId,
                phoneNumber,
                code,
                verificationId,
                tenantId
            );

            logger.info('Phone verification successful', {
                userId,
                phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Phone number verified successfully',
                data: {
                    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                    verified: true,
                    verifiedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Phone verification failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Check phone verification status
     * @route GET /api/auth/verify/phone/status
     * @access Protected
     */
    async checkPhoneVerificationStatus(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { phoneNumber } = req.query;

            if (!phoneNumber) {
                throw new AppError('Phone number is required', 400, 'MISSING_PHONE_NUMBER');
            }

            // Call shared verification service to check status
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const status = await VerificationService.getPhoneVerificationStatus(
                userId,
                phoneNumber,
                tenantId
            );

            logger.debug('Phone verification status checked', {
                userId,
                phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                isVerified: status.isVerified
            });

            res.status(200).json({
                success: true,
                message: 'Phone verification status retrieved',
                data: {
                    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                    isVerified: status.isVerified,
                    verifiedAt: status.verifiedAt,
                    canResend: status.canResend,
                    nextResendAvailableAt: status.nextResendAvailableAt
                }
            });

        } catch (error) {
            logger.error('Check phone verification status failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Resend phone verification code
     * @route POST /api/auth/verify/phone/resend
     * @access Protected
     */
    async resendPhoneVerificationCode(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { phoneNumber, method } = req.body;

            if (!phoneNumber) {
                throw new AppError('Phone number is required', 400, 'MISSING_PHONE_NUMBER');
            }

            const verificationMethod = method || 'sms';

            // Call shared verification service to resend code
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const result = await VerificationService.sendPhoneVerificationCode(
                userId,
                phoneNumber,
                verificationMethod,
                tenantId
            );

            logger.info('Phone verification code resent', {
                userId,
                phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                method: verificationMethod,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: `Verification code resent via ${verificationMethod}`,
                data: {
                    phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'),
                    verificationId: result.verificationId,
                    expiresIn: result.expiresIn,
                    method: verificationMethod,
                    canResendAt: result.canResendAt
                }
            });

        } catch (error) {
            logger.error('Resend phone verification code failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Verify document (for KYC purposes)
     * @route POST /api/auth/verify/document
     * @access Protected
     */
    async verifyDocument(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { documentType, documentNumber, documentImages } = req.body;

            if (!documentType) {
                throw new AppError('Document type is required', 400, 'MISSING_DOCUMENT_TYPE');
            }

            if (!documentNumber) {
                throw new AppError('Document number is required', 400, 'MISSING_DOCUMENT_NUMBER');
            }

            if (!documentImages || !Array.isArray(documentImages) || documentImages.length === 0) {
                throw new AppError('Document images are required', 400, 'MISSING_DOCUMENT_IMAGES');
            }

            // Call shared verification service to submit document
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const result = await VerificationService.submitDocumentVerification(
                userId,
                {
                    type: documentType,
                    number: documentNumber,
                    images: documentImages
                },
                tenantId
            );

            logger.info('Document verification submitted', {
                userId,
                documentType,
                tenantId,
                verificationId: result.verificationId
            });

            res.status(200).json({
                success: true,
                message: 'Document submitted for verification',
                data: {
                    verificationId: result.verificationId,
                    status: result.status,
                    estimatedCompletionTime: result.estimatedCompletionTime,
                    message: 'Your document is being reviewed. You will be notified once verification is complete.'
                }
            });

        } catch (error) {
            logger.error('Document verification submission failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get verification status for all methods
     * @route GET /api/auth/verify/status
     * @access Protected
     */
    async getVerificationStatus(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call shared verification service to get all statuses
            const VerificationService = require('../../../../../../shared/lib/auth/services/verification-service');
            const status = await VerificationService.getAllVerificationStatuses(userId, tenantId);

            logger.debug('Verification statuses retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Verification statuses retrieved',
                data: {
                    email: status.email,
                    phone: status.phone,
                    document: status.document,
                    overallStatus: status.overallStatus,
                    completionPercentage: status.completionPercentage
                }
            });

        } catch (error) {
            logger.error('Get verification status failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new VerificationController();