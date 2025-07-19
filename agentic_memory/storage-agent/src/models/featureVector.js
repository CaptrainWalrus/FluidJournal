/**
 * Feature Vector Model
 * Defines the schema and structure for trading feature vectors stored in LanceDB
 * 
 * This model matches the feature set from:
 * - ME's positionTrackingService.js::generateSignalFeatures()
 * - vectorbt-poc/e2e_feature_backtest_optimizer.py
 */

class FeatureVector {
  constructor() {
    // Feature names in order (must match vectorStore.js)
    this.featureNames = [
      // Price-based features (matching e2e_feature_backtest_optimizer.py)
      'price_change_pct_1',      // 1-bar price change percentage
      'price_change_pct_5',      // 5-bar price change percentage  
      'momentum_5',              // 5-bar momentum
      
      // Volume features
      'volume_spike_3bar',       // Current volume vs 3-bar average
      'volume_ma_ratio',         // Volume moving average ratio
      
      // Technical indicators
      'rsi',                     // RSI(14)
      'bb_position',             // Position within Bollinger Bands
      'bb_width',                // Bollinger Band width
      'atr_pct',                 // ATR as percentage of price
      
      // EMA features
      'ema_spread_pct',          // EMA9-EMA21 spread as percentage
      'ema9_slope',              // EMA9 slope over 3 bars
      
      // New percentage-based features from ME
      'ema9_distance_pct',       // Distance from EMA9 as percentage
      'price_momentum_1min',     // 1-minute price momentum
      'volume_vs_ma_pct',        // Volume vs moving average percentage
      'buying_pressure',         // Buy pressure indicator
      'selling_pressure',        // Sell pressure indicator
      
      // Additional microstructure features
      'price_range_pct',         // Price range as percentage
      'body_pct',                // Candle body as percentage of range
      'upper_wick_pct',          // Upper wick as percentage of range
      'lower_wick_pct'           // Lower wick as percentage of range
    ];
    
    this.featureCount = this.featureNames.length;
  }

