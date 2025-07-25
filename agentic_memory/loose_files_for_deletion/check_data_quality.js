#!/usr/bin/env node

/**
 * Quick data quality check without external dependencies
 */

const fs = require('fs');
const path = require('path');

function analyzeTrainingFile(filename) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Analyzing: ${filename}`);
    console.log('='.repeat(50));
    
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    
    if (!data.data) {
        console.log('❌ Missing data structure');
        return;
    }
    
    const { features, pnl_targets, trajectory_targets, risk_targets } = data.data;
    
    console.log(`\n📊 Data Shape:`);
    console.log(`  Features: ${features.length} x ${features[0]?.length || 0}`);
    console.log(`  PnL targets: ${pnl_targets.length}`);
    console.log(`  Trajectory targets: ${trajectory_targets.length} x ${trajectory_targets[0]?.length || 0}`);
    console.log(`  Risk targets: ${risk_targets.length} x ${risk_targets[0]?.length || 0}`);
    
    // PnL Analysis
    const pnlStats = {
        min: Math.min(...pnl_targets),
        max: Math.max(...pnl_targets),
        sum: pnl_targets.reduce((a, b) => a + b, 0),
        count: pnl_targets.length
    };
    pnlStats.mean = pnlStats.sum / pnlStats.count;
    
    // Calculate variance manually
    const variance = pnl_targets.reduce((sum, val) => sum + Math.pow(val - pnlStats.mean, 2), 0) / pnl_targets.length;
    pnlStats.std = Math.sqrt(variance);
    
    console.log(`\n💰 PnL Analysis:`);
    console.log(`  Mean: $${pnlStats.mean.toFixed(2)}`);
    console.log(`  Std: $${pnlStats.std.toFixed(2)}`);
    console.log(`  Min: $${pnlStats.min.toFixed(2)}`);
    console.log(`  Max: $${pnlStats.max.toFixed(2)}`);
    console.log(`  Variance: ${variance.toFixed(6)}`);
    
    // Count unique values
    const uniquePnls = [...new Set(pnl_targets)];
    console.log(`  Unique values: ${uniquePnls.length}`);
    
    // Count winners/losers
    const winners = pnl_targets.filter(p => p > 0).length;
    const losers = pnl_targets.filter(p => p < 0).length;
    const breakeven = pnl_targets.filter(p => Math.abs(p) < 0.01).length;
    
    console.log(`  Winners: ${winners} (${(winners/pnl_targets.length*100).toFixed(1)}%)`);
    console.log(`  Losers: ${losers} (${(losers/pnl_targets.length*100).toFixed(1)}%)`);
    console.log(`  Breakeven: ${breakeven} (${(breakeven/pnl_targets.length*100).toFixed(1)}%)`);
    
    // Show some actual values
    console.log(`  Sample PnLs: [${pnl_targets.slice(0, 10).map(p => p.toFixed(1)).join(', ')}]`);
    
    // Risk analysis
    const slValues = risk_targets.map(r => r[0]);
    const tpValues = risk_targets.map(r => r[1]);
    const uniqueSL = [...new Set(slValues)];
    const uniqueTP = [...new Set(tpValues)];
    
    console.log(`\n🎯 Risk Analysis:`);
    console.log(`  SL range: [${Math.min(...slValues).toFixed(0)}, ${Math.max(...slValues).toFixed(0)}]`);
    console.log(`  TP range: [${Math.min(...tpValues).toFixed(0)}, ${Math.max(...tpValues).toFixed(0)}]`);
    console.log(`  Unique SL values: ${uniqueSL.length}`);
    console.log(`  Unique TP values: ${uniqueTP.length}`);
    
    // Feature variance check
    console.log(`\n🔍 Feature Analysis:`);
    let zeroVarFeatures = 0;
    for (let i = 0; i < features[0].length; i++) {
        const values = features.map(f => f[i]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (Math.abs(max - min) < 1e-10) {
            zeroVarFeatures++;
        }
    }
    console.log(`  Zero variance features: ${zeroVarFeatures}/${features[0].length}`);
    
    // Trajectory analysis
    if (trajectory_targets.length > 0 && trajectory_targets[0].length > 0) {
        const finalValues = trajectory_targets.map(t => t[t.length - 1]);
        const trajMean = finalValues.reduce((a, b) => a + b, 0) / finalValues.length;
        const trajVar = finalValues.reduce((sum, val) => sum + Math.pow(val - trajMean, 2), 0) / finalValues.length;
        
        console.log(`\n📈 Trajectory Analysis:`);
        console.log(`  Trajectory length: ${trajectory_targets[0].length} bars`);
        console.log(`  Final values mean: $${trajMean.toFixed(2)}`);
        console.log(`  Final values std: $${Math.sqrt(trajVar).toFixed(2)}`);
        
        // Check if trajectory final matches PnL
        const matches = trajectory_targets.filter((traj, i) => Math.abs(traj[traj.length - 1] - pnl_targets[i]) < 0.01).length;
        console.log(`  Trajectory-PnL matches: ${matches}/${trajectory_targets.length} (${(matches/trajectory_targets.length*100).toFixed(1)}%)`);
    }
    
    // Quality warnings
    console.log(`\n⚠️  Quality Check:`);
    const warnings = [];
    
    if (variance < 1e-6) warnings.push("❌ CRITICAL: Zero PnL variance");
    if (breakeven > pnl_targets.length * 0.8) warnings.push("❌ CRITICAL: >80% breakeven trades");
    if (uniquePnls.length < 5) warnings.push("⚠️  Very few unique PnL values");
    if (uniqueSL.length === 1) warnings.push("⚠️  All stop losses identical");
    if (uniqueTP.length === 1) warnings.push("⚠️  All take profits identical");
    if (zeroVarFeatures > features[0].length * 0.3) warnings.push("⚠️  >30% features have zero variance");
    
    if (warnings.length === 0) {
        console.log("  ✅ No major issues detected!");
    } else {
        warnings.forEach(w => console.log(`  ${w}`));
    }
    
    return {
        variance: variance,
        unique_pnls: uniquePnls.length,
        warnings: warnings.length
    };
}

// Main execution
console.log('🔍 Training Data Quality Check');
console.log('='.repeat(50));

const trainingDir = './training_data';
const files = ['MGC_long_training.json', 'MGC_short_training.json'];

const results = [];
for (const file of files) {
    const filepath = path.join(trainingDir, file);
    if (fs.existsSync(filepath)) {
        const result = analyzeTrainingFile(filepath);
        results.push({ file, ...result });
    } else {
        console.log(`❌ File not found: ${file}`);
    }
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log('📊 SUMMARY');
console.log('='.repeat(50));

const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0);
const zeroVarFiles = results.filter(r => r.variance < 1e-6).length;

console.log(`Files analyzed: ${results.length}`);
console.log(`Files with zero PnL variance: ${zeroVarFiles}`);
console.log(`Total warnings: ${totalWarnings}`);

if (zeroVarFiles === 0 && totalWarnings < 5) {
    console.log(`\n✅ Data looks good for training!`);
} else if (zeroVarFiles > 0) {
    console.log(`\n❌ CRITICAL: Some files still have zero variance!`);
} else {
    console.log(`\n⚠️  Some minor issues detected, but training should work.`);
}