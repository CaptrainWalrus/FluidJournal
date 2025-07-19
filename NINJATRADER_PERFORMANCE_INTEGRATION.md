# NinjaTrader Performance Integration

## Overview
Add this code to your NinjaTrader strategy to automatically send backtest performance summaries to the Storage Agent when backtests complete.

## Add to CurvesV2Service.cs

### 1. Add Performance Summary Method

Add this method to your `CurvesV2Service.cs` class:

```csharp
public async Task<bool> SendPerformanceSummary(string sessionId, string strategyName, string instrument, 
    SystemPerformance systemPerformance, DateTime startDate, DateTime endDate)
{
    if (IsDisposed()) return false;
    
    try
    {
        string storageUrl = "http://localhost:3015";
        string endpoint = $"{storageUrl}/api/sessions/{sessionId}/performance";
        
        using (var client = new HttpClient())
        {
            client.Timeout = TimeSpan.FromSeconds(10);
            
            // Calculate total days
            var totalDays = (endDate - startDate).TotalDays;
            
            // Create performance payload
            var performanceData = new
            {
                strategyName = strategyName,
                instrument = instrument,
                timeframe = "1 minute", // or get from BarsPeriod
                startDate = startDate.ToString("yyyy-MM-dd"),
                endDate = endDate.ToString("yyyy-MM-dd"),
                totalDays = Math.Round(totalDays, 1),
                
                // All the performance metrics from SystemPerformance
                AverageBarsInTrade = systemPerformance.AllTrades.AverageBarsInTrade,
                AverageEntryEfficiency = systemPerformance.AllTrades.AverageEntryEfficiency,
                AverageExitEfficiency = systemPerformance.AllTrades.AverageExitEfficiency,
                AverageTimeInMarket = systemPerformance.AllTrades.AverageTimeInMarket.ToString(),
                AverageTotalEfficiency = systemPerformance.AllTrades.AverageTotalEfficiency,
                TotalCommission = systemPerformance.AllTrades.TotalCommission,
                GrossLoss = systemPerformance.AllTrades.GrossLoss,
                GrossProfit = systemPerformance.AllTrades.GrossProfit,
                LongestFlatPeriod = systemPerformance.AllTrades.LongestFlatPeriod.ToString(),
                MaxConsecutiveLoser = systemPerformance.AllTrades.MaxConsecutiveLoser,
                MaxConsecutiveWinner = systemPerformance.AllTrades.MaxConsecutiveWinner,
                MaxTime2Recover = systemPerformance.AllTrades.MaxTime2Recover.ToString(),
                MonthlyStdDev = systemPerformance.AllTrades.MonthlyStdDev,
                MonthlyUlcer = systemPerformance.AllTrades.MonthlyUlcer,
                NetProfit = systemPerformance.AllTrades.NetProfit,
                ProfitFactor = systemPerformance.AllTrades.ProfitFactor,
                R2 = systemPerformance.AllTrades.R2,
                RiskFreeReturn = systemPerformance.AllTrades.RiskFreeReturn,
                SharpeRatio = systemPerformance.AllTrades.SharpeRatio,
                SortinoRatio = systemPerformance.AllTrades.SortinoRatio,
                TotalSlippage = systemPerformance.AllTrades.TotalSlippage,
                TradesCount = systemPerformance.AllTrades.TradesCount,
                TradesPerDay = systemPerformance.AllTrades.TradesPerDay,
                TotalQuantity = systemPerformance.AllTrades.TotalQuantity,
                
                // Performance values objects
                Currency = new
                {
                    AverageBarsInTrade = systemPerformance.AllTrades.Currency.AverageBarsInTrade,
                    NetProfit = systemPerformance.AllTrades.Currency.NetProfit,
                    GrossProfit = systemPerformance.AllTrades.Currency.GrossProfit,
                    GrossLoss = systemPerformance.AllTrades.Currency.GrossLoss
                    // Add other Currency properties as needed
                },
                Percent = new
                {
                    NetProfit = systemPerformance.AllTrades.Percent.NetProfit,
                    GrossProfit = systemPerformance.AllTrades.Percent.GrossProfit,
                    GrossLoss = systemPerformance.AllTrades.Percent.GrossLoss
                    // Add other Percent properties as needed
                },
                Points = new
                {
                    NetProfit = systemPerformance.AllTrades.Points.NetProfit,
                    GrossProfit = systemPerformance.AllTrades.Points.GrossProfit,
                    GrossLoss = systemPerformance.AllTrades.Points.GrossLoss
                    // Add other Points properties as needed
                },
                Ticks = new
                {
                    NetProfit = systemPerformance.AllTrades.Ticks.NetProfit,
                    GrossProfit = systemPerformance.AllTrades.Ticks.GrossProfit,
                    GrossLoss = systemPerformance.AllTrades.Ticks.GrossLoss
                    // Add other Ticks properties as needed
                }
            };
            
            var json = JsonConvert.SerializeObject(performanceData, Formatting.Indented);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            Log($"[PERFORMANCE] Sending performance summary for session {sessionId}");
            
            var response = await client.PostAsync(endpoint, content);
            var responseText = await response.Content.ReadAsStringAsync();
            
            if (response.IsSuccessStatusCode)
            {
                Log($"[PERFORMANCE] ✅ Performance summary sent successfully for session {sessionId}");
                Log($"[PERFORMANCE] Summary: NetProfit=${performanceData.NetProfit:F2}, Trades={performanceData.TradesCount}, PF={performanceData.ProfitFactor:F2}");
                return true;
            }
            else
            {
                Log($"[PERFORMANCE] ❌ Failed to send performance summary: {response.StatusCode} - {responseText}");
                return false;
            }
        }
    }
    catch (Exception ex)
    {
        Log($"[PERFORMANCE] ❌ Exception sending performance summary: {ex.Message}");
        return false;
    }
}
```

