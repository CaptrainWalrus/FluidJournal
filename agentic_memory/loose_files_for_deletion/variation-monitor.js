#!/usr/bin/env node

/**
 * Continuous Variation Monitor
 * 
 * Monitors incoming vectors for low-variation issues in real-time
 * Alerts when features show suspicious patterns
 */

const LowVariationDetector = require('./low-variation-detector');
const express = require('express');

class VariationMonitor {
    constructor() {
        this.app = express();
        this.port = process.env.VARIATION_MONITOR_PORT || 3019;
        this.detector = new LowVariationDetector({
            variationThreshold: 0.01, // Alert on very low variation
            uniqueValueThreshold: 2    // Alert on binary/constant features
        });
        
        this.lastCheckTime = Date.now();
        this.lastVectorCount = 0;
        this.alertHistory = [];
        this.checkInterval = 60000; // Check every minute
        
        this.setupRoutes();
        this.startMonitoring();
    }

    setupRoutes() {
        this.app.use(express.json());

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'variation-monitor',
                lastCheck: new Date(this.lastCheckTime).toISOString(),
                alertCount: this.alertHistory.length
            });
        });

        // Get latest alerts
        this.app.get('/api/alerts', (req, res) => {
            const limit = parseInt(req.query.limit) || 10;
            res.json({
                success: true,
                alerts: this.alertHistory.slice(-limit).reverse(),
                totalAlerts: this.alertHistory.length
            });
        });

        // Trigger manual check
        this.app.post('/api/check', async (req, res) => {
            try {
                console.log('📊 Manual variation check triggered via API');
                const report = await this.detector.analyze();
                this.processReport(report);
                
                res.json({
                    success: true,
                    report,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get current status
        this.app.get('/api/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    lastCheck: new Date(this.lastCheckTime).toISOString(),
                    vectorCount: this.lastVectorCount,
                    recentAlerts: this.alertHistory.slice(-5),
                    monitoringActive: true
                }
            });
        });
    }

    startMonitoring() {
        console.log(`🔍 Starting continuous variation monitoring (every ${this.checkInterval/1000}s)`);
        
        setInterval(async () => {
            try {
                await this.checkForIssues();
            } catch (error) {
                console.error('⚠️  Monitoring check failed:', error.message);
            }
        }, this.checkInterval);

        // Initial check
        setTimeout(() => this.checkForIssues(), 5000);
    }

    async checkForIssues() {
        try {
            this.lastCheckTime = Date.now();
            
            // Get current vector count
            const axios = require('axios');
            const response = await axios.get('http://localhost:3015/api/stats', {
                timeout: 5000
            });

            let currentCount = 0;
            if (response.data && response.data.stats) {
                currentCount = response.data.stats.totalVectors || 0;
            }

            // Only run analysis if we have new data
            if (currentCount !== this.lastVectorCount && currentCount >= 2) {
                console.log(`📈 Vector count changed: ${this.lastVectorCount} → ${currentCount}, running analysis...`);
                
                const report = await this.detector.analyze();
                this.processReport(report);
                this.lastVectorCount = currentCount;
            }

        } catch (error) {
            console.warn('⚠️  Check failed:', error.message);
        }
    }

    processReport(report) {
        const { criticalFeatures, highIssueFeatures, summary } = report;
        
        // Generate alerts for critical issues
        if (criticalFeatures.length > 0) {
            const alert = {
                timestamp: new Date().toISOString(),
                type: 'CRITICAL',
                message: `${criticalFeatures.length} features with critical variation issues`,
                features: criticalFeatures.slice(0, 5).map(f => ({
                    name: f.name,
                    issues: f.issues,
                    uniqueCount: f.uniqueCount
                })),
                summary
            };
            
            this.alertHistory.push(alert);
            console.log('🚨 CRITICAL ALERT:', alert.message);
            criticalFeatures.slice(0, 3).forEach(f => {
                console.log(`   - ${f.name}: ${f.issues.join(', ')}`);
            });
        }

        // Generate alerts for high issues
        if (highIssueFeatures.length > 0) {
            const alert = {
                timestamp: new Date().toISOString(),
                type: 'HIGH',
                message: `${highIssueFeatures.length} features with high variation issues`,
                features: highIssueFeatures.slice(0, 3).map(f => ({
                    name: f.name,
                    issues: f.issues,
                    uniqueCount: f.uniqueCount
                })),
                summary
            };
            
            this.alertHistory.push(alert);
            console.log('🟠 HIGH ALERT:', alert.message);
        }

        // Keep alert history manageable
        if (this.alertHistory.length > 100) {
            this.alertHistory = this.alertHistory.slice(-50);
        }
    }

    async start() {
        console.log('🚀 Starting Variation Monitor Service...');
        
        this.app.listen(this.port, () => {
            console.log(`🔍 Variation Monitor listening on port ${this.port}`);
            console.log(`📊 Monitoring for low-variation feature issues`);
            console.log(`🚨 Alerts available at http://localhost:${this.port}/api/alerts`);
        });
    }
}

// Start the monitor
if (require.main === module) {
    const monitor = new VariationMonitor();
    monitor.start().catch(error => {
        console.error('💥 Failed to start monitor:', error);
        process.exit(1);
    });
}

module.exports = VariationMonitor;