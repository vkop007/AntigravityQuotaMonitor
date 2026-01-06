import * as vscode from "vscode";
import { Webview } from "./views/Webview";
import { SessionController } from "./controllers/SessionController";
import { StatusBar } from "./views/StatusBar";

export function activate(context: vscode.ExtensionContext) {
  console.log("Antigravity Quota Monitor is now active!");

  let disposable = vscode.commands.registerCommand(
    "antigravity.showQuota",
    () => {
      Webview.createOrShow(context.extensionUri, context);
    }
  );
  context.subscriptions.push(disposable);

  const statusBar = new StatusBar(context);
  const session = SessionController.shared();
  session.initialize(context).then((success) => {
    if (!success) statusBar.setError("Failed to initialize quota service");
  });
}

export function deactivate() {
  SessionController.shared().stop();
}
