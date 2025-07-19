# Agentic Memory Static Features Analysis Summary

## Problem Statement
- 77 out of 94 features show as constant across stored vectors
- Entry types show as "MGC_unknown_unknown"
- PnL often $0 with exit reason "UNKNOWN"
- MaxProfit/MaxLoss always 0
- consecutive_up_bars/down_bars only show 0 or 1

## Root Causes Identified

### 1. **High Duplication Rate (PRIMARY ISSUE)**
- Each trade is stored **4-8 times**
- Only 29 unique trades out of 116 stored vectors
- This creates artificial "static" feature appearance
- Same features stored repeatedly inflates the constant feature count

### 2. **Missing Calculation Functions**
- EMA3 returns `undefined` - Fixed in code but ME needs restart
- VWAP returns `undefined` - Fixed in code but ME needs restart
- These undefined values default to static fallback values

### 3. **Position Lifecycle Issues**
- No position registration/deregistration logs found
- Features generated without proper position context
- Entry type not passed from NinjaTrader (shows as "unknown_unknown")
- MaxProfit/MaxLoss require position tracking which isn't happening

### 4. **Data Flow Problems**
```
Current (BROKEN):
NinjaTrader → ME (multiple stores) → Storage (duplicates)

Should be:
NinjaTrader → ME (register) → Track → ME (deregister) → Storage (once)
```

## Immediate Actions Required

1. **Fix Duplicate Storage**
   - Find why positions are stored multiple times
   - Ensure storage happens only at position exit
   - Add deduplication logic if needed

2. **Restart ME Service**
   - Apply EMA3 and VWAP calculation fixes
   - Enable proper position tracking logs

3. **Fix Position Tracking**
   - Verify NinjaTrader calls RegisterPosition/DeregisterPosition
   - Ensure features are generated with position context
   - Track bar history for MaxProfit/MaxLoss calculations

4. **Pass Signal Metadata**
   - Send signalType and signalDefinition from NinjaTrader
   - Ensure exit reasons are captured properly
   - Calculate real PnL at position exit

## Expected Improvements After Fixes

- Features should show natural market variation
- Entry types should show actual signal names
- PnL should reflect real trading outcomes
- MaxProfit/MaxLoss should track position extremes
- Consecutive bar counts should show realistic values (not just 0/1)
- Each position stored only once with complete data

## Monitoring
Use the created diagnostic tools:
- `diagnose-static-features.js` - Overall feature analysis
- `trace-feature-generation.js` - Trace feature calculation flow
- `check-recent-activity.js` - Monitor storage patterns
- `variation-monitor.js` - Real-time variation tracking