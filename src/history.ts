import { EventEmitter } from "events";
import { AssistantMessage, FunctionMessage, Message, SystemMessage, UserMessage } from "./messages";
const USER_REQUEST_EVENT = "userRequest";

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

    public pushUserMessage(content: string) {
        var message = new UserMessage(content);
        this.messages.push(message);
        this.eventEmitter.emit(USER_REQUEST_EVENT, message);
    }

    public pushAssistantMessage(content: string) {
        var message = new AssistantMessage(content, null);
        this.messages.push(message);
    }

    public pushAssistantCallMessage(functionName: string, args: string) {
        var message = new AssistantMessage(null, { name: functionName, args: args });
        this.messages.push(message);
    }

    public pushFunctionMessage(name: string, content: string) {
        var message = new FunctionMessage(name, content);
        this.messages.push(message);
    }

    public onUserRequest(handler: (message: UserMessage) => void) {
        this.eventEmitter.on(USER_REQUEST_EVENT, handler);
    }

    public offUserRequest(handler: (message: UserMessage) => void) {
        this.eventEmitter.off(USER_REQUEST_EVENT, handler);
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
        var content = `${this.prompt} ${this.mixins}`;

        var message: SystemMessage | UserMessage;
        if (this.useSystemRole) {
            message = new SystemMessage(content);
        } else {
            message = new UserMessage(content);
        }

        return message;
    }
}