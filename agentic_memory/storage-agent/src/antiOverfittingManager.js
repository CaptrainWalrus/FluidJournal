/**
 * Anti-Overfitting Manager
 * Implements diminishing returns for repeated patterns to prevent overfitting
 * during backtests and training on the same data
 */

class AntiOverfittingManager {
    constructor() {
        // Pattern exposure tracking
        this.patternExposureMap = new Map(); // entrySignalId -> exposure count
        this.timeWindowExposure = new Map(); // time window -> pattern IDs seen
        this.backtestContext = null; // Current backtest context
        
        // Overfitting prevention settings
        this.maxExposureCount = 5; // Maximum times a pattern can be used
        this.diminishingFactor = 0.8; // Confidence reduction factor per exposure
        this.timeWindowMinutes = 60; // Time window for pattern clustering
        
        // Backtest isolation
        this.backtestStartTime = null;
        this.trainingCutoffDate = new Date('2024-12-31T23:59:59.999Z');
        this.isBacktestMode = false;
        
        console.log('[ANTI-OVERFITTING] Initialized with diminishing returns system');
    }

    /**
     * Start backtest mode to isolate learning
     */
    startBacktest(startDate, endDate, resetLearning = true) {
        this.isBacktestMode = true;
        this.backtestStartTime = new Date(startDate);
        this.backtestContext = {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            patternsUsed: new Set(),
            confidenceAdjustments: new Map()
        };
        
        if (resetLearning) {
            console.log('[ANTI-OVERFITTING] 🔄 Backtest started with learning reset');
            this.resetExposureTracking();
        } else {
            console.log('[ANTI-OVERFITTING] 🔄 Backtest started with persistent learning');
        }
        
        return {
            backtestId: this.generateBacktestId(startDate, endDate),
            isolatedLearning: resetLearning,
            startTime: this.backtestStartTime
        };
    }

    /**
     * End backtest mode and return to live trading
     */
    endBacktest() {
        const stats = this.getBacktestStats();
        
        this.isBacktestMode = false;
        this.backtestStartTime = null;
        this.backtestContext = null;
        
        console.log('[ANTI-OVERFITTING] 🎯 Backtest ended:', stats);
        return stats;
    }

    /**
     * Check if a pattern should be allowed based on anti-overfitting rules
     */
    shouldAllowPattern(entrySignalId, timestamp, features) {
        const patternTime = new Date(timestamp);
        
        // 1. Check backtest isolation rules
        if (this.isBacktestMode && !this.isValidBacktestPattern(patternTime)) {
            return {
                allowed: false,
                reason: 'Pattern outside backtest date range',
                confidence: 0,
                adjustmentType: 'BACKTEST_ISOLATION'
            };
        }

        // 2. Check for training/testing data leakage
        if (this.hasDataLeakage(patternTime)) {
            return {
                allowed: false,
                reason: 'Data leakage detected - future data in training',
                confidence: 0,
                adjustmentType: 'DATA_LEAKAGE'
            };
        }

        // 3. Calculate pattern exposure and apply diminishing returns
        const exposure = this.getPatternExposure(entrySignalId);
        const diminishedConfidence = this.calculateDiminishedConfidence(exposure);
        
        // 4. Check time window clustering
        const timeWindow = this.getTimeWindow(patternTime);
        const isClusteredPattern = this.isPatternClustered(entrySignalId, timeWindow);
        
        let finalConfidence = diminishedConfidence;
        let adjustmentType = 'DIMINISHING_RETURNS';
        let reason = `Pattern exposure: ${exposure}, confidence: ${(finalConfidence * 100).toFixed(1)}%`;
        
        // Apply clustering penalty
        if (isClusteredPattern) {
            finalConfidence *= 0.7; // 30% penalty for clustered patterns
            adjustmentType = 'CLUSTERING_PENALTY';
            reason += ' (clustered)';
        }

        // Final decision
        const allowed = finalConfidence > 0.1; // Minimum threshold
        
        if (allowed) {
            this.recordPatternUsage(entrySignalId, timeWindow);
        }

        return {
            allowed,
            reason,
            confidence: finalConfidence,
            adjustmentType,
            exposure,
            originalConfidence: 1.0,
            diminishingFactor: this.diminishingFactor
        };
    }

    /**
     * Check if pattern is valid for current backtest
     */
    isValidBacktestPattern(patternTime) {
        if (!this.isBacktestMode || !this.backtestContext) return true;
        
        return patternTime >= this.backtestContext.startDate && 
               patternTime <= this.backtestContext.endDate;
    }

    /**
     * Detect data leakage (using future data in training)
     */
    hasDataLeakage(patternTime) {
        if (!this.isBacktestMode) return false;
        
        // If we're in backtest mode and pattern is from after training cutoff,
        // but we're testing on dates before the pattern time, that's leakage
        if (patternTime > this.trainingCutoffDate && 
            this.backtestStartTime < patternTime) {
            return true;
        }
        
        return false;
    }

    /**
     * Get pattern exposure count
     */
    getPatternExposure(entrySignalId) {
        return this.patternExposureMap.get(entrySignalId) || 0;
    }

