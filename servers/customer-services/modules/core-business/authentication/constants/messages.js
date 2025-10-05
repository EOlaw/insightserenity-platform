/**
 * @fileoverview Authentication Messages
 * @module servers/customer-services/modules/core-business/authentication/constants/messages
 * @description Centralized message constants for authentication responses
 * @version 1.0.0
 */

/**
 * Authentication Messages
 */
const AUTH_MESSAGES = {
    // Registration messages
    REGISTRATION_SUCCESS: 'Registration successful. Welcome!',
    REGISTRATION_VERIFICATION_REQUIRED: 'Registration successful. Please verify your email to activate your account.',
    REGISTRATION_FAILED: 'Registration failed. Please try again.',
    
    // Login messages
    LOGIN_SUCCESS: 'Login successful. Welcome back!',
    LOGIN_FAILED: 'Invalid email or password. Please try again.',
    LOGIN_ACCOUNT_LOCKED: 'Your account has been locked due to multiple failed login attempts. Please try again later or reset your password.',
    LOGIN_ACCOUNT_SUSPENDED: 'Your account has been suspended. Please contact support for assistance.',
    LOGIN_ACCOUNT_INACTIVE: 'Your account is inactive. Please contact support to reactivate your account.',
    LOGIN_VERIFICATION_REQUIRED: 'Please verify your email address before logging in.',
    LOGIN_MFA_REQUIRED: 'Multi-factor authentication required. Please enter your verification code.',
    
    // Logout messages
    LOGOUT_SUCCESS: 'You have been logged out successfully.',
    LOGOUT_ALL_SUCCESS: 'You have been logged out from all devices successfully.',
    
    // Token messages
    TOKEN_REFRESH_SUCCESS: 'Token refreshed successfully.',
    TOKEN_REFRESH_FAILED: 'Failed to refresh token. Please log in again.',
    TOKEN_INVALID: 'Invalid or expired token. Please log in again.',
    TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
    TOKEN_MISSING: 'Authentication token is missing. Please log in.',
    TOKEN_REVOKED: 'This token has been revoked. Please log in again.',
    
    // Account status messages
    ACCOUNT_CREATED: 'Your account has been created successfully.',
    ACCOUNT_UPDATED: 'Your account has been updated successfully.',
    ACCOUNT_DELETED: 'Your account has been deleted successfully.',
    ACCOUNT_LOCKED: 'Your account has been locked for security reasons.',
    ACCOUNT_UNLOCKED: 'Your account has been unlocked successfully.',
    
    // Rate limiting messages
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
    TOO_MANY_LOGIN_ATTEMPTS: 'Too many login attempts. Your account has been temporarily locked.',
    TOO_MANY_REGISTRATION_ATTEMPTS: 'Too many registration attempts. Please try again later.',
    
    // General error messages
    INTERNAL_ERROR: 'An internal error occurred. Please try again later.',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later.',
    INVALID_REQUEST: 'Invalid request. Please check your input and try again.',
    UNAUTHORIZED: 'You are not authorized to perform this action.',
    FORBIDDEN: 'Access denied. You do not have permission to access this resource.'
};

/**
 * Password Messages
 */
