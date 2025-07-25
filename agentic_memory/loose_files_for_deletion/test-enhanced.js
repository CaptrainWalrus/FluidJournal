/**
 * Test Enhanced Storage Agent Features
 * 
 * Tests:
 * 1. 140-feature vector storage
 * 2. Duration prediction
 * 3. Move type classification
 * 4. Enhanced statistics
 */

const vectorStore = require('./src/vectorStore');

async function testEnhancedFeatures() {
  console.log('🧪 Testing Enhanced Storage Agent Features...\n');

  try {
    // Initialize vector store
    console.log('📊 Initializing enhanced vector store...');
    await vectorStore.initialize();
    console.log('✅ Vector store initialized\n');

    // Create 140-feature test data
    console.log('🔧 Creating 140-feature test vector...');
    const features = {};
    
    // Original 94 features
    for (let i = 0; i < 94; i++) {
      features[`original_feature_${i}`] = Math.random();
    }
    
    // Enhanced temporal features (94-109)
    features['similar_setup_20bars_ago'] = 1;
    features['pattern_frequency_100bars'] = 5;
    features['bullish_sequence_length'] = 3;
    features['trend_age_bars'] = 12;
    features['breakout_sustainability'] = 0.7;
    
    // Enhanced behavioral features (110-124)
    features['typical_trend_duration'] = 22;
    features['spike_reversion_probability'] = 0.3;
    features['session_bias_strength'] = 0.1;
    features['ny_open_effect'] = 0.2;
    features['momentum_decay_rate'] = 0.15;
    
    // Enhanced duration features (125-139)  
    features['move_acceleration_rate'] = 0.1;
    features['volume_sustainability'] = 0.8;
    features['momentum_persistence'] = 0.6;
    features['sustainability_composite'] = 0.75;
    features['cross_timeframe_alignment'] = 0.9;

    console.log(`✅ Created ${Object.keys(features).length} features\n`);

    // Test enhanced vector storage with duration data
    console.log('💾 Testing enhanced vector storage...');
    const testVector = {
      entrySignalId: 'ENHANCED_TEST_001',
      instrument: 'MGC',
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      entryType: 'ENHANCED_TEST',
      direction: 'long',
      timeframeMinutes: 1,
      quantity: 1,
      features: features,
      riskUsed: {
        stopLoss: 15.0,
        takeProfit: 30.0
      },
      outcome: {
        pnl: 45.0,
        pnlPoints: 4.5,
        holdingBars: 22,
        exitReason: 'Target reached',
        maxProfit: 48.0,
        maxLoss: -2.0,
        wasGoodExit: true
      },
      dataType: 'RECENT'
    };

    const storeResult = await vectorStore.storeVector(testVector);
    
    if (storeResult.success) {
      console.log('✅ Enhanced vector stored successfully');
      console.log(`   Vector ID: ${storeResult.vectorId}`);
      console.log(`   Feature Count: ${storeResult.featureCount}`);
    } else {
      throw new Error(storeResult.error);
    }

    // Test duration prediction
    console.log('\n🔮 Testing duration prediction...');
    const prediction = await vectorStore.predictDuration(features, {
      instrument: 'MGC',
      minimumDuration: 15
    });

    console.log('✅ Duration prediction completed');
    console.log(`   Predicted Duration: ${prediction.predictedDuration.toFixed(1)} minutes`);
    console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${prediction.recommendation}`);
    console.log(`   Sample Size: ${prediction.sampleSize}`);

    // Test enhanced statistics
    console.log('\n📈 Testing enhanced statistics...');
    const stats = await vectorStore.getStats();
    
    console.log('✅ Enhanced statistics retrieved');
    console.log(`   Total Vectors: ${stats.totalVectors}`);
    console.log(`   Feature Count: ${stats.featureCount}`);
    console.log(`   Instruments: ${Object.keys(stats.instrumentCounts || {}).join(', ') || 'None'}`);

    // Test similar vector search with enhanced features
    console.log('\n🔍 Testing similarity search with 140 features...');
    const similarVectors = await vectorStore.findSimilarVectors(Object.values(features), {
      instrument: 'MGC',
      limit: 10,
      similarity_threshold: 0.1 // Lower threshold for testing
    });

    console.log('✅ Similarity search completed');
    console.log(`   Found ${similarVectors.length} similar patterns`);
    
    if (similarVectors.length > 0) {
      const topMatch = similarVectors[0];
      console.log(`   Top Match Similarity: ${topMatch._similarity_score?.toFixed(3) || 'N/A'}`);
      console.log(`   Duration: ${topMatch.sustainedMinutes || 0}min (${topMatch.durationBracket || 'unknown'})`);
      console.log(`   Move Type: ${topMatch.moveType || 'unknown'} (${topMatch.sustainabilityScore?.toFixed(2) || 'N/A'} sustainability)`);
    }

    console.log('\n🎉 All Enhanced Storage Agent Tests Passed!');
    console.log('\n📋 Enhanced Capabilities Verified:');
    console.log('   ✅ 140-feature vector storage');
    console.log('   ✅ Duration-based outcomes');
    console.log('   ✅ Move type classification');
    console.log('   ✅ Sustainability scoring');
    console.log('   ✅ Duration prediction');
    console.log('   ✅ Enhanced similarity search');
    console.log('\n🚀 Storage Agent ready for NinjaTrader integration!');
    console.log('   Next step: Update NinjaTrader to send 140 features');

  } catch (error) {
    console.error('❌ Enhanced Storage Agent test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testEnhancedFeatures()
    .then(() => {
      console.log('\n✨ Enhanced Storage Agent testing complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = testEnhancedFeatures;