import * as vscode from "vscode";
import { WindowsProcessDetector } from "./process/WindowsProcessDetector";
import { UnixProcessDetector } from "./process/UnixProcessDetector";
import { IPlatformStrategy } from "../../lib/types";

export class PlatformDetector {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  getProcessName(): string {
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

  getStrategy(): IPlatformStrategy {
    switch (this.platform) {
      case "win32":
        const windowsDetector = new WindowsProcessDetector();
        const config = vscode.workspace.getConfiguration(
          "antigravityQuotaWatcher"
        );
        const forcePowerShell = config.get<boolean>("forcePowerShell", true);
        windowsDetector.setUsePowerShell(forcePowerShell);
        return windowsDetector;
      case "darwin":
      case "linux":
        return new UnixProcessDetector(this.platform);
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  getPlatformName(): string {
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
