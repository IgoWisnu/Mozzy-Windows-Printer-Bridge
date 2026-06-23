const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const config = require('./config');

/**
 * ESC/POS command bytes
 */
const ESC = '\x1B';
const GS = '\x1D';
const CMD = {
    INIT: ESC + '@',
    CUT: GS + 'V' + '\x41' + '\x03',   // Partial cut with 3-line feed
    BOLD_ON: ESC + 'E' + '\x01',
    BOLD_OFF: ESC + 'E' + '\x00',
    CENTER: ESC + 'a' + '\x01',
    LEFT: ESC + 'a' + '\x00',
    NEWLINE: '\n',
};

/**
 * PowerShell script to send raw bytes to a Windows printer.
 * Uses winspool.drv P/Invoke (the standard Windows raw printing API).
 */
const RAW_PRINT_PS_SCRIPT = `
param([string]$PrinterName, [string]$FilePath)

$signature = @'
[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

[DllImport("winspool.drv", SetLastError=true)]
public static extern bool ClosePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFO pDocInfo);

[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndDocPrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError=true)]
public static extern bool StartPagePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndPagePrinter(IntPtr hPrinter);

[DllImport("winspool.drv", SetLastError=true)]
public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
}
'@

Add-Type -MemberDefinition $signature -Name 'RawPrinter' -Namespace 'Win32' -PassThru | Out-Null

$hPrinter = [IntPtr]::Zero
$opened = [Win32.RawPrinter]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)
if (-not $opened) {
    Write-Error "Failed to open printer: $PrinterName"
    exit 1
}

try {
    $docInfo = New-Object Win32.RawPrinter+DOCINFO
    $docInfo.pDocName = "Bridge Print Job"
    $docInfo.pOutputFile = $null
    $docInfo.pDataType = "RAW"

    $started = [Win32.RawPrinter]::StartDocPrinter($hPrinter, 1, [ref]$docInfo)
    if (-not $started) {
        Write-Error "StartDocPrinter failed"
        exit 1
    }

    try {
        [Win32.RawPrinter]::StartPagePrinter($hPrinter) | Out-Null

        $bytes = [System.IO.File]::ReadAllBytes($FilePath)
        $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
        [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)

        $written = 0
        $result = [Win32.RawPrinter]::WritePrinter($hPrinter, $ptr, $bytes.Length, [ref]$written)
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)

        if (-not $result) {
            Write-Error "WritePrinter failed"
            exit 1
        }

        [Win32.RawPrinter]::EndPagePrinter($hPrinter) | Out-Null
    } finally {
        [Win32.RawPrinter]::EndDocPrinter($hPrinter) | Out-Null
    }
} finally {
    [Win32.RawPrinter]::ClosePrinter($hPrinter) | Out-Null
}

Write-Output "OK: $written bytes sent"
`;

/**
 * Resolve which printer to use based on the job type.
 * @param {string} jobType - e.g. 'kitchen_ticket', 'receipt', 'bar_ticket'
 * @returns {string} The Windows printer name
 */
function resolvePrinter(jobType) {
    const map = config.PRINTER_MAP || {};
    const type = (jobType || '').toLowerCase();
    return map[type] || config.DEFAULT_PRINTER || config.PRINTER_NAME || 'POS-80';
}

/**
 * Print an array of formatted text lines.
 *
 * - In DRY_RUN mode: prints to console only
 * - In normal mode: sends raw ESC/POS data to the Windows printer
 *
 * @param {string[]} lines - Array of text lines to print
 * @param {string} [jobType] - Job type to determine which printer to use
 * @throws {Error} If printing fails
 */
