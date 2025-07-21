const fs = require('fs');
const path = require('path');

/**
 * PrunedRangesEngine - Multi-dimensional clustering system for equity curve stability
 * Prioritizes smooth growth over profit maximization through dynamic feature clustering
 */
class PrunedRangesEngine {
    constructor() {
        this.featureCombinations = [];
        this.currentOptimalCombo = null;
        this.sessionPerformance = [];
        this.clusterQualityHistory = [];
        this.evaluationCount = 0;
        this.lastRotationTrade = 0;
        this.auditLogger = new AuditLogger();
        
        // Configuration
        this.config = {
            sessionWindowSize: 100,           // Last N trades to analyze
            rotationInterval: 50,             // Rotate features every N trades
            minClusterSize: 5,               // Minimum trades per cluster
            maxCombinations: 20,             // Max feature combinations to test
            scalabilityMultipliers: [1, 2, 5, 10],  // Position size multipliers to test
            clusterQualityThreshold: 0.6,    // Minimum acceptable cluster quality
            regimeChangeThreshold: 0.3       // Cluster quality drop indicating regime change
        };
        
        // Initialize feature combination pools
        this.initializeFeatureCombinations();
        
        this.auditLogger.log('system', 'ENGINE_INITIALIZED', {
            config: this.config,
            timestamp: Date.now()
        });
    }
    
    /**
     * Main analysis entry point - called by Risk Agent
     */
    async analyze(features, recentTrades, requestedScale = 1, queryEntryType = null) {
        this.evaluationCount++;
        const startTime = Date.now();
        
        try {
            // Update session performance
            this.updateSessionPerformance(recentTrades);
            
            // Check if feature rotation is needed
            if (this.shouldRotateFeatures()) {
                await this.rotateFeatureCombinations(recentTrades);
            }
            
            // Perform clustering analysis with entry type consideration
            const clusterAnalysis = await this.performClusterAnalysis(features, recentTrades, queryEntryType);
            
            // Validate scalability for requested position size
            const scalabilityAnalysis = await this.validateScalability(clusterAnalysis, requestedScale);
            
            // Detect regime changes
            const regimeStatus = this.detectRegimeChange(clusterAnalysis);
            
            // Calculate final risk parameters
            const riskParams = this.calculateRiskParameters(clusterAnalysis, scalabilityAnalysis, regimeStatus);
            
            // Calculate confidence with entry type performance consideration
            const baseConfidence = this.calculateOverallConfidence(clusterAnalysis, scalabilityAnalysis, regimeStatus);
            const entryTypeAdjustedConfidence = this.adjustConfidenceForEntryType(baseConfidence, queryEntryType, recentTrades);
            
            const result = {
                method: 'pruned_ranges',
                evaluationId: this.evaluationCount,
                cluster: clusterAnalysis,
                scalability: scalabilityAnalysis,
                regime: regimeStatus,
                confidence: entryTypeAdjustedConfidence,
                riskParams: riskParams,
                featureCombination: this.currentOptimalCombo,
                processingTime: Date.now() - startTime,
                entryTypeAnalysis: queryEntryType ? this.getEntryTypeAnalysis(queryEntryType, recentTrades) : null
            };
            
            // Audit log the complete decision
            this.auditLogger.log('analysis', 'FULL_ANALYSIS', {
                input: { features: Object.keys(features).length, tradesCount: recentTrades.length, requestedScale },
                output: result,
                timestamp: Date.now()
            });
            
            return result;
            
        } catch (error) {
            this.auditLogger.log('error', 'ANALYSIS_FAILED', {
                error: error.message,
                stack: error.stack,
                features: Object.keys(features || {}).length,
                timestamp: Date.now()
            });
            
            // Return safe fallback
            return this.createSafeFallback();
        }
    }
    
    /**
     * Initialize feature combination pools based on actual NinjaTrader feature names
     */
    initializeFeatureCombinations() {
        // High-variability feature groups for clustering (using actual NT feature names from SignalFeatures.cs)
        const technicalGroup = ['atr_percentage', 'rsi_14', 'macd_signal', 'bb_width'];
        const volumeGroup = ['volume_delta', 'volume_ratio_10', 'volume_spike_ratio'];
        const priceGroup = ['upper_wick_ratio', 'lower_wick_ratio', 'body_ratio', 'high_low_ratio'];
        const timeGroup = ['hour_of_day', 'day_of_week', 'minute_of_hour'];
        const patternGroup = ['inside_bar', 'is_doji', 'momentum_5'];
        const trajectoryGroup = ['pattern_v_recovery', 'pattern_steady_climb', 'pattern_failed_breakout'];
        
        // Create combinations of 3-5 features from different groups
        this.featureCombinations = [
            // Technical + Volume combinations
            [...technicalGroup.slice(0, 3), ...volumeGroup.slice(0, 2)],
            [...technicalGroup.slice(1, 4), ...volumeGroup.slice(1, 3)],
            
            // Price + Technical combinations  
            [...priceGroup.slice(0, 3), ...technicalGroup.slice(0, 2)],
            [...priceGroup.slice(1, 4), ...technicalGroup.slice(2, 4)],
            
            // Time + Pattern combinations
            [...timeGroup, ...patternGroup.slice(0, 2)],
            [...timeGroup.slice(0, 2), ...patternGroup],
            
            // Trajectory + Technical combinations
            [...trajectoryGroup, ...technicalGroup.slice(0, 2)],
            [...trajectoryGroup.slice(0, 2), ...volumeGroup.slice(0, 2)],
            
            // Mixed combinations for exploration
            [technicalGroup[0], volumeGroup[0], priceGroup[0], timeGroup[0], patternGroup[0]],
            [technicalGroup[1], volumeGroup[1], priceGroup[1], timeGroup[1]],
            [technicalGroup[2], volumeGroup[2], priceGroup[2], trajectoryGroup[0]],
            
            // High-correlation combinations (using actual feature names)
            ['atr_percentage', 'volume_delta', 'upper_wick_ratio'],
            ['rsi_14', 'body_ratio', 'bb_width'],
            ['macd_signal', 'volume_ratio_10', 'hour_of_day'],
            ['momentum_5', 'inside_bar', 'pattern_v_recovery']
        ];
        
        // Start with a balanced combination
        this.currentOptimalCombo = this.featureCombinations[0];
        
        this.auditLogger.log('setup', 'FEATURE_COMBINATIONS_INITIALIZED', {
            totalCombinations: this.featureCombinations.length,
            initialCombo: this.currentOptimalCombo,
            timestamp: Date.now()
        });
    }
    
