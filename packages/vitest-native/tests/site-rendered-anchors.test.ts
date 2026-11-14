import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdownRenderer, disposeMdItInstance } from "vitepress";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../../../website/.vitepress/config.ts";

// tests/site-anchors.test.ts resolves the fragments in the site's Markdown. VitePress then
// rewrites them: every link's hash passes through the heading slugifier, so a link to
// `/guide/errors#HOT_MEMORY_UNBOUNDED` was published as `#hot-memory-unbounded`, which no
// heading has. This renders every page with the site's own Markdown options, as the build
// does, and resolves the links VitePress writes against the ids it writes.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE = path.join(repoRoot, "website");

/** Every page, as its file relative to the site: `guide/errors.md`. */
function pages(dir = SITE): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") || ["public", "node_modules"].includes(entry.name)
        ? []
        : pages(file);
    }
    return entry.name.endsWith(".md") ? [path.relative(SITE, file).split(path.sep).join("/")] : [];
  });
}

/** A page's route: `guide/index.md` is `/guide/`, `guide/errors.md` is `/guide/errors`. */
const route = (page: string) => `/${page.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "")}`;

type Rendered = { page: string; html: string; frontmatter: Record<string, unknown> };

async function render(options: typeof config.markdown): Promise<Rendered[]> {
  // VitePress keeps one renderer per process: without this, a second call returns the first.
  disposeMdItInstance();
  const md = await createMarkdownRenderer(SITE, options, "/");
  // renderAsync, as the build does: it expands `<!-- @include -->` and waits for highlighting,
  // which would otherwise still be running when the renderer is disposed.
  return Promise.all(
    pages().map(async (page) => {
      const env: { frontmatter?: Record<string, unknown>; [key: string]: unknown } = {
        path: path.join(SITE, page),
        relativePath: page,
        cleanUrls: config.cleanUrls,
      };
      const html = await md.renderAsync(fs.readFileSync(path.join(SITE, page), "utf8"), env);
      return { page, html, frontmatter: env.frontmatter ?? {} };
    }),
  );
}

/** The theme's components, whose links VitePress neither rewrites nor checks. */
function components(dir = path.join(SITE, ".vitepress/theme")): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return components(file);
    return /\.(vue|ts)$/.test(entry.name) ? [file] : [];
  });
}

/**
 * Every string in a theme file that starts with one `/`: a link however it is written
 * (`withBase('/x')`, `href="/x"`, `:href="'/x'"`, `router.go('/x')`), so a new spelling is
 * checked too. A link built at run time (`withBase(entry.link)`) is checked where its data
 * comes from.
 */
const SITE_PATH = /(['"`])(\/(?!\/)[^'"`\s$<>{}]*)\1/g;

/** The `link` values in the theme config (nav, sidebar) and in a page's frontmatter. */
function linkValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(linkValues);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "link" && typeof inner === "string" ? [inner] : linkValues(inner),
  );
}

const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
const headingIds = (html: string) =>
  [...html.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map(([, id]) => id);

describe("the site as VitePress renders it", () => {
  let site: Rendered[];
  beforeAll(async () => {
    site = await render(config.markdown);
  });
  afterAll(() => disposeMdItInstance());

  it("links every fragment to an id on its page", () => {
    const byRoute = new Map(site.map(({ page, html }) => [route(page), ids(html)]));
    const links = site.flatMap(({ page, html }) =>
      // A heading's own `#` link is left out: it links the id it sits next to.
      [
        ...html.matchAll(/<a\b(?![^>]*class="header-anchor")[^>]*\shref="(\/[^"#]*)?#([^"]+)"/g),
      ].map(([, target, hash]) => ({
        from: page,
        target: (target ?? route(page)).replace(/\.html$/, ""),
        hash: decodeURIComponent(hash),
      })),
    );
    // Links between and within pages, not counting headings' own (129 when written).
    expect(links.length).toBeGreaterThan(100);
    // Links from other pages to an error code's entry, which this check exists for.
    expect(
      links.filter(({ from, target }) => target === "/guide/errors" && from !== "guide/errors.md")
        .length,
    ).toBeGreaterThan(5);
    const broken = links.filter(({ target, hash }) => !byRoute.get(target)?.has(hash));
    expect(broken.map(({ from, target, hash }) => `${from} → ${target}#${hash}`)).toEqual([]);
  });

  it("links every page and fragment the theme, its config and frontmatter name", () => {
    // These are used as written: VitePress neither rewrites nor checks them.
    const byRoute = new Map(site.map(({ page, html }) => [route(page), ids(html)]));
    const PUBLIC = path.join(SITE, "public");
    const links = [
      ...components().flatMap((file) =>
        [...fs.readFileSync(file, "utf8").matchAll(SITE_PATH)].map(([, , link]) => ({
          from: path.relative(SITE, file),
          link,
        })),
      ),
      ...linkValues(config.themeConfig).map((link) => ({ from: ".vitepress/config.ts", link })),
      ...site.flatMap(({ page, frontmatter }) =>
        linkValues(frontmatter).map((link) => ({ from: `${page} (frontmatter)`, link })),
      ),
    ].filter(({ link }) => link.startsWith("/") && !link.startsWith("//"));
    // The landing page's calls to action and hero, the diagram's link, nav and sidebar.
    expect(links.filter(({ from }) => from.endsWith(".vue")).length).toBeGreaterThanOrEqual(4);
    expect(links.filter(({ from }) => from.includes("frontmatter")).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(links.filter(({ from }) => from.endsWith("config.ts")).length).toBeGreaterThan(20);
    const broken = links.filter(({ link }) => {
      const [target, hash] = link.split("#");
      // A file in public/ is served as it is: the logo, llms.txt.
      if (hash === undefined && fs.existsSync(path.join(PUBLIC, target))) return false;
      const own = byRoute.get(target);
      return !own || (hash !== undefined && !own.has(decodeURIComponent(hash)));
    });
    expect(broken.map(({ from, link }) => `${from} → ${link}`)).toEqual([]);
  });

  it("gives every heading the id VitePress's own slugifier does", async () => {
    // website/.vitepress/anchors.ts copies that slugifier and keeps an error code as written.
    // Every error-code heading has an explicit `{#CODE}` id, so no heading id may differ:
    // a new heading that is only a code needs one too.
    const stock = await render({ ...config.markdown, anchor: undefined });
    const differ = site.flatMap(({ page, html }, at) => {
      const own = headingIds(html);
      const theirs = headingIds(stock[at].html);
      return own.flatMap((id, n) => (id === theirs[n] ? [] : [`${page}: ${theirs[n]} → ${id}`]));
    });
    expect(differ).toEqual([]);
  });
});
