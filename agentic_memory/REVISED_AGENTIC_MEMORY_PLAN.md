# Agentic Memory System - Revised Implementation Plan

## Overview

The Agentic Memory system provides a persistent, vectorized storage layer for trading features and outcomes. It captures feature vectors from ME (Matching Engine), stores them in LanceDB, and enables three specialized agents to learn from historical patterns to dynamically adjust risk values.

## Core Concept

### Current Approach
- Features are calculated in ME and used immediately for decisions
- No persistent memory of past trades and their outcomes
- Risk values (SL/TP) are static, not learning from results
- Each trade decision is made in isolation
- Training data collected but not used in real-time

### Proposed Approach
- ME passes feature arrays + metadata to Agentic Memory after each position close
- Vectors stored in LanceDB for efficient similarity search
- Three specialized agents: Storage, Gradient Analysis, Risk Management
- System learns optimal SL/TP/PBL from both wins and losses
- Reuses existing feature generation from `positionTrackingService.js`

## Architecture

### Components

1. **Storage Agent Service**
   - Technology: Node.js/Express + LanceDB
   - Purpose: Store ALL feature vectors from ME deregistration
   - Key Responsibilities:
     - Accept feature vectors via HTTP API
     - Store in LanceDB with metadata
     - Maintain vector indices for fast retrieval
     - Handle data rotation/archival

2. **Gradient Analyzer Agent**
   - Technology: Python + NumPy/Pandas
   - Purpose: Identify high-gradient features from historical data
   - Key Responsibilities:
     - Calculate feature gradients over time windows
     - Identify features with high variation AND outcome correlation
     - Maintain list of "graduated" features
     - Update feature importance scores

3. **Risk Management Agent**
   - Technology: Node.js + LanceDB queries
   - Purpose: Calculate optimal SL, TP, and Soft TP based on similar patterns
   - Key Responsibilities:
     - Find similar historical patterns using graduated features
     - Calculate optimal risk levels from successful trades
     - Generate progressive stop levels (PBL)
     - Provide risk recommendations to ME

### Data Flow
```
NinjaTrader
    ↓ (trade execution)
    MI Service
    ↓ (position tracking)
    ME Service (deregisterPosition)
    ↓ (feature vector + outcome)
    Storage Agent → LanceDB
         ↓
    Gradient Analyzer (periodic)
         ↓
    Risk Management Agent
         ↓
    ME Service (risk updates)
```

### Integration Points
- **ME → Storage Agent**: POST feature vectors on position close
- **Storage Agent → LanceDB**: Vector persistence with metadata
- **Gradient Analyzer → LanceDB**: Query vectors for analysis
- **Risk Agent → LanceDB**: Similarity search for patterns
- **Risk Agent → ME**: Update risk parameters via API

## Key Integration Points

### 1. **Feature Generation (Already Exists)**
- **Location**: `positionTrackingService.js::generateSignalFeatures()`
- **Current Features**: 50+ percentage-based features including:
  - Price-based: `price_range_pct`, `body_pct`, `wick_pct`
  - EMA-based: `ema9_distance_pct`, `ema_cross_signal`
  - Volume-based: `volume_vs_ma_pct`, `volume_spike_ratio`
  - Volatility: `atr_pct`, `true_range_pct`
  - Momentum: `rsi_14`, `price_momentum_1min`, `price_momentum_5min`
  - Time-based: `hour_of_day`, `session_phase`
  - Imbalance: `buying_pressure`, `selling_pressure`

### 2. **Outcome Tracking (Already Exists)**
- **Location**: `positionTrackingService.js::deregisterPosition()`
- **Current Data**: Complete training record with:
  - Entry conditions
  - Risk parameters used
  - Full feature spectrum (`position.fullSignalSpectrum`)
  - Outcome data (PnL, exit reason, holding bars)
  - MaxProfit/MaxLoss calculations

## Three-Agent Architecture

### **Agent 1: Continuous Storage Agent** 📊

**Purpose**: Store ALL feature vectors from ME deregistration with LanceDB

