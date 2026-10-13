import { Ajv2020 } from "ajv/dist/2020.js";

export type Purpose = "checkpoint" | "context" | "handoff";
export type Assessment =
  | "Verified"
  | "Verified With Gaps"
  | "Drift Detected"
  | "Insufficient Evidence";
export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  action: string;
  path?: string;
}
export interface FileEvidence {
  id: string;
  path: string;
  state: "present" | "missing" | "excluded" | "unreadable";
  sha256: string | null;
  reason: string | null;
  index: { mode: string; oid: string; stage: number }[];
  head: { mode: string; oid: string } | null;
}
export interface Baseline {
  repositoryId: string;
  worktreeId: string;
  branch: string | null;
  head: string | null;
  gitState: "available" | "unborn" | "not-git" | "unavailable";
  reason: string | null;
  workingTree: "clean" | "dirty" | "unknown";
  status: string;
  scope: string[];
  exclusions: string[];
  coverage: "scoped" | "incomplete";
  stable: boolean;
  fingerprint: string;
  files: FileEvidence[];
}
export interface Claim {
  id: string;
  text: string;
  source: "human" | "agent" | "legacy";
  implementation:
    "partial" | "planned" | "uncertain" | "implemented-unverified" | "verified";
  evidenceIds: string[];
  validationIds: string[];
  uncertainty: string | null;
}
export interface ValidationRecord {
  id: string;
  argv: string[];
  cwd: string;
  status: "Passed" | "Failed" | "Not run" | "Blocked" | "Incomplete";
  source: "imported" | "local-run";
  baselineFingerprint: string;
  exitCode: number | null;
  recordedAt: string;
  scope: string[];
  limitation: string;
}
export interface Snapshot {
  schema_version: 1;
  id: string;
  parentId: string | null;
  toolVersion: string;
  purpose: Purpose;
  recordedAt: string;
  baseline: Baseline;
  task: {
    goal: string | null;
    current: string | null;
    next: string | null;
    workInProgress: string[];
  };
  claims: Claim[];
  validations: ValidationRecord[];
  constraints: { text: string; source: string }[];
  gaps: Finding[];
}
export interface OperationResult {
  protocolVersion: 1;
  requestId: string;
  operation: string;
  operationOutcome: "success" | "partial" | "failed" | "cancelled";
  evidenceAssessment: Assessment;
  handoffReadiness:
    "Ready" | "Ready With Gaps" | "Not Ready" | "Not applicable";
  findings: Finding[];
  artifacts: string[];
  nextAction: string;
  baseline?: Baseline;
  snapshot?: Snapshot;
}
export type Operation =
  | "status"
  | "checkpoint"
  | "compress"
  | "handoff"
  | "restore"
  | "verify"
  | "health-check";
