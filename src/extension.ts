import * as vscode from 'vscode';
import { ChatViewProvider } from "./view";

export async function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context);
    const view = vscode.window.registerWebviewViewProvider(
        "chatgpt-vscode.view2",
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }
    );

    function registerCommand(name: string, handler: () => void) {
        context.subscriptions.push(vscode.commands.registerCommand(`chatgpt-vscode.${name}`, handler));
    }
}