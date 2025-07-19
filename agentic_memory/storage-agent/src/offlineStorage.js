/**
 * Offline Storage System
 * Stage 1: Raw NT Records → Offline Storage
 * Stage 2: Offline Processing → Qualified Table (fuzzy matching)
 * Stage 3: Risk Agent Training → Graduated Features Only
 */

class OfflineStorage {
    constructor() {
        this.rawTable = null;      // Raw NT records
        this.qualifiedTable = null; // Processed records with fuzzy matching
        this.graduatedTable = null; // Final graduated features for training
        
        this.initialized = false;
        this.processingStats = {
            totalRaw: 0,
            qualified: 0,
            graduated: 0,
            lastProcessing: null
        };
    }

    async initialize() {
        console.log('[OFFLINE-STORAGE] Initializing offline storage system...');
        
        // Initialize raw records table
        this.rawTable = await this.initializeRawTable();
        
        // Initialize qualified table (fuzzy matched records)
        this.qualifiedTable = await this.initializeQualifiedTable();
        
        // Initialize graduated table (final training data)
        this.graduatedTable = await this.initializeGraduatedTable();
        
        this.initialized = true;
        console.log('[OFFLINE-STORAGE] ✅ Offline storage system initialized');
        
        return this.getInitializationStats();
    }

    async initializeRawTable() {
        console.log('[OFFLINE-STORAGE] Creating raw records table...');
        
        const rawSchema = {
            // Record identification
            entrySignalId: 'TEXT PRIMARY KEY',
            timestamp: 'INTEGER',
            
            // Trade context
            instrument: 'TEXT',
            direction: 'TEXT',
            entryType: 'TEXT',
            entryPrice: 'REAL',
            
            // Raw features (as JSON blob)
            featuresJson: 'TEXT',
            featureCount: 'INTEGER',
            
            // Outcome data (when available)
            pnl: 'REAL',
            exitPrice: 'REAL',
            exitReason: 'TEXT',
            profitByBarJson: 'TEXT',
            
            // Processing status
            processed: 'INTEGER DEFAULT 0',
            qualified: 'INTEGER DEFAULT 0',
            graduated: 'INTEGER DEFAULT 0',
            
            // Metadata
            createdAt: 'INTEGER DEFAULT (strftime("%s", "now"))',
            updatedAt: 'INTEGER DEFAULT (strftime("%s", "now"))'
        };
        
        // In a real implementation, this would create an actual database table
        // For now, we'll simulate with an in-memory structure
        return {
            name: 'raw_records',
            schema: rawSchema,
            records: new Map(),
            indexes: {
                instrument: new Map(),
                direction: new Map(),
                timestamp: new Map()
            }
        };
    }

    async initializeQualifiedTable() {
        console.log('[OFFLINE-STORAGE] Creating qualified records table...');
        
        const qualifiedSchema = {
            // Links to raw record
            entrySignalId: 'TEXT PRIMARY KEY',
            rawRecordId: 'TEXT',
            
            // Trade context (duplicated for performance)
            instrument: 'TEXT',
            direction: 'TEXT',
            entryType: 'TEXT',
            
            // Fuzzy matching results
            fuzzyScore: 'REAL',
            matchingFeatures: 'TEXT', // JSON array of feature names
            missingFeatures: 'TEXT',  // JSON array of missing features
            
            // Processed features (normalized)
            processedFeatures: 'TEXT', // JSON object
            featureQuality: 'REAL',    // 0-1 quality score
            
            // Qualification criteria
            qualificationReason: 'TEXT',
            qualificationScore: 'REAL',
            
            // Outcome data
            pnl: 'REAL',
            profitable: 'INTEGER',
            
            // Processing metadata
            processedAt: 'INTEGER DEFAULT (strftime("%s", "now"))',
            graduationEligible: 'INTEGER DEFAULT 0'
        };
        
        return {
            name: 'qualified_records',
            schema: qualifiedSchema,
            records: new Map(),
            indexes: {
                instrument_direction: new Map(),
                fuzzyScore: new Map(),
                qualificationScore: new Map()
            }
        };
    }

