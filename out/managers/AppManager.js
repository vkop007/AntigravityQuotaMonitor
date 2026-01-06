"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppManager = void 0;
const PortDetector_1 = require("../core/detectors/PortDetector");
const QuotaClient_1 = require("../core/client/QuotaClient");
class AppManager {
    constructor() {
        this.cachedData = null;
        this.isInitialized = false;
        this.isReconnecting = false;
        this.updateListeners = [];
    }
    static getInstance() {
        if (!AppManager.instance) {
            AppManager.instance = new AppManager();
        }
        return AppManager.instance;
    }
    /**
     * Initialize AppManager with real port detection and quota service
     */
    async initialize(context) {
        if (this.isInitialized) {
            return true;
        }
        console.log("[AppManager] Initializing...");
        try {
            this.portDetectionService = new PortDetector_1.PortDetectionService(context);
            // Auto-detect port
            const detectionResult = await this.portDetectionService.detectPort();
            if (detectionResult &&
                detectionResult.port &&
                detectionResult.csrfToken) {
                console.log("[AppManager] Port detection successful", detectionResult);
                // Initialize QuotaService
                this.quotaService = new QuotaClient_1.QuotaService(detectionResult.port, detectionResult.csrfToken, detectionResult.httpPort);
                // Set API method to local GetUserStatus by default
                this.quotaService.setApiMethod(QuotaClient_1.QuotaApiMethod.GET_USER_STATUS);
                // Register update callback
                this.quotaService.onQuotaUpdate((snapshot) => {
                    console.log("[AppManager] Received quota update");
                    this.cachedData = this.transformSnapshotToQuotaData(snapshot);
                    this.notifyListeners(); // Notify subscribers
                });
                this.quotaService.onError(async (error) => {
                    console.error("[AppManager] Quota service error:", error);
                    // Check for network/connection errors for auto-reconnect
                    const msg = error.message;
                    if (msg.includes("ECONNREFUSED") ||
                        msg.includes("ETIMEDOUT") ||
                        msg.includes("socket hang up") ||
                        msg.includes("network")) {
                        await this.tryReconnect();
                        return;
                    }
                    // If error is auth-related (simplified heuristic), set needsLogin
                    if (msg.includes("quota info") || msg.includes("not logged in")) {
                        this.cachedData = {
                            models: [],
                            needsLogin: true,
                        };
                        this.notifyListeners();
                    }
                });
                // Start polling (every 15s)
                await this.quotaService.startPolling(15000);
                // Trigger an immediate refresh
                await this.quotaService.quickRefresh();
                this.isInitialized = true;
                return true;
            }
            else {
                console.error("[AppManager] Failed to detect port/CSRF token");
                return false;
            }
        }
        catch (error) {
            console.error("[AppManager] Initialization failed:", error);
            return false;
        }
    }
    onDataUpdate(listener) {
        this.updateListeners.push(listener);
        // Immediately fire if we have data
        if (this.cachedData) {
            try {
                listener(this.cachedData);
            }
            catch (e) {
                console.error("Listener error", e);
            }
        }
    }
    notifyListeners() {
        if (this.cachedData) {
            this.updateListeners.forEach((l) => {
                try {
                    l(this.cachedData);
                }
                catch (e) {
                    console.error(e);
                }
            });
        }
    }
    /**
     * Fetch quota data (returns cached data from QuotaService)
     */
    async fetchQuotaData() {
        if (!this.isInitialized) {
            console.warn("[AppManager] fetchQuotaData called before initialization completed");
            return null;
        }
        // If we have a service but no data yet, try a quick refresh
        if (!this.cachedData && this.quotaService) {
            await this.quotaService.quickRefresh();
        }
        return this.cachedData;
    }
    transformSnapshotToQuotaData(snapshot) {
        // Helper to format time
        const formatTime = (ms) => {
            if (ms <= 0)
                return "Expired";
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            if (hours > 0)
                return `${hours}h ${minutes % 60}m`;
            return `${minutes}m`;
        };
        const models = (snapshot.models || []).map((model) => {
            const timeStr = formatTime(model.timeUntilReset);
            const pct = model.remainingPercentage || 0;
            return {
                id: model.modelId,
                name: model.label || model.modelId,
                pct: pct,
                time: timeStr,
                resetTime: model.timeUntilReset > 0 ? Date.now() + model.timeUntilReset : 0,
            };
        });
        return {
            planName: snapshot.planName,
            models: models,
        };
    }
    async tryReconnect() {
        if (this.isReconnecting)
            return;
        this.isReconnecting = true;
        console.log("[AppManager] Attempting to reconnect/re-detect process...");
        try {
            if (!this.portDetectionService) {
                this.isReconnecting = false;
                return;
            }
            const result = await this.portDetectionService.detectPort();
            if (result && result.port && result.csrfToken && this.quotaService) {
                console.log("[AppManager] Reconnection successful", result);
                this.quotaService.setPorts(result.port, result.httpPort);
                this.quotaService.setAuthInfo(undefined, result.csrfToken);
                // Trigger immediate refresh after updating connection info
                await this.quotaService.quickRefresh();
            }
            else {
                console.warn("[AppManager] Reconnection failed: could not detect process");
            }
        }
        catch (e) {
            console.error("[AppManager] Reconnection error:", e);
        }
        finally {
            this.isReconnecting = false;
        }
    }
    stop() {
        if (this.quotaService) {
            this.quotaService.stopPolling();
        }
    }
}
exports.AppManager = AppManager;
//# sourceMappingURL=AppManager.js.map