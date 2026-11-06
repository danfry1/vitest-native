import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A link to the site shared on X, Facebook, LinkedIn or Slack shows the og:image, and
// none of them renders an SVG one: the card was an SVG, so shared links showed no image.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIG = path.join(repoRoot, "website/.vitepress/config.ts");
const PUBLIC = path.join(repoRoot, "website/public");
const SITE_URL = "https://danfry1.github.io/vitest-native/";

/** The `content` of each `['meta', { <key>: name, content }]` entry in the site config. */
function metaContent(config: string, name: string): string[] {
  const entry = /\['meta',\s*\{\s*(?:property|name):\s*'([^']+)',\s*content:\s*'([^']*)'\s*\}\]/g;
  return [...config.matchAll(entry)].filter(([, key]) => key === name).map(([, , value]) => value);
}

describe("social card", () => {
  const config = fs.readFileSync(CONFIG, "utf8");

  for (const name of ["og:image", "twitter:image"]) {
    it(`${name} is one PNG or JPEG the site publishes`, () => {
      const images = metaContent(config, name);
      expect(images).toHaveLength(1);
      const [image] = images;
      expect(image.startsWith(SITE_URL), image).toBe(true);
      expect(image).toMatch(/\.(png|jpe?g)$/);
      expect(fs.existsSync(path.join(PUBLIC, image.slice(SITE_URL.length)))).toBe(true);
    });
  }

  it("is a 1200×630 image, the size the card's meta states", () => {
    const [image] = metaContent(config, "og:image");
    const file = fs.readFileSync(path.join(PUBLIC, image.slice(SITE_URL.length)));
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect(file.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("states the card's size and describes it", () => {
    expect(metaContent(config, "og:image:width")).toEqual(["1200"]);
    expect(metaContent(config, "og:image:height")).toEqual(["630"]);
    expect(metaContent(config, "og:image:alt")[0]).toBeTruthy();
  });
});
