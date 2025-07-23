/**
 * Decision Analysis Monitor
 * 
 * Tracks our risk decisions and analyzes their effectiveness
 * WITHOUT creating circular loops by operating as a separate analysis layer
 */

class DecisionAnalysisMonitor {
    constructor() {
        // Track decision patterns and outcomes
        this.decisionLog = new Map(); // entrySignalId -> decision details
        this.outcomeLog = new Map();  // entrySignalId -> trade outcome
        this.analysisResults = new Map(); // instrument -> analysis summaries
        
        // Decision quality metrics
        this.qualityThresholds = {
            confidence: {
                HIGH: 0.8,    // 80%+ confidence decisions
                MEDIUM: 0.6,  // 60-79% confidence
                LOW: 0.5      // 50-59% confidence
            },
            outcome: {
                GOOD_WIN: 20,      // Profit > $20
                SMALL_WIN: 5,      // Profit $5-20
                BREAK_EVEN: 0,     // -$5 to $5
                SMALL_LOSS: -20,   // Loss -$5 to -$20
                BAD_LOSS: -50      // Loss > $20
            }
        };
        
        // Analysis intervals
        this.lastAnalysis = new Date();
        this.analysisIntervalMinutes = 30;
        
        console.log('[DECISION-MONITOR] 🔍 Decision Analysis Monitor initialized');
    }

    /**
     * Record a risk decision (called from risk service)
     * NON-BLOCKING - just logs the decision for later analysis
     */
    recordDecision(entrySignalId, decisionDetails) {
        if (!entrySignalId) return;
        
        const decision = {
            timestamp: new Date(),
            instrument: decisionDetails.instrument,
            direction: decisionDetails.direction,
            entryType: decisionDetails.entryType,
            confidence: decisionDetails.confidence,
            approved: decisionDetails.approved,
            suggestedSL: decisionDetails.suggestedSL,
            suggestedTP: decisionDetails.suggestedTP,
            method: decisionDetails.method,
            reasoning: decisionDetails.reasoning,
            recoveryMode: decisionDetails.recoveryMode || false,
            recoveryStrategy: decisionDetails.recoveryStrategy,
            // Context that influenced decision
            recentTrades: decisionDetails.recentTrades,
            equityCurve: decisionDetails.equityCurve,
            consecutiveLosses: decisionDetails.consecutiveLosses
        };
        
        this.decisionLog.set(entrySignalId, decision);
        
        // Non-verbose logging - only significant decisions
        if (decision.confidence >= 0.8 || decision.recoveryMode) {
            console.log(`[DECISION-MONITOR] 📝 Logged ${decision.confidence.toFixed(0)}% confidence decision for ${decision.instrument} ${decision.direction}`);
        }
    }

    /**
     * Record trade outcome (called when trade closes)
     * NON-BLOCKING - just logs the outcome for later analysis
     */
    recordOutcome(entrySignalId, outcomeDetails) {
        if (!entrySignalId) return;
        
        const outcome = {
            timestamp: new Date(),
            pnl: outcomeDetails.pnlPerContract || outcomeDetails.pnl || 0,
            exitReason: outcomeDetails.exitReason,
            maxProfit: outcomeDetails.maxProfit || 0,
            maxLoss: outcomeDetails.maxLoss || 0,
            actualSL: outcomeDetails.actualSL,
            actualTP: outcomeDetails.actualTP,
            barsHeld: outcomeDetails.barsHeld || 0
        };
        
        this.outcomeLog.set(entrySignalId, outcome);
        
        // Try to analyze this decision-outcome pair immediately
        this.analyzeDecisionOutcome(entrySignalId);
    }

    /**
     * Analyze a specific decision-outcome pair
     * This is where the learning happens
     */
    analyzeDecisionOutcome(entrySignalId) {
        const decision = this.decisionLog.get(entrySignalId);
        const outcome = this.outcomeLog.get(entrySignalId);
        
        if (!decision || !outcome) return; // Need both to analyze
        
        const analysis = this.calculateDecisionQuality(decision, outcome);
        
        // CRITICAL INSIGHT DETECTION
        if (analysis.quality === 'OVERCONFIDENT_LOSS') {
            console.log(`🚨 [DECISION-MONITOR] OVERCONFIDENT FAILURE: ${decision.confidence.toFixed(0)}% confidence → $${outcome.pnl.toFixed(0)} loss`);
            console.log(`   🎯 Pattern: ${decision.instrument} ${decision.direction} ${decision.entryType}`);
            console.log(`   🧠 Method: ${decision.method} | Recovery: ${decision.recoveryMode ? 'YES' : 'NO'}`);
            console.log(`   💡 Insight: High confidence not matching outcomes - review ${decision.method} logic`);
        }
        
        if (analysis.quality === 'UNDERCONFIDENT_WIN') {
            console.log(`✅ [DECISION-MONITOR] MISSED OPPORTUNITY: ${decision.confidence.toFixed(0)}% confidence → $${outcome.pnl.toFixed(0)} profit`);
            console.log(`   💡 Insight: Could increase confidence for similar setups`);
        }
        
        if (analysis.quality === 'GOOD_DECISION') {
            console.log(`🎯 [DECISION-MONITOR] CALIBRATED: ${decision.confidence.toFixed(0)}% confidence → $${outcome.pnl.toFixed(0)} result`);
        }
        
        // Store analysis for periodic review
        const instrumentKey = `${decision.instrument}_${decision.direction}`;
        if (!this.analysisResults.has(instrumentKey)) {
            this.analysisResults.set(instrumentKey, []);
        }
        this.analysisResults.get(instrumentKey).push({
            entrySignalId,
            decision,
            outcome,
            analysis,
            timestamp: new Date()
        });
    }

