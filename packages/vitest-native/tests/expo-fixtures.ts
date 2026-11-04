/**
 * pnpm-layout workspaces for the Expo SDK check (expo-sdk-support.test.ts and
 * expo-sdk-check-cost.test.ts). packages/lib is the project in each; `expo` resolves from
 * it in none, so the SDK is read from what the native engine's detection reaches.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The native engine's toolchain and the plugin's required peers, from this repository's
// install, so a fixture workspace resolves the engine as native.
const TOOLCHAIN = ["react-native", "@react-native/babel-preset", "@babel/core", "react", "vite"];
const STORE = "node_modules/.pnpm";

/** A store id, `name@version`, as its package directory relative to the workspace root. */
const inStore = (id: string) => {
  const name = id.slice(0, id.lastIndexOf("@"));
  return `${STORE}/${id}/node_modules/${name}`;
};

interface Layout {
  /** Workspace members by directory under packages/: their manifests. */
  members: Record<string, object>;
  /** Store packages by id (`name@version`): their manifests, version and name filled in. */
  store: Record<string, object>;
  /** `[from, store id]`: links the store package into `from`'s node_modules (from is a member directory or a store id). */
  links: [string, string][];
  /** `[member, member]`: links the second member into the first's node_modules. */
  memberLinks?: [string, string][];
}

const made: string[] = [];

/** Removes every workspace made so far. */
export function removeWorkspaces(): void {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

function build({ members, store, links, memberLinks = [] }: Layout): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-expo-ws-"));
  made.push(root);
  const write = (file: string, content: object) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(content));
  };
  const link = (from: string, name: string, target: string) => {
    const at = path.join(root, from, "node_modules", name);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at, "dir");
  };
  write("package.json", { name: "ws", private: true, workspaces: ["packages/*"] });
  for (const [dir, manifest] of Object.entries(members)) {
    write(`packages/${dir}/package.json`, manifest);
  }
  for (const [id, manifest] of Object.entries(store)) {
    const at = id.lastIndexOf("@");
    write(`${inStore(id)}/package.json`, {
      name: id.slice(0, at),
      version: id.slice(at + 1),
      ...manifest,
    });
  }
  for (const name of TOOLCHAIN) {
    link(".", name, fs.realpathSync(path.join(PACKAGE_ROOT, "node_modules", name)));
  }
  for (const [from, id] of links) {
    const fromDir = from in members ? `packages/${from}` : `${STORE}/${from}`;
    link(fromDir, id.slice(0, id.lastIndexOf("@")), path.join(root, inStore(id)));
  }
  for (const [from, member] of memberLinks) {
    const name = (members[member] as { name: string }).name;
    link(`packages/${from}`, name, path.join(root, "packages", member));
  }
  return path.join(root, "packages", "lib");
}

const rn = { peerDependencies: { "react-native": "*" } };
const expoAt = (version: string) => ({ [`expo@${version}`]: rn });
const lib = (dependencies: Record<string, string>) => ({ name: "lib", dependencies });

/**
 * The workspaces, by what packages/lib reaches:
 * - "ui-kit": a workspace UI library declaring expo-image, whose peer expo 54 is linked
 *   beside it; packages/app declares that expo.
 * - "expo-thing": an Expo module depending on expo-modules-core 3.0.29.
 * - "supported-core": the same, on expo-modules-core 58.0.27.
 * - "nested-old-core": expo-thing on expo-modules-core 58.0.27, and its dependency
 *   old-thing on expo-modules-core 3.0.29.
 * - "stale-kit": @org/ui's expo-image, whose peer is expo 58.0.20, and kit, an installed
 *   package that depends on expo ~54 itself.
 * - "old-ui": the reverse: kit depends on expo 58.0.20, expo-image's peer is expo 54.0.33.
 * - "nothing": no Expo package; packages/app still declares expo 54.
 * - "expo-app": an Expo app: lib declares expo 58 and expo-image, so `expo` resolves from
 *   it and the check reads nothing else.
 */
