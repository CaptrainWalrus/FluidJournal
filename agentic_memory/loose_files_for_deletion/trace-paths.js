const path = require('path');
const fs = require('fs');

console.log('🔍 TRACING DATABASE PATHS\n');

// Check what vectorStore actually uses
console.log('1. VectorStore module path resolution:');
const vectorStore = require('./src/vectorStore');
console.log(`   dbPath from vectorStore: ${vectorStore.dbPath}`);
console.log(`   Absolute path: ${path.resolve(vectorStore.dbPath)}`);

// Check environment variable
console.log('\n2. Environment variable:');
console.log(`   LANCEDB_PATH: ${process.env.LANCEDB_PATH || 'NOT SET'}`);

// Check actual file locations
console.log('\n3. Actual database locations:');
const dataDir = './data';
const dirs = fs.readdirSync(dataDir);
dirs.forEach(dir => {
    if (dir.includes('vectors')) {
        const fullPath = path.join(dataDir, dir);
        const absPath = path.resolve(fullPath);
        const stats = fs.statSync(fullPath);
        console.log(`   ${dir}:`);
        console.log(`     - Full path: ${fullPath}`);
        console.log(`     - Absolute: ${absPath}`);
        console.log(`     - Modified: ${stats.mtime}`);
        
        // Check for lance table
        const lancePath = path.join(fullPath, 'feature_vectors.lance');
        if (fs.existsSync(lancePath)) {
            const versionPath = path.join(lancePath, '_versions');
            if (fs.existsSync(versionPath)) {
                const files = fs.readdirSync(versionPath);
                console.log(`     - Version files: ${files.length}`);
                // Get latest file
                const latest = files.sort().pop();
                if (latest) {
                    const latestStats = fs.statSync(path.join(versionPath, latest));
                    console.log(`     - Latest: ${latest} (${latestStats.mtime})`);
                }
            }
        }
    }
});

// Test direct write and read
console.log('\n4. Testing direct write/read to confirm path:');
const testDbPath = vectorStore.dbPath;
console.log(`   Using path: ${testDbPath}`);

const lancedb = require('vectordb');

async function testPath() {
    try {
        // Write a unique test record
        const db = await lancedb.connect(testDbPath);
        const table = await db.openTable('feature_vectors');
        
        const testId = `PATH_TEST_${Date.now()}`;
        const testRecord = {
            id: testId,
            timestamp: Date.now(),
            entrySignalId: testId,
            sessionId: 'path-test',
            inst: 'TEST',
            type: 'PATH_TEST',
            dir: 'L',
            qty: 1,
            dataType: 'TEST',
            features: new Float32Array(140),
            pnl: 999.99,
            pnlPts: 99.99,
            pnlPC: 999.99,
            bars: 1,
            exit: 'T',
            maxP: 1000,
            maxL: 0,
            good: true,
            sustainedMinutes: 60,
            durationBracket: '60min+',
            moveType: 'test',
            sustainabilityScore: 1.0,
            profitByBar: new Float32Array(50),
            profitByBarJson: '[]',
            trajectoryBars: 50
        };
        
        console.log(`\n   Writing test record with ID: ${testId}`);
        await table.add([testRecord]);
        
        // Immediately read it back
        console.log('   Reading back...');
        const found = await table.filter(`id = '${testId}'`).execute();
        console.log(`   Found: ${found.length} records`);
        
        if (found.length > 0) {
            console.log(`   ✅ Record found with PnL: ${found[0].pnl}`);
        } else {
            console.log('   ❌ Record NOT found!');
        }
        
        // Count all records
        const allRecords = await table.filter('id IS NOT NULL').execute();
        console.log(`   Total records in table: ${allRecords.length}`);
        
        // Show last modified time of database
        const dbStats = fs.statSync(path.join(testDbPath, 'feature_vectors.lance'));
        console.log(`   Database last modified: ${dbStats.mtime}`);
        
    } catch (error) {
        console.error('   Error:', error.message);
    }
}

testPath();