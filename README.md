# FluidJournal

**Intelligent Trade Storage & Equity Curve Balancing System**

FluidJournal is an adaptive risk management system that learns from your trading history to balance equity curves and prevent costly repeated mistakes. By storing market conditions and trade outcomes in a high-performance vector database, it intelligently adjusts risk parameters based on what actually worked in similar historical situations.

## The Challenge

Traditional algorithmic trading systems lack memory—they can't learn from past mistakes or adapt to changing market conditions. A strategy might consistently lose money during high volatility periods but continue making the same trades because it has no historical context to guide better decisions.

## Our Approach

FluidJournal solves this through **intelligent storage** and **dynamic equity curve balancing**:

### Trade Data Storage
- **Comprehensive Feature Capture**: Records 94+ market characteristics for every trade including volatility ratios, momentum indicators, price efficiency metrics, and technical patterns
- **LanceDB Vector Database**: Stores high-dimensional trading data with millisecond query performance
- **Complete Trade Lifecycle**: Tracks positions from entry through exit with precise market timing and outcome data

### Equity Curve Balancing
- **Historical Pattern Matching**: Before each trade, queries the database for similar historical market conditions
- **Directional Bias Intelligence**: Tips the scales toward profitable directions by analyzing recent long vs short performance
- **Dynamic Risk Adjustment**: Optimizes stop-loss and take-profit levels based on what worked in comparable past situations
- **Loss Pattern Avoidance**: Probabilistically rejects trades when market conditions match historical loss patterns

## How It Works

When evaluating a potential trade:

1. **Market State Analysis**: Current market features are extracted (volatility, momentum, etc.)
2. **Historical Query**: System searches stored data for trades in similar market conditions
3. **Outcome Analysis**: Evaluates profit/loss patterns from historical matches
4. **Risk Optimization**: Calculates optimal risk parameters based on successful historical trades
5. **Directional Assessment**: Considers recent directional performance to bias toward profitable patterns
6. **Continuous Learning**: Stores new trade outcomes to improve future decisions

## System Architecture

### Storage Agent (`localhost:3015`)
- **LanceDB Integration**: High-performance vector storage optimized for trading data
- **Data Validation**: Ensures trade data integrity and consistency
- **Query Engine**: Fast similarity search across historical trade patterns
- **REST API**: Clean endpoints for storing and retrieving trade data

### Risk Service (`localhost:3017`)
- **FluidRiskModel**: Continuous probability-based risk evaluation engine
- **Directional Bias Analysis**: Probabilistic rejection system to favor profitable directions  
- **Feature Analysis**: Statistical correlation between market conditions and outcomes
- **Risk Parameter Calculation**: Dynamic stop-loss and take-profit optimization
- **Equity Curve Tracking**: Real-time monitoring of trading performance

## Key Innovations

### FluidRiskModel Engine
Replaces rigid if/then decision trees with continuous probability functions that evaluate:
- **Equity Protection** (30%): Recent performance and drawdown analysis
- **Market Regime Fit** (25%): Statistical alignment with profitable market conditions
- **Loss Avoidance** (25%): K-nearest neighbor analysis to avoid historically unprofitable patterns
- **Profit Similarity** (20%): Kernel-weighted matching to profitable historical trades

### Directional Bias Intelligence  
Analyzes recent long vs short performance to probabilistically reject trades in underperforming directions. This "tips the scales" toward more profitable directional patterns without completely blocking any direction.

### Position-Size Normalized Analysis
All comparisons account for position size differences, ensuring fair analysis between trades of varying contract quantities using per-contract PnL normalization.

## Getting Started

### Prerequisites
- Node.js 18+
- Windows environment (PowerShell scripts provided)
- Trading platform with REST API integration capability

### Installation

```bash
# Clone the repository
git clone https://github.com/CaptrainWalrus/FluidJournal.git
cd FluidJournal

# Install dependencies for both services
cd agentic_memory/storage-agent && npm install
cd ../risk-service && npm install

# Start both services
./start-services.ps1
```

Services will be available at:
- **Storage Agent**: http://localhost:3015
- **Risk Service**: http://localhost:3017

### Integration

#### Risk Evaluation
```javascript
POST http://localhost:3017/api/evaluate-risk
{
  "instrument": "MGC",
  "direction": "long", 
  "features": {
    "close_price": 2750.5,
    "atr_percentage": 0.025,
    "volume_ratio": 1.2,
    "rsi_14": 45.8,
    // ... 90+ additional market features
  },
  "timestamp": 1642680000000
}

// Response
{
  "approved": true,
  "confidence": 0.78,
  "suggested_sl": 12,
  "suggested_tp": 25,
  "reasons": ["Fluid risk analysis: 78.0% confidence", ...],
  "risk_model": "fluid-v1"
}
```

#### Trade Storage
```javascript
POST http://localhost:3015/api/store-vector
{
  "sessionId": "live_trading",
  "instrument": "MGC", 
  "direction": "long",
  "features": { /* market conditions */ },
  "outcome": {
    "pnl": 180,
    "pnlPerContract": 180, 
    "exitReason": "profit_target",
    "maxProfit": 220,
    "maxLoss": -45
  },
  "timestamp": 1642680000000
}
```

## Technology Stack

- **Node.js**: Microservices runtime with native fetch support
- **LanceDB**: Apache Arrow-based vector database for high-dimensional data
- **Express.js**: RESTful API framework
- **Statistical Analysis**: Custom algorithms for pattern recognition and risk optimization

## Business Impact

FluidJournal transforms trading from reactive to adaptive:

- **Reduced Drawdowns**: Automatically avoids trades during historically unfavorable market conditions
- **Optimized Risk/Reward**: Dynamically adjusts position sizing and risk parameters based on proven historical outcomes  
- **Directional Intelligence**: Biases trade approval toward recently profitable directions
- **Continuous Improvement**: System becomes more intelligent with every completed trade
- **Institutional Memory**: Never forgets what worked and what didn't in specific market conditions

---

*Built for serious algorithmic traders who want their systems to learn from experience and adapt to market conditions.*
