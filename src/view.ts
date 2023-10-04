import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { AuthenticationMethod, AzureAuthentication, GPTRequestManager, OpenAIAuthentication } from "./api";
import { MessageHistory, SystemMessageFactory } from "./history";

const USER_PROMPT_REQUEST = 'userPromptRequest';
const OPEN_SETTINGS_REQUEST = 'openSettingsRequest';

const USER_PROMPT_RESPONSE = 'userPromptResponse';
const ASSISTANT_TOKEN_RESPONSE = 'assistantTokenResponse';
const ASSISTANT_STOP_RESPONSE = 'assistantStopResponse';
const ASSISTANT_CALL_RESPONSE = 'assistantCallResponse';
const ASSISTANT_ERROR_RESPONSE = 'assistantErrorResponse';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public webviewView?: vscode.WebviewView;
    private extensionContext: vscode.ExtensionContext;
    private gptRequestManager?: GPTRequestManager;
    private systemMessageFactory?: SystemMessageFactory;
    private messageHistory?: MessageHistory;

    private model: string;
    private temperature: number;
    private top_p: number;


    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        // webview
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

        this.reloadSettings();
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("chatgpt-vscode")) {
                this.reloadSettings();
            }
        });

        this.addMesageListener(OPEN_SETTINGS_REQUEST, () => {
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

    sendMessage(type: string, data: object) {
        this.webviewView.webview.postMessage({ type: type, data: data });
    }

    reloadSettings() {
        var auth: AuthenticationMethod;
        var authMethod = vscode.workspace.getConfiguration("chatgpt-vscode").get("method");

        var apiKey = vscode.workspace.getConfiguration("chatgpt-vscode").get("apiKey") as string;
        switch (authMethod) {
            case "OpenAI":
                var baseUrl = vscode.workspace.getConfiguration("chatgpt-vscode").get("apiBaseUrl") as string;
                if (baseUrl.length === 0) { baseUrl = null; }
                var organization = vscode.workspace.getConfiguration("chatgpt-vscode").get("organizationName") as string;
                if (organization.length === 0) { organization = null; }
                auth = new OpenAIAuthentication(apiKey, baseUrl, organization);
            case "Azure":
                var deploymentUrl = vscode.workspace.getConfiguration("chatgpt-vscode").get("azureDeploymentUrl") as string;
                var azureApiVersion = vscode.workspace.getConfiguration("chatgpt-vscode").get("azureApiVersion") as string;
                if (azureApiVersion.length === 0) { azureApiVersion = null; }
                auth = new AzureAuthentication(apiKey, deploymentUrl, azureApiVersion);
        }

        var clientOptions = auth.getAuthObject();
        this.gptRequestManager = new GPTRequestManager(clientOptions);

        this.model = vscode.workspace.getConfiguration("chatgpt-vscode").get("model") as string;
        this.temperature = vscode.workspace.getConfiguration("chatgpt-vscode").get("temperature");
        this.top_p = vscode.workspace.getConfiguration("chatgpt-vscode").get("top_p");

        var systemPrompt = vscode.workspace.getConfiguration("chatgpt-vscode").get("systemPrompt") as string;
        var assistantName = vscode.workspace.getConfiguration("chatgpt-vscode").get("assistantName") as string;
        systemPrompt = systemPrompt.replace("{name}", assistantName);

        var useSystemRole: boolean = false;
        if (this.model.startsWith("gpt-4")) {
            useSystemRole = true;
        }
        if (!this.systemMessageFactory) {
            this.systemMessageFactory = new SystemMessageFactory(useSystemRole, systemPrompt);
        } else {
            this.systemMessageFactory.useSystemRole = useSystemRole;
            this.systemMessageFactory.prompt = systemPrompt;
        }

        var maxMessages = vscode.workspace.getConfiguration("chatgpt-vscode").get("maxHistoryMessages") as number;
        if (!this.messageHistory) {
            this.messageHistory = new MessageHistory(maxMessages, this.systemMessageFactory);
        }
    }
}
