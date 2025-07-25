/**
 * Advanced Confidence Scoring Engine
 * Converts GP uncertainty into actionable confidence scores with multiple factors
 */

class ConfidenceEngine {
  constructor() {
    this.calibrationData = new Map(); // Store calibration history
    this.confidenceThresholds = {
      VERY_HIGH: 0.85,
      HIGH: 0.70,
      MEDIUM: 0.55,
      LOW: 0.40,
      VERY_LOW: 0.25
    };
  }

  /**
   * Main confidence scoring function
   * Combines multiple uncertainty sources into final confidence
   */
  calculateConfidence(gpResult, contextualFactors = {}) {
    // Safely extract values with proper defaults
    const pnlUncertainty = gpResult?.pnl?.std || 50;
    const trajectoryUncertainty = gpResult?.trajectory?.std || null;
    const sample_count = gpResult?.model_info?.sample_count || 100;
    
    // Debug logging
    console.log('[CONFIDENCE-ENGINE] Input data:', {
      gpResult: gpResult,
      hasPnl: !!gpResult?.pnl,
      pnlStd: pnlUncertainty,
      hasTrajectory: !!gpResult?.trajectory,
      sampleCount: sample_count
    });

    // 1. Base confidence from PnL uncertainty
    const baseConfidence = this.pnlUncertaintyToConfidence(pnlUncertainty);
    
    // 2. Trajectory consistency factor
    const trajectoryFactor = this.calculateTrajectoryConsistency(trajectoryUncertainty);
    
    // 3. Model reliability factor
    const modelFactor = this.calculateModelReliability(sample_count, gpResult?.model_info);
    
    // 4. Market context factor
    const contextFactor = this.calculateContextualFactor(contextualFactors);
    
    // 5. Calibration adjustment
    const calibrationFactor = this.getCalibrationAdjustment(gpResult);

    // Weighted combination
    const finalConfidence = this.combineConfidenceFactors({
      base: baseConfidence,
      trajectory: trajectoryFactor,
      model: modelFactor,
      context: contextFactor,
      calibration: calibrationFactor
    });

    // Generate detailed breakdown
    const breakdown = {
      final_confidence: finalConfidence,
      confidence_level: this.getConfidenceLevel(finalConfidence),
      factors: {
        pnl_uncertainty: {
          value: pnlUncertainty,
          confidence: baseConfidence,
          weight: 0.4
        },
        trajectory_consistency: {
          uncertainty: trajectoryUncertainty,
          factor: trajectoryFactor,
          weight: 0.2
        },
        model_reliability: {
          sample_count,
          factor: modelFactor,
          weight: 0.2
        },
        market_context: {
          factor: contextFactor,
          weight: 0.1
        },
        calibration: {
          factor: calibrationFactor,
          weight: 0.1
        }
      },
      recommendation: this.generateRecommendation(finalConfidence, gpResult)
    };

    return breakdown;
  }

  /**
   * Convert PnL uncertainty to base confidence
   * Lower uncertainty = higher confidence
   */
  pnlUncertaintyToConfidence(pnlUncertainty) {
    // Reference points: $10 = very confident, $50 = neutral, $100+ = very uncertain
    const normalizedUncertainty = Math.max(0, Math.min(100, pnlUncertainty));
    
    // Sigmoid transformation for smooth confidence curve
    const scaledUncertainty = normalizedUncertainty / 50.0; // Scale to 0-2 range
    const confidence = 1.0 / (1.0 + Math.exp(scaledUncertainty - 1.0));
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Calculate trajectory consistency factor
   * More consistent trajectory = higher confidence
   */
  calculateTrajectoryConsistency(trajectoryUncertainty) {
    if (!trajectoryUncertainty || !Array.isArray(trajectoryUncertainty)) {
      return 1.0; // Neutral if no trajectory data
    }

    // Calculate trajectory volatility
    const avgUncertainty = trajectoryUncertainty.reduce((sum, val) => sum + val, 0) / trajectoryUncertainty.length;
    const volatility = Math.sqrt(
      trajectoryUncertainty.reduce((sum, val) => sum + Math.pow(val - avgUncertainty, 2), 0) / trajectoryUncertainty.length
    );

    // Lower volatility = higher consistency = boost factor
    const consistencyFactor = 1.0 + (1.0 / (1.0 + volatility / 20.0)) * 0.2;
    
    return Math.max(0.8, Math.min(1.2, consistencyFactor));
  }

  /**
   * Calculate model reliability based on training data
   */
  calculateModelReliability(sampleCount, modelInfo = {}) {
    // More samples = more reliable model
    let reliabilityFactor = 1.0;
    
    // Sample count factor
    if (sampleCount < 50) {
      reliabilityFactor *= 0.8; // Penalize small sample sizes
    } else if (sampleCount > 200) {
      reliabilityFactor *= 1.1; // Boost for large sample sizes
    }
    
    // Model freshness factor (if last_updated available)
    if (modelInfo.last_updated) {
      const daysSinceUpdate = (Date.now() - new Date(modelInfo.last_updated)) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 7) {
        reliabilityFactor *= 0.95; // Slight penalty for stale models
      }
    }
    
    return Math.max(0.7, Math.min(1.3, reliabilityFactor));
  }

