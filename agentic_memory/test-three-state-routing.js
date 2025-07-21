#!/usr/bin/env node

/**
 * Test script for three-state data routing:
 * 1. TRAINING data -> LanceDB 
 * 2. RECENT data -> LanceDB 
 * 3. OUT_OF_SAMPLE data -> JSON files
 */

const fetch = require('node-fetch');

const STORAGE_BASE_URL = 'http://localhost:3015';

async function testThreeStateRouting() {
    console.log('🧪 Testing Three-State Data Routing...\n');

    try {
        // Test 1: Store TRAINING data
        console.log('1️⃣ Testing TRAINING data storage...');
        const trainingData = {
            entrySignalId: 'TEST_TRAINING_001',
            instrument: 'MGC',
            direction: 'long',
            entryType: 'ORDER_FLOW_IMBALANCE',
            timestamp: new Date().toISOString(),
            dataType: 'TRAINING',
            features: {
                atr_percentage: 0.025,
                volume_delta: 150,
                rsi_14: 45
            },
            outcome: {
                pnl: 125.50,
                pnlPerContract: 125.50,
                exitReason: 'take_profit'
            }
        };

        const trainingResponse = await fetch(`${STORAGE_BASE_URL}/api/store-vector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trainingData)
        });

        if (trainingResponse.ok) {
            console.log('✅ TRAINING data stored successfully');
        } else {
            console.log('❌ TRAINING data storage failed:', await trainingResponse.text());
        }

        // Test 2: Store RECENT data
        console.log('\n2️⃣ Testing RECENT data storage...');
        const recentData = {
            entrySignalId: 'TEST_RECENT_001',
            instrument: 'MGC',
            direction: 'long',
            entryType: 'ORDER_FLOW_IMBALANCE',
            timestamp: new Date().toISOString(),
            dataType: 'RECENT',
            features: {
                atr_percentage: 0.030,
                volume_delta: 200,
                rsi_14: 52
            },
            outcome: {
                pnl: 75.25,
                pnlPerContract: 75.25,
                exitReason: 'take_profit'
            }
        };

        const recentResponse = await fetch(`${STORAGE_BASE_URL}/api/store-vector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recentData)
        });

        if (recentResponse.ok) {
            console.log('✅ RECENT data stored successfully');
        } else {
            console.log('❌ RECENT data storage failed:', await recentResponse.text());
        }

        // Test 3: Store OUT_OF_SAMPLE data
        console.log('\n3️⃣ Testing OUT_OF_SAMPLE data storage...');
        const outOfSampleData = {
            instrument: 'MGC',
            entryType: 'ORDER_FLOW_IMBALANCE',
            pnl: 45.75,
            pnlPerContract: 45.75,
            timestamp: new Date().toISOString(),
            exitReason: 'take_profit'
        };

        const outOfSampleResponse = await fetch(`${STORAGE_BASE_URL}/api/live-performance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(outOfSampleData)
        });

        if (outOfSampleResponse.ok) {
            console.log('✅ OUT_OF_SAMPLE data stored successfully');
        } else {
            console.log('❌ OUT_OF_SAMPLE data storage failed:', await outOfSampleResponse.text());
        }

        // Test 4: Query TRAINING data only
        console.log('\n4️⃣ Testing TRAINING data query...');
        const trainingQuery = await fetch(`${STORAGE_BASE_URL}/api/vectors?dataType=TRAINING&limit=5`);
        if (trainingQuery.ok) {
            const trainingResult = await trainingQuery.json();
            console.log(`✅ Retrieved ${trainingResult.vectors.length} TRAINING vectors`);
        } else {
            console.log('❌ TRAINING query failed');
        }

        // Test 5: Query RECENT data only
        console.log('\n5️⃣ Testing RECENT data query...');
        const recentQuery = await fetch(`${STORAGE_BASE_URL}/api/vectors?dataType=RECENT&limit=5`);
        if (recentQuery.ok) {
            const recentResult = await recentQuery.json();
            console.log(`✅ Retrieved ${recentResult.vectors.length} RECENT vectors`);
        } else {
            console.log('❌ RECENT query failed');
        }

        // Test 6: Query OUT_OF_SAMPLE data
        console.log('\n6️⃣ Testing OUT_OF_SAMPLE data query...');
        const outOfSampleQuery = await fetch(`${STORAGE_BASE_URL}/api/live-performance/stats`);
        if (outOfSampleQuery.ok) {
            const outOfSampleResult = await outOfSampleQuery.json();
            const statsCount = Object.keys(outOfSampleResult.stats).length;
            console.log(`✅ Retrieved ${statsCount} OUT_OF_SAMPLE stat groups`);
        } else {
            console.log('❌ OUT_OF_SAMPLE query failed');
        }

        console.log('\n🎯 Three-state routing test completed!');

    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    }
}

// Run the test
if (require.main === module) {
    testThreeStateRouting();
}

module.exports = testThreeStateRouting;