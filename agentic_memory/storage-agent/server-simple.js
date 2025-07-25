const express = require('express');
const cors = require('cors');
require('dotenv').config();

console.log('🔍 [ENV-CHECK] LANCEDB_PATH:', process.env.LANCEDB_PATH);
console.log('🔍 [ENV-CHECK] FORCE_STORE_ALL:', process.env.FORCE_STORE_ALL);

const vectorStore = require('./src/vectorStore');

const app = express();
const PORT = process.env.STORAGE_PORT || 3015;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Simple health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Store vector endpoint
app.post('/api/store-vector', async (req, res) => {
  try {
    console.log(`\n📥 Storing vector: ${req.body.entrySignalId}`);
    
    const result = await vectorStore.storeVector(req.body);
    
    console.log(`✅ Stored successfully: ${result.vectorId}`);
    
    res.json({
      success: true,
      vectorId: result.vectorId,
      stored: true
    });
    
  } catch (error) {
    console.error('❌ Failed to store vector:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get vectors - with explicit limit
app.get('/api/vectors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    console.log(`📊 Getting vectors with limit: ${limit}`);
    
    const vectors = await vectorStore.getVectors({ limit });
    
    res.json({
      success: true,
      vectors,
      count: vectors.length
    });
    
  } catch (error) {
    console.error('❌ Failed to get vectors:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      vectors: []
    });
  }
});

// Simple stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    // Just return a simple count
    const vectors = await vectorStore.getVectors({ limit: 100 });
    
    res.json({
      success: true,
      stats: {
        totalVectors: vectors.length,
        note: 'Limited to 100 for performance'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Initialize and start
async function start() {
  try {
    console.log('🚀 Initializing simple storage server...');
    
    await vectorStore.initialize();
    
    app.listen(PORT, () => {
      console.log(`\n✅ Simple Storage Server running on port ${PORT}`);
      console.log(`📁 Database: ${vectorStore.dbPath}`);
      console.log(`🔧 FORCE_STORE_ALL: ${process.env.FORCE_STORE_ALL}`);
      console.log('\nReady to receive data...\n');
    });
    
  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  }
}

start();