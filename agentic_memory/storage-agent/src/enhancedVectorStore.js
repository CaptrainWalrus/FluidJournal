const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs').promises;
const AntiOverfittingManager = require('./antiOverfittingManager');

/**
 * Enhanced Vector Store with Duration Prediction and Extended Features
 * 
 * Key Enhancements:
 * 1. 140-feature vectors (up from 94)
 * 2. Duration-based outcomes and confidence
 * 3. Move type classification
 * 4. Behavioral pattern recognition
 * 5. Temporal context analysis
 */
class EnhancedVectorStore {
  constructor() {
    this.db = null;
    this.table = null;
    this.dbPath = process.env.ENHANCED_LANCEDB_PATH || './data/vectors_enhanced';
    this.tableName = 'enhanced_feature_vectors';
    
    // Feature configuration
    this.featureCount = 140;  // Enhanced feature count
    this.featureNames = null;
    this.featureGroups = null;
    
    // Duration prediction thresholds
    this.minimumDurationMinutes = 15;
    this.durationBrackets = ['0-5min', '5-15min', '15-30min', '30-60min', '60min+'];
    this.moveTypes = ['spike_reversal', 'trend_continuation', 'consolidation_breakout', 'range_bounce', 'news_spike'];
    
    // Anti-overfitting manager
    this.antiOverfittingManager = new AntiOverfittingManager();
    console.log('[ENHANCED-VECTOR-STORE] Initialized with anti-overfitting protection');
  }

  async initialize() {
    try {
      console.log(`Enhanced Vector Store initializing with ${this.featureCount} features...`);
      
      // Ensure data directory exists
      await fs.mkdir(this.dbPath, { recursive: true });
      
      // Connect to LanceDB
      this.db = await lancedb.connect(this.dbPath, {
        storageOptions: {
          enableV2ManifestPaths: false,
          maxVersions: 1
        }
      });
      
      // Check if table exists
      const tables = await this.db.tableNames();
      
      if (!tables.includes(this.tableName)) {
        await this.createEnhancedTable();
      } else {
        this.table = await this.db.openTable(this.tableName);
      }
      
      console.log(`Enhanced Vector Store initialized - ready for ${this.featureCount} features`);
      return true;
      
    } catch (error) {
      console.error('Failed to initialize enhanced vector store:', error);
      throw error;
    }
  }

  async createEnhancedTable() {
    try {
      // Create enhanced schema with duration prediction fields
      const sampleData = [{
        // === CORE IDENTIFIERS ===
        id: 'sample',
        timestamp: Date.now(),
        entrySignalId: 'sample_entry',
        sessionId: 'sample-session',
        
        // === TRADE BASICS ===
        instrument: 'MGC',
        entryType: 'SAMPLE',
        direction: 'long',
        timeframeMinutes: 1,
        quantity: 1,
        
        // === ENHANCED FEATURES (140 total) ===
        features: new Float32Array(140),
        featureNames: ['sample_feature'],  // Non-empty for schema inference
        featureGroups: '{}',
        
        // === DURATION-BASED OUTCOMES ===
        // Traditional outcomes
        pnl: 0.0,
        pnlPoints: 0.0,
        pnlPerContract: 0.0,
        
        // NEW: Duration metrics
        sustainedMinutes: 0,
        durationBracket: '0-5min',
        moveType: 'sample',
        sustainabilityScore: 0.0,
        
        // Move quality metrics
        maxDrawdownAgainst: 0.0,
        followThroughQuality: 'unknown',
        accelerationType: 'unknown',
        
        // Time-based analysis
        firstProfitMinutes: 0,
        maxProfitMinutes: 0,
        profitSustainedMinutes: 0,
        
        // === BEHAVIORAL CONTEXT ===
        typicalMoveAtTime: 0.0,
        volatilityAtTime: 0.0,
        volumeSurgeProb: 0.0,
        patternFrequency: 0,
        patternRecentSuccess: 0.0,
        similarSetupAge: 0,
        instrumentVolRegime: 'normal',
        instrumentTrendPersistence: 0.0,
        instrumentFakeoutRate: 0.0,
        
        // === RISK PARAMETERS ===
        stopLoss: 0.0,
        takeProfit: 0.0,
        riskReward: 0.0,
        
        // === TRAJECTORY DATA ===
        profitByBar: new Float32Array(50),
        trajectoryBars: 0,
        
        // === METADATA ===
        dataType: 'SAMPLE',
        recordType: 'UNIFIED',
        status: 'ACTIVE'
      }];

      this.table = await this.db.createTable(this.tableName, sampleData);
      
      // Remove sample data
      await this.table.delete('id = "sample"');
      await this.table.compactFiles();
      
      console.log(`Created enhanced LanceDB table '${this.tableName}' with duration prediction schema`);
      
    } catch (error) {
      console.error('Failed to create enhanced LanceDB table:', error);
      throw error;
    }
  }

