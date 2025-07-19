/**
 * Test Risk Service with ME features (no NT features)
 */

const http = require('http');

// Simulate NT signal approval request (NO FEATURES)
const testSignal = {
    instrument: "MGC",
    direction: "long",
    entry_price: 3350.5,
    timestamp: new Date().toISOString()
    // NO FEATURES - ME will provide them
};

function testRiskApproval() {
    console.log('🧪 Testing Risk Service with ME Features\n');
    console.log('📤 Sending signal approval request (NO features):');
    console.log(JSON.stringify(testSignal, null, 2));
    console.log('\n🔄 Risk Service should:\n');
    console.log('   1. Receive signal without features');
    console.log('   2. Fetch bars from MI service');
    console.log('   3. Generate features from bars');
    console.log('   4. Use features for pattern matching');
    console.log('   5. Return approval decision\n');
    
    const postData = JSON.stringify(testSignal);
    
    const options = {
        hostname: 'localhost',
        port: 3017,
        path: '/api/approve-signal',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('\n📥 Response from Risk Service:');
            const response = JSON.parse(data);
            console.log(JSON.stringify(response, null, 2));
            
            if (response.method === 'agentic_memory') {
                console.log('\n✅ SUCCESS: Using pattern matching!');
                console.log(`   Patterns used: ${response.patternsUsed}`);
            } else if (response.method === 'rule_based') {
                console.log('\n⚠️  Using rule-based fallback');
                console.log(`   Reason: ${response.reasoning}`);
            } else {
                console.log('\n❌ ERROR: ' + response.reasoning);
            }
        });
    });

    req.on('error', (error) => {
        console.error('\n❌ Request failed:', error.message);
        console.log('\n💡 Make sure:');
        console.log('   1. Risk Service is running (port 3017)');
        console.log('   2. Storage Agent is running (port 3015)');
        console.log('   3. MI Service is running (port 3002)');
        console.log('   4. MI has bar data for MGC');
    });

    req.write(postData);
    req.end();
}

// Run test
testRiskApproval();