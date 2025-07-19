/**
 * Trade Autopsy Service
 * Performs immediate post-trade analysis to understand what went wrong/right
 */

class TradeAutopsy {
    constructor(storageClient) {
        this.storageClient = storageClient;
    }

    /**
     * Perform comprehensive analysis on a completed trade
     */
    async performAutopsy(tradeData) {
        const analysis = {
            tradeId: tradeData.entrySignalId,
            instrument: tradeData.instrument,
            direction: tradeData.direction,
            entryTime: tradeData.entryTime,
            exitTime: tradeData.exitTime,
            pnl: tradeData.pnl,
            exitReason: tradeData.exitReason,
            
            // Analysis results
            exitReasonAnalysis: this.analyzeExitReason(tradeData),
            featureDriftAnalysis: await this.analyzeFeatureDrift(tradeData),
            profitAnalysis: this.analyzeProfit(tradeData),
            riskAnalysis: this.analyzeRiskParameters(tradeData),
            marketRegimeAnalysis: await this.analyzeMarketRegime(tradeData),
            similarTradesAnalysis: await this.analyzeSimilarTrades(tradeData),
            recommendations: []
        };

        // Generate specific recommendations based on analysis
        analysis.recommendations = this.generateRecommendations(analysis);
        
        console.log(`[TRADE-AUTOPSY] Analysis complete for ${analysis.tradeId}:`);
        console.log(`[TRADE-AUTOPSY] Exit: ${analysis.exitReason} | PnL: $${analysis.pnl}`);
        console.log(`[TRADE-AUTOPSY] Key Finding: ${analysis.recommendations[0]?.summary || 'No specific issues detected'}`);
        
        return analysis;
    }

    /**
     * Analyze why the trade exited the way it did
     */
    analyzeExitReason(tradeData) {
        const analysis = {
            reason: tradeData.exitReason,
            wasPlanned: false,
            severity: 'normal',
            explanation: '',
            suggestions: []
        };

        switch (tradeData.exitReason?.toUpperCase()) {
            case 'STOP_LOSS':
            case 'SL':
                analysis.wasPlanned = true;
                analysis.severity = tradeData.pnl < -50 ? 'severe' : 'normal';
                analysis.explanation = `Stop loss triggered. Loss: $${Math.abs(tradeData.pnl)}`;
                
                if (tradeData.maxProfit > Math.abs(tradeData.pnl) * 0.5) {
                    analysis.suggestions.push('Trade showed profit potential - consider wider stops or better entry timing');
                }
                if (tradeData.pnl < -75) {
                    analysis.suggestions.push('Large loss detected - review position sizing and volatility assessment');
                }
                break;

            case 'TAKE_PROFIT':
            case 'TP':
                analysis.wasPlanned = true;
                analysis.severity = 'good';
                analysis.explanation = `Take profit hit successfully. Profit: $${tradeData.pnl}`;
                
                if (tradeData.maxProfit > tradeData.pnl * 1.5) {
                    analysis.suggestions.push('Left significant profit on table - consider scaling out or trailing stops');
                }
                break;

            case 'MANUAL':
                analysis.wasPlanned = false;
                analysis.severity = tradeData.pnl < 0 ? 'concerning' : 'normal';
                analysis.explanation = `Manual exit. Reason unclear from data.`;
                analysis.suggestions.push('Document manual exit reasons for better analysis');
                break;

            default:
                analysis.explanation = `Unknown exit reason: ${tradeData.exitReason}`;
                analysis.suggestions.push('Improve exit reason tracking');
        }

        return analysis;
    }

    /**
     * Analyze how features changed during the trade
     */
    async analyzeFeatureDrift(tradeData) {
        // This would require storing feature snapshots during trade
        // For now, return placeholder analysis
        return {
            hasDrift: false,
            significantChanges: [],
            regimeShift: false,
            explanation: 'Feature drift analysis requires enhanced data collection (Phase 2)'
        };
    }

    /**
     * Analyze profit/loss patterns
     */
    analyzeProfit(tradeData) {
        const analysis = {
            finalPnl: tradeData.pnl,
            maxProfit: tradeData.maxProfit || 0,
            maxLoss: tradeData.maxLoss || 0,
            profitEfficiency: 0,
            leftOnTable: 0,
            riskedUnnecessarily: 0
        };

        if (analysis.maxProfit > 0) {
            analysis.leftOnTable = Math.max(0, analysis.maxProfit - analysis.finalPnl);
            analysis.profitEfficiency = analysis.finalPnl / analysis.maxProfit;
        }

        if (analysis.maxLoss < 0) {
            analysis.riskedUnnecessarily = Math.max(0, Math.abs(analysis.maxLoss) - Math.abs(analysis.finalPnl));
        }

        // Generate insights
        if (analysis.leftOnTable > 20) {
            analysis.insight = `Left $${analysis.leftOnTable.toFixed(0)} profit on table - consider trailing stops`;
        } else if (analysis.riskedUnnecessarily > 15) {
            analysis.insight = `Risked $${analysis.riskedUnnecessarily.toFixed(0)} more than final loss - early exit might have been better`;
        } else if (analysis.profitEfficiency > 0.8) {
            analysis.insight = `Good profit capture efficiency (${(analysis.profitEfficiency * 100).toFixed(0)}%)`;
        } else {
            analysis.insight = `Standard profit/loss profile`;
        }

        return analysis;
    }

