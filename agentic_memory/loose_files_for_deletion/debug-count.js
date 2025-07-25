const vectordb = require('vectordb');

async function debugCount() {
    console.log('🔍 DEBUG: Checking vector counts in database...\n');
    
    const dbPath = './data/vectors_fresh';
    console.log(`Database path: ${dbPath}`);
    
    try {
        const db = await vectordb.connect(dbPath);
        const table = await db.openTable('feature_vectors');
        
        // Try different query methods
        console.log('\n1. Using filter query:');
        const filtered = await table.filter('id IS NOT NULL').execute();
        console.log(`   Count: ${filtered.length}`);
        
        console.log('\n2. Using search query:');
        const searched = await table.search().execute();
        console.log(`   Count: ${searched.length}`);
        
        console.log('\n3. Raw table scan (no limit):');
        const allRecords = await table.filter('id IS NOT NULL').execute();
        console.log(`   Count: ${allRecords.length}`);
        
        console.log('\n4. Check specific instruments:');
        const instruments = {};
        allRecords.forEach(r => {
            const inst = r.inst || r.instrument || 'unknown';
            instruments[inst] = (instruments[inst] || 0) + 1;
        });
        console.log('   Instruments:', instruments);
        
        console.log('\n5. Latest records:');
        const sorted = allRecords.sort((a, b) => b.timestamp - a.timestamp);
        sorted.slice(0, 5).forEach(r => {
            console.log(`   ${r.id} - ${new Date(r.timestamp).toISOString()}`);
        });
        
        console.log('\n6. Database file stats:');
        const fs = require('fs');
        const versionFiles = fs.readdirSync(`${dbPath}/feature_vectors.lance/_versions`);
        console.log(`   Version files: ${versionFiles.length}`);
        console.log(`   Latest version: ${versionFiles[versionFiles.length - 1]}`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

debugCount();