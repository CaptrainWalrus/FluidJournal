/**
 * Test storing full feature set from ME
 */

const vectorStore = require('./src/vectorStore');

// Simulate full features from ME's generateSignalFeatures()
const mockMEFeatures = {
    // Basic price features
    close_price: 3345.2,
    open_price: 3342.1,
    high_price: 3346.5,
    low_price: 3341.8,
    price_range_pct: 0.14,
    body_pct: 0.09,
    upper_wick_pct: 0.04,
    lower_wick_pct: 0.01,
    
    // EMA features
    ema9_value: 3344.5,
    ema21_value: 3343.2,
    ema9_distance_pct: 0.02,
    ema21_distance_pct: 0.06,
    ema9_vs_ema21_pct: 0.04,
    ema9_slope_pct: 0.01,
    ema21_slope_pct: 0.005,
    price_vs_ema9_position: 1,
    price_vs_ema21_position: 1,
    ema_cross_signal: 0,
    
    // Volume features
    volume: 1250,
    volume_ma20: 980,
    volume_vs_ma_pct: 27.5,
    volume_spike_ratio: 1.28,
    volume_change_pct: 15.2,
    
    // Volatility features
    atr_14: 4.5,
    atr_pct: 0.13,
    true_range_pct: 0.14,
    
    // Momentum features
    rsi_14: 58.5,
    rsi_divergence: 8.5,
    rsi_slope: 2.1,
    price_momentum_1min: 0.09,
    price_momentum_3min: 0.12,
    price_momentum_5min: 0.18,
    
    // Time features
    hour_of_day: 10,
    minute_of_hour: 30,
    day_of_week: 3,
    time_since_market_open_mins: 90,
    time_until_market_close_mins: 330,
    session_phase: 2,
    
    // Imbalance features
    price_pressure: 75.2,
    buying_pressure: 68.5,
    selling_pressure: 0,
    
    // Bollinger Band features
    bb_upper: 3348.2,
    bb_middle: 3344.0,
    bb_lower: 3339.8,
    bb_width: 0.25,
    bb_position: 0.65,
    
    // Candle features
    body_ratio: 0.64,
    upper_wick_ratio: 0.28,
    lower_wick_ratio: 0.08,
    range_expansion: 1.15,
    
    // Pattern features
    consecutive_up_bars: 3,
    consecutive_down_bars: 0,
    
    // Entry features
    entry_price: 3345.2,
    
    // Metadata
    bars_available: 200,
    captured_at: new Date().toISOString(),
    data_source: 'mi_buffer'
};

async function testFullFeatures() {
    console.log('🧪 Testing Full Feature Storage\n');
    
    try {
        // Initialize vector store
        await vectorStore.initialize();
        console.log('✅ Vector store initialized\n');
        
        // Create test vector data
        const testData = {
            entrySignalId: 'test_full_features_001',
            instrument: 'MGC',
            timestamp: Date.now(),
            entryType: 'ORDER_FLOW_IMBALANCE',
            direction: 'long',
            features: mockMEFeatures, // Send full feature object
            riskUsed: {
                stopLoss: 10,
                takeProfit: 15,
                virtualStop: 8
            },
            outcome: {
                pnl: 125.50,
                pnlPoints: 12.5,
                holdingBars: 5,
                exitReason: 'TP',
                maxProfit: 150,
                maxLoss: -25,
                wasGoodExit: true
            }
        };
        
        console.log(`📊 Sending ${Object.keys(mockMEFeatures).length} features to storage...\n`);
        
        // Store the vector
        const result = await vectorStore.storeVector(testData);
        
        if (result.success) {
            console.log('✅ Vector stored successfully!');
            console.log(`   Vector ID: ${result.vectorId}`);
            console.log(`   Duration: ${result.duration}ms\n`);
            
            // Retrieve and inspect
            const stored = await vectorStore.getVectors({ 
                entrySignalId: 'test_full_features_001',
                limit: 1 
            });
            
            if (stored.length > 0) {
                const record = stored[0];
                console.log('📋 Stored Record:');
                console.log(`   Features Vector Length: ${record.features.length}`);
                console.log(`   Has Features JSON: ${!!record.featuresJson}`);
                
                if (record.featuresJson) {
                    const storedFeatures = JSON.parse(record.featuresJson);
                    console.log(`   Total Features Stored: ${Object.keys(storedFeatures).length}`);
                    console.log(`   Sample Features:`, Object.keys(storedFeatures).slice(0, 5));
                    
                    // Verify all features were stored
                    const missingFeatures = Object.keys(mockMEFeatures).filter(
                        key => !(key in storedFeatures)
                    );
                    
                    if (missingFeatures.length === 0) {
                        console.log(`   ✅ All ${Object.keys(mockMEFeatures).length} features stored successfully!`);
                    } else {
                        console.log(`   ⚠️ Missing features:`, missingFeatures);
                    }
                }
            }
            
        } else {
            console.error('❌ Failed to store vector:', result.error);
        }
        
        await vectorStore.close();
        console.log('\n✅ Test complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack:', error.stack);
    }
}

// Run test
testFullFeatures();