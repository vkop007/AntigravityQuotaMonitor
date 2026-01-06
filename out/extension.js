"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const Webview_1 = require("./views/Webview");
const SessionController_1 = require("./controllers/SessionController");
const StatusBar_1 = require("./views/StatusBar");
function activate(context) {
    console.log("Antigravity Quota Monitor is now active!");
    let disposable = vscode.commands.registerCommand("antigravity.showQuota", () => {
        Webview_1.Webview.createOrShow(context.extensionUri, context);
    });
    context.subscriptions.push(disposable);
    const statusBar = new StatusBar_1.StatusBar(context);
    const session = SessionController_1.SessionController.shared();
    session.initialize(context).then((success) => {
        if (!success)
            statusBar.setError("Failed to initialize quota service");
    });
}
function deactivate() {
    SessionController_1.SessionController.shared().stop();
}
//# sourceMappingURL=extension.js.map