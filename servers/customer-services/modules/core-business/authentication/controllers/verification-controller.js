/**
 * @fileoverview Account Verification Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/verification-controller
 * @version 1.1.0
 * @updated 2025-11-28
 * 
 * CRITICAL FIX:
 * - Removed "Email is required" error that was blocking token-only verification
 * - Added proper user lookup by verification token when email is not provided
 * - This allows verification links from emails to work correctly
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

class VerificationController {
    /**
     * Verify email with token
     * POST /api/auth/verify/email
     * 
     * UPDATED: Now supports both verification flows:
     * 1. With email parameter: { token, email }
     * 2. Token only: { token } - looks up user by token
     */
    async verifyEmail(req, res, next) {
        try {
            const { token, email } = req.body;

            if (!token) {
                return next(new AppError('Verification token is required', 400));
            }

            // CRITICAL FIX: Use the service method directly instead of manual user lookup
            // The service method handles both email-based and token-based user lookup
            const result = await directAuthService.verifyEmail(token, email);

            res.status(200).json({
                success: true,
                message: result.message || 'Email verified successfully',
                data: {
                    verified: result.verified,
                    user: result.user,
                    emailVerified: true,
                    accountStatus: result.user?.accountStatus?.status
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Resend email verification
     * POST /api/auth/verify/email/resend
     */
    async resendEmailVerification(req, res, next) {
        try {
            const { email } = req.body;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            await directAuthService.resendVerificationEmail(email);

            res.status(200).json({
                success: true,
                message: 'Verification email sent successfully'
            });

        } catch (error) {
            // Handle already verified case
            if (error.message && error.message.includes('already verified')) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already verified'
                });
            }

            // Don't reveal if user exists for security
            if (error.statusCode === 404) {
                return res.status(200).json({
                    success: true,
                    message: 'If an account exists with this email, a verification email has been sent'
                });
            }

            next(error);
        }
    }

    /**
     * Send phone verification code
     * POST /api/auth/verify/phone/send
     */
    async sendPhoneVerification(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { phoneNumber } = req.body;

            if (!phoneNumber) {
                return next(new AppError('Phone number is required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Generate verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            user.verification.phone = {
                verified: false,
                code: verificationCode, // In production, hash this
                codeExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
                attempts: 0
            };

            user.phoneNumber = phoneNumber;
            await user.save();

            // TODO: Send SMS with verification code
            // await NotificationService.sendSMS({
            //     to: phoneNumber,
            //     message: `Your verification code is: ${verificationCode}`
            // });

            res.status(200).json({
                success: true,
                message: 'Verification code sent successfully',
                // In development, return code for testing
                ...(process.env.NODE_ENV === 'development' && { verificationCode })
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Verify phone with code
     * POST /api/auth/verify/phone
     */
    async verifyPhone(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { code } = req.body;

            if (!code) {
                return next(new AppError('Verification code is required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            const { phone } = user.verification;

            if (!phone.code || !phone.codeExpires) {
                return next(new AppError('No verification code found. Please request a new code', 400));
            }

            if (phone.codeExpires < new Date()) {
                return next(new AppError('Verification code expired', 400));
            }

            if (phone.attempts >= 5) {
                return next(new AppError('Too many verification attempts', 429));
            }

            if (phone.code !== code) {
                user.verification.phone.attempts += 1;
                await user.save();
                return next(new AppError('Invalid verification code', 400));
            }

            // Verify phone
            user.verification.phone = {
                verified: true,
                verifiedAt: new Date(),
                attempts: 0
            };

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Phone verified successfully',
                data: {
                    phoneVerified: true
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get verification status
     * GET /api/auth/verify/status
     */
    async getVerificationStatus(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            res.status(200).json({
                success: true,
                data: {
                    email: {
                        verified: user.verification?.email?.verified || false,
                        verifiedAt: user.verification?.email?.verifiedAt
                    },
                    phone: {
                        verified: user.verification?.phone?.verified || false,
                        verifiedAt: user.verification?.phone?.verifiedAt
                    },
                    identity: {
                        verified: user.verification?.identity?.verified || false,
                        verifiedAt: user.verification?.identity?.verifiedAt
                    },
                    isFullyVerified: user.isFullyVerified
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Request identity verification
     * POST /api/auth/verify/identity
     */
    async requestIdentityVerification(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { method, documentType } = req.body;

            const validMethods = ['document', 'biometric', 'manual_review'];
            const validDocuments = ['passport', 'drivers_license', 'national_id', 'residence_permit'];

            if (!validMethods.includes(method)) {
                return next(new AppError('Invalid verification method', 400));
            }

            if (method === 'document' && !validDocuments.includes(documentType)) {
                return next(new AppError('Invalid document type', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            if (user.verification?.identity?.verified) {
                return next(new AppError('Identity is already verified', 400));
            }

            // Initialize identity verification
            user.verification.identity = {
                verified: false,
                method: method,
                documents: []
            };

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Identity verification initiated',
                data: {
                    method,
                    nextSteps: method === 'document' 
                        ? 'Please upload your identity document' 
                        : 'Verification process will begin shortly'
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Upload identity document
     * POST /api/auth/verify/identity/upload
     */
    async uploadIdentityDocument(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            // TODO: Handle file upload
            const { documentUrl, documentType } = req.body;

            if (!documentUrl || !documentType) {
                return next(new AppError('Document URL and type are required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Add document to verification
            if (!user.verification.identity) {
                user.verification.identity = {
                    verified: false,
                    documents: []
                };
            }

            user.verification.identity.documents.push({
                type: documentType,
                status: 'pending_review',
                uploadedAt: new Date()
            });

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Identity document uploaded successfully',
                data: {
                    status: 'pending_review',
                    message: 'Your document is being reviewed. This may take 24-48 hours.'
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Check if email is verified
     * GET /api/auth/verify/email/check/:email
     */
    async checkEmailVerification(req, res, next) {
        try {
            const { email } = req.params;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findByEmail(email);

            if (!user) {
                // Don't reveal if user exists
                return res.status(200).json({
                    success: true,
                    data: {
                        verified: false
                    }
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    verified: user.verification?.email?.verified || false
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Add alternate email
     * POST /api/auth/verify/email/alternate
     */
    async addAlternateEmail(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { email } = req.body;

            if (!email) {
                return next(new AppError('Email is required', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Check if email already exists
            const existingUser = await dbService.findByEmail(email);
            if (existingUser && existingUser.id !== user.id) {
                return next(new AppError('Email already in use', 409));
            }

            // Add alternate email
            user.alternateEmails.push({
                email: email.toLowerCase(),
                verified: false,
                isPrimary: false,
                addedAt: new Date()
            });

            await user.save();

            // TODO: Send verification email to alternate email

            res.status(200).json({
                success: true,
                message: 'Alternate email added. Please verify it.',
                data: {
                    alternateEmail: email
                }
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new VerificationController();