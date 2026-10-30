/**
 * Two things doctor got wrong, both found by running it against a project that was
 * actually broken and watching it report no blocking problems.
 *
 * 1. The Node floor was hardcoded as 20 and compared on the MAJOR only. When the real
 *    floor moved to 20.19 doctor kept passing Node 20.0 and kept printing "floor: 20".
 *    It now reads the whole supported range from engines.node.
 * 2. RNTL 14 declares `test-renderer` as a non-optional peer and reconciles through it.
 *    Without it every render throws "Cannot find module 'test-renderer'", naming no
 *    file and no package, while doctor said the project was fine.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { nodeRange, runDoctor, satisfiesNodeRange } from "../src/cli/doctor.js";

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

/** A project root with the given packages installed at the given versions. */
function project(installed: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-doctor-floor-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  for (const [name, version] of Object.entries(installed)) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, version, main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
  }
  return root;
}

const runtimeLine = (root: string, node: string) =>
  runDoctor(root, node).lines.find((l) => l.includes("Node ")) ?? "";

const testingLine = (root: string) => {
  const { lines } = runDoctor(root, "22.22.3");
  const start = lines.indexOf("Testing library");
  return lines.slice(start + 1, start + 2).join(" ");
};

describe("doctor: the supported Node range is the one the plugin enforces", () => {
  it("matches this package's own manifest", () => {
    const manifest = JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { engines: { node: string } };
    expect(nodeRange()).toBe(manifest.engines.node);
  });

  it("prints the range it actually enforces", () => {
    expect(runtimeLine(project({}), "24.13.0")).toContain(`supported: ${nodeRange()}`);
  });

  it("passes each line's first supported release and fails the one before it", () => {
    // The bug this guards: 20.18 had the floor's major, and passed.
    const line = (node: string) => runtimeLine(project({}), node);
    expect(line("22.22.3")).toContain("✓");
    expect(line("22.22.2")).toContain("✗");
    expect(line("24.12.0")).toContain("✓");
    expect(line("24.11.1")).toContain("✗");
    expect(line("25.0.0")).toContain("✗");
    expect(line("26.0.0")).toContain("✓");
    expect(line("24.11.1")).toContain(`supports Node ${nodeRange()}`);
  });
});

describe("satisfiesNodeRange", () => {
  const range = ">=22.13.0 <23 || >=24.3.0";
  it.each([
    ["20.19.4", false],
    ["22.12.0", false],
    ["22.13.0", true],
    ["22.22.3", true],
    ["23.5.0", false],
    ["24.2.9", false],
    ["24.3.0", true],
    ["26.0.0", true],
    ["v24.13.0", true],
  ])("%s → %s", (version, expected) => {
    expect(satisfiesNodeRange(version, range)).toBe(expected);
  });

  it("rejects what it cannot read rather than passing it", () => {
    expect(satisfiesNodeRange("24.0.0", "^24")).toBe(false);
  });
});

describe("doctor: RNTL 14 needs test-renderer", () => {
  it("fails when RNTL 14 is installed without it", () => {
    const root = project({ "@testing-library/react-native": "14.0.1" });
    const line = testingLine(root);
    expect(line).toContain("✗");
    expect(line).toContain("test-renderer");
    expect(runDoctor(root, "22.22.3").ok).toBe(false);
  });

  it("passes when it is installed", () => {
    const line = testingLine(
      project({ "@testing-library/react-native": "14.0.1", "test-renderer": "1.2.0" }),
    );
    expect(line).toContain("✓");
    expect(line).not.toContain("test-renderer");
  });

  it("does not demand it for RNTL 13, which does not use it", () => {
    // A control: without this, requiring test-renderer unconditionally would pass
    // both assertions above while breaking every RNTL 13 project.
    const line = testingLine(project({ "@testing-library/react-native": "13.2.0" }));
    expect(line).not.toContain("test-renderer");
  });
});
