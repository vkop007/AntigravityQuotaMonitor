import { SafePowerShellPath } from "./SafePowerShellPath";
import { IPlatformStrategy } from "../../../lib/types";

export class WindowsProcessDetector implements IPlatformStrategy {
  private static readonly SYSTEM_ROOT: string =
    process.env.SystemRoot || "C:\\Windows";
  private static readonly WMIC_PATH: string = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\wbem\\wmic.exe"`;
  private static readonly NETSTAT_PATH: string = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\netstat.exe"`;
  private static readonly FINDSTR_PATH: string = `"${WindowsProcessDetector.SYSTEM_ROOT}\\System32\\findstr.exe"`;

  private usePowerShell: boolean = true;

  setUsePowerShell(value: boolean): void {
    this.usePowerShell = value;
  }

  isUsingPowerShell(): boolean {
    return this.usePowerShell;
  }

  getProcessListCommand(processName: string): string {
    if (this.usePowerShell) {
      const psPath = SafePowerShellPath.getSafePath();
      return `${psPath} -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${processName}'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;
    }
    return `${WindowsProcessDetector.WMIC_PATH} process where "name='${processName}'" get ProcessId,CommandLine /format:list`;
  }

  private isAntigravityProcess(commandLine: string): boolean {
    const lowerCmd = commandLine.toLowerCase();
    return (
      /--app_data_dir\s+antigravity\b/i.test(commandLine) ||
      lowerCmd.includes("\\antigravity\\") ||
      lowerCmd.includes("/antigravity/")
    );
  }

  parseProcessInfo(stdout: string): {
    pid: number;
    extensionPort: number;
    csrfToken: string;
  } | null {
    if (
      this.usePowerShell ||
      stdout.trim().startsWith("{") ||
      stdout.trim().startsWith("[")
    ) {
      try {
        let data = JSON.parse(stdout.trim());
        if (Array.isArray(data)) {
          const antigravityProcesses = data.filter(
            (item: any) =>
              item.CommandLine && this.isAntigravityProcess(item.CommandLine)
          );
          if (antigravityProcesses.length === 0) return null;
          data = antigravityProcesses[0];
        } else if (
          !data.CommandLine ||
          !this.isAntigravityProcess(data.CommandLine)
        ) {
          return null;
        }

        const commandLine = data.CommandLine || "";
        const pid = data.ProcessId;
        if (!pid) return null;

        const portMatch = commandLine.match(
          /--extension_server_port[=\s]+(\d+)/
        );
        const tokenMatch = commandLine.match(
          /--csrf_token[=\s]+([a-f0-9\-]+)/i
        );
        if (!tokenMatch) return null;

        return {
          pid,
          extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
          csrfToken: tokenMatch[1],
        };
      } catch (e) {}
    }

    const blocks = stdout
      .split(/\n\s*\n/)
      .filter((block) => block.trim().length > 0);
    for (const block of blocks) {
      const pidMatch = block.match(/ProcessId=(\d+)/);
      const commandLineMatch = block.match(/CommandLine=(.+)/);
      if (!pidMatch || !commandLineMatch) continue;

      const cmd = commandLineMatch[1].trim();
      if (!this.isAntigravityProcess(cmd)) continue;

      const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
      const tokenMatch = cmd.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);
      if (!tokenMatch) continue;

      return {
        pid: parseInt(pidMatch[1], 10),
        extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
        csrfToken: tokenMatch[1],
      };
    }
    return null;
  }

  async ensurePortCommandAvailable(): Promise<void> {}

  getPortListCommand(pid: number): string {
    return `${WindowsProcessDetector.NETSTAT_PATH} -ano | ${WindowsProcessDetector.FINDSTR_PATH} "${pid}" | ${WindowsProcessDetector.FINDSTR_PATH} "LISTENING"`;
  }

  parseListeningPorts(stdout: string): number[] {
    const portRegex =
      /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING/gi;
    const ports: number[] = [];
    let match;
    while ((match = portRegex.exec(stdout)) !== null) {
      const p = parseInt(match[1], 10);
      if (!ports.includes(p)) ports.push(p);
    }
    return ports.sort((a, b) => a - b);
  }

  getErrorMessages() {
    return {
      processNotFound: "language_server process not found",
      commandNotAvailable: this.usePowerShell
        ? "PowerShell failed"
        : "wmic/PowerShell failed",
      requirements: [
        "Antigravity is running",
        "language_server process is running",
        "Permission to execute commands",
      ],
    };
  }
}
