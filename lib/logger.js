const fs = require('fs');
const path = require('path');

const isPackaged = process.pkg || (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe'));
const baseDir = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const LOG_DIR = path.join(baseDir, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getTimestamp() {
    return new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    });
}

function getLogFileName() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `bridge-${y}-${m}-${d}.log`;
}

function writeToFile(message) {
    try {
        const filePath = path.join(LOG_DIR, getLogFileName());
        fs.appendFileSync(filePath, message + '\n', 'utf8');
    } catch {
        // silently ignore file write errors
    }
}

const logger = {
    info(...args) {
        const msg = `[${getTimestamp()}] [INFO]  ${args.join(' ')}`;
        console.log(msg);
        writeToFile(msg);
    },

    warn(...args) {
        const msg = `[${getTimestamp()}] [WARN]  ${args.join(' ')}`;
        console.warn(msg);
        writeToFile(msg);
    },

    error(...args) {
        const msg = `[${getTimestamp()}] [ERROR] ${args.join(' ')}`;
        console.error(msg);
        writeToFile(msg);
    },

    success(...args) {
        const msg = `[${getTimestamp()}] [OK]    ${args.join(' ')}`;
        console.log(msg);
        writeToFile(msg);
    },
};

module.exports = logger;
