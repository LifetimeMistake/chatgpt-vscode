const vscode = acquireVsCodeApi();
marked.setOptions({
    renderer: new marked.Renderer(),
    highlight: function (code, _lang) {
        return hljs.highlightAuto(code).value;
    },
    langPrefix: 'hljs language-',
    pedantic: false,
    gfm: true,
    breaks: true,
    sanitize: false,
    smartypants: false,
    xhtml: false
});

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

var assistantName = "GPT";
var currentPromptId = "";

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
    ChatManager.createUserPrompt(data.id, data.content);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_TOKEN_RESPONSE, (data) => {
    ChatManager.appendToken(data.id, data.content);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_STOP_RESPONSE, (data) => {
    ChatManager.readyAssistantPrompt(data);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_CALL_RESPONSE, (data) => {
    ChatManager.createCallPrompt(data);
});

ExtensionMessenger.addMessageHandler(ASSISTANT_ERROR_RESPONSE, (data) => {
    ChatManager.readyAssistantPrompt(currentPromptId);
    ChatManager.createErrorPrompt(data);
});

ExtensionMessenger.addMessageHandler(CHANGE_NAME_RESPONSE, (data) => {
    ChatManager.changeName(data);
});

class ChatManager {
    static prompts = [];
    static waitingForAssistant = false;
    static isEditingPrompt = false;
    static isCallingFunction = false;
    static promptLanguage = "";

    static async createUserPrompt(id, content) {
        const chatElement = document.getElementById('chat');
        const introElement = document.getElementById('introduction');

        if (chatElement.classList.contains("hidden")) {
            chatElement.classList.toggle("hidden");
            introElement.classList.toggle("hidden");
        }

        let markedContent = marked.parse(content);
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(markedContent, 'text/html');
        const updatedMarkedContent = htmlDoc.documentElement.innerHTML;

        var isScrolledMax = this.isScrolledMax();
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-700 p-5';
        promptElement.id = `promptDiv-${id}`;
        promptElement.innerHTML = `<div class="flex flex-row justify-between">
                    <div class="flex flex-row space-x-3 mb-5">
                    <span class="material-symbols-outlined w-8 h-8 pt-0.5 text-center align-middle">
                    person
                    </span>
                    <h2 class="assistant-name text-lg font-semibold">You</h2>
                    </div>
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
                <div class="user-prompt" id="prompt-${id}" class="break-words text-start">${updatedMarkedContent}</div>`;
        document.getElementById('chat').appendChild(promptElement);
        this.prompts.push({ id: id, type: chatEnum.user, content: content });

        this.setStateWaiting();

        document.getElementById(`editPrompt-${id}`).addEventListener("click", () => {
            this.editPrompt(id);
        });

        document.getElementById(`confirmEdit-${id}`).addEventListener("click", () => {
            this.confirmEdit(id);
        });

        document.getElementById(`cancelEdit-${id}`).addEventListener("click", () => {
            this.cancelEdit(id);
        });
        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
    }

    static createAssistantPrompt(id) {
        currentPromptId = id;
        var isScrolledMax = this.isScrolledMax();
        const callElement = document.getElementById('functionCall');
        if (callElement) { callElement.remove(); }

        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-900 p-5';
        promptElement.innerHTML = `<div class="flex flex-row space-x-3 mb-5">
                    <span class="material-symbols-outlined w-8 h-8 pt-0.5 text-center align-middle">
                    psychology
                    </span>
                    <h2 class="assistant-name text-lg font-bold">${assistantName}</h2>
                </div>
                <div id="prompt-${id}" class="assistant-prompt break-words text-start relative"></div>`;
        document.getElementById('chat').appendChild(promptElement);
        var prompt = { id: id, type: chatEnum.assistant, content: "" };
        this.prompts.push(prompt);
        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
        return prompt;
    }

    static createCallPrompt(content) {
        var isScrolledMax = this.isScrolledMax();
        const callElement = document.getElementById('functionCall');
        if (callElement) { callElement.remove(); }
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-800 p-5';
        promptElement.id = 'functionCall';

        var markedCall = marked.parse(`\`\`\`${content}\`\`\``);

        promptElement.innerHTML = `<p class="text-base">${markedCall}</p>`;
        document.getElementById('chat').appendChild(promptElement);
        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
    }

    static createErrorPrompt(error) {
        var isScrolledMax = this.isScrolledMax();
        const promptElement = document.createElement('div');
        promptElement.className = 'bg-neutral-900 p-5';
        promptElement.innerHTML = `<div class="flex flex-row space-x-3 mb-5">
                    <span class="material-symbols-outlined w-8 h-8 pt-0.5 text-center align-middle">
                    psychology
                    </span>
                    <h2 class="assistant-name text-lg font-bold">${assistantName}</h2>
                </div>
                <div class="assistant-prompt break-words text-start relative text-base text-red-800">${error}</div>`;
        document.getElementById('chat').appendChild(promptElement);
        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
    }

    static editPrompt(id) {
        if (this.waitingForAssistant || this.isEditingPrompt) {
            return;
        }

        this.isEditingPrompt = true;
        document.getElementById(`editOptions-${id}`).classList.remove("hidden");

        var promptElement = document.getElementById(`prompt-${id}`);
        promptElement.classList.add("hidden");

        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.remove("hidden");
        editArea.value = promptElement.textContent.trim();
    }

    static confirmEdit(id) {
        var editArea = document.getElementById(`editArea-${id}`);
        if (editArea.value.trim().length === 0) {
            return;
        }

        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.add("hidden");
        document.getElementById(`editOptions-${id}`).classList.add("hidden");

        let markedContent = marked.parse(editArea.value);
        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(markedContent, 'text/html');
        const updatedMarkedContent = htmlDoc.documentElement.innerHTML;

        var promptElement = document.getElementById(`prompt-${id}`);
        promptElement.classList.remove("hidden");
        promptElement.innerHTML = updatedMarkedContent;

        var prompt = this.prompts.find(p => p.id === id);
        prompt.content = editArea.value;

        var newLength = this.prompts.findIndex(p => p.id === id) + 1;
        this.prompts.length = newLength;

        var promptDiv = document.getElementById(`promptDiv-${id}`);
        var nextSibling = promptDiv.nextSibling;
        while (nextSibling) {
            promptDiv.parentNode.removeChild(nextSibling);
            nextSibling = promptDiv.nextSibling;
        }

        this.isEditingPrompt = false;
        this.setStateWaiting();
        ExtensionMessenger.sendMessage(USER_EDIT_REQUEST, { id: id, content: editArea.value });
        editArea.value = "";
    }

    static cancelEdit(id) {
        var editArea = document.getElementById(`editArea-${id}`);
        editArea.classList.add("hidden");
        document.getElementById(`editOptions-${id}`).classList.add("hidden");

        var prompt = document.getElementById(`prompt-${id}`);
        prompt.classList.remove("hidden");
        this.isEditingPrompt = false;
    }

    static appendToken(id, token) {
        var isScrolledMax = this.isScrolledMax();
        if (this.isCallingFunction) {
            document.getElementById('thinking').innerHTML = `Thinking . . .`;
        }

        var prompt = this.prompts.find(m => m.id === id);
        if (!prompt) {
            prompt = this.createAssistantPrompt(id);
        }

        prompt.content += token;

        let existingMessage = document.getElementById(`prompt-${id}`);
        let updatedValue = "";
        let rawValue = "";

        rawValue = prompt.content;
        updatedValue = rawValue.split("```").length % 2 === 1 ? rawValue : rawValue + "\n\n```\n\n";
        updatedValue = updatedValue.replace(/`([^`]{1})`/g, `<code class="hljs language-${this.promptLanguage}">$1</code>`);

        let inCodeBlock = false;
        const lines = updatedValue.split("\n");
        const wrappedCodeBlocks = [];

        for (var line of lines) {
            const match = /^```(.*)$/.exec(line);

            if (match) {
                inCodeBlock = !inCodeBlock;
                if (inCodeBlock) {
                    this.promptLanguage = match[1]; // Save the language
                } else if (wrappedCodeBlocks.length > 0) {
                    wrappedCodeBlocks.push("</p>\n\n<p>");
                }
            } else {
                if (inCodeBlock) {
                    line = "    " + line;
                }
                wrappedCodeBlocks.push(line);
            }
        }

        if (inCodeBlock) {
            wrappedCodeBlocks.push("</p>");
        }

        updatedValue = "<p>" + wrappedCodeBlocks.join('\n') + "</p>";
        let markedResponse = marked.parse(updatedValue);

        const parser = new DOMParser();
        const htmlDoc = parser.parseFromString(markedResponse, 'text/html');

        const updatedMarkedResponse = htmlDoc.documentElement.innerHTML;
        existingMessage.innerHTML = updatedMarkedResponse;

        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
    }

    static readyAssistantPrompt(id) {
        if (!document.getElementById(`prompt-${id}`)) {
            this.setStateReady();
            return;
        }

        var isScrolledMax = this.isScrolledMax();
        var codeBlocks = document.getElementById(`prompt-${id}`).getElementsByTagName("pre");

        for (var i = 0; i < codeBlocks.length; i++) {
            console.log("found codeblock");
            var codeBlock = codeBlocks[i];
            var preWrap = document.createElement('div');

            // Insert preWrap before codeBlock
            codeBlock.parentNode.insertBefore(preWrap, codeBlock);

            preWrap.classList.add("mb-5", "preWrap");
            preWrap.innerHTML = `<div class="bg-neutral-800 p-1 h-8 flex flex-row justify-end">
                        <button id="copy-${id}" class="hover:bg-neutral-500 w-6 h-6 text-center rounded-md"><span
                                class="material-symbols-outlined text-lg text-center w-6 h-6 align-middle">
                                content_copy
                            </span></button>
                    </div>`;
            codeBlock.parentElement.removeChild(codeBlock);
            preWrap.appendChild(codeBlock);

            document.getElementById(`copy-${id}`).addEventListener("click", () => {
                var codeContent = codeBlock.textContent;
                navigator.clipboard.writeText(codeContent);
            });
            currentPromptId = "";
        }

        this.setStateReady();
        if (isScrolledMax) {
            document.getElementById('main-panel').scrollTop += 9999;
        }
    }


    static clearMessages() {
        this.prompts = [];
        document.getElementById('chat').innerHTML = '';
    }

    static scrollToBottom() {
        const mainPanel = document.getElementById("main-panel");
        mainPanel.scrollTop = mainPanel.scrollHeight;
    }

    static setStateWaiting() {
        this.waitingForAssistant = true;
        document.getElementById('thinking').classList.remove("hidden");
        document.getElementById('stopButton').classList.remove("hidden");
    }

    static setStateReady() {
        this.waitingForAssistant = false;
        document.getElementById('thinking').classList.add("hidden");
        document.getElementById('stopButton').classList.add("hidden");
    }

    static changeName(name) {
        assistantName = name;
        var nameElements = document.getElementsByClassName('assistant-name');
        for (var i = 0; i < nameElements.length; i++) {
            nameElements[i].innerHTML = name;
        }
    }

    static isScrolledMax() {
        var currentScroll = document.getElementById('main-panel').scrollTop;
        document.getElementById('main-panel').scrollTop += 9999;
        var maxScroll = document.getElementById('main-panel').scrollTop;

        if (currentScroll === maxScroll) {
            return true;
        }
        document.getElementById('main-panel').scrollTop = currentScroll;
        return false;
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
    ChatManager.scrollToBottom();
    inputPanel.style.height = initPanelHeight;
}

