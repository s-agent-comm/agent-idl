import { createClient } from "../../sdk/generated/agenttask.mjs";

const output = document.getElementById("output");
const proposeBtn = document.getElementById("propose");
const payBtn = document.getElementById("pay");

const ws = new WebSocket("ws://localhost:8787");
const pending = new Map();
let seq = 0;
let lastPayment = null;

const openPromise = new Promise(resolve => {
  ws.addEventListener("open", () => resolve());
});

ws.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) {
    reject(new Error(msg.error));
  } else {
    resolve(msg.result);
  }
});

ws.addEventListener("close", () => {
  output.textContent += "\n[ws] connection closed";
});

function nextId() {
  seq += 1;
  return `req-${Date.now()}-${seq}`;
}

function createWsTransport(socket) {
  return {
    async send(message) {
      if (socket.readyState !== WebSocket.OPEN) {
        await openPromise;
      }
      const id = nextId();
      const payload = { id, from: "browser:buyer", ...message };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify(payload));
      });
    },
  };
}

const client = createClient(createWsTransport(ws));

proposeBtn.addEventListener("click", async () => {
  output.textContent = "";
  try {
    const result = await client.proposeContract({
      parties: ["agent:Buyer", "agent:Seller"],
      terms: "10 hours API integration support",
      price: 5000,
      currency: "USD",
      dueDate: "2026-02-20",
    });
    output.textContent = `ProposeContract result:\n${JSON.stringify(result, null, 2)}`;
    if (result && result.outcome) {
      lastPayment = {
        contractId: result.outcome.contractId,
        amount: result.outcome.total,
        currency: result.outcome.currency,
        method: "wire",
      };
    }
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
});

payBtn.addEventListener("click", async () => {
  output.textContent = "";
  if (!lastPayment) {
    output.textContent = "Please propose a contract first.";
    return;
  }
  try {
    const result = await client.executePayment(lastPayment);
    output.textContent = `ExecutePayment result:\n${JSON.stringify(result, null, 2)}`;
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
  }
});
