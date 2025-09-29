const { EventEmitter } = require('events');

/**
 * AuditEvents - Manages audit event definitions and validation
 */
class AuditEvents extends EventEmitter {
    constructor(config = {}) {
        super();

        this.eventTypes = config.eventTypes || {};
        this.severityLevels = config.severityLevels || {};

        this.eventSchemas = new Map();
        this.eventHandlers = new Map();
        this.eventFilters = new Map();
        this.eventTransformers = new Map();

        this.initializeEventSchemas();
    }

    initializeEventSchemas() {
        // Define schemas for different event types
        this.eventSchemas.set('authentication', {
            required: ['userId', 'method', 'ipAddress'],
            optional: ['sessionId', 'userAgent', 'location']
        });

        this.eventSchemas.set('authorization', {
            required: ['userId', 'resource', 'permission'],
            optional: ['granted', 'reason', 'policy']
        });

        this.eventSchemas.set('data_access', {
            required: ['userId', 'resourceId', 'operation'],
            optional: ['dataSize', 'query', 'fields']
        });

        this.eventSchemas.set('configuration_change', {
            required: ['userId', 'setting', 'oldValue', 'newValue'],
            optional: ['reason', 'approvedBy']
        });
    }

    validateEvent(event) {
        const schema = this.eventSchemas.get(event.type);
        if (!schema) return true;

        for (const field of schema.required) {
            if (!event[field]) {
                throw new Error(`Required field missing: ${field}`);
            }
        }

        return true;
    }

    registerEventHandler(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    async processEvent(event) {
        const handlers = this.eventHandlers.get(event.type) || [];
        for (const handler of handlers) {
            await handler(event);
        }
    }

    filterEvent(event) {
        const filters = this.eventFilters.get(event.type) || [];
        for (const filter of filters) {
            if (!filter(event)) return false;
        }
        return true;
    }

    transformEvent(event) {
        const transformers = this.eventTransformers.get(event.type) || [];
        let transformed = { ...event };
        for (const transformer of transformers) {
            transformed = transformer(transformed);
        }
        return transformed;
    }
}

module.exports = AuditEvents;
