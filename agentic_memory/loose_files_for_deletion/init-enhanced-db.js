/**
 * Initialize Enhanced LanceDB with Duration Prediction Schema
 * 
 * This script creates the new enhanced table structure with:
 * - 140-feature vectors
 * - Duration-based outcomes
 * - Move type classification
 * - Behavioral context fields
 */

const enhancedVectorStore = require('./src/enhancedVectorStore');
const HistoricalContextEngine = require('./src/historicalContextEngine');

async function initializeEnhancedDatabase() {
  console.log('🚀 Initializing Enhanced Storage Agent Database...\n');

  try {
    // Initialize enhanced vector store
    console.log('📊 Creating enhanced LanceDB table...');
    await enhancedVectorStore.initialize();
    console.log('✅ Enhanced vector store initialized');

    // Initialize context engine
    console.log('🧠 Initializing historical context engine...');
    const contextEngine = new HistoricalContextEngine(enhancedVectorStore);
    console.log('✅ Context engine ready');

    // Test the enhanced system with sample data
    console.log('🧪 Testing enhanced system with sample data...');
    
    const sampleFeatures = {};
    // Create 94 sample features (existing)
    for (let i = 0; i < 94; i++) {
      sampleFeatures[`feature_${i}`] = Math.random();
    }

    const sampleBehavioralContext = {
      // Temporal context
      similar_setup_20bars_ago: 1,
      pattern_frequency_100bars: 5,
      trend_age_bars: 12,
      
      // Behavioral patterns  
      typical_trend_duration: 22,
      spike_reversion_probability: 0.3,
      
      // Duration indicators
      move_acceleration_rate: 0.1,
      sustainability_composite: 0.7
    };

    const sampleVector = {
      entrySignalId: 'ENHANCED_TEST_001',
      instrument: 'MGC',
      timestamp: new Date().toISOString(),
      sessionId: 'enhanced-init-test',
      entryType: 'SYSTEM_TEST',
      direction: 'long',
      timeframeMinutes: 1,
      quantity: 1,
      features: sampleFeatures,
      behavioralContext: sampleBehavioralContext,
      riskUsed: {
        stopLoss: 15.0,
        takeProfit: 30.0
      },
      outcome: {
        pnl: 25.0,
        pnlPoints: 2.5,
        holdingBars: 18,
        exitReason: 'Target reached',
        maxProfit: 32.0,
        maxLoss: -3.0,
        wasGoodExit: true
      },
      durationData: {
        sustainedMinutes: 18,
        firstProfitMinutes: 2,
        maxProfitMinutes: 15,
        profitSustainedMinutes: 16
      },
      dataType: 'TRAINING'
    };

    const result = await enhancedVectorStore.storeEnhancedVector(sampleVector);
    
    if (result.success) {
      console.log('✅ Sample enhanced vector stored successfully');
      console.log(`   Vector ID: ${result.vectorId}`);
      console.log(`   Feature Count: ${result.featureCount}`);
      console.log(`   Duration: ${result.durationAnalysis.sustainedMinutes}min (${result.durationAnalysis.bracket})`);
      console.log(`   Move Type: ${result.moveClassification.type} (${result.moveClassification.sustainabilityScore.toFixed(2)} sustainability)`);
    } else {
      throw new Error(`Sample storage failed: ${result.error}`);
    }

    // Test duration prediction
    console.log('🔮 Testing duration prediction...');
    const prediction = await enhancedVectorStore.predictDuration(sampleFeatures, {
      instrument: 'MGC',
      minimumDuration: 15
    });

    console.log('✅ Duration prediction test completed');
    console.log(`   Predicted Duration: ${prediction.predictedDuration.toFixed(1)} minutes`);
    console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${prediction.recommendation}`);

    // Get enhanced statistics
    console.log('📈 Retrieving enhanced statistics...');
    const stats = await enhancedVectorStore.getEnhancedStats();
    
    console.log('✅ Enhanced database statistics:');
    console.log(`   Total Vectors: ${stats.totalVectors}`);
    console.log(`   Feature Count: ${stats.featureCount}`);
    console.log(`   Move Types: ${Object.keys(stats.moveTypeStats || {}).join(', ') || 'None yet'}`);
    console.log(`   Duration Brackets: ${Object.keys(stats.durationStats || {}).join(', ') || 'None yet'}`);
    console.log(`   Average Sustainability: ${stats.sustainabilityStats?.avgSustainability?.toFixed(2) || 'N/A'}`);

    // Test context extraction
    console.log('🎯 Testing context extraction...');
    const context = await contextEngine.extractHistoricalContext(sampleFeatures, {
      instrument: 'MGC',
      timestamp: new Date(),
      lookbackBars: 50
    });

    console.log('✅ Context extraction test completed');
    console.log(`   Context Quality: ${context.contextQuality}`);
    console.log(`   Data Points: ${context.dataPoints}`);
    console.log(`   Temporal Features: ${Object.keys(context).filter(k => k.includes('setup') || k.includes('sequence')).length}`);

    console.log('\n🎉 ENHANCED STORAGE AGENT INITIALIZATION COMPLETE!');
    console.log('\n📋 System Capabilities:');
    console.log('   ✅ 140-feature vector storage');
    console.log('   ✅ Duration-based confidence prediction');
    console.log('   ✅ Move type classification (spike vs trend)');
    console.log('   ✅ Behavioral context extraction');
    console.log('   ✅ Sustainability scoring');
    console.log('   ✅ Historical pattern analysis');
    console.log('   ✅ Temporal sequence recognition');
    console.log('\n🚀 Ready for NinjaTrader integration!');
    console.log(`   Enhanced API available on port ${process.env.ENHANCED_STORAGE_PORT || 3016}`);
    console.log('   Endpoints:');
    console.log('   - POST /api/store-enhanced-vector');
    console.log('   - POST /api/predict-duration');
    console.log('   - POST /api/query-similar-enhanced');
    console.log('   - POST /api/extract-context');
    console.log('   - GET /api/enhanced-stats');

  } catch (error) {
    console.error('❌ Enhanced database initialization failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run initialization
if (require.main === module) {
  initializeEnhancedDatabase()
    .then(() => {
      console.log('\n✨ Enhanced Storage Agent ready for production use!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Initialization failed:', error.message);
      process.exit(1);
    });
}

module.exports = initializeEnhancedDatabase;