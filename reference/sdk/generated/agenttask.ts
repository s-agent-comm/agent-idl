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

export type ContractData = Record<string, unknown>;
export type Outcome = Record<string, unknown>;
export type PaymentRequest = Record<string, unknown>;
export type Receipt = Record<string, unknown>;

export interface AgentTaskClient {
  proposeContract(data: ContractData): Promise<Outcome>;
  executePayment(payment: PaymentRequest): Promise<Receipt>;
}

export interface AgentTaskHandlers {
  proposeContract(data: ContractData, message?: AgentMessage): Outcome | Promise<Outcome>;
  executePayment(payment: PaymentRequest, message?: AgentMessage): Receipt | Promise<Receipt>;
}

export const intents = {
  proposeContract: { intent: "agent:ProposeContract", proof: null },
  executePayment: { intent: "agent:ExecutePayment", proof: "ledger:tx" },
} as const;

export function createClient(transport: AgentTransport): AgentTaskClient {
  return {
    proposeContract: (data) => transport.send({ intent: intents.proposeContract.intent, proof: intents.proposeContract.proof, payload: { data: data } }) as Promise<Outcome>,
    executePayment: (payment) => transport.send({ intent: intents.executePayment.intent, proof: intents.executePayment.proof, payload: { payment: payment } }) as Promise<Receipt>,
  };
}

export function registerHandlers(runtime: { registerIntent: (intent: string, handler: (message: AgentMessage) => Promise<unknown> | unknown) => void }, handlers: AgentTaskHandlers) {
  runtime.registerIntent(intents.proposeContract.intent, async (message: AgentMessage) => handlers.proposeContract(message.payload.data as ContractData, message));
  runtime.registerIntent(intents.executePayment.intent, async (message: AgentMessage) => handlers.executePayment(message.payload.payment as PaymentRequest, message));
}