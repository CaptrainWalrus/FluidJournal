const crypto = require('crypto');
const Joi = require('joi');

class ContractValidator {
    constructor() {
        this.pendingRequests = new Map(); // Track requests expecting responses
        this.contracts = new Map(); // Store contract definitions
        this.setupContracts();
    }

    setupContracts() {
        // ME Service → Storage Agent Contract
        this.contracts.set('ME_TO_STORAGE', {
            version: '1.0',
            expectedOutput: {
                featureCount: 94,
                requiredFields: [
                    { name: 'rsi_14', type: 'number', range: [0, 100] },
                    { name: 'volume_spike_ratio', type: 'number', min: 0 },
                    { name: 'body_ratio', type: 'number', range: [0, 1] },
                    { name: 'ema_50', type: 'number' },
                    { name: 'volatility_5m', type: 'number', min: 0 },
                    // Add more fields as needed
                ],
                graduatedFeatures: {
                    count: { min: 10, max: 20 },
                    fields: ['rsi_14', 'volume_spike_ratio', 'body_ratio']
                }
            }
        });

        // Storage Agent → Risk Service Contract
        this.contracts.set('STORAGE_TO_RISK', {
            version: '1.0',
            expectedOutput: {
                similarPatternsCount: { min: 0, max: 100 },
                requiredFields: [
                    { name: 'similarity', type: 'number', range: [0, 1] },
                    { name: 'outcome', type: 'string', enum: ['win', 'loss'] },
                    { name: 'exit_reason', type: 'string' },
                    { name: 'pnl', type: 'number' },
                    { name: 'features', type: 'object' }
                ]
            }
        });

        // Risk Service → NinjaTrader Contract
        this.contracts.set('RISK_TO_NT', {
            version: '1.0',
            expectedOutput: {
                requiredFields: [
                    { name: 'approved', type: 'boolean' },
                    { name: 'confidence', type: 'number', range: [0, 1] },
                    { name: 'reasoning', type: 'string' },
                    { name: 'stopLoss', type: 'number', min: 0 },
                    { name: 'takeProfit', type: 'number', min: 0 }
                ]
            }
        });
    }

    // Generate signed contract for request
    generateContract(contractType, requestId, fromService, toService) {
        const contract = this.contracts.get(contractType);
        if (!contract) {
            throw new Error(`Unknown contract type: ${contractType}`);
        }

        const contractPayload = {
            requestId,
            fromService,
            toService,
            contractType,
            expectedOutput: contract.expectedOutput,
            version: contract.version,
            timestamp: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30000).toISOString() // 30 second timeout
        };

        // Sign the contract
        const signature = this.signContract(contractPayload);
        contractPayload.signature = signature;

        // Track the request
        this.pendingRequests.set(requestId, {
            contract: contractPayload,
            status: 'pending',
            createdAt: new Date()
        });

        return contractPayload;
    }

    // Sign contract with hash
    signContract(contract) {
        const contractString = JSON.stringify(contract, Object.keys(contract).sort());
        return crypto.createHash('sha256').update(contractString).digest('hex');
    }

    // Validate response against contract
    validateResponse(requestId, responseData) {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            throw new Error(`No pending request found for ID: ${requestId}`);
        }

        const contract = pending.contract;
        const validation = this.validateAgainstSchema(responseData, contract.expectedOutput);
        
        if (!validation.valid) {
            // Mark as failed
            pending.status = 'failed';
            pending.errors = validation.errors;
            pending.completedAt = new Date();
            
            throw new Error(`Contract violation for request ${requestId}: ${validation.errors.join(', ')}`);
        }

        // Mark as successful
        pending.status = 'completed';
        pending.completedAt = new Date();

        return {
            valid: true,
            contractFulfilled: true,
            requestId,
            completedAt: pending.completedAt
        };
    }

    // Validate data against schema
    validateAgainstSchema(data, schema) {
        const errors = [];

        // Check required fields
        if (schema.requiredFields) {
            for (const field of schema.requiredFields) {
                if (!(field.name in data)) {
                    errors.push(`Missing required field: ${field.name}`);
                    continue;
                }

                const value = data[field.name];
                
                // Type checking
                if (field.type === 'number' && typeof value !== 'number') {
                    errors.push(`Field ${field.name} must be a number, got ${typeof value}`);
                    continue;
                }

                if (field.type === 'string' && typeof value !== 'string') {
                    errors.push(`Field ${field.name} must be a string, got ${typeof value}`);
                    continue;
                }

                if (field.type === 'boolean' && typeof value !== 'boolean') {
                    errors.push(`Field ${field.name} must be a boolean, got ${typeof value}`);
                    continue;
                }

                // Range checking
                if (field.range && typeof value === 'number') {
                    if (value < field.range[0] || value > field.range[1]) {
                        errors.push(`Field ${field.name} value ${value} outside range [${field.range[0]}, ${field.range[1]}]`);
                    }
                }

                // Min checking
                if (field.min !== undefined && typeof value === 'number') {
                    if (value < field.min) {
                        errors.push(`Field ${field.name} value ${value} below minimum ${field.min}`);
                    }
                }

                // Enum checking
                if (field.enum && !field.enum.includes(value)) {
                    errors.push(`Field ${field.name} value "${value}" not in allowed values: ${field.enum.join(', ')}`);
                }
            }
        }

        // Check feature count
        if (schema.featureCount && data.features) {
            const actualCount = Object.keys(data.features).length;
            if (actualCount !== schema.featureCount) {
                errors.push(`Expected ${schema.featureCount} features, got ${actualCount}`);
            }
        }

        // Check graduated features
        if (schema.graduatedFeatures && data.graduatedFeatures) {
            const graduatedCount = Object.keys(data.graduatedFeatures).length;
            const { min, max } = schema.graduatedFeatures.count;
            if (graduatedCount < min || graduatedCount > max) {
                errors.push(`Expected ${min}-${max} graduated features, got ${graduatedCount}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Get pending requests (for dead letter detection)
    getPendingRequests() {
        const now = new Date();
        const pending = [];
        
        for (const [requestId, request] of this.pendingRequests) {
            if (request.status === 'pending') {
                const age = now - request.createdAt;
                const expired = new Date(request.contract.expiresAt) < now;
                
                pending.push({
                    requestId,
                    age,
                    expired,
                    contract: request.contract
                });
            }
        }
        
        return pending;
    }

    // Clean up old requests
    cleanup() {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 300000); // 5 minutes ago
        
        for (const [requestId, request] of this.pendingRequests) {
            if (request.createdAt < cutoff) {
                this.pendingRequests.delete(requestId);
            }
        }
    }

    // Get contract statistics
    getStats() {
        const stats = {
            totalRequests: this.pendingRequests.size,
            pending: 0,
            completed: 0,
            failed: 0,
            expired: 0
        };

        const now = new Date();
        
        for (const [requestId, request] of this.pendingRequests) {
            if (request.status === 'pending') {
                if (new Date(request.contract.expiresAt) < now) {
                    stats.expired++;
                } else {
                    stats.pending++;
                }
            } else if (request.status === 'completed') {
                stats.completed++;
            } else if (request.status === 'failed') {
                stats.failed++;
            }
        }

        return stats;
    }
}

module.exports = ContractValidator;