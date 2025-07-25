const axios = require('axios');

async function testManualStore() {
    console.log('🧪 Manual Store Test Starting...\n');
    
    const baseUrl = 'http://localhost:3015';
    
    // First check current stats
    try {
        const statsResponse = await axios.get(`${baseUrl}/api/stats`);
        console.log('📊 Current stats:', {
            totalVectors: statsResponse.data.stats.totalVectors,
            instruments: Object.keys(statsResponse.data.stats.instrumentCounts || {})
        });
    } catch (error) {
        console.error('❌ Could not get stats:', error.message);
    }
    
    // Create test records
    const testRecords = [];
    for (let i = 1; i <= 5; i++) {
        const record = {
            entrySignalId: `TEST_${Date.now()}_${i}`,
            instrument: 'MNQ SEP25',
            timestamp: Date.now() - (i * 60000), // Different timestamps
            direction: i % 2 === 0 ? 'long' : 'short',
            entryType: 'TEST_MANUAL',
            features: {},
            outcome: {
                pnl: Math.random() * 200 - 100,
                pnlPoints: Math.random() * 20 - 10,
                holdingBars: Math.floor(Math.random() * 100),
                exitReason: 'TEST',
                maxProfit: Math.random() * 100,
                maxLoss: Math.random() * -50,
                wasGoodExit: Math.random() > 0.5,
                profitByBar: { "0": 0, "1": 5, "2": 10, "3": -5 }
            }
        };
        
        // Add 120 dummy features
        for (let j = 1; j <= 120; j++) {
            record.features[`feature_${j}`] = Math.random();
        }
        
        testRecords.push(record);
    }
    
    // Store each record
    console.log('\n📝 Storing test records...\n');
    
    for (const record of testRecords) {
        try {
            console.log(`\n➡️  Storing ${record.entrySignalId}...`);
            
            const response = await axios.post(`${baseUrl}/api/store-vector`, record, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });
            
            console.log(`✅ Response:`, {
                success: response.data.success,
                vectorId: response.data.vectorId,
                stored: response.data.stored,
                classification: response.data.classification?.type
            });
            
            // Wait a bit between stores
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed to store ${record.entrySignalId}:`, error.response?.data || error.message);
        }
    }
    
    // Check final stats
    console.log('\n\n📊 Checking final stats...\n');
    
    try {
        const finalStats = await axios.get(`${baseUrl}/api/stats`);
        console.log('Final stats:', {
            totalVectors: finalStats.data.stats.totalVectors,
            instruments: finalStats.data.stats.instrumentCounts || {}
        });
        
        // Get actual vectors
        const vectors = await axios.get(`${baseUrl}/api/vectors?limit=100`);
        console.log(`\nActual vectors returned: ${vectors.data.count}`);
        console.log('Vector IDs:', vectors.data.vectors.map(v => v.id).slice(0, 10));
        
    } catch (error) {
        console.error('❌ Could not get final stats:', error.message);
    }
    
    // Direct database check
    console.log('\n\n🔍 Direct database check...\n');
    
    const vectordb = require('vectordb');
    try {
        const db = await vectordb.connect('./data/vectors_fresh');
        const table = await db.openTable('feature_vectors');
        const directCount = await table.filter('id IS NOT NULL').execute();
        console.log(`Direct database query found: ${directCount.length} records`);
        
        // Show last 5 records
        const sorted = directCount.sort((a, b) => b.timestamp - a.timestamp);
        console.log('\nLast 5 records:');
        sorted.slice(0, 5).forEach(r => {
            console.log(`  ${r.id} - ${r.inst || r.instrument} - ${new Date(r.timestamp).toISOString()}`);
        });
        
    } catch (error) {
        console.error('❌ Direct database check failed:', error.message);
    }
}

// Run the test
testManualStore().catch(console.error);