const lancedb = require('vectordb');
const fs = require('fs').promises;
const path = require('path');

async function testFreshDatabase() {
    console.log('🧪 Testing with completely fresh database\n');
    
    const testDbPath = './data/test_limit_check';
    
    try {
        // Remove test database if it exists
        try {
            await fs.rm(testDbPath, { recursive: true, force: true });
            console.log('✅ Cleaned up old test database\n');
        } catch (e) {
            // Ignore if doesn't exist
        }
        
        // Create fresh database
        console.log('1. Creating fresh database...');
        await fs.mkdir(testDbPath, { recursive: true });
        const db = await lancedb.connect(testDbPath);
        console.log('✅ Connected to fresh database\n');
        
        // Create table with minimal schema
        console.log('2. Creating table...');
        const sampleData = [{
            id: 'init',
            value: 0
        }];
        
        const table = await db.createTable('test_table', sampleData);
        await table.delete('id = "init"');
        console.log('✅ Table created\n');
        
        // Add records one by one and check count
        console.log('3. Adding records one by one:\n');
        
        for (let i = 1; i <= 15; i++) {
            const record = {
                id: `record_${i}`,
                value: i
            };
            
            await table.add([record]);
            
            // Count after each add
            const count = await table.filter('id IS NOT NULL').execute();
            console.log(`   Added record ${i} - Total count: ${count.length}`);
            
            // If count stopped at 10, break
            if (i > 10 && count.length === 10) {
                console.log('\n❌ CONFIRMED: Database is limited to 10 records!');
                break;
            }
        }
        
        // Final verification
        console.log('\n4. Final verification:');
        const allRecords = await table.filter('id IS NOT NULL').execute();
        console.log(`   Total records in database: ${allRecords.length}`);
        console.log('   Record IDs:', allRecords.map(r => r.id).join(', '));
        
        // Check if this is a LanceDB limitation
        console.log('\n5. Checking LanceDB version and configuration:');
        console.log('   LanceDB package: vectordb@0.4.20');
        
        // Clean up test database
        await fs.rm(testDbPath, { recursive: true, force: true });
        console.log('\n✅ Test database cleaned up');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testFreshDatabase().catch(console.error);