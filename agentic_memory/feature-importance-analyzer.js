#!/usr/bin/env node

/**
 * Feature Importance Analyzer
 * 
 * Analyzes stored vectors to determine which features have the most predictive power
 * for trading outcomes using gradient-based importance scoring.
 * 
 * Usage: node feature-importance-analyzer.js [options]
 * Options:
 *   --min-vectors <n>    Minimum vectors required for analysis (default: 10)
 *   --top-features <n>   Number of top features to output (default: 20)
 *   --output <file>      Output file for feature selection config
 *   --instrument <inst>  Analyze specific instrument only
 */

const axios = require('axios');
const fs = require('fs').promises;

class FeatureImportanceAnalyzer {
    constructor(options = {}) {
        this.storageUrl = options.storageUrl || 'http://localhost:3015';
        this.minVectors = options.minVectors || 10;
        this.topFeatures = options.topFeatures || 20;
        this.outputFile = options.outputFile || './feature-selection.json';
        this.instrument = options.instrument;
        
        console.log('🧠 Feature Importance Analyzer initialized');
        console.log(`   Storage URL: ${this.storageUrl}`);
        console.log(`   Min vectors: ${this.minVectors}`);
        console.log(`   Top features: ${this.topFeatures}`);
        if (this.instrument) {
            console.log(`   Instrument filter: ${this.instrument}`);
        }
    }

