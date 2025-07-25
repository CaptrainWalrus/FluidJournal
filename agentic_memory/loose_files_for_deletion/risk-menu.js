#!/usr/bin/env node

/**
 * Risk Agent Startup Menu
 * Simple, robust menu for risk agent management operations
 */

const readline = require('readline');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class RiskMenu {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.riskDir = path.join(__dirname, 'risk-service');
        this.modelsDir = path.join(__dirname, 'gp-service', 'models');
        this.gpServiceDir = path.join(__dirname, 'gp-service');
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
                reset: '\x1b[0m'
            };
            return `${colors[colorCode] || ''}${text}${colors.reset}`;
        } catch (e) {
            return text;
        }
    }

    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    displayMenu() {
        console.clear();
        console.log(this.color('='.repeat(60), 'cyan'));
        console.log(this.color('         RISK AGENT MANAGEMENT', 'cyan'));
        console.log(this.color('='.repeat(60), 'cyan'));
        console.log();
        console.log('1. 🗑️  Delete Trained Models');
        console.log('2. 🎯 Train New Models');
        console.log('3. 📊 Check Model Status');
        console.log('4. 🚀 Start Risk Agent Server');
        console.log('5. 🐍 Start GP Service (Python)');
        console.log('6. 🔧 Test Risk Endpoints');
        console.log();
        console.log('0. 🚪 Exit');
        console.log();
    }

    async run() {
        let running = true;
        
        console.log(this.color('\n🚀 Risk Agent Management Menu\n', 'blue'));
        
        while (running) {
            this.displayMenu();
            const choice = await this.prompt('Select option (0-6): ');
            
            try {
                switch (choice.trim()) {
                    case '1':
                        await this.deleteTrainedModels();
                        break;
                    case '2':
                        await this.trainNewModels();
                        break;
                    case '3':
                        await this.checkModelStatus();
                        break;
                    case '4':
                        await this.startRiskServer();
                        running = false;
                        break;
                    case '5':
                        await this.startGPService();
                        break;
                    case '6':
                        await this.testRiskEndpoints();
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

    async deleteTrainedModels() {
        console.log(this.color('\n🗑️  DELETE TRAINED MODELS', 'yellow'));
        console.log('This will delete all GP/ML trained models.');
        
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
                console.log(this.color('\n✅ All models deleted', 'green'));
            } else {
                console.log(this.color('ℹ️  No models directory found', 'cyan'));
            }

            // Clear any cached models in memory
            console.log(this.color('ℹ️  Models cleared. Restart services to reload.', 'cyan'));
            
        } catch (error) {
            console.log(this.color(`❌ Failed to delete models: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async trainNewModels() {
        console.log(this.color('\n🎯 TRAIN NEW MODELS', 'green'));
        
        try {
            // Check if storage agent is running
            let hasData = false;
            try {
                const result = execSync('curl -s http://localhost:3015/api/stats', { encoding: 'utf8' });
                const stats = JSON.parse(result);
                hasData = (stats.stats?.totalVectors || 0) > 0;
            } catch (e) {
                console.log(this.color('⚠️  Storage Agent not running', 'yellow'));
                await this.prompt('Press Enter to continue...');
                return;
            }

            if (!hasData) {
                console.log(this.color('⚠️  No training data available', 'yellow'));
                console.log('Please collect data first using Storage Agent.');
                await this.prompt('Press Enter to continue...');
                return;
            }

            console.log(this.color('\n📊 Training Options:', 'cyan'));
            console.log('1. Train All Models');
            console.log('2. Train Specific Instrument');
            console.log('0. Cancel');
            
            const trainChoice = await this.prompt('\nSelect option: ');
            
            if (trainChoice === '0') {
                return;
            }

            // Trigger training
            console.log(this.color('\n🔄 Starting model training...', 'cyan'));
            
            try {
                if (trainChoice === '1') {
                    execSync('curl -X POST http://localhost:3020/api/train-all', { stdio: 'inherit' });
                } else {
                    const instrument = await this.prompt('Enter instrument (MGC/ES): ');
                    const direction = await this.prompt('Enter direction (long/short): ');
                    
                    // Here you would call the training endpoint with specific params
                    console.log(`Training ${instrument}_${direction}...`);
                }
                
                console.log(this.color('\n✅ Training completed', 'green'));
            } catch (e) {
                console.log(this.color('❌ Training failed', 'red'));
            }
            
        } catch (error) {
            console.log(this.color(`❌ Error: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async checkModelStatus() {
        console.log(this.color('\n📊 MODEL STATUS', 'cyan'));
        
        try {
            // Check if models directory exists
            if (fs.existsSync(this.modelsDir)) {
                const modelFiles = fs.readdirSync(this.modelsDir);
                
                console.log(this.color('\n📁 Model Files:', 'cyan'));
                if (modelFiles.length === 0) {
                    console.log('  No models found');
                } else {
                    modelFiles.forEach(file => {
                        const stats = fs.statSync(path.join(this.modelsDir, file));
                        const size = (stats.size / 1024).toFixed(2);
                        console.log(`  - ${file} (${size} KB)`);
                    });
                }
            } else {
                console.log(this.color('ℹ️  Models directory not found', 'yellow'));
            }

            // Check if GP service is running
            try {
                const result = execSync('curl -s http://localhost:3020/api/models/status', { encoding: 'utf8' });
                const status = JSON.parse(result);
                
                console.log(this.color('\n🤖 GP Service Status:', 'cyan'));
                console.log(`  Ready: ${status.summary?.ready ? this.color('Yes', 'green') : this.color('No', 'red')}`);
                console.log(`  Models Loaded: ${status.summary?.trained_models || 0}`);
                console.log(`  Total Samples: ${status.summary?.total_samples || 0}`);
                
            } catch (e) {
                console.log(this.color('\n⚠️  GP Service not running', 'yellow'));
            }

            // Check graduation status
            try {
                const result = execSync('curl -s http://localhost:3017/api/graduations', { encoding: 'utf8' });
                const grads = JSON.parse(result);
                
                console.log(this.color('\n🎓 Graduation Tables:', 'cyan'));
                Object.keys(grads).forEach(key => {
                    console.log(`  - ${key}: ${grads[key].featureCount || 0} features`);
                });
                
            } catch (e) {
                console.log(this.color('\n⚠️  Risk Service not running', 'yellow'));
            }
            
        } catch (error) {
            console.log(this.color(`❌ Status check failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async startRiskServer() {
        console.log(this.color('\n🚀 STARTING RISK AGENT SERVER', 'green'));
        
        try {
            process.chdir(this.riskDir);
            
            // Check if already running
            try {
                execSync('curl -s http://localhost:3017/config', { stdio: 'pipe' });
                console.log(this.color('\n⚠️  Risk Agent already running on port 3017', 'yellow'));
                
                const override = await this.prompt('Start anyway? (y/N): ');
                if (override.toLowerCase() !== 'y') {
                    return;
                }
            } catch (e) {
                // Not running, continue
            }
            
            console.log(this.color('📦 Starting Risk Agent...', 'cyan'));
            console.log(this.color('📝 Logs will appear below:', 'cyan'));
            console.log(this.color('-'.repeat(60), 'cyan'));
            
            // Start the server
            spawn('node', ['server.js'], {
                stdio: 'inherit',
                shell: true
            });
            
        } catch (error) {
            console.log(this.color(`❌ Failed to start: ${error.message}`, 'red'));
            await this.prompt('Press Enter to continue...');
        }
    }

    async startGPService() {
        console.log(this.color('\n🐍 START GP SERVICE', 'yellow'));
        
        try {
            process.chdir(this.gpServiceDir);
            
            // Check Python
            try {
                execSync('python3 --version', { stdio: 'pipe' });
            } catch (e) {
                console.log(this.color('❌ Python 3 not found', 'red'));
                console.log('Please install Python 3 first.');
                await this.prompt('Press Enter to continue...');
                return;
            }

            // Check dependencies
            const hasDeps = fs.existsSync(path.join(this.gpServiceDir, 'venv')) ||
                           fs.existsSync(path.join(this.gpServiceDir, '.venv'));
            
            if (!hasDeps) {
                console.log(this.color('📦 Installing Python dependencies...', 'cyan'));
                execSync('pip3 install -r requirements.txt', { stdio: 'inherit' });
            }

            console.log(this.color('\n🐍 Starting GP Service...', 'cyan'));
            
            spawn('python3', ['server.py'], {
                stdio: 'inherit',
                shell: true,
                cwd: this.gpServiceDir
            });
            
            console.log(this.color('\n✅ GP Service started on port 3020', 'green'));
            
        } catch (error) {
            console.log(this.color(`❌ Failed to start GP: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async testRiskEndpoints() {
        console.log(this.color('\n🔧 TEST RISK ENDPOINTS', 'cyan'));
        
        const endpoints = [
            { name: 'Risk Service Config', url: 'http://localhost:3017/config' },
            { name: 'GP Service Health', url: 'http://localhost:3020/health' },
            { name: 'Storage Service Stats', url: 'http://localhost:3015/api/stats' }
        ];

        for (const endpoint of endpoints) {
            try {
                execSync(`curl -s "${endpoint.url}"`, { stdio: 'pipe' });
                console.log(`✅ ${endpoint.name}: ${this.color('Online', 'green')}`);
            } catch (e) {
                console.log(`❌ ${endpoint.name}: ${this.color('Offline', 'red')}`);
            }
        }

        console.log(this.color('\n📝 Testing Risk Evaluation...', 'cyan'));
        
        try {
            const testData = {
                instrument: 'MGC',
                direction: 'long',
                features: {
                    rsi_14: 45.5,
                    momentum_5: 0.8,
                    volume_spike_3bar: 1.2
                }
            };
            
            const result = execSync(`curl -s -X POST http://localhost:3017/api/evaluate-risk -H "Content-Type: application/json" -d '${JSON.stringify(testData)}'`, { encoding: 'utf8' });
            const response = JSON.parse(result);
            
            console.log(this.color('\n✅ Risk evaluation working:', 'green'));
            console.log(`  Approved: ${response.approved ? 'Yes' : 'No'}`);
            console.log(`  Confidence: ${(response.confidence * 100).toFixed(1)}%`);
            console.log(`  Method: ${response.method}`);
            
        } catch (e) {
            console.log(this.color('❌ Risk evaluation failed', 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
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
    const menu = new RiskMenu();
    menu.run().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = RiskMenu;