**Integration with ME**:
```javascript
// In deregisterPosition() - around line 799
if (AGENTIC_MEMORY_ENABLED) {
    // Extract feature vector from existing data
    const featureVector = {
        // Position metadata
        entrySignalId,
        instrument: position.instrument,
        timestamp: position.positionEntryTimestamp,
        entryType: position.ibiCondition || position.patternUuid,
        
        // Feature array (from your existing feature set)
        features: [
            // Price features
            completeRecord.technicalIndicators.price_range_pct,
            completeRecord.technicalIndicators.body_pct,
            completeRecord.technicalIndicators.upper_wick_pct,
            completeRecord.technicalIndicators.lower_wick_pct,
            
            // EMA features
            completeRecord.technicalIndicators.ema9_distance_pct,
            completeRecord.technicalIndicators.ema21_distance_pct,
            completeRecord.technicalIndicators.ema9_vs_ema21_pct,
            completeRecord.technicalIndicators.ema_cross_signal,
            
            // Volume features
            completeRecord.technicalIndicators.volume_vs_ma_pct,
            completeRecord.technicalIndicators.volume_spike_ratio,
            
            // Volatility features
            completeRecord.technicalIndicators.atr_pct,
            completeRecord.technicalIndicators.true_range_pct,
            
            // Momentum features
            completeRecord.technicalIndicators.rsi_14,
            completeRecord.technicalIndicators.price_momentum_1min,
            completeRecord.technicalIndicators.price_momentum_5min,
            
            // Imbalance features
            completeRecord.technicalIndicators.buying_pressure,
            completeRecord.technicalIndicators.selling_pressure,
            completeRecord.technicalIndicators.price_pressure
        ],
        
        // Risk values used
        riskUsed: {
            stopLoss: position.stopLoss,
            takeProfit: position.takeProfit,
            virtualStop: position.virtualStop
        },
        
        // Outcomes
        outcome: {
            pnl: completeRecord.outcomeData.pnlDollars,
            pnlPoints: completeRecord.outcomeData.pnlPoints,
            holdingBars: completeRecord.outcomeData.holdingBars,
            exitReason: completeRecord.outcomeData.exitReason,
            maxProfit: completeRecord.MaxProfit,
            maxLoss: completeRecord.MaxLoss,
            wasGoodExit: completeRecord.outcomeData.wasGoodExit
        }
    };
    
    // Send to Agentic Memory
    await agenticMemoryClient.storeVector(featureVector);
}
```

**Technology**:
```javascript
// storage-agent/server.js
const lancedb = require('vectordb');
const express = require('express');

class StorageAgent {
    async initialize() {
        this.db = await lancedb.connect('./data/trading_memory');
        
        // Schema matching your features
        const schema = {
            timestamp: 'int64',
            instrument: 'string',
            entryType: 'string',
            features: 'float32[]',  // Your 18+ core features
            
            // Risk values
            stopLoss: 'float32',
            takeProfit: 'float32',
            virtualStop: 'float32',
            
            // Outcomes
            pnl: 'float64',
            pnlPoints: 'float32',
            holdingBars: 'int32',
            exitReason: 'string',
            maxProfit: 'float32',
            maxLoss: 'float32',
            wasGoodExit: 'bool'
        };
        
        this.table = await this.db.createTable('feature_vectors', schema);
    }
}
```

### **Agent 2: Feature Selection Agent (Gradient Analyzer)** 📈

**Purpose**: Identify high-gradient features from your existing feature set

**Core Logic**:
```python
class GradientAnalyzer:
    # Your core features from e2e_feature_backtest_optimizer.py
    CORE_FEATURES = [
        'price_momentum_1min',
        'price_momentum_5min', 
        'volume_spike_ratio',
        'rsi_14',
        'atr_pct',
        'ema9_distance_pct',
        'buying_pressure',
        'selling_pressure'
    ]
    
    def calculate_feature_gradients(self, window='30m'):
        # Query recent vectors
        query = f"""
        SELECT features, timestamp, pnl
        FROM feature_vectors
        WHERE timestamp > now() - interval '{window}'
        ORDER BY timestamp
        """
        
        df = self.table.to_pandas(query)
        
        # Calculate gradients for each feature
        gradients = {}
        for idx, feature_name in enumerate(self.CORE_FEATURES):
            feature_values = df['features'].apply(lambda x: x[idx])
            
            # Gradient metrics
            gradients[feature_name] = {
                'std': np.std(feature_values),
                'range': np.ptp(feature_values),
                'gradient_mean': np.mean(np.abs(np.gradient(feature_values))),
                'outcome_correlation': np.corrcoef(feature_values, df['pnl'])[0,1]
            }
        
        # Select features with high variation AND outcome correlation
        graduated_features = self.select_by_importance(gradients)
        return graduated_features
```

