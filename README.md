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
  Context = "https://s-agent-comm.github.io/ontology/context/agent.jsonld",
  Semantic = "https://s-agent-comm.github.io/ontology/ontologies/intent.ttl"
]]
interface AgentTask {
  [Intent="agent:ProposeContract"]
  Promise<Outcome> proposeContract(ContractData data);

  [Intent="agent:ExecutePayment", Proof="ledger:tx"]
  Promise<Receipt> executePayment(PaymentRequest payment);
};
