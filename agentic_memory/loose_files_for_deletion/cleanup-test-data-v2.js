/**
 * Script to clean up test data from LanceDB storage - Version 2
 * Uses individual record deletion
 */

const lancedb = require('vectordb');

async function cleanupTestData() {
  console.log('🧹 Starting test data cleanup (v2)...\n');

  try {
    // Connect directly to LanceDB
    const dbPath = process.env.LANCEDB_PATH || './data/vectors';
    const db = await lancedb.connect(dbPath);
    const table = await db.openTable('feature_vectors');
    
    // Get all records to find test data
    console.log('📊 Fetching all records to find test data...');
    const allVectors = await table.filter('id IS NOT NULL').limit(10000).execute();
    
    // Find test records
    const testRecords = allVectors.filter(v => 
      (v.entrySignalId && v.entrySignalId.includes('test_signal')) || 
      v.id === 'sample'
    );
    
    console.log(`Found ${testRecords.length} test records to delete:`);
    testRecords.forEach(record => {
      console.log(`  - ${record.id} (${record.entrySignalId})`);
    });
    
    if (testRecords.length === 0) {
      console.log('\n✅ No test data found to clean up!');
      return;
    }
    
    // Delete each test record individually
    console.log('\n🗑️ Deleting test records...');
    for (const record of testRecords) {
      try {
        // Escape single quotes in ID if any
        const safeId = record.id.replace(/'/g, "''");
        const deleteCondition = `id = '${safeId}'`;
        await table.delete(deleteCondition);
        console.log(`  ✅ Deleted: ${record.id}`);
      } catch (err) {
        console.log(`  ❌ Failed to delete ${record.id}: ${err.message}`);
      }
    }
    
    // Verify deletion
    console.log('\n🔍 Verifying cleanup...');
    const remainingVectors = await table.filter('id IS NOT NULL').limit(10000).execute();
    const remainingTestRecords = remainingVectors.filter(v => 
      (v.entrySignalId && v.entrySignalId.includes('test_signal')) || 
      v.id === 'sample'
    );
    
    if (remainingTestRecords.length === 0) {
      console.log('✅ Success! All test data has been removed.');
      console.log(`Total vectors remaining: ${remainingVectors.length}`);
      
      // Show sample of real data
      console.log('\n📊 Sample of remaining real data:');
      remainingVectors.slice(0, 5).forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.entrySignalId} (${v.instrument}) - PnL: ${v.pnl}`);
      });
    } else {
      console.log(`⚠️ Warning: ${remainingTestRecords.length} test records still remain.`);
    }
    
    console.log('\n🎉 Cleanup complete!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run cleanup
cleanupTestData();