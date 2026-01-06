"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortDetectionService = void 0;
const ProcessPortDetector_1 = require("./process/ProcessPortDetector");
class PortDetectionService {
    constructor(context) {
        this.context = context;
        this.processDetector = new ProcessPortDetector_1.ProcessPortDetector();
    }
    async detectPort() {
        const processInfo = await this.processDetector.detectProcessInfo();
        if (!processInfo) {
            console.error("[PortDetectionService] Failed to get port and CSRF Token from process.");
            return null;
        }
        return {
            port: processInfo.connectPort,
            connectPort: processInfo.connectPort,
            httpPort: processInfo.extensionPort,
            csrfToken: processInfo.csrfToken,
            source: "process",
            confidence: "high",
        };
    }
}
exports.PortDetectionService = PortDetectionService;
//# sourceMappingURL=PortDetector.js.map