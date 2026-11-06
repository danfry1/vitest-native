// A model with a legacy decorator (as WatermelonDB models write them), which nothing here
// compiles, so loading it fails.
function field() {
  return () => {};
}

export default class Subscription {
  static table = "subscriptions";

  // The line that fails:
  @field("name") name;
}
