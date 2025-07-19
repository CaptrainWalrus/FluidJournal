/**
 * Offline Processing Pipeline
 * Processes raw NT records into qualified training data
 */

const OfflineStorage = require('./offlineStorage');

class OfflineProcessor {
    constructor() {
        this.storage = new OfflineStorage();
        this.processing = false;
        this.processingStats = {
            totalProcessed: 0,
            totalQualified: 0,
            totalGraduated: 0,
            lastRun: null,
            processingTime: 0
        };
        
        // Processing configuration
        this.config = {
            batchSize: 100,
            processingInterval: 5 * 60 * 1000, // 5 minutes
            autoProcessing: true,
            graduationThreshold: 0.8, // 80% feature completeness for graduation
            maxProcessingTime: 10 * 60 * 1000 // 10 minutes max processing time
        };
    }

    async initialize() {
        console.log('[OFFLINE-PROCESSOR] Initializing offline processor...');
        
        await this.storage.initialize();
        
        if (this.config.autoProcessing) {
            this.startAutoProcessing();
        }
        
        console.log('[OFFLINE-PROCESSOR] ✅ Offline processor initialized');
        return this.getStatus();
    }

    // Start automatic processing every N minutes
    startAutoProcessing() {
        console.log(`[OFFLINE-PROCESSOR] Starting auto-processing every ${this.config.processingInterval / 60000} minutes`);
        
        this.processingTimer = setInterval(async () => {
            try {
                await this.processAll();
            } catch (error) {
                console.error('[OFFLINE-PROCESSOR] Auto-processing error:', error.message);
            }
        }, this.config.processingInterval);
    }

