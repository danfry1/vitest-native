#!/usr/bin/env node
// Builds the site GitHub Pages serves at the old address, danfry1.github.io/vitest-native.
//
// The docs moved to their own domain, but every released vitest-native prints links to the
// old one in its errors, and those stay in terminals and CI logs. So the old address keeps a
// page for every page the site has, each sending the reader to the same page on the new
// domain, anchor and query included. A link to a page that never existed lands on the new
// site's own not-found page, path kept.
//
//   node website/scripts/redirect-site.mjs <built site> <output folder>
//
// The built site is `website/.vitepress/dist`; its pages are the list to redirect. Files
// that are not pages (the social card, favicon, llms.txt, sitemap) are copied as they are,
// so old link previews and crawlers still find them. The site's hashed scripts and styles
// are left out: no redirect page loads them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL } from "../../packages/vitest-native/src/docs-url.mjs";

/** The path GitHub Pages serves the old site under. */
export const OLD_BASE = "/vitest-native";

/** `guide/install.html` is `/guide/install`, `guide/index.html` is `/guide/`, `index.html` is `/`. */
export function pagePath(htmlFile) {
  const page = htmlFile.replace(/\\/g, "/").replace(/\.html$/, "");
  if (page === "index") return "/";
  return `/${page.endsWith("/index") ? page.slice(0, -"index".length) : page}`;
}

/**
 * The script each redirect runs first. It maps the address the reader opened onto the new
 * site, keeping `?query` and `#anchor`, which a meta refresh drops: an error's link to
 * `/guide/errors#SOURCE_EVALUATED_TWICE` has to land on that heading.
 */
export function redirectScript(siteUrl = SITE_URL, oldBase = OLD_BASE) {
  return [
    "(function () {",
    "  var p = location.pathname;",
    `  if (p.indexOf(${JSON.stringify(`${oldBase}/`)}) === 0 || p === ${JSON.stringify(oldBase)}) p = p.slice(${oldBase.length});`,
    '  p = p.replace(/\\.html$/, "").replace(/(^|\\/)index$/, "$1");',
    '  if (p.charAt(0) !== "/") p = "/" + p;',
    `  location.replace(${JSON.stringify(siteUrl)} + p + location.search + location.hash);`,
    "})();",
  ].join("\n");
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A redirect page for one page of the site, whose new address is `target`. */
export function redirectPage(target, siteUrl = SITE_URL, oldBase = OLD_BASE) {
  const href = escape(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>This page moved</title>
<link rel="canonical" href="${href}">
<meta name="robots" content="noindex">
<script>
${redirectScript(siteUrl, oldBase)}
</script>
<meta http-equiv="refresh" content="0; url=${href}">
</head>
<body>
<p>This page moved to <a href="${href}">${href}</a>.</p>
</body>
</html>
`;
}

/**
 * Turns the built site in `dist` into the redirect site in `out`. Returns the redirected
 * pages' paths, as the new site serves them.
 */
export function buildRedirectSite({ dist, out, siteUrl = SITE_URL, oldBase = OLD_BASE }) {
  if (!fs.existsSync(path.join(dist, "index.html")))
    throw new Error(`redirect site: ${dist} has no index.html; build the site first`);
  fs.rmSync(out, { recursive: true, force: true });
  const pages = [];
  for (const entry of fs.readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.relative(dist, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/");
    if (file === "404.html" || file.startsWith("assets/")) continue;
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (file.endsWith(".html")) {
      const page = pagePath(file);
      pages.push(page);
      fs.writeFileSync(target, redirectPage(`${siteUrl}${page}`, siteUrl, oldBase));
    } else {
      fs.copyFileSync(path.join(dist, file), target);
    }
  }
  // Any other address: the same path on the new site, which shows its own not-found page.
  fs.writeFileSync(path.join(out, "404.html"), redirectPage(`${siteUrl}/`, siteUrl, oldBase));
  return pages.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dist, out] = process.argv.slice(2);
  if (!dist || !out) {
    console.error("usage: node website/scripts/redirect-site.mjs <built site> <output folder>");
    process.exit(1);
  }
  const pages = buildRedirectSite({ dist, out });
  console.log(`redirect site: ${pages.length} pages redirect to ${SITE_URL}, written to ${out}`);
}
