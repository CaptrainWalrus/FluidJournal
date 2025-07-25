const lancedb = require('vectordb');

async function testLanceDBLimit() {
    console.log('🧪 Testing LanceDB Record Limit\n');
    
    const dbPath = './data/vectors_fresh';
    
    try {
        const db = await lancedb.connect(dbPath);
        const table = await db.openTable('feature_vectors');
        
        console.log('1. Testing different query methods:\n');
        
        // Method 1: filter with no limit
        console.log('   a) filter with no limit:');
        const filter1 = await table.filter('id IS NOT NULL').execute();
        console.log(`      Result: ${filter1.length} records`);
        
        // Method 2: search with no limit
        console.log('   b) search with no limit:');
        const search1 = await table.search().execute();
        console.log(`      Result: ${search1.length} records`);
        
        // Method 3: filter with explicit high limit
        console.log('   c) filter with limit(1000):');
        const filter2 = await table.filter('id IS NOT NULL').limit(1000).execute();
        console.log(`      Result: ${filter2.length} records`);
        
        // Method 4: search with explicit high limit
        console.log('   d) search with limit(1000):');
        const search2 = await table.search().limit(1000).execute();
        console.log(`      Result: ${search2.length} records`);
        
        // Check table metadata
        console.log('\n2. Checking table metadata:');
        const schema = await table.schema;
        console.log(`   Schema fields: ${schema.fields.length}`);
        
        // Try to get table statistics
        console.log('\n3. Database statistics:');
        const fs = require('fs');
        const path = require('path');
        const versionDir = path.join(dbPath, 'feature_vectors.lance', '_versions');
        const dataDir = path.join(dbPath, 'feature_vectors.lance', 'data');
        
        if (fs.existsSync(versionDir)) {
            const versions = fs.readdirSync(versionDir);
            console.log(`   Version files: ${versions.length}`);
            
            // Check manifest files
            const manifests = versions.filter(f => f.endsWith('.manifest'));
            console.log(`   Manifest files: ${manifests.length}`);
            
            // Check latest manifest
            if (manifests.length > 0) {
                const latestManifest = manifests[manifests.length - 1];
                const manifestPath = path.join(versionDir, latestManifest);
                const manifestSize = fs.statSync(manifestPath).size;
                console.log(`   Latest manifest: ${latestManifest} (${manifestSize} bytes)`);
            }
        }
        
        if (fs.existsSync(dataDir)) {
            const dataFiles = fs.readdirSync(dataDir);
            console.log(`   Data files: ${dataFiles.length}`);
        }
        
        // Try adding multiple records at once
        console.log('\n4. Testing bulk add:');
        const bulkRecords = [];
        const baseTime = Date.now();
        
        for (let i = 0; i < 20; i++) {
            bulkRecords.push({
                id: `BULK_TEST_${baseTime}_${i}`,
                timestamp: baseTime + i,
                entrySignalId: `BULK_${i}`,
                sessionId: 'bulk-test',
                inst: 'BULK',
                type: 'TEST',
                dir: 'L',
                qty: 1,
                dataType: 'UNIFIED',
                features: new Float32Array(140),
                pnl: i * 10,
                pnlPts: i,
                pnlPC: i * 10,
                bars: 10,
                exit: 'T',
                maxP: i * 15,
                maxL: i * -5,
                good: true,
                sustainedMinutes: 30,
                durationBracket: '15-30min',
                moveType: 'test',
                sustainabilityScore: 0.8,
                profitByBar: new Float32Array(50),
                profitByBarJson: '[]',
                trajectoryBars: 50
            });
        }
        
        console.log(`   Adding ${bulkRecords.length} records...`);
        await table.add(bulkRecords);
        console.log('   ✅ Bulk add completed');
        
        // Count again
        console.log('\n5. Final count after bulk add:');
        const finalCount = await table.filter('id IS NOT NULL').execute();
        console.log(`   Total records: ${finalCount.length}`);
        
        // Check if our bulk records exist
        const bulkSearch = await table.filter(`id LIKE 'BULK_TEST_%'`).execute();
        console.log(`   Bulk records found: ${bulkSearch.length}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testLanceDBLimit().catch(console.error);