const vscode = acquireVsCodeApi();

const USER_PROMPT_REQUEST = 'userPromptRequest';
const USER_EDIT_REQUEST = 'userEditRequest';
const OPEN_SETTINGS_REQUEST = 'openSettingsRequest';

const USER_PROMPT_RESPONSE = 'userPromptResponse';
const ASSISTANT_TOKEN_RESPONSE = 'assistantTokenResponse';
const ASSISTANT_STOP_RESPONSE = 'assistantStopResponse';
const ASSISTANT_CALL_RESPONSE = 'assistantCallResponse';
const ASSISTANT_ERROR_RESPONSE = 'assistantErrorResponse';

class ExtensionMessenger {
    static sendMessage(type, data) {
        const message = { type, data };
        vscode.postMessage(message);
    }

    static addMessageHandler(messageType, handler) {
        window.addEventListener('message', event => {
            if (event.data.type === messageType) {
                if (event.data.data !== null) {
                    handler(event.data.data);
                } else {
                    handler();
                }
            }
        });
    }
}

ExtensionMessenger.addMessageHandler(USER_PROMPT_RESPONSE, (data) => {
    ChatManager.appendUserPrompt(data.id, data.content);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_TOKEN_RESPONSE, (data) => {
    ChatManager.appendToken(data.id, data.content);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_STOP_RESPONSE, () => {
    ChatManager.readyAssistantPrompt();
});

ExtensionMessenger.addMessageHandler(ASSISTANT_CALL_RESPONSE, () => {

});

ExtensionMessenger.addMessageHandler(ASSISTANT_ERROR_RESPONSE, () => {

});

class ChatManager {
    static prompts = [];
    static waitingForAssistant = false;
    static isEditingPrompt = false;

    static async appendUserPrompt(id, content) {
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-700 p-5';
        promptElement.id = `promptDiv-${id}`;
        promptElement.innerHTML = `<div class="flex flex-row justify-between">
                    <h2 class="text-lg font-semibold">You</h2>
                    <div>
                        <button id="editPrompt-${id}" class="w-6"><span
                                class="material-symbols-outlined text-base w-6 hover:bg-neutral-600 rounded-md">edit</span></button>
                    </div>
                </div>
                <div id="editOptions-${id}" class="flex flex-row space-x-3 mt-5 hidden">
                    <button id="confirmEdit-${id}"
                        class="text-xs w-max hover:bg-neutral-600 rounded-md flex items-center justify-around space-x-1 p-1">
                        <span class="material-symbols-outlined text-xs">
                            send
                        </span>
                        <span class="">Send</span></button>
                    <button id="cancelEdit-${id}"
                        class="text-xs w-max hover:bg-neutral-600 rounded-md flex items-center justify-around space-x-1 p-1"><span
                            class="material-symbols-outlined text-xs">
                            close
                        </span>
                        <span class="">Cancel</span></button>
                </div>
                <textarea id="editArea-${id}" class="bg-neutral-800 overflow-y-auto resize-none p-3 w-full mt-3 hidden"></textarea>
                <p id="prompt-${id}" class="mt-5 break-words">${content}</p>`;
        document.getElementById('chat').appendChild(promptElement);
        this.prompts.push({ id: id, type: chatEnum.user, content: content });

        this.scrollToBottom();
        this.waitingForAssistant = true;

        document.getElementById(`editPrompt-${id}`).addEventListener("click", () => {
            this.editPrompt(id);
        });

        document.getElementById(`confirmEdit-${id}`).addEventListener("click", () => {
            this.confirmEdit(id);
        });

        document.getElementById(`cancelEdit-${id}`).addEventListener("click", () => {
            this.cancelEdit(id);
        });
    }

    static createAssistantPrompt(id) {
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-900 p-5';
        promptElement.innerHTML = ` <div class="flex flex-row space-x-3">
                                    <img class="w-8" src="https://cuddlyoctopus.com/wp-content/uploads/2019/11/KI-032A-Astolfo-750x750.png">
                                    <h2 class="text-lg font-bold">GPT</h2>
                                    </div>
                                    <p id="prompt-${id}" class="mt-5 break-words"></p>`;
        document.getElementById('chat').appendChild(promptElement);
        var prompt = { id: id, type: chatEnum.assistant, content: "" };
        this.prompts.push(prompt);
        return prompt;
    }

    static editPrompt(id) {
        if (this.waitingForAssistant) {
            return;
        }

        this.isEditingPrompt = true;
        document.getElementById(`editOptions-${id}`).classList.remove("hidden");

        var promptElement = document.getElementById(`prompt-${id}`);
        promptElement.classList.add("hidden");

        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.remove("hidden");
        editArea.value = promptElement.innerHTML;
    }

    static confirmEdit(id) {
        var editArea = document.getElementById(`editArea-${id}`);
        if (editArea.value.trim().length === 0) {
            return;
        }

        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.add("hidden");
        document.getElementById(`editOptions-${id}`).classList.add("hidden");

        var promptElement = document.getElementById(`prompt-${id}`);
        promptElement.classList.remove("hidden");
        promptElement.innerHTML = editArea.value;

        var prompt = this.prompts.find(p => p.id === id);
        prompt.content = editArea.value;

        var newLength = this.prompts.findIndex(p => p.id === id) + 1;
        this.prompts.length = newLength;
        console.log(this.prompts);

        var promptDiv = document.getElementById(`promptDiv-${id}`);
        var nextSibling = promptDiv.nextSibling;
        while (nextSibling) {
            promptDiv.parentNode.removeChild(nextSibling);
            nextSibling = promptDiv.nextSibling;
        }

        ExtensionMessenger.sendMessage(USER_EDIT_REQUEST, { id: id, content: editArea.value });
    }

    static cancelEdit(id) {
        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.add("hidden");
        document.getElementById(`editOptions-${id}`).classList.add("hidden");

        var prompt = document.getElementById(`prompt-${id}`);
        prompt.classList.remove("hidden");
    }

    static appendToken(id, token) {
        var prompt = this.prompts.find(m => m.id === id);
        if (!prompt) {
            prompt = this.createAssistantPrompt(id);
        }

        const promptElement = document.getElementById(`prompt-${id}`);
        promptElement.innerHTML += token;
        prompt.content = promptElement.innerHTML;
        this.scrollToBottom();
    }

    static readyAssistantPrompt() {
        this.waitingForAssistant = false;
    }

    static clearMessages() {
        this.prompts = [];
        document.getElementById('chat').innerHTML = '';
    }

    static scrollToBottom() {
        const mainPanel = document.getElementById("main-panel");
        mainPanel.scrollTop = mainPanel.scrollHeight;
    }
}

function sendPrompt() {
    const inputArea = document.getElementById('input-area');

    if (inputArea.value.trim().length === 0) {
        inputArea.focus();
        return;
    }

    ExtensionMessenger.sendMessage(USER_PROMPT_REQUEST, inputArea.value);
    document.getElementById('chat').classList.remove('hidden');
    document.getElementById('introduction').classList.add('hidden');
    inputArea.value = "";
}

document.getElementById('input-area').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !ChatManager.waitingForAssistant) {
        e.preventDefault();
        sendPrompt();
    }
});

document.getElementById('send-button').addEventListener('click', () => {
    if (!ChatManager.waitingForAssistant) {
        sendPrompt();
    }
});

document.getElementById('options-button').addEventListener('click', () => {
    const optionsList = document.querySelector("#options-list");
    optionsList.classList.toggle("hidden");
});

document.getElementById('newchat-button').addEventListener('click', () => {
    ChatManager.clearMessages();
    document.getElementById('chat').classList.add('hidden');
    document.getElementById('introduction').classList.remove('hidden');
    document.querySelector("#options-list").classList.toggle("hidden");
    ExtensionMessenger.test();
});

document.getElementById('settings-button').addEventListener('click', () => {
    document.querySelector("#options-list").classList.toggle("hidden");
    ExtensionMessenger.sendMessage(OPEN_SETTINGS_REQUEST);
});

document.addEventListener('mouseup', (e) => {
    const optionsList = document.querySelector("#options-list");
    const optionsButton = document.querySelector("#options-button");
    if (!optionsList.contains(e.target) && !optionsButton.contains(e.target)) {
        optionsList.classList.add('hidden');
    }
});

const chatEnum = {
    user: "user",
    assistant: "assistant",
};