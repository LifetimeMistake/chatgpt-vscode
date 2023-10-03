import * as fs from 'fs';
import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        this.webviewView = webviewView;
        var webview = webviewView.webview;

        webview.options = {
            enableScripts: true,
        };

        var htmlContent: string = fs.readFileSync(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'webview.html').fsPath, 'utf-8');

        webview.html = htmlContent;
    }
}