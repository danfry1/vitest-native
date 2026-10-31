// Needs compiling, as expo/src/winter/TextDecoder.ts does: Node refuses TypeScript under
// node_modules.
export class TextDecoder {
  readonly encoding: string = "utf-8";

  decode(input?: ArrayBufferView): string {
    if (input === undefined) return "";
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
  }
}
