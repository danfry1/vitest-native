/**
 * The mock conformance probe (docs/mock-conformance-gate.md in the planning repository):
 * checks a module as the engine serves it against the contract its installed package
 * declares (scripts/conformance/extract-contract.mjs). Every declared export must exist with
 * its kind; every function is called with arguments made from its parameter types (a hook,
 * `use*`, inside a render) and what it returns must have the declared shape: each member
 * present with its kind, nominal types such as Reanimated's SharedValue checked whole.
 *
 * A waiver (`{ export, path?, reason, issue }`) accepts one failure; a waiver that no
 * longer fails is itself a failure, so the list cannot go stale. Members the module gives
 * beyond the declared ones are reported, not failed.
 */
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import { expect, it } from "vitest";
import {
  describeShape,
  differences,
  extras,
  type Contract,
  type ExportContract,
  type Shape,
} from "./shape";

export interface Waiver {
  export: string;
  path?: string;
  reason: string;
  issue: string;
}
export interface ProbeOptions {
  /** Arguments for exports whose parameter types cannot make working ones. */
  args?: Record<string, () => unknown[]>;
  /** Exports not to call (still checked for presence and kind), with why. */
  noCall?: Record<string, string>;
  /** What hooks render inside (a provider the library needs). */
  wrapper?: (children: React.ReactNode) => React.ReactElement;
}

/** A value for a parameter of `shape`. */
function argument(shape: Shape): unknown {
  switch (shape.kind) {
    case "number":
      return 0;
    case "string":
      return "";
    case "boolean":
      return false;
    case "array":
      return [];
    case "function":
      // A callback that answers something: an updater (useAnimatedStyle's) returns an object.
      return () => ({});
    case "object":
      return Object.fromEntries(
        Object.entries(shape.members ?? {})
          .filter(([, member]) => !member.optional)
          .map(([name, member]) => [name, argument({ ...member, members: undefined })]),
      );
    default:
      // Any, unknown or a type parameter: an object, which most generic functions pass on.
      return {};
  }
}

/** Arguments for `contract`'s required parameters. */
function argumentsFor(contract: ExportContract): unknown[] {
  const parameters = contract.parameters ?? [];
  const last = parameters.reduce((at, p, i) => (p.optional ? at : i), -1);
  return parameters.slice(0, last + 1).map(argument);
}

/** Renders `call` as a hook and returns what it gave, or throws what it threw. */
async function inRender(
  call: () => unknown,
  wrapper: ProbeOptions["wrapper"] = (children) => <>{children}</>,
): Promise<unknown> {
  let given: unknown;
  let thrown: unknown;
  function Probe() {
    try {
      given = call();
    } catch (error) {
      thrown = error;
    }
    return <Text>probe</Text>;
  }
  await render(wrapper(<Probe />));
  if (thrown !== undefined) throw thrown;
  return given;
}

const COMPONENT_TYPES = new Set(["ReactElement", "ReactNode", "Element", "JSX.Element"]);

/** Registers one test per declared export of `contract`, against `module`. */
export function probeModule(
  module: Record<string, unknown>,
  contract: Contract,
  waivers: Waiver[],
  options: ProbeOptions = {},
): void {
  const used = new Set<Waiver>();
  const report: { unchecked: string[]; extra: string[] } = { unchecked: [], extra: [] };

  const waive = (name: string, found: string[]) =>
    found.filter((line) => {
      const waiver = waivers.find(
        (w) => w.export === name && (w.path === undefined || line.startsWith(w.path)),
      );
      if (waiver) used.add(waiver);
      return !waiver;
    });

  for (const [name, declared] of Object.entries(contract.exports)) {
    it(`${contract.package} ${contract.version}: ${name}`, async () => {
      const found: string[] = [];
      if (!(name in module)) {
        found.push(`${name}: missing, declared ${describeShape(declared)}`);
      } else {
        const value = module[name];
        if (declared.kind === "class") {
          if (typeof value !== "function")
            found.push(`${name}: is ${typeof value}, declared class`);
        } else if (declared.kind === "function") {
          if (typeof value !== "function") {
            // A component may be an exotic object (forwardRef, memo): checked, not called.
            found.push(...differences(value, { kind: "function" }, name));
            if (found.length === 0) report.unchecked.push(`${name} (a component)`);
          } else if (options.noCall?.[name] !== undefined) {
            report.unchecked.push(`${name} (${options.noCall[name]})`);
          } else if (
            /^[A-Z]/.test(name) ||
            (declared.returns?.type && COMPONENT_TYPES.has(declared.returns.type))
          ) {
            report.unchecked.push(`${name} (a component)`);
          } else {
            const args = options.args?.[name]?.() ?? argumentsFor(declared);
            const call = () => (value as (...a: unknown[]) => unknown)(...args);
            try {
              const given = /^use[A-Z]/.test(name) ? await inRender(call, options.wrapper) : call();
              if (declared.returns) {
                // The overload whose return the result matches, else the last one's differences.
                const shapes = [declared.returns, ...(declared.alsoReturns ?? [])];
                const matching = shapes.find((shape) => differences(given, shape, "").length === 0);
                const against = matching ?? declared.returns;
                found.push(...differences(given, against, `${name}()`));
                report.extra.push(...extras(given, against, `${name}()`));
              }
            } catch (error) {
              report.unchecked.push(
                `${name} (threw: ${String((error as Error)?.message ?? error).slice(0, 80)})`,
              );
            }
          }
        } else {
          found.push(...differences(value, declared, name));
          report.extra.push(...extras(value, declared, name));
        }
      }
      const remaining = waive(name, found);
      // One line per difference, in full: an array in an assertion message is truncated.
      if (remaining.length > 0)
        throw new Error(`differs from the declared API:\n${remaining.join("\n")}`);
    });
  }

  it(`${contract.package}: every waiver still applies`, () => {
    const stale = waivers.filter((w) => !used.has(w)).map((w) => `${w.export} ${w.path ?? ""}`);
    if (report.unchecked.length > 0 || report.extra.length > 0) {
      console.info(
        `[conformance] ${contract.package} ${contract.version}: ` +
          `${Object.keys(contract.exports).length} exports; ` +
          `not called: ${report.unchecked.length}; beyond the types: ${report.extra.length}\n` +
          report.unchecked.map((line) => `  not called: ${line}`).join("\n") +
          (report.extra.length ? `\n  beyond the types: ${report.extra.join(", ")}` : ""),
      );
    }
    expect(stale, "waivers that no longer fail (remove them)").toEqual([]);
  });
}
