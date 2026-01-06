export interface ModelConfig {
  label: string;
  modelOrAlias: {
    model: string;
  };
  quotaInfo?: {
    remainingFraction?: number;
    resetTime: string;
  };
  supportsImages?: boolean;
  isRecommended?: boolean;
  allowedTiers?: string[];
}

export interface UserStatusResponse {
  userStatus: {
    name: string;
    email: string;
    planStatus?: {
      planInfo: {
        teamsTier: string;
        planName: string;
        monthlyPromptCredits: number;
        monthlyFlowCredits: number;
      };
      availablePromptCredits: number;
      availableFlowCredits: number;
    };
    cascadeModelConfigData?: {
      clientModelConfigs: ModelConfig[];
    };
    userTier?: {
      id: string;
      name: string;
      description: string;
    };
  };
}

export interface ModelQuotaInfo {
  label: string;
  modelId: string;
  remainingFraction?: number;
  remainingPercentage?: number;
  isExhausted: boolean;
  resetTime: Date;
  timeUntilReset: number;
  timeUntilResetFormatted: string;
}

export interface QuotaSnapshot {
  timestamp: Date;
  models: ModelQuotaInfo[];
  planName?: string;
}

export interface QuotaData {
  planName?: string;
  models: {
    id: string;
    name: string;
    pct: number;
    time: string;
    resetTime: number;
  }[];
  needsLogin?: boolean;
}

export interface AntigravityProcessInfo {
  extensionPort: number;
  connectPort: number;
  csrfToken: string;
}

export interface IPlatformStrategy {
  getProcessListCommand(processName: string): string;
  parseProcessInfo(stdout: string): {
    pid: number;
    extensionPort: number;
    csrfToken: string;
  } | null;
  ensurePortCommandAvailable(): Promise<void>;
  getPortListCommand(pid: number): string;
  parseListeningPorts(stdout: string): number[];
  getErrorMessages(): {
    processNotFound: string;
    commandNotAvailable: string;
    requirements: string[];
  };
}
