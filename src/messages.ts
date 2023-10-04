import { v4 as uuid } from 'uuid';

export interface Message {
    readonly role: MessageRole;
    readonly id: string;
    toObject(): object;
}

export class SystemMessage implements Message {
    readonly role: MessageRole;
    readonly id: string;
    public content: string;

    constructor(content: string) {
        this.content = content;
        this.role = MessageRole.system;
        this.id = uuid();
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
    readonly id: string;
    public systemMessages: string[];
    public content: string;

    constructor(content: string) {
        this.content = content;
        this.role = MessageRole.user;
        this.systemMessages = [];
        this.id = uuid();
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
    readonly id: string;
    public content?: string;
    public functionCall?: { name: string, args: string; };

    constructor(content?: string, functionCall?: { name: string, args: string; }) {
        this.role = MessageRole.assistant;
        this.content = content;
        this.functionCall = functionCall;
        this.id = uuid();
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
    readonly id: string;
    public name: string;
    public content: string;

    constructor(name: string, content: string) {
        this.role = MessageRole.function;
        this.name = name;
        this.content = content;
        this.id = uuid();
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