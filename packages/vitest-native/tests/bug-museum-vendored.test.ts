/**
 * The bug museum's vendored packages (validation/bug-museum/lib/materialise.mjs,
 * copyVendored): a package an exhibit vendors under a name the install already linked
 * replaces the link. Copying onto the link wrote into the store it pointed to.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { copyVendored } from "../validation/bug-museum/lib/materialise.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-vendored-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function pkg(at: string, marker: string) {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, "package.json"), JSON.stringify({ name: path.basename(at) }));
  fs.writeFileSync(path.join(at, "marker.txt"), marker);
}

it.each([
  ["plain", "lib"],
  ["scoped", "@scope/lib"],
])("replaces a %s package the install linked, and leaves the store alone", (_, name) => {
  const case_ = path.join(dir, name.replace(/\W/g, "-"));
  const store = path.join(case_, "store", name);
  const vendor = path.join(case_, "vendor");
  const modules = path.join(case_, "node_modules");
  pkg(store, "from the store");
  pkg(path.join(vendor, name), "vendored");
  fs.mkdirSync(path.dirname(path.join(modules, name)), { recursive: true });
  fs.symlinkSync(store, path.join(modules, name), "junction");

  copyVendored(vendor, modules);

  expect(fs.readFileSync(path.join(store, "marker.txt"), "utf8")).toBe("from the store");
  expect(fs.lstatSync(path.join(modules, name)).isSymbolicLink()).toBe(false);
  expect(fs.readFileSync(path.join(modules, name, "marker.txt"), "utf8")).toBe("vendored");
});
