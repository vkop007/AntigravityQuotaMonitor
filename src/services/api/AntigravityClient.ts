import * as https from "https";
import * as http from "http";
import {
  UserStatusResponse,
  QuotaSnapshot,
  ModelQuotaInfo,
} from "../../lib/types";
import { versionInfo } from "../../lib/versionInfo";

interface RequestConfig {
  path: string;
  body: object;
  timeout?: number;
}

async function makeRequest(
  config: RequestConfig,
  port: number,
  httpPort: number | undefined,
  csrfToken: string | undefined,
  httpsAgent?: https.Agent,
  httpAgent?: http.Agent
): Promise<any> {
  const requestBody = JSON.stringify(config.body);
  const headers: Record<string, string | number> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(requestBody),
    "Connect-Protocol-Version": "1",
  };

  if (!csrfToken) throw new Error("Missing CSRF token");
  headers["X-Codeium-Csrf-Token"] = csrfToken;

  const doRequest = (useHttps: boolean, targetPort: number) =>
    new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: "127.0.0.1",
        port: targetPort,
        path: config.path,
        method: "POST",
        headers,
        rejectUnauthorized: false,
        timeout: config.timeout ?? 5000,
        agent: useHttps ? httpsAgent : httpAgent,
      };

      const client = useHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            let errorDetail = "";
            try {
              const errorBody = JSON.parse(data);
              errorDetail = errorBody.message || errorBody.error || data;
            } catch {
              errorDetail = data || "(empty response)";
            }
            reject(new Error(`HTTP ${res.statusCode}: ${errorDetail}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Parse error: ${error}`));
          }
        });
      });

      req.on("error", (error) => reject(error));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
      req.write(requestBody);
      req.end();
    });

  try {
    return await doRequest(true, port);
  } catch (error: any) {
    const msg = (error?.message || "").toLowerCase();
    if (
      httpPort !== undefined &&
      (error.code === "EPROTO" || msg.includes("wrong_version_number"))
    ) {
      return await doRequest(false, httpPort);
    }
    throw error;
  }
}

export class AntigravityClient {
  private readonly GET_USER_STATUS_PATH =
    "/exa.language_server_pb.LanguageServerService/GetUserStatus";

  private readonly MAX_RETRY_COUNT = 3;
  private readonly RETRY_DELAY_MS = 5000;

  private port: number;
  private httpPort?: number;
  private pollingInterval?: NodeJS.Timeout;
  private updateCallback?: (snapshot: QuotaSnapshot) => void;
  private errorCallback?: (error: Error) => void;
  private statusCallback?: (
    status: "fetching" | "retrying",
    retryCount?: number
  ) => void;

  private isFirstAttempt: boolean = true;
  private retryCount: number = 0;
  private isRetrying: boolean = false;
  private csrfToken?: string;

  private httpsAgent: https.Agent;
  private httpAgent: http.Agent;

  constructor(port: number, csrfToken?: string, httpPort?: number) {
    this.port = port;
    this.httpPort = httpPort ?? port;
    this.csrfToken = csrfToken;
    this.httpsAgent = new https.Agent({ keepAlive: true });
    this.httpAgent = new http.Agent({ keepAlive: true });
  }

  setAuthInfo(_unused?: any, csrfToken?: string): void {
    this.csrfToken = csrfToken;
  }

  setPorts(connectPort: number, httpPort?: number): void {
    this.port = connectPort;
    this.httpPort = httpPort ?? connectPort;
    this.retryCount = 0;
  }

