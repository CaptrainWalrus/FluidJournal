# Risk Service Architecture Fix

## Current (Wrong) Flow:
1. NT → Risk: "Should I enter long?"
2. Risk → MI: Gets bars
3. Risk: Generates 24 features from bars
4. Risk → Storage: Query with 24 features
5. Storage: Can't match because it has 94-feature vectors
6. Result: 0 matches, falls back to rules

## Correct Flow:
1. NT → Risk: "Should I enter long at price X?"
2. Risk → ME: "Get current features for MGC"
3. ME: Returns 94 features (same as stored)
4. Risk → Storage: Query with 94 features
5. Storage: Finds similar patterns
6. Risk: Analyzes patterns using gradient-selected features
7. Result: Informed decision based on history

## Implementation Changes Needed:

### 1. Add ME endpoint to get current features:
```javascript
// In ME
router.get('/api/features/:instrument', (req, res) => {
    const features = generateSignalFeatures(instrument);
    res.json({ features });
});
```

### 2. Update Risk Service to use ME features:
```javascript
// Instead of generating features from MI bars
const meResponse = await axios.get(`${ME_URL}/api/features/${instrument}`);
const features = meResponse.data.features;
```

### 3. Feature Selection Process:
- Risk Service maintains a gradient-based ranking of feature importance
- Updates this ranking as more data is collected
- Uses top N features for decision logic
- But queries storage with ALL features for matching

## Benefits:
1. Consistent feature generation (ME only)
2. Storage queries will actually find matches
3. Risk can focus on pattern analysis, not feature engineering
4. System can learn which features matter most