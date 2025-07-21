# Pruned Ranges Implementation Plan

## Executive Summary

Transform the current graduated_ranges system into a dynamic multi-dimensional clustering approach that prioritizes equity curve stability over profit maximization, with built-in scalability validation.

## Phase 1: Foundation (Week 1)

### Task 1.1: Create Pruned Ranges Engine
**Location**: `/agentic_memory/risk-service/prunedRangesEngine.js`

```javascript
class PrunedRangesEngine {
    constructor() {
        this.featureCombinations = [];
        this.currentOptimalCombo = null;
        this.sessionPerformance = [];
        this.clusterQualityHistory = [];
    }
    
    // Core methods
    evaluateClusterQuality(features, trades) {}
    rotateFeatureCombinations() {}
    detectRegimeChange() {}
    validateScalability(combo, multipliers) {}
}
```

### Task 1.2: Feature Variability Analysis
**Purpose**: Identify which features have the most variability for clustering

- Calculate coefficient of variation for each feature
- Rank features by information content
- Create initial feature combination pools
- Store variability metrics for rotation decisions

### Task 1.3: Session Performance Tracker
**Purpose**: Track last 100 trades for regime detection

- Implement rolling window of trade outcomes
- Calculate trajectory metrics (drawdown, volatility, trend)
- Detect equity curve quality degradation
- Flag when strategy needs exploration mode

## Phase 2: Multi-Dimensional Clustering (Week 2)

### Task 2.1: Implement Clustering Algorithms
**Options to implement and test**:

1. **DBSCAN** - For irregular profit zones
2. **K-Means with Elbow Method** - For clear cluster counts
3. **Gaussian Mixture Models** - For probabilistic membership

### Task 2.2: Cluster Quality Scoring
**Metrics to implement**:

```javascript
clusterQualityMetrics = {
    silhouetteScore: 0.0,      // Cluster separation
    calinskiHarabasz: 0.0,      // Between/within variance
    profitDensity: 0.0,         // Avg PnL per cluster volume
    temporalStability: 0.0,     // Consistency over time
    scalabilityScore: 0.0       // Maintains quality at 10x
}
```

### Task 2.3: Feature Combination Rotation
**Rotation strategy**:

- Test 3-5 feature combinations every 50 trades
- Score each combination using cluster quality metrics
- Switch to best performing combination
- Maintain history of what worked when

## Phase 3: Scalability Integration (Week 3)

### Task 3.1: Multiplier Testing Framework
**Test each cluster at multiple scales**:

```javascript
function testScalability(clusterConfig, trades) {
    const multipliers = [1, 2, 5, 10];
    const results = {};
    
    for (const mult of multipliers) {
        // Scale PnL and test cluster stability
        // Calculate slippage impact
        // Measure cluster quality degradation
        results[mult] = calculateDegradation();
    }
    
    return maxSafeMultiplier(results);
}
```

### Task 3.2: Position Size Recommendations
**Dynamic sizing based on cluster confidence**:

- High quality cluster + good scalability = larger positions
- Degrading clusters = reduce position size
- Exploration mode = minimum positions
- Scale validation before size increase

### Task 3.3: Risk Parameter Adjustment
**Cluster-aware risk management**:

- Tight clusters = standard SL/TP
- Dispersed clusters = wider stops
- Multi-modal clusters = avoid entry
- Scale-dependent adjustments

## Phase 4: Integration & Testing (Week 4)

### Task 4.1: Risk Agent Integration
**Modify risk-service to use pruned_ranges**:

```javascript
// In server.js /api/evaluate-risk endpoint
if (USE_PRUNED_RANGES) {
    const prunedAnalysis = prunedRangesEngine.analyze(
        features, 
        recentTrades,
        requestedScale
    );
    
    if (prunedAnalysis.regimeChangeDetected) {
        // Switch to exploration mode
    }
    
    return {
        method: 'pruned_ranges',
        cluster: prunedAnalysis.cluster,
        confidence: prunedAnalysis.confidence,
        maxSafeScale: prunedAnalysis.scalability,
        riskParams: prunedAnalysis.adjustedRisk
    };
}
```

### Task 4.2: Performance Monitoring
**Real-time monitoring of pruned_ranges**:

- Log cluster quality scores
- Track feature combination performance
- Monitor equity curve smoothness
- Alert on regime changes

### Task 4.3: A/B Testing Framework
**Compare pruned_ranges vs graduated_ranges**:

- Run both systems in parallel
- Track key metrics:
  - Equity curve volatility
  - Maximum drawdown
  - Win rate stability
  - Scalability success
- Statistical significance testing

## Phase 5: Optimization & Tuning (Week 5)

### Task 5.1: Cluster Algorithm Selection
**Based on A/B test results**:

- Choose best performing clustering algorithm
- Optimize hyperparameters
- Implement fast approximations for real-time use
- Cache cluster calculations

### Task 5.2: Feature Combination Optimization
**Learn optimal feature sets**:

- Track which combinations work in which market conditions
- Build lookup table of regime → features
- Implement smart rotation scheduling
- Reduce computational overhead

### Task 5.3: Production Hardening
**Prepare for live trading**:

- Add circuit breakers for extreme conditions
- Implement graceful degradation
- Add comprehensive logging
- Create monitoring dashboard

## Success Metrics

### Primary Goals
1. **Reduce equity curve volatility by 50%**
2. **Maintain profitability within 80% of current**
3. **Achieve 90% strategy scalability to 10x positions**
4. **Detect regime changes 20+ trades earlier**

### Key Performance Indicators
- Sharpe ratio improvement
- Maximum drawdown reduction
- Consistency across position sizes
- Early warning accuracy

## Technical Requirements

### Dependencies
```json
{
  "ml-kmeans": "^4.2.1",
  "ml-pca": "^4.0.2",
  "simple-statistics": "^7.8.0",
  "ml-distance": "^4.0.0"
}
```

### Performance Targets
- Clustering calculation: < 50ms
- Feature rotation: < 100ms  
- Full analysis: < 200ms
- Memory usage: < 100MB

## Risk Mitigation

### Potential Issues
1. **Over-clustering**: Too many micro-clusters
   - Solution: Minimum cluster size requirements
   
2. **Computational overhead**: Slow real-time decisions
   - Solution: Caching and approximations
   
3. **Feature combination explosion**: Too many combinations
   - Solution: Guided search based on correlation
   
4. **Regime change false positives**: Too sensitive
   - Solution: Confirmation over multiple evaluations

## Implementation Timeline

- **Week 1**: Foundation components
- **Week 2**: Clustering implementation
- **Week 3**: Scalability features
- **Week 4**: Integration and testing
- **Week 5**: Optimization and production prep

## Next Steps

1. Review and approve plan
2. Set up development environment
3. Create test data for clustering experiments
4. Begin Phase 1 implementation

---

*"The goal is not to be right about the market, but to maintain steady growth while the market reveals itself."*