import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { collect } from "../packages/engine/src/collect.js";
import { digest, safePath } from "../packages/engine/src/safety.js";
import {
  validateSnapshot,
  type Snapshot,
} from "../packages/protocol/src/index.js";
const exec = promisify(execFile),
  dirs: string[] = [];
async function temp() {
  const p = await mkdtemp(path.join(tmpdir(), "pcm-"));
  dirs.push(p);
  return p;
}
async function git(p: string, ...args: string[]) {
  return (
    await exec("git", args, {
      cwd: p,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    })
  ).stdout.trim();
}
async function repo() {
  const p = await temp();
  await git(p, "init");
  await git(p, "config", "user.name", "Fixture");
  await git(p, "config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(p, "app.ts"), 'export const task = "WIP";\n');
  await git(p, "add", ".");
  await git(p, "commit", "-m", "fixture");
  return p;
}
afterEach(async () => {
  for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true });
});
export function snapshot(baseline: Snapshot["baseline"]): Snapshot {
  return {
    schema_version: 1,
    id: "fixture",
    parentId: null,
    toolVersion: "test",
    purpose: "handoff",
    recordedAt: new Date().toISOString(),
    baseline,
    task: {
      goal: "finish task",
      current: "implementation is WIP",
      next: "implement and validate task",
      workInProgress: ["app.ts"],
    },
    claims: [],
    validations: [],
    constraints: [],
    gaps: [],
  };
}
describe("M1 deterministic read-only evidence", () => {
  it("captures HEAD, index, working tree and untracked Unicode paths independently", async () => {
    const p = await repo();
    const a = await collect(p);
    const index = await readFile(path.join(p, ".git/index"));
    expect(a.baseline.workingTree).toBe("clean");
    expect(a.baseline.files[0]?.head).not.toBeNull();
    await writeFile(path.join(p, "app.ts"), "staged");
    await git(p, "add", "app.ts");
    await writeFile(path.join(p, "app.ts"), "unstaged");
    await writeFile(path.join(p, "中文 空格.ts"), "untracked");
    const b = await collect(p),
      c = await collect(p);
    expect(b.baseline.head).toBe(a.baseline.head);
    expect(b.baseline.fingerprint).not.toBe(a.baseline.fingerprint);
    expect(b.baseline.fingerprint).toBe(c.baseline.fingerprint);
    expect(
      b.baseline.files.find((f) => f.path === "app.ts")?.index[0]?.oid,
    ).not.toBe(a.baseline.files[0]?.index[0]?.oid);
    expect(
      b.baseline.files.find((f) => f.path === "中文 空格.ts")?.sha256,
    ).toBe(digest("untracked"));
    expect(b.baseline.workingTree).toBe("dirty");
    const before = await readFile(path.join(p, ".git/index"));
    await collect(p);
    expect(await readFile(path.join(p, ".git/index"))).toEqual(before);
    expect(index).not.toEqual(before);
  });
  it("does not call missing files, deleted files or exclusions clean", async () => {
    const p = await repo();
    await rm(path.join(p, "app.ts"));
    const a = await collect(p);
    expect(a.baseline.files[0]?.state).toBe("missing");
    expect(a.baseline.coverage).toBe("incomplete");
    const b = await collect(p, { scope: ["missing"] });
    expect(b.baseline.workingTree).toBe("unknown");
    expect(b.baseline.files[0]?.reason).toBeTruthy();
    await writeFile(path.join(p, ".env"), "SECRET=never exported");
    const c = await collect(p);
    expect(c.baseline.files.find((f) => f.path === ".env")?.state).toBe(
      "excluded",
    );
    expect(JSON.stringify(c)).not.toContain("never exported");
  });
  it("identifies worktrees separately and respects literal scoped paths", async () => {
    const p = await repo(),
      w = path.join(await temp(), "worktree");
    await git(p, "worktree", "add", "--detach", w);
    const a = await collect(p),
      b = await collect(w);
    expect(a.baseline.repositoryId).toBe(b.baseline.repositoryId);
    expect(a.baseline.worktreeId).not.toBe(b.baseline.worktreeId);
    await mkdir(path.join(p, "module[1]"));
    await writeFile(path.join(p, "module[1]/x.ts"), "x");
    const c = await collect(p, { scope: ["module[1]"] });
    expect(c.baseline.files.map((f) => f.path)).toEqual(["module[1]/x.ts"]);
  });
  it("handles unborn, non-Git, limits, traversal and cancellation explicitly", async () => {
    const p = await temp();
    await writeFile(path.join(p, "a"), "a");
    expect((await collect(p)).baseline.gitState).toBe("not-git");
    await git(p, "init");
    expect((await collect(p)).baseline.gitState).toBe("unborn");
    await writeFile(path.join(p, "b"), "b");
    expect((await collect(p, { maxFiles: 1 })).baseline.coverage).toBe(
      "incomplete",
    );
    await expect(collect(p, { scope: ["../outside"] })).rejects.toThrow();
    await expect(collect(p, { signal: AbortSignal.abort() })).rejects.toThrow(
      "取消",
    );
  });
  it("does not follow a directory junction or symbolic link", async () => {
    const p = await repo(),
      outside = await temp();
    await writeFile(path.join(outside, "secret"), "do not read");
    await symlink(
      outside,
      path.join(p, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(collect(p, { scope: ["linked"] })).rejects.toThrow();
  });
  it("rejects future schemas and ungrounded completion claims", async () => {
    const s = snapshot((await collect(await repo())).baseline);
    expect(validateSnapshot(s).valid).toBe(true);
    expect(validateSnapshot({ ...s, schema_version: 2 }).valid).toBe(false);
    s.claims.push({
      id: "done",
      text: "completed",
      source: "agent",
      implementation: "verified",
      evidenceIds: [],
      validationIds: [],
      uncertainty: null,
    });
    expect(validateSnapshot(s).errors.join()).toContain("lacks evidence");
    s.claims[0]!.evidenceIds = ["nonexistent"];
    expect(validateSnapshot(s).errors.join()).toContain("Dangling");
  });
});

it("accepts an explicit root alias while rejecting links inside its boundary", async () => {
  const parent = await temp();
  const root = path.join(parent, "project"), alias = path.join(parent, "alias");
  await mkdir(root);
  await writeFile(path.join(root, "app.ts"), "synthetic");
  await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
  expect(await readFile(await safePath(alias, "app.ts"), "utf8")).toBe("synthetic");
  await symlink(parent, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  await expect(safePath(alias, "escape")).rejects.toMatchObject({code:"SYMLINK"});
  await expect(safePath(alias, "../app.ts")).rejects.toMatchObject({code:"UNSAFE_PATH"});
});
