const axios = require('axios');
const fs = require('fs').promises;

async function diagnoseStaticFeatures() {
    console.log('🔍 STATIC FEATURE DIAGNOSTIC TOOL');
    console.log('=' .repeat(80));
    
    try {
        // 1. Get sample vectors from storage
        console.log('\n📥 Fetching sample vectors from storage...');
        const response = await axios.get('http://localhost:3015/api/vectors?limit=20', {
            timeout: 5000
        });
        const vectors = response.data.vectors;
        
        console.log(`✅ Retrieved ${vectors.length} vectors\n`);
        
        // 2. Analyze metadata patterns
        console.log('📊 METADATA ANALYSIS:');
        console.log('-'.repeat(80));
        
        const metadataStats = {
            entryTypes: new Map(),
            exitReasons: new Map(),
            instruments: new Map(),
            timestamps: new Set(),
            pnlValues: new Set(),
            maxProfits: new Set(),
            maxLosses: new Set()
        };
        
        vectors.forEach(v => {
            metadataStats.entryTypes.set(v.entryType, (metadataStats.entryTypes.get(v.entryType) || 0) + 1);
            metadataStats.exitReasons.set(v.exitReason, (metadataStats.exitReasons.get(v.exitReason) || 0) + 1);
            metadataStats.instruments.set(v.instrument, (metadataStats.instruments.get(v.instrument) || 0) + 1);
            metadataStats.timestamps.add(v.timestamp);
            metadataStats.pnlValues.add(v.pnl);
            metadataStats.maxProfits.add(v.maxProfit);
            metadataStats.maxLosses.add(v.maxLoss);
        });
        
        console.log('Entry Types:', Object.fromEntries(metadataStats.entryTypes));
        console.log('Exit Reasons:', Object.fromEntries(metadataStats.exitReasons));
        console.log('Unique Timestamps:', metadataStats.timestamps.size);
        console.log('Unique PnL values:', metadataStats.pnlValues.size, Array.from(metadataStats.pnlValues).slice(0, 5));
        console.log('Unique MaxProfit values:', metadataStats.maxProfits.size, Array.from(metadataStats.maxProfits).slice(0, 5));
        console.log('Unique MaxLoss values:', metadataStats.maxLosses.size, Array.from(metadataStats.maxLosses).slice(0, 5));
        
        // 3. Analyze feature patterns
        console.log('\n📈 FEATURE VALUE ANALYSIS:');
        console.log('-'.repeat(80));
        
        const featureAnalysis = new Map();
        
        vectors.forEach(v => {
            if (v.featuresJson) {
                try {
                    const features = JSON.parse(v.featuresJson);
                    Object.entries(features).forEach(([key, value]) => {
                        if (!featureAnalysis.has(key)) {
                            featureAnalysis.set(key, {
                                values: new Set(),
                                samples: [],
                                nullCount: 0,
                                zeroCount: 0
                            });
                        }
                        
                        const analysis = featureAnalysis.get(key);
                        
                        if (value === null || value === undefined) {
                            analysis.nullCount++;
                        } else if (value === 0) {
                            analysis.zeroCount++;
                        }
                        
                        analysis.values.add(JSON.stringify(value));
                        if (analysis.samples.length < 5) {
                            analysis.samples.push(value);
                        }
                    });
                } catch (e) {
                    console.error('Failed to parse features for vector:', v.entrySignalId);
                }
            }
        });
        
        // Sort features by variation (least variable first)
        const sortedFeatures = Array.from(featureAnalysis.entries())
            .map(([name, data]) => ({
                name,
                uniqueValues: data.values.size,
                samples: data.samples,
                nullCount: data.nullCount,
                zeroCount: data.zeroCount,
                nullPercent: (data.nullCount / vectors.length * 100).toFixed(1),
                zeroPercent: (data.zeroCount / vectors.length * 100).toFixed(1)
            }))
            .sort((a, b) => a.uniqueValues - b.uniqueValues);
        
        // Show most problematic features
        console.log('\n🚨 MOST STATIC FEATURES (showing worst 20):');
        console.log('Feature Name'.padEnd(35) + 'Unique'.padEnd(8) + 'Nulls%'.padEnd(8) + 'Zeros%'.padEnd(8) + 'Sample Values');
        console.log('-'.repeat(100));
        
        sortedFeatures.slice(0, 20).forEach(f => {
            const sampleStr = f.samples.slice(0, 3).map(v => 
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
        
        // 4. Check for patterns in "good" features
        console.log('\n✅ FEATURES WITH VARIATION (showing best 10):');
        console.log('Feature Name'.padEnd(35) + 'Unique'.padEnd(8) + 'Sample Values');
        console.log('-'.repeat(80));
        
        sortedFeatures.slice(-10).reverse().forEach(f => {
            const sampleStr = f.samples.slice(0, 3).map(v => 
                typeof v === 'number' ? v.toFixed(2) : String(v)
            ).join(', ');
            
            console.log(
                f.name.padEnd(35) +
                f.uniqueValues.toString().padEnd(8) +
                sampleStr
            );
        });
        
        // 5. Time-based analysis
        console.log('\n⏰ TIME-BASED ANALYSIS:');
        console.log('-'.repeat(80));
        
        const timeAnalysis = vectors.map(v => ({
            timestamp: new Date(v.timestamp),
            entrySignalId: v.entrySignalId,
            features: v.featuresJson ? JSON.parse(v.featuresJson) : {}
        })).sort((a, b) => a.timestamp - b.timestamp);
        
        if (timeAnalysis.length >= 2) {
            const first = timeAnalysis[0];
            const last = timeAnalysis[timeAnalysis.length - 1];
            const timeDiff = last.timestamp - first.timestamp;
            
            console.log(`First signal: ${first.timestamp.toISOString()}`);
            console.log(`Last signal: ${last.timestamp.toISOString()}`);
            console.log(`Time span: ${(timeDiff / (1000 * 60 * 60 * 24)).toFixed(2)} days`);
            
            // Check if specific features change over time
            const priceFeatures = ['close_price', 'open_price', 'high_price', 'low_price'];
            console.log('\nPrice feature changes over time:');
            
            priceFeatures.forEach(feature => {
                const firstValue = first.features[feature];
                const lastValue = last.features[feature];
                console.log(`${feature}: First=${firstValue}, Last=${lastValue}, Changed=${firstValue !== lastValue}`);
            });
        }
        
        // 6. Save detailed analysis
        const detailedAnalysis = {
            metadata: {
                totalVectors: vectors.length,
                analysisTime: new Date().toISOString()
            },
            metadataStats: {
                entryTypes: Object.fromEntries(metadataStats.entryTypes),
                exitReasons: Object.fromEntries(metadataStats.exitReasons),
                uniqueTimestamps: metadataStats.timestamps.size,
                pnlDistribution: Array.from(metadataStats.pnlValues),
                maxProfitDistribution: Array.from(metadataStats.maxProfits),
                maxLossDistribution: Array.from(metadataStats.maxLosses)
            },
            featureAnalysis: sortedFeatures,
            sampleVectors: vectors.slice(0, 5)
        };
        
        await fs.writeFile(
            'static-feature-diagnosis.json',
            JSON.stringify(detailedAnalysis, null, 2)
        );
        
        console.log('\n💾 Detailed analysis saved to: static-feature-diagnosis.json');
        
        // 7. Hypothesis testing
        console.log('\n🔬 HYPOTHESIS TESTING:');
        console.log('-'.repeat(80));
        
        // Check if all vectors have the same base features
        const firstFeatures = vectors[0].featuresJson ? JSON.parse(vectors[0].featuresJson) : {};
        let identicalFeatureCount = 0;
        
        Object.keys(firstFeatures).forEach(key => {
            const firstValue = firstFeatures[key];
            const allSame = vectors.every(v => {
                const features = v.featuresJson ? JSON.parse(v.featuresJson) : {};
                return features[key] === firstValue;
            });
            
            if (allSame) identicalFeatureCount++;
        });
        
        console.log(`Features identical across ALL vectors: ${identicalFeatureCount} out of ${Object.keys(firstFeatures).length}`);
        console.log(`Percentage of static features: ${(identicalFeatureCount / Object.keys(firstFeatures).length * 100).toFixed(1)}%`);
        
        // Check bars_available
        const barsAvailable = new Set();
        vectors.forEach(v => {
            const features = v.featuresJson ? JSON.parse(v.featuresJson) : {};
            if (features.bars_available !== undefined) {
                barsAvailable.add(features.bars_available);
            }
        });
        
        console.log(`\nbars_available values:`, Array.from(barsAvailable));
        
        // Check data_source
        const dataSources = new Set();
        vectors.forEach(v => {
            const features = v.featuresJson ? JSON.parse(v.featuresJson) : {};
            if (features.data_source) {
                dataSources.add(features.data_source);
            }
        });
        
        console.log(`data_source values:`, Array.from(dataSources));
        
    } catch (error) {
        console.error('❌ Error during diagnosis:', error.message);
    }
}

// Run diagnosis
diagnoseStaticFeatures();