### **Agent 3: Risk Management Agent** 🎯

**Purpose**: Calculate optimal SL, TP, and Soft TP based on similar patterns

**Integration**:
```javascript
class RiskManagementAgent {
    async calculateRiskLevels(currentFeatures, direction, entryType) {
        // 1. Get graduated features (high-gradient only)
        const graduatedIndices = await this.gradientAgent.getGraduatedIndices();
        
        // 2. Extract only graduated features for similarity search
        const queryVector = graduatedIndices.map(idx => currentFeatures[idx]);
        
        // 3. Find similar historical patterns
        const similarPatterns = await this.table
            .search(queryVector)
            .where(`entryType = '${entryType}' AND wasGoodExit = true`)
            .limit(500)
            .execute();
        
        // 4. Calculate risk levels from successful trades
        const riskLevels = this.calculateOptimalRiskFromPatterns(similarPatterns);
        
        return {
            stopLoss: riskLevels.stopLoss,
            takeProfit: riskLevels.takeProfit,
            softTakeProfit: riskLevels.pblLevels  // Progressive stops
        };
    }
    
    calculatePBLLevels(patterns) {
        // Group by profit achieved
        const profitBuckets = [10, 20, 30, 50, 75, 100];
        const pblLevels = [];
        
        for (let targetProfit of profitBuckets) {
            // Find trades that reached this profit
            const reachedTarget = patterns.filter(p => p.maxProfit >= targetProfit);
            
            if (reachedTarget.length > 30) {
                // Calculate safe trailing stop at this level
                const drawdowns = reachedTarget.map(p => {
                    // How much did price pull back after reaching target?
                    return p.maxProfit - p.pnlPoints;
                });
                
                // Use 80th percentile as safe trailing stop
                const safeTrail = this.percentile(drawdowns, 80);
                
                pblLevels.push({
                    triggerProfit: targetProfit,
                    trailingStop: Math.min(safeTrail, targetProfit * 0.5),
                    confidence: reachedTarget.length / patterns.length,
                    successRate: reachedTarget.filter(p => p.pnl > 0).length / reachedTarget.length
                });
            }
        }
        
        return pblLevels;
    }
}
```

## Implementation Changes to ME

### 1. **Add Agentic Memory Client**
```javascript
// In positionTrackingService.js
const agenticMemoryClient = require('./agenticMemoryClient');

// Configuration
const AGENTIC_MEMORY_ENABLED = process.env.AGENTIC_MEMORY_ENABLED === 'true';
const AGENTIC_MEMORY_URL = process.env.AGENTIC_MEMORY_URL || 'http://localhost:3015';
```

### 2. **Modify deregisterPosition()**
```javascript
// After line 799 in existing deregisterPosition
// Right after the training data collection
if (AGENTIC_MEMORY_ENABLED && completeTrainingRecord) {
    try {
        // Convert training record to vector format
        const vectorData = {
            entrySignalId,
            instrument: position.instrument,
            timestamp: position.positionEntryTimestamp,
            entryType: position.ibiCondition || position.patternUuid,
            
            // Extract feature array in consistent order
            features: extractFeatureVector(completeTrainingRecord),
            
            // Risk parameters
            riskUsed: {
                stopLoss: position.stopLoss || 10,
                takeProfit: position.takeProfit || 20,
                virtualStop: position.virtualStop
            },
            
            // Outcomes
            outcome: {
                pnl: exitOutcome.pnlDollars,
                pnlPoints: exitOutcome.pnlPoints,
                holdingBars: currentBarsSinceEntry,
                exitReason: exitOutcome.exitReason,
                maxProfit: completeTrainingRecord.MaxProfit,
                maxLoss: completeTrainingRecord.MaxLoss,
                wasGoodExit: exitOutcome.wasGoodExit
            }
        };
        
        await agenticMemoryClient.storeVector(vectorData);
        console.log(`[AGENTIC-MEMORY] Stored vector for ${entrySignalId}`);
        
    } catch (error) {
        console.error(`[AGENTIC-MEMORY] Failed to store vector: ${error.message}`);
        // Don't break deregistration on memory errors
    }
}
```

