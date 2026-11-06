/**
 * A workspace package, mocked at its real path (a project file), reached through the
 * node_modules link a package manager makes for it, by absolute path.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import "./ws-pkg-src/index.cjs";
import { requireFrom } from "dispatch-consumer-lib";

vi.mock("./ws-pkg-src/index.cjs", () => ({ source: "mock" }));

const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-ws-link-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const link = path.join(root, "node_modules", "ws-pkg");
fs.mkdirSync(path.dirname(link), { recursive: true });
fs.symlinkSync(path.join(import.meta.dirname, "ws-pkg-src"), link, "junction");

it("serves the mock through the link", () => {
  expect(requireFrom(path.join(link, "index.cjs")).source).toBe("mock");
});
