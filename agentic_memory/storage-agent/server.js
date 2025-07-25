const express = require('express');
const cors = require('cors');
require('dotenv').config();

// DEBUG: Check environment variables after loading .env
console.log('🔍 [ENV-CHECK] LANCEDB_PATH:', process.env.LANCEDB_PATH);
console.log('🔍 [ENV-CHECK] FORCE_STORE_ALL:', process.env.FORCE_STORE_ALL);

const vectorStore = require('./src/vectorStore');
console.log('🔍 [ENV-CHECK] VectorStore dbPath:', vectorStore.dbPath);
const TradeClassifier = require('./src/tradeClassifier');
const PatternClusterer = require('./src/patternClusterer');
const OfflineProcessor = require('./src/offlineProcessor');
const ModelReset = require('./src/modelReset');

// Simple console logging (like risk agent)
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

const app = express();
const PORT = process.env.STORAGE_PORT || 3015;

// Phase 2: Initialize Trade Classifier and Pattern Clusterer
const tradeClassifier = new TradeClassifier();
const patternClusterer = new PatternClusterer();
console.log('Enhanced Storage Agent: Trade classifier and pattern clusterer initialized with 140-feature support and duration prediction');

// Phase 3: Initialize Offline Processing System
const offlineProcessor = new OfflineProcessor();
console.log('Offline processor initialized for Phase 3 qualified training data');

// Phase 4: Initialize Model Reset System
const modelReset = new ModelReset(vectorStore, offlineProcessor);
console.log('Model reset system initialized for clean retraining');

// Sampling for trajectory feature logging (100% sample rate for testing)
const SAMPLE_RATE = 1.0;
function shouldSample() {
  return Math.random() < SAMPLE_RATE;
}

