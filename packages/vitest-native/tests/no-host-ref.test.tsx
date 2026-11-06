/**
 * No host node carries `ref`. React 19 passes `ref` as a prop to a host given by its name,
 * so a mock rendering `createElement("Name", { ...props, ref })` put `ref={null}` (or the
 * ref) among the host's props, where toJSON(), snapshots and RNTL read them. Every mock
 * host renders through one class per host name instead (src/mocks/host.ts).
 *
 * Renders every component the mock engine's react-native exports and every component of
 * every preset module (each factory called directly, so a preset counts whether or not
 * its package is installed here), plus each navigator a preset's create*Navigator()
 * makes, and checks every host in each tree.
 */
import React from "react";
import * as ReactNative from "react-native";
import { render } from "@testing-library/react-native";
import { afterAll, expect, it } from "vitest";
import * as Presets from "../src/presets/index.js";

type JsonNode = { type: string; props: Record<string, unknown>; children: JsonNode[] | null };

const FORWARD_REF = Symbol.for("react.forward_ref");
const MEMO = Symbol.for("react.memo");

function isComponent(key: string, value: unknown): value is React.ElementType {
  if (!/^[A-Z]/.test(key)) return false;
  if (typeof value === "function") return true;
  const tag = (value as { $$typeof?: symbol } | null)?.$$typeof;
  return tag === FORWARD_REF || tag === MEMO;
}

// Props that let lists and containers render without a test's own data.
const PROPS = {
  data: [],
  sections: [],
  renderItem: () => null,
  keyExtractor: (_item: unknown, index: number) => String(index),
  source: { uri: "file:///x.png" },
};

function hosts(node: JsonNode | JsonNode[] | string | null, out: JsonNode[] = []): JsonNode[] {
  if (Array.isArray(node)) for (const child of node) hosts(child, out);
  else if (node && typeof node === "object") {
    out.push(node);
    for (const child of node.children ?? []) hosts(child, out);
  }
  return out;
}

function presetModules(): [string, Record<string, unknown>][] {
  const modules: [string, Record<string, unknown>][] = [];
  for (const [presetName, make] of Object.entries(Presets)) {
    if (typeof make !== "function") continue;
    const preset = (make as () => { modules: Record<string, { factory(): unknown }> })();
    for (const [moduleName, module] of Object.entries(preset.modules)) {
      let exports: unknown;
      try {
        exports = module.factory();
      } catch {
        continue;
      }
      if (exports && typeof exports === "object") {
        modules.push([`${presetName}: ${moduleName}`, exports as Record<string, unknown>]);
      }
    }
  }
  return modules;
}

const sources: [string, Record<string, unknown>][] = [
  ["react-native", ReactNative as unknown as Record<string, unknown>],
  ...presetModules(),
];
// A navigator renders inside the navigation preset's container, whichever module made it.
const navigation = sources.find(([, exports]) =>
  Object.prototype.hasOwnProperty.call(exports, "NavigationContainer"),
);
const container =
  (navigation?.[1].NavigationContainer as React.ElementType | undefined) ?? React.Fragment;

/** Every element to render: each component export, and each create*Navigator()'s navigator. */
const cases: [string, () => React.ReactElement | null][] = [];
for (const [source, exports] of sources) {
  for (const [key, value] of Object.entries(exports)) {
    if (isComponent(key, value)) {
      cases.push([`${source}.${key}`, () => React.createElement(value, PROPS)]);
    } else if (/^create\w*Navigator$/.test(key) && typeof value === "function") {
      cases.push([
        `${source}.${key}`,
        () => {
          const made = (
            value as () => { Navigator?: React.ElementType; Screen?: React.ElementType }
          )();
          if (!made?.Navigator || !made.Screen) return null;
          return React.createElement(
            container,
            null,
            React.createElement(
              made.Navigator,
              null,
              React.createElement(made.Screen, { name: "home", component: () => null }),
            ),
          );
        },
      ]);
    }
  }
}

// How many cases rendered a tree: the renders are the evidence, so a run that rendered
// almost nothing proves nothing.
let rendered = 0;
afterAll(() => {
  expect(rendered).toBeGreaterThan(100);
});

it.each(cases)("%s renders no host with a ref", async (_name, make) => {
  let tree: JsonNode | JsonNode[] | null = null;
  try {
    const element = make();
    if (element === null) return;
    tree = (await render(element)).toJSON() as JsonNode | JsonNode[] | null;
  } catch {
    return; // needs a provider or props of its own: not evidence either way
  }
  if (tree === null) return;
  rendered += 1;
  const withRef = hosts(tree)
    .filter((node) => Object.prototype.hasOwnProperty.call(node.props, "ref"))
    .map((node) => node.type);
  expect(withRef).toEqual([]);
});
