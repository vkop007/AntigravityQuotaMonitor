import * as vscode from "vscode";
import { ProcessPortDetector } from "./process/ProcessPortDetector";
import { AntigravityProcessInfo } from "../../lib/types";

export interface PortDetectionResult {
  port: number;
  connectPort: number;
  httpPort: number;
  csrfToken: string;
  source: "process";
  confidence: "high";
}

export class PortDetectionService {
  private processDetector: ProcessPortDetector;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.processDetector = new ProcessPortDetector();
  }

  async detectPort(): Promise<PortDetectionResult | null> {
    const processInfo: AntigravityProcessInfo | null =
      await this.processDetector.detectProcessInfo();

    if (!processInfo) {
      console.error(
        "[PortDetectionService] Failed to get port and CSRF Token from process."
      );
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
