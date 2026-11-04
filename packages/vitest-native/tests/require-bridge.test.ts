// The require bridge's transport (experimental.ownershipModel: 'resolution'): a server in
// another process, as the main process is, and the synchronous client a worker uses
// (src/native/bridge-server.mjs, bridge-client.mjs, bridge-thread.mjs).
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  _bridgeThread,
  _setBridgeOptions,
  bridgeStats,
  fetchSync,
} from "../src/native/bridge-client.mjs";
import { fileOfUrl, parseRequest, startBridgeServer } from "../src/native/bridge-server.mjs";

const serverUrl = pathToFileURL(
  path.resolve(import.meta.dirname, "../src/native/bridge-server.mjs"),
);

// The stand-in main process: Vite owns /proj/src; "slow" answers after 3 s; "boom" fails.
const SERVER = `
  const { startBridgeServer } = await import(${JSON.stringify(serverUrl.href)});
  const server = await startBridgeServer({
    fetch: async (url, importer, environment) => {
      // A file outside the project must be refused before it is fetched (read, transformed).
      if (url.includes("etc/hosts")) throw new Error("fetched a file outside the project");
      if (url.includes("slow")) await new Promise((r) => setTimeout(r, 3000));
      if (url.includes("boom")) throw new Error("transform failed: boom");
      if (url.includes("external")) return { externalize: "file:///proj/node_modules/x/index.js", type: "module" };
      // What Vitest answers from its module cache: the code in a file, none inline.
      if (url.includes("cached-outside")) return { cached: true, tmp: "/tmp/x", file: "/etc/hosts", id: "/etc/hosts", url };
      return { code: "export const v = 1", file: "/proj/src/" + url, id: "/proj/src/" + url, url: "/src/" + url, importer, environment };
    },
    isViteOwned: (file) => file.startsWith("/proj/src/") && !file.includes("node-owned"),
    root: "/proj",
  });
  // As Vitest closes on a signal: the server's exit handler removes its directory.
  process.on("SIGTERM", () => process.exit(0));
  console.log(JSON.stringify({ endpoint: server.endpoint, token: server.token }));
  setInterval(() => {}, 1000);
`;

let child: ChildProcess;
let endpoint: string;
let token: string;

