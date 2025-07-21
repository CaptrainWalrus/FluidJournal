# Three-State Data Storage Plan

## Data States
**State 1: Training Data (TRAINING)**
- Historical backtest data, bulk import
- Core foundation for pattern matching

**State 2: Recent Live (RECENT)** 
- Live trades stored and used for graduation
- "Dry hopping" - enhances model without replacing foundation
- Included in feature graduation calculations

**State 3: Out-of-Sample (OUT_OF_SAMPLE)**
- Pure validation data, no influence on decisions
- Performance tracking only

## Storage Schema

### LanceDB Vectors (States 1 & 2)
```javascript
{
  "dataType": "TRAINING|RECENT",
  "sessionId": "string",
  "instrument": "string", 
  "direction": "string",
  "entryType": "string",
  "timestamp": "datetime",
  "features": {
    // 94 market features grouped:
    "volatilityFeatures": {...},    // ATR, volatility ratios
    "priceFeatures": {...},         // OHLC ratios, efficiency
    "volumeFeatures": {...},        // Volume deltas, patterns
    "technicalFeatures": {...},     // RSI, EMA, momentum
    "patternFeatures": {...}        // Wick ratios, inside bars
  },
  "outcome": {
    "pnl": "float",
    "pnlPerContract": "float", 
    "exitReason": "string"
  }
}
```

### JSON Performance Files (State 3)
```javascript
// live-stats.json
{
  "MGC_ORDER_FLOW_IMBALANCE": {
    "totalTrades": 45,
    "winRate": 0.67,
    "totalPnL": 1250.00,
    "lastTrade": "2025-01-19T14:30:00Z"
  }
}

// equity-curve.json
[
  {"timestamp": "2025-01-19T14:30:00Z", "runningPnL": 150.00},
  {"timestamp": "2025-01-19T15:45:00Z", "runningPnL": 275.00}
]
```

## Graduation Dataset
**Feature importance calculated from:** `WHERE dataType IN ('TRAINING', 'RECENT')`
- Maintains historical knowledge + adapts to current conditions
- Recent trades enhance pattern matching without replacing foundation

## NinjaTrader Integration
**Add new flag:** `StoreAsRecent = true/false`

**Routing logic:**
- `DoNotStore=false, StoreAsRecent=false` → LanceDB as "TRAINING"
- `DoNotStore=false, StoreAsRecent=true` → LanceDB as "RECENT" 
- `DoNotStore=true` → JSON files as "OUT_OF_SAMPLE"

## Implementation
- Extend existing Storage Agent with dataType field
- Add new endpoint for out-of-sample JSON tracking
- Graduation queries include TRAINING + RECENT data