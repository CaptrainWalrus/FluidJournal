# Pruned Ranges Implementation Plan V2

## Executive Summary

Build a robust N-dimensional clustering system that finds **wide gradient profitable zones** rather than narrow optimal points. Use existing graduated_ranges data to discover resilient strategy conditions that maintain performance across varying market environments.

## Core Philosophy

**Goal**: Find clusters with HIGH profitability + HIGH variability + HIGH consistency  
**Not**: Find peak performance outliers with narrow requirements  
**Why**: Robust profitable zones survive market regime changes better than brittle optimal points

## Phase 1: Robust Cluster Detection (Week 1)

### Task 1.1: Data Pipeline from Graduated Ranges
**Source**: Use existing `memoryManager.getGraduationTable()` data - thousands of vectors available

```javascript
// CORRECT data access pattern matching current implementation
async getGraduatedData(instrument, direction) {
    // Normalize instrument name (MGC AUG25 -> MGC) to match graduation table keys
    const normalizedInstrument = memoryManager.normalizeInstrumentName(instrument);
    const graduationTable = memoryManager.getGraduationTable(normalizedInstrument, direction);
    
    if (!graduationTable || !graduationTable.features) {
        console.log(`[PRUNED-RANGES] No graduation data for ${normalizedInstrument}_${direction}`);
        return null;
    }
    
    // Get the actual vector data for this instrument+direction
    const vectorData = memoryManager.getVectorsForInstrumentDirection(normalizedInstrument, direction);
    const featureNames = graduationTable.features.map(f => f.name); // Pre-selected optimal features
    
    return { vectorData, featureNames, graduationTable };
}
```

### Task 1.2: Robust Clustering Algorithm
**Replace**: Fake silhouette/stability metrics  
**With**: Real gradient analysis within clusters

```javascript
class RobustClusterAnalyzer {
    analyzeCluster(cluster) {
        return {
            profitability: calculateAvgProfit(cluster),
            variability: calculateFeatureVariance(cluster),     // HIGH = good
            consistency: calculateProfitStability(cluster),     // Profit despite variation
            robustness: calculateGradientTolerance(cluster),    // Wide profitable ranges
            sampleSize: cluster.length
        };
    }
}
```

### Task 1.3: Gradient Tolerance Calculation
**Key Innovation**: Measure how much features can vary while maintaining profitability

```javascript
calculateGradientTolerance(cluster, featureNames) {
    // Use normalized PnL for fair comparison across position sizes
    const profitable = cluster.filter(trade => (trade.pnlPerContract || trade.pnl || 0) > 10);
    
    if (profitable.length < 10) return 0; // Insufficient profitable trades
    
    // For each graduated feature, calculate the range within profitable trades
    const featureRanges = {};
    for (const featureName of featureNames) {
        const values = profitable
            .map(trade => {
                try {
                    const features = JSON.parse(trade.featuresJson || '{}');
                    return features[featureName];
                } catch (e) {
                    return null;
                }
            })
            .filter(val => typeof val === 'number' && !isNaN(val));
        
        if (values.length > 0) {
            featureRanges[featureName] = {
                min: Math.min(...values),
                max: Math.max(...values),
                range: Math.max(...values) - Math.min(...values),
                stdDev: calculateStandardDeviation(values)
            };
        }
    }
    
    // Wider ranges = more robust cluster (gradient tolerance)
    return calculateAverageRangeWidth(featureRanges);
}

// Data access pattern matches current vectorStore structure:
// trade.featuresJson contains: "{\"atr_percentage\": 0.025, \"rsi_14\": 67, ...}"
// trade.pnlPerContract contains normalized per-contract PnL values
```
```

## Phase 2: N-Dimensional Zone Discovery (Week 2)

### Task 2.1: Multi-Dimensional Cluster Scoring
**Score clusters by**: Profitability × Variability × Consistency

```javascript
scoreCluster(cluster) {
    const profit = normalizeProfit(cluster.avgPnl);           // 0-1 scale
    const variance = normalizeVariance(cluster.featureVar);    // 0-1 scale, HIGH = good
    const consistency = cluster.profitStability;              // 0-1 scale
    const sample = Math.min(cluster.size / 100, 1.0);        // Bonus for large samples
    
    return profit * variance * consistency * sample;
}
```

### Task 2.2: Feature Range Validation
**For each winning cluster**: Define acceptable feature ranges

```javascript
defineClusterZone(cluster) {
    const zone = {};
    for (const feature of features) {
        const profitableValues = cluster.profitable.map(t => t.features[feature]);
        zone[feature] = {
            optimal: percentileRange(profitableValues, 25, 75),    // Q1-Q3
            acceptable: percentileRange(profitableValues, 10, 90), // P10-P90
            tolerance: calculateStdDev(profitableValues)
        };
    }
    return zone;
}
```

### Task 2.3: Zone Membership Testing
**Replace similarity matching** with zone membership

```javascript
testZoneMembership(queryFeatures, zone) {
    let score = 0;
    let validFeatures = 0;
    
    // queryFeatures comes from NinjaTrader via req.body.features
    // Expected format: { atr_percentage: 0.025, rsi_14: 67, volume_delta: 1200, ... }
    for (const [featureName, featureValue] of Object.entries(queryFeatures)) {
        if (!zone[featureName] || typeof featureValue !== 'number') continue;
        
        const membership = calculateMembershipScore(featureValue, zone[featureName]);
        score += membership;
        validFeatures++;
    }
    
    return validFeatures > 0 ? score / validFeatures : 0;
}

