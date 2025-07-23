require('dotenv').config();
const express = require('express');
const AgenticMemoryClient = require('../shared/agenticMemoryClient');
const MemoryManager = require('./memoryManager');
const FluidRiskModel = require('./fluidRiskModel');
const ConfidenceEngine = require('./confidenceEngine');
const ABTestingFramework = require('./abTesting');
const PrunedRangesEngine = require('./prunedRangesEngine');
const RobustZoneEngine = require('./robustZoneEngine');
const app = express();
const port = process.env.RISK_SERVICE_PORT || 3017;

// Enable JSON parsing
app.use(express.json());

// Initialize Memory Manager (replaces direct storage client)
const memoryManager = new MemoryManager();
const storageClient = new AgenticMemoryClient(); // Keep for backward compatibility

// Initialize Fluid Risk Model
const fluidRiskModel = new FluidRiskModel(memoryManager);
const confidenceEngine = new ConfidenceEngine();

// Initialize A/B Testing (if enabled)
const abTesting = process.env.ENABLE_AB_TESTING === 'true' ? new ABTestingFramework() : null;

// Initialize Pruned Ranges Engine (legacy)
const prunedRangesEngine = new PrunedRangesEngine();

// Initialize Robust Zone Engine (new implementation)
const robustZoneEngine = new RobustZoneEngine();

// Initialize Decision Analysis Monitor
const DecisionAnalysisMonitor = require('./decisionAnalysisMonitor');
const decisionMonitor = new DecisionAnalysisMonitor();

// Initialize Risk Variation Strategy for backtesting
const RiskVariationStrategy = require('../risk-variation-strategy');
const riskVariation = new RiskVariationStrategy();

// Configuration
const CONFIG = {
    // ENABLE_GP_INTEGRATION: process.env.ENABLE_GP_INTEGRATION !== 'false', // GP SYSTEM DISABLED
    ENABLE_AB_TESTING: process.env.ENABLE_AB_TESTING === 'true',
    ENABLE_PRUNED_RANGES: process.env.ENABLE_PRUNED_RANGES === 'true',
    ENABLE_ROBUST_ZONES: process.env.ENABLE_ROBUST_ZONES === 'true', // Disable by default, use FluidRiskModel
    BACKTEST_MODE: process.env.BACKTEST_MODE === 'true',
    
    // Minimum similar patterns to provide recommendations (relaxed for learning)
    MIN_SIMILAR_PATTERNS: 2,
    
    // Similarity threshold for pattern matching (very relaxed for learning)
    SIMILARITY_THRESHOLD: 0.10,
    
    // Default risk values when no patterns available
    DEFAULT_RISK: {
        stopLoss: 10,   // 10 points = $100 for MGC
        takeProfit: 15, // 15 points = $150 for MGC  
        confidence: 0.0  // Return 0% confidence when no patterns
    },
    
    // Feature importance for risk calculation
    FEATURE_WEIGHTS: {
        'momentum_5': 0.2,
        'volume_spike_3bar': 0.15,
        'bb_position': 0.15,
        'atr_pct': 0.1,
        'rsi': 0.1,
        'ema_spread_pct': 0.1,
        'bb_width': 0.1,
        'range_expansion': 0.1
    }
};

// Simple LRU Cache for risk responses - Phase 1 optimization
class SimpleCache {
    constructor(maxSize = 1000, ttl = 60000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        // Move to end (LRU)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }
    
    set(key, value) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            value: value,
            timestamp: Date.now()
        });
    }
    
    clear() {
        this.cache.clear();
    }
}

const riskCache = new SimpleCache(1000, 60000); // 1000 items, 60 second TTL

// Initialize Two Risk Managers
class RiskManagerPrincipal {
    constructor() {
        this.longHeatMap = new Map();   // Feature combinations for long trades
        this.shortHeatMap = new Map();  // Feature combinations for short trades
        console.log('[RISK-PRINCIPAL] Initialized with empty heat maps');
    }

    // Digest a completed trade into the appropriate heat map
    digestTradeOutcome(trade) {
        if (!trade.features || !trade.direction || trade.pnl === undefined) {
            console.warn('[RISK-PRINCIPAL] Incomplete trade data, skipping digest');
            return;
        }

        // Use normalized per-contract PnL for fair comparison
        const pnlPerContract = trade.pnlPerContract || trade.pnl;
        const isWin = pnlPerContract > 5; // Define win as > $5 profit per contract
        const targetMap = trade.direction === 'long' ? this.longHeatMap : this.shortHeatMap;
        
        // Generate feature combinations from this trade
        const featureCombos = this.generateFeatureCombinations(trade.features);
        
        featureCombos.forEach(combo => {
            const key = this.createComboKey(combo);
            this.updateHeatMapEntry(targetMap, key, isWin, trade.pnl);
        });

        console.log(`[RISK-PRINCIPAL] Digested ${trade.direction} trade: PnL $${trade.pnl}, ${featureCombos.length} combinations updated`);
    }

    // Generate gradient-based feature combinations
    generateFeatureCombinations(features) {
        const combinations = [];
        const gradientFeatures = this.createGradientFeatures(features);
        
        // Debug: Show what features we received
        console.log(`[HEAT-MAP] Input features:`, Object.keys(features).slice(0, 10));
        
        // Get the most critical features dynamically from graduation system
        // Note: Heat map generation happens during trade digest, so we don't have instrument/direction context
        // Use a fallback approach: try to get from any graduation or use default features
        let criticalFeatures = [];
        const allGraduations = graduationManager.getAllGraduations();
        if (allGraduations.length > 0) {
            // Use features from the first available graduation as a starting point
            criticalFeatures = allGraduations[0].getGraduatedFeatures().slice(0, 8);
        } else {
            // Fallback to default critical features
            criticalFeatures = ['volume_spike_ratio', 'body_ratio', 'rsi_14', 'price_momentum_5min', 'atr_pct', 'bb_position'];
        }
        
        console.log(`[HEAT-MAP] Using ${criticalFeatures.length} critical features for combinations:`, criticalFeatures);
        console.log(`[HEAT-MAP] Available gradient features:`, Object.keys(gradientFeatures).slice(0, 10));
        
        // Generate 2-feature combinations from most critical graduated features
        for (let i = 0; i < criticalFeatures.length; i++) {
            for (let j = i + 1; j < criticalFeatures.length; j++) {
                const feat1 = criticalFeatures[i];
                const feat2 = criticalFeatures[j];
                
                if (gradientFeatures[feat1] && gradientFeatures[feat2]) {
                    combinations.push({
                        [feat1]: gradientFeatures[feat1],
                        [feat2]: gradientFeatures[feat2]
                    });
                }
            }
        }

        // Also add 3-feature combinations for the most predictive
        if (gradientFeatures.momentum_5 && gradientFeatures.volume_spike_3bar && gradientFeatures.rsi) {
            combinations.push({
                momentum_5: gradientFeatures.momentum_5,
                volume_spike_3bar: gradientFeatures.volume_spike_3bar,
                rsi: gradientFeatures.rsi
            });
        }

        return combinations;
    }

    // Convert raw feature values to gradient buckets
    createGradientFeatures(features) {
        const gradients = {};

        // Momentum buckets
        if (features.momentum_5 !== undefined) {
            const momentum = features.momentum_5;
            if (momentum < -0.01) gradients.momentum_5 = 'very_negative';
            else if (momentum < -0.003) gradients.momentum_5 = 'negative';
            else if (momentum < 0.003) gradients.momentum_5 = 'neutral';
            else if (momentum < 0.01) gradients.momentum_5 = 'positive';
            else gradients.momentum_5 = 'very_positive';
        }

        // Volume spike buckets
        if (features.volume_spike_3bar !== undefined) {
            const volume = features.volume_spike_3bar;
            if (volume < 1.2) gradients.volume_spike_3bar = 'low';
            else if (volume < 1.5) gradients.volume_spike_3bar = 'normal';
            else if (volume < 2.0) gradients.volume_spike_3bar = 'high';
            else gradients.volume_spike_3bar = 'very_high';
        }

        // RSI buckets
        if (features.rsi !== undefined) {
            const rsi = features.rsi;
            if (rsi < 30) gradients.rsi = 'oversold';
            else if (rsi < 45) gradients.rsi = 'low';
            else if (rsi < 55) gradients.rsi = 'neutral';
            else if (rsi < 70) gradients.rsi = 'high';
            else gradients.rsi = 'overbought';
        }

        // Bollinger Band position buckets
        if (features.bb_position !== undefined) {
            const bbPos = features.bb_position;
            if (bbPos < 0.2) gradients.bb_position = 'lower';
            else if (bbPos < 0.4) gradients.bb_position = 'low_mid';
            else if (bbPos < 0.6) gradients.bb_position = 'middle';
            else if (bbPos < 0.8) gradients.bb_position = 'high_mid';
            else gradients.bb_position = 'upper';
        }

        // ATR percent buckets
        if (features.atr_pct !== undefined) {
            const atr = features.atr_pct;
            if (atr < 0.001) gradients.atr_pct = 'low_vol';
            else if (atr < 0.002) gradients.atr_pct = 'normal_vol';
            else if (atr < 0.004) gradients.atr_pct = 'high_vol';
            else gradients.atr_pct = 'extreme_vol';
        }

        return gradients;
    }

    // Create a unique key for a feature combination
    createComboKey(combination) {
        const sortedKeys = Object.keys(combination).sort();
        return sortedKeys.map(key => `${key}:${combination[key]}`).join(',');
    }

    // Update heat map entry with new trade result
    updateHeatMapEntry(targetMap, key, isWin, pnl) {
        if (!targetMap.has(key)) {
            targetMap.set(key, {
                wins: 0,
                losses: 0,
                totalPnl: 0,
                frequency: 0,
                winRate: 0,
                avgProfit: 0
            });
        }

        const entry = targetMap.get(key);
        entry.frequency++;
        entry.totalPnl += pnlPerContract;

        if (isWin) {
            entry.wins++;
        } else {
            entry.losses++;
        }

        // Update calculated fields
        entry.winRate = entry.wins / entry.frequency;
        entry.avgProfit = entry.totalPnl / entry.frequency;

        targetMap.set(key, entry);
    }

    // Get heat map statistics
    getHeatMapStats() {
        return {
            longCombinations: this.longHeatMap.size,
            shortCombinations: this.shortHeatMap.size,
            topLongCombos: this.getTopCombinations(this.longHeatMap, 5),
            topShortCombos: this.getTopCombinations(this.shortHeatMap, 5)
        };
    }

    // Get top performing combinations
    getTopCombinations(heatMap, limit = 10) {
        const entries = Array.from(heatMap.entries())
            .filter(([key, data]) => data.frequency >= 5) // Minimum frequency filter
            .sort((a, b) => {
                // Sort by win rate * frequency score
                const scoreA = a[1].winRate * Math.min(a[1].frequency / 50, 1);
                const scoreB = b[1].winRate * Math.min(b[1].frequency / 50, 1);
                return scoreB - scoreA;
            })
            .slice(0, limit);

        return entries.map(([key, data]) => ({
            combination: key,
            winRate: (data.winRate * 100).toFixed(1),
            frequency: data.frequency,
            avgProfit: data.avgProfit.toFixed(0)
        }));
    }
}

class TradeApprovalRiskManager {
    constructor(principal) {
        this.principal = principal;
        console.log('[TRADE-APPROVAL] Initialized, linked to Risk Principal');
    }

    // Fast trade approval based on heat map lookup
    evaluateTradeApproval(features, direction) {
        const targetMap = direction === 'long' ? this.principal.longHeatMap : this.principal.shortHeatMap;
        
        if (targetMap.size === 0) {
            console.log('[TRADE-APPROVAL] No heat map data available, using fallback');
            return null; // Fall back to original logic
        }

        // Generate current feature combinations
        const currentCombos = this.principal.generateFeatureCombinations(features);
        
        let bestMatch = null;
        let highestScore = 0;
        let matchDetails = [];

        currentCombos.forEach(combo => {
            const key = this.principal.createComboKey(combo);
            const heatData = targetMap.get(key);
            
            if (heatData && heatData.frequency >= 10) { // Minimum 10 occurrences
                // Score = win rate weighted by frequency confidence
                const frequencyWeight = Math.min(heatData.frequency / 50, 1); // Cap at 50 trades
                const score = heatData.winRate * frequencyWeight;
                
                matchDetails.push({
                    combo: key,
                    winRate: heatData.winRate,
                    frequency: heatData.frequency,
                    score: score
                });
                
                if (score > highestScore) {
                    bestMatch = heatData;
                    highestScore = score;
                }
            }
        });

        if (bestMatch) {
            console.log(`[TRADE-APPROVAL] Found heat map match: ${(bestMatch.winRate * 100).toFixed(1)}% win rate over ${bestMatch.frequency} trades`);
            
            return {
                approved: bestMatch.winRate >= 0.60, // 60% win rate threshold
                confidence: bestMatch.winRate,
                stopLoss: this.calculateOptimalSL(bestMatch),
                takeProfit: this.calculateOptimalTP(bestMatch),
                reasoning: `Heat map analysis: ${(bestMatch.winRate * 100).toFixed(1)}% win rate over ${bestMatch.frequency} similar ${direction} trades (avg profit $${bestMatch.avgProfit.toFixed(0)})`,
                method: 'heat_map_approval',
                heatMapData: {
                    frequency: bestMatch.frequency,
                    avgProfit: bestMatch.avgProfit,
                    matchDetails: matchDetails
                }
            };
        }

        console.log(`[TRADE-APPROVAL] No reliable heat map matches found for ${direction} trade`);
        return null; // Fall back to original agentic memory logic
    }

    // Calculate optimal stop loss based on heat map data
    calculateOptimalSL(heatData) {
        // Use average profit as guide - if avg profit is high, we can risk more
        const baseStopLoss = 10; // Default 10 points
        
        if (heatData.avgProfit > 30) {
            return Math.min(baseStopLoss * 1.5, 20); // Allow up to 20 points for high profit potential
        } else if (heatData.avgProfit < 10) {
            return Math.max(baseStopLoss * 0.7, 6); // Tighter stop for low profit potential
        }
        
        return baseStopLoss;
    }

