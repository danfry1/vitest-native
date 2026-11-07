/**
 * vitest-native's own lint rules (lint/vitest-native-rules.mjs): for each, code it must
 * pass and code it must report. Run through oxlint's RuleTester, so an oxlint upgrade that
 * changes the alpha JS-plugin API fails here rather than silently linting nothing.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
// @ts-expect-error — runtime .mjs, no types
import plugin from "../lint/vitest-native-rules.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** A file under src/ that no baseline entry names. */
const src = (name = "src/native/example.mjs") => path.join(PACKAGE, name);
const tester = new RuleTester({ languageOptions: { sourceType: "module" } });
const rule = (name: string) => plugin.rules[name];

tester.run("realpath-spelling", rule("realpath-spelling"), {
  valid: [
    {
      filename: src(),
      code: `// Node's loader spelling: the cache key Module._cache uses.\nfs.realpathSync(file);`,
    },
    {
      filename: src(),
      code: `const real = fs.realpathSync.native(dir); // OS spelling: expands 8.3 names`,
    },
    { filename: src(), code: `fs.existsSync(file);` },
    {
      filename: src(),
      code: `// Keyed the way Node's loader keys require.cache,\n// so this is its spelling, not the OS's.\nconst key = cache.get(\n  fs.realpathSync(file),\n);`,
    },
    {
      filename: src(),
      code: `/**\n * The directory in Node's spelling (what Module._cache uses).\n */\nfunction canonical(dir) {\n  const x = 1;\n  return fs.realpathSync(dir);\n}`,
    },
    {
      filename: src(),
      code: `/**\n * Node's spelling, as require.cache keys it.\n */\nexport function identityKey(file) {\n  return fs.realpathSync(file);\n}`,
    },
    {
      filename: src(),
      code: `// OS spelling for the disk identity.\nexport const real = (p) => fs.realpathSync.native(p);`,
    },
    {
      filename: src(),
      code: `// Node's spelling: what the loader resolves mocks under.\nif (!index.has(k)) index.set(k, fs.realpathSync(p));`,
    },
    {
      filename: src(),
      code: `// Native spelling: the OS's canonical form.\nconst real = (p) => {\n  return fs.realpathSync.native(p);\n};`,
    },
  ],
  invalid: [
    { filename: src(), code: `fs.realpathSync(file);`, errors: [{ messageId: "spelling" }] },
    { filename: src(), code: `fs.realpathSync.native(file);`, errors: [{ messageId: "spelling" }] },
    {
      filename: src(),
      code: `// resolve the link\n\nrealpathSync(file);`,
      errors: [{ messageId: "spelling" }],
    },
    {
      // A comment above an outer statement does not explain every call inside it.
      filename: src(),
      code: `// Node's spelling throughout.\nif (ok) {\n  run();\n  fs.realpathSync(file);\n}`,
      errors: [{ messageId: "spelling" }],
    },
  ],
});

tester.run("root-containment", rule("root-containment"), {
  valid: [
    { filename: src(), code: `isUnderRoot(file, root);` },
    { filename: src(), code: `name.startsWith("@scope/");` },
    { filename: src(), code: `path.relative(from, to);` },
    // The helpers themselves.
    { filename: src("src/native/root-spelling.mjs"), code: `file.startsWith(root + path.sep);` },
  ],
  invalid: [
    {
      filename: src(),
      code: `file.startsWith(root + path.sep);`,
      errors: [{ messageId: "startsWith" }],
    },
    {
      filename: src(),
      code: "id.startsWith(`${projectRoot}/`);",
      errors: [{ messageId: "startsWith" }],
    },
    {
      filename: src(),
      code: `file.startsWith(ctx.root + "/");`,
      errors: [{ messageId: "startsWith" }],
    },
    {
      filename: src(),
      code: `path.relative(projectRoot, file);`,
      errors: [{ messageId: "relative" }],
    },
  ],
});

