/**
 * Historical Data Exporter for GP Training
 * Exports LanceDB vectors to format suitable for GP training
 */

const vectorStore = require('../storage-agent/src/vectorStore');
const TrajectoryClassifier = require('./trajectoryClassifier');
const fs = require('fs').promises;
const path = require('path');

class GPDataExporter {
  constructor() {
    this.outputDir = './training_data';
    this.trajectoryClassifier = new TrajectoryClassifier();
  }

  async initialize() {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Initialize vector store
    await vectorStore.initialize();
    console.log('[GP-EXPORTER] Vector store initialized');
  }

  async exportTrainingData() {
    try {
      console.log('[GP-EXPORTER] Starting historical data export...');
      
      // Get all vectors from storage
      const allVectors = await vectorStore.getVectors({ limit: 100000 });
      console.log(`[GP-EXPORTER] Retrieved ${allVectors.length} historical vectors`);
      
      if (allVectors.length === 0) {
        console.log('[GP-EXPORTER] No historical data found');
        return;
      }

      // Group by instrument and direction
      const groupedData = this.groupVectorsByInstrumentDirection(allVectors);
      
      // Export each group
      for (const [key, vectors] of Object.entries(groupedData)) {
        const [instrument, direction] = key.split('_');
        await this.exportGroupData(instrument, direction, vectors);
      }
      
      console.log('[GP-EXPORTER] Export completed');
      
    } catch (error) {
      console.error('[GP-EXPORTER] Export failed:', error);
      throw error;
    }
  }

  groupVectorsByInstrumentDirection(vectors) {
    const groups = {};
    
    vectors.forEach(vector => {
      // Clean instrument name (remove contract month)
      const cleanInstrument = this.cleanInstrumentName(vector.instrument);
      const direction = vector.direction || 'unknown';
      const key = `${cleanInstrument}_${direction}`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      
      groups[key].push(vector);
    });
    
    // Filter out groups with too few samples
    const filteredGroups = {};
    for (const [key, vectors] of Object.entries(groups)) {
      if (vectors.length >= 10) { // Minimum samples for GP training
        filteredGroups[key] = vectors;
        console.log(`[GP-EXPORTER] Group ${key}: ${vectors.length} samples`);
      } else {
        console.log(`[GP-EXPORTER] Skipping ${key}: only ${vectors.length} samples`);
      }
    }
    
    return filteredGroups;
  }

  cleanInstrumentName(instrument) {
    // Remove contract month suffixes (e.g., "MGC AUG25" -> "MGC")
    if (!instrument) return 'UNKNOWN';
    return instrument.split(' ')[0];
  }

  async exportGroupData(instrument, direction, vectors) {
    try {
      console.log(`[GP-EXPORTER] Exporting ${instrument}_${direction}: ${vectors.length} samples`);
      
      const trainingData = this.prepareTrainingData(vectors);
      
      if (trainingData.features.length === 0) {
        console.log(`[GP-EXPORTER] No valid training data for ${instrument}_${direction}`);
        return;
      }
      
      // Save as JSON for Python consumption
      const filename = `${instrument}_${direction}_training.json`;
      const filepath = path.join(this.outputDir, filename);
      
      const exportData = {
        instrument,
        direction,
        sample_count: trainingData.features.length,
        feature_count: trainingData.feature_names.length,
        feature_names: trainingData.feature_names,
        export_timestamp: new Date().toISOString(),
        data: trainingData
      };
      
      await fs.writeFile(filepath, JSON.stringify(exportData, null, 2));
      console.log(`[GP-EXPORTER] Saved ${filename}: ${trainingData.features.length} samples, ${trainingData.feature_names.length} features`);
      
    } catch (error) {
      console.error(`[GP-EXPORTER] Failed to export ${instrument}_${direction}:`, error);
    }
  }

