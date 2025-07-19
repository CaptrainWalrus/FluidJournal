#!/usr/bin/env node

/**
 * Direct LanceDB API - Simple server that reads directly from LanceDB files
 * No dependency on storage-agent - completely independent
 */

const express = require('express');
const lancedb = require('vectordb');
const path = require('path');
const cors = require('cors');

class DirectLanceDBAPI {
    constructor() {
        this.app = express();
        this.db = null;
        this.table = null;
        this.port = 3018; // Different port from storage agent
        this.dbPath = '../data/vectors'; // Relative to ui folder
        this.tableName = 'feature_vectors';
    }

    async initialize() {
        try {
            console.log('🔌 Initializing Direct LanceDB API...');
            
            // Setup express
            this.app.use(cors());
            this.app.use(express.json());
            this.app.use(express.static('./')); // Serve UI files from current directory
            
            // Connect to LanceDB
            const fullDbPath = path.resolve(__dirname, this.dbPath);
            console.log('📂 Connecting to LanceDB at:', fullDbPath);
            
            this.db = await lancedb.connect(fullDbPath);
            this.table = await this.db.openTable(this.tableName);
            
            console.log('✅ Connected to LanceDB successfully');
            
            // Test the connection with a simple query
            try {
                const testCount = await this.table.countRows();
                console.log(`✅ Table contains ${testCount} rows`);
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
                service: 'direct-lancedb-api',
                timestamp: new Date().toISOString()
            });
        });

        // Get raw vectors directly from LanceDB
        this.app.get('/api/vectors', async (req, res) => {
            try {
                const { limit = 1000 } = req.query;
                
                console.log(`📊 Fetching ${limit} vectors directly from LanceDB...`);
                
                // Query all records using countRows and then scan
                const totalRows = await this.table.countRows();
                console.log(`📊 Total rows in LanceDB: ${totalRows}`);
                
                // Try to get all records using search with dummy vector
                // First, let's get a sample to understand the schema
                try {
                    // For LanceDB, we'll create a dummy search that returns all
                    const dummyVector = new Array(100).fill(0); // 100 features as per your schema
                    const results = await this.table
                        .search(dummyVector)
                        .limit(parseInt(limit))
                        .execute();
                    
                    const vectors = results;
                    console.log(`✅ Retrieved ${vectors.length} vectors using search`);
                    
                    // Convert to plain objects and clean up
                const cleanVectors = vectors.map(vector => ({
                    id: vector.id,
                    entrySignalId: vector.entrySignalId,
                    instrument: vector.instrument,
                    entryType: vector.entryType,
                    direction: vector.direction,
                    timestamp: vector.timestamp,
                    pnl: vector.pnl,
                    pnlDollars: vector.pnlDollars,
                    exitReason: vector.exitReason,
                    outcome: vector.outcome,
                    featuresJson: vector.featuresJson,
                    featureNames: vector.featureNames,
                    features: vector.features, // Feature array
                    maxProfit: vector.maxProfit,
                    maxLoss: vector.maxLoss,
                    recordType: vector.recordType,
                    status: vector.status
                }));

                res.json({
                    success: true,
                    count: cleanVectors.length,
                    vectors: cleanVectors
                });

                } catch (searchError) {
                    // Fallback to using filter if search fails
                    console.log('Search failed, trying filter approach...');
                    const allRecords = await this.table.filter().limit(parseInt(limit)).toArray();
                    
                    const cleanVectors = allRecords.map(vector => ({
                        id: vector.id,
                        entrySignalId: vector.entrySignalId,
                        instrument: vector.instrument,
                        entryType: vector.entryType,
                        direction: vector.direction,
                        timestamp: vector.timestamp,
                        pnl: vector.pnl,
                        pnlDollars: vector.pnlDollars,
                        exitReason: vector.exitReason,
                        outcome: vector.outcome,
                        featuresJson: vector.featuresJson,
                        featureNames: vector.featureNames,
                        features: vector.features,
                        maxProfit: vector.maxProfit,
                        maxLoss: vector.maxLoss,
                        recordType: vector.recordType,
                        status: vector.status
                    }));

                    res.json({
                        success: true,
                        count: cleanVectors.length,
                        vectors: cleanVectors
                    });
                }
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
                
                // Get all vectors for stats
                const query = this.table.query();
                const vectors = await query.limit(10000).execute();

                const stats = this.calculateStats(vectors);
                
                res.json({
                    success: true,
                    stats
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
                
                const query = this.table.query();
                const vectors = await query.limit(100000).execute();

                if (vectors.length === 0) {
                    return res.status(404).json({ error: 'No vectors found' });
                }

                const csv = this.convertToCSV(vectors);
                
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

    calculateStats(vectors) {
        if (vectors.length === 0) {
            return {
                totalVectors: 0,
                winRate: 0,
                avgPnL: 0,
                totalPnL: 0,
                featureCount: 0
            };
        }

        const pnlValues = vectors
            .map(v => parseFloat(v.pnl || v.pnlDollars || 0))
            .filter(p => !isNaN(p) && p !== 0);

        const wins = pnlValues.filter(p => p > 0).length;
        const totalPnL = pnlValues.reduce((sum, p) => sum + p, 0);
        const avgPnL = pnlValues.length > 0 ? totalPnL / pnlValues.length : 0;
        const winRate = pnlValues.length > 0 ? wins / pnlValues.length : 0;

        // Get feature count from first vector
        let featureCount = 0;
        if (vectors[0]?.featuresJson) {
            try {
                const features = JSON.parse(vectors[0].featuresJson);
                featureCount = Object.keys(features).length;
            } catch (e) {
                featureCount = vectors[0]?.features?.length || 0;
            }
        }

        return {
            totalVectors: vectors.length,
            validPnL: pnlValues.length,
            winRate,
            avgPnL,
            totalPnL,
            featureCount,
            instruments: [...new Set(vectors.map(v => v.instrument))],
            directions: [...new Set(vectors.map(v => v.direction))]
        };
    }

    convertToCSV(vectors) {
        if (vectors.length === 0) return '';

        // Get feature names from first vector
        let featureNames = [];
        if (vectors[0]?.featuresJson) {
            try {
                const features = JSON.parse(vectors[0].featuresJson);
                featureNames = Object.keys(features).sort();
            } catch (e) {
                console.warn('Failed to parse featuresJson for CSV export');
            }
        }

        // Create header
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
            if (vector.featuresJson) {
                try {
                    const features = JSON.parse(vector.featuresJson);
                    featureNames.forEach(name => {
                        row.push(features[name] || 0);
                    });
                } catch (e) {
                    // Fill with zeros if can't parse
                    featureNames.forEach(() => row.push(0));
                }
            } else {
                featureNames.forEach(() => row.push(0));
            }

            return row.map(val => `"${val}"`).join(',');
        });

        return [header.join(','), ...rows].join('\n');
    }

    async start() {
        try {
            await this.initialize();
            
            this.app.listen(this.port, () => {
                console.log('🚀 Direct LanceDB API started successfully!');
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
    console.log('\n👋 Shutting down Direct LanceDB API...');
    process.exit(0);
});

// Start the server
if (require.main === module) {
    const api = new DirectLanceDBAPI();
    api.start();
}

module.exports = DirectLanceDBAPI;