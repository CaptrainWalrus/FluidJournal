# NinjaTrader ME/MI Service Removal Guide

## Overview
This guide shows the minimal changes needed to remove ME (Matching Engine) and MI (Market Ingestion) dependencies from NinjaTrader, allowing direct integration with Storage and Risk agents only.

## Key Changes Required

### 1. CurvesV2Service.cs

#### Comment Out Service URLs
```csharp
// Line 367
// private readonly string meServiceUrl = "http://localhost:5000";
```

#### Stub Registration Methods (Lines 2309-2499)
```csharp
public bool RegisterPosition(...)
{
    // ME registration no longer needed
    return true;  // Always return success
}

public async Task<bool> RegisterPositionAsync(...)
{
    // ME registration no longer needed
    return true;  // Always return success
}
```

#### Stub Deregistration Methods (Lines 2874-2992)
```csharp
public void DeregisterPosition(string entrySignalId, ...)
{
    // ME deregistration no longer needed
    // Position outcomes already sent directly to Storage
    return;
}

public async Task DeregisterPositionAsync(string entrySignalId, ...)
{
    // ME deregistration no longer needed
    return;
}
```

#### Comment Out Bar Sending (Lines 1117-1119, 1627-1629)
```csharp
public async Task SendBarsAsync(string instrument, ...)
{
    // MI bar ingestion no longer needed
    return;
}

public bool SendBarsSync(string instrument, ...)
{
    // MI bar ingestion no longer needed
    return true;
}
```

### 2. OrderManagement.cs

No changes needed! The registration/deregistration calls will now use the stubbed methods that always succeed.

### 3. CurvesStrategy.cs

Already handled - orange line indicator is commented out (line 128).

### 4. Configuration

Update any configuration that expects ME/MI to be running:
- Remove health checks for ports 3002 and 5000
- Remove any startup dependencies on these services

## What Still Works

✅ **Direct Storage Integration** - `SendUnifiedRecordToStorage()` continues working
✅ **Direct Risk Integration** - Risk approval requests continue working  
✅ **All Trading Logic** - No impact on strategy execution
✅ **Position Tracking** - NT tracks positions internally

## Benefits

- **Faster Execution** - No network hops to ME/MI
- **More Reliable** - No relay failures or timeouts
- **Simpler Debugging** - Direct flow is easier to trace
- **Less Resource Usage** - 2 services instead of 6

## Testing

1. Start only Storage and Risk services
2. Run NinjaTrader with stubbed methods
3. Verify trades still execute normally
4. Check Storage Agent receives unified records
5. Confirm Risk Agent provides proper SL/TP values

## Future Considerations

If you ever need bar buffering again, consider adding it directly to Storage Agent rather than a separate MI service.