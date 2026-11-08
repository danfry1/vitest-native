import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITE_URL as DOCS_SITE_URL } from "../src/docs-url.mjs";

// VitePress fails the build on a link to a page that does not exist, but not on a link
// to a heading that does not: `/guide/engines#worker-recycling` kept building after the
// section moved, and sent readers to the top of the page. This resolves every site link
// with a fragment, from the site's pages, both READMEs and the package's own source (which
// link the site by absolute URL), against the headings VitePress turns into anchors.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE = path.join(repoRoot, "website");
// The site's address, from the constant every printed link is built from.
const SITE_URL: string = DOCS_SITE_URL;
// Pages outside the site that link it by absolute URL: both READMEs, and the packaged
// migration pointer that vitest-native's own messages link to.
const READMES = [
  "README.md",
  "packages/vitest-native/README.md",
  "packages/vitest-native/docs/migrating-from-jest.md",
];

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

// `anchor` is null for a link to a page with no fragment: only the page must exist.
type Link = { from: string; target: string; anchor: string | null };

const SOURCE = path.join(repoRoot, "packages/vitest-native/src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|mts|mjs)$/.test(entry.name) ? [file] : [];
  });
}

/**
 * The site links the package's own messages and doc comments carry: an error's "See …",
 * a CLI hint. They are plain URLs in strings, not Markdown links, each in one literal: a
 * URL split across a `+` is not found.
 */
// SITE_URL as a regex literal, then the route and an optional fragment. A test below holds
// it to SITE_URL.
const SITE_LINK = /https:\/\/vitest-native\.danfry\.dev(\/[\w/-]*)(?:#([\w-]+))?/g;

// A link built from the constant: `docsUrl("/guide/errors#CODE")`. The path is one string
// literal, so a reader of the source sees the page it links.
const DOCS_CALL = /docsUrl\(\s*["'`](\/[\w/-]*)(?:#([\w-]+))?["'`]\s*\)/g;

function sourceLinks(): Link[] {
  return sourceFiles(SOURCE).flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return [...text.matchAll(SITE_LINK), ...text.matchAll(DOCS_CALL)].map(([, target, anchor]) => ({
      from: path.relative(repoRoot, file),
      target,
      anchor: anchor ?? null,
    }));
  });
}

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
  const fromSource = sourceLinks();
  const all = [...links(), ...fromSource];

  it("matches source links against the site's own URL", () => {
    expect(`${SITE_URL}/guide/errors#X`.match(SITE_LINK)).toEqual([`${SITE_URL}/guide/errors#X`]);
    expect("https://vitest-nativexdanfry.dev/guide".match(SITE_LINK)).toBeNull();
  });

  it("finds the links to check", () => {
    expect(all.length).toBeGreaterThan(50);
    expect(fromSource.length).toBeGreaterThanOrEqual(12);
    // Every docsUrl() call has a literal path this test can read. One built from a variable
    // or a template would link a page nothing checks.
    const calls = sourceFiles(SOURCE)
      .filter((file) => !/docs-url\.(mjs|d\.mts)$/.test(file))
      .flatMap((file) => fs.readFileSync(file, "utf8").match(/docsUrl\(/g) ?? []).length;
    const checked = sourceFiles(SOURCE)
      .filter((file) => !/docs-url\.(mjs|d\.mts)$/.test(file))
      .flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(DOCS_CALL)]).length;
    expect(checked).toBe(calls);
  });

  it("spells the site's address in src/ only in docs-url.mjs, or in a doc comment", () => {
    // Moving the site changes one constant. A message that spells the address out would
    // keep pointing at the old one; a doc comment cannot call docsUrl(), so it may, and the
    // literal-link check above holds it to the constant's address.
    const host = new URL(SITE_URL).host;
    const spelled = sourceFiles(SOURCE).flatMap((file) =>
      path.basename(file) === "docs-url.mjs"
        ? []
        : fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter((line) => line.includes(host) && !/^\s*(\*|\/\/|\/\*)/.test(line))
            .map((line) => `${path.relative(repoRoot, file)}: ${line.trim()}`),
    );
    expect(spelled).toEqual([]);
  });

  it("links the site, not the repository's docs/ folder, from the package's messages", () => {
    // Comment lines may cite docs/ for maintainers; a message, hint or warning may not:
    // most of docs/ is not in the package, and the site is what users read.
    const repoDocs = sourceFiles(SOURCE).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .filter((line) => /\/blob\/main\/packages|\bdocs\/[\w-]+\.md/.test(line))
        .map((line) => `${path.relative(repoRoot, file)}: ${line.trim()}`),
    );
    expect(repoDocs).toEqual([]);
  });

  it("resolves every site link with a fragment to a heading", () => {
    const broken = all.filter(({ target, anchor }) => {
      const page = path.isAbsolute(target) && target.startsWith(SITE) ? target : pageFor(target);
      if (page === null) return true;
      return anchor !== null && !anchors(page).has(decodeURIComponent(anchor));
    });
    expect(
      broken.map(({ from, target, anchor }) => `${from} → ${target}${anchor ? `#${anchor}` : ""}`),
    ).toEqual([]);
  });
});
