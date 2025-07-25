/**
 * Historical Context Extraction Engine
 * 
 * Extracts temporal and behavioral context for pattern analysis:
 * 1. Extended lookback analysis (20, 50, 100+ bars)
 * 2. Pattern frequency and success rates
 * 3. Sequence analysis (trend age, consolidation duration)
 * 4. Behavioral pattern recognition
 * 5. Time-of-day/session effects
 */

class HistoricalContextEngine {
  constructor(vectorStore = null) {
    this.vectorStore = vectorStore;
    this.lookbackPeriods = [20, 50, 100];
    this.patternSimilarityThreshold = 0.75;
    this.behaviorCache = new Map(); // Cache behavioral patterns
    this.maxCacheSize = 1000;
  }

  /**
   * Extract complete historical context for current market state
   */
  async extractHistoricalContext(currentFeatures, options = {}) {
    try {
      const {
        instrument = 'MGC',
        timestamp = new Date(),
        lookbackBars = 100,
        includeTimePatterns = true,
        includeBehavioral = true
      } = options;

      console.log(`[HISTORICAL-CONTEXT] Extracting context for ${instrument} with ${lookbackBars} bar lookback`);

      // Get historical data for analysis
      const historicalData = await this.getHistoricalBars(instrument, timestamp, lookbackBars);
      
      if (historicalData.length < 20) {
        console.warn(`[HISTORICAL-CONTEXT] Insufficient historical data: ${historicalData.length} bars`);
        return this.getDefaultContext();
      }

      // Extract different types of context
      const context = {
        // Temporal context (features 94-109)
        ...await this.extractTemporalContext(currentFeatures, historicalData),
        
        // Behavioral patterns (features 110-124)
        ...(includeBehavioral ? await this.extractBehavioralContext(instrument, timestamp, historicalData) : {}),
        
        // Duration indicators (features 125-139)
        ...await this.extractDurationContext(currentFeatures, historicalData),
        
        // Time-based patterns
        ...(includeTimePatterns ? await this.extractTimePatterns(instrument, timestamp) : {}),
        
        // Metadata
        contextQuality: this.assessContextQuality(historicalData),
        dataPoints: historicalData.length,
        timestamp: timestamp.toISOString()
      };

      console.log(`[HISTORICAL-CONTEXT] Extracted context with quality: ${context.contextQuality}`);
      return context;

    } catch (error) {
      console.error('Failed to extract historical context:', error);
      return this.getDefaultContext();
    }
  }

  /**
   * Extract temporal context features (indexes 94-109)
   */
  async extractTemporalContext(currentFeatures, historicalData) {
    try {
      // Find similar setups in historical data
      const similarSetups = await this.findSimilarSetups(currentFeatures, historicalData);
      
      return {
        // Pattern occurrence analysis
        similar_setup_20bars_ago: this.findSimilarAtDistance(similarSetups, 20) ? 1 : 0,
        similar_setup_50bars_ago: this.findSimilarAtDistance(similarSetups, 50) ? 1 : 0,
        pattern_frequency_100bars: similarSetups.length,
        pattern_success_rate_recent: this.calculateRecentSuccessRate(similarSetups),
        
        // Sequence analysis
        bullish_sequence_length: this.calculateSequenceLength(historicalData, 'bullish'),
        bearish_sequence_length: this.calculateSequenceLength(historicalData, 'bearish'),
        consolidation_duration: this.calculateConsolidationDuration(historicalData),
        trend_age_bars: this.calculateTrendAge(historicalData),
        
        // Pattern reliability
        breakout_sustainability: this.calculateBreakoutSustainability(historicalData),
        false_breakout_frequency: this.calculateFalseBreakoutRate(historicalData),
        support_resistance_age: this.calculateLevelAge(historicalData),
        
        // Market regime analysis
        mean_reversion_vs_momentum: this.assessMarketRegime(historicalData),
        regime_change_probability: this.calculateRegimeChangeProb(historicalData),
        volatility_regime_age: this.calculateVolatilityRegimeAge(historicalData),
        correlation_breakdown: this.calculateCorrelationBreakdown(historicalData),
        market_internals_strength: this.assessMarketInternals(historicalData)
      };

    } catch (error) {
      console.error('Failed to extract temporal context:', error);
      return this.getDefaultTemporalContext();
    }
  }

