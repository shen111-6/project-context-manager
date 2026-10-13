import { it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  collect,
  prepare,
  publish,
  SnapshotStore,
  runValidation,
  readEvidence,
  checkPublishedBaseline,
  operate,
} from "../packages/engine/src/index.js";
import {
  isRelativePath,
  validateSnapshot,
} from "../packages/protocol/src/index.js";
const exec = promisify(execFile),
  roots: string[] = [];
async function fixture(git = true) {
  const p = await mkdtemp(path.join(tmpdir(), "pcm-m5-"));
  roots.push(p);
  await writeFile(path.join(p, "app.txt"), "WIP");
  if (git) {
    for (const a of [
      ["init"],
      ["config", "user.name", "Fixture"],
      ["config", "user.email", "fixture@example.invalid"],
      ["add", "."],
      ["commit", "-m", "fixture"],
    ])
      await exec("git", a, {
        cwd: p,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });
  }
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0))
    await rm(p, { recursive: true, force: true });
});
const request = (p: string) => ({
  protocolVersion: 1 as const,
  requestId: "m5",
  projectPath: p,
  operation: "checkpoint" as const,
});
it("reports bounded scope, excluded modules and non-Git dependency omissions", async () => {
  const p = await fixture();
  await mkdir(path.join(p, "module"));
  await writeFile(path.join(p, "module", "a.txt"), "abcdef");
  const small = await collect(p, { scope: ["module"], maxFileBytes: 2 });
  expect(small.baseline.coverage).toBe("incomplete");
  expect(small.baseline.files.every((f) => f.path.startsWith("module/"))).toBe(
    true,
  );
  const omitted = await collect(p, { scope: ["module"], exclude: ["module"] });
  expect(omitted.findings.some((f) => f.code === "SCOPE_EXCLUDED")).toBe(true);
  expect(omitted.baseline.workingTree).not.toBe("clean");
  await expect(collect(p, { maxTotalBytes: 0 })).rejects.toThrow();
  const nongit = await fixture(false);
  await mkdir(path.join(nongit, "node_modules"));
  await writeFile(
    path.join(nongit, "node_modules", "secret.txt"),
    "do not include",
  );
  const n = await collect(nongit);
  expect(n.baseline.exclusions).toContain("node_modules");
  expect(n.baseline.files.map((f) => f.path)).toEqual(["app.txt"]);
});
it("parallel writers expose exactly one immutable winner; old locks remain untouched", async () => {
  const p = await fixture(),
    a = await prepare(request(p)),
    b = await prepare(request(p));
  const results = await Promise.allSettled([publish(a), publish(b)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const store = new SnapshotStore(p),
    idx = await store.index();
  expect(idx.records).toHaveLength(1);
  expect([a.snapshot.id, b.snapshot.id]).toContain((await store.read()).id);
  const lock = path.join(p, store.relative, "write.lock");
  await writeFile(lock, "interrupted writer");
  const c = await prepare(request(p));
  await expect(publish(c)).rejects.toThrow("锁");
  expect(await readFile(lock, "utf8")).toBe("interrupted writer");
  expect((await store.index()).revision).toBe(idx.revision);
});
it("rejects unsafe portable paths and unexecuted validation claims", async () => {
  for (const p of [
    "../x",
    "C:/x",
    "a:stream",
    "NUL.txt",
    "dir/CON",
    "a.",
    "a ",
    "dir\\x",
    "x\n",
  ])
    expect(isRelativePath(p)).toBe(false);
  expect(isRelativePath("模块/文件 name.ts")).toBe(true);
  const p = await fixture(),
    prepared = await prepare(request(p));
  prepared.snapshot.validations = [
    {
      id: "v",
      argv: ["unused"],
      cwd: ".",
      status: "Not run",
      source: "imported",
      baselineFingerprint: prepared.snapshot.baseline.fingerprint,
      exitCode: 0,
      recordedAt: prepared.snapshot.recordedAt,
      scope: ["."],
      limitation: "not executed",
    },
  ];
  expect(validateSnapshot(prepared.snapshot).valid).toBe(false);
});
it("validation distinguishes real outcomes and baseline changes without inherited authority", async () => {
  const p = await fixture(),
    base = {
      projectPath: p,
      scope: ["."],
      authorization: "current-cli-user" as const,
      allowProjectSideEffects: true,
    };
  await expect(
    runValidation({
      ...base,
      allowProjectSideEffects: false,
      argv: [process.execPath, "-e", "process.exit(0)"],
    }),
  ).rejects.toThrow("授权");
  const pass = await runValidation({
    ...base,
    argv: [process.execPath, "-e", 'console.log("safe result")'],
  });
  expect(pass.record.status).toBe("Passed");
  expect(pass.currentApplicable).toBe(true);
  const fail = await runValidation({
    ...base,
    argv: [process.execPath, "-e", "process.exit(7)"],
  });
  expect(fail.record.status).toBe("Failed");
  expect(fail.record.exitCode).toBe(7);
  const blocked = await runValidation({
    ...base,
    argv: [path.join(p, "absent-runner")],
  });
  expect(blocked.record.status).toBe("Blocked");
  expect(blocked.record.exitCode).toBeNull();
  const timeout = await runValidation({
    ...base,
    argv: [process.execPath, "-e", "setTimeout(()=>{},10000)"],
    timeoutMs: 100,
  });
  expect(timeout.record.status).toBe("Incomplete");
  const changed = await runValidation({
    ...base,
    argv: [
      process.execPath,
      "-e",
      'require("fs").writeFileSync("app.txt","changed")',
    ],
  });
  expect(changed.record.status).toBe("Incomplete");
  expect(changed.currentApplicable).toBe(false);
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    runValidation({
      ...base,
      signal: aborted.signal,
      argv: [process.execPath, "-e", 'throw Error("must not start")'],
    }),
  ).rejects.toThrow();
});
it("non-Git evidence remains useful and redacts known secrets", async () => {
  const p = await fixture(false);
  await writeFile(path.join(p, "app.txt"), "password=privateValue");
  const e = await readEvidence(p, "app.txt");
  expect(e.diff.working).toBeNull();
  expect(e.text).not.toContain("privateValue");
  expect(e.redacted).toBe(true);
});
it("reports post-publication drift without changing immutable snapshot data", async () => {
  const p = await fixture(),
    prepared = await prepare(request(p)),
    artifacts = await publish(prepared);
  const original = await readFile(artifacts[0]!, "utf8");
  await writeFile(path.join(p, "app.txt"), "changed after publication");
  const findings = await checkPublishedBaseline(prepared);
  expect(findings[0]?.code).toBe("PUBLISHED_BASELINE_CHANGED");
  expect(
    prepared.snapshot.gaps.some((g) => g.code === "PUBLISHED_BASELINE_CHANGED"),
  ).toBe(false);
  expect(await readFile(artifacts[0]!, "utf8")).toBe(original);
  await rm(p, { recursive: true, force: true });
  expect((await checkPublishedBaseline(prepared))[0]?.code).toBe(
    "PUBLISHED_RECHECK_FAILED",
  );
});
it("captures real merge stages and restores a scoped subproject without adding prefixes twice", async () => {
  const p = await fixture(),
    env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    g = (...args: string[]) => exec("git", args, { cwd: p, env });
  await mkdir(path.join(p, "module"));
  await writeFile(path.join(p, "module", "feature.txt"), "base\n");
  await g("add", ".");
  await g("commit", "-m", "module");
  await g("branch", "other");
  await g("checkout", "-b", "left");
  await writeFile(path.join(p, "module", "feature.txt"), "left\n");
  await g("commit", "-am", "left");
  await g("checkout", "other");
  await writeFile(path.join(p, "module", "feature.txt"), "right\n");
  await g("commit", "-am", "right");
  await expect(g("merge", "left")).rejects.toThrow();
  const c = await collect(p, { scope: ["module"] });
  expect(c.baseline.files[0]!.index.map((x) => x.stage)).toEqual([1, 2, 3]);
  expect(c.baseline.workingTree).toBe("dirty");
  const child = path.join(p, "module"),
    cp = await operate({
      ...request(child),
      task: {
        goal: "resolve conflict",
        current: "merge unresolved",
        next: "inspect both implementations before resolving",
        workInProgress: ["feature.txt"],
      },
    });
  expect(cp.operationOutcome).toBe("success");
  const restored = await operate({ ...request(child), operation: "restore" });
  expect(restored.baseline?.scope).toEqual(["module"]);
  expect(restored.nextAction).toContain("inspect both");
  expect(restored.findings.some((f) => f.code === "FILE_DRIFT")).toBe(false);
});
it("evidence diff does not run repository-configured external diff or textconv", async () => {
  const p = await fixture(),
    env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    };
  await writeFile(path.join(p, ".gitattributes"), "app.txt diff=pcm\n");
  await writeFile(
    path.join(p, "runner.cjs"),
    'require("fs").writeFileSync("executed.txt","unauthorized")',
  );
  for (const key of ["diff.external", "diff.pcm.command", "diff.pcm.textconv"])
    await exec("git", ["config", key, "node runner.cjs"], { cwd: p, env });
  await writeFile(path.join(p, "app.txt"), "changed");
  const e = await readEvidence(p, "app.txt");
  expect(e.diff.working).toContain("changed");
  await expect(readFile(path.join(p, "executed.txt"))).rejects.toThrow();
});
