const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logEmitter = new EventEmitter();
const recentLogs = [];
const MAX_RECENT_LOGS = 150;

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

function pushLog(type, message) {
    const logItem = {
        id: Date.now() + Math.random(),
        timestamp: getTimestamp(),
        type,
        message,
        formatted: `[${getTimestamp()}] [${type.toUpperCase().padEnd(5)}] ${message}`
    };

    recentLogs.push(logItem);
    if (recentLogs.length > MAX_RECENT_LOGS) {
        recentLogs.shift();
    }

    logEmitter.emit('log', logItem);
}

const logger = {
    info(...args) {
        const message = args.join(' ');
        const msg = `[${getTimestamp()}] [INFO]  ${message}`;
        console.log(msg);
        writeToFile(msg);
        pushLog('info', message);
    },

    warn(...args) {
        const message = args.join(' ');
        const msg = `[${getTimestamp()}] [WARN]  ${message}`;
        console.warn(msg);
        writeToFile(msg);
        pushLog('warn', message);
    },

    error(...args) {
        const message = args.join(' ');
        const msg = `[${getTimestamp()}] [ERROR] ${message}`;
        console.error(msg);
        writeToFile(msg);
        pushLog('error', message);
    },

    success(...args) {
        const message = args.join(' ');
        const msg = `[${getTimestamp()}] [OK]    ${message}`;
        console.log(msg);
        writeToFile(msg);
        pushLog('success', message);
    },

    onLog(listener) {
        logEmitter.on('log', listener);
    },

    getRecentLogs() {
        return recentLogs;
    }
};

module.exports = logger;
