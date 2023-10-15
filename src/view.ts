import * as fs from 'fs';
import { EventEmitter } from "stream";
import { v4 as uuid } from "uuid";
import * as vscode from 'vscode';
import { AuthenticationMethod, AzureAuthentication, ErrorStop, FunctionCallStop, GPTRequestManager, MessageStop, OpenAIAuthentication, OpenAIRequest } from "./api";
import { FunctionRegistry } from "./functions";
import { MessageHistory, SystemMessageFactory } from "./history";

const USER_PROMPT_REQUEST = 'userPromptRequest';
const USER_EDIT_REQUEST = 'userEditRequest';
const OPEN_SETTINGS_REQUEST = 'openSettingsRequest';
const NEW_CHAT_REQUEST = 'newChatRequest';
const USER_ABORT_REQUEST = 'userAbortRequest';

const USER_PROMPT_RESPONSE = 'userPromptResponse';
const ASSISTANT_TOKEN_RESPONSE = 'assistantTokenResponse';
const ASSISTANT_STOP_RESPONSE = 'assistantStopResponse';
const ASSISTANT_CALL_RESPONSE = 'assistantCallResponse';
const ASSISTANT_ERROR_RESPONSE = 'assistantErrorResponse';

const CHANGE_NAME_RESPONSE = 'changeNameResponse';