const PASSWORD_MESSAGES = {
    // Password change messages
    CHANGE_SUCCESS: 'Your password has been changed successfully.',
    CHANGE_FAILED: 'Failed to change password. Please try again.',
    CHANGE_INVALID_CURRENT: 'Current password is incorrect.',
    CHANGE_SAME_AS_CURRENT: 'New password must be different from your current password.',
    
    // Password reset messages
    RESET_REQUEST_SUCCESS: 'If an account exists with this email, a password reset link has been sent.',
    RESET_REQUEST_FAILED: 'Failed to send password reset email. Please try again.',
    RESET_SUCCESS: 'Your password has been reset successfully. You can now log in with your new password.',
    RESET_FAILED: 'Failed to reset password. The reset link may have expired.',
    RESET_TOKEN_INVALID: 'Invalid or expired password reset link. Please request a new one.',
    RESET_TOKEN_EXPIRED: 'Your password reset link has expired. Please request a new one.',
    RESET_TOO_MANY_ATTEMPTS: 'Too many password reset attempts. Please try again later.',
    
    // Password validation messages
    PASSWORD_TOO_SHORT: 'Password must be at least 8 characters long.',
    PASSWORD_TOO_LONG: 'Password must not exceed 128 characters.',
    PASSWORD_WEAK: 'Password is too weak. Please choose a stronger password.',
    PASSWORD_MISSING_UPPERCASE: 'Password must contain at least one uppercase letter.',
    PASSWORD_MISSING_LOWERCASE: 'Password must contain at least one lowercase letter.',
    PASSWORD_MISSING_NUMBER: 'Password must contain at least one number.',
    PASSWORD_MISSING_SPECIAL: 'Password must contain at least one special character.',
    PASSWORD_COMMON: 'This password is too common. Please choose a more unique password.',
    PASSWORD_REUSED: 'You have used this password recently. Please choose a different password.',
    PASSWORD_CONTAINS_EMAIL: 'Password should not contain your email address.',
    PASSWORD_CONTAINS_NAME: 'Password should not contain your name.',
    PASSWORD_SEQUENTIAL: 'Password should not contain sequential characters.',
    PASSWORD_MISMATCH: 'Passwords do not match. Please try again.',
    
    // Password expiry messages
    PASSWORD_EXPIRED: 'Your password has expired. Please change your password.',
    PASSWORD_EXPIRING_SOON: 'Your password will expire in {days} days. Please consider changing it.',
    PASSWORD_NEVER_EXPIRES: 'Your password does not expire.',
    
    // Password requirements messages
    PASSWORD_REQUIREMENTS: 'Password must meet the following requirements:',
    PASSWORD_REQUIREMENTS_LIST: 'At least 8 characters, one uppercase letter, one lowercase letter, one number, and one special character.',
    
    // Password strength messages
    PASSWORD_STRENGTH_VERY_WEAK: 'Very Weak - This password is easily guessable.',
    PASSWORD_STRENGTH_WEAK: 'Weak - Consider adding more complexity.',
    PASSWORD_STRENGTH_MEDIUM: 'Medium - This password is moderately secure.',
    PASSWORD_STRENGTH_STRONG: 'Strong - This is a good password.',
    PASSWORD_STRENGTH_VERY_STRONG: 'Very Strong - Excellent password choice!'
};

/**
 * MFA Messages
 */
const MFA_MESSAGES = {
    // MFA setup messages
    SETUP_SUCCESS: 'Multi-factor authentication has been enabled successfully.',
    SETUP_FAILED: 'Failed to enable multi-factor authentication. Please try again.',
    SETUP_TOTP_INITIATED: 'Scan the QR code with your authenticator app and enter the verification code.',
    SETUP_SMS_INITIATED: 'A verification code has been sent to your phone number.',
    SETUP_EMAIL_INITIATED: 'A verification code has been sent to your email address.',
    SETUP_ALREADY_ENABLED: 'Multi-factor authentication is already enabled for this method.',
    
    // MFA verification messages
    VERIFICATION_SUCCESS: 'Verification code accepted. Multi-factor authentication is now active.',
    VERIFICATION_FAILED: 'Invalid verification code. Please try again.',
    VERIFICATION_EXPIRED: 'Verification code has expired. Please request a new one.',
    VERIFICATION_CODE_SENT: 'A new verification code has been sent.',
    VERIFICATION_TOO_MANY_ATTEMPTS: 'Too many failed verification attempts. Please try again later.',
    
    // MFA challenge messages
    CHALLENGE_REQUIRED: 'Multi-factor authentication required. Please enter your verification code.',
    CHALLENGE_SUCCESS: 'Verification successful. You are now logged in.',
    CHALLENGE_FAILED: 'Invalid verification code. Please try again.',
    CHALLENGE_EXPIRED: 'Verification session has expired. Please log in again.',
    CHALLENGE_CODE_SENT: 'A verification code has been sent to your registered device.',
    
    // MFA disable messages
    DISABLE_SUCCESS: 'Multi-factor authentication has been disabled.',
    DISABLE_FAILED: 'Failed to disable multi-factor authentication. Please try again.',
    DISABLE_PASSWORD_REQUIRED: 'Please enter your password to disable multi-factor authentication.',
    DISABLE_LAST_METHOD: 'Cannot disable the last authentication method. Please enable another method first.',
    
    // Backup codes messages
    BACKUP_CODES_GENERATED: 'Backup codes generated successfully. Please store them in a safe place.',
    BACKUP_CODES_REGENERATED: 'New backup codes generated. Previous codes are now invalid.',
    BACKUP_CODES_WARNING: 'Each backup code can only be used once. Store these codes securely.',
    BACKUP_CODE_USED: 'Backup code accepted. Please regenerate backup codes after using all of them.',
    BACKUP_CODE_INVALID: 'Invalid backup code. Please try again.',
    BACKUP_CODE_ALREADY_USED: 'This backup code has already been used.',
    
    // MFA method messages
    METHOD_NOT_ENABLED: 'This multi-factor authentication method is not enabled.',
    METHOD_ALREADY_EXISTS: 'This authentication method is already configured.',
    METHOD_NOT_SUPPORTED: 'This authentication method is not supported.',
    
    // General MFA messages
    MFA_REQUIRED_FOR_ROLE: 'Multi-factor authentication is required for your account role.',
    MFA_RECOMMENDED: 'We recommend enabling multi-factor authentication to secure your account.',
    MFA_NOT_CONFIGURED: 'Multi-factor authentication is not configured for your account.'
};

