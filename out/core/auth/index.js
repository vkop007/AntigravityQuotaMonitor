"use strict";
/**
 * 认证模块导出
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackServer = exports.TokenStorage = exports.AuthState = exports.GoogleAuthService = void 0;
var googleAuthService_1 = require("./googleAuthService");
Object.defineProperty(exports, "GoogleAuthService", { enumerable: true, get: function () { return googleAuthService_1.GoogleAuthService; } });
Object.defineProperty(exports, "AuthState", { enumerable: true, get: function () { return googleAuthService_1.AuthState; } });
var tokenStorage_1 = require("./tokenStorage");
Object.defineProperty(exports, "TokenStorage", { enumerable: true, get: function () { return tokenStorage_1.TokenStorage; } });
var callbackServer_1 = require("./callbackServer");
Object.defineProperty(exports, "CallbackServer", { enumerable: true, get: function () { return callbackServer_1.CallbackServer; } });
__exportStar(require("./constants"), exports);
//# sourceMappingURL=index.js.map