import * as vscode from 'vscode';
import { PropertyInfo } from "./functions";
import { UserMessage } from "./messages";
import { ChatViewProvider, SettingName, Settings } from "./view";

var provider: ChatViewProvider;

export async function activate(context: vscode.ExtensionContext) {
    provider = new ChatViewProvider(context);
    const view = vscode.window.registerWebviewViewProvider(
        "chatgpt-vscode.view",
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }
    );

    Object.keys(SettingName).forEach((name) => {
        var setting = SettingName[name];
        if (setting.startsWith("promptPrefix.")) {
            setting = setting.replace("promptPrefix.", "");

            vscode.commands.executeCommand('setContext', `${setting}-enabled`, Settings.settings[SettingName[name]]);
            Settings.onSettingChanged(SettingName[name], () => {
                vscode.commands.executeCommand('setContext', `${setting}-enabled`, Settings.settings[SettingName[name]]);
            });

            registerCommand(setting, () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage("You need to be editing a file to use this command!");
                    return;
                }

                const selection = editor.document.getText(editor.selection);
                if (!selection) {
                    vscode.window.showErrorMessage("You need to select something to use this command!");
                    return;
                }

                if (provider.gptTransactionHandler.isStreaming) {
                    vscode.window.showErrorMessage("The assistant is currently responding!");
                    return;
                }

                if (name !== 'promptPrefixCustom') {
                    var prefix = Settings.settings[SettingName[name]];
                    sendUserPrompt(prefix, null, selection);
                } else {
                    var inputOptions: vscode.InputBoxOptions = {};
                    inputOptions.placeHolder = "Input your custom prompt here";
                    inputOptions.title = "The custom prompt will be sent to the assistant with your code selection";
                    vscode.window.showInputBox(inputOptions).then((value) => {
                        if (value === undefined || value.length === 0) {
                            return;
                        }
                        prefix = value;
                        sendUserPrompt(prefix, null, selection);
                    });
                }
            });
        }
    });



    function registerCommand(name: string, handler: () => void) {
        context.subscriptions.push(vscode.commands.registerCommand(`chatgpt-vscode.${name}`, handler));
    }
}

export function sendUserPrompt(content: string, systemMessages?: string[], code?: string) {
    provider.gptTransactionHandler.sendUserPrompt(content, systemMessages, code);
}

export function registerFunction(func: (args: object) => string, name: string, parameters: PropertyInfo[], description?: string, statusMessage?: string) {
    return provider.functionRegistry.registerFunction(func, name, parameters, description, statusMessage);
}

export function addSystemMessageMixin(key: string, content: string) {
    provider.systemMessageFactory.addMixin(key, content);
}

export function removeSystemMessageMixin(key: string) {
    provider.systemMessageFactory.removeMixin(key);
}

export function onUserRequest(handler: (message: UserMessage) => void) {
    provider.messageHistory.onUserRequest(handler);
}

export function offUserRequest(handler: (message: UserMessage) => void) {
    provider.messageHistory.offUserRequest(handler);
}

export function onMessageHistoryCleared(handler: () => void) {
    provider.messageHistory.onClearMessages(handler);
}