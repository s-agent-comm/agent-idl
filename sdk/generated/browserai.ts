export interface AgentMessage {
  intent: string;
  proof?: string | null;
  payload: Record<string, unknown>;
  from?: string;
  to?: string;
  timestamp?: string;
}

export interface AgentTransport {
  send(message: AgentMessage): Promise<unknown>;
}

export type SummaryRequest = Record<string, unknown>;
export type SummaryResult = Record<string, unknown>;
export type TranslationRequest = Record<string, unknown>;
export type TranslationResult = Record<string, unknown>;

export interface BrowserAIClient {
  summarizeText(request: SummaryRequest): Promise<SummaryResult>;
  translateText(request: TranslationRequest): Promise<TranslationResult>;
}

export interface BrowserAIHandlers {
  summarizeText(request: SummaryRequest, message?: AgentMessage): SummaryResult | Promise<SummaryResult>;
  translateText(request: TranslationRequest, message?: AgentMessage): TranslationResult | Promise<TranslationResult>;
}

export const intents = {
  summarizeText: { intent: "agent:SummarizeText", proof: null },
  translateText: { intent: "agent:TranslateText", proof: null },
} as const;

export function createClient(transport: AgentTransport): BrowserAIClient {
  return {
    summarizeText: (request) => transport.send({ intent: intents.summarizeText.intent, proof: intents.summarizeText.proof, payload: { request: request } }) as Promise<SummaryResult>,
    translateText: (request) => transport.send({ intent: intents.translateText.intent, proof: intents.translateText.proof, payload: { request: request } }) as Promise<TranslationResult>,
  };
}

export function registerHandlers(runtime: { registerIntent: (intent: string, handler: (message: AgentMessage) => Promise<unknown> | unknown) => void }, handlers: BrowserAIHandlers) {
  runtime.registerIntent(intents.summarizeText.intent, async (message: AgentMessage) => handlers.summarizeText(message.payload.request as SummaryRequest, message));
  runtime.registerIntent(intents.translateText.intent, async (message: AgentMessage) => handlers.translateText(message.payload.request as TranslationRequest, message));
}