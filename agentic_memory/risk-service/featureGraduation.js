/**
 * Feature Graduation System for Agentic Memory Risk Agent
 * 
 * This module implements dynamic feature importance analysis and graduation.
 * It continuously evaluates which features are most predictive for risk decisions.
 */

const axios = require('axios');

class FeatureGraduation {
    constructor(instrument = null, direction = null, storageUrl = 'http://localhost:3015') {
        this.storageUrl = storageUrl;
        this.instrument = instrument;
        this.direction = direction;
        this.context = instrument && direction ? `${instrument}_${direction}` : 'global';
        
        // Initial graduated feature set (start with domain knowledge)
        this.graduatedFeatures = [
            'volume_spike_ratio',
            'body_ratio', 
            'upper_wick_ratio',
            'lower_wick_ratio',
            'rsi_14',
            'price_momentum_5min',
            'atr_pct',
            'bb_position',
            'mtf_trend_alignment_score',
            'mtf_volume_alignment_score',
            // Trajectory pattern features
            'pattern_v_recovery',
            'pattern_steady_climb',
            'pattern_failed_breakout',
            'pattern_whipsaw',
            'pattern_grinder',
            'traj_max_drawdown_norm',
            'traj_recovery_speed_norm',
            'traj_trend_strength_norm'
        ];
        
        // Feature performance tracking
        this.featurePerformance = new Map();
        this.lastGraduationUpdate = Date.now();
        this.graduationInterval = 30 * 60 * 1000; // 30 minutes
        
        // Configuration
        this.config = {
            minSampleSize: 30,           // Minimum patterns needed for graduation (reduced for instrument-specific)
            correlationThreshold: 0.12,  // Minimum correlation with PnL (slightly lower for smaller datasets)
            stabilityWindow: 50,         // Rolling window for stability analysis (reduced for instrument-specific)
            maxGraduatedFeatures: 15,    // Maximum features in graduated set
            minGraduatedFeatures: 6      // Minimum features in graduated set
        };
        
        console.log(`[GRADUATION] Initialized ${this.context} graduation with ${this.graduatedFeatures.length} initial features`);
    }

    /**
     * Get current graduated feature set
     */
    getGraduatedFeatures() {
        return [...this.graduatedFeatures];
    }

    /**
     * Extract only graduated features from full feature set
     */
    extractGraduatedFeatures(allFeatures) {
        const graduatedSubset = {};
        
        for (const featureName of this.graduatedFeatures) {
            if (allFeatures.hasOwnProperty(featureName)) {
                graduatedSubset[featureName] = allFeatures[featureName];
            }
        }
        
        // Add feature count for debugging
        graduatedSubset._graduation_info = {
            total_available: Object.keys(allFeatures).length,
            graduated_count: Object.keys(graduatedSubset).length - 1, // -1 for _graduation_info
            missing_features: this.graduatedFeatures.filter(f => !allFeatures.hasOwnProperty(f))
        };
        
        return graduatedSubset;
    }

    /**
     * Check if it's time to update graduated features
     */
    shouldUpdateGraduation() {
        return (Date.now() - this.lastGraduationUpdate) > this.graduationInterval;
    }

    /**
     * Analyze feature importance from stored vectors
     */
    async analyzeFeatureImportance() {
        try {
            console.log(`[GRADUATION] Starting ${this.context} feature importance analysis...`);
            
            // Get stored vectors with instrument and direction filtering
            let url = `${this.storageUrl}/api/vectors?limit=1000`;
            if (this.instrument) {
                url += `&instrument=${this.instrument}`;
            }
            
            const response = await axios.get(url, {
                timeout: 10000
            });
            
            if (!response.data?.success || !response.data.vectors || response.data.vectors.length === 0) {
                console.log(`[GRADUATION] No vectors available for ${this.context}: ${response.data?.vectors?.length || 0} vectors`);
                return null;
            }
            
            let vectors = response.data.vectors;
            
            // Filter by direction if specified
            if (this.direction) {
                vectors = vectors.filter(v => v.direction === this.direction);
                console.log(`[GRADUATION] Filtered to ${vectors.length} ${this.direction} vectors for ${this.instrument}`);
            }
            
            if (vectors.length < this.config.minSampleSize) {
                console.log(`[GRADUATION] Insufficient ${this.context} data for analysis: ${vectors.length}/${this.config.minSampleSize} required`);
                return null;
            }
            
            console.log(`[GRADUATION] Analyzing ${vectors.length} ${this.context} vectors for feature importance`);
            
            // Parse features and calculate correlations
            const featureCorrelations = this.calculateFeatureCorrelations(vectors);
            
            // Analyze feature stability
            const featureStability = this.calculateFeatureStability(vectors);
            
            // Combine correlation and stability scores
            const featureScores = this.combineFeatureScores(featureCorrelations, featureStability);
            
            console.log(`[GRADUATION] Calculated importance for ${Object.keys(featureScores).length} features`);
            
            return featureScores;
            
        } catch (error) {
            console.error(`[GRADUATION] Failed to analyze feature importance:`, error.message);
            return null;
        }
    }