    async initializeGraduatedTable() {
        console.log('[OFFLINE-STORAGE] Creating graduated features table...');
        
        const graduatedSchema = {
            // Links to qualified record
            entrySignalId: 'TEXT PRIMARY KEY',
            qualifiedRecordId: 'TEXT',
            
            // Trade context
            instrument: 'TEXT',
            direction: 'TEXT',
            
            // Graduated features (final training format)
            graduatedFeatures: 'TEXT', // JSON array of feature values
            featureNames: 'TEXT',      // JSON array of feature names
            featureVector: 'BLOB',     // Binary feature vector for ML
            
            // Training labels
            pnlLabel: 'REAL',
            profitableLabel: 'INTEGER',
            trajectoryLabel: 'TEXT',   // JSON array of profit trajectory
            
            // Training metadata
            graduationTimestamp: 'INTEGER DEFAULT (strftime("%s", "now"))',
            trainingWeight: 'REAL DEFAULT 1.0',
            
            // Model tracking
            usedInTraining: 'INTEGER DEFAULT 0',
            lastTrainingRun: 'INTEGER'
        };
        
        return {
            name: 'graduated_features',
            schema: graduatedSchema,
            records: new Map(),
            indexes: {
                instrument_direction: new Map(),
                trainingWeight: new Map()
            }
        };
    }

    // STAGE 1: Store raw NT record
    async storeRawRecord(ntRecord) {
        if (!this.initialized) {
            throw new Error('Offline storage not initialized');
        }
        
        const rawRecord = {
            entrySignalId: ntRecord.entrySignalId,
            timestamp: ntRecord.timestamp || Date.now(),
            
            instrument: ntRecord.instrument,
            direction: ntRecord.direction,
            entryType: ntRecord.entryType,
            entryPrice: ntRecord.entryPrice,
            
            featuresJson: JSON.stringify(ntRecord.features || {}),
            featureCount: Object.keys(ntRecord.features || {}).length,
            
            pnl: ntRecord.pnl,
            exitPrice: ntRecord.exitPrice,
            exitReason: ntRecord.exitReason,
            profitByBarJson: JSON.stringify(ntRecord.profitByBar || {}),
            
            processed: 0,
            qualified: 0,
            graduated: 0
        };
        
        // Store in raw table
        this.rawTable.records.set(rawRecord.entrySignalId, rawRecord);
        
        // Update indexes
        this.updateIndexes(this.rawTable, rawRecord);
        
        this.processingStats.totalRaw++;
        
        console.log(`[OFFLINE-STORAGE] Stored raw record: ${rawRecord.entrySignalId}`);
        return rawRecord.entrySignalId;
    }

    // STAGE 2: Process raw records into qualified table
    async processRawRecords(batchSize = 100) {
        if (!this.initialized) {
            throw new Error('Offline storage not initialized');
        }
        
        console.log(`[OFFLINE-PROCESSING] Starting batch processing (${batchSize} records)...`);
        
        // Get unprocessed raw records
        const unprocessedRecords = Array.from(this.rawTable.records.values())
            .filter(record => !record.processed)
            .slice(0, batchSize);
        
        if (unprocessedRecords.length === 0) {
            console.log('[OFFLINE-PROCESSING] No unprocessed records found');
            return { processed: 0, qualified: 0 };
        }
        
        let processedCount = 0;
        let qualifiedCount = 0;
        
        for (const rawRecord of unprocessedRecords) {
            try {
                const qualificationResult = await this.qualifyRecord(rawRecord);
                
                if (qualificationResult.qualified) {
                    await this.storeQualifiedRecord(qualificationResult);
                    qualifiedCount++;
                }
                
                // Mark as processed
                rawRecord.processed = 1;
                rawRecord.qualified = qualificationResult.qualified ? 1 : 0;
                rawRecord.updatedAt = Date.now();
                
                processedCount++;
                
            } catch (error) {
                console.error(`[OFFLINE-PROCESSING] Error processing record ${rawRecord.entrySignalId}:`, error.message);
            }
        }
        
        this.processingStats.qualified += qualifiedCount;
        this.processingStats.lastProcessing = Date.now();
        
        console.log(`[OFFLINE-PROCESSING] Completed: ${processedCount} processed, ${qualifiedCount} qualified`);
        
        return { processed: processedCount, qualified: qualifiedCount };
    }

