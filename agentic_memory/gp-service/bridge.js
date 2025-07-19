/**
 * Node.js Bridge to Python GP Service
 * Provides seamless integration between Risk Agent and GP predictions
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PYTHON_GP_URL = process.env.PYTHON_GP_URL || 'http://localhost:3020';
const BRIDGE_PORT = process.env.BRIDGE_PORT || 3021;

class GPServiceBridge {
  constructor() {
    this.pythonService = axios.create({
      baseURL: PYTHON_GP_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async checkPythonService() {
    try {
      const response = await this.pythonService.get('/health');
      return response.data;
    } catch (error) {
      console.error('Python GP service unavailable:', error.message);
      return null;
    }
  }

  async trainModel(instrument, direction, trainingData) {
    try {
      const response = await this.pythonService.post('/api/train', {
        instrument,
        direction,
        features: trainingData.features,
        pnl_targets: trainingData.pnl_targets,
        trajectory_targets: trainingData.trajectory_targets,
        risk_targets: trainingData.risk_targets
      });

      return response.data;
    } catch (error) {
      console.error(`Training failed for ${instrument}_${direction}:`, error.message);
      throw error;
    }
  }

  async predict(instrument, direction, features) {
    try {
      const response = await this.pythonService.post('/api/predict', {
        instrument,
        direction,
        features
      });

      return response.data;
    } catch (error) {
      console.error(`Prediction failed for ${instrument}_${direction}:`, error.message);
      throw error;
    }
  }

  async updateModel(instrument, direction, features, actualPnl, actualTrajectory = null) {
    try {
      const response = await this.pythonService.post('/api/update', {
        instrument,
        direction,
        features,
        actual_pnl: actualPnl,
        actual_trajectory: actualTrajectory
      });

      return response.data;
    } catch (error) {
      console.error(`Model update failed for ${instrument}_${direction}:`, error.message);
      throw error;
    }
  }

  async getModelsStatus() {
    try {
      const response = await this.pythonService.get('/api/models/status');
      return response.data;
    } catch (error) {
      console.error('Failed to get models status:', error.message);
      throw error;
    }
  }
}

const gpBridge = new GPServiceBridge();

// Health check
app.get('/health', async (req, res) => {
  const pythonHealth = await gpBridge.checkPythonService();
  
  res.json({
    status: 'healthy',
    service: 'gp-bridge',
    python_service: pythonHealth ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

// Training endpoint
app.post('/api/train', async (req, res) => {
  try {
    const { instrument, direction, trainingData } = req.body;
    
    if (!instrument || !direction || !trainingData) {
      return res.status(400).json({
        error: 'Missing required fields: instrument, direction, trainingData'
      });
    }

    console.log(`[GP-BRIDGE] Training ${instrument}_${direction} with ${trainingData.features?.length || 0} samples`);
    
    const result = await gpBridge.trainModel(instrument, direction, trainingData);
    
    console.log(`[GP-BRIDGE] Training completed for ${instrument}_${direction}`);
    res.json(result);

  } catch (error) {
    console.error('[GP-BRIDGE] Training error:', error.message);
    res.status(500).json({
      error: 'Training failed',
      message: error.message
    });
  }
});

// Prediction endpoint
app.post('/api/predict', async (req, res) => {
  try {
    const { instrument, direction, features } = req.body;
    
    if (!instrument || !direction || !features) {
      return res.status(400).json({
        error: 'Missing required fields: instrument, direction, features'
      });
    }

    console.log(`[GP-BRIDGE] Predicting for ${instrument}_${direction}`);
    
    const result = await gpBridge.predict(instrument, direction, features);
    
    console.log(`[GP-BRIDGE] Prediction completed: confidence=${result.prediction?.confidence?.toFixed(3)}, expected_pnl=${result.prediction?.pnl?.mean?.toFixed(2)}`);
    res.json(result);

  } catch (error) {
    console.error('[GP-BRIDGE] Prediction error:', error.message);
    res.status(500).json({
      error: 'Prediction failed',
      message: error.message
    });
  }
});

// Online learning endpoint
app.post('/api/update', async (req, res) => {
  try {
    const { instrument, direction, features, actualPnl, actualTrajectory } = req.body;
    
    if (!instrument || !direction || !features || actualPnl === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: instrument, direction, features, actualPnl'
      });
    }

    console.log(`[GP-BRIDGE] Updating ${instrument}_${direction} with actual PnL: $${actualPnl}`);
    
    const result = await gpBridge.updateModel(instrument, direction, features, actualPnl, actualTrajectory);
    
    res.json(result);

  } catch (error) {
    console.error('[GP-BRIDGE] Update error:', error.message);
    res.status(500).json({
      error: 'Update failed',
      message: error.message
    });
  }
});

// Models status endpoint
app.get('/api/models/status', async (req, res) => {
  try {
    const result = await gpBridge.getModelsStatus();
    res.json(result);
  } catch (error) {
    console.error('[GP-BRIDGE] Status error:', error.message);
    res.status(500).json({
      error: 'Failed to get models status',
      message: error.message
    });
  }
});

// Risk Agent integration endpoint
app.post('/api/evaluate-risk-gp', async (req, res) => {
  try {
    const { instrument, direction, features } = req.body;
    
    if (!instrument || !direction || !features) {
      return res.status(400).json({
        error: 'Missing required fields: instrument, direction, features'
      });
    }

    console.log(`[GP-BRIDGE] GP Risk evaluation for ${instrument}_${direction}`);
    
    const prediction = await gpBridge.predict(instrument, direction, features);
    
    if (!prediction.success) {
      throw new Error(prediction.error || 'Prediction failed');
    }

    const pred = prediction.prediction;
    
    // Convert GP predictions to Risk Agent format
    const response = {
      approved: pred.confidence > 0.5, // Approve if confident enough
      confidence: pred.confidence,
      suggested_sl: pred.risk?.suggested_sl || 25, // Fallback to default
      suggested_tp: pred.risk?.suggested_tp || 50, // Fallback to default
      expected_pnl: pred.pnl.mean,
      uncertainty: pred.pnl.std,
      confidence_interval: pred.pnl.confidence_interval,
      reasons: [
        `GP confidence: ${(pred.confidence * 100).toFixed(1)}%`,
        `Expected PnL: $${pred.pnl.mean.toFixed(2)} ± $${pred.pnl.std.toFixed(2)}`,
        `Prediction uncertainty: ${pred.pnl.std < 20 ? 'Low' : pred.pnl.std < 40 ? 'Medium' : 'High'}`
      ],
      method: 'gaussian_process',
      model_info: pred.model_info
    };

    console.log(`[GP-BRIDGE] GP Risk result: ${response.approved ? 'APPROVED' : 'REJECTED'} (${(response.confidence * 100).toFixed(1)}%)`);
    
    res.json(response);

  } catch (error) {
    console.error('[GP-BRIDGE] GP Risk evaluation error:', error.message);
    
    // Fallback response when GP fails
    res.json({
      approved: false,
      confidence: 0.3,
      suggested_sl: 25,
      suggested_tp: 50,
      expected_pnl: 0,
      uncertainty: 999,
      reasons: ['GP service unavailable - using fallback'],
      method: 'fallback',
      error: error.message
    });
  }
});

// Start the bridge service
const PORT = BRIDGE_PORT;

app.listen(PORT, () => {
  console.log(`[GP-BRIDGE] Service started on port ${PORT}`);
  console.log(`[GP-BRIDGE] Connecting to Python GP service at ${PYTHON_GP_URL}`);
  
  // Check Python service on startup
  gpBridge.checkPythonService().then(health => {
    if (health) {
      console.log(`[GP-BRIDGE] Python GP service connected: ${health.service}`);
    } else {
      console.log(`[GP-BRIDGE] Warning: Python GP service not available`);
    }
  });
});