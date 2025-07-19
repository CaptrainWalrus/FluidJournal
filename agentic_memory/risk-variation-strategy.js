/**
 * Risk Variation Strategy for Backtesting
 * 
 * Purpose: When seeing the same entry signal multiple times (repeated backtests),
 * vary the risk parameters based on previous outcomes to create more training variety.
 */

class RiskVariationStrategy {
    constructor() {
        // Track outcomes for each unique entry signal
        this.signalHistory = new Map(); // entrySignalId -> array of outcomes
        this.variationStrategies = [
            'adjust_stops',     // Vary stop loss distance
            'adjust_targets',   // Vary take profit targets
            'confidence_shift', // Vary confidence thresholds
            'time_exit',       // Vary holding period
            'partial_exit'     // Vary position sizing
        ];
    }

    /**
     * Get risk parameters for a signal, varying based on history
     * @param {string} entrySignalId - Unique signal identifier
     * @param {object} baseRisk - Base risk parameters from pattern matching
     * @param {object} features - Current market features
     * @returns {object} Varied risk parameters
     */
    getVariedRiskParameters(entrySignalId, baseRisk, features) {
        // Get history for this signal
        const history = this.signalHistory.get(entrySignalId) || [];
        const attemptNumber = history.length;
        
        // First attempt uses base parameters
        if (attemptNumber === 0) {
            return {
                ...baseRisk,
                variationStrategy: 'base',
                attemptNumber: 0
            };
        }
        
        // Select variation strategy based on attempt number
        const strategyIndex = attemptNumber % this.variationStrategies.length;
        const strategy = this.variationStrategies[strategyIndex];
        
        // Get last outcome to inform variation
        const lastOutcome = history[history.length - 1];
        
        // Apply variation based on strategy and last outcome
        let variedRisk = { ...baseRisk };
        
        switch (strategy) {
            case 'adjust_stops':
                variedRisk = this.adjustStops(variedRisk, lastOutcome, attemptNumber);
                break;
                
            case 'adjust_targets':
                variedRisk = this.adjustTargets(variedRisk, lastOutcome, attemptNumber);
                break;
                
            case 'confidence_shift':
                variedRisk = this.adjustConfidence(variedRisk, lastOutcome, attemptNumber);
                break;
                
            case 'time_exit':
                variedRisk = this.adjustTimeExit(variedRisk, attemptNumber);
                break;
                
            case 'partial_exit':
                variedRisk = this.adjustPartialExit(variedRisk, attemptNumber);
                break;
        }
        
        return {
            ...variedRisk,
            variationStrategy: strategy,
            attemptNumber,
            lastOutcome: lastOutcome ? lastOutcome.pnl : null
        };
    }
    
    /**
     * Adjust stop loss based on previous outcomes
     */
    adjustStops(risk, lastOutcome, attempt) {
        const baseStop = risk.stopLoss;
        
        if (!lastOutcome) {
            return risk;
        }
        
        let stopMultiplier = 1.0;
        
        // If last trade was a winner, loosen stop
        if (lastOutcome.pnl > 0) {
            stopMultiplier = 1.0 + (attempt * 0.1); // 10% wider per attempt
        }
        // If last trade was a loser, tighten stop
        else if (lastOutcome.pnl < 0) {
            stopMultiplier = 1.0 - (attempt * 0.05); // 5% tighter per attempt
        }
        
        // Keep within reasonable bounds
        stopMultiplier = Math.max(0.5, Math.min(2.0, stopMultiplier));
        
        return {
            ...risk,
            stopLoss: Math.round(baseStop * stopMultiplier),
            reasoning: risk.reasoning + ` | Stop adjusted ${(stopMultiplier * 100).toFixed(0)}% based on attempt ${attempt}`
        };
    }
    
    /**
     * Adjust profit targets based on previous outcomes
     */
    adjustTargets(risk, lastOutcome, attempt) {
        const baseTarget = risk.takeProfit;
        
        if (!lastOutcome) {
            return risk;
        }
        
        let targetMultiplier = 1.0;
        
        // If last trade hit target, increase target
        if (lastOutcome.pnl > 0 && lastOutcome.exitReason === 'target') {
            targetMultiplier = 1.0 + (attempt * 0.15); // 15% higher per attempt
        }
        // If last trade stopped out, reduce target
        else if (lastOutcome.pnl < 0) {
            targetMultiplier = 1.0 - (attempt * 0.1); // 10% lower per attempt
        }
        
        // Keep within reasonable bounds
        targetMultiplier = Math.max(0.5, Math.min(3.0, targetMultiplier));
        
        return {
            ...risk,
            takeProfit: Math.round(baseTarget * targetMultiplier),
            reasoning: risk.reasoning + ` | Target adjusted ${(targetMultiplier * 100).toFixed(0)}% based on attempt ${attempt}`
        };
    }
    