    // Fuzzy matching logic to qualify records
    async qualifyRecord(rawRecord) {
        const features = JSON.parse(rawRecord.featuresJson);
        
        // Define required features for graduation
        const requiredFeatures = [
            'rsi_14', 'momentum_5', 'volume_spike_3bar', 'atr_percentage',
            'bb_position', 'bb_width', 'ema_spread_pct', 'range_expansion'
        ];
        
        const optionalFeatures = [
            'macd_histogram', 'stoch_k', 'williams_r', 'body_ratio',
            'upper_wick_ratio', 'lower_wick_ratio', 'inside_bar'
        ];
        
        // Calculate fuzzy match score
        const fuzzyResult = this.calculateFuzzyMatch(features, requiredFeatures, optionalFeatures);
        
        // Qualification criteria
        const qualificationCriteria = {
            minimumFuzzyScore: 0.6,  // 60% of required features
            minimumFeatureCount: 5,   // At least 5 features total
            requiresOutcome: true     // Must have PnL data
        };
        
        const qualified = this.evaluateQualification(fuzzyResult, rawRecord, qualificationCriteria);
        
        return {
            entrySignalId: rawRecord.entrySignalId,
            instrument: rawRecord.instrument,
            direction: rawRecord.direction,
            entryType: rawRecord.entryType,
            pnl: rawRecord.pnl,
            qualified: qualified.qualified,
            qualificationReason: qualified.reason,
            qualificationScore: qualified.score,
            fuzzyScore: fuzzyResult.score,
            matchingFeatures: fuzzyResult.matchingFeatures,
            missingFeatures: fuzzyResult.missingFeatures,
            processedFeatures: this.normalizeFeatures(features),
            featureQuality: fuzzyResult.quality
        };
    }

    calculateFuzzyMatch(features, requiredFeatures, optionalFeatures) {
        const availableFeatures = Object.keys(features).filter(key => 
            features[key] !== undefined && features[key] !== null && features[key] !== 0
        );
        
        // Required features matching
        const matchingRequired = requiredFeatures.filter(feature => 
            availableFeatures.includes(feature)
        );
        
        // Optional features matching
        const matchingOptional = optionalFeatures.filter(feature => 
            availableFeatures.includes(feature)
        );
        
        const missingRequired = requiredFeatures.filter(feature => 
            !availableFeatures.includes(feature)
        );
        
        // Calculate fuzzy score
        const requiredScore = matchingRequired.length / requiredFeatures.length;
        const optionalScore = matchingOptional.length / optionalFeatures.length;
        
        // Weighted fuzzy score (required 80%, optional 20%)
        const fuzzyScore = (requiredScore * 0.8) + (optionalScore * 0.2);
        
        // Quality score based on feature completeness
        const totalPossible = requiredFeatures.length + optionalFeatures.length;
        const totalMatching = matchingRequired.length + matchingOptional.length;
        const quality = totalMatching / totalPossible;
        
        return {
            score: fuzzyScore,
            quality: quality,
            matchingFeatures: [...matchingRequired, ...matchingOptional],
            missingFeatures: missingRequired,
            requiredMatched: matchingRequired.length,
            optionalMatched: matchingOptional.length
        };
    }

    evaluateQualification(fuzzyResult, rawRecord, criteria) {
        const checks = [];
        let totalScore = 0;
        
        // Check fuzzy match score
        if (fuzzyResult.score >= criteria.minimumFuzzyScore) {
            checks.push(`✅ Fuzzy match: ${(fuzzyResult.score * 100).toFixed(1)}%`);
            totalScore += 0.4;
        } else {
            checks.push(`❌ Fuzzy match: ${(fuzzyResult.score * 100).toFixed(1)}% (need ${(criteria.minimumFuzzyScore * 100).toFixed(1)}%)`);
        }
        
        // Check feature count
        if (fuzzyResult.matchingFeatures.length >= criteria.minimumFeatureCount) {
            checks.push(`✅ Feature count: ${fuzzyResult.matchingFeatures.length}`);
            totalScore += 0.3;
        } else {
            checks.push(`❌ Feature count: ${fuzzyResult.matchingFeatures.length} (need ${criteria.minimumFeatureCount})`);
        }
        
        // Check outcome data
        if (!criteria.requiresOutcome || (rawRecord.pnl !== undefined && rawRecord.pnl !== null)) {
            checks.push(`✅ Outcome data: Present`);
            totalScore += 0.3;
        } else {
            checks.push(`❌ Outcome data: Missing`);
        }
        
        const qualified = totalScore >= 0.7; // 70% of criteria must pass
        
        return {
            qualified: qualified,
            score: totalScore,
            reason: checks.join(' | ')
        };
    }