### 3. **Feature Extraction Helper**
```javascript
// New function in positionTrackingService.js
function extractFeatureVector(trainingRecord) {
    // Extract features in consistent order matching your Python features
    const features = [];
    
    // Price-based features (matching e2e_feature_backtest_optimizer.py)
    features.push(trainingRecord.price_change_pct_1 || 0);
    features.push(trainingRecord.price_change_pct_5 || 0);
    features.push(trainingRecord.momentum_5 || 0);
    
    // Volume features
    features.push(trainingRecord.volume_spike_3bar || 0);
    features.push(trainingRecord.volume_ma_ratio || 0);
    
    // Technical indicators
    features.push(trainingRecord.rsi || 0);
    features.push(trainingRecord.bb_position || 0);
    features.push(trainingRecord.bb_width || 0);
    features.push(trainingRecord.atr_pct || 0);
    
    // EMA features
    features.push(trainingRecord.ema_spread_pct || 0);
    features.push(trainingRecord.ema9_slope || 0);
    
    // New percentage-based features from ME
    features.push(trainingRecord.ema9_distance_pct || 0);
    features.push(trainingRecord.price_momentum_1min || 0);
    features.push(trainingRecord.volume_vs_ma_pct || 0);
    features.push(trainingRecord.buying_pressure || 0);
    features.push(trainingRecord.selling_pressure || 0);
    
    return new Float32Array(features);
}
```

## Benefits of This Approach

1. **Zero Feature Recreation** - Uses existing `generateSignalFeatures()`
2. **Seamless Integration** - Hooks into existing `deregisterPosition()`
3. **Consistent Features** - Matches your Python backtesting features
4. **Progressive Risk** - Learns optimal PBL levels from outcomes
5. **Efficient Storage** - LanceDB handles vectors natively

## Implementation Phases

### Phase 1: Storage Agent Foundation (Status: ⏳)
**Goal**: Establish LanceDB storage and basic vector operations

#### Tasks:
- [ ] Task 1.1: Create Storage Agent service structure
  - New File: `agentic_memory/storage-agent/server.js`
  - Purpose: Express server with vector endpoints
  - Size: ~150 lines

- [ ] Task 1.2: Implement LanceDB integration
  - New File: `agentic_memory/storage-agent/src/vectorStore.js`
  - Purpose: LanceDB table creation and operations
  - Size: ~250 lines
  
- [ ] Task 1.3: Create vector schema and models
  - New File: `agentic_memory/storage-agent/src/models/featureVector.js`
  - Purpose: Define vector schema matching ME features
  - Size: ~100 lines

- [ ] Task 1.4: Add agenticMemoryClient to ME
  - New File: `production-curves/Production/matching-engine-service/src/clients/agenticMemoryClient.js`
  - Purpose: HTTP client for sending vectors
  - Size: ~100 lines

- [ ] Task 1.5: Integrate into deregisterPosition
  - File: `production-curves/Production/matching-engine-service/src/services/ec/positionTrackingService.js`
  - Changes: Add vector storage call after line 799
  - Lines: ~30 (modification)

✅ **Phase 1 Success Criteria:**
- ME successfully sends vectors to Storage Agent
- Vectors stored in LanceDB with proper schema
- Basic query API returns stored vectors
- No impact on existing ME performance

### Phase 2: Gradient Analyzer Implementation (Status: ⏸️)
**Goal**: Identify high-gradient features for optimization

#### Tasks:
- [ ] Task 2.1: Create Gradient Analyzer service
  - New File: `agentic_memory/gradient-analyzer/app.py`
  - Purpose: Python service for gradient analysis
  - Size: ~200 lines

