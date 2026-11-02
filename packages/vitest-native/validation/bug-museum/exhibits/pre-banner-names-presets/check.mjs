// The banner line must name the safeAreaContext preset.
import fs from "node:fs";
const output = fs.readFileSync(0, "utf8");
const banner = output.split("\n").find((line) => line.includes("[vitest-native] engine:"));
if (!banner) {
  console.log("no engine banner in the output");
  process.exit(1);
}
if (!/\bsafeAreaContext\b/.test(banner)) {
  console.log(`the banner does not name the safeAreaContext preset: ${banner.trim()}`);
  process.exit(1);
}
