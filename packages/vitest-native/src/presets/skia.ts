import type { Preset, PresetModule } from "../types.js";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";
import { esmExportNames } from "./esm-export-names.js";
import { builtInPreset } from "./built-in.js";
import { projectContext } from "../context.mjs";

// Skia draws through a JSI binding to its C++, which throws at import in Node
// ("Native Skia Module failed to correctly install JSI Bindings"). Skia supports tests
// itself: its jestEnv.js loads CanvasKit, Skia compiled to WebAssembly, and its
// jestSetup.js mocks the package with `require("<skia>/lib/module/mock").Mock(global.CanvasKit)`.
// That is the JS Skia API backed by real Skia, so paths, matrices, colours and
// pictures compute as on a device, with the native views (Canvas, SkiaPictureView)
// as React Native Views. This preset does the same: prepare() loads CanvasKit, and
// the module is Skia's own Mock() over it, plus two things that mock leaves out:
// - Skia's Reanimated helpers (lib/commonjs/external/reanimated: usePathValue,
//   useTexture, notifyChange, ...), which the real package exports and the mock does
//   not. They are Skia's real JS, running over the reanimated preset.
// - matchFont() returns a font. Over CanvasKit, which has no system fonts, the real
//   one throws ("Cannot pass "undefined" as a sk_sp<Typeface>"); a device returns a
//   font of the requested size, so this returns Skia's default typeface at that size,
//   and so does useFont(), whose mock ignores the size.
//
// Skia is published as `react-native-skia` from 2.15.0 and as
// `@shopify/react-native-skia` up to 2.14.0. The preset shadows whichever of the two
// the project has installed, each from its own copy; a name that is not installed
// stays unresolvable, as it is in the app.
//
// The named exports are the installed version's, read from its ESM build (see
// esm-export-names.ts), because Skia's API changes between releases: 2.15.0 added
// SkiaGraphiteView, and 3.0.5 removed useVideo and the native-buffer helpers. The
// mock's names that the real package does not export (hooks from earlier releases)
// stay on the module object, as under Jest, but are not named exports.
//
// CanvasKit is loaded from the installed Skia's own dependency (canvaskit-wasm is
// Skia's, not the app's, and an isolated layout such as pnpm's does not hoist it),
// the way Skia's jestEnv.js loads it, before each test file: about 20-30 ms in a fresh
// worker. It cannot load synchronously: Emscripten attaches most of CanvasKit's API
// (Path, Paint, Font, ...) only when the runtime finishes initialising, after the
// synchronous part returns.

/** Skia's package names: `react-native-skia` from 2.15.0, the Shopify scope before. */
const SKIA_PACKAGES = ["react-native-skia", "@shopify/react-native-skia"] as const;

const OPT_OUT =
  "A project whose tests do not use Skia can turn the preset off: reactNative({ presets: { skia: false } }).";

/**
 * The installed package's directory, resolved from `root`, or null when absent: the
 * nearest `node_modules/<name>`, as Node looks it up. Read from disk rather than
 * through require(): under the mock engine, once a preset module's require() bridge is
 * installed, a request for the package resolves to the module's virtual id
 * (cjs-bridge.ts), and an `exports` map may not expose `./package.json`.
 */
function packageDir(name: string, root: string): string | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (dir === path.dirname(dir)) break;
  }
  // A layout without node_modules directories (Yarn Plug'n'Play) resolves only
  // through require().
  try {
    const manifest = createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
    return path.isAbsolute(manifest) && fs.existsSync(manifest) ? path.dirname(manifest) : null;
  } catch {
    return null;
  }
}

