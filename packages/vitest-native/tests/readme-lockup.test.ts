import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Both READMEs open with the logo and name: a light and a dark SVG for GitHub's themes, and a
// plain <img> of the light one, which is what npm's page keeps. They are linked by absolute
// raw.githubusercontent.com URLs because npm shows the README away from the repository.
// Every published README links these paths, so the SVGs must never move or be renamed.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const READMES = ["README.md", "packages/vitest-native/README.md"];
const RAW = "https://raw.githubusercontent.com/danfry1/vitest-native/main/";

describe("the README lockup", () => {
  it.each(READMES)("%s opens with it, light and dark, with a plain image npm keeps", (readme) => {
    const text = fs.readFileSync(path.join(repoRoot, readme), "utf8");
    const top = text.slice(0, text.indexOf("</h1>"));
    expect(text.startsWith("<h1>")).toBe(true);
    expect(top).toContain(
      `<source media="(prefers-color-scheme: dark)" srcset="${RAW}website/public/lockup-dark.svg">`,
    );
    expect(top).toMatch(
      new RegExp(`<img src="${RAW}website/public/lockup\\.svg" alt="vitest-native" `),
    );
    // The badges stay below the heading.
    expect(text.indexOf("img.shields.io")).toBeGreaterThan(text.indexOf("</h1>"));
  });

  it.each(["lockup.svg", "lockup-dark.svg"])("%s exists and needs no font", (file) => {
    const svg = fs.readFileSync(path.join(repoRoot, "website/public", file), "utf8");
    expect(svg).toContain('aria-label="vitest-native"');
    expect(svg).not.toMatch(/<text\b|font-family/);
  });
});
