/**
 * Purge all trades from 2025 (out-of-sample data)
 * This will allow fresh backtest data to repopulate with proper timestamps
 */

const AgenticMemoryClient = require('../shared/agenticMemoryClient');

async function purge2025Trades() {
    console.log('🗑️  Starting purge of 2025 trades (out-of-sample data)...');
    
    const client = new AgenticMemoryClient();
    
    try {
        // Get all vectors to analyze timestamps
        console.log('📊 Getting all vectors to analyze timestamps...');
        const allVectors = await client.getVectors({ limit: 100000 });
        
        console.log(`📈 Total vectors in database: ${allVectors.length}`);
        
        // Analyze timestamp distribution
        const timestampAnalysis = {};
        const vectorsTo2025 = [];
        
        for (const vector of allVectors) {
            const timestamp = new Date(vector.timestamp);
            const year = timestamp.getFullYear();
            
            if (!timestampAnalysis[year]) {
                timestampAnalysis[year] = 0;
            }
            timestampAnalysis[year]++;
            
            // Collect vectors from 2025 or later
            if (year >= 2025) {
                vectorsTo2025.push(vector);
            }
        }
        
        console.log('\n📅 Timestamp distribution by year:');
        Object.keys(timestampAnalysis).sort().forEach(year => {
            console.log(`  ${year}: ${timestampAnalysis[year]} trades`);
        });
        
        console.log(`\n🎯 Found ${vectorsTo2025.length} trades from 2025+ to purge`);
        
        if (vectorsTo2025.length === 0) {
            console.log('✅ No 2025+ trades found. Database is clean.');
            return;
        }
        
        // Sample some 2025 trades to show what we're purging
        console.log('\n🔍 Sample trades to be purged:');
        vectorsTo2025.slice(0, 5).forEach(vector => {
            console.log(`  ${vector.id}: ${new Date(vector.timestamp).toISOString()} - ${vector.instrument} ${vector.direction} ($${vector.pnl || 0})`);
        });
        
        if (vectorsTo2025.length > 5) {
            console.log(`  ... and ${vectorsTo2025.length - 5} more`);
        }
        
        // Confirm purge
        console.log(`\n⚠️  This will DELETE ${vectorsTo2025.length} trades from 2025+`);
        console.log('   This action cannot be undone!');
        console.log('   New backtest trades will repopulate with proper bar timestamps.');
        
        // Extract vector IDs for bulk deletion
        const vectorIds = vectorsTo2025.map(v => v.id);
        
        console.log('\n🗑️  Starting bulk deletion...');
        const deleteResult = await client.deleteBulkVectors(vectorIds);
        
        console.log('\n📊 Deletion results:');
        console.log(`  ✅ Deleted: ${deleteResult.deletedCount} trades`);
        console.log(`  ❌ Failed: ${deleteResult.failedCount} trades`);
        
        if (deleteResult.failedCount > 0) {
            console.log(`  Failed IDs: ${deleteResult.failedIds.slice(0, 5).join(', ')}...`);
        }
        
        // Get updated stats
        console.log('\n📈 Getting updated database stats...');
        const updatedVectors = await client.getVectors({ limit: 100000 });
        console.log(`📉 Remaining vectors: ${updatedVectors.length}`);
        
        // Show new timestamp distribution
        const newTimestampAnalysis = {};
        for (const vector of updatedVectors) {
            const year = new Date(vector.timestamp).getFullYear();
            newTimestampAnalysis[year] = (newTimestampAnalysis[year] || 0) + 1;
        }
        
        console.log('\n📅 Updated timestamp distribution:');
        Object.keys(newTimestampAnalysis).sort().forEach(year => {
            console.log(`  ${year}: ${newTimestampAnalysis[year]} trades`);
        });
        
        console.log('\n✅ 2025+ trade purge completed!');
        console.log('💡 New backtest trades will now use proper bar timestamps and dataTypes.');
        
    } catch (error) {
        console.error('❌ Error during purge:', error.message);
        throw error;
    }
}

// Run the purge
purge2025Trades().catch(console.error);