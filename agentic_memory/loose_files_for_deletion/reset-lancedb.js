#!/usr/bin/env node

/**
 * LanceDB Reset Script - Safely removes corrupted database
 * This script completely removes the corrupted LanceDB and initializes a fresh one
 */

const fs = require('fs').promises;
const path = require('path');
const lancedb = require('vectordb');

async function initializeFreshDatabase() {
    const dataDir = path.join(__dirname, 'data');
    const vectorsDir = path.join(dataDir, 'vectors');
    const dbPath = vectorsDir;
    const tableName = 'feature_vectors';
    
    try {
        console.log('📊 Connecting to fresh LanceDB...');
        const db = await lancedb.connect(dbPath);
        
        // Create schema record with timeframe support - matches vectorStore.js schema
        const sampleData = [{
            id: 'schema_record_timeframe',
            timestamp: new Date(),
            entrySignalId: 'schema_record',
            instrument: 'SCHEMA',
            entryType: 'SCHEMA_RECORD',
            direction: 'long',
            sessionId: 'INIT-SESSION', // Session ID for backtest separation
            timeframeMinutes: 1, // NEW: Timeframe in minutes (1, 5, 15, etc.)
            quantity: 1, // NEW: Position size (number of contracts)
            // Feature arrays for schema creation with all 74 real feature names
            features: new Array(100).fill(0), // Support up to 100 features
            featuresJson: JSON.stringify({
                "atr_14": 0, "atr_percentage": 0, "bb_lower": 0, "bb_middle": 0, "bb_upper": 0, "bb_width": 0,
                "body_ratio": 0, "body_size": 0, "close_price": 0, "close_to_high": 0, "close_to_low": 0,
                "day_of_week": 0, "distance_to_high_20": 0, "distance_to_low_20": 0, "ema_21": 0, "ema_21_50_diff": 0,
                "ema_50": 0, "ema_9": 0, "ema_9_21_diff": 0, "high_low_ratio": 0, "high_price": 0, "higher_high": 0,
                "hour_of_day": 0, "inside_bar": 0, "is_bearish_candle": 0, "is_bullish_candle": 0, "is_doji": 0,
                "low_price": 0, "lower_low": 0, "lower_wick": 0, "lower_wick_ratio": 0, "macd": 0, "macd_histogram": 0,
                "macd_signal": 0, "minute_of_hour": 0, "momentum_10": 0, "momentum_10_normalized": 0, "momentum_5": 0,
                "momentum_5_normalized": 0, "open_price": 0, "pattern_failed_breakout": 0, "pattern_grinder": 0,
                "pattern_steady_climb": 0, "pattern_v_recovery": 0, "pattern_whipsaw": 0, "position_in_range_20": 0,
                "price_change_1": 0, "price_change_10": 0, "price_change_5": 0, "price_to_bb_lower": 0,
                "price_to_bb_upper": 0, "price_to_ema21": 0, "price_to_ema9": 0, "rsi_14": 0, "rsi_overbought": 0,
                "rsi_oversold": 0, "spread": 0, "spread_percentage": 0, "traj_max_drawdown_norm": 0,
                "traj_recovery_speed_norm": 0, "traj_trend_strength_norm": 0, "upper_wick": 0, "upper_wick_ratio": 0,
                "volatility_20": 0, "volume": 0, "volume_delta": 0, "volume_ratio_10": 0, "volume_ratio_5": 0,
                "volume_sma_10": 0, "volume_sma_20": 0, "volume_sma_5": 0, "volume_spike_ratio": 0, "volume_trend_5": 0,
                "wick_imbalance": 0
            }),
            featureNames: [
                "atr_14", "atr_percentage", "bb_lower", "bb_middle", "bb_upper", "bb_width",
                "body_ratio", "body_size", "close_price", "close_to_high", "close_to_low",
                "day_of_week", "distance_to_high_20", "distance_to_low_20", "ema_21", "ema_21_50_diff",
                "ema_50", "ema_9", "ema_9_21_diff", "high_low_ratio", "high_price", "higher_high",
                "hour_of_day", "inside_bar", "is_bearish_candle", "is_bullish_candle", "is_doji",
                "low_price", "lower_low", "lower_wick", "lower_wick_ratio", "macd", "macd_histogram",
                "macd_signal", "minute_of_hour", "momentum_10", "momentum_10_normalized", "momentum_5",
                "momentum_5_normalized", "open_price", "pattern_failed_breakout", "pattern_grinder",
                "pattern_steady_climb", "pattern_v_recovery", "pattern_whipsaw", "position_in_range_20",
                "price_change_1", "price_change_10", "price_change_5", "price_to_bb_lower",
                "price_to_bb_upper", "price_to_ema21", "price_to_ema9", "rsi_14", "rsi_overbought",
                "rsi_oversold", "spread", "spread_percentage", "traj_max_drawdown_norm",
                "traj_recovery_speed_norm", "traj_trend_strength_norm", "upper_wick", "upper_wick_ratio",
                "volatility_20", "volume", "volume_delta", "volume_ratio_10", "volume_ratio_5",
                "volume_sma_10", "volume_sma_20", "volume_sma_5", "volume_spike_ratio", "volume_trend_5",
                "wick_imbalance"
            ],
            featureCount: 74,
            recordType: 'UNIFIED',
            status: 'UNIFIED',
            // Risk and outcome data
            stopLoss: 10.0,
            takeProfit: 20.0,
            virtualStop: 15.0,
            pnl: 0.0,
            pnlPoints: 0.0,
            pnlPerContract: 0.0,
            pnlPointsPerContract: 0.0,
            holdingBars: 0,
            exitReason: 'init',
            maxProfit: 0.0,
            maxLoss: 0.0,
            wasGoodExit: false,
            // Trajectory data
            profitByBar: new Array(50).fill(0),
            profitByBarJson: '{}',
            trajectoryBars: 0
        }];
        
        console.log('🔨 Creating table with timeframe schema...');
        const table = await db.createTable(tableName, sampleData);
        
        // Keep sample data as permanent schema record
        console.log('📌 Keeping one record to maintain schema...');
        
        console.log('✅ Fresh LanceDB initialized with timeframe and position size support');
        console.log(`📋 Schema includes: timeframeMinutes and quantity fields`);
        console.log(`📊 Enhanced with normalized PnL metrics (pnlPerContract, pnlPointsPerContract)`);
        console.log(`📊 Database contains 1 schema record to maintain structure`);
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        throw error;
    }
}

