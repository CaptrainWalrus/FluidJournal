const axios = require('axios');
const fs = require('fs').promises;

async function analyzeStoredVectors() {
    console.log('🔍 STORED VECTOR DEEP ANALYSIS');
    console.log('=' .repeat(80));
    
    try {
        // Try both localhost and explicit IP
        let response;
        try {
            response = await axios.get('http://localhost:3015/api/vectors?limit=100', { timeout: 5000 });
        } catch (err) {
            console.log('Trying alternative connection...');
            response = await axios.get('http://127.0.0.1:3015/api/vectors?limit=100', { timeout: 5000 });
        }
        
        const vectors = response.data.vectors;
        console.log(`\n✅ Retrieved ${vectors.length} vectors for analysis\n`);
        
        // 1. Analyze Exit Reasons and PnL correlation
        console.log('📊 EXIT REASON vs PNL ANALYSIS:');
        console.log('-'.repeat(80));
        
        const exitAnalysis = {};
        vectors.forEach(v => {
            const key = v.exitReason || 'UNKNOWN';
            if (!exitAnalysis[key]) {
                exitAnalysis[key] = {
                    count: 0,
                    pnls: [],
                    maxProfits: [],
                    maxLosses: [],
                    entryTypes: new Set()
                };
            }
            
            exitAnalysis[key].count++;
            exitAnalysis[key].pnls.push(v.pnl || 0);
            exitAnalysis[key].maxProfits.push(v.maxProfit || 0);
            exitAnalysis[key].maxLosses.push(v.maxLoss || 0);
            exitAnalysis[key].entryTypes.add(v.entryType || 'unknown');
        });
        
        Object.entries(exitAnalysis).forEach(([reason, data]) => {
            const avgPnl = data.pnls.reduce((a,b) => a+b, 0) / data.pnls.length;
            const avgMaxProfit = data.maxProfits.reduce((a,b) => a+b, 0) / data.maxProfits.length;
            const avgMaxLoss = data.maxLosses.reduce((a,b) => a+b, 0) / data.maxLosses.length;
            
            console.log(`\nExit Reason: ${reason}`);
            console.log(`  Count: ${data.count} (${(data.count / vectors.length * 100).toFixed(1)}%)`);
            console.log(`  Avg PnL: $${avgPnl.toFixed(2)}`);
            console.log(`  Avg MaxProfit: $${avgMaxProfit.toFixed(2)}`);
            console.log(`  Avg MaxLoss: $${avgMaxLoss.toFixed(2)}`);
            console.log(`  Entry Types: ${Array.from(data.entryTypes).join(', ')}`);
            
            // Show PnL distribution
            const uniquePnls = new Set(data.pnls);
            if (uniquePnls.size <= 5) {
                console.log(`  PnL values: ${Array.from(uniquePnls).map(p => '$' + p.toFixed(2)).join(', ')}`);
            } else {
                const sorted = Array.from(uniquePnls).sort((a,b) => a-b);
                console.log(`  PnL range: $${sorted[0].toFixed(2)} to $${sorted[sorted.length-1].toFixed(2)} (${uniquePnls.size} unique values)`);
            }
        });
        
        // 2. Feature consistency analysis
        console.log('\n\n📈 FEATURE CONSISTENCY ANALYSIS:');
        console.log('-'.repeat(80));
        
        // Parse first 10 vectors' features
        const featureSets = [];
        for (let i = 0; i < Math.min(10, vectors.length); i++) {
            if (vectors[i].featuresJson) {
                try {
                    const features = JSON.parse(vectors[i].featuresJson);
                    featureSets.push({
                        id: vectors[i].entrySignalId,
                        timestamp: vectors[i].timestamp,
                        features: features
                    });
                } catch (e) {
                    console.error(`Failed to parse features for vector ${i}`);
                }
            }
        }
        
        if (featureSets.length >= 2) {
            // Compare first vector to others
            const firstFeatures = featureSets[0].features;
            const featureNames = Object.keys(firstFeatures);
            
            const identicalFeatures = [];
            const varyingFeatures = [];
            
            featureNames.forEach(fname => {
                const firstValue = firstFeatures[fname];
                const isIdentical = featureSets.every(fs => fs.features[fname] === firstValue);
                
                if (isIdentical) {
                    identicalFeatures.push({ name: fname, value: firstValue });
                } else {
                    const values = featureSets.map(fs => fs.features[fname]);
                    varyingFeatures.push({ 
                        name: fname, 
                        values: values,
                        uniqueCount: new Set(values).size
                    });
                }
            });
            
            console.log(`\nComparing ${featureSets.length} vectors:`);
            console.log(`  Total features: ${featureNames.length}`);
            console.log(`  Identical features: ${identicalFeatures.length} (${(identicalFeatures.length / featureNames.length * 100).toFixed(1)}%)`);
            console.log(`  Varying features: ${varyingFeatures.length}`);
            
            // Show some identical features
            console.log('\n🔴 Sample IDENTICAL features (first 10):');
            identicalFeatures.slice(0, 10).forEach(f => {
                const valueStr = typeof f.value === 'number' ? f.value.toFixed(4) : String(f.value);
                console.log(`  ${f.name}: ${valueStr}`);
            });
            
            // Show varying features sorted by variation
            console.log('\n✅ VARYING features (sorted by uniqueness):');
            varyingFeatures.sort((a, b) => b.uniqueCount - a.uniqueCount).slice(0, 10).forEach(f => {
                const sampleValues = f.values.slice(0, 3).map(v => 
                    typeof v === 'number' ? v.toFixed(2) : String(v)
                ).join(', ');
                console.log(`  ${f.name}: ${f.uniqueCount} unique values [${sampleValues}...]`);
            });
        }
        
        // 3. Time-based feature drift analysis
        console.log('\n\n⏰ TIME-BASED FEATURE DRIFT:');
        console.log('-'.repeat(80));
        
        // Sort vectors by timestamp
        const sortedVectors = vectors.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        if (sortedVectors.length >= 2) {
            const first = sortedVectors[0];
            const last = sortedVectors[sortedVectors.length - 1];
            
            console.log(`Time span: ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`);
            
            // Compare features between first and last
            try {
                const firstFeatures = JSON.parse(first.featuresJson || '{}');
                const lastFeatures = JSON.parse(last.featuresJson || '{}');
                
                const priceFeatures = ['close_price', 'open_price', 'high_price', 'low_price', 'ema21_value', 'rsi_14'];
                
                console.log('\nPrice feature changes over time:');
                priceFeatures.forEach(fname => {
                    if (fname in firstFeatures && fname in lastFeatures) {
                        const firstVal = firstFeatures[fname];
                        const lastVal = lastFeatures[fname];
                        const changed = firstVal !== lastVal;
                        console.log(`  ${fname}: ${firstVal} → ${lastVal} ${changed ? '✅ CHANGED' : '🔴 STATIC'}`);
                    }
                });
                
                // Check bars_available
                console.log(`\nbars_available: ${firstFeatures.bars_available} → ${lastFeatures.bars_available}`);
                console.log(`data_source: ${firstFeatures.data_source} → ${lastFeatures.data_source}`);
            } catch (e) {
                console.error('Failed to parse features for time comparison');
            }
        }
        
        // 4. MaxProfit/MaxLoss investigation
        console.log('\n\n💰 MAXPROFIT/MAXLOSS INVESTIGATION:');
        console.log('-'.repeat(80));
        
        const profitLossStats = {
            bothZero: 0,
            onlyMaxProfitZero: 0,
            onlyMaxLossZero: 0,
            bothNonZero: 0,
            samples: []
        };
        
        vectors.forEach(v => {
            const maxP = v.maxProfit || 0;
            const maxL = v.maxLoss || 0;
            
            if (maxP === 0 && maxL === 0) {
                profitLossStats.bothZero++;
            } else if (maxP === 0 && maxL !== 0) {
                profitLossStats.onlyMaxProfitZero++;
            } else if (maxP !== 0 && maxL === 0) {
                profitLossStats.onlyMaxLossZero++;
            } else {
                profitLossStats.bothNonZero++;
                if (profitLossStats.samples.length < 5) {
                    profitLossStats.samples.push({
                        id: v.entrySignalId,
                        maxProfit: maxP,
                        maxLoss: maxL,
                        pnl: v.pnl,
                        exitReason: v.exitReason
                    });
                }
            }
        });
        
        console.log(`Both Zero: ${profitLossStats.bothZero} (${(profitLossStats.bothZero / vectors.length * 100).toFixed(1)}%)`);
        console.log(`Only MaxProfit Zero: ${profitLossStats.onlyMaxProfitZero}`);
        console.log(`Only MaxLoss Zero: ${profitLossStats.onlyMaxLossZero}`);
        console.log(`Both Non-Zero: ${profitLossStats.bothNonZero} (${(profitLossStats.bothNonZero / vectors.length * 100).toFixed(1)}%)`);
        
        if (profitLossStats.samples.length > 0) {
            console.log('\nSamples with both MaxProfit and MaxLoss:');
            profitLossStats.samples.forEach(s => {
                console.log(`  ${s.id}: MaxP=$${s.maxProfit.toFixed(2)}, MaxL=$${s.maxLoss.toFixed(2)}, PnL=$${s.pnl.toFixed(2)}, Exit=${s.exitReason}`);
            });
        }
        
        // Save detailed report
        const report = {
            summary: {
                totalVectors: vectors.length,
                analysisTime: new Date().toISOString()
            },
            exitAnalysis,
            featureConsistency: {
                identicalCount: identicalFeatures?.length || 0,
                varyingCount: varyingFeatures?.length || 0,
                samples: {
                    identical: identicalFeatures?.slice(0, 20),
                    varying: varyingFeatures?.slice(0, 20)
                }
            },
            profitLossStats,
            recommendations: []
        };
        
        // Generate recommendations
        if (profitLossStats.bothZero > vectors.length * 0.9) {
            report.recommendations.push('CRITICAL: MaxProfit/MaxLoss tracking is broken - over 90% have zero values');
        }
        
        if (identicalFeatures && identicalFeatures.length > featureNames?.length * 0.7) {
            report.recommendations.push('CRITICAL: Over 70% of features are identical across all vectors');
        }
        
        if (exitAnalysis['UNKNOWN'] && exitAnalysis['UNKNOWN'].count > vectors.length * 0.5) {
            report.recommendations.push('WARNING: Over 50% of positions have UNKNOWN exit reason');
        }
        
        await fs.writeFile('vector-analysis-report.json', JSON.stringify(report, null, 2));
        console.log('\n\n💾 Detailed report saved to: vector-analysis-report.json');
        
    } catch (error) {
        console.error('❌ Error analyzing vectors:', error.message);
        console.error('Make sure the storage service is running on port 3015');
    }
}

analyzeStoredVectors();