    /**
     * Update rolling session performance metrics
     */
    updateSessionPerformance(recentTrades) {
        // Keep only last N trades
        this.sessionPerformance = recentTrades
            .slice(-this.config.sessionWindowSize)
            .map(trade => ({
                pnl: trade.pnlPerContract || trade.pnl || 0,
                timestamp: trade.timestamp || Date.now(),
                outcome: (trade.pnlPerContract || trade.pnl || 0) > 0 ? 'win' : 'loss'
            }));
        
        // Calculate session metrics
        const sessionMetrics = this.calculateSessionMetrics();
        
        this.auditLogger.log('session', 'PERFORMANCE_UPDATED', {
            tradesInWindow: this.sessionPerformance.length,
            metrics: sessionMetrics,
            timestamp: Date.now()
        });
    }
    
    /**
     * Calculate key session performance metrics
     */
    calculateSessionMetrics() {
        if (this.sessionPerformance.length === 0) return {};
        
        const pnls = this.sessionPerformance.map(t => t.pnl);
        const wins = this.sessionPerformance.filter(t => t.outcome === 'win');
        
        let cumulativeDrawdown = 0;
        let maxDrawdown = 0;
        let peak = 0;
        let cumulativePnl = 0;
        
        for (const trade of this.sessionPerformance) {
            cumulativePnl += trade.pnl;
            if (cumulativePnl > peak) {
                peak = cumulativePnl;
                cumulativeDrawdown = 0;
            } else {
                cumulativeDrawdown = peak - cumulativePnl;
                maxDrawdown = Math.max(maxDrawdown, cumulativeDrawdown);
            }
        }
        
        return {
            totalTrades: this.sessionPerformance.length,
            winRate: wins.length / this.sessionPerformance.length,
            avgPnl: pnls.reduce((sum, p) => sum + p, 0) / pnls.length,
            maxDrawdown: maxDrawdown,
            volatility: this.calculateVolatility(pnls),
            trend: this.calculateTrend(pnls),
            consecutiveLosses: this.getConsecutiveLosses()
        };
    }
    
    /**
     * Check if feature combination rotation is needed
     */
    shouldRotateFeatures() {
        const tradesSinceRotation = this.evaluationCount - this.lastRotationTrade;
        return tradesSinceRotation >= this.config.rotationInterval;
    }
    
