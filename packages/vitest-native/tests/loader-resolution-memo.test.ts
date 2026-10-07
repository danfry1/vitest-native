import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { initialize, resolveSync } from "../src/native/loader.mjs";

// Under the hot runtime a parent URL carries the generation stamp (?vnhot=N), which
// defeats Node's (specifier, parent) resolve cache, so every test file re-resolved every
// externalized import. The loader keeps successful resolutions per unstamped parent.
initialize({ projectRoot: process.cwd(), platform: "ios" });

// Absolute on every platform (Windows file URLs need a drive letter).
const fileUrl = (rel: string) => pathToFileURL(path.resolve(rel)).href;

const next = () =>
  vi.fn((specifier: string) => ({ url: fileUrl(`node_modules/${specifier}/index.js`) }));

describe("generation-aware resolution memo", () => {
  it("reuses a resolution across generations of the same parent", () => {
    const nextResolve = next();
    const context = (gen: number) => ({
      parentURL: `${fileUrl("node_modules/lib-a/index.js")}?vnhot=${gen}`,
      conditions: ["node", "import"],
    });
    const first = resolveSync("memo-dep", context(1), nextResolve);
    const second = resolveSync("memo-dep", context(2), nextResolve);
    expect(nextResolve).toHaveBeenCalledTimes(1);
    expect(second.url.split("?")[0]).toBe(first.url.split("?")[0]);
    // Node requires a hook that skipped nextResolve to say so.
    expect(second.shortCircuit).toBe(true);
  });

  it("leaves unstamped parents to Node's own cache", () => {
    const nextResolve = next();
    const context = { parentURL: fileUrl("node_modules/lib-b/index.js"), conditions: ["import"] };
    resolveSync("plain-dep", context, nextResolve);
    resolveSync("plain-dep", context, nextResolve);
    expect(nextResolve).toHaveBeenCalledTimes(2);
  });

  it("keeps different conditions apart", () => {
    const nextResolve = next();
    const parentURL = `${fileUrl("node_modules/lib-c/index.js")}?vnhot=3`;
    resolveSync("cond-dep", { parentURL, conditions: ["import"] }, nextResolve);
    resolveSync("cond-dep", { parentURL, conditions: ["import", "react-native"] }, nextResolve);
    expect(nextResolve).toHaveBeenCalledTimes(2);
  });

  it("does not keep failures, so the fallbacks run each time", () => {
    const failing = vi.fn(() => {
      throw Object.assign(new Error("not found"), { code: "ERR_MODULE_NOT_FOUND" });
    });
    const context = {
      parentURL: `${fileUrl("node_modules/lib-d/index.js")}?vnhot=4`,
      conditions: ["import"],
    };
    expect(() => resolveSync("missing-dep", context, failing)).toThrow("not found");
    expect(() => resolveSync("missing-dep", context, failing)).toThrow("not found");
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