    /**
     * Calculate decision quality based on confidence vs outcome alignment
     */
    calculateDecisionQuality(decision, outcome) {
        const pnl = outcome.pnl;
        const confidence = decision.confidence;
        
        // Classify outcome
        let outcomeClass;
        if (pnl >= this.qualityThresholds.outcome.GOOD_WIN) outcomeClass = 'GOOD_WIN';
        else if (pnl >= this.qualityThresholds.outcome.SMALL_WIN) outcomeClass = 'SMALL_WIN';
        else if (pnl >= this.qualityThresholds.outcome.BREAK_EVEN) outcomeClass = 'BREAK_EVEN';
        else if (pnl >= this.qualityThresholds.outcome.BAD_LOSS) outcomeClass = 'SMALL_LOSS';
        else outcomeClass = 'BAD_LOSS';
        
        // Classify confidence
        let confidenceClass;
        if (confidence >= this.qualityThresholds.confidence.HIGH) confidenceClass = 'HIGH';
        else if (confidence >= this.qualityThresholds.confidence.MEDIUM) confidenceClass = 'MEDIUM';
        else confidenceClass = 'LOW';
        
        // Determine decision quality
        let quality = 'NEUTRAL';
        let severity = 0; // 0-10 scale for how concerning this mismatch is
        
        if (confidenceClass === 'HIGH' && (outcomeClass === 'SMALL_LOSS' || outcomeClass === 'BAD_LOSS')) {
            quality = 'OVERCONFIDENT_LOSS';
            severity = outcomeClass === 'BAD_LOSS' ? 10 : 7;
        } else if (confidenceClass === 'LOW' && (outcomeClass === 'GOOD_WIN' || outcomeClass === 'SMALL_WIN')) {
            quality = 'UNDERCONFIDENT_WIN';
            severity = outcomeClass === 'GOOD_WIN' ? 6 : 3;
        } else if ((confidenceClass === 'HIGH' && outcomeClass === 'GOOD_WIN') || 
                   (confidenceClass === 'MEDIUM' && outcomeClass === 'SMALL_WIN') ||
                   (confidenceClass === 'LOW' && outcomeClass === 'BREAK_EVEN')) {
            quality = 'GOOD_DECISION';
            severity = 0;
        }
        
        return {
            quality,
            severity,
            outcomeClass,
            confidenceClass,
            calibrationError: this.calculateCalibrationError(confidence, pnl),
            riskRewardRatio: outcome.maxProfit / Math.abs(outcome.maxLoss || 10)
        };
    }

    /**
     * Calculate how far off our confidence was from actual probability
     */
    calculateCalibrationError(confidence, pnl) {
        // Convert PnL to win probability (simplified)
        const actualWinProbability = pnl > 0 ? 1.0 : 0.0;
        return Math.abs(confidence - actualWinProbability);
    }

    /**
     * Periodic analysis to identify systemic issues
     * ASYNC - runs independently without blocking decisions
     */
    async performPeriodicAnalysis() {
        const now = new Date();
        const timeSinceLastAnalysis = now - this.lastAnalysis;
        
        if (timeSinceLastAnalysis < this.analysisIntervalMinutes * 60 * 1000) {
            return; // Too soon
        }
        
        console.log(`[DECISION-MONITOR] 🔍 Running periodic analysis...`);
        
        for (const [instrumentKey, analyses] of this.analysisResults.entries()) {
            if (analyses.length < 5) continue; // Need minimum data
            
            const recent = analyses.slice(-20); // Last 20 decisions
            const patterns = this.identifyDecisionPatterns(recent);
            
            if (patterns.criticalIssues.length > 0) {
                console.log(`🚨 [DECISION-MONITOR] CRITICAL ISSUES for ${instrumentKey}:`);
                patterns.criticalIssues.forEach(issue => {
                    console.log(`   ⚠️  ${issue}`);
                });
            }
            
            if (patterns.recommendations.length > 0) {
                console.log(`💡 [DECISION-MONITOR] RECOMMENDATIONS for ${instrumentKey}:`);
                patterns.recommendations.forEach(rec => {
                    console.log(`   🎯 ${rec}`);
                });
            }
        }
        
        this.lastAnalysis = now;
    }

