import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public webviewView?: vscode.WebviewView;
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

        var mainJS = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'main.js'));
        var htmlContent: string = fs.readFileSync(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'webview.html').fsPath, 'utf-8');

        var $ = cheerio.load(htmlContent);

        $("#mainJs").attr("src", mainJS.toString());

        webview.html = $.html();

        // register webview message listeners
        this.addMesageListener('userPrompt', () => {

        });

        this.addMesageListener('openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', "@ext:lifetimemistake.chatgpt-vscode chatgpt-vscode.");
        });
    }

    addMesageListener(type: string, handler: (() => void) | ((data: string) => void)) {
        this.webviewView.webview.onDidReceiveMessage(
            message => {
                if (message.type === type) {
                    handler(message.data);
                }
            }
        );
    }

    sendMessage(type: string, data: string) {
        this.webviewView.webview.postMessage({ type: type, data: data });
    }
}
