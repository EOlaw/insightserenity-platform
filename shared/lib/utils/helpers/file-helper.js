'use strict';

/**
 * @fileoverview File operations helper utility
 * @module shared/lib/utils/helpers/file-helper
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream').promises;
const zlib = require('zlib');
const { promisify } = require('util');

/**
 * @class FileHelper
 * @description Comprehensive file operations utility
 */
class FileHelper {
  /**
   * Read file contents
   * @static
   * @param {string} filePath - File path
   * @param {Object} options - Read options
   * @returns {Promise<string|Buffer>} File contents
   */
  static async readFile(filePath, options = {}) {
    const {
      encoding = 'utf8',
      flag = 'r',
      maxSize = 100 * 1024 * 1024 // 100MB default
    } = options;

    try {
      // Check file size first
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        throw new Error(`File size ${stats.size} exceeds maximum allowed size ${maxSize}`);
      }

      return await fs.readFile(filePath, { encoding, flag });
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Write file contents
   * @static
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to write
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  static async writeFile(filePath, data, options = {}) {
    const {
      encoding = 'utf8',
      mode = 0o666,
      flag = 'w',
      createDir = true,
      backup = false
    } = options;

    try {
      // Create directory if needed
      if (createDir) {
        const dir = path.dirname(filePath);
        await this.ensureDir(dir);
      }

      // Create backup if requested
      if (backup && await this.exists(filePath)) {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await fs.copyFile(filePath, backupPath);
      }

      await fs.writeFile(filePath, data, { encoding, mode, flag });
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Append to file
   * @static
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to append
   * @param {Object} options - Append options
   * @returns {Promise<void>}
   */
  static async appendFile(filePath, data, options = {}) {
    const {
      encoding = 'utf8',
      mode = 0o666,
      flag = 'a'
    } = options;

    try {
      await fs.appendFile(filePath, data, { encoding, mode, flag });
    } catch (error) {
      throw new Error(`Failed to append to file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Delete file
   * @static
   * @param {string} filePath - File path
   * @param {Object} options - Delete options
   * @returns {Promise<boolean>} Success status
   */
  static async deleteFile(filePath, options = {}) {
    const { force = false, secure = false } = options;

    try {
      if (!await this.exists(filePath)) {
        return false;
      }

      if (secure) {
        // Overwrite with random data before deletion
        await this.secureDelete(filePath);
      } else {
        await fs.unlink(filePath);
      }

      return true;
    } catch (error) {
      if (!force) {
        throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Copy file
   * @static
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Copy options
   * @returns {Promise<void>}
   */
  static async copyFile(source, destination, options = {}) {
    const {
      overwrite = true,
      preserveTimestamps = true,
      createDir = true
    } = options;

    try {
      // Check if source exists
      if (!await this.exists(source)) {
        throw new Error(`Source file not found: ${source}`);
      }

      // Check if destination exists
      if (!overwrite && await this.exists(destination)) {
        throw new Error(`Destination file already exists: ${destination}`);
      }

      // Create destination directory if needed
      if (createDir) {
        const dir = path.dirname(destination);
        await this.ensureDir(dir);
      }

      // Copy file
      await fs.copyFile(source, destination);

      // Preserve timestamps if requested
      if (preserveTimestamps) {
        const stats = await fs.stat(source);
        await fs.utimes(destination, stats.atime, stats.mtime);
      }
    } catch (error) {
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Move file
   * @static
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Move options
   * @returns {Promise<void>}
   */
  static async moveFile(source, destination, options = {}) {
    const { overwrite = true, createDir = true } = options;

    try {
      // Create destination directory if needed
      if (createDir) {
        const dir = path.dirname(destination);
        await this.ensureDir(dir);
      }

      // Try rename first (fastest if on same filesystem)
      try {
        await fs.rename(source, destination);
      } catch (error) {
        // If rename fails, copy and delete
        await this.copyFile(source, destination, { overwrite, createDir: false });
        await this.deleteFile(source);
      }
    } catch (error) {
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   * @static
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} Exists status
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
   * @param {string} filePath - File path
   * @param {Object} options - Stats options
   * @returns {Promise<Object>} File statistics
   */
  static async getStats(filePath, options = {}) {
    const { followSymlinks = true } = options;

    try {
      const stats = followSymlinks
        ? await fs.stat(filePath)
        : await fs.lstat(filePath);

      return {
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        permissions: stats.mode,
        owner: stats.uid,
        group: stats.gid
      };
    } catch (error) {
      throw new Error(`Failed to get file stats: ${error.message}`);
    }
  }

  /**
   * List directory contents
   * @static
   * @param {string} dirPath - Directory path
   * @param {Object} options - List options
   * @returns {Promise<Array>} Directory contents
   */
  static async listDirectory(dirPath, options = {}) {
    const {
      recursive = false,
      includeHidden = false,
      includeStats = false,
      filter = null,
      sort = 'name'
    } = options;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let results = [];

      for (const entry of entries) {
        // Skip hidden files if requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        // Apply filter if provided
        if (filter && !filter(entry.name, entry)) {
          continue;
        }

        const item = {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file'
        };

        // Include stats if requested
        if (includeStats) {
          item.stats = await this.getStats(fullPath);
        }

        results.push(item);

        // Recurse into directories if requested
        if (recursive && entry.isDirectory()) {
          const subItems = await this.listDirectory(fullPath, options);
          results = results.concat(subItems);
        }
      }

      // Sort results
      return this.sortFiles(results, sort);
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  /**
   * Create directory
   * @static
   * @param {string} dirPath - Directory path
   * @param {Object} options - Create options
   * @returns {Promise<void>}
   */
  static async createDirectory(dirPath, options = {}) {
    const {
      recursive = true,
      mode = 0o755
    } = options;

    try {
      await fs.mkdir(dirPath, { recursive, mode });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create directory: ${error.message}`);
      }
    }
  }

  /**
   * Ensure directory exists
   * @static
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath) {
    await this.createDirectory(dirPath, { recursive: true });
  }

  /**
   * Delete directory
   * @static
   * @param {string} dirPath - Directory path
   * @param {Object} options - Delete options
   * @returns {Promise<void>}
   */
  static async deleteDirectory(dirPath, options = {}) {
    const { recursive = true, force = false } = options;

    try {
      await fs.rmdir(dirPath, { recursive });
    } catch (error) {
      if (!force) {
        throw new Error(`Failed to delete directory: ${error.message}`);
      }
    }
  }

  /**
   * Empty directory
   * @static
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async emptyDirectory(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.deleteDirectory(fullPath, { recursive: true });
        } else {
          await this.deleteFile(fullPath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to empty directory: ${error.message}`);
    }
  }

  /**
   * Calculate file hash
   * @static
   * @param {string} filePath - File path
   * @param {string} algorithm - Hash algorithm
   * @returns {Promise<string>} File hash
   */
  static async getFileHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fsSync.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Compare files
   * @static
   * @param {string} file1 - First file path
   * @param {string} file2 - Second file path
   * @param {Object} options - Compare options
   * @returns {Promise<boolean>} Are files identical
   */
  static async compareFiles(file1, file2, options = {}) {
    const { compareContent = true, compareSize = true } = options;

    try {
      if (compareSize) {
        const stats1 = await fs.stat(file1);
        const stats2 = await fs.stat(file2);

        if (stats1.size !== stats2.size) {
          return false;
        }
      }

      if (compareContent) {
        const hash1 = await this.getFileHash(file1);
        const hash2 = await this.getFileHash(file2);
        return hash1 === hash2;
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to compare files: ${error.message}`);
    }
  }

  /**
   * Find files
   * @static
   * @param {string} dirPath - Directory to search
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Found files
   */
  static async findFiles(dirPath, options = {}) {
    const {
      pattern = '*',
      recursive = true,
      type = 'all', // 'file', 'directory', 'all'
      maxDepth = Infinity,
      currentDepth = 0
    } = options;

    const results = [];

    if (currentDepth > maxDepth) {
      return results;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const isDirectory = entry.isDirectory();

        // Check type filter
        if (type === 'file' && isDirectory) continue;
        if (type === 'directory' && !isDirectory) continue;

        // Check pattern match
        if (this.matchPattern(entry.name, pattern)) {
          results.push(fullPath);
        }

        // Recurse into directories
        if (recursive && isDirectory) {
          const subResults = await this.findFiles(fullPath, {
            ...options,
            currentDepth: currentDepth + 1
          });
          results.push(...subResults);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to find files: ${error.message}`);
    }
  }

  /**
   * Watch file or directory for changes
   * @static
   * @param {string} targetPath - Path to watch
   * @param {Function} callback - Change callback
   * @param {Object} options - Watch options
   * @returns {Object} Watcher instance
   */
  static watch(targetPath, callback, options = {}) {
    const {
      recursive = false,
      persistent = true,
      encoding = 'utf8',
      debounce = 100
    } = options;

    let timeoutId;
    const debouncedCallback = (eventType, filename) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback(eventType, filename);
      }, debounce);
    };

