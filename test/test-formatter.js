/**
 * Test script — runs the formatters with sample payloads
 * and prints the output to console for visual verification.
 *
 * Usage: node test/test-formatter.js
 */

const { formatJob } = require('../lib/formatter');

// ─── Sample kitchen ticket job ────────────────────────────

const kitchenJob = {
    id: 42,
    jobType: 'kitchen_ticket',
    payload: JSON.stringify({
        orderNumber: 'ORD-001',
        orderType: 'dine_in',
        customerName: 'John',
        queueNumber: 5,
        items: [
            { itemName: 'Nasi Goreng', quantity: 2, notes: 'pedas', modifiers: [] },
            { itemName: 'Es Teh Manis', quantity: 1, notes: '-', modifiers: [] },
            { itemName: 'Ayam Bakar', quantity: 1, notes: 'extra sambal', modifiers: ['Extra Sauce', 'No Onion'] },
        ],
        createdAt: '2026-02-21T12:00:00',
    }),
};

// ─── Sample receipt job ───────────────────────────────────

const receiptJob = {
    id: 43,
    jobType: 'receipt',
    payload: JSON.stringify({
        orderNumber: 'ORD-001',
        orderType: 'dine_in',
        customerName: 'John',
        queueNumber: 5,
        items: [
            { itemName: 'Nasi Goreng', quantity: 2, price: 25000, notes: '' },
            { itemName: 'Es Teh Manis', quantity: 1, price: 5000, notes: '' },
            { itemName: 'Ayam Bakar', quantity: 1, price: 35000, notes: '' },
        ],
        subtotal: 90000,
        discountAmount: 5000,
        taxAmount: 8500,
        feesAmount: 0,
        totalAmount: 93500,
        createdAt: '2026-02-21T12:00:00',
    }),
};

// ─── Sample bar ticket job ────────────────────────────────

const barJob = {
    id: 44,
    jobType: 'bar_ticket',
    payload: JSON.stringify({
        orderNumber: 'ORD-002',
        orderType: 'takeaway',
        customerName: 'Alice',
        queueNumber: 8,
        items: [
            { itemName: 'Mojito', quantity: 2, notes: 'less sugar', modifiers: [] },
            { itemName: 'Lemon Tea', quantity: 1, notes: '', modifiers: [] },
        ],
        createdAt: '2026-02-21T12:30:00',
    }),
};

// ─── Run and display ─────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║         FORMATTER TEST — VISUAL OUTPUT           ║');
console.log('╚══════════════════════════════════════════════════╝\n');

console.log('▸ KITCHEN TICKET:');
console.log('');
const kitchenLines = formatJob(kitchenJob);
kitchenLines.forEach(l => console.log(l));

console.log('\n▸ CASHIER RECEIPT:');
console.log('');
const receiptLines = formatJob(receiptJob);
receiptLines.forEach(l => console.log(l));

console.log('\n▸ BAR TICKET:');
console.log('');
const barLines = formatJob(barJob);
barLines.forEach(l => console.log(l));

console.log('\n✅ All formatters executed successfully!\n');
