const path = require("path");
const { loadAgentInterface, AgentRuntime, createRuntimeTransport } = require("../sdk/agent-sdk");
const { createClient, registerHandlers } = require("../sdk/generated/agenttask.js");

async function main() {
  const idlPath = path.join(__dirname, "..", "idl", "agent.idl");
  const interfaceDef = loadAgentInterface(idlPath);

  const buyer = new AgentRuntime({ id: "agent:Buyer", interfaceDef });
  const seller = new AgentRuntime({ id: "agent:Seller", interfaceDef });

  registerHandlers(seller, {
    proposeContract: async (data, message) => {
      const contractId = "C-1001";
      const outcome = {
        status: "accepted",
        contractId,
        counterparty: message ? message.from : null,
        terms: data.terms,
        total: data.price,
        currency: data.currency,
        signedAt: new Date().toISOString(),
        note: "Seller accepts contract terms."
      };
      return {
        outcome,
        contract: {
          id: contractId,
          parties: data.parties,
          terms: data.terms,
          price: data.price,
          currency: data.currency,
          dueDate: data.dueDate,
          status: "active"
        }
      };
    },
    executePayment: async payment => {
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
    }
  });

  const contractData = {
    parties: [buyer.id, seller.id],
    terms: "10 hours of API integration support",
    price: 5000,
    currency: "USD",
    dueDate: "2026-02-20",
  };

  const transport = createRuntimeTransport({ caller: buyer, target: seller });
  const buyerClient = createClient(transport);
  const proposalResult = await buyerClient.proposeContract(contractData);
  console.log("ProposeContract outcome:");
  console.log(JSON.stringify(proposalResult, null, 2));

  const paymentRequest = {
    contractId: proposalResult.outcome.contractId,
    amount: proposalResult.outcome.total,
    currency: proposalResult.outcome.currency,
    method: "wire",
  };

  const receipt = await buyerClient.executePayment(paymentRequest);
  console.log("\nExecutePayment receipt:");
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
