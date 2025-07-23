/**
 * Fluid Risk Model - Continuous Probability-Based Risk Evaluation
 * 
 * Replaces rigid if/then decision trees with smooth mathematical functions
 * for more nuanced risk assessment based on equity curves, market regimes,
 * loss patterns, and profit similarity.
 */

class FluidRiskModel {
    constructor(memoryManager) {
        this.memoryManager = memoryManager;
        
        // Equity curve tracking
        this.equityCurve = [];
        this.currentDrawdown = 0;
        this.maxDrawdown = 0;
        this.winStreak = 0;
        this.lossStreak = 0;
        
        // Component weights for final risk score
        this.weights = {
            equityCurve: 0.30,     // Profit protection based on recent performance
            marketRegime: 0.25,    // Market condition classification
            lossAvoidance: 0.25,   // Historical loss pattern avoidance
            profitSimilarity: 0.20 // Pattern matching for profit potential
        };
        
        // Directional bias tracking
        this.directionalStats = {
            long: { trades: [], lastUpdate: null },
            short: { trades: [], lastUpdate: null }
        };
        
        console.log('[FLUID-RISK] Initialized with continuous scoring weights:', this.weights);
    }
    
    /**
     * Main entry point - evaluate risk using continuous probability functions
     */
    async evaluateRisk(instrument, direction, features, timestamp) {
        const startTime = Date.now();
        
        try {
            console.log(`[FLUID-RISK] Evaluating ${instrument} ${direction} with fluid model`);
            
            // Calculate four risk component scores (0.0 - 1.0 each)
            const equityScore = this.calculateEquityScore();
            const regimeScore = await this.calculateMarketRegimeScore(instrument, direction, features);
            const lossScore = await this.calculateLossAvoidanceScore(instrument, direction, features);
            const profitScore = await this.calculateProfitSimilarityScore(instrument, direction, features);
            
            // Weighted combination for overall confidence
            const overallConfidence = (
                equityScore * this.weights.equityCurve +
                regimeScore * this.weights.marketRegime +
                lossScore * this.weights.lossAvoidance +
                profitScore * this.weights.profitSimilarity
            );
            
            // Check for directional bias rejection BEFORE other processing
            const biasRejection = this.evaluateDirectionalBias(instrument, direction, timestamp);
            if (biasRejection.rejected) {
                console.log(`[FLUID-RISK] ${biasRejection.reason}`);
                return {
                    approved: false,
                    confidence: 0.3,
                    suggested_sl: 25,
                    suggested_tp: 35,
                    reasons: [biasRejection.reason, "Directional bias rejection"],
                    risk_model: "fluid-directional-rejection",
                    biasAnalysis: biasRejection.analysis,
                    duration: Date.now() - startTime
                };
            }
            
            // Dynamic risk parameter scaling based on confidence
            const riskParams = this.calculateRiskParameters(overallConfidence, equityScore);
            
            const duration = Date.now() - startTime;
            
            const result = {
                approved: overallConfidence >= 0.5,
                confidence: Math.max(0.1, Math.min(1.0, overallConfidence)),
                suggested_sl: riskParams.stopLoss,
                suggested_tp: riskParams.takeProfit,
                reasons: [
                    `Fluid risk analysis: ${(overallConfidence * 100).toFixed(1)}% confidence`,
                    `Equity protection: ${(equityScore * 100).toFixed(1)}%`,
                    `Market regime fit: ${(regimeScore * 100).toFixed(1)}%`,
                    `Loss avoidance: ${(lossScore * 100).toFixed(1)}%`,
                    `Profit similarity: ${(profitScore * 100).toFixed(1)}%`
                ],
                risk_model: "fluid-v1",
                component_scores: {
                    equity: equityScore,
                    regime: regimeScore,
                    loss: lossScore,
                    profit: profitScore
                },
                duration: duration
            };
            
            console.log(`[FLUID-RISK] Result: ${result.approved ? 'APPROVED' : 'REJECTED'} (${(result.confidence * 100).toFixed(1)}%) in ${duration}ms`);
            return result;
            
        } catch (error) {
            console.error('[FLUID-RISK] Error in evaluateRisk:', error.message);
            return this.getFailsafeResult();
        }
    }
    
