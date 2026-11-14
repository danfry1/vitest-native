// The `nodeMocks` axis: judge a build with `experimental.nodeMocks` unset (every run today),
// on (`true`) or off (`false`, spelled out). The bug museum uses it (../bug-museum/run.mjs
// --node-mocks), alone or with --ownership, so each candidate default of the 0.16 ownership
// comparison can be run: 'resolver' with nodeMocks on is not reachable through --ownership.
//
// As with ownershipModel (./ownership.mjs), a build that does not read the flag must not
// pass the axis: it would measure the flag unset twice. nodeMocksSupport() asks the build
// itself, by constructing the plugin:
//
//   - with the requested value alone, which a build that reads the flag accepts;
//   - with a value that is not a boolean, which such a build must reject naming the option;
//   - with the whole requested `experimental` object, when --ownership is given too.
//
// A build that warns about an unknown `experimental`, throws "Unknown experimental option
// nodeMocks", or accepts any value is UNSUPPORTED: every exhibit is recorded N/A. A build
// that reads both flags but rejects the combination (today: 'resolution' with nodeMocks
// false, since 'resolution' turns it on) is NOT_RUNNABLE, recorded N/A with the build's own
// message. Anything else that throws is a broken build, and the run fails.
import { spawnSync } from "node:child_process";
import { UNSUPPORTED } from "./ownership.mjs";

export const NODE_MOCKS = ["on", "off"];
export const NOT_RUNNABLE = "combination not runnable with this build";

/** The --node-mocks value, validated. Absent: null (the option left unset). */
export function nodeMocksArgument(value) {
  if (value === undefined) return null;
  if (!NODE_MOCKS.includes(value))
    throw new Error(`--node-mocks must be one of ${NODE_MOCKS.join(", ")}, not "${value}"`);
  return value;
}

/**
 * The `experimental` entries the axes add, as ONE object: --ownership and --node-mocks
 * together give `{ ownershipModel, nodeMocks }`, never two objects where one replaces the
 * other. `{}` when neither is set.
 */
export function experimentalEntries({ ownershipModel = "off", nodeMocks = null } = {}) {
  return {
    ...(ownershipModel === "off" ? {} : { ownershipModel }),
    ...(nodeMocks === null ? {} : { nodeMocks: nodeMocks === "on" }),
  };
}

const PROBE = `
const { reactNative } = await import("vitest-native");
const warnings = [];
console.warn = (...args) => warnings.push(args.map(String).join(" "));
const attempt = (experimental) => {
  try {
    reactNative({ experimental });
    return null;
  } catch (error) {
    return String(error?.message ?? error);
  }
};
const requested = JSON.parse(process.argv[1]);
const accepted = attempt({ nodeMocks: requested.nodeMocks });
const rejected = attempt({ nodeMocks: "museum-not-a-boolean" });
const combined = Object.keys(requested).length > 1 ? attempt(requested) : null;
console.log(JSON.stringify({ accepted, rejected, combined, warnings }));
`;

/**
 * Whether the vitest-native that `fromDir` resolves reads `experimental.nodeMocks` with the
 * requested value, and runs it with the requested ownershipModel.
 * Returns { supported: true } or { supported: false, reason }.
 */
export function nodeMocksSupport(fromDir, nodeMocks, ownershipModel = "off") {
  if (nodeMocks === null) return { supported: true };
  const requested = experimentalEntries({ ownershipModel, nodeMocks });
  const proc = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", PROBE, JSON.stringify(requested)],
    { cwd: fromDir, encoding: "utf8", timeout: 60_000 },
  );
  const line = (proc.stdout ?? "").trim().split("\n").at(-1) ?? "";
  let result;
  try {
    result = JSON.parse(line);
  } catch {
    throw new Error(
      `experimental.nodeMocks: the probe could not load the build: ${(proc.stderr ?? "").trim().slice(-500)}`,
    );
  }
  return judgeNodeMocksSupport(result);
}

/** The probe's observations → { supported, reason }. Exported for the unit tests. */
export function judgeNodeMocksSupport({ accepted, rejected, combined = null, warnings }) {
  const unknown = warnings.find((line) => /\bexperimental\b/.test(line));
  if (unknown) return { supported: false, reason: `${UNSUPPORTED}: ${unknown}` };
  if (accepted !== null) {
    // A build with `experimental` but without this entry rejects it as unknown, by name.
    if (/unknown/i.test(accepted) && accepted.includes("nodeMocks"))
      return { supported: false, reason: `${UNSUPPORTED}: ${accepted}` };
    throw new Error(
      `experimental.nodeMocks: the build throws for the requested value: ${accepted}`,
    );
  }
  if (rejected === null || !rejected.includes("nodeMocks"))
    return {
      supported: false,
      reason: `${UNSUPPORTED}: it accepts any experimental.nodeMocks value, so it does not read it`,
    };
  if (combined !== null) {
    if (combined.includes("nodeMocks") && combined.includes("ownershipModel"))
      return { supported: false, reason: `${NOT_RUNNABLE}: ${combined}` };
    throw new Error(
      `experimental.nodeMocks: the build throws for the requested combination: ${combined}`,
    );
  }
  return { supported: true };
}