const CONTENT_RECEIVED_EVENT = 'contentReceivedEvent';
const CALL_STARTED_EVENT = 'callReceivedEvent';
const MESSAGE_STOP_EVENT = 'messageStopEvent';
const ERROR_STOP_EVENT = 'errorStopEvent';
const USER_PROMPT_EVENT = 'userPromptEvent';
const WEBVIEW_LOADED_EVENT = 'webviewLoadedEvent';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public webviewView?: vscode.WebviewView;
    private extensionContext: vscode.ExtensionContext;
    public gptTransactionHandler?: GPTTransactionHandler;
    public systemMessageFactory?: SystemMessageFactory;
    public extensionMessenger?: ExtensionMessenger;
    public functionRegistry?: FunctionRegistry;
    public messageHistory?: MessageHistory;
    private eventEmitter: EventEmitter;

    private settings: Settings;

    onWebviewLoaded(handler: () => void) {
        this.eventEmitter.on(WEBVIEW_LOADED_EVENT, handler);
    }

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.settings = new Settings();
        this.eventEmitter = new EventEmitter();
    }

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
        this.extensionMessenger = new ExtensionMessenger(webviewView.webview);
        this.functionRegistry = new FunctionRegistry();

        var useSystemRole: boolean = Settings.settings[SettingName.model].startsWith('gpt-4');
        let assistantName = Settings.settings[SettingName.assistantName];
        var systemPrompt = Settings.settings[SettingName.systemPrompt].replace('{name}', assistantName);
        if (systemPrompt.length === 0) {
            systemPrompt = null;
        }

        this.systemMessageFactory = new SystemMessageFactory(useSystemRole, systemPrompt);
        Settings.onSettingChanged(SettingName.model, () => {
            var useSystemRole: boolean = Settings.settings[SettingName.model].startsWith('gpt-4');
            this.systemMessageFactory.useSystemRole = useSystemRole;
        });
        Settings.onSettingChanged(SettingName.systemPrompt, () => {
            let assistantName = Settings.settings[SettingName.assistantName];
            this.systemMessageFactory.prompt = Settings.settings[SettingName.systemPrompt].replace("{name}", assistantName);
        });

        this.messageHistory = new MessageHistory(Settings.settings[SettingName.maxHistoryMessages], this.systemMessageFactory);
        Settings.onSettingChanged(SettingName.systemPrompt, () => {
            this.messageHistory.maxMessages = Settings.settings[SettingName.maxHistoryMessages];
        });

        this.webviewView = webviewView;
        var webview = webviewView.webview;
        webview.options = {
            enableScripts: true,
        };

        var mainJS = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'main.js'));
        var hljsCSS = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'hljs.css'));
        var tailwindCSS = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'tailwind.css'));
        var htmlContent: string = fs.readFileSync(vscode.Uri.joinPath(this.extensionContext.extensionUri, 'webview', 'webview.html').fsPath, 'utf-8');
        htmlContent = htmlContent.replace("{mainJs}", mainJS.toString());
        htmlContent = htmlContent.replace("{hljsCss}", hljsCSS.toString());
        htmlContent = htmlContent.replace("{tailwindCss}", tailwindCSS.toString());
        webview.html = htmlContent;

        Settings.onSettingChanged(SettingName.assistantName, () => {
            this.extensionMessenger.sendMessage(CHANGE_NAME_RESPONSE, Settings.settings[SettingName.assistantName]);
        });

        this.gptTransactionHandler = new GPTTransactionHandler(this.messageHistory, this.functionRegistry);

        this.gptTransactionHandler.onContentReceived((content) => {
            this.gptTransactionHandler.currentMessageId = this.gptTransactionHandler.currentMessageId || uuid();
            this.extensionMessenger.sendMessage(ASSISTANT_TOKEN_RESPONSE, { id: this.gptTransactionHandler.currentMessageId, content });
        });

        this.gptTransactionHandler.onCallStarted((name) => {
            var func = this.functionRegistry.getFunctionByName(name);
            if (!func) {
                return;
            }

            const content = func.statusMessage ? func.statusMessage : `Calling function: '${func.name}'`;
            this.extensionMessenger.sendMessage(ASSISTANT_CALL_RESPONSE, content);
        });

        this.gptTransactionHandler.onMessageStop((id) => {
            this.extensionMessenger.sendMessage(ASSISTANT_STOP_RESPONSE, id);
        });

        this.gptTransactionHandler.onErrorStop((error) => {
            this.extensionMessenger.sendMessage(ASSISTANT_ERROR_RESPONSE, error);
        });

        this.gptTransactionHandler.onUserPrompt((id, content) => {
            this.extensionMessenger.sendMessage(USER_PROMPT_RESPONSE, { id: id, content: content });
        });

        this.extensionMessenger.addMesageListener(USER_PROMPT_REQUEST, (data) => {
            var includeCode: boolean = data.includeCode;

            var code: string = null;
            if (includeCode) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    code = editor.document.getText(editor.selection);
                }
            }

            this.gptTransactionHandler.sendUserPrompt(data.content, null, code);
        });

        this.extensionMessenger.addMesageListener(USER_EDIT_REQUEST, (data) => {
            this.messageHistory.editUserMessage(data.id, data.content);
            this.gptTransactionHandler.sendRequest();
        });

        this.extensionMessenger.addMesageListener(NEW_CHAT_REQUEST, () => {
            this.messageHistory.clearMessages();
        });

        this.extensionMessenger.addMesageListener(OPEN_SETTINGS_REQUEST, () => {
            vscode.commands.executeCommand('workbench.action.openSettings', "@ext:lifetimemistake.chatgpt-vscode chatgpt-vscode.");
        });

        this.extensionMessenger.addMesageListener(USER_ABORT_REQUEST, () => {
            this.gptTransactionHandler.abortRequest();
        });

        this.eventEmitter.emit(WEBVIEW_LOADED_EVENT);
    }
}

class ExtensionMessenger {
    private webview: vscode.Webview;

    constructor(webview: vscode.Webview) {
        this.webview = webview;
    }

    addMesageListener(type: string, handler: (() => void) | ((data: any) => void)) {
        this.webview.onDidReceiveMessage(
            message => {
                if (message.type === type) {
                    handler(message.data);
                }
            }
        );
    }

    sendMessage(type: string, data?: any) {
        this.webview.postMessage({ type: type, data: data });
    }
}

class GPTTransactionHandler {
    private messageHistory: MessageHistory;
    private gptRequestManager: GPTRequestManager;
    private functionRegistry: FunctionRegistry;

    public isStreaming: boolean;
    public currentMessageId: string;

    private eventEmitter: EventEmitter;

