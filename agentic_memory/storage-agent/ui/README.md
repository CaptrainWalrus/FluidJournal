# 🚀 Backtest Repository UI

A comprehensive Streamlit dashboard for analyzing NinjaTrader backtest results with interactive heatmaps, favorites management, and drill-down capabilities.

## Features

### 📈 Interactive Heatmap
- **Multi-Parameter Visualization**: X/Y axis selection from strategy parameters
- **Composite Scoring**: Green (excellent) → Yellow (good) → Red (poor) color scale
- **Click-to-Drill**: Click heatmap points to highlight in table view
- **Multiple Metrics**: Composite score, net profit, Sharpe ratio, profit factor

### 📋 Advanced Table View
- **Session Management**: Unique sessionID for each backtest run
- **Performance States**: Visual health indicators (excellent/good/fair/poor)
- **Feature Importance**: Top 3 most important parameters with scores
- **Favorites System**: ⭐ Pin/unpin notable backtests
- **Smart Filtering**: By health, strategy, instrument, favorites
- **Drill-Down Details**: Click rows for comprehensive analysis

### 🔧 Integration Ready
- **Agentic Memory**: Connects to existing storage-agent infrastructure
- **NinjaTrader**: Ready for TradesPerformance object integration
- **LanceDB**: High-performance vector storage for trade data
- **Session Tracking**: Links backtest configs to results

## Quick Start

### 1. Install Dependencies
```bash
cd C:\Users\aport\Documents\FluidJournal\agentic_memory\storage-agent\ui
pip install -r requirements.txt
```

### 2. Run Demo (Mock Data)
```bash
streamlit run backtest_repository.py
```

### 3. Access Dashboard
Open browser to `http://localhost:8501`

## Data Structure

### Session-Based Architecture
```python
{
  "sessionId": "OrderFlowImbalance_v2.1_MGC_abc123",
  "strategyName": "OrderFlowImbalance_v2.1",
  "instrument": "MGC",
  "timestamp": "2024-01-15T10:30:00Z",
  "isFavorited": False,
  
  # Performance Classification
  "overallHealth": "excellent",  # excellent/good/fair/poor
  "compositeScore": 0.85,        # Multi-metric score (0-1)
  
  # NinjaTrader TradesPerformance
  "netProfit": 2450.00,
  "sharpeRatio": 1.85,
  "winRate": 0.67,
  "profitFactor": 1.65,
  "maxDrawdown": -850.00,
  
  # Strategy Parameters
  "stopLoss": 15,
  "takeProfit": 30,
  "wickRatio": 0.25,
  "volumeMultiplier": 2.1,
  "rsiLevel": 75,
  
  # Feature Analysis
  "topFeatures": "wickRatio(0.85), stopLoss(0.72), rsiLevel(0.68)"
}
```

### Composite Scoring Algorithm
Multi-metric evaluation combining:
- **Profit Score** (30%): Normalized net profit
- **Sharpe Score** (40%): Risk-adjusted returns
- **Win Rate Score** (20%): Success consistency  
- **Drawdown Penalty** (10%): Risk management

## Integration Points

### NinjaTrader Strategy Termination
```csharp
// At strategy termination, POST to repository
var backtestData = new {
    sessionId = $"{StrategyName}_{Instrument}_{Guid.NewGuid():N}",
    strategyName = StrategyName,
    tradesPerformance = SystemPerformance.AllTrades,
    parameters = new {
        stopLoss = StopLoss,
        takeProfit = TakeProfit,
        // ... all strategy parameters
    }
};

// HTTP POST to http://localhost:8501/api/store-backtest
```

### Agentic Memory Storage
- Links to existing LanceDB trade records
- Correlates backtest sessions with individual trades
- Provides feature importance from graduated analysis

## Directory Structure
```
ui/
├── backtest_repository.py    # Main Streamlit application
├── requirements.txt          # Python dependencies
├── README.md                # This file
└── [future expansions]
    ├── data_integration.py  # Real LanceDB/API integration
    ├── nt_integration.py    # NinjaTrader webhook handlers
    └── analysis_engine.py   # Advanced analytics
```

## Development Notes

### Current Status: Mock Implementation ✅
- Fully functional UI with realistic mock data
- All interactive features working (heatmap, table, drill-down)
- Favorites system, filtering, export capabilities
- 150 generated backtest records for testing

### Next Steps: Real Integration
1. **LanceDB Integration**: Connect to actual storage-agent data
2. **NinjaTrader Hooks**: HTTP endpoints for strategy termination
3. **Feature Analysis**: Real parameter importance from agentic memory
4. **Session Persistence**: Database storage for favorites/tags

### Mock Data Features
- 6 different strategies across 5 instruments
- Correlated performance metrics (realistic relationships)
- Health classification based on composite scoring
- Parameter variations with importance scores
- Favorites distribution (~15% marked as favorites)

## Usage Tips

### Finding Optimal Parameters
1. Use **heatmap** to identify high-performance parameter combinations
2. Filter table by **"excellent"** health status
3. **Favorite** promising configurations for easy access
4. **Clone parameters** from successful backtests

### Performance Analysis
1. **Composite Score**: Focus on green (0.8+) areas in heatmap
2. **Sharpe vs Profit**: Use scatter plot to identify balanced performers
3. **Strategy Comparison**: Review average metrics by strategy type
4. **Feature Importance**: Understand which parameters drive success

### Workflow Integration
1. Run backtest in NinjaTrader
2. Results automatically appear in repository
3. Analyze performance using interactive tools
4. Favorite successful configurations
5. Use insights for next backtest iterations

---

**Built for the Agentic Memory Trading System** | Streamlit + LanceDB + NinjaTrader Integration