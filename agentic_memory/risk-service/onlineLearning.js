/**
 * Online Learning Module for GP Service
 * Handles continuous learning from new trade outcomes
 */

class OnlineLearning {
  constructor(gpIntegration, confidenceEngine, abTesting = null) {
    this.gpIntegration = gpIntegration;
    this.confidenceEngine = confidenceEngine;
    this.abTesting = abTesting;
    
    // Learning configuration
    this.config = {
      min_trades_before_update: 5,      // Minimum trades before model update
      update_frequency_minutes: 120,    // How often to retrain models (2 hours)
      batch_size: 30,                   // Batch size for updates
      confidence_calibration_enabled: true,
      trajectory_learning_enabled: true,
      use_bar_time: true                // Use bar timestamp instead of server time
    };
    
    // Track pending updates
    this.pendingUpdates = new Map(); // key: instrument_direction, value: array of trade data
    this.lastUpdateTimes = new Map();
    
    console.log('[ONLINE-LEARNING] Initialized with GP integration');
  }

  /**
   * Process new trade outcome for online learning
   */
  async processTradeOutcome(tradeData) {
    try {
      const {
        entrySignalId,
        instrument,
        direction,
        features,
        actualPnl,
        actualTrajectory,
        exitReason,
        predictedConfidence,
        predictionMethod
      } = tradeData;

      console.log(`[ONLINE-LEARNING] Processing outcome for ${entrySignalId}: PnL=$${actualPnl?.toFixed(2)}, Method=${predictionMethod}`);

      // 1. Update confidence calibration
      if (this.config.confidence_calibration_enabled && predictedConfidence !== undefined) {
        this.updateConfidenceCalibration(instrument, direction, predictedConfidence, actualPnl);
      }

      // 2. Record A/B test outcome
      if (this.abTesting && entrySignalId) {
        this.abTesting.recordOutcome(entrySignalId, actualPnl, actualTrajectory, exitReason);
      }

      // 3. Queue for GP model update (if GP was used)
      if (predictionMethod === 'gaussian_process' && this.gpIntegration) {
        await this.queueGPUpdate(instrument, direction, features, actualPnl, actualTrajectory);
      }

      // 4. Check if batch update needed (pass current bar timestamp)
      await this.checkBatchUpdateNeeded(instrument, direction, tradeData.timestamp);

      console.log(`[ONLINE-LEARNING] Outcome processed successfully for ${entrySignalId}`);

    } catch (error) {
      console.error(`[ONLINE-LEARNING] Failed to process trade outcome:`, error);
    }
  }

  /**
   * Update confidence calibration with actual outcome
   */
  updateConfidenceCalibration(instrument, direction, predictedConfidence, actualPnl) {
    if (this.confidenceEngine) {
      this.confidenceEngine.updateCalibration(
        instrument,
        direction,
        predictedConfidence,
        actualPnl
      );
      
      console.log(`[ONLINE-LEARNING] Confidence calibration updated for ${instrument}_${direction}`);
    }
  }

  /**
   * Queue GP model update
   */
  async queueGPUpdate(instrument, direction, features, actualPnl, actualTrajectory) {
    try {
      const cleanInstrument = this.gpIntegration.cleanInstrumentName(instrument);
      const key = `${cleanInstrument}_${direction}`;
      
      // Initialize queue if needed
      if (!this.pendingUpdates.has(key)) {
        this.pendingUpdates.set(key, []);
      }
      
      // Add to queue
      const updateData = {
        timestamp: new Date().toISOString(),
        features,
        actualPnl,
        actualTrajectory
      };
      
      this.pendingUpdates.get(key).push(updateData);
      
      console.log(`[ONLINE-LEARNING] Queued GP update for ${key}: ${this.pendingUpdates.get(key).length} pending updates`);
      
      // Immediate single-point update to GP service
      await this.gpIntegration.updateGPModel(
        cleanInstrument,
        direction,
        features,
        actualPnl,
        actualTrajectory
      );
      
    } catch (error) {
      console.error(`[ONLINE-LEARNING] Failed to queue GP update:`, error);
    }
  }

  /**
   * Check if batch update is needed (based on bar time, not server time)
   */
  async checkBatchUpdateNeeded(instrument, direction, currentBarTimestamp = null) {
    const cleanInstrument = this.gpIntegration?.cleanInstrumentName(instrument) || instrument;
    const key = `${cleanInstrument}_${direction}`;
    
    const pendingCount = this.pendingUpdates.get(key)?.length || 0;
    const lastUpdate = this.lastUpdateTimes.get(key);
    
    // Calculate time difference using bar timestamps
    let minutesSinceUpdate = 999;
    if (lastUpdate && currentBarTimestamp) {
      const currentBarTime = new Date(currentBarTimestamp).getTime();
      const lastUpdateTime = lastUpdate.getTime();
      minutesSinceUpdate = (currentBarTime - lastUpdateTime) / (1000 * 60);
    }
    
    const shouldUpdate = 
      (pendingCount >= this.config.batch_size) ||
      (pendingCount >= this.config.min_trades_before_update && 
       minutesSinceUpdate >= this.config.update_frequency_minutes);
    
    if (shouldUpdate) {
      console.log(`[ONLINE-LEARNING] Triggering async batch update for ${key}: ${pendingCount} updates, ${minutesSinceUpdate.toFixed(1)}min since last update (bar time)`);
      
      // ASYNC: Don't await - let training happen in background
      this.performBatchUpdateAsync(key, currentBarTimestamp);
    }
  }

