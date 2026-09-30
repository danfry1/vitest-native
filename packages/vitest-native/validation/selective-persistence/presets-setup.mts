import Module from "node:module";
import {
  expo,
  gestureHandler,
  reanimated,
  safeAreaContext,
  screens,
  worklets,
} from "../../dist/presets.mjs";

const presets = [expo(), gestureHandler(), reanimated(), safeAreaContext(), screens(), worklets()];
const mocks = Object.create(null);
for (const preset of presets) {
  for (const [pkg, definition] of Object.entries(preset.modules)) {
    mocks[pkg] = definition.factory();
  }
}
(globalThis as any).__vitest_native_selective_preset_mocks = mocks;

if (!(globalThis as any).__vitest_native_selective_preset_cjs_bridge) {
  const packages = new Set(Object.keys(mocks));
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: unknown, ...rest: unknown[]) {
    const current = (globalThis as any).__vitest_native_selective_preset_mocks;
    const pkg = [...packages]
      .sort((a, b) => b.length - a.length)
      .find((candidate) => request === candidate || request.startsWith(`${candidate}/`));
    if (pkg && !request.endsWith("/package.json")) {
      const root = current?.[pkg];
      const leaf = request === pkg ? null : request.split("/").at(-1)?.split(".")[0];
      if (leaf && root && Object.prototype.hasOwnProperty.call(root, leaf)) {
        const value = root[leaf];
        if (value !== null && (typeof value === "object" || typeof value === "function")) {
          return new Proxy(value, {
            get: (target, key, receiver) =>
              key === "default"
                ? target
                : key === "__esModule"
                  ? true
                  : Reflect.get(target, key, receiver),
          });
        }
        return { __esModule: true, default: value };
      }
      return root;
    }
    return originalLoad.call(this, request, parent, ...rest);
  };
  (globalThis as any).__vitest_native_selective_preset_cjs_bridge = { originalLoad };
}