    /**
     * Analyze if risk parameters were appropriate
     */
    analyzeRiskParameters(tradeData) {
        const analysis = {
            stopLossAppropriate: true,
            takeProfitAppropriate: true,
            riskRewardRatio: 0,
            suggestions: []
        };

        const riskAmount = Math.abs(tradeData.stopLoss || 10) * 10; // Convert points to dollars
        const rewardAmount = Math.abs(tradeData.takeProfit || 15) * 10;
        analysis.riskRewardRatio = rewardAmount / riskAmount;

        // Analyze stop loss
        if (tradeData.exitReason === 'STOP_LOSS' && tradeData.maxProfit > riskAmount * 0.5) {
            analysis.stopLossAppropriate = false;
            analysis.suggestions.push(`Stop too tight - trade showed $${tradeData.maxProfit.toFixed(0)} profit potential`);
        }

        // Analyze take profit
        if (tradeData.exitReason === 'TAKE_PROFIT' && tradeData.maxProfit > rewardAmount * 1.5) {
            analysis.takeProfitAppropriate = false;
            analysis.suggestions.push(`Take profit too conservative - max profit was $${tradeData.maxProfit.toFixed(0)}`);
        }

        // Risk/reward ratio
        if (analysis.riskRewardRatio < 1.5) {
            analysis.suggestions.push(`Poor risk/reward ratio (${analysis.riskRewardRatio.toFixed(1)}:1) - aim for 2:1 or better`);
        }

        return analysis;
    }

    /**
     * Analyze market regime during trade
     */
    async analyzeMarketRegime(tradeData) {
        // Placeholder - would require market regime detection service
        return {
            regimeAtEntry: 'unknown',
            regimeAtExit: 'unknown',
            regimeChanged: false,
            explanation: 'Market regime analysis requires dedicated regime detection service'
        };
    }

    /**
     * Compare with similar historical trades
     */
    async analyzeSimilarTrades(tradeData) {
        try {
            // Get similar trades from storage
            const similarTrades = await this.storageClient.querySimilar(tradeData.entryFeatures, {
                instrument: tradeData.instrument,
                direction: tradeData.direction,
                limit: 20,
                similarity_threshold: 0.15
            });

            if (similarTrades.length === 0) {
                return { hasComparisons: false, explanation: 'No similar trades found for comparison' };
            }

            // Analyze similar trades
            const successful = similarTrades.filter(t => t.wasGoodExit && t.pnl > 5);
            const failed = similarTrades.filter(t => !t.wasGoodExit && t.pnl < -10);

            const analysis = {
                hasComparisons: true,
                totalSimilar: similarTrades.length,
                successfulCount: successful.length,
                failedCount: failed.length,
                avgSuccessProfit: successful.length > 0 ? successful.reduce((sum, t) => sum + t.pnl, 0) / successful.length : 0,
                avgFailureLoss: failed.length > 0 ? failed.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / failed.length : 0,
                insights: []
            };

            // Generate insights
            if (tradeData.pnl < 0 && successful.length > failed.length) {
                analysis.insights.push(`Most similar trades (${successful.length}/${similarTrades.length}) were profitable - this loss may be due to timing or execution`);
            } else if (tradeData.pnl > 0 && failed.length > successful.length) {
                analysis.insights.push(`Got lucky - most similar trades (${failed.length}/${similarTrades.length}) lost money`);
            } else {
                analysis.insights.push(`Trade performed as expected based on similar historical patterns`);
            }

            return analysis;

        } catch (error) {
            console.error('[TRADE-AUTOPSY] Error analyzing similar trades:', error.message);
            return { hasComparisons: false, error: error.message };
        }
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        // Primary recommendation based on exit reason
        if (analysis.exitReasonAnalysis.severity === 'severe') {
            recommendations.push({
                type: 'critical',
                summary: 'Large loss detected - review risk management',
                details: analysis.exitReasonAnalysis.explanation,
                actions: analysis.exitReasonAnalysis.suggestions
            });
        }

        // Profit efficiency recommendation
        if (analysis.profitAnalysis.leftOnTable > 25) {
            recommendations.push({
                type: 'improvement',
                summary: 'Significant profit left on table',
                details: analysis.profitAnalysis.insight,
                actions: ['Consider implementing trailing stops', 'Review take profit levels']
            });
        }

        // Risk parameter recommendation
        if (analysis.riskAnalysis.suggestions.length > 0) {
            recommendations.push({
                type: 'risk_management',
                summary: 'Risk parameter optimization needed',
                details: analysis.riskAnalysis.suggestions.join('; '),
                actions: ['Adjust stop loss levels', 'Improve risk/reward ratios']
            });
        }

        // Similar trades recommendation
        if (analysis.similarTradesAnalysis.hasComparisons && analysis.similarTradesAnalysis.insights.length > 0) {
            recommendations.push({
                type: 'pattern_analysis',
                summary: 'Historical pattern insights available',
                details: analysis.similarTradesAnalysis.insights[0],
                actions: ['Review entry criteria', 'Consider pattern-specific adjustments']
            });
        }

        // Fallback if no specific issues
        if (recommendations.length === 0) {
            recommendations.push({
                type: 'normal',
                summary: 'Trade performed within normal parameters',
                details: 'No critical issues detected',
                actions: ['Continue monitoring', 'Collect more data for analysis']
            });
        }

        return recommendations;
    }

    /**
     * Generate a human-readable summary
     */
    generateSummary(analysis) {
        const summary = {
            tradeId: analysis.tradeId,
            outcome: analysis.pnl > 0 ? 'PROFIT' : 'LOSS',
            amount: `$${Math.abs(analysis.pnl)}`,
            primaryIssue: analysis.recommendations[0]?.summary || 'No issues',
            keyInsight: analysis.profitAnalysis.insight,
            actionItems: analysis.recommendations.flatMap(r => r.actions).slice(0, 3)
        };

        return summary;
    }
}

module.exports = TradeAutopsy;