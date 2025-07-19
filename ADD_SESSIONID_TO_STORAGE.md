# Adding SessionID to Storage Agent for Backtest Separation

## Problem
- `sessionID` is generated in CurvesV2Service (line 558) as `Guid.NewGuid().ToString()`
- It's NOT being sent to Storage Agent with trade records
- This prevents separating trades from different backtests

## Required Changes

### 1. Add sessionID to UnifiedTradeRecord (SharedCustomClasses.cs)

```csharp
public class UnifiedTradeRecord
{
    // ... existing fields ...
    
    // ADD THIS NEW FIELD
    public string SessionId { get; set; }  // Unique ID per backtest session
}
```

### 2. Pass sessionID to OrderManagement

In **CurvesV2Service.cs**, make sessionID accessible:
```csharp
// Add a public getter (around line 558)
public string SessionId => sessionID;
```

### 3. Include sessionID in SendUnifiedRecordToStorage (OrderManagement.cs)

Update the method around line 1964:
```csharp
private void SendUnifiedRecordToStorage(OrderRecordMasterLite OrderRecordMaster, string entrySignalId, PositionOutcomeData outcomeData)
{
    // ... existing code ...
    
    var completeTrainingRecord = new UnifiedTradeRecord
    {
        // ... existing fields ...
        
        // ADD THIS LINE
        SessionId = curvesService.SessionId,  // Include session ID for backtest separation
    };
    
    // ... rest of method ...
}
```

### 4. Update SendToStorageAgent in CurvesV2Service.cs

Around line 620, add sessionID to the storage payload:
```csharp
var storageRecord = new
{
    entrySignalId = record.EntrySignalId,
    instrument = record.Instrument,
    timestamp = record.Timestamp,
    entryType = record.EntryType,
    direction = record.Direction,
    timeframeMinutes = record.TimeframeMinutes,
    quantity = record.Quantity,
    features = record.Features,
    recordType = "UNIFIED",
    status = "UNIFIED",
    sessionId = record.SessionId,  // ADD THIS LINE
    riskUsed = new
    {
        stopLoss = record.StopLoss,
        takeProfit = record.TakeProfit
    },
    // ... rest of payload ...
};
```

## Storage Agent Schema Update

### 5. Update VectorStore Schema (storage-agent/src/vectorStore.js)

Add sessionId to the schema around line 50:
```javascript
const sampleData = [{
    // ... existing fields ...
    sessionId: 'sample-session',  // ADD THIS FIELD
    // ... rest of fields ...
}];
```

### 6. Handle sessionId in storeVector method

Update the vectorStore to capture and store sessionId:
```javascript
const {
    entrySignalId,
    instrument,
    sessionId,  // ADD THIS
    // ... other fields ...
} = vectorData;

// Include in the stored record
const record = {
    // ... existing fields ...
    sessionId: sessionId || 'unknown',  // ADD THIS WITH FALLBACK
    // ... rest of record ...
};
```

## Benefits

1. **Backtest Isolation**: Each backtest has unique sessionId
2. **Easy Filtering**: Query trades by sessionId in Storage Agent
3. **Performance Analysis**: Compare different backtest sessions
4. **Data Cleanup**: Delete specific backtest sessions if needed

## Testing

1. Run a backtest and check logs for sessionId in stored records
2. Run another backtest and verify different sessionId
3. Query Storage Agent filtering by sessionId to verify separation

## Future Enhancement

Add API endpoint to Storage Agent:
```javascript
// Get all trades for a specific session
app.get('/api/sessions/:sessionId/trades', async (req, res) => {
    const trades = await vectorStore.getBySessionId(req.params.sessionId);
    res.json(trades);
});

// List all sessions
app.get('/api/sessions', async (req, res) => {
    const sessions = await vectorStore.getUniqueSessions();
    res.json(sessions);
});
```