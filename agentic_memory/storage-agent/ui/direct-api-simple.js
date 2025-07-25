#!/usr/bin/env node

/**
 * Simplified Direct LanceDB API - Reads directly from LanceDB files
 * Uses basic LanceDB operations that work with the current API
 */

const express = require('express');
const lancedb = require('vectordb');
const path = require('path');
const cors = require('cors');

class SimpleLanceDBAPI {
    constructor() {
        this.app = express();
        this.db = null;
        this.table = null;
        this.port = 3018;
        this.dbPath = '../data/vectors';
        this.tableName = 'feature_vectors';
    }

    async initialize() {
        try {
            console.log('🔌 Initializing Simple LanceDB API...');
            
            // Setup express
            this.app.use(cors());
            this.app.use(express.json());
            this.app.use(express.static('./'));
            
            // Connect to LanceDB
            const fullDbPath = path.resolve(__dirname, this.dbPath);
            console.log('📂 Connecting to LanceDB at:', fullDbPath);
            
            this.db = await lancedb.connect(fullDbPath);
            this.table = await this.db.openTable(this.tableName);
            
            console.log('✅ Connected to LanceDB successfully');
            
            // Test the connection
            try {
                const rowCount = await this.table.countRows();
                console.log(`✅ Table contains ${rowCount} rows`);
            } catch (e) {
                console.warn('⚠️ Could not count rows:', e.message);
            }
            
            this.setupRoutes();
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                service: 'simple-lancedb-api',
                timestamp: new Date().toISOString()
            });
        });

        // Get vectors using simple search
        this.app.get('/api/vectors', async (req, res) => {
            try {
                const { limit = 1000 } = req.query;
                console.log(`📊 Fetching ${limit} vectors...`);
                
                // Use a different approach - try to create an index first or use scan
                let results;
                try {
                    // Try search with featureArray column
                    const dummyVector = new Array(100).fill(0.0);
                    results = await this.table
                        .search(dummyVector)
                        .column('featureArray')  // Specify the vector column
                        .limit(parseInt(limit))
                        .execute();
                } catch (searchError) {
                    console.log('Search failed, using query approach:', searchError.message);
                    // Fallback to using a query without search
                    try {
                        // Create a simple filter that matches all records
                        results = await this.table
                            .filter("pnl IS NOT NULL OR pnl IS NULL")  // Matches everything
                            .limit(parseInt(limit))
                            .execute();
                    } catch (queryError) {
                        console.log('Query also failed, trying direct vectordb query:', queryError.message);
                        // Last resort - use vectordb query method if available
                        const query = await this.db.query(`SELECT * FROM ${this.tableName} LIMIT ${parseInt(limit)}`);
                        results = await query.execute();
                    }
                }
                
                console.log(`✅ Retrieved ${results.length} vectors`);
                
                // Clean up and return
                const vectors = results.map(result => ({
                    id: result.id,
                    entrySignalId: result.entrySignalId,
                    instrument: result.instrument,
                    entryType: result.entryType,
                    direction: result.direction,
                    timestamp: result.timestamp,
                    pnl: result.pnl || 0,
                    pnlDollars: result.pnlDollars || result.pnl || 0,
                    exitReason: result.exitReason,
                    featuresJson: result.featuresJson || '{}',
                    featureNames: result.featureNames || [],
                    maxProfit: result.maxProfit || 0,
                    maxLoss: result.maxLoss || 0,
                    _distance: result._distance
                }));

                res.json({
                    success: true,
                    count: vectors.length,
                    vectors: vectors
                });

            } catch (error) {
                console.error('❌ Failed to fetch vectors:', error.message);
                res.status(500).json({
                    error: 'Failed to fetch vectors',
                    message: error.message
                });
            }
        });

        // Get basic stats
        this.app.get('/api/stats', async (req, res) => {
            try {
                console.log('📈 Calculating stats...');
                
                // Get row count
                const totalRows = await this.table.countRows();
                
                // Get sample vectors for stats
                let sampleVectors;
                try {
                    const dummyVector = new Array(100).fill(0.0);
                    sampleVectors = await this.table
                        .search(dummyVector)
                        .column('featureArray')
                        .limit(1000)
                        .execute();
                } catch (searchError) {
                    console.log('Search failed in stats, using query:', searchError.message);
                    try {
                        sampleVectors = await this.table
                            .filter("pnl IS NOT NULL OR pnl IS NULL")
                            .limit(1000)
                            .execute();
                    } catch (queryError) {
                        console.log('Query also failed in stats:', queryError.message);
                        const query = await this.db.query(`SELECT * FROM ${this.tableName} LIMIT 1000`);
                        sampleVectors = await query.execute();
                    }
                }
                
                // Calculate basic stats
                const pnlValues = sampleVectors
                    .map(v => parseFloat(v.pnl || v.pnlDollars || 0))
                    .filter(p => !isNaN(p) && p !== 0);

                const wins = pnlValues.filter(p => p > 0).length;
                const totalPnL = pnlValues.reduce((sum, p) => sum + p, 0);
                const avgPnL = pnlValues.length > 0 ? totalPnL / pnlValues.length : 0;
                const winRate = pnlValues.length > 0 ? wins / pnlValues.length : 0;

                // Get feature count from first vector with features
                let featureCount = 0;
                for (const vector of sampleVectors) {
                    if (vector.featuresJson && vector.featuresJson !== '{}') {
                        try {
                            const features = JSON.parse(vector.featuresJson);
                            featureCount = Object.keys(features).length;
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }

                res.json({
                    success: true,
                    stats: {
                        totalVectors: totalRows,
                        sampleSize: sampleVectors.length,
                        validPnL: pnlValues.length,
                        winRate,
                        avgPnL,
                        totalPnL,
                        featureCount
                    }
                });

            } catch (error) {
                console.error('❌ Failed to get stats:', error.message);
                res.status(500).json({
                    error: 'Failed to get stats',
                    message: error.message
                });
            }
        });

        // Export to CSV
        this.app.get('/api/export/csv', async (req, res) => {
            try {
                console.log('📤 Exporting to CSV...');
                
                // Get all vectors
                let vectors;
                try {
                    const dummyVector = new Array(100).fill(0.0);
                    vectors = await this.table
                        .search(dummyVector)
                        .column('featureArray')
                        .limit(100000)
                        .execute();
                } catch (searchError) {
                    console.log('Search failed in export, using query:', searchError.message);
                    try {
                        vectors = await this.table
                            .filter("pnl IS NOT NULL OR pnl IS NULL")
                            .limit(100000)
                            .execute();
                    } catch (queryError) {
                        console.log('Query also failed in export:', queryError.message);
                        const query = await this.db.query(`SELECT * FROM ${this.tableName}`);
                        vectors = await query.execute();
                    }
                }

                if (vectors.length === 0) {
                    return res.status(404).json({ error: 'No vectors found' });
                }

                // Get feature names from first vector
                let featureNames = [];
                for (const vector of vectors) {
                    if (vector.featuresJson && vector.featuresJson !== '{}') {
                        try {
                            const features = JSON.parse(vector.featuresJson);
                            featureNames = Object.keys(features).sort();
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                }

                // Create CSV header
                const header = [
                    'id', 'entrySignalId', 'instrument', 'entryType', 'direction',
                    'timestamp', 'pnl', 'exitReason', 'maxProfit', 'maxLoss',
                    ...featureNames
                ];

                // Create rows
                const rows = vectors.map(vector => {
                    const row = [
                        vector.id || '',
                        vector.entrySignalId || '',
                        vector.instrument || '',
                        vector.entryType || '',
                        vector.direction || '',
                        vector.timestamp || '',
                        vector.pnl || vector.pnlDollars || 0,
                        vector.exitReason || '',
                        vector.maxProfit || 0,
                        vector.maxLoss || 0
                    ];

                    // Add feature values
                    if (vector.featuresJson && vector.featuresJson !== '{}') {
                        try {
                            const features = JSON.parse(vector.featuresJson);
                            featureNames.forEach(name => {
                                row.push(features[name] || 0);
                            });
                        } catch (e) {
                            featureNames.forEach(() => row.push(0));
                        }
                    } else {
                        featureNames.forEach(() => row.push(0));
                    }

                    return row.map(val => `"${val}"`).join(',');
                });

                const csv = [header.join(','), ...rows].join('\n');
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="vectors.csv"');
                res.send(csv);

            } catch (error) {
                console.error('❌ Failed to export CSV:', error.message);
                res.status(500).json({
                    error: 'Failed to export CSV',
                    message: error.message
                });
            }
        });
    }

    async start() {
        try {
            await this.initialize();
            
            this.app.listen(this.port, () => {
                console.log('🚀 Simple LanceDB API started successfully!');
                console.log('');
                console.log('📡 Server Details:');
                console.log(`   Port: ${this.port}`);
                console.log(`   Health: http://localhost:${this.port}/health`);
                console.log(`   Vectors: http://localhost:${this.port}/api/vectors`);
                console.log(`   Stats: http://localhost:${this.port}/api/stats`);
                console.log(`   Export: http://localhost:${this.port}/api/export/csv`);
                console.log('');
                console.log('🎯 UI Available at:');
                console.log(`   http://localhost:${this.port}/monte-carlo-direct.html`);
                console.log('');
            });

        } catch (error) {
            console.error('❌ Failed to start server:', error.message);
            process.exit(1);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Simple LanceDB API...');
    process.exit(0);
});

// Start the server
if (require.main === module) {
    const api = new SimpleLanceDBAPI();
    api.start();
}

module.exports = SimpleLanceDBAPI;