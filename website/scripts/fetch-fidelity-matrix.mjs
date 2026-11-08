// Fetches the fidelity matrix page the RN matrix workflow publishes to the `site-data`
// branch (.github/workflows/native-rn-matrix.yml, "Publish fidelity matrix"), for a build
// that cannot read CI artifacts itself (Vercel). Best effort: on any failure the committed
// placeholder page ships, so the site build never depends on the matrix being available.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo =
  process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "danfry1/vitest-native";
const url = `https://raw.githubusercontent.com/${repo}/site-data/fidelity-matrix.md`;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../guide/fidelity-matrix.md");
// The page the matrix script writes starts with this marker; anything else is not ours.
const MARKER = "GENERATED FILE — do not edit by hand.";

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const page = await response.text();
  if (!page.startsWith("<!--") || !page.includes(MARKER)) {
    throw new Error("not a generated fidelity matrix page");
  }
  fs.writeFileSync(out, page);
  console.log(`fidelity matrix: fetched from ${url}`);
} catch (error) {
  console.log(`fidelity matrix: keeping the committed placeholder (${error.message})`);
}
