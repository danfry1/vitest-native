// The plugin's half of the require bridge (src/plugin.ts startRequireBridge): under
// experimental.ownershipModel 'resolution' configureVitest starts the server before any
// worker, names it to the workers through Vitest's provide, and closes it with Vitest;
// under 'resolver' nothing starts. What the server serves is decided here, from the
// project's Vite config and ownership policy.
import fs from "node:fs";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { resolveConfig } from "vite";
import { describe, expect, it, onTestFinished } from "vitest";
import { reactNative } from "../src/index.js";
import { BRIDGE_PROVIDE_KEY } from "../src/native/bridge-server.mjs";
import { runPluginConfig } from "./plugin-config.js";

async function configure(ownershipModel: "resolver" | "resolution") {
  const root = process.cwd();
  const plugin = reactNative({ engine: "native", experimental: { ownershipModel } }) as any;
  const config = await runPluginConfig(plugin, { root });
  const viteConfig = await resolveConfig({ root, configFile: false }, "serve");
  const provided = new Map<string, any>();
  const closers: (() => unknown)[] = [];
  const fetched: string[] = [];
  const project = {
    config: { root, setupFiles: config.test.setupFiles, env: { ...config.test.env } },
    provide: (key: string, value: unknown) => provided.set(key, value),
    vite: { environments: { ssr: {} }, config: viteConfig },
    _transformService: {
      fetch: async (url: string) => {
        fetched.push(url);
        const file = path.join(root, "src/index.ts");
        return { code: "export {}", file, id: file, url };
      },
    },
  };
  await plugin.configureVitest({
    vitest: { config: { cliOptions: {} }, onClose: (fn: () => unknown) => closers.push(fn) },
    project,
  });
  return { provided, closers, fetched, root };
}

function ask(endpoint: string, line: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      resolve(JSON.parse(String(chunk).split("\n")[0]));
      socket.destroy();
    });
    socket.write(`${JSON.stringify(line)}\n`);
  });
}

describe("the require bridge, from the plugin", () => {
  it("starts nothing under 'resolver'", async () => {
    const { provided, closers } = await configure("resolver");
    expect(provided.has(BRIDGE_PROVIDE_KEY)).toBe(false);
    expect(closers).toHaveLength(0);
  });

  it("under 'resolution', is provided to the workers, serves project files, and closes with Vitest", async () => {
    const { provided, closers, fetched, root } = await configure("resolution");
    const bridge = provided.get(BRIDGE_PROVIDE_KEY);
    expect(bridge).toEqual({
      endpoint: expect.any(String),
      token: expect.stringMatching(/^[0-9a-f]{48}$/),
      roots: expect.arrayContaining([expect.any(String)]),
    });
    const base = { token: bridge.token, environment: "ssr" };
    // Outside the directories Vite serves: refused, and never fetched.
    expect(await ask(bridge.endpoint, { ...base, seq: 1, url: "/@fs/etc/hosts?raw" })).toEqual({
      seq: 1,
      error: expect.objectContaining({ code: "BRIDGE_FILE_REFUSED" }),
    });
    // Vite's own deny list (server.fs.deny): a `.env` inside the project is refused too.
    // Written for the test (git ignores `.env` files, so it cannot be a fixture).
    const envDir = fs.mkdtempSync(path.join(root, "tests", ".bridge-env-"));
    const env = path.join(envDir, ".env");
    fs.writeFileSync(env, "DUMMY=only-a-test\n");
    onTestFinished(() => fs.rmSync(envDir, { recursive: true, force: true }));
    expect(
      await ask(bridge.endpoint, { ...base, seq: 2, url: `/@fs${env.replace(/\\/g, "/")}?raw` }),
    ).toEqual({ seq: 2, error: expect.objectContaining({ code: "BRIDGE_FILE_REFUSED" }) });
    expect(fetched).toEqual([]);
    // A project file: Vitest's fetch, through the project.
    expect(await ask(bridge.endpoint, { ...base, seq: 3, url: "/src/index.ts" })).toMatchObject({
      seq: 3,
      ok: { code: "export {}" },
    });
    expect(fetched).toEqual(["/src/index.ts"]);
    // An installed package's file inside the project: Vitest's fetch answers it (it
    // externalizes it, for a module the bridge evaluates that imports it).
    const installed = path.join(root, "node_modules/vite/package.json").replace(/\\/g, "/");
    expect(await ask(bridge.endpoint, { ...base, seq: 4, url: `/@fs${installed}` })).toMatchObject({
      seq: 4,
      ok: expect.any(Object),
    });
    expect(fetched).toContain(`/@fs${installed}`);
    expect(closers).toHaveLength(1);
    await closers[0]();
    expect(fs.existsSync(bridge.endpoint)).toBe(false);
    await expect(once(net.createConnection(bridge.endpoint), "connect")).rejects.toThrow();
  });
});