    /**
     * Equity Curve Component (30% weight)
     * Protects profits during winning streaks, reduces risk during losing streaks
     */
    calculateEquityScore() {
        let score = 0.6; // Base neutral score
        
        // Win streak bonus (sigmoid curve)
        if (this.winStreak > 0) {
            const winBonus = 0.3 * (1 / (1 + Math.exp(-0.5 * (this.winStreak - 2))));
            score += winBonus;
        }
        
        // Loss streak penalty (exponential decay)
        if (this.lossStreak > 0) {
            const lossPenalty = 0.4 * (1 - Math.exp(-0.3 * this.lossStreak));
            score -= lossPenalty;
        }
        
        // Drawdown impact (exponential based on percentage)
        if (this.currentDrawdown > 0) {
            const drawdownPenalty = 0.2 * (1 - Math.exp(-this.currentDrawdown / 100));
            score -= drawdownPenalty;
        }
        
        // Enhanced: Trade quality degradation detection
        if (this.equityCurve.length >= 5) {
            const recentTrades = this.equityCurve.slice(-5);
            const avgEfficiency = recentTrades
                .filter(t => t.totalEfficiency !== undefined)
                .reduce((sum, t) => sum + t.totalEfficiency, 0) / recentTrades.length;
            
            if (avgEfficiency < 0.5) {
                const qualityPenalty = 0.15 * (0.5 - avgEfficiency);
                score -= qualityPenalty;
            }
        }
        
        return Math.max(0.0, Math.min(1.0, score));
    }
    
    /**
     * Market Regime Component (25% weight)  
     * Uses statistical probability distributions to classify market conditions
     */
    async calculateMarketRegimeScore(instrument, direction, features) {
        if (!this.memoryManager.isInitialized) {
            return 0.65; // Default score when no historical data
        }
        
        try {
            // Get successful patterns for regime analysis
            const vectors = this.memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            const profitable = vectors.filter(v => (v.pnlPerContract || v.pnl) > 0);
            
            if (profitable.length < 10) {
                return 0.65; // Insufficient data
            }
            
            // Analyze key regime indicators with Gaussian scoring
            const regimeFeatures = ['atr_percentage', 'atr_14', 'volatility_ratio', 'rsi_14', 'volume_ratio'];
            let regimeScore = 0;
            let validFeatures = 0;
            
            for (const featureName of regimeFeatures) {
                const queryValue = features[featureName];
                if (typeof queryValue !== 'number') continue;
                
                // Calculate Gaussian probability based on profitable patterns
                const profitableValues = this.extractFeatureValues(profitable, featureName);
                if (profitableValues.length < 5) continue;
                
                const mean = profitableValues.reduce((sum, v) => sum + v, 0) / profitableValues.length;
                const variance = profitableValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / profitableValues.length;
                const stdDev = Math.sqrt(variance);
                
                if (stdDev > 0) {
                    // Statistical probability score using normal distribution
                    const probabilityScore = Math.exp(-0.5 * Math.pow((queryValue - mean) / stdDev, 2));
                    regimeScore += probabilityScore;
                    validFeatures++;
                }
            }
            
            return validFeatures > 0 ? regimeScore / validFeatures : 0.65;
            
        } catch (error) {
            console.error('[FLUID-RISK] Error in market regime scoring:', error.message);
            return 0.65;
        }
    }
    
    /**
     * Loss Avoidance Component (25% weight)
     * Identifies and avoids historically loss-prone conditions
     */
    async calculateLossAvoidanceScore(instrument, direction, features) {
        if (!this.memoryManager.isInitialized) {
            return 0.7; // Conservative default
        }
        
        try {
            const vectors = this.memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            const unprofitable = vectors.filter(v => (v.pnlPerContract || v.pnl) <= 0);
            
            if (unprofitable.length < 5) {
                return 0.8; // Good score when few losses
            }
            
            // Use k-nearest neighbors with exponential decay for loss clustering
            const k = Math.min(10, Math.floor(unprofitable.length * 0.3));
            const lossDistances = [];
            
            for (const lossVector of unprofitable) {
                try {
                    const lossFeatures = JSON.parse(lossVector.featuresJson || '{}');
                    const distance = this.calculateFeatureDistance(features, lossFeatures);
                    lossDistances.push({ distance, pnl: Math.abs(lossVector.pnlPerContract || lossVector.pnl || 0) });
                } catch (e) {
                    continue;
                }
            }
            
            if (lossDistances.length === 0) {
                return 0.8;
            }
            
            // Sort by distance and take k nearest losses
            lossDistances.sort((a, b) => a.distance - b.distance);
            const nearestLosses = lossDistances.slice(0, k);
            
            // Calculate weighted risk based on proximity and loss magnitude
            let riskScore = 0;
            let weightSum = 0;
            
            for (const loss of nearestLosses) {
                const proximityWeight = Math.exp(-loss.distance); // Exponential decay
                const lossImpact = Math.min(loss.pnl / 50, 1.0); // Normalize loss magnitude
                
                riskScore += proximityWeight * lossImpact;
                weightSum += proximityWeight;
            }
            
            const avgRisk = weightSum > 0 ? riskScore / weightSum : 0;
            return Math.max(0.2, 1.0 - avgRisk); // Invert so high risk = low score
            
        } catch (error) {
            console.error('[FLUID-RISK] Error in loss avoidance scoring:', error.message);
            return 0.7;
        }
    }
    
