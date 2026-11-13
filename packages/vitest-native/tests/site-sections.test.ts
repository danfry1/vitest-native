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

// The landing page is the logo's link, and the not-found page is no page to go to.
const OUTSIDE_SECTIONS = new Set(["/", "/404"]);

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

  it("are the site's nav and sidebar", () => {
    expect(config.themeConfig?.nav).toEqual(nav());
    expect(config.themeConfig?.sidebar).toEqual(sidebar());
  });
});
