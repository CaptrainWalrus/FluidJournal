/**
 * Test similarity search with real data
 */

const vectorStore = require('./src/vectorStore');

async function testRealSimilarity() {
  console.log('🔍 Testing Similarity Search with Real Data\n');

  try {
    // Initialize vector store
    await vectorStore.initialize();
    console.log('✅ Vector store initialized\n');

    // Get a real vector to use as reference
    console.log('📊 Getting a real vector to use as reference...');
    const realVectors = await vectorStore.getVectors({ limit: 1 });
    
    if (realVectors.length === 0) {
      console.log('❌ No vectors found in database');
      return;
    }
    
    const referenceVector = realVectors[0];
    console.log(`Using vector: ${referenceVector.entrySignalId} as reference`);
    console.log(`Features length: ${referenceVector.features.length}`);
    
    // Use the reference vector's features for similarity search
    console.log('\n🔍 Running similarity search with different thresholds...\n');
    
    const thresholds = [0.99, 0.95, 0.9, 0.85, 0.8, 0.7, 0.5, 0.3];
    
    for (const threshold of thresholds) {
      const results = await vectorStore.findSimilarVectors(referenceVector.features, {
        limit: 5,
        similarity_threshold: threshold
      });
      
      console.log(`Threshold ${threshold}: Found ${results.length} similar vectors`);
      if (results.length > 0) {
        console.log(`  Top match: ${results[0].entrySignalId} (distance: ${results[0]._distance?.toFixed(4)})`);
      }
    }
    
    // Test with ORDER_FLOW_IMBALANCE filter
    console.log('\n🔍 Testing with ORDER_FLOW_IMBALANCE entry type filter...');
    const filteredResults = await vectorStore.findSimilarVectors(referenceVector.features, {
      entryType: 'ORDER_FLOW_IMBALANCE',
      limit: 10,
      similarity_threshold: 0.5
    });
    
    console.log(`Found ${filteredResults.length} ORDER_FLOW_IMBALANCE vectors`);
    
    // Show entry types in database
    console.log('\n📊 Entry types in database:');
    const allVectors = await vectorStore.getVectors({ limit: 100 });
    const entryTypes = {};
    allVectors.forEach(v => {
      entryTypes[v.entryType] = (entryTypes[v.entryType] || 0) + 1;
    });
    
    Object.entries(entryTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} vectors`);
    });

    await vectorStore.close();
    console.log('\n✅ Test complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run test
testRealSimilarity();