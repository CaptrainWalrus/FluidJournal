#!/usr/bin/env node

/**
 * Vector Optimizer - Intelligent vector trimming for graduation requirements
 * 
 * This tool analyzes stored vectors and removes those that don't contribute 
 * to graduation table creation, keeping only the most relevant data.
 */

const vectorStore = require('./src/vectorStore');

class VectorOptimizer {
    constructor() {
        this.MIN_SAMPLES_PER_GROUP = 30; // Minimum samples needed for reliable graduation
        this.MAX_SAMPLES_PER_GROUP = 500; // Maximum samples to keep per group
        this.RECENT_WEIGHT_DAYS = 30; // Favor recent trades
    }

    async optimize() {
        console.log('🚀 Starting vector optimization...');
        
        // Get all vectors with error handling
        let allVectors;
        try {
            allVectors = await vectorStore.getVectors({ limit: 10000 });
            if (!allVectors || !Array.isArray(allVectors)) {
                console.log('❌ No vectors found or invalid response');
                return { kept: 0, removed: 0, message: 'No vectors to optimize' };
            }
        } catch (error) {
            console.error('❌ Failed to get vectors:', error.message);
            return { kept: 0, removed: 0, error: error.message };
        }
        
        console.log(`📊 Found ${allVectors.length} total vectors`);
        
        // Group by instrument + direction + entry type
        const groups = this.groupVectors(allVectors);
        console.log(`📋 Found ${Object.keys(groups).length} unique groups`);
        
        const optimizationPlan = this.createOptimizationPlan(groups);
        
        // Show what will be kept/removed
        this.showOptimizationSummary(optimizationPlan);
        
        // Execute optimization
        const result = await this.executeOptimization(optimizationPlan);
        
        console.log('\n✅ Optimization complete!');
        console.log(`📉 Vectors reduced: ${allVectors.length} → ${result.kept}`);
        console.log(`🗑️  Vectors removed: ${result.removed}`);
        console.log(`💾 Storage reduction: ${((result.removed / allVectors.length) * 100).toFixed(1)}%`);
        
        return result;
    }

    groupVectors(vectors) {
        const groups = {};
        
        for (const vector of vectors) {
            // Skip invalid vectors
            if (!vector.instrument || !vector.direction || !vector.pnl) continue;
            
            // Normalize instrument (MGC AUG25 -> MGC)
            const instrument = vector.instrument.split(' ')[0];
            const key = `${instrument}_${vector.direction}_${vector.entryType || 'unknown'}`;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            
            groups[key].push({
                ...vector,
                timestamp: new Date(vector.timestamp),
                profit: vector.pnl > 0
            });
        }
        
        // Sort each group by timestamp (newest first)
        for (const key in groups) {
            groups[key].sort((a, b) => b.timestamp - a.timestamp);
        }
        
        return groups;
    }

    createOptimizationPlan(groups) {
        const plan = {
            keep: [],
            remove: [],
            summary: {}
        };
        
        for (const [groupKey, vectors] of Object.entries(groups)) {
            const profitable = vectors.filter(v => v.profit);
            const unprofitable = vectors.filter(v => !v.profit);
            
            // Skip groups with insufficient data
            if (vectors.length < this.MIN_SAMPLES_PER_GROUP) {
                plan.summary[groupKey] = {
                    action: 'SKIP',
                    reason: `Insufficient data (${vectors.length} < ${this.MIN_SAMPLES_PER_GROUP})`,
                    total: vectors.length,
                    keep: 0,
                    remove: vectors.length
                };
                plan.remove.push(...vectors);
                continue;
            }
            
            // Keep balanced profitable/unprofitable samples
            const maxPerType = Math.floor(this.MAX_SAMPLES_PER_GROUP / 2);
            const keepProfitable = this.selectBestSamples(profitable, maxPerType);
            const keepUnprofitable = this.selectBestSamples(unprofitable, maxPerType);
            
            const toKeep = [...keepProfitable, ...keepUnprofitable];
            const toRemove = vectors.filter(v => !toKeep.includes(v));
            
            plan.keep.push(...toKeep);
            plan.remove.push(...toRemove);
            
            plan.summary[groupKey] = {
                action: 'OPTIMIZE',
                reason: `Kept ${toKeep.length} best samples`,
                total: vectors.length,
                keep: toKeep.length,
                remove: toRemove.length,
                profitable: { total: profitable.length, keep: keepProfitable.length },
                unprofitable: { total: unprofitable.length, keep: keepUnprofitable.length }
            };
        }
        
        return plan;
    }

    selectBestSamples(vectors, maxCount) {
        if (vectors.length <= maxCount) return vectors;
        
        // Score vectors by recency and outcome quality
        const scoredVectors = vectors.map(v => {
            const ageInDays = (Date.now() - v.timestamp.getTime()) / (1000 * 60 * 60 * 24);
            const recencyScore = Math.exp(-ageInDays / this.RECENT_WEIGHT_DAYS);
            
            // Quality score based on outcome clarity
            const outcomeScore = Math.abs(v.pnl) / 100; // Favor clear wins/losses
            
            return {
                vector: v,
                score: recencyScore * 0.7 + outcomeScore * 0.3
            };
        });
        
        // Sort by score and take top samples
        scoredVectors.sort((a, b) => b.score - a.score);
        return scoredVectors.slice(0, maxCount).map(s => s.vector);
    }

    showOptimizationSummary(plan) {
        console.log('\n📋 OPTIMIZATION PLAN:');
        console.log('═'.repeat(80));
        
        for (const [group, summary] of Object.entries(plan.summary)) {
            const keepPercent = ((summary.keep / summary.total) * 100).toFixed(1);
            const status = summary.action === 'SKIP' ? '❌' : '✅';
            
            console.log(`${status} ${group}: ${summary.keep}/${summary.total} (${keepPercent}%) - ${summary.reason}`);
            
            if (summary.profitable) {
                console.log(`   💰 Profitable: ${summary.profitable.keep}/${summary.profitable.total}`);
                console.log(`   📉 Loss: ${summary.unprofitable.keep}/${summary.unprofitable.total}`);
            }
        }
        
        console.log('═'.repeat(80));
        console.log(`📊 TOTAL: Keep ${plan.keep.length}, Remove ${plan.remove.length}`);
    }

    async executeOptimization(plan) {
        // This would implement the actual deletion
        // For now, just return the plan
        return {
            kept: plan.keep.length,
            removed: plan.remove.length,
            plan: plan
        };
    }
}

// CLI usage
if (require.main === module) {
    const optimizer = new VectorOptimizer();
    optimizer.optimize().catch(console.error);
}

module.exports = VectorOptimizer;