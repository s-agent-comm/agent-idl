import * as fs from "fs";
import * as webidl from "webidl2";
import mapper from "../../idl/mapper.json";

const src = fs.readFileSync("idl/agent.idl", "utf8");
const ast = webidl.parse(src);

// Convert extended attributes to JSON-LD output
const jsonld: any = { " @context": {}, " @graph": [] };
ast.forEach(def => {
  if (def.type === "interface") {
    const node: any = {
      " @id": `agent:${def.name}`,
      " @type": "owl:Class",
      "rdfs:label": def.name,
      "rdfs:comment": "AgentIDL interface"
    };
    jsonld[" @graph"].push(node);
  }
});

// Map attribute names to IRIs via mapper.json
Object.entries(mapper).forEach(([k, v]) => (jsonld[" @context"][k] = v));

fs.mkdirSync("idl/generated", { recursive: true });
fs.writeFileSync("idl/generated/agent-interface.jsonld", JSON.stringify(jsonld, null, 2));
console.log("✅ Generated idl/generated/agent-interface.jsonld");
