"use strict";
/**
 * Token Secure Storage Service
 * Uses VS Code SecretStorage API to securely store OAuth Tokens
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStorage = void 0;
const constants_1 = require("./constants");
/**
 * Token Storage Service
 * Uses VS Code SecretStorage API to securely store OAuth Tokens
 */
class TokenStorage {
    constructor() {
        this.secretStorage = null;
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TokenStorage.instance) {
            TokenStorage.instance = new TokenStorage();
        }
        return TokenStorage.instance;
    }
    /**
     * Initialize storage service
     * @param context VS Code Extension Context
     */
    initialize(context) {
        this.secretStorage = context.secrets;
    }
    /**
     * Ensure initialized
     */
    ensureInitialized() {
        if (!this.secretStorage) {
            throw new Error("TokenStorage not initialized. Call initialize() first.");
        }
    }
    /**
     * Save Token
     * @param token Token Data
     */
    async saveToken(token) {
        this.ensureInitialized();
        const tokenJson = JSON.stringify(token);
        await this.secretStorage.store(constants_1.TOKEN_STORAGE_KEY, tokenJson);
    }
    /**
     * Retrieve Token
     * @returns Token Data, or null if not exists
     */
    async getToken() {
        this.ensureInitialized();
        const tokenJson = await this.secretStorage.get(constants_1.TOKEN_STORAGE_KEY);
        if (!tokenJson) {
            return null;
        }
        try {
            return JSON.parse(tokenJson);
        }
        catch (e) {
            console.error("Failed to parse stored token:", e);
            return null;
        }
    }
    /**
     * Clear Token
     */
    async clearToken() {
        this.ensureInitialized();
        await this.secretStorage.delete(constants_1.TOKEN_STORAGE_KEY);
    }
    /**
     * Check if Token exists
     * @returns boolean
     */
    async hasToken() {
        const token = await this.getToken();
        return token !== null;
    }
    /**
     * Check if Token is expired
     * @param bufferMs Buffer time in ms (default 5 mins)
     * @returns boolean
     */
    async isTokenExpired(bufferMs = 5 * 60 * 1000) {
        const token = await this.getToken();
        if (!token) {
            return true;
        }
        return Date.now() + bufferMs >= token.expiresAt;
    }
    /**
     * Get valid Access Token
     * If expired, returns null (caller needs to refresh or login)
     * @returns Access Token or null
     */
    async getAccessToken() {
        const token = await this.getToken();
        if (!token) {
            return null;
        }
        // Check if expired (5 minutes early)
        if (await this.isTokenExpired()) {
            return null;
        }
        return token.accessToken;
    }
    /**
     * Get Refresh Token
     * @returns Refresh Token or null
     */
    async getRefreshToken() {
        const token = await this.getToken();
        return token?.refreshToken ?? null;
    }
    /**
     * Update storage with new Access Token (called after refresh)
     * @param accessToken New Access Token
     * @param expiresIn Token validity period (seconds)
     */
    async updateAccessToken(accessToken, expiresIn) {
        const token = await this.getToken();
        if (!token) {
            throw new Error("No existing token to update");
        }
        token.accessToken = accessToken;
        token.expiresAt = Date.now() + expiresIn * 1000;
        await this.saveToken(token);
    }
}
exports.TokenStorage = TokenStorage;
//# sourceMappingURL=tokenStorage.js.map