    /**
     * Rotate through feature combinations to find optimal clustering
     */
    async rotateFeatureCombinations(recentTrades) {
        this.lastRotationTrade = this.evaluationCount;
        
        if (recentTrades.length < this.config.minClusterSize * 2) {
            this.auditLogger.log('rotation', 'SKIPPED_INSUFFICIENT_DATA', {
                tradesAvailable: recentTrades.length,
                required: this.config.minClusterSize * 2,
                timestamp: Date.now()
            });
            return;
        }
        
        let bestCombo = this.currentOptimalCombo;
        let bestScore = -1;
        const rotationResults = [];
        
        // Test up to maxCombinations
        const combosToTest = this.featureCombinations.slice(0, this.config.maxCombinations);
        
        for (const combo of combosToTest) {
            try {
                const score = await this.evaluateFeatureCombination(combo, recentTrades);
                rotationResults.push({ combo, score });
                
                if (score > bestScore) {
                    bestScore = score;
                    bestCombo = combo;
                }
            } catch (error) {
                this.auditLogger.log('rotation', 'COMBO_EVALUATION_FAILED', {
                    combo,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        // Update optimal combination if we found a better one
        if (bestCombo !== this.currentOptimalCombo) {
            const previousCombo = this.currentOptimalCombo;
            const previousScore = rotationResults.find(r => r.combo === previousCombo)?.score || 0;
            const improvement = ((bestScore - previousScore) / Math.max(previousScore, 0.01) * 100).toFixed(0);
            
            // REALIZATION: Current features aren't working well
            console.log(`[REALIZATION] Feature combination underperforming: ${previousCombo?.join(', ') || 'unknown'} (score: ${previousScore.toFixed(2)})`);
            console.log(`[ACTION] Switching to better feature combination: ${bestCombo.join(', ')} (score: ${bestScore.toFixed(2)}, ${improvement}% improvement)`);
            
            this.currentOptimalCombo = bestCombo;
            
            this.auditLogger.log('rotation', 'COMBINATION_CHANGED', {
                previous: previousCombo,
                new: bestCombo,
                previousScore: rotationResults.find(r => r.combo === previousCombo)?.score || 'unknown',
                newScore: bestScore,
                allResults: rotationResults,
                timestamp: Date.now()
            });
        } else {
            this.auditLogger.log('rotation', 'COMBINATION_MAINTAINED', {
                currentCombo: this.currentOptimalCombo,
                score: bestScore,
                alternativesConsidered: rotationResults.length,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Evaluate a feature combination's clustering quality
     */
    async evaluateFeatureCombination(featureCombo, trades) {
        if (trades.length < this.config.minClusterSize) return 0;
        
        // Extract features for this combination
        const dataPoints = trades
            .filter(trade => this.hasRequiredFeatures(trade, featureCombo))
            .map(trade => {
                // Parse features from featuresJson
                let parsedFeatures;
                try {
                    parsedFeatures = trade.featuresJson ? JSON.parse(trade.featuresJson) : {};
                } catch (e) {
                    parsedFeatures = {};
                }
                return {
                    features: featureCombo.map(fname => parsedFeatures[fname] || 0),
                    pnl: trade.pnlPerContract || trade.pnl || 0,
                    profitable: (trade.pnlPerContract || trade.pnl || 0) > 0
                };
            });
        
        if (dataPoints.length < this.config.minClusterSize) return 0;
        
        // Perform clustering analysis
        const clusters = await this.performKMeansClustering(dataPoints, 2); // Profitable vs Unprofitable
        
        // Calculate quality metrics
        const silhouetteScore = this.calculateSilhouetteScore(dataPoints, clusters);
        const profitSeparation = this.calculateProfitSeparation(dataPoints, clusters);
        const clusterStability = this.calculateClusterStability(dataPoints, clusters);
        
        // Combined score
        return (silhouetteScore * 0.4) + (profitSeparation * 0.4) + (clusterStability * 0.2);
    }
    
    /**
     * Perform clustering analysis using current optimal feature combination
     */
    async performClusterAnalysis(queryFeatures, recentTrades, queryEntryType = null) {
        const combo = this.currentOptimalCombo;
        
        // Filter trades that have the required features
        let validTrades = recentTrades.filter(trade => 
            this.hasRequiredFeatures(trade, combo)
        );
        
        // ENTRY TYPE FILTERING: Analyze performance by entry type
        if (queryEntryType) {
            const entryTypePerformance = this.analyzeEntryTypePerformance(validTrades);
            console.log(`[PRUNED-RANGES] Entry type performance analysis:`, entryTypePerformance);
            
            // Filter to only the query entry type if it has sufficient data
            const queryEntryTrades = validTrades.filter(trade => trade.entryType === queryEntryType);
            
            if (queryEntryTrades.length >= this.config.minClusterSize) {
                console.log(`[PRUNED-RANGES] Using ${queryEntryType}-specific clustering: ${queryEntryTrades.length} trades`);
                validTrades = queryEntryTrades;
            } else {
                console.log(`[PRUNED-RANGES] Insufficient ${queryEntryType} data (${queryEntryTrades.length}), using all entry types but will note performance`);
            }
        }
        
        if (validTrades.length < this.config.minClusterSize) {
            // Enhanced debugging for data structure analysis
            let sampleParsedFeatures = {};
            if (recentTrades.length > 0 && recentTrades[0].featuresJson) {
                try {
                    sampleParsedFeatures = JSON.parse(recentTrades[0].featuresJson);
                } catch (e) {
                    sampleParsedFeatures = {};
                }
            }
            
            const debugInfo = {
                validTrades: validTrades.length,
                requiredFeatures: combo,
                totalTrades: recentTrades.length,
                tradesWithFeaturesJson: recentTrades.filter(t => t.featuresJson).length,
                sampleTradeFeatures: Object.keys(sampleParsedFeatures),
                sampleTradeStructure: recentTrades.length > 0 ? {
                    hasFeaturesJson: !!recentTrades[0].featuresJson,
                    topLevelKeys: Object.keys(recentTrades[0]),
                    featuresJsonType: typeof recentTrades[0].featuresJson,
                    firstFewFeatures: Object.keys(sampleParsedFeatures).slice(0, 10)
                } : null,
                timestamp: Date.now()
            };
            
            this.auditLogger.log('analysis', 'INSUFFICIENT_DATA', debugInfo);
            
            // Concise debug summary
            console.log(`[PRUNED-RANGES] ❌ INSUFFICIENT DATA: ${validTrades.length}/${recentTrades.length} trades have required features [${combo.slice(0,3).join(', ')}...]`);
            
            return {
                quality: 0,
                confidence: 0.1,
                cluster: 'insufficient_data',
                reasoning: `Only ${validTrades.length} trades with required features: ${combo.join(', ')}. Need ${this.config.minClusterSize} minimum.`
            };
        }
        
        // Extract feature vectors
        const dataPoints = validTrades.map(trade => ({
            features: combo.map(fname => trade.features[fname] || 0),
            pnl: trade.pnlPerContract || trade.pnl || 0,
            profitable: (trade.pnlPerContract || trade.pnl || 0) > 0
        }));
        
        // Perform clustering
        const clusters = await this.performKMeansClustering(dataPoints, 2);
        
        // Calculate query point's cluster assignment
        const queryVector = combo.map(fname => queryFeatures[fname] || 0);
        const queryCluster = this.assignToCluster(queryVector, clusters);
        
        // Calculate cluster quality metrics
        const quality = this.calculateOverallClusterQuality(dataPoints, clusters);
        const confidence = this.calculateClusterConfidence(queryVector, clusters, queryCluster, dataPoints);
        
        const analysis = {
            quality,
            confidence,
            cluster: queryCluster,
            clusterStats: this.getClusterStatistics(dataPoints, clusters),
            featureCombination: combo,
            dataPointsUsed: dataPoints.length,
            reasoning: this.generateClusterReasoning(queryCluster, clusters, quality)
        };
        
        // Store for regime change detection
        this.clusterQualityHistory.push({
            timestamp: Date.now(),
            quality,
            confidence,
            combo
        });
        
        // Keep only recent history
        if (this.clusterQualityHistory.length > 20) {
            this.clusterQualityHistory = this.clusterQualityHistory.slice(-20);
        }
        
        return analysis;
    }
    
    /**
     * Validate strategy scalability across position multipliers
     */
    async validateScalability(clusterAnalysis, requestedScale) {
        // Handle insufficient data case
        if (clusterAnalysis.cluster === 'insufficient_data') {
            return {
                requestedScale,
                maxSafeScale: 1,
                recommendedScale: 1,
                scalabilityResults: {
                    1: { overallScore: 0.3 }
                },
                canScale: false,
                reasoning: `Insufficient data: Limiting scale to 1x until more data available`
            };
        }
        
        const multipliers = this.config.scalabilityMultipliers.filter(m => m <= requestedScale * 2);
        const scalabilityResults = {};
        
        for (const multiplier of multipliers) {
            // Simulate impact of larger position sizes
            const scaledConfidence = this.calculateScaledConfidence(clusterAnalysis, multiplier);
            const slippageImpact = this.calculateSlippageImpact(multiplier);
            const liquidityConstraint = this.calculateLiquidityConstraint(multiplier);
            
            scalabilityResults[multiplier] = {
                confidence: scaledConfidence,
                slippageImpact,
                liquidityConstraint,
                overallScore: scaledConfidence * (1 - slippageImpact) * liquidityConstraint
            };
        }
        
        // Determine maximum safe scale
        const maxSafeScale = this.determineMaxSafeScale(scalabilityResults);
        const scaleRecommendation = Math.min(maxSafeScale, requestedScale);
        
        const scalabilityAnalysis = {
            requestedScale,
            maxSafeScale,
            recommendedScale: scaleRecommendation,
            scalabilityResults,
            canScale: scaleRecommendation >= requestedScale,
            reasoning: this.generateScalabilityReasoning(scalabilityResults, requestedScale, maxSafeScale)
        };
        
        // REALIZATION: Strategy can't scale as requested
        if (!scalabilityAnalysis.canScale && requestedScale > 1) {
            console.log(`[REALIZATION] Scaling failure: Requested ${requestedScale}x but max safe is ${maxSafeScale}x`);
            console.log(`[ACTION] Reducing position size to ${scaleRecommendation}x and tightening risk parameters`);
        }
        
        this.auditLogger.log('scalability', 'SCALE_ANALYSIS', {
            input: { requestedScale, clusterQuality: clusterAnalysis.quality },
            output: scalabilityAnalysis,
            timestamp: Date.now()
        });
        
        return scalabilityAnalysis;
    }
    
    /**
     * Detect regime changes based on cluster quality degradation
     */
    detectRegimeChange(clusterAnalysis) {
        // Insufficient data: No regime change detection possible
        if (clusterAnalysis.cluster === 'insufficient_data') {
            return {
                regimeChangeDetected: false,
                confidence: 'insufficient_data',
                trend: 'unknown',
                recommendedAction: 'collect_data'
            };
        }
        
        if (this.clusterQualityHistory.length < 5) {
            return {
                regimeChangeDetected: false,
                confidence: 'insufficient_history',
                trend: 'unknown'
            };
        }
        
        // Calculate trend in cluster quality
        const recentQualities = this.clusterQualityHistory.slice(-5).map(h => h.quality);
        const qualityTrend = this.calculateTrend(recentQualities);
        const avgRecentQuality = recentQualities.reduce((sum, q) => sum + q, 0) / recentQualities.length;
        
        // Detect significant degradation
        const qualityDrop = Math.abs(qualityTrend);
        const isRegimeChange = qualityDrop > this.config.regimeChangeThreshold && 
                              avgRecentQuality < this.config.clusterQualityThreshold;
        
        const regimeStatus = {
            regimeChangeDetected: isRegimeChange,
            qualityTrend,
            avgRecentQuality,
            qualityDrop,
            recommendedAction: isRegimeChange ? 'exploration_mode' : 'continue',
            confidence: Math.min(qualityDrop * 2, 1.0)
        };
        
        if (isRegimeChange) {
            // REALIZATION: We're off track
            const severityLevel = qualityDrop > 0.5 ? 'SEVERE' : qualityDrop > 0.3 ? 'MODERATE' : 'MILD';
            console.log(`[REALIZATION] ${severityLevel} performance degradation detected: Quality dropped ${(qualityDrop * 100).toFixed(0)}% (avg: ${(avgRecentQuality * 100).toFixed(0)}%)`);
            console.log(`[ACTION] Entering exploration mode: Will rotate feature combinations and reduce position sizing`);
            
            this.auditLogger.log('regime', 'CHANGE_DETECTED', {
                qualityTrend,
                avgRecentQuality,
                qualityDrop,
                threshold: this.config.regimeChangeThreshold,
                recentHistory: this.clusterQualityHistory.slice(-5),
                timestamp: Date.now()
            });
        }
        
        return regimeStatus;
    }
    
    /**
     * Calculate final risk parameters based on all analyses
     */
    calculateRiskParameters(clusterAnalysis, scalabilityAnalysis, regimeStatus) {
        let baseStopLoss = 20;  // Default stop loss in points
        let baseTakeProfit = 40;  // Default take profit in points
        
        // Adjust based on cluster quality
        if (clusterAnalysis.quality > 0.8) {
            // High quality clusters = tighter risk
            baseStopLoss *= 0.8;
            baseTakeProfit *= 1.2;
        } else if (clusterAnalysis.quality < 0.4) {
            // Poor quality clusters = wider stops, smaller targets
            baseStopLoss *= 1.5;
            baseTakeProfit *= 0.7;
        }
        
        // Adjust based on scalability
        if (!scalabilityAnalysis.canScale) {
            // Poor scalability = tighter risk
            baseStopLoss *= 0.7;
            baseTakeProfit *= 0.8;
        }
        
        // Adjust based on regime change
        if (regimeStatus.regimeChangeDetected) {
            // Regime change = exploration mode
            baseStopLoss *= 0.6;  // Tighter stops
            baseTakeProfit *= 0.5;  // Smaller targets
        }
        
        return {
            stopLoss: Math.round(baseStopLoss),
            takeProfit: Math.round(baseTakeProfit),
            adjustments: {
                clusterQualityFactor: clusterAnalysis.quality,
                scalabilityFactor: scalabilityAnalysis.canScale ? 1.0 : 0.7,
                regimeFactor: regimeStatus.regimeChangeDetected ? 0.6 : 1.0
            }
        };
    }
    
    /**
     * Calculate overall confidence score
     */
    calculateOverallConfidence(clusterAnalysis, scalabilityAnalysis, regimeStatus) {
        let confidence = clusterAnalysis.confidence || 0.5;
        
        // Reduce confidence if poor scalability
        if (!scalabilityAnalysis.canScale) {
            confidence *= 0.7;
        }
        
        // Reduce confidence during regime changes
        if (regimeStatus.regimeChangeDetected) {
            confidence *= 0.5;
        }
        
        // Ensure minimum confidence for system stability
        return Math.max(confidence, 0.1);
    }
    
    // ===== CLUSTERING ALGORITHMS =====
    
    /**
     * Perform K-Means clustering
     */
    async performKMeansClustering(dataPoints, k = 2) {
        const features = dataPoints.map(dp => dp.features);
        const maxIterations = 100;
        
        // Initialize centroids randomly
        let centroids = this.initializeRandomCentroids(features, k);
        let assignments = new Array(features.length);
        let converged = false;
        let iteration = 0;
        
        while (!converged && iteration < maxIterations) {
            // Assign points to nearest centroid
            const newAssignments = features.map(point => 
                this.findNearestCentroid(point, centroids)
            );
            
            // Check for convergence
            converged = newAssignments.every((assignment, i) => assignment === assignments[i]);
            assignments = newAssignments;
            
            // Update centroids
            centroids = this.updateCentroids(features, assignments, k);
            iteration++;
        }
        
        return {
            centroids,
            assignments,
            converged,
            iterations: iteration
        };
    }
    
    // ===== UTILITY METHODS =====
    
    /**
     * Analyze performance by entry type to identify underperforming strategies
     */
    analyzeEntryTypePerformance(trades) {
        const entryTypeStats = {};
        
        // Group trades by entry type
        for (const trade of trades) {
            const entryType = trade.entryType || 'UNKNOWN';
            
            if (!entryTypeStats[entryType]) {
                entryTypeStats[entryType] = {
                    count: 0,
                    totalPnl: 0,
                    wins: 0,
                    losses: 0,
                    trades: []
                };
            }
            
            const pnl = trade.pnlPerContract || trade.pnl || 0;
            const stats = entryTypeStats[entryType];
            
            stats.count++;
            stats.totalPnl += pnl;
            stats.trades.push(trade);
            
            if (pnl > 0) {
                stats.wins++;
            } else {
                stats.losses++;
            }
        }
        
        // Calculate derived metrics
        const performance = {};
        for (const [entryType, stats] of Object.entries(entryTypeStats)) {
            if (stats.count > 0) {
                performance[entryType] = {
                    count: stats.count,
                    avgPnl: stats.totalPnl / stats.count,
                    winRate: stats.wins / stats.count,
                    totalPnl: stats.totalPnl,
                    profitFactor: stats.losses > 0 ? (stats.wins * Math.abs(stats.totalPnl / stats.wins)) / (stats.losses * Math.abs(stats.totalPnl / stats.losses)) : 'N/A'
                };
            }
        }
        
        // Sort by performance (avgPnl descending)
        const sorted = Object.entries(performance)
            .sort(([,a], [,b]) => b.avgPnl - a.avgPnl)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
            
        return sorted;
    }
    
    /**
     * Adjust confidence based on entry type performance
     */
    adjustConfidenceForEntryType(baseConfidence, queryEntryType, recentTrades) {
        if (!queryEntryType) {
            return baseConfidence; // No adjustment if no entry type specified
        }
        
        const entryTypePerformance = this.analyzeEntryTypePerformance(recentTrades);
        const queryTypePerf = entryTypePerformance[queryEntryType];
        
        if (!queryTypePerf || queryTypePerf.count < 5) {
            console.log(`[PRUNED-RANGES] Insufficient ${queryEntryType} data for adjustment (${queryTypePerf?.count || 0} trades)`);
            return baseConfidence; // No adjustment for insufficient data
        }
        
        let adjustment = 0;
        
        // Strong performers get confidence boost
        if (queryTypePerf.avgPnl > 20 && queryTypePerf.winRate > 0.6) {
            adjustment = +0.2; // Strong performer
        } else if (queryTypePerf.avgPnl > 10 && queryTypePerf.winRate > 0.5) {
            adjustment = +0.1; // Good performer
        } else if (queryTypePerf.avgPnl < -10 && queryTypePerf.winRate < 0.3) {
            // REALIZATION: This entry type is severely underperforming
            console.log(`[REALIZATION] Entry type ${queryEntryType} severely underperforming: $${queryTypePerf.avgPnl.toFixed(2)} avg loss, ${(queryTypePerf.winRate * 100).toFixed(1)}% win rate`);
            console.log(`[ACTION] Applying major confidence penalty (-30%) - consider disabling this entry type`);
            adjustment = -0.3; // Poor performer - reduce confidence significantly
        } else if (queryTypePerf.avgPnl < 0) {
            // REALIZATION: This entry type is losing money
            console.log(`[REALIZATION] Entry type ${queryEntryType} losing money: $${queryTypePerf.avgPnl.toFixed(2)} avg loss`);
            console.log(`[ACTION] Applying confidence penalty (-10%) and using tighter risk parameters`);
            adjustment = -0.1; // Losing strategy
        }
        
        const adjustedConfidence = Math.max(0.1, Math.min(0.9, baseConfidence + adjustment));
        
        return adjustedConfidence;
    }
    
    /**
     * Get detailed analysis for a specific entry type
     */
    getEntryTypeAnalysis(queryEntryType, recentTrades) {
        const performance = this.analyzeEntryTypePerformance(recentTrades);
        const queryPerf = performance[queryEntryType];
        
        if (!queryPerf) {
            return {
                entryType: queryEntryType,
                status: 'NO_DATA',
                message: `No historical data for ${queryEntryType}`
            };
        }
        
        let status = 'NEUTRAL';
        let message = '';
        
        if (queryPerf.avgPnl > 15 && queryPerf.winRate > 0.6) {
            status = 'EXCELLENT';
            message = `Strong performer: $${queryPerf.avgPnl.toFixed(2)} avg profit, ${(queryPerf.winRate * 100).toFixed(1)}% win rate`;
        } else if (queryPerf.avgPnl > 5 && queryPerf.winRate > 0.5) {
            status = 'GOOD';
            message = `Profitable strategy: $${queryPerf.avgPnl.toFixed(2)} avg profit, ${(queryPerf.winRate * 100).toFixed(1)}% win rate`;
        } else if (queryPerf.avgPnl < -10 || queryPerf.winRate < 0.3) {
            status = 'POOR';
            message = `Underperforming: $${queryPerf.avgPnl.toFixed(2)} avg loss, ${(queryPerf.winRate * 100).toFixed(1)}% win rate - Consider disabling`;
        } else {
            status = 'NEUTRAL';
            message = `Mixed results: $${queryPerf.avgPnl.toFixed(2)} avg PnL, ${(queryPerf.winRate * 100).toFixed(1)}% win rate`;
        }
        
        return {
            entryType: queryEntryType,
            status,
            message,
            performance: queryPerf,
            ranking: Object.keys(performance).indexOf(queryEntryType) + 1,
            totalEntryTypes: Object.keys(performance).length
        };
    }
    
    hasRequiredFeatures(trade, requiredFeatures) {
        // Access features from featuresJson (named features from NT) not features array (numbered)
        let features;
        try {
            features = trade.featuresJson ? JSON.parse(trade.featuresJson) : {};
        } catch (e) {
            return false;
        }
        
        // Count how many features are available
        const availableFeatures = requiredFeatures.filter(fname => 
            features.hasOwnProperty(fname) && typeof features[fname] === 'number'
        ).length;
        
        // Require at least 70% of features to be present (more flexible than 100%)
        const requiredThreshold = Math.ceil(requiredFeatures.length * 0.7);
        return availableFeatures >= requiredThreshold;
    }
    
    calculateVolatility(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
    
    calculateTrend(values) {
        if (values.length < 2) return 0;
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((sum, v) => sum + v, 0);
        const sumXY = values.reduce((sum, v, i) => sum + (i * v), 0);
        const sumX2 = values.reduce((sum, v, i) => sum + (i * i), 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }
    
    getConsecutiveLosses() {
        let consecutive = 0;
        for (let i = this.sessionPerformance.length - 1; i >= 0; i--) {
            if (this.sessionPerformance[i].outcome === 'loss') {
                consecutive++;
            } else {
                break;
            }
        }
        return consecutive;
    }
    
    initializeRandomCentroids(features, k) {
        const centroids = [];
        const dimensions = features[0].length;
        
        for (let i = 0; i < k; i++) {
            const centroid = [];
            for (let d = 0; d < dimensions; d++) {
                const values = features.map(f => f[d]);
                const min = Math.min(...values);
                const max = Math.max(...values);
                centroid.push(min + Math.random() * (max - min));
            }
            centroids.push(centroid);
        }
        
        return centroids;
    }
    
    findNearestCentroid(point, centroids) {
        let nearestIndex = 0;
        let nearestDistance = this.euclideanDistance(point, centroids[0]);
        
        for (let i = 1; i < centroids.length; i++) {
            const distance = this.euclideanDistance(point, centroids[i]);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        
        return nearestIndex;
    }
    
    euclideanDistance(point1, point2) {
        return Math.sqrt(
            point1.reduce((sum, val, i) => sum + Math.pow(val - point2[i], 2), 0)
        );
    }
    
    updateCentroids(features, assignments, k) {
        const centroids = [];
        
        for (let i = 0; i < k; i++) {
            const clusterPoints = features.filter((_, index) => assignments[index] === i);
            
            if (clusterPoints.length === 0) {
                // Keep previous centroid if no points assigned
                centroids.push(new Array(features[0].length).fill(0));
                continue;
            }
            
            const centroid = [];
            for (let d = 0; d < clusterPoints[0].length; d++) {
                const average = clusterPoints.reduce((sum, point) => sum + point[d], 0) / clusterPoints.length;
                centroid.push(average);
            }
            centroids.push(centroid);
        }
        
        return centroids;
    }
    
    assignToCluster(queryVector, clusters) {
        return this.findNearestCentroid(queryVector, clusters.centroids);
    }
    
    calculateSilhouetteScore(dataPoints, clusters) {
        // Simplified silhouette calculation
        return 0.5 + Math.random() * 0.3; // Placeholder - implement proper silhouette
    }
    
    calculateProfitSeparation(dataPoints, clusters) {
        // Calculate how well clusters separate profitable vs unprofitable trades
        const cluster0Profits = dataPoints
            .filter((_, i) => clusters.assignments[i] === 0)
            .map(dp => dp.pnl);
        const cluster1Profits = dataPoints
            .filter((_, i) => clusters.assignments[i] === 1)
            .map(dp => dp.pnl);
        
        if (cluster0Profits.length === 0 || cluster1Profits.length === 0) return 0;
        
        const avg0 = cluster0Profits.reduce((sum, p) => sum + p, 0) / cluster0Profits.length;
        const avg1 = cluster1Profits.reduce((sum, p) => sum + p, 0) / cluster1Profits.length;
        
        return Math.abs(avg0 - avg1) / 100; // Normalize by typical PnL range
    }
    
    calculateClusterStability(dataPoints, clusters) {
        // Placeholder for cluster stability calculation
        return 0.6 + Math.random() * 0.3;
    }
    
    calculateOverallClusterQuality(dataPoints, clusters) {
        const silhouette = this.calculateSilhouetteScore(dataPoints, clusters);
        const separation = this.calculateProfitSeparation(dataPoints, clusters);
        const stability = this.calculateClusterStability(dataPoints, clusters);
        
        return (silhouette * 0.4) + (separation * 0.4) + (stability * 0.2);
    }
    
    calculateClusterConfidence(queryVector, clusters, queryCluster, dataPoints) {
        // Get statistics for the assigned cluster
        const clusterStats = this.getClusterStatistics(dataPoints, clusters);
        const assignedClusterKey = `cluster_${queryCluster}`;
        const assignedStats = clusterStats[assignedClusterKey];
        
        if (!assignedStats || assignedStats.size === 0) {
            return 0.1; // Fallback for empty clusters
        }
        
        // Base confidence on profitability metrics
        let confidence = 0.3; // Start with base confidence
        
        // Profit-based confidence adjustment
        if (assignedStats.avgProfit > 15) {
            confidence += 0.4; // High profit cluster
        } else if (assignedStats.avgProfit > 5) {
            confidence += 0.2; // Moderate profit cluster
        } else if (assignedStats.avgProfit > 0) {
            confidence += 0.1; // Small profit cluster
        } else {
            confidence -= 0.2; // Loss cluster - reduce confidence
        }
        
        // Win rate based adjustment
        if (assignedStats.winRate > 0.6) {
            confidence += 0.2; // High win rate
        } else if (assignedStats.winRate > 0.45) {
            confidence += 0.1; // Decent win rate
        } else if (assignedStats.winRate < 0.3) {
            confidence -= 0.2; // Poor win rate
        }
        
        // Sample size confidence (more data = more confidence)
        if (assignedStats.size > 100) {
            confidence += 0.1; // Large sample
        } else if (assignedStats.size < 20) {
            confidence -= 0.1; // Small sample
        }
        
        // Store cluster stats for potential entry type adjustment in main analysis
        this.lastClusterStats = assignedStats;
        
        // Ensure confidence stays within reasonable bounds
        return Math.max(0.1, Math.min(0.9, confidence));
    }
    
    getClusterStatistics(dataPoints, clusters) {
        const stats = {};
        
        for (let i = 0; i < clusters.centroids.length; i++) {
            const clusterPoints = dataPoints.filter((_, index) => clusters.assignments[index] === i);
            const profits = clusterPoints.map(dp => dp.pnl);
            
            stats[`cluster_${i}`] = {
                size: clusterPoints.length,
                avgProfit: profits.length > 0 ? profits.reduce((sum, p) => sum + p, 0) / profits.length : 0,
                winRate: clusterPoints.filter(dp => dp.profitable).length / clusterPoints.length,
                centroid: clusters.centroids[i]
            };
        }
        
        return stats;
    }
    
    generateClusterReasoning(queryCluster, clusters, quality) {
        return `Assigned to cluster ${queryCluster} with quality score ${quality.toFixed(3)}. ` +
               `${clusters.centroids.length} clusters identified from recent trading patterns.`;
    }
    
    calculateScaledConfidence(clusterAnalysis, multiplier) {
        // Confidence decreases with larger positions due to market impact
        const baseConfidence = clusterAnalysis.confidence;
        const scalePenalty = Math.log(multiplier) / Math.log(10) * 0.2; // Logarithmic penalty
        return Math.max(0.1, baseConfidence - scalePenalty);
    }
    
    calculateSlippageImpact(multiplier) {
        // Estimate slippage impact based on position size
        return Math.min(0.5, multiplier * 0.05); // 5% slippage per multiplier, capped at 50%
    }
    
    calculateLiquidityConstraint(multiplier) {
        // Liquidity constraint factor (1.0 = no constraint, 0.0 = impossible to fill)
        return Math.max(0.2, 1.0 - (multiplier * 0.08)); // Decreases with larger positions
    }
    
    determineMaxSafeScale(scalabilityResults) {
        let maxSafe = 1;
        
        for (const [multiplier, result] of Object.entries(scalabilityResults)) {
            if (result.overallScore > 0.6) { // Require 60% overall score to be "safe"
                maxSafe = Math.max(maxSafe, parseInt(multiplier));
            }
        }
        
        return maxSafe;
    }
    
    generateScalabilityReasoning(results, requested, maxSafe) {
        if (maxSafe >= requested) {
            return `Strategy scales safely to ${requested}x position size. Max tested: ${maxSafe}x.`;
        } else {
            return `Strategy only scales safely to ${maxSafe}x. Requested ${requested}x exceeds safe limits due to liquidity/slippage constraints.`;
        }
    }
    
    createSafeFallback() {
        return {
            method: 'pruned_ranges_fallback',
            confidence: 0.1,
            cluster: { quality: 0, confidence: 0.1, cluster: 'error_fallback' },
            scalability: { canScale: false, maxSafeScale: 1 },
            regime: { regimeChangeDetected: true, recommendedAction: 'pause' },
            riskParams: { stopLoss: 10, takeProfit: 15 },
            reasoning: 'Error occurred, using safe fallback parameters'
        };
    }
}

/**
 * Comprehensive audit logging system for offline decision review
 */
class AuditLogger {
    constructor() {
        this.logDir = path.join(__dirname, 'audit_logs');
        this.ensureLogDirectory();
        
        // Create daily log file
        const today = new Date().toISOString().split('T')[0];
        this.logFile = path.join(this.logDir, `pruned_ranges_${today}.jsonl`);
        
        // Log session start
        this.log('system', 'AUDIT_LOGGER_INITIALIZED', {
            logFile: this.logFile,
            timestamp: Date.now()
        });
    }
    
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    log(category, action, data) {
        const logEntry = {
            timestamp: Date.now(),
            date: new Date().toISOString(),
            category,
            action,
            data
        };
        
        // Write to file immediately for offline review
        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            fs.appendFileSync(this.logFile, logLine);
        } catch (error) {
            console.error('Failed to write audit log:', error.message);
        }
        
        // Minimal logging - only errors and critical changes
        if (action === 'ANALYSIS_FAILED') {
            console.log(`[0%] Pruned ranges analysis failed ERROR: ${data.error || 'unknown error'} ${JSON.stringify({evaluationId: data.evaluationId || 'unknown'})}`);
        } else if (action === 'COMBINATION_CHANGED') {
            console.log(`[PRUNED-RANGES] Feature combination changed: ${data.new?.join(', ') || 'unknown'}`);
        }
    }
}

module.exports = PrunedRangesEngine;