const path = require("path");
const { WebSocketServer } = require("ws");
const { AgentRuntime, loadAgentInterface } = require("../../sdk/agent-sdk");
const { registerHandlers } = require("../../sdk/generated/agenttask.js");

const idlPath = path.join(__dirname, "..", "..", "..", "idl", "agent.idl");
const interfaceDef = loadAgentInterface(idlPath);
const seller = new AgentRuntime({ id: "agent:Seller", interfaceDef });

registerHandlers(seller, {
  proposeContract: (data, message) => {
    const contractId = "C-1001";
    return {
      outcome: {
        status: "accepted",
        contractId,
        counterparty: message?.from ?? null,
        terms: data.terms,
        total: data.price,
        currency: data.currency,
        signedAt: new Date().toISOString(),
        note: "Seller accepts contract terms.",
      },
      contract: {
        id: contractId,
        parties: data.parties,
        terms: data.terms,
        price: data.price,
        currency: data.currency,
        dueDate: data.dueDate,
        status: "active",
      },
    };
  },
  executePayment: payment => {
    if (payment.amount <= 0) {
      return { status: "rejected", reason: "Amount must be positive." };
    }
    return {
      status: "paid",
      receiptId: "R-9001",
      txRef: "ledger:tx:0xabc123",
      amount: payment.amount,
      currency: payment.currency,
      note: "Payment executed and recorded.",
    };
  },
});

const wss = new WebSocketServer({ port: 8787 });

wss.on("connection", ws => {
  ws.on("message", async raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (err) {
      ws.send(JSON.stringify({ id: null, error: "Invalid JSON" }));
      return;
    }

    try {
      const result = await seller.receive({
        intent: message.intent,
        proof: message.proof ?? null,
        payload: message.payload || {},
        from: message.from || "browser:client",
        to: seller.id,
        timestamp: new Date().toISOString(),
      });
      ws.send(JSON.stringify({ id: message.id, result }));
    } catch (err) {
      ws.send(JSON.stringify({ id: message.id, error: err.message || String(err) }));
    }
  });
});

console.log("WebSocket agent server listening on ws://localhost:8787");