  onQuotaUpdate(callback: (snapshot: QuotaSnapshot) => void): void {
    this.updateCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onStatus(
    callback: (status: "fetching" | "retrying", retryCount?: number) => void
  ): void {
    this.statusCallback = callback;
  }

  async startPolling(intervalMs: number): Promise<void> {
    this.stopPolling();
    await this.fetchQuota();
    this.pollingInterval = setInterval(() => {
      this.fetchQuota();
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  async quickRefresh(): Promise<void> {
    await this.doFetchQuota();
  }

  private async fetchQuota(): Promise<void> {
    if (this.isRetrying) return;
    await this.doFetchQuota();
  }

  private async doFetchQuota(): Promise<void> {
    if (this.statusCallback && this.isFirstAttempt) {
      this.statusCallback("fetching");
    }

    try {
      const response = await this.makeGetUserStatusRequest();
      const invalid = this.getInvalidCodeInfo(response);
      if (invalid) {
        throw new Error(`Invalid code ${invalid.code}: ${invalid.message}`);
      }
      const snapshot = this.parseGetUserStatusResponse(response);

      this.retryCount = 0;
      this.isFirstAttempt = false;
      this.isRetrying = false;

      if (this.updateCallback) {
        this.updateCallback(snapshot);
      }
    } catch (error: any) {
      if (this.retryCount < this.MAX_RETRY_COUNT) {
        this.retryCount++;
        this.isRetrying = true;
        if (this.statusCallback) {
          this.statusCallback("retrying", this.retryCount);
        }
        setTimeout(async () => {
          this.isRetrying = false;
          await this.fetchQuota();
        }, this.RETRY_DELAY_MS);
        return;
      }

      this.isRetrying = false;
      this.retryCount = 0;
      if (this.errorCallback) {
        this.errorCallback(error as Error);
      }
    }
  }

  private async makeGetUserStatusRequest(): Promise<any> {
    return makeRequest(
      {
        path: this.GET_USER_STATUS_PATH,
        body: {
          metadata: {
            ideName: "antigravity",
            extensionName: "antigravity",
            ideVersion: versionInfo.getIdeVersion(),
            locale: "en",
          },
        },
      },
      this.port,
      this.httpPort,
      this.csrfToken,
      this.httpsAgent,
      this.httpAgent
    );
  }

  private parseGetUserStatusResponse(
    response: UserStatusResponse
  ): QuotaSnapshot {
    if (!response || !response.userStatus) {
      throw new Error("Invalid response format");
    }

    const userStatus = response.userStatus;
    const modelConfigs =
      userStatus.cascadeModelConfigData?.clientModelConfigs || [];

    const models: ModelQuotaInfo[] = modelConfigs
      .filter((config) => config.quotaInfo)
      .map((config) => this.parseModelQuota(config));

    return {
      timestamp: new Date(),
      models,
      planName: userStatus?.userTier?.name,
    };
  }

  private parseModelQuota(config: any): ModelQuotaInfo {
    const quotaInfo = config.quotaInfo;
    const remainingFraction = quotaInfo?.remainingFraction;
    let resetTime: Date;
    let timeUntilReset: number;

    if (!quotaInfo.resetTime || quotaInfo.resetTime === "infinite") {
      resetTime = new Date(8640000000000000);
      timeUntilReset = 8640000000000000;
    } else {
      resetTime = new Date(quotaInfo.resetTime);
      if (isNaN(resetTime.getTime())) {
        resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }
      timeUntilReset = resetTime.getTime() - Date.now();
    }

    return {
      label: config.label,
      modelId: config.modelOrAlias.model,
      remainingFraction,
      remainingPercentage:
        remainingFraction !== undefined ? remainingFraction * 100 : undefined,
      isExhausted: remainingFraction === undefined || remainingFraction === 0,
      resetTime,
      timeUntilReset,
      timeUntilResetFormatted: this.formatTimeUntilReset(timeUntilReset),
    };
  }

  private formatTimeUntilReset(ms: number): string {
    if (ms <= 0) return "Expired";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d${hours % 24}h from now`;
    if (hours > 0) return `${hours}h ${minutes % 60}m from now`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s from now`;
    return `${seconds}s from now`;
  }

  private getInvalidCodeInfo(
    response: any
  ): { code: any; message?: any } | null {
    const code = response?.code;
    if (code === undefined || code === null) return null;
    const okValues = [0, "0", "OK", "Ok", "ok", "success", "SUCCESS"];
    if (okValues.includes(code)) return null;
    return { code, message: response?.message };
  }

  dispose(): void {
    this.stopPolling();
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }
}
