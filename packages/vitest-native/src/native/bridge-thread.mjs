// The require bridge's helper thread (bridge-client.mjs): it holds the connection to the
// main process's bridge server (bridge-server.mjs) and relays one request at a time,
// while the test thread waits on `signal`. Same protocol as Babel's thread
// (babel-worker.mjs): signal[0] 0 waiting, 1 answered, 2 this thread ended; signal[1] 1
// once it has ended.
import net from "node:net";
import { workerData } from "node:worker_threads";

const { port, signal, endpoint, token } = workerData;

function settle(message) {
  port.postMessage(message);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

process.on("exit", () => {
  Atomics.store(signal, 1, 1);
  Atomics.store(signal, 0, 2);
  Atomics.notify(signal, 0);
});

/** A reply line, or null when it is not JSON (it is then not an answer to anything). */
function parseReply(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

let socket = null;
let pending = null; // { seq }
let buffered = "";

function connect() {
  socket = net.createConnection(endpoint);
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf("\n")) !== -1) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      const reply = parseReply(line);
      // Only the answer to the request the test thread is waiting for: anything else
      // (a reply to a request it gave up on) is dropped.
      if (pending === null || reply?.seq !== pending.seq) continue;
      pending = null;
      settle(reply);
    }
  });
  socket.on("error", (error) => {
    socket = null;
    if (pending !== null) {
      const { seq } = pending;
      pending = null;
      settle({
        seq,
        error: { code: "VITE_FETCH_FAILED", message: `bridge connection: ${error.message}` },
      });
    }
  });
  socket.on("close", () => {
    socket = null;
    // Closed under a waiting request: answered now, not left to the caller's deadline.
    if (pending !== null) {
      const { seq } = pending;
      pending = null;
      settle({ seq, error: { code: "VITE_FETCH_FAILED", message: "bridge connection closed" } });
    }
  });
}

port.on("message", (request) => {
  if (socket === null) connect();
  pending = { seq: request.seq };
  socket.write(`${JSON.stringify({ ...request, token })}\n`);
});
