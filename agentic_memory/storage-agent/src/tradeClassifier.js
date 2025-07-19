// Trade Classification System - Phase 2
// Determines which trades are worth storing based on importance scoring

class TradeClassifier {
    constructor() {
        // Classification thresholds
        this.thresholds = {
            EXTREME_PNL: 100,        // Big wins/losses always important
            SMALL_PNL: 20,           // Below this is potentially noise
            HIGH_OPPORTUNITY: 80,    // High maxProfit/maxLoss
            MISSED_OPPORTUNITY: 50,  // Could have been much better
        };
        
        // Importance weights
        this.weights = {
            SURPRISE: 0.3,      // Unexpected outcomes
            EXTREMES: 0.2,      // Big wins/losses  
            MISSED: 0.3,        // Educational value
            RECENCY: 0.1,       // Recent trades slightly more important
            UNIQUENESS: 0.1     // Novel market conditions
        };
    }
    
    /**
     * Classify a trade and return importance score
     * @param {Object} trade - Trade data with pnl, maxProfit, maxLoss, etc.
     * @returns {Object} - { type: string, importance: number, reasoning: string }
     */
    classify(trade) {
        const absPnL = Math.abs(trade.pnl || 0);
        const maxProfit = trade.maxProfit || 0;
        const maxLoss = Math.abs(trade.maxLoss || 0);
        const opportunity = Math.max(maxProfit, maxLoss);
        
        let score = 0;
        let type = 'STANDARD';
        let reasoning = [];
        
        // 1. NOISE FILTER: Skip truly boring trades
        if (absPnL < this.thresholds.SMALL_PNL && opportunity < 30) {
            return {
                type: 'NOISE',
                importance: 0.1,
                reasoning: `Boring trade: $${trade.pnl} PnL, $${opportunity.toFixed(0)} max opportunity`,
                shouldStore: false
            };
        }
        
        // 2. EXTREME TRADES: Always store big wins/losses
        if (absPnL > this.thresholds.EXTREME_PNL) {
            score += this.weights.EXTREMES;
            type = trade.pnl > 0 ? 'EXTREME_WIN' : 'EXTREME_LOSS';
            reasoning.push(`Extreme ${trade.pnl > 0 ? 'profit' : 'loss'}: $${trade.pnl}`);
        }
        
        // 3. MISSED OPPORTUNITIES: Educational value
        if (opportunity > this.thresholds.HIGH_OPPORTUNITY && absPnL < 30) {
            score += this.weights.MISSED;
            if (trade.pnl > 0) {
                type = 'MISSED_BIGGER_WIN';
                reasoning.push(`Left $${(maxProfit - trade.pnl).toFixed(0)} on table`);
            } else {
                type = 'AVOIDED_DISASTER';
                reasoning.push(`Could have lost $${maxLoss.toFixed(0)} more`);
            }
        }
        
        // 4. SURPRISE FACTOR: Unexpected outcomes
        const expectedPnL = this.estimateExpectedPnL(trade);
        const surprise = Math.abs(trade.pnl - expectedPnL);
        if (surprise > 50) {
            score += this.weights.SURPRISE * (surprise / 100);
            reasoning.push(`Unexpected outcome: expected $${expectedPnL.toFixed(0)}, got $${trade.pnl}`);
        }
        
        // 5. RECENCY BONUS: Recent trades slightly more important
        if (trade.timestamp) {
            const ageInDays = (Date.now() - new Date(trade.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            const recencyBonus = Math.max(0, this.weights.RECENCY * (1 - ageInDays / 30));
            score += recencyBonus;
            if (ageInDays < 7) {
                reasoning.push('Recent trade bonus');
            }
        }
        
        // 6. CONSISTENCY PATTERNS: Small wins in clusters
        if (trade.pnl > 10 && trade.pnl < 40) {
            type = 'SMALL_WIN';
            score += 0.4; // Will be boosted if part of pattern
            reasoning.push('Potential consistent winner');
        }
        
        // 7. DEATH BY CUTS: Small losses (more dangerous than small wins)
        if (trade.pnl < -10 && trade.pnl > -40) {
            type = 'SMALL_LOSS';
            score += 0.6; // Higher than small wins!
            reasoning.push('Potential bleeding pattern');
        }
        
        // Final importance score
        const importance = Math.min(1.0, score);
        const shouldStore = importance > 0.3;
        
        return {
            type,
            importance,
            reasoning: reasoning.join('; '),
            shouldStore,
            metadata: {
                absPnL,
                opportunity,
                surprise,
                expectedPnL
            }
        };
    }
    
    /**
     * Estimate expected PnL based on trade characteristics
     * This is a simple heuristic - could be enhanced with ML
     */
    estimateExpectedPnL(trade) {
        // Simple heuristic based on direction and basic features
        const baseExpectation = 0; // Neutral market assumption
        
        // Adjust based on any available context
        if (trade.features) {
            const momentum = trade.features.momentum_5 || 0;
            const rsi = trade.features.rsi_14 || 50;
            
            // Simple momentum-based expectation
            if (trade.direction === 'long') {
                return baseExpectation + (momentum * 5) + ((rsi - 50) * 0.5);
            } else {
                return baseExpectation - (momentum * 5) - ((rsi - 50) * 0.5);
            }
        }
        
        return baseExpectation;
    }
    
    /**
     * Get classification statistics
     */
    getStats() {
        return {
            thresholds: this.thresholds,
            weights: this.weights,
            version: '1.0.0'
        };
    }
}

module.exports = TradeClassifier;