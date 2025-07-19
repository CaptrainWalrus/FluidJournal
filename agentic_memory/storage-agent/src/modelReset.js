/**
 * Model Reset and Clean Retraining Utility
 * Handles complete model wipeout and fresh training data collection
 */

class ModelReset {
    constructor(vectorStore, offlineProcessor) {
        this.vectorStore = vectorStore;
        this.offlineProcessor = offlineProcessor;
        this.resetState = {
            isReset: false,
            resetTimestamp: null,
            collectingFreshData: false,
            minTradesRequired: 100, // Minimum trades before retraining
            freshTradeCount: 0
        };
    }

    // STEP 1: Complete model and data wipeout
    async performCompleteReset() {
        console.log('🔥 [MODEL-RESET] Starting complete model reset...');
        
        try {
            // 1. Wipe all vector storage
            await this.wipeVectorStorage();
            
            // 2. Wipe offline storage tables
            await this.wipeOfflineStorage();
            
            // 3. Reset training state
            this.resetTrainingState();
            
            // 4. Mark system as in reset mode
            this.resetState.isReset = true;
            this.resetState.resetTimestamp = Date.now();
            this.resetState.collectingFreshData = true;
            this.resetState.freshTradeCount = 0;
            
            console.log('✅ [MODEL-RESET] Complete reset successful');
            console.log('🎯 [MODEL-RESET] System now in FRESH DATA COLLECTION mode');
            console.log(`📊 [MODEL-RESET] Need ${this.resetState.minTradesRequired} fresh trades before retraining`);
            
            return {
                success: true,
                resetTimestamp: this.resetState.resetTimestamp,
                message: 'Complete model reset successful - collecting fresh data'
            };
            
        } catch (error) {
            console.error('❌ [MODEL-RESET] Reset failed:', error.message);
            throw error;
        }
    }

    // Wipe vector storage (LanceDB)
    async wipeVectorStorage() {
        console.log('🗑️ [MODEL-RESET] Wiping vector storage...');
        
        try {
            // Get all vectors
            const vectors = await this.vectorStore.getVectors({ limit: 100000 });
            console.log(`📊 [MODEL-RESET] Found ${vectors.length} vectors to delete`);
            
            // Delete all vectors
            let deletedCount = 0;
            for (const vector of vectors) {
                try {
                    await this.vectorStore.deleteVector(vector.id);
                    deletedCount++;
                } catch (error) {
                    console.error(`❌ [MODEL-RESET] Failed to delete vector ${vector.id}:`, error.message);
                }
            }
            
            console.log(`✅ [MODEL-RESET] Deleted ${deletedCount}/${vectors.length} vectors`);
            
        } catch (error) {
            console.error('❌ [MODEL-RESET] Vector storage wipe failed:', error.message);
            throw error;
        }
    }

    // Wipe offline storage tables
    async wipeOfflineStorage() {
        console.log('🗑️ [MODEL-RESET] Wiping offline storage...');
        
        try {
            // Clear all offline storage tables
            this.offlineProcessor.storage.rawTable.records.clear();
            this.offlineProcessor.storage.qualifiedTable.records.clear();
            this.offlineProcessor.storage.graduatedTable.records.clear();
            
            // Reset indexes
            for (const table of [
                this.offlineProcessor.storage.rawTable,
                this.offlineProcessor.storage.qualifiedTable,
                this.offlineProcessor.storage.graduatedTable
            ]) {
                for (const index of Object.values(table.indexes)) {
                    index.clear();
                }
            }
            
            // Reset processing stats
            this.offlineProcessor.processingStats = {
                totalProcessed: 0,
                totalQualified: 0,
                totalGraduated: 0,
                lastRun: null,
                processingTime: 0
            };
            
            console.log('✅ [MODEL-RESET] Offline storage wiped successfully');
            
        } catch (error) {
            console.error('❌ [MODEL-RESET] Offline storage wipe failed:', error.message);
            throw error;
        }
    }

