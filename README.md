# FluidJournal - Agentic Memory Trading System

A minimal, production-ready trading system using adaptive memory for risk management.

## System Overview

FluidJournal represents a revolutionary simplification of the original Production Curves architecture:
- **From**: 6+ microservices with complex inter-service communication
- **To**: 2 essential services with direct NinjaTrader integration
- **Innovation**: Range-based graduated feature matching for adaptive risk management

## Architecture

```
NinjaTrader 8
    ↓
    ├── Storage Agent (Port 3015)
    │   └── LanceDB Vector Storage
    │       └── Stores trade features & outcomes
    │
    └── Risk Agent (Port 3017)
        └── Graduated Feature Analysis
            └── Dynamic SL/TP recommendations
```

## Prerequisites

- Node.js 18+ (for native fetch support)
- Windows with WSL2 (for development)
- NinjaTrader 8 (for trading integration)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd FluidJournal
```

2. Install dependencies for Storage Agent:
```bash
cd agentic_memory/storage-agent
npm install
npm install @lancedb/vectordb-linux-x64-gnu  # Linux native library
```

3. Install dependencies for Risk Agent:
```bash
cd ../risk-service
npm install
```

## Configuration

### Storage Agent (.env)
```env
PORT=3015
LANCEDB_PATH=./data/vectors
ENABLE_TRADE_CLASSIFIER=true
ENABLE_OFFLINE_PROCESSOR=true
```

### Risk Agent (.env)
```env
PORT=3017
AGENTIC_MEMORY_URL=http://localhost:3015
AGENTIC_MEMORY_ENABLED=true
ENABLE_GP_INTEGRATION=false
SIMILARITY_THRESHOLD=0.10
MIN_PATTERNS_FOR_DECISION=2
```

## Running the Services

### Option 1: PowerShell Script (Windows)
```powershell
.\start-services.ps1
```
This opens both services in separate Windows Terminal tabs.

### Option 2: Manual Start
```bash
# Terminal 1 - Storage Agent
cd agentic_memory/storage-agent
npm start

# Terminal 2 - Risk Agent  
cd agentic_memory/risk-service
npm start
```

## NinjaTrader Integration

### Key Integration Points

1. **Trade Storage**: 
   - NinjaTrader sends unified trade records to Storage Agent
   - Includes sessionId for backtest separation
   - Stores features at entry, outcomes at exit

2. **Risk Evaluation**:
   - NinjaTrader requests risk parameters before trade entry
   - Risk Agent analyzes similar historical patterns
   - Returns adaptive SL/TP recommendations

### API Endpoints

#### Storage Agent (Port 3015)
- `POST /api/store-vector` - Store complete trade record
- `GET /api/sessions/:sessionId/trades` - Get trades by session
- `POST /api/sessions/:sessionId/performance` - Store backtest summary
- `GET /api/vectors` - Query stored vectors
- `GET /health` - Health check

#### Risk Agent (Port 3017)
- `POST /api/evaluate-risk` - Evaluate risk for new trade
- `POST /api/approve-signal` - Legacy signal approval
- `GET /api/analyze-trades/:instrument` - Trade analysis
- `GET /health` - Health check

## Key Features

### Graduated Feature Matching
- Analyzes which features correlate with profitable trades
- Updates feature importance every 30 minutes (bar time)
- Instrument and direction-specific analysis

### Range-Based Intelligence
- Identifies optimal ranges for profitable trades (Q25-Q75)
- Detects when conditions are outside profitable ranges
- Provides confidence scoring based on range fit

### Adaptive Risk Management
- Adjusts SL/TP based on recent trade performance
- Learns from maximum profit/loss patterns
- Never rejects trades - always provides risk parameters

## Troubleshooting

### LanceDB Native Library Error
```bash
npm install @lancedb/vectordb-linux-x64-gnu
```

### Node-fetch Error
The system uses native fetch (Node.js 18+). If you see fetch errors, ensure you're using Node.js 18 or higher.

### Services Not Connecting
1. Check both services are running
2. Verify ports 3015 and 3017 are not in use
3. Check firewall settings

### Empty Database
On first run, the system initializes with a schema record. This is normal and will be populated as trades occur.

## Development

### Adding New Features
1. Update feature generation in NinjaTrader
2. Ensure feature count matches in Storage Agent schema
3. Risk Agent automatically adapts to new features

### Monitoring
- Storage Agent logs all vector storage operations
- Risk Agent logs all risk decisions with reasoning
- Both services provide detailed startup diagnostics

## Migration from Production Curves

This system replaces:
- ❌ MI Service (Market Ingestion) - No longer needed
- ❌ ME Service (Matching Engine) - Direct NT integration
- ❌ RF Service (Random Forest) - Replaced by graduated features
- ❌ Signal Pool Service - Not required
- ❌ Forecasting Service - Not required
- ❌ Kalman Fusion Service - Not required

Only essential services retained:
- ✅ Storage Agent - Vector storage
- ✅ Risk Agent - Adaptive risk management

## License

[Your License Here]

## Support

For issues or questions, please open an issue in the repository.