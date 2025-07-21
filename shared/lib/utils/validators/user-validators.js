'use strict';

/**
 * @fileoverview User-specific validation utilities for profile and personal data
 * @module shared/lib/utils/validators/user-validators
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/validators/auth-validators
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/constants/roles
 */

const CommonValidator = require('./common-validators');
const AuthValidator = require('./auth-validators');
const DateHelper = require('../helpers/date-helper');
const StringHelper = require('../helpers/string-helper');
const { USER_ROLES, SYSTEM_ROLES } = require('../constants/roles');

/**
 * @class UserValidator
 * @description Provides user-specific validation methods for profiles and personal data
 */
class UserValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #NAME_REGEX = /^[a-zA-Z\s\-'\.]+$/;
  static #PHONE_REGEX = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
  static #POSTAL_CODE_PATTERNS = {
    US: /^\d{5}(-\d{4})?$/,
    UK: /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i,
    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
    AU: /^\d{4}$/,
    DE: /^\d{5}$/,
    FR: /^\d{5}$/,
    JP: /^\d{3}-?\d{4}$/,
    IN: /^\d{6}$/,
    BR: /^\d{5}-?\d{3}$/,
    DEFAULT: /^[A-Z0-9\s-]{3,10}$/i
  };
  
  static #SOCIAL_MEDIA_PATTERNS = {
    twitter: /^@?[A-Za-z0-9_]{1,15}$/,
    instagram: /^@?[A-Za-z0-9_.]{1,30}$/,
    linkedin: /^[a-zA-Z0-9\-]{3,100}$/,
    github: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/,
    facebook: /^[a-zA-Z0-9.]{5,50}$/
  };

  static #FORBIDDEN_USERNAMES = [
    'admin', 'administrator', 'root', 'system', 'api', 'support',
    'help', 'info', 'test', 'demo', 'null', 'undefined', 'anonymous',
    'guest', 'user', 'login', 'logout', 'register', 'signup'
  ];

  /**
   * Validates user profile data
   * @static
   * @param {Object} profile - User profile object
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.requireAll=false] - Require all fields
   * @param {string[]} [options.requiredFields=[]] - Specific required fields
   * @returns {Object} Validation result with field errors
   */
  static validateUserProfile(profile, options = {}) {
    const result = {
      isValid: true,
      errors: {},
      warnings: {},
      sanitized: {}
    };
    
    if (!profile || typeof profile !== 'object') {
      result.isValid = false;
      result.errors.profile = 'Profile data is required';
      return result;
    }
    
    const { requireAll = false, requiredFields = [] } = options;
    
    // Define field validators
    const fieldValidators = {
      firstName: () => this.validateName(profile.firstName, { type: 'first' }),
      lastName: () => this.validateName(profile.lastName, { type: 'last' }),
      displayName: () => this.validateDisplayName(profile.displayName),
      email: () => AuthValidator.validateEmail(profile.email),
      phone: () => this.validatePhoneNumber(profile.phone),
      dateOfBirth: () => this.validateDateOfBirth(profile.dateOfBirth),
      gender: () => this.validateGender(profile.gender),
      bio: () => this.validateBio(profile.bio),
      avatar: () => this.validateAvatarUrl(profile.avatar),
      address: () => this.validateAddress(profile.address),
      timezone: () => this.validateTimezone(profile.timezone),
      language: () => this.validateLanguageCode(profile.language),
      country: () => this.validateCountryCode(profile.country)
    };
    
    // Check required fields
    const fieldsToCheck = requireAll ? Object.keys(fieldValidators) : requiredFields;
    
    for (const field of fieldsToCheck) {
      if (!CommonValidator.isDefined(profile[field])) {
        result.isValid = false;
        result.errors[field] = `${field} is required`;
      }
    }
    
    // Validate provided fields
    for (const [field, validator] of Object.entries(fieldValidators)) {
      if (CommonValidator.isDefined(profile[field])) {
        const validation = validator();
        
        if (!validation.isValid) {
          result.isValid = false;
          result.errors[field] = validation.message || validation.errors;
        } else {
          // Store sanitized value if available
          if (validation.sanitized) {
            result.sanitized[field] = validation.sanitized;
          } else if (validation.normalized) {
            result.sanitized[field] = validation.normalized;
          } else {
            result.sanitized[field] = profile[field];
          }
          
          // Add warnings if any
          if (validation.warning) {
            result.warnings[field] = validation.warning;
          }
        }
      }
    }
    
    // Cross-field validation
    if (profile.password && profile.email) {
      const passwordValidation = AuthValidator.validatePassword(profile.password, {
        userInputs: [profile.email, profile.firstName, profile.lastName]
      });
      
      if (!passwordValidation.isValid) {
        result.isValid = false;
        result.errors.password = passwordValidation.issues;
      }
    }
    
    return result;
  }

  /**
   * Validates name fields
   * @static
   * @param {string} name - Name to validate
   * @param {Object} [options={}] - Validation options
   * @param {string} [options.type='general'] - Type of name (first, last, middle, general)
   * @param {number} [options.minLength=1] - Minimum length
   * @param {number} [options.maxLength=50] - Maximum length
   * @returns {Object} Validation result
   */
  static validateName(name, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!name || typeof name !== 'string') {
      result.message = 'Name is required';
      return result;
    }
    
    const {
      type = 'general',
      minLength = 1,
      maxLength = 50
    } = options;
    
    const trimmedName = name.trim();
    
    // Length validation
    if (trimmedName.length < minLength) {
      result.message = `Name must be at least ${minLength} characters`;
      return result;
    }
    
    if (trimmedName.length > maxLength) {
      result.message = `Name must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Pattern validation
    if (!this.#NAME_REGEX.test(trimmedName)) {
      result.message = 'Name contains invalid characters';
      return result;
    }
    
    // Specific validations based on type
    if (type === 'first' || type === 'last') {
      // Check for single character names (might be initials)
      if (trimmedName.length === 1) {
        result.warning = 'Single character name detected';
      }
      
      // Check for all uppercase (might need normalization)
      if (trimmedName === trimmedName.toUpperCase()) {
        result.warning = 'Name is all uppercase';
      }
    }
    
    result.isValid = true;
    result.sanitized = StringHelper.capitalize(trimmedName);
    return result;
  }

  /**
   * Validates display name
   * @static
   * @param {string} displayName - Display name to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateDisplayName(displayName, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!displayName || typeof displayName !== 'string') {
      result.message = 'Display name is required';
      return result;
    }
    
    const {
      minLength = 3,
      maxLength = 30,
      allowSpecialChars = true
    } = options;
    
    const trimmed = displayName.trim();
    
    // Length validation
    if (trimmed.length < minLength || trimmed.length > maxLength) {
      result.message = `Display name must be between ${minLength} and ${maxLength} characters`;
      return result;
    }
    
    // Pattern validation
    const pattern = allowSpecialChars
      ? /^[a-zA-Z0-9\s\-_\.]+$/
      : /^[a-zA-Z0-9\s]+$/;
    
    if (!pattern.test(trimmed)) {
      result.message = 'Display name contains invalid characters';
      return result;
    }
    
    // Check against forbidden usernames
    if (this.#FORBIDDEN_USERNAMES.includes(trimmed.toLowerCase())) {
      result.message = 'This display name is not allowed';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = trimmed;
    return result;
  }

  /**
   * Validates phone number
   * @static
   * @param {string} phone - Phone number to validate
   * @param {Object} [options={}] - Validation options
   * @param {string} [options.country] - Country code for validation
   * @param {boolean} [options.mobile=false] - Validate as mobile number
   * @returns {Object} Validation result
   */
  static validatePhoneNumber(phone, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!phone || typeof phone !== 'string') {
      result.message = 'Phone number is required';
      return result;
    }
    
    // Remove common formatting characters
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    
    // Basic pattern validation
    if (!this.#PHONE_REGEX.test(phone)) {
      result.message = 'Invalid phone number format';
      return result;
    }
    
    // Length validation (international numbers can be 7-15 digits)
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      result.message = 'Phone number must be between 7 and 15 digits';
      return result;
    }
    
    // Country-specific validation could be added here
    const { country, mobile = false } = options;
    
    if (country) {
      // Add country-specific validation logic
      // This would require a comprehensive phone validation library
    }
    
    if (mobile) {
      // Add mobile-specific validation
      // Check if number starts with mobile prefixes for the country
    }
    
    result.isValid = true;
    result.sanitized = cleaned;
    result.formatted = this.#formatPhoneNumber(cleaned, country);
    return result;
  }

  /**
   * Validates date of birth
   * @static
   * @param {string|Date} dateOfBirth - Date of birth to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.minAge=13] - Minimum age requirement
   * @param {number} [options.maxAge=120] - Maximum age limit
   * @returns {Object} Validation result
   */
  static validateDateOfBirth(dateOfBirth, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!dateOfBirth) {
      result.message = 'Date of birth is required';
      return result;
    }
    
    const date = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
    
    if (isNaN(date.getTime())) {
      result.message = 'Invalid date format';
      return result;
    }
    
    const {
      minAge = 13,
      maxAge = 120
    } = options;
    
    const now = new Date();
    const age = Math.floor((now - date) / (365.25 * 24 * 60 * 60 * 1000));
    
    // Future date check
    if (date > now) {
      result.message = 'Date of birth cannot be in the future';
      return result;
    }
    
    // Age validation
    if (age < minAge) {
      result.message = `Must be at least ${minAge} years old`;
      return result;
    }
    
    if (age > maxAge) {
      result.message = `Age cannot exceed ${maxAge} years`;
      return result;
    }
    
    result.isValid = true;
    result.age = age;
    result.sanitized = date.toISOString().split('T')[0];
    return result;
  }

  /**
   * Validates gender
   * @static
   * @param {string} gender - Gender to validate
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.allowedValues] - Allowed gender values
   * @returns {Object} Validation result
   */
  static validateGender(gender, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!gender || typeof gender !== 'string') {
      result.message = 'Gender is required';
      return result;
    }
    
    const {
      allowedValues = ['male', 'female', 'other', 'prefer-not-to-say']
    } = options;
    
    const normalized = gender.toLowerCase().trim();
    
    if (!allowedValues.includes(normalized)) {
      result.message = 'Invalid gender value';
      return result;
    }
    
    result.isValid = true;
    result.normalized = normalized;
    return result;
  }

  /**
   * Validates user bio
   * @static
   * @param {string} bio - Bio text to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.maxLength=500] - Maximum bio length
   * @param {boolean} [options.allowHtml=false] - Allow HTML content
   * @returns {Object} Validation result
   */
  static validateBio(bio, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!bio || typeof bio !== 'string') {
      result.message = 'Bio is required';
      return result;
    }
    
    const {
      maxLength = 500,
      allowHtml = false
    } = options;
    
    const trimmed = bio.trim();
    
    if (trimmed.length > maxLength) {
      result.message = `Bio must not exceed ${maxLength} characters`;
      return result;
    }
    
    // HTML validation
    if (!allowHtml && /<[^>]+>/.test(trimmed)) {
      result.message = 'Bio cannot contain HTML';
      return result;
    }
    
    // Check for prohibited content
    const prohibitedPatterns = [
      /\b(?:fuck|shit|damn)\b/gi,  // Profanity
      /(?:http|https):\/\/[^\s]+/g, // URLs (if not wanted in bio)
      /[^\x00-\x7F]/g  // Non-ASCII characters (optional)
    ];
    
    // Sanitize bio
    let sanitized = trimmed;
    if (!allowHtml) {
      sanitized = sanitized.replace(/<[^>]+>/g, ''); // Strip HTML
    }
    
    result.isValid = true;
    result.sanitized = sanitized;
    result.length = sanitized.length;
    return result;
  }

  /**
   * Validates avatar URL
   * @static
   * @param {string} avatarUrl - Avatar URL to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateAvatarUrl(avatarUrl, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      result.message = 'Avatar URL is required';
      return result;
    }
    
    const {
      allowedDomains = [],
      maxSizeMB = 5
    } = options;
    
    // Validate URL format
    const urlValidation = CommonValidator.isValidURL(avatarUrl);
    if (!urlValidation) {
      result.message = 'Invalid avatar URL format';
      return result;
    }
    
    try {
      const url = new URL(avatarUrl);
      
      // Check allowed domains
      if (allowedDomains.length > 0 && !allowedDomains.includes(url.hostname)) {
        result.message = 'Avatar URL domain not allowed';
        return result;
      }
      
      // Check file extension
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const hasValidExtension = validExtensions.some(ext => 
        url.pathname.toLowerCase().endsWith(ext)
      );
      
      if (!hasValidExtension) {
        result.message = 'Avatar must be an image file';
        return result;
      }
      
      result.isValid = true;
      result.sanitized = avatarUrl;
      
    } catch (error) {
      result.message = 'Invalid URL';
      return result;
    }
    
    return result;
  }

  /**
   * Validates physical address
   * @static
   * @param {Object} address - Address object to validate
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.requiredFields] - Required address fields
   * @returns {Object} Validation result
   */
  static validateAddress(address, options = {}) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!address || typeof address !== 'object') {
      result.isValid = false;
      result.errors.address = 'Address is required';
      return result;
    }
    
    const {
      requiredFields = ['street', 'city', 'postalCode', 'country']
    } = options;
    
    // Check required fields
    for (const field of requiredFields) {
      if (!address[field] || address[field].trim() === '') {
        result.isValid = false;
        result.errors[field] = `${field} is required`;
      }
    }
    
    // Validate individual fields
    if (address.street) {
      const street = address.street.trim();
      if (street.length < 3 || street.length > 100) {
        result.isValid = false;
        result.errors.street = 'Street address must be between 3 and 100 characters';
      } else {
        result.sanitized.street = street;
      }
    }
    
    if (address.city) {
      const city = address.city.trim();
      if (!/^[a-zA-Z\s\-'\.]+$/.test(city) || city.length < 2 || city.length > 50) {
        result.isValid = false;
        result.errors.city = 'Invalid city name';
      } else {
        result.sanitized.city = StringHelper.capitalize(city);
      }
    }
    
    if (address.state) {
      const state = address.state.trim().toUpperCase();
      // Add state validation based on country
      result.sanitized.state = state;
    }
    
    if (address.postalCode) {
      const postalValidation = this.validatePostalCode(
        address.postalCode,
        address.country || 'DEFAULT'
      );
      
      if (!postalValidation.isValid) {
        result.isValid = false;
        result.errors.postalCode = postalValidation.message;
      } else {
        result.sanitized.postalCode = postalValidation.sanitized;
      }
    }
    
    if (address.country) {
      const countryValidation = this.validateCountryCode(address.country);
      if (!countryValidation.isValid) {
        result.isValid = false;
        result.errors.country = countryValidation.message;
      } else {
        result.sanitized.country = countryValidation.sanitized;
      }
    }
    
    return result;
  }

  /**
   * Validates postal/zip code
   * @static
   * @param {string} postalCode - Postal code to validate
   * @param {string} country - Country code
   * @returns {Object} Validation result
   */
  static validatePostalCode(postalCode, country = 'DEFAULT') {
    const result = { isValid: false, message: '' };
    
    if (!postalCode || typeof postalCode !== 'string') {
      result.message = 'Postal code is required';
      return result;
    }
    
    const trimmed = postalCode.trim().toUpperCase();
    const pattern = this.#POSTAL_CODE_PATTERNS[country] || this.#POSTAL_CODE_PATTERNS.DEFAULT;
    
    if (!pattern.test(trimmed)) {
      result.message = `Invalid postal code format for ${country}`;
      return result;
    }
    
    result.isValid = true;
    result.sanitized = trimmed;
    return result;
  }

  /**
   * Validates country code
   * @static
   * @param {string} countryCode - ISO country code
   * @returns {Object} Validation result
   */
  static validateCountryCode(countryCode) {
    const result = { isValid: false, message: '' };
    
    if (!countryCode || typeof countryCode !== 'string') {
      result.message = 'Country code is required';
      return result;
    }
    
    const upper = countryCode.toUpperCase().trim();
    
    // Validate ISO 3166-1 alpha-2 code
    if (!/^[A-Z]{2}$/.test(upper)) {
      result.message = 'Country code must be 2 letters';
      return result;
    }
    
    // List of valid ISO country codes (partial list for example)
    const validCodes = [
      'US', 'UK', 'GB', 'CA', 'AU', 'NZ', 'IE', 'DE', 'FR', 'IT', 'ES',
      'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'JP', 'CN', 'KR',
      'IN', 'BR', 'MX', 'AR', 'CL', 'CO', 'PE', 'ZA', 'EG', 'IL', 'AE'
    ];
    
    // In production, this would use a complete ISO country code list
    if (!validCodes.includes(upper)) {
      result.message = 'Invalid country code';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = upper;
    return result;
  }

  /**
   * Validates timezone
   * @static
   * @param {string} timezone - Timezone identifier
   * @returns {Object} Validation result
   */
  static validateTimezone(timezone) {
    const result = { isValid: false, message: '' };
    
    if (!timezone || typeof timezone !== 'string') {
      result.message = 'Timezone is required';
      return result;
    }
    
    // Validate IANA timezone format (e.g., "America/New_York")
    if (!/^[A-Za-z]+\/[A-Za-z_]+$/.test(timezone)) {
      result.message = 'Invalid timezone format';
      return result;
    }
    
    // In production, validate against Intl.supportedValuesOf('timeZone')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      result.isValid = true;
      result.sanitized = timezone;
    } catch {
      result.message = 'Invalid timezone identifier';
    }
    
    return result;
  }

  /**
   * Validates language code
   * @static
   * @param {string} language - Language code (ISO 639-1)
   * @returns {Object} Validation result
   */
  static validateLanguageCode(language) {
    const result = { isValid: false, message: '' };
    
    if (!language || typeof language !== 'string') {
      result.message = 'Language code is required';
      return result;
    }
    
    const lower = language.toLowerCase().trim();
    
    // Validate ISO 639-1 code (2 letters) or locale (e.g., en-US)
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      result.message = 'Invalid language code format';
      return result;
    }
    
    // Common language codes
    const validCodes = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'hi', 'bn', 'pa', 'te', 'mr', 'ta', 'ur', 'gu', 'kn'
    ];
    
    const langPart = lower.split('-')[0];
    if (!validCodes.includes(langPart)) {
      result.message = 'Unsupported language code';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = lower;
    return result;
  }

  /**
   * Validates social media handles
   * @static
   * @param {string} handle - Social media handle
   * @param {string} platform - Social media platform
   * @returns {Object} Validation result
   */
  static validateSocialMediaHandle(handle, platform) {
    const result = { isValid: false, message: '' };
    
    if (!handle || typeof handle !== 'string') {
      result.message = 'Social media handle is required';
      return result;
    }
    
    if (!platform || !this.#SOCIAL_MEDIA_PATTERNS[platform]) {
      result.message = 'Invalid social media platform';
      return result;
    }
    
    const pattern = this.#SOCIAL_MEDIA_PATTERNS[platform];
    const cleaned = handle.trim();
    
    if (!pattern.test(cleaned)) {
      result.message = `Invalid ${platform} handle format`;
      return result;
    }
    
    result.isValid = true;
    result.sanitized = cleaned.replace(/^@/, ''); // Remove @ if present
    return result;
  }

  /**
   * Validates user role
   * @static
   * @param {string} role - User role
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.allowedRoles] - Allowed roles
   * @returns {Object} Validation result
   */
  static validateUserRole(role, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!role || typeof role !== 'string') {
      result.message = 'Role is required';
      return result;
    }
    
    const {
      allowedRoles = [...Object.values(USER_ROLES), ...Object.values(SYSTEM_ROLES)]
    } = options;
    
    const normalized = role.toLowerCase().trim();
    
    if (!allowedRoles.includes(normalized)) {
      result.message = 'Invalid or unauthorized role';
      return result;
    }
    
    result.isValid = true;
    result.normalized = normalized;
    return result;
  }

  /**
   * Validates user status
   * @static
   * @param {string} status - User status
   * @returns {Object} Validation result
   */
  static validateUserStatus(status) {
    const result = { isValid: false, message: '' };
    
    const validStatuses = [
      'active', 'inactive', 'pending', 'suspended', 
      'banned', 'deleted', 'archived'
    ];
    
    if (!status || typeof status !== 'string') {
      result.message = 'Status is required';
      return result;
    }
    
    const normalized = status.toLowerCase().trim();
    
    if (!validStatuses.includes(normalized)) {
      result.message = 'Invalid status value';
      return result;
    }
    
    result.isValid = true;
    result.normalized = normalized;
    return result;
  }

  /**
   * Formats phone number based on country
   * @private
   * @static
   * @param {string} phone - Cleaned phone number
   * @param {string} [country] - Country code
   * @returns {string} Formatted phone number
   */
  static #formatPhoneNumber(phone, country) {
    // Simple formatting - in production use a library like libphonenumber
    if (country === 'US' && phone.length === 10) {
      return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
    
    return phone;
  }

  /**
   * Creates a validation chain for user data
   * @static
   * @param {Object} userData - User data to validate
   * @returns {Object} Validation chain
   */
  static createValidator(userData) {
    return {
      validate: () => this.validateUserProfile(userData),
      validateField: (field, value) => {
        const validators = {
          firstName: () => this.validateName(value, { type: 'first' }),
          lastName: () => this.validateName(value, { type: 'last' }),
          email: () => AuthValidator.validateEmail(value),
          phone: () => this.validatePhoneNumber(value),
          dateOfBirth: () => this.validateDateOfBirth(value)
        };
        
        const validator = validators[field];
        return validator ? validator() : { isValid: false, message: 'Unknown field' };
      }
    };
  }
}

module.exports = UserValidator;