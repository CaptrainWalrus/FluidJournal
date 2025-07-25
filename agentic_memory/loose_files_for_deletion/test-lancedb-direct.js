const lancedb = require('vectordb');
const path = require('path');

async function testLanceDBDirect() {
    console.log('🧪 Direct LanceDB Test\n');
    
    const dbPath = './data/vectors_fresh';
    console.log(`Database path: ${dbPath}\n`);
    
    try {
        // Connect to database
        console.log('1. Connecting to database...');
        const db = await lancedb.connect(dbPath);
        console.log('✅ Connected\n');
        
        // Open table
        console.log('2. Opening table...');
        const table = await db.openTable('feature_vectors');
        console.log('✅ Table opened\n');
        
        // Count existing records
        console.log('3. Counting existing records...');
        const existingRecords = await table.filter('id IS NOT NULL').execute();
        console.log(`✅ Found ${existingRecords.length} existing records\n`);
        
        // Try to add a simple record
        console.log('4. Adding a test record...');
        const testRecord = {
            id: `DIRECT_TEST_${Date.now()}`,
            timestamp: Date.now(),
            entrySignalId: 'DIRECT_TEST',
            sessionId: 'test-session',
            inst: 'TEST',
            type: 'TEST',
            dir: 'L',
            qty: 1,
            dataType: 'UNIFIED',
            features: new Float32Array(140),
            pnl: 100,
            pnlPts: 10,
            pnlPC: 100,
            bars: 50,
            exit: 'T',
            maxP: 150,
            maxL: -50,
            good: true,
            sustainedMinutes: 30,
            durationBracket: '15-30min',
            moveType: 'test',
            sustainabilityScore: 0.8,
            profitByBar: new Float32Array(50),
            profitByBarJson: '[]',
            trajectoryBars: 50
        };
        
        console.log('   Record to add:', {
            id: testRecord.id,
            inst: testRecord.inst,
            timestamp: new Date(testRecord.timestamp).toISOString()
        });
        
        try {
            await table.add([testRecord]);
            console.log('✅ Record added successfully\n');
        } catch (addError) {
            console.error('❌ Failed to add record:', addError.message);
            console.error('   Error details:', addError);
        }
        
        // Count records again
        console.log('5. Counting records after add...');
        const afterAddRecords = await table.filter('id IS NOT NULL').execute();
        console.log(`✅ Now have ${afterAddRecords.length} records\n`);
        
        // Try to find our record
        console.log('6. Searching for our test record...');
        const searchResult = await table.filter(`id = '${testRecord.id}'`).execute();
        console.log(`✅ Search found ${searchResult.length} matching records\n`);
        
        // List last 5 records
        console.log('7. Last 5 records in database:');
        const sorted = afterAddRecords.sort((a, b) => b.timestamp - a.timestamp);
        sorted.slice(0, 5).forEach(r => {
            console.log(`   ${r.id} - ${r.inst} - ${new Date(r.timestamp).toISOString()}`);
        });
        
        // Check database files
        console.log('\n8. Checking database files...');
        const fs = require('fs');
        const versionDir = path.join(dbPath, 'feature_vectors.lance', '_versions');
        if (fs.existsSync(versionDir)) {
            const versions = fs.readdirSync(versionDir);
            console.log(`   Version files: ${versions.length}`);
            console.log(`   Latest versions: ${versions.slice(-5).join(', ')}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Error stack:', error.stack);
    }
}

// Run test
testLanceDBDirect().catch(console.error);