// Pattern Clustering System - Phase 2
// Detects dangerous and profitable trading patterns from stored vectors

class PatternClusterer {
    constructor() {
        // Pattern detection thresholds
        this.thresholds = {
            MIN_PATTERN_SIZE: 3,        // Need at least 3 trades to detect pattern
            DEATH_BY_CUTS_LOSS: -15,    // Multiple small losses
            DEATH_BY_CUTS_MAX: -40,     // Don't exceed this per trade
            PROFITABLE_GRIND_WIN: 10,   // Multiple small wins
            PROFITABLE_GRIND_MAX: 50,   // Stay below this per trade
            CHOPPY_ALTERNATING: 0.6,    // 60%+ alternating win/loss
            PATTERN_TIMEFRAME: 24 * 60 * 60 * 1000 // 24 hours in ms
        };
        
        this.patternTypes = {
            PROFITABLE_GRIND: 'Multiple small consistent wins',
            DEATH_BY_CUTS: 'Multiple small losses bleeding account',
            CHOPPY_MARKET: 'Alternating wins/losses - no clear direction',
            BIG_WIN_SPREE: 'Sequence of profitable trades',
            DISASTER_SEQUENCE: 'Sequence of losing trades',
            MIXED_BAG: 'No clear pattern detected'
        };
    }
    
    /**
     * Analyze trades and detect patterns
     * @param {Array} trades - Array of trade vectors
     * @param {Object} options - Analysis options
     * @returns {Object} - Pattern analysis results
     */
    analyzePatterns(trades, options = {}) {
        const {
            instrument = null,
            direction = null,
            lookbackHours = 24,
            minPatternSize = this.thresholds.MIN_PATTERN_SIZE
        } = options;
        
        // Filter trades by criteria
        const filteredTrades = this.filterTrades(trades, {
            instrument,
            direction,
            lookbackHours
        });
        
        if (filteredTrades.length < minPatternSize) {
            return {
                hasPattern: false,
                reason: `Insufficient trades: ${filteredTrades.length} < ${minPatternSize}`,
                trades: filteredTrades
            };
        }
        
        // Sort by timestamp (newest first)
        const sortedTrades = filteredTrades.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        // Detect different pattern types
        const patterns = {
            profitableGrind: this.detectProfitableGrind(sortedTrades),
            deathByCuts: this.detectDeathByCuts(sortedTrades),
            choppyMarket: this.detectChoppyMarket(sortedTrades),
            bigWinSpree: this.detectBigWinSpree(sortedTrades),
            disasterSequence: this.detectDisasterSequence(sortedTrades)
        };
        
        // Find the strongest pattern
        const strongestPattern = this.selectStrongestPattern(patterns);
        
        return {
            hasPattern: strongestPattern.type !== 'MIXED_BAG',
            primaryPattern: strongestPattern,
            allPatterns: patterns,
            trades: sortedTrades,
            summary: this.generateSummary(sortedTrades, strongestPattern),
            recommendations: this.generateRecommendations(strongestPattern, sortedTrades)
        };
    }
    
    /**
     * Filter trades by criteria
     */
    filterTrades(trades, { instrument, direction, lookbackHours }) {
        const cutoffTime = Date.now() - (lookbackHours * 60 * 60 * 1000);
        
        return trades.filter(trade => {
            // Time filter
            const tradeTime = new Date(trade.timestamp).getTime();
            if (tradeTime < cutoffTime) return false;
            
            // Instrument filter
            if (instrument && trade.instrument !== instrument) return false;
            
            // Direction filter
            if (direction && trade.direction !== direction) return false;
            
            // Must have outcome data
            if (!trade.outcome || trade.outcome.pnl === undefined) return false;
            
            return true;
        });
    }
    
