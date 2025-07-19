# Do Not Store Flag Implementation

## Overview
Implemented a `doNotStore` flag that flows from NinjaTrader → ME → Storage, allowing you to test out-of-sample data without contaminating your training dataset.

## Implementation Details

### 1. NinjaTrader Side (You need to implement)
Add a boolean parameter to your strategy:
```csharp
[NinjaScriptProperty]
[Display(Name="Do Not Store (Out-of-Sample)", Order=100, GroupName="Agentic Memory")]
public bool DoNotStore { get; set; }
```

When registering positions, include this flag:
```csharp
var requestData = new
{
    strategyId = StrategyId,
    entrySignalId = entrySignalId,
    patternUuid = patternUuid,
    instrument = Instrument.FullName,
    entryTimestamp = entryTimestamp,
    entryPrice = entryPrice,
    direction = direction,
    marketContext = marketContext,
    doNotStore = DoNotStore  // NEW: Add this flag
};
```

### 2. ME Service Updates (Already Implemented)
- Updated `registerPosition()` function to accept `doNotStore` parameter
- Stores flag in position data structure
- Checks flag during deregistration before storing to Agentic Memory

### 3. Storage Flow
When a position is deregistered:
- If `doNotStore` is `false` (default): Position data is stored to Agentic Memory
- If `doNotStore` is `true`: Position data is NOT stored, with log message:
  ```
  [AGENTIC-MEMORY] ⏭️ Skipping storage for XXX - doNotStore flag is set (out-of-sample testing)
  ```

## Usage Scenarios

### In-Sample Testing (Training Data)
- Set `DoNotStore = false` in NinjaTrader
- All positions will be stored to Agentic Memory
- This data will be used for training and pattern matching

### Out-of-Sample Testing (Validation)
- Set `DoNotStore = true` in NinjaTrader
- Positions will still be:
  - Tracked normally in ME
  - Approved/rejected by Risk Service
  - Execute normally in NinjaTrader
- But they will NOT be:
  - Stored in Agentic Memory
  - Used for future pattern matching
  - Contaminate your training data

## Benefits
1. **Clean Separation**: Training and validation datasets remain completely separate
2. **No Overfitting**: Out-of-sample results won't influence future decisions
3. **True Validation**: Get honest performance metrics on unseen data
4. **Easy Toggle**: Simple boolean flag to switch between modes

## Testing Workflow
1. **Phase 1**: Run backtest with `DoNotStore = false` on historical data (e.g., 2023)
2. **Phase 2**: Run backtest with `DoNotStore = true` on recent data (e.g., 2024)
3. **Compare**: Analyze performance differences between in-sample and out-of-sample

## Verification
Watch ME logs to confirm behavior:
- When storing: `[AGENTIC-MEMORY] Storing position outcome for XXX`
- When skipping: `[AGENTIC-MEMORY] ⏭️ Skipping storage for XXX - doNotStore flag is set`

## Future Enhancements
- Add statistics tracking for doNotStore positions
- Create separate performance reports for in-sample vs out-of-sample
- Add API endpoint to retrieve out-of-sample performance metrics