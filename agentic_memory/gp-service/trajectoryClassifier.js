/**
 * Trajectory Pattern Classifier
 * Converts bar-by-bar profit sequences into categorical features for GP training
 */

class TrajectoryClassifier {
  constructor() {
    this.patterns = {
      'v_recovery': 0,
      'steady_climb': 1,
      'failed_breakout': 2,
      'whipsaw': 3,
      'grinder': 4,
      'immediate_winner': 5,
      'immediate_loser': 6,
      'flat_then_move': 8
    };
  }

  /**
   * Main classification function - converts profit sequence to pattern features
   */
  classifyTrajectory(profitByBar, finalPnL = null) {
    if (!profitByBar || profitByBar.length === 0) {
      return this.getDefaultFeatures();
    }

    // Clean and validate the trajectory
    const trajectory = this.cleanTrajectory(profitByBar);
    
    if (trajectory.length < 3) {
      return this.getDefaultFeatures();
    }

    // Calculate trajectory metrics
    const metrics = this.calculateTrajectoryMetrics(trajectory, finalPnL);
    
    // Classify primary pattern
    const primaryPattern = this.detectPrimaryPattern(trajectory, metrics);
    
    // Convert to feature vector for GP
    const features = this.convertToFeatures(primaryPattern, metrics);
    
    console.log(`[TRAJECTORY-CLASSIFIER] Pattern: ${primaryPattern}, Metrics:`, {
      maxDrawdown: metrics.maxDrawdown.toFixed(2),
      recoverySpeed: metrics.recoverySpeed.toFixed(2),
      volatility: metrics.volatility.toFixed(2),
      trend: metrics.trendStrength.toFixed(2)
    });
    
    return features;
  }

  /**
   * Clean trajectory data and handle edge cases
   */
  cleanTrajectory(profitByBar) {
    let trajectory = [];
    
    // Handle different input formats
    if (Array.isArray(profitByBar)) {
      trajectory = profitByBar.filter(val => typeof val === 'number' && !isNaN(val));
    } else if (typeof profitByBar === 'object') {
      // Handle Dictionary<int,double> from NinjaTrader
      const keys = Object.keys(profitByBar).map(k => parseInt(k)).filter(k => !isNaN(k)).sort();
      trajectory = keys.map(k => profitByBar[k.toString()]).filter(val => typeof val === 'number' && !isNaN(val));
    }
    
    // Remove trailing zeros (bars after trade closed)
    while (trajectory.length > 1 && trajectory[trajectory.length - 1] === trajectory[trajectory.length - 2]) {
      trajectory.pop();
    }
    
    return trajectory;
  }

  /**
   * Calculate key trajectory metrics
   */
  calculateTrajectoryMetrics(trajectory, finalPnL = null) {
    const maxProfit = Math.max(...trajectory);
    const maxLoss = Math.min(...trajectory);
    const finalValue = finalPnL !== null ? finalPnL : trajectory[trajectory.length - 1];
    
    // Calculate metrics
    const maxDrawdown = Math.abs(maxLoss);
    const maxRunup = Math.abs(maxProfit);
    const recoverySpeed = this.calculateRecoverySpeed(trajectory);
    const volatility = this.calculateVolatility(trajectory);
    const trendStrength = this.calculateTrendStrength(trajectory);
    const reversalCount = this.countReversals(trajectory);
    const timeToMaxDrawdown = this.findTimeToMaxDrawdown(trajectory);
    const timeToMaxProfit = this.findTimeToMaxProfit(trajectory);
    
    return {
      maxDrawdown,
      maxRunup,
      finalValue,
      recoverySpeed,
      volatility,
      trendStrength,
      reversalCount,
      timeToMaxDrawdown,
      timeToMaxProfit,
      totalBars: trajectory.length,
      drawdownRatio: maxRunup > 0 ? maxDrawdown / maxRunup : 0,
      efficiencyRatio: trajectory.length > 1 ? Math.abs(finalValue) / this.calculateTotalMovement(trajectory) : 0
    };
  }

