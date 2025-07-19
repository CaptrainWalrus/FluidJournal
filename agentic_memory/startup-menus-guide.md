# Startup Menus Guide

## Overview

Three separate startup menus have been created for easier management of the Agentic Memory system:

1. **Storage Menu** (`storage-menu.js`) - Manages vector storage and data operations
2. **Risk Menu** (`risk-menu.js`) - Manages ML models and risk agent operations  
3. **GP Menu** (`gp-menu.js`) - Manages Gaussian Process models and training

All menus are designed to be simple, robust, and use existing scripts to avoid breaking easily.

## Storage Menu

### Starting the Storage Menu

```bash
cd /mnt/c/workspace/production-curves/Production/agentic_memory
node storage-menu.js
```

### Storage Menu Options

```
=============================================================
       STORAGE AGENT MANAGEMENT
=============================================================

1. 🗑️  Wipe Vector Storage (LanceDB)
2. 🔄 Reset Offline Storage Tables
3. 🧹 Complete Storage Cleanup
4. 🚀 Start Storage Agent Server
5. 📊 Check Storage Status
6. 🔧 Run Storage Tests

0. 🚪 Exit
```

### Storage Menu Functions

#### 1. Wipe Vector Storage
- Deletes all LanceDB vector data
- Requires typing "DELETE" to confirm
- Creates clean vector directory after wiping
- Use when: You need to clear all stored trading patterns

#### 2. Reset Offline Storage Tables
- Clears offline processing tables (raw, qualified, graduated)
- Requires "y" confirmation
- Use when: You want to reset the offline processing pipeline

#### 3. Complete Storage Cleanup
- Performs full cleanup of all storage data
- Deletes vectors, offline tables, temporary files
- Requires typing "CLEANUP" to confirm
- Use when: Starting completely fresh

#### 4. Start Storage Agent Server
- Starts the Storage Agent on port 3015
- Checks if already running before starting
- Shows live logs after starting
- Use when: Beginning a trading session

#### 5. Check Storage Status
- Shows server online/offline status
- Displays total vector count
- Reports storage size
- Use when: Monitoring system health

#### 6. Run Storage Tests
- Executes npm test in storage directory
- Use when: Verifying storage functionality

## Risk Menu

### Starting the Risk Menu

```bash
cd /mnt/c/workspace/production-curves/Production/agentic_memory
node risk-menu.js
```

### Risk Menu Options

```
=============================================================
         RISK AGENT MANAGEMENT
=============================================================

1. 🗑️  Delete Trained Models
2. 🎯 Train New Models
3. 📊 Check Model Status
4. 🚀 Start Risk Agent Server
5. 🐍 Start GP Service (Python)
6. 🔧 Test Risk Endpoints

0. 🚪 Exit
```

### Risk Menu Functions

#### 1. Delete Trained Models
- Removes all GP/ML trained models
- Requires typing "DELETE" to confirm
- Clears model cache (restart services to reload)
- Use when: Models are contaminated with bad decisions

#### 2. Train New Models
- Checks if Storage Agent has data first
- Options for training all models or specific instrument
- Triggers model training via API
- Use when: After collecting fresh trading data

#### 3. Check Model Status
- Lists model files and sizes
- Shows GP Service status (if running)
- Displays graduation tables status
- Use when: Verifying model readiness

#### 4. Start Risk Agent Server
- Starts the Risk Agent on port 3017
- Checks if already running
- Shows live logs after starting
- Use when: Ready to use risk management

#### 5. Start GP Service (Python)
- Starts the Python GP service on port 3020
- Checks Python 3 installation
- Installs dependencies if needed
- Use when: Enabling ML predictions

#### 6. Test Risk Endpoints
- Tests connectivity to all services
- Performs sample risk evaluation
- Shows which services are online/offline
- Use when: Debugging connection issues

## Typical Workflows

### Fresh Start Workflow

1. **Start Storage Menu**
   ```bash
   node storage-menu.js
   ```

2. **Option 3** - Complete Storage Cleanup
   - Type "CLEANUP" to confirm
   - Wipes all existing data

3. **Option 4** - Start Storage Agent Server
   - Storage Agent begins on port 3015

4. **Exit and Start Risk Menu**
   ```bash
   node risk-menu.js
   ```

5. **Option 1** - Delete Trained Models
   - Type "DELETE" to confirm
   - Removes old model contamination

6. **Option 4** - Start Risk Agent Server
   - Risk Agent begins on port 3017

7. **Option 5** - Start GP Service
   - Python GP service starts on port 3020

### Retraining Workflow

1. **Risk Menu Option 3** - Check Model Status
   - Verify current model state

2. **Risk Menu Option 1** - Delete Trained Models
   - Clear existing models

3. **Storage Menu Option 5** - Check Storage Status
   - Ensure sufficient data exists

4. **Risk Menu Option 2** - Train New Models
   - Select all models or specific instrument

## GP Menu

### Starting the GP Menu

```bash
cd /mnt/c/workspace/production-curves/Production/agentic_memory
node gp-menu.js
```

### GP Menu Options

