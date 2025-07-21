# Pruned Ranges Implementation

## Overview

The Pruned Ranges system is a revolutionary multi-dimensional clustering approach that prioritizes **equity curve stability** over profit maximization. Instead of traditional similarity matching, it dynamically discovers optimal feature combinations and validates strategy scalability across position sizes.

## Key Features

### 🎯 **Equity Curve Stability First**
- Prevents large swings in either direction (+$300 → -$300)
- Optimizes for smooth, consistent growth
- Early detection of strategy degradation

### 🔄 **Dynamic Feature Rotation**
- Tests feature combinations every 50 trades
- Automatically discovers which features matter NOW
- Adapts to changing market regimes

### 📏 **Scalability Validation** 
- Tests strategies at 1x, 2x, 5x, 10x position sizes
- Accounts for slippage and liquidity constraints
- Only recommends strategies that scale safely

### 🌊 **Regime Change Detection**
- Monitors cluster quality degradation
- Switches to exploration mode when needed
- Prevents following broken strategies too long

### 📊 **Comprehensive Audit Logging**
- Every decision logged for offline review
- Performance analysis and recommendations
- Complete transparency for strategy debugging

## Architecture

```
Query Features → PrunedRangesEngine → Multi-dimensional Analysis
                                   ↓
                            Feature Rotation
                            Cluster Quality Assessment  
                            Scalability Testing
                            Regime Change Detection
                                   ↓
                            Risk Parameters + Confidence
```

## Installation

1. **Install Dependencies**
```bash
cd /mnt/c/workspace/FluidJournal/agentic_memory/risk-service
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env to enable pruned ranges
ENABLE_PRUNED_RANGES=true
```

3. **Start Service**
```bash
npm start
```

## Usage

### Enable Pruned Ranges

Set environment variable:
```bash
ENABLE_PRUNED_RANGES=true
```

The system will automatically:
- Start with balanced 3-5 feature combinations
- Rotate features every 50 trade evaluations
- Test scalability for each request
- Log all decisions to `audit_logs/`

### API Integration

The system integrates transparently with existing Risk Agent endpoints:

```bash
POST /api/evaluate-risk
{
  "features": { /* 94+ market features */ },
  "instrument": "MGC",
  "direction": "long", 
  "quantity": 5
}
```

Response includes pruned ranges analysis:
```json
{
  "method": "pruned_ranges",
  "confidence": 0.75,
  "suggested_sl": 18,
  "suggested_tp": 35,
  "prunedRangesDetails": {
    "clusterQuality": 0.823,
    "scalability": { "canScale": true, "maxSafeScale": 10 },
    "regimeChange": false,
    "featureCombination": ["atr_percentage", "volume_delta", "rsi_14"],
    "processingTime": 45
  }
}
```

## A/B Testing

The system supports 3-way A/B testing:
- 33% traffic → Gaussian Process
- 33% traffic → Pruned Ranges  
- 34% traffic → Graduated Ranges (default)

Enable with:
```bash
ENABLE_AB_TESTING=true
```

## Monitoring & Analysis

### Real-time Monitoring
All decisions are logged with detailed context:
```bash
tail -f audit_logs/pruned_ranges_2025-01-20.jsonl
```

### Offline Analysis
Comprehensive analysis tool:
```bash
node analyzeAuditLogs.js 2025-01-20
```

Provides:
- ✅ System performance summary
- 📈 Clustering effectiveness metrics  
- 🔄 Feature rotation analysis
- 📏 Scalability success rates
- 🌊 Regime change detection accuracy
- 💡 Actionable recommendations

### Key Metrics to Monitor

1. **Cluster Quality**: Should average > 0.6
2. **Approval Rate**: Target 60-80% for healthy exploration
3. **Scalability Success**: >80% strategies should scale to 5x
4. **Processing Time**: Should stay < 200ms
5. **Regime Changes**: 1-3 per week is normal

## Configuration

### Core Parameters
```javascript
{
  sessionWindowSize: 100,      // Trades to analyze for regime detection
  rotationInterval: 50,        // Feature rotation frequency  
  minClusterSize: 5,          // Minimum trades per cluster
  maxCombinations: 20,        // Feature combinations to test
  scalabilityMultipliers: [1, 2, 5, 10],  // Position sizes to validate
  clusterQualityThreshold: 0.6,           // Minimum acceptable quality
  regimeChangeThreshold: 0.3              // Quality drop indicating regime change
}
```

### Feature Combinations

The system tests combinations from these groups:
- **Technical**: ATR, RSI, Bollinger Bands, MACD
- **Volume**: Volume delta, ratios, spikes
- **Price**: Wick ratios, body ratios, price levels
- **Time**: Time of day, session, day of week
- **Pattern**: Inside bars, outside bars, doji patterns

## Troubleshooting

### Common Issues

**1. Low Cluster Quality**
```bash
# Check if sufficient data exists
grep "insufficient_data" audit_logs/*.jsonl

# Solution: Reduce minClusterSize or collect more data
```

**2. No Feature Rotations**
```bash
# Check rotation logs
grep "COMBINATION_CHANGED" audit_logs/*.jsonl

# Solution: Verify rotationInterval setting
```

**3. Poor Scalability**
```bash
# Analyze scalability failures
node analyzeAuditLogs.js | grep -A 10 "SCALABILITY"

# Solution: Review liquidity constraints
```

**4. High Processing Times**
```bash
# Monitor processing performance
grep "processingTime" audit_logs/*.jsonl | tail -20

# Solution: Optimize cluster algorithms or reduce combinations
```

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug npm start
```

### Fallback Behavior

If pruned ranges fails, system automatically falls back to graduated ranges:
```bash
grep "graduated_ranges_fallback" logs/*.log
```

## Performance Expectations

### Target Metrics
- **Equity Curve Volatility**: 50% reduction vs existing system
- **Maximum Drawdown**: Limit to -$100 vs current -$300+
- **Strategy Scalability**: 90% success at 5x position size
- **Processing Speed**: < 200ms per evaluation
- **Regime Detection**: 20+ trades earlier than current system

### Success Indicators

✅ **Smooth equity curves** without dramatic swings  
✅ **Early regime change detection** preventing major losses  
✅ **Consistent scalability** across position sizes  
✅ **Dynamic adaptation** to changing market conditions  
✅ **Complete auditability** of all decisions

## Next Steps

1. **Monitor Performance**: Watch equity curve smoothness vs previous system
2. **Analyze Logs**: Daily review using `analyzeAuditLogs.js`
3. **Tune Parameters**: Adjust thresholds based on market conditions
4. **Scale Testing**: Gradually increase position sizes as confidence builds
5. **Feature Engineering**: Add new feature combinations based on market insights

## Support

- **Audit Logs**: `audit_logs/pruned_ranges_YYYY-MM-DD.jsonl`
- **Analysis Tool**: `node analyzeAuditLogs.js`
- **Configuration**: `.env` file settings
- **Monitoring**: Real-time console output during trading

---

*"The goal is not to be right about the market, but to maintain steady growth while the market reveals itself."*