  /**
   * Calculate contextual factors (market conditions, recent performance, etc.)
   */
  calculateContextualFactor(contextualFactors) {
    let contextFactor = 1.0;
    
    // Recent win rate factor
    if (contextualFactors.recentWinRate !== undefined) {
      if (contextualFactors.recentWinRate > 0.7) {
        contextFactor *= 1.1; // Boost for hot streak
      } else if (contextualFactors.recentWinRate < 0.3) {
        contextFactor *= 0.9; // Penalize cold streak
      }
    }
    
    // Market volatility factor
    if (contextualFactors.marketVolatility !== undefined) {
      if (contextualFactors.marketVolatility > 2.0) {
        contextFactor *= 0.95; // Reduce confidence in volatile markets
      }
    }
    
    // Time of day factor
    if (contextualFactors.timeOfDay !== undefined) {
      const hour = contextualFactors.timeOfDay;
      if (hour >= 9 && hour <= 16) {
        contextFactor *= 1.05; // Boost during market hours
      }
    }
    
    return Math.max(0.8, Math.min(1.2, contextFactor));
  }

  /**
   * Get calibration adjustment based on historical prediction accuracy
   */
  getCalibrationAdjustment(gpResult) {
    const instrument = gpResult.model_info?.instrument || 'UNKNOWN';
    const direction = gpResult.model_info?.direction || 'unknown';
    const key = `${instrument}_${direction}`;
    
    const calibrationHistory = this.calibrationData.get(key);
    
    if (!calibrationHistory || calibrationHistory.predictions < 10) {
      return 1.0; // Neutral until we have enough calibration data
    }
    
    // Calculate prediction accuracy vs confidence
    const accuracyRatio = calibrationHistory.correct / calibrationHistory.predictions;
    const avgConfidence = calibrationHistory.totalConfidence / calibrationHistory.predictions;
    
    // If model is overconfident (high confidence, low accuracy), reduce confidence
    // If model is underconfident (low confidence, high accuracy), boost confidence
    const calibrationError = avgConfidence - accuracyRatio;
    const adjustmentFactor = 1.0 - (calibrationError * 0.5);
    
    return Math.max(0.8, Math.min(1.2, adjustmentFactor));
  }

  /**
   * Combine all confidence factors with weights
   */
  combineConfidenceFactors(factors) {
    const weights = {
      base: 0.4,        // PnL uncertainty (primary)
      trajectory: 0.2,  // Trajectory consistency
      model: 0.2,       // Model reliability
      context: 0.1,     // Market context
      calibration: 0.1  // Historical calibration
    };
    
    // Weighted average of base confidence with factor adjustments
    const weightedSum = 
      factors.base * weights.base +
      (factors.base * factors.trajectory) * weights.trajectory +
      (factors.base * factors.model) * weights.model +
      (factors.base * factors.context) * weights.context +
      (factors.base * factors.calibration) * weights.calibration;
    
    return Math.max(0.1, Math.min(0.95, weightedSum));
  }

