export class FunctionRegistry {
    private functions: Map<string, FunctionInfo>;

    constructor() {
        this.functions = new Map<string, FunctionInfo>();
    }

    public registerFunction(func: (args: object) => string, parameters: PropertyInfo[], description?: string) {
        if (this.functions.has(func.name)) {
            throw new Error(`Function ${func.name} is already registered!`);
        }

        var functionInfo = new FunctionInfo(func, parameters, description);
        this.functions.set(func.name, functionInfo);
    }

    public getFunctions(): FunctionInfo[] {
        return Array.from(this.functions.values());
    }

    public getFunctionByName(name: string): FunctionInfo | null {
        if (this.functions.has(name)) {
            return this.functions.get(name);
        }

        return null;
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
                if (p._enum) {
                    property["enum"] = p._enum;
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

    constructor(func: (args: object) => string, parameters: PropertyInfo[], description?: string) {
        this.func = func;
        this.name = func.name;
        this.properties = parameters;
        this.description = description;
    }
}

export class PropertyInfo {
    public name: string;
    public type: ParameterType;
    public required: boolean;
    public description?: string;
    public _enum?: any[];

    constructor(name: string, type: ParameterType, required: boolean, description?: string, _enum?: any[]) {
        this.name = name;
        this.type = type;
        this.required = required;
        this.description = description;
        this._enum = _enum;
    }
}

export enum ParameterType {
    string,
    number
}