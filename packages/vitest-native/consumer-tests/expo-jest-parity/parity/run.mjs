// Runs parity/probes.test.tsx under jest-expo and under vitest-native, then requires the
// two records to agree. The gate's own guards, each closing a way it could pass while
// proving nothing:
//   - vitest-native must have run its native engine (the mock engine is not compared);
//   - both runners must record the same probes, at least EXPECTED_PROBES of them;
//   - at least MIN_VALUE_AGREEMENTS probes must agree on a value, not on an error;
//   - a listed difference passes only with exactly the values pinned for it, so a
//     listed probe that breaks some other way fails, and one that agrees fails too.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPECTED_PROBES = 45;
const MIN_VALUE_AGREEMENTS = 35;

/** Probe → why the two answer differently (on purpose, or by jest-expo's own mocks), and each answer. */
const ALLOWED_DIFFERENCES = {
  "devtools hook": {
    reason:
      "jest-expo installs a disabled __REACT_DEVTOOLS_GLOBAL_HOOK__ stub; the native engine leaves React's own detection alone.",
    jest: { value: "object" },
    vitest: { value: "undefined" },
  },
  "Font.loadAsync of a number": {
    reason:
      "Asset 1 is the bundled image the probes import: registered under the native engine, as Metro registers it, and absent under jest-expo.",
    jest: { error: 'Module "1" is missing from the asset registry' },
    vitest: { value: "[undefined]" },
  },
  "Asset.fromModule of a number": {
    reason:
      "Asset 1 is the bundled image the probes import: registered under the native engine, as Metro registers it, and absent under jest-expo.",
    jest: { error: 'Module "1" is missing from the asset registry' },
    vitest: { value: "icon" },
  },
  "Asset.fromModule of a bundled image": {
    reason:
      "Under jest-expo an image import is an object, not a registered asset id, so expo-asset cannot load a bundled asset; the native engine registers it as Metro does.",
    jest: { error: 'Module "[object Object]" is missing from the asset registry' },
    vitest: { value: "png" },
  },
  "FileSystem legacy getInfoAsync": {
    reason:
      "jest-expo replaces expo-file-system/legacy with a hand-written mock; the native engine runs the package on its own native-module mock, which leaves getInfoAsync's result undefined.",
    jest: { value: { exists: true, md5: "md5", uri: "uri" } },
    vitest: { value: "[undefined]" },
  },
  "FileSystem legacy documentDirectory": {
    reason:
      "jest-expo replaces expo-file-system/legacy with a hand-written mock; the package itself normalizes the native module's missing documentDirectory to null.",
    jest: { value: "[undefined]" },
    vitest: { value: null },
  },
  "optional module nothing installed defines": {
    reason:
      "jest-expo answers every module in its table, expo-observe's ExpoObserve included; the native engine reads a module only probed for and defined by nothing installed as absent, as on a device.",
    jest: {
      value: {
        addListener: "[function]",
        clientId: "mock",
        configure: "[function]",
        dispatchEvents: "[function]",
        getIntegrations: "[function]",
        removeListeners: "[function]",
        setBundleDefaults: "[function]",
      },
    },
    vitest: { value: null },
  },
  "Text host": {
    reason:
      "The native engine renders React Native's real host components (RCTText); jest's React Native preset mocks Text as a host named Text.",
    jest: { value: "Text" },
    vitest: { value: "RCTText" },
  },
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-native-parity-"));
const run = (label, command, args) => {
  const out = path.join(dir, `${label}.json`);
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", env: { ...process.env, PARITY_OUT: out } });
  return JSON.parse(fs.readFileSync(out, "utf8"));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  const jest = run("jest", "npx", ["--no-install", "jest", "-c", "jest.config.json"]);
  const vitest = run("vitest", "npx", ["--no-install", "vitest", "run"]);
  const failures = [];
  if (jest.engine !== "jest") failures.push(`jest recorded engine ${JSON.stringify(jest.engine)}`);
  if (vitest.engine !== "native") {
    failures.push(
      `vitest-native ran engine ${JSON.stringify(vitest.engine)}, not the native engine`,
    );
  }
  const jestProbes = Object.keys(jest.results).sort();
  const vitestProbes = Object.keys(vitest.results).sort();
  if (!same(jestProbes, vitestProbes)) {
    failures.push(
      `the runners recorded different probes: ${JSON.stringify(jestProbes)} vs ${JSON.stringify(vitestProbes)}`,
    );
  }
  if (jestProbes.length < EXPECTED_PROBES) {
    failures.push(
      `${jestProbes.length} probes recorded, fewer than the ${EXPECTED_PROBES} expected`,
    );
  }
  let valueAgreements = 0;
  for (const probe of new Set([...jestProbes, ...vitestProbes])) {
    const a = jest.results[probe];
    const b = vitest.results[probe];
    const allowed = ALLOWED_DIFFERENCES[probe];
    if (allowed) {
      if (same(a, b)) {
        failures.push(
          `${probe}: listed as a difference but now agrees — remove it from ALLOWED_DIFFERENCES`,
        );
      } else if (!same(a, allowed.jest) || !same(b, allowed.vitest)) {
        failures.push(
          `${probe}: listed as a difference, but not this one\n    jest-expo:     ${JSON.stringify(a)} (pinned ${JSON.stringify(allowed.jest)})\n    vitest-native: ${JSON.stringify(b)} (pinned ${JSON.stringify(allowed.vitest)})`,
        );
      }
    } else if (!same(a, b)) {
      failures.push(
        `${probe}\n    jest-expo:     ${JSON.stringify(a)}\n    vitest-native: ${JSON.stringify(b)}`,
      );
    } else if (a && "value" in a) {
      valueAgreements++;
    }
  }
  for (const probe of Object.keys(ALLOWED_DIFFERENCES)) {
    if (!jestProbes.includes(probe))
      failures.push(`${probe}: listed in ALLOWED_DIFFERENCES but no longer probed`);
  }
  if (valueAgreements < MIN_VALUE_AGREEMENTS) {
    failures.push(
      `${valueAgreements} probes agree on a value, fewer than the ${MIN_VALUE_AGREEMENTS} required`,
    );
  }
  console.log(
    `\njest-expo parity: ${valueAgreements} of ${jestProbes.length} probes agree on a value; ${Object.keys(ALLOWED_DIFFERENCES).length} listed differences.`,
  );
  if (failures.length > 0) {
    console.error(`\n${failures.length} parity failure(s):\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
