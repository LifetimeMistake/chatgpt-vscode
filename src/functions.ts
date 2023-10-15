export class FunctionRegistry {
    private functions: Map<string, FunctionInfo>;

    constructor() {
        this.functions = new Map<string, FunctionInfo>();
    }

    public registerFunction(func: (args: object) => string, name: string, parameters: PropertyInfo[], description?: string, statusMessage?: string) {
        if (this.functions.has(name)) {
            throw new Error(`Function ${name} is already registered!`);
        }

        var functionInfo = new FunctionInfo(func, name, parameters, description, statusMessage);
        this.functions.set(name, functionInfo);
    }

    public removeFunction(name: string) {
        if (!this.functions.has(name)) {
            return;
        }

        this.functions.set(name, null);
    }

    public getFunctions(): FunctionInfo[] {
        return Array.from(this.functions.values());
    }

    public hasFunctions(): boolean {
        return this.functions.size !== 0;
    }

    public getFunctionByName(name: string): FunctionInfo | undefined {
        return this.functions.get(name);
    }

    public toObject(): object[] {
        var functionArray: object[] = [];

        this.functions.forEach(f => {
            var func = {};
            functionArray.push(func);

            func["name"] = f.name;
            if (f.description) {
                func["description"] = f.description;
            }

            var parameters = {};
            func["parameters"] = parameters;

            parameters["type"] = "object";

            var required: string[] = [];
            parameters["required"] = required;

            var properties = {};
            parameters["properties"] = properties;

            f.properties.forEach(p => {
                var property = {};
                properties[p.name] = property;
                property["type"] = parameterTypeToString(p.type);
                if (p.required) {
                    required.push(p.name);
                }
                if (p.description) {
                    property["description"] = p.description;
                }
                if (p.enum) {
                    property["enum"] = p.enum;
                }
            });
        });

        return functionArray;
    }
}

function parameterTypeToString(type: ParameterType) {
    switch (type) {
        case ParameterType.string:
            return "string";
        case ParameterType.number:
            return "number";
        default:
            throw new Error("Invalid parameter type");
    }
}

export class FunctionInfo {
    public func: (args: object) => string;
    public name: string;
    public properties: PropertyInfo[];
    public description?: string;
    public statusMessage?: string;

    constructor(func: (args: object) => string, name: string, parameters: PropertyInfo[], description?: string, statusMessage?: string) {
        this.func = func;
        this.name = name;
        this.properties = parameters;
        this.description = description;
        this.statusMessage = statusMessage;
    }
}

export class PropertyInfo {
    public name: string;
    public type: ParameterType;
    public required: boolean;
    public description?: string;
    public enum?: any[];

    constructor(name: string, type: ParameterType, required: boolean, description?: string, _enum?: any[]) {
        this.name = name;
        this.type = type;
        this.required = required;
        this.description = description;
        this.enum = _enum;
    }
}

export enum ParameterType {
    string,
    number
}