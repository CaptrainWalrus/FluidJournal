const fs = require('fs');
const path = require('path');

console.log('🔍 CHECKING RECENT TRADING ACTIVITY - 166 TRADES');
console.log('=' .repeat(80));

// Check storage agent logs
const storageLogPath = path.join(__dirname, 'storage-agent/logs/storage-agent.log');

try {
    const content = fs.readFileSync(storageLogPath, 'utf8');
    const lines = content.split('\n');
    
    // Get last 500 lines
    const recentLines = lines.slice(-500);
    
    // Analysis
    const stats = {
        totalStores: 0,
        uniqueSignalIds: new Set(),
        timestamps: new Set(),
        featureCounts: new Set(),
        instruments: new Set(),
        recentStores: []
    };
    
    recentLines.forEach(line => {
        if (line.includes('Vector stored successfully')) {
            stats.totalStores++;
            
            // Extract signal ID
            const signalMatch = line.match(/"entrySignalId":"([^"]+)"/);
            if (signalMatch) stats.uniqueSignalIds.add(signalMatch[1]);
            
            // Extract feature count
            const featureMatch = line.match(/"featureCount":(\d+)/);
            if (featureMatch) stats.featureCounts.add(parseInt(featureMatch[1]));
            
            // Extract instrument
            const instrumentMatch = line.match(/"instrument":"([^"]+)"/);
            if (instrumentMatch) stats.instruments.add(instrumentMatch[1]);
            
            // Extract timestamp
            const timestampMatch = line.match(/"timestamp":"([^"]+)"/);
            if (timestampMatch) stats.timestamps.add(timestampMatch[1]);
            
            // Keep last 10 stores
            if (stats.recentStores.length < 10) {
                stats.recentStores.push({
                    signalId: signalMatch?.[1],
                    featureCount: featureMatch?.[1],
                    timestamp: timestampMatch?.[1]
                });
            }
        }
    });
    
    console.log('\n📊 RECENT STORAGE ACTIVITY:');
    console.log('-'.repeat(80));
    console.log(`Total vectors stored (recent): ${stats.totalStores}`);
    console.log(`Unique signal IDs: ${stats.uniqueSignalIds.size}`);
    console.log(`Feature counts seen: ${Array.from(stats.featureCounts).join(', ')}`);
    console.log(`Instruments: ${Array.from(stats.instruments).join(', ')}`);
    
    // Check time span
    if (stats.timestamps.size > 0) {
        const times = Array.from(stats.timestamps).map(t => new Date(t).getTime());
        const minTime = new Date(Math.min(...times));
        const maxTime = new Date(Math.max(...times));
        const spanMinutes = (maxTime - minTime) / (1000 * 60);
        
        console.log(`\nTime span: ${spanMinutes.toFixed(1)} minutes`);
        console.log(`First: ${minTime.toISOString()}`);
        console.log(`Last: ${maxTime.toISOString()}`);
    }
    
    console.log('\n📝 RECENT STORES:');
    stats.recentStores.forEach((store, idx) => {
        console.log(`${idx + 1}. ${store.signalId} - ${store.featureCount} features - ${store.timestamp}`);
    });
    
    // Look for specific patterns
    console.log('\n\n🔍 PATTERN ANALYSIS:');
    console.log('-'.repeat(80));
    
    // Check for duplicate stores (same signal ID stored multiple times)
    const signalIdCounts = {};
    stats.uniqueSignalIds.forEach(id => {
        const count = recentLines.filter(line => line.includes(`"entrySignalId":"${id}"`)).length;
        if (count > 1) {
            signalIdCounts[id] = count;
        }
    });
    
    if (Object.keys(signalIdCounts).length > 0) {
        console.log('\n⚠️  DUPLICATE STORES DETECTED:');
        Object.entries(signalIdCounts).slice(0, 5).forEach(([id, count]) => {
            console.log(`  ${id}: stored ${count} times`);
        });
        console.log('\nThis suggests positions are being stored multiple times!');
    }
    
    // Check feature count consistency
    if (stats.featureCounts.size === 1) {
        console.log(`\n✅ Feature count is consistent: ${Array.from(stats.featureCounts)[0]} features per vector`);
    } else {
        console.log(`\n⚠️  Feature count varies: ${Array.from(stats.featureCounts).join(', ')}`);
    }
    
    // Estimate actual unique trades
    const estimatedTrades = stats.uniqueSignalIds.size;
    const duplicateRate = stats.totalStores / estimatedTrades;
    
    console.log('\n📈 TRADE STATISTICS:');
    console.log(`Estimated unique trades: ${estimatedTrades}`);
    console.log(`Average stores per trade: ${duplicateRate.toFixed(1)}`);
    
    if (duplicateRate > 1.5) {
        console.log('\n⚠️  HIGH DUPLICATION RATE!');
        console.log('Each trade is being stored multiple times.');
        console.log('This could explain why features appear static - same data stored repeatedly.');
    }
    
} catch (error) {
    console.error('Error reading storage logs:', error.message);
}