    /**
     * Profit Similarity Component (20% weight)
     * Identifies similarity to historically profitable patterns
     */
    async calculateProfitSimilarityScore(instrument, direction, features) {
        if (!this.memoryManager.isInitialized) {
            return 0.6; // Neutral default
        }
        
        try {
            const vectors = this.memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            const profitable = vectors.filter(v => (v.pnlPerContract || v.pnl) > 0);
            
            if (profitable.length < 5) {
                return 0.6; // Neutral when insufficient data
            }
            
            // Kernel-weighted k-nearest neighbors for profit patterns
            const k = Math.min(15, Math.floor(profitable.length * 0.4));
            const profitDistances = [];
            
            for (const profitVector of profitable) {
                try {
                    const profitFeatures = JSON.parse(profitVector.featuresJson || '{}');
                    const distance = this.calculateFeatureDistance(features, profitFeatures);
                    profitDistances.push({ 
                        distance, 
                        profit: Math.abs(profitVector.pnlPerContract || profitVector.pnl || 0) 
                    });
                } catch (e) {
                    continue;
                }
            }
            
            if (profitDistances.length === 0) {
                return 0.6;
            }
            
            // Sort by distance and take k nearest profitable patterns
            profitDistances.sort((a, b) => a.distance - b.distance);
            const nearestProfits = profitDistances.slice(0, k);
            
            // Calculate kernel-weighted similarity score
            let similarityScore = 0;
            let weightSum = 0;
            
            for (const profit of nearestProfits) {
                const kernelWeight = Math.exp(-2 * profit.distance); // RBF kernel
                const profitMagnitude = Math.min(profit.profit / 50, 1.0); // Normalize
                
                similarityScore += kernelWeight * profitMagnitude;
                weightSum += kernelWeight;
            }
            
            const avgSimilarity = weightSum > 0 ? similarityScore / weightSum : 0;
            return Math.min(1.0, avgSimilarity * 2); // Scale up similarity
            
        } catch (error) {
            console.error('[FLUID-RISK] Error in profit similarity scoring:', error.message);
            return 0.6;
        }
    }
    
    /**
     * Calculate risk parameters (SL/TP) based on continuous confidence score
     */
    calculateRiskParameters(confidence, equityScore) {
        // Base risk parameters
        let stopLoss = 25;   // Default stop loss
        let takeProfit = 50; // Default take profit
        
        // Confidence-based scaling (sigmoid curves)
        const confidenceMultiplier = 1 + 0.5 * (1 / (1 + Math.exp(-10 * (confidence - 0.6))));
        
        // Equity-based protection (exponential scaling)
        const equityMultiplier = 1 + 0.3 * Math.exp(2 * (equityScore - 0.7));
        
        // Apply scaling
        stopLoss = Math.round(stopLoss / confidenceMultiplier);
        takeProfit = Math.round(takeProfit * confidenceMultiplier * equityMultiplier);
        
        // Ensure minimum bounds
        stopLoss = Math.max(15, Math.min(40, stopLoss));
        takeProfit = Math.max(30, Math.min(100, takeProfit));
        
        return { stopLoss, takeProfit };
    }
    
