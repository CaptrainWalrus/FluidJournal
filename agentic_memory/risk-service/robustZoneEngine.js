const fs = require('fs');

/**
 * Robust Zone Detection Engine V2
 * 
 * Core Philosophy: Find wide gradient profitable zones with HIGH variability + HIGH consistency
 * Not: Peak performance outliers with narrow requirements
 */
class RobustZoneEngine {
    constructor() {
        this.evaluationCount = 0;
        this.currentBestZones = new Map(); // instrument_direction -> bestZone
        this.zonePerformanceHistory = new Map(); // track zone effectiveness over time
        this.explorationMode = new Map(); // instrument_direction -> exploration status
        this.lastZoneUpdate = new Map(); // track when zones were last updated
        
        // Configuration for robust clustering
        this.config = {
            minProfitableTradesInZone: 20,     // Require substantial evidence
            profitThresholdPerContract: 10,    // $10+ per contract = profitable
            robustnessWeights: {
                profitability: 0.3,            // Average profit contribution
                variability: 0.4,              // Feature range tolerance (HIGH = good)
                consistency: 0.2,              // Profit stability despite variation
                sampleSize: 0.1                // Bonus for large samples
            },
            explorationTriggers: {
                consecutiveLowConfidence: 5,   // 5 trades < 50% confidence = explore
                zonePerformanceDrop: 0.3,      // 30% drop in zone performance = explore
                lowMembershipStreak: 3         // 3 trades with <40% membership = explore
            }
        };
        
        console.log('[ROBUST-ZONES] Engine initialized with gradient tolerance focus');
    }
    
    /**
     * Main analysis entry point
     */
    async analyze(queryFeatures, instrument, direction, memoryManager) {
        this.evaluationCount++;
        const startTime = Date.now();
        
        try {
            console.log(`[ROBUST-ZONES] Analysis ${this.evaluationCount}: ${direction} ${instrument}`);
            
            // Get graduated data for this instrument+direction pair
            const graduatedData = await this.getGraduatedData(instrument, direction, memoryManager);
            if (!graduatedData) {
                console.log(`[ROBUST-ZONES] No graduation data for ${instrument}_${direction}`);
                return this.createFallbackResponse();
            }
            
            // Find or update best zone for this instrument+direction
            const zoneKey = `${instrument}_${direction}`;
            let bestZone = this.currentBestZones.get(zoneKey);
            
            if (!bestZone || this.shouldUpdateZone(bestZone)) {
                console.log(`[ROBUST-ZONES] Computing new best zone for ${zoneKey}`);
                bestZone = await this.findBestZone(graduatedData.vectorData, graduatedData.featureNames);
                this.currentBestZones.set(zoneKey, bestZone);
            }
            
            // Test query features against best zone
            const membership = this.testZoneMembership(queryFeatures, bestZone);
            const confidence = membership * bestZone.robustnessScore;
            
            // Check if we should enter exploration mode
            const explorationStatus = this.checkExplorationMode(zoneKey, confidence, membership);
            
            const result = {
                method: 'robust_zones',
                evaluationId: this.evaluationCount,
                zone: {
                    description: bestZone.description,
                    robustnessScore: bestZone.robustnessScore,
                    sampleSize: bestZone.sampleSize,
                    featureRanges: Object.keys(bestZone.featureRanges).length
                },
                membership: {
                    score: membership,
                    inOptimalZone: membership > 0.8,
                    inAcceptableZone: membership > 0.5
                },
                confidence: Math.max(0.1, Math.min(0.9, confidence)),
                explorationMode: explorationStatus.inExploration,
                processingTime: Date.now() - startTime
            };
            
            // FOCUSED LOGGING: Only log zone transitions and exploration events
            if (explorationStatus.justEntered) {
                console.log(`🔍 [EXPLORATION-ENTERED] ${zoneKey}: ${explorationStatus.reason}`);
            } else if (explorationStatus.justExited) {
                console.log(`✅ [EXPLORATION-EXITED] ${zoneKey}: Found stable zone (${(confidence*100).toFixed(0)}% confidence)`);
            } else if (explorationStatus.inExploration) {
                console.log(`🔍 [EXPLORING] ${zoneKey}: Confidence ${(confidence*100).toFixed(0)}%, Membership ${(membership*100).toFixed(0)}%`);
            }
            // No logging for normal stable operation
            
            return result;
            
        } catch (error) {
            console.log(`[0%] Robust zones analysis failed ERROR: ${error.message}`);
            return this.createFallbackResponse();
        }
    }
    