  /**
   * Validate a feature vector
   * @param {Object} vectorData - The vector data to validate
   * @returns {Object} Validation result
   */
  validate(vectorData) {
    const errors = [];
    
    // Required fields
    const requiredFields = [
      'entrySignalId',
      'instrument', 
      'timestamp',
      'features',
      'outcome'
    ];
    
    for (const field of requiredFields) {
      if (!vectorData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate features array
    if (vectorData.features) {
      if (!Array.isArray(vectorData.features) && !(vectorData.features instanceof Float32Array)) {
        errors.push('Features must be an array or Float32Array');
      } else if (vectorData.features.length === 0) {
        errors.push('Features array cannot be empty');
      }
      // Note: We allow different lengths as vectorStore.js handles padding/truncation
    }
    
    // Validate outcome object
    if (vectorData.outcome && typeof vectorData.outcome !== 'object') {
      errors.push('Outcome must be an object');
    }
    
    // Validate timestamp
    if (vectorData.timestamp) {
      const timestamp = new Date(vectorData.timestamp);
      if (isNaN(timestamp.getTime())) {
        errors.push('Invalid timestamp format');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract features from ME training record
   * Maps from positionTrackingService format to feature vector
   * @param {Object} trainingRecord - Training record from ME
   * @returns {Float32Array} Feature vector
   */
  extractFeatures(trainingRecord) {
    const features = new Float32Array(this.featureCount);
    
    try {
      // Map features from training record
      // This matches the extractFeatureVector function in REVISED_AGENTIC_MEMORY_PLAN.md
      
      features[0] = trainingRecord.technicalIndicators?.price_change_pct_1 || 0;
      features[1] = trainingRecord.technicalIndicators?.price_change_pct_5 || 0;
      features[2] = trainingRecord.technicalIndicators?.momentum_5 || 0;
      
      features[3] = trainingRecord.technicalIndicators?.volume_spike_3bar || 0;
      features[4] = trainingRecord.technicalIndicators?.volume_ma_ratio || 0;
      
      features[5] = trainingRecord.technicalIndicators?.rsi_14 || 0;
      features[6] = trainingRecord.technicalIndicators?.bb_position || 0;
      features[7] = trainingRecord.technicalIndicators?.bb_width || 0;
      features[8] = trainingRecord.technicalIndicators?.atr_pct || 0;
      
      features[9] = trainingRecord.technicalIndicators?.ema_spread_pct || 0;
      features[10] = trainingRecord.technicalIndicators?.ema9_slope || 0;
      
      features[11] = trainingRecord.technicalIndicators?.ema9_distance_pct || 0;
      features[12] = trainingRecord.technicalIndicators?.price_momentum_1min || 0;
      features[13] = trainingRecord.technicalIndicators?.volume_vs_ma_pct || 0;
      features[14] = trainingRecord.technicalIndicators?.buying_pressure || 0;
      features[15] = trainingRecord.technicalIndicators?.selling_pressure || 0;
      
      features[16] = trainingRecord.technicalIndicators?.price_range_pct || 0;
      features[17] = trainingRecord.technicalIndicators?.body_pct || 0;
      features[18] = trainingRecord.technicalIndicators?.upper_wick_pct || 0;
      features[19] = trainingRecord.technicalIndicators?.lower_wick_pct || 0;
      
      return features;
      
    } catch (error) {
      console.error('Error extracting features:', error);
      return new Float32Array(this.featureCount); // Return zeros on error
    }
  }

  /**
   * Create a vector data object for storage
   * @param {Object} params - Parameters for creating vector data
   * @returns {Object} Vector data ready for storage
   */
  createVectorData({
    entrySignalId,
    instrument,
    timestamp,
    entryType,
    trainingRecord,
    position,
    exitOutcome
  }) {
    
    // Extract features from training record
    const features = this.extractFeatures(trainingRecord);
    
    return {
      entrySignalId,
      instrument,
      timestamp,
      entryType: entryType || 'UNKNOWN',
      features,
      
      riskUsed: {
        stopLoss: position?.stopLoss || 10,
        takeProfit: position?.takeProfit || 20,
        virtualStop: position?.virtualStop || 0
      },
      
      outcome: {
        pnl: exitOutcome?.pnlDollars || 0,
        pnlPoints: exitOutcome?.pnlPoints || 0,
        holdingBars: exitOutcome?.holdingBars || 0,
        exitReason: exitOutcome?.exitReason || 'UNKNOWN',
        maxProfit: trainingRecord?.MaxProfit || 0,
        maxLoss: trainingRecord?.MaxLoss || 0,
        wasGoodExit: exitOutcome?.wasGoodExit || false
      }
    };
  }

  /**
   * Get feature information for documentation
   * @returns {Array} Array of feature info objects
   */
  getFeatureInfo() {
    const descriptions = [
      'Price change over 1 bar (percentage)',
      'Price change over 5 bars (percentage)', 
      'Momentum over 5 bars',
      'Volume spike vs 3-bar average',
      'Volume moving average ratio',
      'Relative Strength Index (14 period)',
      'Position within Bollinger Bands (0-1)',
      'Bollinger Band width relative to price',
      'Average True Range as percentage of price',
      'EMA9-EMA21 spread as percentage',
      'EMA9 slope over 3 bars',
      'Distance from EMA9 as percentage',
      '1-minute price momentum',
      'Volume vs moving average percentage',
      'Buying pressure indicator',
      'Selling pressure indicator',
      'Price range as percentage',
      'Candle body as percentage of range',
      'Upper wick as percentage of range',
      'Lower wick as percentage of range'
    ];
    
    return this.featureNames.map((name, index) => ({
      index,
      name,
      description: descriptions[index] || 'No description available'
    }));
  }
}

module.exports = FeatureVector;