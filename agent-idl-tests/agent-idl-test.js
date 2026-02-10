#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const webidl = require("webidl2");
const { AgentRuntime, loadAgentInterface, createRuntimeTransport } = require("../sdk/agent-sdk");

const ROOT = __dirname;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

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

function idlTypeName(idlType) {
  if (!idlType) return null;
  if (typeof idlType === "string") return idlType;
  if (Array.isArray(idlType)) return idlType.map(idlTypeName).join("|");
  if (idlType.idlType) return idlTypeName(idlType.idlType);
  return null;
}

function parseIdl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const normalized = normalizeExtendedAttributes(raw);
  return webidl.parse(normalized);
}

function collectFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function validateIdlAst(ast, coreRules, profile) {
  const errors = [];
  const allowed = new Set(coreRules.allowedExtAttrs || []);
  const requiredInterfaceAttrs = coreRules.requiredInterfaceAttrs || [];
  const requiredOperationAttrs = coreRules.requiredOperationAttrs || [];
  const delegationParamType = coreRules.delegationParamType || "DelegationContext";

  const interfaces = ast.filter(def => def.type === "interface");
  if (interfaces.length === 0) {
    errors.push("No interface definitions found.");
    return errors;
  }

  for (const iface of interfaces) {
    const ifaceAttrs = iface.extAttrs || [];

    for (const attr of ifaceAttrs) {
      if (!allowed.has(attr.name)) {
        errors.push(`Unknown extended attribute on interface ${iface.name}: ${attr.name}`);
      }
    }

    for (const req of requiredInterfaceAttrs) {
      const value = getExtAttrValue(ifaceAttrs, req);
      if (!value) {
        errors.push(`Missing required interface attribute ${req} on ${iface.name}`);
      }
    }

    for (const member of iface.members) {
      if (member.type !== "operation") continue;
      const memberAttrs = member.extAttrs || [];

      for (const attr of memberAttrs) {
        if (!allowed.has(attr.name)) {
          errors.push(`Unknown extended attribute on ${iface.name}.${member.name}: ${attr.name}`);
        }
      }

      for (const req of requiredOperationAttrs) {
        const value = getExtAttrValue(memberAttrs, req);
        if (!value) {
          errors.push(`Missing required operation attribute ${req} on ${iface.name}.${member.name}`);
        }
      }

      const delegationValue = getExtAttrValue(memberAttrs, "Delegation");
      if (delegationValue) {
        const hasDelegationParam = member.arguments.some(arg => idlTypeName(arg.idlType) === delegationParamType);
        if (!hasDelegationParam) {
          errors.push(`Delegation attribute requires ${delegationParamType} parameter on ${iface.name}.${member.name}`);
        }
      }
    }
  }

  if (profile === "delegation") {
    const requiresDelegation = coreRules.delegationParamType;
    if (!requiresDelegation) {
      errors.push("Delegation profile requires delegation parameter type rule.");
    }
  }

  return errors;
}

function validateDelegationContext(ctx, rules) {
  const errors = [];
  for (const field of rules.requiredDelegationFields || []) {
    if (ctx[field] === undefined || ctx[field] === null) {
      errors.push(`Missing delegation field: ${field}`);
    }
  }

  if (ctx.proof) {
    if (rules.proofType && ctx.proof.type !== rules.proofType) {
      errors.push(`Invalid proof.type (expected ${rules.proofType}).`);
    }
  }

  if (ctx.issuedAt && Number.isNaN(Date.parse(ctx.issuedAt))) {
    errors.push("Invalid issuedAt timestamp.");
  }
  if (ctx.expiresAt && Number.isNaN(Date.parse(ctx.expiresAt))) {
    errors.push("Invalid expiresAt timestamp.");
  }

  if (ctx.revoked === true) {
    errors.push("Delegation context is revoked.");
  }

  return errors;
}

function validateExecutionRecord(record, rules) {
  const errors = [];
  for (const field of rules.requiredExecutionFields || []) {
    if (record[field] === undefined || record[field] === null) {
      errors.push(`Missing execution record field: ${field}`);
    }
  }

  if (record.timestamp && Number.isNaN(Date.parse(record.timestamp))) {
    errors.push("Invalid execution record timestamp.");
  }

  if (record.attestation) {
    for (const field of rules.attestationFields || []) {
      if (record.attestation[field] === undefined || record.attestation[field] === null) {
        errors.push(`Missing attestation field: ${field}`);
      }
    }
    if (rules.attestationType && record.attestation.type !== rules.attestationType) {
      errors.push(`Invalid attestation type (expected ${rules.attestationType}).`);
    }
  }

  return errors;
}

