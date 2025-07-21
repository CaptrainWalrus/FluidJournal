const AgenticMemoryClient = require('../shared/agenticMemoryClient');

class MemoryManager {
    constructor() {
        this.storageClient = new AgenticMemoryClient();
        
        // In-memory storage
        this.vectors = new Map(); // All vectors indexed by entrySignalId
        this.vectorsByInstrument = new Map(); // Vectors grouped by instrument
        this.lastVectorCount = 0;
        this.lastUpdateTime = Date.now();
        
        // Graduation tables in memory
        this.graduationTables = new Map(); // instrument_direction -> graduation data
        this.isInitialized = false;
        
        // Background tasks
        this.vectorCheckInterval = null;
        this.graduationUpdateQueue = new Set(); // Track pending graduations
        
        // Bar time-based graduation updates
        this.lastGraduationBarTime = null;
        this.GRADUATION_INTERVAL_MINUTES = 30;
        
        console.log('[MEMORY-MANAGER] Initialized - preparing for vector loading');
    }

    async initialize() {
        console.log('[MEMORY-MANAGER] Starting initialization...');
        
        try {
            // PHASE 1: Load all vectors into memory
            await this.loadAllVectors();
            
            // PHASE 2: Create initial graduation tables
            await this.createInitialGraduationTables();
            
            // PHASE 3: Start background processes
            this.startBackgroundTasks();
            
            this.isInitialized = true;
            console.log('[MEMORY-MANAGER] ✅ Initialization complete');
            
        } catch (error) {
            console.error('[MEMORY-MANAGER] ❌ Initialization failed:', error.message);
            throw error;
        }
    }

    async loadAllVectors() {
        const startTime = Date.now();
        console.log('[MEMORY-MANAGER] Loading graduation vectors (TRAINING + RECENT) into memory...');
        
        try {
            // DEBUG: Check what dataType filtering returns
            console.log('[MEMORY-MANAGER] DEBUG: Attempting to load vectors with dataType filters...');
            
            // Get TRAINING vectors
            const trainingVectors = await this.storageClient.getVectors({ 
                limit: 10000, 
                dataType: 'TRAINING' 
            });
            console.log(`[MEMORY-MANAGER] DEBUG: TRAINING vectors loaded: ${trainingVectors.length}`);
            
            // Get RECENT vectors  
            const recentVectors = await this.storageClient.getVectors({ 
                limit: 1000, 
                dataType: 'RECENT' 
            });
            console.log(`[MEMORY-MANAGER] DEBUG: RECENT vectors loaded: ${recentVectors.length}`);
            
            // If no vectors found with dataType filter, try loading without it
            if (trainingVectors.length === 0 && recentVectors.length === 0) {
                console.log('[MEMORY-MANAGER] DEBUG: No vectors found with dataType filter. Loading ALL vectors...');
                const allVectorsUnfiltered = await this.storageClient.getVectors({ 
                    limit: 10000
                });
                console.log(`[MEMORY-MANAGER] DEBUG: ALL vectors loaded (no filter): ${allVectorsUnfiltered.length}`);
                
                // Check if any vectors have dataType field
                const vectorsWithDataType = allVectorsUnfiltered.filter(v => v.dataType);
                console.log(`[MEMORY-MANAGER] DEBUG: Vectors with dataType field: ${vectorsWithDataType.length}`);
                if (vectorsWithDataType.length > 0) {
                    console.log('[MEMORY-MANAGER] DEBUG: Sample dataType values:', 
                        vectorsWithDataType.slice(0, 5).map(v => v.dataType));
                }
                
                // Use all vectors if no dataType filtering works
                const allVectors = allVectorsUnfiltered;
                
                // Clear existing memory
                this.vectors.clear();
                this.vectorsByInstrument.clear();
                
                // Load into memory structures
                for (const vector of allVectors) {
                    this.addVectorToMemory(vector);
                }
                
                this.lastVectorCount = allVectors.length;
                const duration = Date.now() - startTime;
                
                console.log(`[MEMORY-MANAGER] ✅ Loaded ${allVectors.length} vectors (no dataType filter) - Duration: ${duration}ms`);
                console.log(`[MEMORY-MANAGER] Instruments loaded:`, Array.from(this.vectorsByInstrument.keys()));
                
                return;
            }
            
            // Combine for graduation calculations
            const allVectors = [...trainingVectors, ...recentVectors];
            
            // Clear existing memory
            this.vectors.clear();
            this.vectorsByInstrument.clear();
            
            // Load into memory structures
            for (const vector of allVectors) {
                this.addVectorToMemory(vector);
            }
            
            this.lastVectorCount = allVectors.length;
            const duration = Date.now() - startTime;
            
            console.log(`[MEMORY-MANAGER] ✅ Loaded ${trainingVectors.length} training + ${recentVectors.length} recent = ${allVectors.length} vectors for graduation - Duration: ${duration}ms`);
            console.log(`[MEMORY-MANAGER] Instruments loaded:`, Array.from(this.vectorsByInstrument.keys()));
            
        } catch (error) {
            console.error('[MEMORY-MANAGER] Failed to load vectors:', error.message);
            throw error;
        }
    }

