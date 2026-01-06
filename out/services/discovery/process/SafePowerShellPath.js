"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafePowerShellPath = void 0;
const fs = require("fs");
const path = require("path");
class SafePowerShellPath {
    static getSafePath() {
        if (this.cachedPath !== null)
            return this.cachedPath;
        const result = this.findSafePath();
        this.cachedPath = result.path;
        this.pathType = result.type;
        return this.cachedPath;
    }
    static getPathInfo() {
        if (this.cachedPath === null)
            this.getSafePath();
        return { path: this.cachedPath || "", type: this.pathType };
    }
    static clearCache() {
        this.cachedPath = null;
        this.pathType = "not_found";
    }
    static findSafePath() {
        for (let i = 0; i < this.KNOWN_SAFE_PATHS.length; i++) {
            const safePath = this.KNOWN_SAFE_PATHS[i];
            try {
                if (fs.existsSync(safePath)) {
                    return {
                        path: `"${safePath}"`,
                        type: i === 0 ? "system32" : "pwsh7",
                    };
                }
            }
            catch (e) { }
        }
        return { path: "powershell", type: "path_fallback" };
    }
    static isUsingPathFallback() {
        this.getSafePath();
        return this.pathType === "path_fallback";
    }
    static getAvailableInstallations() {
        const available = [];
        for (const safePath of this.KNOWN_SAFE_PATHS) {
            try {
                if (fs.existsSync(safePath))
                    available.push(safePath);
            }
            catch (e) { }
        }
        return available;
    }
}
exports.SafePowerShellPath = SafePowerShellPath;
SafePowerShellPath.SYSTEM_ROOT = process.env.SystemRoot || "C:\\Windows";
SafePowerShellPath.KNOWN_SAFE_PATHS = [
    path.join(SafePowerShellPath.SYSTEM_ROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    path.join(SafePowerShellPath.SYSTEM_ROOT, "System32", "pwsh.exe"),
    "C:\\Program Files\\PowerShell\\6\\pwsh.exe",
    "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
    "C:\\Program Files (x86)\\PowerShell\\6\\pwsh.exe",
];
SafePowerShellPath.cachedPath = null;
SafePowerShellPath.pathType = "not_found";
//# sourceMappingURL=SafePowerShellPath.js.map