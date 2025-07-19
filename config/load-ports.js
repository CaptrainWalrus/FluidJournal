const fs = require('fs');
const path = require('path');

// Read the .ports_env file
const portsEnvPath = path.join(__dirname, '..', '.ports_env');
const portsEnvContent = fs.readFileSync(portsEnvPath, 'utf8');

// Parse the content into an object
const portsEnv = {};
portsEnvContent.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) return;
    
    const [key, value] = line.split('=');
    if (key && value) {
        portsEnv[key.trim()] = value.trim();
    }
});

// Attach to process
process.ports_env = portsEnv;

module.exports = portsEnv; 