    /**
     * Get graduated data using existing memory manager pipeline
     */
    async getGraduatedData(instrument, direction, memoryManager) {
        // Normalize instrument name to match graduation table keys (MGC AUG25 -> MGC)
        const normalizedInstrument = memoryManager.normalizeInstrumentName(instrument);
        const graduationTable = memoryManager.getGraduationTable(normalizedInstrument, direction);
        
        if (!graduationTable || !graduationTable.features) {
            console.log(`[ROBUST-ZONES] No graduation data for ${normalizedInstrument}_${direction}`);
            return null;
        }
        
        // Get actual vector data for this instrument+direction
        const vectorData = memoryManager.getVectorsForInstrumentDirection(normalizedInstrument, direction);
        const featureNames = graduationTable.features.map(f => f.name); // Pre-selected optimal features
        
        // Removed verbose vector logging - focus on exploration mode only
        return { vectorData, featureNames, graduationTable };
    }
    
    /**
     * Find the most robust profitable zone from vector data
     */
    async findBestZone(vectorData, featureNames) {
        if (vectorData.length < this.config.minProfitableTradesInZone) {
            return this.createMinimalZone('insufficient_data', vectorData.length);
        }
        
        // Separate profitable vs unprofitable trades using normalized PnL
        const profitable = vectorData.filter(trade => 
            (trade.pnlPerContract || trade.pnl || 0) > this.config.profitThresholdPerContract
        );
        const unprofitable = vectorData.filter(trade => 
            (trade.pnlPerContract || trade.pnl || 0) <= this.config.profitThresholdPerContract
        );
        
        if (profitable.length < this.config.minProfitableTradesInZone) {
            return this.createMinimalZone('insufficient_profitable', profitable.length);
        }
        
        // Removed verbose analysis logging - focus on exploration mode only
        
        // Calculate feature ranges within profitable trades (the "zone")
        const featureRanges = this.calculateFeatureRanges(profitable, featureNames);
        
        // Calculate robustness metrics
        const profitability = this.calculateZoneProfitability(profitable);
        const variability = this.calculateGradientTolerance(profitable, featureNames);
        const consistency = this.calculateProfitConsistency(profitable);
        const sampleBonus = Math.min(profitable.length / 100, 1.0);
        
        // Combined robustness score
        const robustnessScore = (
            profitability * this.config.robustnessWeights.profitability +
            variability * this.config.robustnessWeights.variability +
            consistency * this.config.robustnessWeights.consistency +
            sampleBonus * this.config.robustnessWeights.sampleSize
        );
        
        return {
            featureRanges,
            robustnessScore,
            sampleSize: profitable.length,
            description: `Robust zone (var:${(variability*100).toFixed(0)}%, prof:$${profitability.toFixed(0)})`,
            metrics: { profitability, variability, consistency, sampleBonus },
            lastUpdated: Date.now()
        };
    }
    
