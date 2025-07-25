# Agentic Memory Storage Agent

The Storage Agent is the foundation component of the Agentic Memory system, responsible for storing and retrieving trading feature vectors using LanceDB.

## Overview

This service receives feature vectors from the Matching Engine (ME) when positions are closed, stores them in LanceDB with complete metadata, and provides query capabilities for the Gradient Analyzer and Risk Management agents.

## Features

- **LanceDB Integration**: Efficient vector storage with built-in similarity search
- **94+ Feature Vector Schema**: Dynamic feature support with graduated similarity matching
- **Complete Outcome Tracking**: Stores risk parameters, PnL, holding times, exit reasons
- **Position Size Normalization**: Stores both raw PnL and normalized per-contract values
- **Trajectory Data**: Captures bar-by-bar profit progression for pattern analysis
- **High Performance**: Non-blocking storage, fast similarity queries
- **Robust Error Handling**: Fails gracefully without affecting ME operations

## Anti-Overfitting Protection

The Storage Agent implements sophisticated anti-overfitting mechanisms to prevent pattern memorization during backtesting:

### Pattern Exposure Tracking
- Tracks how many times each pattern (entrySignalId) is used
- Applies exponential confidence decay: `confidence × diminishingFactor^exposure`
- Default diminishing factor: 0.8 (configurable)
- Maximum pattern exposure: 5 uses before blocking

### Time Window Clustering
- Groups patterns within time windows (default: 60 minutes)
- Prevents rapid reuse of similar patterns
- Identifies clustered patterns that may indicate overfitting

### Backtest Isolation Modes
The system supports multiple backtest modes via `/api/backtest/start`:

1. **Isolated Learning** (`resetLearning: true`)
   - Clears all pattern exposure data
   - Fresh learning environment for each backtest
   - Prevents contamination from previous runs

2. **Persistent Learning** (`resetLearning: false`)
   - Maintains pattern exposure across backtests
   - Simulates continuous learning environment
   - Better represents live trading conditions

3. **Data Leakage Prevention**
   - Enforces training/testing cutoff dates
   - Blocks patterns from future data
   - Default cutoff: 2024-12-31

### Model Reset Capability
Complete model reset functionality for clean backtesting:
- `/api/reset/complete` - Full system reset
- `/api/reset/fresh-trade` - Store new trades in reset mode
- `/api/reset/retrain` - Trigger model retraining
- Maintains separate storage for reset periods

## API Endpoints

### POST /api/store-vector
Store a feature vector from position deregistration.

**Request Body:**
```json
{
  "entrySignalId": "signal_12345",
  "instrument": "MGC", 
  "timestamp": 1641234567890,
  "entryType": "ORDER_FLOW_IMBALANCE",
  "direction": "long",
  "quantity": 2,  // Number of contracts traded
  "features": {    // Object with named features (94+ features)
    "atr_percentage": 0.15,
    "volume_delta": 1234,
    "rsi_14": 65.5,
    // ... more features
  },
  "riskUsed": {
    "stopLoss": 15.0,
    "takeProfit": 25.0,
    "virtualStop": 20.0
  },
  "outcome": {
    "pnl": 250.0,
    "pnlPoints": 12.5,
    "pnlPerContract": 125.0,  // CRITICAL: Normalized PnL per contract
    "pnlPointsPerContract": 6.25,  // Normalized points per contract
    "holdingBars": 8,
    "exitReason": "take_profit",
    "maxProfit": 15.0,
    "maxLoss": -5.0,
    "wasGoodExit": true,
    "profitByBar": {  // Bar-by-bar profit trajectory
      "0": 0,
      "1": -5,
      "2": -10,
      "3": 5,
      "4": 20,
      "5": 35,
      "6": 50,
      "7": 125
    }
  }
}
```

### POST /api/query-similar
Find similar historical patterns for risk optimization.

**Request Body:**
```json
{
  "features": {  // Query features as object
    "atr_percentage": 0.15,
    "volume_delta": 1234,
    // ... more features
  },
  "instrument": "MGC",  // Instrument-specific queries
  "direction": "long",   // Direction-specific queries
  "entryType": "ORDER_FLOW_IMBALANCE",
  "limit": 100,
  "similarity_threshold": 0.85,
  "graduatedFeatures": [  // Optional: Specific features for similarity
    "atr_percentage",
    "volume_delta",
    "rsi_14"
  ]
}
```

### GET /api/vectors
Retrieve vectors for gradient analysis.