  /**
   * Detect primary trajectory pattern
   */
  detectPrimaryPattern(trajectory, metrics) {
    const { maxDrawdown, maxRunup, finalValue, recoverySpeed, volatility, reversalCount, timeToMaxDrawdown, totalBars } = metrics;
    
    // Immediate patterns (quick resolution)
    if (totalBars <= 3) {
      return finalValue > 0 ? 'immediate_winner' : 'immediate_loser';
    }
    
    // V-Recovery: Deep drawdown followed by recovery
    if (maxDrawdown > 10 && finalValue > 0 && timeToMaxDrawdown < totalBars * 0.6 && recoverySpeed > 1.5) {
      return 'v_recovery';
    }
    
    // Failed Breakout: Early profit then reversal to loss
    if (maxRunup > 15 && finalValue < -5 && timeToMaxProfit < totalBars * 0.4) {
      return 'failed_breakout';
    }
    
    // Whipsaw: High volatility with multiple reversals
    if (reversalCount >= 4 && volatility > 8) {
      return 'whipsaw';
    }
    
    // Steady Climb: Consistent upward trend
    if (finalValue > 10 && metrics.trendStrength > 0.7 && volatility < 5 && reversalCount <= 2) {
      return 'steady_climb';
    }
    
    // Grinder: Small consistent movements
    if (Math.abs(finalValue) < 20 && volatility < 3 && maxDrawdown < 10 && maxRunup < 15) {
      return 'grinder';
    }
    
    // Flat then Move: Long period of little movement then sudden move
    const earlyMovement = Math.max(...trajectory.slice(0, Math.floor(totalBars / 2)));
    const lateMovement = Math.max(...trajectory.slice(Math.floor(totalBars / 2)));
    if (earlyMovement < 5 && lateMovement > 15) {
      return 'flat_then_move';
    }
    
    // Default classification based on outcome
    if (finalValue > 20) return 'immediate_winner';
    if (finalValue < -15) return 'immediate_loser';
    return 'grinder';
  }

  /**
   * Convert pattern and metrics to feature vector for GP
   */
  convertToFeatures(primaryPattern, metrics) {
    // One-hot encoding for primary pattern
    const patternFeatures = Object.keys(this.patterns).map(pattern => 
      pattern === primaryPattern ? 1 : 0
    );
    
    // Normalized numerical features
    const numericalFeatures = [
      this.normalize(metrics.maxDrawdown, 0, 100),      // 0-1 scale
      this.normalize(metrics.maxRunup, 0, 100),         // 0-1 scale  
      this.normalize(metrics.recoverySpeed, 0, 5),      // 0-1 scale
      this.normalize(metrics.volatility, 0, 20),        // 0-1 scale
      this.normalize(metrics.trendStrength, -1, 1),     // Already -1 to 1
      this.normalize(metrics.reversalCount, 0, 10),     // 0-1 scale
      this.normalize(metrics.drawdownRatio, 0, 3),      // 0-1 scale
      this.normalize(metrics.efficiencyRatio, 0, 1),    // Already 0-1
      this.normalize(metrics.timeToMaxDrawdown, 0, metrics.totalBars), // 0-1 scale
      this.normalize(metrics.timeToMaxProfit, 0, metrics.totalBars)    // 0-1 scale
    ];
    
    return {
      // Categorical features (one-hot encoded)
      pattern_features: patternFeatures,
      pattern_name: primaryPattern,
      
      // Numerical features (normalized)
      trajectory_features: numericalFeatures,
      
      // Feature names for GP training
      feature_names: [
        ...Object.keys(this.patterns).map(p => `pattern_${p}`),
        'traj_max_drawdown_norm',
        'traj_max_runup_norm', 
        'traj_recovery_speed_norm',
        'traj_volatility_norm',
        'traj_trend_strength_norm',
        'traj_reversal_count_norm',
        'traj_drawdown_ratio_norm',
        'traj_efficiency_ratio_norm',
        'traj_time_to_max_dd_norm',
        'traj_time_to_max_profit_norm'
      ],
      
      // Combined feature vector for GP
      combined_features: [...patternFeatures, ...numericalFeatures],
      
      // Raw metrics for analysis
      raw_metrics: metrics
    };
  }

