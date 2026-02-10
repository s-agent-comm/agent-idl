const path = require("path");
const { loadAgentInterface, AgentRuntime } = require("../sdk/agent-sdk");

async function main() {
  const idlPath = path.join(__dirname, "..", "idl", "agent.idl");
  const interfaceDef = loadAgentInterface(idlPath);

  const buyer = new AgentRuntime({ id: "agent:Buyer", interfaceDef });
  const seller = new AgentRuntime({ id: "agent:Seller", interfaceDef });

  seller.registerIntent("agent:ProposeContract", async message => {
    const contract = message.payload.data;
    return {
      status: "accepted",
      contractId: "C-1001",
      counterparty: message.from,
      terms: contract.terms,
      total: contract.price,
      currency: contract.currency,
      note: "Seller accepts contract terms.",
    };
  });

  seller.registerIntent("agent:ExecutePayment", async message => {
    const payment = message.payload.payment;
    if (payment.amount <= 0) {
      return {
        status: "rejected",
        reason: "Amount must be positive.",
      };
    }

    return {
      status: "paid",
      receiptId: "R-9001",
      txRef: "ledger:tx:0xabc123",
      amount: payment.amount,
      currency: payment.currency,
      note: "Payment executed and recorded.",
    };
  });

  const contractData = {
    parties: [buyer.id, seller.id],
    terms: "10 hours of API integration support",
    price: 5000,
    currency: "USD",
    dueDate: "2026-02-20",
  };

  const outcome = await buyer.callMethod(seller, "proposeContract", contractData);
  console.log("ProposeContract outcome:");
  console.log(JSON.stringify(outcome, null, 2));

  const paymentRequest = {
    contractId: outcome.contractId,
    amount: outcome.total,
    currency: outcome.currency,
    method: "wire",
  };

  const receipt = await buyer.callMethod(seller, "executePayment", paymentRequest);
  console.log("\nExecutePayment receipt:");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
