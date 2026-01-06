"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnixProcessDetector = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const vscode = require("vscode");
const LocalizationService_1 = require("../../../lib/localization/LocalizationService");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class UnixProcessDetector {
    constructor(platform) {
        this.availablePortCommand = null;
        this.platform = platform;
    }
    async commandExists(command) {
        try {
            await execAsync(`which ${command}`, { timeout: 3000 });
            return true;
        }
        catch {
            return false;
        }
    }
    async ensurePortCommandAvailable() {
        if (this.availablePortCommand)
            return;
        const commands = ["lsof", "ss", "netstat"];
        for (const cmd of commands) {
            if (await this.commandExists(cmd)) {
                this.availablePortCommand = cmd;
                break;
            }
        }
        if (!this.availablePortCommand) {
            const localizationService = LocalizationService_1.LocalizationService.getInstance();
            const message = this.platform === "darwin"
                ? localizationService.t("notify.portCommandRequiredDarwin")
                : localizationService.t("notify.portCommandRequired");
            vscode.window.showErrorMessage(message);
            throw new Error("No port detection command available");
        }
    }
    isAntigravityProcess(commandLine) {
        const lowerCmd = commandLine.toLowerCase();
        return (/--app_data_dir\s+antigravity\b/i.test(commandLine) ||
            lowerCmd.includes("/antigravity/") ||
            lowerCmd.includes("\\antigravity\\"));
    }
    getProcessListCommand(processName) {
        return `ps -ww -eo pid,ppid,args | grep "${processName}" | grep -v grep | grep -v graftcp`;
    }
    parseProcessInfo(stdout) {
        if (!stdout?.trim())
            return null;
        const lines = stdout.trim().split("\n");
        const currentPid = process.pid;
        const candidates = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3)
                continue;
            const pid = parseInt(parts[0], 10);
            const ppid = parseInt(parts[1], 10);
            const cmd = parts.slice(2).join(" ");
            if (isNaN(pid) || isNaN(ppid))
                continue;
            if (parts[2].includes("graftcp"))
                continue;
            const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
            const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
            if (tokenMatch && this.isAntigravityProcess(cmd)) {
                candidates.push({
                    pid,
                    ppid,
                    extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
                    csrfToken: tokenMatch[1],
                });
            }
        }
        if (candidates.length === 0)
            return null;
        return candidates.find((c) => c.ppid === currentPid) || candidates[0];
    }
    getPortListCommand(pid) {
        switch (this.availablePortCommand) {
            case "lsof":
                return `lsof -Pan -p ${pid} -i`;
            case "ss":
                return `ss -tlnp 2>/dev/null | grep "pid=${pid},"`;
            case "netstat":
                return `netstat -tulpn 2>/dev/null | grep ${pid}`;
            default:
                return `lsof -Pan -p ${pid} -i 2>/dev/null || ss -tlnp 2>/dev/null | grep "pid=${pid},"`;
        }
    }
    parseListeningPorts(stdout) {
        const ports = [];
        if (!stdout?.trim())
            return ports;
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
            const lsofMatch = line.match(/127\.0\.0\.1:(\d+).*\(LISTEN\)/);
            const ssMatch = line.match(/LISTEN\s+\d+\s+\d+\s+(?:127\.0\.0\.1|\*):(\d+)/);
            const netstatMatch = line.match(/127\.0\.0\.1:(\d+).*LISTEN/);
            const lhMatch = line.match(/localhost:(\d+).*\(LISTEN\)|localhost:(\d+).*LISTEN/);
            const m = lsofMatch || ssMatch || netstatMatch || lhMatch;
            if (m) {
                const p = parseInt(m[1] || m[2], 10);
                if (!ports.includes(p))
                    ports.push(p);
            }
        }
        return ports.sort((a, b) => a - b);
    }
    getErrorMessages() {
        const processName = this.platform === "darwin"
            ? "language_server_macos"
            : "language_server_linux";
        return {
            processNotFound: "language_server process not found",
            commandNotAvailable: "ps/lsof commands are unavailable",
            requirements: [
                "Antigravity is running",
                `${processName} process is running`,
                "Permission to execute ps/lsof",
            ],
        };
    }
}
exports.UnixProcessDetector = UnixProcessDetector;
//# sourceMappingURL=UnixProcessDetector.js.map