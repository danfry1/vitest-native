import fs from "node:fs";
import { expect, it } from "vitest";
import { collect, heldCount, holdThisFile, reacts, survivors } from "./hold";

const fresh = process.env.VN_FRESH !== "0";

it(
  fresh
    ? "no earlier file's React or scheduler outlives it, beyond a fixed few"
    : "every file shares the one resident React",
  async () => {
    await holdThisFile("zz");
    expect(heldCount(), "every file ran in this worker").toBe(24);
    const heap = await collect();
    if (process.env.VN_HEAP_OUT) {
      fs.appendFileSync(process.env.VN_HEAP_OUT, `${fresh ? "fresh" : "resident"} ${heap}\n`);
    }
    if (!fresh) {
      expect(new Set(reacts()).size).toBe(1);
      return;
    }
    // A fixed residue, whatever the file count: the previous file's ESM generation, which
    // the loader releases one file late, and the first two files' React, which Node served
    // before generation facades were in place (loader.mjs releaseGenerations). Any file in
    // between surviving is a per-file leak.
    const leaked = survivors().filter((file) => !["f01", "f02", "f23"].includes(file));
    expect(leaked).toEqual([]);
  },
);