tester.run("no-monkey-patching", rule("no-monkey-patching"), {
  valid: [
    { filename: src(), code: `const spy = vi.fn(); spy.mockReturnValue(1);` },
    { filename: src(), code: `options.mockReset = true;`.replace("mockReset", "reset") },
    { filename: src(), code: `globalThis.__vitest_native_state = {};` },
    {
      filename: src("src/jest-compat/jest-object.mjs"),
      code: Array.from({ length: 11 }, () => "vi.fn = f;").join("\n"),
    },
  ],
  invalid: [
    { filename: src(), code: `vi.fn = wrapped;`, errors: [{ messageId: "patch" }] },
    { filename: src(), code: `expect.extend = mine;`, errors: [{ messageId: "patch" }] },
    { filename: src(), code: `globalThis.jest = makeJest(vi);`, errors: [{ messageId: "patch" }] },
    { filename: src(), code: `mock.mockReset = () => mock;`, errors: [{ messageId: "patch" }] },
    // A listed file keeps only its listed number of sites.
    {
      filename: src("src/jest-compat/jest-object.mjs"),
      code: Array.from({ length: 12 }, () => "vi.fn = f;").join("\n"),
      errors: [{ messageId: "patch" }],
    },
    // A listed count above the file's sites is stale: it would let a new site in.
    {
      filename: src("src/jest-compat/jest-object.mjs"),
      code: Array.from({ length: 10 }, () => "vi.fn = f;").join("\n"),
      errors: [
        {
          message:
            "lint/baseline.json lists 11 no-monkey-patching site(s) for this file, and it has 10: lower the count to 10.",
        },
      ],
    },
    {
      filename: src("src/jest-compat/jest-object.mjs"),
      code: "export {};",
      errors: [{ message: /has 0: lower the count to 0 \(remove the entry\)/ }],
    },
  ],
});

tester.run("escaped-regexp", rule("escaped-regexp"), {
  valid: [
    { filename: src(), code: `new RegExp("^a+$");` },
    { filename: src(), code: "new RegExp(`^${escapeRe(name)}/`);" },
    { filename: src(), code: `new RegExp("^" + escapeRe(dir) + "/", "i");` },
    { filename: src(), code: `new RegExp(re.source, "g");` },
    { filename: src(), code: "new RegExp(`^${STAR}+`);" },
    { filename: src(), code: 'new RegExp(String.raw`${ROOT}\\d+`, "g");' },
    { filename: src(), code: 'new RegExp(`^${parts.map(escapeRe).join("/")}$`);' },
    { filename: src(), code: 'new RegExp(`^${parts.map((p) => escapeRe(p)).join("|")}$`);' },
  ],
  invalid: [
    { filename: src(), code: "new RegExp(`^${name}/`);", errors: [{ messageId: "unescaped" }] },
    { filename: src(), code: `new RegExp("^" + dir + "/");`, errors: [{ messageId: "unescaped" }] },
    { filename: src(), code: `RegExp(userInput);`, errors: [{ messageId: "unescaped" }] },
    // A lower-case name is data, even in String.raw or a join.
    {
      filename: src(),
      code: "new RegExp(String.raw`${root}\\d+`);",
      errors: [{ messageId: "unescaped" }],
    },
    {
      filename: src(),
      code: 'new RegExp(parts.map((p) => p.trim()).join("|"));',
      errors: [{ messageId: "unescaped" }],
    },
    {
      filename: src(),
      code: "new RegExp(`\\b${binding}\\(`);",
      errors: [{ messageId: "unescaped" }],
    },
  ],
});

tester.run("no-doc-urls-in-src", rule("no-doc-urls-in-src"), {
  valid: [
    { filename: src(), code: `const url = "https://vitest-native.dev/guide/ownership";` },
    { filename: src(), code: `const file = "docs/";` },
    { filename: src(), code: `const name = "README.md";` },
  ],
  invalid: [
    {
      filename: src(),
      code: `throw new Error("see docs/ownership-model.md");`,
      errors: [{ messageId: "link" }],
    },
    {
      filename: src(),
      code: "const u = `https://github.com/acme/repo/blob/main/x.md#${anchor}`;",
      errors: [{ messageId: "link" }],
    },
  ],
});
