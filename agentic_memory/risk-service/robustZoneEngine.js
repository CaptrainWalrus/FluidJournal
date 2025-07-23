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
        this.profitableZones = new Map(); // Cache for profitable zones by key
        
        // Zone evolution configuration
        this.zoneUpdateInterval = 15 * 60 * 1000; // Update zones every 15 minutes
        this.recentWindowSize = 100; // Focus on last 100 trades per instrument
        this.minTradesForUpdate = 20; // Need at least 20 recent trades to update
        
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
        
        // Start periodic zone evolution
        this.startZoneEvolution();
        
        // Track recent PnL performance for exploration triggers
        this.recentPerformance = new Map(); // instrument_direction -> performance metrics
        
        // Incremental path selection and stability tracking
        this.equityCurveStability = new Map(); // instrument_direction -> stability metrics
        this.adjustmentCycles = new Map(); // instrument_direction -> adjustment cycle state
        this.waitingPeriods = new Map(); // instrument_direction -> waiting period state
        
        // Zone visual indicators and status
        this.zoneIcons = new Map(); // instrument_direction -> zone icon/status
    }
    
    /**
     * Start periodic zone updates to adapt to changing market conditions
     */
    startZoneEvolution() {
        setInterval(async () => {
            console.log('[ROBUST-ZONES] Starting periodic zone evolution update...');
            await this.evolveAllZones();
        }, this.zoneUpdateInterval);
    }
    
    /**
     * Update all zones based on recent performance
     */
    async evolveAllZones() {
        let updatedCount = 0;
        const updatePromises = [];
        
        // Update each instrument+direction+entryType combination
        for (const [zoneKey, currentZone] of this.profitableZones) {
            updatePromises.push(this.evolveZone(zoneKey, currentZone));
        }
        
        const results = await Promise.all(updatePromises);
        updatedCount = results.filter(r => r).length;
        
        console.log(`[ROBUST-ZONES] Evolution complete: ${updatedCount} zones updated`);
    }
    
    /**
     * Evolve a single zone based on recent performance
     */
    async evolveZone(zoneKey, currentZone) {
        try {
            const [instrument, direction, entryType] = zoneKey.split('_');
            
            // Note: This will be populated when memoryManager is passed
            // For now, return false to indicate no update
            console.log(`[ROBUST-ZONES] Zone evolution for ${zoneKey} requires memoryManager integration`);
            return false;
            
        } catch (error) {
            console.error(`[ROBUST-ZONES] Error evolving zone ${zoneKey}:`, error.message);
            return false;
        }
    }
    
    /**
     * Main analysis entry point
     */
    async analyze(queryFeatures, instrument, direction, memoryManager, entryType = null) {
        this.evaluationCount++;
        const startTime = Date.now();
        
        try {
            // Build zone key with entry type if provided
            const zoneKey = entryType ? `${instrument}_${direction}_${entryType}` : `${instrument}_${direction}`;
            console.log(`[ROBUST-ZONES] Analysis ${this.evaluationCount}: ${zoneKey}`);
            
            // Check if we need to update zones (time-based or performance-based)
            await this.checkZoneUpdate(zoneKey, memoryManager);
            
            // Get graduated data for this instrument+direction pair
            const graduatedData = await this.getGraduatedData(instrument, direction, memoryManager);
            if (!graduatedData) {
                console.log(`[ROBUST-ZONES] No graduation data for ${zoneKey}`);
                return this.createFallbackResponse();
            }
            
            // Analyze equity curve stability using recent trades
            const stability = this.analyzeEquityCurveStability(zoneKey, graduatedData.vectorData.slice(-30));
            
            // Check incremental adjustment cycle
            const performance = this.recentPerformance.get(zoneKey) || { consecutiveLosses: 0, totalPnL: 0 };
            const adjustmentCycle = this.manageIncrementalAdjustments(zoneKey, stability, performance);
            
            // Handle waiting period - return early if still waiting
            if (adjustmentCycle.action === 'wait') {
                const currentZone = this.currentBestZones.get(zoneKey);
                if (currentZone) {
                    const membership = this.testZoneMembership(queryFeatures, currentZone);
                    return {
                        method: 'robust_zones_waiting',
                        evaluationId: this.evaluationCount,
                        zone: {
                            description: `${currentZone.description} (waiting ${adjustmentCycle.tradesRemaining} trades)`,
                            robustnessScore: currentZone.robustnessScore,
                            sampleSize: currentZone.sampleSize,
                            icon: stability.icon,
                            stability: stability.stability,
                            degradationLevel: stability.degradationLevel
                        },
                        membership: { score: membership, inOptimalZone: membership > 0.8, inAcceptableZone: membership > 0.5 },
                        confidence: Math.max(0.1, Math.min(0.9, membership * currentZone.robustnessScore)),
                        adjustmentCycle: adjustmentCycle,
                        stability: stability,
                        processingTime: Date.now() - startTime
                    };
                }
            }
            
            let bestZone = this.currentBestZones.get(zoneKey);
            
            if (!bestZone || this.shouldUpdateZone(bestZone) || adjustmentCycle.action === 'adjust') {
                console.log(`[ROBUST-ZONES] Computing new best zone for ${zoneKey} (${adjustmentCycle.action})`);
                bestZone = await this.findBestZone(graduatedData.vectorData, graduatedData.featureNames);
                this.currentBestZones.set(zoneKey, bestZone);
                
                // Apply incremental adjustment if needed
                if (adjustmentCycle.action === 'adjust') {
                    bestZone = this.applyIncrementalAdjustment(bestZone, adjustmentCycle.adjustmentType, stability);
                }
            }
            
            // Test query features against best zone
            const membership = this.testZoneMembership(queryFeatures, bestZone);
            let confidence = membership * bestZone.robustnessScore;
            
            // Check if we should enter exploration mode
            const explorationStatus = this.checkExplorationMode(zoneKey, confidence, membership);
            
            // EXPLORATION MODE BEHAVIOR: Modify decision-making when in exploration
            let explorationAdjustment = null;
            if (explorationStatus.inExploration) {
                explorationAdjustment = this.applyExplorationBehavior(queryFeatures, bestZone, confidence, membership, zoneKey);
                confidence = explorationAdjustment.adjustedConfidence;
            }
            
            const result = {
                method: 'robust_zones',
                evaluationId: this.evaluationCount,
                zone: {
                    description: bestZone.description,
                    robustnessScore: bestZone.robustnessScore,
                    sampleSize: bestZone.sampleSize,
                    featureRanges: Object.keys(bestZone.featureRanges).length,
                    icon: stability.icon,
                    stability: stability.stability,
                    degradationLevel: stability.degradationLevel
                },
                membership: {
                    score: membership,
                    inOptimalZone: membership > 0.8,
                    inAcceptableZone: membership > 0.5
                },
                confidence: Math.max(0.1, Math.min(0.9, confidence)),
                explorationMode: explorationStatus.inExploration,
                explorationAdjustment: explorationAdjustment,
                adjustmentCycle: adjustmentCycle,
                stability: stability,
                processingTime: Date.now() - startTime
            };
            
            // FOCUSED LOGGING: Only log zone transitions, exploration events, and stability changes
            if (explorationStatus.justEntered) {
                console.log(`🔍 [EXPLORATION-ENTERED] ${zoneKey}: ${explorationStatus.reason}`);
            } else if (explorationStatus.justExited) {
                console.log(`✅ [EXPLORATION-EXITED] ${zoneKey}: Found stable zone (${(confidence*100).toFixed(0)}% confidence)`);
            } else if (explorationStatus.inExploration) {
                console.log(`🔍 [EXPLORING] ${zoneKey}: Confidence ${(confidence*100).toFixed(0)}%, Membership ${(membership*100).toFixed(0)}%`);
            }
            
            // Log stability and adjustment cycle status
            if (adjustmentCycle.action === 'adjust') {
                console.log(`${stability.icon} [STABILITY-ALERT] ${zoneKey}: ${stability.degradationLevel} degradation (${(stability.stability*100).toFixed(0)}% stable) - ${adjustmentCycle.adjustmentType}`);
            } else if (adjustmentCycle.action === 'wait') {
                console.log(`⏳ [WAITING-CYCLE] ${zoneKey}: ${adjustmentCycle.tradesRemaining} trades remaining`);
            } else if (stability.degradationLevel !== 'none') {
                console.log(`${stability.icon} [STABILITY-MONITOR] ${zoneKey}: ${stability.degradationLevel} degradation (${(stability.stability*100).toFixed(0)}% stable)`);
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
    /**
     * Check if zone needs update based on time or performance
     */
    async checkZoneUpdate(zoneKey, memoryManager) {
        const lastUpdate = this.lastZoneUpdate.get(zoneKey) || 0;
        const timeSinceUpdate = Date.now() - lastUpdate;
        
        // Time-based update
        if (timeSinceUpdate > this.zoneUpdateInterval) {
            console.log(`[ROBUST-ZONES] Zone ${zoneKey} due for time-based update`);
            await this.updateZone(zoneKey, memoryManager);
        }
    }
    
    /**
     * Update a specific zone with recent data
     */
    async updateZone(zoneKey, memoryManager) {
        try {
            const [instrument, direction, entryType] = zoneKey.split('_');
            
            // Get recent trades for this specific combination
            const allVectors = memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            
            // Filter by entry type if specified
            let relevantVectors = allVectors;
            if (entryType) {
                relevantVectors = allVectors.filter(v => v.entryType === entryType);
                console.log(`[ROBUST-ZONES] Filtered to ${relevantVectors.length} ${entryType} trades`);
            }
            
            // Use only recent trades (rolling window)
            const sortedVectors = relevantVectors.sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            const recentVectors = sortedVectors.slice(0, this.recentWindowSize);
            
            if (recentVectors.length < this.minTradesForUpdate) {
                // Check if we're in a recovery situation to provide more context
                const isRecoveryMode = recentVectors.some(v => (v.pnlPerContract || v.pnl) < -20);
                
                if (isRecoveryMode && recentVectors.length > 0) {
                    console.log(`[ROBUST-ZONES] 🔄 Limited data for recovery optimization: ${recentVectors.length} trades (need ${this.minTradesForUpdate}) - zone ${zoneKey}`);
                } else if (recentVectors.length === 0) {
                    console.log(`[ROBUST-ZONES] ⚪ No recent trades for zone ${zoneKey} - waiting for market activity`);
                } else {
                    console.log(`[ROBUST-ZONES] Not enough recent trades (${recentVectors.length}) to update ${zoneKey}`);
                }
                return;
            }
            
            // Get graduated features for zone building
            const graduationTable = memoryManager.getGraduationTable(
                memoryManager.normalizeInstrumentName(instrument), 
                direction
            );
            const graduatedFeatures = graduationTable?.features || [];
            
            // Build new zones from recent data
            const profitableRecent = recentVectors.filter(v => 
                (v.pnlPerContract || v.pnl) > this.config.profitThresholdPerContract
            );
            
            if (profitableRecent.length >= this.config.minProfitableTradesInZone) {
                const newZone = await this.buildRobustZonesFromVectors(profitableRecent, graduatedFeatures);
                this.profitableZones.set(zoneKey, newZone);
                this.currentBestZones.set(zoneKey, newZone);
                this.lastZoneUpdate.set(zoneKey, Date.now());
                console.log(`[ROBUST-ZONES] Updated ${zoneKey} with ${profitableRecent.length} profitable trades from last ${recentVectors.length}`);
            } else {
                console.log(`[ROBUST-ZONES] Not enough profitable trades (${profitableRecent.length}) for ${zoneKey}`);
            }
            
        } catch (error) {
            console.error(`[ROBUST-ZONES] Error updating zone ${zoneKey}:`, error.message);
        }
    }
    
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
     * Apply exploration mode behavior - change decision-making when performance is poor
     */
    applyExplorationBehavior(queryFeatures, zone, originalConfidence, membership, zoneKey) {
        const adjustments = {
            type: 'exploration',
            originalConfidence: originalConfidence,
            adjustedConfidence: originalConfidence,
            actions: [],
            reasoning: []
        };
        
        // Get exploration state
        const explorationState = this.explorationMode.get(zoneKey);
        const timeInExploration = Date.now() - (explorationState.enteredAt || Date.now());
        const daysInExploration = timeInExploration / (1000 * 60 * 60 * 24);
        
        // EXPLORATION STRATEGY 1: Reject trades outside optimal zones (tighten requirements)
        if (membership < 0.6) {
            adjustments.adjustedConfidence = Math.min(0.2, originalConfidence);
            adjustments.actions.push('strict_zone_enforcement');
            adjustments.reasoning.push(`Tightened zone requirements (membership ${(membership*100).toFixed(0)}% < 60%)`);
        }
        
        // EXPLORATION STRATEGY 2: Reduce confidence for moderate signals (be more selective)
        else if (originalConfidence > 0.4 && originalConfidence < 0.7) {
            adjustments.adjustedConfidence = originalConfidence * 0.6; // 40% penalty
            adjustments.actions.push('confidence_penalty');
            adjustments.reasoning.push('Applied exploration mode confidence penalty (40%)');
        }
        
        // EXPLORATION STRATEGY 3: Extended exploration = try opposite approach
        if (daysInExploration > 2) {
            // After 2+ days of poor performance, try completely different approach
            if (membership > 0.8 && originalConfidence > 0.6) {
                // Paradoxically REJECT what used to work well (maybe market changed)
                adjustments.adjustedConfidence = 0.15;
                adjustments.actions.push('reverse_logic');
                adjustments.reasoning.push(`Extended exploration (${daysInExploration.toFixed(1)} days): rejecting historically good patterns`);
            } else if (membership < 0.4) {
                // Try accepting what we normally reject (exploration of new territory)
                adjustments.adjustedConfidence = Math.max(0.55, originalConfidence * 1.5);
                adjustments.actions.push('expand_acceptance');
                adjustments.reasoning.push('Extended exploration: accepting normally rejected patterns');
            }
        }
        
        // EXPLORATION STRATEGY 4: Increase selectivity over time
        const selectivityMultiplier = Math.max(0.3, 1 - (daysInExploration * 0.1)); // Become 10% more selective per day
        adjustments.adjustedConfidence *= selectivityMultiplier;
        
        if (selectivityMultiplier < 0.9) {
            adjustments.actions.push('time_based_selectivity');
            adjustments.reasoning.push(`Increased selectivity (day ${daysInExploration.toFixed(1)}): ${(selectivityMultiplier*100).toFixed(0)}% multiplier`);
        }
        
        return adjustments;
    }
    
    /**
     * Analyze equity curve stability and detect degradation patterns
     */
    analyzeEquityCurveStability(zoneKey, recentTrades) {
        if (recentTrades.length < 10) {
            return {
                isStable: true,
                stability: 0.5,
                degradationLevel: 'none',
                icon: '🟢',
                reason: 'Insufficient data for stability analysis'
            };
        }
        
        // Sort trades by timestamp to get chronological equity curve
        const sortedTrades = recentTrades.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Calculate cumulative PnL curve
        let cumulativePnL = 0;
        const equityCurve = sortedTrades.map(trade => {
            cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
            return cumulativePnL;
        });
        
        // Stability metrics
        const stability = this.calculateEquityCurveStability(equityCurve);
        const degradation = this.detectEquityDegradation(equityCurve);
        const icon = this.getStabilityIcon(stability.score, degradation.level);
        
        const result = {
            isStable: stability.score > 0.6 && degradation.level !== 'severe',
            stability: stability.score,
            degradationLevel: degradation.level,
            icon: icon,
            reason: stability.reason,
            metrics: {
                volatility: stability.volatility,
                trendStrength: stability.trendStrength,
                drawdownSeverity: degradation.maxDrawdownPercent,
                consecutiveDown: degradation.consecutiveDownPeriods,
                recoveryTime: degradation.averageRecoveryTime
            }
        };
        
        // Store stability state
        this.equityCurveStability.set(zoneKey, result);
        
        return result;
    }
    
    /**
     * Calculate equity curve stability score
     */
    calculateEquityCurveStability(equityCurve) {
        const length = equityCurve.length;
        if (length < 5) return { score: 0.5, reason: 'Too few data points', volatility: 0, trendStrength: 0 };
        
        // Calculate volatility (lower = more stable)
        const mean = equityCurve.reduce((sum, val) => sum + val, 0) / length;
        const variance = equityCurve.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / length;
        const volatility = Math.sqrt(variance);
        
        // Calculate trend strength (consistent upward trend = stable)
        let upwardPeriods = 0;
        for (let i = 1; i < length; i++) {
            if (equityCurve[i] > equityCurve[i-1]) upwardPeriods++;
        }
        const trendStrength = upwardPeriods / (length - 1);
        
        // Calculate smoothness (fewer sharp reversals = more stable)
        let reversals = 0;
        for (let i = 2; i < length; i++) {
            const prev = equityCurve[i-1] - equityCurve[i-2];
            const curr = equityCurve[i] - equityCurve[i-1];
            if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
                reversals++;
            }
        }
        const smoothness = 1 - (reversals / (length - 2));
        
        // Combined stability score (0-1 scale)
        const volatilityScore = Math.max(0, 1 - (volatility / 100)); // Normalize volatility
        const stabilityScore = (trendStrength * 0.4) + (smoothness * 0.4) + (volatilityScore * 0.2);
        
        let reason = '';
        if (stabilityScore > 0.8) reason = 'Excellent stability - consistent upward trend';
        else if (stabilityScore > 0.6) reason = 'Good stability - mostly positive progression';
        else if (stabilityScore > 0.4) reason = 'Moderate stability - some volatility present';
        else reason = 'Poor stability - high volatility and reversals';
        
        return {
            score: Math.max(0, Math.min(1, stabilityScore)),
            reason: reason,
            volatility: volatility,
            trendStrength: trendStrength
        };
    }
    
    /**
     * Detect equity curve degradation patterns
     */
    detectEquityDegradation(equityCurve) {
        const length = equityCurve.length;
        if (length < 5) return { level: 'none', maxDrawdownPercent: 0, consecutiveDownPeriods: 0, averageRecoveryTime: 0 };
        
        // Find maximum drawdown
        let peak = equityCurve[0];
        let maxDrawdown = 0;
        let maxDrawdownPercent = 0;
        
        for (let i = 1; i < length; i++) {
            if (equityCurve[i] > peak) {
                peak = equityCurve[i];
            } else {
                const drawdown = peak - equityCurve[i];
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                    maxDrawdownPercent = peak !== 0 ? (drawdown / Math.abs(peak)) * 100 : 0;
                }
            }
        }
        
        // Count consecutive down periods
        let consecutiveDown = 0;
        let maxConsecutiveDown = 0;
        for (let i = 1; i < length; i++) {
            if (equityCurve[i] < equityCurve[i-1]) {
                consecutiveDown++;
                maxConsecutiveDown = Math.max(maxConsecutiveDown, consecutiveDown);
            } else {
                consecutiveDown = 0;
            }
        }
        
        // Determine degradation level
        let level = 'none';
        if (maxDrawdownPercent > 30 || maxConsecutiveDown > 5) {
            level = 'severe';
        } else if (maxDrawdownPercent > 15 || maxConsecutiveDown > 3) {
            level = 'moderate';
        } else if (maxDrawdownPercent > 8 || maxConsecutiveDown > 2) {
            level = 'mild';
        }
        
        return {
            level: level,
            maxDrawdownPercent: maxDrawdownPercent,
            consecutiveDownPeriods: maxConsecutiveDown,
            averageRecoveryTime: 0 // TODO: Calculate actual recovery time
        };
    }
    
    /**
     * Get appropriate icon for stability status
     */
    getStabilityIcon(stabilityScore, degradationLevel) {
        if (degradationLevel === 'severe') return '🔴';
        if (degradationLevel === 'moderate') return '🟠';
        if (stabilityScore > 0.8) return '🟢';
        if (stabilityScore > 0.6) return '🟡';
        if (stabilityScore > 0.4) return '🟠';
        return '🔴';
    }
    
    /**
     * Implement incremental path selection with waiting periods
     */
    manageIncrementalAdjustments(zoneKey, stability, performance) {
        const currentCycle = this.adjustmentCycles.get(zoneKey) || {
            phase: 'observe', // observe, adjust, wait
            adjustmentCount: 0,
            lastAdjustmentTime: 0,
            waitingTrades: 0,
            targetWaitTrades: 10, // Wait 10 trades between adjustments
            adjustmentHistory: []
        };
        
        const waitingState = this.waitingPeriods.get(zoneKey) || {
            isWaiting: false,
            tradesRemaining: 0,
            adjustmentType: null,
            startTime: 0
        };
        
        // Check if we're in waiting period
        if (waitingState.isWaiting) {
            waitingState.tradesRemaining--;
            
            if (waitingState.tradesRemaining <= 0) {
                // Waiting period complete
                waitingState.isWaiting = false;
                currentCycle.phase = 'observe';
                console.log(`⏰ [INCREMENTAL-CYCLE] ${zoneKey}: Waiting period complete, entering observation phase`);
            } else {
                console.log(`⏳ [INCREMENTAL-CYCLE] ${zoneKey}: Waiting ${waitingState.tradesRemaining} more trades before next adjustment`);
                this.waitingPeriods.set(zoneKey, waitingState);
                return { action: 'wait', tradesRemaining: waitingState.tradesRemaining };
            }
        }
        
        // Determine next action based on current phase and stability
        let nextAction = 'observe';
        let adjustmentType = null;
        
        if (currentCycle.phase === 'observe') {
            // Analyze if adjustment is needed
            if (!stability.isStable || performance.consecutiveLosses >= 2) {
                nextAction = 'adjust';
                adjustmentType = this.selectAdjustmentPath(stability, performance, currentCycle);
                currentCycle.phase = 'adjust';
                currentCycle.adjustmentCount++;
                currentCycle.lastAdjustmentTime = Date.now();
            }
        } else if (currentCycle.phase === 'adjust') {
            // Apply adjustment and enter waiting period
            nextAction = 'wait';
            currentCycle.phase = 'wait';
            waitingState.isWaiting = true;
            waitingState.tradesRemaining = currentCycle.targetWaitTrades;
            waitingState.adjustmentType = adjustmentType;
            waitingState.startTime = Date.now();
            
            console.log(`🔧 [INCREMENTAL-CYCLE] ${zoneKey}: Applied ${adjustmentType} adjustment, entering ${currentCycle.targetWaitTrades}-trade waiting period`);
        }
        
        // Store updated states
        this.adjustmentCycles.set(zoneKey, currentCycle);
        this.waitingPeriods.set(zoneKey, waitingState);
        
        return {
            action: nextAction,
            adjustmentType: adjustmentType,
            phase: currentCycle.phase,
            tradesRemaining: waitingState.tradesRemaining,
            adjustmentCount: currentCycle.adjustmentCount
        };
    }
    
    /**
     * Select optimal incremental adjustment path
     */
    selectAdjustmentPath(stability, performance, currentCycle) {
        const adjustmentHistory = currentCycle.adjustmentHistory;
        
        // Avoid repeating failed adjustments
        const recentAdjustments = adjustmentHistory.slice(-3);
        
        // Selection priority based on stability issues
        if (stability.degradationLevel === 'severe') {
            if (!recentAdjustments.includes('reset_zone')) {
                return 'reset_zone';
            } else if (!recentAdjustments.includes('tighten_strict')) {
                return 'tighten_strict';
            }
        } else if (stability.degradationLevel === 'moderate') {
            if (!recentAdjustments.includes('tighten_moderate')) {
                return 'tighten_moderate';
            } else if (!recentAdjustments.includes('feature_refresh')) {
                return 'feature_refresh';
            }
        } else if (performance.consecutiveLosses >= 3) {
            if (!recentAdjustments.includes('confidence_penalty')) {
                return 'confidence_penalty';
            } else if (!recentAdjustments.includes('expand_tolerance')) {
                return 'expand_tolerance';
            }
        }
        
        // Default incremental adjustment
        return 'gentle_tighten';
    }
    
    /**
     * Apply incremental adjustment to zone based on selected path
     */
    applyIncrementalAdjustment(zone, adjustmentType, stability) {
        const adjustedZone = JSON.parse(JSON.stringify(zone)); // Deep copy
        
        switch (adjustmentType) {
            case 'reset_zone':
                // Reset to more permissive zone
                Object.keys(adjustedZone.featureRanges).forEach(feature => {
                    const range = adjustedZone.featureRanges[feature];
                    const center = (range.optimal.min + range.optimal.max) / 2;
                    const expansion = Math.abs(range.optimal.max - range.optimal.min) * 0.5;
                    range.optimal.min = center - expansion;
                    range.optimal.max = center + expansion;
                    range.acceptable.min = center - (expansion * 1.5);
                    range.acceptable.max = center + (expansion * 1.5);
                });
                adjustedZone.description = `${zone.description} (RESET 🔄)`;
                console.log(`🔄 [INCREMENTAL] Applied reset_zone adjustment`);
                break;
                
            case 'tighten_strict':
                // Significantly tighten zone requirements
                Object.keys(adjustedZone.featureRanges).forEach(feature => {
                    const range = adjustedZone.featureRanges[feature];
                    const optimalWidth = range.optimal.max - range.optimal.min;
                    const center = (range.optimal.min + range.optimal.max) / 2;
                    range.optimal.min = center - (optimalWidth * 0.3);
                    range.optimal.max = center + (optimalWidth * 0.3);
                });
                adjustedZone.description = `${zone.description} (STRICT 🔒)`;
                adjustedZone.robustnessScore *= 0.8; // Reduce robustness due to tightening
                console.log(`🔒 [INCREMENTAL] Applied tighten_strict adjustment`);
                break;
                
            case 'tighten_moderate':
                // Moderately tighten zone requirements
                Object.keys(adjustedZone.featureRanges).forEach(feature => {
                    const range = adjustedZone.featureRanges[feature];
                    const optimalWidth = range.optimal.max - range.optimal.min;
                    const center = (range.optimal.min + range.optimal.max) / 2;
                    range.optimal.min = center - (optimalWidth * 0.6);
                    range.optimal.max = center + (optimalWidth * 0.6);
                });
                adjustedZone.description = `${zone.description} (MODERATE 🎯)`;
                adjustedZone.robustnessScore *= 0.9;
                console.log(`🎯 [INCREMENTAL] Applied tighten_moderate adjustment`);
                break;
                
            case 'expand_tolerance':
                // Expand zone tolerance for more acceptance
                Object.keys(adjustedZone.featureRanges).forEach(feature => {
                    const range = adjustedZone.featureRanges[feature];
                    const acceptableWidth = range.acceptable.max - range.acceptable.min;
                    const center = (range.acceptable.min + range.acceptable.max) / 2;
                    range.acceptable.min = center - (acceptableWidth * 0.7);
                    range.acceptable.max = center + (acceptableWidth * 0.7);
                });
                adjustedZone.description = `${zone.description} (EXPANDED 📈)`;
                adjustedZone.robustnessScore *= 1.1; // Slight boost for increased tolerance
                console.log(`📈 [INCREMENTAL] Applied expand_tolerance adjustment`);
                break;
                
            case 'confidence_penalty':
                // Reduce confidence scoring without changing zones
                adjustedZone.robustnessScore *= 0.85;
                adjustedZone.description = `${zone.description} (PENALTY ⚠️)`;
                console.log(`⚠️ [INCREMENTAL] Applied confidence_penalty adjustment`);
                break;
                
            case 'feature_refresh':
                // Mark for feature refresh (handled in zone building)
                adjustedZone.description = `${zone.description} (REFRESH 🔄)`;
                adjustedZone.needsFeatureRefresh = true;
                console.log(`🔄 [INCREMENTAL] Applied feature_refresh adjustment`);
                break;
                
            case 'gentle_tighten':
            default:
                // Gentle tightening as default
                Object.keys(adjustedZone.featureRanges).forEach(feature => {
                    const range = adjustedZone.featureRanges[feature];
                    const optimalWidth = range.optimal.max - range.optimal.min;
                    const center = (range.optimal.min + range.optimal.max) / 2;
                    range.optimal.min = center - (optimalWidth * 0.8);
                    range.optimal.max = center + (optimalWidth * 0.8);
                });
                adjustedZone.description = `${zone.description} (GENTLE 🔧)`;
                adjustedZone.robustnessScore *= 0.95;
                console.log(`🔧 [INCREMENTAL] Applied gentle_tighten adjustment`);
                break;
        }
        
        // Add timestamp for tracking
        adjustedZone.lastAdjustment = {
            type: adjustmentType,
            timestamp: Date.now(),
            stabilityAtAdjustment: stability.stability
        };
        
        return adjustedZone;
    }
    
    /**
     * Process actual trade outcome for performance monitoring
     */
    recordTradeOutcome(instrument, direction, entryType, pnlPerContract, confidence, membership) {
        const zoneKey = entryType ? `${instrument}_${direction}_${entryType}` : `${instrument}_${direction}`;
        
        // Get or initialize performance tracking
        let performance = this.recentPerformance.get(zoneKey) || {
            trades: [],
            totalPnL: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            lastUpdateTime: Date.now()
        };
        
        // Add new trade result
        const tradeResult = {
            timestamp: Date.now(),
            pnlPerContract: pnlPerContract,
            confidence: confidence,
            membership: membership,
            isWin: pnlPerContract > 0
        };
        
        performance.trades.push(tradeResult);
        performance.totalPnL += pnlPerContract;
        performance.lastUpdateTime = Date.now();
        
        // Keep only last 20 trades for performance calculation
        if (performance.trades.length > 20) {
            const removedTrade = performance.trades.shift();
            performance.totalPnL -= removedTrade.pnlPerContract;
        }
        
        // Update consecutive counters
        if (pnlPerContract > 0) {
            performance.consecutiveWins++;
            performance.consecutiveLosses = 0;
        } else {
            performance.consecutiveLosses++;
            performance.consecutiveWins = 0;
        }
        
        // Store updated performance
        this.recentPerformance.set(zoneKey, performance);
        
        // Check if we should trigger exploration mode based on actual PnL
        this.checkPnLBasedExploration(zoneKey, performance);
        
        console.log(`📊 [PNL-TRACKING] ${zoneKey}: ${pnlPerContract > 0 ? 'WIN' : 'LOSS'} $${pnlPerContract.toFixed(2)} | ${performance.consecutiveLosses} consecutive losses | Running PnL: $${performance.totalPnL.toFixed(2)}`);
        
        return performance;
    }
    
    /**
     * Check if actual PnL performance should trigger exploration mode
     */
    checkPnLBasedExploration(zoneKey, performance) {
        const explorationState = this.explorationMode.get(zoneKey) || {
            inExploration: false,
            consecutiveLowConfidence: 0,
            consecutiveLowMembership: 0,
            enteredAt: null,
            reason: null
        };
        
        let shouldEnterExploration = false;
        let reason = null;
        
        // TRIGGER 1: Consecutive losses (more aggressive than confidence-based)
        if (performance.consecutiveLosses >= 3) {
            shouldEnterExploration = true;
            reason = `PnL-based: ${performance.consecutiveLosses} consecutive losses (total: $${performance.totalPnL.toFixed(2)})`;
        }
        
        // TRIGGER 2: Negative rolling PnL with at least 10 trades
        else if (performance.trades.length >= 10 && performance.totalPnL < -50) {
            shouldEnterExploration = true;
            reason = `PnL-based: Negative rolling performance $${performance.totalPnL.toFixed(2)} over ${performance.trades.length} trades`;
        }
        
        // TRIGGER 3: Poor win rate over recent trades
        else if (performance.trades.length >= 15) {
            const recentWins = performance.trades.filter(t => t.isWin).length;
            const winRate = recentWins / performance.trades.length;
            if (winRate < 0.3) {
                shouldEnterExploration = true;
                reason = `PnL-based: Poor win rate ${(winRate*100).toFixed(0)}% over ${performance.trades.length} trades`;
            }
        }
        
        // Enter exploration if triggered
        if (shouldEnterExploration && !explorationState.inExploration) {
            explorationState.inExploration = true;
            explorationState.enteredAt = Date.now();
            explorationState.reason = reason;
            this.explorationMode.set(zoneKey, explorationState);
            console.log(`🔍 [PNL-EXPLORATION-TRIGGERED] ${zoneKey}: ${reason}`);
        }
        
        // Exit exploration on good performance
        else if (explorationState.inExploration && performance.consecutiveWins >= 2 && performance.totalPnL > 0) {
            explorationState.inExploration = false;
            explorationState.consecutiveLowConfidence = 0;
            explorationState.consecutiveLowMembership = 0;
            this.explorationMode.set(zoneKey, explorationState);
            console.log(`✅ [PNL-EXPLORATION-ENDED] ${zoneKey}: 2 consecutive wins, positive PnL ($${performance.totalPnL.toFixed(2)})`);
        }
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
    
    /**
     * Build robust zones from vectors with graduated features
     */
    async buildRobustZonesFromVectors(profitableVectors, graduatedFeatures) {
        // Extract feature values for graduated features only
        const featureData = {};
        const featureNames = graduatedFeatures.map(f => f.name || f);
        
        // Convert vectors to the format expected by findBestZone
        const vectorData = profitableVectors.map(v => {
            // Ensure we have featuresJson
            if (!v.featuresJson && v.features) {
                v.featuresJson = JSON.stringify(v.features);
            }
            return v;
        });
        
        // Use existing zone building logic
        const zone = await this.findBestZone(vectorData, featureNames);
        return zone;
    }
}

module.exports = RobustZoneEngine;