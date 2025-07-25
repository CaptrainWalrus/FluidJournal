/**
 * A/B Testing Framework for GP vs Range Comparison
 * Allows parallel evaluation of both systems for performance comparison
 */

const fs = require('fs').promises;
const path = require('path');

class ABTestingFramework {
  constructor() {
    this.testName = 'three_way_comparison';
    this.testStartTime = new Date();
    this.testConfig = {
      gp_traffic_percentage: 33, // 33% traffic to GP
      pruned_ranges_traffic_percentage: 33, // 33% traffic to Pruned Ranges
      graduated_ranges_traffic_percentage: 34, // 34% traffic to Graduated Ranges (default)
      min_samples_per_variant: 100,
      confidence_level: 0.95,
      test_duration_days: 30
    };
    
    this.results = {
      gp: {
        total_requests: 0,
        approved: 0,
        rejected: 0,
        avg_confidence: 0,
        total_confidence: 0,
        predictions: [],
        errors: 0
      },
      pruned_ranges: {
        total_requests: 0,
        approved: 0,
        rejected: 0,
        avg_confidence: 0,
        total_confidence: 0,
        predictions: [],
        errors: 0
      },
      graduated_ranges: {
        total_requests: 0,
        approved: 0,
        rejected: 0,
        avg_confidence: 0,
        total_confidence: 0,
        predictions: [],
        errors: 0
      },
      outcomes: [] // Store actual trade outcomes for all variants
    };
    
    this.logDir = './ab_test_logs';
    this.initializeLogging();
  }

