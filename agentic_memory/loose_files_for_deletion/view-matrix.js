#!/usr/bin/env node

/**
 * Matrix Viewer for Agentic Memory Storage
 * View and analyze the stored feature vectors
 */

const lancedb = require('vectordb');
const fs = require('fs').promises;
const path = require('path');

const DB_PATH = './data/vectors';
const TABLE_NAME = 'feature_vectors';

// Feature names for reference
const FEATURE_NAMES = [
    'price_change_pct_1', 'price_change_pct_5', 'momentum_5', 'volume_spike_3bar',
    'volume_ma_ratio', 'rsi', 'bb_position', 'bb_width', 'atr_pct', 'ema_spread_pct',
    'ema9_slope', 'ema9_distance_pct', 'price_momentum_1min', 'volume_vs_ma_pct',
    'buying_pressure', 'selling_pressure', 'range_expansion', 'body_ratio',
    'upper_wick_ratio', 'lower_wick_ratio'
];

async function viewMatrix() {
    try {
        console.log('🔍 Agentic Memory Matrix Viewer');
        console.log('=' .repeat(50));
        
        // Connect to LanceDB
        const db = await lancedb.connect(DB_PATH);
        const table = await db.openTable(TABLE_NAME);
        
        // Get all vectors
        console.log('📊 Loading vectors...');
        const vectors = await table.filter('id IS NOT NULL').limit(1000).execute();
        
        if (vectors.length === 0) {
            console.log('❌ No vectors found in storage');
            return;
        }
        
        console.log(`✅ Found ${vectors.length} vectors\n`);
        
        // Summary statistics
        console.log('📈 SUMMARY STATISTICS');
        console.log('-'.repeat(30));
        
        const instruments = {};
        const entryTypes = {};
        const directions = {};
        let totalPnl = 0;
        let wins = 0;
        let losses = 0;
        
        vectors.forEach(v => {
            instruments[v.instrument] = (instruments[v.instrument] || 0) + 1;
            entryTypes[v.entryType] = (entryTypes[v.entryType] || 0) + 1;
            directions[v.direction] = (directions[v.direction] || 0) + 1;
            
            totalPnl += v.pnl || 0;
            if (v.pnl > 0) wins++;
            else if (v.pnl < 0) losses++;
        });
        
        console.log(`Total Vectors: ${vectors.length}`);
        console.log(`Instruments: ${Object.keys(instruments).map(k => `${k}(${instruments[k]})`).join(', ')}`);
        console.log(`Entry Types: ${Object.keys(entryTypes).map(k => `${k}(${entryTypes[k]})`).join(', ')}`);
        console.log(`Directions: ${Object.keys(directions).map(k => `${k}(${directions[k]})`).join(', ')}`);
        console.log(`Win Rate: ${(wins/(wins+losses)*100).toFixed(1)}% (${wins}W/${losses}L)`);
        console.log(`Total PnL: $${totalPnl.toFixed(2)}`);
        console.log(`Avg PnL: $${(totalPnl/vectors.length).toFixed(2)}\n`);
        
        // Recent vectors sample
        console.log('🔍 RECENT VECTORS SAMPLE');
        console.log('-'.repeat(30));
        
        const recent = vectors.slice(-5);
        recent.forEach((v, i) => {
            console.log(`Vector ${vectors.length - 5 + i + 1}:`);
            console.log(`  Entry: ${v.entrySignalId} | ${v.direction} ${v.instrument} | ${v.entryType}`);
            console.log(`  PnL: $${(v.pnl || 0).toFixed(2)} | Exit: ${v.exitReason} | Good: ${v.wasGoodExit}`);
            console.log(`  Risk: SL=${v.stopLoss} TP=${v.takeProfit} | Bars: ${v.holdingBars}`);
            console.log('');
        });
        
        // Feature correlation analysis
        console.log('🧮 FEATURE ANALYSIS');
        console.log('-'.repeat(30));
        
        // Calculate feature statistics
        const featureStats = {};
        FEATURE_NAMES.forEach((name, idx) => {
            const values = vectors.map(v => v.features[idx] || 0).filter(x => !isNaN(x));
            if (values.length > 0) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
                featureStats[name] = {
                    avg: avg,
                    std: Math.sqrt(variance),
                    min: Math.min(...values),
                    max: Math.max(...values),
                    count: values.length
                };
            }
        });
        
        // Show top varying features
        const sortedFeatures = Object.entries(featureStats)
            .sort((a, b) => Math.abs(b[1].std) - Math.abs(a[1].std))
            .slice(0, 10);
            
        console.log('Top 10 Most Variable Features:');
        sortedFeatures.forEach(([name, stats], i) => {
            console.log(`${i+1}. ${name}: μ=${stats.avg.toFixed(4)} σ=${stats.std.toFixed(4)} range=[${stats.min.toFixed(3)}, ${stats.max.toFixed(3)}]`);
        });
        
        console.log('\n💡 TIP: Use --export to save matrix to CSV file');
        console.log('💡 TIP: Use --similarity <vector_id> to find similar patterns');
        
    } catch (error) {
        console.error('❌ Error viewing matrix:', error.message);
        if (error.message.includes('does not exist')) {
            console.log('💡 The vector database hasn\'t been created yet. Start some trading to populate it.');
        }
    }
}

async function exportToCSV() {
    try {
        console.log('📤 Exporting matrix to CSV...');
        
        const db = await lancedb.connect(DB_PATH);
        const table = await db.openTable(TABLE_NAME);
        const vectors = await table.filter('id IS NOT NULL').limit(10000).execute();
        
        if (vectors.length === 0) {
            console.log('❌ No vectors to export');
            return;
        }
        
        // Create CSV header
        const header = [
            'id', 'timestamp', 'entrySignalId', 'instrument', 'entryType', 'direction',
            ...FEATURE_NAMES,
            'stopLoss', 'takeProfit', 'virtualStop', 'pnl', 'pnlPoints', 'holdingBars',
            'exitReason', 'maxProfit', 'maxLoss', 'wasGoodExit'
        ].join(',');
        
        // Create CSV rows
        const rows = vectors.map(v => {
            const features = v.features || new Array(20).fill(0);
            return [
                v.id, v.timestamp, v.entrySignalId, v.instrument, v.entryType, v.direction,
                ...features,
                v.stopLoss, v.takeProfit, v.virtualStop, v.pnl, v.pnlPoints, v.holdingBars,
                v.exitReason, v.maxProfit, v.maxLoss, v.wasGoodExit
            ].join(',');
        });
        
        const csv = [header, ...rows].join('\n');
        
        const filename = `agentic_memory_matrix_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
        await fs.writeFile(filename, csv);
        
        console.log(`✅ Exported ${vectors.length} vectors to ${filename}`);
        
    } catch (error) {
        console.error('❌ Export failed:', error.message);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--export')) {
    exportToCSV();
} else {
    viewMatrix();
}