/**
 * @fileoverview SeedManager - Manages database seeding operations
 * @module shared/lib/database/seeders/seed-manager
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

/**
 * @class SeedManager
 * @description Manages database seeding for development and testing
 */
class SeedManager {
    /**
     * Creates an instance of SeedManager
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.connectionManager = options.connectionManager;
        this.logger = options.logger || this._createDefaultLogger();
        this.config = {
            seedPath: options.seedPath || __dirname,
            environment: options.environment || process.env.NODE_ENV || 'development',
            ...options
        };
    }

    /**
     * Creates a default logger
     * @private
     */
    _createDefaultLogger() {
        return winston.createLogger({
            level: 'info',
            format: winston.format.simple(),
            transports: [new winston.transports.Console()]
        });
    }

    /**
     * Runs all seeders
     * @returns {Promise<Object>} Seeding results
     */
    async seed() {
        this.logger.info('Starting database seeding...');

        const results = {
            success: true,
            seeded: [],
            failed: [],
            skipped: []
        };

        try {
            // Get all seeder files
            const seedFiles = await this._getSeedFiles();

            for (const file of seedFiles) {
                try {
                    const seeder = require(file);

                    if (seeder.shouldRun && !seeder.shouldRun(this.config.environment)) {
                        results.skipped.push(path.basename(file));
                        continue;
                    }

                    await seeder.seed(this.connectionManager);
                    results.seeded.push(path.basename(file));

                    this.logger.info(`✓ Seeded: ${path.basename(file)}`);

                } catch (error) {
                    results.failed.push({
                        file: path.basename(file),
                        error: error.message
                    });
                    results.success = false;

                    this.logger.error(`✗ Failed: ${path.basename(file)} - ${error.message}`);
                }
            }

            return results;

        } catch (error) {
            this.logger.error('Seeding failed', error);
            throw error;
        }
    }

    /**
     * Gets all seed files
     * @private
     */
    async _getSeedFiles() {
        const files = await fs.readdir(this.config.seedPath);
        return files
            .filter(f => f.endsWith('.seed.js'))
            .map(f => path.join(this.config.seedPath, f))
            .sort();
    }

    /**
     * Clears all seeded data
     * @returns {Promise<void>}
     */
    async clear() {
        this.logger.warn('Clearing seeded data...');

        // Implementation depends on your specific needs
        // This is a placeholder for the clearing logic

        this.logger.info('Seeded data cleared');
    }
}

module.exports = SeedManager;
