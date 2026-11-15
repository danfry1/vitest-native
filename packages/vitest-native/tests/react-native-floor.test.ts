/**
 * The React Native releases the native engine supports, and what an older one is told.
 *
 * The range is the rows of the CI matrix (.github/rn-matrix.json). Below its floor the
 * native engine has no code path, so the plugin stops with UNSUPPORTED_PEER and doctor
 * reports a blocking problem; a newer release only warns. The mock engine does not load
 * React Native, so the range does not apply there.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import { runDoctor } from "../src/cli/doctor.js";
import { validatePeerDependency } from "../src/validate.js";
import {
  isBelowSupportedReactNative,
  PEER_REQUIREMENTS,
  SUPPORTED_REACT_NATIVE,
  unsupportedReactNativeMessage,
} from "../src/peer-requirements.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromPackage = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const temps: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const realDir = (name: string) => path.dirname(fromPackage.resolve(`${name}/package.json`));

/**
 * A project whose `react-native` reports `version`: the real package's files, linked one
 * by one, under a package.json of its own, beside the real Babel toolchain, React and
 * Vite, so the native engine can start against it.
 */
function projectWithReactNative(version: string): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rn-start-"));
  temps.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  const rn = path.join(root, "node_modules", "react-native");
  fs.mkdirSync(rn, { recursive: true });
  const real = realDir("react-native");
  for (const entry of fs.readdirSync(real)) {
    if (entry === "package.json") continue;
    fs.symlinkSync(path.join(real, entry), path.join(rn, entry));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(real, "package.json"), "utf8"));
  fs.writeFileSync(path.join(rn, "package.json"), JSON.stringify({ ...manifest, version }));
  for (const name of ["@babel/core", "@react-native/babel-preset", "react", "vite"]) {
    const target = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(realDir(name), target, "dir");
  }
  return root;
}

async function start(engine: "native" | "mock", root: string): Promise<unknown> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // These check React Native's version floor, not the precompiled registry. The project is
  // new each time, so its registry cache is always cold: on CI the plugin would wait for a
  // full compile inside the test's budget, and locally it would leave one compiling in the
  // background against a directory afterEach removes. Under a loaded machine that overran
  // 30 s.
  vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
  const plugin = reactNative({ engine, hotRuntime: false }) as any;
  const vite = (await import("vite")) as { version: string };
  await plugin.config.handler.call(
    { meta: { viteVersion: vite.version } },
    { root },
    { command: "serve", mode: "test" },
  );
  try {
    await plugin.configResolved({ root, plugins: [], test: {} });
    return null;
  } catch (error) {
    return error;
  }
}

// Each starts the native engine against a real React Native install: seconds, more under a
// full parallel suite.
describe("starting the plugin", { timeout: 30_000 }, () => {
  it("stops the native engine on a React Native below the floor, naming it", async () => {
    const error = (await start("native", projectWithReactNative("0.85.3"))) as {
      code?: string;
      message?: string;
    } | null;
    expect(error?.code).toBe("UNSUPPORTED_PEER");
    expect(error?.message).toContain(
      "react-native 0.85.3 is not supported: the native engine supports react-native " +
        "0.86–0.88. Upgrade react-native to 0.86 or later (Expo SDK 57 or later).",
    );
  });

  it("starts the native engine on a supported one", async () => {
    expect(await start("native", projectWithReactNative("0.86.0"))).toBeNull();
  });

  it("leaves the mock engine alone, which does not load React Native", async () => {
    expect(await start("mock", projectWithReactNative("0.85.3"))).toBeNull();
  });
});

describe("the supported React Native releases", () => {
  it("are the rows of the CI matrix", () => {
    const matrix = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, "../../.github/rn-matrix.json"), "utf8"),
    ) as { rn: string[] };
    const minors = matrix.rn.map((row) => Number(row.split(".")[1]));
    expect(SUPPORTED_REACT_NATIVE).toEqual({
      minimumMinor: Math.min(...minors),
      maximumMinor: Math.max(...minors),
    });
  });
});

describe("unsupportedReactNativeMessage", () => {
  it("says nothing for a supported release", () => {
    expect(unsupportedReactNativeMessage("0.86.0")).toBeNull();
    expect(unsupportedReactNativeMessage("0.88.0")).toBeNull();
    expect(unsupportedReactNativeMessage("0.87.1-rc.2")).toBeNull();
    expect(isBelowSupportedReactNative("0.86.0")).toBe(false);
  });

  it("names the floor below it", () => {
    expect(isBelowSupportedReactNative("0.85.3")).toBe(true);
    expect(unsupportedReactNativeMessage("0.85.3")).toBe(
      "react-native 0.85.3 is not supported: the native engine supports react-native " +
        "0.86–0.88. Upgrade react-native to 0.86 or later (Expo SDK 57 or later).",
    );
  });

  it("only warns above the range", () => {
    expect(isBelowSupportedReactNative("0.89.0")).toBe(false);
    expect(unsupportedReactNativeMessage("0.89.0")).toMatch(
      /^react-native 0\.89\.0 is newer than this release supports/,
    );
  });

  it("says nothing about a version it cannot read", () => {
    expect(unsupportedReactNativeMessage("1.0.0")).toBeNull();
    expect(isBelowSupportedReactNative("next")).toBe(false);
  });
});

describe("doctor", () => {
  /** A project whose engine resolves to native, with `react-native` at `version`. */
  function nativeProject(version: string): string {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-rn-floor-"));
    temps.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    const rn = path.join(root, "node_modules", "react-native");
    fs.mkdirSync(rn, { recursive: true });
    fs.writeFileSync(
      path.join(rn, "package.json"),
      JSON.stringify({ name: "react-native", version }),
    );
    for (const name of ["@babel/core", "@react-native/babel-preset"]) {
      const target = path.join(root, "node_modules", ...name.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(path.dirname(fromPackage.resolve(`${name}/package.json`)), target, "dir");
    }
    return root;
  }

  it("reports a React Native below the floor as blocking", () => {
    const { lines, ok } = runDoctor(nativeProject("0.85.3"), "24.13.0");
    expect(lines.join("\n")).toContain("✗ react-native 0.85.3 is not supported");
    expect(ok).toBe(false);
  });

  it("passes a supported one", () => {
    const { lines } = runDoctor(nativeProject("0.86.0"), "24.13.0");
    expect(lines.join("\n")).not.toContain("react-native 0.86.0 is not supported");
    expect(lines.join("\n")).toContain("resolves to NATIVE");
  });
});

describe("the React floor", () => {
  const reactReq = PEER_REQUIREMENTS.find((r) => r.name === "react")!;

  it("is the published peer range and a blocking requirement", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { peerDependencies: Record<string, string> };
    expect(manifest.peerDependencies.react).toBe(">=19");
    expect(reactReq).toMatchObject({ minimum: "19.0.0" });
    expect(reactReq.optional).toBeFalsy();
  });

  it("refuses React 18, naming the floor", () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-react-floor-"));
    temps.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
    const react = path.join(root, "node_modules", "react");
    fs.mkdirSync(react, { recursive: true });
    fs.writeFileSync(
      path.join(react, "package.json"),
      JSON.stringify({ name: "react", version: "18.3.1" }),
    );
    expect(validatePeerDependency("react", reactReq.minimum, root, reactReq.maximumMajor)).toMatch(
      /requires react >= 19\.0\.0, but found 18\.3\.1/,
    );
  });
});
