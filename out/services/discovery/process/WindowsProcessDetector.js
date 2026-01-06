"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsProcessDetector = void 0;
const SafePowerShellPath_1 = require("./SafePowerShellPath");
class WindowsProcessDetector {
    constructor() {
        this.usePowerShell = true;
    }
    setUsePowerShell(value) {
        this.usePowerShell = value;
    }
    isUsingPowerShell() {
        return this.usePowerShell;
    }
    getProcessListCommand(processName) {
        if (this.usePowerShell) {
            const psPath = SafePowerShellPath_1.SafePowerShellPath.getSafePath();
            return `${psPath} -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${processName}'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;
        }
        return `${WindowsProcessDetector.WMIC_PATH} process where "name='${processName}'" get ProcessId,CommandLine /format:list`;
    }
    isAntigravityProcess(commandLine) {
        const lowerCmd = commandLine.toLowerCase();
        return (/--app_data_dir\s+antigravity\b/i.test(commandLine) ||
            lowerCmd.includes("\\antigravity\\") ||
            lowerCmd.includes("/antigravity/"));
    }
    parseProcessInfo(stdout) {
        if (this.usePowerShell ||
            stdout.trim().startsWith("{") ||
            stdout.trim().startsWith("[")) {
            try {
                let data = JSON.parse(stdout.trim());
                if (Array.isArray(data)) {
                    const antigravityProcesses = data.filter((item) => item.CommandLine && this.isAntigravityProcess(item.CommandLine));
                    if (antigravityProcesses.length === 0)
                        return null;
                    data = antigravityProcesses[0];
                }
                else if (!data.CommandLine ||
                    !this.isAntigravityProcess(data.CommandLine)) {
                    return null;
                }
                const commandLine = data.CommandLine || "";
                const pid = data.ProcessId;
                if (!pid)
                    return null;
                const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
                const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
                if (!tokenMatch)
                    return null;
                return {
                    pid,
                    extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
                    csrfToken: tokenMatch[1],
                };
            }
            catch (e) { }
        }
        const blocks = stdout
            .split(/\n\s*\n/)
            .filter((block) => block.trim().length > 0);
        for (const block of blocks) {
            const pidMatch = block.match(/ProcessId=(\d+)/);
            const commandLineMatch = block.match(/CommandLine=(.+)/);
            if (!pidMatch || !commandLineMatch)
                continue;
            const cmd = commandLineMatch[1].trim();
            if (!this.isAntigravityProcess(cmd))
                continue;
            const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
            const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
            if (!tokenMatch)
                continue;
            return {
                pid: parseInt(pidMatch[1], 10),
                extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
                csrfToken: tokenMatch[1],
            };
        }
        return null;
    }
    async ensurePortCommandAvailable() { }
    getPortListCommand(pid) {
        return `${WindowsProcessDetector.NETSTAT_PATH} -ano | ${WindowsProcessDetector.FINDSTR_PATH} "${pid}" | ${WindowsProcessDetector.FINDSTR_PATH} "LISTENING"`;
    }
    parseListeningPorts(stdout) {
        const portRegex = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING/gi;
        const ports = [];
        let match;
        while ((match = portRegex.exec(stdout)) !== null) {
            const p = parseInt(match[1], 10);
            if (!ports.includes(p))
                ports.push(p);
        }
        return ports.sort((a, b) => a - b);
    }
    getErrorMessages() {
        return {
            processNotFound: "language_server process not found",
            commandNotAvailable: this.usePowerShell
                ? "PowerShell failed"
                : "wmic/PowerShell failed",
            requirements: [
                "Antigravity is running",
                "language_server process is running",
                "Permission to execute commands",
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