import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { OLD_BASE, buildRedirectSite, pagePath } from "../../../website/scripts/redirect-site.mjs";
import { SITE_URL } from "../src/docs-url.mjs";

// The old address, danfry1.github.io/vitest-native, serves a redirect for every page of the
// site (website/scripts/redirect-site.mjs, deployed by .github/workflows/pages.yml), because
// released versions print links to it. This builds the redirect site from a stand-in for
// the built site, one page per Markdown page, and holds every redirect to its new address.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEBSITE = path.join(repoRoot, "website");
const PAGES_WORKFLOW = path.join(repoRoot, ".github/workflows/pages.yml");
const BUILT_SITE = "website/.vitepress/dist";
const OLD_SITE = "danfry1.github.io/vitest-native";

/** The site's pages, as the build writes them: `guide/install.md` is `guide/install.html`. */
function sitePages(): string[] {
  return fs
    .readdirSync(WEBSITE, { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter(
      (file) => file.endsWith(".md") && !/(^|\/)(node_modules|\.vitepress|public)\//.test(file),
    )
    .map((file) => file.replace(/\.md$/, ".html"))
    .sort();
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "redirect-site-"));
afterAll(() => fs.rmSync(work, { recursive: true, force: true }));
const dist = path.join(work, "dist");
const out = path.join(work, "out");
for (const file of [
  ...sitePages(),
  "404.html",
  "og-card.png",
  "llms.txt",
  "sitemap.xml",
  "assets/app.abc.js",
]) {
  fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
  fs.writeFileSync(path.join(dist, file), file);
}
const redirected = buildRedirectSite({ dist, out });
const read = (file: string) => fs.readFileSync(path.join(out, file), "utf8");

/** Where a redirect page's script sends a reader who opened `href` on the old site. */
function landing(page: string, href: string): string {
  const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(read(page))?.[1];
  if (!script) throw new Error(`${page} has no script`);
  const url = new URL(href);
  let target = "";
  const location = {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    replace: (to: string) => (target = to),
  };
  vm.runInNewContext(script, { location });
  return target;
}

describe("the redirect site at the old address", () => {
  it("has a redirect for every page of the site", () => {
    const pages = sitePages();
    expect(pages.length).toBeGreaterThan(20);
    expect(redirected).toEqual(pages.map(pagePath).sort());
    for (const page of pages) expect(fs.existsSync(path.join(out, page)), page).toBe(true);
  });

  it("names each page's new address as canonical, refresh target and link", () => {
    for (const page of sitePages()) {
      const target = `${SITE_URL}${pagePath(page)}`;
      const html = read(page);
      expect(html, page).toContain(`<link rel="canonical" href="${target}">`);
      expect(html, page).toContain(`<meta http-equiv="refresh" content="0; url=${target}">`);
      expect(html, page).toContain(`<a href="${target}">`);
    }
  });

  it("keeps the anchor and the query, from any spelling of the old address", () => {
    const old = `https://${OLD_SITE}`;
    expect(landing("guide/errors.html", `${old}/guide/errors#SOURCE_EVALUATED_TWICE`)).toBe(
      `${SITE_URL}/guide/errors#SOURCE_EVALUATED_TWICE`,
    );
    expect(landing("guide/errors.html", `${old}/guide/errors.html?x=1#CODE`)).toBe(
      `${SITE_URL}/guide/errors?x=1#CODE`,
    );
    expect(landing("index.html", `${old}/`)).toBe(`${SITE_URL}/`);
    expect(landing("index.html", `${old}/index.html`)).toBe(`${SITE_URL}/`);
    expect(landing("guide/index.html", `${old}/guide/`)).toBe(`${SITE_URL}/guide/`);
    expect(landing("404.html", `${old}/no/such/page#x`)).toBe(`${SITE_URL}/no/such/page#x`);
    expect(landing("404.html", `https://danfry1.github.io${OLD_BASE}`)).toBe(`${SITE_URL}/`);
  });

  it("keeps the files that are not pages, and leaves out the site's scripts", () => {
    expect(read("og-card.png")).toBe("og-card.png");
    expect(read("llms.txt")).toBe("llms.txt");
    expect(read("sitemap.xml")).toBe("sitemap.xml");
    expect(fs.existsSync(path.join(out, "assets"))).toBe(false);
  });

  it("is what the Pages workflow deploys, with the full site as a manual fallback", () => {
    const workflow = fs.readFileSync(PAGES_WORKFLOW, "utf8");
    expect(workflow).toContain(
      `node website/scripts/redirect-site.mjs ${BUILT_SITE} "$RUNNER_TEMP/redirect-site"`,
    );
    expect(workflow).toContain("format('{0}/redirect-site', runner.temp)");
    expect(workflow).toMatch(/full_site:\n\s+description: .+\n\s+type: boolean\n\s+default: false/);
  });
});

describe("links to the docs", () => {
  it("use the new address everywhere but the release history, the redirect site and its note", () => {
    let files: string[] = [];
    try {
      files = execFileSync("git", ["grep", "--untracked", "-lF", OLD_SITE], {
        cwd: repoRoot,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
    } catch (error) {
      // git grep exits 1 when nothing matches.
      if ((error as { status?: number }).status !== 1) throw error;
    }
    // The release note that announces the move names the old address too.
    expect(files.filter((file) => !file.endsWith("CHANGELOG.md")).sort()).toEqual([
      ".changeset/docs-domain.md",
      ".github/workflows/pages.yml",
      "packages/vitest-native/tests/redirect-site.test.ts",
      "website/scripts/redirect-site.mjs",
    ]);
    expect(SITE_URL).toBe("https://vitest-native.danfry.dev");
  });
});
