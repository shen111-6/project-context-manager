import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { operate } from "../dist/packages/engine/src/index.js";

const toolRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = path.join(toolRoot, "outputs/demo");
await mkdir(outputRoot, { recursive: true });
const runRoot = await mkdtemp(path.join(outputRoot, "run-"));
const project = path.join(runRoot, "project");
await mkdir(project);
const exec = promisify(execFile);
const git = (argv) =>
  exec("git", argv, {
    cwd: project,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
const results = [];
const startedAt = new Date().toISOString();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const task = {
  goal: "为示例计数器实现持久化与重启恢复",
  current: "saveCounter 仍是占位实现，尚未完成持久化",
  next: "实现文件持久化，并运行重启恢复测试",
  workInProgress: ["counter.ts：持久化", "重启恢复测试"],
};
async function run(label, operation, extra = {}) {
  const start = performance.now();
  const result = await operate({
    protocolVersion: 1,
    requestId: randomUUID(),
    operation,
    projectPath: project,
    ...extra,
  });
  const elapsedMs = Math.round(performance.now() - start);
  results.push({ label, elapsedMs, result });
  await writeFile(
    path.join(runRoot, `${results.length}-${operation}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `${label}: ${result.operationOutcome}; ${result.evidenceAssessment}; ${elapsedMs} ms`,
  );
  return result;
}
try {
  await git(["init"]);
  await git(["config", "user.name", "PCM Demo"]);
  await git(["config", "user.email", "demo@example.invalid"]);
  await writeFile(
    path.join(project, "counter.ts"),
    "// TODO persistence\nexport function saveCounter(value: number) { return value; }\n",
  );
  await writeFile(
    path.join(project, "README.md"),
    "# Synthetic counter demo\nPersist counters across restarts. Keep the public signature.\n",
  );
  await git(["add", "counter.ts", "README.md"]);
  await git([
    "-c",
    "core.hooksPath=",
    "commit",
    "-m",
    "synthetic demo baseline",
  ]);
  const missing = await run("缺少记录时准确失败", "restore");
  assert.equal(missing.operationOutcome, "failed");
  assert.ok(missing.findings.some((f) => f.code === "NO_RECORD"));
  await assert.rejects(
    access(path.join(project, "docs/project-context/pcm/index.json")),
  );
  const checkpoint = await run("保存真实开发断点", "checkpoint", { task });
  assert.equal(checkpoint.operationOutcome, "success");
  const handoff = await run("生成不可变交接记录", "handoff");
  assert.equal(handoff.operationOutcome, "success");
  assert.equal(handoff.snapshot.parentId, checkpoint.snapshot.id);
  const protectedFiles = [
    "counter.ts",
    ".git/index",
    "docs/project-context/pcm/index.json",
    ...handoff.artifacts.map((file) => path.relative(project, file)),
  ];
  const hashes = async () =>
    Promise.all(
      protectedFiles.map(async (file) => ({
        file,
        sha256: sha(await readFile(path.join(project, file))),
      })),
    );
  const before = await hashes();
  const restored = await run("恢复任务并保留只读现场", "restore");
  assert.deepEqual(restored.snapshot.task, task);
  assert.equal(restored.nextAction, task.next);
  assert.equal(restored.operationOutcome, "partial");
  assert.deepEqual(await hashes(), before);
  await writeFile(
    path.join(project, "counter.ts"),
    "// changed after handoff: persistence still incomplete\nexport function saveCounter(value: number) { return value + 1; }\n",
  );
  const drift = await run("识别记录之后的源码变化", "verify");
  assert.equal(drift.evidenceAssessment, "Drift Detected");
  assert.ok(
    drift.findings.some(
      (f) => f.code === "FILE_DRIFT" && f.path === "counter.ts",
    ),
  );
  const jsonArtifact = handoff.artifacts.find((file) => file.endsWith(".json"));
  assert.ok(jsonArtifact);
  await writeFile(jsonArtifact, "{}\n"); // Only corrupt this isolated synthetic fixture.
  const tampered = await run("拒绝被篡改的交接记录", "restore");
  assert.equal(tampered.operationOutcome, "failed");
  assert.ok(tampered.findings.some((f) => f.code === "RECORD_CHANGED"));
  const abort = new AbortController();
  abort.abort();
  const cancelled = await run("已取消请求不执行操作", "status", {
    signal: abort.signal,
  });
  assert.equal(cancelled.operationOutcome, "cancelled");
  const version = JSON.parse(
    await readFile(path.join(toolRoot, "package.json"), "utf8"),
  ).version;
  const summary = {
    schemaVersion: 1,
    kind: "synthetic-offline-demo",
    version,
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: { platform: process.platform, node: process.version },
    status: "Passed",
    readonlyEvidence: before,
    scenarios: results.map(({ label, elapsedMs, result }) => ({
      label,
      elapsedMs,
      operation: result.operation,
      outcome: result.operationOutcome,
      assessment: result.evidenceAssessment,
      findings: result.findings.map((f) => f.code),
    })),
    limitations: [
      "合成演示，不是用户研究、性能基准或准确率评估",
      "不调用 Agent，不执行 GUI",
      "只读断言覆盖列出的文件及 Git index",
      "取消场景为预先取消请求，不代表运行中 GUI 取消验收",
    ],
  };
  await writeFile(
    path.join(runRoot, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  const rows = summary.scenarios
    .map(
      (s) => `| ${s.label} | ${s.outcome} | ${s.assessment} | ${s.elapsedMs} |`,
    )
    .join("\n");
  await writeFile(
    path.join(runRoot, "report.md"),
    `# 离线端到端演示\n\n版本：${version}；平台：${process.platform}；Node：${process.version}。\n\n结果：Passed。每个场景均有实际操作结果和断言；原始 JSON 与合成项目保留在本目录。\n\n| 场景 | 操作结果 | 证据判断 | 本次毫秒 |\n| --- | --- | --- | --- |\n${rows}\n\n恢复前后的 ${before.length} 项文件/Git index SHA256 相同。\n\n${summary.limitations.map((s) => `- ${s}`).join("\n")}\n`,
  );
  console.log(`演示通过。可复查报告：${path.join(runRoot, "report.md")}`);
} catch (error) {
  await writeFile(
    path.join(runRoot, "failure.json"),
    JSON.stringify(
      {
        status: "Failed",
        startedAt,
        error: error instanceof Error ? error.message : String(error),
        completedScenarios: results.length,
      },
      null,
      2,
    ) + "\n",
  );
  console.error(`演示失败，证据保留于 ${runRoot}`);
  throw error;
}
