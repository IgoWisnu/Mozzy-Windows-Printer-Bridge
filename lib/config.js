const fs = require('fs');
const path = require('path');

// Determine if we are running as a compiled executable (pkg) or via node.js
const isPackaged = process.pkg || (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe'));

// If packaged, look for config.json in the directory of the executable
// Otherwise, look in the root of the project
const configDir = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const configPath = path.join(configDir, 'config.json');

let config = {};
try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
} catch (err) {
    console.error(`[ERROR] Failed to load config.json from ${configPath}`);
    console.error(`[ERROR] Details:`, err.message);
    console.error(`[ERROR] Make sure config.json exists in the same folder as the application!`);
    process.exit(1);
}

module.exports = config;