- [ ] Task 2.2: Implement feature gradient calculations
  - New File: `agentic_memory/gradient-analyzer/src/gradient_calculator.py`
  - Purpose: Calculate feature importance metrics
  - Size: ~250 lines

- [ ] Task 2.3: Create LanceDB query interface
  - New File: `agentic_memory/gradient-analyzer/src/vector_client.py`
  - Purpose: Query vectors from Storage Agent
  - Size: ~150 lines

- [ ] Task 2.4: Implement graduation logic
  - New File: `agentic_memory/gradient-analyzer/src/feature_selector.py`
  - Purpose: Select high-importance features
  - Size: ~200 lines

✅ **Phase 2 Success Criteria:**
- Gradients calculated for all features
- Top 8-10 features identified as graduated
- API returns graduated feature indices
- Updates every 30 minutes

### Phase 3: Risk Management Agent (Status: ⏸️)
**Goal**: Dynamic risk parameter calculation

#### Tasks:
- [ ] Task 3.1: Create Risk Management service
  - New File: `agentic_memory/risk-agent/server.js`
  - Purpose: Express server for risk calculations
  - Size: ~150 lines

- [ ] Task 3.2: Implement similarity search
  - New File: `agentic_memory/risk-agent/src/patternMatcher.js`
  - Purpose: Find similar historical patterns
  - Size: ~250 lines

- [ ] Task 3.3: Create risk optimization logic
  - New File: `agentic_memory/risk-agent/src/riskOptimizer.js`
  - Purpose: Calculate optimal SL/TP from patterns
  - Size: ~300 lines

- [ ] Task 3.4: Implement PBL calculator
  - New File: `agentic_memory/risk-agent/src/pblCalculator.js`
  - Purpose: Progressive stop level calculation
  - Size: ~200 lines

- [ ] Task 3.5: Add ME risk update endpoint
  - File: `production-curves/Production/matching-engine-service/server.js`
  - Changes: Add endpoint to receive risk updates
  - Lines: ~50 (modification)

✅ **Phase 3 Success Criteria:**
- Risk Agent finds relevant patterns (>100 matches)
- Calculates context-aware SL/TP values
- Generates 3-5 PBL levels per trade
- ME accepts and uses dynamic risk values

### Phase 4: Production Integration (Status: ⏸️)
**Goal**: Full system deployment and monitoring

#### Tasks:
- [ ] Task 4.1: Create agent orchestration
  - New File: `agentic_memory/orchestrator/index.js`
  - Purpose: Coordinate all three agents
  - Size: ~200 lines

- [ ] Task 4.2: Implement monitoring dashboard
  - New File: `agentic_memory/monitoring/server.js`
  - Purpose: Track agent performance
  - Size: ~250 lines

- [ ] Task 4.3: Add performance metrics
  - File: All agent services
  - Changes: Add metric collection
  - Lines: ~30 per service

- [ ] Task 4.4: Create backup/recovery system
  - New File: `agentic_memory/storage-agent/src/backup.js`
  - Purpose: LanceDB backup management
  - Size: ~150 lines

✅ **Phase 4 Success Criteria:**
- All agents running in production
- Risk improvements measurable
- System handles 1000+ vectors/day
- Backup/recovery tested

## File Organization

### Agentic Memory Directory Structure
```
agentic_memory/
├── storage-agent/
│   ├── src/
│   │   ├── models/
│   │   │   └── featureVector.js (~100 lines)
│   │   ├── routes/
│   │   │   ├── vectors.js (~150 lines)
│   │   │   └── query.js (~100 lines)
│   │   ├── vectorStore.js (~250 lines)
│   │   └── backup.js (~150 lines)
│   ├── server.js (~150 lines)
│   └── package.json
├── gradient-analyzer/
│   ├── src/
│   │   ├── gradient_calculator.py (~250 lines)
│   │   ├── vector_client.py (~150 lines)
│   │   └── feature_selector.py (~200 lines)
│   ├── app.py (~200 lines)
│   └── requirements.txt
├── risk-agent/
│   ├── src/
│   │   ├── patternMatcher.js (~250 lines)
│   │   ├── riskOptimizer.js (~300 lines)
│   │   └── pblCalculator.js (~200 lines)
│   ├── server.js (~150 lines)
│   └── package.json
├── orchestrator/
│   └── index.js (~200 lines)
├── monitoring/
│   ├── server.js (~250 lines)
│   └── public/
│       └── dashboard.html
└── docker-compose.yml
```

