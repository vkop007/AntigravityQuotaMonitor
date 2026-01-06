"use strict";
/**
 * Unix-based (macOS/Linux) process detection implementation.
 * Uses ps and lsof/ss/netstat commands.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnixProcessDetector = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode = require("vscode");
// LocalizationService moved to common
// import { LocalizationService } from '../../common/i18n/localizationService';
// Assuming we kept it simple or fix path:
const LocalizationService_1 = require("../../../common/localization/LocalizationService");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class UnixProcessDetector {
    constructor(platform) {
        /** Available port detection command: 'lsof', 'ss', or 'netstat' */
        this.availablePortCommand = null;
        this.platform = platform;
    }
    /**
     * Check if a command exists on the system using 'which'.
     */
    async commandExists(command) {
        try {
            await execAsync(`which ${command}`, { timeout: 3000 });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Ensure at least one port detection command is available.
     * Checks lsof, ss, netstat in order of preference.
     * @throws Error if no command is available
     */
    async ensurePortCommandAvailable() {
        // Already checked
        if (this.availablePortCommand) {
            return;
        }
        const commands = ["lsof", "ss", "netstat"];
        const available = [];
        for (const cmd of commands) {
            if (await this.commandExists(cmd)) {
                available.push(cmd);
                if (!this.availablePortCommand) {
                    this.availablePortCommand = cmd;
                }
            }
        }
        console.log(`[UnixProcessDetector] Port command check: available=[${available.join(", ") || "none"}], using=${this.availablePortCommand || "none"}`);
        if (!this.availablePortCommand) {
            const localizationService = LocalizationService_1.LocalizationService.getInstance();
            const message = this.platform === "darwin"
                ? localizationService.t("notify.portCommandRequiredDarwin")
                : localizationService.t("notify.portCommandRequired");
            vscode.window.showErrorMessage(message, { modal: false });
            throw new Error("No port detection command available (lsof/ss/netstat)");
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
        if (lowerCmd.includes("/antigravity/") ||
            lowerCmd.includes("\\antigravity\\")) {
            return true;
        }
        return false;
    }
    /**
     * Get command to list Unix processes using ps and grep.
     */
    getProcessListCommand(processName) {
        // Use ps -ww -eo pid,ppid,args to get PID, PPID and full command line
        // -ww: unlimited width (avoid truncation)
        // -e: select all processes
        // -o: user-defined format
        // grep -v graftcp: exclude graftcp wrapper processes (users may use graftcp to proxy language_server)
        return `ps -ww -eo pid,ppid,args | grep "${processName}" | grep -v grep | grep -v graftcp`;
    }
    parseProcessInfo(stdout) {
        if (!stdout || stdout.trim().length === 0) {
            return null;
        }
        const lines = stdout.trim().split("\n");
        const currentPid = process.pid;
        const candidates = [];
        for (const line of lines) {
            // Format: PID PPID COMMAND...
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) {
                continue;
            }
            const pid = parseInt(parts[0], 10);
            const ppid = parseInt(parts[1], 10);
            // Reconstruct command line (it might contain spaces)
            const cmd = parts.slice(2).join(" ");
            if (isNaN(pid) || isNaN(ppid)) {
                continue;
            }
            // Defensive check: Skip graftcp wrapper process
            // graftcp is a tool to proxy language_server, it does not listen on ports itself
            // Command format: /opt/graftcp/graftcp /path/to/language_server_linux_x64.bak ...
            const executable = parts[2]; // First part of command line (executable)
            if (executable.includes("graftcp")) {
                continue;
            }
            const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
            const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
            // Must satisfy both: has csrf_token and is an Antigravity process
            if (tokenMatch && tokenMatch[1] && this.isAntigravityProcess(cmd)) {
                const extensionPort = portMatch && portMatch[1] ? parseInt(portMatch[1], 10) : 0;
                const csrfToken = tokenMatch[1];
                candidates.push({ pid, ppid, extensionPort, csrfToken });
            }
        }
        if (candidates.length === 0) {
            return null;
        }
        // 1. Prefer the process that is a direct child of the current process (extension host)
        const child = candidates.find((c) => c.ppid === currentPid);
        if (child) {
            return child;
        }
        // 2. Fallback: return the first candidate found (legacy behavior)
        // This handles cases where the process hierarchy might be different (e.g. intermediate shell)
        return candidates[0];
    }
    /**
     * Get command to list ports for a specific process.
     * Uses the available command detected by ensurePortCommandAvailable().
     */
    getPortListCommand(pid) {
        switch (this.availablePortCommand) {
            case "lsof":
                // lsof: -P no port name resolution, -a AND conditions, -n no hostname resolution
                return `lsof -Pan -p ${pid} -i`;
            case "ss":
                // ss: -t TCP, -l listening, -n numeric, -p show process
                return `ss -tlnp 2>/dev/null | grep "pid=${pid},"`;
            case "netstat":
                return `netstat -tulpn 2>/dev/null | grep ${pid}`;
            default:
                // Fallback chain if ensurePortCommandAvailable() wasn't called
                return `lsof -Pan -p ${pid} -i 2>/dev/null || ss -tlnp 2>/dev/null | grep "pid=${pid}," || netstat -tulpn 2>/dev/null | grep ${pid}`;
        }
    }
    /**
     * Parse lsof/ss/netstat output to extract listening ports.
     *
     * lsof format:
     *   language_ 1234 user  10u  IPv4 0x... 0t0  TCP 127.0.0.1:2873 (LISTEN)
     *
     * ss format (Linux):
     *   LISTEN  0  128  127.0.0.1:2873  0.0.0.0:*  users:(("language_server",pid=1234,fd=10))
     *
     * netstat format (Linux):
     *   tcp  0  0  127.0.0.1:2873  0.0.0.0:*  LISTEN  1234/language_server
     */
    parseListeningPorts(stdout) {
        const ports = [];
        if (!stdout || stdout.trim().length === 0) {
            return ports;
        }
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
            // Try lsof format: 127.0.0.1:PORT (LISTEN)
            const lsofMatch = line.match(/127\.0\.0\.1:(\d+).*\(LISTEN\)/);
            if (lsofMatch && lsofMatch[1]) {
                const port = parseInt(lsofMatch[1], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                }
                continue;
            }
            // Try ss format: 127.0.0.1:PORT or *:PORT in LISTEN state
            // ss output: LISTEN 0 128 127.0.0.1:2873 0.0.0.0:*
            const ssMatch = line.match(/LISTEN\s+\d+\s+\d+\s+(?:127\.0\.0\.1|\*):(\d+)/);
            if (ssMatch && ssMatch[1]) {
                const port = parseInt(ssMatch[1], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                }
                continue;
            }
            // Try netstat format: 127.0.0.1:PORT ... LISTEN
            const netstatMatch = line.match(/127\.0\.0\.1:(\d+).*LISTEN/);
            if (netstatMatch && netstatMatch[1]) {
                const port = parseInt(netstatMatch[1], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                }
                continue;
            }
            // Also try localhost format (for lsof/netstat)
            const localhostMatch = line.match(/localhost:(\d+).*\(LISTEN\)|localhost:(\d+).*LISTEN/);
            if (localhostMatch) {
                const port = parseInt(localhostMatch[1] || localhostMatch[2], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                }
            }
        }
        return ports.sort((a, b) => a - b);
    }
    /**
     * Get Unix-specific error messages.
     */
    getErrorMessages() {
        const processName = this.platform === "darwin"
            ? "language_server_macos"
            : "language_server_linux";
        return {
            processNotFound: "language_server process not found",
            commandNotAvailable: "ps/lsof commands are unavailable; please check the system environment",
            requirements: [
                "Antigravity is running",
                `${processName} process is running`,
                "The system has permission to execute ps and lsof commands",
            ],
        };
    }
}
exports.UnixProcessDetector = UnixProcessDetector;
//# sourceMappingURL=UnixProcessDetector.js.map