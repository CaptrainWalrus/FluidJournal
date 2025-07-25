const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ENHANCED: Use new enhanced vector store and context engine
const enhancedVectorStore = require('./src/enhancedVectorStore');
const HistoricalContextEngine = require('./src/historicalContextEngine');

// Keep existing components for compatibility
const TradeClassifier = require('./src/tradeClassifier');
const PatternClusterer = require('./src/patternClusterer');
const OfflineProcessor = require('./src/offlineProcessor');
const ModelReset = require('./src/modelReset');

// Enhanced logging
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[ENHANCED-STORAGE] [${timestamp}] ${message}`, data);
  } else {
    console.log(`[ENHANCED-STORAGE] [${timestamp}] ${message}`);
  }
};

const app = express();
const PORT = process.env.ENHANCED_STORAGE_PORT || 3015; // Different port to avoid conflicts

// Initialize enhanced components
const contextEngine = new HistoricalContextEngine(enhancedVectorStore);

// Keep existing components for backward compatibility
const tradeClassifier = new TradeClassifier();
const patternClusterer = new PatternClusterer();
const offlineProcessor = new OfflineProcessor();
const modelReset = new ModelReset(enhancedVectorStore, offlineProcessor); // Use enhanced store

log('Enhanced Storage Agent initializing with 140-feature vectors and duration prediction');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// === ENHANCED ENDPOINTS ===

/**
 * Enhanced vector storage with duration prediction
 * Accepts 140-feature vectors with behavioral context
 */
app.post('/api/store-enhanced-vector', async (req, res) => {
  try {
    log('Enhanced vector storage request received', {
      entrySignalId: req.body.entrySignalId,
      instrument: req.body.instrument,
      hasFeatures: !!req.body.features,
      hasOutcome: !!req.body.outcome,
      hasDurationData: !!req.body.durationData,
      hasBehavioralContext: !!req.body.behavioralContext
    });

    // Extract behavioral context if not provided
    let behavioralContext = req.body.behavioralContext || {};
    
    if (Object.keys(behavioralContext).length === 0 && req.body.features) {
      log('Extracting behavioral context from historical data');
      
      try {
        behavioralContext = await contextEngine.extractHistoricalContext(
          req.body.features,
          {
            instrument: req.body.instrument,
            timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
            lookbackBars: 100
          }
        );
        
        log('Behavioral context extracted', {
          contextQuality: behavioralContext.contextQuality,
          dataPoints: behavioralContext.dataPoints
        });
      } catch (contextError) {
        log('Failed to extract behavioral context, using defaults', contextError.message);
        behavioralContext = {};
      }
    }

    // Store enhanced vector
    const result = await enhancedVectorStore.storeEnhancedVector({
      ...req.body,
      behavioralContext
    });

    if (result.success) {
      log('Enhanced vector stored successfully', {
        vectorId: result.vectorId,
        featureCount: result.featureCount,
        durationAnalysis: result.durationAnalysis,
        moveClassification: result.moveClassification
      });

      res.json({
        success: true,
        vectorId: result.vectorId,
        featureCount: result.featureCount,
        enhancedFeatures: true,
        durationAnalysis: result.durationAnalysis,
        moveClassification: result.moveClassification,
        behavioralContext: Object.keys(behavioralContext).length > 0 ? 'extracted' : 'provided'
      });
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    log('Enhanced vector storage failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      enhancedFeatures: true
    });
  }
});

/**
 * Duration prediction endpoint
 * Predicts how long a move will sustain based on current features
 */
app.post('/api/predict-duration', async (req, res) => {
  try {
    const { features, instrument, minimumDuration = 15 } = req.body;

    if (!features) {
      return res.status(400).json({
        success: false,
        error: 'Features required for duration prediction'
      });
    }

    log('Duration prediction request', {
      instrument,
      minimumDuration,
      featureCount: Object.keys(features).length
    });

    const prediction = await enhancedVectorStore.predictDuration(features, {
      instrument,
      minimumDuration
    });

    log('Duration prediction complete', {
      predictedDuration: prediction.predictedDuration,
      confidence: prediction.confidence,
      recommendation: prediction.recommendation
    });

    res.json({
      success: true,
      prediction,
      enhancedPrediction: true
    });

  } catch (error) {
    log('Duration prediction failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Enhanced similarity search with duration analysis
 */
app.post('/api/query-similar-enhanced', async (req, res) => {
  try {
    const { features, instrument, minimumDuration = 15, limit = 50 } = req.body;

    log('Enhanced similarity search', { instrument, minimumDuration, limit });

    const similarPatterns = await enhancedVectorStore.findSimilarVectors(features, {
      instrument,
      limit,
      includeDurationAnalysis: true
    });

    // Analyze duration characteristics of similar patterns
    const durationAnalysis = enhancedVectorStore.categorizeDurations(
      similarPatterns.map(p => p.sustainedMinutes || 0)
    );

    const sustainedCount = similarPatterns.filter(p => 
      (p.sustainedMinutes || 0) >= minimumDuration
    ).length;

    const confidence = similarPatterns.length > 0 ? sustainedCount / similarPatterns.length : 0;

    res.json({
      success: true,
      patterns: similarPatterns,
      durationAnalysis,
      confidence,
      recommendation: confidence >= 0.7 ? 'TAKE_TRADE' : 
                     confidence >= 0.5 ? 'MODERATE_CONFIDENCE' : 'WAIT_FOR_BETTER_SETUP',
      enhancedAnalysis: true
    });

  } catch (error) {
    log('Enhanced similarity search failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Extract behavioral context for given features
 */
app.post('/api/extract-context', async (req, res) => {
  try {
    const { features, instrument, timestamp, lookbackBars = 100 } = req.body;

    log('Behavioral context extraction request', { instrument, lookbackBars });

    const context = await contextEngine.extractHistoricalContext(features, {
      instrument,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      lookbackBars
    });

    res.json({
      success: true,
      context,
      contextQuality: context.contextQuality,
      featureCount: 140
    });

  } catch (error) {
    log('Context extraction failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === BACKWARD COMPATIBILITY ENDPOINTS ===

/**
 * Legacy vector storage (redirects to enhanced)
 */
app.post('/api/store-vector', async (req, res) => {
  log('Legacy store-vector request, processing with enhanced storage');
  
  try {
    // Convert legacy format to enhanced format
    const enhancedRequest = {
      ...req.body,
      behavioralContext: {},  // Will be extracted automatically
      durationData: {}        // Will be calculated from outcome
    };

    // Store using enhanced vector store directly
    const result = await enhancedVectorStore.storeEnhancedVector(enhancedRequest);
    
    res.json(result);
  } catch (error) {
    log('Legacy store-vector failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Enhanced statistics with duration and move type analysis
 */
app.get('/api/enhanced-stats', async (req, res) => {
  try {
    log('Enhanced statistics request');

    const stats = await enhancedVectorStore.getEnhancedStats();

    res.json({
      success: true,
      stats,
      enhancedStats: true,
      featureCount: 140
    });

  } catch (error) {
    log('Enhanced stats failed', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check with enhanced capabilities
 */
app.get('/api/health', async (req, res) => {
  try {
    const stats = await enhancedVectorStore.getEnhancedStats();
    const antiOverfittingStats = enhancedVectorStore.getAntiOverfittingStats();
    
    res.json({
      status: 'healthy',
      service: 'enhanced-storage-agent',
      version: '2.0.0',
      features: {
        vectorCount: 140,
        durationPrediction: true,
        behavioralContext: true,
        moveClassification: true,
        sustainabilityScoring: true,
        antiOverfitting: true
      },
      database: {
        vectors: stats.totalVectors,
        moveTypes: Object.keys(stats.moveTypeStats || {}),
        durationBrackets: Object.keys(stats.durationStats || {})
      },
      antiOverfitting: {
        isBacktestMode: antiOverfittingStats.isBacktestMode,
        totalPatterns: antiOverfittingStats.exposureReport.totalPatterns,
        avgExposure: antiOverfittingStats.exposureReport.averageExposure
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      service: 'enhanced-storage-agent'
    });
  }
});

// === ANTI-OVERFITTING ENDPOINTS ===

/**
 * Start backtest with anti-overfitting controls
 */
app.post('/api/backtest/start', async (req, res) => {
  try {
    const { startDate, endDate, resetLearning = true } = req.body;
    
    log('Starting backtest with anti-overfitting controls', {
      startDate,
      endDate,
      resetLearning
    });
    
    const result = enhancedVectorStore.startBacktest(startDate, endDate, resetLearning);
    
    res.json({
      success: true,
      backtest: result,
      message: `Backtest started from ${startDate} to ${endDate}`,
      learningReset: resetLearning
    });
    
  } catch (error) {
    log('Failed to start backtest', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * End backtest and return statistics
 */
app.post('/api/backtest/end', async (req, res) => {
  try {
    log('Ending backtest');
    
    const stats = enhancedVectorStore.endBacktest();
    
    res.json({
      success: true,
      stats,
      message: 'Backtest ended successfully'
    });
    
  } catch (error) {
    log('Failed to end backtest', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get anti-overfitting statistics and exposure report
 */
app.get('/api/anti-overfitting/stats', async (req, res) => {
  try {
    const stats = enhancedVectorStore.getAntiOverfittingStats();
    
    res.json({
      success: true,
      antiOverfitting: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    log('Failed to get anti-overfitting stats', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Configure anti-overfitting parameters
 */
app.post('/api/anti-overfitting/configure', async (req, res) => {
  try {
    const settings = req.body;
    
    log('Configuring anti-overfitting settings', settings);
    
    enhancedVectorStore.configureAntiOverfitting(settings);
    
    res.json({
      success: true,
      message: 'Anti-overfitting settings updated',
      settings
    });
    
  } catch (error) {
    log('Failed to configure anti-overfitting', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === INITIALIZATION ===

async function initializeEnhancedStorage() {
  try {
    log('Initializing enhanced vector store...');
    await enhancedVectorStore.initialize();
    log('Enhanced vector store initialized successfully');

    log('Enhanced Storage Agent ready', {
      port: PORT,
      features: 140,
      capabilities: [
        'duration_prediction',
        'behavioral_context',
        'move_classification',
        'sustainability_scoring'
      ]
    });

    // Show startup stats table
    setTimeout(showEnhancedStartupStats, 1000);

  } catch (error) {
    log('Failed to initialize enhanced storage', error.message);
    process.exit(1);
  }
}

// Show enhanced startup statistics table
async function showEnhancedStartupStats() {
  try {
    console.log('\n📊 ENHANCED STORAGE STARTUP STATISTICS');
    console.log('═'.repeat(80));
    
    const stats = await enhancedVectorStore.getEnhancedStats();
    
    if (stats.totalVectors === 0) {
      console.log('📝 No vectors stored yet - enhanced database is empty');
      console.log('═'.repeat(80));
      return;
    }
    
    console.log(`📈 Total Vectors: ${stats.totalVectors}`);
    console.log(`🎯 Feature Count: ${stats.featureCount}`);
    console.log('');
    
    // Show duration breakdown
    if (stats.durationStats && Object.keys(stats.durationStats).length > 0) {
      console.log('⏱️  DURATION BREAKDOWN');
      console.log('─'.repeat(80));
      console.log('Duration       Count     Avg PnL');
      console.log('─'.repeat(80));
      
      for (const [bracket, data] of Object.entries(stats.durationStats)) {
        console.log(`${bracket.padEnd(15)}${data.count.toString().padEnd(10)}$${data.avgPnl.toFixed(2)}`);
      }
    }
    
    // Show move type breakdown
    if (stats.moveTypeStats && Object.keys(stats.moveTypeStats).length > 0) {
      console.log('\n🎯 MOVE TYPE BREAKDOWN');
      console.log('─'.repeat(80));
      console.log('Move Type              Count     Avg Sustainability');
      console.log('─'.repeat(80));
      
      for (const [type, data] of Object.entries(stats.moveTypeStats)) {
        console.log(`${type.padEnd(23)}${data.count.toString().padEnd(10)}${data.avgSustainability.toFixed(2)}`);
      }
    }
    
    console.log('═'.repeat(80));
    console.log('💡 Enhanced features: temporal context, behavioral patterns, duration indicators');
    console.log('🔍 Use /api/enhanced-stats for detailed analysis');
    
  } catch (error) {
    console.error('Failed to show enhanced startup stats:', error);
  }
}

// Error handling
app.use((error, req, res, next) => {
  log('Unhandled error', error.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    enhancedStorage: true
  });
});

// Start server
app.listen(PORT, async () => {
  log(`Enhanced Storage Agent starting on port ${PORT}`);
  await initializeEnhancedStorage();
});

module.exports = app;