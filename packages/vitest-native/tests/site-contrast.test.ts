import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The site once put white text on a teal that read at 2.6:1, and ran the hero name through a
// gradient that fell to 2:1 on white; WCAG AA asks 4.5:1 for text. This resolves the colours
// a page actually gets, VitePress's tokens with the site's overrides from
// website/.vitepress/theme/custom.css on top, in both themes, and holds each pair to AA.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CUSTOM = path.join(repoRoot, "website/.vitepress/theme/custom.css");
const require = createRequire(path.join(repoRoot, "package.json"));
const VARS = path.join(
  path.dirname(require.resolve("vitepress/package.json")),
  "dist/client/theme-default/styles/vars.css",
);

type Rgba = [number, number, number, number];
type Tokens = Map<string, string>;

/** The custom properties declared directly in each `:root { … }` or `.dark { … }` block. */
function declarations(css: string, selector: ":root" | ".dark"): Tokens {
  const tokens: Tokens = new Map();
  // Comments out, and @media blocks: a `:root` inside one applies only at some widths.
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  for (const [, selectors, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(",").some((s) => s.trim() === selector)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

/**
 * The tokens a page sees in each theme. `:root` and `.dark` both match the root element with
 * equal specificity, so source order decides: VitePress's sheet, then the site's.
 */
function theme(dark: boolean): Tokens {
  const vitepress = fs.readFileSync(VARS, "utf8");
  const custom = fs.readFileSync(CUSTOM, "utf8");
  const layers = [declarations(vitepress, ":root")];
  if (dark) layers.push(declarations(vitepress, ".dark"));
  layers.push(declarations(custom, ":root"));
  if (dark) layers.push(declarations(custom, ".dark"));
  return new Map(layers.flatMap((layer) => [...layer]));
}

function resolve(tokens: Tokens, value: string, seen = new Set<string>()): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!ref) return value.trim();
  if (seen.has(ref[1])) throw new Error(`cycle at ${ref[1]}`);
  const next = tokens.get(ref[1]);
  if (next === undefined) throw new Error(`undefined token ${ref[1]}`);
  return resolve(tokens, next, new Set([...seen, ref[1]]));
}

function parseColor(value: string): Rgba {
  const hex = /^#([\da-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    value,
  );
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
  throw new Error(`not a colour this test reads: ${value}`);
}

/** A translucent colour as it shows over an opaque one. */
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [
  r * a + R * (1 - a),
  g * a + G * (1 - a),
  b * a + B * (1 - a),
  1,
];

function luminance([r, g, b]: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text, then the surfaces under it, outermost first (each laid over the page). AA: 4.5:1.
const PAIRS: Array<[text: string, ...surfaces: string[]]> = [
  ["--vp-c-text-1", "--vp-c-bg"], // body text
  ["--vp-c-text-2", "--vp-c-bg"], // secondary text, the hero tagline
  ["--vp-c-text-2", "--vp-sidebar-bg-color"], // sidebar items
  ["--vp-c-text-3", "--vp-c-bg"], // hints and prompts
  ["--vp-home-hero-name-color", "--vp-c-bg"], // the hero's name label
  ["--vp-code-color", "--vp-code-bg"], // inline code
  ["--vp-code-link-color", "--vp-code-bg"], // inline code inside a link
  ["--vp-c-brand-1", "--vp-c-bg"], // links, inline code
  ["--vp-c-brand-2", "--vp-c-bg"], // a link under the pointer
  ["--vp-c-brand-1", "--vp-sidebar-bg-color"], // the active sidebar link
  ["--vp-c-brand-1", "--vp-c-bg-soft"],
  ["--vp-c-brand-1", "--vp-code-bg"], // a link's inline code
  ["--vp-c-brand-2", "--vp-code-bg"],
  ["--vp-custom-block-tip-text", "--vp-custom-block-tip-bg"],
  ["--vp-c-tip-1", "--vp-custom-block-tip-bg"], // a link inside a tip
  ["--vp-c-tip-2", "--vp-custom-block-tip-bg"],
  ["--vp-c-tip-1", "--vp-custom-block-tip-bg", "--vp-custom-block-tip-code-bg"],
  ["--vp-c-tip-2", "--vp-custom-block-tip-bg", "--vp-custom-block-tip-code-bg"],
  ["--vp-badge-tip-text", "--vp-badge-tip-bg"],
  ["--vp-button-brand-text", "--vp-button-brand-bg"],
  ["--vp-button-brand-hover-text", "--vp-button-brand-hover-bg"],
  ["--vp-button-brand-active-text", "--vp-button-brand-active-bg"],
  ["--vp-button-alt-text", "--vp-button-alt-bg"],
  ["--vp-button-alt-hover-text", "--vp-button-alt-hover-bg"],
];

for (const dark of [false, true]) {
  describe(`site colours, ${dark ? "dark" : "light"} theme`, () => {
    const tokens = theme(dark);
    const page = parseColor(resolve(tokens, "var(--vp-c-bg)"));
    const raw = (token: string) => parseColor(resolve(tokens, `var(${token})`));

    it.each(PAIRS)("%s on %s reads at 4.5:1 or more", (text, ...surfaces) => {
      const ground = surfaces.reduce((under, token) => over(raw(token), under), page);
      expect(contrast(over(raw(text), ground), ground)).toBeGreaterThanOrEqual(4.5);
    });

    it("the hero name is plain text, with no gradient behind it", () => {
      // A gradient would make the name's colour vary along it, which the pair above cannot
      // check, so the site keeps it to one colour.
      expect(resolve(tokens, "var(--vp-home-hero-name-background)")).not.toMatch(/gradient/);
    });
  });
}
