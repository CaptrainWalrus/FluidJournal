# Setting Up Range-Based System for New Instrument

## No Training Required! 
The range-based system automatically learns from your data. Here's the process:

## 1. Data Collection Phase ✅ (You've Done This)
- Collect trades on the new instrument
- Need minimum ~30-50 trades for reliable ranges
- Should include both winners and losers

## 2. Automatic Range Learning (Happens Automatically)
The system will:
- Separate profitable vs unprofitable trades
- Calculate optimal ranges (Q25-Q75 of profitable)
- Calculate acceptable ranges (P10-P90 of profitable)
- Update every 30 minutes based on new data

## 3. Check If Ranges Are Ready

### Option A: Check via API
```bash
curl http://localhost:3017/api/graduations
```

Look for your instrument entries like:
- `YM_long`: 45 patterns, 15 features graduated
- `YM_short`: 38 patterns, 15 features graduated

### Option B: Check Memory Manager
```javascript
// In risk-service directory
node -e "
const mm = require('./memoryManager');
mm.initialize().then(() => {
  const tables = mm.graduationTables;
  console.log('Available graduations:', Array.from(tables.keys()));
  
  // Check specific instrument
  const ymLong = tables.get('YM_long');
  if (ymLong) {
    console.log('YM Long graduation:', {
      patterns: ymLong.vectorCount,
      winRate: ymLong.winRate,
      features: ymLong.features.length
    });
  }
});
"
```

## 4. Verify Minimum Data Requirements

```bash
# Check how many patterns stored for new instrument
curl "http://localhost:3015/api/vectors?instrument=YM&limit=1000" | \
  python3 -c "import sys, json; d=json.load(sys.stdin); print(f'YM patterns: {len(d.get(\"vectors\", []))}')"
```

Need at least:
- 30 total patterns (minimum)
- 10+ profitable trades
- 10+ unprofitable trades

## 5. Out-of-Sample Testing Process

### Step 1: Enable Range-Based (Already Done)
```bash
# In risk-service/.env
ENABLE_GP_INTEGRATION=false
ENABLE_AB_TESTING=false
```

### Step 2: Start Testing
1. **Live Forward Test** (Recommended):
   - Just start trading the new instrument
   - System uses learned ranges immediately
   - Monitor confidence scores in logs

2. **Backtest** (If you have historical data):
   ```python
   # Run your backtesting framework
   # Risk service will use ranges for all decisions
   ```

### Step 3: Monitor Performance
Watch for these log patterns:
```
[MEMORY-RISK] Range-based confidence: 78.5% (23 features analyzed)
[MEMORY-RISK] Range analysis: APPROVED - High confidence: 5 OPTIMAL, 12 ACCEPTABLE, 6 POOR features
```

## 6. What to Expect

### First 30-50 Trades
- Ranges are still forming
- May see more neutral confidence (40-60%)
- System is learning optimal conditions

### After 50+ Trades
- Clear confidence differentiation
- High confidence (70-90%) on good setups
- Low confidence (10-30%) on poor setups
- Ranges become more refined

### After 100+ Trades
- Highly optimized ranges
- System knows instrument personality
- Confident rejections of losing patterns

## 7. Troubleshooting

### "No graduation table found"
- Need more data (minimum 30 trades)
- Check if data is being stored properly

### "Low confidence on everything"
- Normal for first 20-30 trades
- Ranges still establishing
- Keep collecting data

### "High confidence but losses"
- Market conditions may have changed
- Ranges will adapt in next 30-min update
- Check if instrument behavior shifted

## Quick Start Commands

```bash
# 1. Check if new instrument has enough data
curl "http://localhost:3015/api/stats" | jq '.instrumentCounts'

# 2. Force graduation update (if needed)
curl -X POST "http://localhost:3017/api/force-graduation-update"

# 3. Test a sample trade
curl -X POST http://localhost:3017/api/evaluate-risk \
  -H "Content-Type: application/json" \
  -d '{
    "instrument": "YM",
    "direction": "long",
    "features": {
      "atr_percentage": 0.025,
      "volume_spike_ratio": 1.2,
      "rsi_14": 50
    }
  }'
```

## The Beauty of Range-Based

- **No manual training needed**
- **No parameters to tune**
- **No model files to manage**
- **Just collect data and trade!**

The system learns what works for each instrument automatically!