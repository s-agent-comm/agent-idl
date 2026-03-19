# AgentIDL

**AgentIDL** is an open specification extending [W3C WebIDL](https://www.w3.org/TR/WebIDL/)
to define **agent interfaces** — typed method signatures with intent annotations,
proof requirements, capability constraints, and delegation rules.

It generates machine-readable bindings (JSON-LD / TTL) from annotated WebIDL,
enabling interoperability across AI agent frameworks and protocols.

## Why AgentIDL

- Adds structured annotations (`[Intent]`, `[Proof]`, `[Capability]`, `[Context]`)
  to standard WebIDL interface definitions.
- Generates JSON-LD and TTL bindings from IDL source.
- Enables code generation for multiple runtimes (TypeScript, Python, Rust).
- Integrates with Nix-based build environments and W3C Semantic Agent Communication CG.

## Example

```webidl
[[
  Context = "https://s-agent-comm.github.io/agent-ontology/latest/context/agent.jsonld"
  Semantic = "https://s-agent-comm.github.io/agent-ontology/latest/intent.ttl"
]]
interface AgentTask {
  [Intent="agent:ProposeContract"]
  Promise<Outcome> proposeContract(ContractData data);

  [Intent="agent:ExecutePayment", Proof="ledger:tx"]
  Promise<Receipt> executePayment(PaymentRequest payment);
};
```

## How It Works

AgentIDL defines typed method signatures with annotations that map to
machine-readable identifiers. It can be compared to:

-   **OpenAPI/IDL for the web**, but with intent and proof annotations.
-   **gRPC's `.proto` files**, but with trust and delegation support.
-   **Solidity's function signatures**, but for agent-to-agent protocols.

The compiler reads annotated WebIDL and produces SDK bindings, JSON-LD
context files, and TTL triples.

## Conformance Tests

The repository includes a self-contained conformance test suite under `agent-idl-tests/`.

**Local run**

```bash
npm run test:conformance
```

**CI**

GitHub Actions runs the conformance suite on pushes and pull requests via:

```
.github/workflows/agent-idl-conformance.yml
```

## SHACL Validation

Generate JSON-LD/TTL from the IDL, then validate with SHACL tools.

```bash
npm run build
npm run generate:agenttask
```

**Example (pyshacl)**

```bash
python -m pip install pyshacl rdflib
python -m pyshacl -s shacl/agenttask-shapes.ttl -d idl/generated/agent-interface.ttl
```

## Browser Demo (WebSocket)

This demo uses a WebSocket transport between a browser client and a Node.js agent server.

```bash
npm run build
npm run generate:agenttask
node reference/examples/browser/server.js
```

Serve the repo root (for example):

```bash
python3 -m http.server 8080
```

Open: `http://localhost:8080/reference/examples/browser/`

## Browser AI Bridge (Chrome Built-in)

This uses Chrome's built-in AI APIs in a browser tab and bridges results to Node.js over WebSocket.

```bash
npm run build
npm run generate:browserai
node reference/examples/browser/bridge-server.js
python3 -m http.server 8080
```

Open: `http://localhost:8080/reference/examples/browser/bridge.html`  
Click **Enable AI** to initialize the built-in API, then watch the Node server log for summaries.
Requires Chrome with built-in AI APIs available.

### Comparison

| | **Data Model (RDF/JSON-LD)** | **Interface Definition (IDL)** |
| :--- | :--- | :--- |
| **Purpose** | Declares types and their identifiers | Declares methods and their signatures |
| **Format** | .ttl, .jsonld, .shacl | .idl, .jsonld, .ts |
| **Toolchain** | RDF / Jena / pySHACL | WebIDL2.js / Node / Nix |
| **Publication**| gh-pages + w3id | npm + gh-pages (docs) |
| **Boundary** | Data validation, schema conformance | Behavioral conformance, binding correctness |