calculateMembershipScore(value, zoneRange) {
    if (value >= zoneRange.optimal.min && value <= zoneRange.optimal.max) {
        return 1.0; // Perfect membership in optimal zone
    } else if (value >= zoneRange.acceptable.min && value <= zoneRange.acceptable.max) {
        return 0.6; // Acceptable membership
    } else {
        // Calculate proximity to acceptable range
        const distanceToRange = Math.min(
            Math.abs(value - zoneRange.acceptable.min),
            Math.abs(value - zoneRange.acceptable.max)
        );
        return Math.max(0.1, 0.5 * Math.exp(-distanceToRange / zoneRange.tolerance));
    }
}
```

## Phase 3: Equity Curve Integration (Week 3)

### Task 3.1: Performance Trajectory Tracking
**Monitor cluster performance over time** - not just individual trades

```javascript
class EquityCurveMonitor {
    trackClusterPerformance(clusterZone, recentTrades) {
        const trajectory = this.calculateTrajectory(clusterZone, recentTrades);
        return {
            trend: trajectory.slope,              // Upward/downward progression  
            volatility: trajectory.variance,      // Equity curve smoothness
            drawdown: trajectory.maxDrawdown,     // Recent peak-to-trough
            efficiency: trajectory.profitFactor   // Win/loss ratio
        };
    }
}
```

### Task 3.2: Zone Degradation Detection
**Detect when current zone stops working**

```javascript
detectZoneDegradation(zone, recentPerformance) {
    const indicators = {
        profitDecline: recentPerformance.avgProfit < zone.historicalAvg * 0.7,
        volatilityIncrease: recentPerformance.volatility > zone.historicalVol * 1.5,
        drawdownExcess: recentPerformance.drawdown > zone.maxAcceptableDD,
        sampleDiversity: recentPerformance.featureSpread < zone.requiredSpread
    };
    
    const degradationCount = Object.values(indicators).filter(Boolean).length;
    return degradationCount >= 2; // Multiple signals = zone degradation
}
```

### Task 3.3: Zone Exploration Mode
**When degradation detected**: Systematically explore alternative zones

```javascript
exploreAlternativeZones(currentZone, graduatedData) {
    // Find clusters with different characteristics but similar base performance
    const alternatives = this.findAlternativeZones(graduatedData);
    
    // Test each alternative with recent market conditions
    const candidates = alternatives.map(zone => ({
        zone,
        compatibility: this.testZoneCompatibility(zone, recentMarketData),
        robustness: this.scoreZoneRobustness(zone)
    }));
    
    // Return highest scoring alternative
    return candidates.sort((a, b) => b.robustness - a.robustness)[0];
}
```

## Phase 4: Implementation Integration (Week 4)

### Task 4.1: Replace Current Clustering Logic
**File**: `prunedRangesEngine.js`

```javascript
// REMOVE: Fake silhouette/stability metrics
// REMOVE: K-means with profit separation
// REMOVE: Complex multi-axis confidence calculation

