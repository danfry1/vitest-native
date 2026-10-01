// Release channel and notes for a tagged version (used by .github/workflows/release.yml).
//
// - The npm dist-tag. A prerelease (any version with a `-` part, e.g. 0.14.0-rc.0) goes to
//   `next`; anything else to `latest`. npm 11 refuses to publish a prerelease without an
//   explicit `--tag` ("You must specify a tag using --tag when publishing a prerelease
//   version", npm/cli#7910), so the tag is always passed explicitly.
// - The release notes: the version's CHANGELOG section, which is what users read on the
//   GitHub Release. A prerelease falls back to its base version's section (0.14.0-rc.0
//   → 0.14.0), where the release notes are written.
//
//   node scripts/release-channel.mjs <version> [--notes-file <path>]
//   prints `dist-tag=<tag>` and `prerelease=<true|false>`, for $GITHUB_OUTPUT.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function releaseChannel(version) {
  const prerelease = version.includes("-");
  return { distTag: prerelease ? "next" : "latest", prerelease };
}

/** The body of `## <version>` (or of its base version), without the heading, or null. */
export function changelogSection(changelog, version) {
  const base = version.split("-")[0];
  for (const candidate of base === version ? [version] : [version, base]) {
    const lines = changelog.split("\n");
    const start = lines.findIndex((line) => line.trim() === `## ${candidate}`);
    if (start === -1) continue;
    let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
    if (end === -1) end = lines.length;
    const body = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();
    if (body) return body;
  }
  return null;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const [version, flag, notesFile] = process.argv.slice(2);
  if (!version) throw new Error("usage: release-channel.mjs <version> [--notes-file <path>]");
  const { distTag, prerelease } = releaseChannel(version);
  console.log(`dist-tag=${distTag}`);
  console.log(`prerelease=${prerelease}`);
  if (flag === "--notes-file" && notesFile) {
    const changelog = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "CHANGELOG.md"),
      "utf8",
    );
    const section = changelogSection(changelog, version);
    if (section === null) throw new Error(`CHANGELOG.md has no section for ${version}`);
    fs.writeFileSync(notesFile, `${section}\n`);
  }
}
