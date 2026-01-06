"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBar = void 0;
const vscode = require("vscode");
const AppManager_1 = require("../managers/AppManager");
class StatusBar {
    constructor(context) {
        this.currentData = null;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = "$(graph) Antigravity";
        this.statusBarItem.tooltip = "Loading Antigravity Quotas...";
        this.statusBarItem.show();
        context.subscriptions.push(this.statusBarItem);
        // Subscribe to data updates
        // Subscribe to data updates
        AppManager_1.AppManager.getInstance().onDataUpdate((data) => this.update(data));
        // Start local refresh timer (every 60s) to update relative time in tooltip
        this.refreshTimer = setInterval(() => this.render(), 60000);
    }
    dispose() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }
    setError(msg) {
        this.statusBarItem.text = "$(error) Antigravity";
        this.statusBarItem.tooltip = msg;
    }
    update(data) {
        this.currentData = data;
        this.render();
    }
    render() {
        const data = this.currentData;
        if (!data)
            return;
        if (data.needsLogin) {
            this.statusBarItem.text = "$(graph) Antigravity";
            this.statusBarItem.tooltip = "Login first";
            return;
        }
        // New Color Logic: > 50% Green, > 0% Yellow, 0% Red
        const getStatusIcon = (pct) => {
            if (pct > 50)
                return "🟢";
            if (pct > 0)
                return "🟡";
            return "🔴";
        };
        const getShortName = (m, fallback) => {
            const name = m.name.toLowerCase();
            if (name.includes("sonnet"))
                return "Sonnet";
            if (name.includes("opus"))
                return "Opus";
            if (name.includes("pro"))
                return "Pro";
            if (name.includes("flash"))
                return "Flash";
            if (name.includes("gpt"))
                return "GPT";
            return fallback;
        };
        const findModel = (keywords) => {
            return data.models.find((m) => {
                const text = (m.id + " " + m.name).toLowerCase();
                return keywords.every((k) => text.includes(k));
            });
        };
        // Check for a selected model in settings (might be from another extension)
        const config = vscode.workspace.getConfiguration("antigravity");
        const selectedModelId = config.get("modelSelection") || config.get("model");
        let statusBarText = "$(graph)";
        // Sort models by percentage descending (Green > Yellow > Red)
        // pct > 50 (Green), pct > 0 (Yellow), pct = 0 (Red)
        // Sorting High -> Low ensures Green first, then Yellow, then Red.
        const sortedModels = [...data.models].sort((a, b) => b.pct - a.pct);
        // Status Bar Logic
        if (selectedModelId) {
            const selectedModel = data.models.find((m) => m.id === selectedModelId || m.name === selectedModelId);
            if (selectedModel) {
                const icon = getStatusIcon(selectedModel.pct);
                const name = getShortName(selectedModel, selectedModel.name);
                statusBarText += ` ${icon} ${name} ${Math.round(selectedModel.pct)}%`;
            }
            else {
                // Fallback: Show filtered 3 major ones, but sorted
                const list = [
                    findModel(["claude"]),
                    findModel(["gemini"]),
                    findModel(["gpt"]),
                ].filter((m) => m !== undefined);
                list.sort((a, b) => b.pct - a.pct);
                list.forEach((m) => {
                    statusBarText += ` ${getStatusIcon(m.pct)} ${getShortName(m, m.name)} ${Math.round(m.pct)}% `;
                });
            }
        }
        else {
            // Default: Show filtered 3 major ones, but sorted
            const list = [
                findModel(["claude"]),
                findModel(["gemini"]),
                findModel(["gpt"]),
            ].filter((m) => m !== undefined);
            list.sort((a, b) => b.pct - a.pct);
            list.forEach((m) => {
                statusBarText += ` ${getStatusIcon(m.pct)} ${getShortName(m, m.name)} ${Math.round(m.pct)}% `;
            });
        }
        this.statusBarItem.text = statusBarText.trim();
        const getProgressBar = (pct) => {
            const size = 10;
            const filled = Math.max(0, Math.min(size, Math.round((pct / 100) * size)));
            return "█".repeat(filled) + "░".repeat(size - filled);
        };
        // Build rich tooltip
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        if (data.planName) {
            md.appendMarkdown(`**Plan:** ${data.planName}\n\n`);
        }
        // Using a table for consistent alignment across columns
        md.appendMarkdown(`| | Model | Quota | Status |\n|:---:|:---|:---:|:---|\n`);
        // Helper to format dynamic time
        const formatTimeUntil = (resetTime) => {
            const ms = resetTime - Date.now();
            if (ms <= 0)
                return "Expired";
            const minutes = Math.floor(ms / 60000);
            const hours = Math.floor(minutes / 60);
            return `${hours}h ${minutes % 60}m`;
        };
        // Use sortedModels for the tooltip to match the "Green > Yellow > Red" order
        sortedModels.forEach((m) => {
            const icon = getStatusIcon(m.pct);
            const bar = `\`${getProgressBar(m.pct)}\``; // Code block for monospace alignment
            const pctStr = `${m.pct.toFixed(2)}%`;
            // Use dynamic time calculation if available
            const resetStr = m.resetTime > 0 ? formatTimeUntil(m.resetTime) : m.time;
            md.appendMarkdown(`| ${icon} | **${m.name}** | ${bar} | ${pctStr} → ${resetStr} |\n`);
        });
        this.statusBarItem.tooltip = md;
    }
}
exports.StatusBar = StatusBar;
//# sourceMappingURL=StatusBar.js.map