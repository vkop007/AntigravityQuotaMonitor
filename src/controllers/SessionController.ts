import * as vscode from "vscode";
import { PortDetectionService } from "../services/discovery/PortDetector";
import { AntigravityClient } from "../services/api/AntigravityClient";
import { QuotaSnapshot, QuotaData } from "../lib/types";

export class SessionController {
  private static instance: SessionController;
  private cachedData: QuotaData | null = null;
  private client: AntigravityClient | undefined;
  private portDetectionService: PortDetectionService | undefined;
  private isInitialized = false;
  private isReconnecting = false;
  private updateListeners: ((data: QuotaData) => void)[] = [];

  private constructor() {}

  public static shared(): SessionController {
    if (!SessionController.instance) {
      SessionController.instance = new SessionController();
    }
    return SessionController.instance;
  }

  public async initialize(context: vscode.ExtensionContext): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      this.portDetectionService = new PortDetectionService(context);
      const detectionResult = await this.portDetectionService.detectPort();

      if (detectionResult?.port && detectionResult.csrfToken) {
        this.client = new AntigravityClient(
          detectionResult.port,
          detectionResult.csrfToken,
          detectionResult.httpPort
        );

        this.client.onQuotaUpdate((snapshot: QuotaSnapshot) => {
          this.cachedData = this.transformSnapshotToQuotaData(snapshot);
          this.notifyListeners();
        });

        this.client.onError(async (error) => {
          const msg = error.message;
          if (
            msg.includes("ECONNREFUSED") ||
            msg.includes("ETIMEDOUT") ||
            msg.includes("socket hang up") ||
            msg.includes("network")
          ) {
            await this.tryReconnect();
            return;
          }

          if (msg.includes("quota info") || msg.includes("not logged in")) {
            this.cachedData = { models: [], needsLogin: true };
            this.notifyListeners();
          }
        });

        await this.client.startPolling(15000);
        await this.client.quickRefresh();

        this.isInitialized = true;
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  public onDataUpdate(listener: (data: QuotaData) => void) {
    this.updateListeners.push(listener);
    if (this.cachedData) {
      try {
        listener(this.cachedData);
      } catch (e) {}
    }
  }

  private notifyListeners() {
    if (this.cachedData) {
      this.updateListeners.forEach((l) => {
        try {
          l(this.cachedData!);
        } catch (e) {}
      });
    }
  }

  public async fetchQuotaData(): Promise<QuotaData | null> {
    if (!this.isInitialized) return null;
    if (!this.cachedData && this.client) {
      await this.client.quickRefresh();
    }
    return this.cachedData;
  }

  private transformSnapshotToQuotaData(snapshot: QuotaSnapshot): QuotaData {
    const formatTime = (ms: number) => {
      if (ms <= 0) return "Expired";
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      return `${minutes}m`;
    };

    const models = (snapshot.models || []).map((model) => {
      return {
        id: model.modelId,
        name: model.label || model.modelId,
        pct: model.remainingPercentage || 0,
        time: formatTime(model.timeUntilReset),
        resetTime:
          model.timeUntilReset > 0 ? Date.now() + model.timeUntilReset : 0,
      };
    });

    return {
      planName: snapshot.planName,
      models: models,
    };
  }

  private async tryReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    try {
      if (!this.portDetectionService) return;
      const result = await this.portDetectionService.detectPort();
      if (result?.port && result.csrfToken && this.client) {
        this.client.setPorts(result.port, result.httpPort);
        this.client.setAuthInfo(undefined, result.csrfToken);
        await this.client.quickRefresh();
      }
    } catch (e) {
    } finally {
      this.isReconnecting = false;
    }
  }

  public stop(): void {
    if (this.client) {
      this.client.stopPolling();
    }
  }
}
