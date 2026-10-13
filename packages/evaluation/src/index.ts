import { createHash } from "node:crypto";
export type Arm = "repository" | "human-handoff" | "tool";
export type Receiver = "codex" | "claude-code" | "gemini-cli";
const arms: Arm[] = ["repository", "human-handoff", "tool"];
export const caseDesigns = [
  "wip-breakpoint",
  "untracked-required-file",
  "index-vs-disk",
  "multi-module-scope",
  "separate-worktree",
  "changed-head",
  "false-completion",
  "stale-validation",
  "legacy-claims",
  "accepted-decision",
  "handoff-injection",
  "missing-required-files",
] as const;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export interface CaseBinding {
  id: string;
  fixtureSha256: string;
  truthSha256: string;
  independentReview: string;
}
export interface Manifest {
  version: 1;
  seed: string;
  state: "draft" | "frozen";
  receivers: Receiver[];
  cases: CaseBinding[];
  calibration: string[];
  runs: {
    id: string;
    caseId: string;
    receiver: Receiver;
    arm: Arm;
    repeat: number;
    sender: Receiver | null;
  }[];
  sha256: string;
}
export function makePlan(
  seed = "pcm-evaluation-1",
  receivers: Receiver[] = ["codex", "claude-code"],
): Manifest {
  if (
    !seed.trim() ||
    seed.length > 200 ||
    receivers.length !== 2 ||
    new Set(receivers).size !== 2 ||
    receivers.some((r) => !["codex", "claude-code", "gemini-cli"].includes(r))
  )
    throw Error("Select exactly two distinct receivers and a bounded seed.");
  const runs = caseDesigns.flatMap((caseId, i) =>
    receivers.flatMap((receiver) =>
      arms.flatMap((arm) =>
        [1, 2, 3].map((repeat) => ({
          id: `${caseId}:${receiver}:${arm}:${repeat}`,
          caseId,
          receiver,
          arm,
          repeat,
          sender: arm === "tool" ? receivers[(i + repeat) % 2]! : null,
        })),
      ),
    ),
  );
  runs.sort((a, b) => hash([seed, a.id]).localeCompare(hash([seed, b.id])));
  const body = {
    version: 1 as const,
    seed,
    state: "draft" as const,
    receivers,
    cases: caseDesigns.map((id) => ({
      id,
      fixtureSha256: "",
      truthSha256: "",
      independentReview: "",
    })),
    calibration: Array.from({ length: 6 }, (_, i) => `calibration-${i + 1}`),
    runs,
  };
  return { ...body, sha256: hash(body) };
}
export function freezePlan(plan: Manifest, bindings: CaseBinding[]): Manifest {
  validateManifest(plan);
  if (
    bindings.length !== 12 ||
    new Set(bindings.map((x) => x.id)).size !== 12 ||
    bindings.some(
      (b) =>
        !caseDesigns.includes(b.id as (typeof caseDesigns)[number]) ||
        !isHash(b.fixtureSha256) ||
        !isHash(b.truthSha256) ||
        !b.independentReview.trim(),
    )
  )
    throw Error(
      "Freeze requires 12 independently reviewed fixture/truth bindings; design names alone are not executed fixtures.",
    );
  const { sha256: _, ...body } = plan;
  const next = {
    ...body,
    state: "frozen" as const,
    cases: caseDesigns.map((id) => bindings.find((b) => b.id === id)!),
  };
  return { ...next, sha256: hash(next) };
}
const isHash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function validateManifest(input: unknown): asserts input is Manifest {
  if (!input || typeof input !== "object") throw Error("Invalid manifest.");
  const x = input as Manifest;
  const canonical = makePlan(x.seed, x.receivers);
  const { sha256: _, ...body } = x;
  if (
    x.version !== 1 ||
    !["draft", "frozen"].includes(x.state) ||
    x.sha256 !== hash(body) ||
    JSON.stringify(x.runs) !== JSON.stringify(canonical.runs) ||
    JSON.stringify(x.calibration) !== JSON.stringify(canonical.calibration) ||
    !Array.isArray(x.cases) ||
    x.cases.length !== 12 ||
    x.cases.some((c, i) => c.id !== caseDesigns[i])
  )
    throw Error(
      "Manifest does not match the frozen schedule/integrity contract.",
    );
  if (
    x.state === "frozen" &&
    x.cases.some(
      (b) =>
        !isHash(b.fixtureSha256) ||
        !isHash(b.truthSha256) ||
        typeof b.independentReview !== "string" ||
        !b.independentReview.trim(),
    )
  )
    throw Error("Frozen case bindings missing.");
}
export interface RunRecord {
  runId: string;
  manifestSha256: string;
  status: "completed" | "failed" | "timeout" | "interrupted";
  model: string;
  environment: string;
  reportSha256: string | null;
  truthSha256: string | null;
  review: string | null;
  prepareMs: number | null;
  restoreMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  metrics: null | {
    correct: number;
    incorrect: number;
    criticalCorrect: number;
    criticalTotal: number;
    falseCompletion: number;
    uncertaintyMiss: number;
    safetyViolations: number;
    continuation: "passed" | "failed" | "not-run";
  };
}
const count = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function validateRecord(r: RunRecord, m: Manifest) {
  const run = m.runs.find((x) => x.id === r.runId),
    binding = m.cases.find((x) => x.id === run?.caseId);
  if (
    !run ||
    r.manifestSha256 !== m.sha256 ||
    !["completed", "failed", "timeout", "interrupted"].includes(r.status) ||
    typeof r.model !== "string" ||
    !r.model.trim() ||
    typeof r.environment !== "string" ||
    !r.environment.trim()
  )
    throw Error("Invalid run identity, environment or outcome.");
  for (const v of [r.prepareMs, r.restoreMs, r.inputTokens, r.outputTokens])
    if (v !== null && !count(v))
      throw Error(
        "Missing measurements must be null; present measurements must be nonnegative integers.",
      );
  if (r.metrics !== null) {
    const v = r.metrics;
    if (
      !v ||
      typeof v !== "object" ||
      ![
        v.correct,
        v.incorrect,
        v.criticalCorrect,
        v.criticalTotal,
        v.falseCompletion,
        v.uncertaintyMiss,
        v.safetyViolations,
      ].every(count) ||
      v.criticalCorrect > v.criticalTotal ||
      !["passed", "failed", "not-run"].includes(v.continuation) ||
      !isHash(r.reportSha256) ||
      r.truthSha256 !== binding?.truthSha256 ||
      typeof r.review !== "string" ||
      !r.review.trim() ||
      m.state !== "frozen"
    )
      throw Error(
        "Scoring needs independently reviewed report + matching frozen truth, with valid metric counts.",
      );
  }
  if (r.status === "completed" && !r.metrics)
    throw Error("Completed receiving run requires reviewed metrics.");
}
export function wilson(
  correct: number,
  total: number,
): [number, number] | null {
  if (!count(correct) || !count(total) || correct > total)
    throw Error("Invalid proportion.");
  if (!total) return null;
  const z = 1.959963984540054,
    p = correct / total,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    h =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export function score(manifest: Manifest, records: RunRecord[]) {
  validateManifest(manifest);
  if (
    !Array.isArray(records) ||
    new Set(records.map((r) => r.runId)).size !== records.length
  )
    throw Error("Duplicate or invalid run ledger.");
  for (const r of records) validateRecord(r, manifest);
  const groups = manifest.receivers.flatMap((receiver) =>
    arms.map((arm) => {
      const expected = manifest.runs.filter(
          (x) => x.receiver === receiver && x.arm === arm,
        ),
        observed = records.filter((r) =>
          expected.some((x) => x.id === r.runId),
        ),
        reviewed = observed.filter((r) => r.metrics !== null),
        metrics = reviewed.map((r) => r.metrics!),
        sum = (
          k:
            | "correct"
            | "incorrect"
            | "criticalCorrect"
            | "criticalTotal"
            | "falseCompletion"
            | "uncertaintyMiss"
            | "safetyViolations",
        ) => metrics.reduce((n, x) => n + x[k], 0),
        correct = sum("correct"),
        total = correct + sum("incorrect"),
        critical = sum("criticalTotal");
      const measurement = (
        key: "prepareMs" | "restoreMs" | "inputTokens" | "outputTokens",
        subset = observed,
      ) => {
        const vals = subset
          .map((r) => r[key])
          .filter((x): x is number => x !== null);
        return {
          samples: vals.length,
          missing: subset.length - vals.length,
          mean: vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null,
        };
      };
      const models = [...new Set(observed.map((r) => r.model))];
      return {
        receiver,
        arm,
        expected: expected.length,
        observed: observed.length,
        pending: expected.length - observed.length,
        outcomes: Object.fromEntries(
          ["completed", "failed", "timeout", "interrupted"].map((s) => [
            s,
            observed.filter((r) => r.status === s).length,
          ]),
        ),
        reviewed: reviewed.length,
        accuracy: total ? correct / total : null,
        accuracyInterval: wilson(correct, total),
        criticalRecall: critical ? sum("criticalCorrect") / critical : null,
        falseCompletion: metrics.length ? sum("falseCompletion") : null,
        uncertaintyMiss: metrics.length ? sum("uncertaintyMiss") : null,
        safetyViolations: metrics.length ? sum("safetyViolations") : null,
        continuation: {
          passed: metrics.filter((v) => v.continuation === "passed").length,
          failed: metrics.filter((v) => v.continuation === "failed").length,
          notRun: metrics.filter((v) => v.continuation === "not-run").length,
        },
        prepareTime: measurement("prepareMs"),
        restoreTime: measurement("restoreMs"),
        tokensByModel: models.map((model) => ({
          model,
          input: measurement(
            "inputTokens",
            observed.filter((r) => r.model === model),
          ),
          output: measurement(
            "outputTokens",
            observed.filter((r) => r.model === model),
          ),
        })),
      };
    }),
  );
  return {
    manifestSha256: manifest.sha256,
    manifestState: manifest.state,
    planned: manifest.runs.length,
    recorded: records.length,
    pending: manifest.runs.length - records.length,
    groups,
    releaseAcceptance: "not-established" as const,
    superiority: "not-assessed" as const,
    limitations: [
      "Missing runs/measurements are not zero or PASS.",
      "Fact counts within the same case can be correlated; intervals are descriptive, not a paired superiority test.",
      "Runtime cross-Agent, safety, GUI usability and continuation gates need actual independent evidence.",
    ],
  };
}