  /**
   * Extract behavioral patterns (indexes 110-124)
   */
  async extractBehavioralContext(instrument, timestamp, historicalData) {
    try {
      const cacheKey = `${instrument}_${timestamp.getHours()}`;
      
      // Check cache first
      if (this.behaviorCache.has(cacheKey)) {
        return this.behaviorCache.get(cacheKey);
      }

      const hour = timestamp.getHours();
      const dayOfWeek = timestamp.getDay();
      const dayOfMonth = timestamp.getDate();
      
      // Analyze time-based patterns
      const timeBasedContext = await this.analyzeTimeBasedPatterns(instrument, hour, dayOfWeek);
      
      const context = {
        // Daily patterns
        time_to_daily_high_typical: timeBasedContext.typicalHighTime,
        time_to_daily_low_typical: timeBasedContext.typicalLowTime,
        range_completion_pct: this.calculateRangeCompletion(historicalData, hour),
        session_bias_strength: timeBasedContext.sessionBias,
        
        // Calendar effects
        day_of_week_pattern: this.getDayOfWeekBias(instrument, dayOfWeek),
        week_of_month_effect: this.getWeekOfMonthEffect(dayOfMonth),
        
        // Event-driven patterns
        pre_announcement_behavior: await this.getPreAnnouncementBehavior(instrument, timestamp),
        post_announcement_continuation: await this.getPostAnnouncementPattern(instrument),
        
        // Session transitions
        london_close_effect: this.getSessionTransitionEffect(hour, 'london_close'),
        ny_open_effect: this.getSessionTransitionEffect(hour, 'ny_open'),
        
        // Duration patterns
        typical_trend_duration: await this.getTypicalTrendDuration(instrument, hour),
        spike_reversion_probability: this.calculateSpikeReversionProb(historicalData),
        momentum_decay_rate: this.calculateMomentumDecayRate(historicalData),
        continuation_vs_reversal: this.calculateContinuationOdds(historicalData),
        news_impact_duration: await this.getNewsImpactDuration(instrument)
      };

      // Cache the result
      if (this.behaviorCache.size >= this.maxCacheSize) {
        const firstKey = this.behaviorCache.keys().next().value;
        this.behaviorCache.delete(firstKey);
      }
      this.behaviorCache.set(cacheKey, context);

      return context;

    } catch (error) {
      console.error('Failed to extract behavioral context:', error);
      return this.getDefaultBehavioralContext();
    }
  }

  /**
   * Extract duration indicators (indexes 125-139)
   */
  async extractDurationContext(currentFeatures, historicalData) {
    try {
      // Analyze current move characteristics
      const recentBars = historicalData.slice(-10);
      const priceAction = this.analyzePriceAction(recentBars);
      const volumePattern = this.analyzeVolumePattern(recentBars);
      const momentum = this.analyzeMomentum(recentBars);

      return {
        // Move dynamics
        move_acceleration_rate: priceAction.accelerationRate,
        volume_sustainability: volumePattern.sustainability,
        momentum_persistence: momentum.persistence,
        trend_exhaustion_signals: this.detectExhaustionSignals(recentBars),
        
        // Breakout analysis
        consolidation_breakout_power: this.assessBreakoutPower(historicalData),
        order_flow_imbalance_strength: this.calculateOrderFlowImbalance(recentBars),
        institutional_participation: this.detectInstitutionalActivity(recentBars),
        
        // Multi-timeframe
        cross_timeframe_alignment: await this.assessCrossTimeframeAlignment(currentFeatures),
        
        // Market structure
        volatility_expansion_rate: this.calculateVolatilityExpansion(recentBars),
        price_efficiency_breakdown: this.assessPriceEfficiency(recentBars),
        liquidity_conditions: this.assessLiquidityConditions(recentBars),
        
        // Sentiment and cyclical
        sentiment_shift_indicators: this.detectSentimentShifts(historicalData),
        seasonal_pattern_strength: await this.getSeasonalStrength(historicalData),
        regime_persistence_score: this.calculateRegimePersistence(historicalData),
        
        // Composite sustainability score
        sustainability_composite: this.calculateSustainabilityComposite(
          priceAction, volumePattern, momentum, historicalData
        )
      };

    } catch (error) {
      console.error('Failed to extract duration context:', error);
      return this.getDefaultDurationContext();
    }
  }

  // === HELPER METHODS ===

