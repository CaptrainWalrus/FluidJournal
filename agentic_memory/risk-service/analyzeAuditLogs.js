#!/usr/bin/env node

/**
 * Audit Log Analysis Tool for Pruned Ranges Decisions
 * Provides insights into clustering performance, regime changes, and scalability
 */

const fs = require('fs');
const path = require('path');

class AuditLogAnalyzer {
    constructor() {
        this.logDir = path.join(__dirname, 'audit_logs');
        this.analyses = {
            systemEvents: [],
            analysisEvents: [],
            rotationEvents: [],
            scalabilityEvents: [],
            regimeChanges: [],
            errors: []
        };
    }
    
    /**
     * Analyze logs for a specific date or latest logs
     */
    async analyzeLogs(dateString = null) {
        try {
            const logFiles = await this.getLogFiles(dateString);
            
            if (logFiles.length === 0) {
                console.log('No log files found.');
                return;
            }
            
            console.log(`\n🔍 ANALYZING ${logFiles.length} LOG FILES`);
            console.log('='.repeat(50));
            
            for (const logFile of logFiles) {
                await this.processLogFile(logFile);
            }
            
            // Generate comprehensive report
            this.generateReport();
            
        } catch (error) {
            console.error('Failed to analyze logs:', error.message);
        }
    }
    
    /**
     * Get log files for analysis
     */
    async getLogFiles(dateString) {
        const files = fs.readdirSync(this.logDir);
        const logFiles = files.filter(f => f.endsWith('.jsonl'));
        
        if (dateString) {
            return logFiles.filter(f => f.includes(dateString));
        }
        
        // Return latest log file if no date specified
        return logFiles.slice(-1);
    }
    
