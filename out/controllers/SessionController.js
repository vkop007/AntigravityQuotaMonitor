"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const PortDetector_1 = require("../services/discovery/PortDetector");
const AntigravityClient_1 = require("../services/api/AntigravityClient");
class SessionController {
    constructor() {
        this.cachedData = null;
        this.isInitialized = false;
        this.isReconnecting = false;
        this.updateListeners = [];
    }
    static shared() {
        if (!SessionController.instance) {
            SessionController.instance = new SessionController();
        }
        return SessionController.instance;
    }
    async initialize(context) {
        if (this.isInitialized)
            return true;
        try {
            this.portDetectionService = new PortDetector_1.PortDetectionService(context);
            const detectionResult = await this.portDetectionService.detectPort();
            if (detectionResult?.port && detectionResult.csrfToken) {
                this.client = new AntigravityClient_1.AntigravityClient(detectionResult.port, detectionResult.csrfToken, detectionResult.httpPort);
                this.client.onQuotaUpdate((snapshot) => {
                    this.cachedData = this.transformSnapshotToQuotaData(snapshot);
                    this.notifyListeners();
                });
                this.client.onError(async (error) => {
                    const msg = error.message;
                    if (msg.includes("ECONNREFUSED") ||
                        msg.includes("ETIMEDOUT") ||
                        msg.includes("socket hang up") ||
                        msg.includes("network")) {
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
        }
        catch (error) {
            return false;
        }
    }
    onDataUpdate(listener) {
        this.updateListeners.push(listener);
        if (this.cachedData) {
            try {
                listener(this.cachedData);
            }
            catch (e) { }
        }
    }
    notifyListeners() {
        if (this.cachedData) {
            this.updateListeners.forEach((l) => {
                try {
                    l(this.cachedData);
                }
                catch (e) { }
            });
        }
    }
    async fetchQuotaData() {
        if (!this.isInitialized)
            return null;
        if (!this.cachedData && this.client) {
            await this.client.quickRefresh();
        }
        return this.cachedData;
    }
    transformSnapshotToQuotaData(snapshot) {
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
            return {
                id: model.modelId,
                name: model.label || model.modelId,
                pct: model.remainingPercentage || 0,
                time: formatTime(model.timeUntilReset),
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
        try {
            if (!this.portDetectionService)
                return;
            const result = await this.portDetectionService.detectPort();
            if (result?.port && result.csrfToken && this.client) {
                this.client.setPorts(result.port, result.httpPort);
                this.client.setAuthInfo(undefined, result.csrfToken);
                await this.client.quickRefresh();
            }
        }
        catch (e) {
        }
        finally {
            this.isReconnecting = false;
        }
    }
    stop() {
        if (this.client) {
            this.client.stopPolling();
        }
    }
}
exports.SessionController = SessionController;
//# sourceMappingURL=SessionController.js.map