import * as vscode from 'vscode';
import { ChatViewProvider, SettingName, Settings } from "./view";

var provider: ChatViewProvider;

export async function activate(context: vscode.ExtensionContext) {
    provider = new ChatViewProvider(context);
    const view = vscode.window.registerWebviewViewProvider(
        "chatgpt-vscode.view2",
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

                var prefix = Settings.settings[SettingName[name]];
                sendUserPrompt(prefix, null, selection);
            });
        }
    });

    function registerCommand(name: string, handler: () => void) {
        context.subscriptions.push(vscode.commands.registerCommand(`chatgpt-vscode.${name}`, handler));
    }
}

function sendUserPrompt(content: string, systemMessages?: string[], code?: string) {
    provider.gptTransactionHandler.sendUserPrompt(content, systemMessages, code);
}