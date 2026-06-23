const { io } = require('socket.io-client');
const logger = require('./logger');
const config = require('./config');
const { formatJob } = require('./formatter');
const { printLines, resolvePrinter } = require('./printer');

let socket = null;

function connectSocket() {
    if (!config.API_KEY || config.API_KEY === 'YOUR_API_KEY_HERE') {
        logger.error('API_KEY is missing or not configured in config.json. Cannot connect to POS server.');
        return;
    }

    logger.info(`Connecting to POS server at ${config.SERVER_URL}...`);

    socket = io(config.SERVER_URL, {
        query: { apiKey: config.API_KEY },
        reconnection: true,
        reconnectionDelay: 3000,
    });

    socket.on('connect', () => {
        logger.success('Connected to POS server via Socket.io');

        // Register which print areas this machine handles
        const areas = config.PRINT_AREAS || [];
        if (areas.length > 0) {
            socket.emit('register-printer', { printAreas: areas });
            logger.info(`Registering for print areas: ${areas.join(', ')}`);
        } else {
            logger.warn('No PRINT_AREAS configured. This printer will not receive any area-specific jobs.');
        }
    });

    socket.on('register-success', (data) => {
        logger.success(`Registration successful: ${data.message || 'Rooms joined'}`);
        if (data.rooms) {
            logger.info(`Listening on rooms: ${data.rooms.join(', ')}`);
        }
    });

    socket.on('connect_error', (err) => {
        logger.error(`Connection failed: ${err.message}`);
    });

    socket.on('disconnect', (reason) => {
        logger.warn(`Disconnected from POS server: ${reason}`);
    });

    // Handle incoming print jobs
    socket.on('print-job', async (data) => {
        const jobLabel = `Job #${data.id} [${data.printArea}]`;
        logger.info(`Received ${jobLabel}...`);

        // Report intermediate status (optional)
        socket.emit('job-status-update', { id: data.id, status: 'printing' });

        try {
            const printerName = resolvePrinter(data.printArea);

            // Route format based on printArea:
            //   cashier, cashier2, etc → receipt format (with totals, payment info)
            //   kitchen/bar/etc → kitchen ticket format (just items)
            const jobType = (data.printArea || '').toLowerCase().startsWith('cashier') ? 'receipt' : 'kitchen_ticket';

            const formatData = {
                id: data.id,
                jobType: jobType,
                payload: data.payload
            };

            const lines = formatJob(formatData);

            // Send to printer
            await printLines(lines, data.printArea);

            logger.success(`${jobLabel} → "${printerName}" — printed successfully`);

            // Report success
            socket.emit('job-status-update', { id: data.id, status: 'success' });

        } catch (err) {
            logger.error(`${jobLabel} — print failed: ${err.message}`);

            // Report failure
            socket.emit('job-status-update', {
                id: data.id,
                status: 'failed',
                errorMessage: err.message
            });
        }
    });

    socket.on('job-status-updated', (data) => {
        logger.info(`Job #${data.id} server status updated to: ${data.status}`);
    });

    socket.on('job-status-error', (data) => {
        logger.error(`Job status update failed: ${data.message}`);
    });
}

function disconnectSocket() {
    if (socket) {
        logger.info('Disconnecting Socket.io...');
        socket.disconnect();
    }
}

module.exports = { connectSocket, disconnectSocket };
