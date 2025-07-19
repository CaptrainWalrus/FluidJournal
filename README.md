# FluidJournal

**Intelligent Trade Risk Management through Historical Pattern Analysis**

FluidJournal is an adaptive risk management system that learns from trading history to prevent repeating costly mistakes. By analyzing thousands of past trades (from backtesting with intentionally sub-optimal parameters), it identifies market conditions that historically lead to losses and adjusts risk parameters accordingly.

## The Problem

Traditional algorithmic trading systems often repeat the same mistakes because they lack memory of past performance. A strategy might consistently lose money during high volatility periods, but without historical context, it continues making the same trades under similar conditions.

## Our Solution

FluidJournal implements an "agentic memory" system that:

1. **Captures Every Trade Decision** - Records 94+ market features for each trade, including volatility, price patterns, volume data, and technical indicators
2. **Learns from Outcomes** - Stores profit/loss results and analyzes what market conditions led to wins vs losses
3. **Graduates Critical Features** - Identifies which market conditions are most predictive of success or failure
4. **Adapts Risk in Real-Time** - Automatically adjusts stop-loss and take-profit levels based on similar historical patterns

## How It Works

### Data Collection & Storage
- **LanceDB Vector Database**: Efficiently stores high-dimensional trading data with millisecond query performance
- **Feature Engineering**: Extracts 94+ market characteristics from each trade (volatility ratios, price efficiency, momentum indicators, etc.)
- **Position Tracking**: Records complete trade lifecycle from entry to exit with precise timing

### Pattern Recognition & Learning
- **Graduated Feature Analysis**: Statistically determines which market conditions correlate with profitable vs unprofitable trades
- **Range-Based Intelligence**: Instead of finding "similar" trades, identifies optimal ranges for each market condition (e.g., volatility should be between 0.019-0.034 for profitable gold trades)
- **Continuous Learning**: Updates pattern recognition as new trade data becomes available

### Risk Adaptation
- **Historical Context**: Before entering a trade, queries similar market conditions from the database
- **Intelligent Filtering**: Rejects trades when market conditions match patterns that historically lose money
- **Dynamic Risk Parameters**: Adjusts stop-loss and take-profit levels based on what worked in similar past situations

## Example in Action

When the system considers a long position in gold futures:

1. **Market Analysis**: Current volatility is 0.2%, recent price action shows calm conditions
2. **Historical Query**: Searches database for similar trades (low volatility + calm markets + long direction)
3. **Pattern Recognition**: Finds that gold long trades in these conditions historically succeed 78% of the time
4. **Risk Optimization**: Sets stop-loss at 8 points and take-profit at 15 points based on what worked in similar situations
5. **Learning**: After trade completion, stores outcome to improve future decisions

## Technical Architecture

### Storage Agent (Port 3015)
- **LanceDB Integration**: High-performance vector storage for trade data
- **REST API**: Endpoints for storing trade features and querying similar patterns
- **Data Validation**: Ensures data integrity and consistency across the system

### Risk Service (Port 3017)
- **Feature Graduation**: Continuous analysis of which market conditions predict success
- **Pattern Matching**: Finds historically similar market conditions
- **Risk Calculation**: Determines optimal stop-loss/take-profit levels
- **A/B Testing**: Compares different risk management approaches

### Shared Libraries
- **Inter-Service Communication**: Standardized client for seamless data flow
- **Configuration Management**: Centralized settings for easy deployment

## Key Innovations

### Range-Based Intelligence
Rather than traditional similarity matching, FluidJournal identifies optimal ranges for market conditions. For example, it knows that gold long trades succeed when volatility is between 0.019-0.034 but fail when volatility exceeds 0.1.

### Position Size Normalization
All analysis accounts for position size differences, ensuring fair comparison between trades of varying contract quantities.

### Bar-Time Accuracy
Uses actual market timestamps rather than server time, ensuring backtesting accuracy and proper temporal analysis.

## Getting Started

```bash
# Start both services
./start-services.ps1

# Storage Agent will be available at http://localhost:3015
# Risk Service will be available at http://localhost:3017
```

## Technology Stack

- **Node.js**: Core runtime for microservices architecture
- **LanceDB**: Vector database optimized for high-dimensional data
- **Express.js**: REST API framework
- **Arrow/Parquet**: Efficient data serialization
- **Statistical Analysis**: Custom algorithms for pattern recognition

## Business Impact

This system transforms trading from reactive to predictive:
- **Reduced Drawdowns**: Avoids trades during historically unfavorable conditions
- **Optimized Risk/Reward**: Dynamically adjusts position sizing based on historical success rates
- **Continuous Improvement**: Gets smarter with every trade, building institutional memory
- **Scalable Architecture**: Microservices design allows for easy expansion and integration

## Prerequisites

- Node.js 18+ (for native fetch support)
- Windows environment (PowerShell scripts included)
- Trading platform integration capability

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/your-username/FluidJournal.git
cd FluidJournal

# Install dependencies for both services
cd agentic_memory/storage-agent && npm install
cd ../risk-service && npm install

# Start both services
./start-services.ps1
```

The system will be available at:
- **Storage Agent**: http://localhost:3015
- **Risk Service**: http://localhost:3017

## API Integration

### Core Endpoints

**Risk Evaluation**
```javascript
POST /api/evaluate-risk
{
  "instrument": "MGC",
  "direction": "long",
  "features": { /* 94+ market features */ }
}
```

**Trade Storage**
```javascript
POST /api/store-vector
{
  "sessionId": "backtest_001",
  "features": { /* market conditions */ },
  "outcome": { "pnl": 150, "exitReason": "profit_target" }
}
```

## Future Development

- Integration with additional trading platforms
- Machine learning enhancements for pattern recognition
- Real-time market regime detection
- Portfolio-level risk management across multiple instruments

---
