#!/usr/bin/env node

/**
 * Low-Variation Feature Detector
 * 
 * Analyzes stored vectors to identify features with suspiciously low variation.
 * This indicates potential data quality issues where features aren't updating properly.
 */

const axios = require('axios');
const fs = require('fs').promises;

class LowVariationDetector {
    constructor(options = {}) {
        this.storageUrl = options.storageUrl || 'http://localhost:3015';
        this.variationThreshold = options.variationThreshold || 0.001; // Very low variation threshold
        this.uniqueValueThreshold = options.uniqueValueThreshold || 3; // Features with <= 3 unique values
        this.outputFile = options.outputFile || './low-variation-report.json';
        
        console.log('🔍 Low-Variation Feature Detector initialized');
        console.log(`   Storage URL: ${this.storageUrl}`);
        console.log(`   Variation threshold: ${this.variationThreshold}`);
        console.log(`   Unique value threshold: ${this.uniqueValueThreshold}`);
    }

    async analyze() {
        try {
            console.log('\\n📊 Starting low-variation analysis...');
            
            // Get all vectors from storage
            const vectors = await this.getVectors();
            if (vectors.length < 2) {
                throw new Error(`Insufficient data: ${vectors.length} vectors (need at least 2)`);
            }
            
            console.log(`✅ Retrieved ${vectors.length} vectors for analysis`);
            
            // Extract features from all vectors
            const { featureMatrix, featureNames } = this.extractFeatureMatrix(vectors);
            console.log(`📈 Analyzing ${featureNames.length} features across ${vectors.length} records`);
            
            // Analyze variation for each feature
            const analysis = this.analyzeVariation(featureMatrix, featureNames);
            
            // Generate alerts and report
            const report = this.generateReport(analysis, vectors.length);
            
            // Save report
            await this.saveReport(report);
            
            return report;
            
        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }

    async getVectors() {
        console.log('📥 Fetching vectors from storage...');
        
        const url = `${this.storageUrl}/api/vectors?limit=10000`;
        
        let response;
        try {
            response = await axios.get(url, { timeout: 10000 });
        } catch (error) {
            throw new Error(`Storage not accessible: ${error.message}`);
        }
        
        let vectors;
        if (response.data && response.data.success && Array.isArray(response.data.vectors)) {
            vectors = response.data.vectors;
        } else {
            throw new Error('Invalid response format from storage');
        }
        
        // Filter out vectors with missing feature data
        const validVectors = vectors.filter(v => v.featuresJson);
        
        console.log(`   Total vectors: ${vectors.length}`);
        console.log(`   Valid vectors: ${validVectors.length}`);
        
        return validVectors;
    }

    extractFeatureMatrix(vectors) {
        console.log('🔍 Extracting feature matrix...');
        
        const featureMatrix = [];
        let featureNames = null;
        
        for (const vector of vectors) {
            try {
                const featuresObj = JSON.parse(vector.featuresJson);
                
                if (!featureNames) {
                    featureNames = Object.keys(featuresObj).sort();
                    console.log(`   Feature names extracted: ${featureNames.length} features`);
                }
                
                // Extract feature values in consistent order
                const featureValues = featureNames.map(name => {
                    const value = featuresObj[name];
                    return typeof value === 'number' && !isNaN(value) ? value : 0;
                });
                
                featureMatrix.push(featureValues);
                
            } catch (error) {
                console.warn(`   Skipping vector ${vector.id}: ${error.message}`);
            }
        }
        
        console.log(`   Extracted ${featureMatrix.length} x ${featureNames.length} feature matrix`);
        
        return { featureMatrix, featureNames };
    }

    analyzeVariation(featureMatrix, featureNames) {
        console.log('⚡ Analyzing feature variation...');
        
        const analysis = [];
        const numRecords = featureMatrix.length;
        
        for (let featureIndex = 0; featureIndex < featureNames.length; featureIndex++) {
            const featureName = featureNames[featureIndex];
            const values = featureMatrix.map(row => row[featureIndex]);
            
            // Calculate variation metrics
            const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
            const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);
            const coefficientOfVariation = mean !== 0 ? Math.abs(stdDev / mean) : 0;
            const range = uniqueValues.length > 0 ? uniqueValues[uniqueValues.length - 1] - uniqueValues[0] : 0;
            const relativeRange = mean !== 0 ? Math.abs(range / mean) : 0;
            
            // Detect issues
            const issues = [];
            
            if (uniqueValues.length <= this.uniqueValueThreshold) {
                issues.push(`Only ${uniqueValues.length} unique values`);
            }
            
            if (coefficientOfVariation < this.variationThreshold) {
                issues.push(`Very low coefficient of variation: ${coefficientOfVariation.toFixed(6)}`);
            }
            
            if (relativeRange < this.variationThreshold) {
                issues.push(`Very low relative range: ${relativeRange.toFixed(6)}`);
            }
            
            if (uniqueValues.length === 1) {
                issues.push(`Constant value: ${uniqueValues[0]}`);
            }
            
            // Check for suspicious patterns
            if (uniqueValues.length === 2 && numRecords > 10) {
                issues.push(`Binary feature with only 2 values across ${numRecords} records`);
            }
            
            analysis.push({
                featureName,
                uniqueCount: uniqueValues.length,
                uniqueValues: uniqueValues.slice(0, 10), // First 10 for display
                allUniqueValues: uniqueValues,
                mean,
                variance,
                stdDev,
                coefficientOfVariation,
                range,
                relativeRange,
                issues,
                severity: this.calculateSeverity(issues, uniqueValues.length, coefficientOfVariation, numRecords)
            });
        }
        
        // Sort by severity (most problematic first)
        analysis.sort((a, b) => b.severity - a.severity);
        
        console.log('   ✅ Variation analysis complete');
        return analysis;
    }