    async analyze() {
        try {
            console.log('\\n📊 Starting feature importance analysis...');
            
            // 1. Get all vectors from storage
            const vectors = await this.getVectors();
            if (vectors.length < this.minVectors) {
                throw new Error(`Insufficient data: ${vectors.length} vectors (need ${this.minVectors})`);
            }
            
            console.log(`✅ Retrieved ${vectors.length} vectors for analysis`);
            
            // 2. Extract features and outcomes
            const { features, outcomes, featureNames } = this.extractData(vectors);
            console.log(`📈 Analyzing ${featureNames.length} features`);
            
            // 3. Calculate feature importance using multiple methods
            const importance = this.calculateImportance(features, outcomes, featureNames);
            
            // 4. Generate feature ranking
            const ranking = this.rankFeatures(importance, featureNames);
            
            // 5. Output results
            await this.outputResults(ranking, vectors.length);
            
            return ranking;
            
        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }

    async getVectors() {
        console.log('📥 Fetching vectors from storage...');
        
        let url = `${this.storageUrl}/api/vectors?limit=10000`;
        if (this.instrument) {
            url += `&instrument=${this.instrument}`;
        }
        
        let response;
        try {
            response = await axios.get(url, { timeout: 10000 });
        } catch (error) {
            console.log('⚠️  Direct connection failed, checking if storage is accessible...');
            // Try the stats endpoint first to see if storage is up
            try {
                await axios.get(`${this.storageUrl}/stats`, { timeout: 5000 });
                console.log('✅ Storage is accessible via /stats endpoint');
                throw new Error(`Vectors endpoint failed: ${error.message}`);
            } catch (statsError) {
                throw new Error(`Storage not accessible: ${error.message}. Please ensure storage-agent is running on ${this.storageUrl}`);
            }
        }
        
        // Handle wrapped response format from storage agent
        let vectors;
        if (response.data && response.data.success && Array.isArray(response.data.vectors)) {
            vectors = response.data.vectors;
        } else if (Array.isArray(response.data)) {
            vectors = response.data;
        } else {
            throw new Error('Invalid response format from storage');
        }
        
        // Filter out vectors with missing outcome data
        const validVectors = vectors.filter(v => 
            v.features && 
            v.featuresJson && 
            typeof v.pnl === 'number' &&
            typeof v.wasGoodExit === 'boolean'
        );
        
        console.log(`   Total vectors: ${vectors.length}`);
        console.log(`   Valid vectors: ${validVectors.length}`);
        
        return validVectors;
    }

    extractData(vectors) {
        console.log('🔍 Extracting features and outcomes...');
        
        const outcomes = [];
        const featuresList = [];
        let featureNames = null;
        
        for (const vector of vectors) {
            try {
                // Parse feature JSON to get feature names and values
                const featuresObj = JSON.parse(vector.featuresJson);
                
                if (!featureNames) {
                    featureNames = Object.keys(featuresObj).sort(); // Consistent ordering
                    console.log(`   Feature names extracted: ${featureNames.length} features`);
                }
                
                // Extract feature values in consistent order
                const featureValues = featureNames.map(name => featuresObj[name] || 0);
                featuresList.push(featureValues);
                
                // Extract outcome (binary: profitable trade or not)
                outcomes.push({
                    profitable: vector.pnl > 0,
                    pnl: vector.pnl,
                    wasGoodExit: vector.wasGoodExit,
                    holdingBars: vector.holdingBars || 0
                });
                
            } catch (error) {
                console.warn(`   Skipping vector ${vector.id}: ${error.message}`);
            }
        }
        
        console.log(`   Extracted ${featuresList.length} feature vectors`);
        
        // Debug outcome data
        const profitable = outcomes.filter(o => o.profitable).length;
        const winRate = profitable / outcomes.length * 100;
        console.log(`   Win rate: ${winRate.toFixed(1)}% (${profitable}/${outcomes.length})`);
        
        // Sample some PnL values for debugging
        const samplePnLs = outcomes.slice(0, 5).map(o => o.pnl);
        console.log(`   Sample PnLs: [${samplePnLs.join(', ')}]`);
        
        const avgPnL = outcomes.reduce((sum, o) => sum + o.pnl, 0) / outcomes.length;
        console.log(`   Average PnL: ${avgPnL.toFixed(2)}`);
        
        return { 
            features: featuresList, 
            outcomes, 
            featureNames 
        };
    }

    calculateImportance(features, outcomes, featureNames) {
        console.log('⚡ Calculating feature importance...');
        
        const importance = {};
        
        for (let i = 0; i < featureNames.length; i++) {
            const featureName = featureNames[i];
            const featureValues = features.map(row => row[i]);
            
            // Calculate multiple importance metrics
            importance[featureName] = {
                correlation: this.calculateCorrelation(featureValues, outcomes),
                informationGain: this.calculateInformationGain(featureValues, outcomes),
                gradientImportance: this.calculateGradientImportance(featureValues, outcomes),
                variance: this.calculateVariance(featureValues),
                composite: 0 // Will be calculated after all metrics
            };
        }
        
        // Calculate composite score
        const correlations = Object.values(importance).map(i => Math.abs(i.correlation));
        const infoGains = Object.values(importance).map(i => i.informationGain);
        const gradients = Object.values(importance).map(i => i.gradientImportance);
        
        const maxCorr = Math.max(...correlations);
        const maxInfo = Math.max(...infoGains);
        const maxGrad = Math.max(...gradients);
        
        // Normalize and combine scores
        for (const featureName of featureNames) {
            const imp = importance[featureName];
            const normCorr = maxCorr > 0 ? Math.abs(imp.correlation) / maxCorr : 0;
            const normInfo = maxInfo > 0 ? imp.informationGain / maxInfo : 0;
            const normGrad = maxGrad > 0 ? imp.gradientImportance / maxGrad : 0;
            
            // Weighted composite score
            imp.composite = (normCorr * 0.3) + (normInfo * 0.4) + (normGrad * 0.3);
        }
        
        console.log('   ✅ Importance calculation complete');
        return importance;
    }

    calculateCorrelation(featureValues, outcomes) {
        // Pearson correlation between feature and profitability
        const profitableFlags = outcomes.map(o => o.profitable ? 1 : 0);
        
        const n = featureValues.length;
        const sumX = featureValues.reduce((a, b) => a + b, 0);
        const sumY = profitableFlags.reduce((a, b) => a + b, 0);
        const sumXY = featureValues.reduce((sum, x, i) => sum + x * profitableFlags[i], 0);
        const sumX2 = featureValues.reduce((sum, x) => sum + x * x, 0);
        const sumY2 = profitableFlags.reduce((sum, y) => sum + y * y, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    calculateInformationGain(featureValues, outcomes) {
        // Information gain calculation for continuous features
        // Discretize feature into bins and calculate entropy reduction
        
        const bins = this.discretizeFeature(featureValues, 5);
        const totalEntropy = this.calculateEntropy(outcomes.map(o => o.profitable));
        
        let weightedEntropy = 0;
        for (let bin = 0; bin < 5; bin++) {
            const binIndices = bins.map((b, i) => b === bin ? i : -1).filter(i => i >= 0);
            if (binIndices.length === 0) continue;
            
            const binOutcomes = binIndices.map(i => outcomes[i].profitable);
            const binEntropy = this.calculateEntropy(binOutcomes);
            weightedEntropy += (binIndices.length / outcomes.length) * binEntropy;
        }
        
        return Math.max(0, totalEntropy - weightedEntropy);
    }

    calculateGradientImportance(featureValues, outcomes) {
        // Calculate how much the feature value changes affect outcome probability
        // Sort by feature value and calculate probability gradient
        
        const sorted = featureValues.map((val, i) => ({ val, outcome: outcomes[i] }))
            .sort((a, b) => a.val - b.val);
        
        const windowSize = Math.max(5, Math.floor(sorted.length / 10));
        let maxGradient = 0;
        
        for (let i = 0; i <= sorted.length - windowSize; i++) {
            const window = sorted.slice(i, i + windowSize);
            const profitRate = window.filter(w => w.outcome.profitable).length / window.length;
            
            if (i > 0) {
                const prevWindow = sorted.slice(i - windowSize, i);
                const prevProfitRate = prevWindow.filter(w => w.outcome.profitable).length / prevWindow.length;
                const gradient = Math.abs(profitRate - prevProfitRate);
                maxGradient = Math.max(maxGradient, gradient);
            }
        }
        
        return maxGradient;
    }

    discretizeFeature(values, numBins) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binSize = (max - min) / numBins;
        
        return values.map(val => {
            if (binSize === 0) return 0;
            const bin = Math.floor((val - min) / binSize);
            return Math.min(bin, numBins - 1);
        });
    }

    calculateEntropy(booleanArray) {
        if (booleanArray.length === 0) return 0;
        
        const trueCount = booleanArray.filter(x => x).length;
        const falseCount = booleanArray.length - trueCount;
        
        if (trueCount === 0 || falseCount === 0) return 0;
        
        const pTrue = trueCount / booleanArray.length;
        const pFalse = falseCount / booleanArray.length;
        
        return -(pTrue * Math.log2(pTrue) + pFalse * Math.log2(pFalse));
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return variance;
    }

    rankFeatures(importance, featureNames) {
        console.log('🏆 Ranking features by importance...');
        
        const ranked = featureNames.map(name => ({
            name,
            ...importance[name]
        })).sort((a, b) => b.composite - a.composite);
        
        console.log('\\n📋 Top 10 Most Important Features:');
        console.log('Rank | Feature Name                | Composite | Correlation | Info Gain | Gradient');
        console.log('-'.repeat(85));
        
        ranked.slice(0, 10).forEach((feature, index) => {
            console.log(
                `${(index + 1).toString().padStart(4)} | ` +
                `${feature.name.padEnd(26)} | ` +
                `${feature.composite.toFixed(3).padStart(9)} | ` +
                `${feature.correlation.toFixed(3).padStart(11)} | ` +
                `${feature.informationGain.toFixed(3).padStart(9)} | ` +
                `${feature.gradientImportance.toFixed(3).padStart(8)}`
            );
        });
        
        return ranked;
    }

    async outputResults(ranking, vectorCount) {
        console.log('\\n💾 Saving results...');
        
        const topFeatures = ranking.slice(0, this.topFeatures);
        
        const output = {
            description: "Feature selection configuration for Risk Service",
            version: "2.0.0",
            lastUpdated: new Date().toISOString(),
            analysisInfo: {
                vectorsAnalyzed: vectorCount,
                analysisMethod: "gradient_based_composite",
                topFeaturesSelected: this.topFeatures
            },
            selectedFeatures: topFeatures.map(f => f.name),
            featureImportance: Object.fromEntries(
                topFeatures.map(f => [f.name, f.composite])
            ),
            detailedMetrics: Object.fromEntries(
                topFeatures.map(f => [f.name, {
                    composite: f.composite,
                    correlation: f.correlation,
                    informationGain: f.informationGain,
                    gradientImportance: f.gradientImportance,
                    variance: f.variance
                }])
            ),
            selectionMethod: "gradient_based_composite",
            minImportanceThreshold: topFeatures[topFeatures.length - 1].composite,
            maxFeatures: this.topFeatures
        };
        
        await fs.writeFile(this.outputFile, JSON.stringify(output, null, 2));
        console.log(`✅ Feature selection saved to: ${this.outputFile}`);
        
        // Also save detailed analysis
        const detailedFile = this.outputFile.replace('.json', '-detailed.json');
        const detailedOutput = {
            ...output,
            allFeatures: ranking
        };
        
        await fs.writeFile(detailedFile, JSON.stringify(detailedOutput, null, 2));
        console.log(`📊 Detailed analysis saved to: ${detailedFile}`);
    }
}

// CLI usage
async function main() {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        
        switch (flag) {
            case '--min-vectors':
                options.minVectors = parseInt(value);
                break;
            case '--top-features':
                options.topFeatures = parseInt(value);
                break;
            case '--output':
                options.outputFile = value;
                break;
            case '--instrument':
                options.instrument = value;
                break;
            case '--storage-url':
                options.storageUrl = value;
                break;
        }
    }
    
    try {
        const analyzer = new FeatureImportanceAnalyzer(options);
        await analyzer.analyze();
        console.log('\\n✅ Feature importance analysis complete!');
    } catch (error) {
        console.error('\\n❌ Analysis failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = FeatureImportanceAnalyzer;