const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * AuditTrail - Maintains tamper-proof audit trail with chain of custody
 */
class AuditTrail extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            trailPath: config.trailPath || './logs/trails',
            tamperProtection: config.tamperProtection !== false,
            hashAlgorithm: config.hashAlgorithm || 'sha256',
            chainValidation: config.chainValidation !== false,
            blockSize: config.blockSize || 100,
            signatureEnabled: config.signatureEnabled || false,
            signatureKey: config.signatureKey || null
        };

        this.currentBlock = [];
        this.blockChain = [];
        this.blockIndex = 0;
        this.lastHash = null;

        this.statistics = {
            totalEntries: 0,
            totalBlocks: 0,
            validationFailures: 0,
            chainIntact: true
        };
    }

    async initialize() {
        await fs.mkdir(this.config.trailPath, { recursive: true });
        await this.loadExistingChain();
        this.emit('initialized');
    }

    async addEntry(event) {
        const entry = this.createEntry(event);

        if (this.config.tamperProtection) {
            entry.hash = this.calculateEntryHash(entry);
            entry.previousHash = this.lastHash;
            this.lastHash = entry.hash;
        }

        if (this.config.signatureEnabled && this.config.signatureKey) {
            entry.signature = this.signEntry(entry);
        }

        this.currentBlock.push(entry);
        this.statistics.totalEntries++;

        if (this.currentBlock.length >= this.config.blockSize) {
            await this.finalizeBlock();
        }

        return entry;
    }

    createEntry(event) {
        return {
            sequence: this.statistics.totalEntries + 1,
            timestamp: new Date().toISOString(),
            event: event,
            metadata: {
                blockIndex: this.blockIndex,
                position: this.currentBlock.length
            }
        };
    }

    calculateEntryHash(entry) {
        const data = JSON.stringify({
            sequence: entry.sequence,
            timestamp: entry.timestamp,
            event: entry.event
        });

        return crypto
            .createHash(this.config.hashAlgorithm)
            .update(data)
            .digest('hex');
    }

    signEntry(entry) {
        const data = JSON.stringify(entry);
        return crypto
            .createHmac(this.config.hashAlgorithm, this.config.signatureKey)
            .update(data)
            .digest('hex');
    }

    async finalizeBlock() {
        const block = {
            index: this.blockIndex++,
            timestamp: new Date().toISOString(),
            entries: this.currentBlock,
            entriesCount: this.currentBlock.length,
            previousBlockHash: this.blockChain.length > 0 ?
                this.blockChain[this.blockChain.length - 1].hash : null
        };

        if (this.config.tamperProtection) {
            block.hash = this.calculateBlockHash(block);
            block.merkleRoot = this.calculateMerkleRoot(this.currentBlock);
        }

        this.blockChain.push(block);
        await this.persistBlock(block);

        this.currentBlock = [];
        this.statistics.totalBlocks++;

        this.emit('blockFinalized', block);
    }

    calculateBlockHash(block) {
        const data = JSON.stringify({
            index: block.index,
            timestamp: block.timestamp,
            entriesCount: block.entriesCount,
            merkleRoot: block.merkleRoot,
            previousBlockHash: block.previousBlockHash
        });

        return crypto
            .createHash(this.config.hashAlgorithm)
            .update(data)
            .digest('hex');
    }

    calculateMerkleRoot(entries) {
        if (entries.length === 0) return null;

        let hashes = entries.map(e => e.hash || this.calculateEntryHash(e));

        while (hashes.length > 1) {
            const newHashes = [];

            for (let i = 0; i < hashes.length; i += 2) {
                const left = hashes[i];
                const right = hashes[i + 1] || hashes[i];

                const combined = crypto
                    .createHash(this.config.hashAlgorithm)
                    .update(left + right)
                    .digest('hex');

                newHashes.push(combined);
            }

            hashes = newHashes;
        }

        return hashes[0];
    }

    async persistBlock(block) {
        const fileName = `block-${block.index.toString().padStart(6, '0')}.json`;
        const filePath = path.join(this.config.trailPath, fileName);

        await fs.writeFile(filePath, JSON.stringify(block, null, 2));
    }

    async loadExistingChain() {
        try {
            const files = await fs.readdir(this.config.trailPath);
            const blockFiles = files
                .filter(f => f.startsWith('block-'))
                .sort();

            for (const file of blockFiles) {
                const filePath = path.join(this.config.trailPath, file);
                const content = await fs.readFile(filePath, 'utf8');
                const block = JSON.parse(content);

                this.blockChain.push(block);
                this.blockIndex = Math.max(this.blockIndex, block.index + 1);

                if (block.entries && block.entries.length > 0) {
                    const lastEntry = block.entries[block.entries.length - 1];
                    this.lastHash = lastEntry.hash;
                    this.statistics.totalEntries += block.entriesCount;
                }
            }

            this.statistics.totalBlocks = this.blockChain.length;

        } catch (error) {
            // No existing chain
        }
    }

    async validateChain() {
        if (!this.config.chainValidation) {
            return { valid: true, message: 'Chain validation disabled' };
        }

        const results = {
            valid: true,
            errors: [],
            validated: 0
        };

        for (let i = 0; i < this.blockChain.length; i++) {
            const block = this.blockChain[i];

            // Validate block hash
            if (this.config.tamperProtection) {
                const calculatedHash = this.calculateBlockHash(block);
                if (calculatedHash !== block.hash) {
                    results.valid = false;
                    results.errors.push({
                        block: i,
                        error: 'Block hash mismatch'
                    });
                }
            }

            // Validate chain continuity
            if (i > 0) {
                const previousBlock = this.blockChain[i - 1];
                if (block.previousBlockHash !== previousBlock.hash) {
                    results.valid = false;
                    results.errors.push({
                        block: i,
                        error: 'Chain continuity broken'
                    });
                }
            }

            // Validate Merkle root
            if (block.merkleRoot) {
                const calculatedRoot = this.calculateMerkleRoot(block.entries);
                if (calculatedRoot !== block.merkleRoot) {
                    results.valid = false;
                    results.errors.push({
                        block: i,
                        error: 'Merkle root mismatch'
                    });
                }
            }

            // Validate entries
            for (let j = 0; j < block.entries.length; j++) {
                const entry = block.entries[j];

                if (entry.hash) {
                    const calculatedHash = this.calculateEntryHash(entry);
                    if (calculatedHash !== entry.hash) {
                        results.valid = false;
                        results.errors.push({
                            block: i,
                            entry: j,
                            error: 'Entry hash mismatch'
                        });
                    }
                }

                if (entry.signature && this.config.signatureKey) {
                    const validSignature = this.verifySignature(entry);
                    if (!validSignature) {
                        results.valid = false;
                        results.errors.push({
                            block: i,
                            entry: j,
                            error: 'Invalid signature'
                        });
                    }
                }
            }

            results.validated++;
        }

        this.statistics.chainIntact = results.valid;

        if (!results.valid) {
            this.statistics.validationFailures++;
            this.emit('validationFailed', results);
        }

        return results;
    }

    verifySignature(entry) {
        const entryCopy = { ...entry };
        delete entryCopy.signature;

        const data = JSON.stringify(entryCopy);
        const signature = crypto
            .createHmac(this.config.hashAlgorithm, this.config.signatureKey)
            .update(data)
            .digest('hex');

        return signature === entry.signature;
    }

    async getTrail(options = {}) {
        const trail = [];

        for (const block of this.blockChain) {
            for (const entry of block.entries) {
                if (this.matchesFilter(entry, options)) {
                    trail.push(entry);
                }
            }
        }

        // Include current block entries
        for (const entry of this.currentBlock) {
            if (this.matchesFilter(entry, options)) {
                trail.push(entry);
            }
        }

        return trail;
    }

    matchesFilter(entry, filter) {
        if (filter.startDate && new Date(entry.timestamp) < filter.startDate) {
            return false;
        }

        if (filter.endDate && new Date(entry.timestamp) > filter.endDate) {
            return false;
        }

        if (filter.eventType && entry.event.type !== filter.eventType) {
            return false;
        }

        if (filter.userId && entry.event.userId !== filter.userId) {
            return false;
        }

        return true;
    }

    async exportTrail(options = {}) {
        const trail = await this.getTrail(options);
        const validation = await this.validateChain();

        const exportData = {
            exported: new Date().toISOString(),
            chainValid: validation.valid,
            statistics: this.statistics,
            trail: trail,
            blocks: options.includeBlocks ? this.blockChain : undefined
        };

        const fileName = `trail-export-${Date.now()}.json`;
        const filePath = path.join(this.config.trailPath, 'exports', fileName);

        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));

        return filePath;
    }

    getStatistics() {
        return {
            ...this.statistics,
            currentBlockSize: this.currentBlock.length,
            blockChainLength: this.blockChain.length
        };
    }

    async shutdown() {
        if (this.currentBlock.length > 0) {
            await this.finalizeBlock();
        }
        this.emit('shutdown');
    }
}

module.exports = AuditTrail;
