/**
 * Standalone test script to verify printer connectivity and output.
 * Usage: node test/printer-test.js [targetArea]
 * Examples:
 *   node test/printer-test.js          (Uses DEFAULT_PRINTER)
 *   node test/printer-test.js kitchen  (Uses printer mapped to "kitchen")
 */

const { printLines, resolvePrinter } = require('../lib/printer');
const config = require('../config.json');

async function runTest() {
    const args = process.argv.slice(2);
    const targetArea = args[0] || 'default';

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║               PRINTER HARDWARE TEST              ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    const printerName = resolvePrinter(targetArea === 'default' ? null : targetArea);

    console.log(`Testing Area   : ${targetArea}`);
    console.log(`Target Printer : "${printerName}"`);
    console.log(`Dry Run Mode   : ${config.DRY_RUN ? 'ON (Console only)' : 'OFF (Physical printer)'}\n`);

    const testLines = [
        '================================',
        '      PRINTER TEST SUCCESS      ',
        '================================',
        '',
        `Target Area : ${targetArea}`,
        `Printer Name: ${printerName}`,
        `Date/Time   : ${new Date().toLocaleString()}`,
        '',
        'If you can read this, your local',
        'print service is correctly setup',
        'and talking to the hardware.',
        '',
        '--------------------------------',
        'End of Test',
        '================================',
    ];

    try {
        console.log('Sending test print command...');
        await printLines(testLines, targetArea === 'default' ? null : targetArea);
        console.log('\n✅ Test complete. Did the hardware print?');
    } catch (err) {
        console.log('\n❌ Test failed:');
        console.error(err.message);
    }
}

runTest();
