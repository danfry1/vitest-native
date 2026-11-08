// A WatermelonDB-style model: `@field` installs an accessor on the prototype that reads
// and writes the record's raw values. Under Babel's legacy decorators (as the project's
// config compiles it) the field declaration does not shadow the accessor.
function field(column) {
  return () => ({
    configurable: true,
    enumerable: true,
    get() {
      return this._raw[column];
    },
    set(value) {
      this._raw[column] = value;
    },
  });
}

export default class Subscription {
  static table = "subscriptions";

  constructor() {
    this._raw = {};
  }

  @field("name") name;
}