    /**
     * Calculate feature ranges for profitable trades
     */
    calculateFeatureRanges(profitableTrades, featureNames) {
        const ranges = {};
        
        for (const featureName of featureNames) {
            const values = profitableTrades
                .map(trade => {
                    try {
                        const features = JSON.parse(trade.featuresJson || '{}');
                        return features[featureName];
                    } catch (e) {
                        return null;
                    }
                })
                .filter(val => typeof val === 'number' && !isNaN(val));
            
            if (values.length >= 10) { // Require minimum sample
                const sorted = values.sort((a, b) => a - b);
                
                ranges[featureName] = {
                    optimal: {
                        min: this.percentile(sorted, 25),   // Q1-Q3 = optimal zone
                        max: this.percentile(sorted, 75)
                    },
                    acceptable: {
                        min: this.percentile(sorted, 10),   // P10-P90 = acceptable zone
                        max: this.percentile(sorted, 90)
                    },
                    tolerance: this.calculateStandardDeviation(values),
                    sampleSize: values.length
                };
            }
        }
        
        return ranges;
    }
    
    /**
     * Calculate gradient tolerance (variability metric)
     * Higher variability = more robust zone
     */
    calculateGradientTolerance(profitableTrades, featureNames) {
        let totalRangeWidth = 0;
        let validFeatures = 0;
        
        for (const featureName of featureNames) {
            const values = profitableTrades
                .map(trade => {
                    try {
                        const features = JSON.parse(trade.featuresJson || '{}');
                        return features[featureName];
                    } catch (e) {
                        return null;
                    }
                })
                .filter(val => typeof val === 'number' && !isNaN(val));
            
            if (values.length >= 10) {
                const range = Math.max(...values) - Math.min(...values);
                const meanValue = values.reduce((sum, v) => sum + v, 0) / values.length;
                
                // Normalized range width (wider = more tolerant = better)
                const normalizedRange = meanValue !== 0 ? range / Math.abs(meanValue) : range;
                totalRangeWidth += normalizedRange;
                validFeatures++;
            }
        }
        
        // Average normalized range width (0-1 scale, higher = more robust)
        return validFeatures > 0 ? Math.min(1.0, totalRangeWidth / validFeatures) : 0;
    }
    
    /**
     * Calculate zone profitability (average profit)
     */
    calculateZoneProfitability(profitableTrades) {
        const totalProfit = profitableTrades.reduce((sum, trade) => 
            sum + (trade.pnlPerContract || trade.pnl || 0), 0
        );
        return totalProfit / profitableTrades.length; // Average profit per trade
    }
    
    /**
     * Calculate profit consistency (how stable profits are despite feature variation)
     */
    calculateProfitConsistency(profitableTrades) {
        const profits = profitableTrades.map(trade => trade.pnlPerContract || trade.pnl || 0);
        const avgProfit = profits.reduce((sum, p) => sum + p, 0) / profits.length;
        const variance = profits.reduce((sum, p) => sum + Math.pow(p - avgProfit, 2), 0) / profits.length;
        const stdDev = Math.sqrt(variance);
        
        // Consistency = 1 - (coefficient of variation)
        // Lower variation = higher consistency
        return avgProfit > 0 ? Math.max(0, 1 - (stdDev / avgProfit)) : 0;
    }
    
    /**
     * Test zone membership for query features
     */
    testZoneMembership(queryFeatures, zone) {
        let totalScore = 0;
        let validFeatures = 0;
        
        // queryFeatures comes from NinjaTrader via req.body.features
        for (const [featureName, featureValue] of Object.entries(queryFeatures)) {
            if (!zone.featureRanges[featureName] || typeof featureValue !== 'number') continue;
            
            const membership = this.calculateMembershipScore(featureValue, zone.featureRanges[featureName]);
            totalScore += membership;
            validFeatures++;
        }
        
        return validFeatures > 0 ? totalScore / validFeatures : 0;
    }
    
    /**
     * Calculate membership score for individual feature
     */
    calculateMembershipScore(value, zoneRange) {
        if (value >= zoneRange.optimal.min && value <= zoneRange.optimal.max) {
            return 1.0; // Perfect membership in optimal zone
        } else if (value >= zoneRange.acceptable.min && value <= zoneRange.acceptable.max) {
            return 0.6; // Acceptable membership
        } else {
            // Calculate proximity to acceptable range
            const distanceToRange = Math.min(
                Math.abs(value - zoneRange.acceptable.min),
                Math.abs(value - zoneRange.acceptable.max)
            );
            return Math.max(0.1, 0.5 * Math.exp(-distanceToRange / (zoneRange.tolerance || 1)));
        }
    }
    
