import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../../../website/.vitepress/config.ts";
import { SECTIONS, activeMatch, nav, sidebar } from "../../../website/.vitepress/sections.ts";

// The site's top nav and sidebar come from one list of sections
// (website/.vitepress/sections.ts). A page left out of every section has no way in from the
// nav or the sidebar, and a page in two highlights two nav items.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEBSITE = path.join(repoRoot, "website");

/** Every page's route, as VitePress serves it: `guide/index.md` is `/guide/`. */
function pages(): string[] {
  return fs
    .readdirSync(WEBSITE, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file.endsWith(".md") && !/^(\.vitepress|public|node_modules)\//.test(file))
    .map((file) => `/${file.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "")}`);
}

// The landing page is the logo's link.
const OUTSIDE_SECTIONS = new Set(["/"]);

describe("the site's sections", () => {
  const listed = SECTIONS.flatMap((section) => section.pages.map((page) => page.link));

  it("list every page once", () => {
    const expected = pages().filter((page) => !OUTSIDE_SECTIONS.has(page));
    expect(expected.length).toBeGreaterThan(20);
    expect([...listed].sort()).toEqual([...expected].sort());
  });

  it("link only to pages that exist", () => {
    for (const link of [...listed, ...SECTIONS.map((section) => section.link)]) {
      expect(pages(), link).toContain(link);
    }
  });

  it("highlight one nav item on each page: its section's", () => {
    for (const section of SECTIONS) {
      const match = new RegExp(activeMatch(section));
      for (const page of listed) {
        expect(match.test(page), `${section.text} on ${page}`).toBe(
          section.pages.some((own) => own.link === page),
        );
      }
    }
  });

  it("match a page's path exactly, dots included", () => {
    const releases = SECTIONS.find((section) =>
      section.pages.some((page) => page.link === "/releases/0.14"),
    );
    expect(releases).toBeDefined();
    const match = new RegExp(activeMatch(releases!));
    expect(match.test("/releases/0.14")).toBe(true);
    expect(match.test("/releases/0x14")).toBe(false);
    expect(match.test("/releases/0.14/more")).toBe(false);
  });

  // The footer's previous and next links follow the sidebar: a link out would be a "Next".
  it("list only the site's own pages in the sidebar", () => {
    const links = sidebar().flatMap((group) => group.items.map((item) => item.link));
    for (const link of links) expect(link, link).toMatch(/^\/(?!\/)/);
  });

  it("are the site's nav and sidebar", () => {
    expect(config.themeConfig?.nav).toEqual(nav());
    expect(config.themeConfig?.sidebar).toEqual(sidebar());
  });
});
