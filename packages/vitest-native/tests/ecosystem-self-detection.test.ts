/**
 * The project's own package must never be auto-detected as an ecosystem dependency.
 *
 * In a workspace the package under test is normally declared as a dependency by a
 * sibling or by the repository root, so it turns up in the candidate set like any
 * third-party library — and it declares React Native, because it *is* React Native
 * code. Detection then claimed it: its directory became a `server.deps.external`
 * pattern, Vitest handed every file under it to Node, and the loader compiled them to
 * CommonJS. A test file's own `import { it } from 'vitest'` became `require('vitest')`
 * and threw "Vitest cannot be imported in a CommonJS module using require()", with
 * `Tests: no tests` and nothing pointing at the cause. It reproduced in one workspace
 * package and not another purely because only one of them was declared as a
 * dependency somewhere.
 *
 * Under pnpm the resolution that makes this possible is routine: every workspace
 * member is linked into a hidden directory that pnpm puts on NODE_PATH, so a package
 * resolves its own name from its own directory.
 *
 * The `react-native` export condition is NOT involved, however much it looks like it
 * — see tests-native/cjs-export-condition.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";
import { nativeEngineConfig } from "../src/native/apply.js";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, value: unknown) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

/** How a package manager links a workspace package into a dependent. */
function link(from: string, to: string) {
  fs.mkdirSync(path.dirname(from), { recursive: true });
  fs.symlinkSync(to, from, process.platform === "win32" ? "junction" : "dir");
}

/**
 * A workspace with two React Native packages, where `components` depends on
 * `renderer`. Both are ordinary workspace members; the only difference between them
 * is which one the run is in.
 */
function workspace(): { root: string; renderer: string; components: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-self-")));
  made.push(root);
  write(root, "package.json", { name: "w", private: true, workspaces: ["packages/*"] });
  write(root, "packages/renderer/package.json", {
    name: "@w/renderer",
    version: "1.0.0",
    peerDependencies: { "react-native": "*" },
  });
  write(root, "packages/components/package.json", {
    name: "@w/components",
    version: "1.0.0",
    dependencies: { "@w/renderer": "workspace:*" },
    peerDependencies: { "react-native": "*" },
  });
  const renderer = path.join(root, "packages", "renderer");
  const components = path.join(root, "packages", "components");
  link(path.join(components, "node_modules", "@w", "renderer"), renderer);
  // pnpm additionally links every member into a hidden store it puts on NODE_PATH,
  // which is how a package comes to resolve its own name from its own directory.
  link(path.join(renderer, "node_modules", "@w", "renderer"), renderer);
  return { root, renderer, components };
}

describe("ecosystem detection and the package under test", () => {
  it("does not detect the package the run is inside", () => {
    const { renderer } = workspace();
    expect(detectEcosystemPackages(renderer)).not.toContain("@w/renderer");
  });

  it("still detects that same package when another package is under test", () => {
    // The discriminating half: the guard keys on where the run is, not on the
    // package. From `components`, `@w/renderer` is a genuine workspace dependency and
    // must stay detected — that is the dual-ownership fix this must not undo.
    const { components } = workspace();
    expect(detectEcosystemPackages(components)).toContain("@w/renderer");
  });

  it("does not let a sibling's dependency closure pull the package back in", () => {
    // `@w/components` is detected in its own right and depends on `@w/renderer`, so
    // the closure walk reaches it by a second route.
    const { root, renderer } = workspace();
    write(root, "package.json", {
      name: "w",
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@w/components": "workspace:*" },
    });
    link(
      path.join(root, "node_modules", "@w", "components"),
      path.join(root, "packages/components"),
    );
    const detected = detectEcosystemPackages(renderer);
    expect(detected).toContain("@w/components");
    expect(detected).not.toContain("@w/renderer");
  });
});

describe("test entries are never externalized", () => {
  const inlinePatterns = (): RegExp[] => {
    const config = nativeEngineConfig("/setup.mjs", {}, [".js"]);
    // Defaulted rather than asserted so that removing the rule fails the case that
    // needs it, and leaves the two negative cases passing for the right reason.
    return (config.test.server.deps.inline ?? []) as RegExp[];
  };
  const inlines = (file: string) => inlinePatterns().some((re) => re.test(file));

  it("inlines a first-party test file", () => {
    // A detected workspace library can be the very package whose tests are running —
    // an Nx-style run from the repository root collects them from inside it. Its
    // directory is legitimately externalized, so the entry has to be rescued by name.
    // `inline` is checked before `external`, which is what makes this work.
    expect(inlines("/repo/packages/ui/src/button.test.tsx")).toBe(true);
    expect(inlines("/repo/packages/ui/src/button.spec.ts")).toBe(true);
  });

  it("leaves test files shipped inside installed packages alone", () => {
    // Not an entry, and nothing imports it — externalizing it is correct.
    expect(inlines("/repo/node_modules/some-lib/dist/index.test.js")).toBe(false);
  });

  it("leaves ordinary source files alone", () => {
    expect(inlines("/repo/packages/ui/src/button.tsx")).toBe(false);
  });
});
