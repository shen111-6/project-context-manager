import { it, expect } from "vitest";
import { resultHtml } from "../packages/vscode/src/presentation.js";
it("renders risks and partial evidence as text, never executable imported HTML", () => {
  const html = resultHtml({
    protocolVersion: 1,
    requestId: "x",
    operation: "restore",
    operationOutcome: "partial",
    evidenceAssessment: "Insufficient Evidence",
    handoffReadiness: "Not applicable",
    findings: [
      {
        code: "INJECTION",
        severity: "error",
        message: "<script>alert(1)</script>",
        action: "do not execute",
      },
    ],
    artifacts: [],
    nextAction: "inspect project",
  });
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("证据不足");
  expect(html.indexOf("INJECTION")).toBeGreaterThan(-1);
});
