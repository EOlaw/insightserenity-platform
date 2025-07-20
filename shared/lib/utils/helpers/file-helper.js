'use strict';

/**
 * @fileoverview File system and file manipulation utilities
 * @module shared/lib/utils/helpers/file-helper
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

/**
 * @class FileHelper
 * @description Comprehensive file manipulation utilities for the platform
 */
class FileHelper {
  /**
   * Common file extensions by category
   * @static
   * @private
   */
  static #FILE_CATEGORIES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'],
    video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'],
    audio: ['mp3', 'wav', 'ogg', 'aac', 'wma', 'flac', 'm4a'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'],
    text: ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift']
  };

  /**
   * Check if file exists
   * @static
   * @async
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if file exists
   */
  static async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   * @static
   * @async
   * @param {string} filePath - File path
   * @returns {Promise<Object|null>} File stats or null
   */
  static async getStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      };
    } catch {
      return null;
    }
  }

  /**
   * Read file content
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {string} [encoding='utf8'] - File encoding
   * @returns {Promise<string|Buffer>} File content
   */
  static async read(filePath, encoding = 'utf8') {
    return fs.readFile(filePath, encoding);
  }

  /**
   * Write file content
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to write
   * @param {Object} [options={}] - Write options
   * @returns {Promise<void>}
   */
  static async write(filePath, data, options = {}) {
    const dir = path.dirname(filePath);
    await this.ensureDirectory(dir);
    return fs.writeFile(filePath, data, options);
  }

  /**
   * Append to file
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to append
   * @param {Object} [options={}] - Append options
   * @returns {Promise<void>}
   */
  static async append(filePath, data, options = {}) {
    return fs.appendFile(filePath, data, options);
  }

  /**
   * Delete file
   * @static
   * @async
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy file
   * @static
   * @async
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @returns {Promise<void>}
   */
  static async copy(source, destination) {
    const destDir = path.dirname(destination);
    await this.ensureDirectory(destDir);
    return fs.copyFile(source, destination);
  }

  /**
   * Move file
   * @static
   * @async
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @returns {Promise<void>}
   */
  static async move(source, destination) {
    const destDir = path.dirname(destination);
    await this.ensureDirectory(destDir);
    return fs.rename(source, destination);
  }

  /**
   * Ensure directory exists
   * @static
   * @async
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  /**
   * List directory contents
   * @static
   * @async
   * @param {string} dirPath - Directory path
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.recursive=false] - List recursively
   * @param {boolean} [options.filesOnly=false] - List only files
   * @param {boolean} [options.dirsOnly=false] - List only directories
   * @returns {Promise<string[]>} List of paths
   */
  static async listDirectory(dirPath, options = {}) {
    const { recursive = false, filesOnly = false, dirsOnly = false } = options;
    const results = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!filesOnly) results.push(fullPath);
          if (recursive) await walk(fullPath);
        } else if (entry.isFile() && !dirsOnly) {
          results.push(fullPath);
        }
      }
    }

    await walk(dirPath);
    return results;
  }

  /**
   * Get file extension
   * @static
   * @param {string} filePath - File path
   * @returns {string} File extension (without dot)
   */
  static getExtension(filePath) {
    const ext = path.extname(filePath);
    return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
  }

  /**
   * Get file name without extension
   * @static
   * @param {string} filePath - File path
   * @returns {string} File name without extension
   */
  static getBasename(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * Get MIME type
   * @static
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  static getMimeType(filePath) {
    return mime.lookup(filePath) || 'application/octet-stream';
  }

  /**
   * Get file category
   * @static
   * @param {string} filePath - File path
   * @returns {string} File category
   */
  static getCategory(filePath) {
    const ext = this.getExtension(filePath);
    
    for (const [category, extensions] of Object.entries(this.#FILE_CATEGORIES)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    
    return 'other';
  }

  /**
   * Sanitize filename
   * @static
   * @param {string} filename - Original filename
   * @param {Object} [options={}] - Options
   * @param {number} [options.maxLength=255] - Maximum length
   * @param {string} [options.replacement='-'] - Replacement for invalid chars
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename, options = {}) {
    const { maxLength = 255, replacement = '-' } = options;
    
    // Get extension
    const ext = path.extname(filename);
    let base = path.basename(filename, ext);
    
    // Replace invalid characters
    base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement);
    
    // Replace spaces and dots
    base = base.replace(/[\s.]+/g, replacement);
    
    // Remove duplicate replacements
    base = base.replace(new RegExp(`${replacement}+`, 'g'), replacement);
    
    // Trim replacement chars from start/end
    base = base.replace(new RegExp(`^${replacement}+|${replacement}+$`, 'g'), '');
    
    // Ensure filename doesn't exceed max length
    const maxBaseLength = maxLength - ext.length;
    if (base.length > maxBaseLength) {
      base = base.substring(0, maxBaseLength);
    }
    
    return base + ext;
  }

  /**
   * Generate unique filename
   * @static
   * @param {string} originalName - Original filename
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.timestamp=true] - Include timestamp
   * @param {boolean} [options.random=true] - Include random string
   * @returns {string} Unique filename
   */
  static generateUniqueFilename(originalName, options = {}) {
    const { timestamp = true, random = true } = options;
    
    const ext = path.extname(originalName);
    let base = path.basename(originalName, ext);
    
    // Sanitize base name
    base = this.sanitizeFilename(base, { replacement: '-' });
    
    const parts = [base];
    
    if (timestamp) {
      parts.push(Date.now().toString());
    }
    
    if (random) {
      parts.push(crypto.randomBytes(4).toString('hex'));
    }
    
    return parts.join('-') + ext;
  }

  /**
   * Calculate file hash
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {string} [algorithm='sha256'] - Hash algorithm
   * @returns {Promise<string>} File hash
   */
  static async calculateHash(filePath, algorithm = 'sha256') {
    const hash = crypto.createHash(algorithm);
    const stream = require('fs').createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Format file size
   * @static
   * @param {number} bytes - Size in bytes
   * @param {number} [decimals=2] - Number of decimal places
   * @returns {string} Formatted size
   */
  static formatSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Check if file size is within limit
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {number} maxSize - Maximum size in bytes
   * @returns {Promise<boolean>} True if within limit
   */
  static async isWithinSizeLimit(filePath, maxSize) {
    const stats = await this.getStats(filePath);
    return stats && stats.size <= maxSize;
  }

  /**
   * Validate file type
   * @static
   * @param {string} filePath - File path
   * @param {string[]} allowedTypes - Allowed extensions or MIME types
   * @returns {boolean} True if valid type
   */
  static isValidType(filePath, allowedTypes) {
    const ext = this.getExtension(filePath);
    const mimeType = this.getMimeType(filePath);
    
    return allowedTypes.some(type => {
      return type === ext || type === mimeType || type === `.${ext}`;
    });
  }

  /**
   * Create temporary file
   * @static
   * @async
   * @param {string|Buffer} content - File content
   * @param {Object} [options={}] - Options
   * @param {string} [options.prefix='tmp-'] - Filename prefix
   * @param {string} [options.suffix=''] - Filename suffix
   * @param {string} [options.dir=os.tmpdir()] - Temporary directory
   * @returns {Promise<string>} Temporary file path
   */
  static async createTempFile(content, options = {}) {
    const os = require('os');
    const {
      prefix = 'tmp-',
      suffix = '',
      dir = os.tmpdir()
    } = options;
    
    const filename = `${prefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}${suffix}`;
    const filepath = path.join(dir, filename);
    
    await this.write(filepath, content);
    return filepath;
  }

  /**
   * Read JSON file
   * @static
   * @async
   * @param {string} filePath - File path
   * @returns {Promise<*>} Parsed JSON data
   */
  static async readJSON(filePath) {
    const content = await this.read(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Write JSON file
   * @static
   * @async
   * @param {string} filePath - File path
   * @param {*} data - Data to write
   * @param {number} [spaces=2] - Indentation spaces
   * @returns {Promise<void>}
   */
  static async writeJSON(filePath, data, spaces = 2) {
    const content = JSON.stringify(data, null, spaces);
    return this.write(filePath, content, 'utf8');
  }

  /**
   * Stream file upload handler
   * @static
   * @param {ReadableStream} readStream - Input stream
   * @param {string} destination - Destination path
   * @param {Object} [options={}] - Options
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Object>} Upload result
   */
  static async streamUpload(readStream, destination, options = {}) {
    const { onProgress } = options;
    const writeStream = require('fs').createWriteStream(destination);
    
    let bytesWritten = 0;
    
    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        bytesWritten += chunk.length;
        if (onProgress) onProgress(bytesWritten);
      });
      
      readStream.on('error', reject);
      writeStream.on('error', reject);
      
      writeStream.on('finish', async () => {
        const stats = await this.getStats(destination);
        resolve({
          path: destination,
          size: stats.size,
          bytesWritten
        });
      });
      
      readStream.pipe(writeStream);
    });
  }
}

module.exports = FileHelper;