  // Helper functions for metric calculations
  calculateRecoverySpeed(trajectory) {
    const minIndex = trajectory.indexOf(Math.min(...trajectory));
    const maxAfterMin = Math.max(...trajectory.slice(minIndex));
    const barsToRecover = trajectory.slice(minIndex).findIndex(val => val >= 0);
    return barsToRecover > 0 ? Math.abs(maxAfterMin - trajectory[minIndex]) / barsToRecover : 0;
  }

  calculateVolatility(trajectory) {
    if (trajectory.length < 2) return 0;
    const changes = trajectory.slice(1).map((val, i) => Math.abs(val - trajectory[i]));
    return changes.reduce((sum, change) => sum + change, 0) / changes.length;
  }

  calculateTrendStrength(trajectory) {
    if (trajectory.length < 2) return 0;
    const start = trajectory[0];
    const end = trajectory[trajectory.length - 1];
    const totalMovement = this.calculateTotalMovement(trajectory);
    return totalMovement > 0 ? (end - start) / totalMovement : 0;
  }

  countReversals(trajectory) {
    if (trajectory.length < 3) return 0;
    let reversals = 0;
    for (let i = 1; i < trajectory.length - 1; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      const next = trajectory[i + 1];
      
      // Peak or valley detection
      if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
        reversals++;
      }
    }
    return reversals;
  }

  findTimeToMaxDrawdown(trajectory) {
    const minValue = Math.min(...trajectory);
    return trajectory.indexOf(minValue);
  }

  findTimeToMaxProfit(trajectory) {
    const maxValue = Math.max(...trajectory);
    return trajectory.indexOf(maxValue);
  }

  calculateTotalMovement(trajectory) {
    if (trajectory.length < 2) return 0;
    return trajectory.slice(1).reduce((sum, val, i) => sum + Math.abs(val - trajectory[i]), 0);
  }

  normalize(value, min, max) {
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  getDefaultFeatures() {
    // Return default features when no trajectory data available
    const patternFeatures = Object.keys(this.patterns).map(() => 0);
    patternFeatures[this.patterns['grinder']] = 1; // Default to grinder pattern
    
    const numericalFeatures = new Array(10).fill(0.5); // Neutral values
    
    return {
      pattern_features: patternFeatures,
      pattern_name: 'grinder',
      trajectory_features: numericalFeatures,
      feature_names: [
        ...Object.keys(this.patterns).map(p => `pattern_${p}`),
        'traj_max_drawdown_norm',
        'traj_max_runup_norm',
        'traj_recovery_speed_norm', 
        'traj_volatility_norm',
        'traj_trend_strength_norm',
        'traj_reversal_count_norm',
        'traj_drawdown_ratio_norm',
        'traj_efficiency_ratio_norm',
        'traj_time_to_max_dd_norm',
        'traj_time_to_max_profit_norm'
      ],
      combined_features: [...patternFeatures, ...numericalFeatures],
      raw_metrics: {}
    };
  }

  /**
   * Classify multiple trajectories for pattern distribution analysis
   */
  analyzePatternDistribution(trajectories) {
    const distribution = {};
    Object.keys(this.patterns).forEach(pattern => distribution[pattern] = 0);
    
    trajectories.forEach(trajectory => {
      const result = this.classifyTrajectory(trajectory.profitByBar, trajectory.finalPnL);
      distribution[result.pattern_name]++;
    });
    
    const total = trajectories.length;
    const percentages = {};
    Object.keys(distribution).forEach(pattern => {
      percentages[pattern] = total > 0 ? (distribution[pattern] / total * 100).toFixed(1) + '%' : '0%';
    });
    
    return {
      counts: distribution,
      percentages,
      total,
      most_common: Object.keys(distribution).reduce((a, b) => distribution[a] > distribution[b] ? a : b)
    };
  }
}

module.exports = TrajectoryClassifier;