/**
 * Fix dataType values based on timestamps
 * 2024 trades = TRAINING (historical)
 * 2025+ trades = RECENT (current learning data)
 */

const vectorStore = require('./src/vectorStore');

async function fixDataTypes() {
    console.log('🔧 FIXING DATATYPE VALUES');
    console.log('=========================');
    
    try {
        await vectorStore.initialize();
        
        // Get all vectors
        console.log('📊 Loading all vectors...');
        const allVectors = await vectorStore.getVectors({ limit: 100000 });
        console.log(`📈 Found ${allVectors.length} total vectors`);
        
        // Analyze timestamps and categorize
        let trainingCount = 0;
        let recentCount = 0;
        let unknownCount = 0;
        
        const updates = [];
        
        allVectors.forEach(vector => {
            const timestamp = new Date(vector.timestamp);
            const year = timestamp.getFullYear();
            
            let newDataType;
            if (year <= 2024) {
                newDataType = 'TRAINING';
                trainingCount++;
            } else if (year >= 2025) {
                newDataType = 'RECENT';
                recentCount++;
            } else {
                newDataType = 'RECENT'; // Default fallback
                unknownCount++;
            }
            
            // Only update if dataType is currently undefined/wrong
            if (vector.dataType === 'undefined' || vector.dataType !== newDataType) {
                updates.push({
                    id: vector.id,
                    currentDataType: vector.dataType,
                    newDataType: newDataType,
                    year: year,
                    instrument: vector.instrument
                });
            }
        });
        
        console.log('\\n📅 TIMESTAMP ANALYSIS:');
        console.log(`  📚 TRAINING (2024 and earlier): ${trainingCount} trades`);
        console.log(`  🎯 RECENT (2025+): ${recentCount} trades`);
        console.log(`  ❓ Unknown timestamps: ${unknownCount} trades`);
        console.log(`  🔄 Updates needed: ${updates.length} trades`);
        
        if (updates.length === 0) {
            console.log('✅ All dataTypes are already correct!');
            return;
        }
        
        // Show sample updates
        console.log('\\n🔍 Sample updates:');
        updates.slice(0, 5).forEach(update => {
            console.log(`  ${update.id}: "${update.currentDataType}" → "${update.newDataType}" (${update.year}, ${update.instrument})`);
        });
        
        // LanceDB doesn't support direct updates, so we need to delete and re-add
        // For safety, we'll update in small batches
        const batchSize = 50;
        let processed = 0;
        
        console.log('\\n🔄 Starting batch updates...');
        
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            
            console.log(`\\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(updates.length/batchSize)} (${batch.length} records)...`);
            
            // Get full records for this batch
            const batchIds = batch.map(u => u.id);
            const batchRecords = allVectors.filter(v => batchIds.includes(v.id));
            
            // Delete old records
            console.log(`  🗑️  Deleting ${batch.length} old records...`);
            const deleteResult = await vectorStore.deleteBulkVectors(batchIds);
            
            if (deleteResult.failedCount > 0) {
                console.error(`  ❌ Failed to delete ${deleteResult.failedCount} records`);
                continue;
            }
            
            // Re-add with corrected dataType
            console.log(`  ➕ Re-adding ${batch.length} records with corrected dataType...`);
            let addedCount = 0;
            let failedCount = 0;
            
            for (const record of batchRecords) {
                const update = batch.find(u => u.id === record.id);
                const correctedRecord = {
                    ...record,
                    dataType: update.newDataType
                };
                
                try {
                    await vectorStore.storeVector(correctedRecord);
                    addedCount++;
                } catch (error) {
                    console.error(`    ❌ Failed to re-add ${record.id}:`, error.message);
                    failedCount++;
                }
            }
            
            processed += addedCount;
            console.log(`  ✅ Batch completed: ${addedCount} updated, ${failedCount} failed`);
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\\n🎯 BULK UPDATE COMPLETED:');
        console.log(`  ✅ Successfully updated: ${processed} records`);
        console.log(`  ❌ Failed updates: ${updates.length - processed} records`);
        
        // Verify results
        console.log('\\n🔍 Verifying results...');
        const updatedVectors = await vectorStore.getVectors({ limit: 10 });
        console.log('Sample updated records:');
        updatedVectors.slice(0, 5).forEach((v, i) => {
            const year = new Date(v.timestamp).getFullYear();
            console.log(`  ${i+1}. ${v.instrument} (${year}): dataType = "${v.dataType}"`);
        });
        
        console.log('\\n✅ DataType migration completed!');
        console.log('💡 New trades will use proper TRAINING/RECENT categorization');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await vectorStore.close();
    }
}

// Execute the fix
fixDataTypes().catch(console.error);