#!/usr/bin/env node

/**
 * Test script to verify storage agent is receiving and storing vectors
 */

const axios = require('axios');

async function testStorage() {
    console.log('🧪 Testing Storage Agent...\n');
    
    const storageUrl = 'http://localhost:3015';
    
    // Test vector data
    const testVector = {
        entrySignalId: `TEST_${Date.now()}`,
        instrument: 'MGC',
        timestamp: Date.now(),
        direction: 'long',
        entryType: 'TEST_PATTERN',
        features: {
            rsi: 65.5,
            macd: 0.25,
            volume: 1250,
            price_change: 0.15,
            momentum: 0.75,
            volatility: 0.35,
            trend_strength: 0.85,
            support_distance: 2.5,
            resistance_distance: 5.0,
            volume_ratio: 1.25
        },
        outcome: {
            pnl: 125.50,
            pnlPoints: 2.5,
            holdingBars: 15,
            exitReason: 'TARGET_HIT',
            maxProfit: 150.0,
            maxLoss: -25.0,
            wasGoodExit: true,
            profitByBar: {
                "0": 0,
                "1": 10,
                "2": 25,
                "3": 50,
                "4": 75,
                "5": 100,
                "6": 125,
                "7": 125.5
            }
        },
        riskUsed: {
            stopLoss: 50,
            takeProfit: 150,
            virtualStop: 75
        }
    };
    
    try {
        // First, check if storage agent is running
        console.log('1️⃣ Checking storage agent health...');
        const healthResponse = await axios.get(`${storageUrl}/health`);
        console.log('✅ Storage agent is healthy:', healthResponse.data);
        console.log('');
        
        // Send test vector
        console.log('2️⃣ Sending test vector...');
        console.log('   Entry Signal ID:', testVector.entrySignalId);
        console.log('   Features:', Object.keys(testVector.features).length);
        console.log('   PnL:', testVector.outcome.pnl);
        console.log('   Profit trajectory bars:', Object.keys(testVector.outcome.profitByBar).length);
        console.log('');
        
        const storeResponse = await axios.post(`${storageUrl}/api/store-vector`, testVector);
        
        console.log('3️⃣ Storage response:');
        console.log(JSON.stringify(storeResponse.data, null, 2));
        console.log('');
        
        if (storeResponse.data.success) {
            if (storeResponse.data.stored === false) {
                console.log('⚠️  Vector was filtered out by trade classifier');
                console.log('   Reason:', storeResponse.data.reason);
                console.log('   Classification:', storeResponse.data.classification);
                console.log('\n💡 TIP: Run storage agent with FORCE_STORE_ALL=true to bypass filtering');
            } else {
                console.log('✅ Vector stored successfully!');
                console.log('   Vector ID:', storeResponse.data.vectorId);
                
                // Verify by fetching stats
                console.log('\n4️⃣ Verifying storage...');
                const statsResponse = await axios.get(`${storageUrl}/api/stats`);
                console.log('   Total vectors in storage:', statsResponse.data.stats.totalVectors);
            }
        } else {
            console.log('❌ Storage failed');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
        console.log('\n🔍 Troubleshooting tips:');
        console.log('   1. Make sure storage agent is running on port 3015');
        console.log('   2. Check the storage agent console for error messages');
        console.log('   3. Try running with FORCE_STORE_ALL=true to bypass filtering');
    }
}

// Run the test
testStorage(); 