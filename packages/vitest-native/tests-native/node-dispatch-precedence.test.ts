/**
 * The precedence of Node's CommonJS loader in a test worker (ADR-0007), as an
 * installed package that Node loads sees it: `dispatch-consumer-lib` requires or
 * imports whatever it is asked for. One dispatcher per hook runs the engine's
 * interceptors as ordered steps (src/node-dispatch.mjs); these are the pairs that
 * order decides, outermost first:
 *
 *   per-file mock (jest.mock) > preset > React Native registry > Node
 *
 * plus the two side channels that reach a step without going through `Module._load`:
 * React Native's own requires inside the registry consult the per-file mocks
 * (`__vitest_native_node_mock_for`), and Node's ESM loader gets a preset through
 * `__vitest_native_preset_require`.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { AppState as ImportedAppState } from "react-native";
import { describe, expect, it } from "vitest";
import { importFrom, requireFrom } from "dispatch-consumer-lib";
import { projectContext } from "../src/context.mjs";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("react-native-safe-area-context", () => ({ source: "per-file mock" }));
jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  default: { currentState: "per-file mock" },
}));
jest.mock("os", () => ({ source: "per-file mock" }));

const projectRoot = projectContext()?.projectRoot ?? process.cwd();
const req = createRequire(path.join(projectRoot, "package.json"));
const presets = (globalThis as { __vitest_native_preset_mocks?: Record<string, unknown> })
  .__vitest_native_preset_mocks!;

describe("Node dispatch precedence, from an installed package", () => {
  // Asserts the registry: the per-file lane (vitest.per-file.config.mts) runs without one.
  it.skipIf(process.env.VITEST_NATIVE_NO_REGISTRY === "1")(
    "runs the steps in one order: library support, per-file mocks, preset, registry",
    async () => {
      const { nodeDispatch } = (await import("../src/node-dispatch.mjs")) as any;
      expect(nodeDispatch().load.names).toEqual(["librarySupport", "mocks", "preset", "registry"]);
      // The hot runtime's tracker, when installed, records what every other step settled on.
      const resolveNames: string[] = nodeDispatch().resolve.names;
      expect(resolveNames).toEqual(
        resolveNames.includes("tracker") ? ["tracker", "hooks", "recovery"] : ["hooks", "recovery"],
      );
    },
  );

  it("a per-file jest.mock beats a preset", () => {
    expect(requireFrom("react-native-safe-area-context")).toEqual({ source: "per-file mock" });
  });

  it("a preset beats the installed package", () => {
    const netinfo = requireFrom("@react-native-community/netinfo");
    expect(netinfo).toBe(presets["@react-native-community/netinfo"]);
  });

  // Asserts the registry: the per-file lane (vitest.per-file.config.mts) runs without one.
  it.skipIf(process.env.VITEST_NATIVE_NO_REGISTRY === "1")(
    "the React Native registry serves react-native, one instance with the test's",
    () => {
      const registry = req(projectContext()!.registry as string);
      expect(requireFrom("react-native").Platform).toBe(registry.Platform);
    },
  );

  it("a builtin is Node's, past a per-file mock (documented divergence from Jest)", () => {
    // The test's own import of os is the mock (Vite's graph); Node's is the builtin.
    expect(requireFrom("os")).toBe(process.getBuiltinModule("os"));
  });

  describe("side channels", () => {
    it("React Native's own require inside the registry gets a per-file mock", () => {
      expect(requireFrom("react-native").AppState.currentState).toBe("per-file mock");
      expect(ImportedAppState.currentState).toBe("per-file mock");
    });

    it("Node's ESM loader gets the preset, as require does", async () => {
      const ns = (await importFrom("@react-native-community/netinfo")) as Record<string, unknown>;
      const preset = presets["@react-native-community/netinfo"] as Record<string, unknown>;
      expect(ns.fetch).toBe(preset.fetch);
    });
  });
});
