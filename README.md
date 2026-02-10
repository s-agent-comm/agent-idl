# AgentIDL

**AgentIDL** is an open specification extending [W3C WebIDL](https://www.w3.org/TR/WebIDL/)
to describe **semantic agents** — autonomous computational entities with verifiable identities,
capabilities, intents, and delegations.

It provides a bridge between *ontological definitions* (RDF/OWL/JSON-LD)
and *executable interfaces* for agent frameworks, allowing
**semantic interoperability** across AI systems and protocols.

## Why AgentIDL

- Adds semantic annotations (`[Intent]`, `[Proof]`, `[Capability]`, `[Context]`)
  to standard WebIDL interface definitions.
- Generates machine-readable bindings (JSON-LD / TTL) aligned with W3C Agent Ontology.
- Enables code generation for multiple runtimes (TypeScript, Python, Rust).
- Integrates with Nix-based build environments and W3C Semantic Agent Communication CG.

## Example

```webidl
[[
  Context = "https://s-agent-comm.github.io/agent-ontology/context/agent.jsonld",
  Semantic = "https://s-agent-comm.github.io/agent-ontology/ontologies/intent.ttl"
]]
interface AgentTask {
  [Intent="agent:ProposeContract"]
  Promise<Outcome> proposeContract(ContractData data);

  [Intent="agent:ExecutePayment", Proof="ledger:tx"]
  Promise<Receipt> executePayment(PaymentRequest payment);
};
```

## Positioning: A Bridge Between Semantics and Execution

While the ontology layer describes **what an agent is** (roles, capabilities, contracts, etc.), AgentIDL defines **how an agent acts and speaks**. It serves as a "Semantic API" that can be compared to:

-   **OpenAPI/IDL for the web**, but operating at a semantic level.
-   **gRPC's `.proto` files**, but with support for intents, trust, and grammar.
-   **Solidity's function signatures**, but for agent behavioral protocols.

Semantically, it combines:

**Ontology (meaning) + Grammar (syntax) + Protocol (execution)**

This creates an agent-level **Application Behavior Interface (ABI)**.

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

### Comparison

| | **Semantic Definition (Ontology)** | **Execution Interface (Interface)** |
| :--- | :--- | :--- |
| **Purpose** | Defines the concepts and their relationships | Defines the methods and their signatures |
| **Format** | .ttl, .jsonld, .shacl | .idl, .jsonld, .ts |
| **Toolchain** | RDF / Jena / pySHACL | WebIDL2.js / Node / Nix |
| **Publication**| gh-pages + w3id | npm + gh-pages (docs) |
| **Boundary** | Semantic correctness, conceptual consistency | Behavioral consistency, semantic mapping |
| **Coupling** | `ontology v1.0` | `idl v1.0` → imports `ontology v1.0` |
