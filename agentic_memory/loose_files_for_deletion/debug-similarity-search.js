/**
 * Debug script to test similarity search and see what data is returned
 */

const vectorStore = require('./src/vectorStore');

async function debugSimilaritySearch() {
  console.log('🔍 Debug Similarity Search\n');

  try {
    // Initialize vector store
    await vectorStore.initialize();
    console.log('✅ Vector store initialized\n');

    // Create test features similar to what would be sent
    const testFeatures = new Float32Array([
      0.1, 0.2, 0.3, 0.4, 0.5,
      0.6, 0.7, 0.8, 0.9, 1.0,
      1.1, 1.2, 1.3, 1.4, 1.5,
      1.6, 1.7, 1.8, 1.9, 2.0
    ]);
    
    console.log('🔍 Running similarity search...');
    const similarVectors = await vectorStore.findSimilarVectors(testFeatures, {
      entryType: 'ORDER_FLOW_IMBALANCE',
      limit: 10,
      similarity_threshold: 0.5 // Lower threshold to see more results
    });
    
    console.log(`\n📊 Found ${similarVectors.length} similar vectors:\n`);
    
    // Display each result
    similarVectors.forEach((vector, index) => {
      console.log(`Result ${index + 1}:`);
      console.log(`  ID: ${vector.id}`);
      console.log(`  Entry Signal ID: ${vector.entrySignalId}`);
      console.log(`  Instrument: ${vector.instrument}`);
      console.log(`  Entry Type: ${vector.entryType}`);
      console.log(`  Distance: ${vector._distance?.toFixed(4) || 'N/A'}`);
      console.log(`  PnL: ${vector.pnl}`);
      console.log(`  Exit Reason: ${vector.exitReason}`);
      console.log('');
    });

    // Also get some raw vectors to see what's in the DB
    console.log('\n📊 Getting raw vectors from database...\n');
    const rawVectors = await vectorStore.getVectors({
      limit: 5
    });
    
    console.log(`Found ${rawVectors.length} raw vectors:\n`);
    rawVectors.forEach((vector, index) => {
      console.log(`Vector ${index + 1}:`);
      console.log(`  ID: ${vector.id}`);
      console.log(`  Entry Signal ID: ${vector.entrySignalId}`);
      console.log(`  Timestamp: ${new Date(vector.timestamp).toISOString()}`);
      console.log('');
    });

    // Check if test_signal_001 exists
    console.log('\n🔍 Checking for test_signal_001...\n');
    const allVectors = await vectorStore.getVectors({ limit: 1000 });
    const testSignals = allVectors.filter(v => v.entrySignalId && v.entrySignalId.includes('test_signal'));
    
    if (testSignals.length > 0) {
      console.log(`⚠️ Found ${testSignals.length} test signals in database:`);
      testSignals.forEach(signal => {
        console.log(`  - ${signal.entrySignalId} (ID: ${signal.id})`);
      });
    } else {
      console.log('✅ No test signals found in database');
    }

    await vectorStore.close();
    console.log('\n✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run debug
debugSimilaritySearch();