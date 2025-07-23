# Enhanced Recovery-Focused Logging

## Overview
The Risk Agent now provides focused logging specifically designed to track recovery efforts when equity curves are degrading, based on the GC example showing decline from -$2939 to -$5099.

## Enhanced Logging Features

### 1. Recovery Mode Detection
**Triggers:** 
- Current PnL < -$50 OR 
- Drawdown > 10% OR 
- 3+ consecutive losses

**Example Output for Degrading GC:**
```
🚨 [RECOVERY-MODE] short GC AUG25 @ 2737.6
   💰 Equity: $-5099 | DD: 45% | Losses: 5 consecutive | Win Rate: 20%
   🎯 Strategy: DEFENSIVE MODE | Action: Ultra-tight SL, reduced position sizes | Priority: 🟠 HIGH
```

### 2. Recovery Strategy Classification

#### 🔴 CRITICAL - Emergency Halt
- **Triggers:** 5+ consecutive losses AND PnL < -$200
- **Action:** Suspend trading, review market conditions
- **Example:** `🎯 Strategy: EMERGENCY HALT | Action: Suspend trading, review market conditions | Priority: 🔴 CRITICAL`

#### 🟠 HIGH - Defensive Mode  
- **Triggers:** 4+ consecutive losses AND drawdown > 25%
- **Action:** Ultra-tight SL, reduced position sizes
- **Example:** `🎯 Strategy: DEFENSIVE MODE | Action: Ultra-tight SL, reduced position sizes | Priority: 🟠 HIGH`

#### 🟡 MEDIUM - Pattern Reset
- **Triggers:** 3+ consecutive losses AND win rate < 30%
- **Action:** Tightening risk zones, waiting for better setups
- **Example:** `🎯 Strategy: PATTERN RESET | Action: Tightening risk zones, waiting for better setups | Priority: 🟡 MEDIUM`

#### 🔵 LOW - Gradual Recovery
- **Triggers:** Drawdown > 15%
- **Action:** Reducing risk per trade, focus on R:R optimization
- **Example:** `🎯 Strategy: GRADUAL RECOVERY | Action: Reducing risk per trade, focus on R:R optimization | Priority: 🔵 LOW`

#### 🟢 ROUTINE - Cautious Monitoring
- **Triggers:** Minor issues detected
- **Action:** Minor risk adjustments, maintain vigilance
- **Example:** `🎯 Strategy: CAUTIOUS MONITORING | Action: Minor risk adjustments, maintain vigilance | Priority: 🟢 ROUTINE`

### 3. Zone Engine Recovery Integration

When the Robust Zones Engine is making adjustments, additional context is provided:

```
   🔧 Zone Adjustment: DEFENSIVE_TIGHTENING | Robustness: 75% | Samples: 12
   ⚠️  Low confidence detected - Zone engine applying defensive adjustments
```

### 4. Dual Endpoint Coverage

**Both endpoints enhanced:**
- `/api/evaluate-risk` - Used by MainStrategy with direct features
- `/api/approve-signal` - Used by CurvesStrategy with ME features

### 5. Recovery Metrics Tracked

- **Equity Curve:** Real-time cumulative PnL calculation
- **Drawdown Percentage:** From peak to current performance
- **Consecutive Losses:** Streak detection for pattern breaks
- **Win Rate:** Recent performance percentage
- **Days Since Last Win:** Recovery timeline tracking

## Impact on GC Recovery Example

For the GC degradation from -$2939 to -$5099:

**Previous Logging (Verbose/Unclear):**
```
[RECENT-TRADES-MEMORY] Analyzing last 10 trades for GC from memory
[RISK-SERVICE] STAGE3: Recent trade analysis completed - Duration: 15ms
```

**New Recovery-Focused Logging:**
```
🚨 [RECOVERY-MODE] short GC AUG25 @ 2737.6
   💰 Equity: $-5099 | DD: 45% | Losses: 5 consecutive | Win Rate: 20%
   🎯 Strategy: DEFENSIVE MODE | Action: Ultra-tight SL, reduced position sizes | Priority: 🟠 HIGH
   🔧 Zone Adjustment: DEFENSIVE_TIGHTENING | Robustness: 75% | Samples: 12
   ⚠️  Low confidence detected - Zone engine applying defensive adjustments
```

This immediately shows:
1. **What's happening:** Recovery mode with specific metrics
2. **What's being done:** Defensive strategy with ultra-tight risk
3. **How it's being implemented:** Zone engine defensive adjustments
4. **Priority level:** High priority requiring immediate attention

## Normal Trading Logging

For non-recovery situations, simplified logging:
```
[RISK-SERVICE] long GC AUG25 @ 2745.2 | Equity: $247
```

This keeps logs clean during normal operations while providing detailed recovery intelligence when needed.