    /**
     * Calculate diminished confidence based on exposure
     */
    calculateDiminishedConfidence(exposure) {
        if (exposure === 0) return 1.0; // First exposure - full confidence
        
        // Apply exponential decay
        const diminished = Math.pow(this.diminishingFactor, exposure);
        
        // Minimum confidence floor
        return Math.max(0.05, diminished);
    }

    /**
     * Get time window for pattern clustering
     */
    getTimeWindow(timestamp) {
        const time = new Date(timestamp);
        const windowStart = new Date(time);
        windowStart.setMinutes(0, 0, 0); // Round to hour
        
        return windowStart.getTime();
    }

    /**
     * Check if pattern is clustered in time window
     */
    isPatternClustered(entrySignalId, timeWindow) {
        const windowPatterns = this.timeWindowExposure.get(timeWindow) || new Set();
        return windowPatterns.has(entrySignalId);
    }

    /**
     * Record pattern usage for tracking
     */
    recordPatternUsage(entrySignalId, timeWindow) {
        // Increment exposure count
        const currentExposure = this.patternExposureMap.get(entrySignalId) || 0;
        this.patternExposureMap.set(entrySignalId, currentExposure + 1);
        
        // Track time window usage
        if (!this.timeWindowExposure.has(timeWindow)) {
            this.timeWindowExposure.set(timeWindow, new Set());
        }
        this.timeWindowExposure.get(timeWindow).add(entrySignalId);
        
        // Track in backtest context
        if (this.backtestContext) {
            this.backtestContext.patternsUsed.add(entrySignalId);
        }
        
        console.log(`[ANTI-OVERFITTING] Pattern ${entrySignalId} used (exposure: ${currentExposure + 1})`);
    }

    /**
     * Reset exposure tracking (for new backtests)
     */
    resetExposureTracking() {
        this.patternExposureMap.clear();
        this.timeWindowExposure.clear();
        console.log('[ANTI-OVERFITTING] 🧹 Exposure tracking reset');
    }

    /**
     * Generate unique backtest ID
     */
    generateBacktestId(startDate, endDate) {
        const start = new Date(startDate).toISOString().split('T')[0];
        const end = new Date(endDate).toISOString().split('T')[0];
        return `BT_${start}_${end}_${Date.now()}`;
    }

    /**
     * Get current backtest statistics
     */
    getBacktestStats() {
        if (!this.backtestContext) {
            return {
                isBacktest: false,
                message: 'Not in backtest mode'
            };
        }
        
        return {
            isBacktest: true,
            startDate: this.backtestContext.startDate,
            endDate: this.backtestContext.endDate,
            patternsUsed: this.backtestContext.patternsUsed.size,
            totalExposures: this.patternExposureMap.size,
            timeWindows: this.timeWindowExposure.size,
            avgExposurePerPattern: this.calculateAverageExposure()
        };
    }

    /**
     * Calculate average exposure per pattern
     */
    calculateAverageExposure() {
        if (this.patternExposureMap.size === 0) return 0;
        
        const totalExposure = Array.from(this.patternExposureMap.values())
            .reduce((sum, exposure) => sum + exposure, 0);
        
        return totalExposure / this.patternExposureMap.size;
    }

    /**
     * Apply anti-overfitting adjustment to confidence score
     */
    applyAntiOverfittingAdjustment(baseConfidence, entrySignalId, timestamp, features) {
        const result = this.shouldAllowPattern(entrySignalId, timestamp, features);
        
        if (!result.allowed) {
            return {
                adjustedConfidence: 0,
                adjustment: result,
                blocked: true
            };
        }
        
        // Apply diminishing returns to base confidence
        const adjustedConfidence = baseConfidence * result.confidence;
        
        return {
            adjustedConfidence,
            adjustment: result,
            blocked: false,
            originalConfidence: baseConfidence,
            diminishingFactor: result.confidence
        };
    }

    /**
     * Get exposure report for analysis
     */
    getExposureReport() {
        const report = {
            totalPatterns: this.patternExposureMap.size,
            averageExposure: this.calculateAverageExposure(),
            maxExposure: 0,
            overExposedPatterns: 0,
            exposureDistribution: {},
            timeWindowCoverage: this.timeWindowExposure.size,
            isBacktestMode: this.isBacktestMode
        };
        
        // Analyze exposure distribution
        for (const [patternId, exposure] of this.patternExposureMap) {
            if (exposure > report.maxExposure) {
                report.maxExposure = exposure;
            }
            
            if (exposure > this.maxExposureCount) {
                report.overExposedPatterns++;
            }
            
            const bucket = `${exposure}x`;
            report.exposureDistribution[bucket] = (report.exposureDistribution[bucket] || 0) + 1;
        }
        
        return report;
    }

    /**
     * Configure anti-overfitting parameters
     */
    configure(settings) {
        if (settings.maxExposureCount !== undefined) {
            this.maxExposureCount = settings.maxExposureCount;
        }
        if (settings.diminishingFactor !== undefined) {
            this.diminishingFactor = settings.diminishingFactor;
        }
        if (settings.timeWindowMinutes !== undefined) {
            this.timeWindowMinutes = settings.timeWindowMinutes;
        }
        
        console.log('[ANTI-OVERFITTING] Configuration updated:', {
            maxExposureCount: this.maxExposureCount,
            diminishingFactor: this.diminishingFactor,
            timeWindowMinutes: this.timeWindowMinutes
        });
    }
}

module.exports = AntiOverfittingManager;