/** The project root in a test worker, where the plugin sets it. */
function workerRoot(): string {
  return projectContext()?.projectRoot ?? process.cwd();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCanvasKit(dir: string): Promise<unknown> {
  try {
    const skiaRequire = createRequire(path.join(dir, "package.json"));
    // The build Skia's jestEnv.js loads.
    const CanvasKitInit = skiaRequire("canvaskit-wasm/bin/full/canvaskit") as (
      options: object,
    ) => Promise<unknown>;
    return await CanvasKitInit({});
  } catch (cause) {
    throw new VitestNativeError(
      "PRESET_UNAVAILABLE",
      `the skia preset could not load CanvasKit, Skia's WebAssembly build, from ` +
        `${dir}: ${messageOf(cause)}. ${OPT_OUT}`,
      { cause },
    );
  }
}

function skiaModule(name: string): PresetModule {
  return {
    exports: [],
    exportsFor({ projectRoot, platform }) {
      const dir = packageDir(name, projectRoot);
      if (!dir) return null;
      try {
        return esmExportNames(path.join(dir, "lib/module/index.js"), platform);
      } catch (cause) {
        throw new VitestNativeError(
          "PRESET_UNAVAILABLE",
          `the skia preset could not read the named exports of '${name}' from its ESM ` +
            `build in ${dir}: ${messageOf(cause)}. ${OPT_OUT}`,
          { cause },
        );
      }
    },
    factory: () => {
      const dir = packageDir(name, workerRoot());
      if (!dir) {
        throw new VitestNativeError(
          "PRESET_UNAVAILABLE",
          `the skia preset's mock for '${name}' needs '${name}' installed, and it does ` +
            `not resolve from ${workerRoot()}.`,
        );
      }
      const CanvasKit = (globalThis as any).CanvasKit;
      if (!CanvasKit) {
        throw new VitestNativeError(
          "PRESET_NOT_PREPARED",
          `the skia preset's mock was built before CanvasKit loaded. The setup file ` +
            `loads it before each test file; a mock built outside a test run needs ` +
            `\`await presets.skia().prepare()\` first.`,
        );
      }
      const skiaRequire = createRequire(path.join(dir, "package.json"));
      const { Mock } = skiaRequire("./lib/commonjs/mock") as {
        Mock: (canvasKit: unknown) => Record<string, any>;
      };
      // Mock() sets global.SkiaApi, which the Reanimated helpers read on load. The
      // mock's own placeholders for some helpers (useClock, ...) win, as under Jest.
      const mock = Mock(CanvasKit);
      const reanimatedHelpers = skiaRequire("./lib/commonjs/external/reanimated");
      const realMatchFont = mock.matchFont;
      return {
        ...reanimatedHelpers,
        ...mock,
        // skia/core/Font.ts: `fontSize` defaults to 14. A font manager the test
        // supplies (such as a Skia.TypefaceFontProvider) has fonts, so the real
        // lookup runs against it.
        matchFont: (style: { fontSize?: number } = {}, fontMgr?: unknown) =>
          fontMgr === undefined
            ? mock.Skia.Font(undefined, style.fontSize ?? 14)
            : realMatchFont(style, fontMgr),
        // skia/core/Font.ts: useFont(source, size = 14) is a font of that size. The
        // mock's own returns size 0 whatever is asked; this keeps it synchronous, on
        // Skia's default typeface.
        useFont: (_source: unknown, size = 14) => mock.Skia.Font(undefined, size),
      };
    },
  };
}

export function skia(): Preset {
  return builtInPreset({
    name: "skia",
    async prepare() {
      // A project has one of the two installed; CanvasKit is that copy's dependency.
      const root = workerRoot();
      const dir = SKIA_PACKAGES.map((name) => packageDir(name, root)).find((d) => d !== null);
      if (!dir) {
        throw new VitestNativeError(
          "PRESET_UNAVAILABLE",
          `the skia preset is enabled, and neither ${SKIA_PACKAGES.join(" nor ")} ` +
            `resolves from ${root}. ${OPT_OUT}`,
        );
      }
      // A worker that runs several files in one context (isolate: false) keeps the
      // first CanvasKit, and Skia's cached modules keep using it; loading another
      // would cost the start-up again for nothing.
      if ((globalThis as any).CanvasKit) return;
      (globalThis as any).CanvasKit = await loadCanvasKit(dir);
    },
    modules: Object.fromEntries(SKIA_PACKAGES.map((name) => [name, skiaModule(name)])),
  });
}