```
=============================================================
         GAUSSIAN PROCESS SERVICE
=============================================================

1. 🗑️  Delete All GP Models
2. 📤 Export Training Data from Storage
3. 🎯 Train New GP Models
4. 📊 Check GP Model Status
5. 🐍 Start GP Service (Python)
6. 🔧 Test GP Predictions
7. 🧹 Clean Training Data Cache
8. 📈 View Model Performance
9. ⚡ Enable GPU Training

0. 🚪 Exit
```

### GP Menu Functions

#### 1. Delete All GP Models
- Removes all trained Gaussian Process models (.joblib files)
- Preserves training data
- Requires typing "DELETE" to confirm
- Use when: Models are contaminated or performing poorly

#### 2. Export Training Data from Storage
- Exports data from Storage Agent to local JSON files
- Options: All data, by instrument, or recent data (30 days)
- Creates files in `gp-service/training_data/` directory
- Use when: Ready to train new models

#### 3. Train New GP Models
- Trains Gaussian Process models from exported data
- Options: All instruments, specific instrument, or from specific file
- Uses Python scikit-learn for GP regression
- Use when: After exporting fresh training data

#### 4. Check GP Model Status
- Shows local model files and sizes
- Displays GP Service status if running
- Lists loaded models and sample counts
- Use when: Verifying model availability

#### 5. Start GP Service (Python)
- Starts the Python Flask GP service on port 3020
- Checks Python dependencies and installs if needed
- Shows live logs after starting
- Use when: Ready to use GP predictions

#### 6. Test GP Predictions
- Tests GP service with sample data
- Shows predicted PnL, confidence, and uncertainty
- Displays trajectory predictions
- Use when: Verifying GP functionality

#### 7. Clean Training Data Cache
- Removes exported training data files
- Preserves actual models
- Use when: Cleaning up disk space

#### 8. View Model Performance
- Shows model metrics (MSE, R² score, calibration)
- Displays prediction statistics
- Use when: Evaluating model quality

#### 9. Enable GPU Training
- Installs GPU-enabled PyTorch with CUDA support
- Uses existing RTX 3080 optimizations from rf-training
- Creates GPU-optimized training scripts
- Applies hardware-specific optimizations (TF32, Mixed Precision)
- Use when: Setting up GPU acceleration for faster training

### Daily Startup Workflow

1. **Storage Menu Option 5** - Check Storage Status
   - Verify data integrity

2. **Storage Menu Option 4** - Start Storage Agent
   - If not already running

3. **GP Menu Option 4** - Check GP Model Status
   - Verify models are available

4. **GP Menu Option 5** - Start GP Service
   - If using ML predictions

5. **Risk Menu Option 4** - Start Risk Agent
   - If not already running

6. **Risk Menu Option 6** - Test Risk Endpoints
   - Verify all connections working

## Error Handling

### Common Issues

**"Storage Agent connection failed"**
- Storage Agent not running
- Start with Storage Menu Option 4

**"GP Service not running"**
- Python service offline
- Start with Risk Menu Option 5

**"No training data available"**
- Need to collect trades first
- Use Storage Agent to collect data

**"Models directory not found"**
- Normal if no models trained yet
- Train models with Risk Menu Option 2

### Safety Features

- Destructive operations require explicit confirmation
- Services check if already running before starting
- Connection testing before operations
- Clear error messages with suggested fixes

## Technical Details

### Service Ports
- Storage Agent: 3015
- Risk Service: 3017  
- GP Service (Python): 3020

### Data Locations
- Vector Storage: `storage-agent/data/vectors/`
- ML Models: `gp-service/models/`
- Logs: Each service directory

### Dependencies
- Node.js 14+ for JavaScript services
- Python 3 for GP Service
- curl for endpoint testing

## Integration Notes

These menus work with the existing system architecture:
- All operations use existing scripts and APIs
- No new dependencies introduced
- Robust error handling
- Simple execSync calls to proven commands

The menus are intentionally simple to ensure reliability and ease of use, following the principle: "all the functions work through other scripts so this shouldn't break so easily".

## Quick Reference

You can now use these menus by running:
- `node storage-menu.js` for storage operations
- `node risk-menu.js` for model and risk agent operations
- `node gp-menu.js` for Gaussian Process model management

### Complete Retraining Workflow

For a complete fresh start with new GP models:

1. **GP Menu Option 1** - Delete All GP Models
2. **GP Menu Option 9** - Enable GPU Training (first time setup)
3. **GP Menu Option 2** - Export Training Data from Storage  
4. **GP Menu Option 3** - Train New GP Models (now GPU accelerated)
5. **GP Menu Option 6** - Test GP Predictions to verify

### GPU Training Benefits

After enabling GPU training with Option 9:
- **RTX 3080 Optimizations**: TF32 + Mixed Precision for Ampere architecture
- **Optimal Batch Size**: 1024 for 10GB VRAM (vs 256 CPU)
- **Hardware Threading**: 16-thread CPU utilization (i9-11900KF)
- **Memory Management**: CUDA optimizations for 64GB RAM
- **Training Speed**: Significantly faster model training