    addVectorToMemory(vector) {
        // Add to main index
        this.vectors.set(vector.entrySignalId, vector);
        
        // Normalize instrument to base symbol (MGC AUG25 -> MGC, ES SEP25 -> ES)
        const normalizedInstrument = this.normalizeInstrumentName(vector.instrument);
        
        // Add to instrument index using normalized name
        if (!this.vectorsByInstrument.has(normalizedInstrument)) {
            this.vectorsByInstrument.set(normalizedInstrument, []);
        }
        this.vectorsByInstrument.get(normalizedInstrument).push(vector);
    }

    async createInitialGraduationTables() {
        const startTime = Date.now();
        console.log('[MEMORY-MANAGER] Creating initial graduation tables...');
        
        const instruments = Array.from(this.vectorsByInstrument.keys());
        const directions = ['long', 'short'];
        
        let tablesCreated = 0;
        
        for (const instrument of instruments) {
            for (const direction of directions) {
                const key = `${instrument}_${direction}`;
                
                // Get vectors for this instrument+direction
                const vectors = this.getVectorsForInstrumentDirection(instrument, direction);
                
                if (vectors.length >= 10) { // Only create graduation if sufficient data
                    const graduationTable = await this.computeGraduationTable(instrument, direction, vectors);
                    this.graduationTables.set(key, graduationTable);
                    tablesCreated++;
                    
                    console.log(`[MEMORY-MANAGER] Created graduation table for ${key}: ${graduationTable.features.length} features, ${vectors.length} patterns`);
                }
            }
        }
        
        const duration = Date.now() - startTime;
        console.log(`[MEMORY-MANAGER] ✅ Created ${tablesCreated} graduation tables - Duration: ${duration}ms`);
    }

    async computeGraduationTable(instrument, direction, vectors) {
        const startTime = Date.now();
        
        // Separate profitable vs unprofitable trades using normalized per-contract PnL
        const profitable = vectors.filter(v => (v.pnlPerContract || v.pnl) > 0);
        const unprofitable = vectors.filter(v => (v.pnlPerContract || v.pnl) <= 0);
        
        console.log(`[MEMORY-MANAGER] ${instrument}_${direction}: ${profitable.length} profitable, ${unprofitable.length} unprofitable`);
        
        // Feature importance analysis
        const featureAnalysis = this.analyzeFeatureImportance(vectors);
        
        // Create range-based graduated features
        const graduatedFeatures = featureAnalysis
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 15) // Top 15 features
            .map(feature => {
                const ranges = this.calculateProfitableRanges(feature.name, profitable, unprofitable);
                return {
                    name: feature.name,
                    importance: feature.importance,
                    correlation: feature.correlation,
                    stability: feature.stability,
                    optimalRange: ranges.optimal,
                    acceptableRange: ranges.acceptable,
                    profitableMean: ranges.profitableMean,
                    unprofitableMean: ranges.unprofitableMean,
                    signal: ranges.signal,
                    sampleSize: ranges.sampleSize
                };
            });
        
        const duration = Date.now() - startTime;
        
