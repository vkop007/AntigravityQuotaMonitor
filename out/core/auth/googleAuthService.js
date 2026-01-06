"use strict";
/**
 * Google OAuth 2.0 Auth Service
 * Manages Google account login, token refresh, and auth state
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAuthService = exports.AuthState = void 0;
const vscode = require("vscode");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const constants_1 = require("./constants");
const tokenStorage_1 = require("./tokenStorage");
const callbackServer_1 = require("./callbackServer");
/**
 * Auth State Enum
 */
var AuthState;
(function (AuthState) {
    AuthState["NOT_AUTHENTICATED"] = "not_authenticated";
    AuthState["AUTHENTICATING"] = "authenticating";
    AuthState["AUTHENTICATED"] = "authenticated";
    AuthState["TOKEN_EXPIRED"] = "token_expired";
    AuthState["REFRESHING"] = "refreshing";
    AuthState["ERROR"] = "error";
})(AuthState || (exports.AuthState = AuthState = {}));
/**
 * Google OAuth Auth Service
 * Singleton Pattern
 */
class GoogleAuthService {
    constructor() {
        this.callbackServer = null;
        this.context = null;
        this.currentState = AuthState.NOT_AUTHENTICATED;
        this.stateChangeListeners = new Set();
        this.tokenStorage = tokenStorage_1.TokenStorage.getInstance();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!GoogleAuthService.instance) {
            GoogleAuthService.instance = new GoogleAuthService();
        }
        return GoogleAuthService.instance;
    }
    /**
     * Initialize service
     * @param context VS Code extension context
     */
    async initialize(context) {
        console.log("[GoogleAuth] Initializing auth service...");
        this.context = context;
        this.tokenStorage.initialize(context);
        // Check for stored Token
        const hasToken = await this.tokenStorage.hasToken();
        console.log("[GoogleAuth] Has stored token:", hasToken);
        if (hasToken) {
            const isExpired = await this.tokenStorage.isTokenExpired();
            console.log("[GoogleAuth] Token expired:", isExpired);
            if (isExpired) {
                // Attempt to refresh Token
                try {
                    console.log("[GoogleAuth] Attempting to refresh expired token...");
                    await this.refreshToken();
                    console.log("[GoogleAuth] Token refreshed successfully");
                }
                catch (e) {
                    // Refresh failed, but refresh token might still be valid
                    // Set to AUTHENTICATED, retry refresh on next request
                    console.warn("[GoogleAuth] Token refresh failed during init, will retry later:", e);
                }
            }
            // As long as there is a stored token (including refresh token), consider as authenticated
            // getValidAccessToken() will try to refresh again later
            this.setState(AuthState.AUTHENTICATED);
            console.log("[GoogleAuth] Set state to AUTHENTICATED (has refresh token)");
        }
        else {
            this.setState(AuthState.NOT_AUTHENTICATED);
            console.log("[GoogleAuth] No stored token, user needs to login");
        }
    }
    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return this.currentState === AuthState.AUTHENTICATED;
    }
    /**
     * Get full auth state
     */
    getAuthState() {
        return {
            state: this.currentState,
            error: this.lastError,
            email: this.userEmail,
        };
    }
    /**
     * Initiate Google login flow
     * @returns Login success?
     */
    async login() {
        console.log("[GoogleAuth] Login initiated, current state:", this.currentState);
        if (this.currentState === AuthState.AUTHENTICATING) {
            console.log("[GoogleAuth] Already authenticating, skipping");
            return false; // Login in progress
        }
        try {
            this.setState(AuthState.AUTHENTICATING);
            // Generate state parameter (CSRF protection)
            const state = crypto.randomBytes(32).toString("hex");
            console.log("[GoogleAuth] Generated state for CSRF protection");
            // Generate PKCE code verifier and challenge
            const codeVerifier = crypto.randomBytes(32).toString("base64url");
            const codeChallenge = crypto
                .createHash("sha256")
                .update(codeVerifier)
                .digest("base64url");
            console.log("[GoogleAuth] Generated PKCE code challenge");
            // Start callback server
            this.callbackServer = new callbackServer_1.CallbackServer();
            // Try to load icon
            try {
                if (this.context) {
                    const iconPath = path.join(this.context.extensionPath, "icon.png");
                    if (fs.existsSync(iconPath)) {
                        const iconBuffer = fs.readFileSync(iconPath);
                        const iconBase64 = `data:image/png;base64,${iconBuffer.toString("base64")}`;
                        this.callbackServer.setIcon(iconBase64);
                        console.log("[GoogleAuth] Loaded plugin icon for callback page");
                    }
                }
            }
            catch (iconError) {
                console.warn("[GoogleAuth] Failed to load icon for callback page:", iconError);
            }
            // Wait for server start and get port
            await this.callbackServer.startServer();
            // Get redirect URI (server started, port assigned)
            const redirectUri = this.callbackServer.getRedirectUri();
            console.log("[GoogleAuth] Callback server started, redirect URI:", redirectUri);
            // Build auth URL
            const authUrl = this.buildAuthUrl(redirectUri, state, codeChallenge);
            console.log("[GoogleAuth] Opening browser for authorization...");
            // Start waiting for callback (request handler set)
            const callbackPromise = this.callbackServer.waitForCallback(state);
            // Open auth page in browser
            await vscode.env.openExternal(vscode.Uri.parse(authUrl));
            // Wait for callback
            console.log("[GoogleAuth] Waiting for OAuth callback...");
            const result = await callbackPromise;
            console.log("[GoogleAuth] Received authorization code, exchanging for token...");
            // Exchange authorization code for Token
            const tokenData = await this.exchangeCodeForToken(result.code, redirectUri, codeVerifier);
            console.log("[GoogleAuth] Token exchange successful, expires at:", new Date(tokenData.expiresAt).toISOString());
            // Save Token
            await this.tokenStorage.saveToken(tokenData);
            console.log("[GoogleAuth] Token saved to secure storage");
            this.setState(AuthState.AUTHENTICATED);
            vscode.window.showInformationMessage("Signed in to Google successfully!");
            return true;
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("[GoogleAuth] Login failed:", errorMessage);
            if (e instanceof Error && e.stack) {
                console.error("[GoogleAuth] Stack:", e.stack);
            }
            this.lastError = errorMessage;
            this.setState(AuthState.ERROR);
            vscode.window.showErrorMessage(`Google Login Failed: ${errorMessage}`);
            return false;
        }
        finally {
            // Ensure server is closed
            if (this.callbackServer) {
                this.callbackServer.stop();
                this.callbackServer = null;
                console.log("[GoogleAuth] Callback server stopped");
            }
        }
    }
    /**
     * Logout and clear Token
     */
    async logout() {
        await this.tokenStorage.clearToken();
        this.userEmail = undefined;
        this.lastError = undefined;
        this.setState(AuthState.NOT_AUTHENTICATED);
        vscode.window.showInformationMessage("Signed out of Google account");
    }
    /**
     * Get valid Access Token
     * Auto-refreshes if Token expired
     * @throws If valid Token cannot be obtained
     */
    async getValidAccessToken() {
        console.log("[GoogleAuth] Getting valid access token...");
        const token = await this.tokenStorage.getToken();
        if (!token) {
            console.log("[GoogleAuth] No token found");
            this.setState(AuthState.NOT_AUTHENTICATED);
            throw new Error("Not authenticated");
        }
        // Check if refresh needed (5 minutes early)
        const isExpired = await this.tokenStorage.isTokenExpired();
        if (isExpired) {
            console.log("[GoogleAuth] Token expired or expiring soon, refreshing...");
            await this.refreshToken();
        }
        const accessToken = await this.tokenStorage.getAccessToken();
        if (!accessToken) {
            console.error("[GoogleAuth] Failed to get access token after refresh");
            throw new Error("Failed to get access token");
        }
        console.log("[GoogleAuth] Access token obtained:", this.maskToken(accessToken));
        return accessToken;
    }
    /**
     * Listen for auth state changes
     * @param callback State change callback
     * @returns Disposable
     */
    onAuthStateChange(callback) {
        this.stateChangeListeners.add(callback);
        return {
            dispose: () => {
                this.stateChangeListeners.delete(callback);
            },
        };
    }
    /**
     * Get current user email
     * @returns User email, undefined if not logged in or failed
     */
    getUserEmail() {
        return this.userEmail;
    }
    /**
     * Fetch user info (including email)
     * @param accessToken OAuth access token
     * @returns User info
     */
    async fetchUserInfo(accessToken) {
        console.log("[GoogleAuth] Fetching user info...");
        return new Promise((resolve, reject) => {
            const options = {
                hostname: "www.googleapis.com",
                port: 443,
                path: "/oauth2/v2/userinfo",
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            };
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        if (res.statusCode &&
                            res.statusCode >= 200 &&
                            res.statusCode < 300) {
                            const response = JSON.parse(data);
                            console.log("[GoogleAuth] User info fetched, email:", response.email);
                            // Cache email
                            this.userEmail = response.email;
                            resolve(response);
                        }
                        else {
                            reject(new Error(`Failed to fetch user info: ${res.statusCode} - ${data}`));
                        }
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse user info response: ${data}`));
                    }
                });
            });
            req.on("error", (e) => {
                reject(e);
            });
            req.end();
        });
    }
    /**
     * Refresh Token
     */
    async refreshToken() {
        console.log("[GoogleAuth] Refreshing token...");
        const previousState = this.currentState;
        this.setState(AuthState.REFRESHING);
        try {
            const refreshToken = await this.tokenStorage.getRefreshToken();
            if (!refreshToken) {
                console.error("[GoogleAuth] No refresh token available");
                throw new Error("No refresh token available");
            }
            console.log("[GoogleAuth] Using refresh token:", this.maskToken(refreshToken));
            const params = new URLSearchParams({
                client_id: constants_1.GOOGLE_CLIENT_ID,
                client_secret: constants_1.GOOGLE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            });
            console.log("[GoogleAuth] Sending token refresh request to Google...");
            const response = await this.makeTokenRequest(params);
            console.log("[GoogleAuth] Token refresh response received, expires_in:", response.expires_in);
            // Update access token
            await this.tokenStorage.updateAccessToken(response.access_token, response.expires_in);
            console.log("[GoogleAuth] Access token updated successfully");
            this.setState(AuthState.AUTHENTICATED);
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("[GoogleAuth] Token refresh failed:", errorMessage);
            this.lastError = errorMessage;
            this.setState(AuthState.TOKEN_EXPIRED);
            throw e;
        }
    }
    /**
     * Mask token, show first 6 and last 4 chars only
     */
    maskToken(token) {
        if (token.length <= 14) {
            return "***";
        }
        return `${token.substring(0, 6)}***${token.substring(token.length - 4)}`;
    }
    /**
     * Build Authorization URL
     */
    buildAuthUrl(redirectUri, state, codeChallenge) {
        const params = new URLSearchParams({
            client_id: constants_1.GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: constants_1.GOOGLE_SCOPES,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            access_type: "offline",
            prompt: "consent",
        });
        return `${constants_1.GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
    }
    /**
     * Exchange authorization code for Token
     */
    async exchangeCodeForToken(code, redirectUri, codeVerifier) {
        const params = new URLSearchParams({
            client_id: constants_1.GOOGLE_CLIENT_ID,
            client_secret: constants_1.GOOGLE_CLIENT_SECRET,
            code: code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
        });
        const response = await this.makeTokenRequest(params);
        if (!response.refresh_token) {
            throw new Error("No refresh token in response");
        }
        return {
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            expiresAt: Date.now() + response.expires_in * 1000,
            tokenType: response.token_type,
            scope: response.scope,
        };
    }
    /**
     * Send Token Request
     */
    makeTokenRequest(params) {
        return new Promise((resolve, reject) => {
            const postData = params.toString();
            const url = new URL(constants_1.GOOGLE_TOKEN_ENDPOINT);
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData),
                },
            };
            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.error) {
                            reject(new Error(`Token error: ${response.error} - ${response.error_description}`));
                        }
                        else {
                            resolve(response);
                        }
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse token response: ${data}`));
                    }
                });
            });
            req.on("error", (e) => {
                reject(e);
            });
            req.write(postData);
            req.end();
        });
    }
    /**
     * Set state and notify listeners
     */
    setState(state) {
        const previousState = this.currentState;
        this.currentState = state;
        console.log(`[GoogleAuth] State changed: ${previousState} -> ${state}`);
        const stateInfo = this.getAuthState();
        this.stateChangeListeners.forEach((listener) => {
            try {
                listener(stateInfo);
            }
            catch (e) {
                console.error("[GoogleAuth] Auth state listener error:", e);
            }
        });
    }
}
exports.GoogleAuthService = GoogleAuthService;
//# sourceMappingURL=googleAuthService.js.map