    /**
     * Detect profitable grinding pattern
     */
    detectProfitableGrind(trades) {
        const smallWins = trades.filter(t => 
            t.outcome.pnl > this.thresholds.PROFITABLE_GRIND_WIN && 
            t.outcome.pnl < this.thresholds.PROFITABLE_GRIND_MAX
        );
        
        if (smallWins.length >= this.thresholds.MIN_PATTERN_SIZE) {
            const avgWin = smallWins.reduce((sum, t) => sum + t.outcome.pnl, 0) / smallWins.length;
            const totalProfit = smallWins.reduce((sum, t) => sum + t.outcome.pnl, 0);
            
            return {
                detected: true,
                confidence: Math.min(1.0, smallWins.length / 10), // Higher confidence with more trades
                trades: smallWins,
                metrics: {
                    count: smallWins.length,
                    avgWin: avgWin.toFixed(2),
                    totalProfit: totalProfit.toFixed(2),
                    consistency: this.calculateConsistency(smallWins)
                }
            };
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Detect death by cuts pattern
     */
    detectDeathByCuts(trades) {
        const smallLosses = trades.filter(t => 
            t.outcome.pnl < this.thresholds.DEATH_BY_CUTS_LOSS && 
            t.outcome.pnl > this.thresholds.DEATH_BY_CUTS_MAX
        );
        
        if (smallLosses.length >= this.thresholds.MIN_PATTERN_SIZE) {
            const avgLoss = smallLosses.reduce((sum, t) => sum + t.outcome.pnl, 0) / smallLosses.length;
            const totalLoss = smallLosses.reduce((sum, t) => sum + t.outcome.pnl, 0);
            
            return {
                detected: true,
                confidence: Math.min(1.0, smallLosses.length / 8), // Dangerous - higher confidence faster
                trades: smallLosses,
                metrics: {
                    count: smallLosses.length,
                    avgLoss: avgLoss.toFixed(2),
                    totalLoss: totalLoss.toFixed(2),
                    bleedRate: this.calculateBleedRate(smallLosses)
                }
            };
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Detect choppy market pattern
     */
    detectChoppyMarket(trades) {
        if (trades.length < 4) return { detected: false, confidence: 0 };
        
        // Check for alternating wins/losses
        let alternations = 0;
        for (let i = 1; i < trades.length; i++) {
            const current = trades[i].outcome.pnl > 0;
            const previous = trades[i-1].outcome.pnl > 0;
            if (current !== previous) {
                alternations++;
            }
        }
        
        const alternationRate = alternations / (trades.length - 1);
        
        if (alternationRate >= this.thresholds.CHOPPY_ALTERNATING) {
            return {
                detected: true,
                confidence: alternationRate,
                trades: trades,
                metrics: {
                    alternationRate: (alternationRate * 100).toFixed(1) + '%',
                    totalTrades: trades.length,
                    netPnL: trades.reduce((sum, t) => sum + t.outcome.pnl, 0).toFixed(2)
                }
            };
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Detect big win spree
     */
    detectBigWinSpree(trades) {
        const bigWins = trades.filter(t => t.outcome.pnl > 50);
        
        if (bigWins.length >= 2) {
            return {
                detected: true,
                confidence: Math.min(1.0, bigWins.length / 5),
                trades: bigWins,
                metrics: {
                    count: bigWins.length,
                    totalProfit: bigWins.reduce((sum, t) => sum + t.outcome.pnl, 0).toFixed(2),
                    avgWin: (bigWins.reduce((sum, t) => sum + t.outcome.pnl, 0) / bigWins.length).toFixed(2)
                }
            };
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Detect disaster sequence
     */
    detectDisasterSequence(trades) {
        const bigLosses = trades.filter(t => t.outcome.pnl < -50);
        
        if (bigLosses.length >= 2) {
            return {
                detected: true,
                confidence: Math.min(1.0, bigLosses.length / 3), // Dangerous - detect early
                trades: bigLosses,
                metrics: {
                    count: bigLosses.length,
                    totalLoss: bigLosses.reduce((sum, t) => sum + t.outcome.pnl, 0).toFixed(2),
                    avgLoss: (bigLosses.reduce((sum, t) => sum + t.outcome.pnl, 0) / bigLosses.length).toFixed(2)
                }
            };
        }
        
        return { detected: false, confidence: 0 };
    }
    
    /**
     * Select strongest pattern from detected patterns
     */
    selectStrongestPattern(patterns) {
        const detectedPatterns = Object.entries(patterns)
            .filter(([_, pattern]) => pattern.detected)
            .sort((a, b) => b[1].confidence - a[1].confidence);
        
        if (detectedPatterns.length === 0) {
            return { type: 'MIXED_BAG', confidence: 0 };
        }
        
        const [patternKey, pattern] = detectedPatterns[0];
        
        const typeMap = {
            profitableGrind: 'PROFITABLE_GRIND',
            deathByCuts: 'DEATH_BY_CUTS',
            choppyMarket: 'CHOPPY_MARKET',
            bigWinSpree: 'BIG_WIN_SPREE',
            disasterSequence: 'DISASTER_SEQUENCE'
        };
        
        return {
            type: typeMap[patternKey],
            confidence: pattern.confidence,
            details: pattern
        };
    }
    
    /**
     * Generate summary of trading patterns
     */
    generateSummary(trades, pattern) {
        const totalPnL = trades.reduce((sum, t) => sum + t.outcome.pnl, 0);
        const winningTrades = trades.filter(t => t.outcome.pnl > 0);
        const losingTrades = trades.filter(t => t.outcome.pnl < 0);
        
        return {
            totalTrades: trades.length,
            totalPnL: totalPnL.toFixed(2),
            winRate: ((winningTrades.length / trades.length) * 100).toFixed(1) + '%',
            avgWin: winningTrades.length > 0 ? (winningTrades.reduce((sum, t) => sum + t.outcome.pnl, 0) / winningTrades.length).toFixed(2) : '0.00',
            avgLoss: losingTrades.length > 0 ? (losingTrades.reduce((sum, t) => sum + t.outcome.pnl, 0) / losingTrades.length).toFixed(2) : '0.00',
            primaryPattern: pattern.type,
            patternConfidence: (pattern.confidence * 100).toFixed(1) + '%'
        };
    }
    
    /**
     * Generate trading recommendations based on pattern
     */
    generateRecommendations(pattern, trades) {
        const recommendations = [];
        
        switch (pattern.type) {
            case 'PROFITABLE_GRIND':
                recommendations.push('✅ Keep current strategy - profitable grinding detected across trades');
                recommendations.push('🎯 Consider slightly increasing position size');
                recommendations.push('⚠️  Watch for market regime change that could break pattern');
                break;
                
            case 'DEATH_BY_CUTS':
                recommendations.push('🚨 DANGER: Stop trading immediately - bleeding pattern detected');
                recommendations.push('📉 Review strategy - multiple small losses accumulating');
                recommendations.push('🔧 Tighten stop losses or take break to reassess');
                break;
                
            case 'CHOPPY_MARKET':
                recommendations.push('⚡ Reduce position size - alternating win/loss pattern detected');
                recommendations.push('⏰ Consider waiting for clearer directional movement');
                recommendations.push('🎲 Current strategy may be fighting market chop');
                break;
                
            case 'BIG_WIN_SPREE':
                recommendations.push('🚀 Favorable conditions - maintain current approach');
                recommendations.push('💰 Consider taking some profits off table');
                recommendations.push('⚠️  Prepare for potential reversal or regime change');
                break;
                
            case 'DISASTER_SEQUENCE':
                recommendations.push('🛑 STOP TRADING - multiple large losses detected');
                recommendations.push('🔍 Review risk management immediately');
                recommendations.push('📚 Analyze what went wrong before resuming');
                break;
                
            default:
                recommendations.push('📊 No clear pattern - continue with normal risk management');
                break;
        }
        
        return recommendations;
    }
    
    /**
     * Calculate consistency metric for trades
     */
    calculateConsistency(trades) {
        if (trades.length < 2) return 0;
        
        const pnls = trades.map(t => t.outcome.pnl);
        const mean = pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
        const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - mean, 2), 0) / pnls.length;
        const stdDev = Math.sqrt(variance);
        
        // Lower standard deviation = higher consistency
        return Math.max(0, 1 - (stdDev / mean));
    }
    
    /**
     * Calculate bleed rate for death by cuts pattern
     */
    calculateBleedRate(trades) {
        if (trades.length < 2) return 0;
        
        const timeSpan = new Date(trades[0].timestamp) - new Date(trades[trades.length - 1].timestamp);
        const hoursSpan = timeSpan / (1000 * 60 * 60);
        const totalLoss = Math.abs(trades.reduce((sum, t) => sum + t.outcome.pnl, 0));
        
        return (totalLoss / hoursSpan).toFixed(2); // $ per hour loss rate
    }
    
    /**
     * Get pattern clustering statistics
     */
    getStats() {
        return {
            thresholds: this.thresholds,
            patternTypes: this.patternTypes,
            version: '1.0.0'
        };
    }
}

module.exports = PatternClusterer;