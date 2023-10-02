export interface Message {
    readonly role: MessageRole;
    toObject(): object;
}

export class SystemMessage implements Message {
    readonly role: MessageRole;
    public content: string;

    constructor(content: string) {
        this.content = content;
        this.role = MessageRole.system;
    }

    toObject(): object {
        var message = {};
        message["role"] = "system";
        message["content"] = this.content;
        return message;
    }
}

export class UserMessage implements Message {
    readonly role: MessageRole;
    public systemMessages: string[];
    public content: string;

    constructor(content: string) {
        this.content = content;
        this.role = MessageRole.user;
        this.systemMessages = [];
    }

    toObject(): object {
        var content = this.content;
        if (this.systemMessages.length !== 0) {
            var mergedSystemMessages = this.systemMessages.map(message => `#SYSTEM ${message}\n`).join("");
            content = `${mergedSystemMessages}#SYSTEM User query below\n\n${this.content}`;
        }

        var message = {};
        message["role"] = "user";
        message["content"] = content;

        return message;
    }

    public addSystemMessage(message: string) {
        this.systemMessages.push(message);
    }
}

export class AssistantMessage implements Message {
    readonly role: MessageRole;
    public content?: string;
    public functionCall?: { name: string, args: string; };

    constructor(content?: string, functionCall?: { name: string, args: string; }) {
        this.role = MessageRole.assistant;
        this.content = content;
        this.functionCall = functionCall;
    }

    public toObject(): object {
        var message = {};
        message["role"] = "assistant";
        message["content"] = this.content;
        if (this.functionCall) {
            var functionCall = {};
            functionCall["name"] = this.functionCall.name;
            functionCall["arguments"] = this.functionCall.args;
            message["function_call"] = functionCall;
        }

        return message;
    }
}

export class FunctionMessage implements Message {
    readonly role: MessageRole;
    public name: string;
    public content: string;

    constructor(name: string, content: string) {
        this.role = MessageRole.function;
        this.name = name;
        this.content = content;
    }

    public toObject(): object {
        var message = {};
        message["role"] = "function";
        message["name"] = this.name;
        message["content"] = this.content;
        return message;
    }
}

enum MessageRole {
    user,
    assistant,
    function,
    system
}