  prepareTrainingData(vectors) {
    const features = [];
    const pnlTargets = [];
    const trajectoryTargets = [];
    const riskTargets = [];
    let featureNames = null;
    
    vectors.forEach(vector => {
      try {
        // Parse features from JSON
        const featuresJson = vector.featuresJson || '{}';
        const vectorFeatures = JSON.parse(featuresJson);
        
        // Skip if no features or no PnL data
        if (Object.keys(vectorFeatures).length === 0 || vector.pnl === undefined) {
          return;
        }
        
        // Initialize feature names from first valid vector
        if (!featureNames) {
          featureNames = Object.keys(vectorFeatures).sort();
          console.log(`[GP-EXPORTER] Feature names initialized: ${featureNames.length} features`);
        }
        
        // Extract feature values in consistent order
        const baseFeatureValues = featureNames.map(name => {
          const value = vectorFeatures[name];
          return typeof value === 'number' && !isNaN(value) ? value : 0;
        });
        
        // Get trajectory classification features
        let trajectoryFeatures = [];
        let trajectoryFeatureNames = [];
        
        if (vector.profitByBarJson) {
          try {
            const trajectoryData = JSON.parse(vector.profitByBarJson);
            const classification = this.trajectoryClassifier.classifyTrajectory(trajectoryData, vector.pnl);
            trajectoryFeatures = classification.combined_features;
            trajectoryFeatureNames = classification.feature_names;
            
            console.log(`[GP-EXPORTER] Trajectory classified as: ${classification.pattern_name}`);
          } catch (e) {
            console.warn(`[GP-EXPORTER] Failed to classify trajectory, using defaults:`, e.message);
            const defaultClassification = this.trajectoryClassifier.getDefaultFeatures();
            trajectoryFeatures = defaultClassification.combined_features;
            trajectoryFeatureNames = defaultClassification.feature_names;
          }
        } else {
          // Use default trajectory features if no trajectory data
          const defaultClassification = this.trajectoryClassifier.getDefaultFeatures();
          trajectoryFeatures = defaultClassification.combined_features;
          trajectoryFeatureNames = defaultClassification.feature_names;
        }
        
        // Combine base features with trajectory features
        const combinedFeatureValues = [...baseFeatureValues, ...trajectoryFeatures];
        
        // Update feature names to include trajectory features (only on first vector)
        if (!featureNames.includes('pattern_v_recovery')) {
          featureNames = [...featureNames, ...trajectoryFeatureNames];
          console.log(`[GP-EXPORTER] Enhanced features: ${featureNames.length} total (${baseFeatureValues.length} base + ${trajectoryFeatures.length} trajectory)`);
        }
        
        // PnL target
        const pnl = typeof vector.pnl === 'number' ? vector.pnl : 0;
        
        // Trajectory target (if available)
        let trajectory = null;
        if (vector.profitByBarJson) {
          try {
            const trajectoryData = JSON.parse(vector.profitByBarJson);
            trajectory = this.parseTrajectory(trajectoryData);
          } catch (e) {
            // Use fallback trajectory
            trajectory = this.createFallbackTrajectory(pnl, vector.holdingBars || 10);
          }
        } else {
          // Create synthetic trajectory from available data
          trajectory = this.createFallbackTrajectory(pnl, vector.holdingBars || 10);
        }
        
        // Risk targets (SL, TP)
        const riskTarget = [
          vector.stopLoss || 25,
          vector.takeProfit || 50
        ];
        
        // Add to training data (use combined features)
        features.push(combinedFeatureValues);
        pnlTargets.push(pnl);
        trajectoryTargets.push(trajectory);
        riskTargets.push(riskTarget);
        
      } catch (error) {
        console.error('[GP-EXPORTER] Error processing vector:', error.message);
      }
    });
    
    return {
      features,
      pnl_targets: pnlTargets,
      trajectory_targets: trajectoryTargets,
      risk_targets: riskTargets,
      feature_names: featureNames || []
    };
  }

  parseTrajectory(trajectoryData) {
    // Convert trajectory object to fixed-length array (50 bars)
    const trajectory = new Array(50).fill(0);
    
    if (typeof trajectoryData === 'object') {
      // Get max bar index
      const barIndices = Object.keys(trajectoryData).map(k => parseInt(k)).filter(k => !isNaN(k));
      const maxBar = barIndices.length > 0 ? Math.max(...barIndices) : 0;
      
      // Fill trajectory array
      for (let i = 0; i <= Math.min(maxBar, 49); i++) {
        const value = trajectoryData[i.toString()] || trajectoryData[i] || 0;
        trajectory[i] = typeof value === 'number' ? value : 0;
      }
    }
    
    return trajectory;
  }

  createFallbackTrajectory(finalPnl, holdingBars) {
    // Create synthetic trajectory from final PnL and holding period
    const trajectory = new Array(50).fill(0);
    const bars = Math.min(holdingBars, 50);
    
    if (bars > 0) {
      // Simple linear progression to final PnL
      for (let i = 0; i < bars; i++) {
        const progress = (i + 1) / bars;
        trajectory[i] = finalPnl * progress;
      }
      
      // Fill remaining bars with final value
      for (let i = bars; i < 50; i++) {
        trajectory[i] = finalPnl;
      }
    }
    
    return trajectory;
  }

  async generateSummaryReport() {
    try {
      const files = await fs.readdir(this.outputDir);
      const trainingFiles = files.filter(f => f.endsWith('_training.json'));
      
      const summary = {
        export_timestamp: new Date().toISOString(),
        total_datasets: trainingFiles.length,
        datasets: []
      };
      
      for (const file of trainingFiles) {
        const filepath = path.join(this.outputDir, file);
        const data = JSON.parse(await fs.readFile(filepath, 'utf8'));
        
        summary.datasets.push({
          instrument: data.instrument,
          direction: data.direction,
          sample_count: data.sample_count,
          feature_count: data.feature_count,
          filename: file
        });
      }
      
      // Save summary
      await fs.writeFile(
        path.join(this.outputDir, 'export_summary.json'),
        JSON.stringify(summary, null, 2)
      );
      
      console.log('[GP-EXPORTER] Summary report generated');
      console.log(`[GP-EXPORTER] Total datasets: ${summary.total_datasets}`);
      summary.datasets.forEach(ds => {
        console.log(`  ${ds.instrument}_${ds.direction}: ${ds.sample_count} samples`);
      });
      
    } catch (error) {
      console.error('[GP-EXPORTER] Failed to generate summary:', error);
    }
  }
}

// Main execution
async function main() {
  const exporter = new GPDataExporter();
  
  try {
    await exporter.initialize();
    await exporter.exportTrainingData();
    await exporter.generateSummaryReport();
    
    console.log('[GP-EXPORTER] Export process completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('[GP-EXPORTER] Export process failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = GPDataExporter;