    // Calculate optimal take profit based on heat map data
    calculateOptimalTP(heatData) {
        // Base take profit on average profit from similar trades
        const avgProfit = heatData.avgProfit;
        
        if (avgProfit > 0) {
            // Convert profit to points (assuming $10 per point)
            const profitPoints = Math.max(avgProfit / 10, 8); // Minimum 8 points
            return Math.min(profitPoints * 0.8, 25); // Take 80% of avg profit, max 25 points
        }
        
        return 15; // Default 15 points
    }
}

// Initialize both risk managers
const riskPrincipal = new RiskManagerPrincipal();
const tradeApprovalManager = new TradeApprovalRiskManager(riskPrincipal);

// Initialize Feature Graduation System with Maintained State
const FeatureGraduation = require('./featureGraduation');

// Graduation Manager - maintains separate graduation state per instrument+direction
class GraduationManager {
    constructor() {
        this.graduations = new Map();
        console.log('[GRADUATION-MANAGER] Initialized graduation manager');
    }
    
    // Get or create graduation instance for specific instrument+direction
    getGraduation(instrument, direction) {
        const key = `${instrument}_${direction}`;
        
        if (!this.graduations.has(key)) {
            console.log(`[GRADUATION-MANAGER] Creating new graduation for ${key}`);
            const graduation = new FeatureGraduation(instrument, direction);
            this.graduations.set(key, graduation);
        }
        
        return this.graduations.get(key);
    }
    
    // Get all active graduations
    getAllGraduations() {
        return Array.from(this.graduations.values());
    }
    
    // Update all graduations (background maintenance)
    async updateAllGraduations() {
        const updates = [];
        for (const [key, graduation] of this.graduations) {
            if (graduation.shouldUpdateGraduation()) {
                console.log(`[GRADUATION-MANAGER] Auto-updating ${key}...`);
                updates.push(graduation.updateGraduatedFeatures().catch(err => 
                    console.warn(`[GRADUATION-MANAGER] Failed to update ${key}:`, err.message)
                ));
            }
        }
        await Promise.all(updates);
    }
}

const graduationManager = new GraduationManager();

// Start background graduation maintenance (every 10 minutes)
setInterval(() => {
    graduationManager.updateAllGraduations().catch(err => 
        console.error('[GRADUATION-MANAGER] Background update failed:', err.message)
    );
}, 10 * 60 * 1000);

// Load feature selection configuration
let featureSelection = null;
try {
    featureSelection = require('../feature-selection.json');
    console.log(`[RISK-SERVICE] Loaded feature selection: ${featureSelection.selectedFeatures.length} features`);
} catch (error) {
    console.warn('[RISK-SERVICE] No feature selection found, will use all features');
}

// Stats caching to prevent excessive polling
let statsCache = null;
let lastStatsUpdate = 0;
const STATS_CACHE_TTL = 30000; // 30 seconds cache

// Duplicate CONFIG removed - using the one defined earlier in the file

// Record actual trade outcome for self-correction learning
app.post('/api/record-trade-outcome', async (req, res) => {
    try {
        const { entrySignalId, pnlPerContract, exitReason, maxProfit, maxLoss } = req.body;
        
        if (!entrySignalId || pnlPerContract === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: entrySignalId and pnlPerContract'
            });
        }
        
        // Get the stored evaluation context
        const evaluationContext = global.pendingEvaluations?.get(entrySignalId);
        if (!evaluationContext) {
            console.log(`[TRADE-OUTCOME] No evaluation context found for ${entrySignalId} - skipping outcome recording`);
            return res.json({ 
                success: false, 
                message: 'No evaluation context found for this trade' 
            });
        }
        
        // Record the outcome in robust zones engine for self-correction
        if (CONFIG.ENABLE_ROBUST_ZONES && robustZoneEngine) {
            const performance = robustZoneEngine.recordTradeOutcome(
                evaluationContext.instrument,
                evaluationContext.direction,
                evaluationContext.entryType,
                pnlPerContract,
                evaluationContext.confidence,
                evaluationContext.membership
            );
            
            console.log(`[TRADE-OUTCOME] Recorded ${entrySignalId}: PnL $${pnlPerContract} for ${evaluationContext.instrument}_${evaluationContext.direction}_${evaluationContext.entryType}`);
            
            // DECISION MONITORING: Record outcome for decision analysis (non-blocking)
            try {
                decisionMonitor.recordOutcome(entrySignalId, {
                    pnlPerContract: pnlPerContract,
                    pnl: pnlPerContract, // Backup field
                    exitReason: exitReason || 'unknown',
                    maxProfit: maxProfit || 0,
                    maxLoss: maxLoss || 0,
                    actualSL: req.body.actualSL,
                    actualTP: req.body.actualTP,
                    barsHeld: req.body.barsHeld || 0
                });
            } catch (error) {
                // Don't block trade processing if monitoring fails
                console.log(`[DECISION-MONITOR] Outcome recording failed: ${error.message}`);
            }
            
            // Clean up evaluation context
            global.pendingEvaluations.delete(entrySignalId);
            
            return res.json({
                success: true,
                performance: {
                    consecutiveLosses: performance.consecutiveLosses,
                    consecutiveWins: performance.consecutiveWins,
                    totalPnL: performance.totalPnL,
                    tradeCount: performance.trades.length
                }
            });
        } else {
            return res.json({
                success: false,
                message: 'Robust zones engine not enabled'
            });
        }
        
    } catch (error) {
        console.error('[TRADE-OUTCOME] Error recording trade outcome:', error.message);
        res.status(500).json({
            error: 'Failed to record trade outcome',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'agentic-memory-risk-service',
        timestamp: new Date().toISOString(),
        memoryManager: memoryManager.getStats()
    });
});

// Memory manager status endpoint
app.get('/api/memory-status', (req, res) => {
    res.json({
        memoryManager: memoryManager.getStats(),
        timestamp: new Date().toISOString()
    });
});

