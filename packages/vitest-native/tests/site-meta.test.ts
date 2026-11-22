import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../../../website/.vitepress/config.ts";
import { canonicalUrl, normalizeBase } from "../../../website/.vitepress/site.ts";
import { SITE_URL } from "../src/docs-url.mjs";

// A link to the site shared on X, Facebook, LinkedIn or Slack shows the og:image, and
// none of them renders an SVG one: the card was an SVG, so shared links showed no image.
// The head is read from the site's own config (website/.vitepress/config.ts), and the
// address from the package's constant, which every printed link uses too.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PUBLIC = path.join(repoRoot, "website/public");
const SITE = `${SITE_URL}/`;

type HeadEntry = [string, Record<string, string>];

/** The `content` of each `['meta', { property|name, content }]` entry in the site's head. */
function metaContent(name: string): string[] {
  return (config.head as HeadEntry[])
    .filter(([tag, attrs]) => tag === "meta" && (attrs.property ?? attrs.name) === name)
    .map(([, attrs]) => attrs.content);
}

describe("social card", () => {
  for (const name of ["og:image", "twitter:image"]) {
    it(`${name} is one PNG or JPEG the site publishes`, () => {
      const images = metaContent(name);
      expect(images).toHaveLength(1);
      const [image] = images;
      expect(image.startsWith(SITE), image).toBe(true);
      expect(image).toMatch(/\.(png|jpe?g)$/);
      expect(fs.existsSync(path.join(PUBLIC, image.slice(SITE.length)))).toBe(true);
    });
  }

  it("is a 1200×630 image, the size the card's meta states", () => {
    const [image] = metaContent("og:image");
    const file = fs.readFileSync(path.join(PUBLIC, image.slice(SITE.length)));
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect(file.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("states the card's size and describes it", () => {
    expect(metaContent("og:image:width")).toEqual(["1200"]);
    expect(metaContent("og:image:height")).toEqual(["630"]);
    expect(metaContent("og:image:alt")[0]).toBeTruthy();
  });
});

// Previews and the old address serve copies of the site; each page names the published
// one as canonical, so search engines index one copy.
describe("canonical links and the base path", () => {
  it("names each page's published address", () => {
    expect(canonicalUrl("index.md")).toBe(`${SITE_URL}/`);
    expect(canonicalUrl("guide/index.md")).toBe(`${SITE_URL}/guide/`);
    expect(canonicalUrl("guide/install.md")).toBe(`${SITE_URL}/guide/install`);
    expect(canonicalUrl("migration\\from-jest.md")).toBe(`${SITE_URL}/migration/from-jest`);
  });

  it("serves the site under the base a host sets, with a slash at each end", () => {
    expect(normalizeBase("/")).toBe("/");
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("vitest-native")).toBe("/vitest-native/");
    expect(normalizeBase("/vitest-native/")).toBe("/vitest-native/");
  });
});