    /**
     * Adjust confidence threshold for entry
     */
    adjustConfidence(risk, lastOutcome, attempt) {
        let confidenceAdjust = 0;
        
        if (lastOutcome) {
            // If profitable, lower confidence requirement (take more trades)
            if (lastOutcome.pnl > 0) {
                confidenceAdjust = -0.05 * attempt; // Lower by 5% per attempt
            }
            // If unprofitable, raise confidence requirement (be more selective)
            else {
                confidenceAdjust = 0.05 * attempt; // Raise by 5% per attempt
            }
        }
        
        // Apply adjustment
        const newConfidence = Math.max(0.3, Math.min(0.95, risk.confidence + confidenceAdjust));
        
        return {
            ...risk,
            confidence: newConfidence,
            reasoning: risk.reasoning + ` | Confidence adjusted to ${(newConfidence * 100).toFixed(0)}% based on attempt ${attempt}`
        };
    }
    
    /**
     * Vary exit timing strategy
     */
    adjustTimeExit(risk, attempt) {
        // Add time-based exit variations
        const timeExitOptions = [
            { bars: 5, description: 'Quick scalp exit' },
            { bars: 10, description: 'Short-term exit' },
            { bars: 20, description: 'Medium-term exit' },
            { bars: 50, description: 'Patient exit' }
        ];
        
        const selectedOption = timeExitOptions[attempt % timeExitOptions.length];
        
        return {
            ...risk,
            maxBars: selectedOption.bars,
            reasoning: risk.reasoning + ` | ${selectedOption.description} (${selectedOption.bars} bars)`
        };
    }
    
    /**
     * Implement partial exit strategies
     */
    adjustPartialExit(risk, attempt) {
        const partialStrategies = [
            { partial: 0, description: 'Full position' },
            { partial: 0.5, description: '50% at half target' },
            { partial: 0.33, description: '1/3 at each level' },
            { partial: 0.75, description: '75% early, 25% runner' }
        ];
        
        const selectedStrategy = partialStrategies[attempt % partialStrategies.length];
        
        return {
            ...risk,
            partialExit: selectedStrategy.partial,
            partialTarget: risk.takeProfit * 0.5, // Half target for partial
            reasoning: risk.reasoning + ` | ${selectedStrategy.description}`
        };
    }
    
    /**
     * Record outcome for a signal
     */
    recordOutcome(entrySignalId, outcome) {
        if (!this.signalHistory.has(entrySignalId)) {
            this.signalHistory.set(entrySignalId, []);
        }
        
        this.signalHistory.get(entrySignalId).push({
            timestamp: Date.now(),
            pnl: outcome.pnl,
            exitReason: outcome.exitReason,
            maxProfit: outcome.maxProfit,
            maxLoss: outcome.maxLoss,
            barsHeld: outcome.barsHeld
        });
        
        // Keep only last 10 outcomes per signal
        const history = this.signalHistory.get(entrySignalId);
        if (history.length > 10) {
            history.shift();
        }
    }
    
    /**
     * Get statistics for variation effectiveness
     */
    getVariationStats() {
        const stats = {
            totalSignals: this.signalHistory.size,
            signalsWithMultipleAttempts: 0,
            avgAttemptsPerSignal: 0,
            outcomesByStrategy: {}
        };
        
        let totalAttempts = 0;
        
        this.signalHistory.forEach((history, signalId) => {
            if (history.length > 1) {
                stats.signalsWithMultipleAttempts++;
            }
            totalAttempts += history.length;
            
            // Track outcomes by strategy
            history.forEach((outcome, idx) => {
                if (idx > 0) {
                    const strategy = this.variationStrategies[idx % this.variationStrategies.length];
                    if (!stats.outcomesByStrategy[strategy]) {
                        stats.outcomesByStrategy[strategy] = {
                            count: 0,
                            totalPnl: 0,
                            winners: 0
                        };
                    }
                    
                    stats.outcomesByStrategy[strategy].count++;
                    stats.outcomesByStrategy[strategy].totalPnl += outcome.pnl;
                    if (outcome.pnl > 0) {
                        stats.outcomesByStrategy[strategy].winners++;
                    }
                }
            });
        });
        
        stats.avgAttemptsPerSignal = totalAttempts / Math.max(1, stats.totalSignals);
        
        return stats;
    }
}

module.exports = RiskVariationStrategy;