/**
 * Session Messages
 */
const SESSION_MESSAGES = {
    // Session management messages
    SESSION_CREATED: 'New session created successfully.',
    SESSION_TERMINATED: 'Session terminated successfully.',
    SESSION_EXPIRED: 'Your session has expired. Please log in again.',
    SESSION_INVALID: 'Invalid session. Please log in again.',
    SESSION_NOT_FOUND: 'Session not found.',
    
    // Multiple sessions messages
    ALL_SESSIONS_TERMINATED: 'All sessions have been terminated successfully.',
    OTHER_SESSIONS_TERMINATED: 'All other sessions have been terminated successfully.',
    MAX_SESSIONS_REACHED: 'Maximum number of concurrent sessions reached. Please log out from another device.',
    
    // Session activity messages
    SESSION_ACTIVITY_UPDATED: 'Session activity updated successfully.',
    SESSION_INACTIVE: 'Your session has been inactive for too long. Please log in again.',
    
    // Suspicious activity messages
    SUSPICIOUS_ACTIVITY_DETECTED: 'Suspicious activity detected on your account. Please verify your identity.',
    SESSION_REPORTED: 'Session has been reported successfully. Our security team will review it.',
    UNUSUAL_LOCATION: 'We detected a login from an unusual location. If this was you, you can ignore this message.',
    UNUSUAL_DEVICE: 'We detected a login from a new device. If this was you, you can ignore this message.',
    
    // Session information messages
    CURRENT_SESSION: 'This is your current session.',
    SESSION_DETAILS_RETRIEVED: 'Session details retrieved successfully.',
    SESSION_LIST_RETRIEVED: 'Active sessions retrieved successfully.',
    SESSION_STATS_RETRIEVED: 'Session statistics retrieved successfully.'
};

/**
 * OAuth Messages
 */
const OAUTH_MESSAGES = {
    // OAuth authentication messages
    OAUTH_LOGIN_SUCCESS: 'Successfully logged in with {provider}.',
    OAUTH_LOGIN_FAILED: 'Failed to log in with {provider}. Please try again.',
    OAUTH_SIGNUP_SUCCESS: 'Successfully signed up with {provider}.',
    OAUTH_CANCELLED: 'Authentication with {provider} was cancelled.',
    OAUTH_ERROR: 'An error occurred during {provider} authentication.',
    
    // OAuth linking messages
    OAUTH_LINK_SUCCESS: '{provider} account linked successfully.',
    OAUTH_LINK_FAILED: 'Failed to link {provider} account. Please try again.',
    OAUTH_ALREADY_LINKED: 'This {provider} account is already linked to your account.',
    OAUTH_LINKED_TO_ANOTHER: 'This {provider} account is already linked to another user.',
    
    // OAuth unlinking messages
    OAUTH_UNLINK_SUCCESS: '{provider} account unlinked successfully.',
    OAUTH_UNLINK_FAILED: 'Failed to unlink {provider} account. Please try again.',
    OAUTH_UNLINK_LAST_METHOD: 'Cannot unlink the last authentication method. Please set a password first.',
    OAUTH_NOT_LINKED: 'This {provider} account is not linked to your account.',
    
    // OAuth provider messages
    OAUTH_PROVIDER_NOT_SUPPORTED: 'This OAuth provider is not supported.',
    OAUTH_PROVIDER_DISABLED: 'Authentication with {provider} is currently disabled.',
    OAUTH_STATE_INVALID: 'Invalid OAuth state. Please try again.',
    OAUTH_CODE_INVALID: 'Invalid OAuth authorization code.',
    
    // OAuth permission messages
    OAUTH_PERMISSIONS_DENIED: 'Required permissions were not granted. Please allow access to continue.',
    OAUTH_SCOPE_INSUFFICIENT: 'Insufficient permissions granted. Please allow all required access.'
};

