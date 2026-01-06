"use strict";
/**
 * Google OAuth 2.0 Configuration Constants
 *
 * Note: For native applications (desktop apps), the Client Secret is not considered confidential.
 * Reference: https://developers.google.com/identity/protocols/oauth2/native-app
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRY_DELAY_MS = exports.MAX_RETRIES = exports.API_TIMEOUT_MS = exports.AUTH_TIMEOUT_MS = exports.CALLBACK_PATH = exports.CALLBACK_HOST = exports.FETCH_AVAILABLE_MODELS_PATH = exports.LOAD_CODE_ASSIST_PATH = exports.CLOUD_CODE_API_BASE = exports.TOKEN_STORAGE_KEY = exports.GOOGLE_SCOPES = exports.GOOGLE_TOKEN_ENDPOINT = exports.GOOGLE_AUTH_ENDPOINT = exports.GOOGLE_CLIENT_SECRET = exports.GOOGLE_CLIENT_ID = void 0;
// Google Cloud Code OAuth Client ID
// This is the official OAuth client credential used by Google Cloud Code
exports.GOOGLE_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
// Google Cloud Code OAuth Client Secret
// For installed applications, this secret is not considered confidential
exports.GOOGLE_CLIENT_SECRET = "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";
// OAuth 2.0 Endpoints
exports.GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
exports.GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
// OAuth Scopes
// Scopes required to access Cloud Code API
exports.GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
].join(" ");
// Token Storage Key (for VS Code SecretStorage)
exports.TOKEN_STORAGE_KEY = "antigravity-quota-watcher.google-oauth-token";
// Google Cloud Code API Endpoints
exports.CLOUD_CODE_API_BASE = "https://cloudcode-pa.googleapis.com";
exports.LOAD_CODE_ASSIST_PATH = "/v1internal:loadCodeAssist";
exports.FETCH_AVAILABLE_MODELS_PATH = "/v1internal:fetchAvailableModels";
// OAuth Callback Server Configuration
exports.CALLBACK_HOST = "127.0.0.1";
exports.CALLBACK_PATH = "/callback";
// Timeout Configuration (ms)
exports.AUTH_TIMEOUT_MS = 60000; // 1 minute
exports.API_TIMEOUT_MS = 10000; // 10 seconds
// Retry Configuration
exports.MAX_RETRIES = 3;
exports.RETRY_DELAY_MS = 1000;
//# sourceMappingURL=constants.js.map