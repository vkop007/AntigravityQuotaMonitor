import * as vscode from "vscode";
import { SessionController } from "../controllers/SessionController";
import { QuotaData } from "../lib/types";

export class StatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private currentData: QuotaData | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.text = "$(graph) Antigravity";
    this.statusBarItem.tooltip = "Loading Antigravity Quotas...";
    this.statusBarItem.show();

    context.subscriptions.push(this.statusBarItem);
    SessionController.shared().onDataUpdate((data) => this.update(data));
    this.refreshTimer = setInterval(() => this.render(), 60000);
  }

  public dispose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  public setError(msg: string) {
    this.statusBarItem.text = "$(error) Antigravity";
    this.statusBarItem.tooltip = msg;
  }

  private update(data: QuotaData) {
    this.currentData = data;
    this.render();
  }

  private render() {
    const data = this.currentData;
    if (!data) return;
    if (data.needsLogin) {
      this.statusBarItem.text = "$(graph) Antigravity";
      this.statusBarItem.tooltip = "Login first";
      return;
    }

    const getStatusIcon = (pct: number) => {
      if (pct > 50) return "🟢";
      if (pct > 0) return "🟡";
      return "🔴";
    };

    const getShortName = (
      m: { name: string; id: string },
      fallback: string
    ) => {
      const name = m.name.toLowerCase();
      if (name.includes("sonnet")) return "Sonnet";
      if (name.includes("opus")) return "Opus";
      if (name.includes("pro")) return "Pro";
      if (name.includes("flash")) return "Flash";
      if (name.includes("gpt")) return "GPT";
      return fallback;
    };

    const findModel = (keywords: string[]) => {
      return data.models.find((m: any) => {
        const text = (m.id + " " + m.name).toLowerCase();
        return keywords.every((k) => text.includes(k));
      });
    };

    const config = vscode.workspace.getConfiguration("antigravity");
    const selectedModelId =
      config.get<string>("modelSelection") || config.get<string>("model");

    let statusBarText = "$(graph)";
    const sortedModels = [...data.models].sort((a, b) => b.pct - a.pct);

    if (selectedModelId) {
      const selectedModel = data.models.find(
        (m: any) => m.id === selectedModelId || m.name === selectedModelId
      );
      if (selectedModel) {
        const icon = getStatusIcon(selectedModel.pct);
        const name = getShortName(selectedModel, selectedModel.name);
        statusBarText += ` ${icon} ${name} ${Math.round(selectedModel.pct)}%`;
      } else {
        const major = [
          findModel(["claude"]),
          findModel(["gemini"]),
          findModel(["gpt"]),
        ]
          .filter((m) => m !== undefined)
          .sort((a, b) => (b as any).pct - (a as any).pct);

        major.forEach((m: any) => {
          statusBarText += ` ${getStatusIcon(m.pct)} ${getShortName(
            m,
            m.name
          )} ${Math.round(m.pct)}% `;
        });
      }
    } else {
      const major = [
        findModel(["claude"]),
        findModel(["gemini"]),
        findModel(["gpt"]),
      ]
        .filter((m) => m !== undefined)
        .sort((a, b) => (b as any).pct - (a as any).pct);

      major.forEach((m: any) => {
        statusBarText += ` ${getStatusIcon(m.pct)} ${getShortName(
          m,
          m.name
        )} ${Math.round(m.pct)}% `;
      });
    }

    this.statusBarItem.text = statusBarText.trim();

    const getProgressBar = (pct: number) => {
      const size = 10;
      const filled = Math.max(
        0,
        Math.min(size, Math.round((pct / 100) * size))
      );
      return "█".repeat(filled) + "░".repeat(size - filled);
    };

    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    if (data.planName) md.appendMarkdown(`**Plan:** ${data.planName}\n\n`);

    md.appendMarkdown(
      `| | Model | Quota | Status |\n|:---:|:---|:---:|:---|\n`
    );

    const formatTimeUntil = (resetTime: number) => {
      const ms = resetTime - Date.now();
      if (ms <= 0) return "Expired";
      const minutes = Math.floor(ms / 60000);
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    };

    sortedModels.forEach((m) => {
      const icon = getStatusIcon(m.pct);
      const bar = `\`${getProgressBar(m.pct)}\``;
      const pctStr = `${m.pct.toFixed(2)}%`;
      const resetStr = m.resetTime > 0 ? formatTimeUntil(m.resetTime) : m.time;

      md.appendMarkdown(
        `| ${icon} | **${m.name}** | ${bar} | ${pctStr} → ${resetStr} |\n`
      );
    });

    this.statusBarItem.tooltip = md;
  }
}