### File Size Planning
- **Large Logic Split Strategy**: 
  - riskOptimizer.js split into:
    - `slOptimizer.js` (~150 lines) - Stop loss calculation
    - `tpOptimizer.js` (~150 lines) - Take profit calculation

## Implementation Status

### Overall Progress: 0% Complete

### Phase Status:
- ⏳ Phase 1: Storage Agent Foundation - PLANNED
- ⏸️ Phase 2: Gradient Analyzer - WAITING
- ⏸️ Phase 3: Risk Management - WAITING
- ⏸️ Phase 4: Production Integration - WAITING

### Recent Updates:
- **2025-01-10**: Initial plan created
- **2025-01-10**: Revised to use LanceDB and integrate with existing ME

### Known Issues:
- ⚠️ **Risk 1**: Vector storage growth - Mitigation: Rotation after 1M vectors
- ⚠️ **Risk 2**: Query performance at scale - Mitigation: LanceDB indices
- ⚠️ **Risk 3**: Feature drift - Mitigation: Periodic retraining

## Testing Strategy

### Unit Tests
1. **Storage Agent Tests**
   - `vectorStore.test.js` - CRUD operations
   - `backup.test.js` - Backup/restore functionality

2. **Gradient Analyzer Tests**
   - `test_gradient_calculator.py` - Gradient math validation
   - `test_feature_selector.py` - Selection logic

3. **Risk Agent Tests**
   - `patternMatcher.test.js` - Similarity search
   - `riskOptimizer.test.js` - Risk calculations

### Integration Tests
- ME → Storage Agent flow
- Full vector lifecycle test
- Risk update propagation

### Performance Tests
- Vector insertion rate (target: >100/sec)
- Query response time (target: <50ms)
- Gradient calculation time (target: <5min for 100k vectors)

## Deployment Considerations

### Environment Variables
```bash
# Storage Agent
STORAGE_PORT=3015
LANCEDB_PATH=./data/vectors
VECTOR_RETENTION_DAYS=90

# Gradient Analyzer
GRADIENT_PORT=3016
ANALYSIS_INTERVAL=1800000  # 30 minutes
MIN_VECTORS_FOR_ANALYSIS=1000

# Risk Agent
RISK_PORT=3017
MIN_SIMILAR_PATTERNS=30
SIMILARITY_THRESHOLD=0.85

# Common
AGENTIC_MEMORY_ENABLED=true
ME_SERVICE_URL=http://localhost:5000
```

### Dependencies
- LanceDB (vectordb npm package)
- NumPy/Pandas for gradient analysis
- ME Service must be running
- ~2GB storage for vector data

### Resource Requirements
- **Storage Agent**: 512MB RAM, low CPU
- **Gradient Analyzer**: 1GB RAM, medium CPU (during analysis)
- **Risk Agent**: 512MB RAM, low CPU
- **Total**: ~2GB RAM, 20-30% CPU utilization

## Monitoring Integration

### Metrics to Track
- Vector insertion rate
- Storage size growth
- Query performance (p50, p95, p99)
- Gradient analysis duration
- Risk calculation accuracy
- Feature drift indicators

### Logging Strategy
- All vector operations logged with timestamps
- Gradient changes tracked with reasoning
- Risk adjustments logged with confidence scores
- Performance metrics exported to monitoring

## Cost Projections

- **Storage**: ~$5/month for 1M vectors
- **Compute**: Minimal (uses existing infrastructure)
- **Development**: ~2 weeks for full implementation
- **ROI**: 2-5% improvement in win rate expected

## Next Steps

1. **Immediate**: Set up Storage Agent with LanceDB
2. **Week 1**: Complete Phase 1 and validate with ME
3. **Week 2**: Implement Gradient Analyzer
4. **Week 3**: Deploy Risk Agent and full integration
5. **Ongoing**: Monitor and optimize based on results

This design reuses ALL your existing infrastructure while adding powerful learning capabilities!