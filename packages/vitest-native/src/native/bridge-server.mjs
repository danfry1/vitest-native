// The main-process half of the require bridge (experimental.ownershipModel: 'resolution';
// docs/ownership-model.md). A worker whose Node `require` reaches a file Vite owns, before
// Vite evaluated it, asks here for Vite's transform of that file, synchronously, through a
// helper thread (bridge-client.mjs), and evaluates it in Vite's own module map.
//
// The listener is private to the run:
//   - a Unix socket in a fresh directory only this user can enter (mkdtemp: 0700), or on
//     Windows a named pipe with a random name; never a TCP port;
//   - every request carries a random token the workers receive through Vitest's
//     `provide`; a line without it, or not well-formed, is ignored (no reply);
//   - it answers only for files inside the directories Vite serves and allowed by Vite's
//     own file rules (server.fs.allow and server.fs.deny), checked before anything is read
//     when the request names a file, and again on the answer. What it answers is Vitest's
//     own fetch: code for a module Vite evaluates, `externalize` for one Node loads. Which
//     of Node's requires are bridged at all is the worker's decision (the ownership policy).
// Replies echo the request's `seq`, so a client matches each reply to its request.
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

/** What a worker reads through `inject` (Vitest's provided context) to reach this server. */
export const BRIDGE_PROVIDE_KEY = "vitestNativeRequireBridge";

/** The longest line a request may be; longer input is not ours and is dropped. */
const MAX_LINE = 64 * 1024;

/**
 * Start the bridge for one Vitest project.
 *
 * @param {object} options
 * @param {(url: string, importer: string | undefined, environment: string) => Promise<object>} options.fetch
 *   Vitest's own fetch of a module for a worker (externalization rules included)
 * @param {(file: string) => boolean} options.mayServe  whether the server may answer for
 *   `file`: inside the directories Vite serves and allowed by Vite's own file rules
 *   (server.fs.deny included). Which requires the bridge takes over is the worker's call.
 * @param {string} options.root  Vite's root, for a request spelled as a root-relative URL
 * @returns {Promise<{ endpoint: string, token: string, close(): Promise<void> }>}
 */
export async function startBridgeServer({ fetch, mayServe, root = process.cwd() }) {
  const token = crypto.randomBytes(24).toString("hex");
  let dir = null;
  let endpoint;
  if (process.platform === "win32") {
    endpoint = `\\\\.\\pipe\\vitest-native-bridge-${crypto.randomUUID()}`;
  } else {
    // A Unix socket path is limited (104 bytes on macOS, 108 on Linux): a long TMPDIR
    // falls back to /tmp, which every Unix has.
    const base = os.tmpdir().length > 60 ? "/tmp" : os.tmpdir();
    try {
      dir = fs.mkdtempSync(path.join(base, "vn-bridge-"));
    } catch (error) {
      throw unavailable(base, error);
    }
    endpoint = path.join(dir, "b.sock");
  }
  // A process that ends without close() (a crash, a signal) still removes its directory.
  const removeDir = () => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", removeDir);
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setEncoding("utf8");
    let buffered = "";
    socket.on("data", (chunk) => {
      buffered += chunk;
      if (buffered.length > MAX_LINE && !buffered.includes("\n")) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        const request = parseRequest(line, token);
        if (request === null) continue;
        answer(request).then((reply) => {
          if (!socket.destroyed) socket.write(`${reply}\n`);
        });
      }
    });
  });

  async function answer({ seq, url, importer, environment }) {
    // A request naming a file is checked before anything reads or transforms it.
    const named = fileOfUrl(url, root);
    if (named !== null && !mayServe(named)) return refused(seq, url);
    try {
      const result = await fetch(url, importer, environment);
      // Code is served only for a file Vite owns, whether it comes inline or through
      // Vitest's module cache (`cached` + `tmp`). An externalized module carries no code:
      // the worker loads it through Node, as Vitest would.
      // A virtual module (a plugin's `\0…` id, React Native's facade) has no file: it is
      // generated, not read, and is answered as Vitest answers it.
      const fromFile = typeof result.file === "string" && path.isAbsolute(result.file);
      if (!("externalize" in result) && fromFile && !mayServe(result.file)) {
        return refused(seq, url);
      }
      return JSON.stringify({ seq, ok: result });
    } catch (error) {
      return JSON.stringify({
        seq,
        error: { code: "VITE_FETCH_FAILED", message: String(error?.message ?? error) },
      });
    }
  }

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    removeDir();
    process.off("exit", removeDir);
    throw unavailable(endpoint, error);
  }
  server.unref();

  return {
    endpoint,
    token,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
      removeDir();
      process.off("exit", removeDir);
    },
  };
}

function unavailable(where, error) {
  return new VitestNativeError(
    "BRIDGE_UNAVAILABLE",
    `experimental.ownershipModel 'resolution': the require bridge could not listen at ` +
      `${where} (${error?.code ?? error?.message ?? error}).`,
  );
}

function refused(seq, url) {
  return JSON.stringify({
    seq,
    error: {
      code: "BRIDGE_FILE_REFUSED",
      message: `${url} is outside the files Vite serves for this project`,
    },
  });
}

/**
 * The file a request URL names, or null for one that does not (a bare specifier, which
 * Vitest resolves; its answer is checked after). `/@fs/` and absolute paths name a file;
 * a root-relative URL names one under Vite's root. A query (`?raw`) does not change which.
 */
export function fileOfUrl(url, root) {
  const bare = url.replace(/[?#].*$/, "");
  // Vite's ids for modules that are not files: a virtual module (`/@id/__x00__…`) or a
  // bare id Vite could not resolve to one (`/@id/…`), and its client (`/@vite/…`).
  if (bare.startsWith("/@id/") || bare.startsWith("/@vite/")) return null;
  if (bare.startsWith("/@fs/")) {
    const rest = bare.slice(4);
    return /^\/[A-Za-z]:\//.test(rest) ? path.resolve(rest.slice(1)) : path.resolve(rest);
  }
  if (path.isAbsolute(bare) && !bare.startsWith("/")) return path.resolve(bare);
  if (bare.startsWith("/")) {
    // An absolute POSIX path, or a root-relative URL: a path that exists as given is a file.
    return fs.existsSync(bare) ? path.resolve(bare) : path.join(root, bare);
  }
  return null;
}

/** A request line, or null when it is not one of ours (wrong token, malformed). */
export function parseRequest(line, token) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    message === null ||
    typeof message !== "object" ||
    !safeEqual(message.token, token) ||
    !Number.isSafeInteger(message.seq) ||
    typeof message.url !== "string" ||
    message.url.length === 0 ||
    (message.importer !== undefined && typeof message.importer !== "string") ||
    typeof message.environment !== "string"
  ) {
    return null;
  }
  return {
    seq: message.seq,
    url: message.url,
    importer: message.importer,
    environment: message.environment,
  };
}

function safeEqual(given, token) {
  if (typeof given !== "string") return false;
  // Compared as bytes: a string of the token's length in characters can be longer in bytes.
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
