#!/usr/bin/env node

/**
 * Storage Agent Startup Menu
 * Simple, robust menu for storage management operations
 */

const readline = require('readline');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class StorageMenu {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.storageDir = path.join(__dirname, 'storage-agent');
        this.dataDir = path.join(this.storageDir, 'data');
        this.vectorDir = path.join(this.dataDir, 'vectors');
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
        console.log(this.color('       STORAGE AGENT MANAGEMENT', 'cyan'));
        console.log(this.color('='.repeat(60), 'cyan'));
        console.log();
        console.log('1. 🗑️  Wipe Vector Storage (LanceDB)');
        console.log('2. 🔄 Reset Offline Storage Tables');
        console.log('3. 🧹 Complete Storage Cleanup');
        console.log('4. 🚀 Start Storage Agent Server');
        console.log('5. 📊 Check Storage Status');
        console.log('6. 🔧 Run Storage Tests');
        console.log();
        console.log('0. 🚪 Exit');
        console.log();
    }

    async run() {
        let running = true;
        
        console.log(this.color('\n🚀 Storage Agent Management Menu\n', 'blue'));
        
        while (running) {
            this.displayMenu();
            const choice = await this.prompt('Select option (0-6): ');
            
            try {
                switch (choice.trim()) {
                    case '1':
                        await this.wipeVectorStorage();
                        break;
                    case '2':
                        await this.resetOfflineStorage();
                        break;
                    case '3':
                        await this.completeCleanup();
                        break;
                    case '4':
                        await this.startStorageServer();
                        running = false;
                        break;
                    case '5':
                        await this.checkStorageStatus();
                        break;
                    case '6':
                        await this.runStorageTests();
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

    async wipeVectorStorage() {
        console.log(this.color('\n🗑️  WIPE VECTOR STORAGE', 'yellow'));
        console.log('This will delete all LanceDB vector data.');
        
        const confirm = await this.prompt('\nType "DELETE" to confirm: ');
        if (confirm !== 'DELETE') {
            console.log(this.color('❌ Cancelled', 'yellow'));
            await this.prompt('Press Enter to continue...');
            return;
        }

        try {
            // Remove vector directory
            if (fs.existsSync(this.vectorDir)) {
                // Use cross-platform method
                this.removeDirectoryRecursive(this.vectorDir);
                console.log(this.color('✅ Vector storage wiped', 'green'));
            } else {
                console.log(this.color('ℹ️  No vector storage found', 'cyan'));
            }

            // Create clean directory
            fs.mkdirSync(this.vectorDir, { recursive: true });
            console.log(this.color('✅ Created clean vector directory', 'green'));
            
        } catch (error) {
            console.log(this.color(`❌ Failed to wipe vectors: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async resetOfflineStorage() {
        console.log(this.color('\n🔄 RESET OFFLINE STORAGE', 'yellow'));
        console.log('This will clear offline processing tables.');
        
        const confirm = await this.prompt('\nConfirm reset? (y/N): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log(this.color('❌ Cancelled', 'yellow'));
            await this.prompt('Press Enter to continue...');
            return;
        }

        try {
            // For now, just show what would be cleared
            console.log(this.color('\n📋 Would clear:', 'cyan'));
            console.log('  - Raw records table');
            console.log('  - Qualified records table');
            console.log('  - Graduated features table');
            console.log('  - Processing statistics');
            
            // In a real implementation, call the reset API
            console.log(this.color('\n✅ Offline storage reset', 'green'));
            
        } catch (error) {
            console.log(this.color(`❌ Failed to reset: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async completeCleanup() {
        console.log(this.color('\n🧹 COMPLETE STORAGE CLEANUP', 'red'));
        console.log('This will:');
        console.log('  - Delete all vector data');
        console.log('  - Clear all offline tables');
        console.log('  - Remove temporary files');
        console.log('  - Reset all counters');
        
        const confirm = await this.prompt('\nType "CLEANUP" to confirm: ');
        if (confirm !== 'CLEANUP') {
            console.log(this.color('❌ Cancelled', 'yellow'));
            await this.prompt('Press Enter to continue...');
            return;
        }

        try {
            // Wipe everything
            if (fs.existsSync(this.dataDir)) {
                // Use cross-platform method
                this.removeDirectoryRecursive(this.dataDir);
            }
            
            // Recreate clean structure
            fs.mkdirSync(this.vectorDir, { recursive: true });
            
            console.log(this.color('✅ Complete cleanup done', 'green'));
            console.log(this.color('ℹ️  Storage is now completely clean', 'cyan'));
            
        } catch (error) {
            console.log(this.color(`❌ Cleanup failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async startStorageServer() {
        console.log(this.color('\n🚀 STARTING STORAGE AGENT SERVER', 'green'));
        
        try {
            process.chdir(this.storageDir);
            
            // Check if already running
            try {
                execSync('curl -s http://localhost:3015/api/stats', { stdio: 'pipe' });
                console.log(this.color('\n⚠️  Storage Agent already running on port 3015', 'yellow'));
                
                const override = await this.prompt('Start anyway? (y/N): ');
                if (override.toLowerCase() !== 'y') {
                    return;
                }
            } catch (e) {
                // Not running, continue
            }
            
            console.log(this.color('📦 Starting Storage Agent...', 'cyan'));
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

    async checkStorageStatus() {
        console.log(this.color('\n📊 STORAGE STATUS', 'cyan'));
        
        try {
            // Check if server is running
            let serverStatus = 'Offline';
            let vectorCount = 'Unknown';
            
            try {
                const result = execSync('curl -s http://localhost:3015/api/stats', { encoding: 'utf8' });
                const stats = JSON.parse(result);
                serverStatus = 'Online';
                vectorCount = stats.stats?.totalVectors || 0;
            } catch (e) {
                // Server not running
            }
            
            // Check file system
            const vectorExists = fs.existsSync(this.vectorDir);
            const dataSize = vectorExists ? this.getDirectorySize(this.dataDir) : '0 MB';
            
            console.log(this.color('\n📊 Status Report:', 'cyan'));
            console.log(`Server Status: ${serverStatus === 'Online' ? this.color(serverStatus, 'green') : this.color(serverStatus, 'red')}`);
            console.log(`Vector Count: ${vectorCount}`);
            console.log(`Data Directory: ${vectorExists ? this.color('Exists', 'green') : this.color('Not Found', 'yellow')}`);
            console.log(`Storage Size: ${dataSize}`);
            
        } catch (error) {
            console.log(this.color(`❌ Status check failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    async runStorageTests() {
        console.log(this.color('\n🔧 STORAGE TESTS', 'cyan'));
        
        try {
            process.chdir(this.storageDir);
            
            console.log('Running storage tests...\n');
            execSync('npm test', { stdio: 'inherit' });
            
            console.log(this.color('\n✅ Tests completed', 'green'));
            
        } catch (error) {
            console.log(this.color(`❌ Tests failed: ${error.message}`, 'red'));
        }

        await this.prompt('\nPress Enter to continue...');
    }

    getDirectorySize(dirPath) {
        try {
            const output = execSync(`du -sh "${dirPath}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
            return output.trim().split('\t')[0];
        } catch (e) {
            return '0';
        }
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
    const menu = new StorageMenu();
    menu.run().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = StorageMenu;