function logProfitByBar(outcome, prefix = '') {
  if (outcome && outcome.profitByBar) {
    const profitByBar = outcome.profitByBar;
    const barCount = Object.keys(profitByBar).length;
    const profitValues = Object.values(profitByBar).map(v => Number(v).toFixed(2));
    const finalPnL = profitValues[profitValues.length - 1] || '0.00';
    
    // Focus on terminal output only
    console.log(`💰 [PROFIT-BY-BAR${prefix}] ${barCount} bars: [${profitValues.join(', ')}] → Final: $${finalPnL}`);
  } else {
    console.log(`💰 [PROFIT-BY-BAR${prefix}] No profitByBar data found`);
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files for the explorer UI
app.use(express.static('public'));
app.use('/ui', express.static('ui'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 [REQUEST] ${req.method} ${req.path}`, {
    headers: req.headers['content-type'],
    bodySize: req.body ? JSON.stringify(req.body).length : 0,
    timestamp: new Date().toISOString()
  });
  
  // Special logging for store-vector endpoint
  if (req.path === '/api/store-vector' && req.method === 'POST') {
    console.log(`🎯 [STORE-VECTOR REQUEST] Body keys:`, Object.keys(req.body || {}));
    if (req.body && req.body.outcome) {
      console.log(`🎯 [STORE-VECTOR REQUEST] Outcome keys:`, Object.keys(req.body.outcome));
      console.log(`🎯 [STORE-VECTOR REQUEST] Has profitByBar:`, !!req.body.outcome.profitByBar);
    }
  }
  
  // Simple console log for request tracking
  // Note: Already logging above with console.log
  next();
});

// Health check endpoint with enhanced capabilities
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'agentic-memory-storage-agent',
    version: '2.0.0-enhanced',
    features: {
      vectorCount: 140,
      durationPrediction: true,
      moveClassification: true,
      sustainabilityScoring: true
    },
    timestamp: new Date().toISOString()
  });
});

// Test logging endpoint
app.get('/test-log', (req, res) => {
  // Try multiple output methods
  console.log('🧪 CONSOLE.LOG: This should appear in terminal');
  console.error('🧪 CONSOLE.ERROR: Error stream test');
  process.stdout.write('🧪 STDOUT: Direct stdout write\n');
  process.stderr.write('🧪 STDERR: Direct stderr write\n');
  
  // Test profitByBar logging function
  const testOutcome = {
    profitByBar: {
      "0": -5.20,
      "1": 8.10,
      "2": 23.40
    }
  };
  
  logProfitByBar(testOutcome, ' - TEST');
  
  // Also try immediate response
  console.log('🧪 BEFORE RESPONSE: About to send response');
  
  res.json({ 
    message: 'Logging tests executed - check terminal for output',
    timestamp: new Date().toISOString(),
    processStdout: typeof process.stdout,
    consoleLog: typeof console.log
  });
  
  console.log('🧪 AFTER RESPONSE: Response sent');
});

// Store feature vector from ME deregisterPosition (LEGACY - will be replaced by split storage)
app.post('/api/store-vector', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // NINJATRADER PAYLOAD INSPECTOR
    console.log('\n🔍 [NT-PAYLOAD] Full request body structure:');
    console.log(JSON.stringify(req.body, null, 2).substring(0, 1000)); // First 1000 chars
    
    console.log('\n🔵 [STORE-VECTOR] Incoming request:', {
      entrySignalId: req.body.entrySignalId,
      instrument: req.body.instrument,
      hasFeatures: !!req.body.features,
      hasOutcome: !!req.body.outcome,
      bodyKeys: Object.keys(req.body)
    });
    
    // Validate required fields
    const { entrySignalId, instrument, timestamp, features, outcome, direction } = req.body;
    
    if (!entrySignalId || !instrument || !features || !outcome) {
      console.log('❌ [STORE-VECTOR] Missing required fields:', {
        hasEntrySignalId: !!entrySignalId,
        hasInstrument: !!instrument,
        hasFeatures: !!features,
        hasOutcome: !!outcome
      });
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['entrySignalId', 'instrument', 'features', 'outcome']
      });
    }

    // Force UNIFIED for all new records (legacy endpoint)
    const finalTimestamp = timestamp || req.body.Timestamp;
    
    // CRITICAL: Reject any request without proper bar timestamp from NinjaTrader
    if (!finalTimestamp) {
      return res.status(400).json({
        error: 'BAR_TIMESTAMP_REQUIRED',
        message: 'Timestamp from NinjaTrader bar time is required - no server time fallbacks allowed'
      });
    }
    
    const vectorData = {
      ...req.body,
      recordType: 'UNIFIED',
      status: 'UNIFIED',
      timestamp: finalTimestamp
    };
    
    // Debug log the incoming data
    console.log(`[STORE-VECTOR-DEBUG] Incoming data for ${entrySignalId}:`, {
      hasOutcome: !!outcome,
      outcomePnL: outcome?.pnl,
      outcomeExitReason: outcome?.exitReason,
      outcomeMaxProfit: outcome?.maxProfit,
      outcomeMaxLoss: outcome?.maxLoss,
      featureCount: Object.keys(features || {}).length,
      hasProfitByBar: !!outcome?.profitByBar,
      profitByBarKeys: outcome?.profitByBar ? Object.keys(outcome.profitByBar).slice(0, 5) : []
    });
    
    // PHASE 2: Classify trade importance before storing
    const tradeData = {
      pnl: outcome?.pnl || 0,
      maxProfit: outcome?.maxProfit || 0,
      maxLoss: outcome?.maxLoss || 0,
      direction: direction,
      timestamp: timestamp,
      features: features,
      entrySignalId: entrySignalId,
      instrument: instrument
    };
    
    const classification = tradeClassifier.classify(tradeData);
    
    // Add classification metadata to vector
    vectorData.classification = classification;
    vectorData.importance = classification.importance;
    
    console.log(`[TRADE-CLASSIFIER] ${entrySignalId}: ${classification.type} (${(classification.importance * 100).toFixed(0)}%) - ${classification.reasoning}`);
    console.log(`[TRADE-CLASSIFIER] shouldStore: ${classification.shouldStore}, FORCE_STORE_ALL: ${process.env.FORCE_STORE_ALL}`);
    
    // Store only if important enough or force store
    let vectorId = null;
    let stored = false;
    
    if (classification.shouldStore || process.env.FORCE_STORE_ALL === 'true') {
      console.log(`[STORE-VECTOR] Attempting to store vector for ${entrySignalId}...`);
      try {
        const result = await vectorStore.storeVector(vectorData);
        vectorId = result.vectorId;
        stored = true;
        console.log(`[TRADE-CLASSIFIER] ✅ STORED: ${entrySignalId} - Importance: ${(classification.importance * 100).toFixed(0)}% - ID: ${vectorId}`);
      } catch (storeError) {
        console.error(`[STORE-VECTOR] ❌ Storage failed for ${entrySignalId}:`, storeError);
        throw storeError;
      }
    } else {
      console.log(`[TRADE-CLASSIFIER] 🗑️  SKIPPED: ${entrySignalId} - Too low importance (${(classification.importance * 100).toFixed(0)}%)`);
      // Return success but don't actually store
      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        stored: false,
        reason: 'Low importance trade filtered out',
        classification: classification,
        duration
      });
    }
    
    const duration = Date.now() - startTime;
    console.info('Unified vector stored successfully', {
      vectorId,
      stored,
      entrySignalId,
      instrument,
      duration,
      featureCount: features.length
    });

    // Real-time logging to console
    console.log(`📥 STORED (UNIFIED): ${entrySignalId} | ${instrument} | ${direction || 'unknown'} | PnL: $${(req.body.outcome?.pnl || 0).toFixed(2)} | Features: ${Object.keys(features).length}`);

    // ALWAYS log profitByBar for debugging (100% sampling already set)
    console.log(`🔍 [DEBUG] About to check profitByBar for ${entrySignalId}`);
    if (req.body.outcome && req.body.outcome.profitByBar) {
      console.log(`✅ [DEBUG] profitByBar found! Keys: ${Object.keys(req.body.outcome.profitByBar).join(', ')}`);
      logProfitByBar(req.body.outcome, ` - ${entrySignalId} (UNIFIED)`);
    } else {
      console.log(`❌ [DEBUG] No profitByBar data in outcome for ${entrySignalId}`);
    }

    res.json({
      success: true,
      vectorId,
      duration,
      message: 'Feature vector stored successfully'
    });

  } catch (error) {
    console.error('Failed to store vector', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(500).json({
      error: 'Failed to store vector',
      message: error.message
    });
  }
});

// NEW: Store features at registration time (Split Storage Phase 1)
app.post('/api/store-features', async (req, res) => {
  try {
    const startTime = Date.now();
    
    console.log('\n🟢 [STORE-FEATURES] Incoming request:', {
      entrySignalId: req.body.entrySignalId,
      instrument: req.body.instrument,
      hasFeatures: !!req.body.features,
      featureCount: req.body.features ? Object.keys(req.body.features).length : 0,
      bodyKeys: Object.keys(req.body)
    });
    
    // Validate required fields for features
    const { entrySignalId, instrument, timestamp, features, direction, entryType } = req.body;
    
    if (!entrySignalId || !instrument || !features) {
      console.log('❌ [STORE-FEATURES] Missing required fields:', {
        hasEntrySignalId: !!entrySignalId,
        hasInstrument: !!instrument,
        hasFeatures: !!features
      });
      return res.status(400).json({
        error: 'Missing required fields for features storage',
        required: ['entrySignalId', 'instrument', 'features']
      });
    }

    const finalTimestamp = timestamp || req.body.Timestamp;
    
    // CRITICAL: Reject any request without proper bar timestamp from NinjaTrader
    if (!finalTimestamp) {
      return res.status(400).json({
        error: 'BAR_TIMESTAMP_REQUIRED',
        message: 'Timestamp from NinjaTrader bar time is required - no server time fallbacks allowed'
      });
    }
    
    // Force UNIFIED for all new records (split storage disabled)
    const featureRecord = {
      entrySignalId,
      instrument,
      timestamp: finalTimestamp,
      features,
      direction: direction || 'unknown',
      entryType: entryType || 'unknown',
      recordType: 'UNIFIED',
      status: 'UNIFIED'
    };
    
    const result = await vectorStore.storeVector(featureRecord);
    const vectorId = result.vectorId;
    
    const duration = Date.now() - startTime;
    console.info('Features stored successfully', {
      vectorId,
      entrySignalId,
      instrument,
      duration,
      featureCount: Object.keys(features).length
    });

    // Real-time logging to console
    console.log(`📝 FEATURES: ${entrySignalId} | ${instrument} | ${direction || 'unknown'} | ${entryType || 'unknown'} | Features: ${Object.keys(features).length}`);

    res.json({
      success: true,
      vectorId,
      duration,
      message: 'Features stored successfully'
    });

  } catch (error) {
    console.error('Failed to store features', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(500).json({
      error: 'Failed to store features',
      message: error.message
    });
  }
});

// Handle ME service deregister format (from NinjaTrader via ME service)
app.post('/api/positions/:entrySignalId/deregister', async (req, res) => {
  try {
    const entrySignalId = req.params.entrySignalId;
    
    // NINJATRADER VIA ME SERVICE PAYLOAD INSPECTOR
    console.log('\n🔍 [NT-VIA-ME] Full deregister payload:');
    console.log(JSON.stringify(req.body, null, 2).substring(0, 1500));
    
    // Extract data from NT-ME format
    const { positionOutcome, wasGoodExit, finalDivergence } = req.body;
    
    if (positionOutcome && positionOutcome.profitByBar) {
      console.log(`✅ [NT-VIA-ME] Found profitByBar with ${Object.keys(positionOutcome.profitByBar).length} bars`);
      logProfitByBar(positionOutcome, ` - ${entrySignalId} (NT-VIA-ME)`);
    } else {
      console.log(`❌ [NT-VIA-ME] No profitByBar in positionOutcome`);
    }
    
    // For now, just log and return success to ME service
    console.log(`📥 [NT-VIA-ME] ${entrySignalId} | PnL: $${positionOutcome?.PnLDollars || 0} | Exit: ${positionOutcome?.ExitReason || 'unknown'}`);
    
    res.json({ success: true, message: 'Position deregistered' });
    
  } catch (error) {
    console.error('Error handling ME deregister:', error);
    res.status(500).json({ error: 'Failed to process deregister' });
  }
});

// NEW: Store outcome at deregistration time (Split Storage Phase 2)
app.post('/api/store-outcome', async (req, res) => {
  try {
    const startTime = Date.now();
    
    console.log('\n🟡 [STORE-OUTCOME] Incoming request:', {
      entrySignalId: req.body.entrySignalId,
      hasOutcome: !!req.body.outcome,
      outcomePnL: req.body.outcome?.pnl || req.body.outcome?.pnlDollars,
      exitReason: req.body.outcome?.exitReason,
      bodyKeys: Object.keys(req.body)
    });
    
    // Validate required fields for outcome
    const { entrySignalId, outcome } = req.body;
    
    if (!entrySignalId || !outcome) {
      console.log('❌ [STORE-OUTCOME] Missing required fields:', {
        hasEntrySignalId: !!entrySignalId,
        hasOutcome: !!outcome
      });
      return res.status(400).json({
        error: 'Missing required fields for outcome storage',
        required: ['entrySignalId', 'outcome']
      });
    }

    // Debug log to check if profitByBar is present (check multiple locations)
    console.log('\n🔍 [NT-OUTCOME-DEBUG] Checking profitByBar in outcome:');
    console.log('outcome keys:', Object.keys(outcome || {}));
    console.log('outcome.profitByBar exists:', !!outcome?.profitByBar);
    console.log('outcome.ProfitByBar exists:', !!outcome?.ProfitByBar);
    console.log('outcome.positionOutcome exists:', !!outcome?.positionOutcome);
    
    // Check for different capitalizations from NinjaTrader
    const profitByBarData = outcome?.profitByBar || 
                          outcome?.ProfitByBar || 
                          outcome?.positionOutcome?.profitByBar ||
                          outcome?.positionOutcome?.ProfitByBar ||
                          null;
                          
    if (profitByBarData) {
      console.log(`✅ [NT-PROFITBYBAR] Found profitByBar data for ${entrySignalId}:`, {
        type: typeof profitByBarData,
        isArray: Array.isArray(profitByBarData),
        keys: Object.keys(profitByBarData || {}).slice(0, 10),
        sampleValues: Object.entries(profitByBarData || {}).slice(0, 5)
      });
      // Ensure profitByBar is at the top level for vectorStore
      if (!outcome.profitByBar) {
        outcome.profitByBar = profitByBarData;
      }
    } else {
      console.log(`❌ [NT-PROFITBYBAR] No profitByBar found in any location for ${entrySignalId}`);
    }

    const finalTimestamp = req.body.timestamp || req.body.Timestamp;
    
    // CRITICAL: Reject any request without proper bar timestamp from NinjaTrader
    if (!finalTimestamp) {
      return res.status(400).json({
        error: 'BAR_TIMESTAMP_REQUIRED',
        message: 'Timestamp from NinjaTrader bar time is required - no server time fallbacks allowed'
      });
    }
    
    // Phase 2: Classify trade importance before storing
    const tradeData = {
      pnl: outcome.pnlDollars || outcome.PnLDollars || 0,
      maxProfit: outcome.maxProfit || 0,
      maxLoss: outcome.maxLoss || 0,
      direction: outcome.direction || req.body.direction,
      timestamp: finalTimestamp,
      features: req.body.features || outcome.features || {}
    };
    
    const classification = tradeClassifier.classify(tradeData);
    
    // Skip storage if trade is not important enough (Phase 2 filtering)
    if (!classification.shouldStore) {
      console.info('Trade filtered out by importance scoring', {
        entrySignalId,
        pnl: tradeData.pnl,
        classification: classification.type,
        importance: classification.importance,
        reasoning: classification.reasoning
      });
      
      return res.json({
        success: true,
        filtered: true,
        classification,
        message: 'Trade filtered - insufficient importance for storage'
      });
    }

    // Force UNIFIED for all new records (split storage disabled)
    const outcomeRecord = {
      entrySignalId,
      outcome,
      timestamp: tradeData.timestamp,
      recordType: 'UNIFIED',
      status: 'UNIFIED',
      classification: {
        type: classification.type,
        importance: classification.importance,
        reasoning: classification.reasoning
      },
      importance: classification.importance  // Top-level for easy querying
    };
    
    const result = await vectorStore.storeVector(outcomeRecord);
    const vectorId = result.vectorId;
    
    const duration = Date.now() - startTime;
    console.info('Outcome stored successfully', {
      vectorId,
      entrySignalId,
      duration,
      pnl: outcome.pnl
    });

    // Real-time logging to console
    console.log(`💰 OUTCOME: ${entrySignalId} | PnL: $${(outcome.pnl || 0).toFixed(2)} | Exit: ${outcome.exitReason || 'unknown'}`);

    // Debug profitByBar presence
    console.log(`🔍 [DEBUG-OUTCOME] Checking profitByBar for ${entrySignalId}`);
    if (outcome && outcome.profitByBar) {
      console.log(`✅ [DEBUG-OUTCOME] profitByBar found! ${Object.keys(outcome.profitByBar).length} bars`);
      logProfitByBar(outcome, ` - ${entrySignalId} (OUTCOME)`);
    } else {
      console.log(`❌ [DEBUG-OUTCOME] No profitByBar in outcome`);
    }

    // Attempt automatic union
    await attemptUnion(entrySignalId);

    res.json({
      success: true,
      vectorId,
      duration,
      message: 'Outcome stored successfully'
    });

  } catch (error) {
    console.error('Failed to store outcome', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(500).json({
      error: 'Failed to store outcome',
      message: error.message
    });
  }
});

// Query similar vectors (for Risk Agent) - TRANSPARENT UNION
app.post('/api/query-similar', async (req, res) => {
  try {
    const startTime = Date.now();
    const { features, entryType, instrument, limit = 100, similarity_threshold = 0.85, graduatedFeatures = null } = req.body;

    // Handle both array and object formats for features
    if (!features) {
      return res.status(400).json({
        error: 'Features are required'
      });
    }

    // TRANSPARENT UNION: First try to find unified vectors
    let results = await vectorStore.findSimilarVectors(features, {
      entryType,
      instrument,
      limit,
      similarity_threshold,
      graduatedFeatures,
      recordType: 'UNIFIED'  // Only search unified vectors first
    });

    console.info(`Found ${results.length} unified vectors, checking for pending unions...`);

    // If we don't have enough results, perform pending unions and retry
    if (results.length < limit) {
      const unionCount = await performPendingUnions();
      
      if (unionCount > 0) {
        console.info(`Created ${unionCount} new unified vectors, re-querying...`);
        
        // Re-query after unions
        results = await vectorStore.findSimilarVectors(features, {
          entryType,
          instrument,
          limit,
          similarity_threshold,
          graduatedFeatures,
          recordType: 'UNIFIED'
        });
      }
    }

    const duration = Date.now() - startTime;
    console.info('Similar vectors retrieved (with transparent union)', {
      resultCount: results.length,
      duration,
      entryType,
      similarity_threshold
    });

    res.json({
      success: true,
      results,
      count: results.length,
      duration
    });

  } catch (error) {
    console.error('Failed to query similar vectors', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to query similar vectors',
      message: error.message
    });
  }
});

// Get vectors for gradient analysis
app.get('/api/vectors', async (req, res) => {
  try {
    const startTime = Date.now();
    const { 
      instrument, 
      since, 
      limit = 100000,
      entryType,
      dataType 
    } = req.query;

    // Get more vectors to account for split storage
    const allVectors = await vectorStore.getVectors({
      instrument,
      since: since ? new Date(since) : undefined,
      limit: parseInt(limit) * 3, // Get 3x to ensure we have enough after union
      entryType,
      dataType
    });
    
    console.log(`[API-VECTORS] Retrieved ${allVectors.length} total vectors`);
    console.log(`[API-VECTORS] First 5 vectors:`, allVectors.slice(0, 5).map(v => ({
      id: v.id,
      entrySignalId: v.entrySignalId,
      recordType: v.recordType,
      status: v.status,
      pnl: v.pnl
    })));
    
    // Separate by record type
    const featureRecords = new Map();
    const outcomeRecords = new Map();
    const unifiedRecords = [];
    
    allVectors.forEach(vector => {
      if (vector.recordType === 'FEATURES') {
        featureRecords.set(vector.entrySignalId, vector);
      } else if (vector.recordType === 'OUTCOME') {
        outcomeRecords.set(vector.entrySignalId, vector);
      } else {
        // Legacy UNIFIED records or records without recordType
        unifiedRecords.push(vector);
      }
    });
    
    console.log(`[API-VECTORS] Breakdown - FEATURES: ${featureRecords.size}, OUTCOME: ${outcomeRecords.size}, UNIFIED: ${unifiedRecords.length}`);
    
    // Union FEATURES and OUTCOME records
    for (const [entrySignalId, featureRecord] of featureRecords) {
      const outcomeRecord = outcomeRecords.get(entrySignalId);
      if (outcomeRecord) {
        // Merge the records - features from FEATURES record, outcomes from OUTCOME record
        const unifiedRecord = {
          ...featureRecord,
          recordType: 'UNIFIED',
          status: 'UNIFIED',
          // Override with outcome data
          pnl: outcomeRecord.pnl,
          pnlPoints: outcomeRecord.pnlPoints,
          holdingBars: outcomeRecord.holdingBars,
          exitReason: outcomeRecord.exitReason,
          maxProfit: outcomeRecord.maxProfit,
          maxLoss: outcomeRecord.maxLoss,
          wasGoodExit: outcomeRecord.wasGoodExit,
          exitPrice: outcomeRecord.exitPrice,
          exitTime: outcomeRecord.exitTime,
          // Keep timestamp from outcome record as it's more recent
          timestamp: outcomeRecord.timestamp
        };
        unifiedRecords.push(unifiedRecord);
        
        // Mark both records as processed
        outcomeRecords.delete(entrySignalId);
      }
    }
    
    // Add any unmatched FEATURES records (positions still open)
    for (const [entrySignalId, featureRecord] of featureRecords) {
      if (!outcomeRecords.has(entrySignalId)) {
        // This is a pending position without outcome yet
        unifiedRecords.push({
          ...featureRecord,
          pnl: 0,
          exitReason: 'PENDING',
          status: 'PENDING'
        });
      }
    }
    
    // Sort by timestamp (newest first) and limit
    unifiedRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const finalResults = unifiedRecords.slice(0, parseInt(limit));
    
    const duration = Date.now() - startTime;
    console.info('Vectors retrieved and unified for viewer', {
      totalVectors: allVectors.length,
      featureRecords: featureRecords.size,
      outcomeRecords: outcomeRecords.size,
      unifiedCount: unifiedRecords.length,
      returnedCount: finalResults.length,
      duration
    });

    res.json({
      success: true,
      vectors: finalResults,
      count: finalResults.length,
      duration
    });

  } catch (error) {
    console.error('Failed to retrieve vectors', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to retrieve vectors',
      message: error.message
    });
  }
});

// Simple in-memory cache for stats
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL = 60000; // Cache stats for 60 seconds

// Get storage statistics (with caching to prevent excessive calls)
app.get('/api/stats', async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached stats if still fresh
    if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL) {
      return res.json({
        success: true,
        stats: statsCache,
        cached: true
      });
    }
    
    // Fetch fresh stats
    const stats = await vectorStore.getStats();
    
    // Update cache
    statsCache = stats;
    statsCacheTime = now;
    
    res.json({
      success: true,
      stats,
      cached: false
    });

  } catch (error) {
    console.error('Failed to get storage stats', {
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to get storage stats',
      message: error.message
    });
  }
});

// Delete specific vector by ID
app.delete('/api/vector/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        error: 'Vector ID is required'
      });
    }

    const result = await vectorStore.deleteVector(id);
    
    if (result.success) {
      console.info('Vector deleted successfully', {
        vectorId: id
      });

      res.json({
        success: true,
        message: 'Vector deleted successfully',
        vectorId: id
      });
    } else {
      res.status(404).json({
        error: 'Vector not found or deletion failed',
        vectorId: id
      });
    }

  } catch (error) {
    console.error('Failed to delete vector', {
      error: error.message,
      vectorId: req.params.id
    });

    res.status(500).json({
      error: 'Failed to delete vector',
      message: error.message
    });
  }
});

// Bulk delete vectors (for storage wiping)
// DISABLED for data safety - bulk delete endpoint removed
app.post('/api/vectors/delete-bulk-DISABLED', async (req, res) => {
  res.status(403).json({
    error: 'Bulk delete disabled for data protection',
    message: 'This endpoint has been disabled to prevent accidental data loss'
  });
  return;

// NEW: Enabled bulk delete endpoint with safety checks
app.post('/api/delete-bulk', async (req, res) => {
  try {
    const { vectorIds } = req.body;
    
    if (!Array.isArray(vectorIds) || vectorIds.length === 0) {
      return res.status(400).json({
        error: 'Array of vector IDs is required'
      });
    }

    // Safety check: Prevent deletion of too many vectors at once
    if (vectorIds.length > 50000) {
      return res.status(400).json({
        error: `Too many vectors requested for deletion: ${vectorIds.length}. Maximum allowed: 50000`
      });
    }

    console.log(`[BULK-DELETE] Starting deletion of ${vectorIds.length} vectors`);
    
    const results = await vectorStore.deleteBulkVectors(vectorIds);
    
    console.log(`[BULK-DELETE] Completed:`, {
      requested: vectorIds.length,
      deleted: results.deletedCount,
      failed: results.failedCount
    });

    res.json({
      success: true,
      message: 'Bulk deletion completed',
      deletedCount: results.deletedCount,
      failedCount: results.failedCount,
      failedIds: results.failedIds || []
    });

  } catch (error) {
    console.error('[BULK-DELETE] Failed:', {
      error: error.message,
      requestedCount: req.body.vectorIds?.length || 0
    });

    res.status(500).json({
      error: 'Failed to delete vectors in bulk',
      message: error.message
    });
  }
});
  // Original code below (disabled)
  /*
  try {
    const { vectorIds } = req.body;
    
    if (!Array.isArray(vectorIds) || vectorIds.length === 0) {
      return res.status(400).json({
        error: 'Array of vector IDs is required'
      });
    }

    const results = await vectorStore.deleteBulkVectors(vectorIds);
    
    console.info('Bulk vector deletion completed', {
      requested: vectorIds.length,
      deleted: results.deletedCount,
      failed: results.failedCount
    });

    res.json({
      success: true,
      message: 'Bulk deletion completed',
      deletedCount: results.deletedCount,
      failedCount: results.failedCount,
      failedIds: results.failedIds || []
    });

  } catch (error) {
    console.error('Failed to delete vectors in bulk', {
      error: error.message,
      requestedCount: req.body.vectorIds?.length || 0
    });

    res.status(500).json({
      error: 'Failed to delete vectors in bulk',
      message: error.message
    });
  }
  */
});

// Get aggregated stats for dashboard visualization
app.get('/api/aggregated-stats', async (req, res) => {
  try {
    console.info('GET /api/aggregated-stats');

    // Get aggregated stats from vectorStore
    const aggregatedStats = await vectorStore.getAggregatedStats();

    res.json(aggregatedStats);
  } catch (error) {
    console.error('Failed to get aggregated stats', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to get aggregated stats',
      message: error.message
    });
  }
});

// Legacy /stats endpoint for backward compatibility
app.get('/stats', async (req, res) => {
  try {
    console.info('GET /stats');
    const stats = await vectorStore.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get storage stats', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to get storage stats',
      message: error.message
    });
  }
});

// Phase 2: Classification statistics endpoint
app.get('/api/classification-stats', async (req, res) => {
  try {
    // Get all vectors to analyze classification distribution
    const allVectors = await vectorStore.getVectors({ limit: 10000 });
    
    const stats = {
      total: allVectors.length,
      byType: {},
      byImportance: {
        high: 0,    // > 0.7
        medium: 0,  // 0.3 - 0.7
        low: 0      // < 0.3
      },
      avgImportance: 0,
      classifier: tradeClassifier.getStats()
    };
    
    let importanceSum = 0;
    
    allVectors.forEach(vector => {
      if (vector.classification) {
        const type = vector.classification.type || 'UNKNOWN';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
        
        const importance = vector.importance || 0;
        importanceSum += importance;
        
        if (importance > 0.7) stats.byImportance.high++;
        else if (importance > 0.3) stats.byImportance.medium++;
        else stats.byImportance.low++;
      }
    });
    
    stats.avgImportance = allVectors.length > 0 ? importanceSum / allVectors.length : 0;
    
    res.json(stats);
    
  } catch (error) {
    console.error('Failed to get classification stats', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to get classification stats',
      message: error.message
    });
  }
});

// Phase 2: Pattern analysis endpoint
app.get('/api/analyze-patterns', async (req, res) => {
  try {
    const {
      instrument = null,
      direction = null,
      lookbackHours = 24,
      minPatternSize = 3
    } = req.query;
    
    // Get all vectors for pattern analysis
    const allVectors = await vectorStore.getVectors({ limit: 10000 });
    
    // Analyze patterns using the clusterer
    const patternAnalysis = patternClusterer.analyzePatterns(allVectors, {
      instrument,
      direction,
      lookbackHours: parseInt(lookbackHours),
      minPatternSize: parseInt(minPatternSize)
    });
    
    console.info('Pattern analysis completed', {
      instrument,
      direction,
      lookbackHours,
      hasPattern: patternAnalysis.hasPattern,
      primaryPattern: patternAnalysis.primaryPattern?.type,
      tradesAnalyzed: patternAnalysis.trades?.length || 0
    });
    
    res.json({
      success: true,
      analysis: patternAnalysis,
      clusterer: patternClusterer.getStats()
    });
    
  } catch (error) {
    console.error('Failed to analyze patterns', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to analyze patterns',
      message: error.message
    });
  }
});

// Debug endpoint to check raw storage data
app.get('/api/debug/raw-vectors', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get raw vectors without any processing
    const rawVectors = await vectorStore.getVectors({ limit: parseInt(limit) });
    
    // Log first few vectors for debugging
    console.log(`[DEBUG-RAW] Retrieved ${rawVectors.length} raw vectors`);
    rawVectors.slice(0, 3).forEach((vector, idx) => {
      console.log(`[DEBUG-RAW] Vector ${idx + 1}:`, {
        id: vector.id,
        entrySignalId: vector.entrySignalId,
        recordType: vector.recordType,
        status: vector.status,
        pnl: vector.pnl,
        outcome: vector.outcome,
        instrument: vector.instrument,
        entryType: vector.entryType
      });
    });
    
    res.json({
      count: rawVectors.length,
      vectors: rawVectors
    });
    
  } catch (error) {
    console.error('Failed to get raw vectors', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to get raw vectors',
      message: error.message
    });
  }
});

// Export data as CSV for analysis tools like Orange
app.get('/api/export/csv', async (req, res) => {
  try {
    console.info('Exporting vectors to CSV');
    
    const vectors = await vectorStore.getVectors({ limit: 1000000 });
    
    if (vectors.length === 0) {
      return res.status(404).json({ error: 'No vectors found to export' });
    }
    
    // Parse first vector to get feature names
    const firstFeatures = JSON.parse(vectors[0].featuresJson || '{}');
    const featureNames = Object.keys(firstFeatures).sort();
    
    // Create CSV header - using schema field names
    const headers = [
      'id', 'timestamp', 'inst', 'type', 'dir',
      ...featureNames,
      'stopLoss', 'takeProfit', 'pnl', 'pnlPts', 
      'bars', 'exit', 'maxP', 'maxL', 'good'
    ];
    
    // Create CSV content
    const csvLines = [headers.join(',')];
    
    vectors.forEach(vector => {
      try {
        const features = JSON.parse(vector.featuresJson || '{}');
        
        const row = [
          vector.id,
          vector.timestamp,
          vector.inst,
          vector.type,
          vector.dir,
          ...featureNames.map(name => features[name] || 0),
          vector.stopLoss,
          vector.takeProfit,
          vector.pnl,
          vector.pnlPts,
          vector.bars,
          vector.exit,
          vector.maxP,
          vector.maxL,
          vector.good
        ];
        
        csvLines.push(row.map(val => {
          const strVal = String(val);
          if (strVal.includes(',') || strVal.includes('"')) {
            return `"${strVal.replace(/"/g, '""')}"`;
          }
          return strVal;
        }).join(','));
        
      } catch (e) {
        console.error('Error processing vector for CSV:', e);
      }
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vectors_${new Date().toISOString().split('T')[0]}.csv"`);
    
    // Send CSV content
    res.send(csvLines.join('\n'));
    
    console.info(`CSV export completed: ${vectors.length} vectors, ${featureNames.length} features`);
    
  } catch (error) {
    console.error('Failed to export CSV', {
      error: error.message
    });
    res.status(500).json({
      error: 'Failed to export CSV',
      message: error.message
    });
  }
});