  async storeEnhancedVector(vectorData) {
    if (!this.writeQueue) {
      this.writeQueue = Promise.resolve();
    }
    
    return this.writeQueue = this.writeQueue.then(async () => {
      return this._storeEnhancedVectorInternal(vectorData);
    });
  }

  async _storeEnhancedVectorInternal(vectorData) {
    try {
      console.log('\n[ENHANCED-VECTOR-STORE] storeEnhancedVector called:', {
        entrySignalId: vectorData.entrySignalId,
        instrument: vectorData.instrument,
        hasFeatures: !!vectorData.features,
        hasOutcome: !!vectorData.outcome,
        hasDurationData: !!vectorData.durationData
      });
      
      const {
        entrySignalId,
        instrument,
        timestamp,
        sessionId,
        entryType,
        direction = 'unknown',
        timeframeMinutes = 1,
        quantity = 1,
        features,
        riskUsed = {},
        outcome,
        durationData = {},  // NEW: Duration-specific data
        behavioralContext = {},  // NEW: Behavioral analysis
        dataType = 'RECENT'
      } = vectorData;

      // Require timestamp from NinjaTrader
      if (!timestamp) {
        throw new Error('BAR_TIMESTAMP_REQUIRED: All trade data must include timestamp from NinjaTrader bar time');
      }

      const timestampMs = new Date(timestamp).getTime();
      const id = `${entrySignalId}_${timestampMs}`;
      
      // Process enhanced features (140 total)
      let featureArray = new Float32Array(140);
      let featureNames = [];
      let featureGroups = {};
      
      if (typeof features === 'object' && !Array.isArray(features) && features !== null) {
        // Convert features object to enhanced array
        const enhancedFeatures = await this.enhanceFeatures(features, behavioralContext);
        
        featureNames = Object.keys(enhancedFeatures).sort();
        featureArray = new Float32Array(Math.min(featureNames.length, 140));
        
        featureNames.forEach((name, idx) => {
          if (idx < 140) {
            featureArray[idx] = typeof enhancedFeatures[name] === 'number' ? enhancedFeatures[name] : 0;
          }
        });
        
        // Pad to 140 features
        if (featureArray.length < 140) {
          const paddedArray = new Float32Array(140);
          paddedArray.set(featureArray);
          featureArray = paddedArray;
        }
        
        // Classify features into groups
        featureGroups = this.classifyFeatureGroups(featureNames);
        
        console.log(`[ENHANCED-VECTOR-STORE] Enhanced ${featureNames.length} features to ${featureArray.length}`);
      }

      // Process trajectory data
      let profitByBarArray = new Float32Array(50);
      let trajectoryBars = 0;
      
      const profitByBarDict = outcome?.profitByBar || vectorData.profitByBar || null;
      if (profitByBarDict && typeof profitByBarDict === 'object') {
        const barIndices = Object.keys(profitByBarDict).map(k => parseInt(k)).filter(k => !isNaN(k));
        trajectoryBars = barIndices.length > 0 ? Math.max(...barIndices) + 1 : 0;
        
        for (let i = 0; i < Math.min(trajectoryBars, 50); i++) {
          const value = profitByBarDict[i.toString()] || profitByBarDict[i] || 0;
          profitByBarArray[i] = typeof value === 'number' ? value : 0;
        }
        
        console.log(`[ENHANCED-TRAJECTORY] Stored ${trajectoryBars} bars of P&L trajectory`);
      }

      // Analyze duration and move characteristics
      const durationAnalysis = this.analyzeDuration(outcome, profitByBarDict, durationData);
      const moveClassification = this.classifyMoveType(features, outcome, durationAnalysis);
      
      const record = {
        // === CORE IDENTIFIERS ===
        id,
        timestamp: new Date(timestamp),
        entrySignalId,
        sessionId: sessionId || 'unknown',
        
        // === TRADE BASICS ===
        instrument,
        entryType: entryType || 'UNKNOWN',
        direction: direction || 'unknown',
        timeframeMinutes: timeframeMinutes || 1,
        quantity: quantity || 1,
        
        // === ENHANCED FEATURES ===
        features: Array.from(featureArray),
        featureNames: featureNames,
        featureGroups: JSON.stringify(featureGroups),
        
        // === DURATION-BASED OUTCOMES ===
        pnl: outcome?.pnl || 0.0,
        pnlPoints: outcome?.pnlPoints || 0.0,
        pnlPerContract: (quantity > 0) ? (outcome?.pnl || 0.0) / quantity : 0.0,
        
        // Duration metrics
        sustainedMinutes: durationAnalysis.sustainedMinutes,
        durationBracket: durationAnalysis.bracket,
        moveType: moveClassification.type,
        sustainabilityScore: moveClassification.sustainabilityScore,
        
        // Move quality
        maxDrawdownAgainst: durationAnalysis.maxDrawdownAgainst,
        followThroughQuality: moveClassification.followThroughQuality,
        accelerationType: moveClassification.accelerationType,
        
        // Time-based analysis
        firstProfitMinutes: durationAnalysis.firstProfitMinutes,
        maxProfitMinutes: durationAnalysis.maxProfitMinutes,
        profitSustainedMinutes: durationAnalysis.profitSustainedMinutes,
        
        // === BEHAVIORAL CONTEXT ===
        typicalMoveAtTime: behavioralContext.typicalMoveAtTime || 0.0,
        volatilityAtTime: behavioralContext.volatilityAtTime || 0.0,
        volumeSurgeProb: behavioralContext.volumeSurgeProb || 0.0,
        patternFrequency: behavioralContext.patternFrequency || 0,
        patternRecentSuccess: behavioralContext.patternRecentSuccess || 0.0,
        similarSetupAge: behavioralContext.similarSetupAge || 0,
        instrumentVolRegime: behavioralContext.instrumentVolRegime || 'normal',
        instrumentTrendPersistence: behavioralContext.instrumentTrendPersistence || 0.0,
        instrumentFakeoutRate: behavioralContext.instrumentFakeoutRate || 0.0,
        
        // === RISK PARAMETERS ===
        stopLoss: riskUsed?.stopLoss || (outcome?.stopLoss || 10.0),
        takeProfit: riskUsed?.takeProfit || (outcome?.takeProfit || 20.0),
        riskReward: riskUsed?.takeProfit && riskUsed?.stopLoss ? 
          (riskUsed.takeProfit / riskUsed.stopLoss) : 0.0,
        
        // === TRAJECTORY DATA ===
        profitByBar: Array.from(profitByBarArray),
        trajectoryBars: trajectoryBars,
        
        // === METADATA ===
        dataType: (dataType && dataType !== 'undefined') ? dataType : 'RECENT',
        recordType: 'UNIFIED',
        status: 'ACTIVE'
      };

      // Store with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          await this.table.add([record]);
          
          console.log(`[ENHANCED-VECTOR-STORE] ✅ Stored enhanced vector ${id}`);
          console.log(`  Duration: ${record.sustainedMinutes}min (${record.durationBracket})`);
          console.log(`  Move Type: ${record.moveType} (${record.sustainabilityScore.toFixed(2)} sustainability)`);
          
          return {
            success: true,
            vectorId: id,
            featureCount: featureArray.length,
            durationAnalysis,
            moveClassification
          };
          
        } catch (addError) {
          retryCount++;
          
          if (addError.message && addError.message.includes('Commit conflict') && retryCount <= maxRetries) {
            const delay = Math.pow(2, retryCount) * 100;
            console.warn(`[ENHANCED-VECTOR-STORE] ⚠️  Commit conflict (retry ${retryCount}/${maxRetries}) - waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          console.error('[ENHANCED-VECTOR-STORE] ❌ Failed to add enhanced record:', addError);
          throw addError;
        }
      }
      
    } catch (error) {
      console.error('Failed to store enhanced vector:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async enhanceFeatures(originalFeatures, behavioralContext) {
    // Start with original 94 features
    const enhanced = { ...originalFeatures };
    
    // Add temporal context features (indexes 94-109)
    enhanced.similar_setup_20bars_ago = behavioralContext.similar_setup_20bars_ago || 0;
    enhanced.similar_setup_50bars_ago = behavioralContext.similar_setup_50bars_ago || 0;
    enhanced.pattern_frequency_100bars = behavioralContext.pattern_frequency_100bars || 0;
    enhanced.pattern_success_rate_recent = behavioralContext.pattern_success_rate_recent || 0;
    enhanced.bullish_sequence_length = behavioralContext.bullish_sequence_length || 0;
    enhanced.bearish_sequence_length = behavioralContext.bearish_sequence_length || 0;
    enhanced.consolidation_duration = behavioralContext.consolidation_duration || 0;
    enhanced.trend_age_bars = behavioralContext.trend_age_bars || 0;
    enhanced.breakout_sustainability = behavioralContext.breakout_sustainability || 0;
    enhanced.false_breakout_frequency = behavioralContext.false_breakout_frequency || 0;
    enhanced.support_resistance_age = behavioralContext.support_resistance_age || 0;
    enhanced.mean_reversion_vs_momentum = behavioralContext.mean_reversion_vs_momentum || 0.5;
    enhanced.regime_change_probability = behavioralContext.regime_change_probability || 0;
    enhanced.volatility_regime_age = behavioralContext.volatility_regime_age || 0;
    enhanced.correlation_breakdown = behavioralContext.correlation_breakdown || 0;
    enhanced.market_internals_strength = behavioralContext.market_internals_strength || 0.5;
    
    // Add behavioral patterns (indexes 110-124)
    enhanced.time_to_daily_high_typical = behavioralContext.time_to_daily_high_typical || 0.5;
    enhanced.time_to_daily_low_typical = behavioralContext.time_to_daily_low_typical || 0.5;
    enhanced.range_completion_pct = behavioralContext.range_completion_pct || 0;
    enhanced.session_bias_strength = behavioralContext.session_bias_strength || 0;
    enhanced.day_of_week_pattern = behavioralContext.day_of_week_pattern || 0;
    enhanced.week_of_month_effect = behavioralContext.week_of_month_effect || 0;
    enhanced.pre_announcement_behavior = behavioralContext.pre_announcement_behavior || 0;
    enhanced.post_announcement_continuation = behavioralContext.post_announcement_continuation || 0;
    enhanced.london_close_effect = behavioralContext.london_close_effect || 0;
    enhanced.ny_open_effect = behavioralContext.ny_open_effect || 0;
    enhanced.typical_trend_duration = behavioralContext.typical_trend_duration || 0;
    enhanced.spike_reversion_probability = behavioralContext.spike_reversion_probability || 0;
    enhanced.momentum_decay_rate = behavioralContext.momentum_decay_rate || 0;
    enhanced.continuation_vs_reversal = behavioralContext.continuation_vs_reversal || 0.5;
    enhanced.news_impact_duration = behavioralContext.news_impact_duration || 0;
    
    // Add duration indicators (indexes 125-139)
    enhanced.move_acceleration_rate = behavioralContext.move_acceleration_rate || 0;
    enhanced.volume_sustainability = behavioralContext.volume_sustainability || 0;
    enhanced.momentum_persistence = behavioralContext.momentum_persistence || 0;
    enhanced.trend_exhaustion_signals = behavioralContext.trend_exhaustion_signals || 0;
    enhanced.consolidation_breakout_power = behavioralContext.consolidation_breakout_power || 0;
    enhanced.order_flow_imbalance_strength = behavioralContext.order_flow_imbalance_strength || 0;
    enhanced.institutional_participation = behavioralContext.institutional_participation || 0;
    enhanced.cross_timeframe_alignment = behavioralContext.cross_timeframe_alignment || 0;
    enhanced.volatility_expansion_rate = behavioralContext.volatility_expansion_rate || 0;
    enhanced.price_efficiency_breakdown = behavioralContext.price_efficiency_breakdown || 0;
    enhanced.liquidity_conditions = behavioralContext.liquidity_conditions || 0.5;
    enhanced.sentiment_shift_indicators = behavioralContext.sentiment_shift_indicators || 0;
    enhanced.seasonal_pattern_strength = behavioralContext.seasonal_pattern_strength || 0;
    enhanced.regime_persistence_score = behavioralContext.regime_persistence_score || 0;
    enhanced.sustainability_composite = behavioralContext.sustainability_composite || 0;
    
    return enhanced;
  }

  classifyFeatureGroups(featureNames) {
    const groups = {
      original: [],
      temporal: [],
      behavioral: [],
      duration: []
    };
    
    featureNames.forEach((name, index) => {
      if (index < 94) {
        groups.original.push(name);
      } else if (index < 110) {
        groups.temporal.push(name);
      } else if (index < 125) {
        groups.behavioral.push(name);
      } else {
        groups.duration.push(name);
      }
    });
    
    return groups;
  }

  analyzeDuration(outcome, profitByBar, durationData) {
    // Calculate sustained duration from trajectory or explicit data
    let sustainedMinutes = durationData.sustainedMinutes || 0;
    let firstProfitMinutes = durationData.firstProfitMinutes || 0;
    let maxProfitMinutes = durationData.maxProfitMinutes || 0;
    let profitSustainedMinutes = durationData.profitSustainedMinutes || 0;
    let maxDrawdownAgainst = durationData.maxDrawdownAgainst || 0;
    
    // If trajectory data available, analyze it
    if (profitByBar && typeof profitByBar === 'object') {
      const trajectory = Object.keys(profitByBar)
        .map(k => ({ bar: parseInt(k), profit: profitByBar[k] }))
        .filter(p => !isNaN(p.bar) && typeof p.profit === 'number')
        .sort((a, b) => a.bar - b.bar);
      
      if (trajectory.length > 0) {
        // Find first profitable bar
        const firstProfitBar = trajectory.find(p => p.profit > 0);
        firstProfitMinutes = firstProfitBar ? firstProfitBar.bar : 0;
        
        // Find max profit bar
        const maxProfitBar = trajectory.reduce((max, current) => 
          current.profit > max.profit ? current : max
        );
        maxProfitMinutes = maxProfitBar.bar;
        
        // Calculate sustained profit duration (consecutive profitable bars)
        let consecutiveProfitBars = 0;
        let maxConsecutive = 0;
        for (const point of trajectory) {
          if (point.profit > 0) {
            consecutiveProfitBars++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveProfitBars);
          } else {
            consecutiveProfitBars = 0;
          }
        }
        profitSustainedMinutes = maxConsecutive;
        
        // Calculate max drawdown against position
        maxDrawdownAgainst = Math.min(0, ...trajectory.map(p => p.profit));
        
        // Overall sustained duration is from entry to last profitable bar
        const lastProfitBar = trajectory.slice().reverse().find(p => p.profit > 0);
        sustainedMinutes = lastProfitBar ? lastProfitBar.bar + 1 : trajectory.length;
      }
    }
    
    // Classify into duration bracket
    let bracket = '0-5min';
    if (sustainedMinutes >= 60) bracket = '60min+';
    else if (sustainedMinutes >= 30) bracket = '30-60min';
    else if (sustainedMinutes >= 15) bracket = '15-30min';
    else if (sustainedMinutes >= 5) bracket = '5-15min';
    
    return {
      sustainedMinutes,
      bracket,
      firstProfitMinutes,
      maxProfitMinutes,
      profitSustainedMinutes,
      maxDrawdownAgainst
    };
  }

  classifyMoveType(features, outcome, durationAnalysis) {
    // Classify move type based on features and duration
    let type = 'unknown';
    let sustainabilityScore = 0.5;
    let followThroughQuality = 'unknown';
    let accelerationType = 'unknown';
    
    const pnl = outcome?.pnl || 0;
    const duration = durationAnalysis.sustainedMinutes;
    
    // Basic classification logic (can be enhanced with ML)
    if (duration < 5) {
      type = 'spike_reversal';
      sustainabilityScore = 0.2;
      followThroughQuality = 'failed';
    } else if (duration >= 30) {
      if (pnl > 0) {
        type = 'trend_continuation';
        sustainabilityScore = 0.8;
        followThroughQuality = 'strong';
      } else {
        type = 'consolidation_breakout';
        sustainabilityScore = 0.6;
        followThroughQuality = 'weak';
      }
    } else {
      type = 'range_bounce';
      sustainabilityScore = 0.5;
      followThroughQuality = 'moderate';
    }
    
    // Determine acceleration type from drawdown
    if (Math.abs(durationAnalysis.maxDrawdownAgainst) < 5) {
      accelerationType = 'accelerating';
    } else if (Math.abs(durationAnalysis.maxDrawdownAgainst) < 15) {
      accelerationType = 'steady';
    } else {
      accelerationType = 'decelerating';
    }
    
    return {
      type,
      sustainabilityScore,
      followThroughQuality,
      accelerationType
    };
  }

  async predictDuration(queryFeatures, options = {}) {
    try {
      const {
        instrument,
        minimumDuration = this.minimumDurationMinutes,
        limit = 100,
        timestamp = new Date().toISOString(),
        entrySignalId = 'unknown'
      } = options;
      
      console.log(`[DURATION-PREDICTION] Predicting duration for ${instrument} (minimum: ${minimumDuration}min)`);
      
      // Convert queryFeatures to array if it's an object
      let queryVector = queryFeatures;
      if (typeof queryFeatures === 'object' && !Array.isArray(queryFeatures)) {
        queryVector = Object.values(queryFeatures);
      }
      
      // Find similar patterns
      const similarPatterns = await this.findSimilarVectors(queryVector, {
        instrument,
        limit: limit * 2
      });
      
      if (similarPatterns.length === 0) {
        return {
          predictedDuration: 0,
          confidence: 0,
          durationBrackets: {},
          recommendation: 'INSUFFICIENT_DATA',
          antiOverfitting: { applied: false, reason: 'No patterns found' }
        };
      }
      
      // Apply anti-overfitting filters to similar patterns
      const filteredPatterns = await this.applyAntiOverfittingToPatterns(
        similarPatterns, 
        timestamp, 
        queryFeatures
      );
      
      if (filteredPatterns.length === 0) {
        return {
          predictedDuration: 0,
          confidence: 0,
          durationBrackets: {},
          recommendation: 'PATTERNS_FILTERED_OUT',
          antiOverfitting: { applied: true, reason: 'All patterns filtered by anti-overfitting' }
        };
      }
      
      // Analyze duration distribution with filtered patterns
      const durations = filteredPatterns.map(p => p.sustainedMinutes || 0);
      const durationBrackets = this.categorizeDurations(durations);
      
      // Calculate base confidence (percentage lasting >= minimum duration)
      const sustainedCount = durations.filter(d => d >= minimumDuration).length;
      let baseConfidence = sustainedCount / durations.length;
      
      // Apply anti-overfitting adjustment to confidence
      const overfittingAdjustment = this.antiOverfittingManager.applyAntiOverfittingAdjustment(
        baseConfidence,
        entrySignalId,
        timestamp,
        queryFeatures
      );
      
      const finalConfidence = overfittingAdjustment.adjustedConfidence;
      
      // Predict most likely duration (weighted average)
      const predictedDuration = this.calculateWeightedDuration(filteredPatterns);
      
      // Determine recommendation based on adjusted confidence
      let recommendation = 'WAIT_FOR_BETTER_SETUP';
      if (overfittingAdjustment.blocked) {
        recommendation = 'BLOCKED_OVERFITTING';
      } else if (finalConfidence >= 0.7) {
        recommendation = 'TAKE_TRADE';
      } else if (finalConfidence >= 0.5) {
        recommendation = 'MODERATE_CONFIDENCE';
      }
      
      console.log(`[DURATION-PREDICTION] Prediction: ${predictedDuration.toFixed(1)}min`);
      console.log(`[DURATION-PREDICTION] Confidence: ${(baseConfidence * 100).toFixed(1)}% → ${(finalConfidence * 100).toFixed(1)}% (after anti-overfitting)`);
      
      return {
        predictedDuration,
        confidence: finalConfidence,
        baseConfidence,
        durationBrackets,
        recommendation,
        sampleSize: filteredPatterns.length,
        originalSampleSize: similarPatterns.length,
        antiOverfitting: {
          applied: true,
          ...overfittingAdjustment,
          patternsFiltered: similarPatterns.length - filteredPatterns.length
        }
      };
      
    } catch (error) {
      console.error('Failed to predict duration:', error);
      throw error;
    }
  }

  categorizeDurations(durations) {
    const brackets = {
      '0-5min': durations.filter(d => d < 5).length,
      '5-15min': durations.filter(d => d >= 5 && d < 15).length,
      '15-30min': durations.filter(d => d >= 15 && d < 30).length,
      '30-60min': durations.filter(d => d >= 30 && d < 60).length,
      '60min+': durations.filter(d => d >= 60).length
    };
    
    const total = durations.length;
    Object.keys(brackets).forEach(bracket => {
      brackets[bracket] = {
        count: brackets[bracket],
        percentage: total > 0 ? brackets[bracket] / total : 0
      };
    });
    
    return brackets;
  }

  calculateWeightedDuration(patterns) {
    if (patterns.length === 0) return 0;
    
    // Weight by similarity score
    let totalWeighted = 0;
    let totalWeight = 0;
    
    patterns.forEach(pattern => {
      const weight = pattern._similarity_score || 1;
      const duration = pattern.sustainedMinutes || 0;
      
      totalWeighted += duration * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? totalWeighted / totalWeight : 0;
  }

  // Enhanced similarity search with duration analysis
  async findSimilarVectors(queryFeatures, options = {}) {
    try {
      const {
        instrument,
        limit = 100,
        similarity_threshold = 0.8,
        includeDurationAnalysis = true
      } = options;
      
      // Get vectors for comparison
      let allVectors = await this.getVectors({ instrument, limit: limit * 2 });
      
      if (allVectors.length === 0) {
        return [];
      }
      
      // Calculate similarities
      const similarities = this.calculateFullVectorSimilarity(queryFeatures, allVectors);
      
      // Filter and sort
      const filteredResults = similarities
        .filter(item => item.similarity >= similarity_threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(item => ({
          ...item.vector,
          _similarity_score: item.similarity
        }));
      
      console.log(`[ENHANCED-SIMILARITY] Found ${filteredResults.length} similar patterns`);
      
      return filteredResults;
      
    } catch (error) {
      console.error('Failed to find similar vectors:', error);
      throw error;
    }
  }

  async applyAntiOverfittingToPatterns(patterns, currentTimestamp, queryFeatures) {
    if (!patterns || patterns.length === 0) return [];
    
    const filteredPatterns = [];
    
    for (const pattern of patterns) {
      const patternTimestamp = pattern.timestamp || new Date().toISOString();
      const patternId = pattern.entrySignalId || `pattern_${Date.now()}`;
      
      const allowanceResult = this.antiOverfittingManager.shouldAllowPattern(
        patternId, 
        patternTimestamp, 
        queryFeatures
      );
      
      if (allowanceResult.allowed) {
        // Add anti-overfitting metadata to pattern
        pattern._antiOverfitting = {
          exposure: allowanceResult.exposure,
          confidence: allowanceResult.confidence,
          adjustmentType: allowanceResult.adjustmentType
        };
        
        filteredPatterns.push(pattern);
      } else {
        console.log(`[ANTI-OVERFITTING] Filtered pattern ${patternId}: ${allowanceResult.reason}`);
      }
    }
    
    console.log(`[ANTI-OVERFITTING] Filtered ${patterns.length - filteredPatterns.length} patterns (${filteredPatterns.length} remaining)`);
    return filteredPatterns;
  }

  // Backtest control methods
  startBacktest(startDate, endDate, resetLearning = true) {
    return this.antiOverfittingManager.startBacktest(startDate, endDate, resetLearning);
  }

  endBacktest() {
    return this.antiOverfittingManager.endBacktest();
  }

  getAntiOverfittingStats() {
    return {
      backtestStats: this.antiOverfittingManager.getBacktestStats(),
      exposureReport: this.antiOverfittingManager.getExposureReport(),
      isBacktestMode: this.antiOverfittingManager.isBacktestMode
    };
  }

  configureAntiOverfitting(settings) {
    return this.antiOverfittingManager.configure(settings);
  }

  calculateFullVectorSimilarity(queryFeatures, allVectors) {
    let queryVector;
    if (Array.isArray(queryFeatures)) {
      queryVector = queryFeatures;
    } else if (queryFeatures instanceof Float32Array) {
      queryVector = Array.from(queryFeatures);
    } else {
      throw new Error('Query features must be an array or Float32Array');
    }

    return allVectors.map(vector => {
      const vectorFeatures = vector.features;
      if (!vectorFeatures || vectorFeatures.length !== queryVector.length) {
        return { vector, similarity: 0 };
      }

      // Cosine similarity
      let dotProduct = 0;
      let queryMagnitude = 0;
      let vectorMagnitude = 0;

      for (let i = 0; i < queryVector.length; i++) {
        dotProduct += queryVector[i] * vectorFeatures[i];
        queryMagnitude += queryVector[i] * queryVector[i];
        vectorMagnitude += vectorFeatures[i] * vectorFeatures[i];
      }

      queryMagnitude = Math.sqrt(queryMagnitude);
      vectorMagnitude = Math.sqrt(vectorMagnitude);

      const similarity = queryMagnitude > 0 && vectorMagnitude > 0 
        ? dotProduct / (queryMagnitude * vectorMagnitude)
        : 0;

      return { vector, similarity };
    });
  }

  async getVectors(options = {}) {
    try {
      const {
        instrument,
        since,
        limit = 100000,
        entryType,
        timeframeMinutes,
        dataType,
        moveType,
        durationBracket
      } = options;

      const filters = [];
      
      if (instrument) {
        filters.push(`instrument = '${instrument}'`);
      }
      
      if (entryType) {
        filters.push(`entryType = '${entryType}'`);
      }
      
      if (timeframeMinutes) {
        filters.push(`timeframeMinutes = ${timeframeMinutes}`);
      }
      
      if (dataType) {
        filters.push(`dataType = '${dataType}'`);
      }
      
      if (moveType) {
        filters.push(`moveType = '${moveType}'`);
      }
      
      if (durationBracket) {
        filters.push(`durationBracket = '${durationBracket}'`);
      }
      
      if (since) {
        const sinceTimestamp = since.toISOString();
        filters.push(`timestamp >= '${sinceTimestamp}'`);
      }
      
      let query;
      if (filters.length > 0) {
        query = this.table.filter(filters.join(' AND ')).limit(limit);
      } else {
        query = this.table.filter('id IS NOT NULL').limit(limit);
      }
      
      const results = await query.execute();
      return results;
      
    } catch (error) {
      console.error('Failed to get enhanced vectors:', error);
      throw error;
    }
  }

  async getEnhancedStats() {
    try {
      if (!this.table) {
        return {
          totalVectors: 0,
          durationStats: {},
          moveTypeStats: {},
          sustainabilityStats: {},
          featureCount: 140
        };
      }
      
      const allVectors = await this.table.filter('id IS NOT NULL').limit(1000000).execute();
      const totalCount = allVectors.length;
      
      // Duration bracket analysis
      const durationStats = {};
      const moveTypeStats = {};
      const sustainabilityStats = {
        totalSustainability: 0,
        avgSustainability: 0,
        highSustainability: 0  // > 0.7
      };
      
      allVectors.forEach(vector => {
        // Duration brackets
        const bracket = vector.durationBracket || 'unknown';
        if (!durationStats[bracket]) {
          durationStats[bracket] = { count: 0, avgPnl: 0, totalPnl: 0 };
        }
        durationStats[bracket].count++;
        durationStats[bracket].totalPnl += vector.pnl || 0;
        
        // Move types
        const moveType = vector.moveType || 'unknown';
        if (!moveTypeStats[moveType]) {
          moveTypeStats[moveType] = { count: 0, avgSustainability: 0, totalSustainability: 0 };
        }
        moveTypeStats[moveType].count++;
        moveTypeStats[moveType].totalSustainability += vector.sustainabilityScore || 0;
        
        // Sustainability
        const sustainability = vector.sustainabilityScore || 0;
        sustainabilityStats.totalSustainability += sustainability;
        if (sustainability > 0.7) {
          sustainabilityStats.highSustainability++;
        }
      });
      
      // Calculate averages
      Object.keys(durationStats).forEach(bracket => {
        const stats = durationStats[bracket];
        stats.avgPnl = stats.count > 0 ? stats.totalPnl / stats.count : 0;
      });
      
      Object.keys(moveTypeStats).forEach(type => {
        const stats = moveTypeStats[type];
        stats.avgSustainability = stats.count > 0 ? stats.totalSustainability / stats.count : 0;
      });
      
      sustainabilityStats.avgSustainability = totalCount > 0 ? 
        sustainabilityStats.totalSustainability / totalCount : 0;
      
      return {
        totalVectors: totalCount,
        durationStats,
        moveTypeStats,
        sustainabilityStats,
        featureCount: 140,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Failed to get enhanced stats:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.db) {
        this.db = null;
        this.table = null;
        console.log('Enhanced vector store connection closed');
      }
    } catch (error) {
      console.error('Error closing enhanced vector store:', error);
    }
  }
}

module.exports = new EnhancedVectorStore();