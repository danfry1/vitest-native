/**
 * jest.replaceProperty() under jest-compat, as jest-mock 29.7 has it: the value replaced
 * in place, `{ replaceValue, restore }` returned, a second replacement reusing the first,
 * restored by restore(), jest.restoreAllMocks() and the `restoreMocks` setting (which
 * Vitest applies with vi.restoreAllMocks()), with Jest's errors otherwise.
 */
import { Platform } from "react-native";
import { afterEach, expect, it, vi } from "vitest";

declare const jest: typeof vi & {
  replaceProperty<T extends object, K extends keyof T>(
    object: T,
    key: K,
    value: T[K],
  ): { replaceValue(value: T[K]): unknown; restore(): void };
  restoreAllMocks(): void;
};

afterEach(() => {
  jest.restoreAllMocks();
});

it("replaces a value in place and restores it", () => {
  const replaced = jest.replaceProperty(Platform, "OS", "android");
  expect(Platform.OS).toBe("android");
  const descriptor = Object.getOwnPropertyDescriptor(Platform, "OS")!;
  expect(descriptor.value).toBe("android");
  expect(descriptor.writable).toBe(true);
  expect(replaced.replaceValue("web")).toBe(replaced);
  expect(Platform.OS).toBe("web");
  replaced.restore();
  expect(Platform.OS).toBe("ios");
});

it("reuses the first replacement, so restoring gives back the original", () => {
  jest.replaceProperty(Platform, "OS", "android");
  jest.replaceProperty(Platform, "OS", "web");
  expect(Platform.OS).toBe("web");
  jest.restoreAllMocks();
  expect(Platform.OS).toBe("ios");
});

it("is restored by vi.restoreAllMocks(), which Vitest's restoreMocks setting calls", () => {
  jest.replaceProperty(Platform, "OS", "android");
  vi.restoreAllMocks();
  expect(Platform.OS).toBe("ios");
});

it("deletes a property it replaced on the object when the original was inherited", () => {
  const object = Object.create({ inherited: 1 }) as { inherited: number };
  jest.replaceProperty(object, "inherited", 2);
  expect(Object.prototype.hasOwnProperty.call(object, "inherited")).toBe(true);
  jest.restoreAllMocks();
  expect(Object.prototype.hasOwnProperty.call(object, "inherited")).toBe(false);
  expect(object.inherited).toBe(1);
});

it("throws Jest's errors", () => {
  const replace = jest.replaceProperty as (...args: unknown[]) => unknown;
  expect(() => replace(1, "x", 2)).toThrow(
    "Cannot use replaceProperty on a primitive value; number given",
  );
  expect(() => replace({}, undefined, 2)).toThrow("No property name supplied");
  expect(() => replace({}, "missing", 2)).toThrow(
    "Property `missing` does not exist in the provided object",
  );
  expect(() => replace(Object.freeze({ fixed: 1 }), "fixed", 2)).toThrow(
    "Property `fixed` is not declared configurable",
  );
  expect(() => replace({ get value() { return 1; } }, "value", 2)).toThrow(
    "Cannot replace the `value` property because it has a getter. Use `jest.spyOn(object, 'value', 'get').mockReturnValue(value)` instead.",
  );
  expect(() => replace({ method() {} }, "method", 2)).toThrow(
    "Cannot replace the `method` property because it is a function. Use `jest.spyOn(object, 'method')` instead.",
  );
});
