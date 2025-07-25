#!/usr/bin/env node

/**
 * Quick Analysis Tool - Lightweight summary of pruned ranges decisions
 * Processes large log files efficiently without loading everything into memory
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

class QuickAnalyzer {
    constructor() {
        this.logDir = path.join(__dirname, 'audit_logs');
        this.stats = {
            totalAnalyses: 0,
            approvedCount: 0,
            rejectedCount: 0,
            confidenceSum: 0,
            processingTimeSum: 0,
            methods: {},
            recentDecisions: [],
            errors: 0,
            featureRotations: 0,
            regimeChanges: 0,
            startTime: null,
            endTime: null
        };
    }
    
    async analyzeQuick(dateString = null) {
        const logFiles = this.getLogFiles(dateString);
        
        if (logFiles.length === 0) {
            console.log('❌ No log files found');
            return;
        }
        
        console.log(`🔍 QUICK ANALYSIS - ${logFiles.length} file(s)`);
        console.log('='.repeat(50));
        
        for (const logFile of logFiles) {
            await this.processFileStreaming(logFile);
        }
        
        this.printSummary();
    }
    
    getLogFiles(dateString) {
        const files = fs.readdirSync(this.logDir);
        const logFiles = files.filter(f => f.endsWith('.jsonl'));
        
        if (dateString) {
            return logFiles.filter(f => f.includes(dateString));
        }
        
        // Return latest log file
        return logFiles.slice(-1);
    }
    
    async processFileStreaming(filename) {
        const filepath = path.join(this.logDir, filename);
        const fileStats = fs.statSync(filepath);
        const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
        
        console.log(`📄 Processing ${filename} (${fileSizeMB}MB)...`);
        
        const fileStream = fs.createReadStream(filepath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineCount = 0;
        const startTime = Date.now();
        
        for await (const line of rl) {
            lineCount++;
            
            if (line.trim().length === 0) continue;
            
            try {
                const entry = JSON.parse(line);
                this.processEntry(entry);
                
                // Progress indicator for large files
                if (lineCount % 10000 === 0) {
                    process.stdout.write(`\r   📊 Processed ${lineCount} entries...`);
                }
                
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }
        
        const duration = Date.now() - startTime;
        console.log(`\r   ✅ Processed ${lineCount} entries in ${duration}ms`);
    }
    
    processEntry(entry) {
        const { category, action, data, timestamp } = entry;
        
        // Track time range
        if (!this.stats.startTime || timestamp < this.stats.startTime) {
            this.stats.startTime = timestamp;
        }
        if (!this.stats.endTime || timestamp > this.stats.endTime) {
            this.stats.endTime = timestamp;
        }
        
        // Process key events
        switch (category) {
            case 'analysis':
                if (action === 'FULL_ANALYSIS') {
                    this.processAnalysis(data);
                }
                break;
            case 'rotation':
                if (action === 'COMBINATION_CHANGED') {
                    this.stats.featureRotations++;
                }
                break;
            case 'regime':
                if (action === 'CHANGE_DETECTED') {
                    this.stats.regimeChanges++;
                }
                break;
            case 'error':
                this.stats.errors++;
                break;
        }
    }
    
    processAnalysis(data) {
        const output = data.output;
        if (!output) return;
        
        this.stats.totalAnalyses++;
        
        // Track approval/rejection
        if (output.confidence >= 0.5) {
            this.stats.approvedCount++;
        } else {
            this.stats.rejectedCount++;
        }
        
        // Track confidence and processing time
        if (output.confidence !== undefined) {
            this.stats.confidenceSum += output.confidence;
        }
        
        if (output.processingTime !== undefined) {
            this.stats.processingTimeSum += output.processingTime;
        }
        
        // Track methods
        const method = output.method || 'unknown';
        this.stats.methods[method] = (this.stats.methods[method] || 0) + 1;
        
        // Keep recent decisions (last 10)
        this.stats.recentDecisions.push({
            confidence: output.confidence,
            approved: output.confidence >= 0.5,
            method: method,
            clusterQuality: output.cluster?.quality,
            timestamp: data.timestamp
        });
        
        if (this.stats.recentDecisions.length > 10) {
            this.stats.recentDecisions.shift();
        }
    }
    
    printSummary() {
        console.log('\n📊 QUICK ANALYSIS RESULTS');
        console.log('='.repeat(50));
        
        // Time range
        if (this.stats.startTime && this.stats.endTime) {
            const start = new Date(this.stats.startTime).toLocaleString();
            const end = new Date(this.stats.endTime).toLocaleString();
            const durationHours = ((this.stats.endTime - this.stats.startTime) / (1000 * 60 * 60)).toFixed(1);
            console.log(`📅 Time Range: ${start} → ${end} (${durationHours}h)`);
        }
        
        // Core metrics
        console.log(`\n🎯 CORE METRICS:`);
        console.log(`   Total Analyses: ${this.stats.totalAnalyses}`);
        console.log(`   Approved: ${this.stats.approvedCount} (${this.getPercentage(this.stats.approvedCount, this.stats.totalAnalyses)}%)`);
        console.log(`   Rejected: ${this.stats.rejectedCount} (${this.getPercentage(this.stats.rejectedCount, this.stats.totalAnalyses)}%)`);
        
        if (this.stats.totalAnalyses > 0) {
            const avgConfidence = (this.stats.confidenceSum / this.stats.totalAnalyses * 100).toFixed(1);
            console.log(`   Avg Confidence: ${avgConfidence}%`);
            
            if (this.stats.processingTimeSum > 0) {
                const avgProcessingTime = (this.stats.processingTimeSum / this.stats.totalAnalyses).toFixed(1);
                console.log(`   Avg Processing Time: ${avgProcessingTime}ms`);
            }
        }
        
        // Methods breakdown
        if (Object.keys(this.stats.methods).length > 0) {
            console.log(`\n📋 METHODS USED:`);
            Object.entries(this.stats.methods)
                .sort(([,a], [,b]) => b - a)
                .forEach(([method, count]) => {
                    const percentage = this.getPercentage(count, this.stats.totalAnalyses);
                    console.log(`   ${method}: ${count} (${percentage}%)`);
                });
        }
        
        // Activity summary
        console.log(`\n🔄 ACTIVITY SUMMARY:`);
        console.log(`   Feature Rotations: ${this.stats.featureRotations}`);
        console.log(`   Regime Changes: ${this.stats.regimeChanges}`);
        console.log(`   Errors: ${this.stats.errors}`);
        
        // Recent decisions
        if (this.stats.recentDecisions.length > 0) {
            console.log(`\n📈 RECENT DECISIONS (Last ${this.stats.recentDecisions.length}):`);
            this.stats.recentDecisions.slice(-5).forEach((decision, i) => {
                const status = decision.approved ? '✅' : '❌';
                const confidence = (decision.confidence * 100).toFixed(1);
                const quality = decision.clusterQuality ? ` | Q:${decision.clusterQuality.toFixed(2)}` : '';
                const time = new Date(decision.timestamp).toLocaleTimeString();
                console.log(`   ${status} ${confidence}% conf | ${decision.method}${quality} | ${time}`);
            });
        }
        
        // Health assessment
        console.log(`\n🏥 SYSTEM HEALTH:`);
        const approvalRate = this.getPercentage(this.stats.approvedCount, this.stats.totalAnalyses);
        const avgConfidence = this.stats.totalAnalyses > 0 ? (this.stats.confidenceSum / this.stats.totalAnalyses * 100) : 0;
        
        let healthStatus = '🟢 HEALTHY';
        const issues = [];
        
        if (approvalRate < 30) {
            healthStatus = '🔴 CRITICAL';
            issues.push('Very low approval rate');
        } else if (approvalRate < 50) {
            healthStatus = '🟡 WARNING';
            issues.push('Low approval rate');
        }
        
        if (avgConfidence < 40) {
            healthStatus = '🔴 CRITICAL';
            issues.push('Very low confidence');
        } else if (avgConfidence < 60) {
            if (healthStatus === '🟢 HEALTHY') healthStatus = '🟡 WARNING';
            issues.push('Low confidence');
        }
        
        if (this.stats.errors > this.stats.totalAnalyses * 0.1) {
            healthStatus = '🔴 CRITICAL';
            issues.push('High error rate');
        }
        
        console.log(`   Status: ${healthStatus}`);
        if (issues.length > 0) {
            console.log(`   Issues: ${issues.join(', ')}`);
        }
        
        console.log('\n✅ Quick analysis complete!');
        console.log(`💡 For detailed analysis: node analyzeAuditLogs.js`);
    }
    
    getPercentage(part, total) {
        return total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const dateString = args[0]; // Optional date filter
    
    console.log('⚡ PRUNED RANGES QUICK ANALYZER');
    console.log('='.repeat(50));
    
    const analyzer = new QuickAnalyzer();
    await analyzer.analyzeQuick(dateString);
}

// Export for programmatic use
module.exports = QuickAnalyzer;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}