export type ExpoWorkspace =
  | "ui-kit"
  | "expo-thing"
  | "supported-core"
  | "nested-old-core"
  | "stale-kit"
  | "old-ui"
  | "nothing"
  | "expo-app";

export function expoWorkspace(kind: ExpoWorkspace): string {
  switch (kind) {
    case "expo-app":
      return build({
        members: { lib: lib({ expo: "*", "expo-image": "*" }) },
        store: {
          ...expoAt("58.0.20"),
          "expo-image@58.0.1": { peerDependencies: { expo: "*", "react-native": "*" } },
        },
        links: [
          ["lib", "expo@58.0.20"],
          ["lib", "expo-image@58.0.1"],
          ["expo-image@58.0.1", "expo@58.0.20"],
        ],
      });
    case "ui-kit":
    case "nothing":
      return build({
        members: {
          lib: lib(kind === "ui-kit" ? { "ui-kit": "*" } : {}),
          app: { name: "app", dependencies: { expo: "*" } },
          "ui-kit": { name: "ui-kit", dependencies: { "expo-image": "*" }, ...rn },
        },
        store: {
          ...expoAt("54.0.33"),
          "expo-image@3.0.11": { peerDependencies: { expo: "*", "react-native": "*" } },
        },
        links: [
          ["app", "expo@54.0.33"],
          ["ui-kit", "expo-image@3.0.11"],
          ["expo-image@3.0.11", "expo@54.0.33"],
        ],
        memberLinks: kind === "ui-kit" ? [["lib", "ui-kit"]] : [],
      });
    case "expo-thing":
    case "supported-core": {
      const core = kind === "expo-thing" ? "expo-modules-core@3.0.29" : "expo-modules-core@58.0.27";
      return build({
        members: { lib: lib({ "expo-thing": "*" }) },
        store: {
          "expo-thing@1.0.0": { dependencies: { "expo-modules-core": "*" }, ...rn },
          [core]: {},
        },
        links: [
          ["lib", "expo-thing@1.0.0"],
          ["expo-thing@1.0.0", core],
        ],
      });
    }
    case "nested-old-core":
      return build({
        members: { lib: lib({ "expo-thing": "*" }) },
        store: {
          "expo-thing@1.0.0": {
            dependencies: { "expo-modules-core": "*", "old-thing": "*" },
            ...rn,
          },
          "old-thing@1.0.0": { dependencies: { "expo-modules-core": "*" }, ...rn },
          "expo-modules-core@58.0.27": {},
          "expo-modules-core@3.0.29": {},
        },
        links: [
          ["lib", "expo-thing@1.0.0"],
          ["expo-thing@1.0.0", "expo-modules-core@58.0.27"],
          ["expo-thing@1.0.0", "old-thing@1.0.0"],
          ["old-thing@1.0.0", "expo-modules-core@3.0.29"],
        ],
      });
    case "stale-kit":
    case "old-ui": {
      const [kit, image] = kind === "stale-kit" ? ["54.0.33", "58.0.20"] : ["58.0.20", "54.0.33"];
      return build({
        members: {
          lib: lib({ "@org/ui": "*", kit: "*" }),
          ui: { name: "@org/ui", dependencies: { "expo-image": "*" }, ...rn },
        },
        store: {
          ...expoAt("58.0.20"),
          ...expoAt("54.0.33"),
          "expo-image@58.0.1": { peerDependencies: { expo: "*", "react-native": "*" } },
          "kit@1.0.0": { dependencies: { expo: "*" }, ...rn },
        },
        links: [
          ["ui", "expo-image@58.0.1"],
          ["expo-image@58.0.1", `expo@${image}`],
          ["kit@1.0.0", `expo@${kit}`],
          ["lib", "kit@1.0.0"],
        ],
        memberLinks: [["lib", "ui"]],
      });
    }
  }
}
