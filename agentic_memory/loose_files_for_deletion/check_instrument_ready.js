#!/usr/bin/env node

const axios = require('axios');

async function checkInstrumentReady(instrument) {
    console.log(`\n🔍 Checking if ${instrument} is ready for range-based trading...\n`);
    
    try {
        // 1. Check stored vectors
        console.log('📊 Checking stored data...');
        const vectorsResponse = await axios.get(`http://localhost:3015/api/vectors?instrument=${instrument}&limit=1000`);
        const vectors = vectorsResponse.data.vectors || vectorsResponse.data || [];
        
        const profitable = vectors.filter(v => v.pnl > 0);
        const unprofitable = vectors.filter(v => v.pnl <= 0);
        
        console.log(`✓ Total ${instrument} trades: ${vectors.length}`);
        console.log(`  - Profitable: ${profitable.length}`);
        console.log(`  - Unprofitable: ${unprofitable.length}`);
        
        if (vectors.length < 30) {
            console.log(`\n⚠️  WARNING: Only ${vectors.length} trades collected. Recommend 30+ for reliable ranges.`);
        }
        
        // 2. Check graduation tables
        console.log('\n📈 Checking graduation tables...');
        const gradResponse = await axios.get('http://localhost:3017/api/graduations');
        const graduations = gradResponse.data.graduations || {};
        
        const longKey = `${instrument}_long`;
        const shortKey = `${instrument}_short`;
        
        if (graduations[longKey]) {
            console.log(`✓ ${longKey} graduation ready:`);
            console.log(`  - Patterns: ${graduations[longKey].vectorCount}`);
            console.log(`  - Features: ${graduations[longKey].features}`);
            console.log(`  - Win rate: ${(graduations[longKey].winRate * 100).toFixed(1)}%`);
        } else {
            console.log(`✗ ${longKey} graduation not found`);
        }
        
        if (graduations[shortKey]) {
            console.log(`✓ ${shortKey} graduation ready:`);
            console.log(`  - Patterns: ${graduations[shortKey].vectorCount}`);
            console.log(`  - Features: ${graduations[shortKey].features}`);
            console.log(`  - Win rate: ${(graduations[shortKey].winRate * 100).toFixed(1)}%`);
        } else {
            console.log(`✗ ${shortKey} graduation not found`);
        }
        
        // 3. Test a sample prediction
        console.log('\n🧪 Testing sample risk evaluation...');
        const testFeatures = {
            atr_percentage: 0.025,
            atr_14: 0.8,
            volume_spike_ratio: 1.2,
            body_ratio: 0.5,
            rsi_14: 50,
            momentum_5: 0.001
        };
        
        try {
            const riskResponse = await axios.post('http://localhost:3017/api/evaluate-risk', {
                instrument: instrument,
                direction: 'long',
                features: testFeatures,
                timestamp: new Date().toISOString()
            });
            
            const result = riskResponse.data;
            console.log(`✓ Risk evaluation successful:`);
            console.log(`  - Method: ${result.method}`);
            console.log(`  - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
            console.log(`  - Decision: ${result.approved ? 'APPROVED' : 'REJECTED'}`);
            
            if (result.method === 'rule_based') {
                console.log(`\n⚠️  Using rule-based method - need more data for range-based`);
            }
        } catch (error) {
            console.log(`✗ Risk evaluation failed: ${error.message}`);
        }
        
        // 4. Summary
        console.log('\n📋 READINESS SUMMARY:');
        console.log('─'.repeat(50));
        
        const isReady = vectors.length >= 30 && 
                       profitable.length >= 10 && 
                       unprofitable.length >= 10 &&
                       (graduations[longKey] || graduations[shortKey]);
        
        if (isReady) {
            console.log(`✅ ${instrument} is READY for range-based trading!`);
            console.log(`\nNext steps:`);
            console.log(`1. Start trading - system will use learned ranges`);
            console.log(`2. Monitor confidence scores in logs`);
            console.log(`3. Ranges update every 30 minutes automatically`);
        } else {
            console.log(`⏳ ${instrument} needs more data for optimal range-based trading`);
            console.log(`\nRecommendations:`);
            if (vectors.length < 30) {
                console.log(`- Collect ${30 - vectors.length} more trades`);
            }
            if (profitable.length < 10) {
                console.log(`- Need ${10 - profitable.length} more profitable trades`);
            }
            if (unprofitable.length < 10) {
                console.log(`- Need ${10 - unprofitable.length} more losing trades (for learning)`);
            }
            console.log(`\nSystem will use rule-based decisions until enough data collected.`);
        }
        
    } catch (error) {
        console.error(`\n❌ Error checking instrument: ${error.message}`);
        console.log('\nMake sure all services are running:');
        console.log('- Storage Agent (port 3015)');
        console.log('- Risk Service (port 3017)');
    }
}

// Get instrument from command line or use default
const instrument = process.argv[2] || 'YM';

checkInstrumentReady(instrument).catch(console.error);