    normalizeFeatures(features) {
        // Normalize features for consistent processing
        const normalized = {};
        
        for (const [key, value] of Object.entries(features)) {
            if (value !== undefined && value !== null) {
                // Apply feature-specific normalization
                normalized[key] = this.normalizeFeatureValue(key, value);
            }
        }
        
        return normalized;
    }

    normalizeFeatureValue(featureName, value) {
        // Feature-specific normalization rules
        switch (featureName) {
            case 'rsi_14':
                return Math.max(0, Math.min(100, value)); // Clamp to 0-100
            case 'bb_position':
                return Math.max(0, Math.min(1, value)); // Clamp to 0-1
            case 'volume_spike_3bar':
                return Math.max(0, Math.min(10, value)); // Clamp to reasonable range
            default:
                return value;
        }
    }

    async storeQualifiedRecord(qualificationResult) {
        const qualifiedRecord = {
            entrySignalId: qualificationResult.entrySignalId,
            rawRecordId: qualificationResult.entrySignalId,
            
            instrument: qualificationResult.instrument,
            direction: qualificationResult.direction,
            entryType: qualificationResult.entryType,
            
            fuzzyScore: qualificationResult.fuzzyScore,
            matchingFeatures: JSON.stringify(qualificationResult.matchingFeatures),
            missingFeatures: JSON.stringify(qualificationResult.missingFeatures),
            
            processedFeatures: JSON.stringify(qualificationResult.processedFeatures),
            featureQuality: qualificationResult.featureQuality,
            
            qualificationReason: qualificationResult.qualificationReason,
            qualificationScore: qualificationResult.qualificationScore,
            
            pnl: qualificationResult.pnl,
            profitable: qualificationResult.pnl > 0 ? 1 : 0,
            
            processedAt: Date.now(),
            graduationEligible: 1
        };
        
        // Store in qualified table
        this.qualifiedTable.records.set(qualifiedRecord.entrySignalId, qualifiedRecord);
        
        // Update indexes
        this.updateIndexes(this.qualifiedTable, qualifiedRecord);
        
        console.log(`[OFFLINE-STORAGE] Qualified record stored: ${qualifiedRecord.entrySignalId} (score: ${qualificationResult.qualificationScore})`);
        return qualifiedRecord.entrySignalId;
    }

    async storeGraduatedRecord(graduatedRecord) {
        // Store in graduated table
        this.graduatedTable.records.set(graduatedRecord.entrySignalId, graduatedRecord);
        
        // Update indexes
        this.updateIndexes(this.graduatedTable, graduatedRecord);
        
        console.log(`[OFFLINE-STORAGE] Graduated record stored: ${graduatedRecord.entrySignalId}`);
        return graduatedRecord.entrySignalId;
    }

    updateIndexes(table, record) {
        // Update table indexes for fast lookups
        if (table.indexes.instrument && record.instrument) {
            if (!table.indexes.instrument.has(record.instrument)) {
                table.indexes.instrument.set(record.instrument, new Set());
            }
            table.indexes.instrument.get(record.instrument).add(record.entrySignalId);
        }
        
        if (table.indexes.direction && record.direction) {
            if (!table.indexes.direction.has(record.direction)) {
                table.indexes.direction.set(record.direction, new Set());
            }
            table.indexes.direction.get(record.direction).add(record.entrySignalId);
        }
    }

    async getInitializationStats() {
        return {
            initialized: this.initialized,
            tables: {
                raw: this.rawTable ? this.rawTable.name : null,
                qualified: this.qualifiedTable ? this.qualifiedTable.name : null,
                graduated: this.graduatedTable ? this.graduatedTable.name : null
            },
            processingStats: this.processingStats
        };
    }

    // Get processing statistics
    getProcessingStats() {
        return {
            ...this.processingStats,
            rawRecords: this.rawTable ? this.rawTable.records.size : 0,
            qualifiedRecords: this.qualifiedTable ? this.qualifiedTable.records.size : 0,
            graduatedRecords: this.graduatedTable ? this.graduatedTable.records.size : 0
        };
    }
}

module.exports = OfflineStorage;