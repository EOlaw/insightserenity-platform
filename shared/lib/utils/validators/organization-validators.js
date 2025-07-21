'use strict';

/**
 * @fileoverview Organization-specific validation utilities for enterprise data
 * @module shared/lib/utils/validators/organization-validators
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/validators/auth-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/slug-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('./common-validators');
const AuthValidator = require('./auth-validators');
const StringHelper = require('../helpers/string-helper');
const SlugHelper = require('../helpers/slug-helper');
const { VALIDATION_ERRORS, ORGANIZATION_ERRORS } = require('../constants/error-codes');

/**
 * @class OrganizationValidator
 * @description Provides organization-specific validation methods for enterprise data
 */
class OrganizationValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DOMAIN_REGEX = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
  static #SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  static #TAX_ID_PATTERNS = {
    US_EIN: /^\d{2}-\d{7}$/,
    US_SSN: /^\d{3}-\d{2}-\d{4}$/,
    UK_VAT: /^GB\d{9}$/,
    EU_VAT: /^[A-Z]{2}\d{8,12}$/,
    CA_BN: /^\d{9}(RC|RP|RT)\d{4}$/,
    AU_ABN: /^\d{11}$/,
    IN_GST: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/
  };
  
  static #INDUSTRY_CODES = {
    TECHNOLOGY: ['11', '51', '54'],
    FINANCE: ['52'],
    HEALTHCARE: ['62'],
    MANUFACTURING: ['31', '32', '33'],
    RETAIL: ['44', '45'],
    EDUCATION: ['61'],
    CONSULTING: ['54'],
    REAL_ESTATE: ['53']
  };

  static #RESERVED_SLUGS = [
    'admin', 'api', 'app', 'www', 'mail', 'ftp', 'blog', 'shop', 'support',
    'help', 'about', 'contact', 'terms', 'privacy', 'security', 'status',
    'dashboard', 'settings', 'profile', 'account', 'billing', 'subscription',
    'login', 'logout', 'register', 'signup', 'signin', 'auth', 'oauth'
  ];

  static #COMPANY_SIZES = {
    STARTUP: { min: 1, max: 10, label: 'Startup (1-10)' },
    SMALL: { min: 11, max: 50, label: 'Small (11-50)' },
    MEDIUM: { min: 51, max: 250, label: 'Medium (51-250)' },
    LARGE: { min: 251, max: 1000, label: 'Large (251-1000)' },
    ENTERPRISE: { min: 1001, max: null, label: 'Enterprise (1000+)' }
  };

  /**
   * Validates organization profile data
   * @static
   * @param {Object} organization - Organization data object
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.isNew=true] - Whether this is a new organization
   * @param {string[]} [options.requiredFields=[]] - Required fields for validation
   * @returns {Object} Validation result with errors and sanitized data
   */
  static validateOrganization(organization, options = {}) {
    const result = {
      isValid: true,
      errors: {},
      warnings: {},
      sanitized: {}
    };
    
    if (!organization || typeof organization !== 'object') {
      result.isValid = false;
      result.errors.organization = 'Organization data is required';
      return result;
    }
    
    const { isNew = true, requiredFields = ['name', 'slug', 'email'] } = options;
    
    // Check required fields
    for (const field of requiredFields) {
      if (!CommonValidator.isDefined(organization[field])) {
        result.isValid = false;
        result.errors[field] = `${field} is required`;
      }
    }
    
    // Validate organization name
    if (organization.name) {
      const nameValidation = this.validateOrganizationName(organization.name);
      if (!nameValidation.isValid) {
        result.isValid = false;
        result.errors.name = nameValidation.message;
      } else {
        result.sanitized.name = nameValidation.sanitized;
      }
    }
    
    // Validate slug
    if (organization.slug) {
      const slugValidation = this.validateOrganizationSlug(organization.slug, { isNew });
      if (!slugValidation.isValid) {
        result.isValid = false;
        result.errors.slug = slugValidation.message;
      } else {
        result.sanitized.slug = slugValidation.sanitized;
      }
    }
    
    // Validate email
    if (organization.email) {
      const emailValidation = AuthValidator.validateEmail(organization.email, {
        blockedDomains: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']
      });
      if (!emailValidation.isValid) {
        result.isValid = false;
        result.errors.email = emailValidation.message;
      } else {
        result.sanitized.email = emailValidation.normalizedEmail;
      }
    }
    
    // Validate domain
    if (organization.domain) {
      const domainValidation = this.validateDomain(organization.domain);
      if (!domainValidation.isValid) {
        result.isValid = false;
        result.errors.domain = domainValidation.message;
      } else {
        result.sanitized.domain = domainValidation.sanitized;
      }
    }
    
    // Validate subdomain
    if (organization.subdomain) {
      const subdomainValidation = this.validateSubdomain(organization.subdomain);
      if (!subdomainValidation.isValid) {
        result.isValid = false;
        result.errors.subdomain = subdomainValidation.message;
      } else {
        result.sanitized.subdomain = subdomainValidation.sanitized;
      }
    }
    
    // Validate phone
    if (organization.phone) {
      const phoneValidation = CommonValidator.isValidPhone(organization.phone);
      if (!phoneValidation) {
        result.isValid = false;
        result.errors.phone = 'Invalid phone number format';
      } else {
        result.sanitized.phone = organization.phone;
      }
    }
    
    // Validate address
    if (organization.address) {
      const addressValidation = this.validateBusinessAddress(organization.address);
      if (!addressValidation.isValid) {
        result.isValid = false;
        result.errors.address = addressValidation.errors;
      } else {
        result.sanitized.address = addressValidation.sanitized;
      }
    }
    
    // Validate tax ID
    if (organization.taxId) {
      const taxValidation = this.validateTaxId(
        organization.taxId, 
        organization.country || 'US'
      );
      if (!taxValidation.isValid) {
        result.isValid = false;
        result.errors.taxId = taxValidation.message;
      } else {
        result.sanitized.taxId = taxValidation.sanitized;
      }
    }
    
    // Validate company size
    if (organization.companySize) {
      const sizeValidation = this.validateCompanySize(organization.companySize);
      if (!sizeValidation.isValid) {
        result.isValid = false;
        result.errors.companySize = sizeValidation.message;
      } else {
        result.sanitized.companySize = sizeValidation.sanitized;
      }
    }
    
    // Validate industry
    if (organization.industry) {
      const industryValidation = this.validateIndustry(organization.industry);
      if (!industryValidation.isValid) {
        result.isValid = false;
        result.errors.industry = industryValidation.message;
      } else {
        result.sanitized.industry = industryValidation.sanitized;
      }
    }
    
    // Validate website
    if (organization.website) {
      const websiteValidation = CommonValidator.isValidURL(organization.website);
      if (!websiteValidation) {
        result.isValid = false;
        result.errors.website = 'Invalid website URL';
      } else {
        result.sanitized.website = organization.website;
      }
    }
    
    return result;
  }

  /**
   * Validates organization name
   * @static
   * @param {string} name - Organization name
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateOrganizationName(name, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!name || typeof name !== 'string') {
      result.message = 'Organization name is required';
      return result;
    }
    
    const {
      minLength = 2,
      maxLength = 100,
      allowSpecialChars = true
    } = options;
    
    const trimmed = name.trim();
    
    // Length validation
    if (trimmed.length < minLength) {
      result.message = `Organization name must be at least ${minLength} characters`;
      return result;
    }
    
    if (trimmed.length > maxLength) {
      result.message = `Organization name must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Pattern validation
    const pattern = allowSpecialChars
      ? /^[a-zA-Z0-9\s\-\.,'&()]+$/
      : /^[a-zA-Z0-9\s\-]+$/;
    
    if (!pattern.test(trimmed)) {
      result.message = 'Organization name contains invalid characters';
      return result;
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /test/i,
      /demo/i,
      /sample/i,
      /example/i,
      /xxx/i,
      /[^a-zA-Z0-9\s]{5,}/  // Too many special characters in a row
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(trimmed)) {
        result.warning = 'Organization name appears to be a test or placeholder';
        break;
      }
    }
    
    result.isValid = true;
    result.sanitized = trimmed;
    return result;
  }

  /**
   * Validates organization slug
   * @static
   * @param {string} slug - Organization slug
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateOrganizationSlug(slug, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!slug || typeof slug !== 'string') {
      result.message = 'Organization slug is required';
      return result;
    }
    
    const {
      minLength = 3,
      maxLength = 63,
      isNew = true
    } = options;
    
    const normalized = slug.toLowerCase().trim();
    
    // Length validation
    if (normalized.length < minLength) {
      result.message = `Slug must be at least ${minLength} characters`;
      return result;
    }
    
    if (normalized.length > maxLength) {
      result.message = `Slug must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Format validation
    if (!SlugHelper.isValidSlug(normalized)) {
      result.message = 'Slug contains invalid characters or format';
      return result;
    }
    
    // Reserved slug check
    if (isNew && this.#RESERVED_SLUGS.includes(normalized)) {
      result.message = 'This slug is reserved and cannot be used';
      return result;
    }
    
    // Ensure slug doesn't start or end with hyphen
    if (normalized.startsWith('-') || normalized.endsWith('-')) {
      result.message = 'Slug cannot start or end with a hyphen';
      return result;
    }
    
    // Check for consecutive hyphens
    if (normalized.includes('--')) {
      result.message = 'Slug cannot contain consecutive hyphens';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = normalized;
    result.suggested = SlugHelper.generateSlug(slug);
    return result;
  }

  /**
   * Validates domain name
   * @static
   * @param {string} domain - Domain name
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateDomain(domain, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!domain || typeof domain !== 'string') {
      result.message = 'Domain is required';
      return result;
    }
    
    const {
      allowSubdomains = false,
      blockedDomains = ['example.com', 'test.com', 'localhost']
    } = options;
    
    const normalized = domain.toLowerCase().trim();
    
    // Remove protocol if present
    const cleaned = normalized.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Basic format validation
    if (!this.#DOMAIN_REGEX.test(cleaned)) {
      result.message = 'Invalid domain format';
      return result;
    }
    
    // Check for blocked domains
    if (blockedDomains.some(blocked => cleaned.includes(blocked))) {
      result.message = 'This domain is not allowed';
      return result;
    }
    
    // Subdomain validation
    const parts = cleaned.split('.');
    if (!allowSubdomains && parts.length > 2) {
      // Allow common TLDs like .co.uk
      const commonTwoPartTLDs = ['co.uk', 'com.au', 'co.nz', 'co.in'];
      const lastTwoParts = parts.slice(-2).join('.');
      
      if (!commonTwoPartTLDs.includes(lastTwoParts) && parts.length > 3) {
        result.message = 'Subdomains are not allowed';
        return result;
      }
    }
    
    // Length validation
    if (cleaned.length > 253) {
      result.message = 'Domain name too long';
      return result;
    }
    
    // Label length validation
    for (const label of parts) {
      if (label.length > 63) {
        result.message = 'Domain label too long';
        return result;
      }
    }
    
    result.isValid = true;
    result.sanitized = cleaned;
    result.tld = parts[parts.length - 1];
    return result;
  }

  /**
   * Validates subdomain
   * @static
   * @param {string} subdomain - Subdomain to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateSubdomain(subdomain, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!subdomain || typeof subdomain !== 'string') {
      result.message = 'Subdomain is required';
      return result;
    }
    
    const {
      minLength = 3,
      maxLength = 63,
      reservedSubdomains = this.#RESERVED_SLUGS
    } = options;
    
    const normalized = subdomain.toLowerCase().trim();
    
    // Length validation
    if (normalized.length < minLength) {
      result.message = `Subdomain must be at least ${minLength} characters`;
      return result;
    }
    
    if (normalized.length > maxLength) {
      result.message = `Subdomain must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Format validation
    if (!this.#SUBDOMAIN_REGEX.test(normalized)) {
      result.message = 'Invalid subdomain format';
      return result;
    }
    
    // Reserved subdomain check
    if (reservedSubdomains.includes(normalized)) {
      result.message = 'This subdomain is reserved';
      return result;
    }
    
    // Check for numeric-only subdomains
    if (/^\d+$/.test(normalized)) {
      result.message = 'Subdomain cannot be numeric only';
      return result;
    }
    
    result.isValid = true;
    result.sanitized = normalized;
    return result;
  }

  /**
   * Validates business address
   * @static
   * @param {Object} address - Business address object
   * @returns {Object} Validation result
   */
  static validateBusinessAddress(address) {
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
    
    const requiredFields = ['street1', 'city', 'country'];
    
    // Check required fields
    for (const field of requiredFields) {
      if (!address[field] || address[field].trim() === '') {
        result.isValid = false;
        result.errors[field] = `${field} is required`;
      }
    }
    
    // Validate street address
    if (address.street1) {
      const street1 = address.street1.trim();
      if (street1.length < 5 || street1.length > 200) {
        result.isValid = false;
        result.errors.street1 = 'Street address must be between 5 and 200 characters';
      } else {
        result.sanitized.street1 = street1;
      }
    }
    
    // Validate street2 (optional)
    if (address.street2) {
      const street2 = address.street2.trim();
      if (street2.length > 200) {
        result.isValid = false;
        result.errors.street2 = 'Street address line 2 must not exceed 200 characters';
      } else if (street2.length > 0) {
        result.sanitized.street2 = street2;
      }
    }
    
    // Validate city
    if (address.city) {
      const city = address.city.trim();
      if (!/^[a-zA-Z\s\-'\.]+$/.test(city) || city.length < 2 || city.length > 100) {
        result.isValid = false;
        result.errors.city = 'Invalid city name';
      } else {
        result.sanitized.city = StringHelper.capitalize(city);
      }
    }
    
    // Validate state/province
    if (address.state) {
      const state = address.state.trim().toUpperCase();
      if (state.length > 50) {
        result.isValid = false;
        result.errors.state = 'State/province too long';
      } else {
        result.sanitized.state = state;
      }
    }
    
    // Validate postal code
    if (address.postalCode) {
      const postalCode = address.postalCode.trim();
      if (postalCode.length < 3 || postalCode.length > 20) {
        result.isValid = false;
        result.errors.postalCode = 'Invalid postal code';
      } else {
        result.sanitized.postalCode = postalCode;
      }
    }
    
    // Validate country
    if (address.country) {
      const country = address.country.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) {
        result.isValid = false;
        result.errors.country = 'Country must be a 2-letter ISO code';
      } else {
        result.sanitized.country = country;
      }
    }
    
    return result;
  }

  /**
   * Validates tax ID based on country
   * @static
   * @param {string} taxId - Tax ID to validate
   * @param {string} country - Country code
   * @returns {Object} Validation result
   */
  static validateTaxId(taxId, country = 'US') {
    const result = { isValid: false, message: '' };
    
    if (!taxId || typeof taxId !== 'string') {
      result.message = 'Tax ID is required';
      return result;
    }
    
    const trimmed = taxId.trim().toUpperCase();
    let pattern;
    
    switch (country) {
      case 'US':
        pattern = this.#TAX_ID_PATTERNS.US_EIN;
        if (!pattern.test(trimmed)) {
          result.message = 'Invalid US EIN format (XX-XXXXXXX)';
          return result;
        }
        break;
        
      case 'UK':
      case 'GB':
        pattern = this.#TAX_ID_PATTERNS.UK_VAT;
        if (!pattern.test(trimmed)) {
          result.message = 'Invalid UK VAT number format';
          return result;
        }
        break;
        
      case 'CA':
        pattern = this.#TAX_ID_PATTERNS.CA_BN;
        if (!pattern.test(trimmed)) {
          result.message = 'Invalid Canadian Business Number format';
          return result;
        }
        break;
        
      case 'AU':
        pattern = this.#TAX_ID_PATTERNS.AU_ABN;
        if (!pattern.test(trimmed)) {
          result.message = 'Invalid Australian ABN format';
          return result;
        }
        break;
        
      case 'IN':
        pattern = this.#TAX_ID_PATTERNS.IN_GST;
        if (!pattern.test(trimmed)) {
          result.message = 'Invalid Indian GST number format';
          return result;
        }
        break;
        
      default:
        // For EU countries, use generic EU VAT pattern
        if (['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'PT', 'GR', 'CZ'].includes(country)) {
          pattern = this.#TAX_ID_PATTERNS.EU_VAT;
          if (!pattern.test(trimmed)) {
            result.message = 'Invalid EU VAT number format';
            return result;
          }
        } else {
          result.message = `Tax ID validation not available for country: ${country}`;
          return result;
        }
    }
    
    result.isValid = true;
    result.sanitized = trimmed;
    result.type = this.#getTaxIdType(country);
    return result;
  }

  /**
   * Validates company size
   * @static
   * @param {string|number} size - Company size or size code
   * @returns {Object} Validation result
   */
  static validateCompanySize(size) {
    const result = { isValid: false, message: '' };
    
    if (!CommonValidator.isDefined(size)) {
      result.message = 'Company size is required';
      return result;
    }
    
    // Handle numeric input
    if (typeof size === 'number' || /^\d+$/.test(size)) {
      const numSize = Number(size);
      
      for (const [key, range] of Object.entries(this.#COMPANY_SIZES)) {
        if (numSize >= range.min && (range.max === null || numSize <= range.max)) {
          result.isValid = true;
          result.sanitized = key;
          result.label = range.label;
          result.employees = numSize;
          return result;
        }
      }
      
      result.message = 'Invalid company size number';
      return result;
    }
    
    // Handle string size codes
    const upperSize = size.toString().toUpperCase();
    if (this.#COMPANY_SIZES[upperSize]) {
      result.isValid = true;
      result.sanitized = upperSize;
      result.label = this.#COMPANY_SIZES[upperSize].label;
      result.range = this.#COMPANY_SIZES[upperSize];
      return result;
    }
    
    result.message = 'Invalid company size code';
    return result;
  }

  /**
   * Validates industry classification
   * @static
   * @param {string} industry - Industry name or code
   * @returns {Object} Validation result
   */
  static validateIndustry(industry) {
    const result = { isValid: false, message: '' };
    
    if (!industry || typeof industry !== 'string') {
      result.message = 'Industry is required';
      return result;
    }
    
    const trimmed = industry.trim().toUpperCase();
    
    // Check if it's a known industry category
    if (this.#INDUSTRY_CODES[trimmed]) {
      result.isValid = true;
      result.sanitized = trimmed;
      result.codes = this.#INDUSTRY_CODES[trimmed];
      return result;
    }
    
    // Check if it's a NAICS code (2-6 digits)
    if (/^\d{2,6}$/.test(trimmed)) {
      // Validate against known industry code prefixes
      const prefix = trimmed.substring(0, 2);
      
      for (const [industry, codes] of Object.entries(this.#INDUSTRY_CODES)) {
        if (codes.includes(prefix)) {
          result.isValid = true;
          result.sanitized = trimmed;
          result.industry = industry;
          return result;
        }
      }
    }
    
    // Allow custom industry names
    if (trimmed.length >= 2 && trimmed.length <= 100) {
      result.isValid = true;
      result.sanitized = StringHelper.capitalize(industry.trim());
      result.custom = true;
      return result;
    }
    
    result.message = 'Invalid industry classification';
    return result;
  }

  /**
   * Validates bank account information
   * @static
   * @param {Object} bankAccount - Bank account details
   * @param {string} country - Country code
   * @returns {Object} Validation result
   */
  static validateBankAccount(bankAccount, country = 'US') {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!bankAccount || typeof bankAccount !== 'object') {
      result.isValid = false;
      result.errors.bankAccount = 'Bank account information is required';
      return result;
    }
    
    // US bank account validation
    if (country === 'US') {
      // Routing number validation
      if (!bankAccount.routingNumber) {
        result.isValid = false;
        result.errors.routingNumber = 'Routing number is required';
      } else if (!/^\d{9}$/.test(bankAccount.routingNumber)) {
        result.isValid = false;
        result.errors.routingNumber = 'Routing number must be 9 digits';
      } else {
        result.sanitized.routingNumber = bankAccount.routingNumber;
      }
      
      // Account number validation
      if (!bankAccount.accountNumber) {
        result.isValid = false;
        result.errors.accountNumber = 'Account number is required';
      } else if (!/^\d{4,17}$/.test(bankAccount.accountNumber)) {
        result.isValid = false;
        result.errors.accountNumber = 'Account number must be 4-17 digits';
      } else {
        result.sanitized.accountNumber = bankAccount.accountNumber;
      }
    }
    
    // IBAN validation for European countries
    if (['GB', 'DE', 'FR', 'IT', 'ES', 'NL'].includes(country)) {
      if (!bankAccount.iban) {
        result.isValid = false;
        result.errors.iban = 'IBAN is required';
      } else if (!this.#validateIBAN(bankAccount.iban, country)) {
        result.isValid = false;
        result.errors.iban = 'Invalid IBAN format';
      } else {
        result.sanitized.iban = bankAccount.iban.toUpperCase().replace(/\s/g, '');
      }
    }
    
    // Account holder name
    if (!bankAccount.accountHolderName) {
      result.isValid = false;
      result.errors.accountHolderName = 'Account holder name is required';
    } else if (bankAccount.accountHolderName.length < 2 || bankAccount.accountHolderName.length > 100) {
      result.isValid = false;
      result.errors.accountHolderName = 'Account holder name must be 2-100 characters';
    } else {
      result.sanitized.accountHolderName = bankAccount.accountHolderName.trim();
    }
    
    // Account type
    if (bankAccount.accountType) {
      const validTypes = ['checking', 'savings', 'business_checking', 'business_savings'];
      if (!validTypes.includes(bankAccount.accountType)) {
        result.isValid = false;
        result.errors.accountType = 'Invalid account type';
      } else {
        result.sanitized.accountType = bankAccount.accountType;
      }
    }
    
    return result;
  }

  /**
   * Validates billing information
   * @static
   * @param {Object} billing - Billing information
   * @returns {Object} Validation result
   */
  static validateBillingInfo(billing) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!billing || typeof billing !== 'object') {
      result.isValid = false;
      result.errors.billing = 'Billing information is required';
      return result;
    }
    
    // Validate billing contact
    if (!billing.contactName) {
      result.isValid = false;
      result.errors.contactName = 'Billing contact name is required';
    } else if (billing.contactName.length < 2 || billing.contactName.length > 100) {
      result.isValid = false;
      result.errors.contactName = 'Contact name must be 2-100 characters';
    } else {
      result.sanitized.contactName = billing.contactName.trim();
    }
    
    // Validate billing email
    if (!billing.email) {
      result.isValid = false;
      result.errors.email = 'Billing email is required';
    } else {
      const emailValidation = AuthValidator.validateEmail(billing.email);
      if (!emailValidation.isValid) {
        result.isValid = false;
        result.errors.email = emailValidation.message;
      } else {
        result.sanitized.email = emailValidation.normalizedEmail;
      }
    }
    
    // Validate billing phone
    if (billing.phone) {
      const phoneValidation = CommonValidator.isValidPhone(billing.phone);
      if (!phoneValidation) {
        result.isValid = false;
        result.errors.phone = 'Invalid billing phone number';
      } else {
        result.sanitized.phone = billing.phone;
      }
    }
    
    // Validate billing address
    if (!billing.address) {
      result.isValid = false;
      result.errors.address = 'Billing address is required';
    } else {
      const addressValidation = this.validateBusinessAddress(billing.address);
      if (!addressValidation.isValid) {
        result.isValid = false;
        result.errors.address = addressValidation.errors;
      } else {
        result.sanitized.address = addressValidation.sanitized;
      }
    }
    
    // Validate payment method
    if (billing.paymentMethod) {
      const validMethods = ['credit_card', 'debit_card', 'bank_transfer', 'ach', 'wire', 'check', 'paypal'];
      if (!validMethods.includes(billing.paymentMethod)) {
        result.isValid = false;
        result.errors.paymentMethod = 'Invalid payment method';
      } else {
        result.sanitized.paymentMethod = billing.paymentMethod;
      }
    }
    
    // Validate currency
    if (billing.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR'];
      if (!validCurrencies.includes(billing.currency.toUpperCase())) {
        result.isValid = false;
        result.errors.currency = 'Unsupported currency';
      } else {
        result.sanitized.currency = billing.currency.toUpperCase();
      }
    }
    
    return result;
  }

  /**
   * Validates subscription plan information
   * @static
   * @param {Object} subscription - Subscription details
   * @returns {Object} Validation result
   */
  static validateSubscriptionPlan(subscription) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!subscription || typeof subscription !== 'object') {
      result.isValid = false;
      result.errors.subscription = 'Subscription information is required';
      return result;
    }
    
    // Validate plan ID
    if (!subscription.planId) {
      result.isValid = false;
      result.errors.planId = 'Plan ID is required';
    } else if (!CommonValidator.isAlphanumeric(subscription.planId, { allowDash: true, allowUnderscore: true })) {
      result.isValid = false;
      result.errors.planId = 'Invalid plan ID format';
    } else {
      result.sanitized.planId = subscription.planId.toLowerCase();
    }
    
    // Validate billing cycle
    if (subscription.billingCycle) {
      const validCycles = ['monthly', 'quarterly', 'semi-annual', 'annual', 'biennial'];
      if (!validCycles.includes(subscription.billingCycle)) {
        result.isValid = false;
        result.errors.billingCycle = 'Invalid billing cycle';
      } else {
        result.sanitized.billingCycle = subscription.billingCycle;
      }
    }
    
    // Validate seat count
    if (subscription.seats !== undefined) {
      if (!CommonValidator.isValidNumber(subscription.seats, { min: 1, max: 10000, integer: true })) {
        result.isValid = false;
        result.errors.seats = 'Seats must be between 1 and 10,000';
      } else {
        result.sanitized.seats = parseInt(subscription.seats);
      }
    }
    
    // Validate trial period
    if (subscription.trialDays !== undefined) {
      if (!CommonValidator.isValidNumber(subscription.trialDays, { min: 0, max: 90, integer: true })) {
        result.isValid = false;
        result.errors.trialDays = 'Trial period must be 0-90 days';
      } else {
        result.sanitized.trialDays = parseInt(subscription.trialDays);
      }
    }
    
    // Validate start date
    if (subscription.startDate) {
      const dateValidation = CommonValidator.isValidDate(subscription.startDate, { allowPast: false });
      if (!dateValidation) {
        result.isValid = false;
        result.errors.startDate = 'Invalid or past start date';
      } else {
        result.sanitized.startDate = new Date(subscription.startDate).toISOString();
      }
    }
    
    return result;
  }

  /**
   * Validates organization settings
   * @static
   * @param {Object} settings - Organization settings
   * @returns {Object} Validation result
   */
  static validateOrganizationSettings(settings) {
    const result = {
      isValid: true,
      errors: {},
      warnings: {},
      sanitized: {}
    };
    
    if (!settings || typeof settings !== 'object') {
      result.isValid = false;
      result.errors.settings = 'Settings object is required';
      return result;
    }
    
    // Validate timezone
    if (settings.timezone) {
      try {
        Intl.DateTimeFormat('en-US', { timeZone: settings.timezone });
        result.sanitized.timezone = settings.timezone;
      } catch {
        result.isValid = false;
        result.errors.timezone = 'Invalid timezone';
      }
    }
    
    // Validate language
    if (settings.language) {
      const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
      if (!validLanguages.includes(settings.language)) {
        result.isValid = false;
        result.errors.language = 'Unsupported language';
      } else {
        result.sanitized.language = settings.language;
      }
    }
    
    // Validate date format
    if (settings.dateFormat) {
      const validFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'];
      if (!validFormats.includes(settings.dateFormat)) {
        result.isValid = false;
        result.errors.dateFormat = 'Invalid date format';
      } else {
        result.sanitized.dateFormat = settings.dateFormat;
      }
    }
    
    // Validate currency format
    if (settings.currencyFormat) {
      const validFormats = ['symbol_before', 'symbol_after', 'code_before', 'code_after'];
      if (!validFormats.includes(settings.currencyFormat)) {
        result.isValid = false;
        result.errors.currencyFormat = 'Invalid currency format';
      } else {
        result.sanitized.currencyFormat = settings.currencyFormat;
      }
    }
    
    // Validate security settings
    if (settings.security) {
      const securityValidation = this.#validateSecuritySettings(settings.security);
      if (!securityValidation.isValid) {
        result.isValid = false;
        result.errors.security = securityValidation.errors;
      } else {
        result.sanitized.security = securityValidation.sanitized;
      }
    }
    
    // Validate notification preferences
    if (settings.notifications) {
      const notificationValidation = this.#validateNotificationSettings(settings.notifications);
      if (!notificationValidation.isValid) {
        result.isValid = false;
        result.errors.notifications = notificationValidation.errors;
      } else {
        result.sanitized.notifications = notificationValidation.sanitized;
      }
    }
    
    return result;
  }

  /**
   * Validates team member invitation
   * @static
   * @param {Object} invitation - Invitation details
   * @returns {Object} Validation result
   */
  static validateTeamInvitation(invitation) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!invitation || typeof invitation !== 'object') {
      result.isValid = false;
      result.errors.invitation = 'Invitation data is required';
      return result;
    }
    
    // Validate email
    if (!invitation.email) {
      result.isValid = false;
      result.errors.email = 'Email is required';
    } else {
      const emailValidation = AuthValidator.validateEmail(invitation.email);
      if (!emailValidation.isValid) {
        result.isValid = false;
        result.errors.email = emailValidation.message;
      } else {
        result.sanitized.email = emailValidation.normalizedEmail;
      }
    }
    
    // Validate role
    if (!invitation.role) {
      result.isValid = false;
      result.errors.role = 'Role is required';
    } else {
      const validRoles = ['admin', 'manager', 'member', 'viewer', 'billing', 'support'];
      if (!validRoles.includes(invitation.role)) {
        result.isValid = false;
        result.errors.role = 'Invalid role';
      } else {
        result.sanitized.role = invitation.role;
      }
    }
    
    // Validate permissions (optional)
    if (invitation.permissions) {
      if (!Array.isArray(invitation.permissions)) {
        result.isValid = false;
        result.errors.permissions = 'Permissions must be an array';
      } else {
        const validPermissions = [
          'users.read', 'users.write', 'users.delete',
          'billing.read', 'billing.write',
          'settings.read', 'settings.write',
          'reports.read', 'reports.export',
          'api.read', 'api.write'
        ];
        
        const invalidPerms = invitation.permissions.filter(p => !validPermissions.includes(p));
        if (invalidPerms.length > 0) {
          result.isValid = false;
          result.errors.permissions = `Invalid permissions: ${invalidPerms.join(', ')}`;
        } else {
          result.sanitized.permissions = invitation.permissions;
        }
      }
    }
    
    // Validate expiry
    if (invitation.expiresAt) {
      const expiryValidation = CommonValidator.isValidDate(invitation.expiresAt, {
        allowPast: false,
        minDate: new Date()
      });
      if (!expiryValidation) {
        result.isValid = false;
        result.errors.expiresAt = 'Expiry date must be in the future';
      } else {
        result.sanitized.expiresAt = new Date(invitation.expiresAt).toISOString();
      }
    }
    
    // Validate custom message
    if (invitation.message) {
      if (invitation.message.length > 500) {
        result.isValid = false;
        result.errors.message = 'Message must not exceed 500 characters';
      } else {
        result.sanitized.message = invitation.message.trim();
      }
    }
    
    return result;
  }

  /**
   * Validates API configuration
   * @static
   * @param {Object} apiConfig - API configuration
   * @returns {Object} Validation result
   */
  static validateAPIConfiguration(apiConfig) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    if (!apiConfig || typeof apiConfig !== 'object') {
      result.isValid = false;
      result.errors.apiConfig = 'API configuration is required';
      return result;
    }
    
    // Validate API version
    if (apiConfig.version) {
      if (!/^v\d+(\.\d+)?$/.test(apiConfig.version)) {
        result.isValid = false;
        result.errors.version = 'Invalid API version format (e.g., v1, v2.0)';
      } else {
        result.sanitized.version = apiConfig.version.toLowerCase();
      }
    }
    
    // Validate rate limits
    if (apiConfig.rateLimit) {
      if (!CommonValidator.isValidNumber(apiConfig.rateLimit, { min: 10, max: 10000, integer: true })) {
        result.isValid = false;
        result.errors.rateLimit = 'Rate limit must be between 10 and 10,000 requests';
      } else {
        result.sanitized.rateLimit = parseInt(apiConfig.rateLimit);
      }
    }
    
    // Validate allowed IPs
    if (apiConfig.allowedIPs) {
      if (!Array.isArray(apiConfig.allowedIPs)) {
        result.isValid = false;
        result.errors.allowedIPs = 'Allowed IPs must be an array';
      } else {
        const invalidIPs = apiConfig.allowedIPs.filter(ip => !CommonValidator.isValidIP(ip));
        if (invalidIPs.length > 0) {
          result.isValid = false;
          result.errors.allowedIPs = `Invalid IP addresses: ${invalidIPs.join(', ')}`;
        } else {
          result.sanitized.allowedIPs = apiConfig.allowedIPs;
        }
      }
    }
    
    // Validate webhook URL
    if (apiConfig.webhookUrl) {
      if (!CommonValidator.isValidURL(apiConfig.webhookUrl, { protocols: ['https'] })) {
        result.isValid = false;
        result.errors.webhookUrl = 'Webhook URL must be a valid HTTPS URL';
      } else {
        result.sanitized.webhookUrl = apiConfig.webhookUrl;
      }
    }
    
    // Validate API scopes
    if (apiConfig.scopes) {
      if (!Array.isArray(apiConfig.scopes)) {
        result.isValid = false;
        result.errors.scopes = 'API scopes must be an array';
      } else {
        const validScopes = [
          'read:users', 'write:users',
          'read:organizations', 'write:organizations',
          'read:billing', 'write:billing',
          'read:reports', 'export:reports',
          'admin:all'
        ];
        
        const invalidScopes = apiConfig.scopes.filter(s => !validScopes.includes(s));
        if (invalidScopes.length > 0) {
          result.isValid = false;
          result.errors.scopes = `Invalid scopes: ${invalidScopes.join(', ')}`;
        } else {
          result.sanitized.scopes = apiConfig.scopes;
        }
      }
    }
    
    return result;
  }

  /**
   * Gets tax ID type based on country
   * @private
   * @static
   * @param {string} country - Country code
   * @returns {string} Tax ID type name
   */
  static #getTaxIdType(country) {
    const types = {
      US: 'EIN',
      UK: 'VAT',
      GB: 'VAT',
      CA: 'Business Number',
      AU: 'ABN',
      IN: 'GST',
      DE: 'VAT',
      FR: 'VAT',
      IT: 'VAT',
      ES: 'VAT'
    };
    
    return types[country] || 'Tax ID';
  }

  /**
   * Validates IBAN format
   * @private
   * @static
   * @param {string} iban - IBAN to validate
   * @param {string} country - Country code
   * @returns {boolean} True if valid IBAN
   */
  static #validateIBAN(iban, country) {
    const ibanLengths = {
      GB: 22, DE: 22, FR: 27, IT: 27, ES: 24, NL: 18
    };
    
    const cleaned = iban.replace(/\s/g, '').toUpperCase();
    
    if (!cleaned.startsWith(country)) return false;
    
    const expectedLength = ibanLengths[country];
    if (expectedLength && cleaned.length !== expectedLength) return false;
    
    // Basic IBAN format check
    return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned);
  }

  /**
   * Validates security settings
   * @private
   * @static
   * @param {Object} security - Security settings
   * @returns {Object} Validation result
   */
  static #validateSecuritySettings(security) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    // Validate password policy
    if (security.passwordPolicy) {
      const policy = security.passwordPolicy;
      
      if (policy.minLength !== undefined) {
        if (!CommonValidator.isValidNumber(policy.minLength, { min: 8, max: 128, integer: true })) {
          result.isValid = false;
          result.errors.minLength = 'Password minimum length must be 8-128';
        } else {
          result.sanitized.minLength = parseInt(policy.minLength);
        }
      }
      
      if (policy.requireUppercase !== undefined) {
        result.sanitized.requireUppercase = Boolean(policy.requireUppercase);
      }
      
      if (policy.requireNumbers !== undefined) {
        result.sanitized.requireNumbers = Boolean(policy.requireNumbers);
      }
      
      if (policy.requireSpecialChars !== undefined) {
        result.sanitized.requireSpecialChars = Boolean(policy.requireSpecialChars);
      }
      
      if (policy.expiryDays !== undefined) {
        if (!CommonValidator.isValidNumber(policy.expiryDays, { min: 0, max: 365, integer: true })) {
          result.isValid = false;
          result.errors.expiryDays = 'Password expiry must be 0-365 days';
        } else {
          result.sanitized.expiryDays = parseInt(policy.expiryDays);
        }
      }
    }
    
    // Validate session settings
    if (security.sessionTimeout !== undefined) {
      if (!CommonValidator.isValidNumber(security.sessionTimeout, { min: 5, max: 1440, integer: true })) {
        result.isValid = false;
        result.errors.sessionTimeout = 'Session timeout must be 5-1440 minutes';
      } else {
        result.sanitized.sessionTimeout = parseInt(security.sessionTimeout);
      }
    }
    
    // Validate 2FA settings
    if (security.twoFactorAuth !== undefined) {
      result.sanitized.twoFactorAuth = Boolean(security.twoFactorAuth);
    }
    
    if (security.enforced2FA !== undefined) {
      result.sanitized.enforced2FA = Boolean(security.enforced2FA);
    }
    
    // Validate IP whitelist
    if (security.ipWhitelist !== undefined) {
      result.sanitized.ipWhitelist = Boolean(security.ipWhitelist);
    }
    
    return result;
  }

  /**
   * Validates notification settings
   * @private
   * @static
   * @param {Object} notifications - Notification settings
   * @returns {Object} Validation result
   */
  static #validateNotificationSettings(notifications) {
    const result = {
      isValid: true,
      errors: {},
      sanitized: {}
    };
    
    const validChannels = ['email', 'sms', 'push', 'webhook'];
    const validEvents = [
      'user.created', 'user.updated', 'user.deleted',
      'team.member.added', 'team.member.removed',
      'billing.payment.success', 'billing.payment.failed',
      'subscription.renewed', 'subscription.cancelled',
      'security.login.suspicious', 'security.password.changed'
    ];
    
    for (const [channel, settings] of Object.entries(notifications)) {
      if (!validChannels.includes(channel)) {
        result.isValid = false;
        result.errors[channel] = 'Invalid notification channel';
        continue;
      }
      
      if (typeof settings !== 'object') {
        result.isValid = false;
        result.errors[channel] = 'Channel settings must be an object';
        continue;
      }
      
      result.sanitized[channel] = {};
      
      // Validate enabled flag
      if (settings.enabled !== undefined) {
        result.sanitized[channel].enabled = Boolean(settings.enabled);
      }
      
      // Validate events
      if (settings.events) {
        if (!Array.isArray(settings.events)) {
          result.isValid = false;
          result.errors[`${channel}.events`] = 'Events must be an array';
        } else {
          const invalidEvents = settings.events.filter(e => !validEvents.includes(e));
          if (invalidEvents.length > 0) {
            result.isValid = false;
            result.errors[`${channel}.events`] = `Invalid events: ${invalidEvents.join(', ')}`;
          } else {
            result.sanitized[channel].events = settings.events;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Creates organization validation chain
   * @static
   * @param {Object} orgData - Organization data to validate
   * @returns {Object} Validation chain
   */
  static createValidator(orgData) {
    return {
      validate: () => this.validateOrganization(orgData),
      validateField: (field, value) => {
        const validators = {
          name: () => this.validateOrganizationName(value),
          slug: () => this.validateOrganizationSlug(value),
          domain: () => this.validateDomain(value),
          subdomain: () => this.validateSubdomain(value),
          taxId: (country) => this.validateTaxId(value, country),
          industry: () => this.validateIndustry(value),
          companySize: () => this.validateCompanySize(value)
        };
        
        const validator = validators[field];
        return validator ? validator() : { isValid: false, message: 'Unknown field' };
      }
    };
  }
}

module.exports = OrganizationValidator;