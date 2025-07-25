# FluidJournal: Agentic Memory Trading System

## DISCLAIMER: THIS IS EXPERIMENTAL.  TRADING IS RISKY BUSINESS, YOUR RISK IS NOT MINE.

## Problem

Simple algorithmic trading systems suffer from several limitations:

1. **Static Risk Management**: Fixed stop-loss and take-profit parameters that don't adapt to changing market conditions
2. **No Learning from History**: Each trade is treated in isolation without learning from past successes and failures
3. **Pattern Blindness**: Inability to recognize when similar market conditions led to specific outcomes
4. **Overfitting Risk**: Backtesting often leads to strategies that work perfectly on historical data but fail in live trading

These limitations result in:
- Repeated mistakes in similar market conditions
- Suboptimal risk parameters that don't match current volatility
- Inability to detect when a previously profitable pattern stops working
- Poor adaptation to changing market regimes

## Concept

FluidJournal implements an **Agentic Memory System** that revolutionizes trading by giving algorithms the ability to:

1. **Remember**: Store detailed feature vectors (140+ market indicators) for every trade
2. **Learn**: Identify which features correlate with profitable vs unprofitable outcomes
3. **Adapt**: Dynamically adjust risk parameters based on similar historical patterns
4. **Protect**: Implement anti-overfitting mechanisms to prevent pattern exploitation

The system uses **graduated feature matching** to find truly similar market conditions, not just superficial pattern matches. Instead of asking "have we seen this exact pattern before?", it asks "what happened in similar market conditions, and what can we learn?"

### Key Innovation: Range-Based Intelligence

Rather than simple similarity matching, FluidJournal uses range-based analysis:
- Identifies optimal feature ranges from profitable trades (e.g., volatility between 0.019-0.034)
- Rejects trades when key features fall outside profitable ranges
- Provides confidence scores based on how well current conditions match profitable patterns

### Visual: Feature Graduation Process

```
STAGE 1: All Features (140+)           STAGE 2: Graduated Features         STAGE 3: Learned Ranges
┌─────────────────────────────┐       ┌─────────────────────────┐        ┌─────────────────────────┐
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │                         │        │   ATR%: [0.019-0.034] ✓ │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │      ⬤ ATR_percentage   │        │   RSI:  [35.0-65.0]  ✓ │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │  ───> │      ⬤ RSI_14          │  ───>  │   VOL:  [0.8-1.5]    ✓ │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │      ⬤ Volume_ratio     │        │   EMA:  [0.99-1.01]  ✓ │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │      ⬤ EMA_distance     │        │                         │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │      ⬤ Wick_ratio       │        │   Current Query:        │
└─────────────────────────────┘       └─────────────────────────┘        │   ATR%: 0.025 ✓ (85%)   │
     Raw Data Collection                 Feature Correlation               │   RSI:  42.0  ✓ (92%)   │
     (All market metrics)                (Top 10-15 predictive)            │   VOL:  2.1   ✗ (15%)   │
                                                                          │                         │
                                                                          │   REJECT: Low confidence │
                                                                          └─────────────────────────┘
                                                                               Range Intelligence
```

The system evolves from collecting everything → identifying what matters → learning profitable ranges

## Agents

The system consists of specialized agents that work together to create an intelligent, adaptive trading system:

### 1. Storage Agent
**Location**: `/agentic_memory/storage-agent/`

**Role**: The memory keeper of the system
- Stores feature vectors using LanceDB for efficient similarity search
- Captures 140+ features per trade including price action, volume, volatility, and technical indicators
- Records complete trade lifecycle: entry features, exit outcomes, and bar-by-bar profit trajectories
- Handles both real-time storage and historical data ingestion

**Key Capabilities**:
- Vector similarity search across millions of trades
- Trajectory analysis (profit/loss progression over time)
- Data persistence with schema evolution support

### 2. Risk Management Agent
**Location**: `/agentic_memory/risk-service/`

**Role**: The decision maker that learns from experience
- Analyzes incoming trades against historical patterns
- Calculates optimal stop-loss and take-profit levels based on similar past trades
- Implements graduated feature matching to find truly relevant historical patterns
- Provides confidence scores and detailed reasoning for risk decisions

**Key Capabilities**:
- Range-based analysis (identifies profitable vs unprofitable feature ranges)
- Recent trade analysis (prevents repeating recent mistakes)
- Anti-overfitting protection (tracks pattern usage and applies diminishing returns)
- Adaptive risk parameters based on market conditions

### 3. Memory Manager
**Location**: `/agentic_memory/risk-service/memoryManager.js`

**Role**: The intelligence layer that maintains graduated feature importance
- Continuously analyzes which features correlate with profitable outcomes
- Updates feature importance every 30 minutes based on recent trades
- Maintains separate graduation tables for each instrument and direction
- Provides the "graduated features" that other agents use for similarity matching

**Key Capabilities**:
- Feature correlation analysis with P&L outcomes
- Dynamic feature weighting based on predictive power
- Instrument-specific learning (MGC long patterns differ from ES short patterns)
- Statistical significance testing for reliable feature selection

## Their Roles

### Working Together

1. **Trade Entry Flow**:
   - NinjaTrader generates entry signal with market features
   - Risk Agent queries Storage Agent for similar historical patterns
   - Memory Manager provides graduated features for similarity matching
   - Risk Agent returns optimal SL/TP based on historical outcomes
   - Storage Agent records the entry features

2. **Trade Exit Flow**:
   - NinjaTrader reports trade outcome
   - Storage Agent stores complete record with P&L and exit reason
   - Memory Manager updates feature correlations
   - System learns from the outcome for future decisions

3. **Continuous Learning**:
   - Memory Manager analyzes outcomes every 30 minutes
   - Updates graduated feature importance
   - Risk Agent immediately uses updated intelligence
   - System adapts to changing market conditions

### Anti-Overfitting Protection

The agents implement multiple layers of protection against overfitting:

1. **Pattern Usage Tracking**: Risk Agent tracks how many times each pattern is used
2. **Diminishing Returns**: Confidence decreases with each pattern reuse (e.g., 100% → 60% → 36%)
3. **Time Windows**: Prevents rapid reuse of patterns within specified time periods
4. **Exposure Limits**: Hard cap on pattern usage (e.g., max 3 uses per pattern)
5. **Out-of-Sample Validation**: "Do not store" mode for true blind testing

This creates a system that learns from experience while avoiding the trap of memorizing specific market conditions that may never repeat exactly.

## Getting Started

### Prerequisites
- Node.js 18+
- Windows environment (PowerShell scripts provided)
- NinjaTrader 8 or compatible trading platform

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/FluidJournal.git
cd FluidJournal

# Install dependencies for both services
cd agentic_memory/storage-agent && npm install
cd ../risk-service && npm install

# Configure environment variables
# Copy .env.example to .env in both directories and update settings

# Start both services
cd ../.. 
./start-services.ps1
```

Services will be available at:
- **Storage Agent**: http://localhost:3015
- **Risk Service**: http://localhost:3017

### Configuration

See individual agent READMEs for detailed configuration:
- [Storage Agent README](./agentic_memory/storage-agent/README.md)
- [Risk Service README](./agentic_memory/risk-service/README.md)

