"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaService = exports.QuotaApiMethod = void 0;
const https = require("https");
const http = require("http");
const versionInfo_1 = require("../../common/versionInfo");
// API Method Enum
var QuotaApiMethod;
(function (QuotaApiMethod) {
    //   COMMAND_MODEL_CONFIG = 'COMMAND_MODEL_CONFIG',
    QuotaApiMethod["GET_USER_STATUS"] = "GET_USER_STATUS";
})(QuotaApiMethod || (exports.QuotaApiMethod = QuotaApiMethod = {}));
// Generic Request Method
async function makeRequest(config, port, httpPort, csrfToken, httpsAgent, httpAgent) {
    const requestBody = JSON.stringify(config.body);
    const headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        "Connect-Protocol-Version": "1",
    };
    if (csrfToken) {
        headers["X-Codeium-Csrf-Token"] = csrfToken;
    }
    else {
        throw new Error("Missing CSRF token");
    }
    const doRequest = (useHttps, targetPort) => new Promise((resolve, reject) => {
        const options = {
            hostname: "127.0.0.1",
            port: targetPort,
            path: config.path,
            method: "POST",
            headers,
            rejectUnauthorized: false,
            timeout: config.timeout ?? 5000,
            agent: useHttps ? httpsAgent : httpAgent,
        };
        console.log(`Request URL: ${useHttps ? "https" : "http"}://127.0.0.1:${targetPort}${config.path}`);
        const client = useHttps ? https : http;
        const req = client.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                if (res.statusCode !== 200) {
                    let errorDetail = "";
                    try {
                        const errorBody = JSON.parse(data);
                        errorDetail =
                            errorBody.message ||
                                errorBody.error ||
                                JSON.stringify(errorBody);
                    }
                    catch {
                        errorDetail = data || "(empty response)";
                    }
                    reject(new Error(`HTTP error: ${res.statusCode}, detail: ${errorDetail}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                }
                catch (error) {
                    reject(new Error(`Failed to parse response: ${error}`));
                }
            });
        });
        req.on("error", (error) => reject(error));
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timed out"));
        });
        req.write(requestBody);
        req.end();
    });
    // Try HTTPS first, fallback to HTTP on failure
    try {
        return await doRequest(true, port);
    }
    catch (error) {
        const msg = (error?.message || "").toLowerCase();
        const shouldRetryHttp = httpPort !== undefined &&
            (error.code === "EPROTO" || msg.includes("wrong_version_number"));
        if (shouldRetryHttp) {
            console.warn("HTTPS failed; trying HTTP fallback port:", httpPort);
            return await doRequest(false, httpPort);
        }
        throw error;
    }
}
class QuotaService {
    constructor(port, csrfToken, httpPort) {
        this.GET_USER_STATUS_PATH = "/exa.language_server_pb.LanguageServerService/GetUserStatus";
        //   private readonly COMMAND_MODEL_CONFIG_PATH = '/exa.language_server_pb.LanguageServerService/GetCommandModelConfigs';
        // Retry Configuration
        this.MAX_RETRY_COUNT = 3;
        this.RETRY_DELAY_MS = 5000; // 5 seconds
        this.isFirstAttempt = true;
        this.consecutiveErrors = 0;
        this.retryCount = 0;
        this.isRetrying = false;
        this.isPollingTransition = false; // Transition lock to prevent race conditions
        this.apiMethod = QuotaApiMethod.GET_USER_STATUS;
        this.port = port;
        this.httpPort = httpPort ?? port;
        this.csrfToken = csrfToken;
        // Initialize agents with keepAlive enabled to optimize frequent polling
        this.httpsAgent = new https.Agent({ keepAlive: true });
        this.httpAgent = new http.Agent({ keepAlive: true });
    }
    getApiMethod() {
        return this.apiMethod;
    }
    setApiMethod(method) {
        this.apiMethod = method;
        console.log(`Switching to API: ${method}`);
    }
    setAuthInfo(_unused, csrfToken) {
        this.csrfToken = csrfToken;
    }
    setPort(port) {
        this.port = port;
        this.httpPort = this.httpPort ?? port;
        this.consecutiveErrors = 0;
        this.retryCount = 0;
    }
    setPorts(connectPort, httpPort) {
        this.port = connectPort;
        this.httpPort = httpPort ?? connectPort;
        this.consecutiveErrors = 0;
        this.retryCount = 0;
    }
    onQuotaUpdate(callback) {
        this.updateCallback = callback;
    }
    onError(callback) {
        this.errorCallback = callback;
    }
    onStatus(callback) {
        this.statusCallback = callback;
    }
    /**
     * Set stale status callback (only for GOOGLE_API method)
     * @param callback Callback function, args: isStale - data is outdated
     */
    onStaleStatus(callback) {
        this.staleCallback = callback;
    }
    async startPolling(intervalMs) {
        // GOOGLE_API mode: Do not start polling if not logged in or token expired to avoid meaningless requests
        // Prevent multiple timers due to rapid calls
        if (this.isPollingTransition) {
            console.log("[QuotaService] Polling transition in progress, skipping...");
            return;
        }
        this.isPollingTransition = true;
        try {
            console.log(`[QuotaService] Starting polling loop every ${intervalMs}ms`);
            this.stopPolling();
            await this.fetchQuota();
            this.pollingInterval = setInterval(() => {
                this.fetchQuota();
            }, intervalMs);
        }
        finally {
            this.isPollingTransition = false;
        }
    }
    stopPolling() {
        if (this.pollingInterval) {
            console.log("[QuotaService] Stopping polling loop");
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
        }
    }
    /**
     * Manually retry quota fetch (reset all states, restart full flow)
     * Automatically resumes polling on success
     */
    async retryFromError(pollingInterval) {
        console.log(`Manual quota retry triggered; restarting full flow (interval ${pollingInterval}ms)...`);
        // Reset all error counts and states
        this.consecutiveErrors = 0;
        this.retryCount = 0;
        this.isRetrying = false;
        this.isFirstAttempt = true;
        // Stop existing polling first
        this.stopPolling();
        // Execute one fetch, if successful automatically start polling
        await this.fetchQuota();
        // If fetch succeeded (consecutiveErrors is 0), start polling
        if (this.consecutiveErrors === 0) {
            console.log("Fetch succeeded, starting polling...");
            this.pollingInterval = setInterval(() => {
                this.fetchQuota();
            }, pollingInterval);
        }
        else {
            console.log("Fetch failed, keeping polling stopped");
        }
    }
    /**
     * Immediate quota refresh (keeps polling uninterrupted)
     * Used for manual trigger by user, does not reset error state
     */
    async quickRefresh() {
        console.log("Triggering immediate quota refresh...");
        // 直接调用内部获取方法,绕过 isRetrying 检查
        await this.doFetchQuota();
    }
    async fetchQuota() {
        // Skip this run if currently retrying
        if (this.isRetrying) {
            console.log("Currently retrying; skipping this polling run...");
            return;
        }
        await this.doFetchQuota();
    }
    /**
     * Internal method to execute quota fetch
     * Both quickRefresh and fetchQuota call this method
     */
    async doFetchQuota() {
        console.log(`Starting quota fetch with method ${this.apiMethod} (firstAttempt=${this.isFirstAttempt})...`);
        // Notify status: Fetching (first time only)
        if (this.statusCallback && this.isFirstAttempt) {
            this.statusCallback("fetching");
        }
        try {
            // Note: Login status check disabled
            // Reason: GetUnleashData API requires full auth context (API key etc) which extension cannot get
            // If user is not logged in, quota fetch will naturally fail with error
            //
            // Conserving original code for reference:
            // const isLoggedIn = await this.checkLoginStatus();
            // if (!isLoggedIn) {
            //   console.warn('User not logged in, cannot fetch quota info');
            //   if (this.loginStatusCallback) {
            //     this.loginStatusCallback(false);
            //   }
            //   this.consecutiveErrors = 0;
            //   this.retryCount = 0;
            //   this.isFirstAttempt = false;
            //   return;
            // }
            let snapshot;
            switch (this.apiMethod) {
                case QuotaApiMethod.GET_USER_STATUS: {
                    console.log("Using GetUserStatus API");
                    const userStatusResponse = await this.makeGetUserStatusRequest();
                    const invalid1 = this.getInvalidCodeInfo(userStatusResponse);
                    if (invalid1) {
                        console.error("Response code invalid; will treat as error", invalid1);
                        const detail = invalid1.message ? `: ${invalid1.message}` : "";
                        const err = new Error(`Invalid response code ${invalid1.code}${detail}`);
                        err.name = "QuotaInvalidCodeError";
                        throw err;
                    }
                    snapshot = this.parseGetUserStatusResponse(userStatusResponse);
                    break;
                }
                //         case QuotaApiMethod.COMMAND_MODEL_CONFIG:
                //         default: {
                //           console.log('Using CommandModelConfig API (recommended)');
                //           const configResponse = await this.makeCommandModelConfigsRequest();
                //           const invalid2 = this.getInvalidCodeInfo(configResponse);
                //           if (invalid2) {
                //             console.error('Response code invalid; skipping update', invalid2);
                //             return;
                //           }
                //           snapshot = this.parseCommandModelConfigsResponse(configResponse);
                //           break;
                //         }
                default: {
                    // Default fallback to GET_USER_STATUS
                    console.log("Falling back to GetUserStatus API");
                    const userStatusResponse = await this.makeGetUserStatusRequest();
                    const invalid1 = this.getInvalidCodeInfo(userStatusResponse);
                    if (invalid1) {
                        console.error("Response code invalid; will treat as error", invalid1);
                        const detail = invalid1.message ? `: ${invalid1.message}` : "";
                        const err = new Error(`Invalid response code ${invalid1.code}${detail}`);
                        err.name = "QuotaInvalidCodeError";
                        throw err;
                    }
                    snapshot = this.parseGetUserStatusResponse(userStatusResponse);
                    break;
                }
            }
            // Quota fetch successful, reset error count and retry count
            this.consecutiveErrors = 0;
            this.retryCount = 0;
            this.isFirstAttempt = false;
            this.isRetrying = false; // Ensure retry lock is released
            const modelCount = snapshot.models?.length ?? 0;
            const hasPromptCredits = Boolean(snapshot.promptCredits);
            console.log(`[QuotaService] Snapshot ready: models=${modelCount}, promptCredits=${hasPromptCredits}`);
            if (this.updateCallback) {
                this.updateCallback(snapshot);
            }
            else {
                console.warn("updateCallback is not registered");
            }
        }
        catch (error) {
            // If max retry count not reached, schedule delayed retry
            if (this.retryCount < this.MAX_RETRY_COUNT) {
                this.retryCount++;
                this.isRetrying = true;
                console.log(`Retry ${this.retryCount} scheduled in ${this.RETRY_DELAY_MS / 1000} seconds...`);
                // Notify status: Retrying
                if (this.statusCallback) {
                    this.statusCallback("retrying", this.retryCount);
                }
                setTimeout(async () => {
                    this.isRetrying = false;
                    await this.fetchQuota();
                }, this.RETRY_DELAY_MS);
                return;
            }
            // Max retry count reached
            console.warn(`Reached max retry count (${this.MAX_RETRY_COUNT}); will try again next interval`);
            // Do NOT stop polling. Just reset state so next interval works.
            this.isRetrying = false;
            this.retryCount = 0;
            if (this.errorCallback) {
                this.errorCallback(error);
            }
        }
    }
    /**
     * Determine if error is network or timeout related
     */
    isNetworkOrTimeoutError(error) {
        const message = (error?.message || "").toLowerCase();
        return (message.includes("network") ||
            message.includes("timeout") ||
            message.includes("econnrefused") ||
            message.includes("enotfound") ||
            message.includes("econnreset") ||
            message.includes("socket hang up") ||
            error?.code === "ECONNREFUSED" ||
            error?.code === "ENOTFOUND" ||
            error?.code === "ECONNRESET" ||
            error?.code === "ETIMEDOUT");
    }
    /**
     * Determine if error is authentication related (needs login/re-login)
     */
    async makeGetUserStatusRequest() {
        console.log("Using CSRF token:", this.csrfToken ? "[present]" : "[missing]");
        return makeRequest({
            path: this.GET_USER_STATUS_PATH,
            body: {
                metadata: {
                    ideName: "antigravity",
                    extensionName: "antigravity",
                    ideVersion: versionInfo_1.versionInfo.getIdeVersion(),
                    locale: "en",
                },
            },
        }, this.port, this.httpPort, this.csrfToken, this.httpsAgent, this.httpAgent);
    }
    //   private async makeCommandModelConfigsRequest(): Promise<any> {
    //     console.log('Using CSRF token:', this.csrfToken ? '[present]' : '[missing]');
    //     return makeRequest(
    //       {
    //         path: this.COMMAND_MODEL_CONFIG_PATH,
    //         body: {
    //           metadata: {
    //             ideName: 'antigravity',
    //             extensionName: 'antigravity',
    //             locale: 'en'
    //           }
    //         }
    //       },
    //       this.port,
    //       this.httpPort,
    //       this.csrfToken
    //     );
    //   }
    //   private parseCommandModelConfigsResponse(response: any): QuotaSnapshot {
    //     const modelConfigs = response?.clientModelConfigs || [];
    //     const models: ModelQuotaInfo[] = modelConfigs
    //       .filter((config: any) => config.quotaInfo)
    //       .map((config: any) => this.parseModelQuota(config));
    //
    //     return {
    //       timestamp: new Date(),
    //       promptCredits: undefined,
    //       models,
    //       planName: undefined // CommandModelConfig API doesn't usually return plan info
    //     };
    //   }
    parseGetUserStatusResponse(response) {
        if (!response || !response.userStatus) {
            throw new Error("API response format is invalid; missing userStatus");
        }
        const userStatus = response.userStatus;
        const planStatus = userStatus.planStatus;
        const modelConfigs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
        const monthlyCreditsRaw = planStatus?.planInfo?.monthlyPromptCredits;
        const availableCreditsRaw = planStatus?.availablePromptCredits;
        const monthlyCredits = monthlyCreditsRaw !== undefined ? Number(monthlyCreditsRaw) : undefined;
        const availableCredits = availableCreditsRaw !== undefined
            ? Number(availableCreditsRaw)
            : undefined;
        const promptCredits = planStatus &&
            monthlyCredits !== undefined &&
            monthlyCredits > 0 &&
            availableCredits !== undefined
            ? {
                available: availableCredits,
                monthly: monthlyCredits,
                usedPercentage: ((monthlyCredits - availableCredits) / monthlyCredits) * 100,
                remainingPercentage: (availableCredits / monthlyCredits) * 100,
            }
            : undefined;
        const models = modelConfigs
            .filter((config) => config.quotaInfo)
            .map((config) => this.parseModelQuota(config));
        // Use userTier.name as account level (e.g. Free, Pro)
        const planName = userStatus?.userTier?.name;
        return {
            timestamp: new Date(),
            promptCredits,
            models,
            planName,
        };
    }
    parseModelQuota(config) {
        const quotaInfo = config.quotaInfo;
        const remainingFraction = quotaInfo?.remainingFraction;
        let resetTime;
        let timeUntilReset;
        if (!quotaInfo.resetTime || quotaInfo.resetTime === "infinite") {
            resetTime = new Date(8640000000000000); // Far future
            timeUntilReset = 8640000000000000;
        }
        else {
            resetTime = new Date(quotaInfo.resetTime);
            if (isNaN(resetTime.getTime())) {
                console.warn(`[QuotaService] Invalid resetTime format: ${quotaInfo.resetTime}, defaulting to now + 24h`);
                resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            }
            timeUntilReset = resetTime.getTime() - Date.now();
        }
        console.log(`[QuotaService] Model ${config.label}: resetTime=${resetTime.toISOString()}, timeUntilReset=${timeUntilReset}ms`);
        return {
            label: config.label,
            modelId: config.modelOrAlias.model,
            remainingFraction,
            remainingPercentage: remainingFraction !== undefined ? remainingFraction * 100 : undefined,
            isExhausted: remainingFraction === undefined || remainingFraction === 0,
            resetTime,
            timeUntilReset,
            timeUntilResetFormatted: this.formatTimeUntilReset(timeUntilReset),
        };
    }
    formatTimeUntilReset(ms) {
        if (ms <= 0) {
            return "Expired";
        }
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) {
            return `${days}d${hours % 24}h from now`;
        }
        else if (hours > 0) {
            return `${hours}h ${minutes % 60}m from now`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s from now`;
        }
        return `${seconds}s from now`;
    }
    getInvalidCodeInfo(response) {
        const code = response?.code;
        if (code === undefined || code === null) {
            return null;
        }
        const okValues = [0, "0", "OK", "Ok", "ok", "success", "SUCCESS"];
        if (okValues.includes(code)) {
            return null;
        }
        return { code, message: response?.message };
    }
    dispose() {
        this.stopPolling();
        this.httpsAgent.destroy();
        this.httpAgent.destroy();
    }
}
exports.QuotaService = QuotaService;
//# sourceMappingURL=QuotaClient.js.map