    /**
     * Check if zone should be updated (every 50 evaluations)
     */
    shouldUpdateZone(zone) {
        const updateInterval = 50; // Update every 50 evaluations
        return (this.evaluationCount % updateInterval) === 0;
    }
    
    /**
     * Check exploration mode status and detect transitions
     */
    checkExplorationMode(zoneKey, confidence, membership) {
        // Get current exploration state
        let explorationState = this.explorationMode.get(zoneKey) || {
            inExploration: false,
            consecutiveLowConfidence: 0,
            consecutiveLowMembership: 0,
            enteredAt: null,
            reason: null
        };
        
        const wasExploring = explorationState.inExploration;
        
        // Track consecutive poor performance
        if (confidence < 0.5) {
            explorationState.consecutiveLowConfidence++;
        } else {
            explorationState.consecutiveLowConfidence = 0;
        }
        
        if (membership < 0.4) {
            explorationState.consecutiveLowMembership++;
        } else {
            explorationState.consecutiveLowMembership = 0;
        }
        
        // Determine if we should enter exploration mode
        let shouldExplore = false;
        let reason = null;
        
        if (explorationState.consecutiveLowConfidence >= this.config.explorationTriggers.consecutiveLowConfidence) {
            shouldExplore = true;
            reason = `${explorationState.consecutiveLowConfidence} consecutive low confidence trades`;
        } else if (explorationState.consecutiveLowMembership >= this.config.explorationTriggers.lowMembershipStreak) {
            shouldExplore = true;
            reason = `${explorationState.consecutiveLowMembership} consecutive trades outside zone`;
        }
        
        // Determine if we should exit exploration mode
        const shouldExitExploration = explorationState.inExploration && 
                                    confidence > 0.7 && 
                                    membership > 0.6;
        
        // Update exploration state
        if (shouldExplore && !explorationState.inExploration) {
            // Entering exploration mode
            explorationState.inExploration = true;
            explorationState.enteredAt = Date.now();
            explorationState.reason = reason;
        } else if (shouldExitExploration) {
            // Exiting exploration mode
            explorationState.inExploration = false;
            explorationState.consecutiveLowConfidence = 0;
            explorationState.consecutiveLowMembership = 0;
        }
        
        // Store updated state
        this.explorationMode.set(zoneKey, explorationState);
        
        return {
            inExploration: explorationState.inExploration,
            justEntered: shouldExplore && !wasExploring,
            justExited: shouldExitExploration,
            reason: explorationState.reason
        };
    }
    
    /**
     * Create minimal zone for insufficient data cases
     */
    createMinimalZone(reason, sampleSize) {
        return {
            featureRanges: {},
            robustnessScore: 0.3, // Conservative default
            sampleSize: sampleSize,
            description: `Minimal zone (${reason})`,
            metrics: { profitability: 0, variability: 0, consistency: 0, sampleBonus: 0 },
            lastUpdated: Date.now()
        };
    }
    
    /**
     * Create fallback response for errors
     */
    createFallbackResponse() {
        return {
            method: 'robust_zones_fallback',
            evaluationId: this.evaluationCount,
            confidence: 0.5,
            zone: { description: 'Fallback zone', robustnessScore: 0.5 },
            membership: { score: 0.5 },
            processingTime: 0
        };
    }
    
    // ===== UTILITY METHODS =====
    
    percentile(sortedArray, p) {
        const index = (p / 100) * (sortedArray.length - 1);
        const floor = Math.floor(index);
        const ceil = Math.ceil(index);
        
        if (floor === ceil) {
            return sortedArray[floor];
        }
        
        const weight = index - floor;
        return sortedArray[floor] * (1 - weight) + sortedArray[ceil] * weight;
    }
    
    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
}

module.exports = RobustZoneEngine;