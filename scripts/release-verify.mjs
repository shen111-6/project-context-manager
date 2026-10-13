import assert from "node:assert/strict";
import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  lstat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.kind, "local-alpha-delivery");
const expected = new Set([
  "bin/pcm.cjs",
  "verify.mjs",
  "README.md",
  "THIRD_PARTY_NOTICES.txt",
  "schema/snapshot-v1.json",
  "docs/overview.md",
  "evidence/offline-demo-2026-10-13.json",
  `extensions/project-context-manager-${manifest.version}.vsix`,
]);
assert.ok(Array.isArray(manifest.files));
assert.equal(manifest.files.length, expected.size);
const seen = new Set();
for (const entry of manifest.files) {
  assert.ok(
    typeof entry.path === "string" && /^[a-zA-Z0-9._/-]+$/.test(entry.path),
  );
  assert.ok(expected.has(entry.path), "unexpected manifest entry");
  const absolute = path.resolve(root, entry.path);
  assert.ok(
    absolute.startsWith(root + path.sep),
    "manifest path outside package",
  );
  assert.ok(!seen.has(entry.path), "duplicate manifest file");
  seen.add(entry.path);
  assert.ok(
    (await lstat(absolute)).isFile(),
    "manifest entry must be a regular file",
  );
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    entry.sha256,
    entry.path,
  );
}
for (const required of expected)
  assert.ok(seen.has(required), `missing ${required}`);
const cli = path.join(root, "bin/pcm.cjs");
const temporaryRoot = path.resolve(tmpdir());
const fixtureRoot = await mkdtemp(
  path.join(temporaryRoot, "pcm-delivery-check-"),
);
const project = path.join(fixtureRoot, "project");
const observations = [];
function execute(operation, args = []) {
  const result = spawnSync(
    process.execPath,
    [cli, operation, project, ...args],
    { cwd: fixtureRoot, encoding: "utf8", timeout: 30000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  const output = JSON.parse(result.stdout);
  observations.push({
    operation,
    exitCode: result.status,
    outcome: output.operationOutcome,
    assessment: output.evidenceAssessment,
    findings: output.findings?.map((f) => f.code) ?? [],
  });
  return { code: result.status, output };
}
try {
  await mkdir(project);
  await writeFile(
    path.join(project, "app.ts"),
    "export const state = 'synthetic WIP';\n",
  );
  const missing = execute("restore");
  assert.equal(missing.code, 1);
  assert.ok(missing.output.findings.some((f) => f.code === "NO_RECORD"));
  const task = {
    goal: "Finish the synthetic feature",
    current: "WIP",
    next: "Implement and validate",
    workInProgress: ["app.ts"],
  };
  const taskFile = path.join(fixtureRoot, "task.json");
  await writeFile(taskFile, JSON.stringify(task));
  const handoff = execute("handoff", ["--task", taskFile]);
  assert.equal(handoff.code, 0);
  assert.deepEqual(handoff.output.snapshot.task, task);
  const files = [
    path.join(project, "app.ts"),
    path.join(project, "docs/project-context/pcm/index.json"),
    ...handoff.output.artifacts,
  ];
  const before = await Promise.all(files.map((file) => readFile(file)));
  const restore = execute("restore");
  assert.equal(restore.code, 2);
  assert.deepEqual(restore.output.snapshot.task, task);
  const after = await Promise.all(files.map((file) => readFile(file)));
  assert.deepEqual(after, before, "restore modified fixture source or records");
  await writeFile(
    path.join(project, "app.ts"),
    "export const state = 'changed';\n",
  );
  const drift = execute("verify");
  assert.equal(drift.code, 2);
  assert.equal(drift.output.evidenceAssessment, "Drift Detected");
  assert.ok(drift.output.findings.some((f) => f.code === "FILE_DRIFT"));
  console.log(
    JSON.stringify(
      {
        status: "Passed",
        version: manifest.version,
        platform: process.platform,
        node: process.version,
        checksummedFiles: manifest.files.length,
        cliScenarios: observations,
        limitations: [
          "local synthetic fixture; no Agent or GUI invoked",
          "manifest proves consistency, not publisher authenticity",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  const resolved = path.resolve(fixtureRoot);
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("pcm-delivery-check-")
  )
    throw new Error("Unsafe temporary cleanup path");
  await rm(resolved, { recursive: true, force: true });
}