// Initialize vector store and start server
async function startServer() {
  try {
    // Direct console test at startup
    console.log('🚀 [STARTUP] Starting server initialization...');
    
    console.info('Initializing LanceDB vector store...');
    await vectorStore.initialize();
    console.info('Vector store initialized successfully');
    
    console.log('🚀 [STARTUP] Vector store initialized');
    
    // Initialize offline processor
    console.log('🚀 [STARTUP] Initializing offline processor...');
    await offlineProcessor.initialize();
    console.log('🚀 [STARTUP] Offline processor initialized');
    
    // Check if database is empty and needs initialization
    // TEMP: Skip stats check during startup to avoid hang
    /*
    try {
      const stats = await vectorStore.getStats();
      if (stats.totalVectors === 0) {
        console.info('Database is empty, initializing with schema...');
        
        // Create a dummy record to establish schema
        const dummyVector = {
          entrySignalId: 'SCHEMA_INIT',
          instrument: 'DUMMY',
          timestamp: Date.now(),
          features: { dummy: 0 },
          direction: 'long',
          entryType: 'INIT',
          recordType: 'UNIFIED',
          status: 'SCHEMA',
          outcome: {
            pnl: 0,
            pnlPoints: 0,
            holdingBars: 0,
            exitReason: 'SCHEMA_INIT',
            maxProfit: 0,
            maxLoss: 0,
            wasGoodExit: false,
            profitByBar: { "0": 0 }  // Initialize with proper structure
          }
        };
        
        await vectorStore.storeVector(dummyVector);
        console.info('Schema initialization complete');
        
        // Immediately delete the dummy record
        const vectors = await vectorStore.getVectors({ limit: 1 });
        if (vectors.length > 0 && vectors[0].entrySignalId === 'SCHEMA_INIT') {
          await vectorStore.deleteVector(vectors[0].id);
          console.info('Schema initialization record removed');
        }
      }
    } catch (initError) {
      console.warn('Could not check/initialize schema:', initError.message);
    }
    */

    app.listen(PORT, () => {
      console.log(`🚀 [STARTUP] Express server listening on port ${PORT}`);
      
      console.info(`Storage Agent listening on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        lancedb_path: vectorStore.dbPath,
        note: 'Using NEW optimized database (vectors_fresh) - old database archived'
      });
      
      // Show startup stats table
      // TEMP: Skip stats display to avoid hang
      // setTimeout(showStartupStats, 1000);
    });

  } catch (error) {
    console.error('Failed to start Storage Agent', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Show startup statistics table
async function showStartupStats() {
  try {
    console.log('\n📊 STORAGE STARTUP STATISTICS');
    console.log('═'.repeat(80));
    
    const stats = await vectorStore.getStats();
    
    if (stats.totalVectors === 0) {
      console.log('📝 No vectors stored yet - database is empty');
      console.log('═'.repeat(80));
      return;
    }
    
    console.log(`📈 Total Vectors: ${stats.totalVectors}`);
    console.log(`🎯 Feature Count: ${stats.featureCount}`);
    console.log('');
    
    // Show instrument breakdown
    if (stats.instrumentBreakdown && Object.keys(stats.instrumentBreakdown).length > 0) {
      console.log('🎯 INSTRUMENT BREAKDOWN');
      console.log('─'.repeat(80));
      console.log('Instrument'.padEnd(15) + 'Total'.padEnd(10) + 'Wins'.padEnd(10) + 'Losses'.padEnd(10) + 'Win Rate'.padEnd(12) + 'Avg PnL');
      console.log('─'.repeat(80));
      
      // Sort instruments by total trades (descending)
      const sortedInstruments = Object.entries(stats.instrumentBreakdown)
        .sort((a, b) => b[1].total - a[1].total);
      
      sortedInstruments.forEach(([instrument, data]) => {
        console.log(
          instrument.padEnd(15) +
          data.total.toString().padEnd(10) +
          data.wins.toString().padEnd(10) +
          data.losses.toString().padEnd(10) +
          (data.winRate + '%').padEnd(12) +
          '$' + data.avgPnl.toFixed(2)
        );
      });
      
      console.log('─'.repeat(80));
    }
    
    // Get actual vectors to analyze features
    const vectors = await vectorStore.getVectors({ limit: stats.totalVectors });
    
    if (vectors.length === 0) {
      console.log('📝 No vectors available for feature analysis');
      console.log('═'.repeat(80));
      return;
    }
    
    // Build feature analysis
    const featureStats = new Map();
    const timestamps = new Set();
    
    vectors.forEach(vector => {
      if (vector.timestamp) {
        timestamps.add(vector.timestamp);
      }
      
      if (vector.featuresJson) {
        try {
          const features = JSON.parse(vector.featuresJson);
          Object.entries(features).forEach(([featureName, value]) => {
            if (!featureStats.has(featureName)) {
              featureStats.set(featureName, new Set());
            }
            if (typeof value === 'number' && !isNaN(value)) {
              featureStats.set(featureName, featureStats.get(featureName).add(value));
            }
          });
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    console.log(`⏰ Unique Timestamps: ${timestamps.size}`);
    console.log('');
    console.log('📋 FEATURE VARIATION SUMMARY');
    console.log('─'.repeat(80));
    console.log('Feature Name'.padEnd(35) + 'Unique Values'.padEnd(15) + 'Variation Status');
    console.log('─'.repeat(80));
    
    // Convert to array and sort by unique value count (ascending - problematic first)
    const featureArray = Array.from(featureStats.entries())
      .map(([name, valuesSet]) => ({
        name,
        uniqueCount: valuesSet.size,
        values: Array.from(valuesSet).sort((a, b) => a - b)
      }))
      .sort((a, b) => a.uniqueCount - b.uniqueCount);
    
    // Show first 20 features (most problematic)
    const maxFeaturesToShow = Math.min(20, featureArray.length);
    
    featureArray.slice(0, maxFeaturesToShow).forEach(feature => {
      let status = '✅ Good';
      if (feature.uniqueCount === 1) {
        status = '🔴 CONSTANT';
      } else if (feature.uniqueCount <= 2) {
        status = '🟠 Binary';
      } else if (feature.uniqueCount <= 3) {
        status = '🟡 Low';
      }
      
      console.log(
        feature.name.padEnd(35) + 
        feature.uniqueCount.toString().padEnd(15) + 
        status
      );
    });
    
    if (featureArray.length > maxFeaturesToShow) {
      console.log(`... and ${featureArray.length - maxFeaturesToShow} more features`);
    }
    
    // Summary alerts
    const constantFeatures = featureArray.filter(f => f.uniqueCount === 1).length;
    const binaryFeatures = featureArray.filter(f => f.uniqueCount === 2).length;
    const lowVariationFeatures = featureArray.filter(f => f.uniqueCount <= 3).length;
    
    console.log('─'.repeat(80));
    console.log('🚨 VARIATION ALERTS:');
    if (constantFeatures > 0) {
      console.log(`   🔴 ${constantFeatures} constant features (CRITICAL)`);
    }
    if (binaryFeatures > 0) {
      console.log(`   🟠 ${binaryFeatures} binary features`);
    }
    if (lowVariationFeatures > 0) {
      console.log(`   🟡 ${lowVariationFeatures} low-variation features total`);
    }
    if (constantFeatures === 0 && binaryFeatures === 0 && lowVariationFeatures === 0) {
      console.log('   ✅ No variation issues detected');
    }
    
    console.log('═'.repeat(80));
    console.log('💡 Use variation-monitor.js for continuous monitoring');
    console.log('🔍 Use low-variation-detector.js for detailed analysis');
    console.log('');
    
  } catch (error) {
    console.error('Failed to show startup stats:', error.message);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.info('Shutting down Storage Agent...');
  await vectorStore.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.info('Shutting down Storage Agent...');
  await vectorStore.close();
  process.exit(0);
});

// NEW: Union helper functions

// Attempt union for a specific entrySignalId
async function attemptUnion(entrySignalId) {
  try {
    console.info(`Attempting union for ${entrySignalId}`);
    
    // Find matching feature and outcome records
    const allVectors = await vectorStore.getVectors({ limit: 10000 }); // Get reasonable batch
    
    const featureRecord = allVectors.find(v => 
      v.entrySignalId === entrySignalId && 
      (v.recordType === 'FEATURES' || (!v.recordType && v.status === 'PENDING_OUTCOME'))
    );
    
    const outcomeRecord = allVectors.find(v => 
      v.entrySignalId === entrySignalId && 
      (v.recordType === 'OUTCOME' || (!v.recordType && v.status === 'PENDING_UNION'))
    );
    
    if (featureRecord && outcomeRecord) {
      // Parse features if stored as JSON string
      let features = featureRecord.features;
      if (typeof features === 'string') {
        features = JSON.parse(features);
      }
      
      // Parse outcome if stored as JSON string
      let outcome = outcomeRecord.outcome;
      if (typeof outcome === 'string') {
        outcome = JSON.parse(outcome);
      }
      
      // Create unified vector
      const unifiedVector = {
        entrySignalId,
        instrument: featureRecord.instrument,
        direction: featureRecord.direction || 'unknown',
        entryType: featureRecord.entryType || 'unknown',
        timestamp: featureRecord.timestamp,
        features,
        outcome,
        recordType: 'UNIFIED',
        status: 'UNIFIED',
        unifiedAt: Date.now()
      };
      
      // Store unified vector
      const result = await vectorStore.storeVector(unifiedVector);
      const vectorId = result.vectorId;
      
      // Cleanup fragments (mark as unified rather than delete for safety)
      await vectorStore.updateVectorStatus(featureRecord.id, 'UNIFIED_CLEANUP');
      await vectorStore.updateVectorStatus(outcomeRecord.id, 'UNIFIED_CLEANUP');
      
      console.info(`✅ UNIFIED: ${entrySignalId} - Combined features + outcome`, {
        vectorId,
        featureCount: Object.keys(features).length,
        pnl: outcome.pnl
      });
      
      console.log(`🔄 UNIFIED: ${entrySignalId} | ${featureRecord.instrument} | PnL: $${(outcome.pnl || 0).toFixed(2)} | Features: ${Object.keys(features).length}`);
      
      return true;
    } else {
      console.debug(`Union not possible for ${entrySignalId}: features=${!!featureRecord}, outcome=${!!outcomeRecord}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Union failed for ${entrySignalId}:`, {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

// Perform all pending unions (batch process)
async function performPendingUnions() {
  try {
    console.info('Starting batch union process...');
    
    // Get all vectors to find pending unions
    const allVectors = await vectorStore.getVectors({ limit: 10000 });
    
    // Group by entrySignalId to find complete pairs
    const entrySignalMap = new Map();
    
    allVectors.forEach(vector => {
      if (!vector.entrySignalId) return;
      
      if (!entrySignalMap.has(vector.entrySignalId)) {
        entrySignalMap.set(vector.entrySignalId, { features: null, outcome: null });
      }
      
      const entry = entrySignalMap.get(vector.entrySignalId);
      
      if (vector.recordType === 'FEATURES' || vector.status === 'PENDING_OUTCOME') {
        entry.features = vector;
      } else if (vector.recordType === 'OUTCOME' || vector.status === 'PENDING_UNION') {
        entry.outcome = vector;
      }
    });
    
    // Find complete pairs ready for union
    let unionCount = 0;
    for (const [entrySignalId, entry] of entrySignalMap) {
      if (entry.features && entry.outcome) {
        const success = await attemptUnion(entrySignalId);
        if (success) {
          unionCount++;
        }
      }
    }
    
    console.info(`Batch union process completed: ${unionCount} unions created`);
    return unionCount;
    
  } catch (error) {
    console.error('Batch union process failed:', {
      error: error.message,
      stack: error.stack
    });
    return 0;
  }
}

// Manual union endpoint for debugging
app.post('/api/union/:entrySignalId', async (req, res) => {
  try {
    const { entrySignalId } = req.params;
    const success = await attemptUnion(entrySignalId);
    
    if (success) {
      res.json({
        success: true,
        message: `Union completed for ${entrySignalId}`
      });
    } else {
      res.json({
        success: false,
        message: `Union not possible for ${entrySignalId} - missing features or outcome`
      });
    }
    
  } catch (error) {
    console.error('Manual union failed', {
      error: error.message,
      entrySignalId: req.params.entrySignalId
    });
    
    res.status(500).json({
      error: 'Manual union failed',
      message: error.message
    });
  }
});

// Batch union endpoint for maintenance
app.post('/api/batch-union', async (req, res) => {
  try {
    const unionCount = await performPendingUnions();
    
    res.json({
      success: true,
      message: `Batch union completed: ${unionCount} unions created`,
      unionCount
    });
    
  } catch (error) {
    console.error('Batch union endpoint failed', {
      error: error.message
    });
    
    res.status(500).json({
      error: 'Batch union failed',
      message: error.message
    });
  }
});

// ============================================================================
// PHASE 3: OFFLINE PROCESSING ENDPOINTS
// ============================================================================

// Store raw NT record (Stage 1: Offline Records)
app.post('/api/offline/store-raw', async (req, res) => {
  try {
    const recordId = await offlineProcessor.storage.storeRawRecord(req.body);
    
    console.log(`[OFFLINE-STORAGE] Raw record stored: ${recordId}`);
    
    res.json({
      success: true,
      recordId,
      message: 'Raw record stored successfully'
    });
    
  } catch (error) {
    console.error('[OFFLINE-STORAGE] Failed to store raw record:', error.message);
    res.status(500).json({
      error: 'Failed to store raw record',
      message: error.message
    });
  }
});

// Trigger offline processing (Stage 2: Raw → Qualified)
app.post('/api/offline/process', async (req, res) => {
  try {
    const { batchSize = 100 } = req.body;
    
    const result = await offlineProcessor.processAll();
    
    res.json({
      success: true,
      result,
      message: 'Offline processing completed'
    });
    
  } catch (error) {
    console.error('[OFFLINE-PROCESSING] Processing failed:', error.message);
    res.status(500).json({
      error: 'Offline processing failed',
      message: error.message
    });
  }
});

// Get qualified records for training (Stage 3: Training Data)
app.get('/api/offline/qualified', async (req, res) => {
  try {
    const { instrument, direction, limit = 1000 } = req.query;
    
    const qualifiedRecords = await offlineProcessor.getQualifiedTrainingData({
      instrument,
      direction,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      records: qualifiedRecords,
      count: qualifiedRecords.length
    });
    
  } catch (error) {
    console.error('[OFFLINE-TRAINING] Failed to get qualified records:', error.message);
    res.status(500).json({
      error: 'Failed to get qualified records',
      message: error.message
    });
  }
});

// Get graduated features for ML training
app.get('/api/offline/graduated', async (req, res) => {
  try {
    const { instrument, direction, limit = 1000 } = req.query;
    
    const graduatedRecords = await offlineProcessor.getGraduatedFeatures({
      instrument,
      direction,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      records: graduatedRecords,
      count: graduatedRecords.length
    });
    
  } catch (error) {
    console.error('[OFFLINE-TRAINING] Failed to get graduated records:', error.message);
    res.status(500).json({
      error: 'Failed to get graduated records', 
      message: error.message
    });
  }
});

// Get offline processing status
app.get('/api/offline/status', async (req, res) => {
  try {
    const status = offlineProcessor.getStatus();
    
    res.json({
      success: true,
      status
    });
    
  } catch (error) {
    console.error('[OFFLINE-STATUS] Failed to get status:', error.message);
    res.status(500).json({
      error: 'Failed to get offline status',
      message: error.message
    });
  }
});

// Configure offline processing
app.put('/api/offline/config', async (req, res) => {
  try {
    const newConfig = req.body;
    
    offlineProcessor.updateConfig(newConfig);
    
    res.json({
      success: true,
      config: offlineProcessor.config,
      message: 'Configuration updated'
    });
    
  } catch (error) {
    console.error('[OFFLINE-CONFIG] Failed to update config:', error.message);
    res.status(500).json({
      error: 'Failed to update configuration',
      message: error.message
    });
  }
});

// Export qualified/graduated data for external ML tools
app.get('/api/offline/export/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'qualified' or 'graduated'
    const { format = 'json', instrument, direction } = req.query;
    
    let data;
    if (type === 'qualified') {
      data = await offlineProcessor.getQualifiedTrainingData({ instrument, direction });
    } else if (type === 'graduated') {
      data = await offlineProcessor.getGraduatedFeatures({ instrument, direction });
    } else {
      return res.status(400).json({ error: 'Invalid export type. Use "qualified" or "graduated"' });
    }
    
    if (format === 'csv') {
      const csv = convertToCSV(data, type);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_data.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data,
        count: data.length,
        type,
        exported: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error(`[OFFLINE-EXPORT] Failed to export ${req.params.type}:`, error.message);
    res.status(500).json({
      error: `Failed to export ${req.params.type} data`,
      message: error.message
    });
  }
});

function convertToCSV(data, type) {
  if (!data || data.length === 0) return '';
  
  // Get headers from first record
  const headers = Object.keys(data[0]);
  const csvLines = [headers.join(',')];
  
  data.forEach(record => {
    const row = headers.map(header => {
      const value = record[header];
      if (typeof value === 'object') {
        return JSON.stringify(value).replace(/"/g, '""');
      }
      return String(value).replace(/"/g, '""');
    });
    csvLines.push(row.join(','));
  });
  
  return csvLines.join('\n');
}

// ============================================================================
// PHASE 4: MODEL RESET AND CLEAN RETRAINING ENDPOINTS
// ============================================================================

// STEP 1: Complete model reset (wipe everything)
app.post('/api/reset/complete', async (req, res) => {
  try {
    console.log('🔥 [RESET] Complete model reset requested');
    
    const result = await modelReset.performCompleteReset();
    
    res.json({
      success: true,
      result,
      message: 'Complete model reset successful - system ready for fresh data collection'
    });
    
  } catch (error) {
    console.error('[RESET] Complete reset failed:', error.message);
    res.status(500).json({
      error: 'Complete reset failed',
      message: error.message
    });
  }
});

// STEP 2: Store fresh trade (features only, no outcomes)
app.post('/api/reset/fresh-trade', async (req, res) => {
  try {
    const result = await modelReset.storeFreshTrade(req.body);
    
    console.log(`🆕 [FRESH-DATA] Stored fresh trade: ${req.body.entrySignalId} (${result.freshTradeCount} total)`);
    
    res.json({
      success: true,
      result,
      message: `Fresh trade stored (${result.freshTradeCount} total)`
    });
    
  } catch (error) {
    console.error('[FRESH-DATA] Failed to store fresh trade:', error.message);
    res.status(500).json({
      error: 'Failed to store fresh trade',
      message: error.message
    });
  }
});

// STEP 3: Update trade outcome (when trade completes)
app.put('/api/reset/trade-outcome/:entrySignalId', async (req, res) => {
  try {
    const { entrySignalId } = req.params;
    const outcomeData = req.body;
    
    const result = await modelReset.updateTradeOutcome(entrySignalId, outcomeData);
    
    console.log(`📈 [FRESH-OUTCOME] Updated outcome: ${entrySignalId} → PnL=$${outcomeData.pnl}`);
    
    res.json({
      success: true,
      result,
      message: `Trade outcome updated for ${entrySignalId}`
    });
    
  } catch (error) {
    console.error(`[FRESH-OUTCOME] Failed to update outcome for ${req.params.entrySignalId}:`, error.message);
    res.status(500).json({
      error: 'Failed to update trade outcome',
      message: error.message
    });
  }
});

// STEP 4: Check if ready for retraining
app.get('/api/reset/ready', async (req, res) => {
  try {
    const readyCheck = modelReset.isReadyForRetraining();
    
    res.json({
      success: true,
      readyCheck,
      status: modelReset.getResetStatus()
    });
    
  } catch (error) {
    console.error('[RESET] Failed to check ready status:', error.message);
    res.status(500).json({
      error: 'Failed to check ready status',
      message: error.message
    });
  }
});

// STEP 5: Begin retraining with fresh data
app.post('/api/reset/retrain', async (req, res) => {
  try {
    console.log('🎯 [RETRAINING] Fresh model training requested');
    
    const result = await modelReset.beginRetraining();
    
    res.json({
      success: true,
      result,
      message: 'Fresh training data processed - ready for clean model training'
    });
    
  } catch (error) {
    console.error('[RETRAINING] Fresh training failed:', error.message);
    res.status(500).json({
      error: 'Fresh training failed',
      message: error.message
    });
  }
});

// Get reset status
app.get('/api/reset/status', async (req, res) => {
  try {
    const status = modelReset.getResetStatus();
    
    res.json({
      success: true,
      status
    });
    
  } catch (error) {
    console.error('[RESET] Failed to get reset status:', error.message);
    res.status(500).json({
      error: 'Failed to get reset status',
      message: error.message
    });
  }
});

// Configure minimum trades required for retraining
app.put('/api/reset/config', async (req, res) => {
  try {
    const { minTradesRequired } = req.body;
    
    if (minTradesRequired && typeof minTradesRequired === 'number') {
      modelReset.setMinTradesRequired(minTradesRequired);
    }
    
    res.json({
      success: true,
      config: modelReset.resetState,
      message: 'Reset configuration updated'
    });
    
  } catch (error) {
    console.error('[RESET] Failed to update config:', error.message);
    res.status(500).json({
      error: 'Failed to update reset config',
      message: error.message
    });
  }
});

// === SESSION-BASED ENDPOINTS ===

// Get trades by session ID
app.get('/api/sessions/:sessionId/trades', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 1000 } = req.query;
    
    log(`Getting trades for session ${sessionId}`);
    
    const trades = await vectorStore.getVectorsBySessionId(sessionId, parseInt(limit));
    
    res.json({
      success: true,
      sessionId,
      tradeCount: trades.length,
      trades
    });
    
  } catch (error) {
    console.error('Failed to get session trades:', error);
    res.status(500).json({
      error: 'Failed to get session trades',
      message: error.message
    });
  }
});

// Store strategy backtest performance summary
app.post('/api/sessions/:sessionId/performance', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const performanceData = req.body;
    
    log(`Storing performance summary for session ${sessionId}`);
    
    // Create performance record
    const performanceRecord = {
      sessionId,
      timestamp: new Date(),
      strategyName: performanceData.strategyName || 'Unknown',
      instrument: performanceData.instrument || 'Unknown',
      timeframe: performanceData.timeframe || '1 minute',
      backtest: {
        startDate: performanceData.startDate,
        endDate: performanceData.endDate,
        totalDays: performanceData.totalDays
      },
      performance: {
        // Trade statistics
        tradesCount: performanceData.TradesCount || 0,
        tradesPerDay: performanceData.TradesPerDay || 0,
        averageBarsInTrade: performanceData.AverageBarsInTrade || 0,
        averageTimeInMarket: performanceData.AverageTimeInMarket || '00:00:00',
        
        // Profit/Loss metrics
        netProfit: performanceData.NetProfit || 0,
        grossProfit: performanceData.GrossProfit || 0,
        grossLoss: performanceData.GrossLoss || 0,
        profitFactor: performanceData.ProfitFactor || 0,
        
        // Risk metrics
        sharpeRatio: performanceData.SharpeRatio || 0,
        sortinoRatio: performanceData.SortinoRatio || 0,
        r2: performanceData.R2 || 0,
        monthlyStdDev: performanceData.MonthlyStdDev || 0,
        monthlyUlcer: performanceData.MonthlyUlcer || 0,
        
        // Efficiency metrics
        averageEntryEfficiency: performanceData.AverageEntryEfficiency || 0,
        averageExitEfficiency: performanceData.AverageExitEfficiency || 0,
        averageTotalEfficiency: performanceData.AverageTotalEfficiency || 0,
        
        // Consecutive stats
        maxConsecutiveWinner: performanceData.MaxConsecutiveWinner || 0,
        maxConsecutiveLoser: performanceData.MaxConsecutiveLoser || 0,
        
        // Time-based metrics
        longestFlatPeriod: performanceData.LongestFlatPeriod || '00:00:00',
        maxTime2Recover: performanceData.MaxTime2Recover || '00:00:00',
        
        // Other metrics
        totalCommission: performanceData.TotalCommission || 0,
        totalSlippage: performanceData.TotalSlippage || 0,
        totalQuantity: performanceData.TotalQuantity || 0,
        riskFreeReturn: performanceData.RiskFreeReturn || 0
      },
      currency: performanceData.Currency || {},
      percent: performanceData.Percent || {},
      points: performanceData.Points || {},
      ticks: performanceData.Ticks || {},
      pips: performanceData.Pips || {},
      performanceMetrics: performanceData.PerformanceMetrics || []
    };
    
    // Store in a simple JSON file for now (could be MongoDB later)
    const fs = require('fs').promises;
    const path = require('path');
    
    const performanceDir = './data/performance';
    await fs.mkdir(performanceDir, { recursive: true });
    
    const filename = `${sessionId}_performance.json`;
    const filepath = path.join(performanceDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(performanceRecord, null, 2));
    
    log(`✅ Stored performance summary: ${filepath}`);
    
    res.json({
      success: true,
      sessionId,
      message: 'Performance summary stored successfully',
      summary: {
        netProfit: performanceRecord.performance.netProfit,
        tradesCount: performanceRecord.performance.tradesCount,
        profitFactor: performanceRecord.performance.profitFactor,
        sharpeRatio: performanceRecord.performance.sharpeRatio
      }
    });
    
  } catch (error) {
    console.error('Failed to store performance summary:', error);
    res.status(500).json({
      error: 'Failed to store performance summary',
      message: error.message
    });
  }
});

// Get all sessions with performance summaries
app.get('/api/sessions', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    const performanceDir = './data/performance';
    
    try {
      const files = await fs.readdir(performanceDir);
      const performanceFiles = files.filter(f => f.endsWith('_performance.json'));
      
      const sessions = [];
      for (const file of performanceFiles) {
        try {
          const content = await fs.readFile(path.join(performanceDir, file), 'utf8');
          const performance = JSON.parse(content);
          sessions.push({
            sessionId: performance.sessionId,
            timestamp: performance.timestamp,
            strategyName: performance.strategyName,
            instrument: performance.instrument,
            netProfit: performance.performance.netProfit,
            tradesCount: performance.performance.tradesCount,
            profitFactor: performance.performance.profitFactor,
            sharpeRatio: performance.performance.sharpeRatio
          });
        } catch (parseError) {
          console.warn(`Failed to parse performance file ${file}:`, parseError.message);
        }
      }
      
      // Sort by timestamp (newest first)
      sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      res.json({
        success: true,
        sessionCount: sessions.length,
        sessions
      });
      
    } catch (dirError) {
      // Performance directory doesn't exist yet
      res.json({
        success: true,
        sessionCount: 0,
        sessions: []
      });
    }
    
  } catch (error) {
    console.error('Failed to get sessions:', error);
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message
    });
  }
});

// =============================================================================
// LIVE PERFORMANCE TRACKING (OUT_OF_SAMPLE) - JSON FILES
// =============================================================================

const fs = require('fs').promises;
const path = require('path');

const LIVE_STATS_FILE = path.join(__dirname, 'data', 'live-stats.json');
const EQUITY_CURVE_FILE = path.join(__dirname, 'data', 'equity-curve.json');

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load or initialize JSON files
async function loadLiveStats() {
  try {
    const data = await fs.readFile(LIVE_STATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {}; // Return empty object if file doesn't exist
  }
}

async function loadEquityCurve() {
  try {
    const data = await fs.readFile(EQUITY_CURVE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return []; // Return empty array if file doesn't exist
  }
}

async function saveLiveStats(stats) {
  await ensureDataDirectory();
  await fs.writeFile(LIVE_STATS_FILE, JSON.stringify(stats, null, 2));
}

async function saveEquityCurve(curve) {
  await ensureDataDirectory();
  await fs.writeFile(EQUITY_CURVE_FILE, JSON.stringify(curve, null, 2));
}

// OUT_OF_SAMPLE endpoint for live performance tracking
app.post('/api/live-performance', async (req, res) => {
  try {
    const { instrument, entryType, pnl, pnlPerContract, timestamp, exitReason } = req.body;
    
    if (!instrument || !entryType || typeof pnl !== 'number') {
      return res.status(400).json({
        error: 'Missing required fields: instrument, entryType, pnl'
      });
    }

    // Update live stats
    const stats = await loadLiveStats();
    const key = `${instrument}_${entryType}`;
    
    if (!stats[key]) {
      stats[key] = {
        totalTrades: 0,
        winRate: 0.0,
        totalPnL: 0.0,
        totalWins: 0,
        totalLosses: 0,
        lastTrade: null
      };
    }

    // Update aggregated stats
    const isWin = (pnlPerContract || pnl) > 0;
    stats[key].totalTrades += 1;
    stats[key].totalPnL += (pnlPerContract || pnl);
    stats[key].lastTrade = timestamp || new Date().toISOString();
    
    if (isWin) {
      stats[key].totalWins += 1;
    } else {
      stats[key].totalLosses += 1;
    }
    
    stats[key].winRate = stats[key].totalWins / stats[key].totalTrades;

    // Update equity curve
    const curve = await loadEquityCurve();
    const currentTotal = curve.length > 0 ? curve[curve.length - 1].runningPnL : 0;
    const newTotal = currentTotal + (pnlPerContract || pnl);
    
    curve.push({
      timestamp: timestamp || new Date().toISOString(),
      runningPnL: newTotal,
      tradeCount: curve.length + 1
    });

    // Save both files
    await saveLiveStats(stats);
    await saveEquityCurve(curve);

    log(`📊 Live performance updated: ${key}, PnL: ${pnlPerContract || pnl}, Running Total: ${newTotal}`);

    res.json({
      success: true,
      updated: key,
      newStats: stats[key],
      runningTotal: newTotal
    });

  } catch (error) {
    console.error('Failed to store live performance:', error);
    res.status(500).json({
      error: 'Failed to store live performance',
      message: error.message
    });
  }
});

// Get live performance stats
app.get('/api/live-performance/stats', async (req, res) => {
  try {
    const stats = await loadLiveStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Failed to get live stats:', error);
    res.status(500).json({ error: 'Failed to get live stats' });
  }
});

// Get equity curve
app.get('/api/live-performance/equity-curve', async (req, res) => {
  try {
    const curve = await loadEquityCurve();
    res.json({ success: true, curve });
  } catch (error) {
    console.error('Failed to get equity curve:', error);
    res.status(500).json({ error: 'Failed to get equity curve' });
  }
});

// ENHANCED: Duration prediction endpoint
app.post('/api/predict-duration', async (req, res) => {
  try {
    const { features, instrument, minimumDuration = 15 } = req.body;

    if (!features) {
      return res.status(400).json({
        success: false,
        error: 'Features required for duration prediction'
      });
    }

    console.log(`[DURATION-PREDICTION] Request for ${instrument}, minimum: ${minimumDuration}min`);

    const prediction = await vectorStore.predictDuration(features, {
      instrument,
      minimumDuration
    });

    res.json({
      success: true,
      prediction,
      enhancedPrediction: true
    });

  } catch (error) {
    console.error('Duration prediction failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ENHANCED: Enhanced statistics with duration/move type analysis
app.get('/api/enhanced-stats', async (req, res) => {
  try {
    const stats = await vectorStore.getStats();
    
    // Add enhanced statistics
    const allVectors = await vectorStore.getVectors({ limit: 100000 });
    
    // Duration analysis
    const durationStats = {};
    const moveTypeStats = {};
    let totalSustainability = 0;
    let sustainabilityCount = 0;
    
    allVectors.forEach(vector => {
      // Duration brackets
      const bracket = vector.durationBracket || 'unknown';
      if (!durationStats[bracket]) {
        durationStats[bracket] = { count: 0, avgPnl: 0, totalPnl: 0 };
      }
      durationStats[bracket].count++;
      durationStats[bracket].totalPnl += vector.pnl || 0;
      
      // Move types
      const moveType = vector.moveType || 'unknown';
      if (!moveTypeStats[moveType]) {
        moveTypeStats[moveType] = { count: 0, avgSustainability: 0, totalSustainability: 0 };
      }
      moveTypeStats[moveType].count++;
      
      const sustainability = vector.sustainabilityScore || 0;
      moveTypeStats[moveType].totalSustainability += sustainability;
      totalSustainability += sustainability;
      sustainabilityCount++;
    });
    
    // Calculate averages
    Object.keys(durationStats).forEach(bracket => {
      const stat = durationStats[bracket];
      stat.avgPnl = stat.count > 0 ? stat.totalPnl / stat.count : 0;
    });
    
    Object.keys(moveTypeStats).forEach(type => {
      const stat = moveTypeStats[type];
      stat.avgSustainability = stat.count > 0 ? stat.totalSustainability / stat.count : 0;
    });

    res.json({
      success: true,
      ...stats,
      enhanced: {
        durationStats,
        moveTypeStats,
        avgSustainability: sustainabilityCount > 0 ? totalSustainability / sustainabilityCount : 0,
        featureCount: 140
      },
      enhancedStats: true
    });

  } catch (error) {
    console.error('Enhanced stats failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

startServer();