  async initializeLogging() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      console.log(`[AB-TEST] Logging initialized in ${this.logDir}`);
    } catch (error) {
      console.error('[AB-TEST] Failed to initialize logging:', error);
    }
  }

  /**
   * Determine which variant to use for this request
   */
  assignVariant(entrySignalId) {
    // Use consistent hashing based on signal ID for reproducible assignment
    const hash = this.hashString(entrySignalId);
    const percentage = hash % 100;
    
    let variant;
    if (percentage < this.testConfig.gp_traffic_percentage) {
      variant = 'gp';
    } else if (percentage < this.testConfig.gp_traffic_percentage + this.testConfig.pruned_ranges_traffic_percentage) {
      variant = 'pruned_ranges';
    } else {
      variant = 'graduated_ranges';
    }
    
    console.log(`[AB-TEST] Signal ${entrySignalId} assigned to variant: ${variant.toUpperCase()}`);
    return variant;
  }

  /**
   * Simple hash function for consistent variant assignment
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Record prediction result for either variant
   */
  recordPrediction(variant, entrySignalId, prediction, riskData) {
    if (!this.results[variant]) {
      console.error(`[AB-TEST] Invalid variant: ${variant}`);
      return;
    }

    const variantData = this.results[variant];
    variantData.total_requests++;
    
    if (prediction.approved) {
      variantData.approved++;
    } else {
      variantData.rejected++;
    }
    
    variantData.total_confidence += prediction.confidence || 0.5;
    variantData.avg_confidence = variantData.total_confidence / variantData.total_requests;
    
    if (prediction.error) {
      variantData.errors++;
    }
    
    // Store detailed prediction data
    const predictionRecord = {
      timestamp: new Date().toISOString(),
      entrySignalId,
      variant,
      approved: prediction.approved,
      confidence: prediction.confidence,
      suggested_sl: prediction.suggested_sl,
      suggested_tp: prediction.suggested_tp,
      method: prediction.method,
      reasons: prediction.reasons,
      error: prediction.error || null,
      riskData: {
        instrument: riskData.instrument,
        direction: riskData.direction,
        feature_count: Object.keys(riskData.features || {}).length
      }
    };
    
    variantData.predictions.push(predictionRecord);
    
    // Log to file
    this.logPrediction(predictionRecord);
    
    console.log(`[AB-TEST] ${variant.toUpperCase()} prediction recorded: ${prediction.approved ? 'APPROVED' : 'REJECTED'} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
  }

  /**
   * Record actual trade outcome for A/B comparison
   */
  recordOutcome(entrySignalId, actualPnl, actualTrajectory = null, exitReason = null) {
    // Find the prediction record
    let predictionRecord = null;
    let variant = null;
    
    for (const [variantName, variantData] of Object.entries(this.results)) {
      if (variantName === 'outcomes') continue;
      
      const found = variantData.predictions.find(p => p.entrySignalId === entrySignalId);
      if (found) {
        predictionRecord = found;
        variant = variantName;
        break;
      }
    }
    
    if (!predictionRecord) {
      console.warn(`[AB-TEST] No prediction record found for ${entrySignalId}`);
      return;
    }
    
    const outcomeRecord = {
      timestamp: new Date().toISOString(),
      entrySignalId,
      variant,
      predicted_approved: predictionRecord.approved,
      predicted_confidence: predictionRecord.confidence,
      actual_pnl: actualPnl,
      actual_trajectory: actualTrajectory,
      exit_reason: exitReason,
      was_profitable: actualPnl > 0,
      prediction_correct: (predictionRecord.approved && actualPnl > 0) || 
                         (!predictionRecord.approved && actualPnl <= 0)
    };
    
    this.results.outcomes.push(outcomeRecord);
    
    // Log outcome
    this.logOutcome(outcomeRecord);
    
    console.log(`[AB-TEST] Outcome recorded for ${entrySignalId} (${variant.toUpperCase()}): PnL=$${actualPnl.toFixed(2)}, Prediction ${outcomeRecord.prediction_correct ? 'CORRECT' : 'INCORRECT'}`);
  }

  /**
   * Calculate A/B test statistics
   */
  calculateStatistics() {
    const stats = {
      test_duration_hours: (Date.now() - this.testStartTime.getTime()) / (1000 * 60 * 60),
      total_predictions: this.results.gp.total_requests + this.results.range.total_requests,
      total_outcomes: this.results.outcomes.length,
      
      gp_stats: this.calculateVariantStats('gp'),
      range_stats: this.calculateVariantStats('range'),
      
      comparison: this.calculateComparison(),
      
      statistical_significance: this.calculateSignificance()
    };
    
    return stats;
  }

  calculateVariantStats(variant) {
    const data = this.results[variant];
    const outcomes = this.results.outcomes.filter(o => o.variant === variant);
    
    const stats = {
      total_requests: data.total_requests,
      approval_rate: data.total_requests > 0 ? data.approved / data.total_requests : 0,
      avg_confidence: data.avg_confidence,
      error_rate: data.total_requests > 0 ? data.errors / data.total_requests : 0,
      
      // Outcome-based metrics
      total_outcomes: outcomes.length,
      profitable_trades: outcomes.filter(o => o.was_profitable).length,
      win_rate: outcomes.length > 0 ? outcomes.filter(o => o.was_profitable).length / outcomes.length : 0,
      avg_pnl: outcomes.length > 0 ? outcomes.reduce((sum, o) => sum + o.actual_pnl, 0) / outcomes.length : 0,
      total_pnl: outcomes.reduce((sum, o) => sum + o.actual_pnl, 0),
      prediction_accuracy: outcomes.length > 0 ? outcomes.filter(o => o.prediction_correct).length / outcomes.length : 0,
      
      // Risk-adjusted metrics
      profit_factor: this.calculateProfitFactor(outcomes),
      max_drawdown: this.calculateMaxDrawdown(outcomes),
      sharpe_ratio: this.calculateSharpeRatio(outcomes)
    };
    
    return stats;
  }

  calculateComparison() {
    const gp = this.calculateVariantStats('gp');
    const range = this.calculateVariantStats('range');
    
    if (gp.total_outcomes === 0 || range.total_outcomes === 0) {
      return { insufficient_data: true };
    }
    
    return {
      win_rate_difference: gp.win_rate - range.win_rate,
      avg_pnl_difference: gp.avg_pnl - range.avg_pnl,
      total_pnl_difference: gp.total_pnl - range.total_pnl,
      accuracy_difference: gp.prediction_accuracy - range.prediction_accuracy,
      profit_factor_difference: gp.profit_factor - range.profit_factor,
      
      better_variant: {
        win_rate: gp.win_rate > range.win_rate ? 'gp' : 'range',
        avg_pnl: gp.avg_pnl > range.avg_pnl ? 'gp' : 'range',
        accuracy: gp.prediction_accuracy > range.prediction_accuracy ? 'gp' : 'range',
        profit_factor: gp.profit_factor > range.profit_factor ? 'gp' : 'range'
      }
    };
  }

  calculateSignificance() {
    const gpOutcomes = this.results.outcomes.filter(o => o.variant === 'gp');
    const rangeOutcomes = this.results.outcomes.filter(o => o.variant === 'range');
    
    if (gpOutcomes.length < 30 || rangeOutcomes.length < 30) {
      return { insufficient_data: true, min_samples_needed: 30 };
    }
    
    // T-test for PnL differences
    const gpPnls = gpOutcomes.map(o => o.actual_pnl);
    const rangePnls = rangeOutcomes.map(o => o.actual_pnl);
    
    const tTestResult = this.performTTest(gpPnls, rangePnls);
    
    // Chi-square test for win rate differences
    const gpWins = gpOutcomes.filter(o => o.was_profitable).length;
    const rangeWins = rangeOutcomes.filter(o => o.was_profitable).length;
    
    const chiSquareResult = this.performChiSquareTest(
      gpWins, gpOutcomes.length - gpWins,
      rangeWins, rangeOutcomes.length - rangeWins
    );
    
    return {
      pnl_ttest: tTestResult,
      win_rate_chisquare: chiSquareResult,
      overall_significant: tTestResult.p_value < 0.05 || chiSquareResult.p_value < 0.05
    };
  }

  // Helper statistical functions
  calculateProfitFactor(outcomes) {
    const profits = outcomes.filter(o => o.actual_pnl > 0).reduce((sum, o) => sum + o.actual_pnl, 0);
    const losses = Math.abs(outcomes.filter(o => o.actual_pnl < 0).reduce((sum, o) => sum + o.actual_pnl, 0));
    return losses > 0 ? profits / losses : profits > 0 ? 999 : 0;
  }

  calculateMaxDrawdown(outcomes) {
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    
    outcomes.forEach(o => {
      runningPnl += o.actual_pnl;
      if (runningPnl > peak) peak = runningPnl;
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    
    return maxDrawdown;
  }

  calculateSharpeRatio(outcomes) {
    if (outcomes.length < 2) return 0;
    
    const returns = outcomes.map(o => o.actual_pnl);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  performTTest(sample1, sample2) {
    // Simplified t-test implementation
    const n1 = sample1.length;
    const n2 = sample2.length;
    
    const mean1 = sample1.reduce((sum, x) => sum + x, 0) / n1;
    const mean2 = sample2.reduce((sum, x) => sum + x, 0) / n2;
    
    const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
    const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);
    
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const standardError = Math.sqrt(pooledVar * (1/n1 + 1/n2));
    
    const tStat = (mean1 - mean2) / standardError;
    
    return {
      t_statistic: tStat,
      p_value: this.approximatePValue(Math.abs(tStat), n1 + n2 - 2),
      mean_difference: mean1 - mean2,
      significant: Math.abs(tStat) > 1.96 // Approximate 95% confidence
    };
  }

  performChiSquareTest(a, b, c, d) {
    // Chi-square test for 2x2 contingency table
    const n = a + b + c + d;
    const expected = [
      (a + b) * (a + c) / n,
      (a + b) * (b + d) / n,
      (c + d) * (a + c) / n,
      (c + d) * (b + d) / n
    ];
    
    const observed = [a, b, c, d];
    
    const chiSquare = observed.reduce((sum, obs, i) => {
      return sum + Math.pow(obs - expected[i], 2) / expected[i];
    }, 0);
    
    return {
      chi_square_statistic: chiSquare,
      p_value: this.approximatePValue(chiSquare, 1),
      significant: chiSquare > 3.84 // 95% confidence for 1 degree of freedom
    };
  }

  approximatePValue(statistic, degreesOfFreedom) {
    // Very rough approximation - in production, use proper statistical library
    if (statistic > 2.58) return 0.01;
    if (statistic > 1.96) return 0.05;
    if (statistic > 1.65) return 0.10;
    return 0.20;
  }

  // Logging functions
  async logPrediction(predictionRecord) {
    try {
      const logFile = path.join(this.logDir, `predictions_${this.testName}.jsonl`);
      await fs.appendFile(logFile, JSON.stringify(predictionRecord) + '\n');
    } catch (error) {
      console.error('[AB-TEST] Failed to log prediction:', error);
    }
  }

  async logOutcome(outcomeRecord) {
    try {
      const logFile = path.join(this.logDir, `outcomes_${this.testName}.jsonl`);
      await fs.appendFile(logFile, JSON.stringify(outcomeRecord) + '\n');
    } catch (error) {
      console.error('[AB-TEST] Failed to log outcome:', error);
    }
  }

  async saveResults() {
    try {
      const stats = this.calculateStatistics();
      const resultsFile = path.join(this.logDir, `ab_test_results_${Date.now()}.json`);
      await fs.writeFile(resultsFile, JSON.stringify(stats, null, 2));
      console.log(`[AB-TEST] Results saved to ${resultsFile}`);
      return stats;
    } catch (error) {
      console.error('[AB-TEST] Failed to save results:', error);
      return null;
    }
  }

  /**
   * Generate A/B test report
   */
  generateReport() {
    const stats = this.calculateStatistics();
    
    const report = `
# A/B Test Report: GP vs Range
**Test Period**: ${this.testStartTime.toISOString()} - ${new Date().toISOString()}
**Duration**: ${stats.test_duration_hours.toFixed(1)} hours

## Summary
- **Total Predictions**: ${stats.total_predictions}
- **Total Outcomes**: ${stats.total_outcomes}
- **GP Traffic**: ${this.testConfig.gp_traffic_percentage}%

## GP Performance
- **Approval Rate**: ${(stats.gp_stats.approval_rate * 100).toFixed(1)}%
- **Win Rate**: ${(stats.gp_stats.win_rate * 100).toFixed(1)}%
- **Average PnL**: $${stats.gp_stats.avg_pnl.toFixed(2)}
- **Total PnL**: $${stats.gp_stats.total_pnl.toFixed(2)}
- **Prediction Accuracy**: ${(stats.gp_stats.prediction_accuracy * 100).toFixed(1)}%

## Range Performance
- **Approval Rate**: ${(stats.range_stats.approval_rate * 100).toFixed(1)}%
- **Win Rate**: ${(stats.range_stats.win_rate * 100).toFixed(1)}%
- **Average PnL**: $${stats.range_stats.avg_pnl.toFixed(2)}
- **Total PnL**: $${stats.range_stats.total_pnl.toFixed(2)}
- **Prediction Accuracy**: ${(stats.range_stats.prediction_accuracy * 100).toFixed(1)}%

## Comparison
${stats.comparison.insufficient_data ? '**Insufficient data for comparison**' : `
- **Win Rate Difference**: ${(stats.comparison.win_rate_difference * 100).toFixed(1)}% (${stats.comparison.better_variant.win_rate} better)
- **Avg PnL Difference**: $${stats.comparison.avg_pnl_difference.toFixed(2)} (${stats.comparison.better_variant.avg_pnl} better)
- **Total PnL Difference**: $${stats.comparison.total_pnl_difference.toFixed(2)}
- **Accuracy Difference**: ${(stats.comparison.accuracy_difference * 100).toFixed(1)}% (${stats.comparison.better_variant.accuracy} better)
`}

## Statistical Significance
${stats.statistical_significance.insufficient_data ? '**Insufficient data for significance testing**' : `
- **Overall Significant**: ${stats.statistical_significance.overall_significant ? 'YES' : 'NO'}
- **PnL Difference**: p-value = ${stats.statistical_significance.pnl_ttest.p_value.toFixed(3)}
- **Win Rate Difference**: p-value = ${stats.statistical_significance.win_rate_chisquare.p_value.toFixed(3)}
`}
    `;
    
    return report;
  }
}

module.exports = ABTestingFramework;