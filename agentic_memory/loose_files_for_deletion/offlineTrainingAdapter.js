/**
 * Offline Training Adapter for Risk Agent
 * Connects Risk Agent to qualified training data only
 * NO MORE REAL-TIME GRADUATION
 */

const axios = require('axios');

class OfflineTrainingAdapter {
    constructor() {
        this.storageUrl = process.env.STORAGE_AGENT_URL || 'http://localhost:3015';
        this.storageClient = axios.create({
            baseURL: this.storageUrl,
            timeout: 10000
        });
        
        this.trainingCache = new Map();
        this.lastUpdate = null;
        this.updateInterval = 10 * 60 * 1000; // 10 minutes
    }

    // Get qualified training data (replaces real-time graduation)
    async getQualifiedTrainingData(instrument, direction) {
        const cacheKey = `${instrument}_${direction}`;
        
        // Check cache first
        if (this.trainingCache.has(cacheKey)) {
            const cached = this.trainingCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.updateInterval) {
                console.log(`[OFFLINE-TRAINING] Using cached data for ${cacheKey}`);
                return cached.data;
            }
        }
        
        try {
            console.log(`[OFFLINE-TRAINING] Fetching qualified data for ${instrument}_${direction}...`);
            
            const response = await this.storageClient.get('/api/offline/qualified', {
                params: {
                    instrument,
                    direction,
                    limit: 1000
                }
            });
            
            if (!response.data.success) {
                throw new Error(`Storage API error: ${response.data.message}`);
            }
            
            const qualifiedRecords = response.data.records;
            console.log(`[OFFLINE-TRAINING] Retrieved ${qualifiedRecords.length} qualified records for ${cacheKey}`);
            
            // Convert to format expected by Risk Agent
            const trainingData = this.convertToTrainingFormat(qualifiedRecords);
            
            // Cache the result
            this.trainingCache.set(cacheKey, {
                data: trainingData,
                timestamp: Date.now(),
                recordCount: qualifiedRecords.length
            });
            
            return trainingData;
            
        } catch (error) {
            console.error(`[OFFLINE-TRAINING] Failed to get qualified data for ${cacheKey}:`, error.message);
            
            // Return cached data if available, even if stale
            if (this.trainingCache.has(cacheKey)) {
                console.log(`[OFFLINE-TRAINING] Using stale cached data for ${cacheKey}`);
                return this.trainingCache.get(cacheKey).data;
            }
            
            throw error;
        }
    }

    // Get graduated features (for ML training)
    async getGraduatedFeatures(instrument, direction) {
        try {
            console.log(`[OFFLINE-TRAINING] Fetching graduated features for ${instrument}_${direction}...`);
            
            const response = await this.storageClient.get('/api/offline/graduated', {
                params: {
                    instrument,
                    direction,
                    limit: 1000
                }
            });
            
            if (!response.data.success) {
                throw new Error(`Storage API error: ${response.data.message}`);
            }
            
            const graduatedRecords = response.data.records;
            console.log(`[OFFLINE-TRAINING] Retrieved ${graduatedRecords.length} graduated records for ${instrument}_${direction}`);
            
            return this.convertGraduatedToMLFormat(graduatedRecords);
            
        } catch (error) {
            console.error(`[OFFLINE-TRAINING] Failed to get graduated features:`, error.message);
            throw error;
        }
    }

    // Convert qualified records to Risk Agent training format
    convertToTrainingFormat(qualifiedRecords) {
        const trainingData = {
            features: [],
            labels: [],
            metadata: []
        };
        
        for (const record of qualifiedRecords) {
            try {
                // Parse processed features
                const features = JSON.parse(record.processedFeatures);
                const matchingFeatures = JSON.parse(record.matchingFeatures);
                
                // Create feature vector using only matching features (qualified features)
                const featureVector = this.createFeatureVector(features, matchingFeatures);
                
                // Create label (profitable or not)
                const label = {
                    profitable: record.profitable === 1,
                    pnl: record.pnl,
                    qualificationScore: record.qualificationScore,
                    fuzzyScore: record.fuzzyScore
                };
                
                // Create metadata
                const metadata = {
                    entrySignalId: record.entrySignalId,
                    instrument: record.instrument,
                    direction: record.direction,
                    entryType: record.entryType,
                    featureQuality: record.featureQuality,
                    processedAt: record.processedAt
                };
                
                trainingData.features.push(featureVector);
                trainingData.labels.push(label);
                trainingData.metadata.push(metadata);
                
            } catch (error) {
                console.error(`[OFFLINE-TRAINING] Error processing record ${record.entrySignalId}:`, error.message);
            }
        }
        
        console.log(`[OFFLINE-TRAINING] Converted ${trainingData.features.length} records to training format`);
        return trainingData;
    }

    // Convert graduated records to ML training format
    convertGraduatedToMLFormat(graduatedRecords) {
        const mlData = {
            features: [],
            targets: {
                pnl: [],
                profitable: [],
                trajectory: []
            },
            featureNames: null,
            metadata: []
        };
        
        for (const record of graduatedRecords) {
            try {
                // Parse graduated features
                const features = JSON.parse(record.graduatedFeatures);
                const featureNames = JSON.parse(record.featureNames);
                
                // Set feature names from first record
                if (!mlData.featureNames) {
                    mlData.featureNames = featureNames;
                }
                
                // Add features and targets
                mlData.features.push(features);
                mlData.targets.pnl.push(record.pnlLabel);
                mlData.targets.profitable.push(record.profitableLabel);
                
                // Parse trajectory if available
                if (record.trajectoryLabel) {
                    try {
                        const trajectory = JSON.parse(record.trajectoryLabel);
                        mlData.targets.trajectory.push(trajectory);
                    } catch (e) {
                        mlData.targets.trajectory.push(null);
                    }
                } else {
                    mlData.targets.trajectory.push(null);
                }
                
                // Add metadata
                mlData.metadata.push({
                    entrySignalId: record.entrySignalId,
                    instrument: record.instrument,
                    direction: record.direction,
                    trainingWeight: record.trainingWeight,
                    graduationTimestamp: record.graduationTimestamp
                });
                
            } catch (error) {
                console.error(`[OFFLINE-TRAINING] Error processing graduated record ${record.entrySignalId}:`, error.message);
            }
        }
        
        console.log(`[OFFLINE-TRAINING] Converted ${mlData.features.length} graduated records to ML format`);
        return mlData;
    }

    // Create feature vector from qualified features only
    createFeatureVector(allFeatures, matchingFeatureNames) {
        const featureVector = [];
        
        // Only use features that passed qualification (fuzzy matching)
        for (const featureName of matchingFeatureNames) {
            const value = allFeatures[featureName];
            featureVector.push(typeof value === 'number' ? value : 0);
        }
        
        return featureVector;
    }

    // Trigger offline processing (Stage 2: Raw → Qualified → Graduated)
    async triggerOfflineProcessing() {
        try {
            console.log('[OFFLINE-TRAINING] Triggering offline processing...');
            
            const response = await this.storageClient.post('/api/offline/process');
            
            if (!response.data.success) {
                throw new Error(`Processing failed: ${response.data.message}`);
            }
            
            const result = response.data.result;
            console.log(`[OFFLINE-TRAINING] Processing completed: ${result.stage1.qualified} qualified, ${result.stage2.graduated} graduated`);
            
            // Clear cache to force refresh
            this.trainingCache.clear();
            
            return result;
            
        } catch (error) {
            console.error('[OFFLINE-TRAINING] Failed to trigger processing:', error.message);
            throw error;
        }
    }

    // Get offline processing status
    async getProcessingStatus() {
        try {
            const response = await this.storageClient.get('/api/offline/status');
            
            if (!response.data.success) {
                throw new Error(`Status check failed: ${response.data.message}`);
            }
            
            return response.data.status;
            
        } catch (error) {
            console.error('[OFFLINE-TRAINING] Failed to get processing status:', error.message);
            throw error;
        }
    }

    // Replaces real-time graduation with offline qualified data
    async findSimilarQualifiedPatterns(instrument, direction, queryFeatures, limit = 10) {
        const trainingData = await this.getQualifiedTrainingData(instrument, direction);
        
        if (!trainingData.features || trainingData.features.length === 0) {
            console.log(`[OFFLINE-TRAINING] No qualified patterns found for ${instrument}_${direction}`);
            return [];
        }
        
        // Calculate similarity to qualified patterns
        const similarities = [];
        
        for (let i = 0; i < trainingData.features.length; i++) {
            const patternFeatures = trainingData.features[i];
            const similarity = this.calculateSimilarity(queryFeatures, patternFeatures);
            
            similarities.push({
                similarity,
                label: trainingData.labels[i],
                metadata: trainingData.metadata[i],
                features: patternFeatures
            });
        }
        
        // Sort by similarity and return top matches
        similarities.sort((a, b) => b.similarity - a.similarity);
        
        const topMatches = similarities.slice(0, limit);
        console.log(`[OFFLINE-TRAINING] Found ${topMatches.length} similar qualified patterns (best similarity: ${topMatches[0]?.similarity?.toFixed(3)})`);
        
        return topMatches;
    }

    calculateSimilarity(features1, features2) {
        // Simple cosine similarity
        const minLength = Math.min(features1.length, features2.length);
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < minLength; i++) {
            dotProduct += features1[i] * features2[i];
            norm1 += features1[i] * features1[i];
            norm2 += features2[i] * features2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    // Cache management
    clearCache() {
        this.trainingCache.clear();
        console.log('[OFFLINE-TRAINING] Training cache cleared');
    }

    getCacheStats() {
        const stats = {
            cacheSize: this.trainingCache.size,
            entries: []
        };
        
        for (const [key, value] of this.trainingCache) {
            stats.entries.push({
                key,
                recordCount: value.recordCount,
                age: Date.now() - value.timestamp
            });
        }
        
        return stats;
    }

    // Export training data for external tools
    async exportQualifiedData(instrument, direction, format = 'json') {
        try {
            const response = await this.storageClient.get(`/api/offline/export/qualified`, {
                params: {
                    instrument,
                    direction,
                    format
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error('[OFFLINE-TRAINING] Export failed:', error.message);
            throw error;
        }
    }
}

module.exports = OfflineTrainingAdapter;