    constructor(messageHistory: MessageHistory, functionRegistry: FunctionRegistry) {
        this.messageHistory = messageHistory;
        this.functionRegistry = functionRegistry;
        this.eventEmitter = new EventEmitter();

        Settings.onSettingChanged(SettingName.apiKey, () => { this.getRequestManager(); });
        Settings.onSettingChanged(SettingName.authMethod, () => { this.getRequestManager(); });
        Settings.onSettingChanged(SettingName.baseUrl, () => { this.getRequestManager(); });
        Settings.onSettingChanged(SettingName.organizationName, () => { this.getRequestManager(); });
        Settings.onSettingChanged(SettingName.azureDeploymentUrl, () => { this.getRequestManager(); });
        Settings.onSettingChanged(SettingName.azureApiVersion, () => { this.getRequestManager(); });

        this.getRequestManager();
        this.isStreaming = false;
        this.currentMessageId = null;
    }

    onCallStarted(handler: (name: string) => void) {
        this.eventEmitter.on(CALL_STARTED_EVENT, handler);
    }

    offCallStarted(handler: (name: string) => void) {
        this.eventEmitter.off(CALL_STARTED_EVENT, handler);
    }

    onContentReceived(handler: (content: string) => void) {
        this.eventEmitter.on(CONTENT_RECEIVED_EVENT, handler);
    }

    offContentReceived(handler: (content: string) => void) {
        this.eventEmitter.off(CONTENT_RECEIVED_EVENT, handler);
    }

    onMessageStop(handler: (id: string) => void) {
        this.eventEmitter.on(MESSAGE_STOP_EVENT, handler);
    }

    offMessageStop(handler: (id: string) => void) {
        this.eventEmitter.off(MESSAGE_STOP_EVENT, handler);
    }

    onErrorStop(handler: (error: string) => void) {
        this.eventEmitter.on(ERROR_STOP_EVENT, handler);
    }

    offErrorStop(handler: (error: string) => void) {
        this.eventEmitter.off(ERROR_STOP_EVENT, handler);
    }

    onUserPrompt(handler: (id: string, content: string) => void) {
        this.eventEmitter.on(USER_PROMPT_EVENT, handler);
    }

    offUserPrompt(handler: (id: string, content: string) => void) {
        this.eventEmitter.off(USER_PROMPT_EVENT, handler);
    }

    private getRequestManager() {
        var auth: AuthenticationMethod;
        var authMethod = Settings.settings[SettingName.authMethod];

        var apiKey = Settings.settings[SettingName.apiKey];
        switch (authMethod) {
            case "OpenAI":
                var baseUrl = Settings.settings[SettingName.baseUrl];
                if (baseUrl.length === 0) { baseUrl = null; }
                var organizationName = Settings.settings[SettingName.organizationName];
                if (organizationName.length === 0) { baseUrl = null; }
                auth = new OpenAIAuthentication(apiKey, baseUrl, organizationName);
                break;
            case "Azure":
                var azureDeploymentUrl = Settings.settings[SettingName.azureDeploymentUrl];
                var azureApiVersion = Settings.settings[SettingName.azureApiVersion];
                auth = new AzureAuthentication(apiKey, azureDeploymentUrl, azureApiVersion);
                break;
        }

        var clientOptions = auth.getAuthObject();
        this.gptRequestManager = new GPTRequestManager(clientOptions);
        this.gptRequestManager.onContentReceived((content) => { this.eventEmitter.emit(CONTENT_RECEIVED_EVENT, content); });
        this.gptRequestManager.onFunctionCallStarted((name) => { this.eventEmitter.emit(CALL_STARTED_EVENT, name); });
    }

    private sendCallPrompt(functionName: string, content: string) {
        this.messageHistory.pushFunctionMessage(uuid(), functionName, content);
        this.sendRequest();
    }

