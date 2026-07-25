/**
 * Tests for the snapshot serializer.
 *
 * It had none. `setup.ts` registers it for every consumer, so it shapes every snapshot
 * a project writes, and 216 lines of it were unobserved — nothing in this repository
 * referenced the module or called `toMatchSnapshot`. Three defects were sitting in it:
 * a circular prop threw, structurally equal props serialized differently, and
 * non-element children were indented one level too deep.
 */
import { describe, expect, it } from "vitest";
import { serializer } from "../src/serializer.js";

const config = { indent: "  " };
/** Stands in for pretty-format's recursive printer, echoing the indent it is given. */
const printer = (_val: unknown, _c: unknown, indentation: string) => `${indentation}<PRINTED>`;

const ser = (val: unknown, indentation = "", depth = 0) =>
  serializer.serialize(val, config, indentation, depth, [], printer);

const el = (type: string, props: Record<string, unknown> = {}, children: unknown[] = []) => ({
  type,
  props,
  children,
});

describe("serializer.test", () => {
  it("accepts test-instance and React-element shapes", () => {
    expect(serializer.test(el("View"))).toBe(true);
    expect(
      serializer.test({ $$typeof: Symbol.for("react.element"), type: "View", props: {} }),
    ).toBe(true);
  });

  it("rejects values it must not claim", () => {
    for (const value of [null, undefined, "text", 42, {}, { type: "View" }]) {
      expect(serializer.test(value)).toBe(false);
    }
  });
});

describe("serializer.serialize", () => {
  it("renders a childless element self-closing", () => {
    expect(ser(el("View"))).toBe("<View />");
  });

  it("puts each prop on its own line, sorted by name", () => {
    expect(ser(el("View", { testID: "b", accessible: false }))).toBe(
      '<View\n  accessible={false}\n  testID="b"\n/>',
    );
  });

  it("renders a true boolean prop bare, JSX-style", () => {
    expect(ser(el("View", { accessible: true }))).toBe("<View\n  accessible\n/>");
  });

  it("inlines a single string child", () => {
    expect(ser(el("Text", {}, ["Hello"]))).toBe("<Text>\n  Hello\n</Text>");
  });

  it("omits React internals from the output", () => {
    const out = ser(el("View", { testID: "keep", _owner: {}, key: "k", __reactFiber$abc: {} }));
    expect(out).toContain("testID");
    for (const hidden of ["_owner", "key", "__reactFiber$abc"]) expect(out).not.toContain(hidden);
  });

  it("stops descending past maxDepth", () => {
    expect(serializer.serialize(el("View"), { ...config, maxDepth: 2 }, "  ", 3, [], printer)).toBe(
      "  <...>",
    );
  });

  it("indents element and non-element children the same", () => {
    // The element branch passes nextIndentation to the printer; the fallback branch
    // also prepended it, so an object child landed a level deeper than a sibling
    // element for no reason.
    const elementChild = ser(el("View", {}, [el("Text")]));
    const objectChild = ser(el("View", {}, [{ notAnElement: true }]));
    expect(elementChild).toBe("<View>\n  <PRINTED>\n</View>");
    expect(objectChild).toBe("<View>\n  <PRINTED>\n</View>");
  });

  it("renders numeric children", () => {
    expect(ser(el("Text", {}, ["a", 7]))).toBe("<Text>\n  a\n  7\n</Text>");
  });
});

describe("prop values", () => {
  it("prints a cycle instead of throwing", () => {
    // A prop holding a navigation object, a store, or anything with a parent
    // back-reference raised "Converting circular structure to JSON", failing the test
    // with a TypeError rather than producing a snapshot.
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const out = ser(el("View", { data: circular }));
    expect(out).toContain("[Circular]");
    expect(out).toContain('"name":"loop"');
  });

  it("survives a cycle through an array", () => {
    const arr: unknown[] = [1];
    arr.push(arr);
    expect(() => ser(el("View", { data: arr }))).not.toThrow();
    expect(ser(el("View", { data: arr }))).toContain("[Circular]");
  });

  it("serializes structurally equal props identically whatever the key order", () => {
    const a = ser(el("View", { style: { a: 1, b: 2 } }));
    const b = ser(el("View", { style: { b: 2, a: 1 } }));
    expect(a).toBe(b);
  });

  it("sorts nested keys too, not just the top level", () => {
    const a = ser(el("View", { style: { outer: { x: 1, y: 2 } } }));
    const b = ser(el("View", { style: { outer: { y: 2, x: 1 } } }));
    expect(a).toBe(b);
  });

  it("keeps array order, which is meaningful", () => {
    expect(ser(el("View", { style: [{ a: 1 }, { b: 2 }] }))).toContain('[{"a":1},{"b":2}]');
    expect(ser(el("View", { style: [{ b: 2 }, { a: 1 }] }))).toContain('[{"b":2},{"a":1}]');
  });

  it("shows functions and undefined nested in a prop rather than dropping them", () => {
    // JSON.stringify removes both, so { onPress: fn } printed as {} — an empty object
    // that reads like missing data.
    const out = ser(
      el("View", { handlers: { onPress: function handlePress() {}, extra: undefined } }),
    );
    expect(out).toContain("[Function handlePress]");
    expect(out).toContain("[undefined]");
  });

  it("formats scalar props the way JSX does", () => {
    expect(ser(el("View", { s: "x" }))).toContain('s="x"');
    expect(ser(el("View", { n: 3 }))).toContain("n={3}");
    expect(ser(el("View", { b: false }))).toContain("b={false}");
    expect(ser(el("View", { z: null }))).toContain("z={null}");
    expect(ser(el("View", { u: undefined }))).toContain("u={undefined}");
    expect(ser(el("View", { f: function onLayout() {} }))).toContain("f={[Function onLayout]}");
  });
});

describe("type names", () => {
  it("resolves host, function, displayName and forwardRef types", () => {
    expect(ser({ type: "View", props: {}, children: [] })).toContain("<View");
    function MyComponent() {}
    expect(ser({ type: MyComponent, props: {}, children: [] })).toContain("<MyComponent");
    const named = () => {};
    (named as unknown as { displayName: string }).displayName = "Named";
    expect(ser({ type: named, props: {}, children: [] })).toContain("<Named");
    expect(ser({ type: { render: function Inner() {} }, props: {}, children: [] })).toContain(
      "<Inner",
    );
    // Genuinely nameless: an arrow assigned to `render` would be INFERRED as "render",
    // so only a function whose name is empty reaches the ForwardRef fallback.
    const anonymous = () => {};
    Object.defineProperty(anonymous, "name", { value: "" });
    expect(ser({ type: { render: anonymous }, props: {}, children: [] })).toContain("<ForwardRef");
    expect(ser({ type: {}, props: {}, children: [] })).toContain("<Unknown");
  });
});
