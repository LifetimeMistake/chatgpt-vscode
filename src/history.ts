import { EventEmitter } from "events";
import { AssistantMessage, FunctionMessage, Message, SystemMessage, UserMessage } from "./messages";

export class MessageHistory {
    private messages: Message[];
    public eventEmitter: EventEmitter;
    public systemMessageFactory: SystemMessageFactory;

    constructor() {
        this.messages = [];
        this.eventEmitter = new EventEmitter();
        this.systemMessageFactory = new SystemMessageFactory();
    }

    public pushUserMessage(content: string) {
        var message = new UserMessage(content);
        this.messages.push(message);
        this.eventEmitter.emit('userMessageSent', message);
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

    public onUserMessageSent(handler: (message: UserMessage) => void) {
        this.eventEmitter.on('userMessageSent', handler);
    }

    public offUserMessageSent(handler: (message: UserMessage) => void) {
        this.eventEmitter.off('userMessageSent', handler);
    }

    public toObject(): object[] {
        var messageArray: object[] = [];

        var systemMessage = this.systemMessageFactory.produceMessage();
        messageArray.push(systemMessage.toObject());

        this.messages.forEach(m => {
            var messageObject = m.toObject();
            messageArray.push(messageObject);
        });

        return messageArray;
    }
}

export class SystemMessageFactory {
    private mixins: Map<string, string>;
    public prompt: string;

    public isGPT4: boolean;

    constructor() {
        this.prompt = "";
        this.mixins = new Map<string, string>();
        this.isGPT4 = false;
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
        if (this.isGPT4) {
            message = new SystemMessage(content);
        } else {
            message = new UserMessage(content);
        }

        return message;
    }
}