import { exec } from "child_process";
import { promisify } from "util";
import * as https from "https";
import { PlatformDetector } from "../PlatformTools";
import { IPlatformStrategy, AntigravityProcessInfo } from "../../../lib/types";
import { versionInfo } from "../../../lib/versionInfo";

const execAsync = promisify(exec);

export class ProcessPortDetector {
  private platformDetector: PlatformDetector;
  private platformStrategy: IPlatformStrategy;
  private processName: string;

  constructor() {
    this.platformDetector = new PlatformDetector();
    this.platformStrategy = this.platformDetector.getStrategy();
    this.processName = this.platformDetector.getProcessName();
  }

  async detectProcessInfo(
    maxRetries: number = 3,
    retryDelay: number = 2000
  ): Promise<AntigravityProcessInfo | null> {
    const platformName = this.platformDetector.getPlatformName();
    const errorMessages = this.platformStrategy.getErrorMessages();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const command = this.platformStrategy.getProcessListCommand(
          this.processName
        );
        const { stdout } = await execAsync(command, { timeout: 15000 });
        const processInfo = this.platformStrategy.parseProcessInfo(stdout);

        if (!processInfo) {
          throw new Error(errorMessages.processNotFound);
        }

        const { pid, extensionPort, csrfToken } = processInfo;
        const listeningPorts = await this.getProcessListeningPorts(pid);

        if (listeningPorts.length === 0) {
          throw new Error("Process is not listening on any ports");
        }

        const connectPort = await this.findWorkingPort(
          listeningPorts,
          csrfToken
        );

        if (!connectPort) {
          throw new Error("Unable to find a working API port");
        }

        return { extensionPort, connectPort, csrfToken };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        if (
          errorMsg.includes("not found") ||
          errorMsg.includes("not recognized") ||
          errorMsg.includes("不是内部或外部命令")
        ) {
          if (this.platformDetector.getPlatformName() === "Windows") {
            const windowsStrategy = this.platformStrategy as any;
            if (
              windowsStrategy.setUsePowerShell &&
              !windowsStrategy.isUsingPowerShell()
            ) {
              windowsStrategy.setUsePowerShell(true);
              attempt--;
              continue;
            }
          }
        }
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    return null;
  }

  private async getProcessListeningPorts(pid: number): Promise<number[]> {
    try {
      await this.platformStrategy.ensurePortCommandAvailable();
      const command = this.platformStrategy.getPortListCommand(pid);
      const { stdout } = await execAsync(command, { timeout: 3000 });
      return this.platformStrategy.parseListeningPorts(stdout);
    } catch (error) {
      return [];
    }
  }

  private async findWorkingPort(
    ports: number[],
    csrfToken: string
  ): Promise<number | null> {
    for (const port of ports) {
      const isWorking = await this.testPortConnectivity(port, csrfToken);
      if (isWorking) return port;
    }
    return null;
  }

  private async testPortConnectivity(
    port: number,
    csrfToken: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const requestBody = JSON.stringify({
        context: {
          properties: {
            devMode: "false",
            extensionVersion: versionInfo.getExtensionVersion(),
            hasAnthropicModelAccess: "true",
            ide: "antigravity",
            ideVersion: versionInfo.getIdeVersion(),
            installationId: "test-detection",
            language: "UNSPECIFIED",
            os: versionInfo.getOs(),
            requestedModelId: "MODEL_UNSPECIFIED",
          },
        },
      });

      const options = {
        hostname: "127.0.0.1",
        port: port,
        path: "/exa.language_server_pb.LanguageServerService/GetUnleashData",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          "Connect-Protocol-Version": "1",
          "X-Codeium-Csrf-Token": csrfToken,
        },
        rejectUnauthorized: false,
        timeout: 2000,
      };

      const req = https.request(options, (res) => {
        const success = res.statusCode === 200;
        res.resume();
        resolve(success);
      });

      req.on("error", (err) => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.write(requestBody);
      req.end();
    });
  }
}