/**
 * Verification Messages
 */
const VERIFICATION_MESSAGES = {
    // Email verification messages
    EMAIL_VERIFICATION_SENT: 'A verification email has been sent to your email address.',
    EMAIL_VERIFICATION_RESENT: 'Verification email resent successfully.',
    EMAIL_VERIFICATION_SUCCESS: 'Your email has been verified successfully.',
    EMAIL_VERIFICATION_FAILED: 'Email verification failed. The link may have expired.',
    EMAIL_VERIFICATION_INVALID: 'Invalid verification link. Please request a new one.',
    EMAIL_VERIFICATION_EXPIRED: 'Verification link has expired. Please request a new one.',
    EMAIL_ALREADY_VERIFIED: 'Your email address is already verified.',
    EMAIL_NOT_VERIFIED: 'Please verify your email address to continue.',
    
    // Phone verification messages
    PHONE_VERIFICATION_SENT: 'A verification code has been sent to your phone number.',
    PHONE_VERIFICATION_RESENT: 'Verification code resent successfully.',
    PHONE_VERIFICATION_SUCCESS: 'Your phone number has been verified successfully.',
    PHONE_VERIFICATION_FAILED: 'Phone verification failed. Invalid code.',
    PHONE_VERIFICATION_EXPIRED: 'Verification code has expired. Please request a new one.',
    PHONE_ALREADY_VERIFIED: 'Your phone number is already verified.',
    PHONE_NOT_VERIFIED: 'Please verify your phone number to continue.',
    
    // Document verification messages
    DOCUMENT_VERIFICATION_SUBMITTED: 'Your document has been submitted for verification.',
    DOCUMENT_VERIFICATION_REVIEWING: 'Your document is being reviewed. This usually takes 24-48 hours.',
    DOCUMENT_VERIFICATION_SUCCESS: 'Your identity document has been verified successfully.',
    DOCUMENT_VERIFICATION_FAILED: 'Document verification failed. Please resubmit a clear image.',
    DOCUMENT_VERIFICATION_REJECTED: 'Your document was rejected. Reason: {reason}',
    DOCUMENT_TYPE_INVALID: 'Invalid document type. Please upload a valid identification document.',
    DOCUMENT_SIZE_EXCEEDED: 'Document file size exceeds the maximum limit of 10MB.',
    DOCUMENT_FORMAT_INVALID: 'Invalid file format. Please upload JPG, PNG, or PDF files only.',
    
    // Verification code messages
    CODE_INVALID: 'Invalid verification code. Please try again.',
    CODE_EXPIRED: 'Verification code has expired. Please request a new one.',
    CODE_TOO_MANY_ATTEMPTS: 'Too many failed attempts. Please request a new verification code.',
    CODE_RESEND_COOLDOWN: 'Please wait {seconds} seconds before requesting another code.',
    
    // General verification messages
    VERIFICATION_REQUIRED: 'Verification is required to complete this action.',
    VERIFICATION_PENDING: 'Your verification is pending. Please check back later.',
    VERIFICATION_COMPLETE: 'All verification steps completed successfully.',
    VERIFICATION_STATUS_RETRIEVED: 'Verification status retrieved successfully.'
};

/**
 * Validation Messages
 */