  /**
   * Convert numeric confidence to categorical level
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.confidenceThresholds.VERY_HIGH) return 'VERY_HIGH';
    if (confidence >= this.confidenceThresholds.HIGH) return 'HIGH';
    if (confidence >= this.confidenceThresholds.MEDIUM) return 'MEDIUM';
    if (confidence >= this.confidenceThresholds.LOW) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Generate actionable recommendation based on confidence
   */
  generateRecommendation(confidence, gpResult) {
    const level = this.getConfidenceLevel(confidence);
    const expectedPnl = gpResult.pnl?.mean || 0;
    const uncertainty = gpResult.pnl?.std || 50;
    
    const recommendations = {
      VERY_HIGH: {
        action: 'STRONG_BUY',
        position_size: 'FULL',
        risk_adjustment: 'TIGHT',
        message: 'High confidence signal with low uncertainty'
      },
      HIGH: {
        action: 'BUY',
        position_size: 'STANDARD',
        risk_adjustment: 'NORMAL',
        message: 'Good confidence signal, proceed normally'
      },
      MEDIUM: {
        action: 'CAUTIOUS_BUY',
        position_size: 'REDUCED',
        risk_adjustment: 'WIDER',
        message: 'Moderate confidence, reduce position size'
      },
      LOW: {
        action: 'VERY_CAUTIOUS',
        position_size: 'MINIMAL',
        risk_adjustment: 'WIDE',
        message: 'Low confidence, minimal position only'
      },
      VERY_LOW: {
        action: 'AVOID',
        position_size: 'NONE',
        risk_adjustment: 'N/A',
        message: 'Very low confidence, avoid trade'
      }
    };
    
    const baseRec = recommendations[level];
    
    // Adjust for expected PnL
    if (expectedPnl < -30 && level !== 'VERY_LOW') {
      baseRec.action = 'AVOID';
      baseRec.message += ' (negative expectation)';
    }
    
    return baseRec;
  }

  /**
   * Update calibration data with actual outcome
   */
  updateCalibration(instrument, direction, predictedConfidence, actualOutcome) {
    const key = `${instrument}_${direction}`;
    
    if (!this.calibrationData.has(key)) {
      this.calibrationData.set(key, {
        predictions: 0,
        correct: 0,
        totalConfidence: 0
      });
    }
    
    const data = this.calibrationData.get(key);
    data.predictions++;
    data.totalConfidence += predictedConfidence;
    
    // Consider prediction "correct" if high confidence led to profitable outcome
    // or low confidence avoided losses
    const wasCorrect = (predictedConfidence > 0.6 && actualOutcome > 0) ||
                       (predictedConfidence < 0.4 && actualOutcome <= 0) ||
                       (predictedConfidence >= 0.4 && predictedConfidence <= 0.6); // neutral predictions always "correct"
    
    if (wasCorrect) {
      data.correct++;
    }
    
    console.log(`[CONFIDENCE-ENGINE] Calibration updated for ${key}: ${data.correct}/${data.predictions} accuracy`);
  }

  /**
   * Position sizing recommendation based on confidence
   */
  calculatePositionSize(baseSize, confidence, maxSize = null) {
    const level = this.getConfidenceLevel(confidence);
    
    const sizeMultipliers = {
      VERY_HIGH: 1.2,
      HIGH: 1.0,
      MEDIUM: 0.7,
      LOW: 0.4,
      VERY_LOW: 0.1
    };
    
    const recommendedSize = baseSize * sizeMultipliers[level];
    
    return maxSize ? Math.min(recommendedSize, maxSize) : recommendedSize;
  }

  /**
   * Get confidence statistics for monitoring
   */
  getConfidenceStats() {
    const stats = {};
    
    for (const [key, data] of this.calibrationData) {
      stats[key] = {
        predictions: data.predictions,
        accuracy: data.predictions > 0 ? data.correct / data.predictions : 0,
        avg_confidence: data.predictions > 0 ? data.totalConfidence / data.predictions : 0
      };
    }
    
    return stats;
  }
}

module.exports = ConfidenceEngine;