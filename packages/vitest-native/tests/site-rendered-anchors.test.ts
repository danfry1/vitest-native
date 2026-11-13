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

type Rendered = { page: string; html: string };

async function render(options: typeof config.markdown): Promise<Rendered[]> {
  // VitePress keeps one renderer per process: without this, a second call returns the first.
  disposeMdItInstance();
  const md = await createMarkdownRenderer(SITE, options, "/");
  // renderAsync, as the build does: it expands `<!-- @include -->` and waits for highlighting,
  // which would otherwise still be running when the renderer is disposed.
  return Promise.all(
    pages().map(async (page) => ({
      page,
      html: await md.renderAsync(fs.readFileSync(path.join(SITE, page), "utf8"), {
        path: path.join(SITE, page),
        relativePath: page,
        cleanUrls: config.cleanUrls,
      }),
    })),
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
 * The site links a component writes as a literal: `withBase('/guide/engines#x')` or
 * `href="/guide/engines"`. A link built at run time (`withBase(entry.link)`) is checked
 * where its data comes from.
 */
const COMPONENT_LINK = /withBase\(\s*['"`](\/[^'"`$]*)['"`]\s*\)|\shref="(\/[^"]*)"/g;

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

  it("links every page and fragment a component names", () => {
    const byRoute = new Map(site.map(({ page, html }) => [route(page), ids(html)]));
    const links = components().flatMap((file) =>
      [...fs.readFileSync(file, "utf8").matchAll(COMPONENT_LINK)].map(([, base, href]) => {
        const [target, hash] = (base ?? href).split("#");
        return { from: path.relative(SITE, file), target, hash };
      }),
    );
    // The landing page's calls to action and the boundary diagram's link (4 when written).
    expect(links.length).toBeGreaterThanOrEqual(4);
    // The link is used as written: no slugifier sits between it and the id.
    const broken = links.filter(
      ({ target, hash }) =>
        !byRoute.has(target) || (hash !== undefined && !byRoute.get(target)!.has(hash)),
    );
    expect(
      broken.map(({ from, target, hash }) => `${from} → ${target}${hash ? `#${hash}` : ""}`),
    ).toEqual([]);
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
