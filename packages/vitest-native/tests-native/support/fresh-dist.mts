// Imported first by every tests-native config that loads the built plugin, so a stale
// dist/ fails here with the fix named, before any gate runs against it
// (scripts/build-stamp.mjs; tests/build-stamp.test.ts holds every config to it).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreshDist } from "../../scripts/build-stamp.mjs";

assertFreshDist(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
