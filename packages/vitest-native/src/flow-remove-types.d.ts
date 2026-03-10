declare module "flow-remove-types" {
  interface FlowRemoveTypesResult {
    toString(): string;
    generateMap(): {
      version: number;
      sources: string[];
      names: string[];
      mappings: string;
    };
  }

  interface FlowRemoveTypesOptions {
    all?: boolean;
    pretty?: boolean;
  }

  function flowRemoveTypes(source: string, options?: FlowRemoveTypesOptions): FlowRemoveTypesResult;

  export default flowRemoveTypes;
}
