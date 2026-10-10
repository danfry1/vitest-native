import type { Preset } from "../types.js";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";
import { SKIA_EXPORTS } from "./skia-exports.js";

// @shopify/react-native-skia draws through a JSI binding to Skia's C++, which throws
// at import in Node ("Native Skia Module failed to correctly install JSI Bindings").
// Skia supports tests itself: its jestEnv.js loads CanvasKit, Skia compiled to
// WebAssembly, and its jestSetup.js mocks the package with
// `require("@shopify/react-native-skia/lib/module/mock").Mock(global.CanvasKit)`.
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
//   as the mock's own useFont() does.
// The mock's names that the real package does not export (hooks from earlier
// releases) are not named exports here: see SKIA_MOCK_ONLY in skia-exports.ts.
//
// CanvasKit is loaded from the installed Skia's own dependency (canvaskit-wasm is
// Skia's, not the app's, and an isolated layout such as pnpm's does not hoist it).
// Its WebAssembly is compiled once per worker and instantiated for each test file,
// which costs a few milliseconds. Synchronous instantiation is not an option:
// Emscripten attaches most of CanvasKit's API (Path, Paint, Font, ...) only when
// the runtime finishes initialising, after the synchronous part returns.

const SKIA = "@shopify/react-native-skia";

/** The installed Skia's directory, from the project root, or null when absent. */
function skiaDir(): string | null {
  try {
    const root = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
    return path.dirname(
      createRequire(path.join(root, "package.json")).resolve(`${SKIA}/package.json`),
    );
  } catch {
    return null;
  }
}

/** Compiled once per worker: the module is immutable and every file instantiates it. */
let compiledCanvasKit: Promise<WebAssembly.Module> | undefined;

async function loadCanvasKit(dir: string): Promise<unknown> {
  const skiaRequire = createRequire(path.join(dir, "package.json"));
  // The build Skia's jestEnv.js loads.
  const entry = skiaRequire.resolve("canvaskit-wasm/bin/full/canvaskit");
  const CanvasKitInit = skiaRequire(entry) as (options: object) => Promise<unknown>;
  compiledCanvasKit ??= fs.promises
    .readFile(path.join(path.dirname(entry), "canvaskit.wasm"))
    .then((bytes) => WebAssembly.compile(bytes));
  const compiled = await compiledCanvasKit;
  return CanvasKitInit({
    // Emscripten's Module.instantiateWasm: instantiate the cached module rather than
    // fetch and compile the file again. Returning {} marks the instantiation async.
    instantiateWasm(
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      void WebAssembly.instantiate(compiled, imports).then((instance) => done(instance, compiled));
      return {};
    },
  });
}

export function skia(): Preset {
  return {
    name: "skia",
    async prepare() {
      const dir = skiaDir();
      if (!dir) return;
      (globalThis as any).CanvasKit = await loadCanvasKit(dir);
    },
    modules: {
      [SKIA]: {
        exports: [...SKIA_EXPORTS],
        factory: () => {
          const dir = skiaDir();
          const CanvasKit = (globalThis as any).CanvasKit;
          if (!dir || !CanvasKit) {
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
          // Mock() sets global.SkiaApi, which the Reanimated helpers read on load.
          const mock = Mock(CanvasKit);
          const reanimatedHelpers = skiaRequire("./lib/commonjs/external/reanimated");
          const realMatchFont = mock.matchFont;
          return {
            ...reanimatedHelpers,
            ...mock,
            // skia/core/Font.js: `fontSize` defaults to 14. A font manager the test
            // supplies (from useFonts or Skia.TypefaceFontProvider) has fonts, so
            // the real lookup runs against it.
            matchFont: (style: { fontSize?: number } = {}, fontMgr?: unknown) =>
              fontMgr === undefined
                ? mock.Skia.Font(undefined, style.fontSize ?? 14)
                : realMatchFont(style, fontMgr),
          };
        },
      },
    },
  };
}
