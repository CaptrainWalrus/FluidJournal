#!/usr/bin/env node

/**
 * Feature Importance Service
 * 
 * Continuously monitors the vector storage and updates feature importance rankings
 * as new trading data becomes available. This enables adaptive feature selection
 * that improves over time.
 */

const FeatureImportanceAnalyzer = require('./feature-importance-analyzer');
const express = require('express');
const cron = require('node-cron');

class FeatureImportanceService {
    constructor() {
        this.app = express();
        this.port = process.env.FEATURE_IMPORTANCE_PORT || 3018;
        this.analyzer = new FeatureImportanceAnalyzer({
            minVectors: 10,
            topFeatures: 15
        });
        
        this.lastAnalysis = null;
        this.analysisInProgress = false;
        this.vectorCount = 0;
        this.lastVectorCount = 0;
        
        this.setupRoutes();
        this.setupScheduler();
    }

    setupRoutes() {
        this.app.use(express.json());

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'feature-importance-service',
                lastAnalysis: this.lastAnalysis,
                vectorCount: this.vectorCount,
                analysisInProgress: this.analysisInProgress
            });
        });

        // Get current feature importance
        this.app.get('/api/feature-importance', (req, res) => {
            try {
                const fs = require('fs');
                const configPath = './feature-selection.json';
                
                if (fs.existsSync(configPath)) {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    res.json({
                        success: true,
                        config,
                        lastUpdated: config.lastUpdated
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Feature importance not yet analyzed'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Trigger manual analysis
        this.app.post('/api/analyze', async (req, res) => {
            if (this.analysisInProgress) {
                return res.status(409).json({
                    success: false,
                    error: 'Analysis already in progress'
                });
            }

            try {
                console.log('📊 Manual analysis triggered via API');
                const result = await this.runAnalysis();
                res.json({
                    success: true,
                    result,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get analysis status
        this.app.get('/api/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    lastAnalysis: this.lastAnalysis,
                    vectorCount: this.vectorCount,
                    lastVectorCount: this.lastVectorCount,
                    analysisInProgress: this.analysisInProgress,
                    needsUpdate: this.vectorCount !== this.lastVectorCount,
                    service: 'feature-importance-service'
                }
            });
        });
    }

    setupScheduler() {
        // Check for new data every 30 minutes
        cron.schedule('*/30 * * * *', () => {
            this.checkForUpdates();
        });

        // Force analysis daily at 2 AM
        cron.schedule('0 2 * * *', () => {
            console.log('🕐 Daily scheduled analysis starting...');
            this.runAnalysis();
        });

        console.log('⏰ Scheduled tasks configured:');
        console.log('  - Check for updates: Every 30 minutes');
        console.log('  - Force analysis: Daily at 2 AM');
    }

    async checkForUpdates() {
        try {
            // Get current vector count from storage
            const axios = require('axios');
            const response = await axios.get('http://localhost:3015/api/stats', {
                timeout: 5000
            });

            if (response.data && response.data.stats) {
                const newCount = response.data.stats.totalVectors || 0;
                
                if (newCount !== this.vectorCount) {
                    console.log(`📈 Vector count changed: ${this.vectorCount} → ${newCount}`);
                    this.vectorCount = newCount;

                    // Trigger analysis if significant change (more than 10 new vectors)
                    const vectorDiff = newCount - this.lastVectorCount;
                    if (vectorDiff >= 10) {
                        console.log(`🔄 Triggering analysis due to ${vectorDiff} new vectors`);
                        await this.runAnalysis();
                    }
                }
            }
        } catch (error) {
            console.warn('⚠️  Failed to check for updates:', error.message);
        }
    }

    async runAnalysis() {
        if (this.analysisInProgress) {
            console.log('⏳ Analysis already in progress, skipping...');
            return { skipped: true, reason: 'already_in_progress' };
        }

        this.analysisInProgress = true;
        const startTime = Date.now();

        try {
            console.log('🧠 Starting feature importance analysis...');
            
            const ranking = await this.analyzer.analyze();
            
            this.lastAnalysis = {
                timestamp: new Date().toISOString(),
                vectorsAnalyzed: this.vectorCount,
                topFeatures: ranking.slice(0, 5).map(f => ({
                    name: f.name,
                    importance: f.composite
                })),
                duration: Date.now() - startTime
            };

            this.lastVectorCount = this.vectorCount;
            
            console.log(`✅ Analysis complete in ${this.lastAnalysis.duration}ms`);
            console.log(`🎯 Top feature: ${ranking[0].name} (${ranking[0].composite.toFixed(3)})`);
            
            return {
                success: true,
                topFeatures: this.lastAnalysis.topFeatures,
                vectorsAnalyzed: this.vectorCount,
                duration: this.lastAnalysis.duration
            };

        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        } finally {
            this.analysisInProgress = false;
        }
    }

    async start() {
        console.log('🚀 Starting Feature Importance Service...');
        
        // Initial analysis if we have enough data
        await this.checkForUpdates();
        if (this.vectorCount >= 10) {
            console.log('📊 Running initial analysis...');
            await this.runAnalysis();
        } else {
            console.log(`⏳ Waiting for more data (${this.vectorCount}/10 vectors)`);
        }

        this.app.listen(this.port, () => {
            console.log(`🎯 Feature Importance Service listening on port ${this.port}`);
            console.log(`📊 Adaptive feature selection enabled`);
            console.log(`🔄 Monitoring storage for new trading data`);
        });
    }
}

// Start the service
if (require.main === module) {
    const service = new FeatureImportanceService();
    service.start().catch(error => {
        console.error('💥 Failed to start service:', error);
        process.exit(1);
    });
}

module.exports = FeatureImportanceService;