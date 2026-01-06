"use strict";
/**
 * Port detection service
 * Only retrieves ports and CSRF Token from process args.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortDetectionService = void 0;
const ProcessPortDetector_1 = require("./process/ProcessPortDetector");
class PortDetectionService {
    constructor(context) {
        this.context = context;
        this.processDetector = new ProcessPortDetector_1.ProcessPortDetector();
    }
    /**
     * Single detection method - read from process arguments.
     */
    async detectPort(_configuredPort) {
        // Get port and CSRF Token from process args
        const processInfo = await this.processDetector.detectProcessInfo();
        if (!processInfo) {
            console.error("[PortDetectionService] Failed to get port and CSRF Token from process.");
            console.error("[PortDetectionService] Ensure language_server_windows_x64.exe is running.");
            return null;
        }
        console.log(`[PortDetectionService] Detected Connect port (HTTPS): ${processInfo.connectPort}`);
        console.log(`[PortDetectionService] Detected extension port (HTTP): ${processInfo.extensionPort}`);
        console.log(`[PortDetectionService] Detected CSRF Token: ${this.maskToken(processInfo.csrfToken)}`);
        return {
            // keep compatibility: port is the primary connect port
            port: processInfo.connectPort,
            connectPort: processInfo.connectPort,
            httpPort: processInfo.extensionPort,
            csrfToken: processInfo.csrfToken,
            source: "process",
            confidence: "high",
        };
    }
    /**
     * Mask the token, showing only the first 6 and last 4 characters
     */
    maskToken(token) {
        if (token.length <= 14) {
            return "***";
        }
        return `${token.substring(0, 6)}***${token.substring(token.length - 4)}`;
    }
}
exports.PortDetectionService = PortDetectionService;
//# sourceMappingURL=PortDetector.js.map