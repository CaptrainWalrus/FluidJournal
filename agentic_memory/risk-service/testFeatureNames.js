/**
 * Test script to check available feature names and validate pruned ranges combinations
 */

const PrunedRangesEngine = require('./prunedRangesEngine');

// Create engine to see what feature combinations it's looking for
const engine = new PrunedRangesEngine();

console.log('🔍 PRUNED RANGES FEATURE VALIDATION');
console.log('='.repeat(50));

console.log('\n📋 CURRENT FEATURE COMBINATIONS:');
engine.featureCombinations.forEach((combo, i) => {
    console.log(`${i + 1}. [${combo.join(', ')}]`);
});

console.log('\n🎯 CURRENT OPTIMAL COMBINATION:');
console.log(`[${engine.currentOptimalCombo.join(', ')}]`);

console.log('\n📝 EXPECTED FEATURES FROM NINJTRADER:');
const expectedFeatures = [
    // From market context
    'close_price', 'open_price', 'high_price', 'low_price',
    'price_change_1', 'price_change_5', 'price_change_10',
    'volatility_20', 'hour_of_day', 'minute_of_hour', 'day_of_week',
    
    // From technical indicators
    'ema_9', 'ema_21', 'ema_50', 'ema_9_21_diff', 'ema_21_50_diff',
    'price_to_ema9', 'price_to_ema21', 'rsi_14', 'rsi_oversold', 'rsi_overbought',
    'bb_upper', 'bb_middle', 'bb_lower', 'bb_width', 'price_to_bb_upper', 'price_to_bb_lower',
    'atr_14', 'atr_percentage', 'macd', 'macd_signal', 'macd_histogram',
    
    // From market microstructure
    'spread', 'spread_percentage', 'body_size', 'body_ratio',
    'upper_wick', 'lower_wick', 'upper_wick_ratio', 'lower_wick_ratio', 'wick_imbalance',
    'close_to_high', 'close_to_low', 'high_low_ratio',
    
    // From volume analysis
    'volume', 'volume_delta', 'volume_sma_5', 'volume_sma_10', 'volume_sma_20',
    'volume_ratio_5', 'volume_ratio_10', 'volume_spike_ratio', 'volume_trend_5',
    
    // From pattern recognition
    'is_bullish_candle', 'is_bearish_candle', 'is_doji', 'momentum_5', 'momentum_5_normalized',
    'momentum_10', 'momentum_10_normalized', 'higher_high', 'lower_low', 'inside_bar',
    'distance_to_high_20', 'distance_to_low_20', 'position_in_range_20',
    
    // From trajectory features
    'pattern_v_recovery', 'pattern_steady_climb', 'pattern_failed_breakout',
    'pattern_whipsaw', 'pattern_grinder', 'traj_max_drawdown_norm',
    'traj_recovery_speed_norm', 'traj_trend_strength_norm'
];

console.log(`Total expected features: ${expectedFeatures.length}`);
expectedFeatures.forEach((feature, i) => {
    if (i % 4 === 0) console.log(''); // New line every 4 features
    process.stdout.write(`  ${feature.padEnd(25)}`);
});

console.log('\n\n✅ FEATURE VALIDATION:');
const allUsedFeatures = new Set();
engine.featureCombinations.forEach(combo => {
    combo.forEach(feature => allUsedFeatures.add(feature));
});

const validFeatures = [];
const invalidFeatures = [];

allUsedFeatures.forEach(feature => {
    if (expectedFeatures.includes(feature)) {
        validFeatures.push(feature);
    } else {
        invalidFeatures.push(feature);
    }
});

console.log(`\n✅ Valid features (${validFeatures.length}):`);
validFeatures.forEach(f => console.log(`  ✓ ${f}`));

if (invalidFeatures.length > 0) {
    console.log(`\n❌ Invalid features (${invalidFeatures.length}):`);
    invalidFeatures.forEach(f => console.log(`  ✗ ${f}`));
    
    console.log('\n🔧 SUGGESTED FIXES:');
    invalidFeatures.forEach(invalid => {
        const suggestions = expectedFeatures.filter(expected => 
            expected.includes(invalid.split('_')[0]) || invalid.includes(expected.split('_')[0])
        );
        if (suggestions.length > 0) {
            console.log(`  ${invalid} → ${suggestions[0]} (suggested)`);
        }
    });
} else {
    console.log('\n🎉 All features are valid!');
}

console.log('\n📊 FEATURE USAGE STATISTICS:');
const featureUsage = {};
engine.featureCombinations.forEach(combo => {
    combo.forEach(feature => {
        featureUsage[feature] = (featureUsage[feature] || 0) + 1;
    });
});

Object.entries(featureUsage)
    .sort(([,a], [,b]) => b - a)
    .forEach(([feature, count]) => {
        console.log(`  ${feature.padEnd(25)} used in ${count} combinations`);
    });

console.log('\n🔍 ANALYSIS COMPLETE!');
console.log('='.repeat(50));