    stopAutoProcessing() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
            console.log('[OFFLINE-PROCESSOR] Auto-processing stopped');
        }
    }

    // Process all stages: Raw → Qualified → Graduated
    async processAll() {
        if (this.processing) {
            console.log('[OFFLINE-PROCESSOR] Already processing, skipping...');
            return this.getStatus();
        }

        this.processing = true;
        const startTime = Date.now();
        
        try {
            console.log('[OFFLINE-PROCESSOR] 🔄 Starting full processing pipeline...');
            
            // STAGE 1: Process raw records → qualified
            const stage1Result = await this.processRawToQualified();
            
            // STAGE 2: Process qualified records → graduated
            const stage2Result = await this.processQualifiedToGraduated();
            
            // STAGE 3: Cleanup and optimization
            await this.cleanup();
            
            const processingTime = Date.now() - startTime;
            this.processingStats.processingTime = processingTime;
            this.processingStats.lastRun = Date.now();
            
            const result = {
                success: true,
                processingTime,
                stage1: stage1Result,
                stage2: stage2Result,
                stats: this.getProcessingStats()
            };
            
            console.log(`[OFFLINE-PROCESSOR] ✅ Full processing completed in ${processingTime}ms`);
            console.log(`[OFFLINE-PROCESSOR] Results: ${stage1Result.qualified} qualified, ${stage2Result.graduated} graduated`);
            
            return result;
            
        } catch (error) {
            console.error('[OFFLINE-PROCESSOR] Processing failed:', error.message);
            throw error;
        } finally {
            this.processing = false;
        }
    }

    // STAGE 1: Raw → Qualified
    async processRawToQualified() {
        console.log('[OFFLINE-PROCESSOR] Stage 1: Processing raw records to qualified...');
        
        let totalProcessed = 0;
        let totalQualified = 0;
        let hasMoreRecords = true;
        
        while (hasMoreRecords) {
            const batchResult = await this.storage.processRawRecords(this.config.batchSize);
            
            totalProcessed += batchResult.processed;
            totalQualified += batchResult.qualified;
            
            if (batchResult.processed < this.config.batchSize) {
                hasMoreRecords = false;
            }
            
            console.log(`[OFFLINE-PROCESSOR] Stage 1 batch: ${batchResult.processed} processed, ${batchResult.qualified} qualified`);
        }
        
        this.processingStats.totalProcessed += totalProcessed;
        this.processingStats.totalQualified += totalQualified;
        
        return {
            processed: totalProcessed,
            qualified: totalQualified
        };
    }

    // STAGE 2: Qualified → Graduated
    async processQualifiedToGraduated() {
        console.log('[OFFLINE-PROCESSOR] Stage 2: Processing qualified records to graduated...');
        
        const qualifiedRecords = await this.getQualifiedRecords();
        let graduatedCount = 0;
        
        for (const qualifiedRecord of qualifiedRecords) {
            try {
                const graduated = await this.graduateRecord(qualifiedRecord);
                
                if (graduated) {
                    graduatedCount++;
                }
                
            } catch (error) {
                console.error(`[OFFLINE-PROCESSOR] Error graduating record ${qualifiedRecord.entrySignalId}:`, error.message);
            }
        }
        
        this.processingStats.totalGraduated += graduatedCount;
        
        return {
            processed: qualifiedRecords.length,
            graduated: graduatedCount
        };
    }

    // Graduate a qualified record to final training format
    async graduateRecord(qualifiedRecord) {
        // Parse processed features
        const processedFeatures = JSON.parse(qualifiedRecord.processedFeatures);
        
        // Generate graduated feature vector
        const graduationResult = await this.generateGraduatedFeatures(
            processedFeatures, 
            qualifiedRecord.instrument, 
            qualifiedRecord.direction
        );
        
        // Check if meets graduation threshold
        if (graduationResult.completeness < this.config.graduationThreshold) {
            console.log(`[OFFLINE-PROCESSOR] Record ${qualifiedRecord.entrySignalId} doesn't meet graduation threshold: ${graduationResult.completeness}`);
            return false;
        }
        
        // Create graduated record
        const graduatedRecord = {
            entrySignalId: qualifiedRecord.entrySignalId,
            qualifiedRecordId: qualifiedRecord.entrySignalId,
            
            instrument: qualifiedRecord.instrument,
            direction: qualifiedRecord.direction,
            
            graduatedFeatures: JSON.stringify(graduationResult.featureVector),
            featureNames: JSON.stringify(graduationResult.featureNames),
            featureVector: this.encodeFeatureVector(graduationResult.featureVector),
            
            pnlLabel: qualifiedRecord.pnl,
            profitableLabel: qualifiedRecord.pnl > 0 ? 1 : 0,
            trajectoryLabel: qualifiedRecord.trajectoryData || null,
            
            graduationTimestamp: Date.now(),
            trainingWeight: this.calculateTrainingWeight(qualifiedRecord),
            
            usedInTraining: 0,
            lastTrainingRun: null
        };
        
        // Store graduated record
        await this.storage.storeGraduatedRecord(graduatedRecord);
        
        console.log(`[OFFLINE-PROCESSOR] Graduated record ${qualifiedRecord.entrySignalId} with ${graduationResult.featureNames.length} features`);
        return true;
    }

    // Generate graduated features for a specific instrument/direction
    async generateGraduatedFeatures(features, instrument, direction) {
        // Get instrument-specific feature importance
        const featureImportance = await this.getFeatureImportance(instrument, direction);
        
        // Define graduated feature set (ordered by importance)
        const graduatedFeatureNames = [
            'rsi_14', 'momentum_5', 'atr_percentage', 'bb_position',
            'volume_spike_3bar', 'bb_width', 'ema_spread_pct',
            'range_expansion', 'body_ratio', 'upper_wick_ratio',
            'lower_wick_ratio', 'macd_histogram', 'stoch_k', 'williams_r'
        ];
        
        const featureVector = [];
        const availableFeatures = [];
        
        // Extract features in graduated order
        for (const featureName of graduatedFeatureNames) {
            if (features[featureName] !== undefined) {
                featureVector.push(features[featureName]);
                availableFeatures.push(featureName);
            } else {
                // Use feature importance to decide if we should impute or skip
                const importance = featureImportance[featureName] || 0;
                
                if (importance > 0.1) { // Important feature - impute with mean
                    const imputedValue = await this.imputeFeatureValue(featureName, instrument, direction);
                    featureVector.push(imputedValue);
                    availableFeatures.push(featureName);
                }
                // Skip less important features
            }
        }
        
        const completeness = availableFeatures.length / graduatedFeatureNames.length;
        
        return {
            featureVector,
            featureNames: availableFeatures,
            completeness,
            instrumentSpecific: true
        };
    }

    // Get feature importance for instrument/direction
    async getFeatureImportance(instrument, direction) {
        // This would be loaded from historical analysis
        // For now, return default importance scores
        return {
            'rsi_14': 0.85,
            'momentum_5': 0.80,
            'atr_percentage': 0.75,
            'bb_position': 0.70,
            'volume_spike_3bar': 0.65,
            'bb_width': 0.60,
            'ema_spread_pct': 0.55,
            'range_expansion': 0.50,
            'body_ratio': 0.45,
            'upper_wick_ratio': 0.40,
            'lower_wick_ratio': 0.35,
            'macd_histogram': 0.30,
            'stoch_k': 0.25,
            'williams_r': 0.20
        };
    }

    // Impute missing feature values
    async imputeFeatureValue(featureName, instrument, direction) {
        // This would use historical data to impute missing values
        // For now, return feature-specific defaults
        const defaults = {
            'rsi_14': 50,
            'momentum_5': 0,
            'atr_percentage': 0.002,
            'bb_position': 0.5,
            'volume_spike_3bar': 1.0,
            'bb_width': 0.02,
            'ema_spread_pct': 0,
            'range_expansion': 1.0,
            'body_ratio': 0.5,
            'upper_wick_ratio': 0.1,
            'lower_wick_ratio': 0.1,
            'macd_histogram': 0,
            'stoch_k': 50,
            'williams_r': -50
        };
        
        return defaults[featureName] || 0;
    }

    calculateTrainingWeight(qualifiedRecord) {
        // Calculate training weight based on record quality
        let weight = 1.0;
        
        // Boost weight for higher quality records
        if (qualifiedRecord.featureQuality > 0.8) {
            weight *= 1.2;
        }
        
        // Boost weight for higher fuzzy match scores
        if (qualifiedRecord.fuzzyScore > 0.8) {
            weight *= 1.1;
        }
        
        // Reduce weight for older records (time decay)
        const age = (Date.now() - qualifiedRecord.timestamp) / (1000 * 60 * 60 * 24); // days
        if (age > 30) {
            weight *= 0.9;
        }
        
        return Math.max(0.1, Math.min(2.0, weight));
    }

    encodeFeatureVector(features) {
        // Encode features as binary for efficient storage
        const buffer = Buffer.allocUnsafe(features.length * 4);
        
        for (let i = 0; i < features.length; i++) {
            buffer.writeFloatLE(features[i], i * 4);
        }
        
        return buffer;
    }

    // Get qualified records ready for graduation
    async getQualifiedRecords() {
        // This would query the qualified table
        // For now, return mock data
        return Array.from(this.storage.qualifiedTable.records.values())
            .filter(record => !record.graduated);
    }

    // Cleanup old records and optimize storage
    async cleanup() {
        console.log('[OFFLINE-PROCESSOR] Running cleanup...');
        
        // Remove old raw records that have been processed
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        
        let cleanedCount = 0;
        for (const [id, record] of this.storage.rawTable.records) {
            if (record.processed && record.timestamp < cutoffTime) {
                this.storage.rawTable.records.delete(id);
                cleanedCount++;
            }
        }
        
        console.log(`[OFFLINE-PROCESSOR] Cleaned ${cleanedCount} old raw records`);
        
        // Optimize indexes
        await this.optimizeIndexes();
        
        return { cleanedRecords: cleanedCount };
    }

    async optimizeIndexes() {
        // Rebuild indexes for better performance
        console.log('[OFFLINE-PROCESSOR] Optimizing indexes...');
        
        // This would rebuild database indexes
        // For now, just log the action
        console.log('[OFFLINE-PROCESSOR] Indexes optimized');
    }

    // Get current processing status
    getStatus() {
        return {
            initialized: this.storage.initialized,
            processing: this.processing,
            autoProcessing: !!this.processingTimer,
            config: this.config,
            stats: this.getProcessingStats()
        };
    }

    getProcessingStats() {
        const storageStats = this.storage.getProcessingStats();
        
        return {
            ...this.processingStats,
            storage: storageStats
        };
    }

    // Manual trigger for processing
    async triggerProcessing() {
        if (this.processing) {
            throw new Error('Processing already in progress');
        }
        
        return await this.processAll();
    }

    // Configure processing parameters
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[OFFLINE-PROCESSOR] Configuration updated:', newConfig);
        
        // Restart auto-processing if interval changed
        if (newConfig.processingInterval && this.processingTimer) {
            this.stopAutoProcessing();
            this.startAutoProcessing();
        }
    }

    // Get qualified training data for Risk Agent
    async getQualifiedTrainingData(filters = {}) {
        const { instrument, direction, limit = 1000 } = filters;
        
        let qualifiedRecords = Array.from(this.storage.qualifiedTable.records.values());
        
        // Apply filters
        if (instrument) {
            qualifiedRecords = qualifiedRecords.filter(record => 
                record.instrument.startsWith(instrument)
            );
        }
        
        if (direction) {
            qualifiedRecords = qualifiedRecords.filter(record => 
                record.direction === direction
            );
        }
        
        // Sort by qualification score (best first)
        qualifiedRecords.sort((a, b) => b.qualificationScore - a.qualificationScore);
        
        // Limit results
        return qualifiedRecords.slice(0, limit);
    }

    // Get graduated features for ML training
    async getGraduatedFeatures(filters = {}) {
        const { instrument, direction, limit = 1000 } = filters;
        
        let graduatedRecords = Array.from(this.storage.graduatedTable.records.values());
        
        // Apply filters
        if (instrument) {
            graduatedRecords = graduatedRecords.filter(record => 
                record.instrument.startsWith(instrument)
            );
        }
        
        if (direction) {
            graduatedRecords = graduatedRecords.filter(record => 
                record.direction === direction
            );
        }
        
        // Sort by training weight (best first)
        graduatedRecords.sort((a, b) => b.trainingWeight - a.trainingWeight);
        
        // Limit results
        return graduatedRecords.slice(0, limit);
    }
}

module.exports = OfflineProcessor;