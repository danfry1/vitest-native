import { describe, expect, it, vi } from "vitest";
import { captureDescriptors, restoreDescriptors, verifyDescriptors } from "../src/native/reset.mjs";

// The descriptor reset behind globalThis, console and expo under the hot runtime. A
// property no reset can delete or put back becomes worker state rather than failing
// every later file in the worker (#773).
describe("hot reset of non-configurable properties", () => {
  it("deletes a configurable property a file added", () => {
    const target: Record<PropertyKey, unknown> = { kept: 1 };
    const baseline = captureDescriptors(target);
    target.added = 2;
    restoreDescriptors(target, baseline);
    expect(Reflect.ownKeys(target)).toEqual(["kept"]);
    verifyDescriptors(target, baseline);
  });

  it("keeps a non-configurable property a file added, once, and verifies against it", () => {
    const target: Record<PropertyKey, unknown> = {};
    const baseline = captureDescriptors(target);
    const key = Symbol.for("lib.registry.v1");
    const registry = new Map();
    Object.defineProperty(target, key, { value: registry, configurable: false });
    const onResident = vi.fn();

    restoreDescriptors(target, baseline, { onResident });
    verifyDescriptors(target, baseline);
    expect(target[key]).toBe(registry);
    expect(onResident).toHaveBeenCalledTimes(1);
    expect(onResident).toHaveBeenCalledWith(key, expect.objectContaining({ value: registry }));

    restoreDescriptors(target, baseline, { onResident });
    expect(onResident).toHaveBeenCalledTimes(1);
  });

  it("puts back the value of a resident property that is still writable", () => {
    const target: Record<PropertyKey, unknown> = {};
    Object.defineProperty(target, "dispatcher", {
      value: "first",
      writable: true,
      configurable: false,
    });
    const baseline = captureDescriptors(target);
    target.dispatcher = "a file's own";
    const onResident = vi.fn();

    restoreDescriptors(target, baseline, { onResident });
    expect(target.dispatcher).toBe("first");
    expect(onResident).not.toHaveBeenCalled();
  });

  it("keeps a baseline property a file made read-only, which nothing can put back", () => {
    const target: Record<PropertyKey, unknown> = {};
    Object.defineProperty(target, "frozen", { value: 1, writable: true, configurable: false });
    const baseline = captureDescriptors(target);
    Object.defineProperty(target, "frozen", { value: 2, writable: false });
    const onResident = vi.fn();

    restoreDescriptors(target, baseline, { onResident });
    verifyDescriptors(target, baseline);
    expect(onResident).toHaveBeenCalledWith("frozen", expect.objectContaining({ value: 2 }));
  });

  it("still fails, naming the property, when a configurable property refuses deletion", () => {
    const inner: Record<PropertyKey, unknown> = {};
    const target = new Proxy(inner, { deleteProperty: () => false });
    const baseline = captureDescriptors(target);
    inner.stuck = 1;
    expect(() => restoreDescriptors(target, baseline)).toThrowError(
      expect.objectContaining({
        code: "HOT_STATE_RESTORE_FAILED",
        message: expect.stringContaining("could not delete stuck"),
      }),
    );
  });
});