beforeAll(async () => {
  child = spawn(process.execPath, ["--input-type=module", "--eval", SERVER], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const line = await new Promise<string>((resolve) => {
    let out = "";
    child.stdout!.on("data", (chunk) => {
      out += chunk;
      if (out.includes("\n")) resolve(out.split("\n")[0]);
    });
  });
  ({ endpoint, token } = JSON.parse(line));
  _setBridgeOptions({ endpoint, token, deadlineMs: 1000 });
});
afterAll(async () => {
  _setBridgeOptions();
  child.kill("SIGTERM");
  await once(child, "exit");
});

describe("the require bridge", () => {
  it("returns Vitest's fetch result for a file Vite owns, synchronously", () => {
    const before = bridgeStats.fetches;
    expect(fetchSync("a.ts", "/proj/src/test.ts", "ssr")).toMatchObject({
      code: "export const v = 1",
      file: "/proj/src/a.ts",
      importer: "/proj/src/test.ts",
      environment: "ssr",
    });
    expect(bridgeStats.fetches).toBe(before + 1);
  });

  it("passes an externalized module through, without code", () => {
    expect(fetchSync("external", undefined, "ssr")).toEqual({
      externalize: "file:///proj/node_modules/x/index.js",
      type: "module",
    });
  });

  it("refuses code for a file Vite does not own", () => {
    expect(() => fetchSync("node-owned.ts", undefined, "ssr")).toThrow(
      expect.objectContaining({ code: "BRIDGE_NOT_VITE_OWNED" }),
    );
  });

  it("refuses a file outside the project before fetching it", () => {
    expect(() => fetchSync("/@fs/etc/hosts?raw", undefined, "ssr")).toThrow(
      expect.objectContaining({ code: "BRIDGE_NOT_VITE_OWNED" }),
    );
  });

  it("refuses a file Vite does not own when Vitest answers it from its module cache", () => {
    expect(() => fetchSync("cached-outside", undefined, "ssr")).toThrow(
      expect.objectContaining({ code: "BRIDGE_NOT_VITE_OWNED" }),
    );
  });

  it("names a failed transform", () => {
    expect(() => fetchSync("boom.ts", undefined, "ssr")).toThrow(
      expect.objectContaining({
        code: "VITE_FETCH_FAILED",
        message: expect.stringMatching(/boom/),
      }),
    );
  });

  it("stops its thread when the main process does not answer in time, and recovers", async () => {
    fetchSync("warm.ts", undefined, "ssr");
    const stopped = _bridgeThread()!;
    const exited = once(stopped, "exit");
    const starts = bridgeStats.threadStarts;
    expect(() => fetchSync("slow.ts", undefined, "ssr")).toThrow(
      expect.objectContaining({ code: "VITE_FETCH_TIMEOUT" }),
    );
    // The late answer to "slow" cannot be taken for this one: a new thread, a new seq.
    expect(fetchSync("after.ts", undefined, "ssr")).toMatchObject({ file: "/proj/src/after.ts" });
    expect(bridgeStats.threadStarts).toBe(starts + 1);
    // The timed-out thread is gone, not left holding a connection.
    await exited;
  });

  it("ignores a request without the token, or malformed, and answers the next good one", async () => {
    const socket = net.createConnection(endpoint);
    socket.setEncoding("utf8");
    const replies: string[] = [];
    socket.on("data", (chunk) => replies.push(...String(chunk).split("\n").filter(Boolean)));
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write("not json\n");
    socket.write(
      `${JSON.stringify({ token: "wrong", seq: 1, url: "a.ts", environment: "ssr" })}\n`,
    );
    socket.write(`${JSON.stringify({ token, seq: "2", url: "a.ts", environment: "ssr" })}\n`);
    socket.write(
      `${JSON.stringify({ token: "é".repeat(token.length), seq: 3, url: "a.ts", environment: "ssr" })}\n`,
    );
    socket.write(`${JSON.stringify({ token, seq: 3, url: "a.ts", environment: "ssr" })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    socket.destroy();
    expect(replies.map((r) => JSON.parse(r).seq)).toEqual([3]);
  });
});

describe("a line longer than any request", () => {
  it("ends the connection", async () => {
    const socket = net.createConnection(endpoint);
    await once(socket, "connect");
    socket.write("x".repeat(70 * 1024));
    await once(socket, "close");
  });
});

describe("a reply to an earlier request", () => {
  // A stand-in that first answers with the previous request's seq, then with the right one.
  const STALE = `
    const net = await import("node:net");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-stale-"));
    const endpoint = path.join(dir, "s.sock");
    net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        for (const line of chunk.split("\\n").filter(Boolean)) {
          const { seq } = JSON.parse(line);
          socket.write(JSON.stringify({ seq: seq - 1, ok: { file: "stale" } }) + "\\n");
          setTimeout(() => socket.write(JSON.stringify({ seq, ok: { file: "current" } }) + "\\n"), 100);
        }
      });
    }).listen(endpoint, () => console.log(endpoint));
    process.on("SIGTERM", () => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); });
  `;
  it("is never taken for the request waiting now", async () => {
    const stale = spawn(process.execPath, ["--input-type=module", "--eval", STALE], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const at = await new Promise<string>((resolve) => {
      stale.stdout!.on("data", (chunk) => resolve(String(chunk).trim()));
    });
    try {
      _setBridgeOptions({ endpoint: at, token, deadlineMs: 2000 });
      expect(fetchSync("one", undefined, "ssr")).toEqual({ file: "current" });
    } finally {
      _setBridgeOptions({ endpoint, token, deadlineMs: 1000 });
      stale.kill("SIGTERM");
      await once(stale, "exit");
    }
  });
});

describe("the bridge server's directory", () => {
  it.skipIf(process.platform === "win32")("is removed when its process exits", async () => {
    const dir = path.dirname(endpoint);
    expect(fs.existsSync(dir)).toBe(true);
    const probe = spawn(process.execPath, ["--input-type=module", "--eval", SERVER], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const own = await new Promise<string>((resolve) => {
      probe.stdout!.on("data", (chunk) =>
        resolve(JSON.parse(String(chunk).split("\n")[0]).endpoint),
      );
    });
    expect(fs.existsSync(path.dirname(own))).toBe(true);
    probe.kill("SIGTERM");
    await once(probe, "exit");
    expect(fs.existsSync(path.dirname(own))).toBe(false);
  });
});

describe("fileOfUrl", () => {
  it("names the file a request URL points at, or null for a bare specifier", () => {
    expect(fileOfUrl("/@fs/etc/hosts?raw", "/proj")).toBe(path.resolve("/etc/hosts"));
    expect(fileOfUrl("/src/a.ts", "/proj")).toBe(path.join("/proj", "/src/a.ts"));
    expect(fileOfUrl("react", "/proj")).toBe(null);
  });
});

describe("parseRequest", () => {
  const secret = "t".repeat(48);
  it("accepts only a well-formed request with the token", () => {
    const good = { token: secret, seq: 1, url: "/src/a.ts", environment: "ssr" };
    expect(parseRequest(JSON.stringify(good), secret)).toEqual({
      seq: 1,
      url: "/src/a.ts",
      importer: undefined,
      environment: "ssr",
    });
    for (const bad of [
      { ...good, token: "x" },
      { ...good, seq: 1.5 },
      { ...good, url: "" },
      { ...good, importer: 4 },
      { ...good, environment: undefined },
    ])
      expect(parseRequest(JSON.stringify(bad), secret)).toBe(null);
    expect(parseRequest("{", secret)).toBe(null);
    // As long as the token in characters, longer in bytes: ignored, never thrown.
    expect(parseRequest(JSON.stringify({ ...good, token: "é".repeat(48) }), secret)).toBe(null);
    expect(parseRequest("null", secret)).toBe(null);
  });
});

describe("the bridge server's socket", () => {
  it.skipIf(process.platform === "win32")(
    "listens with a TMPDIR too long for a socket path",
    async () => {
      const before = process.env.TMPDIR;
      process.env.TMPDIR = `/tmp/${"x".repeat(120)}`;
      try {
        const server = await startBridgeServer({
          fetch: async () => ({}),
          isViteOwned: () => true,
        });
        expect(server.endpoint.length).toBeLessThan(104);
        await server.close();
      } finally {
        if (before === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = before;
      }
    },
  );
});
