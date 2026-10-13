import { mkdir, writeFile, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  operate,
  prepare,
  publish,
  readBounded,
} from "../packages/engine/src/index.js";
import { analyze } from "../packages/adapters/src/index.js";
if (!process.argv.includes("--allow-agent-calls"))
  throw Error(
    "This manual acceptance script sends synthetic text to the independently logged-in Codex CLI. Explicitly pass --allow-agent-calls; raw candidates require independent review, not automatic PASS.",
  );
const toolRoot = fileURLToPath(new URL("..", import.meta.url));
const root = path.join(toolRoot, "work/acceptance-next", randomUUID()),
  exec = promisify(execFile);
await mkdir(root, { recursive: true });
const git = async (args: string[]) =>
  exec("git", args, {
    cwd: root,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
await git(["init"]);
await git(["config", "user.name", "Fixture"]);
await git(["config", "user.email", "fixture@example.invalid"]);
await writeFile(
  path.join(root, "counter.ts"),
  "// TODO: wire persistence. This implementation is incomplete.\nexport function saveCounter(value: number) { return value; }\n",
);
await writeFile(
  path.join(root, "README.md"),
  "# Counter\nRequirement: persist counters and restore them after restart. Current saveCounter is a stub. Do not change the public signature.\n",
);
await git(["add", "."]);
await git(["commit", "-m", "fixture"]);
const task = {
  goal: "Implement persistent counter",
  current: "saveCounter stub exists; persistence is WIP",
  next: "Add a persistence implementation and a restart recovery test",
  workInProgress: ["counter.ts persistence and restart test"],
};
const checkpoint = await operate({
  protocolVersion: 1,
  requestId: "cp",
  operation: "checkpoint",
  projectPath: root,
  task,
});
const handoff = await operate({
  protocolVersion: 1,
  requestId: "h",
  operation: "handoff",
  projectPath: root,
});
const restore = await operate({
  protocolVersion: 1,
  requestId: "r",
  operation: "restore",
  projectPath: root,
});
const policy = await readBounded(
  toolRoot,
  "references/state-reconstruction.md",
  65536,
);
const before = await readFile(path.join(root, "counter.ts"));
const analysis = await analyze({
  host: "codex",
  projectPath: root,
  snapshot: restore.snapshot,
  rules: policy,
  authorized: true,
  onPhase: (message) => process.stderr.write(message + "\n"),
});
const p = await prepare({
  protocolVersion: 1,
  requestId: "conflict",
  operation: "handoff",
  projectPath: root,
  task,
});
p.snapshot.validations = [
  {
    id: "historical-restart",
    argv: ["node", "--test", "counter.test.js"],
    cwd: ".",
    status: "Passed",
    source: "imported",
    baselineFingerprint: p.snapshot.baseline.fingerprint,
    exitCode: 0,
    recordedAt: p.snapshot.recordedAt,
    scope: ["counter.ts"],
    limitation: "Saving and reloading a counter after restart",
  },
];
p.snapshot.claims = [
  {
    id: "done",
    text: "Persistence and restart recovery are fully complete",
    source: "legacy",
    implementation: "verified",
    evidenceIds: [
      p.snapshot.baseline.files.find((f) => f.path === "counter.ts")!.id,
    ],
    validationIds: ["historical-restart"],
    uncertainty: null,
  },
];
await publish(p);
const conflictRestore = await operate({
  protocolVersion: 1,
  requestId: "cr",
  operation: "restore",
  projectPath: root,
});
const conflictAnalysis = await analyze({
  host: "codex",
  projectPath: root,
  snapshot: conflictRestore.snapshot,
  rules: policy,
  authorized: true,
});
const unchanged = (await readFile(path.join(root, "counter.ts"))).equals(
  before,
);
const result = {
  fixture: root,
  checkpoint: checkpoint.operationOutcome,
  handoff: handoff.operationOutcome,
  restore: restore.operationOutcome,
  analysis,
  conflictMachine: conflictRestore.findings,
  conflictAnalysis,
  sourceUnchanged: unchanged,
  executedAt: new Date().toISOString(),
};
const resultDir = path.join(toolRoot, "work/acceptance-results");
await mkdir(resultDir, { recursive: true });
await writeFile(
  path.join(resultDir, `${path.basename(root)}.json`),
  JSON.stringify(result, null, 2),
);
process.stdout.write(
  JSON.stringify(
    {
      fixture: root,
      checkpoint: checkpoint.operationOutcome,
      handoff: handoff.operationOutcome,
      analysisStatus: analysis.status,
      analysis: analysis.candidate,
      analysisFindings: analysis.findings,
      conflictStatus: conflictAnalysis.status,
      conflict: conflictAnalysis.candidate,
      conflictFindings: conflictAnalysis.findings,
      sourceUnchanged: unchanged,
    },
    null,
    2,
  ) + "\n",
);
