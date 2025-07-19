# Agentic Memory System - Startup Menus Guide

This document provides interactive menus for starting and managing the Agentic Memory system components.

## 📋 Prerequisites

Ensure all dependencies are installed:
```bash
# Node.js dependencies (for each service directory)
npm install

# Python dependencies for GP Service
pip install -r gp-service/requirements.txt
```

## 🚀 Quick Start Menu

### Option 1: Start All Services
```bash
# From production-curves/Production/agentic_memory/
node startup-menu.js
```

### Option 2: Start Individual Services

#### Storage Agent (Port 3015)
```bash
cd storage-agent
npm start
# or
node server.js
```

#### Risk Service (Port 3017)
```bash
cd risk-service
npm start
# or
node server.js
```

#### GP Service (Port 3020)
```bash
cd gp-service
python server.py
# or
python3 server.py
```

## 🎯 Interactive GP Menu

The GP menu provides data export and training capabilities:

```bash
cd /mnt/c/workspace/production-curves/Production/agentic_memory
node gp-menu.js
```

Menu Options:
1. **Export All Data** - Export vectors from Storage Agent for GP training
2. **Export by Instrument** - Export specific instrument data (e.g., MGC, ES)
3. **Train GP Models** - Train Gaussian Process models from exported data
4. **Check Training Status** - View model training progress
5. **Test GP Prediction** - Test predictions on sample data

## 🔧 Service Management Commands

### Check Service Status
```bash
# Storage Agent
curl http://localhost:3015/health

# Risk Service  
curl http://localhost:3017/health

# GP Service
curl http://localhost:3020/health
```

### View Model Status
```bash
# GP Models
curl http://localhost:3020/api/models/status | python3 -m json.tool

# Storage Stats
curl http://localhost:3015/api/stats | python3 -m json.tool
```

### Restart Services
```bash
# Kill all Node.js services
pkill -f "node.*server.js"

# Kill Python GP service
pkill -f "python.*server.py"
```

## 📊 Data Viewers

### Simple Vector Viewer
Open in browser:
```
file:///C:/Users/aport/Documents/Production_Curves/Production/agentic_memory/simple-viewer.html
```

### Advanced Dashboard
```bash
cd storage-agent
# Dashboard runs on http://localhost:3015/dashboard.html
```

## 🛠️ Troubleshooting

### GP Service 500 Errors
If you see "Prediction error: 'trained'" errors:

1. The model structure has been fixed to handle both trainer and service formats
2. Restart the GP service:
   ```bash
   cd gp-service
   pkill -f "python.*server.py"
   python server.py
   ```

### Missing Features Error
If predictions fail due to feature mismatch:
- The service now handles feature selection automatically
- Ensures compatibility between training and prediction features

### Port Already in Use
```bash
# Find process using port (example for 3015)
lsof -i :3015
# or on Windows
netstat -ano | findstr :3015
```

## 🎮 Development Workflow

1. **Start Storage Agent** (stores vectors)
2. **Start Risk Service** (makes risk decisions)  
3. **Start GP Service** (provides ML predictions)
4. **Use GP Menu** to export data and train models
5. **Monitor logs** in each service terminal

## 📝 Configuration

### Environment Variables
Create `.env` files in each service directory:

```env
# storage-agent/.env
STORAGE_PORT=3015
LANCEDB_PATH=./data/vectors

# risk-service/.env  
RISK_SERVICE_PORT=3017
STORAGE_SERVICE_URL=http://localhost:3015

# gp-service/.env
PORT=3020
DEBUG=false
```

### Model Retraining
To force retraining of GP models:
```bash
# Remove existing models
rm -rf gp-service/models/*.joblib

# Export fresh data and train
node gp-menu.js
# Select option 1 (Export All Data)
# Then select option 3 (Train GP Models)
```

## 🔍 Monitoring

### Real-time Logs
Each service prints detailed logs to console. Key log patterns:

- `✅` - Success operations
- `❌` - Errors
- `📊` - Data/stats related
- `🔄` - Processing/training
- `💾` - Storage operations
- `🎯` - Risk decisions

### Performance Metrics
```bash
# View GP training metrics
cat gp-service/models/training_summary.json

# View storage aggregations
curl http://localhost:3015/api/aggregated-stats
```

## 🚨 Common Issues & Solutions

1. **"Cannot find module"** - Run `npm install` in the service directory
2. **"Model not trained"** - Use GP menu to train models first
3. **"Connection refused"** - Ensure dependent services are running
4. **High CPU during training** - GP training is CPU intensive, this is normal
5. **Memory errors** - Reduce batch sizes in training configuration

## 📞 Service Dependencies

```
NinjaTrader
    ↓
Storage Agent (3015) ← Risk Service (3017)
                     ← GP Service (3020)
```

Ensure services start in order if there are dependency issues.