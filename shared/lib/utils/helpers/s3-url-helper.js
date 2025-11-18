'use strict';

/**
 * @fileoverview S3 URL Helper for converting and generating proper AWS S3 URLs
 * @module shared/lib/utils/helpers/s3-url-helper
 * @description Handles conversion between path-style and virtual-hosted-style S3 URLs
 * Ensures compatibility with AWS S3's current requirements
 */

const logger = require('../../utils/logger').createLogger({
    serviceName: 's3-url-helper'
});

/**
 * Default AWS region - can be overridden via environment variable
 */
const DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || 'ap-southeast-1';

/**
 * Check if URL is in path-style format
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isPathStyle(url) {
    if (!url) return false;
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Path-style formats:
        // s3.amazonaws.com/bucket/key
        // s3.region.amazonaws.com/bucket/key
        return (
            hostname === 's3.amazonaws.com' ||
            /^s3\.[a-z0-9-]+\.amazonaws\.com$/.test(hostname)
        );
    } catch (error) {
        return false;
    }
}

/**
 * Check if URL is in virtual-hosted-style format
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isVirtualHostedStyle(url) {
    if (!url) return false;
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Virtual-hosted-style formats:
        // bucket-name.s3.amazonaws.com/key
        // bucket-name.s3.region.amazonaws.com/key
        return /^[a-z0-9.-]+\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/.test(hostname);
    } catch (error) {
        return false;
    }
}

/**
 * Extract bucket name from S3 URL (works with both formats)
 * @param {string} url - S3 URL
 * @returns {string|null} - Bucket name or null if not found
 */
function extractBucketName(url) {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        // Virtual-hosted-style: bucket-name.s3.region.amazonaws.com
        if (isVirtualHostedStyle(url)) {
            return hostname.split('.')[0];
        }

        // Path-style: s3.amazonaws.com/bucket-name/...
        if (isPathStyle(url)) {
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            return pathParts[0] || null;
        }

        return null;
    } catch (error) {
        logger.error('Error extracting bucket name', { url, error: error.message });
        return null;
    }
}

/**
 * Extract region from S3 URL
 * @param {string} url - S3 URL
 * @returns {string} - Region code or default region
 */
function extractRegion(url) {
    if (!url) return DEFAULT_REGION;

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const parts = hostname.split('.');

        // Look for region in hostname
        // Virtual-hosted: bucket.s3.region.amazonaws.com
        // Path-style: s3.region.amazonaws.com
        if (parts.length >= 4) {
            const possibleRegion = parts[parts.length - 3]; // Get third from last part
            if (possibleRegion !== 's3' && possibleRegion !== 'amazonaws') {
                return possibleRegion;
            }
        }

        return DEFAULT_REGION;
    } catch (error) {
        return DEFAULT_REGION;
    }
}

/**
 * Extract object key from S3 URL
 * @param {string} url - S3 URL
 * @returns {string|null} - Object key or null if not found
 */
function extractKey(url) {
    if (!url) return null;

    try {
        const urlObj = new URL(url);
        
        if (isVirtualHostedStyle(url)) {
            // Virtual-hosted-style: pathname is the key
            return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
        }

        if (isPathStyle(url)) {
            // Path-style: skip first part (bucket name)
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            return pathParts.slice(1).join('/');
        }

        return null;
    } catch (error) {
        logger.error('Error extracting key', { url, error: error.message });
        return null;
    }
}

/**
 * Convert path-style S3 URL to virtual-hosted-style URL
 * @param {string} url - The S3 URL to convert
 * @param {string} [region] - AWS region (optional, will be inferred or use default)
 * @returns {string} - Converted URL in virtual-hosted-style format
 * 
 * @example
 * // Path-style input
 * https://s3.amazonaws.com/bucket-name/path/to/file.pdf
 * 
 * // Virtual-hosted-style output
 * https://bucket-name.s3.us-east-1.amazonaws.com/path/to/file.pdf
 */
function convertToVirtualHostedStyle(url, region = null) {
    if (!url || typeof url !== 'string') {
        logger.warn('Invalid URL provided for conversion', { url });
        return url;
    }

    // If URL is already in virtual-hosted-style, return as is
    if (isVirtualHostedStyle(url)) {
        return url;
    }

    try {
        // Parse the URL
        const urlObj = new URL(url);
        
        // Check if this is a path-style S3 URL
        if (!isPathStyle(url)) {
            logger.warn('URL does not appear to be a path-style S3 URL', { url });
            return url;
        }

        // Extract bucket name and path from path-style URL
        // Format: https://s3.amazonaws.com/bucket-name/path/to/file
        // or: https://s3.region.amazonaws.com/bucket-name/path/to/file
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
        
        if (pathParts.length === 0) {
            logger.warn('Unable to extract bucket name from URL', { url });
            return url;
        }

        const bucketName = pathParts[0];
        const objectPath = pathParts.slice(1).join('/');

        // Determine region
        let targetRegion = region;
        
        if (!targetRegion) {
            // Try to extract region from hostname
            const hostnameParts = urlObj.hostname.split('.');
            if (hostnameParts.length >= 4 && hostnameParts[0] === 's3') {
                // Format: s3.region.amazonaws.com
                targetRegion = hostnameParts[1];
            } else {
                // Use default region
                targetRegion = DEFAULT_REGION;
            }
        }

        // Construct virtual-hosted-style URL
        // Format: https://bucket-name.s3.region.amazonaws.com/path/to/file
        const virtualHostedUrl = `https://${bucketName}.s3.${targetRegion}.amazonaws.com/${objectPath}`;

        logger.info('Converted path-style to virtual-hosted-style', {
            original: url,
            converted: virtualHostedUrl,
            bucket: bucketName,
            region: targetRegion
        });

        return virtualHostedUrl;
    } catch (error) {
        logger.error('Error converting URL', {
            url,
            error: error.message,
            stack: error.stack
        });
        return url; // Return original URL on error
    }
}

