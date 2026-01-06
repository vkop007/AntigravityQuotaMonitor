"use strict";
/**
 * Version information service for Antigravity Quota Watcher.
 * Provides access to IDE version, extension version, and other version-related info.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionInfo = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
class VersionInfoService {
    constructor() {
        this.versionInfo = null;
    }
    static getInstance() {
        if (!VersionInfoService.instance) {
            VersionInfoService.instance = new VersionInfoService();
        }
        return VersionInfoService.instance;
    }
    /**
     * Initialize version info with extension context.
     * Must be called once during extension activation.
     */
    initialize(context) {
        const extensionVersion = context.extension.packageJSON.version || 'unknown';
        const ideName = vscode.env.appName || 'unknown';
        const vscodeOssVersion = vscode.version || 'unknown';
        // Read IDE version from product.json
        let ideVersion = 'unknown';
        let productName;
        try {
            const productJsonPath = path.join(vscode.env.appRoot, 'product.json');
            if (fs.existsSync(productJsonPath)) {
                const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
                ideVersion = productJson.ideVersion || productJson.version || 'unknown';
                productName = productJson.nameLong || productJson.applicationName || productJson.nameShort;
            }
        }
        catch (e) {
            console.warn('[VersionInfo] Failed to read product.json:', e);
        }
        // Detect OS
        let os = 'unknown';
        switch (process.platform) {
            case 'win32':
                os = 'windows';
                break;
            case 'darwin':
                os = 'darwin';
                break;
            case 'linux':
                os = 'linux';
                break;
            default:
                os = process.platform;
        }
        this.versionInfo = {
            extensionVersion,
            ideName,
            productName,
            ideVersion,
            vscodeOssVersion,
            os,
        };
        console.log(`[VersionInfo] Initialized: ${this.getFullVersionString()}`);
    }
    /**
     * Get version info. Throws if not initialized.
     */
    getVersionInfo() {
        if (!this.versionInfo) {
            throw new Error('VersionInfoService not initialized. Call initialize() first.');
        }
        return this.versionInfo;
    }
    /**
     * Get IDE version string (e.g., "1.11.2").
     * Returns "unknown" if not initialized.
     */
    getIdeVersion() {
        return this.versionInfo?.ideVersion || 'unknown';
    }
    /**
     * Get IDE name (e.g., "Antigravity").
     */
    getIdeName() {
        return this.versionInfo?.ideName || 'unknown';
    }
    /**
     * Determine whether the current IDE is Antigravity.
     * Uses appName and product name hints (case-insensitive).
     */
    isAntigravityIde() {
        const candidates = [
            this.versionInfo?.ideName,
            this.versionInfo?.productName,
            vscode.env.appName
        ]
            .filter(Boolean)
            .map(name => name.toLowerCase());
        return candidates.some(name => name.includes('antigravity'));
    }
    /**
     * Get extension version string (e.g., "0.7.6").
     */
    getExtensionVersion() {
        return this.versionInfo?.extensionVersion || 'unknown';
    }
    /**
     * Get OS string for API requests (e.g., "windows").
     */
    getOs() {
        return this.versionInfo?.os || 'unknown';
    }
    /**
     * Get a formatted version string for logging.
     */
    getFullVersionString() {
        const info = this.versionInfo;
        if (!info) {
            return 'VersionInfo not initialized';
        }
        return `Extension v${info.extensionVersion} on ${info.ideName} v${info.ideVersion} (VSCode OSS v${info.vscodeOssVersion})`;
    }
}
// Export singleton instance
exports.versionInfo = VersionInfoService.getInstance();
//# sourceMappingURL=versionInfo.js.map