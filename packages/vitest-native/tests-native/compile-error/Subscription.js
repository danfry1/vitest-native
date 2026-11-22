// A model file with a legacy decorator, which reaches Node uncompiled when the project's
// Babel config (not applied to Vite-compiled source) is what compiles it. Node fails it
// with "Invalid or unexpected token" at line 12, column 3.
function field() {
  return () => {};
}

export default class Subscription {
  static table = "subscriptions";

  // The line Node rejects:
  @field("name") name;
}
