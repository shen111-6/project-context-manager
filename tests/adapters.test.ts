import { it, expect } from "vitest";
import {
  validateCandidate,
  codexArgs,
  analyze,
} from "../packages/adapters/src/index.js";
import type { Baseline } from "../packages/protocol/src/index.js";
const baseline = {
  files: [{ path: "app.ts", sha256: "a".repeat(64), state: "present" }],
} as Baseline;
const candidate = {
  goal: "feature",
  current: "WIP",
  next: "inspect wiring",
  workInProgress: ["app.ts"],
  claims: [
    {
      text: "implemented",
      implementation: "implemented-unverified",
      sources: [{ path: "app.ts", sha256: "b".repeat(64) }],
      uncertainty: null,
    },
  ],
  constraints: [],
  unknowns: [],
};
it("downgrades mismatched evidence and rejects verified model declarations", () => {
  const a = validateCandidate(candidate, baseline);
  expect(a.candidate?.claims[0]?.implementation).toBe("uncertain");
  expect(
    validateCandidate(
      {
        ...candidate,
        claims: [{ ...candidate.claims[0], implementation: "verified" }],
      },
      baseline,
    ).candidate,
  ).toBeUndefined();
});
it("requires independent invocation authority and uses nonmutating isolated mode", async () => {
  await expect(
    analyze({ host: "codex", projectPath: ".", authorized: false, rules: "" }),
  ).rejects.toThrow("授权");
  const args = codexArgs("schema.json");
  expect(args).toContain("read-only");
  expect(args).toContain("--ignore-user-config");
  expect(args).toContain("shell_tool");
  expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
});
