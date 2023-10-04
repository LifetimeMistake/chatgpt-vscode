const vscode = acquireVsCodeApi();

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

class ChatManager {
    static messages = [];

    static sendPrompt(content) {
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-700 p-5';
        promptElement.innerHTML = `<h2 class="text-lg font-semibold">You</h2>
                               <p class="mt-3">${content}</p>`;
        document.getElementById('chat').appendChild(promptElement);
        this.messages.push({ type: chatEnum.user, content });
        ExtensionMessenger.sendMessage("userPrompt", content);
        this.scrollToBottom();
        this.waitingForPrompt = true;
    }

    static clearMessages() {
        this.messages = [];
        document.getElementById('chat').innerHTML = '';
    }

    static scrollToBottom() {
        const mainPanel = document.getElementById("main-panel");
        mainPanel.scrollTop = mainPanel.scrollHeight;
    }
}

document.getElementById('input-area').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendPrompt();
    }
});

document.getElementById('send-button').addEventListener('click', () => {
    sendPrompt();
});

function sendPrompt() {
    const inputArea = document.getElementById('input-area');

    if (inputArea.value.length === 0) {
        inputArea.focus();
        return;
    }

    ChatManager.sendPrompt(inputArea.value);
    document.getElementById('chat').classList.remove('hidden');
    document.getElementById('introduction').classList.add('hidden');
    inputArea.value = "";
}

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
    ExtensionMessenger.sendMessage('openSettings');
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