# Agentic Memory Feature Engineering Plan

## Current Issues
1. ME generates 69 features via `generateSignalFeatures()`
2. Storage expects only 20 features via `extractFeatureVector()`
3. Risk service receives only 9 features from NinjaTrader
4. Pattern matching returns 0 results due to feature mismatch
5. No feature selection/importance mechanism

## Proposed Architecture

### 1. Data Flow
```
Position Entry:
NinjaTrader → MI (OHLCV bars) → ME (generates 69 features) → Store with position

Position Exit:
ME (joins 69 features + outcome) → Agentic Memory Storage → Feature Engineering Service

Signal Approval:
NinjaTrader → Risk Service → ME (get current features) → Feature Selection → Decision
```

### 2. Component Changes

#### A. Storage Agent (Immediate)
- **Current**: Fixed 20-feature schema
- **New**: Dynamic schema that stores ALL features ME provides
- **Changes**:
  ```javascript
  // Instead of fixed featureNames array
  // Store features as JSON object
  {
    id: "signal_123",
    features: { /* all 69 features */ },
    features_vector: Float32Array, // For similarity search
    outcome: { /* pnl, exit reason, etc */ }
  }
  ```

#### B. ME Service (Immediate)
- **Current**: `extractFeatureVector()` reduces 69 → 20 features
- **New**: Send all features to storage
- **Changes**:
  ```javascript
  // In deregisterPosition
  const vectorData = {
    entrySignalId,
    instrument,
    timestamp,
    features: position.fullSignalSpectrum, // All 69 features
    outcome: { /* exit data */ }
  };
  ```

#### C. Feature Engineering Service (New Component)
- **Purpose**: Feature selection, importance ranking, dimensionality reduction
- **Location**: `/production-curves/Production/agentic_memory/feature-engineering/`
- **Responsibilities**:
  1. Analyze stored vectors to identify important features
  2. Calculate feature importance (gradient-based, correlation, mutual information)
  3. Provide feature selection for risk decisions
  4. Update feature weights dynamically

#### D. Risk Service (Update)
- **Current**: Uses 9 features from NinjaTrader
- **New**: Query ME for full features, then apply feature selection
- **Changes**:
  ```javascript
  // On signal approval request
  1. Get current market features from ME
  2. Apply feature selection/weights from Feature Engineering Service
  3. Use selected features for similarity search
  4. Return confidence + TP/SL recommendations
  ```

### 3. Implementation Phases

#### Phase 1: Fix Storage (Immediate)
1. Update storage schema to handle dynamic features
2. Modify ME to send all 69 features
3. Test end-to-end storage with full feature set

#### Phase 2: Feature Engineering Service (Next)
1. Create service to analyze feature importance
2. Implement gradient-based feature selection
3. Calculate feature correlations with outcomes
4. Provide API for feature weights/selection

#### Phase 3: Risk Service Integration (Final)
1. Update risk service to get features from ME
2. Apply feature selection before similarity search
3. Use weighted features for confidence calculation

### 4. Benefits
- **Complete Data**: Store all features for future analysis
- **Adaptive Selection**: Feature importance changes over time
- **Better Matching**: Similarity search uses most relevant features
- **Explainability**: Know which features drive decisions

### 5. Technical Details

#### Storage Schema Update
```javascript
// LanceDB schema
{
  id: string,
  entrySignalId: string,
  instrument: string,
  timestamp: number,
  entryType: string,
  direction: string,
  
  // Store raw features as JSON
  features_json: string, // JSON.stringify(all 69 features)
  
  // Store selected features as vector for similarity
  features_vector: Float32Array, // Selected features only
  feature_names: string[], // Which features are in the vector
  
  // Risk and outcome
  stopLoss: number,
  takeProfit: number,
  pnl: number,
  exitReason: string,
  wasGoodExit: boolean
}
```

#### Feature Selection Algorithm
```python
# Gradient-based feature importance
1. For each feature:
   - Calculate correlation with PnL
   - Calculate mutual information with outcome
   - Track feature stability over time

2. Rank features by:
   - Predictive power
   - Stability
   - Non-redundancy

3. Select top N features for vector similarity
```

### 6. Migration Path
1. Keep current 20-feature extraction as fallback
2. Add new fields to storage without breaking existing
3. Gradually transition to dynamic feature selection
4. Monitor performance improvements

### 7. Success Metrics
- Similarity search returns relevant patterns (not 0)
- Confidence scores correlate with actual outcomes
- Feature importance rankings are stable but adaptive
- Risk recommendations improve P&L