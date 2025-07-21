/**
 * SAFE ANALYSIS ONLY - NO DELETION
 * Analyze trade timestamps to understand what we have
 */

const vectorStore = require('./src/vectorStore');

async function analyzeTradesOnly() {
    console.log('🔍 SAFE ANALYSIS - NO DELETION WILL OCCUR');
    console.log('=====================================\n');
    
    try {
        await vectorStore.initialize();
        
        const allVectors = await vectorStore.getVectors({ limit: 100000 });
        console.log(`📊 Total vectors in database: ${allVectors.length}\n`);
        
        // Analyze by year
        const yearAnalysis = {};
        const sampleTradesByYear = {};
        
        allVectors.forEach(vector => {
            const timestamp = new Date(vector.timestamp);
            const year = timestamp.getFullYear();
            
            if (!yearAnalysis[year]) {
                yearAnalysis[year] = { count: 0, instruments: new Set(), earliest: timestamp, latest: timestamp };
                sampleTradesByYear[year] = [];
            }
            
            yearAnalysis[year].count++;
            yearAnalysis[year].instruments.add(vector.instrument);
            
            if (timestamp < yearAnalysis[year].earliest) yearAnalysis[year].earliest = timestamp;
            if (timestamp > yearAnalysis[year].latest) yearAnalysis[year].latest = timestamp;
            
            // Collect sample trades
            if (sampleTradesByYear[year].length < 3) {
                sampleTradesByYear[year].push({
                    id: vector.id,
                    timestamp: timestamp.toISOString(),
                    instrument: vector.instrument,
                    direction: vector.direction,
                    pnl: vector.pnl || 0,
                    dataType: vector.dataType || 'undefined'
                });
            }
        });
        
        console.log('📅 TIMESTAMP ANALYSIS BY YEAR:');
        console.log('===============================');
        
        Object.keys(yearAnalysis).sort().forEach(year => {
            const data = yearAnalysis[year];
            console.log(`\n${year}:`);
            console.log(`  📈 Count: ${data.count} trades`);
            console.log(`  🏛️  Instruments: ${Array.from(data.instruments).join(', ')}`);
            console.log(`  📅 Date range: ${data.earliest.toISOString()} to ${data.latest.toISOString()}`);
            
            if (parseInt(year) >= 2025) {
                console.log(`  ⚠️  THIS IS 2025+ DATA (potentially out-of-sample)`);
            } else {
                console.log(`  ✅ Historical data (likely training/validation)`);
            }
            
            console.log(`  🔍 Sample trades:`);
            sampleTradesByYear[year].forEach(trade => {
                console.log(`    ${trade.timestamp} | ${trade.instrument} ${trade.direction} | $${trade.pnl} | ${trade.dataType}`);
            });
        });
        
        // Specific focus on 2025+ data
        const trades2025Plus = allVectors.filter(v => new Date(v.timestamp).getFullYear() >= 2025);
        
        console.log('\n🎯 2025+ DATA ANALYSIS:');
        console.log('========================');
        
        if (trades2025Plus.length === 0) {
            console.log('✅ No 2025+ trades found. All data appears to be historical.');
        } else {
            console.log(`⚠️  Found ${trades2025Plus.length} trades from 2025+`);
            
            // Check if these are clearly out-of-sample vs legitimate recent data
            const now = new Date();
            const currentYear = now.getFullYear();
            
            if (currentYear < 2025) {
                console.log(`🚨 ISSUE: Found ${trades2025Plus.length} trades from future years (2025+) but current year is ${currentYear}`);
                console.log(`   These are likely test/backtest data with incorrect server timestamps`);
            } else {
                console.log(`ℹ️  These might be legitimate recent trades (current year: ${currentYear})`);
            }
            
            // Show timestamp patterns
            const timestampPattern = trades2025Plus.slice(0, 10).map(t => ({
                timestamp: new Date(t.timestamp).toISOString(),
                instrument: t.instrument,
                hasBarTime: t.timestamp.toString().includes('T') && t.timestamp.toString().includes('Z')
            }));
            
            console.log('\n🔍 Sample 2025+ timestamps:');
            timestampPattern.forEach(p => {
                console.log(`  ${p.timestamp} | ${p.instrument} | Bar format: ${p.hasBarTime ? 'YES' : 'NO'}`);
            });
        }
        
        console.log('\n✅ ANALYSIS COMPLETE - NO DATA WAS MODIFIED');
        console.log('💡 Review the analysis above before deciding on any deletions');
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    } finally {
        await vectorStore.close();
    }
}

analyzeTradesOnly();