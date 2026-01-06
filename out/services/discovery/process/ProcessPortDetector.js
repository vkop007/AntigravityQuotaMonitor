"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessPortDetector = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const https = require("https");
const PlatformTools_1 = require("../PlatformTools");
const versionInfo_1 = require("../../../lib/versionInfo");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ProcessPortDetector {
    constructor() {
        this.platformDetector = new PlatformTools_1.PlatformDetector();
        this.platformStrategy = this.platformDetector.getStrategy();
        this.processName = this.platformDetector.getProcessName();
    }
    async detectProcessInfo(maxRetries = 3, retryDelay = 2000) {
        const platformName = this.platformDetector.getPlatformName();
        const errorMessages = this.platformStrategy.getErrorMessages();
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const command = this.platformStrategy.getProcessListCommand(this.processName);
                const { stdout } = await execAsync(command, { timeout: 15000 });
                const processInfo = this.platformStrategy.parseProcessInfo(stdout);
                if (!processInfo) {
                    throw new Error(errorMessages.processNotFound);
                }
                const { pid, extensionPort, csrfToken } = processInfo;
                const listeningPorts = await this.getProcessListeningPorts(pid);
                if (listeningPorts.length === 0) {
                    throw new Error("Process is not listening on any ports");
                }
                const connectPort = await this.findWorkingPort(listeningPorts, csrfToken);
                if (!connectPort) {
                    throw new Error("Unable to find a working API port");
                }
                return { extensionPort, connectPort, csrfToken };
            }
            catch (error) {
                const errorMsg = error?.message || String(error);
                if (errorMsg.includes("not found") ||
                    errorMsg.includes("not recognized") ||
                    errorMsg.includes("不是内部或外部命令")) {
                    if (this.platformDetector.getPlatformName() === "Windows") {
                        const windowsStrategy = this.platformStrategy;
                        if (windowsStrategy.setUsePowerShell &&
                            !windowsStrategy.isUsingPowerShell()) {
                            windowsStrategy.setUsePowerShell(true);
                            attempt--;
                            continue;
                        }
                    }
                }
            }
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
        return null;
    }
    async getProcessListeningPorts(pid) {
        try {
            await this.platformStrategy.ensurePortCommandAvailable();
            const command = this.platformStrategy.getPortListCommand(pid);
            const { stdout } = await execAsync(command, { timeout: 3000 });
            return this.platformStrategy.parseListeningPorts(stdout);
        }
        catch (error) {
            return [];
        }
    }
    async findWorkingPort(ports, csrfToken) {
        for (const port of ports) {
            const isWorking = await this.testPortConnectivity(port, csrfToken);
            if (isWorking)
                return port;
        }
        return null;
    }
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
            const req = https.request(options, (res) => {
                const success = res.statusCode === 200;
                res.resume();
                resolve(success);
            });
            req.on("error", (err) => resolve(false));
            req.on("timeout", () => {
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