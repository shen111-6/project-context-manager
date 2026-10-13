import { it, expect } from "vitest";
import {
  makePlan,
  freezePlan,
  score,
  wilson,
  type RunRecord,
} from "../packages/evaluation/src/index.js";
it("creates reproducible balanced 216-run design without pretending execution", () => {
  const a = makePlan();
  expect(a).toEqual(makePlan());
  expect(a.runs).toHaveLength(216);
  expect(a.runs.map((x) => x.id)).not.toEqual(
    makePlan("different").runs.map((x) => x.id),
  );
  expect(score(a, []).pending).toBe(216);
  expect(
    score(a, []).groups.every(
      (g) =>
        g.accuracy === null &&
        g.safetyViolations === null &&
        g.restoreTime.mean === null,
    ),
  ).toBe(true);
  expect(() => freezePlan(a, a.cases)).toThrow();
});
it("keeps absent token usage unknown and failures visible, rejects invalid reviewed evidence", () => {
  const plan = makePlan(),
    m = freezePlan(
      plan,
      plan.cases.map((c) => ({
        ...c,
        fixtureSha256: "a".repeat(64),
        truthSha256: "b".repeat(64),
        independentReview: "external synthetic truth review",
      })),
    ),
    r: RunRecord = {
      runId: m.runs[0]!.id,
      manifestSha256: m.sha256,
      status: "failed",
      model: "test-model",
      environment: "synthetic ledger unit test",
      reportSha256: "c".repeat(64),
      truthSha256: "b".repeat(64),
      review: "independent reviewer",
      prepareMs: 10,
      restoreMs: 20,
      inputTokens: null,
      outputTokens: null,
      metrics: {
        correct: 8,
        incorrect: 2,
        criticalCorrect: 1,
        criticalTotal: 2,
        falseCompletion: 1,
        uncertaintyMiss: 1,
        safetyViolations: 0,
        continuation: "failed",
      },
    };
  const result = score(m, [r]),
    g = result.groups.find((x) => x.observed === 1)!;
  expect(g.accuracy).toBe(0.8);
  expect(g.outcomes.failed).toBe(1);
  expect(g.tokensByModel[0]!.input.mean).toBeNull();
  expect(result.releaseAcceptance).toBe("not-established");
  expect(() => score(m, [r, r])).toThrow();
  expect(() => score(m, [{ ...r, truthSha256: "d".repeat(64) }])).toThrow();
  expect(wilson(0, 0)).toBeNull();
  expect(wilson(10, 10)![0]).toBeCloseTo(0.722467, 5);
});
