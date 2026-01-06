"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Webview = void 0;
const vscode = require("vscode");
const AppManager_1 = require("../managers/AppManager");
class Webview {
    constructor(panel, extensionUri, context) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;
        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    static createOrShow(extensionUri, context) {
        // If we already have a panel, show it.
        if (Webview.currentPanel) {
            Webview.currentPanel._panel.reveal(vscode.ViewColumn.Active);
            return;
        }
        // Create a new panel in the active column (appears as overlay)
        const panel = vscode.window.createWebviewPanel("antigravityQuota", "Antigravity Quota", {
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: false,
        }, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
            retainContextWhenHidden: true,
        });
        Webview.currentPanel = new Webview(panel, extensionUri, context);
        Webview.currentPanel._startPolling();
    }
    dispose() {
        Webview.currentPanel = undefined;
        // Clean up our resources
        this._panel.dispose();
        // Stop polling in AppManager when panel is closed (optional but good)
        AppManager_1.AppManager.getInstance().stop();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async _startPolling() {
        const appManager = AppManager_1.AppManager.getInstance();
        // Pass context to initialize
        await appManager.initialize(this._context);
        // Initial fetch
        await this._fetchAndUpdate();
        // Poll for data every 5 seconds
        const interval = setInterval(async () => {
            if (!Webview.currentPanel) {
                clearInterval(interval);
                return;
            }
            await this._fetchAndUpdate();
        }, 5000);
    }
    async _fetchAndUpdate() {
        const appManager = AppManager_1.AppManager.getInstance();
        const data = await appManager.fetchQuotaData();
        if (data) {
            this._panel.webview.postMessage({ type: "update", payload: data });
        }
    }
    _getHtmlForWebview(webview) {
        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, "media", "styles.css");
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${stylesMainUri}" rel="stylesheet">
    <title>Antigravity Quota Monitor</title>
</head>
<body>
    <div class="modal-overlay">
        <div class="container">
            <div class="header">
                <h2>Antigravity Model Quota <span class="header-subtitle">(Google AI Pro)</span></h2>
            </div>
            
            <table class="quota-table">
                <thead>
                    <tr>
                        <th class="col-model">Model</th>
                        <th class="col-status">Status</th>
                        <th class="col-reset">Reset</th>
                    </tr>
                </thead>
                <tbody id="quota-tbody">
                     <!-- Rows will be populated by JS -->
                </tbody>
            </table>

            <div class="footer-bar" id="footer-bar">
                <!-- Dynamic Footer Items -->
            </div>
        </div>
    </div>

    <script>
        const initialData = []; 

        // Initial Render
        renderRows(initialData);

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    updateQuotas(message.payload);
                    break;
            }
        });

        function formatTime(ms) {
            if (ms <= 0) return "Now";
            /* If passing string like "3h 4m", just return it + " from now" */
            if (typeof ms === 'string') {
                if (ms === 'Expired') return 'Now';
                if (ms.includes('from now')) return ms;
                return ms + ' from now';
            }
            
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);

            if (hours > 0) return \`\${hours}h \${minutes % 60}m from now\`;
            return \`\${minutes}m from now\`;
        }

        function renderRows(dataList) {
            const tbody = document.getElementById('quota-tbody');
            tbody.innerHTML = '';
            
            if (!dataList || dataList.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity:0.6;">Loading data...</td></tr>';
                 return;
            }

            dataList.forEach(item => {
                const tr = document.createElement('tr');
                tr.id = 'row-' + item.id;
                
                const isDepleted = item.pct <= 0;
                
                let statusHtml = '';
                if (isDepleted) {
                    statusHtml = '<span class="status-depleted"><span class="warning-icon">⚠️</span> Depleted</span>';
                } else {
                    statusHtml = \`<span class="status-value">\${item.pct.toFixed(0)}%</span>\`;
                }

                const timeStr = formatTime(item.time);

                tr.innerHTML = \`
                    <td class="col-model">\${item.name}</td>
                    <td class="col-status">\${statusHtml}</td>
                    <td class="col-reset">\${timeStr}</td>
                \`;
                tbody.appendChild(tr);
            });
            
            updateFooter(dataList);
        }

        function updateFooter(dataList) {
            const footer = document.getElementById('footer-bar');
            footer.innerHTML = '';
            
            // Define checks for footer models
            // Check both ID and Name
            const check = (item, keywords) => {
                const text = (item.id + ' ' + item.name).toLowerCase();
                return keywords.every(k => text.includes(k));
            };

            const footerConfigs = [
                { label: 'Claude', match: ['claude', 'sonnet'] },
                { label: 'G Pro', match: ['gemini', 'pro'] },
                { label: 'G Flash', match: ['gemini', 'flash'] }
            ];

            // Use the first match for each config
            footerConfigs.forEach(conf => {
                const item = dataList.find(d => check(d, conf.match));
                const pct = item ? Math.round(item.pct) : 0;
                
                const div = document.createElement('div');
                div.className = 'footer-item';
                const dotColor = pct > 0 ? '#4CAF50' : '#666'; 
                
                div.innerHTML = \`
                    <div class="dot" style="background-color: \${dotColor}"></div>
                    <span>\${conf.label}: \${pct}%</span>
                \`;
                footer.appendChild(div);
            });
        }

        function updateQuotas(data) {
            // Update Header Plan Name
            if (data.planName) {
                const limitEl = document.querySelector('.header-subtitle');
                if (limitEl) limitEl.textContent = '(' + data.planName + ')';
            }

            if (data.models) {
                // Pass the models directly to renderRows
                // Ensure time string handling if needed (the new ApiService sends formatted strings, but check types)
                renderRows(data.models);
            }
        }

        // Close on overlay click
        document.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                // Post message to close? Webviews can't self-close easily without command
            }
        });
    </script>
</body>
</html>`;
    }
}
exports.Webview = Webview;
//# sourceMappingURL=Webview.js.map