    // Reset training state
    resetTrainingState() {
        console.log('🔄 [MODEL-RESET] Resetting training state...');
        
        // Any additional training state reset logic would go here
        // For example, clearing model caches, resetting confidence engines, etc.
        
        console.log('✅ [MODEL-RESET] Training state reset');
    }

    // STEP 2: Store fresh trade (only features, NO outcomes from old model)
    async storeFreshTrade(tradeData) {
        if (!this.resetState.collectingFreshData) {
            throw new Error('System not in fresh data collection mode');
        }
        
        console.log(`🆕 [FRESH-DATA] Storing fresh trade: ${tradeData.entrySignalId}`);
        
        // Store only the entry data (features, setup) - NO outcomes yet
        const freshRecord = {
            entrySignalId: tradeData.entrySignalId,
            timestamp: tradeData.timestamp || Date.now(),
            
            // Trade setup (no model influence)
            instrument: tradeData.instrument,
            direction: tradeData.direction,
            entryType: tradeData.entryType,
            entryPrice: tradeData.entryPrice,
            
            // Raw features (no model processing)
            featuresJson: JSON.stringify(tradeData.features || {}),
            featureCount: Object.keys(tradeData.features || {}).length,
            
            // NO OUTCOMES YET - these will be added when trade completes
            pnl: null,
            exitPrice: null,
            exitReason: null,
            profitByBarJson: null,
            
            // Mark as fresh data
            isFreshData: true,
            resetTimestamp: this.resetState.resetTimestamp,
            
            // Processing status
            processed: 0,
            qualified: 0,
            graduated: 0
        };
        
        // Store in raw table
        await this.offlineProcessor.storage.storeRawRecord(freshRecord);
        
        this.resetState.freshTradeCount++;
        
        console.log(`📊 [FRESH-DATA] Fresh trades collected: ${this.resetState.freshTradeCount}/${this.resetState.minTradesRequired}`);
        
        return {
            success: true,
            freshTradeCount: this.resetState.freshTradeCount,
            readyForRetraining: this.resetState.freshTradeCount >= this.resetState.minTradesRequired
        };
    }

    // STEP 3: Update trade outcome (when trade actually completes)
    async updateTradeOutcome(entrySignalId, outcomeData) {
        if (!this.resetState.collectingFreshData) {
            throw new Error('System not in fresh data collection mode');
        }
        
        console.log(`📈 [FRESH-OUTCOME] Updating outcome for: ${entrySignalId}`);
        
        try {
            // Find the raw record
            const rawRecord = this.offlineProcessor.storage.rawTable.records.get(entrySignalId);
            
            if (!rawRecord) {
                throw new Error(`Raw record not found: ${entrySignalId}`);
            }
            
            if (!rawRecord.isFreshData) {
                throw new Error(`Not a fresh data record: ${entrySignalId}`);
            }
            
            // Update with actual outcome (no model bias)
            rawRecord.pnl = outcomeData.pnl;
            rawRecord.exitPrice = outcomeData.exitPrice;
            rawRecord.exitReason = outcomeData.exitReason;
            rawRecord.profitByBarJson = JSON.stringify(outcomeData.profitByBar || {});
            rawRecord.updatedAt = Date.now();
            
            console.log(`✅ [FRESH-OUTCOME] Updated ${entrySignalId}: PnL=$${outcomeData.pnl}`);
            
            return {
                success: true,
                entrySignalId,
                pnl: outcomeData.pnl
            };
            
        } catch (error) {
            console.error(`❌ [FRESH-OUTCOME] Failed to update outcome for ${entrySignalId}:`, error.message);
            throw error;
        }
    }

