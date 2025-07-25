const axios = require('axios');

async function checkNewTrades() {
    console.log('🔍 CHECKING NEW TRADES - 166 TRADES PROCESSED');
    console.log('=' .repeat(80));
    
    try {
        // Get latest vectors from storage
        console.log('\n📥 Fetching latest vectors from storage...');
        const response = await axios.get('http://localhost:3015/api/vectors?limit=20', {
            timeout: 5000
        });
        
        const vectors = response.data.vectors;
        console.log(`✅ Retrieved ${vectors.length} recent vectors\n`);
        
        // Sort by timestamp to get the newest
        const sortedVectors = vectors.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        // Analyze the newest vectors
        console.log('📊 ANALYZING NEWEST VECTORS:');
        console.log('-'.repeat(80));
        
        const newest = sortedVectors[0];
        if (newest) {
            console.log(`\nNewest Vector:`);
            console.log(`  Timestamp: ${new Date(newest.timestamp).toISOString()}`);
            console.log(`  Entry Type: ${newest.entryType}`);
            console.log(`  Exit Reason: ${newest.exitReason}`);
            console.log(`  PnL: $${newest.pnl}`);
            console.log(`  MaxProfit: $${newest.maxProfit}`);
            console.log(`  MaxLoss: $${newest.maxLoss}`);
            
            // Check features
            if (newest.featuresJson) {
                const features = JSON.parse(newest.featuresJson);
                console.log(`  Feature Count: ${Object.keys(features).length}`);
                
                // Check key features
                console.log('\n  Key Feature Values:');
                console.log(`    close_price: ${features.close_price}`);
                console.log(`    ema3_value: ${features.ema3_value}`);
                console.log(`    vwap_value: ${features.vwap_value}`);
                console.log(`    rsi_14: ${features.rsi_14}`);
                console.log(`    bars_available: ${features.bars_available}`);
                console.log(`    data_source: ${features.data_source}`);
                console.log(`    consecutive_up_bars: ${features.consecutive_up_bars}`);
                console.log(`    consecutive_down_bars: ${features.consecutive_down_bars}`);
            }
        }
        
        // Check variation in newest vectors
        console.log('\n\n📈 VARIATION CHECK (Last 10 Vectors):');
        console.log('-'.repeat(80));
        
        const recentVectors = sortedVectors.slice(0, 10);
        const featureVariation = new Map();
        
        recentVectors.forEach(v => {
            if (v.featuresJson) {
                try {
                    const features = JSON.parse(v.featuresJson);
                    Object.entries(features).forEach(([key, value]) => {
                        if (!featureVariation.has(key)) {
                            featureVariation.set(key, new Set());
                        }
                        featureVariation.set(key, featureVariation.get(key).add(JSON.stringify(value)));
                    });
                } catch (e) {}
            }
        });
        
        // Show features with good variation
        const variationArray = Array.from(featureVariation.entries())
            .map(([name, values]) => ({ name, uniqueCount: values.size }))
            .sort((a, b) => b.uniqueCount - a.uniqueCount);
        
        console.log('\nFeatures with GOOD variation:');
        variationArray.filter(f => f.uniqueCount > 1).slice(0, 10).forEach(f => {
            console.log(`  ${f.name}: ${f.uniqueCount} unique values`);
        });
        
        console.log('\nFeatures still STATIC:');
        variationArray.filter(f => f.uniqueCount === 1).slice(0, 10).forEach(f => {
            console.log(`  ${f.name}: only 1 value`);
        });
        
        // Check metadata patterns
        console.log('\n\n📊 METADATA PATTERNS (Last 20):');
        console.log('-'.repeat(80));
        
        const metaStats = {
            entryTypes: new Map(),
            exitReasons: new Map(),
            pnlNonZero: 0,
            maxProfitNonZero: 0,
            maxLossNonZero: 0
        };
        
        sortedVectors.slice(0, 20).forEach(v => {
            metaStats.entryTypes.set(v.entryType, (metaStats.entryTypes.get(v.entryType) || 0) + 1);
            metaStats.exitReasons.set(v.exitReason, (metaStats.exitReasons.get(v.exitReason) || 0) + 1);
            if (v.pnl !== 0) metaStats.pnlNonZero++;
            if (v.maxProfit > 0) metaStats.maxProfitNonZero++;
            if (v.maxLoss > 0) metaStats.maxLossNonZero++;
        });
        
        console.log('Entry Types:', Object.fromEntries(metaStats.entryTypes));
        console.log('Exit Reasons:', Object.fromEntries(metaStats.exitReasons));
        console.log(`Non-zero PnL: ${metaStats.pnlNonZero}/20`);
        console.log(`Non-zero MaxProfit: ${metaStats.maxProfitNonZero}/20`);
        console.log(`Non-zero MaxLoss: ${metaStats.maxLossNonZero}/20`);
        
        // Summary
        console.log('\n\n✅ IMPROVEMENTS CHECK:');
        console.log('-'.repeat(80));
        
        const improvements = [];
        const issues = [];
        
        if (metaStats.pnlNonZero > 10) improvements.push('✅ PnL values are varying');
        else issues.push('❌ PnL still mostly zero');
        
        if (metaStats.maxProfitNonZero > 5) improvements.push('✅ MaxProfit tracking working');
        else issues.push('❌ MaxProfit still mostly zero');
        
        if (!newest.entryType?.includes('unknown')) improvements.push('✅ Entry types properly set');
        else issues.push('❌ Entry types still unknown');
        
        if (variationArray.filter(f => f.uniqueCount > 1).length > 50) improvements.push('✅ Most features now varying');
        else issues.push('❌ Many features still static');
        
        console.log('Improvements:');
        improvements.forEach(i => console.log(`  ${i}`));
        
        console.log('\nRemaining Issues:');
        issues.forEach(i => console.log(`  ${i}`));
        
    } catch (error) {
        console.error('❌ Error checking new trades:', error.message);
        console.log('\nMake sure storage service is running on port 3015');
    }
}

checkNewTrades();