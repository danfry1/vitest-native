/**
 * The conformance gate's two halves without React Native: the contract extractor
 * (scripts/conformance/extract-contract.mjs) on the installed react-native-reanimated, and
 * the shape comparison (tests-native/conformance/shape.ts) the probes use.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractContract } from "../scripts/conformance/extract-contract.mjs";
import { differences, extras, type Shape } from "../tests-native/conformance/shape";

const packageRoot = path.dirname(createRequire(import.meta.url).resolve("../package.json"));

describe("extractContract", () => {
  const contract = extractContract("react-native-reanimated", packageRoot);

  it("reads a hook's declared return type, a named interface with its members", () => {
    const timestamp = contract.exports.useTimestamp;
    expect(timestamp.kind).toBe("function");
    expect(timestamp.returns.type).toBe("SharedValue");
    expect(Object.keys(timestamp.returns.members).sort()).toEqual([
      "addListener",
      "get",
      "modify",
      "removeListener",
      "set",
      "value",
    ]);
    expect(timestamp.returns.members.value.kind).toBe("number");
  });

  it("tells classes, objects and arrays apart, and keeps only value exports", () => {
    expect(contract.exports.FadeIn.kind).toBe("class");
    expect(contract.exports.Easing.kind).toBe("object");
    expect(contract.exports.convertToRGBA.returns.kind).toBe("array");
    expect(contract.exports.SharedValue).toBeUndefined(); // an interface, nothing at runtime
  });
});

describe("differences", () => {
  const sharedValue: Shape = {
    kind: "object",
    type: "SharedValue",
    members: { value: { kind: "number" }, get: { kind: "function" }, modify: { kind: "function" } },
  };

  it("names each missing member and wrong kind, by path", () => {
    expect(differences({ value: 0, get: () => 0 }, sharedValue, "useTimestamp()")).toEqual([
      "useTimestamp().modify: missing, declared function",
    ]);
    expect(differences(0, sharedValue, "kb.height")).toEqual([
      "kb.height: is number, declared object SharedValue",
    ]);
  });

  it("accepts what conforms: an optional member left out, an exotic component, unchecked types", () => {
    const value = { value: 0, get: () => 0, modify: () => {} };
    expect(differences(value, sharedValue, "x")).toEqual([]);
    expect(differences(undefined, { kind: "number", optional: true }, "x")).toEqual([]);
    expect(
      differences({ $$typeof: Symbol.for("react.forward_ref") }, { kind: "function" }, "x"),
    ).toEqual([]);
    expect(differences("anything", { kind: "unchecked" }, "x")).toEqual([]);
  });

  it("reads a member through a Proxy that answers any read, and checks what it gives", () => {
    // bottom-sheet's mock: useBottomSheetInternal() is a Proxy with no `has` trap, which
    // answers every unknown read with a { value, get, set } stub.
    const stub = { value: 0, get: () => 0, set: () => {} };
    const internal = new Proxy({} as Record<string, unknown>, { get: () => stub });
    const declared: Shape = {
      kind: "object",
      members: { animatedIndex: sharedValue, enableOverDrag: { kind: "boolean" } },
    };
    expect(differences(internal, declared, "useBottomSheetInternal()")).toEqual([
      "useBottomSheetInternal().animatedIndex.modify: missing, declared function",
      "useBottomSheetInternal().enableOverDrag: is object, declared boolean",
    ]);
  });

  it("lists members beyond the declared ones, but not an enum's reverse mapping", () => {
    expect(extras({ value: 0, get: 0, modify: 0, extra: 1, 0: "A" }, sharedValue, "x")).toEqual([
      "x.extra",
    ]);
  });
});