    /**
     * Update equity curve with enhanced trade outcome data
     */
    updateEquityCurve(pnl, instrument, timestamp, enhancedData = null) {
        const normalizedPnl = parseFloat(pnl) || 0;
        
        // Create comprehensive trade record
        const tradeRecord = {
            timestamp: timestamp || null,
            pnl: normalizedPnl,
            instrument: instrument,
            direction: enhancedData?.direction || null, // Store direction for bias analysis
            runningTotal: (this.equityCurve.length > 0 ? 
                this.equityCurve[this.equityCurve.length - 1].runningTotal : 0) + normalizedPnl
        };
        
        // Add enhanced data if available
        if (enhancedData) {
            tradeRecord.entryPrice = enhancedData.entryPrice;
            tradeRecord.exitPrice = enhancedData.exitPrice;
            tradeRecord.maxProfit = enhancedData.maxProfit;      // MFE
            tradeRecord.maxLoss = enhancedData.maxLoss;          // MAE
            tradeRecord.entryEfficiency = enhancedData.entryEfficiency;
            tradeRecord.exitEfficiency = enhancedData.exitEfficiency;
            tradeRecord.totalEfficiency = enhancedData.totalEfficiency;
            tradeRecord.commission = enhancedData.commission;
            tradeRecord.quantity = enhancedData.quantity;
            tradeRecord.exitReason = enhancedData.exitReason;
            tradeRecord.holdTimeMinutes = enhancedData.holdTimeMinutes;
            tradeRecord.tradeNumber = enhancedData.tradeNumber;
        }
        
        // Add to equity curve
        this.equityCurve.push(tradeRecord);
        
        // Update streaks
        if (normalizedPnl > 0) {
            this.winStreak++;
            this.lossStreak = 0;
        } else if (normalizedPnl < 0) {
            this.lossStreak++;
            this.winStreak = 0;
        }
        
        // Calculate drawdown
        const runningTotal = this.equityCurve[this.equityCurve.length - 1].runningTotal;
        const peak = Math.max(...this.equityCurve.map(e => e.runningTotal));
        this.currentDrawdown = peak > 0 ? ((peak - runningTotal) / peak) * 100 : 0;
        this.maxDrawdown = Math.max(this.maxDrawdown, this.currentDrawdown);
        
        // Keep only last 100 trades in memory
        if (this.equityCurve.length > 100) {
            this.equityCurve = this.equityCurve.slice(-100);
        }
        
        console.log(`[FLUID-RISK] Equity updated: ${normalizedPnl > 0 ? 'WIN' : 'LOSS'} ${normalizedPnl} | Streak: W${this.winStreak}/L${this.lossStreak} | DD: ${this.currentDrawdown.toFixed(1)}%`);
    }
    
    /**
     * Utility functions
     */
    extractFeatureValues(vectors, featureName) {
        const values = [];
        for (const vector of vectors) {
            if (!vector.featuresJson) continue;
            try {
                const features = JSON.parse(vector.featuresJson);
                const value = features[featureName];
                if (typeof value === 'number' && !isNaN(value)) {
                    values.push(value);
                }
            } catch (e) {
                continue;
            }
        }
        return values;
    }
    
    calculateFeatureDistance(features1, features2) {
        const keys = new Set([...Object.keys(features1), ...Object.keys(features2)]);
        let sumSquaredDiff = 0;
        let validFeatures = 0;
        
        for (const key of keys) {
            const val1 = features1[key];
            const val2 = features2[key];
            
            if (typeof val1 === 'number' && typeof val2 === 'number' && 
                !isNaN(val1) && !isNaN(val2)) {
                sumSquaredDiff += Math.pow(val1 - val2, 2);
                validFeatures++;
            }
        }
        
        return validFeatures > 0 ? Math.sqrt(sumSquaredDiff / validFeatures) : 1.0;
    }
    
    getFailsafeResult() {
        return {
            approved: true,
            confidence: 0.65,
            suggested_sl: 25,
            suggested_tp: 50,
            reasons: ["Failsafe rule-based result - fluid model error"],
            risk_model: "failsafe",
            component_scores: { equity: 0.65, regime: 0.65, loss: 0.65, profit: 0.65 }
        };
    }
    