// ADD: Robust zone detection
// ADD: Gradient tolerance analysis  
// ADD: Zone membership scoring
```

### Task 4.2: Simplified Confidence Calculation
**Single metric**: Zone membership score × Zone robustness

```javascript
// Integration point in server.js /api/evaluate-risk endpoint
calculatePrunedRangesConfidence(features, instrument, direction) {
    // Get graduated data for this instrument+direction pair
    const graduatedData = this.getGraduatedData(instrument, direction);
    if (!graduatedData) {
        return 0.5; // Fallback when no graduation data available
    }
    
    // Find best zone from graduated vector data
    const bestZone = this.findBestZone(graduatedData.vectorData, graduatedData.featureNames);
    
    // Test query features against zone
    const membership = this.testZoneMembership(features, bestZone);
    const robustness = bestZone.robustnessScore;
    
    return Math.max(0.1, Math.min(0.9, membership * robustness)); // Bounded confidence
}

// Expected data flow:
// NT → req.body.features (object) → testZoneMembership → confidence → response
// req.body = { features: {atr_percentage: 0.025, ...}, instrument: "MGC", direction: "long" }
```

### Task 4.3: Zone-Based Risk Parameters
**Adjust risk based on zone characteristics**

```javascript
calculateZoneRisk(zone, membershipScore) {
    const baseRisk = zone.averageRisk;
    
    if (membershipScore > 0.8) {
        // High confidence in robust zone - standard risk
        return baseRisk;
    } else if (membershipScore > 0.5) {
        // Moderate confidence - reduce risk
        return baseRisk * 0.7;
    } else {
        // Low confidence - exploration mode risk
        return baseRisk * 0.5;
    }
}
```

## Success Metrics

### Primary Goals
1. **Zone Robustness**: Clusters maintain performance across 20+ feature variations
2. **Equity Curve Stability**: 50% reduction in volatility vs current system  
3. **Consistent Performance**: 80%+ trades fall within defined profitable zones
4. **Regime Adaptability**: System finds new zones within 10 trades of degradation

### Key Performance Indicators
- Zone membership accuracy (% of profitable trades in predicted zones)
- Feature range width (wider = more robust)
- Equity curve smoothness (measured drawdown reduction)
- Zone discovery speed (time to find alternative when current fails)

## Technical Requirements

### Core Dependencies
```json
{
  "simple-statistics": "^7.8.0",    // Percentile calculations
  "ml-distance": "^4.0.0"          // Distance metrics for zones
}
```

### Performance Targets
- Zone analysis: < 100ms
- Membership testing: < 50ms  
- Zone discovery: < 200ms
- Memory usage: < 50MB (use graduated data efficiently)

## Implementation Notes

### Data Flow
```
1. NinjaTrader → req.body.features (object with named features)
2. Server.js → memoryManager.getGraduationTable(normalizedInstrument, direction) 
3. MemoryManager → returns graduationTable.features (pre-selected optimal features)
4. MemoryManager → getVectorsForInstrumentDirection() (trade data with featuresJson)
5. PrunedRanges → analyzeZones(vectorData, featureNames) 
6. PrunedRanges → testZoneMembership(req.body.features, bestZone)
7. Server.js → response with confidence + risk parameters
```

### Expected Data Formats
```javascript
// Input from NinjaTrader (req.body):
{
  features: { atr_percentage: 0.025, rsi_14: 67, volume_delta: 1200, ... },
  instrument: "MGC", // or "MGC AUG25" - gets normalized to "MGC"
  direction: "long",
  timestamp: 1641234567890
}

// Vector data from LanceDB (trade.featuresJson):
"{\"atr_percentage\": 0.025, \"rsi_14\": 67, \"volume_delta\": 1200, ...}"

// Graduation table features (graduationTable.features):
[{ name: "atr_percentage", importance: 0.8 }, { name: "rsi_14", importance: 0.7 }, ...]
```

### Key Simplifications
- **Remove**: Complex multi-axis calculations
- **Remove**: Fake clustering metrics  
- **Remove**: Insufficient data fallbacks
- **Add**: Simple, robust zone-based logic
- **Add**: Real gradient tolerance analysis

### Monitoring
- Log zone performance over time
- Track zone membership distribution
- Monitor equity curve progression
- Alert on zone degradation events

---

*"Find the wide profitable valleys, not the narrow profitable peaks."*