        return {
            instrument,
            direction,
            features: graduatedFeatures,
            vectorCount: vectors.length,
            profitableCount: profitable.length,
            unprofitableCount: unprofitable.length,
            winRate: profitable.length / vectors.length,
            lastUpdated: Date.now(),
            computeTime: duration,
            version: "range-based-v1"
        };
    }

    analyzeFeatureImportance(vectors) {
        const featureStats = new Map();
        
        // Collect all feature names and their correlation with PnL
        for (const vector of vectors) {
            if (!vector.featuresJson) continue;
            
            let features;
            try {
                features = JSON.parse(vector.featuresJson);
            } catch (e) {
                continue;
            }
            
            const pnl = vector.pnlPerContract || vector.pnl || 0;
            
            for (const [featureName, featureValue] of Object.entries(features)) {
                if (typeof featureValue !== 'number') continue;
                
                if (!featureStats.has(featureName)) {
                    featureStats.set(featureName, {
                        name: featureName,
                        values: [],
                        pnls: [],
                        count: 0
                    });
                }
                
                const stat = featureStats.get(featureName);
                stat.values.push(featureValue);
                stat.pnls.push(pnl);
                stat.count++;
            }
        }
        
        // Calculate importance score for each feature
        const importance = [];
        
        for (const [featureName, stat] of featureStats) {
            if (stat.count < 5) continue; // Skip features with insufficient data
            
            // Calculate correlation with PnL
            const correlation = this.calculateCorrelation(stat.values, stat.pnls);
            
            // Calculate stability (lower variance = more stable)
            const variance = this.calculateVariance(stat.values);
            const stability = variance > 0 ? 1 / (1 + variance) : 1;
            
            // Combined importance score
            const importanceScore = Math.abs(correlation) * 0.7 + stability * 0.3;
            
            importance.push({
                name: featureName,
                importance: importanceScore,
                correlation: correlation,
                stability: stability,
                count: stat.count
            });
        }
        
        return importance;
    }

    calculateCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) return 0;
        
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
        
        return variance;
    }

    calculateProfitableRanges(featureName, profitableVectors, unprofitableVectors) {
        // Extract feature values from profitable trades
        const profitableValues = this.extractFeatureValues(profitableVectors, featureName);
        const unprofitableValues = this.extractFeatureValues(unprofitableVectors, featureName);
        
        if (profitableValues.length < 10) {
            // Not enough data for reliable ranges
            return {
                optimal: { min: 0, max: 0 },
                acceptable: { min: 0, max: 0 },
                profitableMean: 0,
                unprofitableMean: 0,
                signal: "INSUFFICIENT_DATA",
                sampleSize: profitableValues.length
            };
        }
        
        // Calculate statistics
        const sortedProfitable = profitableValues.sort((a, b) => a - b);
        const profitableMean = profitableValues.reduce((sum, v) => sum + v, 0) / profitableValues.length;
        const unprofitableMean = unprofitableValues.length > 0 
            ? unprofitableValues.reduce((sum, v) => sum + v, 0) / unprofitableValues.length
            : profitableMean;
        
        // Define optimal range (middle 50% of profitable trades - Q25 to Q75)
        const q25Index = Math.floor(sortedProfitable.length * 0.25);
        const q75Index = Math.floor(sortedProfitable.length * 0.75);
        const optimalRange = {
            min: sortedProfitable[q25Index],
            max: sortedProfitable[q75Index]
        };
        
        // Define acceptable range (middle 80% of profitable trades - P10 to P90)
        const p10Index = Math.floor(sortedProfitable.length * 0.1);
        const p90Index = Math.floor(sortedProfitable.length * 0.9);
        const acceptableRange = {
            min: sortedProfitable[p10Index],
            max: sortedProfitable[p90Index]
        };
        
        // Determine signal direction (higher or lower values are better)
        const meanDiff = profitableMean - unprofitableMean;
        const signal = Math.abs(meanDiff) > 0.001 
            ? (meanDiff > 0 ? "HIGHER_IS_BETTER" : "LOWER_IS_BETTER")
            : "NEUTRAL";
        
        return {
            optimal: optimalRange,
            acceptable: acceptableRange,
            profitableMean,
            unprofitableMean,
            signal,
            sampleSize: profitableValues.length
        };
    }

    extractFeatureValues(vectors, featureName) {
        const values = [];
        for (const vector of vectors) {
            if (!vector.featuresJson) continue;
            
            try {
                const features = JSON.parse(vector.featuresJson);
                const value = features[featureName];
                if (typeof value === 'number' && !isNaN(value)) {
                    values.push(value);
                }
            } catch (e) {
                continue;
            }
        }
        return values;
    }

    normalizeInstrumentName(instrument) {
        if (!instrument) return 'UNKNOWN';
        
        // Extract base symbol from contract name
        // Examples: "MGC AUG25" -> "MGC", "ES SEP25" -> "ES", "NQ DEC24" -> "NQ", "MNQ SEP25" -> "MNQ"
        const parts = instrument.trim().split(/\s+/);
        const normalized = parts[0].toUpperCase();
        
        // DEBUG: Log normalization for MNQ instruments
        if (instrument.toUpperCase().includes('MNQ')) {
            // Removed verbose normalization logging
        }
        
        return normalized;
    }

    getVectorsForInstrumentDirection(instrument, direction) {
        // Normalize the requested instrument name
        const normalizedInstrument = this.normalizeInstrumentName(instrument);
        
        // Get vectors for normalized instrument
        const instrumentVectors = this.vectorsByInstrument.get(normalizedInstrument) || [];
        
        return instrumentVectors.filter(v => v.direction === direction);
    }
    
    getRecentVectorsForInstrumentDirection(instrument, direction) {
        // Normalize the requested instrument name
        const normalizedInstrument = this.normalizeInstrumentName(instrument);
        
        // Get vectors for normalized instrument, but only RECENT dataType
        const instrumentVectors = this.vectorsByInstrument.get(normalizedInstrument) || [];
        
        return instrumentVectors.filter(v => 
            v.direction === direction && 
            (v.dataType === 'RECENT' || !v.dataType) // Include legacy records without dataType
        );
    }

    startBackgroundTasks() {
        console.log('[MEMORY-MANAGER] Starting background tasks...');
        
        // Check for new vectors every 30 seconds
        this.vectorCheckInterval = setInterval(() => {
            this.checkForNewVectors().catch(err => {
                console.error('[MEMORY-MANAGER] Error checking for new vectors:', err.message);
            });
        }, 30000);
        
        console.log('[MEMORY-MANAGER] ✅ Background tasks started (30-second vector check interval)');
    }

    async checkForNewVectors() {
        try {
            // Get current vector count from storage
            const stats = await this.storageClient.getStats();
            const currentCount = stats?.totalVectors || 0;
            
            if (currentCount > this.lastVectorCount) {
                const newVectors = currentCount - this.lastVectorCount;
                console.log(`[MEMORY-MANAGER] 📊 Detected ${newVectors} new vectors (${this.lastVectorCount} -> ${currentCount})`);
                
                // Reload vectors
                await this.loadNewVectors();
                
                // Check if graduation update needed based on bar time
                await this.checkGraduationUpdateByBarTime();
                
                this.lastVectorCount = currentCount;
            }
            
        } catch (error) {
            console.error('[MEMORY-MANAGER] Error in checkForNewVectors:', error.message);
        }
    }

    async loadNewVectors() {
        console.log('[MEMORY-MANAGER] Loading new vectors...');
        
        // For simplicity, reload all vectors (could be optimized to load only new ones)
        await this.loadAllVectors();
    }

    async checkGraduationUpdateByBarTime() {
        try {
            // Get the most recent bar time from stored vectors
            const latestBarTime = this.getLatestBarTime();
            
            if (!latestBarTime) {
                console.log('[MEMORY-MANAGER] No bar time available for graduation check');
                return;
            }
            
            // First time initialization
            if (!this.lastGraduationBarTime) {
                this.lastGraduationBarTime = latestBarTime;
                console.log(`[MEMORY-MANAGER] 🕒 Initialized graduation bar time: ${latestBarTime.toISOString()}`);
                return;
            }
            
            // Calculate time difference in minutes
            const timeDiffMinutes = (latestBarTime - this.lastGraduationBarTime) / (1000 * 60);
            
            if (timeDiffMinutes >= this.GRADUATION_INTERVAL_MINUTES) {
                console.log(`[MEMORY-MANAGER] ⏰ Graduation update triggered by bar time: ${timeDiffMinutes.toFixed(1)} minutes elapsed`);
                console.log(`[MEMORY-MANAGER] Last: ${this.lastGraduationBarTime.toISOString()} | Current: ${latestBarTime.toISOString()}`);
                
                this.triggerGraduationUpdates();
                this.lastGraduationBarTime = latestBarTime;
            } else {
                console.log(`[MEMORY-MANAGER] 🕒 Graduation check: ${timeDiffMinutes.toFixed(1)}/${this.GRADUATION_INTERVAL_MINUTES} minutes elapsed`);
            }
            
        } catch (error) {
            console.error('[MEMORY-MANAGER] Error in checkGraduationUpdateByBarTime:', error.message);
        }
    }

    getLatestBarTime() {
        let latestTime = null;
        
        // Find the most recent timestamp from all stored vectors
        for (const vector of this.vectors.values()) {
            if (vector.timestamp) {
                const barTime = new Date(vector.timestamp);
                if (!latestTime || barTime > latestTime) {
                    latestTime = barTime;
                }
            }
        }
        
        return latestTime;
    }

    triggerGraduationUpdates() {
        console.log('[MEMORY-MANAGER] 🔄 Triggering graduation table updates...');
        
        // Identify which graduation tables need updating
        const instruments = Array.from(this.vectorsByInstrument.keys());
        const directions = ['long', 'short'];
        
        for (const instrument of instruments) {
            for (const direction of directions) {
                const key = `${instrument}_${direction}`;
                this.graduationUpdateQueue.add(key);
            }
        }
        
        // Process updates asynchronously
        this.processGraduationUpdates();
    }

    async processGraduationUpdates() {
        if (this.graduationUpdateQueue.size === 0) return;
        
        console.log(`[MEMORY-MANAGER] 🔄 Processing ${this.graduationUpdateQueue.size} graduation updates...`);
        
        for (const key of this.graduationUpdateQueue) {
            try {
                const [instrument, direction] = key.split('_');
                const vectors = this.getVectorsForInstrumentDirection(instrument, direction);
                
                if (vectors.length >= 10) {
                    const graduationTable = await this.computeGraduationTable(instrument, direction, vectors);
                    this.graduationTables.set(key, graduationTable);
                    
                    console.log(`[MEMORY-MANAGER] ✅ Updated graduation table for ${key}: ${graduationTable.features.length} features`);
                }
                
            } catch (error) {
                console.error(`[MEMORY-MANAGER] Failed to update graduation for ${key}:`, error.message);
            }
        }
        
        this.graduationUpdateQueue.clear();
        console.log('[MEMORY-MANAGER] 🎯 Graduation updates complete');
    }

    // Public API for risk service
    getGraduationTable(instrument, direction) {
        // Normalize instrument name and create key
        const normalizedInstrument = this.normalizeInstrumentName(instrument);
        const key = `${normalizedInstrument}_${direction}`;
        
        return this.graduationTables.get(key);
    }

    calculateRangeBasedConfidence(queryFeatures, instrument, direction) {
        const graduationTable = this.getGraduationTable(instrument, direction);
        
        if (!graduationTable || !graduationTable.features) {
            return {
                overallConfidence: 0.5,
                approved: true,
                reason: "No graduation data available - using default",
                featureConfidences: [],
                rejectCount: 0
            };
        }
        
        const featureConfidences = [];
        let totalConfidence = 0;
        let rejectCount = 0;
        let validFeatures = 0;
        
        // Analyze each graduated feature
        for (const graduatedFeature of graduationTable.features) {
            const queryValue = queryFeatures[graduatedFeature.name];
            
            if (typeof queryValue !== 'number') continue;
            
            const confidence = this.calculateFeatureRangeConfidence(queryValue, graduatedFeature);
            featureConfidences.push({
                name: graduatedFeature.name,
                queryValue: queryValue,
                confidence: confidence.score,
                rating: confidence.rating,
                optimalRange: graduatedFeature.optimalRange,
                acceptableRange: graduatedFeature.acceptableRange,
                signal: graduatedFeature.signal
            });
            
            totalConfidence += confidence.score;
            validFeatures++;
            
            if (confidence.score < 0.3) {
                rejectCount++;
            }
        }
        
        const overallConfidence = validFeatures > 0 ? totalConfidence / validFeatures : 0.5;
        
        // Decision logic
        let approved = true;
        let reason = "Range-based analysis";
        
        if (rejectCount >= 3) {
            approved = false;
            reason = `${rejectCount} features in poor range (>=3 threshold)`;
        } else if (overallConfidence < 0.25) {
            approved = false;
            reason = `Overall confidence too low: ${(overallConfidence * 100).toFixed(1)}%`;
        } else if (overallConfidence < 0.4) {
            reason = `Low confidence conditions: ${(overallConfidence * 100).toFixed(1)}%`;
        } else if (overallConfidence > 0.7) {
            reason = `Optimal trading conditions: ${(overallConfidence * 100).toFixed(1)}%`;
        }
        
        return {
            overallConfidence,
            approved,
            reason,
            featureConfidences,
            rejectCount,
            validFeatures,
            graduationVersion: graduationTable.version || "legacy"
        };
    }

    calculateFeatureRangeConfidence(queryValue, graduatedFeature) {
        const { optimalRange, acceptableRange, signal } = graduatedFeature;
        
        // Handle edge cases
        if (!optimalRange || !acceptableRange) {
            return { score: 0.5, rating: "NO_RANGE_DATA" };
        }
        
        let score = 0;
        let rating = '';
        
        if (queryValue >= optimalRange.min && queryValue <= optimalRange.max) {
            // In optimal range - high confidence (0.8 - 1.0)
            const centerValue = (optimalRange.min + optimalRange.max) / 2;
            const centerDistance = Math.abs(queryValue - centerValue);
            const rangeWidth = optimalRange.max - optimalRange.min;
            
            if (rangeWidth === 0) {
                score = 0.9; // Exact match for point range
            } else {
                score = 0.8 + (0.2 * (1 - centerDistance / (rangeWidth / 2)));
            }
            rating = 'OPTIMAL';
            
        } else if (queryValue >= acceptableRange.min && queryValue <= acceptableRange.max) {
            // In acceptable range - medium confidence (0.4 - 0.8)
            const distanceFromOptimal = Math.min(
                Math.abs(queryValue - optimalRange.min),
                Math.abs(queryValue - optimalRange.max)
            );
            const maxDistance = Math.max(
                optimalRange.min - acceptableRange.min,
                acceptableRange.max - optimalRange.max
            );
            
            if (maxDistance === 0) {
                score = 0.6; // Acceptable but not optimal
            } else {
                score = 0.4 + (0.4 * (1 - distanceFromOptimal / maxDistance));
            }
            rating = 'ACCEPTABLE';
            
        } else {
            // Outside acceptable range - low confidence (0.1 - 0.4)
            const distanceFromAcceptable = Math.min(
                Math.abs(queryValue - acceptableRange.min),
                Math.abs(queryValue - acceptableRange.max)
            );
            const rangeWidth = acceptableRange.max - acceptableRange.min;
            
            if (rangeWidth === 0) {
                score = 0.1; // Point range, way off
            } else {
                score = Math.max(0.1, 0.4 * Math.exp(-distanceFromAcceptable / rangeWidth));
            }
            rating = 'POOR';
        }
        
        return {
            score: Math.min(1.0, Math.max(0.0, score)),
            rating
        };
    }

    // Legacy method for backward compatibility - now redirects to range-based
    findSimilarPatterns(features, instrument, direction, limit = 25) {
        const confidence = this.calculateRangeBasedConfidence(features, instrument, direction);
        
        // Return confidence data in legacy format for compatibility
        return [{
            _confidence_analysis: confidence,
            _legacy_similarity_deprecated: true,
            overallConfidence: confidence.overallConfidence,
            approved: confidence.approved,
            reason: confidence.reason
        }];
    }

    // Deprecated similarity methods - replaced by range-based confidence
    // Kept for legacy compatibility during transition
    calculateGraduatedSimilarity(queryFeatures, vector, graduatedFeatureNames) {
        console.warn('[MEMORY-MANAGER] DEPRECATED: calculateGraduatedSimilarity called - use calculateRangeBasedConfidence instead');
        return 0.5; // Default similarity for legacy compatibility
    }

    calculateFeatureSimilarity(val1, val2) {
        console.warn('[MEMORY-MANAGER] DEPRECATED: calculateFeatureSimilarity called - use range-based confidence instead');
        return 0.5; // Default similarity for legacy compatibility
    }

    getStats() {
        return {
            vectorCount: this.vectors.size,
            instrumentCount: this.vectorsByInstrument.size,
            graduationTableCount: this.graduationTables.size,
            isInitialized: this.isInitialized,
            lastUpdateTime: this.lastUpdateTime,
            instruments: Array.from(this.vectorsByInstrument.keys()),
            graduationTables: Array.from(this.graduationTables.keys())
        };
    }

    shutdown() {
        if (this.vectorCheckInterval) {
            clearInterval(this.vectorCheckInterval);
            this.vectorCheckInterval = null;
        }
        console.log('[MEMORY-MANAGER] 🛑 Shutdown complete');
    }
}

module.exports = MemoryManager;