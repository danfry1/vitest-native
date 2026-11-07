import { expect, it } from "vitest";
import { loadLater, staticValue, Store } from "./src/Store";

it("compiles a routed file under babel-preset-expo as an ES module, import() included", async () => {
  const store = new Store();
  store.name = "general";
  expect(store._raw.name).toBe("general");
  expect(staticValue).toBe("loaded later");
  expect((await loadLater()).later).toBe("loaded later");
});
