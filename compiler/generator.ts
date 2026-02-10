import fs from "fs";
import path from "path";
import * as webidl from "webidl2";
import mapper from "../idl/mapper.json";

type IdlType = webidl.IDLTypeDescription | webidl.IDLTypeDescription[] | string | null;

const IDL_PATH = path.join("idl", "agent.idl");
const OUT_DIR = path.join("sdk", "generated");
const JSONLD_OUT = path.join("idl", "generated", "agent-interface.jsonld");
const TTL_OUT = path.join("idl", "generated", "agent-interface.ttl");

const DEFAULT_PREFIXES: Record<string, string> = {
  agent: "https://s-agent-comm.github.io/agent-ontology/ontologies/agent.ttl#",
  intent: "https://s-agent-comm.github.io/agent-ontology/ontologies/intent.ttl#",
  ledger: "https://s-agent-comm.github.io/agent-ontology/ontologies/ledger.ttl#",
  capability: "https://s-agent-comm.github.io/agent-ontology/ontologies/capability.ttl#",
};

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

function expandCurie(value: string): string {
  const parts = value.split(":");
  if (parts.length !== 2) return value;
  const [prefix, local] = parts;
  const base = DEFAULT_PREFIXES[prefix];
  if (!base) return value;
  return `${base}${local}`;
}

function mapIdlTypeToTs(idlType: IdlType): string {
  if (!idlType) return "any";
  if (typeof idlType === "string") return mapPrimitive(idlType);
  if (Array.isArray(idlType)) {
    return idlType.map((type: webidl.IDLTypeDescription) => mapIdlTypeToTs(type)).join(" | ");
  }
  if (idlType.union && Array.isArray(idlType.idlType)) {
    return idlType.idlType.map((type: webidl.IDLTypeDescription) => mapIdlTypeToTs(type)).join(" | ");
  }
  if (idlType.generic) {
    const innerTypes = idlType.idlType;
    const inner = Array.isArray(innerTypes)
      ? innerTypes.map((type: webidl.IDLTypeDescription) => mapIdlTypeToTs(type)).join(" | ")
      : innerTypes
        ? mapIdlTypeToTs(innerTypes as webidl.IDLTypeDescription)
        : "any";
    if (idlType.generic === "Promise") return `Promise<${inner}>`;
    if (idlType.generic === "sequence") return `Array<${inner}>`;
    return `${idlType.generic}<${inner}>`;
  }
  if (idlType.idlType) {
    const innerTypes = idlType.idlType;
    if (Array.isArray(innerTypes)) {
      return innerTypes.map((type: webidl.IDLTypeDescription) => mapIdlTypeToTs(type)).join(" | ");
    }
    if (typeof innerTypes === "string") return mapPrimitive(innerTypes);
    return mapIdlTypeToTs(innerTypes as webidl.IDLTypeDescription);
  }
  return "any";
}

function mapPrimitive(typeName: string): string {
  const lower = typeName.toLowerCase();
  if (lower === "boolean") return "boolean";
  if (lower === "byte" || lower === "octet" || lower.includes("short") || lower.includes("long")) return "number";
  if (lower === "double" || lower === "float") return "number";
  if (lower === "domstring" || lower === "usvstring" || lower === "string") return "string";
  if (lower === "any") return "any";
  return typeName;
}

function unwrapPromise(typeName: string): string {
  if (typeName.startsWith("Promise<") && typeName.endsWith(">")) {
    return typeName.slice("Promise<".length, -1);
  }
  return typeName;
}

function collectCustomTypes(types: Set<string>, idlType: IdlType): void {
  if (!idlType) return;
  if (typeof idlType === "string") {
    const mapped = mapPrimitive(idlType);
    if (mapped === idlType && mapped !== "any" && !mapped.startsWith("Promise") && !mapped.startsWith("Array")) {
      types.add(mapped);
    }
    return;
  }
  if (Array.isArray(idlType)) {
    idlType.forEach((type: webidl.IDLTypeDescription) => collectCustomTypes(types, type));
    return;
  }
  if (idlType.union && Array.isArray(idlType.idlType)) {
    idlType.idlType.forEach((type: webidl.IDLTypeDescription) => collectCustomTypes(types, type));
    return;
  }
  if (idlType.generic) {
    const innerTypes = idlType.idlType;
    if (Array.isArray(innerTypes)) {
      innerTypes.forEach((type: webidl.IDLTypeDescription) => collectCustomTypes(types, type));
    } else {
      collectCustomTypes(types, innerTypes as webidl.IDLTypeDescription);
    }
    return;
  }
  if (idlType.idlType) {
    const innerTypes = idlType.idlType;
    if (Array.isArray(innerTypes)) {
      innerTypes.forEach((type: webidl.IDLTypeDescription) => collectCustomTypes(types, type));
    } else {
      if (typeof innerTypes === "string") {
        collectCustomTypes(types, innerTypes);
      } else {
        collectCustomTypes(types, innerTypes as webidl.IDLTypeDescription);
      }
    }
  }
}

