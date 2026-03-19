export const intents = {
  summarizeText: { intent: "agent:SummarizeText", proof: null },
  translateText: { intent: "agent:TranslateText", proof: null },
};

export function createClient(transport) {
  return {
    summarizeText: (request) => transport.send({ intent: intents.summarizeText.intent, proof: intents.summarizeText.proof, payload: { request: request } }),
    translateText: (request) => transport.send({ intent: intents.translateText.intent, proof: intents.translateText.proof, payload: { request: request } }),
  };
}

export function registerHandlers(runtime, handlers) {
  runtime.registerIntent(intents.summarizeText.intent, async message => handlers.summarizeText(message.payload.request, message));
  runtime.registerIntent(intents.translateText.intent, async message => handlers.translateText(message.payload.request, message));
}