    public async sendRequest() {
        var functions = this.functionRegistry.toObject();
        if (!this.functionRegistry.hasFunctions()) {
            functions = null;
        }

        var model = Settings.settings[SettingName.model];
        var temperature = Settings.settings[SettingName.temperature];
        var top_p = Settings.settings[SettingName.top_p];

        switch (Settings.settings[SettingName.samplingMethod]) {
            case "Temperature":
                top_p = null;
                break;
            case "Top_p":
                temperature = null;
                break;
        }

        var request = new OpenAIRequest(model, this.messageHistory.toObject(), functions, temperature, top_p);

        this.isStreaming = true;

        var stop = await this.gptRequestManager.runRequest(request);
        if (stop instanceof MessageStop) {
            this.messageHistory.pushAssistantMessage(this.currentMessageId, stop.content);
            this.eventEmitter.emit(MESSAGE_STOP_EVENT, this.currentMessageId);
        } else if (stop instanceof ErrorStop) {
            this.eventEmitter.emit(ERROR_STOP_EVENT, stop.message);
        } else if (stop instanceof FunctionCallStop) {
            this.messageHistory.pushAssistantCallMessage(this.currentMessageId, stop.name, stop.arguments);

            var funcInfo = this.functionRegistry.getFunctionByName(stop.name);
            var response: string;
            if (!funcInfo) {
                response = `#SYSTEM: Unknown function`;
            } else {
                try {
                    response = funcInfo.func(JSON.parse(stop.arguments));
                } catch (error) {
                    this.eventEmitter.emit(ERROR_STOP_EVENT, error.message);
                    return;
                }
            }

            this.sendCallPrompt(stop.name, response);
        }

        this.currentMessageId = null;
        this.isStreaming = false;
    }

    public abortRequest() {
        this.gptRequestManager.abortRequest();
    }

    public sendUserPrompt(content: string, systemMessages?: string[], code?: string): boolean {
        if (this.isStreaming) { return false; }
        var message = this.messageHistory.pushUserMessage(uuid(), content, code);
        if (systemMessages) { message.systemMessages = systemMessages; }
        this.sendRequest();
        this.eventEmitter.emit(USER_PROMPT_EVENT, message.id, content);
        return true;
    }
}

export class Settings {
    static settings: { [name: string]: any; } = {};
    static eventEmitter = new EventEmitter();

    constructor() {
        this.loadSettings();
        this.subscribeToSettingChanges();
    }

    static onSettingChanged(settingName: SettingName, handler: () => void) {
        Settings.eventEmitter.on(settingName, handler);
    }

    private loadSettings() {
        Object.keys(SettingName).forEach((name) => {
            const settingName = SettingName[name];
            Settings.settings[settingName] = this.getConfig(settingName);
        });
    }

    private subscribeToSettingChanges() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            Object.keys(SettingName).forEach((name) => {
                const settingName = SettingName[name];
                if (e.affectsConfiguration(`chatgpt-vscode.${settingName}`)) {
                    Settings.settings[settingName] = this.getConfig(settingName);
                    Settings.eventEmitter.emit(settingName);
                }
            });
        });
    }

    private getConfig(name: SettingName): any {
        return vscode.workspace.getConfiguration("chatgpt-vscode").get(name);
    }
}

export enum SettingName {
    apiKey = "apiKey",
    authMethod = "authMethod",
    baseUrl = "baseUrl",
    organizationName = "organizationName",
    azureDeploymentUrl = "azureDeploymentUrl",
    azureApiVersion = "azureApiVersion",
    model = "model",
    samplingMethod = "samplingMethod",
    temperature = "temperature",
    top_p = "top_p",
    systemPrompt = "systemPrompt",
    assistantName = "assistantName",
    maxHistoryMessages = "maxHistoryMessages",
    promptPrefixComments = "promptPrefix.addComments",
    promptPrefixComplete = "promptPrefix.completeCode",
    promptPrefixExplain = "promptPrefix.explain",
    promptPrefixProblems = "promptPrefix.findProblems",
    promptPrefixOptimize = "promptPrefix.optimize",
    promptPrefixRefactor = "promptPrefix.refactorCode",
    promptPrefixCustom = "promptPrefix.customPrompt"
}
