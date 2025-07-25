#!/usr/bin/env node

/**
 * Interactive Terminal Menu for Agentic Memory Management
 * Provides user-friendly interface for model reset, retraining, and monitoring
 */

const readline = require('readline');
const axios = require('axios');
const chalk = require('chalk');

class InteractiveMenu {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.storageUrl = process.env.STORAGE_AGENT_URL || 'http://localhost:3015';
        this.client = axios.create({
            baseURL: this.storageUrl,
            timeout: 30000
        });
        
        this.running = true;
    }

    // Main menu display
    showMainMenu() {
        console.clear();
        console.log(chalk.cyan.bold('╔══════════════════════════════════════════════════════════════╗'));
        console.log(chalk.cyan.bold('║') + chalk.white.bold('                  AGENTIC MEMORY MANAGER                     ') + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('╠══════════════════════════════════════════════════════════════╣'));
        console.log(chalk.cyan.bold('║') + '                                                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + chalk.yellow.bold('  MODEL MANAGEMENT:                                           ') + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    1. 🔥 Complete Model Reset (wipe everything)             ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    2. 🆕 Start Fresh Data Collection                         ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    3. 📊 Check Training Readiness                            ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    4. 🎯 Begin Clean Retraining                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '                                                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + chalk.green.bold('  DATA MANAGEMENT:                                            ') + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    5. 📈 View Current Status                                 ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    6. 🗃️  Manage Offline Processing                          ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    7. 📤 Export Training Data                                ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    8. ⚙️  Configure Settings                                 ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '                                                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + chalk.magenta.bold('  UTILITIES:                                                   ') + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '    9. 🧪 Test Storage Connection                             ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '   10. 📋 View System Health                                  ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '                                                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + chalk.red.bold('    0. 🚪 Exit                                                ') + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('║') + '                                                              ' + chalk.cyan.bold('║'));
        console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════════╝'));
        console.log();
    }

    // Get user input
    async prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    // Main menu loop
    async run() {
        console.log(chalk.blue.bold('\n🚀 Agentic Memory Manager Starting...\n'));
        
        // Test connection first
        try {
            await this.testConnection();
            console.log(chalk.green('✅ Storage Agent connection successful\n'));
        } catch (error) {
            console.log(chalk.red(`❌ Storage Agent connection failed: ${error.message}`));
            console.log(chalk.yellow('💡 Make sure Storage Agent is running on http://localhost:3015\n'));
        }

        while (this.running) {
            this.showMainMenu();
            
            const choice = await this.prompt(chalk.white.bold('Select an option (0-10): '));
            console.log();

            try {
                await this.handleChoice(choice.trim());
            } catch (error) {
                console.log(chalk.red(`❌ Error: ${error.message}`));
                await this.prompt(chalk.gray('Press Enter to continue...'));
            }
        }

        this.rl.close();
        console.log(chalk.blue.bold('\n👋 Goodbye!\n'));
    }

    // Handle menu choices
    async handleChoice(choice) {
        switch (choice) {
            case '1':
                await this.completeModelReset();
                break;
            case '2':
                await this.startFreshDataCollection();
                break;
            case '3':
                await this.checkTrainingReadiness();
                break;
            case '4':
                await this.beginCleanRetraining();
                break;
            case '5':
                await this.viewCurrentStatus();
                break;
            case '6':
                await this.manageOfflineProcessing();
                break;
            case '7':
                await this.exportTrainingData();
                break;
            case '8':
                await this.configureSettings();
                break;
            case '9':
                await this.testConnection();
                break;
            case '10':
                await this.viewSystemHealth();
                break;
            case '0':
                this.running = false;
                break;
            default:
                console.log(chalk.red('❌ Invalid option. Please select 0-10.'));
                await this.prompt(chalk.gray('Press Enter to continue...'));
        }
    }

    // 1. Complete Model Reset
    async completeModelReset() {
        console.log(chalk.red.bold('🔥 COMPLETE MODEL RESET'));
        console.log(chalk.yellow('⚠️  WARNING: This will permanently delete ALL data and models!'));
        console.log(chalk.gray('   - All vector storage (LanceDB)'));
        console.log(chalk.gray('   - All offline storage tables'));
        console.log(chalk.gray('   - All training state and caches'));
        console.log();

        const confirm = await this.prompt(chalk.red.bold('Type "RESET" to confirm complete wipeout: '));
        
        if (confirm !== 'RESET') {
            console.log(chalk.yellow('❌ Reset cancelled.'));
            await this.prompt(chalk.gray('Press Enter to continue...'));
            return;
        }

        console.log(chalk.blue('\n🔄 Performing complete model reset...'));
        
        const response = await this.client.post('/api/reset/complete');
        
        if (response.data.success) {
            console.log(chalk.green('✅ Complete reset successful!'));
            console.log(chalk.cyan('🎯 System is now in FRESH DATA COLLECTION mode'));
            console.log(chalk.gray(`📅 Reset timestamp: ${new Date(response.data.result.resetTimestamp).toLocaleString()}`));
        } else {
            throw new Error(response.data.message);
        }

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // 2. Start Fresh Data Collection
    async startFreshDataCollection() {
        console.log(chalk.green.bold('🆕 FRESH DATA COLLECTION'));
        console.log(chalk.cyan('This will show you how to store fresh trades without old model contamination.\n'));

        const status = await this.getResetStatus();
        
        if (!status.collectingFreshData) {
            console.log(chalk.red('❌ System is not in fresh data collection mode.'));
            console.log(chalk.yellow('💡 Use option 1 to perform a complete reset first.'));
            await this.prompt(chalk.gray('Press Enter to continue...'));
            return;
        }

        console.log(chalk.green('✅ System is ready for fresh data collection!'));
        console.log(chalk.cyan(`📊 Fresh trades collected: ${status.freshTradeCount}`));
        console.log(chalk.cyan(`🎯 Completed trades: ${status.completedTrades}`));
        console.log(chalk.cyan(`📋 Minimum required: ${status.minTradesRequired}`));
        console.log();

        console.log(chalk.white.bold('📝 INTEGRATION INSTRUCTIONS:'));
        console.log(chalk.gray('In NinjaTrader, modify your storage calls:'));
        console.log();
        console.log(chalk.yellow('// Store fresh trade (features only):'));
        console.log(chalk.cyan('POST http://localhost:3015/api/reset/fresh-trade'));
        console.log(chalk.gray(JSON.stringify({
            entrySignalId: "MGC_FRESH_001",
            instrument: "MGC",
            direction: "long",
            features: { rsi_14: 45.2, momentum_5: 0.8 }
        }, null, 2)));
        console.log();
        console.log(chalk.yellow('// Update outcome when trade completes:'));
        console.log(chalk.cyan('PUT http://localhost:3015/api/reset/trade-outcome/MGC_FRESH_001'));
        console.log(chalk.gray(JSON.stringify({
            pnl: 25.50,
            exitPrice: 2768.05,
            exitReason: "TAKE_PROFIT"
        }, null, 2)));

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // 3. Check Training Readiness
    async checkTrainingReadiness() {
        console.log(chalk.blue.bold('📊 TRAINING READINESS CHECK'));
        console.log(chalk.gray('Checking if system has enough fresh data for retraining...\n'));

        const response = await this.client.get('/api/reset/ready');
        const { readyCheck, status } = response.data;

        console.log(chalk.white.bold('📈 FRESH DATA PROGRESS:'));
        console.log(`${chalk.cyan('Total fresh trades:')} ${status.freshTradeCount}`);
        console.log(`${chalk.cyan('Completed trades:')} ${status.completedTrades}`);
        console.log(`${chalk.cyan('Minimum required:')} ${status.minTradesRequired}`);
        console.log();

        if (readyCheck.ready) {
            console.log(chalk.green.bold('✅ READY FOR RETRAINING!'));
            console.log(chalk.green(`🎯 Have ${readyCheck.freshTrades} completed fresh trades`));
            console.log(chalk.yellow('💡 Use option 4 to begin clean retraining'));
        } else {
            console.log(chalk.yellow.bold('⏳ NOT READY YET'));
            console.log(chalk.red(`❌ ${readyCheck.reason}`));
            console.log(chalk.blue(`📊 Need ${readyCheck.needed || 0} more completed trades`));
        }

        console.log();
        console.log(chalk.white.bold('🔄 SYSTEM STATUS:'));
        console.log(`${chalk.cyan('Fresh data mode:')} ${status.collectingFreshData ? '✅ Active' : '❌ Inactive'}`);
        console.log(`${chalk.cyan('Reset timestamp:')} ${status.resetTimestamp ? new Date(status.resetTimestamp).toLocaleString() : 'None'}`);

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // 4. Begin Clean Retraining
    async beginCleanRetraining() {
        console.log(chalk.magenta.bold('🎯 CLEAN RETRAINING'));
        console.log(chalk.cyan('Starting fresh model training with uncontaminated data...\n'));

        // Check readiness first
        const readyResponse = await this.client.get('/api/reset/ready');
        const { readyCheck } = readyResponse.data;

        if (!readyCheck.ready) {
            console.log(chalk.red('❌ Not ready for retraining!'));
            console.log(chalk.yellow(`⏳ ${readyCheck.reason}`));
            console.log(chalk.blue('💡 Use option 3 to check training readiness'));
            await this.prompt(chalk.gray('Press Enter to continue...'));
            return;
        }

        console.log(chalk.green(`✅ Ready with ${readyCheck.freshTrades} fresh trades`));
        
        const confirm = await this.prompt(chalk.yellow.bold('Proceed with clean retraining? (y/N): '));
        
        if (confirm.toLowerCase() !== 'y') {
            console.log(chalk.yellow('❌ Retraining cancelled.'));
            await this.prompt(chalk.gray('Press Enter to continue...'));
            return;
        }

        console.log(chalk.blue('\n🔄 Processing fresh training data...'));
        
        const response = await this.client.post('/api/reset/retrain');
        
        if (response.data.success) {
            const result = response.data.result;
            
            console.log(chalk.green.bold('\n✅ RETRAINING SUCCESSFUL!'));
            console.log();
            console.log(chalk.white.bold('📊 TRAINING STATISTICS:'));
            console.log(`${chalk.cyan('Fresh trades processed:')} ${result.freshTrades}`);
            console.log(`${chalk.cyan('Qualified records:')} ${result.qualified}`);
            console.log(`${chalk.cyan('Graduated features:')} ${result.graduated}`);
            console.log();
            
            if (result.trainingStats) {
                const stats = result.trainingStats;
                console.log(chalk.white.bold('🎲 TRADE ANALYSIS:'));
                console.log(`${chalk.green('Win rate:')} ${(stats.winRate * 100).toFixed(1)}%`);
                console.log(`${chalk.cyan('Average PnL:')} $${stats.avgPnL.toFixed(2)}`);
                console.log(`${chalk.cyan('Profitable trades:')} ${stats.profitable}`);
                console.log(`${chalk.cyan('Losing trades:')} ${stats.unprofitable}`);
                console.log(`${chalk.cyan('Instruments:')} ${stats.instruments.join(', ')}`);
            }
            
            console.log();
            console.log(chalk.yellow.bold('🤖 NEXT STEPS:'));
            console.log(chalk.gray('1. Review training statistics above'));
            console.log(chalk.gray('2. Train your GP/ML models with qualified data'));
            console.log(chalk.gray('3. Resume normal trading operations'));
            
        } else {
            throw new Error(response.data.message);
        }

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // 5. View Current Status
    async viewCurrentStatus() {
        console.log(chalk.cyan.bold('📈 CURRENT STATUS'));
        console.log(chalk.gray('Loading system status...\n'));

        // Get multiple status endpoints
        const [resetStatus, offlineStatus, vectorStats] = await Promise.all([
            this.client.get('/api/reset/status'),
            this.client.get('/api/offline/status'),
            this.client.get('/api/stats')
        ]);

        const reset = resetStatus.data.status;
        const offline = offlineStatus.data.status;
        const vectors = vectorStats.data.stats;

        console.log(chalk.white.bold('🔄 RESET STATUS:'));
        console.log(`${chalk.cyan('Fresh data mode:')} ${reset.collectingFreshData ? '✅ Active' : '❌ Inactive'}`);
        console.log(`${chalk.cyan('Reset active:')} ${reset.isReset ? '✅ Yes' : '❌ No'}`);
        console.log(`${chalk.cyan('Fresh trades:')} ${reset.freshTradeCount || 0}`);
        console.log(`${chalk.cyan('Completed trades:')} ${reset.completedTrades || 0}`);
        console.log();

        console.log(chalk.white.bold('📊 OFFLINE PROCESSING:'));
        console.log(`${chalk.cyan('Initialized:')} ${offline.initialized ? '✅ Yes' : '❌ No'}`);
        console.log(`${chalk.cyan('Processing:')} ${offline.processing ? '🔄 Active' : '⏸️ Idle'}`);
        console.log(`${chalk.cyan('Auto-processing:')} ${offline.autoProcessing ? '✅ Enabled' : '❌ Disabled'}`);
        console.log();

        console.log(chalk.white.bold('🗃️ VECTOR STORAGE:'));
        console.log(`${chalk.cyan('Total vectors:')} ${vectors.totalVectors || 0}`);
        console.log(`${chalk.cyan('Database size:')} ${vectors.databaseSize || 'Unknown'}`);
        console.log();

        if (offline.stats && offline.stats.storage) {
            const storage = offline.stats.storage;
            console.log(chalk.white.bold('📋 PROCESSING STATS:'));
            console.log(`${chalk.cyan('Raw records:')} ${storage.rawRecords || 0}`);
            console.log(`${chalk.cyan('Qualified records:')} ${storage.qualifiedRecords || 0}`);
            console.log(`${chalk.cyan('Graduated records:')} ${storage.graduatedRecords || 0}`);
        }

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // 6. Manage Offline Processing
    async manageOfflineProcessing() {
        console.log(chalk.green.bold('🗃️ OFFLINE PROCESSING MANAGEMENT'));
        console.log();
        console.log(chalk.white('1. 🔄 Trigger Processing'));
        console.log(chalk.white('2. ⚙️ View Configuration'));
        console.log(chalk.white('3. 📊 View Processing Stats'));
        console.log(chalk.white('0. ⬅️ Back to Main Menu'));
        console.log();

        const choice = await this.prompt(chalk.cyan('Select option (0-3): '));

        switch (choice.trim()) {
            case '1':
                await this.triggerOfflineProcessing();
                break;
            case '2':
                await this.viewOfflineConfig();
                break;
            case '3':
                await this.viewProcessingStats();
                break;
            case '0':
                return;
            default:
                console.log(chalk.red('❌ Invalid option'));
                await this.prompt(chalk.gray('Press Enter to continue...'));
        }
    }

    // 7. Export Training Data
    async exportTrainingData() {
        console.log(chalk.blue.bold('📤 EXPORT TRAINING DATA'));
        console.log();
        console.log(chalk.white('1. 📊 Export Qualified Data (JSON)'));
        console.log(chalk.white('2. 📊 Export Qualified Data (CSV)'));
        console.log(chalk.white('3. 🎓 Export Graduated Features (JSON)'));
        console.log(chalk.white('4. 🎓 Export Graduated Features (CSV)'));
        console.log(chalk.white('0. ⬅️ Back to Main Menu'));
        console.log();

        const choice = await this.prompt(chalk.cyan('Select option (0-4): '));

        let endpoint, filename;
        switch (choice.trim()) {
            case '1':
                endpoint = '/api/offline/export/qualified?format=json';
                filename = 'qualified_data.json';
                break;
            case '2':
                endpoint = '/api/offline/export/qualified?format=csv';
                filename = 'qualified_data.csv';
                break;
            case '3':
                endpoint = '/api/offline/export/graduated?format=json';
                filename = 'graduated_features.json';
                break;
            case '4':
                endpoint = '/api/offline/export/graduated?format=csv';
                filename = 'graduated_features.csv';
                break;
            case '0':
                return;
            default:
                console.log(chalk.red('❌ Invalid option'));
                await this.prompt(chalk.gray('Press Enter to continue...'));
                return;
        }

        await this.performExport(endpoint, filename);
    }

    // 8. Configure Settings
    async configureSettings() {
        console.log(chalk.yellow.bold('⚙️ CONFIGURE SETTINGS'));
        console.log();
        console.log(chalk.white('1. 🔢 Set Minimum Trades Required'));
        console.log(chalk.white('2. ⏱️ Configure Processing Interval'));
        console.log(chalk.white('3. 📊 Set Batch Size'));
        console.log(chalk.white('0. ⬅️ Back to Main Menu'));
        console.log();

        const choice = await this.prompt(chalk.cyan('Select option (0-3): '));

        switch (choice.trim()) {
            case '1':
                await this.setMinTradesRequired();
                break;
            case '2':
                await this.setProcessingInterval();
                break;
            case '3':
                await this.setBatchSize();
                break;
            case '0':
                return;
            default:
                console.log(chalk.red('❌ Invalid option'));
                await this.prompt(chalk.gray('Press Enter to continue...'));
        }
    }

    // 9. Test Storage Connection
    async testConnection() {
        console.log(chalk.blue('🧪 Testing Storage Agent connection...'));
        
        try {
            const response = await this.client.get('/api/stats');
            console.log(chalk.green('✅ Connection successful!'));
            console.log(chalk.gray(`📊 Total vectors: ${response.data.stats.totalVectors || 0}`));
            return true;
        } catch (error) {
            console.log(chalk.red(`❌ Connection failed: ${error.message}`));
            console.log(chalk.yellow('💡 Make sure Storage Agent is running on http://localhost:3015'));
            throw error;
        }
    }

    // 10. View System Health
    async viewSystemHealth() {
        console.log(chalk.magenta.bold('📋 SYSTEM HEALTH CHECK'));
        console.log(chalk.gray('Checking all system components...\n'));

        const healthChecks = [];

        // Storage Agent
        try {
            await this.client.get('/api/stats');
            healthChecks.push({ component: 'Storage Agent', status: '✅ Healthy', port: '3015' });
        } catch (error) {
            healthChecks.push({ component: 'Storage Agent', status: '❌ Unavailable', port: '3015' });
        }

        // Risk Service (if accessible)
        try {
            const riskClient = axios.create({ baseURL: 'http://localhost:3017', timeout: 5000 });
            await riskClient.get('/config');
            healthChecks.push({ component: 'Risk Service', status: '✅ Healthy', port: '3017' });
        } catch (error) {
            healthChecks.push({ component: 'Risk Service', status: '❌ Unavailable', port: '3017' });
        }

        // Display results
        console.log(chalk.white.bold('🏥 COMPONENT HEALTH:'));
        healthChecks.forEach(check => {
            console.log(`${check.status} ${chalk.cyan(check.component)} (port ${check.port})`);
        });

        await this.prompt(chalk.gray('\nPress Enter to continue...'));
    }

    // Helper methods
    async getResetStatus() {
        const response = await this.client.get('/api/reset/status');
        return response.data.status;
    }

    async triggerOfflineProcessing() {
        console.log(chalk.blue('\n🔄 Triggering offline processing...'));
        const response = await this.client.post('/api/offline/process');
        
        if (response.data.success) {
            const result = response.data.result;
            console.log(chalk.green('✅ Processing completed!'));
            console.log(`${chalk.cyan('Stage 1:')} ${result.stage1.qualified} qualified`);
            console.log(`${chalk.cyan('Stage 2:')} ${result.stage2.graduated} graduated`);
        }
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async viewOfflineConfig() {
        const response = await this.client.get('/api/offline/status');
        const config = response.data.status.config;
        
        console.log(chalk.white.bold('\n⚙️ OFFLINE PROCESSING CONFIG:'));
        console.log(`${chalk.cyan('Batch size:')} ${config.batchSize}`);
        console.log(`${chalk.cyan('Processing interval:')} ${config.processingInterval / 1000}s`);
        console.log(`${chalk.cyan('Auto-processing:')} ${config.autoProcessing ? 'Enabled' : 'Disabled'}`);
        console.log(`${chalk.cyan('Graduation threshold:')} ${config.graduationThreshold}`);
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async viewProcessingStats() {
        const response = await this.client.get('/api/offline/status');
        const stats = response.data.status.stats;
        
        console.log(chalk.white.bold('\n📊 PROCESSING STATISTICS:'));
        console.log(`${chalk.cyan('Total processed:')} ${stats.totalProcessed || 0}`);
        console.log(`${chalk.cyan('Total qualified:')} ${stats.totalQualified || 0}`);
        console.log(`${chalk.cyan('Total graduated:')} ${stats.totalGraduated || 0}`);
        console.log(`${chalk.cyan('Last run:')} ${stats.lastRun ? new Date(stats.lastRun).toLocaleString() : 'Never'}`);
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async performExport(endpoint, filename) {
        console.log(chalk.blue(`\n📤 Exporting to ${filename}...`));
        
        try {
            const response = await this.client.get(endpoint);
            console.log(chalk.green('✅ Export completed!'));
            console.log(chalk.cyan(`📁 Data would be saved as: ${filename}`));
            console.log(chalk.gray(`📊 Records: ${response.data.count || 'Unknown'}`));
        } catch (error) {
            console.log(chalk.red(`❌ Export failed: ${error.message}`));
        }
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async setMinTradesRequired() {
        const current = await this.getResetStatus();
        console.log(chalk.cyan(`\nCurrent minimum trades required: ${current.minTradesRequired}`));
        
        const newValue = await this.prompt(chalk.yellow('Enter new minimum (or press Enter to keep current): '));
        
        if (newValue.trim()) {
            const num = parseInt(newValue);
            if (isNaN(num) || num < 1) {
                console.log(chalk.red('❌ Invalid number'));
            } else {
                await this.client.put('/api/reset/config', { minTradesRequired: num });
                console.log(chalk.green(`✅ Minimum trades set to ${num}`));
            }
        }
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async setProcessingInterval() {
        console.log(chalk.cyan('\nCurrent processing interval: 5 minutes'));
        console.log(chalk.gray('Enter new interval in minutes'));
        
        const newValue = await this.prompt(chalk.yellow('Minutes (or press Enter to keep current): '));
        
        if (newValue.trim()) {
            const num = parseInt(newValue);
            if (isNaN(num) || num < 1) {
                console.log(chalk.red('❌ Invalid number'));
            } else {
                await this.client.put('/api/offline/config', { processingInterval: num * 60 * 1000 });
                console.log(chalk.green(`✅ Processing interval set to ${num} minutes`));
            }
        }
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }

    async setBatchSize() {
        console.log(chalk.cyan('\nCurrent batch size: 100 records'));
        console.log(chalk.gray('Enter new batch size for processing'));
        
        const newValue = await this.prompt(chalk.yellow('Batch size (or press Enter to keep current): '));
        
        if (newValue.trim()) {
            const num = parseInt(newValue);
            if (isNaN(num) || num < 1) {
                console.log(chalk.red('❌ Invalid number'));
            } else {
                await this.client.put('/api/offline/config', { batchSize: num });
                console.log(chalk.green(`✅ Batch size set to ${num} records`));
            }
        }
        
        await this.prompt(chalk.gray('Press Enter to continue...'));
    }
}

// Check if chalk is available, provide fallback
try {
    require('chalk');
} catch (error) {
    console.log('\n⚠️  Installing required dependency: chalk');
    console.log('Run: npm install chalk\n');
    process.exit(1);
}

// Run the interactive menu
if (require.main === module) {
    const menu = new InteractiveMenu();
    menu.run().catch(error => {
        console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
        process.exit(1);
    });
}

module.exports = InteractiveMenu;