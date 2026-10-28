// The precondition: hot auto picked the hot runtime for the native project (run 1).
import fs from "node:fs";
const output = fs.readFileSync(0, "utf8");
const banners = output.split("\n").filter((line) => line.includes("[vitest-native] engine:"));
if (!banners.some((line) => line.includes("hot runtime"))) {
  console.log(`precondition not met: hot auto did not select the hot runtime here (${banners.map((l) => l.trim()).join(" | ") || "no banner"})`);
  process.exit(1);
}
