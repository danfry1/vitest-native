// The `ownershipModel` axis: judge any build with `experimental.ownershipModel` off (the
// option unset, as every run has it today) and with 'resolver' (ADR-0004/0005, Track A).
// Both harnesses use it: this matrix (run.mjs --ownership) and the bug museum
// (../bug-museum/run.mjs --ownership).
//
// A build without the flag (main before #370) must not fail the axis, and must not pass
// it either: the flag would be ignored, so a run "with the flag" would measure the flag
// off twice. ownershipSupport() asks the build itself, by constructing the plugin twice:
//
//   - with the requested value, which a build that reads the flag accepts silently;
//   - with a value no build accepts, which such a build must reject naming the option.
//
// Only a build that does both reads the flag. A build that warns about an unknown option
// (main today), or accepts any value (one that drops the flag), is reported as
// UNSUPPORTED and the run records that instead of verdicts.
import { spawnSync } from "node:child_process";

export const OWNERSHIP_MODELS = ["off", "resolver"];
export const UNSUPPORTED = "flag not supported by this build";

/** The --ownership value, validated. Absent: "off". */
export function ownershipModelArgument(value) {
  if (value === undefined) return "off";
  if (!OWNERSHIP_MODELS.includes(value))
    throw new Error(`--ownership must be one of ${OWNERSHIP_MODELS.join(", ")}, not "${value}"`);
  return value;
}

/** The plugin options a model adds: nothing for "off". */
export function ownershipOptions(model) {
  return model === "off" ? {} : { experimental: { ownershipModel: model } };
}

const PROBE = `
const { reactNative } = await import("vitest-native");
const warnings = [];
console.warn = (...args) => warnings.push(args.map(String).join(" "));
const attempt = (value) => {
  try {
    reactNative({ experimental: { ownershipModel: value } });
    return null;
  } catch (error) {
    return String(error?.message ?? error);
  }
};
const accepted = attempt(process.argv[1]);
const rejected = attempt("museum-not-an-ownership-model");
console.log(JSON.stringify({ accepted, rejected, warnings }));
`;

/**
 * Whether the vitest-native that `fromDir` resolves (an install, or the package directory
 * itself by self-reference) reads `experimental.ownershipModel: model`.
 * Returns { supported: true } or { supported: false, reason }.
 */
export function ownershipSupport(fromDir, model) {
  if (model === "off") return { supported: true };
  const proc = spawnSync(process.execPath, ["--input-type=module", "-e", PROBE, model], {
    cwd: fromDir,
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = (proc.stdout ?? "").trim().split("\n").at(-1) ?? "";
  let result;
  try {
    result = JSON.parse(line);
  } catch {
    return {
      supported: false,
      reason: `${UNSUPPORTED}: the probe could not construct the plugin: ${(proc.stderr ?? "").trim().slice(-500)}`,
    };
  }
  return judgeSupport(result);
}

/** The probe's observations → { supported, reason }. Exported for the unit tests. */
export function judgeSupport({ accepted, rejected, warnings }) {
  const unknown = warnings.find((line) => /\bexperimental\b/.test(line));
  if (accepted !== null)
    return { supported: false, reason: `${UNSUPPORTED}: it rejects the option: ${accepted}` };
  if (unknown) return { supported: false, reason: `${UNSUPPORTED}: ${unknown}` };
  if (rejected === null || !rejected.includes("ownershipModel"))
    return {
      supported: false,
      reason: `${UNSUPPORTED}: it accepts any experimental.ownershipModel value, so it does not read it`,
    };
  return { supported: true };
}
