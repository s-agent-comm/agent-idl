const intents = {
  proposeContract: { intent: "agent:ProposeContract", proof: null },
  executePayment: { intent: "agent:ExecutePayment", proof: "ledger:tx" },
};

function createClient(transport) {
  return {
    proposeContract: (data) => transport.send({ intent: intents.proposeContract.intent, proof: intents.proposeContract.proof, payload: { data: data } }),
    executePayment: (payment) => transport.send({ intent: intents.executePayment.intent, proof: intents.executePayment.proof, payload: { payment: payment } }),
  };
}

function registerHandlers(runtime, handlers) {
  runtime.registerIntent(intents.proposeContract.intent, async message => handlers.proposeContract(message.payload.data, message));
  runtime.registerIntent(intents.executePayment.intent, async message => handlers.executePayment(message.payload.payment, message));
}

module.exports = { intents, createClient, registerHandlers };