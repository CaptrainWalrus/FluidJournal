#!/usr/bin/env node

/**
 * Initialize LanceDB with proper schema
 * Run this after reset-lancedb.js to ensure database is properly initialized
 */

const path = require('path');

async function initializeDatabase() {
    console.log('🚀 Initializing LanceDB with proper schema...');
    
    try {
        // Import vectorStore (it's a singleton, not a class)
        const vectorStore = require('./src/vectorStore');
        
        // Initialize connection
        await vectorStore.initialize();
        console.log('✅ Connected to LanceDB');
        
        // Check current status
        const stats = await vectorStore.getStats();
        console.log(`📊 Current vectors in database: ${stats.totalVectors}`);
        
        if (stats.totalVectors === 0) {
            console.log('📝 Database is empty, creating initialization record...');
            
            // Create a comprehensive dummy record with all fields including profitByBar
            const initRecord = {
                entrySignalId: 'INIT_SCHEMA_' + Date.now(),
                instrument: 'SCHEMA',
                timestamp: Date.now(),
                direction: 'long',
                entryType: 'SCHEMA_INIT',
                recordType: 'UNIFIED',
                status: 'UNIFIED',
                features: {
                    feature1: 0.5,
                    feature2: 0.3,
                    feature3: 0.7,
                    dummy: 0
                },
                outcome: {
                    pnl: 0,
                    pnlPoints: 0,
                    holdingBars: 1,
                    exitReason: 'SCHEMA_INITIALIZATION',
                    maxProfit: 0,
                    maxLoss: 0,
                    wasGoodExit: true,
                    // Include profitByBar with proper structure
                    profitByBar: {
                        "0": 0,
                        "1": 0.5,
                        "2": 1.0,
                        "3": 0.8,
                        "4": 0.3
                    }
                },
                riskUsed: {
                    stopLoss: 10,
                    takeProfit: 20,
                    virtualStop: 15
                }
            };
            
            // Store the initialization record
            const vectorId = await vectorStore.storeVector(initRecord);
            console.log(`✅ Created initialization record with ID: ${vectorId}`);
            
            // Verify it was stored
            const newStats = await vectorStore.getStats();
            console.log(`📊 Vectors after initialization: ${newStats.totalVectors}`);
            
            // Optional: Delete the init record
            const deleteInit = process.argv.includes('--delete-init');
            if (deleteInit) {
                console.log('🗑️  Removing initialization record...');
                await vectorStore.deleteVector(vectorId);
                console.log('✅ Initialization record removed');
            } else {
                console.log('ℹ️  Initialization record kept (use --delete-init to remove)');
            }
        } else {
            console.log('ℹ️  Database already contains vectors, no initialization needed');
        }
        
        // Close connection
        await vectorStore.close();
        console.log('✅ Database initialization complete!');
        
    } catch (error) {
        console.error('❌ Initialization failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run initialization
initializeDatabase(); 