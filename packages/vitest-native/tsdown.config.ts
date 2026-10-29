import { defineConfig } from 'tsdown';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    helpers: 'src/helpers.ts',
    setup: 'src/setup.ts',
    serializer: 'src/serializer.ts',
    presets: 'src/presets/index.ts',
    matchers: 'src/matchers/animated.ts',
    'jest-compat': 'src/jest-compat/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      'react',
      'react-native',
      'vitest',
      'vitest/node',
      'vite',
      'magic-string',
      '@testing-library/react-native',
      '@testing-library/react-native/build/matchers/extend-expect',
      '@testing-library/react-native/build/matchers',
      'react-test-renderer',
      // The project context ships verbatim (copied below) and every bundle imports
      // that one file: one module instance per realm, and no inlined copies.
      /[\\/]src[\\/]context\.mjs$/,
    ],
  },
  hooks: {
    // The native runtime + jest-compat shims are plain .mjs loaded by Node at
    // runtime (native: via module.register; jest-compat: as setup file / alias
    // targets resolved by Vite), so they must ship verbatim rather than bundled.
    'build:done': () => {
      // The matcher declarations augment the "vitest" module. Under Vitest 4 that
      // augmentation only merges when the declaration file itself references vitest, and
      // declaration bundling drops both an unused type import and a `reference types`
      // directive from the source — so add the directive to the emitted files.
      for (const file of ['matchers.d.mts', 'matchers.d.cts']) {
        const target = path.resolve('dist', file);
        if (!fs.existsSync(target)) continue;
        const text = fs.readFileSync(target, 'utf8');
        const directive = '/// <reference types="vitest" />';
        if (!text.startsWith(directive)) fs.writeFileSync(target, `${directive}\n${text}`);
      }
      // Three entries depend on vitest at module scope, and vitest throws when it is
      // reached through require(). Their CJS bundles therefore could not be loaded at
      // all, so `exports` points require() and import() at the one .mjs build instead —
      // Node >= 20.19 loads it through require(esm), which is why `engines` sets that
      // floor. Emitting the dead CJS would ship files no declared entry can reach.
      for (const name of ['index', 'setup', 'presets']) {
        for (const ext of ['cjs', 'd.cts']) {
          fs.rmSync(path.resolve('dist', `${name}.${ext}`), { force: true });
        }
      }
      // Keep exactly the .cjs files reachable from the `require` targets in package.json's
      // `exports`, following each file's require("./…") calls, and delete the rest with
      // their declarations: the ESM build and the verbatim runtimes never load a .cjs. This
      // removes the CLI's CJS build (`bin` names dist/cli.mjs and no `exports` entry reaches
      // a CJS CLI, so cli.cjs could never be loaded) and the shared chunks that only it and
      // the removed index/setup/presets builds used.
      const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const roots: string[] = [];
      const collect = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node)) {
          if (key === 'require') {
            const target = typeof value === 'string' ? value : (value as { default?: string }).default;
            if (target?.endsWith('.cjs')) roots.push(path.resolve(target));
          } else {
            collect(value);
          }
        }
      };
      collect(manifest.exports);
      const reachable = new Set<string>();
      const queue = [...roots];
      while (queue.length) {
        const file = queue.pop() as string;
        if (reachable.has(file) || !fs.existsSync(file)) continue;
        reachable.add(file);
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/require\("(\.\/[^"]+\.cjs)"\)/g)) {
          queue.push(path.resolve(path.dirname(file), m[1]));
        }
      }
      for (const f of fs.readdirSync(path.resolve('dist'))) {
        const abs = path.resolve('dist', f);
        if (f.endsWith('.cjs') && !reachable.has(abs)) {
          fs.rmSync(abs);
          fs.rmSync(abs.replace(/\.cjs$/, '.d.cts'), { force: true });
        }
      }
      // Top-level runtime .mjs (errors.mjs) ships verbatim too: the shipped runtimes
      // below import it by relative path, and the tests load those same files from src,
      // so it must resolve in both trees as one module rather than a bundled copy.
      for (const f of fs.readdirSync(path.resolve('src'))) {
        if (f.endsWith('.mjs') || f.endsWith('.d.mts')) {
          fs.copyFileSync(path.resolve('src', f), path.resolve('dist', f));
        }
      }
      for (const sub of ['native', 'jest-compat']) {
        const srcDir = path.resolve('src', sub);
        const outDir = path.resolve('dist', sub);
        fs.mkdirSync(outDir, { recursive: true });
        for (const f of fs.readdirSync(srcDir)) {
          // The memory planner is a config/doctor build-time module and is already
          // emitted as an internal code-split chunk. It is not loaded verbatim by
          // Node's hooks, so copying it again would publish two unreachable files.
          if (sub === 'native' && (f === 'memory.mjs' || f === 'memory.d.mts')) continue;
          // Ship runtime .mjs verbatim, plus hand-written .d.mts type stubs for them.
          if (f.endsWith('.mjs') || f.endsWith('.d.mts')) {
            fs.copyFileSync(path.join(srcDir, f), path.join(outDir, f));
          }
        }
      }
    },
  },
});
