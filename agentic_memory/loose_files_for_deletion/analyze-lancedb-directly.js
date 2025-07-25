const lancedb = require('vectordb');
const path = require('path');

async function analyzeLanceDBDirectly() {
    console.log('🔍 DIRECT LANCEDB ANALYSIS');
    console.log('=' .repeat(80));
    
    try {
        // Open the database
        const dbPath = path.join(__dirname, 'storage-agent/data/vectors');
        console.log(`\n📂 Opening LanceDB at: ${dbPath}`);
        
        const db = await lancedb.connect(dbPath);
        console.log('✅ Connected to LanceDB');
        
        // Open the feature vectors table
        const table = await db.openTable('feature_vectors');
        console.log('✅ Opened feature_vectors table');
        
        // Get sample data
        console.log('\n📊 Fetching sample vectors...');
        const vectors = await table.search([]).limit(100).execute();
        console.log(`✅ Retrieved ${vectors.length} vectors`);
        
        // Analyze the data structure
        if (vectors.length > 0) {
            console.log('\n📋 VECTOR STRUCTURE:');
            console.log('-'.repeat(80));
            const firstVector = vectors[0];
            console.log('Fields:', Object.keys(firstVector));
            
            // Check for feature data
            if (firstVector.featuresJson) {
                try {
                    const features = JSON.parse(firstVector.featuresJson);
                    console.log(`\nFeature count: ${Object.keys(features).length}`);
                    console.log('Sample feature names:', Object.keys(features).slice(0, 10));
                } catch (e) {
                    console.log('Failed to parse featuresJson');
                }
            }
        }
        
        // Analyze metadata patterns
        console.log('\n\n📊 METADATA ANALYSIS:');
        console.log('-'.repeat(80));
        
        const analysis = {
            entryTypes: new Map(),
            exitReasons: new Map(),
            pnlValues: new Set(),
            maxProfits: new Set(),
            maxLosses: new Set(),
            timestamps: new Set()
        };
        
        vectors.forEach(v => {
            // Count entry types
            const entryType = v.entryType || 'unknown';
            analysis.entryTypes.set(entryType, (analysis.entryTypes.get(entryType) || 0) + 1);
            
            // Count exit reasons
            const exitReason = v.exitReason || 'UNKNOWN';
            analysis.exitReasons.set(exitReason, (analysis.exitReasons.get(exitReason) || 0) + 1);
            
            // Collect unique values
            analysis.pnlValues.add(v.pnl || 0);
            analysis.maxProfits.add(v.maxProfit || 0);
            analysis.maxLosses.add(v.maxLoss || 0);
            if (v.timestamp) analysis.timestamps.add(v.timestamp);
        });
        
        console.log('\nEntry Types:');
        analysis.entryTypes.forEach((count, type) => {
            console.log(`  ${type}: ${count} (${(count/vectors.length*100).toFixed(1)}%)`);
        });
        
        console.log('\nExit Reasons:');
        analysis.exitReasons.forEach((count, reason) => {
            console.log(`  ${reason}: ${count} (${(count/vectors.length*100).toFixed(1)}%)`);
        });
        
        console.log(`\nUnique PnL values: ${analysis.pnlValues.size}`);
        const pnlArray = Array.from(analysis.pnlValues).sort((a,b) => a-b);
        console.log(`PnL range: $${pnlArray[0]} to $${pnlArray[pnlArray.length-1]}`);
        
        console.log(`\nUnique MaxProfit values: ${analysis.maxProfits.size}`);
        console.log(`Unique MaxLoss values: ${analysis.maxLosses.size}`);
        
        // Feature variation analysis
        console.log('\n\n📈 FEATURE VARIATION ANALYSIS:');
        console.log('-'.repeat(80));
        
        const featureStats = new Map();
        let vectorsWithFeatures = 0;
        
        vectors.forEach(v => {
            if (v.featuresJson) {
                try {
                    const features = JSON.parse(v.featuresJson);
                    vectorsWithFeatures++;
                    
                    Object.entries(features).forEach(([fname, value]) => {
                        if (!featureStats.has(fname)) {
                            featureStats.set(fname, {
                                values: new Set(),
                                nullCount: 0,
                                zeroCount: 0,
                                samples: []
                            });
                        }
                        
                        const stats = featureStats.get(fname);
                        
                        if (value === null || value === undefined) {
                            stats.nullCount++;
                        } else if (value === 0) {
                            stats.zeroCount++;
                        }
                        
                        stats.values.add(JSON.stringify(value));
                        if (stats.samples.length < 3) {
                            stats.samples.push(value);
                        }
                    });
                } catch (e) {
                    // Skip invalid JSON
                }
            }
        });
        
        console.log(`Vectors with valid features: ${vectorsWithFeatures} out of ${vectors.length}`);
        
        // Show most static features
        const sortedFeatures = Array.from(featureStats.entries())
            .map(([name, stats]) => ({
                name,
                uniqueValues: stats.values.size,
                nullPercent: (stats.nullCount / vectorsWithFeatures * 100).toFixed(1),
                zeroPercent: (stats.zeroCount / vectorsWithFeatures * 100).toFixed(1),
                samples: stats.samples
            }))
            .sort((a, b) => a.uniqueValues - b.uniqueValues);
        
        console.log('\n🔴 MOST STATIC FEATURES (bottom 20):');
        console.log('Feature'.padEnd(35) + 'Unique'.padEnd(8) + 'Nulls%'.padEnd(8) + 'Zeros%'.padEnd(8) + 'Samples');
        console.log('-'.repeat(80));
        
        sortedFeatures.slice(0, 20).forEach(f => {
            const sampleStr = f.samples.map(v => 
                typeof v === 'number' ? v.toFixed(2) : String(v)
            ).join(', ');
            
            console.log(
                f.name.padEnd(35) +
                f.uniqueValues.toString().padEnd(8) +
                f.nullPercent.padEnd(8) +
                f.zeroPercent.padEnd(8) +
                sampleStr
            );
        });
        
        // Check specific problematic features
        console.log('\n\n🔬 SPECIFIC FEATURE INVESTIGATION:');
        console.log('-'.repeat(80));
        
        const problematicFeatures = ['close_price', 'ema3_value', 'vwap_value', 'bars_available', 'consecutive_up_bars'];
        
        problematicFeatures.forEach(fname => {
            if (featureStats.has(fname)) {
                const stats = featureStats.get(fname);
                console.log(`\n${fname}:`);
                console.log(`  Unique values: ${stats.values.size}`);
                console.log(`  All values: ${Array.from(stats.values).slice(0, 10).join(', ')}${stats.values.size > 10 ? '...' : ''}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error analyzing LanceDB:', error);
        console.error('Stack:', error.stack);
    }
}

analyzeLanceDBDirectly();