const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3015;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'minimal-storage-agent',
    message: 'Storage agent running without database for testing'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'minimal-storage-agent',
    message: 'Storage agent running without database for testing'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[MINIMAL-STORAGE] Minimal Storage Agent running on port ${PORT}`);
  console.log(`[MINIMAL-STORAGE] Ready for health checks`);
});

module.exports = app;