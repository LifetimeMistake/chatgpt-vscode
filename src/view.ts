import * as cheerio from 'cheerio';
import * as fs from 'fs';
import { v4 as uuid } from "uuid";
import * as vscode from 'vscode';
import { AuthenticationMethod, AzureAuthentication, ErrorStop, FunctionCallStop, GPTRequestManager, MessageStop, OpenAIAuthentication, OpenAIRequest } from "./api";
import { FunctionRegistry } from "./functions";
import { MessageHistory, SystemMessageFactory } from "./history";

const USER_PROMPT_REQUEST = 'userPromptRequest';
const USER_EDIT_REQUEST = 'userEditRequest';
const OPEN_SETTINGS_REQUEST = 'openSettingsRequest';
const NEW_CHAT_REQUEST = 'newChatRequest';

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
    public functionRegistry?: FunctionRegistry;

    private model: string;
    private temperature: number;
    private top_p: number;

    private isStreaming: boolean = false;
    private currentMessageId: string = null;

    private test: string = "";


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

        this.reloadSettings();
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("chatgpt-vscode")) {
                this.reloadSettings();
            }
        });

        this.gptRequestManager.onContentReceived((content) => {
            if (this.currentMessageId === null) { this.currentMessageId = uuid(); }

            this.sendMessage(ASSISTANT_TOKEN_RESPONSE, { id: this.currentMessageId, content: content });
            this.test += content;
        });

        this.gptRequestManager;

        this.addMesageListener(USER_PROMPT_REQUEST, (data) => {
            this.sendUserPrompt(data);
        });

        this.addMesageListener(USER_EDIT_REQUEST, (data) => {
            this.messageHistory.editUserMessage(data.id, data.content);
            this.sendRequest();
        });

        this.addMesageListener(NEW_CHAT_REQUEST, () => {
            this.messageHistory.clearMessages();
        });

        this.addMesageListener(OPEN_SETTINGS_REQUEST, () => {
            vscode.commands.executeCommand('workbench.action.openSettings', "@ext:lifetimemistake.chatgpt-vscode chatgpt-vscode.");
        });
    }

    public sendUserPrompt(content: string, systemMessages?: string[]): boolean {
        if (this.isStreaming) { return false; }
        var message = this.messageHistory.pushUserMessage(uuid(), content);
        if (systemMessages) { message.systemMessages = systemMessages; }
        this.sendRequest();
        this.sendMessage(USER_PROMPT_RESPONSE, { id: message.id, content: content });
        return true;
    }

    async sendRequest() {
        var functions = this.functionRegistry.toObject();
        if (!this.functionRegistry.hasFunctions()) {
            functions = null;
        }

        var request = new OpenAIRequest(this.model, this.messageHistory.toObject(), functions, this.temperature, this.top_p);
        console.log(this.functionRegistry.toObject());

        this.isStreaming = true;

        var stop = await this.gptRequestManager.runRequest(request);
        if (stop instanceof MessageStop) {
            this.messageHistory.pushAssistantMessage(this.currentMessageId, stop.content);
            this.sendMessage(ASSISTANT_STOP_RESPONSE, { id: this.currentMessageId });
        } else if (stop instanceof ErrorStop) {
            this.sendMessage(ASSISTANT_ERROR_RESPONSE, stop.error);
        } else if (stop instanceof FunctionCallStop) {
            this.messageHistory.pushAssistantCallMessage(this.currentMessageId, stop.name, stop.arguments);
        }

        this.currentMessageId = null;
        this.isStreaming = false;
    }

    addMesageListener(type: string, handler: (() => void) | ((data: any) => void)) {
        this.webviewView.webview.onDidReceiveMessage(
            message => {
                if (message.type === type) {
                    handler(message.data);
                }
            }
        );
    }

    sendMessage(type: string, data?: any) {
        this.webviewView.webview.postMessage({ type: type, data: data });
    }

    reloadSettings() {
        var auth: AuthenticationMethod;
        var authMethod = vscode.workspace.getConfiguration("chatgpt-vscode").get("method");

        var apiKey = vscode.workspace.getConfiguration("chatgpt-vscode").get("apiKey") as string;
        if (apiKey.length === 0) {
            vscode.window.showErrorMessage("");
        }
        switch (authMethod) {
            case "OpenAI":
                var baseUrl = vscode.workspace.getConfiguration("chatgpt-vscode").get("apiBaseUrl") as string;
                if (baseUrl.length === 0) { baseUrl = null; }
                var organization = vscode.workspace.getConfiguration("chatgpt-vscode").get("organizationName") as string;
                if (organization.length === 0) { organization = null; }
                auth = new OpenAIAuthentication(apiKey, baseUrl, organization);
                break;
            case "Azure":
                var deploymentUrl = vscode.workspace.getConfiguration("chatgpt-vscode").get("azureDeploymentUrl") as string;
                var azureApiVersion = vscode.workspace.getConfiguration("chatgpt-vscode").get("azureApiVersion") as string;
                if (azureApiVersion.length === 0) { azureApiVersion = null; }
                auth = new AzureAuthentication(apiKey, deploymentUrl, azureApiVersion);
                break;
        }

        var clientOptions = auth.getAuthObject();
        this.gptRequestManager = new GPTRequestManager(clientOptions);

        this.model = vscode.workspace.getConfiguration("chatgpt-vscode").get("model") as string;
        var samplingMethod = vscode.workspace.getConfiguration("chatgpt-vscode").get("samplingMethod") as string;
        this.temperature = vscode.workspace.getConfiguration("chatgpt-vscode").get("temperature");
        this.top_p = vscode.workspace.getConfiguration("chatgpt-vscode").get("top_p");
        switch (samplingMethod) {
            case "Temperature":
                this.top_p = null;
                break;
            case "Top_p":
                this.temperature = null;
                break;
        }


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

        this.functionRegistry = new FunctionRegistry();
    }
}
