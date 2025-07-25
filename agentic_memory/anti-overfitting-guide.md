# Anti-Overfitting System Guide

## Overview

The Anti-Overfitting System prevents the agentic memory from overfitting to repeated patterns during backtests and live trading. It implements diminishing returns for pattern exposure and provides backtest isolation controls.

## Key Features

### 1. Diminishing Returns
- **Pattern Exposure Tracking**: Each pattern (entrySignalId) is tracked for how many times it's been used
- **Exponential Decay**: Confidence reduces by `diminishingFactor^exposure` (default 0.8)
- **Example**: Pattern used 3 times → confidence multiplied by 0.8³ = 0.512 (48.8% reduction)

### 2. Backtest Isolation
- **Training/Testing Separation**: Prevents data leakage between training (≤2024) and testing (>2024) data
- **Learning Reset**: Option to reset pattern exposure when starting new backtests
- **Date Range Control**: Only allows patterns within backtest date range

### 3. Time Window Clustering
- **Clustering Penalty**: Patterns seen multiple times in same hour get 30% confidence penalty
- **Prevents Overfitting**: Reduces impact of clustered patterns from same market conditions

## Usage

### Starting a Backtest

```javascript
// Start backtest with learning reset (recommended for clean tests)
POST /api/backtest/start
{
  "startDate": "2025-01-01T00:00:00Z",
  "endDate": "2025-01-31T23:59:59Z",
  "resetLearning": true  // Reset pattern exposure tracking
}

// Start backtest with persistent learning (for continuous improvement)
POST /api/backtest/start
{
  "startDate": "2025-01-01T00:00:00Z", 
  "endDate": "2025-01-31T23:59:59Z",
  "resetLearning": false  // Keep existing pattern exposure
}
```

### Ending a Backtest

```javascript
POST /api/backtest/end
// Returns statistics about patterns used, exposure rates, etc.
```

### Configuration

```javascript
POST /api/anti-overfitting/configure
{
  "maxExposureCount": 5,      // Maximum pattern usage before heavy penalty
  "diminishingFactor": 0.8,   // Confidence reduction per exposure (0.8 = 20% reduction)
  "timeWindowMinutes": 60     // Time window for clustering detection
}
```

### Monitoring

```javascript
GET /api/anti-overfitting/stats
// Returns:
// - Current backtest status
// - Pattern exposure distribution  
// - Average exposure per pattern
// - Over-exposed patterns count
```

## How It Works

### 1. Pattern Evaluation Flow

```
Query Pattern → Check Backtest Isolation → Check Data Leakage → 
Calculate Exposure → Apply Diminishing Returns → Check Clustering → 
Final Decision (Allow/Block)
```

### 2. Confidence Adjustments

**Original Confidence**: 0.8 (80%)
- **1st Exposure**: 0.8 × 1.0 = 0.8 (no penalty)
- **2nd Exposure**: 0.8 × 0.8 = 0.64 (20% reduction)
- **3rd Exposure**: 0.8 × 0.64 = 0.512 (36% reduction)
- **5th Exposure**: 0.8 × 0.32 = 0.256 (68% reduction)

### 3. Blocking Conditions

Patterns are blocked when:
- **Data Leakage**: Using future data in training
- **Out of Range**: Pattern outside backtest date range
- **Minimum Threshold**: Final confidence < 0.1 (10%)

## Integration Points

### Enhanced Vector Store
- **Duration Prediction**: Anti-overfitting applied to `/api/predict-duration`
- **Similarity Search**: Patterns filtered before analysis
- **Confidence Scoring**: Base confidence adjusted for exposure

### Risk Service  
- **Range-Based Confidence**: Anti-overfitting integrated into graduation analysis
- **Memory Manager**: Backtest controls available in memory management
- **Pattern Evaluation**: All pattern evaluations include exposure tracking

### NinjaTrader Integration
- **Transparent**: No changes needed to NT - adjustments happen server-side
- **Real-time**: Pattern exposure tracked as trades execute
- **Feedback**: Confidence adjustments visible in risk service responses

