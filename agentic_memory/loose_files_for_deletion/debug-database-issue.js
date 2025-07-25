const lancedb = require('vectordb');
const fs = require('fs');
const path = require('path');

async function debugDatabaseIssue() {
    console.log('🔍 Debugging Database Issue\n');
    
    // Check archived databases first
    console.log('1. Checking archived databases for comparison:\n');
    
    const dataDir = './data';
    const dirs = fs.readdirSync(dataDir).filter(d => d.includes('vectors'));
    
    for (const dir of dirs) {
        const dbPath = path.join(dataDir, dir);
        if (fs.statSync(dbPath).isDirectory()) {
            console.log(`   Checking ${dir}:`);
            try {
                const tablePath = path.join(dbPath, 'feature_vectors.lance');
                if (fs.existsSync(tablePath)) {
                    const versionPath = path.join(tablePath, '_versions');
                    if (fs.existsSync(versionPath)) {
                        const versions = fs.readdirSync(versionPath);
                        console.log(`     - Version files: ${versions.length}`);
                        
                        // Try to connect and count
                        try {
                            const db = await lancedb.connect(dbPath);
                            const table = await db.openTable('feature_vectors');
                            const records = await table.filter('id IS NOT NULL').execute();
                            console.log(`     - Records: ${records.length}`);
                        } catch (e) {
                            console.log(`     - Could not query: ${e.message}`);
                        }
                    }
                }
            } catch (e) {
                console.log(`     - Error: ${e.message}`);
            }
        }
    }
    
    // Focus on current database
    console.log('\n2. Analyzing current database (vectors_fresh):\n');
    
    const currentDbPath = './data/vectors_fresh';
    const db = await lancedb.connect(currentDbPath);
    const table = await db.openTable('feature_vectors');
    
    // Try different query approaches
    console.log('   Testing query methods:');
    
    // Direct native query
    console.log('\n   a) Using table._nativeTable if available:');
    if (table._nativeTable) {
        console.log('      Native table exists');
    }
    
    // Check if there's a default limit being applied
    console.log('\n   b) Checking for default limits:');
    const query1 = table.filter('id IS NOT NULL');
    console.log('      Query object:', Object.keys(query1));
    
    // Try raw execute
    console.log('\n   c) Raw execute without any filtering:');
    try {
        const rawSearch = await table.search().execute();
        console.log(`      Raw search returned: ${rawSearch.length} records`);
    } catch (e) {
        console.log(`      Error: ${e.message}`);
    }
    
    // Check table metadata
    console.log('\n3. Table metadata:');
    const schema = await table.schema;
    console.log(`   Fields: ${schema.fields.length}`);
    console.log(`   Field names:`, schema.fields.map(f => f.name).slice(0, 10).join(', '), '...');
    
    // Check if specific records exist by ID
    console.log('\n4. Checking specific record retrieval:');
    
    // First get all records we can see
    const visibleRecords = await table.filter('id IS NOT NULL').execute();
    console.log(`   Visible records: ${visibleRecords.length}`);
    
    if (visibleRecords.length > 0) {
        // Try to query a specific ID
        const testId = visibleRecords[0].id;
        console.log(`   Testing specific ID query: ${testId}`);
        const specificQuery = await table.filter(`id = '${testId}'`).execute();
        console.log(`   Found: ${specificQuery.length} records`);
    }
    
    // Check manifest files
    console.log('\n5. Checking manifest files:');
    const versionDir = path.join(currentDbPath, 'feature_vectors.lance', '_versions');
    const manifests = fs.readdirSync(versionDir).filter(f => f.endsWith('.manifest'));
    console.log(`   Total manifest files: ${manifests.length}`);
    
    // Get latest manifest
    if (manifests.length > 0) {
        const latestManifest = manifests.sort().pop();
        const manifestPath = path.join(versionDir, latestManifest);
        const stats = fs.statSync(manifestPath);
        console.log(`   Latest manifest: ${latestManifest}`);
        console.log(`   Size: ${stats.size} bytes`);
        console.log(`   Modified: ${stats.mtime}`);
    }
    
    // Try creating a new table in the same database
    console.log('\n6. Testing new table creation:');
    try {
        const testTableName = 'test_unlimited';
        const testData = [];
        for (let i = 0; i < 20; i++) {
            testData.push({ id: `test_${i}`, value: i });
        }
        
        const testTable = await db.createTable(testTableName, testData);
        const testCount = await testTable.filter('id IS NOT NULL').execute();
        console.log(`   Created table with ${testData.length} records`);
        console.log(`   Query returned: ${testCount.length} records`);
        
        // Clean up
        await db.dropTable(testTableName);
        console.log('   Test table dropped');
    } catch (e) {
        console.log(`   Error: ${e.message}`);
    }
}

debugDatabaseIssue().catch(console.error);