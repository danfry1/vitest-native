import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { reactNative } from "../src/plugin.js";
import { runPluginConfig } from "./plugin-config.js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
// @ts-expect-error — internal experimental runtime .mjs
import { loadMetroProfile, validateMetroProfile } from "../src/native/metro-profile.mjs";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-metro-profile-"));
afterAll(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

function write(file: string, source: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

function project(name: string): string {
  const root = path.join(fixtureRoot, name);
  fs.mkdirSync(root, { recursive: true });
  write(path.join(root, "package.json"), JSON.stringify({ name, private: true }));
  return root;
}

function installReactNativeMetro(root: string): void {
  const rnMetro = path.join(root, "node_modules/@react-native/metro-config");
  write(path.join(rnMetro, "package.json"), JSON.stringify({ name: "@react-native/metro-config" }));
  write(
    path.join(rnMetro, "index.js"),
    `
      exports.getDefaultConfig = async root => ({
        projectRoot: root,
        resolver: {
          sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
          assetExts: ['png', 'svg'],
          resolverMainFields: ['react-native', 'browser', 'main'],
          unstable_conditionNames: ['react-native'],
          unstable_conditionsByPlatform: {},
          resolveRequest: null,
        },
      });
      exports.mergeConfig = (base, next) => ({
        ...base,
        ...next,
        resolver: { ...base.resolver, ...next.resolver },
      });
    `,
  );
  const metro = path.join(rnMetro, "node_modules/metro-config");
  write(path.join(metro, "package.json"), JSON.stringify({ name: "metro-config" }));
  write(
    path.join(metro, "index.js"),
    `
      exports.resolveConfig = async file => {
        delete require.cache[file];
        return { isEmpty: false, filepath: file, config: require(file) };
      };
      exports.mergeConfig = (base, next) => ({
        ...base,
        ...next,
        resolver: { ...base.resolver, ...next.resolver },
      });
    `,
  );
}

function installExpoMetro(root: string): void {
  const expo = path.join(root, "node_modules/expo");
  write(
    path.join(expo, "package.json"),
    JSON.stringify({
      name: "expo",
      exports: { "./package.json": "./package.json", "./metro-config": "./metro-config.js" },
    }),
  );
  write(
    path.join(expo, "metro-config.js"),
    `
      const path = require('node:path');
      exports.loadUserConfig = async ({ projectRoot, overrideConfigPath }) => {
        const defaults = {
          projectRoot,
          resolver: {
            sourceExts: ['ts', 'tsx', 'mjs', 'js', 'jsx', 'json', 'cjs', 'scss', 'sass', 'css'],
            assetExts: ['png', 'avif', 'db'],
            resolverMainFields: ['react-native', 'browser', 'main'],
            unstable_conditionNames: [],
            unstable_conditionsByPlatform: { ios: ['react-native'], web: ['browser'] },
            resolveRequest: null,
          },
        };
        if (!overrideConfigPath) return defaults;
        delete require.cache[overrideConfigPath];
        const raw = require(overrideConfigPath);
        const next = typeof raw === 'function' ? await raw(defaults) : raw;
        return { ...defaults, ...next, resolver: { ...defaults.resolver, ...next.resolver } };
      };
    `,
  );
}

describe("bounded Metro profile loader", () => {
  it("uses each project's cwd and evaluates promise exports", async () => {
    const roots = [project("promise-one"), project("promise-two")];
    for (const root of roots) {
      write(
        path.join(root, "profile.json"),
        JSON.stringify([path.basename(root) === "promise-one" ? "js" : "tsx"]),
      );
      write(
        path.join(root, "metro.config.cjs"),
        `
        module.exports = Promise.resolve({ resolver: {
          sourceExts: JSON.parse(require('node:fs').readFileSync('./profile.json', 'utf8'))
        }});
      `,
      );
    }
    const results = await Promise.all(
      roots.map((projectRoot) => loadMetroProfile({ projectRoot })),
    );
    expect(results.map((result) => result.profile.sourceExts)).toEqual([["js"], ["tsx"]]);
  });

  it("does not execute a throwing config twice through an import retry", async () => {
    const root = project("throw-once");
    const marker = path.join(root, "evaluations.txt");
    write(
      path.join(root, "metro.config.cjs"),
      `
      require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'called\\n');
      throw new Error('ordinary evaluation failure');
    `,
    );
    await expect(loadMetroProfile({ projectRoot: root })).rejects.toThrow(
      "ordinary evaluation failure",
    );
    expect(fs.readFileSync(marker, "utf8")).toBe("called\n");
  });

  it("agrees on a typed source winner through CJS, ESM resolution and the compiled registry", () => {
    const root = project("runtime-profile");
    const rn = path.join(root, "node_modules/react-native");
    write(path.join(rn, "package.json"), '{"name":"react-native","main":"index.js"}');
    write(path.join(rn, "index.js"), "module.exports = require('./Feature');");
    write(path.join(rn, "Feature.js"), "module.exports = { winner: 'js' };");
    write(
      path.join(rn, "Feature.tsx"),
      "const winner: string = 'tsx'; module.exports = { winner };",
    );
    const req = createRequire(import.meta.url);
    for (const name of ["@babel/core", "@react-native/babel-preset"]) {
      const target = path.join(root, "node_modules", name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(path.dirname(req.resolve(`${name}/package.json`)), target, "dir");
    }
    const runtime = new URL("../src/native/", import.meta.url);
    const script = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { pathToFileURL, fileURLToPath } from 'node:url';
      import { buildRegistry } from ${JSON.stringify(new URL("registry.mjs", runtime).href)};
      import { installRequireHooks } from ${JSON.stringify(new URL("hooks.mjs", runtime).href)};
      import { initialize, resolve } from ${JSON.stringify(new URL("loader.mjs", runtime).href)};
      const root = ${JSON.stringify(root)};
      const sourceExts = ['tsx', 'js'];
      const req = createRequire(root + '/package.json');
      const registry = buildRegistry({ projectRoot: root, sourceExts, failOnError: true });
      assert.ok(registry);
      assert.equal(req(registry).winner, 'tsx');
      await initialize({ projectRoot: root, sourceExts });
      const result = await resolve('./Feature', { parentURL: pathToFileURL(root + '/node_modules/react-native/index.js').href }, () => { throw new Error('unexpected Node fallback'); });
      assert.ok(fileURLToPath(result.url).endsWith('Feature.tsx'));
      installRequireHooks(root, [], 'ios', '0.0.0', [], sourceExts);
      assert.equal(req('react-native').winner, 'tsx');
    `;
    execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
  });
  it("extracts bare React Native defaults without retaining Metro in the parent", async () => {
    const root = project("bare-default");
    installReactNativeMetro(root);

    const result = await loadMetroProfile({ projectRoot: root, platform: "ios" });

    expect(result.profile).toMatchObject({
      framework: "react-native",
      configPath: null,
      sourceExts: ["js", "jsx", "json", "ts", "tsx"],
      assetExts: ["png", "svg"],
      resolverMainFields: ["react-native", "browser", "main"],
      conditionNames: ["react-native"],
      customResolver: false,
      provenance: "react-native-default",
    });
    expect(result.evidence.heapMb).toBe(128);
    expect(result.evidence.attempts).toBe(1);
  });

  it("uses Expo's actual config-loading seam and preserves Expo extension order", async () => {
    const root = project("expo-default");
    installExpoMetro(root);

    const result = await loadMetroProfile({ projectRoot: root, platform: "ios" });

    expect(result.profile).toMatchObject({
      framework: "expo",
      sourceExts: ["ts", "tsx", "mjs", "js", "jsx", "json", "cjs", "scss", "sass", "css"],
      assetExts: ["png", "avif", "db"],
      conditionNames: ["react-native"],
      provenance: "expo-default",
    });
  });

  it("loads function configs, tolerates stdout, and reports unsupported custom resolution", async () => {
    const root = project("function-config");
    installReactNativeMetro(root);
    const config = path.join(root, "metro.config.cjs");
    write(
      config,
      `
        module.exports = async defaults => {
          console.log('user Metro config wrote to stdout');
          return {
            resolver: {
              ...defaults.resolver,
              sourceExts: ['tsx', 'js'],
              assetExts: ['png', 'db'],
              resolverMainFields: ['react-native', 'main'],
              unstable_conditionNames: ['custom-condition'],
              unstable_conditionsByPlatform: { android: ['android-condition'] },
              resolveRequest() {},
            },
          };
        };
      `,
    );

    const result = await loadMetroProfile({ projectRoot: root, platform: "android" });

    expect(result.profile).toMatchObject({
      configPath: config,
      sourceExts: ["tsx", "js"],
      assetExts: ["png", "db"],
      resolverMainFields: ["react-native", "main"],
      conditionNames: ["custom-condition", "android-condition"],
      customResolver: true,
      provenance: "metro-config",
    });
  });

  it("uses explicit fallback defaults when the framework Metro package is absent", async () => {
    const root = project("fallback-default");
    const result = await loadMetroProfile({ projectRoot: root });

    expect(result.profile.framework).toBe("fallback");
    expect(result.profile.sourceExts).toEqual(["js", "jsx", "json", "ts", "tsx"]);
    expect(result.profile.assetExts).toContain("pdf");
    expect(result.profile.assetExts).toContain("zip");
  });

  it("turns malformed config execution into a bounded, actionable failure", async () => {
    const root = project("malformed");
    installReactNativeMetro(root);
    write(path.join(root, "metro.config.cjs"), "throw new Error('fixture config exploded');");

    await expect(loadMetroProfile({ projectRoot: root })).rejects.toThrow(
      /Could not load Metro profile:.*fixture config exploded/s,
    );
  });

  it("answers as soon as the profile is read, even if the config leaves handles open", async () => {
    // Metro and Expo loaders can leave timers, watchers or sockets behind. The parent
    // settles when the child exits, so a child that waited for its event loop to
    // drain reported a valid profile as a timeout after 30 seconds.
    const root = project("open-handle");
    installReactNativeMetro(root);
    write(
      path.join(root, "metro.config.cjs"),
      "setInterval(() => {}, 1000);\nmodule.exports = {};",
    );
    const started = Date.now();
    const result = await loadMetroProfile({ projectRoot: root });
    expect(result.profile.framework).toBe("react-native");
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);

  it("tolerates a config that logs heavily; only the answer channel is capped", async () => {
    // The fallback path awaits a promise export, so the log is flushed before the answer.
    const root = project("chatty");
    write(
      path.join(root, "metro.config.cjs"),
      // Resolve only once the log is flushed, so it all reaches the parent.
      "module.exports = new Promise((resolve) =>\n" +
        "  process.stdout.write('x'.repeat(2 * 1024 * 1024), () => resolve({})),\n);",
    );
    const result = await loadMetroProfile({ projectRoot: root });
    expect(result.profile.framework).toBe("fallback");
  });

  it("accepts compound extensions and rejects anything path-like", () => {
    const profile = (sourceExts: string[]) =>
      validateMetroProfile(
        {
          schemaVersion: 1,
          framework: "react-native",
          sourceExts,
          assetExts: [],
          resolverMainFields: ["main"],
          conditionNames: [],
        },
        "/project",
      );
    expect(profile(["web.js", "js"]).sourceExts).toEqual(["web.js", "js"]);
    for (const bad of ["a/b", "../js", ".js", "js.", "a\\b"]) {
      expect(() => profile([bad]), bad).toThrow("invalid sourceExts");
    }
  });

  it("reports a failing config by its message, not a stack trace", async () => {
    const root = project("failing-message");
    installReactNativeMetro(root);
    write(path.join(root, "metro.config.cjs"), "throw new Error('fixture config exploded');");
    const error = await loadMetroProfile({ projectRoot: root }).catch((e: Error) => e);
    expect((error as Error).message).toContain("fixture config exploded");
    expect((error as Error).message).not.toMatch(/\n\s+at /);
  });

  it("does not trust malformed data returned across the child boundary", () => {
    expect(() =>
      validateMetroProfile(
        {
          schemaVersion: 1,
          framework: "expo",
          sourceExts: ["ts", 42],
          assetExts: [],
          resolverMainFields: ["main"],
          conditionNames: [],
        },
        "/project",
      ),
    ).toThrow("invalid sourceExts");
  });
});

describe("Metro profile plugin integration", () => {
  it("wires ordered sources to Vite and honors asset-to-source movement", async () => {
    const root = project("plugin-profile");
    write(
      path.join(root, "metro.config.cjs"),
      `module.exports = { resolver: {
        sourceExts: ['tsx', 'js', 'svg'],
        assetExts: ['png'],
        resolverMainFields: ['react-native', 'browser', 'main'],
        unstable_conditionNames: ['react-native'],
      }};`,
    );

    const config = await runPluginConfig(reactNative({ engine: "mock", metroConfig: true }), {
      root,
    });
    expect(config.resolve.extensions.slice(0, 6)).toEqual([
      ".ios.tsx",
      ".native.tsx",
      ".tsx",
      ".ios.js",
      ".native.js",
      ".js",
    ]);
    const assets = JSON.parse(config.test.env.VITEST_NATIVE_ASSET_EXTS);
    expect(assets).toContain("png");
    expect(assets).not.toContain("svg");
    expect(assets).toEqual(["png"]);
    expect(JSON.parse(config.test.env.VITEST_NATIVE_SOURCE_EXTS)).toEqual(["tsx", "js", "svg"]);
  });

  it("applies the declarative profile beside an imperative resolver and names the gap once", async () => {
    const root = project("plugin-custom-resolver");
    write(
      path.join(root, "metro.config.cjs"),
      `module.exports = { resolver: {
        sourceExts: ['js'], assetExts: ['png'],
        resolverMainFields: ['main'], resolveRequest() {},
      }};`,
    );

    const warned: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message) => warned.push(String(message));
    try {
      const config = await runPluginConfig(reactNative({ engine: "mock", metroConfig: true }), {
        root,
      });
      expect(config.resolve.extensions.slice(0, 3)).toEqual([".ios.js", ".native.js", ".js"]);
    } finally {
      console.warn = originalWarn;
    }
    expect(warned.filter((message) => message.includes("does not run under Vitest"))).toHaveLength(
      1,
    );
  });

  it("keeps each failure's own code and adds the config hint only to load failures", async () => {
    const invalid = project("plugin-invalid-profile");
    installReactNativeMetro(invalid);
    write(
      path.join(invalid, "metro.config.cjs"),
      `module.exports = { resolver: { sourceExts: ['js', 'a/b'], assetExts: [] } };`,
    );
    const invalidError = await runPluginConfig(reactNative({ engine: "mock", metroConfig: true }), {
      root: invalid,
    }).catch((e: Error & { code?: string }) => e);
    expect((invalidError as { code?: string }).code).toBe("METRO_PROFILE_INVALID");
    expect((invalidError as Error).message).not.toContain("Fix the Metro config");

    const broken = project("plugin-broken-config");
    installReactNativeMetro(broken);
    write(path.join(broken, "metro.config.cjs"), "throw new Error('fixture config exploded');");
    const loadError = await runPluginConfig(reactNative({ engine: "mock", metroConfig: true }), {
      root: broken,
    }).catch((e: Error & { code?: string }) => e);
    expect((loadError as { code?: string }).code).toBe("METRO_CONFIG_LOAD_FAILED");
    expect((loadError as Error).message).toContain("fixture config exploded");
    expect((loadError as Error).message).toContain("Fix the Metro config");
    expect((loadError as Error).message.match(/\[vitest-native\]/g)).toHaveLength(1);
  });

  it("supports an explicit legacy-profile escape hatch", async () => {
    const root = project("plugin-metro-off");
    write(path.join(root, "metro.config.cjs"), "throw new Error('must not execute');");

    const config = await runPluginConfig(reactNative({ engine: "mock", metroConfig: false }), {
      root,
    });
    expect(config.resolve.extensions.slice(0, 3)).toEqual([".ios.js", ".native.js", ".js"]);
  });
});