function generate() {
  const raw = fs.readFileSync(IDL_PATH, "utf8");
  const normalized = normalizeExtendedAttributes(raw);
  const ast = webidl.parse(normalized);
  const iface = ast.find(def => def.type === "interface") as webidl.InterfaceType | undefined;
  if (!iface) throw new Error("No interface definition found.");

  const contextUrl = getExtAttrValue(iface.extAttrs, "Context");
  const semanticUrl = getExtAttrValue(iface.extAttrs, "Semantic");

  const methods = iface.members.filter(member => member.type === "operation") as webidl.OperationMemberType[];
  const methodMeta = methods.map(method => {
    const intent = getExtAttrValue(method.extAttrs, "Intent") || "";
    const proof = getExtAttrValue(method.extAttrs, "Proof");
    return {
      name: method.name,
      intent,
      proof,
      params: method.arguments.map(arg => ({
        name: arg.name,
        tsType: mapIdlTypeToTs(arg.idlType),
      })),
      returnType: mapIdlTypeToTs(method.idlType),
    };
  });

  const customTypes = new Set<string>();
  methods.forEach(method => {
    method.arguments.forEach(arg => collectCustomTypes(customTypes, arg.idlType));
    collectCustomTypes(customTypes, method.idlType);
  });

  const customTypeDecls = Array.from(customTypes)
    .filter(typeName => ![iface.name, "Promise", "Array"].includes(typeName))
    .map(typeName => `export type ${typeName} = Record<string, unknown>;`)
    .join("\n");

  const tsLines: string[] = [];
  tsLines.push("export interface AgentMessage {");
  tsLines.push("  intent: string;");
  tsLines.push("  proof?: string | null;");
  tsLines.push("  payload: Record<string, unknown>;");
  tsLines.push("  from?: string;");
  tsLines.push("  to?: string;");
  tsLines.push("  timestamp?: string;");
  tsLines.push("}");
  tsLines.push("");
  tsLines.push("export interface AgentTransport {");
  tsLines.push("  send(message: AgentMessage): Promise<unknown>;");
  tsLines.push("}");
  tsLines.push("");
  if (customTypeDecls) {
    tsLines.push(customTypeDecls);
    tsLines.push("");
  }
  tsLines.push(`export interface ${iface.name}Client {`);
  methodMeta.forEach(method => {
    const paramList = method.params.map(param => `${param.name}: ${param.tsType}`).join(", ");
    tsLines.push(`  ${method.name}(${paramList}): ${method.returnType};`);
  });
  tsLines.push("}");
  tsLines.push("");
  tsLines.push(`export interface ${iface.name}Handlers {`);
  methodMeta.forEach(method => {
    const paramList = method.params.map(param => `${param.name}: ${param.tsType}`).join(", ");
    const handlerReturn = unwrapPromise(method.returnType);
    tsLines.push(`  ${method.name}(${paramList}, message?: AgentMessage): ${handlerReturn} | Promise<${handlerReturn}>;`);
  });
  tsLines.push("}");
  tsLines.push("");
  tsLines.push("export const intents = {");
  methodMeta.forEach(method => {
    tsLines.push(`  ${method.name}: { intent: "${method.intent}", proof: ${method.proof ? `"${method.proof}"` : "null"} },`);
  });
  tsLines.push("} as const;");
  tsLines.push("");
  tsLines.push(`export function createClient(transport: AgentTransport): ${iface.name}Client {`);
  tsLines.push("  return {");
  methodMeta.forEach(method => {
    const paramNames = method.params.map(param => param.name).join(", ");
    const payload = method.params.map(param => `${param.name}: ${param.name}`).join(", ");
    tsLines.push(`    ${method.name}: (${paramNames}) => transport.send({ intent: intents.${method.name}.intent, proof: intents.${method.name}.proof, payload: { ${payload} } }) as ${method.returnType},`);
  });
  tsLines.push("  };");
  tsLines.push("}");
  tsLines.push("");
  tsLines.push(`export function registerHandlers(runtime: { registerIntent: (intent: string, handler: (message: AgentMessage) => Promise<unknown> | unknown) => void }, handlers: ${iface.name}Handlers) {`);
  methodMeta.forEach(method => {
    const paramNames = method.params
      .map(param => `message.payload.${param.name} as ${param.tsType}`)
      .join(", ");
    tsLines.push(`  runtime.registerIntent(intents.${method.name}.intent, async (message: AgentMessage) => handlers.${method.name}(${paramNames}, message));`);
  });
  tsLines.push("}");

  const jsLines: string[] = [];
  jsLines.push("const intents = {");
  methodMeta.forEach(method => {
    jsLines.push(`  ${method.name}: { intent: "${method.intent}", proof: ${method.proof ? `"${method.proof}"` : "null"} },`);
  });
  jsLines.push("};");
  jsLines.push("");
  jsLines.push("function createClient(transport) {");
  jsLines.push("  return {");
  methodMeta.forEach(method => {
    const paramNames = method.params.map(param => param.name).join(", ");
    const payload = method.params.map(param => `${param.name}: ${param.name}`).join(", ");
    jsLines.push(`    ${method.name}: (${paramNames}) => transport.send({ intent: intents.${method.name}.intent, proof: intents.${method.name}.proof, payload: { ${payload} } }),`);
  });
  jsLines.push("  };");
  jsLines.push("}");
  jsLines.push("");
  jsLines.push("function registerHandlers(runtime, handlers) {");
  methodMeta.forEach(method => {
    const paramNames = method.params.map(param => `message.payload.${param.name}`).join(", ");
    jsLines.push(`  runtime.registerIntent(intents.${method.name}.intent, async message => handlers.${method.name}(${paramNames}, message));`);
  });
  jsLines.push("}");
  jsLines.push("");
  jsLines.push("module.exports = { intents, createClient, registerHandlers };");

  const contextEntries = contextUrl ? [contextUrl, mapper] : [mapper];
  const jsonld: any = {
    "@context": contextEntries,
    "@graph": [],
  };

  jsonld["@graph"].push({
    "@id": `agent:${iface.name}`,
    "@type": "owl:Class",
    "rdfs:label": iface.name,
    "rdfs:comment": "AgentIDL interface",
  });

  methodMeta.forEach(method => {
    jsonld["@graph"].push({
      "@id": method.intent || `${iface.name}.${method.name}`,
      "@type": "agent:Intent",
      "rdfs:label": method.name,
      "Intent": method.intent || undefined,
      "Proof": method.proof || undefined,
      "agent:interface": `agent:${iface.name}`,
    });
  });

  const ttlLines: string[] = [];
  ttlLines.push("@prefix owl: <http://www.w3.org/2002/07/owl#> .");
  ttlLines.push("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .");
  ttlLines.push("@prefix agent: <https://s-agent-comm.github.io/agent-ontology/ontologies/agent.ttl#> .");
  ttlLines.push("@prefix intent: <https://s-agent-comm.github.io/agent-ontology/ontologies/intent.ttl#> .");
  ttlLines.push("@prefix ledger: <https://s-agent-comm.github.io/agent-ontology/ontologies/ledger.ttl#> .");
  ttlLines.push("");
  ttlLines.push(`agent:${iface.name} a owl:Class ; rdfs:label "${iface.name}" .`);
  ttlLines.push("");

  methodMeta.forEach(method => {
    const intentIri = method.intent ? expandCurie(method.intent) : null;
    const proofIri = method.proof ? expandCurie(method.proof) : null;
    if (intentIri) {
      ttlLines.push(`<${intentIri}> a intent:Intent ; rdfs:label "${method.name}" .`);
    }
    if (proofIri) {
      ttlLines.push(`<${proofIri}> rdfs:label "${method.name}-proof" .`);
    }
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(JSONLD_OUT), { recursive: true });

  fs.writeFileSync(path.join(OUT_DIR, `${iface.name.toLowerCase()}.ts`), tsLines.join("\n"));
  fs.writeFileSync(path.join(OUT_DIR, `${iface.name.toLowerCase()}.js`), jsLines.join("\n"));
  fs.writeFileSync(JSONLD_OUT, JSON.stringify(jsonld, null, 2));
  fs.writeFileSync(TTL_OUT, ttlLines.join("\n"));

  console.log("✅ Generated SDK + JSON-LD/TTL outputs");
}

generate();
