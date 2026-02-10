import fs from "fs";
import * as webidl from "webidl2";

export interface AgentMethodParam {
  name: string;
  type: string;
}

export interface AgentMethodDef {
  name: string;
  intent: string;
  proof: string | null;
  returnType: string;
  params: AgentMethodParam[];
}

export interface AgentInterfaceDef {
  name: string;
  context: string | null;
  semantic: string | null;
  methods: Record<string, AgentMethodDef>;
}

export interface AgentMessage {
  from?: string;
  to?: string;
  intent: string;
  proof?: string | null;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface AgentTransport {
  send(message: AgentMessage): Promise<unknown>;
}

function normalizeExtendedAttributes(idlSource: string): string {
  return idlSource.replace(/\[\[/g, "[").replace(/\]\]/g, "]");
}

function getExtAttrValue(extAttrs: webidl.ExtendedAttribute[] | undefined, name: string): string | null {
  if (!extAttrs) return null;
  const found = extAttrs.find(attr => attr.name === name);
  if (!found) return null;
  let value: string | null = null;
  if (typeof found.rhs === "string") value = found.rhs;
  if (found.rhs && typeof (found.rhs as any).value === "string") value = (found.rhs as any).value;
  if (typeof value !== "string") return null;
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  return value;
}

function serializeIdlType(idlType: webidl.IDLTypeDescription | webidl.IDLTypeDescription[] | string | null): string {
  if (!idlType) return "any";
  if (typeof idlType === "string") return idlType;
  if (Array.isArray(idlType)) return idlType.map(serializeIdlType).join(" or ");
  if (idlType.union && Array.isArray(idlType.idlType)) {
    return idlType.idlType.map(serializeIdlType).join(" or ");
  }
  if (idlType.generic) {
    const inner = Array.isArray(idlType.idlType)
      ? idlType.idlType.map(serializeIdlType).join(" or ")
      : serializeIdlType(idlType.idlType as webidl.IDLTypeDescription);
    return `${idlType.generic}<${inner}>`;
  }
  if (idlType.idlType) {
    if (Array.isArray(idlType.idlType)) return idlType.idlType.map(serializeIdlType).join(" or ");
    return serializeIdlType(idlType.idlType as webidl.IDLTypeDescription | string);
  }
  return "any";
}

export function loadAgentInterface(idlPath: string): AgentInterfaceDef {
  const raw = fs.readFileSync(idlPath, "utf8");
  const normalized = normalizeExtendedAttributes(raw);
  const ast = webidl.parse(normalized);
  const iface = ast.find(def => def.type === "interface") as webidl.InterfaceType | undefined;
  if (!iface) {
    throw new Error("No interface definition found in IDL.");
  }

  const context = getExtAttrValue(iface.extAttrs, "Context");
  const semantic = getExtAttrValue(iface.extAttrs, "Semantic");

  const methods: Record<string, AgentMethodDef> = {};
  iface.members.forEach(member => {
    if (member.type !== "operation") return;
    if (!member.name) return;
    const intent = getExtAttrValue(member.extAttrs, "Intent") || "";
    const proof = getExtAttrValue(member.extAttrs, "Proof");
    const params = member.arguments.map(arg => ({
      name: arg.name,
      type: serializeIdlType(arg.idlType),
    }));
    methods[member.name] = {
      name: member.name,
      intent,
      proof,
      returnType: serializeIdlType(member.idlType),
      params,
    };
  });

  return {
    name: iface.name,
    context,
    semantic,
    methods,
  };
}

export class AgentRuntime {
  public id: string;
  public interfaceDef: AgentInterfaceDef;
  private intentHandlers: Map<string, (message: AgentMessage) => Promise<unknown> | unknown>;

  constructor({ id, interfaceDef }: { id: string; interfaceDef: AgentInterfaceDef }) {
    this.id = id;
    this.interfaceDef = interfaceDef;
    this.intentHandlers = new Map();
  }

  registerIntent(intent: string, handler: (message: AgentMessage) => Promise<unknown> | unknown) {
    this.intentHandlers.set(intent, handler);
  }

  async receive(message: AgentMessage) {
    const handler = this.intentHandlers.get(message.intent);
    if (!handler) {
      throw new Error(`No handler registered for intent: ${message.intent}`);
    }
    return handler(message);
  }

  async invokeIntent(targetAgent: AgentRuntime, intent: string, payload: Record<string, unknown>, proof?: string | null) {
    const message: AgentMessage = {
      from: this.id,
      to: targetAgent.id,
      intent,
      proof: proof || null,
      payload,
      timestamp: new Date().toISOString(),
    };
    return targetAgent.receive(message);
  }

  async callMethod(targetAgent: AgentRuntime, methodName: string, ...args: unknown[]) {
    const method = this.interfaceDef.methods[methodName];
    if (!method) {
      throw new Error(`Method not defined in interface: ${methodName}`);
    }

    const payload: Record<string, unknown> = {};
    method.params.forEach((param, index) => {
      payload[param.name] = args[index];
    });

    return this.invokeIntent(targetAgent, method.intent, payload, method.proof || null);
  }
}

export function createAgentClient({ runtime, target }: { runtime: AgentRuntime; target: AgentRuntime }) {
  const client: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  Object.keys(runtime.interfaceDef.methods).forEach(methodName => {
    client[methodName] = (...args: unknown[]) => runtime.callMethod(target, methodName, ...args);
  });
  return client;
}

export function createRuntimeTransport({ caller, target }: { caller: AgentRuntime; target: AgentRuntime }): AgentTransport {
  return {
    send: ({ intent, payload, proof }) => caller.invokeIntent(target, intent, payload, proof),
  };
}
