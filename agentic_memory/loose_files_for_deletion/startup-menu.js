#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Service configurations
const services = {
    storage: {
        name: 'Storage Agent',
        port: 3015,
        path: './storage-agent',
        command: 'node',
        args: ['server.js'],
        healthUrl: 'http://localhost:3015/health'
    },
    risk: {
        name: 'Risk Service',
        port: 3017,
        path: './risk-service',
        command: 'node',
        args: ['server.js'],
        healthUrl: 'http://localhost:3017/health'
    },
    gp: {
        name: 'GP Service',
        port: 3020,
        path: './gp-service',
        command: 'python',
        args: ['server.py'],
        healthUrl: 'http://localhost:3020/health'
    }
};

const runningServices = {};

function clearScreen() {
    console.clear();
}

function displayHeader() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          🧠 Agentic Memory System - Startup Menu 🧠           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log();
}

function displayMenu() {
    console.log('📋 Main Menu:');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('1. 🚀 Start All Services');
    console.log('2. 📦 Start Storage Agent (Port 3015)');
    console.log('3. 🎯 Start Risk Service (Port 3017)');
    console.log('4. 🤖 Start GP Service (Port 3020)');
    console.log('5. 🔍 Check Service Status');
    console.log('6. 🛑 Stop All Services');
    console.log('7. 📊 Open GP Training Menu');
    console.log('8. 🌐 Open Vector Viewer (Browser)');
    console.log('9. 📝 View Logs');
    console.log('0. 🚪 Exit');
    console.log('────────────────────────────────────────────────────────────────');
}

function startService(serviceKey) {
    const service = services[serviceKey];
    
    if (runningServices[serviceKey]) {
        console.log(`⚠️  ${service.name} is already running on port ${service.port}`);
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        console.log(`🔄 Starting ${service.name}...`);
        
        const servicePath = path.join(__dirname, service.path);
        
        // Check if service directory exists
        if (!fs.existsSync(servicePath)) {
            console.log(`❌ Service path not found: ${servicePath}`);
            resolve();
            return;
        }

        const proc = spawn(service.command, service.args, {
            cwd: servicePath,
            stdio: 'pipe',
            shell: true
        });

        runningServices[serviceKey] = proc;

        proc.stdout.on('data', (data) => {
            console.log(`[${service.name}] ${data.toString().trim()}`);
        });

        proc.stderr.on('data', (data) => {
            console.error(`[${service.name}] ERROR: ${data.toString().trim()}`);
        });

        proc.on('close', (code) => {
            console.log(`[${service.name}] Process exited with code ${code}`);
            delete runningServices[serviceKey];
        });

        // Give service time to start
        setTimeout(() => {
            console.log(`✅ ${service.name} started on port ${service.port}`);
            resolve();
        }, 2000);
    });
}

async function startAllServices() {
    console.log('🚀 Starting all services...\n');
    
    // Start in order: Storage → Risk → GP
    await startService('storage');
    await startService('risk');
    await startService('gp');
    
    console.log('\n✅ All services started!');
}

function stopAllServices() {
    console.log('🛑 Stopping all services...\n');
    
    Object.entries(runningServices).forEach(([key, proc]) => {
        const service = services[key];
        console.log(`Stopping ${service.name}...`);
        
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', proc.pid, '/f', '/t']);
        } else {
            proc.kill('SIGTERM');
        }
    });
    
    console.log('\n✅ All services stopped!');
}

async function checkServiceStatus() {
    console.log('🔍 Checking service status...\n');
    
    for (const [key, service] of Object.entries(services)) {
        const isRunning = !!runningServices[key];
        const status = isRunning ? '🟢 Running' : '🔴 Stopped';
        console.log(`${service.name}: ${status} (Port ${service.port})`);
    }
}

function openGPMenu() {
    console.log('📊 Opening GP Training Menu...');
    
    const gpMenu = spawn('node', ['gp-menu.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });
    
    gpMenu.on('close', () => {
        console.log('GP Menu closed');
        promptUser();
    });
}

function openVectorViewer() {
    console.log('🌐 Opening Vector Viewer...');
    
    const viewerPath = 'file:///C:/Users/aport/Documents/Production_Curves/Production/agentic_memory/simple-viewer.html';
    
    const command = process.platform === 'win32' ? 'start' :
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
    
    spawn(command, [viewerPath], { shell: true });
    
    console.log('✅ Vector viewer opened in browser');
}

function viewLogs() {
    console.log('📝 Select service to view logs:');
    console.log('1. Storage Agent');
    console.log('2. Risk Service');
    console.log('3. GP Service');
    console.log('4. Back to main menu');
    
    rl.question('Enter choice: ', (answer) => {
        const choice = parseInt(answer);
        
        switch (choice) {
            case 1:
            case 2:
            case 3:
                const serviceKey = ['storage', 'risk', 'gp'][choice - 1];
                if (runningServices[serviceKey]) {
                    console.log(`\n📜 Recent logs for ${services[serviceKey].name}:`);
                    console.log('(Press Ctrl+C to return to menu)');
                    // Logs are already being displayed via stdout
                } else {
                    console.log(`⚠️  ${services[serviceKey].name} is not running`);
                }
                break;
        }
        
        setTimeout(promptUser, 1000);
    });
}

function promptUser() {
    displayMenu();
    
    rl.question('\nEnter your choice (0-9): ', async (answer) => {
        const choice = parseInt(answer);
        
        clearScreen();
        displayHeader();
        
        switch (choice) {
            case 1:
                await startAllServices();
                break;
            case 2:
                await startService('storage');
                break;
            case 3:
                await startService('risk');
                break;
            case 4:
                await startService('gp');
                break;
            case 5:
                await checkServiceStatus();
                break;
            case 6:
                stopAllServices();
                break;
            case 7:
                openGPMenu();
                return; // Don't prompt again until GP menu closes
            case 8:
                openVectorViewer();
                break;
            case 9:
                viewLogs();
                return; // viewLogs handles its own prompting
            case 0:
                console.log('👋 Exiting... Stopping all services...');
                stopAllServices();
                rl.close();
                process.exit(0);
                return;
            default:
                console.log('❌ Invalid choice. Please try again.');
        }
        
        // Show menu again after a delay
        setTimeout(promptUser, 2000);
    });
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\n\n🛑 Interrupted! Stopping all services...');
    stopAllServices();
    rl.close();
    process.exit(0);
});

process.on('exit', () => {
    stopAllServices();
});

// Start the menu
clearScreen();
displayHeader();
console.log('Welcome to the Agentic Memory System Startup Menu!');
console.log('This menu helps you manage all system services.\n');

promptUser();