    calculateSeverity(issues, uniqueCount, coefficientOfVariation, numRecords) {
        let severity = 0;
        
        // Constant features are critical
        if (uniqueCount === 1) severity += 100;
        
        // Very few unique values relative to record count
        const uniqueRatio = uniqueCount / numRecords;
        if (uniqueRatio < 0.1) severity += 50; // Less than 10% unique
        if (uniqueRatio < 0.05) severity += 30; // Less than 5% unique
        
        // Low coefficient of variation
        if (coefficientOfVariation < 0.0001) severity += 40;
        if (coefficientOfVariation < 0.001) severity += 20;
        if (coefficientOfVariation < 0.01) severity += 10;
        
        // Issue count
        severity += issues.length * 5;
        
        return severity;
    }

    generateReport(analysis, totalRecords) {
        console.log('📋 Generating variation report...');
        
        // Categorize issues
        const critical = analysis.filter(a => a.severity >= 100);
        const high = analysis.filter(a => a.severity >= 50 && a.severity < 100);
        const medium = analysis.filter(a => a.severity >= 20 && a.severity < 50);
        const low = analysis.filter(a => a.severity < 20 && a.issues.length > 0);
        
        console.log('\\n🚨 Low-Variation Detection Results:');
        console.log('━'.repeat(60));
        console.log(`📊 Total Features Analyzed: ${analysis.length}`);
        console.log(`🔴 Critical Issues: ${critical.length} features`);
        console.log(`🟠 High Issues: ${high.length} features`);
        console.log(`🟡 Medium Issues: ${medium.length} features`);
        console.log(`🟢 Low Issues: ${low.length} features`);
        console.log('');
        
        // Show critical issues
        if (critical.length > 0) {
            console.log('🔴 CRITICAL ISSUES (Constant or near-constant features):');
            critical.slice(0, 10).forEach((feature, index) => {
                console.log(`${index + 1}. ${feature.featureName}`);
                console.log(`   Issues: ${feature.issues.join(', ')}`);
                console.log(`   Unique values: [${feature.uniqueValues.join(', ')}]`);
                console.log('');
            });
        }
        
        // Show high issues
        if (high.length > 0) {
            console.log('🟠 HIGH ISSUES (Very low variation):');
            high.slice(0, 5).forEach((feature, index) => {
                console.log(`${index + 1}. ${feature.featureName}`);
                console.log(`   Issues: ${feature.issues.join(', ')}`);
                console.log(`   Unique count: ${feature.uniqueCount}/${totalRecords} records`);
                console.log('');
            });
        }
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalFeatures: analysis.length,
                totalRecords,
                criticalIssues: critical.length,
                highIssues: high.length,
                mediumIssues: medium.length,
                lowIssues: low.length
            },
            thresholds: {
                variationThreshold: this.variationThreshold,
                uniqueValueThreshold: this.uniqueValueThreshold
            },
            criticalFeatures: critical.map(f => ({
                name: f.featureName,
                severity: f.severity,
                issues: f.issues,
                uniqueCount: f.uniqueCount,
                uniqueValues: f.allUniqueValues,
                coefficientOfVariation: f.coefficientOfVariation
            })),
            highIssueFeatures: high.map(f => ({
                name: f.featureName,
                severity: f.severity,
                issues: f.issues,
                uniqueCount: f.uniqueCount,
                coefficientOfVariation: f.coefficientOfVariation
            })),
            allFeatures: analysis
        };
        
        return report;
    }

    async saveReport(report) {
        console.log('💾 Saving variation report...');
        
        await fs.writeFile(this.outputFile, JSON.stringify(report, null, 2));
        console.log(`✅ Report saved to: ${this.outputFile}`);
        
        // Also save a summary CSV
        const csvFile = this.outputFile.replace('.json', '.csv');
        let csv = 'FeatureName,Severity,UniqueCount,CoefficientOfVariation,Issues\\n';
        
        report.allFeatures.forEach(feature => {
            csv += `"${feature.featureName}",${feature.severity},${feature.uniqueCount},${feature.coefficientOfVariation},"${feature.issues.join('; ')}"\\n`;
        });
        
        await fs.writeFile(csvFile, csv);
        console.log(`📊 Summary CSV saved to: ${csvFile}`);
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
            case '--variation-threshold':
                options.variationThreshold = parseFloat(value);
                break;
            case '--unique-threshold':
                options.uniqueValueThreshold = parseInt(value);
                break;
            case '--output':
                options.outputFile = value;
                break;
            case '--storage-url':
                options.storageUrl = value;
                break;
        }
    }
    
    try {
        const detector = new LowVariationDetector(options);
        await detector.analyze();
        console.log('\\n✅ Low-variation analysis complete!');
    } catch (error) {
        console.error('\\n❌ Analysis failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = LowVariationDetector;