  async getHistoricalBars(instrument, timestamp, lookbackBars) {
    if (!this.vectorStore) {
      return [];
    }

    try {
      // Get historical vectors before the current timestamp
      const endTime = new Date(timestamp);
      const startTime = new Date(endTime.getTime() - (lookbackBars * 60 * 1000)); // Assume 1-minute bars

      const vectors = await this.vectorStore.getVectors({
        instrument,
        since: startTime,
        limit: lookbackBars * 2 // Get extra to ensure we have enough
      });

      // Filter and sort by timestamp
      return vectors
        .filter(v => new Date(v.timestamp) < endTime)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-lookbackBars); // Take most recent lookbackBars

    } catch (error) {
      console.error('Failed to get historical bars:', error);
      return [];
    }
  }

  async findSimilarSetups(currentFeatures, historicalData) {
    // Find patterns similar to current setup in historical data
    const similarSetups = [];
    const currentVector = Array.isArray(currentFeatures) ? currentFeatures : Object.values(currentFeatures);

    for (const bar of historicalData) {
      if (bar.features && bar.features.length >= 94) {
        const similarity = this.calculateCosineSimilarity(currentVector, bar.features.slice(0, 94));
        
        if (similarity >= this.patternSimilarityThreshold) {
          similarSetups.push({
            ...bar,
            similarity,
            barsAgo: historicalData.length - historicalData.indexOf(bar)
          });
        }
      }
    }

    return similarSetups.sort((a, b) => b.similarity - a.similarity);
  }

  calculateCosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    return mag1 > 0 && mag2 > 0 ? dotProduct / (mag1 * mag2) : 0;
  }

  findSimilarAtDistance(similarSetups, distance) {
    return similarSetups.some(setup => 
      Math.abs(setup.barsAgo - distance) <= 2 // Allow 2-bar tolerance
    );
  }

  calculateRecentSuccessRate(similarSetups) {
    if (similarSetups.length === 0) return 0;

    const recentSetups = similarSetups.filter(s => s.barsAgo <= 50);
    if (recentSetups.length === 0) return 0;

    const successfulSetups = recentSetups.filter(s => (s.pnl || 0) > 0);
    return successfulSetups.length / recentSetups.length;
  }

  calculateSequenceLength(historicalData, direction) {
    let sequenceLength = 0;
    
    // Start from most recent bar and count backwards
    for (let i = historicalData.length - 1; i >= 0; i--) {
      const bar = historicalData[i];
      
      // Determine if bar is bullish/bearish based on pnl or price action
      const isBullish = (bar.pnl || 0) > 0 || (bar.direction === 'long');
      const isBearish = (bar.pnl || 0) < 0 || (bar.direction === 'short');
      
      if ((direction === 'bullish' && isBullish) || (direction === 'bearish' && isBearish)) {
        sequenceLength++;
      } else {
        break;
      }
    }
    
    return sequenceLength;
  }

  calculateConsolidationDuration(historicalData) {
    // Look for consolidation pattern (low volatility, range-bound)
    let consolidationBars = 0;
    const recentBars = historicalData.slice(-20);
    
    if (recentBars.length < 5) return 0;
    
    // Calculate price range and volatility
    const prices = recentBars.map(bar => bar.pnl || 0);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const range = high - low;
    const avgVolatility = this.calculateAverageVolatility(recentBars);
    
    // If range is small relative to average volatility, we're consolidating
    if (range < avgVolatility * 0.5) {
      consolidationBars = recentBars.length;
    }
    
    return consolidationBars;
  }

  calculateTrendAge(historicalData) {
    // Determine how long current trend has been in place
    if (historicalData.length < 10) return 0;
    
    let trendAge = 0;
    const recentBars = historicalData.slice(-50);
    
    // Determine current trend direction
    const lastFewBars = recentBars.slice(-5);
    const avgRecentPnl = lastFewBars.reduce((sum, bar) => sum + (bar.pnl || 0), 0) / lastFewBars.length;
    const currentTrendBullish = avgRecentPnl > 0;
    
    // Count bars in same trend direction
    for (let i = recentBars.length - 1; i >= 0; i--) {
      const barBullish = (recentBars[i].pnl || 0) > 0;
      
      if (barBullish === currentTrendBullish) {
        trendAge++;
      } else {
        break;
      }
    }
    
    return trendAge;
  }

  calculateBreakoutSustainability(historicalData) {
    // Analyze historical breakout success rate
    let breakouts = 0;
    let sustainedBreakouts = 0;
    
    for (let i = 10; i < historicalData.length - 5; i++) {
      const bar = historicalData[i];
      const prevBars = historicalData.slice(i - 10, i);
      const nextBars = historicalData.slice(i + 1, i + 6);
      
      // Detect potential breakout (sudden move after consolidation)
      const prevVolatility = this.calculateAverageVolatility(prevBars);
      const currentMove = Math.abs(bar.pnl || 0);
      
      if (currentMove > prevVolatility * 2) {
        breakouts++;
        
        // Check if breakout sustained (continued in same direction)
        const sustainedInDirection = nextBars.filter(b => 
          Math.sign(b.pnl || 0) === Math.sign(bar.pnl || 0)
        ).length;
        
        if (sustainedInDirection >= 3) {
          sustainedBreakouts++;
        }
      }
    }
    
    return breakouts > 0 ? sustainedBreakouts / breakouts : 0.5;
  }

  calculateFalseBreakoutRate(historicalData) {
    return 1 - this.calculateBreakoutSustainability(historicalData);
  }

  calculateLevelAge(historicalData) {
    // Simplified: return average age of price levels
    return Math.min(historicalData.length, 20);
  }

  assessMarketRegime(historicalData) {
    // 0 = mean reversion, 1 = momentum
    const recentBars = historicalData.slice(-20);
    let momentumScore = 0;
    
    for (let i = 1; i < recentBars.length; i++) {
      const prev = recentBars[i - 1].pnl || 0;
      const curr = recentBars[i].pnl || 0;
      
      // If same direction as previous, add to momentum score
      if (Math.sign(prev) === Math.sign(curr) && Math.sign(curr) !== 0) {
        momentumScore++;
      }
    }
    
    return recentBars.length > 1 ? momentumScore / (recentBars.length - 1) : 0.5;
  }

  calculateRegimeChangeProb(historicalData) {
    // Look for signs of regime change (volatility shifts, correlation breaks)
    const recentVolatility = this.calculateAverageVolatility(historicalData.slice(-10));
    const historicalVolatility = this.calculateAverageVolatility(historicalData.slice(-50, -10));
    
    const volatilityRatio = historicalVolatility > 0 ? recentVolatility / historicalVolatility : 1;
    
    // Higher probability if volatility has changed significantly
    return Math.min(Math.abs(volatilityRatio - 1), 1);
  }

  calculateVolatilityRegimeAge(historicalData) {
    // Simplified: return how long current volatility level has persisted
    return Math.min(historicalData.length, 30);
  }

  calculateCorrelationBreakdown(historicalData) {
    // Placeholder for correlation analysis
    return 0.5;
  }

  assessMarketInternals(historicalData) {
    // Placeholder for market internals assessment
    return 0.5;
  }

  calculateAverageVolatility(bars) {
    if (bars.length === 0) return 0;
    
    const pnls = bars.map(bar => Math.abs(bar.pnl || 0));
    return pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length;
  }

  // Additional behavioral and duration context methods would go here...
  // (Implementation abbreviated for brevity)

  async analyzeTimeBasedPatterns(instrument, hour, dayOfWeek) {
    return {
      typicalHighTime: 0.6, // 60% through day
      typicalLowTime: 0.2,  // 20% through day
      sessionBias: 0.1      // Slight bullish bias
    };
  }

  analyzePriceAction(recentBars) {
    const prices = recentBars.map(bar => bar.pnl || 0);
    
    return {
      accelerationRate: this.calculateAcceleration(prices)
    };
  }

  calculateAcceleration(prices) {
    if (prices.length < 3) return 0;
    
    // Simple acceleration calculation
    const recent = prices.slice(-3);
    const change1 = recent[1] - recent[0];
    const change2 = recent[2] - recent[1];
    
    return change2 - change1;
  }

  analyzeVolumePattern(recentBars) {
    return {
      sustainability: 0.5 // Placeholder
    };
  }

  analyzeMomentum(recentBars) {
    return {
      persistence: 0.5 // Placeholder
    };
  }

  calculateSustainabilityComposite(priceAction, volumePattern, momentum, historicalData) {
    // Weighted composite of sustainability factors
    const weights = {
      priceAcceleration: 0.3,
      volumeSustainability: 0.3,
      momentumPersistence: 0.2,
      historicalSuccess: 0.2
    };
    
    const historicalSuccessRate = this.calculateRecentSuccessRate(
      historicalData.slice(-20).filter(bar => (bar.pnl || 0) !== 0)
    );
    
    return (
      priceAction.accelerationRate * weights.priceAcceleration +
      volumePattern.sustainability * weights.volumeSustainability +
      momentum.persistence * weights.momentumPersistence +
      historicalSuccessRate * weights.historicalSuccess
    );
  }

  // === DEFAULT CONTEXTS ===

  getDefaultContext() {
    return {
      ...this.getDefaultTemporalContext(),
      ...this.getDefaultBehavioralContext(),
      ...this.getDefaultDurationContext(),
      contextQuality: 0.1,
      dataPoints: 0
    };
  }

  getDefaultTemporalContext() {
    return {
      similar_setup_20bars_ago: 0,
      similar_setup_50bars_ago: 0,
      pattern_frequency_100bars: 0,
      pattern_success_rate_recent: 0.5,
      bullish_sequence_length: 0,
      bearish_sequence_length: 0,
      consolidation_duration: 0,
      trend_age_bars: 0,
      breakout_sustainability: 0.5,
      false_breakout_frequency: 0.5,
      support_resistance_age: 0,
      mean_reversion_vs_momentum: 0.5,
      regime_change_probability: 0.5,
      volatility_regime_age: 0,
      correlation_breakdown: 0,
      market_internals_strength: 0.5
    };
  }

  getDefaultBehavioralContext() {
    return {
      time_to_daily_high_typical: 0.5,
      time_to_daily_low_typical: 0.3,
      range_completion_pct: 0,
      session_bias_strength: 0,
      day_of_week_pattern: 0,
      week_of_month_effect: 0,
      pre_announcement_behavior: 0,
      post_announcement_continuation: 0,
      london_close_effect: 0,
      ny_open_effect: 0,
      typical_trend_duration: 15, // Default 15 minutes
      spike_reversion_probability: 0.3,
      momentum_decay_rate: 0.1,
      continuation_vs_reversal: 0.5,
      news_impact_duration: 10 // Default 10 minutes
    };
  }

  getDefaultDurationContext() {
    return {
      move_acceleration_rate: 0,
      volume_sustainability: 0.5,
      momentum_persistence: 0.5,
      trend_exhaustion_signals: 0,
      consolidation_breakout_power: 0.5,
      order_flow_imbalance_strength: 0,
      institutional_participation: 0,
      cross_timeframe_alignment: 0.5,
      volatility_expansion_rate: 0,
      price_efficiency_breakdown: 0,
      liquidity_conditions: 0.5,
      sentiment_shift_indicators: 0,
      seasonal_pattern_strength: 0,
      regime_persistence_score: 0.5,
      sustainability_composite: 0.5
    };
  }

  assessContextQuality(historicalData) {
    // Assess quality of context based on data availability
    if (historicalData.length < 20) return 0.2;
    if (historicalData.length < 50) return 0.5;
    if (historicalData.length < 100) return 0.7;
    return 0.9;
  }

  // Placeholder methods for additional functionality
  async getTypicalTrendDuration(instrument, hour) { return 20; }
  async getPreAnnouncementBehavior(instrument, timestamp) { return 0; }
  async getPostAnnouncementPattern(instrument) { return 0; }
  async getNewsImpactDuration(instrument) { return 10; }
  async assessCrossTimeframeAlignment(features) { return 0.5; }
  async getSeasonalStrength(historicalData) { return 0; }
  
  getDayOfWeekBias(instrument, dayOfWeek) { return 0; }
  getWeekOfMonthEffect(dayOfMonth) { return 0; }
  getSessionTransitionEffect(hour, session) { return 0; }
  calculateRangeCompletion(historicalData, hour) { return 0; }
  calculateSpikeReversionProb(historicalData) { return 0.3; }
  calculateMomentumDecayRate(historicalData) { return 0.1; }
  calculateContinuationOdds(historicalData) { return 0.5; }
  detectExhaustionSignals(recentBars) { return 0; }
  assessBreakoutPower(historicalData) { return 0.5; }
  calculateOrderFlowImbalance(recentBars) { return 0; }
  detectInstitutionalActivity(recentBars) { return 0; }
  calculateVolatilityExpansion(recentBars) { return 0; }
  assessPriceEfficiency(recentBars) { return 0; }
  assessLiquidityConditions(recentBars) { return 0.5; }
  detectSentimentShifts(historicalData) { return 0; }
  calculateRegimePersistence(historicalData) { return 0.5; }
}

module.exports = HistoricalContextEngine;