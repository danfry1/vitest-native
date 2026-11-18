export const source = "real-v3-esm";
export class CID {
  constructor(text) {
    this.text = text;
    this.source = source;
  }
  static parse(text) {
    return new CID(text);
  }
}