## Add to Your Strategy Class

### 2. Add to OnStateChange Method

Add this to your strategy's `OnStateChange` method:

```csharp
protected override void OnStateChange()
{
    if (State == State.SetDefaults)
    {
        // Your existing SetDefaults code...
    }
    else if (State == State.Configure)
    {
        // Your existing Configure code...
    }
    else if (State == State.DataLoaded)
    {
        // Your existing DataLoaded code...
    }
    else if (State == State.Terminated)
    {
        // NEW: Send performance summary when backtest completes
        if (SystemPerformance != null && curvesService != null)
        {
            try
            {
                // Get the strategy name
                string strategyName = this.GetType().Name;
                
                // Get instrument name
                string instrumentName = Instrument.FullName;
                
                // Get backtest date range
                DateTime startDate = Bars.GetTime(0);
                DateTime endDate = Bars.GetTime(Bars.Count - 1);
                
                // Send performance summary asynchronously
                Task.Run(async () =>
                {
                    try
                    {
                        bool success = await curvesService.SendPerformanceSummary(
                            curvesService.sessionID,
                            strategyName,
                            instrumentName,
                            SystemPerformance,
                            startDate,
                            endDate
                        );
                        
                        if (success)
                        {
                            Print($"[PERFORMANCE] Performance summary sent for session {curvesService.sessionID}");
                        }
                        else
                        {
                            Print($"[PERFORMANCE] Failed to send performance summary");
                        }
                    }
                    catch (Exception ex)
                    {
                        Print($"[PERFORMANCE] Error sending performance summary: {ex.Message}");
                    }
                });
            }
            catch (Exception ex)
            {
                Print($"[PERFORMANCE] Error in State.Terminated: {ex.Message}");
            }
        }
    }
}
```

## Benefits

1. **Automatic Collection**: Performance summaries are automatically stored when backtests complete
2. **Session Tracking**: Each backtest session has a unique ID linking trades to performance
3. **Comprehensive Metrics**: All 30+ performance metrics from NinjaTrader are captured
4. **Future UI Ready**: Data is structured for easy display in strategy comparison dashboards

## API Endpoints Created

### Storage Agent Endpoints:

1. **Store Performance**: `POST /api/sessions/{sessionId}/performance`
   - Stores complete performance summary for a backtest session

2. **Get Session Trades**: `GET /api/sessions/{sessionId}/trades`
   - Gets all individual trades for a specific backtest session

3. **Get All Sessions**: `GET /api/sessions`
   - Lists all backtest sessions with summary metrics

## Data Storage

Performance summaries are stored as JSON files in `storage-agent/data/performance/` directory:
- Format: `{sessionId}_performance.json`
- Contains all performance metrics plus metadata
- Ready for future migration to MongoDB/database

## Example Usage

After implementing, your backtests will automatically:
1. Generate unique session IDs
2. Store individual trades with session IDs
3. Store performance summary when backtest completes
4. Enable session-based analysis and comparison