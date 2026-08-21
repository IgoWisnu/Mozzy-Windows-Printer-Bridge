const config = require('./lib/config');
const logger = require('./lib/logger');
const { connectSocket } = require('./lib/socket');
const { checkAllPrinters } = require('./lib/printer');
const { startWebServer } = require('./lib/server');

let isShuttingDown = false;

// ─── Startup ─────────────────────────────────────────────

async function start() {
    startWebServer(5000);
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║       Local Print Service (WSS)      ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  Server  : ${config.SERVER_URL.padEnd(24)} ║`);
    console.log(`  ║  Width   : ${String(config.PAPER_WIDTH + ' chars').padEnd(24)} ║`);
    console.log('  ╠══════════════════════════════════════╣');

    // Show printer routing
    const map = config.PRINTER_MAP || {};
    const defaultPrinter = config.DEFAULT_PRINTER || config.PRINTER_NAME || 'POS-80';
    const entries = Object.entries(map);

    if (entries.length > 0) {
        for (const [type, printer] of entries) {
            const typeLabel = type.padEnd(16);
            console.log(`  ║  ${typeLabel}→ ${printer.padEnd(16)} ║`);
        }
    } else {
        console.log(`  ║  Printer : ${defaultPrinter.padEnd(24)} ║`);
    }
    console.log('  ╠══════════════════════════════════════╣');

    // Check printer connections
    console.log('  ║  Checking printer connections...     ║');
    const statuses = await checkAllPrinters();
    for (const p of statuses) {
        const icon = p.ready ? '✅' : '❌';
        const label = p.name.padEnd(20);
        const statusText = (p.ready ? 'Online' : p.status).padEnd(12);
        console.log(`  ║  ${icon} ${label} ${statusText} ║`);
    }

    console.log('  ╚══════════════════════════════════════╝');
    console.log('');

    const allReady = statuses.every(p => p.ready);
    if (!allReady) {
        const offline = statuses.filter(p => !p.ready).map(p => p.name);
        logger.warn(`Printer(s) offline: ${offline.join(', ')}`);
    }

    logger.info('Local Print Service started');

    // Connect to Socket.io server
    connectSocket();
}

// ─── Graceful shutdown ───────────────────────────────────

function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('');
    logger.info(`Received ${signal} — shutting down gracefully...`);

    const { disconnectSocket } = require('./lib/socket');
    disconnectSocket();

    setTimeout(() => {
        logger.info('Local Print Service stopped');
        process.exit(0);
    }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors so the app doesn't crash
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', String(reason));
});

// ─── Go! ─────────────────────────────────────────────────

start();
