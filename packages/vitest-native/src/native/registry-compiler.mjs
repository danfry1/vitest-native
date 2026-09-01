// Short-lived entrypoint for a cold React Native registry build.
//
// The parent sends one JSON options object over stdin and receives one JSON result
// on stdout. No diagnostic logging is allowed here: stdout is a protocol, while a
// compiler failure is returned structurally for the parent to report once.
import fs from "node:fs";
import { buildRegistry } from "./registry.mjs";

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function respond(value) {
  fs.writeSync(3, JSON.stringify(value));
}

try {
  const options = JSON.parse(fs.readFileSync(0, "utf8"));
  const started = performance.now();
  const registryFile = buildRegistry({
    ...options,
    diagnostics: false,
    failOnError: true,
  });
  let count = null;
  if (registryFile) {
    try {
      count = JSON.parse(fs.readFileSync(`${registryFile}.json`, "utf8")).count ?? null;
    } catch {}
  }
  respond({
    ok: registryFile !== null,
    registryFile,
    count,
    durationMs: Math.round(performance.now() - started),
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
  if (registryFile === null) process.exitCode = 2;
} catch (error) {
  respond({ ok: false, error: messageOf(error) });
  process.exitCode = 1;
}
