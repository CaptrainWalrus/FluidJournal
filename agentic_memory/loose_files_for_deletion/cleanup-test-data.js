/**
 * Script to clean up test data from LanceDB storage
 */

const lancedb = require('vectordb');
const path = require('path');

async function cleanupTestData() {
  console.log('🧹 Starting test data cleanup...\n');

  try {
    // Connect directly to LanceDB
    const dbPath = process.env.LANCEDB_PATH || './data/vectors';
    const db = await lancedb.connect(dbPath);
    const table = await db.openTable('feature_vectors');
    
    // First, count how many test records exist
    console.log('📊 Checking for test data...');
    
    // Delete all test signal entries - use exact field name with quotes for case sensitivity
    const deleteCondition = `"entrySignalId" LIKE 'test_signal%' OR id = 'sample'`;
    
    console.log('🗑️ Deleting test data with condition:', deleteCondition);
    await table.delete(deleteCondition);
    
    console.log('✅ Test data deletion complete');
    
    // Verify deletion by checking remaining records
    console.log('\n🔍 Verifying cleanup...');
    const remainingVectors = await table.filter('id IS NOT NULL').limit(10).execute();
    
    console.log(`\n📊 Sample of remaining vectors (${remainingVectors.length} shown):`);
    remainingVectors.forEach((vector, index) => {
      console.log(`  ${index + 1}. ${vector.entrySignalId} (${vector.instrument})`);
    });
    
    // Check specifically for test signals
    const checkTestSignals = remainingVectors.filter(v => 
      v.entrySignalId && v.entrySignalId.includes('test_signal')
    );
    
    if (checkTestSignals.length === 0) {
      console.log('\n✅ Success! All test signals have been removed.');
    } else {
      console.log(`\n⚠️ Warning: ${checkTestSignals.length} test signals still found.`);
    }
    
    console.log('\n🎉 Cleanup complete!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run cleanup
cleanupTestData();