## Best Practices

### For Backtesting
1. **Always Reset Learning**: Use `resetLearning: true` for clean backtests
2. **Test Realistic Periods**: Use continuous date ranges, not cherry-picked dates
3. **Monitor Exposure**: Check `/api/anti-overfitting/stats` for over-exposed patterns
4. **Separate Training/Testing**: Train on pre-2025, test on 2025+ data

### For Live Trading
1. **Persistent Learning**: Use `resetLearning: false` to maintain experience
2. **Regular Monitoring**: Check exposure distribution weekly
3. **Tune Parameters**: Adjust `diminishingFactor` based on market conditions
4. **Clean Resets**: Occasionally reset exposure for fresh start

### Configuration Guidelines
- **Conservative**: `diminishingFactor: 0.7` (stronger penalty)
- **Moderate**: `diminishingFactor: 0.8` (balanced approach)
- **Aggressive**: `diminishingFactor: 0.9` (lighter penalty)

## Troubleshooting

### High Pattern Filtering
**Problem**: Too many patterns filtered, insufficient data for decisions
**Solution**: 
- Increase `diminishingFactor` (0.8 → 0.9)
- Reduce `timeWindowMinutes` (60 → 30)
- Check if backtest date range is too restrictive

### Low Confidence Scores
**Problem**: All patterns showing very low confidence
**Solution**:
- Reset pattern exposure: `POST /api/backtest/start` with `resetLearning: true`
- Check for over-exposed patterns in stats
- Verify backtest dates don't conflict with training data

### Data Leakage Errors
**Problem**: Patterns blocked for data leakage
**Solution**:
- Ensure training data is ≤ 2024-12-31
- Check backtest start date isn't before pattern timestamps
- Verify timestamp accuracy in stored vectors

## Example Usage Scenarios

### Scenario 1: Clean Backtest
```javascript
// 1. Start isolated backtest
await fetch('/api/backtest/start', {
  method: 'POST',
  body: JSON.stringify({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-01-15T23:59:59Z', 
    resetLearning: true
  })
});

// 2. Run backtest (patterns automatically filtered)
// 3. End backtest and get stats
const stats = await fetch('/api/backtest/end', { method: 'POST' });
```

### Scenario 2: Continuous Learning
```javascript
// 1. Configure for light penalty
await fetch('/api/anti-overfitting/configure', {
  method: 'POST',
  body: JSON.stringify({
    diminishingFactor: 0.9,
    maxExposureCount: 10
  })
});

// 2. Start persistent learning backtest
await fetch('/api/backtest/start', {
  method: 'POST', 
  body: JSON.stringify({
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2025-02-01T23:59:59Z',
    resetLearning: false  // Keep learning
  })
});
```

### Scenario 3: Monitor Live Trading
```javascript
// Check exposure stats periodically
const stats = await fetch('/api/anti-overfitting/stats');
console.log('Patterns tracked:', stats.exposureReport.totalPatterns);
console.log('Average exposure:', stats.exposureReport.averageExposure);
console.log('Over-exposed patterns:', stats.exposureReport.overExposedPatterns);
```

## Technical Details

### Storage Schema
Pattern exposure is tracked in memory (not persisted) with:
- `patternExposureMap`: entrySignalId → exposure count
- `timeWindowExposure`: time window → Set of pattern IDs
- `backtestContext`: Current backtest metadata

### Performance Impact
- **Memory Usage**: ~1KB per 1000 tracked patterns
- **CPU Overhead**: ~0.1ms per pattern evaluation
- **Network**: No additional API calls

### Thread Safety
- All operations are single-threaded (Node.js event loop)
- No race conditions or locking needed
- State changes are atomic

## Logging

Anti-overfitting actions are logged with `[ANTI-OVERFITTING]` prefix:
- Pattern usage tracking
- Confidence adjustments
- Backtest start/end events
- Configuration changes
- Pattern filtering decisions

Monitor logs to understand system behavior and tune parameters accordingly.