function runIdlVectors(dirPath, expectValid, profile) {
  const coreRules = loadJson(path.join(ROOT, "validation-rules", "core.json"));
  const results = [];
  for (const filePath of collectFiles(dirPath).filter(p => p.endsWith(".idl"))) {
    const testName = path.relative(ROOT, filePath);
    try {
      const ast = parseIdl(filePath);
      const errors = validateIdlAst(ast, coreRules, profile);
      if (errors.length > 0 && expectValid) {
        results.push({ name: testName, ok: false, error: errors.join("; ") });
      } else if (errors.length === 0 && !expectValid) {
        results.push({ name: testName, ok: false, error: "Expected invalid IDL but validation passed." });
      } else {
        results.push({ name: testName, ok: true });
      }
    } catch (err) {
      if (expectValid) {
        results.push({ name: testName, ok: false, error: err.message || String(err) });
      } else {
        results.push({ name: testName, ok: true });
      }
    }
  }
  return results;
}

function runDelegationContextVectors(dirPath, expectValid) {
  const rules = loadJson(path.join(ROOT, "validation-rules", "delegation.json"));
  const results = [];
  for (const filePath of collectFiles(dirPath).filter(p => p.endsWith(".json"))) {
    const testName = path.relative(ROOT, filePath);
    try {
      const ctx = loadJson(filePath);
      const errors = validateDelegationContext(ctx, rules);
      if (errors.length > 0 && expectValid) {
        results.push({ name: testName, ok: false, error: errors.join("; ") });
      } else if (errors.length === 0 && !expectValid) {
        results.push({ name: testName, ok: false, error: "Expected invalid delegation context but validation passed." });
      } else {
        results.push({ name: testName, ok: true });
      }
    } catch (err) {
      results.push({ name: testName, ok: false, error: err.message || String(err) });
    }
  }
  return results;
}

function runExecutionRecordVectors(dirPath, expectValid) {
  const rules = loadJson(path.join(ROOT, "validation-rules", "audit.json"));
  const results = [];
  for (const filePath of collectFiles(dirPath).filter(p => p.endsWith(".json"))) {
    const testName = path.relative(ROOT, filePath);
    try {
      const record = loadJson(filePath);
      const errors = validateExecutionRecord(record, rules);
      if (errors.length > 0 && expectValid) {
        results.push({ name: testName, ok: false, error: errors.join("; ") });
      } else if (errors.length === 0 && !expectValid) {
        results.push({ name: testName, ok: false, error: "Expected invalid execution record but validation passed." });
      } else {
        results.push({ name: testName, ok: true });
      }
    } catch (err) {
      results.push({ name: testName, ok: false, error: err.message || String(err) });
    }
  }
  return results;
}

async function runScenario(filePath) {
  const scenario = loadJson(filePath);
  const results = [];

  if (scenario.name === "basic-delegation" || scenario.name === "revocation") {
    const idlPath = path.join(path.dirname(filePath), scenario.idl);
    const interfaceDef = loadAgentInterface(idlPath);
    const caller = new AgentRuntime({ id: "did:example:caller", interfaceDef });
    const executor = new AgentRuntime({ id: "did:example:executor", interfaceDef });

    executor.registerIntent("agent:PerformTask", async message => {
      const ctx = message.payload.ctx;
      if (ctx.revoked === true) {
        return { status: "revoked", reason: "Delegation revoked." };
      }
      return { status: "ok", output: message.payload.request.task };
    });

    const ctx = loadJson(path.join(path.dirname(filePath), scenario.delegationContext));
    const result = await caller.callMethod(executor, scenario.method, ctx, scenario.payload);
    const ok = result.status === scenario.expected.status;
    results.push({
      name: `scenario:${scenario.name}`,
      ok,
      error: ok ? null : `Expected status ${scenario.expected.status} but got ${result.status}`,
    });
    return results;
  }

  if (scenario.name === "cross-implementation-audit") {
    const record = loadJson(path.join(path.dirname(filePath), scenario.executionRecord));
    const rules = loadJson(path.join(ROOT, "validation-rules", "audit.json"));
    const errors = validateExecutionRecord(record, rules);
    const ok = errors.length === 0;
    results.push({
      name: `scenario:${scenario.name}`,
      ok,
      error: ok ? null : errors.join("; "),
    });
    return results;
  }

  if (scenario.name === "interop-js-runtime") {
    const idlPath = path.join(path.dirname(filePath), scenario.idl);
    const interfaceDef = loadAgentInterface(idlPath);
    const caller = new AgentRuntime({ id: "agent:A", interfaceDef });
    const executor = new AgentRuntime({ id: "agent:B", interfaceDef });
    const modulePath = path.join(path.dirname(filePath), scenario.generatedModule);
    const { createClient, registerHandlers } = require(modulePath);

    registerHandlers(executor, {
      proposeContract: data => ({
        status: "accepted",
        contractId: "TEST-1",
        counterparty: Array.isArray(data.parties) ? data.parties[0] : null,
      }),
      executePayment: payment => ({
        status: "paid",
        amount: payment.amount || 0,
      }),
    });

    const transport = createRuntimeTransport({ caller, target: executor });
    const client = createClient(transport);
    const result = await client[scenario.method](scenario.payload);
    const ok = result.status === scenario.expected.status;
    results.push({
      name: `scenario:${scenario.name}`,
      ok,
      error: ok ? null : `Expected status ${scenario.expected.status} but got ${result.status}`,
    });
    return results;
  }

  results.push({ name: `scenario:${scenario.name}`, ok: false, error: "Unknown scenario." });
  return results;
}

