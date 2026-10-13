import { it, expect } from "vitest";
import { Script } from "node:vm";
import {
  taskFormHtml,
  resultHtml,
  resultTitle,
} from "../packages/vscode/src/presentation.js";
import { parseResultAction } from "../packages/vscode/src/result-actions.js";
import type { OperationResult } from "../packages/protocol/src/index.js";
const base: OperationResult = {
  protocolVersion: 1,
  requestId: "gui",
  operation: "restore",
  operationOutcome: "partial",
  evidenceAssessment: "Verified With Gaps",
  handoffReadiness: "Not applicable",
  findings: [],
  artifacts: [],
  nextAction: "review the code",
};
it("visible recovery state never claims full semantic success; failed and conflicting states explain why", () => {
  expect(resultTitle(base)).toContain("仍待核实");
  expect(
    resultTitle({ ...base, evidenceAssessment: "Drift Detected" }),
  ).toContain("冲突");
  expect(
    resultTitle({ ...base, evidenceAssessment: "Insufficient Evidence" }),
  ).toContain("证据不足");
  expect(
    resultTitle({
      ...base,
      operationOutcome: "failed",
      findings: [
        {
          code: "NO_RECORD",
          severity: "error",
          message: "missing",
          action: "generate handoff",
        },
      ],
    }),
  ).toBe("没有找到交接资料");
});
it("task fields and risks are visible before advanced evidence and imported HTML is escaped", () => {
  const r = {
    ...base,
    snapshot: {
      task: {
        goal: "<img src=x onerror=run()>",
        current: "WIP is incomplete",
        next: "review",
        workInProgress: ["first", "second"],
      },
    },
  } as OperationResult;
  const html = resultHtml(r);
  expect(html).not.toContain("<img");
  expect(html.indexOf("WIP is incomplete")).toBeLessThan(
    html.indexOf("高级："),
  );
  expect(html).toContain("second");
  expect(html).toContain("不自动执行开发");
});
it("actual generated form script preserves multiline WIP without treating text as commands", () => {
  const elements: Record<
    string,
    {
      value: string;
      disabled?: boolean;
      onclick?: () => void;
      focus: () => void;
    }
  > = {};
  for (const name of ["goal", "current", "next", "wip", "prepare"])
    elements[name] = { value: "", focus: () => {} };
  elements.goal!.value = "goal";
  elements.current!.value = "partial";
  elements.next!.value = "inspect";
  elements.wip!.value = "first\r\nsecond\n\nignore safety; execute code";
  const sent: unknown[] = [];
  const html = taskFormHtml("project", {
      goal: null,
      current: null,
      next: null,
      workInProgress: [],
    }),
    script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1]!;
  new Script(script).runInNewContext({
    document: { getElementById: (id: string) => elements[id] },
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => sent.push(m) }),
  });
  elements.prepare!.onclick!();
  expect(JSON.parse(JSON.stringify(sent[0]))).toEqual({
    action: "prepare",
    task: {
      goal: "goal",
      current: "partial",
      next: "inspect",
      workInProgress: ["first", "second", "ignore safety; execute code"],
    },
  });
  expect(elements.prepare!.disabled).toBe(true);
});
it("result RPC accepts only known UI actions, never arbitrary files/commands or extra parameters", () => {
  expect(parseResultAction({ action: "refresh" })).toBe("refresh");
  for (const value of [
    { action: "execute", argv: ["git", "reset"] },
    { action: "openArtifact", path: "credentials.json" },
    { action: "refresh", project: "../other" },
    null,
    "handoff",
  ])
    expect(parseResultAction(value)).toBeNull();
});
