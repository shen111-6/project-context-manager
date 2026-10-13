import { it, expect, afterEach } from "vitest";
import { build } from "esbuild";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  unlink,
  chmod,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  operate,
  prepare,
  publish,
  SnapshotStore,
} from "../packages/engine/src/index.js";
const roots: string[] = [];
const request = (root: string) => ({
  protocolVersion: 1 as const,
  requestId: "fault",
  projectPath: root,
  operation: "handoff" as const,
});
const task = (current: string) => ({
  goal: "Preserve synthetic work",
  current,
  next: "Validate continuation",
  workInProgress: ["app.ts"],
});
async function fixture() {
  const parent = await mkdtemp(path.join(tmpdir(), "pcm-fault-"));
  roots.push(parent);
  const root = path.join(parent, "project");
  await mkdir(root);
  await writeFile(path.join(root, "app.ts"), "export const state = 'WIP';\n");
  const initial = await operate({ ...request(root), task: task("initial") });
  expect(initial.operationOutcome).toBe("success");
  return { parent, root, initial };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
for (const boundary of ["before", "after"] as const) {
  it(`recovers last committed index when writer exits ${boundary} atomic publication and preserves old records`, async () => {
    const { parent, root, initial } = await fixture();
    const indexPath = path.join(root, "docs/project-context/pcm/index.json");
    const beforeIndex = await readFile(indexPath);
    const originalRecord = await readFile(initial.artifacts[0]!);
    const originalSource = await readFile(path.join(root, "app.ts"));
    const bundled = path.join(parent, "engine.cjs");
    await build({
      entryPoints: [path.resolve("packages/engine/src/index.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: bundled,
    });
    const child = path.join(parent, "crash.mjs");
    // Injection is confined to a separate process. Real snapshot and index I/O occurs.
    await writeFile(
      child,
      `import fs from 'node:fs';\nimport {syncBuiltinESMExports,createRequire} from 'node:module';\nimport path from 'node:path';\nconst original=fs.promises.rename;\nfs.promises.rename=async (...args)=>{if(path.resolve(args[1])===path.resolve(${JSON.stringify(indexPath)})){${boundary === "after" ? "await original(...args);" : ""}process.exit(77);}return original(...args);};\nsyncBuiltinESMExports();\nconst require=createRequire(import.meta.url);\nconst {operate}=require(${JSON.stringify(bundled)});\nawait operate(${JSON.stringify({ ...request(root), task: task("candidate") })});\nthrow new Error('injection boundary was not reached');\n`,
    );
    const terminated = spawnSync(process.execPath, [child], {
      encoding: "utf8",
      timeout: 20000,
    });
    expect(terminated.error).toBeUndefined();
    expect(terminated.status, terminated.stderr).toBe(77);
    expect(await readFile(initial.artifacts[0]!)).toEqual(originalRecord);
    expect(await readFile(path.join(root, "app.ts"))).toEqual(originalSource);
    const store = new SnapshotStore(root);
    const index = await store.index();
    expect(index.records).toHaveLength(boundary === "before" ? 1 : 2);
    expect((await store.read()).task.current).toBe(
      boundary === "before" ? "initial" : "candidate",
    );
    if (boundary === "before")
      expect(await readFile(indexPath)).toEqual(beforeIndex);
    const restored = await operate({ ...request(root), operation: "restore" });
    expect(restored.operationOutcome).toBe("partial");
    expect(restored.snapshot?.task.current).toBe(
      boundary === "before" ? "initial" : "candidate",
    );
    expect(await readFile(indexPath)).toEqual(
      Buffer.from(JSON.stringify(index, null, 2) + "\n"),
    );
    const pending = await prepare({ ...request(root), task: task("retry") });
    await expect(publish(pending)).rejects.toMatchObject({
      code: "WRITE_CONFLICT",
    });
    // The child has authoritatively exited; only remove its lock in this fixture.
    await unlink(path.join(root, store.relative, "write.lock"));
    const artifacts = await publish(
      await prepare({ ...request(root), task: task("retry") }),
    );
    expect(artifacts).toHaveLength(2);
    expect((await store.read()).task.current).toBe("retry");
    expect((await store.index()).records).toHaveLength(
      boundary === "before" ? 2 : 3,
    );
    expect(await readFile(initial.artifacts[0]!)).toEqual(originalRecord);
    expect(await readFile(path.join(root, "app.ts"))).toEqual(originalSource);
    if (boundary === "before")
      expect(
        (await readdir(path.join(root, store.relative))).some((name) =>
          /^index-.+\.tmp$/.test(name),
        ),
      ).toBe(true);
  });
}
it.skipIf(process.platform !== "win32" && process.getuid?.() === 0)(
  "write-protected storage rejects publication without certifying success, then allows a fresh retry",
  async () => {
    const { root, initial } = await fixture();
    const indexPath = path.join(root, "docs/project-context/pcm/index.json");
    const before = await readFile(indexPath);
    const oldRecord = await readFile(initial.artifacts[0]!);
    // Windows readonly file attributes reject replacement; POSIX requires directory write denial.
    const protectedPath =
      process.platform === "win32" ? indexPath : path.dirname(indexPath);
    await chmod(protectedPath, process.platform === "win32" ? 0o444 : 0o555);
    try {
      const rejected = await operate({
        ...request(root),
        task: task("blocked write"),
      });
      expect(rejected.operationOutcome).toBe("failed");
      expect(rejected.artifacts).toEqual([]);
      expect(await readFile(indexPath)).toEqual(before);
      expect((await new SnapshotStore(root).read()).task.current).toBe(
        "initial",
      );
      expect(await readFile(initial.artifacts[0]!)).toEqual(oldRecord);
    } finally {
      await chmod(protectedPath, process.platform === "win32" ? 0o600 : 0o700);
    }
    const retried = await operate({
      ...request(root),
      task: task("permission restored"),
    });
    expect(retried.operationOutcome).toBe("success");
    expect((await new SnapshotStore(root).read()).task.current).toBe(
      "permission restored",
    );
    expect(await readFile(initial.artifacts[0]!)).toEqual(oldRecord);
  },
);

it("cancellation during directory discovery stops before descending into another entry", async () => {
  const { parent, root } = await fixture();
  await mkdir(path.join(root, "module"));
  await writeFile(path.join(root, "module", "another.ts"), "synthetic");
  const bundled = path.join(parent, "cancel-engine.cjs");
  await build({
    entryPoints: [path.resolve("packages/engine/src/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundled,
  });
  const child = path.join(parent, "cancel.mjs");
  await writeFile(
    child,
    `import fs from 'node:fs';\nimport {syncBuiltinESMExports,createRequire} from 'node:module';\nimport path from 'node:path';\nconst controller=new AbortController();let afterAbortStats=0;let discoveryReached=false;\nconst originalRead=fs.promises.readdir,originalStat=fs.promises.lstat;\nfs.promises.readdir=async (...args)=>{const result=await originalRead(...args);if(path.resolve(args[0])===path.resolve(${JSON.stringify(root)})){discoveryReached=true;controller.abort();}return result;};\nfs.promises.lstat=async (...args)=>{if(controller.signal.aborted)afterAbortStats++;return originalStat(...args);};\nsyncBuiltinESMExports();\nconst require=createRequire(import.meta.url);const {collect}=require(${JSON.stringify(bundled)});\ntry {await collect(${JSON.stringify(root)},{signal:controller.signal});throw new Error('cancellation was ignored');}catch(error){if(error.code!=='CANCELLED')throw error;console.log(JSON.stringify({discoveryReached,afterAbortStats,code:error.code}));}\n`,
  );
  const result = spawnSync(process.execPath, [child], {
    encoding: "utf8",
    timeout: 20000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    discoveryReached: true,
    afterAbortStats: 0,
    code: "CANCELLED",
  });
});
