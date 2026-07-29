const path = require('path');
const config = require('./config');

const PAPER_WIDTH = config.PAPER_WIDTH || 42;

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
        let d;
        if (!dateStr) {
            d = new Date();
        } else {
            d = new Date(dateStr);
            if (isNaN(d.getTime())) {
                return dateStr;
            }
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year}, ${hours}:${minutes}`;
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

function wrapText(text, width = PAPER_WIDTH) {
    const lines = [];
    const paragraphs = text.split('\n');
    for (const paragraph of paragraphs) {
        const words = paragraph.split(' ');
        let currentLine = '';
        for (const word of words) {
            if (!currentLine) {
                currentLine = word;
            } else if (currentLine.length + 1 + word.length <= width) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }
    return lines;
}

function formatItemRow(produk, harga, qty, total) {
    const col1Width = Math.floor(PAPER_WIDTH * 0.36); // 36% for product name
    const col2Width = Math.floor(PAPER_WIDTH * 0.24); // 24% for unit price
    const col3Width = Math.floor(PAPER_WIDTH * 0.12); // 12% for quantity / Jml
    const col4Width = PAPER_WIDTH - col1Width - col2Width - col3Width; // remaining for total
    
    // Truncate or pad product name to fit its column width
    const c1 = produk.length > col1Width ? produk.substring(0, col1Width - 1) + ' ' : produk.padEnd(col1Width);
    const c2 = harga.padStart(col2Width);
    const c3 = qty.padStart(col3Width);
    const c4 = total.padStart(col4Width);
    
    return c1 + c2 + c3 + c4;
}

// ─── Cashier Receipt ──────────────────────────────────────

function formatReceipt(payload) {
    const lines = [];

    // 1. Add logo in center (small) - resolved dynamically relative to executable or project directory
    const isPackaged = process.pkg || (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe'));
    const baseDir = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
    const logoPath = path.join(baseDir, 'assets', 'logo_small.png').replace(/\\/g, '/');
    lines.push(`[IMAGE:${logoPath}]`);

    // Business details centered
    lines.push('\x1BE\x01' + center('Mandala Gold') + '\x1BE\x00');
    lines.push(center('Percetakan, Advertising, Bingkai foto'));
    lines.push(line('-'));
    lines.push(center('Wa : 085738248833 ( Order Online )'));
    
    const address = 'Jln. Kecubung, Semarapura Klod, Klungkung - Bali. 80716';
    const wrappedAddress = wrapText(address, PAPER_WIDTH);
    for (const addrLine of wrappedAddress) {
        lines.push(center(addrLine));
    }

    lines.push(line('-'));

    // 2. Information detail (aligned left, colons aligned)
    lines.push(`Kode Order   : ${payload.orderNumber || '-'}`);
    lines.push(`Tanggal      : ${formatDate(payload.date || payload.createdAt)}`);
    lines.push(`Kepada       : ${payload.customerName || '-'}`);
    lines.push(`Kasir        : ${payload.cashierName || '-'}`);

    lines.push(line('-'));

    // 3. Item section header (Produk, Harga, Jumlah, Total)
    lines.push(formatItemRow('Produk', 'Harga', 'Jml', 'Total'));

    lines.push(line('-'));

    // 4. Items
    if (Array.isArray(payload.items)) {
        for (const item of payload.items) {
            const qty = Number(item.qty || item.quantity || 1);
            const name = item.name || item.itemName || 'Item';
            const price = item.pricePerItem || item.price || 0;
            const total = item.totalPrice || (qty * price);

            lines.push(formatItemRow(
                name,
                formatCurrency(price),
                String(qty),
                formatCurrency(total)
            ));

            const note = item.note || item.notes;
            if (note && note !== '-' && note !== '') {
                lines.push(`- ${note}`);
            }
        }
    }

    lines.push(line('-'));

    // 5. Payment section
    const subtotal = payload.subtotal != null ? payload.subtotal : null;
    const discount = payload.discountAmount || payload.discount || 0;
    const grandTotal = payload.grandTotal || payload.totalAmount || 0;
    const payAmount = payload.payAmount || 0;
    const changeAmount = payload.changeAmount || 0;
    const isComplete = payAmount >= grandTotal;
    const sisa = isComplete ? 0 : (grandTotal - payAmount);

    if (subtotal != null) {
        lines.push(leftRight('Subtotal', formatCurrency(subtotal)));
    }
    if (discount) {
        lines.push(leftRight('Diskon', `- ${formatCurrency(discount)}`));
    }
    lines.push(leftRight('Total', formatCurrency(grandTotal)));
    lines.push(leftRight('Bayar', formatCurrency(payAmount)));
    lines.push(leftRight('Sisa', formatCurrency(sisa)));
    lines.push(leftRight('Mode Pembayaran', payload.paymentMethod || '-'));

    lines.push(line('-'));

    // 6. Keterangan
    lines.push('Keterangan : ' + '\x1BE\x01' + (isComplete ? 'LUNAS' : 'DEPOSIT') + '\x1BE\x00');

    lines.push(line('-'));

    // 7. Footer
    lines.push('INFO PENTING :');
    
    const footerTexts = [
        'Barang yang sudah dibeli / dipesan tidak dapat ditukar / dikembalikan.',
        'Silahkan Cek Kembali Orderan Anda Sebelum Meninggalkan Mandala Gold.',
        "Kami Tidak Menerima Komplin Setelah Desain Di Cek & 'OK' Oleh Costumer",
        'Kami Tidak Menerima Komplin Setelah Barang diambil dan berada di luar Area Mandala Gold Percetakan.',
        'Harga belum termasuk pajak yang berlaku'
    ];

    for (const text of footerTexts) {
        const wrapped = wrapText('* ' + text, PAPER_WIDTH);
        for (const wl of wrapped) {
            lines.push(wl);
        }
    }

    lines.push('');
    lines.push(center('TERIMA KASIH'));
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push(''); // blank lines before cut
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
