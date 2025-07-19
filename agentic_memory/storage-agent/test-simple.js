#!/usr/bin/env node

const axios = require('axios');

async function testMinimalStorage() {
    console.log('🧪 Testing Minimal Storage...\n');
    
    const storageUrl = 'http://localhost:3015';
    
    // Minimal test vector
    const testVector = {
        entrySignalId: `TEST_${Date.now()}`,
        instrument: 'MGC',
        timestamp: Date.now(),
        features: {
            test: 1.0
        },
        outcome: {
            pnl: 100,
            exitReason: 'TEST'
        }
    };
    
    console.log('📤 Sending minimal test vector:', JSON.stringify(testVector, null, 2));
    
    try {
        const response = await axios.post(`${storageUrl}/api/store-vector`, testVector, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('\n📥 Response status:', response.status);
        console.log('📥 Response data:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('\n❌ Error details:');
        if (error.response) {
            // The request was made and the server responded with a status code
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
            console.error('   Headers:', error.response.headers);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('   No response received');
            console.error('   Request details:', error.request._header);
        } else {
            // Something happened in setting up the request
            console.error('   Error:', error.message);
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n🔍 Connection refused. Make sure storage agent is running on port 3015');
        }
    }
}

testMinimalStorage(); 