document.getElementById('input-area').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        if (!ChatManager.waitingForAssistant) {
            sendPrompt();
        }
        e.preventDefault();
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
    if (ChatManager.waitingForAssistant) {
        return;
    }

    ChatManager.clearMessages();
    document.getElementById('chat').classList.add('hidden');
    document.getElementById('introduction').classList.remove('hidden');
    document.querySelector("#options-list").classList.toggle("hidden");
    ExtensionMessenger.sendMessage(NEW_CHAT_REQUEST);
});

document.getElementById('settings-button').addEventListener('click', () => {
    document.querySelector("#options-list").classList.toggle("hidden");
    ExtensionMessenger.sendMessage(OPEN_SETTINGS_REQUEST);
});

document.getElementById('stopButton').addEventListener('click', () => {
    if (ChatManager.waitingForAssistant) {
        ExtensionMessenger.sendMessage(USER_ABORT_REQUEST);
    }
});
document.addEventListener('mouseup', (e) => {
    const optionsList = document.querySelector("#options-list");
    const optionsButton = document.querySelector("#options-button");
    if (!optionsList.contains(e.target) && !optionsButton.contains(e.target)) {
        optionsList.classList.add('hidden');
    }
});

const inputArea = document.getElementById('input-area');
const inputPanel = document.getElementById('input-panel');
const initPanelHeight = inputPanel.style.height;

inputArea.addEventListener('input', () => {
    inputPanel.style.height = `${inputArea.scrollHeight}px`;
    if (inputArea.value === "") {
        inputPanel.style.height = initPanelHeight;
    }
});

const chatEnum = {
    user: "user",
    assistant: "assistant",
};