    /**
     * Calculate correlation between features and PnL outcomes
     */
    calculateFeatureCorrelations(vectors) {
        const featureCorrelations = {};
        const featureValues = {};
        const pnlValues = [];
        
        // Extract feature values and PnL
        vectors.forEach(vector => {
            if (!vector.featuresJson || !vector.pnl) return;
            
            try {
                const features = JSON.parse(vector.featuresJson);
                pnlValues.push(vector.pnl);
                
                Object.entries(features).forEach(([featureName, value]) => {
                    if (typeof value === 'number' && !isNaN(value)) {
                        if (!featureValues[featureName]) {
                            featureValues[featureName] = [];
                        }
                        featureValues[featureName].push(value);
                    }
                });
            } catch (e) {
                // Skip invalid JSON
            }
        });
        
        // Calculate Pearson correlation for each feature
        Object.entries(featureValues).forEach(([featureName, values]) => {
            if (values.length === pnlValues.length && values.length >= this.config.minSampleSize) {
                const correlation = this.calculatePearsonCorrelation(values, pnlValues);
                featureCorrelations[featureName] = {
                    correlation: Math.abs(correlation), // Use absolute correlation
                    sample_size: values.length,
                    raw_correlation: correlation
                };
            }
        });
        
        return featureCorrelations;
    }

    /**
     * Calculate feature stability (low variance = more stable)
     */
    calculateFeatureStability(vectors) {
        const featureStability = {};
        const featureValues = {};
        
        // Collect feature values
        vectors.forEach(vector => {
            if (!vector.featuresJson) return;
            
            try {
                const features = JSON.parse(vector.featuresJson);
                
                Object.entries(features).forEach(([featureName, value]) => {
                    if (typeof value === 'number' && !isNaN(value)) {
                        if (!featureValues[featureName]) {
                            featureValues[featureName] = [];
                        }
                        featureValues[featureName].push(value);
                    }
                });
            } catch (e) {
                // Skip invalid JSON
            }
        });
        
        // Calculate coefficient of variation (CV) for stability
        Object.entries(featureValues).forEach(([featureName, values]) => {
            if (values.length >= this.config.minSampleSize) {
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);
                
                // Coefficient of variation (lower = more stable)
                const cv = mean !== 0 ? stdDev / Math.abs(mean) : 1;
                
                featureStability[featureName] = {
                    cv: cv,
                    stability_score: Math.max(0, 1 - cv), // Higher score = more stable
                    mean: mean,
                    std_dev: stdDev,
                    sample_size: values.length
                };
            }
        });
        
        return featureStability;
    }

    /**
     * Combine correlation and stability scores
     */
    combineFeatureScores(correlations, stability) {
        const combinedScores = {};
        
        // Get all features that have both correlation and stability data
        const allFeatures = new Set([
            ...Object.keys(correlations),
            ...Object.keys(stability)
        ]);
        
        allFeatures.forEach(featureName => {
            const correlation = correlations[featureName];
            const stabilityData = stability[featureName];
            
            if (correlation && stabilityData) {
                // Combine scores: 70% correlation importance, 30% stability
                const combinedScore = (correlation.correlation * 0.7) + (stabilityData.stability_score * 0.3);
                
                combinedScores[featureName] = {
                    combined_score: combinedScore,
                    correlation: correlation.correlation,
                    stability: stabilityData.stability_score,
                    sample_size: Math.min(correlation.sample_size, stabilityData.sample_size),
                    meets_threshold: correlation.correlation >= this.config.correlationThreshold
                };
            }
        });
        
        return combinedScores;
    }

    /**
     * Update graduated features based on importance analysis
     */
    async updateGraduatedFeatures() {
        try {
            console.log(`[GRADUATION] Updating graduated features...`);
            
            const featureScores = await this.analyzeFeatureImportance();
            
            if (!featureScores) {
                console.log(`[GRADUATION] Skipping update - no feature scores available`);
                return false;
            }
            
            // Sort features by combined score
            const sortedFeatures = Object.entries(featureScores)
                .filter(([name, data]) => data.meets_threshold)
                .sort(([, a], [, b]) => b.combined_score - a.combined_score);
            
            // Select top features within bounds
            const targetCount = Math.min(
                Math.max(sortedFeatures.length, this.config.minGraduatedFeatures),
                this.config.maxGraduatedFeatures
            );
            
            const newGraduatedFeatures = sortedFeatures
                .slice(0, targetCount)
                .map(([name]) => name);
            
            // Track changes
            const added = newGraduatedFeatures.filter(f => !this.graduatedFeatures.includes(f));
            const removed = this.graduatedFeatures.filter(f => !newGraduatedFeatures.includes(f));
            
            // Update feature set
            this.graduatedFeatures = newGraduatedFeatures;
            this.lastGraduationUpdate = Date.now();
            
            console.log(`[GRADUATION] Updated feature set: ${this.graduatedFeatures.length} features`);
            if (added.length > 0) {
                console.log(`[GRADUATION] Added features:`, added.slice(0, 5));
            }
            if (removed.length > 0) {
                console.log(`[GRADUATION] Removed features:`, removed.slice(0, 5));
            }
            
            // Log top performing features
            console.log(`[GRADUATION] Top 5 features by score:`);
            sortedFeatures.slice(0, 5).forEach(([name, data], index) => {
                console.log(`   ${index + 1}. ${name}: ${data.combined_score.toFixed(3)} (corr: ${data.correlation.toFixed(3)}, stab: ${data.stability.toFixed(3)})`);
            });
            
            return true;
            
        } catch (error) {
            console.error(`[GRADUATION] Failed to update graduated features:`, error.message);
            return false;
        }
    }

    /**
     * Calculate Pearson correlation coefficient
     */
    calculatePearsonCorrelation(x, y) {
        if (x.length !== y.length || x.length === 0) return 0;
        
        const n = x.length;
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
        const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Get graduation statistics
     */
    getGraduationStats() {
        return {
            current_features: this.graduatedFeatures,
            feature_count: this.graduatedFeatures.length,
            last_update: new Date(this.lastGraduationUpdate).toISOString(),
            next_update_due: new Date(this.lastGraduationUpdate + this.graduationInterval).toISOString(),
            update_interval_mins: this.graduationInterval / (60 * 1000),
            config: this.config
        };
    }
}

module.exports = FeatureGraduation;