**Query Parameters:**
- `instrument`: Filter by instrument (e.g., "MGC")
- `since`: ISO timestamp for time-based filtering
- `limit`: Maximum number of results (default: 1000)
- `entryType`: Filter by entry type

### GET /api/stats
Get storage statistics and health information.

### GET /health
Health check endpoint.

### POST /api/backtest/start
Start a backtest session with anti-overfitting controls.

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "resetLearning": true,  // true = isolated, false = persistent
  "settings": {
    "maxExposureCount": 3,
    "diminishingFactor": 0.6,
    "timeWindowMinutes": 15
  }
}
```

### POST /api/backtest/end
End the current backtest session and get statistics.

### GET /api/anti-overfitting/stats
Get current anti-overfitting statistics and exposure report.

### POST /api/anti-overfitting/configure
Configure anti-overfitting parameters.

**Request Body:**
```json
{
  "maxExposureCount": 3,
  "diminishingFactor": 0.6,
  "timeWindowMinutes": 15
}
```

## Feature Schema

The system now supports 94+ dynamic features generated by NinjaTrader:

### Core Feature Categories:
1. **ATR/Volatility**: atr_14, atr_percentage, atr_ratio
2. **Volume Analysis**: volume, volume_sma, volume_ratio, volume_delta, cumulative_delta
3. **Price Action**: open, high, low, close, vwap, body_size, upper_wick, lower_wick
4. **Technical Indicators**: rsi_14, macd, macd_signal, bb_upper, bb_lower, bb_width
5. **Market Structure**: higher_highs, lower_lows, inside_bar, outside_bar
6. **Order Flow**: bid_volume, ask_volume, delta_percentage, buy_sell_ratio
7. **Moving Averages**: ema_9, ema_21, sma_50, sma_200, ema_distance
8. **Pattern Recognition**: doji, hammer, shooting_star, engulfing

### Critical Normalized Fields:
- **pnlPerContract**: PnL divided by number of contracts (for fair comparison)
- **pnlPointsPerContract**: Points divided by number of contracts
- **profitByBar**: Dictionary/object tracking profit at each bar
- **quantity**: Number of contracts traded (position size)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
STORAGE_PORT=3015

# LanceDB Configuration  
LANCEDB_PATH=./data/vectors

# Data Retention
VECTOR_RETENTION_DAYS=90

# Anti-Overfitting Settings
MAX_PATTERN_EXPOSURE=5
DIMINISHING_FACTOR=0.8
TIME_WINDOW_MINUTES=60
TRAINING_CUTOFF_DATE=2024-12-31

# Model Reset
MIN_TRADES_FOR_RETRAIN=100
RESET_STORAGE_PATH=./data/reset_vectors
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

### Testing
```bash
npm test
```

### Docker
```bash
docker-compose up storage-agent
```

## Integration with ME

The Storage Agent integrates with the Matching Engine's `positionTrackingService.js` through the `agenticMemoryClient`. When enabled with `AGENTIC_MEMORY_ENABLED=true`, the ME automatically sends feature vectors to this service on position close.

### Anti-Overfitting Integration
The Risk Service queries this Storage Agent with anti-overfitting parameters:
- Pattern exposure counts are tracked per entrySignalId
- Confidence scores are automatically adjusted based on exposure
- Time window clustering prevents rapid pattern reuse
- Backtest isolation modes prevent data leakage during testing

## Performance

- **Storage Rate**: >100 vectors/second
- **Query Response**: <50ms for similarity search (with graduated features)
- **Memory Usage**: ~512MB base + vector data
- **Storage Format**: Apache Arrow/Parquet (LanceDB)
- **In-Memory Caching**: Risk service maintains memory-based graduation tables
- **Normalization**: All PnL calculations use per-contract values for fair comparison

## Monitoring

Key metrics to monitor:

- Vector insertion rate (`/api/stats`)
- Storage size growth
- Query response times
- Error rates in logs

## Future Integration

This Storage Agent is designed to work with:

- **Gradient Analyzer**: Queries vectors for feature importance analysis
- **Risk Management Agent**: Uses similarity search for dynamic risk calculation
- **Monitoring Dashboard**: Real-time statistics and performance metrics

## Error Handling

The service is designed to fail gracefully:

- ME integration is non-blocking (uses `setImmediate`)
- Storage failures don't affect position deregistration
- Automatic retry logic with exponential backoff
- Comprehensive error logging

## Security

- Input validation on all endpoints
- Request size limits (10MB)
- No sensitive data exposure in logs
- Health checks for monitoring