    // STEP 4: Check if ready for retraining
    isReadyForRetraining() {
        if (!this.resetState.collectingFreshData) {
            return { ready: false, reason: 'Not in fresh data collection mode' };
        }
        
        const completedTrades = this.getCompletedFreshTrades();
        const readyCount = completedTrades.length;
        
        if (readyCount >= this.resetState.minTradesRequired) {
            return {
                ready: true,
                freshTrades: readyCount,
                message: `Ready for retraining with ${readyCount} fresh trades`
            };
        } else {
            return {
                ready: false,
                freshTrades: readyCount,
                needed: this.resetState.minTradesRequired - readyCount,
                reason: `Need ${this.resetState.minTradesRequired - readyCount} more completed trades`
            };
        }
    }

    // Get completed fresh trades (with outcomes)
    getCompletedFreshTrades() {
        const allRecords = Array.from(this.offlineProcessor.storage.rawTable.records.values());
        
        return allRecords.filter(record => 
            record.isFreshData && 
            record.resetTimestamp === this.resetState.resetTimestamp &&
            record.pnl !== null && record.pnl !== undefined
        );
    }

    // STEP 5: Begin retraining with fresh data
    async beginRetraining() {
        const readyCheck = this.isReadyForRetraining();
        
        if (!readyCheck.ready) {
            throw new Error(`Not ready for retraining: ${readyCheck.reason}`);
        }
        
        console.log('🎯 [RETRAINING] Starting fresh model training...');
        console.log(`📊 [RETRAINING] Using ${readyCheck.freshTrades} fresh trades`);
        
        try {
            // 1. Process fresh data through qualification pipeline
            console.log('🔄 [RETRAINING] Processing fresh data...');
            const processingResult = await this.offlineProcessor.processAll();
            
            console.log(`✅ [RETRAINING] Processing complete: ${processingResult.stage1.qualified} qualified, ${processingResult.stage2.graduated} graduated`);
            
            // 2. Generate training statistics
            const trainingStats = await this.generateTrainingStats();
            
            // 3. Mark system as ready for fresh model training
            this.resetState.collectingFreshData = false;
            this.resetState.isReset = false;
            
            console.log('🎉 [RETRAINING] Fresh training data ready!');
            console.log('🤖 [RETRAINING] System ready for clean model training');
            
            return {
                success: true,
                freshTrades: readyCheck.freshTrades,
                qualified: processingResult.stage1.qualified,
                graduated: processingResult.stage2.graduated,
                trainingStats,
                message: 'Fresh training data processed and ready for model training'
            };
            
        } catch (error) {
            console.error('❌ [RETRAINING] Fresh training failed:', error.message);
            throw error;
        }
    }

    // Generate training statistics
    async generateTrainingStats() {
        const completedTrades = this.getCompletedFreshTrades();
        
        const stats = {
            totalTrades: completedTrades.length,
            profitable: completedTrades.filter(t => t.pnl > 0).length,
            unprofitable: completedTrades.filter(t => t.pnl <= 0).length,
            avgPnL: completedTrades.reduce((sum, t) => sum + t.pnl, 0) / completedTrades.length,
            instruments: [...new Set(completedTrades.map(t => t.instrument))],
            directions: {
                long: completedTrades.filter(t => t.direction === 'long').length,
                short: completedTrades.filter(t => t.direction === 'short').length
            },
            entryTypes: {}
        };
        
        // Count entry types
        for (const trade of completedTrades) {
            const entryType = trade.entryType || 'unknown';
            stats.entryTypes[entryType] = (stats.entryTypes[entryType] || 0) + 1;
        }
        
        stats.winRate = stats.profitable / stats.totalTrades;
        
        return stats;
    }

    // Get current reset status
    getResetStatus() {
        return {
            ...this.resetState,
            completedTrades: this.getCompletedFreshTrades().length,
            readyForRetraining: this.isReadyForRetraining()
        };
    }

    // Configure minimum trades required
    setMinTradesRequired(count) {
        this.resetState.minTradesRequired = count;
        console.log(`🔧 [MODEL-RESET] Minimum trades required set to: ${count}`);
    }
}

module.exports = ModelReset;