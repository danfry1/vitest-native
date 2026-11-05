import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// VitePress fails the build on a link to a page that does not exist, but not on a link
// to a heading that does not: `/guide/engines#worker-recycling` kept building after the
// section moved, and sent readers to the top of the page. This resolves every site link
// with a fragment, from the site's pages and from both READMEs (which link the site by
// absolute URL), against the headings VitePress turns into anchors.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE = path.join(repoRoot, "website");
const SITE_URL = "https://danfry1.github.io/vitest-native";
const READMES = ["README.md", "packages/vitest-native/README.md"];

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith(".") ? [] : pages(file);
    return entry.name.endsWith(".md") ? [file] : [];
  });
}

/** VitePress's heading slug (@mdit-vue/shared's slugify), applied to the heading text. */
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}

/** Markdown with fenced code removed, so examples inside code are not read as content. */
const withoutCode = (text: string) => text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");

/** A heading's text as VitePress slugs it: link text kept, URLs, HTML and backticks dropped. */
function headingText(heading: string): string {
  let text = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Repeated until nothing changes, so a tag nested in a tag's text leaves no `<`.
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text.replace(/`/g, "");
}

/**
 * The anchors a page's headings get: an explicit `{#id}`, else the slug of their text,
 * with `-1`, `-2`, … appended to repeats, as VitePress does.
 */
function anchors(file: string): Set<string> {
  const result = new Set<string>();
  const seen = new Map<string, number>();
  for (const [, heading] of withoutCode(fs.readFileSync(file, "utf8")).matchAll(
    /^#{1,6} (.+)$/gm,
  )) {
    const explicit = /\{#([^\s}]+)[^}]*\}\s*$/.exec(heading);
    if (explicit) {
      result.add(explicit[1]);
      continue;
    }
    const slug = slugify(headingText(heading));
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    result.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return result;
}

/** The site page a route names: `/guide/engines` is website/guide/engines.md. */
function pageFor(route: string): string | null {
  const base = route.replace(/\/$/, "/index");
  const file = path.join(SITE, `${base || "/index"}.md`);
  return fs.existsSync(file) ? file : null;
}

type Link = { from: string; target: string; anchor: string };

function links(): Link[] {
  const result: Link[] = [];
  const sources = [...pages(SITE), ...READMES.map((readme) => path.join(repoRoot, readme))];
  for (const file of sources) {
    const from = path.relative(repoRoot, file);
    const isReadme = READMES.includes(from);
    const text = withoutCode(fs.readFileSync(file, "utf8"));
    for (const [, url] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const hash = url.indexOf("#");
      if (hash === -1) continue;
      const route = url.slice(0, hash);
      const anchor = url.slice(hash + 1);
      if (route === "") {
        // Same-page fragments in a README point at GitHub's anchors, not the site's.
        if (!isReadme) result.push({ from, target: file, anchor });
      } else if (route.startsWith(SITE_URL)) {
        result.push({ from, target: route.slice(SITE_URL.length), anchor });
      } else if (route.startsWith("/") && !isReadme) {
        result.push({ from, target: route, anchor });
      } else if (route.startsWith(".") && !isReadme) {
        // A relative link, as a route from this page's own route.
        const own = `/${path.relative(SITE, file).replace(/\.md$/, "").split(path.sep).join("/")}`;
        result.push({ from, target: path.posix.join(path.posix.dirname(own), route), anchor });
      }
    }
  }
  return result;
}

describe("site anchors", () => {
  const all = links();

  it("finds the links to check", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it("resolves every site link with a fragment to a heading", () => {
    const broken = all.filter(({ target, anchor }) => {
      const page = path.isAbsolute(target) && target.startsWith(SITE) ? target : pageFor(target);
      return page === null || !anchors(page).has(decodeURIComponent(anchor));
    });
    expect(broken.map(({ from, target, anchor }) => `${from} → ${target}#${anchor}`)).toEqual([]);
  });
});
