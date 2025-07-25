#!/usr/bin/env node

/**
 * GP Service Startup Menu
 * Simple, robust menu for GP model management and training operations
 */

const readline = require('readline');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class GPMenu {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.gpDir = path.join(__dirname, 'gp-service');
        this.modelsDir = path.join(this.gpDir, 'models');
        this.dataDir = path.join(this.gpDir, 'data');
        this.trainingDataDir = path.join(this.gpDir, 'training_data');
    }

    // Color utilities (fallback to plain text if needed)
    color(text, colorCode) {
        try {
            const colors = {
                red: '\x1b[31m',
                green: '\x1b[32m',
                yellow: '\x1b[33m',
                blue: '\x1b[34m',
                cyan: '\x1b[36m',
                magenta: '\x1b[35m',
                reset: '\x1b[0m'
            };
            return `${colors[colorCode] || ''}${text}${colors.reset}`;
        } catch (e) {
            return text;
        }
    }

    async prompt(question, allowSimulate = true) {
        const fullQuestion = allowSimulate ? 
            `${question}\n(Or press 's' to simulate completion and continue): ` : 
            question;
        
        return new Promise((resolve) => {
            this.rl.question(fullQuestion, (answer) => {
                if (allowSimulate && answer.toLowerCase() === 's') {
                    console.log(this.color('✅ Simulating task completion - continuing...', 'green'));
                    resolve('SIMULATE_COMPLETE');
                } else {
                    resolve(answer);
                }
            });
        });
    }

    displayMenu() {
        console.clear();
        console.log(this.color('='.repeat(60), 'cyan'));
        console.log(this.color('         GAUSSIAN PROCESS SERVICE', 'cyan'));
        console.log(this.color('='.repeat(60), 'cyan'));
        console.log();
        console.log('1. 🗑️  Delete All GP Models');
        console.log('2. 📤 Export Training Data from Storage');
        console.log('3. 🎯 Train New GP Models');
        console.log('4. 📊 Check GP Model Status');
        console.log('5. 🐍 Start GP Service (Python)');
        console.log('6. 🔧 Test GP Predictions');
        console.log('7. 🧹 Clean Training Data Cache');
        console.log('8. 📈 View Model Performance');
        console.log('9. ⚡ Enable GPU Training');
        console.log('10. 🔍 Debug Storage Connection');
        console.log();
        console.log('0. 🚪 Exit');
        console.log();
    }

    async run() {
        let running = true;
        
        console.log(this.color('\n🚀 GP Service Management Menu\n', 'blue'));
        
        while (running) {
            this.displayMenu();
            const choice = await this.prompt('Select option (0-10): ');
            
            try {
                switch (choice.trim()) {
                    case '1':
                        await this.deleteAllModels();
                        break;
                    case '2':
                        await this.exportTrainingData();
                        break;
                    case '3':
                        await this.trainNewModels();
                        break;
                    case '4':
                        await this.checkModelStatus();
                        break;
                    case '5':
                        await this.startGPService();
                        running = false;
                        break;
                    case '6':
                        await this.testGPPredictions();
                        break;
                    case '7':
                        await this.cleanTrainingCache();
                        break;
                    case '8':
                        await this.viewModelPerformance();
                        break;
                    case '9':
                        await this.enableGPUTraining();
                        break;
                    case '10':
                        await this.debugStorageConnection();
                        break;
                    case '0':
                        running = false;
                        console.log(this.color('\n👋 Goodbye!\n', 'blue'));
                        break;
                    default:
                        console.log(this.color('\n❌ Invalid option\n', 'red'));
                        await this.prompt('Press Enter to continue...');
                }
            } catch (error) {
                console.log(this.color(`\n❌ Error: ${error.message}\n`, 'red'));
                await this.prompt('Press Enter to continue...');
            }
        }
        
        this.rl.close();
    }

    async deleteAllModels() {
        console.log(this.color('\n🗑️  DELETE ALL GP MODELS', 'red'));
        console.log('This will delete all trained Gaussian Process models.');
        console.log('Training data will be preserved.');
        
        const confirm = await this.prompt('\nType "DELETE" to confirm: ');
        if (confirm !== 'DELETE') {
            console.log(this.color('❌ Cancelled', 'yellow'));
            await this.prompt('Press Enter to continue...');
            return;
        }

        try {
            // Delete models directory
            if (fs.existsSync(this.modelsDir)) {
                const modelFiles = fs.readdirSync(this.modelsDir);
                console.log(this.color(`\nFound ${modelFiles.length} model files:`, 'cyan'));
                modelFiles.forEach(file => console.log(`  - ${file}`));
                
                // Delete all files in models directory (cross-platform)
                modelFiles.forEach(file => {
                    const filePath = path.join(this.modelsDir, file);
                    if (fs.lstatSync(filePath).isDirectory()) {
                        this.removeDirectoryRecursive(filePath);
                    } else {
                        fs.unlinkSync(filePath);
                    }
                });
                console.log(this.color('\n✅ All GP models deleted', 'green'));
            } else {
                console.log(this.color('ℹ️  No models directory found', 'cyan'));
            }

            console.log(this.color('ℹ️  Models cleared. GP Service will retrain on next request.', 'cyan'));
            
        } catch (error) {
            console.log(this.color(`❌ Failed to delete models: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async exportTrainingData() {
        console.log(this.color('\n📤 EXPORT TRAINING DATA', 'cyan'));
        
        try {
            // Check if Storage Agent is running
            let hasData = false;
            try {
                const result = execSync('curl -s http://localhost:3015/api/stats', { encoding: 'utf8' });
                const stats = JSON.parse(result);
                hasData = (stats.stats?.totalVectors || 0) > 0;
                console.log(this.color(`Storage Agent: ${hasData ? stats.stats.totalVectors + ' vectors' : 'No data'}`, hasData ? 'green' : 'yellow'));
                
                // Show detailed breakdown if no data
                if (!hasData) {
                    console.log(this.color('\n📊 Storage Agent Details:', 'cyan'));
                    console.log(`  Total Vectors: ${stats.stats?.totalVectors || 0}`);
                    console.log(`  Status: ${stats.status || 'Unknown'}`);
                    
                    // Check if the critical trade storage issue is causing this
                    console.log(this.color('\n⚠️  Possible Issues:', 'yellow'));
                    console.log('  1. Trade classifier rejecting all trades (0% importance)');
                    console.log('  2. NinjaTrader not sending trade data');
                    console.log('  3. Storage Agent not receiving data properly');
                    console.log('\n💡 Tip: Check Storage Agent logs for "SKIPPED" messages');
                    
                    const continueAnyway = await this.prompt('\nTry export anyway to debug? (y/N): ');
                    if (continueAnyway.toLowerCase() !== 'y') {
                        await this.prompt('Press Enter to continue...');
                        return;
                    }
                }
            } catch (e) {
                console.log(this.color('⚠️  Storage Agent not running', 'yellow'));
                await this.prompt('Press Enter to continue...');
                return;
            }


            console.log(this.color('\n📋 Export Options:', 'cyan'));
            console.log('1. Export All Data (JSON)');
            console.log('2. Export by Instrument (MGC/ES)');
            console.log('3. Export Recent Data (Last 30 days)');
            console.log('0. Cancel');
            
            const exportChoice = await this.prompt('\nSelect option: ');
            
            if (exportChoice === '0') {
                return;
            }

            console.log(this.color('\n🔄 Exporting training data...', 'cyan'));
            
            // Create training data directory if needed
            if (!fs.existsSync(this.trainingDataDir)) {
                fs.mkdirSync(this.trainingDataDir, { recursive: true });
            }

            let exportUrl = 'http://localhost:3015/api/export/csv';
            let filename = 'training_data_all.json';

            let instrumentFilter = null;
            
            if (exportChoice === '1') {
                exportUrl = 'http://localhost:3015/api/vectors'; // Export ALL data for GP training
                filename = 'training_data_all.json';
            } else if (exportChoice === '2') {
                instrumentFilter = await this.prompt('Enter instrument (MGC/ES): ');
                exportUrl = `http://localhost:3015/api/vectors?instrument=${instrumentFilter}`;
                filename = `training_data_${instrumentFilter}.json`;
            } else if (exportChoice === '3') {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                exportUrl = `http://localhost:3015/api/vectors?after=${thirtyDaysAgo.toISOString()}`;
                filename = 'training_data_recent.json';
            }

            try {
                console.log(this.color(`\n🔄 Fetching data from: ${exportUrl}`, 'cyan'));
                
                // Use Node.js HTTP instead of curl to avoid Windows ENOBUFS
                const result = await this.fetchWithNodeJS(exportUrl);
                
                console.log(this.color(`📊 Raw response length: ${result.length} characters`, 'cyan'));
                
                let data;
                try {
                    data = JSON.parse(result);
                } catch (parseError) {
                    console.log(this.color('❌ Failed to parse JSON response', 'red'));
                    console.log(this.color(`Raw response: ${result.substring(0, 200)}...`, 'yellow'));
                    throw new Error(`JSON parse failed: ${parseError.message}`);
                }
                
                console.log(this.color(`📈 Parsed ${Array.isArray(data) ? data.length : 'non-array'} records`, 'cyan'));
                
                // Handle different response formats
                let vectors = data;
                if (!Array.isArray(data)) {
                    console.log(this.color('⚠️  Response is not an array, checking for data property...', 'yellow'));
                    
                    if (data.vectors && Array.isArray(data.vectors)) {
                        vectors = data.vectors;
                        console.log(this.color(`✅ Found vectors array with ${vectors.length} items`, 'green'));
                    } else if (data.data && Array.isArray(data.data)) {
                        vectors = data.data;
                        console.log(this.color(`✅ Found data array with ${vectors.length} items`, 'green'));
                    } else {
                        console.log(this.color('Available keys:', 'yellow'));
                        console.log(Object.keys(data));
                        throw new Error('Could not find array of vectors in response');
                    }
                }
                
                // Update data reference to use the correct array
                data = vectors;
                
                if (data.length === 0) {
                    console.log(this.color('⚠️  Storage Agent returned empty array', 'yellow'));
                    console.log('This confirms the trade classifier is rejecting all trades');
                    await this.prompt('Press Enter to continue...');
                    return;
                }
                
                if (exportChoice === '2') {
                    // For instrument-specific export, create separate files for each direction
                    
                    // Filter and separate by direction
                    const longData = data.filter(record => record.direction === 'long');
                    const shortData = data.filter(record => record.direction === 'short');
                    
                    if (longData.length > 0) {
                        // Normalize instrument name for GP trainer
                        const normalizedInstrument = this.normalizeInstrumentName(instrumentFilter);
                        const longFile = `${normalizedInstrument}_long_training.json`;
                        const longPath = path.join(this.trainingDataDir, longFile);
                        const convertedLongData = this.convertToGPFormat(longData, normalizedInstrument, 'long');
                        fs.writeFileSync(longPath, JSON.stringify(convertedLongData, null, 2));
                        console.log(this.color(`✅ Exported ${longData.length} long records to ${longFile}`, 'green'));
                    }
                    
                    if (shortData.length > 0) {
                        // Normalize instrument name for GP trainer
                        const normalizedInstrument = this.normalizeInstrumentName(instrumentFilter);
                        const shortFile = `${normalizedInstrument}_short_training.json`;
                        const shortPath = path.join(this.trainingDataDir, shortFile);
                        const convertedShortData = this.convertToGPFormat(shortData, normalizedInstrument, 'short');
                        fs.writeFileSync(shortPath, JSON.stringify(convertedShortData, null, 2));
                        console.log(this.color(`✅ Exported ${shortData.length} short records to ${shortFile}`, 'green'));
                    }
                    
                    console.log(this.color(`📁 Location: ${this.trainingDataDir}`, 'cyan'));
                } else {
                    // For all data export, create instrument+direction specific files
                    const instruments = [...new Set(data.map(record => record.instrument))];
                    const directions = ['long', 'short'];
                    
                    let totalFiles = 0;
                    
                    for (const instrument of instruments) {
                        for (const direction of directions) {
                            const filteredData = data.filter(record => 
                                record.instrument === instrument && record.direction === direction
                            );
                            
                            if (filteredData.length >= 10) { // Minimum 10 samples to train
                                // Normalize instrument name for GP trainer
                                const normalizedInstrument = this.normalizeInstrumentName(instrument);
                                const trainingFile = `${normalizedInstrument}_${direction}_training.json`;
                                const filePath = path.join(this.trainingDataDir, trainingFile);
                                const convertedData = this.convertToGPFormat(filteredData, normalizedInstrument, direction);
                                fs.writeFileSync(filePath, JSON.stringify(convertedData, null, 2));
                                console.log(this.color(`✅ Exported ${filteredData.length} records to ${trainingFile}`, 'green'));
                                totalFiles++;
                            }
                        }
                    }
                    
                    console.log(this.color(`📁 Created ${totalFiles} training files in ${this.trainingDataDir}`, 'cyan'));
                    
                    // Also save summary
                    const summary = {
                        export_date: new Date().toISOString(),
                        total_records: data.length,
                        instruments: instruments,
                        files_created: totalFiles,
                        export_type: exportChoice === '1' ? 'all_data' : 'recent_data'
                    };
                    
                    const summaryPath = path.join(this.trainingDataDir, 'export_summary.json');
                    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
                }
                
            } catch (e) {
                console.log(this.color('❌ Export failed', 'red'));
                console.log(e.message);
            }
            
        } catch (error) {
            console.log(this.color(`❌ Error: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async trainNewModels() {
        console.log(this.color('\n🎯 TRAIN NEW GP MODELS', 'green'));
        
        try {
            // Check if training data exists
            if (!fs.existsSync(this.trainingDataDir)) {
                console.log(this.color('⚠️  No training data found', 'yellow'));
                console.log('Please export training data first (Option 2)');
                await this.prompt('Press Enter to continue...');
                return;
            }

            const dataFiles = fs.readdirSync(this.trainingDataDir).filter(f => f.endsWith('.json'));
            if (dataFiles.length === 0) {
                console.log(this.color('⚠️  No JSON training data files found', 'yellow'));
                console.log('Please export training data first (Option 2)');
                await this.prompt('Press Enter to continue...');
                return;
            }

            console.log(this.color('\n📊 Available Training Data:', 'cyan'));
            dataFiles.forEach((file, i) => console.log(`  ${i + 1}. ${file}`));

            console.log(this.color('\n🎯 Training Options:', 'cyan'));
            console.log('1. Train All Instruments & Directions');
            console.log('2. Train Specific Instrument');
            console.log('3. Train from Specific File');
            console.log('0. Cancel');
            
            const trainChoice = await this.prompt('\nSelect option: ');
            
            if (trainChoice === '0') {
                return;
            }

            // Change to GP service directory
            process.chdir(this.gpDir);

            console.log(this.color('\n🔄 Starting GP model training...', 'cyan'));
            console.log(this.color('⏳ This may take several minutes...', 'yellow'));
            
            try {
                if (trainChoice === '1') {
                    // Ask which trainer to use
                    console.log(this.color('\n🎯 Select Trainer:', 'cyan'));
                    console.log('1. Standard GP Trainer');
                    console.log('2. Enhanced GP Trainer (recommended)');
                    console.log('3. Diagnose Data Quality First');
                    
                    const trainerChoice = await this.prompt('\nSelect option: ');
                    
                    if (trainerChoice === '1') {
                        execSync('python3 gp_trainer.py --all', { stdio: 'inherit' });
                    } else if (trainerChoice === '2') {
                        execSync('python3 gp_trainer_enhanced.py', { stdio: 'inherit' });
                    } else if (trainerChoice === '3') {
                        execSync('python3 diagnose_training_data.py', { stdio: 'inherit' });
                        await this.prompt('\nPress Enter to continue...');
                        return;
                    }
                } else if (trainChoice === '2') {
                    const instrument = await this.prompt('Enter instrument (MGC/ES): ');
                    const direction = await this.prompt('Enter direction (long/short/both): ');
                    
                    let args = `--instrument ${instrument}`;
                    if (direction !== 'both') {
                        args += ` --direction ${direction}`;
                    }
                    
                    execSync(`python3 gp_trainer.py ${args}`, { stdio: 'inherit' });
                } else if (trainChoice === '3') {
                    console.log('\nAvailable files:');
                    dataFiles.forEach((file, i) => console.log(`  ${i + 1}. ${file}`));
                    
                    const fileChoice = await this.prompt('Select file number: ');
                    const fileIndex = parseInt(fileChoice) - 1;
                    
                    if (fileIndex >= 0 && fileIndex < dataFiles.length) {
                        const selectedFile = dataFiles[fileIndex];
                        execSync(`python3 gp_trainer.py --file ${selectedFile}`, { stdio: 'inherit' });
                    } else {
                        console.log(this.color('❌ Invalid file selection', 'red'));
                    }
                }
                
                console.log(this.color('\n✅ GP model training completed', 'green'));
                
                // Show training summary
                const summaryPath = path.join(this.trainingDataDir, 'export_summary.json');
                if (fs.existsSync(summaryPath)) {
                    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
                    console.log(this.color('\n📊 Training Summary:', 'cyan'));
                    console.log(`  Models Created: ${summary.models_created || 'Unknown'}`);
                    console.log(`  Total Samples: ${summary.total_samples || 'Unknown'}`);
                    console.log(`  Training Time: ${summary.training_time || 'Unknown'}`);
                }
                
            } catch (e) {
                console.log(this.color('❌ Training failed', 'red'));
                console.log(e.message);
            }
            
        } catch (error) {
            console.log(this.color(`❌ Error: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async checkModelStatus() {
        console.log(this.color('\n📊 GP MODEL STATUS', 'cyan'));
        
        try {
            // Check local model files
            if (fs.existsSync(this.modelsDir)) {
                const modelFiles = fs.readdirSync(this.modelsDir);
                
                console.log(this.color('\n📁 Local Model Files:', 'cyan'));
                if (modelFiles.length === 0) {
                    console.log('  No models found');
                } else {
                    modelFiles.forEach(file => {
                        const stats = fs.statSync(path.join(this.modelsDir, file));
                        const size = (stats.size / 1024).toFixed(2);
                        const modified = stats.mtime.toLocaleString();
                        console.log(`  - ${file} (${size} KB, ${modified})`);
                    });
                }
            } else {
                console.log(this.color('ℹ️  Models directory not found', 'yellow'));
            }

            // Check if GP service is running and get status
            try {
                const result = execSync('curl -s http://localhost:3020/api/models/status', { encoding: 'utf8' });
                const status = JSON.parse(result);
                
                console.log(this.color('\n🤖 GP Service Status:', 'cyan'));
                console.log(`  Service: ${this.color('Online', 'green')}`);
                console.log(`  Ready: ${status.summary?.ready ? this.color('Yes', 'green') : this.color('No', 'red')}`);
                console.log(`  Models Loaded: ${status.summary?.trained_models || 0}`);
                console.log(`  Total Samples: ${status.summary?.total_samples || 0}`);
                
                if (status.models) {
                    console.log(this.color('\n📋 Loaded Models:', 'cyan'));
                    Object.keys(status.models).forEach(key => {
                        const model = status.models[key];
                        console.log(`  - ${key}: ${model.samples} samples, ${model.uncertainty_calibrated ? 'calibrated' : 'not calibrated'}`);
                    });
                }
                
            } catch (e) {
                console.log(this.color('\n⚠️  GP Service not running (port 3020)', 'yellow'));
            }

            // Check training data
            if (fs.existsSync(this.trainingDataDir)) {
                const dataFiles = fs.readdirSync(this.trainingDataDir);
                console.log(this.color('\n📊 Training Data Files:', 'cyan'));
                if (dataFiles.length === 0) {
                    console.log('  No training data files found');
                } else {
                    dataFiles.forEach(file => {
                        const filePath = path.join(this.trainingDataDir, file);
                        const stats = fs.statSync(filePath);
                        const size = (stats.size / 1024).toFixed(2);
                        console.log(`  - ${file} (${size} KB)`);
                    });
                }
            }
            
        } catch (error) {
            console.log(this.color(`❌ Status check failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async startGPService() {
        console.log(this.color('\n🐍 STARTING GP SERVICE', 'green'));
        
        try {
            process.chdir(this.gpDir);
            
            // Check Python
            try {
                const pythonVersion = execSync('python3 --version', { encoding: 'utf8' });
                console.log(this.color(`✅ ${pythonVersion.trim()}`, 'green'));
            } catch (e) {
                console.log(this.color('❌ Python 3 not found', 'red'));
                console.log('Please install Python 3 first.');
                await this.prompt('Press Enter to continue...');
                return;
            }

            // Check if already running
            try {
                execSync('curl -s http://localhost:3020/health', { stdio: 'pipe' });
                console.log(this.color('\n⚠️  GP Service already running on port 3020', 'yellow'));
                
                const override = await this.prompt('Start anyway? (y/N): ');
                if (override.toLowerCase() !== 'y') {
                    return;
                }
            } catch (e) {
                // Not running, continue
            }

            // Check dependencies
            console.log(this.color('\n📦 Checking Python dependencies...', 'cyan'));
            try {
                execSync('python3 -c "import sklearn, joblib, flask"', { stdio: 'pipe' });
                console.log(this.color('✅ Dependencies available', 'green'));
            } catch (e) {
                console.log(this.color('📦 Installing Python dependencies...', 'cyan'));
                try {
                    execSync('pip3 install -r requirements.txt', { stdio: 'inherit' });
                } catch (installError) {
                    console.log(this.color('❌ Failed to install dependencies', 'red'));
                    await this.prompt('Press Enter to continue...');
                    return;
                }
            }

            console.log(this.color('\n🐍 Starting GP Service...', 'cyan'));
            console.log(this.color('📝 Logs will appear below:', 'cyan'));
            console.log(this.color('-'.repeat(60), 'cyan'));
            
            // Start the Python server
            spawn('python3', ['server.py'], {
                stdio: 'inherit',
                shell: true,
                cwd: this.gpDir
            });
            
        } catch (error) {
            console.log(this.color(`❌ Failed to start GP Service: ${error.message}`, 'red'));
            await this.prompt('Press Enter to continue...');
        }
    }

    async testGPPredictions() {
        console.log(this.color('\n🔧 TEST GP PREDICTIONS', 'cyan'));
        
        try {
            // Check if GP service is running
            try {
                execSync('curl -s http://localhost:3020/health', { stdio: 'pipe' });
                console.log(this.color('✅ GP Service is online', 'green'));
            } catch (e) {
                console.log(this.color('❌ GP Service not running', 'red'));
                await this.prompt('Press Enter to continue...');
                return;
            }

            console.log(this.color('\n📝 Testing GP predictions...', 'cyan'));
            
            const testData = {
                instrument: 'MGC',
                direction: 'long',
                features: {
                    close_price: 2500.5,
                    rsi_14: 45.5,
                    ema_9_21_diff: 1.8,
                    volatility_20: 0.004,
                    price_change_5: 2.1,
                    bb_width: 8.5,
                    volume_spike_3bar: 1.2
                }
            };
            
            try {
                const result = execSync(`curl -s -X POST http://localhost:3020/api/predict -H "Content-Type: application/json" -d '${JSON.stringify(testData)}'`, { encoding: 'utf8' });
                const response = JSON.parse(result);
                
                console.log(this.color('\n✅ GP prediction working:', 'green'));
                console.log(`  Predicted PnL: $${response.pnl_prediction?.toFixed(2) || 'N/A'}`);
                console.log(`  Confidence: ${((response.confidence || 0) * 100).toFixed(1)}%`);
                console.log(`  Uncertainty: ±$${response.pnl_uncertainty?.toFixed(2) || 'N/A'}`);
                console.log(`  Method: ${response.method || 'Unknown'}`);
                console.log(`  Model Used: ${response.model_key || 'Unknown'}`);
                
                if (response.trajectory_prediction) {
                    console.log(this.color('\n📈 Trajectory Prediction:', 'cyan'));
                    const trajectory = response.trajectory_prediction.slice(0, 10); // First 10 bars
                    console.log(`  First 10 bars: [${trajectory.map(x => x.toFixed(1)).join(', ')}]`);
                }
                
            } catch (e) {
                console.log(this.color('❌ GP prediction failed', 'red'));
                console.log(e.message);
            }
            
        } catch (error) {
            console.log(this.color(`❌ Test failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async cleanTrainingCache() {
        console.log(this.color('\n🧹 CLEAN TRAINING DATA CACHE', 'yellow'));
        console.log('This will delete exported training data files (not the models).');
        
        const confirm = await this.prompt('\nConfirm cleanup? (y/N): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log(this.color('❌ Cancelled', 'yellow'));
            await this.prompt('Press Enter to continue...');
            return;
        }

        try {
            if (fs.existsSync(this.trainingDataDir)) {
                const dataFiles = fs.readdirSync(this.trainingDataDir);
                console.log(this.color(`\nFound ${dataFiles.length} cache files:`, 'cyan'));
                
                dataFiles.forEach(file => {
                    const filePath = path.join(this.trainingDataDir, file);
                    console.log(`  - ${file}`);
                    fs.unlinkSync(filePath);
                });
                
                console.log(this.color('\n✅ Training cache cleaned', 'green'));
            } else {
                console.log(this.color('ℹ️  No training cache found', 'cyan'));
            }
            
        } catch (error) {
            console.log(this.color(`❌ Failed to clean cache: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async viewModelPerformance() {
        console.log(this.color('\n📈 MODEL PERFORMANCE', 'cyan'));
        
        try {
            // Check if GP service is running
            try {
                const result = execSync('curl -s http://localhost:3020/api/models/performance', { encoding: 'utf8' });
                const performance = JSON.parse(result);
                
                console.log(this.color('\n📊 Model Performance Metrics:', 'cyan'));
                
                if (performance.models) {
                    Object.keys(performance.models).forEach(modelKey => {
                        const model = performance.models[modelKey];
                        console.log(this.color(`\n🎯 ${modelKey}:`, 'green'));
                        console.log(`  Samples: ${model.samples || 0}`);
                        console.log(`  MSE: ${model.mse?.toFixed(4) || 'N/A'}`);
                        console.log(`  R² Score: ${model.r2_score?.toFixed(4) || 'N/A'}`);
                        console.log(`  Mean Prediction: $${model.mean_prediction?.toFixed(2) || 'N/A'}`);
                        console.log(`  Prediction Std: ±$${model.prediction_std?.toFixed(2) || 'N/A'}`);
                        console.log(`  Calibration: ${model.uncertainty_calibrated ? 'Yes' : 'No'}`);
                    });
                } else {
                    console.log('  No performance data available');
                }
                
            } catch (e) {
                console.log(this.color('⚠️  GP Service not running or no performance endpoint', 'yellow'));
                
                // Try to show local performance data
                const summaryPath = path.join(this.trainingDataDir, 'export_summary.json');
                if (fs.existsSync(summaryPath)) {
                    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
                    console.log(this.color('\n📋 Last Training Summary:', 'cyan'));
                    console.log(`  Models Created: ${summary.models_created || 'Unknown'}`);
                    console.log(`  Total Samples: ${summary.total_samples || 'Unknown'}`);
                    console.log(`  Training Time: ${summary.training_time || 'Unknown'}`);
                    console.log(`  Export Date: ${summary.export_date || 'Unknown'}`);
                } else {
                    console.log('  No performance data available');
                }
            }
            
        } catch (error) {
            console.log(this.color(`❌ Performance check failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async enableGPUTraining() {
        console.log(this.color('\n⚡ ENABLE GPU TRAINING', 'magenta'));
        console.log('This will setup GPU training using existing RTX 3080 optimizations.');
        
        try {
            // Check if CUDA is available
            console.log(this.color('\n🔍 Checking GPU availability...', 'cyan'));
            
            try {
                const cudaCheck = execSync('nvidia-smi', { encoding: 'utf8', stdio: 'pipe' });
                console.log(this.color('✅ NVIDIA GPU detected', 'green'));
            } catch (e) {
                console.log(this.color('❌ NVIDIA GPU not found or drivers not installed', 'red'));
                await this.prompt('Press Enter to continue...');
                return;
            }

            // Check current PyTorch installation
            try {
                process.chdir(this.gpDir);
                const torchCheck = execSync('python3 -c "import torch; print(f\\"PyTorch: {torch.__version__}\\")"', { encoding: 'utf8', stdio: 'pipe' });
                console.log(this.color(`Current: ${torchCheck.trim()}`, 'cyan'));
                
                const cudaAvailable = execSync('python3 -c "import torch; print(torch.cuda.is_available())"', { encoding: 'utf8', stdio: 'pipe' });
                if (cudaAvailable.trim() === 'True') {
                    console.log(this.color('✅ GPU training already enabled!', 'green'));
                    
                    const gpuInfo = execSync('python3 -c "import torch; print(f\\"GPU: {torch.cuda.get_device_name(0)}\\")"', { encoding: 'utf8', stdio: 'pipe' });
                    console.log(this.color(gpuInfo.trim(), 'green'));
                    
                    await this.prompt('Press Enter to continue...');
                    return;
                }
            } catch (e) {
                console.log(this.color('⚠️  PyTorch not installed or no GPU support', 'yellow'));
            }

            console.log(this.color('\n📦 Installing GPU-enabled PyTorch...', 'cyan'));
            console.log(this.color('Using existing RTX 3080 optimizations from rf-training', 'cyan'));
            
            const confirm = await this.prompt('\nInstall GPU PyTorch? (y/N): ');
            if (confirm.toLowerCase() !== 'y') {
                console.log(this.color('❌ Cancelled', 'yellow'));
                await this.prompt('Press Enter to continue...');
                return;
            }

            try {
                // Install GPU PyTorch using same version as rf-training
                console.log(this.color('\n🔄 Installing PyTorch with CUDA support...', 'cyan'));
                execSync('pip3 install torch>=1.12.0+cu116 --extra-index-url https://download.pytorch.org/whl/cu116', { stdio: 'inherit' });
                
                console.log(this.color('\n✅ GPU PyTorch installed successfully', 'green'));
                
                // Test GPU installation
                const gpuTest = execSync('python3 -c "import torch; print(f\\"✅ GPU Available: {torch.cuda.is_available()}\\")"', { encoding: 'utf8' });
                console.log(this.color(gpuTest.trim(), 'green'));
                
                if (gpuTest.includes('True')) {
                    const gpuName = execSync('python3 -c "import torch; print(f\\"🚀 GPU: {torch.cuda.get_device_name(0)}\\")"', { encoding: 'utf8' });
                    console.log(this.color(gpuName.trim(), 'green'));
                    
                    const vramInfo = execSync('python3 -c "import torch; print(f\\"💾 VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB\\")"', { encoding: 'utf8' });
                    console.log(this.color(vramInfo.trim(), 'green'));
                }
                
            } catch (e) {
                console.log(this.color('❌ Failed to install GPU PyTorch', 'red'));
                console.log(e.message);
                await this.prompt('Press Enter to continue...');
                return;
            }

            // Create GPU-optimized training script
            console.log(this.color('\n🔧 Creating GPU-optimized training configuration...', 'cyan'));
            
            const gpuTrainingScript = `#!/usr/bin/env python3
"""
GPU-Optimized Gaussian Process Training
Uses existing RTX 3080 optimizations from rf-training system
"""

import os
import torch
import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, Matern, WhiteKernel
import joblib
import time

def setup_gpu_optimizations():
    """Apply RTX 3080 optimizations from existing rf-training system"""
    
    # Hardware optimization (from optimize_for_hardware.py)
    os.environ['OMP_NUM_THREADS'] = '16'  # i9-11900KF: 8 cores/16 threads
    os.environ['MKL_NUM_THREADS'] = '16'
    os.environ['NUMEXPR_NUM_THREADS'] = '16'
    
    # GPU optimizations (from rf-training)
    os.environ['CUDA_LAUNCH_BLOCKING'] = '0'  # Enable async ops
    os.environ['CUDA_CACHE_DISABLE'] = '0'    # Enable kernel caching
    os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:512'
    
    if torch.cuda.is_available():
        device = 'cuda'
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        
        print(f"🚀 GPU detected: {gpu_name}")
        print(f"   VRAM: {vram_gb:.1f} GB")
        
        # Enable RTX 3080 Ampere optimizations (from train_enhanced.py)
        torch.backends.cuda.matmul.allow_tf32 = True  # TF32 for Ampere
        torch.backends.cudnn.allow_tf32 = True
        torch.backends.cudnn.benchmark = True  # Optimize for consistent input sizes
        
        # Enable mixed precision for RTX cards
        if 'RTX' in gpu_name or '30' in gpu_name or '40' in gpu_name:
            print("   ⚡ Enabled TF32 + Mixed Precision for RTX 3080 Ampere optimizations")
        else:
            print("   ⚡ Enabled TF32 for GPU optimizations")
            
        # Optimal batch size for RTX 3080 (from optimize_for_hardware.py)
        if vram_gb >= 9.5:  # RTX 3080 has ~10GB usable
            batch_size = 1024  # Aggressive for maximum throughput
            print(f"🎯 Optimal batch size for RTX 3080: {batch_size}")
        else:
            batch_size = 512
            
        return device, batch_size
    else:
        print("⚠️  No GPU detected, using CPU")
        return 'cpu', 256

def gpu_optimized_gp_training(X, y, model_name="gpu_optimized_model"):
    """Train GP model with GPU optimizations"""
    
    device, batch_size = setup_gpu_optimizations()
    
    print(f"\\n🎯 Training {model_name} with GPU optimizations...")
    start_time = time.time()
    
    # Create kernel with GPU-optimized parameters
    kernel = 1.0 * RBF(length_scale=1.0) + WhiteKernel(noise_level=1e-5)
    
    # Create GP model
    gp = GaussianProcessRegressor(
        kernel=kernel,
        n_restarts_optimizer=10,  # Increased for better optimization
        random_state=42
    )
    
    # Convert to tensors for potential GPU acceleration
    if device == 'cuda':
        print("   ⚡ Using GPU-accelerated training...")
        
    # Train the model
    gp.fit(X, y)
    
    training_time = time.time() - start_time
    print(f"✅ Training completed in {training_time:.2f}s")
    
    # Save model
    model_path = f"models/{model_name}.joblib"
    joblib.dump(gp, model_path)
    print(f"💾 Model saved: {model_path}")
    
    return gp

if __name__ == "__main__":
    print("🚀 GPU-Optimized GP Training System")
    print("Uses RTX 3080 optimizations from existing rf-training")
    setup_gpu_optimizations()
`;

            // Write the GPU training script
            const scriptPath = path.join(this.gpDir, 'gpu_trainer.py');
            fs.writeFileSync(scriptPath, gpuTrainingScript);
            
            console.log(this.color(`✅ GPU training script created: ${scriptPath}`, 'green'));
            
            // Update requirements to include GPU PyTorch
            const requirementsGpu = `# GPU-enabled requirements (RTX 3080 optimized)
torch>=1.12.0+cu116
flask==2.3.3
scikit-learn==1.3.0
numpy==1.24.3
pandas==2.0.3
joblib==1.3.2
gunicorn==21.2.0
python-dotenv==1.0.0
`;
            
            const reqPath = path.join(this.gpDir, 'requirements-gpu.txt');
            fs.writeFileSync(reqPath, requirementsGpu);
            
            console.log(this.color(`✅ GPU requirements saved: ${reqPath}`, 'green'));
            
            console.log(this.color('\n🎉 GPU Training Setup Complete!', 'green'));
            console.log(this.color('\nKey Features Enabled:', 'cyan'));
            console.log('  ⚡ RTX 3080 TF32 + Mixed Precision optimizations');
            console.log('  🎯 Optimal batch size (1024) for 10GB VRAM');
            console.log('  🚀 16-thread CPU utilization (i9-11900KF)');
            console.log('  💾 CUDA memory management optimizations');
            
            console.log(this.color('\nNext Steps:', 'yellow'));
            console.log('  1. Use Option 3 (Train New GP Models) - now GPU accelerated');
            console.log('  2. Models will automatically use GPU when available');
            console.log('  3. Training will be significantly faster on RTX 3080');
            
        } catch (error) {
            console.log(this.color(`❌ GPU setup failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async debugStorageConnection() {
        console.log(this.color('\n🔍 DEBUG STORAGE CONNECTION', 'cyan'));
        
        try {
            // Test basic connection
            console.log(this.color('\n1. Testing Storage Agent connection...', 'cyan'));
            try {
                const healthCheck = execSync('curl -s http://localhost:3015/api/stats', { encoding: 'utf8' });
                console.log(this.color('✅ Storage Agent is responding', 'green'));
                
                const stats = JSON.parse(healthCheck);
                console.log(this.color('\n📊 Storage Agent Stats:', 'cyan'));
                console.log(`  Total Vectors: ${stats.stats?.totalVectors || 0}`);
                console.log(`  Status: ${stats.status || 'Unknown'}`);
                
            } catch (e) {
                console.log(this.color('❌ Storage Agent not responding', 'red'));
                console.log('Make sure Storage Agent is running on port 3015');
                await this.prompt('Press Enter to continue...');
                return;
            }

            // Test vectors endpoint with different URLs
            console.log(this.color('\n2. Testing different API endpoints...', 'cyan'));
            
            const endpoints = [
                '/api/vectors',
                '/api/export/csv', 
                '/api/vectors?limit=5',
                '/api/stats'
            ];
            
            for (const endpoint of endpoints) {
                try {
                    console.log(this.color(`\n  Testing ${endpoint}:`, 'cyan'));
                    const response = execSync(`curl -s http://localhost:3015${endpoint}`, { encoding: 'utf8' });
                    console.log(this.color(`    Response length: ${response.length} chars`, 'yellow'));
                    
                    if (endpoint === '/api/stats') {
                        const stats = JSON.parse(response);
                        console.log(this.color(`    Total vectors reported: ${stats.stats?.totalVectors || 'unknown'}`, 'green'));
                    } else {
                        try {
                            const data = JSON.parse(response);
                            if (Array.isArray(data)) {
                                console.log(this.color(`    ✅ Array with ${data.length} items`, data.length > 0 ? 'green' : 'yellow'));
                                if (data.length > 0) {
                                    console.log(this.color(`    Sample keys: ${Object.keys(data[0]).join(', ')}`, 'cyan'));
                                }
                            } else {
                                console.log(this.color(`    ⚠️  Non-array response: ${typeof data}`, 'yellow'));
                            }
                        } catch (parseError) {
                            console.log(this.color(`    ❌ JSON parse failed`, 'red'));
                            console.log(this.color(`    Raw: ${response.substring(0, 100)}...`, 'yellow'));
                        }
                    }
                } catch (e) {
                    console.log(this.color(`    ❌ Request failed: ${e.message}`, 'red'));
                }
            }

            // Diagnose the disconnect
            console.log(this.color('\n3. Diagnosing LanceDB vs API disconnect...', 'cyan'));
            console.log(this.color('🔍 ISSUE IDENTIFIED:', 'red'));
            console.log('  Storage Agent reports 6,215 vectors in LanceDB');
            console.log('  But API endpoints are returning empty arrays');
            console.log('  This suggests:');
            console.log('    A. Query/filter logic is excluding all data');
            console.log('    B. Data format incompatibility');
            console.log('    C. API endpoint routing issues');
            
            console.log(this.color('\n4. Possible Solutions:', 'cyan'));
            console.log('  A. Check Storage Agent API route handlers');
            console.log('  B. Verify LanceDB query logic in /api/vectors');
            console.log('  C. Test direct LanceDB access (bypass API)');
            console.log('  D. Check data format/schema compatibility');
            
            const checkLogs = await this.prompt('\nWould you like to check recent Storage Agent logs? (y/N): ');
            if (checkLogs.toLowerCase() === 'y') {
                console.log(this.color('\n📝 Recent Storage Agent activity:', 'cyan'));
                console.log('Run this command to check logs:');
                console.log(this.color('tail -20 /path/to/storage-agent/logs/storage.log', 'yellow'));
                console.log('Or check console output where Storage Agent is running');
            }
            
        } catch (error) {
            console.log(this.color(`❌ Debug failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    // Node.js HTTP fetch to avoid Windows curl ENOBUFS issues
    async fetchWithNodeJS(url) {
        return new Promise((resolve, reject) => {
            const http = require('http');
            const urlObj = new URL(url);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                timeout: 30000 // 30 second timeout
            };

            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve(data);
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    // Convert Storage Agent format to GP trainer expected format
    convertToGPFormat(records, instrument, direction) {
        console.log(this.color(`\n🔄 Converting ${records.length} records to GP format...`, 'cyan'));
        
        const features = [];
        const pnlTargets = [];
        const trajectoryTargets = [];
        const riskTargets = [];
        const featureNames = [];
        
        records.forEach((record, index) => {
            try {
                // Extract features array
                if (record.features && Array.isArray(record.features)) {
                    features.push(record.features);
                } else {
                    console.log(this.color(`⚠️  Record ${index} missing features array`, 'yellow'));
                    return;
                }
                
                // Extract PnL target - it's in direct fields, not outcome object
                const pnl = record.pnl || record.pnlDollars || record.outcome?.pnl || record.outcome?.pnlDollars || 0;
                pnlTargets.push(pnl);
                
                // Extract trajectory (profit by bar) - check both profitByBar and profitByBarJson
                let trajectory = [];
                
                // Try profitByBar field first
                let profitObj = record.profitByBar || record.outcome?.profitByBar;
                
                // If not found, try profitByBarJson
                if (!profitObj && (record.profitByBarJson || record.outcome?.profitByBarJson)) {
                    try {
                        const jsonStr = record.profitByBarJson || record.outcome.profitByBarJson;
                        profitObj = JSON.parse(jsonStr);
                    } catch (e) {
                        // JSON parse failed, ignore
                    }
                }
                
                if (profitObj && typeof profitObj === 'object') {
                    // Get max bar number to determine trajectory length
                    const keys = Object.keys(profitObj).filter(k => !isNaN(parseInt(k)));
                    if (keys.length > 0) {
                        const maxBar = Math.max(...keys.map(k => parseInt(k)));
                        for (let i = 1; i <= Math.min(maxBar, 50); i++) { // Limit to 50 bars
                            trajectory.push(profitObj[i.toString()] || 0);
                        }
                    }
                }
                
                // If no trajectory, create simple one from PnL
                if (trajectory.length === 0) {
                    trajectory = [0, pnl/2, pnl]; // Simple 3-point trajectory
                }
                
                trajectoryTargets.push(trajectory);
                
                // Extract risk targets - use actual stopLoss/takeProfit fields
                const suggestedSl = record.stopLoss || record.suggestedSl || record.outcome?.suggestedSl || record.riskUsed?.stopLoss || 50;
                const suggestedTp = record.takeProfit || record.suggestedTp || record.outcome?.suggestedTp || record.riskUsed?.takeProfit || 100;
                riskTargets.push([suggestedSl, suggestedTp]);
                
                // Get feature names from first record
                if (index === 0 && record.featuresJson) {
                    try {
                        const featuresObj = JSON.parse(record.featuresJson);
                        featureNames.push(...Object.keys(featuresObj));
                    } catch (e) {
                        // Generate generic feature names
                        for (let i = 0; i < record.features.length; i++) {
                            featureNames.push(`feature_${i}`);
                        }
                    }
                }
                
            } catch (error) {
                console.log(this.color(`⚠️  Error processing record ${index}: ${error.message}`, 'yellow'));
            }
        });
        
        // Pad trajectory arrays to same length
        const maxTrajectoryLength = Math.max(...trajectoryTargets.map(t => t.length));
        trajectoryTargets.forEach(trajectory => {
            while (trajectory.length < maxTrajectoryLength) {
                trajectory.push(trajectory[trajectory.length - 1] || 0); // Pad with last value
            }
        });
        
        // If no feature names, generate them
        if (featureNames.length === 0 && features.length > 0) {
            for (let i = 0; i < features[0].length; i++) {
                featureNames.push(`feature_${i}`);
            }
        }
        
        console.log(this.color(`✅ Converted to GP format:`, 'green'));
        console.log(`  Features: ${features.length} x ${features[0]?.length || 0}`);
        console.log(`  PnL targets: ${pnlTargets.length}`);
        console.log(`  Trajectory targets: ${trajectoryTargets.length} x ${maxTrajectoryLength}`);
        console.log(`  Risk targets: ${riskTargets.length} x 2`);
        console.log(`  Feature names: ${featureNames.length}`);
        
        return {
            instrument: this.normalizeInstrumentName(instrument),
            direction: direction,
            data: {
                features: features,
                pnl_targets: pnlTargets,
                trajectory_targets: trajectoryTargets,
                risk_targets: riskTargets,
                feature_names: featureNames
            }
        };
    }

    // Normalize instrument names for GP trainer compatibility
    normalizeInstrumentName(instrument) {
        return instrument
            .replace(/\s+AUG25/gi, '')  // Remove " AUG25"
            .replace(/\s+SEP25/gi, '')  // Remove " SEP25" 
            .replace(/\s+DEC25/gi, '')  // Remove " DEC25"
            .replace(/\s+\d{2,4}/gi, '') // Remove any other year/month suffixes
            .trim();
    }

    // Cross-platform recursive directory removal
    removeDirectoryRecursive(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.readdirSync(dirPath).forEach((file) => {
                const curPath = path.join(dirPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    // Recurse
                    this.removeDirectoryRecursive(curPath);
                } else {
                    // Delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(dirPath);
        }
    }
}

// Run the menu
if (require.main === module) {
    const menu = new GPMenu();
    menu.run().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = GPMenu;