const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');
const { printLines } = require('./printer');
const dashboard = require('./dashboard-html');

const packaged = process.pkg || (process.execPath.endsWith('.exe') && !process.execPath.includes('node.exe'));
const configPath = path.join(packaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..'), 'config.json');

function normalise(input, current) {
    const areas = [...new Set((input.PRINT_AREAS || []).map(x => String(x).trim().toLowerCase().replace(/\s+/g, '_')).filter(x => /^[a-z0-9][a-z0-9_-]{0,39}$/.test(x)))];
    if (!areas.length) throw new Error('Add at least one print area.');
    const map = {}, copies = {};
    for (const area of areas) {
        const printer = String(input.PRINTER_MAP?.[area] || '').trim();
        if (!printer) throw new Error(`Enter a Windows printer name for ${area}.`);
        map[area] = printer;
        copies[area] = Math.min(10, Math.max(1, Number(input.PRINT_COPIES_MAP?.[area]) || 1));
    }
    return { ...current, ...input, PRINT_AREAS: areas, PRINTER_MAP: map, PRINT_COPIES_MAP: copies, PAPER_WIDTH: [33, 35, 40, 42, 48].includes(Number(input.PAPER_WIDTH)) ? Number(input.PAPER_WIDTH) : 35, PRINT_COPIES: Math.min(10, Math.max(1, Number(input.PRINT_COPIES) || 1)), DEFAULT_PRINTER: map[areas[0]] };
}

function startWebServer(port = 5000) {
    const app = express();
    app.use(express.json());
    app.get('/', (req, res) => res.type('html').send(dashboard));
    app.get('/api/logs', (req, res) => res.json({ success: true, logs: logger.getRecentLogs() }));
    app.get('/api/config', (req, res) => {
        try { res.json({ success: true, config: JSON.parse(fs.readFileSync(configPath, 'utf8')) }); }
        catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });
    app.post('/api/config', (req, res) => {
        try {
            const next = normalise(req.body || {}, JSON.parse(fs.readFileSync(configPath, 'utf8')));
            fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
            Object.assign(config, next);
            const { reconnectSocket } = require('./socket'); reconnectSocket();
            logger.success('Configuration updated via Web Dashboard');
            res.json({ success: true });
        } catch (err) { logger.error(`Failed to save configuration: ${err.message}`); res.status(400).json({ success: false, message: err.message }); }
    });
    app.post('/api/test-print', async (req, res) => {
        const area = String(req.body?.printArea || '').toLowerCase();
        if (!config.PRINT_AREAS?.includes(area)) return res.status(400).json({ success: false, message: 'Unknown print area.' });
        try { await printLines(['========================================', 'TEST PRINT - ' + area.toUpperCase(), '========================================', 'Your printer is connected.', ''], area); res.json({ success: true }); }
        catch (err) { logger.error(`Test print failed for ${area}: ${err.message}`); res.status(500).json({ success: false, message: err.message }); }
    });
    const listener = app.listen(port, () => logger.success(`Web Dashboard UI running at http://localhost:${port}`));
    listener.on('error', err => logger.error(`Web Dashboard failed to start: ${err.message}`));
}
module.exports = { startWebServer };