  /**
   * Perform batch model update (async version - non-blocking)
   */
  performBatchUpdateAsync(key, currentBarTimestamp = null) {
    // Run training in background without blocking
    this.performBatchUpdate(key, currentBarTimestamp).catch(error => {
      console.error(`[ONLINE-LEARNING] Async batch update failed for ${key}:`, error);
    });
  }

  /**
   * Perform batch model update
   */
  async performBatchUpdate(key, currentBarTimestamp = null) {
    try {
      const [instrument, direction] = key.split('_');
      const pendingUpdates = this.pendingUpdates.get(key) || [];
      
      if (pendingUpdates.length === 0) {
        console.log(`[ONLINE-LEARNING] No pending updates for ${key}`);
        return;
      }
      
      console.log(`[ONLINE-LEARNING] Starting batch update for ${key} with ${pendingUpdates.length} samples`);
      
      // Prepare batch training data
      const batchData = {
        features: pendingUpdates.map(u => u.features),
        pnl_targets: pendingUpdates.map(u => u.actualPnl),
        trajectory_targets: pendingUpdates
          .filter(u => u.actualTrajectory)
          .map(u => u.actualTrajectory),
        timestamps: pendingUpdates.map(u => u.timestamp)
      };
      
      // Retrain GP model with new data
      if (this.gpIntegration) {
        const result = await this.gpIntegration.trainGPModel(instrument, direction, batchData);
        
        if (result.success) {
          console.log(`[ONLINE-LEARNING] Batch update completed for ${key}: ${result.sample_count} samples trained`);
          
          // Clear pending updates and update timestamp (use bar time if provided)
          this.pendingUpdates.set(key, []);
          const updateTime = currentBarTimestamp ? new Date(currentBarTimestamp) : new Date();
          this.lastUpdateTimes.set(key, updateTime);
          
          console.log(`[ONLINE-LEARNING] Next update for ${key} scheduled for: ${new Date(updateTime.getTime() + this.config.update_frequency_minutes * 60 * 1000).toISOString()} (bar time)`);
          
        } else {
          console.error(`[ONLINE-LEARNING] Batch update failed for ${key}:`, result.error);
        }
      }
      
    } catch (error) {
      console.error(`[ONLINE-LEARNING] Batch update error for ${key}:`, error);
    }
  }

  /**
   * Force model retraining for specific instrument+direction
   */
  async forceModelUpdate(instrument, direction) {
    const cleanInstrument = this.gpIntegration?.cleanInstrumentName(instrument) || instrument;
    const key = `${cleanInstrument}_${direction}`;
    
    console.log(`[ONLINE-LEARNING] Forcing model update for ${key}`);
    await this.performBatchUpdate(key);
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    const stats = {
      pending_updates: {},
      last_update_times: {},
      confidence_stats: {},
      total_pending: 0
    };
    
    // Pending updates
    for (const [key, updates] of this.pendingUpdates) {
      stats.pending_updates[key] = updates.length;
      stats.total_pending += updates.length;
    }
    
    // Last update times
    for (const [key, time] of this.lastUpdateTimes) {
      stats.last_update_times[key] = time.toISOString();
    }
    
    // Confidence calibration stats
    if (this.confidenceEngine) {
      stats.confidence_stats = this.confidenceEngine.getConfidenceStats();
    }
    
    return stats;
  }

  /**
   * Process historical trades for initial calibration
   */
  async processHistoricalTrades(historicalTrades) {
    console.log(`[ONLINE-LEARNING] Processing ${historicalTrades.length} historical trades for calibration`);
    
    let processed = 0;
    let calibrationUpdates = 0;
    
    for (const trade of historicalTrades) {
      try {
        // Update confidence calibration if we have prediction data
        if (trade.predictedConfidence !== undefined && trade.actualPnl !== undefined) {
          this.updateConfidenceCalibration(
            trade.instrument,
            trade.direction,
            trade.predictedConfidence,
            trade.actualPnl
          );
          calibrationUpdates++;
        }
        
        processed++;
        
        if (processed % 100 === 0) {
          console.log(`[ONLINE-LEARNING] Processed ${processed}/${historicalTrades.length} historical trades`);
        }
        
      } catch (error) {
        console.error(`[ONLINE-LEARNING] Error processing historical trade:`, error);
      }
    }
    
    console.log(`[ONLINE-LEARNING] Historical processing complete: ${processed} trades, ${calibrationUpdates} calibration updates`);
  }

  /**
   * Clean up old pending updates (prevent memory leaks)
   */
  cleanupOldUpdates() {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTime = Date.now() - maxAge;
    
    for (const [key, updates] of this.pendingUpdates) {
      const filteredUpdates = updates.filter(update => {
        const updateTime = new Date(update.timestamp).getTime();
        return updateTime > cutoffTime;
      });
      
      if (filteredUpdates.length !== updates.length) {
        this.pendingUpdates.set(key, filteredUpdates);
        console.log(`[ONLINE-LEARNING] Cleaned up ${updates.length - filteredUpdates.length} old updates for ${key}`);
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup() {
    // Clean up every 6 hours
    setInterval(() => {
      this.cleanupOldUpdates();
    }, 6 * 60 * 60 * 1000);
    
    console.log('[ONLINE-LEARNING] Periodic cleanup started (every 6 hours)');
  }

  /**
   * Export learning data for analysis
   */
  exportLearningData() {
    return {
      config: this.config,
      pending_updates: Object.fromEntries(this.pendingUpdates),
      last_update_times: Object.fromEntries(
        Array.from(this.lastUpdateTimes.entries()).map(([k, v]) => [k, v.toISOString()])
      ),
      stats: this.getLearningStats()
    };
  }
}

module.exports = OnlineLearning;