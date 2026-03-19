const fs = require("fs");
const path = require("path");
const webidl = require("webidl2");

function normalizeExtendedAttributes(idlSource) {
  return idlSource.replace(/\[\[/g, "[").replace(/\]\]/g, "]");
}

function getExtAttrValue(extAttrs, name) {
  if (!extAttrs) return null;
  const found = extAttrs.find(attr => attr.name === name);
  if (!found) return null;
  let value = null;
  if (typeof found.rhs === "string") value = found.rhs;
  if (found.rhs && typeof found.rhs.value === "string") value = found.rhs.value;
  if (typeof value !== "string") return null;
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  return value;
}

function serializeIdlType(idlType) {
  if (typeof idlType === "string") return idlType;
  if (Array.isArray(idlType)) return idlType.map(serializeIdlType).join(" or ");
  if (!idlType || typeof idlType !== "object") return "any";
  if (idlType.union && Array.isArray(idlType.idlType)) {
    return idlType.idlType.map(serializeIdlType).join(" or ");
  }
  if (idlType.generic) {
    return `${idlType.generic}<${serializeIdlType(idlType.idlType)}>`;
  }
  return serializeIdlType(idlType.idlType);
}

function loadAgentInterface(idlPath) {
  const raw = fs.readFileSync(idlPath, "utf8");
  const normalized = normalizeExtendedAttributes(raw);
  const ast = webidl.parse(normalized);
  const iface = ast.find(def => def.type === "interface");
  if (!iface) {
    throw new Error("No interface definition found in IDL.");
  }

  const context = getExtAttrValue(iface.extAttrs, "Context");
  const semantic = getExtAttrValue(iface.extAttrs, "Semantic");

  const methods = {};
  iface.members.forEach(member => {
    if (member.type !== "operation") return;
    const name = member.name;
    const intent = getExtAttrValue(member.extAttrs, "Intent");
    const proof = getExtAttrValue(member.extAttrs, "Proof");
    const params = member.arguments.map(arg => ({
      name: arg.name,
      type: serializeIdlType(arg.idlType),
    }));
    methods[name] = {
      name,
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

class AgentRuntime {
  constructor({ id, interfaceDef }) {
    this.id = id;
    this.interfaceDef = interfaceDef;
    this.intentHandlers = new Map();
  }

  registerIntent(intent, handler) {
    this.intentHandlers.set(intent, handler);
  }

  async receive(message) {
    const handler = this.intentHandlers.get(message.intent);
    if (!handler) {
      throw new Error(`No handler registered for intent: ${message.intent}`);
    }
    return handler(message);
  }

  async invokeIntent(targetAgent, intent, payload, proof) {
    const message = {
      from: this.id,
      to: targetAgent.id,
      intent,
      proof: proof || null,
      payload,
      timestamp: new Date().toISOString(),
    };
    return targetAgent.receive(message);
  }

  async callMethod(targetAgent, methodName, ...args) {
    const method = this.interfaceDef.methods[methodName];
    if (!method) {
      throw new Error(`Method not defined in interface: ${methodName}`);
    }

    const payload = {};
    method.params.forEach((param, index) => {
      payload[param.name] = args[index];
    });

    return this.invokeIntent(targetAgent, method.intent, payload, method.proof);
  }
}

function createAgentClient({ runtime, target }) {
  const client = {};
  Object.keys(runtime.interfaceDef.methods).forEach(methodName => {
    client[methodName] = (...args) => runtime.callMethod(target, methodName, ...args);
  });
  return client;
}

function createRuntimeTransport({ caller, target }) {
  return {
    send: ({ intent, payload, proof }) => caller.invokeIntent(target, intent, payload, proof),
  };
}

module.exports = {
  loadAgentInterface,
  AgentRuntime,
  createAgentClient,
  createRuntimeTransport,
};