    const watcher = fsSync.watch(targetPath, {
      recursive,
      persistent,
      encoding
    }, debouncedCallback);

    return {
      close: () => watcher.close(),
      watcher
    };
  }

  /**
   * Get MIME type
   * @static
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  static getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      // Text
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.csv': 'text/csv',

      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',

      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

      // Archives
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.7z': 'application/x-7z-compressed',

      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',

      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.webm': 'video/webm',

      // Fonts
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get file extension
   * @static
   * @param {string} filePath - File path
   * @returns {string} File extension
   */
  static getExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Get file name without extension
   * @static
   * @param {string} filePath - File path
   * @returns {string} File name
   */
  static getBaseName(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * Format file size
   * @static
   * @param {number} bytes - Size in bytes
   * @param {number} decimals - Decimal places
   * @returns {string} Formatted size
   */
  static formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Compress file
   * @static
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Compression options
   * @returns {Promise<void>}
   */
  static async compressFile(source, destination, options = {}) {
    const { algorithm = 'gzip', level = 9 } = options;

    try {
      const input = fsSync.createReadStream(source);
      const output = fsSync.createWriteStream(destination);

      let compressor;
      switch (algorithm) {
        case 'gzip':
          compressor = zlib.createGzip({ level });
          break;
        case 'deflate':
          compressor = zlib.createDeflate({ level });
          break;
        case 'brotli':
          compressor = zlib.createBrotliCompress();
          break;
        default:
          throw new Error(`Unsupported compression algorithm: ${algorithm}`);
      }

      await pipeline(input, compressor, output);
    } catch (error) {
      throw new Error(`Failed to compress file: ${error.message}`);
    }
  }

  /**
   * Decompress file
   * @static
   * @param {string} source - Source file path
   * @param {string} destination - Destination file path
   * @param {Object} options - Decompression options
   * @returns {Promise<void>}
   */
  static async decompressFile(source, destination, options = {}) {
    const { algorithm = 'gzip' } = options;

    try {
      const input = fsSync.createReadStream(source);
      const output = fsSync.createWriteStream(destination);

      let decompressor;
      switch (algorithm) {
        case 'gzip':
          decompressor = zlib.createGunzip();
          break;
        case 'deflate':
          decompressor = zlib.createInflate();
          break;
        case 'brotli':
          decompressor = zlib.createBrotliDecompress();
          break;
        default:
          throw new Error(`Unsupported decompression algorithm: ${algorithm}`);
      }

      await pipeline(input, decompressor, output);
    } catch (error) {
      throw new Error(`Failed to decompress file: ${error.message}`);
    }
  }

  /**
   * Create temporary file
   * @static
   * @param {Object} options - Temp file options
   * @returns {Promise<Object>} Temp file info
   */
  static async createTempFile(options = {}) {
    const {
      prefix = 'tmp-',
      suffix = '.tmp',
      dir = require('os').tmpdir(),
      keepExtension = false,
      data = null
    } = options;

    const tempName = `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}${suffix}`;
    const tempPath = path.join(dir, tempName);

    try {
      if (data !== null) {
        await this.writeFile(tempPath, data);
      } else {
        await this.writeFile(tempPath, '');
      }

      return {
        path: tempPath,
        name: tempName,
        cleanup: async () => await this.deleteFile(tempPath, { force: true })
      };
    } catch (error) {
      throw new Error(`Failed to create temp file: ${error.message}`);
    }
  }

  /**
   * Create temporary directory
   * @static
   * @param {Object} options - Temp dir options
   * @returns {Promise<Object>} Temp dir info
   */
  static async createTempDir(options = {}) {
    const {
      prefix = 'tmpdir-',
      dir = require('os').tmpdir()
    } = options;

    const tempName = `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const tempPath = path.join(dir, tempName);

    try {
      await this.createDirectory(tempPath);

      return {
        path: tempPath,
        name: tempName,
        cleanup: async () => await this.deleteDirectory(tempPath, { recursive: true, force: true })
      };
    } catch (error) {
      throw new Error(`Failed to create temp directory: ${error.message}`);
    }
  }

  /**
   * Get directory size
   * @static
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>} Size in bytes
   */
  static async getDirectorySize(dirPath) {
    let totalSize = 0;

    const files = await this.findFiles(dirPath, {
      type: 'file',
      recursive: true
    });

    for (const file of files) {
      const stats = await fs.stat(file);
      totalSize += stats.size;
    }

    return totalSize;
  }

  /**
   * Sort files
   * @static
   * @private
   * @param {Array} files - Files to sort
   * @param {string} sortBy - Sort criteria
   * @returns {Array} Sorted files
   */
  static sortFiles(files, sortBy) {
    switch (sortBy) {
      case 'name':
        return files.sort((a, b) => a.name.localeCompare(b.name));
      case 'size':
        return files.sort((a, b) => (b.stats?.size || 0) - (a.stats?.size || 0));
      case 'modified':
        return files.sort((a, b) => {
          const aTime = a.stats?.modified || 0;
          const bTime = b.stats?.modified || 0;
          return bTime - aTime;
        });
      case 'type':
        return files.sort((a, b) => a.type.localeCompare(b.type));
      default:
        return files;
    }
  }

  /**
   * Match pattern
   * @static
   * @private
   * @param {string} filename - File name
   * @param {string} pattern - Pattern to match
   * @returns {boolean} Match result
   */
  static matchPattern(filename, pattern) {
    if (pattern === '*') return true;

    // Convert glob pattern to regex
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regex}$`).test(filename);
  }

  /**
   * Secure file deletion
   * @static
   * @private
   * @param {string} filePath - File path
   * @returns {Promise<void>}
   */
  static async secureDelete(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const size = stats.size;

      // Overwrite with random data multiple times
      for (let i = 0; i < 3; i++) {
        const randomData = crypto.randomBytes(size);
        await fs.writeFile(filePath, randomData);
      }

      // Final overwrite with zeros
      const zeros = Buffer.alloc(size, 0);
      await fs.writeFile(filePath, zeros);

      // Delete the file
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Secure delete failed: ${error.message}`);
    }
  }

  /**
   * Load JSON file
   * @static
   * @param {string} filePath - JSON file path
   * @param {Object} options - Load options
   * @returns {Promise<any>} Parsed JSON
   */
  static async loadJSON(filePath, options = {}) {
    const { encoding = 'utf8', reviver = null } = options;

    try {
      const content = await this.readFile(filePath, { encoding });
      return JSON.parse(content, reviver);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Save JSON file
   * @static
   * @param {string} filePath - JSON file path
   * @param {any} data - Data to save
   * @param {Object} options - Save options
   * @returns {Promise<void>}
   */
  static async saveJSON(filePath, data, options = {}) {
    const {
      encoding = 'utf8',
      spaces = 2,
      replacer = null,
      createDir = true
    } = options;

    try {
      const json = JSON.stringify(data, replacer, spaces);
      await this.writeFile(filePath, json, { encoding, createDir });
    } catch (error) {
      throw new Error(`Failed to save JSON file: ${error.message}`);
    }
  }

  /**
   * Get line count
   * @static
   * @param {string} filePath - File path
   * @returns {Promise<number>} Line count
   */
  static async getLineCount(filePath) {
    return new Promise((resolve, reject) => {
      let lineCount = 0;
      const stream = fsSync.createReadStream(filePath);
      const rl = require('readline').createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', () => lineCount++);
      rl.on('close', () => resolve(lineCount));
      rl.on('error', reject);
    });
  }

  /**
   * Stream file processing
   * @static
   * @param {string} filePath - File path
   * @param {Function} processor - Line processor function
   * @param {Object} options - Stream options
   * @returns {Promise<void>}
   */
  static async processFileStream(filePath, processor, options = {}) {
    const { encoding = 'utf8', highWaterMark = 64 * 1024 } = options;

    return new Promise((resolve, reject) => {
      const stream = fsSync.createReadStream(filePath, {
        encoding,
        highWaterMark
      });

      const rl = require('readline').createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;

      rl.on('line', async (line) => {
        lineNumber++;
        try {
          await processor(line, lineNumber);
        } catch (error) {
          rl.close();
          reject(error);
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });
  }

  /**
   * Create symlink
   * @static
   * @param {string} target - Target path
   * @param {string} linkPath - Symlink path
   * @param {string} type - Link type ('file', 'dir', 'junction')
   * @returns {Promise<void>}
   */
  static async createSymlink(target, linkPath, type = 'file') {
    try {
      await fs.symlink(target, linkPath, type);
    } catch (error) {
      throw new Error(`Failed to create symlink: ${error.message}`);
    }
  }

  /**
   * Read symlink target
   * @static
   * @param {string} linkPath - Symlink path
   * @returns {Promise<string>} Target path
   */
  static async readSymlink(linkPath) {
    try {
      return await fs.readlink(linkPath);
    } catch (error) {
      throw new Error(`Failed to read symlink: ${error.message}`);
    }
  }

  /**
   * Change file permissions
   * @static
   * @param {string} filePath - File path
   * @param {number|string} mode - Permission mode
   * @returns {Promise<void>}
   */
  static async chmod(filePath, mode) {
    try {
      const modeNum = typeof mode === 'string' ? parseInt(mode, 8) : mode;
      await fs.chmod(filePath, modeNum);
    } catch (error) {
      throw new Error(`Failed to change permissions: ${error.message}`);
    }
  }

  /**
   * Change file ownership
   * @static
   * @param {string} filePath - File path
   * @param {number} uid - User ID
   * @param {number} gid - Group ID
   * @returns {Promise<void>}
   */
  static async chown(filePath, uid, gid) {
    try {
      await fs.chown(filePath, uid, gid);
    } catch (error) {
      throw new Error(`Failed to change ownership: ${error.message}`);
    }
  }

  /**
   * Touch file (update timestamps or create)
   * @static
   * @param {string} filePath - File path
   * @param {Object} options - Touch options
   * @returns {Promise<void>}
   */
  static async touch(filePath, options = {}) {
    const {
      time = new Date(),
      atime = time,
      mtime = time,
      createIfNotExists = true
    } = options;

    try {
      if (!await this.exists(filePath)) {
        if (createIfNotExists) {
          await this.writeFile(filePath, '');
        } else {
          throw new Error('File does not exist');
        }
      }

      await fs.utimes(filePath, atime, mtime);
    } catch (error) {
      throw new Error(`Failed to touch file: ${error.message}`);
    }
  }
}

module.exports = FileHelper;
