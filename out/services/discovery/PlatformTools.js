"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformDetector = void 0;
const vscode = require("vscode");
const WindowsProcessDetector_1 = require("./process/WindowsProcessDetector");
const UnixProcessDetector_1 = require("./process/UnixProcessDetector");
class PlatformDetector {
    constructor() {
        this.platform = process.platform;
    }
    getProcessName() {
        switch (this.platform) {
            case "win32":
                return "language_server_windows_x64.exe";
            case "darwin":
                return "language_server_macos";
            case "linux":
                return "language_server_linux";
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }
    getStrategy() {
        switch (this.platform) {
            case "win32":
                const windowsDetector = new WindowsProcessDetector_1.WindowsProcessDetector();
                const config = vscode.workspace.getConfiguration("antigravityQuotaWatcher");
                const forcePowerShell = config.get("forcePowerShell", true);
                windowsDetector.setUsePowerShell(forcePowerShell);
                return windowsDetector;
            case "darwin":
            case "linux":
                return new UnixProcessDetector_1.UnixProcessDetector(this.platform);
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }
    getPlatformName() {
        switch (this.platform) {
            case "win32":
                return "Windows";
            case "darwin":
                return "macOS";
            case "linux":
                return "Linux";
            default:
                return this.platform;
        }
    }
}
exports.PlatformDetector = PlatformDetector;
//# sourceMappingURL=PlatformTools.js.map