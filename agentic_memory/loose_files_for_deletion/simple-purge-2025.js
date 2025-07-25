/**
 * Simple purge script for 2025 trades
 * Uses direct database access instead of API
 */

const vectorStore = require('./src/vectorStore');

async function simplePurge2025() {
    console.log('🗑️  Starting simple purge of 2025 trades...');
    
    try {
        // Initialize vector store
        await vectorStore.initialize();
        
        // Get all vectors
        console.log('📊 Analyzing all vectors...');
        const allVectors = await vectorStore.getVectors({ limit: 100000 });
        
        console.log(`📈 Total vectors: ${allVectors.length}`);
        
        // Find 2025+ trades
        const vectorsTo2025 = allVectors.filter(vector => {
            const year = new Date(vector.timestamp).getFullYear();
            return year >= 2025;
        });
        
        console.log(`🎯 Found ${vectorsTo2025.length} trades from 2025+ to purge`);
        
        if (vectorsTo2025.length === 0) {
            console.log('✅ No 2025+ trades found. Database is clean.');
            return;
        }
        
        // Show sample trades
        console.log('\n🔍 Sample trades to be purged:');
        vectorsTo2025.slice(0, 5).forEach(vector => {
            console.log(`  ${vector.id}: ${new Date(vector.timestamp).toISOString()} - ${vector.instrument} ${vector.direction}`);
        });
        
        // Bulk delete
        console.log(`\n🗑️  Deleting ${vectorsTo2025.length} trades...`);
        const vectorIds = vectorsTo2025.map(v => v.id);
        
        const result = await vectorStore.deleteBulkVectors(vectorIds);
        
        console.log(`✅ Deleted: ${result.deletedCount}`);
        console.log(`❌ Failed: ${result.failedCount}`);
        
        // Verify results
        const remainingVectors = await vectorStore.getVectors({ limit: 100000 });
        console.log(`📉 Remaining vectors: ${remainingVectors.length}`);
        
        console.log('\n✅ Purge completed! Fresh backtest data can now repopulate.');
        
    } catch (error) {
        console.error('❌ Purge failed:', error);
    } finally {
        await vectorStore.close();
    }
}

simplePurge2025();