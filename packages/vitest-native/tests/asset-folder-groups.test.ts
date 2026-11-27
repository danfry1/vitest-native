// An asset's descriptor needs every scale variant in its folder (Metro's
// `buildAssetMap`), so building one reads the folder. These count those reads: a folder
// of icons is listed once however many of its assets a worker requires, on any
// platform, and listed again once the folder changes (#930).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { metroAssetDescriptor } from "../src/native/assets.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-asset-folder-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

// A 1x1 PNG header: enough for the descriptor to carry dimensions.
const png = (size: number) => {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(size, 16);
  b.writeUInt32BE(size, 20);
  return b;
};

/** Date `dir` a minute back, so its listing is kept (resolve.mjs, RACY_MS). */
function backdate(dir: string) {
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(dir, past, past);
}

const ICONS = 40;
const icons = path.join(root, "icons");
fs.mkdirSync(icons);
for (let i = 0; i < ICONS; i++) {
  fs.writeFileSync(path.join(icons, `icon${i}.png`), png(10));
  fs.writeFileSync(path.join(icons, `icon${i}@2x.png`), png(20));
  fs.writeFileSync(path.join(icons, `icon${i}@3x.png`), png(30));
}
// Platform-specific groups, each winning over the generic one on its own platform only.
fs.writeFileSync(path.join(icons, "icon0.ios.png"), png(12));
fs.writeFileSync(path.join(icons, "icon0@2x.ios.png"), png(24));
fs.writeFileSync(path.join(icons, "icon2@2x.android.png"), png(28));
backdate(icons);

const projectRoot = root;
const files = Array.from({ length: ICONS }, (_, i) => path.join(icons, `icon${i}.png`));

function listingsOf(dir: string, run: () => void) {
  const readdir = vi.spyOn(fs, "readdirSync");
  run();
  const count = readdir.mock.calls.filter(([listed]) => String(listed) === dir).length;
  readdir.mockRestore();
  return count;
}

describe("requiring every asset in a folder", () => {
  it("lists the folder once, for every platform, until it changes", () => {
    const described: Record<string, unknown[]> = {};
    const listings = listingsOf(icons, () => {
      for (const platform of ["ios", "android"]) {
        described[platform] = files.map((file) =>
          metroAssetDescriptor(file, { projectRoot, platform }),
        );
      }
    });
    // At most once per platform (#930); the listing is shared, so once in all.
    expect(listings).toBe(1);
    expect(described.ios).toHaveLength(ICONS);
    expect(described.ios[0]).toMatchObject({ scales: [1, 2], width: 12 });
    expect(described.android[0]).toMatchObject({ scales: [1, 2, 3], width: 10 });
    expect(described.ios[2]).toMatchObject({ scales: [1, 2, 3], width: 10 });
    expect(described.android[2]).toMatchObject({ scales: [2], width: 14 });
    expect(described.ios[ICONS - 1]).toMatchObject({ name: `icon${ICONS - 1}`, scales: [1, 2, 3] });

    // Adding a variant changes the folder, so the next asset lists it again and sees it.
    fs.writeFileSync(path.join(icons, "icon1@4x.png"), png(40));
    backdate(icons);
    let after: unknown;
    const relisted = listingsOf(icons, () => {
      after = metroAssetDescriptor(files[1], { projectRoot, platform: "android" });
      for (const file of files) metroAssetDescriptor(file, { projectRoot, platform: "ios" });
    });
    expect(relisted).toBe(1);
    expect(after).toMatchObject({ name: "icon1", scales: [1, 2, 3, 4] });
  });

  it("a missing folder fails as reading it fails", () => {
    expect(() =>
      metroAssetDescriptor(path.join(root, "gone", "x.png"), { projectRoot, platform: "ios" }),
    ).toThrow(/ENOENT/);
  });
});