const VALIDATION_MESSAGES = {
    // Required field messages
    FIELD_REQUIRED: '{field} is required.',
    EMAIL_REQUIRED: 'Email address is required.',
    PASSWORD_REQUIRED: 'Password is required.',
    USERNAME_REQUIRED: 'Username is required.',
    NAME_REQUIRED: 'Name is required.',
    PHONE_REQUIRED: 'Phone number is required.',
    
    // Format validation messages
    EMAIL_INVALID: 'Please enter a valid email address.',
    PHONE_INVALID: 'Please enter a valid phone number.',
    USERNAME_INVALID: 'Username can only contain letters, numbers, and underscores.',
    URL_INVALID: 'Please enter a valid URL.',
    DATE_INVALID: 'Please enter a valid date.',
    
    // Length validation messages
    TOO_SHORT: '{field} must be at least {min} characters long.',
    TOO_LONG: '{field} must not exceed {max} characters.',
    EXACT_LENGTH: '{field} must be exactly {length} characters long.',
    
    // Range validation messages
    OUT_OF_RANGE: '{field} must be between {min} and {max}.',
    MIN_VALUE: '{field} must be at least {min}.',
    MAX_VALUE: '{field} must not exceed {max}.',
    
    // Duplicate validation messages
    EMAIL_EXISTS: 'An account with this email address already exists.',
    USERNAME_EXISTS: 'This username is already taken.',
    PHONE_EXISTS: 'An account with this phone number already exists.',
    
    // Pattern validation messages
    INVALID_CHARACTERS: '{field} contains invalid characters.',
    INVALID_FORMAT: '{field} format is invalid.',
    
    // General validation messages
    VALIDATION_FAILED: 'Validation failed. Please check your input and try again.',
    INVALID_INPUT: 'Invalid input provided.'
};

/**
 * Success Messages
 */
const SUCCESS_MESSAGES = {
    OPERATION_SUCCESS: 'Operation completed successfully.',
    DATA_SAVED: 'Data saved successfully.',
    DATA_UPDATED: 'Data updated successfully.',
    DATA_DELETED: 'Data deleted successfully.',
    SETTINGS_SAVED: 'Settings saved successfully.',
    PREFERENCES_UPDATED: 'Preferences updated successfully.',
    PROFILE_UPDATED: 'Profile updated successfully.',
    REQUEST_SUBMITTED: 'Your request has been submitted successfully.',
    ACTION_COMPLETED: 'Action completed successfully.'
};

/**
 * Information Messages
 */
const INFO_MESSAGES = {
    PROCESSING: 'Processing your request...',
    PLEASE_WAIT: 'Please wait while we process your request.',
    CHECK_EMAIL: 'Please check your email for further instructions.',
    CHECK_PHONE: 'Please check your phone for a verification code.',
    REDIRECTING: 'Redirecting...',
    LOADING: 'Loading...',
    NO_DATA: 'No data available.',
    COMING_SOON: 'This feature is coming soon.',
    MAINTENANCE: 'This service is temporarily unavailable for maintenance.'
};

/**
 * Warning Messages
 */
const WARNING_MESSAGES = {
    UNSAVED_CHANGES: 'You have unsaved changes. Are you sure you want to leave?',
    IRREVERSIBLE_ACTION: 'This action cannot be undone. Are you sure?',
    DATA_LOSS_WARNING: 'Proceeding will result in data loss. Continue?',
    SECURITY_WARNING: 'For your security, please verify your identity.',
    SESSION_EXPIRING: 'Your session is about to expire. Do you want to continue?',
    FEATURE_DEPRECATED: 'This feature is deprecated and will be removed soon.',
    BETA_FEATURE: 'This is a beta feature. Use with caution.',
    EXPERIMENTAL: 'This is an experimental feature and may not work as expected.'
};

/**
 * Helper function to format messages with variables
 * @param {string} message - Message template
 * @param {Object} variables - Variables to replace in template
 * @returns {string} Formatted message
 */
const formatMessage = (message, variables = {}) => {
    let formattedMessage = message;
    
    Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{${key}}`, 'g');
        formattedMessage = formattedMessage.replace(regex, variables[key]);
    });
    
    return formattedMessage;
};

/**
 * Export all message constants
 */
module.exports = {
    AUTH_MESSAGES,
    PASSWORD_MESSAGES,
    MFA_MESSAGES,
    SESSION_MESSAGES,
    OAUTH_MESSAGES,
    VERIFICATION_MESSAGES,
    VALIDATION_MESSAGES,
    SUCCESS_MESSAGES,
    INFO_MESSAGES,
    WARNING_MESSAGES,
    formatMessage
};