#!/usr/bin/env node

const axios = require('axios');

async function testGPPrediction() {
    console.log('🧪 Testing GP Service Prediction...\n');
    
    // Check if GP service is running
    try {
        const healthResponse = await axios.get('http://localhost:3020/health');
        console.log('✅ GP Service is running:', healthResponse.data);
    } catch (error) {
        console.log('❌ GP Service is not running! Please start it first.');
        console.log('   Run: cd gp-service && python server.py');
        return;
    }
    
    // Check model status
    try {
        const statusResponse = await axios.get('http://localhost:3020/api/models/status');
        console.log('\n📊 Model Status:');
        console.log(JSON.stringify(statusResponse.data, null, 2));
        
        if (!statusResponse.data.summary.ready) {
            console.log('\n❌ No trained models found! Train models using gp-menu.js first.');
            return;
        }
    } catch (error) {
        console.log('❌ Failed to check model status:', error.message);
        return;
    }
    
    // Test prediction with sample features
    const testFeatures = {
        atr_percentage: 0.0235,
        atr_14: 0.745,
        volume_delta: 125,
        volume_ratio: 1.15,
        bar_range: 2.5,
        position_in_range: 0.65,
        volume_imbalance: 0.25,
        close_vs_vwap: 0.0012,
        high_low_ratio: 1.0005,
        body_size: 1.8,
        upper_wick_ratio: 0.15,
        lower_wick_ratio: 0.20,
        rsi_14: 52.5,
        is_green_bar: 1,
        consecutive_bars: 2,
        price_momentum: 0.0008,
        volume_momentum: 1.05,
        inside_bar: 0,
        outside_bar: 0,
        pin_bar: 0,
        doji: 0,
        volume_spike: 0,
        price_spike: 0,
        trend_strength: 0.45,
        support_distance: 3.5,
        resistance_distance: 2.8,
        pivot_distance: 1.2,
        session_progress: 0.35,
        day_of_week: 3,
        hour_of_day: 14,
        volatility_state: 1,
        market_state: 1,
        trend_alignment: 1
    };
    
    console.log('\n🔮 Testing prediction for MGC long...');
    
    try {
        const predictionResponse = await axios.post('http://localhost:3020/api/predict', {
            instrument: 'MGC',
            direction: 'long',
            features: testFeatures
        });
        
        console.log('\n✅ Prediction successful!');
        console.log(JSON.stringify(predictionResponse.data, null, 2));
        
        if (predictionResponse.data.prediction) {
            const pred = predictionResponse.data.prediction;
            console.log('\n📈 Summary:');
            console.log(`   PnL Prediction: $${pred.pnl.mean.toFixed(2)} ± $${pred.pnl.std.toFixed(2)}`);
            console.log(`   Confidence: ${(pred.confidence * 100).toFixed(1)}%`);
            if (pred.risk) {
                console.log(`   Suggested SL: ${pred.risk.suggested_sl?.toFixed(1)} points`);
                console.log(`   Suggested TP: ${pred.risk.suggested_tp?.toFixed(1)} points`);
            }
        }
        
    } catch (error) {
        console.log('\n❌ Prediction failed!');
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Error:', error.response.data);
            
            if (error.response.data.error && error.response.data.error.includes("'trained'")) {
                console.log('\n💡 This is the model structure issue. The fix has been applied.');
                console.log('   Please restart the GP service for the fix to take effect:');
                console.log('   1. Stop GP service (Ctrl+C in its terminal)');
                console.log('   2. Start it again: cd gp-service && python server.py');
            }
        } else {
            console.log('   Error:', error.message);
        }
    }
}

// Run the test
testGPPrediction().catch(console.error);