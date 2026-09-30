import type { Plugin } from "vite";
import type { Preset } from "../../src/types";

const PREFIX = "\0vitest-native:selective-preset:";

export function selectivePresetModules(presets: Preset[]): Plugin {
  const modules = new Map<string, { pkg: string; exports: string[] }>();
  for (const preset of presets) {
    for (const [pkg, definition] of Object.entries(preset.modules)) {
      modules.set(pkg, { pkg, exports: definition.exports ?? [] });
    }
  }

  return {
    name: "vitest-native:selective-preset-experiment",
    enforce: "pre",
    resolveId(source) {
      const match = [...modules.keys()]
        .sort((a, b) => b.length - a.length)
        .find((pkg) => source === pkg || source.startsWith(`${pkg}/`));
      if (!match || source.endsWith("/package.json")) return undefined;
      return `${PREFIX}${encodeURIComponent(match)}:${encodeURIComponent(source)}`;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return undefined;
      const encoded = id.slice(PREFIX.length);
      const split = encoded.indexOf(":");
      const pkg = decodeURIComponent(encoded.slice(0, split));
      const request = decodeURIComponent(encoded.slice(split + 1));
      const definition = modules.get(pkg);
      if (!definition) return undefined;
      const leaf = request === pkg ? null : request.split("/").at(-1)?.split(".")[0];
      const named = definition.exports;
      return [
        `const __root = globalThis.__vitest_native_selective_preset_mocks?.[${JSON.stringify(pkg)}];`,
        `if (!__root) throw new Error(${JSON.stringify(`selective preset '${pkg}' was imported before setup`)});`,
        `const __value = ${JSON.stringify(leaf)} && Object.prototype.hasOwnProperty.call(__root, ${JSON.stringify(leaf)}) ? __root[${JSON.stringify(leaf)}] : __root;`,
        `export default ${leaf ? "__value" : "(__root.default ?? __root)"};`,
        ...named.map((name) => `export const ${name} = __root[${JSON.stringify(name)}];`),
      ].join("\n");
    },
  };
}
