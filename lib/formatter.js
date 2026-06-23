const config = require('./config');

const PAPER_WIDTH = config.PAPER_WIDTH || 48;

// ─── Helpers ──────────────────────────────────────────────

function line(char = '-') {
    return char.repeat(PAPER_WIDTH);
}

function center(text) {
    const pad = Math.max(0, Math.floor((PAPER_WIDTH - text.length) / 2));
    return ' '.repeat(pad) + text;
}

function leftRight(left, right) {
    const gap = PAPER_WIDTH - left.length - right.length;
    if (gap < 1) return left + ' ' + right;
    return left + ' '.repeat(gap) + right;
}

function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return 'Rp ' + num.toLocaleString('id-ID');
}

function formatDate(dateStr) {
    try {
        if (!dateStr) return new Date().toLocaleString('id-ID');
        // Handle both ISO string and locale string (e.g. "27/2/2026, 09.20.51")
        return dateStr;
    } catch {
        return dateStr || '-';
    }
}

function orderTypeLabel(payload) {
    // Support both formats:
    //   BE sends: isDineIn (boolean) or orderType (string)
    if (payload.isDineIn !== undefined) {
        return payload.isDineIn ? 'Dine In' : 'Takeaway';
    }
    if (payload.orderType) {
        return payload.orderType
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
    return '-';
}

// ─── Kitchen / Bar Ticket ─────────────────────────────────

function formatKitchenTicket(payload) {
    const lines = [];

    const rawArea = payload.print_area || 'Kitchen';
    const areaName = rawArea.split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    lines.push(line('='));
    lines.push(center(`-- ${areaName} --`));
    if (payload.printStatus) {
        lines.push(center(payload.printStatus));
    }
    lines.push(line('='));
    lines.push(`Order    : ${payload.orderNumber || '-'}`);
    lines.push(`Type     : ${orderTypeLabel(payload)}`);
    if (payload.queueNumber != null) {
        lines.push(`Queue    : #${payload.queueNumber}`);
    }
    if (payload.customerName) {
        lines.push(`Customer : ${payload.customerName}`);
    }
    if (payload.table && payload.table !== '-') {
        lines.push(`Table    : ${payload.table}`);
    }
    lines.push(line('-'));

    if (Array.isArray(payload.items)) {
        for (const item of payload.items) {
            // Support both field names: qty/quantity, name/itemName
            const qty = item.qty || item.quantity || 1;
            const name = item.name || item.itemName || 'Unknown Item';
            lines.push(`${qty}x  ${name}`);

            const note = item.note || item.notes;
            if (note && note !== '-' && note !== '') {
                lines.push(`    Note: ${note}`);
            }
            if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
                for (const mod of item.modifiers) {
                    lines.push(`    + ${typeof mod === 'string' ? mod : mod.name || mod}`);
                }
            }
        }
    }

    lines.push(line('-'));
    lines.push(`Time: ${formatDate(payload.date || payload.createdAt)}`);
    lines.push(line('='));
    lines.push(''); // blank line before cut

    return lines;
}

// ─── Cashier Receipt ──────────────────────────────────────

function formatReceipt(payload) {
    // Support both field names: storeName from payload or config
    const storeName = payload.storeName || payload.businessName || config.STORE_NAME || 'YOUR STORE NAME';
    const lines = [];

    lines.push(line('='));
    lines.push(center(storeName));
    if (payload.storeAddress) {
        lines.push(center(payload.storeAddress));
    }
    if (payload.storePhone) {
        lines.push(center(payload.storePhone));
    }
    lines.push(line('='));
    lines.push(`Order    : ${payload.orderNumber || '-'}`);
    lines.push(`Type     : ${orderTypeLabel(payload)}`);
    if (payload.queueNumber != null) {
        lines.push(`Queue    : #${payload.queueNumber}`);
    }
    if (payload.customerName) {
        lines.push(`Customer : ${payload.customerName}`);
    }
    if (payload.table && payload.table !== '-') {
        lines.push(`Table    : ${payload.table}`);
    }
    if (payload.cashierName) {
        lines.push(`Cashier  : ${payload.cashierName}`);
    }
    lines.push(line('-'));

    // Items
    if (Array.isArray(payload.items)) {
        for (const item of payload.items) {
            // Support both field names
            const qty = Number(item.qty || item.quantity || 1);
            const name = item.name || item.itemName || 'Item';
            const price = item.pricePerItem || item.price || 0;
            const total = item.totalPrice || (qty * price);

            lines.push(leftRight(
                `${qty}x ${name}`,
                formatCurrency(total)
            ));

            const note = item.note || item.notes;
            if (note && note !== '-' && note !== '') {
                lines.push(`    Note: ${note}`);
            }
        }
        lines.push(line('-'));
    }

    // Totals — support both field name formats
    const subtotal = payload.subtotal != null ? payload.subtotal : null;
    const discount = payload.discountAmount || payload.discount || 0;
    const tax = payload.taxAmount || payload.tax || 0;
    const fees = payload.feesAmount || payload.fees || 0;
    const grandTotal = payload.grandTotal || payload.totalAmount || 0;

    if (subtotal != null) {
        lines.push(leftRight('Subtotal', formatCurrency(subtotal)));
    }
    if (discount) {
        lines.push(leftRight('Discount', '- ' + formatCurrency(discount)));
    }
    if (tax) {
        lines.push(leftRight('Tax', formatCurrency(tax)));
    }
    if (fees) {
        lines.push(leftRight('Fees', formatCurrency(fees)));
    }
    lines.push(line('-'));
    lines.push(leftRight('TOTAL', formatCurrency(grandTotal)));
    lines.push(line('='));

    // Payment info
    if (payload.paymentMethod) {
        lines.push(leftRight('Payment', payload.paymentMethod));
    }
    if (payload.payAmount) {
        lines.push(leftRight('Paid', formatCurrency(payload.payAmount)));
    }
    if (payload.changeAmount) {
        lines.push(leftRight('Change', formatCurrency(payload.changeAmount)));
    }
    if (payload.paymentStatus) {
        lines.push(leftRight('Status', payload.paymentStatus));
    }

    lines.push(line('='));
    lines.push(center('Terima Kasih!'));
    lines.push(`Time: ${formatDate(payload.date || payload.createdAt)}`);
    lines.push(line('='));
    lines.push(''); // blank line before cut

    return lines;
}

// ─── Dispatcher ───────────────────────────────────────────

/**
 * Format a print job's payload into an array of text lines.
 * @param {object} job - The print job object from the API
 * @returns {string[]} Array of formatted text lines
 */
function formatJob(job) {
    let payload;
    try {
        payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    } catch (err) {
        throw new Error(`Failed to parse payload for job #${job.id}: ${err.message}`);
    }

    const jobType = (job.jobType || '').toLowerCase();

    switch (jobType) {
        case 'kitchen_ticket':
        case 'bar_ticket':
            return formatKitchenTicket(payload);
        case 'receipt':
            return formatReceipt(payload);
        default:
            // Default to kitchen ticket layout for unknown types
            return formatKitchenTicket(payload);
    }
}

module.exports = { formatJob, formatKitchenTicket, formatReceipt, formatCurrency };
