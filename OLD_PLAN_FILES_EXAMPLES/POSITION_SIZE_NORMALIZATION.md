# Position Size Normalization Guide

## Overview

As of July 17, 2025, the Agentic Memory system implements comprehensive position size normalization to ensure fair comparison between trades of different sizes. This is a **CRITICAL** implementation detail that affects all PnL-based calculations.

## The Problem

Previously, the system compared raw PnL values between trades:
- Trade A: $1000 profit on 10 contracts = $100/contract (good trade)
- Trade B: $500 profit on 1 contract = $500/contract (excellent trade)

Without normalization, Trade A appears better due to higher raw PnL, but Trade B is actually the superior trade on a per-contract basis.

## The Solution

All services now store and use normalized per-contract values:

### Storage Layer (VectorStore)
```javascript
// Stored fields in LanceDB
{
  pnl: 1000.0,                    // Raw PnL (for backward compatibility)
  pnlPoints: 10.0,                // Raw points
  quantity: 10,                   // Number of contracts
  pnlPerContract: 100.0,          // Normalized: pnl / quantity
  pnlPointsPerContract: 1.0       // Normalized: pnlPoints / quantity
}
```

### Risk Calculations (MemoryManager & Risk Service)

**ALWAYS use this pattern for PnL access:**
```javascript
// Correct pattern with fallback
const normalizedPnl = pattern.pnlPerContract || pattern.pnl || 0;

// For filtering profitable trades
const profitable = vectors.filter(v => (v.pnlPerContract || v.pnl) > 0);

// For average calculations
const avgLoss = patterns.reduce((sum, p) => 
  sum + Math.abs(p.pnlPerContract || p.pnl || 0), 0
) / patterns.length;
```

**NEVER do this:**
```javascript
// WRONG - uses raw PnL without normalization
const profitable = vectors.filter(v => v.pnl > 0);

// WRONG - no fallback for older data
const avgLoss = patterns.reduce((sum, p) => sum + p.pnlPerContract, 0);
```

## Implementation Locations

### 1. Storage Agent (`vectorStore.js`)
- Lines 225-227: Calculate and store normalized values
- Lines 775-783: Use normalized values in aggregations

### 2. Memory Manager (`memoryManager.js`)
- Lines 127-128: Separate profitable/unprofitable using normalized values
- Lines 185-186: Use normalized PnL for feature correlation
- Lines 492-493: Pattern analysis with normalized values

### 3. Risk Service (`server.js`)
- Lines 1336-1338: Filter losing patterns with normalized threshold
- Lines 1342-1345: Filter winning patterns with normalized threshold
- Lines 1365, 1434, 1492: Calculate averages using normalized values

## Backward Compatibility

The fallback pattern `(v.pnlPerContract || v.pnl)` ensures:
1. New data with pnlPerContract is used correctly
2. Old data without pnlPerContract still works (assumes 1 contract)
3. No breaking changes for existing deployments

## Testing Normalization

To verify normalization is working:

```javascript
// Test data with different position sizes
const testPatterns = [
  { pnl: 100, quantity: 1, pnlPerContract: 100 },    // Good trade
  { pnl: 1000, quantity: 10, pnlPerContract: 100 },  // Same quality
  { pnl: 500, quantity: 1, pnlPerContract: 500 },    // Best trade
];

// All should be treated as profitable
const profitable = testPatterns.filter(p => (p.pnlPerContract || p.pnl) > 0);
console.log(profitable.length); // Should be 3

// Average should reflect per-contract performance
const avgProfit = profitable.reduce((sum, p) => 
  sum + (p.pnlPerContract || p.pnl), 0
) / profitable.length;
console.log(avgProfit); // Should be 233.33, not 533.33
```

## Common Pitfalls

1. **Forgetting the fallback**: Always use `|| p.pnl` for backward compatibility
2. **Using raw thresholds**: A $50 loss on 1 contract vs 10 contracts is very different
3. **Aggregations without normalization**: Sums and averages must use normalized values
4. **Heat map thresholds**: Ensure pattern filtering uses per-contract thresholds

## Future Development

Any new features involving PnL must:
1. Access PnL using the fallback pattern
2. Consider position size in threshold calculations
3. Document whether values are normalized or raw
4. Test with varied position sizes

## Migration Status

- ✅ VectorStore: Fully normalized
- ✅ MemoryManager: Fully normalized
- ✅ Risk Service: Fully normalized
- ⚠️ GP Service: Check if using normalized values
- ⚠️ Heat Maps: Verify thresholds are per-contract

This normalization is CRITICAL for accurate risk assessment and pattern matching. Always consider position size when working with PnL data.