    /**
     * Directional Bias Evaluation - Option 2: Probabilistic Rejection
     * Analyze recent long vs short performance and probabilistically reject 
     * trades in underperforming direction to "tip the scales" toward profitable direction
     */
    evaluateDirectionalBias(instrument, direction, timestamp) {
        try {
            // Use NT timestamp or current time for analysis window
            const analysisTime = timestamp || null;
            const lookbackDays = 7; // Analyze last 7 days
            const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;
            const cutoffTime = analysisTime ? (analysisTime - lookbackMs) : (Date.now() - lookbackMs);
            
            // Filter recent trades by direction from equity curve
            const recentTrades = this.equityCurve.filter(trade => {
                const tradeTime = trade.timestamp || 0;
                return tradeTime >= cutoffTime && trade.instrument === instrument;
            });
            
            if (recentTrades.length < 4) {
                return { rejected: false, reason: "Insufficient recent trades for bias analysis", analysis: null };
            }
            
            // Separate by direction (infer from PnL patterns or use stored direction if available)
            const longTrades = recentTrades.filter(t => t.direction === 'long' || (!t.direction && t.pnl > 0));
            const shortTrades = recentTrades.filter(t => t.direction === 'short' || (!t.direction && t.pnl < 0));
            
            // If we can't separate directions, use alternate approach based on trade characteristics
            if (longTrades.length === 0 && shortTrades.length === 0) {
                // Fall back to analyzing win/loss patterns without direction separation
                const wins = recentTrades.filter(t => t.pnl > 0);
                const losses = recentTrades.filter(t => t.pnl <= 0);
                
                if (losses.length >= wins.length * 2 && losses.length >= 3) {
                    // Heavy losses recently - apply light rejection bias
                    const rejectionProbability = Math.min(0.3, losses.length / recentTrades.length);
                    const shouldReject = Math.random() < rejectionProbability;
                    
                    if (shouldReject) {
                        return {
                            rejected: true,
                            reason: `Recent performance shows ${losses.length} losses vs ${wins.length} wins - probabilistic rejection applied`,
                            analysis: {
                                recentTradeCount: recentTrades.length,
                                winCount: wins.length,
                                lossCount: losses.length,
                                rejectionProbability: rejectionProbability,
                                biasType: "general_performance"
                            }
                        };
                    }
                }
                
                return { rejected: false, reason: "No strong directional bias detected", analysis: null };
            }
            
            // Calculate performance metrics by direction
            const longStats = this.calculateDirectionStats(longTrades);
            const shortStats = this.calculateDirectionStats(shortTrades);
            
            // Determine stronger direction
            const longScore = longStats.winRate * longStats.avgProfit * longStats.tradeCount;
            const shortScore = shortStats.winRate * shortStats.avgProfit * shortStats.tradeCount;
            
            let strongerDirection = 'neutral';
            let biasStrength = 0;
            
            if (longScore > shortScore * 1.5) {
                strongerDirection = 'long';
                biasStrength = Math.min(0.4, (longScore / shortScore - 1) * 0.2);
            } else if (shortScore > longScore * 1.5) {
                strongerDirection = 'short';
                biasStrength = Math.min(0.4, (shortScore / longScore - 1) * 0.2);
            }
            
            // Apply probabilistic rejection if trading against stronger direction
            if (strongerDirection !== 'neutral' && strongerDirection !== direction && biasStrength > 0.1) {
                const rejectionProbability = Math.min(0.35, biasStrength * 2); // Cap at 35% rejection
                const shouldReject = Math.random() < rejectionProbability;
                
                if (shouldReject) {
                    const strongerStats = strongerDirection === 'long' ? longStats : shortStats;
                    const weaker = direction;
                    
                    return {
                        rejected: true,
                        reason: `Recent ${strongerDirection} trades outperforming (${strongerStats.winRate.toFixed(0)}% win rate, $${strongerStats.avgProfit.toFixed(0)} avg) - probabilistic rejection of ${weaker} signal`,
                        analysis: {
                            strongerDirection,
                            biasStrength,
                            rejectionProbability,
                            longStats,
                            shortStats,
                            recentTradeCount: recentTrades.length,
                            biasType: "directional_performance"
                        }
                    };
                }
            }
            
            return { 
                rejected: false, 
                reason: `No significant directional bias (${strongerDirection} ${biasStrength.toFixed(2)} strength)`,
                analysis: {
                    strongerDirection,
                    biasStrength,
                    longStats,
                    shortStats,
                    recentTradeCount: recentTrades.length,
                    biasType: "directional_analysis"
                }
            };
            
        } catch (error) {
            console.error('[FLUID-RISK] Error in directional bias evaluation:', error.message);
            return { rejected: false, reason: "Bias analysis error - proceeding", analysis: null };
        }
    }
    
    /**
     * Helper method to calculate performance statistics for a set of trades
     */
    calculateDirectionStats(trades) {
        if (trades.length === 0) {
            return { winRate: 0, avgProfit: 0, avgLoss: 0, tradeCount: 0, maxProfit: 0 };
        }
        
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        
        const winRate = (wins.length / trades.length) * 100;
        const avgProfit = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
        const maxProfit = trades.length > 0 ? Math.max(...trades.map(t => t.maxProfit || t.pnl || 0)) : 0;
        
        return {
            winRate,
            avgProfit,
            avgLoss,
            tradeCount: trades.length,
            maxProfit,
            profitFactor: avgLoss > 0 ? avgProfit / avgLoss : 0
        };
    }

    getStats() {
        return {
            equityCurveLength: this.equityCurve.length,
            winStreak: this.winStreak,
            lossStreak: this.lossStreak,
            currentDrawdown: this.currentDrawdown,
            maxDrawdown: this.maxDrawdown,
            runningTotal: this.equityCurve.length > 0 ? 
                this.equityCurve[this.equityCurve.length - 1].runningTotal : 0,
            weights: this.weights,
            directionalStats: this.directionalStats
        };
    }
}

module.exports = FluidRiskModel;