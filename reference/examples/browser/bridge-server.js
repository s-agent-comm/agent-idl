const { WebSocketServer } = require("ws");
const { createClient } = require("../../sdk/generated/browserai.js");

const wss = new WebSocketServer({ port: 8790 });
let socket = null;

wss.on("connection", ws => {
  socket = ws;
  console.log("Bridge connected");
  demo();
  ws.on("close", () => {
    socket = null;
    console.log("Bridge disconnected");
  });
});

function createBridgeTransport() {
  const pending = new Map();
  let seq = 0;

  function nextId() {
    seq += 1;
    return `bridge-${Date.now()}-${seq}`;
  }

  return {
    send(message) {
      if (!socket) {
        return Promise.reject(new Error("No browser bridge connected"));
      }
      const id = nextId();
      socket.send(JSON.stringify({ id, ...message }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const onMessage = raw => {
          const reply = JSON.parse(raw.toString());
          if (!reply || reply.id !== id) return;
          socket.off("message", onMessage);
          pending.delete(id);
          if (reply.error) reject(new Error(reply.error));
          else resolve(reply.result);
        };
        socket.on("message", onMessage);
      });
    },
  };
}

async function demo() {
  const transport = createBridgeTransport();
  const client = createClient(transport);

  try {
    const result = await client.summarizeText({
      text: "This is a test document. It contains multiple sentences. The summary should be short.",
    });
    console.log("Summary result:", result);
  } catch (err) {
    console.error("Summary error:", err.message || err);
  }
}

console.log("Bridge server listening on ws://localhost:8790");
