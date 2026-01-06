"use strict";
/**
 * OAuth Callback HTTP Server
 * Starts a temporary local server to receive Google OAuth callback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackServer = void 0;
const http = require("http");
const constants_1 = require("./constants");
/**
 * Callback Server Class
 * Starts a temporary HTTP server to receive OAuth callback
 */
class CallbackServer {
    constructor() {
        this.server = null;
        this.port = 0;
        this.iconBase64 = null;
    }
    /**
     * Set icon displayed on the page (Base64)
     */
    setIcon(base64) {
        this.iconBase64 = base64;
    }
    /**
     * Get Callback URL
     * @returns Callback URL
     */
    getRedirectUri() {
        if (this.port === 0) {
            throw new Error("Server not started");
        }
        return `http://${constants_1.CALLBACK_HOST}:${this.port}${constants_1.CALLBACK_PATH}`;
    }
    /**
     * Start server listening
     * Returns after server starts listening, then call getRedirectUri() to get callback address
     */
    startServer() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer();
            // Listen on random port
            this.server.listen(0, constants_1.CALLBACK_HOST, () => {
                const address = this.server.address();
                if (typeof address === "object" && address !== null) {
                    this.port = address.port;
                    console.log(`OAuth callback server listening on port ${this.port}`);
                    resolve();
                }
                else {
                    reject(new Error("Failed to get server address"));
                }
            });
            // Handle server error
            this.server.on("error", (err) => {
                reject(err);
            });
        });
    }
    /**
     * Wait for OAuth callback
     * Must call startServer() first
     * @param expectedState Expected state parameter (CSRF protection)
     * @returns Promise<CallbackResult> Callback result
     */
    waitForCallback(expectedState) {
        if (this.port === 0) {
            return Promise.reject(new Error("Server not started. Call startServer() first."));
        }
        return new Promise((resolve, reject) => {
            // Create timeout timer
            const timeout = setTimeout(() => {
                this.stop();
                reject(new Error("OAuth callback timeout"));
            }, constants_1.AUTH_TIMEOUT_MS);
            // Set request handler
            this.server.on("request", (req, res) => {
                const url = new URL(req.url || "", `http://${constants_1.CALLBACK_HOST}`);
                // Handle callback path only
                if (url.pathname !== constants_1.CALLBACK_PATH) {
                    res.writeHead(404);
                    res.end("Not Found");
                    return;
                }
                // Parse parameters
                const code = url.searchParams.get("code");
                const state = url.searchParams.get("state");
                const error = url.searchParams.get("error");
                const errorDescription = url.searchParams.get("error_description");
                // Clear timeout
                clearTimeout(timeout);
                // Check for error
                if (error) {
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(this.getErrorHtml(error, errorDescription || "Unknown error"));
                    this.stop();
                    reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
                    return;
                }
                // Verify authorization code
                if (!code) {
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(this.getErrorHtml("missing_code", "No authorization code received"));
                    this.stop();
                    reject(new Error("No authorization code received"));
                    return;
                }
                // Verify state (CSRF protection)
                if (state !== expectedState) {
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(this.getErrorHtml("invalid_state", "Invalid state parameter"));
                    this.stop();
                    reject(new Error("Invalid state parameter (CSRF protection)"));
                    return;
                }
                // Return success page
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(this.getSuccessHtml());
                // Stop server and return result
                this.stop();
                resolve({ code, state });
            });
        });
    }
    /**
     * Stop server
     */
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }
    /**
     * Generate success HTML page
     */
    getSuccessHtml() {
        return `
<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录成功 - Antigravity Quota Watcher</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            border: "hsl(var(--border))",
            input: "hsl(var(--input))",
            ring: "hsl(var(--ring))",
            background: "hsl(var(--background))",
            foreground: "hsl(var(--foreground))",
            primary: {
              DEFAULT: "hsl(var(--primary))",
              foreground: "hsl(var(--primary-foreground))",
            },
            muted: {
              DEFAULT: "hsl(var(--muted))",
              foreground: "hsl(var(--muted-foreground))",
            },
            card: {
              DEFAULT: "hsl(var(--card))",
              foreground: "hsl(var(--card-foreground))",
            },
          },
        },
      },
    }
  </script>
  <style>
    :root {
      --background: 240 10% 3.9%;
      --foreground: 0 0% 98%;
      --card: 240 10% 3.9%;
      --card-foreground: 0 0% 98%;
      --primary: 0 0% 98%;
      --primary-foreground: 240 5.9% 10%;
      --muted: 240 3.7% 15.9%;
      --muted-foreground: 240 5% 64.9%;
      --border: 240 3.7% 15.9%;
    }
  </style>
</head>
<body class="bg-background text-foreground flex items-center justify-center min-h-screen antialiased selection:bg-primary/20">
  <div class="w-full max-w-md p-4 animate-in fade-in zoom-in duration-500">
    <div class="bg-card border border-border rounded-xl shadow-2xl p-8 text-center relative overflow-hidden">
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/10 blur-[50px] rounded-full -z-10"></div>
      
      <div class="flex flex-col items-center mb-8">
        ${this.iconBase64
            ? `<img src="${this.iconBase64}" class="h-20 w-auto drop-shadow-xl" alt="Logo">`
            : ""}
      </div>

      <h3 class="text-sm font-medium text-muted-foreground tracking-wider mb-2">Antigravity Quota Watcher</h3>
      <h1 class="text-3xl font-bold tracking-tight mb-4">登录成功</h1>
      <p class="text-muted-foreground leading-relaxed">
        您可以关闭此页面并返回 <span class="font-semibold text-foreground">Antigravity</span>。
      </p>
      <p class="text-muted-foreground leading-relaxed">
        Login successful, you can close this page and return to Antigravity.
      </p>
    </div>
  </div>
</body>
</html>`;
    }
    /**
     * Generate error HTML page
     */
    getErrorHtml(error, description) {
        return `
<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录失败 - Antigravity Quota Watcher</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            border: "hsl(var(--border))",
            input: "hsl(var(--input))",
            ring: "hsl(var(--ring))",
            background: "hsl(var(--background))",
            foreground: "hsl(var(--foreground))",
            destructive: {
              DEFAULT: "hsl(var(--destructive))",
              foreground: "hsl(var(--destructive-foreground))",
            },
            muted: {
              DEFAULT: "hsl(var(--muted))",
              foreground: "hsl(var(--muted-foreground))",
            },
            card: {
              DEFAULT: "hsl(var(--card))",
              foreground: "hsl(var(--card-foreground))",
            },
          },
        },
      },
    }
  </script>
  <style>
    :root {
      --background: 240 10% 3.9%;
      --foreground: 0 0% 98%;
      --card: 240 10% 3.9%;
      --card-foreground: 0 0% 98%;
      --destructive: 0 62.8% 30.6%;
      --destructive-foreground: 0 0% 98%;
      --muted: 240 3.7% 15.9%;
      --muted-foreground: 240 5% 64.9%;
      --border: 240 3.7% 15.9%;
    }
  </style>
</head>
<body class="bg-background text-foreground flex items-center justify-center min-h-screen antialiased selection:bg-destructive/20">
  <div class="w-full max-w-md p-4 animate-in fade-in zoom-in duration-500">
    <div class="bg-card border border-border rounded-xl shadow-2xl p-8 text-center relative overflow-hidden">
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-destructive/10 blur-[50px] rounded-full -z-10"></div>
      
      <div class="flex flex-col items-center mb-8">
        ${this.iconBase64
            ? `<img src="${this.iconBase64}" class="h-20 w-auto mb-6 drop-shadow-xl opacity-50 grayscale" alt="Logo">`
            : ""}
        <div class="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 18 18"/></svg>
        </div>
      </div>

      <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Antigravity Quota Watcher</h3>
      <h1 class="text-3xl font-bold tracking-tight mb-4">登录失败</h1>
      <p class="text-muted-foreground leading-relaxed mb-4">
        ${this.escapeHtml(description)}
      </p>
      <div class="bg-muted/50 rounded-lg p-3 text-xs font-mono text-muted-foreground border border-border/50">
          Error Code: ${this.escapeHtml(error)}
      </div>
    </div>
  </div>
</body>
</html>`;
    }
    /**
     * HTML Escape
     */
    escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
exports.CallbackServer = CallbackServer;
//# sourceMappingURL=callbackServer.js.map