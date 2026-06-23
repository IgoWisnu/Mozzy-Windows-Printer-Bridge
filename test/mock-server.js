/**
 * Mock POS Socket.io Server for testing the Local Print Service.
 *
 * Simulates:
 *   - Verifying connection with apiKey
 *   - Emitting `register-success` rooms
 *   - Emitting `print-job` events on enter keypress
 *   - Listening to `job-status-update` with logs
 *
 * Usage:
 *   node test/mock-server.js
 *
 * Then in another terminal:
 *   node index.js
 */

const { Server } = require('socket.io');

const PORT = 3001;
const VALID_API_KEY = 'YOUR_API_KEY_HERE';

const io = new Server(PORT, {
    cors: { origin: '*' }
});

let jobIdCounter = 1;

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║    Mock POS Socket.io Server         ║');
console.log('  ╠══════════════════════════════════════╣');
console.log(`  ║  Port: ${PORT}                          ║`);
console.log(`  ║  Key : ${VALID_API_KEY}    ║`);
console.log('  ╚══════════════════════════════════════╝');
console.log('');
console.log('  Listening for incoming Socket.io connections...');
console.log('');

io.use((socket, next) => {
    const apiKey = socket.handshake.query.apiKey;
    if (!apiKey) {
        return next(new Error('Authentication error: apiKey is required.'));
    }
    if (apiKey !== VALID_API_KEY) {
        return next(new Error('Authentication error: invalid apiKey.'));
    }
    next();
});

io.on('connection', (socket) => {
    console.log(`[Mock] 🟢 Service connected: ${socket.id}`);

    // Expecting register-printer
    socket.on('register-printer', (data) => {
        const areas = data.printAreas || [];
        console.log(`[Mock] 📡 Registration request for areas: ${areas.join(', ')}`);

        let rooms = areas.map(area => `1:1:${area}`);
        rooms.forEach((room) => socket.join(room));

        socket.emit('register-success', {
            message: "Printer registered successfully.",
            rooms: rooms
        });
    });

    // Listening to job status updates
    socket.on('job-status-update', (data) => {
        console.log(`[Mock] 📥 Status Update for Job #${data.id}: '${data.status}' ${data.errorMessage ? `(Error: ${data.errorMessage})` : ''}`);

        // Confirm back
        socket.emit('job-status-updated', {
            id: data.id,
            status: data.status
        });
    });

    socket.on('disconnect', () => {
        console.log(`[Mock] 🔴 Service disconnected: ${socket.id}`);
    });
});

// Emulate pushing out jobs
function createAndPushSampleJob(printArea) {
    const job = {
        id: jobIdCounter++,
        orderId: 100,
        printArea: printArea,
        retryCount: 0,
        payload: {
            print_area: printArea,
            orderNumber: "ORD-999",
            orderType: "dine-in",
            customerName: "Jane Doe",
            queueNumber: 12,
            items: [
                { itemId: 1, itemName: "Nasi Goreng Spesial", quantity: 2, notes: "Extra pedas" },
                { itemId: 5, itemName: "Es Teh Manis", quantity: 1, notes: null }
            ],
            createdAt: new Date().toISOString()
        }
    };

    // Convert to receipt format if mapping requires it
    if (printArea === 'cashier') {
        job.payload.subtotal = 55000;
        job.payload.discountAmount = 0;
        job.payload.taxAmount = 5500;
        job.payload.totalAmount = 60500;
    }

    // Since mock logic joins "1:1:area", we emit to that room
    const room = `1:1:${printArea}`;
    console.log(`\n[Mock] 🚀 Emitting 'print-job' (ID: ${job.id}) to room '${room}'`);
    io.to(room).emit('print-job', job);
}

// Press Enter to add more sample jobs
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data) => {
    const input = data.trim();
    if (input === 'k') {
        createAndPushSampleJob('kitchen');
    } else if (input === 'c') {
        createAndPushSampleJob('cashier');
    } else if (input === 'b') {
        createAndPushSampleJob('bar');
    } else {
        console.log('Commands:');
        console.log('  [k] + Enter -> Send kitchen job');
        console.log('  [c] + Enter -> Send cashier job');
        console.log('  [b] + Enter -> Send bar job');
    }
});