/**
 * Convert virtual-hosted-style S3 URL to path-style URL
 * @param {string} url - The S3 URL to convert
 * @returns {string} - Converted URL in path-style format
 */
function convertToPathStyle(url) {
    if (!url || typeof url !== 'string') {
        logger.warn('Invalid URL provided for conversion', { url });
        return url;
    }

    // If URL is already in path-style, return as is
    if (isPathStyle(url)) {
        return url;
    }

    try {
        const urlObj = new URL(url);
        
        if (!isVirtualHostedStyle(url)) {
            logger.warn('URL does not appear to be a virtual-hosted-style S3 URL', { url });
            return url;
        }

        const bucket = extractBucketName(url);
        const region = extractRegion(url);
        const key = extractKey(url);

        if (!bucket || !key) {
            logger.warn('Unable to extract bucket or key from URL', { url });
            return url;
        }

        // Construct path-style URL
        const pathStyleUrl = `https://s3.${region}.amazonaws.com/${bucket}/${key}`;

        logger.info('Converted virtual-hosted-style to path-style', {
            original: url,
            converted: pathStyleUrl,
            bucket: bucket,
            region: region
        });

        return pathStyleUrl;
    } catch (error) {
        logger.error('Error converting URL to path-style', {
            url,
            error: error.message,
            stack: error.stack
        });
        return url;
    }
}

/**
 * Generate a new S3 URL in virtual-hosted-style format
 * @param {Object} params - URL generation parameters
 * @param {string} params.bucket - Bucket name
 * @param {string} params.key - Object key/path
 * @param {string} [params.region] - AWS region
 * @returns {string} - Properly formatted S3 URL
 */
function generateUrl({ bucket, key, region = null }) {
    if (!bucket || !key) {
        throw new Error('bucket and key are required to generate URL');
    }

    const targetRegion = region || DEFAULT_REGION;
    
    // Remove leading slash from key if present
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;

    // Generate virtual-hosted-style URL
    return `https://${bucket}.s3.${targetRegion}.amazonaws.com/${cleanKey}`;
}

/**
 * Validate S3 URL format
 * @param {string} url - URL to validate
 * @returns {Object} - Validation result with details
 */
function validateUrl(url) {
    const result = {
        valid: false,
        format: null,
        needsConversion: false,
        bucket: null,
        region: null,
        issues: []
    };

    if (!url || typeof url !== 'string') {
        result.issues.push('URL is required and must be a string');
        return result;
    }

    try {
        new URL(url); // Validate URL format
        
        if (isVirtualHostedStyle(url)) {
            result.valid = true;
            result.format = 'virtual-hosted-style';
            result.needsConversion = false;
            result.bucket = extractBucketName(url);
            result.region = extractRegion(url);
        } else if (isPathStyle(url)) {
            result.valid = true;
            result.format = 'path-style';
            result.needsConversion = true;
            result.bucket = extractBucketName(url);
            result.region = extractRegion(url);
            result.issues.push('URL is in deprecated path-style format and should be converted');
        } else {
            result.issues.push('URL does not appear to be a valid S3 URL');
        }
    } catch (error) {
        result.issues.push(`Invalid URL format: ${error.message}`);
    }

    return result;
}

/**
 * Ensure URL is in correct virtual-hosted-style format
 * Convenience function that validates and converts if needed
 * @param {string} url - S3 URL to check and convert
 * @param {string} [defaultRegion='us-east-1'] - Default region if not detectable
 * @returns {string} - URL in virtual-hosted-style format
 */
function ensureCorrectUrlFormat(url, defaultRegion = DEFAULT_REGION) {
    if (!url) {
        return url;
    }

    const validation = validateUrl(url);
    
    if (!validation.valid) {
        logger.warn('Invalid S3 URL format detected', {
            url: url,
            issues: validation.issues
        });
        return url;
    }

    if (validation.needsConversion) {
        const region = extractRegion(url) || defaultRegion;
        const convertedUrl = convertToVirtualHostedStyle(url, region);
        
        logger.info('URL automatically converted to virtual-hosted-style', {
            original: url,
            converted: convertedUrl,
            originalFormat: validation.format,
            region: region
        });
        
        return convertedUrl;
    }

    return url;
}

/**
 * Batch convert multiple URLs
 * @param {Array<string>} urls - Array of URLs to convert
 * @param {string} [region] - Target region for conversion
 * @returns {Array<Object>} - Array of conversion results
 */
function batchConvert(urls, region = null) {
    if (!Array.isArray(urls)) {
        logger.error('batchConvert requires an array of URLs');
        return [];
    }

    return urls.map(url => {
        const validation = validateUrl(url);
        
        return {
            original: url,
            converted: validation.needsConversion 
                ? convertToVirtualHostedStyle(url, region)
                : url,
            needsConversion: validation.needsConversion,
            bucket: validation.bucket,
            region: validation.region || region || DEFAULT_REGION
        };
    });
}

module.exports = {
    generateUrl,
    validateUrl,
    convertToVirtualHostedStyle,
    convertToPathStyle,
    extractBucketName,
    extractRegion,
    extractKey,
    ensureCorrectUrlFormat,
    batchConvert,
    isPathStyle,
    isVirtualHostedStyle,
    DEFAULT_REGION
};