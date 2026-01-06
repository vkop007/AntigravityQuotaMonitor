"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Webview = void 0;
const vscode = require("vscode");
const SessionController_1 = require("../controllers/SessionController");
class Webview {
    constructor(panel, extensionUri, context) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    static createOrShow(extensionUri, context) {
        if (Webview.currentPanel) {
            Webview.currentPanel._panel.reveal(vscode.ViewColumn.Active);
            return;
        }
        const panel = vscode.window.createWebviewPanel("antigravityQuota", "Antigravity Quota", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
            retainContextWhenHidden: true,
        });
        Webview.currentPanel = new Webview(panel, extensionUri, context);
        Webview.currentPanel._startPolling();
    }
    dispose() {
        Webview.currentPanel = undefined;
        this._panel.dispose();
        SessionController_1.SessionController.shared().stop();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x)
                x.dispose();
        }
    }
    async _startPolling() {
        const controller = SessionController_1.SessionController.shared();
        await controller.initialize(this._context);
        await this._fetchAndUpdate();
        const interval = setInterval(async () => {
            if (!Webview.currentPanel) {
                clearInterval(interval);
                return;
            }
            await this._fetchAndUpdate();
        }, 5000);
    }
    async _fetchAndUpdate() {
        const controller = SessionController_1.SessionController.shared();
        const data = await controller.fetchQuotaData();
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
                <tbody id="quota-tbody"></tbody>
            </table>
            <div class="footer-bar" id="footer-bar"></div>
        </div>
    </div>
    <script>
        renderRows([]);
        window.addEventListener('message', event => {
            if (event.data.type === 'update') updateQuotas(event.data.payload);
        });

        function formatTime(ms) {
            if (ms <= 0) return "Now";
            if (typeof ms === 'string') {
                if (ms === 'Expired') return 'Now';
                return ms.includes('from now') ? ms : ms + ' from now';
            }
            const mins = Math.floor(ms / 60000);
            const hrs = Math.floor(mins / 60);
            return hrs > 0 ? \`\${hrs}h \${mins % 60}m from now\` : \`\${mins}m from now\`;
        }

        function renderRows(dataList) {
            const tbody = document.getElementById('quota-tbody');
            tbody.innerHTML = dataList && dataList.length ? '' : '<tr><td colspan="3" style="text-align:center; opacity:0.6;">Loading data...</td></tr>';
            if (!dataList) return;

            dataList.forEach(item => {
                const tr = document.createElement('tr');
                tr.id = 'row-' + item.id;
                const statusHtml = item.pct <= 0 ? '<span class="status-depleted"><span class="warning-icon">⚠️</span> Depleted</span>' : \`<span class="status-value">\${item.pct.toFixed(0)}%</span>\`;
                tr.innerHTML = \`<td class="col-model">\${item.name}</td><td class="col-status">\${statusHtml}</td><td class="col-reset">\${formatTime(item.time)}</td>\`;
                tbody.appendChild(tr);
            });
            updateFooter(dataList);
        }

        function updateFooter(dataList) {
            const footer = document.getElementById('footer-bar');
            footer.innerHTML = '';
            const check = (item, keywords) => {
                const text = (item.id + ' ' + item.name).toLowerCase();
                return keywords.every(k => text.includes(k));
            };
            const configs = [
                { label: 'Claude', match: ['claude', 'sonnet'] },
                { label: 'G Pro', match: ['gemini', 'pro'] },
                { label: 'G Flash', match: ['gemini', 'flash'] }
            ];
            configs.forEach(conf => {
                const item = dataList.find(d => check(d, conf.match));
                const pct = item ? Math.round(item.pct) : 0;
                const div = document.createElement('div');
                div.className = 'footer-item';
                div.innerHTML = \`<div class="dot" style="background-color: \${pct > 0 ? '#4CAF50' : '#666'}"></div><span>\${conf.label}: \${pct}%</span>\`;
                footer.appendChild(div);
            });
        }

        function updateQuotas(data) {
            if (data.planName) {
                const limitEl = document.querySelector('.header-subtitle');
                if (limitEl) limitEl.textContent = '(' + data.planName + ')';
            }
            if (data.models) renderRows(data.models);
        }
    </script>
</body>
</html>`;
    }
}
exports.Webview = Webview;
//# sourceMappingURL=Webview.js.map