const fs = require('fs');
const path = require('path');
const axios = require('axios');

class ServiceStatusManager {
    constructor() {
        this.statusFilePath = path.join(__dirname, '..', 'server-status.json');
        this.loadStatus();
    }

    loadStatus() {
        try {
            const data = fs.readFileSync(this.statusFilePath, 'utf8');
            this.status = JSON.parse(data);
        } catch (error) {
            console.error(`[STATUS] Error loading status file: ${error.message}`);
            this.status = {
                monolith: { status: 'unknown' },
                dtw: { status: 'unknown' }
            };
        }
    }

    saveStatus() {
        try {
            fs.writeFileSync(this.statusFilePath, JSON.stringify(this.status, null, 2));
        } catch (error) {
            console.error(`[STATUS] Error saving status file: ${error.message}`);
        }
    }

    updateServiceStatus(service, updates) {
        if (!this.status[service]) {
            console.error(`[STATUS] Invalid service: ${service}`);
            return;
        }

        this.status[service] = {
            ...this.status[service],
            ...updates,
            lastUpdateTime: new Date().toISOString()
        };

        this.saveStatus();
    }

    async checkServicesHealth() {
        // Check DTW Service
        try {
            const dtwResponse = await axios.get('http://localhost:5000/api/health');
            this.updateServiceStatus('dtw', {
                status: 'running',
                lastHealthCheck: new Date().toISOString(),
                healthStatus: dtwResponse.data
            });
        } catch (error) {
            this.updateServiceStatus('dtw', {
                status: 'error',
                lastHealthCheck: new Date().toISOString(),
                lastError: error.message
            });
        }

        // Check Monolith
        try {
            const monolithResponse = await axios.get('http://localhost:3002/api/health');
            this.updateServiceStatus('monolith', {
                status: 'running',
                lastHealthCheck: new Date().toISOString(),
                healthStatus: monolithResponse.data
            });
        } catch (error) {
            this.updateServiceStatus('monolith', {
                status: 'error',
                lastHealthCheck: new Date().toISOString(),
                lastError: error.message
            });
        }
    }

    async getDTWPatternStatus() {
        try {
            const response = await axios.get('http://localhost:5000/api/pattern-query/status');
            this.updateServiceStatus('dtw', {
                activePatternCount: response.data.activePatterns || 0,
                vectorSpecs: response.data.vectorSpecs || []
            });
            return response.data;
        } catch (error) {
            console.error(`[STATUS] Error getting DTW pattern status: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ServiceStatusManager(); 