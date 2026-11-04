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
//   - it serves only files the ownership policy gives to Vite: never a file Node owns, and
//     never anything outside the project.
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
 * @param {(file: string) => boolean} options.isViteOwned  the ownership policy's answer
 * @returns {Promise<{ endpoint: string, token: string, close(): Promise<void> }>}
 */
export async function startBridgeServer({ fetch, isViteOwned }) {
  const token = crypto.randomBytes(24).toString("hex");
  let dir = null;
  let endpoint;
  if (process.platform === "win32") {
    endpoint = `\\\\.\\pipe\\vitest-native-bridge-${crypto.randomUUID()}`;
  } else {
    // A Unix socket path is limited (104 bytes on macOS, 108 on Linux): a long TMPDIR
    // falls back to /tmp, which every Unix has.
    const base = os.tmpdir().length > 60 ? "/tmp" : os.tmpdir();
    dir = fs.mkdtempSync(path.join(base, "vn-bridge-"));
    endpoint = path.join(dir, "b.sock");
  }
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
        if (request !== null) answer(request).then((reply) => socket.write(`${reply}\n`));
      }
    });
  });

  async function answer({ seq, url, importer, environment }) {
    try {
      const result = await fetch(url, importer, environment);
      // Code is served only for a file Vite owns, whether it comes inline or through
      // Vitest's module cache (`cached` + `tmp`). An externalized module carries no code:
      // the worker loads it through Node, as Vitest would.
      if (
        !("externalize" in result) &&
        !(typeof result.file === "string" && isViteOwned(result.file))
      ) {
        return JSON.stringify({
          seq,
          error: { code: "BRIDGE_NOT_VITE_OWNED", message: `${url} is not a file Vite owns` },
        });
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
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    throw new VitestNativeError(
      "BRIDGE_UNAVAILABLE",
      `experimental.ownershipModel 'resolution': the require bridge could not listen on ` +
        `${endpoint} (${error?.code ?? error?.message ?? error}).`,
    );
  }
  server.unref();

  return {
    endpoint,
    token,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
      if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
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
  if (typeof given !== "string" || given.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
}