function formatResults(results, format) {
  const failed = results.filter(r => !r.ok);
  if (format === "junit") {
    const testCases = results.map(result => {
      if (result.ok) {
        return `  <testcase name="${result.name}" />`;
      }
      return `  <testcase name="${result.name}"><failure message="${escapeXml(result.error || "failure")}" /></testcase>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite tests="${results.length}" failures="${failed.length}">\n${testCases.join("\n")}\n</testsuite>`;
  }

  const lines = [];
  for (const result of results) {
    if (result.ok) {
      lines.push(`PASS ${result.name}`);
    } else {
      lines.push(`FAIL ${result.name} :: ${result.error}`);
    }
  }
  lines.push(`\nSummary: ${results.length - failed.length}/${results.length} passing`);
  return lines.join("\n");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  const args = process.argv.slice(2);
  const profileIndex = args.indexOf("--profile");
  const suiteIndex = args.indexOf("--suite");
  const scenarioIndex = args.indexOf("--scenario");
  const formatIndex = args.indexOf("--format");

  const profile = profileIndex >= 0 ? args[profileIndex + 1] : "all";
  const format = formatIndex >= 0 ? args[formatIndex + 1] : "text";
  const suite = suiteIndex >= 0 ? args[suiteIndex + 1] : null;
  const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] : null;

  const results = [];

  if (scenario) {
    const scenarioPath = path.isAbsolute(scenario) ? scenario : path.join(ROOT, scenario);
    results.push(...(await runScenario(scenarioPath)));
    console.log(formatResults(results, format));
    process.exit(results.some(r => !r.ok) ? 1 : 0);
  }

  const suiteRoot = suite ? (path.isAbsolute(suite) ? suite : path.join(ROOT, suite)) : null;
  const runAllSuites = !suiteRoot;

  if (runAllSuites || suiteRoot.includes("valid-idl")) {
    results.push(...runIdlVectors(path.join(ROOT, "vectors", "valid-idl"), true, profile));
  }
  if (runAllSuites || suiteRoot.includes("invalid-idl")) {
    results.push(...runIdlVectors(path.join(ROOT, "vectors", "invalid-idl"), false, profile));
  }
  if (runAllSuites || suiteRoot.includes("delegation-contexts")) {
    results.push(...runDelegationContextVectors(path.join(ROOT, "vectors", "delegation-contexts", "valid"), true));
    results.push(...runDelegationContextVectors(path.join(ROOT, "vectors", "delegation-contexts", "invalid"), false));
  }
  if (runAllSuites || suiteRoot.includes("execution-records")) {
    results.push(...runExecutionRecordVectors(path.join(ROOT, "vectors", "execution-records", "valid"), true));
    results.push(...runExecutionRecordVectors(path.join(ROOT, "vectors", "execution-records", "invalid"), false));
  }

  if (runAllSuites) {
    const scenarioFiles = collectFiles(path.join(ROOT, "scenarios")).filter(p => p.endsWith("scenario.json"));
    for (const scenarioFile of scenarioFiles) {
      results.push(...(await runScenario(scenarioFile)));
    }
  }

  console.log(formatResults(results, format));
  process.exit(results.some(r => !r.ok) ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
