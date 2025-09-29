const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

/**
 * AuditLogger - Handles audit log file operations
 */
class AuditLogger extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            logPath: config.logPath || './logs/audit',
            maxLogSize: config.maxLogSize || 100 * 1024 * 1024,
            maxLogFiles: config.maxLogFiles || 10,
            compressionEnabled: config.compressionEnabled !== false,
            encryptionEnabled: config.encryptionEnabled || false,
            encryptionKey: config.encryptionKey || null,
            format: config.format || 'json',
            filePrefix: config.filePrefix || 'audit',
            dateFormat: config.dateFormat || 'YYYY-MM-DD',
            bufferSize: config.bufferSize || 1000,
            syncWrite: config.syncWrite || false
        };

        this.currentLogFile = null;
        this.currentLogStream = null;
        this.currentLogSize = 0;
        this.logFileIndex = 0;
        this.writeQueue = [];
        this.isWriting = false;

        this.statistics = {
            totalWrites: 0,
            totalBytes: 0,
            filesCreated: 0,
            filesRotated: 0,
            compressionRatio: 1,
            errors: 0
        };
    }

    async initialize() {
        await fs.mkdir(this.config.logPath, { recursive: true });
        await this.createNewLogFile();
        this.emit('initialized');
    }

    async writeBatch(events) {
        const data = events.map(e => JSON.stringify(e)).join('\n') + '\n';
        await this.write(data);
    }

    async write(data) {
        try {
            let processedData = Buffer.from(data);

            if (this.config.encryptionEnabled && this.config.encryptionKey) {
                processedData = await this.encryptData(processedData);
            }

            if (this.currentLogSize + processedData.length > this.config.maxLogSize) {
                await this.rotate();
            }

            await fs.appendFile(this.currentLogFile, processedData);

            this.currentLogSize += processedData.length;
            this.statistics.totalWrites++;
            this.statistics.totalBytes += processedData.length;

        } catch (error) {
            this.statistics.errors++;
            throw error;
        }
    }

    async rotate() {
        if (this.currentLogFile) {
            if (this.config.compressionEnabled) {
                await this.compressLogFile(this.currentLogFile);
            }
        }

        await this.createNewLogFile();
        this.statistics.filesRotated++;
        this.emit('rotated', { file: this.currentLogFile });
    }

    async createNewLogFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${this.config.filePrefix}-${timestamp}.log`;
        this.currentLogFile = path.join(this.config.logPath, fileName);
        this.currentLogSize = 0;
        this.statistics.filesCreated++;
    }

    async compressLogFile(filePath) {
        const gzip = promisify(zlib.gzip);
        const data = await fs.readFile(filePath);
        const compressed = await gzip(data);

        const compressedPath = `${filePath}.gz`;
        await fs.writeFile(compressedPath, compressed);
        await fs.unlink(filePath);

        this.statistics.compressionRatio = data.length / compressed.length;
    }

    async encryptData(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);

        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]);
    }

    async search(query) {
        const files = await this.getLogFiles();
        const results = [];

        for (const file of files) {
            const content = await this.readLogFile(file);
            const lines = content.split('\n');

            for (const line of lines) {
                if (!line) continue;

                try {
                    const event = JSON.parse(line);
                    if (this.matchesQuery(event, query)) {
                        results.push(event);
                    }
                } catch (error) {
                    // Skip malformed lines
                }
            }
        }

        return results;
    }

    async getLogFiles() {
        const files = await fs.readdir(this.config.logPath);
        return files
            .filter(f => f.startsWith(this.config.filePrefix))
            .map(f => path.join(this.config.logPath, f))
            .sort();
    }

    async readLogFile(filePath) {
        let data = await fs.readFile(filePath);

        if (filePath.endsWith('.gz')) {
            const gunzip = promisify(zlib.gunzip);
            data = await gunzip(data);
        }

        if (this.config.encryptionEnabled && this.config.encryptionKey) {
            data = await this.decryptData(data);
        }

        return data.toString();
    }

    async decryptData(data) {
        const iv = data.slice(0, 16);
        const authTag = data.slice(16, 32);
        const encrypted = data.slice(32);

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted;
    }

    matchesQuery(event, query) {
        for (const [key, value] of Object.entries(query)) {
            if (key === 'startDate' && new Date(event.timestamp) < value) return false;
            if (key === 'endDate' && new Date(event.timestamp) > value) return false;
            if (key !== 'startDate' && key !== 'endDate' && event[key] !== value) return false;
        }
        return true;
    }

    async shutdown() {
        // Final flush and cleanup
        this.emit('shutdown');
    }
}

module.exports = AuditLogger;
