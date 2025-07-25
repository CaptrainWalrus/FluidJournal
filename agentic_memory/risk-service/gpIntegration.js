/**
 * GP Integration Module for Risk Agent
 * Provides seamless integration between Risk Agent and GP Service
 */

const axios = require('axios');

class GPIntegration {
  constructor() {
    this.gpBridgeUrl = process.env.GP_BRIDGE_URL || 'http://localhost:3020';
    this.enabled = process.env.ENABLE_GP_INTEGRATION !== 'false';
    this.fallbackToRange = process.env.GP_FALLBACK_TO_RANGE !== 'false';
    
    // Initialize axios client
    this.gpClient = axios.create({
      baseURL: this.gpBridgeUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[GP-INTEGRATION] Initialized - Enabled: ${this.enabled}, Bridge: ${this.gpBridgeUrl}`);
  }

  async isGPServiceAvailable() {
    try {
      const response = await this.gpClient.get('/health');
      return response.status === 200 && response.data.python_service === 'connected';
    } catch (error) {
      return false;
    }
  }

  async getGPPrediction(instrument, direction, features) {
    try {
      if (!this.enabled) {
        throw new Error('GP integration disabled');
      }

      console.log(`[GP-INTEGRATION] Requesting GP prediction for ${instrument}_${direction}`);
      
      const response = await this.gpClient.post('/api/predict', {
        instrument,
        direction,
        features
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      // Debug the raw response
      console.log('[GP-INTEGRATION] Raw response from GP service:', JSON.stringify(response.data, null, 2));
      
      // Handle the nested prediction structure
      const prediction = response.data.prediction || response.data;
      
      console.log('[GP-INTEGRATION] Extracted prediction structure:');
      console.log('  - Type:', typeof prediction);
      console.log('  - Keys:', prediction ? Object.keys(prediction) : 'null/undefined');
      console.log('  - Confidence:', prediction?.confidence);
      console.log('  - PnL object:', prediction?.pnl);
      
      console.log(`[GP-INTEGRATION] GP prediction received: confidence=${prediction?.confidence?.toFixed(3)}`);
      
      return prediction;

    } catch (error) {
      console.error(`[GP-INTEGRATION] GP prediction failed: ${error.message}`);
      throw new Error(`GP_SERVICE_UNAVAILABLE: ${error.message}`);
    }
  }

  async evaluateRiskWithGP(riskData) {
    const { instrument, direction, features, entrySignalId } = riskData;
    
    try {
      // Get GP prediction
      const gpResult = await this.getGPPrediction(instrument, direction, features);
      
      // Extract values from GP prediction structure
      const pnlMean = gpResult.pnl?.mean || 0;
      const pnlStd = gpResult.pnl?.std || 50;
      const confidence = gpResult.confidence || 0.5;
      const suggestedSl = gpResult.risk?.suggested_sl || 10;
      const suggestedTp = gpResult.risk?.suggested_tp || 18;
      
      // Determine approval based on PnL prediction
      // Let the confidence engine determine final approval threshold
      const approved = pnlMean > -10; // Approve unless strongly negative
      
      // Convert to Risk Agent format
      const riskResponse = {
        approved: approved,
        confidence: confidence,
        suggested_sl: suggestedSl,
        suggested_tp: suggestedTp,
        stopLoss: suggestedSl,  // Add these for server.js compatibility
        takeProfit: suggestedTp,
        reasons: [],
        method: 'gaussian_process',
        gpDetails: {
          pnl: {
            mean: pnlMean,
            std: pnlStd,
            confidence_interval: gpResult.pnl?.confidence_interval
          },
          trajectory: gpResult.trajectory,
          expected_pnl: pnlMean,
          uncertainty: pnlStd,
          confidence_interval: gpResult.pnl?.confidence_interval,
          model_info: gpResult.model_info
        }
      };

      // Add GP-specific insights
      if (pnlStd < 20) {
        riskResponse.reasons.push('High prediction certainty - reliable signal');
      } else if (pnlStd > 50) {
        riskResponse.reasons.push('High prediction uncertainty - proceed with caution');
      }
      
      if (pnlMean > 50) {
        riskResponse.reasons.push(`Strong profit potential predicted: $${pnlMean.toFixed(2)}`);
      } else if (pnlMean < -20) {
        riskResponse.reasons.push(`Loss predicted: $${pnlMean.toFixed(2)} - consider avoiding`);
      }


      console.log(`[GP-INTEGRATION] Risk evaluation completed for ${entrySignalId}: ${riskResponse.approved ? 'APPROVED' : 'REJECTED'}`);
      
      return riskResponse;

    } catch (error) {
      console.error(`[GP-INTEGRATION] GP evaluation failed for ${entrySignalId}: ${error.message}`);
      
      // NO FALLBACKS - throw the error to expose the real problem
      throw new Error(`GP_EVALUATION_FAILED: ${error.message}`);
    }
  }

  async trainGPModel(instrument, direction, trainingData) {
    try {
      console.log(`[GP-INTEGRATION] Training GP model for ${instrument}_${direction}`);
      
      const response = await this.gpClient.post('/api/train', {
        instrument,
        direction,
        trainingData
      });

      console.log(`[GP-INTEGRATION] Training completed for ${instrument}_${direction}: ${response.data.success ? 'SUCCESS' : 'FAILED'}`);
      
      return response.data;

    } catch (error) {
      console.error(`[GP-INTEGRATION] Training failed for ${instrument}_${direction}: ${error.message}`);
      throw error;
    }
  }

  async updateGPModel(instrument, direction, features, actualPnl, actualTrajectory = null) {
    try {
      console.log(`[GP-INTEGRATION] Updating GP model for ${instrument}_${direction} with actual PnL: $${actualPnl}`);
      
      const response = await this.gpClient.post('/api/update', {
        instrument,
        direction,
        features,
        actualPnl,
        actualTrajectory
      });

      return response.data;

    } catch (error) {
      console.error(`[GP-INTEGRATION] Model update failed for ${instrument}_${direction}: ${error.message}`);
      // Don't throw - updates are not critical
      return { success: false, error: error.message };
    }
  }

  async getGPModelsStatus() {
    try {
      const response = await this.gpClient.get('/api/models/status');
      return response.data;
    } catch (error) {
      console.error(`[GP-INTEGRATION] Failed to get models status: ${error.message}`);
      return { models: {}, total_models: 0, error: error.message };
    }
  }

  extractGraduatedFeatures(allFeatures, graduatedFeatureNames) {
    // Convert feature object to graduated feature array
    const graduatedFeatures = [];
    
    if (Array.isArray(graduatedFeatureNames)) {
      graduatedFeatureNames.forEach(featureName => {
        const value = allFeatures[featureName];
        graduatedFeatures.push(typeof value === 'number' ? value : 0);
      });
    } else {
      // Fallback: use all features as array
      Object.keys(allFeatures).sort().forEach(key => {
        const value = allFeatures[key];
        graduatedFeatures.push(typeof value === 'number' ? value : 0);
      });
    }
    
    return graduatedFeatures;
  }

  cleanInstrumentName(instrument) {
    // Remove contract month suffixes for GP model lookup
    if (!instrument) return 'UNKNOWN';
    return instrument.split(' ')[0];
  }

  // Confidence scoring utilities
  calculateConfidenceScore(gpResult) {
    const baseConfidence = gpResult.confidence || 0.5;
    const uncertainty = gpResult.uncertainty || 50;
    
    // Adjust confidence based on uncertainty
    let adjustedConfidence = baseConfidence;
    
    if (uncertainty < 20) {
      adjustedConfidence *= 1.1; // Boost for low uncertainty
    } else if (uncertainty > 50) {
      adjustedConfidence *= 0.8; // Penalize high uncertainty
    }
    
    return Math.max(0.1, Math.min(0.95, adjustedConfidence));
  }

  // Risk parameter optimization from GP predictions
  optimizeRiskParameters(gpResult, maxSL = 50, maxTP = 150) {
    const expectedPnl = gpResult.expected_pnl || 0;
    const uncertainty = gpResult.uncertainty || 50;
    const confidence = gpResult.confidence || 0.5;
    
    // Base risk parameters
    let suggestedSL = gpResult.suggested_sl || 25;
    let suggestedTP = gpResult.suggested_tp || 50;
    
    // CORRECTED LOGIC: Adjust based on CONFIDENCE (not uncertainty)
    if (confidence > 0.8) {
      // HIGH CONFIDENCE - LOOSER stops (let the trade run)
      suggestedSL = Math.min(maxSL, suggestedSL * 1.4);  // Wider stop loss
      suggestedTP = Math.min(maxTP, suggestedTP * 1.3);  // Higher take profit
      console.log(`[GP-RISK] High confidence (${(confidence*100).toFixed(1)}%) → LOOSER risk: SL×1.4, TP×1.3`);
      
    } else if (confidence < 0.4) {
      // LOW CONFIDENCE - TIGHTER stops (cut losses quickly)
      suggestedSL = Math.max(10, suggestedSL * 0.6);     // Tighter stop loss
      suggestedTP = Math.max(20, suggestedTP * 0.7);     // Lower take profit
      console.log(`[GP-RISK] Low confidence (${(confidence*100).toFixed(1)}%) → TIGHTER risk: SL×0.6, TP×0.7`);
      
    } else {
      // MEDIUM CONFIDENCE - STANDARD stops
      console.log(`[GP-RISK] Medium confidence (${(confidence*100).toFixed(1)}%) → STANDARD risk: no adjustment`);
    }
    
    // Additional adjustment based on expected PnL
    if (expectedPnl > 50) {
      // High profit expectation - allow for more upside
      suggestedTP = Math.min(maxTP, Math.max(suggestedTP, expectedPnl * 0.8));
      console.log(`[GP-RISK] High expected PnL ($${expectedPnl.toFixed(0)}) → TP increased to capture profit`);
    } else if (expectedPnl < -20) {
      // Negative expectation - tighten stops regardless of confidence
      suggestedSL = Math.max(10, suggestedSL * 0.8);
      suggestedTP = Math.max(20, suggestedTP * 0.8);
      console.log(`[GP-RISK] Negative expected PnL ($${expectedPnl.toFixed(0)}) → Defensive risk tightening`);
    }
    
    return {
      suggested_sl: Math.round(suggestedSL * 100) / 100,
      suggested_tp: Math.round(suggestedTP * 100) / 100
    };
  }
}

module.exports = GPIntegration;