export interface OperationRequest {
  protocolVersion: 1;
  requestId: string;
  operation: Operation;
  projectPath: string;
  scope?: string[];
  storePath?: string;
  snapshotId?: string;
  expectedRevision?: string | null;
  task?: Snapshot["task"];
  signal?: AbortSignal;
}
export interface OperationEvent {
  requestId: string;
  type:
    | "operationStarted"
    | "phaseChanged"
    | "findingAdded"
    | "artifactPublished"
    | "operationFinished";
  message: string;
}
const str = { type: "string", maxLength: 8192 };
const text = { type: "string", minLength: 1, maxLength: 8192 };
const nullable = (s: object) => ({ anyOf: [s, { type: "null" }] });
const arr = (items: object) => ({ type: "array", items, maxItems: 20000 });
const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const values = (...v: string[]) => ({ type: "string", enum: v });
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const id = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,100}$" };
const finding = {
  ...obj({
    code: text,
    severity: values("info", "warning", "error"),
    message: text,
    action: text,
    path: str,
  }),
  required: ["code", "severity", "message", "action"],
};
export const snapshotSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:pcm:snapshot:1",
  ...obj({
    schema_version: { const: 1 },
    id,
    parentId: nullable(id),
    toolVersion: text,
    purpose: values("checkpoint", "context", "handoff"),
    recordedAt: text,
    baseline: obj({
      repositoryId: hash,
      worktreeId: hash,
      branch: nullable(text),
      head: nullable(text),
      gitState: values("available", "unborn", "not-git", "unavailable"),
      reason: nullable(text),
      workingTree: values("clean", "dirty", "unknown"),
      status: str,
      scope: arr(text),
      exclusions: arr(text),
      coverage: values("scoped", "incomplete"),
      stable: { type: "boolean" },
      fingerprint: hash,
      files: arr(
        obj({
          id,
          path: text,
          state: values("present", "missing", "excluded", "unreadable"),
          sha256: nullable(hash),
          reason: nullable(text),
          index: arr(
            obj({
              mode: text,
              oid: text,
              stage: { type: "integer", minimum: 0, maximum: 3 },
            }),
          ),
          head: nullable(obj({ mode: text, oid: text })),
        }),
      ),
    }),
    task: obj({
      goal: nullable(text),
      current: nullable(text),
      next: nullable(text),
      workInProgress: arr(text),
    }),
    claims: arr(
      obj({
        id,
        text,
        source: values("human", "agent", "legacy"),
        implementation: values(
          "partial",
          "planned",
          "uncertain",
          "implemented-unverified",
          "verified",
        ),
        evidenceIds: arr(id),
        validationIds: arr(id),
        uncertainty: nullable(text),
      }),
    ),
    validations: arr(
      obj({
        id,
        argv: arr(text),
        cwd: text,
        status: values("Passed", "Failed", "Not run", "Blocked", "Incomplete"),
        source: values("imported", "local-run"),
        baselineFingerprint: hash,
        exitCode: nullable({ type: "integer" }),
        recordedAt: text,
        scope: arr(text),
        limitation: str,
      }),
    ),
    constraints: arr(obj({ text, source: text })),
    gaps: arr(finding),
  }),
};
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(snapshotSchema);
export function isRelativePath(p: string): boolean {
  return (
    p.length > 0 &&
    p.length <= 4096 &&
    !/^[\\/]|[\x00-\x1f\\:]/.test(p) &&
    !p
      .split("/")
      .some(
        (x) =>
          x === ".." ||
          x === "" ||
          (x === "." && p !== ".") ||
          (x !== "." &&
            (/[ .]$/.test(x) ||
              /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(x))),
      )
  );
}
export function validateSnapshot(input: unknown): {
  valid: boolean;
  errors: string[];
} {
  if (!validate(input))
    return {
      valid: false,
      errors: (validate.errors ?? []).map(
        (e) => `${e.instancePath || "/"} ${e.message}`,
      ),
    };
  const s = input as unknown as Snapshot,
    errors: string[] = [];
  const files = new Set(s.baseline.files.map((f) => f.id)),
    validations = new Map(s.validations.map((v) => [v.id, v]));
  if (
    files.size !== s.baseline.files.length ||
    validations.size !== s.validations.length ||
    new Set(s.claims.map((c) => c.id)).size !== s.claims.length
  )
    errors.push("Duplicate evidence, validation or claim IDs");
  if (!s.baseline.scope.length) errors.push("Scope must not be empty");
  for (const p of [
    ...s.baseline.scope,
    ...s.baseline.exclusions,
    ...s.baseline.files.map((f) => f.path),
    ...s.validations.flatMap((v) => [v.cwd, ...v.scope]),
  ])
    if (!isRelativePath(p)) errors.push("Unsafe relative path");
  for (const f of s.baseline.files) {
    if (f.state === "present" && (!f.sha256 || f.reason !== null))
      errors.push(`Invalid present evidence: ${f.id}`);
    if (f.state !== "present" && (!f.reason || f.sha256 !== null))
      errors.push(`Missing uncertainty reason: ${f.id}`);
  }
  if (s.baseline.gitState !== "available" && !s.baseline.reason)
    errors.push("Nonstandard Git state requires reason");
  if (
    s.baseline.workingTree === "clean" &&
    (!s.baseline.stable ||
      s.baseline.coverage !== "scoped" ||
      s.baseline.gitState !== "available")
  )
    errors.push(
      "Cannot assert clean with unavailable, incomplete or unstable baseline",
    );
  if (!Number.isFinite(Date.parse(s.recordedAt)))
    errors.push("Invalid recording time");
  if (s.claims.some((c) => c.implementation === "uncertain" && !c.uncertainty))
    errors.push("Unknown claim requires a reason");
  for (const v of s.validations) {
    if (!Number.isFinite(Date.parse(v.recordedAt)))
      errors.push(`Invalid validation time: ${v.id}`);
    if (v.status !== "Passed" && !v.limitation.trim())
      errors.push(`Validation gap requires a reason: ${v.id}`);
    if (
      ["Not run", "Blocked", "Incomplete"].includes(v.status) &&
      v.exitCode !== null &&
      v.status !== "Incomplete"
    )
      errors.push(`Unexecuted validation cannot have exit code: ${v.id}`);
    if (v.status === "Passed" && v.exitCode !== 0)
      errors.push(`Passed requires exit 0: ${v.id}`);
    if (v.status === "Failed" && (v.exitCode === null || v.exitCode === 0))
      errors.push(`Failed requires nonzero exit: ${v.id}`);
  }
  for (const c of s.claims) {
    if (
      c.evidenceIds.some((id) => !files.has(id)) ||
      c.validationIds.some((id) => !validations.has(id))
    )
      errors.push(`Dangling evidence reference: ${c.id}`);
    // Schema cannot authenticate imported/local-run labels. Semantic completion is never certified by this validator.
    if (c.implementation === "verified") {
      if (!c.evidenceIds.length || !c.validationIds.length)
        errors.push(`Verified claim lacks evidence: ${c.id}`);
      if (
        c.evidenceIds.some(
          (id) =>
            s.baseline.files.find((f) => f.id === id)?.state !== "present",
        )
      )
        errors.push(`Unavailable claim evidence: ${c.id}`);
      if (
        c.validationIds.some((id) => {
          const v = validations.get(id);
          return (
            !v ||
            v.status !== "Passed" ||
            v.baselineFingerprint !== s.baseline.fingerprint
          );
        })
      )
        errors.push(`Unsupported verified claim: ${c.id}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
