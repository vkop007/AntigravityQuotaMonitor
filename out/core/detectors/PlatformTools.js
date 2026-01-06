"use strict";
/**
 * Platform detection and strategy selection.
 * Provides platform-specific implementations for process detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformDetector = void 0;
const vscode = require("vscode");
const WindowsProcessDetector_1 = require("./process/WindowsProcessDetector");
const UnixProcessDetector_1 = require("./process/UnixProcessDetector");
/**
 * Platform detector that selects the appropriate strategy based on the current OS.
 */
class PlatformDetector {
    constructor() {
        this.platform = process.platform;
    }
    /**
     * Get the name of the language server process for the current platform.
     */
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
    /**
     * Get the platform-specific detection strategy.
     */
    getStrategy() {
        switch (this.platform) {
            case "win32":
                const windowsDetector = new WindowsProcessDetector_1.WindowsProcessDetector();
                // Read user configuration to check if PowerShell mode is forced
                const config = vscode.workspace.getConfiguration("antigravityQuotaWatcher");
                const forcePowerShell = config.get("forcePowerShell", true);
                // Set mode based on configuration
                windowsDetector.setUsePowerShell(forcePowerShell);
                console.log(`[PlatformDetector] Configuration: forcePowerShell=${forcePowerShell}, using ${forcePowerShell ? "PowerShell" : "WMIC"} mode`);
                return windowsDetector;
            case "darwin":
            case "linux":
                return new UnixProcessDetector_1.UnixProcessDetector(this.platform);
            default:
                throw new Error(`Unsupported platform: ${this.platform}`);
        }
    }
    /**
     * Get the current platform name for display.
     */
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