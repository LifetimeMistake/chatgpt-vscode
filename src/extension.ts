import * as vscode from 'vscode';
import { PropertyInfo } from "./functions";
import { UserMessage } from "./messages";
import { ChatViewProvider, SettingName, Settings } from "./view";

var provider: ChatViewProvider;

function sendUserPrompt(content: string, systemMessages?: string[], code?: string) {
    provider.gptTransactionHandler.sendUserPrompt(content, systemMessages, code);
}

function registerFunction(func: (args: object) => string, name: string, parameters: PropertyInfo[], description?: string, statusMessage?: string) {
    return provider.functionRegistry.registerFunction(func, name, parameters, description, statusMessage);
}

function removeFunction(name: string) {
    return provider.functionRegistry.removeFunction(name);
}

function addSystemMessageMixin(key: string, content: string) {
    provider.systemMessageFactory.addMixin(key, content);
}

function removeSystemMessageMixin(key: string) {
    provider.systemMessageFactory.removeMixin(key);
}

function onUserRequest(handler: (message: UserMessage) => void) {
    provider.messageHistory.onUserRequest(handler);
}

function offUserRequest(handler: (message: UserMessage) => void) {
    provider.messageHistory.offUserRequest(handler);
}

function onMessageHistoryCleared(handler: () => void) {
    provider.messageHistory.onClearMessages(handler);
}

function offMessageHistoryCleared(handler: () => void) {
    provider.messageHistory.offClearMessages(handler);
}

export async function activate(context: vscode.ExtensionContext) {
    provider = new ChatViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
        "chatgpt-vscode.view",
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }
    ));

    Object.keys(SettingName).forEach((name) => {
        var setting = SettingName[name];
        if (setting.startsWith("promptPrefix.")) {
            setting = setting.replace("promptPrefix.", "");

            vscode.commands.executeCommand('setContext', `${setting}-enabled`, true);
            if (setting !== "customPrompt") {
                Settings.onSettingChanged(SettingName[name], () => {
                    const isValid = (Settings.settings[SettingName[name]] as string).trim().length !== 0;
                    vscode.commands.executeCommand('setContext', `${setting}-enabled`, isValid);
                });
            }

            registerCommand(setting, async () => {
                vscode.commands.executeCommand('chatgpt-vscode.view.focus');
                if (!provider.webviewView) {
                    await new Promise<void>((resolve) => {
                        provider.onWebviewLoaded(() => {
                            resolve();
                        });
                    });
                }

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
                    var value = await vscode.window.showInputBox(inputOptions);
                    if (value === undefined || value.length === 0) {
                        return;
                    }
                    prefix = value;
                    sendUserPrompt(prefix, null, selection);
                }
            });
        }
    });

    function registerCommand(name: string, handler: () => void) {
        context.subscriptions.push(vscode.commands.registerCommand(`chatgpt-vscode.${name}`, handler));
    }

    return {
        sendUserPrompt,
        registerFunction,
        removeFunction,
        addSystemMessageMixin,
        removeSystemMessageMixin,
        onUserRequest,
        offUserRequest,
        onMessageHistoryCleared,
        offMessageHistoryCleared
    };
}