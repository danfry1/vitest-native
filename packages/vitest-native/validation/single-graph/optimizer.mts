/**
 * Vitest/Vite dependency-optimizer adapter for the single-graph experiment.
 *
 * Rolldown bundles a CommonJS package's internal closure, but excluded external
 * requires become real Node `createRequire` calls. Promote React Native back to
 * ESM so that edge re-enters Vitest's resolver and reaches the shared capsule.
 */
export function commonJsReactNativeBackToVitest() {
  return {
    name: "vitest-native:optimizer-react-native-import-v7",
    renderChunk(code: string) {
      const next = adaptOptimizedRntl(code);
      if (next === code) return null;
      return { code: next, map: null };
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || !output.code) continue;
        output.code = preserveRntlScreen(output.code);
      }
    },
  };
}

/**
 * Backend-independent repair for an optimized RNTL bundle. Vite 6/7 use esbuild
 * while Vite 8 uses Rolldown, so the normal Vite transform hook also calls this
 * after either optimizer has produced JavaScript.
 */
export function adaptOptimizedRntl(code: string): string {
  let next = code.replace(/__require\((["'])react-native\1\)/g, "__vitestNativeReactNative");
  next = preserveRntlScreen(next);
  if (next === code) return code;
  if (!/import __vitestNativeReactNative from ["']react-native["']/.test(next)) {
    next = 'import __vitestNativeReactNative from "react-native";\n' + next;
  }
  return next;
}

/**
 * RNTL reassigns its CommonJS `screen` export after every render. Optimized ESM
 * interop snapshots that property, so expose a stable proxy that follows RNTL's
 * current value. This is deliberately visible as an adapter, not hidden as a
 * generic transform: it is a concrete upstream interop gap exposed by the bake-off.
 */
function preserveRntlScreen(code: string): string {
  const rntlTail = /export default (require_[A-Za-z0-9_$]+)\(\);\s*(?:export \{\};)?/;
  const match = rntlTail.exec(code);
  if (!match) return code;
  const requireEntry = match[1];
  return code.replace(
    rntlTail,
    `const __vitestNativeRntl = ${requireEntry}();\n` +
      `const __vitestNativeScreen = new Proxy(Object.create(null), {\n` +
      `  get(_target, key) {\n` +
      `    const current = __vitestNativeRntl.screen;\n` +
      `    return Reflect.get(current, key, current);\n` +
      `  }\n` +
      `});\n` +
      `const __vitestNativeRntlFacade = new Proxy(__vitestNativeRntl, {\n` +
      `  get(target, key, receiver) {\n` +
      `    if (key === "screen") return __vitestNativeScreen;\n` +
      `    return Reflect.get(target, key, receiver);\n` +
      `  }\n` +
      `});\n` +
      `export default __vitestNativeRntlFacade;\n` +
      `export { __vitestNativeScreen as screen };`,
  );
}
