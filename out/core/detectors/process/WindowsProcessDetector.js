"use strict";
/**
 * Windows-specific process detection implementation.
 * Uses wmic (fallback to PowerShell if unavailable) and netstat commands.
 *
 * Security Note: PowerShell path is resolved using SafePowerShellPath which
 * implements a controlled search order to prevent path hijacking attacks.
 * See safePowerShellPath.ts for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsProcessDetector = void 0;
const SafePowerShellPath_1 = require("./SafePowerShellPath");
class WindowsProcessDetector {
    constructor() {
        this.usePowerShell = true;
    }
    /**
     * Set whether to use PowerShell mode
     * Automatically falls back to PowerShell when WMIC is unavailable (Windows 10 21H1+ / Windows 11)
     */
    setUsePowerShell(value) {
        this.usePowerShell = value;
    }
    /**
     * Check if PowerShell mode is enabled
     */
    isUsingPowerShell() {
        return this.usePowerShell;
    }
    /**
     * Get command to list Windows processes.
     * Prefer WMIC, fallback to PowerShell if unavailable
     */
    getProcessListCommand(processName) {
        if (this.usePowerShell) {
            // PowerShell command: Use Get-CimInstance to get process info and output JSON
            // Use SafePowerShellPath to get a secure PowerShell path, preventing path hijacking attacks
            const psPath = SafePowerShellPath_1.SafePowerShellPath.getSafePath();
            return `${psPath} -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${processName}'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;
        }
        else {
            // WMIC command (legacy method)
            return `${WindowsProcessDetector.WMIC_PATH} process where "name='${processName}'" get ProcessId,CommandLine /format:list`;
        }
    }
    /**
     * Determine if the command line belongs to an Antigravity process
     * identified by --app_data_dir antigravity or path containing 'antigravity'
     */
    isAntigravityProcess(commandLine) {
        const lowerCmd = commandLine.toLowerCase();
        // Check --app_data_dir antigravity argument
        if (/--app_data_dir\s+antigravity\b/i.test(commandLine)) {
            return true;
        }
        // Check if path contains antigravity
        if (lowerCmd.includes("\\antigravity\\") ||
            lowerCmd.includes("/antigravity/")) {
            return true;
        }
        return false;
    }
    /**
     * Parse process output to extract process information.
     * Supports both WMIC and PowerShell output formats
     *
     * WMIC format:
     *   CommandLine=...--extension_server_port=1234 --csrf_token=abc123...
     *   ProcessId=5678
     *
     * PowerShell JSON format:
     *   {"ProcessId":5678,"CommandLine":"...--extension_server_port=1234 --csrf_token=abc123..."}
     *   or array: [{"ProcessId":5678,"CommandLine":"..."}]
     */
    parseProcessInfo(stdout) {
        // Try parsing PowerShell JSON output
        if (this.usePowerShell ||
            stdout.trim().startsWith("{") ||
            stdout.trim().startsWith("[")) {
            try {
                let data = JSON.parse(stdout.trim());
                // If array, filter for Antigravity processes
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        return null;
                    }
                    const totalCount = data.length;
                    // Filter Antigravity processes
                    const antigravityProcesses = data.filter((item) => item.CommandLine && this.isAntigravityProcess(item.CommandLine));
                    console.log(`[WindowsProcessDetector] Found ${totalCount} language_server process(es), ${antigravityProcesses.length} belong to Antigravity`);
                    if (antigravityProcesses.length === 0) {
                        console.log("[WindowsProcessDetector] No Antigravity process found, skipping non-Antigravity processes");
                        return null;
                    }
                    if (totalCount > 1) {
                        console.log(`[WindowsProcessDetector] Selected Antigravity process PID: ${antigravityProcesses[0].ProcessId}`);
                    }
                    data = antigravityProcesses[0];
                }
                else {
                    // Check if single object is an Antigravity process
                    if (!data.CommandLine ||
                        !this.isAntigravityProcess(data.CommandLine)) {
                        console.log("[WindowsProcessDetector] Single process found but not Antigravity, skipping");
                        return null;
                    }
                    console.log(`[WindowsProcessDetector] Found 1 Antigravity process, PID: ${data.ProcessId}`);
                }
                const commandLine = data.CommandLine || "";
                const pid = data.ProcessId;
                if (!pid) {
                    return null;
                }
                const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
                const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
                if (!tokenMatch || !tokenMatch[1]) {
                    return null;
                }
                const extensionPort = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : 0;
                const csrfToken = tokenMatch[1];
                return { pid, extensionPort, csrfToken };
            }
            catch (e) {
                // JSON parse failed, try WMIC format
            }
        }
        // Parse WMIC output format
        // WMIC output consists of multiple process blocks, each containing CommandLine= and ProcessId= lines
        // Need to process by group to avoid mixing parameters from different processes
        const blocks = stdout
            .split(/\n\s*\n/)
            .filter((block) => block.trim().length > 0);
        const candidates = [];
        for (const block of blocks) {
            const pidMatch = block.match(/ProcessId=(\d+)/);
            const commandLineMatch = block.match(/CommandLine=(.+)/);
            if (!pidMatch || !commandLineMatch) {
                continue;
            }
            const commandLine = commandLineMatch[1].trim();
            // Check if it is an Antigravity process
            if (!this.isAntigravityProcess(commandLine)) {
                continue;
            }
            const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
            const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
            if (!tokenMatch || !tokenMatch[1]) {
                continue;
            }
            const pid = parseInt(pidMatch[1], 10);
            const extensionPort = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : 0;
            const csrfToken = tokenMatch[1];
            candidates.push({ pid, extensionPort, csrfToken });
        }
        if (candidates.length === 0) {
            console.log("[WindowsProcessDetector] WMIC: No Antigravity process found");
            return null;
        }
        console.log(`[WindowsProcessDetector] WMIC: Found ${candidates.length} Antigravity process(es), using PID: ${candidates[0].pid}`);
        return candidates[0];
    }
    /**
     * Ensure port detection commands are available.
     * On Windows, netstat is always available as a system command.
     */
    async ensurePortCommandAvailable() {
        // netstat is a built-in Windows command, always available
        return;
    }
    /**
     * Get command to list ports for a specific process using netstat.
     */
    getPortListCommand(pid) {
        const netstat = WindowsProcessDetector.NETSTAT_PATH;
        const findstr = WindowsProcessDetector.FINDSTR_PATH;
        return `${netstat} -ano | ${findstr} "${pid}" | ${findstr} "LISTENING"`;
    }
    /**
     * Parse netstat output to extract listening ports.
     * Expected formats:
     *   TCP    127.0.0.1:2873         0.0.0.0:0              LISTENING       4412
     *   TCP    0.0.0.0:2873           0.0.0.0:0              LISTENING       4412
     *   TCP    [::1]:2873             [::]:0                 LISTENING       4412
     *   TCP    [::]:2873              [::]:0                 LISTENING       4412
     *   TCP    127.0.0.1:2873         *:*                    LISTENING       4412
     */
    parseListeningPorts(stdout) {
        // Match IPv4: 127.0.0.1:port, 0.0.0.0:port
        // Match IPv6: [::1]:port, [::]:port
        // Foreign address can be: 0.0.0.0:0, *:*, [::]:0, etc.
        const portRegex = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING/gi;
        const ports = [];
        let match;
        while ((match = portRegex.exec(stdout)) !== null) {
            const port = parseInt(match[1], 10);
            if (!ports.includes(port)) {
                ports.push(port);
            }
        }
        return ports.sort((a, b) => a - b);
    }
    /**
     * Get Windows-specific error messages.
     */
    getErrorMessages() {
        return {
            processNotFound: "language_server process not found",
            commandNotAvailable: this.usePowerShell
                ? "PowerShell command failed; please check system permissions"
                : "wmic/PowerShell command unavailable; please check the system environment",
            requirements: [
                "Antigravity is running",
                "language_server_windows_x64.exe process is running",
                this.usePowerShell
                    ? "The system has permission to run PowerShell and netstat commands"
                    : "The system has permission to run wmic/PowerShell and netstat commands (auto-fallback supported)",
            ],
        };
    }
}
exports.WindowsProcessDetector = WindowsProcessDetector;
WindowsProcessDetector.SYSTEM_ROOT = process.env.SystemRoot || "C:\\Windows";
WindowsProcessDetector.WMIC_PATH = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\wbem\\wmic.exe"`;
WindowsProcessDetector.NETSTAT_PATH = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\netstat.exe"`;
WindowsProcessDetector.FINDSTR_PATH = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\findstr.exe"`;
//# sourceMappingURL=WindowsProcessDetector.js.map