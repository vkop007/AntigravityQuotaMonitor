"use strict";
/**
 * Process-based port detector.
 * Reads Antigravity Language Server command line args to extract ports and CSRF token.
 * Uses platform-specific strategies for cross-platform support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessPortDetector = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const https = require("https");
const PlatformTools_1 = require("../PlatformTools");
const versionInfo_1 = require("../../../common/versionInfo");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ProcessPortDetector {
    constructor() {
        this.platformDetector = new PlatformTools_1.PlatformDetector();
        this.platformStrategy = this.platformDetector.getStrategy();
        this.processName = this.platformDetector.getProcessName();
    }
    /**
     * Detect credentials (ports + CSRF token) from the running process.
     * @param maxRetries Maximum number of retry attempts (default: 3)
     * @param retryDelay Delay between retries in milliseconds (default: 2000)
     */
    async detectProcessInfo(maxRetries = 3, retryDelay = 2000) {
        const platformName = this.platformDetector.getPlatformName();
        const errorMessages = this.platformStrategy.getErrorMessages();
        // Display current detection mode on Windows
        if (platformName === "Windows") {
            const windowsStrategy = this.platformStrategy;
            const mode = windowsStrategy.isUsingPowerShell?.()
                ? "PowerShell"
                : "WMIC";
            console.log(`[PortDetector] Windows detection mode: ${mode}`);
        }
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[PortDetector] Attempting to detect Antigravity process (${platformName}, try ${attempt}/${maxRetries})...`);
                // Fetch full command line for the language server process using platform-specific command
                const command = this.platformStrategy.getProcessListCommand(this.processName);
                console.log(`[PortDetector] Running process list command: ${command}`);
                const { stdout } = await execAsync(command, { timeout: 15000 });
                const preview = stdout.trim().split("\n").slice(0, 3).join("\n");
                console.log(`[PortDetector] Process command output preview:\n${preview || "(empty)"}`);
                // Parse process info using platform-specific parser
                const processInfo = this.platformStrategy.parseProcessInfo(stdout);
                if (!processInfo) {
                    console.warn(`[PortDetector] Attempt ${attempt}: ${errorMessages.processNotFound}`);
                    throw new Error(errorMessages.processNotFound);
                }
                const { pid, extensionPort, csrfToken } = processInfo;
                console.log("[PortDetector] Found process info:");
                console.log(`[PortDetector]   PID: ${pid}`);
                console.log(`[PortDetector]   extension_server_port: ${extensionPort || "(not found)"}`);
                console.log(`[PortDetector]   CSRF Token: ${csrfToken ? "[present]" : "[missing]"}`);
                // Get all listening ports for the process
                console.log(`[PortDetector] Fetching listening ports for PID ${pid}...`);
                const listeningPorts = await this.getProcessListeningPorts(pid);
                if (listeningPorts.length === 0) {
                    console.warn(`[PortDetector] Attempt ${attempt}: process is not listening on any ports`);
                    throw new Error("Process is not listening on any ports");
                }
                console.log(`[PortDetector] Found ${listeningPorts.length} listening ports: ${listeningPorts.join(", ")}`);
                // Test ports one by one to find the one responsive to API
                console.log("[PortDetector] Testing port connectivity...");
                const connectPort = await this.findWorkingPort(listeningPorts, csrfToken);
                if (!connectPort) {
                    console.warn(`[PortDetector] Attempt ${attempt}: all port tests failed`);
                    throw new Error("Unable to find a working API port");
                }
                console.log(`[PortDetector] Attempt ${attempt} succeeded`);
                console.log(`[PortDetector] API port (HTTPS): ${connectPort}`);
                console.log(`[PortDetector] Detection summary: extension_port=${extensionPort}, connect_port=${connectPort}`);
                return { extensionPort, connectPort, csrfToken };
            }
            catch (error) {
                const errorMsg = error?.message || String(error);
                console.error(`[PortDetector] Attempt ${attempt} failed:`, errorMsg);
                if (error?.stack) {
                    console.error("[PortDetector]   Stack:", error.stack);
                }
                // Provide more specific error messages
                if (errorMsg.includes("timeout")) {
                    console.error("[PortDetector]   Reason: command execution timed out; the system may be under heavy load");
                }
                else if (errorMsg.includes("not found") ||
                    errorMsg.includes("not recognized") ||
                    errorMsg.includes("不是内部或外部命令")) {
                    console.error(`[PortDetector]   Reason: ${errorMessages.commandNotAvailable}`);
                    // Windows platform special handling: Demote WMIC to PowerShell
                    if (this.platformDetector.getPlatformName() === "Windows") {
                        const windowsStrategy = this.platformStrategy;
                        if (windowsStrategy.setUsePowerShell &&
                            !windowsStrategy.isUsingPowerShell()) {
                            console.warn("[PortDetector] WMIC command is unavailable (Windows 10 21H1+/Windows 11 deprecated WMIC)");
                            console.log("[PortDetector] Switching to PowerShell mode and retrying...");
                            windowsStrategy.setUsePowerShell(true);
                            // Retry current attempt without consuming retry count
                            attempt--;
                            continue;
                        }
                    }
                }
            }
            // If retries available, wait and retry
            if (attempt < maxRetries) {
                console.log(`[PortDetector] Waiting ${retryDelay}ms before retrying...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
        console.error(`[PortDetector] All ${maxRetries} attempts failed`);
        console.error("[PortDetector] Please ensure:");
        errorMessages.requirements.forEach((req, index) => {
            console.error(`[PortDetector]   ${index + 1}. ${req}`);
        });
        return null;
    }
    /**
     * Get all listening ports for the process
     */
    async getProcessListeningPorts(pid) {
        try {
            // Ensure port detection command is available before running
            await this.platformStrategy.ensurePortCommandAvailable();
            const command = this.platformStrategy.getPortListCommand(pid);
            console.log(`[PortDetector] Running port list command for PID ${pid}: ${command}`);
            const { stdout } = await execAsync(command, { timeout: 3000 });
            console.log(`[PortDetector] Port list output preview:\n${stdout.trim().split("\n").slice(0, 5).join("\n") || "(empty)"}`);
            // Parse ports using platform-specific parser
            const ports = this.platformStrategy.parseListeningPorts(stdout);
            console.log(`[PortDetector] Parsed listening ports: ${ports.length > 0 ? ports.join(", ") : "(none)"}`);
            return ports;
        }
        catch (error) {
            console.error("Failed to fetch listening ports:", error);
            return [];
        }
    }
    /**
     * Test port list to find the first one responsive to API
     */
    async findWorkingPort(ports, csrfToken) {
        console.log(`[PortDetector] Candidate ports for testing: ${ports.join(", ") || "(none)"}`);
        for (const port of ports) {
            console.log(`[PortDetector]   Testing port ${port}...`);
            const isWorking = await this.testPortConnectivity(port, csrfToken);
            if (isWorking) {
                console.log(`[PortDetector]   Port ${port} test succeeded`);
                return port;
            }
            else {
                console.log(`[PortDetector]   Port ${port} test failed`);
            }
        }
        return null;
    }
    /**
     * Test if port responds to API requests
     * Uses GetUnleashData endpoint as it does not require user login
     */
    async testPortConnectivity(port, csrfToken) {
        return new Promise((resolve) => {
            const requestBody = JSON.stringify({
                context: {
                    properties: {
                        devMode: "false",
                        extensionVersion: versionInfo_1.versionInfo.getExtensionVersion(),
                        hasAnthropicModelAccess: "true",
                        ide: "antigravity",
                        ideVersion: versionInfo_1.versionInfo.getIdeVersion(),
                        installationId: "test-detection",
                        language: "UNSPECIFIED",
                        os: versionInfo_1.versionInfo.getOs(),
                        requestedModelId: "MODEL_UNSPECIFIED",
                    },
                },
            });
            const options = {
                hostname: "127.0.0.1",
                port: port,
                path: "/exa.language_server_pb.LanguageServerService/GetUnleashData",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(requestBody),
                    "Connect-Protocol-Version": "1",
                    "X-Codeium-Csrf-Token": csrfToken,
                },
                rejectUnauthorized: false,
                timeout: 2000,
            };
            console.log(`[PortDetector] Sending GetUnleashData probe to port ${port}`);
            const req = https.request(options, (res) => {
                const success = res.statusCode === 200;
                console.log(`[PortDetector] Port ${port} responded with status ${res.statusCode}`);
                res.resume();
                resolve(success);
            });
            req.on("error", (err) => {
                console.warn(`[PortDetector] Port ${port} connectivity error: ${err.message}`);
                resolve(false);
            });
            req.on("timeout", () => {
                console.warn(`[PortDetector] Port ${port} probe timed out`);
                req.destroy();
                resolve(false);
            });
            req.write(requestBody);
            req.end();
        });
    }
}
exports.ProcessPortDetector = ProcessPortDetector;
//# sourceMappingURL=ProcessPortDetector.js.map