    /**
     * Identify systematic decision patterns and issues
     */
    identifyDecisionPatterns(analyses) {
        const criticalIssues = [];
        const recommendations = [];
        
        // Count decision quality types
        const qualityCounts = {};
        let totalCalibrationError = 0;
        let recoveryModeDecisions = 0;
        let recoveryModeSuccesses = 0;
        
        analyses.forEach(a => {
            const quality = a.analysis.quality;
            qualityCounts[quality] = (qualityCounts[quality] || 0) + 1;
            totalCalibrationError += a.analysis.calibrationError;
            
            if (a.decision.recoveryMode) {
                recoveryModeDecisions++;
                if (a.outcome.pnl > 0) recoveryModeSuccesses++;
            }
        });
        
        // Check for overconfidence pattern
        const overconfidentLosses = qualityCounts['OVERCONFIDENT_LOSS'] || 0;
        if (overconfidentLosses >= 5) {
            criticalIssues.push(`${overconfidentLosses} overconfident losses - confidence calibration is broken`);
            recommendations.push('Reduce base confidence by 20% for similar setups');
        }
        
        // Check for recovery mode effectiveness
        if (recoveryModeDecisions >= 3) {
            const recoverySuccessRate = (recoveryModeSuccesses / recoveryModeDecisions) * 100;
            if (recoverySuccessRate < 30) {
                criticalIssues.push(`Recovery mode only ${recoverySuccessRate.toFixed(0)}% successful - strategy may be flawed`);
                recommendations.push('Consider more aggressive recovery: halt trading or reset zones immediately');
            }
        }
        
        // Check calibration accuracy
        const avgCalibrationError = totalCalibrationError / analyses.length;
        if (avgCalibrationError > 0.4) {
            criticalIssues.push(`High calibration error (${(avgCalibrationError * 100).toFixed(0)}%) - confidence scores unreliable`);
            recommendations.push('Recalibrate confidence scoring methodology');
        }
        
        return { criticalIssues, recommendations };
    }

    /**
     * Get current decision quality statistics
     */
    getDecisionStats(instrument = null, hours = 24) {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        let relevantAnalyses = [];
        
        for (const [key, analyses] of this.analysisResults.entries()) {
            if (instrument && !key.includes(instrument)) continue;
            
            const recentAnalyses = analyses.filter(a => a.timestamp > cutoffTime);
            relevantAnalyses.push(...recentAnalyses);
        }
        
        if (relevantAnalyses.length === 0) {
            return { error: 'No decision data available' };
        }
        
        // Calculate statistics
        const stats = {
            totalDecisions: relevantAnalyses.length,
            qualityBreakdown: {},
            averageConfidence: 0,
            averagePnL: 0,
            calibrationError: 0,
            recoveryModeStats: {
                total: 0,
                successful: 0,
                successRate: 0
            }
        };
        
        let totalConfidence = 0;
        let totalPnL = 0;
        let totalCalibrationError = 0;
        
        relevantAnalyses.forEach(a => {
            const quality = a.analysis.quality;
            stats.qualityBreakdown[quality] = (stats.qualityBreakdown[quality] || 0) + 1;
            
            totalConfidence += a.decision.confidence;
            totalPnL += a.outcome.pnl;
            totalCalibrationError += a.analysis.calibrationError;
            
            if (a.decision.recoveryMode) {
                stats.recoveryModeStats.total++;
                if (a.outcome.pnl > 0) stats.recoveryModeStats.successful++;
            }
        });
        
        stats.averageConfidence = totalConfidence / relevantAnalyses.length;
        stats.averagePnL = totalPnL / relevantAnalyses.length;
        stats.calibrationError = totalCalibrationError / relevantAnalyses.length;
        
        if (stats.recoveryModeStats.total > 0) {
            stats.recoveryModeStats.successRate = 
                (stats.recoveryModeStats.successful / stats.recoveryModeStats.total) * 100;
        }
        
        return stats;
    }

    /**
     * Start the monitoring service (non-blocking periodic analysis)
     */
    startMonitoring() {
        // Run periodic analysis every 15 minutes
        setInterval(() => {
            this.performPeriodicAnalysis().catch(error => {
                console.log(`[DECISION-MONITOR] Analysis error: ${error.message}`);
            });
        }, 15 * 60 * 1000);
        
        console.log('[DECISION-MONITOR] 🚀 Monitoring started - analyzing decisions every 15 minutes');
    }
}

module.exports = DecisionAnalysisMonitor;