// Feature graduation endpoints
app.get('/api/graduation/status', (req, res) => {
    try {
        const stats = featureGraduation.getGraduationStats();
        res.json({
            success: true,
            graduation: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/graduation/update', async (req, res) => {
    try {
        console.log('[GRADUATION-API] Manual graduation update requested');
        const success = await featureGraduation.updateGraduatedFeatures();
        
        if (success) {
            const stats = featureGraduation.getGraduationStats();
            res.json({
                success: true,
                message: 'Graduated features updated successfully',
                graduation: stats,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: false,
                message: 'Graduation update failed or skipped',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('[GRADUATION-API] Update error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Decision Analysis endpoints
app.get('/api/decision-analysis', (req, res) => {
    try {
        const { instrument, hours } = req.query;
        const stats = decisionMonitor.getDecisionStats(
            instrument || null, 
            parseInt(hours) || 24
        );
        
        res.json({
            success: true,
            stats: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manual decision analysis trigger
app.post('/api/decision-analysis/analyze', async (req, res) => {
    try {
        await decisionMonitor.performPeriodicAnalysis();
        res.json({
            success: true,
            message: 'Decision analysis completed'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main signal approval endpoint (compatible with existing NT integration)
app.post('/api/approve-signal', async (req, res) => {
    const startTime = Date.now();
    
    try {
        let {
            instrument,
            direction,
            entry_price,
            timestamp
        } = req.body;

        console.log(`[RISK-SERVICE] Signal approval request: ${direction} ${instrument} @ ${entry_price}`);
        
        // FAST RECOVERY CHECK: Only analyze if we suspect issues (non-blocking)
        setImmediate(async () => {
            try {
                // Background recovery analysis - doesn't block trading decisions
                const recentTrades = await storageClient.getVectors({ 
                    instrument: instrument, 
                    direction: direction, 
                    limit: 5 // Reduced from 15 for speed
                });
                
                if (recentTrades && recentTrades.length >= 3) {
                    // Quick recovery check
                    const recentLosses = recentTrades.filter(t => (t.pnlPerContract || t.pnl) < -10).length;
                    const consecutiveLosses = countConsecutiveLosses(recentTrades);
                    
                    // Only show recovery mode if there's a real issue
                    if (consecutiveLosses >= 3 || recentLosses >= 4) {
                        let cumulativePnL = 0;
                        const equityCurve = recentTrades
                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                            .map(trade => {
                                cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
                                return cumulativePnL;
                            });
                        
                        const currentPnL = equityCurve[equityCurve.length - 1];
                        const winRate = ((recentTrades.length - recentLosses) / recentTrades.length) * 100;
                        const recoveryStatus = getRecoveryStatus(currentPnL, 0, consecutiveLosses, winRate);
                        
                        console.log(`🚨 [RECOVERY-MODE] ${direction} ${instrument} @ ${entry_price}`);
                        console.log(`   💰 Equity: $${currentPnL.toFixed(0)} | Losses: ${consecutiveLosses} consecutive | Win Rate: ${winRate.toFixed(0)}%`);
                        console.log(`   🎯 Strategy: ${recoveryStatus.strategy} | Priority: ${recoveryStatus.priority}`);
                    }
                }
            } catch (error) {
                // Silently fail - don't log errors for background task
            }
        });
        
        // Get current features from ME (single source of truth)
        let features;
        try {
            const axios = require('axios');
            
            // Get current features directly from ME
            const meServiceUrl = process.env.ME_SERVICE_URL || 'http://localhost:5000';
            console.log(`[RISK-SERVICE] Fetching current features from ME at ${meServiceUrl}/api/features/${instrument}`);
            
            const meResponse = await axios.get(`${meServiceUrl}/api/features/${instrument}`, {
                timeout: 3000
            });
            
            if (!meResponse.data || !meResponse.data.success || !meResponse.data.features) {
                throw new Error(`No features available from ME: ${meResponse.data?.error || 'Unknown error'}`);
            }
            
            features = meResponse.data.features;
            console.log(`[RISK-SERVICE] Got ${Object.keys(features).length} features from ME`);
            console.log(`[RISK-SERVICE] Sample features:`, Object.keys(features).slice(0, 5));
            
        } catch (error) {
            console.error(`[RISK-SERVICE] Failed to get features from ME:`, error.message);
            // APPROVE by default when ME features unavailable - don't block trading
            return res.json({
                approved: true,
                confidence: 0.6, // Moderate confidence for default approval
                suggested_sl: CONFIG.DEFAULT_RISK.stopLoss,
                suggested_tp: CONFIG.DEFAULT_RISK.takeProfit,
                rec_pullback: 10, // Default soft floor $10
                reasoning: `Approved by default - ME features unavailable: ${error.message}`,
                method: 'default_approval',
                duration: Date.now() - startTime
            });
        }

        let riskRecommendation;
        
        // FAST PATH: If memory manager is initialized, use it directly
        if (memoryManager.isInitialized) {
            // Use memory-based calculation (no storage queries needed)
            riskRecommendation = await calculateAgenticRisk(instrument, direction, features, timestamp);
        } else {
            // FALLBACK: Use rule-based when memory not available
            console.log(`[RISK-SERVICE] Memory not initialized - using rule-based only`);
            riskRecommendation = calculateRuleBasedRisk(features, direction);
            riskRecommendation.confidence = Math.max(riskRecommendation.confidence, 0.65); // Ensure approval
            riskRecommendation.reasoning += " (Memory not initialized)";
            riskRecommendation.method += "_no_memory";
        }
        
        // Analyze recent trades to avoid repeating poor decisions (use memory when available)
        let recentTradeAnalysis;
        if (memoryManager.isInitialized) {
            console.log(`[RISK-SERVICE] STAGE3: Using MEMORY-based recent trade analysis...`);
            const stage3Start = Date.now();
            recentTradeAnalysis = analyzeRecentTradesFromMemory(instrument, direction, timestamp);
            // Removed verbose stage duration logging
        } else {
            console.log(`[RISK-SERVICE] STAGE3: Using STORAGE-based recent trade analysis...`);
            const stage3Start = Date.now();
            recentTradeAnalysis = await analyzeRecentTrades(instrument, direction, timestamp);
            // Removed verbose stage duration logging
        }
        
        // Apply recent trade analysis to risk recommendation
        if (recentTradeAnalysis.recommendation === 'reject') {
            console.log(`[RISK-SERVICE] REJECTING due to recent trades: ${recentTradeAnalysis.consecutiveLosses} consecutive losses`);
            riskRecommendation.confidence = 0.2; // Force rejection
            riskRecommendation.reasoning += ` | REJECTED: ${recentTradeAnalysis.consecutiveLosses} consecutive losses detected`;
        } else if (recentTradeAnalysis.confidencePenalty > 0) {
            console.log(`[RISK-SERVICE] Applying confidence penalty ${recentTradeAnalysis.confidencePenalty} due to recent performance`);
            riskRecommendation.confidence -= recentTradeAnalysis.confidencePenalty;
            riskRecommendation.reasoning += ` | Recent performance: ${recentTradeAnalysis.totalRecentTrades} trades, ${(recentTradeAnalysis.recentWinRate * 100).toFixed(0)}% win rate`;
            
            if (recentTradeAnalysis.trendfollowingError) {
                riskRecommendation.reasoning += ` | WARNING: Trend-following error detected`;
            }
        }

        const duration = Date.now() - startTime;
        
        // Apply risk variation strategy for backtesting
        // This creates variation when seeing the same signals multiple times
        const variedRisk = riskVariation.getVariedRiskParameters(
            req.body.entrySignalId || `${instrument}_${direction}_${entry_price}`,
            riskRecommendation,
            features
        );
        
        // Use varied parameters if this is a repeated signal
        if (variedRisk.attemptNumber > 0) {
            riskRecommendation.stopLoss = variedRisk.stopLoss;
            riskRecommendation.takeProfit = variedRisk.takeProfit;
            riskRecommendation.confidence = variedRisk.confidence;
            riskRecommendation.reasoning = variedRisk.reasoning;
            
            // Add variation metadata
            riskRecommendation.variationApplied = true;
            riskRecommendation.variationStrategy = variedRisk.variationStrategy;
            riskRecommendation.attemptNumber = variedRisk.attemptNumber;
            
            console.log(`[RISK-VARIATION] Applied ${variedRisk.variationStrategy} strategy for attempt ${variedRisk.attemptNumber}`);
        }
        
        // Calculate recPullback soft-floor exit mechanism
        const recPullback = calculateRecPullback(
            riskRecommendation, 
            instrument, 
            direction, 
            riskRecommendation.similarPatterns || []
        );
        
        // Format response to match existing NT expectations
        const response = {
            approved: riskRecommendation.confidence >= 0.70, // Approve if confidence >= 70% (was 50%)
            confidence: riskRecommendation.confidence,
            // NT expects snake_case based on JsonProperty attributes
            suggested_sl: riskRecommendation.stopLoss,
            suggested_tp: riskRecommendation.takeProfit,
            rec_pullback: recPullback.softFloor, // Main soft-floor value for NT
            reasoning: riskRecommendation.reasoning,
            method: riskRecommendation.method,
            duration,
            patternsUsed: riskRecommendation.patternsUsed || 0,
            // Include complete recPullback details
            pullbackDetails: {
                softFloor: recPullback.softFloor,
                stepSize: recPullback.stepSize,
                maxProfitEstimate: recPullback.maxProfitEstimate,
                thresholdDropPercent: recPullback.thresholdDropPercent
            },
            // Include recent trade analysis
            recentTrades: {
                consecutiveLosses: recentTradeAnalysis.consecutiveLosses,
                recentWinRate: recentTradeAnalysis.recentWinRate,
                totalRecentTrades: recentTradeAnalysis.totalRecentTrades,
                trendfollowingError: recentTradeAnalysis.trendfollowingError
            },
            // Include variation metadata if applied
            ...(riskRecommendation.variationApplied && {
                variationStrategy: riskRecommendation.variationStrategy,
                attemptNumber: riskRecommendation.attemptNumber
            })
        };

        // Single line decision format: [Confidence] [Reasoning] [Error] [JSON]
        const confidence = `${(response.confidence * 100).toFixed(0)}%`;
        const reasoning = response.reasoning || response.reasons?.[0] || 'No reasoning provided';
        console.log(`[${confidence}] ${reasoning}`);

        res.json(response);

    } catch (error) {
        // Single line error format: [Confidence] [Reasoning] [Error] [JSON]
        console.log(`[0%] Service error: ${error.message} ERROR: ${error.name} ${JSON.stringify({stack: error.stack.split('\n')[0]})}`);
        
        // NO FALLBACKS - return the actual error
        res.status(500).json({
            error: 'APPROVAL_SERVICE_ERROR',
            message: error.message,
            approved: false,
            confidence: 0.0,
            suggested_sl: 0,
            suggested_tp: 0,
            rec_pullback: 0,
            reasoning: `Service error: ${error.message}`,
            method: 'error_no_fallback',
            duration: Date.now() - startTime
        });
    }
});

// FAST: Memory-based recent trade analysis (no storage queries)
function analyzeRecentTradesFromMemory(instrument, direction, timestamp, limit = 10) {
    try {
        // Get RECENT trades only from memory manager (not TRAINING data)
        const vectors = memoryManager.getRecentVectorsForInstrumentDirection(instrument, direction);
        
        // Only log recent trades analysis in recovery situations
        const hasRecentLosses = vectors.some(v => (v.pnlPerContract || v.pnl) < -20);
        if (hasRecentLosses) {
            console.log(`[RECENT-TRADES-MEMORY] Analyzing last ${limit} trades for ${instrument} from memory (recovery mode)`);
        }
        
        if (vectors.length === 0) {
            return {
                hasRecentLosses: false,
                consecutiveLosses: 0,
                recentWinRate: 0,
                totalRecentTrades: 0,
                avgMaxProfit: 0
            };
        }
        
        // Sort by timestamp and get recent trades
        const currentTime = new Date(timestamp);
        const lookbackHours = 24;
        const lookbackTime = new Date(currentTime.getTime() - (lookbackHours * 60 * 60 * 1000));
        
        // Only show debug info when NOT in recovery mode to keep recovery logs clean
        const isRecoveryMode = vectors.some(v => (v.pnlPerContract || v.pnl) < -20);
        
        if (!isRecoveryMode) {
            // DEBUG: Check timestamp alignment and dataType filtering
            const allVectors = memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            console.log(`[DATATYPE-DEBUG] Total vectors: ${allVectors.length}, RECENT vectors: ${vectors.length}`);
            
            if (vectors.length > 0) {
                const sampleTrade = vectors[0];
                console.log(`[TIMESTAMP-DEBUG] Query time: ${currentTime.toISOString()}`);
                console.log(`[TIMESTAMP-DEBUG] Lookback: ${lookbackTime.toISOString()}`);
                console.log(`[TIMESTAMP-DEBUG] Sample RECENT trade time: ${new Date(sampleTrade.timestamp).toISOString()}`);
                console.log(`[DATATYPE-DEBUG] Sample RECENT trade dataType: ${sampleTrade.dataType}`);
            }
            
            if (allVectors.length > 0) {
                const dataTypes = [...new Set(allVectors.map(v => v.dataType || 'undefined'))];
                console.log(`[DATATYPE-DEBUG] Available dataTypes: ${dataTypes.join(', ')}`);
            }
        } else {
            // In recovery mode - show simplified data info
            const allVectors = memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            console.log(`[RECOVERY-DATA] ${vectors.length} recent trades from ${allVectors.length} total for recovery analysis`);
        }
        
        let recentTrades;
        
        // BACKTEST MODE: Use sequence-based filtering instead of time-based
        if (CONFIG.BACKTEST_MODE || vectors.length > 0 && vectors.every(v => !v.dataType || v.dataType === undefined)) {
            console.log(`[BACKTEST-MODE] Using sequence-based recent trades (last ${limit} trades)`);
            // Sort by timestamp and take the last N trades (most recent by sequence)
            recentTrades = vectors
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        } else {
            // LIVE MODE: Use time-based filtering with bar timestamps
            recentTrades = vectors
                .filter(v => {
                    const tradeTime = new Date(v.timestamp);
                    return tradeTime >= lookbackTime && tradeTime < currentTime;
                })
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        }
        
        console.log(`[RECENT-TRADES-MEMORY] Found ${recentTrades.length} recent trades for ${instrument} in last ${lookbackHours} hours`);
        
        if (recentTrades.length === 0) {
            return {
                hasRecentLosses: false,
                consecutiveLosses: 0,
                recentWinRate: 0,
                totalRecentTrades: 0,
                avgMaxProfit: 0
            };
        }
        
        // Quick analysis (simplified for speed, using normalized values)
        const wins = recentTrades.filter(t => (t.pnlPerContract || t.pnl) > 0).length;
        const losses = recentTrades.filter(t => (t.pnlPerContract || t.pnl) <= 0).length;
        const winRate = wins / recentTrades.length;
        
        // Count consecutive losses from most recent
        let consecutiveLosses = 0;
        for (const trade of recentTrades) {
            const pnlPerContract = trade.pnlPerContract || trade.pnl;
            if (pnlPerContract <= 0) {
                consecutiveLosses++;
            } else {
                break;
            }
        }
        
        return {
            hasRecentLosses: consecutiveLosses > 0,
            consecutiveLosses: consecutiveLosses,
            recentWinRate: winRate,
            totalRecentTrades: recentTrades.length,
            avgMaxProfit: recentTrades.reduce((sum, t) => sum + (t.maxProfit || 0), 0) / recentTrades.length,
            recommendation: 'proceed' // Simplified for speed
        };
        
    } catch (error) {
        console.error('[RECENT-TRADES-MEMORY] Error:', error.message);
        return {
            hasRecentLosses: false,
            consecutiveLosses: 0,
            recentWinRate: 0,
            totalRecentTrades: 0,
            avgMaxProfit: 0
        };
    }
}

// SLOW: Storage-based recent trade analysis (legacy fallback)
async function analyzeRecentTrades(instrument, direction, timestamp, limit = 10) {
    const funcStartTime = Date.now();
    try {
        console.log(`[RECENT-TRADES] Analyzing last ${limit} trades for ${instrument}`);
        
        // Parse current timestamp
        const currentTime = new Date(timestamp);
        const lookbackHours = 24; // Look at trades from last 24 hours
        const lookbackTime = new Date(currentTime.getTime() - (lookbackHours * 60 * 60 * 1000));
        
        // SUBSTAGE 3A: Get all recent trades from storage
        const stage3aStart = Date.now();
        const allTrades = await storageClient.getVectors({ 
            instrument: instrument,
            limit: 1000 // Get more to filter by time
        });
        
        // Filter for recent trades and sort by timestamp (most recent first)
        const recentTrades = allTrades
            .filter(trade => {
                const tradeTime = new Date(trade.timestamp);
                return tradeTime >= lookbackTime && tradeTime < currentTime;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
        
        const stage3aDuration = Date.now() - stage3aStart;
        console.log(`[RECENT-TRADES] Found ${recentTrades.length} recent trades for ${instrument} in last ${lookbackHours} hours - Storage query: ${stage3aDuration}ms`);
        
        if (recentTrades.length === 0) {
            return {
                hasRecentLosses: false,
                consecutiveLosses: 0,
                recentWinRate: 0,
                avgRecentLoss: 0,
                trendfollowingError: false,
                recommendation: 'proceed'
            };
        }
        
        // Analyze recent performance
        const analysis = {
            consecutiveLosses: 0,
            totalTrades: recentTrades.length,
            losses: 0,
            wins: 0,
            totalPnL: 0,
            avgLoss: 0,
            avgWin: 0,
            avgMaxProfit: 0,
            avgMaxLoss: 0,
            sameDirectionLosses: 0,
            oppositeDirectionWins: 0,
            lastSuccessfulLongTime: null,
            consecutiveLossesMaxProfit: []
        };
        
        // Count consecutive losses from most recent and track max profits
        let maxProfitSum = 0;
        let maxProfitCount = 0;
        
        for (let i = 0; i < recentTrades.length; i++) {
            const trade = recentTrades[i];
            
            // Track max profit/loss for all trades
            if (trade.maxProfit) {
                maxProfitSum += trade.maxProfit;
                maxProfitCount++;
            }
            
            const pnlPerContract = trade.pnlPerContract || trade.pnl;
            if (pnlPerContract < 0) {
                if (i === analysis.consecutiveLosses) {
                    analysis.consecutiveLosses++;
                    // Track max profit for consecutive losses
                    if (trade.maxProfit) {
                        analysis.consecutiveLossesMaxProfit.push(trade.maxProfit);
                    }
                }
                analysis.losses++;
                analysis.totalPnL += trade.pnl;
                
                // Check if loss was in same direction as current signal
                if (trade.direction === direction) {
                    analysis.sameDirectionLosses++;
                }
            } else if (pnlPerContract > 0) {
                analysis.wins++;
                analysis.totalPnL += pnlPerContract;
                
                // Track last successful long for blocking shorts
                if (trade.direction === 'long') {
                    analysis.lastSuccessfulLongTime = new Date(trade.timestamp);
                }
                
                // Check if win was in opposite direction
                if (trade.direction !== direction) {
                    analysis.oppositeDirectionWins++;
                }
            }
        }
        
        // Calculate average max profit
        if (maxProfitCount > 0) {
            analysis.avgMaxProfit = maxProfitSum / maxProfitCount;
        }
        
        // Calculate averages (using normalized per-contract values)
        if (analysis.losses > 0) {
            const lossSum = recentTrades.filter(t => (t.pnlPerContract || t.pnl) < 0)
                .reduce((sum, t) => sum + (t.pnlPerContract || t.pnl), 0);
            analysis.avgLoss = lossSum / analysis.losses;
        }
        
        if (analysis.wins > 0) {
            const winSum = recentTrades.filter(t => (t.pnlPerContract || t.pnl) > 0)
                .reduce((sum, t) => sum + (t.pnlPerContract || t.pnl), 0);
            analysis.avgWin = winSum / analysis.wins;
        }
        
        analysis.recentWinRate = analysis.totalTrades > 0 ? analysis.wins / analysis.totalTrades : 0;
        
        // Detect trend-following error (buying into downtrend or selling into uptrend)
        analysis.trendfollowingError = false;
        if (analysis.consecutiveLosses >= 2 && analysis.sameDirectionLosses >= 2) {
            // Multiple losses in same direction suggests we're fighting the trend
            analysis.trendfollowingError = true;
            console.log(`[RECENT-TRADES] WARNING: Trend-following error detected - ${analysis.sameDirectionLosses} losses in ${direction} direction`);
        }
        
        // Make recommendation based on analysis
        let recommendation = 'proceed';
        let confidencePenalty = 0;
        let riskAdjustment = null;
        
        if (analysis.consecutiveLosses >= 5) {
            // With 5+ losses, be more aggressive about risk management
            confidencePenalty = 0.2; // Base penalty for 5+ losses
        }
        
        if (analysis.consecutiveLosses >= 3) {
            // Check average max profit for consecutive losses
            const avgConsecutiveLossMaxProfit = analysis.consecutiveLossesMaxProfit.length > 0
                ? analysis.consecutiveLossesMaxProfit.reduce((a, b) => a + b, 0) / analysis.consecutiveLossesMaxProfit.length
                : 0;
            
            // Also calculate average max loss for stop loss adjustment
            const avgMaxLoss = Math.abs(analysis.avgLoss) || 50; // Default $50 if no data
            
            console.log(`[RECENT-TRADES] ${analysis.consecutiveLosses} consecutive losses, avg max profit: $${avgConsecutiveLossMaxProfit.toFixed(2)}, avg loss: $${avgMaxLoss.toFixed(2)}`);
            
            // If we had moderate profit potential, tighten BOTH SL and TP
            if (avgConsecutiveLossMaxProfit > 20) {
                recommendation = 'adjust_risk';
                const tighterTP = Math.round(avgConsecutiveLossMaxProfit / 10); // Convert dollars to points
                const tighterSL = Math.round(avgMaxLoss * 0.7 / 10); // 70% of average loss
                
                riskAdjustment = {
                    type: 'tighter_risk',
                    suggestedTP: tighterTP,
                    suggestedSL: tighterSL,
                    reason: `Tightening risk - TP: ${tighterTP} points, SL: ${tighterSL} points (based on avg profit $${avgConsecutiveLossMaxProfit.toFixed(2)} and loss $${avgMaxLoss.toFixed(2)})`
                };
                confidencePenalty = 0; // NO penalty - we're adapting to capture profit, not rejecting
                console.log(`[RECENT-TRADES] ADJUST RISK: Tightening both SL and TP to capture available profit`);
            } 
            // Very low profit potential - ultra tight risk
            else if (avgConsecutiveLossMaxProfit < 10) {
                // Minimal profit potential - very tight risk parameters
                recommendation = 'ultra_tight_risk';
                const ultraTightTP = Math.max(1, Math.round(avgConsecutiveLossMaxProfit / 10)); // At least 1 point
                const ultraTightSL = Math.max(1, Math.round(avgMaxLoss * 0.3 / 10)); // 30% of avg loss
                
                riskAdjustment = {
                    type: 'ultra_tight_risk',
                    suggestedTP: ultraTightTP,
                    suggestedSL: ultraTightSL,
                    reason: `Ultra tight risk - minimal profit potential ($${avgConsecutiveLossMaxProfit.toFixed(2)}), TP: ${ultraTightTP}, SL: ${ultraTightSL}`
                };
                confidencePenalty = 0; // No penalty - we're adapting
                console.log(`[RECENT-TRADES] ULTRA TIGHT: Minimal profit potential, using very tight risk parameters`);
            }
            // Low but some profit (10-20) - proceed with caution
            else {
                recommendation = 'high_caution';
                const tighterTP = Math.round(avgConsecutiveLossMaxProfit / 10);
                const tighterSL = Math.round(avgMaxLoss * 0.5 / 10); // 50% of average loss for low profit scenarios
                
                riskAdjustment = {
                    type: 'cautious_risk',
                    suggestedTP: tighterTP,
                    suggestedSL: tighterSL,
                    reason: `Cautious approach - limited profit potential ($${avgConsecutiveLossMaxProfit.toFixed(2)})`
                };
                confidencePenalty = 0.3;
                console.log(`[RECENT-TRADES] HIGH CAUTION: Limited profit potential, tightening risk parameters`);
            }
        } else if (analysis.consecutiveLosses >= 2 && analysis.trendfollowingError) {
            recommendation = 'high_caution';
            confidencePenalty = 0.3;
            console.log(`[RECENT-TRADES] HIGH CAUTION: Consecutive losses with trend-following error`);
        } else if (analysis.recentWinRate < 0.4 && analysis.totalTrades >= 5) {
            recommendation = 'caution';
            confidencePenalty = 0.3; // Increased penalty for poor win rate
            console.log(`[RECENT-TRADES] CAUTION: Low win rate ${(analysis.recentWinRate * 100).toFixed(1)}%`);
        }
        
        return {
            hasRecentLosses: analysis.consecutiveLosses > 0,
            consecutiveLosses: analysis.consecutiveLosses,
            recentWinRate: analysis.recentWinRate,
            avgRecentLoss: analysis.avgLoss,
            avgRecentWin: analysis.avgWin,
            avgMaxProfit: analysis.avgMaxProfit,
            trendfollowingError: analysis.trendfollowingError,
            sameDirectionLosses: analysis.sameDirectionLosses,
            recommendation: recommendation,
            confidencePenalty: confidencePenalty,
            totalRecentTrades: analysis.totalTrades,
            recentPnL: analysis.totalPnL,
            riskAdjustment: riskAdjustment
        };
        
        const funcDuration = Date.now() - funcStartTime;
        console.log(`[RECENT-TRADES] Analysis completed - Total function duration: ${funcDuration}ms`);
        
    } catch (error) {
        const funcDuration = Date.now() - funcStartTime;
        console.error(`[RECENT-TRADES] Error analyzing recent trades after ${funcDuration}ms:`, error.message);
        return {
            hasRecentLosses: false,
            consecutiveLosses: 0,
            recentWinRate: 0,
            avgRecentLoss: 0,
            trendfollowingError: false,
            recommendation: 'proceed'
        };
    }
}

// NEW: Fast memory-based risk calculation (replaces slow storage queries)
function calculateMemoryBasedRisk(instrument, direction, features, maxStopLoss = null, maxTakeProfit = null) {
    const startTime = Date.now();
    
    try {
        console.log(`[MEMORY-RISK] Calculating risk for ${direction} ${instrument}`);
        
        // FAST: Get graduation table from memory
        const graduationTable = memoryManager.getGraduationTable(instrument, direction);
        
        if (!graduationTable) {
            // Check how many vectors we have for this instrument+direction
            const vectors = memoryManager.getVectorsForInstrumentDirection(instrument, direction);
            console.log(`[MEMORY-RISK] No graduation table for ${instrument}_${direction} (${vectors.length} vectors, need 10+), using rule-based`);
            
            // DEBUG: Log more details for MNQ
            if (instrument.toUpperCase().includes('MNQ')) {
                console.log(`[MEMORY-RISK] DEBUG MNQ: Requested instrument="${instrument}", direction="${direction}"`);
                console.log(`[MEMORY-RISK] DEBUG MNQ: Available graduation tables:`, Array.from(memoryManager.graduationTables.keys()));
                console.log(`[MEMORY-RISK] DEBUG MNQ: Memory manager stats:`, memoryManager.getStats());
            }
            
            const duration = Date.now() - startTime;
            console.log(`[MEMORY-RISK] COMPLETED (insufficient data for graduation) - Duration: ${duration}ms`);
            return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
        }
        
        console.log(`[MEMORY-RISK] Using graduation table: ${graduationTable.features.length} features, ${graduationTable.vectorCount} patterns`);
        
        // REVOLUTIONARY: Use range-based confidence instead of similarity matching
        const rangeAnalysis = memoryManager.calculateRangeBasedConfidence(features, instrument, direction);
        
        console.log(`[MEMORY-RISK] Range-based confidence: ${(rangeAnalysis.overallConfidence * 100).toFixed(1)}% (${rangeAnalysis.validFeatures} features analyzed)`);
        console.log(`[MEMORY-RISK] Range analysis: ${rangeAnalysis.approved ? 'APPROVED' : 'REJECTED'} - ${rangeAnalysis.reason}`);
        
        if (!rangeAnalysis.approved) {
            console.log(`[MEMORY-RISK] Range-based rejection: ${rangeAnalysis.reason}`);
            const duration = Date.now() - startTime;
            console.log(`[MEMORY-RISK] COMPLETED (range-based rejection) - Duration: ${duration}ms`);
            return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
        }
        
        // Use range-based confidence for risk parameters - require higher minimum
        const baseConfidence = Math.max(rangeAnalysis.overallConfidence, 0.60); // Minimum 60% (was 65%) - requires good ranges to pass 70%
        
        // Dynamic risk scaling based on confidence - output in DOLLARS
        const MAX_SL_DOLLARS = 50;   // $50 max stop loss
        const MAX_TP_DOLLARS = 150;  // $150 max take profit
        const MIN_SL_DOLLARS = 20;   // $20 min stop loss
        const MIN_TP_DOLLARS = 40;   // $40 min take profit
        
        // Scale risk based on confidence (higher confidence = larger position)
        const confidenceMultiplier = rangeAnalysis.overallConfidence;
        
        // Calculate dollar values directly
        const stopLoss = Math.round(Math.max(MIN_SL_DOLLARS, MAX_SL_DOLLARS * confidenceMultiplier));
        const takeProfit = Math.round(Math.max(MIN_TP_DOLLARS, MAX_TP_DOLLARS * confidenceMultiplier));
        
        const reasoning = `Range-based analysis: ${rangeAnalysis.reason}. Confidence: ${(rangeAnalysis.overallConfidence * 100).toFixed(1)}%. Risk adjusted for conditions.`;
        
        const duration = Date.now() - startTime;
        console.log(`[MEMORY-RISK] COMPLETED (range-based approved) - Duration: ${duration}ms`);
        
        return {
            confidence: baseConfidence,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
            reasoning: reasoning,
            method: 'graduated_ranges_analysis',
            featuresAnalyzed: rangeAnalysis.validFeatures,
            rangeAnalysis: rangeAnalysis.featureConfidences,
            similarPatterns: [] // No specific patterns for range-based analysis
        };
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[MEMORY-RISK] Error after ${duration}ms:`, error.message);
        return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
    }
}

// Calculate risk using Agentic Memory patterns (SLOW - legacy fallback)
// Helper function for range-based risk calculation (wrapper for existing logic)
async function calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss = null, maxTakeProfit = null) {
    // FAST PATH: If memory manager is initialized, use it directly
    if (memoryManager.isInitialized) {
        return calculateMemoryBasedRisk(instrument, direction, features, maxStopLoss, maxTakeProfit);
    }
    
    // FALLBACK: No memory manager = use rule-based (no stats check needed)
    console.log('[RANGE-BASED] Memory not initialized - using rule-based fallback');
    return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
}

async function calculateAgenticRisk(instrument, direction, features, timestamp, maxStopLoss = null, maxTakeProfit = null) {
    const agenticStartTime = Date.now();
    
    // EARLY EXIT: Skip everything if no memory manager
    if (!memoryManager.isInitialized) {
        console.log('[AGENTIC-RISK] Memory not initialized - using rule-based');
        return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
    }
    
    // EARLY EXIT: Check if we have ANY data for this instrument
    const vectorCount = memoryManager.getVectorsForInstrumentDirection(instrument, direction).length;
    if (vectorCount === 0) {
        console.log(`[AGENTIC-RISK] No data for ${instrument}_${direction} - using rule-based`);
        return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
    }
    
    try {
        // NEW: Use Fluid Risk Model for continuous probability-based evaluation
        console.log(`[AGENTIC-RISK] Using Fluid Risk Model for ${instrument}_${direction}`);
        const fluidResult = await fluidRiskModel.evaluateRisk(instrument, direction, features, timestamp);
        
        // Apply any maxStopLoss/maxTakeProfit constraints if provided
        if (maxStopLoss && fluidResult.suggested_sl > maxStopLoss) {
            fluidResult.suggested_sl = maxStopLoss;
            fluidResult.reasons.push(`Stop loss capped at ${maxStopLoss}`);
        }
        if (maxTakeProfit && fluidResult.suggested_tp > maxTakeProfit) {
            fluidResult.suggested_tp = maxTakeProfit;
            fluidResult.reasons.push(`Take profit capped at ${maxTakeProfit}`);
        }
        
        const totalDuration = Date.now() - agenticStartTime;
        console.log(`[AGENTIC-RISK] COMPLETED (fluid model) - Total duration: ${totalDuration}ms`);
        
        return fluidResult;
        
    } catch (error) {
        const totalDuration = Date.now() - agenticStartTime;
        console.error(`[AGENTIC-RISK] Fluid model error after ${totalDuration}ms: ${error.message}`);
        return calculateRuleBasedRisk(features, direction, maxStopLoss, maxTakeProfit);
    }
}

// Analyze what made winning patterns successful
function analyzeSuccessPatterns(winningPatterns, graduatedFeatures) {
    const analysis = {
        totalWinners: winningPatterns.length,
        avgProfit: 0,
        commonExitReasons: {},
        profitEfficiency: 0,
        optimalRiskParams: {},
        keyStrengths: []
    };

    // Calculate average profit (using normalized per-contract values)
    const profits = winningPatterns.map(p => p.pnlPerContract || p.pnl || 0);
    analysis.avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;

    // Analyze exit reasons
    winningPatterns.forEach(pattern => {
        const reason = pattern.exitReason || 'unknown';
        analysis.commonExitReasons[reason] = (analysis.commonExitReasons[reason] || 0) + 1;
    });

    // Find most common success mode
    const topExitReason = Object.entries(analysis.commonExitReasons)
        .sort(([,a], [,b]) => b - a)[0];
    
    if (topExitReason) {
        const [reason, count] = topExitReason;
        const percentage = (count / winningPatterns.length * 100).toFixed(0);
        
        switch(reason.toUpperCase()) {
            case 'TAKE_PROFIT':
            case 'TP':
                analysis.keyStrengths.push(`${percentage}% hit take profit cleanly - good target placement`);
                break;
            case 'MANUAL':
                analysis.keyStrengths.push(`${percentage}% manual exits captured extra profit - skilled timing`);
                break;
            case 'TRAILING':
                analysis.keyStrengths.push(`${percentage}% trailed to profit - trend following worked`);
                break;
            default:
                analysis.keyStrengths.push(`${percentage}% exited via ${reason} successfully`);
        }
    }

    // Analyze profit efficiency
    const maxProfits = winningPatterns.map(p => p.maxProfit || p.pnl).filter(mp => mp > 0);
    if (maxProfits.length > 0) {
        const avgMaxProfit = maxProfits.reduce((a, b) => a + b, 0) / maxProfits.length;
        analysis.profitEfficiency = analysis.avgProfit / avgMaxProfit;
        
        if (analysis.profitEfficiency > 0.8) {
            analysis.keyStrengths.push(`High profit capture efficiency (${(analysis.profitEfficiency * 100).toFixed(0)}%)`);
        } else if (analysis.profitEfficiency < 0.5) {
            analysis.keyStrengths.push(`Could capture more profit - avg max was $${avgMaxProfit.toFixed(0)} vs actual $${analysis.avgProfit.toFixed(0)}`);
        }
    }

    // Risk parameter analysis
    const avgStopDistance = winningPatterns
        .map(p => p.stopLoss || 10)
        .reduce((a, b) => a + b, 0) / winningPatterns.length;
    
    const avgTPDistance = winningPatterns
        .map(p => p.takeProfit || 15)
        .reduce((a, b) => a + b, 0) / winningPatterns.length;

    analysis.optimalRiskParams = {
        stopLoss: Math.round(avgStopDistance),
        takeProfit: Math.round(avgTPDistance),
        riskReward: (avgTPDistance / avgStopDistance).toFixed(1)
    };

    if (analysis.optimalRiskParams.riskReward >= 2.0) {
        analysis.keyStrengths.push(`Excellent risk/reward ratio (${analysis.optimalRiskParams.riskReward}:1)`);
    }

    return analysis;
}

// Analyze what went wrong with failing patterns
function analyzeFailurePatterns(losingPatterns, graduatedFeatures) {
    const analysis = {
        totalLosers: losingPatterns.length,
        avgLoss: 0,
        commonExitReasons: {},
        profitPotentialWasted: 0,
        riskParameterIssues: [],
        featureInsights: [],
        recommendations: []
    };

    // Calculate average loss (using normalized per-contract values)
    const losses = losingPatterns.map(p => Math.abs(p.pnlPerContract || p.pnl || 0));
    analysis.avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;

    // Analyze exit reasons
    losingPatterns.forEach(pattern => {
        const reason = pattern.exitReason || 'unknown';
        analysis.commonExitReasons[reason] = (analysis.commonExitReasons[reason] || 0) + 1;
    });

    // Find most common failure mode
    const topExitReason = Object.entries(analysis.commonExitReasons)
        .sort(([,a], [,b]) => b - a)[0];
    
    if (topExitReason) {
        const [reason, count] = topExitReason;
        const percentage = (count / losingPatterns.length * 100).toFixed(0);
        
        switch(reason.toUpperCase()) {
            case 'STOP_LOSS':
            case 'SL':
                analysis.recommendations.push(`${percentage}% hit stop loss - consider wider stops or better entry timing`);
                break;
            case 'MANUAL':
                analysis.recommendations.push(`${percentage}% manual exits - review exit discipline`);
                break;
            case 'TIME':
                analysis.recommendations.push(`${percentage}% time-based exits - may need longer holding periods`);
                break;
            default:
                analysis.recommendations.push(`${percentage}% exited via ${reason} - investigate this exit pattern`);
        }
    }

    // Analyze profit potential wasted
    const maxProfits = losingPatterns.map(p => p.maxProfit || 0).filter(mp => mp > 0);
    if (maxProfits.length > 0) {
        analysis.profitPotentialWasted = maxProfits.reduce((a, b) => a + b, 0) / maxProfits.length;
        if (analysis.profitPotentialWasted > 20) {
            analysis.recommendations.push(`Avg $${analysis.profitPotentialWasted.toFixed(0)} profit shown before losses - improve exit timing`);
        }
    }

    // Feature-based insights (using graduated features)
    if (graduatedFeatures.length > 0) {
        // This is where we could analyze which specific feature values led to failures
        // For now, provide general insight
        analysis.featureInsights.push(`Failures occurred despite ${graduatedFeatures.length} graduated features matching`);
        analysis.recommendations.push('Consider adding new features to better distinguish these setups');
    }

    // Risk parameter analysis
    const avgStopDistance = losingPatterns
        .map(p => p.stopLoss || 10)
        .reduce((a, b) => a + b, 0) / losingPatterns.length;
    
    if (avgStopDistance < 8 && analysis.commonExitReasons['STOP_LOSS'] > 0) {
        analysis.riskParameterIssues.push(`Stops too tight (avg ${avgStopDistance.toFixed(0)} points)`);
    }

    return analysis;
}

// Analyze risk levels from historical patterns
function analyzePatternRisk(patterns) {
    const stopLosses = patterns.map(p => p.stopLoss).filter(sl => sl > 0);
    const takeProfits = patterns.map(p => p.takeProfit).filter(tp => tp > 0);
    const pnls = patterns.map(p => p.pnl);
    
    // Calculate statistics
    const avgSL = stopLosses.reduce((a, b) => a + b, 0) / stopLosses.length;
    const avgTP = takeProfits.reduce((a, b) => a + b, 0) / takeProfits.length;
    const successRate = patterns.filter(p => (p.pnlPerContract || p.pnl) > 0).length / patterns.length;
    
    // Calculate percentiles for more robust estimates
    stopLosses.sort((a, b) => a - b);
    takeProfits.sort((a, b) => a - b);
    
    const p25SL = stopLosses[Math.floor(stopLosses.length * 0.25)];
    const p75SL = stopLosses[Math.floor(stopLosses.length * 0.75)];
    const p25TP = takeProfits[Math.floor(takeProfits.length * 0.25)];
    const p75TP = takeProfits[Math.floor(takeProfits.length * 0.75)];
    
    // Use conservative estimates (wider stops, closer targets)
    const optimalSL = Math.max(p75SL || avgSL || CONFIG.DEFAULT_RISK.stopLoss, 8);
    const optimalTP = Math.min(p25TP || avgTP || CONFIG.DEFAULT_RISK.takeProfit, 25);
    
    return {
        optimalSL: Math.round(optimalSL),
        optimalTP: Math.round(optimalTP),
        successRate,
        avgSL,
        avgTP,
        sampleSize: patterns.length
    };
}

// Fallback rule-based risk calculation
function calculateRuleBasedRisk(features, direction, maxStopLoss = null, maxTakeProfit = null) {
    console.log(`[RULE-BASED] Calculating risk for ${direction} signal`);
    console.log(`[RULE-BASED] Input features:`, features);
    console.log(`[RULE-BASED] Max SL: ${maxStopLoss}, Max TP: ${maxTakeProfit}`);
    
    // HIGHER SELECTIVITY - require stronger signals to pass 70% threshold
    const baseConfidence = 0.55 + Math.random() * 0.1; // 0.55-0.65 base (requires good features to reach 70%)
    let confidence = baseConfidence;
    
    // Use provided max values if available, otherwise use defaults
    let stopLoss = maxStopLoss || CONFIG.DEFAULT_RISK.stopLoss;
    let takeProfit = maxTakeProfit || CONFIG.DEFAULT_RISK.takeProfit;
    
    // Count how many features we actually have
    const featureCount = Object.values(features).filter(v => v !== 0 && v !== undefined).length;
    console.log(`[RULE-BASED] Active features: ${featureCount} out of ${Object.keys(features).length}`);
    console.log(`[RULE-BASED] Base confidence: ${baseConfidence.toFixed(3)}`);
    
    try {
        // Adjust based on volatility (ATR)
        if (features.atr_pct) {
            if (features.atr_pct > 0.003) { // High volatility
                stopLoss = stopLoss * 1.5;
                takeProfit = takeProfit * 1.3;
            } else if (features.atr_pct < 0.001) { // Low volatility
                stopLoss = stopLoss * 0.7;
                takeProfit = takeProfit * 0.8;
            }
        }

        // Adjust based on momentum
        if (features.momentum_5) {
            const momentumStrength = Math.abs(features.momentum_5);
            if (momentumStrength > 0.005) { // Strong momentum
                confidence += 0.2;
                takeProfit *= 1.2;
            }
        }

        // Adjust based on volume
        if (features.volume_spike_3bar && features.volume_spike_3bar > 1.5) {
            confidence += 0.1;
        }

        // Adjust based on Bollinger Band position
        if (features.bb_position !== undefined) {
            if (direction === 'long' && features.bb_position < 0.3) {
                confidence += 0.15; // Near lower band for long
            } else if (direction === 'short' && features.bb_position > 0.7) {
                confidence += 0.15; // Near upper band for short
            }
        }

        // Adjust based on RSI
        if (features.rsi) {
            console.log(`[RULE-BASED] RSI adjustment: RSI=${features.rsi}, direction=${direction}`);
            if (direction === 'long' && features.rsi < 40) {
                confidence += 0.1; // Oversold for long
                console.log(`[RULE-BASED]   +0.1 confidence (oversold for long)`);
            } else if (direction === 'short' && features.rsi > 60) {
                confidence += 0.1; // Overbought for short
                console.log(`[RULE-BASED]   +0.1 confidence (overbought for short)`);
            } else if (direction === 'long' && features.rsi > 70) {
                confidence -= 0.2; // Overbought for long - BAD
                console.log(`[RULE-BASED]   -0.2 confidence (overbought for long - BAD)`);
            } else if (direction === 'short' && features.rsi < 30) {
                confidence -= 0.2; // Oversold for short - BAD
                console.log(`[RULE-BASED]   -0.2 confidence (oversold for short - BAD)`);
            }
        }
        
        // Penalize if momentum is against the trade direction
        if (features.momentum_5) {
            if ((direction === 'long' && features.momentum_5 < -0.002) ||
                (direction === 'short' && features.momentum_5 > 0.002)) {
                confidence -= 0.15; // Momentum against trade
            }
        }

        confidence = Math.min(Math.max(confidence, 0.1), 0.95); // Keep between 0.1 and 0.95
        console.log(`[RULE-BASED] Final confidence: ${confidence.toFixed(3)} (${confidence >= 0.65 ? 'APPROVED' : 'REJECTED'})`);

    } catch (error) {
        console.error('[RULE-BASED-RISK] Error in calculation:', error.message);
    }

    // Build descriptive reasoning for rule-based decision
    let detailedReason = `Using technical analysis for this ${direction} trade. `;
    
    if (features.momentum_5) {
        if (Math.abs(features.momentum_5) > 0.005) {
            detailedReason += `Strong momentum detected (${(features.momentum_5 * 100).toFixed(1)}%). `;
        } else if ((direction === 'long' && features.momentum_5 < -0.002) || 
                   (direction === 'short' && features.momentum_5 > 0.002)) {
            detailedReason += `Warning: Momentum is against the trade direction. `;
        }
    }
    
    if (features.volume_spike_3bar && features.volume_spike_3bar > 1.5) {
        detailedReason += `Volume spike confirms interest (${features.volume_spike_3bar.toFixed(1)}x normal). `;
    }
    
    if (features.atr_pct) {
        const volatilityLevel = features.atr_pct > 0.003 ? 'high' : features.atr_pct < 0.001 ? 'low' : 'moderate';
        detailedReason += `Market volatility is ${volatilityLevel}. `;
    }
    
    if (features.rsi) {
        if ((direction === 'long' && features.rsi < 40) || (direction === 'short' && features.rsi > 60)) {
            detailedReason += `RSI supports entry (${features.rsi.toFixed(0)}). `;
        } else if ((direction === 'long' && features.rsi > 70) || (direction === 'short' && features.rsi < 30)) {
            detailedReason += `RSI warns of overextension (${features.rsi.toFixed(0)}). `;
        }
    }
    
    detailedReason += `Suggested SL: ${Math.round(stopLoss)} points, TP: ${Math.round(takeProfit)} points based on current conditions.`;
    
    return {
        confidence,
        stopLoss: Math.round(stopLoss),
        takeProfit: Math.round(takeProfit),
        reasoning: detailedReason,
        method: 'rule_based',
        technicalDetails: `Rule-based with ${featureCount} active features`,
        similarPatterns: [] // No specific patterns for rule-based analysis
    };
}

// Extract feature vector using selected features
function extractFeatureVector(features) {
    // IMPORTANT: We need to match the stored vector format
    // Storage vectors have 94 features, so we need to extract ALL features
    // not just the selected 10
    
    // Extract all numeric features in consistent order
    const featureNames = Object.keys(features).filter(key => 
        typeof features[key] === 'number'
    ).sort(); // Sort for consistency
    
    const vector = featureNames.map(name => features[name]);
    
    // Pad to 100 features to match storage format
    if (vector.length < 100) {
        const paddedVector = new Array(100).fill(0);
        vector.forEach((val, idx) => paddedVector[idx] = val);
        console.log(`[FEATURE-EXTRACTION] Extracted ${vector.length} features, padded to 100`);
        return paddedVector;
    }
    
    console.log(`[FEATURE-EXTRACTION] Extracted all ${vector.length} numeric features`);
    return vector;
}

// NEW: Extract graduated feature vector for smart subset matching
function extractGraduatedFeatureVector(graduatedFeatures, graduatedList) {
    // Extract only graduated features in consistent order
    const vector = [];
    
    // Remove graduation info metadata
    const cleanFeatures = { ...graduatedFeatures };
    delete cleanFeatures._graduation_info;
    
    // Build vector using graduated feature names in order
    graduatedList.forEach(featureName => {
        if (cleanFeatures.hasOwnProperty(featureName) && typeof cleanFeatures[featureName] === 'number') {
            vector.push(cleanFeatures[featureName]);
        } else {
            vector.push(0); // Default value for missing graduated features
        }
    });
    
    console.log(`[GRADUATION] Extracted ${vector.length} graduated features for similarity search`);
    console.log(`[GRADUATION] Sample values:`, vector.slice(0, 5));
    
    return vector;
}

// Calculate recPullback - soft-floor exit mechanism
function calculateRecPullback(riskRecommendation, instrument, direction, patterns = []) {
    try {
        // Get average profit and volatility from similar patterns
        let avgProfit = 0;
        let avgMaxProfit = 0;
        let profitCount = 0;
        
        if (patterns.length > 0) {
            // Calculate average profits from similar patterns (using normalized per-contract values)
            const profitablePatterns = patterns.filter(p => (p.pnlPerContract || p.pnl || 0) > 0);
            if (profitablePatterns.length > 0) {
                avgProfit = profitablePatterns.reduce((sum, p) => sum + (p.pnlPerContract || p.pnl || 0), 0) / profitablePatterns.length;
                
                // Calculate average max profit during trades
                const maxProfitPatterns = profitablePatterns.filter(p => p.maxProfit > 0);
                if (maxProfitPatterns.length > 0) {
                    avgMaxProfit = maxProfitPatterns.reduce((sum, p) => sum + p.maxProfit, 0) / maxProfitPatterns.length;
                }
            }
        }
        
        // Default values if no historical data
        if (avgProfit === 0) {
            avgProfit = riskRecommendation.takeProfit || 15; // Use TP as default expected profit
        }
        if (avgMaxProfit === 0) {
            avgMaxProfit = avgProfit * 1.5; // Assume max profit is 1.5x average profit
        }
        
        // Calculate step size - typically 20-30% of average profit
        const stepSize = Math.max(Math.round(avgProfit * 0.25), 5); // Minimum $5 step
        
        // Set initial soft floor at 40-50% of average profit
        const baseFloor = Math.max(Math.round(avgProfit * 0.4), 10); // Minimum $10 floor
        
        // Use consistent values for all instruments - let the data drive the decisions
        const adjustedStepSize = stepSize;
        const adjustedFloor = baseFloor;
        
        console.log(`[REC-PULLBACK] Calculated for ${instrument} ${direction}: Floor=$${adjustedFloor}, Step=$${adjustedStepSize} (avgProfit=$${avgProfit.toFixed(0)}, patterns=${patterns.length})`);
        
        return {
            softFloor: adjustedFloor,      // Minimum profit to secure
            stepSize: adjustedStepSize,     // How much profit to lock in at each step
            maxProfitEstimate: Math.round(avgMaxProfit), // Expected maximum profit
            thresholdDropPercent: 15       // ATH drop percentage to trigger exit (15%)
        };
        
    } catch (error) {
        console.error('[REC-PULLBACK] Error calculating recPullback:', error.message);
        // Return safe defaults
        return {
            softFloor: 10,
            stepSize: 5,
            maxProfitEstimate: 20,
            thresholdDropPercent: 15
        };
    }
}

// Cached stats function to prevent excessive polling
async function getCachedStats() {
    const now = Date.now();
    
    // Return cached stats if still valid
    if (statsCache && (now - lastStatsUpdate) < STATS_CACHE_TTL) {
        return statsCache;
    }
    
    // Update cache
    try {
        const newStats = await storageClient.getStats();
        statsCache = newStats;
        lastStatsUpdate = now;
        return newStats;
    } catch (error) {
        console.error('[STATS-CACHE] Failed to update stats cache:', error.message);
        return statsCache; // Return old cache on error
    }
}

// Record outcome endpoint for risk variation learning
app.post('/api/record-outcome', (req, res) => {
    try {
        const { entrySignalId, outcome } = req.body;
        
        if (!entrySignalId || !outcome) {
            return res.status(400).json({
                error: 'Missing required fields: entrySignalId and outcome'
            });
        }
        
        // Record outcome for variation strategy
        const signalId = entrySignalId || `${outcome.instrument}_${outcome.direction}_${outcome.entryPrice}`;
        riskVariation.recordOutcome(signalId, outcome);
        
        console.log(`[RISK-VARIATION] Recorded outcome for ${signalId}: PnL=$${outcome.pnl}, Exit=${outcome.exitReason}`);
        
        res.json({
            success: true,
            message: 'Outcome recorded for risk variation strategy'
        });
        
    } catch (error) {
        console.error('[RISK-SERVICE] Error recording outcome:', error.message);
        res.status(500).json({
            error: 'Failed to record outcome',
            message: error.message
        });
    }
});

// NEW: Feed completed trade to Risk Principal for heat map digestion
app.post('/api/digest-trade', (req, res) => {
    try {
        const trade = req.body;
        
        // Validate required fields for trade outcome
        if (!trade.instrument || !trade.direction || trade.pnl === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: instrument, direction, and pnl'
            });
        }
        
        // Feed trade to Risk Principal for digestion
        riskPrincipal.digestTradeOutcome(trade);
        
        // Update FluidRiskModel equity curve with enhanced data
        const normalizedPnl = trade.pnlPerContract || trade.pnl || 0;
        fluidRiskModel.updateEquityCurve(normalizedPnl, trade.instrument, trade.timestamp, {
            direction: trade.direction, // Critical for directional bias analysis
            entryPrice: trade.entryPrice,
            exitPrice: trade.exitPrice,
            maxProfit: trade.maxProfit,
            maxLoss: trade.maxLoss,
            entryEfficiency: trade.entryEfficiency,
            exitEfficiency: trade.exitEfficiency,
            totalEfficiency: trade.totalEfficiency,
            commission: trade.commission,
            quantity: trade.quantity,
            exitReason: trade.exitReason,
            holdTimeMinutes: trade.holdTimeMinutes,
            tradeNumber: trade.tradeNumber
        });
        
        console.log(`[RISK-PRINCIPAL] Digested trade: ${trade.direction} ${trade.instrument} PnL=$${normalizedPnl}`);
        
        res.json({
            success: true,
            message: 'Trade digested into heat maps and fluid risk model',
            heatMapStats: riskPrincipal.getHeatMapStats(),
            fluidStats: fluidRiskModel.getStats()
        });
        
    } catch (error) {
        console.error('[RISK-SERVICE] Error digesting trade:', error.message);
        res.status(500).json({
            error: 'Failed to digest trade',
            message: error.message
        });
    }
});

// NEW: Bulk digest historical trades to build initial heat maps
app.post('/api/digest-historical-trades', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { limit = 1000, instrument = 'MGC' } = req.body;
        
        console.log(`[RISK-PRINCIPAL] Starting bulk digest of historical trades for ${instrument} (limit: ${limit})`);
        
        // Get historical trades from storage
        const historicalTrades = await storageClient.getVectors({ 
            instrument: instrument,
            limit: limit 
        });
        
        if (!historicalTrades || historicalTrades.length === 0) {
            return res.json({
                success: true,
                message: 'No historical trades found',
                processed: 0
            });
        }
        
        let processed = 0;
        let skipped = 0;
        
        // Process each trade
        historicalTrades.forEach(trade => {
            try {
                // Convert storage format to digestible format
                const digestibleTrade = {
                    features: trade.featuresJson ? JSON.parse(trade.featuresJson) : null,
                    direction: trade.direction,
                    pnl: trade.pnl,
                    instrument: trade.instrument,
                    exitReason: trade.exitReason,
                    wasGoodExit: trade.wasGoodExit
                };
                
                if (digestibleTrade.features && digestibleTrade.direction && digestibleTrade.pnl !== undefined) {
                    riskPrincipal.digestTradeOutcome(digestibleTrade);
                    processed++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.warn(`[RISK-PRINCIPAL] Error processing trade ${trade.entrySignalId}:`, error.message);
                skipped++;
            }
        });
        
        const stats = riskPrincipal.getHeatMapStats();
        const duration = Date.now() - startTime;
        
        console.log(`[RISK-PRINCIPAL] Bulk digest complete: ${processed} processed, ${skipped} skipped, ${duration}ms`);
        console.log(`[RISK-PRINCIPAL] Heat map stats: ${stats.longCombinations} long combos, ${stats.shortCombinations} short combos`);
        
        res.json({
            success: true,
            message: 'Historical trades digested into heat maps',
            processed: processed,
            skipped: skipped,
            duration: duration,
            heatMapStats: stats
        });
        
    } catch (error) {
        console.error('[RISK-SERVICE] Error digesting historical trades:', error.message);
        res.status(500).json({
            error: 'Failed to digest historical trades',
            message: error.message,
            duration: Date.now() - startTime
        });
    }
});

// Get variation statistics endpoint
app.get('/api/variation-stats', (req, res) => {
    try {
        const stats = riskVariation.getVariationStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('[RISK-SERVICE] Error getting variation stats:', error.message);
        res.status(500).json({
            error: 'Failed to get variation stats',
            message: error.message
        });
    }
});

// NEW: Get heat map statistics
app.get('/api/heat-maps', (req, res) => {
    try {
        const stats = riskPrincipal.getHeatMapStats();
        
        res.json({
            success: true,
            heatMaps: stats,
            summary: {
                totalLongCombinations: stats.longCombinations,
                totalShortCombinations: stats.shortCombinations,
                dataAvailable: stats.longCombinations > 0 || stats.shortCombinations > 0
            }
        });
    } catch (error) {
        console.error('[RISK-SERVICE] Error getting heat map stats:', error.message);
        res.status(500).json({
            error: 'Failed to get heat map statistics',
            message: error.message
        });
    }
});

// NEW: Get graduation status for all maintained graduations
app.get('/api/graduations', (req, res) => {
    try {
        const graduations = [];
        
        for (const [key, graduation] of graduationManager.graduations) {
            const features = graduation.getGraduatedFeatures();
            graduations.push({
                context: graduation.context,
                instrument: graduation.instrument,
                direction: graduation.direction,
                featureCount: features.length,
                features: features,
                lastUpdate: new Date(graduation.lastGraduationUpdate).toISOString(),
                needsUpdate: graduation.shouldUpdateGraduation()
            });
        }
        
        res.json({
            success: true,
            totalGraduations: graduations.length,
            graduations: graduations,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[RISK-SERVICE] Error getting graduation status:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to get graduation status',
            message: error.message
        });
    }
});

// NEW: Trade Analysis Endpoint - What went wrong with recent trades?
app.get('/api/analyze-trades/:instrument?', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const instrument = req.params.instrument || 'MGC';
        const days = parseInt(req.query.days) || 7;
        const direction = req.query.direction; // optional filter
        
        console.log(`[TRADE-ANALYSIS] Analyzing ${instrument} trades from last ${days} days`);
        
        // Get recent trades from storage
        const filters = { instrument };
        if (direction) filters.direction = direction;
        
        const recentTrades = await storageClient.getVectors(filters);
        
        if (!recentTrades || recentTrades.length === 0) {
            return res.json({
                success: true,
                instrument,
                totalTrades: 0,
                message: 'No trades found for analysis'
            });
        }
        
        // Filter by time window
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const tradesInWindow = recentTrades.filter(trade => 
            trade.timestamp && trade.timestamp > cutoffTime
        );
        
        // Separate into winners and losers
        const winningTrades = tradesInWindow.filter(t => t.wasGoodExit && (t.pnl || 0) > 5);
        const losingTrades = tradesInWindow.filter(t => !t.wasGoodExit && (t.pnl || 0) < -5);
        const breakEvenTrades = tradesInWindow.filter(t => Math.abs(t.pnl || 0) <= 5);
        
        console.log(`[TRADE-ANALYSIS] Found ${tradesInWindow.length} trades: ${winningTrades.length} wins, ${losingTrades.length} losses, ${breakEvenTrades.length} break-even`);
        
        // Perform detailed analysis
        const analysis = {
            instrument,
            timeframe: `${days} days`,
            totalTrades: tradesInWindow.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            breakEvenTrades: breakEvenTrades.length,
            winRate: tradesInWindow.length > 0 ? (winningTrades.length / tradesInWindow.length * 100).toFixed(1) : 0,
            
            // Detailed analysis
            failureAnalysis: null,
            successAnalysis: null,
            overallInsights: [],
            recommendations: [],
            
            // Performance metrics
            totalPnL: tradesInWindow.reduce((sum, t) => sum + (t.pnl || 0), 0),
            avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
            avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losingTrades.length : 0,
            profitFactor: 0
        };
        
        // Calculate profit factor
        const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
        analysis.profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : 'N/A';
        
        // Analyze failures if we have losing trades
        if (losingTrades.length >= 2) {
            analysis.failureAnalysis = analyzeFailurePatterns(losingTrades, []);
            
            // Add failure insights to overall insights
            analysis.overallInsights.push(`${losingTrades.length} losing trades with common issue: ${analysis.failureAnalysis.recommendations[0] || 'Various exit reasons'}`);
            analysis.recommendations.push(...analysis.failureAnalysis.recommendations);
        }
        
        // Analyze successes if we have winning trades
        if (winningTrades.length >= 2) {
            analysis.successAnalysis = analyzeSuccessPatterns(winningTrades, []);
            
            // Add success insights
            analysis.overallInsights.push(`${winningTrades.length} winning trades show: ${analysis.successAnalysis.keyStrengths[0] || 'Consistent profit capture'}`);
        }
        
        // Overall performance insights
        if (analysis.winRate < 40) {
            analysis.overallInsights.push(`Low win rate (${analysis.winRate}%) - review entry criteria or risk management`);
        } else if (analysis.winRate > 60) {
            analysis.overallInsights.push(`Good win rate (${analysis.winRate}%) - system performing well`);
        }
        
        if (analysis.profitFactor < 1.0) {
            analysis.recommendations.push('Profit factor below 1.0 - system losing money overall');
        } else if (analysis.profitFactor > 1.5) {
            analysis.recommendations.push('Strong profit factor - maintain current approach');
        }
        
        const duration = Date.now() - startTime;
        
        console.log(`[TRADE-ANALYSIS] Analysis complete: ${analysis.winRate}% win rate, PF: ${analysis.profitFactor}, Total P&L: $${analysis.totalPnL.toFixed(0)}`);
        
        res.json({
            success: true,
            analysis,
            duration
        });
        
    } catch (error) {
        console.error('[TRADE-ANALYSIS] Error analyzing trades:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze trades',
            message: error.message,
            duration: Date.now() - startTime
        });
    }
});

// NEW: Evaluate risk endpoint (for direct NT integration)
app.post('/api/evaluate-risk', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { features, instrument, entryType, direction, timestamp, entrySignalId, maxStopLoss, maxTakeProfit, timeframeMinutes = 1, quantity = 1 } = req.body;
        
        // FAST LOG: Just show the basic request info
        console.log(`[RISK-SERVICE] ${direction} ${instrument} @ ${features?.close_price || 'unknown'}`);
        
        // BACKGROUND RECOVERY CHECK: Non-blocking analysis (only if likely issues)
        setImmediate(async () => {
            try {
                // Quick check using memory manager first (faster than storage)
                const recentVectors = memoryManager?.getRecentVectorsForInstrumentDirection?.(instrument, direction) || [];
                if (recentVectors.length >= 3) {
                    const consecutiveLosses = countConsecutiveLosses(recentVectors.slice(0, 5));
                    const recentBigLosses = recentVectors.slice(0, 5).filter(t => (t.pnlPerContract || t.pnl) < -20).length;
                    
                    // Only do full analysis if there are real issues
                    if (consecutiveLosses >= 3 || recentBigLosses >= 2) {
                        let cumulativePnL = 0;
                        const last5 = recentVectors.slice(0, 5);
                        const equityCurve = last5
                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                            .map(trade => {
                                cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
                                return cumulativePnL;
                            });
                        
                        const currentPnL = equityCurve[equityCurve.length - 1];
                        const winRate = (last5.filter(t => (t.pnlPerContract || t.pnl) > 0).length / last5.length) * 100;
                        const recoveryStatus = getRecoveryStatus(currentPnL, 0, consecutiveLosses, winRate);
                        
                        console.log(`🚨 [RECOVERY-MODE] ${direction} ${instrument} @ ${features?.close_price || 'unknown'}`);
                        console.log(`   💰 Equity: $${currentPnL.toFixed(0)} | Losses: ${consecutiveLosses} consecutive | Win Rate: ${winRate.toFixed(0)}%`);
                        console.log(`   🎯 Strategy: ${recoveryStatus.strategy} | Priority: ${recoveryStatus.priority}`);
                    }
                }
            } catch (error) {
                // Silently fail - background task
            }
        });
        
        if (!features || !instrument) {
            return res.status(400).json({
                error: 'Missing required fields: features and instrument'
            });
        }
        
        // PHASE 1 OPTIMIZATION: Check cache first (include timeframe in cache key)
        // DISABLED FOR GP CONFIDENCE DEBUGGING
        /*
        const featureHash = JSON.stringify([
            features.close_price, features.volume, features.rsi_14, 
            features.momentum_5, features.body_ratio
        ]).substring(0, 50);
        const cacheKey = `${instrument}_${direction}_${timeframeMinutes}m_${quantity}q_${featureHash}`;
        
        const cachedResponse = riskCache.get(cacheKey);
        if (cachedResponse) {
            console.log(`[RISK-SERVICE] Cache hit: ${cacheKey.substring(0, 20)}... - Duration: ${Date.now() - startTime}ms`);
            return res.json(cachedResponse);
        }
        */
        
        // STAGE 0: A/B Test Assignment (if enabled)
        let assignedVariant = null;
        if (abTesting && entrySignalId) {
            assignedVariant = abTesting.assignVariant(entrySignalId);
        }
        
        // STAGE 1: Choose prediction method based on A/B test or configuration
        const stage1Start = Date.now();
        let riskRecommendation;
        let predictionMethod = 'graduated_ranges'; // Default
        
        // Determine which method to use (GP SYSTEM DISABLED)
        // const useGP = (assignedVariant === 'gp') || 
        //               (assignedVariant === null && CONFIG.ENABLE_GP_INTEGRATION === true);
        const usePrunedRanges = (assignedVariant === 'pruned_ranges') ||
                               (assignedVariant === null && CONFIG.ENABLE_PRUNED_RANGES === true);
        const useRobustZones = (assignedVariant === 'robust_zones') ||
                              (assignedVariant === null && CONFIG.ENABLE_ROBUST_ZONES === true);
        
        // FLUID RISK MODEL - Primary continuous probability-based evaluation
        try {
            console.log(`[RISK-SERVICE] STAGE1: Using Fluid Risk Model...`);
            predictionMethod = 'fluid_risk_model';
            
            riskRecommendation = await fluidRiskModel.evaluateRisk(instrument, direction, features, timestamp);
            
            console.log(`[FLUID-RISK] Fluid prediction completed: ${riskRecommendation.approved ? 'APPROVED' : 'REJECTED'} (${(riskRecommendation.confidence * 100).toFixed(1)}%)`);
            
        } catch (error) {
            console.error(`[RISK-SERVICE] Fluid Risk Model failed, using fallback: ${error.message}`);
            
            // Simple fallback to range-based prediction  
            riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
            predictionMethod = 'graduated_ranges_fallback';
        }
        
        // Skip complex nested fallback logic - FluidRiskModel is primary
        if (false && useRobustZones) {
                // ROBUST ZONES PREDICTION - DISABLED
                predictionMethod = 'robust_zones';
                
                try {
                    // Check if memory manager is initialized
                if (!memoryManager.isInitialized) {
                    console.log('[ROBUST-ZONES] Memory not initialized - falling back to graduated_ranges');
                    riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
                    predictionMethod = 'graduated_ranges_fallback';
                } else {
                    // Run robust zones analysis with entry type for better segregation
                    const zonesAnalysis = await robustZoneEngine.analyze(features, instrument, direction, memoryManager, entryType);
                    
                    // Store the evaluation details for outcome tracking (if entrySignalId provided)
                    if (entrySignalId) {
                        // Store evaluation context for later outcome recording
                        if (!global.pendingEvaluations) {
                            global.pendingEvaluations = new Map();
                        }
                        global.pendingEvaluations.set(entrySignalId, {
                            instrument,
                            direction,
                            entryType,
                            confidence: zonesAnalysis.confidence,
                            membership: zonesAnalysis.membership?.score || 0,
                            timestamp: Date.now()
                        });
                    }
                    
                    // Convert zones format to standard risk recommendation format
                    riskRecommendation = {
                        approved: zonesAnalysis.confidence >= 0.5,
                        confidence: zonesAnalysis.confidence,
                        suggested_sl: maxStopLoss || 10,  // Use defaults for now
                        suggested_tp: maxTakeProfit || 15,
                        stopLoss: maxStopLoss || 10,
                        takeProfit: maxTakeProfit || 15,
                        reasoning: zonesAnalysis.zone.description,
                        method: 'robust_zones',
                        robustZonesDetails: {
                            zoneMembership: zonesAnalysis.membership.score,
                            zoneRobustness: zonesAnalysis.zone.robustnessScore,
                            sampleSize: zonesAnalysis.zone.sampleSize,
                            inOptimalZone: zonesAnalysis.membership.inOptimalZone,
                            processingTime: zonesAnalysis.processingTime
                        }
                    };
                    
                    // Add recovery strategy context if zones are being adjusted for recovery
                    if (!CONFIG.BACKTEST_MODE && zonesAnalysis.zone && zonesAnalysis.zone.adjustmentType) {
                        console.log(`   🔧 Zone Adjustment: ${zonesAnalysis.zone.adjustmentType} | Robustness: ${(zonesAnalysis.zone.robustnessScore * 100).toFixed(0)}% | Samples: ${zonesAnalysis.zone.sampleSize}`);
                        
                        // Add specific recovery context if confidence is low due to recent performance
                        if (zonesAnalysis.confidence < 0.6) {
                            console.log(`   ⚠️  Low confidence detected - Zone engine applying defensive adjustments`);
                        }
                    }
                }
                
            } catch (error) {
                console.log(`[ROBUST-ZONES] Analysis failed: ${error.message}, falling back to graduated_ranges`);
                riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
                predictionMethod = 'graduated_ranges_fallback';
            }
        }
        
        // Alternative methods (legacy - disabled while FluidRiskModel is primary)
        if (false && usePrunedRanges) {
            // PRUNED RANGES PREDICTION
            console.log(`[RISK-SERVICE] STAGE1: Using pruned ranges prediction...`);
            predictionMethod = 'pruned_ranges';
            
            try {
                // EARLY EXIT: Check if memory manager is initialized (same pattern as graduated_ranges)
                if (!memoryManager.isInitialized) {
                    console.log('[PRUNED-RANGES] Memory not initialized - falling back to graduated_ranges');
                    riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
                    predictionMethod = 'graduated_ranges_fallback';
                } else {
                    // FAST: Use memory-based trade data (identical to graduated_ranges approach)
                    const recentTrades = memoryManager.getVectorsForInstrumentDirection(instrument, direction);
                    console.log(`[PRUNED-RANGES] Retrieved ${recentTrades.length} trades from memory for ${instrument} ${direction}`);
                    
                    // EARLY EXIT: Check if we have enough data (same pattern as graduated_ranges)
                    if (recentTrades.length < 10) {
                        console.log(`[PRUNED-RANGES] Insufficient data for ${instrument}_${direction} (${recentTrades.length} vectors, need 10+), using graduated_ranges`);
                        riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
                        predictionMethod = 'graduated_ranges_fallback';
                    } else {
                        // Run pruned ranges analysis with full dataset and entry type
                        const prunedAnalysis = await prunedRangesEngine.analyze(features, recentTrades, quantity, entryType);
                        
                        // Convert pruned ranges format to standard risk recommendation format
                        riskRecommendation = {
                            approved: prunedAnalysis.confidence >= 0.5,
                            confidence: prunedAnalysis.confidence,
                            suggested_sl: prunedAnalysis.riskParams.stopLoss,
                            suggested_tp: prunedAnalysis.riskParams.takeProfit,
                            stopLoss: prunedAnalysis.riskParams.stopLoss,
                            takeProfit: prunedAnalysis.riskParams.takeProfit,
                            reasoning: prunedAnalysis.cluster.reasoning || 'Multi-dimensional clustering analysis',
                            riskParameters: prunedAnalysis.riskParams,
                            method: 'pruned_ranges',
                            prunedRangesDetails: {
                                clusterQuality: prunedAnalysis.cluster.quality,
                                scalability: prunedAnalysis.scalability,
                                regimeChange: prunedAnalysis.regime.regimeChangeDetected,
                                featureCombination: prunedAnalysis.featureCombination,
                                processingTime: prunedAnalysis.processingTime
                            }
                        };
                        
                        console.log(`[RISK-SERVICE] Pruned ranges prediction completed: ${riskRecommendation.approved ? 'APPROVED' : 'REJECTED'} (${(riskRecommendation.confidence * 100).toFixed(1)}%)`);
                        console.log(`[PRUNED-RANGES] Cluster quality: ${prunedAnalysis.cluster.quality?.toFixed(3)}, Scalability: ${prunedAnalysis.scalability.canScale}, Regime change: ${prunedAnalysis.regime.regimeChangeDetected}`);
                    }
                }
                
            } catch (error) {
                console.error(`[RISK-SERVICE] Pruned ranges prediction failed: ${error.message}`);
                // Fallback to graduated ranges for pruned ranges failures
                console.log(`[RISK-SERVICE] Falling back to graduated ranges...`);
                riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
                predictionMethod = 'graduated_ranges_fallback';
            }
        } else {
            // RANGE-BASED PREDICTION (original logic)
            console.log(`[RISK-SERVICE] STAGE1: Using range-based prediction...`);
            riskRecommendation = await calculateRangeBasedRisk(instrument, direction, features, timestamp, maxStopLoss, maxTakeProfit);
            predictionMethod = 'graduated_ranges';
        }
        
        const stage1Duration = Date.now() - stage1Start;
        // Removed verbose stage duration logging
        
        // STAGE 3: Analyze recent trades (optimized for memory manager)
        const stage3Start = Date.now();
        let recentTradeAnalysis;
        
        if (memoryManager.isInitialized) {
            // FAST: Use memory-based recent trade analysis
            recentTradeAnalysis = analyzeRecentTradesFromMemory(instrument, direction, timestamp);
            console.log(`[RISK-SERVICE] STAGE3-RECENT: Recent trade analysis (memory) completed - Duration: ${Date.now() - stage3Start}ms`);
        } else {
            // SLOW: Fallback to storage-based analysis
            recentTradeAnalysis = await analyzeRecentTrades(instrument, direction, timestamp);
            console.log(`[RISK-SERVICE] STAGE3-RECENT: Recent trade analysis (storage) completed - Duration: ${Date.now() - stage3Start}ms`);
        }
        const stage3Duration = Date.now() - stage3Start;
        
        // Apply recent trade analysis to ADJUST risk (never reject)
        if (recentTradeAnalysis.riskAdjustment) {
            console.log(`[RISK-SERVICE] ADJUSTING RISK based on recent trades: ${recentTradeAnalysis.riskAdjustment.reason}`);
            
            // Apply suggested adjustments if available
            if (recentTradeAnalysis.riskAdjustment.suggestedSL) {
                riskRecommendation.stopLoss = recentTradeAnalysis.riskAdjustment.suggestedSL;
            }
            if (recentTradeAnalysis.riskAdjustment.suggestedTP) {
                riskRecommendation.takeProfit = recentTradeAnalysis.riskAdjustment.suggestedTP;
            }
            
            riskRecommendation.reasoning += ` | ${recentTradeAnalysis.riskAdjustment.reason}`;
        }
        
        // console.log(`[GP-CONFIDENCE-DEBUG] Pre-response confidence: ${riskRecommendation.confidence}`); // GP DEBUG DISABLED
        // console.log(`[GP-CONFIDENCE-DEBUG] Recent trade analysis effect: ${recentTradeAnalysis.riskAdjustment ? 'YES' : 'NO'}`); // GP DEBUG DISABLED
        
        // Check if confidence is being modified anywhere
        if (recentTradeAnalysis.confidencePenalty) {
            // console.log(`[GP-CONFIDENCE-DEBUG] Confidence penalty detected: ${recentTradeAnalysis.confidencePenalty}`); // GP DEBUG DISABLED
            riskRecommendation.confidence -= recentTradeAnalysis.confidencePenalty;
            // console.log(`[GP-CONFIDENCE-DEBUG] Post-penalty confidence: ${riskRecommendation.confidence}`); // GP DEBUG DISABLED
        }
        
        // Log if we're rejecting
        if (riskRecommendation.confidence < 0.5) {
            console.log(`[RISK-SERVICE] REJECTING signal with confidence ${riskRecommendation.confidence.toFixed(2)}`);
        }
        
        const duration = Date.now() - startTime;
        
        // STAGE 4: Format response
        // Remove verbose timing logs - focus on exploration mode detection
        
        // Apply strategy-specific max limits if provided
        let finalStopLoss = riskRecommendation.stopLoss;
        let finalTakeProfit = riskRecommendation.takeProfit;
        
        if (maxStopLoss && maxStopLoss > 0) {
            finalStopLoss = Math.min(riskRecommendation.stopLoss, maxStopLoss);
        }
        
        if (maxTakeProfit && maxTakeProfit > 0) {
            finalTakeProfit = Math.min(riskRecommendation.takeProfit, maxTakeProfit);
        }
        
        // STAGE 5: Position size risk adjustment
        if (quantity > 1) {
            // Scale down risk per contract to maintain same total dollar risk
            const positionSizeMultiplier = Math.sqrt(quantity); // Conservative square root scaling
            finalStopLoss = Math.max(finalStopLoss / positionSizeMultiplier, 5); // Minimum $5 SL per contract
            finalTakeProfit = Math.max(finalTakeProfit / positionSizeMultiplier, 5); // Minimum $5 TP per contract
            
            if (!CONFIG.BACKTEST_MODE) {
                console.log(`[RISK-SERVICE] Position size adjustment: ${quantity} contracts - SL scaled by 1/${positionSizeMultiplier.toFixed(2)} to ${finalStopLoss.toFixed(2)}, TP to ${finalTakeProfit.toFixed(2)}`);
            }
        }
        
        // Log if limits were applied
        if (!CONFIG.BACKTEST_MODE && (finalStopLoss !== riskRecommendation.stopLoss || finalTakeProfit !== riskRecommendation.takeProfit)) {
            console.log(`[RISK-SERVICE] Applied strategy limits: SL ${riskRecommendation.stopLoss} → ${finalStopLoss} (max: ${maxStopLoss}), TP ${riskRecommendation.takeProfit} → ${finalTakeProfit} (max: ${maxTakeProfit})`);
        }

        // Format response for NT
        const response = {
            approved: riskRecommendation.confidence >= 0.5, // Approve if confidence >= 50%
            confidence: riskRecommendation.confidence,
            // NT expects snake_case based on JsonProperty attributes
            suggested_sl: finalStopLoss,
            suggested_tp: finalTakeProfit,
            reasons: riskRecommendation.reasons || [riskRecommendation.reasoning],
            // Also include in riskParameters for backward compatibility
            riskParameters: {
                stopLoss: finalStopLoss,
                takeProfit: finalTakeProfit
            },
            method: predictionMethod,
            duration,
            recentTrades: {
                consecutiveLosses: recentTradeAnalysis.consecutiveLosses,
                recentWinRate: recentTradeAnalysis.recentWinRate,
                totalRecentTrades: recentTradeAnalysis.totalRecentTrades,
                avgMaxProfit: recentTradeAnalysis.avgMaxProfit,
                riskAdjustment: recentTradeAnalysis.riskAdjustment
            }
        };
        
        // A/B Testing: Record prediction if enabled
        if (abTesting && assignedVariant && entrySignalId) {
            abTesting.recordPrediction(assignedVariant, entrySignalId, response, {
                instrument,
                direction,
                features
            });
        }
        
        // PHASE 1 OPTIMIZATION: Skip verbose logging in backtest mode
        if (!CONFIG.BACKTEST_MODE) {
            // Single line decision format: [Confidence] [Reasoning] [Error] [JSON]
            const confidence = `${(response.confidence * 100).toFixed(0)}%`;
            const reasoning = response.reasoning || response.reasons?.[0] || 'No reasoning provided';
            console.log(`[${confidence}] ${reasoning}`);
        }
        
        // PHASE 1 OPTIMIZATION: Cache the response for future requests
        // DISABLED FOR GP CONFIDENCE DEBUGGING
        // riskCache.set(cacheKey, response);
        
        // DECISION MONITORING: Record this decision for later analysis (non-blocking)
        if (entrySignalId && !CONFIG.BACKTEST_MODE) {
            try {
                // Determine if we're in recovery mode from the recent trades analysis
                const isRecoveryMode = recentTrades && recentTrades.length >= 5 && 
                    (() => {
                        let cumulativePnL = 0;
                        const equityCurve = recentTrades
                            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                            .map(trade => {
                                cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
                                return cumulativePnL;
                            });
                        
                        const currentPnL = equityCurve[equityCurve.length - 1];
                        const peak = Math.max(...equityCurve);
                        const drawdown = peak - currentPnL;
                        const drawdownPercent = peak !== 0 ? (drawdown / Math.abs(peak)) * 100 : 0;
                        const consecutiveLosses = countConsecutiveLosses(recentTrades);
                        
                        return currentPnL < -50 || drawdownPercent > 10 || consecutiveLosses >= 3;
                    })();
                
                decisionMonitor.recordDecision(entrySignalId, {
                    instrument,
                    direction,
                    entryType,
                    confidence: response.confidence,
                    approved: response.approved,
                    suggestedSL: response.suggested_sl,
                    suggestedTP: response.suggested_tp,
                    method: response.method,
                    reasoning: response.reasons?.[0] || 'No reasoning',
                    recoveryMode: isRecoveryMode,
                    recoveryStrategy: isRecoveryMode ? getRecoveryStatus(
                        recentTrades ? (() => {
                            let cumulativePnL = 0;
                            const equityCurve = recentTrades
                                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                                .map(trade => {
                                    cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
                                    return cumulativePnL;
                                });
                            return equityCurve[equityCurve.length - 1];
                        })() : 0,
                        recentTrades ? (() => {
                            let cumulativePnL = 0;
                            const equityCurve = recentTrades
                                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                                .map(trade => {
                                    cumulativePnL += (trade.pnlPerContract || trade.pnl || 0);
                                    return cumulativePnL;
                                });
                            const peak = Math.max(...equityCurve);
                            const currentPnL = equityCurve[equityCurve.length - 1];
                            const drawdown = peak - currentPnL;
                            return peak !== 0 ? (drawdown / Math.abs(peak)) * 100 : 0;
                        })() : 0,
                        recentTrades ? countConsecutiveLosses(recentTrades) : 0,
                        recentTrades ? (recentTrades.filter(t => (t.pnlPerContract || t.pnl) > 0).length / recentTrades.length) * 100 : 50
                    ).strategy : null,
                    // Context data for analysis
                    recentTrades: response.recentTrades,
                    equityCurve: recentTrades ? recentTrades.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                        .map(trade => (trade.pnlPerContract || trade.pnl || 0)) : [],
                    consecutiveLosses: response.recentTrades?.consecutiveLosses || 0
                });
            } catch (error) {
                // Don't block trading if monitoring fails
                console.log(`[DECISION-MONITOR] Recording failed: ${error.message}`);
            }
        }
        
        res.json(response);
        
    } catch (error) {
        // Single line error format: [Confidence] [Reasoning] [Error] [JSON]
        console.log(`[0%] Risk service failed: ${error.message} ERROR: ${error.name} ${JSON.stringify({stack: error.stack.split('\n')[0]})}`);
        
        // NO FALLBACKS - return the actual error to expose the problem
        res.status(500).json({
            error: 'RISK_SERVICE_ERROR',
            message: error.message,
            approved: false,
            confidence: 0.0,
            suggested_sl: 0,
            suggested_tp: 0,
            reasons: [`Risk service failed: ${error.message}`],
            method: 'error_no_fallback',
            duration: Date.now() - startTime
        });
    }
});

// Get configuration endpoint
app.get('/config', (req, res) => {
    res.json({
        service: 'agentic-memory-risk-service',
        version: '2.0.0',
        config: CONFIG,
        riskManagers: {
            tradeApproval: 'Robot - Fast decisions based on gradient feature combinations',
            principal: 'Scientist - Continuously updates heat maps from trade outcomes'
        },
        endpoints: {
            'POST /api/approve-signal': 'Main signal approval with heat map + agentic risk management',
            'POST /api/evaluate-risk': 'Direct risk evaluation with features from NT',
            'POST /api/record-trade-outcome': 'Record actual trade outcome for self-correction learning',
            'POST /api/digest-trade': 'Feed completed trade to heat map system',
            'POST /api/digest-historical-trades': 'Bulk process historical trades to build heat maps',
            'GET /api/heat-maps': 'View heat map statistics and top combinations',
            'POST /api/record-outcome': 'Record trade outcome for risk variation',
            'GET /api/variation-stats': 'Get risk variation statistics',
            'GET /api/analyze-trades/:instrument': 'Analyze recent trade performance',
            'GET /health': 'Health check',
            'GET /config': 'Configuration details'
        }
    });
});

// Feature generation functions removed - Risk Service now gets features from ME
// This ensures consistency and eliminates duplicate feature engineering

// Trade outcome processing endpoint for online learning
app.post('/api/trade-outcome', async (req, res) => {
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
        } = req.body;

        if (!entrySignalId || !instrument || actualPnl === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: entrySignalId, instrument, actualPnl'
            });
        }

        console.log(`[RISK-SERVICE] Processing trade outcome: ${entrySignalId} - PnL: $${actualPnl.toFixed(2)}`);

        // Update FluidRiskModel with trade outcome
        const normalizedPnl = actualPnl / (quantity || 1);
        fluidRiskModel.updateEquityCurve(normalizedPnl, instrument, timestamp);

        res.json({
            success: true,
            message: 'Trade outcome processed for fluid risk model'
        });

    } catch (error) {
        console.error('[RISK-SERVICE] Error processing trade outcome:', error);
        res.status(500).json({
            error: 'Failed to process trade outcome',
            message: error.message
        });
    }
});

// Online learning statistics endpoint
app.get('/api/learning-stats', (req, res) => {
    try {
        const stats = fluidRiskModel.getStats();
        res.json({
            fluidRiskModel: stats,
            message: 'Fluid risk model statistics'
        });
    } catch (error) {
        console.error('[RISK-SERVICE] Error getting fluid risk stats:', error);
        res.status(500).json({
            error: 'Failed to get fluid risk statistics',
            message: error.message
        });
    }
});

// A/B Testing report endpoint
app.get('/api/ab-test/report', (req, res) => {
    try {
        if (!abTesting) {
            return res.json({ error: 'A/B testing not enabled' });
        }
        
        const report = abTesting.generateReport();
        res.json({
            report: report,
            statistics: abTesting.calculateStatistics()
        });
        
    } catch (error) {
        console.error('[RISK-SERVICE] Error generating A/B test report:', error);
        res.status(500).json({
            error: 'Failed to generate A/B test report',
            message: error.message
        });
    }
});

// Helper functions for recovery analysis
function countConsecutiveLosses(trades) {
    if (!trades || trades.length === 0) return 0;
    
    const sortedTrades = trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let consecutive = 0;
    
    for (const trade of sortedTrades) {
        const pnl = trade.pnlPerContract || trade.pnl || 0;
        if (pnl < 0) {
            consecutive++;
        } else {
            break;
        }
    }
    
    return consecutive;
}

function getDaysSinceLastWin(trades) {
    if (!trades || trades.length === 0) return null;
    
    const sortedTrades = trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const lastWin = sortedTrades.find(trade => (trade.pnlPerContract || trade.pnl || 0) > 0);
    
    if (!lastWin) return null;
    
    const daysDiff = (Date.now() - new Date(lastWin.timestamp)) / (1000 * 60 * 60 * 24);
    return Math.floor(daysDiff);
}

function getRecoveryStatus(currentPnL, drawdownPercent, consecutiveLosses, winRate) {
    // Determine recovery strategy based on current situation
    if (consecutiveLosses >= 5 && currentPnL < -200) {
        return {
            strategy: "EMERGENCY HALT",
            action: "Suspend trading, review market conditions",
            priority: "🔴 CRITICAL"
        };
    } else if (consecutiveLosses >= 4 && drawdownPercent > 25) {
        return {
            strategy: "DEFENSIVE MODE", 
            action: "Ultra-tight SL, reduced position sizes",
            priority: "🟠 HIGH"
        };
    } else if (consecutiveLosses >= 3 && winRate < 30) {
        return {
            strategy: "PATTERN RESET",
            action: "Tightening risk zones, waiting for better setups",
            priority: "🟡 MEDIUM"
        };
    } else if (drawdownPercent > 15) {
        return {
            strategy: "GRADUAL RECOVERY",
            action: "Reducing risk per trade, focus on R:R optimization",
            priority: "🔵 LOW"
        };
    } else {
        return {
            strategy: "CAUTIOUS MONITORING",
            action: "Minor risk adjustments, maintain vigilance", 
            priority: "🟢 ROUTINE"
        };
    }
}

// Start server
app.listen(port, async () => {
    console.log(`🎯 Agentic Memory Risk Service listening on port ${port}`);
    console.log(`🧠 Integration: Compatible with existing NinjaTrader approval mechanism`);
    console.log(`📊 Features: Adaptive risk management based on historical patterns`);
    console.log(`🔄 Fallback: Rule-based risk when insufficient historical data`);
    // console.log(`🤖 GP Integration: ${CONFIG.ENABLE_GP_INTEGRATION ? 'ENABLED' : 'DISABLED'}`); // GP DISABLED
    console.log(`⚖️  A/B Testing: ${CONFIG.ENABLE_AB_TESTING ? 'ENABLED' : 'DISABLED'}`);
    
    // FluidRiskModel is now initialized and ready
    
    // Start decision analysis monitoring
    decisionMonitor.startMonitoring();
    
    // Test storage connection
    const connected = await storageClient.testConnection();
    if (connected) {
        console.log(`✅ Connected to Storage Agent at ${storageClient.baseUrl}`);
        
        // Initialize memory manager (async)
        console.log(`🚀 Initializing memory manager...`);
        try {
            await memoryManager.initialize();
            console.log(`🧠 Memory manager ready - fast risk decisions enabled`);
            
            // Debug: Show what was loaded
            const stats = memoryManager.getStats();
            console.log(`[MEMORY-DEBUG] Loaded ${stats.vectorCount} vectors, ${stats.instrumentCount} instruments`);
            console.log(`[MEMORY-DEBUG] Instruments: ${stats.instruments.join(', ')}`);
            console.log(`[MEMORY-DEBUG] Graduation tables: ${stats.graduationTables.join(', ')}`);
            
        } catch (error) {
            console.log(`⚠️  Memory manager initialization failed: ${error.message}`);
            console.log(`🔄 Falling back to direct storage queries`);
            console.log(`[MEMORY-DEBUG] Full error:`, error);
        }
    } else {
        console.log(`⚠️  Storage Agent not available - using rule-based fallback only`);
    }
});