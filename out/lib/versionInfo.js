"use strict";
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
    initialize(context) {
        const extensionVersion = context.extension.packageJSON.version || "unknown";
        const ideName = vscode.env.appName || "unknown";
        const vscodeOssVersion = vscode.version || "unknown";
        let ideVersion = "unknown";
        let productName;
        try {
            const productJsonPath = path.join(vscode.env.appRoot, "product.json");
            if (fs.existsSync(productJsonPath)) {
                const productJson = JSON.parse(fs.readFileSync(productJsonPath, "utf8"));
                ideVersion = productJson.ideVersion || productJson.version || "unknown";
                productName =
                    productJson.nameLong ||
                        productJson.applicationName ||
                        productJson.nameShort;
            }
        }
        catch (e) { }
        let os = "unknown";
        switch (process.platform) {
            case "win32":
                os = "windows";
                break;
            case "darwin":
                os = "darwin";
                break;
            case "linux":
                os = "linux";
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
    }
    getVersionInfo() {
        if (!this.versionInfo)
            throw new Error("VersionInfoService not initialized.");
        return this.versionInfo;
    }
    getIdeVersion() {
        return this.versionInfo?.ideVersion || "unknown";
    }
    getIdeName() {
        return this.versionInfo?.ideName || "unknown";
    }
    isAntigravityIde() {
        const candidates = [
            this.versionInfo?.ideName,
            this.versionInfo?.productName,
            vscode.env.appName,
        ]
            .filter(Boolean)
            .map((name) => name.toLowerCase());
        return candidates.some((name) => name.includes("antigravity"));
    }
    getExtensionVersion() {
        return this.versionInfo?.extensionVersion || "unknown";
    }
    getOs() {
        return this.versionInfo?.os || "unknown";
    }
    getFullVersionString() {
        const info = this.versionInfo;
        if (!info)
            return "VersionInfo not initialized";
        return `Extension v${info.extensionVersion} on ${info.ideName} v${info.ideVersion} (VSCode OSS v${info.vscodeOssVersion})`;
    }
}
exports.versionInfo = VersionInfoService.getInstance();
//# sourceMappingURL=versionInfo.js.map