    /**
     * Process individual log file
     */
    async processLogFile(filename) {
        const filepath = path.join(this.logDir, filename);
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        
        console.log(`\n📁 Processing ${filename} (${lines.length} entries)`);
        
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                this.categorizeEntry(entry);
            } catch (error) {
                console.warn(`Failed to parse log entry: ${line.substring(0, 100)}...`);
            }
        }
    }
    
    /**
     * Categorize log entries by type
     */
    categorizeEntry(entry) {
        const { category, action, data } = entry;
        
        switch (category) {
            case 'system':
                this.analyses.systemEvents.push(entry);
                break;
            case 'analysis':
                this.analyses.analysisEvents.push(entry);
                break;
            case 'rotation':
                this.analyses.rotationEvents.push(entry);
                break;
            case 'scalability':
                this.analyses.scalabilityEvents.push(entry);
                break;
            case 'regime':
                this.analyses.regimeChanges.push(entry);
                break;
            case 'error':
                this.analyses.errors.push(entry);
                break;
        }
    }
    
    /**
     * Generate comprehensive analysis report
     */
    generateReport() {
        console.log('\n📊 AUDIT LOG ANALYSIS REPORT');
        console.log('='.repeat(50));
        
        this.generateSystemSummary();
        this.generatePerformanceAnalysis();
        this.generateFeatureRotationAnalysis();
        this.generateScalabilityAnalysis();
        this.generateRegimeChangeAnalysis();
        this.generateErrorAnalysis();
        this.generateRecommendations();
    }
    
    /**
     * System-level summary
     */
    generateSystemSummary() {
        console.log('\n🖥️  SYSTEM SUMMARY');
        console.log('-'.repeat(30));
        
        const totalAnalyses = this.analyses.analysisEvents.filter(e => e.action === 'FULL_ANALYSIS').length;
        const totalRotations = this.analyses.rotationEvents.filter(e => e.action === 'COMBINATION_CHANGED').length;
        const totalErrors = this.analyses.errors.length;
        
        console.log(`Total Risk Analyses: ${totalAnalyses}`);
        console.log(`Feature Rotations: ${totalRotations}`);
        console.log(`System Errors: ${totalErrors}`);
        
        if (totalAnalyses > 0) {
            const avgProcessingTime = this.calculateAverageProcessingTime();
            console.log(`Avg Processing Time: ${avgProcessingTime.toFixed(1)}ms`);
        }
    }
    
    /**
     * Performance analysis of clustering decisions
     */
    generatePerformanceAnalysis() {
        console.log('\n📈 CLUSTERING PERFORMANCE');
        console.log('-'.repeat(30));
        
        const analyses = this.analyses.analysisEvents.filter(e => e.action === 'FULL_ANALYSIS');
        
        if (analyses.length === 0) {
            console.log('No analysis data available.');
            return;
        }
        
        const confidenceScores = analyses.map(a => a.data.output.confidence).filter(c => c !== undefined);
        const clusterQualities = analyses.map(a => a.data.output.cluster?.quality).filter(q => q !== undefined);
        
        if (confidenceScores.length > 0) {
            const avgConfidence = confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length;
            const minConfidence = Math.min(...confidenceScores);
            const maxConfidence = Math.max(...confidenceScores);
            
            console.log(`Confidence Scores:`);
            console.log(`  Average: ${(avgConfidence * 100).toFixed(1)}%`);
            console.log(`  Range: ${(minConfidence * 100).toFixed(1)}% - ${(maxConfidence * 100).toFixed(1)}%`);
        }
        
        if (clusterQualities.length > 0) {
            const avgQuality = clusterQualities.reduce((sum, q) => sum + q, 0) / clusterQualities.length;
            console.log(`Cluster Quality: ${avgQuality.toFixed(3)} (avg)`);
        }
        
        // Approval rate
        const approvedCount = analyses.filter(a => a.data.output.confidence >= 0.5).length;
        const approvalRate = (approvedCount / analyses.length) * 100;
        console.log(`Approval Rate: ${approvalRate.toFixed(1)}% (${approvedCount}/${analyses.length})`);
    }
    
    /**
     * Feature rotation effectiveness analysis
     */
    generateFeatureRotationAnalysis() {
        console.log('\n🔄 FEATURE ROTATION ANALYSIS');
        console.log('-'.repeat(30));
        
        const rotationChanges = this.analyses.rotationEvents.filter(e => e.action === 'COMBINATION_CHANGED');
        const rotationMaintained = this.analyses.rotationEvents.filter(e => e.action === 'COMBINATION_MAINTAINED');
        
        console.log(`Successful Rotations: ${rotationChanges.length}`);
        console.log(`Combinations Maintained: ${rotationMaintained.length}`);
        
        if (rotationChanges.length > 0) {
            console.log('\nRecent Feature Combination Changes:');
            rotationChanges.slice(-5).forEach((change, i) => {
                const { previous, new: newCombo, newScore } = change.data;
                console.log(`  ${i + 1}. ${previous?.slice(0, 3).join(', ')}... → ${newCombo?.slice(0, 3).join(', ')}... (score: ${newScore?.toFixed(3)})`);
            });
        }
        
        // Calculate rotation effectiveness
        if (rotationChanges.length > 0) {
            const scoreImprovements = rotationChanges
                .filter(c => c.data.newScore && c.data.previousScore)
                .map(c => c.data.newScore - c.data.previousScore);
            
            if (scoreImprovements.length > 0) {
                const avgImprovement = scoreImprovements.reduce((sum, imp) => sum + imp, 0) / scoreImprovements.length;
                console.log(`\nAvg Score Improvement: +${avgImprovement.toFixed(3)}`);
            }
        }
    }
    
    /**
     * Scalability analysis
     */
    generateScalabilityAnalysis() {
        console.log('\n📏 SCALABILITY ANALYSIS');
        console.log('-'.repeat(30));
        
        const scaleAnalyses = this.analyses.scalabilityEvents.filter(e => e.action === 'SCALE_ANALYSIS');
        
        if (scaleAnalyses.length === 0) {
            console.log('No scalability data available.');
            return;
        }
        
        const scaleResults = scaleAnalyses.map(s => s.data.output);
        const canScaleCount = scaleResults.filter(r => r.canScale).length;
        const avgMaxScale = scaleResults.reduce((sum, r) => sum + r.maxSafeScale, 0) / scaleResults.length;
        
        console.log(`Scalable Strategies: ${canScaleCount}/${scaleResults.length} (${((canScaleCount / scaleResults.length) * 100).toFixed(1)}%)`);
        console.log(`Average Max Safe Scale: ${avgMaxScale.toFixed(1)}x`);
        
        // Scale distribution
        const scaleDistribution = {};
        scaleResults.forEach(r => {
            const scale = r.maxSafeScale;
            scaleDistribution[scale] = (scaleDistribution[scale] || 0) + 1;
        });
        
        console.log('\nScale Distribution:');
        Object.entries(scaleDistribution)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .forEach(([scale, count]) => {
                const percentage = ((count / scaleResults.length) * 100).toFixed(1);
                console.log(`  ${scale}x: ${count} trades (${percentage}%)`);
            });
    }
    
    /**
     * Regime change detection analysis
     */
    generateRegimeChangeAnalysis() {
        console.log('\n🌊 REGIME CHANGE ANALYSIS');
        console.log('-'.repeat(30));
        
        const regimeChanges = this.analyses.regimeChanges.filter(e => e.action === 'CHANGE_DETECTED');
        
        console.log(`Regime Changes Detected: ${regimeChanges.length}`);
        
        if (regimeChanges.length > 0) {
            console.log('\nRecent Regime Changes:');
            regimeChanges.slice(-3).forEach((change, i) => {
                const { qualityTrend, avgRecentQuality, qualityDrop } = change.data;
                const timestamp = new Date(change.timestamp).toLocaleString();
                console.log(`  ${i + 1}. ${timestamp}`);
                console.log(`     Quality Drop: ${qualityDrop.toFixed(3)}, Trend: ${qualityTrend.toFixed(3)}`);
                console.log(`     Recent Quality: ${avgRecentQuality.toFixed(3)}`);
            });
            
            // Calculate time between regime changes
            if (regimeChanges.length > 1) {
                const timeDiffs = [];
                for (let i = 1; i < regimeChanges.length; i++) {
                    const diff = regimeChanges[i].timestamp - regimeChanges[i - 1].timestamp;
                    timeDiffs.push(diff / (1000 * 60 * 60)); // Convert to hours
                }
                const avgTimeBetween = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
                console.log(`\nAverage Time Between Changes: ${avgTimeBetween.toFixed(1)} hours`);
            }
        }
    }
    
    /**
     * Error analysis
     */
    generateErrorAnalysis() {
        console.log('\n❌ ERROR ANALYSIS');
        console.log('-'.repeat(30));
        
        if (this.analyses.errors.length === 0) {
            console.log('No errors detected. System running smoothly! ✅');
            return;
        }
        
        console.log(`Total Errors: ${this.analyses.errors.length}`);
        
        // Group errors by type
        const errorTypes = {};
        this.analyses.errors.forEach(error => {
            const action = error.action;
            errorTypes[action] = (errorTypes[action] || 0) + 1;
        });
        
        console.log('\nError Breakdown:');
        Object.entries(errorTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
        // Show recent errors
        console.log('\nRecent Errors:');
        this.analyses.errors.slice(-3).forEach((error, i) => {
            const timestamp = new Date(error.timestamp).toLocaleString();
            console.log(`  ${i + 1}. ${timestamp} - ${error.action}`);
            console.log(`     ${error.data.error}`);
        });
    }
    
    /**
     * Generate actionable recommendations
     */
    generateRecommendations() {
        console.log('\n💡 RECOMMENDATIONS');
        console.log('-'.repeat(30));
        
        const recommendations = [];
        
        // Performance recommendations
        const analyses = this.analyses.analysisEvents.filter(e => e.action === 'FULL_ANALYSIS');
        if (analyses.length > 0) {
            const avgConfidence = analyses.reduce((sum, a) => sum + (a.data.output.confidence || 0), 0) / analyses.length;
            
            if (avgConfidence < 0.6) {
                recommendations.push('⚠️  Low average confidence detected. Consider adjusting cluster quality thresholds.');
            }
            
            const avgProcessingTime = this.calculateAverageProcessingTime();
            if (avgProcessingTime > 200) {
                recommendations.push('🐌 High processing times detected. Consider optimizing clustering algorithms.');
            }
        }
        
        // Scalability recommendations
        const scaleAnalyses = this.analyses.scalabilityEvents.filter(e => e.action === 'SCALE_ANALYSIS');
        if (scaleAnalyses.length > 0) {
            const lowScaleCount = scaleAnalyses.filter(s => s.data.output.maxSafeScale <= 2).length;
            const lowScalePercentage = (lowScaleCount / scaleAnalyses.length) * 100;
            
            if (lowScalePercentage > 30) {
                recommendations.push('📉 Many strategies have poor scalability. Review liquidity constraints.');
            }
        }
        
        // Regime change recommendations
        const regimeChanges = this.analyses.regimeChanges.filter(e => e.action === 'CHANGE_DETECTED');
        if (regimeChanges.length > 5) {
            recommendations.push('🌊 Frequent regime changes detected. Consider increasing change detection threshold.');
        }
        
        // Error recommendations
        if (this.analyses.errors.length > 0) {
            recommendations.push('🔧 System errors detected. Review error log for debugging.');
        }
        
        // Feature rotation recommendations
        const rotationChanges = this.analyses.rotationEvents.filter(e => e.action === 'COMBINATION_CHANGED');
        if (rotationChanges.length === 0) {
            recommendations.push('🔄 No feature rotations observed. Verify rotation logic is working.');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('✅ System performing well. No immediate actions needed.');
        }
        
        recommendations.forEach((rec, i) => {
            console.log(`${i + 1}. ${rec}`);
        });
    }
    
    /**
     * Calculate average processing time from analysis events
     */
    calculateAverageProcessingTime() {
        const analyses = this.analyses.analysisEvents.filter(e => e.action === 'FULL_ANALYSIS');
        const processingTimes = analyses
            .map(a => a.data.output.processingTime)
            .filter(t => t !== undefined);
        
        if (processingTimes.length === 0) return 0;
        
        return processingTimes.reduce((sum, t) => sum + t, 0) / processingTimes.length;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const dateString = args[0]; // Optional date filter (YYYY-MM-DD)
    
    console.log('🔍 PRUNED RANGES AUDIT LOG ANALYZER');
    console.log('='.repeat(50));
    
    if (dateString) {
        console.log(`Analyzing logs for date: ${dateString}`);
    } else {
        console.log('Analyzing latest logs...');
    }
    
    const analyzer = new AuditLogAnalyzer();
    await analyzer.analyzeLogs(dateString);
    
    console.log('\n✅ Analysis complete!');
    console.log('\nUsage: node analyzeAuditLogs.js [YYYY-MM-DD]');
}

// Export for programmatic use
module.exports = AuditLogAnalyzer;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}