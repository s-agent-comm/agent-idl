import * as fs from "fs";
import * as webidl from "webidl2";
import mapper from "../idl/mapper.json";

const src = fs.readFileSync("idl/agent.idl", "utf8");
const ast = webidl.parse(src);

// 將擴充屬性轉換為 JSON-LD 定義
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

// 轉換 attribute → ontology URI
Object.entries(mapper).forEach(([k, v]) => (jsonld[" @context"][k] = v));

fs.mkdirSync("idl/generated", { recursive: true });
fs.writeFileSync("idl/generated/agent-interface.jsonld", JSON.stringify(jsonld, null, 2));
console.log("✅ Generated idl/generated/agent-interface.jsonld");
