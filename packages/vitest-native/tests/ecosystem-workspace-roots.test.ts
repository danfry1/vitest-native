/**
 * Auto-detection must see the packages a WORKSPACE MEMBER declares, not only those
 * on the path from the run root upwards.
 *
 * `manifestsFrom` walks up. In a workspace the run root is frequently above the
 * package under test — Nx invokes tasks from the workspace root, and Vitest's root
 * follows the working directory — so the app's own dependencies live in a manifest
 * that walking up never reaches. The package then misses detection, stays in Vite's
 * graph while Node loads it too, and comes apart into two module instances. That is
 * the reported dual-ownership blocker, reproducing from nothing but a different
 * working directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectEcosystemPackages } from "../src/native/ecosystem.js";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, value: unknown) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

/** A workspace whose member app depends on an RN library, installed only under it. */
function workspace(declare: (root: string) => void): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-ws-"));
  made.push(root);
  declare(root);
  write(root, "apps/mobile/package.json", {
    name: "@w/mobile",
    dependencies: { "@w/ui": "*" },
  });
  // Resolvable only from the member, as pnpm links a workspace package.
  write(root, "apps/mobile/node_modules/@w/ui/package.json", {
    name: "@w/ui",
    version: "1.0.0",
    peerDependencies: { "react-native": "*" },
  });
  return root;
}

describe("ecosystem detection across workspace members", () => {
  it("detects a member's dependency when the run root is the workspace root", () => {
    const root = workspace((r) => write(r, "package.json", { name: "w", workspaces: ["apps/*"] }));
    expect(detectEcosystemPackages(root)).toContain("@w/ui");
  });

  it("reads pnpm's member list, which lives outside package.json", () => {
    const root = workspace((r) => {
      write(r, "package.json", { name: "w" });
      write(r, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
    });
    expect(detectEcosystemPackages(root)).toContain("@w/ui");
  });

  it("reads the object form of the workspaces field", () => {
    const root = workspace((r) =>
      write(r, "package.json", { name: "w", workspaces: { packages: ["apps/*"] } }),
    );
    expect(detectEcosystemPackages(root)).toContain("@w/ui");
  });

  it("still detects when the run root IS the member", () => {
    const root = workspace((r) => write(r, "package.json", { name: "w", workspaces: ["apps/*"] }));
    expect(detectEcosystemPackages(path.join(root, "apps", "mobile"))).toContain("@w/ui");
  });

  it("declares no members when none are configured", () => {
    const root = workspace((r) => write(r, "package.json", { name: "w" }));
    expect(detectEcosystemPackages(root)).not.toContain("@w/ui");
  });
});
