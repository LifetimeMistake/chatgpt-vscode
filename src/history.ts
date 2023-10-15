import { EventEmitter } from "events";
import { v4 as uuid } from 'uuid';
import { AssistantMessage, FunctionMessage, Message, SystemMessage, UserMessage } from "./messages";
const USER_REQUEST_EVENT = "userRequest";
const CLEAR_MESSAGES_EVENT = "clearMesssages";

export class MessageHistory {
    private messages: Message[];
    public maxMessages: number;
    public eventEmitter: EventEmitter;
    public systemMessage: SystemMessageFactory;

    constructor(maxMessages: number, systemMessageFactory: SystemMessageFactory) {
        this.messages = [];
        this.maxMessages = maxMessages;
        this.eventEmitter = new EventEmitter();
        this.systemMessage = systemMessageFactory;
    }

    public pushUserMessage(id: string, content: string, code?: string): UserMessage {
        var message = new UserMessage(id, content, code);
        this.messages.push(message);
        this.eventEmitter.emit(USER_REQUEST_EVENT, message);
        return message;
    }

    public editUserMessage(id: string, content: string) {
        var messageIndex = this.messages.findIndex(m => m.id === id && m instanceof UserMessage);
        if (messageIndex === -1) { throw new Error("Invalid message id!"); }
        var message = this.messages[messageIndex] as UserMessage;
        message.content = content;
        message.systemMessages = [];
        this.eventEmitter.emit(USER_REQUEST_EVENT, message);
        this.messages.splice(messageIndex + 1);
    }

    public pushAssistantMessage(id: string, content: string): AssistantMessage {
        var message = new AssistantMessage(id, content, null);
        this.messages.push(message);
        return message;
    }

    public pushAssistantCallMessage(id: string, functionName: string, args: string): AssistantMessage {
        var message = new AssistantMessage(id, null, { name: functionName, args: args });
        this.messages.push(message);
        return message;
    }

    public pushFunctionMessage(id: string, name: string, content: string): FunctionMessage {
        var message = new FunctionMessage(id, name, content);
        this.messages.push(message);
        return message;
    }

    public removeMessage(id: string) {
        var messageIndex = this.messages.findIndex(m => m.id === id);
        if (messageIndex === -1) { throw Error("Invalid message id!"); }
        this.messages.splice(messageIndex, 1);
    }

    public clearMessages() {
        this.messages = [];
        this.eventEmitter.emit(CLEAR_MESSAGES_EVENT);
    }

    public onUserRequest(handler: (message: UserMessage) => void) {
        this.eventEmitter.on(USER_REQUEST_EVENT, handler);
    }

    public offUserRequest(handler: (message: UserMessage) => void) {
        this.eventEmitter.off(USER_REQUEST_EVENT, handler);
    }

    public onClearMessages(handler: () => void) {
        this.eventEmitter.on(CLEAR_MESSAGES_EVENT, handler);
    }

    public offClearMessages(handler: () => void) {
        this.eventEmitter.off(CLEAR_MESSAGES_EVENT, handler);
    }

    public toObject(): object[] {
        var messageArray: object[] = [];

        var systemMessage = this.systemMessage.produceMessage();
        messageArray.push(systemMessage.toObject());

        for (const message of this.messages.slice(-this.maxMessages)) {
            messageArray.push(message.toObject());
        }

        return messageArray;
    }
}

export class SystemMessageFactory {
    private mixins: Map<string, string>;
    public prompt: string;

    public useSystemRole: boolean;

    constructor(useSystemRole: boolean, systemPrompt?: string) {
        this.prompt = systemPrompt ?? "";
        this.mixins = new Map<string, string>();
        this.useSystemRole = useSystemRole;
    }

    public addMixin(key: string, content: string) {
        if (this.mixins.has(key)) {
            throw Error(`Mixin with key ${key} already exists!`);
        }

        this.mixins.set(key, content);
    }

    public removeMixin(key: string): boolean {
        return this.mixins.delete(key);
    }

    public produceMessage(): SystemMessage | UserMessage {
        var content = this.prompt;
        this.mixins.forEach(m => {
            content += ` ${m}`;
        });

        var message: SystemMessage | UserMessage;
        if (this.useSystemRole) {
            message = new SystemMessage(uuid(), content);
        } else {
            message = new UserMessage(uuid(), content);
        }

        return message;
    }
}