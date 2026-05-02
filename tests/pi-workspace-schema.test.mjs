import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "pi-workspace.schema.json"), "utf8"));

function resolveRef(ref) {
  assert(ref.startsWith("#/"), `unsupported ref: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((value, key) => value[key.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
}

function typeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validate(value, node, location = "$") {
  if (node.$ref) return validate(value, resolveRef(node.$ref), location);

  const errors = [];

  if (node.oneOf) {
    const matches = node.oneOf.filter((candidate) => validate(value, candidate, location).valid);
    if (matches.length !== 1) errors.push(`${location}: expected exactly one oneOf match, got ${matches.length}`);
  }

  if (node.anyOf) {
    const matches = node.anyOf.filter((candidate) => validate(value, candidate, location).valid);
    if (matches.length === 0) errors.push(`${location}: expected at least one anyOf match`);
  }

  if (node.not && validate(value, node.not, location).valid) {
    errors.push(`${location}: matched forbidden schema`);
  }

  if (node.type && !typeMatches(value, node.type)) {
    return { valid: false, errors: [`${location}: expected ${node.type}`] };
  }

  if (node.enum && !node.enum.includes(value)) errors.push(`${location}: expected one of ${node.enum.join(", ")}`);
  if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${location}: too short`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(`${location}: pattern mismatch`);
  }

  if (Array.isArray(value)) {
    if (node.uniqueItems) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push(`${location}: duplicate array items`);
    }
    if (node.items) {
      value.forEach((item, index) => errors.push(...validate(item, node.items, `${location}[${index}]`).errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${location}: missing required property ${key}`);
    }

    if (node.additionalProperties === false) {
      const allowed = new Set(Object.keys(node.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`${location}: unknown property ${key}`);
      }
    }

    if (node.propertyNames) {
      for (const key of Object.keys(value)) {
        errors.push(...validate(key, node.propertyNames, `${location}.{propertyName:${key}}`).errors);
      }
    }

    for (const [key, propertySchema] of Object.entries(node.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], propertySchema, `${location}.${key}`).errors);
    }

    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      for (const [key, propertyValue] of Object.entries(value)) {
        errors.push(...validate(propertyValue, node.additionalProperties, `${location}.${key}`).errors);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function assertValid(value, label) {
  const result = validate(value, schema);
  assert.equal(result.valid, true, `${label} should be valid:\n${result.errors.join("\n")}`);
}

function assertInvalid(value, label) {
  const result = validate(value, schema);
  assert.equal(result.valid, false, `${label} should be invalid`);
}

test("schema itself is valid JSON with expected id", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "https://raw.githubusercontent.com/imeredith/pi-multifolder-sandbox/main/pi-workspace.schema.json");
});

test("workspace examples validate against schema", () => {
  const examplesDir = path.join(root, "examples", "workspaces");
  const files = fs.readdirSync(examplesDir).filter((file) => file.endsWith(".json"));
  assert(files.length >= 4);

  for (const file of files) {
    const value = JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf8"));
    assertValid(value, file);
  }
});

test("schema accepts an empty config object", () => {
  assertValid({}, "empty config");
});

test("schema rejects invalid mount configs", () => {
  assertInvalid({ mounts: [{ hostPath: "../x" }] }, "missing mountPath/guestPath");
  assertInvalid({ mounts: [{ hostPath: "../x", mountPath: "relative" }] }, "relative mountPath");
  assertInvalid({ mounts: [{ hostPath: "../x", mountPath: "/workspace" }] }, "reserved workspace mount");
  assertInvalid({ mounts: [{ hostPath: "../x", mountPath: "/x", extra: true }] }, "extra mount property");
});

test("schema rejects invalid host command configs", () => {
  assertInvalid({ hostCommands: [""] }, "empty command string");
  assertInvalid({ hostCommands: [{ command: "docker", match: "glob" }] }, "invalid match mode");
  assertInvalid({ hostCommands: [{ match: "prefix" }] }, "missing command");
  assertInvalid({ hostCommands: [{ command: "docker", extra: true }] }, "extra host command property");
});
