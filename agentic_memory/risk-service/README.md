# Risk Management Agent

The Risk Management Agent is the intelligent decision-making component of the Agentic Memory system, providing adaptive risk parameters based on historical pattern analysis.

## Overview

This service analyzes incoming trade signals against historical patterns stored in the Storage Agent, calculates optimal stop-loss and take-profit levels, and provides confidence scores for trade decisions. It implements multiple sophisticated approaches including graduated ranges, Gaussian processes, and pruned ranges.

## Features

- **Graduated Feature Matching**: Uses only the most predictive features for similarity search
- **Range-Based Intelligence**: Identifies optimal feature ranges from profitable trades
- **Anti-Overfitting Protection**: Tracks pattern usage with exponential confidence decay
- **Multiple Risk Engines**: Graduated ranges, Gaussian processes, pruned ranges, robust zones
- **Recent Trade Analysis**: Prevents repeating recent mistakes
- **Instrument-Specific Learning**: Maintains separate models per instrument/direction
- **A/B Testing Framework**: Compare different risk approaches in production
- **Position Size Normalization**: All calculations use per-contract values

## API Endpoints

### POST /api/evaluate-risk
Evaluate risk for a new trade signal (used by NinjaTrader directly).

**Request Body:**
```json
{
  "features": {
    "atr_percentage": 0.025,
    "volume_delta": 1500,
    "rsi_14": 45.5,
    // ... 94+ features
  },
  "instrument": "MGC",
  "direction": "long",
  "timestamp": 1641234567890,
  "quantity": 2,
  "antiOverfittingParams": {
    "enabled": true,
    "maxPatternExposure": 3,
    "timeWindow": 15,
    "diminishingFactor": 0.6
  }
}
```

**Response:**
```json
{
  "approved": true,
  "confidence": 0.82,
  "suggested_sl": 18.5,
  "suggested_tp": 32.0,
  "method": "graduated_ranges",
  "reasons": [
    "Favorable setup detected. Found 15 winning patterns averaging $125 profit",
    "Recent success rate: 73% in similar conditions"
  ],
  "graduatedFeatures": {
    "atr_percentage": { "optimal": [0.019, 0.034], "confidence": 0.85 },
    "volume_delta": { "optimal": [1200, 1800], "confidence": 0.90 }
  },
  "patternExposure": {
    "currentExposure": 1,
    "maxExposure": 3,
    "confidenceMultiplier": 1.0
  }
}
```

### POST /api/approve-signal
Legacy endpoint for signal approval (used by CurvesStrategy).

### GET /api/graduations
View current graduated feature tables for all instruments.

**Response:**
```json
{
  "MGC_long": {
    "graduatedFeatures": ["atr_percentage", "volume_delta", "rsi_14"],
    "lastUpdate": "2025-01-25T10:30:00Z",
    "sampleSize": 150
  }
}
```

### GET /api/analyze-trades/:instrument
Analyze historical trade patterns for insights.

**Query Parameters:**
- `days`: Number of days to analyze (default: 7)
- `direction`: Filter by direction (long/short)

### GET /health
Health check endpoint.

## Risk Calculation Methods

### 1. Graduated Ranges (Default)
- Analyzes profitable vs unprofitable trades
- Calculates optimal feature ranges (Q25-Q75)
- Provides confidence based on how query fits ranges
- Updates every 30 minutes based on bar time

### 2. Gaussian Process (Optional)
- Probabilistic uncertainty modeling
- Multi-output trajectory prediction
- Requires Python GP service running
- Enable with: `ENABLE_GP=true`

### 3. Pruned Ranges (Experimental)
- Focuses on equity curve stability
- Dynamic feature rotation every 50 trades
- Scalability validation across position sizes
- Enable with: `ENABLE_PRUNED_RANGES=true`

### 4. Robust Zones (Experimental)
- Multiple overlapping zone validation
- Historical win/loss zone mapping
- Enable with: `ENABLE_ROBUST_ZONES=true`

## Anti-Overfitting Protection

The service implements multiple layers of protection:

1. **Pattern Exposure Tracking**: Counts how many times each pattern is used
2. **Exponential Decay**: `confidence × diminishingFactor^exposure`
3. **Time Windows**: Clusters patterns within time periods
4. **Maximum Exposure**: Hard cap on pattern reuse

Example decay with diminishingFactor = 0.6:
- 1st use: 100% confidence
- 2nd use: 60% confidence  
- 3rd use: 36% confidence
- 4th use: Pattern blocked

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
RISK_PORT=3017

# Storage Agent Integration
STORAGE_AGENT_URL=http://localhost:3015

# Risk Methods
ENABLE_GP=false
ENABLE_PRUNED_RANGES=false
ENABLE_ROBUST_ZONES=false
ENABLE_AB_TESTING=false

# Anti-Overfitting Defaults
DEFAULT_MAX_EXPOSURE=3
DEFAULT_TIME_WINDOW=15
DEFAULT_DIMINISHING_FACTOR=0.6

# Feature Analysis
GRADUATION_UPDATE_INTERVAL=1800000  # 30 minutes
MIN_SAMPLES_FOR_GRADUATION=30
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### With A/B Testing
```bash
ENABLE_AB_TESTING=true npm start
```

## Integration with NinjaTrader

NinjaTrader sends risk evaluation requests directly to this service:

1. **MainStrategy.cs**: Uses `/api/evaluate-risk` with full feature set
2. **CurvesV2Service.cs**: Uses `/api/approve-signal` legacy endpoint
3. **SignalApprovalClient.cs**: Handles HTTP communication

The service returns risk parameters that NinjaTrader uses for position sizing and order placement.

## Memory Management

The service maintains in-memory graduated feature tables per instrument/direction:

```
MemoryManager
├── MGC_long → FeatureGraduation instance
├── MGC_short → FeatureGraduation instance
├── ES_long → FeatureGraduation instance
└── ES_short → FeatureGraduation instance
```

Updates occur every 30 minutes based on bar time (not server time) to ensure consistency with market data.

## Performance

- **Response Time**: <100ms for risk evaluation
- **Memory Usage**: ~256MB base + graduation tables
- **Concurrent Requests**: Handles 100+ simultaneous evaluations
- **Graduation Updates**: Non-blocking background process

## Monitoring

Key metrics to monitor:

- Approval rate (target: 60-80%)
- Average confidence scores
- Pattern exposure distribution
- Graduation update frequency
- Method distribution (when A/B testing)

## Troubleshooting

### Low Approval Rate
- Check if enough historical data exists
- Verify graduated features are updating
- Review similarity thresholds

### High Pattern Exposure
- Indicates overfitting to specific patterns
- Reduce maxPatternExposure parameter
- Increase timeWindow for better clustering

### Storage Agent Connection Failed
- Service will exit with error
- Check STORAGE_AGENT_URL configuration
- Verify Storage Agent is running

### GP Service Errors
- Falls back to graduated ranges automatically
- Check Python GP service is running on port 5001
- Verify Python dependencies installed

## Future Enhancements

1. **Online Learning**: Real-time model updates
2. **Multi-timeframe Analysis**: Incorporate higher timeframes
3. **Market Regime Detection**: Automatic parameter adjustment
4. **Portfolio-level Risk**: Consider correlation across positions

## Related Documentation

- [Storage Agent README](../storage-agent/README.md)
- [Pruned Ranges README](./PRUNED_RANGES_README.md)
- [Anti-Overfitting Guide](../anti-overfitting-guide.md)