async function printLines(lines, jobType) {
    const printerName = resolvePrinter(jobType);

    // ─── Dry-run mode: output to console ──────────────────
    if (config.DRY_RUN) {
        console.log('');
        console.log(`  ┌─── DRY RUN → ${printerName} ${'─'.repeat(Math.max(0, 32 - printerName.length))}┐`);
        for (const textLine of lines) {
            console.log(`  │ ${textLine}`);
        }
        console.log('  └────────────────────────────────────────────────┘');
        console.log('');
        logger.success(`[DRY RUN] Printed ${lines.length} lines → "${printerName}"`);
        return;
    }

    // ─── Real printer mode (raw ESC/POS via Windows API) ──
    const tempData = path.join(os.tmpdir(), `bridge-raw-${Date.now()}.bin`);
    const tempScript = path.join(os.tmpdir(), `bridge-print-${Date.now()}.ps1`);

    try {
        // Build raw ESC/POS binary content
        let raw = CMD.INIT;   // Initialize printer
        raw += CMD.LEFT;       // Left-align

        for (const textLine of lines) {
            if (textLine === '') {
                raw += CMD.NEWLINE;
            } else {
                raw += textLine + CMD.NEWLINE;
            }
        }

        raw += CMD.NEWLINE;    // Extra feed before cut
        raw += CMD.NEWLINE;
        raw += CMD.CUT;        // Cut paper

        // Write raw data as binary
        const buffer = Buffer.from(raw, 'binary');
        fs.writeFileSync(tempData, buffer);

        // Write PowerShell script
        fs.writeFileSync(tempScript, RAW_PRINT_PS_SCRIPT, 'utf8');

        // Execute raw print via PowerShell
        const output = execSync(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}" -PrinterName "${printerName}" -FilePath "${tempData}"`,
            { timeout: 15000, windowsHide: true }
        ).toString().trim();

        logger.success(`Printed ${lines.length} lines to "${printerName}" (${output})`);
    } catch (err) {
        const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
        throw new Error(`Raw print failed on "${printerName}": ${errMsg}`);
    } finally {
        // Clean up temp files
        try { fs.unlinkSync(tempData); } catch { /* ignore */ }
        try { fs.unlinkSync(tempScript); } catch { /* ignore */ }
    }
}

/**
 * Check if the printer exists on the system.
 * @returns {Promise<boolean>}
 */
async function isPrinterReady(jobType) {
    try {
        const printerName = resolvePrinter(jobType);
        const result = execSync(
            `powershell -NoProfile -Command "(Get-Printer -Name '${printerName.replace(/'/g, "''")}').PrinterStatus"`,
            { timeout: 5000, windowsHide: true }
        ).toString().trim();
        return result === 'Normal' || result === '0';
    } catch {
        return false;
    }
}

function initPrinter() {
    const map = config.PRINTER_MAP || {};
    const defaultPrinter = config.DEFAULT_PRINTER || config.PRINTER_NAME || 'POS-80';
    logger.info(`Default printer: "${defaultPrinter}" (raw ESC/POS via Windows API)`);
    const entries = Object.entries(map);
    if (entries.length > 0) {
        logger.info(`Printer routing:`);
        for (const [type, printer] of entries) {
            logger.info(`  ${type} → "${printer}"`);
        }
    }
}

/**
 * Check the connection status of all configured printers.
 * Queries Windows Get-Printer for each unique printer name.
 * @returns {Promise<{name: string, status: string, ready: boolean}[]>}
 */
async function checkAllPrinters() {
    const map = config.PRINTER_MAP || {};
    const defaultPrinter = config.DEFAULT_PRINTER || config.PRINTER_NAME || 'POS-80';

    // Collect unique printer names
    const printers = new Set([defaultPrinter, ...Object.values(map)]);
    const results = [];

    for (const name of printers) {
        try {
            const raw = execSync(
                `powershell -NoProfile -Command "Get-Printer -Name '${name.replace(/'/g, "''")}' | Select-Object -Property PrinterStatus | Format-List"`,
                { timeout: 5000, windowsHide: true }
            ).toString().trim();

            // Parse "PrinterStatus : Normal" or "PrinterStatus : 0"
            const match = raw.match(/PrinterStatus\s*:\s*(.+)/i);
            const status = match ? match[1].trim() : 'Unknown';
            const ready = status === 'Normal' || status === '0';

            results.push({ name, status, ready });
        } catch {
            results.push({ name, status: 'Not Found', ready: false });
        }
    }

    return results;
}

module.exports = { printLines, isPrinterReady, initPrinter, resolvePrinter, checkAllPrinters };
