import EventEmitter from "events";
import { ClientOptions, OpenAI } from 'openai';
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const AZURE_API_VERSION = "2023-03-15-preview";
const FUNCTION_CALL_STARTED_EVENT = "functionCallStarted";
const CONTENT_RECEIVED_EVENT = "contentReceived";

export interface AuthenticationMethod {
    getAuthObject(userOpts?: ClientOptions): ClientOptions;
}

export class OpenAIAuthentication implements AuthenticationMethod {
    private _baseUrl: string;
    private _apiKey: string;
    private _organization?: string;

    constructor(key: string, url?: string, organization?: string) {
        this._baseUrl = url ?? OPENAI_BASE_URL;
        this._apiKey = key;
        this._organization = organization;
    }

    getAuthObject(userOpts?: ClientOptions): ClientOptions {
        if (!userOpts) {
            userOpts = {};
        }

        userOpts.baseURL = this._baseUrl;
        userOpts.apiKey = this._apiKey;
        if (this._organization) {
            userOpts.defaultHeaders = { "OpenAI-Organization": this._organization };
        }

        return userOpts;
    }
}

export class AzureAuthentication implements AuthenticationMethod {
    private _baseUrl: string;
    private _apiKey: string;
    private _apiVersion: string;

    constructor(key: string, deploymentUrl: string, apiVersion?: string) {
        this._apiKey = key;
        this._baseUrl = deploymentUrl;
        this._apiVersion = apiVersion ?? AZURE_API_VERSION;
    }

    getAuthObject(userOpts?: ClientOptions): ClientOptions {
        if (!userOpts) {
            userOpts = {};
        }

        userOpts.baseURL = this._baseUrl;
        userOpts.apiKey = this._apiKey;
        userOpts.defaultQuery = { 'api-version': this._apiVersion };
        userOpts.defaultHeaders = { 'api-key': this._apiKey };
        return userOpts;
    }
}

export class OpenAIRequest {
    model: string;
    temperature?: number;
    top_p?: number;
    messages: any[];
    functions?: any[];

    constructor(model: string, messages: object[], functions?: object[], temperature?: number, top_p?: number) {
        this.model = model;
        this.messages = messages;
        this.functions = functions;
        this.temperature = temperature;
        this.top_p = top_p;
    }

    toObject(): any {
        var obj = {
            "model": this.model,
            "messages": this.messages,
            "stream": true
        };

        if (this.temperature) {
            obj["temperature"] = this.temperature;
        }

        if (this.top_p) {
            obj["top_p"] = this.top_p;
        }

        if (this.functions) {
            obj["functions"] = this.functions;
        }

        return obj;
    }
}

export class MessageStop {
    content: string;

    constructor(content: string) {
        this.content = content;
    }
}

export class FunctionCallStop {
    name: string;
    arguments: string;

    constructor(name: string, args: string) {
        this.name = name;
        this.arguments = args;
    }
}

export class ErrorStop {
    message: string;
    context?: any;

    constructor(message: string, context?: any) {
        this.message = message;
        this.context = context;
    }
}

export class GPTRequestManager {
    private _client: OpenAI;
    private _stream?: any;
    private _inProgress: boolean;
    private _callInProgress: boolean;
    private _functionName?: string;
    private _contentBuffer: string[];
    private _functionBuffer: string[];
    private _eventEmitter: EventEmitter;

    get inProgress(): boolean {
        return this._inProgress;
    }

    get isCallingFunction(): boolean {
        return this._callInProgress;
    }

    get content(): string {
        return this._contentBuffer.join("");
    }

    get functionCall(): object | undefined {
        if (this._callInProgress) {
            return {
                "name": this._functionName,
                "arguments": this._functionBuffer.join("")
            };
        }
    }

    constructor(options: ClientOptions) {
        this._client = new OpenAI(options);
        this._inProgress = false;
        this._callInProgress = false;
        this._contentBuffer = [];
        this._functionBuffer = [];
        this._eventEmitter = new EventEmitter();
    }

    private reset(abort: boolean) {
        if (this._stream) {
            if (abort) {
                (this._stream as any).controller.abort();
            }
            this._stream = undefined;
        }

        this._inProgress = false;
        this._callInProgress = false;
        this._contentBuffer = [];
        this._functionBuffer = [];
    }

    async runRequest(req: OpenAIRequest): Promise<MessageStop | FunctionCallStop | ErrorStop> {
        if (this._inProgress) {
            return new ErrorStop("Another request is already in progress.");
        }

        var isErr = false;
        this.reset(false);
        try {
            this._stream = await this._client.chat.completions.create(req.toObject());
            this._inProgress = true;

            for await (const part of (this._stream as any)) {
                if (!this._inProgress) {
                    break;
                }

                if (part.choices.len === 0) {
                    throw new Error("OpenAI API returned invalid data");
                }

                const data = part.choices[0];
                if (data.finish_reason === "stop") {
                    // Reached stop
                    return new MessageStop(this.content);
                }
                else if (data.finish_reason === "function_call") {
                    // Reached end of function call stream
                    if (!this._callInProgress) {
                        throw new Error("Function call stop reached but no function call stream was in progress");
                    }

                    return new FunctionCallStop(this._functionName, this._functionBuffer.join(""));
                }
                else if (data.finish_reason === null) {
                    // Regular update
                    const content = data.delta.content;
                    const func = data.delta.function_call;

                    if (content) {
                        // Receive content delta
                        this._contentBuffer.push(content);
                        this._eventEmitter.emit(CONTENT_RECEIVED_EVENT, content);
                    } else if (func) {
                        if (!this._callInProgress) {
                            // Receive function header
                            this._functionName = func.name;
                            this._callInProgress = true;
                            this._eventEmitter.emit(FUNCTION_CALL_STARTED_EVENT, func.name);
                        }

                        if (func.arguments) {
                            // Receive function param delta
                            this._functionBuffer.push(func.arguments);
                        }
                    }
                }
            }

            if (!this._inProgress) {
                throw new Error("Request aborted");
            } else {
                throw new Error("Request interrupted");
            }
        }
        catch (err) {
            isErr = true;
            return new ErrorStop(err.message, err);
        }
        finally {
            this.reset(isErr);
        }
    }

    abortRequest(): boolean {
        if (!this._inProgress) {
            return false;
        }

        this.reset(true);
        return true;
    }

    onFunctionCallStarted(handler: (name: string) => void) {
        this._eventEmitter.on(FUNCTION_CALL_STARTED_EVENT, handler);
    }

    offFunctionCallStarted(handler: (name: string) => void) {
        this._eventEmitter.off(FUNCTION_CALL_STARTED_EVENT, handler);
    }

    onContentReceived(handler: (content: string) => void) {
        this._eventEmitter.on(CONTENT_RECEIVED_EVENT, handler);
    }

    offContentReceived(handler: (content: string) => void) {
        this._eventEmitter.off(CONTENT_RECEIVED_EVENT, handler);
    }
}