async function resetLanceDB() {
    console.log('🧹 LANCEDB CORRUPTION RECOVERY');
    console.log('═'.repeat(50));
    
    const dataDir = path.join(__dirname, 'data');
    const vectorsDir = path.join(dataDir, 'vectors');
    const lanceDir = path.join(vectorsDir, 'feature_vectors.lance');
    
    try {
        console.log('🔍 Checking corruption status...');
        
        // Check if corrupted directory exists
        const exists = await fs.access(lanceDir).then(() => true).catch(() => false);
        if (exists) {
            console.log('❌ Found corrupted LanceDB directory');
            console.log('🗑️  Removing corrupted database...');
            
            // Remove the entire corrupted database
            await removeDirectory(lanceDir);
            console.log('✅ Corrupted database removed');
        } else {
            console.log('ℹ️  No existing database found');
        }
        
        // Ensure directories exist
        console.log('📁 Creating fresh directory structure...');
        await ensureDirectoryExists(dataDir);
        await ensureDirectoryExists(vectorsDir);
        
        console.log('✅ Fresh LanceDB environment ready');
        
        // Initialize fresh LanceDB with timeframe support
        console.log('🔧 Initializing fresh LanceDB with timeframe support...');
        await initializeFreshDatabase();
        
        console.log('\n🚀 Database ready for timeframe-aware trading data!');
        console.log('✅ Storage Agent can now collect trades with timeframe information');
        
    } catch (error) {
        console.error('❌ Reset failed:', error.message);
        console.log('\n🛠️  Manual recovery steps:');
        console.log('1. Stop the Storage Agent');
        console.log('2. Delete: storage-agent/data/vectors/');
        console.log('3. Restart the Storage Agent');
        process.exit(1);
    }
}

async function removeDirectory(dirPath) {
    try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
            const files = await fs.readdir(dirPath);
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const fileStat = await fs.stat(filePath);
                
                if (fileStat.isDirectory()) {
                    await removeDirectory(filePath);
                } else {
                    await fs.unlink(filePath);
                }
            }
            
            await fs.rmdir(dirPath);
        } else {
            await fs.unlink(dirPath);
        }
    } catch (error) {
        // Directory might not exist, that's ok
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function ensureDirectoryExists(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

// Run the reset
resetLanceDB();