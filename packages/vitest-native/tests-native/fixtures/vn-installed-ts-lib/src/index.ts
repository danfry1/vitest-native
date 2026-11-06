// An installed package that ships TypeScript source. The enum needs a compiler (Node's
// type stripping refuses it), so Node can load this only through the engine's compile.
export enum Mode {
  Plain = "plain",
}
export const store: { value: string | null; mode: Mode } = { value: null, mode: Mode.Plain };
